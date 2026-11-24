/**
 * entregable.ts — EL NOMBRE Y EL ESTADO DEL PAQUETE (v1.98.0)
 * ============================================================
 * Queja literal del 31/10: «siempre dice descargar todo zip, debería estar cuando
 * el pedido esté empacado ¿no? con su nombre y todo». Dos defectos reales:
 *
 *   1) EL NOMBRE ESTABA FIJO EN EL CÓDIGO. `Content-Disposition` decía
 *      `entregable-cerebronico.zip` siempre (server/sandboxEntregable.ts:117), así
 *      que descargar dos proyectos distintos daba dos veces el mismo archivo y el
 *      navegador terminaba escribiendo `entregable-cerebronico (1).zip`. Un
 *      entregable sin nombre no se puede citar, ni mover, ni mandar.
 *   2) EL BOTÓN NO DECÍA NADA DEL ESTADO. Se ofrecía con `entradas.length > 0`:
 *      un archivo suelto en el sandbox ya era «Entregable: 1 archivo (s)» con
 *      botón verde, igual que un proyecto terminado. El usuario no podía saber si
 *      estaba descargando la app o un pedazo a medias.
 *
 * Este módulo es PURA función sobre listas de nombres y problemas ya detectados:
 * mira el disco quien sabe de discos (server/sandboxEntregable.ts), acá se decide
 * cómo se llama el paquete y qué significa «empacado». El criterio de «empacado»
 * es el que la casa ya usa en `completitud.huecoDeArranque`: que se pueda
 * LEVANTAR, no que sea bonito. La documentación NO es requisito: si el proyecto no
 * trae RECORDATORIO/LEEME/README, el propio ZIP la arma al empacarse.
 */

/** Cuando no hay forma de saber el proyecto, el paquete se llama así (como siempre). */
export const PROYECTO_POR_DEFECTO = "entregable-cerebronico";

/** Nombres de carpeta que no son un proyecto: son el envoltorio del sandbox. */
const NOMBRES_DE_ENVOLTORIO = new Set(["sandbox", "workspace", "app", "public", "www", "root", "data", "output", "out", ".", ""]);

/**
 * Slug de nombre de archivo. Sin acentos, sin espacios, sin símbolos: el nombre
 * viaja por una cabecera HTTP y termina en un sistema de archivos ajeno. Se
 * conserva lo legible (`Control-Dinero` → `control-dinero`) porque el usuario tiene
 * que RECONOCER su proyecto al mirar la carpeta de descargas.
 */
export function nombreSeguro(texto: string, piso = PROYECTO_POR_DEFECTO): string {
  const s = String(texto || "")
    .normalize("NFD")
    // Los acentos se van después del NFD (los dos caracteres de `á`), no antes.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "")
    .replace(/-{2,}/g, "-");
  if (s.length < 2) return piso;
  return s.slice(0, 60);
}

/**
 * La carpeta del proyecto dentro de la raíz recopilada, o `null` si lo recopilado
 * está suelto en la raíz. Es el caso real del log del 31/10: el agente escribe
 * `web-cerebronico/index.html`, de modo que el punto de entrada NO está en la raíz
 * del sandbox sino un renglón más abajo. Todo el que quiera preguntar «¿esto
 * arranca?» tiene que preguntar dentro de esa carpeta, y para eso hace falta una
 * sola función que diga cuál es — no dos criterios distintos de la misma pregunta.
 */
export function carpetaDeProyecto(nombresRelativos: string[]): string | null {
  const primeros = new Set(nombresRelativos.map((n) => String(n).split("/")[0]).filter(Boolean));
  if (primeros.size !== 1) return null;
  const [unico] = [...primeros];
  // Si ningún nombre tiene "/", el primer renglón es un ARCHIVO, no una carpeta.
  if (!nombresRelativos.some((n) => String(n).includes("/"))) return null;
  return NOMBRES_DE_ENVOLTORIO.has(unico.toLowerCase()) ? null : unico;
}

/**
 * Cuál es el proyecto. Si TODO lo recopilado cuelga de un mismo primer renglón y
 * ese renglón no es un envoltorio del sandbox, ese es el nombre (el caso real del
 * log: `web-cerebronico/index.html`, `web-cerebronico/styles.css`…). Si no, manda
 * el nombre de la raíz resuelta, y si ése tampoco dice nada, el por defecto.
 */
export function proyectoDe(nombresRelativos: string[], nombreDeRaiz = ""): string {
  const carpeta = carpetaDeProyecto(nombresRelativos);
  if (carpeta) return nombreSeguro(carpeta);
  const raiz = nombreDeRaiz.trim();
  if (raiz && !NOMBRES_DE_ENVOLTORIO.has(raiz.toLowerCase())) return nombreSeguro(raiz);
  return PROYECTO_POR_DEFECTO;
}

/** `AAAA-MM-DD` en hora local: es la fecha que el usuario ve en el reloj. */
export function fechaDePaquete(f: Date | number | string = new Date()): string {
  const d = f instanceof Date ? f : new Date(f);
  if (!Number.isFinite(d.getTime())) return new Date().toISOString().slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** El archivo que va a la carpeta de descargas: proyecto + fecha + .zip. */
export function nombreDelZip(proyecto: string, fecha: string): string {
  return `${nombreSeguro(proyecto)}-${fecha}.zip`;
}

export interface EstadoPaquete {
  /** true = se puede descargar como entrega terminada. */
  listo: boolean;
  /** Qué falta para que sea una entrega (vacío cuando está listo). */
  faltan: string[];
  /** El proyecto trae documentación escrita por el modelo (no la generada). */
  tieneDocsPropias: boolean;
  /** Hay punto de entrada (index.html / package.json / main.py / app.py). */
  tieneArranque: boolean;
}

const ES_DOC = /(^|\/)(RECORDATORIO|LEEME|LEERME|README|CAMBIOS|CHANGELOG)([_-][^/]*)?\.(md|txt)$/i;
const ES_PUNTO_DE_ENTRADA = /(^|\/)(index\.html|package\.json|main\.py|app\.py|index\.php)$/i;

/**
 * «Empacado» = hay con qué levantar lo que hay, y el juez de arranque no encontró
 * hoyos. Los `problemasDeArranque` los aporta `completitud.huecoDeArranque` (una
 * sola definición de «esto arranca» en toda la casa).
 */
export function estadoDelPaquete(nombresRelativos: string[], problemasDeArranque: string[] = []): EstadoPaquete {
  const nombres = nombresRelativos.map((n) => String(n));
  const tieneArranque = nombres.some((n) => ES_PUNTO_DE_ENTRADA.test(n));
  const tieneDocsPropias = nombres.some((n) => ES_DOC.test(n));
  const faltan: string[] = [];
  if (!tieneArranque) {
    faltan.push("no hay punto de entrada (index.html, package.json, main.py o app.py): el ZIP trae archivos, no una app levantable");
  }
  for (const p of problemasDeArranque) if (p && !faltan.includes(p)) faltan.push(p);
  if (faltan.length === 0 && !tieneDocsPropias) {
    // No es un defecto: el servidor arma el RECORDATORIO.md al empacar. Se informa
    // para que el usuario sepa que la documentación sale del IDE, no del modelo.
    faltan.push("la documentación del paquete la genera el IDE al descargar (el proyecto no escribió RECORDATORIO.md ni README.md)");
  }
  return { listo: tieneArranque && problemasDeArranque.length === 0, faltan, tieneDocsPropias, tieneArranque };
}

/**
 * Cabecera de descarga con nombre real. Se manda el ASCII (para el navegador viejo
 * que sea) y el `filename*` UTF-8 (para el nombre tal como se escribió): una sola
 * de las dos formas no alcanza.
 */
export function cabeceraDeDescarga(nombre: string): string {
  const crudo = String(nombre || "").trim() || `${PROYECTO_POR_DEFECTO}.zip`;
  // La extensión se fija ANTES de las dos formas de la cabecera: `filename*` sin
  // `.zip` descarga un archivo que el sistema operativo no sabe qué es.
  const conExtension = /\.zip$/i.test(crudo) ? crudo : `${crudo}.zip`;
  const ascii = nombreSeguro(conExtension, "entregable");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(conExtension)}`;
}

// ════════════════════════════════════════════════════════════════════════════
// v2.0.1 · LOS ENTREGABLES SE NOMBRAN, SE PESAN Y SE BAJAN DE UNO EN UNO
// ════════════════════════════════════════════════════════════════════════════
/**
 * Pedido del 1/11 (con las dos capturas de la interfaz): «quiero la barra de
 * tareas con el formato del chat y solo español, no tanto; código, avisos,
 * descripciones, post data y entregables con nombre y peso para descargar».
 *
 * La hoja de ruta hasta acá decía una sola cifra global («6 archivos · 42 KB») y
 * un botón que bajaba todo junto. Eso responde «¿cuánto pesa?» pero no responde
 * «¿qué me estoy bajando?». Desde acá el servidor devuelve los archivos
 * agrupados en los cinco grupos que el usuario nombró, cada uno con su peso.
 *
 * El criterio vive en este módulo puro (no en `server/`) por la misma razón que
 * el resto del archivo: mira listas de nombres, no discos. Quien tiene el disco
 * decide CUÁNTOS bytes pesa cada uno; acá se decide CÓMO se llama el grupo.
 */

/** Los cinco grupos pedidos, en el orden en que se muestran. */
export type CategoriaEntregable = "codigo" | "avisos" | "descripciones" | "datos" | "paquetes";

export interface GrupoEntregable {
  id: CategoriaEntregable;
  /** El rótulo que ve el usuario: en español, sin abreviaturas del motor. */
  titulo: string;
  /** Una línea de qué hay adentro, para no tener que adivinar por la extensión. */
  descripcion: string;
  archivos: number;
  bytes: number;
  peso: string;
  items: { ruta: string; nombre: string; bytes: number; peso: string }[];
  /** Cuántos quedaron afuera del recorte (nunca se ocultan en silencio). */
  ocultos: number;
}

/** Títulos en español, tal como los pidió el usuario. */
export const TITULOS_DE_GRUPO: Record<CategoriaEntregable, string> = {
  codigo: "Código",
  avisos: "Avisos",
  descripciones: "Descripciones",
  datos: "Datos",
  paquetes: "Entregables",
};

export const DESCRIPCIONES_DE_GRUPO: Record<CategoriaEntregable, string> = {
  codigo: "lo que hace funcionar el proyecto",
  avisos: "fallas, pendientes y bitácoras",
  descripciones: "documentación y cómo arrancarlo",
  datos: "cargos enviados (POST), exportaciones y tablas",
  paquetes: "el archivo final, listo para mandar",
};

/** El orden de lectura de la hoja: primero lo que se escribió, al final el paquete. */
export const ORDEN_DE_GRUPOS: CategoriaEntregable[] = ["codigo", "avisos", "descripciones", "datos", "paquetes"];

/** Extensiones de paquete/binario: eso ES el entregable, no una parte de él. */
const ES_PAQUETE = /\.(zip|rar|7z|tar|gz|tgz|bz2|exe|msi|apk|aab|jar|deb|rpm|dmg|AppImage|iso|pdf|png|jpe?g|gif|webp|bmp|tiff|ico|mp4|webm|mov|mp3|wav|ogg|flac)$/i;
/** Bitácoras y avisos: se llaman así o son `.log`. */
const ES_AVISO = /(^|\/)(avisos?|alertas?|advertencias?|incidencias?|pendien?tes?|errores?|fallos?|warn(ings?)?|notificaciones?|bitacoras?|changes?|cambios|logs?|todo|tareas?|recordatorios?)([-_.][^/]*)?\.(md|txt|log|json|csv)$/i;
/** Cargos y exportaciones: lo que viaja por un POST o lo que sale de una tabla. */
const ES_DATOS = /\.(json|jsonl|ndjson|csv|tsv|xml|ya?ml|toml|ini|env|sql|db|sqlite3?|parquet|xlsx?|xls)$/i;
const ES_DATOS_POR_NOMBRE = /(^|\/)(post|payload|request|response|respuesta|petici[oó]n|cargo|exportaci[oó]n|volcado|session|sesi[oó]n)([-_.][^/]*)?\.(json|jsonl|ndjson|csv|txt|md)$/i;
const ES_DESCRIPCION = /\.(md|markdown|rst|txt|adoc|docx?|odt|rtf|epub)$/i;
const ES_CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs|py|html?|css|scss|sass|less|styl|vue|svelte|java|kt|kts|swift|c|h|cpp|hpp|cc|cs|go|rs|php|rb|lua|pl|sh|bash|ps1|bat|cmd|glsl|frag|vert|wasm|toml)$/i;
/**
 * Estos `.json` son CÓDIGO de proyecto, no datos: sin ellos la app no levanta y
 * nadie los baja para mirar una tabla. Se listan a mano porque la extensión sola
 * mentiría (el pedido del usuario distingue «datos» de «código»).
 */
export const MANIFIESTOS_DE_CODIGO = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|tsconfig([.-][^/]*)?\.json|jsconfig\.json|composer\.json|pubspec\.yaml|manifest\.json|deno\.jsonc?|bun\.lockb?)$/i;

/** El grupo de un archivo, con el criterio aplicado en el orden justo. */
export function clasificarArchivo(ruta: string): CategoriaEntregable {
  const r = String(ruta || "").replace(/\\/g, "/");
  // 1) Un `.md` que se llama AVISOS.md es un aviso, no una descripción.
  if (ES_AVISO.test(r) || /\.log$/i.test(r)) return "avisos";
  // 2) El paquete manda: un `.zip` dentro del proyecto es la entrega, no código.
  if (ES_PAQUETE.test(r)) return "paquetes";
  // 3) `package.json` y compañía son código aunque terminen en `.json`.
  if (MANIFIESTOS_DE_CODIGO.test(r)) return "codigo";
  // 4) Un `post-data.json` o una exportación son datos aunque terminen en `.json`.
  if (ES_DATOS_POR_NOMBRE.test(r)) return "datos";
  if (ES_DESCRIPCION.test(r)) return "descripciones";
  if (ES_DATOS.test(r)) return "datos";
  if (ES_CODIGO.test(r)) return "codigo";
  // 5) Lo que no se reconoce no se esconde: cae en el grupo de documentación,
  //    que es donde el usuario va a preguntar «¿esto qué es?».
  return "descripciones";
}

/** El nombre del archivo, sin la carpeta delante (la ruta completa va en `ruta`). */
function nombreDeArchivo(ruta: string): string {
  const partes = String(ruta || "").replace(/\\/g, "/").split("/");
  return partes[partes.length - 1] || ruta;
}

/**
 * Peso legible EN ESPAÑOL: coma decimal, espacios de millar y una sola cifra
 * decimal a partir de 1 MB. El usuario tiene que poder comparar dos archivos de
 * un vistazo; `14334820 bytes` no se compara, `13,7 MB` sí.
 */
export function pesoLegible(bytes: number): string {
  const b = Number.isFinite(bytes) ? Math.max(0, Math.round(Number(bytes) || 0)) : 0;
  if (b < 1024) return `${b} bytes`;
  const kb = b / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${(mb / 1024).toFixed(2).replace(".", ",")} GB`;
}

/**
 * La hoja agrupada. `topePorGrupo` recorta la lista que viaja al navegador (una
 * hoja de 3 px de ancho no puede mostrar 900 filas), pero NUNCA recorta la
 * cuenta: `archivos` y `bytes` son del grupo completo y `ocultos` dice cuántos
 * quedaron afuera de la vista. Esconder sin decirlo es justo lo que este proyecto
 * combate.
 */
export function agruparEntregables(
  entradas: { ruta: string; bytes: number }[],
  topePorGrupo = 8,
): GrupoEntregable[] {
  const baldes = new Map<CategoriaEntregable, { items: GrupoEntregable["items"]; archivos: number; bytes: number }>();
  for (const e of entradas || []) {
    const ruta = String(e?.ruta || "").replace(/\\/g, "/");
    if (!ruta) continue;
    const id = clasificarArchivo(ruta);
    const baldeso = baldes.get(id) || { items: [], archivos: 0, bytes: 0 };
    const bytes = Number.isFinite(e?.bytes) ? Math.max(0, Math.round(Number(e.bytes) || 0)) : 0;
    baldeso.items.push({ ruta, nombre: nombreDeArchivo(ruta), bytes, peso: pesoLegible(bytes) });
    baldeso.archivos++;
    baldeso.bytes += bytes;
    baldes.set(id, baldeso);
  }
  const tope = Math.max(1, topePorGrupo);
  return ORDEN_DE_GRUPOS.filter((id) => baldes.has(id)).map((id) => {
    const g = baldes.get(id)!;
    // Lo más pesado primero: si hay que recortar, que se vea lo que ocupa.
    g.items.sort((a, b) => b.bytes - a.bytes || a.ruta.localeCompare(b.ruta));
    return {
      id,
      titulo: TITULOS_DE_GRUPO[id],
      descripcion: DESCRIPCIONES_DE_GRUPO[id],
      archivos: g.archivos,
      bytes: g.bytes,
      peso: pesoLegible(g.bytes),
      items: g.items.slice(0, tope),
      ocultos: Math.max(0, g.archivos - tope),
    };
  });
}

/**
 * Cabecera de descarga para UN ARCHIVO CUALQUIERA (no solo el ZIP).
 * `cabeceraDeDescarga` fija `.zip` porque ese era su trabajo; reusarla para
 * `index.html` bajaría un `index.html.zip` que nadie pidió. Acá la extensión del
 * nombre real se conserva tal cual y el ASCII solo limpia el envoltorio.
 */
export function cabeceraDeDescargaArchivo(nombre: string): string {
  const crudo = String(nombre || "").trim().replace(/^.*[\\/]/, "") || "archivo";
  const ascii = crudo.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(crudo)}`;
}

/** Tipo de contenido por extensión: sin esto el navegador abre el archivo en otra pestaña. */
export function tipoDeContenido(ruta: string): string {
  const r = String(ruta || "").toLowerCase();
  const mime: [RegExp, string][] = [
    [/\.html?$/, "text/html; charset=utf-8"],
    [/\.(css|scss|less)$/, "text/css; charset=utf-8"],
    [/\.(js|mjs|cjs)$/, "text/javascript; charset=utf-8"],
    [/\.(ts|tsx)$/, "text/plain; charset=utf-8"],
    [/\.(json|jsonl|ndjson)$/, "application/json; charset=utf-8"],
    [/\.(csv|tsv)$/, "text/csv; charset=utf-8"],
    [/\.(md|markdown|txt|log|ini|yml|yaml|sh|bat|ps1)$/, "text/plain; charset=utf-8"],
    [/\.xml$/, "text/xml; charset=utf-8"],
    [/\.zip$/, "application/zip"],
    [/\.(png|jpe?g|gif|webp|bmp|ico)$/, "application/octet-stream"],
    [/\.(pdf)$/, "application/pdf"],
  ];
  for (const [patron, valor] of mime) if (patron.test(r)) return valor;
  return "application/octet-stream";
}

/**
 * Ruta segura DENTRO del sandbox, o `null` si el pedido intenta salirse.
 * Devuelve la ruta relativa limpia (con `/`), no absoluta: la arma el que conoce
 * el disco. Este módulo no importa `node:path` a propósito — es puro y se prueba
 * igual en el navegador que en el servidor.
 *
 * Rechaza: ruta absoluta, letra de unidad de Windows, separador nulo y cualquier
 * tramo `..`. El `..` es el caso que importa: `GET ?archivo=../../../etc/passwd`
 * es la única forma real de que un botón de descarga se vuelva lectura de disco
 * ajeno.
 */
export function rutaDentroDeSandbox(relativa: string): string | null {
  const crudo = String(relativa || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!crudo || crudo.includes("\0")) return null;
  if (/^[a-z]:\//i.test(crudo) || crudo.startsWith("/")) return null;
  const tramos = crudo.split("/").filter((p) => p && p !== ".");
  if (!tramos.length || tramos.some((p) => p === "..")) return null;
  return tramos.join("/");
}

/**
 * v1.0.11 · LOS ÓRGANOS DEL IDE NO SON ENTREGABLES DE LA SESIÓN (pedido de
 * Mario: «muestra muchos archivos para descargar que no son de la sesión, he
 * visto md y cosas de CerebroNico»). Solo aplica cuando el paquete se recorre
 * DESDE la raíz de datos sin carpeta vinculada: en una carpeta de proyecto
 * vinculada todo es obra (allá un CHANGELOG.md es del proyecto, no de la IDE).
 * Lista conservadora: nombres propios de la casa; un README/LEEME genérico NO
 * se filtra (podría ser del proyecto); los archivos del motor siempre viven en
 * la RAÍZ de datos, así que solo se filtra a profundidad 0.
 */
const ORGANO_RAIZ = /^\/(memoria|cerebro|cerebro_backend|cerebro_frontend|perfeccion|autovalido|SKILLS|ACTIVAR-SKILLS-OAUTH|CORRECCIONES|EXPORT-CONTEXTO|RUTAS-DEL-SISTEMA|SUPERFICIE_RUTAS|INDICE-DOCUMENTACION|INDICE_MAESTRO|CHANGELOG|MANIFIESTO-UNICO|MANIFIESTO-LIMPIEZA|MANIFIESTO_SHA256|LEEME-PRIMERO|LEEME-ANDROID|LEEME-EMPAQUETADO|GUIA-INSTALADOR-EXE-Y-APK|CLAUSULAS-DE-ADJUNTO|COMODIDAD-Y-LIMPIEZA[^/]*|HOJA_DE_RUTA[^/]*|IDEAS-PARA-PERFECCIONAR[^/]*|FASE\d-[^/]*|DOCUMENTACION-EMPAQUETADO[^/]*|LIMPIEZA-DE-TAREA|RECETA-[^/]*|CORRECCIONES-PUERTOS[^/]*|CREDITOS-SKILLS-EXTERNAS|HEMISFERIOS-y-RAIZ|INTEGRACION_SPEC_MASTER[^/]*|CerebroNico-IDE-v[^/]*MANIFIESTO[^/]*|ACTIVAR-SKILLS-OAUTH)\.(md|txt|html|json)$/i;
const ORGANO_DIR_RAIZ = /^\/(cerebro|\.cerebro-db|memoria_history|logs|\.creador|\.cn-preview|documentacion|docs|manual-motor|node_modules|\.git|public|scripts|extensions|src|server|tests|tools|runtime|dist|dist_electron|build|out|node_modules|_archivo-consolidado|historico-actualizaciones)(\/|$)/i;
export function esOrganoDelIDE(rel: string): boolean {
  const r = "/" + String(rel || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (ORGANO_DIR_RAIZ.test(r)) return true;
  if (!r.slice(1).includes("/")) {
    if (ORGANO_RAIZ.test(r)) return true;
    if (/[.]bat$|[.]ps1$|[.]cjs$/i.test(r)) return true; // lanzadores de la IDE (arrancar_*, FIJAR-VERSION…)
    if (/^\/(_|verificar-|test[-_.])/.test(r)) return true; // rasclo en la raíz
    if (/^\/(contrato-rutas|metadata|components|tsconfig|vite[.]config|tailwind[.]config|postcss[.]config|package[-.]\w+|requirements|Fase)\./i.test(r)) return true;
  }
  return false;
}

/**
 * v1.0.22 · TODO ENTREGABLE VIAJA DENTRO DE SU CARPETA.
 * ====================================================
 * Segunda mitad del incidente del 16/11 («lo descomprimí y explotó toda la
 * carpeta C:\Cerebronico»): aunque el contenido sea legítimo, un ZIP con los
 * archivos en la raíz se descomprime SUELTO y se mezcla con lo que ya había.
 * Un entregable es una carpeta que se puede mirar, comparar y borrar entera.
 *
 * Si las entradas YA vienen con el primer tramo igual al nombre del envoltorio
 * (el caso de un proyecto resuelto a su subcarpeta), no se envuelve dos veces.
 */
export function envolverEntradas<T extends { nombre: string }>(entradas: T[], carpeta: string): T[] {
  const env = nombreSeguro(carpeta) || PROYECTO_POR_DEFECTO;
  const yaEnvuelto = entradas.length > 0 && entradas.every((e) => String(e.nombre).startsWith(`${env}/`));
  if (yaEnvuelto) return entradas;
  return entradas.map((e) => ({ ...e, nombre: `${env}/${String(e.nombre).replace(/^\/+/, "")}` }));
}
