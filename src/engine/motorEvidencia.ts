/**
 * motorEvidencia.ts — CLAIM → EVIDENCE → VERDICT (v1.34.0 · FASE 4)
 * ===================================================================================
 * QUÉ ES: el Evidence Engine de la hoja de ruta (§8). La filosofía ya vivía en
 * el proyecto —«lo que no se puede verificar no se afirma como hecho»— repartida
 * entre certeza contra disco, manifiesto SHA256, completitud y actas de obra.
 * Este módulo la unifica en UNA mecánica: toda AFIRMACIÓN importante nace como
 * CLAIM, exige una EVIDENCIA producida por una herramienta, y recibe un
 * VEREDICTO. Sin evidencia no hay VERIFICADO — punto.
 *
 * EL SALTO SOBRE v1.32: el contrato de aceptación (planAdaptativo) engancha la
 * evidencia AL PRIMER criterio sin probar — «por orden». Aquí el anclaje es
 * MECÁNICO: cada tipo de claim tiene su comando canónico (la tabla del §8), así
 * el motor sabe QUÉ ejecutar para probar cada cosa, no lo adivina el modelo.
 *
 *   «archivo creado»        → fs.stat
 *   «compila»               → npm run build / tsc --noEmit
 *   «test pasa»             → test runner
 *   «endpoint funciona»     → HTTP request
 *   «sitio publicable»      → auditor (preflight)
 *   «archivo idéntico»      → SHA256
 *   «bug arreglado»         → reproducción anterior + reproducción posterior
 *   «dependencia instalada» → package.json + node_modules
 *
 * ESTADOS (§8): VERIFICADO · PARCIAL · SIN_VERIFICAR · FALLO · BLOQUEADO.
 *
 * PUREZA: `clasificarClaim`, `comandoDeEvidencia` y `veredictoDeEvidencia` son
 * funciones puras. El registro por turno (registrarClaim/adjuntarEvidencia)
 * vive en memoria de módulo igual que planAdaptativo/auditoriaBucle: un turno,
 * un tablero de claims. No lee disco ni red: recibe el TEXTO de la prueba que
 * la herramienta ya produjo y dictamina. La autoridad del §30 sigue repartida
 * (disco/compilador/runner/HTTP); este motor solo ATA afirmación↔prueba.
 */

export type EstadoEvidencia =
  | "VERIFICADO"
  | "PARCIAL"
  | "SIN_VERIFICAR"
  | "FALLO"
  | "BLOQUEADO";

export type TipoClaim =
  | "archivo_creado"
  | "compila"
  | "test_pasa"
  | "endpoint_funciona"
  | "publicable"
  | "archivo_identico"
  | "bug_arreglado"
  | "dependencia_instalada"
  | "generico";

/** La tabla del §8: tipo de claim → cómo se prueba (comando/herramienta canónica). */
export interface AnclaEvidencia {
  /** La herramienta/comando que PRODUCE la evidencia. */
  comando: string;
  /** La autoridad del §30 que manda en este veredicto. */
  autoridad: string;
  /** Marcadores en la salida que confirman éxito. */
  exito: RegExp;
  /** Marcadores que delatan fallo (mandan sobre éxito). */
  fallo: RegExp;
}

export const TABLA_EVIDENCIA: Record<TipoClaim, AnclaEvidencia> = {
  archivo_creado: {
    comando: "fs.stat / list_files",
    autoridad: "DISCO",
    exito: /\b(existe|creado|size|bytes|\d+ ?b|stat ok|encontrado)\b/i,
    fallo: /\b(no existe|ENOENT|not found|no se encontr)/i,
  },
  compila: {
    comando: "npm run build / tsc --noEmit",
    autoridad: "COMPILADOR",
    exito: /\b(build (ok|success|complete)|compiled|0 errors|sin errores|exit code 0|\u2713 built)\b/i,
    fallo: /\b(error TS\d+|build failed|compilation error|[1-9]\d* errors?|exit code [1-9])\b/i,
  },
  test_pasa: {
    comando: "runner de tests",
    autoridad: "TEST RUNNER",
    exito: /\b(\d+ pass(ed|ing)|all tests pass|(\d+)\/\1|0 fail|\u2713.*tests?|correctas)\b/i,
    fallo: /\b([1-9]\d* fail(ed|ing)?|test.*failed|assertion failed|expected .* (but )?received|fallidas?: [1-9])\b/i,
  },
  endpoint_funciona: {
    comando: "HTTP request (curl/fetch)",
    autoridad: "BROWSER/HTTP",
    exito: /\b(200 ok|2\d\d\b|status[: ]2\d\d|response ok|json válido)\b/i,
    fallo: /\b(4\d\d\b|5\d\d\b|ECONNREFUSED|timeout|refused|status[: ][45]\d\d)\b/i,
  },
  publicable: {
    comando: "auditor / preflight web",
    autoridad: "AUDITOR",
    exito: /\b(preflight ok|auditor(\u00eda)? pasa|0 bloqueantes|publicable|sin bloqueos)\b/i,
    fallo: /\b([1-9]\d* bloqueantes?|con bloqueantes|preflight (fail|rojo)|contraste insuficiente|falta (alt|label|lang))\b/i,
  },
  archivo_identico: {
    comando: "SHA256",
    autoridad: "HASH",
    exito: /\b(sha256 (igual|coincide|match)|hash id\u00e9ntico|mismo hash|checksum ok)\b/i,
    fallo: /\b(sha256 (distinto|difiere|mismatch)|hash cambió|checksum fail)\b/i,
  },
  bug_arreglado: {
    comando: "reproducción anterior + posterior",
    autoridad: "REPRODUCCIÓN",
    exito: /\b(antes fallaba.*ahora|repro (ok|verde)|ya no (falla|reproduce)|fixed:.*verified)\b/i,
    fallo: /\b(sigue fallando|todavía (falla|reproduce)|no reproduje el estado previo)\b/i,
  },
  dependencia_instalada: {
    comando: "read package.json + fs node_modules",
    autoridad: "GESTOR DE PAQUETES",
    exito: /\b(declarad[oa] en package|node_modules\/.* existe|instalad[oa]|resolved)\b/i,
    fallo: /\b(no declarad|falta en package|node_modules.* no existe|unmet|missing dependency)\b/i,
  },
  generico: {
    comando: "prueba objetiva pertinente",
    autoridad: "EVIDENCIA",
    exito: /\b(ok|correcto|verificad|\u2713|pass|success|hecho y comprobado)\b/i,
    fallo: /\b(error|fail|falló|no|refused|excepción)\b/i,
  },
};

// ═════════════════════════════════════════════════════════════════
// CLASIFICACIÓN: de una afirmación en prosa al tipo de claim (y su ancla)
// ═════════════════════════════════════════════════════════════════

/** Patrones que reconocen el TIPO de afirmación en un texto libre (el criterio). */
const PATRONES_CLAIM: Array<{ tipo: TipoClaim; re: RegExp }> = [
  { tipo: "archivo_identico", re: /idéntic|mismo hash|sha256|checksum|no cambió el archivo|byte a byte/i },
  { tipo: "bug_arreglado", re: /\bbug\b|arreglad|corregid|ya no falla|resuelto el error|fix(ed)?/i },
  { tipo: "compila", re: /compila|typecheck|build|tsc|sin errores de tipo|transpila/i },
  { tipo: "test_pasa", re: /tests?\b|pruebas? pasan|suite|cobertura|assert/i },
  { tipo: "endpoint_funciona", re: /endpoint|api\b|http|ruta \/[a-z]|responde|status ?2\d\d|fetch|petición/i },
  { tipo: "publicable", re: /publicable|auditor|preflight|accesib|contraste|seo|lighthouse|responsive/i },
  { tipo: "dependencia_instalada", re: /dependenci|instalad|node_modules|package\.json|paquete/i },
  { tipo: "archivo_creado", re: /\bexiste\b|cread|generad|el archivo\b|se escribió|guardad/i },
];

export function clasificarClaim(texto: string): TipoClaim {
  const t = (texto || "").trim();
  if (!t) return "generico";
  for (const p of PATRONES_CLAIM) if (p.re.test(t)) return p.tipo;
  return "generico";
}

/** El ANCLA MECÁNICA: dado un criterio en prosa, con qué comando se prueba. */
export function comandoDeEvidencia(textoOtipo: string | TipoClaim): AnclaEvidencia & { tipo: TipoClaim } {
  const tipo = (Object.prototype.hasOwnProperty.call(TABLA_EVIDENCIA, textoOtipo as string)
    ? (textoOtipo as TipoClaim)
    : clasificarClaim(String(textoOtipo)));
  return { tipo, ...TABLA_EVIDENCIA[tipo] };
}

// ═════════════════════════════════════════════════════════════════
// EL VEREDICTO: ¿la evidencia SOSTIENE la afirmación?
// ═════════════════════════════════════════════════════════════════

export interface Veredicto {
  estado: EstadoEvidencia;
  tipo: TipoClaim;
  autoridad: string;
  motivo: string;
}

/**
 * Dado el TEXTO de la afirmación y el TEXTO de la evidencia que produjo la
 * herramienta, dictamina. Regla del §8/§30:
 *   · evidencia vacía            → SIN_VERIFICAR (jamás VERIFICADO por defecto)
 *   · hay marcador de fallo      → FALLO (manda sobre el éxito)
 *   · hay marcador de éxito      → VERIFICADO
 *   · hay evidencia sin marcador → PARCIAL (algo se midió, no concluye)
 */
export function veredictoDeEvidencia(afirmacion: string, evidencia: string | null | undefined): Veredicto {
  const tipo = clasificarClaim(afirmacion);
  return veredictoPorTipo(tipo, evidencia);
}

/** Igual que `veredictoDeEvidencia` pero con el TIPO ya conocido (sin re-clasificar). */
export function veredictoPorTipo(tipo: TipoClaim, evidencia: string | null | undefined): Veredicto {
  const ancla = TABLA_EVIDENCIA[tipo];
  const ev = (evidencia || "").trim();
  if (!ev) return { estado: "SIN_VERIFICAR", tipo, autoridad: ancla.autoridad, motivo: `sin evidencia: ejecutá ${ancla.comando}` };
  if (ancla.fallo.test(ev)) return { estado: "FALLO", tipo, autoridad: ancla.autoridad, motivo: "la evidencia delata un fallo" };
  if (ancla.exito.test(ev)) return { estado: "VERIFICADO", tipo, autoridad: ancla.autoridad, motivo: "la evidencia sostiene la afirmación" };
  return { estado: "PARCIAL", tipo, autoridad: ancla.autoridad, motivo: "hay evidencia pero no concluye: falta el marcador de éxito de la autoridad" };
}

// ═════════════════════════════════════════════════════════════════
// EL TABLERO DE CLAIMS POR TURNO (memoria de módulo, como planAdaptativo)
// ═════════════════════════════════════════════════════════════════

export interface Claim {
  id: string;
  afirmacion: string;
  tipo: TipoClaim;
  evidencia: string | null;
  veredicto: Veredicto;
}

let tablero: Claim[] = [];
let secuencia = 0;

/** Registra una afirmación. Nace SIN_VERIFICAR: la carga de la prueba es suya. */
export function registrarClaim(afirmacion: string, id?: string): Claim {
  const texto = String(afirmacion || "").trim().slice(0, 300);
  const cid = id || `c${++secuencia}`;
  const veredicto = veredictoDeEvidencia(texto, null);
  const claim: Claim = { id: cid, afirmacion: texto, tipo: veredicto.tipo, evidencia: null, veredicto };
  tablero.push(claim);
  return claim;
}

/** Adjunta la evidencia (salida real de la herramienta) y re-dictamina. */
export function adjuntarEvidencia(id: string, evidencia: string): Veredicto | null {
  const c = tablero.find((x) => x.id === id);
  if (!c) return null;
  c.evidencia = String(evidencia || "").slice(0, 600);
  c.veredicto = veredictoDeEvidencia(c.afirmacion, c.evidencia);
  return c.veredicto;
}

export interface EstadoEvidencias {
  /** true si algo NO está VERIFICADO (no se puede dar por hecho). */
  abierto: boolean;
  verificados: number;
  total: number;
  /** Claims que no llegan a VERIFICADO, con su estado y el comando que faltaría. */
  pendientes: Array<{ id: string; afirmacion: string; estado: EstadoEvidencia; comando: string }>;
  /** Los que directamente FALLARON: prioridad de reparación. */
  fallidos: string[];
}

export function estadoEvidencias(): EstadoEvidencias {
  const pendientes: EstadoEvidencias["pendientes"] = [];
  const fallidos: string[] = [];
  let verificados = 0;
  for (const c of tablero) {
    if (c.veredicto.estado === "VERIFICADO") { verificados++; continue; }
    if (c.veredicto.estado === "FALLO") fallidos.push(c.id);
    pendientes.push({ id: c.id, afirmacion: c.afirmacion, estado: c.veredicto.estado, comando: TABLA_EVIDENCIA[c.tipo].comando });
  }
  return { abierto: pendientes.length > 0, verificados, total: tablero.length, pendientes, fallidos };
}

/** La directiva que el motor inyecta cuando se quiere cerrar sin todo VERIFICADO. */
export function directivaDeEvidencia(e: EstadoEvidencias): string {
  if (!e.abierto) return "";
  const partes = [
    "EVIDENCE ENGINE (v1.34.0 · §8): no hay VERIFICADO sin evidencia. El cierre no procede: afirmaciones sin prueba objetiva.",
    ...e.pendientes.map((p) => `  · ${p.id} [${p.estado}] «${p.afirmacion.slice(0, 80)}» → producí la prueba con: ${p.comando}`),
  ];
  if (e.fallidos.length) partes.push(`  FALLARON (repará antes de cerrar): ${e.fallidos.join(", ")}`);
  partes.push("Adjuntá la salida real de la herramienta — la prosa no es evidencia (§30: la autoridad no es el modelo).");
  return partes.join("\n");
}

/** El parte para el acta: el tablero de claims como estado. */
export function evidenciaAParte(): string {
  if (tablero.length === 0) return "";
  return tablero.map((c) => `${c.id} [${c.veredicto.estado}] (${c.veredicto.autoridad}) «${c.afirmacion.slice(0, 60)}»`).join("\n");
}

/** Pruebas y arranques limpios: un turno, un tablero. */
export function reiniciarEvidencia(): void {
  tablero = [];
  secuencia = 0;
}

/** Solo lectura para tests y panel. */
export function verTablero(): Claim[] {
  return tablero.map((c) => ({ ...c, veredicto: { ...c.veredicto } }));
}

