/**
 * citaFuente.ts — NINGUNA CITA SIN RUTA (v1.86.0 · FASE 7, punto 3)
 * =================================================================
 * QUÉ ES: el instrumento que convierte «el motor dice que decidió X» en
 * «el motor señala el archivo y la línea donde vive la regla de X».
 *
 * POR QUÉ EXISTE COMO MÓDULO APARTE: la regla de la casa (V8 §3.2) prohíbe
 * afirmar sin evidencia, y el plano de FASE 7 pide que el modo «¿por qué
 * decidiste esto?» cite SIEMPRE artefacto real. Una cita escrita a mano en un
 * literal de código envejece el día en que alguien mueve una línea y entonces
 * la explicación miente con seguridad. Aquí la línea NO se escribe: se BUSCA
 * en el disco en el momento y, si no aparece, se devuelve `null` — que es lo
 * distinto a inventar.
 *
 * PUREZA: lee disco (es el servidor explicándose a sí mismo), pero no importa
 * el monolito ni escribe nada. Cachea por `raiz + archivo` y se invalida por
 * mtime, así que un `localizarLinea` dentro de un bucle no relea el árbol.
 *
 * REGLA DURABLE: todo lo que salga de aquí pasó por `verificarCita`. Si un
 * llamante quiere citar, cita con esto o no cita.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface Cita {
  /** Ruta relativa al raíz del proyecto (nunca absoluta: viaja en la traza). */
  archivo: string;
  /** Línea 1-based, medida en disco en este instante. */
  linea: number;
  /** El texto real de esa línea, recortado. */
  texto: string;
}

interface ArchivoEnCache { mtime: number; lineas: string[] }

const CACHE = new Map<string, ArchivoEnCache>();

/** Quita separadores raros y normaliza a `a/b/c.ts` (Windows incluido). */
function rutaRelativa(archivo: string): string {
  return String(archivo || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

/** ¿La ruta relativa sigue dentro del árbol? (guarda contra `../` y absolutas). */
export function rutaDentroDelArbol(raiz: string, archivo: string): boolean {
  const rel = rutaRelativa(archivo);
  if (!rel) return false;
  if (path.isAbsolute(rel)) return false;
  const absoluto = path.resolve(raiz, rel);
  const raizReal = path.resolve(raiz);
  return absoluto === raizReal || absoluto.startsWith(raizReal + path.sep);
}

/** Lee (o reutiliza) las líneas de un archivo del proyecto. `null` si no existe. */
function lineasDe(raiz: string, archivo: string): string[] | null {
  const rel = rutaRelativa(archivo);
  if (!rel || !rutaDentroDelArbol(raiz, rel)) return null;
  const absoluto = path.resolve(raiz, rel);
  try {
    const mtime = statSync(absoluto).mtimeMs;
    const cacheada = CACHE.get(absoluto);
    if (cacheada && cacheada.mtime === mtime) return cacheada.lineas;
    const lineas = readFileSync(absoluto, "utf8").split(/\r?\n/);
    CACHE.set(absoluto, { mtime, lineas });
    return lineas;
  } catch {
    return null;
  }
}

/**
 * Busca un patrón en un archivo del proyecto y devuelve la cita REAL.
 *
 * @param ocurrencia 1-based: qué coincidencia tomar (para señalar la segunda
 *                   vez que aparece un símbolo, por ejemplo).
 * @returns la cita, o `null` si el archivo no existe / el patrón no aparece.
 *          `null` es una respuesta honesta: el llamante debe declararla.
 */
export function localizarLinea(
  raiz: string,
  archivo: string,
  patron: RegExp | string,
  ocurrencia = 1,
): Cita | null {
  const lineas = lineasDe(raiz, archivo);
  if (!lineas) return null;
  const re = patron instanceof RegExp ? patron : new RegExp(patron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let vistas = 0;
  for (let i = 0; i < lineas.length; i++) {
    if (re.test(lineas[i])) {
      vistas++;
      if (vistas === Math.max(1, ocurrencia)) {
        return { archivo: rutaRelativa(archivo), linea: i + 1, texto: lineas[i].trim().slice(0, 200) };
      }
    }
  }
  return null;
}

/** Cita de una línea concreta (la que ya trae una traza). Verifica en disco. */
export function citarLinea(raiz: string, archivo: string, linea: number): Cita | null {
  const lineas = lineasDe(raiz, archivo);
  if (!lineas) return null;
  const n = Math.trunc(linea);
  if (n < 1 || n > lineas.length) return null;
  return { archivo: rutaRelativa(archivo), linea: n, texto: lineas[n - 1].trim().slice(0, 200) };
}

/**
 * La valla: ¿esta cita sigue siendo verdad en disco? La usa la suite de FASE 7
 * («ninguna cita sin ruta») y el propio endpoint antes de responder, para no
 * devolver jamás una ruta que ya no existe.
 */
export function verificarCita(raiz: string, cita: Partial<Cita> | null | undefined): boolean {
  if (!cita || typeof cita.linea !== "number" || !cita.archivo) return false;
  const leida = citarLinea(raiz, cita.archivo, cita.linea);
  return !!leida;
}

/** Cuántos archivos tiene abiertos el lector (para el censo de memoria/tests). */
export function cacheDeCitas(): { archivos: number } {
  return { archivos: CACHE.size };
}

/** Vacía la cache (solo para tests y para el `--reset` del ritual). */
export function _resetCacheCitas(): void {
  CACHE.clear();
}

/** ¿Existe el archivo? (sin leerlo entero si ya está en cache). */
export function archivoExiste(raiz: string, archivo: string): boolean {
  const rel = rutaRelativa(archivo);
  if (!rutaDentroDelArbol(raiz, rel)) return false;
  return existsSync(path.resolve(raiz, rel));
}
