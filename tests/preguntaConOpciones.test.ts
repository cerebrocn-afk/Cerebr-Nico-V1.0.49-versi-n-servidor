/**
 * preguntaConOpciones.test.ts — EL AGENTE PREGUNTA CON OPCIONES EN VEZ DE SUPONER (v1.0.14)
 * =========================================================================================
 * Verifica en seco el contrato del cuestionario:
 *   · parsearOpciones extrae pregunta + opciones del formato del modelo;
 *   · es tolerante a variantes (minúsculas, acentos, "opción 1:", "opc1:", "1-");
 *   · esPreguntaDeOpciones distingue una consulta legítima de una parada vacía;
 *   · se acota a MAX_OPCIONES y rechaza entradas sin pregunta u opciones.
 */
import { parsearOpciones, esPreguntaDeOpciones, DIRECTIVA_OPCIONES, directivaDeOpciones } from "../src/engine/preguntaConOpciones";

let ok = 0, falla = 0;
const c = (n: string, cond: boolean, d = "") => { if (cond) ok++; else { falla++; console.log("  FALLO " + n + (d ? " :: " + d : "")); } };

console.log("== preguntaConOpciones (v1.0.14) ==\n");

// 1 · la directiva existe y ordena preguntar
const d = DIRECTIVA_OPCIONES.toLowerCase();
c("la directiva existe y menciona el formato", DIRECTIVA_OPCIONES.includes("PREGUNTA:") && DIRECTIVA_OPCIONES.includes("OPCIÓN 1:"));
c("la directiva prohíbe suponer", d.includes("no debes") && d.includes("no actúes hasta"));
c("directivaDeOpciones reusa el contrato", directivaDeOpciones(4) === DIRECTIVA_OPCIONES.replace(String(6), String(4)));

// 2 · parsearOpciones con el formato canónico
const p1 = parsearOpciones("PREGUNTA: ¿qué tarea hago primero?\nOPCIÓN 1: terminar el carrito\nOPCIÓN 2: revisar los zapatos\nOPCIÓN 3: nada más por ahora");
c("parsea pregunta", p1 !== null && p1.pregunta.includes("qué tarea"));
c("parsea las 3 opciones", p1 !== null && p1.opciones.length === 3 && p1.opciones[0].includes("carrito"));
c("mantiene el orden", p1 !== null && p1.opciones[1].includes("zapatos") && p1.opciones[2].includes("nada más"));

// 3 · tolerancia a variantes
c("mayúsculas/minúsculas mezcladas", parsearOpciones("pregunta: algo\nopcion 1: a\nopcion 2: b")?.opciones.length === 2);
c("sin signos de dos puntos (espacio)", parsearOpciones("PREGUNTA: algo\nOPCIÓN 1 a\nOPCIÓN 2 b")?.opciones.length === 2);
c("variante 'opc1:'", parsearOpciones("PREGUNTA: algo\nopc1: x\nopc2: y")?.opciones.length === 2);
c("variante numérica '1-'", parsearOpciones("PREGUNTA: algo\n1- a\n2- b")?.opciones.length === 2);

// 4 · esPreguntaDeOpciones: diálogo legítimo vs parada
c("reconoce una pregunta con opciones", esPreguntaDeOpciones("PREGUNTA: ¿cuál?\nOPCIÓN 1: a\nOPCIÓN 2: b") === true);
c("NO es pregunta-con-opciones un '¿querés que siga?' suelto", esPreguntaDeOpciones("¿querés que continúe con los tests?") === false);
c("NO es pregunta-con-opciones el texto vacío", esPreguntaDeOpciones("") === false);
c("NO es pregunta-con-opciones una entrega normal", esPreguntaDeOpciones("Listo: el módulo quedó creado y las pruebas pasan.") === false);

// 5 · acotación y rechazo
const muchas = "PREGUNTA: p\nOPCIÓN 1: a\nOPCIÓN 2: b\nOPCIÓN 3: c\nOPCIÓN 4: d\nOPCIÓN 5: e\nOPCIÓN 6: f\nOPCIÓN 7: g";
c("se acota a MAX_OPCIONES (6)", parsearOpciones(muchas) !== null && parsearOpciones(muchas)!.opciones.length === 6);
c("sin pregunta → null", parsearOpciones("OPCIÓN 1: a") === null);
c("sin opciones → null", parsearOpciones("PREGUNTA: p") === null);
c("entrada vacía → null", parsearOpciones("") === null);

console.log(`\n═══ PREGUNTA CON OPCIONES: ${ok} correctas · ${falla} fallidas ═══`);
process.exit(falla ? 1 : 0);