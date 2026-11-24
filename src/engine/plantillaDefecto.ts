/**
 * plantillaDefecto.ts — v1.66.0 · LA WEB QUEDA EN PLANTILLA POR DEFECTO
 * ============================================================================
 * RAÍZ (reportado por el usuario + chat exportado `futuristic.web`): al generar
 * una web el modelo «deja las plantillas por defaut» — títulos genéricos,
 * `<meta name="description" content="Descripción de futuristic.web">`, secciones
 * con solo el título y texto de relleno— y las IMÁGENES quedan rotas o apuntando
 * a marcadores (`placeholder`, `via.placeholder.com`, `src=""`, `tu-imagen…`).
 * `completitud.ts` ya caza el archivo PROMETIDO y no escrito, el truncado y el
 * `src=`/`href=` al VACÍO en disco; lo que NO veía es el archivo que SÍ existe y
 * SÍ enlaza, pero cuyo CONTENIDO sigue siendo el andamio por defecto. Eso es lo
 * que el usuario abre y ve «solo títulos pre default».
 *
 * QUÉ DETECTA (determinista, sobre el HTML/CSS ya escrito):
 *   1. TEXTO DE RELLENO — lorem ipsum, «título de la sección», «descripción de
 *      …», «tu texto aquí», «contenido de ejemplo», «section title», «placeholder»…
 *   2. META POR DEFECTO — `description`/`title` que son literalmente
 *      «Descripción de X» o el nombre del proyecto a secas.
 *   3. IMÁGENES MARCADOR — `src` vacío/`#`, `via.placeholder`, `placehold.*`,
 *      `example.com`, `tu-imagen`, `imagen.(jpg|png)` genérico, data-URI 1x1.
 *   4. SECCIONES HUECAS — un `<section>` cuyo único contenido con tinta es su
 *      encabezado (solo `<h*>` y nada de párrafo/lista/imagen real).
 *
 * CONTROL DE FALSO POSITIVO: un texto largo y propio NO se marca por contener
 * la palabra «ejemplo»; los marcadores exigen la FORMA de relleno (frase corta
 * genérica, atributo exacto). Una imagen con `src` a un archivo local real no se
 * toca — de su existencia en disco ya se ocupa `completitud.enlacesAlVacio`.
 *
 * PURO: sin red, sin fs, sin estado global. Se prueba en seco.
 */

export interface HallazgoPlantilla {
  tipo: "texto" | "meta" | "imagen" | "seccion";
  detalle: string;
}

/** Frases de relleno típicas de un andamio sin terminar. */
const RELLENO_TEXTO: RegExp[] = [
  /lorem ipsum/i,
  /\btítulo de (la|tu|mi)?\s*(sección|página|aquí)?\b/i,
  /\bsection title\b/i,
  /\b(tu|su) (texto|contenido|descripción) aquí\b/i,
  /\byour (text|content|title|heading) here\b/i,
  /\b(contenido|texto) de ejemplo\b/i,
  /\bplaceholder\b/i,
  /\b(add|replace|edita?) (this|your|tu|el) (text|content|aquí|contenido)\b/i,
  /\bsample (text|content)\b/i,
  /\bpárrafo de (ejemplo|relleno|muestra)\b/i,
  /\bdescripción breve de la sección\b/i,
];

/** Marcadores de imagen que NO son una imagen real. */
const IMG_MARCADOR: RegExp[] = [
  /^$/,
  /^#$/,
  /via\.placeholder\.com/i,
  /placehold(er)?\.(it|co|jp)/i,
  /\bplaceholder\b/i,
  /example\.(com|org)/i,
  /\b(tu|mi|su)-?(imagen|logo|foto|image)\b/i,
  /^(imagen|image|foto|logo|banner|hero)\.(jpe?g|png|webp|gif)$/i,
  /^ruta\/?(a|de)\/?(la\/?)?imagen/i,
  /^data:image\/[a-z+]+;base64,(?:R0lGOD|iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB)/i, // 1x1 gif/png
];

function textoVisible(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 1) Texto de relleno en el cuerpo visible. */
export function textoDeRelleno(html: string): string[] {
  const visible = textoVisible(html);
  const hits: string[] = [];
  for (const re of RELLENO_TEXTO) {
    const m = visible.match(re);
    if (m) hits.push(m[0]);
  }
  return [...new Set(hits)];
}

/** 2) `<title>` / meta description por defecto (el caso real `Descripción de X`). */
export function metaPorDefecto(html: string, nombreProyecto?: string): string[] {
  const hits: string[] = [];
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (desc) {
    const c = desc[1].trim();
    if (/^descripción de\b/i.test(c) || /^description of\b/i.test(c) || c === "" ||
        (nombreProyecto && c.toLowerCase() === String(nombreProyecto).toLowerCase())) {
      hits.push(`meta description por defecto: «${c}»`);
    }
  }
  const title = html.match(/<title>([^<]*)<\/title>/i);
  if (title) {
    const t = title[1].trim();
    if (/^(document|untitled|sin título|título|title|home|inicio|página)\b/i.test(t) || t === "") {
      hits.push(`<title> por defecto: «${t}»`);
    }
  }
  return hits;
}

/** 3) Imágenes que apuntan a un marcador en vez de a un asset real. */
export function imagenesMarcador(html: string): string[] {
  const hits: string[] = [];
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim();
    const sinSrc = !/\bsrc\s*=/.test(tag);
    if (sinSrc) { hits.push(`<img> sin src`); continue; }
    const limpio = src.split("?")[0].split("#")[0];
    if (IMG_MARCADOR.some((r) => r.test(limpio))) {
      hits.push(`<img src="${src || ""}"> es marcador, no una imagen real`);
    }
  }
  return hits;
}

/** 4) Secciones cuyo único contenido con tinta es el encabezado. */
export function seccionesHuecas(html: string): string[] {
  const hits: string[] = [];
  const re = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    i++;
    const cuerpo = m[1];
    const sinEncabezados = cuerpo.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, " ");
    const tieneMedia = /<(img|video|canvas|svg|iframe|ul|ol|table|form|p)\b/i.test(sinEncabezados);
    const textoRestante = textoVisible(sinEncabezados);
    const tieneEncabezado = /<h[1-6]\b/i.test(cuerpo);
    if (tieneEncabezado && !tieneMedia && textoRestante.length < 12) {
      const h = cuerpo.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || `#${i}`;
      hits.push(`sección «${h}» solo tiene el título (sin párrafo/imagen/lista)`);
    }
  }
  return hits;
}

export interface VeredictoPlantilla {
  ok: boolean;
  hallazgos: HallazgoPlantilla[];
}

/** Veredicto completo sobre un HTML (opcionalmente con el nombre del proyecto). */
export function detectarPlantillaPorDefecto(html: string, nombreProyecto?: string): VeredictoPlantilla {
  const h = String(html ?? "");
  const hallazgos: HallazgoPlantilla[] = [];
  for (const d of textoDeRelleno(h)) hallazgos.push({ tipo: "texto", detalle: d });
  for (const d of metaPorDefecto(h, nombreProyecto)) hallazgos.push({ tipo: "meta", detalle: d });
  for (const d of imagenesMarcador(h)) hallazgos.push({ tipo: "imagen", detalle: d });
  for (const d of seccionesHuecas(h)) hallazgos.push({ tipo: "seccion", detalle: d });
  return { ok: hallazgos.length === 0, hallazgos };
}

/** Acta legible para inyectar o mostrar: qué quedó en andamio, nombrado. */
export function informePlantilla(v: VeredictoPlantilla): string {
  if (v.ok) return "";
  const porTipo: Record<string, string[]> = {};
  for (const h of v.hallazgos) (porTipo[h.tipo] ||= []).push(h.detalle);
  const etiqueta: Record<string, string> = {
    texto: "TEXTO DE RELLENO",
    meta: "META POR DEFECTO",
    imagen: "IMÁGENES MARCADOR (rotas / placeholder)",
    seccion: "SECCIONES HUECAS (solo el título)",
  };
  const partes = Object.entries(porTipo).map(
    ([t, ds]) => `${etiqueta[t] || t}: ${ds.slice(0, 6).join(" | ")}${ds.length > 6 ? ` … y ${ds.length - 6} más` : ""}`,
  );
  return (
    `🧱 PLANTILLA POR DEFECTO — el motor abrió la web generada y encontró andamio sin terminar:\n  · ` +
    partes.join("\n  · ") +
    `\nCompleta el texto REAL de cada sección y reemplaza las imágenes marcador por un asset real ` +
    `(genéralo con la herramienta de imagen o usa una ruta local que exista). No entregues con andamio.`
  );
}
