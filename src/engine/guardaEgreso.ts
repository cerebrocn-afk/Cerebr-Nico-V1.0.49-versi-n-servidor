/**
 * guardaEgreso.ts — v1.87.0 · LA ADUANA DE SALIDA
 * ==============================================
 * QUÉ PROBLEMA RESUELVE (medido, no supuesto): CerebróNico avisa que el prompt
 * «sale a la nube» (pivotProveedores.ts) pero no mira QUÉ sale. Un usuario que
 * pega su configuración, un log o un archivo `.env` en el chat manda su clave de
 * OpenRouter a un tercero sin que nadie lo diga. La regla de la casa —nada
 * silencioso— aplica al revés: tampoco vale redactar a escondidas.
 *
 * POR QUÉ NO ES EL piiSanitizer DE OMNIRoute: aquel dispara `replace` sobre
 * cualquier racha de 16 dígitos. Acá cada regla tiene que GANARSE el hallazgo:
 * una tarjeta se acepta solo si pasa Luhn, un CPF solo si sus dos dígitos
 * verificadores cuadran, un CNPJ solo si cuadra el suyo. La diferencia se mide:
 * «1.86.6», un sha256, una fecha ISO y un `texto.ts:42` NO son tarjetas.
 *
 * TRES MODOS, Y EL DEFECTO ES EL QUE MENOS ESTORBA:
 *   · «avisar»   (defecto) — redacta SOLO claves de API, que nunca se mandan por
 *                  accidente; el resto (correo, tarjeta, CPF, ruta de usuario)
 *                  se AVISA y se deja intacto, porque puede ser el dato que el
 *                  usuario pidió analizar.
 *   · «redactar» — redacta todo lo detectado.
 *   · «bloquear» — si hay un hallazgo crítico no se envía: se explica y se para.
 *
 * Puro: sin red, sin fs, sin relojes. El llamador decide y registra.
 */

// v1.98.0 · el tablero no admite 25 gritos iguales por turno: la misma nota se
// dice una vez y se cuenta. `eco` es puro y su reloj entra inyectado, así que la
// valla de below se prueba sin dormir nada.
import { crearEco, eco } from "./ecoLog";

/** Un tablero propio por dominio: que la aduana no se calle por culpa del historial. */
export const ecoAduana = crearEco();

export type Severidad = "critica" | "alta" | "media" | "baja";
export type ModoEgreso = "avisar" | "redactar" | "bloquear";

export interface Hallazgo {
  regla: string;
  severidad: Severidad;
  veces: number;
  /** El valor NUNCA viaja entero: solo una máscara para que el usuario lo reconozca. */
  muestra: string;
  /** Qué se hizo con él en este modo. */
  accion: "redactado" | "avisado" | "bloqueado";
}

export interface ResultadoEgreso {
  texto: string;
  hallazgos: Hallazgo[];
  cambios: number;
  bloqueado: boolean;
  motivo?: string;
}

export interface OpcionesEgreso {
  modo?: ModoEgreso;
}

interface Regla {
  id: string;
  severidad: Severidad;
  patron: RegExp;
  /** Validación que debe pasar la coincidencia para contar como hallazgo. */
  validar?: (coincidencia: string) => boolean;
  /** Qué se escribe en lugar del valor cuando se redacta. */
  reemplazo: string;
}

/** Un secreto se muestra así: `sk-or-…9f3c`. Sirve para reconocerlo, no para usarlo. */
export function mascara(valor: string): string {
  const limpio = valor.trim();
  if (limpio.length <= 8) return "…";
  const cabeza = limpio.slice(0, Math.min(6, limpio.length - 4));
  return `${cabeza}…${limpio.slice(-4)}`;
}

/** Luhn: el algoritmo real de las tarjetas. Sin esto, cualquier número largo «parece» tarjeta. */
export function luhnValido(digitos: string): boolean {
  if (!/^\d{13,19}$/.test(digitos)) return false;
  let suma = 0;
  let doble = false;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = digitos.charCodeAt(i) - 48;
    if (doble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    doble = !doble;
  }
  return suma % 10 === 0;
}

/** CPF: dos dígitos verificadores. Once números cualquiera NO son un CPF. */
export function cpfValido(mascaraCpf: string): boolean {
  const n = mascaraCpf.replace(/\D/g, "");
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const verificador = (hasta: number): number => {
    let suma = 0;
    for (let i = 0; i < hasta; i++) suma += Number(n[i]) * (hasta + 1 - i);
    const resto = (suma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return verificador(9) === Number(n[9]) && verificador(10) === Number(n[10]);
}

/** CNPJ: mismos pesos públicos que la Receita Federal. */
export function cnpjValido(mascaraCnpj: string): boolean {
  const n = mascaraCnpj.replace(/\D/g, "");
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;
  const digito = (base: string): number => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < base.length; i++) suma += Number(base[i]) * pesos[i];
    const resto = suma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(n.slice(0, 12));
  const d2 = digito(n.slice(0, 12) + d1);
  return d1 === Number(n[12]) && d2 === Number(n[13]);
}

/**
 * Las reglas, en orden de severidad. `g` es obligatorio: se recorren todas las
 * coincidencias, no la primera. El `lastIndex` se reinicia SIEMPRE antes de usar
 * (un regex global con estado compartido es la clase de bug que enjambreEclectico
 * documenta con sus dos `ETIQUETAS_INFORME`).
 */
const REGLAS: Regla[] = [
  {
    id: "clave_openrouter",
    severidad: "critica",
    patron: /\bsk-or-v1-[A-Za-z0-9]{32,}\b/g,
    reemplazo: "[CLAVE_OPENROUTER_REDACTADA]",
  },
  {
    id: "clave_openai",
    severidad: "critica",
    patron: /\bsk-(?!or-v1-)[A-Za-z0-9_-]{20,}\b/g,
    reemplazo: "[CLAVE_OPENAI_REDACTADA]",
  },
  {
    id: "clave_google",
    severidad: "critica",
    patron: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    reemplazo: "[CLAVE_GOOGLE_REDACTADA]",
  },
  {
    id: "clave_aws",
    severidad: "critica",
    patron: /\bAKIA[0-9A-Z]{16}\b/g,
    reemplazo: "[CLAVE_AWS_REDACTADA]",
  },
  {
    id: "clave_github",
    severidad: "critica",
    patron: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
    reemplazo: "[CLAVE_GITHUB_REDACTADA]",
  },
  {
    id: "clave_slack",
    severidad: "critica",
    patron: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    reemplazo: "[CLAVE_SLACK_REDACTADA]",
  },
  {
    id: "tarjeta",
    severidad: "alta",
    // Se admiten separadores; los puntos quedan FUERA para que «1.86.6» no entre.
    patron: /(?<![\d.])(?:\d[ -]?){12,18}\d(?![\d.])/g,
    validar: (m) => luhnValido(m.replace(/[ -]/g, "")),
    reemplazo: "[TARJETA_REDACTADA]",
  },
  {
    id: "cpf",
    severidad: "alta",
    patron: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    validar: cpfValido,
    reemplazo: "[CPF_REDACTADO]",
  },
  {
    id: "cnpj",
    severidad: "alta",
    patron: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
    validar: cnpjValido,
    reemplazo: "[CNPJ_REDACTADO]",
  },
  {
    id: "correo",
    severidad: "media",
    patron: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    reemplazo: "[CORREO_REDACTADO]",
  },
  {
    id: "ruta_usuario",
    severidad: "baja",
    patron: /\b[A-Za-z]:\\Users\\[^\\\s"']+/g,
    reemplazo: "[RUTA_DE_USUARIO_REDACTADA]",
  },
];

/**
 * ¿El destino se queda en la máquina? A un Ollama local se le manda lo que haga
 * falta: la aduana es para lo que CRUZA. Se compara el anfitrión, no la URL
 * entera (un `?token=` en la query no puede cambiar la decisión).
 */
export function esDestinoLocal(url: string): boolean {
  let anfitrion = "";
  try {
    anfitrion = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return false; // sin URL parseable no se asume local: fail-closed
  }
  if (!anfitrion) return false;
  if (anfitrion === "localhost" || anfitrion === "::1" || anfitrion === "0.0.0.0") return true;
  if (anfitrion === "host.docker.internal" || anfitrion.endsWith(".local")) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(anfitrion)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(anfitrion)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(anfitrion)) return true;
  const r172 = anfitrion.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (r172) {
    const segundo = Number(r172[1]);
    if (segundo >= 16 && segundo <= 31) return true;
  }
  return false;
}

/** Recorre una regla recogiendo cuántas veces casa y qué máscara mostrar. */
function cosechar(texto: string, regla: Regla): { veces: number; muestra: string; valores: string[] } {
  regla.patron.lastIndex = 0;
  const valores: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regla.patron.exec(texto)) !== null) {
    if (m[0].length === 0) { regla.patron.lastIndex += 1; continue; } // nunca girar en vacío
    if (regla.validar && !regla.validar(m[0])) continue;
    valores.push(m[0]);
    if (valores.length >= 200) break; // techo anti-abuso: 200 coincidencias por regla bastan
  }
  return {
    veces: valores.length,
    muestra: valores.length ? mascara(valores[0].replace(/[ -]/g, "")) : "",
    valores,
  };
}

/**
 * La aduana de un texto. Devuelve el texto (posiblemente redactado), los
 * hallazgos nombrados y si hay que parar.
 */
export function sanearTexto(texto: string, opciones: OpcionesEgreso = {}): ResultadoEgreso {
  const modo: ModoEgreso = opciones.modo ?? "avisar";
  if (typeof texto !== "string" || !texto) {
    return { texto: typeof texto === "string" ? texto : "", hallazgos: [], cambios: 0, bloqueado: false };
  }

  let salida = texto;
  const hallazgos: Hallazgo[] = [];
  let cambios = 0;
  let criticoSinRedactar = false;

  for (const regla of REGLAS) {
    const { veces, muestra, valores } = cosechar(salida, regla);
    if (!veces) continue;

    // El modo manda, salvo una excepción deliberada: una CLAVE de API no se
    // manda jamás, ni siquiera en «avisar». Enviar una credencial viva a un
    // tercero no es una decisión que el usuario haya tomado.
    const seRedacta = modo === "redactar" || (modo === "avisar" && regla.severidad === "critica");
    const seBloquea = modo === "bloquear" && regla.severidad === "critica";

    if (seRedacta) {
      for (const valor of valores) {
        salida = salida.split(valor).join(regla.reemplazo);
        cambios += 1;
      }
    }
    if (seBloquea) criticoSinRedactar = true;

    hallazgos.push({
      regla: regla.id,
      severidad: regla.severidad,
      veces,
      muestra,
      accion: seBloquea ? "bloqueado" : seRedacta ? "redactado" : "avisado",
    });
  }

  const critico = hallazgos.some((h) => h.severidad === "critica");
  const bloqueado = modo === "bloquear" && (critico || criticoSinRedactar);
  return {
    texto: salida,
    hallazgos,
    cambios,
    bloqueado,
    motivo: bloqueado
      ? `no se envía: el texto lleva ${hallazgos
          .filter((h) => h.severidad === "critica")
          .map((h) => h.regla)
          .join(", ")}`
      : undefined,
  };
}

type Cuerpo = Record<string, unknown>;

/** Sanea una cadena suelta dentro de un cuerpo JSON, sin tocar las claves. */
function sanearCampo(valor: unknown, opciones: OpcionesEgreso, acumulado: Hallazgo[]): unknown {
  if (typeof valor === "string") {
    const r = sanearTexto(valor, opciones);
    if (r.hallazgos.length) acumulado.push(...r.hallazgos);
    return r.texto;
  }
  if (Array.isArray(valor)) {
    return valor.map((v) => {
      if (v && typeof v === "object") {
        const obj = v as Cuerpo;
        const copia: Cuerpo = { ...obj };
        // Formatos reales: { role, content: string }, { role, content: [partes] }
        // y { type:"text", text }. Se recorre content aunque sea un array: una
        // parte de texto es exactamente donde viaja lo que el usuario pegó.
        if (typeof obj.text === "string") copia.text = sanearCampo(obj.text, opciones, acumulado);
        if (typeof obj.content === "string") copia.content = sanearCampo(obj.content, opciones, acumulado);
        else if (Array.isArray(obj.content)) copia.content = sanearCampo(obj.content, opciones, acumulado);
        return copia;
      }
      return sanearCampo(v, opciones, acumulado);
    });
  }
  return valor;
}

/** Agrupa hallazgos repetidos entre mensajes: «correo ×3» en vez de tres líneas. */
function agrupar(hallazgos: Hallazgo[]): Hallazgo[] {
  const mapa = new Map<string, Hallazgo>();
  for (const h of hallazgos) {
    const clave = `${h.regla}|${h.accion}`;
    const previo = mapa.get(clave);
    if (previo) previo.veces += h.veces;
    else mapa.set(clave, { ...h });
  }
  return [...mapa.values()];
}

const CAMPOS_CON_TEXTO = new Set([
  "messages",
  "input",
  "prompt",
  "instructions",
  "system",
  "system_instruction",
  "systemInstruction",
]);

/**
 * La aduana del cuerpo HTTP que va a salir. Solo mira los campos que llevan
 * texto del usuario; `model`, `tools`, `temperature` y compañía no se tocan.
 * Devuelve un cuerpo NUEVO (no muta el original: el llamador puede necesitar
 * el original para el registro local).
 */
export function sanearCuerpoSaliente(
  cuerpo: unknown,
  opciones: OpcionesEgreso = {}
): { cuerpo: unknown; hallazgos: Hallazgo[]; bloqueado: boolean; motivo?: string } {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return { cuerpo, hallazgos: [], bloqueado: false };
  }
  const original = cuerpo as Cuerpo;
  const hallazgos: Hallazgo[] = [];
  const salida: Cuerpo = { ...original };

  for (const campo of Object.keys(original)) {
    if (!CAMPOS_CON_TEXTO.has(campo)) continue;
    salida[campo] = sanearCampo(original[campo], opciones, hallazgos);
  }

  const agrupados = agrupar(hallazgos);
  const bloqueado = agrupados.some((h) => h.accion === "bloqueado");
  return {
    cuerpo: salida,
    hallazgos: agrupados,
    bloqueado,
    motivo: bloqueado
      ? `no se envía: el cuerpo lleva ${agrupados.filter((h) => h.severidad === "critica").map((h) => h.regla).join(", ")}`
      : undefined,
  };
}

/** Una línea honesta para el registro. Nunca incluye el valor, solo la máscara. */
export function notaEgreso(destino: string, hallazgos: Hallazgo[]): string {
  if (!hallazgos.length) return "";
  const partes = hallazgos.map(
    (h) => `${h.regla}×${h.veces} (${h.accion}, ${h.severidad}, ${h.muestra})`
  );
  return `[aduana de salida] ${destino}: ${partes.join(" · ")}`;
}

/**
 * El `init` saneado, listo para `fetch`. Vive acá y no en fetchCloud para que el
 * guardián siga siendo un envoltorio fino (la valla de esperaNube mide sus
 * primeros 1600 caracteres y no debe crecer).
 */
export function sanearInit(init: RequestInit, opciones: OpcionesEgreso = {}): RequestInit {
  if (typeof init.body !== "string" || !init.body) return init;
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(init.body);
  } catch {
    return init; // no es JSON: no es un cuerpo de modelo, no se toca
  }
  const r = sanearCuerpoSaliente(cuerpo, opciones);
  if (r.bloqueado) throw new Error(r.motivo ?? "la aduana de salida bloqueó el envío");
  if (!r.hallazgos.length) return init;
  // v1.98.0 · la aduana avisaba LO MISMO 25 veces por turno (una por request del
  // ciclo de herramientas) y el tablero del usuario quedaba tapado por su propia
  // alarma. Se dice una vez y se CUENTAN las repeticiones: la nota es su propia
  // clave, así que si el hecho CAMBIA (×6 → ×17, otro hallazgo) vuelve a hablar ya.
  const nota = notaEgreso("cuerpo saliente", r.hallazgos);
  const ecoNota = eco(ecoAduana, nota, nota);
  if (ecoNota.linea) console.warn(ecoNota.linea);
  return { ...init, body: JSON.stringify(r.cuerpo) };
}
