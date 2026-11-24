/**
 * enjambre.ts — ROUTER DE LA RESPUESTA ECLÉCTICA (v1.80.0)
 * ========================================================
 * QUÉ ES: las dos rutas del enjambre.
 *
 *   GET  /api/enjambre/estado     qué se puede hacer hoy (capacidades, proveedores
 *                                 que el motor sabe llamar, criterio en uso)
 *   POST /api/enjambre/consultar  UN prompt → varias voces en paralelo → evaluación
 *                                 de cada respuesta → veredicto final de la tarea
 *   POST /api/enjambre/evaluar    las respuestas YA existen (las produjo el chat o el
 *                                 orquestador de planes): solo evaluar y sentenciar
 *
 * POR QUÉ ACÁ y no en `server.ts`: el trinquete del contrato (`contrato-rutas.json`)
 * dice que el monolito se parte, no se crece. El registro en el monolito son DOS
 * líneas (import + llamada), y el cable completo vive aquí.
 *
 * QUIÉN DECIDE QUÉ: el criterio es puro (`src/engine/enjambreEclectico.ts`), las
 * llamadas son este archivo más `server/enjambreLlamadas.ts`. Si mañana el juez
 * cambia de modelo, el criterio y sus pruebas no se tocan.
 *
 * SEGURIDAD: misma puerta que las rutas mutantes del cerebro (loopback o token,
 * `sandboxAuthorized`). Las claves entran por el cuerpo desde el navegador del
 * usuario y NO se guardan: no se escriben en disco, no se loguean, no viajan en
 * la respuesta.
 */
import type express from "express";
import type { Request, Response } from "express";
import {
  armarEnjambre,
  armarPromptConMemoria,
  evaluarRespuesta,
  informeEclectico,
  medirConsenso,
  medirBucleRepeticion,
  sustanciaDeInforme,
  parsearVeredictoJuez,
  promptDelJuez,
  CRITERIO_POR_DEFECTO,
  MEMORIA_MAX_TURNOS,
  MEMORIA_CHARS_POR_TURNO,
  ADJUNTOS_MAX_IMAGENES,
  veredictoMedido,
  veredictoNinguno,
  revisarVeredictoDelEnjambre,
  tareaPideEjecucion,
  SISTEMA_EJECUTOR,
  promptDeEjecucion,
  bloqueDeObra,
  type VozPlana,
  type TurnoMemoria,
  type AdjuntoPlano,
} from "../../src/engine/enjambreEclectico";
import { llamarJuez, llamarVoces, ejecutarTareaConHerramientas, puedeEjecutar, PROVEEDORES_CONOCIDOS, type CredencialesEnjambre, type ResultadoEjecucion } from "../enjambreLlamadas";

export interface DepsEnjambre {
  /** Loopback o token: la misma puerta de las rutas mutantes del cerebro. */
  sandboxAuthorized: (req: Request) => boolean;
  /** El motor de capacidades, para respetar el interruptor del panel. */
  features?: { isOn(id: any): boolean } | null;
  /** URL de Ollama por defecto (la misma del resto del servidor). */
  ollamaUrl?: string;
  /**
   * v1.88.0 · LA FASE 2: el ejecutor real del IDE. Sin esto inyectado el enjambre
   * sigue deliberando igual, pero declara que no pudo ejecutar — no lo finge.
   */
  ejecutor?: { ejecutarHerramienta: (nombre: string, args: any) => Promise<string>; herramientas: any[] } | null;
}

/** Lo que el informe necesita de la fase 2: el resultado + si se intentó. */
type EjecucionInforme = ResultadoEjecucion & { intentado: boolean; ejecutor?: string };

/** Las rutas del dominio: se comprueban, no se decoran. */
export const RUTAS_ENJAMBRE = ["GET /api/enjambre/estado", "POST /api/enjambre/consultar", "POST /api/enjambre/evaluar"] as const;

interface CuerpoConsulta {
  /** v2.3.6 · ranura de voz: modelos que el usuario eligió que hablen. */
  vocesFijas?: Array<{ provider: string; modelId: string; name?: string }>;
  tarea?: string;
  voces?: Array<{ provider?: string; modelId?: string; name?: string }>;
  tieneClave?: Record<string, boolean>;
  actual?: { provider?: string; modelId?: string } | null;
  juez?: { provider?: string; modelId?: string } | null;
  incluirLocales?: boolean;
  maximas?: number;
  credenciales?: CredencialesEnjambre;
  /** v1.84.5 · memoria de la sesión y archivos del mensaje actual. */
  historial?: TurnoMemoria[];
  adjuntos?: Array<{ nombre?: string; tipo?: string; esImagen?: boolean; base64?: string }>;
}

/** Deja las credenciales listas para llamar, sin dejar rastro de ellas. */
function normalizarCredenciales(cuerpo: CuerpoConsulta, ollamaPorDefecto?: string): CredencialesEnjambre {
  const c = cuerpo.credenciales || {};
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.keys || {})) {
    if (typeof v === "string" && v.trim()) keys[k] = v.trim();
  }
  return {
    ollamaUrl: String(c.ollamaUrl || ollamaPorDefecto || "http://127.0.0.1:11434"),
    keys,
    customUrl: String(c.customUrl || "").trim(),
    customKey: String(c.customKey || "").trim(),
  };
}

export function registrarEnjambre(app: express.Express, deps: DepsEnjambre): void {
  /** El estado: qué sabe hacer el enjambre hoy, sin prometer lo que no puede. */
  app.get("/api/enjambre/estado", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      capacidad: {
        eclectico: deps.features ? deps.features.isOn("consejo_eclectico") : false,
        relevo: deps.features ? deps.features.isOn("auto_relay") : false,
      },
      proveedores: PROVEEDORES_CONOCIDOS,
      criterio: CRITERIO_POR_DEFECTO,
    });
  });

  /** UN prompt, varias voces, evaluación y veredicto. */
  app.post("/api/enjambre/consultar", async (req: Request, res: Response) => {
    // Guarda explícita (la cuenta el contrato): loopback o token, como las mutantes.
    if (!deps.sandboxAuthorized(req)) {
      return res.status(403).json({ ok: false, error: "El enjambre solo responde a esta máquina (loopback o token)." });
    }
    const cuerpo: CuerpoConsulta = req.body || {};
    const tarea = String(cuerpo.tarea || "").trim();
    if (!tarea) return res.status(400).json({ ok: false, error: "Falta la tarea: sin prompt no hay enjambre." });

    const candidatos: VozPlana[] = (cuerpo.voces || [])
      .filter((v) => v && v.provider && v.modelId)
      .map((v) => ({ provider: String(v.provider), modelId: String(v.modelId), name: v.name ? String(v.name) : undefined }));
    const actual = cuerpo.actual && cuerpo.actual.modelId
      ? { provider: String(cuerpo.actual.provider || ""), modelId: String(cuerpo.actual.modelId) }
      : null;

    // v2.3.6 · la ranura de voz del usuario (los modelos que él elige que hablen).
    const fijadas = (Array.isArray(cuerpo.vocesFijas) ? cuerpo.vocesFijas : [])
      .filter((v: any) => v && typeof v.provider === "string" && typeof v.modelId === "string")
      .map((v: any) => ({ provider: String(v.provider), modelId: String(v.modelId), name: v.name ? String(v.name) : undefined }));

    const armado = armarEnjambre(candidatos, cuerpo.tieneClave || {}, {
      maximas: Number.isFinite(Number(cuerpo.maximas)) ? Number(cuerpo.maximas) : CRITERIO_POR_DEFECTO.maximas,
      incluirLocales: cuerpo.incluirLocales === true,
      actual,
      vocesFijas: fijadas,
    });
    if (armado.voces.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Ninguna voz pasó la aduana: cargá modelos en ⭐ Favoritos o en la ranura de tu API unificada.",
        descartes: armado.descartes,
      });
    }

    const cred = normalizarCredenciales(cuerpo, deps.ollamaUrl);
    // v1.84.5 · MEMORIA E IMÁGENES DEL TURNO (Mario, sesión 1793074563435:
    // «se olvidan de lo de 2 o 3 mensajes atrás y no pueden usar las imágenes»).
    // El cliente manda `historial` (turnos previos, ya comprimidos por la
    // vista: los informes eclécticos viajan como resumen+veredicto) y
    // `adjuntos` (imágenes del MENSAJE ACTUAL en base64 puro). El prompt con
    // memoria es lo que ven las voces y el juez; el INFORME sigue citando la
    // tarea cruda, no el pegamento. Sin historial ni adjuntos, prompt === tarea.
    const historialPlano = (Array.isArray(cuerpo.historial) ? cuerpo.historial : [])
      .filter((t: any) => t && (t.rol === "user" || t.rol === "assistant") && String(t.texto || "").trim())
      .slice(-MEMORIA_MAX_TURNOS)
      .map((t: any) => ({ rol: String(t.rol), texto: String(t.texto).slice(0, MEMORIA_CHARS_POR_TURNO * 2) }));
    const adjuntosPlanos = (Array.isArray(cuerpo.adjuntos) ? cuerpo.adjuntos : [])
      .filter((a: any) => a && String(a.nombre || "").trim())
      .slice(0, 12)
      .map((a: any) => ({
        nombre: String(a.nombre).slice(0, 120),
        tipo: String(a.tipo || "desconocido").slice(0, 60),
        esImagen: a.esImagen === true || /^image\//i.test(String(a.tipo || "")),
        base64: typeof a.base64 === "string" && a.base64.length > 32 && a.base64.length <= 4_500_000 ? a.base64 : undefined,
      }));
    const conMemoria = armarPromptConMemoria({ tarea, historial: historialPlano, adjuntos: adjuntosPlanos });
    // v1.86.1 → v1.86.2 · ANTI-BUCLE. Antes se miraba nomás el vecino inmediato;
    // la sesión 1793133418292 repitió CUATRO turnos seguidos el mismo veredicto y
    // el detector no lo nombraba. Ahora viaja la lista COMPLETA de veredictos
    // recordados, en orden cronológico (índice 0 = el primer mensaje).
    const recordadosVeredictos = historialPlano
      .filter((t: any) => t.rol === "assistant")
      .map((t: any) => String(t.texto || ""));
    const anteriorVeredicto = recordadosVeredictos[recordadosVeredictos.length - 1];
    // El juez lee la tarea SOLA y la memoria en su propio bloque (v1.86.2): mezclar
    //las dos en un mismo «TAREA SOLICITADA» fue lo que lo hacía integrar el primer
    // mensaje de la sesión en vez del turno actual.
    const memoriaJuez = [
      conMemoria.memoria,
      adjuntosPlanos.length ? `Archivos del mensaje actual: ${adjuntosPlanos.map((a: any) => a.nombre).join(", ")}` : "",
    ].filter(Boolean).join("\n");
    const medir = (v: { resumen?: string; veredicto?: string }) =>
      medirBucleRepeticion(recordadosVeredictos, `${v.resumen || ""}\n${v.veredicto || ""}`);
    const imagenesVoces = adjuntosPlanos
      .filter((a) => a.esImagen && a.base64)
      .slice(0, ADJUNTOS_MAX_IMAGENES)
      .map((a) => ({ mimeType: a.tipo, base64: a.base64 as string }));
    const respuestas = await llamarVoces(
      armado.voces.map((v) => ({ provider: v.provider, model: v.modelId })),
      conMemoria.prompt,
      cred,
      { imagenes: imagenesVoces.length ? imagenesVoces : undefined }
    );
    const evaluadas = respuestas.map((r) => evaluarRespuesta(r));

    // El juez: el elegido por el usuario si pasó la aduana, si no, la voz más sólida.
    let veredicto = veredictoMedido(evaluadas, respuestas);
    let juezUsado: VozPlana | null = null;
    let reempuje = 0;
    const juezPedido = cuerpo.juez && cuerpo.juez.modelId
      ? { provider: String(cuerpo.juez.provider || ""), modelId: String(cuerpo.juez.modelId) }
      : null;
    if (veredicto.mejorVoz && juezPedido && juezPedido.provider) {
      juezUsado = juezPedido;
      const rJuez = await llamarJuez(
          { provider: juezPedido.provider, model: juezPedido.modelId },
          // El juez también lee la memoria del turno (texto: los píxeles ya los
          // vieron las voces; el juez falla menos y gasta menos cuota en texto).
          promptDelJuez(conMemoria.prompt, respuestas, { anteriorVeredicto, memoria: memoriaJuez }),
          cred
        );
      const parseado = rJuez.ok ? parsearVeredictoJuez(rJuez.texto) : null;
      if (parseado) {
        veredicto = parseado;
      } else if (rJuez.ok && rJuez.texto.trim()) {
        // El juez escribió prosa en vez de JSON: se usa como resumen, pero el
        // acuerdo sigue MEDIDO. No se le firma una confianza que no declaró.
        const medido = medirConsenso(evaluadas, respuestas);
        veredicto = {
          ...veredicto,
          resumen: rJuez.texto.trim().slice(0, 4000),
          veredicto: rJuez.texto.trim().slice(0, 4000),
          confianza: medido.acuerdo,
          origen: "medido",
        };
      }
      // Si el juez no contestó, veredicto conserva el consenso medido (honesto).

      // v1.86.2 · RE-EMPUJE 1/1: si la firma mide repetición contra la memoria, se
      // le pide UNA integración nueva nombrando qué repitió. Igual que el
      // `auditoriaBucle` del chat: se avisa, se empuja una vez, y si sigue se
      // declara. No se queda en la alarma.
      const primerDiagnostico = medir(veredicto);
      if (primerDiagnostico.bucle && parseado) {
        reempuje = 1;
        const repetido = sustanciaDeInforme(recordadosVeredictos[primerDiagnostico.turnoRepetido - 1] || "");
        const rReempuje = await llamarJuez(
          { provider: juezPedido.provider, model: juezPedido.modelId },
          promptDelJuez(conMemoria.prompt, respuestas, {
            anteriorVeredicto,
            memoria: memoriaJuez,
            correccionBucle:
              `Tu firma anterior repitió el turno ${primerDiagnostico.turnoRepetido} de ${primerDiagnostico.comparados} recordados ` +
              `(similitud ${Math.round(primerDiagnostico.similitud * 100)} %). Esto ya está dicho:\n«${repetido.slice(0, 400)}»`,
          }),
          cred
        );
        const corregido = rReempuje.ok ? parsearVeredictoJuez(rReempuje.texto) : null;
        // Solo se cambia la firma si REALMENTE deja de repetir: un re-empuje que
        // devuelve lo mismo no puede reemplazar nada (sería tirar cuota y fingir avance).
        if (corregido && !medir(corregido).bucle) {
          veredicto = { ...corregido, origen: "juez" };
        }
      }
    }

    // v1.86.5 · la certeza llega al enjambre: el veredicto se revisa ANTES de
    // firmar el informe (y antes de medir el bucle sobre él). El enjambre generó
    // texto, no ejecutó ni leyó: la evidencia es vacía y toda afirmación sin
    // respaldo se reescribe a su alternativa honesta («pendiente de ejecutar»).
    const certezaDelTurno = revisarVeredictoDelEnjambre(veredicto);
    veredicto = certezaDelTurno.veredicto;

    // v1.88.0 · FASE 2 — EL VEREDICTO EJECUTA (sesión 1793219578712: el enjambre
    // devolvía «fs_write …» en un bloque de código y nadie lo corría). Solo se
    // ejecuta cuando la tarea PIDE obra (no una pregunta) y hay una voz que sepa
    // usar herramientas. La elección es la más sólida de las que pueden ejecutar.
    const requiereEjecucion = tareaPideEjecucion(tarea);
    let ejecucion: EjecucionInforme | null = null;
    if (requiereEjecucion) {
      const orden = respuestas
        .map((r, i) => ({ r, puntaje: evaluadas[i]?.puntaje ?? 0 }))
        .filter((x) => x.r.ok && String(x.r.texto || "").trim() && puedeEjecutar(x.r.provider))
        .sort((a, b) => b.puntaje - a.puntaje)[0];
      const vacio = { intentado: true, ok: false, texto: "", pasos: [], vueltas: 0, proveedor: "", modelo: "" };
      if (!deps.ejecutor) {
        ejecucion = { ...vacio, error: "el IDE no inyectó el ejecutor de herramientas" };
      } else if (!orden) {
        ejecucion = { ...vacio, error: "ninguna voz con herramientas contestó (Gemini usa otro contrato de tool calling: probá OpenAI, Groq, OpenRouter, Mistral, DeepSeek o un modelo local de Ollama)" };
      } else {
        const r = await ejecutarTareaConHerramientas({
          provider: orden.r.provider, model: orden.r.model,
          sistema: SISTEMA_EJECUTOR, usuario: promptDeEjecucion(tarea, veredicto.veredicto),
          cred, herramientas: deps.ejecutor.herramientas, ejecutarHerramienta: deps.ejecutor.ejecutarHerramienta,
        });
        ejecucion = { ...r, intentado: true, ejecutor: `${r.proveedor}/${r.modelo}` };
      }
    }

    const diagnosticoBucle = medir(veredicto);
    const informeFase1 = informeEclectico({
      tarea,
      respuestas,
      evaluadas,
      veredicto,
      juez: juezUsado,
      motivoArmado: armado.motivo,
      notaMemoria: conMemoria.nota || undefined,
      anteriorVeredicto: anteriorVeredicto || undefined,
      recordadosVeredictos,
      reempuje: reempuje || undefined,
    });
    const informe = ejecucion ? `${informeFase1}\n\n${bloqueDeObra(ejecucion)}` : informeFase1;

    return res.json({
      ok: true,
      informe,
      // v1.88.0 · la fase 2 viaja como DATO: la interfaz puede pintarla aparte.
      requiereEjecucion,
      ejecucion,
      voces: respuestas.map((r, i) => ({ provider: r.provider, model: r.model, ok: r.ok, error: r.error, ms: Math.round(r.ms), puntaje: evaluadas[i]?.puntaje ?? 0, etiquetas: evaluadas[i]?.etiquetas ?? [], reintentada: r.reintentada === true })),
      veredicto,
      acuerdo: medirConsenso(evaluadas, respuestas).acuerdo,
      respondieron: medirConsenso(evaluadas, respuestas).respondieron,
      descartes: armado.descartes,
      motivo: armado.motivo,
      respaldo: armado.respaldo,
      porDebajoDelMinimo: armado.porDebajoDelMinimo,
      // v1.86.2 · la interfaz puede ver la medición sin parsear el informe.
      bucle: { ...diagnosticoBucle, reempuje },
      // v1.86.5 · la certeza del turno viaja como DATO (igual que el `done` del
      // chat), no como párrafo: la interfaz puede señalarlo sin escribir de más.
      certeza: certezaDelTurno.certeza,
      afirmacionesSinEvidencia: certezaDelTurno.avisos.length > 0,
    });
  });

  /** El orquestador ya tiene las respuestas: acá se evalúan y se sentencian. */
  app.post("/api/enjambre/evaluar", async (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) {
      return res.status(403).json({ ok: false, error: "El enjambre solo responde a esta máquina (loopback o token)." });
    }
    const cuerpo = (req.body || {}) as { tarea?: string; respuestas?: any[] };
    const tarea = String(cuerpo.tarea || "").trim();
    const respuestas = (cuerpo.respuestas || [])
      .filter((r) => r && r.model)
      .map((r) => ({
        provider: String(r.provider || "desconocido"),
        model: String(r.model || ""),
        ok: r.ok !== false && String(r.texto || "").trim().length > 0,
        texto: String(r.texto || ""),
        error: r.error ? String(r.error) : undefined,
        ms: Number(r.ms) || 0,
      }));
    if (!tarea) return res.status(400).json({ ok: false, error: "Falta la tarea." });
    if (respuestas.length === 0) return res.status(400).json({ ok: false, error: "No llegó ninguna respuesta que evaluar." });

    const evaluadas = respuestas.map((r) => evaluarRespuesta(r));
    // v1.86.5 · misma regla que /consultar: el veredicto pasa por el revisor de
    // certeza antes de firmarse. Sin ejecución ni lectura, certeza `sin_verificar`.
    const certezaDelTurno = revisarVeredictoDelEnjambre(veredictoMedido(evaluadas, respuestas));
    const veredicto = certezaDelTurno.veredicto;
    const informe = informeEclectico({ tarea, respuestas, evaluadas, veredicto, motivoArmado: "Respuestas trayidas por el orquestador: no se llamó a nadie, solo se evaluó." });
    return res.json({
      ok: true,
      informe,
      veredicto,
      evaluadas,
      acuerdo: medirConsenso(evaluadas, respuestas).acuerdo,
      certeza: certezaDelTurno.certeza,
      afirmacionesSinEvidencia: certezaDelTurno.avisos.length > 0,
    });
  });
}
