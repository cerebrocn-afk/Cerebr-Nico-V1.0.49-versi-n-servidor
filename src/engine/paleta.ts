/**
 * paleta.ts — PALETA v1: el modo CLARO existe de verdad, y la superficie elige vidrio u opaco
 * ==========================================================================================
 * El defecto que resuelve (pedido explícito: «la función de paleta light/claro/opaco no
 * está; solo está el fondo de pantalla intercambiable»):
 *
 *   En `utils/proSettings.ts` había un tema `light` con sus cuatro tokens
 *   (`--cn-bg/panel/border/text`) y `applyProSettings` escribía `data-theme="light"`
 *   en <html>. Pero CASI NADIE consume esos tokens: la interfaz está pintada con clases
 *   literales de Tailwind — 298 `bg-[#0a0f1a]`, 208 `border-[#141d2e]`, 840
 *   `text-zinc-*`, 50 `text-white` — y en index.css el bloque `[data-theme="light"]`
 *   eran ocho líneas que solo tocaban `body`, `header` y `aside`. Resultado: elegir
 *   «Claro» dejaba el cuerpo blanco con los paneles negros y la letra blanca encima.
 *   No era un tema claro feo: era un tema claro INEXISTENTE.
 *
 * La solución, en el orden que manda la casa (derivar, no reescribir 400 clases):
 *
 *   1. Tailwind v4 construye cada utilidad de color sobre `--color-<familia>-<paso>`.
 *      RE-DERIVAR esa escala dentro de `[data-cn-modo="claro"]` voltea de golpe todo
 *      `text-zinc-*`, `bg-zinc-*`, `border-zinc-*`, `text-slate-*`, `text-neutral-*`…
 *      sin tocar un componente. Es el mismo truco que ya recolorea el acento cian
 *      (index.css, bloque «TEMA DE ACENTO»), aplicado a los neutros.
 *   2. Los literales `bg-[#…]` / `border-[#…]` llevan el color DENTRO del nombre de
 *      clase, así que no hay variable que derivar. Para ellos existe `hexAClaro`:
 *      una transformación determinista HSL que conserva el tono, recorta la saturación
 *      e INVIORTE la luz — de modo que el panel más hondo del oscuro se convierte en la
 *      superficie MÁS GRIS del claro (el hueco sigue pareciendo hueco) y el panel
 *      elevado en casi blanco. La jerarquía sobrevive al volteo porque se calcula.
 *   3. El inventario (`HEXES_SUPERFICIE` / `HEXES_BORDE`) sale del `src/` real y
 *      `tests/paleta.test.ts` lo contrasta clase a clase en las dos direcciones: si la
 *      interfaz estrena un `bg-[#…]` que la paleta no conoce, el test lo denuncia con
 *      nombre y apellido. Un claro con huecos negados no es claro: es un tema con manchas.
 *   4. La SUPERFICIE es un eje aparte del MODO porque son decisiones distintas:
 *        · «vidrio» — paneles translúcidos con desenfoque: el fondo de pantalla se ve.
 *        · «opaca»  — superficie sólida, cero desenfoque, `--cn-module-opacity: 1`: la
 *          interfaz se desconecta del fondo. Quien quiere claridad absoluta la tiene sin
 *          perder su tapiz; quien lo quiere detrás, lo tiene.
 *      `intensidad` (40–100 %) modula ese eje y es la misma palanca que ya consumen las
 *      reglas de fondo de pantalla (`--cn-module-opacity`): no se inventa un regulador
 *      nuevo que luego nadie lee — el defecto contrario ya está documentado en V8.
 *
 * Puro, sin DOM en la lógica: `hexAClaro`, `normalizarPaleta` y `hojaPaleta` se prueban
 * en node (salida estable, byte a byte). El DOM solo lo toca `aplicarPaleta` (guarded).
 */

export type ModoPaleta = "oscuro" | "claro";
export type TipoSuperficie = "vidrio" | "opaca";

export interface ConfigPaleta {
  /** Modo de color: la paleta entera (fondos, bordes, letra neutra) se deriva de aquí. */
  modo: ModoPaleta;
  /** Cómo se comporta la superficie frente al fondo de pantalla. */
  superficie: TipoSuperficie;
  /** Solidez de la superficie translúcida, 40–100 % (100 = opaco aunque sea «vidrio»). */
  intensidad: number;
}

export const MODOS: ReadonlyArray<{ id: ModoPaleta; nombre: string; icono: string; nota: string }> = [
  { id: "oscuro", nombre: "Oscuro", icono: "🌑", nota: "azul-noche de siempre" },
  { id: "claro", nombre: "Claro", icono: "☀️", nota: "papel frío, tinta profunda" },
];

export const SUPERFICIES: ReadonlyArray<{ id: TipoSuperficie; nombre: string; icono: string; nota: string }> = [
  { id: "vidrio", nombre: "Vidrio", icono: "🔍", nota: "los paneles dejan pasar el fondo" },
  { id: "opaca", nombre: "Opaco", icono: "⬛", nota: "superficie sólida, cero desenfoque" },
];

export const MODO_POR_DEFECTO: ModoPaleta = "oscuro";
export const SUPERFICIE_POR_DEFECTO: TipoSuperficie = "vidrio";
export const INTENSIDAD_MIN = 40;
export const INTENSIDAD_MAX = 100;
/** 62 % es lo que la interfaz ya traía de serie (los velados del index.css van de .50 a .62). */
export const INTENSIDAD_POR_DEFECTO = 62;

export const CONFIG_PALETA_POR_DEFECTO: ConfigPaleta = {
  modo: MODO_POR_DEFECTO,
  superficie: SUPERFICIE_POR_DEFECTO,
  intensidad: INTENSIDAD_POR_DEFECTO,
};

export const LS_CLAVE = "cn.paleta.v1";
export const HOJA_ID = "cn-paleta-hoja";
export const ATRIBUTO_MODO = "data-cn-modo";
export const ATRIBUTO_SUPERFICIE = "data-cn-superficie";

/* ── color puro ────────────────────────────────────────────────────────────
   Sin dependencias: sRGB ↔ HSL redondeado a enteros, para que la hoja generada
   sea idéntica en cualquier máquina (y reproblema byte a byte en el test). */

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }

/** Acepta #rgb, #rrggbb y #rrggbbaa (el alfa se ignora: es color, no opacidad). */
export function hexARgb(h: unknown): RGB | null {
  if (typeof h !== "string") return null;
  const s = h.trim().replace(/^#/, "");
  const seis = s.length === 3 ? s.split("").map((c) => c + c).join("")
    : s.length === 8 ? s.slice(0, 6)
    : s.length === 6 ? s
    : null;
  if (!seis || !/^[0-9a-fA-F]{6}$/.test(seis)) return null;
  return {
    r: parseInt(seis.slice(0, 2), 16),
    g: parseInt(seis.slice(2, 4), 16),
    b: parseInt(seis.slice(4, 6), 16),
  };
}

export function rgbAHex({ r, g, b }: RGB): string {
  const dos = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${dos(r)}${dos(g)}${dos(b)}`;
}

/** HSL con h en grados [0,360) y s/l en porcentaje [0,100]. */
export function rgbAHsl({ r, g, b }: RGB): HSL {
  const R = r / 255, G = g / 255, B = b / 255;
  const m = Math.max(R, G, B), n = Math.min(R, G, B), d = m - n;
  let h = 0;
  if (d !== 0) {
    if (m === R) h = ((G - B) / d) % 6;
    else if (m === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (m + n) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

export function hslARgb({ h, s, l }: HSL): RGB {
  const S = s / 100, L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (t[0] + m) * 255, g: (t[1] + m) * 255, b: (t[2] + m) * 255 };
}

const recorta = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * El equivalente CLARO de un color oscuro de la interfaz.
 *
 * · `superficie` — la luz del original manda la jerarquía: cuanto más hondo en el
 *   oscuro, más gris en el claro. Saturación recortada a 26 % para que el tinte azul
 *   sobreviva sin volverse lavanda.
 * · `borde` — banda 70–84 %: se ve sobre la superficie sin gritar.
 */
export function hexAClaro(hex: string, rol: "superficie" | "borde" = "superficie"): string {
  const rgb = hexARgb(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbAHsl(rgb);
  if (rol === "borde") return rgbAHex(hslARgb({ h, s: Math.min(s, 28), l: recorta(72 + l * 0.25, 70, 84) }));
  return rgbAHex(hslARgb({ h, s: Math.min(s, 26), l: recorta(91 + l * 0.35, 88, 97.5) }));
}

/* ── inventario ────────────────────────────────────────────────────────────
   Extraído de `src/` a grep. NO es decoración: cada entrada se convierte en una
   regla de la hoja, y el test comprueba que lista y código batan en las dos
   direcciones (mismo papel que TOKENS_TAMANO en engine/aspecto.ts). */

export const HEXES_SUPERFICIE: readonly string[] = [
  "bg-[#000000]", "bg-[#020306]", "bg-[#020408]", "bg-[#020408]/85", "bg-[#030509]", "bg-[#03050a]",
  "bg-[#03060c]", "bg-[#03060c]/80", "bg-[#03070e]", "bg-[#04060b]", "bg-[#04060c]", "bg-[#04060d]",
  "bg-[#04070d]", "bg-[#04070d]/95", "bg-[#040710]", "bg-[#05070d]", "bg-[#05080f]", "bg-[#050810]",
  "bg-[#050811]", "bg-[#050a12]", "bg-[#050a14]", "bg-[#060912]", "bg-[#060913]", "bg-[#060a12]", "bg-[#060a12]/80",
  "bg-[#060a14]", "bg-[#060b14]", "bg-[#06101f]", "bg-[#070b13]", "bg-[#070b14]", "bg-[#070b14]/95",
  "bg-[#070b16]", "bg-[#070c15]", "bg-[#070c15]/90", "bg-[#070c16]", "bg-[#080b12]", "bg-[#080d18]",
  "bg-[#080d18]/98", "bg-[#080d1a]", "bg-[#090d16]", "bg-[#090d16]/85", "bg-[#090e1c]", "bg-[#091122]",
  "bg-[#0a0e17]", "bg-[#0a0e17]/80", "bg-[#0a0e17]/90", "bg-[#0a0f1a]", "bg-[#0a0f1a]/70",
  "bg-[#0a0f1a]/90", "bg-[#0a0f1a]/95", "bg-[#0a0f1c]", "bg-[#0a1018]", "bg-[#0a101f]",
  "bg-[#0a1020]", "bg-[#0a1120]", "bg-[#0a1220]", "bg-[#0a1320]", "bg-[#0b101c]", "bg-[#0b1120]",
  "bg-[#0b1322]", "bg-[#0c1220]", "bg-[#0c162a]", "bg-[#0d121c]", "bg-[#0d121c]/60",
  "bg-[#0d121c]/85", "bg-[#0d121f]", "bg-[#0d1420]", "bg-[#0d1426]", "bg-[#0d1524]", "bg-[#0d1526]",
  "bg-[#0e1320]", "bg-[#0e1422]", "bg-[#0f1422]", "bg-[#0f172e]", "bg-[#111726]", "bg-[#111728]",
  "bg-[#111a29]", "bg-[#131a2c]", "bg-[#132038]", "bg-[#141b2b]", "bg-[#141d2e]", "bg-[#142036]",
  "bg-[#2a1418]", "bg-[#3d1c22]", "from-[#0f1422]", "ring-[#1b2740]", "to-[#0a0e17]",
];

export const HEXES_BORDE: readonly string[] = [
  "border-[#0d1422]", "border-[#0f1626]", "border-[#0f1728]", "border-[#101726]", "border-[#101828]",
  "border-[#10182a]", "border-[#121824]", "border-[#121a2c]", "border-[#131b2c]", "border-[#131c2c]",
  "border-[#141d2e]", "border-[#14202e]", "border-[#162034]", "border-[#16233b]", "border-[#172030]",
  "border-[#172238]", "border-[#182338]", "border-[#1a2333]", "border-[#1a2540]", "border-[#1b2438]",
  "border-[#1b2537]", "border-[#1b2735]", "border-[#1b2740]", "border-[#1b2a3f]", "border-[#1c2a42]",
  "border-[#1e293b]", "border-[#1f2b42]", "border-[#243457]", "border-[#2f4d4a]",
];

/** Neutros que la interfaz usa de verdad (los pasos que aparecen en src/, incluidos los dos inventados). */
export const PASOS_NEUTROS: readonly string[] = ["50", "100", "200", "300", "400", "500", "600", "700", "750", "800", "850", "900", "950"];
export const FAMILIAS_NEUTRAS: readonly string[] = ["zinc", "slate", "neutral", "gray"];

/**
 * Escala NEUTRA del modo claro. Invierte la banda de Tailwind: lo que era letra casi
 * blanca sobre negro pasa a tinta casi negra sobre papel, y lo que era panel negro pasa
 * a superficie clara. `750` y `850` NO existen en Tailwind: la app los usó cuatro veces
 * como clase muerta (el hover no pintaba nada) — declararles valor arregla de paso ese
 * hover que llevaba versiones enteras sin responder.
 */
const ZINC_CLARO: Record<string, string> = {
  "50": "#0d0f14", "100": "#171a21", "200": "#242832", "300": "#3a404d", "400": "#565d6c",
  "500": "#6b7280", "600": "#8b93a1", "700": "#c3cad6", "750": "#d3d9e3", "800": "#e6eaf1",
  "850": "#edf0f5", "900": "#f4f6fa", "950": "#fafbfd",
};

/** Las familias hermanas solo cambian de matiz: misma arquitectura de inversión. */
function deslizarMatiz(base: string, grados: number): string {
  const rgb = hexARgb(base);
  if (!rgb) return base;
  const { h, s, l } = rgbAHsl(rgb);
  return rgbAHex(hslARgb({ h: (h + grados + 360) % 360, s: Math.min(s + 4, 22), l }));
}

export function escalaClara(familia: string, paso: string): string {
  const base = ZINC_CLARO[paso] ?? ZINC_CLARO["500"];
  if (familia === "zinc") return base;
  if (familia === "slate") return deslizarMatiz(base, 12);
  if (familia === "gray") return deslizarMatiz(base, 6);
  return deslizarMatiz(base, -6); // neutral: un punto más cálido que el zinc
}

/** Familias de acento/estado usadas como letra, con su ancla de referencia. */
export const FAMILIAS_ACENTO: ReadonlyArray<{ id: string; ancla: string }> = [
  { id: "emerald", ancla: "#10b981" }, { id: "green", ancla: "#22c55e" },
  { id: "amber", ancla: "#f59e0b" }, { id: "orange", ancla: "#f97316" },
  { id: "yellow", ancla: "#eab308" }, { id: "rose", ancla: "#f43f5e" },
  { id: "red", ancla: "#ef4444" }, { id: "violet", ancla: "#8b5cf6" },
  { id: "purple", ancla: "#a855f7" }, { id: "fuchsia", ancla: "#d946f0" },
  { id: "sky", ancla: "#38bdf8" }, { id: "blue", ancla: "#3b82f6" },
  { id: "indigo", ancla: "#6366f1" }, { id: "teal", ancla: "#2dd4bf" },
  { id: "pink", ancla: "#f472b6" }, { id: "lime", ancla: "#84cc10" },
];

/**
 * En oscuro los pasos 100–400 son LETRA clara sobre superficie negra; en claro ese mismo
 * paso sería un susurro ilegible sobre papel, así que se hunde hacia la ancla.
 * Medido sobre src/: esos pasos solo aparecen como texto o borde tenue — NUNCA como
 * fondo (`grep (bg|ring)-<familia>-(100|200|300)` da cero), de modo que hundirlos no
 * oscurece ninguna mancha de color.
 */
export function pasoClaroDeAcento(ancla: string, paso: string): string {
  const a = hexARgb(ancla);
  if (!a) return ancla;
  /* Los pesos salen de la valla de contraste: con 0.52/0.62/0.72/0.84 las familias
     más claras (lima, ámbar, esmeralda) se quedaban en ~2.9:1 sobre blanco, que NO
     es legible. Hundidas hasta aquí, las 16 familias pasan 3:1 — el suelo de la WCAG
     para texto grande y el mínimo honesto para una etiqueta de estado. */
  const peso = paso === "100" ? 0.40 : paso === "200" ? 0.48 : paso === "300" ? 0.58 : 0.70;
  const mix = (k: "r" | "g" | "b") => Math.round(a[k] * peso);
  return rgbAHex({ r: mix("r"), g: mix("g"), b: mix("b") });
}

/* ── la hoja ──────────────────────────────────────────────────────────────── */

/** Escapa una clase literal de Tailwind para usarla dentro de un selector CSS. */
export function escaparClase(c: string): string {
  return c.replace(/[[\]#/.%:()*?{}|~^$+\\]/g, (ch) => "\\" + ch);
}

interface Pieza { prop: string; hex: string; alfa: number | null }

/** Descompone `bg-[#0a0f1a]/70` en { prop, hex, alfa }. Con corchetes o revienta la hoja. */
function piezaDe(clase: string): Pieza | null {
  const m = /^(bg|border|from|to|ring)-\[#([0-9a-fA-F]{3,8})\](?:\/(\d{1,3}))?$/.exec(clase);
  if (!m) return null;
  const alfa = m[3] ? Math.min(100, Math.max(0, Number(m[3]))) / 100 : null;
  return { prop: m[1], hex: `#${m[2]}`, alfa };
}

/** El valor CSS de un color claro, con su alfa si la clase lo llevaba. */
function valorRgb(claro: string, alfa: number | null): string {
  if (alfa === null) return claro;
  const rgb = hexARgb(claro);
  if (!rgb) return claro;
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${alfa})`;
}

/** Propiedad que de verdad controla cada familia de clases arbitrarias. */
function propiedadDe(prop: string): string | null {
  if (prop === "bg") return "background-color";
  if (prop === "border") return "border-color";
  if (prop === "ring") return "--tw-ring-color";
  if (prop === "from") return "--tw-gradient-from";
  if (prop === "to") return "--tw-gradient-to";
  return null;
}

function reglaDe(clase: string, rol: "superficie" | "borde", forzarOpaco = false): string {
  const p = piezaDe(clase);
  const prop = p && propiedadDe(p.prop);
  if (!p || !prop) return "";
  const claro = hexAClaro(p.hex, rol);
  const val = forzarOpaco ? claro : valorRgb(claro, p.alfa);
  return `[data-cn-modo="claro"] .${escaparClase(clase)}{${prop}:${val}!important}`;
}

/**
 * La misma clase, pero SIN su transparencia. «Opaco» no decide de qué color se
 * pinta —eso lo decide el modo—, solo cierra el alfa que la clase traía puesto.
 */
export function reglaSellada(clase: string, modo: ModoPaleta): string {
  const p = piezaDe(clase);
  const prop = p && propiedadDe(p.prop);
  if (!p || !prop) return "";
  const color = modo === "claro" ? hexAClaro(p.hex, p.prop === "border" ? "borde" : "superficie") : p.hex;
  return `${prop}:${color}!important`;
}

/**
 * Hoja determinista de la paleta. NO depende del config del usuario: las dos paletas
 * viajan siempre en el documento y cambiar de modo es voltear un atributo en <html>.
 * Por eso no hay parpadeo al cambiar, ni hoja que reinstalar, ni primer pintado a
 * medio teñir.
 */
export function hojaPaleta(): string {
  const p: string[] = [];
  p.push("/* PALETA v1 — generada por engine/paleta.ts. No editar a mano: se regenera. */");

  /* 1 · PAPELES PROPIOS. La app ya tenía --cn-bg/panel/border/text (que siguen siendo
         lo que elige el panel Pro); estos son los que consumen las piezas nuevas de
         chat y tareas, y son los únicos que voltean con el modo. */
  p.push(`:root,[data-cn-modo="oscuro"]{`
    + `--cn-papel:#0b111c;--cn-elevado:#111a29;--cn-hueco:#05080f;--cn-tinta:#eef2f7;`
    + `--cn-tinta-suave:#93a0b5;--cn-linea:#1a2436;--cn-linea-fuerte:#28374f;`
    + `--cn-sobre-hover:rgb(255 255 255 / 0.045);--cn-sobre-activo:rgb(255 255 255 / 0.075);`
    + `--cn-sombra-suave:0 1px 2px rgb(0 0 0 / 0.45);--cn-sombra-media:0 12px 32px rgb(0 0 0 / 0.5);`
    + `--cn-sombra-tarjeta:0 1px 0 rgb(255 255 255 / 0.03),0 2px 10px rgb(0 0 0 / 0.35);`
    + `color-scheme:dark;}`);

  /* 2 · NEUTROS: la palanca de verdad. 840 letras y ~300 fondos/bordes del IDE son
         clases zinc/slate/neutral/gray, y Tailwind v4 las lee de estas variables. */
  const neutros: string[] = [];
  for (const fam of FAMILIAS_NEUTRAS) {
    for (const paso of PASOS_NEUTROS) neutros.push(`--color-${fam}-${paso}:${escalaClara(fam, paso)};`);
  }
  p.push(`[data-cn-modo="claro"]{${neutros.join("")}`
    + `--cn-papel:#ffffff;--cn-elevado:#f7f9fc;--cn-hueco:#eaf0f7;--cn-tinta:#1a2029;`
    + `--cn-tinta-suave:#5d6878;--cn-linea:#dde3ee;--cn-linea-fuerte:#c2ccdd;`
    + `--cn-sobre-hover:rgb(26 32 41 / 0.05);--cn-sobre-activo:rgb(26 32 41 / 0.085);`
    + `--cn-sombra-suave:0 1px 2px rgb(23 32 48 / 0.07);--cn-sombra-media:0 12px 30px rgb(23 32 48 / 0.12);`
    + `--cn-sombra-tarjeta:0 1px 0 rgb(255 255 255 / 0.7),0 2px 8px rgb(23 32 48 / 0.07);`
    + `--cn-bg:#eef1f6;--cn-panel:#f7f9fc;--cn-border:#ccd5e4;--cn-text:#1a2029;`
    + `color-scheme:light;background:#eef1f6;color:#1a2029;}`);

  /* El borde universal y el cuerpo están clavados en @layer base con hex literales. */
  p.push(`[data-cn-modo="claro"] *,[data-cn-modo="claro"] *::before,[data-cn-modo="claro"] *::after{border-color:#d7dde8}`);
  p.push(`[data-cn-modo="claro"] body,[data-cn-modo="claro"] .app-shell-margin{background:#eef1f6;color:#1a2029}`);
  p.push(`[data-cn-modo="claro"] header,[data-cn-modo="claro"] aside{color:#1f2733}`);
  p.push(`[data-cn-modo="claro"] .text-white{color:#151a22}`);
  p.push(`[data-cn-modo="claro"] ::selection{background:color-mix(in srgb,var(--cn-accent) 26%,white);color:#0d1117}`);
  p.push(`[data-cn-modo="claro"] input,[data-cn-modo="claro"] select,[data-cn-modo="claro"] textarea{color-scheme:light}`);

  /* 3 · ACENTO y ESTADO: los pasos 100–400 se hunden (solo se usan como letra). */
  for (const f of FAMILIAS_ACENTO) {
    const v = ["100", "200", "300", "400"].map((s) => `--color-${f.id}-${s}:${pasoClaroDeAcento(f.ancla, s)};`).join("");
    p.push(`[data-cn-modo="claro"]{${v}}`);
  }
  /* El acento propio: un cian #22d3ee puro sobre papel es invisible como letra. La
     escala se re-deriva con la fórmula del bloque «TEMA DE ACENTO», cruzando a tinta. */
  p.push(`[data-cn-modo="claro"]{`
    + `--color-cyan-50:color-mix(in srgb,var(--cn-accent) 16%,white);`
    + `--color-cyan-100:color-mix(in srgb,var(--cn-accent) 58%,black);`
    + `--color-cyan-200:color-mix(in srgb,var(--cn-accent) 66%,black);`
    + `--color-cyan-300:color-mix(in srgb,var(--cn-accent) 82%,black);`
    + `--color-cyan-400:color-mix(in srgb,var(--cn-accent) 96%,black);}`);

  /* 4 · LITERALES: las 116 clases que llevan el color dentro del nombre. */
  p.push(HEXES_SUPERFICIE.map((c) => reglaDe(c, "superficie")).filter(Boolean).join("\n"));
  p.push(HEXES_BORDE.map((c) => reglaDe(c, "borde")).filter(Boolean).join("\n"));

  /* 5 · RECESOS y SCRIMS. En oscuro el hundido se pinta con negro al 30–40 %; sobre
         papel eso es una mancha, así que pasa a tinta al 6 %. El negro literal del chat
         ya está en el inventario. Los velados ≥50 % son scrim de modal o la capa «ver»
         sobre una imagen: esos siguen oscuros también en claro, porque un scrim claro
         no aísla nada. */
  p.push(`[data-cn-modo="claro"] .bg-black\\/30,[data-cn-modo="claro"] .bg-black\\/40{background-color:rgb(26 32 41 / 0.06)!important}`);
  p.push(`[data-cn-modo="claro"] .hover\\:bg-black\\/30:hover,[data-cn-modo="claro"] .hover\\:bg-black\\/40:hover{background-color:rgb(26 32 41 / 0.09)!important}`);

  /* 6 · CÓDIGO: el resaltado de Prism está escrito para negro; sus azules y verdes
         claros desaparecen sobre papel y se hunden con el mismo criterio. */
  p.push(`[data-cn-modo="claro"] .token.comment,[data-cn-modo="claro"] .token.prolog,[data-cn-modo="claro"] .token.doctype,[data-cn-modo="claro"] .token.cdata{color:#6b7280}`);
  p.push(`[data-cn-modo="claro"] .token.punctuation{color:#4b5563}`);
  p.push(`[data-cn-modo="claro"] .token.property,[data-cn-modo="claro"] .token.tag,[data-cn-modo="claro"] .token.boolean,[data-cn-modo="claro"] .token.number,[data-cn-modo="claro"] .token.constant,[data-cn-modo="claro"] .token.symbol,[data-cn-modo="claro"] .token.deleted{color:#b45309}`);
  p.push(`[data-cn-modo="claro"] .token.selector,[data-cn-modo="claro"] .token.attr-name,[data-cn-modo="claro"] .token.string,[data-cn-modo="claro"] .token.char,[data-cn-modo="claro"] .token.builtin,[data-cn-modo="claro"] .token.inserted{color:#047857}`);
  p.push(`[data-cn-modo="claro"] .token.operator,[data-cn-modo="claro"] .token.entity,[data-cn-modo="claro"] .token.url,[data-cn-modo="claro"] .token.function,[data-cn-modo="claro"] .token.class-name,[data-cn-modo="claro"] .token.title.important{color:#0369a1}`);
  p.push(`[data-cn-modo="claro"] .token.atrule,[data-cn-modo="claro"] .token.attr-value,[data-cn-modo="claro"] .token.keyword{color:#4338ca}`);
  p.push(`[data-cn-modo="claro"] .token.regex,[data-cn-modo="claro"] .token.important,[data-cn-modo="claro"] .token.variable{color:#be185d}`);
  p.push(`[data-cn-modo="claro"] .token.code-snippet{color:#6d28d9;background:rgb(26 32 41 / 0.06)}`);
  p.push(`[data-cn-modo="claro"] .prism-editor-pre{color:#2a3040}`);

  /* 7 · BARRAS: el riel negro y el pulgar azul-eléctrico son de modo oscuro. */
  p.push(`[data-cn-modo="claro"] ::-webkit-scrollbar-track,[data-cn-modo="claro"] ::-webkit-scrollbar-corner{background:#e6ebf3}`);
  p.push(`[data-cn-modo="claro"] ::-webkit-scrollbar-thumb{background:rgb(90 101 122 / 0.42);border-color:rgb(90 101 122 / 0.5)}`);
  p.push(`[data-cn-modo="claro"] ::-webkit-scrollbar-thumb:hover,[data-cn-modo="claro"] ::-webkit-scrollbar-thumb:active{background:rgb(90 101 122 / 0.72)}`);
  p.push(`[data-cn-modo="claro"] .custom-scrollbar,[data-cn-modo="claro"] .cn-vscroll,[data-cn-modo="claro"] .overflow-y-auto,[data-cn-modo="claro"] .overflow-auto{scrollbar-color:rgb(90 101 122 / 0.45) #e6ebf3}`);

  /* 8 · FONDO DE PANTALLA en claro: el velo que protege la letra era una capa de humo
         negro; sobre papel el velo tiene que ser de papel, no de humo. */
  p.push(`[data-cn-modo="claro"] body.has-brain-bg::before{background:linear-gradient(135deg,rgb(244 246 250 / 0.6) 0%,rgb(230 236 246 / 0.74) 100%)}`);
  p.push(`[data-cn-modo="claro"] body.has-brain-bg .text-zinc-100,[data-cn-modo="claro"] body.has-brain-bg .text-zinc-200,[data-cn-modo="claro"] body.has-brain-bg .text-white{text-shadow:none}`);
  p.push(`[data-cn-modo="claro"] .shadow-2xl,[data-cn-modo="claro"] .shadow-xl,[data-cn-modo="claro"] .shadow-lg{box-shadow:0 10px 30px rgb(23 32 48 / 0.10),0 2px 6px rgb(23 32 48 / 0.06)}`);
  p.push(`[data-cn-modo="claro"] .cn-glow{filter:brightness(0.88) saturate(1.05)}`);
  p.push(`[data-cn-modo="claro"] .cn-device-frame{border-color:#cbd5e1;box-shadow:0 0 0 2px #e2e8f1,0 24px 60px rgb(23 32 48 / 0.22)}`);
  p.push(`[data-cn-modo="claro"] .cn-device-notch{background:#cbd5e1}`);
  p.push(`[data-cn-modo="claro"] .cn-web-editor:fullscreen,[data-cn-modo="claro"] .cn-web-editor:-webkit-full-screen{background:#f2f5f9!important}`);

  /* 9 · SUPERFICIE OPACA — el otro eje, y la palabra que el pedido traía: «claro,
         opaco». Cero desenfoque (es lo más caro de la interfaz y lo que hace babear el
         texto ajeno, ya lo dice el bloque de rendimiento de index.css), los velados del
         fondo se sellan y `--cn-module-opacity` pasa a 1: las reglas de fondo ya leen
         esa variable, así que el deslizador no es decorativo. */
  p.push(`[data-cn-superficie="opaca"]{--cn-module-opacity:1}`);
  p.push(`[data-cn-superficie="opaca"] [class*="backdrop-blur"]{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}`);
  p.push(`[data-cn-superficie="opaca"] body.has-brain-bg header{background:rgba(6,10,18,0.98)!important}`);
  p.push(`[data-cn-superficie="opaca"] body.has-brain-bg .bg-\\[\\#0d121c\\],[data-cn-superficie="opaca"] body.has-brain-bg .bg-\\[\\#060a14\\],[data-cn-superficie="opaca"] body.has-brain-bg .bg-\\[\\#050811\\],[data-cn-superficie="opaca"] body.has-brain-bg .bg-\\[\\#060912\\],[data-cn-superficie="opaca"] body.has-brain-bg .bg-\\[\\#05070d\\]{background:rgba(8,12,20,0.98)!important}`);
  p.push(`[data-cn-superficie="opaca"][data-wallpaper="on"] .bg-\\[\\#000000\\],[data-cn-superficie="opaca"] .bg-\\[\\#080d18\\]\\/98{background-color:rgba(8,13,24,0.98)!important}`);
  /* Las clases con alfa del inventario, selladas en los dos modos. Se emiten por
     pareja (claro/oscurO) porque «opaco» no elige color: solo quita la transparencia.
     Con los dos atributos en el selector (0,3,0) ganan a la regla de modo (0,2,0). */
  p.push(HEXES_SUPERFICIE.filter((c) => /\/\d{1,3}$/.test(c))
    .map((c) => [
      `[data-cn-superficie="opaca"][data-cn-modo="claro"] .${escaparClase(c)}{${reglaSellada(c, "claro")}}`,
      `[data-cn-superficie="opaca"][data-cn-modo="oscuro"] .${escaparClase(c)}{${reglaSellada(c, "oscuro")}}`,
      `[data-cn-superficie="opaca"]:not([data-cn-modo]) .${escaparClase(c)}{${reglaSellada(c, "oscuro")}}`,
    ].join("\n")).filter(Boolean).join("\n"));

  /* 10 · ESTÉTICA DEL CHAT. Los papeles vienen de los tokens, así que la misma
         clase lee bien en oscuro y en claro. Regla de oro aquí dentro: NINGUNA de
         estas reglas pone `overflow` — los `pre` del chat tienen que seguir
         scrolleando en horizontal, y un `overflow:hidden` ereditario ya ha roto
         más de un bloque de código. */
  p.push(`.cn-chat-hilo>*+*{margin-top:calc(0.95rem * var(--cn-density,1))}`);
  p.push(`.cn-chat-burbuja{box-shadow:var(--cn-sombra-tarjeta);transition:border-color .16s ease,box-shadow .16s ease}`);
  p.push(`.cn-chat-burbuja:hover{box-shadow:var(--cn-sombra-media)}`);
  p.push(`.cn-chat-turno{min-width:0}`);
  p.push(`.cn-chat-burbuja--usuario{box-shadow:var(--cn-sombra-tarjeta),inset 0 1px 0 rgb(255 255 255 / 0.04)}`);
  /* El error se señala con un pelo interior rojo en vez de con más grasa de borde:
     el grosor del borde era lo que desalineaba la burbuja respecto a las demás. */
  p.push(`.cn-chat-burbuja--error{box-shadow:var(--cn-sombra-tarjeta),inset 3px 0 0 color-mix(in srgb,var(--color-rose-400) 78%,transparent)}`);
  p.push(`.cn-chat-sello{background-image:linear-gradient(180deg,color-mix(in srgb,var(--cn-accent) 14%,transparent),transparent)}`);
  p.push(`.cn-chat-pre{border-radius:calc(var(--cn-radius) * .55);scrollbar-width:thin}`);
  p.push(`.cn-chat-composer{transition:border-color .16s ease,box-shadow .16s ease}`);
  p.push(`.cn-chat-composer:focus-within{border-color:color-mix(in srgb,var(--cn-accent) 62%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--cn-accent) 32%,transparent),var(--cn-sombra-media)}`);

  /* 11 · VENTANA DE TAREAS — la tarjeta del plan, su cabecera, la fila de tarea y el
         chip de estado pasan a ser papeles con jerarquía en vez de divs sueltos. El
         panel vive montado sobre el chat y se mueve mucho: aquí la separación la
         hacen los bordes y la sombra, no el color de relleno, porque el relleno es lo
         que cambia de modo. */
  p.push(`.cn-tarea-card{background:var(--cn-papel);border:1px solid var(--cn-linea);border-radius:var(--cn-radius);box-shadow:var(--cn-sombra-tarjeta)}`);
  p.push(`.cn-tarea-card:hover{border-color:var(--cn-linea-fuerte)}`);
  p.push(`.cn-tarea-head{background:var(--cn-elevado);border-bottom:1px solid var(--cn-linea)}`);
  p.push(`.cn-tarea-fila{border:1px solid transparent;border-radius:calc(var(--cn-radius) * .6);transition:background-color .14s ease,border-color .14s ease}`);
  p.push(`.cn-tarea-fila:hover{background:var(--cn-sobre-hover);border-color:var(--cn-linea)}`);
  p.push(`.cn-tarea-chip{display:inline-flex;align-items:center;gap:.25rem;border-radius:999px;padding:.05rem .42rem;border:1px solid currentColor;font-size:.57rem;line-height:1.3;font-weight:700;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}`);
  /* La barra: el riel y la GEOMETRÍA del relleno van acá, pero el COLOR no. Una
     barra de «hechas» es esmeralda porque esmeralda es lo que significa, y una regla
     de estética que pinta de acento un semáforo de estado es un adorno que miente. */
  p.push(`.cn-tarea-barra{position:relative;height:5px;border-radius:999px;background:var(--cn-hueco);overflow:hidden}`);
  p.push(`.cn-tarea-barra>i{position:absolute;top:0;bottom:0;left:0;border-radius:999px;transition:width .35s ease}`);
  p.push(`.cn-tarea-marca{display:inline-flex;align-items:center;justify-content:center;width:1.05rem;height:1.05rem;border-radius:999px;font-size:.6rem;line-height:1;flex:0 0 auto}`);
  /* La fila de la LISTA de planes: antes el plan seleccionado se marcaba con un
     `border-l-2` que empujaba 2 px todo el contenido (la lista «bailaba» al hacer
     clic). El marca-do nuevo vive en un degradado de fondo y un pelo interior, así
     que seleccionar no mueve ni un píxel. */
  p.push(`.cn-plan-item{border-bottom:1px solid var(--cn-linea)}`);
  p.push(`.cn-plan-item:hover{background:var(--cn-sobre-hover)}`);
  p.push(`.cn-plan-item--activo{background:linear-gradient(90deg,color-mix(in srgb,var(--cn-accent) 12%,transparent),transparent 70%);box-shadow:inset 2px 0 0 var(--cn-accent)}`);
  p.push(`.cn-plan-item--activo:hover{background:linear-gradient(90deg,color-mix(in srgb,var(--cn-accent) 16%,transparent),transparent 70%)}`);
  p.push(`.cn-tarea-vacio{border:1px dashed var(--cn-linea-fuerte);border-radius:calc(var(--cn-radius) * .8);background:var(--cn-elevado);color:var(--cn-tinta-suave)}`);

  return p.filter(Boolean).join("\n") + "\n";
}

/* ── config: normalizar / persistir / aplicar ───────────────────────────────── */

export function normalizarPaleta(bruto: unknown): ConfigPaleta {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const modo: ModoPaleta = o.modo === "claro" || o.modo === "oscuro" ? o.modo : MODO_POR_DEFECTO;
  const superficie: TipoSuperficie = o.superficie === "opaca" || o.superficie === "vidrio" ? o.superficie : SUPERFICIE_POR_DEFECTO;
  const n = typeof o.intensidad === "number" && Number.isFinite(o.intensidad) ? Math.round(o.intensidad) : INTENSIDAD_POR_DEFECTO;
  return { modo, superficie, intensidad: Math.min(INTENSIDAD_MAX, Math.max(INTENSIDAD_MIN, n)) };
}

/** Compatibilidad: el tema del panel Pro (`dark|midnight|carbon|light`) ya elegía modo. */
export function modoDesdeTemaPro(tema: unknown): ModoPaleta | null {
  if (tema === "light") return "claro";
  if (tema === "dark" || tema === "midnight" || tema === "carbon") return "oscuro";
  return null;
}

/** Y a la inversa: para que el panel Pro enseñe el modo que está vigente de verdad. */
export function temaProDesdePaleta(modo: ModoPaleta, previo: string): string {
  if (modo === "claro") return "light";
  if (previo === "midnight" || previo === "carbon") return previo;
  return "dark";
}

export function leerPaletaLocal(): ConfigPaleta {
  try {
    const crudo = typeof localStorage !== "undefined" ? localStorage.getItem(LS_CLAVE) : null;
    if (!crudo) return { ...CONFIG_PALETA_POR_DEFECTO };
    return normalizarPaleta(JSON.parse(crudo));
  } catch {
    return { ...CONFIG_PALETA_POR_DEFECTO };
  }
}

export function escribirPaletaLocal(c: ConfigPaleta): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(LS_CLAVE, JSON.stringify(normalizarPaleta(c)));
    return true;
  } catch {
    return false;
  }
}

let HOJA_PUESTA = false;

/** Instala la hoja una sola vez por documento (el mismo patrón de FondoLayer). */
export function asegurarHojaPaleta(): void {
  if (typeof document === "undefined" || HOJA_PUESTA) return;
  if (!document.getElementById(HOJA_ID)) {
    const h = document.createElement("style");
    h.id = HOJA_ID;
    h.textContent = hojaPaleta();
    document.head.appendChild(h);
  }
  HOJA_PUESTA = true;
}

/** Para el test y para el arranque: las variables vivas que escribe `aplicarPaleta`. */
export function variablesDePaleta(c: ConfigPaleta): Record<string, string> {
  const t = normalizarPaleta(c);
  const solidez = t.superficie === "opaca" ? 1 : t.intensidad / 100;
  return {
    "--cn-solidez": String(solidez),
    /* La leen las reglas de fondo de pantalla de index.css: misma palabra, dos bocas. */
    "--cn-module-opacity": String(solidez),
  };
}

/**
 * Aplica la paleta: atributos + variables en <html>. Guarded — en node no hace nada,
 * que es como el test puede importar el módulo sin un dom.
 */
export function aplicarPaleta(c: ConfigPaleta): void {
  if (typeof document === "undefined") return;
  const t = normalizarPaleta(c);
  asegurarHojaPaleta();
  const r = document.documentElement;
  r.setAttribute(ATRIBUTO_MODO, t.modo);
  r.setAttribute(ATRIBUTO_SUPERFICIE, t.superficie);
  for (const [k, v] of Object.entries(variablesDePaleta(t))) r.style.setProperty(k, v);
}

/* ── el almacén ────────────────────────────────────────────────────────────
   La paleta tiene TRES bocas: la tarjeta de Aspecto (botón «A»), el panel Pro
   (pestañas Apariencia y Fondo) y el arranque de App.tsx. Sin un dueño único
   tendríamos tres `style.setProperty` inline peleándose por `--cn-bg` — que es,
   literalmente, el defecto que esta versión repara. El almacén es ese dueño:
   quien mueve un regulador escribe acá, y acá se aplica, se guarda y se avisa.

   No es un sistema reactivo: es un Set de callbacks. Cero dependencias nuevas. */

let ACTUAL: ConfigPaleta | null = null;
const SUSCRIPTORAS = new Set<(c: ConfigPaleta) => void>();

export function paletaActual(): ConfigPaleta {
  if (!ACTUAL) ACTUAL = leerPaletaLocal();
  return ACTUAL;
}

/** Escribe, aplica, persiste y avisa. Devuelve lo que quedó (normalizado). */
export function fijarPaleta(c: ConfigPaleta): ConfigPaleta {
  ACTUAL = normalizarPaleta(c);
  aplicarPaleta(ACTUAL);
  escribirPaletaLocal(ACTUAL);
  for (const f of Array.from(SUSCRIPTORAS)) { try { f(ACTUAL); } catch { /* una suscriptora rota no tumba a las demás */ } }
  return ACTUAL;
}

/** Se suscribe y RECIBE lo vigente en el acto (así el arranque tiñe antes del primer pintado). */
export function suscribirPaleta(f: (c: ConfigPaleta) => void): () => void {
  SUSCRIPTORAS.add(f);
  try { f(paletaActual()); } catch { /* idem */ }
  return () => { SUSCRIPTORAS.delete(f); };
}

/** Solo para pruebas: olvida el estado en memoria y la hoja instalada. */
export function reiniciarPaletaParaPruebas(): void {
  ACTUAL = null;
  SUSCRIPTORAS.clear();
  HOJA_PUESTA = false;
}

