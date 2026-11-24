/**
 * propuestasAutonomas.ts — SUITE «EL LABORATORIO TIENE MOTOR»: AUTO-PROPUESTA
 * DE PARCHES AL CEREBRO (v1.76.0)
 * ============================================================================
 * CIERRA la deuda declarada de `auto_propose` en el laboratorio de capacidades:
 * «falta el contador de fallos repetidos por patrón y la redacción automática».
 * El contador y la redacción viven en la capa pura `src/engine/patronesFallo.ts`
 * (probada en `tests/patronesFallo.test.ts`); acá está el cable con permiso de
 * tocar disco, calcado del patrón de `aprendizajeVivo` (v1.74.0):
 *
 *   · estado en `.cerebro-db/propuestas-autonomas.json` (ventana acotada);
 *   · la propuesta se materializa con el MISMO escritor que ya existía en la
 *     casa (`Brain.guardarPropuesta` → `.cerebro-db/proposals/*.md` + métrica
 *     «propuestas» en memoria.md). Cero formatos nuevos, cero duplicación;
 *   · aviso en la barra de Tareas en el momento exacto en que se propone
 *     (`PROPOSTA P#…`), igual que las lecciones de v1.74.0;
 *   · NUNCA aplica nada: `cerebro.md` es el núcleo inmutable — la propuesta
 *     queda pendiente de aprobación humana (regla de la casa, intacta).
 *
 * APAGADA POR DEFECTO: la capacidad `auto_propose` decide si esta suite
 * registra o no. Apagada no escribe ni un byte (coste en reposo: cero, la
 * misma regla del RAG y del multi-cerebro).
 *
 * CONTROL DE FALSO POSITIVO heredado de la capa pura: un turno que reintentó
 * la misma llamada diez veces suma UNA ocurrencia; la propuesta exige
 * reincidencia entre TURNOS distintos (≥3) y guarda de cooldown (7 días).
 */

import * as fs from "fs";
import * as path from "path";
import {
  clasificarFallo,
  contarPatron,
  decidirPropuesta,
  redactarPropuesta,
  clavePatron,
  type EstadoPatrones,
  type EntradaPatron,
} from "../src/engine/patronesFallo";

export interface DepsPropuestasAutonomas {
  proyectoRoot: string;
  /** La capacidad del laboratorio, leída al momento del hecho (no al arrancar). */
  activada?: () => boolean;
  /** Reloj inyectable — los tests congelan el tiempo sin dormir. */
  ahora?: () => number;
  /** El MISMO escritor de propuestas de la casa (`Brain.guardarPropuesta`). */
  guardarPropuesta: (p: { motivo: string; linea: string; bloque: string; detectadaEn: number }) => string | null;
  /** Espejo vivo para la barra de Tareas (opcional: sin él, solo consola). */
  marcarVivo?: (nota: string) => void;
}

let deps: DepsPropuestasAutonomas | null = null;
let estado: EstadoPatrones = {};
let turnoActual = "turno";
let contadorTurnos = 0;
let propuestasGeneradas = 0;

const estadoPath = (): string =>
  path.join(deps!.proyectoRoot, ".cerebro-db", "propuestas-autonomas.json");

const ahoraMs = (): number => (deps?.ahora ? deps.ahora() : Date.now());

function cargarEstado(): void {
  estado = {};
  if (!deps) return;
  try {
    if (fs.existsSync(estadoPath())) {
      const j = JSON.parse(fs.readFileSync(estadoPath(), "utf-8"));
      if (j && typeof j === "object" && j.patrones && typeof j.patrones === "object") {
        estado = j.patrones as EstadoPatrones;
      }
    }
  } catch {
    estado = {};
  }
}

function guardarEstado(): void {
  if (!deps) return;
  try {
    fs.mkdirSync(path.dirname(estadoPath()), { recursive: true });
    fs.writeFileSync(estadoPath(), JSON.stringify({ generadoEn: ahoraMs(), patrones: estado }), "utf-8");
  } catch {
    /* el contador nunca rompe un turno que funciona */
  }
}

export function inicializarPropuestasAutonomas(d: DepsPropuestasAutonomas): void {
  deps = d;
  cargarEstado();
}

/** Abre turno: el mismo gancho que `abrirTurnoBucle()` en las dos ramas. */
export function abrirTurnoPropuestas(): void {
  contadorTurnos += 1;
  turnoActual = `t${contadorTurnos}-${Date.now()}`;
}

/** Estado para el panel / diagnóstico. */
export function estadoPropuestasAutonomas(): {
  ok: boolean;
  inicializado: boolean;
  activada: boolean;
  patrones: Array<EntradaPatron & { clave: string; propuestaPendiente: boolean }>;
  propuestasGeneradas: number;
} {
  const activada = !!deps?.activada?.();
  const lista = Object.keys(estado)
    .map((k) => {
      const e = estado[k];
      const dec = decidirPropuesta(e, ahoraMs());
      return { ...e, clave: k, propuestaPendiente: dec.generar };
    })
    .sort((a, b) => b.total - a.total || b.ultimaVez - a.ultimaVez)
    .slice(0, 30);
  return { ok: true, inicializado: !!deps, activada, patrones: lista, propuestasGeneradas };
}

/** Olvida contadores (botón honesto: el usuario decide borrar la memoria del patrón). */
export function limpiarPatrones(): { ok: boolean; borrados: number } {
  const n = Object.keys(estado).length;
  estado = {};
  guardarEstado();
  return { ok: true, borrados: n };
}

/**
 * El hecho que activa todo: una herramienta del lazo falló. Se llama desde
 * `learnFromToolFailure` (lazo local) y desde el lazo de nube con el mismo
 * contrato tolerante a fallos: NUNCA corta un turno.
 */
export function notificarFalloRecurrente(
  herramienta: string,
  errorTexto: string,
  opts?: { turnoId?: string; ahora?: number }
): { generado: boolean; motivo: string; archivo?: string } {
  if (!deps) return { generado: false, motivo: "no inicializado" };
  if (deps.activada && !deps.activada()) return { generado: false, motivo: "capacidad apagada" };
  const ahora = opts?.ahora ?? ahoraMs();
  const turno = opts?.turnoId || turnoActual;
  const clasif = clasificarFallo(errorTexto);
  const entrada = contarPatron(estado, herramienta, clasif, turno, ahora);
  const dec = decidirPropuesta(entrada, ahora);
  if (dec.generar) {
    const texto = redactarPropuesta(herramienta, entrada, clasif, dec.motivo);
    const campo = (nombre: string) => {
      const m = texto.match(new RegExp(`^-\\s*${nombre}\\s*:(.*)$`, "im"));
      return m ? m[1].trim() : "";
    };
    const archivo = deps.guardarPropuesta({
      motivo: campo("Motivo"),
      linea: campo("Línea a modificar"),
      bloque: texto,
      detectadaEn: ahora,
    });
    propuestasGeneradas += archivo ? 1 : 0;
    entrada.propuestoEn = ahora;
    entrada.vecesPropuesto += 1;
    estado[clavePatron(herramienta, entrada.patron)] = entrada;
    guardarEstado();
    try {
      deps.marcarVivo?.(`PROPUESTA (${herramienta} · ${entrada.patron}): ${dec.motivo} — pendiente en proposals`);
    } catch {
      /* el aviso nunca rompe nada */
    }
    console.log(`[CerebroNico] auto-propuesta (${herramienta} · ${entrada.patron}): ${dec.motivo} — pendiente en .cerebro-db/proposals${archivo ? "" : " (no se pudo escribir)"}`);
    return { generado: true, motivo: dec.motivo, archivo: archivo || undefined };
  }
  guardarEstado();
  return { generado: false, motivo: dec.motivo };
}
