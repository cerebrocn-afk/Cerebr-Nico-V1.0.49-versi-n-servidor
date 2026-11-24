/**
 * hemisferios.ts · EL CEREBRO DE DOS MITADES, RECONOCIDO EN TOTAL (v1.99.0)
 * =========================================================================
 * Mario lo describió así el 31/10: «EL CEREBRO IZQUIERDO Y EL DERECHO, LA INTERFAZ
 * ESTÁ EN EL MEDIO, CARPETA RAÍZ DE INSTALADOR O EXE, MITAD DE CEREBRO/DOCUMENTACIÓN
 * EN DISCO C:\CEREBRONICO, LA OTRA MITAD Y ESPEJO DE BASE DE DATOS».
 *
 * Y el 1/11 me pasó la carpeta real para corroborarlo. Medido ahí, de 69 archivos:
 *   · el hemisferio DERECHO está vivo en lo que importa — `LECCIONES.md` (L37/L38 las
 *     escribió el propio motor), `.cerebro-db/kb.json` (236 K), `auditoria.jsonl` (72 K),
 *     `perfeccion.md`, `.cerebronico/espejos`, `.cerebro-papelera/` con sus papelizados;
 *   · pero `cerebro/` está VACÍO y NO EXISTE `vectores.json` en la raíz de datos: los
 *     órganos no están arraigados y el índice vectorial no tiene domicilio. Ese es el
 *     "fallback por palabra" PERMANENTE, más allá del keep_alive de la 1.99.0;
 *   · 49 de los 69 archivos son pelusa del modelo pago (30 `.py` de sondeo, 4 `.txt`,
 *     4 `.log`, 6 `.bak-*`, 5 `.bat` de prueba).
 *
 * Este módulo es el DUEÑO puro de dos cosas que en la casa siempre van juntas:
 *   1. el mapa de hemisferios con sus referencias CRUZADAS (de instalación a datos y de
 *      datos a instalación — si una sola dirección existe, el cerebro está escindido);
 *   2. la ley de la limpieza «SÓLO RESIDUO»: qué es núcleo intocable del derecho y qué
 *      es pelusa que se papeliza. La regla del `.py` en la raíz de datos es dura y está
 *      justificada: los daemon reales viven en el árbol de INSTALACIÓN (`scripts\
 *      hindsight_daemon.py`, lo lanzan los .bat con esa ruta), así que un `.py` suelto
 *      en C:\Cerebronico es, por definición, residuo de una corrida.
 *
 * Sin fs, sin shell: el cable es `scripts/limpiar-raiz.mjs` y la valla es
 * `tests/hemisferios.test.ts`.
 */

/** Hemisferio IZQUIERDO: la instalación (exe/árbol). Leyes, manuales, contratos, código. */
export const HEMISFERIO_IZQUIERDO = {
  nombre: "izquierdo",
  asiento: "instalación",
  piezas: [
    { rel: "cerebro.md", que: "las leyes del agente, el protocolo de abordaje, el registro" },
    { rel: "manual-motor", que: "el manual del motor que el abordaje exige leer" },
    { rel: "RUTAS-DEL-SISTEMA.md", que: "el mapa de rutas, verificado contra disco" },
    { rel: "server.ts", que: "el monolito: un solo dueño del ciclo" },
    { rel: "agent_bridge_5000.py", que: "el puente al PC" },
    { rel: "scripts/hindsight_daemon.py", que: "el daemon de memoria (se lanza DESDE ACÁ)" },
    { rel: "scripts/creador_daemon.py", que: "el daemon de sitios web" },
    { rel: "src/engine", que: "los órganos puros: cerebroOrgano, embedderResidencia, ventanaMensajes…" },
  ],
};

/** Hemisferio DERECHO: la raíz de datos (`C:\Cerebronico`). Memoria, órganos, espejos. */
export const HEMISFERIO_DERECHO = {
  nombre: "derecho",
  asiento: "raíz de datos",
  piezas: [
    // Corregido el 1/11 contra el disco real subido por Mario y contra `cerebroOrgano`: el espejo
  // NO es `cerebro.md` en la raíz — es `cerebro/CEREBRO.md`, y lo escribe `guardarIndice`. Antes
  // del primer arraigo no existe; declararlo donde nunca se escribió hacía el mapa hermoso y falso.
  { rel: "cerebro/CEREBRO.md", que: "la cara humana del índice: la escribe guardarIndice al enraizar" },
    { rel: "cerebro", que: "los órganos enraigados (HOY VACÍO: el hallazgo del 1/11)" },
    { rel: "cerebro/vectores.json", que: "el índice vectorial (HOY NO EXISTE: por eso el cerebro nunca vectoriza en el disco)" },
    { rel: ".cerebro-db", que: "kb.json, auditoria.jsonl, lecciones-firmas.json, espejos-salud.json" },
    { rel: "LECCIONES.md", que: "las L que escribió el propio motor, inyectadas en cada turno" },
    { rel: "REANUDAR.md", que: "estado de servicios al empezar el turno (el asiento natural del autollamado)" },
    { rel: "perfeccion.md", que: "el informe de auditoría continua" },
    { rel: "puente-permitidos.json", que: "la lista blanca de binarios del puente" },
    { rel: "arrancar_puente.bat", que: "el arranque del puente por fuera del dev" },
    { rel: "arrancar_todo.bat", que: "el arranque completo, que escribe REANUDAR.md" },
    { rel: "parar_servicios.bat", que: "bajar todo sin matar a mano" },
    { rel: ".cerebronico", que: "espejos de salud y telemetría" },
    { rel: ".cerebro-papelera", que: "la papelera de la casa: nada se borra a sangre" },
    { rel: ".cn-quirofano", que: "la última cirugía registrada" },
  ],
};

/**
 * Referencias que tienen que existir en LOS DOS SENTIDOS. Una mitad que nombra a la
 * otra sin que la otra la nombre es un cerebro escindido: el usuario ve "dos carpetas"
 * en lugar de un órgano. Cada par se verifica contra el disco en `rutasSistema`.
 */
export const REFERENCIAS_CRUZADAS: Array<{ izquierdo: string; derecho: string; porQue: string }> = [
  { izquierdo: "cerebro.md", derecho: "cerebro/CEREBRO.md", porQue: "las leyes se leen de los dos lados: el espejo lo escribe el índice, no una copia a mano que diverge" },
  { izquierdo: "src/engine/cerebroOrgano.ts", derecho: "cerebro/vectores.json", porQue: "el dueño del índice dice DÓNDE vive, y el disco tiene que contestarle" },
  { izquierdo: "iniciar_todo_windows.bat", derecho: "REANUDAR.md", porQue: "el lanzador escribe el estado; el motor lo lee al empezar" },
  { izquierdo: "server.ts", derecho: "LECCIONES.md", porQue: "el system prompt inyecta las L del disco, no una copia compilada" },
  { izquierdo: "agent_bridge_5000.py", derecho: "puente-permitidos.json", porQue: "la lista blanca se lee desde la raíz de datos, no del .py" },
];

/* ═══ LA LEY DE LA LIMPIEZA («SÓLO RESIDUO», 1/11) ═══ */

/** Directorios del derecho que NUNCA se tocan: ahí vive la memoria aprendida. */
export const NUCLEO_CARPETAS = [
  "cerebro", ".cerebro-db", ".cerebronico", ".cerebro-papelera", ".cn-quirofano",
  ".creador", ".proyectos", "control-dinero", "web-cerebronico",
];

/** Archivos del derecho que NUNCA se tocan. */
export const NUCLEO_ARCHIVOS = [
  "LECCIONES.md", "REANUDAR.md", "perfeccion.md", "perfeccion.json",
  "memory_evolution.json", "puente-permitidos.json",
  "arrancar_puente.bat", "arrancar_todo.bat", "parar_servicios.bat",
  "cerebro.md", "memoria.md", "cerebro_backend.md", "cerebro_frontend.md",
];

/**
 * ¿Esta pieza de la RAÍZ DE DATOS es residuo de una corrida (se papeliza) o es núcleo
 * (no se toca)? Duro y justificado: cualquier `.py` suelto en la raíz de datos es
 * residuo, porque los daemon reales viven en la instalación.
 */
export function esResiduoDatos(rel: string): boolean {
  const r = String(rel || "").split("\\").join("/").replace(/^\.\/+/, "");
  if (!r || r.includes("/")) return false; // sólo la raíz de datos; adentro de una carpeta núcleo no mandamos
  const base = r.split("/").pop() || r;
  if (NUCLEO_ARCHIVOS.includes(base)) return false;
  if (base.endsWith(".py")) return true;
  if (base.endsWith(".log") || base.endsWith(".txt") || base.endsWith(".tmp")) return true;
  if (base.includes(".bak-")) return true;
  if (base.startsWith("_")) return true;
  if (base.endsWith(".bat")) return true; // los .bat buenos están en NUCLEO_ARCHIVOS
  if (base.endsWith(".json")) return false; // un .json suelto puede ser dato: no lo movemos a ciegas
  return false;
}

/** Carpeta de purga con marca de tiempo, dentro de la papelera de la casa. */
export function carpetaPurga(ahora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `.cerebro-papelera/${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}`;
}
