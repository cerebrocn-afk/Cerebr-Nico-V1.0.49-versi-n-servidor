/**
 * packsMcp.ts — DE `mcp_servers.json` A HERRAMIENTAS DEL MODELO (v1.0.28)
 * ======================================================================
 *
 * `clienteMcp.ts` sabe hablar el protocolo; ESTE módulo es el que recorre el
 * archivo, arranca cada servidor activo, y lo registra como pack para que el
 * modelo lo vea.
 *
 * REGLAS QUE RESPETA:
 *   · APAGADO ES APAGADO. `enabled:false` no arranca nada y no dice nada raro:
 *     las entradas de Cloudflare vienen así a propósito (una entrada apagada no
 *     es un error, es una decisión). Al arrancar solo se informa «N apagados».
 *   · UN SERVIDOR MUDO NO CUELGA EL ARRANQUE: cada uno se abre en paralelo y su
 *     tiempo de espera viene de su propia entrada.
 *   · LO QUE FALLA SE CUENTA CON MOTIVO: «no encontrado», «salió con código 1 —
 *     <stderr>» o «sin respuesta en 30 s». Nunca un «no cargó» a secas.
 *   · NO HAY SEGUNDO INTENTO. Al contrario que los packs HTTP de `:5000`/`:5102`
 *     (que reintentan porque el servicio está arrancando solo), un servidor MCP
 *     por stdio NO se arranca solo: si falló, reintentar tres veces solo gasta
 *     tiempo en silencio.
 * v1.0.30 — ARRANQUE PEREZOSO (la propuesta v1.1.0, con las dos trampas resueltas):
 *   · Si existe `mcp_tools_cache.json` con la huella correcta de la configuración,
 *     el pack se registra con las definiciones guardadas y NO se levanta ningún
 *     proceso. El modelo ve las mismas manos; la RAM se paga solo si se usan.
 *   · El proceso se arranca en la PRIMERA llamada real y se cierra tras 60 s de
 *     inactividad (cierre en árbol). Arrancar es lo caro; cerrar es barato.
 *   · UNA LLAMADA DURANTE EL ARRANQUE NO SE PIERDE: si el proceso está
 *     levantándose, la siguiente llamada espera a ese mismo arranque en vez de
 *     lanzar un segundo proceso o contestar «no está vivo». Es el fallo típico
 *     de un perezoso mal hecho y aquí tiene una promesa compartida.
 *   · Si el servidor real contradice la caché (falla al arrancar), se dice que
 *     falló y se reintenta en la próxima llamada; NO se contesta con la caché
 *     como si estuviera vivo.
 *   · El pack se registra con las MISMAS herramientas que declaró el servidor,
 *     con el prefijo `<id>_` y `requires.network` cuando el nombre lo insinúa…
 *     no: se deja `network` a true SIEMPRE. Ver el porqué abajo.
 */

import fs from "node:fs";
import path from "node:path";
import { registerToolPack, type ToolSpec } from "./toolRegistry";
import {
  ServidorMcp,
  esquemaDelRegistro,
  estaActivo,
  inventarioDeServidor,
  leerConfiguracion,
  nombrePublico,
  type EntradaMcp,
  type HerramientaMcp,
} from "./clienteMcp";
import {
  RelojDeInactividad,
  TTL_INACTIVIDAD_MCP_MS,
  conEntrada,
  entradaValida,
  escribirCacheAtomica,
  huellaDeConfiguracion,
  leerCacheSeguro,
  respaldarCorrupto,
  serializarCache,
  ttlCacheEsquemas,
  type ArchivoCacheMcp,
  type DepsDisco,
} from "./cacheEsquemasMcp";

export interface ResultadoPacksMcp {
  cargados: Record<string, number>;
  fallidos: string[];
  apagados: string[];
  descartados: Array<{ id: string; motivo: string }>;
}

/**
 * Los servidores vivos, por id. Se guardan para (a) no relanzarlos si el
 * cargador se llama dos veces y (b) poder llamar sus herramientas.
 */
const VIVOS = new Map<string, ServidorMcp>();

/** Entradas declaradas (v1.0.30), para poder levantar una a demanda. */
const ENTRADAS = new Map<string, { entrada: EntradaMcp; raiz: string }>();

/** Arranques en curso: dos llamadas simultáneas no levantan dos procesos. */
const ARRANCANDO = new Map<string, Promise<ServidorMcp | null>>();

/** Nombre del archivo de caché de definiciones (junto a `mcp_servers.json`). */
export const ARCHIVO_CACHE_ESQUEMAS = "mcp_tools_cache.json";

/** El disco real, con la forma mínima que pide el módulo de caché (inyectable en pruebas). */
function fsDeps(): DepsDisco {
  return {
    existsSync: (p: string) => fs.existsSync(p),
    readFileSync: (p: string, enc: string) => fs.readFileSync(p, enc as BufferEncoding),
    writeFileSync: (p: string, datos: string, enc: string) => { fs.writeFileSync(p, datos, enc as BufferEncoding); },
    renameSync: (a: string, b: string) => { fs.renameSync(a, b); },
    unlinkSync: (p: string) => { fs.unlinkSync(p); },
  };
}

/** TTL de inactividad efectivo (se puede bajar por entorno para probar). */
export function ttlInactividadMcp(): number {
  const n = Number(process.env.CN_MCP_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : TTL_INACTIVIDAD_MCP_MS;
}

const RELOJ = new RelojDeInactividad(
  (id) => {
    // Inactividad cumplida: se cierra el proceso. La próxima llamada lo vuelve a
    // levantar con el mismo comando (barato porque ya sabemos que funciona).
    const s = VIVOS.get(id);
    if (s) s.cerrar();
    VIVOS.delete(id);
  },
  ttlInactividadMcp()
);

/** ¿Hay un servidor vivo AHORA? (sin levantar nada) */
export function servidorMcp(id: string): ServidorMcp | null {
  const s = VIVOS.get(id);
  return s && s.vivo ? s : null;
}

/**
 * Devuelve un servidor USABLE, levantándolo si hace falta. Es el punto por el que
 * pasa el despacho de herramientas: la primera llamada paga el arranque, las
 * siguientes no, y dos llamadas simultáneas comparten UN arranque.
 *
 * Devuelve `null` si la entrada no existe o si el arranque falló (con el motivo
 * impreso: un perezoso que falla en silencio es peor que uno que no existe).
 */
export async function asegurarServidorMcp(id: string): Promise<ServidorMcp | null> {
  const vivo = servidorMcp(id);
  if (vivo) { RELOJ.tocar(id); return vivo; }

  const enCurso = ARRANCANDO.get(id);
  if (enCurso) return enCurso;

  const dato = ENTRADAS.get(id);
  if (!dato) return null;

  const promesa = (async (): Promise<ServidorMcp | null> => {
    try {
      const { servidor, herramientas } = await inventarioDeServidor(dato.entrada, dato.raiz);
      if (herramientas.length === 0) {
        servidor.cerrar();
        console.warn(`[mcp] «${id}» arrancó pero no declara herramientas: no queda levantado.`);
        return null;
      }
      VIVOS.set(id, servidor);
      RELOJ.tocar(id);
      return servidor;
    } catch (e: any) {
      console.warn(`[mcp] «${id}» no pudo arrancar al usarse: ${e?.message || e}. Se reintenta en la próxima llamada.`);
      return null;
    } finally {
      ARRANCANDO.delete(id);
    }
  })();
  ARRANCANDO.set(id, promesa);
  return promesa;
}

/** Nombres de todos los servidores vivos (para el informe de estado). */
export function servidoresMcpVivos(): string[] {
  return [...VIVOS.entries()].filter(([, s]) => s.vivo).map(([id]) => id);
}

/**
 * ¿A qué servidor pertenece una herramienta pública? Se busca el prefijo más
 * LARGO que case: `cloudflare_docs_get_page` debe ir a `cloudflare_docs` y no a
 * un eventual `cloudflare`.
 */
export function duenioDeHerramienta(nombre: string, ids: string[]): { id: string; original: string } | null {
  const candidatos = ids
    .map((id) => ({ id }))
    .filter(({ id }) => nombre.startsWith(id.replace(/[^a-zA-Z0-9_]/g, "_") + "_"))
    .sort((a, b) => b.id.length - a.id.length);
  if (!candidatos.length) return null;
  const id = candidatos[0].id;
  return { id, original: nombre.slice(id.replace(/[^a-zA-Z0-9_]/g, "_").length + 1) };
}

/**
 * Convierte una herramienta MCP en la herramienta del registro.
 *
 * `requires.network = true` SIEMPRE — y esto es una decisión, no un atajo: los
 * servidores MCP de este archivo hablan con servicios de internet (red, docs,
 * Cloudflare). Dejar `network:false` haría que el filtro de herramientas la
 * ofreciera en un contexto sin red; `true` es el lado que falla bien (la
 * herramienta aparece y, si no hay red, falla al llamarla, con el motivo).
 */
export function herramientaDelRegistro(idServidor: string, h: HerramientaMcp, pack: string, etiqueta: string): ToolSpec {
  return {
    name: nombrePublico(idServidor, h.name),
    pack,
    description: h.description ? `${h.description} (MCP: ${etiqueta})` : `Herramienta MCP ${h.name} de ${etiqueta}`,
    parameters: esquemaDelRegistro(h.inputSchema),
    requires: { network: true },
  };
}

/**
 * Recorre el archivo y registra un pack por servidor activo que responda.
 * `recargar=true` cierra los procesos vivos y vuelve a empezar (idempotente).
 */
export async function cargarPacksMcp(
  raiz: string,
  opciones: { recargar?: boolean; archivo?: string; log?: (m: string) => void } = {}
): Promise<ResultadoPacksMcp> {
  const log = opciones.log || ((m: string) => console.log(m));
  const archivo = opciones.archivo || path.join(raiz, "mcp_servers.json");
  const res: ResultadoPacksMcp = { cargados: {}, fallidos: [], apagados: [], descartados: [] };

  if (opciones.recargar) {
    for (const [, s] of VIVOS) s.cerrar();
    VIVOS.clear();
  }

  let bruto: unknown = null;
  try {
    if (!fs.existsSync(archivo)) {
      log(`[mcp] No hay ${path.basename(archivo)}: se sigue sin servidores MCP (no es un fallo).`);
      return res;
    }
    bruto = JSON.parse(fs.readFileSync(archivo, "utf-8"));
  } catch (err: any) {
    // Un JSON roto SÍ es un fallo, y se dice con el error del parser.
    log(`[mcp] ${path.basename(archivo)} no es JSON válido: ${err?.message || err}`);
    return res;
  }

  const { servidores, descartados } = leerConfiguracion(bruto);
  res.descartados = descartados;
  for (const d of descartados) log(`[mcp] Entrada «${d.id}» ignorada: ${d.motivo}.`);

  const activos = servidores.filter((s) => estaActivo(s));
  res.apagados = servidores.filter((s) => !estaActivo(s)).map((s) => s.id);
  if (res.apagados.length) {
    log(`[mcp] ${res.apagados.length} servidor(es) apagados en la configuración: ${res.apagados.join(", ")}. No se arrancan (siguen declarados).`);
  }

  // ── v1.0.30 · ARRANQUE PEREZOSO ─────────────────────────────────────────
  // Se mira primero la caché de definiciones. Un acierto significa: mismas
  // herramientas, CERO procesos. Un fallo significa: se arranca de verdad (como
  // en v1.0.28) y se guarda lo que respondió.
  const rutaCache = path.join(raiz, ARCHIVO_CACHE_ESQUEMAS);
  let cache: ArchivoCacheMcp | null = null;
  let crudoCache: string | null = null;
  try {
    crudoCache = fs.existsSync(rutaCache) ? fs.readFileSync(rutaCache, "utf-8") : null;
    cache = leerCacheSeguro(crudoCache);
  } catch {
    cache = null; // sin permiso o ilegible: se pierde la optimización, no el arranque
  }
  // v1.0.31 · EVIDENCIA ANTES DE PISAR: si el archivo existía y no se pudo leer,
  // se guarda una copia al lado. La primera escritura lo reemplaza, y con él se
  // iría la única prueba de qué lo rompió.
  if (crudoCache && !cache) {
    const copia = respaldarCorrupto(rutaCache, crudoCache, Date.now(), fsDeps());
    if (copia) log(`[mcp] ${ARCHIVO_CACHE_ESQUEMAS} ilegible: copia guardada en ${path.basename(copia)}. Se arrancan los servidores de verdad.`);
    else log(`[mcp] ${ARCHIVO_CACHE_ESQUEMAS} ilegible y sin permiso para guardar copia: se arranca de verdad.`);
  }
  const ahora = Date.now();
  let cacheCambiada = false;

  /**
   * Persiste la caché sin poder tumbar el arranque.
   * v1.0.31 · ATÓMICA: temporal en la misma carpeta + rename con reintentos
   * (Windows devuelve EPERM/EBUSY mientras el antivirus mira el archivo recién
   * escrito). Un corte a mitad ya no puede dejar media caché válida: o está el
   * archivo viejo, o está el nuevo entero.
   */
  const guardarCache = () => {
    if (!cacheCambiada) return;
    const r = escribirCacheAtomica(rutaCache, serializarCache(cache, Date.now()), fsDeps());
    if (r.ok) {
      cacheCambiada = false;
    } else {
      log(`[mcp] No se pudo escribir ${ARCHIVO_CACHE_ESQUEMAS} (${r.error || "sin detalle"}): se seguirá arrancando los servidores de verdad.` +
        (r.rutaTemporal ? ` Temporal conservado: ${path.basename(r.rutaTemporal)}.` : ""));
    }
  };

  const sinProceso: string[] = [];

  // En paralelo: uno lento no frena a los demás.
  const resultados = await Promise.all(
    activos.map(async (e) => {
      const huella = huellaDeConfiguracion({ comando: e.comando, args: e.args, env: e.env });
      const enCache = entradaValida(cache, e.id, huella, ahora, ttlCacheEsquemas(process.env));
      if (enCache) {
        // Acierto: se registra con las definiciones guardadas y NO se arranca nada.
        return { entrada: e, servidor: null as ServidorMcp | null, herramientas: enCache.herramientas as HerramientaMcp[], error: null as Error | null, desdeCache: true };
      }
      try {
        const { servidor, herramientas } = await inventarioDeServidor(e, raiz);
        cache = conEntrada(cache, e.id, { comando: e.comando, args: e.args, env: e.env }, herramientas, ahora);
        cacheCambiada = true;
        return { entrada: e, servidor, herramientas, error: null as Error | null, desdeCache: false };
      } catch (err: any) {
        return { entrada: e, servidor: null as ServidorMcp | null, herramientas: [] as HerramientaMcp[], error: err as Error, desdeCache: false };
      }
    })
  );

  for (const r of resultados) {
    const { entrada } = r;
    if (r.error || (!r.servidor && !r.desdeCache)) {
      res.fallidos.push(entrada.id);
      log(`[mcp] Servidor «${entrada.id}» no disponible: ${r.error?.message || "sin detalle"}. Sus herramientas NO están en esta sesión.`);
      continue;
    }
    if (r.herramientas.length === 0) {
      r.servidor?.cerrar();
      res.fallidos.push(entrada.id);
      log(`[mcp] Servidor «${entrada.id}» respondió, pero no declara ninguna herramienta: no se registra.`);
      continue;
    }
    const etiqueta = entrada.label || entrada.id;
    registerToolPack({
      id: entrada.id,
      label: etiqueta,
      description: `Pack MCP (${entrada.comando})`,
      tools: r.herramientas.map((h) => herramientaDelRegistro(entrada.id, h, entrada.id, etiqueta)),
    });
    // La entrada se recuerda SIEMPRE (también en un acierto de caché): es lo que
    // permite levantar el proceso a demanda en la primera llamada real.
    ENTRADAS.set(entrada.id, { entrada, raiz });
    if (r.desdeCache) {
      sinProceso.push(entrada.id);
      res.cargados[entrada.id] = r.herramientas.length;
      log(
        `[mcp] «${entrada.id}» declarado con ${r.herramientas.length} herramienta(s) desde caché (sin arrancar proceso; ` +
        `se levanta al primer uso): ` + r.herramientas.map((h) => nombrePublico(entrada.id, h.name)).sort().join(", ")
      );
    } else {
      VIVOS.set(entrada.id, r.servidor as ServidorMcp);
      RELOJ.tocar(entrada.id);
      res.cargados[entrada.id] = r.herramientas.length;
      log(
        `[mcp] «${entrada.id}» en línea con ${r.herramientas.length} herramienta(s): ` +
        r.herramientas.map((h) => nombrePublico(entrada.id, h.name)).sort().join(", ")
      );
    }
  }
  guardarCache();
  if (sinProceso.length) {
    log(`[mcp] ${sinProceso.length} servidor(es) no ocupan proceso hasta que se usen (perezoso): ${sinProceso.join(", ")}.`);
  }
  return res;
}

/** Cierra todos los servidores MCP (apagado de la IDE o recarga completa). */
export function cerrarTodosMcp(): void {
  for (const [, s] of VIVOS) s.cerrar();
  VIVOS.clear();
  // v1.0.30: un reloj de inactividad pendiente no debe quedar apuntando a un
  // servidor que ya no existe.
  RELOJ.soltarTodos();
}
