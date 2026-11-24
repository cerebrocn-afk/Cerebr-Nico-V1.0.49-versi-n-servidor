/**
 * PODERES v1 (v1.0.3) — 22 operaciones deterministas nuevas para los espejos.
 * Cada espejo sigue con su orden original; ahora además acepta {accion:"…"} y
 * despacha un PODER. Puro, sin modelo, sin disco: números y estructuras exactas.
 * El puente es potenciarEspejos(): envuelve .ejecutar ANTES de interceptar,
 * con lo que ningún handler existente cambia de comportamiento.
 *
 * v1.0.6 · LOS TRES HUÉRFANOS YA TIENEN FUNCIÓN PROPIA (pedido de Mario:
 * «sí sería mejor que tengan una función en específico»). Antes eran
 * generalista, creadores y físicos: tenían nombre y orden clásica, pero
 * ninguna ACCIÓN, así que `{"accion":"…"}` devolvía un rechazo. Ahora:
 *   · espejo.generalista → `derivar` (ruta reflejo/conductor + equipo + señales)
 *                          y `estado` (introspección del propio espejo).
 *   · espejo.creadores    → `variantes` (ejes+semilla → N combos deterministas)
 *                          y `espacio` (tamaño muestral, sin generar nada).
 *   · espejo.fisicos      → `evaluar` (expresión con constantes SI) y
 *                          `convertir` (unidades SI, tabla cerrada).
 * Los tres conservan su orden clásica intacta cuando NO llega `accion`.
 */
import type { Entidad, ResultadoEntidad } from "./consejo";

type Env = (entidad: string, t0: number, ok: boolean, extra?: Partial<ResultadoEntidad>) => ResultadoEntidad;
type Poder = (d: any) => { ok: boolean; salida?: unknown; motivo?: string };

// ── utilidades puras ──────────────────────────────────────────────────────
const r4 = (n: number) => (isFinite(n) ? Math.round(n * 10000) / 10000 : n);
const hexRGB = (h: string) => {
  const m = String(h || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
};
const hexDe = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ── utilidades de los tres espejos que antes no tenían poderes (v1.0.6) ───

/** PRNG determinista (mulberry32): misma semilla, misma secuencia. */
const prng = (semilla: number): (() => number) => {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const hashSemilla = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

/** Constantes SI canónicas (las mismas que usa el handler clásico de físicos). */
const CONST_FIS: Record<string, number> = {
  pi: Math.PI, e: Math.E, tau: Math.PI * 2,
  c: 299792458, g: 9.80665, h: 6.62607015e-34, k: 1.380649e-23,
  na: 6.02214076e23, r: 8.31446262,
};
const FUNC_FIS: Record<string, (x: number) => number> = {
  raiz: Math.sqrt, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, log10: Math.log10,
  exp: Math.exp, sen: Math.sin, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  suelo: Math.floor, techo: Math.ceil, round: Math.round,
};

/**
 * Evaluador aritmético SIN eval (parser de descenso recursivo).
 * Duplicado a propósito del que vive en espejos.ts: ese es privado del módulo
 * y este archivo no puede importarlo sin acoplar los dos contratos. Si algún
 * día se unifican, el candidato natural es un `aritmetica.ts` compartido.
 */
function evaluarFis(expresion: string): { valor?: number; error?: string } {
  const src = String(expresion).trim().toLowerCase().replace(/,/g, ".");
  if (!src) return { error: "expresión vacía" };
  type Tok = { k: "num"; v: number } | { k: "nom"; v: string } | { k: "op"; v: string };
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m || !m[0]) return { error: `número inválido cerca de «${src.slice(i, i + 10)}»` };
      toks.push({ k: "num", v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (/[a-záéíóúñü]/i.test(ch)) {
      const m = /^[a-záéíóúñü]+/i.exec(src.slice(i));
      if (!m) break;
      toks.push({ k: "nom", v: m[0] }); i += m[0].length; continue;
    }
    if ("+-*/^%()".includes(ch)) { toks.push({ k: "op", v: ch }); i++; continue; }
    return { error: `carácter no reconocido «${ch}»` };
  }
  let pos = 0;
  const ver = () => toks[pos];
  const comer = (op: string) => !!(ver() && ver().k === "op" && (ver() as { v: string }).v === op && pos++);
  function expr(): number {
    let v = term();
    while (ver() && ver().k === "op") {
      const op = (ver() as { v: string }).v;
      if (op !== "+" && op !== "-") break;
      pos++; const d = term(); v = op === "+" ? v + d : v - d;
    }
    return v;
  }
  function term(): number {
    let v = factor();
    while (ver() && ver().k === "op") {
      const op = (ver() as { v: string }).v;
      if (op !== "*" && op !== "/" && op !== "%") break;
      pos++; const d = factor();
      if (op === "*") v *= d;
      else if (op === "/") { if (d === 0) throw new Error("división por cero"); v /= d; }
      else { if (d === 0) throw new Error("módulo por cero"); v %= d; }
    }
    return v;
  }
  function factor(): number {
    const base = primaria();
    if (ver() && ver().k === "op" && (ver() as { v: string }).v === "^") { pos++; return Math.pow(base, factor()); }
    return base;
  }
  function primaria(): number {
    if (comer("-")) return -primaria();
    if (comer("+")) return primaria();
    if (comer("(")) { const v = expr(); if (!comer(")")) throw new Error("paréntesis sin cerrar"); return v; }
    const tk = ver();
    if (!tk) throw new Error("expresión incompleta");
    if (tk.k === "num") { pos++; return tk.v; }
    if (tk.k === "nom") {
      pos++;
      if (ver() && ver().k === "op" && (ver() as { v: string }).v === "(") {
        pos++; const arg = expr(); if (!comer(")")) throw new Error("función sin cerrar");
        const f = FUNC_FIS[tk.v]; if (!f) throw new Error(`función desconocida «${tk.v}»`);
        return f(arg);
      }
      if (tk.v in CONST_FIS) return CONST_FIS[tk.v];
      throw new Error(`constante desconocida «${tk.v}»`);
    }
    throw new Error(`token inesperado «${(tk as { v: string }).v}»`);
  }
  try {
    const valor = expr();
    if (pos < toks.length) return { error: `sobró «${(toks[pos] as { v: string }).v}»` };
    if (!isFinite(valor)) return { error: "resultado no finito" };
    return { valor };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Tabla SI compacta: la misma que declara el handler clásico de físicos. */
const CONV_FIS: Record<string, number> = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mg: 1e-6, g: 1e-3, kg: 1, t: 1000, s: 1, min: 60, h: 3600, dias: 86400 };

/** Vocabulario de dominio del generalista (mismo que PALABRAS_GRUPO de espejos.ts). */
const VOCAB_DOMINIO: Record<string, string[]> = {
  codigo: ["codigo", "code", "bug", "debug", "depura", "refactor", "funcion", "function", "clase", "class", "variable", "script", "api", "endpoint", "test", "typescript", "javascript", "python", "rust", "react", "vue", "svelte", "npm", "modulo", "module", "import", "compile", "compila", "repositorio", "git", "sql", "query", "array", "bucle", "loop", "regex", "json", "yaml"],
  arte: ["disena", "diseno", "design", "paleta", "color", "colores", "logo", "marca", "branding", "poster", "cartel", "banner", "maqueta", "mockup", "ui", "ux", "interfaz", "fuente", "tipografia", "grilla", "grid", "icono", "ilustracion", "figura", "dibuja", "dibujar", "pinta", "imagen", "render", "estilo", "armonia", "visual"],
  ciencia: ["experimento", "hipotesis", "muestra", "estadistica", "media", "mediana", "desviacion", "anova", "t-test", "chi-cuadrado", "probabilidad", "fisica", "quimica", "biologia", "unidades", "conversion", "convierte", "medida", "evidencia", "investiga", "paper", "articulo", "cita", "constante"],
  cuantica: ["qubit", "qubits", "cuantico", "cuantica", "superposicion", "entrelazamiento", "hadamard", "cnot", "puerta h", "estado bell", "registro cuantico", "amplitud", "colapso", "decoherencia"],
};

// ── PODERES por espejo ────────────────────────────────────────────────────
export const PODERES: Record<string, Record<string, Poder>> = {
  "espejo.matematicos": {
    estadistica: (d) => {
      const v = (Array.isArray(d?.datos) ? d.datos : []).map(Number).filter((x: number) => isFinite(x)).sort((a: number, b: number) => a - b);
      if (v.length < 2) return { ok: false, motivo: "«datos» necesita ≥2 números." };
      const n = v.length, media = v.reduce((s: number, x: number) => s + x, 0) / n;
      const varM = v.reduce((s: number, x: number) => s + (x - media) ** 2, 0) / (n - 1);
      const sd = Math.sqrt(varM);
      const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
      const freq: Record<number, number> = {}; let moda = v[0], mc = 1;
      for (const x of v) { freq[x] = (freq[x] || 0) + 1; if (freq[x] > mc) { mc = freq[x]; moda = x; } }      return { ok: true, salida: { n, media: r4(media), mediana: r4(med), moda: mc > 1 ? moda : "sin moda", desv: r4(sd), min: v[0], max: v[n - 1], ic95: [r4(media - 1.96 * sd / Math.sqrt(n)), r4(media + 1.96 * sd / Math.sqrt(n))] } };
    },
    resolver: (d) => {
      const a = Number(d?.a), b = Number(d?.b);
      if (!isFinite(a) || !isFinite(b)) return { ok: false, motivo: "«a» y «b» numéricos (ax+b=0; añade «c» para ax²+bx+c=0)." };
      if (d?.c === undefined || d?.c === null) {
        if (a === 0) return { ok: false, motivo: "a=0 sin «c»: ecuación degenerada." };
        return { ok: true, salida: { tipo: "lineal", x: r4(-b / a) } };
      }
      const c = Number(d.c);
      if (!isFinite(c)) return { ok: false, motivo: "«c» no numérico." };
      if (a === 0) { if (b === 0) return { ok: false, motivo: "a=b=0: sin incógnita." }; return { ok: true, salida: { tipo: "lineal", x: r4(-c / b) } }; }
      const disc = b * b - 4 * a * c;
      if (disc < 0) { const re = -b / (2 * a), im = Math.sqrt(-disc) / (2 * a); return { ok: true, salida: { tipo: "cuadrática", discriminante: r4(disc), raices: [`${r4(re)}+${r4(im)}i`, `${r4(re)}−${r4(im)}i`] } }; }
      const rz = Math.sqrt(disc);
      return { ok: true, salida: { tipo: "cuadrática", discriminante: r4(disc), raices: [r4((-b + rz) / (2 * a)), r4((-b - rz) / (2 * a))].sort((x, y) => x - y) } };
    },
    matrices: (d) => {
      const A = d?.a, B = d?.b, op = String(d?.op || "");
      if (!Array.isArray(A) || !Array.isArray(A[0])) return { ok: false, motivo: "«a» debe ser matriz de filas [[..],[..]]." };
      const n = A.length, m = A[0].length;
      const det = (M: number[][]): number => {
        if (M.length === 1) return M[0][0];
        if (M.length === 2) return M[0][0] * M[1][1] - M[0][1] * M[1][0];
        return M[0].reduce((s, e, j) => s + (j % 2 ? -e : e) * det(M.slice(1).map((r) => [...r.slice(0, j), ...r.slice(j + 1)])), 0);
      };
      if (op === "det") { if (n !== m) return { ok: false, motivo: "det pide matriz cuadrada." }; return { ok: true, salida: { det: r4(det(A)) } }; }
      if (!Array.isArray(B) || !Array.isArray(B[0])) return { ok: false, motivo: "«b» debe ser matriz." };
      if (op === "sum") {
        if (n !== B.length || m !== B[0].length) return { ok: false, motivo: "sum pide mismo tamaño." };
        return { ok: true, salida: { suma: A.map((r: number[], i: number) => r.map((x: number, j: number) => r4(x + B[i][j]))) } };
      }
      if (op === "mul") {
        if (m !== B.length) return { ok: false, motivo: `mul pide columnas(A)=filas(B) (${m}≠${B.length}).` };
        const C = A.map((fila: number[]) => B[0].map((_: number, j: number) => r4(fila.reduce((s: number, x: number, k: number) => s + x * B[k][j], 0))));
        return { ok: true, salida: { producto: C } };
      }
      return { ok: false, motivo: "«op» debe ser sum|mul|det." };
    },
    bases: (d) => {
      const v = String(d?.numero ?? "").trim(), de = String(d?.de || "10");
      const n = parseInt(v, Number(de));
      if (!isFinite(n)) return { ok: false, motivo: "«numero» no es válido en base «de» (2|8|10|16)." };
      return { ok: true, salida: { dec: n, bin: n.toString(2), oct: n.toString(8), hex: n.toString(16).toUpperCase() } };
    },
    mcd_mcm: (d) => {
      let a = Math.abs(Math.trunc(Number(d?.a))), b = Math.abs(Math.trunc(Number(d?.b)));
      if (!isFinite(a) || !isFinite(b) || !a || !b) return { ok: false, motivo: "«a» y «b» enteros ≠0." };
      let x = a, y = b; while (y) { const t = y; y = x % y; x = t; }
      return { ok: true, salida: { mcd: x, mcm: (a / x) * b } };
    },
    interes: (d) => {
      const C = Number(d?.capital), t = Number(d?.tasa), an = Number(d?.anios), k = Number(d?.comp || 1);
      if (!isFinite(C) || !isFinite(t) || !isFinite(an)) return { ok: false, motivo: "«capital», «tasa» (0.08 = 8%) y «anios» son necesarios." };
      const M = C * Math.pow(1 + t / k, k * an);
      return { ok: true, salida: { monto: r4(M), ganancia: r4(M - C), capitalizacion: k } };
    },
  },

  "espejo.artes": {
    contraste: (d) => {
      const A = hexRGB(d?.a), B = hexRGB(d?.b);
      if (!A || !B) return { ok: false, motivo: "«a» y «b» deben ser HEX de 6 (#rrggbb)." };
      const l1 = lum(A), l2 = lum(B);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return { ok: true, salida: { ratio: r4(ratio), AA_normal: ratio >= 4.5, AA_grande: ratio >= 3, AAA_normal: ratio >= 7 } };
    },
    daltonismo: (d) => {
      const c = hexRGB(d?.base);
      if (!c) return { ok: false, motivo: "«base» debe ser HEX de 6." };
      const sim = (M: number[][]) => hexDe(M[0][0] * c.r + M[0][1] * c.g + M[0][2] * c.b, M[1][0] * c.r + M[1][1] * c.g + M[1][2] * c.b, M[2][0] * c.r + M[2][1] * c.g + M[2][2] * c.b);
      return { ok: true, salida: { base: d.base, protanopia: sim([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]), deuteranopia: sim([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]), tritanopia: sim([[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004732, 0.691367, 0.303901]]) } };
    },
    gradiente: (d) => {
      const A = hexRGB(d?.desde), B = hexRGB(d?.hasta);
      const pasos = Math.max(2, Math.min(32, Number(d?.pasos || 5)));
      if (!A || !B) return { ok: false, motivo: "«desde» y «hasta» deben ser HEX de 6." };
      return { ok: true, salida: { rampa: Array.from<number>({ length: pasos }).map((_, i: number) => { const t = i / (pasos - 1); return hexDe(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t); }) } };
    },
  },

  "espejo.codigos": {
    dependencias: (d) => {
      const codigo = String(d?.codigo || "");
      if (!codigo.trim()) return { ok: false, motivo: "no llegó «codigo»." };
      const mods = new Set<string>();
      for (const m of codigo.matchAll(/^\s*(?:import\s[^'"]*from|import|require\()\s*['"]([^'"]+)['"]/gm)) mods.add(m[1]);
      for (const m of codigo.matchAll(/^\s*(?:use|include)\s+([\w:]+)/gm)) mods.add(m[1]);
      return { ok: true, salida: { modulos: [...mods].sort(), total: mods.size } };
    },
    firmas: (d) => {
      const codigo = String(d?.codigo || "");
      if (!codigo.trim()) return { ok: false, motivo: "no llegó «codigo»." };
      const fs = [...codigo.matchAll(/\b(?:function|def|func)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g)];
      const firmas = fs.slice(0, 30).map((m) => `${m[1] || m[3]}(${(m[2] || m[4] || "").trim()})`);
      const clases = [...codigo.matchAll(/\b(?:class|struct|interface)\s+([A-Za-z_$][\w$]*)/g)].slice(0, 15).map((m) => m[1]);
      return { ok: true, salida: { funciones: [...new Set(firmas)], clases } };
    },
    duplicados: (d) => {
      const lineas = String(d?.codigo || "").split("\n").map((l) => sinAcentos(l.trim().toLowerCase())).filter((l) => l.length > 12);
      if (lineas.length < 6) return { ok: false, motivo: "«codigo» necesita ≥6 líneas con contenido." };
      const visto = new Map<string, number[]>();
      for (let i = 0; i + 6 <= lineas.length; i++) {
        const bloque = lineas.slice(i, i + 6).join("|");
        const arr = visto.get(bloque) || []; arr.push(i + 1); visto.set(bloque, arr);
      }
      const dup = [...visto.entries()].filter(([, v]) => v.length > 1).slice(0, 8);
      return { ok: true, salida: { bloques_repetidos: dup.map(([k, v]) => ({ lineas: v, muestra: k.split("|")[0].slice(0, 60) })), total: dup.length } };
    },
  },

  "espejo.lenguajes": {
    frecuencias: (d) => {
      const words = String(d?.texto || "").toLowerCase().match(/[a-záéíóúüñàâäèéêëìíîïòóôöùúûç]+/gi) || [];
      if (!words.length) return { ok: false, motivo: "no llegó «texto» con palabras." };
      const STOP = new Set(sinAcentos("de la que el en y a los del se las por un para con no una su lo como más pero sus le ya este esto son está ser tiene hacer cuando entre todo tras bajo sobre the of and to in is you that it he was for on are as with his they i at be this have from or one had by not what all were we when your can said each which do their time if will way about many then these so").split(" "));
      const freq: Record<string, number> = {};
      for (const w of words) if (!STOP.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, Math.max(3, Math.min(20, Number(d?.top || 10))));
      return { ok: true, salida: { top, unicas: Object.keys(freq).length } };
    },
    convertir: (d) => {
      const t = String(d?.texto || "").trim();
      if (!t) return { ok: false, motivo: "falta «texto»." };
      const parts = sinAcentos(t.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
      if (!parts.length) return { ok: false, motivo: "el texto no tiene palabras alfanuméricas." };
      const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
      return { ok: true, salida: { snake: parts.join("_"), kebab: parts.join("-"), camel: parts[0] + parts.slice(1).map(cap).join(""), pascal: parts.map(cap).join(""), titulo: parts.map(cap).join(" ") } };
    },
    diff: (d) => {
      const wa = String(d?.a || "").toLowerCase().match(/[\wáéíóúüñ]+/gi) || [];
      const wb = String(d?.b || "").toLowerCase().match(/[\wáéíóúüñ]+/gi) || [];
      if (!wa.length || !wb.length) return { ok: false, motivo: "«a» y «b» deben ser dos textos con palabras." };
      const sa = new Set(wa), sb = new Set(wb);
      const comunes = [...sa].filter((x) => sb.has(x));
      return { ok: true, salida: { agregadas: [...sb].filter((x) => !sa.has(x)).slice(0, 40), eliminadas: [...sa].filter((x) => !sb.has(x)).slice(0, 40), similitud: r4(comunes.length / new Set([...sa, ...sb]).size) } };
    },
  },

  "espejo.planificadores": {
    ordenar: (d) => {
      const tareas = Array.isArray(d?.tareas) ? d.tareas : [];
      const ids = tareas.map((t: any) => String(t?.id ?? "")).filter(Boolean);
      if (!ids.length || new Set(ids).size !== ids.length) return { ok: false, motivo: "«tareas»: [{id, depen:[ids]}] con ids únicos." };
      const dep: Record<string, string[]> = {}; const indeg: Record<string, number> = {};
      for (const t of tareas) { const id = String(t.id); dep[id] = (Array.isArray(t.depen) ? t.depen : []).map(String).filter((x: string) => ids.includes(x)); indeg[id] = dep[id].length; }
      for (const t of tareas) for (const p of dep[String(t.id)]) (indeg[p] = indeg[p] || 0);
      const cola = ids.filter((i: string) => indeg[i] === 0); const orden: string[] = [];
      while (cola.length) { const x = cola.shift()!; orden.push(x); for (const t of tareas) { const id = String(t.id); if (dep[id].includes(x) && --indeg[id] === 0) cola.push(id); } }
      if (orden.length !== ids.length) return { ok: true, salida: { orden: null, ciclo: ids.filter((i: string) => indeg[i] > 0), motivo: "hay dependencias circulares — el plan no es ejecutable tal cual." } };
      return { ok: true, salida: { orden } };
    },
    lotes: (d) => {
      const res = PODERES["espejo.planificadores"].ordenar(d);
      const orden: string[] | null = res.ok ? ((res.salida as any)?.orden ?? null) : null;
      if (!orden) return { ok: false, motivo: (res.salida as any)?.motivo || (res as any)?.motivo || "el orden topológico falló." };
      const tareas = d.tareas as any[]; const onda: Record<string, number> = {}; const lotes: string[][] = [];
      for (const id of orden) {
        const t = tareas.find((x: any) => String(x.id) === id);
        const depen: string[] = (Array.isArray(t?.depen) ? t.depen : []).map(String).filter((p: string) => onda[p] !== undefined);
        const w = depen.length ? Math.max(...depen.map((p: string) => onda[p])) + 1 : 0;
        while (lotes.length <= w) lotes.push([]);
        lotes[w].push(id); onda[id] = w;
      }
      return { ok: true, salida: { lotes, paralelizables: lotes.filter((L: string[]) => L.length > 1).length, profundidad: lotes.length } };
    },
  },

  "espejo.disenios": {
    escala: (d) => {
      const base = Number(d?.base || 16), ratio = Number(d?.ratio || 1.25);
      if (!isFinite(base) || !isFinite(ratio) || ratio <= 1) return { ok: false, motivo: "«base» px y «ratio» >1 (1.125|1.2|1.25|1.333|1.414|1.5|1.618)." };
      const nombres = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
      const pasos: Record<string, number> = {};
      nombres.forEach((nm, i) => { pasos[nm] = r4(base * Math.pow(ratio, i - 2)); });
      return { ok: true, salida: { ratio_nombres: { "1.125": "Major Second", "1.2": "Minor Third", "1.25": "Major Third", "1.333": "Perfect Fourth", "1.414": "Aug Fourth", "1.5": "Perfect Fifth", "1.618": "Golden" }[String(ratio)] || "personalizado", escala: pasos } };
    },
    breakpoints: (d) => {
      const min = Number(d?.min || 320);
      if (!isFinite(min) || min < 200) return { ok: false, motivo: "«min» en px (≥200, ej. 320)." };
      return { ok: true, salida: { movil: min, tableta: Math.round(min * 2), escritorio: Math.round(min * 3.75), wide: Math.round(min * 6), css: `@media (min-width:${Math.round(min * 2)}px){} @media (min-width:${Math.round(min * 3.75)}px){} @media (min-width:${Math.round(min * 6)}px){}` } };
    },
  },

  "espejo.cientificos": {
    tam_amostral: (d) => {
      const N = Number(d?.poblacion || 0), z = Number(d?.z || 1.96), e = Number(d?.margen || 0.05), p = Number(d?.p || 0.5);
      if (!isFinite(z) || !isFinite(e) || e <= 0 || e >= 1) return { ok: false, motivo: "«margen» entre 0 y 1 (0.05 = ±5%); «z» 1.96 = 95%." };
      const n0 = (z * z * p * (1 - p)) / (e * e);
      const n = N > 0 ? n0 / (1 + (n0 - 1) / N) : n0;
      return { ok: true, salida: { muestra: Math.ceil(n), poblacion: N || "infinita", confianza: z, margen: e } };
    },
    ic: (d) => {
      const media = Number(d?.media), sd = Number(d?.desv), n = Number(d?.n || 0), z = Number(d?.z || 1.96);
      if (![media, sd, n].every(isFinite) || n < 2) return { ok: false, motivo: "«media», «desv» y «n»≥2." };
      const margen = z * sd / Math.sqrt(n);
      return { ok: true, salida: { ic: [r4(media - margen), r4(media + margen)], margen_errores: r4(margen) } };
    },
  },

  "espejo.cuantico": {
    entrelazamiento: (d) => {
      const am = Array.isArray(d?.amplitudes) ? d.amplitudes.map(Number) : [];
      if (am.length !== 4 || !am.every(isFinite)) return { ok: false, motivo: "«amplitudes»: 4 números [a00,a01,a10,a11]." };
      const norm = am.reduce((s: number, x: number) => s + x * x, 0);
      if (Math.abs(norm - 1) > 0.01) return { ok: false, motivo: `las amplitudes no están normalizadas (Σ|a|²=${r4(norm)}).` };
      const C = Math.abs(am[0] * am[3] - am[1] * am[2]) * 2;
      return { ok: true, salida: { concurrencia: r4(C), entrelazado: C > 1e-6, max_entrelazado: Math.abs(C - 1) < 1e-6 } };
    },
  },

  // ═══ v1.0.6 · LOS TRES QUE NO TENÍAN ACCIÓN PROPIA ═══════════════════════

  "espejo.generalista": {
    /** `derivar` — la decisión de ruta que el generalista ya tomaba en su orden
     *  clásica, ahora invocable como acción nombrada y sin ambigüedad. */
    derivar: (d) => {
      const pedido = typeof d?.pedido === "string" ? d.pedido : "";
      if (!pedido.trim()) return { ok: false, motivo: "falta «pedido» (texto del pedido a derivar)." };
      const t = sinAcentos(pedido).toLowerCase();
      const senales: Record<string, { puntos: number; palabras: string[] }> = {};
      for (const [id, palabras] of Object.entries(VOCAB_DOMINIO)) {
        let puntos = 0; const encontradas: string[] = [];
        for (const p of palabras) {
          const clave = sinAcentos(p).toLowerCase();
          if (clave && t.includes(clave)) { puntos += clave.includes(" ") ? 2 : 1; encontradas.push(p); }
        }
        senales[id] = { puntos, palabras: encontradas.slice(0, 6) };
      }
      const ranking = Object.entries(senales).filter(([, v]) => v.puntos > 0).sort((a, b) => b[1].puntos - a[1].puntos);
      const total = ranking.reduce((n, [, v]) => n + v.puntos, 0);
      if (!ranking.length) {
        return { ok: true, salida: { ruta: "conductor", dominios: [], senales: {}, motivo: "cero señales de dominio: el generalista no adivina, deriva al conductor." } };
      }
      const dominios = ranking.slice(0, 2).map(([id, v]) => ({ grupo: id, puntos: v.puntos, senales: v.palabras }));
      const cruzado = ranking.length >= 2 && ranking[1][1].puntos >= Math.max(1, Math.floor(ranking[0][1].puntos / 2));
      return {
        ok: true,
        salida: {
          ruta: "reflejo",
          dominios,
          cruzado,
          confianza: r4(ranking[0][1].puntos / Math.max(1, total)),
          senales: Object.fromEntries(ranking.map(([id, v]) => [id, v.palabras])),
          nota: "Derivación léxica determinista: no juzga la calidad del pedido, solo a qué equipo pertenece.",
        },
      };
    },
    /** `estado` — introspección: qué acepta este espejo y con qué claves. */
    estado: () => ({
      ok: true,
      salida: {
        espejo: "espejo.generalista",
        rol: "integrador principal: detecta dominio, extrae fragmentos y sintetiza con procedencia",
        acciones: Object.keys(PODERES["espejo.generalista"]),
        claves: {
          derivar: ["pedido (texto)"],
          estado: [],
          "orden clásica (sin accion)": ["pedido (texto)"],
        },
        dominios: Object.keys(VOCAB_DOMINIO),
        nota: "Sin «accion» hace su orden clásica (síntesis multi-fuente). Con «accion» despacha la tabla de arriba.",
      },
    }),
  },

  "espejo.creadores": {
    /** `variantes` — el mismo contrato que la orden clásica, pero nombrado. */
    variantes: (d) => {
      const ejes = d?.ejes;
      if (!ejes || typeof ejes !== "object" || Array.isArray(ejes))
        return { ok: false, motivo: "falta «ejes» (objeto clave → lista de opciones)." };
      const claves = Object.keys(ejes);
      if (!claves.length || !claves.every((k) => Array.isArray((ejes as any)[k]) && (ejes as any)[k].length > 0 &&
        (ejes as any)[k].every((v: unknown) => ["string", "number"].includes(typeof v))))
        return { ok: false, motivo: "cada eje debe ser una lista NO vacía de textos o números." };
      const n = Math.max(1, Math.min(5000, Number(d?.n) > 0 ? Math.floor(Number(d.n)) : 10));
      const semilla = String(d?.semilla ?? "cerebronico");
      const espacio = claves.reduce((p, k) => p * (ejes as any)[k].length, 1);
      const sistematico = d?.sistematico !== false;
      const rnd = prng(hashSemilla(semilla));
      const variantes: Record<string, string | number>[] = [];
      for (let v = 0; v < n; v++) {
        const combo: Record<string, string | number> = {};
        if (sistematico) {
          let idx = v % espacio;
          for (const k of claves) { const lista = (ejes as any)[k]; combo[k] = lista[idx % lista.length]; idx = Math.floor(idx / lista.length); }
        } else {
          for (const k of claves) { const lista = (ejes as any)[k]; combo[k] = lista[Math.floor(rnd() * lista.length)]; }
        }
        variantes.push(combo);
      }
      return {
        ok: true,
        salida: {
          semilla, sistematico, espacioMuestral: espacio,
          avisos: sistematico && n > espacio ? ["n supera al espacio muestral: a partir de él las variantes se cíclican (se repiten)."] : [],
          n: variantes.length, variantes,
        },
      };
    },
    /** `espacio` — tamaño del espacio muestral SIN generar variantes. */
    espacio: (d) => {
      const ejes = d?.ejes;
      if (!ejes || typeof ejes !== "object" || Array.isArray(ejes))
        return { ok: false, motivo: "falta «ejes» (objeto clave → lista de opciones)." };
      const claves = Object.keys(ejes);
      if (!claves.length) return { ok: false, motivo: "«ejes» no tiene ninguna clave." };
      const detalle: Record<string, number> = {};
      let total = 1;
      for (const k of claves) {
        const lista = (ejes as any)[k];
        if (!Array.isArray(lista) || !lista.length) return { ok: false, motivo: `el eje «${k}» debe ser una lista NO vacía.` };
        detalle[k] = lista.length;
        total *= lista.length;
      }
      return { ok: true, salida: { ejes: claves.length, opcionesPorEje: detalle, espacioMuestral: total, nota: "Cada combinación es alcanzable con `variantes` y la misma semilla." } };
    },
  },

  "espejo.fisicos": {
    /** `evaluar` — expresión con constantes SI, nombrada. */
    evaluar: (d) => {
      const expr = typeof d?.expresion === "string" ? d.expresion : "";
      if (!expr.trim()) return { ok: false, motivo: "falta «expresion» (ej. \"2*c\" o \"m*g*h\")." };
      const { valor, error } = evaluarFis(expr);
      if (error) return { ok: false, motivo: `expresión inválida: ${error}` };
      return {
        ok: true,
        salida: {
          expresion: expr,
          valor: r4(valor as number),
          notacionCientifica: (valor as number).toExponential(4),
          constantes: Object.keys(CONST_FIS),
          funciones: Object.keys(FUNC_FIS),
        },
      };
    },
    /** `convertir` — unidades SI con tabla cerrada (no inventa unidades). */
    convertir: (d) => {
      const cantidad = Number(d?.cantidad);
      const de = String(d?.de ?? "");
      const a = String(d?.a ?? "");
      if (!isFinite(cantidad)) return { ok: false, motivo: "falta «cantidad» numérica." };
      if (!(de in CONV_FIS)) return { ok: false, motivo: `unidad de origen «${de}» no está en la tabla SI (${Object.keys(CONV_FIS).join(" ")})` };
      if (!(a in CONV_FIS)) return { ok: false, motivo: `unidad de destino «${a}» no está en la tabla SI (${Object.keys(CONV_FIS).join(" ")})` };
      return {
        ok: true,
        salida: {
          de, a, cantidad,
          resultado: r4((cantidad * CONV_FIS[de]) / CONV_FIS[a]),
          formula: "cantidad * factor(de) / factor(a)  [factores SI exactos]",
          unidades: Object.keys(CONV_FIS),
        },
      };
    },
  },
};

/** Catálogo TURBO: el reparto completo de poderes, listo para el system prompt. */
/**
 * v1.0.5 · LOS TRES QUE NO TENÍAN HABILIDAD, DECLARADOS (pregunta de Mario:
 * «¿puede ser que 3 espejos no tengan nombre/habilidad?» — medido: SÍ, son 3).
 * ──────────────────────────────────────────────────────────────────────────
 * v1.0.6 · RESUELTO: los tres recibieron acciones propias (ver cabecera).
 * La lista se conserva VACÍA a propósito en vez de borrarse: es el asiento
 * donde el test `espejosPoderesCableados` comprueba que no reaparezca un
 * espejo sin función. Si algún día se añade uno nuevo sin poderes, se declara
 * aquí y la suite vuelve a contar 1, 2 o 3 — con nombre y motivo.
 */
export const ESPEJOS_SIN_PODERES: readonly string[] = [];

/** Espejos que resuelven `accion` con su propio despacho (espejosNuevos.ts). */
export const ESPEJOS_CON_DESPACHO_PROPIO: readonly string[] = ["espejo.medicina", "espejo.codigo"];

export const CATALOGO_TURBO =
  "TURBO ESPEJOS ARMADO — reparto de poderes (usa consultar_espejo con {\"accion\"} en «datos», lotes de hasta 8; sin «accion» el espejo hace su orden clásica): " +
  Object.entries(PODERES).map(([id, p]) => `${id}: ${Object.keys(p).join("|")}`).join(" · ") +
  ". Regla turbo: NADA de aritmética, estadística, contraste, orden de tareas ni conversiones de cabeza o a mano — cada una de esas sale EXACTA de un espejo en ~1 ms. Antes de escribir un número que se pueda calcular, calculalo con el espejo." +
  // v1.0.5 · el catálogo se leía como si los poderes fueran todo el universo de
  // los espejos: nombraba 8 de 13 y callaba el resto. Un modelo que no sabe que
  // un espejo NO tiene poderes intenta usarlo, recibe un `ok` mentiroso y
  // termina haciendo la cuenta de cabeza. Ahora el reparto está completo.
  " · Con despacho propio (accion resuelta por el propio espejo, no por PODERES): " +
  ESPEJOS_CON_DESPACHO_PROPIO.join("|") +
  (ESPEJOS_SIN_PODERES.length
    ? ". SIN poderes (atienden su orden clásica, mandá los datos sin «accion»): " + ESPEJOS_SIN_PODERES.join("|") +
      ". Pedirles una acción a estos últimos devuelve un rechazo con este mismo aviso, no un resultado falso."
    : ". Los 13 espejos tienen ya acción propia: ninguno queda sin función.");


/** Envuelve los .ejecutar de los espejos con su tabla de poderes. Idempotente. */
export function potenciarEspejos(lista: Entidad[], r: Env): void {
  for (const e of lista) {
    const poderes = PODERES[e.id];
    const original = e.ejecutar;
    if (!poderes) {
      // v1.0.6 · este ramo ya NO describe a un espejo declarado sin función:
      // ESPEJOS_SIN_PODERES está vacía y los 13 tienen acciones. Sólo alcanza a
      // un espejo NUEVO que nadie cableó todavía. Antes era un `continue` liso y
      // el `accion` se perdía en silencio; aquí se responde la verdad (esa acción
      // no existe acá) sin inventarle poderes. Los de despacho propio se saltean
      // igual que antes — ellos sí saben qué hacer con `accion` en su .ejecutar.
      if (!original || (original as any).potenciado || (original as any).sinPoderes) continue;
      if (ESPEJOS_CON_DESPACHO_PROPIO.includes(e.id)) continue;
      const sinPoder: any = (d: any): ResultadoEntidad => {
        const accion = d && typeof d === "object" ? String((d as any).accion || "") : "";
        if (accion) {
          return r(e.id, Date.now(), false, {
            motivo:
              `«${accion}» no es una acción de ${e.id}: este espejo no está cableado a la tabla de poderes. ` +
              `Los espejos con poderes son: ${Object.keys(PODERES).join(", ")}. ` +
              (ESPEJOS_SIN_PODERES.includes(e.id)
                ? `${e.id} está declarado SIN poderes: atiende SOLO su orden clásica, mandando los datos SIN «accion».`
                : `Si ${e.id} es nuevo, decláralo en ESPEJOS_SIN_PODERES o dale acciones en PODERES.`),
          });
        }
        return original(d);
      };
      sinPoder.sinPoderes = true;
      sinPoder.potenciado = true; // idempotencia: potenciarEspejos se llama más de una vez
      e.ejecutar = sinPoder;
      continue;
    }
    if (!original || (original as any).potenciado) continue;
    const envuelta = (d: any): ResultadoEntidad => {
      const t0 = Date.now();
      const accion = d && typeof d === "object" ? String((d as any).accion || "") : "";
      if (accion && poderes[accion]) {
        try {
          const p = poderes[accion](d);
          return p.ok
            ? r(e.id, t0, true, { salida: JSON.stringify({ accion, ...(p.salida || {}) }) })
            : r(e.id, t0, false, { motivo: `poder «${accion}»: ${p.motivo || "sin motivo"}` });
        } catch (err: any) {
          return r(e.id, t0, false, { motivo: `poder «${accion}» reventó: ${String(err?.message || err)}` });
        }
      }
      if (accion) {
        return r(e.id, t0, false, { motivo: `«${accion}» no es poder de ${e.id}. Poderes: ${Object.keys(poderes).join(", ")}. (Sin «accion», el espejo hace su orden clásica.)` });
      }
      return original(d);
    };
    (envuelta as any).potenciado = true;
    e.ejecutar = envuelta;
  }
}
