/**
 * tests/gobernante.test.ts — FASE 3: EL GOBERNADOR EN TODAS PARTES (v1.82.0)
 * =========================================================================
 * Congela el plano: «que la máquina mande, no el número fijo».
 *   · workers adaptativos REALES: cores simulados 2/4/8/16 → workers 2/3/7/8,
 *     sin tocar configuración (la recomendación de v1.76.0 ahora SE APLICA);
 *   · presupuesto de RAM del gobernante: >70 % SOSTENIDO → 1 worker con aviso;
 *     un pico suelto no degrada (la palabra del plano es «sostenido»);
 *   · cloud_verifier con cuota propia: timeout, fetch y config del verificador
 *     son suyos — no comparte la ventana del chat;
 *   · cables por lectura de fuente (patrón de la casa): si el runner deja de
 *     acatar al gobernador, o el panel deja de mostrarlo, rojo antes que Mario.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import { workersAdaptativos, presionSostenida, decisionGobernante, UMBRAL_RAM } from "../src/engine/gobernante";
import { resolverPresupuesto } from "../src/engine/memoriaResiliente";
import { Semaforo } from "../src/engine/planRunner";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });
const lee = (r: string) => fs.readFileSync(new URL("../" + r, import.meta.url), "utf8");

prueba("LA TABLA DEL PLANO: 2/4/8/16 núcleos → 2/3/7/8 workers, sin tocar config", () => {
  assert.deepStrictEqual([2, 4, 8, 16].map(workersAdaptativos), [2, 3, 7, 8]);
  assert.strictEqual(workersAdaptativos(1), 2, "piso 2 (el resolutor aún recorta por núcleos)");
  assert.strictEqual(workersAdaptativos(64), 8, "techo 8: más workers que núcleos disponibles es ruido");
  assert.strictEqual(workersAdaptativos(0), 2, "núcleos ilegidos no rompen la regla");
});

prueba("apagada la capacidad, la base vieja del perfil manda (el usuario decide)", () => {
  const d = decisionGobernante({ cores: 16, paralelismoActivo: false, cpuBasePerfil: 2 });
  assert.strictEqual(d.cpuBase, 2);
  assert.strictEqual(d.adaptado, false);
  assert.strictEqual(d.motivo, "");
});

prueba("RAM >70 % SOSTENIDA degrada a 1 worker con aviso; un pico suelto no", () => {
  const sostenida = decisionGobernante({ cores: 8, muestrasRam: [0.62, 0.74, 0.78, 0.71, 0.8], paralelismoActivo: true, cpuBasePerfil: 2 });
  assert.strictEqual(sostenida.degradadoPorRam, true);
  assert.strictEqual(sostenida.cpuBase, 1);
  assert.ok(sostenida.motivo.includes("sostenido") && sostenida.motivo.includes("1 worker"), sostenida.motivo);
  const pico = decisionGobernante({ cores: 8, muestrasRam: [0.4, 0.97, 0.42, 0.38, 0.41], paralelismoActivo: true, cpuBasePerfil: 2 });
  assert.strictEqual(pico.degradadoPorRam, false, "abrir un PDF no apaga la máquina");
  assert.strictEqual(pico.cpuBase, 7);
  const corta = decisionGobernante({ cores: 8, muestrasRam: [0.9, 0.9], paralelismoActivo: true, cpuBasePerfil: 2 });
  assert.strictEqual(corta.degradadoPorRam, false, "historial corto no prueba presión: no se castiga sin datos");
});

prueba("la base adaptativa entra al presupuesto SIN saltarse los topes (núcleos y RAM libre)", () => {
  const conGobernador = resolverPresupuesto({ ramMedidaGB: 16, ramLibreGB: 10, nucleos: 8, escalado: 1, cpuBaseAdaptativa: 7 });
  const sinGobernador = resolverPresupuesto({ ramMedidaGB: 16, ramLibreGB: 10, nucleos: 8, escalado: 1 });
  assert.strictEqual(conGobernador.cpu, 7, "16 GB libres de verdad dejan los 7 workers");
  assert.ok(sinGobernador.cpu < conGobernador.cpu, "sin gobernador regía la constante del tramo: " + sinGobernador.cpu);
  const ahogada = resolverPresupuesto({ ramMedidaGB: 16, ramLibreGB: 1.2, nucleos: 8, escalado: 1, cpuBaseAdaptativa: 7 });
  assert.ok(ahogada.cpu <= 2, "la RAM LIBRE sigue recortando debajo del gobernador: " + ahogada.cpu);
});

prueba("presionSostenida: umbral 0.7, ventana 5, mínimo 3 (el número del plano)", () => {
  assert.strictEqual(UMBRAL_RAM, 0.7);
  assert.strictEqual(presionSostenida([0.71, 0.72, 0.75]).sostenida, true, "tres muestras sobre el umbral: presión probada");
  assert.strictEqual(presionSostenida([0.71, 0.72, 0.5]).sostenida, false, "dos sobre umbral de tres: todavía es sospecha, no historial");
  assert.strictEqual(presionSostenida([0.71, 0.5, 0.5]).sostenida, false);
  assert.strictEqual(presionSostenida([]).sostenida, false);
});

prueba("cloud_verifier con cuota propia: ventana, timeout y fetch son del verificador", () => {
  const v = lee("src/engine/cloudVerifier.ts");
  assert.ok(v.includes("timeoutMs"), "el verificador trae su propio timeout");
  assert.ok(/cfg\.timeoutMs/.test(v), "y lo USA en sus llamadas (abort por config, no heredado del chat)");
  assert.ok(!v.includes("fetchCloud"), "no pasa por la venas del chat: ni reloj compartido ni cuarentena ajena");
  assert.ok(!/from ".*planRunner/.test(v), "no pide fichas al semáforo del planificador: no compite con el modelo de chat");
});

prueba("cables: el runner acata, el endpoint informa, el panel muestra", () => {
  const runner = lee("src/engine/planRunner.ts");
  assert.ok(runner.includes("decisionGobernante"), "calcularLimitesGlobales pasa por el gobernador");
  assert.ok(runner.includes("estadoGobernante"), "y expone lo que está aplicando");
  const brain = lee("server/routers/brain.ts");
  assert.ok(brain.includes("gobernante: runner.estadoGobernante()"), "/api/brain/runner informa al panel");
  assert.ok(brain.includes("paralelismoActivo: deps.paralelismoActivo"), "la capacidad del panel llega al runner");
  assert.ok(lee("server.ts").includes('features.isOn("parallel_workers")'), "server.ts enruta la capacidad, no un booleano vivo congelado");
  // v1.0.22 · el panel que MIDE el segundo plano es el panel completo del cerebro
  // de tareas (`PlansPanel`), y desde la poda de la hoja es el único que lo pinta:
  // la hoja de ruta quedó en tres cosas (puertos, pasos, entregable). La valla
  // exige el cable de punta a punta: el runner acata, el endpoint informa, ALGUIEN
  // lo muestra. Si desaparece de los dos, la capacidad queda a ciegas.
  const completo = lee("src/components/PlansPanel.tsx");
  const hoja = lee("src/components/PlanificationPanel.tsx");
  assert.ok(completo.includes("/api/brain/runner"), "el panel completo lee el estado del runner");
  assert.ok(/gobernante|workers|paralelismo/i.test(completo), "y muestra semáforo/workers/RAM del gobernador");
  assert.ok(hoja.includes("onOpenPanel"), "la hoja sigue abriendo el panel completo donde eso se ve");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\ngobernante: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
