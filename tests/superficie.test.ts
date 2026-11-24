/**
 * tests/superficie.test.ts — CUÁNTO GRITA CADA PANEL (v1.83.0 · FASE 4)
 * ====================================================================
 * La regla del plano (V8 §7.2, de la queja de Mario 26/10): panel con MAS DE 3
 * acciones => UNA primaria visible + el resto en «⚙ Avanzado», plegado POR
 * DEFECTO. Esta suite NO abre un navegador: congela el contrato en tres capas
 *   1. el registro puro (contratoSuperficie.ts) contra el fixture versionado;
 *   2. la regla aplicada (visibilidadPorRegla): <=3 todo visible, >3 una sola;
 *   3. lectura de fuente: el componente dueño tiene el <Avanzado panel="...">
 *      y los botones plegados viven DENTRO del bloque (marcadores de texto);
 *      afuera solo la primaria. Si alguien saca un boton sin actualizar el
 *      contrato, se pone rojo antes que Mario.
 * Tambien congela el MODO LIMPIO: dueno unico del estado (App), clave LS fija,
 * boton en la barra del chat y la barra izquierda realmente condicionada.
 */
import * as fs from "node:fs";
import * as assert from "node:assert";
import { PANELS_CONTRATO, visibilidadPorRegla, accionesVisiblesEnDefault } from "../src/engine/contratoSuperficie";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });
const lee = (r: string) => fs.readFileSync(new URL("../" + r, import.meta.url), "utf8");

const FIX = JSON.parse(lee("tests/fixtures/superficie-v1.83.0.json"));

prueba("registro y fixture baten panel por panel (ningun panel se agrega/quita en silencio)", () => {
  const ids = PANELS_CONTRATO.map((p) => p.id).sort();
  assert.deepStrictEqual(ids, Object.keys(FIX.paneles).sort());
  for (const p of PANELS_CONTRATO) {
    const f = FIX.paneles[p.id];
    const vis = accionesVisiblesEnDefault(p);
    assert.strictEqual(vis.length, f.visibles_default, `${p.id}: visibles ${vis}`);
    assert.strictEqual(p.avanzadas.length, f.plegadas, `${p.id}: plegadas`);
    assert.strictEqual(visibilidadPorRegla([p.primaria, ...p.avanzadas], p.primaria).llevaAvanzado, !!f.llevaAvanzado);
  }
});

prueba("la regla en si: 3 acciones se muestran enteras; 4 dejan una afuera", () => {
  assert.strictEqual(visibilidadPorRegla(["a", "b", "c"], "a").visibles.length, 3);
  const r = visibilidadPorRegla(["a", "b", "c", "d"], "a");
  assert.deepStrictEqual(r.visibles, ["a"]);
  assert.deepStrictEqual(r.plegadas, ["b", "c", "d"]);
});

prueba("explorador: Adjuntar afuera; Borrar/Plantilla/.cn/Abrir adentro del ⚙", () => {
  const f = lee("src/components/RightSidebar.tsx");
  const i = f.indexOf('<Avanzado panel="explorador"');
  assert.ok(i > 0, "el explorador usa el ⚙");
  const fin = f.indexOf("</Avanzado>", i);
  assert.ok(fin > i, "y cierra el bloque");
  for (const b of ["Borrar todo", "Plantilla", "Abrir .", "Restaurar la plantilla"]) {
    const p = f.indexOf(b, i);
    assert.ok(p > i && p < fin, `«${b}» debe estar DENTRO del ⚙ (en ${p}, bloque ${i}..${fin})`);
  }
  const adj = f.indexOf("Adjuntar\n              </button>");
  assert.ok(adj > 0 && adj < i, "Adjuntar (la primaria) queda ANTES del ⚙");
});

prueba("chat-input (v2.3.2): sin bolso; Canal directo, Adjuntar, Encolar, Detener y Enviar a la vista", () => {
  // La valla vieja exigía que las tres acciones estuvieran DENTRO del ⚙. El usuario
  // dio vuelta esa decisión el 4/11 («son necesarios a la vista siempre»), así que se
  // bate la PROPIEDAD que importa y que sigue siendo suya: ninguna acción de la
  // barra desapareció, y ninguna quedó escondida detrás de un desplegable.
  const f = lee("src/components/ChatCenter.tsx");
  assert.ok(!f.includes('<Avanzado panel="chat-input"'), "el bolso de la barra del chat ya no existe");
  for (const b of ["CANAL DIRECTO", "Adjuntar archivos al mensaje", "Encolar", "Detener generaci", "Enviar requerimiento"]) {
    assert.ok(f.includes(b), `«${b}» sigue existiendo en la barra`);
  }
  const c = lee("src/engine/contratoSuperficie.ts");
  const seg = (c.match(/id: "chat-input",[\s\S]{0,900}/) || [""])[0];
  assert.ok(/avanzadas: \[\]/.test(seg), "el contrato declara cero avanzadas en chat-input");
  assert.ok(/"Canal directo", "Adjuntar", "Encolar"/.test(seg), "… y las declara a la vista, no borradas");
});

prueba("modo limpio: un solo dueno, boton en el chat y barra izquierda condicionada", () => {
  const app = lee("src/App.tsx");
  assert.ok(app.includes('localStorage.getItem("cn_modo_limpio")'), "la clave LS es fija");
  assert.ok(app.includes("{modoLimpio ? null : ("), "LeftSidebar se esconde de verdad");
  assert.ok(app.includes("onToggleModoLimpio={toggleModoLimpio}"), "y el boton del chat manda en App");
  const cc = lee("src/components/ChatCenter.tsx");
  assert.ok(cc.includes("Modo limpio"), "el boton existe en la barra del chat");
});

prueba("exencion declarada: Ajustes PC es navegacion por pestanas, no botonera", () => {
  const p = PANELS_CONTRATO.find((x) => x.id === "ajustes-pc")!;
  assert.ok(p.exenta && p.exenta.length > 20, "la exencion tiene motivo escrito");
  const f = lee("src/components/ConfigModal.tsx");
  assert.ok(f.includes("tab") || f.includes("Tab"), "y el modal efectivamente es por pestanas");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  \u2713 " + c.nombre); }
  catch (e: any) { fallos++; console.log("  \u2717 " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nsuperficie: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
