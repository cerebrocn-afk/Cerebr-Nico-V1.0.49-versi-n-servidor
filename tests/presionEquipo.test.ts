/**
 * presionEquipo.test.ts — v1.99.8 · LA RAM DEJÓ DE SER UNA SUPOSICIÓN
 * ==================================================================
 * El disparador es literal: «tengo 16 ram». El chip de la barra decía «8 GB», que era el NOMBRE de
 * un modo y no una lectura, y el modo `"auto"` no hacía absolutamente nada: el equipo que sí tenía
 * que aligerar seguía pintando desenfoques. Se prueba acá, con números de máquina de verdad:
 *   · 16 GB en automático → NO se aligera (y el tooltip dice por qué);
 *   · 8 GB en automático → SÍ se aligera (antes no);
 *   · la palabra del usuario manda en los dos sentidos;
 *   · sin lectura no se aligera: la ausencia de dato no es evidencia de un equipo pobre.
 */
import {
  decidirModoPerf, gbDeMaquina, rotuloMemoria, atributoPerf, normalizarModoPreferido,
  CICLO_PERF, UMBRAL_RAM_LIMITADA_GB,
} from "../src/engine/presionEquipo";
import { RAM_LIMITADA_GB } from "../src/engine/modelTiers";
import { readFileSync } from "node:fs";

let ok = 0;
const mal: string[] = [];
const c = (q: string, v: boolean, d = "") => {
  if (v) { ok++; console.log("  \u2713 " + q); }
  else { mal.push(q + (d ? " -> " + d : "")); console.log("  \u2717 " + q + (d ? " \u2014 " + d : "")); }
};
const leer = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n1) Leer la máquina (y no confundir 'no sé' con 'cero')\n");
c("16384 MB son 16 GB, ni 15 ni 17", gbDeMaquina(16384) === 16, String(gbDeMaquina(16384)));
c("8192 MB son 8 GB: justo el umbral de equipo limitado", gbDeMaquina(8192) === 8 && gbDeMaquina(8192) === RAM_LIMITADA_GB);
c("\u2605 sin lectura es null, NO 0 (y el rótulo lo dice con palabras)",
  gbDeMaquina(undefined) === null && gbDeMaquina(0) === null && gbDeMaquina(NaN) === null && rotuloMemoria(0) === "sin lectura");
c("el umbral no se re-inventó: es el dueño de `modelTiers`, el mismo de la residencia de Ollama",
  UMBRAL_RAM_LIMITADA_GB === RAM_LIMITADA_GB && !/<=\s*8\b/.test(leer("src/engine/presionEquipo.ts")),
  String(UMBRAL_RAM_LIMITADA_GB));

console.log("\n2) El caso del usuario: 16 GB\n");
const d16 = decidirModoPerf("auto", 16384);
c("\u2605 con 16 GB en automático la interfaz NO se aligera", d16.modo === "auto" && atributoPerf(d16) === null);
c("y la decisión dice que se MIDIÓ, no que se adivinó", d16.fuente === "medido" && d16.equipoLimitado === false);
c("el tooltip nombra la máquina real (16 GB), no el nombre de un modo",
  /16 GB/.test(d16.tooltip) && /no hace falta aligerar/.test(d16.tooltip), d16.tooltip.slice(0, 120));
c("el chip ya no dice '8 GB' en la cara", !/8 GB/.test(d16.rotuloChip), d16.rotuloChip);

console.log("\n3) El equipo que sí necesita aligerar (lo que `auto` nunca hizo)\n");
const d8 = decidirModoPerf("auto", 8192);
c("\u2605 con 8 GB en automático SÍ se aligera (esto antes no pasaba: 'auto' no hacía nada)",
  d8.modo === "8gb" && atributoPerf(d8) === "8gb" && d8.fuente === "medido");
c("con 4 GB también, y el tooltip explica el umbral",
  decidirModoPerf("auto", 4096).modo === "8gb" && /8 GB/.test(d8.tooltip));
const dSin = decidirModoPerf(undefined, undefined);
c("\u2605 sin lectura no se aligera por las dudas, y se dice por qué",
  dSin.modo === "auto" && dSin.fuente === "sin-dato" && /no hay lectura/.test(dSin.tooltip), dSin.tooltip.slice(-80));

console.log("\n4) La palabra del usuario manda en los dos sentidos\n");
c("liviano fijado a mano, aunque la máquina sea de 64 GB",
  decidirModoPerf("8gb", 65536).modo === "8gb" && decidirModoPerf("8gb", 65536).fuente === "usuario");
c("pleno fijado a mano, aunque la máquina sea de 4 GB (sabe lo que corre él, no totalmem)",
  decidirModoPerf("pleno", 4096).modo === "auto" && decidirModoPerf("pleno", 4096).fuente === "usuario");
c("y el rótulo distingue las tres procedencias del estado",
  decidirModoPerf("8gb", 16384).rotuloChip === "Liviano"
  && decidirModoPerf("pleno", 4096).rotuloChip === "Pleno"
  && d8.rotuloChip === "Liviano (auto)", `${decidirModoPerf("8gb", 16384).rotuloChip}|${decidirModoPerf("pleno", 4096).rotuloChip}|${d8.rotuloChip}`);

console.log("\n5) Compatibilidad y forma\n");
c("ciclo de tres estados que arranca en automático",
  CICLO_PERF.length === 3 && CICLO_PERF[0] === "auto" && CICLO_PERF.includes("pleno"));
c("\u2605 lo que ya estaba en localStorage sigue valiendo (no se le pierde la preferencia a nadie)",
  normalizarModoPreferido("8gb") === "8gb" && normalizarModoPreferido("auto") === "auto");
c("cualquier basura o vacío vuelve a automático en vez de romperse",
  normalizarModoPreferido("gigabyte") === "auto" && normalizarModoPreferido(undefined) === "auto" && normalizarModoPreferido("") === "auto");
c("determinismo: misma entrada, misma decisión, byte a byte",
  JSON.stringify(decidirModoPerf("auto", 16384)) === JSON.stringify(d16));
const fuente = leer("src/engine/presionEquipo.ts");
c("órgano puro: sin fs, sin red, sin reloj y sin tocar el DOM",
  !/node:fs|node:http|Date\.now|new Date\(|document\.|window\./.test(fuente));
c("el selector CSS histórico sigue siendo el mismo (`data-perf-mode=\"8gb\"`)",
  atributoPerf(d8) === "8gb" && /8gb/.test(fuente));

console.log("\n6) El cable\n");
const app = leer("src/App.tsx");
c("\u2605 el efecto de App ya no decide a mano: pregunta y aplica el atributo",
  /decidirModoPerf\(/.test(app) && /atributoPerf\(/.test(app));
c("y le pasa la RAM MEDIDA del server, no un número escrito a mano",
  /systemStats\?\.machine\?\.totalRamMb/.test(app));
const header = leer("src/components/Header.tsx");
c("el chip muestra el rótulo honesto y el tooltip con la lectura real (ambos chips: barra y menú CN)",
  (header.match(/perf\?\.rotuloChip/g) || []).length >= 2 && (header.match(/perf\?\.tooltip/g) || []).length >= 2,
  `rotulo=${(header.match(/perf\?\.rotuloChip/g) || []).length} tooltip=${(header.match(/perf\?\.tooltip/g) || []).length}`);
c("la palabra 'Modo 8 GB' desapareció de la cara de la barra",
  !/>8 GB</.test(header) && !/Modo 8 GB \{/.test(header));

const di = (s: string) => { console.log(s); };
const veredicto = `\n=== PRESIÓN DE EQUIPO (v1.99.8): ${ok} correctas - ${mal.length} fallidas ===`;
di(veredicto);
if (mal.length) {
  di("");
  di("FALLOS:");
  for (const f of mal) di("  FALLO -> " + f);
  process.exit(1);
}
