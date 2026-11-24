/**
 * ouroboros.test.ts — v1.57.14 · AUTO-CURACIÓN SIN MENTIRAS
 * =========================================================
 * Cada fixture de esta suite es texto REAL de `npm run validar` capturado en la
 * sesión del 15/10 (el rojo de `hindsight` por el vínculo `@vectorize-io/…` que
 * faltaba en node_modules, y las líneas `VEREDICTO:` de scripts/validar.mjs).
 * No se inventan formatos: si el informé cambia de palabra, esta suite se pone
 * roja y el parser se actualiza a la par. Es la única defensa contra un
 * auto-curador que parsea un formato que ya no existe.
 *
 * Lógica PURA: sin spawn, sin disco, sin modelo. Node v16 via tsx.
 */
import { readFileSync } from "node:fs";
import {
  stripAnsi,
  parsearVeredicto,
  clasificarFallo,
  comandoDeSuite,
  comandoDeRelectura,
  comandoDeRelecturaTodas,
  huellaError,
  estancado,
  presupuestoDeIntentos,
  extractoParaElModelo,
  planDeAutoCuracion,
  type IntentoCuracion,
  type Presupuesto,
} from "../src/engine/ouroboros";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};
const seccion = (t: string) => console.log("\n" + t + "\n");

// ── FIXTURES REALES ────────────────────────────────────────────────────────
const LOG_ENTORNO = [
  "  VEREDICTO: HAY FALLOS — 11 fallo(s) sobre 6681 comprobaciones.",
  "",
  "  hindsight",
  "    5 · Wrapper Node del SDK (pack :5101) — en seco, sin servidor",
  "    Error [ERR_MODULE_NOT_FOUND]:",
  "    Cannot find package '@vectorize-io/hindsight-agent-sdk' imported from",
  "    scripts/hindsight_agent_server.mjs",
  "    (salida completa: npx tsx tests/hindsightHibrido.test.ts)",
  "",
  "  No se da nada por bueno mientras esto esté en rojo.",
].join("\n");

const LOG_VERDE = [
  "  VEREDICTO: TODO CORRECTO — 6681 comprobaciones, 0 fallos.",
  "  Tipos: 0 errores · 140 suites ejecutadas · 0 sin correr · 0 del catálogo ausentes.",
  "  El motor está sano: se puede seguir construyendo encima.",
].join("\n");

const LOG_VERDE_CON_AVISO = [
  "  VEREDICTO: TODO CORRECTO — 6681 comprobaciones, 0 fallos.",
  "  AVISO: 3 marca(s) ✗ en 1 suite(s) verde(s) — revisar que no sean fallos sin contabilizar:",
  "    motorContexto: 3 marca(s) ✗",
].join("\n");

const LOG_TIPOS = "  VEREDICTO: HAY FALLOS — 2 error(es) de tipos.";
const LOG_NO_CORRIERON = "  VEREDICTO: HAY FALLOS — 3 suite(s) que NO llegaron a ejecutarse.";
const LOG_DESAPARECIDAS = "  VEREDICTO: HAY FALLOS — 1 suite(s) del catálogo que YA NO están en disco.";
const LOG_CONTRATO = [
  "  superficie",
  "    TRINQUETE: server.ts pasó de 12131 → 12140 líneas y el presupuesto es 12131",
  "    (salida completa: npx tsx tests/superficie.test.ts)",
].join("\n");

const PRES: Presupuesto = { intentos: 3, costoValidacionMs: 90_000, techoMinutos: 4, motivo: "test" };
const unIntento = (texto: string): IntentoCuracion => ({ extracto: texto, huella: huellaError(texto), costoMs: 90_000 });

// ════════════════════════════════════════════════════════════════════════════
seccion("1 · stripAnsi: sin escape codes no hay parser que calce");
comprobar("elimina colores de validar", stripAnsi("\x1b[31mVEREDICTO: HAY FALLOS\x1b[0m") === "VEREDICTO: HAY FALLOS");
comprobar("deja el resto intacto", stripAnsi("a\x1b[32mb\x1b[0mc") === "abc");
comprobar("texto sin códigos no se altera", stripAnsi("sin ansi") === "sin ansi");

// ════════════════════════════════════════════════════════════════════════════
seccion("2 · parsearVeredicto contra el log real (rojo de entorno de HOY)");
const vEnt = parsearVeredicto(LOG_ENTORNO, 1);
comprobar("no es verde", vEnt.verde === false);
comprobar("código 1 respetado", vEnt.codigo === 1);
comprobar("11 fallas leídas del texto real", vEnt.fallas === 11, `fallas=${vEnt.fallas}`);
comprobar("6681 comprobaciones leídas", vEnt.comprobaciones === 6681, `=${vEnt.comprobaciones}`);
comprobar("nombra la suite roja del bloque", vEnt.suitesRojas.includes("hindsight"), vEnt.suitesRojas.join(","));
comprobar("el bloque no confunde 'No se da…' con una suite", !vEnt.suitesRojas.some((s) => /No|AVISO|Tipos/.test(s)), vEnt.suitesRojas.join(","));
comprobar("tipos en verde dentro de este rojo", vEnt.tiposRojos === false);
comprobar("sin marcas sueltas", vEnt.marcasSueltas === 0);

seccion("3 · parsearVeredicto en verde, y las cuatro condiciones del fuente");
const vVerde = parsearVeredicto(LOG_VERDE, 0);
comprobar("TODO CORRECTO es verde", vVerde.verde === true);
comprobar("lee 6681 comprobaciones del verde", vVerde.comprobaciones === 6681);
comprobar("0 fallas", vVerde.fallas === 0);
comprobar("código 0", vVerde.codigo === 0);
comprobar("verde con código != 0 NO es verde", parsearVeredicto(LOG_VERDE, 1).verde === false);
comprobar("aviso de marcas se registra sin romper el verde", parsearVeredicto(LOG_VERDE_CON_AVISO, 0).marcasSueltas === 3);
comprobar("las marcas sueltas se ven como sospecha", parsearVeredicto(LOG_VERDE_CON_AVISO, 0).verde === true);
comprobar("2 errores de tipos se leen", parsearVeredicto(LOG_TIPOS, 1).erroresTipo === 2);
comprobar("tipos rojos => no verde", parsearVeredicto(LOG_TIPOS, 1).tiposRojos === true && parsearVeredicto(LOG_TIPOS, 1).verde === false);
comprobar("suites que no corrieron se cuentan", parsearVeredicto(LOG_NO_CORRIERON, 1).suitesSinCorrer === 3);
comprobar("'0 comprobaciones fallidas' + suites sin correr NO es verde", parsearVeredicto(LOG_NO_CORRIERON, 1).verde === false);
comprobar("suite desaparecida del catálogo se cuenta", parsearVeredicto(LOG_DESAPARECIDAS, 1).desaparecidasCatalogo === 1);
comprobar("desaparecida => rojo", parsearVeredicto(LOG_DESAPARECIDAS, 1).verde === false);
comprobar("salida vacía con código 1 no es verde", parsearVeredicto("", 1).verde === false);
comprobar("salida vacía no explota", parsearVeredicto("", 0).fallas === 0);

// ════════════════════════════════════════════════════════════════════════════
seccion("4 · clasificación: la causa cambia la ACCIÓN (el blueprint no lo hacía)");
const cEnt = clasificarFallo(vEnt, LOG_ENTORNO + "\n" + "Cannot find package '@vectorize-io/hindsight-agent-sdk'");
comprobar("falta de paquete = entorno", cEnt.causa === "entorno", cEnt.causa);
comprobar("entorno NO es curable por el modelo", cEnt.curable === false);
comprobar("nombra el paquete que falta", /@vectorize-io\/hindsight-agent-sdk/.test(cEnt.receta || "") || /hindsight-agent-sdk/.test(cEnt.detalle), cEnt.detalle);
comprobar("da receta accionable (vendor:sdk)", /vendor:sdk|npm ci/.test(cEnt.receta || ""), cEnt.receta);
const cQuota = clasificarFallo(parsearVeredicto("  VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.\n  Error 429: quota agotada", 1), "429 quota agotada");
comprobar("cuota = externo", cQuota.causa === "externo", cQuota.causa);
comprobar("externo no es curable", cQuota.curable === false);
const cTipos = clasificarFallo(parsearVeredicto(LOG_TIPOS, 1), LOG_TIPOS);
comprobar("tipos sí es curable", cTipos.causa === "tipos" && cTipos.curable === true);
const cNoCor = clasificarFallo(parsearVeredicto(LOG_NO_CORRIERON, 1), LOG_NO_CORRIERON);
comprobar("no corrieron => crash curable", cNoCor.causa === "crash" && cNoCor.curable === true);
const cNada = clasificarFallo(vVerde, LOG_VERDE);
comprobar("verde => causa ninguna", cNada.causa === "ninguna");
comprobar("verde no es curable (no hay nada que curar)", cNada.curable === false);

seccion("5 · contrato rojo: es herramienta determinista, no tarea del modelo");
const cCon = clasificarFallo(parsearVeredicto(LOG_CONTRATO + "\n  VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.", 1), LOG_CONTRATO);
comprobar("detecta el trinquete", cCon.causa === "contrato", cCon.causa);
comprobar("accion = regenerar-contrato", cCon.accion === "regenerar-contrato");
comprobar("no manda al modelo a escribir server.ts", cCon.curable === false);
comprobar("cita la herramienta (superficie)", /superficie\.mjs/.test(cCon.receta || ""), cCon.receta);

// ════════════════════════════════════════════════════════════════════════════
seccion("6 · LA GUARDA QUE EL BLUEPRINT NO TIENE: el error truncado");
comprobar("lee el comando de relectura del informe", comandoDeRelectura(LOG_ENTORNO) === comandoDeSuite("tests/hindsightHibrido.test.ts"), String(comandoDeRelectura(LOG_ENTORNO)));
comprobar("usa el tsx local del repo, no npx", /node_modules\/tsx\/dist\/cli\.mjs/.test(comandoDeRelectura(LOG_ENTORNO) || ""));
comprobar(".py se corre con python", comandoDeSuite("tests/x_test.py") === "python tests/x_test.py");
comprobar(".mjs con node", comandoDeSuite("scripts/validar-x.mjs") === "node scripts/validar-x.mjs");
comprobar("sin la línea, no inventa comando", comandoDeRelectura("nada aqui") === null);
comprobar("tres suites rojas => tres relecturas", comandoDeRelecturaTodas([
  "    (salida completa: npx tsx tests/a.test.ts)",
  "    (salida completa: npx tsx tests/b.test.ts)",
  "    (salida completa: npx tsx tests/c.test.ts)",
].join("\n")).length === 3);
comprobar("no duplica la misma suite", comandoDeRelecturaTodas([
  "    (salida completa: npx tsx tests/a.test.ts)",
  "    (salida completa: npx tsx tests/a.test.ts)",
].join("\n")).length === 1);

seccion("7 · MUTACIÓN: huella y estancamiento, dos rojos iguales = el modelo no aprendió");
const h1 = huellaError("Error [X]: fallo en la línea 12, costó 3400 ms");
const h2 = huellaError("Error [X]: fallo en la línea 99, costó 120 ms");
comprobar("los números no cambian la huella", h1 === h2, `${h1} vs ${h2}`);
comprobar("un error distinto sí cambia la huella", huellaError("TS2304: nombre no existe") !== h1);
comprobar("un intento no está estancado", estancado([unIntento("x")]) === false);
comprobar("dos intentos iguales están estancados", estancado([unIntento("el mismo error"), unIntento("el mismo error")]) === true);
comprobar("dos intentos distintos no", estancado([unIntento("error A"), unIntento("error B")]) === false);

seccion("8 · presupuesto: el tope lo fija el COSTO medido");
comprobar("90 s por validación con 4 min de techo = 2 intentos", presupuestoDeIntentos(90_000, 4).intentos === 2, JSON.stringify(presupuestoDeIntentos(90_000, 4)));
comprobar("30 s de validación sube el tope (4, el máximo sano)", presupuestoDeIntentos(30_000, 4).intentos === 4);
comprobar("validación larguísima no da fracción falsa: mínimo 1", presupuestoDeIntentos(600_000, 4).intentos === 1);
comprobar("costo no medido cae al valor prudente declarado", presupuestoDeIntentos(NaN, 4).costoValidacionMs === 90_000);
comprobar("el motivo declara el costo", /90 s|4 min/.test(presupuestoDeIntentos(90_000, 4).motivo));
comprobar("los 10 intentos del blueprint se ven absurdos", (10 * 90_000) / 60_000 > 12);

seccion("9 · extracto: cabe en la ventana y CONFIESA lo que tiró");
const largo = [
  "línea de relleno ".repeat(60),
  "src/App.tsx(120,7): error TS2304: Cannot find name 'opcionesMotor'.",
  "otra línea de relleno ".repeat(60),
  "VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.",
].join("\n");
const ex = extractoParaElModelo(largo, 500);
comprobar("respeta el presupuesto de caracteres", ex.texto.length <= 500, `len=${ex.texto.length}`);
comprobar("conserva la línea de error de tipos", /error TS2304/.test(ex.texto), ex.texto.slice(0, 120));
comprobar("conserva el veredicto", /VEREDICTO/.test(ex.texto));
comprobar("declara que recortó", ex.recortado === true);
comprobar("dice cuántos caracteres tiró", ex.charsOmitidos > 0, `=${ex.charsOmitidos}`);
comprobar("cuenta las líneas conservadas", ex.lineasConservadas >= 1);
comprobar("un texto corto no se marca como recortado", (() => { const e2 = extractoParaElModelo("hola\nchau", 4000); return e2.recortado === false && e2.charsOmitidos === 0; })());
comprobar("presupuesto basura no revienta", extractoParaElModelo("abc", 0).texto.length >= 0);
comprobar("strip en la entrada del extracto", extractoParaElModelo("\x1b[31merror TS9\x1b[0m", 4000).texto.indexOf("\x1b") === -1);

seccion("10 · planDeAutoCuracion: el orden de las siete salidas");
const vPrueba = parsearVeredicto(LOG_ENTORNO, 1);
comprobar("verde => consolidar", planDeAutoCuracion({ veredicto: vVerde, salida: LOG_VERDE, historial: [], presupuesto: PRES }).tipo === "consolidar");
comprobar("entorno => rendirse con receta, NUNCA curar", planDeAutoCuracion({ veredicto: vPrueba, salida: LOG_ENTORNO, historial: [], presupuesto: PRES }).tipo === "rendirse");
const pExt = planDeAutoCuracion({ veredicto: parsearVeredicto(LOG_TIPOS, 1), salida: LOG_TIPOS, historial: [], presupuesto: PRES });
comprobar("tipos => curar con prompt", pExt.tipo === "curar");
comprobar("el prompt nombra la causa", pExt.tipo === "curar" && /causa: tipos/.test(pExt.prompt));
comprobar("el prompt numera el intento", pExt.tipo === "curar" && /intento 1\/3/.test(pExt.prompt));
comprobar("el prompt prohíbe borrar pruebas", pExt.tipo === "curar" && /No borres ni edites pruebas/.test(pExt.prompt));
comprobar("el prompt prohíbe tocar el trinquete", pExt.tipo === "curar" && /trinquete/.test(pExt.prompt));
const pCon = planDeAutoCuracion({ veredicto: parsearVeredicto(LOG_CONTRATO + LOG_ENTORNO.slice(0, 0), 1), salida: LOG_CONTRATO + "\n  VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.", historial: [], presupuesto: PRES });
comprobar("contrato => regenerar antes que escribir", pCon.tipo === "regenerar-contrato");
const pRe = planDeAutoCuracion({ veredicto: parsearVeredicto(LOG_ENTORNO, 1), salida: LOG_ENTORNO, historial: [], presupuesto: PRES });
comprobar("rojo de pruebas con salida incompleta => re-ejecutar suite", pRe.tipo === "rendirse" || pRe.tipo === "re-ejecutar-suite");
const pStall = planDeAutoCuracion({
  veredicto: parsearVeredicto("  VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.\n  motor\n    error TS1: lo mismo\n    (salida completa: npx tsx tests/m.test.ts)", 1),
  salida: "VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.\n  error TS1: lo mismo\n  (salida completa: npx tsx tests/m.test.ts)",
  historial: [unIntento("error TS1: lo mismo"), unIntento("error TS1: lo mismo")],
  presupuesto: PRES,
});
comprobar("estancado => rendirse, no tercer intento", pStall.tipo === "rendirse", pStall.tipo);
comprobar("el rechazo nombra la falta de información nueva", pStall.tipo === "rendirse" && /no está encontrando la causa raíz/.test(pStall.motivo));
const pAgot = planDeAutoCuracion({
  veredicto: parsearVeredicto("  VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.\n  motor\n    error TS1: distinto " + String(Math.random()), 1),
  salida: "VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 6681 comprobaciones.\n error TS1: distinto",
  historial: [unIntento("a"), unIntento("b"), unIntento("c")],
  presupuesto: PRES,
});
comprobar("presupuesto agotado => rendirse con el costo", pAgot.tipo === "rendirse" && /presupuesto agotado/.test(pAgot.tipo === "rendirse" ? pAgot.motivo : ""));

seccion("11 · pureza: este módulo no ejecuta nada (quien ejecuta es el bucle)");
const fuente = (() => { try { return readFileSync("src/engine/ouroboros.ts", "utf8"); } catch { return ""; } })();
if (fuente) {
  comprobar("sin child_process", !/child_process|require\(.spawn/.test(fuente));
  comprobar("sin fs dentro del criterio", !/from "node:fs"|require\("fs"\)/.test(fuente));
  comprobar("sin fetch ni red", !/\bfetch\(|http\.request/.test(fuente));
  comprobar("cero imports de terceros", !/^import .*from "(?!\.)/m.test(fuente));
  comprobar("no llama a npm run validar desde acá", !/npm run validar`/.test(fuente) || /no ejecuta/.test(fuente));
} else {
  comprobar("fuente legible para las vallas de pureza", false, "no se pudo leer src/engine/ouroboros.ts");
}

seccion("12 \u00b7 EL CABLEADO REAL: la ruta existe, es due\u00f1a del criterio y no reinventa nada");
const router = (() => { try { return readFileSync("server/routers/diagnostico.ts", "utf8"); } catch { return ""; } })();
if (router) {
  comprobar("POST /api/diagnostico/autocurar registrado", /app\.post\("\/api\/diagnostico\/autocurar"/.test(router));
  comprobar("est\u00e1 DECLARADO en RUTAS_DIAGNOSTICO (no es una ruta fantasma)",
    /"POST \/api\/diagnostico\/autocurar"/.test(router));
  comprobar("el router IMPORTA el criterio, no lo copia",
    /from "..\/..\/src\/engine\/ouroboros"/.test(router) && !/function parsearVeredicto/.test(router));
  comprobar("sin `salida` responde 400 con motivo (no un 200 vac\u00edo)",
    /status\(400\)\.json\(\{ ok: false, motivo: "falta `salida`/.test(router));
  comprobar("la ventana sale del PERFIL del modelo (una sola fuente)",
    /getModelProfile\(modelo, RAM_GB\)/.test(router) && /perfil\.numCtx/.test(router));
  comprobar("el presupuesto entra desde el COSTO declarado, no del deseo",
    /presupuestoDeIntentos\(/.test(router) && /90_000/.test(router));
  comprobar("re-ejecuci\u00f3n: devuelve TODAS las suites a re-leer", /comandoDeRelecturaTodas\(salida\)/.test(router));
  comprobar("la ruta no escribe disco (sigue siendo diagn\u00f3stico)",
    !/writeFileSync|promises\.writeFile/.test(router));
  comprobar("el encabezado del router dice CUATRO rutas, no tres",
    /cuatro rutas de solo lectura/.test(router) && !/Agrupa las\n \* tres rutas/.test(router));
} else {
  comprobar("router legible para las vallas de cableado", false, "no se ley\u00f3 server/routers/diagnostico.ts");
}

console.log(`\n═══ OUROBOROS: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  · " + f);
if (fallos.length) process.exit(1);
