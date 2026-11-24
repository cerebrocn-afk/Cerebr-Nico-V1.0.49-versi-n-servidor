/**
 * raizEntregable.ts — LA RAÍZ DE DATOS NO ES UN ENTREGABLE (v1.0.22)
 * ==================================================================
 * INCIDENTE (Mario, 16/11), literal:
 *
 *   «en la interfaz CerebroNico al intentar descargar la tarea realizada en el
 *    entregable de la hoja de ruta hice click en Descargar ZIP y cuando
 *    descomprimi ERRA toda la carpeta C:\Cerebronico DE MI DISCO LOCAL»
 *
 * LA CADENA QUE LO PRODUJO, medida en el código:
 *
 *   `entregableCtx.raizDe = () => resolverRaizProyecto().raiz`
 *      ↓  projectPorter.ts:100-117
 *   si la BASE tiene `package.json` → **la base es el proyecto**
 *      ↓  y la base es `PROJECT_ROOT`, que es la RAÍZ DE DATOS
 *   `recopilar()` recorre esa raíz: políticas, logs, `.env`, lanzadores, la
 *   sesión, `skills/`, el árbol entero de `C:\Cerebronico`
 *      ↓  `crearZip` sin sanear nombres
 *   el usuario descomprime y el paquete se esparce por su disco.
 *
 * Las exclusiones por nombre (`EXCLUIR_ENTREGABLE`) no alcanzan: la raíz de datos
 * tiene `package.json` y un `index.html` sueltos, y con eso el resolutor la
 * declara «proyecto». Y aunque el contenido fuera limpio, ESOS NO SON LOS
 * ARCHIVOS DEL USUARIO: son la instalación del IDE mezclada con sus datos.
 *
 * REGLA, y es la única de este módulo:
 *   si la raíz elegida ES la raíz de datos, NO se empaqueta. Se busca un
 *   subproyecto REAL (con marcador de arranque) y se usa ése; si no hay ninguno,
 *   el entregable NO existe todavía y se dice con palabras, en vez de entregar
 *   un ZIP que después rompe el disco.
 *
 * Puro: el disco entra inyectado (`existe`, `esProyecto`, `subcarpetas`), así se
 * puede probar entero y la decisión no depende de la máquina donde corre.
 */
import * as path from "node:path";

/** Carpetas que nunca son el proyecto: estado, artefactos, basura de sesión. */
export const NUNCA_PROYECTO = new Set([
  "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
  ".next", ".nuxt", ".vite", "__pycache__", "venv", ".venv", "target",
  ".cerebro-db", ".cerebronico", ".cn-preview", ".creador", ".revisiones",
  ".cn-quirofano", "logs", "respaldos", "backups", "historico-actualizaciones",
  "_archivo-consolidado", "datos", "data", "memoria_history", "skills",
]);

/** El mismo camino que las dos partes ya usan: comparar rutas resueltas, no texto. */
export function mismaRuta(a: string, b: string): boolean {
  if (!a || !b) return false;
  const norm = (p: string) => {
    let r = path.resolve(String(p).replace(/[\\/]+$/, "") || ".");
    // Windows no distingue mayúsculas: `c:\cerebronico` y `C:\Cerebronico` son la misma.
    if (/^[a-zA-Z]:/.test(r)) r = r.toLowerCase();
    return r;
  };
  return norm(a) === norm(b);
}

export interface PropuestaPaquete {
  /** false = no hay entregable legítimo; el `motivo` se le muestra al usuario tal cual. */
  puede: boolean;
  /** La carpeta que SÍ se recorre (cuando `puede`). */
  raiz: string;
  motivo: string;
  /** true = hubo que apartarse de la raíz de datos y se eligió un subproyecto. */
  apartado: boolean;
}

export interface SondaRaiz {
  raiz: string | null;
  raizDatos: string;
  existe: (dir: string) => boolean;
  /** Tiene marcador de arranque (`package.json`, `index.html`, `main.py`…). */
  esProyecto: (dir: string) => boolean;
  subcarpetas?: (dir: string) => string[];
}

/**
 * Decide QUÉ carpeta se empaqueta. Nunca devuelve la raíz de datos.
 */
export function proponerPaquete(s: SondaRaiz): PropuestaPaquete {
  const raiz = s.raiz ? String(s.raiz) : "";
  if (!raiz) {
    return { puede: false, raiz: "", motivo: "no hay proyecto en el sandbox para empaquetar", apartado: false };
  }
  if (!s.existe(raiz)) {
    return { puede: false, raiz: "", motivo: "la carpeta del proyecto no existe en disco", apartado: false };
  }
  // ── LA REGLA ───────────────────────────────────────────────────────────────
  if (mismaRuta(raiz, s.raizDatos)) {
    const candidatos = (s.subcarpetas ? s.subcarpetas(raiz) : [])
      .filter((n) => n && !n.startsWith(".") && !NUNCA_PROYECTO.has(n.toLowerCase()))
      .map((n) => path.join(raiz, n))
      .filter((dir) => {
        try { return s.esProyecto(dir); } catch { return false; }
      });
    if (candidatos.length === 1) {
      return {
        puede: true, raiz: candidatos[0], apartado: true,
        motivo: `el paquete sale de ${path.basename(candidatos[0])}, no de la raíz de datos`,
      };
    }
    if (candidatos.length > 1) {
      // Dos posibles proyectos: se elige por nombre NO (sería adivinar), se pide.
      return {
        puede: false, raiz: "", apartado: true,
        motivo: `la raíz de datos tiene ${candidatos.length} proyectos posibles (${candidatos.map((c) => path.basename(c)).join(", ")}): elegí la carpeta antes de descargar`,
      };
    }
    return {
      puede: false, raiz: "", apartado: true,
      motivo: "el entregable apunta a la raíz de datos de la IDE, no a un proyecto: no se empaqueta para no esparcir la instalación y los datos por el disco",
    };
  }
  return { puede: true, raiz, motivo: "", apartado: false };
}
