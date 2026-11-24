/**
 * grafoProyecto.ts — EL GRAFO MÍNIMO: QUIÉN IMPORTA A QUIÉN (v1.31.0 · FASE 1)
 * ============================================================================
 * QUÉ ES: el núcleo del Project Graph pedido en la hoja de ruta (§2), en su
 * versión mínima honesta para esta fase: nodos = archivos reales, aristas =
 * «importa» (resueltas con la MISMA lógica del verificador de imports) y
 * «usa_paquete» (con la MISMA extracción de dependencias externas que usa el
 * puente de dependencias). Nada de «llama», «sirve» o «comparte contrato»:
 * eso es FASE 6; prometerlo hoy sería tinta, no mecánica.
 *
 * POR QUÉ EXISTE: la hoja de ruta dice que el agente debe pasar de preguntar
 * «¿dónde está esto?» a saber «esto vive aquí, depende de esto, y modificarlo
 * puede afectar estas cuatro cosas». Las «cuatro cosas» se calculan, no se
 * adivinan: impactoDe() responde «si modifico X, ¿quién me lo va a agradecer y
 * quién me lo va a reclamar?» leyendo el disco, sin modelo, sin red.
 *
 * FUENTE ÚNICA (regla de la casa, sin verdades duplicadas):
 *   · la extensión/index de un import la resuelve importChecker
 *     (resolverRutaImport), NO se reimplementa aquí.
 *   · qué es paquete instalable y qué es ruta local lo decide
 *     dependenciasProyecto (extraerPaquetesExternos), NO se reimplementa aquí.
 *
 * Es lógica PURA: recibe {path, content}, devuelve mapas. El que lee el disco
 * es motorContexto. Se prueba con tests/grafoProyecto.test.ts.
 */

import {
  extraerImportsRelativos,
  normalizarRutaImport,
  resolverRutaImport,
  type CheckFile,
} from "./importChecker";
import { extraerPaquetesExternos } from "./dependenciasProyecto";

// ════════════════════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════════════════════

export type TipoArista = "importa" | "usa_paquete";

export interface Arista {
  /** Ruta normalizada del archivo de origen. */
  desde: string;
  /** Ruta normalizada del destino (arista «importa») o nombre del paquete. */
  hacia: string;
  tipo: TipoArista;
}

export interface GrafoProyecto {
  /** Todos los nodos-archivo (rutas normalizadas), ordenados. */
  nodos: string[];
  /** Aristas deduplicadas. */
  aristas: Arista[];
  /** archivo → archivos que ÉL importa. */
  salientes: Map<string, string[]>;
  /** archivo → archivos que LO importan (la dirección del impacto). */
  entrantes: Map<string, string[]>;
  /** archivo → paquetes externos que usa. */
  paquetes: Map<string, string[]>;
}

// ════════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN
// ════════════════════════════════════════════════════════════════════════════

/** Archivos cuyo contenido se rastrea para aristas (el resto solo es nodo). */
const RASTRABLES = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|html|py)$/i;

function pushUnico(mapa: Map<string, string[]>, clave: string, valor: string): void {
  const lista = mapa.get(clave);
  if (!lista) mapa.set(clave, [valor]);
  else if (!lista.includes(valor)) lista.push(valor);
}

/**
 * Construye el grafo desde una lista de archivos con contenido. Tolerante:
 * un import que no resuelve (archivo inexistente) NO crea arista ni revienta —
 * ese caso ya lo denuncia importChecker/findMissingImports por su cuenta.
 */
export function construirGrafo(
  ficheros: CheckFile[],
  opts: {
    /**
     * Paquetes por archivo ya barridos (v1.71.1). Cuando el que llama ya los
     * calculó —el motor de contexto los necesita para el retrato— se reutilizan
     * en vez de pasar las cuatro regex otra vez por todo el contenido. La
     * EXTRACCIÓN sigue siendo de `dependenciasProyecto`: solo se evita repetirla.
     */
    paquetesPorArchivo?: Map<string, string[]>;
  } = {}
): GrafoProyecto {
  const existentes = new Set<string>();
  for (const f of ficheros) existentes.add(normalizarRutaImport(f.path));

  const salientes = new Map<string, string[]>();
  const entrantes = new Map<string, string[]>();
  const paquetes = new Map<string, string[]>();
  const vistas = new Set<string>();
  const aristas: Arista[] = [];

  const addArista = (desde: string, hacia: string, tipo: TipoArista): void => {
    if (hacia === desde && tipo === "importa") return; // autoimportación: ruido
    const clave = `${desde}|${tipo}|${hacia}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    aristas.push({ desde, hacia, tipo });
    if (tipo === "importa") {
      pushUnico(salientes, desde, hacia);
      pushUnico(entrantes, hacia, desde);
    } else {
      pushUnico(paquetes, desde, hacia);
    }
  };

  for (const f of ficheros) {
    const origen = normalizarRutaImport(f.path);
    const contenido = f.content ?? "";
    if (!RASTRABLES.test(f.path)) continue;

    // Aristas file → file (importa/export-from/dinámico/require relativos).
    for (const spec of extraerImportsRelativos(contenido)) {
      const destino = resolverRutaImport(f.path, spec, existentes);
      if (destino) addArista(origen, destino, "importa");
    }

    // Aristas file → paquete (la extracción oficial, por archivo).
    const paquetesDelArchivo = opts.paquetesPorArchivo
      ? opts.paquetesPorArchivo.get(f.path) ?? []
      : extraerPaquetesExternos([{ path: f.path, content: contenido }]);
    for (const pkg of paquetesDelArchivo) {
      addArista(origen, pkg, "usa_paquete");
    }
  }

  return {
    nodos: [...existentes].sort(),
    aristas,
    salientes,
    entrantes,
    paquetes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CONSULTAS
// ════════════════════════════════════════════════════════════════════════════

export function esNodo(g: GrafoProyecto, ruta: string): boolean {
  return g.nodos.includes(normalizarRutaImport(ruta));
}

/** Qué importa este archivo (aristas salientes «importa»). */
export function dependenciasDirectas(g: GrafoProyecto, ruta: string): string[] {
  return [...(g.salientes.get(normalizarRutaImport(ruta)) ?? [])];
}

/** Quién importa este archivo (aristas entrantes — los primeros afectados). */
export function importadoresDirectos(g: GrafoProyecto, ruta: string): string[] {
  return [...(g.entrantes.get(normalizarRutaImport(ruta)) ?? [])];
}

/** Paquetes externos que usa este archivo. */
export function paquetesDe(g: GrafoProyecto, ruta: string): string[] {
  return [...(g.paquetes.get(normalizarRutaImport(ruta)) ?? [])].sort();
}

export interface ImpactoResumen {
  ruta: string;
  /** Quienes lo importan a 1 salto. */
  directa: string[];
  /** Quienes lo alcanzan entre 2 y `saltos` (excluye la directa). */
  transitiva: string[];
  saltos: number;
  /** directa + transitiva (lo que «se puede romper» si esto cambia). */
  total: number;
}

/**
 * «Si modifico esto, ¿qué puedo romper?» — búsqueda hacia atrás por las
 * aristas entrantes, a prueba de ciclos (un visitado por nivel lo corta).
 * `saltos` 1 = solo importadores directos; por defecto 2 porque la práctica
 * (v1.29: el chat→plan tocaba App desde main) muestra que el segundo salto
 * casi siempre importa.
 */
export function impactoDe(g: GrafoProyecto, ruta: string, saltos = 2): ImpactoResumen {
  const origen = normalizarRutaImport(ruta);
  const visitado = new Set<string>([origen]);
  const directa: string[] = [];
  const transitiva: string[] = [];
  let frontera = [origen];
  for (let nivel = 1; nivel <= Math.max(1, saltos); nivel++) {
    const siguiente: string[] = [];
    for (const nodo of frontera) {
      for (const dep of g.entrantes.get(nodo) ?? []) {
        if (visitado.has(dep)) continue;
        visitado.add(dep);
        (nivel === 1 ? directa : transitiva).push(dep);
        siguiente.push(dep);
      }
    }
    frontera = siguiente;
  }
  return {
    ruta: origen,
    directa,
    transitiva,
    saltos,
    total: directa.length + transitiva.length,
  };
}

/**
 * Los hubs: archivos con más importadores. Sirven al resumen de contexto
 * (L3) para decirle al motor dónde NO hay que pisar sin leer antes.
 */
export function hubsDelGrafo(g: GrafoProyecto, max = 3): Array<{ ruta: string; importadores: number }> {
  const contados: Array<{ ruta: string; importadores: number }> = [];
  for (const [ruta, lista] of g.entrantes) contados.push({ ruta, importadores: lista.length });
  return contados
    .sort((a, b) => b.importadores - a.importadores || a.ruta.localeCompare(b.ruta))
    .slice(0, max)
    .filter((h) => h.importadores > 0);
}

/** Una línea para el log/acta: tamaño real del grafo, sin adornos. */
export function grafoAParte(g: GrafoProyecto): string {
  const imp = g.aristas.filter((a) => a.tipo === "importa").length;
  const pkg = g.aristas.filter((a) => a.tipo === "usa_paquete").length;
  return `grafo: ${g.nodos.length} nodos · ${imp} aristas importa · ${pkg} usa_paquete`;
}
