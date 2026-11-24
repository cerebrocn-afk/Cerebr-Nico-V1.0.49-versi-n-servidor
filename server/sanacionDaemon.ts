// ============================================================
// SANACIÓN DAEMON — v1.57.19 · F1.5: las manos de la sonda fantasma
// ============================================================
// El cerebro puro vive en src/engine/sanacionAutomatica.ts (a quién sondear,
// cuándo, y qué significa el resultado). Acá vive el I/O: cada minuto se
// pregunta si hay modelos en observación con sonda vencida y se lanza un prompt
// de 1 token con keep_alive:0 — carga y se descarga, no deja el modelo en RAM.
//
// CANDADOS del hardware (los tres que la idea original no traía):
//  · LOCAL ACTIVO / NUBE PASIVA: sondear la nube quema cuota real (Gemini free
//    = 20 pedidos/día). A la nube la prueba la primera llamada real tras el TTL.
//  · NUNCA CON EL MOTOR OCUPADO: si hay un turno generando (actividad < 60 s) o
//    un Gradle vivo, la sonda espera: no compite por CPU/RAM con el usuario.
//  · LA SONDA NO ALIMENTA EL p95: este archivo no importa registrarPrimerByte a
//    propósito — el tiempo de la sonda decide «¿volvió?», jamás el presupuesto.
import { estadoCuarentenas, registrarExitoProveedor, registrarFalloProveedor } from "../src/engine/fusibleProveedores";
import { presupuestoPrimerByte } from "../src/engine/relojModelos";
import { sondasPendientes, evaluarSonda, presupuestoSonda, CUERPO_SONDA, type EstadoSanacion } from "../src/engine/sanacionAutomatica";
import { trabajoVivoApk } from "./fabricaApk";

const OLLAMA_BASE = process.env.CN_OLLAMA_URL || "http://127.0.0.1:11434";
const OCUPADO_VENTANA_MS = 60_000;
const historial = new Map<string, { sondasFallidas: number; ultimaSonda?: number }>();
let ultimaActividad = 0;
let temporizador: ReturnType<typeof setInterval> | null = null;

/** La llamada del turno/generación marca actividad: la sonda no compite con el usuario. */
export function marcarActividadDelMotor(ahora = Date.now()): void {
  ultimaActividad = ahora;
}

export function motorOcupado(ahora = Date.now()): boolean {
  if (ahora - ultimaActividad < OCUPADO_VENTANA_MS) return true;
  try {
    if (trabajoVivoApk()) return true;
  } catch { /* la fábrica no está cargada: no es un motivo de ocupación */ }
  return false;
}

/** Heurístico honesto: Ollama sirve locales y `-cloud`; el resto son APIs de nube. */
export function esLocalPorNombre(modelo: string): boolean {
  const n = String(modelo || "").toLowerCase();
  if (/-cloud|:cloud|cloud\b/.test(n)) return false;
  if (/^(gemini|glm-|zai|gpt-|claude|command|mistral-large|deepseek-chat|grok)/.test(n)) return false;
  return true;
}

async function sondarLocal(modelo: string, topeMs: number, base = OLLAMA_BASE): Promise<number> {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), topeMs);
  const arranque = Date.now();
  try {
    const r = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CUERPO_SONDA(modelo)),
      signal: ctrl.signal,
    });
    await r.text();
    return r.ok ? Date.now() - arranque : -1;
  } catch {
    return -1;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Una ronda: mira las cuarentenas vivas (+ los modelos con fallos repetidos),
 * sondea los locales que ya cumplieron su agenda y aplica el veredicto.
 * Devuelve las notas (vacío si no había nada que hacer).
 */
export async function rondaDeSanacion(opts: {
  ahora?: number;
  permiteNube?: boolean;
  ollamaUrl?: string;
  sondear?: (modelo: string, topeMs: number) => Promise<number>;
  onNota?: (nota: string) => void;
} = {}): Promise<string[]> {
  const ahora = opts.ahora ?? Date.now();
  const notas: string[] = [];
  const emitir = (nota: string) => { notas.push(nota); (opts.onNota || ((m: string) => console.log(m)))(nota); };
  if (motorOcupado(ahora)) return notas;
  const observacion: EstadoSanacion[] = estadoCuarentenas(ahora).map((c) => {
    const memoria = historial.get(c.modelo);
    return {
      modelo: c.modelo,
      esLocal: esLocalPorNombre(c.modelo),
      enCuarentenaDesde: c.desde,
      sondasFallidas: memoria?.sondasFallidas ?? 0,
      ultimaSonda: memoria?.ultimaSonda,
      presupuestoMs: presupuestoPrimerByte(c.modelo).ms,
    };
  });
  const pendientes = sondasPendientes(observacion, { ahora, ocupado: false, permiteNube: opts.permiteNube === true });
  const sondear = opts.sondear || ((modelo: string, tope: number) => sondarLocal(modelo, tope, opts.ollamaUrl || OLLAMA_BASE));
  for (const estado of pendientes) {
    if (!estado.esLocal) {
      emitir(`🩺 «${estado.modelo}» sigue en cuarentena: es de nube y la re-entrada es PASIVA (no gasto tu cuota con sondas); la probará la próxima llamada real.`);
      continue;
    }
    const tope = presupuestoSonda(estado.presupuestoMs);
    const ms = await sondear(estado.modelo, tope);
    const veredicto = evaluarSonda(estado, ms, { ahora });
    if (veredicto.veredicto === "sana") {
      registrarExitoProveedor(estado.modelo);
      historial.delete(estado.modelo);
      emitir(veredicto.nota);
    } else {
      registrarFalloProveedor(estado.modelo, new Error(`sonda fantasma sin respuesta en los primeros ${Math.round(tope / 1000)} s`), ahora);
      historial.set(estado.modelo, { sondasFallidas: (historial.get(estado.modelo)?.sondasFallidas ?? 0) + 1, ultimaSonda: ahora });
      emitir(veredicto.nota);
    }
  }
  return notas;
}

/** Arranca el reloj de la sanación (idempotente). */
export function iniciarSanacionDaemon(opts: { cadaMs?: number; permiteNube?: () => boolean } = {}): void {
  if (temporizador) return;
  const cada = Math.max(30_000, opts.cadaMs ?? 60_000);
  temporizador = setInterval(() => {
    void rondaDeSanacion({ permiteNube: opts.permiteNube ? opts.permiteNube() : false }).catch(() => {});
  }, cada);
  if (typeof temporizador.unref === "function") temporizador.unref();
}

export function detenerSanacionDaemonParaPruebas(): void {
  if (temporizador) { clearInterval(temporizador); temporizador = null; }
}
