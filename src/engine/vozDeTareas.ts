/**
 * vozDeTareas.ts — LA BARRA HABLA ESPAÑOL (v1.0.11)
 * ==================================================
 * PEDIDO DE MARIO (09/11, con captura mental de la barra):
 *   «en la barra de tareas solo muestra comandos como write_file con una X o un
 *   visto de que hizo bien la tarea, pero NO SE SABE QUÉ HIZO, no lo menciona
 *   en español».
 *
 * La barra mostraba el identificador técnico de la herramienta (eso es para el
 * log y el acta, no para un humano). Acá cada herramienta tiene su FRASE en
 * español, derivada de lo que realmente hizo (el `detail` que ya venía con la
 * acción: ruta, bytes, comando). El nombre técnico NO desaparece: viaja como
 * tooltip para cuando Mario depura. Una barra que solo dice `write_file ✓`
 * cuenta actividades; una que dice «escribió index.html (2 341 bytes)» cuenta
 * PROGRESO.
 *
 * Pura: sin fs, sin reloj, sin React. Determinista: misma acción, misma frase.
 */

export interface AccionVista {
  tool: string;
  ok: boolean;
  detail?: string;
}

/** Verbo español por herramienta. Lo desconocido cae en la plantilla honesta. */
const VERBOS: Record<string, [string, string]> = {
  // [hecho, haciendo]
  write_file: ["escribió", "escribiendo"],
  edit_file: ["modificó", "modificando"],
  fs_write: ["escribió en la PC", "escribiendo en la PC"],
  pc_write_file: ["escribió en la PC", "escribiendo en la PC"],
  append_file: ["añadió al final de", "añadiendo al final de"],
  crear_carpeta: ["creó la carpeta", "creando carpeta"],
  borrar_archivo: ["borró", "borrando"],
  delete_file: ["borró", "borrando"],
  read_file: ["leyó", "leyendo"],
  fs_read: ["leyó de la PC", "leyendo de la PC"],
  list_files: ["listó los archivos", "listando archivos"],
  fs_list: ["listó la carpeta de la PC", "listando la PC"],
  buscar_en_archivos: ["buscó en los archivos", "buscando en los archivos"],
  search_files: ["buscó archivos", "buscando archivos"],
  run_command: ["ejecutó un comando", "ejecutando un comando"],
  run_py: ["ejecutó código Python", "ejecutando Python"],
  revisar_cambios: ["revisó la obra en el quirófano", "revisando la obra"],
  deshacer_cambios: ["deshizo el último cambio", "deshaciendo"],
  abrir_previsualizador: ["abrió la vista previa", "abriendo la vista previa"],
  iniciar_todo: ["levantó los servicios de la PC", "levantando los servicios"],
  iniciar_sandbox: ["levantó el sandbox", "levantando el sandbox"],
  arrancar_puente: ["levantó el puente PC", "levantando el puente"],
  terminar_tarea: ["terminó la tarea", "terminando"],
  analizar_imagen: ["miró una imagen", "mirando una imagen"],
  describir_imagen: ["describió una imagen", "describiendo una imagen"],
  leer_imagen: ["leyó una imagen", "leyendo una imagen"],
  crear_pdf: ["generó un PDF", "generando el PDF"],
  crear_docx: ["generó un documento Word", "generando el Word"],
  crear_xlsx: ["generó una hoja Excel", "generando el Excel"],
  crear_pptx: ["generó una presentación", "generando la presentación"],
  crear_zip: ["empaquetó un ZIP", "empaquetando el ZIP"],
  web_search: ["buscó en la web", "buscando en la web"],
  web_fetch: ["consultó una página", "consultando una página"],
  memory_search: ["consultó la memoria", "consultando la memoria"],
  plan_update: ["actualizó el plan", "actualizando el plan"],
  spawn: ["pidió ayuda a un especialista", "coordinando al especialista"],
};

/** Limpia el detail técnico a algo legible: quita JSON anidado y URLs largas. */
function destello(det: string): string {
  let d = String(det || "").trim();
  if (!d) return "";
  try {
    const j = JSON.parse(d);
    if (j && typeof j === "object") {
      d = String(j.path || j.ruta || j.file || j.comando || j.command || j.mensaje || j.error || "").trim() || d;
    }
  } catch { /* detalle ya legible */ }
  d = d.replace(/^"|"$/g, "");
  return d.length > 90 ? d.slice(0, 87) + "…" : d;
}

/**
 * Frase humana para la barra. `hecha` = estado pasado (línea cerrada ✓/✗);
 * en curso usa el gerundio. El fracaso agrega el motivo si la acción lo traía.
 */
export function fraseDeAccion(a: AccionVista, enCurso = false): string {
  const par = VERBOS[a.tool];
  const verbo = par ? (enCurso ? par[1] : par[0]) : enCurso ? `usando ${a.tool}` : `usó ${a.tool}`;
  const det = destello(a.detail || "");
  let frase = det ? `${verbo} ${det}` : verbo;
  if (!/[.!?…]$/.test(frase)) frase += " · ";
  return frase.replace(/ · $/, enCurso ? "…" : ".");
}

/** Etiqueta corta para el encabezado de la agrupación ×N. */
export function etiquetaDeAgrupacion(tool: string, n: number): string {
  const par = VERBOS[tool];
  if (!par) return `${tool} ×${n}`;
  return n > 1 ? `${par[0]} ×${n}` : par[0];
}
