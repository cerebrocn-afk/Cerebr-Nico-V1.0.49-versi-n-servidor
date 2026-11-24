/**
 * contratoSuperficie.ts — LA REGLA DE SUPERFICIE ESCRITA EN PIEDRA (v1.83.0 · FASE 4)
 * ==================================================================================
 * QUÉ ES: el contrato declarativo de cuánto GRITA cada panel. La queja medida de
 * Mario (26/10, origen de la regla en V8 §7.2): «muchos botones ocupan mucho
 * lugar y es antiestético». v1.78.0 lo resolvió solo para el sandbox; esta fase
 * generaliza el patrón a toda la superficie:
 *
 *   panel con MÁS DE 3 acciones ⇒ UNA acción primaria visible + el resto
 *   plegada en «⚙ Avanzado», plegado POR DEFECTO. Lo plegado no se borra:
 *   cambia de lugar, no de existencia.
 *
 * PUREZA: este archivo NO renderiza. Declara (registro PANELS) y decide
 * (`visibilidadPorRegla`), y por eso la suite `superficie.test.ts` puede
 * congelar la superficie SIN navegador: compara el registro con un fixture y
 * lee la fuente de cada componente para probar que el botón realmente está
 * donde el contrato dice. Si un panel vuelve a gritar, el test se pone rojo
 * antes que Mario.
 */

export interface ContratoPanel {
  id: string;
  /** Componente dueño (ruta fuente — la suite la lee de verdad). */
  archivo: string;
  /** La acción que «hace todo»: la única que queda a la vista. */
  primaria: string;
  /** Acciones que viven dentro de «⚙ Avanzado». */
  avanzadas: string[];
  /** Cosas visibles que NO son acciones (indicadores de estado, botón de emergencia). */
  noAccion?: string[];
  /** Excepción declarada con motivo (tabs de navegación no son botonera). */
  exenta?: string;
}

export const PANELS_CONTRATO: ContratoPanel[] = [
  {
    id: "explorador",
    archivo: "src/components/RightSidebar.tsx",
    primaria: "Adjuntar",
    avanzadas: ["Borrar todo", "Plantilla", ".cn", "Abrir .cn"],
    noAccion: [],
  },
  {
    id: "chat-input",
    archivo: "src/components/ChatCenter.tsx",
    primaria: "Enviar",
    // v2.3.2 · EL USUARIO JUBILÓ EL ⚙ DE ESTA BARRA. La fase 4 plegaba acá
    // «Canal directo / Adjuntar / Encolar»; en el uso real las dos primeras son la
    // ruta más corta del programa (se tocan en casi todos los mensajes) y el
    // desplegable les sumaba un clic. Quedan fijas y a la vista, y el panel deja de
    // tener avanzadas: **tres acciones visibles no superan el umbral de la regla**,
    // que es exactamente el criterio con el que `chats-cola` ya se registra sin
    // plegarse. No es una excepción: es la regla aplicada con el listado vacío.
    avanzadas: [],
    // Detener es emergencia (nunca se pliega); el selector de modelo es un
    // indicador que además abre el selector — información, no ruido.
    noAccion: ["Detener", "modelo actual", "Canal directo", "Adjuntar", "Encolar"],
  },
  {
    id: "chats-cola",
    archivo: "src/components/ChatCenter.tsx",
    // La cola ya nacía plegada y con UNA acción (Vaciar cola): ≤3 acciones,
    // la regla ni la toca. Se registra igual: el contrato también certifica
    // lo que NO necesita plegarse.
    primaria: "Vaciar cola",
    avanzadas: [],
    noAccion: ["quitar un mensaje de la cola", "editar un mensaje de la cola"],
  },
  {
    id: "ajustes-pc",
    archivo: "src/components/ConfigModal.tsx",
    // EXENTA con motivo (no es una excusa, es una medición): el modal es
    // navegación por pestañas — cada pestaña muestra UNA botonera a la vez,
    // que es exactamente lo que la regla pide. La suite verifica la exención.
    primaria: "Guardar",
    avanzadas: [],
    exenta: "navegación por pestañas: una botonera visible a la vez (V8 §7.2 cumplida por estructura)",
  },
];

export interface Visibilidad {
  visibles: string[];
  plegadas: string[];
  /** false cuando el panel ya cumplía con ≤3 acciones y no lleva ⚙. */
  llevaAvanzado: boolean;
}

/**
 * La regla, aplicada a una lista de acciones: ≤3 se muestran todas; >3 queda
 * la primaria afuera y el resto se pliega. Pura y aburrida a propósito: así
 * se puede probar sin montar React.
 */
export function visibilidadPorRegla(acciones: string[], primaria: string): Visibilidad {
  const total = acciones.length;
  if (total <= 3) return { visibles: acciones, plegadas: [], llevaAvanzado: false };
  const fuera = [primaria, ...acciones.filter((a) => a !== primaria)];
  const visibles = [primaria];
  const plegadas = fuera.slice(1);
  return { visibles, plegadas, llevaAvanzado: true };
}

/** Cuántas cosas ve el usuario por defecto en un panel (acciones + indicadores). */
export function accionesVisiblesEnDefault(p: ContratoPanel): string[] {
  if (p.exenta) return [p.primaria];
  const todas = [p.primaria, ...p.avanzadas];
  return visibilidadPorRegla(todas, p.primaria).visibles;
}

export function panelPorId(id: string): ContratoPanel | undefined {
  return PANELS_CONTRATO.find((p) => p.id === id);
}
