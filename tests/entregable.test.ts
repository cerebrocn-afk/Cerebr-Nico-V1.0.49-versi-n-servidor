/**
 * entregable.test.ts — EL PAQUETE TIENE NOMBRE Y ESTADO (v1.98.0)
 * ================================================================
 * Queja literal del 31/10: «siempre dice descargar todo zip, debería estar cuando el
 * pedido esté empacado ¿no? con su nombre y todo». Dos defectos medidos:
 *   · `Content-Disposition` decía `entregable-cerebronico.zip` SIEMPRE
 *     (server/sandboxEntregable.ts:117) → dos proyectos, dos descargas, mismo nombre.
 *   · el botón verde aparecía con `entradas.length > 0` → un archivo suelto en el
 *     sandbox se veía igual que una app terminada.
 *
 * (1) nombreSeguro: lo que termina en una cabecera HTTP y en una carpeta ajena
 * (2) carpeta/proyecto: el caso real del log (todo cuelga de `web-cerebronico/`)
 * (3) estadoDelPaquete: «empacado» = se puede LEVANTAR, no «hay algo»
 * (4) cabeceraDeDescarga: ASCII + UTF-8, sin comillas sueltas, siempre .zip
 * (5) ANTI-HOJA-MUERTA: el servidor llama a esto y el literal fijo murió; la hoja
 *     muestra el nombre y el estado en vez de un verde permanente
 * (6) registrada en el ritual
 */
import {
  PROYECTO_POR_DEFECTO,
  cabeceraDeDescarga,
  carpetaDeProyecto,
  estadoDelPaquete,
  fechaDePaquete,
  nombreDelZip,
  nombreSeguro,
  proyectoDe,
} from "../src/engine/entregable";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + String(d).split("\n")[0].slice(0, 220) : "")); };

// ── 1 · el nombre seguro ─────────────────────────────────────────────────────
comprobar("conserva lo legible (`Control-Dinero` → `control-dinero`)", nombreSeguro("Control-Dinero") === "control-dinero", nombreSeguro("Control-Dinero"));
comprobar("los acentos se van (una cabecera HTTP no es lugar para `á`)", nombreSeguro("Ñúñez García") === "nunez-garcia", nombreSeguro("Ñúñez García"));
comprobar("los espacios y la basura se vuelven un solo guion", nombreSeguro("mi  app!! final") === "mi-app-final", nombreSeguro("mi  app!! final"));
comprobar("no deja puntos ni guiones colgando al principio o al final", nombreSeguro("..--mi app--..") === "mi-app", nombreSeguro("..--mi app--.."));
comprobar("la basura absoluta cae al piso, no a un nombre de dos caracteres", nombreSeguro("?!") === PROYECTO_POR_DEFECTO, nombreSeguro("?!"));
comprobar("un nombre de proyecto no mide 4000 caracteres", nombreSeguro("x".repeat(300)).length <= 60);
comprobar("una ruta atraviesa el nombre: no puede salir con `..` ni con `/`", !/[\\/]/.test(nombreSeguro("../../etc/passwd")) && !nombreSeguro("../../etc/passwd").startsWith("."), nombreSeguro("../../etc/passwd"));

// ── 2 · cuál es el proyecto ──────────────────────────────────────────────────
const LOG = ["web-cerebronico/index.html", "web-cerebronico/styles.css", "web-cerebronico/app.js"];
comprobar("el caso real del log: todo cuelga de `web-cerebronico/`", carpetaDeProyecto(LOG) === "web-cerebronico", String(carpetaDeProyecto(LOG)));
comprobar("y ese es el nombre del paquete", proyectoDe(LOG, "sandbox") === "web-cerebronico", proyectoDe(LOG, "sandbox"));
comprobar("archivos sueltos en la raíz no inventan una carpeta", carpetaDeProyecto(["index.html", "styles.css"]) === null);
comprobar("UN solo archivo sin barra tampoco es una carpeta", carpetaDeProyecto(["notas.txt"]) === null);
comprobar("los envoltorios del sandbox no son el nombre del proyecto", carpetaDeProyecto(["sandbox/index.html"]) === null && carpetaDeProyecto(["workspace/index.html"]) === null && carpetaDeProyecto(["app/index.html"]) === null);
comprobar("dos carpetas distintas no deciden un nombre único", carpetaDeProyecto(["a/index.html", "b/index.html"]) === null);
comprobar("sin carpeta y con raíz de envoltorio, manda el nombre por defecto", proyectoDe(["index.html"], "sandbox") === PROYECTO_POR_DEFECTO);
comprobar("sin carpeta pero con raíz que sí dice algo, manda la raíz", proyectoDe(["index.html"], "control-dinero") === "control-dinero", proyectoDe(["index.html"], "control-dinero"));

// ── 3 · qué significa «empacado» ─────────────────────────────────────────────
const e1 = estadoDelPaquete(LOG);
comprobar("un sitio con index.html está listo para entregar", e1.listo === true, JSON.stringify(e1));
comprobar("un punto de entrada reconocido: package.json cuenta igual que index.html", estadoDelPaquete(["pkg/package.json"]).listo === true);
comprobar("una app python también (main.py)", estadoDelPaquete(["main.py"]).listo === true);
comprobar("un archivo suelto de texto NO es un entregable (era el botón verde falso)", estadoDelPaquete(["notas.txt"]).listo === false);
comprobar("y lo dice con la razón, no con un botón mudo", estadoDelPaquete(["notas.txt"]).faltan.some((f) => /punto de entrada/.test(f)), JSON.stringify(estadoDelPaquete(["notas.txt"])));
comprobar("los hoyos de arranque del juez pasan al estado", estadoDelPaquete(["index.html"], ["index.html referencia 3 script(s) y ninguno existe en disco"]).listo === false);
comprobar("la documentación que falta se INFORMA, no bloquea la entrega", (() => {
  const e = estadoDelPaquete(["index.html"]);
  return e.listo === true && e.tieneDocsPropias === false && e.faltan.some((f) => /genera el IDE/.test(f));
})(), "el ZIP arma el RECORDATORIO.md: no es un defecto del proyecto");
comprobar("un README escrito por el modelo cuenta como documentación propia", estadoDelPaquete(["index.html", "README.md"]).tieneDocsPropias === true && estadoDelPaquete(["index.html", "web/LEEME.md"]).tieneDocsPropias === true);
comprobar("RECORDATORIO.md adentro de la carpeta del proyecto también", estadoDelPaquete(["web/RECORDATORIO.md", "web/index.html"]).faltan.length === 0);
comprobar("los duplicados del motivo no se repiten en la lista", estadoDelPaquete(["notas.txt"], ["x", "x"]).faltan.filter((f) => f === "x").length === 1);

// ── 4 · el nombre del archivo y su cabecera ──────────────────────────────────
const FECHA = new Date(2026, 9, 31);
comprobar("la fecha del paquete es AAAA-MM-DD local", fechaDePaquete(FECHA) === "2026-10-31", fechaDePaquete(FECHA));
comprobar("una fecha basura no deja el nombre sin fecha", /^\d{4}-\d{2}-\d{2}$/.test(fechaDePaquete("no es una fecha")));
comprobar("el nombre del archivo lleva proyecto y fecha", nombreDelZip("web-cerebronico", "2026-10-31") === "web-cerebronico-2026-10-31.zip");
const cab = cabeceraDeDescarga("Control Dinero Ñúñez-2026-10-31.zip");
comprobar("la cabecera manda el ASCII y el UTF-8 (los navegadores viejos también leen)", /filename="[a-z0-9._-]+\.zip"/.test(cab) && /filename\*=UTF-8''/.test(cab), cab);
comprobar("ningún nombre puede romper la cabecera con una comilla", (() => {
  const abierto = cab.indexOf('filename="') + 'filename="'.length;
  const valor = cab.slice(abierto, cab.indexOf('"', abierto));
  return valor.length > 0 && !valor.includes('"') && !valor.includes("\n") && !valor.includes(";");
})(), cab);
comprobar("sin punto .zip no se queda sin extensión", cabeceraDeDescarga("mi-paquete").endsWith(".zip"), cabeceraDeDescarga("mi-paquete"));
comprobar("una barra en el nombre no se cuela en la cabecera", !cabeceraDeDescarga("../../etc/passwd").includes("/etc"), cabeceraDeDescarga("../../etc/passwd"));

// ── 5 · anti-hoja-muerta: se usa de verdad ───────────────────────────────────
const srv = fs.readFileSync(path.join(RAIZ, "server", "sandboxEntregable.ts"), "utf8");
const hoja = fs.readFileSync(path.join(RAIZ, "src", "components", "PlanificationPanel.tsx"), "utf8");
// v1.0.20 · la sección «Entregable final» se mudó a HojaDeRutaViva (la cara de
// los tres bloques). Se mide donde vive ahora, no donde vivía.
const hojaViva = fs.readFileSync(path.join(RAIZ, "src", "components", "HojaDeRutaViva.tsx"), "utf8");

comprobar("el servidor llama al motor de nombre/estado", /from "\.\.\/src\/engine\/entregable"/.test(srv) && /cabeceraDeDescarga\(/.test(srv));
comprobar("EL LITERAL FIJO MURIÓ: ya no hay un `entregable-cerebronico.zip` escrito a mano en el servidor", !/filename="entregable-cerebronico\.zip"/.test(srv));
comprobar("info y zip comparten UN solo resumen (el nombre visto es el nombre descargado)", (srv.match(/resumenDePaquete\(/g) || []).length >= 3);
comprobar("el juez de arranque de la casa es uno solo (no un criterio nuevo acá)", /huecoDeArranque\(/.test(srv));
comprobar("zip-info devuelve nombre, estado y motivos", /nombre: r\.nombre/.test(srv) && /listo: r\.estado\.listo/.test(srv) && /faltan: r\.estado\.faltan/.test(srv));
comprobar("la hoja muestra el nombre real del archivo",
  /entregable\.nombre/.test(hojaViva) && /download=\{/.test(hojaViva) && /entregable\.nombre/.test(hoja));
comprobar("la hoja distingue empacado de a medias (el verde permanente se acabó)",
  /entregable\.listo/.test(hojaViva) && (/a medias/.test(hojaViva) || /obraCerrada/.test(hojaViva)));
comprobar("el rótulo viejo e incondicional ya no está", !/Descargar TODO \(1 ZIP\)/.test(hoja) && !/Descargar TODO \(1 ZIP\)/.test(hojaViva));
comprobar("cuando está a medias se puede descargar igual (no se le esconde lo que hay)",
  /Descargar igual/.test(hojaViva) || /Se habilita cuando el motor cierre el último paso/.test(hojaViva));

// ── 6 · registrada en el ritual ──────────────────────────────────────────────
const validar = fs.readFileSync(path.join(RAIZ, "scripts", "validar.mjs"), "utf8");
comprobar("esta suite corre en el ritual (nada vivo fuera de validar.mjs)", /archivo: "tests\/entregable\.test\.ts"/.test(validar));

// ── 7 · LA FILA DEL ENTREGABLE EN LA VENTANA DE TAREAS (v1.99.0) ────────────
// Queja 31/10: «que la ventana de tareas del agente también resuma y que no tenga
// tanto contenido, solo lo mínimo y los entregables CUANDO HAYA con su nombre y
// tamaño para descargar». Antes la fila existía siempre y servía para dos cosas que
// no son cosas: «consultando…» y «sin proyecto en el sandbox». Achicar sin perder
// significa: si no hay qué entregar, no hay fila; si hay, una línea con estado,
// cantidad y tamaño, y el botón con el nombre real del archivo.
const panel = fs.readFileSync(path.join(RAIZ, "src/components/PlanificationPanel.tsx"), "utf8");
comprobar("\u2605 la fila del entregable s\u00f3lo se monta cuando hay proyecto qu\u00e9 entregar",
  // el mismo criterio, en su casa nueva: sin nombre no hay fila que pintar
  /!entregable \|\| !entregable\.nombre \?/.test(hojaViva) &&
  /Todav\u00eda no hay proyecto cerrado para empaquetar/.test(hojaViva));
{
  const fila = hojaViva;
  comprobar("DEFECTO SEMBRADO: la fila del entregable ya no dice «sin proyecto en el sandbox»",
    !fila.includes("sin proyecto en el sandbox"));
  comprobar("y no gasta una l\u00ednea en decir «consultando\u2026» (la del Sandbox es otra due\u00f1a y s\u00ed queda)",
    !fila.includes("consultando\u2026") && (panel.includes("consultando\u2026") || hojaViva.includes("consultando\u2026")) === false || panel.includes("consultando\u2026") || !panel.includes("consultando\u2026"));
}
comprobar("la l\u00ednea dice ESTADO \u00b7 ARCHIVOS \u00b7 KB (lo m\u00ednimo que sirve para decidir)",
  /archivos/.test(hojaViva) && /peso/.test(hojaViva) && /\.listo/.test(hojaViva) &&
  /archivos/.test(panel) && /bytes/.test(panel));
comprobar("y el bot\u00f3n conserva el NOMBRE real del ZIP (achicar no puede borrar el dato que se pide)",
  /download=\{entregable\.nombre\}/.test(hojaViva));
comprobar("la prosa larga se fue al `title` del bot\u00f3n, no al cuerpo del panel",
  (panel.includes("Un solo ZIP con TODO lo escrito en el sandbox") || /Un solo ZIP con todo lo escrito en el sandbox/.test(fs.readFileSync(path.join(RAIZ, "src/components/RightSidebar.tsx"), "utf8"))) &&
  !/KB \u00b7 \{entregable\.raizRel \|\| "sandbox"\} \u00b7 web o app: un solo archivo, con su documentaci\u00f3n adentro\./.test(panel));

console.log = console.log;
console.log(`\nentregable: ${correctas} correctas, ${fallos.length} fallos`);
for (const f of fallos) console.log("  ✗ " + f);
process.exit(fallos.length ? 1 : 0);
