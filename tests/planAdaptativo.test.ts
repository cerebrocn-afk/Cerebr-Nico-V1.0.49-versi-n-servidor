/**
 * tests/planAdaptativo.test.ts — EL CONTRATO DE ACEPTACIÓN (v1.33.0 · FASE 2)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/planAdaptativo.test.ts
 *
 * La hoja de ruta §3: «criterios de aceptación ANTES de escribir código — así
 * el modelo no decide al final si parece terminado». Aquí se prueba la puerta:
 * un turno con criterios sin evidencia NO cierra, y con evidencia verificada
 * cierra como siempre. Y cero regresión: plan sin criterios = v1.31.
 */
import {
  registrarContratoDesdeTareas,
  actualizarEstadoContrato,
  registrarEvidenciaContrato,
  consumirIntentoContrato,
  estadoContrato,
  directivaDeContratoAbierto,
  contratoAParte,
  verContrato,
  reiniciarContrato,
  PRESUPUESTO_POR_TIPO,
} from "../src/engine/planAdaptativo";
import { decidirBucle, reiniciarMemoriaDeFirmas, type TareaPlan } from "../src/engine/bucleAutonomo";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

const FORM = (extra: any = {}) => [
  { id: "t1", description: "crear formulario de contacto", tipo: "crear", archivos: ["src/Contacto.tsx"],
    criterios_aceptacion: ["existe", "valida email", "compila", "tests pasan"], ...extra },
  { id: "t2", description: "reparar el borde del modal", tipo: "reparar", criterios_aceptacion: ["no corta en móvil"] },
];

seccion("1. Declaración: el contrato nace con el set_plan");
{
  reiniciarContrato();
  const c = registrarContratoDesdeTareas(FORM());
  comprobar("dos tareas contratadas", c.length === 2);
  comprobar("criterios preservados por orden", c[0].criterios.map((x) => x.texto).join("|") === "existe|valida email|compila|tests pasan");
  comprobar("tipo reparado≠crear: presupuesto por tipo (30)", c[1].presupuesto.iteraciones === PRESUPUESTO_POR_TIPO.reparar);
  comprobar("crear arranca con 12 iteraciones", c[0].presupuesto.iteraciones === 12);
  comprobar("nadie nació verificado", estadoContrato().abierto === false || estadoContrato().pendientes.length === 0);
  const basura = registrarContratoDesdeTareas([{ id: "x", criterios_aceptacion: ["", "  ", "real", 42, null] }, { id: "y" }]);
  comprobar("basura tolerante: vacíos fuera, 42 entra como texto", basura[0].criterios.length === 2 && basura[0].criterios[0].texto === "real" && basura[0].criterios[1].texto === "42");
  comprobar("tarea sin criterios: existe y NO bloquea", basura[1].criterios.length === 0);
}

seccion("2. Cierre prematuro: la puerta que no deja decir «listo»");
{
  reiniciarContrato();
  registrarContratoDesdeTareas(FORM());
  actualizarEstadoContrato("t1", "in_progress");
  actualizarEstadoContrato("t1", "completed"); // ¡sin evidencia!
  // t2: el modelo la declaró hecha en el PLAN y con update_task (como manda la casa):
  actualizarEstadoContrato("t2", "completed");
  const e = estadoContrato();
  comprobar("completed sin evidencia → cerrada_sin_verificar (criterios pendientes)", e.pendientes.some((p) => p.id === "t1" && p.sinVerificar.length === 4), JSON.stringify(e.pendientes));
  comprobar("el contrato DECLARA abierto (puerta armada)", e.abierto === true);
  // El juez real: decidirBucle con plan "todo completo" y prosa de cierre
  reiniciarMemoriaDeFirmas();
  const plan: TareaPlan[] = [{ id: "t1", description: "x", status: "completed" }, { id: "t2", description: "y", status: "completed" }];
  const d = decidirBucle({ contenido: "Listo, terminé todo", plan, paso: 3, maxPasos: 40 });
  comprobar("★ el TURNO NO CIERRA con contrato abierto", d.accion === "continuar" && d.motivo.includes("contrato de aceptación abierto"));
  // (con la v1.32 el estado abierta-sin-tocar NO bloquea: bloquea el que SE
  //  DECLARA hecho sin prueba — exactly «no decido yo que parece terminado»)
  comprobar("la directiva nombra los criterios que faltan", d.accion === "continuar" && d.directiva.includes("«valida email»") && d.directiva.includes("«no corta en móvil»"));
  comprobar("la directiva ordena adjuntar evidencia al cerrar", d.accion === "continuar" && d.directiva.includes("evidencia"));
}

seccion("3. Evidencia: el camino de vuelta al cierre honesto");
{
  const t = verContrato().find((x) => x.id === "t1")!;
  comprobar("4 criterios abiertos antes de probar", t.criterios.every((c) => !c.evidencia));
  registrarEvidenciaContrato("t1", "read_file: src/Contacto.tsx existe (4200 bytes)");
  registrarEvidenciaContrato("t1", "tsc --noEmit: 0 errores");
  comprobar("evidencia se ancla POR ORDEN al primer criterio libre", verContrato().find((x) => x.id === "t1")!.criterios[0].evidencia!.includes("4200 bytes"));
  registrarEvidenciaContrato("t1", "regex de email OK en test/unit/contacto.test.ts");
  registrarEvidenciaContrato("t1", "npm test: 182/182 pass — cubre compila y tests");
  // con la 2ª evidencia tocó "valida email" (orden) — la 4ª cubre "compila"; queda "tests pasan"?
  const t1 = verContrato().find((x) => x.id === "t1")!;
  comprobar("los 4 criterios quedan cubiertos, uno por prueba en orden", t1.criterios.filter((c) => c.evidencia).length === 4);
  comprobar("t1 pasó a VERIFICificada automáticamente", t1.estado === "verificada");
  comprobar("t2 sigue sin probar: contrato AÚN abierto", estadoContrato().pendientes.some((p) => p.id === "t2"));
  registrarEvidenciaContrato("t2", "screenshot 375px: modal sin corte");
  const e2 = estadoContrato();
  comprobar("con todo verificado el contrato se cierra (puerta abierta al cierre)", e2.abierto === false);
  const d2 = decidirBucle({ contenido: "terminado", plan: [], paso: 3, maxPasos: 40 });
  comprobar("★ AHORA sí cierra (el contrato conforme no estorba)", d2.accion === "cerrar");
  comprobar("el informe lleva el parte del contrato (auditabilidad §8)", d2.accion === "cerrar" && d2.informe.includes("t1 [verificada]"));
}

seccion("4. Presupuesto agotado: pedir replan, no más de lo mismo");
{
  registrarContratoDesdeTareas([{ id: "z", description: "difícil", tipo: "investigar", criterios_aceptacion: ["salida limpia"] }]);
  actualizarEstadoContrato("z", "in_progress");
  for (let i = 0; i < PRESUPUESTO_POR_TIPO.investigar; i++) consumirIntentoContrato("z");
  const e = estadoContrato();
  comprobar("agotado entra al resumen (no al bucle infinito)", e.agotados.includes("z") && e.abierto);
  const dir = directivaDeContratoAbierto(e);
  comprobar("la directiva de agotados manda REPLAN o bloqueo con causa", /PRESUPUESTO AGOTADO/.test(dir) && /REPLAN/.test(dir));
  consumirIntentoContrato("inexistente");
  comprobar("consumir sin tarea: no lanza", true);
}

seccion("5. Cero regresión: plan sin criterios se comporta como v1.31");
{
  reiniciarContrato();
  registrarContratoDesdeTareas([{ id: "a", description: "vieja escuela" }, { id: "b", description: "sin contrato" }]);
  comprobar("contrato existe pero NO abre la puerta", estadoContrato().abierto === false && estadoContrato().pendientes.length === 0);
  const d = decidirBucle({ contenido: "", plan: [{ id: "a", description: "x", status: "pending" }], paso: 1, maxPasos: 10 });
  comprobar("el juez viejo sigue intacto (plan pendiente manda)", d.accion === "continuar" && d.motivo !== "contrato de aceptación abierto");
  registrarContratoDesdeTareas("no-arreglo");
  comprobar("basura total: contrato vacío sin explosión", verContrato().length === 0);
}

seccion("6. Evidencia extra y vocabularios: robustez del enganche");
{
  reiniciarContrato();
  registrarContratoDesdeTareas([{ id: "e", description: "x", criterios_aceptacion: ["uno"] }]);
  registrarEvidenciaContrato("e", "prueba A");
  registrarEvidenciaContrato("e", "prueba B de sobra");
  const ev = verContrato()[0].criterios[0].evidencia!;
  comprobar("evidencia de sobra NO se pierde (se concatena marcada)", ev.includes("prueba A") && ev.includes("+ prueba B"));
  comprobar("vocabulario ingles en marcarTareaVivo→contrato: 'done' verifica sin criterios", (() => {
    reiniciarContrato();
    registrarContratoDesdeTareas([{ id: "k", description: "simple" }]);
    actualizarEstadoContrato("k", "done");
    return verContrato()[0].estado === "verificada";
  })());
  comprobar("el parte dice criterios y iteraciones", /1\/1 criterios · 0\/12 iteraciones/.test((() => {
    reiniciarContrato();
    registrarContratoDesdeTareas([{ id: "p", description: "y", criterios_aceptacion: ["ok"] }]);
    registrarEvidenciaContrato("p", "ya");
    return contratoAParte();
  })()));
  comprobar("parte vacío sin contrato", reiniciarContrato() === undefined && contratoAParte() === "");
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ CONTRATO DE ACEPTACIÓN: ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
