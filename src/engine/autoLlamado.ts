/**
 * autoLlamado.ts · QUE EL MOTOR SE LLAME A SÍ MISMO CUANDO QUEDA TRABAJO (v1.99.7)
 * ===============================================================================
 * El pedido de Mario (31/10), textual: «algo que no pedí fue: cuando le queden tareas por hacer
 * que se autollame, ¿puede ser? Como vos, cuando estás en segundo plano y terminás el validar
 * comenzás otra vez».
 *
 * LO QUE YA EXISTE Y NO SE DUPLICA (regla de la casa: un dueño por verdad):
 *   · `decidirBucle` + `directivaDePlanPendiente` (tope 3) gobiernan el **entro del turno**: el
 *     modelo quiere cerrar con etapas abiertas y el motor le exige tacharlas. Eso está, funciona,
 *     y este módulo NO lo repite.
 *   · `auditoriaBucle`/`huboReparacion` miran si el turno tropezó con la misma piedra.
 *   · `REANUDAR.md` es el parte que escribe el lanzador y lee el motor al empezar (contextCache).
 *
 * ACÁ VIVE EL CASO QUE FALTA: el turno **ya cerró** —sea porque el modelo se dio por terminado o
 * porque se gastó el techo— y sin embargo quedó trabajo nombrado. Eso es lo que el usuario venía
 * arreglando a mano con «sigue». La decisión de acá produce UN mensaje nuevo, encolado y visible,
 * que el usuario puede cancelar antes de que salga.
 *
 * LAS TRES FRONDERAS, en este orden (cada una con su motivo a la vista, nunca silencio):
 *   1. El interruptor. Prender esto gasta crédito del modelo pago, así que nace APAGADO y nadie
 *      lo enciende por el usuario. Apagado = callar, y se dice.
 *   2. Tope por conversación (`TOPE_AUTO_LLAMADOS`): dos re-entradas propias. Después de eso se
 *      entrega el informe honesto (`informeHonesto`, la misma voz del bucle) y se para.
 *   3. Estancamiento: si el trabajo pendiente firma IGUAL que el llamado anterior, el motor no
 *      volvió a aprender nada — y re-entrarse es la definición de bucle con buena actitud. Se
 *      mira la huella con `huellaError` (dueño: `ouroboros`), que ignora tiempos y números que
 *      cambian entre corridas.
 *
 * Puro: sin fs, sin red, sin reloj. Quién lee `REANUDAR.md` y quién encola el mensaje es el cable.
 */

import { huellaError } from "./ouroboros";
import { informeHonesto, type TareaPlan } from "./bucleAutonomo";

/** Re-entradas propias por conversación. Dos: la primera para seguir, la segunda para cerrar. */
export const TOPE_AUTO_LLAMADOS = 2;
/** Cuántas líneas de `REANUDAR.md` se tienen en cuenta (es un parte, no un manual). */
export const MAX_LINEAS_REANUDAR = 8;

export interface SeñalAutoLlamado {
  /** El interruptor del usuario. `false` es el defecto y es una decisión, no un olvido. */
  activado: boolean;
  /** El plan del turno, con sus estados. Vacío = no hubo planificador. */
  plan: TareaPlan[];
  /** Cantidad de re-entradas propias que YA se hicieron en esta conversación. */
  llamadosHechos: number;
  /** Cuántas se permiten. Se expone para poder probar el tope sin editar el módulo. */
  tope?: number;
  /** El turno cerró por excepción / red / corte: ahí la palabra la tiene la escalera de reparación. */
  turnoFallo: boolean;
  /** La última prosa del turno (lo que el modelo dijo al cerrar), para la huella. */
  conclusion: string;
  /** Huellas de los llamados anteriores, en orden. */
  sellosPrevios?: string[];
  /** El contenido de `REANUDAR.md`, si existe (lo lee el cable; acá se parsea). */
  reanudar?: string;
}

export type AccionAutoLlamado = "llamar" | "callar" | "agotar";

export interface DecisiónAutoLlamado {
  accion: AccionAutoLlamado;
  /** En español, para el usuario. Nunca vacío: callar también se explica. */
  motivo: string;
  /** El mensaje que se encola. `null` cuando no hay que llamar. */
  mensaje: string | null;
  /** Huella del trabajo pendiente (se guarda para detectar el estancamiento en el próximo cierre). */
  sello: string;
  /** Cuántas re-entradas quedan después de esta decisión. */
  restantes: number;
  /** De dónde salió el trabajo: del plan, del parte de arranque, o de ningún lado. */
  origen: "plan" | "reanudar" | "nada";
}

/**
 * Lo que quedó pendiente, en una lista de strings — la moneda común de las dos fuentes: el plan
 * del turno (estructurado) y `REANUDAR.md` (un parte en markdown). Sin esto el autollamado sólo
 * existiría para turnos que usaron planificador, que es justamente la mitad de los casos.
 */
export function trabajoPendiente(plan: TareaPlan[], reanudar?: string): { items: string[]; origen: "plan" | "reanudar" | "nada" } {
  const abiertas = (plan || []).filter((t) => t && t.status !== "done" && t.status !== "failed");
  if (abiertas.length > 0) return { items: abiertas.map((t) => `#${t.id} ${t.description}`), origen: "plan" };
  const delParte = parsearReanudar(reanudar || "");
  if (delParte.length > 0) return { items: delParte, origen: "reanudar" };
  return { items: [], origen: "nada" };
}

/**
 * La sección `## Trabajo pendiente` del parte que escribe el lanzador. Formato real (medido en el
 * `C:\Cerebronico` del usuario):
 *
 *     ## Trabajo pendiente
 *     - **Trabajo pendiente:** NINGUNO
 *
 * «NINGUNO» no es una tarea: es el parte diciendo que no hay. Devolverla como trabajo pendiente
 * sería el autollamado arrancando para siempre sobre una frase vacía.
 */
export function parsearReanudar(texto: string): string[] {
  const src = String(texto || "");
  const desde = src.indexOf("## Trabajo pendiente");
  const cuerpo = desde >= 0 ? src.slice(desde + "## Trabajo pendiente".length) : src;
  const hasta = cuerpo.search(/\n##\s/);
  const sección = hasta >= 0 ? cuerpo.slice(0, hasta) : cuerpo;
  const salida: string[] = [];
  for (const linea of sección.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.*)$/.exec(linea);
    if (!m) continue;
    // La etiqueta en negrita ES el título de la sección («**Trabajo pendiente:** NINGUNO»): no
    // aporta nada y, peor, tapaba la palabra que hay que reconocer. Se SUELTA la etiqueta y queda
    // el cuerpo del renglón — que es lo único que puede ser una tarea o una negación.
    const limpia = m[1]
      .replace(/^\s*\*\*[^*]*:?\*\*\s*:?\s*/, "")
      .replace(/^:\s*/, "")
      .trim();
    if (!limpia) continue;
    if (/^(ninguno|ninguna|ningun|nada|ningún)\b/i.test(limpia)) continue;
    if (/^(no hay|sin)\b/i.test(limpia)) continue;
    salida.push(limpia.slice(0, 200));
    if (salida.length >= MAX_LINEAS_REANUDAR) break;
  }
  return salida;
}

/**
 * La huella del trabajo. `huellaError` (dueño: `ouroboros`) normaliza números y tiempos, así que
 * «quedan 2 etapas, pasó lo mismo» firma IGUAL en dos corridas — que es exactamente lo que hay
 * que reconocer para no re-entrarse contra un muro.
 */
export function firmarTrabajo(items: string[], conclusion: string): string {
  return huellaError(`${items.slice(0, MAX_LINEAS_REANUDAR).join("\n")}\u0000${String(conclusion || "").slice(-400)}`);
}

/** El mensaje que el motor se manda a sí mismo. No pide permiso: nombra la primera etapa abierta. */
function mensajeDe(items: string[], intento: number): string {
  const primero = items[0] || "lo que quedó abierto";
  return (
    `[auto] Quedó trabajo pendiente del turno anterior: ${items.length} ítem(s). ` +
    `Seguí con el primero, sin volver a preguntar: ${primero}\n` +
    (intento >= TOPE_AUTO_LLAMADOS - 1
      ? `Es la última re-entrada automática de esta conversación: si no lo podés cerrar ahora, ` +
        `entregá el informe honesto de qué falta y por qué.`
      : `Cerrá la etapa con herramientas reales y evidencia; si una es imposible, decilo con causa en vez de cantarla hecha.`)
  );
}

/**
 * LA DECISIÓN. Orden importa: primero la voluntad del usuario, después la frontera de costo,
 * después la de estancamiento, y sólo al final el fallo del turno (que tiene su propio juez).
 */
export function decidirAutoLlamado(s: SeñalAutoLlamado): DecisiónAutoLlamado {
  const tope = Math.max(0, Number(s.tope ?? TOPE_AUTO_LLAMADOS) || 0);
  const hechos = Math.max(0, Number(s.llamadosHechos) || 0);
  const { items, origen } = trabajoPendiente(s.plan, s.reanudar);
  const sello = firmarTrabajo(items, s.conclusion);
  const restantes = Math.max(0, tope - hechos);

  if (!s.activado) {
    return { accion: "callar", motivo: "el autollamado está apagado (gasta crédito del modelo: lo prende el usuario)", mensaje: null, sello, restantes: 0, origen };
  }
  if (origen === "nada") {
    return { accion: "callar", motivo: "no quedó trabajo nombrado: el plan está cerrado y el parte dice NINGUNO", mensaje: null, sello, restantes, origen };
  }
  if (s.turnoFallo) {
    return { accion: "callar", motivo: "el turno terminó mal; ahí manda la escalera de reparación, no una re-entrada", mensaje: null, sello, restantes, origen };
  }
  if (hechos >= tope) {
    const comoPlan = (s.plan || []).filter((t) => t && t.status !== "done" && t.status !== "failed");
    return {
      accion: "agotar",
      motivo: `se agotaron las ${tope} re-entrada(s) automáticas y quedan ${items.length} ítem(s) abiertos`,
      // La misma voz del bucle: se informa, no se finge. Si el trabajo viene del parte (no del
      // plan), no hay `TareaPlan` que formatear y se nombra el origen en el motivo.
      mensaje: comoPlan.length > 0 ? informeHonesto(comoPlan, true) : null,
      sello,
      restantes: 0,
      origen,
    };
  }
  const vistos = s.sellosPrevios || [];
  if (vistos.includes(sello)) {
    return { accion: "callar", motivo: "el pendiente firma igual que el llamado anterior: el motor no aprendió nada nuevo", mensaje: null, sello, restantes, origen };
  }
  return { accion: "llamar", motivo: `quedan ${items.length} ítem(s) abiertos (${origen})`, mensaje: mensajeDe(items, hechos), sello, restantes: Math.max(0, restantes - 1), origen };
}

/** Una línea para la Hoja de Ruta: el motor dice qué hizo con su propio presupuesto. */
export function notaParaPanel(d: DecisiónAutoLlamado): string {
  if (d.accion === "llamar") return `🔁 me re-entré (${d.motivo}) · me quedan ${d.restantes}`;
  if (d.accion === "agotar") return `⏱ autollamado agotado · ${d.motivo}`;
  return `· sin re-entrada: ${d.motivo}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   v2.3.4 · EL LIBRO DEL LAZO (frente 3, primera mitad)
   ══════════════════════════════════════════════════════════════════════════
   El criterio de arriba decidía SI re-entrar, pero el estado que esa decisión
   exige no tenía dónde vivir: el contador por conversación, las huellas del
   estancamiento, el interruptor persistido, la cola cancelable y el techo de
   tiempo. Vivió primero en `colaAutoLlamado.ts` y se mudó ACÁ: dos órganos sueltos
   para una sola contabilidad es la receta del contador que se discrepa (la casa ya
   lo pagó con los puertos y con el `!== false`), y además sumaba un huérfano al
   trinquete sin necesidad. Puro: sin fs, sin shell, sin red, sin reloj propio.
   ══════════════════════════════════════════════════════════════════════════ */

/** Techo de una corrida completa, en segundos de reloj de pared (v2.3.4). */
export const PRESUPUESTO_CORRIDA_MS = 10 * 60 * 1000;

/** Cuántas conversaciones se recuerdan por proceso (LRU: el lazo no es un archivo). */
export const MAX_CONVERSACIONES_MEMORIA = 64;

export interface CuentaConversacion {
  /** Re-entradas propias ya hechas en esta conversación. */
  llamados: number;
  /** Huellas del trabajo pendiente de cada llamado, en orden de salida. */
  sellos: string[];
  /** Momento en que arrancó la corrida actual (para el presupuesto de tiempo). */
  inicioCorrida: number;
  /** Último mensaje puesto en cola, para poder mostrarlo y cancelarlo. */
  enCola: { mensaje: string; en: number; sello: string } | null;
  /** El último motivo dicho, para que el panel no tenga que adivinar. */
  ultimoMotivo: string;
  /** La última acción, cruda: `llamar` / `callar` / `agotar`. */
  ultimaAccion: string;
}

export interface EstadoCola {
  /** El interruptor del usuario. `false` es el default y es una decisión. */
  activado: boolean;
  tope: number;
  presupuestoMs: number;
  conversaciones: Record<string, CuentaConversacion>;
}

/** El estado inicial. `activado: false`: nadie enciende un lazo que quema crédito. */
export function estadoInicial(): EstadoCola {
  return { activado: false, tope: TOPE_AUTO_LLAMADOS, presupuestoMs: PRESUPUESTO_CORRIDA_MS, conversaciones: {} };
}

function cuentaNueva(en: number): CuentaConversacion {
  return { llamados: 0, sellos: [], inicioCorrida: en, enCola: null, ultimoMotivo: "", ultimaAccion: "" };
}

/** Da la cuenta sin crearla (para leer sin ensuciar el libro). */
export function cuentaDe(estado: EstadoCola, conversacion: string): CuentaConversacion | null {
  return estado.conversaciones[String(conversacion || "")] || null;
}

/**
 * Registra la decisión que el órgano tomó al cerrar el turno y devuelve el estado
 * NUEVO (no muta el recibido: el router guarda la referencia, y un estado mutable
 * compartido entre dos requests es la receta exacta del contador que se pisó).
 */
export function registrarCierre(
  estado: EstadoCola,
  conversacion: string,
  decision: Pick<DecisiónAutoLlamado, "accion" | "motivo" | "mensaje" | "sello">,
  ahora: number
): EstadoCola {
  const id = String(conversacion || "global");
  const previa = estado.conversaciones[id] || cuentaNueva(ahora);
  const llamar = decision.accion === "llamar" && !!decision.mensaje;
  const proxima: CuentaConversacion = {
    ...previa,
    // El contador solo sube cuando de verdad se encoló algo. Contar los "callar"
    // gastaría el tope de una conversación que nunca se re-entró.
    llamados: previa.llamados + (llamar ? 1 : 0),
    sellos: llamar ? [...previa.sellos, decision.sello] : previa.sellos,
    // Una decisión «callar» con trabajo cero cierra la corrida: el reloj del
    // presupuesto vuelve a cero para la próxima tarea, no se arrastra de siempre.
    inicioCorrida: llamar ? previa.inicioCorrida : ahora,
    enCola: llamar ? { mensaje: String(decision.mensaje), en: ahora, sello: decision.sello } : null,
    ultimoMotivo: decision.motivo,
    ultimaAccion: decision.accion,
  };
  return { ...estado, conversaciones: podar({ ...estado.conversaciones, [id]: proxima }, id) };
}

/**
 * La cola es visible y CANCELABLE a pedido del usuario («que se pueda cortar»).
 * Cancelar no borra los llamados hechos: si no, cancelar sería gratis y el tope
 * de costo se evade con un clic.
 */
export function cancelarCola(estado: EstadoCola, conversacion: string, ahora: number): EstadoCola {
  const id = String(conversacion || "global");
  const previa = estado.conversaciones[id];
  if (!previa || !previa.enCola) return estado;
  const proxima: CuentaConversacion = {
    ...previa,
    enCola: null,
    ultimoMotivo: "re-entrada cancelada a mano (los llamados hechos NO se perdonan: el tope se evade con un clic si se perdonan)",
    ultimaAccion: "cancelado",
  };
  return { ...estado, conversaciones: { ...estado.conversaciones, [id]: proxima } };
}

/** Prende o apaga el lazo. Apagar además despeja lo encolado: la orden es "no gastes". */
export function setInterruptor(estado: EstadoCola, activado: boolean, ahora: number): EstadoCola {
  const conversaciones: Record<string, CuentaConversacion> = {};
  for (const [k, v] of Object.entries(estado.conversaciones)) {
    conversaciones[k] = activado ? v : { ...v, enCola: null, inicioCorrida: ahora };
  }
  return { ...estado, activado: !!activado, conversaciones };
}

/** ¿Se acabó el tiempo de la corrida? Se consulta ANTES de encolar, no después. */
export function presupuestoAgotado(estado: EstadoCola, conversacion: string, ahora: number): boolean {
  const c = cuentaDe(estado, conversacion);
  if (!c) return false;
  return ahora - c.inicioCorrida > Math.max(0, estado.presupuestoMs);
}

/** El mensaje que hay en cola para esta conversación, o `null`. */
export function colaDe(estado: EstadoCola, conversacion: string): string | null {
  return cuentaDe(estado, conversacion)?.enCola?.mensaje ?? null;
}

/**
 * Resumen para el panel: una línea por conversación con algo que decir. Es lo que
 * hace que el lazo sea VISIBLE — un automático que no se puede leer es un automático
 * que se cree, y la casa no cree nada: lee.
 */
export function resumen(estado: EstadoCola): Array<{ conversacion: string; llamados: number; enCola: boolean; accion: string; motivo: string }> {
  return Object.entries(estado.conversaciones)
    .filter(([, c]) => c.llamados > 0 || c.enCola || c.ultimaAccion)
    .map(([conversacion, c]) => ({ conversacion, llamados: c.llamados, enCola: !!c.enCola, accion: c.ultimaAccion, motivo: c.ultimoMotivo }));
}

/** Serializable (a disco por el router) y re-entrante: leer lo escrito da lo mismo. */
export function paraDisco(estado: EstadoCola): string {
  return JSON.stringify(estado, null, 2);
}

export function desdeDisco(texto: unknown): EstadoCola {
  const base = estadoInicial();
  if (typeof texto !== "string" || !texto.trim()) return base;
  let j: any;
  try { j = JSON.parse(texto); } catch { return base; }
  if (!j || typeof j !== "object") return base;
  const conversaciones: Record<string, CuentaConversacion> = {};
  for (const [k, v] of Object.entries((j.conversaciones || {}) as Record<string, any>)) {
    if (!v || typeof v !== "object") continue;
    conversaciones[k] = {
      llamados: Number.isFinite(v.llamados) ? Math.max(0, Math.floor(v.llamados)) : 0,
      sellos: Array.isArray(v.sellos) ? v.sellos.map(String).slice(-8) : [],
      inicioCorrida: Number.isFinite(v.inicioCorrida) ? v.inicioCorrida : 0,
      enCola: v.enCola && typeof v.enCola.mensaje === "string" ? { mensaje: String(v.enCola.mensaje), en: Number(v.enCola.en) || 0, sello: String(v.enCola.sello || "") } : null,
      ultimoMotivo: String(v.ultimoMotivo || ""),
      ultimaAccion: String(v.ultimaAccion || ""),
    };
  }
  return {
    activado: j.activado === true,
    tope: Number.isFinite(j.tope) ? Math.max(0, Math.floor(j.tope)) : base.tope,
    presupuestoMs: Number.isFinite(j.presupuestoMs) ? Math.max(0, Math.floor(j.presupuestoMs)) : base.presupuestoMs,
    conversaciones: podar(conversaciones, ""),
  };
}

/** LRU de memoria: si la lista pasa el techo, se cae la más vieja en cola/uso. */
function podar(mapa: Record<string, CuentaConversacion>, preferida: string): Record<string, CuentaConversacion> {
  const claves = Object.keys(mapa);
  if (claves.length <= MAX_CONVERSACIONES_MEMORIA) return mapa;
  const orden = claves
    .filter((k) => k !== preferida)
    .sort((a, b) => (mapa[a].enCola?.en || 0) - (mapa[b].enCola?.en || 0));
  const fuera = orden.slice(0, claves.length - MAX_CONVERSACIONES_MEMORIA);
  const sale = { ...mapa };
  for (const k of fuera) delete sale[k];
  return sale;
}

