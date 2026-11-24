/**
 * entornoReavivado.ts — QUÉ ENTORNO HEREDA UN SERVICIO REAVIVADO
 * ==============================================================
 * v1.0.43 · «el .cerebro-db de 76 MB dentro de la instalación»
 *
 * 🐞 CAUSA RAÍZ (consola de `npm run dist`): el empaquetador encontró un
 * `.cerebro-db` de 76,4 MB en la raíz de la instalación y se negó a seguir. Lo
 * escribían los daemons Python, que resuelven su almacén contra `RAIZ_APP`
 * cuando no hay variable de entorno. El `.bat` sí la pasa y `electron-main.cjs`
 * también… pero el SUPERVISOR, cuando reanima un servicio caído, hacía
 * `spawn(..., { cwd: raizProyecto })` sin tocar el entorno: el hijo nacía con
 * el entorno del proceso padre y, en el .exe, sin `PROJECT_DIR`.
 *
 * Consecuencia doble: la memoria del usuario se escribía dentro del paquete (se
 * pierde al actualizar) y el paquete engordaba hasta bloquear `npm run dist`.
 *
 * Este módulo es PURO a propósito: el supervisor solo lo pega al `env` del hijo
 * y la suite puede comprobar la lista de variables sin abrir un proceso.
 */

/** Las variables con las que un daemon Python sabe dónde vive su estado. */
export const VARIABLES_DATOS = [
  "PROJECT_DIR",
  "CN_PROJECT_DIR",
  "CN_MOTOR_STORE",
  "CN_CEREBRO_MOTOR",
  "CN_HINDSITE_MIRROR",
  "CN_CREADOR_ROOT",
] as const;

/** Quita separadores finales sin romper `C:\` (que no es «C:»). */
function sinSeparador(ruta: string): string {
  const limpia = (ruta ?? "").trim().replace(/[\\/]+$/, "");
  return /^[A-Za-z]:$/.test(limpia) ? `${limpia}\\` : limpia;
}

/**
 * El parche de entorno para un hijo reavivado. Todo cuelga de la raíz de DATOS
 * (nunca de la carpeta de instalación), con las mismas rutas que fija el .bat y
 * que fija `electron-main.cjs`: si los tres caminos dicen lo mismo, no hay
 * forma de que un servicio escriba en un sitio y los demás lean en otro.
 */
export function parcheEntornoReavivado(raizDatos: string): Record<string, string> {
  const raiz = sinSeparador(raizDatos);
  if (!raiz) return {};
  const unir = (...tramos: string[]) => [raiz, ...tramos].join("/");
  const motor = unir(".cerebro-db", "cerebro-motor.json");
  return {
    PROJECT_DIR: raiz,
    CN_PROJECT_DIR: raiz,
    CN_MOTOR_STORE: motor,
    CN_CEREBRO_MOTOR: motor,
    CN_HINDSITE_MIRROR: unir("hindsight-mirror.json"),
    CN_CREADOR_ROOT: unir(".creador"),
  };
}

/**
 * El entorno completo del hijo: el del padre más el parche. En Windows las
 * variables no distinguen mayúsculas, así que una `project_dir` heredada se
 * retira antes de poner `PROJECT_DIR`: dos claves con el mismo nombre son una
 * lotería de qué valor lee el intérprete.
 */
export function entornoDeReavivado(
  entorno: Record<string, string | undefined>,
  raizDatos: string
): Record<string, string> {
  const parche = parcheEntornoReavivado(raizDatos);
  const claves = new Set(Object.keys(parche).map((k) => k.toLowerCase()));
  const salida: Record<string, string> = {};
  for (const [k, v] of Object.entries(entorno || {})) {
    if (v === undefined) continue;
    if (claves.has(k.toLowerCase())) continue;
    salida[k] = v;
  }
  return { ...salida, ...parche };
}
