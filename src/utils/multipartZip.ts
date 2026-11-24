/**
 * multipartZip.ts — Detección y reensamblaje en memoria de archivos ZIP divididos (multivolumen)
 * ===============================================================================================
 * Módulo 100 % PURO (cero imports de fs, path, child_process o node:*).
 * Reconoce los esquemas habituales de división en partes subidos al chat o al explorador:
 *   1. `<nombre>-parte01-de-04.bin` / `<nombre>_part01_of_04.bin` / `-parte1-de-4.zip`
 *   2. `<nombre>.zip.001` .. `<nombre>.zip.00N` (2+ dígitos)
 *   3. `<nombre>.part01.bin` / `<nombre>.part1.zip` / `<nombre>.part01.dat`
 *   4. `<nombre>.001` .. `<nombre>.00N` (3+ dígitos)
 */

export type PatronMultivolumen = "parte-de" | "zip-00n" | "part-n" | "ext-00n";

export interface ParteMultivolumen<T extends { name: string } = { name: string }> {
  archivo: T;
  claveGrupo: string;
  nombreBaseZip: string;
  indice: number;
  totalDeclarado: number | null;
  patron: PatronMultivolumen;
}

export interface GrupoMultivolumenCompleto<T extends { name: string } = { name: string }> {
  claveGrupo: string;
  nombreBaseZip: string;
  partes: ParteMultivolumen<T>[];
  totalPartes: number;
}

export interface GrupoMultivolumenIncompleto<T extends { name: string } = { name: string }> {
  claveGrupo: string;
  nombreBaseZip: string;
  partes: ParteMultivolumen<T>[];
  faltantes: number[];
  duplicados: number[];
  motivo: string;
}

export interface ResultadoAgrupacionMultivolumen<T extends { name: string } = { name: string }> {
  completos: GrupoMultivolumenCompleto<T>[];
  incompletos: GrupoMultivolumenIncompleto<T>[];
  sueltos: T[];
}

export interface ResultadoEnsamblajeZip {
  bytes: Uint8Array;
  totalBytes: number;
  esZip: boolean;
  nombreSalida: string;
}

function normalizarNombreZip(base: string): string {
  const limpio = base.trim().replace(/[\\/]+$/, "");
  if (!limpio) return "archivo-ensamblado.zip";
  return /\.zip$/i.test(limpio) ? limpio : `${limpio}.zip`;
}

/**
 * Extrae metadatos de parte multivolumen desde un nombre de archivo,
 * o devuelve `null` si es un archivo normal.
 */
export function analizarNombreMultivolumen<T extends { name: string }>(
  archivo: T
): ParteMultivolumen<T> | null {
  const nombreOriginal = String(archivo?.name || "").trim();
  if (!nombreOriginal) return null;

  // 1. `<base>-parte01-de-04.bin` / `<base>_part01_of_04.bin` / `-parte1-de-4.zip`
  const mParteDe = nombreOriginal.match(
    /^(.+?)[._-]part(?:e)?(\d+)[._-]?(?:de|of)[._-]?(\d+)\.(bin|zip|part|dat)$/i
  );
  if (mParteDe) {
    const base = mParteDe[1];
    const indice = Number.parseInt(mParteDe[2], 10);
    const total = Number.parseInt(mParteDe[3], 10);
    if (Number.isFinite(indice) && indice >= 1 && Number.isFinite(total) && total >= 2 && indice <= total) {
      return {
        archivo,
        claveGrupo: `parte-de:${base.toLowerCase()}:${total}`,
        nombreBaseZip: normalizarNombreZip(base),
        indice,
        totalDeclarado: total,
        patron: "parte-de",
      };
    }
  }

  // 2. `<base>.zip.001` .. `<base>.zip.099`
  const mZipNum = nombreOriginal.match(/^(.+?\.zip)\.(\d{2,4})$/i);
  if (mZipNum) {
    const base = mZipNum[1];
    const indice = Number.parseInt(mZipNum[2], 10);
    if (Number.isFinite(indice) && indice >= 1) {
      return {
        archivo,
        claveGrupo: `zip-00n:${base.toLowerCase()}`,
        nombreBaseZip: normalizarNombreZip(base),
        indice,
        totalDeclarado: null,
        patron: "zip-00n",
      };
    }
  }

  // 3. `<base>.part01.bin` / `<base>.part1.zip` / `<base>_part02.dat`
  const mPartN = nombreOriginal.match(/^(.+?)[._-]part(\d+)\.(bin|zip|dat|rar|7z)$/i);
  if (mPartN) {
    const base = mPartN[1];
    const indice = Number.parseInt(mPartN[2], 10);
    if (Number.isFinite(indice) && indice >= 1) {
      return {
        archivo,
        claveGrupo: `part-n:${base.toLowerCase()}`,
        nombreBaseZip: normalizarNombreZip(base),
        indice,
        totalDeclarado: null,
        patron: "part-n",
      };
    }
  }

  // 4. Genérico `<base>.001` .. `<base>.099` (3+ dígitos para evitar falsos positivos con versiones)
  const mExtNum = nombreOriginal.match(/^(.+?)\.(\d{3,4})$/i);
  if (mExtNum) {
    const base = mExtNum[1];
    const indice = Number.parseInt(mExtNum[2], 10);
    if (Number.isFinite(indice) && indice >= 1) {
      return {
        archivo,
        claveGrupo: `ext-00n:${base.toLowerCase()}`,
        nombreBaseZip: normalizarNombreZip(base),
        indice,
        totalDeclarado: null,
        patron: "ext-00n",
      };
    }
  }

  return null;
}

/** Devuelve `true` si el nombre corresponde a un fragmento multivolumen conocido. */
export function esNombreParteMultivolumen(nombre: string): boolean {
  return analizarNombreMultivolumen({ name: nombre }) !== null;
}

/**
 * Agrupa una tanda de archivos entrantes en:
 * - `completos`: secuencias multivolumen continuas listas para concatenar
 * - `incompletos`: secuencias con partes faltantes o duplicadas
 * - `sueltos`: archivos normales que no son fragmentos divididos
 */
export function agruparPartesMultivolumen<T extends { name: string }>(
  archivos: T[]
): ResultadoAgrupacionMultivolumen<T> {
  const grupos = new Map<string, ParteMultivolumen<T>[]>();
  const sueltos: T[] = [];

  for (const archivo of archivos) {
    const meta = analizarNombreMultivolumen(archivo);
    if (!meta) {
      sueltos.push(archivo);
      continue;
    }
    const lista = grupos.get(meta.claveGrupo) ?? [];
    lista.push(meta);
    grupos.set(meta.claveGrupo, lista);
  }

  const completos: GrupoMultivolumenCompleto<T>[] = [];
  const incompletos: GrupoMultivolumenIncompleto<T>[] = [];

  for (const [claveGrupo, listaCruda] of grupos.entries()) {
    const ordenadas = [...listaCruda].sort((a, b) => a.indice - b.indice);
    const nombreBaseZip = ordenadas[0].nombreBaseZip;

    const vistos = new Set<number>();
    const duplicados: number[] = [];
    const unicas: ParteMultivolumen<T>[] = [];
    for (const p of ordenadas) {
      if (vistos.has(p.indice)) {
        if (!duplicados.includes(p.indice)) duplicados.push(p.indice);
      } else {
        vistos.add(p.indice);
        unicas.push(p);
      }
    }

    const totalDeclarado = unicas.find((p) => p.totalDeclarado !== null)?.totalDeclarado ?? null;
    const maxIndice = unicas.reduce((acc, p) => Math.max(acc, p.indice), 0);
    const limiteEsperado = totalDeclarado ?? Math.max(maxIndice, 2);

    const faltantes: number[] = [];
    for (let i = 1; i <= limiteEsperado; i++) {
      if (!vistos.has(i)) faltantes.push(i);
    }

    if (duplicados.length > 0 || faltantes.length > 0 || unicas.length < 2) {
      const partesMotivo: string[] = [];
      if (faltantes.length > 0) {
        const listaFaltantes = faltantes.map((n) => `#${n}`).join(", ");
        partesMotivo.push(
          unicas.length === 1 && totalDeclarado === null
            ? `Solo llegó el fragmento #${unicas[0].indice}; faltan los demás volúmenes a partir de #2.`
            : `Faltan las partes ${listaFaltantes}`
        );
      }
      if (duplicados.length > 0) {
        partesMotivo.push(`Hay partes repetidas (${duplicados.map((n) => `#${n}`).join(", ")})`);
      }
      incompletos.push({
        claveGrupo,
        nombreBaseZip,
        partes: unicas,
        faltantes,
        duplicados,
        motivo: partesMotivo.join(". ") + ".",
      });
    } else {
      completos.push({
        claveGrupo,
        nombreBaseZip,
        partes: unicas,
        totalPartes: unicas.length,
      });
    }
  }

  return { completos, incompletos, sueltos };
}

/** Verifica si el buffer ensamblado comienza con firma mágica ZIP (`PK\x03\x04` o `PK\x05\x06`). */
export function tieneFirmaZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const sigLo = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const sigEmpty = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x05 && bytes[3] === 0x06;
  return sigLo || sigEmpty;
}

/** Concatena en orden las partes de un archivo dividido y devuelve el binario final. */
export function ensamblarBinarioMultivolumen(
  partes: Array<{ name: string; bytes: Uint8Array }>
): ResultadoEnsamblajeZip {
  const ordenadas = [...partes]
    .map((p, pos) => ({
      ...p,
      indice: analizarNombreMultivolumen({ name: p.name })?.indice ?? pos + 1,
      meta: analizarNombreMultivolumen({ name: p.name }),
    }))
    .sort((a, b) => a.indice - b.indice);

  const totalBytes = ordenadas.reduce((acc, p) => acc + p.bytes.byteLength, 0);
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const p of ordenadas) {
    bytes.set(p.bytes, offset);
    offset += p.bytes.byteLength;
  }

  const nombreSalida = ordenadas[0]?.meta?.nombreBaseZip ?? normalizarNombreZip(ordenadas[0]?.name || "archivo");
  return {
    bytes,
    totalBytes,
    esZip: tieneFirmaZip(bytes),
    nombreSalida,
  };
}
