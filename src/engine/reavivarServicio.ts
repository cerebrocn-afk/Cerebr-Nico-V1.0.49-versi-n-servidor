/**
 * reavivarServicio.ts — CÓMO SE REANIMA UN SERVICIO SIN QUE EL SHELL LO PARTA
 * ===========================================================================
 * PUREZO. Ni `fs`, ni `child_process`, ni red: decide la forma del comando y el
 * contenido del archivo que hay que escribir. Quién escribe y quién engendra el
 * proceso es `server/routers/supervisorArranque.ts`, que es la parte que se puede
 * romper en la máquina de uno.
 *
 * 🐞 EL FALLO QUE TRAJO ESTE MÓDULO (medido el 3/11 en `NUEVO LOG V2`)
 * -------------------------------------------------------------------
 *   [supervisor] «front» (:3000) no contesta → reanimo, intento 1 de 3
 *   …
 *   "v" no se reconoce como un comando interno o externo,
 *   programa o archivo por lotes ejecutable.
 *   [ERROR] "npm run dev" termino con codigo 9009.
 *
 * El supervisor reanimaba así:
 *
 *   spawn(linea, { shell: true })
 *
 * En Windows Node arma `cmd.exe /d /s /c "<linea>"`. La regla de `/s` de cmd dice
 * que las comillas exteriores SOLO se limpian si la línea NO trae comillas
 * adentro. Casi todas las que reanima este supervisor traen:
 *   · `interpretar()` agrega `"scripts\hindsight_daemon.py"`;
 *   · `comandoVentana()` envuelve el `cmd /k "…"`.
 * Con comillas anidadas cmd no limpia las exteriores: el nombre del programa pasa
 * a ser el primer carácter citado. `vite …` se reporta como `"v"` y el hijo muere
 * con 9009 — el código de "no existe ese comando". Soltado contra la misma
 * consola del `.bat`, ese 9009 se propaga al `call npm run dev` y tumba el IDE
 * entero: el usuario ve «servidor local caído», y no es un server que se cae, es
 * un reanimado que nunca existió.
 *
 * LA CURA, EN UNA FRASE
 * ---------------------
 * Que el shell reciba UNA sola ruta, sin comillas anidadas. El comando crudo se
 * mete ADENTRO de un shim (`reavivar-<id>.cmd` / `.sh`) y se ejecuta el shim por
 * argv. Las comillas del comando las interpreta entonces el intérprete correcto
 * (cmd, dentro del .cmd), no cmd re-cotizando una línea ajena.
 *
 * Efecto de arrastre, no cosmético: el aviso prometía «El log está en
 * logs/arranque/<id>.log» mientras el `stdio: "ignore"` tiraba la salida a la
 * nada. El shim redirige su salida a ese log; la promesa pasa a ser verdad.
 */

/** Plataforma en miniatura: solo nos interesa si es la de las comillas raras. */
export type PlataformaShim = "win32" | "posix";

export interface OpcionesShim {
  /** Identificador del servicio: es el nombre del shim y del log. */
  id: string;
  /** El comando CRUDO, tal como lo dio `interpretar()` (puede traer comillas). */
  comando: string;
  /** Carpeta donde vive el shim (`<raízDatos>/logs/arranque`). */
  carpeta: string;
  /** Dónde hay que pararse antes de ejecutar. */
  raizProyecto: string;
  plataforma?: PlataformaShim;
  /** `cmd.exe` configurable: en algunos equipos la variable viene rara. */
  comSpec?: string;
  /** Separador de carpeta del sistema de archivos real. */
  sep?: string;
}

export interface ShimReavivado {
  /** Nombre del archivo, relativo a `carpeta`. */
  nombre: string;
  /** Lo que hay que escribir en ese archivo, letra por letra. */
  contenido: string;
  /** El ejecutable del spawn (`cmd.exe` o `/bin/sh`). */
  exe: string;
  /** Los argumentos del spawn. NINGUNO es una línea de shell compuesta. */
  argv: string[];
  /** A dónde va la salida. Es el log que el aviso del supervisor promete. */
  log: string;
}

/** Extensión de archivo según la plataforma. */
export const extensionShim = (plataforma: PlataformaShim = "win32") => (plataforma === "win32" ? "cmd" : "sh");

/**
 * Cita un valor SOLO si hace falta y si no lo está ya. Citar dos veces es el otro
 * modo de romper lo que se quería arreglar: `""C:\py.exe""` no es una ruta.
 */
export function citarSiHaceFalta(valor: string): string {
  const v = String(valor ?? "");
  if (!v) return v;
  if (/^".*"$/.test(v)) return v;
  return /\s/.test(v) ? `"${v}"` : v;
}

/**
 * El comando del plano puede ser un `.py` pelado (`scripts\hindsight_daemon.py
 * --port 5100`). Relanzado desde el server sin intérprete, Windows lo resuelve con
 * la ASOCIACIÓN DE ARCHIVOS, que no es el runtime embebido que eligió el
 * lanzador: el pack vuelve a caer por el mismo motivo que lo tiró.
 *
 * `interprete` vacío ⇒ comportamiento viejo (el llamador no conoce CN_PYTHON).
 */
export function interpretarComando(con: string, interprete = ""): string {
  const cruda = String(con ?? "");
  const it = String(interprete ?? "").trim();
  const m = /\b([\w.\\/-]+\.py)\b/i.exec(cruda);
  if (!m || !it) return cruda;
  if (cruda.trim().toLowerCase().startsWith(it.toLowerCase())) return cruda;
  return cruda.replace(m[1], `${citarSiHaceFalta(it)} "${m[1]}"`);
}

/**
 * El shim completo: nombre, contenido y la forma EXACTA del spawn.
 *
 * invariantes que congela la suite:
 *   · `argv` nunca contiene el comando del servicio: el comando vive en el archivo;
 *   · el comando nunca aparece en una línea pasada al shell con comillas anidadas;
 *   · la salida va al log prometido (`log`), no a `ignore`.
 */
export function construirShimReavivado(op: OpcionesShim): ShimReavivado {
  const plataforma = op.plataforma === "posix" ? "posix" : "win32";
  const sep = op.sep ?? (plataforma === "win32" ? "\\" : "/");
  const carpeta = String(op.carpeta ?? "").replace(/[\\/]+$/, "");
  const nombre = `reavivar-${op.id}.${extensionShim(plataforma)}`;
  const rutaShim = `${carpeta}${sep}${nombre}`;
  const log = `${carpeta}${sep}${op.id}.log`;

  if (plataforma === "win32") {
    // CRLF: un .cmd con LF sueltos se interpreta mal en Windows.
    const contenido =
      `@echo off\r\n` +
      `cd /d ${citarSiHaceFalta(op.raizProyecto)}\r\n` +
      `${op.comando} 1>> ${citarSiHaceFalta(log)} 2>&1\r\n`;
    return {
      nombre,
      contenido,
      exe: op.comSpec || "cmd.exe",
      // `windowsVerbatimArguments` en el spawn: si Node vuelve a escapar esto, se
      // recompone la misma línea que veníamos a curar.
      argv: ["/d", "/c", `"${rutaShim}"`],
      log,
    };
  }

  const contenido =
    `#!/bin/sh\n` +
    `cd ${citarSiHaceFalta(op.raizProyecto)} || exit 1\n` +
    `${op.comando} >> ${citarSiHaceFalta(log)} 2>&1\n`;
  return { nombre, contenido, exe: "/bin/sh", argv: [rutaShim], log };
}

/**
 * Lo que el spawn NO tiene que ser nunca (la regresión congelada en una pregunta).
 * Un spawn con `shell: true` sobre una línea que trae comillas es el 9009.
 */
export function lineaPeligrosa(linea: string): boolean {
  const l = String(linea ?? "");
  return /"/.test(l) && !/^".*"$/.test(l.trim());
}
