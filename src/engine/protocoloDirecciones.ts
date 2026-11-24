/**
 * protocoloDirecciones.ts — v1.0.20 · CÓMO SE HABLAN EL IDE, EL SANDBOX Y OLLAMA
 * ==============================================================================
 * PEDIDO DE MARIO (14/11): «ideá una ESTRATEGIA DE PROTOCOLO con las
 * direcciones/puertos correctos para que no haya más equivocaciones entre el
 * proyecto y el sandbox». Y el porqué, medido en su sesión
 * (cerebronico-ide-sesion-1794621531453): el juego se sirve en :3500, el IDE vive
 * en :3000 y el modelo local en :11434 — y los tres se cruzaron varias veces en
 * el mismo hilo («no aparece en el preview», «el botón no hace nada», «el modelo
 * cae»). El modelo, además, se inventaba arquitecturas o copiaba URLs a mano.
 *
 * LA ESTRATEGIA, EN TRES REGLAS
 *   1. UNA SOLA TABLA. Los números salen de `PORTS` (src/constants.ts) y de
 *      `direccionOllama` (el resolutor que ya sabe que `0.0.0.0` y `localhost`
 *      no son direcciones a las que llamar). Ningún módulo nuevo escribe el
 *      literal 3000/3500/11434: lo pide acá.
 *   2. CADA PUERTO TIENE UN DUEÑO Y UN `/quien` — quién lo levanta, quién habla
 *      con él y qué NUNCA va ahí. Un «no responde» sin saber a quién se llamó es
 *      el defecto que costó tres sesiones.
 *   3. SE GRITA EN EL ARRANQUE Y VIAJA EN EL PROMPT. `lineasProtocolo()` es la
 *      misma verdad que ve el usuario en la terminal y que recibe el modelo antes
 *      de tocar nada; `auditarDirecciones()` la valida (una dirección de escucha
 *      colada en un cliente = rojo) y la suite la cruza contra `PORTS`.
 *
 * QUÉ NO HACE: no sondea puertos (eso es diagnostico.ts, que usa esta tabla) ni
 * abre servidores. Es el plano, puro.
 */
import { PORTS } from "../constants";
import { OLLAMA_POR_DEFECTO, resolverOllama } from "./direccionOllama";

export interface FilaProtocolo {
  /** Número, derivado de `PORTS`. Nunca un literal escrito acá. */
  puerto: number;
  /** Nombre corto y estable (es lo que se nombra en los mensajes de error). */
  nombre: string;
  /** `http://127.0.0.1:<puerto>` — lo que se usa para llamarlo. */
  url: string;
  /** Quién levanta ese puerto. */
  dueno: string;
  /** Quién le habla (y desde dónde). */
  habla: string;
  /** La equivocación concreta que esta fila previene. */
  nunca: string;
}

/** El protocolo COMPLETO. Una fila por puerto, en el orden del arranque. */
export const PROTOCOLO: ReadonlyArray<FilaProtocolo> = [
  {
    puerto: PORTS.IDE,
    nombre: "IDE",
    url: `http://127.0.0.1:${PORTS.IDE}`,
    dueno: "server.ts (Express) + Vite en desarrollo",
    habla: "el navegador/Electron carga la interfaz y todo el chat sale por POST /api/ai/stream",
    nunca: "NO es donde se sirve el proyecto del usuario: eso es el sandbox",
  },
  {
    puerto: PORTS.SANDBOX,
    nombre: "Sandbox",
    url: `http://127.0.0.1:${PORTS.SANDBOX}`,
    dueno: "el propio IDE (sincroniza el editor a disco y arranca el proyecto)",
    habla: "el <iframe> de previsualización y el usuario en su navegador",
    nunca: "NUNCA se usa :3000 para el proyecto: mataría la IDE que lo está sirviendo",
  },
  {
    puerto: PORTS.BRIDGE,
    nombre: "Puente PC",
    url: `http://127.0.0.1:${PORTS.BRIDGE}`,
    dueno: "agent_bridge_5000.py (Python, en la PC del usuario)",
    habla: "el motor para ejecutar herramientas reales fuera del sandbox",
    nunca: "no sirve páginas: si no contesta, las herramientas pc_* quedan sin manos (se dice, no se inventa)",
  },
  {
    puerto: PORTS.MEMORY,
    nombre: "Memoria",
    url: `http://127.0.0.1:${PORTS.MEMORY}`,
    dueno: "hindsight_daemon.py",
    habla: "el motor, para recordar/consultar hechos entre turnos",
    nunca: "no es el motor del cerebro (:5103): son dos órganos distintos",
  },
  {
    puerto: PORTS.CREATOR,
    nombre: "Creador web",
    url: `http://127.0.0.1:${PORTS.CREATOR}`,
    dueno: "creador_daemon.py",
    habla: "el pack creador de sitios cuando se pide una web",
    nunca: "no es el sandbox: el creador GENERA, el sandbox SIRVE",
  },
  {
    puerto: PORTS.CEREBRO,
    nombre: "Motor del cerebro",
    url: `http://127.0.0.1:${PORTS.CEREBRO}`,
    dueno: "cerebro_motor.py",
    habla: "hechos, páginas y consolidación del cerebro",
    nunca: "no es :5100 (memoria híbrida): aquel solo lo consulta por HTTP",
  },
  {
    puerto: PORTS.OLLAMA,
    nombre: "Ollama",
    url: OLLAMA_POR_DEFECTO,
    dueno: "la app Ollama de la máquina (no la levanta CerebroNico)",
    habla: "el motor, SIEMPRE por el resolutor `resolverOllama` (no se copia OLLAMA_HOST)",
    nunca: "`0.0.0.0:11434` es dónde ESCUCHA, no a dónde se llama; `localhost` puede caer en ::1",
  },
];

/** La fila de un puerto, o undefined si ese puerto no está en el protocolo. */
export function filaDePuerto(puerto: number): FilaProtocolo | undefined {
  return PROTOCOLO.find((f) => f.puerto === Number(puerto));
}

/**
 * Las líneas que se imprimen en el arranque y viajan al prompt. Se deriva de
 * `PROTOCOLO`, así que añadir un puerto a `PORTS` y olvidarlo acá lo caza la
 * suite (cruza `PORTS` contra `PROTOCOLO`).
 */
export function lineasProtocolo(): string[] {
  return PROTOCOLO.map((f) => `  :${String(f.puerto).padEnd(6)} ${f.nombre.padEnd(18)} ${f.url}`);
}

/** El bloque compacto para el prompt del modelo: dice quién es quién sin párrafos. */
export function bloqueProtocoloParaPrompt(): string {
  const filas = PROTOCOLO.map((f) => `  :${f.puerto} ${f.nombre} → ${f.dueno}. ${f.nunca}.`);
  return [
    "[DIRECCIONES — protocolo de la casa, no inventes otras]",
    ...filas,
    "- El proyecto del usuario se SIRVE en el sandbox; la IDE es la herramienta que lo sirve.",
    "- Si algo no aparece, di en qué puerto lo buscaste: un «no anda» sin puerto no se puede diagnosticar.",
  ].join("\n");
}

/**
 * AUDITORÍA: ¿algún cliente apunta a una dirección que no es llamable?
 * `0.0.0.0`, `::` y `[::]` son direcciones de ESCUCHA: llamarlas es no llamar a
 * nadie. `localhost` se tolera solo porque `resolverOllama` lo fija a 127.0.0.1
 * antes de salir; como valor final en un cliente se reporta igual.
 */
export function auditarDirecciones(entradas: Record<string, string | undefined> = {}): string[] {
  const hallazgos: string[] = [];
  const ollama = resolverOllama(entradas as any);
  if (ollama.avisos.length > 0) hallazgos.push(...ollama.avisos);
  const url = String(ollama.base || "");
  if (/\/\/(0\.0\.0\.0|\[::\]|::)(:|\)|$)/.test(url)) {
    hallazgos.push(`Ollama quedó apuntando a una dirección de escucha (${url}): llamadas que no llegan a nadie`);
  }
  if (!/^https?:\/\/[^/]+:\d+/.test(url)) {
    hallazgos.push(`la dirección de Ollama no trae puerto explícito (${url || "vacía"})`);
  }
  return hallazgos;
}

/** El protocolo en una frase, para el log de arranque. */
export function resumenProtocolo(): string {
  return `DIRECCIONES · ${PROTOCOLO.map((f) => `${f.nombre} :${f.puerto}`).join(" · ")}`;
}
