/**
 * tests/buclesAutomaticos.test.ts — CREAR / RESOLVER / VALIDAR SIN ALUCINACIONES
 * ==============================================================================
 * Pedido de Mario: «dedícate solo a los bucles de creación/resolución/validación y
 * el sandbox; todo tiene que ser automático y sin alucinaciones».
 *
 * Esta suite ataca dos cosas concretas, ambas salidas del log general que Mario
 * pegó, no de una idea:
 *
 *  A) ALUCINACIÓN DE ENTRADA. El generador hacía
 *       const entrada = nombres.find(…) ?? "src/main.tsx";
 *     y escribía un index.html que cargaba un archivo INEXISTENTE, anunciándolo
 *     como si estuviera. El log: «generado para cargar src/main.tsx» seguido de
 *     «no existe el punto de entrada «./src/main.tsx»». Un `??` con forma de dato.
 *
 *  B) ATASCO QUE NO SE RESUELVE SOLO. El tablero diagnosticaba «atascado» y ahí
 *     moraba: el cortacircuito enfriaba a los 60 s, las tareas seguían bloqueadas
 *     para siempre y la única salida era un botón que relanza todo el plan.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  puntoDeEntradaVerificable,
  indexHtmlHonesto,
  sondaDeEntrada,
} from "../src/engine/entradaReal";
import { planDeDesatasco } from "../src/engine/tableroParalelo";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf-8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = "") {
  if (condicion) { correctas++; console.log(`  ✓ ${titulo}`); }
  else { fallos.push(`${titulo}${detalle ? ` :: ${detalle}` : ""}`); console.log(`  ✗ ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

// ═══ A. El punto de entrada no se inventa ═══════════════════════════════════
seccion("A) entradaReal — una referencia a archivo solo se escribe si el archivo existe");
{
  comprobar("★ NUNCA devuelve un nombre que no esté en la lista",
    puntoDeEntradaVerificable(["src/App.tsx", "src/index.css"]) === null,
    String(puntoDeEntradaVerificable(["src/App.tsx", "src/index.css"])));

  comprobar("rechaza el `?? \"src/main.tsx\"` clásico: sin nada, devuelve null",
    puntoDeEntradaVerificable([]) === null && puntoDeEntradaVerificable(["README.md"]) === null);

  comprobar("reconoce main.tsx cuando SÍ está",
    puntoDeEntradaVerificable(["src/main.tsx", "src/App.tsx"]) === "src/main.tsx");
  comprobar("y no se queda ciego ante otros nombres válidos",
    puntoDeEntradaVerificable(["src/index.tsx"]) === "src/index.tsx" &&
    puntoDeEntradaVerificable(["src/app.jsx"]) === "src/app.jsx");
  comprobar("normaliza barras invertidas y ./ (Windows)",
    puntoDeEntradaVerificable(["src\\main.tsx"]) === "src/main.tsx" &&
    puntoDeEntradaVerificable(["./src/main.tsx"]) === "src/main.tsx");
  // Expectativa corregida tras endurecer el módulo: ni `main.test.ts` (test) ni
  // `App.tsx` (componente que nadie monta) son entrada. Devolver `src/App.tsx` era
  // exactamente el "HTML válido que produce pantalla en blanco" que se quería curar.
  comprobar("★ no confunde un TEST ni un COMPONENTE con la entrada",
    puntoDeEntradaVerificable(["src/main.test.ts", "src/App.tsx"]) === null);
  comprobar("pero sí ve la entrada real cuando está junto a esos dos",
    puntoDeEntradaVerificable(["src/main.test.ts", "src/App.tsx", "src/main.tsx"]) === "src/main.tsx");
  comprobar("no confunde un archivo de tipos con la entrada",
    puntoDeEntradaVerificable(["src/global.d.ts"]) === null);
  comprobar("prioriza main sobre index sobre app",
    puntoDeEntradaVerificable(["src/index.ts", "src/main.ts"]) === "src/main.ts");

  // El HTML: con entrada → la carga; sin entrada → NINGÚN src roto.
  const conEntrada = indexHtmlHonesto("src/main.tsx");
  const sinEntrada = indexHtmlHonesto(null);
  comprobar("con entrada verificada, el HTML la referencia",
    conEntrada.includes('src="./src/main.tsx"'));
  comprobar("★ SIN entrada, el HTML no contiene ningún <script src>",
    !/<script[^>]+src=/.test(sinEntrada), sinEntrada.match(/<script[^>]*>/g)?.join(" "));
  comprobar("y en ese caso la página lo DICE, no se queda en blanco",
    /sin punto de entrada/i.test(sinEntrada) && /src\/main\.tsx/.test(sinEntrada));

  // La sonda de salud: antes exigía /src/main.tsx aunque no existiera.
  comprobar("sonda con entrada declarada: se pregunta por ella",
    sondaDeEntrada("src/index.tsx", ["src/index.tsx"])?.ruta === "/src/index.tsx");
  comprobar("sonda sin entrada declarada: usa la verificada en disco",
    sondaDeEntrada(null, ["src/main.tsx"])?.ruta === "/src/main.tsx");
  comprobar("★ sonda sin nada en disco: null (no se inventa una exigencia)",
    sondaDeEntrada(null, ["src/App.tsx", "src/styles.css"]) === null);
}

// ═══ B. El atasco se resuelve solo, con frenos ══════════════════════════════
seccion("B) planDeDesatasco — del cartel rojo a la acción, con techo");
{
  const B = (id: string, cerrado: boolean, depPendiente = false) => ({ id, circuitoCerradoAhora: cerrado, dependeDePendiente: depPendiente });

  const libera = planDeDesatasco({
    bloqueadas: [B("t1", true)], enCurso: 0, esperando: 0, listas: 0, pendientes: 0, desatascosHechos: 0,
  });
  comprobar("★ circuito ya cerrado ⇒ LIBERA sin esperar al usuario",
    libera.accion === "liberar_circuito" && libera.tareas.join() === "t1", libera.motivo);
  comprobar("y explica qué va a hacer", /se liberan y se relanzan/i.test(libera.motivo));

  const espera = planDeDesatasco({
    bloqueadas: [B("t1", false)], enCurso: 0, esperando: 0, listas: 0, pendientes: 0, desatascosHechos: 0,
  });
  comprobar("★ circuito AÚN abierto ⇒ NO gasta un reintento inútil",
    espera.accion === "requiere_intervencion", espera.motivo);

  const trafico = planDeDesatasco({
    bloqueadas: [B("t1", true)], enCurso: 2, esperando: 0, listas: 0, pendientes: 0, desatascosHechos: 0,
  });
  comprobar("si algo corre, no se interviene (eso es tráfico, no atasco)",
    trafico.accion === "ninguna");

  const cola = planDeDesatasco({
    bloqueadas: [B("t1", true)], enCurso: 0, esperando: 3, listas: 0, pendientes: 0, desatascosHechos: 0,
  });
  comprobar("si algo espera hueco, tampoco", cola.accion === "ninguna");

  const depMuerta = planDeDesatasco({
    bloqueadas: [B("t2", true, true)], enCurso: 0, esperando: 0, listas: 0, pendientes: 0, desatascosHechos: 0,
  });
  comprobar("★ dependencia pendiente ⇒ no la libera (relanzarla daría el mismo fallo)",
    depMuerta.accion === "requiere_intervencion" && depMuerta.tareas.join() === "t2");

  const techo = planDeDesatasco({
    bloqueadas: [B("t1", true)], enCurso: 0, esperando: 0, listas: 0, pendientes: 0, desatascosHechos: 3, maxDesatascos: 3,
  });
  comprobar("★ TECHO: al tercer intento se RINDE y lo DICE (no bucle infinito)",
    techo.accion === "requiere_intervencion" && /techo 3/.test(techo.motivo), techo.motivo);
  comprobar("y nombra la causa probable, que es lo que el usuario puede arreglar",
    /clave|cuota|modelo/.test(techo.motivo));

  const huerfano = planDeDesatasco({
    bloqueadas: [], enCurso: 0, esperando: 0, listas: 2, pendientes: 1, desatascosHechos: 0,
  });
  comprobar("hay trabajo y nada corre SIN bloqueadas ⇒ también lo declara",
    huerfano.accion === "requiere_intervencion");

  const quieto = planDeDesatasco({
    bloqueadas: [], enCurso: 0, esperando: 0, listas: 0, pendientes: 0, desatascosHechos: 0,
  });
  comprobar("motor realmente quieto ⇒ ninguna (no finge un desatasco)",
    quieto.accion === "ninguna");

  comprobar("★ toda decisión trae motivo legible (cero intervenciones mudas)",
    [libera, espera, trafico, cola, depMuerta, techo, huerfano, quieto].every((d) => typeof d.motivo === "string" && d.motivo.length > 5));
}

// ═══ C. El cable ════════════════════════════════════════════════════════════
seccion("C) el cable — un módulo verde pero incomunicado no es una capacidad");
{
  const srv = leer("server.ts");
  const brain = leer(path.join("server", "routers", "brain.ts"));
  const runner = leer(path.join("src", "engine", "planRunner.ts"));
  // Solo código: la cabecera de entradaReal.ts CITA el `?? "src/main.tsx"` que
  // denuncia, y un guarda que lea comentarios se delata a sí mismo.
  const srvCod = srv.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  comprobar("★ server.ts ya no escribe el `?? \"src/main.tsx\"` al generar index.html",
    !/nombresProyecto\.find\([^)]*\)\s*\?\?\s*"src\/main\.tsx"/.test(srvCod));
  comprobar("★ ni el `|| \"src/main.tsx\"` de la vía rápida",
    !/entradaDeHtml\(html\)\s*\|\|\s*"src\/main\.tsx"/.test(srvCod));
  // Afirmaciones POSITIVAS sobre el fuente crudo (el recorte de comentarios puede
  // comerse líneas al aparear `/*`/`*/` en un archivo de 12 000 líneas: pasó aquí).
  // Las NEGATIVAS —«ya no queda el patrón malo»— sí van recortadas, que es justo
  // donde el comentario citaba el bug.
  comprobar("usa el generador honesto", /indexHtmlHonesto\(entrada\)/.test(srv));
  comprobar("y la sonda verificada, no la fija", /sondaDeEntrada\(null, nombresSrc\)/.test(srv));

  comprobar("★ planRunner importa la decisión pura y el hecho del circuito",
    /import \{ planDeDesatasco \} from "\.\/tableroParalelo"/.test(runner) &&
      /import \{ isCircuitOpen \} from "\.\/resilience"/.test(runner));
  comprobar("el desatasco mide el circuito, no lo supone",
    /circuitoCerradoAhora: !t\.claveCircuito \|\| !isCircuitOpen\(t\.claveCircuito\)/.test(runner));
  comprobar("★ y tiene techo guardado por plan", /this\.desatascos\.set\(planId/.test(runner));

  comprobar("★ el sondeo del panel lo invoca ANTES de leer los planes",
    brain.indexOf("desatascarAutomatico") < brain.indexOf("runner.listaPlanes().map((p) => planParaPanel(p))"));
  comprobar("un fallo del desatasco no tumba el sondeo",
    /desatasco automático falló/.test(brain));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ BUCLES AUTOMÁTICOS (v1.56.8): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length > 0) {
  console.log("FALLOS:");
  for (const f of fallos) console.log(`  · ${f}`);
  process.exit(1);
}
