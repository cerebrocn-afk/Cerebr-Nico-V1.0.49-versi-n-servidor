/**
 * hilana.ts — LA OBRA INTERRUMPIDA NO SE PIERDE (v1.0.12 · F16 mínimo)
 * ====================================================================
 * MEDIDO POR MARIO EN CAMPO (09/11): Gemini y Z.ai «están un par de minutos
 * haciendo la tarea y DE GOLPE se cortan y se pierde lo que venían haciendo».
 * El hardware de Mario (i5, 16 GB, sin GPU) no le deja tirar de local grande,
 * y su lista segura de nubes es, por naturaleza, inestable. Mientras la
 * rotación automática completa madura, hay un derecho mínimo que este módulo
 * sí garantiza: CUANDO EL MODELO SE CORTA, LA IDE NO OLVIDA.
 *
 * Mecanismo (una foto por corte, leída UNA vez por el siguiente turno):
 *   · en cada rendición de nube (sendError tras relevo local fallido) queda
 *     `.cn-turno/hilana.json`: objetivo, motivo del corte, archivos ya
 *     escritos en el quirófano (verdad de la tanda, no memoria del modelo).
 *   · el turno siguiente recibe el bloque CONTINUACIÓN antes de su pedido:
 *     no rehacer lo escrito — leerlo y seguir desde lo que falta.
 *   · se consume al inyectarse (una sola vez): o el turno nuevo la renueva al
 *     cortarse, o la obra quedó terminada y la hilana muere en paz.
 *
 * Pura de lógica, fs inyectado por el llamador (el monolito conoce su raíz).
 */

export interface FotoDeHilana {
  ts: number;
  objetivo: string;
  motivo: string;
  archivos: string[];
}

const ARCHIVO_HILANA = ".cn-turno/hilana.json";

export function guardarHilana(deps: { escribir: (abs: string, texto: string) => void; union: (...s: string[]) => string }, raiz: string, foto: FotoDeHilana): void {
  try {
    deps.escribir(deps.union(raiz, ARCHIVO_HILANA), JSON.stringify(foto, null, 2));
  } catch { /* la hilana es memoria de conveniencia: jamás debe tumbar un turno */ }
}

/**
 * Lee la hilana viva y LA CONSUME (borra el archivo). Devuelve el bloque listo
 * para pegar delante del pedido del usuario, o "" si no hay nada.
 */
export function tomarHilanaParaInyectar(deps: {
  leer: (abs: string) => string | null;
  borrar: (abs: string) => void;
  union: (...s: string[]) => string;
}, raiz: string, maxEdadMs = 45 * 60 * 1000): string {
  const abs = deps.union(raiz, ARCHIVO_HILANA);
  let foto: FotoDeHilana | null = null;
  try {
    const crudo = deps.leer(abs);
    if (!crudo) return "";
    foto = JSON.parse(crudo);
  } catch {
    return "";
  }
  if (!foto || typeof foto.ts !== "number") return "";
  if (Date.now() - foto.ts > maxEdadMs) { try { deps.borrar(abs); } catch { } return ""; }
  try { deps.borrar(abs); } catch { /* consume ideal; si queda, la inyección vieja caduca sola */ }
  const archivos = (foto.archivos || []).slice(0, 12);
  return (
    `\n\n⚑ CONTINUACIÓN DE OBRA INTERRUMPIDA (el motor guarda el hilo porque el modelo anterior se cortó):\n` +
    `· Objetivo en curso: ${String(foto.objetivo || "(sin declaración)").slice(0, 280)}\n` +
    `· Por qué se cortó: ${String(foto.motivo || "corte de nube").slice(0, 200)}\n` +
    (archivos.length ? `· Archivos YA escritos en la tanda (verdad del quirófano): ${archivos.join(", ")}${(foto.archivos || []).length > 12 ? ` … (+${(foto.archivos || []).length - 12})` : ""}\n` : "· Aún no había archivos escritos.\n") +
    `REGLA: NO rehagas los archivos listados — léelos y continúa desde lo que falta. Si el usuario pidió otra cosa clara, esa manda sobre esta nota.\n`
  );
}
