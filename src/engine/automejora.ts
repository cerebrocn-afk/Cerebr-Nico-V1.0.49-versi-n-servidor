/**
 * automejora.ts — LA POLÍTICA DE AUTOEMEJORAR DEL PROPIO IDE (v1.93.0)
 * ====================================================================
 * Pregunta de Mario (30/10): «¿nuestro IDE desde el dev puede automejorarse?» y la
 * condición con la que cierra: «DEBE DE TENER ACCESO A TODOS LOS COMANDOS SEGUROS DE
 * AUTOEMEJORA, SIEMPRE Y CUANDO ESTÉN CONFIRMADOS».
 *
 * Este módulo es la RESPUESTA EJECUTABLE a esa condición. Es CRITERIO PURO: sin
 * `fs`, sin `child_process`, sin red, sin React. Decide QUÉ se puede, a QUÉ nivel,
 * QUÉ hace falta para confirmarlo y CUÁNDO se adopta o se revierte un parche. La
 * ejecución real sigue en `server.ts` / `toolRegistry` (que ya tienen `run_command`,
 * `run_tests`, `write_file`, el quirófano y la capa de transacción); acá no se corre
 * nada, así que se puede probar sin que una prueba le escriba al propio IDE — que es
 * exactamente el riesgo número uno de la lista de Mario.
 *
 * ── QUÉ EXISTÍA YA (no se reimplementa, se articula) ──────────────────────────
 *   · `quirofano.ts`     → veredicto de un parche: seguro / revisar / peligroso
 *                          (exportaciones que desaparecen, ≥35 % de líneas útiles
 *                          perdidas, marcadores de truncado, package.json recortado).
 *   · `capaTransaccion.ts` → instantánea + `confirmar` / `revertir`.
 *   · `bucleAutonomo.ts`   → techos de pasos, escalones de reparación, firmas de
 *                            fallo (lo que corta «se queda trancado pensando»).
 *   · `autovalido.ts`      → dimensiona el turno; «reversibilidad» ya pone ROJO si
 *                            algo irreversible se ejecutó sin confirmar.
 *   · `comandoEntrante.ts` → normaliza el comando antes de tocar el shell.
 *   · `scripts/validar.mjs`→ la puerta: suites + `VEREDICTO` leído del log.
 * Lo que NO existía era el **mapa de comandos** con su nivel y la **autorización**.
 *
 * ── LOS TRES RIESGOS, CERRADOS CON REGLA MEDIBLE ─────────────────────────────
 *  1. Degradación (un error sutil que los tests no ven se hereda para siempre).
 *     → `decidirAdopcion` solo aprueba con el `VEREDICTO` del log LEÍDO (cero
 *       fallos, nunca «supongo que pasó»), `tsc` en 0 y veredicto del quirófano ≠
 *       `peligroso`. Si falta UNA sola de las tres, se REVIERTO. El lazo no puede
 *       declararse a sí mismo «seguro» mirándose al espejo.
 *  2. Alucinaciones de arquitectura (satura RAM, rompe asincronía).
 *     → `presupuestoDeParche`: un parche propio toca como máximo `MAX_ARCHIVOS`
 *       archivos y `MAX_LINEAS` líneas netas por tanda, y NUNCA las RUTAS INTOCABLES
 *       — el guardián no se reescribe a sí mismo, o la valla pasa a ser decorado.
 *  3. Prompt injection (un archivo del editor convence al modelo de inyectar un
 *     virus en el núcleo).
 *     → `autorizacionDe`: la autorización SOLO viene del usuario. Texto que llega
 *       por salida de herramienta, contenido de un archivo o un mensaje del modelo
 *       es `origen: "archivo" | "herramienta" | "modelo"` → `prohibido`, con o sin
 *       palabra mágica adentro. Y la lista es por IDENTIFICADOR normalizado: lo
 *       desconocido es `prohibido` (fail-closed), no «probá y vemos».
 *
 * ── LOS TRES PILARES, TRADUCIDOS A LA CASA ──────────────────────────────────
 *  · Self-correction      → `auditar_cuerpo` / `correr_puerta` / `compilar_cuerpo`
 *                           (tsc + validar.mjs + build). Auto, solo lectura.
 *  · Enrutamiento dinámico → `proponer_escala_modelo` (confirmar: cambia qué voz
 *                           resuelve, no toca disco).
 *  · Grafo de conocimiento → `reindexar_grafo` / `inspeccionar_indice` (auto para
 *                           leer, confirmar para reindexar).
 *  · Prompt tuning         → `proponer_parche_de_prompt` (confirmar; cae por el
 *                           quirófano y la puerta igual que cualquier parche).
 *  · Dataset / fine-tuning → `exportar_dataset` (confirmar, no borra nada) y
 *                           `ajuste_fino` = PROHIBIDO en el lazo: entrenar es una
 *                           decisión humana, con horas de máquina y un peso nuevo
 *                           que reemplaza al modelo que responde. No fingir que el
 *                           IDE entrena: hoy no tiene entrenador, y decir lo
 *                           contrario sería el ✔ inventado de siempre.
 */

export const VERSION_AUTOMEJORA = "1.0.0";

/** Los tres niveles. `prohibido` no es «más difícil»: es «no lo hace el lazo». */
export type NivelAutomejora = "auto" | "confirmar" | "prohibido";

/** De dónde vino la idea de autoemejorar. Define si se puede ejecutar. */
export type OrigenOrden = "usuario" | "modelo" | "herramienta" | "archivo";

export interface ComandoDeAutomejora {
  id: string;
  titulo: string;
  nivel: NivelAutomejora;
  /** Qué se ejecuta realmente (para mostrarlo ANTES de confirmar: nada oculto). */
  comando: string;
  /** Qué mira o para qué sirve, en una línea. */
  paraQue: string;
  /** `true` si hay reverso disponible (transacción/backup) si algo sale mal. */
  reversible: boolean;
  /** Pide confirmación explícita del usuario. */
  requiere: string;
}

/** Un identificador, no un prefijo: `npm run` a secas no autoriza un `npm install`. */
export const COMANDOS_DE_AUTOMEJORA: ReadonlyArray<ComandoDeAutomejora> = [
  // ── AUTO: leerse a sí mismo y medirse. No escriben nada, así que no hay riesgo
  //    de degradación y el bucle puede iterarlos todo lo que quiera.
  {
    id: "auditar_cuerpo",
    titulo: "Inventariar el propio cuerpo",
    nivel: "auto",
    comando: "node scripts/audita-reguladores.mjs",
    paraQue: "Qué reguladores y guardas están cables, y cuáles se aflojaron.",
    reversible: true,
    requiere: "",
  },
  {
    id: "mirar_decisiones",
    titulo: "Leer la bitácora de decisiones",
    nivel: "auto",
    comando: "node -e (leer decisiones.jsonl)",
    paraQue: "Dónde se concentraron los fallos del último tramo (insumo del parche).",
    reversible: true,
    requiere: "",
  },
  {
    id: "inspeccionar_indice",
    titulo: "Inspeccionar el índice y el grafo",
    nivel: "auto",
    comando: "node -e (estado de symbolIndex/grafoProyecto/vectorCerebro)",
    paraQue: "Qué está indexado, qué está sucio, cuánto pesa el grafo de conocimiento.",
    reversible: true,
    requiere: "",
  },
  {
    id: "correr_puerta",
    titulo: "Correr la puerta de pruebas",
    nivel: "auto",
    comando: "npm run validar",
    paraQue: "El VEREDICTO completo: suites, comprobaciones y fallos, leído del log.",
    reversible: true,
    requiere: "",
  },
  {
    id: "chequear_tipos",
    titulo: "Chequear tipos",
    nivel: "auto",
    comando: "npx tsc --noEmit",
    paraQue: "El primer filtro del parche propio: que el cuerpo compile.",
    reversible: true,
    requiere: "",
  },

  // ── CONFIRMAR: todo lo que toca el propio cuerpo o cambia el comportamiento.
  //    Cada uno muestra `comando` y `paraQue` ANTES de ejecutar; sin token del
  //    usuario no corren (y no corren aunque el texto del comando parezca inocuo).
  {
    id: "parchear_cuerpo",
    titulo: "Aplicar un parche al propio IDE",
    nivel: "confirmar",
    comando: "write_file + quirofano + tsc + validar (transacción con reverso)",
    paraQue: "Autorefactorización: arregla un cuello detectado y se prueba sola.",
    reversible: true,
    requiere: "token del usuario + quirófano ≠ peligroso + instantánea previa",
  },
  {
    id: "compilar_cuerpo",
    titulo: "Compilar el cuerpo (build)",
    nivel: "confirmar",
    comando: "npm run build",
    paraQue: "Regenera dist/ para correr el IDE con el cambio puesto.",
    reversible: true,
    requiere: "token del usuario (tarda y escribe dist/)",
  },
  {
    id: "reiniciar_ide",
    titulo: "Reiniciar el IDE con la nueva versión",
    nivel: "confirmar",
    // Ruta REAL del árbol (server.ts, `startAgentBridge()` expone `restart()`); no un
    // nombre inventado: una capacidad que nombra un endpoint inexistente se lee como
    // "ya está" y ese es el ✔ inventado con forma de comando.
    comando: "POST /api/bridge/restart",
    paraQue: "Recargar el servidor para que el parche entre en vigor.",
    reversible: true,
    requiere: "token del usuario (corta el turno en curso y el preview)",
  },
  {
    id: "proponer_escala_modelo",
    titulo: "Escalar de modelo para esta tarea",
    nivel: "confirmar",
    comando: "elegir voz en el selector de modelo / relevo de favoritos del turno",
    paraQue: "Auto-orquestación: si un 8B no da con la refactorización, pedir una voz mayor o RAG.",
    reversible: true,
    requiere: "token del usuario (cambia qué modelo ve el prompt: costo y privacidad)",
  },
  {
    id: "reindexar_grafo",
    titulo: "Reindexar el grafo de conocimiento",
    nivel: "confirmar",
    comando: "reindexar (symbolIndex + grafoProyecto + vectorCerebro)",
    paraQue: "Evolución del grafo: qué indexar y con qué metadatos para acertar después.",
    reversible: true,
    requiere: "token del usuario (reescribe índices persistidos)",
  },
  {
    id: "proponer_parche_de_prompt",
    titulo: "Reescribir un system prompt",
    nivel: "confirmar",
    comando: "write_file sobre el módulo de prompts (cae al quirófano)",
    paraQue: "Prompt tuning: la evidencia de fallos manda una redacción nueva.",
    reversible: true,
    requiere: "token del usuario + puerta verde (un prompt 'mejor' que rompe 40 suites no es mejor)",
  },
  {
    id: "exportar_dataset",
    titulo: "Exportar dataset de patrones confirmados",
    nivel: "confirmar",
    comando: "node scripts/exportar-contexto.mjs (o el exportador de patrones)",
    paraQue: "Empaqueta turnos correctos y verificados como material de ajuste.",
    reversible: true,
    requiere: "token del usuario (saca datos del proyecto a un archivo)",
  },
  {
    id: "entregar_zip",
    titulo: "Empacar la entrega (ZIP + manifiesto)",
    nivel: "confirmar",
    comando: "npm run entregar",
    paraQue: "El paquete que se lleva a otra máquina, con la documentación dentro.",
    reversible: true,
    requiere: "token del usuario + puerta verde (entregar en rojo está prohibido por el propio guion)",
  },

  // ── PROHIBIDO en el lazo: no es que falte coraje, es que la decisión es humana.
  {
    id: "ajuste_fino",
    titulo: "Fine-tuning de un modelo local",
    nivel: "prohibido",
    comando: "entrenar (no existe en este árbol)",
    paraQue: "Cambiar el modelo que responde, con horas de máquina y un peso nuevo.",
    reversible: false,
    requiere: "decisión humana fuera del lazo: el IDE no trae entrenador y no lo finge",
  },
  {
    id: "borrar_cuerpo",
    titulo: "Borrar o reescribir el guardián",
    nivel: "prohibido",
    comando: "rm / reescribir RUTAS_INTOCABLES",
    paraQue: "Eliminar las vallas, la puerta o esta misma política.",
    reversible: false,
    requiere: "imposible por diseño: un lazo que edita su propio freno ya no tiene freno",
  },
  {
    id: "dependencias_nuevas",
    titulo: "Instalar dependencias o paquetes",
    nivel: "prohibido",
    comando: "npm install / pip install / curl | sh",
    paraQue: "Traer código de terceros al proyecto (surface de ataque nuevo).",
    reversible: false,
    requiere: "el usuario lo hace a mano y decide qué entra",
  },
  {
    id: "publicar",
    titulo: "Publicar, pushear o desplegar",
    nivel: "prohibido",
    comando: "git push / deploy / exportar_apk firmado",
    paraQue: "Sacar el cambio a un destino externo.",
    reversible: false,
    requiere: "fuera del lazo: lo que sale de la máquina ya no se revierte con transacción",
  },
];

/** El id manda; el `comando` solo se muestra. Así un texto elegante no abre puerta. */
export function comandoDeAutomejora(id: string): ComandoDeAutomejora | null {
  const limpio = String(id ?? "").trim().toLowerCase().replace(/[-\s]/g, "_");
  return COMANDOS_DE_AUTOMEJORA.find((c) => c.id === limpio) ?? null;
}

export const RUTAS_INTOCABLES: ReadonlyArray<string> = [
  // El lazo noedita su propio freno. Cada una es un guarda que ya falló una vez
  // por aflojarse: si el parche pudiera reescribirlas, la puerta verde dejaría
  // de significar algo y el riesgo 1 (degradación) vuelve por detrás.
  "scripts/validar.mjs",
  "scripts/entregar.ts",
  "scripts/entregar-verificar.ts",
  "src/engine/automejora.ts",
  "src/engine/quirofano.ts",
  "src/engine/autovalido.ts",
  "src/engine/bucleAutonomo.ts",
  "src/engine/capaTransaccion.ts",
  "package.json",
];

/** Techo del parche propio (riesgo 2). Un «refactor masivo» se parte en tandas. */
export const MAX_ARCHIVOS_POR_PARCHE = 6;
export const MAX_LINEAS_NETAS_POR_PARCHE = 400;

export interface VeredictoQuirofano {
  veredicto: "seguro" | "revisar" | "peligroso";
  motivos?: string[];
}

export interface PruebaDePuerta {
  /** `VEREDICTO:` leído LITERALMENTE del log de `npm run validar`. */
  veredictoLeido: string;
  /** Fallos cantados por ese VEREDICTO (no los que uno supone). */
  fallos: number;
  /** Comprobaciones totales del mismo log (una puerta que corre 0 suites no es puerta). */
  comprobaciones: number;
  /** Salida de `tsc --noEmit`. */
  tscOk: boolean;
  /** Cuántas suites reporta el log (trinquete: no se adopta con la puerta vacía). */
  suites: number;
}

export type DecisionAdopcion =
  | { accion: "adoptar"; porQue: string }
  | { accion: "revertir"; porQue: string; bloqueantes: string[] }
  | { accion: "pedir_confirmacion"; porQue: string };

/** LA PALABRA EXACTA DE `scripts/validar.mjs` (v1.93.0, medido en la fuente):
 *    verde → `VEREDICTO: TODO CORRECTO — N comprobaciones, 0 fallos.`
 *             y en la línea siguiente `Tipos: 0 errores · N suites ejecutadas · …`
 *    rojo  → `VEREDICTO: HAY FALLOS — N fallo(s) sobre M comprobaciones …`
 *  Se lee la palabra, no se pregunta «¿pasó?»: un lazo que se auto-informa verde
 *  sin abrir el log es el riesgo 1 con buen vocabulario. ★ Si el día de mañana
 *  `validar.mjs` cambia su redacción, la valla `automejora` (sección 5) lo canta:
 *  comparar contra la fuente real es parte del contrato. */
const RE_VEREDICTO_OK = /VEREDICTO:[^\n]*\bTODO CORRECTO\b/;
const RE_VEREDICTO = /VEREDICTO:.*$/i;
const RE_FALLOS = /(\d+)\s*fallo/i;
const RE_COMPROBACIONES = /(\d[\d.]*)\s*comprobaciones/i;
const RE_SUITES_CORRIDAS = /(\d+)\s+suites\s+ejecutadas/i;

/** Los escapes de color del log no son contenido: sin esto, «VEREDICTO:» y su
 *  verbo quedan separados por `\u001b[0m` y la lectura falla en el log real. */
function sinAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return String(s ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}

/** Lee el VEREDICTO y sus conteos del log de la puerta. */
export function leerPruebaDePuerta(log: string, tscOk: boolean): PruebaDePuerta {
  const texto = sinAnsi(log);
  const lineas = texto.split("\n");
  const iVeredicto = lineas.reduce((acc, l, i) => (RE_VEREDICTO.test(l) ? i : acc), -1);
  const lineaVeredicto = iVeredicto >= 0 ? lineas[iVeredicto] : "";
  // Las suites van en la línea de resumen (verde) o se infieren del rojo.
  const contexto = lineas.slice(Math.max(0, iVeredicto - 2), iVeredicto + 3).join("\n");
  const fallos = Number((lineaVeredicto.match(RE_FALLOS) || [])[1] ?? NaN);
  const comprobaciones = Number((lineaVeredicto.match(RE_COMPROBACIONES) || [])[1] ?? NaN);
  const suites = Number((contexto.match(RE_SUITES_CORRIDAS) || [])[1] ?? NaN);
  const tiposEnElRojo = /(\d+)\s+error\(es\) de tipos/i.test(lineaVeredicto);
  return {
    veredictoLeido: lineaVeredicto.trim(),
    fallos: Number.isFinite(fallos) ? fallos : RE_VEREDICTO_OK.test(lineaVeredicto) ? 0 : -1,
    comprobaciones: Number.isFinite(comprobaciones) ? comprobaciones : -1,
    suites: Number.isFinite(suites) ? suites : -1,
    // Un VEREDICTO rojo que además canta errores de tipos es un tsc en rojo,
    // aunque quien llama no haya corrido `tsc` aparte.
    tscOk: Boolean(tscOk) && !tiposEnElRojo,
  };
}

/**
 * ¿Se adopta el parche o se revierte? Ordena la evidencia, no la ilusión.
 * Todo bloqueante se nombra: un «no» sin motivo es la ✗ muda que ya se corrigió
 * en v1.88.1 («el ✗ explica»).
 */
export function decidirAdopcion(opts: {
  prueba: PruebaDePuerta;
  quirofano: VeredictoQuirofano | null;
  reversible: boolean;
}): DecisionAdopcion {
  const { prueba, quirofano, reversible } = opts;
  const bloqueantes: string[] = [];
  if (!prueba.tscOk) bloqueantes.push("los tipos no cierran (tsc con errores)");
  if (!RE_VEREDICTO_OK.test(prueba.veredictoLeido)) bloqueantes.push("no se leyó «VEREDICTO: TODO CORRECTO» en el log de la puerta");
  if (prueba.fallos !== 0) bloqueantes.push(`el VEREDICTO canta ${prueba.fallos < 0 ? "fallos sin leer" : prueba.fallos} fallo(s)`);
  if (!(prueba.comprobaciones > 0)) bloqueantes.push("la puerta no reporta comprobaciones (¿corrió `npm run validar`?)");
  if (!(prueba.suites > 0)) bloqueantes.push("la puerta no reporta suites");
  if (quirofano === null) bloqueantes.push("el parche no pasó por el quirófano");
  else if (quirofano.veredicto === "peligroso") bloqueantes.push(`quirófano: peligroso — ${(quirofano.motivos || []).join("; ") || "sin motivo declarado"}`);
  if (!reversible) bloqueantes.push("no hay reverso disponible (sin instantánea previa)");
  if (bloqueantes.length) {
    return {
      accion: "revertir",
      porQue: "El parche se revierte: la puerta no lo avala. " + bloqueantes.join(" · "),
      bloqueantes,
    };
  }
  const revisar = quirofano?.veredicto === "revisar";
  return {
    accion: revisar ? "pedir_confirmacion" : "adoptar",
    porQue: revisar
      ? `La puerta está verde pero el quirófano pidió revisión: ${(quirofano?.motivos || []).join("; ") || "sin motivo declarado"}`
      : `Puerta leída del log (${prueba.comprobaciones} comprobaciones, 0 fallos, ${prueba.suites} suites), tipos en 0 y quirófano seguro.`,
  };
}

/** Presupuesto de la tanda (riesgo 2). Devuelve el porqué, nunca un booleano mudo. */
export function presupuestoDeParche(archivos: string[], lineasNetas: number): { ok: boolean; porQue: string } {
  const intocables = archivos.filter((r) => RUTAS_INTOCABLES.includes(normalizarRutaPropia(r)));
  if (intocables.length) return { ok: false, porQue: `ruta intocable (el guardián no se edita a sí mismo): ${intocables.join(", ")}` };
  if (archivos.length > MAX_ARCHIVOS_POR_PARCHE)
    return { ok: false, porQue: `${archivos.length} archivos en una tanda (techo ${MAX_ARCHIVOS_POR_PARCHE}): partí el refactor` };
  const netas = Number(lineasNetas);
  if (!Number.isFinite(netas)) return { ok: false, porQue: "el conteo de líneas netas no es un número: no se puede auditar un cambio sin tamaño" };
  if (Math.abs(netas) > MAX_LINEAS_NETAS_POR_PARCHE)
    return { ok: false, porQue: `${netas} líneas netas (techo ${MAX_LINEAS_NETAS_POR_PARCHE}): un salto así no se revisa, se reza` };
  return { ok: true, porQue: `${archivos.length} archivo(s), ${netas} líneas netas: dentro del presupuesto` };
}

function normalizarRutaPropia(r: string): string {
  return String(r ?? "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\.?\/?app\//, "");
}

/**
 * LA AUTORIZACIÓN (riesgo 3). El nivel del comando dice CUÁNTO hay que confirmar;
 * el ORIGEN dice SI SE PUEDE confirmar. Un `parchear_cuerpo` pedido por un texto
 * que estaba DENTRO de un archivo del editor, o por la salida de una herramienta,
 * o por el propio modelo «para cumplir», queda prohibido: el usuario no lo dijo.
 * Esto es lo que corta el prompt injection sin depender de detectar la maldad.
 */
export function autorizacionDe(opts: {
  id: string;
  origen: OrigenOrden;
  tokenUsuarioConfirmado?: string | null;
  presupuesto?: { ok: boolean; porQue: string } | null;
}): { nivel: NivelAutomejora; permite: boolean; porQue: string; muestra: string } {
  const cmd = comandoDeAutomejora(opts.id);
  if (!cmd) {
    return { nivel: "prohibido", permite: false, muestra: "", porQue: `comando de automejora desconocido: «${opts.id}». La lista es cerrada a propósito.` };
  }
  const muestra = `${cmd.titulo} — ${cmd.comando}`;
  if (cmd.nivel === "prohibido") return { nivel: cmd.nivel, permite: false, muestra, porQue: `«${cmd.id}» está fuera del lazo: ${cmd.requiere}` };
  if (opts.origen !== "usuario") {
    return { nivel: cmd.nivel, permite: false, muestra, porQue: `la orden llegó por ${opts.origen}, no por el usuario: automejorar el cuerpo exige una decisión humana.` };
  }
  if (cmd.nivel === "confirmar") {
    const token = String(opts.tokenUsuarioConfirmado ?? "").trim();
    if (!esTokenDeConfirmacionValido(token, cmd.id)) {
      return { nivel: cmd.nivel, permite: false, muestra, porQue: `falta confirmación explícita del usuario para «${cmd.id}». ${cmd.requiere}` };
    }
  }
  if (opts.presupuesto && !opts.presupuesto.ok) return { nivel: cmd.nivel, permite: false, muestra, porQue: opts.presupuesto.porQue };
  return { nivel: cmd.nivel, permite: true, muestra, porQue: cmd.nivel === "auto" ? "solo lectura/medición: no toca el cuerpo" : `confirmado por el usuario: ${cmd.requiere}` };
}

/**
 * Token de confirmación. Tiene que llevar el id del comando adentro: así una
 * confirmación de `compilar_cuerpo` no sirve para `parchear_cuerpo`, y un texto
 * genérico («sí», «dale», «ok») no abre ninguna puerta. Sin esto, la confirmación
 * sería un booleano que el modelo puede pedir una sola vez y reutilizar todo el día.
 */
export function tokenDeConfirmacionEsperado(id: string): string {
  const cmd = comandoDeAutomejora(id);
  const base = cmd ? cmd.id : String(id ?? "").trim().toLowerCase();
  return `CONFIRMO:${base}`;
}

export function esTokenDeConfirmacionValido(token: string, id: string): boolean {
  const limpio = String(token ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return limpio === tokenDeConfirmacionEsperado(id).toUpperCase();
}

/** La pregunta que ve el usuario: comando literal + para qué + reverso. Nada poético. */
export function preguntaDeConfirmacion(id: string): string {
  const cmd = comandoDeAutomejora(id);
  if (!cmd) return `No conozco el comando «${id}». La lista de automejora es cerrada.`;
  return [
    `Voy a: ${cmd.titulo}`,
    `Comando: ${cmd.comando}`,
    `Para qué: ${cmd.paraQue}`,
    `Reversible: ${cmd.reversible ? "sí, con instantánea previa" : "NO — esto no se puede deshacer"}`,
    `Necesito: ${cmd.requiere || "nada (es solo lectura)"}`,
    `Escribí ${tokenDeConfirmacionEsperado(cmd.id)} para que siga.`,
  ].join("\n");
}

/** Inventario para el panel/AYUDA: qué puede hacer el lazo hoy, sin misterio. */
export function inventarioDeAutomejora(): { auto: string[]; confirmar: string[]; prohibido: string[] } {
  const sale = { auto: [] as string[], confirmar: [] as string[], prohibido: [] as string[] };
  for (const c of COMANDOS_DE_AUTOMEJORA) sale[c.nivel].push(`${c.id} · ${c.titulo}`);
  return sale;
}
