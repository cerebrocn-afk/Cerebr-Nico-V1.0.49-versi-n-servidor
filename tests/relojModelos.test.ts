/**
 * relojModelos.test.ts — v1.57.18 · SUITE DE CERTEZA: EL RELOJ MEDIDO
 * =====================================================================
 * Fixture: las MEDICIONES REALES de la sesión 1792103924951 (estudio
 * estudio-tiempos-llamada.md): 9 de 23 turnos con error, 24,0 min quemados
 * (20 %), turno exitoso de 39 s de mediana, glm-4.5-flash con 6 fallos,
 * gemma4:31b-cloud cortado a los 180 s teniendo reloj local de 300.
 * Entrada hostil nombrada: error sin mensaje (causa desconocida) y un nombre
 * de modelo sin parámetros ni dueño (clase por defecto).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../src/engine/relojModelos";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0; let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `— ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

console.log("\n⏱️  EL RELOJ MEDIDO — v1.57.18\n");

seccion("1 · Sin historia: base por clase (y el caso gemma4 de la sesión)");
{
  R.reiniciarRelojParaPruebas();
  comprobar("modelo de nube 'flash' sin historia: base 60 s", R.presupuestoPrimerByte("glm-4.5-flash").ms === 60_000, String(R.presupuestoPrimerByte("glm-4.5-flash").ms));
  comprobar("gemma4:31b-cloud sin historia: base 180 s", R.presupuestoPrimerByte("gemma4:31b-cloud").ms === 180_000, String(R.presupuestoPrimerByte("gemma4:31b-cloud").ms));
  // v1.0.19 · un local de 3B caliente sigue en 60 s, pero NUNCA por encima del
  // techo de conexión con aire: el reloj tiene que hablar antes que el aborto.
  comprobar("un local de 3B: base 60 s", R.presupuestoPrimerByte("llama3.2:3b").ms === 60_000);
  comprobar("un local de 31B a secas: base 240 s", R.presupuestoPrimerByte("qwen3:31b").ms === 240_000, String(R.presupuestoPrimerByte("qwen3:31b").ms));
  comprobar("clases coherentes", R.claseDeModelo("qwen2.5-coder:1.5b") === "local-chico" && R.claseDeModelo("gemma4:31b-cloud") === "nube-grande", `${R.claseDeModelo("qwen2.5-coder:1.5b")} / ${R.claseDeModelo("gemma4:31b-cloud")}`);
  comprobar("fuente 'clase' mientras no hay 3 muestras", R.presupuestoPrimerByte("gemma4:31b-cloud").fuente === "clase");
}

seccion("2 · Con historia propia: el p95 manda y la etiqueta lo dice");
{
  R.reiniciarRelojParaPruebas();
  // Perfil real de la sesión: turnos exitosos de mediana 39 s (mín 19, máx 129).
  [19_000, 39_000, 42_000].forEach((ms) => R.registrarPrimerByte("gemma4:31b-cloud", ms));
  const p = R.presupuestoPrimerByte("gemma4:31b-cloud");
  comprobar("3 muestras → fuente 'medido'", p.fuente === "medido");
  comprobar("p95 x margen con piso de la base: 42 s x 1,6 = 67 s < 144 s (base x 0,8) → 144 s", p.ms === 144_000, String(p.ms));
  const med = R.medicionDe("gemma4:31b-cloud");
  comprobar("la medición reporta p50/p95 reales", !!med && med.n === 3 && med.p50 === 39_000 && med.p95 === 42_000, JSON.stringify(med));
  comprobar("la etiqueta nombra el medido", /medido en tu máquina/.test(p.etiqueta), p.etiqueta);
  // Y el caso del 31B lento: 3 muestras de 250-300 s
  R.reiniciarRelojParaPruebas();
  [250_000, 270_000, 300_000].forEach((ms) => R.registrarPrimerByte("gemma4:31b-cloud", ms));
  const p2 = R.presupuestoPrimerByte("gemma4:31b-cloud");
  comprobar("un 31B realmente lento recibe su presupuesto: 300 x 1,6 = 480 s (no 180)", p2.ms === 480_000, String(p2.ms));
}

seccion("3 · Pisos, techos y ventana deslizante");
{
  R.reiniciarRelojParaPruebas();
  [2_000, 3_000, 4_000].forEach((ms) => R.registrarPrimerByte("llama3.2:3b", ms));
  comprobar("piso: un local chico rapidísimo no baja de 48 s (base x 0,8)", R.presupuestoPrimerByte("llama3.2:3b").ms === 48_000, String(R.presupuestoPrimerByte("llama3.2:3b").ms));
  R.reiniciarRelojParaPruebas();
  [900_000, 950_000, 990_000].forEach((ms) => R.registrarPrimerByte("qwen3:31b", ms));
  comprobar("techo: jamás pasa de 600 s", R.presupuestoPrimerByte("qwen3:31b").ms === 600_000, String(R.presupuestoPrimerByte("qwen3:31b").ms));
  R.reiniciarRelojParaPruebas();
  for (let i = 1; i <= 13; i++) R.registrarPrimerByte("m", i * 1_000);
  comprobar("ventana: solo las últimas 12 muestras", R.medicionDe("m")?.n === 12, String(R.medicionDe("m")?.n));
}

seccion("4 · Clasificador: los cuatro mensajes REALES de la sesión, con causa real");
{
  const eRed = new Error("fetch failed"); (eRed as any).cause = { code: "ECONNRESET" };
  comprobar("«fetch failed» → red (y la causa real sale a la luz)", R.clasificarFalloProveedor(eRed).clase === "red" && R.causaReal(eRed) === "ECONNRESET", R.causaReal(eRed));
  comprobar("«sin respuesta … en los primeros 120 s» → tiempo", R.clasificarFalloProveedor(new Error("sin respuesta de api.z.ai en los primeros 120 s")).clase === "tiempo");
  comprobar("429/cuota → cuota", R.clasificarFalloProveedor(new Error("429 RESOURCE_EXHAUSTED: quota exceeded")).clase === "cuota");
  comprobar("«does not support image input» → capacidad (el 400 de gpt-oss)", R.clasificarFalloProveedor(new Error("HTTP 400: this model does not support image input")).clase === "capacidad");
  comprobar("ENTRADA HOSTIL: error sin mensaje → desconocido", R.clasificarFalloProveedor({}).clase === "desconocido");
  comprobar("causaReal con cause string y sin cause", R.causaReal(new Error("x")) === "" && R.causaReal(Object.assign(new Error("x"), { cause: "ETIMEDOUT" })) === "ETIMEDOUT");
}

seccion("5 · La alternativa se propone MEDIDA, no adivinada");
{
  R.reiniciarRelojParaPruebas();
  [39_000, 40_000, 41_000].forEach((ms) => R.registrarPrimerByte("gemma3n:e2b", ms));
  [120_000, 130_000, 140_000].forEach((ms) => R.registrarPrimerByte("qwen3:31b", ms));
  const a = R.sugerirAlternativa(["qwen3:31b", "gemma3n:e2b"]);
  comprobar("elige el más rápido medido", a?.modelo === "gemma3n:e2b" && a?.p50 === 40_000, JSON.stringify(a));
  comprobar("y lo etiqueta como medido", !!a && /medido en tu máquina/.test(a.etiqueta));
  comprobar("sin mediciones no inventa", R.sugerirAlternativa(["desconocido:x"]) === null);
  comprobar("modelosMedidos lista solo los que respondieron", R.modelosMedidos().sort().join(",") === "gemma3n:e2b,qwen3:31b", R.modelosMedidos().join(","));
}

seccion("6 · Vallas: el reloj medido está CABLEADO (no es un módulo de adorno)");
{
  const servidor = leer("server.ts");
  const stream = leer("server/streamContext.ts");
  const fetchCloud = leer("server/fetchCloud.ts");
  comprobar("server.ts anuncia el presupuesto medido al stream", /ctx\.setRelojDePrimerByte\(relojLocal\.ms, relojLocal\.etiqueta\)/.test(servidor));
  comprobar("server.ts mide el primer byte real del modelo EN VUELO (F2)", /registrarPrimerByte\(modeloEnVuelo, Date\.now\(\) - inicioBufferIA\)/.test(servidor));
  // v1.66.1 — el latido ya no es un pulsar ciego: lleva la SEÑERA de Ollama
  // (`loading safetensors 43%`) para que el reloj distinga progreso de estancamiento.
  comprobar("server.ts alimenta el reloj con la `status` de Ollama (progreso = vida)",
    /!estado\.content\) ctx\.latido\(\s*String\(\(estado\.data as any\)\?\.status/.test(servidor));
  comprobar("server.ts limpia la cuarentena cuando el modelo responde (su éxito o el del rescate)", (servidor.match(/registrarExitoProveedor\(modeloEnVuelo\)/g) || []).length >= 2);
  comprobar("streamContext tiene los DOS tramos con nombre", /primerByteVisto/.test(stream) && /msDelTramo\(\)/.test(stream) && /la GENERACIÓN/.test(stream) && /el PRIMER BYTE/.test(stream));
  // v1.66.1 — el tope de 2 seguía castigando al modelo que MÁS informa (un
  // porcentaje que sube es vida). Ahora hay tres techos nombrados: sin señera
  // (2, el de siempre), señera repetida (3) y total absoluto (24). Se exige que
  // los tres existan y que `latido()` los consulte: sin techo, un stream que sólo
  // emite `status` viviría para siempre.
  comprobar("streamContext acota los latidos de carga (sin señera sigue siendo 2, y hay techo total)",
    /LATIDOS_SIN_SENSERA_MAX = 2/.test(stream) &&
    /LATIDOS_IGUALES_TOPE = 3/.test(stream) &&
    /LATIDOS_TOTALES_MAX = 24/.test(stream) &&
    /extensionesDeCarga >= LATIDOS_TOTALES_MAX/.test(stream) &&
    /extensionesDeCarga >= LATIDOS_SIN_SENSERA_MAX/.test(stream) &&
    /latidosIguales >= LATIDOS_IGUALES_TOPE/.test(stream));
  comprobar("streamContext lee la señera de progreso y sólo estira si cambia",
    /latido\(progreso = ""\)/.test(stream) && /senial !== this\.ultimaSenialDeCarga/.test(stream));
  // v1.66.1 · LA CARGA FRÍA LLEGA AL MOTOR: el presupuesto ya no es a ciegas.
  // v1.66.1 · la decicion SALIO del monolito (trinquete de lineas) y vive en
  // server/pivotEnVivo.ts, que es donde ya estaba `InventarioLocal`. server.ts se
  // limita a pedirla: compramos las dos mitades del cable, no solo la logica.
  const pivote = leer("server/pivotEnVivo.ts");
  comprobar("pivotEnVivo mira /api/ps antes de dar el presupuesto (carga fria declarada)",
    /inventario\?\.cargados \|\| \[\]/.test(pivote) &&
    /presupuestoPrimerByte\(modelo, \{ esLocal, cargadoEnRam \}\)/.test(pivote));
  comprobar("server.ts pide el reloj con el inventario en la mano",
    /const relojLocal = relojDeModeloLocal\(modelForOllama, inventarioLocal\)/.test(servidor));
  comprobar("fetchCloud conserva el 120 s como PISO (Math.max), no como único tope", /Math\.max\(CLOUD_FIRST_BYTE_TIMEOUT_MS, presupuesto\.ms\)/.test(fetchCloud));
  comprobar("fetchCloud nombra el tramo vencido y la causa real", /venció el tramo del PRIMER BYTE/.test(fetchCloud) && /causa real:/.test(fetchCloud));
  comprobar("fetchCloud consulta el fusible antes de llamar", /enCuarentena\(modelo\)/.test(fetchCloud) && /notaCuarentena\(modelo/.test(fetchCloud));
}

seccion("7 · v1.0.19 · EL TURNO QUE MORÍA CON EL MODELO A PUNTO DE HABLAR (sesión 1794607399689)");
{
  // RAÍZ medida: llama3.2:1b en CPU pura tarda ~165 s hasta la primera palabra
  // (volcar 1.5 GB + prefill). El piso viejo eran 150 s y el techo de conexión
  // con Ollama 180 s: el reloj y el aborto del fetch se pisaban y los turnos
  // 2-4 caían. Ahora el piso de carga fría queda holgadamente por debajo del
  // techo de conexión, que es lo que hace que la PRIMERA palabra llegue.
  R.reiniciarRelojParaPruebas();
  const frio = R.presupuestoPrimerByte("llama3.2:1b", { esLocal: true, cargadoEnRam: false });
  comprobar("carga fría de un 1B local: piso de 270 s recortado a 165 s por el aire del aborto", frio.ms === 165_000, String(frio.ms));
  comprobar("la etiqueta nombra la carga fría", /carga FRÍA/.test(frio.etiqueta), frio.etiqueta);
  const medFrio = R.presupuestoPrimerByte("llama3.2:3b", { esLocal: true, cargadoEnRam: false });
  comprobar("un 3B frío recibe el mismo trato (misma clase que el 1B)", medFrio.ms === 165_000, String(medFrio.ms));
  // El presupuesto NUNCA toca el techo de conexión: siempre deja 15 s de aire,
  // aunque las mediciones digan que el modelo es lentísimo.
  R.reiniciarRelojParaPruebas();
  [170_000, 175_000, 179_000].forEach((ms) => R.registrarPrimerByte("llama3.2:1b", ms));
  const medido = R.presupuestoPrimerByte("llama3.2:1b", { esLocal: true, cargadoEnRam: false });
  comprobar("un 1B medido en ~175 s tampoco pasa de 165 s (aire bajo el aborto)", medido.ms === 165_000, `${medido.ms} · ${medido.fuente}`);
  comprobar("NINGÚN presupuesto local alcanza el techo de conexión (180 s)", [1, 3, 7, 31].every((b) => {
    R.reiniciarRelojParaPruebas();
    [200_000, 210_000, 220_000].forEach((ms) => R.registrarPrimerByte(`x:${b}b`, ms));
    return R.presupuestoPrimerByte(`x:${b}b`, { esLocal: true, cargadoEnRam: true }).ms <= 165_000;
  }));
  // EL PROMPT SE PAGA: lo que el `done` de Ollama midió en prompt_eval se suma.
  R.reiniciarRelojParaPruebas();
  comprobar("sin medición de prompt, sobrante 0", R.sobranteMedidoDePrefill("llama3.2:1b") === 0);
  comprobar("sobrante = prefill - base (nunca negativo)", R.sobranteDePrefill(90_000, 60_000) === 30_000 && R.sobranteDePrefill(10_000, 60_000) === 0);
  R.registrarPrefill("llama3.2:1b", 200_000, 180_000); // 20 s de sobreprecio medido
  R.registrarPrefill("llama3.2:1b", 400_000, 180_000); // 220 s
  R.registrarPrefill("llama3.2:1b", 120_000, 180_000); // 0 (no suma)
  comprobar("la mediana de los sobrantes manda", R.sobranteMedidoDePrefill("llama3.2:1b") === 20_000, String(R.sobranteMedidoDePrefill("llama3.2:1b")));
  R.reiniciarRelojParaPruebas(); // limpia las 3 muestras de 175 s: aquí manda el piso frío + el prefill
  [200_000, 400_000, 120_000].forEach((ms) => R.registrarPrefill("llama3.2:1b", ms, 180_000));
  // CARGADO EN RAM (sin piso frío): el sobrante del prompt es lo único que suma,
  // y el aire del aborto se respeta igual. Base 60 s + 20 s = 80 s.
  const conPrompt = R.presupuestoPrimerByte("llama3.2:1b", { esLocal: true, cargadoEnRam: true });
  comprobar("el sobrante del prompt se SUMA a la base (60 s + 20 s = 80 s)", conPrompt.ms === 80_000, String(conPrompt.ms));
  comprobar("la etiqueta dice «+N s de prompt medido»", /prompt medido/.test(conPrompt.etiqueta), conPrompt.etiqueta);
  comprobar("un modelo de NUBE no hereda el prefill local", !/prompt medido/.test(R.presupuestoPrimerByte("llama3.2:1b").etiqueta));
  comprobar("reiniciarRelojParaPruebas limpia el prefill", (() => { R.reiniciarRelojParaPruebas(); return R.sobranteMedidoDePrefill("llama3.2:1b") === 0; })());
  // VALLAS: las cuatro piezas de v1.0.19 están CABLEADAS.
  const servidor = leer("server.ts");
  const tiers = leer("src/engine/modelTiers.ts");
  comprobar("server.ts registra el prefill del `done` con UNIDADES ms (msPrompt)", /registrarPrefill\(modeloEnVuelo, Number\(met\?\.msPrompt\) \|\| 0, relojLocal\.ms\)/.test(servidor));
  comprobar("server.ts registra también el camino sin stream", (servidor.match(/registrarPrefill\(modeloEnVuelo/g) || []).length >= 2);
  comprobar("server.ts NO deja crecer la ventana en modo liviano", /localLiviano \? undefined : TOPE_CTX_RAM/.test(servidor));
  comprobar("keepAlive de un ≤1.7B local es 5m (deja de expulsarse entre turnos)", /paramsB <= DIMINUTO_PARAMS_B\) return "5m"/.test(tiers));
  comprobar("el techo de conexión del reloj es el MISMO 180 s que el aborto del fetch", /TECHO_CONEXION_OLLAMA_MS = 180_000/.test(leer("src/engine/relojModelos.ts")) && /OLLAMA_CONNECT_TIMEOUT_MS = 3 \* 60 \* 1000/.test(servidor));
}

console.log(`\n═══ relojModelos: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
