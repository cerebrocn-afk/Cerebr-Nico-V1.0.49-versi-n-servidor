/**
 * tests/terminalShellSeguro.test.ts — npx tsx tests/terminalShellSeguro.test.ts
 *
 * v1.60.16 — REGRESIÓN DEL CRASH REAL (sesión 1792470300056, Windows): un
 * modelo pidió `terminal_abrir shell="bash"`; como en Windows no hay bash, el
 * ENOENT llegó por el evento `error` ASÍNCRONO de spawn y, sin listener, se
 * volvió excepción NO ATRAPADA → el guardián de estabilidad apagó el servidor
 * entero (de ahí que «ni Gemma local respondiera»: el proceso ya estaba muerto).
 *
 * Dos garantías:
 *  1) resolverShell (pura): en Windows un shell POSIX A SECAS cae al nativo;
 *     una ruta explícita y un shell en Linux se respetan.
 *  2) abrirTerminal con un shell inexistente NO lanza y NO deja el error sin
 *     manejar: la sesión queda cerrada con el motivo en el búfer.
 */
import { resolverShell, shellPorDefecto, abrirTerminal, leerTerminal, cerrarTerminal } from "../src/engine/terminalInteractivo";

let ok = 0;
let fail = 0;
function af(nombre: string, cond: boolean) {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fail++; console.error(`  ✗ ${nombre}`); }
}

console.log("terminalShellSeguro — el shell inexistente no tumba el servidor");

// 1) resolverShell (pura, con plataforma inyectada)
const winDefecto = shellPorDefecto("win32");
af("win: bash a secas cae al shell nativo", resolverShell("bash", "win32") === winDefecto);
af("win: sh a secas cae al shell nativo", resolverShell("sh", "win32") === winDefecto);
af("win: zsh a secas cae al shell nativo", resolverShell("zsh", "win32") === winDefecto);
af("win: ruta explcita de Git Bash se respeta",
  resolverShell("C:\\Program Files\\Git\\bin\\bash.exe", "win32") === "C:\\Program Files\\Git\\bin\\bash.exe");
af("win: powershell.exe se respeta", resolverShell("powershell.exe", "win32") === "powershell.exe");
af("linux: bash se respeta", resolverShell("bash", "linux") === "bash");
af("sin pedido: usa el defecto del SO", resolverShell(undefined, "win32") === winDefecto);
af("espacios en blanco = sin pedido", resolverShell("   ", "linux") === shellPorDefecto("linux"));

// 2) abrirTerminal con un shell que NO existe: no debe lanzar ni dejar el
//    evento `error` sin manejar. Se comprueba que la sesión acaba cerrada con
//    el motivo en el búfer (el ENOENT es asíncrono: damos una ventana corta).
async function main() {
  let lanzo = false;
  let r: { ok: boolean; id?: string; error?: string } = { ok: false };
  try {
    r = abrirTerminal({ shell: "__cn_shell_inexistente__" });
  } catch {
    lanzo = true;
  }
  af("abrirTerminal NO lanza aunque el shell no exista", !lanzo);
  af("abrirTerminal devuelve una sesión (el fallo llega asíncrono)", r.ok === true && !!r.id);

  // Esperamos a que el evento `error` asíncrono se dispare y lo capture el motor.
  await new Promise((res) => setTimeout(res, 300));

  const lect = r.id ? leerTerminal(r.id) : { ok: false, cerrada: false, salida: "" };
  af("la sesión quedó cerrada tras el ENOENT", lect.cerrada === true);
  af("el motivo del fallo quedó en el búfer", typeof lect.salida === "string" && /no se pudo abrir el shell|no existe/i.test(lect.salida || ""));

  if (r.id) cerrarTerminal(r.id);

  console.log(`\nResultado: ${ok} ok, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();
