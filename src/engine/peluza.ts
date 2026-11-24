/**
 * peluza.ts — LO QUE NUNCA TIENE QUE LLEGAR EN UN PAQUETE (v1.99.0)
 * ==================================================================
 * Medido en `CerebroNico-IDE-v1.99.0.zip` de hoy: **25 archivos de basura viajaban
 * adentro** — mis propios `build-v197.log` / `gate-v197*.log` / `entregar-v196*.log`
 * de corridas anteriores, `.vigilante/*.log` de pruebas, y `__pycache__/*.pyc` que
 * Python escupe solo. El embalador no tenía lista de exclusión: caminaba el árbol y
 * metía TODO. Un paquete del IDE con mis logs de sesión dentro no es un detalle
 * estético: pesa, ensucia el árbol del usuario y filtra rutas de mi máquina.
 *
 * Este módulo es el DUEÑO de la decisión y lo usan los DOS caminos que tienen que
 * coincidir: el `walk` que arma la lista de esperados y el `-x` que se lo pasa a
 * `zip`. Si filtrara uno solo, el control de `faltantes` se pondría rojo contra un
 * fantasma (la misma clase de mentira que `entregar.ts` ya documenta para
 * `node_modules` como symlink). Por eso la lista de patrones vive acá y no en dos
 * literales separados.
 *
 * Puro: recibe rutas relativas, devuelve verdad. Sin fs, para poder probarlo en seco.
 */

/**
 * Basura en CUALQUIER profundidad: residuo de intérprete o de instalación.
 * `dist` NO está acá y es la lección de v1.99.0: mi primera versión de esta lista lo
 * ponía profundo, y la guarda recién estrenada se negó a firmar el paquete porque
 * `vendor/hindsight-agent-sdk/dist/index.js` es código de un SDK que tiene que viajar.
 * Un nombre de carpeta no es una intención: `dist` en la raíz es mi build, `dist`
 * adentro de `vendor/` es el producto de otro.
 */
export const CARPETAS_PELUZA_PROFUNDA = ["__pycache__", "node_modules"];
/** Basura sólo si está en la RAÍZ del proyecto (build y datos locales). */
export const CARPETAS_PELUZA_RAÍZ = ["dist", ".cerebro-db"];
/** Compat: el listado plano que usaban las vallas viejas. */
export const CARPETAS_PELUZA = [...CARPETAS_PELUZA_PROFUNDA, ...CARPETAS_PELUZA_RAÍZ];

/** Terminaciones que son residuo de ejecución, no fuente. */
export const EXTENSIONES_PELUZA = [".log", ".pyc", ".pyo", ".tmp", ".swp", ".tsbuildinfo"];

/** Archivos concretos que el laboratorio deja tirados (con su nombre o con prefijo). */
export const PREFIJOS_PELUZA = ["build-v", "gate-v", "entregar-v", "gate-final-v", ".tsc"];

/**
 * ¿Este archivo (ruta RELATIVA al árbol del proyecto) es pelusa?
 * `documentacion/**.log` NO es pelusa si se llama distinto: el criterio es extensión,
 * carpeta o prefijo de residuo — no "todo lo que me estorbe hoy".
 */
export function esPelusa(rel: string): boolean {
  const r = String(rel || "").split("\\").join("/");
  if (!r) return false;
  const partes = r.split("/");
  const base = partes[partes.length - 1];
  if (partes.some((p) => CARPETAS_PELUZA_PROFUNDA.includes(p))) return true;
  if (partes.length > 1 && CARPETAS_PELUZA_RAÍZ.includes(partes[0])) return true;
  if (partes[0] === ".vigilante" && EXTENSIONES_PELUZA.some((x) => base.endsWith(x))) return true;
  if (EXTENSIONES_PELUZA.some((x) => base.endsWith(x))) return true;
  if (partes.length === 1 && PREFIJOS_PELUZA.some((p) => base.startsWith(p))) return true;
  return false;
}

/** Los `-x` que hay que pasarle a `zip`, derivados del MISMO criterio del `walk`. */
export function exclusionesZip(): string[] {
  const xs: string[] = [];
  // El `*` de `zip` cruza `/` (lo documenta `entregar.ts`): por eso las profundas se
  // enuncián en las dos formas y las de raíz van ancladas, para no tragarse el `dist`
  // de un vendor.
  for (const c of CARPETAS_PELUZA_PROFUNDA) xs.push(`app/${c}`, `app/${c}/*`, `app/*/${c}`, `app/*/${c}/*`);
  for (const c of CARPETAS_PELUZA_RAÍZ) xs.push(`app/${c}`, `app/${c}/*`);
  for (const x of EXTENSIONES_PELUZA) xs.push(`app/*${x}`, `app/*/*${x}`, `app/.vigilante/*${x}`);
  return xs;
}

/**
 * Subconjunto de la pelusa que es MÍA (residuo de mis corridas de build/gate/entregar)
 * y que, a diferencia de `__pycache__`, NADIE vuelve a crear solo. v1.99.0 · la primera
 * versión de esta valla barría el disco con `esPelusa` y pasó verde sola; dentro del
 * ritual se puso roja, porque las suites de `hindsight`/`creador` ejecutan Python de
 * verdad y Python deja `__pycache__` otra vez en cuanto corre. Una guarda que depende
 * del ORDEN en que se ejecutan las suites no es una guarda: es un flaky con disfraz.
 * Por eso el barrido de disco pregunta por la pelusa de sesión, y la ausencia de
 * `__pycache__` se garantiza donde sí depende de nosotros: el ZIP (ver `exclusionesZip`).
 */
export function esPelusaDeSesion(rel: string): boolean {
  if (!esPelusa(rel)) return false;
  const r = String(rel || "").split("\\\\").join("/");
  if (r.includes("__pycache__")) return false;
  if (r.endsWith(".pyc") || r.endsWith(".pyo")) return false;
  return true;
}

/** Cuánta pelusa hay en un listado (para que el embalador la CUELTE, no la calle). */
export function contarPelusa(relativos: string[]): string[] {
  return (relativos || []).filter(esPelusa);
}
