#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// sin-claves.mjs — GUARDIÁN ANTI-CLAVES (v1.48.1, pedido de Mario)
// ------------------------------------------------------------------------
// Barre el proyecto en busca de claves API REALES filtradas antes de
// empaquetar / publicar. Objetivo: que el ZIP viaje "limpio por default",
// con el árbol, el editor y las ranuras de proveedores SIN claves.
//
//  · Sale 0  -> no se encontró ninguna clave real: se puede empaquetar.
//  · Sale 1  -> hay al menos un hallazgo: NO empaquetar hasta limpiarlo.
//
// Diseño no disruptivo: solo LEE, nunca modifica nada. Ignora de forma
// deliberada los sitios donde una "clave" es legítima y NO es un secreto:
// placeholders del modal, ejemplos de .env, nombres de constantes/llaves de
// almacenamiento, y cadenas de PRUEBA de los tests.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// v1.84.4 — se le puede pasar un sub-árbol a auditar (`node scripts/sin-claves.mjs
// .proyectos`): los árboles ignorados por defecto siguen siendo auditables a
// demanda, para que excluirlos de la rutina no signifique volverlos invisibles.
// Los paths relativos del informe se siguen calculando contra la raíz.
// v1.84.6 — los argumentos que empiezan por `-` son FLAGS (`--exiliar`), no
// sub-árboles: sin esta mira, `node sin-claves.mjs --exiliar` se ponía a
// auditar una ruta inexistente llamada "--exiliar" y salía en 0 creyéndose
// inocente. Primer argumento que no empieza por `-` = árbol a auditar.
const ARG_ARBOL = (process.argv.slice(2).find((a) => !String(a).startsWith("-"))) || "";
const APUNTAR_A = ARG_ARBOL ? path.resolve(RAIZ, ARG_ARBOL) : RAIZ;

// Carpetas que NO se auditan (ni son fuente del usuario ni viajan como código
// editable): dependencias, control de versiones, build y documentación de skills.
// ════════════════════════════════════════════════════════════════════════
// v1.84.4 · LA MISMA LECCIÓN DE v1.56.8, APLICADA A LA INSTALACIÓN USADA.
// Mario volvió a ver el trío rojo («el guardián termina en 0 · code=1» + las
// dos colas) sobre SU carpeta de v1.84.1, con el mismo repo fuente que aquí
// sale LIMPIO. La anterior vez fue `dist_electron`; la raíz es siempre la
// misma: el guardián nació conociendo el árbol RECIÉN DESCOMPRIMIDO, pero una
// instalación EN USO fabrica árboles dentro del repo que nunca viajaron en el
// ZIP y que no pueden juzgarse con las reglas de la fuente:
//   · runtime/         — el intérprete Python de los packs (con su site-
//                        packages y los tests PROPIOS de cada pack, que traen
//                        muestras tipo Bearer/sk- a propósito). Es un
//                        node_modules de otro lenguaje.
//   · .proyectos/      — el workspace del chat sincronizado por el sync/
//                        piloto: datos del USUARIO (su proyecto, sus docs,
//                        sus copias de skills y extensions). Nótese la
//                        trampa: dentro de .proyectos hay carpetas `skills/`
//                        y `tests/` que la exención por prefijo (rel.startsWith)
//                        NO alcanza a ver, así que cadenas de ejemplo
//                        legítimas se auditan como si fueran fuente.
//   · .cerebronico/ · .cerebro-db/ · .revisiones/ · memoria_history/ —
//                        estado vivo de la IDE (autosaves, espejos,
//                        snapshots de VCS interno). Las revisiones guardan
//                        fotogramas HISTÓRICOS de archivos: una línea ya
//                        sanada seguiría gritando para siempre. La clave del
//                        usuario vive en su almacenamiento local del navegador
//                        — este párrafo es la verdad del guardián, no un
//                        parche de silencio.
//   · reports/         — salida de `npm run verificar` (antiDrift), regenerada.
// El compromiso sigue siendo el de siempre: la sonda sembrada en la RAÍZ por
// la prueba (`.sonda-*.txt`) se sigue detectando — el guardián no se vuelve
// mudo, deja de morder la hojarasca. Y si alguna vez hace falta auditar uno
// de estos árboles, `node scripts/sin-claves.mjs .proyectos` lo permite.
// ════════════════════════════════════════════════════════════════════════
const DIRS_IGNORADOS = new Set([
  "node_modules", ".git", "dist", "dist-electron", "dist_electron", "release",
  "out", "coverage", ".cache", ".vite",
  // — estado y artefactos de una instalación en uso (v1.84.4, ver arriba) —
  "runtime", ".proyectos", ".cerebronico", ".cerebro-db", ".revisiones",
  "memoria_history", "reports",
]);

/**
 * v1.56.8 — LA DERIVACIÓN, NO LA ADIVINANZA.
 * La lista de arriba traía `dist-electron` (con guión), pero electron-builder
 * escribe donde diga `package.json > build > directories.output`, y aquí dice
 * **`dist_electron`** (con guión bajo). Resultado: en cuanto el usuario corre
 * `npm run dist`, el guardián se mete en ~182 MB de salida de compilación y
 * `npm run validar` se pone rojo con tres fallos que no son del código fuente —
 * justo lo que Mario vio: `code=1` después de empaquetar, cuando el mismo
 * guardián había dicho LIMPIO dos minutos antes por CLI.
 *
 * Un nombre escrito a mano es una promesa que nadie sostiene. Se LEE la fuente de
 * verdad y se añade lo que el empaquetador produzca, cambie como cambie.
 */
try {
  const pkg = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf-8"));
  const salida = pkg?.build?.directories?.output;
  if (typeof salida === "string" && salida.trim()) {
    for (const parte of salida.split(/[\\/]/).filter(Boolean)) DIRS_IGNORADOS.add(parte);
  }
  // `files` también delata artefactos: cualquier patrón que empiece por una carpeta
  // de salida conocida entra en la lista.
  if (Array.isArray(pkg?.build?.directories?.buildResources)) {
    for (const r of pkg.build.directories.buildResources) DIRS_IGNORADOS.add(String(r).split(/[\\/]/)[0]);
  }
} catch {
  // Sin package.json legible se audita con la lista fija: mejor un falso positivo
  // del guardián que un falso negativo, así que NO se salta nada.
}

// Extensiones de texto que tiene sentido auditar.
const EXT_TEXTO = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md",
  ".txt", ".html", ".css", ".py", ".env", ".yml", ".yaml", ".cn",
]);

// Ficheros concretos que son plantillas/ejemplos legítimos de credenciales.
const FICHEROS_PLANTILLA = new Set([".env.example", ".env.sample", ".env.template"]);

// Patrones de claves REALES (no genéricos). Cada uno apunta a un formato de
// proveedor con suficiente entropía/longitud como para no ser un placeholder.
const PATRONES = [
  { nombre: "Google / Gemini (AIza…)", re: /AIza[0-9A-Za-z_\-]{35}/g },
  { nombre: "OpenAI/compat (sk-…)",     re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { nombre: "OpenRouter (sk-or-…)",     re: /\bsk-or-[A-Za-z0-9-]{20,}\b/g },
  { nombre: "Groq (gsk_…)",            re: /\bgsk_[A-Za-z0-9]{40,}\b/g },
  { nombre: "Anthropic (sk-ant-…)",    re: /\bsk-ant-[A-Za-z0-9-]{20,}\b/g },
  { nombre: "Z.AI / token uuid.secret", re: /\b[0-9a-f]{32}\.[A-Za-z0-9]{14,}\b/g },
  { nombre: "Bearer embebido",         re: /Bearer\s+[A-Za-z0-9._\-]{24,}/g },
  // v1.95.2 · LA FORMA QUE EL PROPIO GUARDIÁN NO VEÍA, y por eso se fue una clave de
  // usuario en un paquete. OpenRouter rebota en sus errores la URL de la consola CON la
  // clave dentro (`…/workspaces/default/keys/<64 hex>`); sin prefijo `sk-`, los siete
  // patrones de arriba la dejaban pasar. Por esa vía salió la clave de Mario en el chat,
  // en el export de su sesión —y en el CHANGELOG que yo mismo escribí citándola—.
  // Regla angosta a propósito: segmento `keys/` + 20 caracteres o más. No toca los sha256
  // de entrega (vienen como `SHA-256: <hex>`, no bajo `keys/`) ni los prefijos de 8 hex
  // que se citan redactados en el propio CHANGELOG y en las vallas.
  { nombre: "Credencial en URL (…/keys/…)", re: /\/keys\/[0-9A-Za-z_-]{20,}/g },
];

// Si la coincidencia contiene cualquiera de estas marcas, es un placeholder /
// ejemplo / cadena de prueba, NO un secreto. Lista blanca conservadora.
const MARCAS_FALSAS = [
  "xxxx", "XXXX", "redact", "REDACT", "ejemplo", "example", "placeholder",
  "tu-clave", "your-key", "your_key", "abc123", "abcd1234", "1234567890",
  "...", "<", ">", "AQUI", "aqui", "TU_CLAVE", "dummy", "fake", "test",
];

function esFalsoPositivo(hallazgo) {
  return MARCAS_FALSAS.some((m) => hallazgo.includes(m));
}

function* recorrer(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (DIRS_IGNORADOS.has(e.name)) continue;
      yield* recorrer(completo);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (EXT_TEXTO.has(ext) || e.name.startsWith(".env")) yield completo;
    }
  }
}

const hallazgos = [];
let ficheros = 0;

// El sub-árbol pedido no existe (instalación limpia sin .proyectos, p. ej.):
// auditar cero archivos y salir LIMPIO, no estrellar el readdir.
if (APUNTAR_A !== RAIZ && !existsSync(APUNTAR_A)) {
  console.log(`\n🔑 GUARDIÁN ANTI-CLAVES — «${path.relative(RAIZ, APUNTAR_A)}» no existe aún: nada que auditar.\n`);
  process.exit(0);
}

for (const abs of recorrer(APUNTAR_A)) {
  const rel = path.relative(RAIZ, abs).replace(/\\/g, "/");
  const base = path.basename(abs);
  // Las plantillas de credenciales con placeholders son legítimas.
  if (FICHEROS_PLANTILLA.has(base)) continue;
  // Las carpetas de skills y los tests contienen cadenas de ejemplo a propósito.
  if (rel.startsWith("skills/") || rel.startsWith("tests/")) continue;
  let tam = 0;
  try { tam = statSync(abs).size; } catch { continue; }
  if (tam > 3 * 1024 * 1024) continue; // saltar binarios/empaquetados enormes
  let texto = "";
  try { texto = readFileSync(abs, "utf8"); } catch { continue; }
  ficheros++;
  for (const { nombre, re } of PATRONES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto)) !== null) {
      const golpe = m[0];
      if (esFalsoPositivo(golpe)) continue;
      // Posición legible (línea aproximada).
      const linea = texto.slice(0, m.index).split("\n").length;
      // Enmascarar: solo mostramos los primeros 6 caracteres.
      const mascara = `${golpe.slice(0, 6)}***(${golpe.length} chars)`;
      // `abs` se guarda para que `--exiliar` sepa qué fichero mover (v1.84.6).
      hallazgos.push({ abs, rel, linea, nombre, mascara });
    }
  }
}

console.log(`\n🔑 GUARDIÁN ANTI-CLAVES — ${ficheros} ficheros de texto auditados.\n`);

if (hallazgos.length === 0) {
  console.log("✅ LIMPIO: no se encontró ninguna clave API real.");
  console.log("   El árbol, el editor y las ranuras de proveedores viajan sin claves.");
  console.log("   (Las claves se guardan solo en el almacenamiento local del navegador");
  console.log("    del usuario; nunca entran al repositorio ni al ZIP.)\n");
  process.exit(0);
} else {
  console.error(`❌ SE ENCONTRARON ${hallazgos.length} POSIBLE(S) CLAVE(S) REAL(ES):\n`);
  for (const h of hallazgos) {
    console.error(`   · ${h.rel}:${h.linea}  [${h.nombre}]  ${h.mascara}`);
  }
  // ════════════════════════════════════════════════════════════════════════
  // v1.84.6 · EL EXILIO (caso real de Mario, 27/10: un JSON de claves del proxy
  // externo, con sus claves OpenRouter y Z.AI en plaintext, caído en la raíz de la carpeta
  // que él mismo empaqueta y comparte). El guardián tiene RAZÓN y no se le
  // tapa: un árbol que viaja en ZIP no guarda secretos. Pero el ritual no può
  // dejar al usuario con un rojo y tres líneas: `--exiliar` SACA los ficheros
  // manchados del árbol (movimiento a una carpeta HERMANA, fuera del repo y
  // fuera del ZIP — nunca un borrado: los datos son del usuario, quizá los
  // necesita) y deja un aviso de que las claves ya fueron vistas en disco
  // plano y conviene ROTARLAS. Salida 0 solo si todos los ficheros con golpe
  // salieron del árbol; el contenido no se toca, no se sube a ningún lado.
  // ════════════════════════════════════════════════════════════════════════
  const EXILIAR = process.argv.includes("--exiliar");
  if (!EXILIAR) {
    console.error("   Limpia estos valores (déjalos vacíos o como placeholder) antes de empaquetar.");
    console.error("   O sácalos del árbol sin perderlos:  node scripts/sin-claves.mjs --exiliar");
    console.error("");
    process.exit(1);
  }
  const carpetaExilio = path.join(path.dirname(RAIZ), path.basename(RAIZ) + "__claves-exiliadas");
  const ficherosTocados = [...new Set(hallazgos.map((h) => h.abs))];
  let exiliados = 0;
  for (const abs of ficherosTocados) {
    try {
      if (!existsSync(carpetaExilio)) mkdirSync(carpetaExilio, { recursive: true });
      let destino = path.join(carpetaExilio, path.basename(abs));
      let n = 1;
      while (existsSync(destino)) destino = path.join(carpetaExilio, `${path.basename(abs, path.extname(abs))}.${n++}${path.extname(abs)}`);
      renameSync(abs, destino);
      exiliados++;
      console.log(`   📦 exiliado: ${path.relative(RAIZ, abs)}  →  ${destino}`);
    } catch (e) {
      console.error(`   ⚠ no se pudo exiliar ${path.relative(RAIZ, abs)}: ${String(e && e.message).slice(0, 100)}`);
    }
  }
  const aviso = path.join(carpetaExilio, "LEEME.txt");
  if (exiliados && !existsSync(aviso)) {
    try {
      writeFileSync(aviso,
        "Estos archivos fueron sacados del proyecto por `scripts/sin-claves.mjs --exiliar`\r\n" +
        "(el guardián anti-claves: un árbol que se empaqueta y viaja no puede contener\r\n" +
        "claves reales). Nadie los borró; están intactos.\r\n\r\n" +
        "IMPORTANTE: esas claves vivieron en texto plano dentro de una carpeta que has\r\n" +
        "compartido/empaquetado. Considera ROTARLAS en el proveedor (OpenRouter, Z.AI,\r\n" +
        "el que sea) y guarda la copia definitiva FUERA del proyecto.\r\n");
    } catch {}
  }
  console.log(`\n🔑 EXILIO: ${exiliados}/${ficherosTocados.length} fichero(s) con clave(s) fuera del árbol → ${carpetaExilio}`);
  console.log("   Vuelve a lanzar el ritual: el árbol ya no viaja con claves. Y rota esas claves.\n");
  process.exit(exiliados === ficherosTocados.length ? 0 : 1);
}
