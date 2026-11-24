/**
 * telemetria.ts — ROUTER DE TELEMETRÍA Y RECURSOS (Fase 2, v1.12.0)
 * =================================================================
 * QUÉ ES: las tres rutas que informan de cómo está el sistema — puertos vivos,
 * forzar un re-chequeo y el monitor de recursos de la IDE y de la máquina.
 * PARA QUÉ SIRVE: para sacar del monolito un bloque que antes arrastraba DOS
 * variables de estado propias. Al moverlo, ese estado pasó a vivir en módulos con
 * API (`server/estado/telemetria.ts` y `server/estado/proceso.ts`), que es el
 * patrón que necesitan las otras dieciocho variables globales del servidor.
 *
 * LO QUE ESTE MÓDULO **NO** HACE, Y ES LO IMPORTANTE
 * No toca `sandboxProc`. Lo PIDE. Fíjate en `DepsTelemetria`: en vez de alcanzar
 * la variable del sandbox, declara exactamente qué necesita saber de ella («¿está
 * vivo?», «¿cuál es su PID?»). Eso convierte este fichero en la **especificación de
 * la siguiente extracción**: quien mueva el estado del sandbox ya sabe qué API
 * tiene que ofrecer. Un módulo que pregunta es mejor que uno que coge.
 *
 * LO QUE SE MOVIÓ TAL CUAL
 * Los cuerpos de las tres rutas están copiados del monolito; la única diferencia
 * es que el cálculo de CPU del proceso llama a `porcentajeCpu()` (el módulo de
 * estado) en vez de manipular una variable local, y que el sandbox se consulta por
 * las dos funciones de las dependencias. Ni una línea de lógica cambió.
 *
 * v2.3.9 · EL SÉPTIMO PUERTO: EL MOTOR DEL CEREBRO (:5103)
 * -------------------------------------------------------
 * Pedido de Mario (4/11): «añadidlo a la barra de estado como 5103, así si se
 * corta o pasa algo que indique con rojo al igual que los demás».
 *
 * El :5103 es el motor del cerebro (`cerebro_motor.py`): guarda hechos y páginas
 * en `.cerebro-db/`. Es un órgano DISTINTO del daemon :5100 (memoria consultiva,
 * que no guarda nada) y hasta hoy NADIE lo sondeaba: `PORTS.CEREBRO` existía en
 * `src/constants.ts` pero no había ni una sonda que lo mirara, así que la
 * interfaz no podía mostrarlo aunque quisiera.
 *
 * Se sondea con el MISMO plazo y el MISMO criterio que los otros locales
 * (`PLAZO_SONDEO_LOCAL_MS`, `resolverPuerto`): un timeout no es «caído», es
 * «sin medir», y se conserva la última lectura buena. La diferencia con los
 * demás es de NATURALEZA, no de código: el :5103 nace bajo demanda, así que
 * «apagado» es su estado normal hasta que alguien lo despierta. Eso lo decide
 * la interfaz (chip gris), no esta ruta: aquí se informa lo medido y nada más.
 */
import os from "node:os";
import type express from "express";
import type { Request, Response } from "express";
import { cpuPercentReal } from "../../src/engine/hardwareGovernor";
import {
  muestraVigente,
  guardarMuestra,
  invalidarMuestra,
  ultimaMuestraConocida,
  resolverPuerto,
  TELEMETRY_PROBE_MS,
  PLAZO_SONDEO_LOCAL_MS,
  PRESUPUESTO_TELEMETRIA_MS,
  type LecturaSonda,
} from "../estado/telemetria";
import { porcentajeCpu } from "../estado/proceso";
// v1.16.3.1 · BAJO CONSUMO: el monitor de recursos ya no es ciego a la RAM de
// Ollama. El sondeo vive en su módulo (con su caché de 5 s) y esta ruta solo
// lo pregunta — no lo implementa.
import { sondearOllamaPs } from "../ollamaBajoConsumo";
// v1.0.35 · UN SOLO JUEGO DE SONDAS: sin esto, cada petición con la caché
// vencida abría el suyo y el panel (cada 10 s) los apilaba contra un Ollama
// al 100 % de CPU. La lógica vive en el módulo, con sus pruebas.
import { crearSondaUnica, ESPERA_COMPARTIDA_MS, TECHO_DUENIO_MS } from "../../src/engine/sondaUnica";
import { abrirFicha } from "../../src/engine/fichaUnica"; // v1.0.24 · UNA SOLA RESPUESTA: la muestra sale tarde y el 504 del plazo ya escribió; la ficha descarta la segunda escritura en vez de reventar con ERR_HTTP_HEADERS_SENT

export interface DepsTelemetria {
  /** URL base de Ollama (la misma que usa el resto del servidor). */
  ollamaUrl: string;
  /** Puerto del puente PC (:5000). */
  workerPort: number;
  /** Puerto del sandbox (:3500). */
  sandboxPort: number;
  /** ¿Está vivo el sandbox? Lo sabe el monolito; aquí solo se pregunta. */
  sandboxVivo: () => boolean;
  /** PID del sandbox, si lo hay. */
  sandboxPid: () => number | null;
}

/** Las rutas que registra este módulo. */
export const RUTAS_TELEMETRIA = [
  "GET /api/telemetry/ports",
  "POST /api/telemetry/refresh",
  "GET /api/system/stats",
] as const;

/**
 * v2.3.9 · Los puertos que se sondean, en un solo sitio.
 *
 * Antes la lista de claves estaba escrita a mano TRES veces dentro de la misma
 * ruta (el tipo, el objeto `lecturas` y el objeto `enVuelo`). Añadir un puerto
 * obligaba a acordarse de las tres, y olvidar una no daba error de compilación:
 * daba un `undefined` silencioso que la interfaz pintaba como «OFF». Con esta
 * tabla, añadir un puerto es añadir una fila.
 */
const SONDAS: ReadonlyArray<{ clave: string; url: string; plazoMs: number }> = [
  { clave: "port11434", url: "OLLAMA", plazoMs: TELEMETRY_PROBE_MS },
  { clave: "port5000", url: "WORKER", plazoMs: PLAZO_SONDEO_LOCAL_MS },
  { clave: "port3500", url: "SANDBOX", plazoMs: PLAZO_SONDEO_LOCAL_MS },
  { clave: "port5100", url: "http://127.0.0.1:5100/health", plazoMs: PLAZO_SONDEO_LOCAL_MS },
  { clave: "port5102", url: "http://127.0.0.1:5102/health", plazoMs: PLAZO_SONDEO_LOCAL_MS },
  // v2.3.9 · el motor del cerebro. `/health` es la ruta que expone
  // cerebro_motor.py; si el proceso no está, la conexión se rechaza en
  // milisegundos y `resolverPuerto` lo reporta caído sin heredar nada.
  { clave: "port5103", url: "http://127.0.0.1:5103/health", plazoMs: PLAZO_SONDEO_LOCAL_MS },
];

export function registrarTelemetria(app: express.Express, deps: DepsTelemetria): void {
  const { ollamaUrl: OLLAMA_DEFAULT, workerPort: WORKER_PORT, sandboxPort: SANDBOX_PORT } = deps;

  /**
   * v1.0.35 · LA MUESTRA SE TOMA UNA VEZ, AUNQUE LA PIDAN TRES
   * ---------------------------------------------------------
   * El cuerpo de siempre (sondas en paralelo, presupuesto, guardado) ahora vive
   * en una función y NO en la ruta. La ruta pasa por `crearSondaUnica`: si ya
   * hay una medición en vuelo, el que llega no abre la segunda — espera un poco
   * y, si no llegó, contesta con la última lectura marcada como heredada. Antes
   * cada petición con la caché vencida arrancaba su propio juego de seis sondas
   * (Ollama a 100 % de CPU, `/api/tags` con 35 s de plazo) y el panel, que pide
   * cada 10 s, las apilaba: el sondeo era la causa del atasco que informaba.
   */
  const medirMuestra = async (): Promise<any> => {
    // v2.1.2 · SONDEOS EN PARALELO, NO EN FILA.
    // Antes los cinco `await` iban uno tras otro: si Ollama tardaba 7 s en
    // /api/tags, los otros cuatro esperaban su turno y el total era la SUMA
    // (medido: 6.694 ms). En paralelo el total es el del sondeo MÁS LENTO.
    // v2.2.3 · LA MUESTRA CONTESTA ANTES DEL PLAZO, Y NO MIENTE POR APURARSE.
    // Cada sonda trae su propio plazo: 6 s para los /health locales y los 35 s
    // de siempre para Ollama. El total está topado por PRESUPUESTO_TELEMETRIA_MS
    // y `plazoApi` da 45 s a esta ruta por diseño (tabla RUTAS_LENTAS_POR_DISENO).
    // Lo que no termina a tiempo se reporta `sin_medir` y `resolverPuerto`
    // conserva la última lectura buena diciendo que es heredada.
    const CLAVES = SONDAS.map((s) => s.clave);
    type Clave = string;
    const lecturas: Record<Clave, LecturaSonda> = {};
    for (const k of CLAVES) lecturas[k] = "sin_medir";
    let jsonOllama: any = null;

    const sondear = async (url: string, plazoMs: number): Promise<LecturaSonda> => {
      const controller = new AbortController();
      const reloj = setTimeout(() => controller.abort(), plazoMs);
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) return "muerto";
        if (url.includes("/api/tags")) jsonOllama = await r.json().catch(() => null);
        return "vivo";
      } catch (e: any) {
        // Distinción que vale la pena: `abort` es TIEMPO (no sabemos),
        // `fetch failed` con causa ECONNREFUSED es PUERTO CERRADO (sabemos).
        if (controller.signal.aborted || String(e?.name || "").includes("Abort")) return "sin_medir";
        return "muerto";
      } finally {
        clearTimeout(reloj);
      }
    };

    /** Traduce el marcador simbólico de la tabla a la URL real del sondeo. */
    const urlDe = (marcador: string): string => {
      if (marcador === "OLLAMA") return `${OLLAMA_DEFAULT}/api/tags`;
      if (marcador === "WORKER") return `http://127.0.0.1:${WORKER_PORT}/health`;
      if (marcador === "SANDBOX") return `http://127.0.0.1:${SANDBOX_PORT}/`;
      return marcador;
    };

    const enVuelo: Array<Promise<void>> = SONDAS.map((s) =>
      sondear(urlDe(s.url), s.plazoMs).then((v) => {
        lecturas[s.clave] = v;
      }),
    );
    const terminan = Promise.allSettled(enVuelo);

    const armarMuestra = (ahora: number, incompleto: boolean) => {
      const vieja = ultimaMuestraConocida();
      const previa = (vieja?.data || {}) as Record<string, unknown>;
      const motivos: Record<string, string> = {};
      const heredados: string[] = [];
      const resueltos = {} as Record<Clave, { vivo: boolean; motivo: string; heredado: boolean }>;
      for (const k of CLAVES) {
        const ante = typeof previa[k] === "boolean" ? { vivo: previa[k] as boolean, timestamp: vieja!.timestamp } : undefined;
        const r = resolverPuerto(lecturas[k], ante, ahora);
        resueltos[k] = r;
        if (r.motivo) motivos[k] = r.motivo;
        if (r.heredado) heredados.push(k);
      }
      const modelCount =
        jsonOllama && Array.isArray(jsonOllama.models) ? jsonOllama.models.length : 0;
      // Una muestra completa hereda el ModelCount de la anterior en vez de
      // decir «0 modelos» porque esta vez la sonda de Ollama no llegó: un cero
      // inventado fue justo lo que Mario vio («ni cargaron los modelos»).
      const modelCountPrevio = typeof previa.ollamaModelCount === "number" ? (previa.ollamaModelCount as number) : 0;
      return {
        port3000: true, // Self
        port3500: resueltos.port3500.vivo,
        port5000: resueltos.port5000.vivo,
        port5100: resueltos.port5100.vivo,
        port5102: resueltos.port5102.vivo,
        port5103: resueltos.port5103.vivo,
        port11434: resueltos.port11434.vivo,
        lastChecked: ahora,
        ollamaModelCount: jsonOllama && Array.isArray(jsonOllama.models) ? modelCount : modelCountPrevio,
        motivos,
        heredados,
        incompleto,
        presupuestoMs: PRESUPUESTO_TELEMETRIA_MS,
        edadDeLaMuestraPreviaMs: vieja ? Math.max(0, ahora - vieja.timestamp) : null,
      };
    };

    // v1.0.24 · SEGUNDA RUTA DEL LOG (telemetria.ts:215): con Ollama tardando
    // 21-37 s, esta muestra llegaba después del 504 y el `res.json()` estallaba
    // con ERR_HTTP_HEADERS_SENT dentro de una promesa huérfana. La ficha ahora
    // vive en la ruta; acá solo se mide.
    // v1.0.35 · el reloj del tope se APAGA cuando las sondas terminan: si no,
    // cada muestra deja un temporizador de 30 s vivo y el proceso no puede
    // soltar el bucle ni aunque esté todo medido.
    let relojTope: ReturnType<typeof setTimeout> | undefined;
    const tope = new Promise((r) => { relojTope = setTimeout(r, PRESUPUESTO_TELEMETRIA_MS); });
    await Promise.race([terminan, tope]);
    if (relojTope) clearTimeout(relojTope);
    const data = armarMuestra(Date.now(), false);
    // Si alguna sonda sigue en el aire, la próxima lectura llega completa: se
    // guarda cuando terminen, sin tocar la respuesta que ya salió.
    void terminan.then(() => {
      const segunda = armarMuestra(Date.now(), false);
      if (JSON.stringify(segunda) !== JSON.stringify(data)) guardarMuestra(segunda);
    });
    guardarMuestra(data);
    return data;
  };

  /** Una sola medición en vuelo por proceso; los que llegan tarde heredan. */
  const sonda = crearSondaUnica<any>({
    medir: medirMuestra,
    cache: () => (muestraVigente() as any) || null,
    conocida: () => ((ultimaMuestraConocida()?.data as any) ?? null),
    esperaMaximaMs: ESPERA_COMPARTIDA_MS,
    // v1.0.38 · NI EL DUEÑO ESPERA LA MEDICIÓN ENTERA. Con este techo, la
    // petición suelta la conexión en 2 s aunque Ollama tarde 35: el latido y el
    // catálogo de modelos vuelven a tener turno y los puertos dejan de mentir.
    techoDuenioMs: TECHO_DUENIO_MS,
  });

  app.get("/api/telemetry/ports", async (_req: Request, res: Response) => {
    const ficha = abrirFicha(res, "/api/telemetry/ports");
    const r = await sonda.pedir();
    if (r.muestra && r.origen !== "heredada") return ficha.json(r.muestra);
    if (r.muestra) {
      const vieja = ultimaMuestraConocida();
      const edad = vieja ? Math.max(0, Math.round((Date.now() - vieja.timestamp) / 1000)) : 0;
      return ficha.json({
        ...(r.muestra as Record<string, unknown>),
        incompleto: true,
        heredadaPorSondeoEnCurso: true,
        motivoMuestra: `hay un sondeo en curso: te doy la última lectura (hace ${edad} s)`,
      });
    }
    // Ni nuevo ni viejo: se dice, no se pinta un «caído» que nadie midió.
    return ficha.json({
      port3000: true,
      port3500: false, port5000: false, port5100: false, port5102: false, port5103: false, port11434: false,
      lastChecked: 0,
      ollamaModelCount: 0,
      motivos: {},
      heredados: [],
      incompleto: true,
      sinMuestra: true,
      motivoMuestra: "primer sondeo en curso: todavía no hay lectura",
      presupuestoMs: PRESUPUESTO_TELEMETRIA_MS,
    });
  });


  /** 🔧 ENDPOINT: Forzar re-chequeo de telemetría (invalida la caché). */
  app.post("/api/telemetry/refresh", (_req: Request, res: Response) => {
    invalidarMuestra();
    return res.json({ ok: true });
  });

  /**
   * 🔧 MONITOR DE RECURSOS: devuelve uso de CPU y RAM del proceso Node.js
   * (la IDE en :3000) + estimación del sandbox (:3500) leyendo si está vivo.
   * El frontend lo consulta cada 5 s para mostrar un indicador en vivo.
   *
   * v1.16.3.1 · MODO BAJO CONSUMO: se añade el bloque `ollama` con la RAM que
   * Ollama está usando ahora mismo. El chip «Ollama: 4.1 GB» y el botón
   * «Expulsar» de la pestaña Puertos salen de aquí — el mismo sondeo que ya
   * hace el stats, sin peticiones extra al motor.
   */
  app.get("/api/system/stats", async (_req: Request, res: Response) => {
    // v1.0.24 · CUARTA RUTA DEL LOG (telemetria.ts:294): `sondearOllamaPs` puede
    // quedarse sin caché y tardar; el reloj de /api vencía antes y el res.json()
    // de aquí era el que reventaba. Ahora contesta una vez y punto.
    const ficha = abrirFicha(res, "/api/system/stats");
    try {
      const mem = process.memoryUsage();
      const now = Date.now();
      // El % de CPU del proceso vive ahora en `server/estado/proceso.ts`, con su
      // memoria de la última muestra dentro del módulo en vez de en una variable
      // suelta del monolito.
      const cpuPercent = porcentajeCpu(now);

      // Uptime
      const uptimeSec = Math.floor(process.uptime());

      // Estimar uso del sandbox preguntando si está vivo (ya no se alcanza la variable).
      const sandboxAlive = deps.sandboxVivo();

      // 🦙 RAM de Ollama ahora mismo: consulta con caché de 5 s, que NUNCA
      // detiene el monitor (el módulo ya captura su propio timeout).
      const ollamaPs = await sondearOllamaPs({ ollamaUrl: OLLAMA_DEFAULT });

      return ficha.json({
        ok: true,
        ide: {
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          externalMb: Math.round(mem.external / 1024 / 1024),
          cpuPercent,
          uptimeSec,
          pid: process.pid,
        },
        sandbox: {
          running: sandboxAlive,
          pid: deps.sandboxPid(),
          port: SANDBOX_PORT,
        },
        // v1.6.22 — CPU REAL de la máquina (os.cpus()), no la del proceso Node.
        // El indicador de la barra decía «CPU» pero medía el proceso de la IDE;
        // ahora la máquina se mide aparte y el frontend puede distinguir ambos.
        machine: {
          cpuPercent: cpuPercentReal(), // null en la primera muestra (falta base)
          totalRamMb: Math.round(os.totalmem() / 1024 / 1024),
          freeRamMb: Math.round(os.freemem() / 1024 / 1024),
          cores: os.cpus()?.length || 0,
        },
        // 🦙 v1.16.3.1 · BAJO CONSUMO: qué modelos están clavados en RAM.
        // La fuente es ollamaBajoConsumo.ts (GET /api/ps normalizado).
        ollama: {
          vivo: ollamaPs.vivo,
          residenteMb: ollamaPs.residenteMb,
          modelos: ollamaPs.modelos.map((m) => ({
            model: m.model,
            sizeMb: m.sizeBytes !== null ? Math.round(m.sizeBytes / 1024 / 1024) : null,
            until: m.until,
            expirado: m.expirado,
          })),
          ...(ollamaPs.error ? { error: ollamaPs.error } : {}),
        },
        geminiServidorDisponible: Boolean(process.env.GEMINI_API_KEY?.trim()),
        timestamp: now,
      });
    } catch (err: any) {
      // Si el reloj ya contestó, ni el 500 se manda: la ficha lo descarta y lo anota.
      return ficha.json({ error: err.message });
    }
  });
}
