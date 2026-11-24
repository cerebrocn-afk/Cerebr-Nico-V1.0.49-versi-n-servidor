/**
 * multiagenteRelevo.ts — EL EQUIPO QUE COMPARTE EL RELEVO (v1.85.0 · FASE 6.3)
 * ===========================================================================
 * QUÉ PIDE EL PLANO: «Agentes especialistas (código, revisión, pruebas) como
 * sesiones reales que comparten la cola de favoritos curada de v1.78.0: si el
 * especialista falla, el relevo es el MISMO, con las mismas reglas honestas. No
 * es un panel que simula: son procesos con memoria común (el órgano de FASE 2 es
 * su pizarra)».
 *
 * LO QUE HABÍA Y POR QUÉ NO ALCANZABA: `relevoPorDiseno` (v1.80.0) Releva bien,
 * pero dentro de UN turno de UN chat. En cuanto el trabajo se reparte entre
 * especialistas, cada llamante se fabricaba su propio `EstadoRelevo` y el tope
 * de 2 pasaba a ser 2 POR AGENTE: con cuatro especialistas el usuario veía ocho
 * llamadas a la nube pagando su propia cuota, y ninguno sabía que los demás ya
 * habían probado ese modelo. El relevo seguía existiendo; lo que se había roto
 * era la palabra "compartido".
 *
 * LO QUE HACE ESTE MÓDULO:
 *   · UN `EstadoRelevo` por equipo — el tope, los probados y los intentos son del
 *     equipo, no de la sesión. La decisión la sigue tomando `relevoFavoritos.ts`
 *     sin tocar una coma de su criterio (CONSERVA + delta, V8 §6.1).
 *   · sesiones reales: cada especialista tiene estado, contador de turnos y
 *     cierre. Nadie "simula" un agente con un objeto anónimo.
 *   · cola compartida: cualquier especialista puede tomar el siguiente trabajo.
 *   · pizarra común: cada resultado se aprende en el órgano (`cerebroOrgano`) y
 *     el siguiente especialista lo recupera por sentido. Si un agente descubrió
 *     algo, el equipo lo sabe.
 *   · informe honesto al agotar el tope, con la traza de quién falló primero.
 *
 * INYECCIÓN: `llamar` es una función que el llamante pasa (en el servidor, la
 * llamada real a Ollama/nube; en el test, un falso determinista). Este módulo no
 * hace red ni levanta procesos: orquesta y recuerda.
 */
import {
  decisionRelevoFavoritos,
  decisionRelevoPorFallo,
  informeHonestoRelevo,
  turnoQuedoVacio,
  TOPE_RELEVOS,
  type EstadoRelevo,
  type FavoritoRelay,
  type IntentoRelevo,
} from "./relevoFavoritos";
import { ENTIDADES, entidadPorId, pensarConsejo } from "./reflejo/consejo";
import { TABLAS } from "./reflejo";
import type { Tablas } from "./cerebroReflejo";
import { aprender, enrutar } from "./cerebroOrgano";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface TareaAgente {
  id: string;
  /** La frase tal cual la recibiría el consejo. */
  frase: string;
  /** Herramienta/espejo a ejecutar (si el llamante ya lo sabe). */
  entidad?: string;
  datos?: Record<string, unknown>;
}

export type EstadoSesion = "libre" | "ocupada" | "cerrada";

export interface SesionAgente {
  /** Id de un especialista del catálogo de 51 (fuente única). */
  especialista: string;
  estado: EstadoSesion;
  turnos: number;
  /** Cuántas veces este agente terminó en fallo (para el informe del equipo). */
  fallos: number;
  relevosQueLeTocaron: number;
  abrioEn: number;
  cerroEn?: number;
}

export interface LlamadaEquipo {
  especialista: string;
  tareaId: string;
  modelo: string;
  proveedor: string;
  /** `relevo` cuando la voz no es la primaria del especialista. */
  motivo: string;
}

/** La voz que contesta. El servidor la inyecta; el test la finge. */
export type FuncionLlamar = (llamada: LlamadaEquipo, tarea: TareaAgente) => Promise<{ texto: string; fallo?: string }>;

export interface ResultadoAgente {
  tareaId: string;
  especialista: string;
  entidad: string | null;
  ok: boolean;
  texto: string;
  /** Voz que terminó contestando (o la primaria si no hubo relevo). */
  vozFinal: { modelo: string; proveedor: string };
  intentos: IntentoRelevo[];
  relevosDeEstaTarea: number;
  motivo?: string;
  /** El informe honesto cuando la cascada se agotó. Nunca silencio. */
  informe?: string;
  /** Qué recuperó de la pizarra antes de hablar (memoria común). */
  pizarra?: Array<{ tema: string; titulo: string }>;
  ms: number;
}

export interface Equipo {
  id: string;
  raizDatos: string;
  /** El modelo con el que cada especialista arranca su turno (por especialista). */
  primarias: Record<string, { modelo: string; proveedor: string }>;
  sesiones: Record<string, SesionAgente>;
  /** ⭐ La cola curada de v1.78.0 — la MISMA lista para todos. */
  favoritos: FavoritoRelay[];
  /** EL relevo compartido: un solo estado, un solo tope, una sola traza. */
  relevo: EstadoRelevo;
  cola: TareaAgente[];
  historial: ResultadoAgente[];
  creada: number;
}

export interface OpcionesEquipo {
  raizDatos: string;
  /** La primaria de cada especialista; sin ella, la voz es el propio especialista. */
  primarias?: Record<string, { modelo: string; proveedor: string }>;
  /** La capacidad `auto_relay` del panel de capacidades (el usuario manda). */
  relevoActivado?: boolean;
  id?: string;
  ahora?: () => number;
  tablas?: Tablas;
}

// ─── El equipo ─────────────────────────────────────────────────────────────

/**
 * CREAR EQUIPO. Rechaza en la puerta lo que el plano no deja fingir: un
 * especialista que no está en las 51 entidades no entra (fuente única de
 * nombres, V8 §7.1). Devuelve el equipo con las sesiones ya abiertas.
 */
export function crearEquipo(
  especialistas: string[],
  favoritos: FavoritoRelay[],
  opts: OpcionesEquipo
): { ok: boolean; equipo?: Equipo; rechazados: string[]; motivo?: string } {
  const ahora = opts.ahora || Date.now;
  const ts = ahora();
  const rechazados: string[] = [];
  const validos: string[] = [];
  for (const idS of especialistas || []) {
    const ficha = entidadPorId(String(idS));
    if (!ficha) {
      rechazados.push(`${idS}: no está entre las ${ENTIDADES.length} entidades del catálogo`);
      continue;
    }
    if (ficha.tipo !== "especialista") {
      rechazados.push(`${ficha.id}: es ${ficha.tipo}, no un especialista votante (no tiene sesión propia)`);
      continue;
    }
    validos.push(ficha.id);
  }
  if (!validos.length) {
    return { ok: false, rechazados, motivo: "ningún especialista del equipo existe en el catálogo: no se arma un equipo de fantasmas" };
  }
  const sesiones: Record<string, SesionAgente> = {};
  for (const id of validos) {
    sesiones[id] = { especialista: id, estado: "libre", turnos: 0, fallos: 0, relevosQueLeTocaron: 0, abrioEn: ts };
  }
  const equipo: Equipo = {
    id: opts.id || `eq-${ts}`,
    raizDatos: opts.raizDatos,
    primarias: opts.primarias || {},
    sesiones,
    favoritos: (favoritos || []).filter((f) => f && f.modelId && f.provider),
    // ★ El corazón de FASE 6.3: UN estado de relevo para TODO el equipo.
    relevo: { activado: opts.relevoActivado !== false, relevosEsteTurno: 0, probados: [], intentos: [] },
    cola: [],
    historial: [],
    creada: ts,
  };
  return { ok: true, equipo, rechazados };
}

/** Encolar trabajo en la cola compartida (cualquier especialista lo puede tomar). */
export function encolar(equipo: Equipo, tareas: TareaAgente[]): number {
  const nuevas = (tareas || []).filter((t) => t && t.id && t.frase);
  equipo.cola.push(...nuevas);
  return equipo.cola.length;
}

/** Siguiente trabajo de la cola (FIFO; se lo saca de encima). */
export function siguienteTarea(equipo: Equipo): TareaAgente | null {
  return equipo.cola.shift() ?? null;
}

/** A quién le toca: el especialista con menos turnos (reparto, no el primero). */
export function elegirEspecialista(equipo: Equipo, tarea: TareaAgente, tablas?: Tablas): string | null {
  const ids = Object.keys(equipo.sesiones).filter((id) => equipo.sesiones[id].estado === "libre");
  if (!ids.length) return null;
  // Si el propio consejo ya sabe de qué dominio es la frase, ese especialista
  // toma la tarea — pero solo si está en el equipo (no se inventa personal).
  try {
    const decidido = pensarConsejo(tarea.frase, tablas || (TABLAS as any).lite);
    const dueno = (decidido as any).especialista;
    if (dueno && equipo.sesiones[dueno] && equipo.sesiones[dueno].estado === "libre") return dueno;
  } catch {
    /* sin tablas: reparto por carga, que es lo que había */
  }
  return ids.sort((a, b) => equipo.sesiones[a].turnos - equipo.sesiones[b].turnos || a.localeCompare(b))[0];
}

// ─── El ciclo de un especialista, con el relevo del equipo ──────────────────

/**
 * PASAR TAREA: un especialista real intenta la tarea con su primaria; si el
 * turno queda vacío o falla, el relevo lo decide el MISMO criterio de v1.80.0
 * contra el estado COMPARTIDO del equipo. Devuelve el resultado con la voz que
 * contestó y la traza de intentos. Nunca lanza: si no hay quién conteste, el
 * `informe` llega igual (regla de la casa: el tope sin informe es silencio).
 */
export async function pasarTarea(equipo: Equipo, tarea: TareaAgente, llamar: FuncionLlamar): Promise<ResultadoAgente> {
  const t0 = Date.now();
  const especialista = elegirEspecialista(equipo, tarea);
  if (!especialista) {
    return {
      tareaId: tarea.id, especialista: "(sin equipo)", entidad: tarea.entidad ?? null, ok: false, texto: "",
      vozFinal: { modelo: "", proveedor: "" }, intentos: [], relevosDeEstaTarea: 0,
      motivo: "no hay ninguna sesión libre en el equipo", ms: 0,
    };
  }
  const sesion = equipo.sesiones[especialista];
  sesion.estado = "ocupada";
  sesion.turnos += 1;

  // La pizarra antes de hablar: qué sabe el equipo de esto mismo (FASE 2).
  let pizarra: Array<{ tema: string; titulo: string }> = [];
  try {
    pizarra = enrutar(equipo.raizDatos, tarea.frase, 3).map((r) => ({ tema: r.entrada.tema, titulo: r.entrada.titulo }));
  } catch {
    pizarra = [];
  }

  const primaria = equipo.primarias[especialista] || { modelo: especialista, proveedor: "equipo" };
  const relevantesAntes = equipo.relevo.relevosEsteTurno || 0;
  const intentosEnTarea: IntentoRelevo[] = [];
  let voz = { ...primaria };
  let texto = "";
  let ok = false;
  let informe: string | undefined;
  let motivo: string | undefined;

  const registrarIntento = (v: { modelo: string; proveedor: string }, causa: string) => {
    if (!equipo.relevo.intentos) equipo.relevo.intentos = [];
    equipo.relevo.intentos.push({ provider: v.proveedor, modelId: v.modelo, motivo: causa });
    if (!equipo.relevo.probados.includes(v.modelo)) equipo.relevo.probados.push(v.modelo);
    intentosEnTarea.push({ provider: v.proveedor, modelId: v.modelo, motivo: causa });
  };

  // El ciclo de voces: la primaria y luego la cascada del relevo, con el tope
  // del EQUIPO. La decisión la toma `relevoFavoritos.ts` (v1.80.0) sin copiar su
  // criterio: acá solo se ejecuta la voz que el criterio manda y se anota.
  let guard = 0;
  while (guard <= TOPE_RELEVOS + 2) {
    guard++;
    const esPrimaria = voz.modelo === primaria.modelo;
    let falloDeEsta: string | null = null;
    let respuesta = "";
    try {
      const r = await llamar(
        { especialista, tareaId: tarea.id, modelo: voz.modelo, proveedor: voz.proveedor, motivo: esPrimaria ? "primaria" : "relevo compartido" },
        tarea,
      );
      respuesta = String(r?.texto ?? "");
      if (r?.fallo) falloDeEsta = String(r.fallo);
      else if (turnoQuedoVacio(respuesta)) falloDeEsta = "turno vacío: cerró sin contestar";
      else texto = respuesta;
    } catch (e: any) {
      falloDeEsta = `excepción: ${e?.message || e}`;
    }
    if (!falloDeEsta) { ok = true; break; }

    // Esta voz no sirvió: pasa a `probados` del equipo (nadie la repite) y se
    // pregunta al criterio qué hacer.
    registrarIntento(voz, falloDeEsta);
    const d = esPrimaria
      ? decisionRelevoPorFallo(equipo.relevo, falloDeEsta, equipo.favoritos)
      : decisionRelevoFavoritos(equipo.relevo, "", equipo.favoritos, voz.proveedor);
    if (d.accion === "relevar") {
      equipo.relevo.relevosEsteTurno = (equipo.relevo.relevosEsteTurno || 0) + 1;
      sesion.relevosQueLeTocaron += 1;
      voz = { modelo: d.destino.modelId, proveedor: d.destino.provider };
      continue;
    }
    if (d.accion === "informar") { informe = d.informe; break; }
    motivo = d.motivo || falloDeEsta;
    break;
  }

  if (!ok && !informe && equipo.relevo.intentos && equipo.relevo.intentos.length) {
    informe = informeHonestoRelevo(equipo.relevo.intentos);
  }
  if (!ok) sesion.fallos += 1;

  // 3) La pizarra: lo que el equipo aprendió, lo aprende el órgano (FASE 2).
  try {
    aprender(equipo.raizDatos, {
      tema: "equipo",
      titulo: `${equipo.id}/${tarea.id}`,
      texto: `${especialista} ${ok ? "resolvió" : "no resolvió"} «${tarea.frase.slice(0, 120)}» con ${voz.modelo} (${voz.proveedor}). ${ok ? String(texto || "").slice(0, 400) : "motivo: " + (motivo || informe || "sin motivo declarado")}`,
      palabras: [especialista, voz.modelo, voz.proveedor, ok ? "ok" : "fallo"],
    });
  } catch {
    /* el órgano nunca tumba un turno (regla de `aprender`) */
  }

  sesion.estado = "libre";
  const resultado: ResultadoAgente = {
    tareaId: tarea.id,
    especialista,
    entidad: tarea.entidad ?? null,
    ok,
    texto,
    vozFinal: voz,
    intentos: intentosEnTarea,
    relevosDeEstaTarea: (equipo.relevo.relevosEsteTurno || 0) - relevantesAntes,
    motivo,
    informe,
    pizarra,
    ms: Date.now() - t0,
  };
  equipo.historial.push(resultado);
  return resultado;
}

/** Cierra la sesión de un especialista. Sus tareas vuelven a la cola compartida. */
export function cerrarSesion(equipo: Equipo, especialista: string, ahora = Date.now()): { ok: boolean; motivo?: string } {
  const s = equipo.sesiones[especialista];
  if (!s) return { ok: false, motivo: `«${especialista}» no es una sesión de este equipo` };
  if (s.estado === "cerrada") return { ok: false, motivo: `«${especialista}» ya estaba cerrada` };
  s.estado = "cerrada";
  s.cerroEn = ahora;
  return { ok: true };
}

/** Qué hay en la pizarra para esta consulta (la memoria común, no un grep). */
export function consultarPizarra(equipo: Equipo, consulta: string, max = 4): Array<{ tema: string; titulo: string; resumen: string }> {
  try {
    return enrutar(equipo.raizDatos, consulta, max).map((r) => ({
      tema: r.entrada.tema,
      titulo: r.entrada.titulo,
      resumen: String(r.entrada.resumen || "").slice(0, 160),
    }));
  } catch {
    return [];
  }
}

export interface EstadoEquipo {
  id: string;
  sesiones: Array<{ especialista: string; estado: EstadoSesion; turnos: number; fallos: number; relevos: number }>;
  cola: number;
  resueltas: number;
  fallidas: number;
  /** El relevo compartido, a la vista: el tope es UNO para todo el equipo. */
  relevo: { activado: boolean; usados: number; tope: number; probados: string[]; intentos: number };
  informe?: string;
  nota: string;
}

/** La cara para `/api/multiagente/estado` y para el panel. */
export function estadoEquipo(equipo: Equipo): EstadoEquipo {
  const historial = equipo.historial;
  const ultimoConInforme = [...historial].reverse().find((h) => h.informe);
  return {
    id: equipo.id,
    sesiones: Object.values(equipo.sesiones).map((s: SesionAgente) => ({
      especialista: s.especialista,
      estado: s.estado,
      turnos: s.turnos,
      fallos: s.fallos,
      relevos: s.relevosQueLeTocaron,
    })),
    cola: equipo.cola.length,
    resueltas: historial.filter((h) => h.ok).length,
    fallidas: historial.filter((h) => !h.ok).length,
    relevo: {
      activado: !!equipo.relevo.activado,
      usados: equipo.relevo.relevosEsteTurno || 0,
      tope: TOPE_RELEVOS,
      probados: [...(equipo.relevo.probados || [])],
      intentos: (equipo.relevo.intentos || []).length,
    },
    informe: ultimoConInforme?.informe,
    nota: `${Object.keys(equipo.sesiones).length} sesiones reales comparten UN relevo (tope ${TOPE_RELEVOS} por turno de equipo) y una pizarra en el órgano de FASE 2.`,
  };
}
