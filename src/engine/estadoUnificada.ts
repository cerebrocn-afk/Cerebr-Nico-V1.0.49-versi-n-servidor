/**
 * estadoUnificada.ts — POR QUÉ LA CARPETA 🧩 ESTÁ VACÍA (v1.95.2)
 * ==============================================================
 * Queja de Mario (30/10, otra vez): «los unificados nunca cargaron».
 *
 * En la 1.94.1 se cerraron dos cerrojos medidos (un solo intento por arranque, y la
 * sonda de catálogo pasando por el fusible de la nube, que metía en cuarentena a SU
 * PROPIA MÁQUINA). La valla de esa tanda lo congeló, y en el comentario quedó escrito,
 * entre paréntesis, el tercero: «el tercero es de redacción de mensajes». Ese tercero
 * es el que él sigue viendo, y no era de redacción: era de cable.
 *
 * Medido en el camino real:
 *   · `App.tsx:2531` `fetchCustomModels` — si no hay URL guardada, escribe una línea en
 *     la TERMINAL y vuelve. Si el sondeo falla, `catch` (línea 2566) escribe otra línea
 *     en la TERMINAL y vuelve. En los dos casos `detectedCustomModels` queda en `[]`.
 *   · `ModelSelectorModal.tsx:1127` muestra la pestaña con el contador
 *     `🧩 … (${detectedCustomModels.length})` → «(0)», sin una sola palabra de por qué.
 *   · y el reintento automático de la 1.94.1 (App:2641) se agota en ~30 s
 *     (1200 + 2700 + 4200 + 5700 + 7200 + 8700 ms): un router que levanta después de
 *     ese minuto —o que el usuario configura con la IDE abierta— ya no tiene nadie que
 *     lo consulte hasta el próximo reinicio.
 *
 * O sea: desde la pantalla donde se elige el modelo, "no hay URL", "el endpoint no
 * contestó", "contestó 0 modelos" y "todavía estoy sondeando" se ven IDÉNTICOS: una
 * carpeta vacía. Un usuario no puede distinguir "no lo configuraste" de "no funciona",
 * y con razón concluye que nunca cargan.
 *
 * Este módulo es el criterio puro de ese estado: recibe lo que la interfaz sabe y
 * devuelve TÍTULO, DETALLE y ACCIÓN. La UI lo pinta; acá se prueba.
 */

export interface EstadoCarpetaUnificada {
  /** Hay URL guardada en la ranura (`codigo0_custom_server_url`). */
  hayUrl: boolean;
  /** Un sondeo está en vuelo ahora mismo. */
  sondeando: boolean;
  /** Modelos ya cargados en la carpeta. */
  total: number;
  /** Intentos automáticos hechos / tope. */
  intentos: number;
  maxIntentos: number;
  /** Último error del sondeo, ya redactado por `redaccionSecretos`. */
  ultimoError?: string | null;
  /** Endpoint exacto que se probó (para que el detalle diga DÓNDE se miró). */
  endpoint?: string | null;
  /** Cuándo se probó por última vez (epoch ms) o null si nunca se probó. */
  ultimoIntentoEn?: number | null;
}

export type AccionUnificada = "configurar" | "reintentar" | "esperar" | "recargar" | "ninguna";

export interface DictamenUnificada {
  titulo: string;
  detalle: string;
  accion: AccionUnificada;
  /** Texto del botón, en voz del usuario. Vacío si no hay botón. */
  boton: string;
  /** `error` pinta rojo, `aviso` ámbar, `ok` neutro, `espera` gris. */
  tono: "error" | "aviso" | "ok" | "espera";
}

/** Cuántos segundos han pasado desde el último intento legible para un humano. */
function haceSegundos(desde: number | null | undefined, ahora: number): number | null {
  if (!desde || !Number.isFinite(desde)) return null;
  const s = Math.round((ahora - desde) / 1000);
  return s >= 0 ? s : null;
}

/**
 * El dictamen que ve la carpeta. Orden deliberado: primero lo que el usuario puede
 * arreglar sin esperar (falta de configuración), después lo que se resuelve con un
 * clic (fallo de sondeo), y al final los estados de espera.
 */
export function dictamenCarpetaUnificada(
  e: EstadoCarpetaUnificada,
  ahora: number = Date.now()
): DictamenUnificada {
  if (!e.hayUrl) {
    return {
      titulo: "Sin endpoint configurado",
      detalle:
        "La carpeta no tiene nada que listar hasta que la ranura «API Unificada» tenga la URL de su API "
        + "OpenAI-compatible (algo como http://127.0.0.1:3001/v1). No va una carpeta del disco: va una URL.",
      accion: "configurar",
      boton: "Abrir ranuras",
      tono: "aviso",
    };
  }

  if (e.sondeando) {
    return {
      titulo: "Sondeando el endpoint…",
      detalle: `Pidiendo la lista de modelos${e.endpoint ? ` en ${e.endpoint}` : ""}. Un router lento o recién encendido puede tardar unos segundos.`
        + (e.total > 0 ? ` (ya hay ${e.total} cargados).` : "."),
      accion: "esperar",
      boton: "",
      tono: "espera",
    };
  }

  if (e.ultimoError) {
    const hace = haceSegundos(e.ultimoIntentoEn, ahora);
    return {
      titulo: "El endpoint no respondió",
      detalle:
        `${e.ultimoError}`
        + (e.endpoint ? `\nSe probó: ${e.endpoint}` : "")
        + (hace != null ? `\nÚltimo intento hace ${hace} s.` : "")
        + "\nEsto no sanciona tu máquina: el sondeo de una API local no pasa por el fusible de la nube.",
      accion: "reintentar",
      boton: "Reintentar ahora",
      tono: "error",
    };
  }

  if (e.total > 0) {
    const hace = haceSegundos(e.ultimoIntentoEn, ahora);
    return {
      titulo: `${e.total} modelo${e.total === 1 ? "" : "s"} de la API unificada`,
      detalle: e.endpoint ? `Cargados desde ${e.endpoint}${hace != null ? ` (hace ${hace} s)` : ""}.` : "Cargados.",
      accion: "recargar",
      boton: "Volver a sondear",
      tono: "ok",
    };
  }

  // Hay URL, no hay error y la carpeta sigue vacía: o no se sondeó nunca, o el endpoint
  // respondió 0 modelos, o se agotaron los reintentos automáticos.
  if (!e.ultimoIntentoEn) {
    return {
      titulo: "Todavía no se sondeó este endpoint",
      detalle:
        "Hay URL configurada pero la IDE no llegó a pedirle la lista (el sondeo de arranque "
        + "se agota a los " + e.maxIntentos + " intentos, ~30 s). Se prueba apenas se abre este selector.",
      accion: "reintentar",
      boton: "Sondear ahora",
      tono: "aviso",
    };
  }
  if (e.intentos >= e.maxIntentos) {
    return {
      titulo: "El endpoint respondió 0 modelos",
      detalle:
        `Se pidieron los modelos ${e.intentos} veces${e.endpoint ? ` a ${e.endpoint}` : ""} y la lista vino vacía: 0 modelos. `
        + "Suele ser un endpoint sin modelos montados, o una ruta /v1 que contesta otra cosa. "
        + "Reintentar sigue disponible acá abajo.",
      accion: "reintentar",
      boton: "Reintentar ahora",
      tono: "aviso",
    };
  }
  return {
    titulo: "Esperando al endpoint unificado",
    detalle:
      `Intento ${e.intentos} de ${e.maxIntentos}${e.endpoint ? ` sobre ${e.endpoint}` : ""}. `
      + "Si el router todavía no arrancó, la carpeta se sola se llena cuando aparezca.",
    accion: "esperar",
    boton: "Sondear ya",
    tono: "espera",
  };
}

/** Umbral de reintentos: se exporta para que App y la valla no discrepen del número. */
export const INTENTOS_UNIFICADA_TOPE = 6;

export const VERSION_ESTADO_UNIFICADA = "1.95.2";
