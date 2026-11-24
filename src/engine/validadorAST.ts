/**
 * validadorAST.ts — VALIDA UNA EDICIÓN POR PARCHE MULTI-ARCHIVO ANTES DE COMPROMETERLA (v1.53.9)
 * ==============================================================================================
 * PASO 5 de la HOJA DE RUTA v1.54 (capacidad · BLOQUEADO por deps). HONESTIDAD
 * RADICAL por delante: el objetivo REAL de este paso —validar ediciones con un
 * AST de verdad (`ts-morph` o `@babel/*`)— NO se puede implementar NI verificar en
 * el entorno dev, porque esas librerías exigen RED + node_modules que aquí NO hay.
 * Meter una dependencia de red a ciegas rompería el principio del proyecto (no
 * depender de nube de pago ni de instalaciones pesadas) y, peor, dejaría una
 * promesa SIN VERIFICAR disfrazada de hecho.
 *
 * Por eso este módulo entrega lo que SÍ es correcto y comprobable HOY:
 *   1) la INTERFAZ `AnalizadorAST` — el contrato que cumplirá la implementación
 *      real cuando Mario instale las deps en su máquina; la dependencia queda
 *      AISLADA tras esta interfaz (el resto del motor no la ve), así que meterla
 *      luego NO toca `server.ts` ni rompe el trinquete;
 *   2) un FALLBACK REGEX **PROVISIONAL** y DETERMINISTA (sin red, sin deps) que
 *      NO pretende ser un AST: sólo caza la rotura GRUESA (delimitadores sin
 *      balancear, cadenas/plantillas/comentarios sin cerrar) y la REGRESIÓN DE
 *      CONTRATO entre archivos (borrar un archivo que otro importa, perder un
 *      export que otro usa por nombre, encogimiento anormal). Se marca a sí mismo
 *      como `motor:"regex-provisional"` y `confiable:false` — nunca miente sobre
 *      lo que es;
 *   3) el ORQUESTADOR `validarParcheMultiArchivo`, PURO: clona el mundo, aplica el
 *      parche en el clon, valida cada archivo tocado con el analizador INYECTADO
 *      (o el fallback) y cruza las invariantes entre archivos. No toca disco.
 *
 * REUTILIZA `importChecker.ts` como FUENTE ÚNICA de la extracción de imports y de
 * nombres importados (no se reimplementa el escaneo de imports).
 *
 * LÍMITES CONOCIDOS del fallback regex (otra razón de `confiable:false`): no
 * entiende literales de expresión regular (`/.../g`) ni la ambigüedad con la
 * división, ni valida tipos/ámbitos/resolución real de módulos. Para eso es el
 * AST real. El fallback es una RED DE SEGURIDAD, no un juez.
 *
 * CABLE MÍNIMO (NO toca server.ts — trinquete): quien edite por parche (p.ej. el
 * bucle de corrección o `ejecucionEspeculativa`) puede, ANTES de confirmar la
 * `capaTransaccion`, llamar:
 *     import { validarParcheMultiArchivo } from "./validadorAST";
 *     const v = validarParcheMultiArchivo(mundo, parches, { analizador });
 *     if (!v.ok) abortar(v.parte);   // no se compromete una edición rota
 * donde `analizador` es el adaptador AST real cuando exista (ver `adaptadorTsMorph`
 * de ejemplo al final, DESACTIVADO por carga perezosa). Mientras no se inyecte,
 * cae al fallback provisional. Módulo HUÉRFANO a propósito hasta que se cablee.
 *
 * VERIFICACIÓN: el fallback regex y el orquestador se prueban POR EJECUCIÓN en
 * Node v16 (`temp/harness_validador.mjs`). La validación con AST REAL (ts-morph/
 * babel) queda **SIN VERIFICAR** en dev y la corre Mario tras `npm install`.
 */

import { extraerImportsRelativos, extraerNombresImportados } from "./importChecker";
import type { Parche } from "./capaTransaccion";

// ─────────────────────────────────────────────────
// TIPOS — el contrato que la implementación AST real cumplirá
// ─────────────────────────────────────────────────

/** Qué motor emitió el veredicto. Sólo un AST real es `confiable`. */
export type MotorValidacion = "ts-morph" | "babel" | "regex-provisional";

export interface ProblemaSintaxis {
  tipo: "delimitador" | "cadena" | "comentario";
  mensaje: string;
  posicion: number;
}

export interface ResultadoArchivo {
  ruta: string;
  ok: boolean;
  motor: MotorValidacion;
  confiable: boolean;
  problemas: ProblemaSintaxis[];
}

/**
 * EL CONTRATO. La implementación real (ts-morph/babel) será un objeto que cumpla
 * esto; el fallback regex también lo cumple pero con `confiable:false`. Aislar la
 * dependencia AQUÍ es lo que impide que entre en `server.ts` o rompa el trinquete.
 */
export interface AnalizadorAST {
  nombre: MotorValidacion;
  confiable: boolean;
  analizar(ruta: string, contenido: string): ResultadoArchivo;
}

export interface CruceRoto {
  tipo: "import-a-borrado" | "export-perdido" | "encogimiento-anormal";
  archivo: string;
  detalle: string;
}

export interface VeredictoParche {
  ok: boolean;
  motor: MotorValidacion;
  confiable: boolean;
  archivos: ResultadoArchivo[];
  cruces: CruceRoto[];
  parte: string;
}

export interface OpcionesValidacion {
  /** analizador AST real; si falta, se usa el fallback regex provisional. */
  analizador?: AnalizadorAST;
  /** encogimiento (0..1) que se considera anómalo. Por defecto 0.35 (como el guardián). */
  umbralEncogimiento?: number;
  /** extensiones que se tratan como código a validar. */
  extensionesCodigo?: string[];
}

/** Extensiones de código por defecto (lo demás —json, css, md— no se valida como JS/TS). */
export const EXTENSIONES_CODIGO = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

// ─────────────────────────────────────────────────
// LÓGICA PURA — testeable sin SO, sin red, sin deps
// ─────────────────────────────────────────────────

/** ¿La ruta es un archivo de código JS/TS (por extensión)? */
export function esArchivoCodigo(ruta: string, exts: string[] = EXTENSIONES_CODIGO): boolean {
  if (!ruta) return false;
  const r = ruta.toLowerCase();
  return exts.some((e) => r.endsWith(e));
}

/**
 * BALANCE DE DELIMITADORES con una máquina de estados que IGNORA el interior de
 * cadenas (' " `), comentarios (// y de bloque) y conserva como código las
 * expresiones `${...}` de las plantillas. Devuelve la lista de problemas (vacía =
 * balanceado). PROVISIONAL: no entiende literales de expresión regular.
 */
export function balanceDelimitadores(texto: string): ProblemaSintaxis[] {
  const problemas: ProblemaSintaxis[] = [];
  const pila: Array<{ ch: string; pos: number }> = [];
  const tmplPila: number[] = []; // tamaño de `pila` en el que vive cada `{` de plantilla
  const pares: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const n = texto.length;
  let i = 0;
  let estado = "codigo"; // codigo | linea | bloque | sq | dq | tmpl
  while (i < n) {
    const c = texto[i];
    const d = i + 1 < n ? texto[i + 1] : "";
    if (estado === "codigo") {
      if (c === "/" && d === "/") { estado = "linea"; i += 2; continue; }
      if (c === "/" && d === "*") { estado = "bloque"; i += 2; continue; }
      if (c === "'") { estado = "sq"; i += 1; continue; }
      if (c === '"') { estado = "dq"; i += 1; continue; }
      if (c === "`") { estado = "tmpl"; i += 1; continue; }
      if (c === "(" || c === "[" || c === "{") { pila.push({ ch: c, pos: i }); i += 1; continue; }
      if (c === ")" || c === "]" || c === "}") {
        if (c === "}" && tmplPila.length && pila.length === tmplPila[tmplPila.length - 1]) {
          pila.pop(); tmplPila.pop(); estado = "tmpl"; i += 1; continue; // cierra la expresión de plantilla
        }
        const abierto = pila.pop();
        if (!abierto) { problemas.push({ tipo: "delimitador", mensaje: `cierre «${c}» sin apertura`, posicion: i }); }
        else if (pares[c] !== abierto.ch) { problemas.push({ tipo: "delimitador", mensaje: `cierre «${c}» no casa con «${abierto.ch}»`, posicion: i }); }
        i += 1; continue;
      }
      i += 1; continue;
    }
    if (estado === "linea") { if (c === "\n") estado = "codigo"; i += 1; continue; }
    if (estado === "bloque") { if (c === "*" && d === "/") { estado = "codigo"; i += 2; } else i += 1; continue; }
    if (estado === "sq" || estado === "dq") {
      const comilla = estado === "sq" ? "'" : '"';
      if (c === "\\") { i += 2; continue; }
      if (c === comilla) { estado = "codigo"; i += 1; continue; }
      if (c === "\n") { problemas.push({ tipo: "cadena", mensaje: "cadena sin cerrar al final de línea", posicion: i }); estado = "codigo"; i += 1; continue; }
      i += 1; continue;
    }
    if (estado === "tmpl") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { estado = "codigo"; i += 1; continue; }
      if (c === "$" && d === "{") { pila.push({ ch: "{", pos: i }); tmplPila.push(pila.length); estado = "codigo"; i += 2; continue; }
      i += 1; continue;
    }
    i += 1;
  }
  for (const ab of pila) problemas.push({ tipo: "delimitador", mensaje: `«${ab.ch}» abierto y nunca cerrado`, posicion: ab.pos });
  if (estado === "bloque") problemas.push({ tipo: "comentario", mensaje: "comentario de bloque sin cerrar", posicion: n });
  if (estado === "tmpl") problemas.push({ tipo: "cadena", mensaje: "plantilla sin cerrar", posicion: n });
  if (estado === "sq" || estado === "dq") problemas.push({ tipo: "cadena", mensaje: "cadena sin cerrar al final del archivo", posicion: n });
  return problemas;
}

/** Nombres EXPORTADOS por un archivo (declaraciones + `export { ... }` + default). */
export function extraerExports(texto: string): string[] {
  const out = new Set<string>();
  const decl = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(texto)) !== null) out.add(m[1]);
  const llaves = /\bexport\s*\{([^}]*)\}/g;
  while ((m = llaves.exec(texto)) !== null) {
    for (const parte of m[1].split(",")) {
      const trozo = parte.trim();
      if (!trozo) continue;
      const nombre = trozo.split(/\s+as\s+/).pop()!.trim(); // `export { a as b }` expone `b`
      if (/^[A-Za-z_$][\w$]*$/.test(nombre)) out.add(nombre);
    }
  }
  if (/\bexport\s+default\b/.test(texto)) out.add("default");
  return [...out];
}

/**
 * Nombres de import POR DEFECTO para un `specifier` (el `X` de `import X from "s"`
 * o `import X, { a } from "s"`). Hace falta para RESTARLOS de la lista mezclada de
 * `extraerNombresImportados` (que junta default + nombrados): un import por
 * defecto NO exige un export con ese mismo nombre, así que comprobarlo contra los
 * exports del destino daría un FALSO POSITIVO que rechazaría un parche sano.
 */
export function nombresPorDefectoImport(content: string, specifier: string): string[] {
  const esc = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`import\\s+([^"'\`;]*?)\\s*from\\s*["']${esc}["']`, "g");
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const clausula = m[1].trim();
    const porDefecto = clausula.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, "").replace(/,/g, "").trim();
    if (porDefecto && /^[A-Za-z_$][\w$]*$/.test(porDefecto) && porDefecto !== "type") out.add(porDefecto);
  }
  return [...out];
}

/**
 * RESOLUCIÓN RELATIVA simplificada (espejo del criterio de importChecker, pero
 * autocontenida para no arrastrar sus helpers privados al harness). Resuelve un
 * `spec` relativo desde `base` contra el conjunto de rutas EXISTENTES, probando
 * extensiones e índices. Devuelve la ruta destino o null. Sólo relativos (`./`,
 * `../`): los specs de paquete o absolutos se ignoran a propósito.
 */
export function resolverDestino(base: string, spec: string, existentes: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const partes = base.split("/");
  partes.pop(); // quita el nombre de archivo de `base`
  for (const p of spec.split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") partes.pop();
    else partes.push(p);
  }
  const r = partes.join("/");
  const candidatos = [r, r + ".ts", r + ".tsx", r + ".js", r + ".jsx", r + "/index.ts", r + "/index.tsx", r + "/index.js"];
  for (const cand of candidatos) if (existentes.has(cand)) return cand;
  return null;
}

// ─────────────────────────────────────────────────
// EL FALLBACK REGEX PROVISIONAL — cumple AnalizadorAST pero confiable:false
// ─────────────────────────────────────────────────

/** Valida la SINTAXIS GRUESA de un archivo con el fallback regex. Nunca confiable. */
export function validarSintaxisRegex(ruta: string, contenido: string): ResultadoArchivo {
  const problemas = balanceDelimitadores(contenido);
  return { ruta, ok: problemas.length === 0, motor: "regex-provisional", confiable: false, problemas };
}

/** El analizador por defecto: PROVISIONAL, DETERMINISTA, sin deps. Se marca confiable:false. */
export const analizadorRegexProvisional: AnalizadorAST = {
  nombre: "regex-provisional",
  confiable: false,
  analizar: validarSintaxisRegex,
};

// ─────────────────────────────────────────────────
// ORQUESTADOR — clona el mundo, aplica el parche en el clon y cruza invariantes
// ─────────────────────────────────────────────────

/**
 * Aplica los parches sobre un CLON del mundo (no muta el original). `contenido:null`
 * = BORRAR. Devuelve el mundo resultante. El mundo es un mapa ruta→contenido.
 */
export function aplicarParchesClon(mundo: Map<string, string>, parches: Parche[]): Map<string, string> {
  const clon = new Map<string, string>(mundo);
  for (const p of parches) {
    if (p.contenido === null) clon.delete(p.ruta);
    else clon.set(p.ruta, p.contenido);
  }
  return clon;
}

/**
 * CRUCES ENTRE ARCHIVOS tras aplicar el parche, reutilizando importChecker como
 * fuente única. Detecta: (a) un import relativo que ahora apunta a un archivo que
 * el parche BORRÓ o que nunca existió en el mundo resultante; (b) un nombre que un
 * archivo importa y que el destino YA NO exporta; (c) encogimiento anómalo de un
 * archivo editado (contrato que se desploma). Sólo mira archivos de código.
 */
export function cruzarContratos(
  mundoAntes: Map<string, string>,
  mundoDespues: Map<string, string>,
  parches: Parche[],
  umbralEncogimiento: number,
  exts: string[],
): CruceRoto[] {
  const cruces: CruceRoto[] = [];
  const existentes = new Set<string>(mundoDespues.keys());
  // (a)+(b): revisa TODOS los archivos del mundo resultante, no sólo los tocados:
  // un borrado puede romper a un tercero que ni siquiera estaba en el parche.
  for (const [ruta, contenido] of mundoDespues) {
    if (!esArchivoCodigo(ruta, exts)) continue;
    for (const spec of extraerImportsRelativos(contenido)) {
      const destino = resolverDestino(ruta, spec, existentes);
      if (destino === null) {
        cruces.push({ tipo: "import-a-borrado", archivo: ruta, detalle: `importa «${spec}» que ya no resuelve a ningún archivo` });
        continue;
      }
      const exportsDestino = new Set<string>(extraerExports(mundoDespues.get(destino) || ""));
      const porDefecto = new Set<string>(nombresPorDefectoImport(contenido, spec));
      for (const nombre of extraerNombresImportados(contenido, spec)) {
        if (nombre === "*" || nombre === "default") continue; // namespace/default: fuera del alcance del fallback
        if (porDefecto.has(nombre)) continue; // import por defecto: no exige un export con ese nombre
        if (!exportsDestino.has(nombre)) {
          cruces.push({ tipo: "export-perdido", archivo: ruta, detalle: `importa «${nombre}» de «${spec}» pero el destino ya no lo exporta` });
        }
      }
    }
  }
  // (c): encogimiento anómalo de archivos EDITADOS (no borrados ni nuevos).
  for (const p of parches) {
    if (p.contenido === null) continue;
    if (!esArchivoCodigo(p.ruta, exts)) continue;
    const antes = mundoAntes.get(p.ruta);
    if (antes === undefined || antes.length === 0) continue; // archivo nuevo: no hay con qué comparar
    const ratio = p.contenido.length / antes.length;
    if (ratio < 1 - umbralEncogimiento) {
      const pct = Math.round((1 - ratio) * 100);
      cruces.push({ tipo: "encogimiento-anormal", archivo: p.ruta, detalle: `el archivo encogió ${pct}% (umbral ${Math.round(umbralEncogimiento * 100)}%)` });
    }
  }
  return cruces;
}

/**
 * VALIDA UN PARCHE MULTI-ARCHIVO ANTES DE COMPROMETERLO. Puro: no toca disco.
 * Clona el mundo, aplica el parche, valida la sintaxis de cada archivo tocado con
 * el analizador inyectado (o el fallback regex) y cruza las invariantes entre
 * archivos. `ok` exige sintaxis correcta en todo lo tocado Y cero cruces rotos.
 */
export function validarParcheMultiArchivo(
  mundo: Map<string, string>,
  parches: Parche[],
  opciones: OpcionesValidacion = {},
): VeredictoParche {
  const analizador = opciones.analizador || analizadorRegexProvisional;
  const umbral = typeof opciones.umbralEncogimiento === "number" ? opciones.umbralEncogimiento : 0.35;
  const exts = opciones.extensionesCodigo || EXTENSIONES_CODIGO;
  const despues = aplicarParchesClon(mundo, parches);
  const archivos: ResultadoArchivo[] = [];
  for (const p of parches) {
    if (p.contenido === null) continue; // borrado: no hay sintaxis que validar
    if (!esArchivoCodigo(p.ruta, exts)) continue;
    archivos.push(analizador.analizar(p.ruta, p.contenido));
  }
  const cruces = cruzarContratos(mundo, despues, parches, umbral, exts);
  const sintaxisOk = archivos.every((a) => a.ok);
  const ok = sintaxisOk && cruces.length === 0;
  const parte = parteValidacion(archivos, cruces, analizador.nombre, analizador.confiable, ok);
  return { ok, motor: analizador.nombre, confiable: analizador.confiable, archivos, cruces, parte };
}

/** Resumen humano y HONESTO del veredicto (incluye el aviso de fiabilidad). */
export function parteValidacion(
  archivos: ResultadoArchivo[],
  cruces: CruceRoto[],
  motor: MotorValidacion,
  confiable: boolean,
  ok: boolean,
): string {
  const lineas: string[] = [];
  lineas.push(`[validadorAST] motor=${motor} confiable=${confiable ? "sí" : "NO"} → ${ok ? "PARCHE ACEPTABLE" : "PARCHE RECHAZADO"}`);
  for (const a of archivos) {
    if (a.ok) continue;
    for (const pr of a.problemas) lineas.push(`  ✗ ${a.ruta}: ${pr.mensaje} (@${pr.posicion})`);
  }
  for (const c of cruces) lineas.push(`  ✗ ${c.archivo}: ${c.detalle} [${c.tipo}]`);
  if (!confiable) lineas.push("  ⚠ fallback REGEX PROVISIONAL: sólo rotura gruesa de sintaxis y contrato; NO sustituye a un AST real. Resultado SIN VERIFICAR a nivel de tipos/ámbitos.");
  if (ok && confiable) lineas.push("  ✓ sin problemas de sintaxis ni de contrato entre archivos.");
  return lineas.join("\n");
}

// ─────────────────────────────────────────────────
// ADAPTADOR AST REAL — PLANTILLA (DESACTIVADA). La implementa Mario en su PC.
// ─────────────────────────────────────────────────
/**
 * Así se construye el analizador REAL cuando `ts-morph` esté instalado, SIN tocar
 * server.ts ni este archivo más que para cablearlo. Queda como texto-guía (no se
 * importa nada para no romper el build sin la dep). Carga perezosa recomendada:
 *
 *   // import { Project } from "ts-morph";
 *   // export function crearAnalizadorTsMorph(): AnalizadorAST {
 *   //   return {
 *   //     nombre: "ts-morph", confiable: true,
 *   //     analizar(ruta, contenido) {
 *   //       const proj = new Project({ useInMemoryFileSystem: true });
 *   //       const sf = proj.createSourceFile(ruta, contenido);
 *   //       const ds = sf.getPreEmitDiagnostics();
 *   //       const problemas = ds.map((d) => ({ tipo: "delimitador", mensaje: String(d.getMessageText()), posicion: d.getStart() || 0 }));
 *   //       return { ruta, ok: problemas.length === 0, motor: "ts-morph", confiable: true, problemas };
 *   //     },
 *   //   };
 *   // }
 *
 * Luego: validarParcheMultiArchivo(mundo, parches, { analizador: crearAnalizadorTsMorph() }).
 * El contrato (AnalizadorAST) no cambia → el resto del motor ni se entera. SIN
 * VERIFICAR en dev (sin node_modules): lo valida Mario tras `npm install`.
 */
