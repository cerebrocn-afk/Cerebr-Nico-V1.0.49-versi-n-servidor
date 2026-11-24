/**
 * tests/patronesFallo.test.ts — AUTO-PROPUESTA (v1.76.0)
 * ======================================================
 * Congela la capa pura del contador de fallos repetidos por patrón:
 *   - clasificación contra texto REAL de errores del lazo y del puente;
 *   - normalización estable (mismo path con otro nombre → misma firma);
 *   - FALSO POSITIVO: el turno que reintentó 10 veces suma UNA ocurrencia;
 *   - propuesta recién con reincidencia entre turnos (≥3) y cooldown;
 *   - la redacción es parseable por Brain.detectarPropuestas (el formato que
 *     ya existía en la casa — el guardián de compatibilidad);
 *   - DEFECTO SEMBRADO: si el contador sumara por llamada en vez de por turno,
 *     el caso de 10 reintentos dispararía la propuesta en el turno 1 y esta
 *     suite se pone roja (es exactamente el falso positivo que curamos).
 */
import assert from "node:assert";
import {
  clasificarFallo,
  normalizarErrorFallo,
  contarPatron,
  decidirPropuesta,
  redactarPropuesta,
  clavePatron,
  UMBRAL_OCURRENCIAS,
  COOLDOWN_MS,
  type EstadoPatrones,
} from "../src/engine/patronesFallo";
import { Brain } from "../src/engine/brain";

type Caso = { nombre: string; fn: () => void };
const casos: Caso[] = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });

// —— clasificación: texto real, no opinión ——
prueba("clasifica ruta inexistente (ENOENT real de Windows y POSIX)", () => {
  assert.strictEqual(clasificarFallo("ENOENT: no such file or directory, open 'C:\\Users\\nico\\proy\\src\\app.ts'").patron, "ruta_inexistente");
  assert.strictEqual(clasificarFallo("Error: el archivo memoria_vieja.md no existe").patron, "ruta_inexistente");
});

prueba("clasifica permiso, timeout, red y cuota", () => {
  assert.strictEqual(clasificarFallo("EACCES: permission denied, mkdir '/etc/x'").patron, "permiso");
  assert.strictEqual(clasificarFallo("request timed out after 30000ms").patron, "timeout");
  assert.strictEqual(clasificarFallo("fetch failed: connect ECONNREFUSED 127.0.0.1:11434").patron, "red");
  assert.strictEqual(clasificarFallo("HTTP 429: This request requires more credits, can only afford 14303").patron, "cuota");
});

prueba("desconocido no inventa familia — y aun así es contable", () => {
  const c = clasificarFallo("algo rarísimo del motor 77 con código XZ");
  assert.strictEqual(c.patron, "desconocido");
  assert.ok(c.consejo.length > 10);
});

prueba("normalización estable: mismo defecto con otros nombres → misma nota", () => {
  const a = normalizarErrorFallo("ENOENT: no such file, open 'C:\\Users\\nico\\proy-a\\index.ts'");
  const b = normalizarErrorFallo("ENOENT: no such file, open 'C:\\Users\\juana\\proy-b\\main.ts'");
  // paths distintos → la firma normalizada coincide en su forma (refs→<ref>, dígitos→<n>)
  assert.ok(a.includes("<ref>") && b.includes("<ref>"));
  assert.strictEqual(clasificarFallo(a).patron, clasificarFallo(b).patron);
});

// —— contador por TURNO: el falso positivo curado ——
const mkErrorRuta = (n: string) => `ENOENT: no such file or directory, open '/proy/${n}.ts'`;

prueba("FALSO POSITIVO — 10 reintentos en el MISMO turno suman UNA ocurrencia", () => {
  const e: EstadoPatrones = {};
  const c = clasificarFallo(mkErrorRuta("a"));
  let entrada = contarPatron(e, "fs_read", c, "t1", 1000);
  for (let i = 0; i < 9; i++) entrada = contarPatron(e, "fs_read", c, "t1", 1000 + i);
  assert.strictEqual(entrada.total, 1, "el turno único no puede inflar el contador");
  assert.strictEqual(entrada.turnos.length, 1);
  // y por lo tanto NO propone en el turno 1 aunque el lazo haya girado 10 veces
  assert.strictEqual(decidirPropuesta(entrada, 1000).generar, false);
});

prueba("proponer requiere UMBRAL_OCURRENCIAS turnos DISTINTOS", () => {
  const e: EstadoPatrones = {};
  const c = clasificarFallo(mkErrorRuta("x"));
  let entrada = contarPatron(e, "run_command", c, "t1", 1000);
  assert.strictEqual(decidirPropuesta(entrada, 1000).generar, false);
  entrada = contarPatron(e, "run_command", c, "t2", 2000);
  assert.strictEqual(decidirPropuesta(entrada, 2000).generar, false, "2 de 3 todavía no");
  entrada = contarPatron(e, "run_command", c, "t3", 3000);
  assert.strictEqual(UMBRAL_OCURRENCIAS, 3);
  const d = decidirPropuesta(entrada, 3000);
  assert.strictEqual(d.generar, true);
  assert.strictEqual(d.motivo, "nueva");
});

prueba("cooldown: tras proponer no se repite hasta pasar el tope; la reincidencia reinsiste", () => {
  const e: EstadoPatrones = {};
  const c = clasificarFallo("connect ETIMEDOUT 10.0.0.5:5000");
  let entrada = contarPatron(e, "pc_exec", c, "t1", 1000);
  entrada = contarPatron(e, "pc_exec", c, "t2", 2000);
  entrada = contarPatron(e, "pc_exec", c, "t3", 3000);
  entrada.propuestoEn = 3000;
  assert.strictEqual(decidirPropuesta(entrada, 3000 + COOLDOWN_MS - 1).generar, false, "dentro del cooldown no");
  const re = decidirPropuesta(entrada, 3000 + COOLDOWN_MS + 1);
  assert.strictEqual(re.generar, true);
  assert.strictEqual(re.motivo, "reincidencia");
});

prueba("patrones distintos de la misma herramienta no se mezclan", () => {
  const e: EstadoPatrones = {};
  contarPatron(e, "fs_read", clasificarFallo("ENOENT: no such file '/a/b.ts'"), "t1", 1000);
  const c2 = contarPatron(e, "fs_read", clasificarFallo("EACCES: permission denied '/a/b.ts'"), "t1", 1000);
  assert.strictEqual(c2.patron, "permiso");
  assert.ok(e[clavePatron("fs_read", "ruta_inexistente")]);
  assert.strictEqual(e[clavePatron("fs_read", "ruta_inexistente")].total, 1);
});

// —— redacción compatible con el lector que YA existía ——
prueba("la propuesta redactada la LEE Brain.detectarPropuestas (compatibilidad de formato)", () => {
  const e: EstadoPatrones = {};
  const c = clasificarFallo(mkErrorRuta("z"));
  let entrada = contarPatron(e, "fs_write", c, "t1", 5000);
  entrada = contarPatron(e, "fs_write", c, "t2", 6000);
  entrada = contarPatron(e, "fs_write", c, "t3", 7000);
  const texto = redactarPropuesta("fs_write", entrada, c, "nueva");
  const propuestas = Brain.detectarPropuestas(texto);
  assert.strictEqual(propuestas.length, 1, "debe salir EXACTAMENTE una propuesta parseada");
  assert.ok(propuestas[0].motivo.includes("fs_write"));
  assert.ok(propuestas[0].bloque.includes("fs_write"));
  // el bloque debe ser una línea (el captor de Brain lee hasta el fin de línea)
  assert.ok(!propuestas[0].bloque.includes("\n"), "el bloque no puede traer saltos de línea");
});

prueba("DEFECTO SEMBRADO — si contar sumara por llamada, el reintento masivo propondría en el turno 1", () => {
  // Simula el contador MAL (suma por llamada) y exige que la decisión correcta
  // sea NO proponer: la suite queda roja el día que alguien borre la guarda
  // `turnos.includes(turno)` de contarPatron y la propuesta salte con 1 turno.
  const e: EstadoPatrones = {};
  const c = clasificarFallo(mkErrorRuta("w"));
  let entrada = contarPatron(e, "fs_read", c, "t1", 1000);
  for (let i = 0; i < 9; i++) entrada = contarPatron(e, "fs_read", c, "t1", 1000 + i);
  const dec = decidirPropuesta(entrada, 1000);
  assert.strictEqual(dec.generar, false, "10 reintentos de UN turno jamás proponen");
  assert.strictEqual(entrada.turnos.length, 1);
});

// —— runner ——
let pasados = 0;
const fallos: string[] = [];
for (const c of casos) {
  try { c.fn(); pasados++; console.log(`  ✓ ${c.nombre}`); }
  catch (e) { fallos.push(c.nombre); console.error(`  ✗ ${c.nombre}\n    ${(e as Error).message}`); }
}
console.log(`\npatronesFallo: ${pasados}/${casos.length} OK`);
if (fallos.length) { console.error(`FALLOS: ${fallos.join(", ")}`); process.exit(1); }
