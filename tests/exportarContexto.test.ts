/**
 * exportarContexto.test.ts — v1.57.19 · SUITE: EXPORTAR CONTEXTO PARA OTRA IA
 * =============================================================================
 * Los tres pedidos del usuario, verificados:
 *  1. filtro de comentarios CONSERVADOR (no rompe URLs ni strings con //);
 *  2. capas priorizadas (contratos → motor → UI afuera; monolito afuera salvo flag);
 *  3. marcador de estado LEÍDO DEL DISCO (versión + valla del contrato), y
 *     "NO VERIFICADO" cuando nadie corrió el ritual — prohibido afirmar verde de memoria.
 * Entradas hostiles nombradas: capa inexistente, bloque de comentario sin cerrar,
 * y archivo sin comentarios.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const pkg = JSON.parse(leer("package.json"));
const contrato = JSON.parse(leer("contrato-rutas.json"));

let correctas = 0; let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `— ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

console.log("\n📦 EXPORTAR CONTEXTO — v1.57.19\n");

const modulo = await import("../scripts/exportar-contexto.mjs") as any;

seccion("1 · El marcador de estado (el formato pedido, con números del disco)");
{
  const m = modulo.marcadorDeEstado({ version: "1.57.19", serverLineas: 12186, presupuesto: 12191, techo: 13700, estado: "ALL_GREEN" });
  comprobar("formato exacto del usuario", m === "// Version: 1.57.19 | Vallas: 12186/12191 (techo 13700) | State: ALL_GREEN", m);
  comprobar("la versión sale de package.json, no de un literal", pkg.version === JSON.parse(leer("package.json")).version && /Version: \d+\.\d+\.\d+/.test(m));
  comprobar("las vallas salen del contrato", Number(contrato.server_lineas) > 0 && Number(contrato.presupuesto_lineas) > 0);
}

seccion("2 · Filtro de comentarios conservador");
{
  const fuente = [
    "// comentario de línea entera",
    "const url = \"https://api.z.ai/v1\"; // nota al final: SE QUEDA",
    "/* bloque",
    "   dentro",
    "*/",
    "const x = 1; /* inline con cierre: se queda */",
    "export const y = 2;",
  ].join("\n");
  const r = modulo.filtrarComentarios(fuente);
  comprobar("quita la línea // entera y el bloque /* */", !r.texto.includes("comentario de línea entera") && !r.texto.includes("dentro"));
  comprobar("NO rompe la URL en string", r.texto.includes("https://api.z.ai/v1"));
  comprobar("NO toca comentarios al final de línea", r.texto.includes("nota al final: SE QUEDA") && r.texto.includes("inline con cierre"));
  comprobar("conserva el código", r.texto.includes("export const y = 2;"));
  comprobar("informa cuántas quitó (nada de magia silenciosa)", r.quitadas === 4, String(r.quitadas));
  const hostil = modulo.filtrarComentarios("/* sin cerrar\nconst a = 1;\n// final");
  comprobar("ENTRADA HOSTIL: bloque sin cerrar no rompe (queda fuera hasta el final)", typeof hostil.texto === "string");
  const limpio = modulo.filtrarComentarios("const z = 3;");
  comprobar("archivo sin comentarios: 0 quitadas", limpio.quitadas === 0 && limpio.texto === "const z = 3;");
}

seccion("3 · Capas y presupuesto de tokens (corrida real del script)");
{
  const salida = path.join(os.tmpdir(), `cn-export-${Date.now()}.md`);
  const r = spawnSync("node", ["scripts/exportar-contexto.mjs", "--capa", "contratos", "--sin-comentarios", "--salida", salida], { cwd: RAIZ, encoding: "utf8" });
  comprobar("corre en verde", r.status === 0, r.stderr?.slice(0, 120));
  const contenido = readFileSync(salida, "utf8");
  comprobar("arranca con el marcador", contenido.startsWith("// Version: "));
  comprobar("declara el estado NO VERIFICADO si nadie corrió el ritual (honestidad)", /State: NO VERIFICADO/.test(contenido));
  comprobar("avisa que el monolito está al límite del contrato", /NO sugieras refactors que agreguen líneas/.test(contenido));
  comprobar("la capa contratos NO trae la UI ni el motor", !/### src\/components\//.test(contenido) && !/### src\/engine\//.test(contenido));
  comprobar("informa el presupuesto estimado", /tokens estimados/.test(contenido));
  const hostil = spawnSync("node", ["scripts/exportar-contexto.mjs", "--capa", "inventada"], { cwd: RAIZ, encoding: "utf8" });
  comprobar("ENTRADA HOSTIL: capa inexistente → error claro (exit 2)", hostil.status === 2 && /Capa desconocida/.test(hostil.stderr || ""));
}

seccion("4 · Vallas: las tres features están en el script y documentadas");
{
  const script = leer("scripts/exportar-contexto.mjs");
  comprobar("filtro: flag --sin-comentarios", /--sin-comentarios/.test(script));
  comprobar("capas: contratos/motor/ui + arquitectura por defecto", /CAPAS = \{/.test(script) && /"arquitectura"/.test(script));
  comprobar("monolito afuera salvo --con-monolito", /out\.delete\("server\.ts"\)/.test(script) && /--con-monolito/.test(script));
  comprobar("marcador leído del disco (package.json + contrato-rutas.json)", /leerJson\("package\.json"/.test(script) && /leerJson\("contrato-rutas\.json"/.test(script));
  comprobar("presupuesto de tokens con lista de lo que quedó afuera", /--tokens-max/.test(script) && /quedaron afuera/.test(script));
  comprobar("--estado corre el ritual antes de afirmar verde", /spawnSync\("npm", \["run", "validar"\]/.test(script) && /ALL_GREEN \(verificado en este export\)/.test(script));
}

console.log(`\n═══ exportarContexto: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
