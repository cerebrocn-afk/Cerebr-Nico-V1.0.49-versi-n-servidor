/**
 * sandboxArranque.ts — v1.87.1 · «YA CORRE» NO ES «YA CORRE LO TUYO»
 * ==================================================================
 * QUÉ PROBLEMA RESUELVE (sesión 1793219578712, mensaje 18: «en el sandbox no se
 * generó nada, lo que se ve es un proyecto viejo y erróneo»). `/api/sandbox/start`
 * empezaba con `if (sandboxVivo()) return alreadyRunning`: con el preview vivo no
 * se resolvía siquiera el destino. Fijar otra carpeta (CANAL DIRECTO) o cambiar
 * el pin no movía el preview NUNCA, porque el proceso seguía vivo y por tanto
 * jamás había reinicio. El usuario veía el proyecto anterior para siempre.
 *
 * QUÉ HACE: resuelve el destino (misma autoridad de siempre, no una segunda),
 * lo compara con la raíz que el estado dice estar sirviendo, y decide una de tres
 * cosas: ya corre la correcta, no hay nada corriendo, o hay que parar la vieja
 * para que el llamador arranque la nueva.
 *
 * POR QUÉ VIVE ACÁ Y NO EN EL MONOLITO: `contrato-rutas.json` tiene trinquete
 * («la Fase 2 es partir, no añadir»). Esta decisión son ~20 líneas con dos
 * matices que se prueban mejor aislados; en `server.ts` solo queda la llamada.
 * El estado (qué raíz se sirve) es de `estado/sandbox.ts`, no de este módulo:
 * acá se decide, allí se guarda.
 */

import path from "node:path";
import { resolverDestinoSandbox, type DestinoSandbox } from "../src/engine/projectPorter";

export interface DepsArranque {
  /** Raíz de datos del IDE (la que sirve de base al resolvedor). */
  base: string;
  /** Destino explícito del cliente, si lo manda. */
  destino: string | null;
  /** Carpeta vinculada por CANAL DIRECTO, si la hay. */
  vinculada: string | null;
  vivo: boolean;
  pid: number | null;
  /** La raíz que el estado dice estar sirviendo. `null` = no se arrancó en esta sesión. */
  raizEnCurso: string | null;
  puerto: number;
  /** `exec` promisificado del host (para el `taskkill` de Windows). */
  execAsync: (cmd: string) => Promise<unknown>;
  matarProceso: (senal?: NodeJS.Signals | number) => boolean;
  olvidarProceso: () => void;
  isPortUp: (puerto: number, ms: number) => Promise<boolean>;
  killPortListeners: (puerto: number) => Promise<unknown>;
  log?: (mensaje: string) => void;
}

export interface DecisionArranque {
  /** El preview vivo YA sirve la raíz pedida: no hay nada que hacer. */
  yaCorre: boolean;
  /** El destino resuelto, aplanado: el llamador no vuelve a resolver nada. */
  raiz: string;
  tienePkg: boolean;
  tieneHtml: boolean;
  anidada: boolean;
  origen: string;
  /** El reconocimiento del material que hay en la raíz (puede ser `null`). */
  reconocido: DestinoSandbox["proyecto"];
  /** Se paró un preview que servía otra raíz (para poder arrancar la correcta). */
  reiniciado: boolean;
}

/** Dos rutas son la misma raíz si, resueltas, apuntan al mismo sitio. */
export function mismaRaiz(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  try {
    return path.resolve(a) === path.resolve(b);
  } catch {
    return false;
  }
}

/**
 * Decide qué hacer con el sandbox antes de arrancarlo. No arranca nada: si
 * devuelve `reiniciado: true`, el llamador sigue su flujo normal de arranque.
 */
export async function prepararArranque(deps: DepsArranque): Promise<DecisionArranque> {
  const proyecto = resolverDestinoSandbox(deps.base, deps.destino, deps.vinculada);
  const raiz = proyecto.raiz;

  const plano = { raiz, tienePkg: proyecto.tienePkg, tieneHtml: proyecto.tieneHtml, anidada: proyecto.anidada, origen: proyecto.origen, reconocido: proyecto.proyecto };
  if (!deps.vivo) return { yaCorre: false, ...plano, reiniciado: false };
  if (mismaRaiz(deps.raizEnCurso, raiz)) return { yaCorre: true, ...plano, reiniciado: false };

  deps.log?.(
    `[CerebroNico] 🔁 El preview servía «${deps.raizEnCurso ?? "(raíz no registrada)"}» y la raíz pedida es «${raiz}»: se reinicia para servir la correcta.`
  );

  // Se para el viejo con el PID leído UNA vez (un dato del estado se lee una vez
  // y se usa entero: leerlo dos veces mata a otro con un PID reciclado).
  if (deps.pid) {
    try {
      if (process.platform === "win32") await deps.execAsync(`taskkill /PID ${deps.pid} /T /F`);
      else {
        try { process.kill(-deps.pid, "SIGKILL"); } catch { deps.matarProceso("SIGKILL"); }
      }
    } catch { /* si ya murió, el paso siguiente lo limpia */ }
  }
  try { deps.matarProceso("SIGKILL"); } catch { /* idem */ }
  deps.olvidarProceso();
  if (await deps.isPortUp(deps.puerto, 1200)) await deps.killPortListeners(deps.puerto);
  return { yaCorre: false, ...plano, reiniciado: true };
}

// ───────────────────────────────────────────────────────────────────────────
// v1.90.0 · ¿QUÉ PROYECTO ESTÁ ADENTRO DE LA RAÍZ DE DATOS? (con memoria)
// ───────────────────────────────────────────────────────────────────────────
// `resolveSafePath` necesita saber si la obra va a `C:\Cerebronico` o a
// `C:\Cerebronico\finanzas-app`. La autoridad ya existe — `resolverDestinoSandbox`
// es LA MISMA que usa el preview, así que escribir y servir no pueden divergir —
// pero recorre directorios, y llamarla en cada lectura del editor sería caro.
// Se memoiza con TTL: 4 segundos de antigüedad máxima, que es menos de lo que
// tarda el usuario en crear una carpeta nueva y volver a escribir.
// ───────────────────────────────────────────────────────────────────────────
const MEMORIA: { clave: string; raiz: string; aLas: number }[] = [];
export const TTL_RAIZ_DE_OBRA_MS = 4000;

export function raizDeObraEnCurso(base: string, ahora: number = Date.now(), ttlMs = TTL_RAIZ_DE_OBRA_MS): string | null {
  const t = Number.isFinite(ahora) ? ahora : Date.now();
  const golpe = MEMORIA.find((m) => m.clave === base && t - m.aLas < ttlMs);
  if (golpe) return golpe.raiz;
  try {
    const raiz = resolverDestinoSandbox(base, null, null).raiz;
    const anterior = MEMORIA.findIndex((m) => m.clave === base);
    const fila = { clave: base, raiz, aLas: t };
    if (anterior >= 0) MEMORIA[anterior] = fila; else MEMORIA.push(fila);
    return raiz;
  } catch {
    return null; // sin lectura segura, la regla cae a la raíz de datos: igual que antes
  }
}

/** Solo para pruebas: vacía la memoria. */
export function olvidarRaizDeObra(): void { MEMORIA.length = 0; }
