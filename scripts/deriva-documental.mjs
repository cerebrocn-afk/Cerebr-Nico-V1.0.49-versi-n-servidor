#!/usr/bin/env node
/**
 * scripts/deriva-documental.mjs — FASE 11: LA VERDAD DEL ESTADO (v2.3.13)
 * ======================================================================
 * EL DEFECTO QUE CASSA (HOJA_DE_RUTA_EVOLUCION_v2.3.8.md, FASE 11, textual):
 * «memoria dice v1.51.0, disco dice v2.3.8. […] Cualquier implementación hecha
 * sobre esa base nace torcida. Esto es deuda de credibilidad, y la credibilidad
 * es la propiedad que más se rompe en silencio.»
 *
 * MEDIDO HOY, antes de escribir una línea de código: `app/memoria.md` sigue
 * diciendo **-Fase de Desarrollo Activa:** … v1.51.0» cuando el disco dice
 * 2.3.12. Siete meses de deriva sin que nadie la viera, porque no había nada que
 * la mirase. Este script es esa mirada.
 *
 * DOS CLASES DE AFIRMACIÓN, Y LA DISTINCIÓN ES TODO EL DISEÑO:
 *
 *   1 · SITIOS DE IDENTIDAD — tienen que decir EXACTAMENTE la semilla, o rojo:
 *       `package.json`, `package-lock.json` (raíz y `packages[""]`), `index.html`
 *       (los cuatro literales) y el asiento MÁS RECIENTE de `CHANGELOG.md`.
 *   2 · DECLARACIONES DE PRESENTE — un rótulo que afirma el estado actual
 *       («Fase de Desarrollo Activa», «Versión instalada», «Versión actual»).
 *       Si contradicen la semilla: rojo.
 *
 *   LO QUE NO ES UNA AFIRMACIÓN: la historia. «Último Hito Alcanzado: v1.49.0»,
 *   «Versión 1.48.1→1.49.0», «desde v2.1.2…» son registros fechados y son
 *   VERDAD aunque ya no rijan. Un verificador que los tratase como deriva se
 *   volvería ruido, y al ruido el usuario lo apaga. La regla es por RÓTULO, no
 *   por presencia del número.
 *
 *   Y cuando un documento es una INSTANTÁNEA legítima (una hoja de ruta firmada
 *   «verificado contra el disco el 06/11/2026»), se exime con el marcador
 *   `deriva:historico` en la línea. No es un silencio: la exención aparece en el
 *   acta, con archivo y línea, para que se pueda auditar quien la puso.
 *
 * Uso:
 *   node scripts/deriva-documental.mjs                 → verificar contra el repo
 *   node scripts/deriva-documental.mjs --raiz <dir>    → verificar otro árbol
 *   node scripts/deriva-documental.mjs --fijar         → reescribir SOLO la identidad
 *   `--fijar` nunca toca documentos: la verdad de versión no se impone a un
 *   documento, se le pide que la corrija (o que se declare histórica).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath as _noF, fileURLToPath } from "node:url";

/** Directorio de `scripts/`, para resolver la raíz cuando se corre sin `--raiz`. */
const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Rótulos que afirman el estado PRESENTE. Lo que no empiece así es historia. */
export const ROTULOS_DE_PRESENTE = [
  "Fase de Desarrollo Activa",
  "Versión instalada",
  "Version instalada",
  "Versión actual",
  "Version actual",
  "Versión en uso",
  "Version en uso",
];

/** Marcador con el que un documento declara «soy una instantánea, no una promesa». */
export const MARCADOR_EXENCION = "deriva:historico";

/** Documentos que el plano de la FASE 11 pone bajo vigilancia. */
export const DOCUMENTOS_VIGILADOS = ["memoria.md", "perfeccion.json", "HOJA_DE_RUTA_*.md", "LEEME-PRIMERO.txt"];

/**
 * Un número de versión, con o sin `v` delante.
 *
 * NO se escribe `/\b(\d+\.\d+\.\d+)\b/g`: entre la `v` y el `1` de `v1.51.0` no
 * hay frontera de palabra (son dos caracteres de palabra), así que el patrón con
 * `\b` **no ve la forma más común de escribir una versión** y el verificador
 * devuelve «sin deriva» sobre un archivo que está derivado. Falso verde por
 * silente, el peor defecto posible en una valla de verdad. Se corta por dígitos y
 * puntos: `v1.51.0` y `1.51.0` entran, `10.2.6.1` no se parte en dos versiones.
 */
const RE_VERSION = /(?<![\d.])(\d+\.\d+\.\d+)(?![\d.])/g;

const leer = (raiz, relativo) =>
  existsSync(path.join(raiz, relativo)) ? readFileSync(path.join(raiz, relativo), "utf8") : null;

/** La semilla: el único literal de versión del código. */
export function leerSemilla(raiz) {
  const src = leer(raiz, "src/constants.ts");
  if (src === null) return null;
  const m = src.match(/const VERSION_SEMVER\s*=\s*"(\d+\.\d+\.\d+)"/);
  return m ? m[1] : null;
}

/**
 * Los literales de `index.html`. Se busca la MARCA pegada a la versión
 * (`CerebróNico V2.3.12`) y no un `V\d+\.\d+\.\d+` suelto: el primer intento
 * también se tragaba un `V8.0.0` que aparece en la prosa de la meta descripción,
 * y un verificador que cuenta de más aprueba cualquier cosa. Es la misma lección
 * del lector de `PORTS` de v2.3.12, aprendida dos veces en un mismo día.
 */
function literalesIndex(src) {
  return [...src.matchAll(/Cerebr[óo]Nico\s+V(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
}

/**
 * Versión de un JSON real, leída con `JSON.parse` y no con regex. En
 * `package-lock.json` los literales de dependencia también son `"version": "x"` y
 * cualquier regla de indentación los confunde (medido: el primer intento devolvió
 * 371 números). Se piden los DOS sitios propios: la raíz y `packages[""]`.
 */
function versionesDeLock(src) {
  let obj = null;
  try {
    obj = JSON.parse(src);
  } catch {
    return [];
  }
  const salidas = [];
  if (obj && typeof obj.version === "string") salidas.push(obj.version);
  const raiz = obj && obj.packages && obj.packages[""];
  if (raiz && typeof raiz.version === "string") salidas.push(raiz.version);
  return salidas;
}

/**
 * Sitios de identidad: lo que TIENE que decir la semilla. Cada entrada devuelve
 * lo que encontró, no un booleano, para que el acta pueda citar el número.
 */
export function sitiosDeIdentidad(raiz) {
  const salidas = [];

  const pkg = leer(raiz, "package.json");
  if (pkg !== null) {
    let v = [];
    try {
      const o = JSON.parse(pkg);
      if (o && typeof o.version === "string") v = [o.version];
    } catch {
      v = [];
    }
    salidas.push({ archivo: "package.json", encontrados: v, obligatorio: true });
  }

  const lock = leer(raiz, "package-lock.json");
  if (lock !== null) {
    salidas.push({ archivo: "package-lock.json (raíz y packages[\"\"])", encontrados: versionesDeLock(lock), obligatorio: true });
  }

  const html = leer(raiz, "index.html");
  if (html !== null) {
    salidas.push({ archivo: "index.html", encontrados: literalesIndex(html), obligatorio: true });
  }

  const change = leer(raiz, "CHANGELOG.md");
  if (change !== null) {
    const m = change.match(/^##\s+v?(\d+\.\d+\.\d+)/m);
    salidas.push({ archivo: "CHANGELOG.md (asiento más reciente)", encontrados: m ? [m[1]] : [], obligatorio: true });
  }

  return salidas;
}

/** Lista de `HOJA_DE_RUTA_*.md` y demás documentos vigilados que existen en el árbol. */
export function documentosVigilados(raiz) {
  let directorio = [];
  try {
    directorio = readdirSync(raiz);
  } catch {
    return [];
  }
  const sueltos = DOCUMENTOS_VIGILADOS.filter((d) => !d.includes("*"));
  const comines = DOCUMENTOS_VIGILADOS.filter((d) => d.includes("*")).map(
    (d) => new RegExp("^" + d.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"),
  );
  return [...new Set([...sueltos.filter((s) => directorio.includes(s)), ...directorio.filter((f) => comines.some((r) => r.test(f)))])].sort();
}

/**
 * Declaraciones de presente encontradas en los documentos. Devuelve TODAS, con
 * `eximida` en true cuando el marcador las desactiva: una exención invisible es
 * tan peligrosa como la deriva que vigila.
 */
export function declaracionesDePresente(raiz) {
  const halladas = [];
  for (const archivo of documentosVigilados(raiz)) {
    const src = leer(raiz, archivo);
    if (src === null) continue;
    // Un marcador en las primeras 15 líneas exime el archivo entero (es el caso
    // de una hoja de ruta firmada «verificado el 06/11/2026»: es una instantánea).
    const cabeceraExime = src.split(/\r?\n/).slice(0, 15).some((l) => l.includes(MARCADOR_EXENCION));
    src.split(/\r?\n/).forEach((texto, i) => {
      if (!ROTULOS_DE_PRESENTE.some((r) => texto.includes(r))) return;
      const vs = [...texto.matchAll(RE_VERSION)].map((m) => m[1]);
      if (vs.length === 0) return;
      halladas.push({
        archivo,
        linea: i + 1,
        rotulo: ROTULOS_DE_PRESENTE.find((r) => texto.includes(r)),
        declaran: vs,
        texto: texto.trim().slice(0, 120),
        eximida: cabeceraExime || texto.includes(MARCADOR_EXENCION),
      });
    });
  }
  return halladas;
}

/** El acta completa. `ok` es el veredicto que consume `npm run validar`. */
export function auditar(raiz) {
  const semilla = leerSemilla(raiz);
  const identidad = sitiosDeIdentidad(raiz).map((s) => ({
    ...s,
    coincide: s.encontrados.length > 0 && !!semilla && s.encontrados.every((v) => v === semilla),
  }));
  const declaraciones = declaracionesDePresente(raiz);
  // Regla declarada y con límite conocido: una fila de presente es compatible si
  // MENCIONA la semilla. No exige ser la única versión de la frase —«antes
  // 1.51.0, hoy 2.3.13» es prosa legítima—, pero la convivencia se muestra como
  // aviso, para que nadie esconda una versión vieja detrás de una nueva. Un
  // verificador que solo sabe decir sí/no tampoco verifica.
  const contradicciones = declaraciones.filter((d) => !d.eximida && !d.declaran.includes(String(semilla)));
  const conviviendo = declaraciones.filter(
    (d) => !d.eximida && d.declaran.includes(String(semilla)) && d.declaran.some((v) => v !== String(semilla)),
  );
  const eximidas = declaraciones.filter((d) => d.eximida);
  const problemas = [];
  if (!semilla) {
    problemas.push({ tipo: "semilla", archivo: "src/constants.ts", motivo: 'no se encontró `const VERSION_SEMVER = "x.y.z"`' });
  }
  for (const s of identidad) {
    if (s.encontrados.length === 0) {
      problemas.push({ tipo: "identidad", archivo: s.archivo, motivo: "no declara ninguna versión" });
    } else if (!s.coincide) {
      problemas.push({
        tipo: "identidad",
        archivo: s.archivo,
        motivo: `dice ${[...new Set(s.encontrados)].join(", ")} y la semilla dice ${semilla}`,
      });
    }
  }
  for (const d of contradicciones) {
    problemas.push({
      tipo: "declaracion",
      archivo: d.archivo,
      linea: d.linea,
      motivo: `«${d.rotulo}» dice ${d.declaran.join("/")} y la semilla dice ${semilla} — corregirlo o eximirlo con \`${MARCADOR_EXENCION}\``,
    });
  }
  return { raiz, semilla, identidad, declaraciones, contradicciones, conviviendo, eximidas, problemas, ok: problemas.length === 0 };
}

/**
 * `--fijar`: alinea SOLO los sitios de identidad con la semilla. Los documentos
 * quedan intactos a propósito: un script que reescribe la prosa del usuario para
 * que concuerde no verifica la verdad, fabrica consenso.
 */
export function fijarIdentidad(raiz, semilla) {
  const cambios = [];
  const reescribir = (relativo, fn) => {
    const antes = leer(raiz, relativo);
    if (antes === null) return;
    const { texto, tocado } = fn(antes);
    if (tocado && texto !== antes) {
      writeFileSync(path.join(raiz, relativo), texto);
      cambios.push(relativo);
    }
  };
  reescribir("package.json", (t) => {
    const nuevo = t.replace(/^(\s*"version":\s*")(\d+\.\d+\.\d+)(")/m, (_x, a, _v, c) => `${a}${semilla}${c}`);
    return { texto: nuevo, tocado: nuevo !== t };
  });
  reescribir("package-lock.json", (t) => {
    let nuevo = t;
    // 1 · la raíz del lockfile: el `"version"` a dos espacios, la primera vez.
    nuevo = nuevo.replace(/^ {2}"version":\s*"(\d+\.\d+\.\d+)"/m, (todo, v) =>
      v === semilla ? todo : `  "version": "${semilla}"`,
    );
    // 2 · `packages[""]`: el primer `"version"` a seis espacios DESPUÉS de
    //     `"packages"`. Posicional y no global porque un `gm` por indentación se
    //     llevaba puestas las versiones de las dependencias (medido: 371 números).
    const i = nuevo.indexOf('"packages"');
    if (i >= 0) {
      const cola = nuevo.slice(i);
      const corregida = cola.replace(/^( {6})"version":\s*"(\d+\.\d+\.\d+)"/m, (todo, sep, v) =>
        v === semilla ? todo : `${sep}"version": "${semilla}"`,
      );
      if (corregida !== cola) nuevo = nuevo.slice(0, i) + corregida;
    }
    return { texto: nuevo, tocado: nuevo !== t };
  });
  reescribir("index.html", (t) => {
    const nuevo = t.replace(/(Cerebr[óo]Nico\s+)V\d+\.\d+\.\d+/g, `$1V${semilla}`);
    return { texto: nuevo, tocado: nuevo !== t };
  });
  return cambios;
}

/** Formatea el acta para la consola (y para el informe de `npm run validar`). */
export function textoDelActa(a) {
  const lineas = [];
  lineas.push(`semilla (src/constants.ts) : ${a.semilla || "AUSENTE"}`);
  for (const s of a.identidad) {
    lineas.push(`  ${s.coincide ? "✓" : "✗"} ${s.archivo.padEnd(34)} ${s.encontrados.join(", ") || "—"}`);
  }
  for (const d of a.declaraciones) {
    const marca = d.eximida ? "·" : d.declaran.includes(String(a.semilla)) ? "✓" : "✗";
    lineas.push(
      `  ${marca} ${(d.archivo + ":" + d.linea).padEnd(34)} «${d.rotulo}» dice ${d.declaran.join("/")}` +
        (d.eximida ? "  (eximida: deriva:historico)" : ""),
    );
  }
  if (a.perfeccion) lineas.push(`  · perfeccion.json: ${a.perfeccion}`);
  for (const p of a.problemas) lineas.push(`  ✗ ${p.archivo || p.tipo}${p.linea ? ":" + p.linea : ""} → ${p.motivo}`);
  lineas.push(a.ok ? "VEREDICTO: SIN DERIVA DOCUMENTAL." : `DERIVA DOCUMENTAL: ${a.problemas.length} contradicción(es).`);
  return lineas.join("\n");
}

const esMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esMain) {
  const args = process.argv.slice(2);
  const opcion = (n) => {
    const i = args.indexOf("--" + n);
    return i >= 0 ? args[i + 1] : null;
  };
  const raiz = path.resolve(opcion("raiz") || path.resolve(AQUI, ".."));
  if (args.includes("--fijar")) {
    const semilla = leerSemilla(raiz);
    if (!semilla) {
      console.error("[deriva] no hay semilla que fijar: falta VERSION_SEMVER en src/constants.ts");
      process.exit ? process.exit(1) : process.exit(1);
    }
    const cambios = fijarIdentidad(raiz, semilla);
    console.log(`[deriva] identidad fijada a ${semilla}: ${cambios.length ? cambios.join(", ") : "ya estaba alineada"}`);
  }
  const acta = auditar(raiz);
  console.log("══ DERIVA DOCUMENTAL ══ " + raiz);
  console.log(textoDelActa(acta));
  process.exit(acta.ok ? 0 : 1);
}
