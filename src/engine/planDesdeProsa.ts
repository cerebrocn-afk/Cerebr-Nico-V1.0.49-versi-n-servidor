/**
 * planDesdeProsa.ts — EL PLAN DE PALABRAS LLEGA AL PLANIFICADOR (v1.70.6)
 * ========================================================================
 * 🐞 LA QUEJA (25/10): «cuando hace planes no usa el Planificador». El modelo
 * enumeraba sus pasos en el chat («1. CSS: … 2. JavaScript: … 3. Verificar») y
 * el Planificador se quedaba en «Tareas 0»: el único camino hacia la hoja viva
 * era la herramienta `set_plan`, y los modelos que trabajan por bloques de
 * código (sin tools) nunca la llaman.
 *
 * Este módulo es el puente: lee la respuesta terminada del modelo y, SI es un
 * plan de verdad (2+ pasos, la mayoría en tono de acción, fuera de las vallas
 * de código), devuelve las tareas en la forma que `declararPlanVivo` entiende.
 * PURO y a prueba: ante la duda devuelve `[]` — nunca inventa un plan que el
 * modelo no escribió.
 */

export interface TareaEnProsa {
  id: string;
  description: string;
}

const RE_VALLA = /```[\s\S]*?(?:```|$)/g;
const RE_ITEMS = /^[ \t]{0,6}(?:\d+[.)\]]|[-*•])\s+(.+?)[ \t]*$/gm;

/** Ítems con cara de faena técnica: verbo de obra o archivo/tecnología mentada. */
const RE_ACCION =
  /\b(crea(?:r|remos|do)?|a[ñn]ad(?:ir|e|ido)|agrega|modifica(?:r|do)?|implementa(?:r|do)?|escrib(?:ir|e|o)|reemplaza(?:r|do)?|cambia(?:r|do)?|corrige|corregir|arregla|soluciona|repara|ajusta|configura|instala|integr(?:a|ar)|conecta|inserta|verifica|comprob(?:a|ar)|revisa|prueba|teste(?:a|ar)|valida|asegura|optimiza|refactoriza|reorganiza|estructura|dise[ñn]a|prepara|finaliza|termina|concluye|elimina|quita|borra|migra|mueve|renombra|documenta|actualiza|analiza|define|despliega)\b/i;
const RE_OBJETO =
  /\.(tsx?|jsx?|html?|css|scss|json|md|py|sql|xml|ya?ml|sh|bat|ps1)\b|\b(css|javascript|typescript|html|styles?|script)\b|\blightbox\b|\bgaler[íi]a\b|\bnavbar\b|\bfooter\b|\bhero\b|\bmanifest\b|\bservicio\b|\bpantalla\b|\bmen[úu]\b|\bbot[óo]n\b|\banimaci[óo]n\b|\bestilos?\b|\bfuncionalidad\b|\bverificaci[óo]n\b/i;

const MIN_ITEMS = 2;
const TOPE_ITEMS = 9;
const LIMPIO_TOPE = 90;

/** Quita markdown, negritas, «**CSS:**» y prefijos de rol del ítem. */
function limpiarItem(raw: string): string {
  let t = String(raw ?? "").trim();
  t = t.replace(/`/g, "");
  // «**CSS:** Se añadieron estilos» → «CSS: Se añadieron estilos»
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/[*_]{1,2}/g, "");
  t = t.replace(/^[✅✔☑🔹📌🔸⏳👉🚀📦🖼️💡]+\s*/u, "");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/[.;:]+$/, "");
  if (t.length > LIMPIO_TOPE) t = t.slice(0, LIMPIO_TOPE - 1).trim() + "…";
  return t;
}

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** ¿El ítem parece una tarea de obra (y no una lista de la compra)? */
function esAccion(textoLimpio: string): boolean {
  const t = normalizar(textoLimpio);
  return RE_ACCION.test(t) || RE_OBJETO.test(t);
}

/**
 * Extrae el plan declarado «de palabra» por el modelo.
 * Reglas duras: fuera de vallas; 2..9 ítems; mayoría acción (≥60%); sin
 * duplicados. Cualquier duda ⇒ `[]`.
 */
export function planDesdeProsa(texto: string): TareaEnProsa[] {
  const src = String(texto ?? "");
  if (!src) return [];
  const sinVallas = src.replace(RE_VALLA, " ");

  const items: string[] = [];
  const vistos = new Set<string>();
  let m: RegExpExecArray | null;
  RE_ITEMS.lastIndex = 0;
  while ((m = RE_ITEMS.exec(sinVallas)) !== null) {
    const limpio = limpiarItem(m[1]);
    if (limpio.length < 6) continue;
    const clave = normalizar(limpio);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    items.push(limpio);
    if (items.length >= TOPE_ITEMS) break;
  }
  if (items.length < MIN_ITEMS) return [];

  const deAccion = items.filter(esAccion).length;
  if (deAccion / items.length < 0.6) return [];

  return items.map((description, i) => ({ id: `p${i + 1}`, description }));
}
