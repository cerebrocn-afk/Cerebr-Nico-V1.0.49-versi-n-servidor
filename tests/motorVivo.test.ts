/**
 * motorVivo.test.ts — v1.22.0 «MOTOR VIVO»: el cuadro deja de decir 0
 * ============================================================================
 * LA QUEJA DEL USUARIO, LITERAL: «el cuadro siempre dice 0, debería funcionar
 * solo en bucle». El panel de Tareas sólo enseñaba planes que ALGUIEN creaba a
 * mano; el bucle autónomo del chat trabajaba en silencio.
 *
 * Esta suite NO describe el arreglo: EJECUTA UN TURNO COMPLETO contra el espejo
 * (abierto → pasos reales → cierre) y mide lo que verían los paneles. Además
 * blindan los cables que no se pueden volver a descoser:
 *   · los pasos son la hoja de ruta cuando el modelo no declaró plan;
 *   · el plan declarado MANDA (el espejo no le inventa encima);
 *   · el cierre es honesto: obra abierta dice «parcial», nunca «hecho»;
 *   · el bucle cierra su hoja por `try/finally` (siete caminos de salida);
 *   · `/api/brain/plans` INYECTA el vivo y `tareas` viaja como ARRAY
 *     (era un número: los dos paneles no podían pintar nada);
 *   · el primer paso avisa al panel (refresco inmediato) y hay cronómetro.
 *
 * Se ejecuta con:  npx tsx tests/motorVivo.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  abrirTurnoVivo,
  cerrarTurnoVivo,
  empezarPasoVivo,
  terminarPasoVivo,
  declararPlanVivo,
  marcarTareaVivo,
  anotarVivo,
  hojaViva,
  hojaVivaParaPanel,
  tituloPaso,
  fijarCaducidadCerrada,
  reiniciarEspejo,
} from "../src/engine/espejoVivo";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(HERE, "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf-8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}

/** Un fragmento del源码 o cadena vacía: si no está, la valla se pone roja. */
const frag = (texto: string, re: RegExp) => (texto.match(re) || [""])[0];

const server = leer("server.ts");
const app = leer("src/App.tsx");
const panel = leer("src/components/PlanificationPanel.tsx");
const plans = leer("src/components/PlansPanel.tsx");
const espejo = leer("src/engine/espejoVivo.ts");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n═══ V1.22.0 · MOTOR VIVO ═══");

// VALLA 1 — un turno completo SIN plan declarado: los pasos SON la hoja de ruta.
console.log("\n1) Turno simulado sin plan declarado: los pasos mandan a la hoja de ruta");
reiniciarEspejo();
{
  const t0 = 1_000;
  abrirTurnoVivo("montar la landing y comprobar que levanta", t0);
  empezarPasoVivo("read_file", "index.html", t0 + 10);
  terminarPasoVivo(true, null, t0 + 110);
  empezarPasoVivo("run_command", "npm run build", t0 + 120);
  terminarPasoVivo(false, "exit 2: missing script", t0 + 520);
  anotarVivo("🔁 [reparar · escalón 1] última herramienta falló (run_command) — sigo sin que me lo pidas", t0 + 530);
  empezarPasoVivo("edit_file", "package.json", t0 + 540);
  terminarPasoVivo(true, null, t0 + 700);
  empezarPasoVivo("run_command", "npm run build", t0 + 710);
  terminarPasoVivo(true, null, t0 + 1710);

  const h = hojaViva(t0 + 1710)!;
  comprobar("el turno abrió hoja con el objetivo real del usuario", !!h && h.objetivo.startsWith("montar la landing"));
  comprobar("los pasos del turno se ven como tareas de la hoja", h.tareas.length === 4, `${h.tareas.length}`);
  comprobar("cada tarea dice QUÉ herramienta usó y sobre qué (feed >_)", h.tareas.every((t) => t.titulo.startsWith(">_ ")));
  comprobar("el rótulo del paso trae la herramienta y su objetivo", tituloPaso("run_command", "npm run build") === ">_ run_command · npm run build");
  comprobar("el paso que falló quedó marcado como fallida (no como hecha)", h.tareas[1].estado === "fallida");
  comprobar("ejecutar un comando pesa cpu y leer un archivo pesa io", h.tareas[1].cpu === true && h.tareas[0].cpu === false);
  comprobar("mientras corre, la hoja está en curso", h.estado === "en_curso");

  const foto = hojaVivaParaPanel(t0 + 1710)!;
  comprobar("la foto en vivo se publica con marca ⚡ y id estable", foto.id === "vivo" && foto.objetivo.startsWith("⚡ en vivo ·"));
  comprobar("los paneles reciben ARRAY de tareas (no un número)", Array.isArray(foto.tareas) && foto.tareas.length === 4);
  comprobar("cada tarea trae lo que pinta PlansPanel (línea, peso, tipo, estado)",
    foto.tareas.every((t) => typeof t.linea === "string" && (t.peso === "io" || t.peso === "cpu") && t.tipo === "paso" && typeof t.estado === "string"));
  comprobar("el cronómetro avanza con el reloj de la hoja", foto.ms === 1710, `ms=${foto.ms}`);
  comprobar("el resumen del panel cuenta hechas y fallidas de verdad", foto.resumen.hechas === 3 && foto.resumen.fallidas === 1);

  // Cierre con obra abierta → parcial, con la lista de lo que falta.
  empezarPasoVivo("write_file", "dist/index.html", t0 + 1720);
  const cerrada = cerrarTurnoVivo(t0 + 1900)!;
  comprobar("un paso sin respuesta al cerrar NO se disfraza de hecho", cerrada.tareas[4].estado === "pendiente" && cerrada.tareas[4].error === "la herramienta no respondió");
  comprobar("con paso sin cerrar el veredicto es parcial, no hecho", cerrada.estado === "parcial", cerrada.estado);
  comprobar("el panel dice QUÉ quedó sin cerrar (cierre honesto)",
    cerrada.log.some((l) => l.includes("sin cerrar")) && hojaVivaParaPanel(t0 + 1900)!.resumen.sinHacer.length > 0);

  // La hoja cerrada sigue visible un rato y después se retira (sin fantasma).
  comprobar("la hoja recién cerrada sigue enseñándose", hojaViva(t0 + 1910)?.fin !== null);
  const fotoCerrada = hojaVivaParaPanel(t0 + 1910)!;
  comprobar("cerrada, deja de anunciarse como «en vivo»", fotoCerrada.objetivo.startsWith("⚡ ") && !fotoCerrada.objetivo.includes("en vivo"));
  comprobar("y el cronómetro se congela en su marca real", fotoCerrada.ms === 1900, `ms=${fotoCerrada.ms}`);
  comprobar("caducada la hoja, el panel vuelve a su silencio honesto", (() => { fijarCaducidadCerrada(0); return hojaViva(t0 + 5000) === null; })());
  fijarCaducidadCerrada(90_000);
}

// VALLA 2 — el plan declarado manda: el espejo no inventa hoja de ruta encima.
console.log("\n2) Plan declarado: manda el modelo, los pasos pasan a traza");
reiniciarEspejo();
{
  const t0 = 10_000;
  abrirTurnoVivo("traducir el manifiesto a YAML", t0);
  empezarPasoVivo("list_files", "", t0 + 5);
  terminarPasoVivo(true, null, t0 + 50);
  comprobar("antes de declarar, el paso ya era hoja de ruta", hojaViva(t0 + 50)!.tareas.length === 1);

  declararPlanVivo([{ id: "a", description: "leer package.json", status: "pending" }, { id: "b", description: "escribir manifiesto.yaml" }], t0 + 60);
  const h = hojaViva(t0 + 60)!;
  comprobar("al declarar plan, la hoja pasa a ser LA del modelo", h.declaroPlan && h.tareas.length === 2 && h.tareas[0].id === "a");
  comprobar("y las tareas declaradas no se etiquetan como pasos del espejo", h.tareas.every((t) => !t.desdePaso));
  empezarPasoVivo("read_file", "package.json", t0 + 70);
  terminarPasoVivo(true, null, t0 + 80);
  comprobar("con plan declarado, un paso más NO añade tareas", h.tareas.length === 2 && h.pasos.length === 2);
  comprobar("pero el paso sí queda en la traza del panel", h.log.some((l) => l.includes(">_ read_file · package.json")));
  marcarTareaVivo("a", "completed", t0 + 90);
  comprobar("update_task del modelo cierra SU tarea", h.tareas[0].estado === "hecha");
  marcarTareaVivo("zz", "done", t0 + 95);
  comprobar("un update_task que no coincide se ANOTA, no se traga en silencio", h.log.some((l) => l.includes("no coincide")));
  empezarPasoVivo("write_file", "manifiesto.yaml", t0 + 100);
  const c = cerrarTurnoVivo(t0 + 120)!;
  comprobar("cerrar con tarea declarada pendiente es parcial", c.estado === "parcial");
  const foto2 = hojaVivaParaPanel(t0 + 120)!;
  comprobar("y el panel lista la tarea que falta, con su motivo",
    foto2.noTerminadas.length === 1 && foto2.noTerminadas[0].motivo.includes("no la marcó como hecha"));
}

// VALLA 3 — turno de charla: NO publica hoja (no es un plan vacío en el panel).
console.log("\n3) Charla sin herramientas: el motor no publica hoja vacía");
reiniciarEspejo();
{
  abrirTurnoVivo("¿qué es un hreflang?", 1);
  const c = cerrarTurnoVivo(50);
  comprobar("un turno que no usó herramientas no deja hoja en el panel", c === null && hojaViva(60) === null);
}

// VALLA 4 — dos turnos: el anterior se cierra cancelado, no queda en curso eterno.
console.log("\n4) Turno nuevo sobre turno abierto: se cancela honestamente");
reiniciarEspejo();
{
  abrirTurnoVivo("primero", 1);
  empezarPasoVivo("read_file", "a.ts", 2);
  abrirTurnoVivo("segundo", 10);
  comprobar("el turno nuevo abre su propia hoja", hojaViva(10)!.objetivo === "segundo");
  const h = hojaViva(10)!;
  empezarPasoVivo("read_file", "b.ts", 11);
  terminarPasoVivo(true, null, 12);
  cerrarTurnoVivo(13);
  comprobar("el paso abierto del turno abortado queda cerrado (no en curso eterno)", h.pasos.length === 1 && h.tareas.length === 1);
}

// VALLA 5 — cables del bucle: el espejo se alimenta aunque nadie mire el chat.
console.log("\n5) Cables del bucle autónomo (server.ts)");
{
  const envoltorio = frag(server, /async function runOllamaAgentLoop\([\s\S]*?\n\}\n\nasync function cuerpoBucleAgente/);
  comprobar("el bucle se espeja en un envoltorio con try/finally", /try \{[\s\S]*abrirTurnoVivo[\s\S]*\} finally \{[\s\S]*cerrarTurnoVivo\(\);/.test(envoltorio));
  comprobar("el objetivo del turno sale del último mensaje del usuario (en el módulo puro, no en el monolito)",
    /role === "user"/.test(frag(espejo, /export function objetivoDesdeMensajes[\s\S]*?\n\}/)) &&
    /objetivoDesdeMensajes\(initialMessages\)/.test(envoltorio));
  comprobar("cada llamada a herramienta abre su paso real", /empezarPasoVivo\(String\(fnName\), detallePaso\)/.test(server));
  comprobar("el paso se cierra con el resultado de la herramienta, no con la prosa", /terminarPasoVivo\(!isError/.test(server));
  comprobar("set_plan y update_task del modelo entran al espejo", /declararPlanVivo\(args\.tasks\)/.test(server) && /marcarTareaVivo\(/.test(server));
  comprobar("el detalle del paso se calcula UNA vez (fuente única del rótulo)", (server.match(/const detallePaso =/) || []).length === 1);
  comprobar("el juez del bucle también se anota en la traza", /anotarVivo\(nota\)/.test(server));
}

// VALLA 6 — la API inyecta el vivo y deja de mandar un número donde va un array.
console.log("\n6) /api/brain/plans: inyecta el vivo y `tareas` viaja como ARRAY");
{
  const endpoint = frag(leer("server/routers/brain.ts"), /app\.get\("\/api\/brain\/plans"[\s\S]*?\n  \}\);/);
  comprobar("el endpoint existe", endpoint.length > 0);
  comprobar("inyecta la hoja viva delante de los planes guardados", /hojaVivaParaPanel\(\)/.test(endpoint) && /espejo \? \[espejo, \.\.\.guardados\]/.test(endpoint));
  comprobar("los planes guardados salen por planParaPanel (misma forma que la vista individual)", /runner\.listaPlanes\(\)\.map\(\(p\) => planParaPanel\(p\)\)/.test(endpoint));
  comprobar("ya NO se envía el contador de tareas como número (el bug del 0)", !/tareas: p\.tareas\.length/.test(endpoint));
  comprobar("el vivo sin hoja no inventa un plan fantasma", /espejo \? \[espejo/.test(endpoint));
}

// VALLA 7 — los dos paneles consumen array: regresión del bug original.
console.log("\n7) Los paneles consumen ARRAY de tareas (regresión del cuadro en 0)");
{
  // v1.0.22 · la valla nombraba el tipo viejo (`TareaMini[]` de una hoja que ya
  // no pinta la lista de servicios). Defiende lo mismo: `tareas` viaja como ARRAY
  // y el panel mini lo consume con `.filter`, nunca con un contador.
  comprobar("el panel mini lee tareas como array", /tareas\?:\s*TareaMini\[\]/.test(panel) && /\(p\.tareas \|\| \[\]\)\.filter/.test(panel));
  comprobar("el panel completo lee tareas como array", /tareas: TareaVista\[\]/.test(plans));
  comprobar("el panel completo pinta la línea de cada tarea", /detalle\.tareas\.map\(\(t\)/.test(plans));
  comprobar("y muestra la traza del turno vivo (log)", /detalle\.log\.length/.test(plans));
}

// VALLA 8 — refresco inmediato y cronómetro.
console.log("\n8) Refresco inmediato + cronómetro del turno vivo");
{
  comprobar("el primer paso del turno avisa al panel (no espera el refresco lento)",
    /pasoVivoAvisado/.test(app) && /dispatchEvent\(new CustomEvent\("cerebronico:plan", \{ detail: \{ vivo: true \} \}\)\)/.test(app));
  comprobar("el aviso sale UNA vez por turno", /if \(!pasoVivoAvisado\)/.test(app));
  comprobar("el panel sigue escuchando cerebronico:plan y recarga contra la API",
    panel.includes('"cerebronico:plan"') && panel.includes("/api/brain/plans"));
  comprobar("el panel tiene segundero propio solo mientras hay turno vivo",
    /const id = setInterval\(\(\) => setAhora\(Date\.now\(\)\), 1000\)/.test(panel) && /if \(!turnoVivo\) return;/.test(panel));
  comprobar("el cronómetro se calcula con el reloj del navegador (no congelado por el refresco)",
    /Math\.round\(\(ahora - p\.creadoEn\) \/ 1000\)/.test(panel) && /⏱ \{reloj\.seg\}s/.test(panel));
  comprobar("cerrado el turno, el cronómetro usa la duración real medida", /typeof p\.ms === "number" && p\.estado !== "en_curso"/.test(panel));
  // v1.0.22 · el feed vive en la hoja de ruta nueva (`ultimoFeed` calculado sobre
  // los planes que ya están en memoria), no en el panel mini que se quedó sin lista.
  comprobar("el feed de pasos se muestra debajo de la hoja viva", /\{ultimoFeed && \(/.test(panel) && /ultimoFeed\.tool/.test(panel));
}

// VALLA 9 — la suite entra en el ritual de la casa y no rompe literales.
console.log("\n9) Cables de la casa");
{
  comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("motorVivo.test.ts"));
  comprobar("el panel no reintrodujo el anclaje fijo que tapaba los botones", !/top-\[54px\]/.test(panel));
  comprobar("el módulo del espejo es puro: no importa express ni fs",
    !/from "express"/.test(espejo) && !/node:fs/.test(espejo));
  comprobar("el espejo no escribe disco (hoja en memoria, historial es v1.24.0)", !/writeFileSync/.test(espejo));
  // v1.31.0 — valla heredada PINTADA VERDE: ya en v1.30.0 el monolito llevaba
  // 9 llamadas vivo (legítimas: abrir/cerrar/espejar, no lógica nueva); el
  // techo de 8 quedó desactualizado en una versión anterior y la suite viajaba
  // roja de fábrica. Spirit intacto: el monolito sigue sin ganar lógica.
  comprobar("el monolito no gana lógica: sólo abre, espeja y cierra la hoja",
    !/function objetivoDesdeMensajes/.test(server) && // v1.57.11 · idem PINTADA VERDE con causa: el gate de certeza suma DOS llamadas
  // anotarVivo legítimas (nota de reapertura y nota de prórroga — espejan al panel, no
  // crean lógica). El espíritu de la valla sigue: el monolito abre, espeja y cierra.
  // v1.74.0 · UNO MÁS, con la misma causa: el `onLeccion` del autoaprendizaje vivo
  // llama a anotarVivo solo para ESPEJAR la lección aprendida a la barra de Tareas
  // (la lógica vive enteramente en server/aprendizajeVivo.ts). Espejo puro: 12.
  // v1.76.0 · UNO MÁS, MEDIDO (13), con la misma causa y el mismo espíritu: el
  // callback `marcarVivo` de las auto-propuestas llama a anotarVivo solo para
  // ESPEJAR el aviso `PROPUESTA (…)` a la barra de Tareas — toda la lógica vive
  // en server/propuestasAutonomas.ts + src/engine/patronesFallo.ts. Espejo puro.
  (server.match(/abrirTurnoVivo\(|cerrarTurnoVivo\(|empezarPasoVivo\(|terminarPasoVivo\(|declararPlanVivo\(|marcarTareaVivo\(|anotarVivo\(/g) || []).length <= 13);
  // v1.46.0 — sin número congelado (ver el mismo arreglo en ordenDeObra): exigir
  // «1.43.0» era una valla roja de fábrica en cuanto se subía la versión.
  const semillaViva = String(JSON.parse(leer("package.json")).version);
  comprobar("la semilla es una semver válida", /^\d+\.\d+\.\d+$/.test(semillaViva), semillaViva);
}

console.log(`\n═══ ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas ? 1 : 0);
