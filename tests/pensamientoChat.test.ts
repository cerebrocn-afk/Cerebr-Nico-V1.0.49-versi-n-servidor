/**
 * tests/pensamientoChat.test.ts — v1.16.6 · MODO DE PENSAMIENTO A LA VISTA
 * =========================================================================
 * Queja del usuario: «colocar el botón de pensamiento profundo/rápido/
 * ingeniero en el chat; solo está en el menú Pro pero no a la vista».
 * Verificado de paso que el selector NO era decorativo: executionMode no lo
 * leía nadie (regulador mudo, la misma clase de defecto de systemExtra v1.16.5).
 *
 * Comprueba:
 *   1) El motor (src/engine/thinkingMode.ts): ciclo, etiquetas, ayuda y
 *      directrices REALES (ningún modo nombrado devuelve cadena vacía).
 *   2) La fuente compartida: el chip escribe en proSettings.ai.executionMode
 *      (mismo sitio que el menú Pro) y la directriz viaja al system prompt
 *      (App.tsx → directrizPensamiento → extraParts).
 *   3) El chip existe en ChatCenter con icono, etiqueta y handler cableados.
 *
 * Se ejecuta con:  npx tsx tests/pensamientoChat.test.ts
 */
import { readFileSync } from "node:fs";
import {
  ORDEN_MODOS,
  ETIQUETA_MODO,
  AYUDA_MODO,
  esModoPensamiento,
  siguienteModo,
  directrizModo,
} from "../src/engine/thinkingMode";
import { buildExpertDirective } from "../src/utils/contextCache";

let correctas = 0;
const fallos: string[] = [];

function comprobar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) correctas++;
  else {
    fallos.push(titulo + (detalle ? ` — ${detalle}` : ""));
    console.error(`  ✗ ${titulo}${detalle ? `\n      ${detalle}` : ""}`);
  }
}

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// ─── 1 · EL MOTOR ───────────────────────────────────────────────────────────
comprobar("los cuatro modos existen en el orden del chip",
  ORDEN_MODOS.join(",") === "auto,rapido,ingeniero,profundo", ORDEN_MODOS.join(","));

comprobar("el ciclo rota auto→rapido", siguienteModo("auto") === "rapido");
comprobar("el ciclo rota rapido→ingeniero", siguienteModo("rapido") === "ingeniero");
comprobar("el ciclo rota ingeniero→profundo", siguienteModo("ingeniero") === "profundo");
comprobar("el ciclo cierra profundo→auto", siguienteModo("profundo") === "auto");
comprobar("un valor desconocido entra por auto (no se pierde)", siguienteModo("legal") === "rapido");
comprobar("undefined tampoco rompe el ciclo", siguienteModo(undefined) === "rapido");

comprobar("esModoPensamiento solo acepta los cuatro",
  esModoPensamiento("auto") && esModoPensamiento("rapido") &&
  esModoPensamiento("ingeniero") && esModoPensamiento("profundo") &&
  !esModoPensamiento("code") && !esModoPensamiento(""));

comprobar("cada modo tiene etiqueta visible «Pensar: …»",
  ORDEN_MODOS.every((m) => ETIQUETA_MODO[m].startsWith("Pensar: ")),
  ORDEN_MODOS.map((m) => ETIQUETA_MODO[m]).join(" | "));
comprobar("cada modo tiene ayuda en el title del chip",
  ORDEN_MODOS.every((m) => AYUDA_MODO[m].length > 20));

// ─── 2 · NINGÚN MODO ES DECORATIVO (anti regulador mudo) ────────────────────
comprobar("auto NO añade nada al prompt (comportamiento de siempre)",
  directrizModo("auto") === "");
comprobar("valor desconocido equivale a auto", directrizModo("cualquiera") === "");
const dRapido = directrizModo("rapido");
comprobar("rápido inyecta su directriz nombrada", /MODO RÁPIDO/.test(dRapido) && dRapido.length > 60);
comprobar("rápido manda brevedad SIN omitir lo pedido", /Brevedad, no vaguedad/.test(dRapido));
comprobar("ingeniero PARTE de la directriz de código YA existente (la base es una sola fuente)",
  directrizModo("ingeniero").startsWith(buildExpertDirective("code")) && /MODO EXPERTO EN CÓDIGO/.test(directrizModo("ingeniero")));
const dProf = directrizModo("profundo");
comprobar("profundo exige plan + verificación", /MODO PROFUNDO/.test(dProf) && /set_plan/.test(dProf) && /VERIFICA/.test(dProf));
comprobar("profundo prohíbe afirmar sin probar", /sin probar, dilo/.test(dProf));

// ─── 3 · EL CABLEADO (App + ChatCenter + fuente compartida) ─────────────────
const app = leer("../src/App.tsx");
const chat = leer("../src/components/ChatCenter.tsx");
const pro = leer("../src/utils/proSettings.ts");

comprobar("App.tsx importa el motor de modos", /import \{[^}]*siguienteModo[^}]*directrizModo[^}]*\} from "\.\/engine\/thinkingMode"/.test(app));
comprobar("App.tsx cablea la directriz al system prompt (extraParts)",
  /const directrizPensamiento = directrizModo\(\(proSettings as any\)\?\.ai\?\.executionMode\)/.test(app) &&
  /if \(directrizPensamiento\) extraParts\.push\(directrizPensamiento\)/.test(app));
comprobar("el chip escribe en proSettings (misma fuente que el menú Pro)",
  /executionMode: siguienteModo\(\(prev as any\)\?\.ai\?\.executionMode\)/.test(app));
comprobar("App pasa modo + handler al chat",
  /thinkingMode=\{\(proSettings as any\)\?\.ai\?\.executionMode \|\| "auto"\}/.test(app) &&
  /onCycleThinkingMode=\{cycleThinkingMode\}/.test(app));
comprobar("ChatCenter declara las props del chip",
  /thinkingMode\?: string;/.test(chat) && /onCycleThinkingMode\?: \(\) => void;/.test(chat));
comprobar("ChatCenter renderiza el chip con Brain + etiqueta + onClick",
  /onClick=\{onCycleThinkingMode\}/.test(chat) && /<Brain className=/.test(chat) && /ETIQUETA_MODO\[modo\]/.test(chat));
comprobar("el chip está SIEMPRE a la vista (sin showEditorMode que lo esconda)",
  chat.indexOf("onClick={onCycleThinkingMode}") < chat.indexOf("showEditorMode && (") ||
  !/\{showEditorMode && \(\s*<button[^>]*onClick=\{onCycleThinkingMode\}/.test(chat));
comprobar("el tipo de proSettings sigue siendo la única declaración del campo",
  (pro.match(/executionMode: "auto" \| "rapido" \| "ingeniero" \| "profundo";/g) || []).length === 1);
comprobar("el menú Pro conserva su selector (las dos puertas, un cerrojo)",
  /value: "profundo", label: "Pensamiento profundo"/.test(leer("../src/components/ProConfigPanel.tsx")));

console.log(`\n═══ PENSAMIENTO EN EL CHAT v1.16.6: ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log("  ·", f);
}
process.exit(fallos.length ? 1 : 0);
