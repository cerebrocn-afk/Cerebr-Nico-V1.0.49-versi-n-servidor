/**
 * herramientaPuente.ts — EL INTERRUPTOR DEL PUENTE :5000, HECHO UNA SOLA VEZ (v1.97.0)
 * ====================================================================================
 * Origen: el informe de Mario (30/10) con log y sesión exportada. El modelo pasó decenas de
 * turnos sin herramientas de PC y el usuario tuvo que reiniciar los puertos a mano:
 * «creo que el modelo no encontraba el interruptor del puente 5000». Tenía razón: el
 * interruptor existía, pero era SOLO un botón. `toolRegistry.ts` y los `case` del monolito
 * no tenían ninguna herramienta para mirar ni reiniciar el :5000, y el superPrompt ni siquiera
 * avisaba si estaba vivo (una línea fija dice «5000 puente PC» como si siempre existiera).
 *
 * Este módulo hace dos cosas:
 *   1. Le da al modelo `puente_estado` y `reiniciar_puente` (herramientas de verdad).
 *   2. Unifica el camino del botón y el de la herramienta: el mismo `crearReinicioPuente`
 *      atiende `POST /api/bridge/restart`. Dos implementaciones de un interruptor es tener dos
 *      opiniones distintas sobre si el puente está vivo.
 *
 * La mentira que se corrige adentro: en `server.ts:1180`, cuando :5000 ya respondía y la IDE
 * ADOPTABA ese puente, `restart()` devolvía `true` sin matar ni resubir nada. El botón entonces
 * decía «Puente 5000 reiniciado y listo» habiendo sido un no-op. Acá el reinicio de un puente
 * adoptado devuelve `ok:false` con el motivo: no se puede prometer el reinicio de un proceso
 * que esta app no engendró.
 */

export const PUERTO_PUENTE = 5000;
const URL_SALUD = `http://127.0.0.1:${PUERTO_PUENTE}/health`;

export interface DependenciasPuente {
  /** El puente vivo bajo control de la IDE, o `null` si nunca se pudo spawnear. */
  bridge: () => any;
  /** Tira la muestra de telemetría vieja (la que decía «:5000 caído»). */
  invalidar: () => void;
  /** Herramientas del pack `puente-mcp` realmente cargadas en esta sesión. */
  cargadas?: () => string[];
  /** Reintentos del cargador de packs (los mismos del log «Reintento N/12»). */
  reintentos?: () => { usados: number; max: number };
  /**
   * Sudeo de salud inyectable. Se pasa en las pruebas en seco para que el veredicto no
   * dependa de si HABÍA algo escuchando en :5000 en la máquina que testea (en este contenedor
   * hay un servicio respondiendo /health, y una valla que depende de la red ajena es una valla
   * que miente). En produccion se usa `sondearSaludPuente`, que es la real.
   */
  sondear?: () => Promise<{ vivo: boolean; detalle: string }>;
}

/** Pingeo /health con reloj propio: lo que se VIÓ, no lo que se espera. */
export async function sondearSaludPuente(ms = 1200): Promise<{ vivo: boolean; detalle: string }> {
  try {
    const controlador = new AbortController();
    const t = setTimeout(() => controlador.abort(), ms);
    const r = await fetch(URL_SALUD, { signal: controlador.signal });
    clearTimeout(t);
    return r.ok
      ? { vivo: true, detalle: `/health respondió ${r.status} en menos de ${ms} ms` }
      : { vivo: false, detalle: `/health respondió ${r.status} (no es un healthy)` };
  } catch (e: any) {
    return { vivo: false, detalle: `nadie respondió en ${URL_SALUD} (${String(e?.name || e)})` };
  }
}

/**
 * El interruptor, como manejador de la ruta que ya existía. La respuesta mantiene
 * `{ ok, port }` (el frontend y la automejora la leen así) y agrega `origen` + `motivo`.
 */
export function crearReinicioPuente(deps: DependenciasPuente) {
  return async (_req: any, res: any) => {
    const b = deps.bridge();
    if (!b) {
      const salud = await sondearSaludPuente();
      return res.status(500).json({
        ok: false,
        port: PUERTO_PUENTE,
        origen: salud.vivo ? "externo" : "ausente",
        error: salud.vivo
          ? `:5000 responde pero la IDE no lo engendró (puente externo u otra instancia): no lo reinicio desde acá.`
          : `Puente no inicializado (¿falta agent_bridge_5000.py o el Python?).`,
      });
    }
    try {
      deps.invalidar();
      const adoptado = Boolean(b.adoptado);
      if (adoptado) {
        return res.status(500).json({
          ok: false,
          port: PUERTO_PUENTE,
          origen: "adoptado",
          error: `el puente de :5000 fue ADOPTADO (ya estaba vivo cuando nació la IDE), así que esta app no lo puede matar ni resubrir. Reiniciá esa instancia — o seguí sin las herramientas del puente.`,
        });
      }
      const ok = await b.restart();
      return res.json({ ok, port: PUERTO_PUENTE, origen: "ide", ...(ok ? {} : { motivo: "se pidió el reinicio pero /health no volvió a responder" }) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, port: PUERTO_PUENTE, error: err?.message || String(err) });
    }
  };
}

/**
 * El puente vive dentro del cierre de `startServer()` (`let bridge` en server.ts), así que
 * la función que despacha herramientas —que es de ámbito de módulo— no lo puede nombrar.
 * En vez de copiar el estado a otro lado (dos fuentes de verdad = dos opiniones sobre si
 * el :5000 está vivo), el server REGISTRA sus dependencias al nacer y esto las devuelve.
 */
let DEPS: DependenciasPuente | null = null;
export function fijarDependenciasPuente(d: DependenciasPuente) { DEPS = d; }
export function depsPuente(): DependenciasPuente | null { return DEPS; }

const NOMBRES = new Set(["puente_estado", "reiniciar_puente"]);
export const ES_HERRAMIENTA_PUENTE = (nombre: string) => NOMBRES.has(nombre);

export const SPEC_PUENTE_ESTADO = {
  type: "function",
  function: {
    name: "puente_estado",
    description:
      `Decir si el puente PC de :${PUERTO_PUENTE} está VIVO y si sus herramientas llegaron a esta sesión. Usarla CUANDO: un \`pc_exec\`/\`pc_read_file\` falla o no existe, el turno no trae herramientas de PC, o el usuario habla de puertos, puente, Reconectar o «no responde». Lee el /health real y distingue tres casos que se arreglan distinto: la IDE no lo spawnearon, lo spawnearon y se cayó, o está vivo pero es de otra instancia (adoptado). No adivines: si vas a decir que el puente anda mal, que lo diga esta herramienta.`,
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const SPEC_REINICIAR_PUENTE = {
  type: "function",
  function: {
    name: "reiniciar_puente",
    description:
      `Matar y volver a levantar el puente Python de :${PUERTO_PUENTE} (el mismo interruptor del botón «Reconectar» de la pestaña Puertos). Usarla DESPUÉS de \`puente_estado\` cuando dijo que la IDE lo spawnearon y está caído. Tarda ~1-9 s. Si el puente es adoptado o nunca existió, devuelve ok:false con el motivo real: en esos casos hay que decírselo al usuario, no insistir.`,
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

/** Ejecuta `puente_estado` / `reiniciar_puente`. Devuelve el JSON que lee el modelo. */
export async function ejecutarHerramientaPuente(nombre: string, _args: any, deps: DependenciasPuente): Promise<string> {
  const sondear = deps.sondear ?? sondearSaludPuente;
  const b = deps.bridge();
  const salud = await sondear();
  const origen = !b ? (salud.vivo ? "externo" : "ausente") : b.adoptado ? "adoptado" : "ide";
  const cargadas = deps.cargadas ? deps.cargadas() : [];
  const reintentos = deps.reintentos ? deps.reintentos() : null;

  if (nombre === "puente_estado") {
    const lectura = !b
      ? `No hay puente bajo control de esta IDE. ${salud.detalle}. ${salud.vivo ? "Responde otro proceso (otra instancia o un arranque manual): sus herramientas pueden faltar igual si el cargador no lo vio al nacer." : "Revisá que exista agent_bridge_5000.py y que el Python embebido esté en la ruta."}`
      : b.adoptado
        ? `La IDE ADOPTÓ un puente que ya estaba vivo (no lo spawnearon ella). ${salud.detalle}. Esta app no lo puede reiniciar.`
        : salud.vivo
          ? `Puente de la IDE vivo en :${PUERTO_PUENTE}. ${salud.detalle}.`
          : `El puente de la IDE está SPAWNEADO pero no responde. ${salud.detalle}. Se puede reiniciar con \`reiniciar_puente\`.`;
    return JSON.stringify({
      ok: true,
      puerto: PUERTO_PUENTE,
      vivo: salud.vivo,
      origen,
      spawniado_por_ide: Boolean(b) && !b.adoptado,
      herramientas_del_puente_en_sesion: cargadas,
      reintentos,
      lectura,
      siguiente_paso: !b
        ? "no hay interruptor que accionar desde la app: informale al usuario qué falta"
        : b.adoptado
          ? "pedile al usuario que reinicie esa instancia; no insistas con reiniciar_puente"
          : salud.vivo ? "el puente anda: si te faltan herramientas, el problema es otro" : "reiniciar_puente",
    });
  }

  // reiniciar_puente
  if (!b) {
    return JSON.stringify({ ok: false, puerto: PUERTO_PUENTE, origen, error: `la IDE no tiene un puente propio que reiniciar. ${salud.detalle}.` });
  }
  if (b.adoptado) {
    return JSON.stringify({
      ok: false, puerto: PUERTO_PUENTE, origen: "adoptado",
      error: `el puente de :${PUERTO_PUENTE} no lo nació esta IDE (lo adoptó porque ya estaba vivo): no lo puedo matar ni resubrir. Decile al usuario que reinicie esa instancia.`,
    });
  }
  try {
    deps.invalidar();
    const ok = await b.restart();
    const post = await sondear();
    return JSON.stringify({
      ok, puerto: PUERTO_PUENTE, origen: "ide", vivo: post.vivo,
      lectura: ok ? `Puente reiniciado y verificado. ${post.detalle}.` : `Se pidió el reinicio pero /health no volvió: ${post.detalle}.`,
      herramientas_del_puente_en_sesion: deps.cargadas ? deps.cargadas() : [],
    });
  } catch (e: any) {
    return JSON.stringify({ ok: false, puerto: PUERTO_PUENTE, error: String(e?.message || e) });
  }
}
