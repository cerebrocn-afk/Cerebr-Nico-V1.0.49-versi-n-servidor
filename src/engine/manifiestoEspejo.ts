/**
 * manifiestoEspejo.ts — EL ESPEJO DE ESPEJO AUDITABLE (v1.86.0 · FASE 7.2)
 * =======================================================================
 * EL PLANO (FASE 7 punto 2): «la información que el preview recibe del IDE se
 * lista en un manifiesto (qué campos, a qué frecuencia, con qué presupuesto de
 * tokens): el espejo es una fuente declarada, no un túnel».
 *
 * LA DISTINCIÓN QUE IMPORTA. Un túnel copia el estado del proceso padre y punto;
 * después nadie sabe qué cruzó. Un espejo declarado dice, ANTES de que pase nada,
 * qué campos pasan, con qué frecuencia y hasta cuánto. Y lo que no está en la
 * lista no cruza, aunque exista. Acá quedan afuera a propósito dos campos que
 * hoy viajan al chat del IDE:
 *   · `retratoProyecto` — es el retrato del árbol del USUARIO (rutas y nombres
 *     de sus archivos). La app generada no tiene por qué saber cómo se llama lo
 *     que hay en el disco de Mario.
 *   · `ultimoError` — un error real cita rutas absolutas y a veces fragmentos de
 *     una respuesta del proveedor. Mandarlo al sandbox es filtrar por diseño.
 * Los dos se nombran en `LO_QUE_NO_CRUZA` con su motivo: que el espejo sea
 * honesto también es decir lo que corta.
 *
 * EL MOLDE NO SE INVENTÓ AQUÍ: `espejos_servidor/` ya es precedente dentro del
 * proyecto (`catalogo.json` + `MANIFIESTO_SHA256.txt` + la regla «no se edita a
 * mano, se regenera»). Este archivo hace lo mismo con la frontera IDE↔sandbox.
 *
 * PUREZA: la regla vive en `filtrarInstantaneaPorManifiesto`, que es lo que llama
 * el cable. Escribir el JSON a disco es un anexo al final del archivo.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { InstantaneaConciencia } from "./conciencia";

/** El presupuesto de tokens del espejo: el mismo `budget = 900` de
 *  `buildConcienciaTiempoReal` (conciencia.ts:128). No se inventa otro número. */
export const PRESUPUESTO_TOKENS_ESPEJO = 900;

/** Cada cuántos milisegundos se refresca el espejo (medido en el motor: el
 *  turno re-calcula la conciencia en CADA paso, no una sola vez). */
export const FRECUENCIA_REFRESCO_MS = 2000;

/** Nombre del archivo que se escribe en el sandbox. */
export const NOMBRE_MANIFIESTO_ESPEJO = "MANIFIESTO_ESPEJO.json";

export interface CampoEspejo {
  /** El campo de `InstantaneaConciencia` que cruza. */
  campo: keyof InstantaneaConciencia | string;
  tipo: string;
  /** Techo de caracteres de ESTE campo (el presupuesto se reparte, no se comparte). */
  max_chars: number;
  frecuencia: string;
  /** Por qué la app generada necesita esto para funcionar. */
  porque: string;
}

/** LO QUE CRUZA, declarado campo por campo. */
export const MANIFIESTO_ESPEJO_SANDBOX = {
  version: 1,
  que_es:
    "Manifiesto del espejo IDE -> app generada. Fuente declarada, no tunel: lo que no esta aca no cruza la frontera.",
  origen: "CerebroNico IDE (motor)",
  destino: "app generada en el sandbox (preview, mismo puerto 3500)",
  frecuencia_refresco_ms: FRECUENCIA_REFRESCO_MS,
  presupuesto_tokens: PRESUPUESTO_TOKENS_ESPEJO,
  regla_dura:
    "NINGUN campo fuera de `campos` puede cruzar. El filtro es estructural (filtrarInstantaneaPorManifiesto), no una advertencia en la documentacion.",
  campos: [
    {
      campo: "objetivo",
      tipo: "string|null",
      max_chars: 160,
      frecuencia: "por turno",
      porque: "la app necesita saber para que la estan usando, si no, su memoria no significa nada.",
    },
    {
      campo: "pasos",
      tipo: "array{herramienta,detalle,ok}",
      max_chars: 480,
      frecuencia: "por paso",
      porque: "la verdad de lo hecho: que la app recuerde su ultima accion es exactamente esto.",
    },
    {
      campo: "resumen",
      tipo: "object{hechas,fallidas,sinHacer}|null",
      max_chars: 120,
      frecuencia: "por turno",
      porque: "el conteo del plan, para que la app sepa si va bien o mal, no solo que paso.",
    },
    { campo: "modelo", tipo: "string", max_chars: 60, frecuencia: "por turno", porque: "nombre del modelo: sin claves, sin URLs, sin cabeceras." },
    { campo: "proveedor", tipo: "string", max_chars: 30, frecuencia: "por turno", porque: "que motor contesta (la app lo muestra en su estado)." },
    { campo: "pcMode", tipo: "boolean", max_chars: 5, frecuencia: "por turno", porque: "si el entorno tiene control de PC: la app no promete lo que no puede." },
    { campo: "red", tipo: "boolean", max_chars: 5, frecuencia: "por turno", porque: "si hay red: la app no promete descargas en un entorno sin salida." },
    { campo: "tareaPesada", tipo: "boolean", max_chars: 5, frecuencia: "por turno", porque: "el grado de responsabilidad declarado por el motor." },
    { campo: "fiscal", tipo: "object|null", max_chars: 160, frecuencia: "por turno", porque: "el veredicto del ultimo metro (verde/roja/sinProbar) para que la app sepa que falta." },
  ] as CampoEspejo[],
};

/** LO QUE NO CRUZA, con su motivo. Un espejo que no dice lo que corta es un tunel. */
export const LO_QUE_NO_CRUZA: Array<{ campo: string; motivo: string }> = [
  { campo: "retratoProyecto", motivo: "es el arbol del usuario: rutas y nombres de sus archivos. La app generada no los necesita y no los ve." },
  { campo: "ultimoError", motivo: "un error real cita rutas absolutas y a veces trozos de la respuesta del proveedor. Se queda en el IDE." },
];

/** Campos conocidos de la instantanea: la lista contra la que se audita. */
export const CAMPOS_CONOCIDOS: string[] = [
  "objetivo", "pasos", "resumen", "modelo", "proveedor", "pcMode", "red",
  "retratoProyecto", "ultimoError", "tareaPesada", "fiscal",
];

export interface ResultadoFiltro {
  espejo: Record<string, unknown>;
  descartados: Array<{ campo: string; porque: string }>;
  caracteres: number;
  tokensAprox: number;
  excedePresupuesto: boolean;
}

/** Aproximacion honesta: no hay tokenizer en el motor, se estima 4 car = 1 token. */
export function tokensAprox(texto: string): number {
  return Math.ceil(String(texto || "").length / 4);
}

function recortar(v: unknown, max: number): unknown {
  if (v === null || v === undefined || typeof v !== "object") {
    return typeof v === "string" && v.length > max ? v.slice(0, max) : v;
  }
  let bruto = "";
  try { bruto = JSON.stringify(v) || ""; } catch { bruto = String(v); }
  if (bruto.length <= max) return v;
  // Un objeto recortado NO se re-parsea: sería JSON roto. Se entrega como bloque
  // de texto con marca, que es lo que el espejo igual puede leer.
  return { recortado: true, texto: bruto.slice(0, max) };
}

/**
 * EL FILTRO. Recibe la instantanea completa del IDE y devuelve SOLO lo declarado.
 * Un campo del manifiesto que no esta en la instantanea simplemente no aparece
 * (no se rellena con un default: un espejo no inventa estado).
 */
export function filtrarInstantaneaPorManifiesto(snap: InstantaneaConciencia | null | undefined): ResultadoFiltro {
  const declarados = MANIFIESTO_ESPEJO_SANDBOX.campos;
  const espejo: Record<string, unknown> = {};
  const descartados: Array<{ campo: string; porque: string }> = [];
  const bruto = (snap || {}) as Record<string, unknown>;
  for (const clave of Object.keys(bruto)) {
    const ficha = declarados.find((c) => c.campo === clave);
    if (!ficha) {
      const porQue = LO_QUE_NO_CRUZA.find((x: { campo: string; motivo: string }) => x.campo === clave)?.motivo || "no esta declarado en el manifiesto del espejo";
      descartados.push({ campo: clave, porque: porQue });
      continue;
    }
    if (bruto[clave] === undefined) continue;
    espejo[clave] = recortar(bruto[clave], ficha.max_chars);
  }
  const serial = (() => { try { return JSON.stringify(espejo) || ""; } catch { return String(espejo); } })();
  const tokens = tokensAprox(serial);
  return {
    espejo,
    descartados,
    caracteres: serial.length,
    tokensAprox: tokens,
    excedePresupuesto: tokens > PRESUPUESTO_TOKENS_ESPEJO,
  };
}

/** Auditoría del propio manifiesto (que la casa llama «el espejo auditado»). */
export function auditarManifiestoEspejo(m = MANIFIESTO_ESPEJO_SANDBOX): { ok: boolean; hallazgos: string[]; medidas: Record<string, number> } {
  const hallazgos: string[] = [];
  const campos = (m.campos || []).map((c) => String(c.campo));
  for (const c of campos) if (!CAMPOS_CONOCIDOS.includes(c)) hallazgos.push(`el manifiesto declara «${c}», que no existe en InstantaneaConciencia: prometer un campo fantasma`);
  const duplicados = campos.filter((c, i) => campos.indexOf(c) !== i);
  if (duplicados.length) hallazgos.push(`campos duplicados en el manifiesto: ${[...new Set(duplicados)].join(", ")}`);
  for (const c of m.campos || []) {
    if (!(c.max_chars > 0)) hallazgos.push(`«${c.campo}» no trae presupuesto de caracteres`);
    if (!String(c.porque || "").trim()) hallazgos.push(`«${c.campo}» cruza sin motivo declarado`);
    if (!String(c.frecuencia || "").trim()) hallazgos.push(`«${c.campo}» cruza sin frecuencia declarada`);
  }
  const suma = (m.campos || []).reduce((a, c) => a + c.max_chars, 0);
  if (suma > PRESUPUESTO_TOKENS_ESPEJO * 4) hallazgos.push(`la suma de presupuestos (${suma} caracteres) pasa el techo de ${PRESUPUESTO_TOKENS_ESPEJO} tokens`);
  if (!m.frecuencia_refresco_ms || m.frecuencia_refresco_ms <= 0) hallazgos.push("el manifiesto no declara frecuencia de refresco");
  for (const x of LO_QUE_NO_CRUZA) if (!String(x.motivo || "").trim()) hallazgos.push(`«${x.campo}» se corta sin decir por que`);
  return {
    ok: hallazgos.length === 0,
    hallazgos,
    medidas: { campos: campos.length, cortes: LO_QUE_NO_CRUZA.length, caracteres_maximos: suma, tokens_techo: PRESUPUESTO_TOKENS_ESPEJO },
  };
}


// ─── La cara a disco (el molde de `espejos_servidor/`) ───────────────────────
// El manifiesto vive DENTRO del cerebro del sandbox, al lado del índice: quien
// audite la app generada tiene que poder leer qué le dejan ver sin abrir el
// código del IDE. No se edita a mano: se regenera con `escribirManifiestoEspejo`.

function escribirManifiestoAtomico(destino: string, contenido: string): void {
  mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = `${destino}.tmp-${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, contenido, "utf-8");
  renameSync(tmp, destino);
}

/** El manifiesto con su marca de tiempo (lo que se escribe). */
export function renderManifiestoEspejo(ts = Date.now()): string {
  return JSON.stringify(
    {
      ...MANIFIESTO_ESPEJO_SANDBOX,
      generado: new Date(ts).toISOString(),
      no_cruza: LO_QUE_NO_CRUZA,
      conteo: {
        campos_que_cruzan: MANIFIESTO_ESPEJO_SANDBOX.campos.length,
        campos_que_se_cortan: LO_QUE_NO_CRUZA.length,
        caracteres_maximos: MANIFIESTO_ESPEJO_SANDBOX.campos.reduce((a, c) => a + c.max_chars, 0),
      },
    },
    null,
    2,
  );
}

export function rutaManifiestoEspejo(raizSandbox: string): string {
  return path.join(raizSandbox, "cerebro", NOMBRE_MANIFIESTO_ESPEJO);
}

export interface ResultadoManifiestoEscrito {
  ok: boolean;
  ruta: string;
  motivo?: string;
  bytes?: number;
}

/**
 * Escribe el manifiesto dentro del `cerebro/` del sandbox. Devuelve el motivo si
 * no pudo (un manifiesto que no se escribe es un espejo sin papeles: se declara).
 */
export function escribirManifiestoEspejo(raizSandbox: string, ts = Date.now()): ResultadoManifiestoEscrito {
  const ruta = rutaManifiestoEspejo(raizSandbox);
  const contenido = renderManifiestoEspejo(ts);
  try {
    escribirManifiestoAtomico(ruta, contenido);
    return { ok: true, ruta, bytes: Buffer.byteLength(contenido, "utf8") };
  } catch (e: any) {
    return { ok: false, ruta, motivo: `no se pudo escribir el manifiesto del espejo: ${e?.message || e}` };
  }
}

/** Lee el manifiesto que vive en el sandbox (`null` si no está o está podrido). */
export function leerManifiestoEspejo(raizSandbox: string): { generado: string; campos: CampoEspejo[] } | null {
  const ruta = rutaManifiestoEspejo(raizSandbox);
  try {
    if (!existsSync(ruta)) return null;
    const bruto = JSON.parse(readFileSync(ruta, "utf8"));
    if (!bruto || typeof bruto !== "object" || !Array.isArray(bruto.campos)) return null;
    return { generado: String(bruto.generado || ""), campos: bruto.campos as CampoEspejo[] };
  } catch {
    return null;
  }
}
