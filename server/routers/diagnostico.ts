/**
 * diagnostico.ts — ROUTER DE DIAGNÓSTICO (Fase 2 · primera extracción, v1.11.0)
 * ============================================================================
 * QUÉ ES: el primer módulo de rutas extraído del monolito `server.ts`. Agrupa las
 * cuatro rutas de solo lectura que responden «¿cómo está esto?»: la salud profunda
 * del sistema, el perfil de rendimiento de un modelo, el catálogo de modelos
 * instalados en Ollama y —desde v1.57.15— el plan de auto-curación de una salida de
 * `npm run validar`. Las cuatro leen estado y devuelven criterio: ninguna escribe
 * disco y ninguna arranca un proceso.
 * PARA QUÉ SIRVE: para demostrar que la extracción funciona y para empezar a
 * reducir las 11.661 líneas del monolito sin cambiar ni una ruta ni un
 * comportamiento. La superficie la vigila `contrato-rutas.json`: si algo de aquí
 * se pierde o pierde su guard, la puerta se pone roja.
 *
 * POR QUÉ ESTAS TRES Y NO OTRAS
 * Es la primera tanda y se elige por riesgo, no por tamaño:
 *   · son GET (no escriben nada),
 *   · no tocan estado mutable del servidor (no usan `telemetryCache`, ni
 *     `sandboxProc`, ni contadores de CPU),
 *   · sus dependencias son funciones puras o valores de arranque.
 * Las que sí dependen de estado compartido (`/api/telemetry/*`, `/api/system/stats`)
 * NO se traen aquí a propósito: su sitio es la extracción del estado
 * (`server/estado/`), y mezclarlas ahora sería mover el problema, no el código.
 *
 * LA REGLA DE LA FASE: SE MUEVE, NO SE MEJORA
 * Los cuerpos de los tres manejadores están copiados tal cual estaban. Lo único
 * que cambia es de dónde salen tres valores (Ollama, RAM, núcleos), que se pasan
 * como dependencias en vez de leerse aquí: si se recalcularan en este fichero
 * habría dos fuentes de verdad para lo mismo, y la primera vez que una cambiara
 * tendríamos un diagnóstico que miente sobre el servidor al que diagnostica.
 */
import os from "node:os";
import type express from "express";
import type { Request, Response } from "express";
import {
  getModelProfile,
  buildOllamaOptions,
} from "../../src/engine/modelTiers";
import { describeResilience } from "../../src/engine/resilience";
import { auditarListaOllama, validarUrlServidorCustom } from "../../src/engine/aduanaModelos";
import { resolverOllama } from "../../src/engine/direccionOllama";
import {
  clasificarFallo,
  comandoDeRelecturaTodas,
  huellaError,
  parsearVeredicto,
  planDeAutoCuracion,
  presupuestoDeIntentos,
  type IntentoCuracion,
} from "../../src/engine/ouroboros";
// v2.3.12 · EL TELÓN YA NO TIENE SU PROPIA LISTA DE PUERTOS. Recorre el plano de
// `src/engine/puertosArranque.ts`, que es el mismo que alimenta el banner de
// arranque y el mapa del system prompt. Antes la ruta armaba `[cOllama, cSandbox,
// cPuente]` a mano: tres filas con puerto de las siete que tiene la casa, y por eso
// el arranque mostraba 3 mientras la barra de estado mostraba 7.
import {
  PUERTOS_DE_ARRANQUE,
  SONDA_PROPIA,
  nombreDeFila,
  type PuertoDeArranque,
} from "../../src/engine/puertosArranque";

export interface DepsDiagnostico {
  /** URL base de Ollama (la misma que usa el resto del servidor). */
  ollamaUrl: string;
  /** RAM de la máquina en GB, como la calculó el arranque. */
  ramGb: number;
  /** Núcleos de CPU, como los contó el arranque. */
  cpuCores: number;
  /**
   * ¿Hay un sandbox arrancado en esta sesión? Lo sabe el estado del sandbox; aquí
   * solo se pregunta. Sin esto no se puede distinguir «aún no arrancado» (normal al
   * empezar) de «arrancado y no contesta» (un problema de verdad).
   */
  sandboxVivo: () => boolean;
  /** Puerto del sandbox (:3500). Se pasa para no repetir el número en dos sitios. */
  sandboxPort: number;
}

/** Las rutas que registra este módulo: la lista sirve para comprobarlo, no para documentar. */
export const RUTAS_DIAGNOSTICO = [
  "GET /api/health/deep",
  "GET /api/ollama/perf",
  "GET /api/ollama/models",
  "POST /api/diagnostico/autocurar",
] as const;

/** Una fila de `/api/health/deep`: qué es, si está bien, qué se ve y qué hacer. */
interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
  /**
   * v2.3.12 · LOS TRES ESTADOS que Mario fijó el 4/11 para el chip del :5103,
   * aplicados a toda la tabla y no sólo a ese puerto:
   *   · `vivo`          → verde
   *   · `sin-arrancar`  → gris (es de los que nacen bajo demanda: no es una falla)
   *   · `caido`         → rojo (debía estar y no está)
   * Ausente en filas que no son un puerto (Memoria, Cortacircuitos): se pintan
   * con el criterio viejo, verde/rojo.
   */
  estado?: "vivo" | "sin-arrancar" | "caido";
  /**
   * v2.3.12 · ¿esta fila puede retrasar el telón y contar como «problema»?
   * `false` = se muestra con su motivo pero no secuestra la entrada. Es lo que
   * impide que el arreglo del defecto se cobre otro: con siete filas, cualquier
   * pack de Python que no levantó tendría al usuario doce segundos mirando un
   * spinner por algo que no impide trabajar.
   */
  bloqueante?: boolean;
}

export function registrarDiagnostico(
  app: express.Express,
  deps: DepsDiagnostico,
): void {
  const {
    ollamaUrl: OLLAMA_DEFAULT,
    ramGb: RAM_GB,
    cpuCores: CPU_CORES,
  } = deps;

  // ─── Sondas de `/api/health/deep` (v1.70.4) ──────────────────────────────
  // El splash consulta esta ruta cada 1,2 s. Antes las tres sondas de red
  // corrían DE UNA (Ollama 4 s + sandbox 3 s + puente 3 s = hasta 10 s por
  // pasada): el splash no alcanzaba a confirmar y declaraba el rojo antes de
  // tiempo. Ahora corren EN PARALELO y la peor pasada tarda lo que la sonda
  // más lenta. Cada sonda devuelve su Check; el orden de exhibición se
  // mantiene idéntico al de siempre.

  /**
   * Ollama v1.70.4 · «NUNCA DA VERDE» (capturas de Mario, 25/10).
   * La sonda vieja pedía /api/tags con 4 s de plazo. Pero /api/tags NO es
   * barato: mientras Ollama está metiendo un modelo en RAM (el arranque de
   * la IDE coincide justo con ese calentamiento; 45 modelos, 4 núcleos), la
   * lista se hace de esperar y la sonda devolvía «The operation was aborted
   * due to timeout» → rojo PARA SIEMPRE (el splash solo mira seis segundos).
   * Se separó en dos preguntas, cada una con su plazo honesto:
   *   · ¿VIVE?    → /api/version: siempre instantáneo, no carga nada.
   *   · ¿QUÉ HAY? → /api/tags con paciencia (9 s). Si se demora, Ollama está
   *     VIVO y ocupado: se dice tal cual, en verde — no como avería.
   */
  async function sondaOllama(): Promise<Check> {
    const base = (process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "");
    let version = "";
    try {
      const rv = await fetch(`${base}/api/version`, {
        signal: AbortSignal.timeout(3500),
      });
      if (rv.ok)
        version = String(
          ((await rv.json().catch(() => ({}))) as any)?.version || "?",
        );
    } catch {
      return {
        name: "Ollama :11434",
        ok: false,
        detail: "no responde ni la consulta de versión",
        fix: "Arranca Ollama. Sin él, los modelos locales no pueden responder.",
      };
    }
    try {
      const r = await fetch(`${base}/api/tags`, {
        // v2.1.3 — 9 s + los 3,5 s de /api/version daban 12,5 s de pasada: más
        // que el plazo del propio telón (12 s). Con 6 s la peor pasada queda en
        // 9,5 s y el splash alcanza a pintar las filas antes de decidir.
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const data: any = await r.json().catch(() => ({}));
        const models: string[] = (data?.models || [])
          .map((m: any) => m?.name)
          .filter(Boolean);
        return {
          name: "Ollama :11434",
          ok: true,
          detail: `${models.length} modelo(s) instalado(s) · v${version}`,
        };
      }
      return {
        name: "Ollama :11434",
        ok: true,
        detail: `vivo (v${version}); la lista de modelos respondió HTTP ${r.status}`,
        fix: "Ollama está cargando algo en RAM: es normal al arranque y se arregla solo.",
      };
    } catch {
      return {
        name: "Ollama :11434",
        ok: true,
        detail: `vivo (v${version}); la lista de modelos se hace de esperar`,
        fix: "Ollama está cargando algo en RAM: es normal al arranque y se arregla solo.",
      };
    }
  }

  /**
   * Sandbox :3500 · v1.13.0 — «fetch failed» AL ARRANCAR NO ES UN PROBLEMA.
   * El proceso del sandbox se levanta la primera vez que hace falta (al abrir
   * el preview). Tres desenlaces, según lo que SÍ se sabe:
   *   · responde                           → correcto
   *   · no responde y no hay proceso       → «aún no arrancado» (informativo)
   *   · no responde y SÍ hay proceso vivo  → problema real, con su remedio
   */
  async function sondaSandbox(): Promise<Check> {
    const sandboxUrl =
      process.env.SANDBOX_URL || `http://127.0.0.1:${deps.sandboxPort}`;
    try {
      const r = await fetch(sandboxUrl, { signal: AbortSignal.timeout(3000) });
      return {
        name: "Sandbox :3500",
        ok: r.ok,
        detail: r.ok ? `HTTP ${r.status}` : `responde con HTTP ${r.status}`,
        fix: r.ok
          ? undefined
          : "El sandbox contesta con error. Reinicialo con Sync.",
      };
    } catch (err: any) {
      if (deps.sandboxVivo()) {
        return {
          name: "Sandbox :3500",
          ok: false,
          detail: err?.message || "sin respuesta",
          fix: "Está arrancado pero no contesta: pulsa Sync para reinicialo.",
        };
      }
      return {
        name: "Sandbox :3500",
        ok: true,
        detail: "aún no arrancado (se levanta al abrir el preview)",
        estado: "sin-arrancar",
      };
    }
  }

  /** Puente PC :5000 — sin él, el Modo Agente (archivos reales) no funciona. */
  async function sondaPuente(): Promise<Check> {
    try {
      const r = await fetch("http://127.0.0.1:5000/health", {
        signal: AbortSignal.timeout(3000),
      });
      return {
        name: "Puente PC :5000",
        ok: r.ok,
        detail: `HTTP ${r.status}`,
        fix: r.ok
          ? undefined
          : "Ejecuta el puente Python para el Modo Agente PC.",
      };
    } catch (err: any) {
      return {
        name: "Puente PC :5000",
        ok: false,
        detail: err?.message || "sin respuesta",
        fix: "Sin el puente, el Modo Agente PC (archivos reales) no funciona.",
      };
    }
  }

  /**
   * v2.3.12 · LA SONDA GENÉRICA DEL PLANO — los puertos que el telón todavía no
   * miraba (IDE :3000, Memoria :5100, Creador :5102, Motor del cerebro :5103).
   *
   * Tres desenlaces, y el tercero es el que evita la mentira nueva: un puerto que
   * pertenece a un servicio que NACE BAJO DEMANDA no puede pintarse de rojo a las
   * nueve de la mañana. Eso era exactamente lo que Mario pidió no hacer con el
   * :5103 («que sea así» refería al rojo de lo que SE CORTA, no al rojo de lo que
   * nunca fue). Gris = «no existe todavía», y lo dice.
   */
  async function sondaDePlano(p: PuertoDeArranque): Promise<Check> {
    const bajoDemanda = p.nacimiento === "bajo-demanda";
    const base = { name: nombreDeFila(p), bloqueante: p.bloqueante, fix: p.remedio };
    if (p.sonda === SONDA_PROPIA) {
      // El :3000 es este manejo: si alguien lee esta fila, está vivo por
      // construcción. Falsarlo con una sonda de red sería pagar un viaje para
      // preguntarle a la puerta si la puerta existe.
      return { ...base, ok: true, detail: "este server está respondiendo ahora", estado: "vivo" };
    }
    const url =
      p.sonda === "OLLAMA"
        ? `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "")}/api/version`
        : p.sonda === "WORKER"
          ? "http://127.0.0.1:5000/health"
          : p.sonda === "SANDBOX"
            ? process.env.SANDBOX_URL || `http://127.0.0.1:${deps.sandboxPort}`
            : p.sonda;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) {
        return { ...base, ok: false, detail: `responde HTTP ${r.status}`, estado: "caido" };
      }
      return { ...base, ok: true, detail: `escuchando · HTTP ${r.status}`, estado: "vivo" };
    } catch (err: any) {
      const causa = String(err?.cause?.code || err?.message || err || "");
      if (causa.includes("TIMEOUT") || causa.includes("abort")) {
        return { ...base, ok: false, detail: "tardó más de 3 s en contestar", estado: "caido" };
      }
      if (bajoDemanda) {
        return {
          ...base,
          ok: true,
          detail: "sin arrancar (nace cuando el motor lo necesita)",
          estado: "sin-arrancar",
          fix: undefined,
        };
      }
      return { ...base, ok: false, detail: "no hay nadie escuchando", estado: "caido" };
    }
  }

  // v1.70.4 · Sonda con cache corto: el splash polling cada 1,2 s y la barra
  // de estados también lee esta ruta. Re-sondear Ollama en CADA lectura era
  // parte del «nunca da verde»: con el motor cargando un modelo, dos pasadas
  // se pisaban y la última moría en el plazo. 1,5 s de cache: el splash sigue
  // viendo movimiento, el puerto deja de recibir sondas inútiles.
  let ultimoBody: any = null;
  let ultimoMs = 0;
  let enVuelo: Promise<any> | null = null;

  /**
   * v2.1.3 — TRES AGUJEROS QUE DEJABAN EL TELÓN CERRADO
   * ---------------------------------------------------
   * 1. Si una sonda lanzaba una excepción no controlada, `enVuelo` quedaba
   *    apuntando a una promesa rechazada para siempre: toda lectura posterior
   *    moría con 500 y el splash no recibía ni una fila.
   * 2. No había plazo para la pasada completa: la suma de los plazos de cada
   *    sonda (3,5 + 6 + 3 + 3) podía superar el plazo del cliente, así que el
   *    cliente abortaba antes de tener respuesta y volvía a empezar: bucle.
   * 3. `enVuelo = null` sólo se ejecutaba en el camino feliz.
   * Ahora: plazo duro de 9,5 s por pasada, fila que dice qué no contestó, y
   * `finally` que siempre libera la puerta.
   */
  const PLAZO_PASADA_MS = 9500;

  const conPlazo = <T,>(p: Promise<T>, ms: number, siNoLlega: T): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((listo) => {
        const t = setTimeout(() => listo(siNoLlega), ms);
        // No mantener vivo el proceso por un temporizador de sonda.
        if (typeof (t as any).unref === "function") (t as any).unref();
      }),
    ]);

  app.get("/api/health/deep", async (_req: Request, res: Response) => {
    if (ultimoBody && Date.now() - ultimoMs < 1500) return res.json(ultimoBody);
    if (enVuelo) {
      try {
        return res.json(await enVuelo);
      } catch {
        return res.json(ultimoBody || { ok: false, summary: "la sonda falló", checks: [] });
      }
    }

    enVuelo = (async () => {
      const sinRespuesta = (name: string, ms: number): Check => ({
        name,
        ok: false,
        detail: `no contestó en ${Math.round(ms / 100) / 10} s`,
        fix: "Quedó fuera de plazo: la IDE entra igual y esto se puede corregir desde Config.",
      });

      // v2.3.12 · SIETE FILAS, UNA PASADA. Las tres sondas con detalle propio
      // (Ollama cuenta modelos, sandbox distingue «no está» de «está y no
      // contesta», puente tiene su /health) se lanzan YA, en paralelo; el resto
      // del plano corre con la sonda genérica. El total lo topa
      // `PLAZO_PASADA_MS`, no la suma, así que agregar cuatro puertos no le
      // agrega cuatro segundos al telón.
      const ricas: Record<string, Promise<Check>> = {
        port11434: conPlazo(sondaOllama(), PLAZO_PASADA_MS, sinRespuesta("Ollama :11434", PLAZO_PASADA_MS)),
        port3500: conPlazo(sondaSandbox(), PLAZO_PASADA_MS, sinRespuesta("Sandbox :3500", PLAZO_PASADA_MS)),
        port5000: conPlazo(sondaPuente(), PLAZO_PASADA_MS, sinRespuesta("Puente PC :5000", PLAZO_PASADA_MS)),
      };
      const filasDePuertos: Check[] = await Promise.all(
        PUERTOS_DE_ARRANQUE.map(async (p) => {
          const cruda = ricas[p.clave];
          const chk = cruda ? await cruda : await sondaDePlano(p);
          // El nombre y el `bloqueante` SIEMPRE los gana el plano: si la sonda
          // escribió «Ollama :11434» y el plano dice otra cosa, manda el plano,
          // porque es el que además imprime el banner y viaja en el prompt.
          return {
            ...chk,
            name: nombreDeFila(p),
            bloqueante: p.bloqueante,
            estado: chk.estado || (chk.ok ? "vivo" : "caido"),
          };
        }),
      );

      // Memoria del sistema (local, instantánea: no necesita sonda asíncrona).
      const totalGb = RAM_GB;
      const freeGb = Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
      const rssMb = Math.round(process.memoryUsage().rss / 1024 ** 2);
      const lowMem = freeGb < 1.2;
      const cMemoria: Check = {
        name: "Memoria",
        ok: !lowMem,
        detail: `${freeGb} GB libres de ${totalGb} GB · IDE usando ${rssMb} MB`,
        fix: lowMem
          ? "Queda menos de 1,2 GB libre: cierra el navegador o usa un modelo micro; si no, Ollama hará swap y parecerá colgado."
          : undefined,
      };

      // Resiliencia: estado de los cortacircuitos por proveedor.
      const cCircuitos: Check = {
        name: "Cortacircuitos",
        ok: true,
        detail: describeResilience(),
      };

      // v2.3.12 · El orden es el del plano (3000 → 11434) y después las dos filas
      // que no son un puerto: memoria de la máquina y cortacircuitos.
      const checks: Check[] = [...filasDePuertos, cMemoria, cCircuitos];
      // «Problema» sigue significando lo que siempre significó: lo que el usuario
      // necesita para trabajar y no está. Lo que le falta a un pack que además se
      // puede apagar a propósito viaja aparte, como aviso.
      const failing = checks.filter((c) => !c.ok && c.bloqueante !== false);
      const avisos = checks.filter((c) => !c.ok && c.bloqueante === false);
      return {
        ok: failing.length === 0,
        summary:
          failing.length === 0
            ? avisos.length
              ? `Todo operativo · ${avisos.length} servicio(s) de la casa sin levantar (informativo)`
              : "Todo operativo."
            : `${failing.length} problema(s): ${failing.map((f) => f.name).join(", ")}`,
        checks,
        // v2.3.12 · las siete filas nombran su puerto; la cuenta de puertos va
        // explícita para que nadie vuelva a pintar «3 de la casa» creyendo que son
        // todos.
        puertosMedidos: filasDePuertos.length,
        avisos: avisos.map((a) => a.name),
        // Recomendaciones ordenadas por impacto real sobre la velocidad
        recommendations: [
          ...failing.filter((f) => f.fix).map((f) => `${f.name}: ${f.fix}`),
          ...avisos.filter((f) => f.fix).map((f) => `${f.name}: ${f.fix}`),
          "Si un modelo local no contesta, pulsa «Precalentar» antes de escribir: evita la carga desde disco en el primer mensaje.",
          "Para 8 GB: usa modelos de 0,4-1,5 GB con contexto 2048-4096 y cierra el navegador mientras generas.",
        ],
      };
    })();

    try {
      const cuerpo = await enVuelo;
      ultimoBody = cuerpo;
      ultimoMs = Date.now();
      return res.json(cuerpo);
    } catch (e: any) {
      // Nunca 500: el splash necesita filas para poder explicar el rojo.
      return res.json({
        ok: false,
        summary: `la sonda falló: ${e?.message || e}`,
        checks: ultimoBody?.checks || [],
      });
    } finally {
      enVuelo = null;
    }
  });

  /** Devuelve el perfil de rendimiento calculado para un modelo. */
  app.get("/api/ollama/perf", (req: Request, res: Response) => {
    const model = String(req.query.model || "");
    if (!model)
      return res.status(400).json({ ok: false, error: "Falta ?model=" });
    const profile = getModelProfile(model, RAM_GB);
    return res.json({
      ok: true,
      model,
      ramGb: RAM_GB,
      cpuCores: CPU_CORES,
      tier: profile.tier,
      paramsB: profile.paramsB,
      toolCapable: profile.toolCapable,
      suggestedOptions: buildOllamaOptions(model, undefined, CPU_CORES, RAM_GB),
      contextCharBudget: profile.contextCharBudget,
      keepAlive: profile.keepAlive,
      notes: profile.notes,
    });
  });

  /**
   * Ollama models catalog proxy
   */
  app.get("/api/ollama/models", async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
    const customUrl = (rawUrl ? resolverOllama({ OLLAMA_URL: rawUrl }).base : OLLAMA_DEFAULT).replace(/\/+$/, "");
    const plazoMs = Number(process.env.CN_PLAZO_TAGS_MS || 40000);

    const candidatas: string[] = [customUrl];
    try {
      const u = new URL(customUrl);
      if (u.hostname === "127.0.0.1") {
        const alt = new URL(customUrl);
        alt.hostname = "localhost";
        candidatas.push(alt.toString().replace(/\/+$/, ""));
      } else if (u.hostname === "localhost") {
        const alt = new URL(customUrl);
        alt.hostname = "127.0.0.1";
        candidatas.push(alt.toString().replace(/\/+$/, ""));
      }
    } catch {}

    let lastError: any = null;
    for (let i = 0; i < candidatas.length; i++) {
      const target = candidatas[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), plazoMs);
      try {
        // v2.2.2 / v2.3.4 · CN_PLAZO_TAGS_MS permite ampliar la espera con almacenes grandes.
        const response = await fetch(`${target}/api/tags`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.models)) {
            const nombres = data.models.map((m: any) => m?.name || m?.model || "");
            const auditoria = auditarListaOllama(nombres);
            const porNombre = new Map(auditoria.todos.map((t) => [t.name, t] as const));
            data.models = data.models.map((m: any) => {
              const name: string = String(m?.name || m?.model || "").trim();
              const t = porNombre.get(name);
              return { ...(m && typeof m === "object" ? m : { name }), name, rol: t?.rol || "chat", motivo: t?.motivo || "" };
            });
            data.auditoria = auditoria.conteo;
            data.excluidos_de_chat = auditoria.excluidos;
          }
          data.ollamaUrl = target;
          return res.json(data);
        }
        return res.status(response.status).json({ models: [], error: `Ollama contesto ${response.status}`, ollamaUrl: target });
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        // Si falló por conexión y queda un loopback alternativo (127.0.0.1 ↔ localhost), probar siguiente.
        if (err?.name === "AbortError") break;
      }
    }

    return res.json({
      models: [],
      error: String(lastError?.message || lastError || "No se pudo conectar con Ollama"),
      ollamaUrl: customUrl,
      plazoMs: Number(process.env.CN_PLAZO_TAGS_MS || 40000),
    });
  });

  /**
   * v1.57.15 · AUTOCURACIÓN — el criterio de `ouroboros.ts` puesto al alcance.
   *
   * QUÉ ES: recibe la SALIDA de `npm run validar` y devuelve el PLAN: qué causa
   * tiene el rojo, si es curable por el modelo, qué comando hace falta correr para
   * leer el error COMPLETO (el veredicto lo trunca y remite a la suite), cuántos
   * intentos permite el presupuesto de CPU y —si toca curar— el prompt ya recortado
   * contra la ventana real del turno.
   *
   * QUÉ NO ES: no ejecuta, no escribe, no llama al modelo. Este módulo siempre fue
   * de diagnóstico, y mantener esa promesa es lo que distingue una valla de un
   * motor: si acá se arrancara un `spawn`, el plan quedaría con la única cosa que
   * el proyecto ya no tolera — un paso que nadie puede probar en seco. Quien
   * ejecuta es el bucle; acá se decide. Es POST porque el cuerpo es un texto que
   * no cabe en una query, no porque modifique algo.
   */
  app.post("/api/diagnostico/autocurar", (req: Request, res: Response) => {
    const cuerpo = (
      req.body && typeof req.body === "object" ? req.body : {}
    ) as Record<string, any>;
    const salida = typeof cuerpo.salida === "string" ? cuerpo.salida : "";
    if (!salida.trim()) {
      // (La forma de esta línea la fija `tests/ouroboros.test.ts` a propósito:
      // un rojo de la IDE NUNCA puede contestar 200 vacío. No reenvolverla.)
      return res.status(400).json({ ok: false, motivo: "falta `salida`: el texto que imprimió `npm run validar`" });
    }
    const codigo = Number.isFinite(Number(cuerpo.codigo))
      ? Number(cuerpo.codigo)
      : 1;
    const veredicto = parsearVeredicto(salida, codigo);
    const clasificacion = clasificarFallo(veredicto, salida);
    const costo = Number(cuerpo.costoValidacionMs);
    const presupuesto = presupuestoDeIntentos(
      Number.isFinite(costo) && costo > 0 ? costo : 90_000,
      Number(cuerpo.minutos) || 4,
    );
    const historial: IntentoCuracion[] = (
      Array.isArray(cuerpo.historial) ? cuerpo.historial : []
    ).map((h: any) => {
      const extracto =
        typeof h?.extracto === "string"
          ? h.extracto
          : String(h?.motivo ?? h ?? "");
      return {
        extracto,
        huella:
          typeof h?.huella === "string" ? h.huella : huellaError(extracto),
        costoMs: Number(h?.costoMs) || presupuesto.costoValidacionMs,
      };
    });
    // La ventana del turno es la que el motor YA topó por RAM (techoContexto): el
    // extracto tiene que caber en lo que se puede pagar, no en lo que se tecleó.
    const modelo = typeof cuerpo.modelo === "string" ? cuerpo.modelo : "";
    const perfil = modelo ? getModelProfile(modelo, RAM_GB) : null;
    const chars =
      Number.isFinite(Number(cuerpo.chars)) && Number(cuerpo.chars) > 0
        ? Number(cuerpo.chars)
        : Math.max(1200, Math.floor((perfil ? perfil.numCtx : 4096) * 3));
    const plan = planDeAutoCuracion({
      veredicto,
      salida,
      historial,
      presupuesto,
      charsDisponibles: chars,
      archivoFallo:
        typeof cuerpo.archivo === "string" ? cuerpo.archivo : undefined,
    });
    return res.json({
      ok: true,
      veredicto,
      clasificacion,
      presupuesto,
      plan,
      reLectura: comandoDeRelecturaTodas(salida),
      charsPresupuesto: chars,
      ventanaUsada: perfil
        ? `${modelo} → num_ctx ${perfil.numCtx}${perfil.ctxRecortado ? " (topado por RAM)" : ""}`
        : "sin modelo: 4096 de referencia",
    });
  });
}
