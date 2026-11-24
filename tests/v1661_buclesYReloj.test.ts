/**
 * v1661_buclesYReloj.test.ts — v1.66.1 · LOS CABLES QUE FALTABAN
 * ===============================================================
 * Dos frentes, sacados de las dos sesiones exportadas del 23/10:
 *
 * - 1792723545252 (Gemini/Z.ai/Mistral): cinco turnos seguidos de
 *   "(se agotó el presupuesto de pasos". Tarea de LEER y REPORTAR, cero
 *   escrituras. Ademas continuidadTurno y contextoBucle -los modulos que
 *   debian evitarlo- no los importaba nadie.
 * - 1792727665798 (Ollama local): seis modelos chicos mueren TODOS a los
 *   ~60-64 s contra "El modelo local cayo demasiado tiempo". 60 s es exactamente
 *   la base de local-chico, y ninguno estaba cargado en RAM.
 *
 * Se ejecuta con:  npx tsx tests/v1661_buclesYReloj.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parametrosDe,
  claseDeModelo,
  presupuestoPrimerByte,
  reiniciarRelojParaPruebas,
} from "../src/engine/relojModelos";
import {
  techoPasosConObra,
  techoPasosConProgreso,
  PASOS_MAX_POR_LECTURA,
} from "../src/engine/cicloHerramientasOpenAICompat";

const RAIZ = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let pasan = 0;
let fallan = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) {
    pasan++;
    console.log("  ok  " + nombre);
  } else {
    fallan++;
    console.log("  FALLA  " + nombre + (detalle ? " -- " + detalle : ""));
  }
}
function seccion(t: string) { console.log(""); console.log(t); }

seccion("1 · OLLAMA LOCAL — el nombre dice el tamano aunque diga m");
comprobar("gemma3:270m son 0,27 B (antes: 0 => se leia es de nube)",
  Math.abs(parametrosDe("gemma3:270m") - 0.27) < 1e-9, String(parametrosDe("gemma3:270m")));
comprobar("smollm2:135m son 0,135 B",
  Math.abs(parametrosDe("HuggingFaceTB/smollm2:135m") - 0.135) < 1e-9);
comprobar("los b de siempre no se movieron",
  parametrosDe("qwen2.5:0.5b") === 0.5 && parametrosDe("llama3.2:3b") === 3);
comprobar("FALSO POSITIVO: bge-m3 no es un tamano",
  parametrosDe("bge-m3") === 0, String(parametrosDe("bge-m3")));
comprobar("FALSO POSITIVO: un apellido con m suelta no es tamano",
  parametrosDe("minicpm-v:2b") === 2);

seccion("2 · OLLAMA LOCAL — sin tamano en el nombre deja de heredar el reloj de la nube");
reiniciarRelojParaPruebas();
const bruto = claseDeModelo("L4_cerebronico_master:latest");
const local = claseDeModelo("L4_cerebronico_master:latest", true);
comprobar("sin el aviso sigue como estaba (no se toca a ciegas)", bruto === "nube-rapida", bruto);
comprobar("con esLocal: es local-chico", local === "local-chico", local);
comprobar("FALSO POSITIVO: un -cloud por Ollama SIGUE siendo nube",
  claseDeModelo("gemma4:31b-cloud", true) === "nube-grande", claseDeModelo("gemma4:31b-cloud", true));
comprobar("FALSO POSITIVO: un nombre de nube rapido no se vuelve local",
  claseDeModelo("glm-4.5-flash", true) === "nube-rapida", claseDeModelo("glm-4.5-flash", true));

seccion("3 · OLLAMA LOCAL — la carga fria paga su propio tiempo");
reiniciarRelojParaPruebas();
const frio = presupuestoPrimerByte("qwen2.5:0.5b", { esLocal: true, cargadoEnRam: false });
const caliente = presupuestoPrimerByte("qwen2.5:0.5b", { esLocal: true, cargadoEnRam: true });
const sinDatos = presupuestoPrimerByte("qwen2.5:0.5b");
// v1.0.19 · el piso subio a 270 s pero el AIRE bajo el aborto de conexion con
// Ollama (180 s) manda: 165 s es el maximo que el reloj puede pedir sin que el
// fetch aborte primero. Antes el piso (150 s) rozaba ese techo.
comprobar("frio: 165 s (el maximo bajo el aborto de 180 s), no los 60 s que lo mataban", frio.ms === 165000, String(frio.ms));
comprobar("el aviso dice POR QUE se estiro", /carga FR/.test(frio.etiqueta), frio.etiqueta);
comprobar("caliente: manda la base de la clase (60 s), no se regala tiempo",
  caliente.ms === 60000, String(caliente.ms));
comprobar("FALSO POSITIVO: sin /api/ps nadie opina (60 s, comportamiento viejo)",
  sinDatos.ms === 60000, String(sinDatos.ms));
comprobar("un local grande frio pide su piso y el aire lo recorta al mismo tope (165 s)",
  presupuestoPrimerByte("qwen3:31b", { esLocal: true, cargadoEnRam: false }).ms === 165000);
const modelosSesion = ["qwen3-vl:2b", "smollm2:1.5b", "gemma3:270m", "deepseek-coder:1.3b", "qwen3:0.6b", "qwen2.5:0.5b"];
const todosPasaron = modelosSesion.every(function (m) {
  return presupuestoPrimerByte(m, { esLocal: true, cargadoEnRam: false }).ms > 70000;
});
comprobar("los seis modelos de la sesion 1792727665798 ya no mueren en los 60 s", todosPasaron);

seccion("4 · BUCLES DE TAREA — leer tambien es avanzar");
comprobar("v1.0.14 sin ninguna llamada: base 24", techoPasosConProgreso(0, 0) === 24);
comprobar("12 lecturas sanas y DISTINTAS compran 12 pasos (el reporte atascado)",
  techoPasosConProgreso(0, 12) === 36, String(techoPasosConProgreso(0, 12)));
comprobar("la lectura aporta a lo sumo PASOS_MAX_POR_LECTURA",
  PASOS_MAX_POR_LECTURA === 24 && techoPasosConProgreso(0, 400) === 48);
comprobar("el techo duro del turno no se mueve (36)",
  techoPasosConProgreso(40, 400) === 96, String(techoPasosConProgreso(40, 400)));
comprobar("compat: la obra sigue valiendo 2 pasos por escritura",
  techoPasosConProgreso(3, 0) === techoPasosConObra(3) && techoPasosConProgreso(3, 0) === 30);
comprobar("compat: techoPasosConObra no cambió su contrato",
  techoPasosConObra(0) === 24 && techoPasosConObra(48) === 96);
comprobar("basura dentro, basura acotada: negativos y NaN no restan pasos",
  techoPasosConProgreso(-5, -9) === 24 && techoPasosConProgreso(NaN, NaN) === 24);

seccion("5 · EL CABLE — los modulos huerfanos de v1.66.0 ya se importan");
const ciclo = leer("server/cicloOpenAICompat.ts");
const servidor = leer("server.ts");
comprobar("el ciclo importa el detector de ciclos entre turnos",
  ciclo.indexOf('from "../src/engine/contextoBucle"') >= 0 && ciclo.indexOf("abrirTurnoBucle(bucle)") >= 0);
comprobar("el ciclo registra cada paso y corta el ciclo terco",
  ciclo.indexOf("registrarPaso(bucle,") >= 0 &&
  ciclo.indexOf("evaluarContextoBucle(bucle)") >= 0 &&
  ciclo.indexOf("if (lazoBucle) break") >= 0);
comprobar("el aviso del ciclo se INYECTA como mensaje, no se queda en el log",
  ciclo.indexOf('mensajes.push({ role: "user", content: avisoBucle })') >= 0);
comprobar("el ciclo importa continuidadTurno y lo consulta antes de cerrar",
  ciclo.indexOf('from "../src/engine/continuidadTurno"') >= 0 &&
  ciclo.indexOf("evaluarContinuidad({") >= 0);
comprobar("la exigencia de continuidad esta acotada (nunca es bucle)",
  ciclo.indexOf("continuidades < MAX_CONTINUIDAD") >= 0 && ciclo.indexOf("MAX_CONTINUIDAD = 2") >= 0);
// v1.66.1 · la memoria NO se copia en cada una de las nueve llamadas: vive en un
// modulo hoja que los tres bucles comparten. Asi el cable no le cuesta una linea al
// monolito (que venia roto de fabrica) y no hay nueve sitios que mantener.
const sesion = leer("src/engine/contextoBucleSesion.ts");
comprobar("existe un unico dueno del estado del ciclo para toda la sesion",
  sesion.indexOf("export const contextoBucleSesion") >= 0 &&
  sesion.indexOf("nuevoContextoBucle()") >= 0);
comprobar("el ciclo OpenAI-compat toma ese estado por defecto (los nueve proveedores)",
  ciclo.indexOf("opts.contextoBucle ?? contextoBucleSesion") >= 0 &&
  ciclo.indexOf('from "../src/engine/contextoBucleSesion"') >= 0);
comprobar("server.ts y el ciclo apuntan al MISMO singleton (no a dos copias)",
  servidor.indexOf('from "./src/engine/contextoBucleSesion"') >= 0);
// v1.69.0 · EL TRAQUETE LEE DEL CONTRATO, no de un número congelado: el 12191 de
// v1.66.0 quedó atrás cuando el monolito creció legítimamente en v1.67/v1.68 con
// su `npm run superficie` regenerado (la ley de superficie.mjs: las suites LEEN
// el presupuesto del contrato, no lo clavan acá). La ley no se afloja: server.ts
// sigue sin poder pasar del presupuesto declarado y verificado por contrato.
const presupuestoContrato: number = JSON.parse(leer("contrato-rutas.json")).presupuesto_lineas;
comprobar("el monolito respeta el presupuesto del contrato (traquete: superficie.mjs)",
  (servidor.match(/\n/g) || []).length <= presupuestoContrato,
  "ahora: " + (servidor.match(/\n/g) || []).length + " / presupuesto: " + presupuestoContrato);
const anotados = (ciclo.match(/anotarPaso\(l\.name, l\.arguments \|\| "", ok\)/g) || []).length;
comprobar("las dos ramas (nativa y textual) anotan el paso", anotados === 2, String(anotados));

// ════════════════════════════════════════════════════════════════════════
// v1.84.3 · EL PILOTO NO APUÑALA LA PRIMERA COMPILACIÓN (queja de Mario con
// captura, 27/10: «la app no alcanza a cargar y se reinicia solo el piloto
// automatico» + «dale más tiempo en el timeout del sandbox a la carga»).
// Mismo estilo que el resto de la suite: vigilancia del CABLEADO real, sobre
// el texto fuente. La lógica de la decisión vive probada por separado en
// estadoSandbox.test.ts §14; acá se jura que el cable la usa.
// ════════════════════════════════════════════════════════════════════════
const vigia = leer("src/components/RightSidebar.tsx");
const paginaArranque = leer("index.html");
comprobar("el vigía importa la decisión pura (no reinventa el criterio)",
  vigia.includes("decidirVigiliaSandbox") && vigia.includes('from "../engine/estadoSandbox"'));
comprobar("★ 'se detuvo' solo se canta cuando la decisión dice DETENIDO",
  vigia.indexOf('decidirVigiliaSandbox') < vigia.indexOf("El sandbox se detuvo") &&
  /if \(vigilia === "arrancando" \|\| vigilia === "sin_server"\) \{[\s\S]{0,900}?return;\s*\}/.test(vigia));
comprobar("★ la espera del puerto pasó de 60 s a 4 min", vigia.includes("Date.now() + 240000"));
comprobar("la muerte se detecta con constancia (3 sondeos) y con gracia de arranque",
  /muertosConsecutivos >= 3/.test(vigia) && /sondeos > 4 && decidirVigiliaSandbox\(chk\) === "detenido"/.test(vigia));
comprobar("★ la primera carga del iframe tiene 30 s (no 12) antes de recargar",
  /reintentosPreviewRef\.current === 0 \? 30000 : 12000/.test(vigia));
comprobar("★ el vigilante de index.html alarma a los 30 s SOLO si algo falló de verdad",
  /function pintarDiag\(\)/.test(paginaArranque) &&
  /if \(AVISOS\.length\) \{ pintarDiag\(\); return; \}/.test(paginaArranque) &&
  /setTimeout\(pintarDiag, 60000\);/.test(paginaArranque));

console.log("");
console.log("RESUMEN v1.66.1 bucles+reloj: " + pasan + " pasan, " + fallan + " fallan");
if (fallan > 0) { console.log("FALLO v1661_buclesYReloj"); process.exit(1); }
console.log("OK v1661_buclesYReloj");
