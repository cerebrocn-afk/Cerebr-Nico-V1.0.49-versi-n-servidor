/**
 * manualPerfeccionDisco.ts — LA CARA A DISCO DEL MANUAL DE LA PERFECCIÓN (v1.79.0)
 * ===============================================================================
 * El estado puro vive en `manualPerfeccion.ts` (testeable, sin IO). Este módulo
 * hace lo que el órgano `.con-ciencia` ya hace con su `indice.json` +
 * `CEREBRO.md`: guardar y cargar la cara máquina, y renderizar la cara humana
 * (`perfeccion.md`) en la raíz del proyecto, con escritura atómica
 * (tmp + rename): el manual nunca queda a medias si el servidor muere.
 *
 * SOLO SERVER (importa `fs`/`path`/`node:crypto`, como `cerebroOrgano.ts`).
 */
import fs from "fs";
import path from "path";
import nodeCrypto from "node:crypto";
import {
  type ManualPerfeccion,
  cargarManual,
  nuevoManual,
  renderPerfeccionMd,
} from "./manualPerfeccion";

export const NOMBRE_JSON = "perfeccion.json";
export const NOMBRE_MD = "perfeccion.md";

function rutaJson(raiz: string): string {
  return path.join(raiz, NOMBRE_JSON);
}
function rutaMd(raiz: string): string {
  return path.join(raiz, NOMBRE_MD);
}

/** Escribe un archivo de forma atómica (tmp + rename): nunca a medias. */
function escribirAtomico(destino: string, contenido: string): void {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = `${destino}.tmp-${nodeCrypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmp, contenido, "utf-8");
  fs.renameSync(tmp, destino);
}

/** Carga el manual desde la raíz (tolerante: json podrido → manual vacío). */
export function cargarDesdeDisco(raiz: string): ManualPerfeccion {
  try {
    const bruto = fs.readFileSync(rutaJson(raiz), "utf-8");
    return cargarManual(bruto);
  } catch {
    return nuevoManual();
  }
}

/**
 * Guarda el manual: JSON (cara máquina) + perfeccion.md (cara humana).
 * El md se re-renderiza SIEMPRE desde el estado, para que ambos archivos no
 * puedan discrepar (mismo patrón que `guardarIndice` del órgano).
 */
export function guardarManual(raiz: string, manual: ManualPerfeccion, versionApp?: string): void {
  escribirAtomico(rutaJson(raiz), JSON.stringify(manual, null, 2) + "\n");
  try {
    escribirAtomico(rutaMd(raiz), renderPerfeccionMd(manual, versionApp));
  } catch {
    /* la cara humana es un extra: nunca debe tumbar el guardado del estado */
  }
}
