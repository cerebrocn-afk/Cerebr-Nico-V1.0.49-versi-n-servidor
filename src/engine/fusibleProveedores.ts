/**
 * fusibleProveedores.ts — v1.57.18 · EL FUSIBLE YA NO ES SOLO DE GEMINI
 * =====================================================================
 * RAÍZ (sesión 1792103924951): glm-4.5-flash falló 6 veces — 1.040 s quemados,
 * el 72 % del tiempo perdido de la sesión — y el motor lo volvió a tentar igual
 * en cada turno, en silencio. El fusible existía SOLO para Gemini
 * (fusibleGemini.ts, v1.57.12, con su lógica de 404/429/503 por código HTTP).
 * Este es el general: cualquier proveedor o modelo, con la causa clasificada
 * por relojModelos.clasificarFalloProveedor, cuarentena con vencimiento por
 * clase, y —lo más importante— AVISO CON ALTERNATIVA MEDIDA en vez de reintento
 * silencioso: el motor deja de tirar minutos a la basura y le cuenta al usuario
 * qué está pasando y qué otra cosa funciona hoy, en SU red.
 */

// v1.90.1 · el cooldown deja de ser FIJO por clase: escala con los fallos recientes
// del modelo (backoff exponencial con tope). El cálculo vive puro en relevoInteligente.
import { cooldownAdaptativo } from "./relevoInteligente";
import { clasificarFalloProveedor, causaReal, type ClaseFallo } from "./relojModelos";

export interface Cuarentena {
  modelo: string;
  clase: ClaseFallo;
  desde: number;
  hasta: number;
  detalle: string;
  causa: string;
}

/** Cuánto dura la pausa según la causa (un 429 larga reloj de Google aparte). */
const TTL_MS: Record<ClaseFallo, number> = {
  red: 120_000,        // la red puede volver en dos minutos
  cuota: 900_000,      // 15 min: el límite de velocidad no se arregla antes
  capacidad: 1_800_000, // 30 min: el modelo no va a aprender a ver imágenes
  tiempo: 90_000,      // 90 s: puede haber sido carga, no muerte
  desconocido: 60_000,
};

const VENTANA_FALLOS_MS = 12 * 60_000;
const FALLOS_MAX_POR_MODELO = 20;

const cuarentenas = new Map<string, Cuarentena>();
const fallosPorModelo = new Map<string, number[]>();

/** ¿Está en pausa? Devuelve la cuarentena viva o null. */
export function enCuarentena(modelo: string, ahora = Date.now()): Cuarentena | null {
  const c = cuarentenas.get(modelo);
  if (!c) return null;
  if (ahora >= c.hasta) { cuarentenas.delete(modelo); return null; }
  return c;
}

/** Registra un fallo: lo clasifica, lo cuenta en la ventana y abre cuarentena. */
export function registrarFalloProveedor(modelo: string, err: unknown, ahora = Date.now()): Cuarentena {
  const { clase, detalle } = clasificarFalloProveedor(err);
  const causa = causaReal(err);
  const lista = fallosPorModelo.get(modelo) || [];
  lista.push(ahora);
  while (lista.length > FALLOS_MAX_POR_MODELO) lista.shift();
  fallosPorModelo.set(modelo, lista);
  // v1.90.1 · BACKOFF ADAPTATIVO: la pausa parte del TTL por clase (piso del primer
  // fallo) y se duplica por cada reincidencia DENTRO de la ventana de 12 min, tope
  // 30 min. Primer fallo == comportamiento previo: cooldownAdaptativo(ttl, 1) = ttl.
  const fallosEnVentana = fallosRecientes(modelo, ahora);
  const c: Cuarentena = { modelo, clase, desde: ahora, hasta: ahora + cooldownAdaptativo(TTL_MS[clase], fallosEnVentana), detalle, causa };
  cuarentenas.set(modelo, c);
  return c;
}

/** Un éxito limpia la pausa y la ventana: el modelo se ganó otra oportunidad. */
export function registrarExitoProveedor(modelo: string): void {
  cuarentenas.delete(modelo);
  fallosPorModelo.delete(modelo);
}

/** Fallos del modelo en los últimos 12 minutos (para el conteo del aviso). */
export function fallosRecientes(modelo: string, ahora = Date.now()): number {
  const lista = (fallosPorModelo.get(modelo) || []).filter((t) => ahora - t <= VENTANA_FALLOS_MS);
  fallosPorModelo.set(modelo, lista);
  return lista.length;
}

/** Cuarentenas vivas (diagnóstico del panel). */
export function estadoCuarentenas(ahora = Date.now()): Cuarentena[] {
  const vivas: Cuarentena[] = [];
  for (const c of [...cuarentenas.values()]) {
    if (ahora >= c.hasta) cuarentenas.delete(c.modelo);
    else vivas.push(c);
  }
  return vivas.sort((a, b) => b.desde - a.desde);
}

/**
 * EL AVISO HONESTO: cuántas veces falló, por qué, hasta cuándo no se reintenta
 * y —si hay— la alternativa MEDIDA en la máquina del usuario.
 */
export function notaCuarentena(
  modelo: string,
  alternativa: { modelo: string; etiqueta: string } | null,
  ahora = Date.now(),
): string {
  const c = cuarentenas.get(modelo);
  const veces = fallosRecientes(modelo, ahora);
  const causa = c ? `${c.clase}${c.causa ? ` · ${c.causa}` : ""} — ${c.detalle}` : "causa desconocida";
  const hasta = c ? new Date(c.hasta).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
  const propuesta = alternativa
    ? `Medido en tu máquina: «${alternativa.modelo}» ${alternativa.etiqueta}. Decime si sigo con ese.`
    : "Todavía no tengo una alternativa medida: elegí otro modelo o reintentá más tarde a mano.";
  return `⛔ EN CUARENTENA — «${modelo}» falló ${veces} vez(ces) en los últimos 12 min (última causa: ${causa}). No lo reintento en silencio: pausa hasta las ${hasta}. ${propuesta}`;
}

/** Solo para pruebas. */
export function reiniciarCuarentenasParaPruebas(): void {
  cuarentenas.clear();
  fallosPorModelo.clear();
}
