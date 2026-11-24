/**
 * tests/contextoBucle.test.ts — FASE 3 (v1.64.0)
 * ==============================================
 * Verifica el detector de ciclos VISIBLE:
 *   - periodo 1: una herramienta repetida (AAAA).
 *   - periodo N: un ciclo rotado A→B→C→D repetido ×N.
 *   - aviso a la 2ª vuelta, corte a la 4ª (respaldo duro).
 *   - FALSO POSITIVO: una obra exitosa REINICIA la secuencia.
 *   - el mensaje visible NO expone el hash de argumentos (separador \u0000).
 */
import assert from "node:assert";
import {
  nuevoContextoBucle,
  registrarPaso,
  evaluarContextoBucle,
  abrirTurnoBucle,
  detectarCiclo,
  mensajeContextoBucle,
  REPES_AVISO,
  REPES_CORTE,
  TOPE_TURNOS_EN_BUCLE,
  MAX_SECUENCIA,
} from "../src/engine/contextoBucle";

type Caso = { nombre: string; fn: () => void };
const casos: Caso[] = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });

// —— periodo 1: AAAA ——
prueba("periodo 1 — misma herramienta repetida se detecta como ciclo ×4", () => {
  const c = detectarCiclo(["a", "a", "a", "a"]);
  assert.ok(c, "debe detectar ciclo");
  assert.strictEqual(c!.periodo, 1);
  assert.strictEqual(c!.repeticiones, 4);
});

// —— periodo 4 rotado ——
prueba("periodo 4 — ciclo rotado A→B→C→D ×3 se detecta", () => {
  const seq = ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D"];
  const c = detectarCiclo(seq);
  assert.ok(c);
  assert.strictEqual(c!.periodo, 4);
  assert.strictEqual(c!.repeticiones, 3);
  assert.deepStrictEqual(c!.patron, ["A", "B", "C", "D"]);
});

prueba("cobertura mayor gana — AAAA es periodo 1 ×4, no periodo 2 ×2", () => {
  const c = detectarCiclo(["a", "a", "a", "a"]);
  assert.strictEqual(c!.periodo, 1);
});

// —— flujo completo con estado: aviso 2ª, corte 4ª ——
prueba("evaluar — aviso a la 2ª vuelta y corte a la 4ª", () => {
  const e = nuevoContextoBucle();
  const paso = (t: string) => { registrarPaso(e, t, false); return evaluarContextoBucle(e); };
  // ciclo de periodo 2: X Y
  paso("x\u0000{}"); let v = paso("y\u0000{}"); // 1ª vuelta completa
  assert.strictEqual(v.enBucle, false, "1 sola vuelta no es bucle");
  paso("x\u0000{}"); v = paso("y\u0000{}"); // 2ª vuelta
  assert.strictEqual(v.enBucle, true);
  assert.ok(v.mensaje, "a la 2ª vuelta debe avisar visiblemente");
  assert.strictEqual(v.debeCortar, false, "2ª vuelta aún no corta");
  // repetir hasta la 4ª
  paso("x\u0000{}"); paso("y\u0000{}"); // 3ª
  paso("x\u0000{}"); v = paso("y\u0000{}"); // 4ª
  assert.strictEqual(v.debeCortar, true, "a la 4ª vuelta debe recomendar cortar");
});

prueba("evaluar — no spamea el mismo aviso si el ciclo no crece", () => {
  const e = nuevoContextoBucle();
  registrarPaso(e, "a", false); registrarPaso(e, "a", false);
  const v1 = evaluarContextoBucle(e);
  assert.ok(v1.mensaje, "primer aviso presente");
  // sin añadir pasos nuevos, re-evaluar no debe emitir mensaje nuevo
  const v2 = evaluarContextoBucle(e);
  assert.strictEqual(v2.mensaje, undefined, "no repite el mismo aviso");
  assert.strictEqual(v2.enBucle, true);
});

// —— FALSO POSITIVO: obra exitosa reinicia ——
prueba("falso positivo — una obra exitosa REINICIA la secuencia", () => {
  const e = nuevoContextoBucle();
  registrarPaso(e, "read\u0000{}", false);
  registrarPaso(e, "read\u0000{}", false);
  // entre lecturas, una EDICIÓN exitosa (progreso real) reinicia
  registrarPaso(e, "edit\u0000{}", true);
  registrarPaso(e, "read\u0000{}", false);
  registrarPaso(e, "read\u0000{}", false);
  const v = evaluarContextoBucle(e);
  // solo quedan 2 lecturas tras el reinicio: periodo 1 ×2 → justo en el umbral de aviso
  // pero NO debe ser un ciclo largo falso que incluya las lecturas previas al progreso.
  assert.ok(e.secuencia.length <= 2, "la obra exitosa vació la secuencia previa");
  assert.ok(!v.debeCortar, "progreso real nunca fuerza corte");
});

prueba("falso positivo — editar→probar mientras cambia de verdad no es bucle", () => {
  const e = nuevoContextoBucle();
  for (let i = 0; i < 4; i++) {
    registrarPaso(e, "edit\u0000v" + i, true); // cada edición es progreso
    registrarPaso(e, "test\u0000{}", false);
  }
  const v = evaluarContextoBucle(e);
  assert.strictEqual(v.debeCortar, false, "progreso intercalado no debe cortar");
});

// —— mensaje visible ——
prueba("mensaje — muestra el nombre, NUNCA el hash de argumentos", () => {
  const ciclo = { periodo: 2, repeticiones: 3, patron: ["read_file\u0000{\"path\":\"a\"}", "memory_estado\u0000{}"] };
  const m = mensajeContextoBucle(ciclo as any);
  assert.ok(m.includes("read_file"), "incluye el nombre de la herramienta");
  assert.ok(m.includes("memory_estado"));
  assert.ok(!m.includes("\u0000"), "no filtra el separador");
  assert.ok(!m.includes('"path"'), "no filtra los argumentos");
  assert.ok(m.includes("3"), "menciona el número de vueltas");
});

// —— ventana acotada ——
prueba("MAX_SECUENCIA — la ventana no crece sin límite", () => {
  const e = nuevoContextoBucle();
  for (let i = 0; i < MAX_SECUENCIA + 20; i++) registrarPaso(e, "t" + (i % 7), false);
  assert.ok(e.secuencia.length <= MAX_SECUENCIA, "se respeta el tope de la ventana");
});

prueba("constantes — umbrales coherentes (aviso < corte)", () => {
  assert.ok(REPES_AVISO < REPES_CORTE, "se avisa antes de cortar");
});

// —— v1.65.0 — EL BUCLE QUE SOBREVIVE ENTRE TURNOS ——
const girar = (e: ReturnType<typeof nuevoContextoBucle>, n: number) => {
  // gira el ciclo A→B→C→D n veces, sin progreso (puro giro estéril)
  for (let k = 0; k < n; k++) for (const t of ["A", "B", "C", "D"]) registrarPaso(e, t + "\u0000{}", false);
};

prueba("cross-turno — el MISMO ciclo repetido tras «sigue» escala hasta cortar", () => {
  const e = nuevoContextoBucle();
  // TURNO 1: gira el ciclo 2 veces y se le corta el turno (no avanza)
  abrirTurnoBucle(e); girar(e, 2);
  let v = evaluarContextoBucle(e);
  assert.strictEqual(v.enBucle, true);
  assert.strictEqual(v.debeCortar, false, "dentro de un turno, 2 vueltas aún no cortan");
  // TURNO 2: el usuario dice «sigue» y el modelo VUELVE a girar el mismo ciclo
  abrirTurnoBucle(e); // conserva la secuencia del turno en bucle → turnosEnBucle=1
  assert.strictEqual(e.turnosEnBucle, 1, "el turno anterior en bucle sube la racha");
  girar(e, 2);
  v = evaluarContextoBucle(e);
  assert.ok(v.mensaje && v.mensaje.includes("turno(s) seguidos"), "el aviso dice que es el MISMO bucle entre turnos");
  // TURNO 3: insiste una vez más → racha alcanza el tope → corta
  abrirTurnoBucle(e);
  assert.ok(e.turnosEnBucle >= TOPE_TURNOS_EN_BUCLE, "racha alcanza el tope de turnos");
  girar(e, 2);
  v = evaluarContextoBucle(e);
  assert.strictEqual(v.debeCortar, true, "insistir con el mismo bucle entre turnos acaba cortando");
});

prueba("cross-turno FALSO POSITIVO — un turno con OBRA rompe la racha", () => {
  const e = nuevoContextoBucle();
  abrirTurnoBucle(e); girar(e, 2); // turno 1 en bucle
  // turno 2: en vez de repetir, el modelo HACE OBRA (progreso real)
  abrirTurnoBucle(e);
  assert.strictEqual(e.turnosEnBucle, 1);
  registrarPaso(e, "write_file\u0000{}", true); // obra exitosa
  // turno 3: arranca — como el turno 2 avanzó, la racha se reinicia
  abrirTurnoBucle(e);
  assert.strictEqual(e.turnosEnBucle, 0, "la obra del turno anterior rompe la racha entre turnos");
  assert.strictEqual(e.secuencia.length, 0, "y empieza en limpio");
});

prueba("cross-turno FALSO POSITIVO — preguntas distintas en turnos seguidos no cortan", () => {
  const e = nuevoContextoBucle();
  // tres turnos de UNA lectura distinta cada uno (consulta legítima, sin ciclo)
  for (let i = 0; i < 3; i++) {
    abrirTurnoBucle(e);
    registrarPaso(e, "read_file\u0000{path:'" + i + "'}", false);
    const v = evaluarContextoBucle(e);
    assert.strictEqual(v.debeCortar, false, "una sola lectura por turno nunca es bucle");
  }
  assert.strictEqual(e.turnosEnBucle, 0, "turnos sin ciclo no acumulan racha");
});

prueba("cross-turno — un turno SIN bucle entre dos con bucle resetea la racha", () => {
  const e = nuevoContextoBucle();
  abrirTurnoBucle(e); girar(e, 2);               // turno 1: bucle
  abrirTurnoBucle(e); registrarPaso(e, "x\u0000{}", false); // turno 2: un paso suelto, sin ciclo
  assert.strictEqual(e.turnosEnBucle, 1, "el turno 1 subía la racha");
  abrirTurnoBucle(e);                            // turno 3 arranca: el turno 2 no tenía ciclo
  assert.strictEqual(e.turnosEnBucle, 0, "un turno sin ciclo drena la racha");
  assert.strictEqual(e.secuencia.length, 0);
});

// —— runner ——
let pasados = 0;
const fallos: string[] = [];
for (const c of casos) {
  try { c.fn(); pasados++; console.log(`  ✓ ${c.nombre}`); }
  catch (e) { fallos.push(c.nombre); console.error(`  ✗ ${c.nombre}\n    ${(e as Error).message}`); }
}
console.log(`\ncontextoBucle: ${pasados}/${casos.length} OK`);
if (fallos.length) { console.error(`FALLOS: ${fallos.join(", ")}`); process.exit(1); }
