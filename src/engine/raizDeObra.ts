/**
 * raizDeObra.ts — v1.90.0 · UNA RAÍZ, UN ESPEJO
 * =============================================
 * LA CAUSA RAÍZ (sesión 1793231473406, mensaje 29 del usuario: «recordatorio md.
 * apps y web se escriben en el editor del árbol, así su código es visible»):
 * `resolveSafePath` resolvía TODA escritura relativa contra `PROJECT_ROOT`, la
 * carpeta de datos del IDE. Pero el preview puede servir otra carpeta — la que
 * el usuario fija por CANAL DIRECTO, que suele estar FUERA de esa raíz
 * (`C:\Users\…\Documents\cerebro fotos`). Con esas dos mitades el lazo queda
 * sin salida posible:
 *
 *   · escribe `index.html` a secas  → cae en la raíz del IDE. El usuario ve
 *     «quedó escrito en la raíz de CerebroNico» y el sandbox muestra otra cosa.
 *   · intenta la ruta absoluta de la carpeta → «Ruta fuera del proyecto
 *     no permitida». Y el modelo, sin tercera opción, REPITE: eso es la tanda
 *     de ✗ rojos y el «se queda trancado pensando sin hacer nada».
 *
 * LA REGLA QUE ACÁ SE ESCRIBE: cuando hay una carpeta vinculada, LA OBRA
 * (app, web, documentos) se escribe dentro de esa carpeta, que es la que el
 * árbol del Editor web muestra y el sandbox sirve en :3500. Lo que NO es obra
 * —órganos del IDE: memoria, trazas, logs, espejos, `.creador`— sigue en
 * `PROJECT_ROOT`, intocable. Sin carpeta vinculada el comportamiento es
 * EXACTAMENTE el de siempre: misma raíz, mismo error, mismos bytes.
 *
 * Pura: usa `node:path` para resolver (no hay disco ni reloj). El servidor le
 * pasa las dos raíces ya resueltas.
 */
import path from "node:path";

/**
 * Prefijos que SON órganos del IDE: nunca se desvían a la carpeta vinculada.
 * ★ A propósito NO están `src/`, `server/`, `tests/`, `dist/` ni `node_modules/`:
 * una app generada ALSO tiene `src/main/java/...` (es el caso real de la sesión:
 * el proyecto era un `finance/app/src/...`). Desviar esos prefijos mandaría la
 * obra a la raíz del IDE otra vez, que es justo el defecto que estamos cerrando.
 */
export const PREFIJOS_INTERNOS = [
  "cerebro/", ".cerebro-db/", "memoria_history/", "logs/", ".creador/",
];

/** ¿La ruta pedida pertenece a un órgano del IDE (y por tanto vive en PROJECT_ROOT)? */
export function esRutaInternaDelIDE(rel: string): boolean {
  const r = norm(rel);
  if (!r) return false;
  return PREFIJOS_INTERNOS.some((p) => r === p.slice(0, -1) || r.startsWith(p));
}

/** Normaliza separadores y `./` iniciales. Función de orden superior-safe: sin regex frágil. */
export function norm(rel: string): string {
  return String(rel ?? "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

export interface OpcionesDeObra {
  /** Lo que pidió la herramienta (`write_file`, `fs_write`, el Editor web…). */
  rel: string;
  /** Raíz de datos del IDE (`PROJECT_ROOT`). */
  raizProyecto: string;
  /** Carpeta fijada por CANAL DIRECTO, o `null` si no hay. */
  vinculada?: string | null;
  /**
   * Carpeta del PROYECTO que se está sirviendo: `<raíz de datos>/<nombre>`
   * (en Windows, `C:\Cerebronico\finanzas-app`). Es la que ve el árbol del
   * Editor web y la que sirve el :3500. Sin este dato la obra caía en la raíz de
   * datos (`C:\Cerebronico\MainActivity.kt`), un nivel más arriba de donde se ve
   * — el reclamo real de Mario: «quedó escrito en la raíz de CerebroNico».
   */
  servida?: string | null;
}

export interface RutaDeObra {
  /** Ruta absoluta final, lista para `fs`. */
  abs: string;
  /** Raíz elegida (`raizProyecto` o `vinculada`, ya resuelta). */
  raiz: string;
  /** Por qué esa raíz: se muestra al usuario, nunca se calla. */
  origen: "vinculada" | "servida" | "proyecto" | "absoluta";
  motivo: string;
}

/** TRUE si `hijo` queda dentro de `padre` (comparación resuelta, no de string). */
function dentroDe(hijo: string, padre: string): boolean {
  const rel = path.relative(path.resolve(padre), path.resolve(hijo));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? true : path.resolve(hijo) === path.resolve(padre);
}

/**
 * Decide DÓNDE se escribe un archivo de la obra. Lanza el MISMO error que
 * lanzía `resolveSafePath` cuando la ruta se sale de todo lo permitido, para no
 * cambiar el contrato que las suites ya conocen.
 */
export function resolverRutaDeObra(o: OpcionesDeObra): RutaDeObra {
  const raizProyecto = path.resolve(o.raizProyecto);
  const vinculada = o.vinculada ? path.resolve(o.vinculada) : null;
  const servida = o.servida ? path.resolve(o.servida) : null;
  const crudo = String(o.rel ?? "").trim();
  // Ruta vacía = la raíz misma (así se comportaba `resolveSafePath` antes).
  if (!crudo) return { abs: raizProyecto, raiz: raizProyecto, origen: "proyecto", motivo: "raíz del proyecto" };

  // 1) Ruta absoluta: se respeta SIEMPRE que esté dentro de una de las dos raíces
  //    legítimas. Hoy moría aquí aunque la carpeta estuviera vinculada a mano.
  if (path.isAbsolute(crudo)) {
    const abs = path.resolve(crudo);
    if (dentroDe(abs, raizProyecto)) return { abs, raiz: raizProyecto, origen: "absoluta", motivo: "ruta absoluta dentro del proyecto del IDE" };
    if (vinculada && dentroDe(abs, vinculada)) return { abs, raiz: vinculada, origen: "absoluta", motivo: "ruta absoluta dentro de la carpeta vinculada" };
    throw new Error("Ruta fuera del proyecto no permitida.");
  }

  const rel = norm(crudo);
  // 2) `..` que escapen de cualquier raíz: no se negocia.
  const hueleASalida = rel.split("/").some((p) => p === "..");
  if (hueleASalida) throw new Error("Ruta fuera del proyecto no permitida.");

  // 3) Órganos del IDE: viven en PROJECT_ROOT aunque haya obra vinculada.
  if (esRutaInternaDelIDE(rel)) {
    const abs = path.resolve(raizProyecto, rel);
    if (!dentroDe(abs, raizProyecto)) throw new Error("Ruta fuera del proyecto no permitida.");
    return { abs, raiz: raizProyecto, origen: "proyecto", motivo: "es un archivo del IDE, no de la obra" };
  }

  // 4a) OBRA con carpeta FIJADA a mano: esa es la raíz, sin discusión.
  if (vinculada) {
    const abs = path.resolve(vinculada, rel);
    if (!dentroDe(abs, vinculada)) throw new Error("Ruta fuera del proyecto no permitida.");
    return { abs, raiz: vinculada, origen: "vinculada", motivo: "la obra va a la carpeta vinculada (CANAL DIRECTO)" };
  }

  // 4b) OBRA sin fijar, pero con PROYECTO adentro de la raíz de datos: se escribe
  //     en el proyecto, que es el nivel que muestran el árbol y el :3500. Este es
  //     el caso «C:\Cerebronico» (raíz de datos) vs «C:\Cerebronico\finanzas-app».
  if (servida && servida !== raizProyecto && dentroDe(servida, raizProyecto)) {
    const abs = path.resolve(servida, rel);
    if (!dentroDe(abs, servida)) throw new Error("Ruta fuera del proyecto no permitida.");
    return { abs, raiz: servida, origen: "servida", motivo: "la obra va al proyecto que está sirviendo el árbol y el :3500" };
  }

  // 5) Sin carpeta vinculada: comportamiento idéntico al de siempre.
  const abs = path.resolve(raizProyecto, rel);
  if (!dentroDe(abs, raizProyecto)) throw new Error("Ruta fuera del proyecto no permitida.");
  return { abs, raiz: raizProyecto, origen: "proyecto", motivo: "no hay carpeta vinculada: se escribe en el proyecto del IDE" };
}
