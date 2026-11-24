/**
 * memoriaNegativa.ts — LO QUE YA FALLÓ, NO SE REPITE (v1.40.0 · FASE 10)
 * =====================================================================================
 * QUÉ CURA: la hoja de ruta (§10 · Memory 3.0) pide MEMORIA NEGATIVA: recordar
 * qué enfoques ya se intentaron para una firma de fallo y NO funcionaron, para
 * no gastarlos otra vez. El defecto a evitar: el agente que ante el mismo error
 * prueba «reinstalar» tres turnos seguidos. Aquí la clave es la FIRMA del error
 * — y la fuente única de esa firma es `firmaError` de reconocimientoError, NO se
 * reimplementa la normalización (react-dom ≡ react-dom/client).
 *   · anotarIntento(firma, enfoque, resultado) guarda si un enfoque fracasó.
 *   · enfoquesGastados(firma) lista lo ya probado en balde.
 *   · debeEvitar(firma, enfoque) dice si repetiríamos un fracaso conocido.
 *   · sugerenciaEvitando(firma, candidatos) filtra los quemados y propone el
 *     primer enfoque nuevo — o avisa de que no quedan.
 * PURO: el estado vive en un objeto Registro pasado por el llamador. Sin disco.
 */

import { firmaError, type ContextoError } from "./reconocimientoError";

export type ResultadoIntento = "fallo" | "exito";

export interface Intento {
  enfoque: string;
  resultado: ResultadoIntento;
  ts: number;
}

export interface RegistroNegativo {
  /** firma → intentos anotados para ella. */
  porFirma: Record<string, Intento[]>;
}

export function registroVacio(): RegistroNegativo {
  return { porFirma: {} };
}

function firmaDe(entrada: string | ContextoError): string {
  return firmaError(entrada);
}
function norm(s: string): string {
  return (s || "").trim().toLowerCase();
}

/** Anota que, para esta firma, se probó `enfoque` con `resultado`. */
export function anotarIntento(
  reg: RegistroNegativo,
  entrada: string | ContextoError,
  enfoque: string,
  resultado: ResultadoIntento,
  ts = 0,
): void {
  const f = firmaDe(entrada);
  if (!reg.porFirma[f]) reg.porFirma[f] = [];
  reg.porFirma[f].push({ enfoque, resultado, ts });
}

/** Enfoques que ya FALLARON para esta firma (sin duplicar). */
export function enfoquesGastados(reg: RegistroNegativo, entrada: string | ContextoError): string[] {
  const f = firmaDe(entrada);
  const lista = reg.porFirma[f] || [];
  const gastados = new Set<string>();
  for (const it of lista) if (it.resultado === "fallo") gastados.add(it.enfoque);
  return [...gastados];
}

/** ¿Repetiríamos un fracaso conocido? true si `enfoque` ya falló para esta firma. */
export function debeEvitar(reg: RegistroNegativo, entrada: string | ContextoError, enfoque: string): boolean {
  return enfoquesGastados(reg, entrada).some((e) => norm(e) === norm(enfoque));
}

export interface Sugerencia {
  enfoque: string | null;
  hayNuevo: boolean;
  evitados: string[];
  motivo: string;
}

/**
 * De una lista de candidatos, propone el primero que NO esté quemado para esta
 * firma. Si todos fallaron, lo dice con honestidad (pide cambiar de estrategia).
 */
export function sugerenciaEvitando(
  reg: RegistroNegativo,
  entrada: string | ContextoError,
  candidatos: string[],
): Sugerencia {
  const gastados = enfoquesGastados(reg, entrada);
  const quemado = new Set(gastados.map(norm));
  const lista = Array.isArray(candidatos) ? candidatos.filter(Boolean) : [];
  const nuevo = lista.find((c) => !quemado.has(norm(c))) || null;
  if (nuevo)
    return { enfoque: nuevo, hayNuevo: true, evitados: gastados,
      motivo: `«${nuevo}» no se ha probado para esta firma; evita ${gastados.length} enfoque(s) ya fallido(s).` };
  return { enfoque: null, hayNuevo: false, evitados: gastados,
    motivo: gastados.length
      ? `todos los candidatos ya fallaron para esta firma (${gastados.join(", ")}): cambia de estrategia o escala.`
      : "no hay candidatos que proponer." };
}
