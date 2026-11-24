/**
 * tests/rutasEspejosDerivadas.test.ts — LA VALLA DEL PROMPT QUE MENTÍA (v2.1.2)
 * ==============================================================================
 * POR QUÉ EXISTE
 * --------------
 * `rutasSistema.ts` le decía al modelo «Espejos personalizados:
 * ~/.cerebronico/espejos/» mientras el servidor leía
 * `PROJECT_ROOT/.cerebronico/espejos` (server.ts:4995). En la máquina de Mario
 * coincidían por casualidad (PROJECT_ROOT = C:\Cerebronico y HOME no intervenía).
 * En cualquier otra instalación el modelo mandaba al usuario a la home, el
 * cargador no miraba ahí nunca, y el síntoma era idéntico al ya visto: carpeta
 * «vacía» y nadie se queja.
 *
 * Que la constante no la importara nadie no la volvía inofensiva: la volvía
 * INVIJILABLE. Esta valla la vuelve vigilable.
 *
 * QUÉ EXIGE (v2.1.2 · opción b: el mapa es el índice, el cable es el cable)
 * --------------------------------------------------------------------------
 * 1. `raizEspejosPersonalizados()` deriva de la raíz de datos: con
 *    `C:\Cerebronico` devuelve `C:\Cerebronico\.cerebronico\espejos\`.
 * 2. La constante exportada `RUTA_ESPEJOS_PERSONALIZADOS` NO es el literal con
 *    `~` — es la derivada, la que usa el CABLE.
 * 3. El texto del prompt dice la forma CANÓNICA `~/.cerebronico/espejos/`:
 *    el mapa es el índice y el modelo entiende `~` sin expandir. El detalle de
 *    las dos raíces vive en RUTAS-DEL-SISTEMA.md, junto a CN_CEREBRO_MOTOR,
 *    CN_CEREBRO_DB y HINDSITE_API_URL, que ya siguen ese precedente.
 * 4. La ruta derivada coincide con la que usa el servidor
 *    (`path.join(PROJECT_ROOT, ".cerebronico", "espejos")`).
 * 5. El mapa NO nombra la ruta Windows concreta: eso cuesta 67 chars y el techo
 *    del mapa es 3000. Si vuelve, `rutasSistema.test.ts:135` se pone rojo.
 */
import * as assert from "node:assert";
import * as path from "node:path";
import {
  raizEspejosPersonalizados,
  RUTA_ESPEJOS_PERSONALIZADOS,
  textoDeRutasSistema,
} from "../src/engine/rutasSistema";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });

prueba("raizEspejosPersonalizados deriva de la raíz de datos (Windows)", () => {
  const r = raizEspejosPersonalizados("windows", "C:\\Cerebronico");
  assert.strictEqual(r, "C:\\Cerebronico\\.cerebronico\\espejos\\", "derivó: " + r);
});

prueba("raizEspejosPersonalizados deriva de la raíz de datos (unix)", () => {
  const r = raizEspejosPersonalizados("unix", "/home/mario/CN");
  assert.strictEqual(r, "/home/mario/CN/.cerebronico/espejos/", "derivó: " + r);
});

prueba("raizEspejosPersonalizados sin raíz explícita usa la del SO", () => {
  assert.strictEqual(
    raizEspejosPersonalizados("windows"),
    "C:\\Cerebronico\\.cerebronico\\espejos\\",
    "sin raíz explícita debe caer en la raíz de datos por defecto",
  );
});

prueba("la constante exportada NO es el literal con ~ (el bug de la v2.1.1)", () => {
  assert.ok(
    !RUTA_ESPEJOS_PERSONALIZADOS.includes("~"),
    "RUTA_ESPEJOS_PERSONALIZADOS todavía contiene `~`: " + RUTA_ESPEJOS_PERSONALIZADOS,
  );
  assert.ok(
    RUTA_ESPEJOS_PERSONALIZADOS.includes(".cerebronico"),
    "debe apuntar a .cerebronico: " + RUTA_ESPEJOS_PERSONALIZADOS,
  );
});

prueba("★ el texto del prompt nombra la ruta DERIVADA, no la `~` (contrato de la 1.99.0 restaurado)", () => {
  // v2.2.6 · SE RESTABLECIÓ EL CONTRATO DE LA 1.99.0. En v2.1.2 esta valla se
  // invirtió (pasó a EXIGIR la forma `~/.cerebronico/espejos/` y a PROHIBIR la
  // ruta derivada) para ahorrar 67 caracteres del mapa. El ahorro era de 15
  // caracteres; el costo, que el modelo recibiera en Windows una ruta que apunta
  // a C:\Users\<usuario> y no a la raíz de datos donde el server escribe los
  // espejos. Un contrato invertido a fuerza de editar la valla es la deriva más
  // cara que existe: el test verde sostiene el bug.
  const texto = textoDeRutasSistema({ so: "windows", raizDatos: "C:\\Cerebronico", raizApp: "app" });
  assert.ok(
    !texto.includes("~/.cerebronico/espejos"),
    "el prompt no puede mandar al usuario a la home: en Windows `~` no se expande",
  );
  assert.ok(
    texto.includes("C:\\Cerebronico\\.cerebronico\\espejos"),
    "el mapa debe nombrar la ruta real derivada de la raíz de datos",
  );
});

prueba("el mapa cabe en el techo de 3000 chars (opción b: 2943)", () => {
  const texto = textoDeRutasSistema({ so: "windows", raizDatos: "C:\\Cerebronico" });
  assert.ok(
    texto.length < 3000,
    "el mapa mide " + texto.length + " chars y el techo es 3000",
  );
});

let fallos = 0;
for (const c of casos) {
  try {
    c.fn();
    console.log("  \u2713 " + c.nombre);
  } catch (e: any) {
    fallos++;
    console.log("  \u2717 " + c.nombre);
    console.log("    " + String(e?.message).split("\n").slice(0, 6).join("\n"));
  }
}
console.log(`\nrutasEspejosDerivadas: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
