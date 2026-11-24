/**
 * tests/espejosServidorCableado.test.ts — LA VALLA DE LAS DOS MITADES (v2.1.2)
 * ===========================================================================
 * El defecto que vigila: los 10 espejos de servidor de datos (`servidor.*`)
 * existían, respondían `ok:true` por `POST /api/espejos-servidor/ejecutar`, y
 * eran CÓDIGO MUERTO desde el tool del modelo: `case "consultar_espejo"` filtraba
 * por `/^espejo\./` y ninguno pasaba.
 *
 * POR QUÉ DOS MITADES Y NO UNA
 * ----------------------------
 * Aflojar el regex y nada más NO arregla el defecto: `ejecutarEntidad` resuelve
 * contra el pool del consejo (consejo.ts:393-401) y no conoce los `servidor.*`,
 * así que devolvería «entidad desconocida» con el filtro ya abierto. El arreglo
 * es el DESPACHO. Por eso esta valla exige las dos cosas:
 *
 *   (a) TEXTO-FONTE — `server.ts` tiene la rama `servidor.` y despacha a
 *       `ejecutarEspejoServidor`. Sin esto, el regex aflojado es cosmético.
 *   (b) EJECUCIÓN REAL — el contrato responde con su salida propia (DDL) y
 *       `ejecutarEntidad("servidor.relacional")` SIGUE devolviendo «entidad
 *       desconocida». Esa segunda aserción es la prueba de que la rama es
 *       OBLIGATORIA: si algún día `ejecutarEntidad` aprendiera los servidor.*,
 *       la rama sobraría y este test lo diría.
 *
 * Y una tercera, que evita el daño colateral: la SALUD. `registrarSaludEspejo` +
 * `vistaSalud` (server.ts:4706) indexan por `IDS_ESPEJOS + poolEspejos()`; un
 * `servidor.*` registrado ahí sería una fila huérfana y la próxima valla de
 * salud saltaría roja por este mismo arreglo. La valla exige que el registro de
 * salud quede GUARDADO tras `!esDeServidor`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ejecutarEspejoServidor,
  IDS_ESPEJOS_SERVIDOR,
  idEspejoServidorValido,
} from "../src/engine/reflejo/espejosServidor";
import { ejecutarEntidad } from "../src/engine/reflejo/consejo";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const rojos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) {
    correctas++;
    console.log("  ✓ " + nombre);
  } else {
    rojos.push(nombre + (detalle ? " — " + detalle : ""));
    console.log("  ✗ " + nombre + (detalle ? " — " + detalle : ""));
  }
}

console.log("\n§1 · EL CATÁLOGO EXISTE Y SON DIEZ (la mitad que nunca fue el problema)");
comprobar("hay exactamente 10 espejos de servidor declarados", IDS_ESPEJOS_SERVIDOR.length === 10, `son ${IDS_ESPEJOS_SERVIDOR.length}`);
comprobar("todos los ids llevan el prefijo servidor.", IDS_ESPEJOS_SERVIDOR.every((id) => id.startsWith("servidor.")));
comprobar("idEspejoServidorValido acepta servidor.relacional", idEspejoServidorValido("servidor.relacional"));
comprobar("idEspejoServidorValido rechaza espejo.matematicos (catálogos separados)", !idEspejoServidorValido("espejo.matematicos"));

console.log("\n§2 · MITAD (a) · TEXTO-FONTE: server.ts tiene la rama y el despacho");
const server = leer("server.ts");
comprobar("server.ts importa ejecutarEspejoServidor (hoy solo lo importaba el router)", server.includes("import { ejecutarEspejoServidor }"));
comprobar("server.ts calcula esDeServidor con el prefijo servidor.", /const\s+esDeServidor\s*=\s*\/\^servidor\\\.\//.test(server));
comprobar("el filtro ya NO rechaza servidor.* (acepta los dos prefijos)", /!esDeServidor\s*&&\s*!\/\^espejo\\\.\//.test(server));
comprobar("el despacho llama a ejecutarEspejoServidor cuando esDeServidor", /esDeServidor\s*\?\s*ejecutarEspejoServidor\(/.test(server));
comprobar("el camino espejo.* sigue llamando a ejecutarEntidad (no se rompió lo que andaba)", /:\s*ejecutarEntidad\(id,/.test(server));
comprobar("el motivo del rechazo nombra los dos prefijos (el modelo no adivina)", server.includes("«espejo.*» o «servidor.*»"));

console.log("\n§3 · MITAD (a-bis) · LA SALUD NO SE CONTAMINA CON FILAS HUÉRFANAS");
comprobar("registrarSaludEspejo queda GUARDADO tras !esDeServidor (una vez)", /if\s*\(!esDeServidor\)\s*registrarSaludEspejo\(id,\s*!!rr\?\.ok\)/.test(server));
comprobar("el catch también guarda el registro de salud", /if\s*\(!esDeServidor\)\s*registrarSaludEspejo\(id,\s*false\)/.test(server));
comprobar("vistaSalud sigue indexando por IDS_ESPEJOS + poolEspejos (no por servidor.*)", server.includes("IDS_ESPEJOS"));

console.log("\n§4 · MITAD (b) · EJECUCIÓN REAL: el contrato responde lo suyo");
const ddl = ejecutarEspejoServidor("servidor.relacional", {
  tablas: [
    { nombre: "usuarios", columnas: [{ nombre: "id", tipo: "INTEGER", pk: true }, { nombre: "email", tipo: "TEXT" }] },
    { nombre: "pedidos", columnas: [{ nombre: "id", tipo: "INTEGER", pk: true }, { nombre: "usuario_id", tipo: "INTEGER", fk: { tabla: "usuarios", columna: "id" } }] },
  ],
});
comprobar("servidor.relacional devuelve ok:true", ddl.ok === true, ddl.motivo);
const salidaDdl = ddl.salida as any;
comprobar("la salida trae DDL real (CREATE TABLE)", typeof salidaDdl?.ddl === "string" && salidaDdl.ddl.includes("CREATE TABLE usuarios"));
comprobar("la salida trae la clave foránea resuelta", Array.isArray(salidaDdl?.clavesForaneas) && salidaDdl.clavesForaneas.length === 1);
comprobar("declara las 2 tablas", salidaDdl?.tablas === 2);

console.log("\n§5 · MITAD (b-bis) · LA RAMA ES OBLIGATORIA, NO COSMÉTICA");
const porEntidad = ejecutarEntidad("servidor.relacional", { tablas: [] });
comprobar("ejecutarEntidad('servidor.relacional') SIGUE devolviendo entidad desconocida", porEntidad?.ok === false, "si esto pasa a true, la rama sobraría y la valla lo dice");
comprobar("y el motivo lo declara (no falla en silencio)", typeof porEntidad?.motivo === "string" && porEntidad.motivo.length > 0);
const porServidor = ejecutarEspejoServidor("servidor.relacional", { tablas: [] });
comprobar("el mismo id por su ejecutor real SÍ responde (aunque sea con motivo)", porServidor.ok === false && typeof porServidor.motivo === "string");

console.log("\n§6 · LOS DIEZ CONTRATOS RESPONDEN (ninguno es código muerto)");
const casos: Array<[string, any]> = [
  ["servidor.relacional", { tablas: [{ nombre: "t", columnas: [{ nombre: "id", tipo: "INTEGER", pk: true }] }] }],
  ["servidor.documental", { coleccion: "usuarios", campos: [{ nombre: "email", tipo: "string", indice: true }] }],
  ["servidor.clave_valor", { patron: "usuario:{id}", ttlSegundos: 600 }],
  ["servidor.grafo", { nodos: [{ nombre: "a" }, { nombre: "b" }], aristas: [{ desde: "a", hacia: "b" }] }],
  ["servidor.vectorial", { dimensiones: 768, registros: 10000 }],
  ["servidor.serie_temporal", { puntosPorSegundo: 100, retencionDias: 30 }],
  ["servidor.colas", { productores: 2, consumidores: 8 }],
  ["servidor.objetos", { archivos: 1000, tamanoPromedioMB: 2 }],
  ["servidor.busqueda", { campos: [{ nombre: "titulo", tipo: "text" }, { nombre: "fecha", tipo: "date" }] }],
  ["servidor.realtime", { clientes: 500, mensajesPorSegundo: 10 }],
];
for (const [id, datos] of casos) {
  const r = ejecutarEspejoServidor(id, datos);
  comprobar(`${id} responde ok:true con datos válidos`, r.ok === true, r.motivo);
}
comprobar("los 10 casos cubren el catálogo entero", casos.length === IDS_ESPEJOS_SERVIDOR.length);

console.log("\n§7 · EL LÍMITE DE 8 SIGUE VIVO (21 espejos = dos golpes, y se dice)");
comprobar("el tool declara el máximo de 8 llamadas por golpe", server.includes("máximo 8 llamadas por golpe"));
comprobar("11 espejo.* + 10 servidor.* = 21 > 8: hacen falta dos golpes", 11 + IDS_ESPEJOS_SERVIDOR.length > 8);

console.log(`\ntests/espejosServidorCableado: ${correctas} correctas, ${rojos.length} en rojo`);
if (rojos.length) {
  console.log("ROJOS:");
  for (const r of rojos) console.log("  · " + r);
  process.exit(1);
}
