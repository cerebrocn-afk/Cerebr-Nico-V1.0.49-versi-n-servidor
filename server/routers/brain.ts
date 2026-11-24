/**
 * brain.ts — ROUTER DEL CEREBRO (Fase 2 · extracción v1.48.1)
 * ============================================================================
 * QUÉ ES: las rutas de solo lectura del cerebro (`/api/brain`, estado, decisiones,
 * lecciones, scan, historial, rollback, compact, prompt) y TODO el CEREBRO DE
 * TAREAS (presupuesto, runner, escalado, tramos y planes). Se mueven tal cual
 * estaban: misma superficie, mismos guards, mismo comportamiento.
 * POR QUÉ: el trinquete de la Fase 2 exige que `server.ts` baje de 11.800 líneas.
 * QUÉ SE QUEDA EN EL MONOLITO: `escribirImagenEnProyecto` — la ÚNICA autoridad
 * para escribir un binario en el proyecto — porque la comparte el endpoint
 * directo `/api/engine/imagen`. Se INYECTA aquí para no duplicarla (dos fuentes
 * de verdad acabarían discrepando). El resto de dependencias de estado
 * (credenciales de nube, runner Ollama, rutas seguras) también entran por `deps`.
 */
import type express from "express";
import type { Request, Response } from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PlanRunner } from "../../src/engine/planRunner";
import { GestorPlanes, crearAlmacenFs } from "../../src/engine/taskStoreFs";
import { crearEjecutorDePlanes } from "../../src/engine/planExecutors";
import type { EstadoSandboxCrudo } from "../../src/engine/estadoSandbox";
import { narrarDesdeAviso } from "../../src/engine/coreo";
import { generarImagen } from "../../src/engine/imageGen";
import { ejecutarEntidad, pensarConsejo } from "../../src/engine/reflejo/consejo";
import { TABLAS } from "../../src/engine/reflejo";
import { planificadorPorLeyes } from "../../src/engine/reflejo/orquestador";
import { validarPlan, resumenPlan, lineaEstadoTarea, type Plan } from "../../src/engine/taskPlanner";
import { fijarRuta, recorrerRuta, registrarProceso, resumenRuta, type ManualPerfeccion } from "../../src/engine/manualPerfeccion";
import { cargarDesdeDisco, guardarManual } from "../../src/engine/manualPerfeccionDisco";
import {
  resolverPresupuesto,
  siguienteEscalado,
  ESCALADOS,
  PERFILES_MR,
  ORDEN_MR,
  etiquetaEscalado,
  type MRId,
} from "../../src/engine/memoriaResiliente";
import { Brain } from "../../src/engine/brain";
import { hojaVivaParaPanel } from "../../src/engine/espejoVivo";

export interface DepsBrain {
  /** Instancia viva del cerebro (gobernanza: cerebro.md + memoria.md). */
  brain: Brain;
  /** Guard de las rutas mutantes: loopback o token (misma puerta que el resto). */
  sandboxAuthorized: (req: Request) => boolean;
  /** RAM de la máquina en GB, como la calculó el arranque. */
  RAM_GB: number;
  /**
   * v1.82.0 · FASE 3 punto 1: espejo de la capacidad `parallel_workers` del
   * panel. Opcional: sin ella el runner usa la base del perfil (comportamiento
   * histórico), nunca un valor adivinado.
   */
  paralelismoActivo?: () => boolean;
  /** Núcleos de CPU, como los calculó el arranque. */
  CPU_CORES: number;
  /** Raíz del proyecto (C:\Cerebronico). */
  PROJECT_ROOT: string;
  /** URL base de Ollama (la misma que usa el resto del servidor). */
  OLLAMA_DEFAULT: string;
  /** La ÚNICA autoridad para escribir una imagen en el proyecto (vive en el monolito). */
  escribirImagenEnProyecto: (rutaRel: string, data: Uint8Array) => string;
  /** Envía el binario a la bóveda indexada si el puente responde. */
  transportarABoveda: (opts: any) => Promise<any>;
  /** Nombre del proyecto activo en el sandbox. */
  nombreProyectoSandbox: () => string;
  /** ¿El modelo parece de Ollama local ("nombre:tag")? */
  pareceModeloOllamaPlan: (modelo: string) => boolean;
  /** Llamada no-stream a Ollama. */
  callOllamaNonStreaming: (...args: any[]) => Promise<any>;
  /** Proveedor de nube a partir del nombre del modelo. */
  proveedorDesdeModeloPlan: (modelo: string) => string;
  /** Clave API configurada para un proveedor. */
  clavePorProveedorPlan: (prov: string) => string | undefined;
  /** Modelo de nube por defecto de un proveedor. */
  modeloNubePorDefecto: (prov: string) => string;
  /** Petición no-stream a un modelo de nube. */
  pedirAModeloNubePlan: (opts: any) => Promise<string>;
  /** Resuelve una ruta relativa a una absoluta dentro del proyecto (anti-escape). */
  resolveSafePath: (relPath: string) => string;
  /** Fija las credenciales de nube reenviadas por el navegador. */
  fijarCredencialesNubePlan: (c: any) => void;
  /** Getter de las credenciales de nube vivas (var reasignable en el monolito). */
  credsNubePlan: () => { provider?: string } & Record<string, any>;
  /**
   * FASE 4 (v1.57.3) — Estado CRUDO del sandbox :3500 para la herramienta
   * `estado_sandbox`. Lo inyecta el monolito (es quien conoce el puerto, el
   * proceso y la raíz resuelta). Opcional: sin él, la tarea `estado_sandbox` se
   * declara NO DISPONIBLE en vez de inventar que la app corre.
   */
  estadoSandboxCrudo?: () => Promise<EstadoSandboxCrudo>;
}

/**
 * Registra las rutas del cerebro y del cerebro de tareas sobre `app`.
 * SE MUEVE, NO SE MEJORA: los cuerpos son los que vivían en el monolito.
 */
export function registrarBrain(app: express.Express, deps: DepsBrain) {
  const {
    brain,
    sandboxAuthorized,
    RAM_GB,
    CPU_CORES,
    PROJECT_ROOT,
    OLLAMA_DEFAULT,
    escribirImagenEnProyecto,
    transportarABoveda,
    nombreProyectoSandbox,
    pareceModeloOllamaPlan,
    callOllamaNonStreaming,
    proveedorDesdeModeloPlan,
    clavePorProveedorPlan,
    modeloNubePorDefecto,
    pedirAModeloNubePlan,
    resolveSafePath,
    fijarCredencialesNubePlan,
  } = deps;

  // ════════════════════════════════════════════════════════════════════════
  // CEREBRO DE TAREAS (v2.2) — lista de tareas, dependencias y paralelismo
  // ════════════════════════════════════════════════════════════════════════
  // El plan corre EN SEGUNDO PLANO: estos endpoints devuelven al instante y el
  // panel consulta el avance. Nada bloquea el chat.
  //
  // Los servicios se crean la PRIMERA vez que se usan, no al cargar el módulo:
  // así un problema de disco en `.cerebro-db` no impide arrancar el servidor.

  /** Modelo para las tareas de tipo "modelo" si el plan no dice otro.
   *  v1.46.6 — POR DEFECTO EN LA NUBE. Antes era `qwen2.5-coder:1.5b` (Ollama
   *  local), que en la PC de Mario la congela: el plan fallaba siempre y el
   *  cortacircuito "ollama" bloqueaba las 5 tareas. Ahora el plan usa el
   *  gratuito preconfigurado (GLM-4.5-Flash de Z.ai) y cae a Gemini si hace
   *  falta. `CN_PLAN_MODEL` sigue mandando si alguien quiere forzar otro. */
  const MODELO_PLAN_POR_DEFECTO = process.env.CN_PLAN_MODEL || "glm-4.5-flash";

  let runnerPlanes: PlanRunner | null = null;

  // ── EL MANUAL DE LA PERFECCIÓN (v1.79.0) ─────────────────────────────────
  // `perfeccion.md` / `perfeccion.json` en la raíz del proyecto: la cara a
  // disco del estado puro (src/engine/manualPerfeccion.ts). Se carga perezoso
  // la primera vez que el bucle lo toca — igual que el resto de servicios de
  // esta casa: un problema de disco no impide arrancar el servidor.
  let manualPerf: ManualPerfeccion | null = null;
  const versionApp = (): string => {
    try {
      return String(JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")).version);
    } catch {
      return "desconocida";
    }
  };
  const manualPerfLazo = (): ManualPerfeccion => {
    if (!manualPerf) manualPerf = cargarDesdeDisco(PROJECT_ROOT);
    return manualPerf;
  };
  const guardarManualPerf = (): void => {
    try {
      guardarManual(PROJECT_ROOT, manualPerfLazo(), versionApp());
    } catch (e: any) {
      console.warn(`[perfeccion] no se pudo guardar el manual: ${e?.message ?? e}`);
    }
  };

  /** Medición de la máquina, del mismo origen que usa el gobernador. */
  const medirMaquina = () => ({
    ramMedidaGB: RAM_GB,
    ramLibreGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
    nucleos: CPU_CORES,
  });

  /** Estado del reparto AHORA, con el motivo de cada número. */
  const presupuestoActual = (perfilForzado?: MRId) => {
    const p = resolverPresupuesto({ ...medirMaquina(), perfilForzado, escalado: runnerPlanes?.escaladoActual() ?? 1 });
    return {
      tramo: p.perfil.id,
      tramoNombre: p.perfil.nombre,
      ramDelTramoGB: p.perfil.ramGB,
      escalado: p.escalado,
      etiqueta: etiquetaEscalado(p.escalado),
      io: p.io,
      cpu: p.cpu,
      contextoPorTarea: p.contextoPorTarea,
      degradado: p.degradado,
      motivo: p.motivo,
    };
  };


  function obtenerRunner(): PlanRunner {
    if (runnerPlanes) return runnerPlanes;
    const dirDb = path.join(PROJECT_ROOT, ".cerebro-db");

    const gestor = new GestorPlanes(crearAlmacenFs(dirDb), {
      onAviso: (l) => narrarDesdeAviso(l), // COREO v1: consola + bus visual
    });
    const carga = gestor.cargar();
    console.log(
      `[Cerebro] Planes en disco: ${gestor.lista().length}` +
        (carga.interrumpidos.length ? ` · pausados por el reinicio: ${carga.interrumpidos.join(", ")}` : "") +
        (carga.avisos.length ? ` · avisos: ${carga.avisos.length}` : "")
    );

    const ejecutar = crearEjecutorDePlanes({
      modeloPorDefecto: MODELO_PLAN_POR_DEFECTO,
      onAviso: (l) => narrarDesdeAviso(l), // COREO v1: consola + bus visual

      // v2.3 — Cadena de imágenes gratuitas. La validación de prompt/dimensiones
      // la hace el ejecutor con el MISMO código que usa el endpoint
      // /api/engine/imagen; aquí solo se inyectan las claves de esta máquina.
      // BÓVEDA/IMAGEN v5: `intentos: 2` — el reintento corto (2.5 s) dentro de
      // la tarea, antes del drenaje de cola de 45 s del planificador. La
      // congestión del gratuito se va sola al segundo golpe (medido).
      generarImagen: ({ prompt, ancho, alto, modelo, seed, senal, intentos }) =>
        generarImagen({
          prompt,
          ancho,
          alto,
          modelo,
          seed,
          senal,
          intentos: intentos ?? 2,
          tokenPollinations: process.env.POLLINATIONS_API_KEY?.trim() || undefined,
          keyGemini: process.env.GEMINI_API_KEY?.trim() || undefined,
        }),

      // La escritura binaria tiene UNA sola autoridad (ver arriba): la orden
      // del chat ya auditó la ruta, y esto es la segunda comprobación, la misma
      // que usa el endpoint directo. BÓVEDA v1: después de guardar en el
      // sandbox, la imagen VIAJA al disco real indexado si el puente responde.
      guardarBinario: async (rutaRel, data, mime) => {
        const ruta = escribirImagenEnProyecto(rutaRel, data);
        try {
          const linea = await transportarABoveda({
            bytes: data,
            mime: String(mime || "image/jpeg"),
            proyecto: nombreProyectoSandbox(),
            archivo: String(rutaRel).split(/[\\/]/).pop() || "imagen",
            origenSandbox: ruta,
          });
          if (linea) narrarDesdeAviso(linea);
        } catch {}
        return ruta;
      },

      // v2.5 AGÉNTICO — las 40 entidades del consejo como primitivas del motor.
      // El planificador las despacha con su presupuesto normal; una herramienta
      // tarda microsegundos, así que cuarenta en paralelo no mueven el semáforo.
      entidad: async (id, datos) => ejecutarEntidad(id, datos),
      reflejar: async (frase) => pensarConsejo(frase, TABLAS.max),
      // GRUPO v1 (Reflejo v5): una tarea `reflejo` que trae solo frase se
      // enruta por LEY (determinista, ~1 ms) cuando el votante neural no
      // está o no decide. El orquestador responde con espejo + datos +
      // confianza; si tiene dudas, lo dice y el planificador reintenta por
      // otro carril en vez de callar.
      orquestar: async (frase) => planificadorPorLeyes(frase),

      // FASE 4 (v1.57.3) — El modelo «ve» el :3500. Solo lectura: la primitiva
      // la inyecta el monolito (conoce puerto/proceso/raíz). Si no viene, la
      // tarea `estado_sandbox` falla honestamente en vez de fingir.
      estadoSandbox: deps.estadoSandboxCrudo,

      pedirModelo: async ({ prompt, modelo, contexto, senal }) => {
        const modeloFinal = modelo || MODELO_PLAN_POR_DEFECTO;
        const mensajes: any[] = [];
        if (contexto) mensajes.push({ role: "system", content: contexto });
        mensajes.push({ role: "user", content: prompt });

        // v1.46.6 — EL PLAN VA A LA NUBE POR DEFECTO. Antes SIEMPRE llamaba a
        // Ollama local (congela la PC de Mario) y el plan fallaba entero. Ahora:
        //  1) Si el modelo pedido es de Ollama ("nombre:tag") Y Ollama responde,
        //     se usa Ollama (compatibilidad para quien sí lo tenga).
        //  2) En cualquier otro caso —y como respaldo si Ollama no está— se usa
        //     la nube: proveedor del modelo → proveedor elegido en el panel →
        //     Z.ai (GLM gratis) → Gemini. El primero que tenga clave y responda.
        const esOllama = pareceModeloOllamaPlan(modeloFinal);

        if (esOllama) {
          try {
            const url = (process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "");
            const r = await callOllamaNonStreaming(url, modeloFinal, mensajes, 0.2, () => senal.aborted, []);
            const texto = String(r?.message?.content ?? r?.response ?? "");
            if (texto.trim()) return texto;
          } catch { /* Ollama no está / se negó: caemos a la nube abajo. */ }
        }

        // Camino de nube. Orden de candidatos sin repetir.
        const provPanel = (deps.credsNubePlan().provider || "").trim().toLowerCase();
        const provModelo = esOllama ? "" : proveedorDesdeModeloPlan(modeloFinal);
        // v1.58.4 — El proveedor ELEGIDO en el panel manda sobre la deducción por
        //   nombre. Antes `provModelo` (adivinado del id) iba primero, y para
        //   Cerebras/Together/Fireworks ese adivine es incorrecto (p. ej.
        //   "llama3.1-8b" de Cerebras se leía como Groq, y "qwen-coder" caía a Z.ai),
        //   así que el modelo que Mario elegía NUNCA se usaba: se mandaba el default
        //   de otro proveedor. Ahora el provider del panel va primero y, para él,
        //   se respeta el modelo tal cual fue elegido.
        const candidatos = Array.from(new Set(
          [provPanel, provModelo, "zai", "gemini"].filter((p) => p && p !== "ollama" && p !== "custom")
        ));

        const errores: string[] = [];
        for (const prov of candidatos) {
          const key = clavePorProveedorPlan(prov);
          if (!key) { errores.push(`${prov}: sin clave`); continue; }
          // Se respeta el modelo ELEGIDO cuando este `prov` es el del panel
          //   (elección explícita del usuario) O cuando la deducción por nombre
          //   coincide. En cualquier otro caso, el modelo por defecto del proveedor.
          const mdl = (!esOllama && (prov === provPanel || provModelo === prov))
            ? modeloFinal
            : modeloNubePorDefecto(prov);
          try {
            if (senal.aborted) throw new Error("tarea cancelada");
            return await pedirAModeloNubePlan({ provider: prov, modelo: mdl, apiKey: key, mensajes, temperatura: 0.2 });
          } catch (e: any) {
            errores.push(`${prov}: ${e?.message || e}`);
          }
        }
        // v1.56.8 — EL ATASCO EMPIEZA AQUÍ. Sin ninguna clave, `errores` queda en
        // ["zai: sin clave", "gemini: sin clave"] y se lanzaba un Error normal.
        // `classifyError` no lo reconoce → cae en «desconocido = retryable» →
        // `recordFailure` ABRE el cortacircuito "modelo-nube" (3 tareas × 1 fallo)
        // → todas las demás quedan `bloqueada` y el tablero dice «Atascado» para
        // siempre. Reintentar una clave que no está puesta no cambia nada: es un
        // error de CONFIGURACIÓN, y `resilience` ya tiene canal para decirlo.
        // Se marca `noReintentar` SOLO cuando ningún proveedor tenía clave o todos
        // fallaron por eso: un 429 real sigue siendo reintentable como siempre.
        const soloFaltaClave =
          errores.length === 0 || errores.every((e) => /\bsin clave\b/.test(e));
        const err = new Error(
          `No se pudo ejecutar la tarea de modelo. ${esOllama ? "Ollama no respondió y " : ""}` +
          `la nube falló → ${errores.join(" · ") || "ningún proveedor con clave"}. ` +
          `Pega una clave gratuita de Z.ai o Gemini en «Ranuras API».`
        ) as Error & { noReintentar?: boolean; fatal?: boolean };
        if (soloFaltaClave) {
          err.noReintentar = true;
          err.fatal = true;
        }
        throw err;
      },

      leerArchivo: async (ruta) => {
        const abs = resolveSafePath(ruta);
        if (!fs.existsSync(abs)) throw new Error(`No existe el archivo «${ruta}» dentro del proyecto.`);
        return fs.readFileSync(abs, "utf-8");
      },

      // v1.60.9 — LA MANO QUE ESTABA DECLARADA PERO NUNCA CABLEADA. El
      // superPrompt anuncia `escribir_archivo` como herramienta disponible y el
      // modelo construye planes que la usan, pero esta fábrica jamás inyectaba
      // la primitiva: TODA tarea `escribir_archivo` caía en el guard de honestidad
      // de planExecutors («este contexto no tiene escritura de archivos cableada»)
      // y el plan salía entero en rojo. Se cablea con el MISMO patrón que
      // `leerArchivo`: `resolveSafePath` re-confina la ruta (anti-escape) y `fs`
      // escribe en el proyecto que sirve el :3500. Devuelve la ruta relativa
      // real para que la PUERTA DE EVIDENCIA la verifique en disco.
      escribirArchivo: async (rutaRel, contenido) => {
        const abs = resolveSafePath(rutaRel); // 2.ª comprobación de confinamiento
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, contenido, "utf-8");
        return path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
      },

      // v1.60.9 — PUERTA DE EVIDENCIA: el motor la llama DESPUÉS de escribir y
      // falla la tarea si el disco no confirma lo que la escritura dijo. Lee
      // tamaño real; si no existe, `existe:false` y la tarea se marca roja
      // (plan verde ≠ archivo en disco).
      verificarArchivo: async (rutaRel) => {
        try {
          const abs = resolveSafePath(rutaRel);
          const st = fs.statSync(abs);
          return { existe: st.isFile(), bytes: st.size };
        } catch {
          return { existe: false, bytes: 0 };
        }
      },

      guardarResultado: async (nombre, texto, extension) => {
        const dir = path.join(dirDb, "resultados");
        fs.mkdirSync(dir, { recursive: true });
        // La extensión importa: un YAML guardado como .txt es un archivo mal
        // etiquetado, y mal etiquetar archivos es lo que este proyecto no hace.
        const limpia = (extension || "txt").replace(/[^a-z0-9]/gi, "").toLowerCase() || "txt";
        // El nombre viene de los datos de la tarea, o sea de fuera: se sanea
        // entero. Sin esto, un nombre con «../» escribiría fuera de la carpeta.
        const seguro = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(0, 80) || "resultado";
        const f = path.join(dir, `${seguro}-${Date.now()}.${limpia}`);
        fs.writeFileSync(f, texto, "utf-8");
        return path.relative(PROJECT_ROOT, f).split(path.sep).join("/");
      },
    });

    runnerPlanes = new PlanRunner({
      ejecutar,
      medir: medirMaquina,
      gestor,
      // v1.82.0 · FASE 3 punto 1: la capacidad del panel manda sobre la base de
      // workers; el criterio (clamp 2..núcleos-1..8 + degradación por RAM) vive en
      // src/engine/gobernante.ts y se aplica en calcularLimitesGlobales.
      paralelismoActivo: deps.paralelismoActivo,
      // v1.79.0 — EL BUCLE RECORRE LA RUTA QUE EL PLAN FIJO: cada ruta
      // relativa que termina se anota en el manual con su verdad — validada
      // SOLO con evidencia de ejecución (ESCRIBIR NO ES PROBAR), fallida con
      // causa, o cerrada sin evidencia. Nunca tumba la ejecución.
      onTareaTerminada: (p, t) => {
        const transicion =
          t.estado === "hecha" && t.resultado
            ? { tareaId: t.id, estado: "validada" as const, evidencia: `${t.resultado.resumen}${t.resultado.artefactos?.length ? ` · artefactos: ${t.resultado.artefactos.join(", ")}` : ""}` }
            : t.estado === "hecha"
              ? { tareaId: t.id, estado: "cerrada_sin_evidencia" as const }
              : { tareaId: t.id, estado: "fallida" as const, causa: t.error ? `${t.error.clase}: ${t.error.mensaje}` : "(sin causa)" };
        recorrerRuta(manualPerfLazo(), p.id, transicion, Date.now());
        guardarManualPerf();
      },
    });
    return runnerPlanes;
  }

  /** Vista de un plan lista para el panel (con las líneas ya formateadas). */
  const planParaPanel = (plan: Plan, perfilForzado?: MRId) => ({
    id: plan.id,
    objetivo: plan.objetivo,
    estado: plan.estado,
    creadoEn: plan.creadoEn,
    enSegundoPlano: runnerPlanes?.enSegundoPlano(plan.id) || false,
    tareas: plan.tareas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      peso: t.peso,
      tipo: t.tipo || "modelo",
      estado: t.estado,
      dependeDe: t.dependeDe,
      intentos: t.intentos,
      motivoEspera: t.motivoEspera || null,
      ms: t.coste?.ms ?? null,
      error: t.error ? `${t.error.clase}: ${t.error.mensaje}` : null,
      resultado: t.resultado?.resumen || null,
      artefactos: t.resultado?.artefactos || [],
      linea: lineaEstadoTarea(t),
    })),
    resumen: resumenPlan(plan),
    noTerminadas: plan.noTerminadas || [],
    log: (plan.log || []).slice(-60),
    presupuesto: presupuestoActual(perfilForzado),
  });

  /** Estado del cerebro: escalado, semáforo global y tramos MR. */
  app.get("/api/brain/runner", (_req: Request, res: Response) => {
    const runner = obtenerRunner();
    return res.json({
      ok: true,
      escalado: runner.escaladoActual(),
      etiqueta: etiquetaEscalado(runner.escaladoActual()),
      escaladosDisponibles: ESCALADOS,
      tramoFijado: runner.tramoActual(),
      // v1.82.0 · lo que el gobernador está aplicando AHORA (panel lo pinta).
      gobernante: runner.estadoGobernante(),
      semaforo: runner.estadoSemaforo(),
      activos: runner.activos(),
      planes: runner.listaPlanes().length,
      modeloPorDefecto: MODELO_PLAN_POR_DEFECTO,
      tramosMR: ORDEN_MR.map((id) => ({
        id,
        nombre: PERFILES_MR[id].nombre,
        ramGB: PERFILES_MR[id].ramGB,
        ioBase: PERFILES_MR[id].ioBase,
        cpuBase: PERFILES_MR[id].cpuBase,
        contextoPorTarea: PERFILES_MR[id].contextoPorTarea,
        modeloRecomendado: PERFILES_MR[id].modeloRecomendado,
      })),
      presupuesto: presupuestoActual(),
      notas: runner.avisosRecientes(),
    });
  });

  /** El botón: «cerebro resiliente ×1 ×2 ×4 ×6 ×8». Afecta incluso a lo que ya corre. */
  app.post("/api/brain/scale", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const pedido = req.body?.escalado;
    // Sin valor: el botón avanza al siguiente (×1 → ×2 → ×4 → ×6 → ×8 → ×1).
    const objetivo = pedido == null ? siguienteEscalado(runner.escaladoActual()) : Number(pedido);
    const r = runner.escalar(objetivo);
    return res.json({ ok: true, escalado: r.escalado, etiqueta: etiquetaEscalado(r.escalado), semaforo: r.limites, motivo: r.motivo });
  });

  /**
   * El selector de tramo MR: automático o forzado a MR#1..#4.
   * Se aplica EN CALIENTE, también a los planes que ya están corriendo.
   */
  app.post("/api/brain/tramo", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const pedido = req.body?.tramo;
    const esAuto = pedido == null || pedido === "" || String(pedido).toLowerCase() === "auto";
    const mr = esAuto ? undefined : (String(pedido).toUpperCase() as MRId);
    if (mr && !ORDEN_MR.includes(mr)) {
      return res.status(400).json({ ok: false, error: `Tramo desconocido: «${pedido}». Válidos: auto, ${ORDEN_MR.join(", ")}.` });
    }
    const r = runner.fijarTramo(mr);
    // v2.1 — `fijarTramo` ya devuelve `{ ok: true, … }`: el literal de delante
    // se descartaba. `presupuesto` sí va después y por eso se conserva.
    return res.json({ ...r, presupuesto: presupuestoActual(mr) });
  });

  /**
   * Planes guardados, en la forma que LEEN los paneles. v1.22.0 — dos arreglos:
   * `tareas` era un NÚMERO donde los paneles leen un ARRAY (el contador nunca
   * podía salir de 0), y la HOJA VIVA del bucle entra delante marcada ⚡ para
   * que el panel se llene solo mientras el motor trabaja.
   */
  app.get("/api/brain/plans", (_req: Request, res: Response) => {
    const runner = obtenerRunner();

    // v1.56.8 · DESATASCO AUTOMÁTICO, enganchado a este sondeo.
    // El panel ya pregunta cada 1,5 s (y cada 8 s en reposo), así que NO hace falta
    // un temporizador nuevo: el latido existe. Lo que no existía era la ACCIÓN: el
    // tablero pintaba «Atascado» y ahí moraba, de modo que el cartel rojo se quedaba
    // puesto aunque el cortacircuito hubiera enfriado hace un minuto. Se desatasca
    // ANTES de leer los planes, para que el usuario vea el estado DESPUÉS de
    // intervenir, no el de antes.
    for (const p of runner.listaPlanes()) {
      try {
        if (p.tareas.some((t) => t.estado === "bloqueada") || p.estado === "pausado") {
          runner.desatascarAutomatico(p.id);
        }
      } catch (e: any) {
        // Un desatasco fallido jamás debe tumbar el sondeo del panel.
        console.warn(`[brain] desatasco automático falló en plan ${p.id}: ${e?.message ?? e}`);
      }
    }

    const guardados = runner.listaPlanes().map((p) => planParaPanel(p));
    const espejo = hojaVivaParaPanel();
    return res.json({
      ok: true,
      planes: espejo ? [espejo, ...guardados] : guardados,
      semaforo: runner.estadoSemaforo(),
      escalado: runner.escaladoActual(),
    });
  });

  /**
   * Crea un plan. Valida dependencias y CICLOS ANTES de aceptarlo: un ciclo no
   * se ejecuta nunca (se colgaría), y devolverlo como texto legible es más útil
   * que un plan que se queda girando.
   */
  app.post("/api/brain/plan", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const objetivo = String(req.body?.objetivo || "").trim();
    const tareasBrutas = Array.isArray(req.body?.tareas) ? req.body.tareas : [];
    if (!objetivo) return res.status(400).json({ ok: false, error: "Falta «objetivo»: es obligatorio." });
    if (tareasBrutas.length === 0) return res.status(400).json({ ok: false, error: "El plan no trae tareas." });

    const modeloDelPlan = typeof req.body?.modelo === "string" ? req.body.modelo : "";
    const plantilla = typeof req.body?.contexto === "string" ? req.body.contexto : "";

    // v1.46.6 — El navegador reenvía aquí sus claves de nube y el proveedor
    // elegido, porque el runner corre en el servidor y no ve el localStorage.
    // Así el plan puede usar Z.ai/Gemini (lo que la PC de Mario sí soporta) en
    // vez de Ollama local.
    if (req.body?.claves && typeof req.body.claves === "object") {
      fijarCredencialesNubePlan(req.body.claves as any);
    }
    if (typeof req.body?.provider === "string" && req.body.provider.trim()) {
      fijarCredencialesNubePlan({ provider: req.body.provider.trim() });
    }

    // Se normaliza lo que llega: nunca se pasa al motor algo sin comprobar.
    const tareas = tareasBrutas.map((t: any, i: number) => {
      const tipo = typeof t?.tipo === "string" && t.tipo ? t.tipo : "modelo";
      const datos: Record<string, unknown> = t?.datos && typeof t.datos === "object" ? { ...t.datos } : {};
      if (tipo === "modelo") {
        if (modeloDelPlan && !datos.modelo) datos.modelo = modeloDelPlan;
        if (plantilla && !datos.contexto) datos.contexto = plantilla;
      }
      return {
        id: String(t?.id || i + 1),
        titulo: String(t?.titulo || `tarea ${i + 1}`),
        peso: t?.peso === "cpu" ? ("cpu" as const) : ("io" as const),
        tipo,
        datos,
        dependeDe: Array.isArray(t?.dependeDe) ? t.dependeDe.map((d: any) => String(d)) : [],
        // Las tareas de un mismo proveedor comparten cortacircuito: si el
        // servicio de modelo (nube) o el gratuito de imagen se cae, no se
        // queman reintentos en cada tarea. v1.46.6 — antes la clave era
        // "ollama"; como el plan ya va a la nube por defecto, la clave es
        // "modelo-nube" (así un estado viejo del circuito "ollama" no bloquea).
        claveCircuito: tipo === "modelo" ? "modelo-nube" : tipo === "generar_imagen" ? "imagen" : undefined,
      };
    });

    const plan = runner.crear(objetivo, tareas);
    const v = validarPlan(plan);
    if (!v.ok) {
      // Un plan inválido no se queda guardado como si fuera bueno.
      plan.estado = "fallido";
      return res.status(400).json({ ok: false, error: v.error, planId: plan.id });
    }

    // v1.79.0 — AL CREARSE EL PLAN SE FIJA SU RUTA EN EL MANUAL (objetivo +
    // sus rutas relativas). Solo para lo que de verdad va a correr: un plan
    // inválido no fija nada.
    fijarRuta(
      manualPerfLazo(),
      { id: plan.id, objetivo, tareas: plan.tareas.map((t) => ({ id: t.id, titulo: t.titulo, tipo: t.tipo })) },
      Date.now()
    );
    guardarManualPerf();

    let lanzado: { ok: boolean; motivo: string } | null = null;
    if (req.body?.autoLanzar !== false) lanzado = runner.lanzar(plan.id);

    return res.json({
      ok: true,
      planId: plan.id,
      lanzado,
      plan: planParaPanel(plan),
      message: lanzado?.ok
        ? `Plan ${plan.id} creado y lanzado en segundo plano (${plan.tareas.length} tareas).`
        : `Plan ${plan.id} creado (${plan.tareas.length} tareas) pero NO se lanzó.`,
    });
  });

  /**
   * v1.79.0 · LA PUERTA DEL MANUAL DE LA PERFECCIÓN. Cuando la auto-mejora del
   * navegador ACTÚA (una lección se refuerza: el turno salió bien con ella
   * presente) o cualquier bucle del motor valida un proceso (veredicto verde
   * de autovalido/ouroboros, entrega autoverificada), lo registra acá: queda
   * en `perfeccion.md` con su comando y su veredicto. Con guard, como el
   * resto de las mutantes de esta casa.
   */
  app.post("/api/perfeccion", (req: Request, res: Response) => {
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const b = (req.body || {}) as Record<string, unknown>;
    const m = manualPerfLazo();
    if (b.tipo === "proceso") {
      const nombre = String(b.nombre || "").trim();
      const veredicto = String(b.veredicto || "").trim();
      if (!nombre || !veredicto) return res.status(400).json({ ok: false, error: "Faltan «nombre» y «veredicto»." });
      const p = registrarProceso(
        m,
        { nombre, comando: b.comando ? String(b.comando) : undefined, veredicto, origen: b.origen ? String(b.origen) : "proceso" },
        Date.now()
      );
      guardarManualPerf();
      return res.json({ ok: true, proceso: p });
    }
    if (b.tipo === "leccion") {
      const texto = String(b.texto || "").trim();
      if (!texto) return res.status(400).json({ ok: false, error: "Falta «texto» de la lección." });
      const p = registrarProceso(
        m,
        {
          nombre: (String(b.nombre || "lección reforzada").trim() || "lección reforzada").slice(0, 120),
          veredicto: `turno ok con la lección presente (ayudó ${b.helped != null ? b.helped : "?"}×) — ${texto.slice(0, 200)}`,
          origen: "auto-mejora",
        },
        Date.now()
      );
      guardarManualPerf();
      return res.json({ ok: true, proceso: p });
    }
    return res.status(400).json({ ok: false, error: "tipo inválido: use «proceso» o «leccion»." });
  });

  /** Estado del manual (leído solo): qué rutas se fijaron, cómo quedaron, y los últimos procesos validados. */
  app.get("/api/perfeccion", (_req: Request, res: Response) => {
    const m = manualPerfLazo();
    return res.json({
      ok: true,
      rutas: m.rutas.map((r) => ({
        id: r.id,
        objetivo: r.objetivo,
        fijadaEn: r.fijadaEn,
        completadaEn: r.completadaEn ?? null,
        resumen: resumenRuta(m, r.id),
        tareas: r.tareas.map((t) => ({ id: t.id, titulo: t.titulo, estado: t.estado })),
      })),
      procesos: m.procesos.slice(-50),
    });
  });

  /**
   * Reintento de UNA tarea (v1.56.8). Sin esto, la única salida de una tarea
   * fallida era relanzar el plan entero — y con las claves sin poner, repetir el
   * mismo fallo tres veces. El `motivo` se devuelve SIEMPRE: rechazar en silencio
   * es justo lo que hacía parecer que «el botón de reinicio no estaba».
   */
  app.post("/api/brain/plan/:id/retry-tarea", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const cuerpo = (req.body || {}) as Record<string, unknown>;
    const tarea = String(cuerpo.tarea ?? "").trim();
    if (!tarea) return res.status(400).json({ ok: false, motivo: "Falta el id de la tarea (`tarea`)." });
    const r = runner.reintentarTarea(String(req.params.id), tarea);
    return res.status(r.ok ? 200 : 409).json(r);
  });

  /** Estado completo de un plan. */
  app.get("/api/brain/plan/:id", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const plan = runner.listaPlanes().find((p) => p.id === String(req.params.id));
    if (!plan) return res.status(404).json({ ok: false, error: `No existe el plan ${req.params.id}.` });
    return res.json({ ok: true, plan: planParaPanel(plan) });
  });

  /** Cancelar: inmediato de verdad, no «cuando acabe la siguiente tarea». */
  app.post("/api/brain/plan/:id/cancel", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.cancelar(String(req.params.id));
    return res.status(r.ok ? 200 : 404).json(r);
  });

  /** Reanudar un plan pausado (reinicio) o cancelado. Lo ya hecho NO se repite. */
  app.post("/api/brain/plan/:id/resume", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.reanudar(String(req.params.id));
    return res.status(r.ok ? 200 : 404).json(r);
  });

  /** Borrar un plan viejo (v1.46.7). Un plan EN CURSO se rechaza: cancelar antes. */
  const borrarPlan = (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.borrar(String(req.params.id));
    const codigo = r.ok ? 200 : /ejecutando/.test(r.motivo) ? 409 : 404;
    return res.status(codigo).json(r);
  };
  app.delete("/api/brain/plan/:id", borrarPlan);
  app.post("/api/brain/plan/:id/delete", borrarPlan);

  /** Estado completo: métricas, ley cargada, memoria, historial y propuestas. */
  app.get("/api/brain", (_req: Request, res: Response) => {
    try {
      return res.json({
        ok: true,
        stats: brain.stats(),
        estado: brain.getMemoria().split("\n").filter((l) => l.startsWith("- **")).slice(0, 5),
        historial: brain.listarHistorial().slice(0, 10),
        propuestas: brain.listarPropuestas(),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Estado operativo de la sesión. */
  app.post("/api/brain/state", (req: Request, res: Response) => {
    const { fase, hito, bloqueos } = req.body || {};
    const ok = brain.updateState({ fase, hito, bloqueos });
    return res.json({ ok, stats: brain.stats() });
  });

  /** Decisión arquitectónica (ADR Log). */
  app.post("/api/brain/decision", (req: Request, res: Response) => {
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    return res.json({ ok: brain.addDecision(texto) });
  });

  /** Lección aprendida (preferencias y errores que no se deben repetir). */
  /**
   * v1.9.0 — de endpoint huérfano a pieza del ciclo de aprendizaje.
   *
   * QUÉ ES: la puerta por la que una lección aprendida en el navegador entra en la
   * memoria del cerebro (`memoria.md`).
   * PARA QUÉ SIRVE: para que el aprendizaje sobreviva a limpiar los datos del
   * navegador. Hasta v1.9.0 no lo llamaba NADIE: las lecciones vivían solo en
   * `localStorage` y la promesa D9 estaba escrita pero sin cumplir.
   *
   * Lleva guard porque ESCRIBE en la memoria del cerebro: es la misma puerta que
   * el resto de rutas mutantes (fuera de loopback, sin token, no se pasa).
   */
  app.post("/api/brain/lesson", (req: Request, res: Response) => {
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    return res.json({ ok: brain.addLesson(texto) });
  });

  /**
   * Analiza un texto del modelo buscando PROPUESTAS DE AUTO-MEJORA del cerebro.
   * Nunca se aplican solas: se guardan en .cerebro-db/proposals/ para que un
   * humano las apruebe (cerebro.md es el núcleo inmutable).
   */
  app.post("/api/brain/scan", (req: Request, res: Response) => {
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    const detectadas = Brain.detectarPropuestas(texto);
    const guardadas: string[] = [];
    for (const p of detectadas) {
      const ruta = brain.guardarPropuesta(p);
      if (ruta) guardadas.push(ruta.split(/[\\/]/).pop() || ruta);
    }
    return res.json({ ok: true, detectadas: detectadas.length, guardadas, propuestas: brain.listarPropuestas() });
  });

  /** Historial completo de la memoria (para rollback). */
  app.get("/api/brain/history", (_req: Request, res: Response) => {
    return res.json({ ok: true, historial: brain.listarHistorial() });
  });

  /** Rollback: restaura una copia del historial (guarda antes la actual). */
  app.post("/api/brain/rollback", (req: Request, res: Response) => {
    const archivo = String(req.body?.archivo || "");
    if (!archivo) return res.status(400).json({ ok: false, error: "Falta 'archivo'." });
    const ok = brain.rollback(archivo);
    return res.json({ ok, stats: brain.stats() });
  });

  /** Compresión manual del estado (purga ruido conservando lo crítico). */
  app.post("/api/brain/compact", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...brain.compactar() });
  });

  /** Vista previa del bloque que se inyecta en el prompt, por nivel de modelo. */
  app.get("/api/brain/prompt", (req: Request, res: Response) => {
    const nivel = String(req.query.nivel || "standard");
    return res.json({ ok: true, nivel, bloque: brain.systemBlock(nivel as any) });
  });
}
