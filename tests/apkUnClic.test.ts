/**
 * tests/apkUnClic.test.ts — «SOLO EXPORTAR APK Y LISTO» (v1.0.21)
 * ==============================================================
 * El pedido de Mario fue una frase y cuatro botones: «solo exportar apk y listo».
 * La valla vive aquí porque la decisión es pura: la secuencia completa —generar,
 * compilar, preparar toolchain y volver a compilar, descargar— se decide a partir
 * de hechos, y los hechos se pueden mentir en un test.
 *
 * Los casos salen de los callejones REALES del panel anterior:
 *   · «Compilar» devolvía 400 por toolchain y el panel esperaba OTRO clic.
 *   · Un éxito de Gradle con el archivo ausente no podía convertirse en descarga.
 *   · Preparar el toolchain en bucle es cómo se castiga una máquina de 8 GB.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  siguienteAccion,
  descargaAutomaticaPermitida,
  cuentaToolchain,
  type HechosUnClic,
} from "../src/engine/apkUnClic";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf-8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = "") {
  if (condicion) { correctas++; console.log(`  ✓ ${titulo}`); }
  else { fallos.push(`${titulo}${detalle ? ` :: ${detalle}` : ""}`); console.log(`  ✗ ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

const base: HechosUnClic = {
  hayApkVerificado: false,
  proyectoGenerado: null,
  compilacion: { tipo: "sin-trabajo" },
  toolchainIntentado: false,
  faltaToolchainEnMaquina: false,
};

// ═══ 1. El camino feliz de un clic ══════════════════════════════════════════
seccion("1) el clic único recorre generar → compilar → descargar");
{
  const p1 = siguienteAccion({ ...base, proyectoGenerado: false });
  comprobar("★ sin proyecto, el primer paso es generar (no compilar a ciegas)",
    p1.accion === "generar", p1.accion);
  comprobar("el motivo dice qué está pasando", /proyecto android/i.test(p1.motivo), p1.motivo);

  const p2 = siguienteAccion({ ...base, proyectoGenerado: true });
  comprobar("★ con proyecto y sin trabajo, compila sin preguntar",
    p2.accion === "compilar", p2.accion);

  const p3 = siguienteAccion({ ...base, hayApkVerificado: true, compilacion: { tipo: "exito", apkBytes: 881_000 } });
  comprobar("★ un APK verificado se entrega: no se recompila",
    p3.accion === "descargar", p3.accion);
}

// ═══ 2. El callejón que se cierra: falta el toolchain ═══════════════════════
seccion("2) falta el toolchain: se prepara SOLO y se reintenta");
{
  const fallo: HechosUnClic["compilacion"] = {
    tipo: "fallo",
    causa: "No hay JDK 17 ni Gradle en esta máquina.",
    solucion: "Prepará el toolchain desde la IDE.",
    faltaToolchain: true,
  };
  const p = siguienteAccion({ ...base, proyectoGenerado: true, compilacion: fallo });
  comprobar("★ el 400 por toolchain ya no espera otro clic: prepara y sigue",
    p.accion === "preparar-toolchain", p.accion);
  comprobar("y lo dice sin tecnicismos", /no hace falta otro clic/i.test(p.motivo), p.motivo);

  const p2 = siguienteAccion({ ...base, proyectoGenerado: true, compilacion: fallo, toolchainIntentado: true });
  comprobar("★ si ya se intentó, NO se baja en bucle: para y explica",
    p2.accion === "parar" && /bucle/.test(p2.motivo), `${p2.accion} :: ${p2.motivo}`);

  const p3 = siguienteAccion({ ...base, proyectoGenerado: true, compilacion: fallo, toolchainIntentado: true });
  comprobar("al parar conserva la solución concreta del servidor",
    /Prepará el toolchain/.test(p3.motivo), p3.motivo);

  const maquina = siguienteAccion({ ...base, proyectoGenerado: true, faltaToolchainEnMaquina: true });
  comprobar("con la sonda diciendo que falta, se prepara antes de compilar",
    maquina.accion === "preparar-toolchain", maquina.accion);
}

// ═══ 3. Un fallo que NO es de toolchain ═════════════════════════════════════
seccion("3) los fallos ajenos al toolchain no se tapan ni se reintentan solos");
{
  const fatal: HechosUnClic["compilacion"] = {
    tipo: "fallo",
    causa: "El JRE no trae javac.",
    solucion: "Instalá un JDK 17.",
    faltaToolchain: false,
  };
  const p = siguienteAccion({ ...base, proyectoGenerado: true, compilacion: fatal });
  comprobar("★ para, con causa y solución juntas", p.accion === "parar" && /javac/.test(p.motivo) && /JDK 17/.test(p.motivo), p.motivo);
  comprobar("y ofrece reintentar a mano (no lo hace solo)", p.etiquetaBoton === "Reintentar", String(p.etiquetaBoton));
  comprobar("no pide toolchain: la causa es otra", p.accion !== "preparar-toolchain");
}

// ═══ 4. Trabajo vivo ════════════════════════════════════════════════════════
seccion("4) compilación en marcha: se sigue, no se lanza otra");
{
  const p = siguienteAccion({ ...base, proyectoGenerado: true, compilacion: { tipo: "corriendo" } });
  comprobar("★ una sola compilación viva por máquina", p.accion === "esperar", p.accion);
  comprobar("el motivo lo explica", /compilación en marcha/i.test(p.motivo), p.motivo);
}

// ═══ 5. Descarga automática ═════════════════════════════════════════════════
seccion("5) la descarga sola solo si el navegador la va a aceptar");
{
  comprobar("★ clic del usuario + página interactuada = descarga sola", descargaAutomaticaPermitida(true, true));
  comprobar("sin gesto del usuario, se deja el enlace (Chrome la bloquearía)",
    !descargaAutomaticaPermitida(true, false));
  comprobar("sin interacción previa, tampoco", !descargaAutomaticaPermitida(false, true));
  comprobar("cuentaToolchain: preparar marca el intento", cuentaToolchain(false, "preparar-toolchain"));
  comprobar("cuentaToolchain: compilar no lo marca", !cuentaToolchain(false, "compilar"));
}

// ═══ 6. Vallas de alambre sobre el panel ════════════════════════════════════
seccion("6) el panel obedece la decisión, no la reimplementa");
{
  const panel = leer(path.join("src", "components", "PanelAndroid.tsx"));
  comprobar("★ el panel importa la decisión pura", /from "\.\.\/engine\/apkUnClic"/.test(panel));
  // v1.0.21 · el veredicto de Mario lo cazó: `proyectoGenerado` se pasaba como
  // atajo sin declarar (TS18004). Toda propiedad del hecho tiene que venir de una
  // variable REAL del panel, no de un nombre suelto.
  comprobar("★ cada hecho que se pasa a la decisión existe en el scope del panel",
    /proyectoGenerado: proyectoListo/.test(panel) &&
    /toolchainIntentado: toolchainIntentadoRef\.current/.test(panel) &&
    /compilacion: c\b/.test(panel));
  comprobar("★ hay UN botón «Exportar APK y listo»", /Exportar APK y listo/.test(panel));
  comprobar("el botón grande arranca la cadena", /onClick=\{exportarYListo\}/.test(panel));
  comprobar("generar en cadena continúa solo a compilar", /if \(auto\) void compilar\(true\)/.test(panel));
  comprobar("★ un 400 por toolchain entra a preparar sin otro clic",
    /faltaToolchain = datos\.puedeAprovisionar === true/.test(panel) && /terminoCompilacion\(/.test(panel));
  comprobar("los pasos manuales siguen disponibles plegados", /pasos manuales/.test(panel) && /1\. Generar proyecto/.test(panel) && /2\. Compilar APK/.test(panel));
  comprobar("la descarga automática se crea y se quita del documento", /a\.click\(\)/.test(panel) && /a\.remove\(\)/.test(panel));
  comprobar("sin APK real no hay fase listo (el error manda)", /estado\.fase === "error"/.test(panel));

  // ★ La bandera que dispara la rama del toolchain sale SIEMPRE de un hecho medido:
  // el servidor sondea disco + `java -version` + `gradle -v` en el momento del 400
  // y manda `puedeAprovisionar`; si no la mandara, el clic se quedaría esperando.
  const router = leer(path.join("server", "routers", "exportacion.ts"));
  comprobar("★ el 400 lleva puedeAprovisionar y se mide al vuelo (disco + java + gradle)",
    /const puedeAprovisionar = Object\.values\(faltanToolchainAhora\(\)\)/.test(router) &&
    /spawnSync\("java", \["-version"\]/.test(router) &&
    /spawnSync\("gradle", \["-v"\]/.test(router));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ APK UN CLIC (v1.0.21): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length > 0) {
  console.log("FALLOS:");
  for (const f of fallos) console.log(`  · ${f}`);
  process.exit(1);
}
