/**
 * tests/contratoAccion.test.ts — v1.67.0 · EL ESTÁNDAR QUE TODOS LOS MODELOS
 * PUEDEN USAR CON CERTEZA (HOJA DE RUTA-HUERFANOS, Priority 1 + la observación
 * de Mario: «la clave está en escribir en standard, o algo que todos sepan usar
 * con certeza»).
 *
 * QUÉ CURA, en términos de este test
 * ───────────────────────────────────
 * Había DOS defectos distintos y ambos eran de cable, no de inteligencia:
 *
 *  (A) ALIMENTACIÓN. `buildToolManualSection` se llamaba detrás de
 *      `if (herramientasV8.length > 0)`, y `getToolsForModel` devuelve `[]` si el
 *      perfil no es toolCapable. El modelo que actúa escribiendo la llamada en el
 *      texto no recibía ni el manual ni las leyes (viajaban dentro del manual).
 *
 *  (B) COHERENCIA. El motor ACEPTA seis formas y alias en español, pero no
 *      ENSEÑA ninguna. Seis formas posibles y ninguna dicha por delante es,
 *      literalmente, «cada IA interpreta a su manera».
 *
 * Por eso este test no se limita a «el bloque sale no-vacío». La aserción dura
 * es el VIAJE DE IDA Y VUELTA: todo lo que el contrato promete, el parser lo
 * cumple, medido contra `extraerLlamadasEnTexto` de verdad. Si alguien edita el
 * contrato para prometer un formato que el parser no reconoce —o edita el parser
 * y rompe lo que el contrato enseña—, esto se pone rojo. Un manual que se
 * desincroniza de su parser es peor que ningún manual: produce modelos que
 * fallan con confianza.
 *
 * Capa PURA: sin red, sin fs, sin modelo. Se corre con:
 *   npx tsx tests/contratoAccion.test.ts
 */

import {
  CONTRATO_DE_ACCION,
  buildContratoDeAccion,
  buildToolManualSection,
  TOOL_MANUALS,
  ENGINE_LAWS,
} from "../src/engine/manuals";
import {
  extraerLlamadasEnTexto,
  normalizarNombreHerramienta,
  normalizarArgsAlias,
  ALIAS_NOMBRE_HERRAMIENTA,
} from "../src/engine/cicloHerramientasOpenAICompat";
import { presupuestoAbordaje, charsDetalleDe } from "../src/engine/abordaje";

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function comprobar(desc: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(desc); console.log(`  \u2717 ${desc}`); }
}

const TODO = Object.keys(TOOL_MANUALS);

// ════════════════════════════════════════════════════════════════════════
console.log("\n1. DEFECTO SEMBRADO · el que no tiene canal nativo SÍ recibe contrato");
// ════════════════════════════════════════════════════════════════════════
{
  // Así llegaba un openrouter/free o un local chico (profile.toolCapable === false):
  const comoAntes = buildToolManualSection([]);
  comprobar("CONTROL DEL DEFECTO: la ruta vieja devolvía cadena vacía (sin manual Y sin leyes)", comoAntes === "");

  const ahora = buildContratoDeAccion({
    nombresNativos: [],
    nombresEjecutables: TODO,
    provider: "openrouter",
    presupuesto: 6000,
  });
  comprobar("ahora ese turno recibe el CONTRATO DE ACCIÓN", ahora.includes("CONTRATO DE ACCIÓN"));
  comprobar("…y recibe las LEYES COMPLETAS, no la primera oración recortada",
    ENGINE_LAWS.every((l) => ahora.includes(l.title)));
  comprobar("…y el inventario de lo que puede ejecutar", ahora.includes("write_file:") && ahora.includes("run_command:"));
  comprobar("…y se le dice por dónde llega la acción (canal de texto)", ahora.includes("Sin canal de funciones"));
  comprobar("…y la ruta relativa es obligatoria", ahora.includes('Rutas RELATIVAS') && ahora.includes("C:\\\\Users"));
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n2. CONTROL DE FALSO POSITIVO · no se promete una mano que el turno no tiene");
// ════════════════════════════════════════════════════════════════════════
{
  // `extraerLlamadasEnTexto` sólo se llama en el ciclo OpenAI-compat. En Ollama y
  // Gemini un turno sin herramientas NO ejecuta texto: ahí manda
  // `guardaSinHerramientas()` («di que no puedes»). Decirle al modelo «escribe y
  // el motor lo ejecuta» sería fabricar el fallo que Mario reporta: un modelo que
  // escribe la llamada, nadie la ejecuta, y él reporta «✔ creado».
  for (const prov of ["ollama", "gemini"]) {
    const b = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: prov, presupuesto: 4000 });
    comprobar(`sin canal nativo en "${prov === "ollama" ? "ollama" : "gemini"}" el contrato NO entra (no hay ejecutor de texto)`, b === "");
  }
  // Y con herramientas nativas, Ollama sí lo recibe: no se le excluye por proveedor.
  const ollamaConTools = buildContratoDeAccion({
    nombresNativos: ["write_file", "run_command"], nombresEjecutables: TODO, provider: "ollama", presupuesto: 4000,
  });
  comprobar("Ollama CON herramientas nativas sí recibe su contrato", ollamaConTools.includes("CANAL DE FUNCIONES"));
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n3. UN SOLO ESTÁNDAR · el mismo preámbulo para el canal nativo y para el de texto");
// ════════════════════════════════════════════════════════════════════════
{
  const nativos = ["write_file", "edit_file", "list_files", "run_tests"];
  const conNativo = buildContratoDeAccion({ nombresNativos: nativos, nombresEjecutables: TODO, provider: "zai", presupuesto: 6000 });
  const sinNativo = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: nativos, provider: "zai", presupuesto: 6000 });
  comprobar("ambos canales arrancan con el MISMO contrato (un estándar, no un dialecto por modelo)",
    conNativo.startsWith(CONTRATO_DE_ACCION.slice(0, 60)) &&
    sinNativo.startsWith(CONTRATO_DE_ACCION.slice(0, 60)));
  comprobar("el canal nativo conserva su inventario herramienta-por-herramienta (cero pérdida de lo que ya había)",
    nativos.every((n) => conNativo.includes(`${n}:`)));
  comprobar("y el inventario del canal de texto ALSO nombra las mismas herramientas",
    nativos.every((n) => sinNativo.includes(`${n}:`)));
  comprobar("la cláusula anti-mentira (punto 4) está en los dos canales",
    conNativo.includes("Si no recibiste resultado, NO la hiciste") &&
    sinNativo.includes("Si no recibiste resultado, NO la hiciste"));

  // Invariante que de verdad protege al usuario: con el presupuesto chico de la
  // nube rápida lo que se recorta es el INVENTARIO, nunca las reglas. El punto 4
  // («si no recibiste resultado, NO la hiciste») es la cláusula que impide el
  // «✔ creado» inventado; recortarla para ahorrar 600 caracteres es un cambio
  // perdedor, y por eso el estándar tiene un SUELO propio (1450) declarable.
  const chico = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: "groq", presupuesto: 800 });
  comprobar("con presupuesto 800 el estándar llega COMPLETO (reglas, formato, rutas y punto 4)",
    chico.includes("CONTRATO DE ACCIÓN") &&
    chico.includes("Rutas RELATIVAS") &&
    chico.includes("cerebronico:write_file") &&
    chico.includes("Si no recibiste resultado, NO la hiciste"));
  comprobar("…y si algo falta, se DECLARA con el aviso completo (nunca un corte a mitad)",
    !chico.includes("recortado") || /inventario recortado: \d+ de \d+\./.test(chico));
  comprobar("el bloque NUNCA muere truncado a mitad (cierra con punto o con aviso completo)",
    /[.\]]$/.test(chico.trim()) && !/—$|  $/.test(chico));
  for (const p of [800, 1300, 1900, 6000]) {
    const b = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: "groq", presupuesto: p });
    comprobar(`presupuesto ${p}: se respeta el techo (o el suelo del estándar, declarado)`,
      b.length <= Math.max(p, 1450) + 40);
  }
  // ── v1.0.31 · EL PRESUPUESTO NO ES UN LITERAL: SE DERIVA DEL CATÁLOGO ──────
  // Hasta v1.0.30 esta valla pedía el inventario completo a 6000, y con 30
  // manuales entraba. P1a añadió 16 (46 en total): el inventario completo pasó a
  // costar ~7,6k y el 6000 —que era el número correcto de otro catálogo— se puso
  // rojo. El rojo NO era del inventario ni del contrato: era del número, que
  // envejeció porque nadie lo ató a la lista de herramientas.
  // La valla ahora comprueba lo que de verdad importa y no envejece sola:
  //   (1) con el presupuesto que el MOTOR calcula para un modelo grande
  //       (`presupuestoAbordaje`, derivado del catálogo real) entran las 46;
  //   (2) con el de la nube rápida también (que es el caso que Mario usa);
  //   (3) con un presupuesto corto no se pierde nada EN SILENCIO: se declara.
  const detalleReal = charsDetalleDe(TODO, TODO.map((n) => ({ name: n })));
  const presGrande = presupuestoAbordaje({ tier: "grande" }, TODO.length, {
    longitudNombres: TODO.join("").length,
    charsDetalle: detalleReal,
  });
  const presRapida = presupuestoAbordaje({ nubeRapida: true }, TODO.length, {
    longitudNombres: TODO.join("").length,
    charsDetalle: detalleReal,
  });
  const grande = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: "groq", presupuesto: presGrande.recomendado });
  comprobar(`con el presupuesto que el motor DERIVA para un modelo grande (${presGrande.recomendado}) entra el inventario COMPLETO sin recorte`,
    grande.includes("run_command:") && grande.includes("terminal_abrir:") && !grande.includes("recortado"));
  const rapida = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: "groq", presupuesto: presRapida.recomendado });
  comprobar(`…y con el de la nube rápida (${presRapida.recomendado}) también, que es el turno real de Mario`,
    rapida.includes("run_command:") && !rapida.includes("recortado"));
  comprobar("el presupuesto derivado CRECE con el catálogo (no es el 6000 fijo que envejeció)",
    presGrande.recomendado > 6000 && presGrande.recomendado >= presGrande.suelo && presRapida.recomendado > 6000);
  const corto = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: "groq", presupuesto: 6000 });
  comprobar("a 6000 (corto para 46 manuales) el recorte se DECLARA con su cuenta, nunca en silencio",
    !corto.includes("recortado") || /inventario recortado: \d+ de 46\./.test(corto));
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n4. ★ VIAJE DE IDA Y VUELTA · el parser ejecuta EXACTAMENTE lo que el contrato enseña");
// ════════════════════════════════════════════════════════════════════════
{
  const ejemplos: Array<[string, string]> = [
    ["write_file", '{"path":"index.html","content":"<!doctype html>..."}'],
    ["list_files", "{}"],
    ["read_file", '{"path":"styles.css"}'],
    ["edit_file", '{"path":"styles.css","find":"color:#333","replace":"color:#06c"}'],
    ["run_command", '{"command":"npm run build"}'],
  ];
  const validos = new Set(ejemplos.map(([n]) => n));
  for (const [nombre, args] of ejemplos) {
    const texto = `Lo hago:\n\`\`\`cerebronico:${nombre}\n${args}\n\`\`\`\nListo.`;
    const r = extraerLlamadasEnTexto(texto, validos);
    const ok = r.llamadas.length === 1 && r.llamadas[0].name === nombre;
    comprobar(`el formato enseñado se parsea: cerebronico:${nombre}`, ok);
    if (ok) {
      try {
        const parsed = JSON.parse(r.llamadas[0].arguments);
        const esperado = JSON.parse ? null : null;
        comprobar(`…y sus claves llegan intactas (${nombre})`,
          JSON.stringify(parsed) === JSON.stringify(JSON.parse(args)));
      } catch {
        comprobar(`…y sus claves llegan intactas (${nombre})`, false);
      }
    }
    // El contrato no deja basura en la prosa que ve el usuario.
    comprobar(`…y la valla no se cuela como texto del modelo (${nombre})`, !r.textoLimpio.includes("cerebronico:"));
  }
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n5. EL CONTRATO NO PUEDE MENTIR · cada nombre y alias que promete existe en el motor");
// ════════════════════════════════════════════════════════════════════════
{
  const texto = CONTRATO_DE_ACCION;
  const mencionados = [...String(texto).matchAll(/cerebronico:([a-z_]+)/g)].map((m) => m[1]);
  comprobar("el contrato menciona herramientas", mencionados.length > 0);
  for (const n of mencionados) {
    comprobar(`"${n}" existe en TOOL_MANUALS (no se enseña un fantasma)`, !!TOOL_MANUALS[n]);
  }
  // Los alias en español que el punto 5 promete: verificados uno a uno contra el
  // resolutor real, no contra la buena intención del que escribió el texto.
  const paresEsp = [...String(texto).matchAll(/([a-z_]+)=([a-z_]+)/g)].map((m) => [m[1], m[2]]);
  const aliasPrometidos: Array<[string, string]> = [];
  for (const grupo of ["crear_archivo", "leer_archivo", "list_dir", "ls", "borrar_archivo", "ejecutar"]) {
    const destino = ALIAS_NOMBRE_HERRAMIENTA[grupo];
    if (destino) aliasPrometidos.push([grupo, destino]);
  }
  comprobar("el contrato promete alias que SÍ están en el motor", aliasPrometidos.length >= 5);
  for (const [alias, destino] of aliasPrometidos) {
    const resuelto = normalizarNombreHerramienta(alias, new Set(Object.keys(TOOL_MANUALS)));
    comprobar(`alias "${alias}" se resuelve a "${destino}"`, resuelto === destino);
    comprobar(`…y aparece citado en el contrato`, String(texto).includes(alias));
  }
  const campos = normalizarArgsAlias({ ruta: "a.html", contenido: "x", comando: "ls", buscar: "b", reemplazar: "c" });
  comprobar("los alias de CAMPO prometidos se traducen (ruta/contenido/comando/buscar/reemplazar)",
    campos.path === "a.html" && campos.content === "x" && campos.command === "ls" && campos.find === "b" && campos.replace === "c");
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n6. UN ESTÁNDAR, NO UN DIALECTO · el mismo texto para todos los proveedores");
// ════════════════════════════════════════════════════════════════════════
{
  const armados = ["zai", "groq", "openrouter", "custom", "mistral", "ollama"].map((p) =>
    buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: p, presupuesto: 6000 }));
  const nube = armados.slice(0, 4);
  comprobar("los proveedores OpenAI-compat reciben BYTE-A-BYTE el mismo contrato (un estándar, no nueve)",
    nube.every((s) => s === nube[0]) && nube[0].length > 0);
  // El vocabulario canónico es idéntico cambie o no el transporte.
  const conNativo = buildContratoDeAccion({ nombresNativos: TODO, nombresEjecutables: TODO, provider: "gemini", presupuesto: 200000 });
  const sinNativo = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: "groq", presupuesto: 200000 });
  const leyesDe = (s: string) => s.slice(s.indexOf("LEYES DEL MOTOR"), s.indexOf("HERRAMIENTAS"));
  comprobar("las leyes son las mismas palabras con canal nativo que con canal de texto",
    leyesDe(conNativo) === leyesDe(sinNativo) && leyesDe(conNativo).length > 100);
  // TECHO REAL del contrato: respeta el presupuesto pedido, o el SUELO del
  // estándar (1450) cuando el pedido es más chico — y ese desvío es declarado y
  // medido, no un desborde. A 900 pide la nube rápida; bajar de ahí recortaría la
  // cláusula 4, que es la que impide el «✔ creado» inventado. El techo duro sigue
  // siendo el techo: nunca se devuelve más que max(pedido, suelo).
  comprobar("el techo se respeta: nunca devuelve más de max(presupuesto, suelo del estándar)",
    ([800, 900, 1300, 1900, 6000] as number[]).every((p) => {
      const b = buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: TODO, provider: "groq", presupuesto: p });
      return b.length <= Math.max(p, 1450) + 40;
    }));
  comprobar("sin nombres que listar, el estándar igual llega (no es un bloque todo-o-nada)",
    buildContratoDeAccion({ nombresNativos: [], nombresEjecutables: [], provider: "groq" }).includes("CONTRATO DE ACCIÓN"));
}

if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  · " + f);
  console.log("\nSi el contrato promete algo que el parser ya no hace, el arreglo NO es");
  console.log("borrar la aserción: es alinear el estándar (manuals.ts) con el ejecutor");
  console.log("(cicloHerramientasOpenAICompat.ts). Los dos lados del mismo contrato.");
}
console.log(`\n—— contratoAccion: ${ok} correctas, ${mal} en rojo ——`);
if (mal > 0) process.exitCode = 1;
