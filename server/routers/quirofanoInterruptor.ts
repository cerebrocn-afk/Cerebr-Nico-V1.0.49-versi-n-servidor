/**
 * quirofanoInterruptor.ts — EL TRANSPORTE DEL INTERRUPTOR DEL QUIRÓFANO (v2.3.9)
 * ===============================================================================
 * El criterio vive en `src/engine/interruptorQuirofano.ts` (puro, sin disco).
 * Acá está el viaje: leer al arrancar, escribir atómico, y las dos rutas HTTP.
 *
 * POR QUÉ EN UN MÓDULO Y NO EN `server.ts`
 * ---------------------------------------
 * El monolito tiene un trinquete de líneas (`contrato-rutas.json` →
 * `presupuesto_lineas`): crecer exige regenerar el contrato a propósito. Todo lo
 * nuevo que quepa en un módulo va a un módulo — es la Fase 2 de la casa: partir,
 * no añadir.
 *
 * EL PEDIDO QUE ESTA CASA CURA
 * ----------------------------
 * «Que el estado se guarde en un archivo (`<raíz de datos>/.cerebronico/quirofano.json`)
 * y se lea al arrancar. Sin eso, el interruptor es decorativo.» Por eso:
 *   · la ruta del archivo la define UN solo lugar: `RUTA_INTERRUPTOR` acá;
 *   · `crearInterruptorQuirofano` CARGA el disco en su construcción: no existe un
 *     camino de arranque que se olvide de leerlo;
 *   · escribir es `tmp + rename`: un corte de luz a mitad de la escritura no deja
 *     un JSON a la mitad, y un JSON a la mitad sería un interruptor que se apaga
 *     solo (o se prende solo) sin que nadie lo haya pedido;
 *   · el archivo se puede editar a mano: si el juez llegara a bloquear justo el
 *     gesto de prenderlo, el apagado sería un candado sin llave.
 *
 * Las rutas se exportan como lista para que la valla las bate contra el archivo
 * real (misma convención que `RUTAS_AUTO_LLAMADO`).
 */
import fs from "node:fs";
import path from "node:path";
import type express from "express";
import type { Request, Response } from "express";
import {
  estadoInicial,
  desdeDisco,
  paraDisco,
  fijarPalancas,
  resumenInterruptor,
  fraseInterruptor,
  esPalanca,
  juzgarComando,
  avisoComandoEximido,
  PALANCA,
  type EstadoInterruptor,
  type ResumenInterruptor,
} from "../../src/engine/interruptorQuirofano";

/** Las rutas de esta casa (la valla bate contra esta lista). */
export const RUTAS_QUIROFANO_INTERRUPTOR = [
  "GET /api/quirofano/interruptor",
  "POST /api/quirofano/interruptor",
] as const;

/** Dónde vive el estado. Un solo dueño de la ruta: este archivo. */
export const RUTA_INTERRUPTOR = (raizDatos: string) => path.join(raizDatos, ".cerebronico", "quirofano.json");

export interface DepsInterruptor {
  raizDatos: string;
  autorizado?: (req: any) => boolean;
  consola?: { log: (m: string) => void; warn: (m: string) => void };
  ahora?: () => number;
}

export interface InterruptorQuirofano {
  /** Estado vivo (en memoria, espejo exacto del disco). */
  estado(): EstadoInterruptor;
  /** Ruta del archivo de estado, ya resuelta. */
  archivo(): string;
  /** ¿Existe el archivo? (distingue «nunca se tocó» de «se apagó a propósito») */
  existeArchivo(): boolean;
  /** Cambia palancas y PERSISTE. Devuelve el estado nuevo. */
  fijar(pedidas: { escrituras?: boolean; comandos?: boolean }, opts?: { motivo?: string; por?: string }): EstadoInterruptor;
  /** Vuelve todo a encendido y persiste. */
  reactivar(opts?: { motivo?: string; por?: string }): EstadoInterruptor;
  vigilaEscrituras(): boolean;
  vigilaComandos(): boolean;
  resumen(): ResumenInterruptor;
  /** Juicio del comando entrante, con la palanca aplicada y el aviso en el log. */
  juzgarComando(aduana: { valido: boolean; motivo?: string }, opts?: { origen?: string; comando?: string }): { bloqueado: boolean; motivo: string; eximido: boolean };
  /** Reloea el disco: si alguien editó el archivo a mano, se adopta. */
  recargar(): EstadoInterruptor;
}

function crear(deps: DepsInterruptor): InterruptorQuirofano {
  const log = deps.consola || console;
  const ahora = deps.ahora || (() => Date.now());
  const archivo = RUTA_INTERRUPTOR(deps.raizDatos);
  let estado: EstadoInterruptor = estadoInicial(ahora());
  let leidoUltimaVez: string | null = null;

  const cargar = (porQue: string): EstadoInterruptor => {
    try {
      if (!fs.existsSync(archivo)) return estado;
      const crudo = fs.readFileSync(archivo, "utf-8");
      if (crudo === leidoUltimaVez) return estado;
      leidoUltimaVez = crudo;
      estado = desdeDisco(crudo, ahora());
      log.log(`[CerebroNico] 🩺 QUIRÓFANO · interruptor leído de ${archivo} (${porQue}): ${fraseInterruptor(estado)}`);
      return estado;
    } catch (e: any) {
      // Ilegible no es «apagado»: vuelve al defecto (encendido) y lo dice.
      estado = estadoInicial(ahora());
      log.warn(`[CerebroNico] 🩺 QUIRÓFANO: no pude leer el interruptor (${e?.message || e}); arranca ENCENDIDO.`);
      return estado;
    }
  };

  const guardar = (): void => {
    const crudo = paraDisco(estado);
    try {
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      const tmp = `${archivo}.${process.pid}.${ahora()}.tmp`;
      fs.writeFileSync(tmp, crudo, "utf-8");
      try {
        fs.renameSync(tmp, archivo);
      } catch {
        // Windows no renombra sobre un archivo abierto: se reescribe el destino.
        fs.writeFileSync(archivo, crudo, "utf-8");
        try {
          fs.rmSync(tmp, { force: true });
        } catch {
          /* la copia temporal sobrante es pelusa, no un defecto de estado */
        }
      }
      leidoUltimaVez = crudo;
    } catch (e: any) {
      // Sin disco el interruptor sigue valiendo esta sesión, y se dice: un apagado
      // que no se pudo grabar se va a re-encender solo al reiniciar.
      log.warn(
        `[CerebroNico] 🩺 QUIRÓFANO: el interruptor NO se pudo guardar en ${archivo} (${e?.message || e}). ` +
          "Este apagado se pierde al reiniciar el servidor."
      );
    }
  };

  cargar("arranque");

  return {
    estado: () => ({ ...estado }),
    archivo: () => archivo,
    existeArchivo: () => {
      try {
        return fs.existsSync(archivo);
      } catch {
        return false;
      }
    },
    fijar: (pedidas, opts) => {
      const antes = estado;
      estado = fijarPalancas(estado, pedidas, { motivo: opts?.motivo, por: opts?.por || "ide", ahora: ahora() });
      guardar();
      const apagadas = PALANCA.filter((p) => antes[p] === true && estado[p] === false);
      const prendidas = PALANCA.filter((p) => antes[p] === false && estado[p] === true);
      if (apagadas.length) {
        for (const p of apagadas) {
          const que = resumenInterruptor(estado, archivo).dejaDeVigilar.filter((q) => q.startsWith(`[${p}]`));
          log.warn(
            `[CerebroNico] ⚠️ QUIRÓFANO: palanca «${p}» APAGADA y grabada en ${archivo}. ` +
              `DEJA DE VIGILAR (${que.length}): ${que.map((q) => q.replace(`[${p}] `, "")).join(" · ")}. ` +
              `Sigue vigilado: sandboxAuthorized, el guardián de sintaxis y la reversión de la tanda. ` +
              (estado.motivo ? `Motivo: ${estado.motivo}` : "Sin motivo declarado: escribí uno para saber por qué se apagó.")
          );
        }
      }
      if (prendidas.length) log.log(`[CerebroNico] 🩺 QUIRÓFANO: palanca(s) ${prendidas.join(" + ")} ENCENDIDA(S) y grabadas en ${archivo}.`);
      return estado;
    },
    reactivar: (opts) => {
      estado = fijarPalancas(estado, { escrituras: true, comandos: true }, { motivo: opts?.motivo, por: opts?.por || "ide", ahora: ahora() });
      guardar();
      log.log(`[CerebroNico] 🩺 QUIRÓFANO: reactivo el juez en las dos palancas (${archivo}).`);
      return estado;
    },
    vigilaEscrituras: () => estado.escrituras === true,
    vigilaComandos: () => estado.comandos === true,
    resumen: () => resumenInterruptor(estado, archivo),
    juzgarComando: (aduana, opts) => {
      const j = juzgarComando(estado, aduana, opts);
      if (j.eximido) log.warn(avisoComandoEximido(opts?.origen || "run_command", aduana.motivo || "", opts?.comando || ""));
      return j;
    },
    recargar: () => cargar("pedido del panel"),
  };
}

// ─── Instancia por raíz de datos (el servidor tiene una; las pruebas, la suya) ──
const INSTANCIAS = new Map<string, InterruptorQuirofano>();

/** Devuelve (y crea si falta) el interruptor de esa raíz. El arranque ya lo cargó. */
export function interruptorQuirofano(deps: DepsInterruptor): InterruptorQuirofano {
  const clave = path.resolve(deps.raizDatos);
  let inst = INSTANCIAS.get(clave);
  if (!inst) {
    inst = crear(deps);
    INSTANCIAS.set(clave, inst);
  }
  return inst;
}

/** Solo pruebas: tira la instancia para simular un reinicio del servidor. */
export function olvidarInterruptorQuirofano(raizDatos: string): void {
  INSTANCIAS.delete(path.resolve(raizDatos));
}

/** Registra las dos rutas del interruptor. */
export function registrarRutasInterruptorQuirofano(app: express.Express, deps: DepsInterruptor): void {
  const sandboxAuthorized = deps.autorizado || (() => true);
  const inst = interruptorQuirofano(deps);

  app.get("/api/quirofano/interruptor", (_req: Request, res: Response) => {
    res.json({ ok: true, ...inst.resumen(), existeArchivo: inst.existeArchivo() });
  });

  app.post("/api/quirofano/interruptor", (req: Request, res: Response) => {
    // Apagar al juez es una puerta mutante: pide la misma autorización del sandbox.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const cuerpo: any = req.body || {};
    const pedidas: { escrituras?: boolean; comandos?: boolean } = {};
    for (const p of PALANCA) {
      if (typeof cuerpo[p] === "boolean") pedidas[p] = cuerpo[p];
    }
    // El índice se estrecha con una variable tipada: indexar `pedidas` con una
    // propiedad de `cuerpo: any` compila con TS7053 («any can't be used to index»).
    const palancaSuelta: unknown = cuerpo.palanca;
    if (esPalanca(palancaSuelta) && typeof cuerpo.valor === "boolean") pedidas[palancaSuelta] = cuerpo.valor;
    if (Object.keys(pedidas).length === 0) {
      return res.status(400).json({
        error: "Nada que cambiar: mandá escrituras y/o comandos (booleanos), o {palanca, valor}.",
        palancas: [...PALANCA],
      });
    }
    const estado = inst.fijar(pedidas, { motivo: String(cuerpo.motivo || ""), por: String(cuerpo.origen || "ide") });
    res.json({ ok: true, ...inst.resumen() });
  });
}
