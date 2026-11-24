/**
 * tests/indicadorServicios.test.ts — UN PUERTO, UN CRITERIO, UNA SONDA (v2.3.1)
 * =============================================================================
 * Se ejecuta con:  npx tsx tests/indicadorServicios.test.ts
 *
 * Trajo esta suite el pedido del 4/11: «en la interfaz existe un cuatriplicado de
 * función, los puertos, y todos dicen indicativos distintos». No era una impresión:
 * eran cuatro superficies con tres criterios y dos valores por defecto mentira
 * (ver la cabecera de `src/engine/indicadorServicios.ts`). Se congela ACÁ la
 * regla, no la sensación:
 *
 *   1. sin medición no hay afirmación — `sin-medir` no puede pintarse de verde;
 *   2. N consumidores escuchan, UN request se hace (el presupuesto de Chrome);
 *   3. todos los consumidores ven LA MISMA muestra, no su propia versión;
 *   4. un sondeo que falla no invierte la última verdad medida;
 *   5. el cable está puesto: la cabecera y el supervisor usan el criterio único
 *      y `/api/arranque/estado` ya no puede responder dos cosas distintas.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decidirIndicador,
  etiqueta,
  enContradiccion,
  describirServicio,
  crearSondaCompartida,
  TEXTO_INDICADOR,
  type Muestra,
} from "../src/engine/indicadorServicios";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos: string[] = [];
function c(que: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
}

console.log("\n1) El criterio: sin medición no hay afirmación\n");

c("`medido: false` con `vivo: true` NO es «arriba» (es el `!== false` del supervisor)",
  decidirIndicador({ medido: false, vivo: true }) === "sin-medir");
c("`medido: false` con `vivo: false` NO es «abajo»: tampoco se afirma",
  decidirIndicador({ medido: false, vivo: false }) === "sin-medir");
c("un mapa vacío leído como `undefined` sigue siendo «sin medir»",
  decidirIndicador(undefined) === "sin-medir" && decidirIndicador(null) === "sin-medir");
c("medido y vivo → «arriba», medido y caído → «abajo»",
  decidirIndicador({ medido: true, vivo: true }) === "arriba" && decidirIndicador({ medido: true, vivo: false }) === "abajo");
c("solo hay TRES estados: no existe un cuarto color",
  Object.keys(TEXTO_INDICADOR).length === 3);
c("«sin medir» se ve distinto de «caído» (etiqueta «—» ≠ «OFF»)",
  etiqueta({ medido: false, vivo: false }) === "—" && etiqueta({ medido: true, vivo: false }) === "OFF");

console.log("\n2) La contradicción se puede NOMBRAR (es lo que el usuario vio)\n");

c("dos lecturas medidas que no coinciden → contradicción",
  enContradiccion({ medido: true, vivo: true }, { medido: true, vivo: false }) === true);
c("«sin medir» contra cualquier cosa NO es contradicción: es vacío, y se pinta igual",
  enContradiccion({ medido: false, vivo: false }, { medido: true, vivo: true }) === false);
c("«apagado a mano» manda sobre la medición: una orden no es una caída",
  describirServicio({ id: "memoria", puerto: 5100, medido: true, vivo: true, interruptor: "apagado" }).texto === "apagado a mano");
// v1.0.27 · EL DEFECTO QUE REPORTÓ MARIO: un servicio apagado a mano se pintaba
// «abajo» (texto «OFF», tono de falla) igual que uno caído. La orden se respeta,
// pero deja de llamarse caída.
{
  const apagado = describirServicio({ id: "memoria", puerto: 5100, medido: true, vivo: false, interruptor: "apagado" });
  const caido = describirServicio({ id: "memoria", puerto: 5100, medido: true, vivo: false, interruptor: "auto" });
  c("★ un servicio apagado a mano NO dice «OFF» (no se pinta como caído)",
    apagado.texto === "apagado a mano" && apagado.texto !== "OFF", apagado.texto);
  c("★ y se distingue del caído: mismo puerto, misma medición, frase distinta",
    caido.texto === "no responde" && apagado.texto !== caido.texto, caido.texto);
  c("★ la orden queda marcada como tal (la hoja la usa para el tono neutro)",
    apagado.apagadoAMano === true && !caido.apagadoAMano);
  c("el criterio de medición no se duplicó: sigue mandando `decidirIndicador`",
    apagado.indicador === "abajo" && decidirIndicador({ medido: true, vivo: false }) === "abajo");
  c("«apagado a mano» es vocabulario de un solo sitio (coincide con `razonLegible`)",
    new RegExp("apagado a mano").test(leer("src/engine/interruptoresServicios.ts")) &&
    /apagado a mano/.test(leer("src/engine/indicadorServicios.ts")));
}
c("sin medición, la tarjeta dice «todavía sin medir» en vez de adivinar",
  describirServicio({ id: "puente", puerto: 5000, medido: false, vivo: false, interruptor: "auto" }).indicador === "sin-medir");

console.log("\n3) LA SONDA: cuatro oyentes, UN request\n");

{
  let llamadas = 0;
  let resolver: (v: any) => void = () => {};
  const sonda = crearSondaCompartida<any>({
    pedir: () => { llamadas++; return new Promise((r) => { resolver = r; }); },
    ttlMs: 4000,
    ahora: () => 1000,
  });
  // Cuatro componentes que se montan en el mismo tick (cabecera, sidebar, espina,
  // lista de Servicios). Antes: cuatro fetch al mismo origen. Ahora: uno.
  const oídas: any[] = [];
  const p = [sonda.leer(), sonda.leer(), sonda.leer(), sonda.leer()];
  c("★ cuatro `leer()` en el mismo tick disparan UN solo pedido", llamadas === 1, `llamadas=${llamadas}`);
  c("los cuatro comparten la MISMA promesa en vuelo", p[0] === p[3]);
  sonda.suscribir((m) => oídas.push(m));
  sonda.suscribir((m) => oídas.push(m));
  c("dos suscriptores dados de alta", sonda.oyentes() === 2);
  resolver({ port5000: true });
  const [a, b] = await Promise.all([p[0], p[1]]);
  c("los dos oyentes reciben la MISMA muestra (no su propia lectura)", oídas.length === 2 && oídas[0] === a);
  c("la muestra vigente queda en memoria para el render síncrono", sonda.enMemoria() === a);
  // TTL: dentro de la ventana no se vuelve a pedir.
  await sonda.leer();
  c("dentro del TTL no se pide de nuevo (la muestra ya es fresca)", llamadas === 1, `llamadas=${llamadas}`);
  sonda.invalidar();
  // Ojo con el orden: `leer()` invoca `pedir()` en el acto y ahí se captura el
  // `resolver` nuevo. Resolver ANTES de esperar; al revés (`.then(() => resolver())`)
  // la promesa se espera a sí misma y el proceso muere en un await sin dueño.
  const segundaVuelta = sonda.leer();
  resolver({ port5000: false });
  await segundaVuelta;
  c("`invalidar()` fuerza una lectura nueva", llamadas === 2, `llamadas=${llamadas}`);
}

console.log("\n4) Un sondeo que falla no inventa una caída\n");

{
  let n = 0;
  const reloj = { t: 0 };
  const sonda = crearSondaCompartida<{ vivos: number }>({
    pedir: async () => { n++; if (n === 1) return { vivos: 5 }; throw new Error("ECONNREFUSED"); },
    ahora: () => reloj.t,
    ttlMs: 0, // sin frescura: cada `leer()` vuelve a pedir
  });
  const primera: Muestra<{ vivos: number }> = await sonda.leer();
  reloj.t = 10;
  const segunda = await sonda.leer();
  c("el fallo se marca como fallo", segunda.fallo === true && /ECONNREFUSED/.test(segunda.motivo || ""));
  c("★ y AUN ASÍ conserva el último dato medido: no se pinta «OFF» por un tropiezo",
    segunda.datos?.vivos === 5, JSON.stringify(segunda.datos));
  c("el primer sondeo bueno no se marcó con fallo", primera.fallo === false);
  c("un pedido colgado con plazo se declara fallo, no queda en vuelo para siempre", await (async () => {
    const lenta = crearSondaCompartida<{ ok: boolean }>({ pedir: () => new Promise(() => {}), plazoMs: 20, ttlMs: 0 });
    const m = await lenta.leer();
    return m.fallo === true;
  })());
}

console.log("\n5) El cable: el criterio único está puesto, no solo escrito\n");

const cab = leer("src/components/Header.tsx");
c("★ los seis chips de puerto pasan por `chipPuerto`, no por un ternario propio",
  (cab.match(/\{chipPuerto\(telemetry\.port\w+\)\}/g) || []).length === 6 &&
  !/telemetry\.port\w+ \? "OK" : "OFF"/.test(cab));
c("el chip mentiroso de «LOCAL» (que era un OFF con otro nombre) se fue",
  !/telemetry\.port11434 \? "OK" : "LOCAL"/.test(cab));
const app = leer("src/App.tsx");
c("★ la semilla de `telemetry` no afirma: arranca en `medido: false`",
  /medido: false,/.test(app) && !/port3000: true,/.test(app));
c("`medido: true` se pone con la respuesta, no antes",
  /setTelemetry\(\{ \.\.\.data, medido: true \}\)/.test(app));
const sup = leer("server/routers/supervisorArranque.ts");
c("★ `/api/arranque/estado` ya no puede decir dos cosas distintas: `vivo` usa `=== true`",
  /vivo: vivos\.get\(s\.id\) === true, medido: vivos\.has\(s\.id\)/.test(sup) && !/vivo: vivos\.get\(s\.id\) !== false/.test(sup));
c("la valla de los cuatro criterios no se apaga borrando la suite",
  leer("scripts/validar.mjs").includes("indicadorServicios.test.ts"));
// v1.0.27 · el cable del arreglo: la hoja recibe el interruptor y lo separa.
const hoja = leer("src/engine/hojaDeRuta.ts");
c("★ la línea de puerto lleva el interruptor (sin él la hoja no puede saber si fue a mano)",
  /interruptor\?: string;/.test(hoja));
c("★ la hoja separa lo apagado a mano de lo caído antes de escribir «está abajo»",
  /p\.interruptor === "apagado"/.test(hoja) && /apagado a mano/.test(hoja));
c("★ el panel pide los interruptores al supervisor y los pasa a cada línea",
  /\/api\/arranque\/interruptores/.test(leer("src/components/PlanificationPanel.tsx")) &&
  /interruptor: interruptores\[clave\]/.test(leer("src/components/PlanificationPanel.tsx")));
c("★ y la cara de la hoja no pinta ✗ sobre lo apagado a mano",
  /p\.interruptor !== "apagado"/.test(leer("src/components/HojaDeRutaViva.tsx")));

console.log("\n" + "─".repeat(56));
console.log(`═══ INDICADOR DE SERVICIOS (v2.3.1 · v1.0.27): ${correctas} correctas · ${fallos.length} fallos ═══`);
console.log("─".repeat(56));
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
