/**
 * embedderCerebro.ts — EL EMBEDDER DEL CEREBRO, RESUELTO POR RESIDENCIA (v1.98.0)
 * ==============================================================================
 * EL DEFECTO QUE CIERRA (log de Mario, 31/10, una línea por turno):
 *   🧠 cerebro: fallback por palabra (tiempo-excedido: el embedder pasó la ventana de 5000 ms)
 * La pestaña Puertos decía por qué: en el disco del usuario viven
 * `snowflake-arctic-embed:22m` y `all-minilm:22m`, y el código pedía
 * `embeddinggemma`. Pedir lo que no está descargado no es un 404 barato: es una
 * carga desde adentro de la ventana de 5 s, y como al expirar se tiraba todo el
 * trabajo, la deuda nunca bajaba. Cinco segundos muertos por turno, para siempre.
 *
 * ESTE MÓDULO ES EL CABLE, NO EL MOTOR:
 *   · lee qué tiene Ollama (`/api/tags`) y qué está cargado (`/api/ps`, con la
 *     muestra de 5 s que ya tiene `ollamaBajoConsumo`) y le pasa las listas a
 *     `embedderResidencia`, que es la que decide (pura, probada en seco);
 *   · cachea la decisión 30 s — no se le pregunta a Ollama en cada turno — y si
 *     Ollama no responde, se queda con la última decisión buena antes que con
 *     ninguna;
 *   · si NO hay embedder, falla YA: devolver el motivo sin gastar la ventana
 *     es la diferencia entre «un turno honesto por palabra» y «cinco segundos
 *     de nada».
 *
 * Y EXPONE lo que antes sólo se veía si uno leía el código: `GET
 * /api/cerebro/embedder` responde qué modelo se usa, por qué, cuántas entradas
 * tienen vector y qué hizo la última pasada de calentamiento. `POST
 * .../calentar` corre una pasada a pedido (el botón del panel).
 *
 * MONTAJE: el monolito importa, monta y usa `cerebroEmbedder.embed`. La lógica
 * vive acá y la decisión en el motor, por el trinquete de `contrato-rutas.json`.
 */
import type express from "express";
import type { Request, Response } from "express";
import { embedCerebroLocal } from "../../src/engine/embedderLocal";
import {
  resolverEmbedder,
  EMBEDDER_RECOMENDADO,
  MAX_CUERPOS_POR_PASADA,
  POR_LOTE_POR_DEFECTO,
  type ResolucionEmbedder,
  type Tamanos,
} from "../../src/engine/embedderResidencia";
import { declaradosDesde } from "../../src/engine/aduanaModelos"; // v2.3.2 · CN_EMBEDS_EXTRA / CN_CHAT_EXTRA
import { calentarVectores, estadoCalentamiento, estadoVectores, type ResultadoCalentado } from "../../src/engine/cerebroOrgano";
import { clavesVectores, aprender, cargarIndice } from "../../src/engine/cerebroOrgano";
import { reflejoDeSemilla, type SemillaEntrada } from "../../src/engine/cerebroSemilla";
// v1.99.5 · EL ARRAIGO: el plano dice qué plantar y con qué asiento; acá se lee el disco y se
// escribe por la única puerta que existe (`aprender`).
import { planDeArraigo, sentarseEnIndice, resumenDeArraigo, type RaizSemilla } from "../../src/engine/arraigo";
import { HEMISFERIO_IZQUIERDO, HEMISFERIO_DERECHO } from "../../src/engine/hemisferios";
import { IDE_BRAND } from "../../src/constants";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { sondearOllamaPs } from "../ollamaBajoConsumo";
// v2.3.4 · cuando `/api/tags` no contesta (recorre 40+ manifiestos y uno pesa 62 GB),
// se pregunta por el modelo concreto con `/api/show`: 2,4 s medidos frente a 12-37 s.
import { sondearEmbedderDirecto } from "../../src/engine/sondeoEmbedderDirecto";

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_EMBEDDER_CEREBRO = ["GET /api/cerebro/embedder", "POST /api/cerebro/embedder/calentar"] as const;

/** Cada cuánto se le vuelve a preguntar a Ollama qué tiene descargado. */
export const TTL_RESOLUCION_MS = 30_000;
/**
 * Cuánto espera el sondeo de `/api/tags` antes de declarar «no sé».
 *
 * v2.3.3 · ESTABA EN 12.000 Y ERA EL DEFECTO, no la red de seguridad. Medido en
 * esta máquina (8/11): `GET /api/tags` responde **HTTP 200 en 21,5 s** con 40+
 * modelos en el almacén. El motor cortaba a los 12 s, el sondeo devolvía
 * `leyenda: "fallo"`, y el panel pintaba «sin embedder · sin-medir» con
 * `snowflake-arctic-embed:33m` **presente en el disco** (verificado: el tag `33m`
 * existe en `~/.ollama/models/manifests/.../snowflake-arctic-embed/`).
 *
 * El mensaje era honesto («NO se puede afirmar que falte un modelo») pero inútil:
 * el reflejo quedaba en 0% por un timeout, no por falta de modelo. 30 s cubre el
 * caso medido con margen; `CN_EMBED_TAGS_TIMEOUT_MS` permite ajustarlo sin
 * recompilar (un almacén más grande o un disco lento pueden necesitar más).
 */
const TIMEOUT_TAGS_MS = Math.max(
  1_000,
  Math.floor(Number(process.env.CN_EMBED_TAGS_TIMEOUT_MS ?? 30_000) || 30_000),
);

export interface DepsResolutor {
  /** URL base de Ollama (OLLAMA_HOST, sin barra final). */
  ollamaUrl: string;
  /** Raíz de datos del cerebro (donde vive `vectores.json`) — el HEMISFERIO DERECHO. */
  raizDatos: string;
  /**
   * v1.99.5 · la instalación — el HEMISFERIO IZQUIERDO (`server.ts`, `src/engine`, `cerebro.md`,
   * los manuales). Sin ella el reflejo tenía una sola raíz y buscaba el código del agente dentro
   * de `C:\Cerebronico`: devolvía `nada` para piezas que están adelante del usuario, que es el
   * defecto contrario al que vine a curar. Default: el cwd, como `raizApp` en los otros routers.
   */
  raizApp?: string;
  /** Inyectables para probar el cable EN SECO (sin Ollama en la máquina que testea). */
  fetchImpl?: typeof fetch;
  ahora?: () => number;
  /** `CN_EMBED_MODEL`: la voluntad del usuario manda mientras exista en disco. */
  preferido?: string;
  /** v2.3.2 · `CN_EMBED_TECHO_MB` (0 = sin techo). Inyectable para probar. */
  techoMb?: number;
  /** v2.3.2 · `CN_EMBEDS_EXTRA` / `CN_CHAT_EXTRA`, sin parsear (coma o espacio). */
  embedsExtra?: string;
  chatExtra?: string;
  /** `CN_EMBED_STRICT=1`: acatar el preferido aunque Ollama no lo muestre. */
  estricto?: boolean;
  /**
   * v1.99.0 · `CN_EMBED_KEEP_ALIVE_MS`: cuánto deja Ollama al embedder en RAM después
   * de cada tanda. No se hereda del `OLLAMA_KEEP_ALIVE` del lanzador porque ese escalón
   * es del modelo de chat: prestado, deja vectorizando en tandas que se enfrían entre
   * lote y lote (medido en la sesión del 31/10: «Nada residente · Ollama: 0.0 GB»).
   */
  keepAliveMs?: number;
}

export interface EstadoEmbedder {
  ok: true;
  modelo: string | null;
  fuente: ResolucionEmbedder["fuente"];
  motivo: string;
  recomendado: string;
  instalados: number;
  cargados: string[];
  /** v1.99.0 · el escalón de residencia que el IDE pide para SU embedder (ms). */
  residenteMs: number;
  candidatos: ResolucionEmbedder["candidatos"];
  cerebro: { entradas: number; conVector: number; deuda: number };
  /**
   * v1.99.4 · `luz / deuda / nada` por pieza del mapa de hemisferios. La barra de arriba
   * dice "cuántos vectores hay"; ésta dice "cuántas piezas del cerebro se reflejan de
   * verdad", y por eso la NADA tiene su propio numero: sin él, un cerebro con `cerebro/`
   * vacio puede pintar una barra llena.
   */
  reflejo?: { entradas: number; eje: boolean; luz: number; deuda: number; nada: number; cobertura: string; reflejo: string };
  calentamiento: ReturnType<typeof estadoCalentamiento>;
}

export interface ResolutorEmbedder {
  /** La función que el turno le pasa a `enrutarHibrido` como `embed`. */
  embed: (textos: string[], senal?: AbortSignal) => Promise<Array<number[] | null>>;
  /** El cable de segunda fila para `enrutarHibrido` (`alCalentar`). Nunca espera. */
  alCalentar: (cuerpos: string[]) => void;
  /** Pasada de calentamiento a pedido (el botón / la orden del turno). */
  calentar: (cuerpos?: string[], opciones?: { maxCuerpos?: number; arraigar?: boolean }) => Promise<ResultadoCalentado>;
  /**
   * v1.99.5 · resumen del último arraigo (vacío si todavía nadie lo pidió). Se expone para que el
   * panel pueda decir QUÉ entró, en vez de dejar que el usuario infiera por qué subió el número.
   */
  arraigo: () => string;
  /** Qué se resolvió y cómo va el índice (lo que consume el panel). */
  estado: () => Promise<EstadoEmbedder>;
  /** Última decisión conocida, sin sondear (para logs y avisos síncronos). */
  resolucion: () => ResolucionEmbedder | null;
}

/**
 * Monta el resolutor. Se instancia UNA vez en el server y se comparte: el
 * calentador tiene una valla de reentrancia y dos calentadores con dos
 * instancias se pisarían el `vectores.json`.
 */
export function montarResolutorEmbedder(deps: DepsResolutor): ResolutorEmbedder {
  const base = String(deps.ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ahora = deps.ahora ?? (() => Date.now());
  const preferido = String(deps.preferido ?? process.env.CN_EMBED_MODEL ?? "").trim();
  // v1.99.0 · el embedder NO hereda el escalón del chat. `OLLAMA_KEEP_ALIVE=5m` del
  // lanzador está pensado para el modelo de conversación; para vectorizar en tandas
  // eso significa enfriarse entre lote y lote y volver a pagar la carga dentro de la
  // ventana corta (medido: «Nada residente · Ollama: 0.0 GB» tanda tras tanda).
  // 2 minutos cubren una pasada completa y liberan RAM antes del siguiente turno.
  const keepAliveMs = Math.max(0, Math.floor(Number(deps.keepAliveMs ?? process.env.CN_EMBED_KEEP_ALIVE_MS ?? 120_000) || 0));
  const estricto = deps.estricto ?? /^(1|true|si|sí)$/i.test(String(process.env.CN_EMBED_STRICT ?? "").trim());
  /**
   * v2.3.2 · `CN_EMBED_TECHO_MB`: a partir de este peso, el vectorizador se
   * considera caro para segundo plano. NO es `RAM_LIMITADA_GB` (esa palabra vale
   * "equipo de 8 GB" y el del usuario tiene 16): lo que se acota acá es el costo de
   * tener un modelo de embeddings residente mientras TODO el chat va a la nube.
   * 200 MB deja pasar a snowflake (67) y all-minilm (45-67) y frena a
   * qwen3-embedding (639) y a embeddinggemma (621), que es justo el cambio que el
   * usuario pidió con "usaría el embedding en segundo plano ya que consume poco".
   */
  const techoMb = Math.max(0, Math.floor(Number(deps.techoMb ?? process.env.CN_EMBED_TECHO_MB ?? 200) || 0));

  let ultima: ResolucionEmbedder | null = null;
  /** Lo que ya se dijo en consola (v2.3.2): se cuenta una vez por estado. */
  let ultimaClaveAviso = "";
  let cargadosCache: string[] = [];
  let instaladosCache = 0;
  let hasta = 0;
  // La caída de Ollama NO puede convertir cada turno en cinco segundos de nada:
  // si el sondeo falla, la ventana de re-intento se acorta a la mitad para
  // recoverear rápido, pero la decisión vieja sigue vigente mientras tanto.
  let reintentarEn = hasta - TTL_RESOLUCION_MS;

  // v2.2.8 · ANTES devolvia [] en los DOS casos: lista vacia Y sondeo fallido
  // (`catch { return [] }`). El resolutor no podia distinguirlos y afirmaba
  // "no esta descargado y no hay ningun otro" con cinco embedders instalados.
  /**
   * v2.3.2 · además de los nombres se guarda `size` (bytes), que `/api/tags`
   * siempre mandó y este archivo siempre tiró. Sin el número no existía forma de
   * preferir «el más chico que sirve»: el orden era solo reputación de familia, y
   * en el equipo del usuario eso mandaba a la RAM un vectorizador de 639 MB
   * teniendo uno de 67 MB exactamente al lado.
   */
  async function sondearTags(): Promise<{ modelos: string[]; tamanos: Tamanos; leyenda: "ok" | "fallo" }> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_TAGS_MS);
      try {
        const r = await fetchImpl(`${base}/api/tags`, { signal: ctrl.signal });
        if (!r.ok) return { modelos: [], tamanos: {}, leyenda: "fallo" };  // 500/404: "no se", no "no hay"
        const j: any = await r.json().catch(() => null);
        if (!j || !Array.isArray(j.models)) return { modelos: [], tamanos: {}, leyenda: "fallo" };
        const lista: string[] = [];
        const tamanos: Tamanos = {};
        // Sin tope ni `slice`: la lista entra COMPLETA. La valla congela que N
        // nombres adentro de la respuesta son N nombres afuera (el «49 vs 42» del
        // log quedó explicado por fecha de las dos listas, no por un recorte — pero
        // si algún día alguien pone un límite, esto se pone rojo).
        for (const m of j.models) {
          const nombre = String(m?.name || m?.model || "").trim();
          if (!nombre) continue;
          lista.push(nombre);
          const sz = Number(m?.size);
          if (Number.isFinite(sz) && sz > 0) tamanos[nombre] = sz;
        }
        return { modelos: lista, tamanos, leyenda: "ok" };
      } finally {
        clearTimeout(t);
      }
    } catch {
      return { modelos: [], tamanos: {}, leyenda: "fallo" };  // abort o rechazo: NO afirma ausencia
    }
  }

  async function resolverAhora(forzar = false): Promise<ResolucionEmbedder> {
    const t = ahora();
    if (!forzar && ultima && t < hasta) return ultima;
    if (!forzar && ultima && t < reintentarEn) return ultima;
    const [lectura, ps] = await Promise.all([
      sondearTags(),
      sondearOllamaPs({ ollamaUrl: base, fetchImpl }).catch(() => ({ vivo: false, modelos: [], residenteMb: 0, muestreadoEn: t } as any)),
    ]);
    const cargados = (ps?.modelos || []).map((m: any) => String(m?.name || "").trim()).filter(Boolean);
    const instalados = lectura.modelos;
    if (lectura.leyenda === "fallo") {
      // v2.3.4 · EL ARREGLO DE RAÍZ. `/api/tags` recorre TODOS los manifiestos del
      // almacén para calcular capacidades; con 40+ modelos y uno de 62,4 GB tarda
      // 12-37 s y a veces devuelve 500 (log del 8/11). Subir el timeout sólo hace
      // esperar medio minuto para decir lo mismo. La pregunta del embedder es UNA:
      // «¿existe este modelo?». Se responde con `/api/show` sobre el nombre exacto,
      // que NO recorre el almacén (2,4 s medidos).
      const aPreguntar = [preferido, EMBEDDER_RECOMENDADO].filter(Boolean) as string[];
      const directo = aPreguntar.length > 0
        ? await sondearEmbedderDirecto({ baseUrl: base, candidatos: aPreguntar, fetchImpl })
        : { existentes: [] as string[], tamanos: {} as Tamanos, leyenda: "fallo" as const, preguntados: 0, contestados: 0 };
      if (directo.existentes.length > 0) {
        // El modelo ESTÁ. Se resuelve con lo verificado, sin inventar el resto del
        // almacén: `instalados` lleva sólo lo que `/api/show` confirmó.
        const res = resolverEmbedder({
          instalados: directo.existentes,
          cargados,
          preferido,
          estricto,
          lectura: "ok",
          declarados: declaradosDesde(
            String(deps.embedsExtra ?? process.env.CN_EMBEDS_EXTRA ?? ""),
            String(deps.chatExtra ?? process.env.CN_CHAT_EXTRA ?? ""),
          ),
          tamanos: directo.tamanos,
          techoMb,
        });
        ultima = res;
        cargadosCache = cargados;
        instaladosCache = directo.existentes.length;
        hasta = ahora() + TTL_RESOLUCION_MS;
        reintentarEn = hasta;
        const clave = `${res.modelo || "∅"}|${res.fuente}|directo`;
        if (clave !== ultimaClaveAviso) {
          ultimaClaveAviso = clave;
          console.log(`[CerebroNico] 🧲 embedder del cerebro: «${res.modelo}» (${res.fuente}, por /api/show — /api/tags no contestó) — ${res.motivo}`);
        }
        return res;
      }
      // Ni el listado ni la pregunta directa: ahora SÍ no se puede afirmar nada.
      if (ultima?.modelo) {
        reintentarEn = ahora() + Math.max(1000, Math.floor(TTL_RESOLUCION_MS / 4));
        return ultima;
      }
      return {
        modelo: null,
        fuente: "sin-medir" as const,
        motivo:
          "no se pudo leer " + base + "/api/tags en " + TIMEOUT_TAGS_MS + " ms, y /api/show tampoco contestó por " +
          (aPreguntar.length > 0 ? aPreguntar.join(", ") : "ningún candidato") +
          ": NO se puede afirmar que falte un modelo de embeddings (preferido: " + (preferido || "ninguno") + ")",
        candidatos: [],
      };
    }
    if (instalados.length === 0 && ultima?.modelo) {
      // Ollama no respondió: NO se borra la decisión buena — se reintenta más tarde.
      reintentarEn = ahora() + Math.floor(TTL_RESOLUCION_MS / 2);
      return ultima;
    }
    const res = resolverEmbedder({
      instalados,
      cargados,
      preferido,
      estricto,
      lectura: lectura.leyenda,
      // v2.3.2 · la palabra del usuario y el costo medido. `CN_EMBEDS_EXTRA` es lo
      // único que puede decir que `L1_arctic:latest` es un embedder: renombrado,
      // ningún regex del mundo lo reconoce, y adivinarlo sería peor (el día que ese
      // alias sea un chat, la aduana miente sola).
      declarados: declaradosDesde(
        String(deps.embedsExtra ?? process.env.CN_EMBEDS_EXTRA ?? ""),
        String(deps.chatExtra ?? process.env.CN_CHAT_EXTRA ?? ""),
      ),
      tamanos: lectura.tamanos,
      techoMb,
    });
    ultima = res;
    cargadosCache = cargados;
    instaladosCache = instalados.length;
    hasta = ahora() + TTL_RESOLUCION_MS;
    reintentarEn = hasta;
    // v2.3.2 · se avisa por CAMBIO de estado, no por lectura. En el log real del
    // 3/11 la MISMA línea («⚠ sin embedder: «snowflake-arctic-embed:33m» no está
    // descargado…») aparecía ocho veces en una sesión: el TTL de 30 s caducaba y
    // cada re-lectura volvía a contar lo mismo. No era un fallo repetido: era un
    // aviso repetido, y en cantidad suficiente se lee como «todo está roto».
    const clave = `${res.modelo || "∅"}|${res.fuente}`;
    if (clave !== ultimaClaveAviso) {
      ultimaClaveAviso = clave;
      if (res.modelo) console.log(`[CerebroNico] 🧲 embedder del cerebro: «${res.modelo}» (${res.fuente}) — ${res.motivo}`);
      else console.log(`[CerebroNico] ⚠ sin embedder: ${res.motivo}`);
    }
    return res;
  }

  async function embed(textos: string[], senal?: AbortSignal): Promise<Array<number[] | null>> {
    const res = await resolverAhora();
    if (!res.modelo) {
      // Cero red, cero ventana: el motivo llega ya. `conTimeout` lo reporta como
      // error (no como tiempo-excedido), que es la verdad: no esperó a nadie.
      throw new Error(res.motivo);
    }
    return embedCerebroLocal(textos, senal, { baseUrl: base, modelo: res.modelo, fetchImpl, keepAliveMs });
  }

  async function calentar(
    cuerpos?: string[],
    opciones: { maxCuerpos?: number; arraigar?: boolean } = {},
  ): Promise<ResultadoCalentado> {
    // v1.99.5 · el botón del panel ENRAÍZA y después calienta, en ese orden: primero entran las
    // piezas al índice (si no están), después se vectorizan. El calentado tardío del arranque
    // llama SIN la bandera: escribir en la memoria del usuario sin que nadie lo pida no es
    // automatismo, es atrevimiento — y en una máquina de 8 GB además le roba el arranque.
    if (opciones.arraigar) arraigar();
    return calentarVectores(deps.raizDatos, {
      embed,
      cuerpos,
      maxCuerpos: opciones.maxCuerpos ?? MAX_CUERPOS_POR_PASADA,
      porLote: POR_LOTE_POR_DEFECTO,
    });
  }

  // ── EL ARRAIGO (v1.99.5) ─────────────────────────────────────────────────
  // La instalación: donde vive el HEMISFERIO IZQUIERDO del mapa.
  const raizApp = String(deps.raizApp || "").trim() || process.cwd();

  /** ¿La pieza está en SU mitad? NTFS ignora el caso y el mapa declara nombres leídos. */
  function existeEn(raiz: RaizSemilla, rel: string): boolean {
    const abs = join(raiz === "app" ? raizApp : deps.raizDatos, rel);
    try {
      if (existsSync(abs)) return true;
      // `guardarIndice` escribe `CEREBRO.md` y el mapa dice `cerebro.md`: en Windows es el mismo
      // archivo y contarlo como ausencia sería mentir por una mayúscula.
      const objetivo = basename(rel).toLowerCase();
      for (const f of readdirSync(dirname(abs))) if (String(f).toLowerCase() === objetivo) return true;
      return false;
    } catch {
      return false;
    }
  }

  /** El material del plan: las dos mitades del mapa + lo que el usuario escribió en el disco. */
  function material() {
    const lineasDe = (raiz: RaizSemilla, rel: string): string[] => {
      try {
        const abs = join(raiz === "app" ? raizApp : deps.raizDatos, rel);
        return existsSync(abs) ? readFileSync(abs, "utf-8").split(/\r?\n/) : [];
      } catch {
        return []; // ilegible = no entra. El plan prefiere medir menos a inventar.
      }
    };
    return {
      // LA MISMA semilla de versión para el plano y para la medición: el texto del eje la lleva
      // adentro, y texto distinto es huella distinta — un eje plantado que el reflejo no
      // reconocería sería deuda eterna con aspecto de memoria fresca.
      version: IDE_BRAND.SEMVER,
      izquierdo: HEMISFERIO_IZQUIERDO.piezas,
      derecho: HEMISFERIO_DERECHO.piezas,
      lecciones: lineasDe("datos", "LECCIONES.md"),
      rutas: lineasDe("app", "RUTAS-DEL-SISTEMA.md"),
    };
  }

  let ultimoArraigo = "";

  /**
   * Planta el mapa en el índice por la única puerta que hay (`aprender`: si la pieza ya está por
   * tema+titulo, refuerza; no duplica). Nunca lanza: el botón no puede tumbar el server.
   */
  function arraigar(): string {
    try {
      const plan = planDeArraigo({ ...material(), existe: (rel, raiz) => existeEn(raiz, rel) });
      let plantadas = 0;
      for (const n of plan.nuevas) if (aprender(deps.raizDatos, n)) plantadas++;
      ultimoArraigo = resumenDeArraigo(plantadas, plan.omitidas);
      console.log(`[CerebroNico] 🌱 ${ultimoArraigo}`);
      return ultimoArraigo;
    } catch (e: any) {
      ultimoArraigo = `el arraigo no pudo escribir: ${String(e?.message || e)}`;
      return ultimoArraigo;
    }
  }

  function alCalentar(cuerpos: string[]): void {
    // Dispara y olvida: el turno ya tiene su respuesta por palabra. La valla de
    // reentrancia del calentador es lo que evita que dos turnos seguidos llamen
    // a Ollama a la vez en una máquina de 8 GB.
    void calentar(cuerpos).catch(() => { /* el calentador nunca es problema del turno */ });
  }

  /**
   * El reflejo del cerebro: QUÉ pieza del mapa tiene luz, cuál debe vector y cuál no existe.
   * Dos raíces, como dos hemisferios — el izquierdo se mide contra la instalación y el derecho
   * contra la raíz de datos, y lo decide `existe` mirando `entrada.raiz`, no el nombre de la
   * pieza (que se repite: `cerebro.md` vive de los dos lados a propósito).
   *
   * El asiento sale del ÍNDICE REAL, no de la fórmula: si la pieza ya estaba plantada con un
   * nombre histórico (alta vieja, con sello al azar), su vector vive ahí y mirar en otro lado
   * sería llamar «deuda» a algo que ya está luminoso.
   */
  function reflejoCerebro() {
    try {
      const plan = planDeArraigo({ ...material(), existe: (rel, raiz) => existeEn(raiz, rel) });
      const entradas = sentarseEnIndice(plan, cargarIndice(deps.raizDatos).entradas);
      const claves = clavesVectores(deps.raizDatos);
      const r = reflejoDeSemilla(entradas, claves, (rel, e) => existeEn(e?.raiz || "datos", rel));
      return { entradas: r.entradas, eje: r.eje, luz: r.luz, deuda: r.deuda, nada: r.nada, cobertura: r.cobertura, reflejo: r.reflejo };
    } catch {
      return undefined; // el estado del embedder no puede caerse por un espejo
    }
  }

  async function estado(): Promise<EstadoEmbedder> {
    const res = await resolverAhora();
    return {
      ok: true,
      modelo: res.modelo,
      fuente: res.fuente,
      motivo: res.motivo,
      recomendado: EMBEDDER_RECOMENDADO,
      residenteMs: keepAliveMs,
      instalados: instaladosCache,
      cargados: cargadosCache,
      candidatos: res.candidatos.slice(0, 6),
      cerebro: estadoVectores(deps.raizDatos),
      reflejo: reflejoCerebro(),
      calentamiento: estadoCalentamiento(),
    };
  }

  return { embed, alCalentar, calentar, arraigo: () => ultimoArraigo, estado, resolucion: () => ultima };
}

/** Monta las dos rutas del embedder sobre el resolutor ya instalado. */
export function registrarEmbedderCerebro(
  app: express.Express,
  deps: { resolutor: ResolutorEmbedder; retrasoCalentadoMs?: number }
): void {
  // v1.98.0 · el índice se termina solo, sin que ningún turno lo pida: una pasada
  // tardía (20 s por defecto) deja el vector lista para el turno siguiente. Se
  // dispara con `setTimeout` para no robarle ni un milisegundo al arranque, que ya
  // carga packs, puertos y abordajes. `unref` para que nunca mantenga vivo el proceso.
  const retraso = deps.retrasoCalentadoMs;
  if (typeof retraso === "number" && retraso >= 0) {
    const alarma = setTimeout(() => {
      void deps.resolutor
        .calentar()
        .then((r) => {
          if (r.vectorizados > 0 || r.aviso) console.log(`[CerebroNico] 🔥 calentado de vectores: ${r.vectorizados} vectorizado(s), ${r.lotes} lote(s)${r.aviso ? ` — ${r.aviso}` : ""}`);
        })
        .catch(() => { /* el calentado jamás es culpa del arranque */ });
    }, retraso);
    if (typeof alarma?.unref === "function") alarma.unref();
  }

  /** Qué embedder usa el cerebro, por qué, y cuánto índice falta vectorizar. */
  app.get("/api/cerebro/embedder", async (_req: Request, res: Response) => {
    try {
      return res.json(await deps.resolutor.estado());
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Pasada de calentamiento AHORA (el botón del panel). Nunca lanza: informa. */
  app.post("/api/cerebro/embedder/calentar", async (req: Request, res: Response) => {
    try {
      const maxCuerpos = Number.isFinite(Number(req.body?.maxCuerpos)) && Number(req.body?.maxCuerpos) > 0
        ? Math.min(500, Number(req.body?.maxCuerpos))
        : undefined;
      // v1.99.5 · el clic en «Calentar vectores ahora» también enraíza: si el cerebro está vacío,
      // calentar no tiene qué calentar. El resultado se devuelve en el cuerpo para que el panel
      // pueda nombrar qué entró en vez de dejar un número subiendo sin explicación.
      const r = await deps.resolutor.calentar(undefined, { maxCuerpos, arraigar: true });
      return res.json({ ok: true, calentamiento: r, arraigo: deps.resolutor.arraigo(), estado: await deps.resolutor.estado() });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
