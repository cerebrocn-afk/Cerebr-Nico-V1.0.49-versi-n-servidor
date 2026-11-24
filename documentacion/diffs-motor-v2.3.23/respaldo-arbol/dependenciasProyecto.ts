/**
 * dependenciasProyecto.ts — ¿QUÉ PAQUETES IMPORTA EL PROYECTO Y NO ESTÁN?
 * =====================================================================
 * 🐞 EL FALLO: el sandbox arranca y el preview queda muerto con un aviso de
 * Vite en pantalla:
 *
 *     [plugin:vite:import-analysis] Failed to resolve import "jspdf" from
 *     "src/services/pdfReportService.ts". Does the file exist?
 *
 * El código generado importaba `jspdf` y `jspdf-autotable`; el `package.json`
 * del proyecto no los declaraba y nadie los instaló. `importChecker` no podía
 * salvarlo porque **solo mira imports relativos** (`./algo`, `../otro`), y con
 * razón: a un paquete no se le pone un stub. Y la auto-reparación del sandbox
 * tampoco, porque solo se dispara **cuando el proceso muere** — y aquí el
 * proceso Vite sigue VIVO, contestando el puerto con el aviso dentro. El
 * sandbox se da por «online» y el usuario ve una pantalla de error.
 *
 * La comprobación tiene que ser PREVIA y explícita: leer los imports del
 * proyecto, quedarse con los paquetes externos, quitar los que ya están
 * declarados o instalados, e instalar solo lo que falta.
 *
 * Nota de alcance: esto NO sustituye a `npm install` (que resuelve el árbol
 * completo y las versiones). Es para el caso concreto en que el código importa
 * algo que nadie declaró.
 */
/* ============================================================
   CATÁLOGO DE MÓDULOS INTERNOS DE NODE
   ============================================================ */
/**
 * Nombres internos de Node: no se instalan con npm.
 * Sin esta lista, `import fs from "fs"` se leería como «falta el paquete fs» y
 * el arranque intentaría instalar la nada.
 */
const INTERNOS = new Set([
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants",
    "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "http",
    "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process",
    "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "sys",
    "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi",
    "worker_threads", "zlib",
]);
/** Prefijos que NO son paquetes: rutas, URLs y protocolos del navegador. */
function esNoInstalable(specifier) {
    const s = specifier.trim();
    if (s === "")
        return true;
    if (s.startsWith(".") || s.startsWith("/"))
        return true; // ruta relativa o absoluta
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s))
        return true; // http:, data:, node:, file:
    if (s.startsWith("node:"))
        return true;
    if (INTERNOS.has(s.split("/")[0]))
        return true; // fs, path, crypto…
    if (/^\$|^~/.test(s))
        return true; // $lib de SvelteKit, ~ de otros
    return false;
}
/**
 * De un especificador a un NOMBRE DE PAQUETE instalable.
 *   `react-dom/client`      → `react-dom`
 *   `@scope/pkg/sub/ruta`   → `@scope/pkg`
 *   `jspdf`                 → `jspdf`
 */
export function nombreDePaquete(specifier) {
    if (esNoInstalable(specifier))
        return null;
    const partes = specifier.split("/");
    if (specifier.startsWith("@")) {
        return partes.length >= 2 ? `${partes[0]}/${partes[1]}` : null; // un @suelto no es un paquete
    }
    return partes[0] || null;
}
/* ============================================================
   EXTRACCIÓN (pura)
   ============================================================ */
/**
 * Las cinco formas reales por las que entra un import: `import X from "s"`,
 * `import {a} from "s"`, `import "s"` (efecto secundario), `import("s")`
 * (dinámico) y `require("s")`.
 *
 * Son constantes de módulo con bandera `g` y se usan SOLO con `matchAll`, que
 * clona el regex internamente: el `lastIndex` compartido nunca se pisa. Si
 * alguien las usa con `exec` en un bucle, tiene que ponerle `lastIndex = 0`
 * antes de cada archivo o el segundo heredará el corte del primero.
 */
const PATRONES_IMPORT = [
    /\bfrom\s+["']([^"']+)["']/g, // import X from "s" / export {a} from "s"
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // import("s")
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("s")
    /^\s*import\s+["']([^"']+)["']/gm, // import "s"
];
/**
 * LA ÚNICA VEZ QUE SE BARREA UN CONTENIDO (v1.71.1): archivo → paquetes que
 * importa, en un Map. `extraerPaquetesExternos`, la auditoría del retrato y el
 * grafo consumen este mismo resultado; antes cada uno volvía a pasar las cuatro
 * regex sobre el mismo texto (tres barridos completos del proyecto por turno).
 */
export function paquetesExternosPorArchivo(ficheros) {
    const porArchivo = new Map();
    for (const f of ficheros) {
        const encontrados = new Set();
        const contenido = f.content ?? "";
        for (const re of PATRONES_IMPORT) {
            for (const m of contenido.matchAll(re)) {
                const paquete = nombreDePaquete(m[1] ?? "");
                if (paquete)
                    encontrados.add(paquete);
            }
        }
        porArchivo.set(f.path, [...encontrados].sort());
    }
    return porArchivo;
}
/**
 * Paquetes externos que importan los archivos del proyecto (unión ordenada).
 * Mismo contrato de siempre; el barrido lo hace `paquetesExternosPorArchivo`.
 */
export function extraerPaquetesExternos(ficheros) {
    const union = new Set();
    for (const lista of paquetesExternosPorArchivo(ficheros).values()) {
        for (const p of lista)
            union.add(p);
    }
    return [...union].sort();
}
/** Versión que incluye el archivo de origen (para poder decir DÓNDE se importa). */
export function extraerPaquetesConOrigen(ficheros) {
    const porPaquete = new Map();
    for (const paquete of extraerPaquetesExternos(ficheros)) {
        // El nombre va escapado: un paquete puede llevar `.` o `+` (p. ej.
        // `jspdf-autotable` no, pero `@scope/a.b` sí) y sin escapar el `+` sería un
        // cuantificador de regex y el `.` cualquier carácter.
        const escapado = paquete.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const buscador = new RegExp(`["']${escapado}(/[^"']*)?["']`);
        const origen = ficheros.find((f) => buscador.test(f.content ?? ""));
        porPaquete.set(paquete, origen?.path ?? "?");
    }
    return [...porPaquete].map(([paquete, desde]) => ({ paquete, desde }));
}
/**
 * Paquetes que el código importa y que NADIE declaró.
 *
 * Es el conjunto que hay que añadir al `package.json`, y por eso la condición
 * es `!declarado && !instalado`, no simplemente `!instalado`:
 *
 *   · NO declarado  → este chequeo lo añade con `npm install --save`. Es el
 *                     caso de `jspdf`: el código lo importa y el proyecto no lo
 *                     conocía.
 *   · declarado y no instalado → NO se toca aquí. La solución es el `npm
 *                     install` normal, y volver a instalarlo con `--save`
 *                     reescribiría la versión que la plantilla dejó fijada.
 *                     Eso se informa aparte (ver `declaradosSinInstalar`).
 *   · instalado sin declarar → dependencia transitiva. No se toca.
 *
 * (Mi primer comentario decía que un declarado-sin-instalar también entraba
 * aquí. El test lo desmintió: el código hacía lo contrario. Manda el código.)
 */
export function paquetesFaltantes(ficheros, entorno) {
    return auditoriaPaquetes(ficheros, entorno).faltantes;
}
/**
 * Paquetes DECLARADOS en `package.json` pero que no están en `node_modules`.
 * No se instalan aquí: se informan, porque el remedio es un `npm install`
 * normal y hacerlo con `--save` cambiaría la versión fijada.
 */
export function declaradosSinInstalar(ficheros, entorno) {
    return auditoriaPaquetes(ficheros, entorno).declaradosSinInstalar;
}
/**
 * LAS DOS LISTAS DE UN SOLO BARRIDO (v1.71.1). `paquetesFaltantes` y
 * `declaradosSinInstalar` recorrían el proyecto entero cada una con las mismas
 * regex; aquí se extrae una vez y se reparte. `paquetesPorArchivo` permite
 * reutilizar el barrido que ya hizo el motor de contexto para el grafo.
 * Las reglas de cada lista son las de siempre y no se cambian aquí.
 */
export function auditoriaPaquetes(ficheros, entorno, paquetesPorArchivo) {
    const porArchivo = paquetesPorArchivo ?? paquetesExternosPorArchivo(ficheros);
    const declarados = new Set(entorno.declarados);
    const union = new Set();
    for (const f of ficheros) {
        for (const p of porArchivo.get(f.path) ?? [])
            union.add(p);
    }
    const faltantes = [];
    const sinInstalar = [];
    for (const p of [...union].sort()) {
        if (entorno.estaInstalado(p))
            continue;
        (declarados.has(p) ? sinInstalar : faltantes).push(p);
    }
    return { faltantes, declaradosSinInstalar: sinInstalar };
}
/** El comando exacto que se ejecutaría. Separado para poder comprobarlo. */
export function comandoInstalacion(faltantes) {
    if (faltantes.length === 0)
        return null;
    // `--save` explícito: los paquetes entran en package.json, así que la próxima
    // vez el proyecto ya los declara y este chequeo no vuelve a dispararse.
    return `npm install --save --no-audit --no-fund ${faltantes.join(" ")}`;
}
/** Lo que se le enseña al usuario, en una línea. */
export function describirFaltantes(faltantes) {
    if (faltantes.length === 0)
        return "";
    const muestra = faltantes.slice(0, 6).join(", ");
    const resto = faltantes.length > 6 ? ` y ${faltantes.length - 6} más` : "";
    return `${faltantes.length} paquete(s) que el código importa y no están instalados: ${muestra}${resto}`;
}
/**
 * Estado de un paquete dentro de `node_modules`, verificado HASTA EL ARCHIVO
 * DE ENTRADA. `dirPaquete` es la carpeta ya resuelta del paquete.
 */
export function saludDePaquete(dirPaquete, disco) {
    if (!disco.existe(dirPaquete))
        return "ausente";
    const texto = disco.leer(disco.unir(dirPaquete, "package.json"));
    if (texto === null)
        return "roto"; // carpeta sin manifiesto: resto de una instalación cortada
    let pkg;
    try {
        pkg = JSON.parse(texto);
    }
    catch {
        return "roto"; // manifiesto ilegible o truncado a media escritura
    }
    // Candidatos de entrada, en el orden en que Node los usaría:
    // main → exports["."] (string, o su rama import/require/default) → primer bin.
    const relativo = (v) => {
        if (typeof v === "string" && v.startsWith("./"))
            return v.slice(2);
        return null;
    };
    let entrada = relativo(pkg?.main);
    if (!entrada)
        entrada = relativo(pkg?.exports);
    if (!entrada && pkg?.exports && typeof pkg.exports === "object") {
        const punto = pkg.exports["."];
        if (typeof punto === "string")
            entrada = relativo(punto);
        else if (punto && typeof punto === "object") {
            entrada = relativo(punto.import) || relativo(punto.require) || relativo(punto.default);
        }
    }
    if (!entrada && pkg?.bin) {
        if (typeof pkg.bin === "string")
            entrada = relativo("./" + pkg.bin.replace(/^\.?\//, ""));
        else if (typeof pkg.bin === "object") {
            const primero = Object.values(pkg.bin)[0];
            if (typeof primero === "string")
                entrada = relativo("./" + primero.replace(/^\.?\//, ""));
        }
    }
    if (!entrada)
        return "ok"; // sin entrada deducible: no acusar a ciegas
    return disco.existe(disco.unir(dirPaquete, entrada)) ? "ok" : "roto";
}
/**
 * Audita los paquetes DECLARADOS en el package.json del proyecto contra el
 * `node_modules` de su propia carpeta. `raizProyecto` es la raíz del proyecto
 * (donde vive su package.json), NO la de la IDE: cada proyecto se aísla.
 */
export function auditarInstalacion(raizProyecto, declarados, disco) {
    const nm = disco.unir(raizProyecto, "node_modules");
    const ausentes = [];
    const rotos = [];
    for (const p of declarados) {
        // `@scope/pkg` vive en dos niveles: se parte por "/" (igual que el chequeo viejo).
        const dir = disco.unir(nm, ...p.split("/"));
        const s = saludDePaquete(dir, disco);
        if (s === "ausente")
            ausentes.push(p);
        else if (s === "roto")
            rotos.push(p);
    }
    return { ausentes, rotos };
}
/** true si la auditoría no encontró ni ausentes ni rotos. */
export function instalacionSana(a) {
    return a.ausentes.length === 0 && a.rotos.length === 0;
}
