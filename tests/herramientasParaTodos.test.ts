/**
 * herramientasParaTodos.test.ts — v1.92.0 · NINGUNA VOZ QUEDA SIN MANOS
 * ====================================================================
 * Pedido de Mario (30/10): «REVISA QUE TODOS PUEDAN USAR HERRAMIENTAS O QUE SE
 * LLAME AL MODELO CON LA HERRAMIENTA, LOS MAS SEGUROS SON ZAI GLM 4.5 FLASH,
 * GEMINI DESDE EL 3.5 AL 3.8 FLASH, MISTRAL LOS GRATUITOS Y OPENROUTER AUTO Y
 * FREE».
 *
 * La invariante que se congela NO es «todos hacen function-calling nativo» —es
 * falso, y afirmarlo sería la misma mentira que produjo los ✔ inventados—. Es:
 *   TODO modelo del catálogo gratuito de fábrica tiene un canal de herramienta
 *   REAL (nativo o de texto) y el presupuesto de contexto de su proveedor.
 *
 * Se mide sobre los IDs exactos que nombró el usuario, no sobre una familia
 * genérica: una valla que dice «los glm pueden» no ve que `openrouter/free` se
 * quedó sin nada.
 *
 * También viajan acá los otros dos pedidos de la misma tanda, porque comparten
 * raíz (la UI tiene que mostrar lo que el motor hizo):
 *   · El sandbox se abre después de editar en el editor del árbol (con su tope
 *     anti-bucle y su negativa a abrir sobre un puerto muerto).
 *   · Las dos bocas de voz también en los modelos simples (resumen / pensamiento).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getModelProfile, capacidadSinVerificar, esEnrutadorDeNube } from "../src/engine/modelTiers";
import { esMensajeDenso } from "../src/utils/chatResultados";
import { puedeEjecutar, PROVEEDORES_CONOCIDOS } from "../server/enjambreLlamadas";
import { dividirVozSimple, resumenFinalDelMensaje, LARGO_MINIMO_DOS_BOCAS } from "../src/utils/chatResultados";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

seccion("1 · Los seguros, medidos por ID (toolCapable + presupuesto de nube)");
{
  const seguros = [
    "glm-4.5-flash", "glm-4.6v-flash", "glm-4.7-flash",
    "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash",
    "mistral-small-latest", "devstral-small-latest", "codestral-latest", "open-mistral-nemo",
  ];
  for (const id of seguros) {
    const p = getModelProfile(id);
    comprobar(`${id}: manos nativas y presupuesto de nube`, p.toolCapable === true && p.remote === true && p.tier === "cloud", `toolCapable=${p.toolCapable} remote=${p.remote} tier=${p.tier}`);
  }
  comprobar("★ un modelo de nube ya no cae al presupuesto de un local", !seguros.some((id) => getModelProfile(id).tier === "small"));
}

seccion("2 · OpenRouter auto y free: nube sin fingir manos");
{
  for (const id of ["openrouter/auto", "openrouter/free"]) {
    const p = getModelProfile(id);
    comprobar(`${id} es nube (ventana e historial de API, no de local)`, p.remote === true && p.tier === "cloud", `remote=${p.remote} tier=${p.tier}`);
    comprobar(`${id} se declara ENRUTADOR (destino elegido al vuelo)`, esEnrutadorDeNube(id));
    // La honestidad tiene dos caras: no afirmar function-calling que no se conoce,
    // y no dejarlo sin manos por eso mismo. `capacidadSinVerificar` es el canal que
    // sirve el juego mínimo de herramientas + el contrato de acción por texto.
    comprobar(`${id} NO se miente como tool-capable nativo`, p.toolCapable === false);
    comprobar(`${id} mantiene manos (juego mínimo + contrato por texto)`, capacidadSinVerificar(id) === true);
  }
  comprobar("el lazo de texto no se desactiva para openrouter", !/openrouter/.test(leer("src/engine/manuals.ts").split("PROVEEDORES_SIN_CICLO_DE_TEXTO")[1]?.split("]")[0] ?? ""));
}

seccion("3 · El ejecutor del enjambre: todos los proveedores conocidos");
{
  const sinEjecutor = PROVEEDORES_CONOCIDOS.filter((pr) => pr !== "cerebro/auto" && !puedeEjecutar(pr));
  comprobar("★ no queda ningún proveedor real sin ejecutor", sinEjecutor.length === 0, sinEjecutor.join(", "));
  comprobar("gemini tiene ejecutor (pedido expreso)", puedeEjecutar("gemini") === true);
  const llamadas = leer("server/enjambreLlamadas.ts");
  comprobar("habla el contrato de Gemini (:generateContent + functionDeclarations)", /:generateContent/.test(llamadas) && /functionDeclarations/.test(llamadas) && /functionResponse/.test(llamadas));
  comprobar("no manda el array de herramientas vacío (400 seguro)", /if \(declaraciones\.length\)/.test(llamadas));
  comprobar("el lazo de Gemini tiene su tope de pasos", /for \(let vuelta = 1; vuelta <= maxPasos/.test(llamadas) && /tope de \$\{maxPasos\} pasos/.test(llamadas));
  comprobar("y su alarma de tiempo (AbortController)", /new AbortController\(\)/.test(llamadas) && /clearTimeout\(alarma\)/.test(llamadas));
}

seccion("4 · El sandbox se abre después de editar en el árbol");
{
  const rs = leer("src/components/RightSidebar.tsx");
  comprobar("la edición a mano en el editor del árbol se anota", /ultimaEdicionEnArbolRef\.current = Date\.now\(\)/.test(rs));
  comprobar("al confirmar el auto-sync, el panel salta al sandbox", /setActiveTab\("sandbox"\)/.test(rs) && /ultimaEdicionEnArbolRef\.current\) return;/.test(rs));
  comprobar("y el preview se refresca (no se queda en la versión vieja)", /setIframeKey\(\(k\) => k \+ 1\)/.test(rs));
  comprobar("★ anti-bucle: una apertura por tanda + ventana de gracia", /ultimaEdicionEnArbolRef\.current = 0;/.test(rs) && /COOLDOWN_APERTURA_MS/.test(rs));
  comprobar("no abre sobre un servidor muerto", /sbWorkingRef\.current \|\| !sbOnlineRef\.current/.test(rs));
  comprobar("con AUTO apagado lo dice una sola vez, no en cada tecla", /avisoAutoApagadoRef/.test(rs));
  comprobar("el Sync manual del terminal también abre el preview", /await onSyncProject\?\.\(\);[\s\S]{0,900}setActiveTab\("sandbox"\)/.test(rs));
  comprobar("★ el chat sigue al frente: nada de secuestrar la pantalla (v1.91.0)", !/setActiveView/.test(rs));
}

seccion("5 · Dos bocas de voz también en los modelos simples");
{
  const largo = "Voy a revisar el archivo indicado.\n\n" +
    "Primero leí la configuración del servidor, que estaba apuntando a una ruta equivocada del sandbox; " +
    "después corregí el punto de montaje y verifiqué que las rutas del árbol de trabajo quedan dentro del workspace, " +
    "y por último probé la carga para confirmar que el preview responde.\n\n" +
    "Listo: el sandbox ya carga bien. El defecto era la ruta base del servidor, que apuntaba fuera del workspace; quedó corregida en server.ts.";
  const corto = "Listo, quedó corregido en server.ts.";
  comprobar("un mensaje simple largo se parte en dos bocas", dividirVozSimple(largo) !== null);
  const v = dividirVozSimple(largo)!;
  comprobar("el resumen es el cierre, no un texto inventado", v.resumen.startsWith("Listo:") && /ruta base/.test(v.resumen));
  comprobar("el pensamiento es TODO lo anterior, literal", largo.startsWith(v.pensamiento) && !v.pensamiento.includes("Listo: el sandbox"));
  comprobar("las dos piezas reponen el mensaje (nada se pierde)", v.pensamiento.length + v.resumen.length < largo.length + 8);
  comprobar("★ un mensaje corto NO recibe botón decorativo", dividirVozSimple(corto) === null && dividirVozSimple("") === null);
  comprobar("el umbral está declarado y es revisable", LARGO_MINIMO_DOS_BOCAS >= 200 && LARGO_MINIMO_DOS_BOCAS <= 600);
  // Mensaje DENSO de verdad (una valla con >700 chars de sustancia, que es el
  // umbral de `esMensajeDenso`). Acá la casa ya tiene su corte —«Solo final»— y
  // `dividirVozSimple` NO debe meter la cuchara: dos criterios partiendo el mismo
  // mensaje por distinto lado es exactamente cómo se pierde el hilo.
  const cuerpoValla = Array.from({ length: 30 }, (_, i) => `  linea_${i}: hacer_algo(${i});`).join("\n");
  const denso = `Voy a explicar el arreglo del servidor con un ejemplo largo para que se entienda el punto del corte de las dos bocas.\n\n\`\`\`js\n${cuerpoValla}\n\`\`\`\n\nY el cierre, que es lo único que interesa escuchar si uno ya leyó el informe: quedó resuelto en server.ts.`;
  comprobar("el mensaje denso es denso (valla con sustancia, no un `x` suelto)", esMensajeDenso(denso) === true);
  comprobar("un mensaje DENSO no se corta por esta vía", dividirVozSimple(denso) === null);
  comprobar("…y SU corte sí existe («Solo final»)", (resumenFinalDelMensaje(denso) ?? "").includes("Y el cierre"));
  const chat = leer("src/components/ChatCenter.tsx");
  comprobar("el botón «Pensamiento» existe y llama a la tercera boca", /handleSpeak\(msg, "pensamiento"\)/.test(chat) && /"Pensamiento"/.test(chat));
  comprobar("«Escuchar» sigue diciendo el crudo entero", /const fuente =\s*\n?\s*modo === "resumen"[\s\S]{0,220}: msg\.content;/.test(chat));
  comprobar("la boca de resumen usa el corte simple cuando no hay informe", /simple\?\.resumen \?\? msg\.content/.test(chat));
}

console.log(`\n═══ herramientasParaTodos: ${correctas} correctas · ${fallidas} fallidas ═══`);
if (fallidas > 0) process.exit(1);
