/**
 * tests/ecoLog.test.ts — v1.98.0 · EL ECO: LO MISMO, UNA VEZ
 * =========================================================
 * El log de Mario (31/10) tiene, por TURNO, 25 líneas idénticas de
 *   [aduana de salida] cuerpo saliente: ruta_usuario×17 (avisado, baja, C:\Use…dBox)
 * y una de `Capacidad SIN VERIFICAR` por cada request del ciclo. Cada una es
 * cierta; juntas tapan la alarma nueva que sí importa. La regla de la casa no es
 * «callarse»: es decirlo una vez y CONTAR el resto, sin perder la magnitud.
 *
 * Acá se prueba el mecanismo (reloj inyectado: nada se duerme) y, sobre todo,
 * que la aduana REAL lo usa — o sea que la valla no es un juguete separado del
 * sitio del delito.
 */
import { crearEco, eco, estadoEcos, limpiarEco, VENTANA_ECO_MS, REAFIRMAR_CADA } from "../src/engine/ecoLog";
import * as fs from "node:fs";
import * as path from "node:path";
import * as G from "../src/engine/guardaEgreso";

let correctas = 0;
const fallos: string[] = [];
function comprobar(que: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; return; }
  fallos.push(`${que}${detalle ? " — " + detalle : ""}`);
  console.log(`  ✗ ${que}${detalle ? " — " + detalle : ""}`);
}

const CLAVE_OR = "sk-or-v1-" + "0123456789abcdef".repeat(4); // 64 hex, forma real

// ─ 1 · el contrato básico ─────────────────────────────────────────────
{
  const e = crearEco({ ahora: () => 1000 });
  const r1 = eco(e, "aduana", "LA NOTA");
  comprobar("★ la primera vez se habla", r1.linea === "LA NOTA", JSON.stringify(r1));
  const r2 = eco(e, "aduana", "LA NOTA");
  comprobar("la repetida inmediata se CALLA pero se CUENTA", r2.linea === null && r2.veces === 2 && r2.suprimidas === 1, JSON.stringify(r2));
  // La nº 20 es la que reafirma (REAFIRMAR_CADA = 20): no es callarse para siempre.
  const gritos: string[] = [];
  for (let i = 3; i <= 21; i++) { const r = eco(e, "aduana", "LA NOTA"); if (r.linea) gritos.push(r.linea); }
  comprobar("★ no es callarse para siempre: la nº 20 se reafirma y la nº 21 vuelve al silencio", gritos.length === 1, JSON.stringify(gritos));
  comprobar("y la reafirmación trae el acumulado DENTRO de la línea", /×18 repetida\(s\) en silencio/.test(gritos[0] || ""), gritos[0]);
  const est = estadoEcos(e);
  comprobar("el tablero sabe lo que calló (y lo que habló)", est.claves === 1 && est.top[0].veces === 21 && est.top[0].suprimidas === 1, JSON.stringify(est));
}

// ─ 2 · la ventana manda, y el reloj entra por parámetro ────────────────
{
  let t = 0;
  const e = crearEco({ ahora: () => t });
  eco(e, "k", "L", 0);
  t = VENTANA_ECO_MS - 1;
  comprobar("dentro de la ventana: silencio", eco(e, "k", "L", t).linea === null, String(t));
  t = VENTANA_ECO_MS * 2;
  const r = eco(e, "k", "L", t);
  comprobar("★ cumplida la ventana, se vuelve a hablar CON la cuenta de lo callado", r.linea !== null && /×1 repetida\(s\) en silencio/.test(String(r.linea)), String(r.linea));
  comprobar("la ventana por defecto es la anunciada", VENTANA_ECO_MS === 60_000 && REAFIRMAR_CADA === 20, `${VENTANA_ECO_MS}/${REAFIRMAR_CADA}`);
  const corta = crearEco({ ventanaMs: 0 });
  const c1 = eco(corta, "x", "N", 5);
  const c2 = eco(corta, "x", "N", 5);
  comprobar("ventanaMs=0 no enmudece nunca: cada vez habla", c1.linea === "N" && c2.linea === "N", JSON.stringify({ c1: c1.linea, c2: c2.linea }));
  comprobar("y si nada se calló, nada se anuncia como callado", !String(c2.linea).includes("silencio"), String(c2.linea));
}

// ─ 3 · hechos distintos no son la misma línea ─────────────────────────
{
  const e = crearEco();
  eco(e, "capacidad:deepseek-v4-pro:103", "A", 0);
  const otra = eco(e, "capacidad:openrouter/auto:74", "B", 1);
  comprobar("★ otra clave = otro hecho: se dice, aunque sea el mismo segundo", otra.linea === "B", JSON.stringify(otra));
  const mismo = eco(e, "capacidad:deepseek-v4-pro:103", "A", 2);
  comprobar("la misma clave sigue en silencio", mismo.linea === null, JSON.stringify(mismo));
  limpiarEco(e);
  comprobar("limpiarEco olvida: después de un reinicio todo vuelve a presentarse", eco(e, "capacidad:deepseek-v4-pro:103", "A", 3).linea === "A");
  comprobar("un tablero vacío no inventa nada", estadoEcos(crearEco()).claves === 0 && estadoEcos(crearEco()).top.length === 0);
  comprobar("claves vacías no colapsan el tablero", (() => { const z = crearEco(); const a = eco(z, "", "v1", 0); const b = eco(z, "", "v1", 1); return a.linea === "v1" && b.linea === null; })());
}

// ─ 4 · ★ la aduana real deja de gritar 25 veces ───────────────────────
{
  const original = console.warn;
  let gritos: string[] = [];
  console.warn = (...args: any[]) => { gritos.push(args.map(String).join(" ")); };
  try {
    const init = { method: "POST", body: JSON.stringify({ model: "m", messages: [{ role: "user", content: CLAVE_OR }] }) } as unknown as RequestInit;
    limpiarEco(G.ecoAduana);
    G.sanearInit(init);
    const tras1 = gritos.length;
    for (let i = 0; i < 24; i++) G.sanearInit(init); // el ciclo de herramientas del turno
    comprobar("★ 25 requests de la misma aduana = 2 líneas (la 1ª + la reafirmación), no 25",
      tras1 === 1 && gritos.length === 2, `${gritos.length} gritos`);
    comprobar("la reafirmación carga la cuenta de lo callado", /×18 repetida\(s\) en silencio/.test(gritos[1] || ""), gritos[1]);
    comprobar("y el cuerpo sigue sanitizándose igual (el eco calla, no censura)", !String(G.sanearInit(init).body).includes(CLAVE_OR));
    // Otro hecho (otra regla/otro destino) sí tiene que oírse.
    const otro = { method: "POST", body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "mi ruta es C:\\Users\\BirdBox\\secreto.txt" }] }) } as unknown as RequestInit;
    const antes = gritos.length;
    G.sanearInit(otro);
    comprobar("★ un hallazgo DISTINTO se anuncia de inmediato (el eco no es mordaza)", gritos.length === antes + 1, `gritos=${gritos.length - antes}`);
    comprobar("la nota vieja se puede reconstruir (notaEgreso sigue intacta)", /aduana de salida/.test(G.notaEgreso("cuerpo", [{ regla: "ruta_usuario", veces: 3, accion: "avisado", severidad: "baja", muestra: "C:\u005cUse…dBox" } as any])), G.notaEgreso("cuerpo", [{ regla: "ruta_usuario", veces: 3, accion: "avisado", severidad: "baja", muestra: "x" } as any]));
    const est = estadoEcos(G.ecoAduana);
    comprobar("y la magnitud queda visible para quien la quiera leer", est.top[0].veces === 26 && est.suprimidasTotales >= 6, JSON.stringify({ veces: est.top[0].veces, sup: est.suprimidasTotales }));
  } finally {
    console.warn = original;
  }
}

// ─ 5 · los cables ──────────────────────────────────────────────────
{
  const leer = (q: string) => fs.readFileSync(path.resolve(process.cwd(), q), "utf8");
  const aduana = leer("src/engine/guardaEgreso.ts");
  comprobar("la aduana pasa por el eco en vez de console.warn directo",
    /const ecoNota = eco\(ecoAduana, nota, nota\)/.test(aduana) && /if \(ecoNota\.linea\) console\.warn\(ecoNota\.linea\)/.test(aduana));
  comprobar("★ y usa la NOTA como clave: si el hecho cambia (\u00d76 \u2192 \u00d717) vuelve a hablar",
    !/eco\(ecoAduana, "aduana"/.test(aduana));
  // v1.98.0 · EL TABLERO SE FUE DE server.ts: la valla no puede exigir que el
  // monolito arme la nota (le costaba 19 líneas y el techo de rutas lo iba a
  // reventar). Lo que se congela es el HECHO, que sigue siendo el mismo: una
  // línea por clave, ninguna impresión directa, y server.ts solo llama.
  const tablero = leer("server/routers/ecoTurno.ts");
  const srv = leer("server.ts");
  comprobar("capacidad SIN VERIFICAR tiene tablero y clave por modelo+juego",
    /publicar\(\s*`capacidad:\$\{nombre\}:\$\{minimo\}`/.test(tablero));
  comprobar("el recorte de historial también (tope+perfil, que es el hecho)",
    /`historial:\$\{d\.tope\}:\$\{d\.tier\}`/.test(tablero));
  comprobar("un solo tablero para el motor, creado arriba de todo",
    (tablero.match(/crearEco\(\)/g) || []).length === 1 && /const ecoTurno = crearEco\(\)/.test(tablero));
  comprobar("el módulo no imprime por fuera del eco",
    (tablero.match(/console\.(log|warn)/g) || []).length === 2 && /if \(!e\.linea\) return;/.test(tablero));
  comprobar("★ server.ts no reimprime esas dos notas (una sola dueña del texto)",
    !srv.includes("Capacidad SIN VERIFICAR") && !srv.includes("Historial recortado") &&
    /avisarCapacidadSinVerificar\(modelName, minimo\.length\)/.test(srv) && /avisarRecorteDeHistorial\(/.test(srv));
}

console.log(`\necoLog: ${correctas} correctas, ${fallos.length} fallos`);
if (fallos.length) { for (const f of fallos) console.log("  · " + f); process.exit(1); }
process.exit(0);
