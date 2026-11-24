/**
 * sanacionAutomatica.test.ts — v1.57.19 · SUITE DE CERTEZA: LA SANACIÓN AUTOMÁTICA
 * ==================================================================================
 * La cuarentena del fusible sólo VENCE por TTL: al minuto 2 el modelo vuelve sin
 * que nadie compruebe que volvió. La sanación verifica con una sonda fantasma
 * (1 token, keep_alive:0) y re-entrada medida. Fixture: los presupuestos reales
 * del escenario de aceptación (DeepSeek 192 s) y de la sesión (gemma4 480 s).
 * Entradas hostiles nombradas: tiempo NaN/0/negativo, ocupado=true, nube sin permiso.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../src/engine/sanacionAutomatica";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const T0 = 1_800_000_000_000;

let correctas = 0; let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `— ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

console.log("\n🩺 LA SANACIÓN AUTOMÁTICA — v1.57.19 (F1.5)\n");

const deepseek: S.EstadoSanacion = { modelo: "deepseek-coder:33b", esLocal: true, enCuarentenaDesde: T0, sondasFallidas: 0, presupuestoMs: 192_000 };
const gemma31: S.EstadoSanacion = { modelo: "gemma4:31b-cloud", esLocal: false, enCuarentenaDesde: T0, sondasFallidas: 0, presupuestoMs: 480_000 };

seccion("1 · El presupuesto de la SONDA (no el del trabajo real)");
{
  comprobar("un 192 s de trabajo → sonda con techo de 120 s", S.presupuestoSonda(192_000) === 120_000, String(S.presupuestoSonda(192_000)));
  comprobar("un 31B de 480 s → la sonda NO espera 8 minutos: 120 s", S.presupuestoSonda(480_000) === 120_000);
  comprobar("un modelo rápido conserva su p95 chico (40 s)", S.presupuestoSonda(40_000) === 40_000);
  comprobar("piso de 15 s si el p95 es ridículo", S.presupuestoSonda(3_000) === 15_000);
  comprobar("ENTRADA HOSTIL: presupuesto 0/NaN → tope prudente", S.presupuestoSonda(0) === 120_000 && S.presupuestoSonda(NaN as unknown as number) === 120_000);
}

seccion("2 · Cadencia con backoff: 5 · 10 · 20 · 30 (techo)");
{
  comprobar("1ª sonda a los 5 min", S.agendaDeSonda({ ...deepseek }) === 300_000);
  comprobar("tras 1 fallo: 10 min", S.agendaDeSonda({ ...deepseek, sondasFallidas: 1 }) === 600_000);
  comprobar("tras 2 fallos: 20 min", S.agendaDeSonda({ ...deepseek, sondasFallidas: 2 }) === 1_200_000);
  comprobar("tras 3+: techo de 30 min", S.agendaDeSonda({ ...deepseek, sondasFallidas: 9 }) === 1_800_000);
}

seccion("3 · ¿A quién le toca sonda? (con los candados del hardware)");
{
  comprobar("a los 2 min no le toca", S.sondasPendientes([deepseek], { ahora: T0 + 120_000 }).length === 0);
  comprobar("a los 5 min sí", S.sondasPendientes([deepseek], { ahora: T0 + 300_000 }).length === 1);
  comprobar("CANDADO 2: con el motor ocupado (turno/Gradle) NO se sondea", S.sondasPendientes([deepseek], { ahora: T0 + 600_000, ocupado: true }).length === 0);
  comprobar("CANDADO 4: nube sin permiso → sin sondas de nube", S.sondasPendientes([gemma31], { ahora: T0 + 600_000, permiteNube: false }).length === 0);
  comprobar("y con permiso, la nube sí entra (o el local siempre)", S.sondasPendientes([gemma31], { ahora: T0 + 600_000, permiteNube: true }).length === 1 && S.sondasPendientes([deepseek], { ahora: T0 + 600_000, permiteNube: false }).length === 1);
  comprobar("la sonda usa la ÚLTIMA sonda como referencia", S.sondasPendientes([{ ...deepseek, ultimaSonda: T0 + 240_000, sondasFallidas: 1 }], { ahora: T0 + 300_000 }).length === 0);
  comprobar("orden por antigüedad (el que más espera va primero)", S.sondasPendientes([{ ...deepseek, enCuarentenaDesde: T0 + 300_000 }, { ...deepseek, modelo: "otro", enCuarentenaDesde: T0 }], { ahora: T0 + 900_000 })[0].modelo === "otro");
}

seccion("4 · El veredicto: re-entrada medida, no por reloj");
{
  const sana = S.evaluarSonda(deepseek, 42_000, { ahora: T0 + 300_000 });
  comprobar("responde en 42 s (< 192 s de trabajo) → SANA", sana.veredicto === "sana");
  comprobar("la nota nombra el tiempo y el presupuesto", /42\.0 s/.test(sana.nota) && /192 s/.test(sana.nota), sana.nota);
  comprobar("y dice POR QUÉ sale: verificación, no reloj", /por verificación, no por reloj/.test(sana.nota));
  const lenta = S.evaluarSonda(deepseek, 150_000, { ahora: T0 + 300_000 });
  comprobar("150 s > los 120 s de la SONDA → sigue en cuarentena (aunque < 192 s de trabajo)", lenta.veredicto === "sigue", lenta.nota);
  comprobar("espacia el próximo intento a 10 min", lenta.proximaEnMs === 600_000);
  comprobar("ENTRADA HOSTIL: sin respuesta (0 s) → sigue, con el conteo", S.evaluarSonda(deepseek, 0, { ahora: T0 }).veredicto === "sigue" && /no respondió/.test(S.evaluarSonda(deepseek, 0, { ahora: T0 }).nota));
  comprobar("ENTRADA HOSTIL: tiempo negativo → sigue", S.evaluarSonda(deepseek, -5, { ahora: T0 }).veredicto === "sigue");
}

seccion("5 · El prompt fantasma no puede dejar el modelo en RAM");
{
  const cuerpo = S.CUERPO_SONDA("deepseek-coder:33b") as Record<string, unknown>;
  comprobar("prompt de 1 token", cuerpo.prompt === "ok" && (cuerpo.options as Record<string, unknown>).num_predict === 1);
  comprobar("keep_alive:0 → cargar y descargar (el candado de los 16 GB)", cuerpo.keep_alive === 0);
  comprobar("sin streaming", cuerpo.stream === false);
}

seccion("6 · Vallas: el daemon y el cableado (F1.5 tiene manos)");
{
  const daemon = leer("server/sanacionDaemon.ts");
  const servidor = leer("server.ts");
  const modulo = leer("src/engine/sanacionAutomatica.ts");
  comprobar("el daemon existe y sondea /api/generate", /api\/generate/.test(daemon));
  const soloImports = (src: string) => (src.match(/^import[^\n]*$/gm) || []).join("\n");
  comprobar("CANDADO 3: la sonda NO alimenta el p95 (ningún IMPORT la trae; el comentario que lo prohíbe sí la nombra)", !/registrarPrimerByte/.test(soloImports(daemon)) && !/registrarPrimerByte/.test(soloImports(modulo)));
  comprobar("el daemon cierra la cuarentena al sanar", /registrarExitoProveedor/.test(daemon));
  comprobar("el daemon re-arma si la sonda falla", /registrarFalloProveedor/.test(daemon));
  comprobar("server.ts arranca el daemon", /iniciarSanacionDaemon\(/.test(servidor));
  comprobar("server.ts marca la actividad del motor (candado 2)", /marcarActividadDelMotor\(\)/.test(servidor));
}

console.log(`\n═══ sanacionAutomatica: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
