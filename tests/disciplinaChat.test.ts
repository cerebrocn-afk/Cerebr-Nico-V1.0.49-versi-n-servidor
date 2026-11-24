/**
 * disciplinaChat.test.ts — EL CHAT ES ESPAÑOL, NO UN VOLCADERO (v1.66.0)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/disciplinaChat.test.ts
 *
 * RAÍZ (sesión mistral-code-fim del 22/10): el chat se llenaba de bloques de
 * código y de comandos que debían ir al editor/terminal. Aquí se fija que los
 * BLOQUES cercados salen del chat convertidos en una nota de una línea, que el
 * código/comando se devuelve aparte para enrutarlo, y —CONTROL DE FALSO
 * POSITIVO— que un fragmento corto EN LÍNEA dentro de una frase NO se toca.
 * Lógica pura: sin red, sin disco. Corre sin node_modules.
 */
import {
  depurarChatParaUsuario,
  proporcionDeCodigoEnChat,
} from "../src/engine/disciplinaChat";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

console.log("\n[1] bloque de código con file=\"…\" sale del chat y se enruta al editor");
{
  const texto = 'Perfecto, aquí tienes el componente:\n```ts file="src/App.ts"\nconst a = 1;\nconst b = 2;\n```\nCon eso queda.';
  const r = depurarChatParaUsuario(texto);
  comprobar("un artefacto", r.artefactos.length === 1, String(r.artefactos.length));
  comprobar("tipo código", r.artefactos[0]?.tipo === "codigo", r.artefactos[0]?.tipo);
  comprobar("ruta detectada", r.artefactos[0]?.file === "src/App.ts", r.artefactos[0]?.file);
  comprobar("2 líneas contadas", r.artefactos[0]?.lineas === 2, String(r.artefactos[0]?.lineas));
  comprobar("el código ya no está en el chat", !r.chatLimpio.includes("const a = 1"), r.chatLimpio);
  comprobar("queda nota de editor", /código enviado al editor/.test(r.chatLimpio), r.chatLimpio);
  comprobar("la prosa sobrevive", r.chatLimpio.includes("Con eso queda"), r.chatLimpio);
}

console.log("\n[2] bloque bash sale del chat y se enruta a la terminal");
{
  const texto = "Instala y arranca:\n```bash\nnpm install\nnpm run dev\n```";
  const r = depurarChatParaUsuario(texto);
  comprobar("tipo comando", r.artefactos[0]?.tipo === "comando", r.artefactos[0]?.tipo);
  comprobar("nota de terminal", /comando enviado a la terminal/.test(r.chatLimpio), r.chatLimpio);
  comprobar("el comando ya no está crudo en el chat", !r.chatLimpio.includes("npm run dev"), r.chatLimpio);
}

console.log("\n[3] FALSO POSITIVO: fragmento corto EN LÍNEA no se toca");
{
  const texto = "Para compilar usa `npm run build` y luego revisa el resultado.";
  const r = depurarChatParaUsuario(texto);
  comprobar("sin artefactos", r.artefactos.length === 0, String(r.artefactos.length));
  comprobar("el inline sobrevive", r.chatLimpio.includes("`npm run build`"), r.chatLimpio);
  comprobar("nada purgado", r.caracteresPurgados === 0, String(r.caracteresPurgados));
}

console.log("\n[4] varios bloques mezclados: se enrutan todos, el orden se conserva");
{
  const texto = 'Mira:\n```js file="a.js"\nx\n```\ny corre:\n```sh\nls -la\n```';
  const r = depurarChatParaUsuario(texto);
  comprobar("dos artefactos", r.artefactos.length === 2, String(r.artefactos.length));
  comprobar("primero código", r.artefactos[0]?.tipo === "codigo", r.artefactos[0]?.tipo);
  comprobar("segundo comando", r.artefactos[1]?.tipo === "comando", r.artefactos[1]?.tipo);
}

console.log("\n[5] proporción de código como métrica honesta de ruido");
{
  const puro = "Hola, ¿qué tal el proyecto?";
  const ruidoso = 'texto\n```js\n' + "linea;\n".repeat(40) + "```";
  comprobar("prosa limpia ~0", proporcionDeCodigoEnChat(puro) === 0, String(proporcionDeCodigoEnChat(puro)));
  comprobar("volcado alto", proporcionDeCodigoEnChat(ruidoso) > 0.7, String(proporcionDeCodigoEnChat(ruidoso)));
}

console.log(`\nRESUMEN disciplinaChat: ${pasan} pasan, ${fallan} fallan`);
if (fallan) { console.error("FALLOS:\n - " + fallos.join("\n - ")); process.exit(1); }
console.log("OK disciplinaChat");
