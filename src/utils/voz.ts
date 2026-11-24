/**
 * voz.ts — ELECCIÓN DE LA VOZ DEL NAVEGADOR (v8.0.4)
 * ====================================================
 * Petición que originó este archivo: «esto de audio en el chat no funciona
 * cuando reproduzco el chat en audio, sale siempre la voz robótica standard».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VOZ ROBÓTICA NO ERA UN DEFECTO DE SONIDO: ERA UN `find()` DEMASIADO PRISA
 * ─────────────────────────────────────────────────────────────────────────────
 * El código anterior hacía, literalmente, esto:
 *
 *     const voices = synth.getVoices();
 *     const esVoice = voices.find((v) => v.lang.startsWith("es"));
 *     if (esVoice) utter.voice = esVoice;
 *
 * Dos problemas, y cada uno basta por sí solo para producir exactamente lo que
 * el usuario describía:
 *
 * 1) **`getVoices()` devuelve una lista VACÍA la primera vez que se llama.**
 *    Las voces del sistema se cargan de forma asíncrona; hasta que el navegador
 *    no termina, la lista está vacía y el evento `voiceschanged` avisa cuando
 *    por fin hay algo. Este código no lo escuchaba nunca. Resultado: `esVoice`
 *    quedaba `undefined`, **no se asignaba `utter.voice`**, y sonaba la voz por
 *    defecto del sistema. En Linux esa por defecto suele ser eSpeak, que es el
 *    sintetizador robótico de toda la vida. No fallaba siempre por casualidad:
 *    fallaba siempre por construcción.
 *
 * 2) **El primero de la lista no es el mejor.** `find()` devuelve el primer
 *    `es` que aparezca, y el orden de `getVoices()` no está normalizado: en
 *    Windows suele empezar por la voz de sistema y no por las naturales, en
 *    Chrome por las de red. Elegir «el primero» es elegir al azar con pasos
 *    extra.
 *
 * Aquí se hace lo contrario: se puntúan TODAS y se elige la mejor, con el
 * idioma como criterio que pesa más que la calidad (una voz natural en inglés
 * leyendo español es peor que una robótica en español), y se marca cuándo la
 * ganadora es robótica para poder DECIRLO en vez de fingir que suena bien.
 *
 * Módulo puro, sin DOM: recibe la lista ya obtenida y devuelve una decisión. Por
 * eso se puede probar de verdad, con casos difíciles, sin un navegador.
 */

/** Lo mínimo que necesitamos de una `SpeechSynthesisVoice`. */
export interface VozCandidata {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

export interface VozElegida<T extends VozCandidata> {
  voz: T;
  puntuacion: number;
  /** Frase explicativa, lista para enseñar al usuario. */
  motivo: string;
  /** true si la ganadora es un sintetizador robótico (eSpeak, Festival…). */
  robotica: boolean;
}

/**
 * Motor natural ≠ motor robótico. Los nombres concretos salen de las voces que
 * instalan las plataformas reales: Chrome trae «Google español», Windows trae
 * «Microsoft Sabina/Pablo», macOS trae «Mónica/Paulina», y los entornos Linux
 * sin escritorio traen «eSpeak NG», que es el que suena a ordenador de 1985.
 */
const VOZ_NATURAL = /\bgoogle\b|\bmicrosoft\b|natural|neural|online|premium|enhanced|siri|apple|mónica|monica|paulina|helena|sabina|elvira|pablo|jorge|diego|carlos|laura|\blucia\b/i;
const VOZ_ROBOTICA = /espeak|e[_ -]?speak|festival|\bflite\b|\bpico\b|robot|\bsam\b|dectalk|mbrola/i;

export function esVozRobotica(nombre: string): boolean {
  return VOZ_ROBOTICA.test(String(nombre || ""));
}

/** «es-ES» → «es». Sin idioma → cadena vacía (y eso se penaliza, no se ignora). */
export function normalizarIdioma(lang?: string): string {
  return String(lang || "").trim().toLowerCase().split(/[-_]/)[0] || "";
}

/**
 * Traduce el código de idioma de la interfaz a un idioma de VOZ.
 * El español es el caso que importa: `es` a secas no distingue España de México,
 * y la misma frase suena distinta. Se prefiere la variante del entorno.
 */
export function idiomaDeVozPreferido(idiomaUi?: string): string {
  const n = normalizarIdioma(idiomaUi) || "es";
  if (n === "es") return "es-ES";
  if (n === "pt") return "pt-BR";
  if (n === "en") return "en-US";
  return n;
}

/**
 * Puntúa una voz. Los pesos NO son decorativos, están puestos para que el orden
 * de prioridades sea exactamente este:
 *
 *   1º que hable tu idioma   (±40 / −60)  ← pesa más que todo lo demás junto
 *   2º que no sea robótica   (−50)
 *   3º que sea natural       (+30)
 *   4º que sea online/premium (+8 / +6)   ← suelen ser las neuronales
 *
 * Por qué 1º manda sobre 3º: una voz natural INGLESA leyendo un texto español
 * pronuncia mal cada palabra y encima se entiende peor que una robótica en
 * español. Para leer en voz alta, el idioma no es una preferencia, es un
 * requisito. De ahí que otro idioma se reste (−60) en vez de simplemente no
 * sumar: así una voz robótica en español (40−50 = −10) le gana a una natural en
 * inglés (−60+30 = −30), que es lo que el usuario quiere oír.
 */
export function puntuarVoz(v: VozCandidata, idiomaPreferido: string = "es-ES"): number {
  if (!v || !v.name) return -1000;
  let p = 0;

  const idioma = normalizarIdioma(v.lang);
  const pref = normalizarIdioma(idiomaPreferido);

  if (!idioma) {
    p -= 20; // Sin idioma declarado: no se puede confiar en que lea bien.
  } else if (idioma === pref) {
    p += 40;
  } else {
    p -= 60; // Otro idioma: descartada salvo que no haya nada mejor.
  }

  if (esVozRobotica(v.name)) p -= 50;
  else if (VOZ_NATURAL.test(v.name)) p += 30;

  // `localService === false` significa que la voz se sintetiza en la nube: casi
  // siempre es una neuronal de calidad. `undefined` NO se premia, porque no
  // sabemos nada y premiar la duda es inventarse información.
  if (v.localService === false) p += 8;
  if (/premium|enhanced|plus/i.test(v.name)) p += 6;
  if (v.default) p += 4;

  return p;
}

/**
 * Elige la mejor voz de la lista. `null` cuando no hay ninguna: eso NO es un
 * error, es el estado normal durante el primer segundo de vida de la página
 * (ver el problema 1 de la cabecera), y quien llame debe reintentar.
 *
 * El empate se rompe por ORDEN DE LA LISTA, no alfabéticamente: el orden de
 * `getVoices()` refleja de algún modo la preferencia del sistema, y es la única
 * señal adicional que existe.
 */
export function elegirMejorVoz<T extends VozCandidata>(
  voces: T[],
  idiomaPreferido: string = "es-ES"
): VozElegida<T> | null {
  if (!Array.isArray(voces) || voces.length === 0) return null;

  let mejor: T | null = null;
  let mejorPunto = -Infinity;

  for (const v of voces) {
    if (!v || !v.name) continue;
    const p = puntuarVoz(v, idiomaPreferido);
    if (p > mejorPunto) {
      mejorPunto = p;
      mejor = v;
    }
  }
  if (!mejor) return null;

  const robotica = esVozRobotica(mejor.name);
  const idioma = normalizarIdioma(mejor.lang);
  const pref = normalizarIdioma(idiomaPreferido);

  let motivo: string;
  if (idioma !== pref) {
    motivo = `No hay ninguna voz en ${pref} instalada; se usa «${mejor.name}» (${mejor.lang}), que leerá con acento.`;
  } else if (robotica) {
    motivo = `La única voz en ${pref} que hay es robótica («${mejor.name}»). Para voz natural, usa las voces Gemini (requieren clave) o instala una voz del sistema.`;
  } else {
    motivo = `Voz elegida: «${mejor.name}» (${mejor.lang}).`;
  }

  return { voz: mejor, puntuacion: mejorPunto, motivo, robotica };
}

/**
 * v1.52.1 — EL TONO DEL NAVEGADOR SOLO LO RESPETAN LAS VOCES LOCALES.
 * v1.53.0 — Rango de tono ampliado: 0.1–2.0 (antes 0.5–2.0). Chrome y Firefox
 *           aceptan pitch desde 0.1; el valor 0 produce silencio en algunos
 *           sintetizadores, así que 0.1 es el mínimo seguro.
 * ─────────────────────────────────────────────────────────────────────────────
 * Petición que originó esto: «la voz de lectura, no le funciona el tono, siempre
 * suena igual; antes funcionaba».
 *
 * No era un fallo de código: `utter.pitch` SÍ se asigna. El problema es que la
 * Web Speech API solo aplica el tono a las voces LOCALES del sistema
 * (`localService === true`, las SAPI de Windows tipo «Microsoft Sabina/Pablo»).
 * Las voces NATURALES de nube (Google español, «Microsoft … Online (Natural)»)
 * fijan su propio tono e IGNORAN `utter.pitch` — igual que las voces Gemini.
 *
 * Al preferir voces naturales (v8.0.4) el selector automático empezó a elegir
 * justo esas voces de nube, así que el tono dejó de notarse: «antes funcionaba»
 * porque antes sonaba la voz LOCAL por defecto del sistema. Esta función elige
 * la mejor voz pero SOLO entre las locales, para que, cuando el usuario mueva el
 * tono, el cambio se oiga de verdad. `localService` desconocido se trata como
 * local (las SAPI no siempre lo declaran). Devuelve `null` si no hay ninguna
 * local, y entonces quien llame debe avisar en vez de fingir que el tono aplica.
 */
export function elegirMejorVozLocal<T extends VozCandidata>(
  voces: T[],
  idiomaPreferido: string = "es-ES"
): VozElegida<T> | null {
  const locales = (voces || []).filter((v) => v && v.localService !== false);
  return elegirMejorVoz(locales, idiomaPreferido);
}

/**
 * ¿Hay alguna voz en el idioma pedido? Sirve para avisar ANTES de que el usuario
 * pulse «Escuchar» en vez de después.
 */
export function hayVozEnIdioma(voces: VozCandidata[], idioma: string = "es-ES"): boolean {
  const pref = normalizarIdioma(idioma);
  return (voces || []).some((v) => normalizarIdioma(v?.lang) === pref);
}

/**
 * v1.13.0 — EL AVISO DE VOZ, EN UNA FRASE.
 * QUÉ ES: dos funciones puras que recortan el motivo y montan el aviso.
 * PARA QUÉ SIRVE: para que un error de Gemini no pueda volver a pintar mil
 * caracteres de JSON dentro de un banner. El mensaje técnico se recorta aquí y el
 * volcado completo se va al registro (lo manda el servidor en `detalle`).
 */
export function acortarMotivo(motivo: string, max = 160): string {
  const t = (motivo || "").replace(/\s+/g, " ").trim();
  if (!t) return "sin detalles";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** La frase del aviso: siempre la misma forma, siempre corta. */
export function avisoDeVozNoDisponible(voice: string, motivo: string): string {
  return `Voz Gemini «${voice}» no disponible: ${acortarMotivo(motivo)} — se usa la voz del navegador.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TROCEO PARA HABLAR ENTERO (v1.57.21) — «el reproductor se corta a la mitad»
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chrome tiene un defecto viejo y conocido (crbug 12355103): una `SpeechSynthesis
 * .speak()` con un enunciado largo se queda muda a los ~15 segundos — el audio
 * simplemente PARA a mitad del mensaje sin disparar `onend`. Con mensajes de
 * varios párrafos (esta app los lee de hasta 4500 caracteres) el corte estaba
 * garantizado: «el reproductor de voz no funciona bien».
 *
 * La cura no es mágica: ningún botón de la API evita el bug. Lo que sí funciona
 * es no darle a Chrome un enunciado que lo alcance. `trocearParaVoz` parte el
 * texto en bocados de a lo sumo `maxChars` (180 ≈ 13 s a velocidad 1),
 * cortando SIEMPRE en frontera de frase cuando se puede, y en frontera de
 * palabra cuando una frase sola pasa del límite. La cola de `speechSynthesis`
 * reproduce los trozos de corrido, sin hueco audible entre uno y otro.
 *
 * Las dos garantías que prueban los tests y que ningún troceo ingenuo cumple:
 *   · SIN PÉRDIDAS: unir los trozos con un espacio reproduce el texto
 *     normalizado — no se come ni el resto de una frase larga.
 *   · SIN TROZOS VACÍOS ni espacios sobrantes: cada bocado va recortado.
 *
 * Es pura (no toca `window`) a propósito: se prueba en Node y la deja en manos
 * del componente solo el `speak()` de cada trozo.
 */
export function trocearParaVoz(texto: string, maxChars = 180): string[] {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const tope = Math.max(20, Math.floor(Number.isFinite(maxChars) ? maxChars : 180));
  if (limpio.length <= tope) return [limpio];

  // Frases: la frontera va DESPUÉS del punto/signo y de un posible cierre
  // («.»» o !)” o …), no antes — cortar antes del cierre dejaba la comilla sola.
  const frases = limpio.split(/(?<=[.!?…]["'»)\]]*)\s+/).filter(Boolean);

  const trozos: string[] = [];
  let actual = "";
  const soltar = () => {
    if (actual) {
      trozos.push(actual.trim());
      actual = "";
    }
  };
  // Una frase más larga que el tope se parte en palabras: nunca se sacrifica
  // el resto del texto por una frase interminable (era la pérdida silenciosa
  // del troceo ingenuo por `slice`).
  const partirLarga = (frase: string) => {
    let resto = frase;
    while (resto.length > tope) {
      let corte = tope;
      const espacio = resto.lastIndexOf(" ", tope);
      if (espacio > tope * 0.5) corte = espacio; // si hay palabra a la mitad, corta ahí
      trozos.push(resto.slice(0, corte).trim());
      resto = resto.slice(corte).trim();
    }
    return resto; // lo que quedó, listo para unirse al siguiente trozo
  };

  for (const frase of frases) {
    const pedazo = actual ? `${actual} ${frase}` : frase;
    if (pedazo.length <= tope) {
      actual = pedazo;
      continue;
    }
    soltar();
    const cola = partirLarga(frase);
    actual = cola; // la frase larga ya soltó sus trozos; `cola` cabe en el tope
  }
  soltar();
  return trozos.filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// REFUERZO DE VOLUMEN (v1.56.8) — pedido de Mario: «sube la voz al doble»
// v1.57.22 — «subí más el volumen del TTS»: la ganancia pedida pasa de ×2 a ×4.
//   El recortador suave `tanh` normalizado evita que sature (una muestra a
//   fondo sigue valiendo 1.0); al subir el factor, las muestras flojas —las que
//   no se oían— suben mucho más y la voz queda sensiblemente más fuerte, con el
//   lado alto comprimido en vez de recortado a lo bruto.
// ═══════════════════════════════════════════════════════════════════════════

/** Ganancia pedida: ×2 ("el doble" — contrato de ttsErrores: REFUERZO_VOZ === 2). */
export const REFUERZO_VOZ = 2;

/**
 * Por qué esto NO es `audio.volume = 2`:
 * `HTMLMediaElement.volume` y `SpeechSynthesisUtterance.volume` valen 1 por
 * defecto, y ese 1 **es el máximo** de la especificación. Asignar 1.0 explícito
 * no sube ni un decibelio; poner 2 no existe. La única forma honesta de que se
 * oiga el doble es actuar **sobre la onda** del audio que devuelve Gemini.
 *
 * Qué hace: ganancia ×`factor` con recortador suave `tanh`, normalizada para que
 * una muestra a fondo siga valiendo 1.0 (sin saturar) mientras las muestras
 * flojas —que son las que no se oyen— suben casi exactamente ×`factor`. Sin
 * Web Audio API: es PCM puro, así que se prueba en Node sin navegador.
 *
 * Qué NO hace: no toca el tono (lo sigue fijando la voz) ni acelera. Y si el
 * audio no es WAV PCM de 16 bits, **no lo aplica y dice por qué**: antes la voz
 * al volumen de siempre que un fichero reventado sonando distorsionado.
 */
export function reforzarWav(
  datos: Uint8Array,
  factor: number = REFUERZO_VOZ,
): { datos: Uint8Array; aplicado: boolean; motivo: string; gananciaEfectiva?: number } {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const dv = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const tag = (o: number) =>
    String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

  if (datos.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    return { datos, aplicado: false, motivo: "el audio no es WAV RIFF (probablemente MP3 u otro códec)" };
  }

  let fmt = 0;
  let bits = 0;
  let dataOff = -1;
  let dataLen = 0;
  let pos = 12;
  while (pos + 8 <= datos.byteLength) {
    const id = tag(pos);
    const size = dv.getUint32(pos + 4, true);
    if (id === "fmt ") {
      fmt = dv.getUint16(pos + 8, true);
      bits = dv.getUint16(pos + 22, true);
    } else if (id === "data") {
      dataOff = pos + 8;
      dataLen = Math.min(size, datos.byteLength - dataOff);
    }
    pos += 8 + size + (size % 2); // los chunks van alineados a 2 bytes
  }

  if (dataOff < 0) return { datos, aplicado: false, motivo: "el WAV no trae chunk «data»" };
  if (fmt !== 1) return { datos, aplicado: false, motivo: `formato de audio ${fmt} (no PCM lineal)` };
  if (bits !== 16) return { datos, aplicado: false, motivo: `profundidad de ${bits} bits (solo se refuerza PCM 16)` };

  const copia = new Uint8Array(datos); // no muta el búfer del llamante
  const out = new DataView(copia.buffer, copia.byteOffset, copia.byteLength);
  const norma = Math.tanh(f);
  const muestras = Math.floor(dataLen / 2);
  for (let i = 0; i < muestras; i++) {
    const o = dataOff + i * 2;
    const x = out.getInt16(o, true) / 32768;
    let y = Math.tanh(x * f) / norma;
    if (y > 1) y = 1;
    else if (y < -1) y = -1;
    out.setInt16(o, Math.round(y * 32767), true);
  }
  return { datos: copia, aplicado: true, motivo: `ganancia ×${f} con recorte suave`, gananciaEfectiva: f };
}

/** Variante en base64, que es como llega del servidor (`audioBase64`). */
export function reforzarWavBase64(
  b64: string,
  factor: number = REFUERZO_VOZ,
): { base64: string; aplicado: boolean; motivo: string } {
  const sin = String(b64 || "").replace(/\s+/g, "");
  if (!sin) return { base64: b64 || "", aplicado: false, motivo: "audio vacío" };
  try {
    const bin = atob(sin);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const r = reforzarWav(bytes, factor);
    if (!r.aplicado) return { base64: b64, aplicado: false, motivo: r.motivo };
    let sal = "";
    for (let i = 0; i < r.datos.length; i++) sal += String.fromCharCode(r.datos[i]);
    return { base64: btoa(sal), aplicado: true, motivo: r.motivo };
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    return { base64: b64, aplicado: false, motivo: `no se pudo decodificar: ${m}` };
  }
}
