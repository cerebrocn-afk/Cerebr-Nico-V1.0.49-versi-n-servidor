/**
 * tests/devSinVite.test.ts — EL DEV PUEDE SACAR A VITE DEL PROCESO (v2.2.1)
 * ==========================================================================
 * EL HECHO QUE LO CAMBIA TODO
 * ---------------------------
 * En el modo `dev` de siempre, Vite corre con `middlewareMode: true` **dentro del
 * mismo proceso** que contesta `/api/coreo`, `/api/telemetry/ports` y
 * `POST /api/ai/stream`. Y el HMR está **desactivado a propósito** (el comentario
 * de server.ts lo dice: el usuario recarga a mano). O sea: el proceso paga la
 * transformación de ~330 módulos por demanda sin ganar nada de hot reload.
 *
 * Consecuencia medida en la máquina de Mario (log del 03/11): la cabecera dijo
 * «servidor local caído», el panel de puertos quedó en STANDBY y el mensaje no
 * salía — no porque el motor estuviera mal (`:11434 OK`, puente :5000 listo), sino
 * porque el latido caduca a 2,8 s (INTERVALO_LATIDO_MS = 700 × CADUCIA_LATIDO = 4)
 * y el bucle estaba ocupado transformando módulos.
 *
 * LA SALIDA QUE YA EXISTÍA
 * ------------------------
 * server.ts decide con una función pura (`modoArranque.veredictoArranqueSinVite`)
 * y, cuando toca servir producción, resuelve `process.cwd()/dist`. Entonces no hay
 * que escribir lógica nueva: alcanza con correr el server de fuente con
 * `NODE_ENV=production` después de compilar el frente. Eso es `npm run dev:sin-vite`.
 *
 * Esta valla es mayormente estructural (lo que se puede probar sin `node_modules`),
 * pero el decision-making sí se corre: es puro.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { veredictoArranqueSinVite } from "../src/engine/modoArranque";

const leer = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const pkg = JSON.parse(leer("package.json"));
const server = leer("server.ts");

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

console.log("\n── 1. El camino nuevo existe y hace lo que dice ──");

prueba("★ `dev:sin-vite` corre el server de fuente con NODE_ENV=production", () => {
  const s = pkg.scripts["dev:sin-vite"];
  assert.ok(s, "no existe el script dev:sin-vite");
  assert.match(s, /NODE_ENV=production/, "sin NODE_ENV=production el server monta Vite igual");
  assert.match(s, /tsx server\.ts/, "debe correr la fuente (tsx), no el bundle: si no, es `start`");
});

prueba("★ el pre-compila el frente, así `dist/index.html` existe antes de servir", () => {
  const pre = pkg.scripts["predev:sin-vite"];
  assert.ok(pre, "no hay predev:sin-vite");
  assert.match(pre, /vite build/, "el pre no compila el frente: serviría producción sin cliente (pantalla blanca)");
});

prueba("el server en producción resuelve `process.cwd()/dist` (la bandera tiene efecto real)", () => {
  assert.match(server, /let distPath = path\.join\(process\.cwd\(\), "dist"\);/,
    "la rama de producción no resuelve dist/ relativo al cwd: NODE_ENV=production no serviría el frente");
});

prueba("★ y si no hay frente compilado, lo dice en vez de quedar mudo", () => {
  assert.match(server, /MODO PRODUCCIÓN SIN CLIENTE COMPILADO/,
    "sin este aviso, un dev:sin-vite sin build previo es una pantalla en blanco sin explicación");
});

console.log("\n── 2. El veredicto (puro, se corre de verdad) ──");

prueba("con dist al lado, el veredicto es servir producción y NO montar Vite", () => {
  const v = veredictoArranqueSinVite({
    distHermano: "C:/app/dist/index.html",
    distHermanoExiste: true,
    nodeEnv: "production",
    viteError: "Cannot find package 'vite'",
  });
  assert.equal(v.servirProduccion, true, "habiendo dist, no tiene sentido meterse en Vite");
  assert.ok(Array.isArray(v.avisos) && v.avisos.length > 0, "debe AVISAR que está sirviendo producción");
});

prueba("sin dist y sin Vite, se declara muerto en vez de abrir un puerto sordo", () => {
  const v = veredictoArranqueSinVite({
    distHermano: "C:/app/dist/index.html",
    distHermanoExiste: false,
    nodeEnv: "production",
    viteError: "Cannot find package 'vite'",
  });
  assert.equal(v.servirProduccion, false, "un puerto que anuncia y no sirve es peor que no arrancar");
});

console.log("\n── 3. No toqué lo que ya funcionaba ──");

prueba("★ `dev` sigue igual que siempre (Vite en el proceso, con su hot-transform)", () => {
  assert.equal(pkg.scripts["dev"], "tsx server.ts", "cambiar `dev` en silencio le muda el modo a Mario");
});

prueba("vite.config.ts no se tocó: la interfaz sigue siendo la del árbol de Mario", () => {
  const v = leer("vite.config.ts");
  assert.ok(v.length > 500, "vite.config.ts está sospechosamente chico");
  assert.doesNotMatch(v, /warmupClient|server:\s*\{[\s\S]*warmup/,
    "si alguien sumó warmup acá, esta valla debe actualizarse CON explicación, no en silencio");
});

console.log(`\n═══ devSinVite: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}
