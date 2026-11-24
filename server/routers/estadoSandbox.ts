/**
 * estadoSandbox.ts — /api/SANDBOX/STATUS FUERA DEL MONOLITO (v1.0.24)
 * ====================================================================
 * QUÉ ES: el parte del sandbox —¿está el :3500 arriba?, ¿qué raíz se está
 * sirviendo?, ¿qué proyecto se reconoció y con qué plan se arranca?— más las
 * tres detecciones que lo acompañan (proyecto anidado, aduana de marcadores y
 * web estática sin package.json).
 *
 * POR QUÉ SALIÓ, Y NO ENTRÓ COMO PARCHE
 * -------------------------------------
 * Era la TERCERA ruta del log (server.ts:8219) con `ERR_HTTP_HEADERS_SENT`: el
 * sondeo del :3500 vencía el plazo de /api, el middleware contestaba 504 y este
 * `res.json()` volvía a escribir sobre el socket. La cura es `abrirFicha`, una
 * línea; pero el archivo donde vivía tiene techo declarado y la casa vigila que
 * no engorde. Así que se mudó la ruta ENTERA con sus cinco ayudantes, y el
 * monolito se quedó con una línea de delegación. El comportamiento es el mismo:
 * no se quitó ni una detección, ni un campo del parte.
 */
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { abrirFicha } from "../../src/engine/fichaUnica";
import { reconocerCarpeta, lineaReconocimiento } from "../../src/engine/sandboxCompat";

export interface DepsEstadoSandbox {
  /** Raíz de datos del sandbox (.proyectos). */
  raizProyecto: string;
  /** Puerto del sandbox servido (:3500). */
  puertoSandbox: number;
  /** ¿Hay un proceso de sandbox vivo? */
  sandboxVivo: () => boolean;
  /** La misma puerta que usa el monolito para estas rutas. */
  autorizado: (req: Request) => boolean;
  /** Sondeo de puerto con plazo. */
  puertoArriba: (puerto: number, ms: number) => Promise<boolean>;
  /** La raíz que de verdad se sirve y se escribe (una sola verdad). */
  resolverRaizProyecto: () => any;
  /** ¿Los node_modules de esa raíz están sanos (no podados)? */
  nodeModulesSano: (raiz: string) => boolean;
}

/** ADUANA v2: ¿esta carpeta (por nombres) es un proyecto reconocible? */
function esCarpetaProyecto(nombres: string[]): boolean {
  const r = reconocerCarpeta(nombres);
  return !!r && r.peso >= 40; // desde "make" hacia arriba; docs/datos no secuestran la raíz
}

/** v2.1 — la copia más nueva del proyecto puede vivir DENTRO de la raíz. */
function buscarProyectoAnidado(raiz: string): string | null {
  const skip = new Set([
    "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
    "venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
  ]);
  const recorrer = (dir: string, prof: number): string | null => {
    if (prof > 5) return null;
    let entradas: fs.Dirent[] = [];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      // v8.0.5 — se ignora por LISTA (artefactos y control de versiones), no por
      // prefijo: el proyecto vive en `.proyectos` y descartar por punto lo hacía
      // invisible al aplanado.
      if (skip.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      // ADUANA v2: cualquier proyecto reconocible vale, no solo package.json.
      try {
        if (esCarpetaProyecto(fs.readdirSync(sub))) return sub;
      } catch {}
      const hit = recorrer(sub, prof + 1);
      if (hit) return hit;
    }
    return null;
  };
  return recorrer(raiz, 1);
}

export function registrarEstadoSandbox(app: any, deps: DepsEstadoSandbox): void {
  const RAIZ = deps.raizProyecto;
  app.get("/api/sandbox/status", async (req: Request, res: Response) => {
    if (!deps.autorizado(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const ficha = abrirFicha(res, "/api/sandbox/status");
    const online = await deps.puertoArriba(deps.puertoSandbox, 1500);
    return ficha.json({
      online,
      port: deps.puertoSandbox,
      running: deps.sandboxVivo(),
      // ------------------------------------------------------------
      // «1 archivo(s) escrito(s) en .proyectos/» es una frase que no permite
      // verificar nada: `.proyectos` es relativo y puede ser cualquier carpeta del
      // disco. Si ese archivo acaba en un sitio y el detector mira en otro, el
      // usuario sólo ve «no hay proyecto» y no tiene forma de comprobarlo.
      // Diciendo la ruta absoluta, un solo Sync resuelve la duda.
      raizSandbox: RAIZ,
      raizProyectoResuelta: deps.resolverRaizProyecto().raiz,
      // v2.1 — los node_modules pueden estar en la raíz resuelta, no en .proyectos
      // v1.6.24 — e «instalado» dejó de ser la existencia de la carpeta: con un
      // árbol podado el piloto se saltaba la instalación y el arranque moría.
      // El piloto lee este flag para decidir su `npm install` — que además ahora
      // viaja por GUARDA-ENOENT en /api/exec (ejecuta donde vive el package.json).
      installed: deps.nodeModulesSano(deps.resolverRaizProyecto().raiz),
      // ============================================================
      // 🐞 v2.0 — "No se encontró package.json en el sandbox tras sincronizar".
      // ------------------------------------------------------------
      // Causa real (caso reportado): el ZIP subido traía una carpeta contenedora,
      // así que el package.json EXISTÍA pero no en la raíz (.proyectos/). Antes se
      // miraba solo la raíz y el piloto automático se apagaba dando a entender que
      // el proyecto estaba mal, cuando solo estaba un nivel más adentro.
      // Ahora se busca por niveles (hasta 4) y se informa de dónde está.
      // ============================================================
      ...(() => {
        const skip = new Set(["node_modules", ".git", "dist", "dist_electron", "venv", "__pycache__", ".cerebro-db", ".vite"]);
        // ADUANA v2 (Reflejo v5): «proyecto» ya no es sinónimo de package.json.
        // Cualquier marcador del registro (requirements.txt, Cargo.toml, go.mod,
        // pom.xml, Dockerfile, index.html, Makefile…) cuenta, y el estado lo
        // dice por nombre. El campo `packageJsonCandidates` se conserva por
        // compatibilidad con el frontend: ahora trae cualquier raíz reconocida.
        const hayProyectoEn = (dir: string): boolean => {
          try {
            const nombres = fs.readdirSync(dir).filter((n) => {
              try { return fs.statSync(path.join(dir, n)).isFile(); } catch { return false; }
            });
            return esCarpetaProyecto(nombres);
          } catch {
            return false;
          }
        };
        if (hayProyectoEn(RAIZ)) {
          // v2.1 — Aunque la raíz YA tenga proyecto, hay que mirar dentro: el sync
          // escribe siempre el árbol anidado (el workspace guarda las rutas con su
          // carpeta contenedora), así que puede haber una copia más nueva sin
          // subir. Reportarla aquí es lo que permite que el autopiloto la fusione
          // en vez de dar por bueno un «src» viejo para siempre.
          const anid = buscarProyectoAnidado(RAIZ);
          return {
            hasProject: true,
            packageJsonCandidates: ["."],
            detectedProjectRoot: ".",
            paqueteAnidado: anid ? path.relative(RAIZ, anid).split(path.sep).join("/") : "",
          };
        }
        const found: string[] = [];
        const queue: Array<{ dir: string; rel: string; depth: number }> = [{ dir: RAIZ, rel: "", depth: 0 }];
        while (queue.length > 0 && found.length < 8) {
          const cur = queue.shift()!;
          if (hayProyectoEn(cur.dir)) {
            found.push(cur.rel || ".");
            continue; // no seguir bajando dentro de un proyecto encontrado
          }
          if (cur.depth >= 4) continue;
          let entries: string[] = [];
          try {
            entries = fs.readdirSync(cur.dir);
          } catch {
            continue;
          }
          for (const e of entries) {
            if (skip.has(e)) continue;
            const full = path.join(cur.dir, e);
            try {
              if (fs.statSync(full).isDirectory()) queue.push({ dir: full, rel: cur.rel ? `${cur.rel}/${e}` : e, depth: cur.depth + 1 });
            } catch {
              /* ilegible: se salta */
            }
          }
        }
        return {
          hasProject: false,
          packageJsonCandidates: found,
          detectedProjectRoot: found[0] || "",
          paqueteAnidado: found[0] || "",
        };
      })(),
      // ============================================================
      // v2.0 — PROYECTO ESTÁTICO = PROYECTO VÁLIDO
      // ------------------------------------------------------------
      // 🐞 El piloto automático se apagaba diciendo "No se encontró package.json"
      // cuando el proyecto era una web estática (index.html + css + js). Es una
      // web perfectamente válida: no necesita npm. Aquí se marca como proyecto y
      // /api/sandbox/start lo sirve con el servidor estático.
      //
      // v8.0.4 — 🐞 Y FALTABA JUSTO EL CASO DEL LOG REAL: el ANIDADO.
      // ------------------------------------------------------------
      // Esta comprobación miraba `index.html` SOLO en la raíz del sandbox. Pero el
      // sync escribe el árbol CON su carpeta contenedora (lo dice el propio log:
      // «1 archivo(s) escrito(s) en .proyectos/» mientras el workspace lista
      // «proyectos/index.html»). Así que lo normal es que la web acabe en
      // `.proyectos/<carpeta>/index.html`.
      //
      // Consecuencia encadenada, tal cual la vivió el usuario:
      //   hasProject=false → el piloto automático se rinde → «❌ No se encontró
      //   package.json» → el mensaje LE DICE AL MODELO que cree un package.json →
      //   el modelo obedece y empieza a montar un proyecto Node que no hacía falta.
      //   Una web estática perfectamente válida quedaba convertida en un error.
      //
      // Ahora, si no hay index.html en la raíz, se busca el más cercano en
      // subcarpetas (hasta 3 niveles) y se declara DÓNDE está.
      //
      // Nota deliberada: NO se saltan las carpetas que empiezan por punto. El motor
      // de este proyecto usa nombres como `.proyectos`, y saltárselos por reflejo
      // (como hace otro recorrido de este mismo archivo) es parte de por qué este
      // caso tardó tanto en verse.
      // ============================================================
      ...(() => {
        if (fs.existsSync(path.join(RAIZ, "package.json"))) {
          // ============================================================
          // v8.0.5 — 🐞 AVISO DE PROYECTO DUPLICADO (defecto de segundo orden)
          // ------------------------------------------------------------
          // Este caso no lo invento: lo enseñó el registro del usuario. Ante el
          // error «no hay proyecto en .proyectos», el modelo hizo lo razonable —
          // MOVER copias a la raíz: `.proyectos/package.json` + `.proyectos/index.js`.
          // El sandbox se calla y arranca… y a partir de ahí pasa algo peor:
          //
          //  · Ahora hay DOS proyectos en el mismo sitio: el de la raíz (que el
          //    sandbox ejecuta) y el de `mi-proyecto/` (donde el sync sigue
          //    escribiendo cada vez que el usuario edita).
          //  · El marcador de la raíz TIENE PRIORIDAD sobre el anidado, así que la
          //    web de verdad queda enterrada bajo el stub de la raíz.
          //  · El usuario edita, el sync escribe en `mi-proyecto/`, y el preview
          //    sigue mostrando la raíz vieja. «Arreglado y sigue igual», otra vez.
          //
          // Silenciar esto sería justo el fallo que este archivo está corrigiendo
          // una y otra vez: preferir no molestar antes que evitar la pérdida de
          // tiempo. Se detecta y se dice, en la misma línea del registro.
          // ============================================================
          const ignorar2 = new Set([
            "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
            "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
          ]);
          let webAnidada: string | null = null;
          const cola2: Array<{ dir: string; rel: string; prof: number }> = [{ dir: RAIZ, rel: "", prof: 0 }];
          while (cola2.length > 0 && !webAnidada) {
            const cur = cola2.shift()!;
            if (cur.prof >= 2) continue;
            let ents2: string[] = [];
            try {
              ents2 = fs.readdirSync(cur.dir);
            } catch {
              continue;
            }
            for (const e of ents2) {
              if (ignorar2.has(e)) continue;
              const full2 = path.join(cur.dir, e);
              let esDir2 = false;
              try {
                esDir2 = fs.statSync(full2).isDirectory();
              } catch {
                continue;
              }
              if (!esDir2) continue;
              const rel2 = cur.rel ? `${cur.rel}/${e}` : e;
              if (fs.existsSync(path.join(full2, "index.html"))) {
                webAnidada = rel2;
                break;
              }
              cola2.push({ dir: full2, rel: rel2, prof: cur.prof + 1 });
            }
          }
          if (webAnidada) {
            return {
              staticProject: false,
              avisoProyectoDuplicado:
                `Hay un package.json en la raíz del sandbox (${RAIZ}) y ADEMÁS una web en ` +
                `«${webAnidada}/». El sandbox arrancará el proyecto de la RAÍZ y la web anidada NO se verá: ` +
                `deja un solo proyecto en un solo sitio (o sube la web a la raíz y borra la subcarpeta, ` +
                `o quita el package.json de la raíz para que se sirva la web anidada).`,
            };
          }
          return { staticProject: false };
        }
        if (fs.existsSync(path.join(RAIZ, "index.html"))) {
          return { hasProject: true, staticProject: true, detectedProjectRoot: "." };
        }
        const ignorar = new Set([
          "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
          "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
        ]);
        const cola: Array<{ dir: string; rel: string; prof: number }> = [{ dir: RAIZ, rel: "", prof: 0 }];
        while (cola.length > 0) {
          const cur = cola.shift()!;
          if (cur.prof >= 3) continue;
          let ents: string[] = [];
          try {
            ents = fs.readdirSync(cur.dir);
          } catch {
            continue;
          }
          for (const e of ents) {
            if (ignorar.has(e)) continue;
            const full = path.join(cur.dir, e);
            let esDir = false;
            try {
              esDir = fs.statSync(full).isDirectory();
            } catch {
              continue;
            }
            if (!esDir) continue;
            const rel = cur.rel ? `${cur.rel}/${e}` : e;
            if (fs.existsSync(path.join(full, "index.html"))) {
              return {
                hasProject: true,
                staticProject: true,
                staticProjectAnidado: true,
                detectedProjectRoot: rel,
              };
            }
            cola.push({ dir: full, rel, prof: cur.prof + 1 });
          }
        }
        // Sin proyecto web: se devuelve, además, QUÉ hay en la raíz del sandbox.
        // Un «no hay proyecto» sin decir dónde se miró obliga al usuario (y al
        // modelo) a adivinar, que es exactamente lo que pasó en este log.
        let enRaiz: string[] = [];
        try {
          enRaiz = fs.readdirSync(RAIZ).slice(0, 25);
        } catch {
          enRaiz = [];
        }
        return { staticProject: false, buscadoEn: RAIZ, contenidoRaiz: enRaiz };
      })(),
      // ADUANA v2: QUÉ reconoció el sandbox, con nombre y plan de arranque.
      // El frontend viejo ignora el campo; el nuevo y el usuario pueden leer
      // «🐍 Python · marcador «requirements.txt» · se arranca por consola: …»
      // en vez del antiguo y mentiroso «no hay proyecto».
      proyectoReconocido: (() => {
        const rp = deps.resolverRaizProyecto();
        return rp.proyecto ? { ...rp.proyecto, linea: lineaReconocimiento(rp.proyecto) } : null;
      })(),
      root: RAIZ,
    });
  });
}
