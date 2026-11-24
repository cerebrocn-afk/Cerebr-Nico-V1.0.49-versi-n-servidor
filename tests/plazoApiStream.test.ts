/**
 * tests/plazoApiStream.test.ts — LA GUILLOTINA DE 20 s NO PUEDE CORTAR UN CHAT (v2.2.5)
 * =====================================================================================
 * DE DÓNDE SALE ESTA VALLA
 * -----------------------
 * Mario aportó `CN-cruce-de-datos.zip`, que trae el `server.ts` de la **v1.99.0**
 * (la versión que él recuerda funcionando). El diff completo contra el árbol de
 * hoy son 17 líneas, y la única con comportamiento es:
 *
 *     app.use("/api", plazoApi());            // v2.1.5
 *
 * Todo lo demás del monolito es el mismo. Es decir: no se rompió el motor, se le
 * agregó un plazo de 20 s a TODAS las rutas — incluidas dos que tardan más que
 * eso por diseño:
 *
 *   · `POST /api/ai/stream`: el `.bat` lanza Ollama con `OLLAMA_KEEP_ALIVE=5m`
 *     (línea 140; línea 22 lo aclara: «el modelo NO queda residente»). A los
 *     cinco minutos el modelo se descarga y el próximo mensaje paga la carga
 *     desde disco. Este proyecto ya midió ese costo: 28 s.
 *     28 s > 20 s → el reloj dispara con `headersSent === false` → 504 → en la
 *     pantalla «el mensaje no sale», sin rojo visible.
 *   · `GET /api/health/deep`: corre los cinco chequeos con su sondeo de Ollama.
 *     Cortarlo deja el splash en «consultando el estado del motor…», o sea el
 *     síntoma que el middleware decía venir a curar.
 *
 * Esta valla corre la función de decisión. No lee comentarios.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  plazoDeRuta,
  plazoApi,
  PLAZO_API_POR_DEFECTO_MS,
  RUTAS_LENTAS_POR_DISENO,
} from "../server/middleware/plazoApi";

const leer = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

let ok = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e: any) { fallos.push(`${nombre} → ${e?.message || e}`); console.log(`  ✗ ${nombre} — ${e?.message || e}`); }
}
const CARGA_MODELO_MS = 28000; // medido y documentado en server/estado/telemetria.ts

console.log("\n── 1. El caso que rompió el chat ──");

prueba("★ `/api/ai/stream` tiene plazo propio y supera la carga de un modelo frío", () => {
  const p = plazoDeRuta("/api/ai/stream");
  assert.ok(p.excepcion, "sin excepción, el stream cae en el plazo común de 20 s");
  assert.ok(p.ms > CARGA_MODELO_MS, `con ${p.ms} ms un modelo que carga en ${CARGA_MODELO_MS} ms muere antes del primer token`);
});

prueba("★ `/api/health/deep` no puede cortarse antes de que terminen los cinco chequeos", () => {
  const p = plazoDeRuta("/api/health/deep");
  assert.ok(p.excepcion, "el splash se queda en «consultando el estado del motor…»");
  assert.ok(p.ms > CARGA_MODELO_MS, `los chequeos incluyen el sondeo de Ollama: ${p.ms} ms no alcanza`);
});

prueba("y el plazo común sigue existiendo para las 180 rutas restantes", () => {
  assert.equal(PLAZO_API_POR_DEFECTO_MS, 20000, "20 s es el techo sano para una ruta normal");
  assert.equal(plazoDeRuta("/api/coreo").excepcion, false);
  assert.equal(plazoDeRuta("/api/coreo").ms, 20000);
});

console.log("\n── 2. La tabla, revisada una por una ──");

prueba("★ ninguna excepción es un comodín que absorba todo /api", () => {
  for (const e of RUTAS_LENTAS_POR_DISENO) {
    assert.ok(e.prefijo.startsWith("/api/") && e.prefijo.length > 5, `prefijo demasiado ancho: ${e.prefijo}`);
    assert.ok(e.prefijo !== "/api", "una entrada «/api» borra el middleware entero");
    assert.ok(e.porque.length > 20, `${e.prefijo} está en la tabla sin justificar POR QUÉ tarda`);
  }
});

prueba("las rutas que ya tienen plazo interno propio NO necesitan excepción", () => {
  // /api/ollama/models aborta sus sondas a los CN_PLAZO_TAGS_MS (9 s por defecto),
  // así que vive cómodo bajo el plazo común. Sumarlo a la tabla sería esconder una
  // ruta lenta de verdad.
  assert.equal(plazoDeRuta("/api/ollama/models").excepcion, false);
  const diag = leer("server/routers/diagnostico.ts");
  assert.ok(diag.includes("CN_PLAZO_TAGS_MS"), "si el plazo interno desapareció, esta valla tiene que revisarse");
});

prueba("★ la coincidencia más específica gana", () => {
  const t = plazoDeRuta("/api/ai/stream?x=1");
  assert.equal(t.excepcion, true, "la query string no puede evadir el plazo de la ruta");
  assert.equal(plazoDeRuta("/api/coreo?x=1").excepcion, false);
});

prueba("una ruta desconocida no hereda un plazo generoso", () => {
  assert.equal(plazoDeRuta("/api/se-sabe-que-no-existe").excepcion, false);
  assert.equal(plazoDeRuta("").ms, 20000);
});

console.log("\n── 3. El middleware levanta el reloj cuando la respuesta empieza ──");

prueba("★ el callback no responde si ya se estaban mandando bytes (un stream no está colgado)", () => {
  const src = leer("server/middleware/plazoApi.ts");
  // v1.0.24 · La guarda dejó de ser la comparación literal `res.headersSent` y
  // pasó a ser `puedeContestar(res)`: pregunta lo MISMO (¿el socket ya tiene
  // encabezado?) y además el cierre sin cuerpo, desde un único lugar que la
  // ficha y el middleware comparten. La valla no se ablanda — se re-ancla al
  // nombre nuevo y se comprueba que ese nombre exista de verdad.
  assert.match(src, /if \(!puedeContestar\(res\)\) return;/, "sin esta guarda, el 504 se monta en medio de un stream de tokens");
  assert.match(src, /import \{ puedeContestar \} from "\.\.\/\.\.\/src\/engine\/fichaUnica"/, "la guarda tiene que ser la de la ficha, no una copia suelta");
});

prueba("★ y suelta el timeout del socket al terminar (keep-alive no paga la culpa de la anterior)", () => {
  const src = leer("server/middleware/plazoApi.ts");
  assert.match(src, /res\.setTimeout\(0\)/, "un setTimeout de 20 s que queda montado sobre el socket mata la siguiente respuesta del mismo navegador");
  assert.match(src, /res\.once\("finish", soltar\)/);
});

prueba("el 504 dice el plazo que usó (un rojo con número es diagnóstico)", () => {
  assert.match(leer("server/middleware/plazoApi.ts"), /plazoMs: ms/);
});

prueba("el middleware es una función y se puede construir (no es solo texto)", () => {
  assert.ok(typeof plazoApi === "function");
  assert.ok(typeof plazoApi() === "function");
});

console.log("\n── 4. La prueba del diff: esto es lo único que cambió el servidor ──");

prueba("★ el diff de referencia está documentado en el paquete (esto no se borra de la memoria de la casa)", () => {
  const d = leer("documentacion/referencia-v1990/DIF-SERVER-v1.99.0-vs-actual.md");
  assert.match(d, /v1\.99\.0/);
  assert.match(d, /plazoApi/);
  assert.match(d, /8ed40261f7f55a615cb7f75292f2766f/); // el sha del paquete de referencia, para que cualquiera lo verifique
});

prueba("★ `plazoApi` está montado en server.ts y NO existía en la 1.99.0 (eso es la regresión)", () => {
  assert.match(leer("server.ts"), /app\.use\("\/api", plazoApi\(\)\)/);
  const doc = leer("documentacion/referencia-v1990/DIF-SERVER-v1.99.0-vs-actual.md");
  assert.match(doc, /17 l.neas|17 lineas/);
});

console.log(`\n═══ plazoApiStream: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}
