#!/usr/bin/env node
/**
 * scripts/auditar-skills.mjs — FASE 15: EL VIGILANTE HECHO SCRIPT (v2.3.18)
 * =======================================================================
 * QUÉ PAGA (HOJA_DE_RUTA_EVOLUCION_v2.3.8.md, FASE 15 / F5 real). Estado medido
 * por el propio plano sobre `<pc>/.agents/.zcode/skills`: **229 skills, 36 rotas**.
 * El defecto no es estética: «las skills se indexan por el campo `name:` del
 * frontmatter mientras las rutas dicen otra cosa, así que media biblioteca es
 * inabarcable para quien indexa por carpeta.»
 *
 * La herramienta «ya estaba escrita» como `skills/cn-vigilante-de-skills/SKILL.md`:
 * o sea, **prosa dirigiendo a un agente**. Eso tiene dos defectos que este script
 * viene a cerrar: no produce un número comparable entre corridas, y no puede
 * vallarse (una revisión que nadie puede correr dos veces y comparar no es una
 * revisión, es una opinión). Acá queda el ejecutable; el `SKILL.md` pasa a ser la
 * puerta de entrada que lo llama.
 *
 * LO QUE NO HACE, y es deliberado: **no arregla nada**. El plano es literal — «la
 * herramienta de auditoría sirve, el catálogo se arregla con ella, el orden se
 * decide con él delante». Un script que re-nombrara 36 skills por su cuenta sería
 * exactamente el «cambio de seguridad silencioso» que este repo viene persiguiendo
 * desde la FASE 11. Este script **leo y Informa**; borrar, fusionar y re-nombrar se
 * decide con el dueño del catálogo.
 *
 * Uso:
 *   node scripts/auditar-skills.mjs                       # audita ./skills
 *   node scripts/auditar-skills.mjs --raiz "C:\\Users\\BirdBox\\.agents\\.zcode\\skills"
 *   node scripts/auditar-skills.mjs --json                # para el acta de validar
 *   node scripts/auditar-skills.mjs --tolerancia 0        # rojo si hay ALGUNA rot
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
// v1.0.21 · CERO DEPENDENCIAS PARA LEER UN FRONTMATTER. Este script corría con
// `js-yaml` y por eso el ritual lo daba por «no ejecutada» en cuanto el paquete
// no estaba instalado: una auditoría que depende de un `npm install` previo no
// se puede correr en una máquina limpia, y una revisión que a veces no corre es
// una revisión que no existe. El frontmatter de un SKILL.md es un mapa plano de
// `clave: valor` (sin anclas, sin merge, sin tipos) — y si alguien escribe algo
// más raro, el lector dice `frontmatter_roto` en vez de inventarse un resultado.
function load(bruto) {
  const datos = {};
  for (const linea of String(bruto).split("\n")) {
    if (!linea.trim() || linea.trim().startsWith("#")) continue;
    const dosPuntos = linea.indexOf(":");
    if (dosPuntos <= 0) throw new Error(`línea sin «clave: valor» → ${linea.trim()}`);
    // v1.0.21 · YAML ROTO, CAZADO: el `load` viejo rechazaba llaves y corchetes sin
    // cerrar («name: [sin cerrar»). Sin esta valla, un frontmatter mal escrito
    // pasaría como valor literal y la skill quedaría «sana» con un nombre que nadie
    // puede indexar. Solo se exige en los indicadores de colección, no en prosa
    // («hace: algo [raro]» es texto legítimo).
    const valorCrudo = linea.slice(dosPuntos + 1).trim();
    if (/^[[{]/.test(valorCrudo) && !(valorCrudo.endsWith("]") || valorCrudo.endsWith("}"))) {
      throw new Error(`colección sin cerrar → ${linea.trim()}`);
    }
    const clave = linea.slice(0, dosPuntos).trim();
    let valor = linea.slice(dosPuntos + 1).trim();
    if (!clave) throw new Error(`clave vacía en «${linea.trim()}»`);
    // Comillas de los dos sabores: el valor es lo de dentro, no las comillas.
    if ((valor.startsWith('"') && valor.endsWith('"') && valor.length > 1) || (valor.startsWith("'") && valor.endsWith("'") && valor.length > 1)) {
      valor = valor.slice(1, -1);
    }
    datos[clave] = valor;
  }
  return datos;
}

/** Campos que rompen la indexación si faltan o mienten. */
export const DEFECTOS_DE_INDEX = ["sin_archivo", "sin_frontmatter", "frontmatter_roto", "sin_nombre", "nombre_invalido", "nombre_distinto", "sin_descripcion"];

const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_NOMBRE = 64;
const MAX_DESCRIPCION = 1024;

/** Frontmatter YAML entre `---` al arranque. Toleramos BOM y CRLF: son ruído, no un fallo. */
export function separarFrontmatter(textoLimpio) {
  const conBom = textoLimpio.charCodeAt(0) === 0xfeff;
  const texto = conBom ? textoLimpio.slice(1) : textoLimpio;
  const normalizado = texto.replace(/\r\n?/g, "\n");
  if (!normalizado.startsWith("---")) return { fm: null, cuerpo: "", conBom, ruido: texto !== textoLimpio || textoLimpio.includes("\r") };
  const fin = normalizado.indexOf("\n---", 3);
  if (fin < 0) return { fm: null, cuerpo: "", conBom, ruido: true };
  const bruto = normalizado.slice(4, fin);
  const cuerpo = normalizado.slice(normalizado.indexOf("\n", fin + 1) + 1);
  return { bruto, cuerpo, conBom, ruido: texto !== textoLimpio || textoLimpio.includes("\r") };
}

/**
 * Audita UNA skill. Devuelve la lista de defectos (vacía = sana). Cada defecto
 * lleva su detalle en la misma línea del informe: «36 rotas» sin nombres no es un
 * acta, es un titular.
 */
export function auditarSkill(carpeta, nombreCarpeta) {
  const fallos = [];
  const notas = {};
  // `nombreCarpeta` va en TODAS las salidas, incluidas las tempranas: el acta
  // agrupa por carpeta y un retorno que la omite hace que el defecto exista pero
  // nadie lo pueda nombrar. (Lo encontró la suite en el primer intento.)
  const con = (lista, extra = {}) => ({ nombre: nombreCarpeta, nombreCarpeta, fallos: lista, notas, ...extra });
  if (!existsSync(carpeta)) return con(["carpeta_inexistente"]);
  const archivo = path.join(carpeta, "SKILL.md");
  if (!existsSync(archivo)) return con(["sin_archivo"]);

  const { bruto, cuerpo, conBom, ruido } = separarFrontmatter(readFileSync(archivo, "utf8"));
  if (conBom) notas.bom = true;
  if (ruido) notas.crlf = true;
  if (bruto === undefined) return con(["sin_frontmatter"]);

  let datos;
  try {
    datos = load(bruto);
  } catch (e) {
    notas.causa = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return con(["frontmatter_roto"], { causa: notas.causa });
  }
  if (!datos || typeof datos !== "object") return con(["frontmatter_vacio"]);

  const nombre = typeof datos.name === "string" ? datos.name.trim() : "";
  if (!nombre) fallos.push("sin_nombre");
  else {
    if (nombre.length > MAX_NOMBRE) fallos.push("nombre_invalido");
    else if (!NOMBRE_VALIDO.test(nombre)) fallos.push("nombre_invalido");
    // EL defecto de la FASE 15: se indexa por `name:` mientras la ruta dice otra
    // cosa. Mitad de la biblioteca queda inabarcable para quien indexa por carpeta.
    if (nombre !== nombreCarpeta) fallos.push("nombre_distinto");
  }
  const descripcion = typeof datos.description === "string" ? datos.description.trim() : "";
  if (!descripcion) fallos.push("sin_descripcion");
  else if (descripcion.length > MAX_DESCRIPCION) notas.descripcion_largo = descripcion.length;

  // Inventario para la FASE 16 (capas + cuándo-no-usar). Reportar, no exigir: la
  // FASE 16 es otro asiento y un verde de hoy no puede depender de lo de mañana.
  notas.tiene_capa = typeof datos.capa === "string" && datos.capa.trim() !== "";
  notas.tiene_cuando_no_usar = typeof datos.cuando_no_usar === "string" && datos.cuando_no_usar.trim() !== "";
  notas.caracteres_cuerpo = cuerpo.trim().length;
  if (cuerpo.trim().length < 80) fallos.push("cuerpo_corto");

  return { nombre, nombreCarpeta, fallos, notas };
}

/** Audita un directorio raíz de skills. Solo lectura: no escribe, no renombra. */
export function auditarRaiz(raiz) {
  if (!existsSync(raiz) || !statSync(raiz).isDirectory()) {
    return { raiz, total: 0, sanas: [], rotas: [], porDefecto: {}, error: "la raiz no existe o no es un directorio" };
  }
  const carpetas = readdirSync(raiz).filter((n) => {
    try {
      return statSync(path.join(raiz, n)).isDirectory();
    } catch {
      return false;
    }
  });
  const resultados = carpetas.map((n) => auditarSkill(path.join(raiz, n), n));
  const sanas = resultados.filter((r) => r.fallos.length === 0);
  const rotas = resultados.filter((r) => r.fallos.length > 0);
  const porDefecto = {};
  for (const r of rotas) for (const f of r.fallos) porDefecto[f] = (porDefecto[f] || 0) + 1;
  return {
    raiz,
    total: resultados.length,
    sanas,
    rotas,
    porDefecto,
    conCapa: resultados.filter((r) => r.notas && r.notas.tiene_capa).length,
    conCuandoNoUsar: resultados.filter((r) => r.notas && r.notas.tiene_cuando_no_usar).length,
  };
}

function parsearArgumentos(argv) {
  const aqui = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const predeterminada = path.resolve(aqui, "..", "skills");
  const salida = { raiz: predeterminada, json: false, tolerancia: 0, ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--raiz" || a === "--root") salida.raiz = path.resolve(argv[++i] || predeterminada);
    else if (a === "--json") salida.json = true;
    else if (a === "--tolerancia") salida.tolerancia = Number(argv[++i] || 0);
    else if (a === "--ayuda" || a === "--help") salida.ayuda = true;
  }
  return salida;
}

export function textoDelActa(a) {
  const lineas = [];
  lineas.push(`raiz: ${a.raiz}`);
  if (a.error) {
    lineas.push(`  ERROR: ${a.error}`);
    return lineas.join("\n");
  }
  lineas.push(`skills: ${a.total} · sanas: ${a.sanas.length} · rotas: ${a.rotas.length} (${a.total ? Math.round((a.rotas.length / a.total) * 100) : 0} %)`);
  const claves = Object.keys(a.porDefecto).sort((x, y) => a.porDefecto[y] - a.porDefecto[x]);
  if (claves.length) lineas.push(`  por defecto: ${claves.map((k) => `${k} ${a.porDefecto[k]}`).join(" · ")}`);
  lineas.push(`  con 'capa:' ${a.conCapa} · con 'cuando_no_usar:' ${a.conCuandoNoUsar} (inventario para FASE 16)`);
  for (const r of a.rotas.slice(0, 40)) {
    const esperado = r.nombreCarpeta || r.nombre;
    const dicho = r.nombre && r.nombre !== r.nombreCarpeta ? ` dice «${r.nombre}»` : "";
    lineas.push(`  ✗ ${esperado}${dicho} → ${r.fallos.join(", ")}`);
  }
  if (a.rotas.length > 40) lineas.push(`  … ${a.rotas.length - 40} más (pasar --json para el listado completo)`);
  lineas.push("  Este auditor NO arregla: renombrar o fusionar skills se decide con el dueño del catálogo.");
  return lineas.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("auditar-skills.mjs")) {
  const opt = parsearArgumentos(process.argv.slice(2));
  if (opt.ayuda) {
    process.stdout.write([
      "auditar-skills.mjs — FASE 15. Lee un catálogo de skills y nombrá las rotas.",
      "  --raiz <dir>   carpeta a auditar (defecto: ./skills; en tu PC:",
      "                 C:\\Users\\BirdBox\\.agents\\.zcode\\skills)",
      "  --json         volcar el acta completa en JSON",
      "  --tolerancia N código de salida 1 si hay más de N rotas (defecto 0)",
      "",
    ].join("\n"));
    process.exit(0);
  }
  const acta = auditarRaiz(opt.raiz);
  if (opt.json) process.stdout.write(JSON.stringify(acta, null, 2) + "\n");
  else process.stdout.write("══ AUDITORÍA DE SKILLS ══\n" + textoDelActa(acta) + "\n");
  const rompen = acta.rotas.filter((r) => r.fallos.some((f) => DEFECTOS_DE_INDEX.includes(f))).length;
  if (acta.error) process.exit(2);
  if (rompen > opt.tolerancia) process.exit(1);
  process.exit(0);
}
