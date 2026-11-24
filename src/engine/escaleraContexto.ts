/**
 * escaleraContexto.ts — v1.0.20 · LA VENTANA NO SE PIDE POR DEBAJO DE LA ESCALERA
 * ============================================================================
 * RAÍZ (sesión de Mario, cerebronico-ide-sesion-1794621531453, mensajes 69-71):
 *   «HTTP 400: request (17929 tokens) exceeds the available context size
 *    (8192 tokens), try increasing it.»
 * y después, en el mismo hilo, «el modelo local cayó demasiado tiempo y se cortó».
 *
 * Los dos síntomas son el MISMO defecto en dos tiempos. El motor pedía 4096
 * (8 GB ⇒ tramo `small` con `lowRam`), el prompt real pesaba ~4,4× eso y el
 * recorte entraba en acción: recortar no elimina el defecto, lo esconde hasta
 * que alguien vuelve a pasar el tope. Y el dial del panel Pro (`ai.contextSize`,
 * que nace en 8192) era un REGULADOR CON DUEÑO PERO SIN CRITERIO: podía FIJAR la
 * ventana por debajo de lo que el prompt ya usa, y nadie lo juzgaba.
 *
 * LA REGLA (una sola, en un solo sitio):
 *   1. Si el usuario movió el dial y lo movió PARA ARRIBA, manda su pedido
 *      (topado por la RAM: eso ya lo cobra `techoDeContexto`).
 *   2. Si NO lo movió (o lo bajó por debajo de la escalera), manda la ESCALERA
 *      del perfil: un valor de fábrica no puede ser un techo.
 *   3. En modo liviano local la ventana NO CRECE por encima de la escalera: en
 *      CPU cada token de prompt extra se paga en el prefill.
 *   4. Si `/api/show` declara que el modelo no llega (p. ej. 8192), se CLAMPEA a
 *      lo declarado: pedir 16384 a un modelo de 8192 es el 400 garantizado.
 *
 * QUÉ NO HACE: no recorta mensajes (eso es `recortarMensajesAVentana`) y no toca
 * la red. Es puro y se prueba aislado (`tests/escaleraContexto.test.ts`).
 */

export interface EntradaVentana {
  /** `num_ctx` que dictó la escalera del perfil (modelTiers). */
  numCtxEscalera: number;
  /** `num_ctx` que pidió el usuario en el panel Pro (undefined = no se movió). */
  dialUsuario?: number;
  /** Coste real del prompt que se va a mandar, en tokens aproximados. */
  costoPromptTokens: number;
  /** Tokens que hay que dejar libres para la respuesta. */
  reservaSalidaTokens?: number;
  /** ¿Modo liviano local? Ahí la ventana no crece más allá de la escalera. */
  liviano?: boolean;
  /** Techo que la RAM paga (techoDeContexto). Aquí no se recalcula: se respeta. */
  topeRam?: number;
  /** Contexto REAL que declara el modelo en /api/show (si se conoce). */
  contextoDeclarado?: number | null;
}

export interface VeredictoVentana {
  /** El num_ctx que se manda a Ollama. Nunca menor que 512. */
  numCtx: number;
  /** true si el pedido del usuario fue respetado tal cual. */
  mandoElUsuario: boolean;
  /** Motivo legible; vacío cuando no hubo nada que corregir. */
  motivo: string;
}

const SUELO = 512;

/** Redondea hacia arriba a múltiplos de 1024: Ollama trabaja cómodo en bloques.
 * Por debajo del suelo (512) devuelve el suelo, sin redondear a la baja. */
export function redondearVentana(n: number): number {
  if (!Number.isFinite(n)) return SUELO;
  if (n <= SUELO) return SUELO;
  return Math.ceil(n / 1024) * 1024;
}

/**
 * Decide la ventana que se manda. Pura: mismas entradas → mismo número.
 */
export function decidirVentana(e: EntradaVentana): VeredictoVentana {
  const escalera = Number.isFinite(e.numCtxEscalera) && e.numCtxEscalera > 0 ? Math.floor(e.numCtxEscalera) : 8192;
  const reserva = Number.isFinite(e.reservaSalidaTokens) ? Number(e.reservaSalidaTokens) : 512;
  const necesario = Math.max(escalera, redondearVentana((e.costoPromptTokens || 0) + Math.max(0, reserva)));
  const tope = Number.isFinite(e.topeRam as number) && (e.topeRam as number) > 0
    ? Math.floor(e.topeRam as number)
    : Number.POSITIVE_INFINITY;
  const declarado = Number.isFinite(e.contextoDeclarado as number) && (e.contextoDeclarado as number) > 0
    ? Math.floor(e.contextoDeclarado as number)
    : Number.POSITIVE_INFINITY;

  const pedido = Number.isFinite(e.dialUsuario as number) && (e.dialUsuario as number) > 0
    ? Math.floor(e.dialUsuario as number)
    : null;

  const motivos: string[] = [];
  // 1 · ¿quién manda? El usuario solo si pidió MÁS que la escalera.
  const userManda = pedido !== null && pedido > escalera;
  let numCtx = userManda ? (pedido as number) : necesario;
  if (pedido !== null && !userManda && pedido < escalera) {
    motivos.push(
      `el dial pedía ${pedido} pero la escalera del perfil ya usa ${escalera}: un valor de fábrica no puede ser un techo`,
    );
  }

  // 2 · en liviano la ventana no crece más allá de la escalera.
  if (e.liviano && numCtx > escalera) {
    motivos.push(`modo liviano local: la ventana no crece (se queda en ${escalera}) porque en CPU el prefill se paga por token`);
    numCtx = Math.max(escalera, Math.min(numCtx, escalera));
  }

  // 3 · techo de RAM (ya cobrado por techoDeContexto: aquí solo se respeta).
  if (numCtx > tope) {
    motivos.push(`la RAM del equipo paga hasta ${tope} de ventana`);
    numCtx = tope;
  }

  // 4 · lo que el modelo DECLARA manda sobre cualquier deseo.
  if (numCtx > declarado) {
    motivos.push(`el modelo declara ${declarado} de contexto: pedirle más es el HTTP 400 garantizado`);
    numCtx = declarado;
  }

  return {
    numCtx: Math.max(SUELO, redondearVentana(numCtx)),
    mandoElUsuario: userManda && numCtx >= (pedido as number),
    motivo: motivos.join(" · "),
  };
}

/**
 * Lee el contexto real que declara el modelo en `POST /api/show`
 * (`model_info."<arquitectura>.context_length"`, el que sea). Devuelve null si
 * la versión de Ollama no lo reporta: no se inventa un número.
 */
export function contextoDeclaradoDeShow(json: any): number | null {
  if (!json || typeof json !== "object") return null;
  const info = json.model_info;
  if (info && typeof info === "object") {
    for (const [k, v] of Object.entries(info)) {
      if (/\.context_length$/.test(k)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
      }
    }
  }
  const alt = Number(json.context_length);
  return Number.isFinite(alt) && alt > 0 ? Math.floor(alt) : null;
}

/** Una línea para el log de arranque / el chat. Vacía si no hay nada que decir. */
export function parteDeVentana(v: VeredictoVentana, modelo: string): string {
  if (!v.motivo) return "";
  return `🪟 Ventana de «${modelo}»: ${v.numCtx} tokens (${v.motivo}).`;
}
