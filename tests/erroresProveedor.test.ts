// v1.60.4 · Test del humanizador de errores de proveedores en la nube.
// Ejecutar:  node /tmp/tsxrun/node_modules/.bin/tsx tests/erroresProveedor.test.ts
import { humanizarErrorProveedor } from "../src/utils/erroresProveedor";

let pasados = 0;
let fallados = 0;
function ok(nombre: string, cond: boolean, extra = "") {
  if (cond) { pasados++; console.log(`  ✓ ${nombre}`); }
  else { fallados++; console.error(`  ✗ ${nombre} ${extra}`); }
}

console.log("\n[erroresProveedor] AUTH / clave inválida");
{
  const r = humanizarErrorProveedor("openrouter", "deepseek/deepseek-r1:free", "401 User not found");
  ok("categoria=auth", r.categoria === "auth", `-> ${r.categoria}`);
  ok("esConfigUsuario=true", r.esConfigUsuario === true);
  ok("menciona Ranuras de API Keys", r.mensaje.includes("Ranuras de API Keys"));
  ok("conserva detalle crudo", r.mensaje.includes("401 User not found"));
  ok("usa etiqueta OpenRouter", r.mensaje.includes("OpenRouter"));
}

console.log("\n[erroresProveedor] AUTH / No auth credentials");
{
  const r = humanizarErrorProveedor("openrouter", "x", "No auth credentials found");
  ok("categoria=auth", r.categoria === "auth", `-> ${r.categoria}`);
}

console.log("\n[erroresProveedor] SALDO / 402");
{
  const r = humanizarErrorProveedor("openrouter", "x", "402 Insufficient credits");
  ok("categoria=saldo", r.categoria === "saldo", `-> ${r.categoria}`);
  ok("esConfigUsuario=true", r.esConfigUsuario === true);
}

console.log("\n[erroresProveedor] CUOTA / 429");
{
  const r = humanizarErrorProveedor("groq", "llama-3.3-70b", "429 Too Many Requests");
  ok("categoria=cuota", r.categoria === "cuota", `-> ${r.categoria}`);
  ok("etiqueta Groq", r.mensaje.includes("Groq"));
}

console.log("\n[erroresProveedor] MODELO / 404");
{
  const r = humanizarErrorProveedor("openrouter", "org/retirado", "404 model not found");
  ok("categoria=modelo", r.categoria === "modelo", `-> ${r.categoria}`);
}

console.log("\n[erroresProveedor] DESCONOCIDO / no pierde detalle");
{
  const r = humanizarErrorProveedor("openrouter", "x", "stream vacío (ningún token recibido)");
  ok("categoria=desconocido", r.categoria === "desconocido", `-> ${r.categoria}`);
  ok("esConfigUsuario=false", r.esConfigUsuario === false);
  ok("conserva motivo original", r.mensaje.includes("stream vacío"));
}

console.log("\n[erroresProveedor] vacío no revienta");
{
  const r = humanizarErrorProveedor("openrouter", "x", "");
  ok("categoria=desconocido", r.categoria === "desconocido");
  ok("mensaje no vacío", r.mensaje.length > 0);
}

console.log(`\n[erroresProveedor] RESULTADO: ${pasados} pasados, ${fallados} fallados`);
if (fallados > 0) process.exit(1);
