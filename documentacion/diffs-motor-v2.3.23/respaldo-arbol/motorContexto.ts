/**
 * motorContexto.ts — EL CONTEXTO ENGINE: SABER DÓNDE SE TRABAJA ANTES DE TOCAR (v1.31.0 · FASE 1)
 * =================================================================================================
 * QUÉ ES: el Context Engine de la hoja de ruta (§1) hecho mecánica pura, con su
 * presupuesto por niveles (L0–L5) y su cache invalidable contra el disco.
 *
 * EL DEFECTO QUE CURA: hasta hoy el motor inyectaba LA LISTA de archivos
 * (ordenDeObra v1.22.1) — certeza bruta, correcta, pero plana. El modelo veía
 * 400 rutas y debía adivinar qué stack es, dónde entra la app, qué puertos
 * corre, dónde están los tests y qué depende de qué. Con micro-modelos ese
 * adivinar se paga en rutas inventadas yimports rompiendo.
 *
 * LA JERARQUÍA (no meter TODO en el prompt — la hoja de ruta lo prohíbe):
 *   L0 objetivo actual         (el texto de la tarea)
 *   L1 archivos afectados      (lo que la tarea toca, leído de disco)
 *   L2 dependencias e impacto  (calculado con grafoProyecto.impactoDe)
 *   L3 arquitectura relacionada(resumen detectado del proyecto)
 *   L4 historial / memoria     (texto que aporta quien llama)
 *   L5 conocimiento general    (SOLO si L1–L4 no resuelven y queda presupuesto)
 *
 * FUENTE ÚNICA: la detección de dependencias faltantes NO se reimplementa —
 * usa dependenciasProyecto (paquetesExternosPorArchivo/auditoriaPaquetes) y el
 * grafo usa la resolución de importChecker. Este módulo modela y ensambla.
 *
 * v1.71.1 · RENDIMIENTO DEL RECORRIDO: la huella se calcula sin abrir contenido
 * (los archivos que el modelo no lee aportan solo su ruta), el cache responde
 * sin releer, y lo que sí se mide o se abre se hace con un grupo de hilos.
 * Ver «EL GRUPO DE LECTURA» más abajo: es la causa del rojo de 16 181 ms en
 * Windows con antivirus y de que cada turno de chat reabriera 655 archivos.
 *
 * v1.97.3 · TERCERA PATRIA DEL RECORRIDO: `SOLO_RUTA`. Con el repo a 1 065
 * archivos el rojo de reloj volvió (10 298 ms en Windows con antivirus, v1.97.2):
 * 775 candidatos pagaban stat + lectura, y ~350 de ellos (tests/, extensions/,
 * espejos_servidor/, tools/, manual-motor/, documentacion/, docs/, ejemplos/)
 * no aportan nada al retrato — su verdad es la RUTA (censo, extensiones,
 * invalidación por aparición/desaparición). Se recorren y se cuentan, y su
 * contenido deja de medirse y abrirse. Lo declarado vive en `carpetasSoloRuta`
 * (modelo) y en el resumo: nada se mira a escondidas. Razón medida completa en
 * la definición de `SOLO_RUTA` más abajo.
 *
 * PUREZA: `modelarProyecto(ficheros)` es pura (recibe contenido, devuelve
 * datos). El acceso a disco vive en `contextoProyecto(raiz)` — que además
 * CACHEA por huella (paths+tamaños+mtimes+package.json+git HEAD): si cambia
 * el proyecto, cambia la huella, se recalcula; si no, sale de cache. Nunca
 * lee secretos: `.env*` está excluido del rastreo por diseño.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { cpus } from "node:os";
import { Worker } from "node:worker_threads";
// FASE 12 (v2.3.15): la línea del perfil de parches viaja con la nota de contexto.
// Sin perfil en disco devuelve cadena vacía y el `filter(Boolean)` la descarta:
// el estado vivo no se infla con información que no existe.
import { lineaDeEstadoPerfilParches } from "./perfiles/perfilParches";
import { auditoriaPaquetes, extraerPaquetesExternos, paquetesExternosPorArchivo } from "./dependenciasProyecto";
import { type CheckFile } from "./importChecker";
import { construirGrafo, grafoAParte, hubsDelGrafo, impactoDe, type GrafoProyecto } from "./grafoProyecto";

// ════════════════════════════════════════════════════════════════════════════
// EL MODELO
// ════════════════════════════════════════════════════════════════════════════

export interface FicheroLeido {
  /** Ruta relativa a la raíz, con barras unix. */
  ruta: string;
  contenido: string;
}

export interface ModeloProyecto {
  generadoEn: number;
  raiz: string;
  /** Archivos detectados (todos, incluidos los no leídos). */
  archivosTotales: number;
  porExtension: Record<string, number>;
  lineasTotales: number;
  /** Etiquetas legibles: ["React", "Vite", "Tailwind", "TypeScript"]… */
  stack: string[];
  gestor: "npm" | "pnpm" | "yarn" | "bun" | null;
  entrypoints: string[];
  /** Archivos que levantan servidor (node/http/uvicorn/FastAPI…). */
  servicios: string[];
  puertos: number[];
  scripts: Record<string, string>;
  tests: { archivos: number; comandos: string[] };
  dependencias: { declaradas: number; faltantes: string[]; declaradasSinInstalar: string[] };
  /** ¿Hubo package.json LEGIBLE? Sin él, el stack es por archivos y hay que decirlo. */
  packageJson: boolean;
  /** El escaneo se cortó por tope: el modelo es parcial y debe decirlo. */
  parcial: boolean;
  /**
   * v1.97.3 — carpetas (raíz) contadas por ruta pero sin contenido leído
   * (`SOLO_RUTA`): se declaran para que el retrato no pase por completo lo
   * que a propósito no mira.
   */
  carpetasSoloRuta: string[];
}

/**
 * Directorios que NUNCA se recorren (dependencias, artefactos, estado).
 *
 * v1.56.8 — `skills` entra aquí por RENDIMIENTO MEDIDO y por CORRECCIÓN: la
 * biblioteca de skills instaladas por el IDE (MCP: Context7, Webflow, …) son
 * ~865 ficheros de TERCEROS bajo `skills/`, y el motor de contexto retrata el
 * PROYECTO, no la biblioteca que lo asiste. Recorrerla costaba ~1074 operaciones
 * de disco por pasada (statSync + readFileSync) sobre ~2700 totales; en equipos
 * lentos (Windows con antivirus, 8 GB) eso llevaba la construcción del modelo a
 * ~10,5 s y hacía rojo el tope de 8 s de `tests/motorContexto.test.ts` — un rojo
 * de RELOJ, no de lógica. Además, los servidores/puertos de EJEMPLO de un skill
 * ensuciaban `servicios`/`puertos` del retrato. Se alinea con `vendor`, ya
 * ignorado por el mismo motivo.
 */
export const IGNORADOS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".cache", ".turbo",
  "__pycache__", ".venv", "venv", ".cerebro-db", ".cerebronico", ".revisiones",
  "memoria_history", "vendor", "skills", ".env",
]);

/**
 * v1.97.3 — carpetas auxiliares: se RECORREN y se CUENTAN por ruta (archivos,
 * extensiones, censo de tests) pero su CONTENIDO nunca se mide ni se abre.
 * Diferencia con `IGNORADOS`: ahí ni se entra; acá sí (la ruta alimenta la
 * huella y el censo), solo se corta la parte cara: stat + lectura.
 *
 * LA RAZÓN, MEDIDA (v1.97.2, 2026-10-31): en el equipo de Windows 10 / 8 GB /
 * antivirus la construcción del modelo daba el rojo de reloj (10 298 ms contra
 * el tope de 8 s de `tests/motorContexto.test.ts`). Con el repo a 1 065
 * archivos y 775 candidatos (medir + leer), las carpetas auxiliares pagaban
 * ~350 de esas operaciones (~45 %) sin aportar nada al retrato:
 *   · `tests/` — el censo de tests sale de la RUTA (no del contenido); leer
 *     242 archivos para contarlos es pagar el doble por la misma verdad;
 *   · `extensions/` — packs de extensión instalados (misma naturaleza que
 *     `skills/`, que ya vivía en IGNORADOS desde v1.56.8 por el mismo motivo);
 *   · `espejos_servidor/` — espejos de datos con MANIFIESTO_SHA256: contenido
 *     redundante por definición (la copia no retrata nada nuevo);
 *   · `tools/` — benchmarks y servidores falsos (un `server_falso_ollama.py`
 *     justo es lo que ENZUPA `servicios`/`puertos`, el defecto de v1.56.8);
 *   · `manual-motor/` — copias del manual en varios formatos (documentación);
 *   · `documentacion/`, `docs/`, `ejemplos/` — documentación y ejemplos.
 *
 * El retrato no pierde verdad: stack, entradas, servicios y puertos viven en
 * src/ server/ scripts/ package.json (todo leíble); el censo de tests y el
 * total de archivos salen de las rutas. Y NADA se esconde: `carpetasSoloRuta`
 * viaja en el modelo y el resumo lo declara (la casa no cuenta cosas a
 * medias sin rotularlas).
 */
export const SOLO_RUTA = new Set([
  "tests", "extensions", "espejos_servidor", "tools",
  "manual-motor", "documentacion", "docs", "ejemplos",
]);

/** Extensiones cuyo contenido se lee para el análisis. */
const LEIBLES = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss",
  ".html", ".py", ".vue", ".svelte",
]);

/** Secretos y basura que jamás entran al contenido (aunque sean .env.example). */
const NUNCA_LEER = /(^|\/)\.env(\..*)?$|(^|\/)(package-lock\.json|bun\.lockb|yarn\.lock|pnpm-lock\.yaml)$/i;

const MAX_ARCHIVOS = 800;
const MAX_BYTES_POR_ARCHIVO = 400_000;

/** Código: lo que se barre buscando servicios, puertos y paquetes. */
const CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/i;
/**
 * Puertos declarados en contenido: `PORT: 3000`, `listen(3000`, `localhost:3000`.
 * v1.84.1 — constante de módulo (antes se recreaba el regex por archivo). Se usa
 * SOLO con `matchAll`, que clona el regex internamente: el `lastIndex` compartido
 * nunca se pisa (misma disciplina que `PATRONES_IMPORT` en dependenciasProyecto).
 */
const RE_PUERTOS = /(?:PORT|port)\s*[:=]\s*(\d{2,5})\b|\.listen\s*\(\s*(\d{2,5})|localhost:(\d{2,5})/g;
/**
 * UNIÓN de lo que barre el modelo (`CODIGO`) y lo que barre el grafo
 * (`.vue`/`.svelte`/`.html` en grafoProyecto). Sobre estas rutas se calcula UNA
 * vez el mapa archivo→paquetes que consumen las dos vistas.
 */
const RASTRABLES_UNION = /\.(ts|tsx|js|jsx|mjs|cjs|py|vue|svelte|html)$/i;

/** djb2 mínimo y estable: alcanza para comparar dos pasadas del mismo árbol. */
function djb2(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function extensionDe(ruta: string): string {
  const i = ruta.lastIndexOf(".");
  return i === -1 ? "" : ruta.slice(i).toLowerCase();
}

/** package.json raíz tal cual (el que vive en la primera carpeta, no anidados). */
function packRaizDe(ficheros: FicheroLeido[]): FicheroLeido | undefined {
  return ficheros.find((f) => f.ruta === "package.json");
}

const PISTA_STACK: Array<[RegExp, string]> = [
  [/\breact(?!-)/, "React"],
  [/\breact-dom/, "React-DOM"],
  [/\bvue\b/, "Vue"],
  [/\bsvelte\b/, "Svelte"],
  [/@angular\/core/, "Angular"],
  [/\bexpress\b/, "Express"],
  [/\bfastify\b/, "Fastify"],
  [/\bnext\b(?!-)/, "Next"],
  [/\bnuxt\b/, "Nuxt"],
  [/\bvite\b/, "Vite"],
  [/\btailwindcss\b/, "Tailwind"],
  [/\btypescript\b/, "TypeScript"],
  [/\belectron\b/, "Electron"],
];

/**
 * EL MODELO PURO: recibe los archivos con contenido, devuelve el retrato.
 * Nada de disco, nada de red, nada que prometer sin evidencia.
 */
export function modelarProyecto(
  ficheros: FicheroLeido[],
  opts: {
    raiz?: string;
    hayInstalado?: (paquete: string) => boolean;
    /**
     * Rutas que existen pero NO se leyeron (lockfiles, binarios, secretos).
     * Sirven para detectar el GESTOR por nombre de lock — una verdad de ruta,
     * no de contenido; por eso pueden vivir fuera del contenido leído.
     */
    rutasAdicionales?: string[];
    /**
     * Paquetes externos ya barridos por archivo (lo produce `contextoProyecto`
     * para no rastrear dos veces el mismo texto). Si no viene, se calcula aquí
     * con la misma fuente única: `dependenciasProyecto`.
     */
     paquetesPorArchivo?: Map<string, string[]>;
     /** v1.97.3 — carpetas contadas por ruta sin contenido (lo trae `contextoProyecto`). */
     carpetasSoloRuta?: string[];
   } = {}
): ModeloProyecto {
  const rutas = [...ficheros.map((f) => f.ruta), ...(opts.rutasAdicionales ?? [])];
  const porExtension: Record<string, number> = {};
  // UN solo paso por el contenido leído: extensión, líneas, servicios y puertos
  // se sacan juntos. Iban en dos bucles que volvían a recorrer el mismo texto.
  let lineas = 0;
  const servicios: string[] = [];
  const puertos = new Set<number>();
  for (const f of ficheros) {
    const e = extensionDe(f.ruta) || "(sin ext)";
    porExtension[e] = (porExtension[e] || 0) + 1;
    const c = f.contenido;
    // v1.84.1 — Contar saltos con `indexOf` (búsqueda nativa en C++) saltando de
    // salto en salto: el bucle carácter a carácter con `charCodeAt` recorría los
    // 8,4 MB del entero byte a byte desde JS. MISMO resultado (se comprueba en
    // tests/motorContexto.test.ts §6: el retrato no cambia), una fracción del
    // tiempo en el CPU lento del equipo de 8 GB. Antes ya se había descartado
    // `match(/\n/g)` porque montaba un array con cada salto (151 728 entradas).
    let saltos = 0;
    for (let i = c.indexOf("\n"); i !== -1; i = c.indexOf("\n", i + 1)) saltos++;
    lineas += saltos + (c && !c.endsWith("\n") ? 1 : 0);
    if (!CODIGO.test(f.ruta)) continue;
    // v1.84.1 — PREFILTRO BARATO antes de las dos pasadas de regex: todo lo que
    // buscan (`createServer`, `listen`, `uvicorn`, `FastAPI`, `http.server`,
    // `PORT|port`, `localhost:`) exige una de estas subcadenas en el texto. Los
    // `includes` son búsquedas nativas muchísimo más rápidas que el regex con
    // retroceso; un archivo que no las menciona NO PUEDE producir ni un servicio
    // ni un puerto, así que saltárselos no cambia el retrato ni un byte.
    const mencionaPuerto = c.includes("port") || c.includes("PORT") || c.includes("listen") || c.includes("localhost:");
    const lc = mencionaPuerto || /(?:create|http\.|uvic|fast|listen)/i.test(c) ? c.toLowerCase() : "";
    const mencionaServidor = lc !== "" && (lc.includes("createserver") || lc.includes("listen") || lc.includes("uvicorn") || lc.includes("fastapi") || lc.includes("http.server"));
    if (mencionaServidor && /createServer\s*\(|app\.listen\s*\(|\.listen\s*\(\s*\d|uvicorn|FastAPI\s*\(|http\.server/i.test(c)) {
      servicios.push(f.ruta);
    }
    if (mencionaPuerto) {
      for (const m of c.matchAll(RE_PUERTOS)) {
        const p = Number(m[1] || m[2] || m[3] || 0);
        if (p >= 1 && p <= 65535) puertos.add(p);
      }
    }
  }

  // package.json — parseo SEGURO (lección de la casa: un JSON roto no tumba el motor).
  let pkg: any = null;
  const packTxt = packRaizDe(ficheros)?.contenido;
  try {
    if (packTxt) pkg = JSON.parse(packTxt);
  } catch {
    pkg = null;
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const declaradas = Object.keys(deps).sort();

  const stack: string[] = [];
  const pkgBlob = declaradas.join(" ");
  for (const [re, etiqueta] of PISTA_STACK) {
    if (re.test(pkgBlob) && !stack.includes(etiqueta)) stack.push(etiqueta);
  }
  if (rutas.some((r) => /\.py$/i.test(r)) && !stack.includes("Python")) stack.push("Python");

  const gestor: ModeloProyecto["gestor"] =
    rutas.some((r) => r === "pnpm-lock.yaml") ? "pnpm"
    : rutas.some((r) => r === "yarn.lock") ? "yarn"
    : rutas.some((r) => /^(bun\.lockb|bun\.lock)$/.test(r)) ? "bun"
    : rutas.some((r) => r === "package-lock.json") ? "npm"
    : pkg ? "npm" : null;

  const ENTRADAS = ["index.html", "src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js", "server.ts", "server.js", "electron-main.cjs", "main.py", "app.py"];
  const entrypoints = ENTRADAS.filter((e) => rutas.includes(e));

  const scripts: Record<string, string> = { ...(pkg?.scripts || {}) };
  for (const v of Object.values(scripts)) {
    for (const m of String(v).matchAll(/(?:PORT|=|localhost:|127\.0\.0\.1:)(\d{2,5})/g)) {
      const p = Number(m[1]);
      if (p >= 1 && p <= 65535) puertos.add(p);
    }
  }

  const testArchivos = rutas.filter((r) => /(^|\/)(tests?|__tests__)\/|\.test\.|\.spec\./i.test(r));
  const comandosTest = Object.entries(scripts)
    .filter(([k]) => /test|verificar|validar/i.test(k))
    .map(([k, v]) => `${k}: ${String(v)}`);

  // Dependencias: la verdad la tienen los módulos oficiales, no este archivo.
  const codigoCheck: CheckFile[] = ficheros
    .filter((f) => CODIGO.test(f.ruta))
    .map((f) => ({ path: f.ruta, content: f.contenido }));
  const entorno = { declarados: declaradas, estaInstalado: opts.hayInstalado ?? (() => false) };
  // UNA auditoría: `faltantes` y `declaradasSinInstalar` salen del mismo barrido
  // (antes cada uno volvía a extraer paquetes por su cuenta).
  const aud = auditoriaPaquetes(codigoCheck, entorno, opts.paquetesPorArchivo);

  return {
    generadoEn: Date.now(),
    raiz: opts.raiz ?? ".",
    archivosTotales: rutas.length,
    porExtension,
    lineasTotales: lineas,
    stack,
    gestor,
    entrypoints,
    servicios: servicios.slice(0, 12),
    puertos: [...puertos].sort((a, b) => a - b).slice(0, 10),
    scripts,
    tests: { archivos: testArchivos.length, comandos: comandosTest },
    dependencias: {
      declaradas: declaradas.length,
      faltantes: aud.faltantes,
      declaradasSinInstalar: aud.declaradosSinInstalar,
    },
    packageJson: packRaizDe(ficheros) !== undefined,
    parcial: false,
    carpetasSoloRuta: opts.carpetasSoloRuta ?? [],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DISCO + CACHE POR HUELLA
// ════════════════════════════════════════════════════════════════════════════

export interface ContextoProyecto {
  modelo: ModeloProyecto;
  grafo: GrafoProyecto;
  /** La última huella observada — la prueba de contra qué disco se validó. */
  huella: string;
  cacheado: boolean;
  parcial: boolean;
}

interface Candidato {
  ruta: string;
  bytes: number;
}

interface HuellaDelArbol {
  /** `ruta|bytes|mtime` de lo que alimenta el modelo; `ruta` a secas del resto. */
  entradas: string[];
  huella: string;
  /** Archivos cuyo contenido hace falta, en el orden del recorrido. */
  candidatos: Candidato[];
  parcial: boolean;
  /** v1.97.3 — raíces `SOLO_RUTA` que ENCONTRÓ algo que contar (se declaran en el modelo). */
  soloRutaDirs: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// v1.71.1 · EL ÁRBOL SE RECORRE CON HILOS (por qué, medido)
// ────────────────────────────────────────────────────────────────────────────
// LA VALLA QUE FALLABA: `tests/motorContexto.test.ts` pide el retrato del repo
// real en menos de 8 s. En un portátil Linux/SSD son 220 ms. En el equipo de
// Mario (Windows 10, 8 GB, antivirus sobre `Downloads\`) el mismo retrato tardó
// 16 181 ms y se puso rojo. No es lógica: es LATENCIA POR OPERACIÓN.
//
// Medido con `statSync`/`readFileSync` contados sobre este repo:
//     81 readdir + 911 stat + 655 lecturas = 1 647 llamadas al disco
//     16 181 ms / 1 647            ≈ 9,8 ms por llamada
// Nueve milisegundos por operación es lo que cobra un filtro de archivos de
// Windows (Defender y compañía) cada vez que se ABRE algo, multiplicado por
// cientos. El coste no está en los bytes (7,5 MB) sino en los APERTURAS.
//
// TRES COSAS BAJAN DE AHÍ, y las tres se hacen aquí:
//   1 · Se eliminan los `statSync` de los archivos que el modelo NO lee (docs,
//       imágenes, binarios, lockfiles, .env): de ellos solo se necesita la RUTA,
//       y la ruta ya la trae `readdirSync` gratis. −256 llamadas.
//   2 · La huella se calcula SIN abrir contenido, y si la huella no cambió se
//       devuelve el retrato en cache SIN LEER NADA. Antes, cada turno de chat
//       (`notaDeContexto` en server.ts) volvía a abrir los 655 archivos aunque
//       el proyecto estuviera intacto: el cache respondía tarde y caro.
//   3 · Lo que sí hay que medir y abrir se abre EN PARALELO con un grupo de
//       `worker_threads`, PERO SOLO SI EL DISCO LO PIDE: antes de repartir se
//       toman muestras en el hilo principal y, si la operación unitaria es
//       barata (SSD local), se sigue en serie. La latencia por operación no se
//       puede quitar, pero se puede SUPERPONER: 655 aperturas de 10 ms una
//       detrás de otra son 6,5 s; seis en paralelo son poco más de 1 s.
//
// El grupo es una OPTIMIZACIÓN, nunca un requisito: si no se puede crear, si un
// hilo revienta o si una tarea se pasa de su plazo, se lee en el hilo principal
// y el retrato sale igual. Se apaga con `CEREBRONICO_LECTOR_SECUENCIAL=1` (para
// medir el uno contra uno en las pruebas).
// ────────────────────────────────────────────────────────────────────────────

/** Menos archivos que esto, el hilo no paga su arranque: manda el camino secuencial. */
const UMBRAL_GRUPO = 32;
/** Hilos del grupo: suficiente para superar la cola del antivirus sin canibalizar 8 GB. */
const HILOS_MAX = 6;
/** Techo de memoria compartida para el contenido; por encima, se lee en el hilo principal. */
const TECHO_REGION_BYTES = 128 * 1024 * 1024;
/** Si una tarea tarda más que esto, el grupo se da por muerto y se lee en serie. */
const ESPERA_TAREA_MS = 30_000;

// Cabecera del área compartida (int32): [0] cursor de tareas · [1] n · [2] modo · [3] reserva
const CAB = 16;
const MODO_MEDIR = 1;
const MODO_LEER = 2;

/**
 * EL GRUPO: JavaScript llano (no TypeScript) porque el hilo no pasa por `tsx`.
 * Coge tareas con un cursor atómico y deja su resultado en la memoria compartida.
 * Estados por tarea: 0 pendiente · 1 resuelto · 2 ilegible · 3 sin uso · 4 cambió
 * de tamaño entre la medida y la lectura (lo lee el hilo principal).
 */
const CODIGO_GRUPO = [
  "const { workerData } = require('node:worker_threads');",
  "const fs = require('node:fs');",
  "const { sab, raiz, sep, paths, n, modo, e, t, m, o, base } = workerData;",
  "const cur = new Int32Array(sab, 0, 4);",
  "const est = new Int32Array(sab, e, n);",
  "const tam = new Int32Array(sab, t, n);",
  "const mtm = new Float64Array(sab, m, n);",
  "const ofs = new Int32Array(sab, o, n);",
  "for (;;) {",
  "  const i = Atomics.add(cur, 0, 1);",
  "  if (i >= n) break;",
  "  const abs = raiz + sep + paths[i];",
  "  if (modo === 1) {",
  "    try { const st = fs.statSync(abs); tam[i] = st.size; mtm[i] = Math.round(st.mtimeMs); Atomics.store(est, i, 1); }",
  "    catch { Atomics.store(est, i, 2); }",
  "  } else {",
  "    try {",
  "      const buf = fs.readFileSync(abs);",
  "      if (buf.length > tam[i]) { Atomics.store(est, i, 4); }",
  "      else { new Uint8Array(sab, base + ofs[i], buf.length).set(buf); tam[i] = buf.length; Atomics.store(est, i, 1); }",
  "    } catch { Atomics.store(est, i, 2); }",
  "  }",
  "  Atomics.notify(est, i);",
  "}",
].join("\n");

interface Lote {
  sab: SharedArrayBuffer;
  est: Int32Array;
  tam: Int32Array;
  mtm: Float64Array;
  off: Int32Array;
  /** Desplazamiento en bytes donde empieza la región de contenido. */
  base: number;
}

const alinear8 = (x: number): number => Math.ceil(x / 8) * 8;

/** Reserva el área compartida: cabecera + estados + tamaños + offsets + mtimes (+ contenido). */
function crearLote(n: number, bytes: number): Lote {
  const e = CAB;
  const t = e + 4 * n;
  const o = t + 4 * n;
  const m = alinear8(o + 4 * n);
  const base = alinear8(m + 8 * n);
  const sab = new SharedArrayBuffer(base + bytes);
  return {
    sab,
    est: new Int32Array(sab, e, n),
    tam: new Int32Array(sab, t, n),
    off: new Int32Array(sab, o, n),
    mtm: new Float64Array(sab, m, n),
    base,
  };
}

/** El grupo se apaga solo si estropea una vez: no se paga un timeout por turno. */
let grupoDeshabilitado = false;

function quererGrupo(n: number): boolean {
  if (grupoDeshabilitado) return false;
  if (process.env.CEREBRONICO_LECTOR_SECUENCIAL === "1") return false;
  return n >= UMBRAL_GRUPO;
}

/** `CEREBRONICO_LECTOR_GRUPO=1` fuerza los hilos aunque el disco sea rápido (para probarlos). */
function grupoForzado(): boolean {
  return process.env.CEREBRONICO_LECTOR_GRUPO === "1";
}

/**
 * LO QUE HIZO EL ÚLTIMO RECORRIDO, en crudo (v1.71.1). No es adorno: sin esto no
 * se puede escribir una prueba que afirme «los dos caminos dan el mismo retrato»
 * sin mentir, porque un grupo que se calló y cayó a la serie también da el mismo
 * retrato — por no haber corrido. `tests/motorContexto.test.ts` mira estos
 * contadores para exigir que el camino de hilos se usó DE VERDAD.
 */
const diag = {
  medidasGrupo: 0,
  medidasSerie: 0,
  lecturasGrupo: 0,
  lecturasSerie: 0,
  /** Hilos de la última tanda que sí repartió trabajo (0 = todo en serie). */
  ultimosHilos: 0,
  /** Milisegundos por operación que midieron las muestras (la calibración). */
  msPorOperacion: 0,
  /** true si el entorno no deja usar hilos: se lee en serie, sin dramas. */
  deshabilitado: false,
};

export interface EstadisticasLectura {
  medidasGrupo: number;
  medidasSerie: number;
  lecturasGrupo: number;
  lecturasSerie: number;
  ultimosHilos: number;
  msPorOperacion: number;
  deshabilitado: boolean;
}

export function estadisticasDeLectura(): EstadisticasLectura {
  return { ...diag, deshabilitado: grupoDeshabilitado };
}

function numeroDeHilos(n: number): number {
  let cores = 4;
  try {
    cores = cpus().length || 4;
  } catch {
    cores = 4;
  }
  const porNucleo = cores - 1 > 0 ? cores - 1 : 1;
  return Math.max(2, Math.min(HILOS_MAX, n, porNucleo));
}

/**
 * Reparte el lote entre los hilos y BLOQUEA el principal hasta que cada tarea
 * esté resuelta (o hasta declarar el grupo muerto). Devuelve `false` cuando el
 * principal tiene que rehacer el trabajo en serie: nunca se pierde un archivo.
 */
function correrLote(raiz: string, rutas: string[], modo: number, lote: Lote): boolean {
  const n = rutas.length;
  const hilos = numeroDeHilos(n);
  diag.ultimosHilos = hilos;
  const workers: Worker[] = [];
  let roto = false;
  const onerror = () => {
    roto = true;
  };
  try {
    const workerData = {
      sab: lote.sab,
      raiz,
      sep: sep,
      paths: rutas,
      n,
      modo,
      e: lote.est.byteOffset,
      t: lote.tam.byteOffset,
      m: lote.mtm.byteOffset,
      o: lote.off.byteOffset,
      base: lote.base,
    };
    for (let h = 0; h < hilos; h++) {
      const w = new Worker(CODIGO_GRUPO, { eval: true, workerData });
      w.on("error", onerror);
      w.unref(); // que el proceso pueda morir aunque el hilo siga vivo
      workers.push(w);
    }
  } catch {
    grupoDeshabilitado = true;
    for (const w of workers) {
      w.unref();
      w.terminate().catch(() => {});
    }
    return false;
  }

  const inicio = Date.now();
  let todoResuelto = true;
  try {
    for (let i = 0; i < n; i++) {
      while (Atomics.load(lote.est, i) === 0) {
        if (roto) {
          todoResuelto = false;
          break;
        }
        if (Date.now() - inicio > ESPERA_TAREA_MS) {
          todoResuelto = false;
          break;
        }
        Atomics.wait(lote.est, i, 0, 50);
      }
      if (!todoResuelto) break;
    }
  } finally {
    for (const w of workers) {
      w.unref();
      w.terminate().catch(() => {});
    }
  }
  if (!todoResuelto) grupoDeshabilitado = true;
  return todoResuelto;
}

const decodificadorUTF8 = new TextDecoder("utf-8");

/**
 * CALIBRACIÓN — por qué no se paraleliza a ciegas.
 * El grupo paga su arranque (crear los hilos) una vez por recorrido. Sobre un
 * SSD local, donde medir un archivo cuesta microsegundos, ese arranque es puro
 * perjuicio: medido, el retrato subía de 220 ms a 345 ms en Linux. Sobre el
 * Windows con antivirus de Mario, donde cada operación cuesta ~10 ms, es la
 * diferencia entre 6,5 s y 1 s. Así que se MIDE antes de decidir: se toman unas
 * muestras en el hilo principal y el grupo solo entra si la operación unitaria
 * pasa del umbral. La decisión se toma por fase (medir y abrir no cuestan igual:
 * el antivirus castiga la APERTURA, no la consulta de tamaño).
 */
const MUESTRAS_MEDIR = 24;
/**
 * v1.84.1 — 4 → 8 muestras y REPARTIDAS. Cuatro aperturas seguidas del principio
 * del árbol (los archivos que el test anterior ya calentó en caché) medían barato
 * y condenaban el resto — 600 aperturas frías — a la serie: en el equipo con
 * antivirus eso ES el rojo de 8,3 s. Ocho muestras repartidas por todo el lote
 * ven el disco real, no el recuerdo del turno anterior.
 */
const MUESTRAS_LEER = 8;
/**
 * v1.84.1 — 1,2 → 0,8 ms. El arranque del grupo cuesta ~60-80 ms UNA vez y se
 * amortiza sobre cientos de operaciones: a 0,8 ms/op con 600 pendientes, la serie
 * paga ~480 ms y el grupo ~80 + 480/6 ≈ 160. El umbral sigue siendo una defensa
 * legítima para lotes chicos en SSD, no una cortesía para discos rápidos.
 */
const UMBRAL_MS_POR_OPERACION = 0.8;

/**
 * Índices de muestreo REPARTIDOS por el lote (no los primeros N, que son los
 * que el sistema operativo trae calientes desde la pasada anterior). Con n
 * archivos y m muestras, se toma la muestra k en la posición redondeada de
 * k·(n−1)/(m−1) — extremos incluidos. Si m ≥ n, se toman todos.
 */
function indicesDeMuestra(n: number, m: number): number[] {
  if (n <= 0) return [];
  if (m >= n || m <= 1) { const todos: number[] = []; for (let i = 0; i < (m >= n ? n : 1); i++) todos.push(i); return todos; }
  const idx: number[] = [];
  const paso = (n - 1) / (m - 1);
  let previo = -1;
  for (let k = 0; k < m; k++) {
    let i = Math.round(k * paso);
    if (i <= previo) i = previo + 1; // nunca repetir ni desordenar
    if (i >= n) i = n - 1;
    if (i <= previo) break;
    idx.push(i);
    previo = i;
  }
  return idx;
}

/**
 * v1.84.1 — LA DECISIÓN QUE SE HEREDA: si en la fase de MEDIR el disco ya pidió
 * el grupo (operación lenta), la fase de ABRIR no vuelve a pagar muestras para
 * descubrir lo mismo: hereda la decisión. `null` = todavía no hay decisión
 * (lote chico, todo muestreado); `false` = disco rápido, la serie manda.
 * El antivirus castiga la apertura al menos tanto como la consulta de tamaño:
 * heredar es conservador, no un salto al vacío — si el grupo luego falla,
 * `correrLote` cae a la serie y ningún archivo se pierde (invariante de siempre).
 */
let medirDecidioGrupo: boolean | null = null;

/** tAMAÑO Y MTIME de los archivos que alimentan el modelo, sin abrir contenido. */
function medirArchivos(raiz: string, rutas: string[]): Array<{ bytes: number; mtime: number } | null> {
  const n = rutas.length;
  const medida: Array<{ bytes: number; mtime: number } | null> = new Array(n).fill(null);
  if (n === 0) return medida;
  medirDecidioGrupo = null;
  const muestra = indicesDeMuestra(n, Math.min(n, MUESTRAS_MEDIR));
  const muestreado = new Uint8Array(n);
  const t0 = performance.now();
  for (const i of muestra) {
    muestreado[i] = 1;
    try {
      const st = statSync(join(raiz, rutas[i]));
      medida[i] = { bytes: st.size, mtime: Math.round(st.mtimeMs) };
    } catch {
      medida[i] = null;
    }
  }
  const msPorOp = (performance.now() - t0) / Math.max(1, muestra.length);
  diag.medidasSerie += muestra.length;
  diag.msPorOperacion = msPorOp;
  const resto: number[] = [];
  for (let i = 0; i < n; i++) if (!muestreado[i]) resto.push(i);
  if (resto.length === 0) return medida;
  if (quererGrupo(resto.length) && (grupoForzado() || msPorOp >= UMBRAL_MS_POR_OPERACION)) {
    const lote = crearLote(resto.length, 0);
    if (correrLote(raiz, resto.map((g) => rutas[g]), MODO_MEDIR, lote)) {
      for (let j = 0; j < resto.length; j++) {
        if (lote.est[j] === 1) medida[resto[j]] = { bytes: lote.tam[j], mtime: lote.mtm[j] };
      }
      diag.medidasGrupo += resto.length;
      medirDecidioGrupo = true;
      return medida;
    }
  }
  for (const i of resto) {
    try {
      const st = statSync(join(raiz, rutas[i]));
      medida[i] = { bytes: st.size, mtime: Math.round(st.mtimeMs) };
    } catch {
      medida[i] = null;
    }
  }
  diag.medidasSerie += resto.length;
  return medida;
}

/** CONTENIDO de los candidatos, en el orden recibido. Lo ilegible se omite. */
function leerArchivos(raiz: string, candidatos: Candidato[]): FicheroLeido[] {
  const n = candidatos.length;
  const leido: Array<string | null> = new Array(n).fill(null);
  const ilegible: boolean[] = new Array(n).fill(false);
  if (n === 0) return [];
  const total = candidatos.reduce((a, c) => a + c.bytes, 0);
  // v1.84.1 — si MEDIR ya comprobó que este disco cobra caro cada operación,
  // la herencia salta el muestreo: cero aperturas de prueba, grupo a la primera.
  const heredar = medirDecidioGrupo === true && !grupoDeshabilitado && total <= TECHO_REGION_BYTES;
  // Muestra de apertura: lo que de verdad castiga el antivirus — ahora
  // REPARTIDA por el lote (las primeras posiciones vienen calientes de la
  // pasada anterior y mentían "barato").
  const muestra = heredar ? [] : indicesDeMuestra(n, Math.min(n, MUESTRAS_LEER));
  const muestreado = new Uint8Array(n);
  const t0 = performance.now();
  for (const i of muestra) {
    muestreado[i] = 1;
    try {
      leido[i] = readFileSync(join(raiz, candidatos[i].ruta), "utf-8");
    } catch {
      ilegible[i] = true;
    }
  }
  const msPorOp = muestra.length ? (performance.now() - t0) / muestra.length : 0;
  diag.lecturasSerie += muestra.length;
  const resto: number[] = [];
  for (let i = 0; i < n; i++) if (!muestreado[i]) resto.push(i);
  if (
    resto.length > 0 &&
    quererGrupo(resto.length) &&
    (heredar || grupoForzado() || msPorOp >= UMBRAL_MS_POR_OPERACION) &&
    total <= TECHO_REGION_BYTES
  ) {
    const candidatosResto = resto.map((g) => candidatos[g]);
    const lote = crearLote(resto.length, total);
    let cursor = 0;
    for (let j = 0; j < resto.length; j++) {
      lote.tam[j] = candidatosResto[j].bytes;
      lote.off[j] = cursor;
      cursor += candidatosResto[j].bytes;
    }
    if (correrLote(raiz, candidatosResto.map((c) => c.ruta), MODO_LEER, lote)) {
      let resueltas = 0;
      for (let j = 0; j < resto.length; j++) {
        const s = lote.est[j];
        if (s === 1) {
          leido[resto[j]] = decodificadorUTF8.decode(new Uint8Array(lote.sab, lote.base + lote.off[j], lote.tam[j]));
          resueltas++;
        } else if (s === 2) ilegible[resto[j]] = true;
      }
      diag.lecturasGrupo += resueltas;
    }
  }
  const ficheros: FicheroLeido[] = [];
  let enSerie = 0;
  for (let i = 0; i < n; i++) {
    let c = leido[i];
    if (c === null && !ilegible[i]) {
      try {
        c = readFileSync(join(raiz, candidatos[i].ruta), "utf-8");
        enSerie++;
      } catch {
        c = null; // ilegible: no existe para el modelo
      }
    }
    if (c !== null) ficheros.push({ ruta: candidatos[i].ruta, contenido: c });
  }
  diag.lecturasSerie += enSerie;
  return ficheros;
}

/**
 * EL RECORRIDO QUE NO ABRE NADA: rutas de todo el árbol (una sola llamada por
 * carpeta) y tamaño/mtime de los archivos que alimentan el modelo. La huella se
 * arma acá, así que un cache `hit` no cuesta ni una apertura de contenido.
 */
function huellaDelArbol(raiz: string): HuellaDelArbol {
  const entradas: string[] = [];
  const candidatas: string[] = [];
  const soloRutaDirs: string[] = [];
  const pila: string[] = [""];
  while (pila.length > 0) {
    const sub = pila.pop() as string;
    let entradasDir: Array<{ nombre: string; dir: boolean; file: boolean }> = [];
    try {
      // v1.56.8 — `withFileTypes` evita un `statSync` por entrada para saber si
      // era carpeta. v1.71.1 — y el `statSync` que queda solo se paga para los
      // archivos que el modelo lee: del resto vale más su ruta (que viene gratis
      // en el listado) que su tamaño, porque dentro de un .md, un .png o un
      // lockfile el retrato no mira. Se conserva el orden alfabético de antes.
      entradasDir = readdirSync(join(raiz, sub), { withFileTypes: true })
        .map((d) => ({ nombre: d.name, dir: d.isDirectory(), file: d.isFile() }))
        .sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
    } catch {
      continue;
    }
    for (const it of entradasDir) {
      const rel = sub ? `${sub}/${it.nombre}` : it.nombre;
      let esDir = it.dir;
      let esFile = it.file;
      if (!esDir && !esFile) {
        // Enlace simbólico u otro tipo: se resuelve como antes (`statSync` sigue
        // el enlace) para no cambiar qué entra a la huella en árboles con enlaces.
        let sst;
        try {
          sst = statSync(join(raiz, rel));
        } catch {
          continue;
        }
        esDir = sst.isDirectory();
        esFile = sst.isFile();
      }
      if (esDir) {
        if (it.nombre.startsWith(".") || IGNORADOS.has(it.nombre)) continue;
        pila.push(rel);
        continue;
      }
      if (!esFile) continue;
      // NUNCA_LEER es la aduana de secretos y de lockfiles: `.env*` jamás se
      // lee (ni siquiera .env.example), y los lockfiles se cuentan pero no se
      // abren — pesan 200 KB y no aportan nada que las rutas no digan ya.
      if (!LEIBLES.has(extensionDe(it.nombre)) || NUNCA_LEER.test(rel)) {
        entradas.push(rel);
        continue;
      }
      // v1.97.3 — SOLO_RUTA: la ruta se cuenta y entra a la huella (si aparece
      // o desaparece un archivo ahí, el modelo se recalcula), pero NO se mide
      // ni se abre su contenido (razón medida en la definición de SOLO_RUTA).
      const top = rel.split("/")[0];
      if (SOLO_RUTA.has(top)) {
        entradas.push(rel);
        if (!soloRutaDirs.includes(top)) soloRutaDirs.push(top);
        continue;
      }
      candidatas.push(rel);
    }
  }
  const medidas = medirArchivos(raiz, candidatas);
  const candidatos: Candidato[] = [];
  let parcial = false;
  for (let i = 0; i < candidatas.length; i++) {
    const m = medidas[i];
    if (!m) continue; // ilegible hasta para medir: no existe para el retrato
    entradas.push(`${candidatas[i]}|${m.bytes}|${m.mtime}`);
    if (m.bytes > MAX_BYTES_POR_ARCHIVO) continue; // se cuenta, no se abre
    if (candidatos.length >= MAX_ARCHIVOS) {
      parcial = true;
      continue;
    }
    candidatos.push({ ruta: candidatas[i], bytes: m.bytes });
  }
  let git = "";
  try {
    git = readFileSync(join(raiz, ".git/HEAD"), "utf-8").trim().split("\n")[0] || "";
  } catch {
    git = "(sin-git)";
  }
  // La salud de dependencias se calcula contra node_modules: si node_modules
  // aparece o desaparece, la huella cambia y el modelo se recalcula — nada de
  // informar «sin instalar» sobre un proyecto que ya instaló a media sesión.
  const instalados = existsSync(join(raiz, "node_modules")) ? "nm" : "sin-nm";
  const huella = djb2(`${entradas.sort().join(";")}\u0000${git}\u0000${instalados}`);
  soloRutaDirs.sort();
  return { entradas, huella, candidatos, parcial, soloRutaDirs };
}

const cache = new Map<string, { huella: string; contexto: ContextoProyecto }>();

/**
 * EL MODELO CON DISCO Y CACHE: recalcula SOLO si la huella del árbol cambió
 * (paths+tamaños+mtimes+git HEAD). `cacheado` dice la verdad de dónde salió.
 * Con la huella intacta no se abre NI UN contenido: el retrato del turno
 * anterior es el retrato de este turno (v1.71.1).
 */
export function contextoProyecto(raiz: string = process.cwd()): ContextoProyecto {
  const absoluto = raiz;
  // v1.84.1 — diagnóstico opt-in: `CEREBRONICO_PERFIL=1` imprime por dónde se
  // fue el tiempo. En el rojo de reloj de Windows con antivirus la pregunta
  // siempre fue «¿cuánto cobra el disco y cuánto el CPU?»; sin medirla en la
  // máquina del usuario, cualquier tope es una conjetura. Silencioso por defecto.
  const perf = process.env.CEREBRONICO_PERFIL === "1" ? { t: performance.now(), partes: [] as string[] } : null;
  const marca = (nombre: string) => {
    if (!perf) return;
    const ahora = performance.now();
    perf.partes.push(`${nombre}=${Math.round(ahora - perf.t)}ms`);
    perf.t = ahora;
  };
  const arbol = huellaDelArbol(absoluto);
  marca("huella+medir");
  const previo = cache.get(absoluto);
  if (previo && previo.huella === arbol.huella) {
    if (perf) console.error(`[motorContexto·perfil] CACHE ✔ ${perf.partes.join(" ")} (candidatos=${arbol.candidatos.length})`);
    return { ...previo.contexto, cacheado: true };
  }
  const ficheros = leerArchivos(absoluto, arbol.candidatos);
  marca("leer");
  const hayInstalado = (paquete: string): boolean => {
    try {
      return existsSync(join(absoluto, "node_modules", ...paquete.split("/")));
    } catch {
      return false;
    }
  };
  // UN solo barrido de contenido para las dos vistas. Antes el mismo texto se
  // rastreaba tres veces con las mismas cuatro expresiones: una en
  // `paquetesFaltantes`, otra en `declaradosSinInstalar` y otra por archivo
  // dentro de `construirGrafo`. Mismo resultado, un tercio del trabajo.
  const paquetesPorArchivo = paquetesExternosPorArchivo(
    ficheros.filter((f) => RASTRABLES_UNION.test(f.ruta)).map((f) => ({ path: f.ruta, content: f.contenido }))
  );
  marca("paquetes");
  const rutasTodas = arbol.entradas.map((e) => e.split("|")[0]);
  const leidas = new Set(ficheros.map((f) => f.ruta));
  const modelo = modelarProyecto(ficheros, {
    raiz: absoluto,
    hayInstalado,
    rutasAdicionales: rutasTodas.filter((r) => !leidas.has(r)),
    paquetesPorArchivo,
    carpetasSoloRuta: arbol.soloRutaDirs,
  });
  marca("modelo");
  modelo.parcial = arbol.parcial;
  const grafo = construirGrafo(
    ficheros.map((f) => ({ path: f.ruta, content: f.contenido })),
    { paquetesPorArchivo }
  );
  marca("grafo");
  if (perf) {
    const e = diag;
    console.error(
      `[motorContexto·perfil] ${perf.partes.join(" ")} | archivos=${ficheros.length}/${arbol.candidatos.length}` +
        ` grupo(medir=${e.medidasGrupo},leer=${e.lecturasGrupo}) serie(medir=${e.medidasSerie},leer=${e.lecturasSerie})` +
        ` hilos=${e.ultimosHilos} ms/op=${e.msPorOperacion.toFixed(2)} heredado=${medirDecidioGrupo === true}`
    );
  }
  const contexto: ContextoProyecto = { modelo, grafo, huella: arbol.huella, cacheado: false, parcial: arbol.parcial };
  cache.set(absoluto, { huella: arbol.huella, contexto });
  return contexto;
}

/** Para pruebas y para el proceso que quiera empezar limpio. */
export function reiniciarCacheDeContexto(): void {
  cache.clear();
}

// ════════════════════════════════════════════════════════════════════════════
// RESÚMENES Y NIVELES
// ════════════════════════════════════════════════════════════════════════════

/** L3: el retrato del proyecto en líneas cortas — lo que el modelo debe saber. */
export function resumoDelModelo(m: ModeloProyecto): string {
  const partes = [
    `archivos: ${m.archivosTotales}${m.parcial ? " (escaneo PARCIAL por tope)" : ""} · líneas: ${m.lineasTotales}`,
    `stack: ${m.stack.length ? m.stack.join(", ") : "(sin package.json reconocible)"}${!m.packageJson ? " · ⚠ sin package.json (stack deducido de archivos)" : ""}`,
    `gestor: ${m.gestor ?? "?"}`,
    ...(m.carpetasSoloRuta.length
      ? [`solo-ruta: ${m.carpetasSoloRuta.join(", ")} (contadas, sin contenido leído)`]
      : []),
    `entradas: ${m.entrypoints.length ? m.entrypoints.join(", ") : "—"}`,
    `servicios: ${m.servicios.length ? m.servicios.join(", ") : "—"}`,
    `puertos detectados: ${m.puertos.length ? m.puertos.join(", ") : "—"}`,
    `tests: ${m.tests.archivos} archivos${m.tests.comandos.length ? ` · ${m.tests.comandos[0]}` : ""}`,
  ];
  if (m.dependencias.faltantes.length) partes.push(`⚠ dependencias usadas y NO declaradas: ${m.dependencias.faltantes.join(", ")}`);
  if (m.dependencias.declaradasSinInstalar.length) partes.push(`⚠ declaradas sin instalar: ${m.dependencias.declaradasSinInstalar.join(", ")}`);
  return partes.join("\n");
}

/** L2: el impacto de cada archivo tocado, una línea por archivo. */
export function resumenDeImpacto(grafo: GrafoProyecto, archivos: string[], saltos = 1): string {
  const lineas: string[] = [];
  for (const a of archivos.slice(0, 12)) {
    const imp = impactoDe(grafo, a, saltos);
    const rompen = imp.total === 0 ? "nadie (hoja)" : `${imp.directa.join(", ")}${imp.transitiva.length ? ` (+${imp.transitiva.length} al 2º salto)` : ""}`;
    lineas.push(`  ${imp.ruta} → si cambia, lo sienten: ${rompen}`);
  }
  return lineas.join("\n");
}

export const LIMITE_CONTEXTO_CARACTERES = 6000;

/** Techos por nivel (caracteres). La jerarquía ES el presupuesto. */
export const TECHOS_NIVEL: Record<number, number> = { 0: 500, 1: 2600, 2: 1200, 3: 1400, 4: 1000, 5: 800 };

export interface CapaContexto {
  nivel: 0 | 1 | 2 | 3 | 4 | 5;
  etiqueta: string;
  texto: string;
}

export interface ContextoEnsamblado {
  capas: CapaContexto[];
  texto: string;
  caracteres: number;
  presupuesto: number;
  /** Niveles que se quedaron fuera por presupuesto (nunca L0/L1). */
  recortadas: number[];
  /** Si L5 entró o fue vetado por estar L1/L4 resueltos. */
  l5BloqueadoPorResolucion: boolean;
}

export interface InsumoContexto {
  objetivo: string;
  /** L1: rutas que la tarea toca. */
  archivosTocados?: string[];
  /** L1: contenido (o extractos) de esos archivos, leído por quien llama. */
  contenidoAfectado?: string;
  /** L2+L3: el contexto del proyecto (disco/cache). */
  contexto?: ContextoProyecto;
  /** L4: memoria/historial pertinente, en texto. */
  memoria?: string;
  /** L5: conocimiento general; solo se usa si L1 y L4 están vacíos. */
  conocimiento?: string;
  limiteCaracteres?: number;
}

function recorte(texto: string, techo: number): string {
  const t = (texto || "").trim();
  if (!t) return "";
  return t.length <= techo ? t : `${t.slice(0, techo - 3)}…`;
}

/**
 * EL ENSAMBLE: arma el bloque de contexto respetando la jerarquía L0→L5 y el
 * presupuesto. Reglas duras de la hoja de ruta implementadas acá:
 *   · L0 nunca se recorta (es la tarea);
 *   · L5 NO entra si L1 o L4 ya resuelven (hay archivos afectados o memoria);
 *   · lo que no cabe se registra en `recortadas` — el hambre es auditable.
 */
export function ensamblarContexto(insumo: InsumoContexto): ContextoEnsamblado {
  const presupuesto = insumo.limiteCaracteres ?? LIMITE_CONTEXTO_CARACTERES;
  const crudos: Array<{ nivel: CapaContexto["nivel"]; etiqueta: string; texto: string }> = [
    { nivel: 0, etiqueta: "L0 · OBJETIVO", texto: insumo.objetivo ?? "" },
    { nivel: 1, etiqueta: "L1 · ARCHIVOS AFECTADOS", texto: insumo.contenidoAfectado ?? "" },
    {
      nivel: 2,
      etiqueta: "L2 · DEPENDENCIAS E IMPACTO",
      texto: insumo.contexto && insumo.archivosTocados?.length
        ? resumenDeImpacto(insumo.contexto.grafo, insumo.archivosTocados)
        : "",
    },
    { nivel: 3, etiqueta: "L3 · ARQUITECTURA", texto: insumo.contexto ? resumoDelModelo(insumo.contexto.modelo) : "" },
    { nivel: 4, etiqueta: "L4 · MEMORIA", texto: insumo.memoria ?? "" },
    { nivel: 5, etiqueta: "L5 · CONOCIMIENTO GENERAL", texto: insumo.conocimiento ?? "" },
  ];

  const l5Bloqueado = !!(insumo.contenidoAfectado?.trim() || insumo.memoria?.trim());
  const capas: CapaContexto[] = [];
  const recortadas: number[] = [];
  let restantes = presupuesto;

  for (const c of crudos) {
    let texto = recorte(c.texto, TECHOS_NIVEL[c.nivel]);
    if (!texto) continue;
    if (c.nivel === 5 && l5Bloqueado) {
      recortadas.push(5);
      continue;
    }
    // El presupuesto es contra el TEXTO FINAL: la etiqueta también come
    // ("— L1 · … —\n" + separación). Contarlo solo por cuerpo dejaba
    // ensamblados de 644 para un límite de 600 — hambre maquillada.
    const sobre = c.etiqueta.length + 6;
    const costo = texto.length + sobre;
    if (costo > restantes) {
      if (c.nivel <= 1) {
        const disponible = restantes - sobre;
        texto = disponible > 60 ? `${texto.slice(0, disponible - 1)}…` : "";
        if (!texto) {
          recortadas.push(c.nivel);
          continue;
        }
        capas.push({ nivel: c.nivel, etiqueta: c.etiqueta, texto });
        restantes -= texto.length + sobre;
      } else {
        recortadas.push(c.nivel);
      }
      continue;
    }
    capas.push({ nivel: c.nivel, etiqueta: c.etiqueta, texto });
    restantes -= costo;
  }

  const texto = capas.map((c) => `— ${c.etiqueta} —\n${c.texto}`).join("\n\n");
  return {
    capas,
    texto,
    caracteres: texto.length,
    presupuesto,
    recortadas,
    l5BloqueadoPorResolucion: l5Bloqueado,
  };
}

/**
 * EL HAMBRE, EN UNA LÍNEA LEGIBLE (v1.58.5 · C4).
 * `ensamblarContexto` ya registra en `recortadas` qué niveles quedaron fuera por
 * presupuesto, pero ese dato era un `number[]` crudo. Esta nota lo vuelve una
 * frase honesta para el acta/panel: cuánto de los caracteres disponibles se usó
 * y qué capas se sacrificaron (y si L5 fue vetado por tener L1/L4 ya resueltos,
 * que NO es hambre sino la regla de jerarquía). Puro: solo lee el ensamblado,
 * no vuelve a medir el disco. Si nada se recortó, lo dice tal cual.
 */
export function resumenRecorteContexto(ens: ContextoEnsamblado): string {
  const uso = `contexto ${ens.caracteres}/${ens.presupuesto} car.`;
  const porPresupuesto = ens.recortadas.filter((n) => !(n === 5 && ens.l5BloqueadoPorResolucion));
  const partes: string[] = [uso];
  if (porPresupuesto.length) {
    partes.push(`recortado por presupuesto: ${porPresupuesto.map((n) => `L${n}`).join(", ")}`);
  }
  if (ens.l5BloqueadoPorResolucion && ens.recortadas.includes(5)) {
    partes.push("L5 (conocimiento general) vetado: L1/L4 ya resuelven");
  }
  if (partes.length === 1) partes.push("sin recortes: todo lo pertinente entró");
  return partes.join(" · ");
}

/**
 * LA NOTA que ordenDeObra añade a la directiva de cada turno: el retrato en
 * ≤900 caracteres, desde la cache. Nunca lanza: si el disco se comporta mal,
 * el turno sigue con la lista sola (la obra no para por un retrato).
 */
export function notaDeContexto(raiz: string = process.cwd()): string {
  try {
    const ctx = contextoProyecto(raiz);
    const m = ctx.modelo;
    const hubs = hubsDelGrafo(ctx.grafo, 3).map((h) => `${h.ruta}(${h.importadores})`).join(", ") || "—";
    const lineas = [
      "[CONTEXTO DEL PROYECTO · motorContexto v1.31]",
      `stack: ${m.stack.join(", ") || "—"}${m.packageJson ? "" : " · ⚠ sin package.json"} · gestor: ${m.gestor ?? "?"} · ${m.archivosTotales} archivos · ${m.lineasTotales} líneas${m.parcial ? " · ESCANEO PARCIAL" : ""}`,
      `entradas: ${m.entrypoints.join(", ") || "—"} · servicios: ${m.servicios.slice(0, 4).join(", ") || "—"} · puertos: ${m.puertos.join(", ") || "—"}`,
      `tests: ${m.tests.archivos} archivos${m.tests.comandos[0] ? ` · ${m.tests.comandos[0].slice(0, 80)}` : ""}`,
      m.dependencias.faltantes.length ? `⚠ usan paquete no declarado: ${m.dependencias.faltantes.slice(0, 8).join(", ")}` : "",
      `${grafoAParte(ctx.grafo)} · hubs: ${hubs}`,
      // FASE 12 · «perfil: N aplicadas, M deshabilitadas» en el estado vivo, pedido
      // expreso del punto 5. Va acá y no en `server.ts` porque el plano dice
      // `server.ts` sin tocar y porque `notaDeContexto` ya llega al bloque de
      // conciencia cada turno. Vacío si no hay perfil: nada que decir, nada escrito.
      lineaDeEstadoPerfilParches(),
    ].filter(Boolean);
    return lineas.join("\n").slice(0, 900);
  } catch {
    return "";
  }
}
