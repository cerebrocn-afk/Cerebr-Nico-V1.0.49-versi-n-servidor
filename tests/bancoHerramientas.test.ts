/**
 * tests/bancoHerramientas.test.ts — v1.0.31 · EL BANCO, Y SU ARITMÉTICA
 * ===================================================================
 * Un banco mal calculado es peor que no tener banco: da un número y ese número se
 * usa para decidir. Esta suite no mide modelos (no hay red ni claves aquí): mide
 * que la CUENTA sea la correcta, con turnos sintéticos donde el resultado se puede
 * contar a mano.
 *
 * LOS TRES ERRORES DE CUENTA QUE SE PRUEBAN, porque son los que se cometen:
 *   1. Contar el caso imposible como fallo del modelo (la herramienta no estaba en
 *      el turno) y hundir el número con casos que nadie podía acertar.
 *   2. No contar las llamadas emitidas en TEXTO: un 7B sin function-calling sale
 *      con «no eligió ninguna» aunque haya escrito la llamada.
 *   3. Contar el timeout como elección equivocada.
 *
 * `npx tsx tests/bancoHerramientas.test.ts`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluarBanco,
  informeBanco,
  validarCasos,
  parsearLlamadasDeTexto,
  type CasoBanco,
  type TurnoMedido,
} from "../src/engine/bancoHerramientas";
import { registerBuiltinPacks, getAllToolNames } from "../src/engine/toolRegistry";
import { registrarPackDocumentos } from "../src/engine/packDocumentos";
import { registrarPackTerminal } from "../src/engine/packTerminal";

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function check(desc: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(desc); console.log(`  \u2717 ${desc}`); }
}

registerBuiltinPacks();
registrarPackDocumentos();
registrarPackTerminal();
const REGISTRO = getAllToolNames();

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(AQUI, "fixtures", "banco-herramientas.json");
const banco = JSON.parse(fs.readFileSync(FIXTURE, "utf-8")) as { version: number; casos: CasoBanco[] };

console.log("\n1. EL BANCO · 47 casos reales contra el registro real");
// ════════════════════════════════════════════════════════════════════════
{
  check(`el banco trae ${banco.casos.length} casos`, banco.casos.length >= 40);
  const problemas = validarCasos(banco.casos, REGISTRO);
  check("valida sin problemas contra el registro", problemas.length === 0);
  if (problemas.length) for (const p of problemas) console.log(`      · ${p}`);
  check("todas las esperadas existen de verdad en el registro", banco.casos.every((c) => REGISTRO.includes(c.esperada)));
  check("todas las aceptables existen", banco.casos.every((c) => (c.aceptables || []).every((a) => REGISTRO.includes(a))));
  check("cubre 12 categorías de trabajo", new Set(banco.casos.map((c) => c.categoria)).size === 12);
  check("hay casos para más de un perfil", new Set(banco.casos.map((c) => c.perfil)).size >= 2);
  check("ningún prompt está vacío ni repetido", banco.casos.every((c) => c.prompt.trim().length > 8) && new Set(banco.casos.map((c) => c.prompt)).size === banco.casos.length);

  // validarCasos tiene que MORDER, no solo aprobar
  check("un id repetido se detecta", validarCasos([{ ...banco.casos[0] }, { ...banco.casos[0] }], REGISTRO).some((p) => /repetido/.test(p)));
  check("una esperada inventada se detecta", validarCasos([{ ...banco.casos[0], esperada: "leer_archivo_magico" }], REGISTRO).some((p) => /no existe/.test(p)));
  check("un banco de 3 casos se rechaza (no distingue cambio de ruido)", validarCasos(banco.casos.slice(0, 3), REGISTRO).some((p) => /40/.test(p)));
}

console.log("\n2. LA CUENTA · acierto condicional, absoluto y los imposibles aparte");
// ════════════════════════════════════════════════════════════════════════
{
  const casos: CasoBanco[] = [
    { id: "a", categoria: "x", perfil: "p", prompt: "uno", esperada: "set_plan" },
    { id: "b", categoria: "x", perfil: "p", prompt: "dos", esperada: "read_file", aceptables: ["read_file_range"] },
    { id: "c", categoria: "y", perfil: "q", prompt: "tres", esperada: "write_file" },
    { id: "d", categoria: "y", perfil: "q", prompt: "cuatro", esperada: "run_tests" },
  ];
  const turnos: TurnoMedido[] = [
    { caso: "a", visibles: ["set_plan", "read_file"], llamadas: ["set_plan"], fuente: "nativo", tokensEntrada: 100, tokensSalida: 10, ttftMs: 400 },
    // b: no acierta la primera, pero read_file_range está entre las 3 primeras
    { caso: "b", visibles: ["read_file", "read_file_range"], llamadas: ["list_files", "read_file_range"], fuente: "texto", tokensEntrada: 200, tokensSalida: 20, ttftMs: 800 },
    // c: la esperada NO estaba en el turno → imposible
    { caso: "c", visibles: ["read_file"], llamadas: ["read_file"], fuente: "nativo", tokensEntrada: 50, tokensSalida: 5, ttftMs: 300 },
    // d: el turno no respondió
    { caso: "d", visibles: ["run_tests"], llamadas: [], sinRespuesta: true },
  ];
  const r = evaluarBanco(casos, turnos);
  check("cuenta 4 casos", r.totales.casos === 4);
  check("2 medidos y 1 sin respuesta (el imposible SÍ se mide: se mide su visibilidad)", r.totales.conTurno === 3 && r.totales.sinRespuesta === 1);
  check("separara 2 visibles y 1 invisible", r.totales.visibles === 2 && r.totales.invisibles === 1);
  check("el imposible NO cuenta como acierto ni como fallo condicional", r.totales.acierto1Condicional === 0.5);
  check("acierto@1 absoluto = 1 de 3 (incluye el imposible)", r.totales.acierto1 === 1 && r.totales.conTurno === 3);
  check("acierto@3 condicional = 1,0 (b entra por read_file_range)", r.totales.acierto3Condicional === 1);
  check("cuenta la llamada en TEXTO (el 7B no es «no eligió»)", r.totales.porTexto === 1);
  check("suma tokens reales", r.totales.tokensEntrada === 350 && r.totales.tokensSalida === 35);
  check("TTFT mediana de 300/400/800 = 400", r.totales.ttftMedianaMs === 400);
  check("agrupa por categoría", r.porCategoria.length === 2 && r.porCategoria.find((c) => c.categoria === "x")?.acierto1Condicional === 0.5);
  check("agrupa por perfil", r.porPerfil.length === 2 && r.porPerfil.find((p) => p.perfil === "q")?.visibles === 0);

  // Dos casos límite que se rompen solos si la cuenta se escribe a ojo:
  const vacio = evaluarBanco([], []);
  check("sin casos no divide por cero", vacio.totales.acierto1Condicional === 0 && vacio.totales.ttftMedianaMs === null);
  const sinTurnos = evaluarBanco(casos, []);
  check("sin turnos, los 4 son «sin turno» y no fallos", sinTurnos.totales.sinTurno === 4 && sinTurnos.totales.conTurno === 0);

  const informe = informeBanco(r, "sintético");
  check("el informe pone el CONDICIONAL primero", informe.indexOf("CONDICIONAL") < informe.indexOf("ABSOLUTO"));
  check("…y declara los imposibles al lado (no un 42 % huérfano)", /imposibles/.test(informe) && /1 imposibles/.test(informe));
  check("…y dice cuántas llamadas fueron por texto", /TEXTO/.test(informe));
}

console.log("\n3. LLAMADAS EN TEXTO · las cuatro formas que se vieron en sesiones reales");
// ════════════════════════════════════════════════════════════════════════
{
  const conocidas = ["write_file", "read_file", "run_command", "terminal_abrir"];
  const casosTexto: Array<[string, string]> = [
    ["bloque cerebronico", "Voy a crearlo.\n```cerebronico:write_file\n{\"path\":\"a.ts\"}\n```"],
    ["nombre + JSON", 'Entendido: write_file({"path": "a.ts", "content": "x"})'],
    ["etiqueta XML", '<tool_call>{"name":"read_file","arguments":{"path":"a.ts"}}</tool_call>'],
    ["objeto JSON suelto", '{"name": "run_command", "arguments": {"cmd": "npm test"}}'],
    ["función etiquetada", '<function=terminal_abrir>{"cwd":"src"}</function>'],
  ];
  for (const [nombre, texto] of casosTexto) {
    const r = parsearLlamadasDeTexto(texto, conocidas);
    check(`reconoce ${nombre}`, r.llamadas.length === 1 && conocidas.includes(r.llamadas[0]));
  }
  check("la prosa no es una llamada («voy a leer el archivo»)", parsearLlamadasDeTexto("Voy a leer el archivo y después te cuento.", conocidas).llamadas.length === 0);
  check("un nombre inventado se informa aparte, no como elección", (() => {
    const r = parsearLlamadasDeTexto('leer_archivo({"path":"a"})', conocidas);
    return r.llamadas.length === 0 && r.inventadas.includes("leer_archivo");
  })());
  check("la misma llamada repetida no se cuenta dos veces", (() => {
    const r = parsearLlamadasDeTexto('read_file({"path":"a"})\nread_file({"path":"b"})', conocidas);
    return r.llamadas.length === 1;
  })());
  check("un texto vacío no produce llamadas", parsearLlamadasDeTexto("", conocidas).llamadas.length === 0);
  check("sin lista de conocidas devuelve lo que encuentra (modo diagnóstico)",
    parsearLlamadasDeTexto('cualquiera({"x":1})').llamadas[0] === "cualquiera");
}

console.log("\n4. EL BANCO, CONTRA LA VISIBILIDAD REAL DE CADA PERFIL");
// ════════════════════════════════════════════════════════════════════════
{
  // Esto no mide modelos: mide el instrumento. Con el catálogo completo (46), todo
  // caso es posible; con el hueso de obra (11), la mayoría son imposibles — y el
  // banco tiene que DECIRLO en vez de repartir culpas.
  const todos: TurnoMedido[] = banco.casos.map((c) => ({ caso: c.id, visibles: REGISTRO, llamadas: [c.esperada], fuente: "nativo" }));
  const rTodos = evaluarBanco(banco.casos, todos);
  check("con el catálogo completo no hay imposibles", rTodos.totales.invisibles === 0);
  check("y el acierto condicional es 100 % (el instrumento no inventa fallos)", rTodos.totales.acierto1Condicional === 1);

  const hueso = ["set_plan", "update_task", "read_file", "edit_file", "run_command", "run_tests", "revisar_cambios", "deshacer_cambios", "list_files", "write_file", "search_in_files"];
  const soloHueso: TurnoMedido[] = banco.casos.map((c) => ({ caso: c.id, visibles: hueso, llamadas: [c.esperada], fuente: "nativo" }));
  const rHueso = evaluarBanco(banco.casos, soloHueso);
  check(`con el hueso (${hueso.length}) hay casos imposibles y se declaran (${rHueso.totales.invisibles})`, rHueso.totales.invisibles > 20);
  check("…y el condicional sigue siendo 100 %: el modelo no falló, faltaba el catálogo", rHueso.totales.acierto1Condicional === 1);
  check("…mientras el absoluto se hunde (es lo que se ve sin separar)", rHueso.totales.acierto1 < rHueso.totales.conTurno / 2);
  const informe = informeBanco(rHueso, "hueso");
  check("el informe nombra los imposibles con su número", new RegExp(`${rHueso.totales.invisibles} imposibles`).test(informe));
}

console.log(`\n—— bancoHerramientas: ${ok} correctas · ${mal} fallidas ——`);
if (mal) { console.log("\nFALLOS:"); for (const f of fallos) console.log(`  · ${f}`); }
process.exitCode = mal ? 1 : 0;
