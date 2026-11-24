/**
 * packDocumentos.ts — PACK ENCHUFABLE: EL MOTOR ESCRIBE DOCUMENTOS REALES (v1.0.0)
 * =================================================================================
 * POR QUÉ EXISTE (pedido directo de Mario, v1.71.0): «aún no se puede generar PDF
 * o archivos Word, texto etc, que sea posible». El motor leía PDF/Word (el puente
 * los convierte a .md) y escribía TEXTO (write_file → utf-8), pero NO podía
 * entregar un .pdf, .docx o .xlsx de verdad: los binarios por write_file salen
 * corruptos (re-codificación utf-8 de bytes crudos). Este pack pone las manos:
 *   · generar_pdf   — informe/texto (markdown) → PDF real, con páginas y pie.
 *   · generar_docx  — el mismo texto → Word (.docx) con estilos de título reales.
 *   · generar_xlsx  — datos tabulados → libro Excel (.xlsx) multi-hoja.
 * (texto/.md/.csv ya estaban cubiertos por write_file: no se duplica nada.)
 *
 * La escritura de bytes es DENTRO del pack (fs.writeFileSync con Buffer), no en
 * server.ts: el ratchet de escrituras crudas del monolito no sube ni una línea,
 * igual que hizo terminalInteractivo con spawn.
 *
 * Rutas: se pasa `resolverRutaSegura` (la misma resolveSafePath del monolito por
 * inyección). El pack NO conoce PROJECT_ROOT — quien conoce la raíz es el server.
 *
 * Montaje (idéntico a packTerminal):
 *   registrarPackDocumentos();                                  // tras registerBuiltinPacks()
 *   if (ES_HERRAMIENTA_DOCUMENTOS(name))                        // antes del switch del núcleo
 *     return ejecutarHerramientaDocumentos(name, args, { resolverRutaSegura: resolveSafePath });
 *
 * Idempotente: registrar dos veces reemplaza el mismo pack sin ruido.
 */
import { registerToolPack, type ToolSpec } from "./toolRegistry";
import {
  construirPdf, construirDocx, construirXlsx,
  type HojaDatos, LIMITES_XLSX,
} from "./generadorDocumentos";
import * as fs from "node:fs";
import * as path from "node:path";

export const PACK_ID = "documentos";

/** Tope defensivo del texto de entrada (caracteres): un informe de 300k ya es enorme. */
export const TOPE_CONTENIDO = 300_000;

const RE_DESCRIPCION_TABLA =
  "Genera un libro EXCEL real (.xlsx) desde datos tabulados: hojas: [{ nombre?, cabeceras?, filas: [[...]] }]. " +
  "Números salen como números, el resto como TEXTO — nunca como fórmula (un \"=CMD\" hostil queda en texto). " +
  "Devuelve las hojas creadas y el conteo de celdas. Devuelve JSON: {ok, path, bytes, hojas, celdas}.";

const TOOLS: ToolSpec[] = [
  {
    name: "generar_pdf",
    pack: PACK_ID,
    description:
      "Genera un archivo PDF REAL en el proyecto a partir de texto con formato simple (markdown: # títulos, - listas, tablas |a|b|, bloques ```código```, **negrita**). " +
      "Es la herramienta para «dame el informe en PDF». Escribe el archivo y devuelve {ok, path, bytes, paginas}. " +
      "Límite honesto: tipografía Helvetica/Courier (latín-1); los caracteres fuera (emoji, CJK) se sustituyen por \"?\" y el resultado lo DECLARA en caracteresSustituidos.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "ruta relativa del .pdf a crear (si no lleva extensión, se añade .pdf)" },
        contenido: { type: "string", description: "texto del documento con formato simple (markdown)" },
        titulo: { type: "string", description: "título de portada (opcional, se pinta arriba en grande)" },
      },
      required: ["path", "contenido"],
    },
    requires: { sandbox: true },
    cheap: true, // builder puro y rápido: los modelos chicos la eligen primero al llenar el tope
  },
  {
    name: "generar_docx",
    pack: PACK_ID,
    description:
      "Genera un archivo WORD real (.docx) desde el mismo lenguaje de texto con formato (títulos con estilo navegable, párrafos, listas, tablas, código). " +
      "Devuelve {ok, path, bytes}. Se abre en Word, LibreOffice y Google Docs sin pedir reparación.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "ruta relativa del .docx a crear (si no lleva extensión, se añade .docx)" },
        contenido: { type: "string", description: "texto del documento con formato simple (markdown)" },
        titulo: { type: "string", description: "título al inicio (opcional)" },
      },
      required: ["path", "contenido"],
    },
    requires: { sandbox: true },
    cheap: true, // builder puro y rápido: los modelos chicos la eligen primero al llenar el tope
  },
  {
    name: "generar_xlsx",
    pack: PACK_ID,
    description: RE_DESCRIPCION_TABLA,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "ruta relativa del .xlsx a crear (si no lleva extensión, se añade .xlsx)" },
        hojas: {
          type: "array",
          description: "una o más hojas",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string", description: "nombre de la hoja (opcional: Hoja1, Hoja2…)" },
              cabeceras: { type: "array", items: { type: "string" }, description: "fila de títulos (se congela y pinta en negrita)" },
              filas: { type: "array", items: { type: "array" }, description: "filas de datos; cada celda: número, string o booleano" },
            },
          },
        },
      },
      required: ["path", "hojas"],
    },
    requires: { sandbox: true },
    cheap: true, // builder puro y rápido: los modelos chicos la eligen primero al llenar el tope
  },
];

/** Registra el pack. Llámalo junto a los demás registerToolPack del arranque. */
export function registrarPackDocumentos(): void {
  registerToolPack({
    id: PACK_ID,
    label: "Documentos",
    description: "Genera archivos PDF, Word (.docx) y Excel (.xlsx) reales dentro del proyecto.",
    tools: TOOLS,
  });
}

const NOMBRES = new Set(TOOLS.map((t) => t.name));
export function ES_HERRAMIENTA_DOCUMENTOS(name: string): boolean {
  return NOMBRES.has(name);
}
/** Para la suite: el contrato exige que lo DECLARADO y lo DESPACHADO sean el mismo set. */
export const HERRAMIENTAS_DOCUMENTOS: readonly string[] = Object.freeze([...NOMBRES]);

const EXT_POR_HERRAMIENTA: Record<string, string> = {
  generar_pdf: ".pdf",
  generar_docx: ".docx",
  generar_xlsx: ".xlsx",
};

export interface ContextoDocumentos {
  /** El resolveSafePath del monolito (raíz del sandbox + veto de escape). Se inyecta: el pack no conoce PROJECT_ROOT. */
  resolverRutaSegura: (rel: string) => string;
}

function rutaFinal(pathRel: string, ext: string): { ok: true; path: string } | { ok: false; error: string } {
  const limpio = String(pathRel || "").trim();
  if (!limpio) return { ok: false, error: "Falta la ruta de destino (path)." };
  const actual = path.extname(limpio).toLowerCase();
  if (actual === "") return { ok: true, path: limpio + ext }; // sin extensión: se añade la suya
  if (actual !== ext) return { ok: false, error: `generar_${ext.slice(1)} exige una ruta terminada en ${ext} (llegó «${actual || "sin extensión"}»). Cambiá la extensión o usá la herramienta del formato correcto.` };
  return { ok: true, path: limpio };
}

function textoValido(v: unknown, nombre: string): { ok: true; texto: string } | { ok: false; error: string } {
  const texto = typeof v === "string" ? v : "";
  if (!texto.trim()) return { ok: false, error: `Falta «${nombre}»: no se puede generar un documento vacío.` };
  if (texto.length > TOPE_CONTENIDO) return { ok: false, error: `«${nombre}» excede el tope de ${TOPE_CONTENIDO} caracteres (${texto.length}). Partí en varios documentos.` };
  return { ok: true, texto };
}

/**
 * Despachador: lo llama executeToolCallInterno antes de su switch propio.
 * Nunca lanza: todo error del mundo (esquema, ruta, tope, disco) vuelve como
 * {ok:false, error} en cristiano — un throw aquí sería el crash que la casa
 * persigue desde v1.60.16.
 */
export async function ejecutarHerramientaDocumentos(
  name: string,
  args: any,
  ctx: ContextoDocumentos,
): Promise<string> {
  try {
    const ruta = rutaFinal(String(args?.path ?? ""), EXT_POR_HERRAMIENTA[name] || "");
    if (!ruta.ok) return JSON.stringify(ruta);
    let abs: string;
    try {
      abs = ctx.resolverRutaSegura(ruta.path);
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: `Ruta rechazada: ${e?.message || e}` });
    }

    if (name === "generar_pdf" || name === "generar_docx") {
      const contenido = textoValido(args?.contenido ?? args?.content, "contenido");
      if (!contenido.ok) return JSON.stringify(contenido);
      const titulo = typeof args?.titulo === "string" && args.titulo.trim() ? args.titulo.trim() : undefined;
      const r = name === "generar_pdf"
        ? construirPdf(contenido.texto, { titulo })
        : null;
      const bytes = r ? r.bytes : construirDocx(contenido.texto, { titulo });
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(bytes));
      const parte: Record<string, unknown> = {
        ok: true,
        path: ruta.path,
        bytes: bytes.length,
        formato: name === "generar_pdf" ? "pdf" : "docx",
      };
      if (r) {
        parte.paginas = r.paginas;
        if (r.caracteresSustituidos > 0) {
          parte.caracteresSustituidos = r.caracteresSustituidos;
          parte.aviso = `${r.caracteresSustituidos} carácter(es) fuera del alfabeto del PDF (emoji/CJK) se sustituyeron por "?". Si molesta, generá .docx.`;
        }
      }
      return JSON.stringify(parte);
    }

    if (name === "generar_xlsx") {
      const hojas = args?.hojas;
      if (!Array.isArray(hojas) || hojas.length === 0) {
        return JSON.stringify({ ok: false, error: `Falta «hojas» (array). Forma: hojas:[{cabeceras:[...], filas:[[...]]}]. Tope: ${LIMITES_XLSX.MAX_CELDAS} celdas.` });
      }
      const r = construirXlsx(hojas as HojaDatos[]);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(r.bytes));
      return JSON.stringify({ ok: true, path: ruta.path, bytes: r.bytes.length, formato: "xlsx", hojas: r.hojas, celdas: r.celdas });
    }

    return JSON.stringify({ ok: false, error: `Herramienta de documentos desconocida: ${name}` });
  } catch (e: any) {
    return JSON.stringify({ ok: false, error: `No se pudo generar el documento: ${e?.message || e}` });
  }
}
