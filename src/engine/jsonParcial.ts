/**
 * jsonParcial.ts — PARSER DE JSON PARCIAL EN STREAMING (v1.53.3 · perf #4)
 * =====================================================================================
 * QUÉ CURA: la Hoja de Ruta v1.53.2 (Streaming Inteligente SSE, perf #4) pide
 * que, cuando el modelo cloud devuelve Structured Output (JSON obligatorio), la
 * interfaz NO se quede congelada esperando el `}` final. Con un parser PARCIAL,
 * server/streamContext.ts puede pintar el árbol de archivos en React mientras el
 * JSON todavía se está escribiendo en el aire.
 *
 * CÓMO: dado un fragmento de JSON incompleto (lo acumulado del stream hasta
 * ahora), lo «cierra» de forma determinista — descarta el último token a medio
 * escribir (coma colgante, dos puntos sin valor, clave a medias, string sin
 * cerrar) y añade los cierres `}`/`]` que falten, en orden inverso a la pila de
 * apertura. Luego hace JSON.parse. Sin dependencias (no `json-repair` externo):
 * stdlib puro, apto para el runtime TS del IDE.
 *
 * NO adivina valores que el modelo aún no mandó: si una clave no tiene valor,
 * la poda; si un string está a medias, lo cierra con lo que haya. Es una VISTA
 * PARCIAL honesta, no una invención. El JSON final (completo) se parsea igual.
 *
 * PURO: una función de string → objeto. Se prueba en tests/jsonParcial.test.ts.
 */

export interface ResultadoJsonParcial {
  /** ¿Se pudo parsear algo (completo o reparado)? */
  ok: boolean;
  /** El valor parseado (objeto/array) si ok. */
  valor?: unknown;
  /** El texto JSON que se intentó parsear (reparado), para auditar. */
  texto: string;
  /** true si hubo que reparar (el fragmento estaba incompleto). */
  reparado: boolean;
}

/**
 * Intenta parsear un fragmento de JSON posiblemente incompleto. Primero prueba
 * JSON.parse directo (caso feliz: ya llegó entero). Si falla, repara y reintenta.
 */
export function repararJsonParcial(fragmento: string): ResultadoJsonParcial {
  const crudo = String(fragmento ?? "");
  // 1) ¿Ya es JSON válido completo?
  try {
    return { ok: true, valor: JSON.parse(crudo), texto: crudo, reparado: false };
  } catch {
    /* sigue a reparar */
  }

  const reparado = cerrarJson(crudo);
  if (reparado == null) return { ok: false, texto: crudo, reparado: true };
  try {
    return { ok: true, valor: JSON.parse(reparado), texto: reparado, reparado: true };
  } catch {
    return { ok: false, texto: reparado, reparado: true };
  }
}

/**
 * Cierra un JSON incompleto. Recorre carácter a carácter llevando una pila de
 * `{`/`[` y el estado de string/escape. Al final:
 *   · si quedó dentro de un string, lo cierra con `"`.
 *   · poda un token final a medias: coma colgante, `:` sin valor, o una clave
 *     «entre comillas» sin su `:` valor.
 *   · añade los cierres de la pila en orden inverso.
 * Devuelve null si no hay nada aprovechable (p.ej. cadena vacía o basura).
 */
export function cerrarJson(crudo: string): string | null {
  let s = crudo;
  // Recorte de blancos a la derecha para razonar sobre el último token real.
  s = s.replace(/\s+$/, "");
  if (!s) return null;

  const pila: string[] = [];
  let enString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (enString) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') enString = false;
      continue;
    }
    if (c === '"') { enString = true; continue; }
    if (c === "{" || c === "[") { pila.push(c); continue; }
    if (c === "}" || c === "]") { pila.pop(); continue; }
  }

  let fin = s;

  // Si quedó abierto un string: ciérralo.
  if (enString) {
    // Si el último escape quedó colgando (\ al final), quítalo para no romper.
    if (escape) fin = fin.slice(0, -1);
    fin += '"';
  }

  // Poda de token final a medias. Qué se poda depende del CONTENEDOR actual
  // (cima de la pila): en un objeto, una clave suelta sin valor se tira; en un
  // array, un string completo es un ELEMENTO válido y NO se toca.
  const contenedorTop = pila.length ? pila[pila.length - 1] : "{";
  const podado = podarTokenColgante(fin, contenedorTop);
  if (podado == null) return null;
  fin = podado;

  // Cierra la pila en orden inverso.
  for (let i = pila.length - 1; i >= 0; i--) {
    fin += pila[i] === "{" ? "}" : "]";
  }
  return fin;
}

/**
 * Quita un token final que dejaría el JSON inválido aunque se cierren llaves:
 *   · coma colgante:            {"a":1,      → {"a":1
 *   · dos puntos sin valor:     {"a":        → {"a"  → (y la clave sin uso)
 *   · clave sin su valor:       {"a"         → {    (SOLO dentro de un objeto)
 *   · clave colgante tras coma: {"a":1,"b"   → {"a":1 (SOLO dentro de un objeto)
 * `contenedor` es la cima de la pila ('{' objeto o '[' array). En un array, un
 * string completo es un elemento válido y se conserva. Trabaja sobre texto ya
 * con strings cerrados. Devuelve null si no queda nada aprovechable.
 */
export function podarTokenColgante(texto: string, contenedor: string = "{"): string | null {
  let t = texto.replace(/\s+$/, "");
  const enObjeto = contenedor === "{";
  // Repite porque podar una cosa puede destapar otra (p.ej. :"x" → clave sola).
  for (let guard = 0; guard < 6; guard++) {
    const antes = t;
    // coma colgante (en cualquier contenedor)
    t = t.replace(/,\s*$/, "");
    // dos puntos sin valor → quita el : y la clave que lo precede (solo objetos)
    t = t.replace(/"(?:[^"\\]|\\.)*"\s*:\s*$/, "");
    if (enObjeto) {
      // clave entre comillas sin : justo tras abrir el objeto
      t = t.replace(/(\{\s*)"(?:[^"\\]|\\.)*"\s*$/, "$1");
      // clave colgante tras una coma dentro de un objeto
      t = t.replace(/,\s*"(?:[^"\\]|\\.)*"\s*$/, "");
    }
    // coma que quedó tras podar
    t = t.replace(/,\s*$/, "");
    if (t === antes) break;
  }
  t = t.replace(/\s+$/, "");
  if (!t) return null;
  return t;
}
