/**
 * tests/seguidorHilo.test.ts — LA VISTA PERSIGUE, NO SALTA (v2.3.2)
 * ================================================================
 * Se ejecuta con:  npx tsx tests/seguidorHilo.test.ts
 *
 * El pedido del usuario (4/11), textual: «estabiliza más el movimiento automático
 * del chat con la escritura … la pantalla se mueve más lenta que el texto».
 * El defecto medido: `ChatCenter` hacía `scrollIntoView({ behavior:
 * currentStreamingText ? "auto" : "smooth" })` — o sea, **salto puro justo
 * mientras llegaba el chorro de texto**, y `smooth` reservado para cuando no
 * pasaba nada.
 */
import {
  objetivoDelHilo,
  estaPegadoAlFondo,
  siguientePosicion,
  curvaDeSeguimiento,
  VELOCIDAD_SEGUIMIENTO_PX_S,
  PASO_MAXIMO_PX,
  UMBRAL_PEGADO_PX,
} from "../src/engine/seguidorHilo";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos: string[] = [];
function c(que: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
}

console.log("\n1) El fondo y el guard del usuario\n");

c("objetivo = scrollHeight − clientHeight, nunca negativo",
  objetivoDelHilo(1000, 400) === 600 && objetivoDelHilo(300, 400) === 0);
c("pegado abajo se mide con tolerancia (una fila de código no corta el seguimiento)",
  estaPegadoAlFondo(1000, 550, 400) === true && estaPegadoAlFondo(1000, 100, 400) === false);
c("el umbral es el de siempre: 120 px", UMBRAL_PEGADO_PX === 120);

console.log("\n2) Un cuadro: velocidad finita, nunca teletransporte\n");

{
  // PRIMER cuadro: no hay dt (reloj absoluto, la lección de `goteo`). El conductor
  // viejo habría movido la barra los 5000 px de golpe.
  const r = siguientePosicion({ actual: 0, objetivo: 5000, ahora: 1000 });
  c("★ el primer cuadro NUNCA da el salto completo (dt desconocido = paso chico)",
    r.pos > 0 && r.pos <= PASO_MAXIMO_PX && r.llego === false, JSON.stringify(r));

  // 60 fps durante un segundo: la distancia recorrida no puede exceder la velocidad.
  let pos = 0, ant: number | undefined = undefined, t = 0;
  const MAX = objetivoDelHilo(60000, 600);
  for (let i = 0; i < 62; i++) {
    t += 16;
    const s = siguientePosicion({ actual: pos, objetivo: MAX, ahora: t, anterior: ant });
    pos = s.pos; ant = s.en;
  }
  const recorrido = pos;
  c("★ en ~1 s la barra recorre como mucho la velocidad declarada",
    recorrido <= VELOCIDAD_SEGUIMIENTO_PX_S + PASO_MAXIMO_PX, `recorrido=${Math.round(recorrido)}`);
  c("y no se quedó quieta (el error espejo: los deltas de 0 que mataban a `goteo`)",
    recorrido > VELOCIDAD_SEGUIMIENTO_PX_S * 0.6, `recorrido=${Math.round(recorrido)}`);

  // Un cuadro patológicamente largo (pestaña en segundo plano) no teletransporta.
  const golpe = siguientePosicion({ actual: 0, objetivo: 9000, ahora: 5000, anterior: 4500 });
  c("un cuadro de 500 ms no se cobra la ventana entera", golpe.pos <= PASO_MAXIMO_PX, JSON.stringify(golpe));

  // Monótono y se detiene exacto en el objetivo.
  let p = 0, a2: number | undefined, tt = 0, pasos = 0;
  while (pasos++ < 400) {
    tt += 16;
    const s = siguientePosicion({ actual: p, objetivo: 900, ahora: tt, anterior: a2 });
    p = s.pos; a2 = s.en;
    if (s.llego) break;
  }
  c("persigue sin sobrepasar y declara `llego` en el objetivo", p === 900, String(p));
}

console.log("\n3) La forma de llegada del texto no cambia la curva\n");

{
  // Mismo total de píxeles, tres patrones: un pantallazo, goteo fino, parches.
  const pantallazo = [8000];
  const goteo = Array.from({ length: 40 }, (_, i) => 200 + i * 200);
  const parches = Array.from({ length: 8 }, (_, i) => 1000 + i * 1000);
  const curvas = { pantallazo, goteo, parches };
  for (const [nombre, llegadas] of Object.entries(curvas)) {
    const ys = curvaDeSeguimiento(llegadas, 600);
    const saltos = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
    c(`★ «${nombre}»: ningún cuadro mueve la barra más de ${PASO_MAXIMO_PX} px`,
      Math.max(...saltos) <= PASO_MAXIMO_PX + 0.01, `máximo=${Math.max ? Math.max(...saltos).toFixed(1) : "?"}`);
    c(`«${nombre}»: la vista jamás se adelanta al fondo`, ys.every((y, i) => y <= objetivoDelHilo(llegadas[Math.min(i, llegadas.length - 1)] || 8000, 600) + 0.01));
  }
}

console.log("\n4) El cable en ChatCenter\n");

const cc = leer("src/components/ChatCenter.tsx");
c("★ el salto por gota desapareció del hilo del chat", !/behavior: currentStreamingText \? "auto" : "smooth"/.test(cc));
// v2.3.17 — ESTA VALLA ESTABA ROJA ANTES DE MI CAMBIO. Pedía el literal
// `objetivoDelHilo(nodo.scrollHeight, nodo.clientHeight)`, o sea la persecución del
// fondo absoluto de v2.3.2; desde v1.61.0 el blanco es el CENTRO DE LA RESPUESTA
// (`objetivoLectura`) y v2.3.12 lo congeló encima. La forma literal sobrevivió al
// contrato y el rojo se naturalizó. Se reescribe contra lo que el contrato dice
// hoy: un paso calculado por la regla pura hacia el objetivo de lectura.
c("★ el conductor usa la regla pura", /siguientePosicion\(\{/.test(cc) && /objetivoLectura\(nodo\.scrollHeight, nodo\.clientHeight/.test(cc));
// v2.3.9 — LA VALLA MEDÍA LA FORMA, NO EL CONTRATO. Exigía el literal
// `if (cuadroSeguidorRef.current !== null) return;`, y el arreglo de v2.3.9 («el
// chorro no espera al cuadro») puso una marca de pendiente antes del return para
// que la gota no se pierda. El contrato real es DOS cosas y acá se baten las dos:
// (1) nunca hay dos rAF en vuelo, (2) la gota que llega con el cuadro ocupado no
// se tira a la basura. Un rojo por forma y no por contrato es una valla que
// enseña a escribir el return en una línea, no a no apilar cuadros.
c("un solo cuadro en vuelo (no se apilan rAF por gota)",
  /if \(cuadroSeguidorRef\.current !== null\)[^}]{0,120}?return;/.test(cc) &&
  !/if \(cuadroSeguidorRef\.current !== null\)[^}]*pedirCuadro\(/.test(cc));
c("y la gota que llega con el cuadro ocupado NO se pierde (queda pendiente)",
  /pendienteSeguidorRef\.current = true; return;/.test(cc) && /if \(pendienteSeguidorRef\.current\)/.test(cc));
c("el pendiente se suelta al desmontar", /cancelAnimationFrame\(cuadroSeguidorRef\.current\)|soltarCuadro\(cuadroSeguidorRef\.current\)/.test(cc));
c("el mensaje del usuario sí salta, la respuesta se persigue", /conducirSeguidor\(mensajeNuevo\)/.test(cc));
// --- v2.3.17 · EL ESCALÓN MURIÓ: LA VISTA ACOMPAÑA, NO ESPERA -----------------
// Queja del 6/11: «se queda quieto y sigue el texto para abajo y no sube solo
// acompañando el texto». v2.3.12 congelaba el objetivo hasta cruzar 100 px (5
// renglones) y recién ahí saltaba: quieto + de golpe. Y su suite
// (`tests/escalonLectura.test.ts`) **nunca estuvo registrada en `validar.mjs`**, o
// sea el congelamiento llegó al producto sin que nadie lo viera pasar. Quinta
// aparición de la misma enfermedad (F13, F12, el vigilante de skills, las 116
// pruebas mudas y ahora esta).
{
  const cc = leer("src/components/ChatCenter.tsx");
  // Se comprueba el ENLACE (import y llamada), no la palabra: la primera versión de
  // esta valla buscaba `escalonLectura` a secas y se auto-impactaba con el comentario
  // que anuncia que se borró. Un guard que se espanta a sí mismo no guarda nada.
  c("\u2605 el congelamiento está borrado del cable (ni import ni llamada)",
    !/from "\.\.\/engine\/escalonLectura"/.test(cc) && !/decidirEscalon\(/.test(cc) && !/estadoInicial\(/.test(cc));
  c("\u2605 el objetivo se recalcula DENTRO del cuadro", /objetivoLectura\(nodo\.scrollHeight/.test(cc));
  c("y el guard viejo —geometría pura en cada onScroll— no volvió",
    !/pegadoAbajoRef\.current = el\.scrollHeight - el\.scrollTop - el\.clientHeight </.test(cc));
  c("desengancharse exige un gesto: rueda y táctil están enganchados",
    /onWheel=\{marcarIntencionDeSubir\}/.test(cc) && /onTouchMove=\{marcarIntencionDeSubir\}/.test(cc));
  c("el módulo y la suite del escalón ya no existen",
    !existsSync(path.join(RAIZ, "src/engine/escalonLectura.ts")) && !existsSync(path.join(RAIZ, "tests/escalonLectura.test.ts")));

  // Fluidez, medida: con el contenido creciendo de a 3 px por llegada no puede
  // haber mesetas. Una meseta larga ES el síntoma que reportó el usuario.
  const curve = curvaDeSeguimiento(Array.from({ length: 60 }, (_x, i) => 4000 + i * 3), 800, { pasoMs: 16 });
  let meseta = 0;
  let mesetaMax = 0;
  for (let i = 1; i < curve.length; i++) {
    if (Math.abs(curve[i] - curve[i - 1]) < 0.05) { meseta++; mesetaMax = Math.max(mesetaMax, meseta); }
    else meseta = 0;
  }
  c("goteo continuo: la barra no se queda plana más de dos cuadros seguidos",
    mesetaMax <= 2, "meseta máxima=" + mesetaMax + " sobre " + curve.length + " cuadros");
  c("y avanza en casi todas las llegadas", curve.filter((v, i) => i > 0 && Math.abs(v - curve[i - 1]) >= 0.05).length >= (curve.length - 1) * 0.9);

  // LA TRAMPA QUE CONGELABA LA VISTA, escrita como número para que no se olvide:
  // el perseguidor va a 780 px/s, así que con el chorro rápido su propio rezago
  // supera el umbral de 120 px. Si el conductor usa ESA medición como única señal
  // de «el usuario se fue», se congela a sí mismo.
  const rezagoGrande = estaPegadoAlFondo(5000, 5000 - 800 - 200, 800);
  c("★ el rezago propio del perseguidor SÍ rompe la prueba geométrica (por eso no puede ser la única señal)",
    rezagoGrande === false, "distancia 200 px → pegado=" + rezagoGrande);
}

c("la suite está registrada en la valla maestra", leer("scripts/validar.mjs").includes("seguidorHilo.test.ts"));

console.log("\n" + "─".repeat(56));
console.log(`═══ SEGUIDOR DEL HILO (v2.3.2): ${correctas} correctas · ${fallos.length} fallos ═══`);
console.log("─".repeat(56));
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
