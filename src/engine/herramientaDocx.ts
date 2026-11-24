/**
 * herramientaDocx.ts — LA HERRAMIENTA `crear_docx` (v1.96.0)
 * =========================================================
 * El mismo patrón que `crear_pdf` (v1.95.0): UNA llamada, contenido estructurado adentro,
 * bytes afuera, y **auditoría antes de dar ok**. La diferencia es qué se audita: un PDF se
 * valida contra su propio árbol de páginas; un .docx se reabre como paquete OPC (ZIP + XML)
 * y se lee el texto de `word/document.xml`.
 *
 * Por qué vive afuera de `server.ts`: el trinquete del monolito (12174 líneas congeladas) y
 * el ratchet de escrituras crudas (36). La lógica y la escritura van acá; el monolito presta
 * el candado de rutas y monta la herramienta.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { crearDocx, auditarDocx, type DocumentoDocx, type SeccionDocx } from "./docxMinimo";

export const SPEC_CRIAR_DOCX = {
  type: "function",
  function: {
    name: "crear_docx",
    description:
      "Escribir un archivo .docx REAL y editable en UNA sola llamada. Se pasa el contenido estructurado (titulo, subtitulo?, secciones:[{titulo?, parrafos[], puntos[], tabla[[celdas]]}], nota?) y la herramienta arma el paquete Office Open XML, lo reabre para auditarlo y lo guarda. Devuelve path, bytes, partes, parrafos y una MUESTRA de texto leida del archivo: citá esos números, no los tuyos. NO uses fs_write para el .docx (es binario), no lo renombres desde .html/.pdf, y no intentes python-docx: el Python embebido trae 0 paquetes de pip.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "ruta RELATIVA terminada en .docx, p. ej. informes/avance.docx" },
        titulo: { type: "string", description: "título del documento" },
        subtitulo: { type: "string", description: "opcional" },
        secciones: {
          type: "array",
          description: "una entrada por sección",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "título de la sección (opcional)" },
              parrafos: { type: "array", items: { type: "string" }, description: "texto corrido" },
              puntos: { type: "array", items: { type: "string" }, description: "viñetas" },
              tabla: { type: "array", items: { type: "array", items: { type: "string" } }, description: "filas de celdas; la primera es encabezado" },
            },
          },
        },
        nota: { type: "string", description: "opcional: cierre en cursiva" },
        autor: { type: "string", description: "opcional" },
      },
      required: ["path", "titulo", "secciones"],
    },
  },
} as const;

export interface ContextoCrearDocx {
  /** Resuelve la ruta relativa contra el workspace y aplica el candado del sandbox. */
  resolver: (relativa: string) => string;
  /** Escritura opcional: por defecto escribe acá, para no gastar el ratchet del monolito. */
  escribir?: (absoluta: string, bytes: Uint8Array) => void;
}

function escribirBinario(absoluta: string, bytes: Uint8Array): void {
  fs.mkdirSync(path.dirname(absoluta), { recursive: true });
  fs.writeFileSync(absoluta, Buffer.from(bytes));
}

/** Ejecuta `crear_docx`. Devuelve el JSON que ve el modelo, con lo MEDIDO del archivo. */
export function ejecutarCrearDocx(args: any, ctx: ContextoCrearDocx): string {
  const relativa = String(args?.path || args?.ruta || "").trim();
  if (!relativa) return JSON.stringify({ ok: false, error: "Falta 'path' (ruta relativa, p. ej. informes/informe.docx)." });
  if (!/\.docx$/i.test(relativa)) return JSON.stringify({ ok: false, error: `crear_docx escribe .docx; «${relativa}» no lo es. Renombrar un .pdf o .html a .docx produce un archivo que Word rechaza.` });
  const brutas = Array.isArray(args?.secciones) ? args.secciones : [];
  if (!brutas.length) return JSON.stringify({ ok: false, error: "Falta 'secciones' (al menos una; puede tener solo 'parrafos')." });
  const secciones: SeccionDocx[] = brutas.map((s: any) => ({
    titulo: s?.titulo ? String(s.titulo) : undefined,
    parrafos: Array.isArray(s?.parrafos) ? s.parrafos.map(String) : (s?.parrafo ? [String(s.parrafo)] : []),
    puntos: Array.isArray(s?.puntos) ? s.puntos.map(String) : [],
    tabla: Array.isArray(s?.tabla) ? s.tabla.map((f: any) => (Array.isArray(f) ? f.map(String) : [String(f)])) : undefined,
  }));
  const doc: DocumentoDocx = {
    titulo: String(args?.titulo || "Documento"),
    subtitulo: args?.subtitulo ? String(args.subtitulo) : undefined,
    secciones,
    nota: args?.nota ? String(args.nota) : undefined,
    autor: args?.autor ? String(args.autor) : undefined,
  };
  let absoluta = "";
  try {
    absoluta = ctx.resolver(relativa);
    const bytes = crearDocx(doc);
    const aud = auditarDocx(bytes);   // se audita ANTES de escribir: no se deja un .docx roto en el proyecto
    if (!aud.ok) return JSON.stringify({ ok: false, error: `el .docx generado no pasó la propia auditoría: ${aud.motivo}` });
    if (ctx.escribir) ctx.escribir(absoluta, bytes); else escribirBinario(absoluta, bytes);
    return JSON.stringify({
      ok: true,
      path: relativa,
      bytes: aud.bytes,
      partes: aud.partes,
      parrafos: aud.parrafos,
      muestra: aud.muestra,
      aviso: "Bytes, partes y párrafos están LEÍDOS del archivo escrito (paquete reabierto y CRC verificado). Usalos tal cual en tu respuesta.",
    });
  } catch (e: any) {
    return JSON.stringify({ ok: false, error: `no se pudo escribir ${relativa}: ${String(e?.message || e)}`, path: absoluta || relativa });
  }
}
