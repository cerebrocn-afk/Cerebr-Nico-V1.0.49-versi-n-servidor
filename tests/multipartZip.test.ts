/**
 * multipartZip.test.ts — Suite para reensamblaje en memoria de ZIP multivolumen
 * ==============================================================================
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  analizarNombreMultivolumen,
  esNombreParteMultivolumen,
  agruparPartesMultivolumen,
  tieneFirmaZip,
  ensamblarBinarioMultivolumen,
} from "../src/utils/multipartZip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");

let correctas = 0;
let fallidas = 0;
function comprobar(t: string, c: boolean) {
  if (c) {
    correctas++;
    console.log("  ✓ " + t);
  } else {
    fallidas++;
    console.error("  ✗ " + t);
  }
}

console.log("\n· 1) Reconocimiento de patrones multivolumen");
{
  const p1 = analizarNombreMultivolumen({ name: "cerebronico-ide-v1.0.39-parte01-de-04.bin" });
  comprobar("detecta patrón -parte01-de-04.bin", p1 !== null && p1.patron === "parte-de" && p1.indice === 1 && p1.totalDeclarado === 4);
  comprobar("normaliza nombre de salida a .zip", p1?.nombreBaseZip === "cerebronico-ide-v1.0.39.zip");

  const p2 = analizarNombreMultivolumen({ name: "mi-app.zip.003" });
  comprobar("detecta patrón .zip.003", p2 !== null && p2.patron === "zip-00n" && p2.indice === 3 && p2.nombreBaseZip === "mi-app.zip");

  const p3 = analizarNombreMultivolumen({ name: "proyecto_part2.bin" });
  comprobar("detecta patrón _part2.bin", p3 !== null && p3.patron === "part-n" && p3.indice === 2);

  const p4 = analizarNombreMultivolumen({ name: "respaldo.004" });
  comprobar("detecta patrón genérico .004", p4 !== null && p4.patron === "ext-00n" && p4.indice === 4);

  comprobar("no clasifica un .ts ni un .zip normal como multivolumen", !esNombreParteMultivolumen("App.tsx") && !esNombreParteMultivolumen("proyecto.zip"));
  comprobar("rechaza índice inválido fuera de rango (parte05-de-04)", analizarNombreMultivolumen({ name: "app-parte05-de-04.bin" }) === null);
  comprobar("rechaza total < 2 o nombre vacío", analizarNombreMultivolumen({ name: "app-parte01-de-01.bin" }) === null && analizarNombreMultivolumen({ name: "   " }) === null);
}

console.log("\n· 2) Agrupación, ordenamiento y detección de grupos incompletos/hostiles");
{
  // Desordenado a propósito + un archivo suelto normal
  const tanda = [
    { name: "app-parte04-de-04.bin" },
    { name: "README.md" },
    { name: "app-parte02-de-04.bin" },
    { name: "app-parte01-de-04.bin" },
    { name: "app-parte03-de-04.bin" },
  ];
  const agr = agruparPartesMultivolumen(tanda);
  comprobar("agrupa 1 conjunto completo de 4 partes y 1 archivo suelto", agr.completos.length === 1 && agr.incompletos.length === 0 && agr.sueltos.length === 1);
  comprobar("ordena los fragmentos de #1 a #4", agr.completos[0].partes.map((p) => p.indice).join(",") === "1,2,3,4");

  // Falta parte intermedia (#2)
  const faltaUna = agruparPartesMultivolumen([
    { name: "app-parte01-de-03.bin" },
    { name: "app-parte03-de-03.bin" },
  ]);
  comprobar("rechaza conjunto al que le falta #2 como incompleto", faltaUna.completos.length === 0 && faltaUna.incompletos.length === 1 && faltaUna.incompletos[0].faltantes.includes(2));

  // Parte duplicada (#1 repetida)
  const duplicada = agruparPartesMultivolumen([
    { name: "pkg.zip.001" },
    { name: "pkg.zip.001" },
    { name: "pkg.zip.002" },
  ]);
  comprobar("detecta parte duplicada y no ensambla a ciegas", duplicada.completos.length === 0 && duplicada.incompletos.length === 1 && duplicada.incompletos[0].duplicados.includes(1));

  // Fragmento solitario sin compañero
  const solitario = agruparPartesMultivolumen([{ name: "solo.zip.001" }]);
  comprobar("marca fragmento solitario .001 como incompleto", solitario.completos.length === 0 && solitario.incompletos.length === 1 && /fragmento #1/i.test(solitario.incompletos[0].motivo));
}

console.log("\n· 3) Ensamblaje binario real con JSZip (split → merge → reapertura idéntica)");
{
  const zipOriginal = new JSZip();
  zipOriginal.file("src/hola.ts", 'export const saludo = "hola desde zip partido en 4";\n');
  zipOriginal.file("docs/nota.txt", "ñandú · café · 100% íntegro\n".repeat(40));
  const bufOriginal = new Uint8Array(await zipOriginal.generateAsync({ type: "uint8array" }));

  const n = Math.ceil(bufOriginal.length / 4);
  const partes = [3, 0, 2, 1].map((idx) => ({
    name: `cerebronico-ide-v1.0.40-parte0${idx + 1}-de-04.bin`,
    bytes: bufOriginal.slice(idx * n, (idx + 1) * n),
  }));

  const ensamblado = ensamblarBinarioMultivolumen(partes);
  comprobar("detecta firma mágica ZIP (PK) tras concatenar en orden", ensamblado.esZip && tieneFirmaZip(ensamblado.bytes));
  comprobar("el binario ensamblado coincide byte a byte con el ZIP original", ensamblado.totalBytes === bufOriginal.length && ensamblado.bytes.every((b, i) => b === bufOriginal[i]));

  const zipReabierto = await JSZip.loadAsync(ensamblado.bytes);
  const contenidoLeido = await zipReabierto.file("src/hola.ts")?.async("string");
  comprobar("JSZip reabre el ZIP ensamblado y preserva su contenido", contenidoLeido?.includes("hola desde zip partido en 4") === true);

  comprobar("firma ZIP devuelve false ante bytes corruptos/vacíos", !tieneFirmaZip(new Uint8Array([])) && !tieneFirmaZip(new Uint8Array([0x00, 0x01, 0x02, 0x03])));
}

console.log("\n· 4) Pureza del módulo y cableado de exención en ChatCenter");
{
  const fuenteModulo = readFileSync(path.join(RAIZ, "src/utils/multipartZip.ts"), "utf8");
  const tieneNodeBuiltin = /from\s+["'](?:node:|fs|path|child_process)/.test(fuenteModulo);
  comprobar("multipartZip.ts es 100% puro (sin fs/path/child_process/node:*)", !tieneNodeBuiltin);

  const fuenteChat = readFileSync(path.join(RAIZ, "src/components/ChatCenter.tsx"), "utf8");
  comprobar("ChatCenter.tsx exime fragmentos multivolumen del bloqueo .bin", fuenteChat.includes("!esNombreParteMultivolumen(nombre)"));
}

console.log(`\nResultado multipartZip: ${correctas} correctas · ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
