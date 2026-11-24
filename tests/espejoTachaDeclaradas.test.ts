/**
 * espejoTachaDeclaradas.test.ts — v1.70.6 · EL PLAN DECLARADO TAMBIÉN SE TACHA
 * ============================================================================
 * Hasta hoy, las tareas declaradas (`set_plan` o plan de palabra) nacían con
 * `paso: null` y `terminarPasoVivo` solo buscaba por número de paso: el plan
 * declarado jamás se tachaba — el Panel de Tareas lo mostraba eterno. El lazo
 * nuevo: cada paso de herramienta CASA con su tarea (léxico; y si el paso
 * ESCRIBE, adelanta la cola del propio plan). La puerta pública para el monolito
 * es `publicarPlanDePalabras` (la lógica NO vive en server.ts: valla motorVivo).
 * Formato de casa para el semáforo de scripts/validar.mjs.
 * Se ejecuta con:  npx tsx tests/espejoTachaDeclaradas.test.ts
 */
import {
  abrirTurnoVivo, cerrarTurnoVivo, empezarPasoVivo, terminarPasoVivo,
  declararPlanVivo, hojaViva, hojaEnCurso, reiniciarEspejo,
  planDeclaradoEsteTurno, publicarPlanDePalabras,
} from "../src/engine/espejoVivo";

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}

{ // plan declarado: se declara, manda y el paso lo tacha
  reiniciarEspejo();
  abrirTurnoVivo("integrar la galería con lightbox");
  declararPlanVivo([
    { id: "p1", description: "Añadir estilos de la galería al CSS" },
    { id: "p2", description: "Crear el script del lightbox" },
    { id: "p3", description: "Verificar la galería en el navegador" },
  ]);
  comprobar("plan declarado manda (planDeclaradoEsteTurno)", planDeclaradoEsteTurno() === true);

  const paso1 = empezarPasoVivo("write_file", "styles.css");
  comprobar("paso léxico casa con la tarea de CSS (p1)", paso1?.tareaCasada === "p1", String(paso1?.tareaCasada));
  terminarPasoVivo(true);
  comprobar("al terminar, p1 queda HECHA", hojaViva()?.tareas.find((t) => t.id === "p1")?.estado === "hecha");

  const paso2 = empezarPasoVivo("write_file", "scripts/imagen-gallery.js");
  comprobar("paso de ESCRITURA adelanta la cola (p2)", paso2?.tareaCasada === "p2", String(paso2?.tareaCasada));
  terminarPasoVivo(true);
  comprobar("al terminar, p2 queda HECHA", hojaViva()?.tareas.find((t) => t.id === "p2")?.estado === "hecha");

  const paso3 = empezarPasoVivo("read_file", "package.json");
  comprobar("paso de LECTURA sin coincidencia no tacha por la fuerza", !paso3?.tareaCasada);
  terminarPasoVivo(true);
  comprobar("p3 sigue pendiente (cero hecho mentira)", hojaViva()?.tareas.find((t) => t.id === "p3")?.estado === "pendiente");

  const hoja = cerrarTurnoVivo();
  comprobar("el turno con tareas publica hoja", !!hoja);
  comprobar("con p3 abierta el cierre es PARCIAL, no «hecho»", hoja?.estado === "parcial", String(hoja?.estado));
  reiniciarEspejo();
}

{ // publicarPlanDePalabras: la puerta única del monolito
  reiniciarEspejo();
  abrirTurnoVivo("página de bienvenida con galería");
  const texto = "Voy a hacer la página.\n1. Añadir los estilos de la galería al CSS\n2. Crear el script del lightbox\n3. Verificar la galería en el navegador";
  const publicadas = publicarPlanDePalabras(texto);
  comprobar("publicarPlanDePalabras declara las 3 etapas", !!publicadas && publicadas.length === 3, String(publicadas?.length));
  comprobar("tras publicar, el turno se declara con plan", planDeclaradoEsteTurno() === true);
  const segunda = publicarPlanDePalabras("1. Rehacer todo el CSS\n2. Y más cosas del guion");
  comprobar("segunda llamada NO pisa un plan ya declarado", segunda === null);
  comprobar("una hoja en curso existe para cerrar", hojaEnCurso() !== null);
  cerrarTurnoVivo();
  reiniciarEspejo();
}

{ // ante la duda, no inventa: texto sin lista no declara nada
  reiniciarEspejo();
  abrirTurnoVivo("consulta suelta");
  comprobar("prosa sin lista no declara plan", publicarPlanDePalabras("La aduana revisa las rutas de las imágenes antes de escribir.") === null);
  cerrarTurnoVivo();
  reiniciarEspejo();
}

{ // sin plan declarado: el paso sigue siendo la tarea (comportamiento viejo)
  reiniciarEspejo();
  abrirTurnoVivo("página de bienvenida");
  const paso = empezarPasoVivo("write_file", "index.html");
  comprobar("sin plan, el paso no casa tarea declarada", !!paso && paso.tareaCasada === undefined);
  terminarPasoVivo(true);
  const h = hojaViva();
  comprobar("sin plan, el paso ES la tarea y se cierra hecha", h?.tareas.length === 1 && h?.tareas[0].estado === "hecha");
  comprobar("sin plan, declaroPlan sigue falso", Boolean(h?.declaroPlan) === false);
  cerrarTurnoVivo();
  reiniciarEspejo();
}

console.log(`\n═══ ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas ? 1 : 0);
