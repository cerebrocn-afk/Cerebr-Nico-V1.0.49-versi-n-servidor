/**
 * src/extraerFirmas.ts — EJE 1 (pieza que faltaba) · AISLAMIENTO DE SÍMBOLOS
 * ============================================================================
 * El presupuesto de contexto (motorContexto) sólo medía y avisaba. El corazón
 * del Eje 1 — inyectar sólo las FIRMAS (export function/class/interface/type/
 * const) en consultas recurrentes y dejar la lectura completa para el momento
 * exacto de escribir — estaba descrito pero NO implementado. Esto lo cierra.
 *
 * PURO: sin red, sin fs, sin estado global. Analizador est\u00e1tico ligero por
 * regex (no AST): barato y determinista; declara su naturaleza aproximada.
 */

export interface Firma {
  tipo: "function" | "class" | "interface" | "type" | "const" | "enum" | "default";
  nombre: string;
  firma: string;
}

/**
 * Extrae las firmas exportadas de un archivo TS/TSX. Toma la l\u00ednea de la
 * declaraci\u00f3n (hasta `{`, `=` o fin de l\u00ednea) — suficiente para que el modelo
 * «vea» el contrato sin el cuerpo completo.
 */
export function extraerFirmas(codigo: string): Firma[] {
  const firmas: Firma[] = [];
  const lineas = codigo.split("\n");
  for (const linea of lineas) {
    const m = linea.match(
      /^\s*export\s+(?:async\s+)?(function|class|interface|type|const|enum)\s+([A-Za-z0-9_]+)(.*)$/,
    );
    if (m) {
      const tipo = m[1] as Firma["tipo"];
      const nombre = m[2];
      // Recorta el cuerpo: nos quedamos con la cabecera del contrato.
      let firma = `${m[1]} ${nombre}${m[3]}`.replace(/\s*\{\s*$/, "").trimEnd();
      firma = firma.replace(/\s*=\s*$/, "").trimEnd();
      firmas.push({ tipo, nombre, firma: `export ${firma}` });
      continue;
    }
    if (/^\s*export\s+default\b/.test(linea)) {
      firmas.push({ tipo: "default", nombre: "default", firma: linea.trim() });
    }
  }
  return firmas;
}

export interface ArchivoFuente {
  path: string;
  contenido: string;
}

export interface ResumenFirmas {
  path: string;
  firmas: Firma[];
  caracteresOriginales: number;
  caracteresFirmas: number;
}

/**
 * Reemplaza cada archivo por una «tarjeta de firmas» (ahorro de contexto). El
 * ahorro real se mide: `caracteresFirmas` vs `caracteresOriginales`.
 */
export function aislarSimbolos(archivos: ArchivoFuente[]): ResumenFirmas[] {
  return archivos.map((a) => {
    const firmas = extraerFirmas(a.contenido);
    const texto = firmas.map((f) => f.firma).join("\n");
    return {
      path: a.path,
      firmas,
      caracteresOriginales: a.contenido.length,
      caracteresFirmas: texto.length,
    };
  });
}

/**
 * Compone el bloque de contexto AISLADO (s\u00f3lo firmas) listo para el prompt.
 * Para el momento de ESCRIBIR (write_file) se usa el archivo completo, no esto.
 */
export function componerContextoFirmas(archivos: ArchivoFuente[]): string {
  const resumenes = aislarSimbolos(archivos);
  return resumenes
    .map((r) => {
      const cuerpo =
        r.firmas.length > 0
          ? r.firmas.map((f) => `  ${f.firma}`).join("\n")
          : "  (sin exportaciones)";
      return `// ${r.path} — FIRMAS (${r.caracteresFirmas}/${r.caracteresOriginales} chars)\n${cuerpo}`;
    })
    .join("\n\n");
}
