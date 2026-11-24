/**
 * unificadaCarga.test.ts — v1.94.1 · LA CARPETA 🧩 UNIFICADA TIENE QUE LLENARSE
 * =============================================================================
 * Queja de Mario (30/10): «los modelos unificados nunca cargan en el selector de
 * modelos». Medido en el árbol, eran TRES cerrojos puestos en serie:
 *
 *  1) `App` detectaba con un `useRef` levantado ANTES del intento: un intento por
 *     arranque. El endpoint unificado de Mario es un servidor local que suele nacer
 *     después de la IDE, así que el único intento fallaba y la carpeta quedaba vacía
 *     hasta el próximo reinicio.
 *  2) La sonda de catálogo pasaba por `fetchCloud`, que al fallar mete al ANFITRIÓN en
 *     cuarentena con backoff (ventana 12 min). Es decir: el fallo del arranque
 *     bloqueaba también el botón manual de «Cargar modelos».
 *  3) El error solo se escribía en la terminal; en el selector la carpeta seguía
 *     pareciendo vacía por falta de config.
 *
 * Esta valla congela los dos primeros (el tercero es de redacción de mensajes).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esDestinoLocal } from "../src/engine/guardaEgreso";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean) => { if (ok) { correctas++; console.log("  ✓ " + que); } else { fallidas++; console.log("  ✗ " + que); } };
const seccion = (t: string) => console.log("\n── " + t);

seccion("§1 · LA Sonda LOCAL no pasa por el fusible de la nube");
const modelos = leer("server/routers/modelos.ts");
c("el router importa esDestinoLocal", /import \{ esDestinoLocal \} from "\.\.\/\.\.\/src\/engine\/guardaEgreso"/.test(modelos));
c("★ el catálogo de un endpoint local NO usa fetchCloud (no abre cuarentena)", /if \(esDestinoLocal\(endpoint\)\)[\s\S]{0,900}?await fetch\(endpoint, \{ headers, signal: ctrl\.signal \}\)/.test(modelos));
c("y la nube real sigue pasando por el guardián de siempre (el plazo propio del catálogo no la saca de fetchCloud)", /r = await fetchCloud\(endpoint, \{ headers \}(?:, \{ plazoMs: PLAZO_CATALOGO_MS, catalogo: true \})?\);/.test(modelos));
c("el sondeo local tiene techo de tiempo (no queda colgado)", /setTimeout\(\(\) => ctrl\.abort\(\), 8000\)/.test(modelos));
c("★ si el endpoint no está arriba, el mensaje dice el tiempo de espera y que NO se sanciona la máquina", /no respondió en 8 s/.test(modelos) && /NO pone en cuarentena/.test(modelos));
c("la respuesta de fallo sale por la API, no solo por la terminal", /res\.status\(502\)\.json\(\{[\s\S]{0,260}error:/.test(modelos));

seccion("§2 · EL CERROJO DE UN SOLO INTENTO YA NO ESTÁ");
const app = leer("src/App.tsx");
c("★ desapareció el useRef que se levantaba antes de intentar", !/unificadaAutoDetectadaRef/.test(app));
// v1.95.2 · esta comprobación pedía el DÍGITO LITERAL en App.tsx. El tope se fue a
// `src/engine/estadoUnificada.ts` (`INTENTOS_UNIFICADA_TOPE`) para que el reintento
// automático y el mensaje que ve el usuario no discrepen del número — el mismo criterio
// que la casa usa con todo lo demás. Lo que la valla defiende no es el literal: es que
// HAYA un tope explícito, ≥3, y que App lo use. Se comprueba el valor en la fuente única.
c("hay reintentos contados con techo explícito", /const INTENTOS_UNIFICADA = (\d+|INTENTOS_UNIFICADA_TOPE)/.test(app) && Number(/const INTENTOS_UNIFICADA_TOPE = (\d+)/.exec(leer("src/engine/estadoUnificada.ts"))?.[1] ?? 0) >= 3);
c("los reintentos se frenan solos cuando la carpeta ya tiene modelos", /if \(detectedCustomModels\.length > 0\) return;/.test(app));
c("el intervalo crece entre intentos (no es un bucle cerrado a machacón)", /1200 \+ intentoUnificada \* 1500/.test(app));
c("el contador entra como dependencia, así que el efecto se re-arman tras un fallo", /\[customServerUrl, detectedCustomModels\.length, intentoUnificada, fetchCustomModels\]/.test(app));

seccion("§3 · EL FALSO POSITIVO: `esDestinoLocal` mide de verdad lo de Mario");
c("127.0.0.1:3001/v1 es local", esDestinoLocal("http://127.0.0.1:3001/v1/models") === true);
c("localhost:31415 es local", esDestinoLocal("http://localhost:31415/v1/models") === true);
c("openrouter.ai NO es local (ahí el fusible sí debe actuar)", esDestinoLocal("https://openrouter.ai/api/v1/models") === false);

console.log(`\n═══ unificadaCarga: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
