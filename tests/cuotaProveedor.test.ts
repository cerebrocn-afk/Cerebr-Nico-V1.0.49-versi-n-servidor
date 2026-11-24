/**
 * cuotaProveedor.test.ts — v1.87.0 · ESPERAR LO QUE DICE EL PROVEEDOR
 * ===================================================================
 * El defecto que esta suite impide que vuelva: un 429 de Groq/OpenRouter/
 * Mistral/DeepSeek se resolvía con 15 minutos fijos (fusibleProveedores) o con
 * un backoff ciego (resilience), mientras el proveedor había dicho en una
 * cabecera exactamente cuándo volvía. Aquí se congela:
 *   · las cuatro formas de escribir una espera (segundos, duración, epoch s/ms,
 *     fecha HTTP) con su número exacto;
 *   · que 200 no abre espera, que 429 sin dato espera 60 s y no 900 s;
 *   · que una espera vencida se borra sola y que el corte explica cuándo vuelve;
 *   · el cableado en fetchCloud, incluido el ORDEN: la cuota se mira antes de
 *     gastar el primer byte.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../src/engine/cuotaProveedor";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const T0 = Date.UTC(2026, 9, 29, 3, 0, 0); // 2026-10-29T03:00:00Z

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

console.log("\n🚦 LA CUOTA QUE EL PROVEEDOR DECLARA — v1.87.0\n");

seccion("1 · Duraciones: cada forma con su número exacto");
{
  comprobar("120ms → 120", C.duracionAMS("120ms") === 120, String(C.duracionAMS("120ms")));
  comprobar("1.5s → 1500", C.duracionAMS("1.5s") === 1500);
  comprobar("30s → 30000", C.duracionAMS("30s") === 30_000);
  comprobar("6m0s → 360000 (formato de OpenRouter)", C.duracionAMS("6m0s") === 360_000);
  comprobar("1h2m3s → 3723000", C.duracionAMS("1h2m3s") === 3_723_000);
  comprobar("1d → 86400000", C.duracionAMS("1d") === 86_400_000);
  comprobar("«30» pelado NO es una duración (falta la unidad)", C.duracionAMS("30") === null);
  comprobar("«abc» no es una duración", C.duracionAMS("abc") === null);
  comprobar("vacío no es una duración", C.duracionAMS("") === null);
}

seccion("2 · interpretarEspera: las cuatro formas de decir «vuelve en X»");
{
  comprobar("Retry-After: 30 → 30 s", C.interpretarEspera("30", T0) === 30_000);
  comprobar("Retry-After: 0 → nada que esperar", C.interpretarEspera("0", T0) === null);
  comprobar("duración 6m0s → 6 min", C.interpretarEspera("6m0s", T0) === 360_000);
  const epochS = Math.floor((T0 + 90_000) / 1000);
  comprobar("epoch en segundos → ~90 s (al segundo)", Math.abs((C.interpretarEspera(String(epochS), T0) ?? -1) - 90_000) <= 1000);
  comprobar("epoch en milisegundos → 45 s exactos", C.interpretarEspera(String(T0 + 45_000), T0) === 45_000);
  comprobar("epoch ya pasado → nada que esperar", C.interpretarEspera(String(Math.floor((T0 - 60_000) / 1000)), T0) === null);
  const fecha = new Date(T0 + 120_000).toUTCString();
  comprobar(`fecha HTTP (${fecha}) → 120 s`, C.interpretarEspera(fecha, T0) === 120_000, String(C.interpretarEspera(fecha, T0)));
  comprobar("techo: 48h se recorta a 24h", C.interpretarEspera("48h", T0) === C.TOPE_ESPERA_MS);
  comprobar("suelo: 10ms se sube a 1 s", C.interpretarEspera("10ms", T0) === 1000);
  comprobar("basura → null", C.interpretarEspera("mañana", T0) === null);
}

seccion("3 · registrarCuota: cuándo se abre espera y cuándo no");
{
  C.reiniciarCuotasParaPruebas();
  comprobar("un 200 no abre nada", C.registrarCuota("api.groq.com", 200, {}, T0) === null);
  comprobar("un 401 no abre nada", C.registrarCuota("api.groq.com", 401, {}, T0) === null);
  comprobar("un 503 SIN Retry-After no abre nada", C.registrarCuota("api.groq.com", 503, {}, T0) === null);

  const r429 = C.registrarCuota("api.groq.com", 429, { "retry-after": "30" }, T0);
  comprobar("429 con Retry-After 30 → hasta T0+30 s", r429?.hasta === T0 + 30_000 && r429?.fuente === "retry-after");
  comprobar("429 sin cabeceras → 60 s por defecto (no 15 min)", C.registrarCuota("api.mistral.ai", 429, {}, T0)?.hasta === T0 + 60_000);
  comprobar("y se declara «sin-dato»", C.registrarCuota("api.deepseek.com", 429, {}, T0)?.fuente === "sin-dato");

  const reset = C.registrarCuota("openrouter.ai", 429, { "x-ratelimit-reset-tokens": "6m0s" }, T0);
  comprobar("x-ratelimit-reset-tokens 6m0s → 6 min", reset?.hasta === T0 + 360_000 && reset?.fuente === "x-ratelimit-reset");

  comprobar("503 CON Retry-After sí abre espera", C.registrarCuota("api.openai.com", 503, { "retry-after": "20" }, T0)?.hasta === T0 + 20_000);
}

seccion("4 · Precedencia y cuerpo de error");
{
  C.reiniciarCuotasParaPruebas();
  const ambos = C.registrarCuota("h1.example", 429, { "retry-after": "12", "x-ratelimit-reset": "9999999" }, T0);
  comprobar("Retry-After gana a x-ratelimit-reset", ambos?.hasta === T0 + 12_000 && ambos?.fuente === "retry-after");

  const cuerpo = C.registrarCuota("gemini.example", 429, {}, T0, '{"error":{"details":[{"retryDelay":"27s"}]}}');
  comprobar("retryDelay del cuerpo → 27 s", cuerpo?.hasta === T0 + 27_000 && cuerpo?.fuente === "cuerpo");

  const texto = C.registrarCuota("otro.example", 429, {}, T0, "Quota exceeded. Please retry in 12.5s.");
  comprobar("«retry in 12.5s» del texto → 12.5 s", texto?.hasta === T0 + 12_500);

  const mayus = C.registrarCuota("mayus.example", 429, { "Retry-After": "45" }, T0);
  comprobar("las cabeceras se leen sin importar el tamaño de letra", mayus?.hasta === T0 + 45_000);
}

seccion("5 · puedeLlamar: corta, cuenta y se limpia sola");
{
  C.reiniciarCuotasParaPruebas();
  C.registrarCuota("api.groq.com", 429, { "retry-after": "30" }, T0);
  const antes = C.puedeLlamar("api.groq.com", T0 + 10_000);
  comprobar("a los 10 s NO se puede llamar", !antes.permitido && antes.restanteMs === 20_000, JSON.stringify(antes));
  const despues = C.puedeLlamar("api.groq.com", T0 + 30_000);
  comprobar("a los 30 s sí se puede", despues.permitido && despues.restanteMs === 0);
  comprobar("y la espera vencida se borra del estado", C.estadoCuotas(T0 + 30_000).every((e) => e.proveedor !== "api.groq.com"));
  comprobar("otro proveedor no queda afectado", C.puedeLlamar("api.openai.com", T0 + 10_000).permitido);
  C.registrarCuota("api.groq.com", 429, { "retry-after": "30" }, T0);
  comprobar("el nombre se compara sin mayúsculas", !C.puedeLlamar("API.GROQ.COM", T0 + 5_000).permitido);
}

seccion("6 · La nota que ve el usuario dice CUÁNDO vuelve");
{
  C.reiniciarCuotasParaPruebas();
  C.registrarCuota("api.groq.com", 429, { "retry-after": "252" }, T0);
  const estado = C.puedeLlamar("api.groq.com", T0);
  const nota = C.notaEspera("api.groq.com", estado);
  comprobar("nombra el proveedor", nota.includes("api.groq.com"));
  comprobar("dice la espera en minutos y segundos", nota.includes("4 min 12 s"), nota);
  comprobar("y una hora aproximada", /≈\d{2}:\d{2}/.test(nota), nota);
  comprobar("humanizar: 90 s → «1 min 30 s»", C.humanizarDuracion(90_000) === "1 min 30 s");
  comprobar("humanizar: 3600 s → «1 h»", C.humanizarDuracion(3_600_000) === "1 h");
  comprobar("humanizar: 45 s → «45 s»", C.humanizarDuracion(45_000) === "45 s");
}

seccion("7 · estadoCuotas: la que vence antes, primero");
{
  C.reiniciarCuotasParaPruebas();
  C.registrarCuota("lento.example", 429, { "retry-after": "300" }, T0);
  C.registrarCuota("rapido.example", 429, { "retry-after": "20" }, T0);
  const foto = C.estadoCuotas(T0 + 1_000);
  comprobar("dos esperas vivas", foto.length === 2, String(foto.length));
  comprobar("ordenadas por vencimiento", foto[0].proveedor === "rapido.example" && foto[1].proveedor === "lento.example");
  comprobar("el restante se descuenta", foto[0].restanteMs === 19_000);
}

seccion("8 · El cableado en fetchCloud, con el orden correcto");
{
  const fc = leer("server/fetchCloud.ts");
  const iCuota = fc.indexOf("puedeLlamar(anfitrion, Date.now())");
  const iAduana = fc.indexOf("sanearInit(init)");
  const iFetch = fc.indexOf("await fetch(url, { ...initEgreso");
  comprobar("importa el módulo", /from "\.\.\/src\/engine\/cuotaProveedor"/.test(fc));
  comprobar("mira la cuota ANTES de la aduana y del fetch", iCuota > 0 && iAduana > iCuota && iFetch > iAduana, `${iCuota}/${iAduana}/${iFetch}`);
  comprobar("registra la respuesta del proveedor con sus cabeceras", /registrarCuota\(anfitrion, r\.status, cabecerasPlanas\(r\.headers\)/.test(fc));
  comprobar("una espera viva corta con nota, no con un error críptico", /throw new Error\(notaEspera\(anfitrion, cuota\)\)/.test(fc));
  comprobar("las cabeceras se aplanan en minúsculas", /salida\[nombre\.toLowerCase\(\)\] = valor/.test(fc));
}

console.log(`\n═══ cuotaProveedor: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
