/**
 * streamContext.ts — EL CONTEXTO DE STREAMING SSE (v1.14.0)
 * =========================================================
 * QUÉ ES: el contexto reutilizable que envuelve una respuesta de streaming
 * (`/api/ai/stream`) y su reloj detector de silencio (rearmable por chunk).
 * PARA QUÉ SIRVE: para tener UN solo sitio que escriba los eventos SSE (chunk,
 * done, error) sin repetir la lógica de aborto/watchdog en cada proveedor. Salió
 * de `server.ts` en la v1.14.0 para que la certeza se pudiera enganchar al texto
 * del modelo sin hacer crecer el monolito (trinquete de la Fase 2).
 *
 * v1.14.0 · LA CERTEZA LLEGA AL TEXTO DEL MODELO
 * -------------------------------------------------
 * Hasta aquí, el texto del modelo se emitía tal cual: podía decir «funciona» sin
 * ejecución detrás. Ahora el contexto ACUMULA los chunks (sin añadir latencia: es
 * memoria, no una segunda llamada al modelo) y, al cerrar el turno, pasa el texto
 * completo por `revisarSalida`. Si hay afirmaciones sin evidencia, el marcado
 * viaja EN el texto (un chunk más, antes del done), no en un banner. La frase que
 * explica qué significa la marca se dice UNA vez por conversación (regla R2).
 *
 * v1.46.0 · LA CERTEZA DEJA DE SER UN MENSAJE AUTOMÁTICO (pedido del usuario)
 * --------------------------------------------------------------------------
 * El marcado era correcto pero se colaba solo, dentro del chat. Ahora, por
 * defecto, la certeza viaja como DATO en el evento `done` y NO se escribe nada;
 * el aviso visible en el chat solo aparece con `CN_CERTEZA_MARCA=1`. La
 * vigilancia de fondo (revisarSalida) sigue igual.
 */
import type { Response } from "express";
import type { MetricasInferencia } from "../src/engine/metricasInferencia";
import { revisarSalida, marcaDeSalida, type EvidenciaModelo } from "../src/engine/certezaModelo";
// v1.46.0 — EL CABLE QUE FALTABA. Hasta aquí `setEvidencia()` estaba definido y
// NUNCA se llamaba, así que `this.evidencia` era siempre `{}` y `certezaDe({})`
// devolvía `sin_verificar` para todo: el revisor no podía distinguir un turno con
// doce herramientas de uno de charla. El acta del turno es de dónde sale ahora la
// evidencia real. Ver `src/engine/evidenciaTurno.ts`.
import { abrirTurnoEvidencia, evidenciaDelTurno } from "../src/engine/evidenciaTurno";
import { reiniciarAutovalido } from "../src/engine/autovalido"; // v1.49.0 · FASE 2
// v1.0.20 · «se corta» eran DOS causas con UNA frase: el aviso se arma con la
// medida real de Ollama (`prompt_eval_count`) y la ventana que se pidió.
import { avisoDeVentana } from "../src/engine/avisoVentana";

// v1.53.1 — EL RELOJ YA NO ES UN TOPE ABSOLUTO, ES UN DETECTOR DE SILENCIO.
// -------------------------------------------------------------------------
// Antes el reloj era un TECHO ABSOLUTO de 8 min desde el INICIO del stream,
// armado una vez en el constructor y solo cancelado por sendDone/sendError. Eso
// mataba por igual DOS casos opuestos:
//   1) una respuesta LARGA pero SANA (reporte extenso, bucle de agente con
//      herramientas) que seguía emitiendo tokens: se cortaba en seco a los 8
//      min aunque fuera avanzando — justo lo que se veía "trancado" y luego
//      "se cortó" a mitad de una palabra;
//   2) un stream REALMENTE colgado: también esperaba los 8 min completos.
// Ahora el reloj se REARMA en cada chunk real del modelo (ver bumpWatchdog):
// mientras llegue texto NO salta nunca; solo se dispara si el modelo enmudece
// WATCHDOG_IDLE_MS seguidos. El heartbeat (server) NO lo rearma a propósito:
// mide silencio del MODELO, no si el server sigue vivo.
// v1.56.3 — el tope de silencio ahora es AJUSTABLE con CN_WATCHDOG_IDLE_MS (ms).
// En equipos muy justos (p. ej. el Dell E6430 de 8 GB de Mario), un modelo
// local chico puede tardar en soltar la primera palabra; subir este valor
// evita que el watchdog corte una respuesta que aún estaba por llegar. Bajarlo
// hace que la UI se libere antes si el modelo se quedó mudo de verdad. Mínimo
// 10 s para no cortar en falso.
const WATCHDOG_IDLE_MS = (() => {
  const raw = parseInt(String(process.env.CN_WATCHDOG_IDLE_MS ?? "").trim(), 10);
  return Number.isFinite(raw) && raw >= 10_000 ? raw : 10 * 60 * 1000;
})(); // v1.0.15 · por defecto 10 min SIN datos del modelo → cierre (antes 3 min:
      // cortaba a los 3-4 min un turno de agente cuyo tramo de herramienta tardaba
      // más que eso; Mario 09/11: «las tareas que duraban ~20 min bajaron a 3-4»)
// v1.53.0 — Heartbeat SSE cada 15s durante inferencia para que el cliente sepa
// que la conexión sigue viva (P1 + P4: la UI se veía "colgada" esperando primer token).
const HEARTBEAT_INTERVAL_MS = 15_000;

// v1.66.1 · TECHOS DEL LATIDO DE CARGA (ver `latido()`): cuántas veces puede un
// modelo estirar el reloj del PRIMER BYTE antes de que el watchdog cierre.
// `SIN_SENSERA` = no dijo nada aprovechable (el tope histórico de 2).
// `TOTALES`    = techo absoluto contando progreso real, para que un stream que
//                sólo emite `status` no viva para siempre.
const LATIDOS_SIN_SENSERA_MAX = 2;
const LATIDOS_IGUALES_TOPE = 3;
const LATIDOS_TOTALES_MAX = 24;

/** Ya explicado (R2): la frase que enseña qué significan las marcas se dice una vez. */
const avisoCertezaYaDicho = new Set<string>();

/**
 * v1.46.0 — LA MARCA DE CERTEZA DEJA DE SER UN MENSAJE AUTOMÁTICO.
 * ==============================================================
 * El usuario lo pidió con estas palabras: «no mensajes automáticos como
 * [⚠️ CerebróNico no verifica lo que afirma el modelo: …]». Y tenía razón: el
 * aviso se añadía SOLO —el usuario no lo había pedido— y además se colaba en
 * medio de la conversación como si fuera parte de la respuesta.
 *
 * La vigilancia NO se apaga: `revisarSalida` sigue calculando la certeza de
 * cada turno. Lo que cambia es dónde se cuenta:
 *   · Por defecto, la certeza viaja en el evento `done` (campo `certeza`), un
 *     dato que la interfaz puede pintar como quiera —o ignorar— SIN escribir
 *     nada en el chat.
 *   · El texto visible en el chat solo se añade si se pide a propósito, con
 *     `CN_CERTEZA_MARCA=1`. Quien quiera el aviso lo activa; quien no, no lo ve.
 */
function marcaVisibleEnChat(): boolean {
  const v = String(process.env.CN_CERTEZA_MARCA ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "si" || v === "sí" || v === "on";
}

export class StreamContext {
  private aborted = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  /** v1.57.12 · el consejo del silencio habla DEL modelo elegido, no de la nube en general. */
  private avisoSilencio = "";
  // v1.57.18 · EL RELOJ MEDIDO (sesión 1792103924951): el tramo del PRIMER BYTE
  // tiene presupuesto propio —medido por modelo en relojModelos, no el 180 fijo—
  // y los eventos `status` de Ollama (cargando, informando progreso) cuentan
  // como VIDA: informar progreso es vivir.
  private presupuestoPrimerByteMs = 0;
  private etiquetaPresupuesto = "";
  private primerByteVisto = false;
  private extensionesDeCarga = 0;
  /** v1.66.1 · última señera de carga vista (`loading safetensors 43%`). */
  private ultimaSenialDeCarga = "";
  /** v1.66.1 · latidos consecutivos SIN señera nueva: señal de estancamiento. */
  private latidosIguales = 0;
  /** v1.53.0 — Temporizador del heartbeat SSE (cada 15s). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private acumulado = "";
  /**
   * Evidencia DECLARADA por quien construye el contexto (declaración explícita).
   * `null` = nadie declaró nada, y entonces se usa el ACTA REAL del turno. Antes
   * esto nacía en `{}` y se quedaba ahí: una evidencia vacía explícita es
   * indistinguible de «no se declaró», y esa ambigüedad escondía el agujero.
   */
  private evidenciaDeclarada: EvidenciaModelo | null = null;
  /** v1.46.0 — certeza del último turno, para viajar en `done` (dato, no párrafo). */
  private certezaTurno: string | null = null;
  private hayAfirmacionesSinEvidencia = false;
  /** v1.0.20 · ventana (num_ctx) que se le mandó a Ollama en este turno, si fue local. */
  private ventanaTurno: { numCtx: number; modelo: string } | null = null;

  /**
   * v1.0.20 · el motor declara con QUÉ ventana salió el pedido local. Sin este
   * dato el aviso no puede dividir; con él, `done` lleva si el prompt ya no cabe.
   */
  declararVentana(numCtx: number, modelo: string): void {
    const n = Number(numCtx);
    if (!Number.isFinite(n) || n <= 0) return;
    this.ventanaTurno = { numCtx: Math.floor(n), modelo: String(modelo || "") };
  }

  constructor(private readonly res: Response) {
    // v1.46.0 — EL CONSTRUCTOR ES EL TURNO. Un `StreamContext` por petición a
    // /api/ai/stream, así que aquí se abre el acta: el turno anterior se tira y
    // el registro empieza limpio. Sin esto, las herramientas de un mensaje
    // anterior concederían certeza al siguiente — que es otra forma de mentir.
    abrirTurnoEvidencia();
    // v1.49.0 · FASE 2 — un turno, un fiscal: la escalera de rechazos del
    // autovalido también se reinicia al abrir el turno.
    reiniciarAutovalido();

    // 🔧 CORRECCIÓN CRÍTICA: usar res.on("close"), NO req.on("close").
    // En Express, `req` emite 'close' al terminar de recibir el body (antes del
    // primer token), lo que marcaba isAborted=true al instante y mataba el
    // streaming de TODOS los proveedores. `res.on("close")` solo se dispara
    // cuando la conexión del cliente se corta de verdad (o ya terminamos).
    // El guard `!res.writableEnded` evita marcar abortado si ya cerramos limpio.
    res.on("close", () => {
      if (!res.writableEnded) this.aborted = true;
    });

    // v1.53.1 — Arranca el detector de silencio. Se rearma en cada sendChunk.
    this.bumpWatchdog();

    // v1.53.0 — Heartbeat SSE: cada 15s envía {heartbeat:true} para que el
    // cliente sepa que la conexión sigue viva y resetee su timeout de lectura.
    // El parser de engine.ts ya ignora eventos sin "text" ni "done",
    // así que esto es compatible con la versión anterior del cliente.
    this.heartbeatTimer = setInterval(() => {
      if (this.isWritable()) {
        this.res.write(`data: ${JSON.stringify({ heartbeat: true })}\n\n`);
      } else {
        // Conexión cerrada: limpiar heartbeat
        this.clearHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Declara lo que el motor SABE de esta respuesta (¿se ejecutó algo de verdad?).
   * Es una DECLARACIÓN EXPLÍCITA: si no se llama, manda el acta del turno.
   */
  setEvidencia(evidencia: EvidenciaModelo): void {
    this.evidenciaDeclarada = evidencia;
  }

  /**
   * La evidencia que se le entrega al revisor. La declarada a mano tiene
   * prioridad; si nadie declaró nada, se usa el acta REAL de lo que el turno
   * ejecutó. Antes esta función no existía y el valor era siempre `{}`.
   */
  private evidenciaEfectiva(): EvidenciaModelo {
    return this.evidenciaDeclarada ?? evidenciaDelTurno();
  }

  isAborted(): boolean { return this.aborted; }
  isWritable(): boolean { return !this.aborted && !this.res.writableEnded; }

  sendChunk(text: string): void {
    if (this.isWritable()) {
      this.res.write(`data: ${JSON.stringify({ text })}\n\n`);
      // v1.53.1 — llegó texto del modelo → el stream está vivo: rearmar reloj.
      // v1.57.18 — y si es la primera palabra, terminó el tramo del PRIMER BYTE:
      // de acá en más el reloj mide GENERACIÓN (silencio entre chunks).
      this.primerByteVisto = true;
      this.bumpWatchdog();
    }
    // Se acumula SIEMPRE (aunque la conexión esté cerrada): es el texto completo
    // que el revisor necesita al cerrar el turno. No añade latencia perceptible.
    this.acumulado += text;
  }

  sendDone(modelUsed: string, metricas?: MetricasInferencia | null): void {
    this.clearWatchdog();
    if (!this.isWritable()) return;

    // v1.14.0 · La respuesta pasa por el revisor ANTES de darse por terminada.
    // v1.46.0 · El aviso YA NO SE ESCRIBE SOLO en el chat (ver marcaVisibleEnChat).
    // v1.46.0 · Y la evidencia ya NO es siempre `{}`: sale del acta del turno.
    const revision = revisarSalida(this.acumulado, this.evidenciaEfectiva());
    this.certezaTurno = revision.certeza;
    this.hayAfirmacionesSinEvidencia = revision.avisos.length > 0;
    if (revision.avisos.length > 0 && marcaVisibleEnChat()) {
      const conExplicacion = !avisoCertezaYaDicho.has(revision.certeza);
      if (conExplicacion) avisoCertezaYaDicho.add(revision.certeza);
      this.res.write(`data: ${JSON.stringify({ text: marcaDeSalida(revision, conExplicacion) })}\n\n`);
    }

    // v1.6.32 · D8: la última línea del stream trae, además del modelo, la
    // MÉDIDA REAL del motor (tokens, tk/s, carga) cuando la hubo. Antes se
    // tiraba y el cliente la reconstruía a ciegas con len/4.
    // v1.46.0 · Y ahora también la CERTEZA del turno, como dato y no como
    // párrafo: `sin_verificar` + `afirmacionesSinEvidencia` permiten a la
    // interfaz señalar el turno sin escribir un mensaje automático en el chat.
    // v1.0.20 · EL AVISO SALE DEL DATO, NO DE LA SENSACIÓN. `prompt_eval_count`
    // es lo que Ollama procesó de verdad; comparado con la ventana del turno dice
    // si el próximo pedido ya no entra. Sin medida no se avisa (callar es verdad).
    let ventana: { nivel: string; ocupacion: number | null; texto: string } | null = null;
    if (this.ventanaTurno && metricas) {
      const av = avisoDeVentana(
        { tokensEntrada: metricas.tokensEntrada, msCarga: metricas.msCarga },
        this.ventanaTurno.numCtx,
        modelUsed || this.ventanaTurno.modelo,
      );
      if (av.avisa) ventana = { nivel: av.nivel, ocupacion: av.ocupacion, texto: av.texto };
    }
    this.res.write(`data: ${JSON.stringify({
      done: true,
      model: modelUsed,
      certeza: this.certezaTurno,
      afirmacionesSinEvidencia: this.hayAfirmacionesSinEvidencia,
      ...(metricas ? { metricas } : {}),
      ...(ventana ? { avisoVentana: ventana } : {}),
    })}\n\n`);
    this.res.end();
  }

  sendError(errMsg: string): void {
    this.clearWatchdog();
    if (this.isWritable()) {
      this.res.write(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`);
      this.res.end();
    }
  }

  sendTaskEvent(task: any): void {
    if (this.isWritable()) {
      this.res.write(`data: ${JSON.stringify({ task })}\n\n`);
      // v1.53.1 — actividad de herramientas también cuenta como "vivo".
      this.bumpWatchdog();
    }
  }

  /** v1.57.12 · el motor lo llama al abrir un turno local con el consejo según la familia del modelo (cerebroModelo.ts). */
  setAvisoSilencio(texto: string): void {
    this.avisoSilencio = String(texto || "");
  }

  /** v1.57.18 · el turno anuncia el presupuesto del primer byte de ESTE modelo (medido o por clase). */
  setRelojDePrimerByte(ms: number, etiqueta: string): void {
    const valor = Math.max(10_000, Math.round(Number(ms) || 0));
    this.presupuestoPrimerByteMs = valor;
    this.etiquetaPresupuesto = String(etiqueta || "");
    this.primerByteVisto = false;
    this.extensionesDeCarga = 0;
    this.ultimaSenialDeCarga = ""; // v1.66.1 · un reloj nuevo empieza sin historial de carga
    this.latidosIguales = 0;
    this.bumpWatchdog();
  }

  /**
   * v1.57.18 · INFORMAR PROGRESO ES VIVIR: cada `status` de Ollama rearma el reloj.
   * Acotado a 2 extensiones mientras no llegó el primer byte: un modelo que dice
   * «cargando» merece tiempo extra, pero no puede posponer el reloj para siempre.
   *
   * v1.66.1 · LA CUENTA CAMBIA DE OBJETO. El tope de 2 castigaba al modelo que
   * MÁS informa: Ollama suelta `loading safetensors 12%… 87%` en una carga fría
   * legítima, y al tercer aviso el reloj dejaba de rearmarse aunque el motor
   * estuviera avanzando delante de nuestra nariz. Ahora se cuentan las
   * repeticiones IGNORADAS, no los latidos: si `progreso` cambia de un latido al
   * siguiente hay movimiento real y el reloj se rearma; si se repite el mismo
   * texto, el tope de `LATIDOS_IGUALES_TOPE` sigue cortando. Un modelo estancado
   * en «loading model» eterno se sigue cerrando; uno que sube el porcentaje no.
   */
  latido(progreso = ""): void {
    if (this.res.writableEnded) return;
    if (!this.primerByteVisto) {
      const senial = String(progreso || "").trim();
      const avanza = senial !== "" && senial !== this.ultimaSenialDeCarga;
      if (avanza) this.ultimaSenialDeCarga = senial;
      // Techo duro en AMBOS caminos: el reloj puede estirarse, nunca indefinido.
      if (this.extensionesDeCarga >= LATIDOS_TOTALES_MAX) return;
      if (avanza) {
        this.latidosIguales = 0;
      } else {
        if (senial !== "") this.latidosIguales++;
        // Sin señera de progreso alguna se conserva el tope histórico de 2.
        if (senial === "" && this.extensionesDeCarga >= LATIDOS_SIN_SENSERA_MAX) return;
        // Mismo texto repetido: estancado, no progresando.
        if (this.latidosIguales >= LATIDOS_IGUALES_TOPE) return;
      }
      this.extensionesDeCarga++;
    }
    this.bumpWatchdog();
  }

  /** Tramo vigente: el PRIMER BYTE (medido) o la GENERACIÓN (180 s de siempre). */
  private msDelTramo(): number {
    if (this.primerByteVisto || this.presupuestoPrimerByteMs <= 0) return WATCHDOG_IDLE_MS;
    return this.presupuestoPrimerByteMs;
  }

  /**
   * v1.53.1 — (Re)arma el detector de silencio. Se llama al abrir el turno y en
   * CADA chunk real del modelo: mientras llegue texto el reloj nunca salta. Solo
   * si el modelo enmudece WATCHDOG_IDLE_MS seguidos se fuerza el cierre con un
   * mensaje agnóstico del proveedor (Ollama local o nube como Gemini).
   */
  private bumpWatchdog(): void {
    if (this.watchdog !== null) clearTimeout(this.watchdog);
    const tramoMs = this.msDelTramo();
    this.watchdog = setTimeout(() => {
      if (!this.res.writableEnded) {
        // v1.56.8 — EL AGUJERO: antes este cierre terminaba la respuesta al
        // NAVEGADOR pero dejaba `aborted` en false. Como `res.end()` pone
        // `writableEnded = true`, el listener de "close" ya no marcaba el aborto
        // (`if (!res.writableEnded)`), así que `isAborted()` seguía diciendo que
        // no. Los bucles de herramientas (OpenAI-compat y Gemini) preguntan
        // SOLO por `isAborted()` para decidir si dan otra vuelta: seguían
        // llamando a la nube paso a paso —pagando y esperando— con un cliente que
        // ya se fue. Es la forma exacta en que un turno «se cuelga en pensando»
        // y no termina hasta que el usuario escribe otra vez.
        this.aborted = true;
        const tramo = this.primerByteVisto ? "la GENERACIÓN" : "el PRIMER BYTE";
        console.warn(`[ai/stream] Watchdog: cierre forzado tras ${Math.round(tramoMs / 1000)}s SIN datos del modelo (tramo: ${tramo}${this.primerByteVisto ? "" : ` — ${this.etiquetaPresupuesto || "presupuesto por clase"}`}).`);
        const consejo = this.avisoSilencio || "⏱️ La respuesta se detuvo: el modelo dejó de enviar texto durante demasiado tiempo. Si es un modelo LOCAL de Ollama, reinícialo (ollama list); si es un modelo en la NUBE (p. ej. Gemini), reintenta o prueba con otro modelo de la lista.";
        this.res.write(`data: ${JSON.stringify({ error: consejo, done: true })}\n\n`);
        this.res.end();
      }
    }, tramoMs);
  }

  /** v1.53.0 — Limpia el temporizador de heartbeat. */
  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  clearWatchdog(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    // v1.53.0 — Al limpiar watchdog (done o error), también paramos heartbeat
    this.clearHeartbeat();
  }
}
