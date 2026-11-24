/**
 * ouroboros.ts — v1.57.14 · AUTO-CURACIÓN CON PRESUPUESTO, NO CON FE
 * ==================================================================
 * EL DISEÑO QUE MANDÓ EL USUARIO ("Bucle Ouroboros": validar → si hay rojo,
 * reinyectar el error → reintentar hasta el 100 % verde) describe una idea que
 * en esta casa YA está construida, repartida en cuatro módulos:
 *
 *   · `autovalido.ts`        → la valla atómica (un comando, un veredicto)
 *   · `evidenciaTurno.ts`    → el acta: ESCRIBIR no concede certeza; solo
 *                              run_command/run_tests pueden acreditar «ejecutado»
 *   · `motorRecuperacion.ts` → la escalera nivel 0..4 (corrección local →
 *                              rollback → bloqueo con causa y evidencia)
 *   · `selfImprovement.ts`   → la lección capturada viaja al prompt siguiente
 *
 * y un precedente que el blueprint ignora: `planDeDesatasco` (v1.56.8) y
 * `fusibleGemini` (v1.57.12) enseñaron que **reintentar una causa externa es
 * quemar el día del usuario**. Un 404 de Gemini no se arregla con paciencia.
 *
 * LO QUE SÍ FALTABA (y es lo único que este módulo aporta): un intérprete de la
 * salida de `npm run validar` que sepa DÓNDE está el error de verdad. Medido
 * sobre el log real de esta sesión, no inventado:
 *
 *   VEREDICTO: HAY FALLOS — 11 fallo(s) sobre 6681 comprobaciones.
 *
 *     hindsight
 *       5 · Wrapper Node del SDK (pack :5101) — en seco, sin servidor
 *       Error [ERR_MODULE_NOT_FOUND]:
 *       (salida completa: npx tsx tests/hindsightHibrido.test.ts)
 *
 * Fijarse en el detalle que mata el blueprint: el veredicto imprime la PRIMERA
 * línea del error y remite a la suite. El `stderr` completo NO está en la salida
 * agregada. Realimentar «stdout» al modelo, como propone el blueprint, le
 * devuelve un truncamiento sin stack, sin archivo y sin línea: el modelo vuelve
 * a acertar de suerte. Por eso el plan de auto-curación tiene una acción que
 * el blueprint no prevé: **re-ejecutar la suite roja y recién then curar**.
 *
 * SEGUNDO DEFECTO DEL BLUEPRINT, medido en esta máquina: `maxIntentos = 10` por
 * 6700 comprobaciones cuesta decenas de minutos de CPU — la misma CPU que la
 * lección del 14/10 exige no saturar. Y si el fallo es de ENTORNO (el vínculo
 * `@vectorize-io/hindsight-agent-sdk` que hoy faltaba en node_modules, la queja
 * «No encuentro tsx en node_modules», quota, clave, sin red), diez intentos dan
 * diez rojos idénticos y cero información nueva. De ahí las dos guardas propias
 * de este módulo: `estancado()` (dos hashes iguales = el modelo no aprendió nada
 * = rendirse con causa) y `presupuestoDeIntentos()` (el tope lo fija el costo
 * medido, no el deseo).
 *
 * TERCEDO: el extracto que viaja al modelo tiene que caber en el `num_ctx` que
 * el motor ya topó por RAM (techoContexto). Un error de 200 KB en una ventana de
 * 16384 tokens no se recorta «a ojo»: se recorta por presupuesto y se DECLARA
 * cuánto se tiró, que es la costumbre honesta de la casa.
 *
 * Es un módulo PURO: no ejecuta nada, no lee el disco, no toca la red. Recibe
 * texto y devuelve decisiones. Quien ejecuta es el bucle (server.ts, ruta o
 * planificador), que ya existe; acá vive el criterio.
 */

/**
 * Sin ANSI: `validar` pinta en verde/rojo con escape sequences y, si esas
 * secuencias viajan al prompt, el modelo recibe basura y los patrones de este
 * módulo no calzan. Se quita acá, en la entrada, una sola vez.
 * (El módulo es autocontenido a propósito, como `modelTiers.ts`: cero imports.)
 */
export function stripAnsi(texto: string): string {
  return texto.replace(/\u001b\[[0-9;]*m/g, "");
}

/** Un intento de autodepuración ya pasado, reducido a lo que decide. */
export interface IntentoCuracion {
  /** El extracto que se le mandó al modelo. */
  extracto: string;
  /** Huella del error: dos iguales significan «no se aprendió nada». */
  huella: string;
  /** Milisegundos que costó la validación de ese intento (medida, no supuesta). */
  costoMs: number;
}

export interface VeredictoValidacion {
  /** exit code del comando: 0 = todo verde. */
  codigo: number;
  /** true si la línea VEREDICTO declaró éxito. */
  verde: boolean;
  /** «11» de «11 fallo(s) sobre 6681 comprobaciones». */
  fallas: number;
  comprobaciones: number;
  /** ids de suite en rojo (los que el informe lista en el bloque de fallos). */
  suitesRojas: string[];
  /** suites que NO llegaron a ejecutarse (crash en el import, fichero ilegible). */
  suitesSinCorrer: number;
  /** suites del catálogo que ya no están en disco (alguien las borró). */
  desaparecidasCatalogo: number;
  /** marcas ✗ en suites declaradas verdes: fallo sin contabilizar, casi siempre. */
  marcasSueltas: number;
  /** si el paso `tipos` (tsc) reportó errores. */
  tiposRojos: boolean;
  /** cuántos errores de tipo dijo tsc, si lo dijo. */
  erroresTipo: number;
}

/**
 * Las cuatro formas del veredicto, COPIADAS del fuente de scripts/validar.mjs
 * (líneas 448-470), no recordadas:
 *   verde → «VEREDICTO: TODO CORRECTO — 6681 comprobaciones, 0 fallos.»
 *   rojo  → «VEREDICTO: HAY FALLOS — A error(es) de tipos y B fallo(s) sobre C
 *            comprobaciones y D suite(s) que NO llegaron a ejecutarse y E
 *            suite(s) del catálogo que YA NO están en disco.»
 * Las cuatro condiciones son independientes y se unen con " y ": parsear solo
 * la primera dejaría un rojo disfrazado de verde.
 */
const RE_VERDE = /VEREDICTO:\s*TODO CORRECTO[^\d]*(\d+)\s+comprobaciones/;
const RE_TIPOS_ROJOS = /(\d+)\s+error\(es\) de tipos/;
const RE_FALLAS = /(\d+)\s+fallo\(s\) sobre\s+(\d+)\s+comprobaciones/;
const RE_NO_CORRIERON = /(\d+)\s+suite\(s\) que NO llegaron a ejecutarse/;
const RE_DESAPARECIDAS = /(\d+)\s+suite\(s\) del catálogo que YA NO están en disco/;
const RE_MARCAS_SUELTAS = /AVISO:\s*(\d+)\s+marca\(s\)/;
const RE_TIPOS = /^\s*tipos\b.*?(\d+)\s+errores/m;
const RE_SALIDA_COMPLETA = /\(\s*salida completa:\s*npx tsx\s+(\S+)\s*\)/g;

/**
 * Lee la salida de `validar` y saca la estructura. Tolerante: si una forma no
 * está, deja el campo en 0 o vacío en vez de estallar — un intérprete que
 * revienta contra el log convertido en un auto-curador peor que ninguno.
 */
export function parsearVeredicto(salidaBruta: string, codigo: number): VeredictoValidacion {
  const salida = stripAnsi(salidaBruta || "");
  const verdeM = salida.match(RE_VERDE);
  const fallasM = salida.match(RE_FALLAS);
  const tiposRojosM = salida.match(RE_TIPOS_ROJOS);
  const noCorrioM = salida.match(RE_NO_CORRIERON);
  const desaparecidasM = salida.match(RE_DESAPARECIDAS);
  const marcasM = salida.match(RE_MARCAS_SUELTAS);
  const lineaTiposM = salida.match(RE_TIPOS);
  const erroresTipo = tiposRojosM ? Number(tiposRojosM[1])
    : lineaTiposM ? Number(lineaTiposM[1])
    : (salida.match(/error TS\d+/g) || []).length;
  const fallas = fallasM ? Number(fallasM[1]) : verdeM ? 0 : NaN;
  const comprobaciones = fallasM ? Number(fallasM[2]) : verdeM ? Number(verdeM[1]) : 0;

  // El bloque de fallos: `  <id>` al inicio de línea, seguido de líneas sangradas.
  const suitesRojas: string[] = [];
  const despues = salida.slice(salida.search(/VEREDICTO:/));
  for (const linea of despues.split("\n")) {
    if (/^ {2}\S/.test(linea) && !/^\s*(VEREDICTO|No se da)/.test(linea)) {
      const id = linea.trim().split(/\s+/)[0];
      if (/^[a-zA-Z][\w-]*$/.test(id) && !suitesRojas.includes(id)) suitesRojas.push(id);
    }
  }

  // Las otras dos condiciones del veredicto, independientes de las comprobaciones.
  const suitesSinCorrer = noCorrioM ? Number(noCorrioM[1]) : 0;
  const desaparecidasCatalogo = desaparecidasM ? Number(desaparecidasM[1]) : 0;
  const marcasSueltas = marcasM ? Number(marcasM[1]) : 0;

  // Verde SOLO si el informe lo declaró y ninguna de las cuatro condiciones arde.
  const verde = codigo === 0 && !!verdeM && !fallasM && !tiposRojosM && !noCorrioM && !desaparecidasM;
  return {
    codigo,
    verde,
    fallas: isNaN(fallas) ? 0 : fallas,
    comprobaciones,
    suitesRojas,
    suitesSinCorrer,
    desaparecidasCatalogo,
    marcasSueltas,
    tiposRojos: erroresTipo > 0,
    erroresTipo,
  };
}

/** Lo que la auto-curación puede hacer, en orden de especificidad. */
export type CausaFallo =
  | "ninguna"        // verde: consolidar
  | "entorno"        // falta módulo/node_modules/tsx/python: NO es del modelo
  | "contrato"       // trinquete/superficie/contrato-rutas: herramienta determinista
  | "tipos"          // tsc: se puede curar con el mensaje exacto
  | "prueba"         // suite roja con nombre: curable, hay que leerla entera
  | "crash"          // suite sin resultado: import roto, fichero borrado
  | "externo"        // quota / 429 / clave / red: rendirse con causa, nunca reintentar
  | "desconocido";

export interface Clasificacion {
  causa: CausaFallo;
  /** Reintentar puede ayudar (hay información nueva que leer y corregir). */
  curable: boolean;
  /** La corrección la hace una herramienta determinista, no el modelo. */
  accion?: "regenerar-contrato" | "re-ejecutar-suite" | "ninguna";
  /** Receta exacta para el humano, si la causa es externa. */
  receta?: string;
  detalle: string;
}

const RE_ENTORNO = /ERR_MODULE_NOT_FOUND|Cannot find package|No encuentro tsx|MODULE_NOT_FOUND|ENOENT|node_modules|No se encontró el programa|python-embed|command not found/i;
const RE_CONTRATO = /trinquete|presupuesto_lineas|superficie|contrato-rutas|server\.ts (no crece|superó)|l[íi]neas del monolito|techo_absoluto/i;
const RE_EXTERNO = /429|quota|cuota|insufficient|API key|clave (inválida|faltante)|401|403|ENOTFOUND|ETIMEDOUT|no longer available|rate limit/i;

/**
 * Nombra la causa REAL del rojo. La distinción importa porque cambia la acción:
 * `entorno` y `externo` se rinden con receta (reintentarlas es robarle minutos
 * y cuota al usuario); `tipos` y `prueba` sí son curables.
 */
export function clasificarFallo(v: VeredictoValidacion, salida = ""): Clasificacion {
  if (v.verde) return { causa: "ninguna", curable: false, accion: "ninguna", detalle: "todo verde" };
  const s = stripAnsi(salida || "");
  const primerRuido = v.suitesRojas[0] || "";
  if (RE_EXTERNO.test(s)) {
    return { causa: "externo", curable: false, detalle: "cuota, clave o red en el mensaje de fallo",
      receta: "Revisar la clave/cuota del proveedor o la conexión; no reintentar con el modelo." };
  }
  if (RE_ENTORNO.test(s)) {
    const paquete = (s.match(/Cannot find package '([^']+)'/) || [])[1];
    return { causa: "entorno", curable: false,
      detalle: `falta una dependencia del entorno${paquete ? `: ${paquete}` : ""} (suite ${primerRuido || "sin nombre"})`,
      receta: paquete ? `npm run vendor:sdk (o reinstalar node_modules); el fallo no es del código generado.`
        : /No encuentro tsx/i.test(s) ? "npm ci en la raíz del proyecto." : "Verificar node_modules y el intérprete." };
  }
  if (RE_CONTRATO.test(s)) {
    const salto = (s.match(/(\d+)\s*(?:→|->)\s*(\d+)/) || []);
    return { causa: "contrato", curable: false, accion: "regenerar-contrato",
      detalle: `el contrato de superficies no calza${salto.length ? ` (${salto[1]} → ${salto[2]})` : ""}`,
      receta: "node scripts/superficie.mjs (regenerar) y recién then validar. Es una herramienta determinista: el modelo no tiene nada que escribir acá." };
  }
  if (v.tiposRojos) return { causa: "tipos", curable: true, accion: "ninguna", detalle: `${v.erroresTipo} error(es) de TypeScript` };
  if (v.suitesSinCorrer > 0) return { causa: "crash", curable: true, accion: "re-ejecutar-suite", detalle: `${v.suitesSinCorrer} suite(s) que no llegaron a correr` };
  if (v.fallas > 0) return { causa: "prueba", curable: true, accion: "re-ejecutar-suite",
    detalle: `${v.fallas} comprobación(es) en rojo sobre ${v.comprobaciones} (primera: ${primerRuido || "?"})` };
  return { causa: "desconocido", curable: true, accion: "ninguna", detalle: "veredicto en rojo sin patrón reconocido" };
}

/** La suite se ejecuta en dos formas distintas en este proyecto. */
export function comandoDeSuite(archivo: string): string {
  if (archivo.endsWith(".py")) return `python ${archivo}`;
  if (archivo.endsWith(".mjs")) return `node ${archivo}`;
  return `node node_modules/tsx/dist/cli.mjs ${archivo}`;
}

/**
 * El comando que hay que correr para ver el error COMPLETO de la suite roja.
 * Sale de la propia línea `(salida completa: …)` del informe, no de una conjetura.
 */
export function comandoDeRelectura(salida: string): string | null {
  const todas = comandoDeRelecturaTodas(salida);
  return todas.length ? todas[0] : null;
}

/**
 * TODAS las suites que hace falta volver a leer, en el orden en que el informe
 * las print. Un rojo con tres suites sueltas exige tres lecturas, no una.
 */
export function comandoDeRelecturaTodas(salida: string): string[] {
  const re = new RegExp(RE_SALIDA_COMPLETA.source, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripAnsi(salida || "")))) {
    const cmd = comandoDeSuite(m[1]);
    if (!out.includes(cmd)) out.push(cmd);
  }
  return out;
}

/** Huella estable: ignora tiempos y números de línea que cambian entre corridas. */
export function huellaError(texto: string): string {
  const s = stripAnsi(texto || "")
    .split("\n")
    .map((l) => l.replace(/\d+/g, "#").trim())
    .filter((l) => l && !/^\[?\d{2}:\d{2}/.test(l))
    .join("\n")
    .slice(0, 4000);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

/**
 * Dos rojos con la misma huella = el modelo no aprendió nada del primero.
 * Esta es la guarda que el blueprint no tiene: «reintentar hasta el 100 %» con
 * un error que no cambia es un bucle infinito con muy buena actitud.
 */
export function estancado(historial: IntentoCuracion[]): boolean {
  if (historial.length < 2) return false;
  const a = historial[historial.length - 1].huella;
  const b = historial[historial.length - 2].huella;
  return a === b;
}

export interface Presupuesto {
  intentos: number;
  motivo: string;
  /** Minuto y medio de validación completa en CPU modesta; se puede medir. */
  costoValidacionMs: number;
  techoMinutos: number;
}

/**
 * El tope lo fija el COSTO, no la ilusión. `maxIntentos = 10` del blueprint, a
 * una validación de 90 s, son 15 min de CPU secuestrada — justo lo que la
 * lección del 14/10 dice que no se puede hacer en la máquina del usuario.
 * Con `costoValidacionMs` medido se obtiene un tope honesto y se DECLARA.
 */
export function presupuestoDeIntentos(costoValidacionMs: number, minutosPresupuestados = 4): Presupuesto {
  const costo = Number.isFinite(costoValidacionMs) && costoValidacionMs > 0 ? costoValidacionMs : 90_000;
  const techoMs = minutosPresupuestados * 60_000;
  const n = Math.max(1, Math.min(4, Math.floor(techoMs / costo)));
  return {
    intentos: n,
    costoValidacionMs: costo,
    techoMinutos: minutosPresupuestados,
    motivo: `cada validación cuesta ${(costo / 1000).toFixed(0)} s y el techo es ${minutosPresupuestados} min de CPU: ${n} intento(s). Pedir 10 sería secuestrar ${(10 * costo / 60000).toFixed(1)} min.`,
  };
}

export interface Extracto {
  texto: string;
  /** true si hubo que tirar líneas (el informe lo dice, no lo calla). */
  recortado: boolean;
  charsOmitidos: number;
  lineasConservadas: number;
}

/**
 * Recorta el error para que quepa en el `num_ctx` REAL del turno, priorizando
 * las líneas que nombran archivo/línia/código de error. Devuelve cuántos
 * caracteres tiró: un extracto que esconde su propio recorte miente.
 */
export function extractoParaElModelo(salida: string, charsDisponibles: number): Extracto {
  const limpio = stripAnsi(salida || "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const valor = (l: string) => {
    let v = 0;
    if (/error TS\d+/.test(l)) v += 60;
    if (/\(\d+,\d+\)/.test(l)) v += 30;                    // file.ts(12,7):
    if (/Error \[/.test(l)) v += 45;
    if (/✗|fallidas|HAY FALLOS|VEREDICTO/.test(l)) v += 25;
    if (/Traceback|File "|line \d+/.test(l)) v += 40;      // Python
    if (/^\s*$/.test(l)) v -= 20;
    return v;
  };
  const ordenadas = limpio
    .map((l, i) => ({ l, i, v: valor(l) }))
    .filter((x) => x.l.length > 0)
    .sort((a, b) => b.v - a.v || a.i - b.i);

  const presupuesto = Math.max(200, Math.floor(Number(charsDisponibles) || 4000));
  const tomadas: { l: string; i: number }[] = [];
  let usados = 0;
  for (const x of ordenadas) {
    if (usados + x.l.length + 1 > presupuesto) continue;
    tomadas.push(x);
    usados += x.l.length + 1;
  }
  tomadas.sort((a, b) => a.i - b.i);
  const total = limpio.reduce((s, l) => s + l.length + 1, 0);
  return {
    texto: tomadas.map((t) => t.l).join("\n"),
    recortado: usados < total,
    charsOmitidos: Math.max(0, total - usados),
    lineasConservadas: tomadas.length,
  };
}

export type AccionOuroboros =
  | { tipo: "consolidar" }
  | { tipo: "re-ejecutar-suite"; comando: string; razon: string }
  | { tipo: "curar"; prompt: string; intentosRestantes: number }
  | { tipo: "regenerar-contrato"; receta: string }
  | { tipo: "rendirse"; causa: CausaFallo; motivo: string; receta?: string };

export interface EntradaPlan {
  veredicto: VeredictoValidacion;
  salida: string;
  historial: IntentoCuracion[];
  presupuesto: Presupuesto;
  /** El archivo que la suite roja imprime con su primer fallo (si se sabe). */
  archivoFallo?: string;
  /** El num_ctx topado del turno: de techoContexto/modelTiers, no un literal. */
  charsDisponibles?: number;
}

/**
 * LA DECISIÓN. Un puro `entrada → acción`, sin spawn, sin fs, sin modelo: así
 * se puede probar cada rama con un fixture del log real.
 *
 * Orden deliberado:
 *   1. verde → consolidar (el acta de evidencia decide si «ejecutado»);
 *   2. causa externa/entorno → rendirse CON RECETA, nunca curar;
 *   3. contrato → herramienta determinista antes que modelo;
 *   4. error que no se puede leer todavía → re-ejecutar la suite (la salida
 *      agregada lo truncó);
 *   5. estancado (dos huellas iguales) → rendirse: reintentar no añade datos;
 *   6. presupuesto agotado → rendirse nombrando el costo;
 *   7. recién then → curar con el extracto que cabe en la ventana.
 */
export function planDeAutoCuracion(e: EntradaPlan): AccionOuroboros {
  const v = e.veredicto;
  if (v.verde) return { tipo: "consolidar" };
  const c = clasificarFallo(v, e.salida);
  if (c.causa === "entorno" || c.causa === "externo") {
    return { tipo: "rendirse", causa: c.causa, motivo: c.detalle, receta: c.receta };
  }
  if (c.causa === "contrato") return { tipo: "regenerar-contrato", receta: c.receta || "node scripts/superficie.mjs" };
  if (c.accion === "re-ejecutar-suite") {
    const cmd = comandoDeRelectura(e.salida) || (e.archivoFallo ? comandoDeSuite(e.archivoFallo) : null);
    if (cmd) return { tipo: "re-ejecutar-suite", comando: cmd, razon: "la salida agregada truncó el error: hay que leerlo entero antes de realimentar" };
  }
  if (estancado(e.historial)) {
    return { tipo: "rendirse", causa: c.causa, motivo: "el segundo intento produjo exactamente el mismo error: la corrección no está encontrando la causa raíz", receta: "Inspección humana. Reintentar gasta CPU sin información nueva." };
  }
  const restantes = e.presupuesto.intentos - e.historial.length;
  if (restantes <= 0) {
    return { tipo: "rendirse", causa: c.causa, motivo: `presupuesto agotado (${e.presupuesto.motivo})`, receta: c.receta };
  }
  const ex = extractoParaElModelo(e.salida, e.charsDisponibles ?? 4000);
  const prompt =
    `[AUTO-CURACIÓN · intento ${e.historial.length + 1}/${e.presupuesto.intentos} · causa: ${c.causa}]\n` +
    `El validador devolvió código ${v.codigo}: ${c.detalle}.\n` +
    (ex.recortado ? `(El informe medía ${ex.charsOmitidos + ex.texto.length} caracteres; por presupuesto de ventana se conservan ${ex.lineasConservadas} líneas.)\n` : "") +
    "```\n" + ex.texto + "\n```\n" +
    "Corregí la CAUSA RAÍZ en el fuente. No borres ni edites pruebas para que den verde; " +
    "no toques el literal del trinquete de server.ts; si el problema es del entorno, decilo y pará.";
  return { tipo: "curar", prompt, intentosRestantes: restantes };
}
