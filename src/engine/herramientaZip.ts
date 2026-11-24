/**
 * herramientaZip.ts — LA HERRAMIENTA `crear_zip` (v1.96.0)
 * ========================================================
 * Tercera del mismo familia que `crear_pdf` y `crear_docx`: UNA llamada, auditoría
 * ANTES de escribir, y los números que ve el modelo están LEÍDOS del archivo, no
 * contados de memoria.
 *
 * Por qué existe si ya hay un generador de ZIP (skill 7 del mapa honesto): ese vive
 * dentro de `server.ts` para el export de sitios, y `zipMinimo.ts` era una biblioteca
 * sin mano — las skills de entrega prometían «empaquetar» sin una herramienta que un
 * modelo pudiera llamar. Un contrato de skill que apunta a una función inexistente es
 * exactamente el humo que el catálogo honesto existe para matar.
 *
 * La máquina de bytes es `zipMinimo` (ZIP 2.0 stored, CRC-32, fecha DOS fija): misma
 * entrada → mismos bytes → mismo sha256. Eso es lo que hace auditable una entrega.
 */
import * as fs from "node:fs";
import * as pathNS from "node:path";
import { createHash } from "node:crypto";
import { crearZip, abrirZip, type EntradaZip } from "./zipMinimo";

export const SPEC_CRIAR_ZIP = {
  type: "function",
  function: {
    name: "crear_zip",
    description:
      "Empaquetar archivos del workspace en un .zip REAL y determinista en UNA sola llamada. Dos formas, combinables: `entradas:[{nombre, texto}]` para contenido que escribes acá (el texto va adentro tal cual) y/o `desde` para tomar una carpeta completa del proyecto. Si una entrada tiene `ruta` en vez de `texto`, se lee ese archivo del workspace (sirve para meter el .docx o .pdf que acabas de crear). Devuelve path, entradas, bytes, sha256 y la lista de nombres LEÍDOS del paquete reabierto con el CRC verificado: citá esos números, no los tuyos. NO uses write_file para el .zip (es binario) ni `run_command` con `zip`: la ruta puede quedar fuera del sandbox y el resultado no es determinista.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "ruta RELATIVA terminada en .zip, p. ej. entrega/paquete.zip" },
        entradas: {
          type: "array",
          description: "archivos escritos desde el chat",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string", description: "ruta dentro del zip, con / (ej. docs/leeme.md)" },
              texto: { type: "string", description: "contenido de texto plano (UTF-8)" },
              ruta: { type: "string", description: "en vez de texto: archivo del workspace a copiar (ej. informes/avance.docx)" },
            },
          },
        },
        desde: { type: "string", description: "carpeta del workspace a empaquetar completa (recursivo). node_modules y .git se excluyen siempre." },
        sobrescribir: { type: "boolean", description: "true para reemplazar un .zip existente; sin eso, la herramienta se niega" },
      },
      required: ["path"],
    },
  },
} as const;

export interface ContextoCrearZip {
  /** Resuelve la ruta relativa contra el workspace y aplica el candado del sandbox. */
  resolver: (relativa: string) => string;
  /** Escritura opcional: por defecto escribe acá, para no gastar el ratchet del monolito. */
  escribir?: (absoluta: string, bytes: Uint8Array) => void;
}

const MAX_ENTRADAS = 400;
const MAX_BYTES_TOTALES = 64 * 1024 * 1024;
const EXCLUIDAS = new Set(["node_modules", ".git", "__pycache__", ".DS_Store"]);

function error(motivo: string): string {
  return JSON.stringify({ ok: false, error: motivo });
}

/** Nombra interno del zip: siempre con `/`, nunca absoluto, nunca `..` hacia afuera. */
function nombreSeguro(nombre: string): string | null {
  const n = String(nombre || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n) return null;
  const trozos = n.split("/").filter((t) => t !== "" && t !== ".");
  if (trozos.some((t) => t === "..")) return null;
  if (/^[a-zA-Z]:/.test(trozos[0])) return null;
  return trozos.join("/");
}

function caminata(absoluta: string, dentro: string, acum: EntradaZip[]): { corte?: string } {
  const nodos = fs.readdirSync(absoluta, { withFileTypes: true });
  for (const nodo of nodos.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (EXCLUIDAS.has(nodo.name)) continue;
    const absolutaHija = pathNS.join(absoluta, nodo.name);
    const dentroHija = dentro ? `${dentro}/${nodo.name}` : nodo.name;
    if (nodo.isDirectory()) {
      const r = caminata(absolutaHija, dentroHija, acum);
      if (r.corte) return r;
      continue;
    }
    if (!nodo.isFile()) continue;
    if (acum.length >= MAX_ENTRADAS) return { corte: `la carpeta supera ${MAX_ENTRADAS} archivos; empaquetá por partes o con un «desde» más chico` };
    const bytes = fs.readFileSync(absolutaHija);
    acum.push({ nombre: dentroHija, datos: new Uint8Array(bytes) });
    // Peso real: un string se guarda como UTF-8, entonces se cuenta en bytes, no en caracteres.
    const total = acum.reduce((s, e) => s + (typeof e.datos === "string" ? Buffer.byteLength(e.datos, "utf8") : e.datos.length), 0);
    if (total > MAX_BYTES_TOTALES) {
      return { corte: `el paquete pasaría de ${Math.round(MAX_BYTES_TOTALES / 1024 / 1024)} MB; excluí assets pesados o separá la entrega` };
    }
  }
  return {};
}

/** Ejecuta `crear_zip`. Devuelve el JSON que ve el modelo, con lo MEDIDO del paquete. */
export function ejecutarCrearZip(args: any, ctx: ContextoCrearZip): string {
  const relativa = String(args?.path || args?.ruta || "").trim();
  if (!relativa) return error("Falta 'path' (ruta relativa, p. ej. entrega/paquete.zip).");
  if (!/\.zip$/i.test(relativa)) return error(`crear_zip escribe .zip; «${relativa}» no lo es.`);
  const brutas = Array.isArray(args?.entradas) ? args.entradas : [];
  const desde = String(args?.desde || "").trim();
  if (!brutas.length && !desde) return error("Nada que empaquetar: pasá `entradas` y/o `desde`. Un zip vacío no es una entrega.");

  let absolutaZip = "";
  try {
    absolutaZip = ctx.resolver(relativa);
    if (fs.existsSync(absolutaZip) && !args?.sobrescribir) {
      return error(`«${relativa}» ya existe. Si querés reemplazarlo, mandá sobrescribir:true — no lo piso en silencio.`);
    }
    const entradas: EntradaZip[] = [];
    const vistos = new Set<string>();
    for (const e of brutas) {
      const nombre = nombreSeguro(e?.nombre);
      if (!nombre) return error(`entrada con 'nombre' inválido (${JSON.stringify(e?.nombre)}): tiene que ser una ruta relativa sin «..».`);
      if (vistos.has(nombre)) return error(`«${nombre}» aparece dos veces en el paquete; decidí cuál vale.`);
      vistos.add(nombre);
      if (typeof e?.ruta === "string" && e.ruta.trim()) {
        const origen = ctx.resolver(e.ruta.trim());
        if (!fs.existsSync(origen)) return error(`la ruta pedida no existe: ${e.ruta.trim()}`);
        entradas.push({ nombre, datos: new Uint8Array(fs.readFileSync(origen)) });
        continue;
      }
      if (typeof e?.texto !== "string") return error(`la entrada «${nombre}» necesita 'texto' o 'ruta'.`);
      entradas.push({ nombre, datos: e.texto });
    }
    if (desde) {
      const carpeta = ctx.resolver(desde);
      if (!fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) return error(`'desde' no es una carpeta del workspace: ${desde}`);
      const base = desde.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || desde;
      const r = caminata(carpeta, base, entradas);
      if (r.corte) return error(r.corte);
    }
    if (!entradas.length) return error(`«${desde}» no dejó ningún archivo para empaquetar (¿está vacía o toda excluida?).`);

    const bytes = crearZip(entradas);
    const aud = abrirZip(bytes);                    // se reabre ANTES de escribir: no se deja un zip podrido en el proyecto
    if (!aud.ok) return error(`el .zip generado no pasó la propia auditoría: ${aud.motivo}`);
    const malas = aud.entradas.filter((e) => !e.crcOk).map((e) => e.nombre);
    if (malas.length) return error(`CRC malo en ${malas.length} entrada(s): ${malas.slice(0, 5).join(", ")}`);
    if (aud.entradas.length !== entradas.length) {
      return error(`el paquete reabierto tiene ${aud.entradas.length} entradas y se pidieron ${entradas.length}; no lo escribo sin entender la diferencia.`);
    }

    if (ctx.escribir) ctx.escribir(absolutaZip, bytes);
    else {
      fs.mkdirSync(pathNS.dirname(absolutaZip), { recursive: true });
      fs.writeFileSync(absolutaZip, Buffer.from(bytes));
    }
    return JSON.stringify({
      ok: true,
      path: relativa,
      entradas: aud.entradas.length,
      bytes: bytes.length,
      sha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
      nombres: aud.entradas.slice(0, 15).map((e) => e.nombre),
      aviso: "entradas, bytes, sha256 y nombres están LEÍDOS del paquete reabierto (CRC verificado entrada por entrada). Usalos tal cual en tu respuesta.",
    });
  } catch (e: any) {
    return error(`no se pudo escribir ${relativa}: ${String(e?.message || e)}`);
  }
}
