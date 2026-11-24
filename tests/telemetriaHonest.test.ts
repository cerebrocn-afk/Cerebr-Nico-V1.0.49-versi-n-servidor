/**
 * tests/telemetriaHonest.test.ts — UNA LECTURA QUE NO LLEGÓ NO AFIRMA «CAÍDO» (v2.2.3)
 * ====================================================================================
 * LA PRUEBA SON LOS NÚMEROS, NO LA INTENCIÓN
 * ------------------------------------------
 * En la pantalla de Mario (03/11) convivían cuatro estados del mismo sistema:
 *
 *   cabecera    `:5000 OFF · 11434 OK · :5100 OFF`     ← `/api/telemetry/ports`
 *   izquierda   `3000 SIN RESPUESTA · 5000 STANDBY`    ← mezcla de las dos fuentes
 *   derecha     `Servicios 5/5 arriba`                 ← `interruptores.vivo`
 *   conmutador  `Modo Agente PC: ACTIVO`               ← NO mide: es una preferencia
 *
 * La incoherencia de fondo era de PRESUPUESTOS:
 *
 *   TELEMETRY_PROBE_MS  = 35 000 ms   ← deliberate, documentado: Ollama tarda 28 s
 *                                        cargando un modelo, y con menos el chip
 *                                        parpadeaba «11434 OFF» en cualquier charla
 *   CN_PLAZO_API_MS     = 20 000 ms   ← `plazoApi` corta la ruta y contesta 504
 *   poll del cliente    = 10 000 ms   ← `checkTelemetry` pide muestra cada 10 s
 *   caducidad del latido=  2 800 ms   ← y a los 2,8 s declara «servidor local caído»
 *
 * O sea: la ruta de telemetría podía tardar MÁS DEL DOBLE que el plazo que la mata.
 * El 504 llegaba antes de la muestra, `checkTelemetry` hace `if (res.ok)` con
 * `catch {}` vacío, y la cabecera seguía pintando la última lectura buena. La hoja
 * de ruta decía 15:44 con reloj 17:05: una hora y veinte de muestra vieja con cara
 * de estado vivo.
 *
 * LO QUE SE ARREGLÓ (y lo que NO)
 * -------------------------------
 * No se bajó el sondeo de Ollama: eso reabre el falso negativo que el propio
 * `server/estado/telemetria.ts` documenta desde v1.16, y un rojo falso enseña al
 * usuario a reiniciar Ollama en vano. Se acotó el **presupuesto total** de la ruta
 * (12 s, adentro de los 20 s del middleware) y lo que no terminó a tiempo se
 * reporta `sin_medir`. `resolverPuerto` — puro, se corre acá abajo — decide cómo se
 * dice: si antes estaba vivo, se CONSERVA el valor y se aclara que es heredado con
 * su edad; nunca se inventa un «caído» a partir de un silencio.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  haceTexto,
  resolverPuerto,
  PRESUPUESTO_TELEMETRIA_MS,
  PLAZO_SONDEO_LOCAL_MS,
  PLAZO_API_MS,
  TELEMETRY_PROBE_MS,
  TELEMETRY_CACHE_MS,
} from "../server/estado/telemetria";

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

const t0 = 1_700_000_000_000;

console.log("\n── 1. La aritmética de los plazos (la que estaba rota) ──");

prueba("★ el presupuesto de la ruta vive ADENTRO del plazo de la API", () => {
  assert.ok(
    PRESUPUESTO_TELEMETRIA_MS < PLAZO_API_MS,
    `presupuesto ${PRESUPUESTO_TELEMETRIA_MS} ms vs plazo ${PLAZO_API_MS} ms: si el presupuesto es mayor, la ruta siempre muere en 504 y el panel se congela`,
  );
  assert.ok(PLAZO_API_MS - PRESUPUESTO_TELEMETRIA_MS >= 4000, "sin margen, un GC o un disco lento vuelven a ganar la carrera");
});

prueba("★ los /health locales tienen plazo propio, más corto que el presupuesto", () => {
  assert.ok(PLAZO_SONDEO_LOCAL_MS < PRESUPUESTO_TELEMETRIA_MS);
  assert.ok(PLAZO_SONDEO_LOCAL_MS >= 3000, "3 s es el piso honesto: un FastAPI tibio contesta en 5 ms, pero bajo arranque tarda más");
});

prueba("★ NO se bajó el sondeo de Ollama (el falso «11434 OFF» ya se pagó)", () => {
  assert.equal(TELEMETRY_PROBE_MS, 35000, "35 s es deliberado: Ollama tarda 28 s con un modelo cargando");
  assert.ok(TELEMETRY_PROBE_MS > PRESUPUESTO_TELEMETRIA_MS, "por eso el total se topa aparte: la respuesta no espera a Ollama");
});

prueba("el client sondea más seguido de lo que la caché vence (se veía el efecto)", () => {
  const leerApp = leer("src/App.tsx");
  const m = leerApp.match(/setInterval\(\(\) => \{[\s\S]{0,200}?checkTelemetry\(\);[\s\S]{0,30}?\},\s*(\d+)\)/);
  assert.ok(m, "no se encontró el intervalo de telemetría en App.tsx");
  const intervalo = Number(m![1]);
  assert.ok(intervalo >= TELEMETRY_CACHE_MS, `poll de ${intervalo} ms contra caché de ${TELEMETRY_CACHE_MS} ms: casi todo poll pagaba sondeo completo`);
});

console.log("\n── 2. `resolverPuerto` corre de verdad ──");

prueba("★ tiempo agotado con lectura previa VIVA → se conserva viva y se declara heredada", () => {
  const r = resolverPuerto("sin_medir", { vivo: true, timestamp: t0 }, t0 + 4_800_000);
  assert.equal(r.vivo, true, "un timeout no es una prueba de que el servicio cayó");
  assert.equal(r.heredado, true);
  assert.match(r.motivo, /hace 1 h 20 min/, `la edad tiene que ser legible: «${r.motivo}»`);
});

prueba("★ la edad se lee sin hacer una cuenta (4800 s no es una respuesta)", () => {
  assert.equal(haceTexto(4_800_000), "hace 1 h 20 min");
  assert.equal(haceTexto(3_600_000), "hace 1 h");
  assert.equal(haceTexto(90_000), "hace 90 s");
  assert.equal(haceTexto(180_000), "hace 3 min");
  assert.equal(haceTexto(-5000), "hace 0 s", "un reloj que retrocede no puede decir una edad negativa");
});

prueba("tiempo agotado con lectura previa CAÍDA → caído, sin adornos", () => {
  const r = resolverPuerto("sin_medir", { vivo: false, timestamp: t0 }, t0 + 5_000);
  assert.equal(r.vivo, false);
  assert.equal(r.heredado, false, "no se está conservando un falso positivo");
});

prueba("★ tiempo agotado SIN lectura anterior → caído y dice que nunca se lo midió", () => {
  const r = resolverPuerto("sin_medir", undefined, t0);
  assert.equal(r.vivo, false);
  assert.match(r.motivo, /no se lo midio nunca/, "«sin embedder» y «nunca medido» no son lo mismo que «muerto»");
});

prueba("un rechazo de conexión SÍ es muerto (puerto cerrado ≠ sin respuesta)", () => {
  assert.equal(resolverPuerto("muerto", { vivo: true, timestamp: t0 }, t0).vivo, false, "ECONNREFUSED es evidencia, no silencio");
});

prueba("un puerto que contesta vuelve a ser vivo con el motivo limpio", () => {
  const r = resolverPuerto("vivo", { vivo: false, timestamp: t0 }, t0 + 1000);
  assert.equal(r.vivo, true);
  assert.equal(r.motivo, "");
  assert.equal(r.heredado, false);
});

prueba("la edad se redondea a segundos y nunca es negativa (reloj que retrocede)", () => {
  const r = resolverPuerto("sin_medir", { vivo: true, timestamp: t0 + 900_000 }, t0);
  assert.match(r.motivo, /hace 0 s/, r.motivo);
});

console.log("\n── 3. La ruta usa el presupuesto y no se traga el fallo ──");

prueba("★ /api/telemetry/ports topa el total con PRESUPUESTO_TELEMETRIA_MS", () => {
  const s = leer("server/routers/telemetria.ts");
  assert.match(s, /await Promise\.race\(\[terminan, tope\]\)/, "sin la carrera contra el tope, la ruta puede tardar 35 s y plazoApi gana");
  assert.match(s, /setTimeout\(r, PRESUPUESTO_TELEMETRIA_MS\)/);
});

prueba("★ la respuesta trae motivos, heredados e incompleto (la UI todavía no los pinta)", () => {
  const s = leer("server/routers/telemetria.ts");
  for (const campo of ["motivos", "heredados", "incompleto", "presupuestoMs"]) {
    assert.match(s, new RegExp(`\\b${campo}\\b`), `falta el campo ${campo}: sin él, la interfaz no puede decir cuándo mintió`);
  }
});

prueba("los campos booleanos de siempre siguen existiendo (no rompo Header ni LeftSidebar)", () => {
  const s = leer("server/routers/telemetria.ts");
  for (const k of ["port3000", "port3500", "port5000", "port5100", "port5102", "port11434", "lastChecked"]) {
    assert.match(s, new RegExp(`\\b${k}\\b`), `se perdió ${k}: Header.tsx y LeftSidebar.tsx leen ese campo`);
  }
});

prueba("una sonda que termina tarde actualiza la caché sin tocar la respuesta enviada", () => {
  assert.match(leer("server/routers/telemetria.ts"), /void terminan\.then\(/);
});

console.log("\n── 4. %CN_PYW%: tres usos, cero definiciones (bug real del .bat) ──");

prueba("★ CN_PYW se define ANTES de las tres ventanas de packs", () => {
  const b = leer("iniciar_todo_windows.bat").replace(/\r\n/g, "\n").split("\n");
  const definicion = b.findIndex((l) => /^\s*set\s+"CN_PYW=/.test(l));
  assert.ok(definicion > -1, "CN_PYW nunca se define: las tres ventanas entregan el .py a la asociación de archivos de Windows");
  const usos = b.map((l, i) => ({ l, i })).filter(({ l }) => /start[^\n]*%CN_PYW%/.test(l));
  assert.equal(usos.length, 3, `se esperaban 3 packs (:5100, :5102, :5103), hay ${usos.length}`);
  for (const { i, l } of usos) assert.ok(definicion < i, `el uso de la línea ${i + 1} es anterior a la definición: ${l.trim().slice(0, 60)}`);
});

prueba("★ y se define con el mismo intérprete resuelto que CN_PY (sin adivinar)", () => {
  const b = leer("iniciar_todo_windows.bat");
  assert.match(b, /set "CN_PYW=%CN_PY%"/, "pythonw sería otra autodetección: /b ya abre sin consola");
  assert.doesNotMatch(b, /pythonw\.exe/, "si alguien suma pythonw, la redirección a %CN_LOGS% hay que volver a probarla");
});

prueba("CN_PY no se tocó (la cadena de detección embebido → sistema → launcher)", () => {
  const b = leer("iniciar_todo_windows.bat");
  for (const etiqueta of [":py_embebido", ":py_sistema", ":py_launcher", ":py_listo"]) {
    assert.ok(b.includes(etiqueta), `se perdió ${etiqueta}`);
  }
});

prueba("★ el resto del contrato de ventanas sigue vivo (no rompí arranqueVentanas)", () => {
  const b = leer("iniciar_todo_windows.bat");
  assert.match(b, /1>> "%CN_LOGS%\\memoria\.log" 2>&1/);
  assert.match(b, /cmd \/k/);
});

console.log(`\n═══ telemetriaHonest: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}
