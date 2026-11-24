/**
 * repararImagenes.ts — NINGÚN <img> HUÉRFANO (v1.70.6)
 * =====================================================
 * 🐞 MEDIDO (sesión exportada 24/10): el usuario subió `image.png` por el chat
 * — el motor v1.47.0 la guardó en `assets/subidas/image.png` y hasta le pasó
 * la ruta EXACTA al modelo — pero el HTML generado apuntaba a rutas soñadas
 * (`assets/site/06-editor-web-ia.jpg`, «Imagen 1», «Imagen 2»). El sandbox
 * respondió 404 y el preview salió con el icono roto.
 *
 * La valla de texto que dice «usa ESTA ruta» no alcanza: los modelos de código
 * alucinan nombres de archivo con extensión de imagen. Este módulo es la
 * aduana de salida: antes de escribir un archivo de texto al sandbox, toda
 * referencia a imagen que NO exista en el proyecto se reescribe a una imagen
 * REAL del proyecto cuando el emparejamiento es inequívoco:
 *   · 1 sola imagen subida y 1 referencia huérfana → esa es;
 *   · el tallo del nombre casa (misma palabra-base sin extensión) → esa es;
 *   · sin candidato claro → se respeta la ruta del modelo (no se inventa).
 * Nunca toca URLs (http/https), data: URIs, ni rutas protocol-less de CDN con
 * dominio (contienen «//»).
 */

export const RE_IMAGEN_RUTA = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;

const esExterna = (src: string) =>
  /^(https?:)?\/\//i.test(src) || src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("//");

/** Tallo normalizado: sin carpeta, sin extensión, minúsculas, sin acentos. */
export function talloDe(ruta: string): string {
  const base = ruta.split("/").pop() || ruta;
  const sinExt = base.replace(/\.[a-z0-9]+$/i, "");
  return sinExt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** ¿`src` (relativa al archivo que la contiene) existe entre las rutas conocidas? */
function existe(src: string, desde: string, conocidas: Set<string>): boolean {
  const limpia = src.replace(/^\.\//, "").split("#")[0].split("?")[0];
  if (!limpia) return false;
  const candidatos = [limpia];
  // relativa al archivo (si el HTML vive en sub/ y dice ../img.png)
  const dir = desde.includes("/") ? desde.slice(0, desde.lastIndexOf("/")) : "";
  if (dir) candidatos.push(`${dir}/${limpia}`);
  // raíz del sitio (la mayoría del HTML del editor vive en la raíz)
  for (const c of candidatos) {
    const normal = c.split("/").reduce<string[]>((acc, parte) => {
      if (parte === "..") acc.pop();
      else if (parte && parte !== ".") acc.push(parte);
      return acc;
    }, []).join("/");
    if (conocidas.has(normal)) return true;
  }
  return false;
}

function elegirCandidato(huerfana: string, subidas: string[], proyecto: string[]): string | null {
  const tallo = talloDe(huerfana);
  if (tallo) {
    const exacto =
      subidas.find((s) => talloDe(s) === tallo) ||
      // imagen YA existente del proyecto: solo por nombre exacto de tallo —
      // nunca el "todo cabe" sobre fotos ajenas al pedido de este turno.
      proyecto.find((s) => talloDe(s) === tallo);
    if (exacto) return exacto;
    const parcial = subidas.filter((s) => talloDe(s).includes(tallo) || tallo.includes(talloDe(s)));
    if (parcial.length === 1) return parcial[0];
  }
  if (subidas.length === 1) return subidas[0];
  return null;
}

export interface ResultadoReparacion {
  texto: string;
  /** src original → ruta real escrita. Vacío si no hubo cambios. */
  reparadas: Array<{ de: string; a: string }>;
}

/**
 * Reescribe `src="…"` (y `url(…)` de CSS) de imágenes inexistentes hacia
 * imágenes reales del proyecto cuando el emparejamiento es inequívoco.
 */
export function repararRutasDeImagen(
  texto: string,
  archivo: string,
  conocidas: string[],
  subidasEsteTurno: string[],
  /** Imágenes que ya existen en el proyecto (candidatas SOLO por nombre-base). */
  imagenesProyecto: string[] = []
): ResultadoReparacion {
  const src = String(texto ?? "");
  const reparadas: Array<{ de: string; a: string }> = [];
  if (!src || !/(<img|\bsrc\s*=|url\()/i.test(src)) return { texto: src, reparadas };

  const subidas = subidasEsteTurno.filter(Boolean);
  if (subidas.length === 0 && imagenesProyecto.length === 0) return { texto: src, reparadas };

  const setConocidas = new Set(conocidas.map((r) => r.replace(/^\.\//, "")));
  for (const s of subidas) setConocidas.add(s.replace(/^\.\//, ""));

  const reemplazarUna = (todo: string, comilla: string, ruta: string, prefijo: string, sufijo: string) => {
    if (!ruta || esExterna(ruta)) return todo;
    if (!RE_IMAGEN_RUTA.test(ruta.split("?")[0].split("#")[0])) return todo;
    if (existe(ruta, archivo, setConocidas)) return todo;
    if (subidas.some((s) => s.replace(/^\.\//, "") === ruta.replace(/^\.\//, ""))) return todo;
    const destino = elegirCandidato(ruta, subidas, imagenesProyecto);
    if (!destino || destino === ruta) return todo;
    reparadas.push({ de: ruta, a: destino });
    return prefijo + comilla + destino + comilla + sufijo;
  };

  let salida = src.replace(
    /(src\s*=\s*)(")([^"]*)(")/gi,
    (_t, pref: string, q: string, ruta: string, post: string) => reemplazarUna(_t, q, ruta, pref, post),
  );
  salida = salida.replace(
    /(src\s*=\s*)(')([^']*)(')/gi,
    (_t, pref: string, q: string, ruta: string, post: string) => reemplazarUna(_t, q, ruta, pref, post),
  );
  // CSS: url("assets/x.png") / url(assets/x.png)
  salida = salida.replace(
    /(url\(\s*)("|')?([^"')]+)\2(\s*\))/gi,
    (_t, pref: string, q: string | undefined, ruta: string, post: string) =>
      reemplazarUna(_t, q || "", ruta, pref, post),
  );
  return { texto: salida, reparadas };
}
