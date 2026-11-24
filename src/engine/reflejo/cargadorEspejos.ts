/**
 * cargadorEspejos.ts — CARGADOR DE ESPEJOS PERSONALIZADOS (Reflejo v3.0 · Paso 2)
 * ========================================================================
 * En el arranque, lee `~/.cerebronico/espejos/manifest.json` y carga cada
 * `.mjs` con `import()` dinámico. Cada espejo es una función determinista pura
 * con la MISMA firma que el consejo: `ejecutar(datos) → {ok, salida?, motivo?, ms}`.
 *
 * Reglas de hierro (heredadas del manual):
 *   1. Determinista: misma entrada → misma salida. No `Math.random()`, no `fetch()`.
 *   2. Sin red: un espejo nunca hace HTTP.
 *   3. Sin estado global: cada `ejecutar` es un universo cerrado.
 *   4. Motivo siempre: cuando ok===false, motivo es obligatorio.
 *   5. Salida es JSON: `salida` pasa por `JSON.stringify`.
 *
 * Si un espejo falla al cargar (sintaxis, función `ejecutar` ausente, etc.), se
 * loguea y se SIGUE con los demás. Nunca rompe el arranque del motor.
 *
 * 🐞 DEFECTO (build de Windows, v1.1.0): `consejo.ts` —que viaja al bundle del
 * navegador— importaba `buscarEnPool`/`poolListo` de ESTE módulo, y este módulo
 * toca `node:fs`: vite externalizaba y rollup reventaba el `npm run build`
 * completo ("existsSync is not exported by __vite-browser-external"). La cura
 * es la regla que consejo.ts ya respeta con `node:os`: el ESTADO del pool vive
 * en `pool.ts` (puro, navega a todos lados) y aquí solo queda el CARGADOR
 * (servidor). Los re-exports de abajo mantienen intacta la firma pública.
 */
import type { Entidad, ResultadoEntidad } from "./consejo";
import { statSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { type EspejoPersonalizado, setPool } from "./pool";
import { pasarAduanaForja } from "../aduanaForja";

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type { EspejoPersonalizado } from "./pool";

export interface ResultadoCarga {
  ok: boolean;
  cargados: EspejoPersonalizado[];
  /** Espejos que fallaron al cargar (con motivo). */
  fallidos: Array<{ id: string; ruta: string; motivo: string }>;
  /**
   * v1.85.0 · FASE 6.4 — espejos que PASARON la aduana pero traen ruido
   * declarado (Math.random, la hora, async). No bloquean: se nombran.
   */
  avisos?: Array<{ id: string; ruta: string; avisos: string[] }>;
  ms: number;
}

// ─── MANIFEST ──────────────────────────────────────────────────────────────

interface EntradaManifest {
  id: string;
  ruta: string;
  familia: string;
  descripcion: string;
  activado?: boolean;
  autor?: string;
  version?: string;
}

interface Manifest {
  version: string;
  espejos: EntradaManifest[];
}

// ─── CARGADOR ──────────────────────────────────────────────────────────────

/**
 * Carga los espejos personalizados desde un directorio. Lee `manifest.json`
 * y carga cada `.mjs` con `import()` dinámico.
 *
 * @param directorio Ruta absoluta al directorio de espejos (sin trailing slash).
 *                   Ejemplo: `/home/usuario/.cerebronico/espejos`.
 *
 * Determinista: si el directorio no existe o el manifest está vacío, devuelve
 * `{ ok: true, cargados: [], fallidos: [] }`. Nunca lanza.
 */
export async function cargarEspejosPersonalizados(directorio: string): Promise<ResultadoCarga> {
  const t0 = Date.now();
  const cargados: EspejoPersonalizado[] = [];
  const fallidos: Array<{ id: string; ruta: string; motivo: string }> = [];
  const avisos: Array<{ id: string; ruta: string; avisos: string[] }> = [];

  if (!directorio || !existsSync(directorio)) {
    return { ok: true, cargados, fallidos, avisos, ms: Date.now() - t0 };
  }

  const manifestPath = join(directorio, "manifest.json");
  if (!existsSync(manifestPath)) {
    return { ok: true, cargados, fallidos, avisos, ms: Date.now() - t0 };
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e: any) {
    return {
      ok: false,
      cargados,
      fallidos: [{ id: "(manifest)", ruta: manifestPath, motivo: `manifest.json inválido: ${e?.message || e}` }],
      avisos,
      ms: Date.now() - t0,
    };
  }

  if (!Array.isArray(manifest.espejos)) {
    return {
      ok: false,
      cargados,
      fallidos: [{ id: "(manifest)", ruta: manifestPath, motivo: "manifest.espejos debe ser un array" }],
      avisos,
      ms: Date.now() - t0,
    };
  }

  for (const entrada of manifest.espejos) {
    // Validación mínima de la entrada
    if (!entrada.id || !entrada.ruta || !entrada.familia || !entrada.descripcion) {
      fallidos.push({
        id: entrada.id || "(sin id)",
        ruta: entrada.ruta || "(sin ruta)",
        motivo: "entrada del manifest incompleta (necesita id, ruta, familia, descripcion)",
      });
      continue;
    }
    if (entrada.activado === false) {
      // Salteamos sin loguear (es decisión del usuario).
      continue;
    }
    // El id debe empezar con "espejo."
    if (!/^espejo\./.test(entrada.id)) {
      fallidos.push({
        id: entrada.id,
        ruta: entrada.ruta,
        motivo: `id «${entrada.id}» debe empezar con "espejo." (regla del manual)`,
      });
      continue;
    }

    const rutaAbs = resolve(directorio, entrada.ruta);
    if (!existsSync(rutaAbs)) {
      fallidos.push({
        id: entrada.id,
        ruta: rutaAbs,
        motivo: `el archivo no existe (manifest.ruta = "${entrada.ruta}")`,
      });
      continue;
    }

    let codigoFuente = "";
    try {
      codigoFuente = readFileSync(rutaAbs, "utf8");
    } catch (e: any) {
      fallidos.push({ id: entrada.id, ruta: rutaAbs, motivo: `no se pudo leer el .mjs: ${e?.message || e}` });
      continue;
    }

    // ★ v1.85.0 · FASE 6.4 — LA ADUANA ANTES DE EJECUTAR.
    // El orden importa y es la lección de esta fase: auditar después del
    // `import()` es auditar un espejo que YA corrió dentro del motor. Primero se
    // lee el código y pasa por `aduanaForja` (nombre único contra las 51 curadas,
    // proveedor/modelo reales, nada de red/disco/procesos/eval). Si no pasa, el
    // `.mjs` ni se importa: queda en `fallidos` con el motivo textual.
    const aduana = pasarAduanaForja(
      {
        id: entrada.id,
        nombre: (entrada as any).nombre,
        familia: entrada.familia,
        descripcion: entrada.descripcion,
        ruta: entrada.ruta,
        proveedor: (entrada as any).proveedor,
        modelo: (entrada as any).modelo,
        autor: entrada.autor,
        version: entrada.version,
      },
      codigoFuente,
      { existentes: cargados.map((c) => c.id) },
    );
    if (!aduana.ok) {
      fallidos.push({ id: entrada.id, ruta: rutaAbs, motivo: `aduana de forja: ${aduana.rechazos.join(" · ")}` });
      continue;
    }
    if (aduana.avisos.length) {
      avisos.push({ id: entrada.id, ruta: rutaAbs, avisos: aduana.avisos });
      console.warn(`[espejos] ${entrada.id} pasó la aduana con avisos: ${aduana.avisos.join(" · ")}`);
    }

    try {
      // import() dinámico — ESM. Si el .mjs exporta `ejecutar` y `meta`, los usa.
      // A veces Node cachea por ruta; añadimos un query string anti-cache para
      // que reinstalaciones se reflejen sin tener que reiniciar el proceso.
      const modulo: any = await import(`file://${rutaAbs}?t=${Date.now()}`);
      if (typeof modulo.ejecutar !== "function") {
        fallidos.push({
          id: entrada.id,
          ruta: rutaAbs,
          motivo: "el módulo no exporta `ejecutar(datos)` como función",
        });
        continue;
      }
      cargados.push({
        id: entrada.id,
        nombre: modulo.meta?.nombre || entrada.id,
        familia: entrada.familia,
        descripcion: entrada.descripcion,
        ruta: rutaAbs,
        version: entrada.version || modulo.meta?.version || "0.0.0",
        autor: entrada.autor || modulo.meta?.autor,
        ejecutar: modulo.ejecutar,
        meta: modulo.meta,
      });
    } catch (e: any) {
      fallidos.push({
        id: entrada.id,
        ruta: rutaAbs,
        motivo: `import() falló: ${e?.message || e}`,
      });
    }
  }

  return { ok: fallidos.length === 0, cargados, fallidos, avisos, ms: Date.now() - t0 };
}

// ─── POOL EN MEMORIA → ahora vive en pool.ts (puro, navegable al bundle) ──
//
// El cargador es `async` (por el `import()` dinámico) pero el consejo.ts es
// síncrono. Para no romper la firma de `ejecutarEntidad`, el pool se llena en
// el arranque (antes de que server.ts escuche) y el ESTADO vive en "./pool",
// que no toca disco: el frontend importa de ahí, nunca de este archivo.

/**
 * Llena el pool con los espejos cargados. Se llama UNA vez en el arranque
 * del servidor, después de leer el manifest. Es seguro llamarlo varias
 * veces: reemplaza el pool.
 */
export async function inicializarPool(directorio: string): Promise<ResultadoCarga> {
  const r = await cargarEspejosPersonalizados(directorio);
  setPool(r.cargados, true, r.fallidos);
  return r;
}

// Re-exports: la firma pública del módulo NO cambia (server.ts y cualquier
// importador existente siguen funcionando sin tocar una línea).
export {
  poolEspejos,
  poolListo,
  poolFallas,
  buscarEnPool,
  agregarAlPool,
  quitarDelPool,
  catalogoPersonalizados,
} from "./pool";
