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
