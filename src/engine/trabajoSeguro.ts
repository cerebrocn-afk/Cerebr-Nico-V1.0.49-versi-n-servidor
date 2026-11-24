/**
 * trabajoSeguro.ts — EL MANUAL DE RUTAS Y FORMAS PARA CADA TRABAJO (v1.95.0)
 * =========================================================================
 * Pedido de Mario (30/10): «implementar trabajo-seguro.ts, que sea una especie de otro
 * manual con todas las formas y rutas relativas para hacer los trabajos: pdf, word, web
 * o app. ¿Cómo hacer para que nunca falten archivos en el proyecto? Creo que todo esto
 * va en ruta de trabajo y en el plan».
 *
 * Qué falla hoy, medido en esta misma casa (no es teoría):
 *  · El PDF: el arnés no tenía máquina de escribir PDF (leer sí: `pdfjs-dist`), así que
 *    el modelo improvisaba bytes como texto → `.pdf` que Edge no abre. 15 mensajes.
 *  · La imagen: `insertar_imagen` con un nombre que no existía caía en «tomo la más
 *    reciente» y devolvía `ok` → la imagen EQUIVOCADA con un ✔ encima.
 *  · Los archivos que faltan: el plan no lleva manifiesto, así que "terminé" nunca se
 *    confronta contra lo que tendría que haber en disco.
 *
 * Este módulo es CRITERIO PURO (sin `fs`, sin red, sin shell): devuelve el texto del
 * manual para inyectar en el prompt, el plan de etapas para `set_plan`, y el auditor que
 * compara el inventario real contra el esperado. Las rutas que nombra son RELATIVAS al
 * workspace, y las herramientas que menciona existen: `tests/trabajoSeguro.test.ts` lo
 * comprueba leyendo los registros reales, porque un manual que promete una herramienta
 * inexistente es la misma mentira de siempre con mejor formato.
 */

export type TipoTrabajo = "pdf" | "word" | "web" | "app";

export const TRABAJO_LISTA: TipoTrabajo[] = ["pdf", "word", "web", "app"];

/** Rutas contractuales del proyecto. Relativas SIEMPRE: el modelo reescribe mal las
 *  absolutas (y en Windows, además, se le rompen las barras). */
export interface RutaTrabajo {
  ruta: string;
  para: string;
  se_escribe_con: string;
  nunca: string;
}

export const RUTAS_TRABAJO: RutaTrabajo[] = [
  {
    ruta: "assets/subidas/",
    para: "las imágenes que el usuario adjunta en el chat (las materializa server.ts)",
    se_escribe_con: "adjuntar en el chat; para usarlas: listar y copiar el nombre exacto",
    nunca: "inventar el nombre del archivo o asumir que se llama como el título de la página",
  },
  {
    ruta: ".creador/",
    para: "los sitios que genera el pack creador-web (cada sitio, una carpeta adentro)",
    se_escribe_con: "crear_sitio · crear_pagina · crear_bloque · insertar_imagen · crear_og_image",
    nunca: "escribir HTML dentro de esta carpeta con write_file a mano",
  },
  {
    ruta: "informes/",
    para: "los documentos que se entregan (PDF, HTML de informe, ZIP)",
    se_escribe_con: "la receta del trabajo correspondente; binarios SIEMPRE por fs_write_b64",
    nunca: "escribir bytes binarios con fs_write (texto) — queda .pdf con contenido roto",
  },
  {
    ruta: "dist/",
    para: "la salida compilada del proyecto (se regenera, no se edita a mano)",
    se_escribe_con: "run_command `npm run build`",
    nunca: "editar archivos dentro de dist/",
  },
  {
    ruta: "src/",
    para: "el código fuente de la IDE (motor y UI)",
    se_escribe_con: "read_file_range → edit_file con ancla de 2 a 4 líneas",
    nunca: "reescribir el archivo completo con write_file (el quirófano lo frena: "
      + "«reescribir idéntico» y «amputación» son sus dos bloqueos reales)",
  },
  {
    ruta: "tests/",
    para: "las vallas; una suite nueva se registra en scripts/validar.mjs el mismo día",
    se_escribe_con: "write_file + alta en scripts/validar.mjs",
    nunca: "dejar una suite en disco sin darla de alta (es un verde que nadie corre)",
  },
];

export interface RecetaTrabajo {
  trabajo: TipoTrabajo;
  titulo: string;
  /** La llamada que alcanza. Si no alcanza con una, se dice acá y no se finge. */
  una_llamada: string;
  pasos: string[];
  /** Lo que el modelo tiene prohibido intentar, con el motivo corto. */
  prohibido: string[];
  /** Qué tiene que haber en disco al terminar, para que el auditor lo confronte. */
  manifiesto: string[];
  /** Verificación que se hace LEYENDO, no recordando. */
  verificacion: string;
  /** Lo que todavía no existe en el arnés (para no prometerlo). */
  pendiente?: string;
}

export const RECETAS: Record<TipoTrabajo, RecetaTrabajo> = {
  pdf: {
    trabajo: "pdf",
    titulo: "Informe en PDF",
    una_llamada: "construir el documento con src/engine/pdfMinimo.ts (construirPdf) y "
      + "escribir los bytes con fs_write_b64 en informes/<slug>.pdf — una escritura, no un guion externo",
    pasos: [
      "Armar el contenido como DocumentoPdf { titulo, subtitulo?, fecha?, secciones:[{titulo, parrafos[], puntos[]}], pie? }.",
      "construirPdf(doc) → Uint8Array. Nada de escribir `%PDF-…` a mano.",
      "fs_write_b64 con data_b64 = el archivo completo en base64 (una sola línea, sin envoltorios).",
      "Leer la respuesta: el puente devuelve bytes y páginas LEÍDAS del archivo. Esos números, y no otros, van en el informe al usuario.",
    ],
    prohibido: [
      "fs_write para el .pdf: escribe texto literal y produce un PDF ilegible (el puente ahora lo niega con 400).",
      "generador_informe.py con reportlab: el Python embebido trae 0 paquetes de pip, el import revienta y el modelo lo lee como «mi código está mal».",
      "escribir los bytes del PDF como texto en el chat para que los copie el usuario.",
    ],
    manifiesto: ["informes/"],
    verificacion: "el {bytes, paginas} que devuelve fs_write_b64; si falta alguno, el PDF NO se dio por hecho.",
  },

  word: {
    trabajo: "word",
    titulo: "Documento editable (Word)",
    una_llamada: "crear_docx con { path: informes/<slug>.docx, titulo, secciones:[{titulo?, parrafos[], puntos[], tabla[][]}], nota? } — una sola escritura",
    pasos: [
      "Armar DocumentoDocx: secciones con titulo / parrafos / puntos / tabla (primera fila = encabezado).",
      "crear_docx escribe el paquete Office Open XML, lo REABRE para auditarlo y devuelve bytes, partes, parrafos y una muestra de texto LEIDA del archivo.",
      "Si el usuario quería «editable» a secas, .docx es la respuesta; si quería algo que nadie pueda retocar, va crear_pdf.",
    ],
    prohibido: [
      "renombrar un .pdf o un .html a .docx: Word lo rechaza y el usuario pierde el archivo.",
      "fs_write para el .docx (es un ZIP: binario) ni escribir `<?xml` a mano en un archivo .docx.",
      "python-docx: el Python embebido trae 0 paquetes de pip.",
    ],
    manifiesto: ["informes/"],
    verificacion: "el {bytes, partes, parrafos, muestra} que devuelve crear_docx — viene de reabrir el paquete y verificar el CRC de cada entrada.",
    pendiente: "imágenes y estilos de marca propia dentro del .docx (la máquina escribe texto, viñetas y tablas, no incrusta fotos).",
  },

  web: {
    trabajo: "web",
    titulo: "Sitio o landing",
    una_llamada: "forjar_desde_brief (o crear_sitio + crear_pagina) y recién después insertar_imagen",
    pasos: [
      "Para ver qué imágenes existen DE VERDAD: listar `assets/subidas/` y copiar el nombre exacto. Nunca escribir el nombre de memoria.",
      "crear_sitio (o forjar_desde_brief para la tanda completa) → crea la carpeta adentro de .creador/.",
      "insertar_imagen con origen = el nombre listada; devuelve el `ref` exacto que va en hero_imagen/galeria[].imagen.",
      "Con ese `ref` se arma la página (crear_pagina / crear_bloque / mejorar_pagina).",
      "previsualizar_sitio y, si se pide entrega, exportar_sitio_zip.",
    ],
    prohibido: [
      "usar un archivo que no se listó (insertar_imagen ahora responde None + la lista de opciones; no pone otra imagen en silencio).",
      "escribir index.html a mano dentro de .creador/ con write_file: saltea el pack y el preflight.",
      "referenciar imágenes remotas como si fueran locales — el pack no descarga.",
    ],
    manifiesto: [".creador/"],
    verificacion: "listar_sitios y el ref que devolvió insertar_imagen; la imagen embebida es la que devuelve la herramienta, no la que se recordó.",
  },

  app: {
    trabajo: "app",
    titulo: "App (APK) o proyecto con build propio",
    una_llamada: "para el ANDROID ya preparado: exportar_apk; para cualquier proyecto, run_command con el script real de package.json",
    pasos: [
      "Antes de correr nada, leer package.json y usar los nombres de script que aparecen ahí (inventa menos de lo que parece: `npm run build` vs `compile` ya costó un ciclo entero).",
      "El sandbox arranca en :3500 y el preview se refresca solo al sincronizar.",
      "Si el proyecto trae node_modules incompleto, se reinstala; si hay fuentes más nuevas que dist/, se recompila.",
    ],
    prohibido: [
      "correr el proyecto de la propia IDE como si fuera el del usuario (una segunda CerebroNico dentro del preview: pasa, y se ve como «esto está dentro»).",
      "escribir binarios de build a mano.",
    ],
    manifiesto: [],
    verificacion: "el puerto arriba y la ruta que reporta el arranque, leídos del estado — no del enunciado del pedido.",
  },
};

/** El texto que ve el modelo. Corto a propósito: el presupuesto del prompt es real y un
 *  manual que desplaza a la tarea no es un manual, es ruido. */
export function manualDeTrabajo(trabajos: TipoTrabajo[] = TRABAJO_LISTA): string {
  const rutas = RUTAS_TRABAJO.map((r) => `  · ${r.ruta} → ${r.para}. Se escribe con: ${r.se_escribe_con}. Nunca: ${r.nunca}.`).join("\n");
  const recetas = trabajos.map((t) => {
    const r = RECETAS[t];
    return `[${r.titulo}] una llamada: ${r.una_llamada}\n`
      + `  pasos: ${r.pasos.join(" → ")}\n`
      + `  prohibido: ${r.prohibido.join(" | ")}`
      + (r.pendiente ? `\n  todavía no hay: ${r.pendiente}` : "");
  }).join("\n");
  return "RUTAS Y FORMAS DE TRABAJO (de memoria no se nombra ni una ruta)\n"
    + "Rutas relativas del proyecto:\n" + rutas + "\n\nRecetas:\n" + recetas
    + "\n\nRegla de cierre: un trabajo no está terminado porque lo digo; está terminado cuando el archivo "
    + "existe, pesa lo que devolvió la herramienta y abre. Si falta una pieza del manifiesto, se nombra "
    + "la que falta en vez de decir «listo».";
}

/** Las etapas que van al plan (`set_plan`), con el manifiesto como última etapa. */
export function planDeTrabajo(trabajo: TipoTrabajo, titulo: string): { titulo: string; peso: string }[] {
  const r = RECETAS[trabajo];
  const etapas = r.pasos.map((p) => ({ titulo: p, peso: "media" }));
  etapas.push({ titulo: `Verificar leyendo disco: ${r.verificacion}`, peso: "alta" });
  if (r.manifiesto.length) {
    etapas.push({ titulo: `Manifiesto de «${titulo}»: no debe faltar ${r.manifiesto.join(", ")}`, peso: "alta" });
  }
  return etapas;
}

/** Qué archivos/deudas deja cada trabajo si se hace bien. Es el germen del manifiesto. */
export function inventarioEsperado(trabajo: TipoTrabajo): string[] {
  return [...RECETAS[trabajo].manifiesto];
}

/**
 * El «¿cómo hago para que nunca falten archivos?»: no se reza, se difféa.
 * `archivos` es la lista de rutas relativas que reporta `list_files`. Devuelve lo que
 * falta y lo que quedó huérfano respecto del trabajo declarado.
 */
export function auditarInventario(archivos: string[], esperado: string[]): { ok: boolean; faltan: string[]; total: number } {
  const lista = (archivos || []).map((a) => String(a).replace(/\\/g, "/"));
  const faltan = (esperado || []).filter((e) => {
    const limpio = e.replace(/\/+$/, "");
    return !lista.some((a) => a === limpio || a.startsWith(limpio + "/") || a.includes("/" + limpio + "/") || a.endsWith("/" + limpio));
  });
  return { ok: faltan.length === 0, faltan, total: lista.length };
}

export const VERSION_TRABAJO_SEGURO = "1.95.0";
