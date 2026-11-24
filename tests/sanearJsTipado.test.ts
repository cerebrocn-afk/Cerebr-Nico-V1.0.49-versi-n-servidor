/**
 * tests/sanearJsTipado.test.ts — npx tsx tests/sanearJsTipado.test.ts
 *
 * v1.60.18 — SANEADO JS↔TS (regresión del fallo REAL «no puede crear un
 * juego», sesión del 20/10). El modelo escribía game.js con sintaxis TS
 * (anotaciones `:tipo`, `as`); el cargador `js` de esbuild lo rechazaba
 * («Expected ";" but found ":"»), el SYNC lo descartaba por no ser crítico y el
 * juego NUNCA aparecía — preview en negro→blanco con unas letras sueltas.
 *
 * guardYSanear(path, content, transform) debe: si un archivo de familia JS
 * falla su cargador nativo pero parsea limpio como TS, TRANSPILAR a JS corriente
 * y devolver {sanado:true, contenido:<js>, guard.ok:true}. En cualquier otro
 * caso conserva EXACTO el comportamiento previo (no sana, no escribe).
 *
 * Puro: sin red, sin fs, sin node_modules. El `transform` es un MOCK que imita
 * a esbuild (rechaza tipos en loader js/jsx; los quita en loader ts/tsx).
 */
import { guardYSanear, type FuncionTransform } from "../src/engine/syntaxGuard";

let ok = 0;
let fail = 0;
function af(nombre: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${nombre}`); }
  else { fail++; console.error(`  \u2717 ${nombre}`); }
}

console.log("sanearJsTipado — un .js con sintaxis TS se transpila y se sincroniza");

// ¿Hay una anotación de tipo tipo `: Tipo` que esbuild rechazaría como JS puro?
function tieneTipos(src: string): boolean {
  return /\b(let|const|var|function|\))\s*[A-Za-z0-9_]*\s*:\s*[A-Za-z<>\[\]]+/.test(src) || /\bas\s+[A-Za-z]/.test(src);
}

// MOCK de esbuild.transform:
//  - loader js/jsx  → si hay tipos, lanza un error con forma de esbuild (.errors)
//  - loader ts/tsx  → «quita» los tipos (regex simple) y devuelve {code}
const transformMock: FuncionTransform = (async (code: string, opts: { loader: string; sourcefile: string }) => {
  const esTs = opts.loader === "ts" || opts.loader === "tsx";
  if (!esTs) {
    if (tieneTipos(code)) {
      throw { errors: [{ text: 'Expected ";" but found ":"', location: { line: 1 }, detail: "TS en un .js" }] };
    }
    return { code } as any;
  }
  // loader TS: borra anotaciones `: Tipo` y los `as Tipo`. Suficiente para el test.
  const limpio = code
    .replace(/:\s*[A-Za-z_][A-Za-z0-9_<>\[\]\. ]*(?=\s*[=,;)\n])/g, "")
    .replace(/\s+as\s+[A-Za-z_][A-Za-z0-9_<>\[\]\.]*/g, "");
  return { code: limpio } as any;
}) as unknown as FuncionTransform;

const JUEGO_TS = [
  "const puntuacion: number = 0;",
  "let jugador: string = 'P1';",
  "function sumar(a: number, b: number) { return a + b; }",
  "const total = sumar(puntuacion, 10);",
  "console.log(total, jugador);",
].join("\n");

const JUEGO_JS_PURO = [
  "const puntuacion = 0;",
  "let jugador = 'P1';",
  "function sumar(a, b) { return a + b; }",
  "console.log(sumar(puntuacion, 10), jugador);",
].join("\n");

(async () => {
  // 1) EL FALLO REAL: game.js con tipos TS → se sana y se escribe.
  const r1 = await guardYSanear("game.js", JUEGO_TS, transformMock);
  af("game.js con tipos TS queda SANEADO", r1.sanado === true);
  af("el contenido saneado ya NO lleva `: number`/`: string`", !/:\s*(number|string)\b/.test(r1.contenido));
  af("el guard devuelto del saneado es OK (se puede escribir)", r1.guard.ok === true);
  af("el contenido saneado conserva la lógica del juego", /function sumar/.test(r1.contenido) && /console\.log/.test(r1.contenido));

  // 2) .mjs y .jsx también son familia JS → también se sanean.
  const r2 = await guardYSanear("nivel.mjs", JUEGO_TS, transformMock);
  af(".mjs con tipos TS también se sanea", r2.sanado === true && r2.guard.ok === true);
  const r3 = await guardYSanear("vista.jsx", "const x: number = 1;\nexport const V = () => x;", transformMock);
  af(".jsx con tipos TS también se sanea (loader tsx)", r3.sanado === true);

  // 3) INVARIANTES: no se toca lo que ya funciona ni lo que no procede.
  const r4 = await guardYSanear("game.js", JUEGO_JS_PURO, transformMock);
  af("un .js ya correcto NO se sanea (sale tal cual)", r4.sanado === false && r4.contenido === JUEGO_JS_PURO && r4.guard.ok === true);

  // Un .ts no es familia JS: aunque fallara, aquí NO se transpila a js.
  const r5 = await guardYSanear("motor.ts", JUEGO_TS, transformMock);
  af("un .ts correcto como TS pasa sin sanear", r5.sanado === false);

  // Sin transform (sin node_modules): comportamiento previo intacto, no sana.
  const r6 = await guardYSanear("game.js", JUEGO_TS, null);
  af("sin parser disponible NO se sanea (se respeta el fallback)", r6.sanado === false && r6.contenido === JUEGO_TS);

  // Un .css roto no es JS: no se transpila aunque falle el guard.
  const r7 = await guardYSanear("estilo.css", "body { color: }", transformMock);
  af("un .css no entra en el saneado JS", r7.sanado === false);

  // 4) RED DE SEGURIDAD: si lo transpilado SIGUE sin pasar el guard, no se sana.
  //    transform que devuelve basura (todavía con tipos) al pedir loader ts.
  const transformRoto: FuncionTransform = (async (code: string, opts: { loader: string }) => {
    const esTs = opts.loader === "ts" || opts.loader === "tsx";
    if (!esTs) {
      if (tieneTipos(code)) throw { errors: [{ text: 'Expected ";" but found ":"', location: { line: 1 } }] };
      return { code } as any;
    }
    return { code } as any; // NO limpia → el re-guard volverá a fallar
  }) as unknown as FuncionTransform;
  const r8 = await guardYSanear("game.js", JUEGO_TS, transformRoto);
  af("si el transpilado sigue roto, NO se sana (no se escribe basura)", r8.sanado === false && r8.guard.ok === false);

  console.log(`\nResultado: ${ok} ok, ${fail} fail`);
  if (fail > 0) process.exit(1);
})();
