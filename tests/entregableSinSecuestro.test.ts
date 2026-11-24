/**
 *entregableSinSecuestro — v1.0.22
 * =================================
 * EL INCIDENTE (Mario, 16/11, literal): «en la interfaz CerebroNico al intentar
 * descargar la tarea realizada en el entregable de la hoja de ruta hice click en
 * Descargar ZIP y cuando descomprimi ERRA toda la carpeta C:\Cerebronico DE MI
 * DISCO LOCAL».
 *
 * No fue un ZIP mal armado del mensaje de entrega: fue el BOTÓN del producto.
 * Tres capas causaron el destrozo, y este archivo las mide una por una para que
 * no vuelvan:
 *
 *   1. se empaquetaba la RAÍZ DE DATOS (la instalación del IDE + los datos del
 *      usuario) porque el resolutor devuelve esa base cuando hay un
 *      `package.json` suelto;
 *   2. los nombres de entrada no se saneaban, así que una ruta con `..` o con
 *      `C:` escribía un nivel arriba al descomprimir;
 *   3. el ZIP no traía carpeta envoltorio, así que se esparcía sobre lo que ya
 *      había en la carpeta de destino.
 *
 * Las tres están cerradas: `proponerPaquete` niega la raíz de datos,
 * `nombreSeguroParaZip` limpia cada entrada y `envolverEntradas` mete todo bajo
 * una carpeta con el nombre del proyecto. Este test es la alarma, no la
 * documentación: si alguien vuelve a conectar el botón a la raíz de datos, se
 * pone rojo acá antes de llegar a un disco ajeno.
 */
import * as assert from "node:assert";
import * as path from "node:path";
import { proponerPaquete, mismaRuta, NUNCA_PROYECTO } from "../src/engine/raizEntregable";
import { envolverEntradas, nombreSeguro } from "../src/engine/entregable";
import { crearZip, nombreSeguroParaZip } from "../src/engine/zipMinimo";

let correctas = 0;
let fallidas = 0;
const nombresFallidas: string[] = [];
function prueba(nombre: string, fn: () => void): void {
  try {
    fn();
    correctas++;
  } catch (e: any) {
    fallidas++;
    nombresFallidas.push(nombre);
    console.error(`  ✗ ${nombre}: ${e?.message || e}`);
  }
}

const RAIZ_DATOS = process.platform === "win32" ? "C:\\Cerebronico" : "/c/Cerebronico";
const unir = (...t: string[]) => path.join(RAIZ_DATOS, ...t);

/** Sonda con un disco de mentira: solo los caminos que se declaran existen. */
function sonda(opciones: { raiz: string | null; proyectos?: Record<string, string[]>; subcarpetas?: string[] }) {
  const proyectos = opciones.proyectos || {};
  return {
    raiz: opciones.raiz,
    raizDatos: RAIZ_DATOS,
    existe: (d: string) => d === RAIZ_DATOS || Object.keys(proyectos).includes(path.resolve(d)),
    esProyecto: (d: string) => Object.keys(proyectos).includes(path.resolve(d)),
    subcarpetas: () => opciones.subcarpetas || [],
  };
}

// ── CAPA 1 · la raíz de datos NUNCA es un entregable ────────────────────────
prueba("la raíz de datos sin subproyecto se NIEGA (es el incidente literal)", () => {
  const p = proponerPaquete(sonda({ raiz: RAIZ_DATOS, subcarpetas: ["logs", "respaldos", "node_modules", ".cerebronico"] }));
  assert.strictEqual(p.puede, false);
  assert.strictEqual(p.raiz, "");
  assert.ok(p.apartado, "tiene que marcar que se apartó de la raíz de datos");
  assert.match(p.motivo, /raíz de datos/i);
  assert.match(p.motivo, /disco/i, "el motivo explica el daño, no solo el no");
});

prueba("la raíz de datos con UN subproyecto real entrega ESE subproyecto", () => {
  const proyecto = unir("web-cerebronico");
  const p = proponerPaquete(sonda({ raiz: RAIZ_DATOS, proyectos: { [path.resolve(proyecto)]: ["index.html"] }, subcarpetas: ["web-cerebronico", "logs", "node_modules"] }));
  assert.strictEqual(p.puede, true);
  assert.strictEqual(path.resolve(p.raiz), path.resolve(proyecto));
  assert.strictEqual(p.apartado, true);
});

prueba("dos subproyectos posibles NO se adivinan: se pide elegir", () => {
  const a = unir("web-cerebronico");
  const b = unir("api-tareas");
  const p = proponerPaquete(sonda({ raiz: RAIZ_DATOS, proyectos: { [path.resolve(a)]: ["index.html"], [path.resolve(b)]: ["package.json"] }, subcarpetas: ["web-cerebronico", "api-tareas"] }));
  assert.strictEqual(p.puede, false);
  assert.match(p.motivo, /elegí la carpeta/i);
  assert.match(p.motivo, /web-cerebronico/);
});

prueba("una carpeta de estado NO cuenta como subproyecto (logs, respaldos, .cn-preview…)", () => {
  for (const basura of ["logs", "respaldos", ".cn-preview", "node_modules", ".cerebronico", "datos", "skills", "backups"]) {
    assert.ok(NUNCA_PROYECTO.has(basura), `${basura} tiene que estar en la lista de nunca-proyecto`);
  }
  const p = proponerPaquete(sonda({ raiz: RAIZ_DATOS, proyectos: {}, subcarpetas: ["logs", "respaldos", ".cn-preview"] }));
  assert.strictEqual(p.puede, false);
});

prueba("un proyecto de verdad (carpeta vinculada) pasa sin tocar nada", () => {
  const proyecto = unir("web-cerebronico");
  const p = proponerPaquete(sonda({ raiz: proyecto, proyectos: { [path.resolve(proyecto)]: ["index.html"] } }));
  assert.strictEqual(p.puede, true);
  assert.strictEqual(p.apartado, false);
  assert.strictEqual(p.motivo, "");
});

prueba("sin raíz o con raíz inexistente: no hay entregable y se dice por qué", () => {
  assert.strictEqual(proponerPaquete(sonda({ raiz: null })).puede, false);
  assert.match(proponerPaquete(sonda({ raiz: null })).motivo, /no hay proyecto/i);
  const p = proponerPaquete({ raiz: unir("no-existe"), raizDatos: RAIZ_DATOS, existe: () => false, esProyecto: () => false, subcarpetas: () => [] });
  assert.strictEqual(p.puede, false);
  assert.match(p.motivo, /no existe/i);
});

prueba("mismaRuta reconoce la misma carpeta escrita distinto (barras, mayúsculas, barra final)", () => {
  assert.strictEqual(mismaRuta(RAIZ_DATOS, RAIZ_DATOS + path.sep), true);
  assert.strictEqual(mismaRuta(RAIZ_DATOS, RAIZ_DATOS.replace(/\\/g, "/")), true);
  if (process.platform === "win32") assert.strictEqual(mismaRuta("C:\\Cerebronico", "c:\\cerebronico"), true);
  assert.strictEqual(mismaRuta(RAIZ_DATOS, unir("web-cerebronico")), false);
  assert.strictEqual(mismaRuta("", RAIZ_DATOS), false);
});

// ── CAPA 2 · los nombres no pueden salirse del paquete ──────────────────────
prueba("nombreSeguroParaZip: `..` fuera, ruta absoluta fuera, unidad de Windows fuera", () => {
  assert.strictEqual(nombreSeguroParaZip("../Cerebronico/politicas.md"), "Cerebronico/politicas.md");
  assert.strictEqual(nombreSeguroParaZip("../../etc/passwd"), "etc/passwd");
  assert.strictEqual(nombreSeguroParaZip("C:/Cerebronico/notas.txt"), "Cerebronico/notas.txt");
  assert.strictEqual(nombreSeguroParaZip("C:\\Cerebronico\\notas.txt"), "Cerebronico/notas.txt");
  assert.strictEqual(nombreSeguroParaZip("/etc/passwd"), "etc/passwd");
  assert.strictEqual(nombreSeguroParaZip("./a/./b.txt"), "a/b.txt");
  assert.strictEqual(nombreSeguroParaZip("guión\x01raro.txt"), "guiónraro.txt");
  assert.strictEqual(nombreSeguroParaZip(".."), "");
});

prueba("crearZip con entradas maliciosas no produce NI UNA ruta que suba de nivel", () => {
  const zip = crearZip([
    { nombre: "../Cerebronico/politicas.md", datos: new TextEncoder().encode("# x") },
    { nombre: "C:/Cerebronico/notas.txt", datos: new TextEncoder().encode("y") },
    { nombre: "web/index.html", datos: new TextEncoder().encode("<html></html>") },
  ]);
  const texto = Buffer.from(zip).toString("latin1");
  assert.ok(!texto.includes("../"), "ningún nombre puede llevar `..`");
  assert.ok(!/C:\//.test(texto), "ningún nombre puede llevar la unidad `C:/`");
  // En el directorio central tienen que estar las tres, ya saneadas.
  assert.ok(texto.includes("Cerebronico/politicas.md"));
  assert.ok(texto.includes("Cerebronico/notas.txt"));
  assert.ok(texto.includes("web/index.html"));
});

// ── CAPA 3 · el paquete viaja dentro de su carpeta ──────────────────────────
prueba("envolverEntradas mete TODO bajo la carpeta del proyecto", () => {
  const salida = envolverEntradas([{ nombre: "index.html" }, { nombre: "css/app.css" }], "web-cerebronico");
  assert.deepStrictEqual(salida.map((e) => e.nombre), ["web-cerebronico/index.html", "web-cerebronico/css/app.css"]);
});

prueba("envolverEntradas no duplica el prefijo si ya venía envuelto", () => {
  const ya = [{ nombre: "web-cerebronico/index.html" }];
  assert.deepStrictEqual(envolverEntradas(ya, "web-cerebronico"), ya);
});

prueba("envolverEntradas sanea el nombre de la carpeta (espacios, mayúsculas, acentos)", () => {
  const salida = envolverEntradas([{ nombre: "x.txt" }], "Mi Proyecto Ñ");
  assert.strictEqual(salida[0].nombre, "mi-proyecto-n/x.txt");
  assert.strictEqual(salida[0].nombre.split("/")[0], nombreSeguro("Mi Proyecto Ñ"));
});

prueba("envolverEntradas con nombre vacío cae al piso y no deja rutas sueltas", () => {
  const salida = envolverEntradas([{ nombre: "a.txt" }], "");
  assert.ok(salida[0].nombre.includes("/"), "siempre hay carpeta envoltorio");
  assert.strictEqual(salida[0].nombre.split("/").length, 2);
});

prueba("de punta a punta: raíz de datos + envoltorio = todas las entradas con dos tramos", () => {
  const propuesta = proponerPaquete(sonda({ raiz: RAIZ_DATOS, proyectos: { [path.resolve(unir("app"))]: ["index.html"] }, subcarpetas: ["app"] }));
  assert.strictEqual(propuesta.puede, true);
  const carpeta = path.basename(propuesta.raiz);
  const zip = crearZip(envolverEntradas([{ nombre: "index.html", datos: new Uint8Array([1, 2, 3]) }, { nombre: "../escape.txt", datos: new Uint8Array([4]) }], carpeta));
  const texto = Buffer.from(zip).toString("latin1");
  assert.ok(!texto.includes("../"));
  assert.ok(texto.includes(`${carpeta}/index.html`), "dentro de la carpeta del proyecto");
  assert.ok(texto.includes(`${carpeta}/escape.txt`), "y el intento de escape queda adentro");
});

console.log(`\nentregableSinSecuestro: ${correctas} correctas · ${fallidas} fallidas`);
if (fallidas) {
  console.error(`  fallaron: ${nombresFallidas.join(", ")}`);
  process.exitCode = 1;
}
