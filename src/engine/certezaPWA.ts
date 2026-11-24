/**
 * certezaPWA.ts — v1.57.16 · CERTEZA DE EXPORTACIÓN: PROMESA SIN CABLE NO ES INSTALL
 * ====================================================================================
 * RAÍZ (app-finanzas-dark.zip, exportada por el usuario el 15/10): la PWA andaba
 * perfecta EN EL SANDBOX (http, rutas relativas, localStorage ✓) y el install
 * fallaba al exportar. El motor la cerró verde de punta a punta — y tenía razón,
 * según lo que mide: la ORDEN DE OBRA dice si el archivo ESTÁ, el QUIRÓFANO si
 * COMPILA, la COMPLETITUD si los enlaces APUNTAN a algo. Pero el pack escribió
 * `manifest.webmanifest` y `sw.js` y NADIE LOS CABLEÓ: ningún `<link rel="manifest">`
 * en el HTML, ningún `navigator.serviceWorker.register` en el JS, y un manifest
 * con íconos solo-SVG que Edge/WebView no instalan. Tres defectos invisibles para
 * una verificación que pregunta por el disco cuando la pregunta era por el NAVEGADOR.
 *
 * Este módulo cierra ese plano: si una escritura trajo piezas de PWA, el motor
 * exige que estén CONECTADAS entre sí. Cada agujero es una línea con su arreglo
 * concreto — y viaja por la puerta de rescate de la v1.57.11: turno reabierto
 * con orden dura, no acta fúnebre. Silencio absoluto cuando el turno no tocó
 * piezas PWA: una landing sin manifest no es un defecto, es una landing.
 */

export interface LectorPWA {
  (ruta: string): string | null;
}

const RE_MANIFEST = /(^|\/)(manifest\.webmanifest|site\.webmanifest|manifest\.json)$/i;
const RE_SW = /(^|\/)(sw|service-?worker)\.js$/i;

/** Rutas normalizadas: sin ./ ni barras invertidas, para comparar y nombrar. */
function limpiar(r: string): string {
  return String(r || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Agujeros de exportación PWA sobre lo que ESTE TURNO escribió.
 * `rutasEscritas`: archivos escritos/creados en el turno. `htmls`: .html del proyecto.
 * `leer`: lector síncrono inyectado (null si no existe — nunca lanza).
 * Devuelve líneas «AGUJERO: detalle — arreglo», máx 6, deduplicadas.
 */
export function agujerosPWA(rutasEscritas: string[], htmls: string[], leer: LectorPWA): string[] {
  const escritas = (rutasEscritas || []).map(limpiar);
  const manifests = escritas.filter((r) => RE_MANIFEST.test(r));
  const sws = escritas.filter((r) => RE_SW.test(r));
  if (manifests.length === 0 && sws.length === 0) return [];

  // Todo el texto navegable del turno: los .html del proyecto + lo escrito .html/.js.
  const fuentes = [...new Set([...(htmls || []).map(limpiar), ...escritas.filter((r) => /\.html?$|\.m?js$/i.test(r))])];
  let manifestEnlazado = false;
  let swRegistrado = false;
  for (const f of fuentes) {
    const txt = leer(f);
    if (!txt) continue;
    if (/rel\s*=\s*["']?manifest/i.test(txt)) manifestEnlazado = true;
    if (/serviceWorker[\s\S]{0,80}register|register\(\s*["'][^"']*sw/i.test(txt)) swRegistrado = true;
  }

  const hoyos: string[] = [];
  if (manifests.length > 0 && !manifestEnlazado) {
    hoyos.push(`MANIFIESTO HUÉRFANO: ${manifests[0]} fue escrito pero NINGÚN html lo enlaza — el navegador ni lo ve y el botón de instalar no existe. Agregá al <head> del index: <link rel="manifest" href="${manifests[0].split("/").pop()}"> (o llamá a crear_pwa, que ya cablea todo).`);
  }
  if (sws.length > 0 && !swRegistrado) {
    hoyos.push(`SW MUERTO: ${sws[0]} existe pero nadie lo registra — sin service worker activo Chrome no ofrece instalar. Agregá al JS principal: if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./${sws[0].split("/").pop()}").catch(() => {}));`);
  }
  for (const m of manifests) {
    const txt = leer(m);
    if (txt === null) continue;
    let obj: any = null;
    try {
      obj = JSON.parse(txt);
    } catch {
      hoyos.push(`MANIFIESTO ROTO: ${m} no es JSON válido — el navegador lo ignora en silencio. Escribí JSON plano (sin comentarios ni comas colgantes).`);
      continue;
    }
    const icons: any[] = Array.isArray(obj?.icons) ? obj.icons : [];
    const png = icons.some((i) => /(^|\/|,)\s*.*\.png|data:image\/png/i.test(String(i?.src || "")));
    if (!png) {
      hoyos.push(`ÍCONOS NO INSTALABLES: ${m} no declara ningún PNG — con solo SVG, Edge y varios WebView rechazan la instalación. Generá icon-192.png e icon-512.png (crear_pwa ya los escribe) y sumalos a "icons".`);
    }
  }
  return hoyos.slice(0, 6);
}
