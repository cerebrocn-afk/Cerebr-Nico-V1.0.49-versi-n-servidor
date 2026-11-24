/**
 * tests/marcadorNoMarcaAuto.test.ts — EL MARCADOR NO PUEDE MARCAR AL ENRUTADOR (v2.2.9)
 * =====================================================================================
 * EL HECHO (Mario, 03/11): «se me cambiaba solo de modelo al CEREBRO/AUTO o a otro
 * que nunca contestaba».
 *
 * `src/utils/marcador.ts` ya filtraba ids internos (`fav-model-*`), proveedores
 * locales y embedders, y exigía clave por proveedor. Lo que NO filtraba era
 * `provider: "cerebro"` / `modelo: "cerebro/auto"`. Pero `cerebro/auto` no es un
 * modelo de proveedor: es el ENRUTADOR (CerebroDialecto / el Ecléctico). Metido en
 * la cola, el marcador lo elegía, mandaba ese string literal a un endpoint de nube
 * y no contestaba nadie; encima quedaba cuarentenado 12 minutos y se comía uno de
 * los 5 puestos de la ráfaga.
 *
 * SEGUNDO HECHO: `PATRON_FALLO_COM` trataba igual un 429 de cuota que un
 * «no llegó el primer byte». En los planes gratuitos el primer byte tarda; castigar
 * eso con 12 min vaciaba la cola entera. Acá se verifica la clasificación.
 *
 * Este archivo CORRE las funciones, no busca strings (salvo la anti-deriva).
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  colaDeMarcado,
  categoriaFallo,
  castigoDe,
  marcarComoNoContesto,
  enCuarentena,
  motivoColaVacia,
  CUARENTENA_CUOTA_MS,
  CUARENTENA_CAIDA_MS,
  CUARENTENA_LENTO_MS,
} from "../src/utils/marcador";

let ok = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void) {
  try { fn(); process.stdout.write("  \u2713 " + nombre + "\n"); ok++; }
  catch (e: any) { fallos.push(nombre + " \u2192 " + (e?.message || e)); process.stdout.write("  \u2717 " + nombre + "\n"); }
}
const clave = { mistral: true, zai: true, groq: true, openrouter: true, cerebro: true, gemini: false };
const fav = (modelId: string, provider: string) => ({ modelId, provider });

process.stdout.write("\n\u2550\u2550 marcadorNoMarcaAuto (v2.2.9) \u2550\u2550\n\n");

process.stdout.write("-- 1. El enrutador no va a la cola --\n");
prueba("★ `cerebro/auto` queda AFUERA de la cola aunque su proveedor tenga clave", () => {
  const cola = colaDeMarcado([fav("cerebro/auto", "cerebro"), fav("mistral-small", "mistral")], clave);
  assert.deepEqual(cola.map((c) => c.modelo), ["mistral-small"]);
});
prueba("★ un favorito del provider `cerebro` se descarta por proveedor también", () => {
  const cola = colaDeMarcado([fav("otra-cosa", "cerebro")], clave);
  assert.equal(cola.length, 0);
});
prueba("el match es sin importar mayúsculas ni espacios", () => {
  const cola = colaDeMarcado([fav(" Cerebro/Auto ", "cerebro"), fav("gemini-flash", "openrouter")], clave);
  assert.deepEqual(cola.map((c) => c.modelo), ["gemini-flash"]);
});
prueba("lo que sí es marcable sigue entrando (no rompí la cola vieja)", () => {
  const cola = colaDeMarcado(
    [fav("mistral-small", "mistral"), fav("zai-glm", "zai"), fav("groq-llama", "groq")],
    clave
  );
  assert.equal(cola.length, 3);
});
prueba("sin clave no entra (regla vieja, intacta)", () => {
  const cola = colaDeMarcado([fav("gemini-2.5", "gemini")], clave);
  assert.equal(cola.length, 0);
});

process.stdout.write("\n-- 2. Categorías: cuota no es lo mismo que lentitud --\n");
prueba("★ 429 / cuota / sin fondo = `cuota`", () => {
  for (const m of ["HTTP 429", "Rate limit exceeded", "cuota agotada", "insufficient credits", "402 Payment Required"])
    assert.equal(categoriaFallo(m), "cuota", m);
});
prueba("★ `timed out` / `no llegó el primer byte` = `lentitud` (no es muerte)", () => {
  for (const m of ["This operation was aborted", "timeout", "no llegó el primer byte", "AbortError"])
    assert.equal(categoriaFallo(m), "lentitud", m);
});
prueba("conexión rechazada = `caida`", () => {
  assert.equal(categoriaFallo("Failed to fetch"), "caida");
  assert.equal(categoriaFallo("ECONNREFUSED 127.0.0.1:5000"), "caida");
});
prueba("un error de lógica NO dispara el marcador (era la regla madre)", () => {
  assert.equal(categoriaFallo("Cannot read properties of undefined"), "logica");
  assert.equal(categoriaFallo(""), "logica");
});
prueba("★ el castigo de la lentitud es CERO: se reintenta, no se expulsa", () => {
  assert.equal(castigoDe("lentitud"), CUARENTENA_LENTO_MS);
  assert.equal(CUARENTENA_LENTO_MS, 0);
  assert.equal(castigoDe("cuota"), CUARENTENA_CUOTA_MS);
  assert.ok(castigoDe("caida") < CUARENTENA_CUOTA_MS, "la caída se revisa antes que la cuota");
});
prueba("★ marcar por lentitud NO deja al modelo en cuarentena", () => {
  marcarComoNoContesto("mistral-small", "lentitud");
  assert.equal(enCuarentena("mistral-small"), false);
});
prueba("marcar por cuota sí cuarentena, y es la condena larga", () => {
  marcarComoNoContesto("zai-glm", "cuota");
  assert.equal(enCuarentena("zai-glm"), true);
});
prueba("el default de `marcarComoNoContesto` sigue siendo cuota (llamadores viejos)", () => {
  marcarComoNoContesto("groq-llama");
  assert.equal(enCuarentena("groq-llama"), true);
});

process.stdout.write("\n-- 3. La cola vacía tiene explicación --\n");
prueba("sin favoritos: lo dice", () => {
  assert.match(motivoColaVacia([], clave), /ningún favorito/);
});
prueba("★ favoritos de proveedores sin clave: lo dice con el conteo", () => {
  assert.match(motivoColaVacia([fav("g1", "gemini"), fav("g2", "gemini")], clave), /2 favoritos.*sin clave/);
});
prueba("★ favoritos que son Cerebro/Auto: dice que no hay a quién marcar", () => {
  assert.match(motivoColaVacia([fav("cerebro/auto", "cerebro")], clave), /Cerebro\/Auto/);
});

process.stdout.write("\n-- 4. Anti-deriva (dos definiciones de Cerebro/Auto) --\n");
prueba("\u2605 el literal del marcador coincide con el del enrutador", () => {
  // `marcador.ts` no puede importar `enjambreEclectico`: el Ecléctico ya importa al
  // marcador, y un ciclo en el arranque del cliente es peor que el bug. La forma
  // de tener UNA verdad sin ciclo es comparar las fuentes en la prueba.
  const motor = readFileSync("src/engine/enjambreEclectico.ts", "utf8").replace(/\r/g, "");
  const m = motor.match(/export const MODELO_CEREBRO_AUTO = "([^"]+)"/);
  assert.ok(m, "enjambreEclectico ya no exporta MODELO_CEREBRO_AUTO: actualizá el literal del marcador");
  const marc = readFileSync("src/utils/marcador.ts", "utf8").replace(/\r/g, "");
  const l = marc.match(/MODELO_CEREBRO_LITERAL = "([^"]+)"/);
  assert.ok(l, "el marcador perdió su literal");
  assert.equal(l[1].toLowerCase(), m[1].toLowerCase(), "los dos literales de Cerebro/Auto se separaron");
});
prueba("el filtrado está realmente en el archivo (no solo en la prueba)", () => {
  const marc = readFileSync("src/utils/marcador.ts", "utf8").replace(/\r/g, "");
  assert.ok(/f\.provider !== "cerebro"/.test(marc), "no se filtra provider cerebro");
  assert.ok(marc.includes(String.raw`startsWith("cerebro/")`), "no se filtra el modelo del enrutador");
});

process.stdout.write("\n\u2550\u2550\u2550 marcadorNoMarcaAuto: " + ok + " correctas \u00b7 " + fallos.length + " fallidas \u2550\u2550\u2550\n");
if (fallos.length) { process.stdout.write("\nFALLOS:\n"); for (const f of fallos) process.stdout.write("  \u00b7 " + f + "\n"); process.exit ? process.exit(1) : process.exit(1); }
