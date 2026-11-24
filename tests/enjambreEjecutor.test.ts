/**
 * enjambreEjecutor.test.ts — v1.88.0 · EL VEREDICTO EJECUTA
 * ========================================================
 * Lo que se congela:
 *   1. El criterio: una TAREA se ejecuta, una PREGUNTA no. Con las frases reales
 *      de la sesión 1793219578712 («puedes hacerme un pdf…», «hola», «que paso»).
 *   2. El bucle del ejecutor con un modelo falso: llama a la herramienta, mete el
 *      resultado, cierra cuando el modelo deja de pedir, y respeta el tope.
 *   3. Los casos que NO deben fingir: proveedor sin ejecutor, herramienta que
 *      falla, modelo que solo habla. Todos devuelven `ok:false` con motivo.
 *   4. El cableado: el router ejecuta DESPUÉS del veredicto y solo si la tarea lo
 *      pide; el monolito inyecta `executeToolCall` + `AGENT_TOOLS`.
 *   5. La fase 1 NO cambia: las voces siguen yendo sin `tools` (deliberar es
 *      barato y en paralelo; ejecutar es una sola voz y en serie).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tareaPideEjecucion, promptDeEjecucion, bloqueDeObra, SISTEMA_EJECUTOR } from "../src/engine/enjambreEclectico";
import { ejecutarTareaConHerramientas, puedeEjecutar } from "../server/enjambreLlamadas";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

/** Respuesta HTTP falsa: lo mínimo que el ejecutor consume. */
function respuesta(cuerpo: any, ok = true, status = 200) {
  return { ok, status, json: async () => cuerpo };
}

/** Modelo falso: devuelve la secuencia de mensajes que se le pida. */
function modeloFalso(secuencia: any[], capturado?: any[]) {
  let i = 0;
  return async (url: string, init: any) => {
    if (capturado) capturado.push({ url, cuerpo: JSON.parse(init.body) });
    const msg = secuencia[Math.min(i, secuencia.length - 1)];
    i++;
    return respuesta({ choices: [{ message: msg }], message: msg });
  };
}

const CRED = { ollamaUrl: "http://127.0.0.1:11434", keys: { groq: "k" } };
const TOOLS = [{ type: "function", function: { name: "fs_write", parameters: { type: "object" } } }];
/** Lo que realmente salió hacia Gemini (para medir el contrato, no la buena voluntad). */
const capturadoGemini: { url: string; cuerpo: any }[] = [];

console.log("\n🧠 EL VEREDICTO EJECUTA — v1.88.0\n");

seccion("1 · ¿La tarea pide OBRA o pide consejo?");
{
  const obra = [
    "comenzamos , puedes hacerme un pdf sobre los avances de la ia en el mercado actual y dejarlo en el escritorio",
    "generá el informe y guardalo en el escritorio",
    "crea un index.html con una landing",
    "escribí el archivo README.md",
    "instala las dependencias y corre las pruebas",
  ];
  for (const t of obra) comprobar(`obra: «${t.slice(0, 46)}»`, tareaPideEjecucion(t) === true);
  const consejo = [
    "hola",
    "que paso",
    "sigue",
    "continua",
    "¿cómo hago un PDF?",
    "explicame el modo ecléctico",
    "qué es un embedding",
    "en el sandbox no se genero nada",
    "no, el pdf no sale",
  ];
  for (const t of consejo) comprobar(`consejo: «${t.slice(0, 46)}»`, tareaPideEjecucion(t) === false);
  comprobar("vacío no pide nada", tareaPideEjecucion("") === false);
}

seccion("2 · El encargo del ejecutor y la firma del resultado");
{
  const p = promptDeEjecucion("hacer un pdf", "usar la herramienta de documentos");
  comprobar("el prompt lleva la tarea", p.includes("TAREA DEL USUARIO:\nhacer un pdf"));
  comprobar("y el plan del enjambre como referencia", p.includes("PLAN DEL ENJAMBRE") && p.includes("documentos"));
  comprobar("y la orden explícita de ejecutar", /EJECUTÁ AHORA/.test(p));
  comprobar("el sistema prohíbe narrar", /ejecutá, no narres/i.test(SISTEMA_EJECUTOR) && /No digas «voy a»/.test(SISTEMA_EJECUTOR));

  const ok = bloqueDeObra({ intentado: true, ok: true, pasos: [{ nombre: "fs_write", ok: true, resumen: "✔ archivo — 120 bytes" }], texto: "quedó en avances.pdf", ejecutor: "groq/llama" });
  comprobar("con efecto: lo dice con cifra", ok.includes("1 de 1 paso(s) con efecto real") && ok.includes("groq/llama"));
  comprobar("nombra la herramienta y su salida", ok.includes("`fs_write` ✔") && ok.includes("120 bytes"));
  const nada = bloqueDeObra({ intentado: true, ok: false, pasos: [], error: "ninguna voz con herramientas contestó" });
  comprobar("sin pasos: «No se ejecutó nada» con motivo", nada.includes("No se ejecutó nada") && nada.includes("ninguna voz con herramientas"));
  const fallo = bloqueDeObra({ intentado: true, ok: false, pasos: [{ nombre: "fs_write", ok: false, resumen: "❌ sin permiso" }] });
  comprobar("con pasos fallidos: «Ningún paso tuvo efecto»", fallo.includes("Ningún paso tuvo efecto"));
  comprobar("si no se intentó, no hay bloque (no se inventa)", bloqueDeObra({ intentado: false, ok: false, pasos: [] }) === "");
}

seccion("3 · El bucle real contra un modelo falso");
{
  comprobar("groq, openai, ollama y custom pueden ejecutar", ["groq", "openai", "ollama", "custom", "openrouter", "mistral", "deepseek", "zai", "cerebras", "together", "fireworks"].every(puedeEjecutar));

  const capturado: any[] = [];
  const r1 = await ejecutarTareaConHerramientas({
    provider: "groq", model: "llama-3.3-70b", sistema: "sys", usuario: "hacé el pdf",
    cred: CRED, herramientas: TOOLS,
    ejecutarHerramienta: async (n, a) => `✔ ${n} escribió ${a.path}`,
    doFetch: modeloFalso([
      { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "fs_write", arguments: '{"path":"avances.pdf","content":"x"}' } }] },
      { content: "Listo: avances.pdf (2 páginas)." },
    ], capturado),
  });
  comprobar("un tool_call se ejecuta y se devuelve al modelo", r1.pasos.length === 1 && r1.pasos[0].nombre === "fs_write" && r1.pasos[0].ok);
  comprobar("el bucle cierra cuando el modelo deja de pedir", r1.vueltas === 2 && r1.ok && /Listo/.test(r1.texto));
  comprobar("la petición lleva tools y tool_choice", Array.isArray(capturado[0].cuerpo.tools) && capturado[0].cuerpo.tool_choice === "auto");
  comprobar("el resultado de la herramienta vuelve como mensaje `tool`", capturado[1].cuerpo.messages.some((m: any) => m.role === "tool" && m.tool_call_id === "c1"));
  comprobar("los argumentos se parsean del JSON", capturado[1].cuerpo.messages.some((m: any) => m.role === "assistant" && m.tool_calls?.[0]?.function?.name === "fs_write"));

  const r2 = await ejecutarTareaConHerramientas({
    provider: "groq", model: "m", sistema: "s", usuario: "u", cred: CRED, herramientas: TOOLS,
    ejecutarHerramienta: async () => "✔ ok",
    doFetch: modeloFalso([{ content: "Puedes hacerlo así: abre Word…" }]),
  });
  comprobar("modelo que solo habla: no hay efecto y no se finge", !r2.ok && r2.pasos.length === 0);

  const r3 = await ejecutarTareaConHerramientas({
    provider: "groq", model: "m", sistema: "s", usuario: "u", cred: CRED, herramientas: TOOLS,
    ejecutarHerramienta: async () => { throw new Error("permiso denegado"); },
    doFetch: modeloFalso([{ content: "", tool_calls: [{ id: "c9", function: { name: "fs_write", arguments: "{}" } }] }, { content: "no pude" }]),
  });
  comprobar("herramienta que lanza: el paso queda ✗ con el motivo", r3.pasos[0].ok === false && /permiso denegado/.test(r3.pasos[0].resumen));
  comprobar("y el conjunto NO se declara exitoso", r3.ok === false);

  const r4 = await ejecutarTareaConHerramientas({
    provider: "groq", model: "m", sistema: "s", usuario: "u", cred: CRED, herramientas: TOOLS, maxPasos: 3,
    ejecutarHerramienta: async () => "✔ ok",
    doFetch: modeloFalso([{ content: "", tool_calls: [{ id: "c", function: { name: "fs_write", arguments: "{}" } }] }]),
  });
  comprobar("el tope de pasos corta (no hay bucle infinito)", r4.vueltas === 3 && /tope de 3 pasos/.test(r4.error ?? ""));

  // v1.92.0 · GEMINI TIENE EJECUTOR PROPIO. La valla anterior celebraba la
  // renuncia («se declara sin ejecutor»); era honesta pero le dejaba al usuario la
  // misma factura: si la voz más sólida era Gemini, la fase 2 no tocaba el disco.
  // Mario lo pidió expreso: «que todos puedan usar herramientas o que se llame al
  // modelo con la herramienta». La invariante que queda NO es «todos por el mismo
  // canal» —es imposible, son contratos distintos—, es «todos tienen canal, y cada
  // uno lo usa en su idioma». Por eso se mide el cuerpo de la petición: si alguien
  // vuelve a mandarle `tools` estilo OpenAI, Gemini responde 400 y la fase 2
  // vuelve a ser «no hizo nada» sin que ningún tipo de dato se queje.
  const r5 = await ejecutarTareaConHerramientas({
    provider: "gemini", model: "gemini-3.5-flash", sistema: "s", usuario: "u",
    cred: { ...CRED, keys: { ...(CRED as any).keys, gemini: "clave-de-prueba" } }, herramientas: TOOLS,
    ejecutarHerramienta: async () => "✔ escrito",
    doFetch: async (url: string, init: any) => {
      const cuerpo = JSON.parse(init.body);
      capturadoGemini.push({ url, cuerpo });
      const partes = capturadoGemini.length === 1
        ? [{ functionCall: { name: "fs_write", args: { path: "a.txt" } } }]
        : [{ text: "hecho" }];
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: partes } }] }) };
    },
  });
  comprobar("gemini SÍ tiene ejecutor con herramientas", puedeEjecutar("gemini") && r5.ok && r5.pasos.length === 1);
  comprobar("habla su contrato: :generateContent + functionDeclarations", /:generateContent/.test(capturadoGemini[0].url) && Array.isArray(capturadoGemini[0].cuerpo.tools?.[0]?.functionDeclarations));
  comprobar("NO le manda el cuerpo de OpenAI (ni messages ni tool_calls)", !capturadoGemini[0].cuerpo.messages && !JSON.stringify(capturadoGemini[0].cuerpo).includes("tool_calls"));
  comprobar("declara `systemInstruction` + `contents` (papeles de Gemini)", Array.isArray(capturadoGemini[0].cuerpo.systemInstruction?.parts) && capturadoGemini[0].cuerpo.contents?.[0]?.role === "user");
  comprobar("el functionResponse vuelve como parte de `user`", JSON.stringify(capturadoGemini[1].cuerpo.contents).includes("functionResponse"));
  comprobar("sin clave de Gemini se dice el motivo, no se finge", (await ejecutarTareaConHerramientas({
    provider: "gemini", model: "m", sistema: "s", usuario: "u", cred: { keys: {} } as any, herramientas: TOOLS,
    ejecutarHerramienta: async () => "ok",
  })).error?.includes("sin clave") === true);

  const capturado2: any[] = [];
  const r6 = await ejecutarTareaConHerramientas({
    provider: "ollama", model: "qwen3:8b", sistema: "s", usuario: "u", cred: CRED, herramientas: TOOLS,
    ejecutarHerramienta: async () => "✔ escrito",
    doFetch: async (url: string, init: any) => {
      capturado2.push({ url, cuerpo: JSON.parse(init.body) });
      const i = capturado2.length;
      const msg = i === 1
        ? { content: "", tool_calls: [{ function: { name: "fs_write", arguments: { path: "a.txt" } } }] }
        : { content: "hecho" };
      return { ok: true, status: 200, json: async () => ({ message: msg }) };
    },
  });
  comprobar("ollama usa /api/chat y su propio formato de mensaje", /\/api\/chat$/.test(capturado2[0].url) && r6.pasos.length === 1 && r6.ok);
  comprobar("los argumentos objeto de Ollama se aceptan tal cual", JSON.stringify(capturado2[1].cuerpo.messages).includes("a.txt"));
}

seccion("4 · El cableado: fase 1 delibera, fase 2 ejecuta");
{
  const router = leer("server/routers/enjambre.ts");
  const monolito = leer("server.ts");
  const llamadas = leer("server/enjambreLlamadas.ts");
  comprobar("el router importa el criterio puro", /tareaPideEjecucion,\s*\n\s*SISTEMA_EJECUTOR,/.test(router));
  comprobar("la fase 2 corre DESPUÉS de la certeza del veredicto", router.indexOf("revisarVeredictoDelEnjambre(veredicto)") < router.indexOf("ejecutarTareaConHerramientas({"));
  comprobar("solo se ejecuta si la tarea lo pide", /const requiereEjecucion = tareaPideEjecucion\(tarea\)/.test(router) && /if \(requiereEjecucion\) \{/.test(router));
  comprobar("elige la voz más sólida que SEPA ejecutar", /filter\(\(x\) => x\.r\.ok && String\(x\.r\.texto \|\| ""\)\.trim\(\) && puedeEjecutar\(x\.r\.provider\)\)/.test(router));
  comprobar("el bloque de obra se añade al informe", /const informe = ejecucion \? `\$\{informeFase1\}\\n\\n\$\{bloqueDeObra\(ejecucion\)\}` : informeFase1;/.test(router));
  comprobar("y la ejecución viaja como dato en la respuesta", /requiereEjecucion,\s*\n\s*ejecucion,/.test(router));
  comprobar("sin ejecutor inyectado lo DICE, no lo finge", /el IDE no inyectó el ejecutor de herramientas/.test(router));
  comprobar("el monolito inyecta las herramientas reales", /ejecutor: \{ ejecutarHerramienta: executeToolCall, herramientas: AGENT_TOOLS \}/.test(monolito));
  comprobar("★ la fase 1 sigue SIN tools (deliberar ≠ ejecutar)", !/tools:/.test(llamadas.slice(0, llamadas.indexOf("export async function ejecutarTareaConHerramientas"))) && /el enjambre envía messages y systemInstruction/.test(leer("src/engine/enjambreEclectico.ts")));
}

console.log(`\n═══ enjambreEjecutor: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
