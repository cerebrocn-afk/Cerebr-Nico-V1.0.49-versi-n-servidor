/**
 * limpiezaTarea.test.ts — la conducta de limpiar, probada.
 * Patrón del proyecto: «N correctas · 0 fallidas», exit 1 si hay fallos.
 */
import {
  clasificarRuta,
  barrerAlCerrar,
  rutaDeTrabajoPermitida,
  inventarioDeLimpieza,
  PREFIJOS_TEMPORAL_PROPIO,
  NUNCA_TOCAR,
  SE_CONSERVA,
} from "../src/engine/limpiezaTarea";

let correctas = 0;
let fallidas = 0;

function check(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    correctas++;
  } else {
    fallidas++;
    console.error(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

// ── 1. Los 8 archivos REALES que el agente dejó en Downloads el 04/11 ────────
const basuraRealDeDownloads = [
  "_aplicar_parche.cjs",
  "_estado_actual.cjs",
  "_listar_parche.cjs",
  "_listar_parche.ps1",
  "_ls.cjs",
  "_verif_parche.cjs",
  "_verif_suites.cjs",
  "_mv.cjs",
];
for (const f of basuraRealDeDownloads) {
  const c = clasificarRuta(f);
  check(`Downloads/${f} se clasifica como borrar`, c.destino === "borrar", `dio ${c.destino}`);
}

// ── 2. La basura REAL que dejó en app/ y puso roja la suite peluza ───────────
const basuraRealDeApp = [
  "_build_bg.cjs",
  "_chk_build.cjs",
  "_chk_interruptor.cjs",
  "_espera.cjs",
  "_l2.cjs",
  "_leer_validar.cjs",
  "_leer2.py",
  "_limpiar2.py",
  "_esperar_veredicto.py",
  "_veredicto.py",
  "validar_out.txt",
];
for (const f of basuraRealDeApp) {
  const c = clasificarRuta(f);
  check(`app/${f} se clasifica como borrar`, c.destino === "borrar", `dio ${c.destino}`);
}

// ── 3. El respaldo del parche NO se borra: es del usuario ────────────────────
const respaldo = clasificarRuta("_respaldo-pre-2.3.9-2026-11-04T08-59-04");
check("el respaldo del parche se conserva", respaldo.destino === "conservar", `dio ${respaldo.destino}`);
check("el respaldo explica por qué se conserva", respaldo.porQue.includes("respaldo"), respaldo.porQue);

// ── 4. Secretos y artefactos: prohibido tocarlos ─────────────────────────────
for (const s of [".env", ".env.local", "id_rsa", "credentials.json", ".npmrc"]) {
  const c = clasificarRuta(s);
  check(`${s} es prohibido (no se borra ni por limpieza)`, c.destino === "prohibido", `dio ${c.destino}`);
}
for (const a of ["node_modules/", ".git/", "dist/", ".proyectos/"]) {
  const c = clasificarRuta(a);
  check(`${a} es prohibido (artefacto)`, c.destino === "prohibido", `dio ${c.destino}`);
}

// ── 5. Lo que no es mío se pregunta, nunca se borra por descarte ─────────────
const ajeno = clasificarRuta("CerebroNico-IDE-v2.3.9.zip");
check("un ZIP del usuario se pregunta, no se borra", ajeno.destino === "preguntar", `dio ${ajeno.destino}`);
const ajeno2 = clasificarRuta("notas-del-usuario.txt");
check("un archivo del usuario se pregunta", ajeno2.destino === "preguntar", `dio ${ajeno2.destino}`);

// ── 6. El barrido de cierre: clasifica todo y NO está limpio si hay pendientes ─
const barrido = barrerAlCerrar([...basuraRealDeDownloads, ...basuraRealDeApp, "_respaldo-pre-2.3.9-2026-11-04T08-59-04"]);
check("el barrido marca 19 temporales a borrar", barrido.borrar.length === 19, `dio ${barrido.borrar.length}`);
check("el barrido conserva el respaldo", barrido.conservar.length === 1, `dio ${barrido.conservar.length}`);
check("el barrido NO está limpio: quedan 19 por borrar", barrido.limpio === false, `limpio=${barrido.limpio}`);
check("el barrido informa en español", barrido.informe.includes("temporal"), barrido.informe);
check("el barrido nombra el respaldo conservado", barrido.informe.includes("respaldo"), barrido.informe);

// Tras borrar los 19, el barrido de lo que queda SÍ está limpio.
const trasBorrar = barrerAlCerrar(["_respaldo-pre-2.3.9-2026-11-04T08-59-04"]);
check("tras borrar los temporales, el barrido está limpio", trasBorrar.limpio === true, `limpio=${trasBorrar.limpio}`);
check("tras borrar, el respaldo sigue conservado", trasBorrar.conservar.length === 1);

const barridoSucio = barrerAlCerrar(["_x.cjs", "archivo-del-usuario.txt"]);
check("con una ruta sin clasificar NO está limpio", barridoSucio.limpio === false);
check("el barrido sucio nombra la ruta a preguntar", barridoSucio.preguntar.includes("archivo-del-usuario.txt"));

const barridoVacio = barrerAlCerrar([]);
check("barrido vacío está limpio", barridoVacio.limpio === true);
check("barrido vacío lo dice", barridoVacio.informe.includes("nada que limpiar"), barridoVacio.informe);

// ── 7. Dónde se permite trabajar: no en la carpeta personal ──────────────────
const enDescargas = rutaDeTrabajoPermitida("Downloads/_parche_tmp/x.cjs");
check("crear en Downloads está prohibido", enDescargas.ok === false, enDescargas.porQue);
const enEscritorio = rutaDeTrabajoPermitida("Desktop/tmp.txt");
check("crear en Desktop está prohibido", enEscritorio.ok === false, enEscritorio.porQue);
const enTmpTarea = rutaDeTrabajoPermitida(".tmp-tarea/leer.cjs");
check("crear en .tmp-tarea/ está permitido", enTmpTarea.ok === true, enTmpTarea.porQue);
const enProyecto = rutaDeTrabajoPermitida("scripts/tmp.cjs");
check("crear dentro del proyecto está permitido", enProyecto.ok === true, enProyecto.porQue);

// ── 8. El inventario está completo y no se contradice ────────────────────────
const inv = inventarioDeLimpieza();
check("el inventario lista los prefijos de temporal", inv.borrar.length === PREFIJOS_TEMPORAL_PROPIO.length);
check("el inventario lista lo que nunca se toca", inv.nunca.length === NUNCA_TOCAR.length);
check("el inventario lista lo que se conserva", inv.conservar.length === SE_CONSERVA.length);
check("ningún prefijo de temporal es también secreto", !PREFIJOS_TEMPORAL_PROPIO.some((p) => NUNCA_TOCAR.includes(p)));

// ── 9. Casos límite ──────────────────────────────────────────────────────────
check("ruta vacía se pregunta", clasificarRuta("").destino === "preguntar");
check("ruta con barras invertidas se normaliza", clasificarRuta("_x.cjs").ruta === "_x.cjs");
check("ruta con ./ adelante se normaliza", clasificarRuta("./_x.cjs").ruta === "_x.cjs");
check("un secreto con guion bajo sigue siendo prohibido", clasificarRuta("_id_rsa").destino === "prohibido");

console.log(`\n${correctas} correctas · ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
