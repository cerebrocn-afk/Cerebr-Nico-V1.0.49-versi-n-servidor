/**
 * enrutadorModelo.ts — EL MODELO CORRECTO PARA CADA TAREA (v1.39.0 · FASE 9)
 * =====================================================================================
 * QUÉ CURA: la hoja de ruta (§9) pide un "model router" — no gastar un modelo
 * grande en clasificar una intención, ni pedirle a un micro que diseñe una
 * arquitectura. El defecto a evitar: un enrutador que reinventa la escalera de
 * niveles. Aquí NO se reinventa: la FUENTE ÚNICA de niveles y capacidades es
 * `modelTiers` (getModelProfile / getTier / ModelTier). Este módulo solo:
 *   · mapea la CLASE de tarea al nivel MÍNIMO adecuado (barato→caro).
 *   · elige, entre los modelos DISPONIBLES, el más barato que cumpla ese piso
 *     y —si la tarea usa herramientas— sea toolCapable.
 *   · degrada con honestidad: si nada cumple, dice por qué y ofrece el mejor
 *     disponible marcado como "insuficiente".
 * PURO: recibe la lista de modelos y la tarea, devuelve la decisión. Sin red.
 */

import { getModelProfile, type ModelTier, type ModelProfile } from "./modelTiers";

export type ClaseTarea =
  | "clasificar"      // intención / routing / sí-no
  | "chat"            // conversación corta
  | "redactar"        // prosa / documentación
  | "codigo"          // escribir/editar código
  | "agente"          // bucle con herramientas
  | "arquitectura";   // diseño de sistemas / razonamiento profundo

/** Orden barato→caro. Índice = coste relativo. */
export const ORDEN_NIVELES: ModelTier[] = ["micro", "tiny", "small", "medium", "large", "cloud"];

/** Nivel MÍNIMO por clase de tarea (piso; puede subir si no hay nada). */
export const PISO_POR_CLASE: Record<ClaseTarea, ModelTier> = {
  clasificar: "micro",
  chat: "tiny",
  redactar: "small",
  codigo: "small",
  agente: "medium",
  arquitectura: "large",
};

/** ¿La tarea necesita herramientas (bucle de agente)? */
export const USA_HERRAMIENTAS: Record<ClaseTarea, boolean> = {
  clasificar: false, chat: false, redactar: false, codigo: false, agente: true, arquitectura: false,
};

export interface CandidatoModelo {
  modelo: string;
  perfil: ModelProfile;
  nivel: number;   // índice en ORDEN_NIVELES
}

export interface DecisionEnrutado {
  clase: ClaseTarea;
  pisoNivel: ModelTier;
  elegido: string | null;
  suficiente: boolean;
  motivo: string;
  descartados: { modelo: string; motivo: string }[];
}

function nivelDe(tier: ModelTier): number {
  const i = ORDEN_NIVELES.indexOf(tier);
  return i < 0 ? 0 : i;
}

/**
 * Enruta la tarea al modelo más barato que cumpla el piso (y toolCapable si
 * aplica). `ramGb` se pasa a getModelProfile para no elegir algo que ahogue la
 * máquina. Determinista: ante empate de nivel, gana el de menos parámetros.
 */
export function enrutar(clase: ClaseTarea, modelos: string[], ramGb?: number): DecisionEnrutado {
  const pisoTier = PISO_POR_CLASE[clase] ?? "small";
  const piso = nivelDe(pisoTier);
  const necesitaTool = !!USA_HERRAMIENTAS[clase];
  const lista = Array.isArray(modelos) ? modelos.filter(Boolean) : [];
  const descartados: { modelo: string; motivo: string }[] = [];

  const candidatos: CandidatoModelo[] = lista.map((m) => {
    const perfil = getModelProfile(m, ramGb);
    return { modelo: m, perfil, nivel: nivelDe(perfil.tier) };
  });

  // Elegibles: cumplen piso y (si aplica) son toolCapable.
  const elegibles = candidatos.filter((c) => {
    if (c.nivel < piso) { descartados.push({ modelo: c.modelo, motivo: `nivel ${c.perfil.tier} < piso ${pisoTier}` }); return false; }
    if (necesitaTool && !c.perfil.toolCapable) { descartados.push({ modelo: c.modelo, motivo: "no es toolCapable y la tarea usa herramientas" }); return false; }
    return true;
  });

  if (elegibles.length) {
    // El más barato: menor nivel; a igual nivel, menos parámetros; a igual, nombre.
    elegibles.sort((a, b) =>
      a.nivel !== b.nivel ? a.nivel - b.nivel
      : (a.perfil.paramsB ?? 0) !== (b.perfil.paramsB ?? 0) ? (a.perfil.paramsB ?? 0) - (b.perfil.paramsB ?? 0)
      : a.modelo.localeCompare(b.modelo));
    const g = elegibles[0];
    return {
      clase, pisoNivel: pisoTier, elegido: g.modelo, suficiente: true,
      motivo: `«${g.modelo}» (${g.perfil.tier}) es el más barato que cumple el piso ${pisoTier}${necesitaTool ? " y es toolCapable" : ""}.`,
      descartados,
    };
  }

  // Nada cumple: honestidad — ofrece el mejor disponible como insuficiente.
  if (!candidatos.length)
    return { clase, pisoNivel: pisoTier, elegido: null, suficiente: false, motivo: "no hay modelos disponibles.", descartados };

  const mejor = [...candidatos].sort((a, b) => b.nivel - a.nivel || (b.perfil.paramsB ?? 0) - (a.perfil.paramsB ?? 0))[0];
  return {
    clase, pisoNivel: pisoTier, elegido: mejor.modelo, suficiente: false,
    motivo: `ninguno alcanza el piso ${pisoTier}${necesitaTool ? " con herramientas" : ""}; se ofrece «${mejor.modelo}» (${mejor.perfil.tier}) como el mejor disponible, INSUFICIENTE.`,
    descartados,
  };
}
