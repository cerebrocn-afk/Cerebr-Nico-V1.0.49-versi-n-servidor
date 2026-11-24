/**
 * raizInstalacion.ts — DÓNDE ESTÁ LA CASA, SIN PREGUNTARLE AL SHELL (v1.0.23)
 * ========================================================================
 * PUREZO. Nada de `fs`, nada de `process`: recibe la foto (cwd, plataforma,
 * entorno, carpeta de `dist`) y decide. Quien toca el disco es `server.ts`.
 *
 * 🐞 EL FALLO QUE TRAJO ESTE MÓDULO
 * --------------------------------
 * El supervisor reanimaba con `cwd: process.cwd()`. `process.cwd()` NO es la
 * carpeta de instalación: es la carpeta desde la que alguien lanzó el proceso,
 * y cambia según cómo se arranque:
 *
 *   · doble clic en CerebroNico IDE.exe        → cwd = carpeta del .exe   OK
 *   · `node dist\server.mjs` desde otro lado   → cwd = esa otra carpeta   MAL
 *   · acceso directo con «Iniciar en» vacío    → cwd = C:\Windows\System32 MAL
 *   · `npm run dev` abierto a mano en otro sitio → cwd = ese otro sitio    MAL
 *
 * Los servicios se declaran con ruta RELATIVA (`scripts\hindsight_daemon.py
 * --port 5100`). Con el cwd equivocado el shim hace `cd /d <otra carpeta>`, el
 * archivo no existe, el hijo muere al nacer y el supervisor lo cuenta como
 * caído: 26 líneas de «no contesta → reanimo, intento N de 3» en el log de
 * Mario, sin un solo `uncaughtException`. Nunca fue el servidor: era el cwd.
 *
 * LA CURA, EN UNA FRASE
 * ---------------------
 * La casa se reconoce por sus MARCAS en el disco (qué hay donde yo estoy),
 * nunca por el directorio de trabajo ni por el entorno heredado.
 */

/** Marcas que tiene que tener una carpeta para ser la instalación de verdad. */
export const MARCAS_INSTALACION = ["agent_bridge_5000.py", "scripts", "package.json"];

/** Lo mínimo que hay que saber de una carpeta para juzgarla. */
export type SondaCarpeta = (carpeta: string) => boolean;

/** La orden explícita: «la casa es ÉSTA», para lanzadores raros. */
export const VAR_RAIZ_INSTALACION = "CN_INSTALL_ROOT";

export interface FotoRaiz {
  /** `process.cwd()`, tal cual. Es una pista, no una prueba. */
  cwd: string;
  /** `win32` o `posix`. */
  plataforma: string;
  /** De dónde viene el proceso: `dist/server.mjs` empaquetado o el `server.ts` de fuentes. */
  modo: "empaquetado" | "fuentes";
  /** `process.env`, para escuchar la orden explícita. */
  env?: Record<string, string | undefined>;
  /** Pregunta «¿esta carpeta tiene las marcas?». En la casa real: `fs.existsSync`. */
  existe?: SondaCarpeta;
  /** La carpeta donde vive el módulo que arrancó (`dirname(import.meta.url)`). */
  carpetaDelModulo?: string;
}

export interface DecisionRaiz {
  /** La carpeta de instalación, con separadores normalizados y sin barra final. */
  raiz: string;
  /** Cómo se llegó a ella. Va al log: sin esto, el próximo diagnóstico vuelve a empezar de cero. */
  origen: "orden-explicita" | "junto-al-modulo" | "cwd";
  /** Una línea para el log — siempre, aunque salga bien. */
  nota: string;
}

/** Une sin duplicar separadores ni dejar barra final. No resuelve `..` (eso es `path.resolve`). */
export function unirCarpeta(...partes: string[]): string {
  const sep = partes.some((p) => /[\\]/.test(p)) ? "\\" : "/";
  const limpio = partes
    .map((p) => String(p ?? ".").replace(/^[\\/]+/, ""))
    .filter((p) => p !== "" && p !== ".");
  const ruta = [partes[0] ? String(partes[0]).replace(/^[\\/]+/, (m) => m[0]) : ".", ...limpio.slice(1)]
    .join(sep)
    .replace(/[\\/]+/g, sep);
  return ruta.length > 1 ? ruta.replace(/[\\/]+$/, "") : ruta;
}

/**
 * Devuelve la carpeta padre de una ruta, sin importar el separador.
 * `C:\a\b` → `C:\a`; `/a/b` → `/a`; `C:\` → `C:\`.
 */
export function carpetaPadre(ruta: string): string {
  const r = String(ruta ?? "").replace(/[\\/]+$/, "");
  const i = Math.max(r.lastIndexOf("\\"), r.lastIndexOf("/"));
  if (i < 0) return r;
  const padre = r.slice(0, i);
  return /^[a-zA-Z]:$/.test(padre) ? padre + "\\" : padre || "/";
}

/**
 * ¿Esta carpeta tiene las marcas de la casa? Se pide todo lo declarado, no
 * «alguna»: un `package.json` suelto NO es una instalación (es la misma lección
 * del incidente del ZIP: un archivo suelto no define una raíz).
 */
export function esCasa(carpeta: string, existe: SondaCarpeta = () => false): boolean {
  if (!carpeta) return false;
  return MARCAS_INSTALACION.every((m) => {
    try {
      return existe(unirCarpeta(carpeta, m));
    } catch {
      return false;
    }
  });
}

/**
 * Las carpetas candidatas, en orden de confianza. La orden explícita primero:
 * si alguien dijo dónde está la casa, se le cree. Después el módulo (que es
 * donde vive el código, no donde apuntaba la consola). El cwd va ÚLTIMO y solo
 * como rescate: es la pista que ya nos falló.
 */
export function candidatasRaiz(foto: FotoRaiz): Array<{ raiz: string; origen: DecisionRaiz["origen"] }> {
  const env = foto.env || {};
  const lista: Array<{ raiz: string; origen: DecisionRaiz["origen"] }> = [];
  const orden = String(env[VAR_RAIZ_INSTALACION] || "").trim();
  if (orden) lista.push({ raiz: orden.replace(/[\\/]+$/, ""), origen: "orden-explicita" });
  const mod = String(foto.carpetaDelModulo || "").replace(/[\\/]+$/, "");
  if (mod) {
    // Empaquetado: el módulo vive en `<raiz>/dist`, así que la raíz es su padre.
    // Fuentes: el módulo vive en `<raiz>`, punto.
    // Y de todos modos se prueban los dos niveles: un proyecto es un proyecto.
    lista.push({ raiz: foto.modo === "empaquetado" ? carpetaPadre(mod) : mod, origen: "junto-al-modulo" });
    if (foto.modo === "empaquetado") lista.push({ raiz: mod, origen: "junto-al-modulo" });
  }
  lista.push({ raiz: String(foto.cwd || "").replace(/[\\/]+$/, ""), origen: "cwd" });
  return lista.filter((c) => c.raiz && c.raiz !== ".");
}

export interface ResultadoRaiz {
  /** La carpeta elegida. Nunca vacía: si nada calza, se usa el cwd (comportamiento viejo). */
  raiz: string;
  origen: DecisionRaiz["origen"];
  /** `true` cuando ninguna candidata tenía las marcas: es una anomalía, hay que avisar. */
  sinMarcas: boolean;
  nota: string;
}

/**
 * Decide la raíz de instalación. La regla que NO se negocia: nunca devuelve una
 * ruta vacía (el `cwd: ""` de `spawn` es el cwd del padre, o sea, el defecto
 * que veníamos a curar) y siempre deja dicho por qué eligió lo que eligió.
 */
export function decidirRaizInstalacion(foto: FotoRaiz, existe: SondaCarpeta = () => false): ResultadoRaiz {
  const sonda: SondaCarpeta = (c) => {
    try {
      return Boolean(existe(c));
    } catch {
      return false;
    }
  };
  const lista = candidatasRaiz(foto);
  for (const cand of lista) {
    if (esCasa(cand.raiz, sonda)) {
      return {
        raiz: cand.raiz,
        origen: cand.origen,
        sinMarcas: false,
        nota: `raíz de instalación: ${cand.raiz} (${cand.origen}) — tiene las ${MARCAS_INSTALACION.length} marcas`,
      };
    }
  }
  const rescate = String(foto.cwd || "").replace(/[\\/]+$/, "") || String(foto.carpetaDelModulo || "") || ".";
  return {
    raiz: rescate,
    origen: "cwd",
    sinMarcas: true,
    nota: `⛔ NINGUNA carpeta tiene las marcas ${MARCAS_INSTALACION.join(", ")}: los servicios reanimados pueden morir al nacer. Se usa ${rescate} por compatibilidad; revisá que estés lanzando desde la instalación o definí ${VAR_RAIZ_INSTALACION}.`,
  };
}

/**
 * La regla del empaquetado: `dist/server.mjs` significa que la raíz está un
 * nivel arriba. En fuentes (`server.ts`), la raíz es la carpeta del módulo.
 * Se expone porque el lanzador y la suite tienen que coincidir letra por letra.
 */
export function esEmpaquetado(carpetaDelModulo: string, existe: SondaCarpeta = () => false): boolean {
  const carpeta = String(carpetaDelModulo || "").replace(/[\\/]+$/, "");
  if (/[\\/]dist$/.test(carpeta)) return true;
  try {
    return existe(unirCarpeta(carpeta, "server.mjs"));
  } catch {
    return false;
  }
}
