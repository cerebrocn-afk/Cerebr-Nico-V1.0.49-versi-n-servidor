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
