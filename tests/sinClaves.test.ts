/**
 * sinClaves.test.ts — EL GUARDÍAN ANTI-CLAVES, CABLEADO AL VEREDICTO (v1.48.1, pedido de Mario)
 * =========================================================================================
 * Mario pidió que el proyecto «viaje limpio por default»: ni el árbol, ni el
 * editor, ni las ranuras de proveedores pueden llevar una clave API real dentro
 * del repo o del ZIP. Para eso existe `scripts/sin-claves.mjs` (y `npm run
 * sin-claves`). Pero un guardián que nadie ejecuta no protege nada: hasta hoy
 * vivía fuera del veredicto de `npm run validar`.
 *
 * Esta suite lo CABLEA al veredicto, con la misma filosofía del resto del
 * proyecto — no basta con comprobar que el guardián existe, hay que probar que
 * MIDE: que grita cuando hay una clave de verdad y que calla ante un
 * placeholder. Si algún día alguien lo deja mudo, esta prueba se pone roja.
 *
 * NOTA DE DISEÑO: el propio `sin-claves.mjs` ignora a propósito la carpeta
 * `tests/`, así que las claves de EJEMPLO que aparecen aquí abajo NUNCA se
 * cuentan como hallazgos al auditar el repo real. La «clave sembrada» se escribe
 * en una sonda temporal en la raíz y se borra siempre (try/finally).
 */
import * as fs from "fs";
import * as path from "path";
// ESM: `__dirname` no existe; se reconstruye desde import.meta.url.
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const GUARDIAN = "scripts/sin-claves.mjs";

/** Corre el guardián como subproceso (es .mjs → node, no tsx) y devuelve code+salida. */
function correrGuardian(): { code: number; salida: string } {
  const r = spawnSync(process.execPath, [path.join(RAIZ, GUARDIAN)], {
    cwd: RAIZ,
    encoding: "utf8",
    env: { ...process.env },
  });
  const salida = `${r.stdout || ""}\n${r.stderr || ""}`;
  return { code: r.status === null ? 1 : r.status, salida };
}

console.log("\u2550\u2550\u2550 SIN CLAVES \u00b7 el guardi\u00e1n anti-claves es parte del veredicto \u00b7 CerebroNico v1.48.1 \u2550\u2550\u2550\n");

// ════════════════════════════════════════════════════════════════════
// 1 · El guardián existe y npm lo sabe arrancar
// ════════════════════════════════════════════════════════════════════
console.log("1) El guardi\u00e1n existe y `npm run sin-claves` lo arranca\n");
comprobar("scripts/sin-claves.mjs existe en disco", fs.existsSync(path.join(RAIZ, GUARDIAN)));
const pkg = JSON.parse(leer("package.json"));
comprobar(
  "package.json declara el script `sin-claves`",
  pkg.scripts && pkg.scripts["sin-claves"] === "node scripts/sin-claves.mjs",
  String(pkg.scripts && pkg.scripts["sin-claves"])
);
const guard = leer(GUARDIAN);
// v1.84.6 — LA VALLA CAMBIA DE VERDAD, NO DE COMODIDAD. El guardián sigue sin
// BORRAR JAMÁS (ni rmSync, ni unlinkSync, ni rmdirSync en todo el guion: los
// datos son del usuario). Y el ESCANEO sigue siendo lectura pura: las únicas
// escrituras (mkdir/rename/LEEME) nacen DESPUÉS del umbral `--exiliar`, que es
// un modo explícito que el usuario pide. Si alguien mueve un write antes del
// umbral, esto se pone rojo.
comprobar("el guardi\u00e1n NUNCA borra (ni rmSync, ni unlinkSync, ni rmdirSync)",
  !/rmSync|unlinkSync|rmdirSync/.test(guard));
{
  const umbral = guard.indexOf("\"--exiliar\"") >= 0 ? guard.indexOf("if (!EXILIAR)") : -1;
  const idx = (re: RegExp) => { const m = guard.match(re); return m && m.index !== undefined ? m.index : Infinity; };
  const primeroEscritura = Math.min(
    idx(/\bmkdirSync\(/), idx(/\brenameSync\(/), idx(/\bwriteFileSync\(/)
  );
  comprobar("el escaneo es lectura pura: mkdir/rename/write solo tras el umbral --exiliar",
    umbral >= 0 && primeroEscritura > umbral && primeroEscritura !== Infinity);
}
comprobar("ignora node_modules y .git (no audita lo que no es fuente)", /node_modules/.test(guard) && /\.git/.test(guard));
comprobar("tiene lista blanca de falsos positivos (placeholders/ejemplos)", /MARCAS_FALSAS/.test(guard));
comprobar("excluye tests/ y skills/ (cadenas de ejemplo a prop\u00f3sito)", /tests\//.test(guard) && /skills\//.test(guard));
// v1.84.4 — la lección de Mario (dos capturas, dos «code=1» sin colpa de la
// fuente): una instalación EN USO fabrica árboles que no viajan en el ZIP y
// que traen muestras/estado propios. El guardi\u00e1n los excluye por nombre.
comprobar("excluye los arboles de la instalacion en uso (runtime/.proyectos/.cerebronico/.revisiones/memoria_history)",
  /"runtime"/.test(guard) && /\.proyectos/.test(guard) && /\.cerebronico/.test(guard) && /\.revisiones/.test(guard) && /memoria_history/.test(guard));
comprobar("y los deja auditarlos a demanda (sub-arbol por argumento, no invisibles)", /APUNTAR_A/.test(guard) && /process\.argv\.slice\(2\)/.test(guard));
// v1.84.6 — el exilio también reconoce el sub-árbol y no confunde flags con rutas.
comprobar("el modo exilio existe y separa flags de árbol (--exiliar no se audita como ruta)",
  /--exiliar/.test(guard) && /ARG_ARBOL/.test(guard) && /startsWith\("-"\)/.test(guard) && /__claves-exiliadas/.test(guard));

// ════════════════════════════════════════════════════════════════════
// 2 · .gitignore blinda secretos y sesiones
// ════════════════════════════════════════════════════════════════════
console.log("\n2) .gitignore impide que claves y sesiones viajen en el repo/ZIP\n");
const gi = leer(".gitignore");
comprobar(".env no se versiona", /^\.env$/m.test(gi));
comprobar("*.key y *.pem quedan fuera", /\*\.key/.test(gi) && /\*\.pem/.test(gi));
comprobar("secrets.json queda fuera", /secrets\.json/.test(gi));
comprobar("sesiones *.cn y sesion-*.json quedan fuera", /\*\.cn/.test(gi) && /sesion-\*\.json/.test(gi));
comprobar(".env.example (plantilla) S\u00cd se versiona (no est\u00e1 bloqueado)", !/^\.env\.example$/m.test(gi));

// ════════════════════════════════════════════════════════════════════
// 3 · Sobre el repo REAL: viaja limpio (exit 0)
// ════════════════════════════════════════════════════════════════════
console.log("\n3) El repo de verdad viaja limpio ahora mismo\n");
const limpio = correrGuardian();
// v1.84.4 — Diagnóstico en el propio veredicto (Mario 27/10, segunda vez que el
// trío rojo llega sin decir QUÉ archivo disparó: «code=1» a secas obligaba a
// adivinar de qué árbol venía el golpe). El guardián ya enmascara la clave
// (solo 6 caracteres), así que pegar su informe en el detalle es seguro.
const detalleLimpio = limpio.code === 0 ? "" : " :: " + (limpio.salida.split(/\r?\n/)
  .filter((l) => /·\s|SE ENCONTRARON/.test(l)).slice(0, 6).join(" | ").slice(0, 500) || `code=${limpio.code}`);
comprobar("el guardi\u00e1n termina en 0 sobre este repo", limpio.code === 0, `code=${limpio.code}${detalleLimpio}`);
comprobar("...y lo dice en voz alta (LIMPIO)", /LIMPIO/.test(limpio.salida));

// ════════════════════════════════════════════════════════════════════
// 4 · El guardián MIDE: detecta una clave sembrada y perdona un placeholder
// ════════════════════════════════════════════════════════════════════
console.log("\n4) El guardi\u00e1n MIDE de verdad (no es un gate mudo)\n");
const sondaReal = path.join(RAIZ, ".sonda-sin-claves.txt");
const sondaFalsa = path.join(RAIZ, ".sonda-placeholder.txt");
try {
  // Clave con formato Gemini real, sin ninguna marca de falso positivo.
  const claveSembrada = "AIza" + "SyDkMnPqRxVbChLgWtFzUeJoYaScBdNvHkT";
  fs.writeFileSync(sondaReal, `GEMINI_API_KEY=${claveSembrada}\n`, "utf8");
  const sembrado = correrGuardian();
  comprobar("...DETECTA una clave sembrada en la ra\u00edz (exit 1)", sembrado.code === 1, `code=${sembrado.code}`);
  comprobar("...y la nombra en el informe", /SE ENCONTRARON|clave/i.test(sembrado.salida));
  fs.unlinkSync(sondaReal);

  // Un placeholder con XXXX NO debe disparar (la lista blanca sigue viva).
  const placeholderFalso = "AIzaSy" + "X".repeat(40);
  fs.writeFileSync(sondaFalsa, `GEMINI_API_KEY=${placeholderFalso}\n`, "utf8");
  const placeholder = correrGuardian();
  comprobar("...y NO grita por un placeholder (XXXX es falso positivo)", placeholder.code === 0, `code=${placeholder.code}`);
  fs.unlinkSync(sondaFalsa);
} finally {
  // Pase lo que pase, el repo queda como estaba: sin sondas sueltas.
  for (const s of [sondaReal, sondaFalsa]) {
    try { if (fs.existsSync(s)) fs.unlinkSync(s); } catch { /* ya no estaba */ }
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 5 · v1.84.6 — EL EXILIO (caso real Mario: un JSON de claves del proxy externo
// OpenRouter y Z.AI en la raíz de la carpeta que él empaqueta). El guardián no
// borra NUNCA; `--exiliar` SACA el fichero del árbol a una carpeta HERMANA
// (fuera del repo y del ZIP) y lo deja intacto. Prueba de punta a punta.
// ═════════════════════════════════════════════════════════════════════════
console.log("\n5) El exilio saca la clave del árbol sin borrarla (--exiliar)\n");
const sondaExilio = path.join(RAIZ, "claves-externas.json"); // nombre realista: un JSON de claves en la raíz
const carpetaExilio = path.join(path.dirname(RAIZ), path.basename(RAIZ) + "__claves-exiliadas");
function correrGuardianExiliando(): { code: number; salida: string } {
  const r = spawnSync(process.execPath, [path.join(RAIZ, GUARDIAN), "--exiliar"], {
    cwd: RAIZ, encoding: "utf8", env: { ...process.env },
  });
  return { code: r.status === null ? 1 : r.status, salida: `${r.stdout || ""}\n${r.stderr || ""}` };
}
try {
  const clave = "sk-or-" + "v1A0b1C2d3E4f5G6h7I8j9K0l1M2n3O4p5Q6r7S8t9U0";
  fs.writeFileSync(sondaExilio, JSON.stringify({ openrouter: clave }), "utf8");
  const antes = correrGuardian();
  comprobar("con la clave en el árbol, el guardi\u00e1n da 1", antes.code === 1, `code=${antes.code}`);
  const ex = correrGuardianExiliando();
  comprobar("--exiliar termina en 0 (todo salió del árbol)", ex.code === 0, `code=${ex.code} :: ${ex.salida.slice(0, 200)}`);
  comprobar("el fichero YA NO está en el árbol", !fs.existsSync(sondaExilio));
  const exiliado = path.join(carpetaExilio, "claves-externas.json");
  comprobar("...pero esta INTACTO en la carpeta hermana (no se borro)",
    fs.existsSync(exiliado) && /sk-or-/.test(fs.readFileSync(exiliado, "utf8")));
  comprobar("y deja un LEEME que manda ROTAR la clave",
    /ROTARLAS/i.test(fs.readFileSync(path.join(carpetaExilio, "LEEME.txt"), "utf8")));
  const despues = correrGuardian();
  comprobar("re-auditoria: el arbol ya viaja LIMPIO", despues.code === 0, `code=${despues.code}`);
} finally {
  // La prueba limpia su exilio para no dejar basura en el espacio de trabajo.
  try {
    if (fs.existsSync(sondaExilio)) fs.unlinkSync(sondaExilio);
    if (fs.existsSync(carpetaExilio)) {
      for (const f of fs.readdirSync(carpetaExilio)) fs.unlinkSync(path.join(carpetaExilio, f));
      fs.rmdirSync(carpetaExilio);
    }
  } catch { /* ya limpio */ }
}

console.log(`\n\u2550\u2550\u2550 SIN CLAVES (v1.48.1): ${correctas} correctas \u00b7 ${fallos.length} fallidas \u2550\u2550\u2550`);
for (const f of fallos) console.log("  FALLO \u2192", f);
process.exit(fallos.length ? 1 : 0);
