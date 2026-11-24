/**
 * ecoTurno.ts · EL AVISO QUE SE DICE UNA VEZ POR DECISIÓN (v1.98.0)
 * =================================================================
 * El log de la sesión del 31/10 (v1.97.5) traía el mismo par de líneas repetidas
 * hasta veintitantas veces por turno:
 *
 *   · `Capacidad SIN VERIFICAR para "openrouter/auto"` → una por CADA request
 *     del ciclo (24 requests = 24 gritos por la misma decisión de la casa).
 *   · `Historial recortado: 25→24 … 30→24` → una por request con historial largo.
 *
 * Ninguna es una emergencia: son conducta normal del enrutador y del perfil de
 * historial. Un log que repite lo mismo 24 veces no informa, tapa: así fue
 * imposible ver el watchdog de 180 s que sí importaba.
 *
 * Este módulo es el dueño de esos dos avisos. No decide nada — solo redacta la
 * línea y la pasa por `ecoLog`, que la imprime la primera vez y luego la cuenta
 * en silencio (reconfirma a los 60 s o cada 20 repeticiones). La CLAVE es el
 * HECHO: otro modelo, otro mínimo o otro tope/perfil imprimen al instante, porque
 * eso sí es una novedad.
 *
 * El monolito no puede crecer por acá: las dos redacciones vivían adentro de
 * `server.ts` y se las llevó este archivo, que además deja el texto en un solo
 * lugar probable (`tests/ecoLog.test.ts` mide el agregado).
 */
import { crearEco, eco } from "../../src/engine/ecoLog";

const ecoTurno = crearEco();

const publicar = (clave: string, linea: string, tinte: "log" | "warn"): void => {
  const e = eco(ecoTurno, clave, linea);
  if (!e.linea) return;
  if (tinte === "warn") console.warn(e.linea);
  else console.log(e.linea);
};

/**
 * El modelo no está en ninguna familia conocida: se le sirve el juego mínimo de
 * herramientas en vez de cero. Se dice una vez por (modelo, tamaño del mínimo).
 */
export function avisarCapacidadSinVerificar(modelName: string, minimo: number): void {
  const nombre = modelName || "(sin nombre)";
  publicar(
    `capacidad:${nombre}:${minimo}`,
    `[CerebroNico] 🧪 Capacidad SIN VERIFICAR para "${nombre}": no está en ninguna ` +
      `familia conocida. Se sirve el juego mínimo (${minimo} herramientas: hueso de obra + externas) ` +
      `en vez de cero. Si este modelo soporta function-calling, decláralo en TOOL_CAPABLE_ALLOWLIST o ` +
      `CLOUD_TOOL_FAMILIES (src/engine/modelTiers.ts) para darle el catálogo completo.` +
      (/^openrouter\//i.test(nombre)
        ? ` Los enrutadores de OpenRouter son incógnita por definición: si querés function-calling ahí, CN_RUTER_CON_HERRAMIENTAS=1 (bajo tu responsabilidad).`
        : ""),
    "warn",
  );
}

/**
 * Recorte de historial: tope + presupuesto del perfil. Se dice una vez por
 * (tope, tier). Con resumen el recorte CONDENSA, sin resumen conserva recientes.
 */
export function avisarRecorteDeHistorial(d: {
  crudos: number;
  finales: number;
  tope: number;
  presupuesto: number;
  tier: string;
  condensados?: number | null;
}): void {
  const condensa = typeof d.condensados === "number";
  publicar(
    `historial:${d.tope}:${d.tier}`,
    `[CerebroNico] Historial recortado: ${d.crudos} mensajes → ${d.finales} (tope ${d.tope} y ` +
      `presupuesto ${d.presupuesto} chars del perfil «${d.tier}»). ` +
      (condensa
        ? `Los ${d.condensados} más antiguos se CONDENSARON en un resumen (memoria de tareas largas), no se perdieron.`
        : `Se conservan los más recientes.`),
    "log",
  );
}
