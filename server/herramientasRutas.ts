/**
 * herramientasRutas.ts — v1.0.20 · LAS MANOS DEL MODELO (2 llamadas, no 4)
 * ==========================================================================
 * QUÉ ES: la pieza D. El modelo tenía que combinar CUATRO consultas para
 * contestar «¿dónde está el proyecto?» — y aun así adivinaba. Aquí tiene dos
 * herramientas y una llamada cada una:
 *
 *   abrir_proyecto  { nombre }  → carpeta creada/adoptada + registro + pin + texto
 *   contexto_rutas  { }         → las tres raíces y la obra abierta, en un bloque
 *
 * POR QUÉ `cheap: true`: las dos son baratas en tokens (entrada casi vacía,
 * salida corta). Así sobreviven al recorte de herramientas de los modelos chicos
 * — que es justo donde el problema de rutas revienta (qwen3.5:4b, 8192 de
 * contexto). `abrir_proyecto` además es la única herramienta que cambia de QUÉ
 * carpeta se sirve, así que se marca `destructive: false` a propósito: no borra
 * nada; la carpeta vacía se siembra con un index.html y se dice.
 */
import { registerToolPack, type ToolSpec } from "../src/engine/toolRegistry";
import { contextoDeRutas, abrirProyecto, type DepsRegistro, type ResultadoApertura } from "./proyectoRegistro";
import { textoDeContexto, resumenRutas, clasificarRuta, QUE_HACER, veredictoDeEscritura } from "../src/engine/rutasAtomicas";

export const PACK_RUTAS = "rutas";

const TOOLS: ToolSpec[] = [
  {
    name: "contexto_rutas",
    pack: PACK_RUTAS,
    description:
      "Contesta en UNA llamada dónde está todo: instalación del IDE, raíz de datos, proyecto abierto, qué sirve el :3500 y qué ruta usar para escribir. Usala ANTES de escribir o de decir «no encuentro los archivos»: no adivines rutas.",
    parameters: { type: "object", properties: {}, required: [] },
    requires: { sandbox: true },
    cheap: true,
  },
  {
    name: "abrir_proyecto",
    pack: PACK_RUTAS,
    description:
      "Abre (crea o adopta) el proyecto que el :3500 va a servir. Devuelve la carpeta exacta y deja el registro escrito. Después de esto, write_file con ruta relativa escribe AHÍ. Usala cuando el usuario pida una app/sitio nuevo o cuando no haya proyecto abierto.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "nombre del proyecto (simple, sin barras). Ej: finanzas-app" },
        modo: { type: "string", description: "'nuevo' (por defecto) crea si falta; 'abrir' solo adopta una carpeta existente" },
        ruta: { type: "string", description: "opcional: clasifica una ruta en vez de abrir (no se escribe nada)" },
      },
      required: [],
    },
    requires: { sandbox: true },
    cheap: true,
  },
];

/** Registra el pack (idempotente: el registro reemplaza el mismo id). */
export function registrarPackRutas(): void {
  registerToolPack({
    id: PACK_RUTAS,
    label: "Rutas del proyecto",
    description: "Una sola verdad sobre dónde vive la obra: abrir el proyecto y contestar las tres raíces.",
    tools: TOOLS,
  });
}

/** ¿Esta herramienta es del pack? (el monolito despacha con esto, sin sumar líneas al switch). */
export const ES_HERRAMIENTA_RUTAS = (name: string): boolean => name === "contexto_rutas" || name === "abrir_proyecto";

/**
 * Ejecuta las dos herramientas. Devuelve SIEMPRE un JSON string: el bucle del
 * agente espera texto y una excepción aquí dejaría el turno sin respuesta.
 */
export function ejecutarHerramientaRutas(name: string, args: any, deps: DepsRegistro): string {
  if (name === "contexto_rutas") {
    const ctx = contextoDeRutas(deps);
    const ruta = String(args?.ruta || "").trim();
    if (ruta) {
      // Con ruta: la clasificación (es la misma pregunta hecha por otra puerta).
      const clase = clasificarRuta(ruta, ctx);
      const v = veredictoDeEscritura(ruta, ctx);
      return JSON.stringify({
        ok: true,
        ruta,
        clase,
        queHacer: QUE_HACER[clase],
        escritura: { permitida: v.permitida, abs: v.abs, motivo: v.motivo },
        contexto: ctx,
        resumen: resumenRutas(ctx),
      });
    }
    return JSON.stringify({
      ok: true,
      instalacion: ctx.instalacion,
      datos: ctx.datos,
      proyecto: ctx.proyecto,
      hayObra: !!ctx.proyecto,
      resumen: resumenRutas(ctx),
      texto: textoDeContexto(ctx),
      comoEscribir: ctx.proyecto
        ? "write_file / edit_file con ruta RELATIVA: el archivo nace en la obra abierta y el :3500 la sirve"
        : "no hay obra abierta: llamá abrir_proyecto {\"nombre\": \"mi-app\"} primero",
    });
  }

  if (name === "abrir_proyecto") {
    const ruta = String(args?.ruta || "").trim();
    if (ruta) {
      // Modo consulta: clasificar sin abrir (evita que un modelo curioso cree carpetas).
      const ctx = contextoDeRutas(deps);
      const clase = clasificarRuta(ruta, ctx);
      return JSON.stringify({ ok: true, consulta: true, ruta, clase, queHacer: QUE_HACER[clase], contexto: ctx });
    }
    const nombre = String(args?.nombre || args?.name || args?.proyecto || "").trim();
    const modo = args?.modo === "abrir" ? "abrir" : "nuevo";
    const r: ResultadoApertura = abrirProyecto(deps, nombre, modo);
    if (!r.ok) {
      return JSON.stringify({
        ok: false,
        error: r.motivo,
        pista: "un proyecto es UN nombre simple (letras, números y guiones). Se crea dentro de la raíz de datos, no en una ruta absoluta.",
      });
    }
    return JSON.stringify({
      ok: true,
      proyecto: r.proyecto?.nombre,
      ruta: r.proyecto?.ruta,
      creada: r.proyecto?.origen === "creado",
      sembrado: r.proyecto?.sembrado ?? [],
      avisos: r.avisos,
      texto: r.contexto,
      siguiente: "escribí con ruta RELATIVA (index.html, src/app.js…) y quedan en esa carpeta; el :3500 la sirve",
    });
  }

  return JSON.stringify({ ok: false, error: `herramienta de rutas desconocida: ${name}` });
}
