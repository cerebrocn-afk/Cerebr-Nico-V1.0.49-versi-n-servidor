/**
 * sandboxPreview.ts — GUARDIAS DEL PREVIEW FUERA DEL MONOLITO (v1.0.10)
 * =====================================================================
 * Nace del pedido de la sesión 1794120824912 y del trinquete de superficie:
 * server.ts no crece — se parte. Dos guardias viven acá, puras como pueden
 * serlo con fs inyectado:
 *
 *  · dessecuestrarEntradaPreview — el ciclo «cn-preview.js → cn-preview.js»
 *    (8 veces en el log): el pipeline viejo reescribía el index.html del
 *    usuario para que apuntara al bundle; en el siguiente arranque leía esa
 *    reescritura como si fuera la ENTRADA declarada y rebundleaba su propia
 *    salida. Este guardia reconoce el secuestro, restaura el respaldo, busca
 *    la entrada real, y si nada la encuentra DECLARA el secuestro en vez de
 *    seguir alimentando al bucle.
 *
 *  · verificarEscrituraEnDisco — «write_file miente»: la respuesta ahora se
 *    construye sobre el HECHO (el archivo está en disco con N bytes) y sobre
 *    el último veredicto conocido del quirófano. La reversión de la tanda
 *    ocurre al cerrar el silencio; mientras tanto, la respuesta deja de
 *    prometer lo que no miró.
 */

export interface DepsDessecuestro {
  /** lee index.html (utf8) o null si no existe. */
  leerIndex: () => string | null;
  escribirIndex: (texto: string) => boolean;
  existe: (rel: string) => boolean;
  /** restaura el respaldo histórico (.cn-preview/index.html.orig); true si restauró. */
  restaurarRespaldo: () => boolean;
  nombreBundle: string;
  candidatasEntrada?: string[];
  avisar?: (msg: string) => void;
}

export interface ResultadoDessecuestro {
  /** HTML vigente tras el guardia (posiblemente restaurado/reparado). */
  html: string;
  /** Entrada declarada limpia (nunca el propio bundle) o null si no hay. */
  entrada: string | null;
  /** true: el motor no puede continuar; el mensaje va al usuario/modelo. */
  secuestroDeclarado: boolean;
  mensaje?: string;
  /** true si el HTML en disco fue reparado (única escritura de su clase). */
  reparado: boolean;
}

const CANDIDATAS_POR_DEFECTO = [
  "main.js", "main.ts", "main.tsx", "index.js", "index.ts", "index.tsx",
  "app.js", "app.tsx", "src/main.tsx", "src/main.ts", "src/main.js",
  "src/index.tsx", "src/index.ts", "src/index.js",
];

/** ¿La entrada declarada por el HTML ES el bundle generado (ciclo mortal)? */
export function esPropioBundle(entrada: string | null, nombreBundle: string): boolean {
  return !!entrada && (entrada.split("/").pop() || "") === nombreBundle;
}

/**
 * Ejecuta el guardia. `resolverEntrada(html)` es la misma función que usaba el
 * monolito (entradaDeHtml || puntoDeEntradaVerificable): entra inyectada para
 * que esta pieza no conozca regex de HTML ni el disco.
 */
export function dessecuestrarEntradaPreview(
  deps: DepsDessecuestro,
  resolverEntrada: (html: string) => string | null
): ResultadoDessecuestro {
  const avisar = deps.avisar || (() => {});
  let html = deps.leerIndex() ?? "";
  let entrada = resolverEntrada(html);
  let reparado = false;
  if (!esPropioBundle(entrada, deps.nombreBundle)) {
    return { html, entrada, secuestroDeclarado: false, reparado: false };
  }
  avisar(`Vía rápida: el index.html declara su propio bundle (${deps.nombreBundle}) — posible secuestro del preview.`);
  if (deps.restaurarRespaldo()) {
    html = deps.leerIndex() ?? html;
    entrada = resolverEntrada(html);
  }
  if (esPropioBundle(entrada, deps.nombreBundle) || !entrada) {
    const candidatas = deps.candidatasEntrada || CANDIDATAS_POR_DEFECTO;
    const real = candidatas.find((c) => deps.existe(c));
    if (real) {
      // Reparación ÚNICA del secuestro histórico: el HTML vuelve a declarar su
      // entrada real. Desde esta versión el bundle se inyecta al SERVIR (ver
      // server/sandboxEstatico.ts), nunca en el archivo: esta es la última
      // escritura de su clase.
      const limpio = html.split(deps.nombreBundle).join("./" + real.replace(/^\.\//, ""));
      if (deps.escribirIndex(limpio)) {
        html = limpio;
        reparado = true;
        avisar(`index.html reparado — apunta a ./${real} en vez de ${deps.nombreBundle}.`);
      }
      entrada = "./" + real;
    } else {
      return {
        html,
        entrada: null,
        secuestroDeclarado: true,
        reparado: false,
        mensaje:
          `SECUESTRO DE PREVIEW: el index.html declara su propio bundle generado (${deps.nombreBundle}) y no hay respaldo ni entrada real recuperable en la raíz servida. ` +
          "No se rebundlea la salida sobre sí misma (fue el defecto de 8 ciclos en la sesión anterior). " +
          "Restaurá el index.html a su script de entrada real (main.js, src/main.tsx…) y volvé a pedir el preview.",
      };
    }
  }
  return { html, entrada, secuestroDeclarado: false, reparado };
}

export interface EstadoEscritura {
  enDisco: boolean;
  bytesEsperados: number;
  bytesEnDisco: number;
}

/** ¿El contenido escrito está REALMENTE en disco con los bytes debidos? */
export function verificarEscrituraEnDisco(deps: { stat: (abs: string) => { size: number } | null }, abs: string, content: string): EstadoEscritura {
  const esperado = Buffer.byteLength(content, "utf-8");
  const st = deps.stat(abs);
  return { enDisco: !!st && st.size === esperado, bytesEsperados: esperado, bytesEnDisco: st ? st.size : -1 };
}

/** Resumen del último cierre del quirófano para pegarlo en la respuesta de escritura. */
export function resumenUltimoCierre(v: {
  revertido?: boolean;
  revertidos?: string[];
  motivo?: string;
  puertas?: Array<{ culpables?: string[] }>;
} | null): { tandas_previas_revertidas: number; archivos: string[]; motivo: string } | null {
  if (!v || !v.revertido) return null;
  return {
    tandas_previas_revertidas: 1,
    archivos: (v.revertidos || (v.puertas || []).flatMap((x) => x.culpables || [])).slice(0, 8),
    motivo: String(v.motivo || "").slice(0, 300),
  };
}

/**
 * El HTML reescrito por el pipeline viejo NO puede quedar pegado: si el
 * respaldo existe y el HTML actual sigue apuntando al bundle, el original
 * vuelve a su sitio. (Misma lógica que vivía en el monolito; el monolito
 * ahora solo la llama.)
 */
export function restaurarHtmlOriginal(deps: {
  leer: (abs: string) => string | null;
  escribir: (abs: string, texto: string) => void;
  rutaHtml: string;
  rutaRespaldo: string;
  nombreBundle: string;
  avisar?: (msg: string) => void;
}): boolean {
  try {
    const respaldo = deps.leer(deps.rutaRespaldo);
    if (respaldo === null) return false;
    const actual = deps.leer(deps.rutaHtml) || "";
    if (!actual.includes(deps.nombreBundle)) return false;
    deps.escribir(deps.rutaHtml, respaldo);
    (deps.avisar || (() => {}))("Sandbox: index.html restaurado (apuntaba al bundle de la vía rápida).");
    return true;
  } catch {
    return false;
  }
}
