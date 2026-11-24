/**
 * extensiones/index.ts — BOOTSTRAP: MONTA LAS EXTENSIONES DEL MOTOR (v1.24.0)
 * ============================================================================
 * Punto único donde las extensiones «de fábrica» se MONTAN al motor. Importar
 * este módulo tiene el efecto de dejar las capas enganchadas a sus botones.
 * thinkingMode.ts lo importa una vez para que el botón «Ingeniero» ya salga
 * ampliado sin que la app tenga que acordarse de montar nada.
 *
 * Idempotente a propósito: si el módulo se evalúa dos veces (tests, HMR), no
 * intenta montar lo ya montado ni ensucia el log. Devuelve el parte honesto de
 * qué se montó y qué no, por si alguien quiere auditarlo.
 */
import { montarExtension, estaMontada, type ResultadoMontaje, type ExtensionMotor } from "../extensionesMotor";
import { EXTENSION_INGENIERO_SENIOR } from "./ingenieroSenior";

/** Las extensiones de fábrica, en el orden en que se montan. */
export const EXTENSIONES_DE_FABRICA: ExtensionMotor[] = [
  EXTENSION_INGENIERO_SENIOR,
];

/**
 * Monta las de fábrica que aún no estén montadas. Devuelve el parte por id:
 * honesto tanto en éxito como en rechazo (una extensión mal formada no tumba
 * el arranque, solo no se monta y se explica).
 */
export function montarExtensionesDeFabrica(): ResultadoMontaje[] {
  const partes: ResultadoMontaje[] = [];
  for (const ext of EXTENSIONES_DE_FABRICA) {
    if (estaMontada(ext.id)) {
      partes.push({ ok: true, id: ext.id });
      continue;
    }
    partes.push(montarExtension(ext));
  }
  return partes;
}

// Efecto de montaje al importar: deja el motor listo. Se ejecuta una vez por
// realización del módulo; `estaMontada` lo hace seguro ante reevaluaciones.
export const PARTE_MONTAJE_INICIAL: ResultadoMontaje[] = montarExtensionesDeFabrica();
