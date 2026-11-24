/**
 * src/engine/direccionOllama.ts — UNA SOLA FORMA DE DECIR DÓNDE ESTÁ OLLAMA (v2.2.2)
 * ====================================================================================
 * EL BICHO QUE EVITA
 * ------------------
 * `OLLAMA_HOST` es una variable de Ollama y significa **dónde escuchar**: el
 * `iniciar_todo_windows.bat` la pone en `0.0.0.0:11434` para que el motor acepte
 * conexiones de la red. Nuestro server hacía esto con esa misma variable:
 *
 *    const OLLAMA_DEFAULT = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
 *
 * Es decir: usaba una dirección de ESCUCHA como dirección de DESTINO. Dos errores
 * encima del uno:
 *   · `0.0.0.0` no es un sitio al que se conecte nadie (en Windows el intento
 *     simplemente no prospara); y
 *   · no lleva protocolo, así que ni siquiera es una URL.
 *
 * Si esa variable llega al entorno del server — y llega: cualquier consola donde
 * el usuario la haya exportado, o el propio sistema si lo configuró así —
 * `/api/ollama/models` devuelve `{ models: [], error }` con HTTP 200, el embedder
 * no mide nunca, y el chat contra un modelo local no arranca. Tres síntomas que
 * parecen de tres bichos distintos y salen de la misma línea.
 *
 * LA REGLA
 * --------
 * `OLLAMA_HOST` se respeta, pero se INTERPRETA: si apunta a una interfaz de
 * escucha (0.0.0.0, ::, *), se reemplaza por el bucle invertido, porque ese mismo
 * proceso está en la máquina. Y siempre se devuelve una URL con protocolo y puerto.
 *
 * Todo es puro y devuelve los avisos en vez de imprimirlos: quien llama decide
 * gritarlos en el arranque. Ninguna llamada puede quedar apuntando a la nada con
 * cara de éxito.
 */

/** Dirección de Ollama cuando el entorno no dice nada. Bucle invertido, con protocolo. */
export const OLLAMA_POR_DEFECTO = "http://127.0.0.1:11434";

/** Hosts que significan «todas mis interfaces»: sirven para escuchar, no para llamar. */
const RE_ESCUCHA = /^(0\.0\.0\.0|::|\[::\]|\*|255\.255\.255\.255)$/i;

export function esDireccionDeEscucha(host: string): boolean {
  return RE_ESCUCHA.test(String(host || "").trim());
}

export interface ResolucionOllama {
  /** URL base lista para `fetch`: protocolo, host real y puerto. Sin barra final. */
  base: string;
  /** De dónde salió el valor, para que el log no obligue a adivinar. */
  origen: "OLLAMA_URL" | "OLLAMA_HOST" | "por defecto";
  /** Lo que tuvimos que corregir de camino. Vacío = el entorno estaba sano. */
  avisos: string[];
}

/**
 * Convierte lo que sea que haya en el entorno en una URL a la que se pueda llamar.
 *
 * Prioridad: `OLLAMA_URL` (nuestra, sin ambigüedad) > `OLLAMA_HOST` (la de Ollama,
 * que puede ser una dirección de escucha) > `127.0.0.1:11434`.
 */
export function resolverOllama(env: Record<string, string | undefined> = process.env): ResolucionOllama {
  const avisos: string[] = [];
  const crudoUrl = String(env.OLLAMA_URL || "").trim();
  const crudoHost = String(env.OLLAMA_HOST || "").trim();

  let crudo = "";
  let origen: ResolucionOllama["origen"] = "por defecto";
  if (crudoUrl) {
    crudo = crudoUrl;
    origen = "OLLAMA_URL";
  } else if (crudoHost) {
    crudo = crudoHost;
    origen = "OLLAMA_HOST";
  }

  if (!crudo) return { base: OLLAMA_POR_DEFECTO, origen, avisos };

  // `0.0.0.0:11434` y `localhost:11434` no son URLs: sin protocolo, new URL()
  // interpreta el host como esquema y el resto se pierde. Se antepone http://.
  let candidato = crudo;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidato)) {
    candidato = `http://${candidato}`;
    avisos.push(`«${crudo}» no tenia protocolo: se asumió http://`);
  }

  let u: URL;
  try {
    u = new URL(candidato);
  } catch {
    // Un entorno roto no puede dejar el server apuntando a la nada en silencio.
    return {
      base: OLLAMA_POR_DEFECTO,
      origen: "por defecto",
      avisos: [`«${crudo}» no es una dirección utilizable (${crudoUrl ? "OLLAMA_URL" : "OLLAMA_HOST"}): se usó ${OLLAMA_POR_DEFECTO}`],
    };
  }

  const hostOriginal = u.hostname;
  let host = hostOriginal;
  if (esDireccionDeEscucha(host)) {
    host = "127.0.0.1";
    avisos.push(
      `«${crudo}» (${origen}) es una direccion de ESCUCHA, no un destino: se llamo a 127.0.0.1 en su lugar`,
    );
  }

  // Sin puerto explicito, el de Ollama; si el host era `localhost` se avisa una
  // sola vez y se pasa a literal IPv4: `localhost` puede resolver a ::1 y Ollama
  // levanta en 0.0.0.0 (solo IPv4), que es la forma de «Ollama OK y 0 modelos».
  let puerto = u.port;
  if (!puerto) {
    puerto = "11434";
    avisos.push("sin puerto en la direccion: se asumió 11434");
  }
  if (/^localhost$/i.test(host)) {
    host = "127.0.0.1";
    avisos.push("«localhost» puede resolver a ::1 y Ollama escucha en IPv4: se fijo 127.0.0.1");
  }

  const ruta = u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/+$/, "") : "";
  return { base: `${u.protocol}//${host}:${puerto}${ruta}`, origen, avisos };
}

/** Atajo para los llamadores que solo quieren la base. */
export function urlBaseOllama(env: Record<string, string | undefined> = process.env): string {
  return resolverOllama(env).base;
}
