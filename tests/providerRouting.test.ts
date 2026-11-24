/**
 * providerRouting.test.ts — ENRUTAMIENTO DE PROVEEDOR (v1.6.22)
 * =============================================================
 * Regresión del defecto «glm-ocr:latest se manda a Z.ai».
 *
 * El selector de modelo decidía el proveedor SOLO por el prefijo del nombre:
 * cualquier modelo que empezara por «glm-» iba a Z.ai, aunque fuera un modelo
 * LOCAL instalado en Ollama. Resultado: `glm-ocr:latest` (local, 2.2 GB) se
 * enviaba a la nube de Z.ai, que respondía «Unknown Model».
 *
 * La regla corregida es: LOCAL PRIMERO. Si el nombre está en la lista de
 * modelos locales de Ollama, es local. Solo si no está, se deduce el proveedor
 * cloud por el nombre.
 */
import { proveedorParaModelo } from "../src/utils/providerRouting";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};

const locales = ["glm-ocr:latest", "qwen3.5:4b", "gemma3:270m", "qwen2.5:0.5b", "mistral-mio:latest", "gpt-personal:latest"];

console.log("\n1) Un modelo LOCAL es local, aunque el nombre suene a nube\n");

comprobar("glm-ocr:latest (local) → ollama", proveedorParaModelo("glm-ocr:latest", locales) === "ollama");
comprobar("qwen3.5:4b (local) → ollama", proveedorParaModelo("qwen3.5:4b", locales) === "ollama");
comprobar("mistral-mio (local) → ollama", proveedorParaModelo("mistral-mio:latest", locales) === "ollama");
comprobar("gpt-personal (local) → ollama", proveedorParaModelo("gpt-personal:latest", locales) === "ollama");
comprobar("gemma3:270m (local) → ollama", proveedorParaModelo("gemma3:270m", locales) === "ollama");

console.log("\n2) Un modelo NO local se enruta por nombre\n");

comprobar("glm-4.5-flash (nube) → zai", proveedorParaModelo("glm-4.5-flash", []) === "zai");
comprobar("gemini-2.0-flash → gemini", proveedorParaModelo("gemini-2.0-flash", []) === "gemini");
comprobar("gpt-4o-mini → openai", proveedorParaModelo("gpt-4o-mini", []) === "openai");
comprobar("meta-llama/Llama-3.3-70B (tiene /) → openrouter", proveedorParaModelo("meta-llama/Llama-3.3-70B-Instruct", []) === "openrouter");
comprobar("llama-3.3-70b-versatile → groq", proveedorParaModelo("llama-3.3-70b-versatile", []) === "groq");
comprobar("mistral-small-latest → mistral", proveedorParaModelo("mistral-small-latest", []) === "mistral");
comprobar("deepseek-chat → deepseek", proveedorParaModelo("deepseek-chat", []) === "deepseek");
comprobar("accounts/fireworks/models/x → fireworks", proveedorParaModelo("accounts/fireworks/models/llama-v3p1-8b-instruct", []) === "fireworks");

console.log("\n3) Casos neutros\n");

comprobar("un nombre desconocido → ollama (por defecto seguro)", proveedorParaModelo("modelo-raro", []) === "ollama");
comprobar("nombre vacío → ollama", proveedorParaModelo("", []) === "ollama");
comprobar("nombre en blanco → ollama", proveedorParaModelo("   ", []) === "ollama");

// ════════════════════════════════════════════════════════════════════════════
// 4) v1.57.21 — MOTOR Y MODELO SON UNA SOLA DECISIÓN
//    (regresión del log de Mario: 7× «gemma4:31b-cloud llegó con provider=zai»)
// ════════════════════════════════════════════════════════════════════════════
import { modeloAlCambiarMotor } from "../src/utils/providerRouting";
import { avisarProveedorCorregido, avisosProveedorEmitidos } from "../server/avisosProveedor";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

console.log("\n4) Cambiar de motor lleva su modelo encima\n");

const locales21 = ["gemma4:31b-cloud", "qwen3.5:4b", "glm-ocr:latest"];
const listas21 = {
  ollama: locales21,
  gemini: ["gemini-2.5-flash"],
  zai: ["glm-4.5-flash", "glm-4.6"],
  groq: [] as string[],
  openrouter: ["meta-llama/llama-3.3-70b"],
  openai: [] as string[],
};

// El caso del log: motor Z.ai pulsado con el modelo local puesto.
const r1 = modeloAlCambiarMotor("zai", "gemma4:31b-cloud", listas21);
comprobar("★ zai con modelo local → se pasa al primer modelo zai (no queda despareado)", r1.modelo === "glm-4.5-flash" && r1.pertenece === false, JSON.stringify(r1));
// Si el modelo ya es del motor, no se toca nada.
const r2 = modeloAlCambiarMotor("zai", "glm-4.5-flash", listas21);
comprobar("zai con modelo zai → pertenece, modelo intacto", r2.modelo === null && r2.pertenece === true);
// Volverse a Ollama: el primero instalado.
const r3 = modeloAlCambiarMotor("ollama", "glm-4.5-flash", listas21);
comprobar("ollama con modelo de nube → primer modelo instalado", r3.modelo === "gemma4:31b-cloud");
// Motor sin modelos detectados: se deja el actual, pero PERTENECE=false (aviso).
const r4 = modeloAlCambiarMotor("groq", "gemma4:31b-cloud", listas21);
comprobar("groq sin modelos detectados → no inventa, avisa", r4.modelo === null && r4.pertenece === false);
const r5 = modeloAlCambiarMotor("cerebras", "gemma4:31b-cloud", listas21);
comprobar("motor sin lista propia (cerebras) → idem: no inventa", r5.modelo === null && r5.pertenece === false);
// Un `-cloud` de Ollama sigue siendo motor ollama: no es nube a casar con zai.
const r6 = modeloAlCambiarMotor("ollama", "gemma4:31b-cloud", listas21);
comprobar("gemma4:31b-cloud es del motor ollama (pertenece, intacto)", r6.pertenece === true && r6.modelo === null);
// Basura defensiva: listas ausentes o con huecos.
const r7 = modeloAlCambiarMotor("openrouter", "gemma4:31b-cloud", { ollama: [] });
comprobar("openrouter sin lista → null + aviso, sin reventar", r7.modelo === null && r7.pertenece === false);
const r8 = modeloAlCambiarMotor("gemini", "gemma4:31b-cloud", { ollama: [], gemini: ["", "  ", "gemini-2.5-flash"] });
comprobar("se salta nombres vacíos y toma el primero útil", r8.modelo === "gemini-2.5-flash");

// ════════════════════════════════════════════════════════════════════════════
// 5) v1.57.21 — EL AVISO 🧩 UNA SOLA VEZ POR PAR (dedupe del log)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) El aviso del proveedor corregido no se repite por turno\n");

// (El console.warn real se enmascara para no ensuciar la salida de la suite.)
const consolaOriginal = console.warn;
let impresos = 0;
console.warn = (..._args: unknown[]) => { impresos++; };
try {
  comprobar("primera vez: avisa", avisarProveedorCorregido("gemma4:31b-cloud", "zai") === true);
  comprobar("segunda vez, mismo par: callado", avisarProveedorCorregido("gemma4:31b-cloud", "zai") === false);
  comprobar("setenta turnos más: sigue callado", Array.from({ length: 70 }).every(() => !avisarProveedorCorregido("gemma4:31b-cloud", "zai")));
  comprobar("par distinto (otro motor): sí avisa", avisarProveedorCorregido("gemma4:31b-cloud", "gemini") === true);
  comprobar("par distinto (otro modelo): sí avisa", avisarProveedorCorregido("llama3.2:1b", "gemini") === true);
  comprobar("el contador lleva 3 pares avisados", avisosProveedorEmitidos() === 3, String(avisosProveedorEmitidos()));
  comprobar("★ se imprimieron exactamente 3 líneas, no 73", impresos === 3, String(impresos));
} finally {
  console.warn = consolaOriginal;
}

// ── El cable: la guarda del server ya no grita en línea, llama al dedupe ──
const servidor = leer("server.ts");
comprobar("★ server.ts llama a avisarProveedorCorregido", /avisarProveedorCorregido\(model, provider\);/.test(servidor));
comprobar("★ el texto del aviso ya NO está clavado en el monolito", !servidor.includes("es LOCAL (Ollama) pero el turno lleg"));
const app = leer("src/App.tsx");
comprobar("★ App cablea cambiarMotor en los selectores de motor", (app.match(/onSelectProvider=\{cambiarMotor\}/g) || []).length === 2);
comprobar("★ ningún selector de motor hace setProvider a secas", !app.includes("onSelectProvider={setProvider}"));
comprobar("★ el modelo de la barra lateral también sincroniza el motor", (app.match(/onSelectModel=\{cambiarModelo\}/g) || []).length === 2);

console.log(`\n═══ ENRUTAMIENTO DE PROVEEDOR (v1.6.22): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
