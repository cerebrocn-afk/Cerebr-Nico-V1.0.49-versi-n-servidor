// Version: 1.0.55 | Vallas: 12277/12277 (techo 13800) | State: NO VERIFICADO (pasá --estado para correr `npm run validar` antes de exportar)
// Capas: contratos + motor (sin monolito server.ts y sin UI)
// El monolito está optimizado al límite del contrato: NO sugieras refactors que agreguen líneas; la lógica vive en src/engine y server/*.ts.

41 archivo(s) · 10271 líneas · ~122k tokens estimados
// PRESUPUESTO DE TOKENS (120k): quedaron afuera 312 archivo(s) — pedí --capa, --solo <glob> o subí --tokens-max: server/routers/features.ts, server/routers/geminiTts.ts, server/routers/modelos.ts, server/routers/nucleoAgentico.ts, server/routers/ollamaControl.ts, server/routers/persistencia.ts, server/routers/puenteDependencias.ts, server/routers/quirofanoInterruptor.ts, server/routers/rutasProyecto.ts, server/routers/subagentes.ts, server/routers/supervisorArranque.ts, server/routers/telemetria.ts …

### server/aprendizajeVivo.ts (317 líneas)

```ts
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

```

### server/aprovisionarToolchain.ts (319 líneas)

```ts
// ============================================================
// APROVISIONAR TOOLCHAIN — v1.0.14 · «UN CLIC BAJA TODO» DE VERDAD
// ============================================================
// Este es el cable del plan puro `src/engine/toolchainPlan.ts`. La queja de
// Mario (capturas 10/11): «2. Compilar APK» decía «abrí Android Studio» y en su
// máquina limpia eso era un muro. Aquí la IDE CONSEGUÍ las herramientas que
// faltan — JDK 17 (Adoptium), Gradle y Android command-line tools + paquetes
// de plataforma — dentro de su propia carpeta de datos, sin tocar el PATH del
// sistema ni `Program Files`.
//
// Honestidad (las mismas reglas de la fábrica de APK):
//   · UN trabajo vivo: dos descargas simultáneas de ~500 MB pelean por el
//     mismo disco y el mismo módem. El segundo clic se sube al primero.
//   · Nada se declara instalado hasta que la sonda ve el EJECUTABLE en disco.
//   · Cada línea del log queda visible en el panel: progreso real de bytes,
//     URL usada, comando ejecutado. Si algo falla, el fallo trae la solución
//     concreta (incluidos los overrides CN_JDK_URL / CN_GRADLE_URL /
//     CN_CMDLINE_URL para redes corporativas).
//   · El estado se recalcula CONTRA DISCO en cada arranque: si la IDE se
//     reinició a mitad, lo que ya está bajado no se vuelve a bajar.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SDK_COMPILACION } from "../src/engine/androidProyecto";
import {
  rutasHerramientas,
  faltanHerramientas,
  planDeAprovisionamiento,
  formatoPaquete,
  pesoTotal,
  localPropertiesContenido,
  type So,
} from "../src/engine/toolchainPlan";

export interface TrabajoProvision {
  id: string;
  estado: "corriendo" | "exito" | "fallido";
  inicio: number;
  fin?: number;
  pasoActual: string;
  lineas: string[];
  bajadoBytes: number;
  totalNota: string;
  fallo?: { causa: string; solucion: string };
}

let vivo: TrabajoProvision | null = null;
const historial: TrabajoProvision[] = [];
let secuencial = 0;

function empujar(t: TrabajoProvision, linea: string) {
  for (const l of String(linea).split(/\r?\n/)) {
    if (!l.trim()) continue;
    t.lineas.push(l);
    if (t.lineas.length > 500) t.lineas.splice(0, t.lineas.length - 500);
  }
  console.log(`[aprovisionar] ${String(linea).split("\n")[0].slice(0, 160)}`);
}

export function trabajoProvisionVivo(): TrabajoProvision | null { return vivo; }
export function ultimoTrabajoProvision(): TrabajoProvision | null {
  return historial.length ? historial[historial.length - 1] : null;
}

/** Carpeta de herramientas POR DEFECTO: `<raíz de datos>/.cerebronico/herramientas`. */
export function herramientasDirPorDefecto(raizDatos: string, so: NodeJS.Platform = process.platform): string {
  const sep = so === "win32" ? "\\" : "/";
  return `${raizDatos.replace(/[\\/]+$/, "")}${sep}.cerebronico${sep}herramientas`;
}

// server.ts fija la raíz de datos UNA vez (tras resolver PROJECT_DIR). Con eso,
// la fábrica y el router encuentran el toolchain sin que cada llamante tenga
// que conocer la convención. Sin fija, `herramientasDirActiva()` devuelve null
// y las rutas siguen funcionando como antes de v1.0.14 (sin ruta local).
let raizDatosConfigurada: string | null = null;
export function fijarRaizDatosParaHerramientas(raiz: string): void { raizDatosConfigurada = raiz; }
export function herramientasDirActiva(): string | null {
  return raizDatosConfigurada ? herramientasDirPorDefecto(raizDatosConfigurada) : null;
}

const soBin = (so: NodeJS.Platform): So => (so === "win32" ? "win32" : so === "darwin" ? "darwin" : "linux");

/** ¿Qué hay ya aprovisionado? (lo consulta la fábrica ANTES de rendirse). */
export function rutasProvisionadas(raizHerramientas: string, so: NodeJS.Platform = process.platform) {
  const r = rutasHerramientas(raizHerramientas, soBin(so));
  const javaBin = so === "win32" ? path.join(r.jdkDir, "bin", "java.exe") : path.join(r.jdkDir, "bin", "java");
  return {
    rutas: r,
    jdk: fs.existsSync(javaBin),
    gradle: fs.existsSync(r.gradleBin),
    sdkManager: fs.existsSync(r.sdkManagerBin),
    androidHome: r.sdkDir,
  };
}

// ── primitivas con efectos ──────────────────────────────────────────────────

const MB = 1024 * 1024;

async function descargar(url: string, destino: string, t: TrabajoProvision): Promise<number> {
  // 20 min por archivo: una conexión lenta puede con 190 MB; un colgado no.
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal["timeout"] ? AbortSignal["timeout"](20 * 60 * 1000) : undefined });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status || "?"} al bajar ${url}`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  let bytes = 0;
  let ultimoReporte = 0;
  const ws = fs.createWriteStream ? fs.createWriteStream(destino) : null;
  if (!ws) throw new Error("sin fs.createWriteStream en este runtime");
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array | ArrayBuffer | string>) {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as ArrayBuffer);
      bytes += buf.length;
      ws.write(buf);
      if (bytes - ultimoReporte > 8 * MB) {
        ultimoReporte = bytes;
        empujar(t, `  … ${(bytes / MB).toFixed(0)} MB bajados`);
      }
    }
  } finally {
    ws.end();
    await new Promise<void>((ok) => ws.on("close", () => ok()));
  }
  if (bytes < 1 * MB) throw new Error(`El archivo bajado pesa ${(bytes / 1024).toFixed(0)} KB — es un error, no un paquete.`);
  return bytes;
}

function extraer(paquete: string, destino: string, t: TrabajoProvision, so: NodeJS.Platform) {
  fs.mkdirSync(destino, { recursive: true });
  const esZip = /\.(zip)$/i.test(paquete);
  const candidatos: string[][] = [];
  if (so === "win32") {
    candidatos.push(["C:\\Windows\\System32\\tar.exe", "-xf", paquete, "-C", destino]);
    candidatos.push(["powershell", "-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${paquete}' -DestinationPath '${destino}'`]);
  } else {
    if (esZip) candidatos.push(["unzip", "-q", "-o", paquete, "-d", destino]);
    candidatos.push(["tar", esZip ? "-xf" : "-zxf", paquete, "-C", destino]);
  }
  let ultimo = "";
  for (const cmd of candidatos) {
    try {
      const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8", timeout: 5 * 60 * 1000, windowsHide: true, maxBuffer: 8 * MB });
      if (r.status === 0) { empujar(t, `  descomprimido con ${cmd[0]}`); return true; }
      ultimo = `${cmd[0]}: ${String(r.stderr || r.stdout || "").slice(0, 200)}`;
    } catch (e: any) { ultimo = String(e?.message || e); }
  }
  throw new Error(`No se pudo descomprimir ${path.basename(paquete)} — ${ultimo}`);
}

function correr(bin: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number; t?: TrabajoProvision }): { code: number; salida: string } {
  const r = spawnSync(bin, args, {
    cwd: opts.cwd,
    env: opts.env || process.env,
    input: opts.input,
    encoding: "utf-8",
    timeout: opts.timeoutMs || 15 * 60 * 1000,
    maxBuffer: 32 * MB,
    windowsHide: true,
  });
  const salida = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (opts.t) for (const l of salida.split(/\r?\n/).slice(-12)) if (l.trim()) empujar(opts.t, `  ${l.trim().slice(0, 200)}`);
  return { code: r.error ? -1 : (r.status ?? -1), salida: salida || String(r.error?.message || "sin salida") };
}

function envConJdk(r: ReturnType<typeof rutasHerramientas>, so: NodeJS.Platform): NodeJS.ProcessEnv {
  const sep = so === "win32" ? ";" : ":";
  const bin = path.join(r.jdkDir, "bin");
  return {
    ...process.env,
    JAVA_HOME: r.jdkDir,
    PATH: `${bin}${sep}${process.env.PATH || ""}`,
  };
}

// ── el trabajo completo ────────────────────────────────────────────────────

export interface OpcionesAprovisionamiento {
  /** `<raíz de datos>/.cerebronico/herramientas` (exportacion.ts la fija). */
  herramientasDir: string;
  /** Proyecto con android/: se le escribe local.properties al terminar. */
  projectRoot?: string;
  /** Repite descargas aunque la sonda diga que ya están. */
  forzar?: boolean;
}

export function lanzarAprovisionamiento(o: OpcionesAprovisionamiento): { ok: boolean; yaEnMarcha?: boolean; error?: string; trabajo?: TrabajoProvision } {
  if (vivo && vivo.estado === "corriendo") return { ok: true, yaEnMarcha: true, trabajo: vivo };
  const so = process.platform;
  const r = rutasHerramientas(o.herramientasDir, soBin(so));
  const probeJava = spawnSyncSafe("java", ["-version"]);
  const probeGradle = spawnSyncSafe("gradle", ["-v"]);
  const faltan = faltanHerramientas(r, soBin(so), (p) => fs.existsSync(p), { sistemaJava: probeJava, sistemaGradle: probeGradle });
  if (o.forzar) { faltan.jdk = faltan.gradle = faltan.cmdline = faltan.sdkPlataforma = true; }
  const pasos = planDeAprovisionamiento(faltan, soBin(so));
  const t: TrabajoProvision = {
    id: `prov-${Date.now()}-${++secuencial}`,
    estado: "corriendo",
    inicio: Date.now(),
    pasoActual: pasos.length ? pasos[0].que : "nada que bajar",
    lineas: [],
    bajadoBytes: 0,
    totalNota: pesoTotal(pasos),
  };
  vivo = t;
  historial.push(t);
  if (historial.length > 10) historial.splice(0, historial.length - 10);

  if (pasos.length === 0) {
    empujar(t, "La máquina ya tiene todo: JDK, Gradle y SDK verificados en disco. Nada que bajar.");
    t.estado = "exito"; t.fin = Date.now(); vivo = null;
    return { ok: true, trabajo: t };
  }

  empujar(t, `Plan: ${pasos.map((p) => p.id).join(" → ")} · ${t.totalNota}`);
  const paquetesDir = path.join(o.herramientasDir, "_paquetes");

  (async () => {
    try {
      for (const paso of pasos) {
        t.pasoActual = paso.que;
        if (paso.id === "sdk-paquetes") {
          const env = envConJdk(r, so);
          empujar(t, `Aceptando licencias de Android SDK (sdkmanager --licenses)`);
          correr(r.sdkManagerBin, ["--sdk_root=" + r.sdkDir, "--licenses"], { env, input: "y\n".repeat(40), timeoutMs: 3 * 60 * 1000, t });
          const pkgs = ["platform-tools", `platforms;android-${SDK_COMPILACION}`, `build-tools;${SDK_COMPILACION}.0.0`];
          empujar(t, `Instalando ${pkgs.join(" ")} (pesa ~200 MB, Gradle lo pide igual)`);
          const inst = correr(r.sdkManagerBin, ["--sdk_root=" + r.sdkDir, ...pkgs], { env, input: "y\n".repeat(10), timeoutMs: 18 * 60 * 1000, t });
          if (inst.code !== 0) throw new Error(`sdkmanager falló (código ${inst.code}): ${inst.salida.slice(-400)}`);
          continue;
        }
        if (!paso.url) continue;
        const fmt: "zip" | "tar.gz" = paso.id === "jdk" ? formatoPaquete(soBin(so)) : "zip";
        const destino = path.join(paquetesDir, `${paso.id}.${fmt}`);
        const home = paso.id === "jdk" ? r.jdkDir : paso.id === "gradle" ? path.dirname(r.gradleHome) : r.cmdlineDir;
        if (!o.forzar && existeEjecutableDe(paso.id, r, so)) { empujar(t, `${paso.id}: ya en disco, se salta.`); continue; }
        empujar(t, `${paso.que} (${paso.pesoNota}) ← ${paso.url}`);
        const bytes = await descargar(paso.url, destino, t);
        t.bajadoBytes += bytes;
        extraer(destino, home, t, so);
        if (!existeEjecutableDe(paso.id, r, so)) {
          // El zip de Adoptium trae la carpeta dentro de la carpeta: una pasada
          // de reubicación antes de sentenciar el fallo.
          reubicarHijoUnico(home, paso.id, r);
        }
        if (!existeEjecutableDe(paso.id, r, so)) throw new Error(`${paso.id}: se descargó y descomprimió pero el ejecutable no aparece en ${home}. Revisá el antivirus o fijá CN_${paso.id.toUpperCase()}_URL.`);
      }
      // Verificación final CONTRA DISCO — no por optimismo.
      const quedan = faltanHerramientas(r, soBin(so), (p) => fs.existsSync(p), { sistemaJava: probeJava, sistemaGradle: probeGradle });
      const rojos = Object.entries(quedan).filter(([, v]) => v).map(([k]) => k);
      if (rojos.length) throw new Error(`Terminó pero siguen sin verificarse: ${rojos.join(", ")}`);
      if (o.projectRoot) {
        const lp = path.join(o.projectRoot, "android", "local.properties");
        if (fs.existsSync(path.join(o.projectRoot, "android"))) {
          fs.writeFileSync(lp, localPropertiesContenido(r.sdkDir), "utf-8");
          empujar(t, `android/local.properties escrito con sdk.dir=${r.sdkDir}`);
        }
      }
      t.estado = "exito";
      empujar(t, "Toolchain completo y verificado en disco. «2. Compilar APK» ya tiene con qué.");
    } catch (e: any) {
      t.estado = "fallido";
      t.fallo = {
        causa: String(e?.message || e).slice(0, 400),
        solucion: "Red corporativa o disco lleno: fijá CN_JDK_URL / CN_GRADLE_URL / CN_CMDLINE_URL apuntando a espejos accesibles y volvé a pulsar. La descarga retoma: lo que ya está en disco se salta.",
      };
      empujar(t, `FALLO: ${t.fallo.causa}`);
    } finally {
      t.fin = Date.now();
      vivo = null;
    }
  })();

  return { ok: true, trabajo: t };
}

function spawnSyncSafe(bin: string, args: string[]): boolean {
  try { const r = spawnSync(bin, args, { encoding: "utf-8", timeout: 8000, windowsHide: true }); return r.status === 0; } catch { return false; }
}

function existeEjecutableDe(id: string, r: ReturnType<typeof rutasHerramientas>, so: NodeJS.Platform): boolean {
  if (id === "jdk") return fs.existsSync(so === "win32" ? path.join(r.jdkDir, "bin", "java.exe") : path.join(r.jdkDir, "bin", "java"));
  if (id === "gradle") return fs.existsSync(r.gradleBin);
  if (id === "cmdline") return fs.existsSync(r.sdkManagerBin);
  return false;
}

/**
 * Los zips oficiales meten UNA carpeta raíz (`jdk-17.0.x+y`, `gradle-9.6.0`,
 * `cmdline-tools`). Si la extracción quedó anidada un nivel y el destino esperado
 * está vacío, se promueve el hijo único. Determinista: solo actúa cuando hay
 * exactamente un directorio y el nombre coincide con la familia esperada.
 */
function reubicarHijoUnico(home: string, id: string, r: ReturnType<typeof rutasHerramientas>) {
  try {
    const objetivo = id === "jdk" ? r.jdkDir : id === "gradle" ? r.gradleHome : path.join(r.cmdlineDir, "cmdline-tools");
    if (fs.existsSync(objetivo)) return;
    const hijos = fs.existsSync(home) ? fs.readdirSync(home, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
    if (hijos.length !== 1) return;
    const origen = path.join(home, hijos[0].name);
    const prefijoOk = id === "jdk" ? /^jdk/.test(hijos[0].name) : id === "gradle" ? /^gradle/.test(hijos[0].name) : /^cmdline/.test(hijos[0].name);
    if (!prefijoOk) return;
    fs.renameSync(origen, objetivo);
  } catch { /* que lo reporte la verificación de abajo, con nombres */ }
}

/** Estado en la forma que come el panel (GET /api/export/android/provision). */
export function estadoProvisionParaCliente() {
  const t = vivo || ultimoTrabajoProvision();
  if (!t) return { ok: true, hayTrabajo: false, message: "Sin aprovisionamiento en esta sesión. POST /api/export/android/provision para empezar." };
  return {
    ok: true, hayTrabajo: true, id: t.id, estado: t.estado,
    paso: t.pasoActual, bajadoMB: Math.round(t.bajadoBytes / MB), totalNota: t.totalNota,
    segundos: Math.round(((t.fin || Date.now()) - t.inicio) / 1000),
    fallo: t.fallo || null,
    lineas: t.lineas.slice(-60),
  };
}

```

### server/avisosProveedor.ts (50 líneas)

```ts
/**
 * avisosProveedor.ts — EL AVISO DE PROVEEDOR CORREGIDO, UNA SOLA VEZ (v1.57.21)
 * ==============================================================================
 * QUÉ ES: el deduplicador del aviso 🧩 que lanza la guarda «el modelo elegido
 * manda sobre el proveedor heredado» (server.ts, v1.56.2).
 * PARA QUÉ SIRVE: para que la corrección siga pasando pero el log deje de
 * gritarla en CADA turno.
 *
 * EL SÍNTOMA (log de Mario, v1.57.20, 16/10):
 *   [CerebroNico] 🧩 El modelo "gemma4:31b-cloud" es LOCAL (Ollama) pero el
 *   turno llegó con provider="zai" ... (×7, una por turno, idéntica)
 *
 * La guarda hacía su trabajo — cada turno se corregía a "ollama" y respondía
 * bien — pero avisar siete veces lo mismo no informa siete veces: la primera
 * línea es el diagnóstico, las otras seis son ruido que tapa los errores que
 * sí hay que leer. Y la causa raíz del proveedor "pegado" (cambiar el MOTOR sin
 * cambiar el modelo, o el modelo sin cambiar el motor) ahora se cierra en el
 * frontend (`cambiarMotor`/`cambiarModelo` en App.tsx): si el frente hace bien
 * su trabajo, este aviso debería verse cero o una vez.
 *
 * LA REGLA: un aviso por par (modelo, proveedor) por proceso. La corrección NO
 * depende del aviso: `avisarProveedorCorregido` solo imprime, devuelve `true`
 * si lo imprimió y `false` si ya lo había dicho. Así se prueba sin consola.
 */

const yaAvisados = new Set<string>();

/**
 * Imprime (una sola vez por par) el aviso de que el proveedor recibido no
 * corresponde al modelo elegido y se corrige a "ollama".
 * Devuelve true si esta llamada ESCRIBIÓ el aviso; false si ya estaba dicho.
 */
export function avisarProveedorCorregido(model: string, provider: string): boolean {
  const clave = `${model}|${provider}`;
  if (yaAvisados.has(clave)) return false;
  yaAvisados.add(clave);
  console.warn(
    `[CerebroNico] 🧩 El modelo "${model}" es LOCAL (Ollama) pero el turno llegó con provider="${provider}" ` +
      `(heredado de un mensaje anterior). Se corrige a "ollama": el modelo elegido manda. ` +
      `Si querías la nube, cambia también el MOTOR, no solo el nombre del modelo. ` +
      `(Este aviso no se repite por turno: cada combinación modelo+motor se dice una sola vez por arranque.)`
  );
  return true;
}

/** Cuántos avisos distintos se dijeron (para tests y para el registro). */
export function avisosProveedorEmitidos(): number {
  return yaAvisados.size;
}

```

### server/cicloOpenAICompat.ts (1057 líneas)

```ts
// ============================================================
// v1.57.9 — EL CICLO OpenAI-COMPAT, FUERA DEL MONOLITO
// ------------------------------------------------------------
// MOVIMIENTO, NO MEJORA (regla de la casa: la Fase 2 es PARTIR, no añadir).
// La rama que usan Z.ai/GLM, Groq, OpenRouter y compañía para ejecutar
// herramientas de verdad vivía en server.ts. Aquí llega la sesión exportada
// del 14/10: el ciclo necesitó su primera cirugía seria (lazo suave, argumentos
// truncados, pasos con obra) y creció; el trinquete (`contrato-rutas.json`)
// avisa cuando server.ts engorda, así que el ciclo entero se va a su módulo
// hoja. Las dependencias ya viajaban todas por `opts` (doFetch, ctx,
// ejecutarHerramienta): mover la orquesta sin tocar una nota.
//
// La lógica VERIFICABLE (ensamblado SSE, guardia de repetición, truncamiento,
// presupuesto con obra) sigue en `src/engine/cicloHerramientasOpenAICompat.ts`
// — pura, testeable sin API. Este archivo es solo la parte con red.
// ============================================================
import { StreamContext } from "./streamContext";
// v1.88.1 · el ✗ con motivo y el corte por fallos repetidos de la MISMA herramienta
// (args válidos + resultado siempre fallido = bucle «pensando», sesión 1793231473406).
import {
  nuevoVigilanteFallos, vigilarFallo, motivoDeResultado,
  directivaPorFallos, cierrePorFallos, UMBRAL_CORTE_FALLOS,
} from "../src/engine/vigilanteDeFallos";
// v1.74.0 · AUTOAPRENDIZAJE EN TIEMPO REAL (suite): la pareja fallo→éxito de
// cada herramienta se anota como lección en el acto, también en la nube.
import { notificarFalloHerramienta, notificarExitoTrasFallo } from "./aprendizajeVivo";
import { abrirTurnoPropuestas, notificarFalloRecurrente } from "./propuestasAutonomas";
import {
  MAX_REEMPUJES_ANUNCIO,
  motivoDeParada,
  directivaDeReanudacion,
  cierreIntencionSinEjecutar,
} from "../src/engine/bucleAutonomo";
import {
  acumularToolCallsDelta,
  finalizarToolCalls,
  parsearArgsHerramienta,
  construirMensajeAsistenteConTools,
  construirMensajeRespuestaTool,
  extraerDatosDeLineaSSE,
  parsearArgsConEstado,
  anotarRepeticion,
  REPETICION_SIN_VER,
  UMBRAL_REPETICION,
  TOPE_INTERVENCIONES,
  esHerramientaDeObra,
  // v1.0.14 · la ejecución sana (pc_exec/exec/run_command) también compra pasos.
  esHerramientaDeEjecucion,
  techoPasosConObra,
  // v1.66.1 · el paso también se paga con LECTURA sana (ver techoPasosConProgreso).
  techoPasosConProgreso,
  DIRECTIVA_TRUNCAMIENTO,
  directivaRepeticion,
  cierrePorLazoAgotado,
  // v1.60.17 — circuito de reescritura idéntica (corta el giro del Quirófano).
  TOPE_REESCRITURA_IDENTICA,
  esRechazoReescrituraIdentica,
  cierrePorReescrituraIdentica,
  // v1.57.10 — vigilante de fallos de argumentos.
  nuevoVigilanteArgs,
  registrarFalloArgs,
  DIRECTIVA_SIN_HERRAMIENTAS,
  UMBRAL_SIN_HERRAMIENTAS,
  // v1.58.2 — captura de tool-calls emitidas como TEXTO (modelos sin
  // function-calling nativo, p. ej. openrouter/free).
  extraerLlamadasEnTexto,
  // v1.67.1 — el chat deja de ser la mesa de trabajo (raíz:línea 388 en vivo / 410 tirando textoLimpio).
  crearFiltroDeVallas,
  normalizarArgsAlias,
  construirDirectivaResultadosTextuales,
  // v1.58.4 — B3 entrega incremental + B4 gate de auto-revisión.
  DIRECTIVA_ENTREGA_INCREMENTAL,
  tareaPareceGrande,
  revisarObraEscrita,
  directivaAutorrevision,
  // v1.67.0 · ÍTEM 1.2 — la web entregada de molde (detector escrito en v1.66.0
  // y nunca llamado). Va en el MISMO embudo B4, no en el monolito: trinquete.
  revisarPlantillaWeb,
  MAX_AUTORREVISION,
  type AcumuladorToolCall,
  type EstadoRepeticion,
} from "../src/engine/cicloHerramientasOpenAICompat";
// v1.59.1 — GATE DE CIERRE unificado: cablea los modulos de certeza que hasta
// ahora eran huerfanos (auditoriaBucle, autorrevision, autocorrector,
// matrizVerificacion, grafoDependencias, motorContexto, memoriaEstrategias,
// extraerFirmas). evaluarCierre() los compone en una segunda capa de senal que
// complementa (no reemplaza) el gate propietario revisarObraEscrita.
import { evaluarCierre } from "../src/engine/gateCierre";
// v1.66.1 · LOS DOS MÓDULOS QUE v1.66.0 ESCRIBIÓ Y NUNCA LLAMÓ.
// `continuidadTurno` (BUG D: «el modelo anuncia y corta») y `contextoBucle`
// (detector de ciclos QUE SOBREVIVE a los turnos) tienen su test en verde y su
// comentario, pero ningún import: el ciclo estaba cortando el turno en «voy a…»
// exactamente igual que antes. El changelog lo decía él solo —«queda WIRING
// pendiente de cablear en server.ts en tu entorno»— y acá está ese cable.
//
// `contextoBucle` es el grave: ya estaba enganchado en los DOS bucles que quedaron
// dentro de server.ts (`runOllamaAgentLoop` y el de Gemini). Este ciclo se había
// mudado a su propio módulo en v1.57.9, y cuando llegó la funcionalidad de v1.64
// se le puso el detector a los bucles que estaban a mano. Los nueve proveedores
// que pasan por acá —OpenRouter, custom, Z.ai, Groq, Cerebras, Together, Mistral,
// DeepSeek, Fireworks— se quedaron sin memoria entre turnos. Justo Z.ai es el que
// la sesión del 23/10 denuncia: «z ai no contesto hoy, se cortaba pensando en la
// tarea». Sin `turnosEnBucle`, cada «sigue» nacía con el contador a cero y el
// mismo ciclo de siempre parecía la primera vez.
import {
  nuevoContextoBucle,
  abrirTurnoBucle,
  registrarPaso,
  evaluarContextoBucle,
  type EstadoContextoBucle,
} from "../src/engine/contextoBucle";
import { evaluarContinuidad } from "../src/engine/continuidadTurno";
import { contextoBucleSesion } from "../src/engine/contextoBucleSesion"; // v1.66.1 · memoria compartida con los bucles de Ollama y Gemini
// v1.69.0 · TURNO = CONTRATO EN LA NUBE (pedido de Mario, 24/10): el juez local
// ya consultaba el contrato de aceptación antes de cerrar (decidirBucle). Las
// once ramas OpenAI-compat no: el plan del modelo no llegaba al Planificador,
// las etapas no se tachaban y el turno se cortaba con etapas colgando. Acá
// viajan las tres piezas: espejo vivo (hoja del panel), contrato (criterios con
// evidencia) y la continuidad de plan con tope propio.
import {
  abrirTurnoVivo, cerrarTurnoVivo, empezarPasoVivo, terminarPasoVivo,
  declararPlanVivo, marcarTareaVivo, anotarVivo, hojaEnCurso, objetivoDesdeMensajes,
  publicarPlanDePalabras,
} from "../src/engine/espejoVivo";
import {
  registrarContratoDesdeTareas, estadoContrato, directivaDeContratoAbierto,
} from "../src/engine/planAdaptativo";
import { notaContinuidad, registrarPlanTurno, directivaDePlanPendiente, MAX_CONTINUIDAD_PLAN } from "./continuidadPlan";
import { actualizarPlanDesdeHerramienta, tareasPendientes, type TareaPlan } from "../src/engine/bucleAutonomo";
// v1.70.2 · LOS ESPEJOS ENTTRAN AL BUCLE (diagnóstico de la sesión exportada
// del 24/10, mensaje 17: «los espejos existen pero no se usan»). El modelo ya
// los ve en el system prompt cuando hay equipo activo, pero un modelo que
// narra sin ejecutar NO los llama: el re-empuje era la única voz del motor y
// nunca les nombraba. Esta nota se añade SOLO si el equipo está elegido y el
// turno todavía no llamó a `consultar_espejo` — un empujón con nombre y
// apellido, no un catálogo genérico.
import { notaEspejosDeEmpuje } from "../src/engine/reflejo/espejos"; // fuente única: la rama Gemini del monolito importa la MISMA función
/** Cuántas veces se le exige al modelo que ejecute lo que anunció. Acotado: no es bucle. */
export const MAX_CONTINUIDAD = 2;
import { hashArgsCanonico } from "../src/engine/hashArgs";
import type { InvocacionHerramienta } from "../src/auditoriaBucle";
// v1.60.0 — DOBLE ÁRBOL: el ciclo lleva su gestor de proyecciones (entrada vs
//   sandbox) y aplica el guardián de escritura ANTES de dispatch a disco, para
//   que el motor no pise material del usuario que no se promovió al sandbox.
import { GestorArboles, validarPermisoEscrituraSandbox, validarPermisoLecturaSandbox } from "../src/gestorArboles";
import type { OrigenArchivo } from "../src/types/arboles";

/**
 * v1.69.0 · LA HOJA VIVA TAMBIÉN EN LA NUBE.
 * El bucle local abre su hoja con el mismo patrón (`runOllamaAgentLoop` en
 * server.ts): abrir → trabajar → cerrar SIEMPRE. Hasta acá, las ramas de nube
 * ejecutaban herramientas sin hoja: el Planificador no encendía, el paso no se
 * veía, y al cerrar el turno no había acta. El wrapper abre solo si no hay otra
 * hoja en curso (Gemini/Ollama pueden tenerla) y cierra en `finally` — ninguna
 * salida del ciclo, por errática que sea, deja una hoja huérfana pulsando.
 */
export async function ejecutarCicloHerramientasOpenAICompat(opts: OptsCiclo): Promise<ResultadoCiclo> {
  const abrioAca = !hojaEnCurso();
  if (abrioAca) {
    try { abrirTurnoVivo(objetivoDesdeMensajes(opts.mensajes)); } catch { /* espejo auxiliar: nunca frena el turno */ }
  }
  try {
    return await cicloHerramientasOpenAICompatInterno(opts);
  } finally {
    if (abrioAca) { try { cerrarTurnoVivo(); } catch { /* idem */ } }
  }
}
type OptsCiclo = Parameters<typeof cicloHerramientasOpenAICompatInterno>[0];
type ResultadoCiclo = Awaited<ReturnType<typeof cicloHerramientasOpenAICompatInterno>>;

async function cicloHerramientasOpenAICompatInterno(opts: {
  doFetch: (cuerpo: any) => Promise<any>;
  cuerpoBase: Record<string, any>;
  mensajes: any[];
  herramientas: any[];
  ejecutarHerramienta: (nombre: string, args: any) => Promise<string>;
  ctx: StreamContext;
  maxPasos?: number;
  // v1.58.2 — nombres de herramienta válidos (para parsear llamadas textuales
  // aunque al modelo no se le ofrezcan tools por el canal nativo). Opcional:
  // si falta, se derivan de `herramientas`.
  nombresHerramientas?: string[];
  /**
   * v1.66.1 — memoria del detector de ciclos. El llamador pasa el singleton de
   * sesión (`contextoBucleSesion` en server.ts) para que el ciclo sobrevivido
   * cuente también a través de los «sigue». Si no se pasa, se usa uno propio:
   * el ciclo pierde la memoria entre turnos pero conserva la detección interna,
   * que ya es más de lo que había hasta acá.
   */
  contextoBucle?: EstadoContextoBucle;
}): Promise<{ ok: boolean; emittedAny: boolean; failReason?: string }> {
  const { doFetch, cuerpoBase, mensajes, herramientas, ejecutarHerramienta, ctx } = opts;
  // v1.58.2 — conjunto de nombres VÁLIDOS para reconocer tool-calls escritas
  // en el texto. Si el llamador no pasa `nombresHerramientas`, se derivan de
  // las propias `herramientas` ofrecidas (OpenAI tool spec).
  const nombresValidos = new Set<string>(
    (opts.nombresHerramientas && opts.nombresHerramientas.length
      ? opts.nombresHerramientas
      : (Array.isArray(herramientas) ? herramientas : []).map(
          (h: any) => h?.function?.name || h?.name
        )
    )
      .filter((n: any) => typeof n === "string" && n.trim())
      .map((n: string) => n.trim().toLowerCase())
  );
  // v1.57.9 — la base era 8 pasos y NO crecía: una tarea de 12 archivos moría
  // al paso 8 con la escritura a mitad («se queda a mitad de la tarea», sesión
  // 14/10). Ahora cada escritura que sale bien compra 2 pasos más.
  // v1.0.14 · base 12→24 y tope 36→96 (en el módulo puro): la sesión
  // 1794293050619 muestra turnos cortados a los 12 pasos ≈ 3 minutos con obra
  // SANITA en marcha («antes trabajaba más de 20 minutos», Mario 10/11).
  let maxPasos = Math.max(4, opts.maxPasos ?? 24);
  let escriturasOk = 0;
  // v1.66.1 — PROGRESO DE LECTURA: llamadas sanas y DISTINTAS que no escribieron
  // nada pero aportaron información. Es lo que compra pasos extra en un reporte,
  // un diagnóstico o una revisión (cero escrituras, mucho trabajo).
  let lecturasNuevasOk = 0;
  // v1.0.14 — contador de EJECUCIONES sanas y distintas (pc_exec etc.): work real
  // de test-and-fix que antes no compraba ni un paso (ver techoPasosConProgreso).
  let ejecucionesOk = 0;
  const clavesYaVistas = new Set<string>();
  // v1.66.1 — DETECTOR DE CICLOS CON MEMORIA (ver el import de contextoBucle).
  const bucle: EstadoContextoBucle = opts.contextoBucle ?? contextoBucleSesion;
  abrirTurnoBucle(bucle);
  abrirTurnoPropuestas(); // v1.76.0 · auto-propuesta: el contador de patrones abre turno también en la nube
  let avisoBucle = "";      // ciclo detectado → se INYECTA como mensaje de usuario
  let lazoBucle = "";       // el ciclo ya es terco → se cierra el turno con la verdad
  let continuidades = 0;    // v1.66.1 — cupo de «ejecutá lo que anunciaste»
  const tieneHerramientas = Array.isArray(herramientas) && herramientas.length > 0;
  let emittedAny = false;
  let huboToolExec = false;
  let reempujes = 0; // v1.55.1 — presupuesto de re-empujes/turno (anuncio sin acción): escala y topa
  let espejoInvocado = false; // v1.70.2 — ¿el modelo llamó espejos en este turno? (para no repetir el consejo)
  // v1.58.4 — CONTINUACIÓN POR CORTE DE TOKENS con presupuesto PROPIO. Antes el
  //   corte real (finish_reason:"length") gastaba el MISMO cupo que el anti-«voy
  //   a…», así que una respuesta larga y legítima se quedaba sin reintentos de
  //   continuación y moría a la mitad (queja de Mario: «se corta y se pierde
  //   todo»). Un corte declarado por el proveedor NO es un anuncio vacío: merece
  //   su propio cupo, más alto.
  const MAX_CONTINUACIONES_CORTE = 6;
  let continuacionesCorte = 0;
  // v1.57.9 — GUARDIA DEL LAZO (antes no existía aquí: el único freno era
  // quedarse sin pasos) y CACHE de salidas para no re-ejecutar la misma llamada.
  let guardia: EstadoRepeticion = { ...REPETICION_SIN_VER };
  let intervenciones = 0;
  const salidaPorClave = new Map<string, string>();
  let lazoAgotado = "";
  // v1.60.17 — CIRCUITO DE REESCRITURA IDÉNTICA: cuenta los rechazos
  //   «REESCRITURA IDÉNTICA» del Quirófano en CUALQUIER archivo del turno. El
  //   lazo suave (clave consecutiva) no los caza cuando el modelo rota entre
  //   varios archivos; este contador por turno sí, y corta el giro.
  let reescriturasIdenticas = 0;
  const rutasReescritasIdenticas: string[] = [];
  let cortePorReescritura = false;
  // v1.88.1 · vigilancia de fallos repetidos: args válidos y mismo fallo no es
  // reintentar, es trabarse (captura: 6 ✗ de write_file, 6 min, CPU 100 %).
  const vigilanteFallos = nuevoVigilanteFallos();
  let cortePorFallos: string | null = null;
  let motivoCorteFallos = "";
  const vigilante = nuevoVigilanteArgs(); // v1.57.10
  let hayDirectivaArgs = false;
  let pendientesAlCorte: string[] = []; // herramientas que el modelo pedía al agotarse los pasos
  // v1.58.4 — B3: el protocolo de entrega incremental se inyecta UNA sola vez,
  //   cuando la tarea ya dio señales de ser grande (no grava tareas pequeñas).
  let protocoloEntregaInyectado = false;
  // v1.58.4 — B4: estado FINAL por archivo escrito este turno (path -> contenido)
  //   y presupuesto acotado de auto-revisiones para no cerrar sobre obra a medias.
  const escritosTurno = new Map<string, string>();
  // ── v1.69.0 · TURNO = CONTRATO, TAMBIÉN EN LA NUBE ──
  // El plan que el modelo escribe con `set_plan` vive acá durante el turno:
  // sus etapas sin tachar son las que deciden que el turno NO cierre.
  const planTurno: TareaPlan[] = [];
  let planTocadoEsteTurno = false;
  let continuidadesPlan = 0;
  {
    // B1.2 en la nube: «el plan no se reinicia cada mensaje». El plan anterior
    // con pendientes entra como nota de sistema ANTES de la primera llamada.
    const notaPrev = notaContinuidad();
    if (notaPrev) mensajes.push({ role: "system", content: notaPrev });
  }
  /**
   * v1.69.0 · El espejo que el bucle local ya hacía y la nube no: cada
   * herramienta pisa su paso en la hoja viva (actividad visible en el
   * Planificador) y `set_plan`/`update_task` alimentan hoja + contrato de
   * aceptación + los eventos que el navegador escucha. Tolerante a fallos: el
   * planificador es auxiliar — nada de acá puede cortar un turno que funciona.
   */
  const espejarEnPlanificador = (nombre: string, args: any, ok: boolean, motivo?: string): void => {
    const n = String(nombre || "").toLowerCase();
    const detalle =
      args?.path ? String(args.path)
      : args?.command ? String(args.command).slice(0, 80)
      : args?.content ? `(${String(args.content).length} bytes)`
      : "";
    // v1.74.0 · igual que en el lazo local: el éxito que llega DESPUÉS de un
    // fallo de la misma herramienta es el momento exacto en que la nube
    // aprendió algo — se anota ya (LECCIONES.md + KB + espejo), no al cerrar.
    try {
      if (ok) notificarExitoTrasFallo(n, detalle || undefined);
      else {
        notificarFalloHerramienta(n, detalle ? `con ${detalle.slice(0, 90)}` : "sin detalle");
        // v1.76.0 · mismo hecho al contador de patrones (auto_propose): en la
        // nube la evidencia disponible es el argumento de la herramienta; un
        // path repetido tres turnos seguidos es exactamente el patrón «ruta».
        notificarFalloRecurrente(n, detalle || "sin detalle");
      }
    } catch { /* aprender nunca corta un turno que funciona */ }
    try {
      empezarPasoVivo(n, detalle);
      // v1.88.1 · el ✗ dice POR QUÉ: el motivo real de la herramienta reemplaza
      // al síntoma genérico, tanto en la hoja viva como en el panel de acciones.
      const motivoVisible = ok ? null : (motivo || motivoDeResultado(""));
      terminarPasoVivo(ok, motivoVisible);
      ctx.sendTaskEvent({ type: "action", action: { tool: n, detail: detalle, ok, motivo: motivoVisible } } as any);
    } catch { /* hoja cerrada a mitad de turno: no hay espejo que escribir */ }
    if (n === "set_plan" && Array.isArray(args?.tasks)) {
      try {
        declararPlanVivo(args.tasks);
        registrarContratoDesdeTareas(args.tasks);
        actualizarPlanDesdeHerramienta(planTurno, n, args);
        planTocadoEsteTurno = true;
        registrarPlanTurno(planTurno);
        ctx.sendTaskEvent({
          type: "plan",
          tasks: planTurno.map((t) => ({ id: t.id, description: t.description, status: t.status })),
        } as any);
      } catch { /* idem */ }
    } else if (n === "update_task") {
      try {
        const tid = String(args?.task_id || args?.taskId || "");
        // `marcarTareaVivo` ya sincroniza adentro el contrato de aceptación
        // (actualizarEstadoContrato + registrarEvidenciaContrato): llamarlos
        // también acá duplicaría la evidencia. Mismo cable que el bucle local.
        marcarTareaVivo(tid, args?.status, Date.now(), args?.evidencia);
        actualizarPlanDesdeHerramienta(planTurno, n, args);
        planTocadoEsteTurno = true;
        registrarPlanTurno(planTurno);
        ctx.sendTaskEvent({ type: "update", taskId: tid, status: args?.status } as any);
      } catch { /* idem */ }
    }
  };
  // v1.60.0 — DOBLE ÁRBOL: proyección de entrada/sandbox viva durante el turno.
  //   ingresar_archivo_workspace / promover_archivo_sandbox son bookkeeping puro
  //   (no tocan disco): se resuelven aquí sin llamar a ejecutarHerramienta. Las
  //   herramientas de obra pasan primero por el guardián; si la ruta no estaba
  //   registrada, se da de alta como sandbox_target (ya es parte de la obra).
  const gestorArboles = new GestorArboles();
  const ESCRITURAS_SANDBOX = new Set(["write_file", "edit_file", "append_file", "delete_file"]);
  const LECTURAS_SANDBOX = new Set(["read_file", "read_file_range"]);
  /**
   * Intercepta las herramientas del doble árbol. Devuelve un string de salida
   * (JSON) cuando la herramienta se resuelve/bloquea aquí, o `null` para dejar
   * que el dispatch normal a disco continúe.
   */
  function interceptarArboles(nombre: string, args: any): string | null {
    const n = String(nombre || "").toLowerCase();
    const path = typeof args?.path === "string" ? args.path : "";
    if (n === "ingresar_archivo_workspace") {
      const origen = (args?.origen as OrigenArchivo) || "chat_drop";
      try {
        const nodo = gestorArboles.registrarArchivoEntrada({
          pathRelativo: path,
          contenido: typeof args?.content === "string" ? args.content : "",
          origen,
        });
        return JSON.stringify({
          ok: true,
          arbol: nodo.incluidoEnSandbox ? "sandbox" : "entrada",
          path: nodo.pathRelativo,
          mensaje: nodo.incluidoEnSandbox
            ? "Registrado y promovido al sandbox (origen sandbox_target)."
            : "Registrado en el árbol de entrada (fuera del sandbox hasta promover).",
        });
      } catch (e: any) {
        return JSON.stringify({ ok: false, error: String(e?.message || e) });
      }
    }
    if (n === "promover_archivo_sandbox") {
      if (!gestorArboles.existe(path)) {
        return JSON.stringify({
          ok: false,
          error: `La ruta "${path}" no está en el árbol de entrada: ingésala antes con ingresar_archivo_workspace.`,
        });
      }
      const cambio = gestorArboles.promoverASandbox(path);
      return JSON.stringify({ ok: true, promovido: cambio, path, mensaje: cambio ? "Promovido al sandbox." : "Ya estaba en el sandbox." });
    }
    if (ESCRITURAS_SANDBOX.has(n) && path) {
      const permiso = validarPermisoEscrituraSandbox(gestorArboles, path);
      if (!permiso.permitido) {
        return JSON.stringify({ ok: false, error: permiso.motivo });
      }
      // Ruta permitida: si aún no estaba registrada, es obra nueva -> alta como
      // sandbox_target para que el guardián sea coherente en escrituras futuras.
      if (!gestorArboles.existe(path) && n !== "delete_file") {
        gestorArboles.registrarArchivoEntrada({
          pathRelativo: path,
          contenido: typeof args?.content === "string" ? args.content : "",
          origen: "sandbox_target",
        });
      }
    }
    if (LECTURAS_SANDBOX.has(n) && path) {
      // v1.60.3 — el aislamiento también cubre la LECTURA: no se carga a contexto
      //   material de entrada no promovido. Rutas nuevas/sandbox pasan.
      const permiso = validarPermisoLecturaSandbox(gestorArboles, path);
      if (!permiso.permitido) {
        return JSON.stringify({ ok: false, error: permiso.motivo });
      }
    }
    return null;
  }
  let autorrevisiones = 0;
  // v1.59.1 — historial de invocaciones (tool + hash canonico de args) para el
  //   cortafuegos de bucle del gate de cierre (ciclos A-B-A-B y saturacion).
  const historialHerramientas: InvocacionHerramienta[] = [];
  // v1.47.0 — Resumen de acciones: para que «Herramientas ejecutadas» deje de ser
  // un mensaje vacío y diga QUÉ se hizo (archivos escritos, comandos, etc.).
  const accionesHechas: string[] = [];
  const resumirAcciones = (): string => {
    if (accionesHechas.length === 0) return "";
    const vistos = accionesHechas.slice(-8);
    const mas = accionesHechas.length - vistos.length;
    return `\n` + vistos.map((a) => `  • ${a}`).join("\n") + (mas > 0 ? `\n  • …y ${mas} acción(es) más` : "");
  };
  // v1.57.9 — aviso de obra pendiente: se emite UNA sola vez, por el camino de
  // retorno que se cierre (final dentro del paso o agotados los pasos).
  let obraPendienteAvisada = false;
  const avisarObraPendiente = () => {
    if (obraPendienteAvisada || pendientesAlCorte.length === 0) return;
    obraPendienteAvisada = true;
    ctx.sendChunk(
      `\n\n⏳ Quedaban acciones pendientes (${pendientesAlCorte.join(", ")}) cuando se agotó el presupuesto de pasos del turno. Pídeme «sigue» y continúo por donde iba.`
    );
  };
  // v1.69.0 · CIERRE HONESTO DEL PLAN: agotadas las auto-preguntas sin que el
  // modelo tachara las etapas, el turno se cierra DICIENTO qué etapas quedan
  // abiertas — «parcial», jamás «Hecho». El turno coincide con la entrega.
  let planPendienteAvisado = false;
  const planEtapasAbiertas = (): TareaPlan[] => (planTocadoEsteTurno ? tareasPendientes(planTurno) : []);
  const avisarPlanSinCerrar = (): void => {
    if (planPendienteAvisado) return;
    planPendienteAvisado = true;
    const pend = planEtapasAbiertas();
    if (pend.length === 0) return;
    ctx.sendChunk(
      `\n\n⚠️ EL PLAN NO QUEDÓ CERRADO — ${pend.length} etapa(s) sin tachar en el Planificador:\n` +
      pend.map((t) => `  [ ] #${t.id} ${t.description}`).join("\n") +
      `\nDecí «seguí» y sigo por donde iba (el plan persiste), o pedime que lo reencuadre.`
    );
  };
  /**
   * v1.66.1 · LIBRO DE PASOS, UNA SOLA VEZ POR RAMA.
   * Antes el registro vivía duplicado en server.ts (bucle Ollama) y en la rama
   * Gemini; acá no existía. Apunta el paso al detector de ciclos y, si la
   * llamada es sanA y NUNCA se había hecho, le compra un paso más al turno.
   * `esHerramientaDeObra` reinicia la secuencia (avanzó de verdad): es el mismo
   * control de falso positivo que ya usaban los otros dos bucles.
   */
  const anotarPaso = (nombre: string, argsCrudo: string, ok: boolean): void => {
    registrarPaso(bucle, `${nombre}\u0000${argsCrudo || ""}`, ok && esHerramientaDeObra(nombre));
    const vb = evaluarContextoBucle(bucle);
    if (vb.mensaje) {
      avisoBucle = vb.mensaje;
      console.log(`[bucle] 🔁 ciclo visible: ${vb.ciclo?.repeticiones}ª vuelta de un ciclo de ${vb.ciclo?.periodo} paso(s)`);
    }
    if (vb.debeCortar) {
      lazoBucle = (vb.ciclo?.patron || []).map((t) => String(t).split("\u0000")[0]).join(" → ");
    }
    const clave = `${nombre}:${argsCrudo || ""}`;
    if (ok && !esHerramientaDeObra(nombre) && !clavesYaVistas.has(clave)) {
      clavesYaVistas.add(clave);
      if (esHerramientaDeEjecucion(nombre)) ejecucionesOk++;
      else lecturasNuevasOk++;
      maxPasos = Math.max(maxPasos, techoPasosConProgreso(escriturasOk, lecturasNuevasOk, ejecucionesOk));
    }
  };

  for (let paso = 0; paso <= maxPasos; paso++) {
    if (ctx.isAborted()) return { ok: true, emittedAny };

    // v1.58.4 — B3: en cuanto la tarea da señales de ser grande (≥2 escrituras
    //   o un corte por tokens ya ocurrido), se inyecta UNA vez el protocolo de
    //   entrega incremental, para que el modelo entregue por partes completas y
    //   un corte sólo pierda la parte en curso — nunca lo ya escrito.
    if (
      !protocoloEntregaInyectado &&
      tieneHerramientas &&
      tareaPareceGrande(escriturasOk, continuacionesCorte)
    ) {
      protocoloEntregaInyectado = true;
      mensajes.push({ role: "user", content: DIRECTIVA_ENTREGA_INCREMENTAL });
      console.log(`[bucle] B3 entrega incremental activada (escriturasOk=${escriturasOk}, cortes=${continuacionesCorte})`);
    }

    const cuerpo: any = { ...cuerpoBase, messages: mensajes, stream: true };
    // v1.57.10 — con 3 fallos de ARGUMENTOS seguidos el problema es del modelo
    // con el formato: se le retiran las herramientas y cierra en texto honesto.
    if (tieneHerramientas && vigilante.seguidos < UMBRAL_SIN_HERRAMIENTAS) {
      cuerpo.tools = herramientas;
      cuerpo.tool_choice = "auto";
    }

    let resp: any;
    try {
      resp = await doFetch(cuerpo);
    } catch (e: any) {
      return { ok: false, emittedAny, failReason: e?.message || String(e) };
    }

    // HTTP no-OK: construimos un failReason legible (igual que las ramas v1.43).
    if (!resp || !resp.ok || !resp.body) {
      let errBody = "";
      try { errBody = await resp.text(); } catch {}
      let msg = `HTTP ${resp?.status ?? "???"}`;
      try {
        const j = JSON.parse(errBody);
        if (j?.error?.message) msg = j.error.message;
        else if (j?.error) msg = String(j.error);
        else if (j?.message) msg = j.message;
      } catch {}
      const extra = errBody && !msg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "";
      // v1.75.0 · BUG MEDIDO (sesión 1792979455736): OpenRouter rechazaba
      // SIEMPRE el pedido con «This request requires more credits… You
      // requested up to 131072 tokens, but can only afford 14303» — el chip
      // Presupuesto pide 131k y la clave gratis no llega: el turno moría sin
      // intento. Ahora el ciclo LEE el número que el propio proveedor dicta y
      // re-marca UNA vez con ese tope (menos un margen) antes de rendirse.
      const afford = /can only afford\s+(\d+)/i.exec(msg + extra);
      let reintentoPresupuesto = false;
      if (afford && !emittedAny && !ctx.isAborted()) {
        const pedido = Number(cuerpo.max_tokens || 0);
        const tope = Math.max(256, Math.min(Number(afford[1]) - 256, pedido > 0 ? pedido : 8192));
        if (Number.isFinite(tope) && (pedido <= 0 || tope < pedido)) {
          cuerpo.max_tokens = tope;
          try {
            const resp2 = await doFetch(cuerpo);
            if (resp2 && resp2.ok && resp2.body) {
              reintentoPresupuesto = true;
              resp = resp2;
            }
          } catch { /* se rinde abajo, con el error original */ }
        }
      }
      if (!reintentoPresupuesto) {
        return { ok: false, emittedAny, failReason: msg + extra };
      }
    }

    // Lectura del stream SSE: texto en vivo + ensamblado de tool_calls.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sseBuf = "";
    let textoTurno = "";
    // v1.67.1 — retiene las vallas de herramienta mientras se forman, para que no
    // se escriban en el chat. Es POR PASO: cada paso forma su propia salida.
    const filtroChat = crearFiltroDeVallas(nombresValidos);
    // v1.57.9 — «length» significa que el PROVEEDOR cortó por su tope de
    // tokens: la frase quedó a medias o los arguments incompletos. Antes este
    // dato viajaba en el stream y nadie lo leía nunca.
    let finishPaso = "";
    const accTool = new Map<number, AcumuladorToolCall>();
    try {
      while (true) {
        if (ctx.isAborted()) break;
        const { done, value } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const lineas = sseBuf.split("\n");
        sseBuf = lineas.pop() || "";
        for (const linea of lineas) {
          const data = extraerDatosDeLineaSSE(linea);
          if (!data) continue;
          const fr = data.choices?.[0]?.finish_reason;
          if (fr) finishPaso = String(fr);
          const delta = data.choices?.[0]?.delta;
          const contenido = delta?.content;
          if (contenido) {
            // v1.67.1 — antes: `ctx.sendChunk(contenido)` a secas, o sea cada
            // carácter del modelo escrito en el chat en cuanto nacía, vallas de
            // herramienta incluidas. El filtro decide al cerrar la valla, y `textoTurno`
            // sigue recibiendo TODO (la extracción de llamadas no se entera de esto).
            const visible = filtroChat.escribir(contenido);
            if (visible) ctx.sendChunk(visible);
            textoTurno += contenido;
            emittedAny = true;
          }
          if (tieneHerramientas) acumularToolCallsDelta(accTool, delta?.tool_calls);
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
    }

    if (ctx.isAborted()) return { ok: true, emittedAny };

    let llamadas = tieneHerramientas ? finalizarToolCalls(accTool) : [];

    // v1.58.2 — FALLBACK DE TOOL-CALLS TEXTUALES: si el modelo NO usó el canal
    // nativo (`delta.tool_calls` vacío) pero escribió la llamada en el texto
    // (openrouter/free y compañía), la capturamos y la ejecutamos de verdad.
    // Esta es la cura del «no tienes acceso al editor/sandbox»: antes la
    // llamada se perdía como prosa y la herramienta jamás corría.
    let fueronTextuales = false;
    if (llamadas.length === 0 && nombresValidos.size > 0 && textoTurno.trim()) {
      const extra = extraerLlamadasEnTexto(textoTurno, nombresValidos);
      if (extra.llamadas.length > 0) {
        llamadas = extra.llamadas;
        fueronTextuales = true;
      }
    }

    // v1.67.1 — se libera lo retenido SÓLO si el turno no convirtió nada en acción.
    // Si salió una llamada, esa valla ya se está ejecutando en la mesa de trabajo y
    // no debe verse en el chat; si no salió ninguna, era prosa o código del sitio, y
    // se muestra tal cual. Ninguna respuesta se puede perder por este filtro.
    const restoChat = filtroChat.cerrar(llamadas.length > 0);
    if (restoChat) ctx.sendChunk(restoChat);

    if (llamadas.length > 0 && paso >= maxPasos) pendientesAlCorte = llamadas.map((l) => l.name);

    // v1.58.2 — rama TEXTUAL: el modelo habla texto, no el protocolo role:tool.
    // Ejecutamos sus llamadas y le devolvemos los resultados en PROSA (user),
    // nunca con tool_calls+role:tool que no sabe consumir.
    if (fueronTextuales && llamadas.length > 0 && paso < maxPasos) {
      mensajes.push({ role: "assistant", content: textoTurno });
      const resultadosTxt: Array<{ nombre: string; salida: string }> = [];
      for (const l of llamadas) {
        const clave = `${l.name}:${l.arguments || ""}`;
        guardia = anotarRepeticion(guardia, clave);
        historialHerramientas.push({ toolName: l.name, argsHash: hashArgsCanonico(l.arguments) });
        if (guardia.veces >= UMBRAL_REPETICION) {
          intervenciones++;
          if (intervenciones > TOPE_INTERVENCIONES) { lazoAgotado = l.name; break; }
          resultadosTxt.push({ nombre: l.name, salida: directivaRepeticion(l.name, guardia.veces, salidaPorClave.get(clave) || "") });
          continue;
        }
        const estado = parsearArgsConEstado(l.arguments);
        if (!estado.ok && estado.truncado) {
          resultadosTxt.push({ nombre: l.name, salida: DIRECTIVA_TRUNCAMIENTO });
          accionesHechas.push(`✂️ ${l.name} — argumentos truncados, dividido en partes`);
          continue;
        }
        let crudo: string;
        try {
          const argsTxt = normalizarArgsAlias(estado.ok ? estado.args : parsearArgsHerramienta(l.arguments));
          const bloqueo = interceptarArboles(l.name, argsTxt);
          crudo = bloqueo !== null ? bloqueo : await ejecutarHerramienta(l.name, argsTxt);
        } catch (e: any) {
          crudo = JSON.stringify({ ok: false, error: String(e?.message || e) });
        }
        huboToolExec = true;
        salidaPorClave.set(clave, crudo);
        resultadosTxt.push({ nombre: l.name, salida: crudo });
        if (esRechazoReescrituraIdentica(crudo)) {
          reescriturasIdenticas++;
          const rr = normalizarArgsAlias(estado.ok ? estado.args : parsearArgsHerramienta(l.arguments))?.path;
          if (rr) rutasReescritasIdenticas.push(String(rr));
          if (reescriturasIdenticas >= TOPE_REESCRITURA_IDENTICA) { cortePorReescritura = true; break; }
        }
        try {
          const a = normalizarArgsAlias(estado.ok ? estado.args : parsearArgsHerramienta(l.arguments)) || {};
          const obj = a.path || a.command || a.query || a.name || a.task_id || "";
          let ok = true;
          try { ok = JSON.parse(crudo)?.ok !== false; } catch {}
          accionesHechas.push(`${ok ? "✔" : "✖"} ${l.name}${obj ? ` — ${String(obj).slice(0, 80)}` : ""}`);
          anotarPaso(l.name, l.arguments || "", ok); // v1.66.1 · la rama textual también escribe el libro de pasos
          // v1.88.1 · el ✗ lleva el motivo real de la herramienta, y el mismo
          // fallo repetido deja de ser reintentar: a los 3 se le avisa al modelo,
          // a los 5 se corta el turno (captura: 6 ✗ de write_file, 6 min, 100 % CPU).
          const motivoFallo = ok ? "" : motivoDeResultado(crudo);
          espejarEnPlanificador(l.name, a, ok, motivoFallo); // v1.69.0 · la nube también pisa el Planificador
          {
            const vig = vigilarFallo(vigilanteFallos, l.name, ok, motivoFallo);
            if (vig.justoAviso) mensajes.push({ role: "user", content: directivaPorFallos(vig.herramienta, vig.seguidos, motivoFallo) });
            if (vig.corto) { cortePorFallos = vig.herramienta; motivoCorteFallos = motivoFallo; }
          }
          if (ok && esHerramientaDeObra(l.name)) {
            escriturasOk++;
            maxPasos = Math.max(maxPasos, techoPasosConProgreso(escriturasOk, lecturasNuevasOk, ejecucionesOk));
            // v1.58.4 — B4: guarda el estado FINAL del archivo (args ya
            //   normalizados: ruta->path, contenido->content).
            if (typeof a.path === "string" && a.path.trim() && typeof a.content === "string") {
              escritosTurno.set(a.path, a.content);
            }
          }
        } catch { accionesHechas.push(`✔ ${l.name}`); }
      }
      if (resultadosTxt.length > 0) {
        mensajes.push({ role: "user", content: construirDirectivaResultadosTextuales(resultadosTxt) });
      }
      // v1.66.1 — el ciclo detectado se inyecta DESPUÉS de los resultados (nunca
      // en medio: el transcript textual es frágil) y antes de la nueva vuelta.
      if (avisoBucle) { mensajes.push({ role: "user", content: avisoBucle }); avisoBucle = ""; }
      if (cortePorReescritura) break;
      if (cortePorFallos) break; // v1.88.1 · cierre honesto abajo
      if (lazoAgotado) break;
      if (lazoBucle) break; // v1.66.1 · ciclo terco: cierre honesto abajo
      continue; // nueva vuelta: el modelo razona con resultados reales
    }

    // ¿El modelo pidió herramientas y quedan pasos? Se ejecutan de VERDAD y se
    // le devuelve el resultado para que razone con datos reales.
    if (llamadas.length > 0 && paso < maxPasos) {
      mensajes.push(construirMensajeAsistenteConTools(textoTurno, llamadas));
      for (const l of llamadas) {
        const clave = `${l.name}:${l.arguments || ""}`;
        guardia = anotarRepeticion(guardia, clave);
        historialHerramientas.push({ toolName: l.name, argsHash: hashArgsCanonico(l.arguments) });

        // v1.57.9 — LAZO SUAVE: la 3ª vez de la MISMA llamada no se ejecuta;
        // el modelo recibe el resultado que YA tuvo + la orden de cambiar.
        // Solo si sigue repitiendo tras 3 intervenciones se cierra el turno,
        // y entonces con aviso honesto (no con el «Detenido» seco de antes).
        if (guardia.veces >= UMBRAL_REPETICION) {
          intervenciones++;
          if (intervenciones > TOPE_INTERVENCIONES) { lazoAgotado = l.name; break; }
          mensajes.push(construirMensajeRespuestaTool(
            l.id, l.name,
            directivaRepeticion(l.name, guardia.veces, salidaPorClave.get(clave) || ""),
          ));
          continue;
        }

        // v1.57.9 — TRUNCAMIENTO: arguments a medias = la llamada NO se
        // ejecuta (antes se ejecutaba con args={} y escribía basura o nada).
        const estado = parsearArgsConEstado(l.arguments);
        if (!estado.ok && estado.truncado) {
          mensajes.push(construirMensajeRespuestaTool(l.id, l.name, DIRECTIVA_TRUNCAMIENTO));
          accionesHechas.push(`✂️ ${l.name} — argumentos truncados, dividido en partes`);
          continue;
        }

        let crudo: string;
        try {
          const argsNat = estado.ok ? estado.args : parsearArgsHerramienta(l.arguments);
          const bloqueo = interceptarArboles(l.name, argsNat);
          crudo = bloqueo !== null ? bloqueo : await ejecutarHerramienta(l.name, argsNat);
        } catch (e: any) {
          crudo = JSON.stringify({ ok: false, error: String(e?.message || e) });
        }
        mensajes.push(construirMensajeRespuestaTool(l.id, l.name, crudo));
        huboToolExec = true;
        if (l.name === "consultar_espejo") espejoInvocado = true; // v1.70.2
        salidaPorClave.set(clave, crudo);
        if (esRechazoReescrituraIdentica(crudo)) {
          reescriturasIdenticas++;
          try {
            const rr = ((estado.ok ? estado.args : parsearArgsHerramienta(l.arguments)) || {}).path;
            if (rr) rutasReescritasIdenticas.push(String(rr));
          } catch {}
          if (reescriturasIdenticas >= TOPE_REESCRITURA_IDENTICA) { cortePorReescritura = true; break; }
        }
        try {
          const a = (estado.ok ? estado.args : parsearArgsHerramienta(l.arguments)) || {};
          const obj = a.path || a.command || a.query || a.name || a.task_id || "";
          let ok = true;
          try { ok = JSON.parse(crudo)?.ok !== false; } catch {}
          {
            const vf = registrarFalloArgs(vigilante, !ok, crudo);
            if (vf.justoAlCruzarlo) hayDirectivaArgs = true; // se inyecta al final del bloque
          }
          accionesHechas.push(`${ok ? "✔" : "✖"} ${l.name}${obj ? ` — ${String(obj).slice(0, 80)}` : ""}`);
          anotarPaso(l.name, l.arguments || "", ok); // v1.66.1 · libro de pasos + compra por lectura
          // v1.88.1 · el ✗ lleva el motivo real de la herramienta, y el mismo
          // fallo repetido deja de ser reintentar: a los 3 se le avisa al modelo,
          // a los 5 se corta el turno (captura: 6 ✗ de write_file, 6 min, 100 % CPU).
          const motivoFallo = ok ? "" : motivoDeResultado(crudo);
          espejarEnPlanificador(l.name, a, ok, motivoFallo); // v1.69.0 · la nube también pisa el Planificador
          {
            const vig = vigilarFallo(vigilanteFallos, l.name, ok, motivoFallo);
            if (vig.justoAviso) mensajes.push({ role: "user", content: directivaPorFallos(vig.herramienta, vig.seguidos, motivoFallo) });
            if (vig.corto) { cortePorFallos = vig.herramienta; motivoCorteFallos = motivoFallo; }
          }
          // v1.57.9 — cada ESCRITURA sana compra 2 pasos más (tope 36): la
          // tarea larga termina en vez de morir a mitad de la tanda.
          if (ok && esHerramientaDeObra(l.name)) {
            escriturasOk++;
            maxPasos = Math.max(maxPasos, techoPasosConProgreso(escriturasOk, lecturasNuevasOk, ejecucionesOk));
            // v1.58.4 — B4: guarda el estado FINAL del archivo para el gate de
            //   auto-revisión del cierre (última escritura por ruta gana).
            const rutaW = a.path || a.ruta;
            const contW = a.content ?? a.contenido;
            if (typeof rutaW === "string" && rutaW.trim() && typeof contW === "string") {
              escritosTurno.set(rutaW, contW);
            }
          }
        } catch { accionesHechas.push(`✔ ${l.name}`); }
      }
      // v1.66.1 — DETECTOR DE CICLOS, RAMA NATIVA. Se inyecta TRAS todas las
      // respuestas-tool (meterlo antes rompe el transcript OpenAI-compat, que
      // exige todo `tool` contiguo bajo su `assistant`) y antes de la nueva
      // vuelta, para que el modelo LEA que está girando y se corrija solo.
      if (avisoBucle) { mensajes.push({ role: "user", content: avisoBucle }); avisoBucle = ""; }
      if (hayDirectivaArgs) {
        // Después de TODAS las respuestas-tool del turno (el orden del
        // transcript OpenAI-compat lo exige): el modelo entiende que le
        // quitamos las herramientas y por qué.
        mensajes.push({ role: "user", content: DIRECTIVA_SIN_HERRAMIENTAS });
        hayDirectivaArgs = false;
      }
      if (cortePorReescritura) break; // salida del for: cierre honesto abajo
      if (cortePorFallos) break; // v1.88.1 · cinco fallos de la misma herramienta
      if (lazoAgotado) break; // salida del for de pasos: cierre honesto abajo
      if (lazoBucle) break; // v1.66.1 · el mismo ciclo de los turnos anteriores: se corta
      continue; // nueva vuelta con los resultados reales
    }

    // Turno final (sin más llamadas).
    // v1.55.1 — ANUNCIO SIN ACCIÓN: re-empuje ESCALADO (tope MAX_REEMPUJES_ANUNCIO,
    // nunca bucle). Antes era 1 solo cartucho: glm-4.5-flash volvía a narrar «voy
    // a…» y el turno moría, dejando al usuario escribiendo «¿qué pasa?». Ahora
    // insiste subiendo el tono y, en el último intento, exige ENTREGAR ya.
    // v1.57.9 — `finish_reason:"length"` también dispara la reanudación: el
    // corte lo declaró el proveedor, no hay que adivinar si la frase quedó a
    // medias. La directiva manda CONTINUAR exactamente donde se cortó.
    // v1.58.4 — el corte por tokens usa su PROPIO presupuesto (más alto), aparte
    // del cupo de anuncios sin acción: una respuesta larga que corta 4-5 veces
    // debe poder completarse, no abandonarse al segundo corte.
    if (
      finishPaso === "length" &&
      continuacionesCorte < MAX_CONTINUACIONES_CORTE &&
      paso < maxPasos
    ) {
      if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
      mensajes.push({
        role: "user",
        content: "⏳ Tu respuesta se CORTÓ por el tope de tokens del proveedor. Continúa EXACTAMENTE donde quedaste, sin repetir lo ya dicho. Si lo que falta es largo, entrégalo por partes y cierra cada parte de forma completa.",
      });
      continuacionesCorte++;
      console.log(`[bucle] CORTE por tokens (finish_reason:length) — continuación ${continuacionesCorte}/${MAX_CONTINUACIONES_CORTE} con ${mensajes.length} mensajes`);
      continue;
    }
    if (
      reempujes < MAX_REEMPUJES_ANUNCIO &&
      paso < maxPasos &&
      motivoDeParada(textoTurno, []) !== null
    ) {
      if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
      mensajes.push({
        role: "user",
        // v1.70.2 — si hay equipo espejo y el modelo aún no lo llamó, el
        // re-empuje le da la salida concreta en vez de exigirle genéricamente.
        content: directivaDeReanudacion(reempujes) + notaEspejosDeEmpuje(espejoInvocado),
      });
      reempujes++;
      // v1.56.8 — el re-empuje se VE en el log. Sin esta línea, la consola no
      // mostraba NADA durante toda la conversación (queja de Mario: «en el log de
      // cmd no generó nada») y el turno parecía colgado cuando en realidad estaba
      // insistiendo al proveedor por segunda o tercera vez.
      console.log(`[bucle] anuncio sin acción (${motivoDeParada(textoTurno, [])}) — re-empuje ${reempujes}/${MAX_REEMPUJES_ANUNCIO} con ${mensajes.length} mensajes`);
      continue;
    }

    // v1.58.4 — B4: GATE DE AUTO-REVISIÓN. Antes de cantar «hecho» habiendo
    //   ejecutado herramientas, se revisa el estado FINAL de los archivos
    //   escritos este turno. Si alguno quedó incompleto/truncado, se empuja UNA
    //   continuación dirigida a terminarlo en vez de cerrar. Acotado por
    //   MAX_AUTORREVISION: nunca es un bucle.
    if (huboToolExec && autorrevisiones < MAX_AUTORREVISION && paso < maxPasos && escritosTurno.size > 0) {
      const sospechosas = revisarObraEscrita(
        Array.from(escritosTurno, ([path, content]) => ({ path, content }))
      );
      if (sospechosas.length > 0) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({ role: "user", content: directivaAutorrevision(sospechosas) });
        autorrevisiones++;
        console.log(`[bucle] B4 auto-revisión ${autorrevisiones}/${MAX_AUTORREVISION} — obra incompleta: ${sospechosas.map((s) => s.path).join(", ")}`);
        continue;
      }

      // v1.67.0 · ÍTEM 1.2 — LA WEB QUE LLEGA DE MOLDE (defecto de v1.66.0 con el
      //   arreglo dentro y sin enchufar). Acá el archivo SÍ está íntegro: lo que
      //   falta es CONTENIDO real. Se pregunta después del gate de integridad y
      //   antes del de certeza, con el MISMO presupuesto `MAX_AUTORREVISION` — o
      //   sea que no puede abrir bucle nuevo, que era el riesgo de tocar el ciclo.
      const andamios = revisarPlantillaWeb(
        Array.from(escritosTurno, ([path, content]) => ({ path, content }))
      );
      if (andamios.length > 0) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({
          role: "user",
          content: andamios.slice(0, 2).map((a) => a.informe).join("\n\n"),
        });
        autorrevisiones++;
        console.log(`[bucle] B4 plantilla por defecto ${autorrevisiones}/${MAX_AUTORREVISION} — andamio en: ${andamios.map((a) => a.path).join(", ")}`);
        continue;
      }

      // v1.59.1 — SEGUNDA CAPA (gate de certeza unificado). El gate propietario
      //   no vio obra sospechosa; antes de cerrar pasamos los mismos escritos y
      //   el historial de herramientas por evaluarCierre(), que compone los
      //   ejes huerfanos (bucle A-B-A-B/saturacion, integridad por lineas,
      //   consistencia de exports). Si bloquea, inyectamos sus directivas en vez
      //   de cantar «hecho». Acotado por el MISMO presupuesto de autorrevisiones.
      const veredictoGate = evaluarCierre({
        historialHerramientas,
        escrituras: Array.from(escritosTurno, ([path, content]) => ({
          path,
          contenido: content,
          intento: autorrevisiones,
        })),
      });
      console.log(`[bucle] gate certeza telemetria: ${JSON.stringify(veredictoGate.telemetria)}`);
      if (!veredictoGate.liberar && veredictoGate.directivas.length > 0) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({
          role: "user",
          content:
            "⚠️ Revisión de certeza antes de cerrar:\n" +
            veredictoGate.directivas.join("\n"),
        });
        autorrevisiones++;
        console.log(`[bucle] B4+ gate de certeza ${autorrevisiones}/${MAX_AUTORREVISION} — ${veredictoGate.directivas.length} directiva(s)`);
        continue;
      }
    }

    // v1.66.1 · BUG D DE v1.66.0, POR FIN CABLEADO — «VOY A…» Y SE CORTA.
    // `continuidadTurno.ts` ya existía con su test en verde; nadie lo llamaba.
    // A diferencia del re-empuje de v1.55.1 (que mira fórmulas de anuncio), este
    // evalúa el turno COMPLETO y se calla si hubo herramienta u obra, si el
    // texto pregunta algo, o si ya entregó una conclusión: es la que no molesta
    // al modelo que trabaja. Cupo propio y chico: dos exigencias y se cierra.
    if (continuidades < MAX_CONTINUIDAD && paso < maxPasos) {
      const vc = evaluarContinuidad({
        textoFinal: textoTurno,
        huboToolCalls: huboToolExec,
        huboObra: escriturasOk > 0,
      });
      if (vc.prematuro) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({ role: "user", content: vc.directiva! });
        continuidades++;
        console.log(`[bucle] ▶️ corte prematuro («${vc.promesa}») — exigencia ${continuidades}/${MAX_CONTINUIDAD}`);
        continue;
      }
    }

    // v1.69.0 · LA PUERTA DEL CONTRATO, AHORA TAMBIÉN EN LA NUBE — pedido de
    // Mario: «ahí (en el Planificador) se ejecuta el contrato, plan y hoja de
    // ruta con la tarea escrita por etapas y tachando la ya hecha; hasta que no
    // termine no se corta o se auto pregunta para continuar el turno». El juez
    // local ya lo hacía (decidirBucle: contrato abierto ⇒ continuar); el ciclo
    // OpenAI-compat cerraba con etapas colgando. Ahora el motor SE AUTO-PREGUNTA:
    // inyecta la lista de etapas sin tachar y exige seguir en este mismo hilo.
    // Acotado (MAX_CONTINUIDAD_PLAN=3, como los re-empujes locales): exigir sin
    // tope sería el otro defecto — el turno que nunca muere.
    if (paso < maxPasos && continuidadesPlan < MAX_CONTINUIDAD_PLAN) {
      const contratoAbierto = estadoContrato();
      const directivaContrato = contratoAbierto.abierto ? directivaDeContratoAbierto(contratoAbierto) : null;
      const directivaEtapas = planTocadoEsteTurno ? directivaDePlanPendiente(planTurno, continuidadesPlan) : null;
      const directiva = directivaContrato || directivaEtapas;
      if (directiva) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({ role: "user", content: directiva });
        try { anotarVivo(`contrato/plan abierto — auto-pregunta ${continuidadesPlan + 1}/${MAX_CONTINUIDAD_PLAN}`); } catch { /* espejo auxiliar */ }
        continuidadesPlan++;
        console.log(`[bucle] ▶️ ${directivaContrato ? "contrato de aceptación" : "plan"} abierto — auto-pregunta ${continuidadesPlan}/${MAX_CONTINUIDAD_PLAN}`);
        continue;
      }
    }

    // v1.70.6 · EL PLAN DE PALABRAS LLEGA AL PLANIFICADOR — pedido de Mario
    // (25/10): «cuando hace planes no usa el Planificador». El modelo que no
    // tiene `set_plan` a mano (o decide no usarlo) enumera sus pasos en el chat
    // y el panel se quedaba en 0. Toda la lógica (guarda + parser + declaración)
    // vive en el espejo (publicarPlanDePalabras → planDesdeProsa); el ciclo sólo
    // pregunta y reenvía el evento. Ante la duda el parser no inventa nada.
    try {
      const planPalabras = publicarPlanDePalabras(textoTurno || "");
      if (planPalabras) {
        planTocadoEsteTurno = true;
        ctx.sendTaskEvent({
          type: "plan",
          tasks: planPalabras.map((t) => ({ id: t.id, description: t.description, status: "pending" })),
        } as any);
        console.log(`[bucle] 🗒 plan declarado de palabra: ${planPalabras.length} etapa(s) → Planificador`);
      }
    } catch { /* el espejo es auxiliar: jamás corta un turno bueno */ }

    // v1.56.8 — SE ACABARON LOS RE-EMPUJES Y SIGUE SIENDO UN ANUNCIO: se dice.
    // Antes este punto devolvía `ok:true` solo porque salió texto, así el turno
    // moría en «voy a revisar…» sin explicación y el usuario tenía que volver a
    // preguntar para que la tarea continuara. Si hubo herramientas ejecutadas, el
    // anuncio ya no es el problema: no se añade el aviso.
    if (!huboToolExec) {
      const motivoFinal = motivoDeParada(textoTurno, []);
      if (motivoFinal) {
        console.warn(`[bucle] CIERRE SIN ACCIÓN tras ${reempujes} re-empuje(s): ${motivoFinal}`);
        ctx.sendChunk(cierreIntencionSinEjecutar(reempujes, motivoFinal));
      }
    }

    // v1.57.9 — el modelo pedía más herramientas justo donde se acabó el
    // presupuesto: se dice CUÁL era la obra pendiente (antes: silencio o
    // «límite de pasos» sin explicar que quedaba trabajo a medias).
    avisarObraPendiente();
    avisarPlanSinCerrar(); // v1.69.0 · con etapas abiertas esto es «parcial», no «Hecho»
    if (emittedAny) return { ok: true, emittedAny: true };
    if (huboToolExec) {
      ctx.sendChunk(planEtapasAbiertas().length > 0 ? `⚠️ Parcial — acciones realizadas:${resumirAcciones()}` : `✔️ Hecho. Acciones realizadas:${resumirAcciones()}`);
      return { ok: true, emittedAny: true };
    }
    return { ok: false, emittedAny: false, failReason: "stream vacío (ningún token recibido)" };
  }

  // v1.60.17 — CIRCUITO DE REESCRITURA IDÉNTICA: el modelo insistió en
  // reescribir archivos byte-a-byte iguales (rotando entre ellos para esquivar
  // el lazo suave). Se cierra con la verdad antes de que el turno gire sin fin.
  // v1.88.1 · CORTE POR FALLO REPETIDO: args válidos y el mismo error cinco veces
  // no es terquedad del usuario, es el lazo girando. Se nombra la herramienta y se
  // pega el motivo tal como lo dijo la herramienta.
  if (cortePorFallos) {
    ctx.sendChunk(
      cierrePorFallos(cortePorFallos, UMBRAL_CORTE_FALLOS, motivoCorteFallos) +
      (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : "")
    );
    return { ok: true, emittedAny: true };
  }

  if (cortePorReescritura) {
    ctx.sendChunk(cierrePorReescrituraIdentica(rutasReescritasIdenticas) + (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : ""));
    return { ok: true, emittedAny: true };
  }

  // v1.66.1 · CICLO ENTRE TURNOS: el mismo `A → B → C` de los turnos anteriores,
  // reconocido gracias a que el detector NO nació vacío. Se nombra el ciclo y se
  // dice qué se hizo antes: el usuario entiende por qué «sigue» no servía.
  if (lazoBucle) {
    ctx.sendChunk(
      `🔁 Corté el turno porque estaba girando el mismo ciclo de los turnos previos: ${lazoBucle}. ` +
      `Seguir pidiéndome «sigue» repite esas mismas herramientas; hace falta otro enfoque o un dato concreto.` +
      (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : "")
    );
    return { ok: true, emittedAny: true };
  }

  // v1.57.9 — LAZO AGOTADO: la guardia se cansó de intervenir. Se cierra con
  // la verdad (qué se insistió y qué hacer), nunca con el «Detenido» mudo.
  if (lazoAgotado) {
    ctx.sendChunk(cierrePorLazoAgotado(lazoAgotado) + (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : ""));
    return { ok: true, emittedAny: true };
  }

  // Se agotaron los pasos sin un cierre textual.
  avisarObraPendiente();
  avisarPlanSinCerrar(); // v1.69.0 · el acta dice qué etapas quedan colgando
  if (emittedAny) return { ok: true, emittedAny: true };
  if (huboToolExec) {
    ctx.sendChunk(planEtapasAbiertas().length > 0 ? `⚠️ Parcial (límite de pasos alcanzado):${resumirAcciones()}` : `✔️ Acciones realizadas (límite de pasos alcanzado):${resumirAcciones()}`);
    return { ok: true, emittedAny: true };
  }
  return { ok: false, emittedAny: false, failReason: "sin respuesta tras el límite de pasos" };
}

```

### server/configServidor.ts (83 líneas)

```ts
import os from 'node:os';
import {resolverRaizDatos, rechazarRaizAncestroApp, esAncestroOEquivale} from '../src/engine/raizDatos';
import {modoServidor} from './edicionServidor';
import fs from 'node:fs';
import path from 'node:path';
/** Servidor: una configuración inválida nunca se sustituye por /tmp. */
export function resolverWorkspaceServidor(configurada: string | undefined, instalacion: string): string {
  if (!configurada?.trim()) throw new Error('Modo servidor requiere PROJECT_DIR en un volumen persistente.');
  const raiz = path.resolve(configurada.trim());
  const app = fs.realpathSync(instalacion);
  const contieneApp = (base: string) => { const rel = path.relative(base, app); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
  if (contieneApp(raiz)) throw new Error('PROJECT_DIR no puede ser la instalación ni contenerla.');
  fs.mkdirSync(raiz, {recursive:true, mode:0o700});
  if (fs.lstatSync(raiz).isSymbolicLink()) throw new Error('PROJECT_DIR no puede ser un enlace simbólico.');
  const real = fs.realpathSync(raiz);
  if (contieneApp(real)) throw new Error('PROJECT_DIR resuelve a la instalación o un ancestro.');
  const prueba = path.join(real, `.cn-probe-${process.pid}-${Date.now()}`);
  try { fs.writeFileSync(prueba, 'ok', {flag:'wx',mode:0o600}); } finally { if (fs.existsSync(prueba)) fs.unlinkSync(prueba); }
  return real;
}

/** Conserva los criterios de raíz de Gemini en escritorio; servidor falla cerrado. */
export function decidirRaicesEdicion(RAIZ_INSTALACION:string) {
  if (modoServidor()) {
    const PROJECT_ROOT=resolverWorkspaceServidor(process.env.PROJECT_DIR, RAIZ_INSTALACION);
    return {PROJECT_ROOT,raizPorDefecto:PROJECT_ROOT,raizResuelta:{raiz:PROJECT_ROOT,origen:"PROJECT_DIR" as const}};
  }
function esCarpetaEscribible(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const prueba = path.join(dir, `.cn-probe-${process.pid}-${Date.now()}`);
    fs.writeFileSync(prueba, "ok", "utf8");
    fs.unlinkSync(prueba);
    return true;
  } catch {
    return false;
  }
}
function chocaConInstalacion(dir: string): boolean {
  return (
    esAncestroOEquivale(dir, process.cwd()) ||
    esAncestroOEquivale(process.cwd(), dir) ||
    esAncestroOEquivale(dir, RAIZ_INSTALACION) ||
    esAncestroOEquivale(RAIZ_INSTALACION, dir)
  );
}
const raizPorDefecto = (() => {
  const candidatos = [
    process.platform === "win32"
      ? path.join(path.parse(process.cwd()).root, "Cerebronico")
      : path.join(os.homedir(), "Cerebronico"),
    path.join(os.tmpdir(), "cerebronico-datos"),
  ];
  for (const c of candidatos) {
    if (!chocaConInstalacion(c) && esCarpetaEscribible(c)) return c;
  }
  return path.join(os.tmpdir(), "cerebronico-datos");
})();
const raizResuelta = resolverRaizDatos(process.env, process.cwd());
// v1.6.23 — GUARDA-RAÍZ v1: un PROJECT_DIR que contenga a la propia app (la
// instalación misma o un ancestro) se RECHAZA y cae al default, con aviso en
// consola. Además en Cloud Run o contenedores donde cwd (/workspace) es de solo
// lectura o coincide con la instalación, <cwd>/.proyectos choca con `instalacion`
// al abrir proyectos y no tiene permisos de escritura: se usa `raizPorDefecto`.
const raizValidada = rechazarRaizAncestroApp(raizResuelta.raiz, process.cwd(), raizPorDefecto);
if (raizValidada.rechazada) console.warn(`[CerebroNico] ⛔ GUARDA-RAÍZ v1: ${raizValidada.motivo}`);
const PROJECT_ROOT = (() => {
  if (raizResuelta.origen === "PROJECT_DIR") {
    if (!raizValidada.rechazada && !chocaConInstalacion(raizValidada.raiz) && esCarpetaEscribible(raizValidada.raiz)) {
      return raizValidada.raiz;
    }
    console.warn(`[CerebroNico] ⚠️ PROJECT_DIR (${raizValidada.raiz}) no es escribible o choca con la instalación; usando ${raizPorDefecto}`);
    return raizPorDefecto;
  }
  if (!chocaConInstalacion(raizValidada.raiz) && esCarpetaEscribible(raizValidada.raiz)) {
    return raizValidada.raiz;
  }
  return raizPorDefecto;
})();

return {PROJECT_ROOT,raizPorDefecto,raizResuelta};
}

```

### server/continuidadPlan.ts (63 líneas)

```ts
/**
 * continuidadPlan.ts — EL PLAN NO SE REINICIA CADA MENSAJE (v1.16.5 · B1.2)
 * El usuario: «le contesto LEE y comienza la tarea otra vez». El plan vivía
 * solo dentro de runOllamaAgentLoop: mensaje nuevo = plan vacío y el modelo
 * (flash-lite sobre todo) volvía a planificar desde cero. Aquí queda el último
 * plan con pendientes, 30 min de vigencia, una ventana = una conversación
 * (mismo patrón que contextCache). Puro estado en memoria: nada toca el disco.
 */
import { tareasPendientes, type TareaPlan } from "../src/engine/bucleAutonomo";
let ultimo: { plan: TareaPlan[]; cuando: number } | null = null;
export function registrarPlanTurno(plan: TareaPlan[]): void {
  if (plan.length > 0) ultimo = { plan: plan.map((t) => ({ ...t })), cuando: Date.now() };
}
export function notaContinuidad(): string | null {
  if (ultimo && Date.now() - ultimo.cuando <= 30 * 60 * 1000 && tareasPendientes(ultimo.plan).length > 0)
    return "PLAN ANTERIOR SIN TERMINAR — no lo reinicies: continúalo donde quedó; si ahora piden otra cosa, reemplázalo con set_plan.\n" + ultimo.plan.map((t) => `${t.status === "done" ? "[x]" : t.status === "failed" ? "[!]" : "[ ]"} ${t.description}`).join("\n");
  return null;
}

// ── v1.69.0 · TURNO = CONTRATO (pedido de Mario, 24/10) ──────────────────────
// «Ahí es donde se centra el plan… hasta que no termine no se corta o se auto
// pregunta para continuar el turno; hacer coincidir el turno con la tarea y la
// entrega». El juez local ya lo hacía (decidirBucle: plan abierto ⇒ continuar).
// El ciclo OpenAI-compat —once proveedores de nube— no: cerraba el turno con
// etapas colgando y el usuario escribía «sigue». Esta es LA DIRECTIVA con la
// que el motor se auto-pregunta, y su tope. Pura y testeable en seco.

/** Exigencias de «cerrá las etapas del plan» por turno. Acotado: no es bucle. */
export const MAX_CONTINUIDAD_PLAN = 3;

/** El plan como lista de etapas con su marca: tachadas las hechas, abiertas las demás. */
export function etapasDelPlan(plan: TareaPlan[]): string {
  return plan.map((t) => `${t.status === "done" ? "[x]" : t.status === "failed" ? "[!]" : t.status === "running" ? "[▶]" : "[ ]"} #${t.id} ${t.description}`).join("\n");
}

/**
 * LA AUTO-PREGUNTA que el motor se hace (e inyecta como mensaje) cuando el
 * modelo quiere cerrar el turno con etapas del plan todavía abiertas. Devuelve
 * null si no hay nada que exigir — turno sin plan tocado es turno libre.
 */
export function directivaDePlanPendiente(
  plan: TareaPlan[],
  intento: number,
  tope: number = MAX_CONTINUIDAD_PLAN,
): string | null {
  const pendientes = tareasPendientes(plan);
  if (pendientes.length === 0) return null;
  const ultimatum = intento >= tope - 1;
  return (
    `▶️ CONTRATO DE PLAN — querés cerrar el turno y el Planificador todavía tiene ` +
    `${pendientes.length} etapa(s) SIN TACHAR:\n${etapasDelPlan(plan)}\n` +
    (ultimatum
      ? `ÚLTIMA EXIGENCIA del turno: tachá la etapa que puedas cerrar AHORA con update_task(status:"completed") y ` +
        `de las demás entrégale al usuario o el informe honesto de qué falta y por qué, o un replanteo concreto. ` +
        `No vuelvas a cantar «listo» con etapas abiertas.`
      : `Seguí en este mismo hilo con la primera etapa abierta: ejecutala con herramientas reales y ` +
        `tachala con update_task (status "completed", y "evidencia" con la prueba de que quedó hecha). ` +
        `El turno cierra CUANDO EL PLAN ESTÁ TACHADO, no antes. Si una etapa es imposible, decilo con causa ` +
        `y marcala "failed" — eso también es cerrar la etapa.`) +
    `\n(El motor no te está pidiendo permiso: es la hoja de ruta que VOS escribiste con set_plan.)`
  );
}

```

### server/daemonsPython.ts (230 líneas)

```ts
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export interface DaemonPythonDef {
  id: "motor" | "creador" | "memoria";
  puerto: number;
  script: string;
  variablePuerto: string;
  env: (raizDatos: string) => Record<string, string>;
}

const DAEMONS_PYTHON: DaemonPythonDef[] = [
  {
    id: "motor",
    puerto: 5103,
    script: "cerebro_motor.py",
    variablePuerto: "CN_MOTOR_PORT",
    env: (raizDatos) => ({
      CN_MOTOR_STORE: path.join(raizDatos, ".cerebro-db", "cerebro-motor.json"),
      CN_CEREBRO_MOTOR: path.join(raizDatos, ".cerebro-db", "cerebro-motor.json"),
    }),
  },
  {
    id: "creador",
    puerto: 5102,
    script: "creador_daemon.py",
    variablePuerto: "CN_CREATOR_PORT",
    env: (raizDatos) => ({
      CN_CREADOR_ROOT: path.join(raizDatos, ".creador"),
    }),
  },
  {
    id: "memoria",
    puerto: 5100,
    script: "hindsight_daemon.py",
    variablePuerto: "CN_MEMORY_PORT",
    env: (raizDatos) => ({
      CN_HINDSITE_MIRROR: path.join(raizDatos, "hindsight-mirror.json"),
    }),
  },
];

function portListening(port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: timeoutMs });
    const done = (ok: boolean) => {
      try {
        s.destroy();
      } catch {}
      resolve(ok);
    };
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
  });
}

async function healthReady(port: number, maxAttempts = 12, intervalMs = 250): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(800),
      });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function estaApagadoAMano(projectRoot: string, id: string): boolean {
  try {
    const ruta = path.join(projectRoot, "servicios.json");
    if (!fs.existsSync(ruta)) return false;
    const j = JSON.parse(fs.readFileSync(ruta, "utf-8"));
    return String(j?.[id] || "").trim().toLowerCase() === "apagado";
  } catch {
    return false;
  }
}

export function resolverInterpretePython(): string | null {
  const candidatos: string[] = [];
  if (process.env.CN_PYTHON && fs.existsSync(process.env.CN_PYTHON)) {
    candidatos.push(process.env.CN_PYTHON);
  }
  if (process.platform === "win32") {
    candidatos.push("python", "python3");
  } else {
    if (fs.existsSync("/usr/bin/python3")) candidatos.push("/usr/bin/python3");
    candidatos.push("python3", "python");
  }
  for (const bin of candidatos) {
    try {
      const chk = spawnSync(bin, ["--version"], {
        stdio: "ignore",
        timeout: 3000,
        windowsHide: true,
      });
      if (chk.status === 0) return bin;
    } catch {}
  }
  return null;
}

function resolverScriptDaemon(scriptName: string, installRoot: string): string | null {
  const bases = [installRoot, process.cwd()];
  for (const base of bases) {
    if (!base) continue;
    const candidate = path.join(base, "scripts", scriptName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export interface HandleDaemonsPython {
  kill: () => void;
  iniciados: Array<{ id: string; puerto: number; pid: number | undefined }>;
}

export async function arrancarDaemonsPython(opts: {
  installRoot: string;
  projectRoot: string;
}): Promise<HandleDaemonsPython> {
  if (process.env.CN_SANDBOX_CHILD === "1" || process.env.CN_DISABLE_BRIDGE === "1") {
    return { kill: () => {}, iniciados: [] };
  }

  const interprete = resolverInterpretePython();
  if (!interprete) {
    console.warn(
      "[CerebroNico] Python no detectado en el entorno: los daemons :5103/:5102/:5100 no se auto-inician (la IDE :3000 sigue funcionando)."
    );
    return { kill: () => {}, iniciados: [] };
  }

  const hijos: Array<{ id: string; puerto: number; proc: ChildProcess; logStream: fs.WriteStream | null }> = [];
  const iniciados: Array<{ id: string; puerto: number; pid: number | undefined }> = [];
  const logsDir = path.join(opts.projectRoot, "logs", "arranque");
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch {}

  for (const def of DAEMONS_PYTHON) {
    try {
      if (await portListening(def.puerto)) {
        console.log(`[CerebroNico] Daemon :${def.puerto} (${def.id}) ya escuchando: adoptado.`);
        continue;
      }
      if (estaApagadoAMano(opts.projectRoot, def.id)) {
        console.log(`[CerebroNico] Daemon :${def.puerto} (${def.id}) marcado «apagado» en servicios.json: omitido.`);
        continue;
      }
      const scriptPath = resolverScriptDaemon(def.script, opts.installRoot);
      if (!scriptPath) {
        console.warn(`[CerebroNico] Script scripts/${def.script} no encontrado: :${def.puerto} (${def.id}) omitido.`);
        continue;
      }

      const env: Record<string, string | undefined> = {
        ...process.env,
        [def.variablePuerto]: String(def.puerto),
        PROJECT_DIR: opts.projectRoot,
        CN_PROJECT_DIR: opts.projectRoot,
        PYTHONUTF8: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
        ...def.env(opts.projectRoot),
      };

      if (def.id === "memoria" && (await portListening(5103))) {
        env.HINDSITE_API_URL = "http://127.0.0.1:5103";
      }

      let logStream: fs.WriteStream | null = null;
      try {
        logStream = fs.createWriteStream(path.join(logsDir, `${def.id}.log`), { flags: "w" });
      } catch {
        logStream = null;
      }

      const proc = spawn(interprete, ["-u", scriptPath, "--port", String(def.puerto)], {
        cwd: path.dirname(path.dirname(scriptPath)),
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        windowsHide: true,
      });

      hijos.push({ id: def.id, puerto: def.puerto, proc, logStream });
      iniciados.push({ id: def.id, puerto: def.puerto, pid: proc.pid });

      proc.stdout?.on("data", (d: Buffer) => {
        if (logStream) logStream.write(d);
      });
      proc.stderr?.on("data", (d: Buffer) => {
        if (logStream) logStream.write(d);
      });
      proc.on("error", (err) => {
        console.warn(`[CerebroNico] Error al lanzar :${def.puerto} (${def.id}): ${err.message}`);
      });

      const listo = await healthReady(def.puerto, def.id === "motor" ? 12 : 10, 250);
      if (listo) {
        console.log(`[CerebroNico] Daemon :${def.puerto} (${def.id}) listo con ${interprete}.`);
      } else {
        console.warn(`[CerebroNico] Daemon :${def.puerto} (${def.id}) lanzado (PID ${proc.pid ?? "?"}), aún iniciando.`);
      }
    } catch (err: any) {
      console.warn(`[CerebroNico] Fallo arrancando daemon :${def.puerto} (${def.id}): ${err?.message || err}`);
    }
  }

  return {
    iniciados,
    kill: () => {
      for (const h of hijos) {
        try {
          if (!h.proc.killed) h.proc.kill();
        } catch {}
        try {
          h.logStream?.end();
        } catch {}
      }
    },
  };
}

```

### server/edicionServidor.ts (158 líneas)

```ts
/** Edición servidor: una raíz de obra y memoria de sesión sencilla. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Express, Request, Response } from 'express';

export const modoServidor = () => process.env.CN_SERVER_MODE === '1';
export function rutaWorkspace(raiz: string, entrada: string): string {
  let r = String(entrada || '').replace(/\\/g, '/');
  if (r === '/workspace') r = '';
  else if (r.startsWith('/workspace/')) r = r.slice(11);
  else if (path.isAbsolute(r)) {
    const rel = path.relative(raiz, r);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta fuera del workspace.');
    r = rel;
  }
  if (r.includes('\0') || r.split('/').includes('..')) throw new Error('Ruta fuera del workspace.');
  const abs = path.resolve(raiz, r || '.');
  const rel = path.relative(path.resolve(raiz), abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta fuera del workspace.');
  // No seguir enlaces hacia la instalación, claves u otros usuarios.
  let actual = path.resolve(raiz);
  if (fs.existsSync(actual) && fs.lstatSync(actual).isSymbolicLink()) throw new Error('Workspace enlazado no permitido.');
  for (const parte of rel.split(path.sep).filter(Boolean)) {
    actual = path.join(actual, parte);
    try { if (fs.lstatSync(actual).isSymbolicLink()) throw new Error('Enlace simbólico no permitido.'); } catch (e:any) { if (e.code !== 'ENOENT') throw e; }
  }
  if (rel.split(path.sep).some(p => p === '.sesiones' || p === '.env' || p.startsWith('.env.'))) throw new Error('Archivo privado del servidor.');
  return abs;
}
const OMITIR = new Set(['node_modules', '.git', '.sesiones', '.cerebro-db', '.cerebronico', '.cn-quirofano', '.cn-preview', 'dist_electron', '__pycache__']);
export function inventarioWorkspace(raiz: string): Array<{path: string; content: string; size: number}> {
  const archivos: Array<{path: string; content: string; size: number}> = [];
  let total = 0;
  function visitar(dir: string, profundidad: number) {
    if (profundidad > 12) return;
    for (const e of fs.readdirSync(dir, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
      if (e.isSymbolicLink() || OMITIR.has(e.name) || e.name.startsWith('.env') || e.name.startsWith('.cn-') || e.name.startsWith('.sandbox_')) continue;
      const abs = path.join(dir,e.name);
      if (e.isDirectory()) visitar(abs, profundidad + 1);
      else if (e.isFile()) {
        if (!/\.(html?|css|[cm]?js|jsx|tsx?|json|md|txt|py|ya?ml|toml|xml|csv|sql|sh|bat|java|kt|rs|go|svg)$/i.test(e.name)) continue;
        const size = fs.statSync(abs).size;
        if (size > 2*1024*1024 || total + size > 16*1024*1024 || archivos.length >= 1500) continue;
        const content = fs.readFileSync(abs,'utf8');
        if (content.includes('\0')) continue;
        archivos.push({path:path.relative(raiz,abs).split(path.sep).join('/'), content, size}); total += size;
      }
    }
  }
  visitar(raiz,0); return archivos;
}
export function guardarSesion(raiz: string, datos: any) {
  // Lista blanca: nunca guardar claves/API config ni adjuntos binarios.
  const messages = Array.isArray(datos?.messages) ? datos.messages.slice(-400).map((m:any) => ({id:String(m.id||''), role:['user','assistant','system'].includes(m.role)?m.role:'user',content:String(m.content||'').slice(0,100000), timestamp:Number(m.timestamp)||Date.now()})) : [];
  const sesion = {version:1, savedAt:new Date().toISOString(), messages, currentModel:String(datos?.currentModel||''), provider:String(datos?.provider||'ollama')};
  const dir=path.join(raiz,'.sesiones'); fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const destino=path.join(dir,'actual.json'), tmp=path.join(dir,`actual-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp,JSON.stringify(sesion),{mode:0o600}); fs.renameSync(tmp,destino); return sesion;
}
export function leerSesion(raiz:string) {
  try {return JSON.parse(fs.readFileSync(path.join(raiz,'.sesiones','actual.json'),'utf8'));} catch {return null;}
}
const contexto = new AsyncLocalStorage<{key:string; base:string}>();
export function conClaveOllama<T>(base:string,key:string,fn:()=>T):T {return contexto.run({key,base},fn);}
export function endpointOllamaPermitido(base:string):string {
  const url=new URL(base); if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Endpoint Ollama inválido.');
  const configurada=(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/,'');
  if (modoServidor() && url.origin !== new URL(configurada).origin && url.origin !== 'https://ollama.com') throw new Error('Endpoint no autorizado: configure OLLAMA_URL en el servidor.');
  return url.href.replace(/\/+$/,'');
}
export function fetchConClave(original:typeof fetch):typeof fetch {
  return (async (input:any,init?:RequestInit) => {
    const c=contexto.getStore();
    const url=new URL(typeof input==='string'||input instanceof URL ? String(input):input.url);
    if (!c?.key || url.origin!==new URL(c.base).origin || !url.pathname.startsWith('/api/')) return original(input,init);
    const headers=new Headers(init?.headers || (typeof input==='object' && 'headers' in input ? input.headers:undefined));
    headers.set('Authorization',`Bearer ${c.key}`);
    // No reenviar una clave a otro destino a través de una redirección.
    return original(input,{...init,headers,redirect:'error'});
  }) as typeof fetch;
}
function coincide(a:string,b:string):boolean {const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && crypto.timingSafeEqual(x,y);}
export function montarEdicionServidor(app:Express,raiz:string) {
  if (!modoServidor()) return;
  if (!process.env.ACCESS_TOKEN) throw new Error('Edición servidor requiere ACCESS_TOKEN.');
  fs.mkdirSync(raiz,{recursive:true});
  // Cookie firmada derivada: no guardar el token del servidor en el navegador.
  const previewTicket=crypto.createHmac('sha256',process.env.ACCESS_TOKEN).update('cn-preview-only-v1').digest('hex');
  const cookieVal=crypto.createHmac('sha256',process.env.ACCESS_TOKEN).update('cn-servidor-session-v1').digest('hex');
  const auth=(req:Request) => {
    const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('cn_server='))?.slice(10)||'';
    const token=String(req.headers['x-access-token']||'');
    return coincide(cookie,cookieVal) || (token.length>0 && coincide(token,process.env.ACCESS_TOKEN!));
  };
  const origenValido=(req:Request) => {
    const origin=req.headers.origin;
    if (!origin) return !['cross-site','same-site'].includes(String(req.headers['sec-fetch-site']||''));
    if (origin==='null') return false;
    const permitidos=(process.env.CN_PUBLIC_ORIGIN||'').split(',').filter(Boolean);
    return permitidos.includes(origin);
  };
  app.get('/healthz',(_req,res)=>res.json({ok:true}));
  app.post('/api/server/login',(req,res)=>{
    if (!origenValido(req)) return res.status(403).json({error:'Origen no autorizado.'});
    if (!coincide(String(req.body?.token||''),process.env.ACCESS_TOKEN!)) return res.status(401).json({error:'Clave de acceso incorrecta.'});
    res.cookie('cn_server',cookieVal,{httpOnly:true,secure:process.env.CN_COOKIE_SECURE!=='0',sameSite:'strict',path:'/',maxAge:12*60*60*1000}); return res.json({ok:true});
  });
  app.use('/api',(req,res,next)=>{
    if (!origenValido(req)) return res.status(403).json({error:'Origen no autorizado.'});
    if (!auth(req)) return res.status(401).json({error:'Inicia sesión con la clave de acceso del servidor.'});
    // La puerta antigua exige este header: se asigna sólo DESPUÉS de autenticar.
    req.headers['x-access-token']=process.env.ACCESS_TOKEN;
    const base=String(req.body?.ollamaUrl || (req.originalUrl?.startsWith('/api/ollama/models') ? req.query?.url : '') || process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
    let destino:string; try {destino=endpointOllamaPermitido(base);} catch(e:any) {return res.status(400).json({error:e.message});}
    const key=String(req.body?.ollamaApiKey||req.headers['x-ollama-key']||process.env.OLLAMA_API_KEY||'');
    return conClaveOllama(destino,key,next);
  });
  app.get('/api/server/config',(_req,res)=>res.json({serverMode:true,workspace:'/workspace',preview:`/sandbox-preview/${previewTicket}/`,ollamaUrl:process.env.OLLAMA_URL||'http://127.0.0.1:11434',session:leerSesion(raiz)}));
  app.post('/api/server/session',(req,res)=>{try{return res.json({ok:true,session:guardarSesion(raiz,req.body)});}catch(e:any){return res.status(500).json({error:e.message});}});
  app.get('/api/server/workspace',(_req,res)=>{try {const files=inventarioWorkspace(raiz); const revision=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');return res.json({files,revision});}catch(e:any){return res.status(500).json({error:e.message});}});
  app.get('/api/fs/tree',(_req,res)=>res.json({files:inventarioWorkspace(raiz).map(f=>f.path),root:'/workspace'}));
  app.get('/api/fs/read',(req,res)=>{try {return res.json({path:req.query.path,content:fs.readFileSync(rutaWorkspace(raiz,String(req.query.path||'')),'utf8')});}catch(e:any){return res.status(400).json({error:e.message});}});
  // Las rutas de arranque originales se conservan; la vista pública es un proxy
  // de destino fijo y sólo de lectura, no una herramienta de ejecución nueva.
  app.use('/sandbox-preview',async(req,res)=>{
    const partes=req.url.split('/');
    const ticket=partes[1] || '';
    const conTicket=coincide(ticket,previewTicket);
    if (!conTicket) {
      if (!auth(req)) return res.status(401).send('Inicia sesión en la IDE.');
      return res.redirect(302,`/sandbox-preview/${previewTicket}/${req.url.replace(/^\//,'')}`);
    }
    const relativa='/' + partes.slice(2).join('/');
    const prefijo=`/sandbox-preview/${previewTicket}/`;
    if (!['GET','HEAD'].includes(req.method)) return res.status(405).end();
    const target=`http://127.0.0.1:${Number(process.env.SANDBOX_PORT)||3500}${relativa}`;
    try {
      const respuesta=await fetch(target,{signal:AbortSignal.timeout(10000),redirect:'manual'});
      res.status(respuesta.status);
      for (const h of ['content-type','cache-control']) {const v=respuesta.headers.get(h);if(v)res.setHeader(h,v);}
      res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"sandbox allow-scripts allow-forms; frame-ancestors 'self'; form-action 'none'");
      const tipo=respuesta.headers.get('content-type')||'';
      let body=Buffer.from(await respuesta.arrayBuffer());
      if (tipo.includes('text/html') || tipo.includes('text/css') || tipo.includes('javascript')) {
        let texto=body.toString('utf8');
        // Recursos absolutos habituales de HTML, CSS y módulos Vite.
        texto=texto.replace(/((?:src|href|action)\s*=\s*["'])\/(?!\/|sandbox-preview\/)/gi,`$1${prefijo}`).replace(/(url\(\s*["']?)\/(?!\/|sandbox-preview\/)/gi,`$1${prefijo}`).replace(/((?:from\s*|import\s*\(|import\s*|fetch\s*\()["'])\/(?!\/|sandbox-preview\/)/g,`$1${prefijo}`);
        body=Buffer.from(texto);
      }
      return res.end(req.method==='HEAD'?undefined:body);
    } catch {return res.status(503).send('El sandbox todavía no está disponible. Arranca el proyecto desde la IDE.');}
  });
}

```

### server/enjambreLlamadas.ts (612 líneas)

```ts
/**
 * enjambreLlamadas.ts — LA CAPA DE LLAMADAS DEL ENJAMBRE (v1.80.0)
 * =================================================================
 * QUÉ HACE: manda EL MISMO prompt a varias voces en paralelo, y después manda
 * todas las respuestas al juez. Es la parte con red del enjambre; el criterio
 * (a quién se llama, cómo se evalúa, cómo se consensúa) vive en
 * `src/engine/enjambreEclectico.ts`, que es puro y probado.
 *
 * POR QUÉ OTRO MÓDULO Y NO `server.ts`: el trinquete del contrato de rutas dice
 * que el monolito se parte, no se crece. Aquí solo se llama y se espera; las
 * rutas están en `server/routers/enjambre.ts`.
 *
 * POR QUÉ `fetchCloud` y no `fetch` a secas: el enjambre habla por las MISMAS
 * venas que el chat — primer byte medido (`relojModelos`), cuarentena
 * (`fusibleProveedores`) y presupuesto dinámico. Un enjambre que llama a un
 * proveedor en cuarentena pierde el tiempo del usuario dos veces.
 *
 * CLAVES: viajan en el cuerpo de la petición desde el navegador del usuario
 * (igual que `/api/ai/stream`) y NUNCA se escriben en disco ni se loguean. La
 * casa no guarda secretos ajenos: `scripts/sin-claves.mjs` lo vigila.
 */
import { fetchCloud } from "./fetchCloud";
import { SISTEMA_VOCES, modeloConVisionEsperable, type RespuestaVoz } from "../src/engine/enjambreEclectico";

export interface VozPedido {
  provider: string;
  model: string;
}

/**
 * v1.84.5 · Imagen adjunta al turno, en el idioma que habla cada proveedor.
 * Solo se manda a voces donde se espera visión (`modeloConVisionEsperable`):
 * mandarle un `image_url` a un texto-puro es un 400 seguro, y una voz que
 * falló por culpa nuestra envenena el consenso. Las demás voces reciben la
 * lista de archivos en el texto (el prompt con memoria ya la trae).
 */
export interface ImagenParaVoz {
  mimeType: string;
  /** base64 PURO, sin prefijo `data:…;base64,`. */
  base64: string;
}

export interface CredencialesEnjambre {
  /** Ollama local (opcional: solo si el usuario dejó locales en el enjambre). */
  ollamaUrl?: string;
  /** Claves por proveedor, tomadas del estado vivo del navegador. */
  keys?: Record<string, string | undefined>;
  /** Endpoint unificado (la ranura «URL»): proveedor `custom`. */
  customUrl?: string;
  customKey?: string;
}

const BASES_OPENAI_COMPAT: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  zai: "https://api.z.ai/api/paas/v4",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  together: "https://api.together.xyz/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com",
  fireworks: "https://api.fireworks.ai/inference/v1",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Normaliza la URL del endpoint unificado hacia /chat/completions. */
export function endpointUnificado(urlBruta: string): string {
  const u = String(urlBruta || "").replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(u)) return u;
  if (/\/v1$/.test(u)) return `${u}/chat/completions`;
  return `${u}/v1/chat/completions`;
}

/** `custom` no tiene base fija: la pone el usuario. Nunca se adivina. */
function basePara(provider: string, cred: CredencialesEnjambre): { base?: string; clave: string; error?: string } {
  const clave = String(cred.keys?.[provider] || "").trim();
  if (provider === "custom") {
    const url = String(cred.customUrl || "").trim();
    if (!url) return { clave: "", error: "la API unificada no tiene URL configurada en su ranura" };
    return { base: "", clave: String(cred.customKey || "").trim() };
  }
  const base = BASES_OPENAI_COMPAT[provider];
  if (!base) return { clave, error: `proveedor «${provider}» no tiene endpoint conocido en el enjambre` };
  return { base, clave };
}

/** Error con mensaje corto: lo que se muestra en la tabla del informe. */
class Error_ extends Error {}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * v1.97.3 · EL FALLO DICE POR QUÉ. «HTTP 429: {"error":…}» en la tabla del
 * informe era un código de postal: el usuario veía una voz muerta y no sabía si
 * era su clave, su crédito o el proveedor. Clasificación honesta por estado
 * (los free tiers de los «proveedores de siempre» mueren de 429 cuando se acaba
 * la cuota: esto lo dice en vez de callarlo).
 */
export function explicarFalloProvedor(mensaje: string): string {
  const m = String(mensaje || "");
  const st = /HTTP (\d{3})/.exec(m);
  if (st) {
    const n = Number(st[1]);
    if (n === 401) return "clave rechazada por el proveedor (inválida o expirada): revisá su ranura";
    if (n === 402) return "créditos agotados en el proveedor (HTTP 402): esta voz no vota hoy";
    if (n === 403) return "acceso denegado por el proveedor (HTTP 403)";
    if (n === 404) return "el modelo no existe en ese proveedor (HTTP 404): revisá el nombre de la ranura";
    if (n === 408 || n === 504) return `puerta de enlace del proveedor sin respuesta (HTTP ${n})`;
    if (n === 429) return "límite de uso del proveedor (HTTP 429): cuota del free tier o pico — esperá o cargá créditos";
    if (n >= 500) return `caída del servidor del proveedor (HTTP ${n}): transitoria`;
  } else {
    // v1.97.3 · los fallos SIN código (red rota, timeout, cuarentena) también
    // se explican: antes la ramita caía en el `return` de arriba (código muerto).
    if (/tiempo de espera agotado/.test(m)) return "el proveedor no contestó a tiempo: la voz no vota este turno";
    if (/EN CUARENTENA/.test(m)) return "el proveedor está en cuarentena (fusible local): no se le volvió a llamar";
    if (/ECONNREFUSED/.test(m)) return "el endpoint del proveedor rechazó la conexión: revisá la URL de su ranura";
    if (/EAI_AGAIN|ENOTFOUND/.test(m)) return "no se pudo resolver el dominio del proveedor: revisá tu conexión";
    if (/ECONNRESET|ETIMEDOUT|fetch failed/i.test(m)) return "la red se cortó antes de llegar al proveedor (intento fallido)";
  }
  return m;
}

/**
 * v1.97.3 · ¿VALE LA PENA REINTENTAR? Un fallo es transitorio cuando el
 * proveedor CONTESTÓ rápido con un 5xx/429 (está caído o en pico, no muerto) o
 * cuando la red misma se rompió (ECONNRESET/ETIMEDOUT/EAI_AGAIN) antes de los
 * 20 s. Lo que NO se reintenta: 4xx de clave/crédito/modelo (repetir gasta la
 * misma verdad), un tiempo de espera agotado (el proveedor era LENTO, no
 * roto: otro 60 s no arreglan nada) y una cuarentena activa (el fusible ya
 * decidió por el usuario).
 */
function esFalloTemporal(e: any, msTranscurridos: number): boolean {
  const msg = String(e?.message || e);
  if (/EN CUARENTENA|sin respuesta de/.test(msg)) return false; // el reloj/fusible ya habló
  if (String(e?.name || "") === "AbortError") return false;
  const st = /HTTP (\d{3})/.exec(msg);
  if (st) {
    const n = Number(st[1]);
    return n === 429 || n >= 500; // contestó rápido: el pico suele pasarse
  }
  if (/fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return msTranscurridos < 20_000; // la red se rompió ANTES de esperar: reintentar es barato
  }
  return false;
}

/**
 * El mismo prompt a varias voces: el texto ya salió de `armarPromptConMemoria`.
 *
 * v1.97.3 · REINTENTO ÚNICO SOBRE FALLO TRANSITORIO. Una voz muerta es un voto
 * menos, y el usuario ya pagó caro a las nubes: si el fallo es transitorio
 * (`esFalloTemporal`: 429/5xx rápido, o red rota antes de los 20 s) se duerme
 * 1,5 s y se intenta UNA vez más — no más (el segundo fallo es final: el pico
 * se pasó o no se pasó). Lo no transitorio (clave inválida, créditos agotados,
 * modelo inexistente, tiempo agotado, cuarentena) NO gasta la segunda chance.
 * El mensaje de error llega ya explicado (`explicarFalloProvedor`): la tabla
 * del informe dice «créditos agotados», no una pared de `HTTP 402: {"error"…}`.
 */
async function unaVoz(
  voz: VozPedido,
  sistema: string,
  usuario: string,
  cred: CredencialesEnjambre,
  maxTokens: number,
  timeoutMs: number,
  imagenes?: ImagenParaVoz[]
): Promise<RespuestaVoz> {
  const t0 = Date.now();
  const provider = String(voz.provider || "").toLowerCase();
  try {
    return await intentoDeVoz(voz, sistema, usuario, cred, maxTokens, timeoutMs, imagenes);
  } catch (e: any) {
    if (esFalloTemporal(e, Date.now() - t0)) {
      await dormir(1_500);
      try {
        const segunda = await intentoDeVoz(voz, sistema, usuario, cred, maxTokens, timeoutMs, imagenes);
        return { ...segunda, reintentada: true, ms: Date.now() - t0 };
      } catch (e2: any) {
        const msg = String(e2?.message || e2);
        return { provider, model: voz.model, ok: false, texto: "", error: explicarFalloProvedor(msg).slice(0, 200), ms: Date.now() - t0, reintentada: true };
      }
    }
    const abortado = String(e?.name || "") === "AbortError";
    const msg = abortado ? "tiempo de espera agotado" : String(e?.message || e);
    return { provider, model: voz.model, ok: false, texto: "", error: explicarFalloProvedor(msg).slice(0, 200), ms: Date.now() - t0 };
  }
}

/**
 * UN intento de voz. Lanza los errores de red/HTTP/cuarentena (no los traga):
 * el envoltorio `unaVoz` decide si el fallo se reintenta o es final.
 */
async function intentoDeVoz(
  voz: VozPedido,
  sistema: string,
  usuario: string,
  cred: CredencialesEnjambre,
  maxTokens: number,
  timeoutMs: number,
  imagenes?: ImagenParaVoz[]
): Promise<RespuestaVoz> {
  const t0 = Date.now();
  const provider = String(voz.provider || "").toLowerCase();
  const ctrl = new AbortController();
  const alarma = setTimeout(() => ctrl.abort(), timeoutMs);
  // Solo las voces con visión reciben los píxeles; el resto trabaja con la
  // lista de archivos que `armarPromptConMemoria` ya puso en el texto.
  const ve = modeloConVisionEsperable(voz.model) && Array.isArray(imagenes) && imagenes.length > 0;
  try {
    if (provider === "ollama" || provider === "local") {
      const url = `${String(cred.ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "")}/api/chat`;
      const r = await fetchCloud(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: voz.model,
          stream: false,
          messages: [
            { role: "system", content: sistema },
            // Ollama multimodal: `images` en el turno de usuario (base64 puro).
            ve
              ? { role: "user", content: usuario, images: (imagenes as ImagenParaVoz[]).map((i) => i.base64) }
              : { role: "user", content: usuario },
           ],
         }),
         signal: ctrl.signal,
       });
      if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
      const j: any = await r.json();
      const texto = String(j?.message?.content || j?.response || "");
      return { provider, model: voz.model, ok: texto.trim().length > 0, texto, error: texto.trim() ? undefined : "Ollama respondió vacío", ms: Date.now() - t0 };
    }

    if (provider === "gemini") {
      const clave = String(cred.keys?.gemini || "").trim();
      if (!clave) throw new Error_("sin clave en la ranura de Google Gemini");
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(voz.model)}:generateContent?key=${encodeURIComponent(clave)}`;
      const r = await fetchCloud(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{
            role: "user",
            parts: [
              { text: usuario },
              // Gemini multimodal: `inline_data` junto al texto (base64 puro).
              ...(ve
                ? (imagenes as ImagenParaVoz[]).map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } }))
                : []),
            ],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error_(`Gemini HTTP ${r.status}`);
      const j: any = await r.json();
      const partes = j?.candidates?.[0]?.content?.parts;
      const texto = Array.isArray(partes) ? partes.map((p: any) => String(p?.text || "")).join("") : "";
      return { provider, model: voz.model, ok: texto.trim().length > 0, texto, error: texto.trim() ? undefined : "Gemini respondió vacío", ms: Date.now() - t0 };
    }

    const { base, clave, error } = basePara(provider, cred);
    if (error) throw new Error_(error);
    if (!clave && provider !== "custom") throw new Error_(`sin clave en la ranura de ${provider}`);
    const url = provider === "custom" ? endpointUnificado(cred.customUrl || "") : `${base!.replace(/\/+$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clave) headers["Authorization"] = `Bearer ${clave}`;
    const r = await fetchCloud(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: voz.model,
        temperature: 0.4,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: sistema },
          // OpenAI-compat multimodal: `content` como partes (texto + image_url).
          ve
            ? {
                role: "user",
                content: [
                  { type: "text", text: usuario },
                  ...(imagenes as ImagenParaVoz[]).map((i) => ({
                    type: "image_url",
                    image_url: { url: `data:${i.mimeType};base64,${i.base64}` },
                  })),
                ],
              }
            : { role: "user", content: usuario },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => "");
      throw new Error_(`HTTP ${r.status}${cuerpo ? `: ${cuerpo.slice(0, 120)}` : ""}`);
    }
    const j: any = await r.json();
    const texto = String(j?.choices?.[0]?.message?.content || "");
    return { provider, model: voz.model, ok: texto.trim().length > 0, texto, error: texto.trim() ? undefined : "respuesta vacía", ms: Date.now() - t0 };
  } catch (e: any) {
    // v1.97.3 · el intento NO traga: `unaVoz` decide si el fallo es transitorio
    // (reintento único) o final (error explicado).
    throw e;
  } finally {
    clearTimeout(alarma);
  }
}

/**
 * Llama a TODAS las voces en paralelo (Promise.all, no en serie: el usuario
 * espera una vez, no cuatro). Ninguna voz puede matar la ráfaga: la que falla
 * devuelve su motivo y sigue en el informe.
 */
export async function llamarVoces(
  voces: VozPedido[],
  tarea: string,
  cred: CredencialesEnjambre,
  opts?: { maxTokens?: number; timeoutMs?: number; sistema?: string; imagenes?: ImagenParaVoz[] }
): Promise<RespuestaVoz[]> {
  // v1.86.4 · el default ya no es un literal local: es `SISTEMA_VOCES`, que
  // declara el alcance real de esta llamada (sin tools) y a qué órgano
  // pertenece tocar el disco. Nadie adivina más su alcance.
  const sistema = opts?.sistema || SISTEMA_VOCES;
  const llamadas = (voces || []).map((v) =>
    unaVoz(v, sistema, String(tarea || ""), cred, opts?.maxTokens ?? 1200, opts?.timeoutMs ?? 60_000, opts?.imagenes)
  );
  return Promise.all(llamadas);
}

/** Una sola llamada (el juez). Nunca lanza: devuelve su motivo. */
export async function llamarJuez(
  juez: VozPedido,
  prompt: { sistema: string; usuario: string },
  cred: CredencialesEnjambre,
  opts?: { maxTokens?: number; timeoutMs?: number }
): Promise<RespuestaVoz> {
  return unaVoz(juez, prompt.sistema, prompt.usuario, cred, opts?.maxTokens ?? 1400, opts?.timeoutMs ?? 75_000);
}

/** Proveedores que el enjambre sabe llamar (para `/api/enjambre/estado`). */
export const PROVEEDORES_CONOCIDOS = ["ollama", "gemini", "openai", "openrouter", "zai", "groq", "cerebras", "together", "mistral", "deepseek", "fireworks", "custom"];

// ═══════════════════════════════════════════════════════════════════════════
// v1.88.0 · FASE 2 — EL EJECUTOR
// ═══════════════════════════════════════════════════════════════════════════
// La fase 1 (voces) va SIN `tools` a propósito: deliberar en paralelo y barato.
// Esta función es la otra mitad: UNA voz, EN SERIE, con las herramientas reales
// del IDE y con presupuesto de pasos. No usa `StreamContext` a propósito — el
// ejecutor no habla SSE ni abre el acta del turno de chat (haría global algo que
// debe ser local y podría pisar un turno en vuelo). El resultado viaja al informe.

export interface PasoObra {
  nombre: string;
  ok: boolean;
  resumen: string;
}

export interface ResultadoEjecucion {
  ok: boolean;
  texto: string;
  pasos: PasoObra[];
  vueltas: number;
  error?: string;
  proveedor: string;
  modelo: string;
}

/**
 * ¿Este proveedor puede ejecutar con herramientas en este ejecutor?
 *
 * v1.92.0 — GEMINI DEJA DE ESTAR FUERA. Hasta v1.88.0 se declaraba «sin ejecutor»
 * porque su camino habla otro contrato de tool calling (el SDK, con
 * `functionDeclarations`) y fingir que se ejecuta era peor que no ofrecerlo. Pero
 * la renuncia tenía un costo que cayó encima del usuario: si la voz más sólida del
 * enjambre era Gemini, la fase 2 no tocaba el disco y el veredicto volvía a ser
 * una orden escrita. Mario lo pidió en términos exactos: «que todos puedan usar
 * herramientas o que se llame al modelo con la herramienta». El contrato nativo de
 * REST de Gemini (`:generateContent` + `functionCall`/`functionResponse`) es tan
 * documentado como el de OpenAI, así que ahora se habla EN SU IDIOMA: ver
 * `ejecutarConGemini`. No se traduce a la fuerza el cuerpo de OpenAI: se arma el
 * que Gemini espera.
 */
export function puedeEjecutar(provider: string): boolean {
  const p = String(provider || "").toLowerCase();
  if (p === "ollama" || p === "custom" || p === "local" || p === "gemini") return true;
  return Boolean(BASES_OPENAI_COMPAT[p]);
}

/** Herramienta OpenAI-compat → `functionDeclarations` de Gemini.
 *  Gemini no acepta `type:"function"` ni anida en `function`, y su `parameters`
 *  debe ser un JSON-Schema OBJETO (nunca cadena). Lo que sobre se tira: un
 *  `functionDeclarations` mal formado es un 400 de Gemini, y un 400 en la fase 2
 *  es el «no hizo nada» que el usuario ya no aguanta. */
export function declaracionesGemini(herramientas: any[]): any[] {
  return (herramientas || [])
    .map((h) => {
      const f = h?.function ?? h ?? {};
      const nombre = String(f.name || "").trim();
      if (!nombre) return null;
      let params: any = f.parameters;
      if (typeof params === "string") {
        try { params = JSON.parse(params); } catch { params = undefined; }
      }
      const esquema =
        params && typeof params === "object" && !Array.isArray(params)
          ? params
          : { type: "object", properties: {} };
      return {
        name: nombre,
        description: String(f.description || ""),
        parameters: {
          type: esquema.type || "object",
          properties: esquema.properties && typeof esquema.properties === "object" ? esquema.properties : {},
          ...(Array.isArray(esquema.required) && esquema.required.length ? { required: esquema.required } : {}),
        },
      };
    })
    .filter(Boolean) as any[];
}

/**
 * Fase 2 con Gemini: mismo lazo (modelo pide → se ejecuta → se devuelve el
 * resultado → se cierra), otro envoltorio. Devuelve SIEMPRE un resultado.
 */
async function ejecutarConGemini(opts: EjecutarOpts, base: ResultadoEjecucion, pasos: PasoObra[]): Promise<ResultadoEjecucion> {
  const maxPasos = Math.max(1, Math.min(Number(opts.maxPasos) || 6, 12));
  const maxTokens = Math.max(256, Number(opts.maxTokens) || 2500);
  const timeoutMs = Math.max(5_000, Number(opts.timeoutMs) || 120_000);
  const clave = String(opts.cred.keys?.gemini || "").trim();
  if (!clave) return { ...base, error: "sin clave en la ranura de Google Gemini" };
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(base.modelo)}:generateContent?key=${encodeURIComponent(clave)}`;
  const hacerFetch = opts.doFetch || ((u: string, init: RequestInit) => fetchCloud(u, init));
  const declaraciones = declaracionesGemini(opts.herramientas);
  const contenidos: any[] = [{ role: "user", parts: [{ text: String(opts.usuario || "") }] }];
  for (let vuelta = 1; vuelta <= maxPasos; vuelta++) {
    base.vueltas = vuelta;
    const ctrl = new AbortController();
    const alarma = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const cuerpo: any = {
        systemInstruction: { parts: [{ text: String(opts.sistema || "") }] },
        contents: contenidos,
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      };
      // Solo se declaran herramientas si hay: un array vacío es 400 seguro.
      if (declaraciones.length) cuerpo.tools = [{ functionDeclarations: declaraciones }];
      const r = await hacerFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: ctrl.signal,
      });
      if (!r || r.ok === false) {
        return { ...base, error: `el ejecutor no pudo llamar a gemini: ${r?.status ? `HTTP ${r.status}` : "sin respuesta"}` };
      }
      const j: any = await r.json();
      const partes = j?.candidates?.[0]?.content?.parts;
      const lista = Array.isArray(partes) ? partes : [];
      const texto = lista.map((p: any) => String(p?.text || "")).join("").trim();
      const llamadas = lista.filter((p: any) => p?.functionCall?.name).map((p: any) => p.functionCall);
      if (!llamadas.length) return { ...base, ok: pasos.some((p) => p.ok), texto };

      contenidos.push({ role: "model", parts: llamadas.map((fc: any) => ({ functionCall: { name: fc.name, args: fc.args ?? {} } })) });
      for (const fc of llamadas) {
        const nombre = String(fc?.name || "").trim();
        let salida = "";
        try {
          salida = String((await opts.ejecutarHerramienta(nombre, (fc?.args && typeof fc.args === "object" ? fc.args : {}) as any)) ?? "");
        } catch (e: any) {
          salida = `❌ ${String(e?.message || e)}`;
        }
        pasos.push({ nombre, ok: tuvoEfecto(salida), resumen: salida });
        contentsPush(contenidos, nombre, salida);
      }
    } catch (e: any) {
      const abortado = String(e?.name || "") === "AbortError";
      return { ...base, ok: pasos.some((p) => p.ok), error: abortado ? "tiempo de espera agotado en el ejecutor" : String(e?.message || e).slice(0, 200) };
    } finally {
      clearTimeout(alarma);
    }
  }
  return { ...base, ok: pasos.some((p) => p.ok), error: `tope de ${maxPasos} pasos alcanzado sin cierre` };
}

/** Cierre del turno: Gemini exige las respuestas de función en UN solo `user`. */
function contentsPush(contenidos: any[], nombre: string, salida: string) {
  const parte = { functionResponse: { name: nombre, response: { resultado: salida.slice(0, 8000) } } };
  const ultimo = contenidos[contenidos.length - 1];
  if (ultimo && ultimo.role === "user" && Array.isArray(ultimo.parts) && ultimo.parts.every((p: any) => p?.functionResponse)) {
    ultimo.parts.push(parte);
  } else {
    contenidos.push({ role: "user", parts: [parte] });
  }
}

/** Un resultado de herramienta cuenta como efecto si no es un error declarado. */
function tuvoEfecto(salida: string): boolean {
  return !/^\s*(❌|error\b|hubo un error|no se pudo|no pude)/i.test(String(salida || ""));
}

/** El pedido de la fase 2. Nombrado (v1.92.0) porque lo comparten los dos lazos:
 *  el de OpenAI-compat/Ollama y el nativo de Gemini. */
export interface EjecutarOpts {
  provider: string;
  model: string;
  sistema: string;
  usuario: string;
  cred: CredencialesEnjambre;
  herramientas: any[];
  ejecutarHerramienta: (nombre: string, args: any) => Promise<string>;
  maxPasos?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Inyectable para pruebas: por defecto, el guardián de siempre (`fetchCloud`). */
  doFetch?: (url: string, init: RequestInit) => Promise<any>;
}

/**
 * Ejecuta la tarea con herramientas. Devuelve SIEMPRE un resultado (nunca lanza):
 * el informe necesita poder decir qué pasó, incluso cuando no pasó nada.
 */
export async function ejecutarTareaConHerramientas(opts: EjecutarOpts): Promise<ResultadoEjecucion> {
  const provider = String(opts.provider || "").toLowerCase();
  const modelo = String(opts.model || "");
  const maxPasos = Math.max(1, Math.min(Number(opts.maxPasos) || 6, 12));
  const maxTokens = Math.max(256, Number(opts.maxTokens) || 2500);
  const timeoutMs = Math.max(5_000, Number(opts.timeoutMs) || 120_000);
  const hacerFetch = opts.doFetch || ((url: string, init: RequestInit) => fetchCloud(url, init));
  const pasos: PasoObra[] = [];
  const mensajes: any[] = [
    { role: "system", content: String(opts.sistema || "") },
    { role: "user", content: String(opts.usuario || "") },
  ];
  const base: ResultadoEjecucion = { ok: false, texto: "", pasos, vueltas: 0, proveedor: provider, modelo };

  if (!puedeEjecutar(provider)) {
    return { ...base, error: `«${provider}» no tiene ejecutor con herramientas en el enjambre` };
  }

  // v1.92.0 · Gemini ya no está excluido: su lazo habla `functionDeclarations` /
  // `functionCall` / `functionResponse`. Se bifurca acá y no dentro del bucle para
  // que el cuerpo de OpenAI-compat siga siendo un solo camino legible.
  if (provider === "gemini") return ejecutarConGemini(opts, base, pasos);

  let url = "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "ollama") {
    url = `${String(opts.cred.ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "")}/api/chat`;
  } else {
    const { base: baseUrl, clave, error } = basePara(provider, opts.cred);
    if (error) return { ...base, error };
    if (!clave && provider !== "custom") return { ...base, error: `sin clave en la ranura de ${provider}` };
    url = provider === "custom" ? endpointUnificado(opts.cred.customUrl || "") : `${baseUrl!.replace(/\/+$/, "")}/chat/completions`;
    if (clave) headers["Authorization"] = `Bearer ${clave}`;
  }

  for (let vuelta = 1; vuelta <= maxPasos; vuelta++) {
    base.vueltas = vuelta;
    const ctrl = new AbortController();
    const alarma = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const cuerpo =
        provider === "ollama"
          ? { model: modelo, messages: mensajes, tools: opts.herramientas, stream: false, options: { temperature: 0.2, num_predict: maxTokens } }
          : { model: modelo, messages: mensajes, tools: opts.herramientas, tool_choice: "auto", temperature: 0.2, max_tokens: maxTokens, stream: false };

      const r = await hacerFetch(url, { method: "POST", headers, body: JSON.stringify(cuerpo), signal: ctrl.signal });
      if (!r || r.ok === false) {
        const detalle = r?.status ? `HTTP ${r.status}` : "sin respuesta";
        return { ...base, error: `el ejecutor no pudo llamar a ${provider}: ${detalle}` };
      }
      const j: any = await r.json();
      const msg = provider === "ollama" ? j?.message : j?.choices?.[0]?.message;
      const llamadas: any[] = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];

      if (!llamadas.length) {
        return { ...base, ok: pasos.some((p) => p.ok), texto: String(msg?.content || "").trim() };
      }

      mensajes.push({ role: "assistant", content: msg?.content ?? null, tool_calls: llamadas });

      for (const llamada of llamadas) {
        const nombre = String(llamada?.function?.name || "").trim();
        let args: any = llamada?.function?.arguments;
        if (typeof args === "string") {
          try { args = JSON.parse(args || "{}"); } catch { args = {}; }
        }
        if (!nombre) continue;
        let salida = "";
        try {
          salida = String((await opts.ejecutarHerramienta(nombre, args ?? {})) ?? "");
        } catch (e: any) {
          salida = `❌ ${String(e?.message || e)}`;
        }
        pasos.push({ nombre, ok: tuvoEfecto(salida), resumen: salida });
        mensajes.push({ role: "tool", tool_call_id: llamada?.id ?? nombre, name: nombre, content: salida.slice(0, 8000) });
      }
    } catch (e: any) {
      const abortado = String(e?.name || "") === "AbortError";
      return { ...base, ok: pasos.some((p) => p.ok), error: abortado ? "tiempo de espera agotado en el ejecutor" : String(e?.message || e).slice(0, 200) };
    } finally {
      clearTimeout(alarma);
    }
  }

  return { ...base, ok: pasos.some((p) => p.ok), error: `tope de ${maxPasos} pasos alcanzado sin cierre` };
}

```

### server/estado/proceso.ts (53 líneas)

```ts
/**
 * proceso.ts — EL SEGUNDO ESTADO EXTRAÍDO (Fase 2, v1.12.0)
 * =========================================================
 * QUÉ ES: la memoria de la última medición de CPU del propio proceso, que es lo
 * que permite calcular el porcentaje entre dos llamadas.
 * PARA QUÉ SIRVE: para que `/api/system/stats` pueda vivir fuera del monolito sin
 * llevarse una variable por dentro. Igual que `telemetria.ts`, sale con API de
 * funciones y con el tiempo inyectado.
 *
 * EL DETALLE QUE PARECE UNA TONTERÍA Y NO LO ES
 * El porcentaje de CPU no se puede medir: solo se puede calcular como la
 * DIFERENCIA entre dos instantes. Si el módulo guardara el instante por dentro y
 * lo leyera con `Date.now()`, la única forma de probarlo sería esperar a que
 * pasara tiempo real. Recibiendo `ahora` como parámetro, la prueba fija un
 * intervalo conocido y comprueba el cálculo con números exactos — que es la
 * diferencia entre probar una fórmula y probar una espera.
 *
 * NOTA DE COMPORTAMIENTO: la primera llamada devuelve 0 (no hay con qué comparar).
 * Eso es lo correcto y el monolito hacía lo mismo; se dice aquí para que nadie lo
 * tome por un fallo al verlo por primera vez.
 */

let ultimaMuestra: { user: number; system: number; ts: number } | null = null;

/**
 * Calcula el % de CPU desde la llamada anterior y actualiza la muestra.
 * @param ahora instante actual en ms (inyectado para poder probarlo).
 */
export function porcentajeCpu(ahora: number = Date.now()): number {
  const cpu = process.cpuUsage();
  let porcentaje = 0;
  if (ultimaMuestra) {
    const microsConsumidos = cpu.user - ultimaMuestra.user + (cpu.system - ultimaMuestra.system);
    const msTranscurridos = ahora - ultimaMuestra.ts;
    if (msTranscurridos > 0) {
      // % CPU = (tiempo de CPU consumido / tiempo transcurrido) * 100, sobre un núcleo.
      porcentaje = Math.min(100, Math.max(0, microsConsumidos / 1000 / msTranscurridos * 100));
    }
  }
  ultimaMuestra = { user: cpu.user, system: cpu.system, ts: ahora };
  return Math.round(porcentaje * 10) / 10;
}

/** Olvida la muestra anterior (diagnóstico y pruebas). */
export function reiniciarMuestraProceso(): void {
  ultimaMuestra = null;
}

/** La muestra cruda, para inspección. */
export function muestraProceso(): { user: number; system: number; ts: number } | null {
  return ultimaMuestra;
}

```

### server/estado/sandbox.ts (141 líneas)

```ts
/**
 * sandbox.ts — EL ESTADO DEL SANDBOX (Fase 2, v1.13.0)
 * ====================================================
 * QUÉ ES: quién manda sobre el proceso del sandbox (el servidor dev del proyecto
 * en :3500): si está vivo, con qué PID, y cómo se le mata. Antes era una variable
 * suelta (`let sandboxProc`) más una función de apoyo (`isPidAlive`) repartidas por
 * el monolito, con 35 sitios tocándolas directamente.
 * PARA QUÉ SIRVE: para que las rutas del sandbox puedan salir de `server.ts` sin
 * llevarse la variable dentro. Es el ÚLTIMO bloque grande de estado compartido: con
 * él extraído, lo que queda en el monolito son rutas y funciones, no dueños de
 * datos — y eso es lo que convierte las 121 rutas restantes en mecánica.
 *
 * ESTE MÓDULO NO ES UNA CAJA DE CRISTAL, ES UNA PUERTA
 * `procesoActual()` devuelve el objeto del proceso porque hay cosas que no se
 * pueden hacer de otra forma: engancharle los streams del log y sus manejadores de
 * `exit`/`error` (eso pasa en el momento del spawn, con el objeto recién creado; no
 * tiene sentido envolverlo). Lo que NO se puede hacer es guardar el proceso en una
 * variable del monolito: para eso están `registrarProceso` y `olvidarProceso`.
 * La diferencia importa: 35 sitios escribiendo una variable global no tienen dueño;
 * 35 sitios pasando por cuatro funciones, sí.
 *
 * `olvidarProceso(siEs)` — LA COREOGRAFÍA DEL ANTI-ZOMBIE
 * Los manejadores de salida hacen `if (sandboxProc === proc) sandboxProc = null`:
 * solo olvidan el proceso si el que muere es el que está registrado. Eso evita la
 * carrera clásica de «arranco uno nuevo, muere el viejo y borra la referencia del
 * nuevo», y aquí se conserva tal cual: `olvidarProceso(proc)` hace exactamente esa
 * comprobación. No es una comodidad: es la pieza que evita que el sandbox quede
 * registrado cuando en realidad está muerto, o al revés.
 */

/**
 * ¿Está vivo este PID? Movida VERBATIM desde el monolito.
 * `EPERM` significa que el proceso existe pero es de otro usuario: cuenta como vivo.
 */
export const isPidAlive = (pid: number | undefined): boolean => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === "EPERM";
  }
};

/** El proceso del sandbox tal cual lo devuelve `spawn`. Se tipa como unknown-ish a propósito. */
type ProcesoSandbox = {
  pid?: number;
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(evento: string, cb: (...args: any[]) => void): unknown;
};

let proc: ProcesoSandbox | null = null;

/**
 * Registra el proceso recién arrancado.
 *
 * AQUÍ APARECIÓ UN FALLO LATENTE, Y MERECE QUEDAR ESCRITO
 * `spawnSandbox()` no siempre devuelve un proceso: hay caminos en los que falla al
 * arrancar, responde al cliente y **devuelve una `Response` HTTP**. El monolito
 * hacía `sandboxProc = spawnSandbox()` con `sandboxProc` tipado como `any`, así que
 * en esos caminos guardaba una RESPUESTA HTTP como si fuera «el proceso del
 * sandbox». No se notaba porque después solo se le preguntaba por `.pid` (que era
 * `undefined`, o sea «no vivo») y `.kill()` lanzaba y estaba capturado. Al poner
 * tipos, el compilador lo dijo en tres sitios.
 *
 * Ahora se registra SOLO lo que parece un proceso (tiene `kill` y `on`). Si llega
 * una respuesta de error, no se registra nada: el sandbox sigue siendo «no hay
 * proceso», que es exactamente la verdad en ese momento. El comportamiento
 * observable es el mismo que antes, pero deja de haber una mentira guardada.
 */
export function registrarProceso(p: unknown): void {
  if (p && typeof (p as ProcesoSandbox).kill === "function" && typeof (p as ProcesoSandbox).on === "function") {
    proc = p as ProcesoSandbox;
  }
}

/**
 * Deja de seguir el proceso. Con argumento, solo si es el que está registrado
 * (la comprobación anti-zombie de los manejadores de salida). Sin argumento,
 * olvida el que haya.
 */
export function olvidarProceso(siEs?: ProcesoSandbox): void {
  if (siEs === undefined || proc === siEs) proc = null;
}

/** El proceso actual, para engancharle streams y manejadores. `null` si no hay. */
export function procesoActual(): ProcesoSandbox | null {
  return proc;
}

/** ¿Está vivo el sandbox? Responde a la única pregunta que hace casi todo el mundo. */
export function sandboxVivo(): boolean {
  return Boolean(proc && isPidAlive(proc.pid));
}

/** El PID del sandbox, si lo hay. */
export function pidSandbox(): number | null {
  return proc?.pid ?? null;
}

/**
 * Intenta matar el sandbox. Devuelve si se pudo intentar (no si murió: eso lo dice
 * `sandboxVivo()` después). Nunca lanza: matar un proceso que ya no está es normal.
 */
export function matarProceso(signal: NodeJS.Signals | number = "SIGKILL"): boolean {
  try {
    if (!proc) return false;
    proc.kill(signal);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v1.87.1 · QUÉ CARPETA ESTÁ SIRVIENDO EL PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
// EL ATASCO QUE ESTO CIERRA (sesión 1793219578712, mensaje 18: «en el sandbox
// no se generó nada, lo que se ve es un proyecto viejo y erróneo»): con el
// sandbox vivo, `/api/sandbox/start` devolvía `alreadyRunning` SIN mirar qué
// raíz servía. Si el usuario fijaba otra carpeta (CANAL DIRECTO) o el pin
// cambiaba, el preview se quedaba en la raíz vieja para siempre: el proceso
// seguía vivo, así que ningún reinicio ocurría jamás.
//
// Es UN dato, no una política: el módulo guarda lo que se arrancó; comparar y
// decidir es de la ruta. Sin este dato la ruta no podía distinguir «el mismo
// preview» de «otro preview con la misma pregunta».
let raizServida: string | null = null;

/** Se llama al arrancar de verdad un sandbox (estático o npm), con su raíz. */
export function registrarRaizServida(raiz: string): void {
  raizServida = raiz ? String(raiz) : null;
}

/** La raíz que está sirviendo el preview AHORA. `null` = no se arrancó en esta sesión. */
export function raizServidaActual(): string | null {
  return raizServida;
}

```

### server/estado/telemetria.ts (143 líneas)

```ts
/**
 * telemetria.ts — EL PRIMER ESTADO EXTRAÍDO (Fase 2, v1.12.0)
 * ==========================================================
 * QUÉ ES: la caché de telemetría del servidor (cuándo se miró por última vez si
 * Ollama y el puente responden, y qué se vio) con una API de tres funciones.
 * PARA QUÉ SIRVE: para que las rutas que informan del estado del sistema no
 * necesiten vivir dentro del monolito. Es la primera pieza de ESTADO que sale de
 * `server.ts`, y por eso importa más de lo que parece: es el ensayo de lo que hay
 * que hacer con las otras dieciocho variables globales.
 *
 * POR QUÉ EL ESTADO ES EL PASO DIFÍCIL (y por qué este es el bueno para empezar)
 * Mover una ruta es mover código. Mover estado es cambiar quién manda sobre él.
 * Una variable global suelta no dice nada: no se sabe quién la escribe, ni cuándo,
 * ni qué contratos hay detrás. Este módulo lo dice en tres funciones —leer, guardar
 * y invalidar— y con una regla: NADIE toca la caché por dentro, todos pasan por
 * aquí. Cuando se extraigan `sandboxProc` o los contadores de CPU se usará esta
 * misma receta, y ya estará probada.
 *
 * POR QUÉ EL TIEMPO SE INYECTA (`ahora`)
 * `muestraVigente()` recibe el instante en lugar de leer `Date.now()`. No es
 * purismo: es lo que permite **probar la caducidad sin esperar diez segundos**.
 * Un módulo que lee el reloj por dentro solo se puede probar durmiendo, y las
 * pruebas que duermen son las primeras que se quitan cuando van lentas.
 */

export interface MuestraTelemetria {
  /** Instante en que se tomó la muestra (ms desde epoch). */
  timestamp: number;
  /** Lo que se respondió: puertos vivos y número de modelos. */
  data: unknown;
}

/**
 * Los dos tiempos, y por qué son generosos (venían documentados en el monolito):
 * se subieron a 10 s de caché y 35 s de sondeo porque Ollama puede tardar 28 s o
 * más cuando está cargando un modelo, y con timeouts cortos el indicador parpadeaba
 * a «11434 OFF» durante cualquier conversación larga. Ese falso negativo es peor
 * que un dato viejo: hace que el usuario reinicie Ollama sin motivo.
 */
export const TELEMETRY_CACHE_MS = 10000; // 10 s de caché
export const TELEMETRY_PROBE_MS = 35000; // 35 s de sondeo

/**
 * v2.2.3 · EL PRESUPUESTO QUE FALTABA
 * -----------------------------------
 * Los 35 s de sondeo están bien y no se tocan (ver arriba: Ollama tarda 28 s con
 * un modelo cargando). El problema era de **presupuesto**, no de valor: la ruta
 * `plazoApi` corta cualquier `/api` a los 20 s y manda 504. Con un daemon trabado,
 * `/api/telemetry/ports` tardaba hasta 35 s, o sea **después** de que el middleware
 * ya había respondido — y el cliente (`src/App.tsx`, `checkTelemetry`) hace
 * `if (res.ok)` con un `catch {}` vacío. Resultado: los chips de la cabecera
 * seguían pintando la última muestra buena como si estuviera viva, mientras la
 * espina decía «servidor local caído» con razón. Medido en la pantalla de Mario
 * (03/11): hoja de ruta con marca 15:44 y reloj del sistema 17:05.
 *
 * La salida no es acortar el sondeo (eso reabre el falso «11434 OFF» que este
 * archivo documenta desde v1.16), es **contestar adentro del presupuesto con lo
 * que se sepa**, y decir qué falta. `sin_medir` no es `muerto`.
 */
export const PLAZO_SONDEO_LOCAL_MS = Number(process.env.CN_PLAZO_SONDEO_LOCAL_MS || 6000);
export const PRESUPUESTO_TELEMETRIA_MS = Number(process.env.CN_PRESUPUESTO_TELEMETRIA_MS || 30000);
/** El plazo del middleware (`server/middleware/plazoApi.ts`): presupuesto < plazo. */
export const PLAZO_API_MS = Number(process.env.CN_PLAZO_API_MS || 45000);

export type LecturaSonda = "vivo" | "muerto" | "sin_medir";

export interface PuertoResuelto {
  /** El booleano de siempre, para no romper a nadie. */
  vivo: boolean;
  /** Por qué. Vacío cuando la lectura es limpia. */
  motivo: string;
  /** true cuando el valor NO viene de esta muestra (se conservó el anterior). */
  heredado: boolean;
}

/**
 * La edad en texto vive en `src/engine/haceTexto.ts`: lo consumen el servidor (para
 * escribir el `motivo`) y los paneles (para decir hace cuánto se leyó). Re-exportarlo
 * acá es la forma de tener UNA sola implementación del texto.
 */
import { haceTexto } from "../../src/engine/haceTexto";

export { haceTexto, edadLectura } from "../../src/engine/haceTexto";

/**
 * Decide cómo se reporta un puerto a partir de la lectura actual, la anterior y
 * el instante. Puro: entra `ahora` por parámetro, como el resto del módulo.
 *
 * La regla que importa: **una lectura que no llegó no afirma que el servicio
 * esté caído.** Si antes estaba vivo, se conserva el valor y se marca `heredado`
 * con la edad; si estaba caído (o nunca se lo midió), se dice caído sin adornos.
 */
export function resolverPuerto(
  lectura: LecturaSonda,
  anterior: { vivo: boolean; timestamp: number } | undefined,
  ahora: number,
): PuertoResuelto {
  if (lectura === "vivo") return { vivo: true, motivo: "", heredado: false };
  if (lectura === "muerto") return { vivo: false, motivo: "", heredado: false };
  if (!anterior) {
    return { vivo: false, motivo: "sin respuesta y sin lectura anterior: no se lo midio nunca", heredado: false };
  }
  const haceMs = Math.max(0, ahora - anterior.timestamp);
  if (!anterior.vivo) return { vivo: false, motivo: `sin respuesta; la lectura anterior ya estaba caida (${haceTexto(haceMs)})`, heredado: false };
  return {
    vivo: true,
    motivo: `sin respuesta en esta muestra: se conserva la ultima lectura (${haceTexto(haceMs)})`,
    heredado: true,
  };
}

let cache: MuestraTelemetria | null = null;

/** La última muestra que hay, **aunque ya esté vencida** (para no inventar «caído»). */
export function ultimaMuestraConocida(): MuestraTelemetria | null {
  return cache;
}

/** Lo que hay en la caché SI sigue fresco; `null` si toca volver a sondear. */
export function muestraVigente(ahora: number = Date.now()): unknown | null {
  if (cache && ahora - cache.timestamp < TELEMETRY_CACHE_MS) return cache.data;
  return null;
}

/** Guarda una muestra recién tomada. */
export function guardarMuestra(data: unknown, ahora: number = Date.now()): void {
  cache = { timestamp: ahora, data };
}

/**
 * Tira la caché para forzar un sondeo nuevo (`POST /api/telemetry/refresh`).
 * Existe porque el usuario puede saber algo que el servidor no: acaba de arrancar
 * Ollama y no quiere esperar diez segundos a que la caché caduque sola.
 */
export function invalidarMuestra(): void {
  cache = null;
}

/** Solo para pruebas y diagnóstico: la muestra cruda, sin juicio de frescura. */
export function muestraCruda(): MuestraTelemetria | null {
  return cache;
}

```

### server/fabricaApk.ts (353 líneas)

```ts
// ============================================================
// FABRICA APK — v1.57.17 · EL MISMO MOTOR PARA EL BOTÓN Y PARA EL CHAT
// ============================================================
// Hasta hoy, exportar un APK era privilegio de la interfaz: las rutas
// /api/export/android/* vivían en exportacion.ts con su estado de trabajo en
// closures, y el AGENTE no tenía manos — en la sesión de la app de finanzas,
// ante «exportame en apk», recetó Capacitor por chat como si la fábrica no
// existiera. Este módulo extrae la fábrica SIN Duplicar el trabajo:
//
//   · UN solo trabajo vivo de Gradle (el botón y el chat pelean por el mismo
//     slot: dos compilaciones simultáneas en una máquina de 16 GB es una forma
//     creativa de tumbar la IDE del usuario — la regla nace de la ruta original);
//   · el sondeo de herramientas (java/SDK/wrapper) es UNA función, no dos copias
//     que se desincronizan;
//   · generar desde el chat pasa por los mismos guardes que la ruta: web
//     compilada, index.html presente, appId válido — el modelo no puede
//     atropellar los candados del humano.
//
// La lógica de DECISIÓN (qué ruta de build elegir, clasificar fallos, verificar
// el APK) ya era pura en src/engine/apkBuild; acá solo vive la orquestación con
// efectos, con `spawn` inyectable para poder probarla en seco.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "child_process";
import { elegirRutaDeBuild, clasificarFalloBuild, rutaRelApkDebug, apkVerificado } from "../src/engine/apkBuild";
// v1.0.14 · el Gradle que la propia IDE baja («Preparar herramientas») es una
// ruta legítima más de la fábrica: mismo spawn, mismos candados, mismo log.
import { rutasProvisionadas, herramientasDirActiva } from "./aprovisionarToolchain";
import { localPropertiesContenido } from "../src/engine/toolchainPlan";
import { analizarProyecto, veredictoAndroid, appIdValido, appIdDesdeNombre } from "../src/engine/mobileExport";
import {
  generarProyectoAndroid, escribirProyectoAndroid, leerWebParaAndroid,
  orientacionValida, AGP_VERSION, GRADLE_VERSION,
} from "../src/engine/androidProyecto";

// ── sondeo e inventario del sandbox ────────────────────────────────────────

/** Sondeo REAL de la máquina. Con pruebas, no con optimismo. */
export function sondearHerramientasAndroid(projectRoot: string) {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  let javaVersion = "";
  try {
    const r = spawnSync("java", ["-version"], { encoding: "utf-8", timeout: 5000, windowsHide: true });
    // `java -version` escribe en stderr, no en stdout: esto no es un error.
    javaVersion = `${r.stderr || ""}${r.stdout || ""}`.split("\n")[0].trim();
  } catch { javaVersion = ""; }
  let plataformasSdk: string[] = [];
  if (androidHome) {
    try { plataformasSdk = fs.readdirSync(path.join(androidHome, "platforms")); } catch { plataformasSdk = []; }
  }
  const proyectoAndroid =
    fs.existsSync(path.join(projectRoot, "android", "gradlew")) ||
    fs.existsSync(path.join(projectRoot, "android", "gradlew.bat"));
  const adb = androidHome
    ? fs.existsSync(path.join(androidHome, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"))
    : false;
  return { nodeVersion: process.versions.node, javaVersion, androidHome, plataformasSdk, tieneGradle: proyectoAndroid, tieneAdb: adb };
}

/** Qué proyecto hay en el sandbox ahora mismo (la misma lectura que hace la ruta). */
export function leerProyectoSandbox(projectRoot: string) {
  let packageJson: string | null = null;
  try { packageJson = fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"); } catch { packageJson = null; }
  let archivosRaiz: string[] = [];
  try { archivosRaiz = fs.readdirSync(projectRoot); } catch {}
  return analizarProyecto({ packageJson, archivosRaiz });
}

// ── el trabajo de compilación: UNO vivo, cola acotada ──────────────────────

export interface TrabajoApk {
  id: string;
  estado: "corriendo" | "exito" | "fallido";
  inicio: number;
  fin?: number;
  lineas: string[];
  codigo?: number;
  fallo?: { causa: string; solucion: string };
  apk?: { ruta: string; bytes: number };
  explicacionRuta: string;
  rutaGradle: string;
}

const MAX_LINEAS = 400; // cola acotada por el final: el log puede ser kilométrico
const LIMITE_MS = 10 * 60 * 1000; // 10 min: si Gradle no terminó, algo está podrido

let trabajoVivo: TrabajoApk | null = null;
const TRABAJOS: TrabajoApk[] = [];
// El id lleva SECUIAL además del reloj: dos lanzamientos dentro del mismo
// milisegundo (test, doble clic nervioso) chocaban y buscar devolvía el trabajo
// viejo — la suite exportarApk lo cazó. Un id no puede ser una promesa ambigua.
let secuencialId = 0;

function empujarLinea(t: TrabajoApk, chunk: string) {
  for (const l of String(chunk).split(new RegExp("\\r?\\n"))) {
    if (!l.trim()) continue;
    t.lineas.push(l);
    if (t.lineas.length > MAX_LINEAS) t.lineas.splice(0, t.lineas.length - MAX_LINEAS);
  }
}

export function trabajoVivoApk(): TrabajoApk | null { return trabajoVivo; }
export function ultimoTrabajoApk(): TrabajoApk | null { return TRABAJOS.length ? TRABAJOS[TRABAJOS.length - 1] : null; }
export function buscarTrabajoApk(id: string): TrabajoApk | null { return TRABAJOS.find((x) => x.id === id) || null; }

export interface LanzamientoResultado {
  ok: boolean;
  yaEnMarcha?: boolean;
  error?: string;
  trabajo?: TrabajoApk;
  hechos?: { existeGradlew: boolean; existeWrapperJar: boolean; tieneGradleSistema: boolean; gradleLocalExiste?: boolean };
}

/**
 * Lanza la compilación Gradle (o devuelve la que ya está viva). `spawnFn` y
 * `probeGradle` son inyectables para probar el ciclo completo en seco.
 */
export function lanzarCompilacionApk(
  projectRoot: string,
  deps: { spawnFn?: typeof spawn; probeGradleSistema?: () => boolean; herramientasDir?: string } = {},
): LanzamientoResultado {
  if (trabajoVivo && trabajoVivo.estado === "corriendo") {
    return { ok: true, yaEnMarcha: true, trabajo: trabajoVivo };
  }
  const carpeta = path.join(projectRoot, "android");
  if (!fs.existsSync(path.join(carpeta, "app", "build.gradle"))) {
    return {
      ok: false,
      error:
        "No hay proyecto Android que compilar (falta android/app/build.gradle). " +
        "Pulsá antes «Generar proyecto» — sin eso, Gradle solo daría un error críptico.",
    };
  }
  // v1.0.14 · ANTES de rendirse, mirar la carpeta de datos: quizá el usuario ya
  // pulsó «Preparar herramientas» y el Gradle propio de la IDE está en disco.
  const dirHerr = deps.herramientasDir || herramientasDirActiva();
  const provision = dirHerr ? rutasProvisionadas(dirHerr) : null;
  const hechos = {
    existeGradlew: fs.existsSync(path.join(carpeta, "gradlew")) || fs.existsSync(path.join(carpeta, "gradlew.bat")),
    existeWrapperJar: fs.existsSync(path.join(carpeta, "gradle", "wrapper", "gradle-wrapper.jar")),
    tieneGradleSistema: deps.probeGradleSistema
      ? deps.probeGradleSistema()
      : (() => {
          try {
            const r = spawnSync("gradle", ["-v"], { encoding: "utf-8", timeout: 8000, windowsHide: true });
            return r.status === 0;
          } catch { return false; }
        })(),
    gradleLocal: { existe: !!provision?.gradle, ruta: provision?.gradle ? provision.rutas.gradleBin : undefined },
  };
  const decision = elegirRutaDeBuild(hechos);
  if (decision.ruta === "ninguna") {
    return { ok: false, error: decision.explicacion, hechos };
  }

  const trabajo: TrabajoApk = {
    id: `apk-${Date.now()}-${++secuencialId}`,
    estado: "corriendo",
    inicio: Date.now(),
    lineas: [],
    explicacionRuta: decision.explicacion,
    rutaGradle: decision.ruta,
  };
  trabajoVivo = trabajo;
  TRABAJOS.push(trabajo);
  if (TRABAJOS.length > 20) TRABAJOS.splice(0, TRABAJOS.length - 20);

  const cerrar = (extra: Partial<TrabajoApk>) => {
    trabajo.estado = extra.estado || "fallido";
    trabajo.fin = Date.now();
    Object.assign(trabajo, extra);
    if (trabajoVivo === trabajo) trabajoVivo = null;
  };

  const spawnFn = deps.spawnFn || spawn;
  // v1.0.14 · con `gradle-local` la máquina no tiene nada instalado: el spawn
  // tiene que llevarse su propio JAVA_HOME/ANDROID_HOME/PATH (el toolchain que
  // bajó la IDE) y `android/local.properties` para que AGP vea el SDK. Se
  // escribe el archivo SOLO cuando el SDK es el aprovisionado: si el usuario
  // tiene el suyo, manda el suyo — no pise config ajena.
  let entorno: NodeJS.ProcessEnv = { ...process.env };
  if (decision.ruta === "gradle-local" && provision) {
    const sep = process.platform === "win32" ? ";" : ":";
    if (provision.jdk) {
      entorno.JAVA_HOME = provision.rutas.jdkDir;
      entorno.PATH = `${path.join(provision.rutas.jdkDir, "bin")}${sep}${entorno.PATH || ""}`;
    }
    entorno.ANDROID_HOME = provision.androidHome;
    entorno.ANDROID_SDK_ROOT = provision.androidHome;
    try { fs.writeFileSync(path.join(carpeta, "local.properties"), localPropertiesContenido(provision.androidHome), "utf-8"); } catch { /* Gradle también lee ANDROID_HOME: no es fatal */ }
  }
  let child;
  try {
    child = spawnFn(decision.comando, decision.argumentos, {
      cwd: carpeta,
      env: entorno,
      shell: false, // argumentos FIJOS: no hay entrada del usuario en esta línea
      windowsHide: true,
    });
  } catch (e: any) {
    const f = clasificarFalloBuild(String(e?.message || e));
    cerrar({ estado: "fallido", codigo: -1, fallo: f });
    return { ok: false, error: `No se pudo lanzar Gradle: ${e?.message || e}`, trabajo };
  }

  child.stdout?.on("data", (d) => empujarLinea(trabajo, String(d)));
  child.stderr?.on("data", (d) => empujarLinea(trabajo, String(d)));
  child.on("error", (e: any) => {
    empujarLinea(trabajo, `⚠ ${e?.message || e}`);
    cerrar({ estado: "fallido", codigo: -1, fallo: clasificarFalloBuild(String(e?.message || e)) });
  });

  const matar = setTimeout(() => {
    if (trabajo.estado === "corriendo") {
      empujarLinea(trabajo, "⏱ 10 minutos: se cortó el proceso. Gradle colgado o máquina sin aire.");
      try { child.kill("SIGKILL"); } catch {}
      cerrar({
        estado: "fallido",
        fallo: {
          causa: "La compilación superó los 10 minutos y se cortó.",
          solucion: "Suele ser la primera vez: Gradle baja AGP y dependencias. Conectá bien y reintentá; si vuelve a colgarse, mirá android/.gradle.",
        },
      });
    }
  }, LIMITE_MS);
  if (typeof matar?.unref === "function") matar.unref();

  child.on("close", (code) => {
    clearTimeout(matar);
    // ÉXITO = código 0 Y archivo presente Y con tamaño creíble. Las tres cosas:
    // Gradle puede decir éxito y no dejar APK (config rara), y un APK de 3 KB es
    // un archivo corrupto anunciándose como verde.
    const rutaApk = path.join(projectRoot, rutaRelApkDebug("android"));
    let verif = { ok: false, mensaje: "sin APK" };
    try {
      const st = fs.statSync(rutaApk);
      verif = apkVerificado(true, st.size);
      if (verif.ok) trabajo.apk = { ruta: rutaApk, bytes: st.size };
    } catch {
      verif = apkVerificado(false, 0);
    }
    if (code === 0 && verif.ok) {
      cerrar({ estado: "exito", codigo: 0 });
    } else {
      const cola = trabajo.lineas.slice(-40).join("\n") + (verif.ok ? "" : `\n${verif.mensaje}`);
      cerrar({ estado: "fallido", codigo: code ?? -1, fallo: clasificarFalloBuild(cola) });
    }
  });

  return { ok: true, trabajo, hechos };
}

// ── generar el proyecto: los mismos candados de la ruta, sin HTTP ─────────

export interface CuerpoGenerar {
  appId?: string; nombreApp?: string; versionName?: string; versionCode?: number;
  colorPrimario?: string; orientacion?: string; necesitaRed?: boolean; forzar?: boolean;
}

export function generarAndroidDesdeChat(projectRoot: string, cuerpo: CuerpoGenerar = {}): { ok: boolean; error?: string; message?: string; [k: string]: any } {
  const proyecto = leerProyectoSandbox(projectRoot);
  if (!proyecto.exportableAAndroid) return { ok: false, error: proyecto.razon };

  const pedido = String(cuerpo.appId || "").trim();
  const appId = pedido || appIdDesdeNombre(proyecto.nombre);
  if (!appIdValido(appId)) {
    return {
      ok: false,
      error:
        `«${appId}» no sirve como appId de Android: dominio al revés, en minúsculas, sin empezar por número ` +
        `(ejemplo: com.tunombre.${proyecto.nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "app"}).`,
    };
  }

  // La web tiene que estar COMPILADA: generar con la web anterior daría un APK
  // verde que empaqueta cosas viejas.
  const leido = leerWebParaAndroid(path.join(projectRoot, proyecto.carpetaSalida));
  if (!leido.raiz) {
    return {
      ok: false,
      error:
        `No encontré la carpeta de salida «${proyecto.carpetaSalida}». Compila la web antes de exportar` +
        (proyecto.comandoBuild ? ` («${proyecto.comandoBuild}»)` : "") +
        `. Sin esto el APK saldría con una versión anterior o en blanco.`,
    };
  }
  if (!leido.texto.some((f) => f.ruta === "index.html")) {
    return { ok: false, error: `«${proyecto.carpetaSalida}» no tiene index.html: el WebView abriría en blanco. Revisa la carpeta de salida del build.` };
  }

  let gen;
  try {
    gen = generarProyectoAndroid({
      nombreApp: String(cuerpo.nombreApp || "").trim() || proyecto.nombre,
      appId,
      versionName: String(cuerpo.versionName || "").trim() || proyecto.version || "1.0.0",
      versionCode: Number.isInteger(Number(cuerpo.versionCode)) && Number(cuerpo.versionCode) > 0 ? Number(cuerpo.versionCode) : 1,
      colorPrimario: String(cuerpo.colorPrimario || "").trim() || undefined,
      orientacion: orientacionValida(cuerpo.orientacion) ?? "portrait",
      necesitaRed: cuerpo.necesitaRed === true,
      archivosWeb: leido.texto,
      binariosWeb: leido.binarios,
    });
  } catch (e: any) {
    return { ok: false, error: `El generador falló: ${e?.message || e}` };
  }
  const r = escribirProyectoAndroid(projectRoot, gen, { forzar: cuerpo.forzar === true });
  const android = veredictoAndroid(proyecto, sondearHerramientasAndroid(projectRoot));
  return {
    ok: true,
    appId: gen.appId,
    generados: r.escritos.length,
    omitidos: r.omitidos,
    conflictos: r.conflictos,
    puedeConstruir: android.puedeConstruir,
    faltan: android.faltan,
    message:
      `Proyecto Android generado en «${gen.carpeta}/» (${r.escritos.length} archivos, AGP ${AGP_VERSION} + Gradle ${GRADLE_VERSION}). ` +
      (r.conflictos.length ? `No se pisaron ${r.conflictos.length} archivos con tus ediciones (repite con forzar=true si querés reemplazarlos). ` : "") +
      (android.puedeConstruir
        ? "Esta máquina ya tiene lo necesario: accion=compilar lanza Gradle."
        : `Para COMPILAR todavía falta: ${android.faltan.join(" · ")}. Generar no es compilar.`),
  };
}

/** Resumen de estado para el chat: qué hay vivo, qué salió, dónde está el APK. */
export function estadoAndroidDesdeChat(projectRoot: string) {
  const t = trabajoVivoApk() || ultimoTrabajoApk();
  const rutaApk = path.join(projectRoot, rutaRelApkDebug("android"));
  let apkEnDisco: { bytes: number } | null = null;
  try {
    const st = fs.statSync(rutaApk);
    const v = apkVerificado(true, st.size);
    if (v.ok) apkEnDisco = { bytes: st.size };
  } catch {}
  if (!t) return { ok: true, hayTrabajo: false, apkEnDisco, message: "Sin trabajos de compilación en esta sesión. accion=generar primero, luego compilar." };
  return {
    ok: true, hayTrabajo: true, id: t.id, estado: t.estado,
    segundos: Math.round(((t.fin || Date.now()) - t.inicio) / 1000),
    fallo: t.fallo || null,
    apk: t.apk ? { bytes: t.apk.bytes } : null,
    apkEnDisco,
    lineaFinal: t.lineas.length ? t.lineas[t.lineas.length - 1] : "",
    message: t.estado === "corriendo"
      ? "Compilación en marcha: volvé a preguntar en unos segundos."
      : t.estado === "exito"
        ? `APK listo (${(t.apk?.bytes || 0).toLocaleString("es")} bytes): descargable desde la interfaz (GET /api/export/android/apk) o en ${t.apk?.ruta}.`
        : `La compilación falló: ${t.fallo?.causa || "sin diagnóstico"} — ${t.fallo?.solucion || "revisá el log."}`,
  };
}

```

### server/fetchCloud.ts (173 líneas)

```ts
/**
 * fetchCloud.ts — v1.46.0 · LA DESCARGA CON TECHO DE TIEMPO, FUERA DEL MONOLITO
 * =============================================================================
 * MOVIMIENTO, NO MEJORA. Eran 21 líneas autocontenidas dentro de `server.ts`.
 * Salen por dos motivos, y el segundo es el que obliga:
 *   1. El monolito tiene trinquete (`contrato-rutas.json`): no puede crecer.
 *   2. Al mover las rutas de descubrimiento de modelos a `server/routers/modelos.ts`,
 *      ese módulo necesita esta función. Importarla desde `server.ts` habría
 *      creado una importación CIRCULAR (server.ts → modelos.ts → server.ts).
 *      Un módulo hoja importado por los dos rompe el ciclo y no duplica código.
 */

// El techo de espera del PRIMER byte, movido CON la función que lo usa: era la
// única que lo leía. Sin esto, el módulo no compilaba (no había de dónde sacarlo).
// v1.6.21 — 45 s → 120 s. ESTE TECHO ERA DEMASIADO AGRESIVO, Y LO PAGABA EL
// USUARIO CON «A VECES NO RESPONDEN».
//
// El razonamiento de la v1.6.16 sigue siendo bueno: no dejar la interfaz en
// blanco ocho minutos. Pero un proveedor SOBRECARGADO —Z.ai devolviendo 1305—
// no está mudo: está lento. Tarda 50, 60, 90 segundos en arrancar y luego
// escribe. A los 45 s se le cortaba, y el usuario no veía ni un error de Z.ai
// ni una respuesta: no veía nada.
//
// 120 s separa bien los dos casos: un cuelgue real se corta igual, y un
// proveedor lento pero vivo ya no se mata. Se pierde algo de inmediatez en el
// aviso de cuelgue, y se gana que Z.ai sobrecargado sí conteste.
//
// La solución de fondo sería un techo de INACTIVIDAD (cortar solo si pasan N
// segundos sin que llegue nada, en vez de un límite fijo antes de la primera
// cabecera), pero eso vive donde se consume el cuerpo del stream, no aquí.
import { presupuestoPrimerByte, registrarPrimerByte, causaReal, modelosMedidos, sugerirAlternativa } from "../src/engine/relojModelos";
import { registrarFalloProveedor, registrarExitoProveedor, enCuarentena, notaCuarentena } from "../src/engine/fusibleProveedores";
// v1.87.0 · LA ADUANA DE SALIDA Y LA ESPERA QUE EL PROVEEDOR DECLARA.
// Las dos viven en módulos puros con suite propia; acá solo se llaman.
import { sanearInit, esDestinoLocal } from "../src/engine/guardaEgreso";
import { puedeLlamar, registrarCuota, notaEspera } from "../src/engine/cuotaProveedor";
const CLOUD_FIRST_BYTE_TIMEOUT_MS = 120_000;
// ============================================================
// v1.57.18 · EL RELOJ MEDIDO — el 120 de arriba deja de ser EL tope y pasa a ser
// el PISO de último recurso. El presupuesto real lo da relojModelos: p95 medido
// de las últimas llamadas de ESE modelo x margen, con piso y techo propios. En
// la sesión 1792103924951 glm-4.5-flash murió 2x contra el 120 fijo y 4x con
// `fetch failed` cuya causa real viajaba oculta: ahora el mensaje la dice
// (ECONNRESET, ETIMEDOUT...) y cada resultado alimenta la medición y el fusible.
// ============================================================
/** v1.87.0 · `Headers` → objeto plano, que es lo que habla `cuotaProveedor`. */
function cabecerasPlanas(h: Headers | undefined): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!h || typeof h.forEach !== "function") return salida;
  h.forEach((valor, nombre) => { salida[nombre.toLowerCase()] = valor; });
  return salida;
}

export function modeloDelCuerpo(init: RequestInit): string {
  try {
    const b = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    return String((b && (b.model || b.modelo)) || "");
  } catch { return ""; }
}
/**
 * v1.57.18 · LA PUERTA DEL FUSIBLE UNIVERSAL — si el modelo está en cuarentena
 * (red/cuota/capacidad/tiempo, ver fusibleProveedores.ts) NO se llama: se explica
 * el porqué y se propone la alternativa MEDIDA. Cubre de una vez los diez
 * proveedores de nube. Vive fuera del cuerpo de fetchCloud a propósito: la valla
 * de esperaNube mide los primeros 1600 caracteres del guardián.
 */
function guardiaDeCuarentena(modelo: string): void {
  if (!enCuarentena(modelo)) return;
  throw new Error(notaCuarentena(modelo, sugerirAlternativa(modelosMedidos().filter((m) => m !== modelo))));
}

/** v1.57.18 · deja de culpar a la clave cuando se cayó la red: la causa real viaja en el mensaje. */
function registrarFalloConCausa(modelo: string, err: any): void {
  registrarFalloProveedor(modelo, err);
  const causa = causaReal(err);
  if (!causa) return;
  try { err.message = `${err.message} · causa real: ${causa}`; } catch { /* mensaje inmutable */ }
}

export interface OpcionesFetchCloud {
  /**
   * Techo propio para ESTA llamada, en ms. Sirve para lo que NO es generación:
   * listar catálogos. El techo de 120 s está pensado para un modelo que tarda
   * en escribir el primer token; una lista de modelos que tarda 120 s no está
   * «lenta», está muerta, y mientras tanto ocupa una conexión del navegador.
   * (v2.1.6 — «servidor local caído» con el servidor perfectamente sano.)
   */
  plazoMs?: number;
  /**
   * v1.0.37 · LISTAR MODELOS NO ES GENERAR, Y NO PUEDE QUEDAR DETRÁS DE LOS
   * FUSIBLES DE LA GENERACIÓN.
   *
   * Medido (sesión del 20/11, «puse la clave de un modelo pago y ni cargaron
   * los modelos»): el catálogo llamaba a este guardián como si fuera un turno
   * de chat. Con eso, un `/models` lento dejaba al ANFITRIÓN en cuarentena
   * (15 min, y 30 al reincidir) y, a partir de ahí, cada reintento del usuario
   * —que es lo que hace cuando «no cargan»— se comía un `enCuarentena` sin
   * tocar la red. El catálogo no volvía ni con la clave perfecta, y reiniciar
   * era la única salida. Un 429 en la lista, igual: bloqueaba el anfitrión
   * entero durante la espera que declaró el proveedor.
   *
   * Con `catalogo: true` la petición sigue teniendo techo de tiempo, pero no
   * consulta ni alimenta fusibles: no espera cuota, no respeta cuarentena y no
   * abre ninguna. Un catálogo fallido no puede envenenar el estado del que
   * dependen las generaciones.
   */
  catalogo?: boolean;
}

export async function fetchCloud(
  url: string,
  init: RequestInit,
  opciones: OpcionesFetchCloud = {},
): Promise<globalThis.Response> {
  let anfitrion = url;
  try { anfitrion = new URL(url).host; } catch { /* se queda la URL cruda */ }
  // v1.0.37 · un catálogo no pregunta por fusibles ni los abre (ver `catalogo`).
  const esCatalogo = opciones.catalogo === true;
  if (!esCatalogo) {
    // v1.87.0 · antes de gastar un byte: ¿este proveedor dijo «vuelve en X»?
    const cuota = puedeLlamar(anfitrion, Date.now());
    if (!cuota.permitido) throw new Error(notaEspera(anfitrion, cuota));
  }
  // v1.87.0 · la aduana de salida. A la máquina no se le censura nada.
  const initEgreso = esDestinoLocal(url) ? init : sanearInit(init);
  const modelo = modeloDelCuerpo(initEgreso) || anfitrion;
  if (!esCatalogo) guardiaDeCuarentena(modelo); // v1.57.18 · EL FUSIBLE UNIVERSAL (vive arriba, fuera del cuerpo del guardián)
  const presupuesto = presupuestoPrimerByte(modelo);
  // El plazo propio NUNCA alarga el de la casa: sólo puede bajar el techo.
  const topeMs =
    typeof opciones.plazoMs === "number" && opciones.plazoMs > 0
      ? Math.min(opciones.plazoMs, Math.max(CLOUD_FIRST_BYTE_TIMEOUT_MS, presupuesto.ms))
      : Math.max(CLOUD_FIRST_BYTE_TIMEOUT_MS, presupuesto.ms);
  const arranque = Date.now();
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), topeMs);
  try {
    const r = await fetch(url, { ...initEgreso, signal: ctrl.signal });
    // Llegaron las cabeceras: ese ES el primer byte real. Acá sí se mide.
    // v1.0.37 · salvo en un catálogo: medir un listado como si fuera un turno
    // contamina el presupuesto del modelo y el fusible del anfitrión.
    if (!esCatalogo) {
      // v1.87.0 · y acá se guarda lo que el proveedor dijo sobre su cuota.
      registrarCuota(anfitrion, r.status, cabecerasPlanas(r.headers), Date.now());
      registrarPrimerByte(modelo, Date.now() - arranque);
      registrarExitoProveedor(modelo);
    }
    return r;
  } catch (err: any) {
    // El temporizador se limpia en el `finally` en cuanto llegan las cabeceras,
    // así que llegar aquí con AbortError significa que NO llegaron.
    if (err?.name === "AbortError") {
      const fallo = new Error(
        `sin respuesta de ${anfitrion} en los primeros ${Math.round(topeMs / 1000)} s ` +
        `— venció el tramo del PRIMER BYTE (presupuesto ${presupuesto.etiqueta}; modelo ${modelo})`
      );
      // v1.0.37 · un catálogo que vence NO abre cuarentena: si la abriera, el
      // reintento del usuario se comería la pausa y el modelo no cargaría nunca.
      if (!esCatalogo) registrarFalloProveedor(modelo, fallo);
      throw fallo;
    }
    if (esCatalogo) {
      const causa = causaReal(err);
      if (causa) { try { err.message = `${err.message} · causa real: ${causa}`; } catch { /* mensaje inmutable */ } }
      throw err;
    }
    registrarFalloConCausa(modelo, err);
    throw err;
  } finally {
    clearTimeout(temporizador);
  }
}

```

### server/gatesObra.ts (111 líneas)

```ts
/**
 * gatesObra.ts — LAS PUERTAS DEL QUIRÓFANO DEL SERVIDOR (v1.23.0)
 * ===============================================================
 * Extraído de server.ts porque la Fase 2 de la casa es PARTIR, NO AÑADIR:
 * el quirófano sumó dos puertas nuevas (compilación y seguridad) y el
 * monolito no podía pagarlas. Aquí vive la política de qué puertas corren
 * con qué proyecto; server.ts solo aporta el `runCommand` y la raíz.
 *
 * v1.23.0 · EL DEFAULT CAMBIÓ (diagnóstico medido, no suposición): en v1.22.2
 * las puertas pesadas estaban APAGADAS por defecto. Para encenderlas había que
 * conocer el nombre de una variable de entorno (`QUIROFANO_GATES=tipos,humo`)
 * que nadie conocía. Resultado: el acta decía «escrito y verificado en disco»
 * sin que NADIE hubiera compilado jamás — y de ahí el «nunca compila» del
 * usuario. Ahora se encienden POR DEFECTO:
 *   · compilación → el build inferido del package.json del proyecto
 *   · seguridad   → cerradura.ts (19 reglas) sobre los archivos tocados
 * y siguen siendo APAGABLES (el usuario manda) con
 * QUIROFANO_SIN_COMPILACION=1 / QUIROFANO_SIN_CERRADURA=1. Las caras por
 * tiempo (tipos, humo) siguen opt-in: `QUIROFANO_GATES=tipos,humo npm run dev`.
 */
import path from "path";
import fs from "fs";
import { puertasEstandar, puertasPesadas, type Puerta } from "../src/engine/quirofano";
import { analizarProyecto as analizarCerradura, type OpcionesAnalisis } from "../src/engine/cerradura";

/**
 * v1.0.10 · F2 — `.cn-seguridad.json`: la allowlist del PROYECTO, leída una vez
 * por tanda (no por archivo). Formato:
 *   { "permitidas": ["xss-innerhtml"], "concedidoPor": "Mario — HUD de plantillas propias" }
 * Una regla permitida NO desaparece del acta: baja a `baja` y queda nombrada.
 * Un guardián que olvida es un guardián que miente. Sin archivo, sin permiso.
 */
export function cargarPermitidosCerradura(raiz: string): OpcionesAnalisis {
  try {
    const f = path.join(raiz, ".cn-seguridad.json");
    if (!fs.existsSync(f)) return {};
    const j = JSON.parse(fs.readFileSync(f, "utf-8"));
    const permitidas = Array.isArray(j?.permitidas) ? j.permitidas.map(String) : [];
    return { permitidas, concedidoPor: j?.concedidoPor ? String(j.concedidoPor) : ".cn-seguridad.json" };
  } catch {
    return {};
  }
}

/**
 * Infiere el comando de build del proyecto: lee el package.json de la raíz y,
 * si tiene script «build», devuelve `<gestor> run build` (el gestor se elige
 * por lockfile: npm/pnpm/yarn). Sin package.json o sin script build devuelve
 * "": la puerta de compilación no corre — no se puede prometer compilar lo
 * que no declara cómo compilarse.
 */
export function inferirComandoBuild(raiz: string): string {
  try {
    const pkgPath = path.join(raiz, "package.json");
    if (!fs.existsSync(pkgPath)) return "";
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (!pkg?.scripts?.build) return "";
    let gestor = "npm";
    try {
      if (fs.existsSync(path.join(raiz, "pnpm-lock.yaml"))) gestor = "pnpm";
      else if (fs.existsSync(path.join(raiz, "yarn.lock"))) gestor = "yarn";
    } catch { /* el gestor por defecto alcanza */ }
    return `${gestor} run build`;
  } catch {
    return "";
  }
}

/**
 * Las puertas de esta instalación sobre este proyecto. `correrComando` entra
 * inyectado (el servidor aporta su ejecutor con timeout real): este módulo no
 * conoce child_process ni express.
 */
export function construirPuertasQf(
  raiz: string,
  correrComandoBase: (comando: string, cwd: string, timeoutMs: number) => Promise<any>,
  env: NodeJS.ProcessEnv = process.env
): Puerta[] {
  const activas = String(env.QUIROFANO_GATES || "").toLowerCase();
  const sinCompilacion = env.QUIROFANO_SIN_COMPILACION === "1";
  const sinCerradura = env.QUIROFANO_SIN_CERRADURA === "1";
  const comandoBuild = inferirComandoBuild(raiz);
  // El runner se construye si hace falta para CUALQUIERA de las puertas que
  // ejecutan procesos (tipos opt-in, compilación opt-out).
  const necesitoRunner = activas.includes("tipos") || (!sinCompilacion && !!comandoBuild);
  const correrComando = necesitoRunner
    ? async (comando: string) => {
        const r = await correrComandoBase(comando, raiz, 180000);
        return { ok: Number(r?.exitCode) === 0, detalle: String(r?.stdout || "") + "\n" + String(r?.stderr || "") };
      }
    : undefined;
  const sondearPreview = activas.includes("humo")
    ? async () => {
        const puerto = Number(env.SANDBOX_PORT) || 3500;
        const res = await fetch("http://127.0.0.1:" + puerto + "/");
        return { status: res.status, cuerpo: await res.text() };
      }
    : undefined;
  // v1.0.10 · F2 — los permisos del proyecto entran a la puerta sin que el
  // motor conozca fs: el cierre lee el archivo, la puerta recibe la función.
  const permitidosQf = sinCerradura ? {} : cargarPermitidosCerradura(raiz);
  return puertasEstandar().concat(
    puertasPesadas({
      correrComando,
      sondearPreview,
      comandoBuild: sinCompilacion ? undefined : (comandoBuild || undefined),
      analizarSeguridad: sinCerradura ? undefined : (archivos) => analizarCerradura(archivos, permitidosQf),
    })
  );
}

```

### server/herramientasRutas.ts (134 líneas)

```ts
/**
 * herramientasRutas.ts — v1.0.20 · LAS MANOS DEL MODELO (2 llamadas, no 4)
 * ==========================================================================
 * QUÉ ES: la pieza D. El modelo tenía que combinar CUATRO consultas para
 * contestar «¿dónde está el proyecto?» — y aun así adivinaba. Aquí tiene dos
 * herramientas y una llamada cada una:
 *
 *   abrir_proyecto  { nombre }  → carpeta creada/adoptada + registro + pin + texto
 *   contexto_rutas  { }         → las tres raíces y la obra abierta, en un bloque
 *
 * POR QUÉ `cheap: true`: las dos son baratas en tokens (entrada casi vacía,
 * salida corta). Así sobreviven al recorte de herramientas de los modelos chicos
 * — que es justo donde el problema de rutas revienta (qwen3.5:4b, 8192 de
 * contexto). `abrir_proyecto` además es la única herramienta que cambia de QUÉ
 * carpeta se sirve, así que se marca `destructive: false` a propósito: no borra
 * nada; la carpeta vacía se siembra con un index.html y se dice.
 */
import { registerToolPack, type ToolSpec } from "../src/engine/toolRegistry";
import { contextoDeRutas, abrirProyecto, type DepsRegistro, type ResultadoApertura } from "./proyectoRegistro";
import { textoDeContexto, resumenRutas, clasificarRuta, QUE_HACER, veredictoDeEscritura } from "../src/engine/rutasAtomicas";

export const PACK_RUTAS = "rutas";

const TOOLS: ToolSpec[] = [
  {
    name: "contexto_rutas",
    pack: PACK_RUTAS,
    description:
      "Contesta en UNA llamada dónde está todo: instalación del IDE, raíz de datos, proyecto abierto, qué sirve el :3500 y qué ruta usar para escribir. Usala ANTES de escribir o de decir «no encuentro los archivos»: no adivines rutas.",
    parameters: { type: "object", properties: {}, required: [] },
    requires: { sandbox: true },
    cheap: true,
  },
  {
    name: "abrir_proyecto",
    pack: PACK_RUTAS,
    description:
      "Abre (crea o adopta) el proyecto que el :3500 va a servir. Devuelve la carpeta exacta y deja el registro escrito. Después de esto, write_file con ruta relativa escribe AHÍ. Usala cuando el usuario pida una app/sitio nuevo o cuando no haya proyecto abierto.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "nombre del proyecto (simple, sin barras). Ej: finanzas-app" },
        modo: { type: "string", description: "'nuevo' (por defecto) crea si falta; 'abrir' solo adopta una carpeta existente" },
        ruta: { type: "string", description: "opcional: clasifica una ruta en vez de abrir (no se escribe nada)" },
      },
      required: [],
    },
    requires: { sandbox: true },
    cheap: true,
  },
];

/** Registra el pack (idempotente: el registro reemplaza el mismo id). */
export function registrarPackRutas(): void {
  registerToolPack({
    id: PACK_RUTAS,
    label: "Rutas del proyecto",
    description: "Una sola verdad sobre dónde vive la obra: abrir el proyecto y contestar las tres raíces.",
    tools: TOOLS,
  });
}

/** ¿Esta herramienta es del pack? (el monolito despacha con esto, sin sumar líneas al switch). */
export const ES_HERRAMIENTA_RUTAS = (name: string): boolean => name === "contexto_rutas" || name === "abrir_proyecto";

/**
 * Ejecuta las dos herramientas. Devuelve SIEMPRE un JSON string: el bucle del
 * agente espera texto y una excepción aquí dejaría el turno sin respuesta.
 */
export function ejecutarHerramientaRutas(name: string, args: any, deps: DepsRegistro): string {
  if (name === "contexto_rutas") {
    const ctx = contextoDeRutas(deps);
    const ruta = String(args?.ruta || "").trim();
    if (ruta) {
      // Con ruta: la clasificación (es la misma pregunta hecha por otra puerta).
      const clase = clasificarRuta(ruta, ctx);
      const v = veredictoDeEscritura(ruta, ctx);
      return JSON.stringify({
        ok: true,
        ruta,
        clase,
        queHacer: QUE_HACER[clase],
        escritura: { permitida: v.permitida, abs: v.abs, motivo: v.motivo },
        contexto: ctx,
        resumen: resumenRutas(ctx),
      });
    }
    return JSON.stringify({
      ok: true,
      instalacion: ctx.instalacion,
      datos: ctx.datos,
      proyecto: ctx.proyecto,
      hayObra: !!ctx.proyecto,
      resumen: resumenRutas(ctx),
      texto: textoDeContexto(ctx),
      comoEscribir: ctx.proyecto
        ? "write_file / edit_file con ruta RELATIVA: el archivo nace en la obra abierta y el :3500 la sirve"
        : "no hay obra abierta: llamá abrir_proyecto {\"nombre\": \"mi-app\"} primero",
    });
  }

  if (name === "abrir_proyecto") {
    const ruta = String(args?.ruta || "").trim();
    if (ruta) {
      // Modo consulta: clasificar sin abrir (evita que un modelo curioso cree carpetas).
      const ctx = contextoDeRutas(deps);
      const clase = clasificarRuta(ruta, ctx);
      return JSON.stringify({ ok: true, consulta: true, ruta, clase, queHacer: QUE_HACER[clase], contexto: ctx });
    }
    const nombre = String(args?.nombre || args?.name || args?.proyecto || "").trim();
    const modo = args?.modo === "abrir" ? "abrir" : "nuevo";
    const r: ResultadoApertura = abrirProyecto(deps, nombre, modo);
    if (!r.ok) {
      return JSON.stringify({
        ok: false,
        error: r.motivo,
        pista: "un proyecto es UN nombre simple (letras, números y guiones). Se crea dentro de la raíz de datos, no en una ruta absoluta.",
      });
    }
    return JSON.stringify({
      ok: true,
      proyecto: r.proyecto?.nombre,
      ruta: r.proyecto?.ruta,
      creada: r.proyecto?.origen === "creado",
      sembrado: r.proyecto?.sembrado ?? [],
      avisos: r.avisos,
      texto: r.contexto,
      siguiente: "escribí con ruta RELATIVA (index.html, src/app.js…) y quedan en esa carpeta; el :3500 la sirve",
    });
  }

  return JSON.stringify({ ok: false, error: `herramienta de rutas desconocida: ${name}` });
}

```

### server/middleware/plazoApi.ts (211 líneas)

```ts
/**
 * server/middleware/plazoApi.ts — NINGUNA RUTA /api SE QUEDA MUDA, PERO NINGUNA
 * RUTA LEGÍTIMAMENTE LENTA ES ASESINADA POR EL RELOJ (v2.1.5 · corregido v2.2.5)
 * =============================================================================
 * PARA QUÉ NACIÓ (v2.1.5)
 * -----------------------
 * Un manejador `async` que rechaza NO produce respuesta: no hay 500, no hay
 * cierre. El socket queda abierto y el navegador esperando. Es el mecanismo del
 * «CerebroNico arrancando motor · consultando el estado del motor…» que no abría
 * (captura del 02/11, 23:31): la ruta contestaba nunca, y nunca no es un rojo.
 *
 * LA REGLA DE ESTA VERSIÓN (v2.2.5)
 * --------------------------------
 * El reloj sigue en el camino común (una ruta olvidada no puede colgar el
 * navegador), pero **sabe qué rutas son lentas por naturaleza** y les da su
 * propio plazo. Y en cuanto la respuesta empieza a salir, el reloj se levanta:
 * un stream de tokens con pausas no es una ruta colgada.
 *
 * ── v1.0.24 · EL RELOJ HERIDO: MATABA LA RUTA Y LA RUTA SEGUÍA ESCRIBIENDO ───
 *
 * 🐞 El log de arranque real de Mario (16/11, v1.0.23) escupió CUATRO veces la
 * misma forma, y no era una: era la firma del diseño.
 *
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/subagents (plazo común de /api)
 *   [estabilidad] Promesa rechazada sin recoger — el motor SIGUE:
 *     Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent
 *       at … server.ts:6704:14        ← el `res.json()` del fallback de /api/subagents
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/telemetry/ports
 *       at … server/routers/telemetria.ts:215:9
 *   [estabilidad] /api sin respuesta en 45000 ms: GET /api/telemetry/ports (otra vez)
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/system/stats
 *       at … server/routers/telemetria.ts:294:30
 *
 * Lo que pasaba, en orden:
 *   1. El `res.setTimeout` vence. `headersSent` todavía es `false`.
 *   2. Este middleware contesta 504 y **se lava las manos**.
 *   3. Pero `res.setTimeout` NO cancela el trabajo del handler: la ruta sigue su
 *      camino —sondeando Ollama, esperando al puente, consultando el sandbox— y
 *      cuando termina llama a `res.json(...)` sobre un socket que ya declaró
 *      cerrado. Express lanza `ERR_HTTP_HEADERS_SENT`.
 *   4. La ruta es `async` y su promesa ya se había cortado del reloj: nadie la
 *      espera. El rechazo aparece como `unhandledRejection` — «el motor SIGUE»,
 *      pero el cliente ya recibió un 504 que no le corresponde y la respuesta
 *      buena se tira a la basura.
 *
 * Encadenado: /api/subagents y /api/telemetry/ports son exactamente los dos
 * sondeos que la cabecera y el panel de puertos piden cada 10 s. Con ellos en
 * 504, la pantalla declara «servidor local caído» mientras el :3000 está vivo.
 *
 * LAS TRES CURAS (todas acá, en el dueño del reloj):
 *
 *   a) **El reloj deja de ser anónimo.** Antes de contestar 504, se cuenta cuántas
 *      rutas están colgadas y cuáles. Si hay 3 o más —es el patrón de «todo el
 *      proceso está ocupado», no el de «una ruta lenta»— el middleware **no**
 *      contesta y se convierte en un aviso con nombre y número. Un 504 masivo es
 *      peor que una espera: afirma cosas falsas sobre todas las rutas a la vez.
 *   b) **La ruta que llega tarde no puede volver a escribir.** El 504 se manda a
 *      través de una ficha (`src/engine/fichaUnica.ts`) y el socket queda
 *      marcado: `puedeContestar(res)` es `false` para quien venga después. Eso
 *      convierte un `ERR_HTTP_HEADERS_SENT` en un no-op honesto que se anota.
 *   c) **El porqué queda escrito.** El aviso dice el plazo, la ruta y cuántas
 *      hermanas están colgadas; el descarte posterior lo repite con la palabra
 *      «ficha». Si esto vuelve a pasar, el log dice qué subir y por qué.
 */
import type { NextFunction, Request, Response } from "express";
import { puedeContestar } from "../../src/engine/fichaUnica";

/** Plazo común para todo `/api` que no esté en la lista de abajo. */
export const PLAZO_API_POR_DEFECTO_MS = Number(process.env.CN_PLAZO_API_MS || 20000);

export interface ExcepcionPlazo {
  /** Empieza a comparar desde el principio de la URL (sin query string). */
  prefijo: string;
  ms: number;
  /** Por qué esta ruta tiene permiso de tardar. Sin esto, la tabla se vuelve excusa. */
  porque: string;
}

/**
 * Las rutas que tardan más de 20 s **porque así funciona lo que hacen**. Cada una
 * con su evidencia; ninguna entró acá por «me dio error».
 */
export const RUTAS_LENTAS_POR_DISENO: ExcepcionPlazo[] = [
  { prefijo: "/api/ai/stream", ms: 300000, porque: "modelo local frío: Ollama lo carga desde disco y este proyecto midió 28 s; un chat largo con herramientas tarda minutos" },
  { prefijo: "/api/health/deep", ms: 60000, porque: "corre los cinco chequeos, incluido el sondeo de Ollama: cortarlo deja el splash en «consultando el estado del motor…»" },
  { prefijo: "/api/ollama/warmup", ms: 300000, porque: "precargar un modelo ES la carga desde disco, por definición lenta" },
  { prefijo: "/api/cerebro/embedder", ms: 90000, porque: "el estado pregunta al motor de embeddings que quedo residente: con el modelo frio eso es una carga desde disco, y cortarlo es lo que pinta «sin embedder»" },
  { prefijo: "/api/cerebro/embedder/calentar", ms: 300000, porque: "vectoriza el corpus: minutos en máquina chica" },
  { prefijo: "/api/brain/", ms: 180000, porque: "planifica con el proveedor; una tanda de planes no es una ruta colgada" },
  { prefijo: "/api/tts/", ms: 120000, porque: "síntesis de voz: el audio se pide entero" },
  { prefijo: "/api/sandbox/start", ms: 90000, porque: "levanta un proceso Node hijo y espera su salud" },
  { prefijo: "/api/bridge/", ms: 90000, porque: "reinicia el puente Python :5000, que tarda lo que tarda FastAPI" },
  { prefijo: "/api/arranque/interruptor", ms: 90000, porque: "enciende un pack por pedido del usuario y espera el health" },
  // v2.3.4 · con 40+ modelos en el almacén y NEMESIS:latest pesando 62,4 GB,
  // GET /api/tags tarda 21-37 s. La sonda tiene 35 s de plazo individual, pero
  // el presupuesto total (40 s) y el middleware (20 s) cortaban antes. El
  // presupuesto ya se subió a 40 s en telemetria.ts; esta excepción evita que
  // el middleware mande 504 antes de que la sonda de Ollama termine.
  { prefijo: "/api/telemetry/ports", ms: 45000, porque: "sondea Ollama /api/tags que con 40+ modelos tarda 21-37 s; cortarlo pinta 11434 OFF cuando está vivo" },
  // v1.0.24 · LAS TRES QUE EL LOG DEL 16/11 CORTÓ Y SÍ TIENEN PERMISO.
  // Medido en su arranque: el puente :5000 se reanimaba en bucle (3 intentos de 3)
  // mientras estas rutas lo esperaban dentro de su sondeo. No es una ruta colgada:
  // es un sondeo de 12 s esperando a un hijo que está naciendo.
  { prefijo: "/api/subagents", ms: 45000, porque: "pregunta al puente :5000 con 12 s de plazo interno; con el puente reanimándose, 20 s no alcanzan y el corte producía ERR_HTTP_HEADERS_SENT en el fallback" },
  { prefijo: "/api/sandbox/status", ms: 45000, porque: "mide el :3500 con las conexiones del proceso ocupadas; cortarlo declaraba caído un sandbox que estaba naciendo" },
  { prefijo: "/api/system/stats", ms: 45000, porque: "incluye el /api/ps de Ollama, que con 19 modelos cargados tarda más que el plazo común" },
];

/**
 * Decide el plazo de una URL. Puro y expuesto: es la única forma de probar la
 * aritmética que rompió el chat sin tener que levantar un servidor.
 */
export function plazoDeRuta(
  url: string,
  defectoMs: number = PLAZO_API_POR_DEFECTO_MS,
): { ms: number; porque: string; excepcion: boolean } {
  const ruta = String(url || "").split("?")[0];
  let mejor: ExcepcionPlazo | null = null;
  for (const e of RUTAS_LENTAS_POR_DISENO) {
    if (!ruta.startsWith(e.prefijo)) continue;
    // La coincidencia MÁS específica gana: `/api/ai/stream` sobre `/api/ai/`.
    if (!mejor || e.prefijo.length > mejor.prefijo.length) mejor = e;
  }
  if (mejor) return { ms: Math.max(mejor.ms, defectoMs), porque: mejor.porque, excepcion: true };
  return { ms: defectoMs, porque: "plazo común de /api", excepcion: false };
}

/**
 * v1.0.24 · CUÁNDO UN CORTE ES UNA CAÍDA Y CUÁNDO ES UN AHOGO.
 *
 * Con `enVuelo >= 3` el proceso no tiene una ruta lenta: tiene la garganta
 * tomada. En ese caso contestar 504 a las tres es exactamente lo que pinta
 * «servidor local caído» — se le informa al cliente que TODO está roto cuando
 * lo que hay es una espera. La regla por defecto es 3 y se puede mover con
 * `CN_CORTES_SIMULTANEOS` para máquinas chicas.
 *
 * Puro y exportado: la suite fija el número, no la prosa.
 */
export const CORTES_SIMULTANEOS = Math.max(2, Math.floor(Number(process.env.CN_CORTES_SIMULTANEOS || 3)));

export function decidirCorte(enVuelo: number): "contestar-504" | "solo-anotar" {
  return enVuelo >= CORTES_SIMULTANEOS ? "solo-anotar" : "contestar-504";
}

export function plazoApi() {
  const defectoMs = PLAZO_API_POR_DEFECTO_MS;
  /** Rutas que vencieron su reloj y todavía no soltaron el socket. */
  const colgadas = new Set<string>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ruta = req.originalUrl || req.url || "";
    const { ms, porque } = plazoDeRuta(ruta, defectoMs);
    let vencido = false;
    res.setTimeout(ms, () => {
      vencido = true;
      // Si ya estábamos mandando (un stream de tokens, un SSE), esto NO es una
      // ruta colgada: un stream con pausas sigue vivo. Se levanta el reloj.
      if (!puedeContestar(res)) return;
      // La clave se calcula AFUERA del `try` de la respuesta, no dentro: si la
      // primera línea del manejador del reloj estalla, ese socket queda sin
      // liberar y el contador de colgadas se queda alto para siempre.
      const clave = `${req.method} ${ruta.split("?")[0]}`;
      colgadas.add(clave);
      const cuantas = colgadas.size;
      const veredicto = decidirCorte(cuantas);
      console.error(
        `[estabilidad] /api sin respuesta en ${ms} ms: ${req.method} ${ruta} (${porque}) · ` +
        `colgadas ahora: ${cuantas}/${CORTES_SIMULTANEOS}` +
        (veredicto === "contestar-504"
          ? ""
          : " → NO se contesta 504: hay varias rutas esperando a la vez, el proceso está ocupado, no caído"),
      );
      if (veredicto === "solo-anotar") {
        // Se deja el socket vivo: la ruta contestará tarde, y contesta con razón.
        // Un 504 a medias es peor que una espera: afirma que NADA responde.
        return;
      }
      try {
        res.status(504).json({
          ok: false,
          motivo: `la ruta no respondió en ${Math.round(ms / 1000)} s`,
          ruta: req.originalUrl,
          plazoMs: ms,
          ocupadas: cuantas,
        });
      } catch {
        /* el socket ya se cayó solo */
      }
    });
    // Contestó (bien o mal): el reloj ya no tiene nada que vigilar. Sin esto, un
    // `res.setTimeout` queda montado sobre el socket keep-alive y le puede cortar
    // la SIGUIENTE respuesta al mismo navegador.
    const soltar = () => {
      try { res.setTimeout(0); } catch { /* socket muerto */ }
      colgadas.delete(`${req.method} ${ruta.split("?")[0]}`);
      if (vencido && puedeContestar(res)) {
        // El caso que producía ERR_HTTP_HEADERS_SENT: no se cortó (se dejó vivir
        // por ahogo) y ahora sí contesta. Es la conducta correcta.
        console.warn(`[estabilidad] «${ruta}» contestó TARDE, después de vencer su reloj: se respetó la respuesta.`);
      }
    };
    // v2.2.7 · DEFENSIVO: `res.once` existe en http.ServerResponse, pero el
    // middleware se prueba con objetos de respuesta livianos y estrellarse acá
    // dejaría MUDA cada ruta /api. Un middleware no tiene derecho a ese poder.
    if (typeof res.once === "function") {
      res.once("finish", soltar);
      res.once("close", soltar);
    }
    next();
  };
}

```

### server/normalizarOllama.ts (183 líneas)

```ts
/**
 * normalizarOllama.ts — v1.0.15 · EL SYSTEM VA PRIMERO Y EL PROMPT CABE
 * =====================================================================
 * DOS FALLOS MEDIDOS en el LOG_OLLAMA de Mario (2026-11-10), los dos devuelven
 * HTTP 500 en POST /api/chat y dejan a Ollama local «sin andar»:
 *
 *   1) PLANTILLA JINJA — qwen3.5 (y otras) abortan con:
 *        «Error: Jinja Exception: System message must be at the beginning.»
 *      El motor empuja notas de continuidad / huecos / orden-de-obra como
 *      role:"system" al FINAL del array (server.ts cuerpoBucleAgente, líneas
 *      3519-3525), DESPUÉS de los user/assistant. La plantilla sólo acepta UN
 *      system y en la posición 0 → rechaza el pedido entero.
 *      → consolidarSystemAlInicio(): junta todos los system en uno solo al frente.
 *
 *   2) CONTEXTO DESBORDADO — Ollama corta con:
 *        «request (16547 tokens) exceeds the available context size (8192 tokens)»
 *      El manual + la orden de obra + el historial pasan el num_ctx del modelo.
 *      → recortarMensajesAVentana(): recorta historial viejo (nunca el system ni
 *        el último pedido) para caber en num_ctx dejando sitio para la respuesta.
 *
 * Lógica PURA y sin dependencias: se prueba aislada (tests/normalizarOllama.test.ts)
 * y se llama justo antes de cada fetch a /api/chat (server.ts). No muta el array
 * de entrada: devuelve uno nuevo, así el bucle de agente conserva su estado.
 */

export interface MensajeChat {
  role: string;
  content?: string;
  [clave: string]: unknown;
}

/**
 * Junta TODOS los `role:"system"` (en su orden original) en un único mensaje
 * system al frente del array. El resto (user/assistant/tool) queda intacto y
 * en su mismo orden. Si no hay ningún system, devuelve el array tal cual.
 */
export function consolidarSystemAlInicio<T extends MensajeChat>(mensajes: T[]): T[] {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return mensajes;
  const sys: string[] = [];
  const resto: T[] = [];
  for (const m of mensajes) {
    if (m && m.role === "system") {
      const c = typeof m.content === "string" ? m.content : "";
      if (c.trim()) sys.push(c);
    } else {
      resto.push(m);
    }
  }
  if (sys.length === 0) return mensajes;
  const fundido = { role: "system", content: sys.join("\n\n") } as unknown as T;
  return [fundido, ...resto];
}

/** Estima tokens de un texto (≈ 1 token cada 4 chars; conservador para español). */
export function tokensAprox(texto: string): number {
  return Math.ceil((texto ? texto.length : 0) / 4);
}

/**
 * v1.0.16 · LA VENTANA CRECE ANTES DE AMPUTAR. Dado el coste real del array y un
 * `numCtxBase` (el que trae el perfil/dial), devuelve el `num_ctx` que hay que
 * MANDAR a Ollama para que TODO el prompt entre entero —manual + orden de obra +
 * historial— dejando `reservaSalidaTokens` libres para la respuesta, SIN pasar de
 * `topeDuro` (lo que la RAM del equipo puede pagar de KV-cache; ver techoDeContexto).
 *
 * Caso de Mario («TENGO 16 DE RAM»): el dial del panel Pro mandaba num_ctx=8192 y
 * pisaba el 16384 del tier; con 16 GB el techo deja >32k, así que en vez de
 * recortar el prompt (16547 tok) a 8192 —mutilando el manual— se SUBE la ventana a
 * ~17408 y el prompt cabe. Nunca BAJA del base ni SUBE del tope; redondea a 1024.
 * PURA: no muta la entrada; es el recortarMensajesAVentana quien, si aun con el
 * tope no entra, recorta el historial viejo.
 */
export function ventanaParaCaber<T extends MensajeChat>(
  mensajes: T[],
  numCtxBase: number,
  reservaSalidaTokens = 512,
  topeDuro?: number,
): number {
  const base = Number.isFinite(numCtxBase) && numCtxBase > 0 ? Math.floor(numCtxBase) : 8192;
  const tope =
    Number.isFinite(topeDuro as number) && (topeDuro as number) > base
      ? Math.floor(topeDuro as number)
      : base;
  if (!Array.isArray(mensajes) || mensajes.length === 0) return base;
  const costo = mensajes.reduce(
    (s, m) => s + tokensAprox(typeof m.content === "string" ? m.content : "") + 4,
    0,
  );
  const necesario = costo + Math.max(0, reservaSalidaTokens);
  if (necesario <= base) return base;
  const redondeado = Math.ceil(necesario / 1024) * 1024;
  return Math.min(tope, Math.max(base, redondeado));
}

/**
 * Recorta el array para que su coste en tokens entre en `numCtxTokens` dejando
 * `reservaSalidaTokens` libres para la respuesta del modelo. Nunca toca:
 *   · el primer mensaje si es system (el manual / orden de obra),
 *   · el último mensaje (el pedido actual del usuario).
 * Elimina los mensajes del MEDIO empezando por los más viejos. Si aún así no
 * entra (system enorme solo), trunca el contenido del system al final.
 */
export function recortarMensajesAVentana<T extends MensajeChat>(
  mensajes: T[],
  numCtxTokens: number,
  reservaSalidaTokens = 512,
  log?: (m: string) => void,
): T[] {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return mensajes;
  const ctx = Number.isFinite(numCtxTokens) && numCtxTokens > 0 ? Math.floor(numCtxTokens) : 8192;
  const presupuesto = Math.max(512, ctx - Math.max(0, reservaSalidaTokens));
  const costo = (m: T): number => tokensAprox(typeof m.content === "string" ? m.content : "") + 4;

  const total = mensajes.reduce((s, m) => s + costo(m), 0);
  if (total <= presupuesto) return mensajes;

  const tieneSys = Boolean(mensajes[0]) && mensajes[0].role === "system";
  const head: T[] = tieneSys ? [mensajes[0]] : [];
  const cuerpo = mensajes.slice(tieneSys ? 1 : 0);
  const ultimo = cuerpo.length ? cuerpo[cuerpo.length - 1] : null;
  const medio = ultimo ? cuerpo.slice(0, -1) : cuerpo;

  let usado = head.reduce((s, m) => s + costo(m), 0) + (ultimo ? costo(ultimo) : 0);
  const conservados: T[] = [];
  // Se conservan los mensajes del medio desde el MÁS NUEVO hacia atrás.
  for (let k = medio.length - 1; k >= 0; k--) {
    const c = costo(medio[k]);
    if (usado + c > presupuesto) break;
    usado += c;
    conservados.unshift(medio[k]);
  }
  const quitados = medio.length - conservados.length;
  const out: T[] = [...head, ...conservados, ...(ultimo ? [ultimo] : [])];

  // Último recurso: el system solo ya no entra → se trunca su texto.
  if (usado > presupuesto && tieneSys && out[0] && typeof out[0].content === "string") {
    const sobraTokens = usado - presupuesto;
    const c = out[0].content as string;
    const charsAQuitar = Math.min(c.length - 1, sobraTokens * 4);
    if (charsAQuitar > 0) {
      out[0] = {
        ...out[0],
        content: c.slice(0, c.length - charsAQuitar) + "\n[…recortado para caber en la ventana del modelo local]",
      } as T;
    }
  }

  if (quitados > 0) {
    log?.(`[CerebroNico] 🪟 Contexto local recortado: ${quitados} mensaje(s) viejo(s) fuera para caber en num_ctx=${ctx}.`);
  }
  return out;
}

/**
 * v1.0.16 · Un solo paso para el prompt de Ollama: system-first, la ventana
 * CRECE hasta `topeRam` si el prompt no entra, y se recorta a num_ctx. Muta
 * `opciones.num_ctx` cuando la ventana sube; devuelve los mensajes saneados.
 * Antes esto vivía inline y duplicado en server.ts (agente y streaming): aquí
 * es una sola verdad reutilizable, sin lógica repetida en el monolito.
 */
export function sanearYVentana<T extends MensajeChat>(
  mensajes: T[],
  opciones: Record<string, any>,
  topeRam: number | undefined,
  log?: (m: string) => void,
  declarado?: number | null, // v1.0.20 · lo que el modelo declara en /api/show: manda sobre cualquier deseo
): T[] {
  const base = Number(opciones?.num_ctx) || 8192;
  const resv = Number(opciones?.num_predict) || 512;
  const sys = consolidarSystemAlInicio(mensajes);
  const ventana = ventanaParaCaber(sys, base, resv, topeRam);
  // v1.0.20 · EL 400 DE qwen3.5:4b («17929 tokens > 8192») salía de pedirle al
  // modelo una ventana que él no declara. Si /api/show dijo cuánto tiene, ese
  // número es el techo, no una sugerencia.
  const techoModelo = Number.isFinite(declarado as number) && (declarado as number) > 0 ? Math.floor(declarado as number) : null;
  if (techoModelo !== null && ventana > techoModelo) {
    log?.(`[CerebroNico] 🪟 El modelo declara ${techoModelo} de contexto: la ventana pedida (${ventana}) se clampa a esa cifra.`);
  }
  const final = techoModelo !== null ? Math.min(ventana, Math.max(512, techoModelo)) : ventana;
  if (opciones && final !== base) opciones.num_ctx = final;
  return recortarMensajesAVentana(sys, Number(opciones?.num_ctx) || base, resv, log);
}

```

### server/obraCurso.ts (106 líneas)

```ts
/**
 * obraCurso.ts — LA OBRA NACE DONDE EL USUARIO LA VE (v1.0.12)
 * ============================================================
 * PEDIDO DE MARIO (mayúsculas, 09/11): «EL PROYECTO QUE SE ESTE CREANDO QUE SE
 * ESCRIBA EN EL ARBOL DEL SANDBOX, OSEA EN EL EDITOR VISIBLE PARA EL USUARIO.
 * SIEMPRE HACE TODO ESTATICO Y EL USUARIO NUNCA VE LOS ARCHIVOS EN SU EDITOR».
 *
 * La regla de enrutado (`src/engine/raizDeObra.ts`) ya respetaba la carpeta
 * vinculada (4a) y el proyecto existente dentro de la raíz de datos (4b). Lo
 * que NO existía era el momento CERO: nadie vincula, no hay proyecto todavía,
 * el modelo escribe `index.html` → cae en la raíz de datos, sepultado entre
 * los órganos del IDE. Invisible.
 *
 * Este módulo pone la primera piedra: cuando una escritura de write_file es
 * RAÍZ DE OBRA (index.html, main.*, app.*, package.json), no hay carpeta
 * vinculada, no hay proyecto servido, y el archivo NO existe ya en la raíz
 * (si existe, es edición de un proyecto raíz — regla de siempre), la obra se
 * abre en su propia carpeta con nombre derivado del objetivo del turno. A
 * partir de ahí, `resolverDestinoSandbox` (la autoridad que el preview ya usa)
 * ve el proyecto y todo —escritura, árbol, :3500— coincide. Un solo criterio,
 * dos puntadas: el editor muestra lo que el motor escribe.
 */

/** Archivos que SON la primera piedra de un proyecto web/node. */
export const RAICES_DE_OBRA = new Set([
  "index.html", "index.htm", "main.js", "main.ts", "main.tsx", "app.js", "app.jsx", "app.tsx", "package.json",
]);

/** Título del turno → slug de carpeta. Determinista, ASCII, sin fechas raras. */
export function slugDesdeTitulo(titulo: string): string {
  const limpio = String(titulo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 34)
    .replace(/^-|-$/g, "");
  const palabras = limpio ? limpio.split("-").filter((w) => w.length > 2 && /[a-z]/.test(w)).slice(0, 4).join("-") : "";
  return palabras;
}

export interface JuegoDeObra {
  /** Ruta relativa que pidió la herramienta. */
  ruta: string;
  raizDatos: string;
  /** Carpeta fijada a mano (CANAL DIRECTO), si existe. */
  vinculada: string | null;
  /** Raíz que está sirviendo el árbol/preview (raizDeObraEnCurso). */
  servida: string | null;
  existe: (abs: string) => boolean;
  /** Objetivo del turno actual (para el nombre), crudo. */
  titulo?: string;
}

export interface DesvioDeObra {
  /** La ruta a usar (posiblemente `<carpeta>/<ruta>`). */
  ruta: string;
  /** true si se abrió carpeta nueva (crearla es deber del llamador). */
  nueva: boolean;
  carpeta?: string;
  motivo?: string;
}

/**
 * Decisión PURA (con `existe` inyectada). Nunca lanza: la peor salida es el
 * comportamiento viejo, idéntico al de hasta v1.0.11.
 */
export function desviarHaciaCarpetaDeObra(j: JuegoDeObra, union: (...s: string[]) => string, crearCarpeta?: (dir: string) => void, refrescarMemoria?: () => void): DesvioDeObra {
  const rel = String(j.ruta || "").replace(/\\/g, "/").trim();
  if (!rel || rel.startsWith("/") || rel.split("/").includes("..")) return { ruta: j.ruta, nueva: false };
  if (j.vinculada) return { ruta: j.ruta, nueva: false }; // CANAL DIRECTO manda, esto no lo pisa
  if (rel.split("/").length !== 1) return { ruta: j.ruta, nueva: false }; // solo piedras fundacionales en la raíz
  const base = rel.toLowerCase();
  if (!RAICES_DE_OBRA.has(base)) return { ruta: j.ruta, nueva: false };
  const servidaDistinta = j.servida && j.servida !== j.raizDatos;
  if (servidaDistinta) return { ruta: j.ruta, nueva: false }; // ya hay proyecto adentro: regla 4b de siempre
  if (j.existe(union(j.raizDatos, rel))) return { ruta: j.ruta, nueva: false }; // editar la raíz-proyecto existente no es crear nada

  let slug = slugDesdeTitulo(j.titulo || "");
  if (!slug) slug = "obra";
  // El mismo objetivo dos veces: la carpeta ya existe → se reusa (continuación,
  // no `-2`). Si existe pero con OTRO contenido de obra, se agrega sufijo corto.
  let carpeta = slug;
  let intentos = 0;
  while (j.existe(union(j.raizDatos, carpeta)) && !j.existe(union(j.raizDatos, carpeta, rel)) && intentos < 8 && esOtraObra(union(j.raizDatos, carpeta), union, j.existe)) {
    intentos += 1;
    carpeta = `${slug}-${intentos + 1}`;
  }
  crearCarpeta?.(union(j.raizDatos, carpeta));
  refrescarMemoria?.();
  return {
    ruta: `${carpeta}/${rel}`,
    nueva: true,
    carpeta,
    motivo: `proyecto nuevo: la obra se abre en «${carpeta}/» para que el árbol del editor y el sandbox :3500 la muestren`,
  };
}

/** ¿La carpeta existente parece obra DISTINTA (otro index/package)? */
function esOtraObra(dir: string, union: (...s: string[]) => string, existe: (a: string) => boolean): boolean {
  return existe(union(dir, "index.html")) || existe(union(dir, "package.json")) || existe(union(dir, "main.js")) || existe(union(dir, "main.tsx"));
}

```

### server/ollamaBajoConsumo.ts (184 líneas)

```ts
/**
 * ollamaBajoConsumo.ts — LO QUE VIVE EN RAM AHORA MISMO, Y SALIR DE ELLA
 * ======================================================================
 * v1.16.3.1 · MODO BAJO CONSUMO. El informe MEJORA_MODO_BAJO_CONSUMO_v1 §2.3
 * lo pedía con estas palabras: «el usuario ve por qué se apaga la máquina y
 * tiene la salida sin abrir la consola».
 *
 * QUÉ ES: el único sitio del servidor que habla con `GET /api/ps` de Ollama y
 * el único que expulsa modelos. Tres piezas:
 *   · `sondearOllamaPs()`   → lista normalizada de modelos RESIDENTES (no
 *                             instalados: cargados ahora, ocupando RAM/VRAM).
 *   · `expulsarModelos()`   → POST /api/generate con keep_alive:0 por modelo
 *                             (la orden de descarga INMEDIATA de Ollama).
 *   · la caché de muestra   → el stats del frontend se pide cada 5 s; machacar
 *                             Ollama con /api/ps en cada muestra es justo el
 *                             ruido que este módulo viene a quitar.
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN server.ts: el trinquete de líneas del monolito
 * (SUPERFICIE: server.ts no crece). Todo lo nuevo que quepa en un módulo con
 * API propia vive en un módulo; al monolito solo le llegan las tres líneas
 * que montan la ruta y el delegador de la herramienta.
 *
 * HONESTIDAD DEL MEDIDOR: `ollama ps` responde tamaños en bytes ya parseados
 * por Ollama (`size_vram`, `size`); si un campo falta o llega basura, el
 * modelo se informa SIN tamaño (null) — nunca se inventa un número redondo.
 * El total `residenteMb` suma solo lo medido. Y si Ollama no está, el estado
 * es `vivo: false`, no un silencio.
 */

export interface ModeloResidente {
  /** Nombre exacto con tag tal como lo reporta Ollama. */
  model: string;
  /** Bytes totales ocupados (size de /api/ps). null = Ollama no lo informó. */
  sizeBytes: number | null;
  /** Porción declarada en VRAM. null = no informada. */
  vramBytes: number | null;
  /** Cuándo caduca la residencia (texto de Ollama, p. ej. "About a minute"). */
  until: string;
  /** true si Ollama ya lo marcó expirado (se descargará solo). */
  expirado: boolean;
}

export interface EstadoOllamaPs {
  vivo: boolean;
  modelos: ModeloResidente[];
  /** Suma de sizeBytes de los modelos medidos. */
  residenteMb: number;
  /** Momento de la muestra (epoch ms). */
  muestreadoEn: number;
  /** Motivo legible cuando vivo=false (para el chip de Puertos). */
  error?: string;
}

/** Caducidad de la muestra: 5 s iguala el polling del frontend, ni más fino. */
export const PS_CADUCIDAD_MS = 5_000;
/** Sondeo corto: /api/ps es local y responde en milisegundos; 2 s es holgado. */
export const PS_TIMEOUT_MS = 2_000;

let ultimaMuestra: EstadoOllamaPs | null = null;

function bytes(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Normaliza la respuesta cruda de /api/ps. Función PURA: se prueba en seco. */
export function normalizarPs(crpudo: unknown, ahora = Date.now()): ModeloResidente[] {
  const lista = Array.isArray((crpudo as any)?.models) ? (crpudo as any).models : [];
  const out: ModeloResidente[] = [];
  for (const m of lista) {
    if (!m || typeof m.model !== "string" || !m.model.trim()) continue;
    out.push({
      model: m.model.trim(),
      sizeBytes: bytes(m.size ?? m.size_vram),
      vramBytes: bytes(m.size_vram),
      until: typeof m.until === "string" ? m.until : "",
      expirado: (() => {
        const t = m.until ? Date.parse(m.until) : NaN;
        return Number.isFinite(t) ? t <= ahora : false;
      })(),
    });
  }
  return out;
}

/** Suma solo lo medido; un modelo sin tamaño no infla el total. Pura también. */
export function sumarResidenteMb(modelos: ModeloResidente[]): number {
  return Math.round(modelos.reduce((s, m) => s + (m.sizeBytes ?? 0), 0) / 1024 / 1024);
}

/** Invalida la muestra (la expulsión y el refresh la llaman para no mentir). */
export function invalidarMuestraPs(): void {
  ultimaMuestra = null;
}

export interface DepsPs {
  /** URL base de Ollama (OLLAMA_HOST del proceso, ya normalizada sin barra). */
  ollamaUrl: string;
  /** Inyectable para pruebas en seco. */
  fetchImpl?: typeof fetch;
  ahora?: () => number;
}

/**
 * Sondeo de modelos residentes con caché de 5 s. Nunca lanza: responde
 * { vivo:false, error } si Ollama está caído o tarda (un medor que no
 * responde no puede detener el panel de Puertos).
 */
export async function sondearOllamaPs(deps: DepsPs, forzar = false): Promise<EstadoOllamaPs> {
  const ahora = (deps.ahora ?? Date.now)();
  if (!forzar && ultimaMuestra && ahora - ultimaMuestra.muestreadoEn < PS_CADUCIDAD_MS) {
    return ultimaMuestra;
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  let vivo = false;
  let modelos: ModeloResidente[] = [];
  let error: string | undefined;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PS_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${deps.ollamaUrl}/api/ps`, { signal: controller.signal });
      if (res.ok) {
        vivo = true;
        modelos = normalizarPs(await res.json().catch(() => ({})), Date.now());
      } else {
        error = `Ollama respondió HTTP ${res.status} a /api/ps`;
      }
    } finally {
      clearTimeout(t);
    }
  } catch (err: any) {
    error = `Ollama no respondió al sondeo de residencia (${err?.message || "conexión"}).`;
  }
  ultimaMuestra = {
    vivo,
    modelos,
    residenteMb: sumarResidenteMb(modelos),
    muestreadoEn: ahora,
    ...(error ? { error } : {}),
  };
  return ultimaMuestra;
}

/**
 * Expulsión inmediata: la receta oficial es un generate con keep_alive:0 —
 * Ollama interpreta «termina esta petición y descarga el modelo» sin esperar
 * la caducidad. `modelos` vacío = expulsar TODO lo residente. Devuelve el
 * antes/después medido, no una promesa de fe.
 */
export async function expulsarModelos(
  deps: DepsPs,
  modelos?: string[]
): Promise<{ ok: boolean; expulsados: string[]; fallidos: { model: string; error: string }[]; despues: EstadoOllamaPs }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const antes = await sondearOllamaPs(deps, true);
  const objetivo = (modelos && modelos.length ? modelos : antes.modelos.map((m) => m.model)).filter(Boolean);
  const expulsados: string[] = [];
  const fallidos: { model: string; error: string }[] = [];
  for (const model of objetivo) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), PS_TIMEOUT_MS * 5);
      try {
        const res = await fetchImpl(`${deps.ollamaUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }),
          signal: controller.signal,
        });
        if (res.ok) expulsados.push(model);
        else fallidos.push({ model, error: `HTTP ${res.status}` });
      } finally {
        clearTimeout(t);
      }
    } catch (err: any) {
      fallidos.push({ model, error: err?.message || String(err) });
    }
  }
  invalidarMuestraPs();
  const despues = await sondearOllamaPs(deps, true);
  return { ok: fallidos.length === 0, expulsados, fallidos, despues };
}

```

### server/pivotEnVivo.ts (173 líneas)

```ts
// ============================================================
// PIVOT EN VIVO — v1.57.19 · F2: las manos del rescate local
// ============================================================
// El cerebro es puro (src/engine/pivotProveedores.ts). Acá vive lo que necesita
// hablar con el mundo: el inventario real de Ollama, el ranking con las
// mediciones de ESTA máquina, la decisión con consentimiento, y el envío del
// texto del bucle de agente en trozos (extraído del monolito para que la valla
// de líneas siga respirando).
import { ordenarCandidatos, decidirPivot, type ConsentimientoNube } from "../src/engine/pivotProveedores";
import { medicionDe, presupuestoPrimerByte } from "../src/engine/relojModelos";
import { enCuarentena, notaCuarentena, registrarFalloProveedor } from "../src/engine/fusibleProveedores";
import { sugerirAlternativa, modelosMedidos } from "../src/engine/relojModelos";
import { registrarRescateDelTurno } from "../src/engine/pivotProveedores";
import { tagsOllama } from "./tagsCache";

export interface CtxMinimo {
  isAborted(): boolean;
  sendChunk(t: string): void;
  sendDone(modelo: string): void;
}

export interface InventarioLocal {
  /** Todos los modelos locales disponibles. */
  modelos: string[];
  /** Los que YA están cargados en memoria (Ollama /api/ps) — costo de contexto cero. */
  cargados: string[];
}

/**
 * v1.57.19 · F2 · El inventario real: /api/tags para el catálogo y /api/ps para
 * saber cuáles están CARGADOS. La verdad la dice Ollama, no una suposición.
 */
export async function cargarInventarioLocal(targetUrl: string): Promise<InventarioLocal> {
  const inventario: InventarioLocal = { modelos: [], cargados: [] };
  try {
    // v2.0.1 · caché compartida: /api/tags tarda ~4,5 s en esta máquina y el
    // timeout de 2,5 s abortaba SIEMPRE. La caché deduplica y sirve la última
    // lista buena, así el inventario deja de llegar vacío y el IDE no salta de
    // proveedor creyendo que Ollama no tiene modelos.
    const foto = await tagsOllama(targetUrl);
    inventario.modelos = foto.modelos.map((m) => String(m.name || m.model || "")).filter(Boolean);
  } catch { /* sin catálogo no hay candidatos: no se inventa ninguno */ }
  try {
    const rp = await fetch(`${targetUrl}/api/ps`, { signal: AbortSignal.timeout(1500) });
    if (rp.ok) {
      const dp: any = await rp.json();
      inventario.cargados = ((dp?.models || []) as any[]).map((m: any) => String(m?.name || m?.model || "")).filter(Boolean);
    }
  } catch { /* sin /api/ps todos quedan «fríos»: es el peor caso, no una mentira */ }
  return inventario;
}

/** El consentimiento del usuario viaja en el cuerpo del pedido: si/no/preguntar. */
export function consentimientoDeRescate(body: any): ConsentimientoNube {
  const v = String(body?.rescateNube || "").toLowerCase();
  return v === "si" ? "si" : v === "no" ? "no" : "preguntar";
}

/** La pausa de cuarentena, si corresponde: mensaje honesto o null. */
export function notaDeCuarentenaLocal(modelo: string): string | null {
  if (!enCuarentena(modelo)) return null;
  return notaCuarentena(modelo, sugerirAlternativa(modelosMedidos().filter((m) => m !== modelo)));
}

export interface ResultadoPivot {
  /** true = hay rescate: el llamador cambia de modelo y reintenta. */
  continuar: boolean;
  modelo?: string;
  aviso: string;
  /** Presupuesto del modelo que rescata (medido o por clase), para el reloj. */
  relojMs?: number;
  relojEtiqueta?: string;
  /** Texto honesto para el usuario cuando NO se puede rescatar. */
  mensajeError: string;
}

/**
 * Decide el rescate local: registra el fallo en el fusible, arma el ranking con
 * las mediciones reales y consulta el consentimiento. Devuelve el veredicto y el
 * aviso honesto (nunca «optimizando»).
 */
export function intentarPivotLocal(args: {
  modeloEnVuelo: string;
  inventarioLocal: InventarioLocal;
  textoEntregado: number;
  pivotesUsados: number;
  consentimiento: ConsentimientoNube;
  relojLocalMs: number;
  relojLocalEtiqueta: string;
}): ResultadoPivot {
  const fallo = new Error(
    `sin respuesta de ${args.modeloEnVuelo} en los primeros ${Math.round(args.relojLocalMs / 1000)} s (timeout de inactividad; presupuesto ${args.relojLocalEtiqueta})`
  );
  registrarFalloProveedor(args.modeloEnVuelo, fallo);
  const cargados = new Set(args.inventarioLocal.cargados);
  const candidatos = args.inventarioLocal.modelos
    .filter((m) => m && m !== args.modeloEnVuelo)
    .map((m) => ({ modelo: m, proveedor: "ollama" as const, pesoCalidad: 1, esLocal: true, cargado: cargados.has(m) }));
  const medidos: Record<string, { p50: number } | undefined> = {};
  for (const m of args.inventarioLocal.modelos) {
    const med = medicionDe(m);
    if (med) medidos[m] = { p50: med.p50 };
  }
  const ranking = ordenarCandidatos(candidatos, { medidos, enCuarentena: (m) => !!enCuarentena(m), fallado: args.modeloEnVuelo });
  const decision = decidirPivot(
    { modeloElegido: args.modeloEnVuelo, contenidoEntregado: args.textoEntregado > 0, pivotesUsados: args.pivotesUsados, consentimiento: args.consentimiento },
    ranking
  );
  if (decision.pivotar && decision.esLocal && decision.modelo) {
    const reloj = relojDeModeloLocal(decision.modelo, args.inventarioLocal);
    // El acta y la visibilidad viven acá: el monolito sólo cambia de modelo y reintenta.
    registrarRescateDelTurno({ elegido: args.modeloEnVuelo, rescate: decision.modelo, proveedor: "ollama", causa: "silencio del tramo PRIMER BYTE", aLosMs: args.relojLocalMs });
    console.log(`[ai/stream] ${decision.aviso}`);
    return { continuar: true, modelo: decision.modelo, aviso: decision.aviso, relojMs: reloj.ms, relojEtiqueta: reloj.etiqueta, mensajeError: fallo.message };
  }
  const mensajeError = decision.aviso && !decision.pivotar ? `${fallo.message} · ${decision.aviso}` : fallo.message;
  return { continuar: false, aviso: decision.aviso, mensajeError };
}

/** El bucle de agente entrega su texto de a 3 palabras (v2.0), con su pausa. */
export async function enviarEnTrozos(ctx: CtxMinimo, texto: string, pausaMs = 15): Promise<void> {
  const palabras = String(texto).split(" ");
  for (let i = 0; i < palabras.length; i += 3) {
    if (ctx.isAborted()) break;
    ctx.sendChunk(palabras.slice(i, i + 3).join(" ") + " ");
    await new Promise((r) => setTimeout(r, pausaMs));
  }
}

// ============================================================
// v1.66.1 · EL RELOJ DE UN MODELO LOCAL, CON LO QUE SABEMOS DE ÉL
// ------------------------------------------------------------
// SALE DEL MONOLITO por el trinquete de líneas de server.ts, y porque acá ya
// vive `InventarioLocal`: nadie más cerca de la verdad de /api/ps.
//
// RAÍZ (sesión exportada 1792727665798, 23/10): seis modelos chicos —qwen3-vl:2b,
// smollm2:1.5b, gemma3:270m, deepseek-coder:1.3b, qwen3:0.6b, qwen2.5:0.5b—
// murieron TODOS a los ~60-64 s con «El modelo local cayó demasiado tiempo».
// Sesenta segundos son exactamente `BASES["local-chico"]`: el reloj le pedía al
// primer byte que llegara como si el modelo ya estuviera servido, pero el
// usuario había rotado por seis modelos en dos minutos y cada rotación expulsa al
// anterior. Ninguno estaba en RAM. El primer byte tenía que incluir volcar los
// pesos y procesar el prompt, y para eso 60 s no alcanzan ni de lejos.
//
// Dos datos, ambos ya disponibles en el turno, ambos declarados y no adivinados:
//   · `cargadoEnRam` ← `inventarioLocal.cargados` (/api/ps)
//   · `esLocal`      ← el nombre: un `-cloud` por Ollama IGUAL se computa afuera.
// ============================================================
/** `nombre:latest` y `nombre` son el mismo modelo para Ollama. */
const sinEtiquetaDeModelo = (s: string) => String(s || "").toLowerCase().replace(/:latest$/, "");

/** ¿El modelo está ahora mismo en RAM? La dice Ollama por `/api/ps`, no nosotros. */
export function estaCargadoEnRam(inventario: InventarioLocal, modelo: string): boolean {
  const buscado = sinEtiquetaDeModelo(modelo);
  return (inventario?.cargados || []).some(
    (m) => sinEtiquetaDeModelo(m) === buscado || String(m || "").toLowerCase() === String(modelo || "").toLowerCase(),
  );
}

/** Un `-cloud` servido por Ollama no gasta esta máquina: su reloj es el de la nube. */
export function esModeloLocalDeVerdad(modelo: string): boolean {
  return !/-cloud|:cloud|cloud\b|gpt-oss/i.test(String(modelo || ""));
}

/** El presupuesto del primer byte de ESTE modelo local, con carga fría declarada. */
export function relojDeModeloLocal(modelo: string, inventario?: InventarioLocal | null) {
  const esLocal = esModeloLocalDeVerdad(modelo);
  const cargadoEnRam = inventario ? estaCargadoEnRam(inventario, modelo) : undefined;
  const p = presupuestoPrimerByte(modelo, { esLocal, cargadoEnRam });
  console.log(`[ai/stream] \u23f1\ufe0f \u00ab${modelo}\u00bb: ${Math.round(p.ms / 1000)} s de primer byte \u2014 ${p.etiqueta}`);
  return p;
}

```

### server/propuestasAutonomas.ts (173 líneas)

```ts
/**
 * propuestasAutonomas.ts — SUITE «EL LABORATORIO TIENE MOTOR»: AUTO-PROPUESTA
 * DE PARCHES AL CEREBRO (v1.76.0)
 * ============================================================================
 * CIERRA la deuda declarada de `auto_propose` en el laboratorio de capacidades:
 * «falta el contador de fallos repetidos por patrón y la redacción automática».
 * El contador y la redacción viven en la capa pura `src/engine/patronesFallo.ts`
 * (probada en `tests/patronesFallo.test.ts`); acá está el cable con permiso de
 * tocar disco, calcado del patrón de `aprendizajeVivo` (v1.74.0):
 *
 *   · estado en `.cerebro-db/propuestas-autonomas.json` (ventana acotada);
 *   · la propuesta se materializa con el MISMO escritor que ya existía en la
 *     casa (`Brain.guardarPropuesta` → `.cerebro-db/proposals/*.md` + métrica
 *     «propuestas» en memoria.md). Cero formatos nuevos, cero duplicación;
 *   · aviso en la barra de Tareas en el momento exacto en que se propone
 *     (`PROPOSTA P#…`), igual que las lecciones de v1.74.0;
 *   · NUNCA aplica nada: `cerebro.md` es el núcleo inmutable — la propuesta
 *     queda pendiente de aprobación humana (regla de la casa, intacta).
 *
 * APAGADA POR DEFECTO: la capacidad `auto_propose` decide si esta suite
 * registra o no. Apagada no escribe ni un byte (coste en reposo: cero, la
 * misma regla del RAG y del multi-cerebro).
 *
 * CONTROL DE FALSO POSITIVO heredado de la capa pura: un turno que reintentó
 * la misma llamada diez veces suma UNA ocurrencia; la propuesta exige
 * reincidencia entre TURNOS distintos (≥3) y guarda de cooldown (7 días).
 */

import * as fs from "fs";
import * as path from "path";
import {
  clasificarFallo,
  contarPatron,
  decidirPropuesta,
  redactarPropuesta,
  clavePatron,
  type EstadoPatrones,
  type EntradaPatron,
} from "../src/engine/patronesFallo";

export interface DepsPropuestasAutonomas {
  proyectoRoot: string;
  /** La capacidad del laboratorio, leída al momento del hecho (no al arrancar). */
  activada?: () => boolean;
  /** Reloj inyectable — los tests congelan el tiempo sin dormir. */
  ahora?: () => number;
  /** El MISMO escritor de propuestas de la casa (`Brain.guardarPropuesta`). */
  guardarPropuesta: (p: { motivo: string; linea: string; bloque: string; detectadaEn: number }) => string | null;
  /** Espejo vivo para la barra de Tareas (opcional: sin él, solo consola). */
  marcarVivo?: (nota: string) => void;
}

let deps: DepsPropuestasAutonomas | null = null;
let estado: EstadoPatrones = {};
let turnoActual = "turno";
let contadorTurnos = 0;
let propuestasGeneradas = 0;

const estadoPath = (): string =>
  path.join(deps!.proyectoRoot, ".cerebro-db", "propuestas-autonomas.json");

const ahoraMs = (): number => (deps?.ahora ? deps.ahora() : Date.now());

function cargarEstado(): void {
  estado = {};
  if (!deps) return;
  try {
    if (fs.existsSync(estadoPath())) {
      const j = JSON.parse(fs.readFileSync(estadoPath(), "utf-8"));
      if (j && typeof j === "object" && j.patrones && typeof j.patrones === "object") {
        estado = j.patrones as EstadoPatrones;
      }
    }
  } catch {
    estado = {};
  }
}

function guardarEstado(): void {
  if (!deps) return;
  try {
    fs.mkdirSync(path.dirname(estadoPath()), { recursive: true });
    fs.writeFileSync(estadoPath(), JSON.stringify({ generadoEn: ahoraMs(), patrones: estado }), "utf-8");
  } catch {
    /* el contador nunca rompe un turno que funciona */
  }
}

export function inicializarPropuestasAutonomas(d: DepsPropuestasAutonomas): void {
  deps = d;
  cargarEstado();
}

/** Abre turno: el mismo gancho que `abrirTurnoBucle()` en las dos ramas. */
export function abrirTurnoPropuestas(): void {
  contadorTurnos += 1;
  turnoActual = `t${contadorTurnos}-${Date.now()}`;
}

/** Estado para el panel / diagnóstico. */
export function estadoPropuestasAutonomas(): {
  ok: boolean;
  inicializado: boolean;
  activada: boolean;
  patrones: Array<EntradaPatron & { clave: string; propuestaPendiente: boolean }>;
  propuestasGeneradas: number;
} {
  const activada = !!deps?.activada?.();
  const lista = Object.keys(estado)
    .map((k) => {
      const e = estado[k];
      const dec = decidirPropuesta(e, ahoraMs());
      return { ...e, clave: k, propuestaPendiente: dec.generar };
    })
    .sort((a, b) => b.total - a.total || b.ultimaVez - a.ultimaVez)
    .slice(0, 30);
  return { ok: true, inicializado: !!deps, activada, patrones: lista, propuestasGeneradas };
}

/** Olvida contadores (botón honesto: el usuario decide borrar la memoria del patrón). */
export function limpiarPatrones(): { ok: boolean; borrados: number } {
  const n = Object.keys(estado).length;
  estado = {};
  guardarEstado();
  return { ok: true, borrados: n };
}

/**
 * El hecho que activa todo: una herramienta del lazo falló. Se llama desde
 * `learnFromToolFailure` (lazo local) y desde el lazo de nube con el mismo
 * contrato tolerante a fallos: NUNCA corta un turno.
 */
export function notificarFalloRecurrente(
  herramienta: string,
  errorTexto: string,
  opts?: { turnoId?: string; ahora?: number }
): { generado: boolean; motivo: string; archivo?: string } {
  if (!deps) return { generado: false, motivo: "no inicializado" };
  if (deps.activada && !deps.activada()) return { generado: false, motivo: "capacidad apagada" };
  const ahora = opts?.ahora ?? ahoraMs();
  const turno = opts?.turnoId || turnoActual;
  const clasif = clasificarFallo(errorTexto);
  const entrada = contarPatron(estado, herramienta, clasif, turno, ahora);
  const dec = decidirPropuesta(entrada, ahora);
  if (dec.generar) {
    const texto = redactarPropuesta(herramienta, entrada, clasif, dec.motivo);
    const campo = (nombre: string) => {
      const m = texto.match(new RegExp(`^-\\s*${nombre}\\s*:(.*)$`, "im"));
      return m ? m[1].trim() : "";
    };
    const archivo = deps.guardarPropuesta({
      motivo: campo("Motivo"),
      linea: campo("Línea a modificar"),
      bloque: texto,
      detectadaEn: ahora,
    });
    propuestasGeneradas += archivo ? 1 : 0;
    entrada.propuestoEn = ahora;
    entrada.vecesPropuesto += 1;
    estado[clavePatron(herramienta, entrada.patron)] = entrada;
    guardarEstado();
    try {
      deps.marcarVivo?.(`PROPUESTA (${herramienta} · ${entrada.patron}): ${dec.motivo} — pendiente en proposals`);
    } catch {
      /* el aviso nunca rompe nada */
    }
    console.log(`[CerebroNico] auto-propuesta (${herramienta} · ${entrada.patron}): ${dec.motivo} — pendiente en .cerebro-db/proposals${archivo ? "" : " (no se pudo escribir)"}`);
    return { generado: true, motivo: dec.motivo, archivo: archivo || undefined };
  }
  guardarEstado();
  return { generado: false, motivo: dec.motivo };
}

```

### server/proyectoRegistro.ts (334 líneas)

```ts
/**
 * proyectoRegistro.ts — v1.0.20 · EL ARCHIVO ÚNICO (tmp + fsync + rename)
 * =======================================================================
 * QUÉ ES: la pieza B de la consolidación atómica. Un solo archivo
 * (`.cerebro-db/proyecto-abierto.json`) es la ÚNICA verdad sobre qué proyecto se
 * está sirviendo. Todo lo demás (pin del canal directo, estado vivo del sandbox,
 * autodetección por mtime) se DERIVA de aquí o se espeja desde aquí.
 *
 * POR QUÉ ATÓMICO: en la sesión del 15/11 el sandbox se quedó «ocupado de la
 * sesión anterior» y no encontraba la ruta. Un JSON escrito a mano con
 * `writeFileSync` mientras otro proceso lo lee se puede leer a medias; si el
 * proceso muere en medio, queda un archivo truncado que NADIE sabe reconstruir.
 * Aquí se escribe en `<archivo>.tmp-<pid>-<ts>`, se hace `fsync` (para que los
 * bytes estén en disco, no en la caché del sistema) y se `rename` en el MISMO
 * directorio — atómico en NTFS y en POSIX.
 *
 * POR QUÉ TOLERANTE: un JSON roto no se borra en silencio: se mueve a
 * `.corrupto-<ts>` (queda la evidencia) y se reconstruye desde el pin legacy.
 * «Reconstruir» y «destruir» no son lo mismo.
 *
 * QUÉ NO HACE: no decide rutas (eso es `src/engine/rutasAtomicas.ts`, puro) ni
 * habla HTTP (eso es `server/routers/rutasProyecto.ts`).
 */
import fs from "node:fs";
import path from "node:path";
import {
  decidirApertura, normalizarRuta, estaDentro, indexDeArranque,
  type ContextoRutas, type ProyectoAbierto,
} from "../src/engine/rutasAtomicas";

export const NOMBRE_ARCHIVO = "proyecto-abierto.json";
export const VERSION_REGISTRO = 2;

export interface RegistroProyecto {
  version: number;
  /** El proyecto que el :3500 sirve AHORA. `null` = ninguno. */
  abierto: ProyectoAbierto | null;
  /** Los últimos abiertos, el más nuevo primero (tope 20). */
  proyectos: ProyectoAbierto[];
  /** Última escritura (epoch ms): sirve para invalidar la caché entre procesos. */
  actualizadoEn: number;
}

export interface DepsRegistro {
  /** Raíz de datos (`C:\Cerebronico`). El registro vive en `<raíz>/.cerebro-db`.
   *  Puede ser una función: el monolito conoce la raíz validada al arrancar. */
  raizDatos: string | (() => string);
  /** Instalación del IDE (`process.cwd()` del server). */
  instalacion: string | (() => string);
  /** Reloj inyectable: las pruebas no esperan a la caché. */
  ahora?: () => number;
  /** Log inyectable (el monolito loguea; las pruebas callan). */
  log?: (m: string) => void;
}

function valorDe(v: string | (() => string)): string {
  try { return normalizarRuta(typeof v === "function" ? v() : v); } catch { return ""; }
}

/** Tope del historial: 20 proyectos es memoria útil, 200 es un diario. */
const TOPE_HISTORIAL = 20;
/** La caché de 1 s convierte el refresco del panel en O(1) sin mentir: 1 s de desfase es humano. */
const TTL_CACHE_MS = 1000;

type EntradaCache = { clave: string; en: number; valor: RegistroProyecto };
let cache: EntradaCache | null = null;

/** Vacía la caché (pruebas y escrituras propias). */
export function olvidarRegistro(): void { cache = null; }

function archivoDe(raizDatos: string): string {
  return path.join(raizDatos, ".cerebro-db", NOMBRE_ARCHIVO);
}

function vacio(ahora: number): RegistroProyecto {
  return { version: VERSION_REGISTRO, abierto: null, proyectos: [], actualizadoEn: ahora };
}

/**
 * Escritura ATÓMICA: tmp en el mismo directorio + fsync + rename. Si algo falla,
 * el archivo viejo sigue completo — nunca queda uno a medias.
 */
export function escribirAtomico(destino: string, contenido: string): void {
  const dir = path.dirname(destino);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${path.basename(destino)}.tmp-${process.pid}-${Date.now()}`);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, contenido, "utf8");
    try { fs.fsyncSync(fd); } catch { /* algunos FS (red) no lo soportan: el rename sigue siendo atómico */ }
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, destino);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* nada que limpiar */ }
    throw e;
  }
}

/** Lee el pin legacy del CANAL DIRECTO sin importar el router (evita un ciclo). */
function pinLegacy(raizDatos: string): string | null {
  try {
    const f = path.join(raizDatos, ".cerebro-db", "carpeta-vinculada.json");
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    return typeof j?.ruta === "string" && j.ruta ? j.ruta : null;
  } catch { return null; }
}

/** Espeja el registro hacia el pin legacy para que NADA de lo viejo se rompa. */
function espejarPinLegacy(raizDatos: string, proyecto: ProyectoAbierto | null, log?: (m: string) => void): void {
  try {
    const f = path.join(raizDatos, ".cerebro-db", "carpeta-vinculada.json");
    if (!proyecto) {
      // Cerrar no borra el pin: el humano pudo haberlo fijado a mano y borrarlo
      // sería destruir una decisión que no tomamos nosotros.
      return;
    }
    const estado = {
      ruta: proyecto.ruta,
      nombre: proyecto.nombre,
      origen: "carpeta",
      vinculadaEn: proyecto.abiertoEn,
      archivos: 0,
      bytes: 0,
      truncado: true,
      muestra: [],
      espejoDe: NOMBRE_ARCHIVO,
    };
    escribirAtomico(f, JSON.stringify(estado, null, 2));
  } catch (e) {
    log?.(`[rutas] no pude espejar el pin legacy: ${(e as Error)?.message || e}`);
  }
}

/**
 * Lee el registro. Nunca lanza: un registro ilegible es un hecho que se reporta
 * con `abierto: null`, no una excepción que tumbe un `/api/rutas/contexto`.
 */
export function leerRegistro(deps: DepsRegistro, forzar = false): RegistroProyecto {
  const raiz = valorDe(deps.raizDatos);
  const ahora = deps.ahora ? deps.ahora() : Date.now();
  if (!raiz) return vacio(ahora);
  // v1.0.20 · RELOJ CONGELADO = SIN MEMORIA. Con `ahora` inyectado y fijo (pruebas)
  // `ahora - cache.en` siempre da 0 y la caché miente para siempre: se leyó una
  // vez y no se vuelve a mirar el disco. Un reloj inyectado no es un reloj: con
  // él se lee siempre. (En producción `Date.now()` avanza y la caché de 1 s vale.)
  const congelado = !!deps.ahora;
  if (!forzar && !congelado && cache && cache.clave === raiz && ahora - cache.en < TTL_CACHE_MS) return cache.valor;

  const f = archivoDe(raiz);
  let reg: RegistroProyecto | null = null;
  try {
    const bruto = fs.readFileSync(f, "utf8");
    const j = JSON.parse(bruto);
    if (j && typeof j === "object" && (j.abierto === null || typeof j.abierto?.ruta === "string")) {
      reg = {
        version: Number(j.version) || 1,
        abierto: j.abierto ? normalizarGuardado(j.abierto) : null,
        proyectos: Array.isArray(j.proyectos) ? j.proyectos.map(normalizarGuardado).filter(Boolean) as ProyectoAbierto[] : [],
        actualizadoEn: Number(j.actualizadoEn) || ahora,
      };
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== "ENOENT") {
      // JSON roto o ilegible: se CUARENTENA (la evidencia no se tira) y se reconstruye.
      try {
        const cuarentena = `${f}.corrupto-${ahora}`;
        fs.renameSync(f, cuarentena);
        deps.log?.(`[rutas] ${NOMBRE_ARCHIVO} ilegible: cuarentena en ${path.basename(cuarentena)} y se reconstruye`);
      } catch { /* si ni eso se puede, se sigue con el registro vacío */ }
    }
  }

  // Reconstrucción: sin registro válido se adopta el pin legacy (si lo hay).
  if (!reg) {
    reg = vacio(ahora);
    const pin = pinLegacy(raiz);
    if (pin && estaDentro(pin, raiz)) {
      reg.proyectos = [{ nombre: path.basename(pin), ruta: normalizarRuta(pin), abiertoEn: ahora, origen: "existente", sembrado: [], heredadoDe: "carpeta-vinculada.json" }];
      reg.abierto = reg.proyectos[0];
    }
  }

  // AUTO-CURACIÓN: si la carpeta abierta ya no existe en disco, se declara huérfana
  // (no se inventa otra). Recrear es decisión de `abrir`, no de `leer`.
  if (reg.abierto && !fs.existsSync(reg.abierto.ruta)) {
    reg = { ...reg, abierto: null };
  }

  cache = { clave: raiz, en: ahora, valor: reg };
  return reg;
}

function normalizarGuardado(p: any): ProyectoAbierto | null {
  if (!p || typeof p.ruta !== "string" || !p.ruta) return null;
  return {
    nombre: String(p.nombre || path.basename(normalizarRuta(p.ruta))),
    ruta: normalizarRuta(p.ruta),
    abiertoEn: Number(p.abiertoEn) || 0,
    origen: p.origen === "creado" ? "creado" : "existente",
    sembrado: Array.isArray(p.sembrado) ? p.sembrado.map(String) : [],
    ...(p.heredadoDe ? { heredadoDe: String(p.heredadoDe) } : {}),
  } as ProyectoAbierto;
}

/** El contexto de las tres raíces, ya resuelto (lo que recibe la autoridad pura). */
export function contextoDeRutas(deps: DepsRegistro): ContextoRutas {
  const reg = leerRegistro(deps);
  return {
    instalacion: valorDe(deps.instalacion),
    datos: valorDe(deps.raizDatos),
    proyecto: reg.abierto ? reg.abierto.ruta : null,
  };
}

/** La obra abierta AHORA, o `null`. Es la consulta O(1) que reemplaza al barrido. */
export function obraAbierta(deps: DepsRegistro): string | null {
  return leerRegistro(deps).abierto?.ruta ?? null;
}

export interface ResultadoApertura {
  ok: boolean;
  motivo: string;
  proyecto?: ProyectoAbierto;
  /** El bloque del modelo, ya compuesto (una llamada = todo lo que hace falta). */
  contexto?: string;
  avisos: string[];
}

/**
 * ABRE un proyecto: decide la carpeta (pura), la siembra si está vacía, escribe
 * el registro y espeja el pin — todo o nada. Si el registro no se puede escribir,
 * no se anuncia la apertura: un «abierto» que no persiste es el defecto de origen.
 */
export function abrirProyecto(deps: DepsRegistro, nombre: string, modo?: "nuevo" | "abrir"): ResultadoApertura {
  const log = deps.log;
  const raiz = valorDe(deps.raizDatos);
  const instalacion = valorDe(deps.instalacion);
  const ahora = deps.ahora ? deps.ahora() : Date.now();
  const ctx: ContextoRutas = { instalacion, datos: raiz, proyecto: null };
  const decision = decidirApertura({ nombre, modo }, ctx);
  if (!decision.ok) return { ok: false, motivo: decision.motivo, avisos: [] };

  const avisos: string[] = [];
  const existe = fs.existsSync(decision.ruta);
  const esDir = existe && fs.statSync(decision.ruta).isDirectory();
  if (existe && !esDir) {
    return { ok: false, motivo: `«${decision.ruta}» existe pero NO es una carpeta: no se abre un proyecto encima de un archivo.`, avisos };
  }
  const sembrado: string[] = [];
  try {
    fs.mkdirSync(decision.ruta, { recursive: true });
    if (!existe) {
      avisos.push(`carpeta creada: ${decision.ruta}`);
    }
    // Siembra SOLO si está vacía: adoptar un proyecto existente no le añade archivos.
    let vacia = true;
    try { vacia = fs.readdirSync(decision.ruta).length === 0; } catch { vacia = false; }
    if (vacia) {
      fs.writeFileSync(path.join(decision.ruta, "index.html"), indexDeArranque(decision.slug), "utf8");
      sembrado.push("index.html");
      avisos.push("sembrado index.html para que el :3500 tenga algo que servir desde el primer segundo");
    }
  } catch (e) {
    return { ok: false, motivo: `no pude crear la carpeta «${decision.ruta}»: ${(e as Error)?.message || e}`, avisos };
  }

  // La instalación del IDE NUNCA puede ser la obra: el :3500 serviría el motor.
  if (estaDentro(decision.ruta, instalacion) || estaDentro(instalacion, decision.ruta)) {
    return { ok: false, motivo: `«${decision.ruta}» choca con la instalación del IDE (${instalacion}): elegí otro nombre.`, avisos };
  }

  const proyecto: ProyectoAbierto = {
    nombre: decision.slug,
    ruta: decision.ruta,
    abiertoEn: ahora,
    origen: existe ? "existente" : "creado",
    sembrado,
  };

  const previo = leerRegistro(deps, true);
  const historial = [proyecto, ...previo.proyectos.filter((p) => normalizarRuta(p.ruta).toLowerCase() !== decision.ruta.toLowerCase())].slice(0, TOPE_HISTORIAL);
  const reg: RegistroProyecto = {
    version: VERSION_REGISTRO,
    abierto: proyecto,
    proyectos: historial,
    actualizadoEn: ahora,
  };

  try {
    escribirAtomico(archivoDe(raiz), JSON.stringify(reg, null, 2));
  } catch (e) {
    return { ok: false, motivo: `la carpeta existe pero el REGISTRO no se pudo escribir (${(e as Error)?.message || e}): no hay proyecto abierto de verdad. Revisá permisos de ${path.join(raiz, ".cerebro-db")}.`, avisos };
  }
  cache = null;
  const guardado = leerRegistro(deps, true);
  if (!guardado.abierto || normalizarRuta(guardado.abierto.ruta) !== decision.ruta) {
    return { ok: false, motivo: "el registro se escribió pero no se puede releer como el proyecto abierto: se aborta para no mentir (revisá la ruta).", avisos };
  }
  espejarPinLegacy(raiz, proyecto, log);
  log?.(`[rutas] 📂 Proyecto abierto: «${proyecto.nombre}» → ${proyecto.ruta} (${proyecto.origen}${sembrado.length ? `, sembrado ${sembrado.join(", ")}` : ""})`);

  return {
    ok: true,
    motivo: "",
    proyecto,
    avisos,
    contexto: `Proyecto «${proyecto.nombre}» ABIERTO en ${proyecto.ruta}. El :3500 sirve ESA carpeta: escribí los archivos con ruta RELATIVA (p. ej. "index.html") y quedan ahí. No inventes rutas absolutas.`,
  };
}

/** Cierra el proyecto abierto. NO borra la carpeta ni el pin: solo deja de servirla. */
export function cerrarProyecto(deps: DepsRegistro): { ok: boolean; cerrado: string | null } {
  const raiz = valorDe(deps.raizDatos);
  const ahora = deps.ahora ? deps.ahora() : Date.now();
  const reg = leerRegistro(deps, true);
  const cerrado = reg.abierto?.ruta ?? null;
  if (!cerrado) return { ok: true, cerrado: null };
  const nuevo: RegistroProyecto = { ...reg, abierto: null, actualizadoEn: ahora };
  try {
    escribirAtomico(archivoDe(raiz), JSON.stringify(nuevo, null, 2));
  } catch {
    return { ok: false, cerrado };
  }
  cache = null;
  espejarPinLegacy(raiz, null);
  deps.log?.(`[rutas] 📁 Proyecto cerrado: ${cerrado} (la carpeta y el pin quedan en disco)`);
  return { ok: true, cerrado };
}


```

### server/puertoLibre.ts (67 líneas)

```ts
/**
 * puertoLibre.ts — v1.0.15 · QUÉ HACER SI EL PUERTO ESTÁ OCUPADO
 * ==============================================================
 * El sandbox sirve en :3500. Cuando ese puerto lo tiene tomado OTRA app del
 * usuario (no un resto nuestro), la guarda-zombie intentaba matarla; si no se
 * puede (sin permisos, o el usuario la quiere viva), el preview quedaba en
 * blanco sin decir por qué. Este módulo sondea puertos libres de verdad
 * (abriendo un listener efímero en 127.0.0.1) para ofrecer un alterno concreto.
 *
 * Puro respecto al dominio: sólo usa `node:net`. No mata nada ni decide política;
 * el llamador (server.ts /api/sandbox/start) decide qué hacer con el número.
 */
import net from "node:net";

/** ¿Se puede abrir un listener en `puerto`@`host`? true = libre. */
export function puertoEstaLibre(puerto: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => {
      try { s.close(); } catch { /* ya cerrado */ }
      resolve(false);
    });
    s.once("listening", () => {
      s.close(() => resolve(true));
    });
    try {
      s.listen(puerto, host);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Primer puerto libre desde `preferido` (inclusive) probando hasta `intentos`
 * consecutivos. Devuelve `null` si ninguno está libre en ese rango.
 */
export async function puertoLibre(preferido: number, intentos = 20, host = "127.0.0.1"): Promise<number | null> {
  const base = Math.max(1, Math.floor(preferido));
  for (let p = base; p < base + Math.max(1, intentos); p++) {
    if (p > 65535) break;
    if (await puertoEstaLibre(p, host)) return p;
  }
  return null;
}

/**
 * v1.0.15 · Cuerpo JSON del 409 cuando :puerto lo retiene OTRA app y no se pudo
 * liberar. Centraliza el mensaje accionable (pista con netstat/taskkill y, si hay
 * uno, el puerto alterno) para que el call site del sandbox quede en una línea.
 */
export function cuerpo409PuertoOcupado(puerto: number, alterno: number | null): {
  ok: false; error: string; puertoOcupado: number; puertoAlterno: number | null; pista: string;
} {
  const matar = `Windows: netstat -ano | findstr ":${puerto}"  →  taskkill /PID <pid> /F`;
  const pista = alterno
    ? `Cerrá la app que usa el ${puerto} (${matar}), o arrancá el sandbox en el puerto ${alterno} con la variable SANDBOX_PORT=${alterno}.`
    : `Cerrá la app que usa el ${puerto} (${matar}) y reintentá.`;
  return {
    ok: false,
    error: `El puerto ${puerto} del sandbox está ocupado por OTRA aplicación y no se pudo liberar.`,
    puertoOcupado: puerto,
    puertoAlterno: alterno,
    pista,
  };
}

```

### server/quickParser.ts (248 líneas)

```ts
/**
 * quickParser.ts — LOS MAPAS DE RUTAS DE LAS ACCIONES RÁPIDAS (v1.16.5)
 * Extraído del monolito para pagar las líneas de la continuidad del plan
 * (Fase 2: partir, no añadir). parseQuickAction los usa igual que antes.
 *
 * v1.16.6 — AQUÍ VIVE TAMBIÉN `parseQuickAction` ENTERO, y la guarda que
 * faltaba. El bug (capturado en pantalla, v1.16.5): toda orden del Editor web
 * viaja envuelta con la etiqueta «[ORDEN DEL EDITOR WEB] … no expliques:
 * ejecuta.»; con Agente PC encendido, el parser determinista veía «ejecuta» +
 * «orden», extractCommand pescaba «DEL EDITOR WEB» DE LA PROPIA ETIQUETA y lo
 * mandaba al puente como comando real. El puente hacía bien en rechazarlo
 * («binario no permitido: «DEL»») — lo que no hacía bien el IDE era corto-
 * circuitar ahí: la orden nunca llegaba al modelo y el editor web entero
 * estaba muerto por su propio envoltorio. La guarda `esOrdenDelEditorWeb` es
 * la única puerta: una orden marcada como del editor NO es acción rápida,
 * NUNCA, caiga quien caiga.
 */
export const FOLDER_MAP: Record<string, string> = {
  escritorio: "Desktop", desktop: "Desktop",
  documentos: "Documents", docs: "Documents", documents: "Documents",
  descargas: "Downloads", downloads: "Downloads",
};

// ============================================================
// LA ETIQUETA DEL EDITOR WEB — una sola cadena, dos dueños
// Frontend (src/constants.ts: WEB_EDITOR_ORDER_TAG) arma el envoltorio de la
// orden; aquí se deshace la trampa. Si alguien cambia una de las dos, la
// suite tests/accionesRapidas.test.ts pone el grito en el cielo: compara
// ambas fuentes contra esta constante.
// ============================================================
export const ETIQUETA_ORDEN_EDITOR_WEB = "[ORDEN DEL EDITOR WEB]";

/** ¿Este prompt es una orden del Editor web? Entonces NO es acción rápida. */
export function esOrdenDelEditorWeb(prompt: string): boolean {
  return prompt.trimStart().toUpperCase().startsWith(ETIQUETA_ORDEN_EDITOR_WEB.toUpperCase());
}

export function extractQuoted(s: string): string | null {
  const m = s.match(/["'«]([^"'«»]{1,2000})["'»]/s);
  return m ? m[1] : null;
}

export function extractFolder(s: string): string {
  for (const [k, v] of Object.entries(FOLDER_MAP)) {
    if (new RegExp(`\\b${k}\\b`, "i").test(s)) return `${v}/`;
  }
  const cm = s.match(/\bcarpeta\s+([\w\- ]+?)(?=[\s.,;]|$)/i);
  if (cm) return `${cm[1].trim()}/`;
  return "Desktop/"; // por defecto: Escritorio
}

export function extractFilename(s: string): string | null {
  const sClean = s.trim();
  // 1) Si hay una ruta de archivo explícita (con barra), usar el nombre base
  const pathM = sClean.match(/(?:[A-Za-z]:\\|\/)[^\s"']{1,180}\.\w{1,10}/);
  if (pathM) {
    const p = pathM[0];
    return p.split(/[\\/]/).pop() ?? p;
  }
  // 2) "llamado X" / "de nombre X" / "named X" → el token siguiente
  const namedM = sClean.match(/\b(?:llamad[ao]|de\s+nombre|named)\s+["']?([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9]{1,10})?)["']?/i);
  if (namedM) return namedM[1];
  // 3) Token con extensión de 2-10 letras (el último del texto)
  const tokens = sClean.split(/\s+/);
  let best: string | null = null;
  for (const t of tokens) {
    const clean = t.replace(/^[«"'(\[]+|[»"')\].,;:]+$/g, "");
    if (/^[A-Za-z0-9_\-]+\.[A-Za-z0-9]{2,10}$/.test(clean)) best = clean;
  }
  return best;
}

// ============================================================
// v1.23.0 · LA PROSA NO ES UN COMANDO (capturas del usuario, 2026-09-29)
// ------------------------------------------------------------
// «binario no permitido: «de»» y ««en»» no los produjo un comando: los produjo
// el propio captador. El regex m2 de abajo pescaba lo que viniera después de
// «comando|orden» y en frases como «ejecutá el comando de compilar» devolvía
// «de compilar» — que el puente, con razón, rechazaba. Y peor: el rechazo
// CORTABA el turno (pc-quick-action), así que el modelo nunca se enteraba del
// pedido real. Con la lista de stopwords y el detector de prosa, una frase en
// español deja de ser un comando antes de llegar al puente.
// ============================================================
const STOPWORDS_IDIOMA = new Set([
  "de", "la", "el", "los", "las", "un", "una", "que", "en", "con", "por", "para", "se", "su", "es", "y", "o",
  "del", "al", "lo", "te", "me", "mi", "tu", "si", "no", "sí", "como", "pero", "muy", "está", "esta", "este",
  "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "with", "is", "are", "this", "that", "it",
  "compilar", "ejecutar", "ejecuta", "corre", "corré", "verifica", "revisa", "revisar", "prueba", "probar",
  "script", "terminal", "build", "comando", "orden", "instruccion", "instrucción", "archivo", "archivos",
  // v1.43.0 — LA TRAMPA DE «comando interno o externo» (captura de Mario): el
  // error de cmd.exe «'npm.cmd' no se reconoce como un comando interno o
  // externo» hacía que el regex m2 capturara «interno o externo» y el puente
  // rechazara «binario no permitido: «interno»». Estas palabras del propio
  // mensaje de error nunca son un binario: a la lista de prosa.
  "interno", "externo", "reconoce", "recognized", "internal", "external", "command", "not", "found",
]);

/** ¿Esto es prosa disfrazada de comando? (palabras del idioma, acentos, oraciones) */
export function pareceProsa(texto: string): boolean {
  const t = String(texto || "").trim();
  if (!t) return true;
  const tokens = t.split(/\s+/);
  const primera = tokens[0].toLowerCase().replace(/[^a-záéíóúñü0-9_\-./\\~]/g, "");
  if (STOPWORDS_IDIOMA.has(primera)) return true;
  // Un binario real no lleva acentos ni «ñ»: si el primer token tiene caracteres
  // alfabéticos no-ASCII, es una palabra, no un ejecutable.
  if (/[áéíóúñüÁÉÍÓÚÑÜ]/.test(tokens[0])) return true;
  // Mayoría de stopwords → frase.
  const prosa = tokens.filter((w) => STOPWORDS_IDIOMA.has(w.toLowerCase().replace(/[^a-záéíóúñü]/g, ""))).length;
  if (tokens.length >= 3 && prosa / tokens.length >= 0.4) return true;
  // Un comando puede tener espacios; una frase termina en punto y tiene comas.
  if (tokens.length >= 4 && /[.,;]$/.test(t)) return true;
  return false;
}

/**
 * ¿El prompt es CONTENIDO PEGADO (logs, volcados, trazas, código) y no una
 * orden? El caso medido: «si le doy un código de algún log se tranca» — el
 * texto pegado decía palabras como «ejecutar»/«comando» (¡un log npm las dice
 * todas!), el parser lo declaraba acción rápida, el puente lo rechazaba y el
 * turno moría con un toast rojo sin que el modelo viera nunca el log.
 * Un log NUNCA es una acción rápida: va al modelo, que es para lo que está.
 */
export function pareceContenidoPegado(prompt: string): boolean {
  const p = String(prompt || "");
  if (/```/.test(p)) return true; // bloque de código cercado
  const lineas = p.split("\n");
  if (lineas.length > 12) return true; // una orden de PC es de una o dos líneas
  if (/\u001b\[/.test(p)) return true; // códigos ANSI de terminal
  if (/(Traceback \(most recent call last\)|npm ERR!|npm error |at .*:\d+:\d+|\[exit \d+\]|exit code \d+|Command failed|Exception in thread|panic: |segmentation fault|kernel panic)/i.test(p)) return true;
  // v1.43.0 — el aviso de «binario no reconocido» del propio shell es un LOG, no
  // una orden: cmd.exe («no se reconoce como un comando interno o externo»),
  // bash/PowerShell («command not found», «is not recognized as the name of a
  // cmdlet»), y los clásicos «No such file or directory» / «ENOENT». Pegar eso
  // en el chat pedía al modelo que lo arregle, no que lo ejecute.
  if (/(no se reconoce como un comando|is not recognized as (?:an? )?(?:internal|external|the name)|command not found|: not found|No such file or directory|ENOENT)/i.test(p)) return true;
  if (/^\s*(\$|>)\s+\S+/m.test(p) && lineas.length > 3) return true; // eco de consola
  return false;
}

export function extractCommand(s: string): string | null {
  // v1.16.6 — LAS ETIQUETAS [ASÍ] SE BORRAN ANTES DE LEER EL COMANDO.
  // El captador de abajo buscaba «orden|comando|instrucción» y se tragaba lo
  // que viniera detrás, incluidas las palabras de una etiqueta del propio
  // IDE: «[ORDEN DEL EDITOR WEB]» le devolvía «DEL EDITOR WEB» como comando.
  // Una etiqueta no es un comando; se quita y ya.
  const sin = s.replace(/\[[^\]]{0,80}\]/g, " ");
  const quoted = extractQuoted(sin);
  const m1 = sin.match(/(?:comando|orden|instrucci[oó]n|script)\s+["'«]([^"'«»]{1,400})["'»]/i);
  if (m1) {
    const cmd = m1[1].trim().split("\n")[0].trim();
    return cmd && !pareceProsa(cmd) ? cmd : null;
  }
  const m2 = sin.match(/(?:el |la |este |esa |una |un )?(?:comando|orden|instrucci[oó]n)\s+([A-Za-z_][\w\-./: ]{1,160})/i);
  if (m2) {
    const cmd = m2[1].trim();
    // v1.23.0 — LA PRUEBA DE LA PROSA: «el comando de compilar» devolvía
    // «de compilar». Si el primer token es una palabra del idioma, no hay
    // comando: mejor devolver null (y que lo resuelva el modelo) que
    // mandarle basura al puente.
    if (cmd && !pareceProsa(cmd)) return cmd;
    return null;
  }
  if (quoted && /ejecut|correr|corre|comando|run/i.test(sin)) {
    const cmd = quoted.trim().split("\n")[0].trim();
    return cmd && !pareceProsa(cmd) ? cmd : null;
  }
  return null;
}

export interface ParsedAction {
  intent: "write" | "read" | "delete" | "list" | "exec";
  path?: string;
  content?: string;
  command?: string;
}

export function parseQuickAction(prompt: string): ParsedAction | null {
  const p = prompt.trim();
  if (!p) return null;

  // v1.16.6 — GUARDA DEL EDITOR (la del bug «DEL»): la orden envuelta NO es
  // una petición de PC, es una petición de DISEÑO para el modelo. Se corta
  // aquí, antes que cualquier otra regla, para que ningún cambio futuro en
  // los regex pueda reinterpretar el envoltorio como comando.
  if (esOrdenDelEditorWeb(p)) return null;

  // v1.23.0 — GUARDA DEL LOG PEGADO: el contenido pegado (logs, trazas, código
  // con más de 12 líneas) NUNCA es una acción rápida, aunque mencione
  // «comando», «ejecutar» o «error». Va al modelo. Sin esta guarda, pegar un
  // log npm (que dice «npm run build» y «Command failed» por naturaleza)
  // secuestraba el turno y devolvía un rechazo del puente: «se tranca con un
  // log y no contesta».
  if (pareceContenidoPegado(p)) return null;

  // Ejecutar comando
  if (/\b(ejecut|corr|run|lleva)\w*/i.test(p) && /\b(comando|orden|instrucci[oó]n|script)\b/i.test(p)) {
    const command = extractCommand(p);
    if (command) return { intent: "exec", command };
    // v1.23.0 — sin comando extraíble, la frase era prosa: que hable el modelo,
    // no el puente. (Antes caía igual al ejecutor con un comando basura.)
    return null;
  }

  const folder = extractFolder(p);
  const filename = extractFilename(p);

  // v1.23.0 — GUARDA DE LA RUTA REAL (captura: «No existe: Desktop\validar.mjs»
  // cuando el usuario pedía el validar.mjs DEL PROYECTO): leer/listar/borrar
  // contra la PC solo se cortocircuita cuando el pedido NOMBRA una carpeta de
  // la PC (Escritorio/Documentos/Descargas), una ruta absoluta o «~». Sin eso,
  // «leer validar.mjs» es una petición del sandbox → el modelo decide. El
  // default «Desktop/» del extractor era una adivinanza que escribía en la PC.
  const mencionaCarpetaPc = /(^|[\s"'«(])(desktop|escritorio|documents?|documentos|downloads?|descargas|onedrive|~[\\/]?)/i.test(p)
    || /(?:[A-Za-z]:\\|\\\\|\/home\/|\/Users\/|\/tmp\/|\/var\/)/.test(p);

  // Borrar
  if (/\b(borr|elimina|eliminar|borra|delete|quitar|suprime)\b/i.test(p) && /archivo|archivos|carpeta|folder|documento|\.\w{1,10}/i.test(p)) {
    if (filename && mencionaCarpetaPc) return { intent: "delete", path: folder + filename };
    if (filename) return null; // «borrar el archivo viejo» no es una orden para el puente
  }

  // Leer
  if (/\b(le|lee|leer|muest|mostr|copia|print)\b/i.test(p) && /archivo|contenido|texto|de\s+/i.test(p)) {
    if (filename && mencionaCarpetaPc) return { intent: "read", path: folder + filename };
    if (filename) return null;
  }

  // Listar
  if (/\b(lista|listar|list|mostr|mostrar|contenid|qu[eé] hay|ver|explora)\b/i.test(p) && /archivos|carpeta|contenido|folder|directorio|lista/i.test(p)) {
    if (mencionaCarpetaPc) return { intent: "list", path: folder };
    return null;
  }

  // Crear (prioridad alta: "crear/make/un archivo")
  if (/\b(crea|crear|crea(r)?|genera|generar|haz|hacer|escribi|escribir|guarda|guardar|new|make|write)\b/i.test(p) && /archivo|texto|documento|note|nota|\.txt|\.md|\.py|\.js|\.ts|\.json/i.test(p)) {
    const content =
      extractQuoted(p) ??
      (p.match(/(?:con (?:el |la )?(?:texto|contenido)|que dice|dice|con contenido)\s+(.+)/is)?.[1]?.trim() || "");
    if (filename && (mencionaCarpetaPc || /con (?:el |la )?(?:texto|contenido)|que dice|dice/i.test(p))) {
      return { intent: "write", path: folder + filename, content };
    }
    if (filename) return null; // «creá un archivo utils.ts» → obra del sandbox, no del puente
  }

  return null;
}

```

### server/respaldoNube.ts (116 líneas)

```ts
/**
 * respaldoNube.ts — v1.0.16 · FAILOVER ENTRE NUBES GRATIS INESTABLES
 * ==================================================================
 * Mario: «clouds gratis inestables». Los proveedores gratuitos (Z.ai, Groq,
 * OpenRouter, Cerebras, Together, DeepSeek, Mistral, Fireworks) tiran 429 de
 * cuota, 5xx de capacidad o cortan la conexión sin aviso. Cuando el elegido está
 * caído, no tiene sentido insistir contra la pared: se rota al primero que SÍ
 * tenga clave y no esté enfriado por un fallo reciente.
 *
 * LÓGICA PURA, sin `os`, sin red, sin estado global: recibe los hechos (qué
 * claves hay, qué proveedores están enfriados, qué hora es) y devuelve la cadena
 * de intentos o el mapa de enfriamiento nuevo. El estado (ENFRIADOS_NUBE) y las
 * llamadas viven en server.ts; así esto se prueba aislado
 * (tests/respaldoNube.test.ts) y no toca el monolito.
 *
 * NO incluye gemini/openai/custom: esas son claves PROPIAS del usuario (de pago
 * o proxy local), no el pool gratuito preconfigurado — rotarlas sin permiso sería
 * gastarle plata o cambiarle el backend a sus espaldas.
 */

export type ProveedorNube =
  | "zai" | "groq" | "openrouter" | "cerebras"
  | "together" | "deepseek" | "mistral" | "fireworks";

/** Orden de preferencia del pool gratuito (el más estable/rápido primero). */
export const PREFERENCIA_NUBE_GRATIS: ProveedorNube[] = [
  "zai", "groq", "openrouter", "cerebras", "together", "deepseek", "mistral", "fireworks",
];

/** Enfriamiento por defecto tras un fallo de proveedor (1 minuto). */
export const ENFRIAMIENTO_MS = 60_000;

/**
 * ¿El fallo es DEL PROVEEDOR (transitorio, vale rotar) y no del pedido? Sí para
 * 408/425/429/5xx y para los mensajes típicos de cuota/capacidad/red/timeout.
 * NO para 400/401/403/404 — eso es clave mala o modelo inexistente: rotar no
 * arregla nada y el usuario tiene que verlo.
 */
export function esFalloDeProveedor(status: number | null | undefined, mensaje?: string): boolean {
  const s = Number(status) || 0;
  if ([408, 425, 429, 500, 502, 503, 504].includes(s)) return true;
  if (s >= 400 && s < 500) return false; // 400/401/403/404… culpa del pedido, no del proveedor
  const m = String(mensaje || "").toLowerCase();
  return /rate.?limit|too many requests|\b429\b|quota|exceeded|resource_exhausted|timeout|timed out|fetch failed|econnreset|econnrefused|etimedout|socket hang up|network|unavailable|overloaded|capacity|temporar/.test(m);
}

/**
 * Cadena de intentos: el proveedor ACTUAL primero (si está vivo), luego el resto
 * del pool que tenga clave y no esté enfriado, en orden de preferencia. «Vivo» =
 * tiene clave Y su enfriamiento ya venció. Si NINGUNO está vivo, devuelve igual
 * el actual para que intente y falle con un mensaje claro (nunca cadena vacía).
 */
export function cadenaDeRespaldo(
  actual: ProveedorNube,
  clavesDisponibles: Partial<Record<ProveedorNube, boolean>>,
  enfriados: Partial<Record<ProveedorNube, number>> = {},
  ahora: number = Date.now(),
  preferencia: ProveedorNube[] = PREFERENCIA_NUBE_GRATIS,
): ProveedorNube[] {
  const vivo = (p: ProveedorNube): boolean =>
    !!clavesDisponibles[p] && !((enfriados[p] ?? 0) > ahora);
  const orden: ProveedorNube[] = [];
  if (vivo(actual)) orden.push(actual);
  for (const p of preferencia) {
    if (p !== actual && vivo(p) && !orden.includes(p)) orden.push(p);
  }
  if (orden.length === 0) orden.push(actual);
  return orden;
}

/**
 * Marca un proveedor como enfriado hasta `ahora + ms`. NO muta el mapa de
 * entrada: devuelve uno nuevo (el llamador reasigna su estado).
 */
export function enfriarProveedor(
  enfriados: Partial<Record<ProveedorNube, number>>,
  proveedor: ProveedorNube,
  ahora: number = Date.now(),
  ms: number = ENFRIAMIENTO_MS,
): Partial<Record<ProveedorNube, number>> {
  return { ...enfriados, [proveedor]: ahora + Math.max(1000, ms) };
}

/** Pool gratuito preconfigurado sobre el que SÍ rotamos (gemini/openai = claves
 * de pago del usuario; custom = proxy local: no se rotan sin permiso). */
export const PROVEEDORES_RESPALDO_NUBE = new Set<string>(PREFERENCIA_NUBE_GRATIS);

export interface DecisionFailover {
  /** Proveedor con el que seguir el turno (el mismo si no hubo rotación). */
  provider: ProveedorNube;
  /** true si se rotó a otro proveedor del pool. */
  cambio: boolean;
  /** "enfriado por un fallo reciente" | "sin clave configurada" | "" (si no hubo cambio). */
  motivo: string;
}

/**
 * v1.0.16 · Decide el failover en UN paso (envoltorio de cadenaDeRespaldo): si el
 * proveedor actual no tiene clave o quedó enfriado, devuelve el primero del pool
 * con clave y sin enfriar. El llamador, si `cambio`, pone modeloBaseTurno="" para
 * que resolverModeloEfectivo caiga en el modelo por defecto del nuevo proveedor.
 */
export function resolverFailoverNube(
  actual: ProveedorNube,
  clavesDisponibles: Partial<Record<ProveedorNube, boolean>>,
  enfriados: Partial<Record<ProveedorNube, number>> = {},
  ahora: number = Date.now(),
): DecisionFailover {
  const elegido = cadenaDeRespaldo(actual, clavesDisponibles, enfriados, ahora)[0];
  if (elegido && elegido !== actual) {
    const motivo = clavesDisponibles[actual] ? "enfriado por un fallo reciente" : "sin clave configurada";
    return { provider: elegido, cambio: true, motivo };
  }
  return { provider: actual, cambio: false, motivo: "" };
}

```

### server/routers/autoLlamado.ts (163 líneas)

```ts
/**
 * autoLlamado.ts — EL TRANSPORTE DEL LAZO (v2.3.8 · frente 3, segunda mitad)
 * =========================================================================
 * `src/engine/autoLlamado.ts` tenía el criterio (las tres fronteras: voluntad,
 * costo, estancamiento) y desde v2.3.4 el libro (contador por conversación,
 * huellas, interruptor, presupuesto). Lo único que faltaba para que el "seguí"
 * exista era **quién lo consulta**: medido, cero llamantes en todo el árbol.
 *
 * Este archivo es ese cable, y lo es con la menor superficie posible:
 *
 *   · el navegador NO manda el plan ni el parte — manda `"cerró el turno N de la
 *     conversación X"`. Todo lo demás se lee acá, del disco de datos. Repartir la
 *     fuente de "todavía hay trabajo" entre el cliente y el server es la receta
 *     para que el lazo crea una cosa y el panel otra;
 *   · el estado vive en `<raízDatos>/.cerebronico/autoLlamado.json`, que es el
 *     asiento derecho del hemisferio (memoria, no instalación): si el usuario
 *     mueve la raíz, el lazo se mueve con ella;
 *   · la voluntad se respeta en los dos sentidos: apagado = callar y decirlo;
 *     prendido = a lo sumo `TOPE_AUTO_LLAMADOS` re-entradas y ni una mas;
 *   · el lazo NUNCA puede tumbar el turno: todo request responde, incluso cuando
 *     el disco está ilegible (ahí se Calla, que es el estado seguro).
 *
 * Las rutas se exportan como `RUTAS_AUTO_LLAMADO` por la misma razón que las de
 * telemetría: para que la valla pueda batirlas contra el archivo real.
 */
import fs from "node:fs";
import path from "node:path";
import type express from "express";
import type { Request, Response } from "express";
import {
  decidirAutoLlamado,
  registrarCierre,
  cancelarCola,
  setInterruptor,
  estadoInicial,
  desdeDisco,
  paraDisco,
  resumen,
  cuentaDe,
  presupuestoAgotado,
  TOPE_AUTO_LLAMADOS,
  type EstadoCola,
} from "../../src/engine/autoLlamado";

/** Las cuatro rutas de la casa del lazo (la valla bate contra esta lista). */
export const RUTAS_AUTO_LLAMADO = [
  "GET /api/autoLlamado",
  "POST /api/autoLlamado",
  "POST /api/autoLlamado/cierre",
  "POST /api/autoLlamado/cancelar",
] as const;

/** Dónde vive el libro. Un solo dueño de la ruta: este archivo. */
export const RUTA_LIBRO = (raizDatos: string) => path.join(raizDatos, ".cerebronico", "autoLlamado.json");

/** Dónde está el parte del turno. Es el asiento derecho, no la instalación. */
export const RUTA_REANUDAR = (raizDatos: string) => path.join(raizDatos, "REANUDAR.md");

export interface DepsAutoLlamado {
  raizDatos: string;
  consola?: { warn: (m: string) => void; log?: (m: string) => void };
  ahora?: () => number;
}

export function registrarAutoLlamado(app: express.Express, deps: DepsAutoLlamado): void {
  const ahora = deps.ahora || (() => Date.now());
  const ruta = RUTA_LIBRO(deps.raizDatos);
  let estado: EstadoCola = estadoInicial();

  const cargar = () => {
    try {
      if (fs.existsSync(ruta)) estado = desdeDisco(fs.readFileSync(ruta, "utf-8"));
    } catch (e: any) {
      // Ilegible no es "apagado" ni "prendido": es "no sé", y sin saber se calla.
      estado = estadoInicial();
      deps.consola?.warn(`[autoLlamado] no pude leer el libro (${e?.message || e}): el lazo queda apagado.`);
    }
  };
  const guardar = () => {
    try {
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      fs.writeFileSync(ruta, paraDisco(estado), "utf-8");
    } catch (e: any) {
      deps.consola?.warn(`[autoLlamado] no pude escribir el libro: ${e?.message || e}`);
    }
  };
  cargar();

  const textoReanudar = (): string => {
    try {
      const r = RUTA_REANUDAR(deps.raizDatos);
      return fs.existsSync(r) ? fs.readFileSync(r, "utf-8") : "";
    } catch {
      return "";
    }
  };

  app.get("/api/autoLlamado", (_q: Request, res: Response) => {
    res.json({
      ok: true,
      activado: estado.activado,
      tope: estado.tope,
      presupuestoMs: estado.presupuestoMs,
      conversaciones: resumen(estado),
      nota: estado.activado
        ? "prendido: el lazo puede re-entrar hasta el tope por conversacion"
        : "apagado por omision: nadie enciende un lazo que quema credito del modelo",
    });
  });

  app.post("/api/autoLlamado", (req: Request, res: Response) => {
    const cuerpo: any = req.body || {};
    estado = setInterruptor(estado, cuerpo.activado === true, ahora());
    guardar();
    res.json({ ok: true, activado: estado.activado, tope: TOPE_AUTO_LLAMADOS });
  });

  app.post("/api/autoLlamado/cierre", (req: Request, res: Response) => {
    const cuerpo: any = req.body || {};
    const conversacion = String(cuerpo.conversacion || "global");
    const cuenta = cuentaDe(estado, conversacion);
    if (presupuestoAgotado(estado, conversacion, ahora())) {
      res.json({
        ok: true,
        accion: "callar",
        mensaje: null,
        restantes: 0,
        motivo: "se agoto el presupuesto de tiempo de la corrida: el lazo se rinde con causa",
      });
      return;
    }
    const decision = decidirAutoLlamado({
      activado: estado.activado,
      // El navegador no manda el plan: la fuente de "todavia hay trabajo" es el
      // parte del turno, que vive en el asiento derecho. Un solo dueno.
      plan: [],
      llamadosHechos: cuenta?.llamados || 0,
      sellosPrevios: cuenta?.sellos || [],
      turnoFallo: cuerpo.turnoFallo === true,
      conclusion: String(cuerpo.conclusion || ""),
      reanudar: textoReanudar(),
    });
    estado = registrarCierre(estado, conversacion, decision, ahora());
    guardar();
    res.json({
      ok: true,
      accion: decision.accion,
      mensaje: decision.mensaje,
      motivo: decision.motivo,
      restantes: decision.restantes,
      origen: decision.origen,
      llamados: cuentaDe(estado, conversacion)?.llamados || 0,
    });
  });

  app.post("/api/autoLlamado/cancelar", (req: Request, res: Response) => {
    const cuerpo: any = req.body || {};
    estado = cancelarCola(estado, String(cuerpo.conversacion || "global"), ahora());
    guardar();
    res.json({ ok: true, conversaciones: resumen(estado) });
  });
}

```

### server/routers/automejora.ts (123 líneas)

```ts
/**
 * server/routers/automejora.ts — v1.93.0 · LA POLÍTICA DE AUTOEMEJORA, EN RUTAS
 * =============================================================================
 * Las cuatro preguntas que cualquier lazo de autoemejora tiene que poder hacerle a
 * la política ANTES de tocar nada: qué existe, qué me toca confirmar, si estoy
 * autorizado y si el parche se adopta o se revierte.
 *
 * NINGUNA ruta de este archivo ejecuta un comando. DECIDEN y EXPLICAN. El que
 * ejecuta sigue siendo `run_command`/`write_file` del monolito; este router es la
 * aduana que ese lazo tiene que consultar, y si una mutación del cuerpo ocurre sin
 * pasar por acá, el registro de decisiones lo va a contar.
 *
 * POR QUÉ FUERA DEL MONOLITO: `contrato-rutas.json` fija el presupuesto de
 * `server.ts` en 12 172 líneas y `techoContexto` lo vigila. La precedentede la casa
 * (v1.62.0, `geminiTts`) es EXTRAER un bloque cohesivo cuando el contador pasa del
 * techo, no subir el número. Mismo patrón acá: el dominio sale y `sandboxAuthorized`
 * se inyecta, que es lo único que necesita del estado del monolito.
 *
 * La autenticación de las dos rutas mutantes es la MISMA aduana de las 11 puertas
 * del sandbox y de `/api/quirofano/*` (v1.6.32): lo que abre una puerta de escritura
 * se autoriza igual que lo que escribe.
 */
import type { Request, Response, Application } from "express";
import {
  VERSION_AUTOMEJORA,
  COMANDOS_DE_AUTOMEJORA,
  autorizacionDe,
  presupuestoDeParche,
  decidirAdopcion,
  leerPruebaDePuerta,
  inventarioDeAutomejora,
  preguntaDeConfirmacion,
  comandoDeAutomejora,
  type OrigenOrden,
} from "../../src/engine/automejora";

const ORIGENES: readonly string[] = ["usuario", "modelo", "herramienta", "archivo"];
const VEREDICTOS_QUIROFANO = ["seguro", "revisar", "peligroso"] as const;

export interface RutasAutomejora {
  /** La aduana del monolito (`sandboxAuthorized`). Se inyecta: el router no conoce
   *  ni sesiones ni tokens, así que no puede aflojarla por su cuenta. */
  autorizada: (req: Request) => boolean;
}

export function registrarAutomejora(app: Application, deps: RutasAutomejora): void {
  const { autorizada } = deps;

  /** Inventario completo, con el comando LITERAL a la vista. Una lista de
   *  capacidades que no muestra QUÉ corre no es transparencia, es marketing. */
  app.get("/api/automejora", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      version: VERSION_AUTOMEJORA,
      inventario: inventarioDeAutomejora(),
      comandos: COMANDOS_DE_AUTOMEJORA.map((c) => ({
        id: c.id,
        nivel: c.nivel,
        titulo: c.titulo,
        comando: c.comando,
        paraQue: c.paraQue,
        reversible: c.reversible,
        requiere: c.requiere,
      })),
    });
  });

  /** La pregunta que ve la persona: comando, para qué, reversible y el token
   *  exacto que hay que escribir. Nada poético, nada que haya que adivinar. */
  app.post("/api/automejora/pregunta", (req: Request, res: Response) => {
    const id = String(req.body?.id ?? "");
    if (!comandoDeAutomejora(id)) {
      return res.status(400).json({ ok: false, error: `comando desconocido: «${id}». La lista de automejora es cerrada.` });
    }
    res.json({ ok: true, pregunta: preguntaDeConfirmacion(id) });
  });

  /** ¿Se puede hacer? Depende del NIVEL del comando y del ORIGEN de la orden.
   *  Un origen que no está en la lista corta en `archivo` (el más desconfiado):
   *  fallar cerrado es la única alternativa a inventarse un origen amable. */
  app.post("/api/automejora/autorizar", (req: Request, res: Response) => {
    if (!autorizada(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const crudoOrigen = String(req.body?.origen ?? "usuario");
    const origen = (ORIGENES.includes(crudoOrigen) ? crudoOrigen : "archivo") as OrigenOrden;
    const archivos = Array.isArray(req.body?.archivos) ? req.body.archivos.map((r: any) => String(r)) : [];
    const presupuesto =
      archivos.length || req.body?.lineasNetas !== undefined
        ? presupuestoDeParche(archivos, Number(req.body?.lineasNetas ?? 0))
        : null;
    const r = autorizacionDe({
      id: String(req.body?.id ?? ""),
      origen,
      tokenUsuarioConfirmado: (req.body?.token ?? null) as string | null,
      presupuesto,
    });
    return res.json({ ok: r.permite, ...r });
  });

  /** ¿Se adopta el parche o se revierte? Recibe el log RAW de `npm run validar` y
   *  el VEREDICTO se lee ACÁ, en el servidor: no lo jura quien quiere adoptar.
   *  Esa lectura es toda la defensa contra el riesgo 1 (degradación). */
  app.post("/api/automejora/puerta", (req: Request, res: Response) => {
    if (!autorizada(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const prueba = leerPruebaDePuerta(String(req.body?.log ?? ""), Boolean(req.body?.tscOk));
    const q = req.body?.quirofano as { veredicto?: unknown; motivos?: unknown } | undefined;
    // El veredicto solo se acepta en sus TRES palabras. Un payload que dijera
    // `veredicto: "cualquiera"` se trata como «no pasó por el quirófano»
    // (bloqueante nombrado), nunca como «seguro».
    const veredictoQf =
      q && typeof q === "object" && (VEREDICTOS_QUIROFANO as readonly string[]).includes(String(q.veredicto))
        ? (String(q.veredicto) as (typeof VEREDICTOS_QUIROFANO)[number])
        : null;
    const decision = decidirAdopcion({
      prueba,
      quirofano: veredictoQf
        ? { veredicto: veredictoQf, motivos: Array.isArray(q?.motivos) ? q!.motivos.map(String) : [] }
        : null,
      reversible: Boolean(req.body?.reversible),
    });
    res.json({ ok: decision.accion === "adoptar", decision, prueba });
  });
}

```

### server/routers/brain.ts (818 líneas)

```ts
/**
 * brain.ts — ROUTER DEL CEREBRO (Fase 2 · extracción v1.48.1)
 * ============================================================================
 * QUÉ ES: las rutas de solo lectura del cerebro (`/api/brain`, estado, decisiones,
 * lecciones, scan, historial, rollback, compact, prompt) y TODO el CEREBRO DE
 * TAREAS (presupuesto, runner, escalado, tramos y planes). Se mueven tal cual
 * estaban: misma superficie, mismos guards, mismo comportamiento.
 * POR QUÉ: el trinquete de la Fase 2 exige que `server.ts` baje de 11.800 líneas.
 * QUÉ SE QUEDA EN EL MONOLITO: `escribirImagenEnProyecto` — la ÚNICA autoridad
 * para escribir un binario en el proyecto — porque la comparte el endpoint
 * directo `/api/engine/imagen`. Se INYECTA aquí para no duplicarla (dos fuentes
 * de verdad acabarían discrepando). El resto de dependencias de estado
 * (credenciales de nube, runner Ollama, rutas seguras) también entran por `deps`.
 */
import type express from "express";
import type { Request, Response } from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PlanRunner } from "../../src/engine/planRunner";
import { GestorPlanes, crearAlmacenFs } from "../../src/engine/taskStoreFs";
import { crearEjecutorDePlanes } from "../../src/engine/planExecutors";
import type { EstadoSandboxCrudo } from "../../src/engine/estadoSandbox";
import { narrarDesdeAviso } from "../../src/engine/coreo";
import { generarImagen } from "../../src/engine/imageGen";
import { ejecutarEntidad, pensarConsejo } from "../../src/engine/reflejo/consejo";
import { TABLAS } from "../../src/engine/reflejo";
import { planificadorPorLeyes } from "../../src/engine/reflejo/orquestador";
import { validarPlan, resumenPlan, lineaEstadoTarea, type Plan } from "../../src/engine/taskPlanner";
import { fijarRuta, recorrerRuta, registrarProceso, resumenRuta, type ManualPerfeccion } from "../../src/engine/manualPerfeccion";
import { cargarDesdeDisco, guardarManual } from "../../src/engine/manualPerfeccionDisco";
import {
  resolverPresupuesto,
  siguienteEscalado,
  ESCALADOS,
  PERFILES_MR,
  ORDEN_MR,
  etiquetaEscalado,
  type MRId,
} from "../../src/engine/memoriaResiliente";
import { Brain } from "../../src/engine/brain";
import { hojaVivaParaPanel } from "../../src/engine/espejoVivo";

export interface DepsBrain {
  /** Instancia viva del cerebro (gobernanza: cerebro.md + memoria.md). */
  brain: Brain;
  /** Guard de las rutas mutantes: loopback o token (misma puerta que el resto). */
  sandboxAuthorized: (req: Request) => boolean;
  /** RAM de la máquina en GB, como la calculó el arranque. */
  RAM_GB: number;
  /**
   * v1.82.0 · FASE 3 punto 1: espejo de la capacidad `parallel_workers` del
   * panel. Opcional: sin ella el runner usa la base del perfil (comportamiento
   * histórico), nunca un valor adivinado.
   */
  paralelismoActivo?: () => boolean;
  /** Núcleos de CPU, como los calculó el arranque. */
  CPU_CORES: number;
  /** Raíz del proyecto (C:\Cerebronico). */
  PROJECT_ROOT: string;
  /** URL base de Ollama (la misma que usa el resto del servidor). */
  OLLAMA_DEFAULT: string;
  /** La ÚNICA autoridad para escribir una imagen en el proyecto (vive en el monolito). */
  escribirImagenEnProyecto: (rutaRel: string, data: Uint8Array) => string;
  /** Envía el binario a la bóveda indexada si el puente responde. */
  transportarABoveda: (opts: any) => Promise<any>;
  /** Nombre del proyecto activo en el sandbox. */
  nombreProyectoSandbox: () => string;
  /** ¿El modelo parece de Ollama local ("nombre:tag")? */
  pareceModeloOllamaPlan: (modelo: string) => boolean;
  /** Llamada no-stream a Ollama. */
  callOllamaNonStreaming: (...args: any[]) => Promise<any>;
  /** Proveedor de nube a partir del nombre del modelo. */
  proveedorDesdeModeloPlan: (modelo: string) => string;
  /** Clave API configurada para un proveedor. */
  clavePorProveedorPlan: (prov: string) => string | undefined;
  /** Modelo de nube por defecto de un proveedor. */
  modeloNubePorDefecto: (prov: string) => string;
  /** Petición no-stream a un modelo de nube. */
  pedirAModeloNubePlan: (opts: any) => Promise<string>;
  /** Resuelve una ruta relativa a una absoluta dentro del proyecto (anti-escape). */
  resolveSafePath: (relPath: string) => string;
  /** Fija las credenciales de nube reenviadas por el navegador. */
  fijarCredencialesNubePlan: (c: any) => void;
  /** Getter de las credenciales de nube vivas (var reasignable en el monolito). */
  credsNubePlan: () => { provider?: string } & Record<string, any>;
  /**
   * FASE 4 (v1.57.3) — Estado CRUDO del sandbox :3500 para la herramienta
   * `estado_sandbox`. Lo inyecta el monolito (es quien conoce el puerto, el
   * proceso y la raíz resuelta). Opcional: sin él, la tarea `estado_sandbox` se
   * declara NO DISPONIBLE en vez de inventar que la app corre.
   */
  estadoSandboxCrudo?: () => Promise<EstadoSandboxCrudo>;
}

/**
 * Registra las rutas del cerebro y del cerebro de tareas sobre `app`.
 * SE MUEVE, NO SE MEJORA: los cuerpos son los que vivían en el monolito.
 */
export function registrarBrain(app: express.Express, deps: DepsBrain) {
  const {
    brain,
    sandboxAuthorized,
    RAM_GB,
    CPU_CORES,
    PROJECT_ROOT,
    OLLAMA_DEFAULT,
    escribirImagenEnProyecto,
    transportarABoveda,
    nombreProyectoSandbox,
    pareceModeloOllamaPlan,
    callOllamaNonStreaming,
    proveedorDesdeModeloPlan,
    clavePorProveedorPlan,
    modeloNubePorDefecto,
    pedirAModeloNubePlan,
    resolveSafePath,
    fijarCredencialesNubePlan,
  } = deps;

  // ════════════════════════════════════════════════════════════════════════
  // CEREBRO DE TAREAS (v2.2) — lista de tareas, dependencias y paralelismo
  // ════════════════════════════════════════════════════════════════════════
  // El plan corre EN SEGUNDO PLANO: estos endpoints devuelven al instante y el
  // panel consulta el avance. Nada bloquea el chat.
  //
  // Los servicios se crean la PRIMERA vez que se usan, no al cargar el módulo:
  // así un problema de disco en `.cerebro-db` no impide arrancar el servidor.

  /** Modelo para las tareas de tipo "modelo" si el plan no dice otro.
   *  v1.46.6 — POR DEFECTO EN LA NUBE. Antes era `qwen2.5-coder:1.5b` (Ollama
   *  local), que en la PC de Mario la congela: el plan fallaba siempre y el
   *  cortacircuito "ollama" bloqueaba las 5 tareas. Ahora el plan usa el
   *  gratuito preconfigurado (GLM-4.5-Flash de Z.ai) y cae a Gemini si hace
   *  falta. `CN_PLAN_MODEL` sigue mandando si alguien quiere forzar otro. */
  const MODELO_PLAN_POR_DEFECTO = process.env.CN_PLAN_MODEL || "glm-4.5-flash";

  let runnerPlanes: PlanRunner | null = null;

  // ── EL MANUAL DE LA PERFECCIÓN (v1.79.0) ─────────────────────────────────
  // `perfeccion.md` / `perfeccion.json` en la raíz del proyecto: la cara a
  // disco del estado puro (src/engine/manualPerfeccion.ts). Se carga perezoso
  // la primera vez que el bucle lo toca — igual que el resto de servicios de
  // esta casa: un problema de disco no impide arrancar el servidor.
  let manualPerf: ManualPerfeccion | null = null;
  const versionApp = (): string => {
    try {
      return String(JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")).version);
    } catch {
      return "desconocida";
    }
  };
  const manualPerfLazo = (): ManualPerfeccion => {
    if (!manualPerf) manualPerf = cargarDesdeDisco(PROJECT_ROOT);
    return manualPerf;
  };
  const guardarManualPerf = (): void => {
    try {
      guardarManual(PROJECT_ROOT, manualPerfLazo(), versionApp());
    } catch (e: any) {
      console.warn(`[perfeccion] no se pudo guardar el manual: ${e?.message ?? e}`);
    }
  };

  /** Medición de la máquina, del mismo origen que usa el gobernador. */
  const medirMaquina = () => ({
    ramMedidaGB: RAM_GB,
    ramLibreGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
    nucleos: CPU_CORES,
  });

  /** Estado del reparto AHORA, con el motivo de cada número. */
  const presupuestoActual = (perfilForzado?: MRId) => {
    const p = resolverPresupuesto({ ...medirMaquina(), perfilForzado, escalado: runnerPlanes?.escaladoActual() ?? 1 });
    return {
      tramo: p.perfil.id,
      tramoNombre: p.perfil.nombre,
      ramDelTramoGB: p.perfil.ramGB,
      escalado: p.escalado,
      etiqueta: etiquetaEscalado(p.escalado),
      io: p.io,
      cpu: p.cpu,
      contextoPorTarea: p.contextoPorTarea,
      degradado: p.degradado,
      motivo: p.motivo,
    };
  };


  function obtenerRunner(): PlanRunner {
    if (runnerPlanes) return runnerPlanes;
    const dirDb = path.join(PROJECT_ROOT, ".cerebro-db");

    const gestor = new GestorPlanes(crearAlmacenFs(dirDb), {
      onAviso: (l) => narrarDesdeAviso(l), // COREO v1: consola + bus visual
    });
    const carga = gestor.cargar();
    console.log(
      `[Cerebro] Planes en disco: ${gestor.lista().length}` +
        (carga.interrumpidos.length ? ` · pausados por el reinicio: ${carga.interrumpidos.join(", ")}` : "") +
        (carga.avisos.length ? ` · avisos: ${carga.avisos.length}` : "")
    );

    const ejecutar = crearEjecutorDePlanes({
      modeloPorDefecto: MODELO_PLAN_POR_DEFECTO,
      onAviso: (l) => narrarDesdeAviso(l), // COREO v1: consola + bus visual

      // v2.3 — Cadena de imágenes gratuitas. La validación de prompt/dimensiones
      // la hace el ejecutor con el MISMO código que usa el endpoint
      // /api/engine/imagen; aquí solo se inyectan las claves de esta máquina.
      // BÓVEDA/IMAGEN v5: `intentos: 2` — el reintento corto (2.5 s) dentro de
      // la tarea, antes del drenaje de cola de 45 s del planificador. La
      // congestión del gratuito se va sola al segundo golpe (medido).
      generarImagen: ({ prompt, ancho, alto, modelo, seed, senal, intentos }) =>
        generarImagen({
          prompt,
          ancho,
          alto,
          modelo,
          seed,
          senal,
          intentos: intentos ?? 2,
          tokenPollinations: process.env.POLLINATIONS_API_KEY?.trim() || undefined,
          keyGemini: process.env.GEMINI_API_KEY?.trim() || undefined,
        }),

      // La escritura binaria tiene UNA sola autoridad (ver arriba): la orden
      // del chat ya auditó la ruta, y esto es la segunda comprobación, la misma
      // que usa el endpoint directo. BÓVEDA v1: después de guardar en el
      // sandbox, la imagen VIAJA al disco real indexado si el puente responde.
      guardarBinario: async (rutaRel, data, mime) => {
        const ruta = escribirImagenEnProyecto(rutaRel, data);
        try {
          const linea = await transportarABoveda({
            bytes: data,
            mime: String(mime || "image/jpeg"),
            proyecto: nombreProyectoSandbox(),
            archivo: String(rutaRel).split(/[\\/]/).pop() || "imagen",
            origenSandbox: ruta,
          });
          if (linea) narrarDesdeAviso(linea);
        } catch {}
        return ruta;
      },

      // v2.5 AGÉNTICO — las 40 entidades del consejo como primitivas del motor.
      // El planificador las despacha con su presupuesto normal; una herramienta
      // tarda microsegundos, así que cuarenta en paralelo no mueven el semáforo.
      entidad: async (id, datos) => ejecutarEntidad(id, datos),
      reflejar: async (frase) => pensarConsejo(frase, TABLAS.max),
      // GRUPO v1 (Reflejo v5): una tarea `reflejo` que trae solo frase se
      // enruta por LEY (determinista, ~1 ms) cuando el votante neural no
      // está o no decide. El orquestador responde con espejo + datos +
      // confianza; si tiene dudas, lo dice y el planificador reintenta por
      // otro carril en vez de callar.
      orquestar: async (frase) => planificadorPorLeyes(frase),

      // FASE 4 (v1.57.3) — El modelo «ve» el :3500. Solo lectura: la primitiva
      // la inyecta el monolito (conoce puerto/proceso/raíz). Si no viene, la
      // tarea `estado_sandbox` falla honestamente en vez de fingir.
      estadoSandbox: deps.estadoSandboxCrudo,

      pedirModelo: async ({ prompt, modelo, contexto, senal }) => {
        const modeloFinal = modelo || MODELO_PLAN_POR_DEFECTO;
        const mensajes: any[] = [];
        if (contexto) mensajes.push({ role: "system", content: contexto });
        mensajes.push({ role: "user", content: prompt });

        // v1.46.6 — EL PLAN VA A LA NUBE POR DEFECTO. Antes SIEMPRE llamaba a
        // Ollama local (congela la PC de Mario) y el plan fallaba entero. Ahora:
        //  1) Si el modelo pedido es de Ollama ("nombre:tag") Y Ollama responde,
        //     se usa Ollama (compatibilidad para quien sí lo tenga).
        //  2) En cualquier otro caso —y como respaldo si Ollama no está— se usa
        //     la nube: proveedor del modelo → proveedor elegido en el panel →
        //     Z.ai (GLM gratis) → Gemini. El primero que tenga clave y responda.
        const esOllama = pareceModeloOllamaPlan(modeloFinal);

        if (esOllama) {
          try {
            const url = (process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "");
            const r = await callOllamaNonStreaming(url, modeloFinal, mensajes, 0.2, () => senal.aborted, []);
            const texto = String(r?.message?.content ?? r?.response ?? "");
            if (texto.trim()) return texto;
          } catch { /* Ollama no está / se negó: caemos a la nube abajo. */ }
        }

        // Camino de nube. Orden de candidatos sin repetir.
        const provPanel = (deps.credsNubePlan().provider || "").trim().toLowerCase();
        const provModelo = esOllama ? "" : proveedorDesdeModeloPlan(modeloFinal);
        // v1.58.4 — El proveedor ELEGIDO en el panel manda sobre la deducción por
        //   nombre. Antes `provModelo` (adivinado del id) iba primero, y para
        //   Cerebras/Together/Fireworks ese adivine es incorrecto (p. ej.
        //   "llama3.1-8b" de Cerebras se leía como Groq, y "qwen-coder" caía a Z.ai),
        //   así que el modelo que Mario elegía NUNCA se usaba: se mandaba el default
        //   de otro proveedor. Ahora el provider del panel va primero y, para él,
        //   se respeta el modelo tal cual fue elegido.
        const candidatos = Array.from(new Set(
          [provPanel, provModelo, "zai", "gemini"].filter((p) => p && p !== "ollama" && p !== "custom")
        ));

        const errores: string[] = [];
        for (const prov of candidatos) {
          const key = clavePorProveedorPlan(prov);
          if (!key) { errores.push(`${prov}: sin clave`); continue; }
          // Se respeta el modelo ELEGIDO cuando este `prov` es el del panel
          //   (elección explícita del usuario) O cuando la deducción por nombre
          //   coincide. En cualquier otro caso, el modelo por defecto del proveedor.
          const mdl = (!esOllama && (prov === provPanel || provModelo === prov))
            ? modeloFinal
            : modeloNubePorDefecto(prov);
          try {
            if (senal.aborted) throw new Error("tarea cancelada");
            return await pedirAModeloNubePlan({ provider: prov, modelo: mdl, apiKey: key, mensajes, temperatura: 0.2 });
          } catch (e: any) {
            errores.push(`${prov}: ${e?.message || e}`);
          }
        }
        // v1.56.8 — EL ATASCO EMPIEZA AQUÍ. Sin ninguna clave, `errores` queda en
        // ["zai: sin clave", "gemini: sin clave"] y se lanzaba un Error normal.
        // `classifyError` no lo reconoce → cae en «desconocido = retryable» →
        // `recordFailure` ABRE el cortacircuito "modelo-nube" (3 tareas × 1 fallo)
        // → todas las demás quedan `bloqueada` y el tablero dice «Atascado» para
        // siempre. Reintentar una clave que no está puesta no cambia nada: es un
        // error de CONFIGURACIÓN, y `resilience` ya tiene canal para decirlo.
        // Se marca `noReintentar` SOLO cuando ningún proveedor tenía clave o todos
        // fallaron por eso: un 429 real sigue siendo reintentable como siempre.
        const soloFaltaClave =
          errores.length === 0 || errores.every((e) => /\bsin clave\b/.test(e));
        const err = new Error(
          `No se pudo ejecutar la tarea de modelo. ${esOllama ? "Ollama no respondió y " : ""}` +
          `la nube falló → ${errores.join(" · ") || "ningún proveedor con clave"}. ` +
          `Pega una clave gratuita de Z.ai o Gemini en «Ranuras API».`
        ) as Error & { noReintentar?: boolean; fatal?: boolean };
        if (soloFaltaClave) {
          err.noReintentar = true;
          err.fatal = true;
        }
        throw err;
      },

      leerArchivo: async (ruta) => {
        const abs = resolveSafePath(ruta);
        if (!fs.existsSync(abs)) throw new Error(`No existe el archivo «${ruta}» dentro del proyecto.`);
        return fs.readFileSync(abs, "utf-8");
      },

      // v1.60.9 — LA MANO QUE ESTABA DECLARADA PERO NUNCA CABLEADA. El
      // superPrompt anuncia `escribir_archivo` como herramienta disponible y el
      // modelo construye planes que la usan, pero esta fábrica jamás inyectaba
      // la primitiva: TODA tarea `escribir_archivo` caía en el guard de honestidad
      // de planExecutors («este contexto no tiene escritura de archivos cableada»)
      // y el plan salía entero en rojo. Se cablea con el MISMO patrón que
      // `leerArchivo`: `resolveSafePath` re-confina la ruta (anti-escape) y `fs`
      // escribe en el proyecto que sirve el :3500. Devuelve la ruta relativa
      // real para que la PUERTA DE EVIDENCIA la verifique en disco.
      escribirArchivo: async (rutaRel, contenido) => {
        const abs = resolveSafePath(rutaRel); // 2.ª comprobación de confinamiento
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, contenido, "utf-8");
        return path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
      },

      // v1.60.9 — PUERTA DE EVIDENCIA: el motor la llama DESPUÉS de escribir y
      // falla la tarea si el disco no confirma lo que la escritura dijo. Lee
      // tamaño real; si no existe, `existe:false` y la tarea se marca roja
      // (plan verde ≠ archivo en disco).
      verificarArchivo: async (rutaRel) => {
        try {
          const abs = resolveSafePath(rutaRel);
          const st = fs.statSync(abs);
          return { existe: st.isFile(), bytes: st.size };
        } catch {
          return { existe: false, bytes: 0 };
        }
      },

      guardarResultado: async (nombre, texto, extension) => {
        const dir = path.join(dirDb, "resultados");
        fs.mkdirSync(dir, { recursive: true });
        // La extensión importa: un YAML guardado como .txt es un archivo mal
        // etiquetado, y mal etiquetar archivos es lo que este proyecto no hace.
        const limpia = (extension || "txt").replace(/[^a-z0-9]/gi, "").toLowerCase() || "txt";
        // El nombre viene de los datos de la tarea, o sea de fuera: se sanea
        // entero. Sin esto, un nombre con «../» escribiría fuera de la carpeta.
        const seguro = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(0, 80) || "resultado";
        const f = path.join(dir, `${seguro}-${Date.now()}.${limpia}`);
        fs.writeFileSync(f, texto, "utf-8");
        return path.relative(PROJECT_ROOT, f).split(path.sep).join("/");
      },
    });

    runnerPlanes = new PlanRunner({
      ejecutar,
      medir: medirMaquina,
      gestor,
      // v1.82.0 · FASE 3 punto 1: la capacidad del panel manda sobre la base de
      // workers; el criterio (clamp 2..núcleos-1..8 + degradación por RAM) vive en
      // src/engine/gobernante.ts y se aplica en calcularLimitesGlobales.
      paralelismoActivo: deps.paralelismoActivo,
      // v1.79.0 — EL BUCLE RECORRE LA RUTA QUE EL PLAN FIJO: cada ruta
      // relativa que termina se anota en el manual con su verdad — validada
      // SOLO con evidencia de ejecución (ESCRIBIR NO ES PROBAR), fallida con
      // causa, o cerrada sin evidencia. Nunca tumba la ejecución.
      onTareaTerminada: (p, t) => {
        const transicion =
          t.estado === "hecha" && t.resultado
            ? { tareaId: t.id, estado: "validada" as const, evidencia: `${t.resultado.resumen}${t.resultado.artefactos?.length ? ` · artefactos: ${t.resultado.artefactos.join(", ")}` : ""}` }
            : t.estado === "hecha"
              ? { tareaId: t.id, estado: "cerrada_sin_evidencia" as const }
              : { tareaId: t.id, estado: "fallida" as const, causa: t.error ? `${t.error.clase}: ${t.error.mensaje}` : "(sin causa)" };
        recorrerRuta(manualPerfLazo(), p.id, transicion, Date.now());
        guardarManualPerf();
      },
    });
    return runnerPlanes;
  }

  /** Vista de un plan lista para el panel (con las líneas ya formateadas). */
  const planParaPanel = (plan: Plan, perfilForzado?: MRId) => ({
    id: plan.id,
    objetivo: plan.objetivo,
    estado: plan.estado,
    creadoEn: plan.creadoEn,
    enSegundoPlano: runnerPlanes?.enSegundoPlano(plan.id) || false,
    tareas: plan.tareas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      peso: t.peso,
      tipo: t.tipo || "modelo",
      estado: t.estado,
      dependeDe: t.dependeDe,
      intentos: t.intentos,
      motivoEspera: t.motivoEspera || null,
      ms: t.coste?.ms ?? null,
      error: t.error ? `${t.error.clase}: ${t.error.mensaje}` : null,
      resultado: t.resultado?.resumen || null,
      artefactos: t.resultado?.artefactos || [],
      linea: lineaEstadoTarea(t),
    })),
    resumen: resumenPlan(plan),
    noTerminadas: plan.noTerminadas || [],
    log: (plan.log || []).slice(-60),
    presupuesto: presupuestoActual(perfilForzado),
  });

  /** Estado del cerebro: escalado, semáforo global y tramos MR. */
  app.get("/api/brain/runner", (_req: Request, res: Response) => {
    const runner = obtenerRunner();
    return res.json({
      ok: true,
      escalado: runner.escaladoActual(),
      etiqueta: etiquetaEscalado(runner.escaladoActual()),
      escaladosDisponibles: ESCALADOS,
      tramoFijado: runner.tramoActual(),
      // v1.82.0 · lo que el gobernador está aplicando AHORA (panel lo pinta).
      gobernante: runner.estadoGobernante(),
      semaforo: runner.estadoSemaforo(),
      activos: runner.activos(),
      planes: runner.listaPlanes().length,
      modeloPorDefecto: MODELO_PLAN_POR_DEFECTO,
      tramosMR: ORDEN_MR.map((id) => ({
        id,
        nombre: PERFILES_MR[id].nombre,
        ramGB: PERFILES_MR[id].ramGB,
        ioBase: PERFILES_MR[id].ioBase,
        cpuBase: PERFILES_MR[id].cpuBase,
        contextoPorTarea: PERFILES_MR[id].contextoPorTarea,
        modeloRecomendado: PERFILES_MR[id].modeloRecomendado,
      })),
      presupuesto: presupuestoActual(),
      notas: runner.avisosRecientes(),
    });
  });

  /** El botón: «cerebro resiliente ×1 ×2 ×4 ×6 ×8». Afecta incluso a lo que ya corre. */
  app.post("/api/brain/scale", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const pedido = req.body?.escalado;
    // Sin valor: el botón avanza al siguiente (×1 → ×2 → ×4 → ×6 → ×8 → ×1).
    const objetivo = pedido == null ? siguienteEscalado(runner.escaladoActual()) : Number(pedido);
    const r = runner.escalar(objetivo);
    return res.json({ ok: true, escalado: r.escalado, etiqueta: etiquetaEscalado(r.escalado), semaforo: r.limites, motivo: r.motivo });
  });

  /**
   * El selector de tramo MR: automático o forzado a MR#1..#4.
   * Se aplica EN CALIENTE, también a los planes que ya están corriendo.
   */
  app.post("/api/brain/tramo", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const pedido = req.body?.tramo;
    const esAuto = pedido == null || pedido === "" || String(pedido).toLowerCase() === "auto";
    const mr = esAuto ? undefined : (String(pedido).toUpperCase() as MRId);
    if (mr && !ORDEN_MR.includes(mr)) {
      return res.status(400).json({ ok: false, error: `Tramo desconocido: «${pedido}». Válidos: auto, ${ORDEN_MR.join(", ")}.` });
    }
    const r = runner.fijarTramo(mr);
    // v2.1 — `fijarTramo` ya devuelve `{ ok: true, … }`: el literal de delante
    // se descartaba. `presupuesto` sí va después y por eso se conserva.
    return res.json({ ...r, presupuesto: presupuestoActual(mr) });
  });

  /**
   * Planes guardados, en la forma que LEEN los paneles. v1.22.0 — dos arreglos:
   * `tareas` era un NÚMERO donde los paneles leen un ARRAY (el contador nunca
   * podía salir de 0), y la HOJA VIVA del bucle entra delante marcada ⚡ para
   * que el panel se llene solo mientras el motor trabaja.
   */
  app.get("/api/brain/plans", (_req: Request, res: Response) => {
    const runner = obtenerRunner();

    // v1.56.8 · DESATASCO AUTOMÁTICO, enganchado a este sondeo.
    // El panel ya pregunta cada 1,5 s (y cada 8 s en reposo), así que NO hace falta
    // un temporizador nuevo: el latido existe. Lo que no existía era la ACCIÓN: el
    // tablero pintaba «Atascado» y ahí moraba, de modo que el cartel rojo se quedaba
    // puesto aunque el cortacircuito hubiera enfriado hace un minuto. Se desatasca
    // ANTES de leer los planes, para que el usuario vea el estado DESPUÉS de
    // intervenir, no el de antes.
    for (const p of runner.listaPlanes()) {
      try {
        if (p.tareas.some((t) => t.estado === "bloqueada") || p.estado === "pausado") {
          runner.desatascarAutomatico(p.id);
        }
      } catch (e: any) {
        // Un desatasco fallido jamás debe tumbar el sondeo del panel.
        console.warn(`[brain] desatasco automático falló en plan ${p.id}: ${e?.message ?? e}`);
      }
    }

    const guardados = runner.listaPlanes().map((p) => planParaPanel(p));
    const espejo = hojaVivaParaPanel();
    return res.json({
      ok: true,
      planes: espejo ? [espejo, ...guardados] : guardados,
      semaforo: runner.estadoSemaforo(),
      escalado: runner.escaladoActual(),
    });
  });

  /**
   * Crea un plan. Valida dependencias y CICLOS ANTES de aceptarlo: un ciclo no
   * se ejecuta nunca (se colgaría), y devolverlo como texto legible es más útil
   * que un plan que se queda girando.
   */
  app.post("/api/brain/plan", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const objetivo = String(req.body?.objetivo || "").trim();
    const tareasBrutas = Array.isArray(req.body?.tareas) ? req.body.tareas : [];
    if (!objetivo) return res.status(400).json({ ok: false, error: "Falta «objetivo»: es obligatorio." });
    if (tareasBrutas.length === 0) return res.status(400).json({ ok: false, error: "El plan no trae tareas." });

    const modeloDelPlan = typeof req.body?.modelo === "string" ? req.body.modelo : "";
    const plantilla = typeof req.body?.contexto === "string" ? req.body.contexto : "";

    // v1.46.6 — El navegador reenvía aquí sus claves de nube y el proveedor
    // elegido, porque el runner corre en el servidor y no ve el localStorage.
    // Así el plan puede usar Z.ai/Gemini (lo que la PC de Mario sí soporta) en
    // vez de Ollama local.
    if (req.body?.claves && typeof req.body.claves === "object") {
      fijarCredencialesNubePlan(req.body.claves as any);
    }
    if (typeof req.body?.provider === "string" && req.body.provider.trim()) {
      fijarCredencialesNubePlan({ provider: req.body.provider.trim() });
    }

    // Se normaliza lo que llega: nunca se pasa al motor algo sin comprobar.
    const tareas = tareasBrutas.map((t: any, i: number) => {
      const tipo = typeof t?.tipo === "string" && t.tipo ? t.tipo : "modelo";
      const datos: Record<string, unknown> = t?.datos && typeof t.datos === "object" ? { ...t.datos } : {};
      if (tipo === "modelo") {
        if (modeloDelPlan && !datos.modelo) datos.modelo = modeloDelPlan;
        if (plantilla && !datos.contexto) datos.contexto = plantilla;
      }
      return {
        id: String(t?.id || i + 1),
        titulo: String(t?.titulo || `tarea ${i + 1}`),
        peso: t?.peso === "cpu" ? ("cpu" as const) : ("io" as const),
        tipo,
        datos,
        dependeDe: Array.isArray(t?.dependeDe) ? t.dependeDe.map((d: any) => String(d)) : [],
        // Las tareas de un mismo proveedor comparten cortacircuito: si el
        // servicio de modelo (nube) o el gratuito de imagen se cae, no se
        // queman reintentos en cada tarea. v1.46.6 — antes la clave era
        // "ollama"; como el plan ya va a la nube por defecto, la clave es
        // "modelo-nube" (así un estado viejo del circuito "ollama" no bloquea).
        claveCircuito: tipo === "modelo" ? "modelo-nube" : tipo === "generar_imagen" ? "imagen" : undefined,
      };
    });

    const plan = runner.crear(objetivo, tareas);
    const v = validarPlan(plan);
    if (!v.ok) {
      // Un plan inválido no se queda guardado como si fuera bueno.
      plan.estado = "fallido";
      return res.status(400).json({ ok: false, error: v.error, planId: plan.id });
    }

    // v1.79.0 — AL CREARSE EL PLAN SE FIJA SU RUTA EN EL MANUAL (objetivo +
    // sus rutas relativas). Solo para lo que de verdad va a correr: un plan
    // inválido no fija nada.
    fijarRuta(
      manualPerfLazo(),
      { id: plan.id, objetivo, tareas: plan.tareas.map((t) => ({ id: t.id, titulo: t.titulo, tipo: t.tipo })) },
      Date.now()
    );
    guardarManualPerf();

    let lanzado: { ok: boolean; motivo: string } | null = null;
    if (req.body?.autoLanzar !== false) lanzado = runner.lanzar(plan.id);

    return res.json({
      ok: true,
      planId: plan.id,
      lanzado,
      plan: planParaPanel(plan),
      message: lanzado?.ok
        ? `Plan ${plan.id} creado y lanzado en segundo plano (${plan.tareas.length} tareas).`
        : `Plan ${plan.id} creado (${plan.tareas.length} tareas) pero NO se lanzó.`,
    });
  });

  /**
   * v1.79.0 · LA PUERTA DEL MANUAL DE LA PERFECCIÓN. Cuando la auto-mejora del
   * navegador ACTÚA (una lección se refuerza: el turno salió bien con ella
   * presente) o cualquier bucle del motor valida un proceso (veredicto verde
   * de autovalido/ouroboros, entrega autoverificada), lo registra acá: queda
   * en `perfeccion.md` con su comando y su veredicto. Con guard, como el
   * resto de las mutantes de esta casa.
   */
  app.post("/api/perfeccion", (req: Request, res: Response) => {
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const b = (req.body || {}) as Record<string, unknown>;
    const m = manualPerfLazo();
    if (b.tipo === "proceso") {
      const nombre = String(b.nombre || "").trim();
      const veredicto = String(b.veredicto || "").trim();
      if (!nombre || !veredicto) return res.status(400).json({ ok: false, error: "Faltan «nombre» y «veredicto»." });
      const p = registrarProceso(
        m,
        { nombre, comando: b.comando ? String(b.comando) : undefined, veredicto, origen: b.origen ? String(b.origen) : "proceso" },
        Date.now()
      );
      guardarManualPerf();
      return res.json({ ok: true, proceso: p });
    }
    if (b.tipo === "leccion") {
      const texto = String(b.texto || "").trim();
      if (!texto) return res.status(400).json({ ok: false, error: "Falta «texto» de la lección." });
      const p = registrarProceso(
        m,
        {
          nombre: (String(b.nombre || "lección reforzada").trim() || "lección reforzada").slice(0, 120),
          veredicto: `turno ok con la lección presente (ayudó ${b.helped != null ? b.helped : "?"}×) — ${texto.slice(0, 200)}`,
          origen: "auto-mejora",
        },
        Date.now()
      );
      guardarManualPerf();
      return res.json({ ok: true, proceso: p });
    }
    return res.status(400).json({ ok: false, error: "tipo inválido: use «proceso» o «leccion»." });
  });

  /** Estado del manual (leído solo): qué rutas se fijaron, cómo quedaron, y los últimos procesos validados. */
  app.get("/api/perfeccion", (_req: Request, res: Response) => {
    const m = manualPerfLazo();
    return res.json({
      ok: true,
      rutas: m.rutas.map((r) => ({
        id: r.id,
        objetivo: r.objetivo,
        fijadaEn: r.fijadaEn,
        completadaEn: r.completadaEn ?? null,
        resumen: resumenRuta(m, r.id),
        tareas: r.tareas.map((t) => ({ id: t.id, titulo: t.titulo, estado: t.estado })),
      })),
      procesos: m.procesos.slice(-50),
    });
  });

  /**
   * Reintento de UNA tarea (v1.56.8). Sin esto, la única salida de una tarea
   * fallida era relanzar el plan entero — y con las claves sin poner, repetir el
   * mismo fallo tres veces. El `motivo` se devuelve SIEMPRE: rechazar en silencio
   * es justo lo que hacía parecer que «el botón de reinicio no estaba».
   */
  app.post("/api/brain/plan/:id/retry-tarea", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const cuerpo = (req.body || {}) as Record<string, unknown>;
    const tarea = String(cuerpo.tarea ?? "").trim();
    if (!tarea) return res.status(400).json({ ok: false, motivo: "Falta el id de la tarea (`tarea`)." });
    const r = runner.reintentarTarea(String(req.params.id), tarea);
    return res.status(r.ok ? 200 : 409).json(r);
  });

  /** Estado completo de un plan. */
  app.get("/api/brain/plan/:id", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const plan = runner.listaPlanes().find((p) => p.id === String(req.params.id));
    if (!plan) return res.status(404).json({ ok: false, error: `No existe el plan ${req.params.id}.` });
    return res.json({ ok: true, plan: planParaPanel(plan) });
  });

  /** Cancelar: inmediato de verdad, no «cuando acabe la siguiente tarea». */
  app.post("/api/brain/plan/:id/cancel", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.cancelar(String(req.params.id));
    return res.status(r.ok ? 200 : 404).json(r);
  });

  /** Reanudar un plan pausado (reinicio) o cancelado. Lo ya hecho NO se repite. */
  app.post("/api/brain/plan/:id/resume", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.reanudar(String(req.params.id));
    return res.status(r.ok ? 200 : 404).json(r);
  });

  /** Borrar un plan viejo (v1.46.7). Un plan EN CURSO se rechaza: cancelar antes. */
  const borrarPlan = (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.borrar(String(req.params.id));
    const codigo = r.ok ? 200 : /ejecutando/.test(r.motivo) ? 409 : 404;
    return res.status(codigo).json(r);
  };
  app.delete("/api/brain/plan/:id", borrarPlan);
  app.post("/api/brain/plan/:id/delete", borrarPlan);

  /** Estado completo: métricas, ley cargada, memoria, historial y propuestas. */
  app.get("/api/brain", (_req: Request, res: Response) => {
    try {
      return res.json({
        ok: true,
        stats: brain.stats(),
        estado: brain.getMemoria().split("\n").filter((l) => l.startsWith("- **")).slice(0, 5),
        historial: brain.listarHistorial().slice(0, 10),
        propuestas: brain.listarPropuestas(),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Estado operativo de la sesión. */
  app.post("/api/brain/state", (req: Request, res: Response) => {
    const { fase, hito, bloqueos } = req.body || {};
    const ok = brain.updateState({ fase, hito, bloqueos });
    return res.json({ ok, stats: brain.stats() });
  });

  /** Decisión arquitectónica (ADR Log). */
  app.post("/api/brain/decision", (req: Request, res: Response) => {
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    return res.json({ ok: brain.addDecision(texto) });
  });

  /** Lección aprendida (preferencias y errores que no se deben repetir). */
  /**
   * v1.9.0 — de endpoint huérfano a pieza del ciclo de aprendizaje.
   *
   * QUÉ ES: la puerta por la que una lección aprendida en el navegador entra en la
   * memoria del cerebro (`memoria.md`).
   * PARA QUÉ SIRVE: para que el aprendizaje sobreviva a limpiar los datos del
   * navegador. Hasta v1.9.0 no lo llamaba NADIE: las lecciones vivían solo en
   * `localStorage` y la promesa D9 estaba escrita pero sin cumplir.
   *
   * Lleva guard porque ESCRIBE en la memoria del cerebro: es la misma puerta que
   * el resto de rutas mutantes (fuera de loopback, sin token, no se pasa).
   */
  app.post("/api/brain/lesson", (req: Request, res: Response) => {
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    return res.json({ ok: brain.addLesson(texto) });
  });

  /**
   * Analiza un texto del modelo buscando PROPUESTAS DE AUTO-MEJORA del cerebro.
   * Nunca se aplican solas: se guardan en .cerebro-db/proposals/ para que un
   * humano las apruebe (cerebro.md es el núcleo inmutable).
   */
  app.post("/api/brain/scan", (req: Request, res: Response) => {
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    const detectadas = Brain.detectarPropuestas(texto);
    const guardadas: string[] = [];
    for (const p of detectadas) {
      const ruta = brain.guardarPropuesta(p);
      if (ruta) guardadas.push(ruta.split(/[\\/]/).pop() || ruta);
    }
    return res.json({ ok: true, detectadas: detectadas.length, guardadas, propuestas: brain.listarPropuestas() });
  });

  /** Historial completo de la memoria (para rollback). */
  app.get("/api/brain/history", (_req: Request, res: Response) => {
    return res.json({ ok: true, historial: brain.listarHistorial() });
  });

  /** Rollback: restaura una copia del historial (guarda antes la actual). */
  app.post("/api/brain/rollback", (req: Request, res: Response) => {
    const archivo = String(req.body?.archivo || "");
    if (!archivo) return res.status(400).json({ ok: false, error: "Falta 'archivo'." });
    const ok = brain.rollback(archivo);
    return res.json({ ok, stats: brain.stats() });
  });

  /** Compresión manual del estado (purga ruido conservando lo crítico). */
  app.post("/api/brain/compact", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...brain.compactar() });
  });

  /** Vista previa del bloque que se inyecta en el prompt, por nivel de modelo. */
  app.get("/api/brain/prompt", (req: Request, res: Response) => {
    const nivel = String(req.query.nivel || "standard");
    return res.json({ ok: true, nivel, bloque: brain.systemBlock(nivel as any) });
  });
}

```

### server/routers/calidad.ts (106 líneas)

```ts
/**
 * calidad.ts — ROUTER DE CALIDAD ASISTIDA (Fase 2, v1.70.3)
 * =========================================================
 * QUÉ ES: dos dominios hermanos salen del monolito `server.ts`:
 *   · `verifier`  — GET /api/verifier/status, POST /api/verifier/config,
 *     POST /api/verifier/check (el juez independiente en la nube);
 *   · `governor`  — GET /api/governor (la lectura honesta del hardware).
 * Se mueven **tal cual** (regla de la Fase 2: «se mueve, no se mejora») en un
 * solo archivo porque los dos responden la misma pregunta desde veredas
 * distintas: «¿aguanta esta máquina y está bien lo que propone?».
 *
 * POR QUÉ FUERA DE server.ts: el trinquete de `contrato-rutas.json` y la suite
 * `androidProyecto` exigen que el monolito no crezca y quede bajo 12287
 * líneas. Registrar por delegación añade DOS líneas al monolito y le quita
 * ~60. El contrato se REGENERA con `node scripts/superficie.mjs` — no se
 * edita a mano, porque un contrato editable es un trinquete que se afloja
 * solo.
 *
 * DEPENDENCIAS: las MISMAS instancias del monolito (`verifier`, `governor`),
 * inyectadas por `deps`. Una ruta movida tiene que seguir hablando con el
 * mismo estado que antes, o sería otra ruta con el mismo nombre.
 */
import type express from "express";
import type { Request, Response } from "express";
import type { CloudVerifier } from "../../src/engine/cloudVerifier";
import type { HardwareGovernor } from "../../src/engine/hardwareGovernor";

export interface DepsCalidad {
  /** El MISMO verificador de nube del monolito (config viva, no una copia). */
  verifier: CloudVerifier;
  /** El MISMO gobernador de hardware (lee el estado real de la máquina). */
  governor: HardwareGovernor;
}

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_CALIDAD = [
  "GET /api/verifier/status",
  "POST /api/verifier/config",
  "POST /api/verifier/check",
  "GET /api/governor",
] as const;

export function registrarCalidad(app: express.Express, deps: DepsCalidad): void {
  const verifier = deps.verifier;
  const governor = deps.governor;

  // ─── movidos tal cual desde server.ts (v1.70.3, Fase 2) ──────────────────
  /** Estado: activado o no, proveedor del juez, si hay clave y coste local. */
  app.get("/api/verifier/status", (_req: Request, res: Response) => {
    try {
      return res.json({ ok: true, ...verifier.status() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Configura el juez: activar, proveedor, modelo y política ante duda. */
  app.post("/api/verifier/config", (req: Request, res: Response) => {
    try {
      const patch: any = {};
      if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
      if (typeof req.body?.provider === "string") patch.provider = req.body.provider;
      if (typeof req.body?.model === "string" && req.body.model) patch.model = req.body.model;
      if (typeof req.body?.baseUrl === "string") patch.baseUrl = req.body.baseUrl;
      if (typeof req.body?.apiKeyEnv === "string" && req.body.apiKeyEnv) patch.apiKeyEnv = req.body.apiKeyEnv;
      if (req.body?.anteDuda === "dejar_pasar" || req.body?.anteDuda === "rechazar") patch.anteDuda = req.body.anteDuda;
      const cfg = verifier.setConfig(patch);
      console.log(`[CerebroNico] Verificador ${cfg.enabled ? "ACTIVADO" : "desactivado"} · juez: ${cfg.provider}/${cfg.model}`);
      return res.json({ ok: true, ...verifier.status() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Revisa una propuesta. Sin coste si falla la capa determinista.
   * `archivosProyecto` permite además comprobar que los imports existan.
   */
  app.post("/api/verifier/check", async (req: Request, res: Response) => {
    try {
      const peticion = String(req.body?.peticion || "");
      const propuesta = String(req.body?.propuesta || "");
      if (!propuesta) return res.status(400).json({ ok: false, error: "Falta 'propuesta'." });
      const archivosProyecto = Array.isArray(req.body?.archivosProyecto)
        ? req.body.archivosProyecto.map((x: any) => String(x))
        : undefined;
      const v = await verifier.verificar(peticion, propuesta, { archivosProyecto, exigirCodigo: req.body?.exigirCodigo === true });
      return res.json({ ok: true, ...v });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Gobernador de hardware: fase, presupuesto, qué cabe ahora y en qué modo.
   * Es la pieza que convierte "tengo 12 GB" en decisiones concretas.
   */
  app.get("/api/governor", (_req: Request, res: Response) => {
    try {
      return res.json({ ok: true, ...governor.report() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
}

```

### server/routers/capacidades.ts (182 líneas)

```ts
/**
 * capacidades.ts — ROUTER DE CAPACIDADES CORROBORADAS (v1.15.1)
 * ===============================================================
 * QUÉ ES: un único punto de verdad que dice, con números verificados contra el
 * código real, qué hay ACTIVO y qué está solo DECLARADO. Responde a la pregunta
 * que el proyecto se hizo desde el informe del motor: «¿cuánto de lo que decimos
 * que funciona, funciona de verdad?».
 *
 * FUENTES (todas leídas en caliente, no hardcodeadas):
 *   · skills      → catalogoHonesto (evidencia en disco)
 *   · herramientas→ toolRegistry (registro extensible)
 *   · consejo     → ejecutoresConsejo (ejecutor real vs declarado)
 *   · rutas       → contrato-rutas.json (superficie)
 *   · plugins     → carpeta extensions/ (manifiestos cn.*)
 */
import type express from "express";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { auditarCatalogo, resumenHonesto } from "../../src/engine/catalogoHonesto";
import { getAllToolNames, listToolPacks } from "../../src/engine/toolRegistry";
import { resumenEjecutores } from "../../src/engine/ejecutoresConsejo";
import { auditarEscena3D } from "../../src/engine/testigoEscena"; // v1.0.7 · el testigo de la escena 3D
import { compararFotogramas, type EntradaComparacion } from "../../src/engine/fotogramas"; // v1.0.8 · el ojo que compara dos fotogramas
import { generarEscena3D, TIPOS_AMBIENTE, type AmbienteTipo } from "../../src/engine/generadorEscena3D"; // v1.0.9 · el generador de ambientes

function contarPlugins(): number {
  try {
    return readdirSync(join(process.cwd(), "extensions"), { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name.startsWith("cn.")
    ).length;
  } catch {
    return 0;
  }
}

function leerRutas(): number {
  try {
    const c = JSON.parse(readFileSync(join(process.cwd(), "contrato-rutas.json"), "utf8"));
    return Number(c?.total ?? 0);
  } catch {
    return 0;
  }
}

export function registrarCapacidades(app: express.Express): void {
  app.get("/api/capacidades", (_req, res) => {
    const skills = resumenHonesto(auditarCatalogo((ruta) => existsSync(ruta)));
    const herramientas = getAllToolNames();
    res.json({
      ok: true,
      skills,
      herramientas: {
        reales: herramientas.length,
        packs: listToolPacks().map((p) => ({ id: p.id, herramientas: p.toolCount })),
      },
      consejo: resumenEjecutores(),
      rutas: leerRutas(),
      plugins: contarPlugins(),
    });
  });

  /**
   * v1.0.7 · GET /api/capacidades/testigo-3d?base=http://127.0.0.1:3500&ruta=/index.html
   * ────────────────────────────────────────────────────────────────────────────
   * La pregunta que esta casa se hace desde el informe del motor: «¿cuánto de lo
   * que decimos que funciona, funciona de verdad?». Para las escenas 3D la respuesta
   * era «no lo sabemos»: la skill y el manual exigen los testigos DOM, pero nadie
   * los pedía por HTTP. Esta ruta audita la obra COMO LA VE EL NAVEGADOR —pidiendo
   * el motor por la misma ruta que declaró el importmap—, así que el 404 de
   * `/vendor/three/three.module.js` (la pantalla negra) se detecta acá y no a oscuras.
   *
   * Cierra SOLO a localhost: es el preview de la propia máquina. Una ruta de
   * auditoría que acepta cualquier `base` es un Rebalsa-servicios disfrazado.
   * Y el veredicto trae `noMedible` siempre: un «ok» autoriza a decir «el montaje y
   * los testigos están», NO «se ve y se mueve» (eso necesita un navegador).
   */
  app.get("/api/capacidades/testigo-3d", async (req, res) => {
    const base = String((req.query as any).base || "").trim();
    const ruta = String((req.query as any).ruta || "/index.html").trim() || "/index.html";
    let urlBase: URL;
    try {
      urlBase = new URL(base);
    } catch {
      res.status(400).json({ ok: false, error: "falta el parametro BASE (la url del preview, p. ej. http://127.0.0.1:3500)" });
      return;
    }
    if (urlBase.hostname !== "127.0.0.1" && urlBase.hostname !== "localhost" && urlBase.hostname !== "[::1]") {
      res.status(400).json({ ok: false, error: "el testigo solo audita el preview local (127.0.0.1 / localhost)" });
      return;
    }
    const traer = async (rel: string) => {
      try {
        const r = await fetch(urlBase.origin + (rel.startsWith("/") ? rel : "/" + rel), { signal: AbortSignal.timeout(6000) });
        return { codigo: r.status, texto: await r.text() };
      } catch {
        return null; // 404/caida: el testigo lo va a decir con nombre y ruta
      }
    };
    try {
      const veredicto = await auditarEscena3D(traer, ruta.startsWith("/") ? ruta : "/" + ruta);
      res.json({ ...veredicto, base: urlBase.origin, ruta });
    } catch (e) {
      res.status(500).json({ ok: false, error: `el testigo tiro: ${e instanceof Error ? e.message : String(e)}` });
    }
  });

  /**
   * EL OJO (v1.0.8) · POST /api/capacidades/comparar-fotogramas
   * -----------------------------------------------------------
   * El testigo-3d de v1.0.7 confirma que el MONTAJE está (motor servido, canvas,
   * importmap) pero no puede decir «se MUEVE con el scroll»: para eso hay que
   * mirar dos fotogramas y compararlos. Esta ruta recibe lo que el capturador ya
   * redujo a datos —sha256 de cada PNG, testigos del recorrido y una rejilla de
   * luminancia— y delega TODO el criterio en `fotogramas.ts`. Acá no se decide
   * nada: sólo se valida el cuerpo y se devuelve el veredicto.
   *
   * Las imágenes NUNCA llegan hasta acá; sólo sus huellas y una malla reducida.
   * El veredicto trae `autorizaMovimiento` (la única frase que habilita decir «se
   * mueve») y `noMedible` siempre, para no confundir «montado» con «animado».
   */
  app.post("/api/capacidades/comparar-fotogramas", (req, res) => {
    const cuerpo = (req.body || {}) as Partial<EntradaComparacion>;
    const tieneSha = typeof cuerpo.shaA === "string" || typeof cuerpo.shaB === "string";
    const tieneRejilla = !!cuerpo.rejillaA || !!cuerpo.rejillaB;
    if (!tieneSha && !tieneRejilla) {
      res.status(400).json({
        ok: false,
        error: "faltan datos: mandá al menos shaA/shaB o rejillaA/rejillaB (el ojo no inventa movimiento sin evidencia)",
      });
      return;
    }
    try {
      const veredicto = compararFotogramas(cuerpo as EntradaComparacion);
      res.json({ ok: true, ...veredicto });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: `el ojo tiro: ${e instanceof Error ? e.message : String(e)}` });
    }
  });

  /**
   * EL GENERADOR (v1.0.9) · POST /api/capacidades/generar-escena-3d
   * ----------------------------------------------------------------
   * Genera un ambiente 3D navegable completo (index.html + estilo.css + main.js)
   * con render NATIVO (three vendorizado) y —esto es lo que lo hace honesto— lo
   * CORROBORA en el acto pasándolo por el mismo testigo que audita cualquier obra
   * (`auditarEscena3D`), sirviendo los archivos recién generados y el motor
   * vendorizado del disco. Así la respuesta no es «acá tenes unos archivos» sino
   * «acá tenes una obra que su propio testigo aprueba».
   *
   * El veredicto trae `noMedible`: generar + auditar el montaje NO es renderizar;
   * «se ve y se mueve» sigue necesitando el navegador (el ojo de v1.0.8).
   */
  app.post("/api/capacidades/generar-escena-3d", async (req, res) => {
    const cuerpo = (req.body || {}) as { tipo?: string; titulo?: string; semilla?: number; densidad?: number };
    const tipo = cuerpo.tipo && TIPOS_AMBIENTE.includes(cuerpo.tipo as AmbienteTipo)
      ? (cuerpo.tipo as AmbienteTipo) : undefined;
    try {
      const escena = generarEscena3D({
        tipo,
        titulo: typeof cuerpo.titulo === "string" ? cuerpo.titulo : undefined,
        semilla: Number.isFinite(cuerpo.semilla as number) ? Number(cuerpo.semilla) : undefined,
        densidad: Number.isFinite(cuerpo.densidad as number) ? Number(cuerpo.densidad) : undefined,
      });
      // Corroboración en el acto: servir lo generado + el motor del disco al testigo.
      const motorRuta = join(process.cwd(), "vendor", "three", "three.module.js");
      const motorTxt = existsSync(motorRuta) ? readFileSync(motorRuta, "utf8") : "";
      const archivos = new Map<string, string>();
      for (const a of escena.archivos) { archivos.set("/" + a.ruta, a.contenido); archivos.set(a.ruta, a.contenido); }
      const traer = async (ruta: string) => {
        if (ruta === "/vendor/three/three.module.js") return motorTxt ? { codigo: 200, texto: motorTxt } : null;
        const v = archivos.get(ruta);
        return v != null ? { codigo: 200, texto: v } : null;
      };
      const veredicto = await auditarEscena3D(traer);
      res.json({ ok: true, tipo: escena.tipo, titulo: escena.titulo, semilla: escena.semilla, archivos: escena.archivos, resumen: escena.resumen, veredicto });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: `el generador tiro: ${e instanceof Error ? e.message : String(e)}` });
    }
  });

}

```

### server/routers/carpetaProyecto.ts (415 líneas)

```ts
/**
 * carpetaProyecto.ts — SUITE «CANAL DIRECTO»: CARPETA/ZIP DE PROYECTO AL CHAT (v1.73.0)
 * ======================================================================================
 * QUÉ ES: el dominio completo de la vinculación de una carpeta local (o un .zip)
 * como raíz de trabajo del agente. Nace aquí, fuera del monolito, respetando el
 * trinquete de `contrato-rutas.json`: a `server.ts` solo le llegan DOS líneas
 * (import + registro).
 *
 * QUÉ RESUELVE (sesión 1792972925054, el corte de Zai): el motor no podía tocar
 * `C:\Users\...\Downloads\cerebro fotos` porque el puente :5000 solo escribe
 * dentro de sus raíces permitidas. Esta suite es el botón que faltaba: el usuario
 * elige la carpeta desde el chat, la ruta entra en `raices_extra` de
 * `puente-permitidos.json` (la puerta real del puente), y el modelo trabaja ahí
 * con `fs_*`/`pc_*` sin pedir autorización por cada archivo.
 *
 * LAS RUTAS
 *   GET  /api/carpeta/estado      → qué hay vinculado ahora (para resistir recargas)
 *   POST /api/carpeta/explorar    → navegador de discos/carpetas del equipo
 *   POST /api/carpeta/vincular    → escanea una carpeta y la promueve a raíz de trabajo
 *   POST /api/carpeta/vincular-zip→ descomprime un .zip en .vinculadas/ y lo vincula
 *   POST /api/carpeta/desvincular → suelta la raíz (y su permiso del puente)
 *
 * LÍMITES HONESTOS
 *   · El escaneo no copia el contenido: cuenta, mide y muestrea. Los archivos se
 *     leen bajo demanda con las herramientas reales. Un proyecto de 300 MB no se
 *     duplica para "Indexar" nada.
 *   · Topes: 20 000 archivos / 2 GB de árbol / 1 500 rutas de muestra en el resumen.
 *   · Raíces vetadas (raíz de unidad, Windows, /etc, /, home del usuario SUELTA):
 *     vincular el disco entero es una autopsia, no un canal de trabajo.
 *   · El .zip se descomprime con protección zip-slip (rutas absolutas y «..» fuera).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type express from "express";
import type { Request, Response } from "express";
import JSZip from "jszip";

export interface DepsCarpetaProyecto {
  /** Raíz de datos de la IDE (donde vive .cerebro-db): el estado va ahí. */
  proyectoRoot: string;
  /** Carpeta de la app (donde vive puente-permitidos.json junto al puente). */
  raizApp: string;
}

export const RUTAS_CARPETA_PROYECTO = [
  "GET /api/carpeta/estado",
  "POST /api/carpeta/explorar",
  "POST /api/carpeta/vincular",
  "POST /api/carpeta/vincular-zip",
  "POST /api/carpeta/desvincular",
] as const;

// Directorios que NADIE necesita recorrer para entender un proyecto. Saltarlos
// es la diferencia entre escanear en un segundo y perder el turno entero en
// node_modules (el mismo criterio que ya usa el puente al medir).
const SALTAR_DIR = new Set([
  "node_modules", ".git", ".svn", ".hg", "dist", "build", "out", "bin", "obj",
  "__pycache__", ".venv", "venv", "env", ".next", ".nuxt", ".cache", ".turbo",
  ".cerebro-db", ".proyectos", ".creador", ".vite", "coverage", "target",
]);

const TOPE_ARCHIVOS = 20000;
const TOPE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB de árbol
const TOPE_MUESTRA = 1500; // rutas devueltas en el resumen
const TOPE_ENTRADAS_LISTADO = 2000; // por carpeta navegada
const TOPE_ZIP_ARCHIVOS = 5000;

interface EstadoVinculacion {
  ruta: string;
  nombre: string;
  origen: "carpeta" | "zip";
  vinculadaEn: number;
  archivos: number;
  bytes: number;
  truncado: boolean;
  muestra: string[];
}

/** Nombre del estado: dentro de .cerebro-db, junto a bóveda y salud (la convención de la casa). */
function archivoEstado(proyectoRoot: string): string {
  return path.join(proyectoRoot, ".cerebro-db", "carpeta-vinculada.json");
}

function leerEstado(proyectoRoot: string): EstadoVinculacion | null {
  try {
    const bruto = fs.readFileSync(archivoEstado(proyectoRoot), "utf8");
    const e = JSON.parse(bruto) as EstadoVinculacion;
    // Un estado cuyo directorio ya no existe es un hecho, no un error: se avisa
    // al cliente con `rutaViva: false` para que ofrezca desvincular, sin borrarlo
    // a espaldas del usuario (puede ser una unidad extraíble aún no montada).
    return e && typeof e.ruta === "string" ? e : null;
  } catch {
    return null;
  }
}

/**
 * v1.86.6 — Acceso de SOLO LECTURA al pin del CANAL DIRECTO, para que el
 * arranque del sandbox pueda preferir la carpeta que el usuario fijó en vez de
 * desempatar dos proyectos iguales por recencia (mtime). Devuelve la ruta
 * vinculada o `null` cuando no hay vínculo.
 */
export function leerRutaVinculada(proyectoRoot: string): string | null {
  const e = leerEstado(proyectoRoot);
  return e && typeof e.ruta === "string" && e.ruta ? e.ruta : null;
}

/**
 * v1.0.14 · AUTO-VINCULADO DE OBRA (pedido de Mario, 09/11). Cuando el agente crea
 * un proyecto en la raíz de datos (p. ej. C:\Cerebronico\juego-autos), el sandbox
 * :3500 sirve la RAÍZ DE DATOS, no la subcarpeta — así que aunque la obra esté en
 * disco, el editor/preview no la enfoca hasta que se vincula. Esto lo hace solo:
 * si la ruta del proyecto recién creado es UNA SUBCARPETA de la raíz de datos (no
 * la raíz misma, no la instalación, no una carpeta del sistema), la vincula como
 * raíz de trabajo (CANAL DIRECTO) para que escritura, editor, sandbox y preview
 * apunten al mismo lugar.
 *
 * No es una autopsia de disco ni acepta cualquier carpeta: acota a la obra del
 * agente dentro de la raíz de datos, que es el caso que el usuario pidió
 * automatizar. Devuelve la ruta vinculada (o la que ya estaba) o null.
 */
/** ¿Las dos rutas apuntan al mismo sitio? (Windows no distingue mayúsculas). */
function samePath(a: string, b: string): boolean {
  try { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); } catch { return false; }
}

/** ¿El pin lo escribió el REGISTRO (espejo) o el humano? Solo el espejo se re-pincha. */
function esPinEspejo(proyectoRoot: string): boolean {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(proyectoRoot, ".cerebro-db", "carpeta-vinculada.json"), "utf8"));
    return typeof j?.espejoDe === "string" && j.espejoDe.length > 0;
  } catch { return false; }
}

export function autoVincularObra(
  proyectoRoot: string,
  raizApp: string,
  rutaObra: string
): { vinculada: string | null; yaEstaba: boolean } {
  try {
    const actual = leerRutaVinculada(proyectoRoot);
    const obra = path.resolve(String(rutaObra || ""));
    // v1.0.20 · UN PIN SÍ SE PISA, PERO SOLO SI ES NUESTRO. Antes cualquier pin
    // bloqueaba el auto-vinculado para siempre: el humano fijaba una obra a mano
    // una vez y el motor seguía sirviendo ESA carpeta aunque el agente escribiera
    // OTRA. El resultado era «escribí y el preview no cambia». La regla nueva:
    //  · pin fijado A MANO (origen ≠ espejo del registro) → no se toca, nunca.
    //  · pin espejado por el registro y la obra nueva es otra → se re-pincha, y
    //    se dice en el log: el que manda es el proyecto abierto.
    if (actual && samePath(actual, obra)) return { vinculada: actual, yaEstaba: true };
    if (actual && !esPinEspejo(proyectoRoot)) return { vinculada: actual, yaEstaba: true };
    const base = path.resolve(proyectoRoot);
    if (!obra || !obra.startsWith(base + path.sep)) return { vinculada: null, yaEstaba: false }; // no está bajo la raíz de datos
    if (!fs.existsSync(obra) || !fs.statSync(obra).isDirectory()) return { vinculada: null, yaEstaba: false };
    if (actual) console.log(`[CerebroNico] 🔁 RE-PIN: la obra espejada «${path.basename(actual)}» deja paso a «${path.basename(obra)}» (el proyecto abierto manda; un pin fijado a mano no se toca).`);
    const escaneo = escarCarpetas(obra);
    const puente = ajustarRaicesPuente(raizApp, obra, true);
    const estado: EstadoVinculacion = {
      ruta: obra,
      nombre: path.basename(obra),
      origen: "carpeta",
      vinculadaEn: Date.now(),
      archivos: escaneo.archivos,
      bytes: escaneo.bytes,
      truncado: escaneo.truncado,
      muestra: escaneo.muestra,
    };
    escribirEstado(proyectoRoot, estado);
    console.log(`[CerebroNico] 📌 AUTO-VINCULADO: la obra «${path.basename(obra)}» quedó como raíz de trabajo (CANAL DIRECTO) para que editor/:3500 la sirvan.`);
    return { vinculada: obra, yaEstaba: false };
  } catch {
    return { vinculada: null, yaEstaba: false };
  }
}

function escribirEstado(proyectoRoot: string, e: EstadoVinculacion | null): void {
  const destino = archivoEstado(proyectoRoot);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (e === null) {
    try { fs.rmSync(destino, { force: true }); } catch { /* ya no estaba */ }
    return;
  }
  fs.writeFileSync(destino, JSON.stringify(e, null, 2), "utf8");
}

/** Raíces que vetamos como "carpeta de proyecto": no es un canal, es un suicidio. */
function raizVetada(resuelta: string): string | null {
  const norm = resuelta.replace(/[\\/]+$/, "");
  const path_ = norm.toLowerCase();
  // Raíz de unidad Windows ("c:", "c:\") o POSIX ("/")
  if (/^[a-z]:$/i.test(norm) || norm === "/" || norm === "") return "es la raíz de una unidad: elige una carpeta concreta dentro";
  const prohibidas = [
    path.join(process.env.SystemRoot || "C:\\Windows").toLowerCase(),
    path.join(process.env.ProgramFiles || "C:\\Program Files").toLowerCase(),
    (process.env.ProgramData || "C:\\ProgramData").toLowerCase(),
    "/etc", "/boot", "/sys", "/proc", "/dev", "/usr", "/var", "/bin", "/sbin", "/lib",
  ];
  for (const p of prohibidas) {
    if (!p) continue;
    if (path_ === p || path_.startsWith(p + path.sep.toLowerCase()) || path_.startsWith(p + "/")) {
      return "es una carpeta crítica del sistema operativo";
    }
  }
  // El propio directorio HOME sin subcarpeta: demasiado ancho para una raíz de trabajo.
  const home = os.homedir().replace(/[\\/]+$/, "").toLowerCase();
  if (path_ === home) return "es la carpeta personal completa: elige un proyecto concreto dentro";
  return null;
}

/** Escaneo sin copia: cuenta, mide y muestrea el árbol. */
function escarCarpetas(raiz: string): { archivos: number; bytes: number; truncado: boolean; muestra: string[] } {
  let archivos = 0, bytes = 0, truncado = false;
  const muestra: string[] = [];
  const pila: string[] = [raiz];
  while (pila.length > 0) {
    const dir = pila.pop() as string;
    let entradas: fs.Dirent[] = [];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // sin permisos o desapareció: se sigue con el resto del árbol
    }
    for (const ent of entradas) {
      if (ent.name.startsWith(".") && ent.isDirectory()) continue; // .git, .vscode… ya caen por SALTAR_DIR, esto refuerza
      if (ent.isDirectory() && SALTAR_DIR.has(ent.name.toLowerCase())) continue;
      const completo = path.join(dir, ent.name);
      try {
        if (ent.isDirectory()) {
          pila.push(completo);
        } else if (ent.isFile()) {
          const st = fs.statSync(completo);
          archivos++;
          bytes += st.size;
          if (muestra.length < TOPE_MUESTRA) muestra.push(path.relative(raiz, completo));
          if (archivos >= TOPE_ARCHIVOS || bytes >= TOPE_BYTES) { truncado = true; return { archivos, bytes, truncado, muestra }; }
        }
      } catch { /* archivo volátil: no frena el escaneo */ }
    }
  }
  return { archivos, bytes, truncado, muestra };
}

/** Normaliza a barras POSIX para el JSON del puente (el Python hace os.path.normpath igual). */
function barraPuente(resuelta: string): string {
  return resuelta.replace(/\\/g, "/");
}

/** Añade o quita una raíz de `raices_extra` en puente-permitidos.json. Devuelve el estado final. */
function ajustarRaicesPuente(raizApp: string, resuelta: string, agregar: boolean): { ok: boolean; motivo?: string } {
  const archivo = path.join(raizApp, "puente-permitidos.json");
  try {
    const cfg = fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, "utf8")) : {};
    if (!Array.isArray(cfg.raices_extra)) cfg.raices_extra = [];
    const norma = barraPuente(resuelta);
    const ya = cfg.raices_extra.some((r: string) => barraPuente(String(r)).replace(/[\/]+$/, "") === norma.replace(/[\/]+$/, ""));
    if (agregar && !ya) cfg.raices_extra.push(norma);
    if (!agregar && ya) cfg.raices_extra = cfg.raices_extra.filter((r: string) => barraPuente(String(r)).replace(/[\/]+$/, "") !== norma.replace(/[\/]+$/, ""));
    fs.writeFileSync(archivo, JSON.stringify(cfg, null, 2), "utf8");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, motivo: e?.message || String(e) };
  }
}

/** Lista las raíces del equipo para el navegador (discos en Windows, / en POSIX). */
function raicesDelEquipo(): string[] {
  if (process.platform === "win32") {
    const letras: string[] = [];
    for (let i = 65; i <= 90; i++) {
      const unidad = `${String.fromCharCode(i)}:\\`;
      try { fs.readdirSync(unidad); letras.push(unidad); } catch { /* no montada */ }
    }
    return letras;
  }
  return ["/"];
}

export function registrarCarpetaProyecto(app: express.Express, deps: DepsCarpetaProyecto): void {
  const { proyectoRoot, raizApp } = deps;

  // ─── estado actual ─────────────────────────────────────────────────────────
  app.get("/api/carpeta/estado", (_req: Request, res: Response) => {
    const e = leerEstado(proyectoRoot);
    return res.json({ ok: true, vinculada: e ? { ...e, rutaViva: fs.existsSync(e.ruta) } : null });
  });

  // ─── navegador de carpetas (solo lectura de nombres) ──────────────────────
  app.post("/api/carpeta/explorar", (req: Request, res: Response) => {
    const rutaPedida = String(req.body?.ruta || "").trim();
    try {
      if (!rutaPedida) {
        return res.json({ ok: true, ruta: null, padre: null, raices: raicesDelEquipo(), entradas: [] });
      }
      const resuelta = path.resolve(rutaPedida);
      const st = fs.statSync(resuelta);
      if (!st.isDirectory()) return res.status(400).json({ ok: false, error: "eso es un archivo, no una carpeta" });
      const entradas = fs
        .readdirSync(resuelta, { withFileTypes: true })
        .slice(0, TOPE_ENTRADAS_LISTADO)
        .map((ent) => {
          let tam = 0;
          try { if (ent.isFile()) tam = fs.statSync(path.join(resuelta, ent.name)).size; } catch { /* */ }
          return { nombre: ent.name, ruta: path.join(resuelta, ent.name), esDir: ent.isDirectory(), tam };
        })
        .sort((a, b) => (a.esDir === b.esDir ? a.nombre.localeCompare(b.nombre) : a.esDir ? -1 : 1));
      const padre = path.dirname(resuelta);
      return res.json({
        ok: true,
        ruta: resuelta,
        padre: padre === resuelta ? null : padre,
        raices: raicesDelEquipo(),
        entradas,
      });
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ─── vincular una carpeta existente del equipo ────────────────────────────
  app.post("/api/carpeta/vincular", (req: Request, res: Response) => {
    const rutaPedida = String(req.body?.ruta || "").trim();
    if (!rutaPedida) return res.status(400).json({ ok: false, error: "falta la ruta" });
    const resuelta = path.resolve(rutaPedida);
    let st: fs.Stats;
    try {
      st = fs.statSync(resuelta);
    } catch {
      return res.status(400).json({ ok: false, error: "la ruta no existe en este equipo" });
    }
    if (!st.isDirectory()) return res.status(400).json({ ok: false, error: "es un archivo: usa vincular-zip o adjúntalo" });
    const vetada = raizVetada(resuelta);
    if (vetada) return res.status(403).json({ ok: false, error: `carpeta vetada: ${vetada}` });

    const escaneo = escarCarpetas(resuelta);
    const puente = ajustarRaicesPuente(raizApp, resuelta, true);
    const estado: EstadoVinculacion = {
      ruta: resuelta,
      nombre: path.basename(resuelta),
      origen: "carpeta",
      vinculadaEn: Date.now(),
      archivos: escaneo.archivos,
      bytes: escaneo.bytes,
      truncado: escaneo.truncado,
      muestra: escaneo.muestra,
    };
    escribirEstado(proyectoRoot, estado);
    return res.json({
      ok: true,
      vinculada: estado,
      puente: puente.ok
        ? { ok: true, aviso: "para que el puente :5000 la acepte ya, reiniciar el puente (el IDE lo pide solo)" }
        : { ok: false, motivo: puente.motivo },
    });
  });

  // ─── vincular un .zip recibido en base64 (se materializa en .vinculadas/) ──
  app.post("/api/carpeta/vincular-zip", async (req: Request, res: Response) => {
    try {
      const nombre = String(req.body?.nombre || "proyecto").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "proyecto";
      const b64 = String(req.body?.base64 || "");
      if (!b64) return res.status(400).json({ ok: false, error: "el zip llegó vacío" });
      const buf = Buffer.from(b64, "base64");
      // Cabecera mágica ZIP: el campo `nombre` no manda, manda el binario.
      if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
        return res.status(400).json({ ok: false, error: "el archivo no es un ZIP válido" });
      }
      const slug = nombre.replace(/\.zip$/i, "").replace(/[^\w.\- ]+/g, "_").slice(0, 60) || "proyecto";
      const destino = path.join(proyectoRoot, ".vinculadas", `${slug}-${Date.now()}`);
      fs.mkdirSync(destino, { recursive: true });
      const zip = await JSZip.loadAsync(buf);
      let escritas = 0, bytes = 0;
      const claves = Object.keys(zip.files).filter((k) => !zip.files[k].dir && !/(^|\/)__MACOSX?\//.test(k) && !/(^|\/)\._/.test(k));
      for (const clave of claves.slice(0, TOPE_ZIP_ARCHIVOS)) {
        const zfile = zip.files[clave];
        // Protección zip-slip: ni rutas absolutas ni «..» que escapen del destino.
        const abs = path.resolve(destino, zfile.name);
        if (!abs.startsWith(path.resolve(destino) + path.sep)) continue;
        const contenido = await zfile.async("nodebuffer");
        bytes += contenido.length;
        if (bytes > TOPE_BYTES) break;
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, contenido);
        escritas++;
      }
      const cortado = claves.length > escritas;
      const escaneo = { archivos: escritas, bytes, truncado: cortado, muestra: [] as string[] };
      const puente = ajustarRaicesPuente(raizApp, destino, true);
      const estado: EstadoVinculacion = {
        ruta: destino,
        nombre: `${nombre} (zip)`,
        origen: "zip",
        vinculadaEn: Date.now(),
        archivos: escaneo.archivos,
        bytes: escaneo.bytes,
        truncado: escaneo.truncado,
        muestra: fs.readdirSync(destino).slice(0, TOPE_MUESTRA).map((n) => n),
      };
      escribirEstado(proyectoRoot, estado);
      return res.json({ ok: true, vinculada: estado, puente: { ok: puente.ok, motivo: puente.motivo } });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ─── desvincular ───────────────────────────────────────────────────────────
  app.post("/api/carpeta/desvincular", (req: Request, res: Response) => {
    const e = leerEstado(proyectoRoot);
    let puente: { ok: boolean; motivo?: string } = { ok: true };
    if (e) puente = ajustarRaicesPuente(raizApp, e.ruta, false);
    escribirEstado(proyectoRoot, null);
    return res.json({ ok: true, desvinculada: e?.ruta || null, puente });
  });
}

```

### server/routers/concienciaSandbox.ts (143 líneas)

```ts
/**
 * concienciaSandbox.ts (router) — `/api/conciencia` PARA LA APP GENERADA
 * =====================================================================
 * v1.86.0 · FASE 7.1 y 7.2 del plano de la perfección.
 *
 * QUÉ EXPONE:
 *   GET  /api/conciencia                 → la última cosa que la app recordó
 *                                          (+ lo que enruta una consulta)
 *   POST /api/conciencia                 → la app escribe una memoria nueva
 *   GET  /api/conciencia/manifiesto      → qué campos le deja ver el IDE
 *   POST /api/conciencia/manifiesto      → regenera el manifiesto en el sandbox
 *
 * POR QUÉ ESTÁ FUERA DE `server.ts`: el trinquete (presupuesto de líneas, V8
 * §8.1 y `superficieRutas`). Aquí no hay lógica propia: la lógica vive en
 * `src/engine/concienciaSandbox.ts`, que es lo que prueban las suites. El router
 * solo traduce HTTP ↔ módulo y aplica la guarda de aislamiento ANTES de leer o
 * escribir una sola vez.
 *
 * LA RAÍZ NUNCA LA ELIGE EL CLIENTE: se pregunta al servidor cuál es el proyecto
 * activo del sandbox (`resolverRaizSandbox`). Un body con `raiz` sería un túnel
 * hacia cualquier carpeta del disco, y el plano es explícito: «nunca toca
 * archivos del usuario».
 */
import type express from "express";
import type { Request, Response } from "express";
import {
  escribirConcienciaSandbox,
  leerConcienciaSandbox,
  estadoConcienciaSandbox,
  pesoCerebroSandbox,
  guardarRaizSandbox,
} from "../../src/engine/concienciaSandbox";
import {
  MANIFIESTO_ESPEJO_SANDBOX,
  LO_QUE_NO_CRUZA,
  auditarManifiestoEspejo,
  escribirManifiestoEspejo,
  leerManifiestoEspejo,
  rutaManifiestoEspejo,
  filtrarInstantaneaPorManifiesto,
  PRESUPUESTO_TOKENS_ESPEJO,
} from "../../src/engine/manifiestoEspejo";

export interface DepsConcienciaSandbox {
  /** Raíz de datos del IDE (el workspace donde viven los proyectos del sandbox). */
  raizWorkspace: string;
  /** Carpeta de la propia IDE (para que la guarda rechace raíces que la contienen). */
  raizApp: string;
  /** El proyecto activo del sandbox, resuelto por el monolito. `null` si no hay. */
  resolverRaizSandbox: () => string | null;
  /** La puerta de la casa: loopback o token válido. */
  sandboxAuthorized: (req: Request) => boolean;
  /** La instantánea viva del IDE, para que el espejo se pueda INSPECCIONAR filtrado. */
  instantaneaViva?: () => any;
}

export const RUTAS_CONCIENCIA_SANDBOX = [
  "GET /api/conciencia",
  "POST /api/conciencia",
  "GET /api/conciencia/manifiesto",
  "POST /api/conciencia/manifiesto",
] as const;

export function registrarConcienciaSandbox(app: express.Express, deps: DepsConcienciaSandbox): void {
  const ctx = () => ({ raizWorkspace: deps.raizWorkspace, raizApp: deps.raizApp });
  const raizActiva = (): { raiz: string | null; motivo?: string } => {
    let bruto: string | null = null;
    try { bruto = deps.resolverRaizSandbox(); } catch (e: any) { return { raiz: null, motivo: `no se pudo resolver el proyecto activo: ${e?.message || e}` }; }
    if (!bruto) return { raiz: null, motivo: "no hay proyecto activo en el sandbox: levantaló con el preview antes de pedirle conciencia a la app" };
    const guarda = guardarRaizSandbox(bruto, ctx());
    return guarda.ok && guarda.raiz ? { raiz: guarda.raiz } : { raiz: null, motivo: guarda.motivo };
  };

  /** GET /api/conciencia — la app pregunta por su propio contexto. */
  app.get("/api/conciencia", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    if (!raiz.raiz) return res.status(409).json({ ok: false, motivo: raiz.motivo });
    const consulta = String(req.query?.consulta ?? "");
    const max = Number(req.query?.max) || undefined;
    if (String(req.query?.estado ?? "") === "1") {
      const est = estadoConcienciaSandbox(ctx(), raiz.raiz);
      return res.status(est.ok ? 200 : 422).json({ ...est, peso: pesoCerebroSandbox(raiz.raiz), manifiesto_ruta: rutaManifiestoEspejo(raiz.raiz) });
    }
    const lectura = leerConcienciaSandbox(ctx(), raiz.raiz, { consulta, max });
    return res.status(lectura.ok ? 200 : 422).json(lectura);
  });

  /** POST /api/conciencia — la app recuerda algo. */
  app.post("/api/conciencia", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    if (!raiz.raiz) return res.status(409).json({ ok: false, motivo: raiz.motivo });
    const r = escribirConcienciaSandbox(
      {
        tipo: req.body?.tipo,
        tema: req.body?.tema,
        titulo: req.body?.titulo,
        texto: String(req.body?.texto ?? ""),
        palabras: req.body?.palabras,
        estado: req.body?.estado,
      },
      ctx(),
      raiz.raiz,
    );
    return res.status(r.ok ? 200 : 422).json(r);
  });

  /** GET /api/conciencia/manifiesto — qué cruza el espejo, declarado. */
  app.get("/api/conciencia/manifiesto", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    const auditoria = auditarManifiestoEspejo();
    const enDisco = raiz.raiz ? leerManifiestoEspejo(raiz.raiz) : null;
    // Si el llamante trae una instantánea de prueba, se devuelve FILTRADA: así se
    // puede ver con los propios ojos que lo no declarado no cruza.
    const filtrada = req.body?.instantanea || (req as any).query?.mostrar === "viva"
      ? filtrarInstantaneaPorManifiesto(deps.instantaneaViva ? deps.instantaneaViva() : null)
      : null;
    return res.json({
      ok: auditoria.ok,
      ruta: raiz.raiz ? rutaManifiestoEspejo(raiz.raiz) : null,
      escrito: !!enDisco,
      manifiesto: MANIFIESTO_ESPEJO_SANDBOX,
      no_cruza: LO_QUE_NO_CRUZA,
      auditoria,
      presupuesto_tokens: PRESUPUESTO_TOKENS_ESPEJO,
      ...(filtrada ? { ejemplo_filtrado: filtrada } : {}),
    });
  });

  /** POST /api/conciencia/manifiesto — regenera el manifiesto en el sandbox. */
  app.post("/api/conciencia/manifiesto", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    if (!raiz.raiz) return res.status(409).json({ ok: false, motivo: raiz.motivo });
    const auditoria = auditarManifiestoEspejo();
    if (!auditoria.ok) return res.status(422).json({ ok: false, motivo: "el manifiesto no pasa su propia auditoría", auditoria });
    const r = escribirManifiestoEspejo(raiz.raiz);
    return res.status(r.ok ? 200 : 422).json({ ...r, auditoria });
  });
}

```

### server/routers/diagnostico.ts (630 líneas)

```ts
/**
 * diagnostico.ts — ROUTER DE DIAGNÓSTICO (Fase 2 · primera extracción, v1.11.0)
 * ============================================================================
 * QUÉ ES: el primer módulo de rutas extraído del monolito `server.ts`. Agrupa las
 * cuatro rutas de solo lectura que responden «¿cómo está esto?»: la salud profunda
 * del sistema, el perfil de rendimiento de un modelo, el catálogo de modelos
 * instalados en Ollama y —desde v1.57.15— el plan de auto-curación de una salida de
 * `npm run validar`. Las cuatro leen estado y devuelven criterio: ninguna escribe
 * disco y ninguna arranca un proceso.
 * PARA QUÉ SIRVE: para demostrar que la extracción funciona y para empezar a
 * reducir las 11.661 líneas del monolito sin cambiar ni una ruta ni un
 * comportamiento. La superficie la vigila `contrato-rutas.json`: si algo de aquí
 * se pierde o pierde su guard, la puerta se pone roja.
 *
 * POR QUÉ ESTAS TRES Y NO OTRAS
 * Es la primera tanda y se elige por riesgo, no por tamaño:
 *   · son GET (no escriben nada),
 *   · no tocan estado mutable del servidor (no usan `telemetryCache`, ni
 *     `sandboxProc`, ni contadores de CPU),
 *   · sus dependencias son funciones puras o valores de arranque.
 * Las que sí dependen de estado compartido (`/api/telemetry/*`, `/api/system/stats`)
 * NO se traen aquí a propósito: su sitio es la extracción del estado
 * (`server/estado/`), y mezclarlas ahora sería mover el problema, no el código.
 *
 * LA REGLA DE LA FASE: SE MUEVE, NO SE MEJORA
 * Los cuerpos de los tres manejadores están copiados tal cual estaban. Lo único
 * que cambia es de dónde salen tres valores (Ollama, RAM, núcleos), que se pasan
 * como dependencias en vez de leerse aquí: si se recalcularan en este fichero
 * habría dos fuentes de verdad para lo mismo, y la primera vez que una cambiara
 * tendríamos un diagnóstico que miente sobre el servidor al que diagnostica.
 */
import os from "node:os";
import type express from "express";
import type { Request, Response } from "express";
import {
  getModelProfile,
  buildOllamaOptions,
} from "../../src/engine/modelTiers";
import { describeResilience } from "../../src/engine/resilience";
import { auditarListaOllama, validarUrlServidorCustom } from "../../src/engine/aduanaModelos";
import { resolverOllama } from "../../src/engine/direccionOllama";
import {
  clasificarFallo,
  comandoDeRelecturaTodas,
  huellaError,
  parsearVeredicto,
  planDeAutoCuracion,
  presupuestoDeIntentos,
  type IntentoCuracion,
} from "../../src/engine/ouroboros";
// v2.3.12 · EL TELÓN YA NO TIENE SU PROPIA LISTA DE PUERTOS. Recorre el plano de
// `src/engine/puertosArranque.ts`, que es el mismo que alimenta el banner de
// arranque y el mapa del system prompt. Antes la ruta armaba `[cOllama, cSandbox,
// cPuente]` a mano: tres filas con puerto de las siete que tiene la casa, y por eso
// el arranque mostraba 3 mientras la barra de estado mostraba 7.
import {
  PUERTOS_DE_ARRANQUE,
  SONDA_PROPIA,
  nombreDeFila,
  type PuertoDeArranque,
} from "../../src/engine/puertosArranque";

export interface DepsDiagnostico {
  /** URL base de Ollama (la misma que usa el resto del servidor). */
  ollamaUrl: string;
  /** RAM de la máquina en GB, como la calculó el arranque. */
  ramGb: number;
  /** Núcleos de CPU, como los contó el arranque. */
  cpuCores: number;
  /**
   * ¿Hay un sandbox arrancado en esta sesión? Lo sabe el estado del sandbox; aquí
   * solo se pregunta. Sin esto no se puede distinguir «aún no arrancado» (normal al
   * empezar) de «arrancado y no contesta» (un problema de verdad).
   */
  sandboxVivo: () => boolean;
  /** Puerto del sandbox (:3500). Se pasa para no repetir el número en dos sitios. */
  sandboxPort: number;
}

/** Las rutas que registra este módulo: la lista sirve para comprobarlo, no para documentar. */
export const RUTAS_DIAGNOSTICO = [
  "GET /api/health/deep",
  "GET /api/ollama/perf",
  "GET /api/ollama/models",
  "POST /api/diagnostico/autocurar",
] as const;

/** Una fila de `/api/health/deep`: qué es, si está bien, qué se ve y qué hacer. */
interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
  /**
   * v2.3.12 · LOS TRES ESTADOS que Mario fijó el 4/11 para el chip del :5103,
   * aplicados a toda la tabla y no sólo a ese puerto:
   *   · `vivo`          → verde
   *   · `sin-arrancar`  → gris (es de los que nacen bajo demanda: no es una falla)
   *   · `caido`         → rojo (debía estar y no está)
   * Ausente en filas que no son un puerto (Memoria, Cortacircuitos): se pintan
   * con el criterio viejo, verde/rojo.
   */
  estado?: "vivo" | "sin-arrancar" | "caido";
  /**
   * v2.3.12 · ¿esta fila puede retrasar el telón y contar como «problema»?
   * `false` = se muestra con su motivo pero no secuestra la entrada. Es lo que
   * impide que el arreglo del defecto se cobre otro: con siete filas, cualquier
   * pack de Python que no levantó tendría al usuario doce segundos mirando un
   * spinner por algo que no impide trabajar.
   */
  bloqueante?: boolean;
}

export function registrarDiagnostico(
  app: express.Express,
  deps: DepsDiagnostico,
): void {
  const {
    ollamaUrl: OLLAMA_DEFAULT,
    ramGb: RAM_GB,
    cpuCores: CPU_CORES,
  } = deps;

  // ─── Sondas de `/api/health/deep` (v1.70.4) ──────────────────────────────
  // El splash consulta esta ruta cada 1,2 s. Antes las tres sondas de red
  // corrían DE UNA (Ollama 4 s + sandbox 3 s + puente 3 s = hasta 10 s por
  // pasada): el splash no alcanzaba a confirmar y declaraba el rojo antes de
  // tiempo. Ahora corren EN PARALELO y la peor pasada tarda lo que la sonda
  // más lenta. Cada sonda devuelve su Check; el orden de exhibición se
  // mantiene idéntico al de siempre.

  /**
   * Ollama v1.70.4 · «NUNCA DA VERDE» (capturas de Mario, 25/10).
   * La sonda vieja pedía /api/tags con 4 s de plazo. Pero /api/tags NO es
   * barato: mientras Ollama está metiendo un modelo en RAM (el arranque de
   * la IDE coincide justo con ese calentamiento; 45 modelos, 4 núcleos), la
   * lista se hace de esperar y la sonda devolvía «The operation was aborted
   * due to timeout» → rojo PARA SIEMPRE (el splash solo mira seis segundos).
   * Se separó en dos preguntas, cada una con su plazo honesto:
   *   · ¿VIVE?    → /api/version: siempre instantáneo, no carga nada.
   *   · ¿QUÉ HAY? → /api/tags con paciencia (9 s). Si se demora, Ollama está
   *     VIVO y ocupado: se dice tal cual, en verde — no como avería.
   */
  async function sondaOllama(): Promise<Check> {
    const base = (process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "");
    let version = "";
    try {
      const rv = await fetch(`${base}/api/version`, {
        signal: AbortSignal.timeout(3500),
      });
      if (rv.ok)
        version = String(
          ((await rv.json().catch(() => ({}))) as any)?.version || "?",
        );
    } catch {
      return {
        name: "Ollama :11434",
        ok: false,
        detail: "no responde ni la consulta de versión",
        fix: "Arranca Ollama. Sin él, los modelos locales no pueden responder.",
      };
    }
    try {
      const r = await fetch(`${base}/api/tags`, {
        // v2.1.3 — 9 s + los 3,5 s de /api/version daban 12,5 s de pasada: más
        // que el plazo del propio telón (12 s). Con 6 s la peor pasada queda en
        // 9,5 s y el splash alcanza a pintar las filas antes de decidir.
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const data: any = await r.json().catch(() => ({}));
        const models: string[] = (data?.models || [])
          .map((m: any) => m?.name)
          .filter(Boolean);
        return {
          name: "Ollama :11434",
          ok: true,
          detail: `${models.length} modelo(s) instalado(s) · v${version}`,
        };
      }
      return {
        name: "Ollama :11434",
        ok: true,
        detail: `vivo (v${version}); la lista de modelos respondió HTTP ${r.status}`,
        fix: "Ollama está cargando algo en RAM: es normal al arranque y se arregla solo.",
      };
    } catch {
      return {
        name: "Ollama :11434",
        ok: true,
        detail: `vivo (v${version}); la lista de modelos se hace de esperar`,
        fix: "Ollama está cargando algo en RAM: es normal al arranque y se arregla solo.",
      };
    }
  }

  /**
   * Sandbox :3500 · v1.13.0 — «fetch failed» AL ARRANCAR NO ES UN PROBLEMA.
   * El proceso del sandbox se levanta la primera vez que hace falta (al abrir
   * el preview). Tres desenlaces, según lo que SÍ se sabe:
   *   · responde                           → correcto
   *   · no responde y no hay proceso       → «aún no arrancado» (informativo)
   *   · no responde y SÍ hay proceso vivo  → problema real, con su remedio
   */
  async function sondaSandbox(): Promise<Check> {
    const sandboxUrl =
      process.env.SANDBOX_URL || `http://127.0.0.1:${deps.sandboxPort}`;
    try {
      const r = await fetch(sandboxUrl, { signal: AbortSignal.timeout(3000) });
      return {
        name: "Sandbox :3500",
        ok: r.ok,
        detail: r.ok ? `HTTP ${r.status}` : `responde con HTTP ${r.status}`,
        fix: r.ok
          ? undefined
          : "El sandbox contesta con error. Reinicialo con Sync.",
      };
    } catch (err: any) {
      if (deps.sandboxVivo()) {
        return {
          name: "Sandbox :3500",
          ok: false,
          detail: err?.message || "sin respuesta",
          fix: "Está arrancado pero no contesta: pulsa Sync para reinicialo.",
        };
      }
      return {
        name: "Sandbox :3500",
        ok: true,
        detail: "aún no arrancado (se levanta al abrir el preview)",
        estado: "sin-arrancar",
      };
    }
  }

  /** Puente PC :5000 — sin él, el Modo Agente (archivos reales) no funciona. */
  async function sondaPuente(): Promise<Check> {
    try {
      const r = await fetch("http://127.0.0.1:5000/health", {
        signal: AbortSignal.timeout(3000),
      });
      return {
        name: "Puente PC :5000",
        ok: r.ok,
        detail: `HTTP ${r.status}`,
        fix: r.ok
          ? undefined
          : "Ejecuta el puente Python para el Modo Agente PC.",
      };
    } catch (err: any) {
      return {
        name: "Puente PC :5000",
        ok: false,
        detail: err?.message || "sin respuesta",
        fix: "Sin el puente, el Modo Agente PC (archivos reales) no funciona.",
      };
    }
  }

  /**
   * v2.3.12 · LA SONDA GENÉRICA DEL PLANO — los puertos que el telón todavía no
   * miraba (IDE :3000, Memoria :5100, Creador :5102, Motor del cerebro :5103).
   *
   * Tres desenlaces, y el tercero es el que evita la mentira nueva: un puerto que
   * pertenece a un servicio que NACE BAJO DEMANDA no puede pintarse de rojo a las
   * nueve de la mañana. Eso era exactamente lo que Mario pidió no hacer con el
   * :5103 («que sea así» refería al rojo de lo que SE CORTA, no al rojo de lo que
   * nunca fue). Gris = «no existe todavía», y lo dice.
   */
  async function sondaDePlano(p: PuertoDeArranque): Promise<Check> {
    const bajoDemanda = p.nacimiento === "bajo-demanda";
    const base = { name: nombreDeFila(p), bloqueante: p.bloqueante, fix: p.remedio };
    if (p.sonda === SONDA_PROPIA) {
      // El :3000 es este manejo: si alguien lee esta fila, está vivo por
      // construcción. Falsarlo con una sonda de red sería pagar un viaje para
      // preguntarle a la puerta si la puerta existe.
      return { ...base, ok: true, detail: "este server está respondiendo ahora", estado: "vivo" };
    }
    const url =
      p.sonda === "OLLAMA"
        ? `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "")}/api/version`
        : p.sonda === "WORKER"
          ? "http://127.0.0.1:5000/health"
          : p.sonda === "SANDBOX"
            ? process.env.SANDBOX_URL || `http://127.0.0.1:${deps.sandboxPort}`
            : p.sonda;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) {
        return { ...base, ok: false, detail: `responde HTTP ${r.status}`, estado: "caido" };
      }
      return { ...base, ok: true, detail: `escuchando · HTTP ${r.status}`, estado: "vivo" };
    } catch (err: any) {
      const causa = String(err?.cause?.code || err?.message || err || "");
      if (causa.includes("TIMEOUT") || causa.includes("abort")) {
        return { ...base, ok: false, detail: "tardó más de 3 s en contestar", estado: "caido" };
      }
      if (bajoDemanda) {
        return {
          ...base,
          ok: true,
          detail: "sin arrancar (nace cuando el motor lo necesita)",
          estado: "sin-arrancar",
          fix: undefined,
        };
      }
      return { ...base, ok: false, detail: "no hay nadie escuchando", estado: "caido" };
    }
  }

  // v1.70.4 · Sonda con cache corto: el splash polling cada 1,2 s y la barra
  // de estados también lee esta ruta. Re-sondear Ollama en CADA lectura era
  // parte del «nunca da verde»: con el motor cargando un modelo, dos pasadas
  // se pisaban y la última moría en el plazo. 1,5 s de cache: el splash sigue
  // viendo movimiento, el puerto deja de recibir sondas inútiles.
  let ultimoBody: any = null;
  let ultimoMs = 0;
  let enVuelo: Promise<any> | null = null;

  /**
   * v2.1.3 — TRES AGUJEROS QUE DEJABAN EL TELÓN CERRADO
   * ---------------------------------------------------
   * 1. Si una sonda lanzaba una excepción no controlada, `enVuelo` quedaba
   *    apuntando a una promesa rechazada para siempre: toda lectura posterior
   *    moría con 500 y el splash no recibía ni una fila.
   * 2. No había plazo para la pasada completa: la suma de los plazos de cada
   *    sonda (3,5 + 6 + 3 + 3) podía superar el plazo del cliente, así que el
   *    cliente abortaba antes de tener respuesta y volvía a empezar: bucle.
   * 3. `enVuelo = null` sólo se ejecutaba en el camino feliz.
   * Ahora: plazo duro de 9,5 s por pasada, fila que dice qué no contestó, y
   * `finally` que siempre libera la puerta.
   */
  const PLAZO_PASADA_MS = 9500;

  const conPlazo = <T,>(p: Promise<T>, ms: number, siNoLlega: T): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((listo) => {
        const t = setTimeout(() => listo(siNoLlega), ms);
        // No mantener vivo el proceso por un temporizador de sonda.
        if (typeof (t as any).unref === "function") (t as any).unref();
      }),
    ]);

  app.get("/api/health/deep", async (_req: Request, res: Response) => {
    if (ultimoBody && Date.now() - ultimoMs < 1500) return res.json(ultimoBody);
    if (enVuelo) {
      try {
        return res.json(await enVuelo);
      } catch {
        return res.json(ultimoBody || { ok: false, summary: "la sonda falló", checks: [] });
      }
    }

    enVuelo = (async () => {
      const sinRespuesta = (name: string, ms: number): Check => ({
        name,
        ok: false,
        detail: `no contestó en ${Math.round(ms / 100) / 10} s`,
        fix: "Quedó fuera de plazo: la IDE entra igual y esto se puede corregir desde Config.",
      });

      // v2.3.12 · SIETE FILAS, UNA PASADA. Las tres sondas con detalle propio
      // (Ollama cuenta modelos, sandbox distingue «no está» de «está y no
      // contesta», puente tiene su /health) se lanzan YA, en paralelo; el resto
      // del plano corre con la sonda genérica. El total lo topa
      // `PLAZO_PASADA_MS`, no la suma, así que agregar cuatro puertos no le
      // agrega cuatro segundos al telón.
      const ricas: Record<string, Promise<Check>> = {
        port11434: conPlazo(sondaOllama(), PLAZO_PASADA_MS, sinRespuesta("Ollama :11434", PLAZO_PASADA_MS)),
        port3500: conPlazo(sondaSandbox(), PLAZO_PASADA_MS, sinRespuesta("Sandbox :3500", PLAZO_PASADA_MS)),
        port5000: conPlazo(sondaPuente(), PLAZO_PASADA_MS, sinRespuesta("Puente PC :5000", PLAZO_PASADA_MS)),
      };
      const filasDePuertos: Check[] = await Promise.all(
        PUERTOS_DE_ARRANQUE.map(async (p) => {
          const cruda = ricas[p.clave];
          const chk = cruda ? await cruda : await sondaDePlano(p);
          // El nombre y el `bloqueante` SIEMPRE los gana el plano: si la sonda
          // escribió «Ollama :11434» y el plano dice otra cosa, manda el plano,
          // porque es el que además imprime el banner y viaja en el prompt.
          return {
            ...chk,
            name: nombreDeFila(p),
            bloqueante: p.bloqueante,
            estado: chk.estado || (chk.ok ? "vivo" : "caido"),
          };
        }),
      );

      // Memoria del sistema (local, instantánea: no necesita sonda asíncrona).
      const totalGb = RAM_GB;
      const freeGb = Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
      const rssMb = Math.round(process.memoryUsage().rss / 1024 ** 2);
      const lowMem = freeGb < 1.2;
      const cMemoria: Check = {
        name: "Memoria",
        ok: !lowMem,
        detail: `${freeGb} GB libres de ${totalGb} GB · IDE usando ${rssMb} MB`,
        fix: lowMem
          ? "Queda menos de 1,2 GB libre: cierra el navegador o usa un modelo micro; si no, Ollama hará swap y parecerá colgado."
          : undefined,
      };

      // Resiliencia: estado de los cortacircuitos por proveedor.
      const cCircuitos: Check = {
        name: "Cortacircuitos",
        ok: true,
        detail: describeResilience(),
      };

      // v2.3.12 · El orden es el del plano (3000 → 11434) y después las dos filas
      // que no son un puerto: memoria de la máquina y cortacircuitos.
      const checks: Check[] = [...filasDePuertos, cMemoria, cCircuitos];
      // «Problema» sigue significando lo que siempre significó: lo que el usuario
      // necesita para trabajar y no está. Lo que le falta a un pack que además se
      // puede apagar a propósito viaja aparte, como aviso.
      const failing = checks.filter((c) => !c.ok && c.bloqueante !== false);
      const avisos = checks.filter((c) => !c.ok && c.bloqueante === false);
      return {
        ok: failing.length === 0,
        summary:
          failing.length === 0
            ? avisos.length
              ? `Todo operativo · ${avisos.length} servicio(s) de la casa sin levantar (informativo)`
              : "Todo operativo."
            : `${failing.length} problema(s): ${failing.map((f) => f.name).join(", ")}`,
        checks,
        // v2.3.12 · las siete filas nombran su puerto; la cuenta de puertos va
        // explícita para que nadie vuelva a pintar «3 de la casa» creyendo que son
        // todos.
        puertosMedidos: filasDePuertos.length,
        avisos: avisos.map((a) => a.name),
        // Recomendaciones ordenadas por impacto real sobre la velocidad
        recommendations: [
          ...failing.filter((f) => f.fix).map((f) => `${f.name}: ${f.fix}`),
          ...avisos.filter((f) => f.fix).map((f) => `${f.name}: ${f.fix}`),
          "Si un modelo local no contesta, pulsa «Precalentar» antes de escribir: evita la carga desde disco en el primer mensaje.",
          "Para 8 GB: usa modelos de 0,4-1,5 GB con contexto 2048-4096 y cierra el navegador mientras generas.",
        ],
      };
    })();

    try {
      const cuerpo = await enVuelo;
      ultimoBody = cuerpo;
      ultimoMs = Date.now();
      return res.json(cuerpo);
    } catch (e: any) {
      // Nunca 500: el splash necesita filas para poder explicar el rojo.
      return res.json({
        ok: false,
        summary: `la sonda falló: ${e?.message || e}`,
        checks: ultimoBody?.checks || [],
      });
    } finally {
      enVuelo = null;
    }
  });

  /** Devuelve el perfil de rendimiento calculado para un modelo. */
  app.get("/api/ollama/perf", (req: Request, res: Response) => {
    const model = String(req.query.model || "");
    if (!model)
      return res.status(400).json({ ok: false, error: "Falta ?model=" });
    const profile = getModelProfile(model, RAM_GB);
    return res.json({
      ok: true,
      model,
      ramGb: RAM_GB,
      cpuCores: CPU_CORES,
      tier: profile.tier,
      paramsB: profile.paramsB,
      toolCapable: profile.toolCapable,
      suggestedOptions: buildOllamaOptions(model, undefined, CPU_CORES, RAM_GB),
      contextCharBudget: profile.contextCharBudget,
      keepAlive: profile.keepAlive,
      notes: profile.notes,
    });
  });

  /**
   * Ollama models catalog proxy
   */
  app.get("/api/ollama/models", async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
    const customUrl = (rawUrl ? resolverOllama({ OLLAMA_URL: rawUrl }).base : OLLAMA_DEFAULT).replace(/\/+$/, "");
    const plazoMs = Number(process.env.CN_PLAZO_TAGS_MS || 40000);

    const candidatas: string[] = [customUrl];
    try {
      const u = new URL(customUrl);
      if (u.hostname === "127.0.0.1") {
        const alt = new URL(customUrl);
        alt.hostname = "localhost";
        candidatas.push(alt.toString().replace(/\/+$/, ""));
      } else if (u.hostname === "localhost") {
        const alt = new URL(customUrl);
        alt.hostname = "127.0.0.1";
        candidatas.push(alt.toString().replace(/\/+$/, ""));
      }
    } catch {}

    let lastError: any = null;
    for (let i = 0; i < candidatas.length; i++) {
      const target = candidatas[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), plazoMs);
      try {
        // v2.2.2 / v2.3.4 · CN_PLAZO_TAGS_MS permite ampliar la espera con almacenes grandes.
        const response = await fetch(`${target}/api/tags`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.models)) {
            const nombres = data.models.map((m: any) => m?.name || m?.model || "");
            const auditoria = auditarListaOllama(nombres);
            const porNombre = new Map(auditoria.todos.map((t) => [t.name, t] as const));
            data.models = data.models.map((m: any) => {
              const name: string = String(m?.name || m?.model || "").trim();
              const t = porNombre.get(name);
              return { ...(m && typeof m === "object" ? m : { name }), name, rol: t?.rol || "chat", motivo: t?.motivo || "" };
            });
            data.auditoria = auditoria.conteo;
            data.excluidos_de_chat = auditoria.excluidos;
          }
          data.ollamaUrl = target;
          return res.json(data);
        }
        return res.status(response.status).json({ models: [], error: `Ollama contesto ${response.status}`, ollamaUrl: target });
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        // Si falló por conexión y queda un loopback alternativo (127.0.0.1 ↔ localhost), probar siguiente.
        if (err?.name === "AbortError") break;
      }
    }

    return res.json({
      models: [],
      error: String(lastError?.message || lastError || "No se pudo conectar con Ollama"),
      ollamaUrl: customUrl,
      plazoMs: Number(process.env.CN_PLAZO_TAGS_MS || 40000),
    });
  });

  /**
   * v1.57.15 · AUTOCURACIÓN — el criterio de `ouroboros.ts` puesto al alcance.
   *
   * QUÉ ES: recibe la SALIDA de `npm run validar` y devuelve el PLAN: qué causa
   * tiene el rojo, si es curable por el modelo, qué comando hace falta correr para
   * leer el error COMPLETO (el veredicto lo trunca y remite a la suite), cuántos
   * intentos permite el presupuesto de CPU y —si toca curar— el prompt ya recortado
   * contra la ventana real del turno.
   *
   * QUÉ NO ES: no ejecuta, no escribe, no llama al modelo. Este módulo siempre fue
   * de diagnóstico, y mantener esa promesa es lo que distingue una valla de un
   * motor: si acá se arrancara un `spawn`, el plan quedaría con la única cosa que
   * el proyecto ya no tolera — un paso que nadie puede probar en seco. Quien
   * ejecuta es el bucle; acá se decide. Es POST porque el cuerpo es un texto que
   * no cabe en una query, no porque modifique algo.
   */
  app.post("/api/diagnostico/autocurar", (req: Request, res: Response) => {
    const cuerpo = (
      req.body && typeof req.body === "object" ? req.body : {}
    ) as Record<string, any>;
    const salida = typeof cuerpo.salida === "string" ? cuerpo.salida : "";
    if (!salida.trim()) {
      // (La forma de esta línea la fija `tests/ouroboros.test.ts` a propósito:
      // un rojo de la IDE NUNCA puede contestar 200 vacío. No reenvolverla.)
      return res.status(400).json({ ok: false, motivo: "falta `salida`: el texto que imprimió `npm run validar`" });
    }
    const codigo = Number.isFinite(Number(cuerpo.codigo))
      ? Number(cuerpo.codigo)
      : 1;
    const veredicto = parsearVeredicto(salida, codigo);
    const clasificacion = clasificarFallo(veredicto, salida);
    const costo = Number(cuerpo.costoValidacionMs);
    const presupuesto = presupuestoDeIntentos(
      Number.isFinite(costo) && costo > 0 ? costo : 90_000,
      Number(cuerpo.minutos) || 4,
    );
    const historial: IntentoCuracion[] = (
      Array.isArray(cuerpo.historial) ? cuerpo.historial : []
    ).map((h: any) => {
      const extracto =
        typeof h?.extracto === "string"
          ? h.extracto
          : String(h?.motivo ?? h ?? "");
      return {
        extracto,
        huella:
          typeof h?.huella === "string" ? h.huella : huellaError(extracto),
        costoMs: Number(h?.costoMs) || presupuesto.costoValidacionMs,
      };
    });
    // La ventana del turno es la que el motor YA topó por RAM (techoContexto): el
    // extracto tiene que caber en lo que se puede pagar, no en lo que se tecleó.
    const modelo = typeof cuerpo.modelo === "string" ? cuerpo.modelo : "";
    const perfil = modelo ? getModelProfile(modelo, RAM_GB) : null;
    const chars =
      Number.isFinite(Number(cuerpo.chars)) && Number(cuerpo.chars) > 0
        ? Number(cuerpo.chars)
        : Math.max(1200, Math.floor((perfil ? perfil.numCtx : 4096) * 3));
    const plan = planDeAutoCuracion({
      veredicto,
      salida,
      historial,
      presupuesto,
      charsDisponibles: chars,
      archivoFallo:
        typeof cuerpo.archivo === "string" ? cuerpo.archivo : undefined,
    });
    return res.json({
      ok: true,
      veredicto,
      clasificacion,
      presupuesto,
      plan,
      reLectura: comandoDeRelecturaTodas(salida),
      charsPresupuesto: chars,
      ventanaUsada: perfil
        ? `${modelo} → num_ctx ${perfil.numCtx}${perfil.ctxRecortado ? " (topado por RAM)" : ""}`
        : "sin modelo: 4096 de referencia",
    });
  });
}

```

### server/routers/ecoTurno.ts (78 líneas)

```ts
/**
 * ecoTurno.ts · EL AVISO QUE SE DICE UNA VEZ POR DECISIÓN (v1.98.0)
 * =================================================================
 * El log de la sesión del 31/10 (v1.97.5) traía el mismo par de líneas repetidas
 * hasta veintitantas veces por turno:
 *
 *   · `Capacidad SIN VERIFICAR para "openrouter/auto"` → una por CADA request
 *     del ciclo (24 requests = 24 gritos por la misma decisión de la casa).
 *   · `Historial recortado: 25→24 … 30→24` → una por request con historial largo.
 *
 * Ninguna es una emergencia: son conducta normal del enrutador y del perfil de
 * historial. Un log que repite lo mismo 24 veces no informa, tapa: así fue
 * imposible ver el watchdog de 180 s que sí importaba.
 *
 * Este módulo es el dueño de esos dos avisos. No decide nada — solo redacta la
 * línea y la pasa por `ecoLog`, que la imprime la primera vez y luego la cuenta
 * en silencio (reconfirma a los 60 s o cada 20 repeticiones). La CLAVE es el
 * HECHO: otro modelo, otro mínimo o otro tope/perfil imprimen al instante, porque
 * eso sí es una novedad.
 *
 * El monolito no puede crecer por acá: las dos redacciones vivían adentro de
 * `server.ts` y se las llevó este archivo, que además deja el texto en un solo
 * lugar probable (`tests/ecoLog.test.ts` mide el agregado).
 */
import { crearEco, eco } from "../../src/engine/ecoLog";

const ecoTurno = crearEco();

const publicar = (clave: string, linea: string, tinte: "log" | "warn"): void => {
  const e = eco(ecoTurno, clave, linea);
  if (!e.linea) return;
  if (tinte === "warn") console.warn(e.linea);
  else console.log(e.linea);
};

/**
 * El modelo no está en ninguna familia conocida: se le sirve el juego mínimo de
 * herramientas en vez de cero. Se dice una vez por (modelo, tamaño del mínimo).
 */
export function avisarCapacidadSinVerificar(modelName: string, minimo: number): void {
  const nombre = modelName || "(sin nombre)";
  publicar(
    `capacidad:${nombre}:${minimo}`,
    `[CerebroNico] 🧪 Capacidad SIN VERIFICAR para "${nombre}": no está en ninguna ` +
      `familia conocida. Se sirve el juego mínimo (${minimo} herramientas: hueso de obra + externas) ` +
      `en vez de cero. Si este modelo soporta function-calling, decláralo en TOOL_CAPABLE_ALLOWLIST o ` +
      `CLOUD_TOOL_FAMILIES (src/engine/modelTiers.ts) para darle el catálogo completo.` +
      (/^openrouter\//i.test(nombre)
        ? ` Los enrutadores de OpenRouter son incógnita por definición: si querés function-calling ahí, CN_RUTER_CON_HERRAMIENTAS=1 (bajo tu responsabilidad).`
        : ""),
    "warn",
  );
}

/**
 * Recorte de historial: tope + presupuesto del perfil. Se dice una vez por
 * (tope, tier). Con resumen el recorte CONDENSA, sin resumen conserva recientes.
 */
export function avisarRecorteDeHistorial(d: {
  crudos: number;
  finales: number;
  tope: number;
  presupuesto: number;
  tier: string;
  condensados?: number | null;
}): void {
  const condensa = typeof d.condensados === "number";
  publicar(
    `historial:${d.tope}:${d.tier}`,
    `[CerebroNico] Historial recortado: ${d.crudos} mensajes → ${d.finales} (tope ${d.tope} y ` +
      `presupuesto ${d.presupuesto} chars del perfil «${d.tier}»). ` +
      (condensa
        ? `Los ${d.condensados} más antiguos se CONDENSARON en un resumen (memoria de tareas largas), no se perdieron.`
        : `Se conservan los más recientes.`),
    "log",
  );
}

```

### server/routers/embedderCerebro.ts (526 líneas)

```ts
/**
 * embedderCerebro.ts — EL EMBEDDER DEL CEREBRO, RESUELTO POR RESIDENCIA (v1.98.0)
 * ==============================================================================
 * EL DEFECTO QUE CIERRA (log de Mario, 31/10, una línea por turno):
 *   🧠 cerebro: fallback por palabra (tiempo-excedido: el embedder pasó la ventana de 5000 ms)
 * La pestaña Puertos decía por qué: en el disco del usuario viven
 * `snowflake-arctic-embed:22m` y `all-minilm:22m`, y el código pedía
 * `embeddinggemma`. Pedir lo que no está descargado no es un 404 barato: es una
 * carga desde adentro de la ventana de 5 s, y como al expirar se tiraba todo el
 * trabajo, la deuda nunca bajaba. Cinco segundos muertos por turno, para siempre.
 *
 * ESTE MÓDULO ES EL CABLE, NO EL MOTOR:
 *   · lee qué tiene Ollama (`/api/tags`) y qué está cargado (`/api/ps`, con la
 *     muestra de 5 s que ya tiene `ollamaBajoConsumo`) y le pasa las listas a
 *     `embedderResidencia`, que es la que decide (pura, probada en seco);
 *   · cachea la decisión 30 s — no se le pregunta a Ollama en cada turno — y si
 *     Ollama no responde, se queda con la última decisión buena antes que con
 *     ninguna;
 *   · si NO hay embedder, falla YA: devolver el motivo sin gastar la ventana
 *     es la diferencia entre «un turno honesto por palabra» y «cinco segundos
 *     de nada».
 *
 * Y EXPONE lo que antes sólo se veía si uno leía el código: `GET
 * /api/cerebro/embedder` responde qué modelo se usa, por qué, cuántas entradas
 * tienen vector y qué hizo la última pasada de calentamiento. `POST
 * .../calentar` corre una pasada a pedido (el botón del panel).
 *
 * MONTAJE: el monolito importa, monta y usa `cerebroEmbedder.embed`. La lógica
 * vive acá y la decisión en el motor, por el trinquete de `contrato-rutas.json`.
 */
import type express from "express";
import type { Request, Response } from "express";
import { embedCerebroLocal } from "../../src/engine/embedderLocal";
import {
  resolverEmbedder,
  EMBEDDER_RECOMENDADO,
  MAX_CUERPOS_POR_PASADA,
  POR_LOTE_POR_DEFECTO,
  type ResolucionEmbedder,
  type Tamanos,
} from "../../src/engine/embedderResidencia";
import { declaradosDesde } from "../../src/engine/aduanaModelos"; // v2.3.2 · CN_EMBEDS_EXTRA / CN_CHAT_EXTRA
import { calentarVectores, estadoCalentamiento, estadoVectores, type ResultadoCalentado } from "../../src/engine/cerebroOrgano";
import { clavesVectores, aprender, cargarIndice } from "../../src/engine/cerebroOrgano";
import { reflejoDeSemilla, type SemillaEntrada } from "../../src/engine/cerebroSemilla";
// v1.99.5 · EL ARRAIGO: el plano dice qué plantar y con qué asiento; acá se lee el disco y se
// escribe por la única puerta que existe (`aprender`).
import { planDeArraigo, sentarseEnIndice, resumenDeArraigo, type RaizSemilla } from "../../src/engine/arraigo";
import { HEMISFERIO_IZQUIERDO, HEMISFERIO_DERECHO } from "../../src/engine/hemisferios";
import { IDE_BRAND } from "../../src/constants";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { sondearOllamaPs } from "../ollamaBajoConsumo";
// v2.3.4 · cuando `/api/tags` no contesta (recorre 40+ manifiestos y uno pesa 62 GB),
// se pregunta por el modelo concreto con `/api/show`: 2,4 s medidos frente a 12-37 s.
import { sondearEmbedderDirecto } from "../../src/engine/sondeoEmbedderDirecto";

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_EMBEDDER_CEREBRO = ["GET /api/cerebro/embedder", "POST /api/cerebro/embedder/calentar"] as const;

/** Cada cuánto se le vuelve a preguntar a Ollama qué tiene descargado. */
export const TTL_RESOLUCION_MS = 30_000;
/**
 * Cuánto espera el sondeo de `/api/tags` antes de declarar «no sé».
 *
 * v2.3.3 · ESTABA EN 12.000 Y ERA EL DEFECTO, no la red de seguridad. Medido en
 * esta máquina (8/11): `GET /api/tags` responde **HTTP 200 en 21,5 s** con 40+
 * modelos en el almacén. El motor cortaba a los 12 s, el sondeo devolvía
 * `leyenda: "fallo"`, y el panel pintaba «sin embedder · sin-medir» con
 * `snowflake-arctic-embed:33m` **presente en el disco** (verificado: el tag `33m`
 * existe en `~/.ollama/models/manifests/.../snowflake-arctic-embed/`).
 *
 * El mensaje era honesto («NO se puede afirmar que falte un modelo») pero inútil:
 * el reflejo quedaba en 0% por un timeout, no por falta de modelo. 30 s cubre el
 * caso medido con margen; `CN_EMBED_TAGS_TIMEOUT_MS` permite ajustarlo sin
 * recompilar (un almacén más grande o un disco lento pueden necesitar más).
 */
const TIMEOUT_TAGS_MS = Math.max(
  1_000,
  Math.floor(Number(process.env.CN_EMBED_TAGS_TIMEOUT_MS ?? 30_000) || 30_000),
);

export interface DepsResolutor {
  /** URL base de Ollama (OLLAMA_HOST, sin barra final). */
  ollamaUrl: string;
  /** Raíz de datos del cerebro (donde vive `vectores.json`) — el HEMISFERIO DERECHO. */
  raizDatos: string;
  /**
   * v1.99.5 · la instalación — el HEMISFERIO IZQUIERDO (`server.ts`, `src/engine`, `cerebro.md`,
   * los manuales). Sin ella el reflejo tenía una sola raíz y buscaba el código del agente dentro
   * de `C:\Cerebronico`: devolvía `nada` para piezas que están adelante del usuario, que es el
   * defecto contrario al que vine a curar. Default: el cwd, como `raizApp` en los otros routers.
   */
  raizApp?: string;
  /** Inyectables para probar el cable EN SECO (sin Ollama en la máquina que testea). */
  fetchImpl?: typeof fetch;
  ahora?: () => number;
  /** `CN_EMBED_MODEL`: la voluntad del usuario manda mientras exista en disco. */
  preferido?: string;
  /** v2.3.2 · `CN_EMBED_TECHO_MB` (0 = sin techo). Inyectable para probar. */
  techoMb?: number;
  /** v2.3.2 · `CN_EMBEDS_EXTRA` / `CN_CHAT_EXTRA`, sin parsear (coma o espacio). */
  embedsExtra?: string;
  chatExtra?: string;
  /** `CN_EMBED_STRICT=1`: acatar el preferido aunque Ollama no lo muestre. */
  estricto?: boolean;
  /**
   * v1.99.0 · `CN_EMBED_KEEP_ALIVE_MS`: cuánto deja Ollama al embedder en RAM después
   * de cada tanda. No se hereda del `OLLAMA_KEEP_ALIVE` del lanzador porque ese escalón
   * es del modelo de chat: prestado, deja vectorizando en tandas que se enfrían entre
   * lote y lote (medido en la sesión del 31/10: «Nada residente · Ollama: 0.0 GB»).
   */
  keepAliveMs?: number;
}

export interface EstadoEmbedder {
  ok: true;
  modelo: string | null;
  fuente: ResolucionEmbedder["fuente"];
  motivo: string;
  recomendado: string;
  instalados: number;
  cargados: string[];
  /** v1.99.0 · el escalón de residencia que el IDE pide para SU embedder (ms). */
  residenteMs: number;
  candidatos: ResolucionEmbedder["candidatos"];
  cerebro: { entradas: number; conVector: number; deuda: number };
  /**
   * v1.99.4 · `luz / deuda / nada` por pieza del mapa de hemisferios. La barra de arriba
   * dice "cuántos vectores hay"; ésta dice "cuántas piezas del cerebro se reflejan de
   * verdad", y por eso la NADA tiene su propio numero: sin él, un cerebro con `cerebro/`
   * vacio puede pintar una barra llena.
   */
  reflejo?: { entradas: number; eje: boolean; luz: number; deuda: number; nada: number; cobertura: string; reflejo: string };
  calentamiento: ReturnType<typeof estadoCalentamiento>;
}

export interface ResolutorEmbedder {
  /** La función que el turno le pasa a `enrutarHibrido` como `embed`. */
  embed: (textos: string[], senal?: AbortSignal) => Promise<Array<number[] | null>>;
  /** El cable de segunda fila para `enrutarHibrido` (`alCalentar`). Nunca espera. */
  alCalentar: (cuerpos: string[]) => void;
  /** Pasada de calentamiento a pedido (el botón / la orden del turno). */
  calentar: (cuerpos?: string[], opciones?: { maxCuerpos?: number; arraigar?: boolean }) => Promise<ResultadoCalentado>;
  /**
   * v1.99.5 · resumen del último arraigo (vacío si todavía nadie lo pidió). Se expone para que el
   * panel pueda decir QUÉ entró, en vez de dejar que el usuario infiera por qué subió el número.
   */
  arraigo: () => string;
  /** Qué se resolvió y cómo va el índice (lo que consume el panel). */
  estado: () => Promise<EstadoEmbedder>;
  /** Última decisión conocida, sin sondear (para logs y avisos síncronos). */
  resolucion: () => ResolucionEmbedder | null;
}

/**
 * Monta el resolutor. Se instancia UNA vez en el server y se comparte: el
 * calentador tiene una valla de reentrancia y dos calentadores con dos
 * instancias se pisarían el `vectores.json`.
 */
export function montarResolutorEmbedder(deps: DepsResolutor): ResolutorEmbedder {
  const base = String(deps.ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ahora = deps.ahora ?? (() => Date.now());
  const preferido = String(deps.preferido ?? process.env.CN_EMBED_MODEL ?? "").trim();
  // v1.99.0 · el embedder NO hereda el escalón del chat. `OLLAMA_KEEP_ALIVE=5m` del
  // lanzador está pensado para el modelo de conversación; para vectorizar en tandas
  // eso significa enfriarse entre lote y lote y volver a pagar la carga dentro de la
  // ventana corta (medido: «Nada residente · Ollama: 0.0 GB» tanda tras tanda).
  // 2 minutos cubren una pasada completa y liberan RAM antes del siguiente turno.
  const keepAliveMs = Math.max(0, Math.floor(Number(deps.keepAliveMs ?? process.env.CN_EMBED_KEEP_ALIVE_MS ?? 120_000) || 0));
  const estricto = deps.estricto ?? /^(1|true|si|sí)$/i.test(String(process.env.CN_EMBED_STRICT ?? "").trim());
  /**
   * v2.3.2 · `CN_EMBED_TECHO_MB`: a partir de este peso, el vectorizador se
   * considera caro para segundo plano. NO es `RAM_LIMITADA_GB` (esa palabra vale
   * "equipo de 8 GB" y el del usuario tiene 16): lo que se acota acá es el costo de
   * tener un modelo de embeddings residente mientras TODO el chat va a la nube.
   * 200 MB deja pasar a snowflake (67) y all-minilm (45-67) y frena a
   * qwen3-embedding (639) y a embeddinggemma (621), que es justo el cambio que el
   * usuario pidió con "usaría el embedding en segundo plano ya que consume poco".
   */
  const techoMb = Math.max(0, Math.floor(Number(deps.techoMb ?? process.env.CN_EMBED_TECHO_MB ?? 200) || 0));

  let ultima: ResolucionEmbedder | null = null;
  /** Lo que ya se dijo en consola (v2.3.2): se cuenta una vez por estado. */
  let ultimaClaveAviso = "";
  let cargadosCache: string[] = [];
  let instaladosCache = 0;
  let hasta = 0;
  // La caída de Ollama NO puede convertir cada turno en cinco segundos de nada:
  // si el sondeo falla, la ventana de re-intento se acorta a la mitad para
  // recoverear rápido, pero la decisión vieja sigue vigente mientras tanto.
  let reintentarEn = hasta - TTL_RESOLUCION_MS;

  // v2.2.8 · ANTES devolvia [] en los DOS casos: lista vacia Y sondeo fallido
  // (`catch { return [] }`). El resolutor no podia distinguirlos y afirmaba
  // "no esta descargado y no hay ningun otro" con cinco embedders instalados.
  /**
   * v2.3.2 · además de los nombres se guarda `size` (bytes), que `/api/tags`
   * siempre mandó y este archivo siempre tiró. Sin el número no existía forma de
   * preferir «el más chico que sirve»: el orden era solo reputación de familia, y
   * en el equipo del usuario eso mandaba a la RAM un vectorizador de 639 MB
   * teniendo uno de 67 MB exactamente al lado.
   */
  async function sondearTags(): Promise<{ modelos: string[]; tamanos: Tamanos; leyenda: "ok" | "fallo" }> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_TAGS_MS);
      try {
        const r = await fetchImpl(`${base}/api/tags`, { signal: ctrl.signal });
        if (!r.ok) return { modelos: [], tamanos: {}, leyenda: "fallo" };  // 500/404: "no se", no "no hay"
        const j: any = await r.json().catch(() => null);
        if (!j || !Array.isArray(j.models)) return { modelos: [], tamanos: {}, leyenda: "fallo" };
        const lista: string[] = [];
        const tamanos: Tamanos = {};
        // Sin tope ni `slice`: la lista entra COMPLETA. La valla congela que N
        // nombres adentro de la respuesta son N nombres afuera (el «49 vs 42» del
        // log quedó explicado por fecha de las dos listas, no por un recorte — pero
        // si algún día alguien pone un límite, esto se pone rojo).
        for (const m of j.models) {
          const nombre = String(m?.name || m?.model || "").trim();
          if (!nombre) continue;
          lista.push(nombre);
          const sz = Number(m?.size);
          if (Number.isFinite(sz) && sz > 0) tamanos[nombre] = sz;
        }
        return { modelos: lista, tamanos, leyenda: "ok" };
      } finally {
        clearTimeout(t);
      }
    } catch {
      return { modelos: [], tamanos: {}, leyenda: "fallo" };  // abort o rechazo: NO afirma ausencia
    }
  }

  async function resolverAhora(forzar = false): Promise<ResolucionEmbedder> {
    const t = ahora();
    if (!forzar && ultima && t < hasta) return ultima;
    if (!forzar && ultima && t < reintentarEn) return ultima;
    const [lectura, ps] = await Promise.all([
      sondearTags(),
      sondearOllamaPs({ ollamaUrl: base, fetchImpl }).catch(() => ({ vivo: false, modelos: [], residenteMb: 0, muestreadoEn: t } as any)),
    ]);
    const cargados = (ps?.modelos || []).map((m: any) => String(m?.name || "").trim()).filter(Boolean);
    const instalados = lectura.modelos;
    if (lectura.leyenda === "fallo") {
      // v2.3.4 · EL ARREGLO DE RAÍZ. `/api/tags` recorre TODOS los manifiestos del
      // almacén para calcular capacidades; con 40+ modelos y uno de 62,4 GB tarda
      // 12-37 s y a veces devuelve 500 (log del 8/11). Subir el timeout sólo hace
      // esperar medio minuto para decir lo mismo. La pregunta del embedder es UNA:
      // «¿existe este modelo?». Se responde con `/api/show` sobre el nombre exacto,
      // que NO recorre el almacén (2,4 s medidos).
      const aPreguntar = [preferido, EMBEDDER_RECOMENDADO].filter(Boolean) as string[];
      const directo = aPreguntar.length > 0
        ? await sondearEmbedderDirecto({ baseUrl: base, candidatos: aPreguntar, fetchImpl })
        : { existentes: [] as string[], tamanos: {} as Tamanos, leyenda: "fallo" as const, preguntados: 0, contestados: 0 };
      if (directo.existentes.length > 0) {
        // El modelo ESTÁ. Se resuelve con lo verificado, sin inventar el resto del
        // almacén: `instalados` lleva sólo lo que `/api/show` confirmó.
        const res = resolverEmbedder({
          instalados: directo.existentes,
          cargados,
          preferido,
          estricto,
          lectura: "ok",
          declarados: declaradosDesde(
            String(deps.embedsExtra ?? process.env.CN_EMBEDS_EXTRA ?? ""),
            String(deps.chatExtra ?? process.env.CN_CHAT_EXTRA ?? ""),
          ),
          tamanos: directo.tamanos,
          techoMb,
        });
        ultima = res;
        cargadosCache = cargados;
        instaladosCache = directo.existentes.length;
        hasta = ahora() + TTL_RESOLUCION_MS;
        reintentarEn = hasta;
        const clave = `${res.modelo || "∅"}|${res.fuente}|directo`;
        if (clave !== ultimaClaveAviso) {
          ultimaClaveAviso = clave;
          console.log(`[CerebroNico] 🧲 embedder del cerebro: «${res.modelo}» (${res.fuente}, por /api/show — /api/tags no contestó) — ${res.motivo}`);
        }
        return res;
      }
      // Ni el listado ni la pregunta directa: ahora SÍ no se puede afirmar nada.
      if (ultima?.modelo) {
        reintentarEn = ahora() + Math.max(1000, Math.floor(TTL_RESOLUCION_MS / 4));
        return ultima;
      }
      return {
        modelo: null,
        fuente: "sin-medir" as const,
        motivo:
          "no se pudo leer " + base + "/api/tags en " + TIMEOUT_TAGS_MS + " ms, y /api/show tampoco contestó por " +
          (aPreguntar.length > 0 ? aPreguntar.join(", ") : "ningún candidato") +
          ": NO se puede afirmar que falte un modelo de embeddings (preferido: " + (preferido || "ninguno") + ")",
        candidatos: [],
      };
    }
    if (instalados.length === 0 && ultima?.modelo) {
      // Ollama no respondió: NO se borra la decisión buena — se reintenta más tarde.
      reintentarEn = ahora() + Math.floor(TTL_RESOLUCION_MS / 2);
      return ultima;
    }
    const res = resolverEmbedder({
      instalados,
      cargados,
      preferido,
      estricto,
      lectura: lectura.leyenda,
      // v2.3.2 · la palabra del usuario y el costo medido. `CN_EMBEDS_EXTRA` es lo
      // único que puede decir que `L1_arctic:latest` es un embedder: renombrado,
      // ningún regex del mundo lo reconoce, y adivinarlo sería peor (el día que ese
      // alias sea un chat, la aduana miente sola).
      declarados: declaradosDesde(
        String(deps.embedsExtra ?? process.env.CN_EMBEDS_EXTRA ?? ""),
        String(deps.chatExtra ?? process.env.CN_CHAT_EXTRA ?? ""),
      ),
      tamanos: lectura.tamanos,
      techoMb,
    });
    ultima = res;
    cargadosCache = cargados;
    instaladosCache = instalados.length;
    hasta = ahora() + TTL_RESOLUCION_MS;
    reintentarEn = hasta;
    // v2.3.2 · se avisa por CAMBIO de estado, no por lectura. En el log real del
    // 3/11 la MISMA línea («⚠ sin embedder: «snowflake-arctic-embed:33m» no está
    // descargado…») aparecía ocho veces en una sesión: el TTL de 30 s caducaba y
    // cada re-lectura volvía a contar lo mismo. No era un fallo repetido: era un
    // aviso repetido, y en cantidad suficiente se lee como «todo está roto».
    const clave = `${res.modelo || "∅"}|${res.fuente}`;
    if (clave !== ultimaClaveAviso) {
      ultimaClaveAviso = clave;
      if (res.modelo) console.log(`[CerebroNico] 🧲 embedder del cerebro: «${res.modelo}» (${res.fuente}) — ${res.motivo}`);
      else console.log(`[CerebroNico] ⚠ sin embedder: ${res.motivo}`);
    }
    return res;
  }

  async function embed(textos: string[], senal?: AbortSignal): Promise<Array<number[] | null>> {
    const res = await resolverAhora();
    if (!res.modelo) {
      // Cero red, cero ventana: el motivo llega ya. `conTimeout` lo reporta como
      // error (no como tiempo-excedido), que es la verdad: no esperó a nadie.
      throw new Error(res.motivo);
    }
    return embedCerebroLocal(textos, senal, { baseUrl: base, modelo: res.modelo, fetchImpl, keepAliveMs });
  }

  async function calentar(
    cuerpos?: string[],
    opciones: { maxCuerpos?: number; arraigar?: boolean } = {},
  ): Promise<ResultadoCalentado> {
    // v1.99.5 · el botón del panel ENRAÍZA y después calienta, en ese orden: primero entran las
    // piezas al índice (si no están), después se vectorizan. El calentado tardío del arranque
    // llama SIN la bandera: escribir en la memoria del usuario sin que nadie lo pida no es
    // automatismo, es atrevimiento — y en una máquina de 8 GB además le roba el arranque.
    if (opciones.arraigar) arraigar();
    return calentarVectores(deps.raizDatos, {
      embed,
      cuerpos,
      maxCuerpos: opciones.maxCuerpos ?? MAX_CUERPOS_POR_PASADA,
      porLote: POR_LOTE_POR_DEFECTO,
    });
  }

  // ── EL ARRAIGO (v1.99.5) ─────────────────────────────────────────────────
  // La instalación: donde vive el HEMISFERIO IZQUIERDO del mapa.
  const raizApp = String(deps.raizApp || "").trim() || process.cwd();

  /** ¿La pieza está en SU mitad? NTFS ignora el caso y el mapa declara nombres leídos. */
  function existeEn(raiz: RaizSemilla, rel: string): boolean {
    const abs = join(raiz === "app" ? raizApp : deps.raizDatos, rel);
    try {
      if (existsSync(abs)) return true;
      // `guardarIndice` escribe `CEREBRO.md` y el mapa dice `cerebro.md`: en Windows es el mismo
      // archivo y contarlo como ausencia sería mentir por una mayúscula.
      const objetivo = basename(rel).toLowerCase();
      for (const f of readdirSync(dirname(abs))) if (String(f).toLowerCase() === objetivo) return true;
      return false;
    } catch {
      return false;
    }
  }

  /** El material del plan: las dos mitades del mapa + lo que el usuario escribió en el disco. */
  function material() {
    const lineasDe = (raiz: RaizSemilla, rel: string): string[] => {
      try {
        const abs = join(raiz === "app" ? raizApp : deps.raizDatos, rel);
        return existsSync(abs) ? readFileSync(abs, "utf-8").split(/\r?\n/) : [];
      } catch {
        return []; // ilegible = no entra. El plan prefiere medir menos a inventar.
      }
    };
    return {
      // LA MISMA semilla de versión para el plano y para la medición: el texto del eje la lleva
      // adentro, y texto distinto es huella distinta — un eje plantado que el reflejo no
      // reconocería sería deuda eterna con aspecto de memoria fresca.
      version: IDE_BRAND.SEMVER,
      izquierdo: HEMISFERIO_IZQUIERDO.piezas,
      derecho: HEMISFERIO_DERECHO.piezas,
      lecciones: lineasDe("datos", "LECCIONES.md"),
      rutas: lineasDe("app", "RUTAS-DEL-SISTEMA.md"),
    };
  }

  let ultimoArraigo = "";

  /**
   * Planta el mapa en el índice por la única puerta que hay (`aprender`: si la pieza ya está por
   * tema+titulo, refuerza; no duplica). Nunca lanza: el botón no puede tumbar el server.
   */
  function arraigar(): string {
    try {
      const plan = planDeArraigo({ ...material(), existe: (rel, raiz) => existeEn(raiz, rel) });
      let plantadas = 0;
      for (const n of plan.nuevas) if (aprender(deps.raizDatos, n)) plantadas++;
      ultimoArraigo = resumenDeArraigo(plantadas, plan.omitidas);
      console.log(`[CerebroNico] 🌱 ${ultimoArraigo}`);
      return ultimoArraigo;
    } catch (e: any) {
      ultimoArraigo = `el arraigo no pudo escribir: ${String(e?.message || e)}`;
      return ultimoArraigo;
    }
  }

  function alCalentar(cuerpos: string[]): void {
    // Dispara y olvida: el turno ya tiene su respuesta por palabra. La valla de
    // reentrancia del calentador es lo que evita que dos turnos seguidos llamen
    // a Ollama a la vez en una máquina de 8 GB.
    void calentar(cuerpos).catch(() => { /* el calentador nunca es problema del turno */ });
  }

  /**
   * El reflejo del cerebro: QUÉ pieza del mapa tiene luz, cuál debe vector y cuál no existe.
   * Dos raíces, como dos hemisferios — el izquierdo se mide contra la instalación y el derecho
   * contra la raíz de datos, y lo decide `existe` mirando `entrada.raiz`, no el nombre de la
   * pieza (que se repite: `cerebro.md` vive de los dos lados a propósito).
   *
   * El asiento sale del ÍNDICE REAL, no de la fórmula: si la pieza ya estaba plantada con un
   * nombre histórico (alta vieja, con sello al azar), su vector vive ahí y mirar en otro lado
   * sería llamar «deuda» a algo que ya está luminoso.
   */
  function reflejoCerebro() {
    try {
      const plan = planDeArraigo({ ...material(), existe: (rel, raiz) => existeEn(raiz, rel) });
      const entradas = sentarseEnIndice(plan, cargarIndice(deps.raizDatos).entradas);
      const claves = clavesVectores(deps.raizDatos);
      const r = reflejoDeSemilla(entradas, claves, (rel, e) => existeEn(e?.raiz || "datos", rel));
      return { entradas: r.entradas, eje: r.eje, luz: r.luz, deuda: r.deuda, nada: r.nada, cobertura: r.cobertura, reflejo: r.reflejo };
    } catch {
      return undefined; // el estado del embedder no puede caerse por un espejo
    }
  }

  async function estado(): Promise<EstadoEmbedder> {
    const res = await resolverAhora();
    return {
      ok: true,
      modelo: res.modelo,
      fuente: res.fuente,
      motivo: res.motivo,
      recomendado: EMBEDDER_RECOMENDADO,
      residenteMs: keepAliveMs,
      instalados: instaladosCache,
      cargados: cargadosCache,
      candidatos: res.candidatos.slice(0, 6),
      cerebro: estadoVectores(deps.raizDatos),
      reflejo: reflejoCerebro(),
      calentamiento: estadoCalentamiento(),
    };
  }

  return { embed, alCalentar, calentar, arraigo: () => ultimoArraigo, estado, resolucion: () => ultima };
}

/** Monta las dos rutas del embedder sobre el resolutor ya instalado. */
export function registrarEmbedderCerebro(
  app: express.Express,
  deps: { resolutor: ResolutorEmbedder; retrasoCalentadoMs?: number }
): void {
  // v1.98.0 · el índice se termina solo, sin que ningún turno lo pida: una pasada
  // tardía (20 s por defecto) deja el vector lista para el turno siguiente. Se
  // dispara con `setTimeout` para no robarle ni un milisegundo al arranque, que ya
  // carga packs, puertos y abordajes. `unref` para que nunca mantenga vivo el proceso.
  const retraso = deps.retrasoCalentadoMs;
  if (typeof retraso === "number" && retraso >= 0) {
    const alarma = setTimeout(() => {
      void deps.resolutor
        .calentar()
        .then((r) => {
          if (r.vectorizados > 0 || r.aviso) console.log(`[CerebroNico] 🔥 calentado de vectores: ${r.vectorizados} vectorizado(s), ${r.lotes} lote(s)${r.aviso ? ` — ${r.aviso}` : ""}`);
        })
        .catch(() => { /* el calentado jamás es culpa del arranque */ });
    }, retraso);
    if (typeof alarma?.unref === "function") alarma.unref();
  }

  /** Qué embedder usa el cerebro, por qué, y cuánto índice falta vectorizar. */
  app.get("/api/cerebro/embedder", async (_req: Request, res: Response) => {
    try {
      return res.json(await deps.resolutor.estado());
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Pasada de calentamiento AHORA (el botón del panel). Nunca lanza: informa. */
  app.post("/api/cerebro/embedder/calentar", async (req: Request, res: Response) => {
    try {
      const maxCuerpos = Number.isFinite(Number(req.body?.maxCuerpos)) && Number(req.body?.maxCuerpos) > 0
        ? Math.min(500, Number(req.body?.maxCuerpos))
        : undefined;
      // v1.99.5 · el clic en «Calentar vectores ahora» también enraíza: si el cerebro está vacío,
      // calentar no tiene qué calentar. El resultado se devuelve en el cuerpo para que el panel
      // pueda nombrar qué entró en vez de dejar un número subiendo sin explicación.
      const r = await deps.resolutor.calentar(undefined, { maxCuerpos, arraigar: true });
      return res.json({ ok: true, calentamiento: r, arraigo: deps.resolutor.arraigo(), estado: await deps.resolutor.estado() });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}

```

### server/routers/enjambre.ts (376 líneas)

```ts
/**
 * enjambre.ts — ROUTER DE LA RESPUESTA ECLÉCTICA (v1.80.0)
 * ========================================================
 * QUÉ ES: las dos rutas del enjambre.
 *
 *   GET  /api/enjambre/estado     qué se puede hacer hoy (capacidades, proveedores
 *                                 que el motor sabe llamar, criterio en uso)
 *   POST /api/enjambre/consultar  UN prompt → varias voces en paralelo → evaluación
 *                                 de cada respuesta → veredicto final de la tarea
 *   POST /api/enjambre/evaluar    las respuestas YA existen (las produjo el chat o el
 *                                 orquestador de planes): solo evaluar y sentenciar
 *
 * POR QUÉ ACÁ y no en `server.ts`: el trinquete del contrato (`contrato-rutas.json`)
 * dice que el monolito se parte, no se crece. El registro en el monolito son DOS
 * líneas (import + llamada), y el cable completo vive aquí.
 *
 * QUIÉN DECIDE QUÉ: el criterio es puro (`src/engine/enjambreEclectico.ts`), las
 * llamadas son este archivo más `server/enjambreLlamadas.ts`. Si mañana el juez
 * cambia de modelo, el criterio y sus pruebas no se tocan.
 *
 * SEGURIDAD: misma puerta que las rutas mutantes del cerebro (loopback o token,
 * `sandboxAuthorized`). Las claves entran por el cuerpo desde el navegador del
 * usuario y NO se guardan: no se escriben en disco, no se loguean, no viajan en
 * la respuesta.
 */
import type express from "express";
import type { Request, Response } from "express";
import {
  armarEnjambre,
  armarPromptConMemoria,
  evaluarRespuesta,
  informeEclectico,
  medirConsenso,
  medirBucleRepeticion,
  sustanciaDeInforme,
  parsearVeredictoJuez,
  promptDelJuez,
  CRITERIO_POR_DEFECTO,
  MEMORIA_MAX_TURNOS,
  MEMORIA_CHARS_POR_TURNO,
  ADJUNTOS_MAX_IMAGENES,
  veredictoMedido,
  veredictoNinguno,
  revisarVeredictoDelEnjambre,
  tareaPideEjecucion,
  SISTEMA_EJECUTOR,
  promptDeEjecucion,
  bloqueDeObra,
  type VozPlana,
  type TurnoMemoria,
  type AdjuntoPlano,
} from "../../src/engine/enjambreEclectico";
import { llamarJuez, llamarVoces, ejecutarTareaConHerramientas, puedeEjecutar, PROVEEDORES_CONOCIDOS, type CredencialesEnjambre, type ResultadoEjecucion } from "../enjambreLlamadas";

export interface DepsEnjambre {
  /** Loopback o token: la misma puerta de las rutas mutantes del cerebro. */
  sandboxAuthorized: (req: Request) => boolean;
  /** El motor de capacidades, para respetar el interruptor del panel. */
  features?: { isOn(id: any): boolean } | null;
  /** URL de Ollama por defecto (la misma del resto del servidor). */
  ollamaUrl?: string;
  /**
   * v1.88.0 · LA FASE 2: el ejecutor real del IDE. Sin esto inyectado el enjambre
   * sigue deliberando igual, pero declara que no pudo ejecutar — no lo finge.
   */
  ejecutor?: { ejecutarHerramienta: (nombre: string, args: any) => Promise<string>; herramientas: any[] } | null;
}

/** Lo que el informe necesita de la fase 2: el resultado + si se intentó. */
type EjecucionInforme = ResultadoEjecucion & { intentado: boolean; ejecutor?: string };

/** Las rutas del dominio: se comprueban, no se decoran. */
export const RUTAS_ENJAMBRE = ["GET /api/enjambre/estado", "POST /api/enjambre/consultar", "POST /api/enjambre/evaluar"] as const;

interface CuerpoConsulta {
  /** v2.3.6 · ranura de voz: modelos que el usuario eligió que hablen. */
  vocesFijas?: Array<{ provider: string; modelId: string; name?: string }>;
  tarea?: string;
  voces?: Array<{ provider?: string; modelId?: string; name?: string }>;
  tieneClave?: Record<string, boolean>;
  actual?: { provider?: string; modelId?: string } | null;
  juez?: { provider?: string; modelId?: string } | null;
  incluirLocales?: boolean;
  maximas?: number;
  credenciales?: CredencialesEnjambre;
  /** v1.84.5 · memoria de la sesión y archivos del mensaje actual. */
  historial?: TurnoMemoria[];
  adjuntos?: Array<{ nombre?: string; tipo?: string; esImagen?: boolean; base64?: string }>;
}

/** Deja las credenciales listas para llamar, sin dejar rastro de ellas. */
function normalizarCredenciales(cuerpo: CuerpoConsulta, ollamaPorDefecto?: string): CredencialesEnjambre {
  const c = cuerpo.credenciales || {};
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.keys || {})) {
    if (typeof v === "string" && v.trim()) keys[k] = v.trim();
  }
  return {
    ollamaUrl: String(c.ollamaUrl || ollamaPorDefecto || "http://127.0.0.1:11434"),
    keys,
    customUrl: String(c.customUrl || "").trim(),
    customKey: String(c.customKey || "").trim(),
  };
}

export function registrarEnjambre(app: express.Express, deps: DepsEnjambre): void {
  /** El estado: qué sabe hacer el enjambre hoy, sin prometer lo que no puede. */
  app.get("/api/enjambre/estado", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      capacidad: {
        eclectico: deps.features ? deps.features.isOn("consejo_eclectico") : false,
        relevo: deps.features ? deps.features.isOn("auto_relay") : false,
      },
      proveedores: PROVEEDORES_CONOCIDOS,
      criterio: CRITERIO_POR_DEFECTO,
    });
  });

  /** UN prompt, varias voces, evaluación y veredicto. */
  app.post("/api/enjambre/consultar", async (req: Request, res: Response) => {
    // Guarda explícita (la cuenta el contrato): loopback o token, como las mutantes.
    if (!deps.sandboxAuthorized(req)) {
      return res.status(403).json({ ok: false, error: "El enjambre solo responde a esta máquina (loopback o token)." });
    }
    const cuerpo: CuerpoConsulta = req.body || {};
    const tarea = String(cuerpo.tarea || "").trim();
    if (!tarea) return res.status(400).json({ ok: false, error: "Falta la tarea: sin prompt no hay enjambre." });

    const candidatos: VozPlana[] = (cuerpo.voces || [])
      .filter((v) => v && v.provider && v.modelId)
      .map((v) => ({ provider: String(v.provider), modelId: String(v.modelId), name: v.name ? String(v.name) : undefined }));
    const actual = cuerpo.actual && cuerpo.actual.modelId
      ? { provider: String(cuerpo.actual.provider || ""), modelId: String(cuerpo.actual.modelId) }
      : null;

    // v2.3.6 · la ranura de voz del usuario (los modelos que él elige que hablen).
    const fijadas = (Array.isArray(cuerpo.vocesFijas) ? cuerpo.vocesFijas : [])
      .filter((v: any) => v && typeof v.provider === "string" && typeof v.modelId === "string")
      .map((v: any) => ({ provider: String(v.provider), modelId: String(v.modelId), name: v.name ? String(v.name) : undefined }));

    const armado = armarEnjambre(candidatos, cuerpo.tieneClave || {}, {
      maximas: Number.isFinite(Number(cuerpo.maximas)) ? Number(cuerpo.maximas) : CRITERIO_POR_DEFECTO.maximas,
      incluirLocales: cuerpo.incluirLocales === true,
      actual,
      vocesFijas: fijadas,
    });
    if (armado.voces.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Ninguna voz pasó la aduana: cargá modelos en ⭐ Favoritos o en la ranura de tu API unificada.",
        descartes: armado.descartes,
      });
    }

    const cred = normalizarCredenciales(cuerpo, deps.ollamaUrl);
    // v1.84.5 · MEMORIA E IMÁGENES DEL TURNO (Mario, sesión 1793074563435:
    // «se olvidan de lo de 2 o 3 mensajes atrás y no pueden usar las imágenes»).
    // El cliente manda `historial` (turnos previos, ya comprimidos por la
    // vista: los informes eclécticos viajan como resumen+veredicto) y
    // `adjuntos` (imágenes del MENSAJE ACTUAL en base64 puro). El prompt con
    // memoria es lo que ven las voces y el juez; el INFORME sigue citando la
    // tarea cruda, no el pegamento. Sin historial ni adjuntos, prompt === tarea.
    const historialPlano = (Array.isArray(cuerpo.historial) ? cuerpo.historial : [])
      .filter((t: any) => t && (t.rol === "user" || t.rol === "assistant") && String(t.texto || "").trim())
      .slice(-MEMORIA_MAX_TURNOS)
      .map((t: any) => ({ rol: String(t.rol), texto: String(t.texto).slice(0, MEMORIA_CHARS_POR_TURNO * 2) }));
    const adjuntosPlanos = (Array.isArray(cuerpo.adjuntos) ? cuerpo.adjuntos : [])
      .filter((a: any) => a && String(a.nombre || "").trim())
      .slice(0, 12)
      .map((a: any) => ({
        nombre: String(a.nombre).slice(0, 120),
        tipo: String(a.tipo || "desconocido").slice(0, 60),
        esImagen: a.esImagen === true || /^image\//i.test(String(a.tipo || "")),
        base64: typeof a.base64 === "string" && a.base64.length > 32 && a.base64.length <= 4_500_000 ? a.base64 : undefined,
      }));
    const conMemoria = armarPromptConMemoria({ tarea, historial: historialPlano, adjuntos: adjuntosPlanos });
    // v1.86.1 → v1.86.2 · ANTI-BUCLE. Antes se miraba nomás el vecino inmediato;
    // la sesión 1793133418292 repitió CUATRO turnos seguidos el mismo veredicto y
    // el detector no lo nombraba. Ahora viaja la lista COMPLETA de veredictos
    // recordados, en orden cronológico (índice 0 = el primer mensaje).
    const recordadosVeredictos = historialPlano
      .filter((t: any) => t.rol === "assistant")
      .map((t: any) => String(t.texto || ""));
    const anteriorVeredicto = recordadosVeredictos[recordadosVeredictos.length - 1];
    // El juez lee la tarea SOLA y la memoria en su propio bloque (v1.86.2): mezclar
    //las dos en un mismo «TAREA SOLICITADA» fue lo que lo hacía integrar el primer
    // mensaje de la sesión en vez del turno actual.
    const memoriaJuez = [
      conMemoria.memoria,
      adjuntosPlanos.length ? `Archivos del mensaje actual: ${adjuntosPlanos.map((a: any) => a.nombre).join(", ")}` : "",
    ].filter(Boolean).join("\n");
    const medir = (v: { resumen?: string; veredicto?: string }) =>
      medirBucleRepeticion(recordadosVeredictos, `${v.resumen || ""}\n${v.veredicto || ""}`);
    const imagenesVoces = adjuntosPlanos
      .filter((a) => a.esImagen && a.base64)
      .slice(0, ADJUNTOS_MAX_IMAGENES)
      .map((a) => ({ mimeType: a.tipo, base64: a.base64 as string }));
    const respuestas = await llamarVoces(
      armado.voces.map((v) => ({ provider: v.provider, model: v.modelId })),
      conMemoria.prompt,
      cred,
      { imagenes: imagenesVoces.length ? imagenesVoces : undefined }
    );
    const evaluadas = respuestas.map((r) => evaluarRespuesta(r));

    // El juez: el elegido por el usuario si pasó la aduana, si no, la voz más sólida.
    let veredicto = veredictoMedido(evaluadas, respuestas);
    let juezUsado: VozPlana | null = null;
    let reempuje = 0;
    const juezPedido = cuerpo.juez && cuerpo.juez.modelId
      ? { provider: String(cuerpo.juez.provider || ""), modelId: String(cuerpo.juez.modelId) }
      : null;
    if (veredicto.mejorVoz && juezPedido && juezPedido.provider) {
      juezUsado = juezPedido;
      const rJuez = await llamarJuez(
          { provider: juezPedido.provider, model: juezPedido.modelId },
          // El juez también lee la memoria del turno (texto: los píxeles ya los
          // vieron las voces; el juez falla menos y gasta menos cuota en texto).
          promptDelJuez(conMemoria.prompt, respuestas, { anteriorVeredicto, memoria: memoriaJuez }),
          cred
        );
      const parseado = rJuez.ok ? parsearVeredictoJuez(rJuez.texto) : null;
      if (parseado) {
        veredicto = parseado;
      } else if (rJuez.ok && rJuez.texto.trim()) {
        // El juez escribió prosa en vez de JSON: se usa como resumen, pero el
        // acuerdo sigue MEDIDO. No se le firma una confianza que no declaró.
        const medido = medirConsenso(evaluadas, respuestas);
        veredicto = {
          ...veredicto,
          resumen: rJuez.texto.trim().slice(0, 4000),
          veredicto: rJuez.texto.trim().slice(0, 4000),
          confianza: medido.acuerdo,
          origen: "medido",
        };
      }
      // Si el juez no contestó, veredicto conserva el consenso medido (honesto).

      // v1.86.2 · RE-EMPUJE 1/1: si la firma mide repetición contra la memoria, se
      // le pide UNA integración nueva nombrando qué repitió. Igual que el
      // `auditoriaBucle` del chat: se avisa, se empuja una vez, y si sigue se
      // declara. No se queda en la alarma.
      const primerDiagnostico = medir(veredicto);
      if (primerDiagnostico.bucle && parseado) {
        reempuje = 1;
        const repetido = sustanciaDeInforme(recordadosVeredictos[primerDiagnostico.turnoRepetido - 1] || "");
        const rReempuje = await llamarJuez(
          { provider: juezPedido.provider, model: juezPedido.modelId },
          promptDelJuez(conMemoria.prompt, respuestas, {
            anteriorVeredicto,
            memoria: memoriaJuez,
            correccionBucle:
              `Tu firma anterior repitió el turno ${primerDiagnostico.turnoRepetido} de ${primerDiagnostico.comparados} recordados ` +
              `(similitud ${Math.round(primerDiagnostico.similitud * 100)} %). Esto ya está dicho:\n«${repetido.slice(0, 400)}»`,
          }),
          cred
        );
        const corregido = rReempuje.ok ? parsearVeredictoJuez(rReempuje.texto) : null;
        // Solo se cambia la firma si REALMENTE deja de repetir: un re-empuje que
        // devuelve lo mismo no puede reemplazar nada (sería tirar cuota y fingir avance).
        if (corregido && !medir(corregido).bucle) {
          veredicto = { ...corregido, origen: "juez" };
        }
      }
    }

    // v1.86.5 · la certeza llega al enjambre: el veredicto se revisa ANTES de
    // firmar el informe (y antes de medir el bucle sobre él). El enjambre generó
    // texto, no ejecutó ni leyó: la evidencia es vacía y toda afirmación sin
    // respaldo se reescribe a su alternativa honesta («pendiente de ejecutar»).
    const certezaDelTurno = revisarVeredictoDelEnjambre(veredicto);
    veredicto = certezaDelTurno.veredicto;

    // v1.88.0 · FASE 2 — EL VEREDICTO EJECUTA (sesión 1793219578712: el enjambre
    // devolvía «fs_write …» en un bloque de código y nadie lo corría). Solo se
    // ejecuta cuando la tarea PIDE obra (no una pregunta) y hay una voz que sepa
    // usar herramientas. La elección es la más sólida de las que pueden ejecutar.
    const requiereEjecucion = tareaPideEjecucion(tarea);
    let ejecucion: EjecucionInforme | null = null;
    if (requiereEjecucion) {
      const orden = respuestas
        .map((r, i) => ({ r, puntaje: evaluadas[i]?.puntaje ?? 0 }))
        .filter((x) => x.r.ok && String(x.r.texto || "").trim() && puedeEjecutar(x.r.provider))
        .sort((a, b) => b.puntaje - a.puntaje)[0];
      const vacio = { intentado: true, ok: false, texto: "", pasos: [], vueltas: 0, proveedor: "", modelo: "" };
      if (!deps.ejecutor) {
        ejecucion = { ...vacio, error: "el IDE no inyectó el ejecutor de herramientas" };
      } else if (!orden) {
        ejecucion = { ...vacio, error: "ninguna voz con herramientas contestó (Gemini usa otro contrato de tool calling: probá OpenAI, Groq, OpenRouter, Mistral, DeepSeek o un modelo local de Ollama)" };
      } else {
        const r = await ejecutarTareaConHerramientas({
          provider: orden.r.provider, model: orden.r.model,
          sistema: SISTEMA_EJECUTOR, usuario: promptDeEjecucion(tarea, veredicto.veredicto),
          cred, herramientas: deps.ejecutor.herramientas, ejecutarHerramienta: deps.ejecutor.ejecutarHerramienta,
        });
        ejecucion = { ...r, intentado: true, ejecutor: `${r.proveedor}/${r.modelo}` };
      }
    }

    const diagnosticoBucle = medir(veredicto);
    const informeFase1 = informeEclectico({
      tarea,
      respuestas,
      evaluadas,
      veredicto,
      juez: juezUsado,
      motivoArmado: armado.motivo,
      notaMemoria: conMemoria.nota || undefined,
      anteriorVeredicto: anteriorVeredicto || undefined,
      recordadosVeredictos,
      reempuje: reempuje || undefined,
    });
    const informe = ejecucion ? `${informeFase1}\n\n${bloqueDeObra(ejecucion)}` : informeFase1;

    return res.json({
      ok: true,
      informe,
      // v1.88.0 · la fase 2 viaja como DATO: la interfaz puede pintarla aparte.
      requiereEjecucion,
      ejecucion,
      voces: respuestas.map((r, i) => ({ provider: r.provider, model: r.model, ok: r.ok, error: r.error, ms: Math.round(r.ms), puntaje: evaluadas[i]?.puntaje ?? 0, etiquetas: evaluadas[i]?.etiquetas ?? [], reintentada: r.reintentada === true })),
      veredicto,
      acuerdo: medirConsenso(evaluadas, respuestas).acuerdo,
      respondieron: medirConsenso(evaluadas, respuestas).respondieron,
      descartes: armado.descartes,
      motivo: armado.motivo,
      respaldo: armado.respaldo,
      porDebajoDelMinimo: armado.porDebajoDelMinimo,
      // v1.86.2 · la interfaz puede ver la medición sin parsear el informe.
      bucle: { ...diagnosticoBucle, reempuje },
      // v1.86.5 · la certeza del turno viaja como DATO (igual que el `done` del
      // chat), no como párrafo: la interfaz puede señalarlo sin escribir de más.
      certeza: certezaDelTurno.certeza,
      afirmacionesSinEvidencia: certezaDelTurno.avisos.length > 0,
    });
  });

  /** El orquestador ya tiene las respuestas: acá se evalúan y se sentencian. */
  app.post("/api/enjambre/evaluar", async (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) {
      return res.status(403).json({ ok: false, error: "El enjambre solo responde a esta máquina (loopback o token)." });
    }
    const cuerpo = (req.body || {}) as { tarea?: string; respuestas?: any[] };
    const tarea = String(cuerpo.tarea || "").trim();
    const respuestas = (cuerpo.respuestas || [])
      .filter((r) => r && r.model)
      .map((r) => ({
        provider: String(r.provider || "desconocido"),
        model: String(r.model || ""),
        ok: r.ok !== false && String(r.texto || "").trim().length > 0,
        texto: String(r.texto || ""),
        error: r.error ? String(r.error) : undefined,
        ms: Number(r.ms) || 0,
      }));
    if (!tarea) return res.status(400).json({ ok: false, error: "Falta la tarea." });
    if (respuestas.length === 0) return res.status(400).json({ ok: false, error: "No llegó ninguna respuesta que evaluar." });

    const evaluadas = respuestas.map((r) => evaluarRespuesta(r));
    // v1.86.5 · misma regla que /consultar: el veredicto pasa por el revisor de
    // certeza antes de firmarse. Sin ejecución ni lectura, certeza `sin_verificar`.
    const certezaDelTurno = revisarVeredictoDelEnjambre(veredictoMedido(evaluadas, respuestas));
    const veredicto = certezaDelTurno.veredicto;
    const informe = informeEclectico({ tarea, respuestas, evaluadas, veredicto, motivoArmado: "Respuestas trayidas por el orquestador: no se llamó a nadie, solo se evaluó." });
    return res.json({
      ok: true,
      informe,
      veredicto,
      evaluadas,
      acuerdo: medirConsenso(evaluadas, respuestas).acuerdo,
      certeza: certezaDelTurno.certeza,
      afirmacionesSinEvidencia: certezaDelTurno.avisos.length > 0,
    });
  });
}

```

### server/routers/espejosServidor.ts (55 líneas)

```ts
/**
 * espejosServidor.ts — ROUTER DE ESPEJOS POR SERVIDOR DE DATOS (v1.15.1)
 * =======================================================================
 * QUÉ ES: expone el catálogo de «espejos por servidor» (relacional, documental,
 * clave-valor, grafo, vectorial, series, colas, objetos, búsqueda, realtime)
 * como rutas HTTP reales.
 *
 * POR QUÉ EXISTE: el motor `src/engine/reflejo/espejosServidor.ts` existía y
 * estaba testado (espejosServidor.test.ts), pero NADIE lo llamaba: era un
 * módulo huérfano. Aquí se enchufa como router, siguiendo el patrón de la Fase 2
 * (se extrae a `server/routers/` y no se hace crecer el monolito inline).
 *
 * RUTAS (todas de solo lectura / ejecución determinista):
 *   GET  /api/espejos-servidor                 → estado completo del catálogo
 *   GET  /api/espejos-servidor/categoria/:id   → espejos de una categoría
 *   POST /api/espejos-servidor/seleccionar     → elige el experto más adecuado
 *   POST /api/espejos-servidor/ejecutar        → ejecuta un espejo por id
 */
import type express from "express";
import {
  estadoEspejosServidor,
  seleccionarExperto,
  ejecutarEspejoServidor,
  espejosDeCategoria,
  categoriaServidorValida,
} from "../../src/engine/reflejo/espejosServidor";

export function registrarEspejosServidor(app: express.Express): void {
  // Catálogo completo: también lo consume el lado FastAPI desde el export.
  app.get("/api/espejos-servidor", (_req, res) => {
    res.json(estadoEspejosServidor());
  });

  // Espejos de una categoría concreta (relacional, grafo, vectorial, …).
  app.get("/api/espejos-servidor/categoria/:id", (req, res) => {
    const categoria = String(req.params.id || "");
    if (!categoriaServidorValida(categoria)) {
      res.status(404).json({ ok: false, motivo: `categoría «${categoria}» desconocida.` });
      return;
    }
    res.json({ ok: true, categoria, espejos: espejosDeCategoria(categoria) });
  });

  // Selección AUTOMÁTICA del experto más adecuado para una consulta en texto.
  app.post("/api/espejos-servidor/seleccionar", (req, res) => {
    res.json(seleccionarExperto(req.body?.texto));
  });

  // Ejecuta un espejo por id (sql, mongo, redis, …) con sus datos.
  app.post("/api/espejos-servidor/ejecutar", (req, res) => {
    const { id, datos } = req.body ?? {};
    res.json(ejecutarEspejoServidor(String(id ?? ""), datos));
  });
}

```

### server/routers/estadoPacksMcp.ts (83 líneas)

```ts
/**
 * estadoPacksMcp.ts — EL INVENTARIO DE HERRAMIENTAS, AUDITABLE EN VIVO (v1.0.28)
 * ===========================================================================
 *
 * POR QUÉ SE EXTRAE (y no se añade al monolito): `server.ts` está bajo
 * presupuesto de líneas (`contrato-rutas.json`) y ese presupuesto es un
 * trinquete DELIBERADO: la casa parte, no engorda. Las dos rutas de aquí ya
 * existían o nacen con esta versión, y su cuerpo depende solo de lo que se le
 * inyecta — ninguna lee una variable global del monolito.
 *
 * LO QUE RESUELVE: hasta v1.0.27 `GET /api/tools/packs/estado` solo miró los
 * packs HTTP. Un `mcp_servers.json` que no arrancaba nada era invisible ahí, así
 * que «el modelo no usa la red» se leía como un problema del modelo. Ahora la
 * misma ruta dice, con nombre y motivo, qué servidor MCP está en línea, cuál
 * falló, cuál está apagado por configuración y cuál se descartó por estar mal
 * escrito.
 *
 * DECISIONES:
 *   · La respuesta SIEMPRE trae `mcp` (aunque esté vacío). Un campo que aparece
 *     solo cuando hay servidores hace que el cliente tenga que distinguir «no
 *     hay» de «no me lo contaron».
 *   · `POST /api/mcp/recargar` cierra los procesos vivos antes de releer: sin
 *     eso, encender una entrada y recargar dejaría el proceso viejo huérfano.
 */
import type { Request, Response } from "express";

export interface DepsEstadoPacksMcp {
  /** Packs HTTP ya cargados: id, url, si llevan token, y sus nombres. */
  packsHttp: () => Array<{ id: string; url: string; autenticado: boolean; herramientas: string[] }>;
  reintentosUsados: () => number;
  reintentoMax: () => number;
  /** Estado del último intento de carga de servidores MCP. */
  estadoMcp: () => {
    cargados: Record<string, number>;
    fallidos: string[];
    apagados: string[];
    descartados: Array<{ id: string; motivo: string }>;
  } | null;
  /** Nombres de los servidores MCP vivos ahora mismo. */
  mcpVivos: () => string[];
  /** Recarga completa de los servidores MCP. */
  recargarMcp: () => Promise<{
    cargados: Record<string, number>;
    fallidos: string[];
    apagados: string[];
    descartados: Array<{ id: string; motivo: string }>;
  }>;
}

/**
 * Monta las dos rutas en la app. `app` es `any` a propósito: el router no
 * depende de los tipos de Express (en la máquina del agente no hay
 * `node_modules`, y una suite tiene que poder importar esto igual).
 */
export function registrarEstadoPacksMcp(app: any, deps: DepsEstadoPacksMcp): void {
  app.get("/api/tools/packs/estado", (_req: Request, res: Response) => {
    const estado = deps.estadoMcp();
    const mcp = {
      vivos: deps.mcpVivos(),
      cargados: estado?.cargados || {},
      fallidos: estado?.fallidos || [],
      apagados: estado?.apagados || [],
      descartados: estado?.descartados || [],
    };
    return res.json({
      ok: true,
      packs: deps.packsHttp(),
      mcp,
      reintentos_usados: deps.reintentosUsados(),
      reintento_max: deps.reintentoMax(),
    });
  });

  app.post("/api/mcp/recargar", async (_req: Request, res: Response) => {
    try {
      const r = await deps.recargarMcp();
      return res.json({ ok: true, ...r, vivos: deps.mcpVivos() });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  });
}

```

### server/routers/estadoSandbox.ts (336 líneas)

```ts
/**
 * estadoSandbox.ts — /api/SANDBOX/STATUS FUERA DEL MONOLITO (v1.0.24)
 * ====================================================================
 * QUÉ ES: el parte del sandbox —¿está el :3500 arriba?, ¿qué raíz se está
 * sirviendo?, ¿qué proyecto se reconoció y con qué plan se arranca?— más las
 * tres detecciones que lo acompañan (proyecto anidado, aduana de marcadores y
 * web estática sin package.json).
 *
 * POR QUÉ SALIÓ, Y NO ENTRÓ COMO PARCHE
 * -------------------------------------
 * Era la TERCERA ruta del log (server.ts:8219) con `ERR_HTTP_HEADERS_SENT`: el
 * sondeo del :3500 vencía el plazo de /api, el middleware contestaba 504 y este
 * `res.json()` volvía a escribir sobre el socket. La cura es `abrirFicha`, una
 * línea; pero el archivo donde vivía tiene techo declarado y la casa vigila que
 * no engorde. Así que se mudó la ruta ENTERA con sus cinco ayudantes, y el
 * monolito se quedó con una línea de delegación. El comportamiento es el mismo:
 * no se quitó ni una detección, ni un campo del parte.
 */
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { abrirFicha } from "../../src/engine/fichaUnica";
import { reconocerCarpeta, lineaReconocimiento } from "../../src/engine/sandboxCompat";

export interface DepsEstadoSandbox {
  /** Raíz de datos del sandbox (.proyectos). */
  raizProyecto: string;
  /** Puerto del sandbox servido (:3500). */
  puertoSandbox: number;
  /** ¿Hay un proceso de sandbox vivo? */
  sandboxVivo: () => boolean;
  /** La misma puerta que usa el monolito para estas rutas. */
  autorizado: (req: Request) => boolean;
  /** Sondeo de puerto con plazo. */
  puertoArriba: (puerto: number, ms: number) => Promise<boolean>;
  /** La raíz que de verdad se sirve y se escribe (una sola verdad). */
  resolverRaizProyecto: () => any;
  /** ¿Los node_modules de esa raíz están sanos (no podados)? */
  nodeModulesSano: (raiz: string) => boolean;
}

/** ADUANA v2: ¿esta carpeta (por nombres) es un proyecto reconocible? */
function esCarpetaProyecto(nombres: string[]): boolean {
  const r = reconocerCarpeta(nombres);
  return !!r && r.peso >= 40; // desde "make" hacia arriba; docs/datos no secuestran la raíz
}

/** v2.1 — la copia más nueva del proyecto puede vivir DENTRO de la raíz. */
function buscarProyectoAnidado(raiz: string): string | null {
  const skip = new Set([
    "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
    "venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
  ]);
  const recorrer = (dir: string, prof: number): string | null => {
    if (prof > 5) return null;
    let entradas: fs.Dirent[] = [];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      // v8.0.5 — se ignora por LISTA (artefactos y control de versiones), no por
      // prefijo: el proyecto vive en `.proyectos` y descartar por punto lo hacía
      // invisible al aplanado.
      if (skip.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      // ADUANA v2: cualquier proyecto reconocible vale, no solo package.json.
      try {
        if (esCarpetaProyecto(fs.readdirSync(sub))) return sub;
      } catch {}
      const hit = recorrer(sub, prof + 1);
      if (hit) return hit;
    }
    return null;
  };
  return recorrer(raiz, 1);
}

export function registrarEstadoSandbox(app: any, deps: DepsEstadoSandbox): void {
  const RAIZ = deps.raizProyecto;
  app.get("/api/sandbox/status", async (req: Request, res: Response) => {
    if (!deps.autorizado(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const ficha = abrirFicha(res, "/api/sandbox/status");
    const online = await deps.puertoArriba(deps.puertoSandbox, 1500);
    return ficha.json({
      online,
      port: deps.puertoSandbox,
      running: deps.sandboxVivo(),
      // ------------------------------------------------------------
      // «1 archivo(s) escrito(s) en .proyectos/» es una frase que no permite
      // verificar nada: `.proyectos` es relativo y puede ser cualquier carpeta del
      // disco. Si ese archivo acaba en un sitio y el detector mira en otro, el
      // usuario sólo ve «no hay proyecto» y no tiene forma de comprobarlo.
      // Diciendo la ruta absoluta, un solo Sync resuelve la duda.
      raizSandbox: RAIZ,
      raizProyectoResuelta: deps.resolverRaizProyecto().raiz,
      // v2.1 — los node_modules pueden estar en la raíz resuelta, no en .proyectos
      // v1.6.24 — e «instalado» dejó de ser la existencia de la carpeta: con un
      // árbol podado el piloto se saltaba la instalación y el arranque moría.
      // El piloto lee este flag para decidir su `npm install` — que además ahora
      // viaja por GUARDA-ENOENT en /api/exec (ejecuta donde vive el package.json).
      installed: deps.nodeModulesSano(deps.resolverRaizProyecto().raiz),
      // ============================================================
      // 🐞 v2.0 — "No se encontró package.json en el sandbox tras sincronizar".
      // ------------------------------------------------------------
      // Causa real (caso reportado): el ZIP subido traía una carpeta contenedora,
      // así que el package.json EXISTÍA pero no en la raíz (.proyectos/). Antes se
      // miraba solo la raíz y el piloto automático se apagaba dando a entender que
      // el proyecto estaba mal, cuando solo estaba un nivel más adentro.
      // Ahora se busca por niveles (hasta 4) y se informa de dónde está.
      // ============================================================
      ...(() => {
        const skip = new Set(["node_modules", ".git", "dist", "dist_electron", "venv", "__pycache__", ".cerebro-db", ".vite"]);
        // ADUANA v2 (Reflejo v5): «proyecto» ya no es sinónimo de package.json.
        // Cualquier marcador del registro (requirements.txt, Cargo.toml, go.mod,
        // pom.xml, Dockerfile, index.html, Makefile…) cuenta, y el estado lo
        // dice por nombre. El campo `packageJsonCandidates` se conserva por
        // compatibilidad con el frontend: ahora trae cualquier raíz reconocida.
        const hayProyectoEn = (dir: string): boolean => {
          try {
            const nombres = fs.readdirSync(dir).filter((n) => {
              try { return fs.statSync(path.join(dir, n)).isFile(); } catch { return false; }
            });
            return esCarpetaProyecto(nombres);
          } catch {
            return false;
          }
        };
        if (hayProyectoEn(RAIZ)) {
          // v2.1 — Aunque la raíz YA tenga proyecto, hay que mirar dentro: el sync
          // escribe siempre el árbol anidado (el workspace guarda las rutas con su
          // carpeta contenedora), así que puede haber una copia más nueva sin
          // subir. Reportarla aquí es lo que permite que el autopiloto la fusione
          // en vez de dar por bueno un «src» viejo para siempre.
          const anid = buscarProyectoAnidado(RAIZ);
          return {
            hasProject: true,
            packageJsonCandidates: ["."],
            detectedProjectRoot: ".",
            paqueteAnidado: anid ? path.relative(RAIZ, anid).split(path.sep).join("/") : "",
          };
        }
        const found: string[] = [];
        const queue: Array<{ dir: string; rel: string; depth: number }> = [{ dir: RAIZ, rel: "", depth: 0 }];
        while (queue.length > 0 && found.length < 8) {
          const cur = queue.shift()!;
          if (hayProyectoEn(cur.dir)) {
            found.push(cur.rel || ".");
            continue; // no seguir bajando dentro de un proyecto encontrado
          }
          if (cur.depth >= 4) continue;
          let entries: string[] = [];
          try {
            entries = fs.readdirSync(cur.dir);
          } catch {
            continue;
          }
          for (const e of entries) {
            if (skip.has(e)) continue;
            const full = path.join(cur.dir, e);
            try {
              if (fs.statSync(full).isDirectory()) queue.push({ dir: full, rel: cur.rel ? `${cur.rel}/${e}` : e, depth: cur.depth + 1 });
            } catch {
              /* ilegible: se salta */
            }
          }
        }
        return {
          hasProject: false,
          packageJsonCandidates: found,
          detectedProjectRoot: found[0] || "",
          paqueteAnidado: found[0] || "",
        };
      })(),
      // ============================================================
      // v2.0 — PROYECTO ESTÁTICO = PROYECTO VÁLIDO
      // ------------------------------------------------------------
      // 🐞 El piloto automático se apagaba diciendo "No se encontró package.json"
      // cuando el proyecto era una web estática (index.html + css + js). Es una
      // web perfectamente válida: no necesita npm. Aquí se marca como proyecto y
      // /api/sandbox/start lo sirve con el servidor estático.
      //
      // v8.0.4 — 🐞 Y FALTABA JUSTO EL CASO DEL LOG REAL: el ANIDADO.
      // ------------------------------------------------------------
      // Esta comprobación miraba `index.html` SOLO en la raíz del sandbox. Pero el
      // sync escribe el árbol CON su carpeta contenedora (lo dice el propio log:
      // «1 archivo(s) escrito(s) en .proyectos/» mientras el workspace lista
      // «proyectos/index.html»). Así que lo normal es que la web acabe en
      // `.proyectos/<carpeta>/index.html`.
      //
      // Consecuencia encadenada, tal cual la vivió el usuario:
      //   hasProject=false → el piloto automático se rinde → «❌ No se encontró
      //   package.json» → el mensaje LE DICE AL MODELO que cree un package.json →
      //   el modelo obedece y empieza a montar un proyecto Node que no hacía falta.
      //   Una web estática perfectamente válida quedaba convertida en un error.
      //
      // Ahora, si no hay index.html en la raíz, se busca el más cercano en
      // subcarpetas (hasta 3 niveles) y se declara DÓNDE está.
      //
      // Nota deliberada: NO se saltan las carpetas que empiezan por punto. El motor
      // de este proyecto usa nombres como `.proyectos`, y saltárselos por reflejo
      // (como hace otro recorrido de este mismo archivo) es parte de por qué este
      // caso tardó tanto en verse.
      // ============================================================
      ...(() => {
        if (fs.existsSync(path.join(RAIZ, "package.json"))) {
          // ============================================================
          // v8.0.5 — 🐞 AVISO DE PROYECTO DUPLICADO (defecto de segundo orden)
          // ------------------------------------------------------------
          // Este caso no lo invento: lo enseñó el registro del usuario. Ante el
          // error «no hay proyecto en .proyectos», el modelo hizo lo razonable —
          // MOVER copias a la raíz: `.proyectos/package.json` + `.proyectos/index.js`.
          // El sandbox se calla y arranca… y a partir de ahí pasa algo peor:
          //
          //  · Ahora hay DOS proyectos en el mismo sitio: el de la raíz (que el
          //    sandbox ejecuta) y el de `mi-proyecto/` (donde el sync sigue
          //    escribiendo cada vez que el usuario edita).
          //  · El marcador de la raíz TIENE PRIORIDAD sobre el anidado, así que la
          //    web de verdad queda enterrada bajo el stub de la raíz.
          //  · El usuario edita, el sync escribe en `mi-proyecto/`, y el preview
          //    sigue mostrando la raíz vieja. «Arreglado y sigue igual», otra vez.
          //
          // Silenciar esto sería justo el fallo que este archivo está corrigiendo
          // una y otra vez: preferir no molestar antes que evitar la pérdida de
          // tiempo. Se detecta y se dice, en la misma línea del registro.
          // ============================================================
          const ignorar2 = new Set([
            "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
            "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
          ]);
          let webAnidada: string | null = null;
          const cola2: Array<{ dir: string; rel: string; prof: number }> = [{ dir: RAIZ, rel: "", prof: 0 }];
          while (cola2.length > 0 && !webAnidada) {
            const cur = cola2.shift()!;
            if (cur.prof >= 2) continue;
            let ents2: string[] = [];
            try {
              ents2 = fs.readdirSync(cur.dir);
            } catch {
              continue;
            }
            for (const e of ents2) {
              if (ignorar2.has(e)) continue;
              const full2 = path.join(cur.dir, e);
              let esDir2 = false;
              try {
                esDir2 = fs.statSync(full2).isDirectory();
              } catch {
                continue;
              }
              if (!esDir2) continue;
              const rel2 = cur.rel ? `${cur.rel}/${e}` : e;
              if (fs.existsSync(path.join(full2, "index.html"))) {
                webAnidada = rel2;
                break;
              }
              cola2.push({ dir: full2, rel: rel2, prof: cur.prof + 1 });
            }
          }
          if (webAnidada) {
            return {
              staticProject: false,
              avisoProyectoDuplicado:
                `Hay un package.json en la raíz del sandbox (${RAIZ}) y ADEMÁS una web en ` +
                `«${webAnidada}/». El sandbox arrancará el proyecto de la RAÍZ y la web anidada NO se verá: ` +
                `deja un solo proyecto en un solo sitio (o sube la web a la raíz y borra la subcarpeta, ` +
                `o quita el package.json de la raíz para que se sirva la web anidada).`,
            };
          }
          return { staticProject: false };
        }
        if (fs.existsSync(path.join(RAIZ, "index.html"))) {
          return { hasProject: true, staticProject: true, detectedProjectRoot: "." };
        }
        const ignorar = new Set([
          "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
          "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
        ]);
        const cola: Array<{ dir: string; rel: string; prof: number }> = [{ dir: RAIZ, rel: "", prof: 0 }];
        while (cola.length > 0) {
          const cur = cola.shift()!;
          if (cur.prof >= 3) continue;
          let ents: string[] = [];
          try {
            ents = fs.readdirSync(cur.dir);
          } catch {
            continue;
          }
          for (const e of ents) {
            if (ignorar.has(e)) continue;
            const full = path.join(cur.dir, e);
            let esDir = false;
            try {
              esDir = fs.statSync(full).isDirectory();
            } catch {
              continue;
            }
            if (!esDir) continue;
            const rel = cur.rel ? `${cur.rel}/${e}` : e;
            if (fs.existsSync(path.join(full, "index.html"))) {
              return {
                hasProject: true,
                staticProject: true,
                staticProjectAnidado: true,
                detectedProjectRoot: rel,
              };
            }
            cola.push({ dir: full, rel, prof: cur.prof + 1 });
          }
        }
        // Sin proyecto web: se devuelve, además, QUÉ hay en la raíz del sandbox.
        // Un «no hay proyecto» sin decir dónde se miró obliga al usuario (y al
        // modelo) a adivinar, que es exactamente lo que pasó en este log.
        let enRaiz: string[] = [];
        try {
          enRaiz = fs.readdirSync(RAIZ).slice(0, 25);
        } catch {
          enRaiz = [];
        }
        return { staticProject: false, buscadoEn: RAIZ, contenidoRaiz: enRaiz };
      })(),
      // ADUANA v2: QUÉ reconoció el sandbox, con nombre y plan de arranque.
      // El frontend viejo ignora el campo; el nuevo y el usuario pueden leer
      // «🐍 Python · marcador «requirements.txt» · se arranca por consola: …»
      // en vez del antiguo y mentiroso «no hay proyecto».
      proyectoReconocido: (() => {
        const rp = deps.resolverRaizProyecto();
        return rp.proyecto ? { ...rp.proyecto, linea: lineaReconocimiento(rp.proyecto) } : null;
      })(),
      root: RAIZ,
    });
  });
}

```

### server/routers/exportacion.ts (445 líneas)

```ts
/**
 * exportacion.ts — ROUTER DE EXPORTACIÓN (Fase 2 · tanda de exportación, v1.56.8)
 * ==============================================================================
 * QUÉ ES: el dominio `export` sale del monolito `server.ts` y añade la ruta que
 * faltaba. Las dos rutas previas (`/api/export/targets` y
 * `/api/export/android/prepare`) se mueven **tal cual**: la regla de la Fase 2 es
 * «se mueve, no se mejora», para que un cambio de archivo no sea una ocasión de
 * romper una respuesta que ya estaba contratada.
 *
 * POR QUÉ AQUÍ Y NO EN server.ts: el trinquete de `contrato-rutas.json` dice que
 * el monolito no puede crecer (la Fase 2 es partir, no añadir). Registrar por
 * delegación añade una línea en el monolito y le quita ~180. El contrato se
 * REGENERA con `node scripts/superficie.mjs` — no se edita a mano, porque un
 * contrato editable es un trinquete que se afloja solo.
 *
 * LA RUTA NUEVA (`POST /api/export/android/proyecto`): hasta hoy, exportar a
 * Android escribía `capacitor.config.json` y una guía de pasos cuyo paso 1 era
 * `npm install @capacitor/...`. Es decir: el IDE te explicaba cómo salir a buscar
 * Capacitor por internet, y ahí terminaba su trabajo. Esta ruta PRODUCE el
 * proyecto `android/` completo (delegate en `src/engine/androidProyecto.ts`), así
 * que el usuario abre Android Studio y pulsa Build → APK / AAB.
 *
 * ESTATUS HONESTO: el proyecto se GENERA aquí. Desde v1.56.9 también se COMPILA
 * aquí (`POST /api/export/android/build`) CUANDO la máquina tiene cómo: el endpoint
 * sondea wrapper/jar/gradle-del-sistema y, si no hay ruta legítima, lo dice con la
 * solución concreta en vez de lanzar un `gradlew` a ciegas. Un `GET` del trabajo
 * devuelve el log real y el fallo clasificado; el APK se entrega solo si existe en
 * disco y pesa lo que debe (`apkVerificado`). Ninguna respuesta de esta familia
 * finge haber compilado nada.
 */
import fs from "node:fs";
import path from "node:path";
// v1.56.9 · el botón exportar→APK: qué Gradle usar y cómo leer sus fallos vive en
// un módulo puro y probado (apkBuild.ts), no en este archivo.
import {
  rutaRelApkDebug,
  apkVerificado,
} from "../../src/engine/apkBuild";
import {
  sondearHerramientasAndroid as sondearMaquina,
  leerProyectoSandbox,
  lanzarCompilacionApk,
  buscarTrabajoApk,
} from "../fabricaApk"; // v1.57.17 · la fábrica compartida botón/chat
// v1.0.14 · «Preparar herramientas (una vez)»: el toolchain del APK lo baja la
// propia IDE a <raíz de datos>/.cerebronico/herramientas. Plan puro en
// src/engine/toolchainPlan.ts; acá solo el cable HTTP.
import {
  lanzarAprovisionamiento,
  estadoProvisionParaCliente,
  trabajoProvisionVivo,
  herramientasDirPorDefecto,
} from "../aprovisionarToolchain";
import { planDeAprovisionamiento, faltanHerramientas, rutasHerramientas, pesoTotal } from "../../src/engine/toolchainPlan";
import { spawnSync } from "node:child_process";
import type express from "express";
import type { Request, Response } from "express";
import {
  analizarProyecto,
  veredictoAndroid,
  pasosDeExportacion,
  configCapacitor,
  appIdValido,
  appIdDesdeNombre,
  PISO_ANDROID,
} from "../../src/engine/mobileExport";
import {
  generarProyectoAndroid,
  escribirProyectoAndroid,
  leerWebParaAndroid,
  huellaDelProyecto,
  orientacionValida,
  AGP_VERSION,
  GRADLE_VERSION,
} from "../../src/engine/androidProyecto";

export interface DepsExportacion {
  /** Raíz del proyecto del usuario (la misma que ve el sandbox). */
  projectRoot: string;
  /** El guard v1.7.0: las rutas que escriben en disco exigen autorización. */
  sandboxAuthorized: (req: Request) => boolean;
}

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_EXPORTACION = [
  "GET /api/export/targets",
  "POST /api/export/android/prepare",
  "POST /api/export/android/proyecto",
  "POST /api/export/android/build",
  "GET /api/export/android/build/:id",
  "GET /api/export/android/apk",
  // v1.0.14 · el clic que consigue el toolchain (antes el build morría en
  // «abrí Android Studio»; ahora la IDE baja JDK 17 + Gradle + SDK y reintenta).
  "POST /api/export/android/provision",
  "GET /api/export/android/provision",
] as const;

export function registrarExportacion(app: express.Express, deps: DepsExportacion): void {
  const PROJECT_ROOT = deps.projectRoot;

  // ─── movidos tal cual desde server.ts (v1.56.8, Fase 2) ────────────────────

  /** Sondeo REAL de la máquina: vive en server/fabricaApk.ts (v1.57.17) para que el botón y el chat midan con la misma cinta. */
  const sondearHerramientasAndroid = () => sondearMaquina(PROJECT_ROOT);

  /** Qué proyectos sabe leer el espacio de trabajo ahora mismo (misma lectura para rutas y herramienta). */
  const leerProyectoDelSandbox = () => leerProyectoSandbox(PROJECT_ROOT);

  app.get("/api/export/targets", (_req: Request, res: Response) => {
    const proyecto = leerProyectoDelSandbox();
    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    return res.json({
      ok: true,
      proyecto,
      maquina: herramientas,
      objetivos: [
        {
          id: "web",
          nombre: "Web (HTML+JS)",
          disponible: proyecto.comandoBuild !== null,
          detalle: `Se genera la carpeta «${proyecto.carpetaSalida}» con «${proyecto.comandoBuild || "—"}».`,
        },
        {
          id: "windows",
          nombre: "Windows x64 (instalador NSIS + portable)",
          disponible: true,
          detalle: "Se empaqueta el propio IDE con electron-builder: npm run dist.",
        },
        {
          id: "android",
          nombre: "Android — APK",
          disponible: android.puedeConstruir,
          detalle: android.puedeConstruir
            ? `Listo para construir. Mínimo admitido: ${PISO_ANDROID.version} (API ${PISO_ANDROID.api}).`
            : `No se puede todavía. Falta: ${android.faltan.join(" · ")}`,
        },
      ],
      android,
      piso: PISO_ANDROID,
    });
  });

  /**
   * Prepara el proyecto del sandbox para Android: escribe `capacitor.config.json`
   * y una guía con los pasos. NO ejecuta la instalación ni el build: eso son
   * comandos que cambian el proyecto del usuario y se hacen a la vista.
   */
  app.post("/api/export/android/prepare", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: escribe en la raíz del proyecto.
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const proyecto = leerProyectoDelSandbox();
    if (!proyecto.exportableAAndroid) {
      return res.status(400).json({ ok: false, error: proyecto.razon, proyecto });
    }

    const pedido = typeof req.body?.appId === "string" ? req.body.appId.trim() : "";
    const appId = pedido || appIdDesdeNombre(proyecto.nombre);
    if (!appIdValido(appId)) {
      return res.status(400).json({
        ok: false,
        error:
          `«${appId}» no sirve como appId de Android. Tiene que ser un dominio al revés, en minúsculas y sin empezar por número ` +
          `(ejemplo: com.tunombre.${proyecto.nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "app"}).`,
      });
    }

    const config = configCapacitor({ appId, nombreApp: proyecto.nombre, webDir: proyecto.carpetaSalida });
    const pasos = pasosDeExportacion(proyecto);
    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    const guia = [
      `# Exportar «${proyecto.nombre}» a Android`,
      ``,
      `Generado por CerebroNico IDE. **Esto no es CerebroNico en Android**: es TU app`,
      `empaquetada como APK. CerebroNico es la herramienta que la construye.`,
      ``,
      `## Requisitos en esta máquina`,
      ``,
      ...android.requisitos.map((r) => `- [${r.ok ? "x" : " "}] ${r.nombre} — encontrado: ${r.encontrado}${r.ok ? "" : `\n      → ${r.comoResolver}`}`),
      ``,
      `## Versión mínima de Android`,
      ``,
      `**${PISO_ANDROID.version} (API ${PISO_ANDROID.api})**. Cerrado en el archivo \`capacitor.config.json\` y en`,
      `el proyecto Android que se genere.`,
      ``,
      `${PISO_ANDROID.nota}`,
      ``,
      `Fuente: ${PISO_ANDROID.fuente}.`,
      ``,
      `## Pasos`,
      ``,
      ...pasos.map((p) => `${p.orden}. **${p.titulo}**\n   \`\`\`\n   ${p.comando}\n   \`\`\`\n   ${p.queHace}`),
      ``,
      `## Después`,
      ``,
      `- El APK queda en \`android/app/build/outputs/apk/debug/\`.`,
      `- Para publicar: \`gradlew.bat assembleRelease\` y **firmar** el APK. Sin firma, Android avisa al instalar.`,
      `- Cada vez que cambies la web: \`npm run build\` y luego \`npx cap sync android\`.`,
      ``,
      `## ¿Y sin Capacitor?`,
      ``,
      `La ruta POST /api/export/android/proyecto genera el proyecto \`android/\` completo`,
      `sin dependencias externas, para abrirlo en Android Studio y sacar APK o AAB.`,
      ``,
    ].join("\n");

    const escritos: string[] = [];
    try {
      const rutaConfig = path.join(PROJECT_ROOT, "capacitor.config.json");
      fs.writeFileSync(rutaConfig, config, "utf-8");
      escritos.push("capacitor.config.json");
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: `No se pudo escribir capacitor.config.json: ${e?.message || e}` });
    }
    try {
      fs.writeFileSync(path.join(PROJECT_ROOT, "GUIA-ANDROID.md"), guia, "utf-8");
      escritos.push("GUIA-ANDROID.md");
    } catch {}

    return res.json({
      ok: true,
      appId,
      webDir: proyecto.carpetaSalida,
      escritos,
      pasos,
      puedeConstruir: android.puedeConstruir,
      faltan: android.faltan,
      message: android.puedeConstruir
        ? `Preparado. Escritos: ${escritos.join(", ")}. La máquina tiene todo lo necesario para construir el APK.`
        : `Preparado. Escritos: ${escritos.join(", ")}. Pero todavía NO se puede construir: falta ${android.faltan.join(" · ")}.`,
    });
  });

  // ─── LA RUTA NUEVA: producir el proyecto Android, no solo explicar cómo ─────

  /**
   * Genera `android/` a partir de la web YA COMPILADA del proyecto del usuario.
   * Escribe en disco, así que lleva el guard de v1.7.0. No ejecuta Gradle ni
   * descarga nada: compilar el APK es acción del usuario, a la vista.
   */
  app.post("/api/export/android/proyecto", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });

    const proyecto = leerProyectoDelSandbox();
    if (!proyecto.exportableAAndroid) {
      return res.status(400).json({ ok: false, error: proyecto.razon, proyecto });
    }

    const cuerpo = req.body || {};
    const b = (k: string) => (typeof cuerpo[k] === "string" ? cuerpo[k].trim() : "");
    const pedido = b("appId");
    const appId = pedido || appIdDesdeNombre(proyecto.nombre);
    if (!appIdValido(appId)) {
      return res.status(400).json({
        ok: false,
        error:
          `«${appId}» no sirve como appId de Android: dominio al revés, en minúsculas, sin empezar por número ` +
          `(ejemplo: com.tunombre.${proyecto.nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "app"}).`,
      });
    }

    // La web tiene que estar COMPILADA. Generar el proyecto con la web anterior
    // daría un APK verde que empaqueta cosas viejas: se corta y se dice.
    const leido = leerWebParaAndroid(path.join(PROJECT_ROOT, proyecto.carpetaSalida));
    if (!leido.raiz) {
      return res.status(400).json({
        ok: false,
        error:
          `No encontré la carpeta de salida «${proyecto.carpetaSalida}». Compila la web antes de exportar` +
          (proyecto.comandoBuild ? ` («${proyecto.comandoBuild}»)` : "") +
          `. Sin esto el APK saldría con una versión anterior o en blanco.`,
        pista: leido.omitidos[0]?.motivo,
      });
    }
    if (!leido.texto.some((f) => f.ruta === "index.html")) {
      return res.status(400).json({
        ok: false,
        error: `«${proyecto.carpetaSalida}» no tiene index.html: el WebView abriría en blanco. Revisa la carpeta de salida del build.`,
        archivosVistos: leido.texto.length + leido.binarios.length,
      });
    }

    let gen;
    try {
      gen = generarProyectoAndroid({
        nombreApp: b("nombreApp") || proyecto.nombre,
        appId,
        versionName: b("versionName") || proyecto.version || "1.0.0",
        versionCode: Number.isInteger(Number(cuerpo.versionCode)) && Number(cuerpo.versionCode) > 0 ? Number(cuerpo.versionCode) : 1,
        colorPrimario: b("colorPrimario") || undefined,
        // `b()` devuelve string ancho: hay que ESTRECHARLO al tipo, no colárselo
        // tal cual (TS2322) ni fingir que una cadena cualquiera es una orientación.
        orientacion: orientacionValida(cuerpo.orientacion) ?? "portrait",
        necesitaRed: cuerpo.necesitaRed === true,
        archivosWeb: leido.texto,
        binariosWeb: leido.binarios,
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: `El generador falló: ${e?.message || e}` });
    }

    const forzar = cuerpo.forzar === true;
    const r = escribirProyectoAndroid(PROJECT_ROOT, gen, { forzar });

    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    return res.json({
      ok: true,
      appId: gen.appId,
      huella: huellaDelProyecto(gen),
      generados: r.escritos.length,
      omitidos: r.omitidos,
      // Un conflicto NO es un error: es una edición del usuario que no se pisó.
      conflictos: r.conflictos,
      assetsOmitidos: leido.omitidos,
      avisos: gen.avisos,
      mision: gen.mision,
      version: { agp: AGP_VERSION, gradle: GRADLE_VERSION },
      android: { puedeConstruir: android.puedeConstruir, faltan: android.faltan },
      message:
        `Proyecto Android generado en «${gen.carpeta}/» (${r.escritos.length} archivos, ` +
        `AGP ${AGP_VERSION} + Gradle ${GRADLE_VERSION}, minSdk ${gen.minSdk}). ` +
        `Ábrelo en Android Studio y construye el APK con ${gen.mision.apk} o el AAB con ${gen.mision.aab}. ` +
        (r.conflictos.length
          ? `NO se sobrescribieron ${r.conflictos.length} archivos que tenías editados (${r.conflictos.slice(0, 3).join(", ")}${r.conflictos.length > 3 ? "…" : ""}): repite con forzar=true si quieres reemplazarlos. `
          : "") +
        (leido.omitidos.length ? `Se dejaron fuera ${leido.omitidos.length} assets de la web (con su motivo). ` : "") +
        (android.puedeConstruir
          ? "Esta máquina ya tiene lo necesario para compilar: botón «Compilar APK»."
          : `Para COMPILAR todavía falta: ${android.faltan.join(" · ")}. Generar no es compilar: sin SDK, el APK se hace en tu Android Studio.`),
    });
  });

  // ─── v1.56.9 · COMPILAR EL APK DESDE LA IDE (el botón que faltaba) ──────────

  // v1.57.17 · el estado del trabajo de Gradle (interfaz TrabajoApk, UN trabajo vivo,
  // cola de 20, log acotado) se MUDÓ a server/fabricaApk.ts: el botón de la UI y la
  // herramienta del chat pelean ahora por el MISMO slot — dos Gradle simultáneos en una
  // máquina de 16 GB es una forma creativa de tumbar la IDE del usuario.

  // v1.0.14 · la carpeta de datos es la que fija server.ts; el router la deriva
  // con la MISMA convención que usa la fábrica (herramientasDirActiva).
  const dirHerramientas = () => herramientasDirPorDefecto(PROJECT_ROOT);

  /** Qué falta para compilar, MEDIDO (sondeos reales, no humo). */
  const faltanToolchainAhora = () => {
    const so = (process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux") as "win32" | "darwin" | "linux";
    const r = rutasHerramientas(dirHerramientas(), so);
    let java = false, gradleSistema = false;
    try { java = spawnSync("java", ["-version"], { encoding: "utf-8", timeout: 6000, windowsHide: true }).status === 0; } catch { java = false; }
    try { gradleSistema = spawnSync("gradle", ["-v"], { encoding: "utf-8", timeout: 6000, windowsHide: true }).status === 0; } catch { gradleSistema = false; }
    return faltanHerramientas(r, so, (p) => fs.existsSync(p), { sistemaJava: java, sistemaGradle: gradleSistema });
  };

  app.post("/api/export/android/build", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const r = lanzarCompilacionApk(PROJECT_ROOT, { herramientasDir: dirHerramientas() });
    if (r.yaEnMarcha && r.trabajo) {
      return res.json({
        ok: true, jobId: r.trabajo.id, yaEnMarcha: true,
        message: "Ya hay una compilación en marcha: este es su estado, no arranqué otra.",
      });
    }
    if (!r.ok) {
      // v1.0.14 · si no hay con qué compilar, el 400 ya NO manda a Android
      // Studio: ofrece el clic propio (`provision`) con el plan de pesos delante.
      const puedeAprovisionar = Object.values(faltanToolchainAhora()).some(Boolean);
      if (r.hechos) return res.status(400).json({ ok: false, error: r.error, hechos: r.hechos, puedeAprovisionar });
      return res.status(500).json({ ok: false, error: r.error, fallo: r.trabajo?.fallo, puedeAprovisionar });
    }
    return res.json({
      ok: true,
      jobId: r.trabajo!.id,
      rutaGradle: r.trabajo!.rutaGradle,
      message: `Compilación lanzada (${r.trabajo!.explicacionRuta}) La primera vez Gradle baja dependencias: entre 30 s y varios minutos según la conexión.`,
    });
  });

  // ─── v1.0.14 · PREPARAR HERRAMIENTAS (un clic, una vez) ────────────────────
  // POST lanza el plan (o devuelve el vivo); GET devuelve el progreso real.
  // El spawn de la descarga corre DENTRO del server con fs de la máquina del
  // usuario — como debe ser: el sandbox no tiene JDK ni red propia.
  app.post("/api/export/android/provision", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const forzar = (req.body && (req.body as any).forzar === true) || false;
    const r = lanzarAprovisionamiento({ herramientasDir: dirHerramientas(), projectRoot: PROJECT_ROOT, forzar });
    const t = r.trabajo;
    return res.json({
      ok: r.ok,
      yaEnMarcha: !!r.yaEnMarcha,
      estado: t?.estado,
      paso: t?.pasoActual,
      totalNota: t?.totalNota,
      message: t?.estado === "fallido"
        ? (t.fallo?.causa || "El aprovisionamiento falló.")
        : r.yaEnMarcha
          ? "Ya había un aprovisionamiento en marcha: siguiendo ése."
          : t && t.estado === "exito"
            ? "La máquina ya estaba completa: nada que bajar."
            : `Aprovisionando: ${pesoTotal(planDeAprovisionamiento(faltanToolchainAhora(), (process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux") as "win32" | "darwin" | "linux"))}. Mirá el progreso con GET /api/export/android/provision.`,
    });
  });

  app.get("/api/export/android/provision", (_req: Request, res: Response) => {
    const e = estadoProvisionParaCliente();
    return res.json({ ...e, vivo: !!trabajoProvisionVivo() });
  });

  app.get("/api/export/android/build/:id", (req: Request, res: Response) => {
    const t = buscarTrabajoApk(String(req.params.id));
    if (!t) return res.status(404).json({ ok: false, error: "Ese trabajo de compilación no existe (¿reinició la IDE?). Volvé a lanzar." });
    return res.json({
      ok: true,
      id: t.id,
      estado: t.estado,
      segundos: Math.round(((t.fin || Date.now()) - t.inicio) / 1000),
      codigo: t.codigo,
      fallo: t.fallo || null,
      apk: t.apk ? { bytes: t.apk.bytes } : null,
      lineaFinal: t.lineas.length ? t.lineas[t.lineas.length - 1] : "",
      log: t.lineas.slice(-120),
    });
  });

  app.get("/api/export/android/apk", (_req: Request, res: Response) => {
    const rutaApk = path.join(PROJECT_ROOT, rutaRelApkDebug("android"));
    let st;
    try {
      st = fs.statSync(rutaApk);
    } catch {
      return res.status(404).json({
        ok: false,
        error: "Todavía no hay APK en android/app/build/outputs/apk/debug/. Compilá primero; no entrego un archivo que no existe.",
      });
    }
    const verif = apkVerificado(true, st.size);
    if (!verif.ok) return res.status(404).json({ ok: false, error: verif.mensaje });
    return res.download(rutaApk, "CerebroNico-app-debug.apk");
  });
}

```
