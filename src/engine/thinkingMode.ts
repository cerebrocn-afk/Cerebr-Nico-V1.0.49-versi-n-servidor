/**
 * thinkingMode.ts — EL MODO DE PENSAMIENTO, AHORA A LA VISTA DEL CHAT (v1.16.6)
 * ============================================================================
 * El selector Auto / Rápido / Ingeniero / Pensamiento profundo EXISTÍA pero
 * vivía solo en el menú Pro (ProConfigPanel → ai.executionMode) y —peor aún—
 * era un REGULADOR MUDO: nadie leía el valor (misma clase de defecto que el
 * `systemExtra` de v1.16.5, con la diferencia documentada en el CHANGELOG).
 *
 * Este módulo es la fuente única de las tres cosas que el botón necesita:
 *   1) la ROTACIÓN del chip (auto → rápido → ingeniero → profundo → auto),
 *   2) la ETIQUETA visible, y
 *   3) la DIRECTRIZ real que viaja al system prompt en cada turno.
 *
 * «Ingeniero» reutiliza buildExpertDirective("code") — la directriz ya existe
 * y ya se probó contra el motor; duplicarla aquí sería una segunda fuente.
 * «auto» NO añade directriz: deja el comportamiento de siempre (cero sorpresas).
 *
 * El estado vive en `proSettings.ai.executionMode` (localStorage
 * `codigo0_pro_settings`): el chip del chat y el selector del menú Pro leen y
 * escriben el MISMO sitio — no pueden divergir.
 */
import { buildExpertDirective } from "../utils/contextCache";
import { directrizExtensiones } from "./extensionesMotor";
import "./extensiones"; // efecto: monta las capas de fábrica (idempotente)

export type ModoPensamiento = "auto" | "rapido" | "ingeniero" | "profundo";

// ============================================================================
// v1.52.5 — NIVEL DE RAZONAMIENTO GEMINI (thinkingLevel del SDK)
// ============================================================================
// El chip de pensamiento (Auto/Rápido/Ingeniero/Profundo) controla la DIRECTRIZ
// del system prompt. El nivel de razonamiento Gemini controla el parámetro
// `thinkingConfig.thinkingLevel` que el SDK @google/genai manda a la API.
// Son INDEPENDIENTES: uno es texto en el prompt, el otro es un parámetro de la
// llamada. El botón solo aparece cuando el provider es «gemini» y el modelo
// es de la familia 3 (flash/mini), que son los que soportan thinking_level.
//
// Mapeo: bajo → MINIMAL (rápido, poco razonamiento),
//        medio → MEDIUM (equilibrio),
//        alto → HIGH (razonamiento profundo, más lento).
export type NivelRazonGemini = "bajo" | "medio" | "alto";

export const ORDEN_NIVEL_RAZON: NivelRazonGemini[] = ["bajo", "medio", "alto"];

export const ETIQUETA_NIVEL_RAZON: Record<NivelRazonGemini, string> = {
  bajo: "Razonar: Bajo",
  medio: "Razonar: Medio",
  alto: "Razonar: Alto",
};

export const AYUDA_NIVEL_RAZON: Record<NivelRazonGemini, string> = {
  bajo: "Gemini piensa mínimo (MINIMAL): respuesta rápida, poco razonamiento interno. Ideal para chat y tareas simples. Clic: pasar a Medio.",
  medio: "Gemini piensa medio (MEDIUM): equilibrio entre velocidad y profundidad. Clic: pasar a Alto.",
  alto: "Gemini piensa profundo (HIGH): razonamiento exhaustivo, más lento pero más completo. Clic: volver a Bajo.",
};

/** Valor del SDK que se envía al servidor. */
export const MAPA_NIVEL_SDK: Record<NivelRazonGemini, string> = {
  bajo: "MINIMAL",
  medio: "MEDIUM",
  alto: "HIGH",
};

export function esNivelRazonGemini(v: unknown): v is NivelRazonGemini {
  return ORDEN_NIVEL_RAZON.includes(v as NivelRazonGemini);
}

/** Siguiente nivel del ciclo. Valor desconocido → entra por «bajo». */
export function siguienteNivelRazon(actual: unknown): NivelRazonGemini {
  const i = ORDEN_NIVEL_RAZON.indexOf(esNivelRazonGemini(actual) ? actual : "bajo");
  return ORDEN_NIVEL_RAZON[(i + 1) % ORDEN_NIVEL_RAZON.length];
}

/** Orden del ciclo del chip. Cambiar el orden cambia el botón, no el almacén. */
export const ORDEN_MODOS: ModoPensamiento[] = ["auto", "rapido", "ingeniero", "profundo"];

/** Lo que se lee en el chip. Una sola fuente para que chat y menú digan igual. */
export const ETIQUETA_MODO: Record<ModoPensamiento, string> = {
  auto: "Pensar: Auto",
  rapido: "Pensar: Rápido",
  ingeniero: "Pensar: Ingeniero",
  profundo: "Pensar: Profundo",
};

/** El texto del `title` del chip: qué hace cada modo, en una línea. */
export const AYUDA_MODO: Record<ModoPensamiento, string> = {
  auto: "Sin directriz extra: el motor decide (comportamiento de siempre). Clic: pasar a Rápido.",
  rapido: "Respuesta directa, sin planes escritos ni pasos ceremoniosos; herramientas solo si hacen falta. Clic: pasar a Ingeniero.",
  ingeniero: "Actúa como ingeniero senior: código completo sin placeholders, plan (set_plan) y verificación con herramientas. Clic: pasar a Profundo.",
  profundo: "Razona antes de actuar: plan explícito, casos límite y riesgos, y VERIFICA antes de afirmar que funciona. Clic: volver a Auto.",
};

export function esModoPensamiento(v: unknown): v is ModoPensamiento {
  return ORDEN_MODOS.includes(v as ModoPensamiento);
}

/** Siguiente modo del ciclo. Un valor desconocido (o antiguo) entra por «auto». */
export function siguienteModo(actual: unknown): ModoPensamiento {
  const i = ORDEN_MODOS.indexOf(esModoPensamiento(actual) ? actual : "auto");
  return ORDEN_MODOS[(i + 1) % ORDEN_MODOS.length];
}

/**
 * La DIRECTRIZ que viaja al system prompt del turno. Vacía = «auto».
 * Ningún modo puede devolver una cadena vacía salvo auto: si algún día uno
 * se queda sin texto, tests/pensamientoChat.test.ts lo canta como regulador
 * mudo (la prueba «ningún modo nombrado es decorativo»).
 */
export function directrizModo(actual: unknown): string {
  switch (esModoPensamiento(actual) ? actual : "auto") {
    case "rapido":
      return "- [MODO RÁPIDO]: Responde directo y breve: sin planes escritos ni listas de pasos salvo que el usuario los pida, y usa herramientas solo cuando sean imprescindibles para cumplir la orden. Brevedad, no vaguedad: lo que el usuario pidió sigue entero.";
    case "ingeniero": {
      // La BASE sigue siendo una sola fuente (buildExpertDirective) y encima
      // se le montan las capas registradas para el modo «ingeniero». Si no hay
      // ninguna capa montada, esto vuelve a ser exactamente la base.
      const base = buildExpertDirective("code");
      const extra = directrizExtensiones("ingeniero");
      return extra ? `${base}\n${extra}` : base;
    }
    case "profundo":
      return "- [MODO PROFUNDO]: Antes de escribir código o dar una solución, razona el problema: define el plan con set_plan, piensa casos límite y riesgos, y al terminar VERIFICA (run_tests o relee el archivo que escribiste) antes de afirmar que funciona. Si algo queda sin probar, dilo con nombre y apellido.";
    case "auto":
    default:
      return "";
  }
}
