/**
 * scripts/banco-herramientas.ts — v1.0.31 · corre el banco P0 desde consola
 * =====================================================================
 * Uso:
 *   npx tsx scripts/banco-herramientas.ts                      (valida el banco)
 *   npx tsx scripts/banco-herramientas.ts --transcripcion x.jsonl   (mide)
 *   npx tsx scripts/banco-herramientas.ts --perfil hueso --transcripcion x.jsonl
 *
 * Sin `--transcripcion` NO inventa números: comprueba que el banco sea válido
 * contra el registro real y dice qué haría falta para medir. Un banco que se
 * rellena solo con ceros es peor que no tener banco.
 *
 * Formato del JSONL (una línea por caso medido, lo que emite el arnés):
 *   {"caso":"ed-01","visibles":["read_file",…],"llamadas":["read_file"],
 *    "fuente":"nativo","tokensEntrada":1200,"tokensSalida":40,"ttftMs":850,
 *    "texto":"…respuesta cruda…"}
 * Si no vienen `llamadas` pero viene `texto`, se extraen del texto (los modelos
 * sin function-calling escriben la llamada).
 *
 * Sale con código 1 si el banco no es válido o si falta el catálogo completo, para
 * que un CI no confunda «no medí nada» con «todo bien».
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluarBanco,
  informeBanco,
  validarCasos,
  parsearLlamadasDeTexto,
  type CasoBanco,
  type TurnoMedido,
} from "../src/engine/bancoHerramientas";
import { registerBuiltinPacks, getAllToolNames } from "../src/engine/toolRegistry";
import { registrarPackDocumentos } from "../src/engine/packDocumentos";
import { registrarPackTerminal } from "../src/engine/packTerminal";

/** Perfiles de visibilidad con los que se recorta el catálogo en el arnés real. */
export const PERFILES: Record<string, string[]> = {
  hueso: ["set_plan", "update_task", "read_file", "edit_file", "run_command", "run_tests", "revisar_cambios", "deshacer_cambios", "list_files", "write_file", "search_in_files"],
};

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): number {
  registerBuiltinPacks();
  registrarPackDocumentos();
  registrarPackTerminal();
  const registro = getAllToolNames();

  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const ruta = arg("banco") || path.join(aqui, "..", "tests", "fixtures", "banco-herramientas.json");
  let banco: { version: number; casos: CasoBanco[] };
  try {
    banco = JSON.parse(fs.readFileSync(ruta, "utf-8"));
  } catch (e) {
    console.error(`No puedo leer el banco: ${ruta}`);
    console.error(String((e as Error)?.message || e));
    return 1;
  }
  const casos = banco?.casos || [];

  console.log(`BANCO v${banco?.version ?? "?"} · ${casos.length} casos · registro con ${registro.length} herramientas`);
  const problemas = validarCasos(casos, registro);
  if (problemas.length) {
    console.log("\nEL BANCO NO ES VÁLIDO (mide ruido, no modelos):");
    for (const p of problemas) console.log(`  · ${p}`);
    return 1;
  }
  console.log("validez: OK (ids únicos, esperadas y aceptables existen, cobertura de categorías)");

  const perfil = arg("perfil");
  if (perfil) {
    const visibles = PERFILES[perfil];
    if (!visibles) {
      console.log(`\nPerfil desconocido «${perfil}». Conocidos: ${Object.keys(PERFILES).join(", ")}`);
      return 1;
    }
    const imposibles = casos.filter((c) => !visibles.includes(c.esperada));
    console.log(`\nPERFIL ${perfil}: ${visibles.length} herramientas visibles · ${casos.length - imposibles.length} casos posibles · ${imposibles.length} imposibles`);
    const porCat = new Map<string, number>();
    for (const c of imposibles) porCat.set(c.categoria, (porCat.get(c.categoria) || 0) + 1);
    for (const [cat, n] of [...porCat.entries()].sort()) console.log(`  · ${cat}: ${n} imposibles`);
    if (imposibles.length) console.log("  (un banco honesto NO suma estos casos al acierto: los declara aparte)");
  }

  const transcripcion = arg("transcripcion");
  if (!transcripcion) {
    console.log("\nSin --transcripcion no hay medición: el banco está listo y no inventa números.");
    console.log("Arnés: npx tsx scripts/banco-herramientas.ts --transcripcion medidas.jsonl");
    return 0;
  }

  let lineas: string[];
  try {
    lineas = fs.readFileSync(transcripcion, "utf-8").split(/\r?\n/).filter((l) => l.trim());
  } catch (e) {
    console.error(`No puedo leer la transcripción: ${transcripcion}`);
    console.error(String((e as Error)?.message || e));
    return 1;
  }
  const conocidas = registro;
  const turnos: TurnoMedido[] = [];
  let rotas = 0;
  for (const [i, linea] of lineas.entries()) {
    try {
      const o = JSON.parse(linea);
      const llamadas = Array.isArray(o.llamadas) && o.llamadas.length
        ? o.llamadas.map(String)
        : parsearLlamadasDeTexto(String(o.texto || ""), conocidas).llamadas;
      turnos.push({
        caso: String(o.caso),
        visibles: Array.isArray(o.visibles) ? o.visibles.map(String) : [],
        llamadas,
        fuente: o.fuente || (o.texto ? "texto" : "ninguna"),
        sinRespuesta: o.sinRespuesta === true,
        tokensEntrada: Number(o.tokensEntrada) || 0,
        tokensSalida: Number(o.tokensSalida) || 0,
        ttftMs: Number(o.ttftMs) || undefined,
      });
    } catch {
      rotas++;
      console.log(`  · línea ${i + 1} ilegible: se omite`);
    }
  }
  const r = evaluarBanco(casos, turnos);
  console.log(`\n${informeBanco(r, path.basename(transcripcion))}`);
  if (rotas) console.log(`\n· ${rotas} líneas ilegibles (no cuentan como fallo)`);
  return 0;
}

if (process.argv[1] && /banco-herramientas\.ts$/.test(process.argv[1])) {
  process.exitCode = main();
}
