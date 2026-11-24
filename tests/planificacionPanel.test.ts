/**
 * planificacionPanel.test.ts — v1.16.3 · PANEL DE TRABAJO SECUNDARIO (plan maestro)
 * ================================================================================
 * El plan de pantalla pedía tres pasos y un comportamiento verificable:
 *   Paso 1 · componente con tareas activas + estado del sandbox + hojas de ruta.
 *   Paso 2 · botón de acceso rápido arriba-derecha que ALTERNA el desplegable.
 *   Paso 3 · sincronización con los eventos del motor (`cerebronico:plan`).
 * La verificación pedida era: «el panel debe reflejar de forma AUTOMÁTICA las
 * tareas del motor y alternar su visibilidad con un clic en el indicador».
 *
 * Qué comprueba esta suite (y por qué cada cual):
 *  - El archivo existe y los tres pasos tienen a dónde mirar en el código.
 *  - Fuente única: el panel pregunta a /api/brain/plans (la MISMA API del panel
 *    completo) — un payload de evento usado como verdad sería una segunda foto.
 *  - El evento con nombre exacto del plan (`cerebronico:plan`) se emite desde
 *    el stream y se escucha desde el panel: ambos extremos, no uno.
 *  - El sandbox se muestra con sus tres estados reales (vivo / arrancando /
 *    dormido), sin adornos que mientan.
 *  - No interrumpe: la autoapertura exige plan NUEVO vivo + bloqueo anti-rebote.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(HERE, "..");
const leer = (p: string) => readFileSync(path.join(BACKEND, p), "utf-8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}

console.log("\n═══ PANEL DE TRABAJO SECUNDARIO (v1.16.3): pasos del plan maestro ═══");

const panel = leer("src/components/PlanificationPanel.tsx");
// v1.0.20 · desde la poda de la hoja (v2.3.26) el contenido de los tres bloques
// no vive en el panel sino en HojaDeRutaViva (la cara) + engine/hojaDeRuta (la
// cabeza pura). La suite medía el archivo viejo y por eso gritaba en falso.
const hoja = leer("src/components/HojaDeRutaViva.tsx");
const cabeza = leer("src/engine/hojaDeRuta.ts");
const app = leer("src/App.tsx");
const chat = leer("src/components/ChatCenter.tsx");

console.log("\n1) Paso 2 · acceso rápido arriba-derecha");
comprobar("el componente existe (Paso 1 del plan)", existsSync(path.join(BACKEND, "src/components/PlanificationPanel.tsx")));
comprobar("App.tsx lo importa", app.includes("PlanificationPanel"));
comprobar("App lo MONTA en la capa fija superior-derecha", /<PlanificationPanel[^>]*onOpenPanel/.test(app));
comprobar("es un botón que ALTERNA (setIsOpen(v => !v)) — no un enlace de una vía",
  panel.includes("setIsOpen((v) => !v)"));
comprobar("el desplegable es condicional ({isOpen && …})", /\{isOpen && \(/.test(panel));
comprobar("el punto solo pulsa con trabajo REAL (clase animate-pulse condicionada)",
  /enCurso\s*\|\|\s*isReconnecting\s*\?\s*"bg-amber-400 animate-pulse"/.test(panel));

console.log("\n2) Paso 1 · contenido del panel");
// La marca por estado ya no es un mapa literal en la cara: la cabeza traduce
// estado crudo → clase (hecho / en-curso / roto / pendiente) y la cara pinta
// con MARCA. Se exige el mapa completo y que los cuatro estados del planificador
// tengan traducción.
comprobar("tareas activas con marca por estado (✓ ▶ ✗ ⊘ ·)",
  /MARCA[^=]*=\s*\{[^}]*hecho:\s*"✓"[^}]*"en-curso":\s*"▶"[^}]*roto:\s*"✗"[^}]*pendiente:\s*"·"/.test(cabeza) &&
  ["hecha", "en_curso", "fallida", "bloqueada"].every((e) => cabeza.includes(`"${e}"`)) &&
  hoja.includes("<Marca clase={f.clase} />"));
// v2.3.26 · la hoja NO pinta un bloque de sandbox: lo que Mario pidió dejar son
// tres cosas (puertos · pasos · entregable). El sandbox se pregunta igual, pero
// desde donde se ve de verdad: la barra derecha, con el vigía que decide sobre
// datos (no sobre la ausencia de puerto). Se blinda el cable, no el adorno.
const derecha = leer("src/components/RightSidebar.tsx");
const vigia = leer("src/engine/estadoSandbox.ts");
comprobar("ESTADO DEL SANDBOX: pregunta a /api/sandbox/status",
  panel.includes("/api/sandbox/status") || derecha.includes('fetch("/api/sandbox/status")'));
comprobar("el sandbox dice sus tres verdades (vivo / arrancando / dormido)",
  /online === true[\s\S]*return "vivo"/.test(vigia) &&
  /running === true[\s\S]*return "arrancando"/.test(vigia) &&
  /return "detenido"/.test(vigia) &&
  derecha.includes("decidirVigiliaSandbox"));
comprobar("hojas de ruta del motor con contador hecha/total",
  /\{hechas\}\/\{total\}/.test(hoja) &&
  /const hechas = tarea\.pasos\.filter/.test(hoja));

console.log("\n3) Paso 3 · sincronización `cerebronico:plan` (y una verdad)");
comprobar("el stream EMITE el evento nombrado en el plan con su payload",
  /new CustomEvent\("cerebronico:plan",\s*\{\s*detail:\s*\{ tareas: event\.tasks \}\s*\}\s*\)/.test(app));
comprobar("el panel ESCUCHA cerebronico:plan y también el plan-creado heredado",
  panel.includes('"cerebronico:plan"') && panel.includes("cerebronico:plan-creado"));
comprobar("FUENTE ÚNICA: la escucha recarga contra /api/brain/plans, no usa el payload",
  panel.includes("/api/brain/plans") && !/detail\s*as\s*PlanMini|e\.detail\.tareas/.test(panel));
comprobar("autoapertura solo con plan NUEVO con tareas vivas (no sobre lo conocido)",
  panel.includes("planesConocidosRef") && panel.includes("nuevos.some(planVivo)"));
comprobar("bloqueo anti-rebote de la autoapertura (no interrumpe cada 2 s)", /ultimaAperturaRef\.current > 6000/.test(panel));
comprobar("refresco rápido solo cuando hay trabajo (10 s en reposo)",
  panel.includes("turnoVivo ? 2000 : 10000") && /const turnoVivo = planes\.some/.test(panel));
comprobar("puerta de salida al panel completo (no duplica funciones)", panel.includes("onOpenPanel"));

console.log("\n4) cables de la casa");
comprobar("no introdujo literales de versión (regla de semilla única)", !/1\.16\.\d/.test(panel.replace(/·\s*v?1\.16\.\d/g, "").replace(/v1\.16\.3/g, "")) || panel.match(/v1\.16\.3/g)!.length <= 2);
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("planificacionPanel.test.ts"));

console.log("\n5) geometría: el panel no tapa los botones del chat (v1.20.1)");
// El fallo real que originó esta valla: con el panel de Tareas abierto, su caja
// caía sobre el pie de las burbujas —donde viven «Escuchar» y «Copiar»— y se
// comía los clics. Se blinda el arreglo, no la anécdota.
comprobar("el contenedor fijo NO captura punteros (pointer-events-none)",
  /fixed[^\n]*pointer-events-none/.test(panel));
comprobar("el botón y la hoja desplegable SÍ reciben eventos",
  (panel.match(/pointer-events-auto/g) || []).length >= 2);
comprobar("el ancho del panel sale de UNA sola cifra (ANCHOSTO_PANEL)",
  /const ANCHOSTO_PANEL = \d+;/.test(panel) && panel.includes("width: ANCHOSTO_PANEL"));
comprobar("ya no queda el ancho fijo w-72 que desbordaba sobre el chat", !/w-72/.test(panel));
comprobar("el desplegable abre DEBAJO del botón (top-full) y se recorta al viewport",
  /top-full/.test(panel) && /max-w-\[calc\(100vw-1\.5rem\)\]/.test(panel));
comprobar("al abrirse publica --cn-tareas-gutter con su ancho + holgura",
  /setProperty\("--cn-tareas-gutter", isOpen \? `\$\{ANCHOSTO_PANEL \+ 16\}px` : "0px"\)/.test(panel));
comprobar("restaura la variable al cerrar o desmontar (no deja la columna deslocada)",
  /antes \|\| "0px"/.test(panel));
comprobar("la lista de mensajes consume el gutter", /marginRight: "var\(--cn-tareas-gutter, 0px\)"/.test(chat));
comprobar("con el panel cerrado la variable vale 0px: el chat no se desplaza nunca",
  panel.includes(': "0px"'));

// ── v1.20.1 · el botón se ancla a la altura REAL medida de la banda superior ──
// El fallo de la captura del 29/09: `top-[54px]` era una SUPOSICIÓN de altura.
// Con tipografías compactas, cabecera que envuelve o pestañas sin barra de
// chat, el botón caía encima de Regenerar/Exportar/Importar/Limpiar. La valla
// blinda el arreglo (medir, no adivinar) y prohíbe volver al literal.
comprobar("el anclaje sale de la altura medida --cn-top-h, no de un top fijo",
  /var\(--cn-top-h/.test(panel) && !/top-\[54px\]/.test(panel));
comprobar("la medida usa ResizeObserver + MutationObserver + rAF (banda variable, cambio de pestaña)",
  /new ResizeObserver/.test(panel) && /new MutationObserver/.test(panel) && /requestAnimationFrame/.test(panel));
comprobar("las tres barras superiores declaran data-cn-topbar (fuente de la medida)",
  /data-cn-topbar/.test(leer("src/components/Header.tsx")) &&
  /data-cn-topbar/.test(leer("src/components/CenterTabs.tsx")) &&
  /data-cn-topbar/.test(chat));

// ── v1.20.1 · el compositor vuelve a su centro: despeje como PADDING ────────
// El `marginRight` inline del gutter pisaba el `margin-right:auto` del
// `mx-auto` del <form>: con el panel cerrado (0px) la caja se pegaba al borde
// derecho («el chat se movió a la derecha»). Con padding en el envoltorio,
// mx-auto sigue centrando dentro del ancho libre.
comprobar("el compositor se despeja con padding, no con margen",
  /paddingRight: "calc\(0\.75rem \+ var\(--cn-tareas-gutter, 0px\)\)"/.test(chat));
comprobar("el <form> conserva mx-auto y NO lleva marginRight inline (0px desplazaba a la derecha)",
  (chat.match(/marginRight: "var\(--cn-tareas-gutter, 0px\)"/g) || []).length === 1);

console.log(`\n═══ ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas ? 1 : 0);
