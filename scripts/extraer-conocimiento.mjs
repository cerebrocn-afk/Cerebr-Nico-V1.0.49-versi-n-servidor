// Extrae TODAS las entradas de saber del motor y arma el paquete de conocimiento
// para un cerebro vacio. No inventa: lee los arrays del codigo fuente real.
import fs from "node:fs";
import path from "node:path";

const APP = "C:/Users/BirdBox/Downloads/CerebroNico-IDE-v2.0.0/app";
const OUT = "C:/Users/BirdBox/Downloads/CN-cerebro-vacio";
fs.mkdirSync(OUT, { recursive: true });

const lee = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

// Encuentra el '[' que ABRE EL VALOR (no el del tipo KbEntry[]).
function extraerArray(src, nombre) {
  const marca = "export const " + nombre;
  const i = src.indexOf(marca);
  if (i < 0) return null;
  // Buscar el '=' de la declaracion y desde ahi el primer '['.
  const eq = src.indexOf("=", i);
  if (eq < 0) return null;
  const ini = src.indexOf("[", eq);
  if (ini < 0) return null;
  let nivel = 0, fin = -1, enStr = false, esc = false, q = "";
  for (let k = ini; k < src.length; k++) {
    const c = src[k];
    if (enStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === q) enStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { enStr = true; q = c; continue; }
    if (c === "[") nivel++;
    else if (c === "]") { nivel--; if (nivel === 0) { fin = k; break; } }
  }
  if (fin < 0) return null;
  return src.slice(ini, fin + 1);
}

const contarIds = (b) => (b ? [...b.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]) : []);

const conciencia = lee("src/engine/conciencia.ts");
const kb = lee("src/engine/knowledgeBase.ts");

const grupos = [
  { nombre: "CONCIENCIA_KB_ENTRIES", src: conciencia },
  { nombre: "BUCLES_KB_ENTRIES", src: conciencia },
  { nombre: "COHERENCIA_KB_ENTRIES", src: conciencia },
  { nombre: "KB_SEED", src: kb },
];

const extraidos = [];
for (const g of grupos) {
  const bloque = extraerArray(g.src, g.nombre);
  const ids = contarIds(bloque);
  extraidos.push({ ...g, bloque, ids });
  console.log(g.nombre + ": " + (bloque ? bloque.length + " chars" : "NO ENCONTRADO") + " · ids: " + ids.length);
}

const total = extraidos.reduce((n, g) => n + g.ids.length, 0);
const todos = extraidos.flatMap((g) => g.ids);
const dup = todos.filter((v, i) => todos.indexOf(v) !== i);
console.log("");
console.log("TOTAL entradas: " + total);
console.log("duplicados: " + (dup.length ? [...new Set(dup)].join(", ") : "ninguno"));

const manifiesto = {
  paquete: "CN-cerebro-vacio",
  version: "2.1.1",
  generado: new Date().toISOString(),
  proposito:
    "Artefacto de conocimiento para inyectar en un cerebro vacio. Contiene TODAS las entradas de saber que el motor trae de fabrica, extraidas del codigo fuente real.",
  fuente: {
    archivos: ["src/engine/conciencia.ts", "src/engine/knowledgeBase.ts"],
    arrays: extraidos.map((g) => g.nombre),
    cableado: "knowledgeBase.ts -> SEMILLA_COMPLETA",
  },
  conteo: Object.fromEntries(extraidos.map((g) => [g.nombre, g.ids.length])),
  total,
  duplicados: dup.length ? [...new Set(dup)] : [],
  ids: Object.fromEntries(extraidos.map((g) => [g.nombre, g.ids])),
  nota_honesta:
    "Este paquete NO reemplaza a SEMILLA_COMPLETA: el motor la genera solo en el primer arranque. Sirve para auditar que saber trae, o para inyectarlo en otra instalacion.",
};

fs.writeFileSync(path.join(OUT, "MANIFIESTO-CONOCIMIENTO.json"), JSON.stringify(manifiesto, null, 2), "utf8");

const lineas = [
  "// Paquete de conocimiento para cerebro vacio - generado desde el codigo real",
  "// Fuente: src/engine/conciencia.ts y src/engine/knowledgeBase.ts",
  "// NO editar a mano: regenerar con scripts/extraer-conocimiento.mjs",
  "",
];
for (const g of extraidos) {
  if (!g.bloque) continue;
  lineas.push("export const " + g.nombre + " = " + g.bloque + ";");
  lineas.push("");
}
fs.writeFileSync(path.join(OUT, "conocimiento.ts"), lineas.join("\n"), "utf8");

const md = [
  "# Paquete de conocimiento — cerebro vacío",
  "",
  "**Versión**: 2.1.1 · **Generado**: " + manifiesto.generado,
  "",
  "## Qué es",
  "",
  manifiesto.proposito,
  "",
  "## Qué trae",
  "",
  "| Grupo | Entradas |",
  "|---|---|",
  ...extraidos.map((g) => "| `" + g.nombre + "` | " + g.ids.length + " |"),
  "| **Total** | **" + total + "** |",
  "",
  "Duplicados: " + (dup.length ? [...new Set(dup)].join(", ") : "ninguno") + ".",
  "",
  "## Cómo usarlo",
  "",
  "**Opción A — instalación limpia (recomendada):** no hace falta este paquete. El motor genera",
  "`SEMILLA_COMPLETA` solo en el primer arranque. El ZIP `CN-v2.1.1` sirve tal cual.",
  "",
  "**Opción B — inyectar en otra instalación:** copiar `conocimiento.ts` a `src/engine/` y",
  "cablearlo en `knowledgeBase.ts` dentro de `SEMILLA_COMPLETA`.",
  "",
  "## Límite honesto",
  "",
  manifiesto.nota_honesta,
  "",
].join("\n");
fs.writeFileSync(path.join(OUT, "LEEME-CONOCIMIENTO.md"), md, "utf8");

console.log("");
console.log("=== ESCRITO EN " + OUT + " ===");
for (const f of fs.readdirSync(OUT)) {
  console.log("  " + f + "  (" + fs.statSync(path.join(OUT, f)).size + " bytes)");
}
