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

