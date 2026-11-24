import { WorkspaceFile } from "../types";
import {
  extraerLlamadasEnTexto,
  normalizarArgsAlias,
} from "../engine/cicloHerramientasOpenAICompat";
// v1.60.8 — MISMA regla de ruta que el sync a disco. El editor materializaba
// con `.trim()` crudo mientras `espejoSync` normalizaba (`./`, `/` inicial, `\`
// de Windows, `//`): esa divergencia creaba DOS entradas para el mismo archivo
// (`./index.html` vs `index.html`) — el modelo "no sabía dónde estaba" y en el
// preview :3500 una pisaba a la otra, faltando archivos al renderizar. Reusar
// el canonizador del disco deja editor y sandbox hablando el mismo idioma.
import { normalizarRuta } from "../engine/espejoSync";

export interface ParsedCodeBlock {
  language: string;
  filePath: string;
  content: string;
}

// v1.58.3 — NOMBRES VÁLIDOS PARA EL PARSER DE LLAMADAS TEXTUALES EN EL FRONTEND.
// El backend ya ejecuta las tool-calls que un modelo free escribe como TEXTO
// (```cerebronico:write_file, <dots_function_call>, nombre+JSON), pero el EDITOR
// nunca se enteraba: `extractCodeBlocksFromMessage` solo miraba vallas con ruta,
// así que el árbol de archivos y el preview seguían mostrando la portada por
// defecto. Aquí reusamos el MISMO parser puro del motor para materializar en el
// editor los `write_file`/`create_file` que vengan en texto. Con esto el editor
// muestra lo que el modelo generó y `syncToDisk` lo lleva al sandbox (:3500).
const NOMBRES_HERRAMIENTA_ARCHIVO = new Set<string>([
  "write_file",
  "delete_file",
  "read_file",
  "list_files",
  "run_command",
]);

/**
 * Materializa como bloques de código los `write_file`/`create_file` que un
 * modelo sin tool-calls nativas haya escrito EN EL TEXTO. Reconoce los tres
 * formatos medidos en sesión real (valla `cerebronico:write_file`, pseudo-XML
 * `<dots_function_call>` y nombre+JSON) reutilizando el parser del motor, y
 * normaliza los alias en español (`ruta`→`path`, `contenido`→`content`). Solo
 * devuelve escrituras de archivo; el resto de herramientas no son archivos.
 */
export function extractToolCallFileBlocks(markdown: string): ParsedCodeBlock[] {
  const results: ParsedCodeBlock[] = [];
  let llamadas: Array<{ name: string; arguments: string }> = [];
  try {
    llamadas = extraerLlamadasEnTexto(String(markdown || ""), NOMBRES_HERRAMIENTA_ARCHIVO).llamadas;
  } catch {
    return results;
  }
  for (const l of llamadas) {
    if (l.name !== "write_file") continue; // create_file ya se normalizó a write_file
    let args: any = {};
    try {
      args = normalizarArgsAlias(JSON.parse(l.arguments || "{}"));
    } catch {
      continue;
    }
    const filePath = normalizarRuta(String(args?.path || "").trim());
    if (!filePath) continue;
    const content = typeof args?.content === "string" ? args.content : String(args?.content ?? "");
    results.push({ language: "text", filePath, content: content.replace(/\s+$/, "") });
  }
  return results;
}

/**
 * v1.58.4 — Complemento de `extractToolCallFileBlocks`: devuelve las RUTAS que
 * el modelo pidió BORRAR como tool-call en texto (`delete_file` y sus alias
 * `borrar_archivo`/`eliminar_archivo`). Antes, aunque el backend borraba el
 * archivo en disco, el EDITOR seguía mostrándolo: la escritura llegaba al árbol
 * pero el borrado no, dejando archivos fantasma que el preview ya no servía.
 * Solo rutas; sin adivinar: igual que las escrituras, pasa por el parser del
 * motor y por eso un fragmento de prosa no se confunde con un borrado.
 */
export function extractToolCallDeletes(markdown: string): string[] {
  const rutas: string[] = [];
  let llamadas: Array<{ name: string; arguments: string }> = [];
  try {
    llamadas = extraerLlamadasEnTexto(String(markdown || ""), NOMBRES_HERRAMIENTA_ARCHIVO).llamadas;
  } catch {
    return rutas;
  }
  for (const l of llamadas) {
    if (l.name !== "delete_file") continue; // borrar_archivo/eliminar_archivo ya se normalizaron
    let args: any = {};
    try {
      args = normalizarArgsAlias(JSON.parse(l.arguments || "{}"));
    } catch {
      continue;
    }
    const filePath = normalizarRuta(String(args?.path || "").trim());
    if (filePath && !rutas.includes(filePath)) rutas.push(filePath);
  }
  return rutas;
}

/**
 * Extracts markdown code blocks matching ```lang file="path/to/file.ext" or
 * similar formats, PLUS `write_file` tool-calls written as plain text.
 */
export function extractCodeBlocksFromMessage(markdown: string): ParsedCodeBlock[] {
  const results: ParsedCodeBlock[] = [];

  // v1.57.3 (FASE 2) — Antes la regex exigía un token de lenguaje ANTES del
  // atributo (`\s+` previo a `file=`), así que una valla que abría con el
  // atributo pelado (```file="src/x.ts") no se reconocía y el archivo nunca se
  // materializaba. Ahora se captura TODO el renglón de la valla (infoString) y
  // se parsean sus piezas por separado: el lenguaje es opcional y puede ir
  // antes O después del atributo, o no estar. Formatos que ahora entran:
  //   ```ts file="src/x.ts"      ```file="src/x.ts"      ```ts:src/x.ts
  //   ```tsx path='src/x.tsx'    ```filepath=src/x.ts    ```src/x.ts (ruta sola)
  const regex = /```([^\n]*)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const info = (match[1] || "").trim();
    let content = match[2] || "";

    // 1) Atributo explcito en el rengln de la valla: file=/filepath=/path=.
    let explicitPath = "";
    const attr = info.match(/(?:file|filepath|path)\s*=\s*["']?([^"'\s]+)["']?/i);
    if (attr) explicitPath = attr[1];

    // 2) Forma `lenguaje:ruta`  (```ts:src/x.ts).
    if (!explicitPath) {
      const colon = info.match(/^([a-zA-Z0-9_+#.-]+):([^\s]+)$/);
      if (colon && /[./]/.test(colon[2])) explicitPath = colon[2];
    }

    // 3) Ruta pelada como único token (```src/x.ts  o  ```x.ts).
    if (!explicitPath && /^[\w.][\w./-]*\.[A-Za-z0-9]+$/.test(info) && info.indexOf(" ") === -1) {
      explicitPath = info;
    }

    // Lenguaje: primer token "pelado" del rengln, ignorando los atributos y la
    // ruta ya extrada. Si no queda nada reconocible, se infiere luego por la
    // extensin del archivo (en mergeExtractedFiles).
    const sinAttrs = info
      .replace(/(?:file|filepath|path)\s*=\s*["']?[^"'\s]+["']?/gi, " ")
      .replace(explicitPath ? explicitPath : /\u0000/g, " ")
      .trim();
    const langTok = sinAttrs.match(/^([a-zA-Z0-9_+#-]+)(?![=/.])/);
    const language = (langTok ? langTok[1] : "text").toLowerCase();

    // If explicit path not on the backticks line, check if the first line is a comment with file path
    if (!explicitPath) {
      const firstLineMatch = content.match(/^(?:\/\/|#|\/\*|<!--)\s*(?:file(?:path)?:\s*|src\/|lib\/|[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)([^\n*-->]+)(?:\*\/|-->)?/i);
      if (firstLineMatch) {
        const potentialPath = firstLineMatch[0]
          .replace(/^(?:\/\/|#|\/\*|<!--)\s*(?:file(?:path)?:\s*)?/i, "")
          .replace(/(?:\*\/|-->)$/, "")
          .trim();
        if (potentialPath && (potentialPath.includes(".") || potentialPath.includes("/"))) {
          explicitPath = potentialPath;
        }
      }
    }

    // Fallback 2 (FASE 2, v1.57.3): la IA nombra el archivo JUSTO ANTES de la
    // valla y luego pega el código sin rótulo `file=`. Patrones típicos:
    //   «src/app.ts:», «**src/app.ts**», «`src/app.ts`», «Archivo: src/app.ts».
    // Solo se mira la ÚLTIMA línea no vacía antes de la valla, y solo cuenta si
    // parece una ruta real (tiene extensión o lleva «/»). Así no se adivina:
    // una frase normal no se convierte en nombre de archivo por accidente.
    if (!explicitPath) {
      const antes = markdown.slice(0, match.index);
      const lineas = antes.split("\n");
      for (let k = lineas.length - 1; k >= 0; k--) {
        const raw = lineas[k].trim();
        if (!raw) continue; // saltar líneas en blanco hasta la primera con texto
        const cand = raw
          .replace(/^archivo\s*:/i, "")
          .replace(/[*`_>#]/g, " ")
          .replace(/:\s*$/, "")
          .trim()
          .split(/\s+/)
          .pop() || "";
        if (/^[\w.][\w./-]*\.[A-Za-z0-9]+$/.test(cand) && !cand.startsWith("..")) {
          explicitPath = cand;
        }
        break; // solo la línea inmediatamente anterior cuenta
      }
    }

    if (explicitPath) {
      results.push({
        language,
        filePath: normalizarRuta(explicitPath.trim()),
        content: content.trimEnd(),
      });
    }
  }

  // v1.58.3 — Además de las vallas con ruta, materializa los `write_file` que el
  // modelo escribió como TOOL-CALL EN TEXTO. Las vallas con ruta mandan: si una
  // ruta ya se extrajo arriba, no la pisa la versión textual (evita duplicar).
  const yaVistas = new Set(results.map((r) => r.filePath));
  for (const tc of extractToolCallFileBlocks(markdown)) {
    if (yaVistas.has(tc.filePath)) continue;
    yaVistas.add(tc.filePath);
    results.push(tc);
  }

  return results;
}

/**
 * Merges newly extracted code blocks into current workspace files
 */
export function mergeExtractedFiles(
  currentFiles: WorkspaceFile[],
  extractedBlocks: ParsedCodeBlock[]
): { updatedFiles: WorkspaceFile[]; createdCount: number; updatedCount: number } {
  const map = new Map<string, WorkspaceFile>();
  // v1.60.8 — La CLAVE del mapa es la ruta canonizada (igual que el sync a
  // disco). Antes se indexaba por `f.path`/`block.filePath` crudo, así que
  // `./index.html` e `index.html` caían en claves distintas: el árbol mostraba
  // dos archivos, el modelo no encontraba el suyo y el preview perdía uno al
  // escribir ambos sobre la misma ruta de disco. Guardamos también `path` ya
  // canonizado para que editor, árbol y sandbox coincidan exactamente.
  currentFiles.forEach((f) => {
    const clave = normalizarRuta(f.path);
    map.set(clave, { ...f, path: clave });
  });

  let createdCount = 0;
  let updatedCount = 0;

  for (const block of extractedBlocks) {
    const clave = normalizarRuta(block.filePath);
    if (!clave) continue;
    const existing = map.get(clave);
    if (existing) {
      if (existing.content !== block.content) {
        map.set(clave, {
          ...existing,
          content: block.content,
          language: block.language || existing.language,
          size: block.content.length,
          modified: true,
        });
        updatedCount++;
      }
    } else {
      const fileName = clave.split("/").pop() || clave;
      map.set(clave, {
        id: "file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        name: fileName,
        path: clave,
        content: block.content,
        language: block.language || fileName.split(".").pop() || "txt",
        size: block.content.length,
        modified: true,
      });
      createdCount++;
    }
  }

  return {
    updatedFiles: Array.from(map.values()),
    createdCount,
    updatedCount,
  };
}
