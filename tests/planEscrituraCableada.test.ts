/**
 * planEscrituraCableada.test.ts — v1.60.9 · LA MANO YA ESTÁ ENCHUFADA
 * =============================================================================
 * REGRESIÓN del bug real reportado por Mario (sesión v1.60.8, modelo
 * openrouter/free): el planificador construyó un plan correcto de 6 tareas y las
 * 5 escrituras fallaron con «este contexto no tiene escritura de archivos
 * cableada». No era culpa del modelo ni de la config: `planExecutors` SÍ sabe
 * escribir, pero la fábrica `crearEjecutorDePlanes` del router del cerebro
 * (`server/routers/brain.ts`) nunca inyectaba las primitivas `escribirArchivo`
 * ni `verificarArchivo`, así que el guard de honestidad rompía TODA tarea de
 * escritura.
 *
 * Este test congela dos cosas:
 *   1) El ejecutor, con las primitivas inyectadas (igual que ahora hace
 *      brain.ts), ESCRIBE de verdad y la PUERTA DE EVIDENCIA lo confirma.
 *   2) brain.ts conserva el cableado — si alguien vuelve a quitar
 *      `escribirArchivo`/`verificarArchivo` de la fábrica, este test falla.
 *
 * Corre con:  npx tsx tests/planEscrituraCableada.test.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { crearEjecutorDePlanes } from "../src/engine/planExecutors";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

const senal = () => new AbortController().signal;
const tarea = (datos: any, tipo = "escribir_archivo"): any => ({
  id: "1", titulo: "escribir", tipo, peso: "io", dependeDe: [], estado: "pendiente", intentos: 0, datos,
});

async function main() {
  const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), "cn-cableada-"));

  // ── 1. CON las primitivas cableadas (lo que brain.ts hace ahora) ──────────
  const ejecutar = crearEjecutorDePlanes({
    escribirArchivo: async (rutaRel, contenido) => {
      const abs = path.resolve(RAIZ, rutaRel);
      if (abs !== RAIZ && !abs.startsWith(RAIZ + path.sep)) throw new Error("fuera de raíz");
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, contenido, "utf8");
      return rutaRel;
    },
    verificarArchivo: async (rutaRel) => {
      try {
        const st = fs.statSync(path.resolve(RAIZ, rutaRel));
        return { existe: st.isFile(), bytes: st.size };
      } catch {
        return { existe: false, bytes: 0 };
      }
    },
  } as any);

  const r1 = await ejecutar(tarea({ ruta: "test-sitio/index.html", contenido: "<h1>hola</h1>" }), senal());
  comprobar("escribe y VERIFICA en disco", /VERIFICADO/.test(r1.resumen), r1.resumen);
  comprobar("el archivo existe de verdad", fs.existsSync(path.join(RAIZ, "test-sitio/index.html")));
  comprobar("devuelve el artefacto", (r1.artefactos || [])[0] === "test-sitio/index.html", JSON.stringify(r1.artefactos));

  // ── 2. SIN cablear: reproduce el bug exacto que vio Mario ────────────────
  const ejecutarPelado = crearEjecutorDePlanes({} as any);
  let mensaje = "";
  try {
    await ejecutarPelado(tarea({ ruta: "test-sitio/index.html", contenido: "x" }), senal());
  } catch (e: any) {
    mensaje = String(e?.message || e);
  }
  comprobar("sin cablear falla con el mensaje honesto", /no tiene escritura de archivos cableada/.test(mensaje), mensaje);

  // ── 3. brain.ts conserva el cableado (guard de regresión del router) ──────
  const brain = fs.readFileSync(path.join(process.cwd(), "server", "routers", "brain.ts"), "utf8");
  const bloque = brain.slice(brain.indexOf("crearEjecutorDePlanes({"));
  comprobar("brain.ts cablea escribirArchivo", /escribirArchivo:\s*async/.test(bloque));
  comprobar("brain.ts cablea verificarArchivo", /verificarArchivo:\s*async/.test(bloque));

  console.log(`\nplanEscrituraCableada: ${correctas} correctas · ${fallos.length} fallidas`);
  if (fallos.length) {
    console.log("FALLOS:");
    for (const f of fallos) console.log("  · " + f);
    process.exit(1);
  }
  console.log("✅ v1.60.9 — el planificador ya escribe archivos de verdad (mano cableada + verificada en disco).");
}

main();
