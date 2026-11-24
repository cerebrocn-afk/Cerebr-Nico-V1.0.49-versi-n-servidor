/**
 * selectorModelos.ts — UNA FILA POR MODELO (v1.98.0)
 * ===================================================
 * Queja del 31/10: «las ranuras de [la app externa] siguen estando, al igual
 * que la carpeta unificada en el selector». Es literal y es medible:
 *
 *   · El JSON de claves importado se REPARTE en ranuras por proveedor
 *     (`RANURA_POR_PLATAFORMA`, engine/ranuraUnificada.ts) y cada ranura con clave
 *     aporta sus propios modelos con su pestaña.
 *   · El endpoint unificado (/v1 compatible con OpenAI, muchos proveedores detrás
 *     de una sola clave) aporta los SUYOS como `provider: "custom"` y tiene su
 *     carpeta 🧩 (ModelSelectorModal.tsx:806-824).
 *   · La única guarda anti-duplicado que existía comparaba contra entradas
 *     `provider === "custom"` (línea 808-810). O sea: `gemini-3.8-flash` de la
 *     ranura Google y `custom::gemini-3.8-flash` de la unificada son dos objetos
 *     distintos con el MISMO nombre, y ninguno de los dos se reconocía como
 *     duplicado del otro. Resultado: el mismo modelo, dos veces, en dos pestañas.
 *
 * LA REGLA (y por qué es ésa)
 * ---------------------------
 * Dos rutas legítimas para el mismo modelo NO son un bug: la ranura propia habla
 * con el proveedor con SU clave, la unificada habla con un proxy con OTRA clave, y
 * elegir una u otra cambia precio, límite y latencia. Por eso:
 *   · NUNCA se fusionan dos ranuras natives entre sí (Google y OpenRouter sirviendo
 *     lo mismo son decisiones de negocio distintas, y borrar una sería mentir).
 *   · SÍ se colapsa el par (unificada ↔ ranura), que es el duplicado que ve el
 *     usuario, y se deja a la vista elegir a cuál le da la prioridad.
 *   · Lo que se colapsa NO se pierde: queda en `ocultas` con el nombre de la que
 *     quedó visible, y el selector ofrece el interruptor de prioridad. Un filtro
 *     que hace desaparecer datos sin forma de volver es exactamente lo que la casa
 *     ya prohibió en otras partes (recortar herramientas, ocultar puertos).
 *
 * Es PURA función sobre listas: se prueba con nombres inventados, sin react, sin
 * red y sin localStorage, y el modal sólo elige la preferencia.
 */

/** El proveedor con el que la casa marca TODO lo que sale del endpoint unificado. */
export const PROVEEDOR_UNIFICADO = "custom";

/** A qué familia le da el selector la fila cuando un modelo tiene dos caminos. */
export type PreferenciaRuta = "unificada" | "ranuras";
export const PREFERENCIA_POR_DEFECTO: PreferenciaRuta = "unificada";

/** Preferencia del usuario, guardada en el mismo sitio que el resto de la IDE. */
export const CLAVE_PREFERENCIA_RUTA = "cn.selector.preferenciaRuta";

export function normalizarPreferencia(v: unknown): PreferenciaRuta {
  return v === "ranuras" ? "ranuras" : v === "unificada" ? "unificada" : PREFERENCIA_POR_DEFECTO;
}

/**
 * La clave que identifica AL MODELO (no a la fila). Va de menos: minúsculas y sin
 * espacios sueltos. A propósito NO se recortan prefijos de enrutador (`x/y`) ni el
 * `:tag` de Ollama: `llama-3.2:3b` y `llama-3.2:1b` son modelos distintos, y
 * `meta-llama/llama-3` (OpenRouter) no es lo mismo que `llama-3`, por más que
 * compartan palabras. Fusionar de más es más peligroso que dejar dos filas: una
 * fila de más se mira, un modelo que desapareció no se encuentra.
 */
export function claveDeModelo(nombre: string): string {
  return String(nombre || "").trim().toLowerCase();
}

export function esRutaUnificada(proveedor: string): boolean {
  return String(proveedor || "").toLowerCase() === PROVEEDOR_UNIFICADO;
}

export interface ParOculto<T> {
  /** La fila que se deja de mostrar. */
  oculta: T;
  /** La fila que la reemplaza (mismo modelo, otra ruta). */
  queda: T;
}

export interface CorteDuplicados<T> {
  /** En el mismo orden en que llegaron: el selector ordena por abajo de acá. */
  visibles: T[];
  ocultas: ParOculto<T>[];
  /** clave → la fila del otro camino, para el distintivo «también por …». */
  alternativas: Record<string, T>;
}

/**
 * Colapsa los pares (unificada ↔ ranura) y deja intacto todo lo demás.
 *
 * `preferencia` decide cuál de los dos se ve. Si el preferido no está en el grupo
 * (p. ej. preferís la unificada pero ese modelo no lo sirve tu endpoint), no se
 * inventa nada: se muestran las que hay.
 */
export function cortarDuplicados<T extends { name: string; provider: string }>(
  modelos: readonly T[],
  preferencia: PreferenciaRuta = PREFERENCIA_POR_DEFECTO
): CorteDuplicados<T> {
  const pref = normalizarPreferencia(preferencia);
  const porClave = new Map<string, T[]>();
  for (const m of modelos) {
    const clave = claveDeModelo(m.name);
    if (!clave) continue;
    const grupo = porClave.get(clave);
    if (grupo) grupo.push(m);
    else porClave.set(clave, [m]);
  }

  const descartadas = new Set<T>();
  const ocultas: ParOculto<T>[] = [];
  const alternativas: Record<string, T> = {};

  for (const [clave, grupo] of porClave) {
    if (grupo.length < 2) continue;
    const unificadas = grupo.filter((m) => esRutaUnificada(m.provider));
    const ranuras = grupo.filter((m) => !esRutaUnificada(m.provider));
    // Sin par (todo unificada o todo ranuras) no hay duplicado que colapsar entre
    // familias: dos proveedoras natives distintas conviven a propósito.
    if (unificadas.length === 0 || ranuras.length === 0) {
      // Adentro de la misma familia sí puede haber repetidos literales (la detección
      // corrió dos veces); ahí se queda la primera que llegó.
      if (unificadas.length > 1) {
        for (const sobra of unificadas.slice(1)) {
          descartadas.add(sobra);
          ocultas.push({ oculta: sobra, queda: unificadas[0] });
        }
      }
      continue;
    }
    const gana = pref === "unificada" ? unificadas : ranuras;
    const pierde = pref === "unificada" ? ranuras : unificadas;
    const elegida = gana[0];
    alternativas[clave] = elegida;
    for (const perdedora of pierde) {
      descartadas.add(perdedora);
      ocultas.push({ oculta: perdedora, queda: elegida });
    }
    // Y si la familia ganadora tiene repetidos, también se colapsan.
    for (const sobra of gana.slice(1)) {
      descartadas.add(sobra);
      ocultas.push({ oculta: sobra, queda: elegida });
    }
  }

  return {
    visibles: modelos.filter((m) => !descartadas.has(m)),
    ocultas,
    alternativas,
  };
}

/**
 * Etiqueta de la ruta para el distintivo. Recibe el nombre de la carpeta unificada
 * desde afuera (el dueño es `ranuraUnificada.ts`) para no duplicar el literal: si
 * mañana la carpeta cambia de nombre, acá se entera solo.
 */
export function etiquetaDeRuta(m: { provider: string }, etiquetaUnificada: string): string {
  return esRutaUnificada(m.provider) ? etiquetaUnificada : m.provider;
}

/** Cuántos modelos tienen dos caminos (para decirlo con número, no con adjetivos). */
export function contarDuplicados<T extends { name: string; provider: string }>(
  modelos: readonly T[],
  preferencia: PreferenciaRuta = PREFERENCIA_POR_DEFECTO
): number {
  return cortarDuplicados(modelos, preferencia).ocultas.length;
}
