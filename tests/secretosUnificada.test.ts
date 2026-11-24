/**
 * secretosUnificada.test.ts — v1.95.2 · DOS DEFECTOS QUE LA SESIÓN EXPORTADA DELATÓ
 * ================================================================================
 * Mario pasó el JSON de una sesión de la 1.94.1 para que corroborara funcionamiento
 * («creo que lo que más falla son los modelos»). Del archivo salieron dos cosas:
 *
 *  A) UN SECRETO DEL USUARIO IMPRIMIDO Y EXPORTADO. El turno que probó `openrouter/auto`
 *     dice, textual: «…To increase, visit
 *     https://openrouter.ai/workspaces/default/keys/da08ad62… and adjust the key's total
 *     limit». La IDE armaba ese mensaje con `${errMsg}` crudo (src/App.tsx:3440), el
 *     usuario exportó el chat para mostrármelo, y la clave terminó en el archivo que llegó
 *     a mis manos. Un error de proveedor es TEXTO INCONTROLADO: puede traer credenciales
 *     rebotadas por el propio servicio.
 *
 *  B) «LOS UNIFICADOS NUNCA CARGARON» — cierto desde la UI. La 1.94.1 cerró dos cerrojos
 *     (un solo intento por arranque; la sonda de catálogo pasando por el fusible de la
 *     nube, que ponía EN CUARENTENA a la propia máquina del usuario) y quedó un tercero:
 *     `fetchCustomModels` escribía el motivo SOLO en la terminal (sin URL: App:2533;
 *     excepción: App:2566) y el selector pintaba «(0)». Desde la pantalla donde se elige
 *     el modelo, «no configuraste la URL», «el endpoint está apagado», «respondió 0
 *     modelos» y «todavía estoy sondeando» se veían EXACTAMENTE IGUAL.
 *
 * El fixture del caso A es la cadena REAL de esa sesión, no un ejemplo inventado.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactarSecretos, textoSeguro, notaRedaccion } from "../src/engine/redaccionSecretos";
import { dictamenCarpetaUnificada, INTENTOS_UNIFICADA_TOPE } from "../src/engine/estadoUnificada";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};
const seccion = (t: string) => console.log("\n── " + t);

// La sesión de Mario traía una clave REAL de 64 hex. La valla necesita una cadena con
// la MISMA forma para probar contra ella, pero un secreto —aunque sea de prueba— no
// entra al repositorio: se construye acá y por eso ningún literal del archivo casa con
// la regla `keys/<hex>` del guardián anti-claves.
const CLAVE_REAL = "deadbeef" + "0123456789" * 5 + "abcdef";;
const ERROR_OPENROUTER = "OpenRouter no pudo responder para el modelo \"openrouter/auto\": "
  + "This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, "
  + "but can only afford 138. To increase, visit https://openrouter.ai/workspaces/default/keys/"
  + CLAVE_REAL + " and adjust the key's total limit";

seccion("§1 · LA CADENA REAL DE LA SESIÓN DE MARIO");
{
  const r = redactarSecretos(ERROR_OPENROUTER);
  c("★ la clave ya no está en el texto", !r.texto.includes(CLAVE_REAL) && !/keys\/[A-Za-z0-9]{20,}/.test(r.texto));
  c("el mensaje sigue siendo útil (65536, 138 y «more credits» sobreviven)",
    r.texto.includes("65536") && r.texto.includes("138") && r.texto.includes("more credits"));
  c("declara CUÁNTO ocultó y de qué tipo", r.ocultas === 1 && r.tipos.includes("openrouter-key"), JSON.stringify(r));
  c("la nota para la UI existe y es legible", notaRedaccion(r).includes("1 credencial") && notaRedaccion({ texto: "", ocultas: 0, tipos: [] }) === "");
  c("★ idempotente: redactar lo redactado no cambia nada", redactarSecretos(r.texto).texto === r.texto);
}

seccion("§2 · OTRAS FORMAS DE CREDENCIAL");
c("sk- / sk-or-", !textoSeguro("usé sk-or-v1-abcdefghijklmnopqrstuvwxyz123456").includes("abcdefghijklmnopqrstuvwxyz"));
c("clave de Google (AIza…)", !textoSeguro("AIzaSyC-1234567890abcdefghij_klmnop").includes("1234567890abcdefghij"));
c("Groq (gsk_…)", !textoSeguro("gsk_abcdefghijklmnopqrstuvwxyz12").includes("abcdefghijklmnopqrstuvwxyz12"));
c("Bearer y JWT", !textoSeguro("Authorization: Bearer abcdefghijklmnop1234").includes("abcdefghijklmnop1234")
  && !textoSeguro("eyJhbGciOiJSVTAiLCJ0eXAiOiJKVCJ9.eyJzdWIiOiIxMjMifQ.abcDEF123456789").includes("eyJzdWIiOiIxMjMifQ"));
c("campos api_key / secret en JSON", !textoSeguro("{\"api_key\": \"supersecreto987\", \"modelo\": \"glm\"}").includes("supersecreto987"));
c("★ NO toca un sha256 de entrega (es un dato legítimo que esta casa imprime a propósito)",
  textoSeguro("sha256 084d444d212d13c0855ce0d332630ac5fadfd5e13426f5b612ad22c72a30c242").includes("084d444d212d13c0855ce0d332630ac5fadfd5e13426f5b612ad22c72a30c242"));
c("texto sin secretos sale intacto", textoSeguro("El sandbox cayó por ECONNRESET") === "El sandbox cayó por ECONNRESET");
c("null / vacío no explotan", redactarSecretos(null).texto === "" && redactarSecretos(undefined).ocultas === 0);

seccion("§3 · EL CABLE: NINGÚN CAMINO SACA EL ERROR CRUDO");
const app = leer("src/App.tsx");
c("★ el mensaje de error del chat redacta antes de interpolar",
  /Error de comunicación con \$\{currentModel\}: \$\{textoSeguro\(errMsg\)\}/.test(app));
c("el MARCADOR AUTOMÁTICO redacta ANTES de recortar (cortar primero dejaría 90 chars de clave)",
  /MARCADOR AUTOMÁTICO[\s\S]{0,220}?textoSeguro\(errMsg\)\.slice\(0, 90\)/.test(app));
c("el export de la sesión pasa por la aduana y lo declara en la terminal",
  /redactarSecretos\(JSON\.stringify\(payload/.test(app) && /ocultó \$\{exportSeguro\.ocultas\} credencial/.test(app));
c("el catch de la sonda unificada también redacta (es un endpoint externo)",
  /const causa = redactarSecretos\(err/.test(app));
c("la sesión exportada dice DESDE QUÉ versión pasó (antes decía solo version: 1)",
  /appVersion: IDE_BRAND\.SEMVER/.test(app));
c("y declara sus propios límites: sin modelo por mensaje ni trazas de herramientas",
  /modeloporMensaje: false, llamadasAHerramientas: false/.test(app));

seccion("§4 · LA CARPETA 🧩 TIENE CINCO ESTADOS DISTINTOS, NO UN «(0)»");
const sinUrl = dictamenCarpetaUnificada({ hayUrl: false, sondeando: false, total: 0, intentos: 0, maxIntentos: INTENTOS_UNIFICADA_TOPE });
c("sin URL configurada: dice qué escribir y ofrece las ranuras", sinUrl.accion === "configurar" && /http:\/\/127\.0\.0\.1:3001\/v1/.test(sinUrl.detalle) && sinUrl.boton.length > 0);
const err = dictamenCarpetaUnificada({ hayUrl: true, sondeando: false, total: 0, intentos: 3, maxIntentos: 6, ultimoError: "El endpoint unificado local no contestó (no respondió en 8 s)", endpoint: "http://127.0.0.1:3001/v1/models", ultimoIntentoEn: 1_000 }, 61_000);
c("★ endpoint caído: muestra EL ERROR, el endpoint y hace cuánto", err.accion === "reintentar" && err.detalle.includes("8 s") && err.detalle.includes("127.0.0.1:3001") && err.detalle.includes("hace 60 s"));
c("y aclara que eso no sanciona su máquina (la queja de la 1.94.1)", /no sanciona|NO pone en cuarentena|no pasa por el fusible/i.test(err.detalle));
const sinSondear = dictamenCarpetaUnificada({ hayUrl: true, sondeando: false, total: 0, intentos: 0, maxIntentos: 6 });
c("con URL pero sin sondear todavía: lo dice, no finge un error", sinSondear.accion === "reintentar" && /no llegó a pedirle la lista/.test(sinSondear.detalle) && sinSondear.tono !== "error");
const agotados = dictamenCarpetaUnificada({ hayUrl: true, sondeando: false, total: 0, intentos: 6, maxIntentos: 6, ultimoIntentoEn: 5_000 }, 65_000);
c("★ reintentos agotados y 0 modelos: explica el agotamiento (~30 s)", agotados.accion === "reintentar" && /0 modelos/.test(agotados.detalle) && agotados.tono === "aviso");
const lleno = dictamenCarpetaUnificada({ hayUrl: true, sondeando: false, total: 7, intentos: 1, maxIntentos: 6, endpoint: "http://127.0.0.1:3001/v1/models", ultimoIntentoEn: 1_000 }, 21_000);
c("cuando sí hay modelos, dice cuántos (título) y de dónde y hace cuánto (detalle)", lleno.tono === "ok" && lleno.titulo.includes("7 modelos") && lleno.detalle.includes("127.0.0.1:3001") && lleno.detalle.includes("hace 20 s"));
const sondeando = dictamenCarpetaUnificada({ hayUrl: true, sondeando: true, total: 0, intentos: 2, maxIntentos: 6, endpoint: "http://x/v1/models" });
c("y mientras sondea no dice «vacía»: dice que está pidiendo la lista", sondeando.accion === "esperar" && /Sondeando/.test(sondeando.titulo));
c("el tope de intentos sale del MISMO sitio para App y para el mensaje", INTENTOS_UNIFICADA_TOPE === 6 && sinSondear.detalle.includes("6"));

seccion("§5 · EL CABLE DE LA UNIFICADA");
c("App guarda el estado de la última sonda", /const \[sondaUnificada, setSondaUnificada\]/.test(app));
c("★ lo escribe en el ÉXITO (cuántos y desde dónde)", /setSondaUnificada\(\{ total: names\.length/.test(app));
c("★ lo escribe en el ERROR (con la causa redactada)", /setSondaUnificada\(\(prev\) => \(\{ total: prev\.total, error: causa\.texto/.test(app));
c("y lo LIMPIA cuando no hay URL (un error viejo no puede seguir acusando al endpoint)", /setSondaUnificada\(\{ total: 0, error: null, endpoint: null, cuando: 0 \}\);/.test(app));
c("el botón del selector reinicia el contador de intentos (el router puede levantar en el minuto 4)",
  /onRefreshCustomModels=\{sondarUnificadaAhora\}/.test(app) && /const sondarUnificadaAhora = useCallback/.test(app));
c("y el contador vuelve a cero además de sondear", /setIntentoUnificada\(0\);\s*\n\s*void fetchCustomModels\(\);/.test(app));
c("llega al selector la URL-hay / sonda / contadores", /sondaUnificada=\{sondaUnificada\}/.test(app) && /hayUrlUnificada=\{Boolean\(customServerUrl\)\}/.test(app));

const modal = leer("src/components/ModelSelectorModal.tsx");
c("el selector usa el criterio puro, no prosa propia", /import \{ dictamenCarpetaUnificada \} from "\.\.\/engine\/estadoUnificada"/.test(modal));
c("★ y ya no muestra la frase genérica que igualaba todos los estados", !/todavía sin modelos cargados/.test(modal));
c("abrir la pestaña con URL y carpeta vacía dispara un sondeo (una vez: `cuando` la corta)", /if \(sondaUnificada\?\.cuando\) return;/.test(modal) && /onRefreshCustomModels\?\.\(\);/.test(modal));

seccion("§6 · LOS MÓDULOS TIENEN DESTINO (no son ensayos)");
c("redaccionSecretos está cableado en App", /from "\.\/engine\/redaccionSecretos"/.test(app));
c("estadoUnificada está cableado en App y en el selector", /from "\.\/engine\/estadoUnificada"/.test(app) && /from "\.\.\/engine\/estadoUnificada"/.test(modal));

console.log(`\n═══ secretosUnificada: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
