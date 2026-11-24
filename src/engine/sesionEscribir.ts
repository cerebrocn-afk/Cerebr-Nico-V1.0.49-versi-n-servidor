/**
 * sesionEscribir.ts · FASE 17 — SESIÓN RESISTENTE A CORTES (v2.3.20)
 * ===============================================================
 * EL PROBLEMA, en palabras del plano (`HOJA_DE_RUTA_EVOLUCION_v2.3.8.md`, FASE 17):
 * «`.cerebro-db` escribe documento entero. Un corte a mitad —y el puente corta a los
 * 60 s, lección L15— corrompe. `dsh` guarda `{ver, seq, val}` por campo y puede
 * reanudar en cualquier `seq`.»
 *
 * MEDIDO ANTES DE TOCAR: el estado operativo vive en `.cerebro-db/planes.json` y se
 * reescribe **entero** (atámicamente con tmp+rename, lo cual evita el archivo
 * truncado pero NO la pérdida de concurrencia: si la IDE y el puente :5000 escriben
 * el mismo documento, el último que termina se lleva puesto al otro sin enterarse).
 *
 * EL DISEÑO DE ACÁ, en el orden en que importa:
 *
 *  · **Append, no reescritura.** Cada mutación es una línea `{ver, seq, campo, val,
 *    escritor, ts}`. Una línea de 200 caracteres se escribe entera o no se escribe;
 *    un corte a mitad deja a lo sumo UN renglón roto al final, y el lector lo
 *    descarta. El documento entero de antes, roto a la mitad, era todo el estado.
 *  · **`seq` monótono** asignado por el propio log: es el punto de reanudación y la
 *    prueba de que no se perdió nada entre dos aperturas.
 *  · **Versionado por campo (row-versioning):** quien escribe puede decir «estoy
 *    tocando esto sobre el seq N». Si el actual no es N, hay otro escritor y la
 *    escritura se **rechaza con causa** en vez de pisar. Dos procesos, una verdad.
 *  · **Compactación** con tmp + rename: el snapshot arrastra el `seq`; si el corte
 *    cae en la compactación, el log viejo sigue intacto.
 *  · **Migración de una sola vez**, idempotente, y el documento viejo se conserva
 *    como `.v0.json` (reversibilidad media, como pidió el plano).
 *
 * LO QUE ESTO NO ES: no es una base de datos, no tiene bloqueo entre procesos (usa
 * CAS optimista, que es lo que el plano pide), y no cambia el formato de
 * `planes.json`: **la escritura vieja se conserva byte a byte** y el log es un
 * agregado. Un agregado que se puede apagar es un seguro; un reemplazo que no, es
 * el próximo incidente.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Versión del formato del log. Subir la versión sin migrador está prohibido por valla. */
export const VER_LOG = 1;
/** A partir de estas líneas de log, `guardarSesion` compacta. */
export const LINES_PARA_COMPACTAR = 64;

export interface Mutacion {
  ver: number;
  seq: number;
  campo: string;
  val: unknown;
  escritor: string;
  ts: number;
}

export interface ActaLectura {
  campos: Record<string, unknown>;
  seq: number;
  /** Líneas válidas releídas. */
  aplicadas: number;
  /** Líneas descartadas por rotas (el corte a mitad deja exactamente una, y acá se nombra). */
  descartadas: { numero: number; motivo: string }[];
  /** true si el archivo tenía el formato viejo (documento entero) y se leyó por compatibilidad. */
  migrado: boolean;
}

export function rutaLog(rutaDocumento: string): string {
  return `${rutaDocumento}.log.jsonl`;
}

/**
 * Relee el log. **Una línea rota al final no es una tragedia, es el diseño**: se
 * descarta esa y nada más, y queda nombrada en el acta. Lo que no se hace nunca es
 * «reparar» el archivo escribiendo de nuevo: el lector no toca disco.
 */
export function leerSesion(rutaDocumento: string): ActaLectura {
  const log = rutaLog(rutaDocumento);
  const acta: ActaLectura = { campos: {}, seq: 0, aplicadas: 0, descartadas: [], migrado: false };
  if (existsSync(log)) {
    const texto = readFileSync(log, "utf8");
    const lineas = texto.split("\n");
    lineas.forEach((linea, i) => {
      if (!linea.trim()) return;
      let o: any;
      try {
        o = JSON.parse(linea);
      } catch {
        // La señal de un corte NO es el largo de la línea: es que el archivo no
        // termine en salto de línea y la rota sea la última. Medir el largo (lo que
        // hacía la primera versión) clasificaba como «ilegible» un corte real y como
        // «truncado» un renglón malo en el medio, o sea: decía al revés.
        const esUltima = i === lineas.length - 1 || texto.slice(texto.indexOf(linea) + linea.length).trim() === "";
        const motivo = !texto.endsWith("\n") && esUltima ? "corte a mitad (ultima linea sin salto)" : "linea ilegible";
        acta.descartadas.push({ numero: i + 1, motivo });
        return;
      }
      if (!o || typeof o !== "object" || o.ver !== VER_LOG || typeof o.seq !== "number") {
        acta.descartadas.push({ numero: i + 1, motivo: "version o seq ausentes" });
        return;
      }
      if (o.tipo === "snapshot") {
        acta.campos = { ...(o.campos || {}) };
        acta.seq = o.seq;
        acta.aplicadas++;
        return;
      }
      if (o.seq <= acta.seq) {
        acta.descartadas.push({ numero: i + 1, motivo: `seq ${o.seq} repetido o viejo (actual ${acta.seq})` });
        return;
      }
      acta.campos[o.campo] = o.val;
      acta.seq = o.seq;
      acta.aplicadas++;
    });
    return acta;
  }
  // Sin log: formato viejo. Se LEE, no se asume que está mal.
  if (existsSync(rutaDocumento)) {
    try {
      const doc = JSON.parse(readFileSync(rutaDocumento, "utf8"));
      if (doc && typeof doc === "object") {
        acta.campos = { ...doc };
        acta.migrado = true;
      }
    } catch (e) {
      acta.descartadas.push({ numero: 1, motivo: "documento viejo ilegible" });
    }
  }
  return acta;
}

export interface ResultadoEscritura {
  ok: boolean;
  seq: number;
  motivo?: string;
  compacto: boolean;
}

/**
 * Aplica una mutación con CAS optimista: `esperadoSeq` es el `seq` sobre el que se
 * construyó el cambio. Si otro escritor (la IDE o el puente :5000) avanzó el log
 * mientras tanto, **se rechaza con causa** en lugar de pisar. Sin este chequeo el
 * `seq` es un adorno contable.
 */
export function adjuntar(
  rutaDocumento: string,
  mutacion: { campo: string; val: unknown; escritor: string; esperadoSeq?: number },
  ahora = Date.now(),
): ResultadoEscritura {
  const actual = leerSesion(rutaDocumento);
  if (typeof mutacion.esperadoSeq === "number" && mutacion.esperadoSeq !== actual.seq) {
    return { ok: false, seq: actual.seq, compacto: false, motivo: `conflicto: esperaba seq ${mutacion.esperadoSeq}, el log esta en ${actual.seq}` };
  }
  const linea: Mutacion = {
    ver: VER_LOG,
    seq: actual.seq + 1,
    campo: mutacion.campo,
    val: mutacion.val,
    escritor: mutacion.escritor,
    ts: ahora,
  };
  mkdirSync(path.dirname(rutaDocumento), { recursive: true });
  writeFileSync(rutaLog(rutaDocumento), JSON.stringify(linea) + "\n", { flag: "a" });
  return { ok: true, seq: linea.seq, compacto: false };
}

/**
 * Compacta: escribe un snapshot con el `seq` y reemplaza el log por uno que empieza
 * en ese snapshot. tmp + rename: si el corte cae acá, el log viejo sigue entero o ya
 * está el nuevo — no hay estado intermedio posible.
 */
export function compactar(rutaDocumento: string): { ok: boolean; seq: number; lineas: number } {
  const a = leerSesion(rutaDocumento);
  const log = rutaLog(rutaDocumento);
  const tmp = `${log}.tmp`;
  const snapshot = { ver: VER_LOG, tipo: "snapshot", seq: a.seq, campos: a.campos, ts: Date.now() };
  writeFileSync(tmp, JSON.stringify(snapshot) + "\n");
  renameSync(tmp, log);
  return { ok: true, seq: a.seq, lineas: 1 };
}

/**
 * EL PUNTO DE CABLEADO. Escribe el documento en el formato de siempre — byte a byte
 * como lo escribía `server.ts`, así ningún lector actual se entera de que esto existe
 * — y además deja la mutación en el log. Si el log estorba, se apaga esta línea y el
 * sistema vuelve exactamente a lo de antes.
 */
export function guardarSesion(
  rutaDocumento: string,
  anterior: { campos: Record<string, unknown>; seq: number },
  nuevo: Record<string, unknown>,
  opts: { escritor: string; serializar: (campos: Record<string, unknown>) => string; esperadoSeq?: number },
): ResultadoEscritura {
  const cambiados = Object.keys(nuevo).filter((k) => JSON.stringify(nuevo[k]) !== JSON.stringify(anterior.campos[k]));
  const objetivo = Object.keys(nuevo).length ? nuevo : anterior.campos;
  let resultado: ResultadoEscritura = { ok: true, seq: anterior.seq, compacto: false };
  const pendientes = cambiados.length ? cambiados : Object.keys(objetivo);
  for (const campo of pendientes) {
    resultado = adjuntar(rutaDocumento, {
      campo,
      val: objetivo[campo],
      escritor: opts.escritor,
      ...(typeof opts.esperadoSeq === "number" && campo === pendientes[0] ? { esperadoSeq: opts.esperadoSeq } : {}),
    });
    if (!resultado.ok) return resultado;
  }
  // El documento viejo se escribe IGUAL: es la reversibilidad media del plano, y la
  // razón por la que esta fase se puede adoptar sin fe.
  const tmp = `${rutaDocumento}.tmp`;
  writeFileSync(tmp, opts.serializar(objetivo));
  renameSync(tmp, rutaDocumento);
  let compacto = false;
  if (readFileSync(rutaLog(rutaDocumento), "utf8").split("\n").filter(Boolean).length > LINES_PARA_COMPACTAR) {
    compactar(rutaDocumento);
    compacto = true;
  }
  return { ...resultado, compacto };
}

/**
 * Migra el documento viejo a log, UNA vez, idempotente, guardando `.v0.json`. Si ya
 * hay log, no toca nada: relanzar la migración no puede duplicar el estado.
 */
export function migrarDocumentoViejo(rutaDocumento: string, escritor = "migracion"): { migrado: boolean; seq: number } {
  if (existsSync(rutaLog(rutaDocumento))) return { migrado: false, seq: leerSesion(rutaDocumento).seq };
  if (!existsSync(rutaDocumento)) return { migrado: false, seq: 0 };
  const doc = JSON.parse(readFileSync(rutaDocumento, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { migrado: false, seq: 0 };
  writeFileSync(`${rutaDocumento}.v0.json`, readFileSync(rutaDocumento), "utf8");
  let seq = 0;
  for (const campo of Object.keys(doc)) seq = adjuntar(rutaDocumento, { campo, val: doc[campo], escritor }).seq;
  compactar(rutaDocumento);
  return { migrado: true, seq };
}

/** Acta corta para el arranque: qué se recuperó y qué se descartó al reabrir. */
export function actaDeReapertura(a: ActaLectura): string {
  const partes = [`sesion: seq ${a.seq} · ${a.aplicadas} mutaciones releidas`];
  if (a.migrado) partes.push("migrada desde formato de documento unico");
  if (a.descartadas.length) partes.push(`${a.descartadas.length} linea(s) descartada(s) (corte a mitad): ${a.descartadas.map((d) => `L${d.numero} ${d.motivo}`).join("; ")}`);
  return partes.join(" · ");
}

/**
 * EL CABLE, en dos funciones chiquitas, y las dos a propósito tolerantes al fallo.
 *
 * `registrarEnLog` se llama DESPUÉS de la escritura atómica de siempre: si el log
 * falla, la escritura ya salió bien y el aviso se informa. Un seguro que puede
 * tumbar el vuelo no es un seguro.
 */
export function registrarEnLog(rutaDocumento: string, texto: string, escritor = "ide"): { seq: number; campos: string[] } {
  let doc: any;
  try {
    doc = JSON.parse(texto);
  } catch {
    return { seq: 0, campos: [] };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { seq: 0, campos: [] };
  const actual = leerSesion(rutaDocumento);
  // Comparar contra `undefined` con JSON.stringify a secas da «cambió» cuando el
  // campo tampoco estaba antes; de ahí el helper, que always devuelve cadena.
  const cambiados = Object.keys(doc).filter((k) => safeStringify(doc[k]) !== safeStringify(actual.campos[k]));
  const lista = cambiados.length ? cambiados : Object.keys(doc);
  let seq = actual.seq;
  for (const campo of lista) seq = adjuntar(rutaDocumento, { campo, val: doc[campo], escritor }).seq;
  if (readFileSync(rutaLog(rutaDocumento), "utf8").split("\n").filter(Boolean).length > LINES_PARA_COMPACTAR) compactar(rutaDocumento);
  return { seq, campos: lista };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
}

/**
 * Tercer recurso de lectura: ni el documento ni su respaldo sirven. Reconstruye el
 * último estado consistente desde el log. Devuelve `null` si tampoco hay nada, que
 * es exactamente lo que hacía el sistema antes: no inventar.
 */
export function recuperarDesdeLog(rutaDocumento: string): { texto: string; acta: string } | null {
  if (!existsSync(rutaLog(rutaDocumento))) return null;
  const a = leerSesion(rutaDocumento);
  if (!Object.keys(a.campos).length) return null;
  return { texto: JSON.stringify(a.campos, null, 2), acta: actaDeReapertura(a) };
}
