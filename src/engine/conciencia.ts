/**
 * conciencia.ts — CONCIENCIA EN TIEMPO REAL (v1.47.2)
 * ====================================================
 * Pedido de Mario: que el protocolo de análisis no sea un cartel estático
 * («mira → planifica → verifica») sino que el agente tenga CONTEXTO VIVO del
 * turno en curso: qué está haciendo ahora mismo, qué pasos ya dio, cómo le fue
 * la última herramienta y qué le queda — para reconciliar su próxima jugada con
 * la realidad en vez de razonar a ciegas o repetir trabajo.
 *
 * Esto NO es memoria a largo plazo (eso lo lleva memoria.md). Es el «ahora»:
 * se reconstruye en cada turno a partir del espejo vivo (espejoVivo) y del
 * retrato del sandbox, y se inyecta en el prompt justo antes de que el modelo
 * decida su siguiente acción.
 *
 * Lógica pura: recibe una instantánea ya calculada (el servidor se la pasa) y
 * devuelve texto. No toca disco ni importa el monolito (sin ciclos).
 */

/** Instantánea mínima del «ahora» que el servidor sabe armar barato. */
// FASE 14 (v2.3.16): los permisos del turno se nombran con la política de dos ejes
// de `permisos.ts`. Puro, sin IO y sin ciclo de importaciones: `permisos.ts` no
// importa acá y no lee disco.
import { presetDesdePcMode } from "./permisos";
// FASE 16: la vista en capas de las entradas del motor. Se exporta desde acá, y no
// desde un archivo aparte, para que el índice auditado sea **el mismo texto** que se
// inyecta: dos copias es exactamente la deriva que la FASE 11 viene cazando.
import type { EntradaEnCapas } from "./capasSkills";

export interface InstantaneaConciencia {
  /** Objetivo declarado del turno (de espejoVivo), si lo hay. */
  objetivo?: string | null;
  /** Pasos/herramientas ya ejecutados este turno: la verdad de lo hecho. */
  pasos?: Array<{ herramienta: string; detalle?: string; ok: boolean | null }>;
  /** Recuento del plan vivo. */
  resumen?: { hechas: number; fallidas: number; sinHacer?: string[] } | null;
  /** Modelo/proveedor conduciendo ahora (para que sepa sus límites). */
  modelo?: string;
  proveedor?: string;
  /** ¿Tiene de verdad control del PC/sandbox este turno? */
  pcMode?: boolean;
  /** ¿Hay red disponible? (si no, no promete descargas/instalaciones). */
  red?: boolean;
  /** Retrato cortito del proyecto (de motorContexto), ya recortado. */
  retratoProyecto?: string | null;
  /** Último error relevante del turno, si lo hubo. */
  ultimoError?: string | null;
  /**
   * v1.48.0 — ¿es una TAREA PESADA / de responsabilidad? (interpretar una idea
   * para un software complejo, no un retoque). Cuando es `true`, la conciencia
   * antepone el CONTRATO DE ARQUITECTO: el orden de pensamiento que evita que un
   * modelo pequeño salte a teclear sin interpretar la idea ni descomponerla.
   */
  tareaPesada?: boolean;
  /**
   * v1.49.0 · FASE 2 — instantánea del FISCAL DEL ÚLTIMO METRO (autovalido.ts),
   * si en este turno ya hay dictamen. Forma laxa a propósito: la conciencia no
   * se acopla al tipo del fiscal, solo refleja su veredicto y su cobertura
   * honesta en el ESTADO VIVO para que el modelo sepa qué casilla le falta.
   */
  fiscal?: {
    veredicto: "CONFIRMADO" | "RECHAZADO";
    verde: number;
    roja: number;
    sinProbar: number;
    total: number;
    casillaBloqueada?: string | null;
  } | null;
}

/**
 * CONTRATO DE CONCIENCIA — las 5 preguntas que el agente se contesta ANTES de
 * cada acción. Es el protocolo de análisis convertido en bucle vivo: no se
 * responde una vez al principio, se re-responde en cada paso con el estado real.
 */
export const CONTRATO_CONCIENCIA =
  "[CONCIENCIA EN TIEMPO REAL — recálcula esto en CADA paso, no solo al empezar]\n" +
  "1) ¿DÓNDE ESTOY? Objetivo del turno + qué pasos ya di y cómo fueron. No repitas una acción ya hecha ni des por hecho un archivo que no has leído este turno.\n" +
  "2) ¿QUÉ CAMBIÓ por mi última acción? Si una herramienta falló, lee el error ANTES de reintentar; no repitas la misma llamada esperando otro resultado.\n" +
  "3) ¿QUÉ PUEDO REALMENTE hacer ahora? Mira tus herramientas y tus límites reales (si no hay control de PC o no hay red, no prometas lo que no puedes; di qué activar).\n" +
  "4) ¿CUÁL es el próximo paso MÍNIMO útil? Uno, pequeño y verificable; no un salto grande a ciegas.\n" +
  "5) ¿CÓMO verifico que salió bien? Define la comprobación antes de actuar (releer, compilar, abrir el preview). Si no puedes verificar, dilo.\n" +
  "Si el estado real contradice tu plan, GANA el estado real: ajusta el plan, no la realidad.";

/**
 * CONTRATO DE ARQUITECTO (v1.48.0) — el orden de pensamiento para TAREAS PESADAS
 * y de responsabilidad: interpretar una idea para un software complejo. No
 * sustituye a la conciencia en tiempo real; la ANTECEDE cuando la tarea es
 * grande, para que el modelo no salte a teclear antes de entender y descomponer.
 * Es la versión «bucle» (se re-recorre, no se lee una vez) del pack
 * kbArquitectura: aquí va comprimido al prompt; allí, consultable en detalle.
 */
export const CONTRATO_ARQUITECTO =
  "[MODO ARQUITECTO — tarea pesada / de responsabilidad: recorre este orden ANTES de teclear y recálculalo si algo cambia]\n" +
  "1) INTERPRETA LA IDEA. Reformúla con tus palabras qué se pide y para qué; separa lo explícito de lo implícito; nombra tus supuestos. Si es ambiguo, ofrece 2-3 interpretaciones concretas y un supuesto por defecto — no adivines en silencio.\n" +
  "2) DESCOMPÓN. Parte en piezas con UNA responsabilidad clara; para cada una, qué entra, qué sale y qué no le toca. Dependencias en un solo sentido (sin ciclos).\n" +
  "3) FIJA LOS CONTRATOS. Antes de implementar dos piezas que se hablan, define sus tipos de entrada/salida y errores. Implementa contra el contrato, no contra el vecino.\n" +
  "4) RIESGOS Y ESTADOS LÍMITE. Nombra qué puede fallar y cubre vacío/cargando/error/muchos/offline/sin permiso. Seguridad por defecto; cambios reversibles; no rompas lo que ya funciona.\n" +
  "5) CRITERIOS DE ACEPTACIÓN. Escribe cómo se COMPRUEBA que cada cosa prometida funciona (una condición observable por invariante). Si no sabes verificarlo, aún no entiendes el requisito.\n" +
  "6) PLAN PEQUEÑO Y REVERSIBLE. Avanza en pasos mínimos y verificables, de uno en uno; no un salto grande a ciegas. Consulta el pack de arquitectura del motor cuando dudes del oficio.";

/**
 * Detector determinista (sin modelo) de TAREA PESADA / de responsabilidad a
 * partir del texto del usuario. Es una heurística barata para decidir si vale
 * la pena anteponer el CONTRATO DE ARQUITECTO: busca señales de «construir algo
 * complejo» o «interpretar una idea», y descarta los retoques pequeños. Ante la
 * duda devuelve `false` (no gastar contexto si no hace falta).
 */
export function pareceTareaPesada(texto: string): boolean {
  const t = String(texto || "").toLowerCase();
  if (t.trim().length < 24) return false;
  const senalesPesadas = [
    /\b(arquitectura|diseñ[ao]|diseñar|estructura(r)?|refactor)\b/,
    /\b(sistema|aplicaci[óo]n|app|plataforma|m[óo]dulo|servicio|motor|pipeline)\b/,
    /\b(complej[oa]|desde cero|from scratch|end[ -]?to[ -]?end|integra(r|ci[óo]n)|migrar|migraci[óo]n)\b/,
    /\b(interpreta(r)?|idea|concepto|requisito(s)?|planifica(r)?|modela(r)?|base de datos|esquema)\b/,
    /\b(multi|varios m[óo]dulos|varias piezas|flujo completo|funcionalidad(es)?)\b/,
  ];
  const senalesLigeras = [
    /\b(typo|coma|renombr(a|ar)|cambia el (color|texto|t[íi]tulo)|arregla la l[íi]nea|un peque[ñn]o)\b/,
  ];
  const pesada = senalesPesadas.filter((re) => re.test(t)).length;
  const ligera = senalesLigeras.some((re) => re.test(t));
  // Dos o más señales de peso y ninguna marca de «retoque corto»: tarea pesada.
  return pesada >= 2 && !(ligera && t.length < 90);
}

function recortar(s: string, n: number): string {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/**
 * Arma el bloque de conciencia en tiempo real. Devuelve "" si no hay nada vivo
 * que reportar (primer paso del turno sin estado) para no gastar contexto en balde.
 * `budget` recorta la parte dinámica; el contrato (texto fijo) va aparte.
 */
export function buildConcienciaTiempoReal(snap: InstantaneaConciencia, budget = 900): string {
  const lineas: string[] = [];

  if (snap.objetivo && snap.objetivo.trim()) {
    lineas.push(`• Objetivo del turno: ${recortar(snap.objetivo, 160)}`);
  }

  const pasos = snap.pasos || [];
  if (pasos.length > 0) {
    const ultimos = pasos.slice(-5).map((p) => {
      const marca = p.ok === true ? "✔" : p.ok === false ? "✖" : "·";
      const det = p.detalle ? ` ${recortar(p.detalle, 48)}` : "";
      return `${marca} ${p.herramienta}${det}`;
    });
    lineas.push(`• Pasos ya dados este turno (${pasos.length}): ${ultimos.join(" | ")}`);
  }

  if (snap.resumen) {
    const r = snap.resumen;
    const pend = (r.sinHacer || []).length;
    lineas.push(`• Plan vivo: ${r.hechas} hechas, ${r.fallidas} fallidas, ${pend} sin hacer.`);
  }

  const limites: string[] = [];
  if (snap.modelo) limites.push(`modelo ${snap.modelo}${snap.proveedor ? ` (${snap.proveedor})` : ""}`);
  // FASE 14 (v2.3.16): el modelo deja de leer un booleano y lee el nombre del
  // preset y sus dos ejes. `control de PC: SÍ` no decía si escribir fuera pedía
  // confirmación o no; esto sí. El preset se DERIVA de `pcMode` con la equivalencia
  // exacta de hoy (`presetDesdePcMode`), así que cambiar esta línea no cambia ni un
  // candado: cambia lo que el modelo sabe de ellos.
  limites.push(`permisos: ${presetDesdePcMode(!!snap.pcMode).etiqueta}`);
  limites.push(`red: ${snap.red ? "sí" : "NO"}`);
  lineas.push(`• Capacidades ahora: ${limites.join(" · ")}.`);

  if (snap.ultimoError && snap.ultimoError.trim()) {
    lineas.push(`• ÚLTIMO ERROR a tener en cuenta: ${recortar(snap.ultimoError, 180)}`);
  }

  // v1.49.0 · FASE 2 — el veredicto del fiscal, si ya existe: ni la prosa ni el
  // plan vacío cierran si una casilla sigue roja. El modelo lo ve en vivo.
  if (snap.fiscal) {
    const f = snap.fiscal;
    const bloq = f.casillaBloqueada ? ` · BLOQUEADO en «${f.casillaBloqueada}»` : "";
    lineas.push(`• Fiscal del \u00faltimo metro: ${f.veredicto} — ${f.verde}✔ / ${f.roja}✖ / ${f.sinProbar}? sin probar (de ${f.total} casillas)${bloq}`);
  }

  if (snap.retratoProyecto && snap.retratoProyecto.trim()) {
    lineas.push(`• Proyecto: ${recortar(snap.retratoProyecto, 220)}`);
  }

  // Si no hay NADA dinámico salvo las capacidades, igual merece la pena mandar
  // el contrato (sirve de recordatorio), pero no el bloque de estado vacío.
  let dinamico = lineas.join("\n");
  if (dinamico.length > budget) dinamico = dinamico.slice(0, budget) + "\n[…estado recortado…]";

  // v1.48.0 — Tarea pesada / de responsabilidad: el CONTRATO DE ARQUITECTO va
  // DELANTE del de conciencia. Primero se piensa la obra (interpretar, descomponer,
  // contratos, riesgos, criterios), luego se reconcilia el «ahora» del turno.
  const cabecera = snap.tareaPesada
    ? `${CONTRATO_ARQUITECTO}\n\n${CONTRATO_CONCIENCIA}`
    : CONTRATO_CONCIENCIA;

  return `${cabecera}\n\n[ESTADO VIVO DEL TURNO]\n${dinamico}`;
}

/**
 * Entradas de KB con las MEJORES PRÁCTICAS del protocolo de análisis + conciencia.
 * Se siembran en la base de conocimiento para que el agente pueda consultarlas y
 * para dejar el saber dentro del motor (no en la cabeza del modelo).
 * Nota: se tipan como `any[]` y el servidor las añade con la forma de KbEntry;
 * se evita importar el tipo para no acoplar este módulo puro.
 */
// FASE 16 · DESTINO B — `AGENTS.md` DEL PROYECTO Y DEFERENCIA DEL SKILL.
// Idea tomada de `dsh` y verificada allí: el índice del motor dice **qué** carga,
// pero el entorno, las librerías y las convenciones las declara el proyecto. Esta
// entrada existe para que el modelo sepa a quién obedecer cuando los dos hablan:
// el skill **cede** ante la declaración del usuario. Sin esta línea, un `AGENTS.md`
// que diga «acá se usa pnpm» se pierde contra un pack genérico que no lo sabe.
export const AGENTS_MD_KB_ENTRY = {
  id: "agents-md-cede",
  table: "recetario-ui",
  title: "El skill cede ante AGENTS.md del proyecto",
  body:
    "Si el proyecto declara algo en AGENTS.md (entorno, librerias, comandos, estilo), eso manda sobre cualquier pack general de este motor: el skill cede y el pack solo describe como se trabaja cuando el proyecto no opin\u00f3. " +
    "Si AGENTS.md y el pack se contradicen, seguir AGENTS.md y decir en una linea que se lo siguió a el. Si AGENTS.md esta ausente, seguir el pack sin mencionarlo.",
  // Peso 1 y sin la palabra suelta «proyecto» entre las keys: con weight 3 esa
  // entrada **le ganaba el ruteo** a las específicas y `motor-estructura` lo cazó al
  // instante («el proyecto está en una subcarpeta» y «en qué puerto va» respondían
  // con la regla de deferencia). Es la invasión entre capas pero en la recuperación:
  // una regla general que pesa más que la respuesta concreta desplaza la respuesta.
  keys: ["agents.md", "agents-md", "convenciones", "deferencia"],
  tags: ["reglas"],
  weight: 1,
  lang: "es",
} as const;

export const CONCIENCIA_KB_ENTRIES = [
  AGENTS_MD_KB_ENTRY,
  {
    id: "ba-analisis-mirar",
    table: "recetario-ui",
    title: "Buenas prácticas: MIRAR antes de tocar",
    body:
      "Nunca supongas el contenido de un archivo. Antes de editar: list_files para ubicarlo y read_file / read_file_range para leer SOLO el tramo que vas a cambiar. Un archivo leído este turno es un hecho; uno recordado de hace rato puede estar desactualizado. Si vas a crear algo que quizá ya existe, busçalo primero (search_in_files).",
    keys: ["analizar", "mirar", "leer", "antes de", "list_files", "read_file", "suponer"],
    tags: ["buenas-practicas", "analisis", "conciencia"],
    weight: 0.9,
    lang: "es",
  },
  {
    id: "ba-analisis-plan",
    table: "recetario-ui",
    title: "Buenas prácticas: PLAN pequeño y verificable",
    body:
      "Divide en pasos mínimos. Para tareas de >2 pasos declara set_plan con tareas cortas (id + descripción accionable). Avanza de uno en uno; marca cada tarea al terminar. Un plan vivo evita que repitas trabajo y que te pierdas tras un error. No anuncies un plan gigante y luego lo abandones: pásalo por el espejo vivo.",
    keys: ["plan", "planificar", "set_plan", "pasos", "tareas"],
    tags: ["buenas-practicas", "analisis", "conciencia"],
    weight: 0.9,
    lang: "es",
  },
  {
    id: "ba-analisis-riesgo",
    table: "recetario-ui",
    title: "Buenas prácticas: medir el RIESGO (reversible vs irreversible)",
    body:
      "Clasifica cada acción por su reversibilidad. Reversible (crear, editar un tramo, borrar un elemento con deshacer): hazla y ofrece volver atrás. Irreversible o de impacto amplio (vaciar todo, borrado masivo, reescribir un archivo entero, tocar config de producción): avisa y confirma ANTES. Prefiere edit_file a reescribir entero; prefiere mover a borrar. En la UI: usa modal de confirmación SOLO para lo grave; para lo reversible, un toast con Deshacer (no abuses del modal).",
    keys: ["riesgo", "reversible", "irreversible", "borrar", "confirmar", "destructivo", "edit_file"],
    tags: ["buenas-practicas", "analisis", "conciencia"],
    weight: 0.92,
    lang: "es",
  },
  {
    id: "ba-analisis-verificar",
    table: "recetario-ui",
    title: "Buenas prácticas: VERIFICAR y reconciliar con la realidad",
    body:
      "Después de actuar, comprueba: relee lo escrito, compila o abre el preview en :3500. Si una herramienta falló, LEE el error antes de reintentar; no repitas la misma llamada esperando otro resultado. Si no pudiste verificar, dilo claro ('aplicado, sin verificar'). Si el estado real contradice tu plan, gana el estado real: ajusta el plan, no inventes la realidad.",
    keys: ["verificar", "comprobar", "preview", "error", "reintentar", "reconciliar"],
    tags: ["buenas-practicas", "analisis", "conciencia"],
    weight: 0.92,
    lang: "es",
  },
  {
    id: "ba-conciencia-vivo",
    table: "recetario-ui",
    title: "Buenas prácticas: usar la CONCIENCIA EN TIEMPO REAL",
    body:
      "En cada paso te llega un bloque [ESTADO VIVO DEL TURNO] con el objetivo, los pasos ya dados, el recuento del plan y tus capacidades reales (control de PC, red). Úsalo: no repitas un paso que ya figura como hecho, respeta tus límites (si no hay red no prometas instalar), y encadena tu próxima acción con lo último que pasó. Ese bloque es tu memoria del 'ahora'; la memoria.md es la del proyecto.",
    keys: ["conciencia", "tiempo real", "estado vivo", "ahora", "espejo vivo", "turno"],
    tags: ["buenas-practicas", "conciencia"],
    weight: 0.9,
    lang: "es",
  },
  {
    id: "ba-conciencia-limites",
    table: "recetario-ui",
    title: "Buenas prácticas: respetar los LÍMITES reales",
    body:
      "El bloque de estado vivo te dice qué puedes y qué no (control de PC, red, permisos). No prometas lo que no puedes cumplir: si no hay red, no digas 'instalo la dependencia'; propón una alternativa local. Si una acción es grave, para y confirma. Fingir una capacidad que no tienes rompe la confianza y deja el trabajo a medias. Mejor di la verdad del entorno y ofrece el mejor plan posible dentro de esos límites.",
    keys: ["limites", "capacidades", "red", "permisos", "no puedo", "entorno", "honestidad"],
    tags: ["buenas-practicas", "conciencia"],
    weight: 0.88,
    lang: "es",
  },
  {
    id: "ba-conciencia-memoria",
    table: "recetario-ui",
    title: "Buenas prácticas: dos memorias, el AHORA y el PROYECTO",
    body:
      "Tienes dos memorias y conviene no confundirlas. El estado vivo del turno es el 'ahora': objetivo, pasos dados y plan de este turno; se reinicia. La memoria.md del proyecto es la duradera: decisiones, convenciones y preferencias que deben sobrevivir entre turnos. Lee memoria.md al empezar algo largo y escribe en ella lo que valga la pena recordar. No metas datos efímeros en la duradera ni esperes que el 'ahora' recuerde turnos pasados.",
    keys: ["memoria", "memoria.md", "ahora", "persistir", "recordar"],
    tags: ["buenas-practicas", "conciencia"],
    weight: 0.88,
    lang: "es",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// v1.51.0 — BUCLES: cómo detectar y salir de un ciclo improductivo.
// Prefijo de id: "bucle-". Todas van a la tabla "recetario-ui".
// ───────────────────────────────────────────────────────────────────────────
// FASE 16 · DESTINO A — LAS ENTRADAS `bucle-*` PASAN A TRES CAPAS.
// El índice es la única pieza que viaja siempre: seis renglones que dicen **qué**
// pack bajar y, sobre todo, **cuándo no bajarlo**. Los cuerpos siguen existiendo con
// su id de siempre (reversibilidad: nada se borra), y el detalle largo quedó marcado
// `bajoDemanda` para que nadie lo inyecte «por las dudas». La invariante del plano —
// «una entrada del nivel 1 nunca contiene el cuerpo del nivel 3»— la corta
// `violaLasCapas()` y la vigila `tests/capasSkills.test.ts`.
export const BUCLE_INDICE_KB_ENTRY = {
  id: "bucle-indice",
  table: "recetario-ui",
  title: "Índice de packs de bucle: que cargar y que NO",
  // Cortado a menos de TOPE_INDICE_CARACTERES (260) a propósito: un índice que no
  // cabe en cuatro renglones ya es un cuerpo con nombre de índice, y esa es justo la
  // deriva que la invariante viene a cortar.
  // 244 caracteres: el tope del nivel 1 es 260 y la valla lo mide sobre el texto real,
  // no sobre una promesa (las dos versiones anteriores medían 283 y 268 y estaban
  // rojas). Enruta los SEIS packs: si un cuerpo no está nombrado acá,
  // `superficieInyectada` lo cuenta como viaje-siempre y el ahorro se evapora, que es
  // exactamente el chequeo que lo detecta. El «cuándo NO bajar» vive en su campo
  // (`cuandoNoConsultar`), no inflando el índice.
  body:
    "Se repite el paso: bucle-detectar-repeticion. Dos intentos: bucle-dos-intentos-regla. " +
    "Error con texto: bucle-leer-el-error. Caso grande: bucle-reducir-el-caso. " +
    "No da la herramienta: bucle-cambiar-de-herramienta. Tercera forma: bucle-pedir-ayuda.",
  keys: ["bucle", "indice", "ruteo", "packs"],
  tags: ["bucle"],
  weight: 3,
  lang: "es",
} as const;

/** Nivel 3 del pack «dos intentos»: se busca, no se inyecta. */
export const BUCLE_DETALLE_BAJO_DEMANDA = {
  id: "bucle-dos-intentos-detalle",
  table: "recetario-ui",
  title: "Detalle: como se cuenta un intento y que registrar",
  body:
    "Un intento cuenta como cambio de hipotesis, no como cambio de texto: reescribir el mismo fix con otros nombres es el mismo intento. " +
    "Al cerrar el segundo, registrar en la bitacora que se probo, con que se lo descarto y que queda en pie; sin eso, el proximo turno vuelve a probarlo.",
  keys: ["bucle", "intentos", "bitacora", "detalle"],
  tags: ["bucle", "detalle"],
  weight: 2,
  lang: "es",
} as const;

export const BUCLES_KB_ENTRIES = [
  BUCLE_INDICE_KB_ENTRY,
  {
    id: "bucle-detectar-repeticion",
    table: "recetario-ui",
    title: "Bucles: detectar que te estás repitiendo",
    body:
      "Si llamas dos veces a la misma herramienta con casi los mismos argumentos y obtienes el mismo error, estás en un bucle. Señales: el mismo mensaje de fallo se repite, el plan no avanza, o 'arreglas' algo que vuelve a romperse igual. En cuanto notes el patrón, PARA. Repetir más fuerte la misma acción no cambia el resultado; cambia el enfoque.",
    keys: ["bucle", "repetir", "mismo error", "ciclo", "estancado", "detectar"],
    tags: ["buenas-practicas", "bucles", "conciencia"],
    weight: 0.95,
    lang: "es",
  },
  {
    id: "bucle-leer-el-error",
    table: "recetario-ui",
    title: "Bucles: leer el error ANTES de reintentar",
    body:
      "Un reintento ciego es el combustible del bucle. Antes de volver a lanzar la herramienta, lee el mensaje de error entero: ruta, línea, nombre de símbolo, código de salida. La mayoría de los errores te dicen exactamente qué falta. Reintenta solo cuando hayas cambiado algo concreto en respuesta a lo que leíste; si no cambió nada, no reintentes.",
    keys: ["error", "leer", "reintentar", "mensaje", "diagnostico", "bucle"],
    tags: ["buenas-practicas", "bucles", "conciencia"],
    weight: 0.93,
    lang: "es",
  },
  {
    id: "bucle-dos-intentos-regla",
    table: "recetario-ui",
    title: "Bucles: la regla de los dos intentos",
    body:
      "Si un enfoque ha fallado dos veces, no lo parchees una tercera: diagnostica la causa raíz y prueba un camino distinto de verdad. Explica en una frase qué salió mal y por qué el nuevo enfoque es diferente. Dar pequeños toques al mismo plan que ya falló dos veces es la forma más común de quedarse atascado una hora.",
    keys: ["dos intentos", "causa raiz", "cambiar enfoque", "parche", "atascado", "bucle"],
    tags: ["buenas-practicas", "bucles", "conciencia"],
    weight: 0.95,
    lang: "es",
  },
  {
    id: "bucle-reducir-el-caso",
    table: "recetario-ui",
    title: "Bucles: reducir el caso para aislar la causa",
    body:
      "Cuando algo falla y no sabes por qué, encoge el problema. Comenta la mitad del código, prueba con una entrada mínima, aísla el bloque sospechoso. Un caso pequeño que reproduce el fallo vale más que mil reintentos sobre el caso completo. Cuando el mínimo funcione, ve añadiendo piezas hasta que vuelva a romperse: ahí está la causa.",
    keys: ["reducir", "aislar", "minimo", "reproducir", "depurar", "bucle"],
    tags: ["buenas-practicas", "bucles", "depuracion"],
    weight: 0.9,
    lang: "es",
  },
  {
    id: "bucle-cambiar-de-herramienta",
    table: "recetario-ui",
    title: "Bucles: cambiar de herramienta o de nivel",
    body:
      "Si la herramienta que usas no logra el objetivo tras varios intentos, cambia de herramienta o de nivel de abstracción. ¿edit_file no engancha el tramo? Reléelo con read_file_range y copia el texto exacto. ¿El build calla el error? Compila el archivo suelto. ¿La búsqueda no encuentra? Prueba otra palabra clave. A veces el bucle no está en el problema, sino en el instrumento que elegiste.",
    keys: ["cambiar herramienta", "abstraccion", "edit_file", "otra via", "bucle", "instrumento"],
    tags: ["buenas-practicas", "bucles"],
    weight: 0.88,
    lang: "es",
  },
  {
    id: "bucle-pedir-ayuda",
    table: "recetario-ui",
    title: "Bucles: cuándo parar y pedir una decisión",
    body:
      "Hay bucles que no se rompen con más trabajo porque falta información o una decisión del usuario (dos interpretaciones válidas, un requisito ambiguo, una acción irreversible). Cuando lo detectes, para y pregunta algo concreto en vez de dar vueltas. Perder un turno preguntando bien cuesta menos que diez turnos adivinando mal. Pregunta solo cuando no haya un valor por defecto razonable.",
    keys: ["pedir ayuda", "preguntar", "ambiguo", "decision", "parar", "bucle"],
    tags: ["buenas-practicas", "bucles", "conciencia"],
    weight: 0.86,
    lang: "es",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// v1.51.0 — COHERENCIA: mantener el proyecto consistente consigo mismo.
// Prefijo de id: "coher-". Todas van a la tabla "recetario-ui".
// ───────────────────────────────────────────────────────────────────────────
/**
 * FASE 16 · La familia `bucle-*` declarada en sus tres capas, con el criterio de uso
 * que el plano pide («cuándo consultarla y cuándo consultarla sería desperdicio»).
 * Es la **vista auditada**: `tests/capasSkills.test.ts` corre la invariante sobre
 * estas entradas y sobre el texto real de `BUCLES_KB_ENTRIES`, así que un índice que
 * se infle con el cuerpo adentro se pone rojo en vez de colar.
 */
export function capasDeConciencia(): EntradaEnCapas[] {
  const cuerpo = (id: string, cuando: string): EntradaEnCapas => {
    const e = BUCLES_KB_ENTRIES.find((x) => x.id === id);
    return {
      id,
      capa: "cuerpo",
      title: e?.title || id,
      body: e?.body || "",
      cuandoConsultar: cuando,
    };
  };
  return [
    {
      id: BUCLE_INDICE_KB_ENTRY.id,
      capa: "indice",
      title: BUCLE_INDICE_KB_ENTRY.title,
      body: BUCLE_INDICE_KB_ENTRY.body,
      cuandoConsultar: "cada turno en el que algo volvió a fallar",
      cuandoNoConsultar:
        "el primer intento de un paso nuevo, o un turno largo donde todavía no se repitió ninguna acción: bajar los seis packs por las dudas cuesta contexto y no cambia la decisión",
    },
    cuerpo("bucle-detectar-repeticion", "cuando el mismo error o el mismo paso aparece dos veces"),
    cuerpo("bucle-leer-el-error", "cuando el fallo devolvió texto y todavía no se lo leyó entero"),
    cuerpo("bucle-dos-intentos-regla", "cuando se va por el segundo intento sobre el mismo síntoma"),
    cuerpo("bucle-reducir-el-caso", "cuando el caso que falla es grande y no se aisló todavía"),
    cuerpo("bucle-cambiar-de-herramienta", "cuando la herramienta elegida no puede con el paso"),
    cuerpo("bucle-pedir-ayuda", "cuando se agotaron los enfoques propios"),
    {
      id: BUCLE_DETALLE_BAJO_DEMANDA.id,
      capa: "detalle",
      title: BUCLE_DETALLE_BAJO_DEMANDA.title,
      body: BUCLE_DETALLE_BAJO_DEMANDA.body,
      cuandoConsultar: "al cerrar el segundo intento, para dejar la probada y lo descartado en la bitácora",
      cuandoNoConsultar: "mientras el conteo de intentos no llegó a dos: todavía no hay nada que registrar",
      bajoDemanda: true,
    },
  ];
}

export const COHERENCIA_KB_ENTRIES = [
  {
    id: "coher-seguir-el-estilo",
    table: "recetario-ui",
    title: "Coherencia: seguir el estilo que ya existe",
    body:
      "Antes de escribir código nuevo, lee el de alrededor y cópialo: comillas, sangría, nombres, cómo se importan los módulos y qué librerías usa el proyecto. No introduzcas una librería nueva si ya hay una que hace el trabajo. Un cambio que respeta las convenciones del repo se integra sin ruido; uno que inventa su propio estilo obliga a todos a adaptarse a ti.",
    keys: ["estilo", "convenciones", "consistencia", "copiar patron", "libreria", "coherencia"],
    tags: ["buenas-practicas", "coherencia"],
    weight: 0.92,
    lang: "es",
  },
  {
    id: "coher-una-fuente-de-verdad",
    table: "recetario-ui",
    title: "Coherencia: una sola fuente de la verdad",
    body:
      "Cada dato importante (la versión, una ruta, una constante) debe vivir en un único sitio y referenciarse desde los demás. Si copias el mismo valor en cinco archivos, tarde o temprano se desincronizan. Cuando toques algo que aparece en varios lados, busca todas sus apariciones (search_in_files) y actualízalas a la vez, o mejor, redúcelas a una constante compartida.",
    keys: ["fuente de verdad", "duplicado", "constante", "version", "sincronizar", "coherencia"],
    tags: ["buenas-practicas", "coherencia"],
    weight: 0.92,
    lang: "es",
  },
  {
    id: "coher-cerrar-los-cabos",
    table: "recetario-ui",
    title: "Coherencia: cerrar todos los cabos de un cambio",
    body:
      "Un cambio rara vez vive solo. Si renombras una función, actualiza quien la llama; si añades una herramienta, añádela al manifiesto Y al ejecutor; si cambias una interfaz, ajusta los tipos y las pruebas. Antes de dar algo por hecho, pregúntate qué más depende de lo que tocaste. Un cambio a medias deja el proyecto incoherente y rompe el build más adelante.",
    keys: ["cabos", "dependencias", "renombrar", "manifiesto", "ejecutor", "paridad", "coherencia"],
    tags: ["buenas-practicas", "coherencia"],
    weight: 0.93,
    lang: "es",
  },
  {
    id: "coher-nombres-claros",
    table: "recetario-ui",
    title: "Coherencia: nombres que dicen la verdad",
    body:
      "Nombra variables, funciones y archivos por lo que de verdad hacen, en el mismo idioma y registro que el resto del proyecto. Un nombre que miente ('temp' para algo permanente, 'borrar' para algo que archiva) crea bucles de confusión cada vez que alguien lo lee. Si el comportamiento cambia, cambia el nombre; un nombre viejo pegado a un comportamiento nuevo es deuda que se paga con intereses.",
    keys: ["nombres", "nombrar", "claridad", "idioma", "semantica", "coherencia"],
    tags: ["buenas-practicas", "coherencia"],
    weight: 0.86,
    lang: "es",
  },
  {
    id: "coher-pruebas-y-contrato",
    table: "recetario-ui",
    title: "Coherencia: las pruebas son el contrato",
    body:
      "Las pruebas describen lo que el proyecto promete. Si cambias el comportamiento, actualiza la prueba en el mismo paso y por la razón correcta, no la ajustes a ciegas para que pase. Si una prueba falla, primero entiende qué contrato defiende: a veces el error está en tu cambio, no en la prueba. Mantener pruebas y código en sintonía evita que la próxima persona herede una mentira verde.",
    keys: ["pruebas", "test", "contrato", "comportamiento", "verde", "coherencia"],
    tags: ["buenas-practicas", "coherencia"],
    weight: 0.9,
    lang: "es",
  },
  {
    id: "coher-dejar-rastro",
    table: "recetario-ui",
    title: "Coherencia: dejar rastro de lo que cambiaste",
    body:
      "Cuando termines un cambio con peso, deja rastro: una línea en el CHANGELOG, una nota en memoria.md, un comentario breve donde el porqué no sea obvio. El rastro mantiene coherente la historia del proyecto y te salva a ti mismo dentro de tres turnos, cuando no recuerdes por qué algo está así. Escribe el porqué, no solo el qué: el qué ya se ve en el diff.",
    keys: ["rastro", "changelog", "memoria", "documentar", "porque", "coherencia"],
    tags: ["buenas-practicas", "coherencia"],
    weight: 0.85,
    lang: "es",
  },
];

/* ============================================================================
   v1.70.0 — HECHOS DEL ENTORNO (que el modelo no invente lo que no se midió)
   ============================================================================
   🐞 Sesión `1792793541672` (23/10). En el primer turno, sin una sola llamada a
   herramienta en todo el historial, el modelo abrió con:

     «Motor v1.51.0 activo. Entorno con 799 archivos indexados, sandbox operativo
       en puerto 3500 y puente PC en puerto 5000… 97 herramientas… Ollama apagado.»

   Real, medido en el árbol: `VERSION_SEMVER = 1.61.0` (1.51.0 no existe en ningún
   archivo), 37 herramientas nativas registradas en 7 packs, y el editor traía 19
   archivos. La cadena «archivos indexados» no aparece en ningún prompt inyectado:
   el modelo no la podía haber leído. Y cerró el msj 7 con «el sistema de
   autovalidación CONFIRMA que el puente está arriba», sin autovalidación alguna.

   El `[ESTADO VIVO DEL TURNO]` de arriba ya decía modelo, control de PC y red,
   pero NO decía versión, ni cuántas herramientas hay, ni el estado del puerto.
   Donde el prompt calla, el modelo completa. Este bloque cierra esas casillas con
   lo que leyó el motor y, sobre todo, dice qué hacer con lo que NO está leído.
   ========================================================================== */

export interface HechosDelEntorno {
  /** Versión real del motor (`VERSION_SEMVER`), leída del código. */
  version?: string | null;
  /** Herramientas efectivamente registradas ahora (`getAllToolNames().length`). */
  herramientas?: number | null;
  /** Archivos del editor en este turno, contados por el motor. */
  archivos?: number | null;
  /** Estado real del puerto del sandbox, medido (no supuesto). */
  sandbox?: "arriba" | "abajo" | "desconocido" | null;
  /** Herramientas que llegan por puentes externos (MCP), si el puente respondió. */
  herramientasExternas?: number | null;
}

/** La regla que acompaña al bloque: qué hacer con lo que no está acá. */
export const REGLA_DE_ESTADO =
  "Estos datos los midió el motor en este turno. No los inventes, no los redondees ni los contradigas. " +
  "Si algo que querés afirmar (versión, cantidad de archivos, herramientas, puertos, si Ollama está arriba) " +
  "no está en esta lista, NO LO AFIRMES: consultá la herramienta o decí explícitamente que no lo verificaste. " +
  "Decir «todo operativo» sin haberlo consultado es el error que rompió la sesión anterior.";

/**
 * Arma `[HECHOS DEL ENTORNO]` sólo con lo que se pasó medido. Si no hay ningún
 * dato, devuelve cadena vacía: un bloque de hechos vacío es peor que ninguno
 * (invitaría al modelo a creer que no hay nada y a inventar igual).
 */
export function bloqueDeHechos(h: HechosDelEntorno): string {
  const lineas: string[] = [];
  if (h?.version) lineas.push(`• Versión del motor: ${h.version}`);
  if (typeof h?.herramientas === "number") lineas.push(`• Herramientas registradas ahora: ${h.herramientas}`);
  if (typeof h?.herramientasExternas === "number") lineas.push(`• Herramientas de puentes externos: ${h.herramientasExternas}`);
  if (typeof h?.archivos === "number") lineas.push(`• Archivos en el editor: ${h.archivos}`);
  if (h?.sandbox && h.sandbox !== "desconocido") lineas.push(`• Sandbox (:3500): ${h.sandbox === "arriba" ? "arriba" : "abajo"}`);
  if (lineas.length === 0) return "";
  return `[HECHOS DEL ENTORNO — LEÍDOS, NO SUPUESTOS]\n${lineas.join("\n")}\n${REGLA_DE_ESTADO}`;
}
