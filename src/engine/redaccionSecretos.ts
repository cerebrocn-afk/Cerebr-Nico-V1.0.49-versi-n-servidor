/**
 * redaccionSecretos.ts — LO QUE UN ERROR DEL PROVEEDOR NO PUEDE DECIR (v1.95.2)
 * ============================================================================
 * Medido en la sesión exportada por Mario (30/10, v1.94.1). El lazo probó
 * `openrouter/auto` y OpenRouter respondió:
 *
 *   «This request requires more credits, or fewer max_tokens. You requested up to
 *    65536 tokens, but can only afford 138. To increase, visit
 *    https://openrouter.ai/workspaces/default/keys/«los 64 hex de la clave, redactados» …»
 *
 * La IDE imprimió eso **tal cual** en el chat (`src/App.tsx:3440` arma el mensaje con
 * `${errMsg}` crudo) y el usuario, para mostrarme el fallo, exportó la sesión — que es
 * un JSON con el historial. Resultado: **su clave de OpenRouter quedó escrita en el
 * archivo que me pasó**, y quedó también en cualquier backup, captura o chat compartido.
 * No es un descuido de él: es la IDE filtrando credenciales ajenas al mensaje útil.
 *
 * La regla: un error de proveedor es TEXTO INCONTROLADO que llega de afuera. Puede
 * contener la clave del propio usuario rebotada por el servicio (OpenRouter lo hace con
 * la URL de su consola, Google con `AIza…`, cualquier proxy con `Bearer …`). Antes de
 * mostrarlo, guardarlo o exportarlo, se pasa por acá.
 *
 * Criterio puro: sin `fs`, sin red, sin UI. Devuelve además CUÁNTICO se ocultó y de qué
 * tipo, para que la interfaz pueda decir «se ocultaron 2 credenciales» en vez de
 * desaparecer información en silencio — el usuario tiene que saber que el texto fue
 * alterado y por qué.
 *
 * Deliberadamente QUIRÚRGICO: no se enmascara cualquier ristra larga de hex, porque
 * esta casa imprime sha256 de entrega a propósito (`MANIFIESTO-CHECKSUMS`) y taparlos
 * cambiaría un dato legítimo por un placeholder. Se tapan formas de credencial
 * reconocibles, no "cosas que se parecen a una clave".
 */

export interface Redactado {
  texto: string;
  /** Cuántas credenciales se ocultaron. 0 = el texto salió intacto. */
  ocultas: number;
  /** Tipos encontrados, sin duplicados y en orden de aparición. */
  tipos: string[];
}

interface Patron {
  nombre: string;
  /** Si el regex tiene un grupo de captura 1, se conserva (prefijos tipo `Bearer `). */
  re: RegExp;
  marca: string;
}

const PATRONES: Patron[] = [
  // OpenRouter rebota la URL de su consola CON la clave dentro. Es el caso real.
  { nombre: "openrouter-key", re: /(openrouter\.ai\/[^\s"'<>]*\/keys\/)[A-Za-z0-9]{10,}/gi, marca: "«clave-oculta»" },
  // Claves con prefijo conocido: sk-, sk-or-, AIza… (Google), gsk_ (Groq), mistral largas.
  { nombre: "sk-key", re: /\bsk-(?:or-|pro-|proj-)?[A-Za-z0-9_-]{16,}\b/g, marca: "«clave-oculta»" },
  { nombre: "google-key", re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, marca: "«clave-oculta»" },
  { nombre: "groq-key", re: /\bgsk_[A-Za-z0-9_-]{16,}\b/g, marca: "«clave-oculta»" },
  // Tokens de autorización, incluidos los JWT (tres segmentos separados por punto).
  { nombre: "bearer", re: /\b(Bearer\s+)[A-Za-z0-9._~+\/=-]{12,}/gi, marca: "«token-oculto»" },
  { nombre: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, marca: "«token-oculto»" },
  // Campos de credencial en JSON o query: api_key, apiKey, access_token, secret…
  { nombre: "campo-clave", re: /(["']?(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key)["']?\s*[:=]\s*["']?)[^"'\s,}&]{6,}/gi, marca: "«valor-oculto»" },
];

/**
 * Oculta credenciales dentro de un texto que llega de afuera (error de proveedor,
 * salida de un comando, respuesta de un endpoint).
 *
 * Idempotente: pasar el resultado otra vez no cambia nada, porque las marcas no casan
 * con ningún patrón. Esto importa porque el mismo texto puede redactarse en el chat,
 * otra vez al guardarse y otra vez al exportarse.
 */
export function redactarSecretos(texto: unknown): Redactado {
  const bruto = typeof texto === "string" ? texto : texto == null ? "" : String(texto);
  if (!bruto) return { texto: bruto, ocultas: 0, tipos: [] };
  let salida = bruto;
  let ocultas = 0;
  const tipos: string[] = [];
  for (const p of PATRONES) {
    const local = new RegExp(p.re.source, p.re.flags); // sin estado compartido entre llamadas
    salida = salida.replace(local, (...args: any[]) => {
      ocultas++;
      if (!tipos.includes(p.nombre)) tipos.push(p.nombre);
      const grupo1 = typeof args[1] === "string" && p.re.source.includes("(") ? args[1] : "";
      return grupo1 + p.marca;
    });
  }
  return { texto: salida, ocultas, tipos };
}

/** Atajo para los sitios que solo quieren el texto. */
export function textoSeguro(texto: unknown): string {
  return redactarSecretos(texto).texto;
}

/**
 * Nota para la UI: honesta sobre la alteración. Se muestra al lado del mensaje, no en
 * lugar del mensaje — el usuario tiene que poder distinguir «el proveedor dijo esto» de
  * «la casa me ocultó esto».
 */
export function notaRedaccion(r: Redactado): string {
  if (!r.ocultas) return "";
  return ` (se ocultaron ${r.ocultas} credencial${r.ocultas === 1 ? "" : "es"} del mensaje del proveedor: ${r.tipos.join(", ")})`;
}

export const VERSION_REDACCION = "1.95.2";
