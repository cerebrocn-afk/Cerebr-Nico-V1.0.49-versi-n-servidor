/**
 * tests/bucleAutonomo.test.ts — EL BUCLE NO SE QUEDA A MITAD (v1.16.0)
 * ====================================================================
 * Se ejecuta con:  npx tsx tests/bucleAutonomo.test.ts
 *
 * La petición del usuario: «el modelo no debe detenerse a la mitad de una
 * tarea; si ya se le marcó un destino que sepa solo por cuál camino ir, o si
 * tiene que dar la vuelta para tomar otro; si falla, seguir con la solución y
 * no esperar a que le digan "continúa con…"».
 *
 * Esta suite deja CIEGO el defecto que se vino corrigiendo desde v1.15.1:
 * aquel empuje solo miraba respuestas cortas (<160 caracteres) en futuro, así
 * que una intención larga se escapaba y el chat se quedaba esperando. Y cuando
 * se agotaban los pasos, el bucle respondía «Completado» con tareas colgando.
 */
import {
  normalizarEstado,
  actualizarPlanDesdeHerramienta,
  tareasPendientes,
  techoDePasos,
  motivoDeParada,
  anunciaAlFinal,
  directivaDeContinuacion,
  directivaDeReanudacion,
  MAX_REEMPUJES_ANUNCIO,
  informeHonesto,
  cierreIntencionSinEjecutar,
  decidirBucle,
  PASOS_BASE,
  PASOS_TOPE,
  faseDelTurno,
  escalonDeReparacion,
  totalFallos,
  directivaDeReparacion,
  directivaDeComprension,
  directivaDeValidacion,
  reiniciarMemoriaDeFirmas,
  construirContextoProgreso,
  resumenDeProgreso,
  señalDeEstancamiento,
  UMBRAL_ESTANCAMIENTO,
  type TareaPlan,
} from "../src/engine/bucleAutonomo";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);
const plan = (...t: TareaPlan[]) => t;

seccion("1. El estado que reporta el modelo llega normalizado");
comprobar("completed → done", normalizarEstado("completed") === "done");
comprobar("in_progress → running", normalizarEstado("in_progress") === "running");
comprobar("falló → failed", normalizarEstado("fallida") === "failed");
comprobar("un estado desconocido no inventa nada", normalizarEstado("quizás") === null);

seccion("2. El plan se arma desde las propias herramientas del agente");
{
  const p: TareaPlan[] = [];
  actualizarPlanDesdeHerramienta(p, "set_plan", {
    tasks: [
      { id: "1", description: "leer el motor" },
      { id: "2", description: "escribir el módulo" },
      { id: "3", description: "probar" },
    ],
  });
  comprobar("set_plan carga las 3 tareas", p.length === 3);
  comprobar("todas arrancan pendientes", tareasPendientes(p).length === 3);
  actualizarPlanDesdeHerramienta(p, "update_task", { task_id: "1", status: "completed" });
  comprobar("update_task cierra la 1", tareasPendientes(p).length === 2);
  actualizarPlanDesdeHerramienta(p, "update_task", { taskId: "2", status: "done" });
  comprobar("acepta taskId (camel) también", tareasPendientes(p).length === 1);
  actualizarPlanDesdeHerramienta(p, "set_plan", { tasks: [{ id: "9", description: "nuevo plan" }] });
  comprobar("un set_plan nuevo reemplaza el anterior", p.length === 1 && p[0].id === "9");
  actualizarPlanDesdeHerramienta(p, "read_file", { path: "x.ts" });
  comprobar("otra herramienta no toca el plan", p.length === 1);
}

seccion("3. El techo de pasos crece con el plan, pero choca contra un tope");
comprobar("sin plan, el techo es el histórico (10)", techoDePasos(0) === 10);
comprobar("12 tareas abiertas no pueden morir en 10 pasos", techoDePasos(12) > 10, String(techoDePasos(12)));
comprobar("crece de a 3 por tarea", techoDePasos(4) === 10 + 4 * 3, String(techoDePasos(4)));
comprobar("y nunca pasa del tope duro", techoDePasos(999) === PASOS_TOPE, String(techoDePasos(999)));
comprobar("un conteo negativo no lo achica", techoDePasos(-5) === 10);

seccion("4. Distinguir «terminé» de «me quedé a mitad»");
{
  const sinPlan: TareaPlan[] = [];
  // El caso que se escapaba en v1.15.1: intención LARGA (más de 160 caracteres).
  const larga =
    "Voy a revisar uno por uno los seis módulos del motor implicados en el pipeline de inferencia, " +
    "luego analizaré cómo se comunican entre sí y a continuación escribiré las pruebas correspondientes.";
  comprobar("intención larga (el caso que se escapaba) es parada", motivoDeParada(larga, sinPlan) !== null,
    motivoDeParada(larga, sinPlan) ?? "null");
  comprobar("intención corta sigue siendo parada", motivoDeParada("voy a leer el archivo", sinPlan) !== null);
  comprobar("pedir permiso es parada, no final",
    motivoDeParada("Creé el módulo. ¿querés que continúe con los tests?", sinPlan) === "pidió permiso para seguir",
    String(motivoDeParada("Creé el módulo. ¿querés que continúe con los tests?", sinPlan)));
  comprobar("cortarse a mitad de frase es parada",
    motivoDeParada("Los cambios son los siguientes:", sinPlan) !== null);
  comprobar("un cierre real no es parada",
    motivoDeParada("Listo: el módulo quedó creado y las 12 pruebas pasan.", sinPlan) === null,
    String(motivoDeParada("Listo: el módulo quedó creado y las 12 pruebas pasan.", sinPlan)));
  comprobar("respuesta vacía también empuja", motivoDeParada("   ", sinPlan) !== null);

  // v1.70.5 · REGLA DE COLA — sesión 1792864959285 («le tuve que decir SIGUE
  // muchas veces»): el modelo probaba herramientas, decía «funciona ✓» en el
  // cuerpo y REMATABA con «Voy a continuar… Primero, revisaré…». El cierre del
  // medio cegaba al detector viejo y el turno moría en promesa.
  const colaCruda =
    "Ya verifiqué el puente: funciona \u2713 y el sandbox respondi\u00f3. " +
    "Voy a continuar con las herramientas de MCP. Primero, revisar\u00e9 el estado del proyecto.";
  comprobar(
    "regla de cola: cierres en el cuerpo + promesa al final SÍ es parada",
    motivoDeParada(colaCruda, sinPlan) !== null,
    String(motivoDeParada(colaCruda, sinPlan))
  );
  comprobar(
    "regla de cola: el motivo nombra la cola (diagn\u00f3stico legible)",
    String(motivoDeParada(colaCruda, sinPlan)).includes("regla de cola"),
    String(motivoDeParada(colaCruda, sinPlan))
  );
  comprobar(
    "regla de cola: cierre puro NO molesta al que termin\u00f3 de verdad",
    motivoDeParada("Listo: prob\u00e9 el puente, el sandbox y la memoria \u2014 todo funciona.", sinPlan) === null,
    String(motivoDeParada("Listo: prob\u00e9 el puente, el sandbox y la memoria \u2014 todo funciona.", sinPlan))
  );
  comprobar(
    "anunciaAlFinal es pura: no revienta con basura",
    !anunciaAlFinal("") && !anunciaAlFinal(null as any) && !anunciaAlFinal("\n\n  "),
    "no"
  );

  // v1.52.1 — ANUNCIO ESTRUCTURAL SIN ACCIÓN (sesión glm-4.5-flash «chat en
  // cortocircuito»): el modelo escribe los encabezados de la checklist y frena.
  comprobar("encabezado «ANÁLISIS DE LO EXISTENTE» sin herramienta es parada",
    motivoDeParada("## 2) ANÁLISIS DE LO EXISTENTE\n\n", sinPlan) !== null,
    String(motivoDeParada("## 2) ANÁLISIS DE LO EXISTENTE\n\n", sinPlan)));
  comprobar("encabezado «Paso 1» sin herramienta es parada",
    motivoDeParada("Paso 1: preparar el entorno", sinPlan) !== null);
  comprobar("intro «Primero…» sin herramienta es parada",
    motivoDeParada("Primero reviso la estructura del proyecto", sinPlan) !== null);
  comprobar("prosa normal que menciona «plan» en medio NO es falsa parada",
    motivoDeParada("El módulo quedó creado según el plan y las pruebas pasan. Listo.", sinPlan) === null,
    String(motivoDeParada("El módulo quedó creado según el plan y las pruebas pasan. Listo.", sinPlan)));
}
{
  // Con tareas abiertas, la prosa de «listo» NO puede cerrar el turno.
  const p = plan({ id: "1", description: "tests", status: "pending" });
  comprobar("«listo» con plan abierto no cierra", motivoDeParada("listo, terminé", p) !== null);
  comprobar("y el motivo nombra lo que falta",
    motivoDeParada("listo", p) === "quedan 1 tarea(s) del plan sin cerrar",
    String(motivoDeParada("listo", p)));
}

seccion("5. Ante un fallo, la directiva manda a desviarse (no a esperar)");
{
  const d = directivaDeContinuacion(
    plan({ id: "2", description: "escribir", status: "pending" }),
    { herramienta: "edit_file", error: "ENOENT: no existe src/x.ts" }
  );
  comprobar("nombra la herramienta que falló", d.includes("edit_file"));
  comprobar("dice que tome OTRO camino", /otro camino|cambiá de herramienta/i.test(d), d.slice(0, 90));
  comprobar("prohíbe devolverle la tarea al usuario", /no esperes instrucciones|no pidas permiso/i.test(d));
  comprobar("no pregunta, ordena ejecutar", /EJECUTÁ/.test(d));
}
{
  const sinFallo = directivaDeContinuacion([], null);
  comprobar("sin fallo también empuja a ejecutar", sinFallo.includes("EJECUTÁ"));
  comprobar("y avisa de no repetir el mismo camino", /no lo repitas igual/.test(sinFallo));
  // v1.52.1 — ACCIÓN PRIMERO: el re-empuje exige una herramienta YA, no más prosa.
  comprobar("la directiva ordena una herramienta como próximo mensaje",
    /ACCIÓN AHORA/.test(sinFallo) && /llamada a herramienta/i.test(sinFallo));
}

seccion("6. El cierre honesto: si falta algo, lo dice");
comprobar("sin pendientes no agrega nada", informeHonesto([], true) === "");
{
  const i = informeHonesto(plan({ id: "3", description: "probar", status: "pending" }), true);
  comprobar("con pasos agotados avisa que NO terminó", /agotó el techo/.test(i), i);
  comprobar("y enumera la tarea abierta", i.includes("probar"));
}

seccion("7. La decisión que toma el bucle");
{
  const d = decidirBucle({
    contenido: "voy a escribir los tests",
    plan: plan({ id: "1", description: "tests", status: "pending" }),
    paso: 2,
    maxPasos: 10,
  });
  comprobar("con plan abierto → continuar", d.accion === "continuar");
  comprobar("y la directiva viaja lista para el mensaje",
    d.accion === "continuar" && d.directiva.includes("No te detengas"));
}
{
  const d = decidirBucle({
    contenido: "Listo, quedó creado y probado.",
    plan: [],
    paso: 3,
    maxPasos: 10,
  });
  comprobar("con tarea cerrada y sin pendientes → cerrar", d.accion === "cerrar");
  comprobar("y no informa nada pendiente", d.accion === "cerrar" && d.informe === "");
}
{
  const d = decidirBucle({
    contenido: "ahora voy con el resto",
    plan: plan({ id: "1", description: "lo que falta", status: "running" }),
    paso: 9,
    maxPasos: 10,
  });
  comprobar("en el último paso se corta igual (no hay bucle infinito)", d.accion === "cerrar");
  comprobar("pero el informe dice qué quedó", d.accion === "cerrar" && d.informe.includes("lo que falta"));
}
{
  const d = decidirBucle({
    contenido: "no pude escribir el archivo, dime cómo seguimos",
    plan: [],
    paso: 1,
    maxPasos: 10,
    ultimoFallo: { herramienta: "write_file", error: "EACCES permiso denegado" },
  });
  comprobar("un fallo con salida de texto NO cierra el turno", d.accion === "continuar");
  comprobar("y la directiva menciona write_file",
    d.accion === "continuar" && d.directiva.includes("write_file"));
}
{
  // El fallo manda sobre la prosa: un «listo» justo después de quebrar no cierra.
  const d = decidirBucle({
    contenido: "Listo, con eso terminamos.",
    plan: [],
    paso: 2,
    maxPasos: 10,
    ultimoFallo: { herramienta: "run_command", error: "exit 1" },
  });
  comprobar("un «listo» tras un fallo no cierra el turno", d.accion === "continuar");
  comprobar("el motivo nombra el fallo", d.accion === "continuar" && d.motivo.includes("run_command"));
}
{
  // Y si el último paso fue bueno, el cierre limpio sí cierra (no se buclea).
  const d = decidirBucle({
    contenido: "Listo: archivo creado y verificado.",
    plan: [],
    paso: 3,
    maxPasos: 10,
    ultimoFallo: null,
  });
  comprobar("sin fallo y con cierre real, el bucle termina", d.accion === "cerrar");
}

seccion("8. Está enganchado de verdad (leído del fuente)");
{
  const server = leer("server.ts");
  comprobar("el bucle del agente decide con el módulo puro",
    server.includes("decidirBucle(") && server.includes("bucleAutonomo"),
    "runOllamaAgentLoop debe llamar a decidirBucle");
  comprobar("el plan se alimenta desde las herramientas",
    server.includes("actualizarPlanDesdeHerramienta("));
  comprobar("y el cierre ya no puede decir «Completado» a ciegas",
    /informeHonesto\(/.test(server));
  comprobar("el empuje viejo de <160 caracteres no volvió",
    !/c\.length < 160/.test(server));
}
{
  const prompt = leer("src/engine/superPrompt.ts");
  comprobar("la regla de autonomía viaja en el prompt de sistema",
    /No te detengas a mitad/.test(prompt));
}
{
  const skills = leer("src/engine/catalogoHonesto.ts");
  comprobar("la habilidad activa amplió su lenguaje (cómo usarla)",
    /C[oó]mo usarla/.test(skills) && existsSync(path.join(RAIZ, "src/engine/bucleAutonomo.ts")));
}

// ════════════════════════════════════════════════════════════════════════
// 8 · v1.16.4 — EL AUTOMATISMO CONSCIENTE TIENE FASES Y ESCALERAS
// ────────────────────────────────────────────────────────────────────────
// El pedido: «expandir el bucle de automatismo consciente de crear, modificar
// y reparar». Un bucle que solo sabe «seguir» repite; un bucle que sabe en qué
// fase vive cambia de método cuando el método se agotó.
seccion("8 · Fases del turno y escalera de reparación (v1.16.4)");
{
  const techo2 = techoDePasos, base2 = PASOS_BASE, tope2 = PASOS_TOPE;
  comprobar("turno limpio sin historial: CREAR", faseDelTurno({}) === "crear");
  comprobar("solo lectivas (read_file ok): sigue CREAR", faseDelTurno({ historialBucle: [{ nombre: "read_file", ok: true }] }) === "crear");
  comprobar("obra propia mutada: MODIFICAR", faseDelTurno({ historialBucle: [{ nombre: "edit_file", ok: true }] }) === "modificar");
  comprobar("mutación FALLIDA no es modificar, es reparar", faseDelTurno({ historialBucle: [{ nombre: "write_file", ok: false }], ultimoFallo: { herramienta: "write_file", error: "x" } }) === "reparar");
  comprobar("dos fallos de la misma herramienta: REPARAR aunque el último fue ok", faseDelTurno({ historialBucle: [], fallosPorHerramienta: { run_tests: 2 } }) === "reparar");
  comprobar("totalFallos suma por igual entre herramientas", totalFallos({ a: 2, b: 3, c: 0 }) === 5);
  comprobar("escalón 0 sin fallos", escalonDeReparacion(0) === 0);
  comprobar("escalón 1 con 1-2 fallos", escalonDeReparacion(1) === 1 && escalonDeReparacion(2) === 1);
  comprobar("escalón 2 con 3-4", escalonDeReparacion(3) === 2 && escalonDeReparacion(4) === 2);
  comprobar("escalón 3 con 5 o más", escalonDeReparacion(5) === 3 && escalonDeReparacion(9) === 3);
  const e1 = directivaDeReparacion(1), e2 = directivaDeReparacion(2), e3 = directivaDeReparacion(3);
  comprobar("escalón 1 manda CAMBIAR de camino, no repetir", /no repitas la llamada/i.test(e1) && /edit_file/.test(e1));
  comprobar("escalón 2 abre diagnóstico y retroceso", /revisar_cambios/.test(e2) && /deshacer_cambios/.test(e2) && /run_tests/.test(e2));
  comprobar("escalón 3 permite el informe honesto, no el «listo»", /Decir «listo» con obra abierta está prohibido/.test(e3));

  // El techo de pasos compra presupuesto de reparación sin perder la frontera.
  comprobar("sin fallos el presupuesto extra es cero", techo2(2, base2, tope2, 0) === Math.min(tope2, base2 + 2 * 3));
  comprobar("con 1 fallo abierto compra 2 pasos", techo2(0, base2, tope2, 1) === base2 + 2);
  comprobar("con 3+ fallos compra tope de 6", techo2(0, base2, tope2, 3) === base2 + 6 && techo2(0, base2, tope2, 50) === base2 + 6);
  comprobar("el presupuesto choca contra PASOS_TOPE igual que antes", techo2(999, base2, tope2, 3) === tope2);

  // La decisión lleva fase y escalón a cuestas (el tablero los muestra).
  const d1 = decidirBucle({ contenido: "sigo", plan: [], paso: 1, maxPasos: 10, ultimoFallo: { herramienta: "run_command", error: "boom" }, fallosPorHerramienta: { run_command: 1 } });
  comprobar("continuar con fallo declara fase reparar y escalón 1", d1.accion === "continuar" && (d1 as any).fase === "reparar" && (d1 as any).escalon === 1);
  const d2 = decidirBucle({ contenido: "voy a escribir el archivo", plan: [], paso: 1, maxPasos: 10, historialBucle: [{ nombre: "read_file", ok: true }] });
  comprobar("intención sin obra declara fase crear", d2.accion === "continuar" && (d2 as any).fase === "crear");
  const d3 = decidirBucle({ contenido: "listo", plan: [], paso: 1, maxPasos: 10 });
  comprobar("cerrar sigue sin fase: terminó, no empuja", d3.accion === "cerrar");
  const dir = directivaDeContinuacion([], { herramienta: "edit_file", error: "no encontró el texto" }, "reparar", 1);
  comprobar("la directiva de reparación nombra la fase y el escalón", /FASE DEL TURNO: REPARAR/.test(dir) && /Primer escalón/.test(dir));
  const dirCrear = directivaDeContinuacion([], null, "crear", 0);
  comprobar("la directiva de creación NO suelta escalera que no viene", /FASE DEL TURNO: CREAR/.test(dirCrear) && !/escalón/.test(dirCrear));

  // v1.48.0 — AUTOCONCIENCIA ANTES DE CREAR + REVISAR PARA VALIDAR
  const comp = directivaDeComprension("crear");
  comprobar("comprensión: nombra las tres leyes (comprender/analizar/plan)", /COMPRENSIÓN DEL TRABAJO/.test(comp) && /ANÁLISIS DE LO EXISTENTE/.test(comp) && /PLAN MÍNIMO/.test(comp));
  comprobar("comprensión: manda leer lo que ya existe antes de escribir", /read_file/.test(comp) && /ANTES de escribir/i.test(comp));
  comprobar("comprensión: en reparar NO estorba (devuelve vacío)", directivaDeComprension("reparar") === "");
  const val = directivaDeValidacion();
  comprobar("validación: revisa la obra y corre la única orden del veredicto", /revisar_cambios/.test(val) && /npm run validar/.test(val));
  comprobar("crear integra autoconciencia Y validación, sin tocar la escalera", /AUTOCONCIENCIA DE LA TAREA/.test(dirCrear) && /REVISAR PARA VALIDAR/.test(dirCrear) && !/escalón/.test(dirCrear));
  const dirReparar = directivaDeContinuacion([], { herramienta: "edit_file", error: "x" }, "reparar", 1);
  comprobar("reparar NO arranca con la checklist de creación", !/AUTOCONCIENCIA DE LA TAREA/.test(dirReparar));
}

// ════════════════════════════════════════════════════════════════════
// 9 · v1.48.0 — PRUEBA DE ESTRÉS: el juez del bucle aguanta carga y NO se contradice
// ──────────────────────────────────────────────────────────────────────────
// Pedido de esta tanda: una prueba de estrés para la validación de bucles. No basta
// con casos sueltos: hay que meterle MILES de combinaciones (fase × tamaño de plan ×
// paso × fallo) y verificar que las INVARIANTES del juez se sostienen bajo carga:
//   · nunca lanza una excepción (un juez que explota deja el turno colgado);
//   · toda continuación declara su FASE DEL TURNO;
//   · la fase CREAR jamás suelta escalera de reparación (no se contradice);
//   · el techo de pasos SIEMPRE cae dentro de [BASE, TOPE] (frontera dura);
//   · la repetición infinita del mismo error TERMINA en BLOQUEO honesto, no en bucle;
//   · todo esto se resuelve rápido (presupuesto de tiempo), sin degradar.
seccion("9 · Prueba de estrés de la validación de bucles (v1.48.0)");
{
  reiniciarMemoriaDeFirmas();
  const ITER = 4000;
  const fasesEstres = ["crear", "modificar", "reparar"] as const;
  const erroresEstres = [
    "ENOENT no existe src/x.ts",
    "EACCES permiso denegado",
    "exit 1",
    "signal is aborted without reason",
    "TypeError: foo is not a function",
  ];
  let excepciones = 0;
  let contradiceCrear = 0;
  let faltaFase = 0;
  let techoFuera = 0;
  const t0 = Date.now();
  for (let i = 0; i < ITER; i++) {
    const fase = fasesEstres[i % fasesEstres.length];
    const nTareas = i % 15; // planes de 0..14 tareas
    const planGrande: TareaPlan[] = Array.from({ length: nTareas }, (_, k) => ({
      id: `t${k}`,
      description: `tarea ${k} del lote ${i}`,
      status: (k % 2 ? "pending" : "running") as TareaPlan["status"],
    }));
    const fallosN = fase === "reparar" ? (i % 7) : 0;
    const señal = {
      contenido: i % 2 ? "voy a seguir con el resto del trabajo" : "listo, terminé",
      plan: planGrande,
      paso: i % 12,
      maxPasos: 10 + (i % 20),
      ultimoFallo: fase === "reparar" ? { herramienta: "run_command", error: erroresEstres[i % erroresEstres.length] } : null,
      fallosPorHerramienta: fase === "reparar" ? { run_command: fallosN } : {},
      historialBucle:
        fase === "modificar"
          ? [{ nombre: "edit_file", ok: true }]
          : fase === "crear"
          ? [{ nombre: "read_file", ok: true }]
          : [{ nombre: "write_file", ok: false }],
    };
    try {
      const d = decidirBucle(señal as any);
      if (d.accion === "continuar") {
        if (!/FASE DEL TURNO:/.test(d.directiva)) faltaFase++;
        if ((d as any).fase === "crear" && /escalón/.test(d.directiva)) contradiceCrear++;
      }
    } catch {
      excepciones++;
    }
    const techo = techoDePasos(nTareas, PASOS_BASE, PASOS_TOPE, fallosN);
    if (techo < PASOS_BASE || techo > PASOS_TOPE) techoFuera++;
    if (i % 97 === 0) reiniciarMemoriaDeFirmas(); // la memoria de firmas no crece sin fin
  }
  const ms = Date.now() - t0;
  comprobar(`${ITER} decisiones sin una sola excepción`, excepciones === 0, `${excepciones} excepciones`);
  comprobar("ninguna directiva de CREAR soltó escalera de reparación", contradiceCrear === 0, `${contradiceCrear} contradicciones`);
  comprobar("toda continuación declara su FASE DEL TURNO", faltaFase === 0, `${faltaFase} sin fase`);
  comprobar("el techo de pasos SIEMPRE queda dentro de [BASE, TOPE]", techoFuera === 0, `${techoFuera} fuera de rango`);
  comprobar(`la carga se resuelve rápido (${ms} ms para ${ITER} iteraciones)`, ms < 4000, `${ms} ms`);
}
{
  // El mismo error, una y otra vez: el bucle NO puede quedarse insistiendo para
  // siempre — tiene que terminar en un BLOQUEO honesto que pida decisión humana.
  reiniciarMemoriaDeFirmas();
  let ultima: any = null;
  for (let i = 0; i < 12; i++) {
    ultima = decidirBucle({
      contenido: "sigo intentando lo mismo",
      plan: [],
      paso: 1,
      maxPasos: 50,
      ultimoFallo: { herramienta: "edit_file", error: "TypeError: x is not a function en src/mod.ts:10" },
      fallosPorHerramienta: { edit_file: i + 1 },
    });
  }
  comprobar(
    "misma firma repetida sin fin → el bucle se BLOQUEA (no se cuelga)",
    ultima.accion === "cerrar" && /BLOQUEADO/.test(ultima.motivo || ""),
    String(ultima.motivo)
  );
  reiniciarMemoriaDeFirmas();
}

// ════════════════════════════════════════════════════════════════════
// 10 · v1.55.1 — RE-EMPUJE ESCALADO (anti-trancado de nube)
// ──────────────────────────────────────────────────────────────────────────
// RAÍZ (captura de Mario, glm-4.5-flash «Agente PC ON»): el modelo dice «Voy a
// analizar… exploremos la estructura del proyecto» y FRENA sin herramienta; el
// chat quedaba esperando a que el usuario escribiera «¿qué pasa?». v1.46.4 solo
// re-empujaba UNA vez. Ahora el turno insiste hasta MAX_REEMPUJES_ANUNCIO veces,
// subiendo el tono, y en el último exige ENTREGAR la respuesta ya.
seccion("10 · Re-empuje escalado anti-trancado (v1.55.1)");
{
  comprobar("el tope de re-empujes es finito y mayor que el único cartucho viejo",
    Number.isInteger(MAX_REEMPUJES_ANUNCIO) && MAX_REEMPUJES_ANUNCIO >= 2 && MAX_REEMPUJES_ANUNCIO <= 5,
    String(MAX_REEMPUJES_ANUNCIO));

  const primero = directivaDeReanudacion(0);
  comprobar("el primer re-empuje es la directiva de continuación de siempre (cero regresión)",
    primero === directivaDeContinuacion([], null));

  const medio = directivaDeReanudacion(1);
  comprobar("el segundo re-empuje SUBE el tono (segundo aviso, basta de narrar)",
    /SEGUNDO AVISO/.test(medio) && /[Bb]asta de narrar/.test(medio));
  comprobar("el segundo exige una herramienta real como próximo mensaje",
    /herramienta real/.test(medio) && /list_dir|read_file|write_file|edit_file|run_command/.test(medio));
  comprobar("y arrastra la directiva base para no perder la escalera",
    medio.includes(primero));

  const ultimo = directivaDeReanudacion(MAX_REEMPUJES_ANUNCIO - 1);
  comprobar("el último re-empuje es un ultimátum", /ÚLTIMO AVISO/.test(ultimo));
  comprobar("el último ofrece el camino B: ENTREGAR ya la respuesta en texto",
    /ENTREG[AÁ] YA/.test(ultimo) && /sin frases de intención|SIN frases de intención/i.test(ultimo));
  comprobar("el último prohíbe explícitamente volver a anunciar y frenar",
    /volver a anunciar/.test(ultimo) && /¿qué pasa\?/.test(ultimo));

  // La forma de recorrer los intentos es monótona: nunca se queda sin texto y
  // siempre termina en el ultimátum, pase lo que pase con el índice.
  let ultimoTxt = "";
  for (let i = 0; i < MAX_REEMPUJES_ANUNCIO; i++) {
    const d = directivaDeReanudacion(i);
    comprobar(`re-empuje #${i} nunca es vacío`, typeof d === "string" && d.length > 40);
    ultimoTxt = d;
  }
  comprobar("recorridos todos los intentos, el final es el ultimátum de entrega",
    /ÚLTIMO AVISO/.test(ultimoTxt));
  comprobar("un índice fuera de rango por arriba sigue dando el ultimátum (no explota)",
    /ÚLTIMO AVISO/.test(directivaDeReanudacion(99)));
}
{
  // Está ENGANCHADO de verdad en el servidor: ambas ramas de nube (OpenAI-compat
  // y Gemini) usan el re-empuje escalado y ya no el cartucho único booleano.
  // v1.57.9 — el ciclo OpenAI-compat se mudó a server/cicloOpenAICompat.ts
  // (trinquete: partir, no añadir). La valla cruza los DOS archivos: lo que se
  // custodia es la CONDUCTA cableada, no la ruta donde vive la función.
  const server = leer("server.ts") + "\n" + leer("server/cicloOpenAICompat.ts");
  comprobar("server.ts importa el re-empuje escalado y su tope",
    /directivaDeReanudacion/.test(server) && /MAX_REEMPUJES_ANUNCIO/.test(server));
  comprobar("la rama OpenAI-compat (Z.ai/GLM) re-empuja escalado con contador",
    /reempujes\s*<\s*MAX_REEMPUJES_ANUNCIO/.test(server) && /directivaDeReanudacion\(reempujes\)/.test(server));
  comprobar("la rama Gemini también re-empuja escalado con contador",
    /reempujesGemini\s*<\s*MAX_REEMPUJES_ANUNCIO/.test(server) && /directivaDeReanudacion\(reempujesGemini\)/.test(server));
  comprobar("el booleano viejo de un solo re-empuje no volvió",
    !/let reempujado = false/.test(server) && !/let reempujadoGemini = false/.test(server));
}

seccion("11. v1.56.5 — MÁS CONTEXTO: el turno sabe dónde está parado y qué ya intentó");
{
  // 11a. construirContextoProgreso deriva el estado real del turno (puro).
  const ctx = construirContextoProgreso({
    plan: plan(
      { id: "1", description: "leer", status: "done" },
      { id: "2", description: "escribir", status: "pending" }
    ),
    paso: 3,
    maxPasos: 12,
    historialBucle: [
      { nombre: "read_file", ok: true },
      { nombre: "read_file", ok: true },
      { nombre: "list_dir", ok: true },
    ],
    fallosPorHerramienta: {},
  });
  comprobar("deriva paso/maxPasos/restantes sin negativos",
    ctx.paso === 3 && ctx.maxPasos === 12 && ctx.restantes === 9);
  comprobar("cuenta las tareas cerradas del plan", ctx.hechas === 1 && ctx.total === 2);
  comprobar("enumera herramientas distintas en orden de aparición",
    JSON.stringify(ctx.herramientasUsadas) === JSON.stringify(["read_file", "list_dir"]));
  comprobar("detecta que SOLO observó (ninguna herramienta mutó el proyecto)",
    ctx.soloObservo === true);

  // 11b. resumenDeProgreso traduce el contexto a una línea para el modelo.
  const resumen = resumenDeProgreso(ctx);
  comprobar("el resumen abre con el encabezado CONTEXTO DEL TURNO",
    /^CONTEXTO DEL TURNO:/.test(resumen));
  comprobar("el resumen enumera lo que ya se usó", /read_file, list_dir/.test(resumen));
  comprobar("el resumen nunca nombra escalón (no es la escalera de reparación)",
    !/escal/.test(resumen));

  // 11c. señalDeEstancamiento: varios pasos solo mirando sin producir obra.
  comprobar("estancamiento DISPARA tras varias lecturas en fase crear",
    señalDeEstancamiento(ctx, "crear") !== "");
  comprobar("estancamiento NO aplica en reparar (ahí manda la escalera)",
    señalDeEstancamiento(ctx, "reparar") === "");
  comprobar("el mensaje de estancamiento tampoco nombra escalón",
    !/escal/.test(señalDeEstancamiento(ctx, "crear")));

  const ctxMuto = construirContextoProgreso({
    paso: 5,
    maxPasos: 20,
    historialBucle: [{ nombre: "edit_file", ok: true }],
  });
  comprobar("con obra ya producida NO hay estancamiento",
    señalDeEstancamiento(ctxMuto, "modificar") === "");

  const ctxTemprano = construirContextoProgreso({
    paso: 1,
    maxPasos: 10,
    historialBucle: [{ nombre: "read_file", ok: true }],
  });
  comprobar(`pocos pasos (< ${UMBRAL_ESTANCAMIENTO}) todavía NO es estancamiento`,
    señalDeEstancamiento(ctxTemprano, "crear") === "");

  // 11d. señal vacía: nunca crashea y da un contexto base coherente.
  const ctxVacio = construirContextoProgreso({});
  comprobar("una señal vacía no explota y da restantes >= 0",
    ctxVacio.restantes >= 0 && ctxVacio.herramientasUsadas.length === 0);

  // 11e. REGRESIÓN CLAVE: directivaDeContinuacion sin contexto es byte-idéntica
  // a la de antes de v1.56.5 — el 5º parámetro es puramente aditivo.
  const sinContexto = directivaDeContinuacion([], null, "crear", 0);
  const contextoVacio = directivaDeContinuacion([], null, "crear", 0, "");
  comprobar("sin contexto === con contexto vacío (cero regresión)",
    sinContexto === contextoVacio);
  comprobar("la directiva sin contexto no inyecta el encabezado CONTEXTO DEL TURNO",
    !/CONTEXTO DEL TURNO:/.test(sinContexto));

  // 11f. con contexto, la línea se inserta ANTES de la fase del turno.
  const conContexto = directivaDeContinuacion([], null, "crear", 0, resumen);
  comprobar("con contexto, la directiva sí incluye la línea de CONTEXTO DEL TURNO",
    /CONTEXTO DEL TURNO:/.test(conContexto));
  comprobar("el contexto va ANTES de la FASE DEL TURNO",
    conContexto.indexOf("CONTEXTO DEL TURNO:") < conContexto.indexOf("FASE DEL TURNO:"));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("v1.56.8 · CIERRE HONESTO cuando la intención nunca se ejecutó");
{
  // El caso real (sesión exportada de Mario, provider zai / glm-4.5-flash): el
  // modelo narró «Voy a revisar el estado actual del proyecto…:» y el turno
  // murió ahí. `motivoDeParada` LO DETECTABA, pero el bucle devolvía ok:true
  // porque algo se emitió — así que el usuario no sabía si esperaba o terminó.
  const textoReal =
    "\nEntendido, gracias por la aclaración. El hash es el identificador de nuestra sesión actual.\n\n" +
    "Voy a revisar el estado actual del proyecto para entender mejor qué tienes y qué podrías necesitar:\n\n\n\n\n\n\n\n\n";
  const motivo = motivoDeParada(textoReal, []);
  comprobar("★ el texto real de la sesión SÍ dispara el motivo de parada", motivo !== null, String(motivo));

  const aviso = cierreIntencionSinEjecutar(3, motivo);
  comprobar("con motivo, hay cierre (no silencio)", aviso.length > 60);
  comprobar("dice que la tarea NO está terminada", /SIN TERMINAR|no lo ejecuté/i.test(aviso));
  comprobar("confiesa cuántas veces insistió", /3 veces/.test(aviso), aviso);
  comprobar("con 1 insistencia habla en singular (no ruidos de plantilla)", /1 vez\b/.test(cierreIntencionSinEjecutar(1, motivo)));
  comprobar("propone una acción concreta en vez de dejar colgado al usuario", /seguí|cambiá de modelo/i.test(aviso));
  // Ojo con este regex: «no doy esto por hecho» contiene la palabra «hecho», así
  // que se prohíben las AFIRMACIONES de éxito, no la palabra suelta.
  comprobar("★ NO afirma que algo funcionó (prohibido por certezaModelo)",
    !/✅|✔️|Completado|\bListo\b|funcion(?:ó|a|ó correctamente)|\bprobado\b/i.test(aviso), aviso);
  comprobar("y sí niega el éxito en las propias palabras", /no lo ejecuté|SIN TERMINAR/i.test(aviso));

  comprobar("★ sin motivo, silencio absoluto: no se queja de los turnos que cerraron bien",
    cierreIntencionSinEjecutar(0, null) === "");
  // El cable: las DOS ramas que re-empujan tienen que cerrar honesta, y solo
  // cuando el turno NO ejecutó obra (si ejecutó, ya se cuenta qué se hizo).
  // v1.57.9 — idem: el ciclo OpenAI-compat vive ahora en su módulo hoja; la
  // valla lee los dos archivos juntos porque lo que se prueba es la conducta.
  const srv = readFileSync(new URL("../server.ts", import.meta.url), "utf-8")
    + "\n" + readFileSync(new URL("../server/cicloOpenAICompat.ts", import.meta.url), "utf-8");
  // Ventana de 400 caracteres: entre la guarda y la llamada media el console.log
  // del cierre (v1.56.8 pidió trazabilidad en consola). Si alguien separa más,
  // lo que cambia es la lectura humana del bloque, no la conducta.
  comprobar("★ la rama OpenAI-compat (zai/grok/GLM) llama al cierre", /if \(!huboToolExec\) \{[\s\S]{0,400}cierreIntencionSinEjecutar\(reempujes/.test(srv));
  comprobar("★ la rama Gemini también (mismo agujero, mismo arreglo)", /accionesGemini\.length === 0[\s\S]{0,400}cierreIntencionSinEjecutar\(reempujesGemini/.test(srv));
  comprobar("★ y el re-empuje se registra en consola (no vuelve a ser invisible)",
    (srv.match(/console\.log\(`\[bucle(\/gemini)?\] anuncio sin acción/g) || []).length === 2);
  comprobar("y está importada desde la fuente única, no reescrita en el monolito",
    /import \{[^}]*cierreIntencionSinEjecutar[^}]*\} from "\.\/src\/engine\/bucleAutonomo"/.test(srv));
}

seccion("v1.57.11 · PRÓRROGA DEL TECHO con evidencia de obra, no con promesa");
{
  const { concederProrrogaTecho, PRORROGA_PASOS, MAX_PRORROGAS_TECHO, directivaDeProrroga } = await import("../src/engine/bucleAutonomo");
  const pend = [{ id: "9", description: "escribir styles.css", status: "pending" as const }];
  comprobar("sin pendientes no hay prórroga (no se paga aire)", concederProrrogaTecho({ pendientes: [], paso: 9, maxPasos: 10, obraBytes: 500, ultimaObraBytes: 0, prorrogasUsadas: 0 }) === null);
  comprobar("lejos del techo no se prorrogan: manda la regla vieja", concederProrrogaTecho({ pendientes: pend, paso: 3, maxPasos: 10, obraBytes: 500, ultimaObraBytes: 0, prorrogasUsadas: 0 }) === null);
  const d = concederProrrogaTecho({ pendientes: pend, paso: 9, maxPasos: 10, obraBytes: 500, ultimaObraBytes: 0, prorrogasUsadas: 0 });
  comprobar("en el techo con obra NUEVA verificada se concede la prórroga", !!d && d.nuevoTope === 10 + PRORROGA_PASOS, JSON.stringify(d));
  comprobar("la prórroga JAMÁS pasa de PASOS_TOPE (la frontera dura sigue dura)", concederProrrogaTecho({ pendientes: pend, paso: PASOS_TOPE - 1, maxPasos: PASOS_TOPE, obraBytes: 500, ultimaObraBytes: 0, prorrogasUsadas: 0 }) === null);
  comprobar("sin obra nueva (bytes = últimos contados) NO hay prórroga: el techo viejo se queda", concederProrrogaTecho({ pendientes: pend, paso: 9, maxPasos: 10, obraBytes: 500, ultimaObraBytes: 500, prorrogasUsadas: 0 }) === null);
  comprobar("sin señal rica (campos ausentes) el juez cierra como antes — cero regresión", concederProrrogaTecho({ pendientes: pend, paso: 9, maxPasos: 10 }) === null);
  comprobar("la segunda prórroga del turno no existe", concederProrrogaTecho({ pendientes: pend, paso: 15, maxPasos: 16, obraBytes: 900, ultimaObraBytes: 500, prorrogasUsadas: MAX_PRORROGAS_TECHO }) === null);
  comprobar("el tope de prórrogas por turno es 1 (Más de una es un bucle con nombre lindo)", MAX_PRORROGAS_TECHO === 1);
  const texto = directivaDeProrroga(pend, 6, 16);
  comprobar("la directiva nombra las tareas abiertas y exige verificar cada escritura", /styles\.css/.test(texto) && /read_file/.test(texto) && /NO lo gastes/.test(texto));
  comprobar("y advierte que es la ÚNICA prórroga del turno", /ÚNICA/.test(texto));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ BUCLE AUTÓNOMO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
