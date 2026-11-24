/**
 * parcheRango.ts — v1.57.15 · EDITAR SIN PISAR (núcleo puro de `apply_patch`)
 * ===========================================================================
 * POR QUÉ EXISTE
 * --------------
 * El bucle del agente tiene SIETE verbos medidos en el fuente: run_command (11),
 * write_file (10), read_file (10), list_files (8), run_tests (6), delete_file (4)
 * y grep (3). No hay forma de editar un pedazo: para cambiar tres líneas de un
 * archivo de 12131, el modelo tiene que reescribir los 12131 desde cero. Esa es
 * la vía #1 de romper algo por accidente — y acá ya se vio: el usuario perdió un
 * `index.html` con el `src/` borrado en un re-empaquetado, y la IDE tiene un
 * `registrarCirugiaQf` cuyo trabajo es reconstruir ese desastre.
 *
 * QUÉ APORTA ESTE MÓDULO
 * ----------------------
 * Un parche por RANGO DE LÍNEAS que exige prueba de lectura: si el rango dice
 * «reemplazo las líneas 120 a 124» y trae el `esperado` de esas líneas, se
 * compara contra el archivo real y **se niega** si no calzan. No es un detalle
 * de finura: es lo que convierte alucinación en error ruidoso. Un modelo que
 * inventa el contenido actual de un archivo no puede escribirlo; un modelo que
 * lo leyó, pasa.
 *
 * TRES NEGACIONES más, cada una con causa nombrrada (la casa no devuelve
 * `false` mudo):
 *   · solapamiento entre parches de un mismo turno — el segundo borraria lo del
 *     primero en silencio;
 *   · un rango que reemplaza más de LIMITE_LINEAS_PARCHABLE: eso ya no es un
 *     parche, es un `write_file` disfrazado, y hay que decirlo;
 *   · líneas fuera de rango o rango invertido.
 *
 * Es PURO: no toca `fs`, no sabe de rutas, no ejecuta. Recibe el texto que el
 * llamante ya leyó y devuelve el texto nuevo o el motivo del rechazo. Así se
 * puede probar cada rama sin disco y sin modelo — y el llamante (la herramienta
 * del bucle) queda delgado: leer, aplicar, escribir por el guardián.
 */

/** Líneas reemplazadas por arriba de las cuales esto deja de ser un parche. */
export const LIMITE_LINEAS_PARCHABLE = 200;
/** Líneas de contexto que se muestran en el motivo del rechazo. */
const CONTEXTE_RECHAZO = 2;

export interface RangoParche {
  /** 1-based, inclusivo. */
  lineaInicio: number;
  /** 1-based, inclusivo. Debe ser >= lineaInicio. */
  lineaFin: number;
  /**
   * El contenido EXACTO que el modelo cree que está ahí. Si se omite, el parche
   * se aplica SIN verificación (`verificado: false`) y el llamante decide si lo
   * acepta: la default honesta es pedirlo.
   */
  esperado?: string[];
  /** Las líneas nuevas que entran. Vacío = borrado puro. */
  nuevas: string[];
}

export interface ResultadoParche {
  ok: boolean;
  /** El archivo completo resultante (solo si ok). */
  contenido?: string;
  /** Lo que se reemplazó realmente, para el parte/rollback. */
  reemplazado?: string[];
  /** true si el `esperado` existía y calzó. Sin `esperado`, false. */
  verificado: boolean;
  lineasAfectadas: number;
  /** Nombre la causa del rechazo con el dato que hay que corregir. */
  motivo?: string;
  /** true si el parche solo borra (nuevas vacío): el llamante puede exigir confirmación. */
  esBorrado?: boolean;
}

const cortar = (texto: string): { lineas: string[]; remate: string } => {
  const remate = texto.endsWith("\n") ? "\n" : "";
  const cuerpo = remate ? texto.slice(0, -1) : texto;
  return { lineas: cuerpo.split("\n"), remate };
};

const vistaDe = (lineas: string[], desde: number): string =>
  lineas.slice(desde, desde + CONTEXTE_RECHAZO).map((l, i) => `    ${desde + i + 1}| ${l}`).join("\n");

/** Un rango se valida contra el archivo REAL, no contra la esperanza del modelo. */
function prevalidar(p: RangoParche, total: number): string | null {
  if (!Number.isInteger(p.lineaInicio) || !Number.isInteger(p.lineaFin)) {
    return "el rango tiene que ser de líneas enteras (no 12,5)";
  }
  if (p.lineaInicio < 1) return `lineaInicio ${p.lineaInicio} no existe: el archivo empieza en 1`;
  if (p.lineaFin < p.lineaInicio - 1) return `rango invertido: inicio ${p.lineaInicio} > fin ${p.lineaFin}`;
  // `fin === inicio - 1` es el rango VACÍO: inserción pura antes de `inicio`, que
  // es como un agente agrega una línea sin reemplazar nada.
  if (p.lineaInicio > total + 1) return `el rango empieza en ${p.lineaInicio} y el archivo tiene ${total} líneas`;
  if (p.lineaFin > total) return `el rango termina en ${p.lineaFin} y el archivo tiene ${total} líneas`;
  const ancho = p.lineaFin - p.lineaInicio + 1;
  if (ancho > LIMITE_LINEAS_PARCHABLE) {
    return `querés reemplazar ${ancho} líneas (tope ${LIMITE_LINEAS_PARCHABLE}): eso no es un parche, es un write_file disfrazado`;
  }
  if (!Array.isArray(p.nuevas)) return "las líneas nuevas tienen que ser un arreglo de texto";
  return null;
}

/**
 * Aplica UN parche por rango. `esperado` es la prueba de lectura: si se provee,
 * el rango debe calzar carácter por carácter (se tolera ONLY la diferencia de
 * fin de línea \r\n — que en este repo es regla para los .bat y no es un error
 * del modelo).
 */
export function aplicarParche(textoOriginal: string, p: RangoParche): ResultadoParche {
  const { lineas, remate } = cortar(String(textoOriginal ?? ""));
  const total = lineas.length;
  const mal = prevalidar(p, total);
  if (mal) return { ok: false, verificado: false, lineasAfectadas: 0, motivo: mal };

  const i = p.lineaInicio - 1;
  const j = p.lineaFin; // slice es exclusivo al final, y lineaFin es inclusivo 1-based
  const reemplazado = lineas.slice(i, j);

  if (p.esperado && p.esperado.length) {
    if (p.esperado.length !== reemplazado.length) {
      return {
        ok: false, verificado: false, lineasAfectadas: 0,
        motivo: `dijiste que el rango tenía ${p.esperado.length} líneas y tiene ${reemplazado.length} (${p.lineaInicio}-${p.lineaFin})`,
      };
    }
    const normal = (l: string) => l.replace(/\r$/, "");
    for (let k = 0; k < p.esperado.length; k++) {
      if (normal(p.esperado[k]) !== normal(reemplazado[k])) {
        return {
          ok: false, verificado: false, lineasAfectadas: 0,
          motivo:
            `la línea ${p.lineaInicio + k} no es lo que dijiste.\n` +
            `  vos: ${JSON.stringify(normal(p.esperado[k]))}\n` +
            `  real:\n${vistaDe(lineas, Math.max(0, p.lineaInicio - 1 + k))}\n` +
            `  Leé el archivo de nuevo y repetí el rango.`,
        };
      }
    }
  }

  // Un archivo con CRLF —regla de la casa para los .bat, que en LF "se cierran
  // enseguida"— recibe sus líneas nuevas con CRLF. Si el modelo manda
  // "set X=2" sin el \r, el parche metería finales mezclados en el medio.
  const esCrlf = /\r\n/.test(String(textoOriginal ?? ""));
  const nuevas = esCrlf ? p.nuevas.map((l) => (l.endsWith("\r") ? l : `${l}\r`)) : p.nuevas;
  const salida = [...lineas.slice(0, i), ...nuevas, ...lineas.slice(j)];
  return {
    ok: true,
    contenido: salida.join("\n") + remate,
    reemplazado,
    verificado: !!(p.esperado && p.esperado.length),
    lineasAfectadas: reemplazado.length,
    esBorrado: p.nuevas.length === 0,
  };
}

/**
 * Varios rangos del MISMO turno. Se aplican de abajo hacia arriba para que las
 * numeraciones no se corran, y se niega cualquier solapamiento: dos parches que
 * tocan la misma línea es un conflicto de intención, no un caso a resolver.
 */
export function aplicarParches(textoOriginal: string, parches: RangoParche[]): ResultadoParche {
  if (!Array.isArray(parches) || !parches.length) {
    return { ok: false, verificado: false, lineasAfectadas: 0, motivo: "sin parches no hay nada que hacer" };
  }
  const orden = parches.map((p, idx) => ({ p, idx })).sort((a, b) => b.p.lineaInicio - a.p.lineaInicio);
  for (let k = 0; k < orden.length - 1; k++) {
    const superior = orden[k].p, inferior = orden[k + 1].p;
    if (inferior.lineaFin >= superior.lineaInicio) {
      return {
        ok: false, verificado: false, lineasAfectadas: 0,
        motivo: `los parches ${orden[k + 1].idx + 1} y ${orden[k].idx + 1} se solapan (${inferior.lineaFin} >= ${superior.lineaInicio}): no se resuelve solo, elegí un rango`,
      };
    }
  }
  let texto = String(textoOriginal ?? "");
  const detalles: { reemplazado: string[]; idx: number }[] = [];
  let verificado = true, afectadas = 0, huboBorrado = false;
  for (const { p, idx } of orden) {
    const r = aplicarParche(texto, p);
    if (!r.ok) return { ...r, motivo: `parche ${idx + 1}: ${r.motivo}` };
    texto = r.contenido ?? texto;
    verificado = verificado && r.verificado;
    afectadas += r.lineasAfectadas;
    if (r.esBorrado) huboBorrado = true;
    detalles.push({ reemplazado: r.reemplazado ?? [], idx });
  }
  return {
    ok: true, contenido: texto, verificado, lineasAfectadas: afectadas,
    esBorrado: huboBorrado,
    reemplazado: detalles.sort((a, b) => a.idx - b.idx).flatMap((d) => d.reemplazado),
  };
}

/**
 * Dificultad del parche, para que el llamante pueda NEGARSE a aceptar parches
 * gigantes de un modelo chico sin cortar el turno: un 0.5B editando 180 líneas
 * es un write_file con pasos intermedios.
 */
export function dificultadParche(p: RangoParche): "chica" | "media" | "sospechosa" {
  const ancho = Math.max(0, p.lineaFin - p.lineaInicio + 1);
  const delta = Math.abs(p.nuevas.length - ancho);
  if (!p.esperado || !p.esperado.length) return delta > ancho ? "sospechosa" : "media";
  if (ancho <= 3 && delta <= 3) return "chica";
  if (ancho >= LIMITE_LINEAS_PARCHABLE / 2) return "sospechosa";
  // Un modelo chico que reemplaza 2 líneas por 90 está regenerando el archivo por
  // partes: el riesgo de pisar es el de un write_file, no el de un parche.
  if (delta > Math.max(20, ancho)) return "sospechosa";
  return "media";
}
