/**
 * herramientaPdf.ts — LA HERRAMIENTA `crear_pdf` (v1.95.0)
 * =======================================================
 * Por qué existe: el arnés no podía escribir un PDF. `package.json` trae `pdfjs-dist`
 * (un LECTOR) y ningún escritor; el Python embebido corre con 0 paquetes de pip, así que
 * el `reportlab` que el modelo intenta invocar no está. El resultado que vio Mario:
 * quince mensajes por un informe y un `.pdf` que Edge rechaza, porque el modelo terminó
 * escribiendo bytes como texto.
 *
 * Esta es la máquina, detrás de UNA sola llamada. Vive afuera de `server.ts` por el
 * trinquete del monolito: el monolito importa dos líneas y monta la herramienta; la
 * lógica (esquema, construcción, auditoría) está acá y se puede probar sin levantar el
 * servidor.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { construirPdf, auditarPdf, type DocumentoPdf, type SeccionPdf } from "./pdfMinimo";

/** El esquema, en la forma que usa el registro de herramientas. */
export const SPEC_CRIAR_PDF = {
  type: "function",
  function: {
    name: "crear_pdf",
    description:
      "Escribir un PDF REAL en el proyecto en UNA sola llamada. Se pasa el contenido estructurado y la herramienta arma el documento, lo audita releyéndolo y lo guarda. Devuelve path, bytes y páginas LEÍDAS del archivo: citá esos números, no los tuyos. NO uses fs_write ni escribas '%PDF-' a mano (fs_write lo niega con 400), y no intentes reportlab: el Python embebido trae 0 paquetes.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "ruta RELATIVA terminada en .pdf, p. ej. informes/avance-ia.pdf" },
        titulo: { type: "string", description: "título del documento" },
        subtitulo: { type: "string", description: "opcional" },
        fecha: { type: "string", description: "opcional: línea bajo el título" },
        secciones: {
          type: "array",
          description: "una entrada por sección",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "título de la sección" },
              parrafos: { type: "array", items: { type: "string" }, description: "texto corrido" },
              puntos: { type: "array", items: { type: "string" }, description: "viñetas cortas" },
            },
            required: ["titulo"],
          },
        },
        pie: { type: "string", description: "opcional: pie en todas las páginas" },
      },
      required: ["path", "titulo", "secciones"],
    },
  },
} as const;

export interface ContextoCrearPdf {
  /** Resuelve la ruta relativa contra el workspace y aplica el candado del sandbox. */
  resolver: (relativa: string) => string;
  /** Escribe en disco (binario). OPCIONAL a propósito: el ratchet de `vallasVivas`
   *  congela en 36 las escrituras crudas del monolito, así que la escritura vive ACÁ,
   *  junto con la lógica, y `server.ts` solo presta el candado de rutas. Un techo que se
   *  sube para acomodar una herramienta nueva deja de ser un techo. */
  escribir?: (absoluta: string, bytes: Uint8Array) => void;
  /** Registra la escritura en la operación abierta del quirófano (opcional). */
  registrar?: (relativa: string, origen: string) => void;
}

/** Escritura binaria por defecto. `fs.mkdirSync` + `fs.writeFileSync`, acá y no en el
 *  monolito (ver el comentario de `ContextoCrearPdf.escribir`). */
function escribirBinario(absoluta: string, bytes: Uint8Array): void {
  fs.mkdirSync(path.dirname(absoluta), { recursive: true });
  fs.writeFileSync(absoluta, Buffer.from(bytes));
}

/** Ejecuta `crear_pdf`. Devuelve el JSON que ve el modelo, con los números MEDIDOS. */
export function ejecutarCrearPdf(args: any, ctx: ContextoCrearPdf): string {
  const relativa = String(args?.path || args?.ruta || "").trim();
  if (!relativa) return JSON.stringify({ ok: false, error: "Falta 'path' (ruta relativa, p. ej. informes/informe.pdf)." });
  if (!/\.pdf$/i.test(relativa)) return JSON.stringify({ ok: false, error: `crear_pdf escribe .pdf; «${relativa}» no lo es.` });
  const brutas = Array.isArray(args?.secciones) ? args.secciones : [];
  if (!brutas.length) return JSON.stringify({ ok: false, error: "Falta 'secciones' (al menos una, con 'titulo')." });
  const secciones: SeccionPdf[] = brutas.map((s: any) => ({
    titulo: String(s?.titulo || ""),
    parrafos: Array.isArray(s?.parrafos) ? s.parrafos.map(String) : (s?.parrafo ? [String(s.parrafo)] : []),
    puntos: Array.isArray(s?.puntos) ? s.puntos.map(String) : [],
  }));
  const doc: DocumentoPdf = {
    titulo: String(args?.titulo || secciones[0]?.titulo || "Documento"),
    subtitulo: args?.subtitulo ? String(args.subtitulo) : undefined,
    fecha: args?.fecha ? String(args.fecha) : undefined,
    pie: args?.pie ? String(args.pie) : undefined,
    secciones,
  };
  let absoluta = "";
  try {
    absoluta = ctx.resolver(relativa);
    const bytes = construirPdf(doc);
    // Se audita ANTES de escribir: si el documento no cierra, el modelo se entera acá y
    // no deja un archivo roto en el proyecto del usuario.
    const antes = auditarPdf(bytes);
    if (!antes.ok) return JSON.stringify({ ok: false, error: `el PDF generado no pasó la propia auditoría: ${antes.motivo}` });
    if (ctx.escribir) ctx.escribir(absoluta, bytes);
    else escribirBinario(absoluta, bytes);
    ctx.registrar?.(relativa, "crear_pdf");
    return JSON.stringify({
      ok: true,
      path: relativa,
      bytes: antes.bytes,
      paginas: antes.paginas,
      aviso: "Los números de arriba están leídos del archivo. Usalos tal cual en tu respuesta.",
    });
  } catch (e: any) {
    return JSON.stringify({ ok: false, error: `no se pudo escribir ${relativa}: ${String(e?.message || e)}`, path: absoluta || relativa });
  }
}
