/**
 * evidenciaReavivado.ts — LA MUERTE DEL HIJO DEJA RASTRO (v1.0.23)
 * =================================================================
 * PUREZO. Decide QUÉ se escribe y DÓNDE, a partir de lo que se sabe de la
 * muerte. Quien escribe es `server/routers/supervisorArranque.ts`.
 *
 * 🐞 EL HUECO
 * ----------
 * El supervisor prometía «el log está en logs/arranque/<id>.log» y el shim lo
 * cumplía MIENTRAS el proceso vivía. Pero cuando el hijo moría ANTES de
 * escribir (que es el caso interesante: archivo que no existe, intérprete que
 * no arranca), el log quedaba vacío o inexistente, y el supervisor solo dejaba
 * su propia línea de reintento. Resultado: 26 líneas de «no contesta → reanimo»
 * y NINGUNA que dijera por qué. El diagnóstico se hacía adivinando.
 *
 * LA REGLA
 * --------
 * Cada intento escribe una cabecera con el `cwd` REAL, el comando, el
 * intérprete y la existencia de lo que el comando nombra. Así la próxima vez
 * que alguien lea el log, la primera pregunta («¿estaba parado donde tenía que
 * estar?») ya viene contestada.
 */

/** Lo que hay que saber de un hijo reanimado para poder contarlo. */
export interface IntentoReavivado {
  id: string;
  /** El comando tal como quedó DESPUÉS de `interpretar` (con intérprete si hacía falta). */
  comando: string;
  /** La raíz de instalación con la que se lanzó: es el `cd` del shim. */
  raiz: string;
  /** El intérprete de Python elegido (`CN_PYTHON`), si había. */
  interprete?: string;
  /** El log al que el shim redirige. */
  log: string;
  /** `true` si el archivo que nombra el comando existe en la raíz. */
  existeElScript: boolean;
  /** `true` si el intérprete declarado existe. Se pregunta solo si hay uno. */
  existeElInterprete: boolean;
  /** `false` si esta vez no se pudo ni escribir el shim y se cayó al camino viejo. */
  shimEscrito: boolean;
  /** Fecha del intento en ISO. Se inyecta para que la suite sea determinista. */
  cuando?: string;
}

/** El nombre del archivo de evidencia, junto al log del servicio. */
export const nombreEvidencia = (id: string) => `reavivar-${id}.intentos.log`;

/**
 * El diagnóstico en UNA línea: la respuesta a «¿por qué murió?», en el orden en
 * que hay que mirar. Nunca dice «fallo desconocido» cuando hay causa conocida.
 */
export function diagnosticoDelIntento(i: IntentoReavivado): string {
  if (!i.existeElScript) {
    return `el comando nombra un archivo que NO está en «${i.raiz}»: si el cwd o la raíz están mal, el hijo muere al nacer. Revisá el nombre del archivo o arrancá desde la instalación.`;
  }
  if (!i.existeElInterprete && i.interprete) {
    return `el intérprete declarado no existe: «${i.interprete}». Sin él, el .py queda en la asociación de archivos de Windows y no es el runtime embebido.`;
  }
  if (!i.shimEscrito) {
    return `no se pudo escribir el shim (carpeta de logs sin permiso): se intentó el camino viejo, que es el del 9009.`;
  }
  return `todo a mano (archivo, intérprete y shim presentes): si el puerto no contesta, la causa está DENTRO del servicio — mirá las últimas líneas de ${i.log}.`;
}

/**
 * El bloque que se AÑADE al archivo de intentos. Se acumula: la historia de los
 * intentos es el dato (uno solo no dice si es crónico).
 */
export function bloqueDeIntento(i: IntentoReavivado): string {
  const cuando = i.cuando || new Date().toISOString();
  return [
    `[${cuando}] intento de reavivado · ${i.id}`,
    `    raíz de instalación : ${i.raiz}`,
    `    comando             : ${i.comando}`,
    `    intérprete          : ${i.interprete || "(el del sistema)"}`,
    `    log del servicio    : ${i.log}`,
    `    shim escrito        : ${i.shimEscrito ? "sí" : "no"}`,
    `    archivo del comando : ${i.existeElScript ? "sí" : "NO"}`,
    `    intérprete en disco : ${i.interprete ? (i.existeElInterprete ? "sí" : "NO") : "n/a"}`,
    `    diagnóstico         : ${diagnosticoDelIntento(i)}`,
    "",
  ].join("\n");
}

/**
 * El comando, partido en «programa» y «argumentos», SIN shell: lo que un `spawn`
 * con `shell: false` necesita. Solo se parte por espacios RESPETANDO las comillas
 * (un `C:\Program Files\py.exe` citado es UNA palabra, no dos).
 */
export function partirComando(comando: string): string[] {
  const t = String(comando ?? "").trim();
  if (!t) return [];
  const piezas: string[] = [];
  let actual = "";
  let dentro = false;
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (ch === '"') {
      dentro = !dentro;
      continue;
    }
    if (!dentro && /\s/.test(ch)) {
      if (actual) piezas.push(actual);
      actual = "";
      continue;
    }
    actual += ch;
  }
  if (actual) piezas.push(actual);
  return piezas;
}

/**
 * El nombre del archivo que el comando ejecuta. Sirve para la pregunta «¿existe?»
 * y para no confundir el script con sus argumentos. Se elige la primera pieza con
 * extensión (`C:\py.exe scripts\a.py` → el .py) porque un intérprete cualquiera
 * —python, py, pythonw, uno con otro nombre— no se detecta por su nombre.
 */
export function archivoDelComando(comando: string): string {
  const piezas = partirComando(comando);
  const primero = piezas[0] || "";
  // El archivo que se ejecuta es el PRIMER ARGUMENTO con extensión cuando el
  // primero de todos ya es un ejecutable (.exe/.com): `C:\py.exe scripts\a.py`
  // → el .py. Si el primero no es un ejecutable (es el programa sin extensión,
  // `ollama`), se queda el primero. El ORDEN manda: se recorre de izquierda a
  // derecha y gana el primero que parezca archivo, nunca el último.
  const esEjecutable = /\.(exe|com|bat|cmd)$/i.test(primero);
  const conExtension = piezas.slice(1, 4).find((p) => /\.[a-z0-9]{1,5}$/i.test(p));
  if (esEjecutable && conExtension) return conExtension;
  return primero;
}

