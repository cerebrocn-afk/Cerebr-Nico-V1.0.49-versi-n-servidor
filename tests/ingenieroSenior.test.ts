/**
 * tests/ingenieroSenior.test.ts — EXTENSIÓN «INGENIERO SENIOR» (v1.24.0)
 * ============================================================================
 * Custodia la capa PRONTA PARA MONTAR AL MOTOR que amplía el botón
 * «Ingeniero» del chat: software complejo, análisis de sistemas y transmutación
 * de códigos binarios. Qué vigila y por qué:
 *
 *   1. REGISTRO DEL MOTOR: montar valida antes de aceptar (id único, modo
 *      válido, directriz no vacía) y nunca lanza; desmontar es honesto.
 *   2. LA EXTENSIÓN: se engancha al modo «ingeniero» y su directriz cubre los
 *      tres frentes pedidos, con verificación y límite legal (no es adorno).
 *   3. VIAJE REAL AL PROMPT: directrizModo("ingeniero") PARTE de la base de
 *      código y trae la capa montada; auto/rápido/profundo no se contaminan.
 *   4. BOOTSTRAP: el index monta la de fábrica y es idempotente.
 *
 * Se ejecuta con:  npx tsx tests/ingenieroSenior.test.ts
 */
import {
  montarExtension,
  desmontarExtension,
  estaMontada,
  extensionesDe,
  directrizExtensiones,
  extensionesMontadas,
} from "../src/engine/extensionesMotor";
import { EXTENSION_INGENIERO_SENIOR, DIRECTRIZ_INGENIERO_SENIOR } from "../src/engine/extensiones/ingenieroSenior";
import { directrizModo } from "../src/engine/thinkingMode";
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

// ─── 1 · EL REGISTRO DEL MOTOR VALIDA ANTES DE MONTAR ────────────────────────
// (No vaciamos el registro: la de fábrica ya la montó el bootstrap al importar
//  thinkingMode; aquí usamos ids `demo.*` aparte y los limpiamos al terminar.)
const okMonta = montarExtension({ id: "demo.x", modo: "ingeniero", directriz: "haz X" });
comprobar("monta una extensión válida y devuelve ok", okMonta.ok === true && okMonta.id === "demo.x");
comprobar("queda registrada tras montarla", estaMontada("demo.x"));
comprobar("rechaza id duplicado (no pisa en silencio)",
  montarExtension({ id: "demo.x", modo: "ingeniero", directriz: "otra" }).ok === false);
comprobar("rechaza modo desconocido con motivo",
  montarExtension({ id: "demo.y", modo: "turbo", directriz: "z" }).ok === false);
comprobar("rechaza directriz vacía (nada de reguladores mudos)",
  montarExtension({ id: "demo.z", modo: "ingeniero", directriz: "   " }).ok === false);
comprobar("rechaza id con caracteres raros",
  montarExtension({ id: "mal id!", modo: "ingeniero", directriz: "z" }).ok === false);
comprobar("no lanza ante basura (objeto nulo => ok:false)",
  montarExtension(null).ok === false && montarExtension(42 as unknown).ok === false);
comprobar("desmontar es honesto: true si existía, false si no",
  desmontarExtension("demo.x") === true && desmontarExtension("demo.x") === false);

// ─── 2 · LA EXTENSIÓN SENIOR + TRANSMUTACIÓN BINARIA ──────────────────────
comprobar("la extensión se engancha al botón INGENIERO", EXTENSION_INGENIERO_SENIOR.modo === "ingeniero");
comprobar("tiene id, etiqueta y resumen para que la UI/log la nombre",
  !!EXTENSION_INGENIERO_SENIOR.id && !!EXTENSION_INGENIERO_SENIOR.etiqueta && !!EXTENSION_INGENIERO_SENIOR.resumen);
comprobar("cubre SOFTWARE COMPLEJO y arquitectura con tradeoffs",
  /INGENIERO SENIOR/.test(DIRECTRIZ_INGENIERO_SENIOR) && /TRADEOFFS/.test(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("cubre ANÁLISIS DE SISTEMAS (concurrencia/rendimiento/seguridad)",
  /ANÁLISIS DE SISTEMAS/.test(DIRECTRIZ_INGENIERO_SENIOR) && /concurrencia/i.test(DIRECTRIZ_INGENIERO_SENIOR) &&
  /rendimiento/i.test(DIRECTRIZ_INGENIERO_SENIOR) && /seguridad/i.test(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("cubre TRANSMUTACIÓN BINARIA: representaciones (endianness, base64, IEEE-754)",
  /TRANSMUTACIÓN DE CÓDIGOS BINARIOS/.test(DIRECTRIZ_INGENIERO_SENIOR) && /endianness/i.test(DIRECTRIZ_INGENIERO_SENIOR) &&
  /base64/i.test(DIRECTRIZ_INGENIERO_SENIOR) && /IEEE-754/.test(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("cubre formatos y máquinas (ELF/PE/Mach-O, bytecode, desensamblado)",
  /ELF/.test(DIRECTRIZ_INGENIERO_SENIOR) && /PE/.test(DIRECTRIZ_INGENIERO_SENIOR) &&
  /bytecode/i.test(DIRECTRIZ_INGENIERO_SENIOR) && /desensamblado/i.test(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("es HONESTA: ordena VERIFICAR con herramientas y marcar SIN VERIFICAR",
  /VERIFICA/.test(DIRECTRIZ_INGENIERO_SENIOR) && /SIN VERIFICAR/.test(DIRECTRIZ_INGENIERO_SENIOR) &&
  /(objdump|readelf|xxd)/.test(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("fija LÍMITE ÉTICO/LEGAL (posee o tiene derecho; no evadir DRM ni malware)",
  /LÍMITE ÉTICO Y LEGAL/.test(DIRECTRIZ_INGENIERO_SENIOR) && /DRM/.test(DIRECTRIZ_INGENIERO_SENIOR) &&
  /malware/i.test(DIRECTRIZ_INGENIERO_SENIOR));

// ─── 3 · VIAJA DE VERDAD AL SYSTEM PROMPT DEL BOTÓN «INGENIERO» ────────────────
// (thinkingMode importa el bootstrap, así que la de fábrica ya está montada.)
const dIng = directrizModo("ingeniero");
comprobar("ingeniero PARTE de la base de código (una sola fuente para la base)",
  dIng.startsWith(buildExpertDirective("code")));
comprobar("ingeniero trae la capa senior montada encima (no la sustituye)",
  /INGENIERO SENIOR/.test(dIng) && dIng.length > buildExpertDirective("code").length);
comprobar("la directriz binaria viaja íntegra al prompt del botón",
  dIng.includes(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("auto sigue sin añadir nada (no se contamina)", directrizModo("auto") === "");
comprobar("rápido y profundo no arrastran la capa de ingeniero",
  !/INGENIERO SENIOR/.test(directrizModo("rapido")) && !/INGENIERO SENIOR/.test(directrizModo("profundo")));

// ─── 4 · BOOTSTRAP IDEMPOTENTE ──────────────────────────────────────
comprobar("la de fábrica quedó montada por el bootstrap al importar",
  estaMontada(EXTENSION_INGENIERO_SENIOR.id));
comprobar("está enganchada al modo ingeniero en el registro",
  extensionesDe("ingeniero").some((e) => e.id === EXTENSION_INGENIERO_SENIOR.id));
comprobar("directrizExtensiones(ingeniero) devuelve la capa binaria",
  directrizExtensiones("ingeniero").includes("TRANSMUTACIÓN DE CÓDIGOS BINARIOS"));
comprobar("montar dos veces la misma no la duplica (id único)",
  montarExtension(EXTENSION_INGENIERO_SENIOR).ok === false &&
  extensionesMontadas().filter((e) => e.id === EXTENSION_INGENIERO_SENIOR.id).length === 1);

console.log(`\n═══ INGENIERO SENIOR + TRANSMUTACIÓN BINARIA v1.24.0: ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log("  ·", f);
}
process.exit(fallos.length ? 1 : 0);
