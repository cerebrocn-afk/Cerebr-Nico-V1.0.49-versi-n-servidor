/**
 * rotacionTrazas.ts — v1.87.0 · LO QUE CRECE SIN TECHO ACABA LEYÉNDOSE ENTERO
 * ==========================================================================
 * QUÉ PROBLEMA RESUELVE (medido, no supuesto): `cicloDecision.persistir` hace
 * `appendFileSync` sobre `decisiones.jsonl` y `cargarTrazas` lee el archivo
 * COMPLETO con `readFileSync` para quedarse con las últimas 200. Cada decisión
 * añade una línea (~600-900 bytes). Tras unos miles de turnos eso son varios
 * megabytes releídos al arrancar y en cada consulta al panel, y el archivo no
 * tiene ninguna política de poda: crece hasta que el disco o el arranque digan
 * basta. Los logs del puente y del sandbox (`createWriteStream` con truncado
 * al abrir) tienen el problema espejo: se pierde todo al reiniciar.
 *
 * QUÉ HACE: una política con tres límites y una generación con nombre sellado.
 *   · tamaño  — al llegar a 8 MiB se rota (no se borra: se renombra).
 *   · cantidad — se conservan las 4 generaciones más recientes.
 *   · edad     — nada mayor de 30 días sobrevive.
 *
 * POR QUÉ ASÍ Y NO COMO OmniRoute: aquel rota un archivo de log y purga por
 * `mtime` con relojes implícitos (`Date.now()` dentro). Acá el reloj entra por
 * parámetro: `aPurgar` es una función pura del estado del directorio y del
 * instante, así que la suite puede congelar «hoy» y comprobar exactamente qué
 * se borra. La parte de disco (`aplicarRotacion`) es best-effort y declara el
 * fallo en vez de tragárselo.
 */

import { existsSync, readdirSync, renameSync, statSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface PoliticaRotacion {
  /** Bytes a partir de los cuales el archivo activo se rota. */
  maxBytes: number;
  /** Generaciones rotadas que se conservan (las más recientes). */
  generaciones: number;
  /** Días de vida de una generación, cuente lo que cuente `generaciones`. */
  retencionDias: number;
}

/** 8 MiB, 4 generaciones, 30 días: ≈ 40 MiB de techo para un archivo que crece por turno. */
export const POLITICA_TRAZAS: PoliticaRotacion = {
  maxBytes: 8 * 1024 * 1024,
  generaciones: 4,
  retencionDias: 30,
};

export interface ArchivoGeneracion {
  nombre: string;
  mtimeMs: number;
}

/** Sello `YYYYMMDD-HHmmss` en UTC: dos máquinas con husos distintos nombran igual. */
export function selloDe(ahora: number): string {
  const iso = new Date(ahora).toISOString(); // 2026-10-29T03:15:07.123Z
  const fecha = iso.slice(0, 10).replace(/-/g, "");
  const hora = iso.slice(11, 19).replace(/:/g, "");
  return `${fecha}-${hora}`;
}

/** `decisiones.jsonl` + sello → `decisiones.20261029-031507.jsonl` (la extensión se conserva al final). */
export function nombreGeneracion(base: string, ahora: number): string {
  const sello = selloDe(ahora);
  const punto = base.lastIndexOf(".");
  if (punto <= 0) return `${base}.${sello}`;
  const raiz = base.slice(0, punto);
  const ext = base.slice(punto);
  return `${raiz}.${sello}${ext}`;
}

/** ¿El archivo activo ya pasó el techo? `>=` y no `>`: 8 MiB exactos ya son un problema. */
export function debeRotar(bytes: number, politica: PoliticaRotacion = POLITICA_TRAZAS): boolean {
  if (!Number.isFinite(bytes) || bytes < 0) return false;
  return bytes >= politica.maxBytes;
}

/**
 * ¿Este nombre es una generación de `base`? Se exige el prefijo Y la extensión:
 * `decisiones-otra-cosa.jsonl` no es una generación de `decisiones.jsonl`.
 */
export function esGeneracionDe(nombre: string, base: string): boolean {
  if (nombre === base) return false;
  const punto = base.lastIndexOf(".");
  const raiz = punto > 0 ? base.slice(0, punto) : base;
  const ext = punto > 0 ? base.slice(punto) : "";
  if (!nombre.startsWith(`${raiz}.`)) return false;
  if (ext && !nombre.endsWith(ext)) return false;
  return true;
}

/**
 * Qué generaciones hay que borrar. Puro: misma lista + mismo `ahora` = mismo
 * resultado. Regla doble y explícita: fuera las que sobran por cantidad y fuera
 * las que pasaron la edad, aunque quepan en el cupo.
 */
export function aPurgar(
  archivos: ArchivoGeneracion[],
  politica: PoliticaRotacion,
  ahora: number,
  base: string
): string[] {
  const generaciones = archivos
    .filter((a) => esGeneracionDe(a.nombre, base))
    .slice()
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.nombre.localeCompare(b.nombre)); // más nueva primero, empate por nombre

  const corte = ahora - politica.retencionDias * 86_400_000;
  const fuera: string[] = [];
  generaciones.forEach((a, i) => {
    const porCantidad = i >= politica.generaciones;
    const porEdad = a.mtimeMs < corte;
    if (porCantidad || porEdad) fuera.push(a.nombre);
  });
  return fuera.sort();
}

export interface ResultadoRotacion {
  rotado: boolean;
  generacion?: string;
  purgados: string[];
  aviso?: string;
}

/**
 * Aplica la política sobre un archivo real. Best-effort: si el sistema de
 * archivos no deja, se devuelve el motivo — la traza no puede tumbar un turno.
 */
export function aplicarRotacion(
  directorio: string,
  base: string,
  politica: PoliticaRotacion = POLITICA_TRAZAS,
  ahora: number = Date.now()
): ResultadoRotacion {
  const activo = path.join(directorio, base);
  try {
    if (!existsSync(directorio)) mkdirSync(directorio, { recursive: true });
    if (!existsSync(activo)) return { rotado: false, purgados: [] };
    const bytes = statSync(activo).size;
    if (!debeRotar(bytes, politica)) return { rotado: false, purgados: [] };

    let generacion = nombreGeneracion(base, ahora);
    let destino = path.join(directorio, generacion);
    // Dos rotaciones en el mismo segundo no pueden pisarse: la segunda se numera.
    let sufijo = 2;
    while (existsSync(destino)) {
      generacion = nombreGeneracion(base, ahora).replace(/(\.[^.]+)$/, `-${sufijo}$1`);
      destino = path.join(directorio, generacion);
      sufijo += 1;
      if (sufijo > 50) break;
    }
    renameSync(activo, destino);

    const lista: ArchivoGeneracion[] = readdirSync(directorio).map((nombre) => {
      try {
        return { nombre, mtimeMs: statSync(path.join(directorio, nombre)).mtimeMs };
      } catch {
        return { nombre, mtimeMs: 0 };
      }
    });
    const purgados: string[] = [];
    for (const nombre of aPurgar(lista, politica, ahora, base)) {
      try {
        unlinkSync(path.join(directorio, nombre));
        purgados.push(nombre);
      } catch {
        /* si no se puede borrar, se declara abajo */
      }
    }
    const pedidos = aPurgar(lista, politica, ahora, base).length;
    return {
      rotado: true,
      generacion,
      purgados,
      aviso: pedidos !== purgados.length ? `no se pudieron borrar ${pedidos - purgados.length} generación(es)` : undefined,
    };
  } catch (e: any) {
    return { rotado: false, purgados: [], aviso: `rotación no aplicada: ${e?.message ?? "error de disco"}` };
  }
}

/**
 * La llamada que hace el escritor de trazas, en una línea: si el archivo pasó
 * el techo, rota y lo cuenta. Devuelve `null` cuando no había nada que hacer
 * (el caso normal, y por eso no debe costar nada leerlo).
 */
export function podarSiHaceFalta(
  directorio: string,
  base: string,
  politica: PoliticaRotacion = POLITICA_TRAZAS,
  ahora: number = Date.now()
): ResultadoRotacion | null {
  const activo = path.join(directorio, base);
  try {
    if (!existsSync(activo)) return null;
    if (!debeRotar(statSync(activo).size, politica)) return null;
  } catch {
    return null;
  }
  return aplicarRotacion(directorio, base, politica, ahora);
}
