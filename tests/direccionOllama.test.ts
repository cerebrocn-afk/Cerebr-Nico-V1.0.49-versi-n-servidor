/**
 * tests/direccionOllama.test.ts — DÓNDE ESTÁ OLLAMA SE DECIDE EN UN SOLO SITIO (v2.2.2)
 * =====================================================================================
 * El 03/11 Mario reportó, con el servidor levantado y Ollama arriba: «servidor caído»,
 * «no cargan los modelos», «el embedding no carga», «el mensaje no sale». Cuatro
 * síntomas. La causa estaba en una línea:
 *
 *    const OLLAMA_DEFAULT = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
 *
 * `OLLAMA_HOST` es la variable con la que **Ollama decide dónde escuchar** — y el
 * `iniciar_todo_windows.bat` la pone en `0.0.0.0:11434`. Copiarla al client es salir
 * a llamar a una dirección de escucha: en Windows el intento no prospera, y encima
 * el valor no lleva protocolo, así que no era ni URL.
 *
 * Esta suite corre el resolutor de verdad (es puro: entra el entorno como argumento,
 * no se toca `process.env`). No es una valla de texto.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esDireccionDeEscucha, resolverOllama, urlBaseOllama, OLLAMA_POR_DEFECTO } from "../src/engine/direccionOllama";

const leer = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

let ok = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void) {
  try {
    fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e: any) {
    fallos.push(`${nombre} → ${e?.message || e}`);
    console.log(`  ✗ ${nombre} — ${e?.message || e}`);
  }
}

console.log("\n── 1. El caso que rompió todo ──");

prueba("★ `OLLAMA_HOST=0.0.0.0:11434` (la del .bat) se convierte en 127.0.0.1", () => {
  const r = resolverOllama({ OLLAMA_HOST: "0.0.0.0:11434" });
  assert.equal(r.base, "http://127.0.0.1:11434", `salió ${r.base}: llamar a 0.0.0.0 es no llamar a nadie`);
  assert.equal(r.origen, "OLLAMA_HOST");
  assert.ok(r.avisos.length > 0, "corregir en silencio es exactamente lo que hizo que esto tardara tanto en aparecer");
  assert.match(r.avisos.join(" "), /ESCUCHA/, "el aviso tiene que decir POR QUÉ se cambió");
});

prueba("★ y el resultado es una URL a la que se puede hacer fetch", () => {
  const r = resolverOllama({ OLLAMA_HOST: "0.0.0.0:11434" });
  const u = new URL(`${r.base}/api/tags`);
  assert.equal(u.protocol, "http:");
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, "11434");
});

console.log("\n── 2. Las otras formas en que la gente escribe esa variable ──");

const casos: [string, string, string?][] = [
  ["http://127.0.0.1:11434", "http://127.0.0.1:11434"],
  ["127.0.0.1:11434", "http://127.0.0.1:11434"],
  ["localhost:11434", "http://127.0.0.1:11434"],
  ["http://localhost:11434", "http://127.0.0.1:11434"],
  ["[::]:11434", "http://127.0.0.1:11434"],
  ["::", "http://127.0.0.1:11434"],
  ["192.168.1.40:11434", "http://192.168.1.40:11434"],
  ["http://ollama.micloud.com", "http://ollama.micloud.com:11434"],
];
for (const [entrada, esperada] of casos) {
  prueba(`★ «${entrada}» → ${esperada}`, () => {
    assert.equal(resolverOllama({ OLLAMA_HOST: entrada }).base, esperada);
  });
}

prueba("una dirección ajena NO se reescribe (Ollama en otra máquina es legítimo)", () => {
  const r = resolverOllama({ OLLAMA_HOST: "http://192.168.1.40:11434" });
  assert.equal(r.base, "http://192.168.1.40:11434");
  assert.deepEqual(r.avisos.filter((a) => /ESCUCHA/.test(a)), [], "no hay nada que corregir acá");
});

prueba("`localhost` se fija a IPv4 y lo dice (el ::1 es otro caso del mismo malentendido)", () => {
  const r = resolverOllama({ OLLAMA_HOST: "localhost:11434" });
  assert.match(r.avisos.join(" "), /::1/);
});

prueba("sin ninguna variable, el bucle invertido", () => {
  assert.equal(urlBaseOllama({}), OLLAMA_POR_DEFECTO);
});

prueba("★ `OLLAMA_URL` manda sobre `OLLAMA_HOST` (la nuestra no es ambigua)", () => {
  const r = resolverOllama({ OLLAMA_URL: "http://127.0.0.1:11435", OLLAMA_HOST: "0.0.0.0:11434" });
  assert.equal(r.base, "http://127.0.0.1:11435");
  assert.equal(r.origen, "OLLAMA_URL");
});

prueba("una porquería en el entorno no deja el server apuntando a la nada", () => {
  const r = resolverOllama({ OLLAMA_HOST: "no es una direccion" });
  assert.equal(r.base, OLLAMA_POR_DEFECTO, "mejor el valor sano por defecto que un destino imposible");
  assert.ok(r.avisos.length > 0);
});

prueba("esDireccionDeEscucha no se confunde con un host normal", () => {
  assert.equal(esDireccionDeEscucha("0.0.0.0"), true);
  assert.equal(esDireccionDeEscucha("::"), true);
  assert.equal(esDireccionDeEscucha("127.0.0.1"), false);
  assert.equal(esDireccionDeEscucha("localhost"), false);
  assert.equal(esDireccionDeEscucha(""), false);
});

console.log("\n── 3. Que nadie vuelva a leer OLLAMA_HOST crudo ──");

prueba("★ server.ts pasa por el resolutor (no copia la variable de escucha)", () => {
  const s = leer("server.ts");
  assert.match(s, /const OLLAMA_DEFAULT = __ollama\.base;/);
  assert.doesNotMatch(s, /const OLLAMA_DEFAULT = process\.env\.OLLAMA_HOST \|\|/,
    "volver a la forma vieja reabre el bug de los 4 síntomas");
  assert.match(s, /import \{ resolverOllama \} from "\.\/src\/engine\/direccionOllama";/);
});

prueba("★ embedderLocal pasa por la misma regla (el «embedding sin cargar» era lo mismo)", () => {
  const s = leer("src/engine/embedderLocal.ts");
  assert.match(s, /const BASE_POR_DEFECTO = \(\) => urlBaseOllama\(process\.env\);/);
  assert.doesNotMatch(s, /process\.env\.OLLAMA_HOST \|\| "http:\/\/127\.0\.0\.1:11434"/,
    "el embedder con su propia lectura de OLLAMA_HOST es la deriva que ya pagamos");
});

prueba("★ el veredicto se grita en el arranque (un arreglo mudo no se puede diagnosticar)", () => {
  assert.match(leer("server.ts"), /dirección de Ollama corregida/);
});

prueba("el plazo de /api/tags es regulable y el error dice a dónde se llamó", () => {
  const s = leer("server/routers/diagnostico.ts");
  assert.match(s, /CN_PLAZO_TAGS_MS/, "3,5 s fijos se cumplían con 44 modelos y disco frio");
  assert.match(s, /ollamaUrl: customUrl/, "un `{ models: [] }` sin dirección obligaba a adivinar");
  assert.match(s, /resolverOllama/, "/api/ollama/models debe normalizar ?url= con resolverOllama");
  assert.match(s, /candidatas/, "/api/ollama/models debe probar loopback alternativo (127.0.0.1 ↔ localhost)");
});

prueba("★ App.tsx respalda por /api/ollama/models incluso ante HTTP 403 (!res.ok) y usa fetchCritico", () => {
  const app = leer("src/App.tsx");
  const idx = app.indexOf("const fetchInstalledModels = useCallback(");
  assert.ok(idx > -1, "no se encontró fetchInstalledModels");
  const fin = app.indexOf("const fetchCustomModels = useCallback(", idx);
  const bloque = app.slice(idx, fin > idx ? fin : idx + 3500);
  assert.match(bloque, /if \(detected\.length === 0\)/, "un HTTP 403 (!res.ok) directo no entraba al catch y dejaba 0 modelos");
  assert.match(bloque, /fetchCritico\(`\/api\/ollama\/models\?url=/, "Ollama local no debe hacer cola detrás del semáforo cloud");
  assert.doesNotMatch(bloque, /\}, \[ollamaUrl, currentModel\]\)/, "depender de currentModel re-dispara la detección de arranque");
});

prueba("★ checkTelemetry no se recrea cuando cambia availableModels.length", () => {
  const app = leer("src/App.tsx");
  const idx = app.indexOf("const checkTelemetry = useCallback(");
  assert.ok(idx > -1, "no se encontró checkTelemetry");
  const fin = app.indexOf("const INTENTOS_UNIFICADA", idx);
  const bloque = app.slice(idx, fin > idx ? fin : idx + 1500);
  assert.match(bloque, /availableModelsCountRef\.current === 0/);
  assert.doesNotMatch(bloque, /\[availableModels\.length,\s*fetchInstalledModels\]/);
});

console.log(`\n═══ direccionOllama: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}
