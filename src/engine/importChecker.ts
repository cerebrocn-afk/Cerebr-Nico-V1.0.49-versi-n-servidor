/**
 * importChecker.ts — VERIFICADOR DE IMPORTS DEL MOTOR (v2.1)
 * =========================================================
 * El error que resolvió este módulo, tal cual salió en pantalla:
 *
 *   [plugin:vite:import-analysis] Failed to resolve import
 *   "../utils/imageCompressor" from "src/components/PhotoModal.tsx". Does the file exist?
 *
 * Un modelo escribió PhotoModal.tsx importando utilidades que NUNCA creó. El
 * servidor de desarrollo levanta (el log del sandbox dice "Dependencias
 * instaladas correctamente"), el navegador pide el módulo, no existe → pantalla
 * en blanco o cartel rojo. Y el usuario no sabe si el problema es el sandbox, el
 * motor o su proyecto. **El sandbox no falla: falta un archivo del proyecto.**
 *
 * Lo que hace el motor, sin modelo y de forma determinista:
 *   1. Lee los imports RELATIVOS de cada archivo.
 *   2. Comprueba si el archivo destino existe (extensiones e index).
 *   3. Informa con precisión: "PhotoModal.tsx importa ../utils/imageCompressor y no existe".
 *   4. Crea un STUB para que el proyecto compile, en dos variantes:
 *      · COMPONENTE (PascalCase) → componente React mínimo y válido.
 *      · MÓDULO (camelCase, utilidades) → exporta EXACTAMENTE los nombres que el
 *        archivo importa, con un no-op seguro, para que la aplicación arranque
 *        aunque la utilidad todavía no exista.
 *
 * Por qué el stub y no dejar el error: con el error, el previsualizador queda en
 * blanco y no se puede seguir trabajando. Con el stub, la app arranca, se ve la
 * estructura y el modelo puede escribir el archivo real después. El stub se
 * anuncia siempre en el log para que nadie crea que esa utilidad ya está hecha.
 */

export interface CheckFile {
  path: string;
  content: string;
}

export interface MissingImport {
  /** Archivo que importa */
  from: string;
  /** Lo que importa, tal cual: "../utils/imageCompressor" */
  specifier: string;
  /** Qué se esperaba encontrar: ["src/utils/imageCompressor.tsx", ...] */
  expected: string[];
  /** ¿Es un componente React (PascalCase)? */
  stubable: boolean;
  /** Nombres importados de ese módulo: ["compressImageFile", "CLINICAL_AVATAR_PRESETS"] */
  nombresEsperados: string[];
}

/** Extensiones y variantes que resuelve un bundler (Vite) para un import relativo. */
const EXTENSIONES = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json", ".css", ".scss"];
const RUTAS_INDEX = ["/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

/** Normaliza una ruta: separadores unix, sin "./" inicial ni dobles barras. */
function normalizar(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/").replace(/\/$/, "");
}

/** v1.31.0 — la normalización se exporta para que el GRAFO use la MISMA verdad. */
export function normalizarRutaImport(p: string): string {
  return normalizar(p);
}

/**
 * v1.31.0 — ¿DÓNDE cae un import relativo dentro del set de archivos reales?
 * EXTENSIONES y RUTAS_INDEX son las de este módulo (fuente única: si el
 * verificador y el grafo resolvieran distinto, el grafo mentiría sobre lo que
 * el bundler hace). Devuelve la ruta normalizada del destino o null.
 */
export function resolverRutaImport(base: string, spec: string, existentes: Set<string>): string | null {
  const r = resolverRelativo(base, spec);
  const candidatos = [r, ...EXTENSIONES.map((e) => r + e), ...RUTAS_INDEX.map((i) => r + i)];
  for (const c of candidatos) {
    const n = normalizar(c);
    if (existentes.has(n)) return n;
  }
  return null;
}

/** Une una ruta base con un especificador relativo, resolviendo "../" y "./". */
function resolverRelativo(base: string, spec: string): string {
  const partesBase = normalizar(base).split("/");
  partesBase.pop(); // quitar el nombre del archivo
  const partes = spec.replace(/\\/g, "/").split("/");
  for (const parte of partes) {
    if (parte === "" || parte === ".") continue;
    if (parte === "..") partesBase.pop();
    else partesBase.push(parte);
  }
  return partesBase.join("/");
}

/**
 * v1.84.1 — PATRONES SUBIDOS A CONSTANTE DE MÓDULO. Antes se creaban los cinco
 * regex (y la lista de prefijos) en CADA llamada — una tanda por archivo, ~700
 * tandas por retrato del repo. Cada bucle `exec` corre hasta `null`, que deja el
 * `lastIndex` en cero por sí solo; el `re.lastIndex = 0` explícito es el cinto
 * para que ningún uso futuro con interrupción deje el cursor a medias (misma
 * disciplina documentada de `PATRONES_IMPORT` en dependenciasProyecto).
 */
const PATRONES_IMPORT_RELATIVO: RegExp[] = [
  /\bimport\s+[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bexport\s+[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

// ============================================================
// v2.1 — 🐞 LAS RUTAS ABSOLUTAS DEL SISTEMA NO SON IMPORTS DEL PROYECTO
// ------------------------------------------------------------
// Antes bastaba con que empezara por "/" para tratarlo como import del
// proyecto. Un archivo de pruebas del paquete llevaba rutas absolutas de
// otra máquina (`/home/…/src/engine/knowledgeBase`) y el verificador las
// daba por faltantes en CADA sincronización: avisos que no se podían
// resolver nunca porque apuntan a un disco que no existe.
// Vite sí admite rutas desde la raíz del proyecto ("/src/algo"), así que
// esas se conservan; lo que se descarta es lo que apunta a directorios
// propios del sistema operativo.
// ============================================================
const PREFIJOS_SISTEMA = ["/home/", "/Users/", "/var/", "/tmp/", "/opt/", "/mnt/", "/usr/", "/root/", "/Volumes/"];

/**
 * v1.51.1 - LOS MODULOS NATIVOS DE NODE NO SON IMPORTS DEL PROYECTO
 * Un .cjs nuevo que hacia require("node:fs") quedaba marcado como import roto
 * porque node:fs no esta en el inventario del proyecto, y nunca podria estarlo:
 * no es un archivo del proyecto, es el runtime. La puerta imports bloqueaba y el
 * Quirofano revertia la tanda entera, incluidos los .md que no tenian que ver.
 */
const MODULOS_NATIVOS = new Set([
  "fs", "path", "url", "os", "crypto", "http", "https", "http2", "child_process",
  "util", "events", "stream", "zlib", "net", "tls", "dns", "assert", "buffer",
  "querystring", "readline", "worker_threads", "perf_hooks", "timers", "vm",
  "module", "process", "v8", "cluster", "dgram", "repl", "string_decoder",
  "sys", "tty", "async_hooks", "inspector", "punycode", "trace_events", "wasi",
]);

/** Es un modulo nativo del runtime (no un archivo del proyecto)? */
export function esModuloNativo(spec: string): boolean {
  if (!spec) return false;
  if (spec.startsWith("node:")) return true;
  return MODULOS_NATIVOS.has(spec.split("/")[0]);
}

/**
 * Extrae los imports/exports relativos de un archivo de código.
 * Captura `import ... from "x"`, `export ... from "x"`, `import("x")` y require("x").
 */
export function extraerImportsRelativos(content: string): string[] {
  const out = new Set<string>();
  for (const re of PATRONES_IMPORT_RELATIVO) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      const spec = m[1];
      if (spec.startsWith(".")) out.add(spec);
      else if (spec.startsWith("/") && !PREFIJOS_SISTEMA.some((p) => spec.startsWith(p))) out.add(spec);
    }
  }
  return [...out];
}

/**
 * Nombres que un archivo importa de un módulo concreto.
 * Es lo que permite generar un stub con la API EXACTA que el proyecto espera,
 * en vez de un archivo vacío que compile pero rompa al usarlo.
 */
export function extraerNombresImportados(content: string, specifier: string): string[] {
  const nombres = new Set<string>();
  const esc = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Formas: `import X from "s"`, `import { a, b as c } from "s"`, `import D, { e } from "s"`
  const re = new RegExp(
    `import\\s+([^"'\`;]*?)\\s*from\\s*["']${esc}["']`,
    "g"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const clausula = m[1].trim();
    const llaves = clausula.match(/\{([^}]*)\}/);
    if (llaves) {
      for (const parte of llaves[1].split(",")) {
        const nombre = parte.trim().split(/\s+as\s+/)[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(nombre)) nombres.add(nombre);
      }
    }
    const porDefecto = clausula.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
    if (porDefecto && /^[A-Za-z_$][\w$]*$/.test(porDefecto) && porDefecto !== "type") {
      nombres.add(porDefecto);
    }
  }
  return [...nombres];
}

/** ¿Es un componente React (PascalCase y no un archivo de estilo)? */
function esComponenteStubable(specifier: string): boolean {
  const nombre = specifier.split("/").pop() || "";
  if (!nombre) return false;
  if (/\.(css|scss|json|svg|png|jpg|jpeg|webp|gif)$/i.test(nombre)) return false;
  return /^[A-Z][A-Za-z0-9_]*$/.test(nombre);
}

/** Stub de COMPONENTE React: válido y renderizable. */
function stubComponente(specifier: string): string {
  const nombre = (specifier.split("/").pop() || "Componente").replace(/[^A-Za-z0-9_]/g, "");
  return `/**
 * STUB generado por el motor de CerebroNico.
 * El proyecto importaba "./${specifier.split("/").slice(1).join("/") || nombre}" pero ese archivo no existía,
 * así que el previsualizador quedaba en blanco. Esta es una versión mínima
 * FUNCIONAL para que la aplicación compile. Sustitúyela por el componente real.
 */
import React from "react";

export const ${nombre}: React.FC<React.PropsWithChildren<Record<string, unknown>>> = ({ children }) => {
  return <>{children ?? null}</>;
};

export default ${nombre};
`;
}

/** Stub de MÓDULO de utilidades: exporta los nombres que el proyecto importa. */
function stubModulo(specifier: string, nombres: string[]): string {
  const ruta = normalizar(specifier);
  const declaraciones = nombres
    .map((n) => {
      // Constantes (MAYÚSCULAS) → lista vacía: permite .map(), .length y [0] sin romper.
      if (/^[A-Z][A-Z0-9_]*$/.test(n)) {
        return `export const ${n}: any[] = [];`;
      }
      // Funciones y valores → no-op encadenable: cualquier llamada o acceso no lanza.
      return `export const ${n}: any = PROXY_NOOP;`;
    })
    .join("\n");
  return `/**
 * STUB generado por el motor de CerebroNico.
 * El proyecto importaba "${specifier}" y ese archivo NO existía, así que Vite no
 * podía resolver el módulo y el previsualizador mostraba un error. Este archivo
 * exporta exactamente lo que el proyecto espera (${nombres.join(", ") || "nada"})
 * para que la aplicación compile y se pueda seguir trabajando.
 *
 * ⚠️ NO es la implementación real: las funciones no hacen nada. Sustitúyelo.
 */
const PROXY_NOOP: any = new Proxy(function () {} as any, {
  get: (_t, prop) => (prop === "then" ? undefined : PROXY_NOOP),
  apply: () => PROXY_NOOP,
});

${declaraciones || "export {};"}
`;
}

/**
 * Comprueba todos los imports relativos contra el conjunto de archivos.
 * `files` debe incluir TANTO los archivos recién sincronizados COMO los que ya
 * están en disco (el motor une ambas listas antes de llamar aquí).
 */
/**
 * v1.0.10 · F9 — EL RASCLO NO ES OBRA. Medido en el log de la sesión
 * 1794120824912 ([LOG:239]): `test-pista.mjs`, `verificar-abordo.mjs` y
 * `_test_curva.mjs` — sondas que el PROPIO agente escribió para diagnosticar —
 * importaban vendor con rutas que solo valían dentro de su carpeta, y la puerta
 * de imports las contó como "imports sin resolver" del proyecto: la tanda
 * siguiente nacía bloqueada por archivos que nadie ejecuta y que el empaquetado
 * ya excluye como basura (`_*`, `verificar-*`, `*.test.*`). La misma clase de
 * culpa ajena que `esModuloNativo` resolvió para `node:fs`: lo que no es obra
 * no puede juzgarse como obra.
 */
export function esArchivoRascuna(ruta: string): boolean {
  const n = normalizar(ruta || "");
  if (!n) return false;
  if (n.startsWith("node_modules/")) return true;
  if (/(^|\/)(tests?|__tests__|spec)\//.test(n)) return true;
  const nombre = n.split("/").pop() || "";
  if (nombre.startsWith("_")) return true;              // _test_curva.mjs, _verif2320.cjs
  if (/^verificar-/.test(nombre)) return true;          // verificar-abordo.mjs
  if (/\.test\.[cm]?[jt]sx?$/i.test(nombre)) return true;
  if (/^test[-_.].*\.[cm]?[jt]sx?$/i.test(nombre)) return true; // test-pista.mjs
  return false;
}

export function findMissingImports(files: CheckFile[]): MissingImport[] {
  const existentes = new Set(files.map((f) => normalizar(f.path)));
  const faltantes: MissingImport[] = [];
  const vistos = new Set<string>();

  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f.path)) continue;
    if (esArchivoRascuna(f.path)) continue; // F9: el rasclo del agente no secuestra la tanda
    for (const spec of extraerImportsRelativos(f.content || "")) {
      // v1.51.1 - un modulo nativo (node:fs, path, crypto...) NO es un import roto:
      // no vive en el proyecto, vive en el runtime. Antes bloqueaba la puerta y
      // el Quirofano revertia la tanda entera.
      if (esModuloNativo(spec)) continue;
      const base = resolverRelativo(f.path, spec);
      // v1.31.0 — la resolución pasa por resolverRutaImport (la MISMA que usa
      // el grafo). Comportamiento idéntico: si algún candidato existe, el
      // import está resuelto y no se informa.
      if (resolverRutaImport(f.path, spec, existentes) !== null) continue;
      const clave = `${normalizar(f.path)}|${spec}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      faltantes.push({
        from: normalizar(f.path),
        specifier: spec,
        expected: [base, base + EXTENSIONES[0], base + EXTENSIONES[1]],
        stubable: esComponenteStubable(spec),
        nombresEsperados: extraerNombresImportados(f.content || "", spec),
      });
    }
  }
  return faltantes;
}

/** Genera los stubs de los imports faltantes que se pueden rellenar. */
export function buildStubs(faltantes: MissingImport[]): Array<{ path: string; content: string }> {
  const stubs: Array<{ path: string; content: string }> = [];
  const yaPuestos = new Set<string>();
  for (const m of faltantes) {
    // ============================================================
    // v2.1 — 🐞 `includes(".")` MIRABA EL PUNTO EQUIVOCADO
    // ------------------------------------------------------------
    // Antes: `m.expected[0].includes(".")`. La idea era "si ya trae extensión, no
    // se la añadas". Pero un punto hay en MUCHOS sitios: la carpeta contenedora
    // del ZIP se llama «CerebroNico-IDE-v2.1», y ahí ya hay un punto. Así que
    // TODAS las rutas se consideraban "con extensión" y los stubs se escribían
    // SIN ella: archivos llamado `modelTiers` junto a `modelTiers.ts`. Nunca
    // existían, así que el contador decía "stubs creados: 60" —los 60— y el
    // proyecto acumulaba basura en cada sincronización.
    // Ahora se mira solo el nombre del ÚLTIMO segmento, que es donde va la
    // extensión de verdad.
    // ============================================================
    const ultimoSegmento = m.expected[0].split("/").pop() || "";
    const yaTieneExtension = /\.[a-z0-9]+$/i.test(ultimoSegmento);
    const objetivo = yaTieneExtension
      ? m.expected[0]
      : m.expected[0] + (m.stubable ? ".tsx" : ".ts");
    if (yaPuestos.has(objetivo)) continue;
    // Componente → stub de componente. Módulo → stub solo si sabemos qué nombres
    // exportar; sin nombres, un archivo vacío no ayudaría a nadie.
    const contenido = m.stubable ? stubComponente(m.specifier) : m.nombresEsperados.length > 0 ? stubModulo(m.specifier, m.nombresEsperados) : "";
    if (!contenido) continue;
    yaPuestos.add(objetivo);
    stubs.push({ path: objetivo, content: contenido });
  }
  return stubs;
}

/** Mensaje legible para el log de la IDE. */
export function describeMissingImports(faltantes: MissingImport[]): string {
  if (faltantes.length === 0) return "";
  return faltantes
    .slice(0, 6)
    .map((m) => `${m.from} importa "${m.specifier}" y NO existe`)
    .join(" · ");
}
