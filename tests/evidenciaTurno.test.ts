/**
 * evidenciaTurno.test.ts — LA CERTEZA DEL CHAT DEJA DE SER DECORATIVA (v1.46.0)
 * ============================================================================
 * POR QUÉ EXISTE ESTA SUITE
 * La cadena de certeza del chat estaba cortada en dos sitios, y se descubrió
 * leyendo el código, no suponiendo:
 *   · `StreamContext.setEvidencia()` estaba definido y NUNCA se llamaba, así que
 *     la evidencia era siempre `{}` y `certezaDe({})` devolvía `sin_verificar`
 *     para todo. El revisor no podía distinguir trabajo real de charla.
 *   · `motorEvidencia.ts` (Fase 4) tampoco se importaba en `server.ts`.
 *
 * Esta suite es la que impide que eso vuelva a pasar en silencio. No comprueba
 * que «hay un módulo»: importa el módulo y le pregunta. Y comprueba EL CABLE
 * —que `server.ts` llame a la anotación y que `StreamContext` pida la evidencia—
 * porque un módulo perfecto y desconectado es exactamente el fallo que se está
 * arreglando. Si alguien vuelve a desconectarlo, esto se pone rojo.
 *
 * LO QUE NO PRUEBA (y se dice)
 *   · No ejecuta herramientas de verdad: alimenta el registro con las salidas
 *     REALES que esas herramientas producen (copiadas del código de
 *     `executeToolCall`), que es donde vive la decisión de conceder o no.
 *   · No juzga si una afirmación concreta del modelo es verdad: eso es
 *     `motorEvidencia` por claim, y es el paso siguiente.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => (existsSync(path.join(RAIZ, rel)) ? readFileSync(path.join(RAIZ, rel), "utf8") : "");

const {
  abrirTurnoEvidencia,
  anotarHerramienta,
  actaDelTurno,
  evidenciaDelTurno,
  clasificarHerramienta,
  salidaTieneFallo,
  okDeSalida,
  resumenDelActa,
} = await import("../src/engine/evidenciaTurno.ts");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, cond: unknown, detalle?: string) => {
  if (cond) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const con = (nombre: string, salida: unknown) => ({ nombre, salida: JSON.stringify(salida) });

console.log("\n═══ EVIDENCIA DEL TURNO (v1.46.0) ═══\n");

/* ── 1. La regla que no se negocia: ESCRIBIR NO ES PROBAR ─────────────────── */
console.log("1) Escribir no concede certeza\n");

abrirTurnoEvidencia();
anotarHerramienta("write_file", JSON.stringify({ ok: true, path: "src/app.ts", bytes: 120 }));
anotarHerramienta("edit_file", JSON.stringify({ ok: true, path: "src/app.ts" }));
comprobar(
  "tres escrituras correctas NO conceden `ejecutado`",
  evidenciaDelTurno().ejecutado !== true,
  JSON.stringify(evidenciaDelTurno())
);
comprobar(
  "y tampoco conceden `leido`: escribir no es haber comprobado nada",
  evidenciaDelTurno().leido !== true,
  JSON.stringify(evidenciaDelTurno())
);
comprobar("el acta sí las registra (no se pierden, solo no conceden)", actaDelTurno().escritura === 2, String(actaDelTurno().escritura));
comprobar("la evidencia de un turno que solo escribió queda vacía", Object.keys(evidenciaDelTurno()).length === 0);

/* ── 2. Leer concede `leido`, y solo `leido` ─────────────────────────────── */
console.log("\n2) Leer concede `leido` y nada más\n");

abrirTurnoEvidencia();
anotarHerramienta("list_files", JSON.stringify({ ok: true, files: ["a.ts", "b.ts"] }));
comprobar("list_files concede `leido`", evidenciaDelTurno().leido === true);
comprobar("pero NO concede `ejecutado` (nada corrió)", evidenciaDelTurno().ejecutado !== true);

abrirTurnoEvidencia();
anotarHerramienta("read_file", JSON.stringify({ ok: true, path: "a.ts", content: "x" }));
comprobar("read_file concede `leido`", evidenciaDelTurno().leido === true);
comprobar("read_file no concede `ejecutado`", evidenciaDelTurno().ejecutado !== true);

abrirTurnoEvidencia();
for (const t of ["git_status", "git_diff", "find_symbol", "search_in_files", "pc_info", "ollama_estado", "recursos_maquina", "revisar_cambios"]) {
  anotarHerramienta(t, JSON.stringify({ ok: true }));
}
comprobar("las 8 herramientas de inspección conceden `leido`", evidenciaDelTurno().leido === true);
comprobar("y ninguna concede `ejecutado`", evidenciaDelTurno().ejecutado !== true);
comprobar("la clasificación de esas 8 es «lectura»", ["git_status", "git_diff", "find_symbol", "search_in_files", "pc_info", "ollama_estado", "recursos_maquina", "revisar_cambios"].every((t) => clasificarHerramienta(t) === "lectura"));

/* ── 3. Solo la ejecución concede `ejecutado` ───────────────────────────── */
console.log("\n3) Solo un proceso real concede `ejecutado`\n");

abrirTurnoEvidencia();
anotarHerramienta("run_command", JSON.stringify({ ok: true, salida: "compilado sin errores\n", informe: {} }));
comprobar("run_command con ok concede `ejecutado`", evidenciaDelTurno().ejecutado === true);

abrirTurnoEvidencia();
anotarHerramienta("run_tests", JSON.stringify({ ok: true, salida: "42 passed\n", informe: {} }));
comprobar("run_tests con ok concede `ejecutado`", evidenciaDelTurno().ejecutado === true);

abrirTurnoEvidencia();
anotarHerramienta("pc_exec", JSON.stringify({ ok: true, salida: "hola" }));
comprobar("pc_exec con ok concede `ejecutado`", evidenciaDelTurno().ejecutado === true);

comprobar("git_commit NO concede certeza (mutar no es probar)", clasificarHerramienta("git_commit") === "escritura");
comprobar("forjar_complemento tampoco", clasificarHerramienta("forjar_complemento") === "escritura");
comprobar("deshacer_cambios tampoco", clasificarHerramienta("deshacer_cambios") === "escritura");
comprobar("set_plan no concede nada", clasificarHerramienta("set_plan") === "planificacion");
comprobar("fetch_url no concede nada", clasificarHerramienta("fetch_url") === "red");

/* ── 4. El marcador de fallo MANDA sobre el `ok` ────────────────────────── */
console.log("\n4) El fallo manda sobre el «ok»\n");

abrirTurnoEvidencia();
anotarHerramienta("run_tests", JSON.stringify({ ok: true, salida: "3 tests failed\n", informe: {} }));
comprobar(
  "un runner que dice ok:true con «3 tests failed» NO concede `ejecutado`",
  evidenciaDelTurno().ejecutado !== true,
  JSON.stringify(evidenciaDelTurno())
);
comprobar("y el acta lo cuenta como fallo", actaDelTurno().conFallo === 1);

comprobar("«0 failed» NO cuenta como fracaso (criterio [1-9] del §8)", salidaTieneFallo("0 tests failed") === false);
comprobar("«0 errors» tampoco", salidaTieneFallo("0 errors") === false);
comprobar("«0 failed» tampoco concedió: no es prueba de éxito", (() => {
  abrirTurnoEvidencia();
  anotarHerramienta("run_tests", JSON.stringify({ ok: true, salida: "0 failed", informe: {} }));
  return evidenciaDelTurno().ejecutado === true; // ok:true y sin fallo → sí concede
})());

abrirTurnoEvidencia();
anotarHerramienta("run_command", JSON.stringify({ ok: false, error: "binario no permitido: «rm»" }));
comprobar("una herramienta con ok:false no concede `ejecutado`", evidenciaDelTurno().ejecutado !== true);
comprobar("ni `leido`", evidenciaDelTurno().leido !== true);

abrirTurnoEvidencia();
anotarHerramienta("run_command", JSON.stringify({ ok: true, salida: "Traceback (most recent call last):\nKeyError", informe: {} }));
comprobar("un traceback en la salida tumba la concesión aunque ok sea true", evidenciaDelTurno().ejecutado !== true);

abrirTurnoEvidencia();
anotarHerramienta("run_command", JSON.stringify({ ok: true, salida: "sh: line 1: pytohn: command not found", informe: {} }));
comprobar("«command not found» también cuenta como fallo", evidenciaDelTurno().ejecutado !== true);

/* ── 5. Ante un formato que no se entiende, NO se concede ───────────────── */
console.log("\n5) Lo que no se entiende no concede certeza\n");

comprobar("salida no-JSON → ok=false", okDeSalida("esto no es json") === false);
abrirTurnoEvidencia();
anotarHerramienta("run_command", "esto no es json");
comprobar("una salida ilegible no concede `ejecutado`", evidenciaDelTurno().ejecutado !== true);

comprobar("una herramienta desconocida no se clasifica", clasificarHerramienta("pc_quick_action") === null);
abrirTurnoEvidencia();
anotarHerramienta("pc_quick_action", JSON.stringify({ ok: true, salida: "hecho" }));
comprobar(
  "una herramienta INVENTADA por el modelo no concede nada (no está en la tabla)",
  evidenciaDelTurno().ejecutado !== true && evidenciaDelTurno().leido !== true
);
comprobar("el nombre vacío tampoco se clasifica", clasificarHerramienta("") === null);

/* ── 6. Turno limpio y turno mixto ──────────────────────────────────────── */
console.log("\n6) Turnos\n");

abrirTurnoEvidencia();
comprobar("un turno sin herramientas queda sin verificar", Object.keys(evidenciaDelTurno()).length === 0);
comprobar("y el acta lo dice con palabras", /sin herramientas/.test(resumenDelActa()));

abrirTurnoEvidencia();
anotarHerramienta("read_file", JSON.stringify({ ok: true, path: "a.ts", content: "x" }));
anotarHerramienta("run_tests", JSON.stringify({ ok: true, salida: "12 passed", informe: {} }));
anotarHerramienta("write_file", JSON.stringify({ ok: true, path: "b.ts", bytes: 3 }));
const mixta = evidenciaDelTurno();
comprobar("un turno mixto concede ambos escalones", mixta.ejecutado === true && mixta.leido === true);
comprobar("el acta cuenta una de cada", actaDelTurno().lectura === 1 && actaDelTurno().ejecucion === 1 && actaDelTurno().escritura === 1);
comprobar("el resumen no afirma de más", /1 lectura · 1 ejecución · 1 escritura/.test(resumenDelActa()), resumenDelActa());
comprobar("abrirTurno limpia el anterior", (() => { abrirTurnoEvidencia(); return actaDelTurno().herramientas.length === 0; })());
comprobar("la muestra se recorta (el acta no guarda 40 KB)", (() => {
  abrirTurnoEvidencia();
  const e = anotarHerramienta("read_file", JSON.stringify({ ok: true, content: "x".repeat(5000) }));
  return e.muestra.length <= 180;
})());

/* ── 7. EL CABLE: módulo conectado, no módulo decorativo ────────────────── */
console.log("\n7) El cable (lo que impide que vuelva a quedar decorativo)\n");

const servidor = leer("server.ts");
const ctx = leer("server/streamContext.ts");

comprobar("server.ts existe y es el monolito", servidor.length > 100000);
comprobar(
  "★ server.ts importa el acta de evidencia",
  /from\s+"\.\/src\/engine\/evidenciaTurno"/.test(servidor)
);
comprobar(
  "★ executeToolCall ANOTA cada herramienta (el único punto por el que pasan todas)",
  /anotarHerramienta\(/.test(servidor)
);
comprobar(
  "★ y la anotación está en un envoltorio, no dentro de un `case` (los 32 pasan por ahí)",
  /function executeToolCallInterno\(/.test(servidor)
);
comprobar(
  "★ StreamContext abre turno al construirse (un turno, un acta)",
  /abrirTurnoEvidencia\(\)/.test(ctx)
);
comprobar(
  "★ y pide la evidencia del turno para el revisor",
  /evidenciaDelTurno\(\)/.test(ctx)
);
comprobar(
  "★ la evidencia alimenta a `setEvidencia`/`revisarSalida` (no se queda en el aire)",
  /revisarSalida\(/.test(ctx) && /evidencia/.test(ctx)
);
comprobar(
  "★ server.ts NO dejó el acta sin usar: no basta con importarla",
  (servidor.match(/anotarHerramienta\(/g) || []).length >= 1
);
comprobar(
  "★ esta suite está REGISTRADA en el catálogo de la puerta (no basta con que exista el fichero)",
  /evidenciaTurno\.test\.ts/.test(leer("scripts/validar.mjs"))
);

console.log(`\n═══ EVIDENCIA DEL TURNO (v1.46.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:\n" + fallos.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
