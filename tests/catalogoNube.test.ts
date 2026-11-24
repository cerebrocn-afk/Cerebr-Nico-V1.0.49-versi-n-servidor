/**
 * tests/catalogoNube.test.ts — v1.0.34 · LA CLAVE RECHAZADA YA NO SE CALLA
 * =======================================================================
 * Sesión del 20/11: «puse la clave de un modelo pago y ni cargaron los modelos,
 * DeepSeek». El backend contestaba HTTP 200 con los 3 modelos estáticos y sin
 * motivo; la interfaz decía «3 modelos detectados». Nada en pantalla permitía
 * saber que la clave viajó y fue rechazada.
 *
 * `npx tsx tests/catalogoNube.test.ts`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { limpiarClave, diagnosticoCatalogo, respuestaCatalogo } from "../src/engine/catalogoNube";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function check(desc: string, cond: boolean, detalle = "") {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(`${desc}${detalle ? ` → ${detalle}` : ""}`); console.log(`  \u2717 ${desc}${detalle ? ` → ${detalle}` : ""}`); }
}

console.log("\n1. LA CLAVE QUE SE PEGA CON BASURA");
// ════════════════════════════════════════════════════════════════════════
{
  check("un salto de línea al final no viaja", limpiarClave("sk-abc123\r\n") === "sk-abc123");
  check("las comillas del copiar-pegar tampoco", limpiarClave('"sk-abc123"') === "sk-abc123");
  check("un `Bearer` pegado entero no se duplica", limpiarClave("Bearer sk-abc123") === "sk-abc123");
  check("…ni en minúsculas", limpiarClave("bearer  sk-abc123") === "sk-abc123");
  check("los espacios de en medio se van", limpiarClave(" sk-abc 123 ") === "sk-abc123");
  check("una clave limpia no se toca", limpiarClave("sk-proj-ABC_123-x") === "sk-proj-ABC_123-x");
  check("undefined/null/objeto → cadena vacía (nunca 'undefined')", limpiarClave(undefined) === "" && limpiarClave(null) === "" && limpiarClave({} as any) === "");
}

console.log("\n2. CADA FALLO TIENE SU FRASE (y su culpable)");
// ════════════════════════════════════════════════════════════════════════
{
  const r401 = diagnosticoCatalogo({ provider: "deepseek", status: 401, cuerpo: '{"error":{"message":"Authentication Fails"}}' });
  check("401 → la clave no fue aceptada, y pide revisarla", r401.causa === "clave-rechazada" && r401.revisarClave);
  check("…la frase nombra el proveedor y el estado", /deepseek/.test(r401.linea) && /401/.test(r401.linea));
  check("…y trae el recorte del proveedor para diagnosticar", /Authentication Fails/.test(r401.linea));

  const r402 = diagnosticoCatalogo({ provider: "deepseek", status: 402, cuerpo: "Insufficient Balance" });
  check("402 → dice que la clave sirve y no hay saldo (no manda a revisar la clave)", r402.causa === "sin-saldo" && !r402.revisarClave);

  const r429 = diagnosticoCatalogo({ provider: "groq", status: 429 });
  check("429 → límite de peticiones, no culpa a la clave", r429.causa === "cuota" && !r429.revisarClave);

  const r503 = diagnosticoCatalogo({ provider: "mistral", status: 503, cuerpo: "upstream down" });
  check("5xx → el proveedor está caído y lo dice con esas palabras", r503.causa === "proveedor-caido" && /No es tu clave/.test(r503.linea));

  const rRed = diagnosticoCatalogo({ provider: "deepseek", errorRed: "This operation was aborted", plazoMs: 8000 });
  check("sin respuesta → da los segundos del plazo", rRed.causa === "sin-respuesta" && /8 s/.test(rRed.linea));
  check("…y no manda a revisar una clave que nunca se juzgó", !rRed.revisarClave);

  const rFmt = diagnosticoCatalogo({ provider: "deepseek", status: 200, cuerpo: { object: "list" } });
  check("200 sin lista → lo dice como problema de formato", rFmt.causa === "formato");

  check("ninguna frase se lleva la clave (solo estado y cuerpo)",
    ![r401, r402, r429, r503, rRed, rFmt].some((d) => /sk-|Bearer [A-Za-z0-9]/.test(d.linea)));
  check("un cuerpo enorme no se come la consola",
    diagnosticoCatalogo({ provider: "x", status: 500, cuerpo: "a".repeat(5000) }).linea.length < 260);
}

console.log("\n3. EL CATÁLOGO NUNCA VIAJA VACÍO, Y EL MOTIVO VIAJA CON ÉL");
// ════════════════════════════════════════════════════════════════════════
{
  const estaticos = [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }];
  const diag = diagnosticoCatalogo({ provider: "deepseek", status: 401, cuerpo: "Authentication Fails" });
  const r = respuestaCatalogo({ provider: "deepseek", estaticos, diagnostico: diag });
  check("con la clave rechazada se sigue viendo el catálogo guardado", r.models.length === 2 && r.total === 2);
  check("…marcado como fallback (no como catálogo normal)", r.source === "static-fallback");
  check("…y con el motivo pegado al cuerpo de la respuesta", typeof r.motivo === "string" && /401/.test(r.motivo!));

  const vivo = respuestaCatalogo({ provider: "deepseek", estaticos, enVivo: [{ id: "deepseek-chat" }, { id: "deepseek-v3.2" }] });
  check("en vivo: suma sin duplicar", vivo.total === 3 && vivo.source === "live+static");
  check("en vivo no arrastra motivo (no hay nada que explicar)", vivo.motivo === undefined);

  const sinClave = respuestaCatalogo({ provider: "deepseek", estaticos });
  check("sin clave y sin fallo → catálogo estático a secas", sinClave.source === "static" && sinClave.motivo === undefined);
  check("estáticos ausentes no rompen el sobre", respuestaCatalogo({ provider: "x", estaticos: undefined as any }).total === 0);
}

console.log("\n4. EL CABLE · el backend deja de devolver un 200 mudo");
// ════════════════════════════════════════════════════════════════════════
{
  const rutas = fs.readFileSync(path.join(RAIZ, "server/routers/modelos.ts"), "utf-8");
  const bloque = rutas.slice(rutas.indexOf('app.get("/api/cloud/models"'), rutas.indexOf('app.get("/api/custom/models"'));
  check("la clave de nube se limpia antes de viajar", /const apiKey = limpiarClave\(/.test(bloque));
  check("el fallo se diagnostica, no se traga en un catch vacío", /diagnosticoCatalogo\(/.test(bloque) && !/\} catch \{\}/.test(bloque));
  check("la respuesta sale por el sobre que lleva el motivo", /respuestaCatalogo\(\{/.test(bloque));
  check("el catálogo de nube ya no se pide sin plazo de catálogo", /plazoMs: PLAZO_CATALOGO_MS/.test(bloque));

  const app = fs.readFileSync(path.join(RAIZ, "src/App.tsx"), "utf-8");
  check("la interfaz muestra el motivo cuando el backend lo manda", /data\?\.motivo/.test(app) && /setAvisoCatalogo\(motivo/.test(app));
}

console.log(`\n—— catalogoNube: ${ok} correctas · ${mal} fallidas ——`);
if (mal) { console.log("\nFALLOS:"); for (const f of fallos) console.log(`  · ${f}`); }
process.exitCode = mal ? 1 : 0;
