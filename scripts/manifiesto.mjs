#!/usr/bin/env node
/**
 * manifiesto.mjs — EL MANIFIESTO DEL PAQUETE, GENERADO (no escrito a mano)
 * ========================================================================
 * QUÉ PROBLEMA RESUELVE
 * El manifiesto de la v1.6.33 cubría 22 entradas: 17 fuentes, 3 pruebas de ~60
 * y 5 ficheros de dist. Los demás ficheros del paquete —incluidos los assets que
 * el navegador carga de verdad y el estado de conocimiento que las pruebas de
 * humo modifican— viajaban SIN poder verificarse. Un manifiesto incompleto no
 * es una verificación: es una lista de confianza parcial con apariencia de
 * puerta.
 *
 * Aquí el manifiesto se GENERA recorriendo el paquete. Si un fichero viaja,
 * está en el manifiesto. Y `--verificar` hace las dos preguntas que importan:
 *   · ¿algún fichero cambió de contenido?  (hash distinto)
 *   · ¿hay ficheros NUEVOS que el manifiesto no conoce?  (lo que se colaría)
 *
 * USO
 *   node scripts/manifiesto.mjs              → genera MANIFIESTO_SHA256_v<versión>.txt
 *   node scripts/manifiesto.mjs --verificar  → comprueba el manifiesto existente
 *
 * QUÉ SE EXCLUYE, Y POR QUÉ (queda escrito aquí para no tener que adivinarlo)
 *   node_modules/**        dependencias instaladas: se regeneran, no se entregan
 *   .proyectos/**          ESTADO DE EJECUCIÓN: kb.json y auditoria.jsonl los
 *                          modifican las pruebas de humo. Entregar su hash
 *                          obligaría a restaurarlos byte a byte antes de
 *                          empaquetar — que es justo la trampa que este script
 *                          elimina: lo que no es código no se firma.
 *   *.log                  rastros de ejecución
 *   MANIFIESTO_SHA256_*.txt   el propio manifiesto (no se firma a sí mismo)
 *   los scratch de la casa   ver `esScratchDeScripts` y `EXCLUIDOS_BASE` más abajo
 *
 * v2.1.1 — LA REGLA QUE FALTABA: EL MANIFIESTO FIRMA LO QUE VIAJA, NO LO QUE HAY EN EL DISCO
 * Firme 2170 archivos y el ZIP llevaba 2161: los 10 de diferencia son el scratch que el
 * empaquetado retira (`_*`, `*.patch-*`, `.p.ts`). Un manifiesto que declara lo que el paquete
 * excluye es una trampa: el usuario descomprime, corre `--verificar` y el script le reporta
 * 10 "ausentes" que nunca debieron estar declarados. Se firma el mismo conjunto que se empaqueta;
 * la lista humana está en GUIA-EMPAQUETADO-Y-PARTES.md y las dos tienen que moverse juntas.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(AQUI, "..");
// v1.53.1 (D4) — el proyecto YA es su propio paquete. El `path.resolve(BACKEND,
// "..", "..")` era un residuo del empaquetado en capas de v1.6.x: generaba el
// manifiesto DOS niveles fuera del proyecto y por eso nunca viajaba en el ZIP.
const PAQUETE = BACKEND;

const verificar = process.argv.includes("--verificar");
const VERSION = JSON.parse(readFileSync(path.join(BACKEND, "package.json"), "utf8")).version;
// ═══════════════════════════════════════════════════════════════════════════
// v1.0.10 · UN SOLO MANIFIESTO (pedido de Mario, 09/11: «¿es necesario tanta
// info en archivos distintos? ¿no se puede hacer un solo manifiesto incluyendo
// todo?»). No. No lo era: cada build firmaba `MANIFIESTO_SHA256_v<X.Y.Z>.txt`
// y NINGUNO se retiraba — 46 conviviendo en la raíz del ZIP ( screenshot
// 151 elementos ). El manifiesto es la firma del PAQUETE ACTUAL: un paquete,
// una firma. El archivo se llama ahora `MANIFIESTO_SHA256.txt` y la versión
// viaja DENTRO (cabecera + verificación). Los históricos de versiones viejas
// no se regeneran ni se consultan: quien necesite la firma de una versión
// vieja la vuelve a generar con ese árbol. Los viejos que aún existan en
// disco quedan EXCLUIDOS de la firma y del viaje (empaquetar.mjs), y se
// archivan en documentacion/_archivo-consolidado/MANIFIESTOS-HISTORICOS/.
// ═══════════════════════════════════════════════════════════════════════════
/** El único fichero que no puede firmarse a sí mismo: EL manifiesto. */
const MANIFIESTO_PROPIO = `MANIFIESTO_SHA256.txt`;
/** Históricos: no se firman, no viajan, no se leen (salvo rescate de --verificar viejo). */
const LEGACY_MANIFIESTO = /^MANIFIESTO_SHA256_v.+\.[Tt][Xx][Tt]$/;

/**
 * v2.1.2 · UNA SOLA RECETA, UN SOLO CONJUNTO.
 *
 * Hasta acá el manifiesto tenía su lista de exclusiones y `empaquetar.mjs` la suya.
 * Las dos contaron **2164** archivos — y no eran el mismo conjunto: el manifiesto
 * firmaba `verificar-artefactos.mjs.bak` y `telemetria.ts.bak` que el empaquetado
 * retiraba, y el empaquetado llevaba `scripts/_retirar.mjs` que el manifiesto no
 * firmaba. Un número idéntico tapando dos conjuntos distintos es PEOR que un número
 * distinto: pasa la comprobación de conteo y miente en el contenido.
 *
 * La lista vive ahora en `empaquetar.mjs`, que es la receta. Este archivo añade
 * solamente las dos reglas que la receta no puede conocer:
 *   · no firmarse a sí mismo (su hash cambia al escribirlo);
 *   · las carpetas que crea la plataforma donde yo trabajo y que en tu máquina
 *     no existen (`.accio`, `.buyer-execution-hooks`) — si algún día aparecen en
 *     el árbol de verdad, esto sobra y se borra.
 */
import { debeViajar } from "./empaquetar.mjs";

const EXCLUIDOS_DE_PLATAFORMA = new Set([".accio", ".buyer-execution-hooks"]);

const excluido = (rel) => {
  const partes = rel.split(path.sep);
  if (partes.some((p) => EXCLUIDOS_DE_PLATAFORMA.has(p))) return true;
  if (partes.length === 1 && (partes[0] === MANIFIESTO_PROPIO || LEGACY_MANIFIESTO.test(partes[0]))) return true;
  // La receta decide con `/`; acá el árbol se recorre con el separador nativo.
  return !debeViajar(partes.join("/"));
};

function recorrer(dir, salida = []) {
  for (const nombre of readdirSync(dir).sort()) {
    const abs = path.join(dir, nombre);
    const rel = path.relative(PAQUETE, abs);
    if (excluido(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) recorrer(abs, salida);
    else if (st.isFile()) salida.push(rel);
  }
  return salida;
}

const sha256 = (abs) => createHash("sha256").update(readFileSync(abs)).digest("hex");

const version = VERSION;
const archivoManifiesto = path.join(PAQUETE, MANIFIESTO_PROPIO);

if (!verificar) {
  const ficheros = recorrer(PAQUETE);
  const lineas = [
    `# MANIFIESTO SHA256 — v${version} (${new Date().toISOString().slice(0, 10)})`,
    `# Verificación:  sha256sum -c ${MANIFIESTO_PROPIO}`,
    `# Cubre TODO el paquete excepto node_modules, .proyectos (estado de ejecución), *.log y este mismo fichero.`,
    "",
    ...ficheros.map((rel) => `${sha256(path.join(PAQUETE, rel))}  ${rel}`),
  ];
  writeFileSync(archivoManifiesto, lineas.join("\n") + "\n", "utf8");
  console.log(`MANIFIESTO GENERADO: ${path.basename(archivoManifiesto)}`);
  console.log(`  ${ficheros.length} ficheros firmados (antes: 22 escritos a mano).`);
  process.exit(0);
}

// ─── verificación ─────────────────────────────────────────────────────────
// Compat: un paquete entregado con el esquema viejo (MANIFIESTO_SHA256_v*.txt)
// se verifica contra su viejo manifiesto si el único no existe. No se regene-
// ra: se comprueba TAL CUAL viajó.
let archivoActivo = archivoManifiesto;
if (!existsSync(archivoActivo)) {
  const viejos = readdirSync(PAQUETE).filter((f) => LEGACY_MANIFIESTO.test(f)).sort();
  if (viejos.length > 0) {
    archivoActivo = path.join(PAQUETE, viejos[viejos.length - 1]);
    console.log(`(usando manifiesto histórico ${path.basename(archivoActivo)} — el esquema actual es ${MANIFIESTO_PROPIO})`);
  }
}
if (!existsSync(archivoActivo)) {
  console.log(`NO existe ${MANIFIESTO_PROPIO}. Genéralo primero sin --verificar.`);
  process.exit(1);
}
const declarados = new Map();
for (const l of readFileSync(archivoActivo, "utf8").split("\n")) {
  if (!l.trim() || l.startsWith("#")) continue;
  const m = /^([0-9a-f]{64})\s\s(.+)$/.exec(l.trim());
  if (m) declarados.set(m[2], m[1]);
}
const enDisco = new Set(recorrer(PAQUETE));
const cambios = [];
const ausentes = [];
for (const [rel, hash] of declarados) {
  const abs = path.join(PAQUETE, rel);
  if (!existsSync(abs)) {
    ausentes.push(rel);
    continue;
  }
  if (sha256(abs) !== hash) cambios.push(rel);
}
const nuevos = [...enDisco].filter((r) => !declarados.has(r));

console.log(`MANIFIESTO v${version}: ${declarados.size} ficheros declarados · ${enDisco.size} en disco`);
for (const r of cambios) console.log(`  CAMBIADO  ${r}`);
for (const r of ausentes) console.log(`  AUSENTE   ${r}`);
for (const r of nuevos) console.log(`  NUEVO     ${r} (no está en el manifiesto)`);
const bien = cambios.length === 0 && ausentes.length === 0 && nuevos.length === 0;
console.log(bien ? "  VEREDICTO: TODO COINCIDE." : `  VEREDICTO: ${cambios.length + ausentes.length + nuevos.length} diferencia(s).`);
process.exit(bien ? 0 : 1);
