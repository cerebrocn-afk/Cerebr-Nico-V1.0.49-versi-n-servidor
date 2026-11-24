/**
 * limpiezaTarea.ts — LA CONDUCTA DE LIMPIAR DESPUÉS DE LA TAREA (v2.3.9)
 * =====================================================================
 * Pedido de Mario (04/11/2026), textual: «esa conducta de limpiar luego de la
 * tarea va para md. al igual que todo este proceso, automejora».
 *
 * ── EL HECHO QUE ORIGINÓ ESTA REGLA ─────────────────────────────────────────
 * En la sesión del 04/11 el agente fue a mirar dos ZIP en `Downloads`, y para
 * hacerlo dejó OCHO scripts suyos y una carpeta con 18 archivos extraídos:
 *   _aplicar_parche.cjs · _estado_actual.cjs · _listar_parche.cjs
 *   _listar_parche.ps1 · _ls.cjs · _verif_parche.cjs · _verif_suites.cjs
 *   _mv.cjs · _parche_tmp/ (18 archivos)
 * Además dejó basura en `app/`: _build_bg.cjs, _chk_build.cjs,
 * _chk_interruptor.cjs, _espera.cjs, _l2.cjs, _leer_validar.cjs, _leer2.py,
 * _limpiar2.py, _esperar_veredicto.py, _veredicto.py, _verif_horma/,
 * __pycache__/, validar_out.txt.
 *
 * Y la suite `peluza` —que barre la raíz buscando basura— se puso ROJA con
 * razón. El fallo no era del código: era del agente. Eso es lo que esta regla
 * existe para que no vuelva a pasar.
 *
 * ── POR QUÉ ES UN MÓDULO Y NO UNA FRASE EN UN PROMPT ────────────────────────
 * Una frase en un prompt se olvida en el turno 30. Un módulo con lista de
 * patrones y veredicto se puede PROBAR, y una suite puede exigir que la raíz
 * quede limpia. La conducta se vuelve medible o no se vuelve conducta.
 *
 * ── LAS TRES REGLAS, EN ORDEN DE FUERZA ─────────────────────────────────────
 *  1. NO DEJAR: el temporal se crea DENTRO del proyecto (`.tmp-tarea/`), nunca
 *     en `Downloads`, `Desktop` ni la raíz del disco. Si hay que leer un ZIP
 *     ajeno, se lee desde su ruta sin extraerlo a otro sitio.
 *  2. BORRAR AL CERRAR: todo lo que el agente creó para trabajar se borra al
 *     terminar la tarea, ANTES de decir «listo». Un temporal vivo es una tarea
 *     sin cerrar.
 *  3. RESPALDO NO ES BASURA: lo que el usuario pidió conservar (un respaldo
 *     previo a un parche, por ejemplo) NO se borra solo; se nombra y se deja
 *     que el usuario decida. Borrar el respaldo del usuario sería el error
 *     inverso y peor.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────────────
 * No borra nada. Es criterio puro: clasifica rutas y dice qué hacer con cada
 * una. La ejecución sigue en `fs_delete` / `delete_file`, que ya existen y ya
 * mandan a papelera. Igual que `automejora.ts`: criterio acá, manos allá.
 */

export const VERSION_LIMPIEZA = "1.0.0";

/** Qué hacer con una ruta que el agente encontró al cerrar la tarea. */
export type DestinoDeRuta =
  | "borrar"        // temporal propio: se va, sin preguntar
  | "conservar"     // respaldo o entrega del usuario: se queda, se nombra
  | "preguntar"     // no es mío y no sé si es del usuario: se pregunta
  | "prohibido";    // secreto o artefacto: NUNCA se toca, ni para borrarlo

export interface ClasificacionDeRuta {
  ruta: string;
  destino: DestinoDeRuta;
  porQue: string;
}

/**
 * Prefijos de temporal PROPIO. Todo lo que el agente crea para trabajar lleva
 * guion bajo adelante (`_algo.cjs`) o vive en una carpeta de trabajo conocida.
 * La convención no es estética: es lo que permite distinguir «esto lo dejé yo»
 * de «esto es del usuario» sin adivinar por fecha.
 */
export const PREFIJOS_TEMPORAL_PROPIO: ReadonlyArray<string> = [
  "_",              // _aplicar_parche.cjs, _verif_suites.cjs, _l2.cjs…
  ".tmp-tarea/",    // la carpeta de trabajo oficial del agente
  "validar_out.txt",
  "_validar_out.txt",
  "_parche_tmp/",
];

/** Carpetas de trabajo que el agente puede crear y DEBE vaciar al cerrar. */
export const CARPETAS_DE_TRABAJO: ReadonlyArray<string> = [
  ".tmp-tarea",
  "_parche_tmp",
  "__pycache__",
];

/**
 * Lo que NUNCA se borra, ni siquiera siendo temporal: son secretos o
 * artefactos. Si aparecen en el barrido, se reportan y se dejan quietos.
 * Borrar un `.env` «por limpieza» es destruir configuración del usuario.
 */
export const NUNCA_TOCAR: ReadonlyArray<string> = [
  ".env",
  ".env.local",
  ".env.production",
  ".pem",
  ".key",
  ".p12",
  "id_rsa",
  ".npmrc",
  ".netrc",
  "credentials.json",
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  "coverage/",
  ".venv/",
  ".proyectos/",
  "proyectos/",
];

/**
 * Lo que se CONSERVA y se nombra al usuario: respaldos y entregas. No es basura
 * aunque tenga guion bajo, porque su contenido es el estado anterior de algo
 * que el usuario pidió cambiar.
 */
export const SE_CONSERVA: ReadonlyArray<string> = [
  "_respaldo-",
  "_backup-",
  ".cerebro-papelera/",
];

function normalizar(ruta: string): string {
  return String(ruta ?? "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

/**
 * Clasifica UNA ruta. El orden importa: primero lo prohibido (secretos), luego
 * lo que se conserva (respaldos), luego lo propio (temporales), y lo que no
 * encaja en ninguna se pregunta — nunca se borra por descarte.
 */
export function clasificarRuta(ruta: string): ClasificacionDeRuta {
  const r = normalizar(ruta);
  if (!r) return { ruta, destino: "preguntar", porQue: "ruta vacía: no se puede clasificar" };

  const prohibido = NUNCA_TOCAR.find((p) => r === p || r.startsWith(p) || r.endsWith(p));
  if (prohibido) {
    return {
      ruta: r,
      destino: "prohibido",
      porQue: `«${prohibido}» es secreto o artefacto: no se borra ni se mueve, ni siquiera por limpieza`,
    };
  }

  const conservar = SE_CONSERVA.find((p) => r.includes(p));
  if (conservar) {
    return {
      ruta: r,
      destino: "conservar",
      porQue: `«${conservar}» es respaldo o papelera: se queda y se nombra al usuario, no se borra solo`,
    };
  }

  const propio = PREFIJOS_TEMPORAL_PROPIO.find((p) => r.startsWith(p) || r.includes(`/${p}`));
  if (propio) {
    return {
      ruta: r,
      destino: "borrar",
      porQue: `«${propio}» es temporal del agente: se borra al cerrar la tarea`,
    };
  }

  return {
    ruta: r,
    destino: "preguntar",
    porQue: "no es temporal reconocible ni respaldo: si no lo creó el agente, no lo borra el agente",
  };
}

export interface BarridoDeCierre {
  borrar: string[];
  conservar: string[];
  preguntar: string[];
  prohibido: string[];
  /** `true` sólo si no queda NADA por borrar ni por preguntar. */
  limpio: boolean;
  /** Frase para el chat: qué se hizo y qué queda. Nunca muda. */
  informe: string;
}

/**
 * El barrido de cierre: recibe lo que el agente creó en el turno y devuelve el
 * plan de limpieza. `limpio` es la condición que se exige ANTES de decir
 * «listo» — si queda un temporal, la tarea no está cerrada.
 */
export function barrerAlCerrar(rutasCreadas: string[]): BarridoDeCierre {
  const sale: BarridoDeCierre = { borrar: [], conservar: [], preguntar: [], prohibido: [], limpio: false, informe: "" };
  for (const ruta of rutasCreadas) {
    const c = clasificarRuta(ruta);
    if (c.destino === "borrar") sale.borrar.push(c.ruta);
    else if (c.destino === "conservar") sale.conservar.push(c.ruta);
    else if (c.destino === "prohibido") sale.prohibido.push(c.ruta);
    else sale.preguntar.push(c.ruta);
  }
  sale.limpio = sale.borrar.length === 0 && sale.preguntar.length === 0;

  const partes: string[] = [];
  if (sale.borrar.length) partes.push(`${sale.borrar.length} temporal(es) borrado(s)`);
  if (sale.conservar.length) partes.push(`${sale.conservar.length} respaldo(s) conservado(s): ${sale.conservar.join(", ")}`);
  if (sale.preguntar.length) partes.push(`${sale.preguntar.length} ruta(s) sin clasificar, se pregunta antes de tocar: ${sale.preguntar.join(", ")}`);
  if (sale.prohibido.length) partes.push(`${sale.prohibido.length} secreto(s)/artefacto(s) intacto(s): ${sale.prohibido.join(", ")}`);
  sale.informe = partes.length ? partes.join(" · ") : "nada que limpiar: el turno no dejó temporales";
  return sale;
}

/**
 * ¿Dónde se permite crear un temporal? Dentro del proyecto, en `.tmp-tarea/`.
 * Fuera de ahí (Downloads, Desktop, la raíz del disco) no: el usuario no pidió
 * que le ensucien la carpeta personal para leer un ZIP.
 */
export function rutaDeTrabajoPermitida(ruta: string): { ok: boolean; porQue: string } {
  const r = normalizar(ruta);
  const fuera = ["Downloads/", "Desktop/", "Documents/", "Escritorio/", "Descargas/"];
  const golpe = fuera.find((f) => r.startsWith(f) || r.includes(`/${f}`));
  if (golpe) {
    return {
      ok: false,
      porQue: `«${r}» cae en ${golpe}: los temporales van a .tmp-tarea/ dentro del proyecto, no a la carpeta personal del usuario`,
    };
  }
  if (r.startsWith(".tmp-tarea/")) return { ok: true, porQue: "carpeta de trabajo oficial del agente" };
  return { ok: true, porQue: "dentro del proyecto: aceptable, pero se borra al cerrar" };
}

/** Inventario legible para el manual: qué se borra, qué se conserva, qué no se toca. */
export function inventarioDeLimpieza(): { borrar: string[]; conservar: string[]; nunca: string[] } {
  return {
    borrar: [...PREFIJOS_TEMPORAL_PROPIO],
    conservar: [...SE_CONSERVA],
    nunca: [...NUNCA_TOCAR],
  };
}
