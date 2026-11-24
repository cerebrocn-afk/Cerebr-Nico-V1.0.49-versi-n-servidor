#!/usr/bin/env node
/**
 * limpiar-raiz.mjs · «ANTES DE INSTALACIÓN QUE LIMPIE C:\Cerebronico» (v1.99.0)
 * =============================================================================
 * El criterio vive en `src/engine/hemisferios.ts` (`esResiduoDatos`). NÚCLEO = memoria
 * aprendida (LECCIONES, REANUDAR, .cerebro-db, órganos, papelera); RESIDUO = lo que dejó
 * una corrida (`.py` sueltos, `.log`, `.txt`, `.bak-*`, `.bat` de prueba).
 *
 * Nada se borra: el residuo se MUEVE a `.cerebro-papelera/<marca>/` conservando su nombre
 * y con un `indice.txt` que dice qué se fue y por qué — la política de la casa desde
 * v1.96 (la papelera ya existe en el disco del usuario y ya funciona).
 *
 * Es SECO por default. Mueve sólo con `--ejecutar`. Una limpieza que se lleva la memoria
 * del cerebro no es una limpieza: es la semilla de la próxima sesión de ocho horas.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { esResiduoDatos, NUCLEO_ARCHIVOS, NUCLEO_CARPETAS, carpetaPurga } from "../src/engine/hemisferios.ts";

const RAIZ = process.argv[2] || process.env.CEREBRONICO_RAIZ || "C:\\Cerebronico";
const EJECUTAR = process.argv.includes("--ejecutar");
if (!fs.existsSync(RAIZ)) {
  console.log(`[limpiar-raiz] no existe la raíz de datos: ${RAIZ}\n              (en Windows: iniciar_todo_windows.bat la crea; o pasala por argumento)`);
  process.exit(0);
}
const enRaiz = fs.readdirSync(RAIZ, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
const residuo = enRaiz.filter(esResiduoDatos);
const nucleo = enRaiz.filter((n) => !esResiduoDatos(n));
const dirs = fs.readdirSync(RAIZ, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const organos = dirs.includes("cerebro")
  ? fs.readdirSync(path.join(RAIZ, "cerebro")).length
  : -1;

console.log(`\n╼ LIMPIEZA DE LA RAÍZ DE DATOS ╼  ${RAIZ}`);
console.log(`  núcleo conservado : ${nucleo.length} archivos${dirs.length ? ` · ${dirs.length} carpetas` : ""}`);
console.log(`  residuo papelizable: ${residuo.length}`);
console.log(`  órganos en cerebro/: ${organos < 0 ? "la carpeta no existe" : organos === 0 ? "VACÍA (el hemisferio derecho está huérfano de órganos)" : organos}`);
if (residuo.length) console.log("\n  se iría a la papelera:\n   " + residuo.map((n) => "· " + n).join("\n   "));
if (!EJECUTAR) {
  console.log("\n  (seco: no moví nada. con --ejecutar papelizo en .cerebro-papelera/<marca>/)\n");
  process.exit(0);
}
const destino = path.join(RAIZ, carpetaPurga());
fs.mkdirSync(destino, { recursive: true });
const indice = [];
for (const n of residuo) {
  fs.renameSync(path.join(RAIZ, n), path.join(destino, n));
  indice.push(n);
}
fs.writeFileSync(path.join(destino, "indice.txt"), `purga de ${RAIZ}\nmueve ${indice.length} archivos de residuo (nada borrado)\n\n${indice.join("\n")}\n`, "utf8");
console.log(`\n  papelizados ${indice.length} en ${path.relative(RAIZ, destino)}  ·  recuperable desde ahí\n`);
