/**
 * vectorCerebro.ts — LA MITAD VECTORIAL DEL ÓRGANO (v1.84.0 · FASE 2)
 * ===================================================================
 * El plano (FASE 2 · «El órgano vectorizado», X22): el enrute del cerebro
 * decidía por COINCIDENCIA DE PALABRAS — «si la tarea no usa la palabra exacta
 * del recuerdo, el recuerdo no existe». Acá vive la otra mitad, PURA (sin fs,
 * sin red, sin reloj propio): similitud coseno, la mezcla 0.7 vector / 0.3
 * palabra (ajustable), y el envoltorio de timeout que cumple la promesa del
 * plano: «timeout PROPIO de 5 s y nunca bloquea el turno — si el embedder no
 * está, se registra el fallback y el turno sigue por palabra» (lección 24/10).
 *
 * El órgano (`cerebroOrgano.enrutarHibrido`) inyecta el embedder como función:
 * en producción llama a Ollama, en los tests llama a un mapa semántico de
 * bolsillo. Así la prueba exigida —«una paráfrasis que no comparte NI UNA
 * palabra con el índice solo se recupera por vector»— corre sin encender nada.
 */

export const TIMEOUT_EMBED_POR_DEFECTO = 5000;

/** Los pesos del plano, y AJUSTABLES: no es un número incrustado en el ranking. */
export interface PesosHibridos {
  vector: number;
  palabra: number;
}
export const PESO_HIBRIDO: PesosHibridos = { vector: 0.7, palabra: 0.3 };

export function coseno(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length === 0 || b.length !== a.length) return 0;
  let p = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    p += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return p / Math.sqrt(na * nb);
}

/** Mezcla del plano: 0.7 de lo que SIGNIFICA + 0.3 de lo que DICE literalmente. */
export function puntuarHibrido(simVector: number, simPalabra: number, pesos: PesosHibridos = PESO_HIBRIDO): number {
  const v = Math.max(0, Math.min(1, simVector));
  const p = Math.max(0, Math.min(1, simPalabra));
  const suma = Math.max(1e-9, pesos.vector + pesos.palabra);
  return (pesos.vector * v + pesos.palabra * p) / suma;
}

export type ResultadoTimeout<T> =
  | { ok: true; valor: T; ms: number }
  | { ok: false; motivo: "tiempo-excedido" | "error"; detalle: string; ms: number };

/**
 * El contrato anti-bloqueo: la llamada de red que sea, con SU ventana.
 * `conTimeout` jamás lanza: tiempo excedido o error devuelven un motivo para
 * que el llamante degrade a la ruta de palabras y lo REGISTRE. Sin esto, un
 * Ollama dormido le suma segundos muertos a cada turno (la plaga del 24/10).
 */
export async function conTimeout<T>(fn: (señal: AbortSignal) => Promise<T>, ms = TIMEOUT_EMBED_POR_DEFECTO): Promise<ResultadoTimeout<T>> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const alarma = setTimeout(() => ctrl.abort(), Math.max(1, ms));
  // La ventana es una promesa CONTRA RELOJ, no solo una señal: si la llamada
  // ignora el abort (un fetch colgado, un await sin señal), el llamante igual
  // queda libre en `ms`. Medido en la primer corrida de la suite: sin carrera,
  // un embedder sordo al abort estiraba el turno más allá de su ventana.
  try {
    const valor = await Promise.race([
      fn(ctrl.signal),
      new Promise<never>((_r, rej) => {
        setTimeout(() => {
          const e = new Error(`ventana de ${ms} ms agotada`);
          e.name = "VentanaAgotada";
          rej(e);
        }, Math.max(1, ms));
      }),
    ]);
    clearTimeout(alarma);
    return { ok: true, valor, ms: Date.now() - t0 };
  } catch (e: any) {
    clearTimeout(alarma);
    const abortado = String(e?.name || "") === "AbortError" || String(e?.name || "") === "VentanaAgotada" || ctrl.signal.aborted;
    return {
      ok: false,
      motivo: abortado ? "tiempo-excedido" : "error",
      detalle: String(abortado ? `el embedder pasó la ventana de ${ms} ms` : e?.message || e).slice(0, 200),
      ms: Date.now() - t0,
    };
  }
}

/** Clave estable de una entrada para el sidecar de vectores: tema|archivo|huella. */
export function claveVector(tema: string, archivo: string, huella: string): string {
  return `${tema}|${archivo}|${huella}`;
}

/**
 * Fusión de las dos mitades del ranking. Las rutas por palabra traen score
 * crudo; se normaliza contra el máximo para que 0.3/0.7 compare peras con
 * peras. Si el vector no aportó NADA (todo cero), el orden queda igual que
 * por palabra: el híbrido no puede empeorar lo que ya funcionaba.
 */
// `fusionar` a secas estaba TOMADO: server.ts tiene su propia `fusionar` local
// (Levenshtein del corrector ortografico, anterior a esta fase). La valla
// «resiliencia» («server.ts importa todo lo que usa del motor») salto por ese
// choque: dos cosas distintas con el mismo nombre es lo que la casa no acepta.
export function fusionarRutasHibridas<Puntuables extends { clave: string; simPalabra: number }>(
  items: Puntuables[],
  simVector: (clave: string) => number,
  pesos: PesosHibridos = PESO_HIBRIDO
): Array<{ clave: string; score: number; simVector: number; simPalabra: number }> {
  const maxP = Math.max(0, ...items.map((i) => i.simPalabra));
  const out = items.map((i) => {
    const sp = maxP > 0 ? i.simPalabra / maxP : 0;
    const sv = Math.max(0, Math.min(1, simVector(i.clave)));
    return { clave: i.clave, score: puntuarHibrido(sv, sp, pesos), simVector: sv, simPalabra: sp };
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}
