/**
 * cicloDecision.ts — EL CICLO DE DECISIÓN CON TRAZAS (v1.85.0 · FASE 6, punto 2)
 * ==============================================================================
 * QUÉ ES: el camino completo de una frase a una acción, escrito como dato.
 * V8 §6.2 promete «de una frase a la acción, con la traza visible». Hasta ahora
 * ese camino existía pero no dejaba rastro: `pensarConsejo()` devolvía el
 * veredicto y el veredicto se iba al chat, donde se leía una vez y se olvidaba.
 * Preguntar después «¿por qué hiciste eso?» era imposible porque el motor no
 * guardó jamás CÓMO llegó ahí.
 *
 * QUÉ GUARDA CADA TRAZA (una etapa por salto del ciclo):
 *   1. entrada      — la frase, tal como llegó
 *   2. clasificación— qué entendió el reflejo (accion / orden.tipo / confianza)
 *   3. voto         — qué especialista la reclama y con qué razón (V8 §6.1)
 *   4. entidad      — qué entidad del catálogo de 51 la ejecuta
 *   5. ejecucion    — el resultado real, o el MOTIVO de no ejecutar (dormida,
 *                     especialista sin orden, herramienta inexistente)
 *   6. organo       — qué entrada del órgano de memoria (FASE 2) pesó en la
 *                     decisión, con su archivo real
 * Cada etapa lleva `fuente`: la línea del código donde vive la regla que decidió,
 * medida en disco por `citaFuente.localizarLinea`. Si la línea no aparece, la
 * fuente es `null` y la traza lo dice — nunca se rellena con una línea supuesta.
 *
 * DÓNDE VIVE: un anillo en memoria (últimas N, para el panel) y un JSONL en
 * `<raizDatos>/cerebro/trazas/decisiones.jsonl`, junto al índice del órgano:
 * la traza es memoria del motor, no log de depuración. Aditivo y nunca
 * destructivo: si el disco falla, la traza igual vive en memoria y se informa.
 *
 * PUREZA PARCIAL: decide con `pensarConsejo` (puro) y escribe con el órgano
 * (disco). No llama a la red ni levanta procesos.
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ENTIDADES, entidadPorId, ejecutarEntidad, pensarConsejo } from "./reflejo/consejo";
import { REPARTO_VOTOS, veredictoVoto } from "./votacionConsejo";
import { TABLAS } from "./reflejo";
import type { Tablas } from "./cerebroReflejo";
import { enrutar } from "./cerebroOrgano";
import { localizarLinea, type Cita } from "./citaFuente";
import { POLITICA_TRAZAS, podarSiHaceFalta } from "./rotacionTrazas";

// ─── Tipos de la traza ───────────────────────────────────────────────────────

export type EtapaDecision =
  | "entrada"
  | "clasificacion"
  | "voto"
  | "entidad"
  | "ejecucion"
  | "organo"
  | "resultado";

export interface EtapaTrazada {
  etapa: EtapaDecision;
  /** Qué pasó, en una línea legible (cara humana del salto). */
  que: string;
  /** La regla que lo decidió, con ruta y línea reales. `null` = sin fuente. */
  fuente: Cita | null;
  /** Si la fuente no se encontró: por qué. Nunca se omite en silencio. */
  aviso?: string;
  datos?: Record<string, unknown>;
}

export interface TrazaDecision {
  /** Id estable: `t<secuencia>-<ts>`. Es lo que responde `GET /api/explicar`. */
  id: string;
  secuencia: number;
  ts: number;
  frase: string;
  accion: string;
  confianza: number;
  /** Especialista que votó (12 del consejo). */
  especialista: string;
  /** Entidad que ejecutó (herramienta curada o espejo), si hubo ejecución. */
  entidad: string | null;
  porVoto: boolean;
  razonVoto: string;
  ok: boolean;
  motivo?: string;
  etapas: EtapaTrazada[];
  ms: number;
  /** Modo de tablas usado (lite/max): la misma frase puede clasificar distinto. */
  modo: string;
}

export interface OpcionesCiclo {
  /** Raíz de datos del motor (ahí vive `cerebro/trazas/`). */
  raizDatos: string;
  /** Raíz del código fuente para localizar las líneas citadas. */
  raizFuente: string;
  /** Tablas del reflejo. Por defecto `TABLAS.lite` (la del chat). */
  tablas?: Tablas;
  /** Datos para la herramienta (si la frase trae argumento explícito). */
  datos?: Record<string, unknown>;
  /** Herramienta forzada (el llamante ya sabe quién ejecuta). */
  entidadForzada?: string;
  /** Ejecutar de verdad o solo clasificar (default: ejecutar). */
  ejecutar?: boolean;
  /** Cuántas entradas del órgano se citan como contexto (default 3). */
  citasOrgano?: number;
  ahora?: () => number;
}

// ─── Las fuentes del ciclo: dónde vive cada regla ───────────────────────────
// Se resuelven contra el disco en el primer uso. Si el día de mañana un refactor
// mueve una línea, la cita sigue apuntando al lugar nuevo; si el símbolo
// desaparece, la traza declara «sin fuente» en vez de mentir.
const FUENTES: Record<string, { archivo: string; patron: RegExp }> = {
  clasificar: { archivo: "src/engine/cerebroReflejo.ts", patron: /export function pensar\(/ },
  voto: { archivo: "src/engine/votacionConsejo.ts", patron: /export const REPARTO_VOTOS/ },
  catalogo: { archivo: "src/engine/reflejo/consejo.ts", patron: /export const ESPECIALISTAS/ },
  despertar: { archivo: "src/engine/reflejo/consejo.ts", patron: /export const ACTIVAS_POR_DEFECTO/ },
  ejecutar: { archivo: "src/engine/reflejo/consejo.ts", patron: /export function ejecutarEntidad\(/ },
  organo: { archivo: "src/engine/cerebroOrgano.ts", patron: /export function enrutar\(/ },
};

const MEMORIA_FUENTE = new Map<string, { cita: Cita | null; aviso?: string }>();

// La cache va POR RAÍZ: dos árboles distintos (el de desarrollo y el empaquetado)
// no pueden compartir la línea que cada uno midió en su propio disco.
function fuenteDe(raizFuente: string, clave: string): { cita: Cita | null; aviso?: string } {
  const llave = `${raizFuente}\u0000${clave}`;
  const guardada = MEMORIA_FUENTE.get(llave);
  if (guardada) return guardada;
  const f = FUENTES[clave];
  let res: { cita: Cita | null; aviso?: string };
  if (!f) {
    res = { cita: null, aviso: `no hay fuente declarada para la etapa «${clave}»` };
  } else {
    const cita = localizarLinea(raizFuente, f.archivo, f.patron);
    res = cita
      ? { cita }
      : { cita: null, aviso: `el patrón de «${clave}» no aparece en ${f.archivo}: la regla cambió de lugar y hay que actualizar FUENTES` };
  }
  MEMORIA_FUENTE.set(llave, res);
  return res;
}

// ─── El anillo y el disco ────────────────────────────────────────────────────

const ANILLO_POR_DEFECTO = 200;
let ANILLO: TrazaDecision[] = [];
let SECUENCIA = 0;

function carpetaTrazas(raizDatos: string): string {
  return path.join(raizDatos, "cerebro", "trazas");
}
function archivoTrazas(raizDatos: string): string {
  return path.join(carpetaTrazas(raizDatos), "decisiones.jsonl");
}

function persistir(raizDatos: string, traza: TrazaDecision): string | null {
  try {
    const dir = carpetaTrazas(raizDatos);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // v1.87.0 · el archivo de trazas no tenía techo y `cargarTrazas` lo lee
    // ENTERO. Si pasó de 8 MiB se rota antes de escribir; best-effort, nunca
    // tumba el turno (la traza vive además en el anillo de memoria).
    podarSiHaceFalta(dir, "decisiones.jsonl", POLITICA_TRAZAS, Date.now());
    appendFileSync(archivoTrazas(raizDatos), JSON.stringify(traza) + "\n", "utf8");
    return archivoTrazas(raizDatos);
  } catch (e: any) {
    // La traza no puede tumbar el turno: vive en memoria y se declara el fallo.
    return null;
  }
}

/** Lee las últimas N trazas del disco (para arrancar el anillo tras un reinicio). */
export function cargarTrazas(raizDatos: string, max = ANILLO_POR_DEFECTO): { trazas: TrazaDecision[]; archivo: string; aviso?: string } {
  const archivo = archivoTrazas(raizDatos);
  if (!existsSync(archivo)) return { trazas: [], archivo, aviso: "todavía no hay trazas en disco" };
  try {
    const bruto = readFileSync(archivo, "utf8").trim();
    if (!bruto) return { trazas: [], archivo, aviso: "el archivo de trazas está vacío" };
    const todas = bruto.split(/\r?\n/).map((l) => {
      try { return JSON.parse(l) as TrazaDecision; } catch { return null; }
    }).filter((t): t is TrazaDecision => !!t && !!t.id);
    const ultimas = todas.slice(-Math.max(1, max));
    if (ultimas.length) SECUENCIA = Math.max(SECUENCIA, ...ultimas.map((t) => Number(t.secuencia) || 0));
    return { trazas: ultimas, archivo };
  } catch (e: any) {
    return { trazas: [], archivo, aviso: `no se pudo leer el historial: ${e?.message || e}` };
  }
}

// ─── El ciclo ────────────────────────────────────────────────────────────────

/** La herramienta que corresponde a una orden del reflejo (o `null`). */
function entidadDeOrden(res: { accion: string; orden?: any }, forzada?: string): string | null {
  if (forzada) return forzada;
  const tipo = res.accion === "orden" && res.orden ? String((res.orden as any).tipo) : "";
  // Una orden de plantilla la atiende `codigo` (especialista: no ejecuta por id).
  if (!tipo) return null;
  const directa = entidadPorId(tipo);
  if (directa && directa.tipo === "herramienta") return directa.id;
  return null;
}

/**
 * DECIDIR: frase → traza. Nunca lanza; si algo no se puede hacer, la traza lo
 * dice con motivo (igual que `ejecutarEntidad`, que jamás falla en silencio).
 */
export function decidir(frase: string, opts: OpcionesCiclo): TrazaDecision {
  const ahora = opts.ahora || (() => Date.now());
  const t0 = ahora();
  const tablas = opts.tablas || (TABLAS as any).lite;
  const texto = String(frase ?? "").trim();
  const etapas: EtapaTrazada[] = [];
  const clasificar = fuenteDe(opts.raizFuente, "clasificar");
  const votar = fuenteDe(opts.raizFuente, "voto");
  const catalogo = fuenteDe(opts.raizFuente, "catalogo");
  const ejecutarFuente = fuenteDe(opts.raizFuente, "ejecutar");

  etapas.push({
    etapa: "entrada",
    que: texto ? `llegó una frase de ${texto.length} caracteres` : "llegó una frase vacía",
    fuente: clasificar.cita,
    aviso: clasificar.aviso,
    datos: { caracteres: texto.length },
  });

  const res = pensarConsejo(texto, tablas as Tablas);
  const clave = res.accion === "orden" && res.orden ? String((res.orden as any).tipo) : String(res.accion);
  const v = veredictoVoto(clave);
  const reparto = (REPARTO_VOTOS as any)[clave];

  etapas.push({
    etapa: "clasificacion",
    que: `el reflejo clasificó como «${res.accion}»${res.orden ? ` (orden tipo «${(res.orden as any).tipo}»)` : ""} con confianza ${res.confianza}`,
    fuente: clasificar.cita,
    aviso: clasificar.aviso,
    datos: { accion: res.accion, orden: res.orden ?? null, confianza: res.confianza, modo: res.modo, motivo: res.motivo ?? null },
  });

  etapas.push({
    etapa: "voto",
    que: v.porVoto
      ? `«${v.especialista}» reclama la frase: ${v.razon}`
      : `ningún especialista reclama «${clave}»: ${v.razon}`,
    fuente: votar.cita,
    aviso: votar.aviso,
    datos: { especialista: v.especialista, porVoto: v.porVoto, accion: clave, declarado: reparto ? reparto.especialista === null : false },
  });

  const entidad = entidadDeOrden(res, opts.entidadForzada);
  const ficha = entidad ? entidadPorId(entidad) : undefined;
  etapas.push({
    etapa: "entidad",
    que: entidad
      ? `${entidad} (${ficha?.tipo ?? "desconocida"}) recibe la orden${entidadPorId(entidad)?.activa === false ? " — está DORMIDA" : ""}`
      : `no hay herramienta con este id en las ${ENTIDADES.length} entidades: decide ${v.especialista} sin ejecutar nada`,
    fuente: catalogo.cita,
    aviso: catalogo.aviso,
    datos: { entidad: entidad ?? null, totalCatalogo: ENTIDADES.length },
  });

  // El órgano (FASE 2) como pizarra: qué sabe el motor de esto mismo antes de decidir.
  const citas = Math.max(0, opts.citasOrgano ?? 3);
  const organo = fuenteDe(opts.raizFuente, "organo");
  let rutas: Array<{ tema: string; titulo: string; peso: number; score: number }> = [];
  try {
    rutas = (opts.raizDatos ? enrutar(opts.raizDatos, texto || "decision", citas) : []).map((r) => ({
      tema: r.entrada.tema, titulo: r.entrada.titulo, peso: r.entrada.peso, score: Number(r.score.toFixed(3)),
    }));
  } catch {
    rutas = [];
  }
  etapas.push({
    etapa: "organo",
    que: rutas.length
      ? `el órgano trajo ${rutas.length} entrada(s) de memoria: ${rutas.map((r) => `${r.tema}/${r.titulo}`).join(", ")}`
      : "el órgano no tenía memoria previa de esta frase (primera vez que se decide)",
    fuente: organo.cita,
    aviso: organo.aviso,
    datos: { rutas },
  });

  let ok = !!res.ok;
  let motivo = res.motivo;
  let salida: unknown = res.salida;
  if (entidad && opts.ejecutar !== false) {
    const r = ejecutarEntidad(entidad, opts.datos ?? {});
    ok = r.ok;
    motivo = (r as any).motivo;
    salida = (r as any).salida;
    etapas.push({
      etapa: "ejecucion",
      que: r.ok
        ? `${entidad} ejecutó en ${r.ms} ms`
        : `${entidad} NO ejecutó: ${motivo || "sin motivo declarado"}`,
      fuente: ejecutarFuente.cita,
      aviso: ejecutarFuente.aviso,
      datos: { ms: r.ms, salida: typeof salida === "string" ? salida.slice(0, 400) : salida ?? null, motivo: motivo ?? null },
    });
  } else {
    etapas.push({
      etapa: "ejecucion",
      que: entidad
        ? `${entidad} no se ejecuta: el llamante pidió solo clasificar`
        : `no hay herramienta que ejecutar: ${v.especialista} responde con texto`,
      fuente: ejecutarFuente.cita,
      aviso: ejecutarFuente.aviso,
      datos: { ejecuto: false },
    });
  }

  SECUENCIA += 1;
  const ts = ahora();
  const traza: TrazaDecision = {
    id: `t${SECUENCIA}-${ts}`,
    secuencia: SECUENCIA,
    ts,
    frase: texto.slice(0, 400),
    accion: clave,
    confianza: res.confianza,
    especialista: v.especialista,
    entidad,
    porVoto: v.porVoto,
    razonVoto: v.razon,
    ok,
    motivo,
    etapas,
    ms: ts - t0,
    modo: res.modo,
  };
  etapas.push({
    etapa: "resultado",
    que: ok ? `el turno quedó OK y quedó traza ${traza.id}` : `el turno NO quedó OK: ${motivo || "sin motivo declarado"}`,
    fuente: clasificar.cita,
    aviso: clasificar.aviso,
    datos: { id: traza.id, ok, ms: traza.ms },
  });

  const enDisco = persistir(opts.raizDatos, traza);
  if (!enDisco) {
    traza.etapas.push({
      etapa: "resultado",
      que: "la traza NO se pudo escribir en disco; vive solo en el anillo de memoria",
      fuente: null,
      aviso: "sin fuente: el fallo es de disco, no de una regla del motor",
      datos: { persistida: false },
    });
  }

  ANILLO.push(traza);
  if (ANILLO.length > ANILLO_POR_DEFECTO) ANILLO = ANILLO.slice(-ANILLO_POR_DEFECTO);
  return traza;
}

// ─── Lectura para el panel y para `¿por qué decidiste esto?` ─────────────────

/** Las últimas N trazas (más nueva primero). */
export function listarTrazas(max = 20): TrazaDecision[] {
  return ANILLO.slice(-Math.max(1, max)).slice().reverse();
}

/** Busca una traza por id o por número de secuencia (lo que teclea el usuario). */
export function trazaPorId(idOAsecuencia: string | number): TrazaDecision | null {
  const crudo = String(idOAsecuencia ?? "").trim();
  if (!crudo) return null;
  const porId = ANILLO.find((t) => t.id === crudo);
  if (porId) return porId;
  const n = Number(crudo.replace(/^#/, ""));
  if (Number.isFinite(n)) {
    const porSecuencia = ANILLO.find((t) => t.secuencia === n);
    if (porSecuencia) return porSecuencia;
  }
  return null;
}

/** Trazas de una entidad concreta (auditoría por especialista/herramienta). */
export function trazasDeEntidad(id: string, max = 20): TrazaDecision[] {
  return ANILLO.filter((t) => t.entidad === id || t.especialista === id).slice(-max).reverse();
}

export interface HojaTrazas {
  total: number;
  ok: number;
  fallidas: number;
  ultimas: Array<{
    pasoId: string;
    secuencia: number;
    frase: string;
    accion: string;
    especialista: string;
    entidad: string | null;
    ok: boolean;
    motivo: string | null;
    ms: number;
    etapas: number;
    ts: number;
  }>;
  /** Cuántas etapas traen fuente con ruta+línea (la medida de «explicable»). */
  trazasConFuente: number;
  nota: string;
}

/** La cara del panel «Hoja de Ruta Activa»: las piezas ok/fallos/ver ya existen. */
export function hojaTrazas(max = 12): HojaTrazas {
  const ultimas = listarTrazas(max);
  const conFuente = ultimas.filter((t) => t.etapas.some((e) => !!e.fuente)).length;
  return {
    total: ANILLO.length,
    ok: ANILLO.filter((t) => t.ok).length,
    fallidas: ANILLO.filter((t) => !t.ok).length,
    ultimas: ultimas.map((t) => ({
      pasoId: t.id,
      secuencia: t.secuencia,
      frase: t.frase.slice(0, 90),
      accion: t.accion,
      especialista: t.especialista,
      entidad: t.entidad,
      ok: t.ok,
      motivo: t.motivo ?? null,
      ms: t.ms,
      etapas: t.etapas.length,
      ts: t.ts,
    })),
    trazasConFuente: conFuente,
    nota: `Ciclo de decisión V8 §6.2: ${ANILLO.length} trazas en el anillo (${ANILLO.filter((t) => t.ok).length} ok · ${ANILLO.filter((t) => !t.ok).length} fallidas). Cada etapa cita la línea real de la regla que decidió o declara que no la encontró.`,
  };
}

/** Vacía el anillo (solo tests). */
export function _resetTrazas(): void {
  ANILLO = [];
  SECUENCIA = 0;
  MEMORIA_FUENTE.clear();
}

/** Estado del ciclo para `/api/consejo/decidir` sin pedir una frase. */
export function estadoCiclo(raizDatos: string): { archivo: string; enDisco: boolean; lineas: number; anillo: number } {
  const archivo = archivoTrazas(raizDatos);
  let lineas = 0;
  let enDisco = false;
  try {
    if (existsSync(archivo)) {
      enDisco = true;
      lineas = readFileSync(archivo, "utf8").trim().split(/\r?\n/).filter(Boolean).length;
    }
  } catch {
    lineas = 0;
  }
  return { archivo, enDisco, lineas, anillo: ANILLO.length };
}

/** Utilidad expuesta para tests: tamaño del statSync de un archivo de trazas. */
export function tamanoTrazas(raizDatos: string): number {
  try {
    return statSync(archivoTrazas(raizDatos)).size;
  } catch {
    return 0;
  }
}
