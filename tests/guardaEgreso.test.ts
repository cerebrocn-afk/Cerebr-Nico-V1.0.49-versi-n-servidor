/**
 * guardaEgreso.test.ts — v1.87.0 · LA ADUANA DE SALIDA, MEDIDA
 * ===========================================================
 * Lo que esta suite congela:
 *   1. Un secreto NO cruza, ni siquiera en modo «avisar».
 *   2. Un dato que NO es un secreto no se toca: «1.86.6», un sha256, una fecha,
 *      `texto.ts:42` y una racha de 16 dígitos que no pasa Luhn no son tarjetas.
 *   3. Los tres modos hacen exactamente lo que dicen, y se comprueba el texto
 *      resultante, no solo el contador.
 *   4. El cuerpo saliente se sanea sin mutar el original (el registro local
 *      necesita el valor íntegro) y sin tocar `model` ni `tools`.
 *   5. El cableado: `fetchCloud` pasa por la aduana antes de salir y no la usa
 *      contra la propia máquina.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as G from "../src/engine/guardaEgreso";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

const CLAVE_OR = "sk-or-v1-" + "0123456789abcdef".repeat(4); // 64 hex, forma real
const CLAVE_OPENAI = "sk-proj-" + "AbCdEf0123456789".repeat(3);
const CLAVE_GOOGLE = "AIza" + "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"; // 35 tras AIza

console.log("\n🛂 LA ADUANA DE SALIDA — v1.87.0\n");

seccion("1 · Las validaciones reales, no el parecido");
{
  comprobar("Luhn acepta 4242424242424242 (Visa de prueba)", G.luhnValido("4242424242424242"));
  comprobar("Luhn rechaza 4242424242424241 (un dígito cambiado)", !G.luhnValido("4242424242424241"));
  comprobar("Luhn rechaza 1234 (no es tarjeta por longitud)", !G.luhnValido("1234"));
  comprobar("Luhn rechaza 1234567890123456 (16 dígitos que no cuadran)", !G.luhnValido("1234567890123456"));
  comprobar("CPF 529.982.247-25 es válido (verificadores 2 y 5)", G.cpfValido("529.982.247-25"));
  comprobar("CPF 529.982.247-24 no lo es (un dígito)", !G.cpfValido("529.982.247-24"));
  comprobar("CPF 111.111.111-11 se rechaza (repetición, no CPF)", !G.cpfValido("111.111.111-11"));
  comprobar("CNPJ 11.222.333/0001-81 es válido", G.cnpjValido("11.222.333/0001-81"));
  comprobar("CNPJ 11.222.333/0001-82 no lo es", !G.cnpjValido("11.222.333/0001-82"));
}

seccion("2 · La máscara reconoce sin entregar");
{
  comprobar("mascara deja cabeza y cola, tapa el resto", G.mascara(CLAVE_OR) === "sk-or-…" + CLAVE_OR.slice(-4), G.mascara(CLAVE_OR));
  comprobar("mascara no dice nada de un valor corto", G.mascara("abc") === "…");
  comprobar("la máscara NO contiene la clave entera", !G.mascara(CLAVE_OR).includes(CLAVE_OR.slice(6, -4)));
}

seccion("3 · Lo que SÍ es un secreto se redacta hasta en modo «avisar»");
{
  const r = G.sanearTexto(`mi clave es ${CLAVE_OR} y nada más`, { modo: "avisar" });
  comprobar("la clave de OpenRouter desaparece del texto", !r.texto.includes(CLAVE_OR));
  comprobar("y queda el marcador que nombra lo que había", r.texto.includes("[CLAVE_OPENROUTER_REDACTADA]"));
  comprobar("el hallazgo es crítico y se declara redactado", r.hallazgos[0]?.severidad === "critica" && r.hallazgos[0]?.accion === "redactado");
  comprobar("el hallazgo no incluye el valor completo", !JSON.stringify(r.hallazgos).includes(CLAVE_OR));

  const oa = G.sanearTexto(`Authorization: Bearer ${CLAVE_OPENAI}`);
  comprobar("una clave de OpenAI también cae", oa.texto.includes("[CLAVE_OPENAI_REDACTADA]") && !oa.texto.includes(CLAVE_OPENAI));
  const go = G.sanearTexto(`GOOGLE_API_KEY=${CLAVE_GOOGLE}`);
  comprobar("una clave de Google también cae", go.texto.includes("[CLAVE_GOOGLE_REDACTADA]") && !go.texto.includes(CLAVE_GOOGLE));
  comprobar("dos reglas distintas se informan por separado", G.sanearTexto(`${CLAVE_OR} y ${CLAVE_GOOGLE}`).hallazgos.length === 2);
}

seccion("4 · Lo que NO es un secreto no se censura (modo «avisar»)");
{
  const correo = G.sanearTexto("escríbeme a mario@ejemplo.com", { modo: "avisar" });
  comprobar("el correo se detecta", correo.hallazgos.some((h) => h.regla === "correo"));
  comprobar("pero el texto queda INTACTO", correo.texto === "escríbeme a mario@ejemplo.com", correo.texto);
  comprobar("y la acción declarada es «avisado»", correo.hallazgos[0]?.accion === "avisado");

  const tarjeta = G.sanearTexto("cobrar a 4242 4242 4242 4242 por favor", { modo: "avisar" });
  comprobar("la tarjeta válida se detecta", tarjeta.hallazgos.some((h) => h.regla === "tarjeta"));
  comprobar("y se deja para que el usuario decida", tarjeta.texto.includes("4242 4242 4242 4242"));
}

seccion("5 · Los falsos positivos que hundían al sanitizador genérico");
{
  const limpios = [
    "CerebróNico v1.86.6",
    "sha256: f424dbabc241584d5f915b1b4c19b198cb6ad75640170a20cc6bfc08acd04fcf",
    "fecha 2026-10-29T03:15:07Z",
    "abre texto.ts:42 y mira la línea",
    "escucha en http://localhost:3500/api/salud",
    "orden 1234567890123456 (dieciséis dígitos sin Luhn)",
    "temperatura 0.523",
  ];
  for (const t of limpios) {
    const r = G.sanearTexto(t);
    comprobar(`sin hallazgos: «${t.slice(0, 42)}»`, r.hallazgos.length === 0, JSON.stringify(r.hallazgos));
  }
}

seccion("6 · Los tres modos, con su texto resultante");
{
  const entrada = `correo a@b.com y clave ${CLAVE_OR}`;
  const avisar = G.sanearTexto(entrada, { modo: "avisar" });
  comprobar("avisar: clave fuera, correo dentro", !avisar.texto.includes(CLAVE_OR) && avisar.texto.includes("a@b.com"));
  comprobar("avisar: dos hallazgos con acciones distintas", avisar.hallazgos.map((h) => h.accion).sort().join(",") === "avisado,redactado");

  const redactar = G.sanearTexto(entrada, { modo: "redactar" });
  comprobar("redactar: correo también fuera", !redactar.texto.includes("a@b.com") && redactar.texto.includes("[CORREO_REDACTADO]"));

  const bloquear = G.sanearTexto(entrada, { modo: "bloquear" });
  comprobar("bloquear: se para y se explica", bloquear.bloqueado && /no se envía/.test(bloquear.motivo ?? ""));
  comprobar("bloquear: el motivo nombra la regla, no el valor", (bloquear.motivo ?? "").includes("clave_openrouter") && !(bloquear.motivo ?? "").includes(CLAVE_OR));
  comprobar("bloquear con texto limpio NO bloquea", !G.sanearTexto("hola mundo", { modo: "bloquear" }).bloqueado);
}

seccion("7 · Idempotencia: pasar dos veces no inventa trabajo");
{
  const una = G.sanearTexto(`clave ${CLAVE_OR}`);
  const dos = G.sanearTexto(una.texto);
  comprobar("el segundo pase no encuentra nada", dos.hallazgos.length === 0 && dos.texto === una.texto);
  comprobar("y el marcador no se degrada", dos.texto.includes("[CLAVE_OPENROUTER_REDACTADA]"));
}

seccion("8 · El cuerpo que sale: solo los campos con texto, y sin mutar el original");
{
  const cuerpo = {
    model: "openai/gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: "eres útil" },
      { role: "user", content: `usa esta clave ${CLAVE_OR}` },
      { role: "user", content: [{ type: "text", text: "mi correo es x@y.com" }] },
    ],
    tools: [{ type: "function", function: { name: "leer", description: "lee un archivo" } }],
  };
  const r = G.sanearCuerpoSaliente(cuerpo, { modo: "redactar" });
  const serializado = JSON.stringify(r.cuerpo);
  comprobar("la clave del mensaje desaparece", !serializado.includes(CLAVE_OR));
  comprobar("y el correo de la parte de texto también", !serializado.includes("x@y.com"));
  comprobar("los hallazgos se agrupan entre mensajes", r.hallazgos.length >= 2);
  comprobar("el modelo y las herramientas NO se tocan", (r.cuerpo as any).model === "openai/gpt-4o-mini" && (r.cuerpo as any).tools[0].function.name === "leer");
  comprobar("el original queda intacto (el registro local lo necesita)", JSON.stringify(cuerpo).includes(CLAVE_OR));
  comprobar("temperature 0 sobrevive", (r.cuerpo as any).temperature === 0);
}

seccion("9 · La frontera: a la máquina no se le censura");
{
  comprobar("localhost es local", G.esDestinoLocal("http://localhost:11434/api/chat"));
  comprobar("127.0.0.1 es local", G.esDestinoLocal("http://127.0.0.1:3500/x"));
  comprobar("192.168.x.x es local", G.esDestinoLocal("http://192.168.1.50:8080"));
  comprobar("10.x.x.x es local", G.esDestinoLocal("http://10.0.0.4:11434"));
  comprobar("172.16-31.x.x es local", G.esDestinoLocal("http://172.20.1.1:11434"));
  comprobar("172.32.x.x NO es local", !G.esDestinoLocal("http://172.32.1.1:11434"));
  comprobar("una nube no es local", !G.esDestinoLocal("https://openrouter.ai/api/v1/chat/completions"));
  comprobar("una URL rota no se asume local (fail-closed)", !G.esDestinoLocal("no-es-una-url"));
}

seccion("10 · sanearInit: JSON sí, basura no, bloqueo sí");
{
  const init = { method: "POST", body: JSON.stringify({ model: "m", messages: [{ role: "user", content: CLAVE_OR }] }) };
  const saneado = G.sanearInit(init as RequestInit);
  comprobar("el cuerpo JSON sale saneado", !String(saneado.body).includes(CLAVE_OR));
  comprobar("y el método no cambia", saneado.method === "POST");

  const texto = { method: "POST", body: "no soy json" };
  comprobar("un cuerpo que no es JSON se devuelve igual", G.sanearInit(texto as RequestInit) === (texto as RequestInit));

  let lanzo = false;
  try { G.sanearInit(init as RequestInit, { modo: "bloquear" }); } catch { lanzo = true; }
  comprobar("en modo bloquear, sanearInit lanza y no se envía", lanzo);
}

seccion("11 · El cableado en fetchCloud (defecto sembrado por lectura de fuente)");
{
  const fc = leer("server/fetchCloud.ts");
  comprobar("importa la aduana", /from "\.\.\/src\/engine\/guardaEgreso"/.test(fc));
  comprobar("la aplica antes de salir", /const initEgreso = esDestinoLocal\(url\) \? init : sanearInit\(init\)/.test(fc));
  comprobar("el fetch usa el cuerpo saneado", /await fetch\(url, \{ \.\.\.initEgreso/.test(fc));
  comprobar("y NO sanea si el destino es local", /esDestinoLocal\(url\) \? init : sanearInit/.test(fc));
  {
    const ge = leer("src/engine/guardaEgreso.ts");
    // v1.98.0 · la nota sale por EL ECO (una vez por hecho, contando el resto), pero
    // sigue siendo `notaEgreso` la que la arma: la valla de «no filtra el valor» es
    // sobre la nota, no sobre cuántas veces se imprime.
    comprobar("la nota al registro la arma notaEgreso (máscara, nunca el valor)", /const nota = notaEgreso\("cuerpo saliente", r\.hallazgos\)/.test(ge));
    comprobar("y se publica por el eco, no a gritos por cada request", /console\.warn\(ecoNota\.linea\)/.test(ge) && !/console\.warn\(notaEgreso\(/.test(ge));
  }
}

console.log(`\n═══ guardaEgreso: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
