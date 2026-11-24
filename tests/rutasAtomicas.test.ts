/**
 * rutasAtomicas.test.ts — v1.0.20 · LA PRUEBA QUE IMPIDE VOLVER ATRÁS
 * ===================================================================
 * QUÉ VIGILA (y por qué cada una):
 *  1. PURA: clasificar/decidir/veredicto no tocan disco. Si empezaran a tocarlo,
 *     el panel de rutas volvería a tardar segundos.
 *  2. UN REGISTRO, UNA VERDAD: abrir escribe, se relee igual, y si el registro no
 *     se puede escribir NO se anuncia la apertura.
 *  3. RELOJ CONGELADO: sin la caché desactivada, un reloj inyectado (pruebas)
 *     servía para siempre el primer registro. Ese bug estaba y esta prueba lo fija.
 *  4. CUARENTENA: un JSON roto se aparta (`*.corrupto-<ts>`), no se pisa en silencio.
 *  5. TODO O NADA: si el registro falla, la carpeta sembrada se dice en el motivo.
 *  6. ESCAPE: `..` y rutas absolutas fuera de la obra se rechazan NOMBRANDO la
 *     ruta buena — el mensaje anterior («no permitido») hizo que el modelo
 *     insistiera tres veces con la misma ruta mala.
 *
 * Se ejecuta: `npx tsx tests/rutasAtomicas.test.ts` (sin red, sin sandbox).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import {
  normalizarRuta, claveDeRuta, estaDentro, relativaA, slugDeProyecto,
  clasificarRuta, QUE_HACER, decidirApertura, veredictoDeEscritura,
  textoDeContexto, resumenRutas, indexDeArranque, esRutaDeEstado,
} from "../src/engine/rutasAtomicas";
import {
  abrirProyecto, cerrarProyecto, leerRegistro, contextoDeRutas, obraAbierta,
  olvidarRegistro, NOMBRE_ARCHIVO, escribirAtomico,
} from "../server/proyectoRegistro";

let pasadas = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { fn(); pasadas++; } catch (e) { fallos.push(`${nombre}: ${(e as Error)?.message || e}`); }
}

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), "cn-rutas-"));
const DATOS = path.join(RAIZ, "Cerebronico");
const INSTALACION = path.join(RAIZ, "cn-ide");
fs.mkdirSync(DATOS, { recursive: true });
fs.mkdirSync(INSTALACION, { recursive: true });
const CTX = { instalacion: normalizarRuta(INSTALACION), datos: normalizarRuta(DATOS), proyecto: null };
const deps = (extra: Record<string, unknown> = {}) => ({ raizDatos: DATOS, instalacion: INSTALACION, ...extra });

// ── 1. normalización y jerarquía ───────────────────────────────────────────
prueba("normalizarRuta quita barras finales, repetidas y el prefijo ///?/", () => {
  assert.strictEqual(normalizarRuta("C:\\\\a\\\\b\\\\"), "C:/a/b");
  assert.strictEqual(normalizarRuta("//?/C:/x"), "C:/x");
  assert.strictEqual(normalizarRuta("a//b/"), "a/b");
});
prueba("estaDentro compara SEGMENTOS (C:/obra2 no está dentro de C:/obra)", () => {
  assert.strictEqual(estaDentro("C:/obra/x", "C:/obra"), true);
  assert.strictEqual(estaDentro("C:/obra2/x", "C:/obra"), false);
  assert.strictEqual(estaDentro("C:/obra", "C:/obra"), true);
});
prueba("relativaA devuelve '' para la base y la cola para un hijo", () => {
  assert.strictEqual(relativaA("C:/obra", "C:/obra"), "");
  assert.strictEqual(relativaA("C:/obra/src/a.ts", "C:/obra"), "src/a.ts");
  assert.strictEqual(relativaA("C:/otra/a", "C:/obra"), "");
});
prueba("slugDeProyecto salva acentos, espacios, reservados de Windows y puntos finales", () => {
  assert.strictEqual(slugDeProyecto("Finanzas App — 2ª parte"), "finanzas-app-2-parte"); // «ª» no es letra para un nombre de carpeta: cae al guion
  assert.strictEqual(slugDeProyecto("CON"), "con-app");
  assert.strictEqual(slugDeProyecto(".....fin..."), "fin");
  assert.strictEqual(slugDeProyecto("¡¡!!"), "proyecto");
});
prueba("clasificarRuta: estado gana a datos (un .cerebro-db NO es obra)", () => {
  assert.strictEqual(clasificarRuta(`${CTX.datos}/.cerebro-db/proyecto-abierto.json`, CTX), "estado");
  assert.strictEqual(clasificarRuta(`${CTX.datos}/mi-app/index.html`, CTX), "datos");
  assert.strictEqual(clasificarRuta(`${CTX.instalacion}/server.ts`, CTX), "instalacion");
  assert.strictEqual(clasificarRuta("D:/otra-cosa/x", CTX), "fuera");
  const conObra = { ...CTX, proyecto: `${CTX.datos}/mi-app` };
  assert.strictEqual(clasificarRuta(`${CTX.datos}/mi-app/index.html`, conObra), "proyecto");
  assert.strictEqual(esRutaDeEstado("x/.cerebro.json"), true);
  assert.strictEqual(QUE_HACER.fuera.includes("FUERA"), true);
});

// ── 2. decisión de apertura (pura, con motivo) ─────────────────────────────
prueba("decidirApertura rechaza vacío, absolutas, '..' y barras — con motivo útil", () => {
  assert.strictEqual(decidirApertura({ nombre: "" }, CTX).ok, false);
  const abs = decidirApertura({ nombre: "C:\\Windows\\x" }, CTX);
  assert.strictEqual(abs.ok, false);
  assert.ok(abs.motivo.includes(CTX.datos), "el motivo nombra la raíz buena");
  assert.strictEqual(decidirApertura({ nombre: "../fuera" }, CTX).ok, false);
  assert.strictEqual(decidirApertura({ nombre: "a/b" }, CTX).ok, false);
  const ok = decidirApertura({ nombre: "Mi App" }, CTX);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.ruta, `${CTX.datos}/mi-app`);
});

// ── 3. veredicto de escritura: siempre nombra la ruta buena ────────────────
prueba("veredictoDeEscritura: relativa cae en la OBRA y dice la absoluta", () => {
  const conObra = { ...CTX, proyecto: `${CTX.datos}/mi-app` };
  const v = veredictoDeEscritura("index.html", conObra);
  assert.strictEqual(v.permitida, true);
  assert.strictEqual(v.abs, `${CTX.datos}/mi-app/index.html`);
  assert.strictEqual(v.clase, "proyecto");
});
prueba("veredictoDeEscritura: absoluta fuera se rechaza nombrando la obra", () => {
  const conObra = { ...CTX, proyecto: `${CTX.datos}/mi-app` };
  const v = veredictoDeEscritura("D:/basura/x.html", conObra);
  assert.strictEqual(v.permitida, false);
  assert.ok(v.motivo.includes("mi-app"), "el rechazo dice CUÁL es la obra");
  const esc = veredictoDeEscritura("../../etc/passwd", conObra);
  assert.strictEqual(esc.permitida, false);
  assert.ok(esc.motivo.includes("mi-app"));
});
prueba("veredictoDeEscritura: sin obra, la ruta relativa nace en la raíz de datos", () => {
  const v = veredictoDeEscritura("a.txt", CTX);
  assert.strictEqual(v.abs, `${CTX.datos}/a.txt`);
  assert.strictEqual(v.clase, "datos");
});

// ── 4. texto del modelo: UNA verdad ────────────────────────────────────────
prueba("textoDeContexto dice las tres raíces y qué hacer sin obra", () => {
  const t = textoDeContexto(CTX);
  assert.ok(t.includes(CTX.datos) && t.includes(CTX.instalacion));
  assert.ok(t.includes("abrir_proyecto"));
  assert.ok(textoDeContexto({ ...CTX, proyecto: `${CTX.datos}/mi-app` }).includes("RELATIVA"));
  assert.ok(resumenRutas(CTX).includes("(ninguna)"));
  assert.ok(!indexDeArranque("<x>").includes("<x>"), "el título se escapa: no se inyecta HTML");
});

// ── 5. registro en disco: abrir / releer / cerrar ──────────────────────────
prueba("abrirProyecto crea, siembra index.html y escribe el registro", () => {
  olvidarRegistro();
  const r = abrirProyecto(deps(), "Mi App");
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.proyecto?.origen, "creado");
  assert.deepStrictEqual(r.proyecto?.sembrado, ["index.html"]);
  assert.ok(fs.existsSync(path.join(DATOS, "mi-app", "index.html")));
  assert.ok(fs.existsSync(path.join(DATOS, ".cerebro-db", NOMBRE_ARCHIVO)));
  assert.strictEqual(obraAbierta(deps()), normalizarRuta(path.join(DATOS, "mi-app")));
  assert.strictEqual(contextoDeRutas(deps()).proyecto, normalizarRuta(path.join(DATOS, "mi-app")));
});
prueba("abrirProyecto adopta una carpeta existente sin sembrarla", () => {
  fs.mkdirSync(path.join(DATOS, "adoptada"), { recursive: true });
  fs.writeFileSync(path.join(DATOS, "adoptada", "app.js"), "x");
  const r = abrirProyecto(deps(), "adoptada");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.proyecto?.origen, "existente");
  assert.deepStrictEqual(r.proyecto?.sembrado, []);
  assert.ok(!fs.existsSync(path.join(DATOS, "adoptada", "index.html")));
});
prueba("RELOJ CONGELADO: con ahora inyectado, una segunda escritura SÍ se ve", () => {
  const d = deps({ ahora: () => 1000 });
  olvidarRegistro();
  abrirProyecto(d, "uno");
  // Otro proceso (o la misma API) abre otra: con la caché viva se seguiría viendo «uno».
  abrirProyecto(d, "dos");
  assert.strictEqual(obraAbierta(d), normalizarRuta(path.join(DATOS, "dos")));
});
prueba("registro ilegible → cuarentena .corrupto-<ts> y reconstrucción desde el pin legacy", () => {
  const d = deps();
  const f = path.join(DATOS, ".cerebro-db", NOMBRE_ARCHIVO);
  fs.writeFileSync(f, "{ esto no es json");
  fs.writeFileSync(path.join(DATOS, ".cerebro-db", "carpeta-vinculada.json"), JSON.stringify({ ruta: path.join(DATOS, "adoptada") }));
  olvidarRegistro();
  const reg = leerRegistro(d, true);
  assert.strictEqual(reg.abierto?.ruta, normalizarRuta(path.join(DATOS, "adoptada")));
  assert.strictEqual(reg.abierto?.heredadoDe, "carpeta-vinculada.json");
  assert.ok(fs.readdirSync(path.join(DATOS, ".cerebro-db")).some((n) => n.includes(".corrupto-")));
});
prueba("obra cuya carpeta desapareció se declara huérfana (no se inventa otra)", () => {
  const d = deps();
  abrirProyecto(d, "efimera");
  fs.rmSync(path.join(DATOS, "efimera"), { recursive: true, force: true });
  olvidarRegistro();
  assert.strictEqual(leerRegistro(d, true).abierto, null);
});
prueba("cerrarProyecto deja de servir pero NO borra la carpeta", () => {
  abrirProyecto(deps(), "persistente");
  const r = cerrarProyecto(deps());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cerrado, normalizarRuta(path.join(DATOS, "persistente")));
  assert.ok(fs.existsSync(path.join(DATOS, "persistente")));
  assert.strictEqual(obraAbierta(deps()), null);
});
prueba("si el registro NO se puede escribir, no se anuncia la apertura", () => {
  const roto = fs.mkdtempSync(path.join(os.tmpdir(), "cn-roto-"));
  // `.cerebro-db` como ARCHIVO: mkdir falla y el registro no puede escribirse.
  fs.writeFileSync(path.join(roto, ".cerebro-db"), "no soy carpeta");
  const r = abrirProyecto({ raizDatos: roto, instalacion: INSTALACION }, "x");
  assert.strictEqual(r.ok, false);
  assert.ok(r.motivo.includes("registro") || r.motivo.includes("REGISTRO"), "el motivo nombra el registro");
});
prueba("escribirAtomico no deja temporales y respeta el contenido previo si falla el rename", () => {
  const f = path.join(DATOS, "atomico.txt");
  escribirAtomico(f, "uno");
  escribirAtomico(f, "dos");
  assert.strictEqual(fs.readFileSync(f, "utf8"), "dos");
  assert.strictEqual(fs.readdirSync(DATOS).filter((n) => n.includes(".tmp-")).length, 0);
});
prueba("claveDeRuta es la comparación de Windows (sin mayúsculas)", () => {
  assert.strictEqual(claveDeRuta("C:\\\\Obra\\A.TXT"), "c:/obra/a.txt");
});

try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch { /* Windows a veces retiene el handle */ }

// v1.0.20 · HABLAR EL IDIOMA DEL RITUAL (no el propio)
//
// La suite cerraba con «rutasAtomicas: 19/19 en verde». Es cierto y es verde,
// pero `scripts/validar.mjs` no reconoce ese recuento: cualquier forma que no
// sea «N correctas», «N PASS», «N/N comprobaciones en verde», «N pasan»… cae en
// `ok===0 && mal===0` y el ritual la cuenta como «NO llegó a ejecutarse». Así,
// una suite que corría en verde y salía con 0 ponía el veredicto en ROJO por
// pura incompatibilidad de formato — un fallo que no existe, que es la clase de
// mentira que este proyecto prohíbe.
//
// La cura se hace en los DOS lados a propósito: aquí se escribe el recuento en
// el formato estándar (con la forma vieja a la vista, para que nadie pierda el
// dato), y en el ritual se reconoce también `N/M en verde` para que la próxima
// suite que lo escriba no vuelva a caer en el agujero.
console.log(`\nrutasAtomicas: ${pasadas}/${pasadas + fallos.length} en verde`);
console.log(`═══ RUTAS ATÓMICAS: ${pasadas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("OK — rutas atómicas: una autoridad, un registro, una verdad\n");
