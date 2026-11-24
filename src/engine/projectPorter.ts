/**
 * projectPorter.ts — ADAPTADOR DE PROYECTOS PARA EL SANDBOX (v2.1)
 * ===============================================================
 * EL PROBLEMA, tal cual se reprodujo con un proyecto real (ScanMed v3.1):
 *
 *   "instaló perfecto, 0 vulnerabilidades, y fuera levanta sin problemas.
 *    En el sandbox falla: reconoce el título pero la página no abre."
 *
 * La cadena del fallo, y no tiene nada que ver con el código del proyecto:
 *
 *   1. El sandbox sirve en :3500.
 *   2. El proyecto arranca Vite con `--port=3000` POR LÍNEA DE COMANDOS
 *      (así lo trae la plantilla de Google AI Studio: `vite --port=3000`).
 *   3. En Vite, la CLI GANA a la configuración: `--port` pisa `server.port`.
 *   4. El puerto 3000 es el de la propia IDE → colisión.
 *   5. Sin `strictPort`, Vite NO falla: salta a 3001, 3002… en silencio.
 *   6. El sandbox sigue mirando el 3500, no ve nada y lo da por muerto.
 *      El HTML se carga (de ahí que el TÍTULO se reconozca) pero el bundle
 *      de JavaScript no llega → página en blanco.
 *
 * LA SOLUCIÓN: no pedirle al usuario que edite su proyecto. El motor lo adapta
 * al vuelo, de forma determinista y reversible:
 *   · reescribe el `--port` del script `dev` (y `start`) al puerto del sandbox;
 *   · garantiza `port` + `strictPort: true` en la configuración de Vite, para
 *     que un puerto ocupado FALLE EN VOZ ALTA en vez de saltar en silencio;
 *   · guarda una copia `.cn-original` la primera vez, para poder revertir.
 *
 * Por qué `strictPort` es la mitad de la solución: un salto silencioso de puerto
 * es indetectable para quien mira; un fallo claro se diagnostica en segundos.
 *
 * Es una función pura en su núcleo (texto → texto), así que se puede probar sin
 * arrancar nada: eso es lo que se hizo para verificarla.
 */

import * as fs from "fs";
import * as path from "path";
import { reconocerCarpeta, type Reconocimiento } from "./sandboxCompat";

/**
 * ============================================================
 * v2.1 — RAÍZ REAL DEL PROYECTO (la otra mitad del bug de package.json)
 * ------------------------------------------------------------
 * 🐞 El estado del sandbox buscaba el package.json POR NIVELES, pero el
 * arranque lo miraba SOLO en la raíz. Con un proyecto importado que trae
 * carpeta contenedora —lo normal: un ZIP extraído como `Mi-Proyecto/…/`— el
 * estado decía «hay proyecto» y el arranque «no hay proyecto». El sandbox
 * quedaba en blanco y el usuario no tenía forma de saber por qué.
 *
 * Esta función es la ÚNICA autoridad sobre dónde vive el proyecto, para que
 * estado y arranque no puedan contradecirse. Es pura respecto del disco: se le
 * pasa la base y devuelve la carpeta, así que se puede probar con una carpeta
 * de prueba real sin arrancar nada.
 *
 * Criterio de elección (en orden): la carpeta que tenga `package.json`; entre
 * iguales, la menos profunda; y si empatan, la que tenga `index.html`.
 * ============================================================
 */
export interface RaizProyecto {
  raiz: string;
  tienePkg: boolean;
  tieneHtml: boolean;
  anidada: boolean;
  /**
   * ADUANA v2 (Reflejo v5): qué tipo de proyecto se reconoció (node, python,
   * rust, go, java, php, ruby, deno, docker, make, estático, docs, datos…) y
   * por qué marcador. `null` solo cuando no hay NADA reconocible. Los campos
   * viejos siguen intactos: quien solo leía `tienePkg` no nota el cambio.
   */
  proyecto?: Reconocimiento | null;
}

/** Nombres de los ARCHIVOS (no carpetas) de un directorio; [] si no se puede leer. */
function nombresDeArchivos(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * 🐞 DEFECTO MADRE v1.0.3: esta función solo conocía dos puertas de entrada —
 * `package.json` e `index.html`. Un proyecto Python, Rust, Go, Java, PHP,
 * Docker o una carpeta de datos era «no hay proyecto» para el sandbox, y la
 * orden moría en el umbral. ADUANA v2 abre el registro completo
 * (`sandboxCompat.MARCADORES_PROYECTO`) sin tocar el contrato viejo:
 * `tienePkg`/`tieneHtml` siguen significando lo mismo y la prioridad node >
 * resto queda preservada por el peso de los marcadores.
 */
export function resolverRaizProyecto(base: string, colector?: CandidatoProyecto[]): RaizProyecto {
  const evaluar = (dir: string) => ({
    pkg: fs.existsSync(path.join(dir, "package.json")),
    html: fs.existsSync(path.join(dir, "index.html")),
    proyecto: reconocerCarpeta(nombresDeArchivos(dir)),
  });

  const enBase = evaluar(base);
  // La base ES el proyecto si tiene package.json o un marcador de TOOLCHAIN
  // REAL (peso >=70: node/python/.NET/.../jupyter). Un proyecto instalable manda.
  //
  // v1.48.2 - BUG DEL PREVISUALIZADOR ANCLADO. Antes el corte era peso>=40, y
  // eso incluia "web estatica" (index.html suelto, peso 60), "make" (40),
  // "cmake" (45) y "docker" (50). Consecuencia reportada por Mario: un index.html
  // viejo que quedo en la RAIZ DE DATOS (la pagina "Panel de Capacidades")
  // secuestraba el preview: resolvia a la base y NUNCA miraba las subcarpetas,
  // asi que los sitios recien creados por el creador en `.creador/<slug>/` no se
  // veian por mucho que se recargara. Subir el corte a 70 deja que un index.html
  // suelto NO corte: se buscan subcarpetas y gana el entregable de verdad. Si no
  // hay ningun subproyecto, `candidatos` queda vacio y abajo se devuelve la base
  // igual (con `tieneHtml`), asi que un sitio estatico que vive SOLO en la raiz
  // se sigue sirviendo como siempre.
  if (enBase.pkg || (enBase.proyecto && enBase.proyecto.peso >= 70)) {
    return { raiz: base, tienePkg: enBase.pkg, tieneHtml: enBase.html, anidada: false, proyecto: enBase.proyecto };
  }

  // v1.6.23 — F1: la lista manda, no el prefijo. `startsWith(".")` era el mismo
  // defecto que la v8.0.5 corrigió en buscarProyectoAnidado: un proyecto dentro
  // de una carpeta con punto era invisible para el resolutor. Se agregan además
  // las carpetas de estado de CerebroNico, que nunca son proyectos.
  const IGNORAR = new Set(["node_modules", ".git", "dist", "dist_electron", "build", ".next", ".nuxt", ".vite", "__pycache__", "venv", ".venv", "out", "coverage", ".cerebro-db", ".cerebronico", ".cerebro_db"]);
  const candidatos: { dir: string; pkg: boolean; html: boolean; prof: number; proyecto: Reconocimiento | null }[] = [];

  // v1.6.23 — GUARDA-B: la app en ejecución (o una ancestora suya) JAMÁS puede
  // ser devuelta como «proyecto del sandbox». El incidente de rollup empezó
  // acá: con raíz de datos en la carpeta de instalación, el resolutor encontró
  // `ide\backend` dos niveles más abajo y el piloto se puso a compilar la IDE.
  // Una copia DISTINTA de la IDE sigue siendo proyecto legítimo (la guarda de
  // recursión de /api/sandbox/start la trata explícitamente); lo prohibido es
  // encontrarse a sí misma por accidente.
  const cwdApp = path.resolve(process.cwd());
  const esPropiaApp = (dir: string) => {
    const r = path.resolve(dir);
    return r === cwdApp || cwdApp.startsWith(r + path.sep);
  };

  // mtime del entregable del candidato (index.html o package.json; si no, la
  // carpeta). Sirve de criterio de RECENCIA en el desempate de abajo (declarada antes de `recorrer` porque el colector la usa al empujar)..
  const mtimeDe = (dir: string): number => {
    for (const f of ["index.html", "package.json"]) {
      try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { /* seguir */ }
    }
    try { return fs.statSync(dir).mtimeMs; } catch { return 0; }
  };


  const recorrer = (dir: string, prof: number) => {
    if (prof > 5) return;
    let entradas: fs.Dirent[] = []
      ;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      if (IGNORAR.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      if (esPropiaApp(sub)) continue;
      const ev = evaluar(sub);
      if (ev.pkg || ev.html || (ev.proyecto && ev.proyecto.peso >= 40)) {
        candidatos.push({ dir: sub, pkg: ev.pkg, html: ev.html, prof, proyecto: ev.proyecto });
        colector?.push({ ruta: sub, nombre: path.basename(sub), mtimeMs: mtimeDe(sub), pkg: ev.pkg, html: ev.html });
      }
      recorrer(sub, prof + 1);
    }
  };
  recorrer(base, 1);

  if (candidatos.length === 0) {
    // Sin proyecto real: se devuelve la base con lo que haya (docs/datos
    // incluidos) para que el estado del sandbox pueda DECIR qué encontró
    // en vez de mentir con un «no hay proyecto» pelado.
    return { raiz: base, tienePkg: false, tieneHtml: enBase.html, anidada: false, proyecto: enBase.proyecto };
  }

  candidatos.sort(
    (a, b) =>
      Number(b.pkg) - Number(a.pkg) ||
      (b.proyecto?.peso ?? 0) - (a.proyecto?.peso ?? 0) ||
      a.prof - b.prof ||
      Number(b.html) - Number(a.html) ||
      // v1.48.2 - 2.o tramo del BUG del preview anclado: cuando dos entregables
      // empatan en todo (p.ej. dos sitios estaticos "index.html", mismo peso y
      // profundidad), el MAS RECIENTE gana. Antes el unico desempate era
      // alfabetico (localeCompare), asi que "cerebronico-ide" ganaba SIEMPRE a
      // "veterinaria-*" por la 'c' < 'v' y jamas se vei el sitio recien creado.
      // Ordenar por mtime descendente hace que el ultimo entregable generado sea
      // el que se previsualiza, que es lo que el usuario espera tras crearlo.
      (mtimeDe(b.dir) - mtimeDe(a.dir)) ||
      a.dir.localeCompare(b.dir)
  );
  const elegido = candidatos[0];
  return { raiz: elegido.dir, tienePkg: elegido.pkg, tieneHtml: elegido.html, anidada: true, proyecto: elegido.proyecto };
}

/**
 * v1.86.6 — DESTINO EXPLÍCITO DEL SANDBOX (la ruta que eligió el usuario)
 * ------------------------------------------------------------------------
 * `resolverRaizProyecto` desempata dos proyectos iguales por recencia (mtime),
 * y eso es correcto cuando NADIE eligió: el último entregable generado es el
 * que se previsualiza. Pero cuando el usuario FIJÓ una carpeta —por el CANAL
 * DIRECTO (`carpeta-vinculada.json`) o por un `destino` explícito del
 * frontend—, ese pin DEBE ganar al desempate. El bug observado: dos sitios
 * estáticos (`cerebro-man` y `cerebro-nico`) empatados en todo salvo mtime, y
 * el preview servía `cerebro-man` porque el chat seguía tocando su `game.js`.
 *
 * Precedencia:
 *   1. `destinoExplicito`  → lo que manda el frontend en `req.body.destino`
 *   2. `carpetaVinculada`  → lo que fijó el usuario en el CANAL DIRECTO
 *   3. autodetección       → `resolverRaizProyecto(base)` (recencia incluida)
 *
 * Una carpeta candidata SOLO se adopta si dentro hay un entregable servible
 * (index.html o package.json): vincular una carpeta de fotos o de trabajo NO
 * secuestra el preview — se cae a la autodetección de la raíz de datos.
 */
export type OrigenDestino = "explicito" | "vinculada" | "autodeteccion";

export interface DestinoSandbox extends RaizProyecto {
  origen: OrigenDestino;
}

export interface CandidatoProyecto {
  /** Carpeta absoluta que se ofrece. */
  ruta: string;
  nombre: string;
  mtimeMs: number;
  pkg: boolean;
  html: boolean;
}

/**
 * Cuántos entregables servibles hay y cuáles, con el MISIMO criterio del resolutor
 * (se le pasa un colector, no se duplica la caminata: dos implementaciones de «qué es
 * un proyecto» son dos discusiones sobre qué se está previsualizando).
 */
export function listarProyectosServibles(base: string): CandidatoProyecto[] {
  const out: CandidatoProyecto[] = [];
  resolverRaizProyecto(base, out);
  return out; // ya en el orden del desempate: el [0] es el que se habría elegido
}

export interface PuertaDeRaiz { pide: boolean; motivo: string; candidatos: CandidatoProyecto[] }

/**
 * v1.97.0 · LA PUERTA DE LA RAÍZ (ok de Mario, 30/10). Cuando NO hay carpeta vinculada y la
 * autodetección elige una subcarpeta habiendo MÁS de un entregable, el preview se decide por
 * recencia: es correcto y documentado, pero «tuve que reiniciar los puertos» y «lo que se ve es
 * un proyecto viejo» salieron justo de ahí. Esta función dice CUANDO conviene preguntar, y nada
 * más: con un solo candidato, con pin, con destino explícito o cuando el usuario ya confirmó,
 * se sirve como siempre. Preguntar siempre sería secuestrar la pantalla otra vez.
 */
export function puertaDeEleccionDeRaiz(
  // Lo estructural, no el tipo del llamante: `/api/sandbox/start` recibe una
  // `DecisionArranque` (con `origen: string`) y otros caminos un `DestinoSandbox`.
  // Aceptar el mínimo necesario evita ensanchar el tipo de origen a `any`.
  destino: { raiz: string; anidada: boolean; origen: string },
  opts: { base: string; hayPin: boolean; confirmado: boolean }
): PuertaDeRaiz {
  const sinDerechoAPreguntar = opts.hayPin || opts.confirmado || destino.origen !== "autodeteccion" || !destino.anidada;
  const candidatos = sinDerechoAPreguntar ? [] : listarProyectosServibles(opts.base);
  if (sinDerechoAPreguntar || candidatos.length < 2) return { pide: false, motivo: "", candidatos };
  const nombres = candidatos.map((x) => x.nombre).join(", ");
  return {
    pide: true,
    candidatos,
    motivo:
      `No hay carpeta vinculada y en la raíz de datos hay ${candidatos.length} entregables (${nombres}). ` +
      `Se elegiría ${destino.raiz} por recencia. Confirmá esa o elegí otra; si vinculás la carpeta ` +
      `(CANAL DIRECTO), la próxima vez no se pregunta más.`,
  };
}

export function resolverDestinoSandbox(
  base: string,
  destinoExplicito: string | null | undefined,
  carpetaVinculada: string | null | undefined
): DestinoSandbox {
  const considerar = (candidato: string | null | undefined, origen: OrigenDestino): DestinoSandbox | null => {
    if (!candidato || typeof candidato !== "string" || candidato.trim() === "") return null;
    let ruta: string;
    try {
      ruta = path.resolve(candidato);
      if (!fs.statSync(ruta).isDirectory()) return null;
    } catch {
      return null;
    }
    const res = resolverRaizProyecto(ruta);
    if (!res.tienePkg && !res.tieneHtml) return null;
    return { ...res, origen };
  };
  return (
    considerar(destinoExplicito, "explicito") ||
    considerar(carpetaVinculada, "vinculada") ||
    { ...resolverRaizProyecto(base), origen: "autodeteccion" }
  );
}

export interface PatchResult {
  texto: string;
  cambios: string[];
}

/** Reescribe el puerto del script de arranque en package.json. */
export function patchPackageJson(contenido: string, puerto: number): PatchResult {
  const cambios: string[] = [];
  let json: any;
  try {
    json = JSON.parse(contenido);
  } catch {
    return { texto: contenido, cambios: [] };
  }
  if (!json || typeof json !== "object" || !json.scripts) return { texto: contenido, cambios: [] };

  for (const nombre of ["dev", "start", "serve", "preview"]) {
    const guion = json.scripts[nombre];
    if (typeof guion !== "string") continue;
    let nuevo = guion;

    // --port=NNNN  /  --port NNNN
    if (/--port[=\s]+\d+/i.test(nuevo)) {
      nuevo = nuevo.replace(/--port[=\s]+\d+/gi, `--port=${puerto}`);
    } else if (/\s-p[=\s]+\d+/i.test(nuevo)) {
      // -p NNNN (forma corta)
      nuevo = nuevo.replace(/\s-p[=\s]+\d+/gi, ` --port=${puerto}`);
    } else if (/\bvite\b/.test(nuevo) && !/\bport\b/i.test(nuevo)) {
      // Vite sin puerto declarado: se le pone el del sandbox explícitamente.
      nuevo = nuevo.replace(/\bvite\b/, `vite --port=${puerto}`);
    }

    if (nuevo !== guion) {
      json.scripts[nombre] = nuevo;
      cambios.push(`package.json › scripts.${nombre}: "${guion}" → "${nuevo}"`);
    }
  }

  if (cambios.length === 0) return { texto: contenido, cambios: [] };
  return { texto: JSON.stringify(json, null, 2) + "\n", cambios };
}

/** Garantiza `port` y `strictPort: true` dentro del bloque `server` de Vite. */
export function patchViteConfig(contenido: string, puerto: number): PatchResult {
  const cambios: string[] = [];
  let texto = contenido;

  const bloque = texto.match(/server\s*:\s*\{/);
  if (!bloque || bloque.index === undefined) {
    // Sin bloque `server`: se añade uno completo dentro de la config.
    const define = texto.match(/(defineConfig\s*\(\s*\{)/);
    if (define && define.index !== undefined) {
      const insertar = `\n  server: { port: ${puerto}, strictPort: true },`;
      texto = texto.slice(0, define.index + define[1].length) + insertar + texto.slice(define.index + define[1].length);
      cambios.push(`vite.config.ts: se añadió server: { port: ${puerto}, strictPort: true }`);
    }
    return { texto, cambios };
  }

  const inicio = bloque.index + bloque[0].length;
  let fin = -1;
  let profundidad = 1;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === "{") profundidad++;
    else if (texto[i] === "}") {
      profundidad--;
      if (profundidad === 0) {
        fin = i;
        break;
      }
    }
  }
  if (fin === -1) return { texto: contenido, cambios: [] };

  const cuerpo = texto.slice(inicio, fin);
  let nuevoCuerpo = cuerpo;

  // port
  if (/port\s*:/.test(nuevoCuerpo)) {
    const antes = nuevoCuerpo;
    nuevoCuerpo = nuevoCuerpo.replace(/port\s*:\s*\d+/, `port: ${puerto}`);
    if (antes !== nuevoCuerpo) cambios.push(`vite.config.ts: server.port → ${puerto}`);
  } else {
    nuevoCuerpo = `\n    port: ${puerto},` + nuevoCuerpo;
    cambios.push(`vite.config.ts: se añadió server.port = ${puerto}`);
  }

  // strictPort
  if (/strictPort\s*:/.test(nuevoCuerpo)) {
    const antes = nuevoCuerpo;
    nuevoCuerpo = nuevoCuerpo.replace(/strictPort\s*:\s*(true|false)/, "strictPort: true");
    if (antes !== nuevoCuerpo) cambios.push("vite.config.ts: server.strictPort → true");
  } else {
    nuevoCuerpo = `\n    strictPort: true,` + nuevoCuerpo;
    cambios.push("vite.config.ts: se añadió server.strictPort = true (falla en voz alta en vez de saltar de puerto)");
  }

  texto = texto.slice(0, inicio) + nuevoCuerpo + texto.slice(fin);
  return { texto, cambios };
}

/**
 * Aplica los parches al proyecto y guarda copias `.cn-original` la primera vez.
 * Idempotente: ejecutarlo dos veces no duplica nada.
 */
export function normalizeProjectPort(raiz: string, puerto: number): { cambios: string[]; respaldos: string[] } {
  const cambios: string[] = [];
  const respaldos: string[] = [];
  const archivos = [
    { nombre: "package.json", fn: patchPackageJson },
    { nombre: "vite.config.ts", fn: patchViteConfig },
    { nombre: "vite.config.js", fn: patchViteConfig },
  ];

  for (const a of archivos) {
    const ruta = path.join(raiz, a.nombre);
    if (!fs.existsSync(ruta)) continue;
    let original = "";
    try {
      original = fs.readFileSync(ruta, "utf-8");
    } catch {
      continue;
    }
    const res = a.fn(original, puerto);
    if (res.cambios.length === 0) continue;

    // Respaldo único (no se pisa si ya existe: así se conserva el original real).
    const respaldo = `${ruta}.cn-original`;
    if (!fs.existsSync(respaldo)) {
      try {
        fs.writeFileSync(respaldo, original, "utf-8");
        respaldos.push(path.basename(respaldo));
      } catch {}
    }
    try {
      fs.writeFileSync(ruta, res.texto, "utf-8");
      cambios.push(...res.cambios);
    } catch {}
  }
  return { cambios, respaldos };
}
