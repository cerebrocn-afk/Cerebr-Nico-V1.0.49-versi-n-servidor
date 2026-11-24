/**
 * previewAntiCache.ts — refresco DURO del preview del editor web (v1.60.14)
 * =====================================================================
 * 🐞 «...ya recargué y sigue igual» (el velo que no se iba).
 *
 * El preview re-montaba el <iframe> con la MISMA URL (solo cambiaba el `key`
 * de React). Pero la página generada registra un service worker NETWORK-FIRST
 * (`sw.js`: `fetch(req).then(cachear).catch(caches.match)`). En cuanto el
 * servidor del sandbox :3500 tose un instante —un guardado, un reinicio, un
 * 404/502 mientras el modelo escribe— el `fetch` falla y el SW devuelve la
 * COPIA VIEJA de caché. Resultado: el usuario ve una y otra vez el render
 * anterior (con su velo), recarga, y «sigue igual», porque el navegador y el
 * SW resuelven la misma URL desde memoria/caché, no desde el disco nuevo.
 *
 * La cura es un refresco que el caché NO pueda servir: cada refresco pide una
 * URL Única añadiendo `?cn_r=<token>`. Una URL que el SW nunca cacheó es un
 * fallo de caché garantizado; como el SW es network-first, va a la red y trae
 * el archivo de verdad. Y si el servidor está caído, el iframe falla a la vista
 * —honesto— en vez de resucitar en silencio el render viejo.
 *
 * Función PURA (sin DOM): la matemática de la URL vive aquí y se prueba en
 * tests/previewAntiCache.test.ts. El componente sólo la cablea al `src`.
 */

const PARAM = "cn_r";

/**
 * Devuelve `url` con un parámetro anti-caché único (`cn_r=<token>`), de forma
 * IDEMPOTENTE: si ya había un `cn_r`, se reemplaza (no se acumulan). Preserva
 * el resto del query y el hash (`#ancla`). Si la URL es vacía, se devuelve tal
 * cual (no hay nada que refrescar).
 */
export function urlConAntiCache(url: string, token: string | number): string {
  if (!url) return url;

  // Separar hash: el ancla va SIEMPRE al final y no es parte del query.
  const iHash = url.indexOf("#");
  const hash = iHash >= 0 ? url.slice(iHash) : "";
  const sinHash = iHash >= 0 ? url.slice(0, iHash) : url;

  // Separar query.
  const iQ = sinHash.indexOf("?");
  const base = iQ >= 0 ? sinHash.slice(0, iQ) : sinHash;
  const query = iQ >= 0 ? sinHash.slice(iQ + 1) : "";

  // Quitar cualquier cn_r previo para no acumular (idempotencia).
  const pares = query
    .split("&")
    .filter((p) => p.length > 0 && !(p === PARAM || p.startsWith(PARAM + "=")));

  pares.push(`${PARAM}=${encodeURIComponent(String(token))}`);

  return `${base}?${pares.join("&")}${hash}`;
}
