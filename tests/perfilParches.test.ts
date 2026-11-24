/**
 * tests/perfilParches.test.ts — FASE 12: EL PERFIL DEL USUARIO EXISTE (v2.3.15)
 * ===========================================================================
 * El plano pide esta suite por nombre y enumera sus casos: sobrescribir,
 * deshabilitar, insertar, huérfano, **YAML roto** e **idempotencia doble**.
 *
 * Qué añade frente a `parchesSemilla.test.ts` (39/39, motor puro): acá se prueba
 * LA CAPA DE ARCHIVO, que es la que faltaba. El motor estaba escrito desde la
 * FASE 8 y nunca llegó al usuario porque no había `perfil.patch.yaml` ni cable:
 * la misma enfermedad de `contextoMedido.ts` (escrito, verde y muerto).
 *
 * Los árboles se arman en `mkdtemp` y no tocan el repo.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cargarPerfilParches, lineaDeEstadoPerfilParches, parsearPerfil } from "../src/engine/perfiles/perfilParches";
import type { KbEntry } from "../src/engine/knowledgeBase";

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

function entrada(id: string, body = "saber " + id): KbEntry {
  return { id, table: "rule", title: "t " + id, body, keys: ["k"], tags: [], weight: 2, lang: "es" } as unknown as KbEntry;
}

/**
 * Semilla de juguete: **120 entradas, no tres**. El motor no entrega una semilla
 * por debajo de `MINIMO_ENTRADAS_SEMILLA` (116); con tres entradas la prueba
 * daría roja por la invariante y no por lo que se quiere mirar.
 */
const SEMILLA: KbEntry[] = Array.from({ length: 120 }, (_x, i) => entrada("kb-" + i));

function arbol(textoYaml: string | null): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cn-perfil-"));
  if (textoYaml !== null) {
    const carpeta = path.join(dir, ".cerebronico");
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(path.join(carpeta, "perfil.patch.yaml"), textoYaml);
  }
  return dir;
}

console.log("\n1) El interruptor honesto: sin archivo no pasa nada\n");
{
  const r = cargarPerfilParches(SEMILLA, arbol(null));
  c("\u2605 sin perfil la semilla sale ID\u00c9NTICA", r.semilla.length === SEMILLA.length && r.aplicado === false);
  c("la causa dice que no había archivo", /sin perfil/.test(r.causa), r.causa);
  c("el acta nombra la ruta que mir\u00f3", r.ruta.includes(".cerebronico") && r.ruta.includes("perfil.patch.yaml"), r.ruta);
  c("\u2605 sin perfil no hay l\u00ednea para el estado vivo", lineaDeEstadoPerfilParches() === "");
  const v = cargarPerfilParches(SEMILLA, arbol("   \n  \n"));
  c("archivo vac\u00edo se trata como ausencia, no como error", v.aplicado === false && /vac/.test(v.causa), v.causa);
}

console.log("\n2) Perfil inválido: semilla limpia y causa, jamás arranque a medias\n");
{
  const r = cargarPerfilParches(SEMILLA, arbol("version: 1\noperaciones: [ {op: deshabilitar, id: kb-1\n"));
  c("\u2605 YAML roto NO tira: devuelve la semilla original", r.semilla.length === SEMILLA.length && r.aplicado === false);
  c("y la causa dice que el YAML está inválido", /YAML inv/.test(r.causa), r.causa);
  c("el estado vivo avisa del rechazo en vez de callar", /RECHAZADO/.test(lineaDeEstadoPerfilParches()), lineaDeEstadoPerfilParches());
  const v2 = cargarPerfilParches(SEMILLA, arbol("version: 2\noperaciones: []\n"));
  c("versin de formato desconocida se rechaza con la cifra", /version esperada 1/.test(v2.causa), v2.causa);
  const no = cargarPerfilParches(SEMILLA, arbol("version: 1\noperaciones: hola\n"));
  c("`operaciones` que no es lista se rechaza", /no es una lista/.test(no.causa), no.causa);
  const od = cargarPerfilParches(SEMILLA, arbol("version: 1\noperaciones:\n  - { op: ejecutar, id: kb-1 }\n"));
  c("\u2605 op desconocida se rechaza ENTERA, no se ignora en silensio", od.aplicado === false && od.semilla.length === SEMILLA.length, od.causa);
  c("y la causa nombra la op y su indice", /op desconocida en la operaci\u00f3n 0/.test(od.causa), od.causa);
}

console.log("\n3) Las operaciones del plano, aplicadas de verdad\n");
{
  const r = cargarPerfilParches(SEMILLA, arbol([
    "version: 1",
    "descripcion: apago lo que no uso",
    "operaciones:",
    "  - { op: deshabilitar, id: kb-1, motivo: no trabajo con eso }",
    "  - { op: sobrescribir, id: kb-2, campos: { title: TITULO NUEVO } }",
    "  - { op: insertar, entrada: { id: kb-nueva, table: rule, title: nueva, body: cuerpo, keys: [k] } }",
  ].join("\n")));
  c("\u2605 deshabilitar saca la entrada de la semilla", !r.semilla.some((e) => e.id === "kb-1"));
  c("sobrescribir cambia el campo pedido", r.semilla.find((e) => e.id === "kb-2")?.title === "TITULO NUEVO", String(r.semilla.find((e) => e.id === "kb-2")?.title));
  c("insertar agrega la entrada nueva", r.semilla.some((e) => e.id === "kb-nueva"));
  c("\u2605 el acta cuenta lo aplicado", r.aplicado && (r.informe?.aplicadas ?? 0) >= 3, JSON.stringify(r.informe));
  c("y la l\u00ednea del estado vivo trae las cifras", /parches:|perfil/.test(r.linea) && /\d/.test(r.linea), r.linea);
  c("los ids siguen siendo \u00fanicos", new Set(r.semilla.map((e) => e.id)).size === r.semilla.length);
}
{
  const r = cargarPerfilParches(SEMILLA, arbol("version: 1\noperaciones:\n  - { op: deshabilitar, id: kb-que-no-existe }\n"));
  c("\u2605 un id inexistente se RECHAZA y se revuelve todo (no se ignora)", r.aplicado === false && r.semilla.length === SEMILLA.length);
  c("la causa nombra al hu\u00e9rfano", /kb-que-no-existe/.test(r.causa), r.causa);
}
{
  const r = cargarPerfilParches(SEMILLA, arbol("version: 1\noperaciones:\n  - { op: deshabilitar, id: kb-7 }\n  - { op: deshabilitar, id: kb-7 }\n"));
  c("\u2605 la lecci\u00f3n del plano: deshabilitar DOS VECES el mismo id es no-op, no un rechazo",
    r.aplicado === true && (r.informe?.rechazadas.length ?? 1) === 0, r.causa);
  c("y la semilla pierde UNA entrada, no dos", r.semilla.length === SEMILLA.length - 1, String(r.semilla.length));
}
{
  const veinte = Array.from({ length: 20 }, (_x, i) => `  - { op: deshabilitar, id: kb-${i} }`).join("\n");
  const r = cargarPerfilParches(SEMILLA, arbol("version: 1\noperaciones:\n" + veinte));
  c("\u2605 la invariante de 116 manda: o entra entero o no entra nada",
    r.aplicado ? r.semilla.length >= 116 : r.semilla.length === SEMILLA.length,
    "aplicado=" + r.aplicado + " longitud=" + r.semilla.length);
}
{
  const p = parsearPerfil("version: 1\noperaciones:\n  - { op: sobrescribir, id: a }\n  - { op: deshabilitar, id: b }\n  - { op: insertar, entrada: { id: c } }\n");
  const ops = (p.perfil?.operaciones || []).map((o) => o.op).join(",");
  c("\u2605 los nombres del plano se traducen a los del motor", ops === "replace,disable,add", ops);
}


console.log("\n4) Las vallas de conexión: que esto no vuelva a ser un módulo huérfano\n");
{
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
  const kb = leer("src/engine/knowledgeBase.ts");
  const mc = leer("src/engine/motorContexto.ts");
  const srv = leer("server.ts");
  const validar = leer("scripts/validar.mjs");

  c("\u2605 la base de conocimiento importa el cargador de perfil", /perfiles\/perfilParches/.test(kb));
  c("\u2605 y siembra con la semilla parcheada, no con la cruda", /for \(const e of semillaParcheada\(\)\)/.test(kb));
  c("el cable es UNO: se llama al cargador con la semilla del motor", /cargarPerfilParches\(SEMILLA_COMPLETA/.test(kb));
  c("\u2605 el estado vivo lleva la línea del perfil", /lineaDeEstadoPerfilParches\(\)/.test(mc));
  c("\u2605 server.ts sigue SIN TOCAR, como exige el plano", !/perfilParches/.test(srv));
  c("las dos suites del perfil están registradas en npm run validar",
    validar.includes("perfilParches.test.ts") && validar.includes("parchesSemilla.test.ts"));
  c("el documento que seguía contando F8 como abierta ya no está", !existsSync(path.join(raiz, "_f8f9.md")));
}

console.log("\n" + "\u2500".repeat(56));
console.log(`PERFIL DE PARCHES (v2.3.15): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
