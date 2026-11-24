/**
 * supervisorArranque.ts — EL QUE VIGILA LAS VENTANAS (v1.99.0)
 * ============================================================
 * El plano vive en `src/engine/arranqueVentanas.ts` (2 CMD + 3 PY). Este archivo es
 * la única parte que lo VIGILA: sondea los puertos, y cuando uno deja de responder
 * decide con la función pura si toca reavivar, esperar o rendirse. Sin esto, el
 * `decidirReavivado` puro sería código muerto y el usuario volvería a quedarse con
 * «solo el cmd de arranque y 2 py» sin que nadie lo note.
 *
 * Reglas de la casa que sostienen el diseño:
 *   · No duerme el hilo del server: sondeo en `setTimeout` con dueño y un solo timer.
 *   · No mata ni reinicia procesos ajenos a mano: reaviva POR COMANDO del plano, con
 *     tope (3) y espera que duplica. Al rendirse deja el motivo a la vista (la UI y
 *     el log), que es exactamente lo que «no da tiempo a copiar» nos quitó.
 *   · El monolito no engorda: una línea de montaje, como el embedder.
 *
 * v2.1.0 · LOS INTERRUPTORES. Síntoma que lo trajo: la ventana «CerebroNico
 * Memoria :5100» decía «[memoria] se cerro» y el usuario se quedaba sin memoria.
 * La limpieza de puertos del lanzador (`autonomia.py puertos --matar`) mataba al
 * dueño de :5100 sin preguntar si estaba sano: la IDE se apagaba su propio pack en
 * cada relanzamiento. Un `if` suelto no arregla eso porque el problema no era un
 * falta de condición, era que NADIE PODÍA MANDAR. Desde acá el usuario (y el
 * modelo, por orden) manda con tres posiciones por servicio:
 *   auto / encendido / apagado, guardadas en `<raízDatos>/servicios.json`.
 * La decisión es del módulo puro `interruptoresServicios`; acá solo disco, puertos
 * y procesos. Las dos rutas nuevas pasan por la misma aduana del sandbox: antes
 * `POST /api/arranque/pasar` no tenía guarda y ABRÍA PROCESOS — una acción que
 * engendra procesos no puede ser la única sin llave del sistema.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { exec } from "node:child_process";
import { SERVICIOS_VENTANA, INVENTARIO_SERVICIOS, serviciosVigilados, decidirReavivado, GRACIA_ARRANQUE_MS, type HistorialReavivado } from "../../src/engine/arranqueVentanas"; // v2.3.24 · se vigila el INVENTARIO (7), no sólo las ventanas del plano (5)
import { construirShimReavivado, interpretarComando } from "../../src/engine/reavivarServicio";
import { entornoDeReavivado } from "../../src/engine/entornoReavivado";
import { bloqueDeIntento, nombreEvidencia, partirComando, archivoDelComando } from "../../src/engine/evidenciaReavivado";
import {
  ARCHIVO_INTERRUPTORES,
  decidirOrden,
  tablaInterruptores,
  normalizarInterruptores,
  serializarInterruptores,
  interruptorDe,
  servicioDe,
  esInmutable,
  type EstadoInterruptor,
  type Interruptores,
} from "../../src/engine/interruptoresServicios";

export interface DepsSupervisor {
  raizProyecto: string;
  /** Raíz de DATOS (C:\Cerebronico). Acá vive servicios.json: preferencia, no código. */
  raizDatos?: string;
  /** Inyectable para probar en seco (sin abrir sockets ni procesos). */
  sondear?: (puerto: number) => Promise<boolean>;
  reanimar?: (comando: string, id?: string) => void;
  /** Matar el dueño de UN puerto y decir si quedó libre. Inyectable por diseño. */
  matarPuerto?: (puerto: number) => Promise<boolean>;
  /**
   * v1.0.35 · QUIÉN ESCUCHA ESE PUERTO, sin abrirle una conexión.
   * `sondear` mide «¿contesta?», que bajo carga puede ser «todavía no». Esto
   * mide «¿hay alguien?» leyendo netstat/ss: la única pregunta que autoriza (o
   * prohíbe) abrir un segundo dueño del mismo puerto.
   */
  duenioDelPuerto?: (puerto: number) => Promise<number[]>;
  /** Intérprete de los packs: el .bat lo deja en CN_PYTHON (runtime embebido). */
  interprete?: string;
  ahora?: () => number;
  cadaMs?: number;
  consola?: { log: (l: string) => void; warn: (l: string) => void };
}

export interface EstadoSupervisor {
  enCurso: boolean;
  cadaMs: number;
  servicios: Array<{ id: string; rol: string; puerto: number; vivo: boolean; medido: boolean; reavivados: number; aviso: string }>;
  /** v2.1.0 · el plano cruzado con la voluntad del usuario. */
  interruptores?: ReturnType<typeof tablaInterruptores>;
  archivoInterruptores?: string;
  ultima?: { en: number; vivos: number; acciones: string[] };
}

/**
 * v2.3.25 · UN PUERTO QUE ESCUCHA CON LA COLA LLENA NO ESTÁ CAÍDO.
 *
 * Con 1200 ms de plazo, un :11434 cargando 124 blobs o un :5100 esperando a su
 * motor contestaban la conexión DESPUÉS del plazo: el supervisor lo apuntaba como
 * «no contesta → reanimo» y abría un segundo dueño del mismo puerto, que moría al
 * chocar. El plazo now es 3000 ms — el mismo orden que tarda un arranque en
 * frío — y sigue siendo un TCP connect, no un HTTP: solo mide «hay alguien».
 */
const TIMEOUT_SONDEO_MS = Number(process.env.CN_TIMEOUT_SONDEO_MS || 3_000);

const sondearPuerto = (puerto: number) =>
  new Promise<boolean>((resuelve) => {
    const s = net.connect({ host: "127.0.0.1", port: puerto, timeout: TIMEOUT_SONDEO_MS });
    const ya = (v: boolean) => { try { s.destroy(); } catch { /* ya murió */ } resuelve(v); };
    s.once("connect", () => ya(true));
    s.once("timeout", () => ya(false));
    s.once("error", () => ya(false));
  });

const promesa = <T,>(fn: (cb: (e: unknown, r: T) => void) => void) =>
  new Promise<T>((resuelve, rechaza) => fn((e, r) => (e ? rechaza(e) : resuelve(r))));

/**
 * Dueños de un puerto en Windows (netstat -ano, solo LISTENING y puerto EXACTO).
 * El puerto exacto importa: `findstr :5100` también pesca :51000 y direcciones
 * remotas, y matar por aproximación es exactamente el defecto que la casa ya
 * corrigió en `server.ts`.
 */
async function duenosDelPuerto(puerto: number): Promise<number[]> {
  const cmd = process.platform === "win32"
    ? `netstat -ano -p TCP | findstr LISTENING`
    : `ss -ltnp 2>/dev/null | grep -E ":${puerto}[[:space:]]" || true`;
  try {
    const stdout = await promesa<string>((cb) => exec(cmd, { windowsHide: true }, (e: any, so: string) => cb(e, so || "")));
    const pids = new Set<number>();
    for (const linea of String(stdout).split("\n")) {
      const cols = linea.trim().split(/\s+/);
      if (process.platform === "win32") {
        if (cols.length < 5) continue;
        const local = cols[1], pid = Number(cols[cols.length - 1]);
        if (!local || !Number.isFinite(pid)) continue;
        if (Number(String(local).split(":").pop()) !== puerto) continue;
        if (pid === process.pid) continue; // nunca suicidarnos
        pids.add(pid);
      } else {
        const m = linea.match(/pid=(\d+)/);
        if (m && Number(m[1]) !== process.pid) pids.add(Number(m[1]));
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

/** Matar el dueño de UN puerto y VERIFICAR que quedó libre (un kill sin verificar es un deseo). */
async function matarDuenoDelPuerto(puerto: number): Promise<boolean> {
  const pids = await duenosDelPuerto(puerto);
  if (!pids.length) return true; // ya estaba libre: misión cumplida
  for (const pid of pids) {
    try {
      const cmd = process.platform === "win32" ? `taskkill /PID ${pid} /T /F` : `kill -TERM ${pid} 2>/dev/null || true`;
      await promesa<unknown>((cb) => exec(cmd, { windowsHide: true }, (e) => cb(e, null)));
    } catch { /* si no se pudo matar, la verificación de abajo lo dice */ }
  }
  for (let i = 0; i < 25; i++) {
    if (!(await sondearPuerto(puerto))) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !(await sondearPuerto(puerto));
}

export function montarSupervisorArranque(deps: DepsSupervisor) {
  const sondear = deps.sondear || sondearPuerto;
  const ahora = deps.ahora || (() => Date.now());
  const cadaMs = Math.max(5_000, Math.floor(deps.cadaMs || 30_000));
  const consola = deps.consola || console;
  const historial = new Map<string, HistorialReavivado>();
  const vivos = new Map<string, boolean>();
  const avisos = new Map<string, string>();
  let enCurso = false;
  let ultima: EstadoSupervisor["ultima"];
  /**
   * v2.1.1 · LA PASADA DE RECONOCIMIENTO.
   * El log de arranque escupía los CINCO servicios como «no contesta → reanimo,
   * intento 1 de 3» a la vez, y segundos después todos estaban arriba. El
   * supervisor late a los 12 s, cuando `npm run dev` todavía compila y los packs
   * Python aún no escuchan: estaba midiendo el ARRANQUE, no una caída. Y reanimar
   * ahí no era un mensaje feo, era abrir un SEGUNDO DUEÑO del mismo puerto.
   * La primera pasada solo MIDE y calla: un servicio que nunca fue visto vivo no
   * está caído, está naciendo. Desde la segunda, la vigilancia es la de siempre.
   */
  let reconocido = false;
  /**
   * v2.0.2 · CUÁNDO EMPEZÓ A VIGILAR.
   * El log real escupió «ollama», «front» y «memoria» como caídos en la misma
   * pasada, y los tres puertos YA estaban ocupados: los reanimados murieron al
   * chocar. Ollama tarda ~50 s en abrir el 11434 (124 blobs) y la memoria tardó
   * 7 s según el propio .bat. Con la gracia, durante los primeros 90 s un puerto
   * que no contesta se anota como «arrancando» y NO se gasta intento.
   */
  const inicioVigilancia = ahora();

  // ── los interruptores: un archivo chico, leído a mano o por la UI ─────────
  const archivo = deps.raizDatos ? path.join(deps.raizDatos, ARCHIVO_INTERRUPTORES) : "";
  let cache: { mtime: number; ints: Interruptores } = { mtime: -1, ints: {} };
  const leer = (): Interruptores => {
    if (!archivo) return {};
    let st: fs.Stats;
    try { st = fs.statSync(archivo); } catch { return {}; } // sin archivo = todo en auto
    if (st.mtimeMs === cache.mtime) return cache.ints;
    let ints: Interruptores = {};
    try { ints = normalizarInterruptores(JSON.parse(fs.readFileSync(archivo, "utf-8"))); }
    catch { consola.warn(`[supervisor] «${ARCHIVO_INTERRUPTORES}» está ilegible: se toma todo en auto.`); }
    cache = { mtime: st.mtimeMs, ints };
    return ints;
  };
  const guardar = (ints: Interruptores): boolean => {
    if (!archivo) return false;
    try {
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, serializarInterruptores(ints), "utf-8");
      cache = { mtime: -1, ints }; // fuerza releer: el .bat también lo toca
      return true;
    } catch (e: any) {
      consola.warn(`[supervisor] no pude guardar el interruptor: ${e?.message || e}`);
      return false;
    }
  };

  const interpretar = (comando: string) =>
    // El plano guarda `scripts\hindsight_daemon.py --port 5100` (el comando del
    // .bat). Relanzado desde el server, un `.py` pelado queda en la asociación de
    // archivos de Windows, que NO es el runtime embebido que eligió el lanzador.
    // Con CN_PYTHON se fuerza el mismo intérprete; sin eso, comportamiento viejo.
    // v2.3.1 · la lógica vive en `reavivarServicio` (pura y testeable): acá entra
    // y sale la variable de entorno, nada más.
    interpretarComando(comando, deps.interprete || process.env.CN_PYTHON || process.env.CN_PY || "");

  /**
   * v2.3.1 · EL REAVIVADO ESCRIBE UN SHIM, NO UNA LÍNEA AL SHELL.
   * El porqué completo (el `"v" no se reconoce` y el 9009 que se llevaba puesto el
   * `call npm run dev` del .bat) está documentado en `src/engine/reavivarServicio.ts`.
   * La regla de la casa: el módulo puro decide la forma, este archivo toca disco y
   * procesos. Y el log que el aviso promete ahora existe, porque el shim redirectiona
   * su salida ahí en vez de tirarla a `stdio: "ignore"`.
   */
  const carpetaShims = () => path.join(deps.raizDatos || deps.raizProyecto, "logs", "arranque");

  /**
   * v1.0.23 · EL HIJO NACE DONDE NACE LA CASA, Y SI MUERE LO DEJA ESCRITO.
   * ----------------------------------------------------------------------
   * 🐞 lo que había acá: `spawn(..., { shell: true, cwd: deps.raizProyecto })`
   * como camino de rescate y `stdio: "ignore"` en el camino bueno. Dos agujeros
   * medidos en el log de Mario (26 líneas «no contesta → reanimo, intento N de 3»):
   *
   *   1. `shell: true` sobre una línea que trae comillas es el 9009 (el shim
   *      existe justamente para no hacerlo). El rescate reabría el defecto.
   *   2. La muerte del hijo no dejaba NADA: `stdio: "ignore"` tiraba el stderr
   *      del intérprete («can't open file 'scripts\x.py': No such file»), que es
   *      la línea que dice la causa. El log prometido quedaba vacío y el
   *      diagnóstico se hacía adivinando.
   *
   * Ahora: (a) el hijo se lanza por argv, sin shell, con cwd = raíz de
   * instalación EXPLÍCITA; (b) antes de lanzar se anota el intento —cwd real,
   * comando, intérprete, si el archivo existe— en `reavivar-<id>.intentos.log`;
   * (c) la salida del hijo NO se tira: va al mismo log del servicio. Con eso, la
   * pregunta «¿por qué murió?» se contesta leyendo, no suponiendo.
   *
   * La raíz la decide `raizInstalacion` (marcas en el disco, no el cwd) y llega
   * por `deps.raizProyecto`: `process.cwd()` es una pista, no una prueba.
   */
  const evidenciaDeIntento = (op: {
    id: string;
    comando: string;
    raiz: string;
    log: string;
    shimEscrito: boolean;
  }) => {
    const existe = (rel: string) => {
      try {
        return Boolean(rel) && fs.existsSync(path.isAbsolute(rel) ? rel : path.join(op.raiz, rel));
      } catch {
        return false;
      }
    };
    const archivo = archivoDelComando(op.comando);
    const it = (deps.interprete || process.env.CN_PYTHON || process.env.CN_PY || "").trim();
    const bloque = bloqueDeIntento({
      id: op.id,
      comando: op.comando,
      raiz: op.raiz,
      interprete: it,
      log: op.log,
      existeElScript: existe(archivo),
      existeElInterprete: it ? existe(it) : true,
      shimEscrito: op.shimEscrito,
    });
    try {
      fs.mkdirSync(path.dirname(op.log), { recursive: true });
      fs.appendFileSync(path.join(path.dirname(op.log), nombreEvidencia(op.id)), bloque, "utf-8");
    } catch {
      // Sin carpeta de logs no hay evidencia posible: se avisa y se sigue. Un
      // log que no se puede escribir no puede impedir que el servicio se levante.
      consola.warn(`[supervisor] no pude anotar el intento de «${op.id}»: la carpeta ${path.dirname(op.log)} no es escribible.`);
    }
    return bloque;
  };

  /**
   * El camino sin shim: argv, nunca línea. `shell: false` es la regla, no un gusto:
   * `shell: true` sobre comillas es el 9009 que ya nos costó el arranque del 3/11.
   */
  const lanzarPorArgv = (piezas: string[], log: string) => {
    if (!piezas.length) return null;
    let salida: number | "ignore" = "ignore";
    try {
      salida = fs.openSync(log, "a");
    } catch {
      salida = "ignore";
    }
    const hijo = spawn(piezas[0], piezas.slice(1), {
      shell: false,
      detached: true,
      stdio: ["ignore", salida, salida],
      windowsHide: true,
      cwd: deps.raizProyecto,
      // v1.0.43 · el hijo NO hereda a ciegas: si nace sin PROJECT_DIR, los
      // daemons Python caen a su raíz por defecto y escriben el cerebro dentro
      // de la instalación (ver src/engine/entornoReavivado.ts).
      env: entornoDeReavivado(process.env, deps.raizDatos || deps.raizProyecto),
    });
    if (typeof salida === "number") {
      // El descriptor del padre se cierra una vez que el hijo lo heredó: si se
      // queda abierto, el archivo no se puede rotar ni borrar en Windows.
      try {
        fs.closeSync(salida);
      } catch {}
    }
    hijo.on("error", (e) => consola.warn(`[supervisor] no pude reanimar «${piezas[0]}»: ${e.message}`));
    hijo.unref();
    return hijo;
  };

  const reanimarDeFábrica = (comando: string, id = "servicio") => {
    const ruta = interpretar(comando);
    const esWin = process.platform === "win32";
    const raiz = deps.raizProyecto;
    const logServicio = path.join(carpetaShims(), `${id}.log`);
    const shim = construirShimReavivado({
      id,
      comando: ruta,
      carpeta: carpetaShims(),
      raizProyecto: raiz,
      plataforma: esWin ? "win32" : "posix",
      comSpec: process.env.ComSpec,
      sep: path.sep,
    });
    let shimEscrito = false;
    try {
      fs.mkdirSync(carpetaShims(), { recursive: true });
      fs.writeFileSync(path.join(carpetaShims(), shim.nombre), shim.contenido, esWin ? "utf-8" : { mode: 0o755, encoding: "utf-8" });
      shimEscrito = true;
    } catch (e: any) {
      consola.warn(`[supervisor] no pude escribir el shim de «${id}»: ${e?.message || e} — se intenta el camino viejo.`);
    }

    evidenciaDeIntento({ id, comando: ruta, raiz, log: logServicio, shimEscrito });

    if (!shimEscrito) {
      lanzarPorArgv(partirComando(ruta), logServicio);
      return;
    }
    // `windowsVerbatimArguments`: sin esto, Node vuelve a escapar las comillas que
    // el shim ya trae puestas y se recompone el mismo defecto que veníamos a curar.
    const hijo = spawn(shim.exe, shim.argv, {
      shell: false,
      detached: true,
      stdio: "ignore", // el shim ya redirige su salida al log del servicio
      windowsHide: true,
      cwd: raiz,
      // v1.0.43 · el mismo parche que el camino argv: la raíz de datos viaja
      // con el hijo aunque el padre (el .exe) no la tuviera en su entorno.
      env: entornoDeReavivado(process.env, deps.raizDatos || raiz),
      ...(esWin ? { windowsVerbatimArguments: true } : {}),
    });
    hijo.on("error", (e) => consola.warn(`[supervisor] no pude reanimar «${comando}»: ${e.message}`));
    hijo.unref();
  };

  const reanimar = deps.reanimar || reanimarDeFábrica;
  const matar = deps.matarPuerto || matarDuenoDelPuerto;
  const duenio = deps.duenioDelPuerto || duenosDelPuerto;

  /**
   * v1.0.35 · ¿HAY ALGUIEN ESCUCHANDO EN ESE PUERTO?
   *
   * Con la CPU al 100 % (Ollama cargando), un :5100 vivo puede no aceptar la
   * conexión dentro de los 3 s del sondeo. El supervisor lo leía como «caído»
   * y abría un SEGUNDO dueño del mismo puerto: el segundo choca con el primero,
   * muere, y mientras tanto se comió CPU y RAM. Eso es exactamente el
   * «reanimo 1 y 2 de 3» del log, con los dos servicios ya arriba.
   *
   * La pregunta que autoriza reanimar no es «¿contestó el HTTP?» sino «¿está
   * el puerto libre?». Si hay dueño, no se levanta nada: se anota que escucha
   * y no contesta a tiempo, y NO se gasta intento.
   */
  const hayDuenio = async (puerto: number): Promise<boolean> => {
    try { return (await duenio(puerto)).length > 0; } catch { return false; }
  };

  async function pasar() {
    if (enCurso) return { ejecutado: false, aviso: "ya hay una pasada en curso" };
    enCurso = true;
    const acciones: string[] = [];
    try {
      const ints = leer();
      // v2.0.2 · el propio IDE (:3000) no se reanima a sí mismo: el `npm run dev`
      // nuevo no puede tomar un puerto que el proceso actual ya tiene. Se mide
      // (para que la UI lo muestre vivo) pero nunca se reanima.
      const vigilables = serviciosVigilados();
      for (const s of INVENTARIO_SERVICIOS) {
        const vivo = await sondear(s.puerto);
        vivos.set(s.id, vivo);
        if (!vigilables.some((v) => v.id === s.id)) {
          // v2.3.24 · la razón la dice el plano, no la supone este archivo: antes
          // el sandbox y el motor heredaban el aviso del IDE («es el propio IDE»)
          // y la hoja de ruta explicaba un motivo falso.
          if (!vivo) avisos.set(s.id, s.noVigilado || "no está bajo la vigilancia del supervisor");
          continue;
        }
        const posicion = interruptorDe(ints, s.id);
        if (vivo) { if (avisos.get(s.id)) avisos.delete(s.id); continue; }
        // «apagado» es una orden, no un estado: el supervisor no reaviva lo que el
        // usuario apagó, por más que el plano diga que ese puerto debería vivir.
        if (posicion === "apagado") { avisos.set(s.id, "apagado a mano: no lo reanimo"); continue; }
        const h = historial.get(s.id) || null;
        // Pasada de reconocimiento: se anota el estado y NO se toca nada.
        if (!reconocido) {
          avisos.set(s.id, "aún arrancando: la primera pasada solo mide");
          historial.set(s.id, { id: s.id, veces: 0, ultimoEn: 0 });
          continue;
        }
        // v2.0.2 · dentro de la gracia de arranque no se gasta intento ni se abre
        // ventana: el servicio está naciendo, no caído (ver GRACIA_ARRANQUE_MS).
        if (ahora() - inicioVigilancia < GRACIA_ARRANQUE_MS) {
          avisos.set(s.id, `arrancando: ${Math.round((GRACIA_ARRANQUE_MS - (ahora() - inicioVigilancia)) / 1000)}s de gracia`);
          continue;
        }
        // v1.0.35 · ANTES DE REANIMAR, PREGUNTAR SI EL PUERTO TIENE DUEÑO.
        // Un «no contesta» con CPU al 100 % es un servicio lento, no un muerto:
        // abrir un segundo dueño del mismo puerto solo agrega un proceso que
        // choca y CPU que no hay. Se anota, se pinta vivo (hay alguien) y no se
        // gasta intento — la próxima pasada vuelve a medir.
        if (await hayDuenio(s.puerto)) {
          vivos.set(s.id, true);
          avisos.set(s.id, `escucha en :${s.puerto} pero no contestó en ${Math.round(TIMEOUT_SONDEO_MS / 1000)} s: hay dueño, no abro un segundo`);
          if (!historial.get(s.id)) historial.set(s.id, { id: s.id, veces: 0, ultimoEn: 0 });
          consola.warn(`[supervisor] «${s.id}» (:${s.puerto}) no contesta a tiempo pero el puerto tiene dueño → NO reanimo (evito el segundo proceso).`);
          continue;
        }
        const d = decidirReavivado(h, ahora(), inicioVigilancia);
        if (d.accion === "arrancando") {
          avisos.set(s.id, `arrancando: le doy ${Math.round(d.enMs / 1000)}s más antes de reanimar`);
          continue;
        }
        if (d.accion === "renunciar") {
          if (posicion === "encendido") {
            // El usuario lo pidió arriba: el tope de reavivados automáticos no aplica.
            avisos.set(s.id, "pedido arriba: reintento aunque pasé el tope automático");
            historial.set(s.id, { id: s.id, veces: 0, ultimoEn: ahora() });
            if (await hayDuenio(s.puerto)) {
              avisos.set(s.id, `pedido arriba, pero :${s.puerto} ya tiene dueño: no abro un segundo`);
              vivos.set(s.id, true);
              continue;
            }
            acciones.push(`${s.id}:pedido`);
            consola.warn(`[supervisor] «${s.id}» (:${s.puerto}) está apagado y el interruptor lo pide arriba → lo levanto.`);
            try { reanimar(s.comando, s.id); } catch (e: any) { consola.warn(`[supervisor] el levantado tiró: ${e?.message || e}`); }
            continue;
          }
          avisos.set(s.id, d.motivo);
          if (!h || h.veces !== d.vez) consola.warn(`[supervisor] «${s.id}» (:${s.puerto}) me rindo: ${d.motivo}`);
          historial.set(s.id, { id: s.id, veces: d.vez, ultimoEn: ahora() });
          continue;
        }
        const esperado = (h?.ultimoEn || 0) + d.enMs;
        if (ahora() < esperado) { avisos.set(s.id, `espero ${(esperado - ahora()) / 1000}s antes de reanimar (intento ${d.vez})`); continue; }
        historial.set(s.id, { id: s.id, veces: d.vez, ultimoEn: ahora() });
        avisos.set(s.id, `reanimado (intento ${d.vez})`);
        acciones.push(`${s.id}:${d.vez}`);
        consola.warn(`[supervisor] «${s.id}» (:${s.puerto}) no contesta → reanimo, intento ${d.vez} de 3. El log está en logs/arranque/${s.id}.log`);
        try { reanimar(s.comando, s.id); } catch (e: any) { consola.warn(`[supervisor] el reanimado tiró: ${e?.message || e}`); }
      }
      ultima = { en: ahora(), vivos: [...vivos.values()].filter(Boolean).length, acciones };
      reconocido = true;
    } finally { enCurso = false; }
    return { ejecutado: true, acciones };
  }

  /**
   * La orden del usuario o del modelo: guarda la posición y ACTÚA de una (no
   * espera a la próxima ronda de sondeo, que tarda 30 s: quien apaga quiere
   * silencio ya). La negativa siempre trae el motivo, nunca un 400 mudo.
   */
  async function aplicarOrden(input: { id: string; estado: EstadoInterruptor; confirmar?: boolean }) {
    const ints = leer();
    const s = servicioDe(input.id);
    const vivo = s ? await sondear(s.puerto) : false;
    const decision = decidirOrden({ id: input.id, pedido: input.estado, vivo, confirmar: !!input.confirmar });
    if (decision.accion === "nada") {
      // «auto» sí se guarda aunque no haga nada: es la forma de devolverle el
      // control al lanzador después de haberlo tenido apagado.
      if (input.estado === "auto" && esExistente(input.id)) guardar({ ...ints, [input.id]: "auto" });
      return { ok: !esInmutable(input.id), accion: "nada" as const, porque: decision.porque, estado: estado() };
    }
    const nuevo = { ...ints, [input.id]: input.estado };
    guardar(nuevo);
    if (decision.accion === "apagar") {
      const libre = await matar(s!.puerto);
      vivos.set(s!.id, libre ? false : true);
      avisos.set(s!.id, libre ? `apagado por pedido (:${s!.puerto} libre)` : "pedí apagarlo pero el puerto sigue ocupado: mirá el log");
      consola.log(`[supervisor] «${s!.id}» apagado por pedido. Puerto :${s!.puerto} ${libre ? "libre" : "SIGUE OCUPADO"}.`);
      return { ok: libre, accion: "apagar" as const, porque: libre ? decision.porque : "el puerto no se liberó", estado: estado() };
    }
    try { reanimar(s!.comando, s!.id); } catch (e: any) { return { ok: false, accion: "levantar" as const, porque: `no lo pude levantar: ${e?.message || e}`, estado: estado() }; }
    vivos.set(s!.id, true);
    avisos.set(s!.id, "levantado por pedido");
    consola.log(`[supervisor] «${s!.id}» levantado por pedido (:${s!.puerto}).`);
    return { ok: true, accion: "levantar" as const, porque: decision.porque, estado: estado() };
  }
  const esExistente = (id: string) => !!servicioDe(id);
  /** La realidad medida (puerto con alguien adentro), para cruzarla con el plano. */
  const vivosEnMapa = (): Record<string, boolean> => {
    const m: Record<string, boolean> = {};
    for (const s of INVENTARIO_SERVICIOS) m[s.id] = vivos.get(s.id) === true;
    return m;
  };

  const estado = (): EstadoSupervisor => ({
    enCurso,
    cadaMs,
    servicios: INVENTARIO_SERVICIOS.map((s) => ({
      // v2.3.1 · `!== false` pintaba de VIVO lo que nunca se midió: sobre un mapa
      // vacío `vivos.get(id)` es `undefined` y `undefined !== false` es `true`.
      // En la MISMA respuesta, `interruptores` (que arma `vivosEnMapa` con `=== true`)
      // decía lo contrario: un solo endpoint respondiendo dos cosas distintas. De
      // ahí el «cuatriplicado de puertos que dicen indicativos distintos». Ahora
      // `vivo` es la medición y `medido` dice si existe; el criterio único está en
      // `src/engine/indicadorServicios.ts`.
      id: s.id, rol: s.rol, puerto: s.puerto, vivo: vivos.get(s.id) === true, medido: vivos.has(s.id),
      reavivados: historial.get(s.id)?.veces || 0, aviso: avisos.get(s.id) || "",
    })),
    interruptores: tablaInterruptores(leer(), vivosEnMapa()),
    archivoInterruptores: archivo,
    ultima,
  });

  return { pasar, estado, detener: () => enCurso, aplicarOrden, leer, guardar };
}

export const RUTAS_SUPERVISOR_ARRANQUE = [
  "GET /api/arranque/estado",
  "POST /api/arranque/pasar",
  "GET /api/arranque/interruptores",
  "POST /api/arranque/interruptor",
];

/** Monta el sondeo periódico y las rutas de lectura/acción. Una línea en el monolito. */
export function registrarSupervisorArranque(
  app: any,
  opts: { raizProyecto: string; raizDatos?: string; cadaMs?: number; autorizado?: (req: any) => boolean },
) {
  const sup = montarSupervisorArranque({ raizProyecto: opts.raizProyecto, raizDatos: opts.raizDatos, cadaMs: opts.cadaMs });
  const aduana = opts.autorizado || (() => true);
  let vivo = true;
  /**
   * v2.3.25 · CADA CUÁNTO LATE Y DESDE CUÁNDO.
   *
   * Antes: primer latido a los 12 s y luego 30 s. En el log de un arranque real
   * los cinco puertos salieron «no contesta → reanimo, intento 1 de 3» a los 12
   * segundos —midiendo el ARRANQUE, no una caída— y reanimar ahí abre un segundo
   * dueño del puerto que muere al chocar. Ahora el primer latido espera a que
   * pase la gracia de arranque (`GRACIA_ARRANQUE_MS`, la misma que usa la
   * decisión) y el latido es más espaciado: medir cada 30 s un puerto que tarda
   * 50 s en nacer es como preguntar cada minuto si ya creció.
   */
  const primerLatido = Math.max(12_000, GRACIA_ARRANQUE_MS + 5_000);
  const cadaLatido = Math.max(5_000, opts.cadaMs || 45_000);
  const latir = async () => {
    if (!vivo) return;
    try { await sup.pasar(); } catch { /* el sondeo nunca puede tumbar el server */ }
    setTimeout(latir, cadaLatido).unref?.();
  };
  setTimeout(latir, primerLatido).unref?.();
  app.get("/api/arranque/estado", (_req: any, res: any) => res.json(sup.estado()));
  app.get("/api/arranque/interruptores", (_req: any, res: any) =>
    res.json({ ok: true, interruptores: sup.leer(), archivo: sup.estado().archivoInterruptores || "", tabla: sup.estado().interruptores || [] }));
  app.post("/api/arranque/pasar", async (req: any, res: any) => {
    // v2.1.0 · con guarda: esta ruta ENGENDRA PROCESOS.
    if (!aduana(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const r = await sup.pasar();
    res.json({ ...r, estado: sup.estado() });
  });
  app.post("/api/arranque/interruptor", async (req: any, res: any) => {
    if (!aduana(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const id = String(req.body?.id || "");
    const estado = String(req.body?.estado || "") as EstadoInterruptor;
    const r = await sup.aplicarOrden({ id, estado, confirmar: req.body?.confirmar === true });
    res.status(r.ok ? 200 : 409).json(r);
  });
  return () => { vivo = false; };
}
