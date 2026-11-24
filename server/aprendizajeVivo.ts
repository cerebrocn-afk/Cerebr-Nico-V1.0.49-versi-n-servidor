/**
 * aprendizajeVivo.ts — SUITE «EL CEREBRO ESCRIBE EN TINTA»: AUTOAPRENDIZAJE EN
 * TIEMPO REAL (v1.74.0)
 * ============================================================================
 * EL PROBLEMA MEDIDO (por qué Mario dice que «nunca funcionó bien»):
 *   · El motor ya aprendía de los fallos, pero SOLO a la base interna
 *     (`.cerebro-db/kb.json`): nada visible en un .md, y el usuario no lo veía
 *     aplicado nunca.
 *   · MEMORIA.md y skills.md se inyectaban «en el turno 1»; una lección nueva
 *     a mitad de sesión NO entraba al prompt hasta el turno 1 de la próxima
 *     conversación. «Aprender» sin aplicar después es un diario íntimo, no
 *     aprendizaje.
 *   · Las correcciones del usuario («así no», «ya te lo dije») evaporaban: no
 *     quedaban como lección en ningún lado.
 *
 * QUÉ HACE AHORA (todo sin costo de LLM — patrones y hechos, no prom):
 *   1. APRENDE AL INSTANTE de tres hechos reales:
 *      · fallo → éxito: la misma herramienta falló N veces y después funcionó
 *        con argumentos distintos → la lección guarda la pareja concreta
 *        (causa que dolió / argumento que resolvió), que es lo que un reintento
 *        a ciegas no sabe;
 *      · corrección del usuario (patrones conservadores: «así no», «ya te lo
 *        dije», «acordate que», «más nunca»…): la frase de la corrección queda
 *        como lección textual, no interpretada;
 *      · enseñanza explícita: `POST /api/aprender` (y eco de `cerebro_recordar`
 *        y `/api/engine/kb/learn`).
 *   2. LO ESCRIBE EN MD AL INSTANTE: `LECCIONES.md` en la raíz del proyecto —
 *      `- **L#N** · [fecha hora · fuente] título → texto`. Visible, editable a
 *      mano, portable. El humano puede borrar o corregir una línea y eso ES la
 *      memoria: no hay estado oculto paralelo.
 *   3. LO INYECTA EN CADA TURNO ULTERIOR (esa es la palabra «aplicarlo»):
 *      `leerLeccionesParaInyectar()` devuelve las lecciones más recientes
 *      dentro de un presupuesto de caracteres y el punto único del prompt de
 *      sistema (válido para TODOS los proveedores) las pega. Una lección a las
 *      20:41 rige en el turno de las 20:42 — no en la próxima sesión.
 *   4. DEDUPLICA POR FIRMA (hash del texto normalizado, persistido en
 *      `.cerebro-db/lecciones-firmas.json`): la misma lección no se aprende dos
 *      veces ni llena el MD. Un mismo fallo normalizado sube `reconfirmada ×N`
 *      — porque un hecho que se repite merece más peso, no otra entrada.
 *   5. AVISA DONDE SE VE: cada lección nueva pasa por `onLeccion` → el servidor
 *      lo anexa al espejo vivo → aparece en la barra de Tareas como línea
 *      `LECCIÓN aprendida` con su título. El aprendizaje se vuelve visible en
 *      el momento en que ocurre, que es lo que nunca estuvo.
 *
 * LÍMITES HONESTOS:
 *   · LECCIONES.md tiene un techo de 60 KB: al pasar, se recortan las entradas
 *     MÁS VIEJAS (las firmas quedan: si vuelven a pasar, se reconfirman).
 *   · Inyección: máx. 12 entradas y ~1.400 caracteres por turno (una lección
 *     de cada turno, no una novela; el presupuesto del micro modelo manda).
 *   · Ningún proveedor externo: no se llama a ningún LLM para «destilar». Si
 *     algún día se quiere destilar con modelo, se hace detrás de esta misma
 *     interfaz y con el hecho medido en el título.
 */
import fs from "node:fs";
import path from "node:path";
import type express from "express";
import type { Request, Response } from "express";

// ─── tipos ──────────────────────────────────────────────────────────────────
export interface LeccionViva {
  n: number;
  cuando: number;
  fuente: "motor" | "usuario" | "cerebro" | "manual";
  titulo: string;
  texto: string;
  reconfirmada?: number;
}

export interface DepsAprendizajeVivo {
  /** Raíz de datos (.cerebro-db vive debajo). */
  proyectoRoot: string;
  /** Espejo con el motor: sube la lección a la KB (tabla "lesson") y marca sucio. */
  upsertKb: (entry: { id: string; table: string; title: string; body: string; keys: string[]; weight: number }) => void;
  /** Aviso en vivo (el servidor lo engancha al espejo vivo → barra de Tareas). */
  onLeccion?: (l: LeccionViva) => void;
}

// ─── constantes del dominio ─────────────────────────────────────────────────
const MAX_MD_BYTES = 60_000;
const MAX_FIRMAS = 500;
const MAX_INYECTAR = 12;
const PRESUPUESTO_INYECCION = 1400;
const VENTANA_FALLO_EXITO_MS = 10 * 60_000; // el éxito que enseña llega dentro de los 10 min del dolor

let deps: DepsAprendizajeVivo | null = null;
let contador = 0;
const firmas = new Map<string, { n: number; reconfirmada: number }>();
// Fallos recientes por herramienta: el éxito necesita la causa que dolía para
// escribir una lección concreta, no un consuelo genérico.
const fallosRecientes = new Map<string, { error: string; cuando: number; veces: number }>();

function archivoMd(): string { return path.join(deps!.proyectoRoot, "LECCIONES.md"); }
function archivoFirmas(): string { return path.join(deps!.proyectoRoot, ".cerebro-db", "lecciones-firmas.json"); }

function firmaDe(texto: string): string {
  // Normalización estable: minúsculas, sin números ni rutas largas — la misma
  // que ya usa learnFromToolFailure para no guardar una entrada por cada ruta.
  const norm = String(texto || "").toLowerCase().replace(/[0-9]+/g, "<n>").replace(/[a-z0-9_./\\-]{8,}/gi, "<r>").replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return `f${(h >>> 0).toString(36)}`;
}

function persistFirmas(): void {
  try {
    const dir = path.dirname(archivoFirmas());
    fs.mkdirSync(dir, { recursive: true });
    const arr: [string, { n: number; reconfirmada: number }][] = Array.from(firmas.entries()).slice(-MAX_FIRMAS);
    fs.writeFileSync(archivoFirmas(), JSON.stringify(arr), "utf8");
  } catch { /* el aprendizaje nunca rompe el turno */ }
}

function cargarEstado(): void {
  try {
    if (fs.existsSync(archivoFirmas())) {
      const arr = JSON.parse(fs.readFileSync(archivoFirmas(), "utf8"));
      if (Array.isArray(arr)) {
        for (const [k, v] of arr) firmas.set(String(k), v as any);
        contador = Math.max(contador, ...arr.map((a: any) => Number(a?.[1]?.n || 0)));
      }
    }
  } catch { /* sin firmas previas: se empieza limpio */ }
}

const CABECERA_MD = `# LECCIONES — autoaprendizaje en tiempo real (CerebroNico)\n\n> El motor escribe acá lo que aprende de HECHOS reales (fallos que se resolvieron, correcciones del usuario, enseñanzas explícitas). Se inyecta en el system prompt de cada turno siguiente. Editar o borrar una línea es válido: la memoria es este archivo.\n\n`;

function escribirMd(entrada: LeccionViva, reconfirmada: boolean): void {
  try {
    let actual = "";
    try { actual = fs.readFileSync(archivoMd(), "utf8"); } catch { actual = CABECERA_MD; }
    if (!actual.includes("LECCIONES —")) actual = CABECERA_MD + actual;
    const linea = reconfirmada
      ? `  · reconfirmada ×${entrada.reconfirmada} (${new Date(entrada.cuando).toLocaleString("es-AR")})\n`
      : `- **L${entrada.n}** · ${new Date(entrada.cuando).toLocaleString("es-AR")} · \`${entrada.fuente}\` · **${entrada.titulo}** → ${entrada.texto}\n`;
    actual += linea;
    // Techo honesto: se van las entradas MÁS VIEJAS del cuerpo (la cabecera y
    // las firmas quedan; una lección vieja que vuelva a pasar se reconfirma).
    if (Buffer.byteLength(actual, "utf8") > MAX_MD_BYTES) {
      const entradas = actual.split("\n").filter((l) => l.startsWith("- **L") || l.startsWith("  ·"));
      while (entradas.length > 12 && Buffer.byteLength(CABECERA_MD + entradas.join("\n") + "\n", "utf8") > MAX_MD_BYTES) {
        entradas.shift();
      }
      actual = CABECERA_MD + entradas.join("\n") + "\n";
    }
    fs.writeFileSync(archivoMd(), actual, "utf8");
  } catch { /* no hay memoria que valga romper un turno */ }
}

/**
 * EL ACTO DE APRENDER. Devuelve la lección o null (existente→reconfirmada).
 * Es la ÚNICA puerta: todo aprendizaje real —motor, usuario, cerebro, manual—
 * pasa por acá y sale al instante en MD + KB + aviso en vivo.
 */
export function anotarLeccionViva(opts: { fuente?: LeccionViva["fuente"]; titulo: string; texto: string; keys?: string[] }): { ok: boolean; nueva: boolean; leccion?: LeccionViva; motivo?: string } {
  if (!deps) return { ok: false, nueva: false, motivo: "aprendizaje vivo sin inicializar" };
  const texto = String(opts.texto || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (texto.length < 8) return { ok: false, nueva: false, motivo: "texto demasiado corto para ser una lección" };
  const f = firmaDe(`${opts.titulo}::${texto}`);
  const previa = firmas.get(f);
  if (previa) {
    // La misma lección aprendida otra vez = reconfirmación, no duplicado.
    previa.reconfirmada = (previa.reconfirmada || 1) + 1;
    const l: LeccionViva = { n: previa.n, cuando: Date.now(), fuente: opts.fuente || "motor", titulo: opts.titulo, texto, reconfirmada: previa.reconfirmada };
    if (previa.reconfirmada % 3 === 1) escribirMd(l, true); // cada 3 reconfirmaciones se anota al MD, no cada golpe
    persistFirmas();
    return { ok: true, nueva: false, leccion: l };
  }
  contador++;
  const leccion: LeccionViva = { n: contador, cuando: Date.now(), fuente: opts.fuente || "motor", titulo: String(opts.titulo || "lección").slice(0, 90), texto };
  firmas.set(f, { n: contador, reconfirmada: 1 });
  escribirMd(leccion, false);
  try {
    deps.upsertKb({
      id: `apv:L${contador}`,
      table: "lesson",
      title: leccion.titulo,
      body: leccion.texto,
      keys: [leccion.fuente, ...(opts.keys || []), ...leccion.titulo.toLowerCase().split(/\W+/).filter((w) => w.length > 3)].slice(0, 14),
      weight: 0.66,
    });
  } catch { /* la KB es el eco; el MD manda */ }
  persistFirmas();
  try { deps.onLeccion?.(leccion); } catch { /* el aviso nunca rompe el aprendizaje */ }
  return { ok: true, nueva: true, leccion };
}

// ─── HECHOS DEL MOTOR ───────────────────────────────────────────────────────

/** Llamada desde learnFromToolFailure: guarda la causa del dolor reciente. */
export function notificarFalloHerramienta(tool: string, errorTexto: string): void {
  if (!deps) return;
  const clave = String(tool || "").toLowerCase();
  const prev = fallosRecientes.get(clave);
  if (prev) { prev.veces++; prev.error = String(errorTexto || "").slice(0, 200); prev.cuando = Date.now(); }
  else fallosRecientes.set(clave, { error: String(errorTexto || "").slice(0, 200), cuando: Date.now(), veces: 1 });
}

/**
 * Llamada desde el lazo cuando una herramienta ÉXITA justo después de haber
 * fallado: ES la lección — la pareja (causa → solución) concretas. Devuelve la
 * lección para que el lazo la pueda loggear sin volver a calcularla.
 */
export function notificarExitoTrasFallo(tool: string, argsResumen?: string): LeccionViva | null {
  if (!deps) return null;
  const clave = String(tool || "").toLowerCase();
  const fallo = fallosRecientes.get(clave);
  if (!fallo) return null;
  fallosRecientes.delete(clave);
  if (Date.now() - fallo.cuando > VENTANA_FALLO_EXITO_MS) return null;
  if (fallo.veces < 1) return null;
  const r = anotarLeccionViva({
    fuente: "motor",
    titulo: `${tool}: cómo salió del atolladero`,
    texto: `«${tool}» falló ${fallo.veces} vez/veces con «${fallo.error || "causa sin texto"}» y DESPUÉS funcionó${argsResumen ? ` con ${String(argsResumen).slice(0, 120)}` : " con argumentos distintos"}. Lección: ante ese error no se reintenta igual — se corrige la causa (ruta/comando/args) y se varía el intento.`,
    keys: [clave, "fallo", "reintento", "corregir-causa"],
  });
  return r.leccion || null;
}

// ─── HECHOS DEL USUARIO ────────────────────────────────────────────────────

/** Patrones CONSERVADORES de corrección (la frase del usuario queda textual). */
const PATRON_CORRECCION = /(\bas[íi] no\b|no es as[íi]\b|otra vez igual\b|te equivocaste\b|ya te (lo )?dije\b|te lo dije\b|cu[áa]ntas veces\b|nunca m[áa]s\b|m[áa]s nunca\b|mil veces\b|lo que quer[íi]a decir\b|record[áa]? que\b|acord[áa]te que\b|acord[áa] que\b|no funciona cuando\b|siempre hac[ée]s lo mismo\b)/i;

/**
 * Corrección detectada en el mensaje del usuario: la frase MISMA es la lección
 * (sin interpretar — interpretar es inventar). Se anota el recorte con el
 * patrón y ± contexto. La deduplicación por firma frena el spam si la
 * corrección se repite literal.
 */
export function detectarCorreccionUsuario(texto: string): LeccionViva | null {
  if (!deps) return null;
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (t.length < 12 || t.length > 1200) return null;
  const m = PATRON_CORRECCION.exec(t);
  if (!m) return null;
  const desde = Math.max(0, (m.index || 0) - 80);
  const hasta = Math.min(t.length, (m.index || 0) + m[0].length + 220);
  const frase = t.slice(desde, hasta).trim().slice(0, 300);
  if (frase.length < 12) return null;
  const r = anotarLeccionViva({
    fuente: "usuario",
    titulo: `Corrección del usuario (${m[0]})`,
    texto: `El usuario corrigió: "${frase}". Respetar esta preferencia en los turnos siguientes sin volver a preguntar.`,
    keys: ["correccion", "preferencia", ...String(m[0]).toLowerCase().split(/\s+/)].slice(0, 10),
  });
  return r.leccion || null;
}

// ─── LA INYECCIÓN («aplicarlo luego») ──────────────────────────────────────

/**
 * Lee las ÚLTIMAS lecciones del MD (no la memoria RAM — puede haberse editado a
 * mano) y arma el bloque para el system prompt. El humano mandó: aprender en
 * tiempo real e inyectar en el md para aplicarlo después. Después ES ahora.
 */
export function leerLeccionesParaInyectar(): string {
  if (!deps) return "";
  try {
    const bruto = fs.readFileSync(archivoMd(), "utf8");
    const lineas = bruto.split("\n").filter((l) => l.startsWith("- **L")).slice(-MAX_INYECTAR);
    if (lineas.length === 0) return "";
    let bloque = lineas.join("\n");
    if (bloque.length > PRESUPUESTO_INYECCION) bloque = bloque.slice(bloque.length - PRESUPUESTO_INYECCION);
    return bloque;
  } catch {
    return "";
  }
}

/** Estado para la UI/depuración. */
export function estadoAprendizajeVivo(): { total: number; lecciones: LeccionViva[] } {
  if (!deps) return { total: 0, lecciones: [] };
  try {
    const bruto = fs.readFileSync(archivoMd(), "utf8");
    const lineas = bruto.split("\n").filter((l) => l.startsWith("- **L"));
    const lecciones: LeccionViva[] = lineas.map((l) => {
      const m = /^- \*\*L(\d+)\*\* · (.+?) · `(\w+)` · \*\*(.+?)\*\* → (.+)$/.exec(l);
      return m ? { n: Number(m[1]), cuando: Date.parse(m[2]) || 0, fuente: m[3] as any, titulo: m[4], texto: m[5] } : { n: 0, cuando: 0, fuente: "manual", titulo: l.slice(0, 60), texto: "" };
    });
    return { total: lecciones.length, lecciones: lecciones.slice(-30).reverse() };
  } catch {
    return { total: 0, lecciones: [] };
  }
}

// ─── INICIALIZACIÓN Y RUTAS (2 rutas, declaradas para el contrato) ─────────
export const RUTAS_APRENDIZAJE_VIVO = [
  "POST /api/aprender",
  "GET /api/aprender/estado",
] as const;

export function inicializarAprendizajeVivo(d: DepsAprendizajeVivo): void {
  deps = d;
  cargarEstado();
}

export function registrarRutasAprendizajeVivo(app: express.Express): void {
  /** Enseñanza explícita en caliente: el cliente (tool, botón, terminal) aprende YA. */
  app.post("/api/aprender", (req: Request, res: Response) => {
    if (!deps) return res.status(503).json({ ok: false, error: "motor de aprendizaje no inicializado" });
    const { titulo, texto, fuente, keys } = req.body || {};
    const r = anotarLeccionViva({
      fuente: (["motor", "usuario", "cerebro", "manual"].includes(String(fuente)) ? String(fuente) : "manual") as LeccionViva["fuente"],
      titulo: String(titulo || "lección manual"),
      texto: String(texto || ""),
      keys: Array.isArray(keys) ? keys.map(String) : undefined,
    });
    return res.status(r.ok ? 200 : 400).json(r);
  });

  /** Qué aprendió el motor: últimas 30, más recientes primero. */
  app.get("/api/aprender/estado", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...estadoAprendizajeVivo() });
  });
}
