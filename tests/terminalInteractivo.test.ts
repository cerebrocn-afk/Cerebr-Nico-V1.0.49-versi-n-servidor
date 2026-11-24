/**
 * terminalInteractivo.test.ts — SUITE DE LA TERMINAL PERSISTENTE
 * =============================================================
 * Se ejecuta con tsx (como el resto de suites del motor). Comprueba:
 *   1. Lógica pura: anillo, inactividad, normalización, shell por SO.
 *   2. Ciclo real: abrir shell → enviar → leer salida → estado persiste
 *      entre comandos → cerrar → límites.
 *
 * Registrar en scripts/validar.mjs como:
 *   { id: "terminal", archivo: "tests/terminalInteractivo.test.ts",
 *     que: "v1.x · TERMINAL PERSISTENTE: shell vivo entre comandos, búfer de anillo con tope, caducidad por inactividad, cierre idempotente y tope de sesiones" }
 */
import assert from "node:assert";
import {
  recortarAnillo, estaInactiva, shellPorDefecto, normalizarEntrada, LIMITES,
  abrirTerminal, enviarTerminal, leerTerminal, cerrarTerminal, listarTerminales,
  recolectar, _resetTodo,
} from "../src/engine/terminalInteractivo";

let pasadas = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); pasadas++; }

// — 1. LÓGICA PURA —
ok(normalizarEntrada("ls") === "ls\n", "añade salto de línea");
ok(normalizarEntrada("ls\n") === "ls\n", "no duplica salto");
ok(normalizarEntrada(123 as any) === "", "entrada no-string → vacío");
ok(estaInactiva(0, LIMITES.INACTIVIDAD_MS + 1), "detecta inactividad");
ok(!estaInactiva(0, 1000), "no caduca antes de tiempo");
ok(shellPorDefecto("win32").toLowerCase().includes("powershell") || shellPorDefecto("win32").toLowerCase().includes("cmd"), "shell Windows");
ok(shellPorDefecto("linux").length > 0, "shell Unix");
{
  const grande = "x".repeat(LIMITES.MAX_BUFER + 500);
  const r = recortarAnillo("", grande);
  ok(r.length <= LIMITES.MAX_BUFER + 40, "anillo respeta el tope");
  ok(r.includes("truncada"), "marca el truncado (no miente)");
  ok(recortarAnillo("ab", "cd") === "abcd", "concatena cuando cabe");
}

// — 2. CICLO REAL —
async function cicloReal() {
  _resetTodo();
  const esWin = process.platform === "win32";
  const a = abrirTerminal();
  ok(a.ok && !!a.id, "abre terminal");
  const id = a.id!;

  const eco = esWin ? "echo hola-cerebro" : "echo hola-cerebro";
  const r1 = await enviarTerminal({ id, data: eco, reposoMs: 700 });
  ok(r1.ok && (r1.salida || "").includes("hola-cerebro"), "ve la salida del eco");

  // Estado persistente: una variable definida sigue viva en el siguiente comando.
  if (!esWin) {
    await enviarTerminal({ id, data: "MIVAR=42", reposoMs: 300 });
    const r2 = await enviarTerminal({ id, data: "echo val=$MIVAR", reposoMs: 700 });
    ok((r2.salida || "").includes("val=42"), "el estado persiste entre comandos");
  }

  const vivas = listarTerminales();
  ok(vivas.some((t) => t.id === id), "aparece en el listado");

  const c = cerrarTerminal(id);
  ok(c.ok, "cierra");
  ok(cerrarTerminal(id).ok, "cerrar es idempotente");
  const r3 = await enviarTerminal({ id, data: "echo tarde", reposoMs: 200 });
  ok(!r3.ok, "enviar a una cerrada falla con mensaje");

  // Tope de sesiones.
  const abiertas: string[] = [];
  for (let i = 0; i < LIMITES.MAX_SESIONES; i++) { const x = abrirTerminal(); if (x.ok) abiertas.push(x.id!); }
  const extra = abrirTerminal();
  ok(!extra.ok, "respeta el tope de sesiones");
  _resetTodo();
  ok(recolectar() === 0, "tras reset no queda nada que recolectar");
}

cicloReal().then(() => {
  console.log(`\u2705 terminalInteractivo: ${pasadas} comprobaciones OK`);
}).catch((e) => {
  console.error("\u274c terminalInteractivo FALLÓ:", e);
  process.exit(1);
});
