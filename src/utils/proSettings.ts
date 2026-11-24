/**
 * proSettings.ts — Configuración profesional del IDE (v1.8)
 * Persistencia local + aplicación de variables CSS + exportar/importar/reset.
 * Todo lo que un IDE pro debe poder configurar vive aquí.
 */

import { componerReglasProyecto, ENCABEZADO_REGLAS } from "../engine/reglasArquitecto";

export type ThemeId = "dark" | "midnight" | "carbon" | "light";

export interface WallpaperConfig {
  enabled: boolean;
  url: string;          // URL o dataURL subida por el usuario
  opacity: number;      // 0..1
  blur: number;         // px
  dim: number;          // 0..0.8  (capa negra encima para legibilidad)
  fit: "cover" | "contain" | "repeat";
  position: "center" | "top" | "bottom";
}

export interface ProSettings {
  appearance: {
    theme: ThemeId;
    accent: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    density: "compacta" | "normal" | "comoda";
    reduceMotion: boolean;
    showGrid: boolean;
    borderRadius: number;
  };
  wallpaper: WallpaperConfig;
  editor: {
    tabSize: number;
    insertSpaces: boolean;
    wordWrap: boolean;
    minimap: boolean;
    lineNumbers: boolean;
    highlightActiveLine: boolean;
    renderWhitespace: boolean;
    rulers: number[];
    fontLigatures: boolean;
    formatOnSave: boolean;
    autoSave: boolean;
    autoSaveDelayMs: number;
    bracketPairs: boolean;
    // F1 · autocorrector del composer: off / sugerir / auto (persistido).
    autocorrector: "off" | "sugerir" | "auto";
  };
  ai: {
    chatModel: string;
    agentModel: string;
    temperature: number;
    topP: number;
    topK: number;
    maxTokens: number;
    contextSize: number;
    stream: boolean;
    keepAlive: string;
    retries: number;
    timeoutMs: number;
    firstTokenTimeoutMs: number;
    systemExtra: string;
    /** v2.3.9 · interruptor del perfil de arquitecto de fábrica (ver engine/reglasArquitecto.ts). */
    reglasArquitecto: boolean;
    language: "es" | "en";
    executionMode: "auto" | "rapido" | "ingeniero" | "profundo";
    geminiThinkingLevel: "bajo" | "medio" | "alto";
    autoApproveReadTools: boolean;
    maxAgentSteps: number;
  };
  /** v1.57.19 · F3 · Orquestación: qué puede hacer el motor cuando un modelo falla. */
  orquestacion: {
    /** «Permitir rescate en la nube»: si | preguntar | no (default preguntar). */
    rescateNube: "si" | "preguntar" | "no";
  };
  net: {
    idePort: number;
    ollamaUrl: string;
    bridgeUrl: string;
    sandboxPort: number;
    lanMode: boolean;
    accessToken: string;
    allowRemoteCalls: boolean;
    offlineMode: boolean;
  };
  perf: {
    ramLimitMb: number;
    gpuLayers: number;
    maxThreads: number;
    cacheMb: number;
    autoPurge: boolean;
    logLevel: "error" | "warn" | "info" | "debug";
    telemetryMs: number;
  };
}

export const LS_PRO = "codigo0_pro_settings";

export const DEFAULTS: ProSettings = {
  appearance: {
    theme: "dark",
    accent: "#22d3ee",
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: 14, /* V8: default neutral — body usa var(--cn-font-size); 14px es el tamaño que heredaba antes */
    lineHeight: 1.5,
    density: "normal",
    reduceMotion: false,
    showGrid: false,
    borderRadius: 10,
  },
  // Por defecto el fondo usa un degradado interno (siempre carga, sin depender de internet)
  wallpaper: { enabled: true, url: "", opacity: 0.5, blur: 0, dim: 0.45, fit: "cover", position: "center" },
  editor: {
    tabSize: 2,
    insertSpaces: true,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
    highlightActiveLine: true,
    renderWhitespace: false,
    rulers: [100],
    fontLigatures: true,
    formatOnSave: false,
    autoSave: true,
    autoSaveDelayMs: 800,
    bracketPairs: true,
    autocorrector: "sugerir",
  },
  ai: {
    chatModel: "",
    agentModel: "",
    temperature: 0.4,
    topP: 0.9,
    topK: 40,
    maxTokens: 4096,
    contextSize: 8192,
    stream: true,
    keepAlive: "30m",
    retries: 3,
    timeoutMs: 300000,
    firstTokenTimeoutMs: 180000,
    systemExtra: "",
    // v2.3.9 · nace ENCENDIDO: una capacidad apagada por defecto es una capacidad
    // que nadie descubre. Quien escriba sus propias reglas en systemExtra manda
    // igual (la precedencia vive en componerReglasProyecto).
    reglasArquitecto: true,
    language: "es",
    // v1.73.0 · «muchas funciones está obsoleto la función de activar: deben
    // estar activas siempre». Los modos nacen encendidos: Pensar PROFUNDO y
    // Razonar ALTO son el default de fábrica (el usuario puede rotarlos en el
    // menú «Ajustes» del chat; quien ya eligió algo conserva su elección).
    executionMode: "profundo",
    geminiThinkingLevel: "alto",
    autoApproveReadTools: true,
    maxAgentSteps: 10,
  },
  orquestacion: {
    rescateNube: "preguntar",
  },
  net: {
    idePort: 3000,
    ollamaUrl: "http://127.0.0.1:11434",
    bridgeUrl: "http://127.0.0.1:5000",
    sandboxPort: 3500,
    lanMode: false,
    accessToken: "",
    allowRemoteCalls: false,
    offlineMode: false,
  },
  perf: {
    ramLimitMb: 4096,
    gpuLayers: -1,
    maxThreads: 0,
    cacheMb: 512,
    autoPurge: true,
    logLevel: "info",
    telemetryMs: 5000,
  },
};

/** Fusión profunda tolerante (no rompe si faltan claves nuevas) */
export function mergeSettings(base: any, patch: any): ProSettings {
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? mergeSettings(base?.[k] ?? {}, v) : v;
  }
  return out as ProSettings;
}

export function loadProSettings(): ProSettings {
  try {
    const raw = localStorage.getItem(LS_PRO);
    if (!raw) return DEFAULTS;
    return mergeSettings(DEFAULTS, JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

export function saveProSettings(s: ProSettings) {
  try {
    localStorage.setItem(LS_PRO, JSON.stringify(s));
  } catch {}
}

export function exportProSettings(s: ProSettings): string {
  return JSON.stringify(s, null, 2);
}

export function importProSettings(json: string): ProSettings {
  return mergeSettings(DEFAULTS, JSON.parse(json));
}

/**
 * Presets de fondo del menú «Degradados incluidos».
 *
 * v8.0.1 — Se añaden PRESETS DE IMAGEN (petición del usuario: «las imágenes
 * déjalas para seleccionar en el menú»). Antes solo había degradados CSS, así
 * que las imágenes del cerebro solo se podían meter una a una con el selector
 * de archivos: no había forma de volver a una sin volver a subirla.
 *
 * CÓMO FUNCIONA SIN TOCAR EL RENDER: `AppBackground` asigna `preset.css`
 * directamente a `background-image`, y un `url(...)` es un valor válido de esa
 * propiedad. Así que un preset de imagen no necesita ni una línea de código
 * nueva en el componente — es el mismo camino que ya usaban los degradados.
 *
 * ⚠️ `remoto: true` marca los que SÍ necesitan internet. Los degradados
 * cargan siempre; las imágenes no. Se etiqueta en el nombre para que el menú no
 * mienta, y se declara aquí para que cualquier filtro futuro pueda separarlos.
 *
 * SOBRE EL GIF (defecto que reportó el usuario: «me di cuenta que no admite
 * gif»): un GIF **sí** se anima como `background-image` en un navegador. Lo que
 * no lo admitía era el SELECCIONADOR DE ARCHIVOS, que además reescalaba todo con
 * canvas → JPEG y mataba la animación. Eso está corregido en `App.tsx`
 * (`handleBgFileSelected`). Aquí, cualquier preset puede apuntar a un `.gif` y
 * se animará igual que una imagen fija.
 */
export interface WallpaperPreset {
  id: string;
  label: string;
  css: string;
  /** true = necesita internet (imagen remota); false/ausente = degradado local. */
  remoto?: boolean;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  // v1.15.1 — El cerebro de siempre pasa a ser un PRESET local (no una imagen
  // "personalizada" embebida a mano en App.tsx). Así el panel Pro puede
  // cambiarlo por cualquier otro fondo y volver a él sin subir nada.
  { id: "predeterminado", label: "Cerebro (predeterminado)", css: 'url("/fondo-predeterminado.jpg")' },
  { id: "aurora", label: "Aurora", css: "radial-gradient(120% 80% at 15% 0%, #0e3a4a 0%, transparent 55%), radial-gradient(100% 70% at 85% 20%, #2a1a4d 0%, transparent 60%), linear-gradient(180deg,#05070d,#02040a)" },
  { id: "brain", label: "Neuronal", css: "radial-gradient(60% 50% at 50% 40%, #1b2a5e 0%, transparent 60%), radial-gradient(40% 40% at 70% 70%, #0e4a45 0%, transparent 65%), linear-gradient(180deg,#04060d,#010205)" },
  { id: "carbon", label: "Carbón", css: "repeating-linear-gradient(45deg,#08090c 0 12px,#06070a 12px 24px)" },
  { id: "matrix", label: "Matrix", css: "radial-gradient(80% 60% at 20% 10%, #06301f 0%, transparent 60%), linear-gradient(180deg,#020604,#010302)" },
  { id: "sunset", label: "Atardecer", css: "radial-gradient(70% 60% at 80% 10%, #4a1d2e 0%, transparent 60%), radial-gradient(60% 50% at 10% 40%, #2b1c4a 0%, transparent 60%), linear-gradient(180deg,#08060a,#020204)" },

  // ---------- IMÁGENES LOCALES (incluidas en la app, SIN internet) ----------
  // v1.45.5 — Fondos del propio Mario, empaquetados dentro de la app (viven en
  // public/fondos/). Se pueden elegir desde «Configuración PRO → Fondo» y no
  // necesitan conexión: la imagen ya viaja dentro del instalador.
  { id: "cerebro-hexagono", label: "Cerebro · hexágono", css: 'url("/fondos/cerebro-hexagono.jpg")' },
  { id: "cerebro-anillo", label: "Cerebro · anillo", css: 'url("/fondos/cerebro-anillo.jpg")' },
  { id: "cerebro-explosion", label: "Cerebro · explosión", css: 'url("/fondos/cerebro-explosion.jpg")' },
  { id: "cerebro-datos", label: "Cerebro · datos", css: 'url("/fondos/cerebro-datos.jpg")' },
  { id: "entrada-informacion", label: "Entrada de información", css: 'url("/fondos/entrada-informacion.jpg")' },
  { id: "cerebro-entrada-anim", label: "Cerebro · entrada (animado)", css: 'url("/fondos/cerebro-entrada.gif")' },

  // ---------- IMÁGENES (requieren internet) ----------
  { id: "cerebro-chip", label: "Cerebro · chip (imagen)", remoto: true, css: 'url("https://sc04.alicdn.com/kf/Sc25fb60e0d5a4ffd887ec435a80a72d0Y.jpg")' },
  { id: "cerebro-flujo", label: "Cerebro · flujo de datos (imagen)", remoto: true, css: 'url("https://sc04.alicdn.com/kf/S004f4b0c291e446c9cc95523a8aeebecN.jpg")' },
  { id: "cerebro-cristal", label: "Cerebro · cristal (imagen)", remoto: true, css: 'url("https://sc04.alicdn.com/kf/S09296bd5001746d39830f1b4653d4ad0e.jpg")' },
];

/* v1.16.4 · REVIVE — el applyProSettings del arranque pisa los valores por
 * defecto del CSS: si el token vivo se afila acá y no acá, el nitido duraba
 * hasta la primera hidratación. oscurecido del velo NO se toca (legibilidad
 * sobre imagen sigue mandando).
 *
 * PALETA v1 — los cuatro papeles (bg/panel/border/text) dejan de escribirse
 * acá. No es un adiós cosmético: eran `style.setProperty` INLINE, o sea la
 * máxima especificidad del documento, y el selector `[data-cn-modo="claro"]`
 * del motor de paleta no podía ganarles ni con !important. Mientras el panel
 * Pro siguiera escribiéndolos, elegir «Claro» desde la tarjeta de Aspecto
 * cambiaría los paneles y dejaría el cuerpo del color viejo: dos dueños para
 * el mismo bote. Aquí queda la TABLA como referencia documentada de lo que
 * era cada tema y el modo como única fuente del papel. */
export const THEMES: Record<ThemeId, { bg: string; panel: string; border: string; text: string }> = {
  dark: { bg: "#05070d", panel: "#0a0f1a", border: "#1e2b45", text: "#eef2f7" },
  midnight: { bg: "#02040a", panel: "#070c16", border: "#182742", text: "#dbeafe" },
  carbon: { bg: "#0b0b0d", panel: "#121215", border: "#242428", text: "#e7e7ea" },
  light: { bg: "#f6f7f9", panel: "#ffffff", border: "#dfe3ea", text: "#111827" },
};

/** Aplica tipografía/acento/redondez como variables CSS globales (el papel lo decide la paleta). */
export function applyProSettings(s: ProSettings) {
  const root = document.documentElement;
  root.style.setProperty("--cn-accent", s.appearance.accent);
  root.style.setProperty("--cn-font", s.appearance.fontFamily);
  root.style.setProperty("--cn-font-size", `${s.appearance.fontSize}px`);
  root.style.setProperty("--cn-line-height", String(s.appearance.lineHeight));
  root.style.setProperty("--cn-radius", `${s.appearance.borderRadius}px`);
  const dens = s.appearance.density === "compacta" ? 0.86 : s.appearance.density === "comoda" ? 1.12 : 1;
  root.style.setProperty("--cn-density", String(dens));
  root.dataset.theme = s.appearance.theme;
  root.dataset.density = s.appearance.density;
  if (s.appearance.reduceMotion) root.dataset.reduceMotion = "1";
  else delete root.dataset.reduceMotion;
}

/**
 * reglasEfectivas — el texto de reglas que viaja al system prompt del turno.
 *
 * v2.3.9 · El módulo `engine/reglasArquitecto` existía completo y sin un solo
 * consumidor: el panel Pro escribía `ai.systemExtra` y `App.tsx` lo inyectaba
 * en crudo, así que las reglas de fábrica nunca llegaban al modelo. Esta
 * función es el cable que faltaba, y vive aquí —no en App.tsx— porque la
 * configuración es la dueña natural del dato.
 *
 * Precedencia (la decide `componerReglasProyecto`, no esta capa):
 *   1. Si el usuario escribió sus propias reglas en `systemExtra`, mandan ellas.
 *   2. Si no escribió nada y `reglasArquitecto` está encendido, van las de fábrica.
 *   3. Si `reglasArquitecto` está apagado, no se inyecta nada.
 *
 * Devuelve "" cuando no hay nada que inyectar: el llamador no debe añadir un
 * encabezado vacío al prompt.
 */
export function reglasEfectivas(s: ProSettings | null | undefined): string {
  const ai = s?.ai;
  const cuerpo = componerReglasProyecto(ai?.systemExtra, ai?.reglasArquitecto !== false);
  return cuerpo ? `${ENCABEZADO_REGLAS}\n${cuerpo}` : "";
}
