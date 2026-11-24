/**
 * ttsErrores.test.ts — LA VENTANA DE VOZ, DOMESTICADA (v1.13.0)
 * ============================================================
 * QUÉ ES: la suite del clasificador de errores de voz (`server/ttsErrores.ts`) y
 * del aviso que ve el usuario (`src/utils/voz.ts`).
 * PARA QUÉ SIRVE: para que no vuelva a aparecer el cartel que se comía la pantalla.
 * El caso real que lo motivó está aquí dentro, copiado tal cual: cuando la cuota de
 * Gemini se agota, el SDK lanza un error cuyo mensaje es el **JSON entero de Google**
 * —código 429, enlaces, cuotas, `retryDelay`— y eso acababa pintado en el banner de
 * la interfaz, encima de la conversación.
 *
 * LO QUE SE EXIGE, EN UNA FRASE
 * Al usuario, la causa en una frase corta; el volcado técnico, al registro; y si el
 * fallo es de cuota o de clave, NO se insiste (insistir no arregla nada y repetía el
 * cartel en cada mensaje).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clasificarErrorTTS, recortarDetalle } from "../server/ttsErrores";
import { acortarMotivo, avisoDeVozNoDisponible, reforzarWav, reforzarWavBase64, REFUERZO_VOZ, trocearParaVoz } from "../src/utils/voz";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}

// El error REAL del 429, tal y como llega del SDK de Gemini (recortado al mensaje).
const JSON_CUOTA_REAL = JSON.stringify({
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
            quotaValue: "3",
          },
        ],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "19s" },
    ],
  },
});

// ═══ 1 · LA CLASIFICACIÓN ══════════════════════════════════════════════════
console.log("\n1) Traducir el error\n");

const cuota = clasificarErrorTTS(new Error(JSON_CUOTA_REAL));
comprobar("★ el 429 real se clasifica como cuota", cuota.clase === "cuota", cuota.clase);
comprobar("★ con una frase de una línea, sin JSON", cuota.motivo.length < 120 && !cuota.motivo.includes("{"), cuota.motivo);
comprobar("★ y NO se reintenta (insistir no arregla la cuota)", cuota.reintentable === false);
comprobar("la frase dice qué pasó, no un código", /cuota/i.test(cuota.motivo) && !/\b429\b/.test(cuota.motivo), cuota.motivo);

const clave = clasificarErrorTTS(new Error("API_KEY_INVALID: API key not valid"));
comprobar("★ clave inválida se reconoce y no se reintenta", clave.clase === "clave" && clave.reintentable === false, clave.motivo);
comprobar("un 401 también es clave", clasificarErrorTTS({ status: 401 }).clase === "clave");
comprobar("un 403 también es clave", clasificarErrorTTS("403 PERMISSION_DENIED").clase === "clave");

const sinAudio = clasificarErrorTTS(new Error("la respuesta no trajo audio (vino texto)."));
comprobar("★ «vino texto en vez de audio» SÍ se reintenta (es un fallo pasajero)", sinAudio.clase === "sin_audio" && sinAudio.reintentable === true);

const red = clasificarErrorTTS(new Error("fetch failed"));
comprobar("★ un fallo de red se reintenta y se dice como red", red.clase === "red" && red.reintentable === true, red.motivo);
comprobar("un timeout también es red", clasificarErrorTTS("ETIMEDOUT").clase === "red");

const otro = clasificarErrorTTS(new Error("algo raro pasó"));
comprobar("lo desconocido no se disfraza: clase «otro»", otro.clase === "otro" && otro.reintentable === true);
comprobar("y sin error también contesta algo (nunca undefined)", clasificarErrorTTS(undefined).motivo.length > 5);

// ═══ 2 · EL DETALLE VA AL REGISTRO, RECORTADO ══════════════════════════════
console.log("\n2) El volcado técnico no se tira: se recorta\n");

const detalle = recortarDetalle(new Error(JSON_CUOTA_REAL));
comprobar("★ el detalle se recorta (no caben mil caracteres)", detalle.length < 500, `${detalle.length} caracteres`);
comprobar("★ y dice cuánto se recortó (para saber que hay más)", /recortado de \d+ caracteres/.test(detalle));
comprobar("el detalle conserva lo útil: el código", detalle.includes("429"));

// ═══ 3 · EL AVISO QUE VE EL USUARIO ════════════════════════════════════════
console.log("\n3) El aviso de la interfaz\n");

const aviso = avisoDeVozNoDisponible("Gacrux", cuota.motivo);
comprobar("★ el aviso es UNA línea corta (antes eran mil caracteres)", aviso.length < 220, `${aviso.length} caracteres`);
comprobar("★ dice la voz elegida", aviso.includes("Gacrux"));
comprobar("★ dice la causa", /cuota/i.test(aviso));
comprobar("★ y dice qué se hace mientras (voz del navegador)", /voz del navegador/.test(aviso));
comprobar("★ con el JSON crudo como motivo, el aviso sigue siendo corto", (() => {
  const malo = avisoDeVozNoDisponible("Kore", JSON_CUOTA_REAL);
  return malo.length < 260 && !malo.includes("googleapis.com");
})(), String(avisoDeVozNoDisponible("Kore", JSON_CUOTA_REAL).length));

comprobar("acortarMotivo recorta a 160 por defecto", acortarMotivo("x".repeat(500)).length <= 161);
comprobar("acortarMotivo marca el corte con puntos suspensivos", acortarMotivo("x".repeat(500)).endsWith("…"));
comprobar("acortarMotivo aguanta un motivo vacío", acortarMotivo("").length > 0);
comprobar("acortarMotivo quita saltos de línea (no rompe el banner)", !acortarMotivo("a\n\nb\tc").includes("\n"));

// ═══ 4 · ENGANCHADO Y SIN INSISTIR ═════════════════════════════════════════
console.log("\n4) Enganchado: servidor, cliente y espera\n");

const servidor = leer("server.ts") + "\n" + leer("server/routers/geminiTts.ts"); // v1.62.0 — el dominio TTS se extrajo del monolito a su router
const iRuta = servidor.indexOf('"/api/tts/gemini"');
// El cuerpo se acota con la RUTA SIGUIENTE, no con un número de caracteres.
// Mi primera versión usaba una ventana de 2200 y las comprobaciones del final de la
// ruta quedaban fuera: fallaban por longitud, no por contenido. Es el mismo error
// que cometí con el endpoint del puente — y por eso aquí queda escrito.
const iFinRuta = servidor.indexOf("\n  app.", iRuta + 20);
const cuerpoRuta = servidor.slice(iRuta, iFinRuta > iRuta ? iFinRuta : iRuta + 4000);
comprobar("el servidor clasifica el error antes de contestar", /clasificarErrorTTS\(err\)/.test(cuerpoRuta));
comprobar("★ y NO insiste cuando el fallo no es pasajero", /if \(!ultimo\.reintentable\) break;/.test(cuerpoRuta));
comprobar("★ la respuesta lleva clase, motivo corto y detalle", /clase: ultimo\.clase/.test(cuerpoRuta) && /motivo: ultimo\.motivo/.test(cuerpoRuta) && /detalle: recortarDetalle/.test(cuerpoRuta));
comprobar("ya no devuelve el mensaje del SDK tal cual", !/motivo: `Gemini TTS falló tras 3 intentos: \$\{String\(lastErr/.test(servidor));

const chat = leer("src/components/ChatCenter.tsx");
comprobar("★ el cliente pinta el aviso corto, no el motivo crudo", /setTtsAviso\(avisoDeVozNoDisponible\(voice, motivo\)\)/.test(chat));
comprobar("★ y manda el detalle al registro", /console\.warn\(`\[Voz\] detalle técnico/.test(chat));
comprobar("★ hay espera tras cuota/clave (no se insiste en cada mensaje)", /VOZ_EN_ESPERA_MS = 5 \* 60_000/.test(chat) && /vozEnEsperaHastaRef\.current = Date\.now\(\) \+ VOZ_EN_ESPERA_MS/.test(chat));
// v1.84.2 — la valla vigila LA RUTA (si Gemini está en espera, la voz del
// navegador es el destino final), no la literalidad del primer argumento: los
// dos botones de voz («Escuchar» crudo y «Solo final» resumen) se distinguen
// por la CLAVE del id (`msg` tal cual o `{ ...msg, id: clave }`). Se acepta la
// forma con shim, se seguiría poniendo roja si desaparece la llamada al
// navegador o si se corta la guarda `!enEsperaVoz`.
comprobar("★ en espera, se va directo a la voz del navegador", /const esGemini = esVozGemini\(ttsVoice\);/.test(chat) && /if \(esGemini && !enEsperaVoz\)/.test(chat) && /hablarConNavegador\((msg|\{ \.\.\.msg, id: clave \}), text\);/.test(chat));
comprobar("★ y el aviso no se repite en cada mensaje (se mantiene, no se recrea)", /if \(!enEsperaVoz\) setTtsAviso\(null\);/.test(chat));
comprobar("el aviso sigue siendo un banner cerrable (no un modal)", /title="Cerrar aviso"/.test(chat));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("ttsErrores.test.ts"));

// ─── El refuerzo de volumen (v1.56.8) ───────────────────────────────────────
console.log("\n[Refuerzo] «sube la voz al doble»: se comprueba sobre la ONDA, porque");
console.log("           `volume` del navegador ya está en su máximo (1.0).\n");
{
  const armarWav = (muestras: number[]) => {
    const n = muestras.length, bytes = 44 + n * 2, b = new Uint8Array(bytes), dv = new DataView(b.buffer);
    const tag = (o: number, s: string) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    tag(0, "RIFF"); dv.setUint32(4, bytes - 8, true); tag(8, "WAVE"); tag(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 24000, true); dv.setUint32(28, 48000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    tag(36, "data"); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.round(muestras[i] * 32767), true);
    return b;
  };
  const rms = (u: Uint8Array) => {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let s = 0, k = 0;
    for (let i = 44; i + 1 < u.length; i += 2) { const x = dv.getInt16(i, true) / 32768; s += x * x; k++; }
    return Math.sqrt(s / k);
  };
  const pico = (u: Uint8Array) => {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let p = 0;
    for (let i = 44; i + 1 < u.length; i += 2) p = Math.max(p, Math.abs(dv.getInt16(i, true)));
    return p / 32768;
  };
  const vozBaja = armarWav(Array.from({ length: 2400 }, (_, i) => 0.12 * Math.sin(i * 0.05)));
  const r = reforzarWav(vozBaja, REFUERZO_VOZ);

  comprobar("el factor pedido es el doble", REFUERZO_VOZ === 2);
  comprobar("se aplica sobre un WAV PCM-16 normal", r.aplicado === true, r.motivo);
  const ganancia = rms(r.datos) / rms(vozBaja);
  comprobar(`★ la señal baja sube ~×2 de verdad (medido: ×${ganancia.toFixed(2)})`, ganancia > 1.85 && ganancia < 2.2);
  comprobar("★ y NO satura: el pico sigue dentro de rango", pico(r.datos) <= 1);
  comprobar("conserva el tamaño del fichero (no re-empaqueta)", r.datos.length === vozBaja.length);
  comprobar("★ no muta el búfer de entrada", rms(vozBaja) > 0 && rms(vozBaja) < 0.1);

  // Una voz ya al máximo no puede subir sin distorsionar: limita, no enmudece.
  const fuerte = armarWav(Array.from({ length: 2400 }, (_, i) => 0.97 * Math.sin(i * 0.05)));
  const rf = reforzarWav(fuerte, REFUERZO_VOZ);
  comprobar("★ con la señal ya alta, limita en vez de recortar a negro", pico(rf.datos) <= 1 && pico(rf.datos) > 0.9, `pico ${pico(rf.datos).toFixed(3)}`);

  // Lo que NO finge: formatos que no puede tocar.
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4, 5, 6, 7, 8]);
  const rm = reforzarWav(mp3);
  comprobar("★ un MP3 se RECHAZA con motivo, no se devuelve basura", rm.aplicado === false && /no es WAV/.test(rm.motivo));
  comprobar("y los datos devueltos son los mismos que entraron", rm.datos === mp3);
  const w24 = armarWav([0.1, 0.2, 0.3]);
  new DataView(w24.buffer).setUint16(34, 24, true);
  comprobar("PCM de 24 bits también se confiesa", reforzarWav(w24).aplicado === false);
  comprobar("vacío se confiesa", reforzarWav(new Uint8Array(0)).aplicado === false);

  // El camino real: base64, que es como lo manda el server.
  const b64 = Buffer.from(armarWav(Array.from({ length: 400 }, (_, i) => 0.1 * Math.sin(i * 0.1))).buffer).toString("base64");
  const rb = reforzarWavBase64(b64);
  comprobar("★ la variante base64 aplica y devuelve un WAV nuevo", rb.aplicado === true && rb.base64 !== b64, rb.motivo);
  const reDec = new Uint8Array(Buffer.from(rb.base64, "base64"));
  comprobar("y lo devuelto vuelve a ser RIFF/WAVE", String.fromCharCode(reDec[0], reDec[1], reDec[2], reDec[3]) === "RIFF");
  comprobar("un audio vacío no rompe: avisa", reforzarWavBase64("").aplicado === false);
  comprobar("una cadena basura no lanza excepción", reforzarWavBase64("no-es-base64!!!").aplicado === false);

  // El cable en las dos rutas de voz.
  const chat = leer("src/components/ChatCenter.tsx");
  comprobar("★ la ruta Gemini refuerza antes de reproducir", /reforzarWavBase64\(String\(data\.audioBase64/.test(chat));
  comprobar("★ si no se aplica, se AVISA en consola (no es un refuerzo mudo)", /refuerzo[^\n]*no aplicado/.test(chat));
  comprobar("la ruta del navegador fija volume=1 (y ahí no hay más margen)", /utter\.volume = 1;/.test(chat));

  // El fondo: la frecuencia baja tiene que aplicarse en AMBOS caminos, si no el
  // sonido "oficial" depende de si el navegador soporta Web Audio.
  const amb = leer("src/components/AudioAmbiente.tsx");
  comprobar("★ el ambiente baja de frecuencia", /FRECUENCIA_FONDO = 0\.9/.test(amb));
  comprobar("...en la ruta Web Audio", /src\.playbackRate\.value = FRECUENCIA_FONDO/.test(amb));
  comprobar("...y en el fallback <audio loop> también", /audioRef\.current\.playbackRate = FRECUENCIA_FONDO/.test(amb));
}

// ════════════════════════════════════════════════════════════════════════════
// v1.57.21 · «EL REPRODUCTOR SE CORTA» — TROCEAR PARA HABLAR ENTERO
// ════════════════════════════════════════════════════════════════════════════
{
  console.log("\n· v1.57.21: trocearParaVoz (Chrome corta el audio ~15 s)");

  const normal = (t: string) => t.replace(/\s+/g, " ").trim();

  comprobar("vacío → nada", trocearParaVoz("").length === 0 && trocearParaVoz("   \n  ").length === 0);
  comprobar("corto → un solo trozo idéntico", trocearParaVoz("Hola, mundo.").join(" ") === "Hola, mundo.");
  comprobar("los saltos de línea se normalizan a espacio", trocearParaVoz("una línea.\notra línea.").join(" ") === "una línea. otra línea.");

  // El texto del caso real: un informe largo, varias frases, alguna interminable.
  const largo =
    "Este es el primer párrafo del informe. Tiene varias frases y cada una debe entrar completa en algún trozo. " +
    "La segunda oración explica el pivote de proveedores: cuando la nube se cae, un modelo local termina el turno sin perder el hilo. " +
    "Y aquí va una frase deliberadamente larguísima sin ninguna coma que la parta en el sitio natural para forzar el corte por palabras y comprobar que el troceo no se traga ni un solo caracter del mensaje original por más que el tope sea pequeño y las oraciones se encadenen sin pausa. " +
    "Cierre corto.";
  const trozos = trocearParaVoz(largo, 180);
  comprobar("★ SIN PÉRDIDAS: unir los trozos reproduce el texto normalizado", trozos.join(" ") === normal(largo));
  comprobar("ningún trozo pasa del tope", trozos.every((t) => t.length <= 180), `máx=${Math.max(...trozos.map((t) => t.length))}`);
  comprobar("ningún trozo viene vacío ni con espacios sueltos", trozos.every((t) => t === t.trim() && t.length > 0));
  comprobar("el corte cae en frontera de palabra (no parte `caracter` por la mitad)", trozos.every((t) => !/\S{181}/.test(t)));

  // Fronteras de frase: la segunda oración empieza después del punto, no a mitad.
  const partes = trocearParaVoz("Uno. Dos. Tres.", 60);
  comprobar("respeta las frases cuando caben juntas", partes.length === 1 && partes[0] === "Uno. Dos. Tres.");
  const separadas = trocearParaVoz("Uno. Dos. Tres.", 5);
  comprobar("tope mínimo seguro: nunca menos de 20 caracteres", separadas.every((t) => t.length <= 24));

  // El corte por palabras de una frase larga no parte palabras salvo que la
  // palabra sola pase del tope.
  const sinEspacios = "a".repeat(400);
  const monstruo = trocearParaVoz(sinEspacios, 180);
  comprobar("una «palabra» más larga que el tope se parte dura, sin perder letras", monstruo.join("") === sinEspacios);

  // ── El cable en la interfaz y en el servidor ──
  const chat = leer("src/components/ChatCenter.tsx");
  comprobar("★ «Escuchar» habla por trozos de a lo sumo 180", /trocearParaVoz\(text, 180\)/.test(chat));
  comprobar("★ hay keep-alive pause/resume contra el bug de Chrome", /s\.pause\(\);[\s\S]{0,40}s\.resume\(\)/.test(chat));
  comprobar("★ el lote viejo no puede limpiar al nuevo (número de lote)", /vozLoteSeqRef\.current !== lote/.test(chat));
  comprobar("★ cortar la voz apaga el respirador", /pararKeepAliveVoz\(\);/.test(chat));
  comprobar("★ la voz manual de nube AVISA que ignora el tono (rama que faltaba)", /manual\.localService === false/.test(chat));
  comprobar("★ «Escuchar» con sonido silenciado explica por qué calla", /El interruptor general de sonido está en silencio/.test(chat));

  const servidor = leer("server.ts") + "\n" + leer("server/routers/geminiTts.ts"); // v1.62.0 — el dominio TTS se extrajo del monolito a su router
  comprobar("★ Gemini TTS recibe el texto SOLO (ya no lee la consigna en voz alta)", !servidor.includes("Lee en voz alta el siguiente texto"));
  comprobar("...y el parts del TTS es literal", /contents: \[\{ parts: \[\{ text \}\] \}\],/.test(servidor));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ VOZ SIN VENTANA (CN v1.13.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
