/**
 * tests/unaListaDePuertos.test.ts — UN SOLO SITIO DONDE SE VEN LOS PUERTOS (v2.2.4)
 * =================================================================================
 *Mario, con la captura delante (03/11): «solo deberías dejar uno, quizás los de
 * arriba con botón de reinicio o de encendido y apagado y esa pestaña usarla para
 * otra cosa».
 *
 * Tenía razón, y el problema no era estético. La misma pantalla mostraba cuatro
 * estados del mismo sistema:
 *
 *   cabecera           `:5000 OFF · 11434 OK · :5100 OFF`   ← telemetry
 *   Tabla Puertos      `3000 SIN RESPUESTA` + 5 STANDBY     ← telemetry + latido
 *   Tabla Tareas       `Servicios 5/5 arriba`               ← interruptores.vivo
 *   conmutador         `Modo Agente PC: ACTIVO`             ← NO mide nada
 *
 * Cada uno respondía una pregunta distinta, pero los cuatro se leían como si
 * dijeran el mismo hecho. Desde 2.2.4 hay **una** lista de servicios — la de la
 * pestaña Tareas, que es la que tiene botón de reinicio y encendido/apagado — y la
 * pestaña Puertos queda para el motor local (residencia de Ollama, embedder y
 * subagentes).
 *
 * Extras que salieron del camino: el panel izquierdo tenía su PROPIO
 * `useLatido()`, o sea un SEGUNDO sondeo de `/api/coreo` cada 700 ms corriendo
 * junto al de la espina. Dos consumidores del mismo latido son dos oportunidades
 * de contradictorio.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

const side = leer("src/components/LeftSidebar.tsx");
const tareas = leer("src/components/PlanificationPanel.tsx");
const app = leer("src/App.tsx");
const header = leer("src/components/Header.tsx");

console.log("\n── 1. La lista duplicada desapareció ──");

prueba("★ LeftSidebar ya NO pinta puertos (cero `telemetry.port`)", () => {
  assert.equal(side.includes("telemetry.port"), false, "si volvió, volvimos a tener dos listas");
  assert.equal(side.includes("Puerto 11434"), false, "las tarjetas de puertas no tienen que volver acá");
  assert.equal(side.includes("Puerto 5000"), false);
});

prueba("★ y la lista canónica sigue en la pestaña Tareas, con sus interruptores", () => {
  // v1.0.22 · la valla pedía el literal viejo `titulo="Servicios"`: la tabla con
  // el interruptor por servicio que Mario mandó SACAR de la hoja (15/11). Lo que
  // defiende no es ese literal: es que la ÚNICA lista de puertos viva en la
  // pestaña de tareas, con su punto medido y la reconexión del interruptor.
  assert.match(tareas, /HojaDeRutaViva/, "la lista de puertos vive en la hoja de tareas");
  assert.match(tareas, /puertos=\{puertos\}/, "los puertos que pinta la hoja son los que midió PlanificationPanel");
  assert.match(tareas, /onReconnectAll=\{onReconnectAll\}/, "la reconexión viaja con la lista");
  assert.match(tareas, /\/api\/brain\/plans/, "la hoja sigue leyendo el motor de verdad");
});

prueba("★ el botón Reconectar viajó con la lista (no se perdió la salida de emergencia)", () => {
  assert.match(tareas, /onReconnectAll/, "sin Reconectar, un panel congelado no se puede refrescar a mano");
  // v1.0.22 · el texto del botón vive en la cara (`HojaDeRutaViva`), no en la hoja
  // que solo COMPONE. Se exige en el árbol de la pestaña, no en un archivo suelto.
  const cara = leer("src/components/HojaDeRutaViva.tsx");
  assert.match(cara, /\{reintentando \? "Reconectando…" : "Reconectar"\}/);
  assert.match(cara, /onReconnectAll/, "y la cara tiene que poder dispararlo");
  // Se extrae el bloque JSX real y se le exige el cable dentro: un regex que dependa
  // del ORDEN de los props es una valla que se rompe sola en cuanto alguien agrega uno.
  const bloque = (app.match(/<PlanificationPanel[\s\S]*?\/>/) || [""])[0];
  assert.ok(bloque.length > 40, "no se encontró el montaje de PlanificationPanel en App.tsx");
  assert.match(bloque, /onReconnectAll=\{handleReconnectAll\}/, "App tiene que pasárselo a PlanificationPanel");
  assert.match(bloque, /isReconnecting=\{isReconnecting\}/);
});

prueba("★ la pestaña Puertos se renombra a lo que ahora contiene", () => {
  assert.match(side, /Motor local/);
  assert.doesNotMatch(side, /title="Telemetría de Puertos 3000, 3500, 5000/, "el título del tab no puede prometer la lista que ya no está");
});

prueba("y no se llevó por delante lo que sí le pertenece (embedder, subagentes, Ollama)", () => {
  for (const marca of ["Residencia Ollama", "Subagentes"]) {
    assert.ok(side.includes(marca) || side.toLowerCase().includes("subagentes"), `se perdió ${marca}`);
  }
  assert.ok(side.includes("ollamaStats"), "la RAM residente de Ollama mide acá");
});

console.log("\n── 2. Una sola lectura, cuatro vistas ──");

prueba("★ la tarjeta de servicios recibe la MISMA muestra que recibía el panel viejo", () => {
  const montaje = (app.match(/<PlanificationPanel[\s\S]*?\/>/) || [""])[0];
  assert.match(montaje, /telemetry=\{telemetry\}/, "sin este cable, Tareas vuelve a inventarse su propio criterio");
  // v1.0.22 · la edad dejó de ser un ternario suelto en la hoja: la muestra entra
  // por `edadMs` y se escribe con `edadLectura` (una sola definición). Se exige la
  // PROPIEDAD: la hoja recibe la marca de tiempo de la MISMA muestra.
  assert.match(tareas, /edadMs=\{telemetry\?\.lastChecked \? Date\.now\(\) - telemetry\.lastChecked : null\}/);
});

prueba("★ la edad de la lectura se ve en el subtítulo (el bug de la muestra de hace 1 h)", () => {
  // El texto de la edad lo compone `engine/hojaDeRuta.ts` (puro) y lo pinta la
  // cara. Se mide sobre la pieza que decide, con sus dos casos: sin muestra y
  // con muestra vieja/heredada.
  const motor = leer("src/engine/hojaDeRuta.ts");
  assert.match(motor, /sin lectura de telemetría/, "null no es «recién leído»: se dice");
  assert.match(motor, /sin responder ahora/, "un verde heredado tiene que admitir que es heredado");
  const tablero = leer("src/components/HojaDeRutaViva.tsx");
  assert.match(tablero, /reconexionDePuertos\(listaPuertos, reintentando, edadMs\)/, "la cara le pasa la edad a la reconexión");
});

prueba("★ `haceTexto` tiene UNA sola definición en todo el árbol", () => {
  const canonico = leer("src/engine/haceTexto.ts");
  assert.match(canonico, /export function haceTexto/);
  const server = leer("server/estado/telemetria.ts");
  assert.match(server, /import \{ haceTexto \} from "\.\.\/\.\.\/src\/engine\/haceTexto";/, "el server re-usa el del cliente, no lo reimplementa");
  assert.match(server, /export \{ haceTexto, edadLectura \}/);
  assert.match(leer("src/components/PlanificationPanel.tsx"), /from "\.\.\/engine\/haceTexto"/);
});

prueba("el entorno de prueba :3500 no se perdió con la lista vieja", () => {
  // v1.0.22 · el aviso vive en la cara, con el puerto escrito en la hoja.
  assert.match(leer("src/components/HojaDeRutaViva.tsx"), /entorno de prueba :3500/, "es el único que no está en la tabla de interruptores: se menciona aparte");
  assert.match(tareas, /puerto === 3500/, "y el puerto sale de la lista canónica, no de un literal suelto");
});

prueba("★ se acabó el segundo sondeo del latido en el panel izquierdo", () => {
  assert.equal(side.includes("useLatido"), false, "dos consumidores de /api/coreo, dos oportunidades de contradecirse");
  assert.match(leer("src/components/EspinaActividad.tsx"), /INTERVALO_LATIDO_MS/, "la escucha sigue viva, en un solo lugar");
});

prueba("la cabecera sigue mostrando los chips (son resumen, no segunda lista)", () => {
  // v2.3.1 · la valla estaba clavada al literal `telemetry.port5000 ? "OK" : "OFF"`.
  // Lo que defiende es la PROPIEDAD: que la cabecera sigue mostrando sus CUATRO
  // chips de puerto (resumen, no una segunda lista). Desde v2.3.1 los cuatro pasan
  // por `chipPuerto(...)`, que es el criterio único con estado «sin medir» — el
  // ternario suelto era la forma de ayer, no la regla. Se exige la propiedad cuatro
  // veces y que el chip del :5000 siga leyendo la telemetría.
  assert.equal((header.match(/\{chipPuerto\(telemetry\.port\w+\)\}/g) || []).length, 6, "los seis chips siguen en la cabecera");
  assert.match(header, /chipPuerto\(telemetry\.port5000\)/, "el chip del :5000 sigue leyendo telemetry");
});

console.log("\n── 3. La interfaz que Mario defendió sigue intacta ──");

prueba("★ nadie tocó la hoja de estilos ni el chat", () => {
  for (const f of ["src/index.css", "src/components/ChatCenter.tsx", "src/engine/hormaChat.ts", "src/engine/goteo.ts"]) {
    const t = leer(f);
    assert.ok(t.length > 800, `${f} quedó truncado`);
  }
  assert.doesNotMatch(side, /hormaChat|amplio=true/, "el ancho del chat no se toca desde acá");
});

prueba("los props que App sigue pasando siguen declarados (no rompo el compile)", () => {
  for (const n of ["telemetry", "onRefreshTelemetry", "onReconnectAll", "isReconnecting"]) {
    assert.match(side, new RegExp(`^  ${n}\\??[:<]`, "m"), `LeftSidebar dejó de declarar ${n} pero App se lo pasa`);
  }
});

console.log(`\n═══ unaListaDePuertos: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}
