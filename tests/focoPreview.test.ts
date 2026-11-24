/**
 * tests/focoPreview.test.ts — v1.87.1
 * Congela la política de foco del preview (el fix del Pac-Man trancado) y el
 * reconocimiento de la tecla de inicio por AMBAS vías (key + code).
 */
import assert from "node:assert";
import { decidirAccionFoco, esTeclaInicioJuego } from "../src/engine/focoPreview";

let n = 0;
function prueba(nombre: string, fn: () => void) {
  fn();
  n++;
  console.log("  \u2713 " + nombre);
}

// ── Política de foco ────────────────────────────────────────────
prueba("teardown SIEMPRE rescata la ventana (vivo o no)", () => {
  assert.equal(decidirAccionFoco("teardown", true).accion, "rescate-ventana");
  assert.equal(decidirAccionFoco("teardown", false).accion, "rescate-ventana");
});

prueba("carga viva enfoca el iframe (ESPACIO llega sin clic previo)", () => {
  assert.equal(decidirAccionFoco("carga-viva", true).accion, "foco-iframe");
});

prueba("RECARGA de preview vivo NO roba el teclado: foco-iframe (bug Pac-Man)", () => {
  assert.equal(decidirAccionFoco("recarga", true).accion, "foco-iframe");
});

prueba("recarga sin preview vivo no toca el foco", () => {
  assert.equal(decidirAccionFoco("recarga", false).accion, "nada");
});

prueba("clic y ratón encima sobre preview vivo enfocan el iframe", () => {
  assert.equal(decidirAccionFoco("click-usuario", true).accion, "foco-iframe");
  assert.equal(decidirAccionFoco("raton-encima", true).accion, "foco-iframe");
});

prueba("carga/clic sin preview vivo no enfocan algo inexistente", () => {
  assert.equal(decidirAccionFoco("carga-viva", false).accion, "nada");
  assert.equal(decidirAccionFoco("click-usuario", false).accion, "nada");
});

prueba("toda decisión lleva un motivo legible", () => {
  for (const ev of ["carga-viva", "recarga", "teardown", "click-usuario", "raton-encima"] as const) {
    const d = decidirAccionFoco(ev, true);
    assert.ok(typeof d.motivo === "string" && d.motivo.length > 0);
  }
});

// ── Tecla de inicio (ESPACIO por AMBAS vías) ────────────────────────────
prueba("ESPACIO por key (' ') arranca — la vía correcta", () => {
  assert.equal(esTeclaInicioJuego(" ", ""), true);
});

prueba("ESPACIO por code ('Space') arranca aunque key sea ' '", () => {
  assert.equal(esTeclaInicioJuego(" ", "Space"), true);
});

prueba("el pitfall: key === 'Space' es FALSO, no es un valor real de .key", () => {
  // Un juego que comprueba `e.key === 'Space'` NO detecta la barra: key es ' '.
  // Esta función NO lo da por válido para que quede claro el bug del game.js.
  assert.equal(" " === "Space", false);
});

prueba("Enter (key y Numpad) también arranca", () => {
  assert.equal(esTeclaInicioJuego("Enter", ""), true);
  assert.equal(esTeclaInicioJuego("", "NumpadEnter"), true);
});

prueba("una letra cualquiera NO arranca", () => {
  assert.equal(esTeclaInicioJuego("a", "KeyA"), false);
});

console.log("\nfocoPreview: " + n + " comprobaciones OK");
