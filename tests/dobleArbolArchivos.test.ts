/**
 * tests/dobleArbolArchivos.test.ts — v1.60.0 · SISTEMA DE DOBLE ÁRBOL
 * =============================================================================
 * DEMUESTRA (capa PURA, sin red ni disco):
 *   · Lo que entra por chat/explorador cae en ENTRADA, FUERA del sandbox.
 *   · `sandbox_target` se auto-promueve al registrarse.
 *   · promover/expulsar mueven la pertenencia sin duplicar el nodo.
 *   · entrada = universo completo; sandbox = subconjunto promovido.
 *   · actualizar contenido re-hashea pero NO cambia la pertenencia al sandbox.
 *   · canonización de rutas (./, \\, / inicial) colapsa al mismo nodo.
 *   · el GUARDÍAN permite ruta nueva y ruta en sandbox, pero DENIEGA escribir
 *     sobre un archivo de entrada no promovido (anti-fuga de contexto).
 *
 * Se ejecuta con:  npx tsx tests/dobleArbolArchivos.test.ts
 */

import {
  GestorArboles,
  validarPermisoEscrituraSandbox,
  validarPermisoLecturaSandbox,
  componerContextoSandbox,
  canonizarRuta,
  hashContenido,
} from "../src/gestorArboles";
import type { NodoArchivo } from "../src/types/arboles";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle?: string): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

function bloque(nombre: string, fn: () => void): void {
  console.log(`\n── ${nombre} ──`);
  try {
    fn();
  } catch (e: any) {
    fallan++;
    fallos.push(`${nombre} (excepción)`);
    console.log(`  FALLO  ${nombre} lanzó ${e?.message || e}`);
  }
}

const RELOJ = 1_700_000_000_000; // reloj fijo para registros deterministas

function t1_entrada_fuera_del_sandbox(): void {
  const g = new GestorArboles();
  const n = g.registrarArchivoEntrada({
    pathRelativo: "src/app.ts",
    contenido: "// prueba",
    origen: "chat_drop",
    registradoEn: RELOJ,
  });
  comprobar("chat_drop entra FUERA del sandbox", n.incluidoEnSandbox === false, String(n.incluidoEnSandbox));
  comprobar("aparece en entrada", g.obtenerArbolEntrada().length === 1);
  comprobar("NO aparece en sandbox", g.obtenerArbolSandbox().length === 0);
  comprobar("nombre de hoja correcto", n.nombre === "app.ts", n.nombre);
  comprobar("hash determinista", n.hashUltimaModificacion === hashContenido("// prueba"), n.hashUltimaModificacion);
  comprobar("reloj inyectado respetado", n.registradoEn === RELOJ, String(n.registradoEn));
}

function t2_sandbox_target_autopromueve(): void {
  const g = new GestorArboles();
  const n = g.registrarArchivoEntrada({
    pathRelativo: "src/objetivo.ts",
    contenido: "export const x = 1;",
    origen: "sandbox_target",
    registradoEn: RELOJ,
  });
  comprobar("sandbox_target entra DENTRO del sandbox", n.incluidoEnSandbox === true, String(n.incluidoEnSandbox));
  comprobar("sandbox tiene 1", g.obtenerArbolSandbox().length === 1);
  comprobar("entrada también lo contiene", g.obtenerArbolEntrada().length === 1);
}

function t3_promover_y_expulsar(): void {
  const g = new GestorArboles();
  g.registrarArchivoEntrada({ pathRelativo: "a.ts", contenido: "a", origen: "explorador_manual", registradoEn: RELOJ });
  comprobar("promover ruta inexistente -> false", g.promoverASandbox("noexiste.ts") === false);
  comprobar("promover a.ts -> true", g.promoverASandbox("a.ts") === true);
  comprobar("a.ts ahora en sandbox", g.obtenerArbolSandbox().length === 1);
  comprobar("re-promover a.ts -> false (ya estaba)", g.promoverASandbox("a.ts") === false);
  comprobar("expulsar a.ts -> true", g.expulsarDeSandbox("a.ts") === true);
  comprobar("sandbox vacío, entrada intacta", g.obtenerArbolSandbox().length === 0 && g.obtenerArbolEntrada().length === 1);
  comprobar("re-expulsar -> false", g.expulsarDeSandbox("a.ts") === false);
}

function t4_no_duplica_nodo(): void {
  const g = new GestorArboles();
  g.registrarArchivoEntrada({ pathRelativo: "dup.ts", contenido: "v1", origen: "chat_drop", registradoEn: RELOJ });
  g.promoverASandbox("dup.ts");
  const n2 = g.registrarArchivoEntrada({ pathRelativo: "dup.ts", contenido: "v2", origen: "chat_drop", registradoEn: RELOJ });
  comprobar("actualizar NO duplica (sigue 1)", g.obtenerArbolEntrada().length === 1);
  comprobar("re-hash tras actualizar", n2.hashUltimaModificacion === hashContenido("v2"), n2.hashUltimaModificacion);
  comprobar("actualizar conserva pertenencia al sandbox", n2.incluidoEnSandbox === true, String(n2.incluidoEnSandbox));
  comprobar("sandbox sigue con 1", g.obtenerArbolSandbox().length === 1);
}

function t5_canonizacion(): void {
  comprobar("./a/b -> a/b", canonizarRuta("./a/b") === "a/b", canonizarRuta("./a/b"));
  comprobar("/a/b -> a/b", canonizarRuta("/a/b") === "a/b", canonizarRuta("/a/b"));
  comprobar("backslash -> slash", canonizarRuta("a\\b\\c.ts") === "a/b/c.ts", canonizarRuta("a\\b\\c.ts"));
  const g = new GestorArboles();
  g.registrarArchivoEntrada({ pathRelativo: "./x/y.ts", contenido: "1", origen: "chat_drop", registradoEn: RELOJ });
  g.registrarArchivoEntrada({ pathRelativo: "x/y.ts", contenido: "2", origen: "chat_drop", registradoEn: RELOJ });
  comprobar("./x/y.ts y x/y.ts son el mismo nodo", g.obtenerArbolEntrada().length === 1);
}

function t6_guardian_escritura(): void {
  const g = new GestorArboles();
  // ruta nueva, no registrada -> permitido (archivo nuevo de obra)
  const nueva = validarPermisoEscrituraSandbox(g, "nuevo/archivo.ts");
  comprobar("ruta nueva -> permitido", nueva.permitido === true, nueva.motivo);
  // ruta en entrada SIN promover -> denegado
  g.registrarArchivoEntrada({ pathRelativo: "privado/datos.ts", contenido: "secreto", origen: "chat_drop", registradoEn: RELOJ });
  const denegado = validarPermisoEscrituraSandbox(g, "privado/datos.ts");
  comprobar("entrada no promovida -> DENEGADO", denegado.permitido === false);
  comprobar("el motivo cita promover_archivo_sandbox", /promover_archivo_sandbox/.test(denegado.motivo), denegado.motivo);
  // tras promover -> permitido
  g.promoverASandbox("privado/datos.ts");
  const permitido = validarPermisoEscrituraSandbox(g, "privado/datos.ts");
  comprobar("tras promover -> permitido", permitido.permitido === true, permitido.motivo);
  // ruta vacía -> denegado
  comprobar("ruta vacía -> denegado", validarPermisoEscrituraSandbox(g, "").permitido === false);
}

function t7_estado_y_orden(): void {
  const g = new GestorArboles();
  g.registrarArchivoEntrada({ pathRelativo: "z.ts", contenido: "z", origen: "chat_drop", registradoEn: RELOJ });
  g.registrarArchivoEntrada({ pathRelativo: "a.ts", contenido: "a", origen: "sandbox_target", registradoEn: RELOJ });
  g.registrarArchivoEntrada({ pathRelativo: "m.ts", contenido: "m", origen: "explorador_manual", registradoEn: RELOJ });
  const estado = g.obtenerEstado();
  comprobar("entrada ordenada por ruta", estado.entrada.map((n: NodoArchivo) => n.pathRelativo).join(",") === "a.ts,m.ts,z.ts");
  comprobar("sandbox solo el target", estado.sandbox.length === 1 && estado.sandbox[0].pathRelativo === "a.ts");
  const t = g.tamanos();
  comprobar("tamaños: entrada 3 / sandbox 1", t.entrada === 3 && t.sandbox === 1, `${t.entrada}/${t.sandbox}`);
  comprobar("alias obtenerSandbox == obtenerArbolSandbox", g.obtenerSandbox().length === g.obtenerArbolSandbox().length);
}

function t8_guardian_lectura(): void {
  const g = new GestorArboles();
  // ruta no registrada -> permitido (archivo del proyecto que el ciclo no conoce)
  comprobar("lectura de ruta nueva -> permitido", validarPermisoLecturaSandbox(g, "src/desconocido.ts").permitido === true);
  // ruta en entrada sin promover -> DENEGADO (no se carga a contexto)
  g.registrarArchivoEntrada({ pathRelativo: "privado/clave.ts", contenido: "x", origen: "chat_drop", registradoEn: RELOJ });
  const den = validarPermisoLecturaSandbox(g, "privado/clave.ts");
  comprobar("lectura de entrada no promovida -> DENEGADO", den.permitido === false);
  comprobar("el motivo cita promover_archivo_sandbox", /promover_archivo_sandbox/.test(den.motivo), den.motivo);
  // tras promover -> permitido
  g.promoverASandbox("privado/clave.ts");
  comprobar("tras promover -> lectura permitida", validarPermisoLecturaSandbox(g, "privado/clave.ts").permitido === true);
  comprobar("lectura de ruta vacía -> denegado", validarPermisoLecturaSandbox(g, "").permitido === false);
}

function t9_contexto_sandbox(): void {
  const g = new GestorArboles();
  comprobar("contexto vacío lo dice", /vacío/.test(componerContextoSandbox(g)));
  g.registrarArchivoEntrada({ pathRelativo: "src/app.ts", contenido: "hola", origen: "sandbox_target", registradoEn: RELOJ });
  g.registrarArchivoEntrada({ pathRelativo: "notas.md", contenido: "ruido del usuario", origen: "chat_drop", registradoEn: RELOJ });
  const ctx = componerContextoSandbox(g);
  comprobar("el contexto incluye el archivo del sandbox", /src\/app\.ts/.test(ctx), ctx);
  comprobar("el contexto NO incluye material de entrada no promovido", !/notas\.md/.test(ctx), ctx);
  comprobar("el contexto cuenta 1 archivo", /1 archivo/.test(ctx), ctx);
}

// ─── Ejecución ────────────────────────────────────────────────
console.log("═══ PRUEBAS DOBLE ÁRBOL DE ARCHIVOS · CerebroNico v1.60.3 ═══");
bloque("1. Entrada fuera del sandbox", t1_entrada_fuera_del_sandbox);
bloque("2. sandbox_target auto-promueve", t2_sandbox_target_autopromueve);
bloque("3. Promover y expulsar", t3_promover_y_expulsar);
bloque("4. Actualizar no duplica", t4_no_duplica_nodo);
bloque("5. Canonización de rutas", t5_canonizacion);
bloque("6. Guardían de escritura", t6_guardian_escritura);
bloque("7. Estado y orden", t7_estado_y_orden);
bloque("8. Guardían de lectura", t8_guardian_lectura);
bloque("9. Contexto del sandbox", t9_contexto_sandbox);

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
