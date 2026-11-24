/**
 * completitud.ts — PLAN ↔ MANIFIESTO ↔ DISCO (v1.23.0)
 * ====================================================
 * EL DEFECTO QUE CURA
 * -------------------
 * «Cuando le pido una app siempre le faltan archivos.» La cadena de mentiras
 * piadosas siempre es la misma: el plan promete 9 archivos, el modelo escribe
 * 6, el acta dice «listo», y el usuario abre la carpeta y faltan 3. Nadie
 * contrastaba el plan contra el disco. `ordenDeObra.ts` verifica lo que se
 * INTENTÓ escribir; este módulo verifica lo que se PROMETIÓ y lo que el disco
 * muestra: los huecos entre promesa, intento y realidad.
 *
 * QUÉ DETECTA (todo determinista, con la sonda de disco inyectada)
 * ----------------------------------------------------------------
 *  1. PROMETIDO SIN ESCRIBIR — rutas que aparecen en el plan y no están en el
 *     manifiesto de obra (o están y fallaron).
 *  2. ENLACES AL VACÍO — `src=`/`href=` de un HTML apuntando a archivos locales
 *     que no existen (el «blanco» que ve el usuario al abrir la app).
 *  3. ARCHIVOS DE 0 BYTES — escritos pero vacíos: el truncado silencioso.
 *  4. TRUNCADOS — marcadores de «resto del código» en archivos que quedaron
 *     en disco (reutiliza el juez de `quirofano.marcadoresDeTruncado`).
 *  5. HUECO DE ARRANQUE — package.json cuyo `main` no existe, o index.html que
 *     no existe / no referencia ningún script que exista: la app no arranca por
 *     definición, no por un bug.
 *
 * Es 100 % puro: entra plan + manifiesto + sonda/lector, sale informe. Se
 * prueba en seco, sin servidor. La sonda es la misma firma que `SondaDisco`
 * de ordenDeObra.
 */
import { marcadoresBloqueantes } from "./quirofano";

export type Sonda = (ruta: string) => { existe: boolean; esCarpeta?: boolean; bytes: number };
export type Lector = (ruta: string) => string | null;

const RUTA_ARCHIVO = /(?:[A-Za-z0-9_\-\.@]+\/)*[A-Za-z0-9_\-@]+\.[A-Za-z0-9]{1,10}\b/g;
const EXTENSIONES_REAL = /\.(tsx?|jsx?|mjs|cjs|json|html?|css|scss|py|php|md|txt|csv|svg|png|jpe?g|webp|ico|yml|yaml|toml|sql|sh|bat|ps1|rs|go|java|rb|vue|svelte|env|lock)$/i;

/** Rutas con aspecto de archivo que menciona el plan (descripciones de tareas). */
export function rutasMencionadasEnPlan(tasks: Array<{ description?: string }>): string[] {
  const salida = new Set<string>();
  for (const t of tasks || []) {
    const d = String(t?.description || "");
    let m: RegExpExecArray | null;
    RUTA_ARCHIVO.lastIndex = 0;
    while ((m = RUTA_ARCHIVO.exec(d)) !== null) {
      const r = m[0].replace(/^\.?\//, "");
      if (EXTENSIONES_REAL.test(r)) salida.add(r);
    }
  }
  return [...salida].sort();
}

export function normalizar(ruta: string): string {
  return String(ruta || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

/** 1) Prometido en el plan pero nunca escrito (o escrito y falló). */
export function prometidoSinObra(
  rutasPlan: string[],
  manifiesto: Map<string, { ultimoOk: boolean }> | Record<string, { ultimoOk: boolean }>
): string[] {
  const get = (r: string) =>
    manifiesto instanceof Map ? manifiesto.get(r) : (manifiesto as Record<string, any>)[r];
  const faltan: string[] = [];
  for (const r of rutasPlan) {
    const reg = get(r) || get(normalizar(r));
    if (!reg) faltan.push(r);
    else if (!reg.ultimoOk) faltan.push(`${r} (el último intento falló)`);
  }
  return faltan;
}

/** 2) `src=`/`href=` de HTML apuntando a archivos locales que no existen. */
export function enlacesAlVacio(rutaHtml: string, html: string, sonda: Sonda): string[] {
  const rotos: string[] = [];
  const dir = rutaHtml.includes("/") ? rutaHtml.slice(0, rutaHtml.lastIndexOf("/")) : "";
  const re = /(?:src|href)\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const destino = m[1].trim();
    if (/^(https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(destino)) continue;
    const limpio = decodeURIComponent(destino.split("?")[0].split("#")[0]);
    if (!limpio) continue;
    const abs = limpio.startsWith("/") ? limpio.slice(1) : (dir ? `${dir}/${limpio}` : limpio);
    const visto = sonda(abs);
    if (!visto || !visto.existe) rotos.push(`${rutaHtml} → ${destino} (buscado en ${abs})`);
  }
  return rotos;
}

/** 3) Archivos que existen pero pesan 0 bytes. */
export function archivosVacios(rutas: string[], sonda: Sonda): string[] {
  const vacios: string[] = [];
  for (const r of rutas) {
    const visto = sonda(r);
    if (visto && visto.existe && !visto.esCarpeta && visto.bytes === 0) vacios.push(r);
  }
  return vacios;
}

/** 4) Archivos con marcadores de truncado («resto del código», «...», TODO). */
export function archivosTruncados(rutas: string[], leer: Lector): string[] {
  const truncados: string[] = [];
  for (const r of rutas) {
    const contenido = leer(r);
    if (contenido === null) continue;
    if (marcadoresBloqueantes(contenido).length > 0) truncados.push(r);
  }
  return truncados;
}

/** 5) Hueco de arranque: lo mínimo para que la app PUEDA levantar. */
export function huecoDeArranque(sonda: Sonda, leer: Lector): string[] {
  const problemas: string[] = [];
  const pkgTxt = leer("package.json");
  if (pkgTxt !== null) {
    try {
      const pkg = JSON.parse(pkgTxt);
      const main = typeof pkg?.main === "string" ? pkg.main.replace(/^\.\//, "") : null;
      if (main && /\.(m?js|cjs|node)$/i.test(main) && !sonda(main)?.existe) {
        problemas.push(`package.json dice main="${main}" y ese archivo no existe`);
      }
    } catch {
      problemas.push("package.json no se puede parsear (JSON inválido): npm no va a arrancar nada");
    }
  }
  const idx = leer("index.html");
  if (idx === null && pkgTxt === null && !sonda("main.py")?.existe && !sonda("app.py")?.existe) {
    problemas.push("no hay punto de entrada: ni index.html, ni package.json, ni main.py/app.py");
  } else if (idx !== null) {
    const scripts = [...idx.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi)].map((s) => s[1]);
    const existentes = scripts.filter((s) => {
      if (/^(https?:|data:|\/\/)/i.test(s)) return true;
      const limpio = s.replace(/^\.\//, "").replace(/^\//, "");
      return sonda(limpio)?.existe;
    });
    if (scripts.length > 0 && existentes.length === 0) {
      problemas.push(`index.html referencia ${scripts.length} script(s) y ninguno existe en disco`);
    }
  }
  return problemas;
}

import { agujerosPWA } from "./certezaPWA"; // v1.57.16 · CERTEZA DE EXPORTACIÓN

export interface VeredictoCompletitud {
  ok: boolean;
  prometidoFalta: string[];
  enlacesRotos: string[];
  vacios: string[];
  truncados: string[];
  arranque: string[];
  /** v1.57.16 · piezas PWA escritas sin cable (manifest huérfano, SW muerto, íconos). */
  pwa: string[];
}

/** Contraste completo: plan ↔ manifiesto ↔ disco. `htmls` = rutas de .html del proyecto. */
export function verificarCompletitud(args: {
  rutasPlan: string[];
  manifiesto: Map<string, { ultimoOk: boolean }>;
  rutasEscritas: string[];
  htmls: string[];
  sonda: Sonda;
  leer: Lector;
}): VeredictoCompletitud {
  const prometidoFalta = prometidoSinObra(args.rutasPlan, args.manifiesto);
  const enlacesRotos: string[] = [];
  for (const h of args.htmls || []) {
    const contenido = args.leer(h);
    if (contenido !== null) enlacesRotos.push(...enlacesAlVacio(h, contenido, args.sonda));
  }
  const todas = [...new Set([...args.rutasEscritas, ...args.rutasPlan])];
  const vacios = archivosVacios(todas, args.sonda);
  const truncados = archivosTruncados(args.rutasEscritas, args.leer);
  const arranque = huecoDeArranque(args.sonda, args.leer);
  const pwa = agujerosPWA(args.rutasEscritas, args.htmls, args.leer);
  return {
    ok:
      prometidoFalta.length === 0 &&
      enlacesRotos.length === 0 &&
      vacios.length === 0 &&
      truncados.length === 0 &&
      arranque.length === 0 &&
      pwa.length === 0,
    prometidoFalta,
    enlacesRotos,
    vacios,
    truncados,
    arranque,
    pwa,
  };
}

/** Acta legible: lo que falta, nombrado. «3 archivos» sin lista es publicidad. */
export function informeCompletitud(v: VeredictoCompletitud): string {
  const partes: string[] = [];
  if (v.prometidoFalta.length) partes.push(`PROMETIDO SIN ESCRIBIR: ${v.prometidoFalta.slice(0, 8).join(", ")}${v.prometidoFalta.length > 8 ? ` … y ${v.prometidoFalta.length - 8} más` : ""}`);
  if (v.enlacesRotos.length) partes.push(`ENLACES AL VACÍO: ${v.enlacesRotos.slice(0, 8).join(" | ")}`);
  if (v.vacios.length) partes.push(`ARCHIVOS DE 0 BYTES: ${v.vacios.slice(0, 8).join(", ")}`);
  if (v.truncados.length) partes.push(`TRUNCADOS: ${v.truncados.slice(0, 8).join(", ")}`);
  if (v.arranque.length) partes.push(`HUECO DE ARRANQUE: ${v.arranque.join(" | ")}`);
  if (v.pwa && v.pwa.length) partes.push(`AGUJEROS DE EXPORTACIÓN (PWA a medias): ${v.pwa.join(" | ")}`);
  if (partes.length === 0) return "";
  return `🧮 COMPLETITUD — el motor contrastó plan ↔ manifiesto ↔ disco y encontró huecos:\n  · ${partes.join("\n  · ")}`;
}
