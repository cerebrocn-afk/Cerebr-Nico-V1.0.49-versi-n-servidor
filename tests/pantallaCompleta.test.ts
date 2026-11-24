/**
 * tests/pantallaCompleta.test.ts — REGRESIÓN del botón «Salir» que no salía
 * =========================================================================
 * Se ejecuta con:  npx tsx tests/pantallaCompleta.test.ts
 *
 * El código anterior decidía así:
 *
 *     if (!document.fullscreenElement) { entrar } else { salir }
 *
 * …mientras la LLAMADA sí contemplaba `webkitRequestFullscreen`. En un motor que
 * solo exponga el nombre prefijado, `document.fullscreenElement` vale
 * `undefined` siempre, la condición entra por «entrar» AUNQUE estés dentro, y
 * pulsar «Salir» vuelve a pedir pantalla completa. El botón no estaba muerto:
 * elegía lo contrario.
 *
 * La primera prueba de la sección 2 es exactamente ese escenario.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  elementoEnPantallaCompleta,
  decidirAccion,
  alternarPantallaCompleta,
  alternarPantallaCompletaInteligente,
  minimizarVentana,
  entrarEnPantallaCompleta,
  salirDePantallaCompleta,
} from "../src/engine/pantallaCompleta";

const RAIZ_DE_PRUEBA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}${detalle ? `\n      ${detalle}` : ""}`);
  }
}

function seccion(n: string): void {
  console.log(`\n${n}`);
}

/** Documento falso que solo expone los nombres del motor indicado. */
function docFalso(estilo: "moderno" | "webkit" | "moz" | "ms" | "ninguno") {
  const estado: { el: unknown } = { el: null };
  const doc: any = {};
  if (estilo === "moderno") {
    Object.defineProperty(doc, "fullscreenElement", { get: () => estado.el });
    doc.exitFullscreen = () => { estado.el = null; };
  } else if (estilo === "webkit") {
    Object.defineProperty(doc, "webkitFullscreenElement", { get: () => estado.el });
    doc.webkitExitFullscreen = () => { estado.el = null; };
  } else if (estilo === "moz") {
    Object.defineProperty(doc, "mozFullScreenElement", { get: () => estado.el });
    doc.mozCancelFullScreen = () => { estado.el = null; };
  } else if (estilo === "ms") {
    Object.defineProperty(doc, "msFullscreenElement", { get: () => estado.el });
    doc.msExitFullscreen = () => { estado.el = null; };
  }
  return { doc, estado };
}

/* ------------------------------------------------------------------ */
seccion("1. Detección con el nombre moderno");

{
  const { doc, estado } = docFalso("moderno");
  const el = { nombre: "contenedor" };
  estado.el = el;
  afirmar("detecta el elemento en pantalla completa", elementoEnPantallaCompleta(doc) === el);
  afirmar("y decide SALIR", decidirAccion(doc) === "salir", decidirAccion(doc));

  estado.el = null;
  afirmar("sin nada a pantalla completa, decide ENTRAR", decidirAccion(doc) === "entrar", decidirAccion(doc));
}

/* ------------------------------------------------------------------ */
seccion("2. Detección con los nombres PREFIJADOS (aquí estaba el fallo)");

for (const estilo of ["webkit", "moz", "ms"] as const) {
  const { doc, estado } = docFalso(estilo);
  const el = { nombre: `contenedor-${estilo}` };
  estado.el = el;

  afirmar(`«${estilo}»: detecta el elemento`, elementoEnPantallaCompleta(doc) === el, String(elementoEnPantallaCompleta(doc)));
  afirmar(
    `★ «${estilo}»: decide SALIR (antes decidía ENTRAR → el botón no salía)`,
    decidirAccion(doc) === "salir",
    `decidió ${decidirAccion(doc)}`
  );
}

{
  // La prueba que reproduce el fallo con el código viejo, para dejar constancia.
  const { doc, estado } = docFalso("webkit");
  estado.el = { nombre: "en-pantalla-completa" };

  const decisionVieja = doc.fullscreenElement ? "salir" : "entrar"; // la línea de antes
  afirmar("el criterio ANTIGUO decidía ENTRAR estando dentro", decisionVieja === "entrar", decisionVieja);
  afirmar("el criterio NUEVO decide SALIR", decidirAccion(doc) === "salir", decidirAccion(doc));
}

/* ------------------------------------------------------------------ */
seccion("3. Preferencia y casos degenerados");

{
  const doc: any = {
    fullscreenElement: { n: "moderno" },
    webkitFullscreenElement: { n: "webkit" },
  };
  afirmar("si están los dos, gana el moderno", (elementoEnPantallaCompleta(doc) as any).n === "moderno");
}

{
  const { doc } = docFalso("ninguno");
  afirmar("documento sin ninguna propiedad → null", elementoEnPantallaCompleta(doc) === null);
  afirmar("y decide ENTRAR", decidirAccion(doc) === "entrar");
  afirmar("documento nulo no revienta", elementoEnPantallaCompleta(null) === null && decidirAccion(undefined) === "entrar");
}

/* ------------------------------------------------------------------ */
seccion("4. Ida y vuelta completa, con un motor solo prefijado");

{
  const { doc, estado } = docFalso("webkit");
  const el: any = {
    webkitRequestFullscreen() {
      estado.el = el;
      return undefined; // el WebKit antiguo NO devuelve promesa
    },
  };

  const entrar = await alternarPantallaCompleta(doc, el);
  afirmar("entra sin error aunque no devuelva promesa", entrar.ok === true, JSON.stringify(entrar));
  afirmar("y el documento refleja la entrada", estado.el === el);

  const salir = await alternarPantallaCompleta(doc, el);
  afirmar("★ y SALE (lo que no hacía antes)", salir.ok === true && salir.accion === "salir", JSON.stringify(salir));
  afirmar("el documento queda sin pantalla completa", estado.el === null);
}

/* ------------------------------------------------------------------ */
seccion("5. Los fallos se cuentan, no se tragan");

{
  // Hay un elemento a pantalla completa pero el motor no expone forma de salir.
  const doc: any = { fullscreenElement: { n: "x" } };
  const r = await alternarPantallaCompleta(doc, {});
  afirmar("no se declara éxito", r.ok === false, JSON.stringify(r));
  afirmar("se explica el motivo", typeof r.motivo === "string" && r.motivo.length > 0, String(r.motivo));
  afirmar("y se sabe qué acción se intentó", r.accion === "salir", r.accion);
}

{
  const r = await alternarPantallaCompleta(docFalso("moderno").doc, {});
  afirmar("sin API de entrar, tampoco se calla", r.ok === false, JSON.stringify(r));
}

{
  let capturado = "";
  await salirDePantallaCompleta({ exitFullscreen: () => { throw new Error("rechazado por el navegador"); } })
    .catch((e) => { capturado = (e as Error).message; });
  afirmar("una excepción síncrona se convierte en rechazo, no en silencio", capturado === "rechazado por el navegador", capturado);
}

{
  let capturado = "";
  await entrarEnPantallaCompleta({ requestFullscreen: () => Promise.reject(new Error("sin gesto de usuario")) })
    .catch((e) => { capturado = (e as Error).message; });
  afirmar("un rechazo de la promesa llega al llamante", capturado === "sin gesto de usuario", capturado);
}

/* ------------------------------------------------------------------ */
seccion("6. El receptor de la llamada");

{
  // Extraer el método y llamarlo sin receptor rompe la API: se comprueba que
  // se invoca con `this` = documento/elemento.
  const doc: any = {
    fullscreenElement: { n: "x" },
    exitFullscreen(this: any) { return Promise.resolve(this === doc ? "ok" : "receptor-perdido"); },
  };
  let devuelto = "";
  await salirDePantallaCompleta(doc).then(() => { devuelto = "ok"; }).catch(() => { devuelto = "no"; });
  afirmar("se llama con el documento como receptor", devuelto === "ok", devuelto);
}

/* ------------------------------------------------------------------ */
seccion("7. v2.3.1: la variante «inteligente» y el minimizado");

{
  // El motor rechaza la pantalla completa sobre el <div> (transform/contain o
  // iframe sin allowfullscreen) y la raíz sí la acepta. La versión vieja devolvía
  // el rechazo y listo; la «inteligente» reintenta en la raíz antes de rendirse.
  let pedidos: string[] = [];
  const div = { requestFullscreen: () => Promise.reject(new Error("Failed to execute 'requestFullscreen' on 'Element': the element is not fully active")) };
  const raiz = { requestFullscreen: () => { pedidos.push("raiz"); return Promise.resolve(); } };
  const r = await alternarPantallaCompletaInteligente({ documentElement: raiz }, div);
  afirmar("★ si el elemento rechaza, reintenta sobre la raíz y gana", r.ok === true && r.via === "raiz" && pedidos.join(",") === "raiz", JSON.stringify(r));
}

{
  // Las dos vías fallan: `ok: false` con motivo legible, nunca un éxito fingido.
  const div = { requestFullscreen: () => Promise.reject(new Error("Permissions check failed: not allowed to start fullscreen")) };
  const r = await alternarPantallaCompletaInteligente({ documentElement: div }, div);
  afirmar("sin ninguna vía dice `ok: false` y `via: ninguna`", r.ok === false && r.via === "ninguna", JSON.stringify(r));
  afirmar("traduce el texto del motor a algo accionable", /gesto del usuario/.test(r.motivo || ""), r.motivo);
  const sinApi = await alternarPantallaCompletaInteligente({ documentElement: {} }, {});
  afirmar("un motor sin API también devuelve motivo (no revienta)", sinApi.ok === false && /pantalla completa/.test(sinApi.motivo || ""), sinApi.motivo);
}

{
  // Salir: no hay que reintentar en la raíz, y el motivo llega igual.
  const r = await alternarPantallaCompletaInteligente({ fullscreenElement: {}, exitFullscreen: () => Promise.reject(new Error("no se puede")) }, null);
  afirmar("salir usa la API del documento y reporta el fallo", r.accion === "salir" && r.ok === false && /no se puede/.test(r.motivo || ""));
}

{
  // Minimizar: el navegador NO puede. Fingir OK era la tentación; se congela lo
  // contrario: dice que no pudo y cómo se hace a mano.
  const r = await minimizarVentana(null);
  afirmar("sin preload, `ok: false` con el motivo a la vista", r.ok === false && r.via === "sin-camino" && /Win\+D/.test(r.motivo || ""), JSON.stringify(r));
  let tocado = false;
  const conPreload: any = { cnVentana: { minimizar: () => { tocado = true; return Promise.resolve(); } } };
  const r2 = await minimizarVentana(conPreload);
  afirmar("empaquetados (Electron) sí minimiza, por el preload", r2.ok === true && r2.via === "preload" && tocado);
  // Y si estaba en pantalla completa, la sale: es el único achique honesto.
  let salio = false;
  const doc: any = { fullscreenElement: {}, exitFullscreen: () => { salio = true; return Promise.resolve(); } };
  await minimizarVentana(doc);
  afirmar("de paso sale de pantalla completa", salio === true);
}

{
  // La valla del cable: `App.tsx` llama a las dos, con la firma que existe.
  const app = readFileSync(path.resolve(RAIZ_DE_PRUEBA, "src/App.tsx"), "utf-8");
  afirmar("★ App.tsx importa y usa la variante inteligente (no la vieja a secas)",
    /alternarPantallaCompletaInteligente/.test(app) && /void alternarPantallaCompletaInteligente\(document, document\.documentElement\)\.then\(\(r\) =>/.test(app));
  afirmar("★ App.tsx usa el minimizado y cuenta el fallo en el registro",
    /void minimizarVentana\(\)\.then\(\(r\) =>/.test(app) && /Minimizar: \$\{r\.motivo/.test(app));
}

/* ------------------------------------------------------------------ */
console.log(`\n${"─".repeat(56)}`);
console.log(`═══ PANTALLA COMPLETA: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
