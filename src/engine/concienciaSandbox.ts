/**
 * concienciaSandbox.ts — EL PREVIEW TIENE CEREBRO PROPIO (v1.86.0 · FASE 7.1)
 * ==========================================================================
 * EL SUEÑO MEDIDO (plano, FASE 7 punto 1): «el sandbox expone un endpoint
 * mínimo para que la app que el usuario genere recuerde su propio contexto (su
 * última acción, su estado) usando el MISMO órgano, con su propia carpeta
 * `cerebro/` dentro del sandbox (nunca toca archivos del usuario: regla del
 * órgano)».
 *
 * HASTA V1.85.x EL PREVIEW ERA UN ESPEJO PASIVO: el único `cerebro/` que existía
 * era el del IDE (`<raizDatos>/cerebro`) y la app generada no tenía dónde
 * escribir nada. Prestarle el cerebro del IDE habría sido exactamente lo que el
 * plano prohíbe: dos procesos compartiendo la memoria del otro.
 *
 * LO QUE HACE ESTE MÓDULO (lógica pura, sin HTTP):
 *   · LA GUARDA es lo primero, no un anexo: la raíz que recibe tiene que ser
 *     absoluta, tiene que tener a la raíz del workspace por ancestro, y NO puede
 *     ser ancestro de la propia IDE. Cada segmento que llega del usuario pasa por
 *     la misma regla de `proyecto.rutas-sanas` (rechaza `..`, rutas absolutas y
 *     backslashes). Sin guarda no hay endpoint.
 *   · leer y escribir a través del MISMO órgano (`cerebroOrgano.aprender/enrutar`)
 *     con la raíz del sandbox en vez de la del IDE. Cero lógica copiada: si el
 *     órgano mañana vectoriza (FASE 2), el sandbox vectoriza con él.
 *   · presupuesto declarado: una entrada no puede traer cinco megas. Se corta y
 *     el recorte se AVISA, nunca se aplica en silencio.
 *   · nunca inventa memoria: si el órgano está vacío, `ultima` es `null` y se dice.
 *
 * NO TOCA: el `cerebro/` del IDE, los archivos del usuario, la red ni procesos.
 */
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import {
  aprender,
  enrutar,
  estadoCerebro,
  cargarIndice,
  rutaCerebro,
  type EntradaCerebro,
} from "./cerebroOrgano";
import { esAncestroOEquivale } from "./raizDatos";
import { MANIFIESTO_ESPEJO_SANDBOX, leerManifiestoEspejo } from "./manifiestoEspejo";

/** Carácter máximo de texto por entrada (el órgano no es un disco de backups). */
export const TOPE_TEXTO_ENTRADA = 4000;
/** Cuántas entradas devuelve una lectura (presupuesto de contexto, no tambo). */
export const TOPE_ENTRADAS_LECTURA = 6;

export interface GuardaSandbox {
  ok: boolean;
  /** Raíz saneada (sin separadores raros) o `null` si la guarda rechazó. */
  raiz: string | null;
  motivo: string;
}

/**
 * La regla de `proyecto.rutas-sanas` (`consejo.ts:331`) aplicada a un segmento:
 * nada de `..`, nada absoluto, nada de backslashes. Es la misma guarda que ya
 * protege el guardado de binarios — una verdad, dos puertas.
 */
export function segmentoSano(p: unknown): { ok: boolean; valor: string; motivo: string } {
  const s = String(p ?? "").trim();
  if (!s) return { ok: false, valor: s, motivo: "ruta vacía" };
  if (s.includes("..")) return { ok: false, valor: s, motivo: "contiene «..»" };
  if (s.startsWith("/")) return { ok: false, valor: s, motivo: "es absoluta" };
  if (s.includes("\\")) return { ok: false, valor: s, motivo: "contiene backslash" };
  if (/^[a-zA-Z]:/.test(s)) return { ok: false, valor: s, motivo: "es una unidad de Windows" };
  return { ok: true, valor: s, motivo: "" };
}

/**
 * LA GUARDA DE AISLAMIENTO (obligatoria, no opcional — diseño FASE 7.1 §3).
 * La raíz del cerebro de la app generada tiene que estar DENTRO del árbol del
 * workspace activo y no puede contener a la IDE. Se apoya en `esAncestroOEquivale`
 * (la misma relación que usa `rechazarRaizAncestroApp`), no en un `startsWith`
 * improvisado que se rompe con mayúsculas o con la barra final.
 */
export function guardarRaizSandbox(
  raizSandbox: string,
  ctx: { raizWorkspace: string; raizApp?: string },
): GuardaSandbox {
  const cruda = String(raizSandbox ?? "").trim();
  if (!cruda) return { ok: false, raiz: null, motivo: "no llegó la raíz del sandbox activo" };
  if (!path.isAbsolute(cruda)) return { ok: false, raiz: null, motivo: `la raíz «${cruda}» no es absoluta: sin raíz absoluta no se puede auditar el encierro` };
  const brutoWs = String(ctx?.raizWorkspace ?? "").trim();
  if (!brutoWs) return { ok: false, raiz: null, motivo: "no llegó la raíz del workspace: sin referencia de encierro la guarda no abre (fail-closed)" };
  const raiz = path.resolve(cruda);
  const ws = path.resolve(brutoWs);
  if (!esAncestroOEquivale(ws, raiz)) {
    return { ok: false, raiz: null, motivo: `la raíz «${raiz}» está FUERA del workspace del sandbox «${ws}»: el cerebro de la app generada solo puede vivir dentro de su propio árbol` };
  }
  if (raiz.toLowerCase() === ws.toLowerCase()) {
    return { ok: false, raiz: null, motivo: `la raíz del sandbox coincide con la raíz de datos del IDE («${ws}»): ahí su cerebro/ sería EL MISMO carpeta que la memoria del motor. La app generada necesita su propia carpeta — regla del plano, FASE 7.1` };
  }
  if (ctx.raizApp && esAncestroOEquivale(raiz, ctx.raizApp)) {
    return { ok: false, raiz: null, motivo: `la raíz «${raiz}» contiene a la propia IDE: desde ahí el sandbox tocaría archivos del usuario (regla del órgano)` };
  }
  return { ok: true, raiz, motivo: "" };
}

/** La carpeta `cerebro/` de la app generada (nunca la del IDE). */
export function carpetaCerebroSandbox(guarda: GuardaSandbox): string | null {
  return guarda.ok && guarda.raiz ? rutaCerebro(guarda.raiz) : null;
}

// ─── Escribir: la app generada recuerda ─────────────────────────────────────

export interface EntradaConciencia {
  /** Qué tipo de memoria es: `accion` (lo que hizo) | `estado` (cómo está) | libre. */
  tipo?: string;
  /** El tema de la entrada; default `app`. */
  tema?: string;
  titulo?: string;
  texto: string;
  palabras?: string[];
  estado?: string;
}

export interface ResultadoEscribir {
  ok: boolean;
  motivo?: string;
  entrada?: EntradaCerebro;
  archivo?: string;
  avisos: string[];
}

/**
 * ESCRIBIR UNA ENTRADA en el cerebro del sandbox. Pasa `aprender()` del órgano,
 * así que la entrada nueva refuerza a la existente con el mismo tema+título en
 * vez de duplicar (semántica del órgano, no copia local).
 */
export function escribirConcienciaSandbox(
  bruto: EntradaConciencia,
  ctx: { raizWorkspace: string; raizApp?: string },
  raizSandbox: string,
): ResultadoEscribir {
  const guarda = guardarRaizSandbox(raizSandbox, ctx);
  if (!guarda.ok) return { ok: false, motivo: `guarda de aislamiento: ${guarda.motivo}`, avisos: [] };
  const textoCrudo = String(bruto?.texto ?? "").trim();
  if (!textoCrudo) return { ok: false, motivo: "falta «texto»: no se aprende el vacío", avisos: [] };
  const avisos: string[] = [];
  let texto = textoCrudo;
  if (texto.length > TOPE_TEXTO_ENTRADA) {
    texto = texto.slice(0, TOPE_TEXTO_ENTRADA);
    avisos.push(`el texto pedía ${textoCrudo.length} caracteres y se recortó al presupuesto de ${TOPE_TEXTO_ENTRADA} (el órgano no es un disco de backups)`);
  }
  const temaSeg = segmentoSano(bruto?.tema || "app");
  const tituloSeg = segmentoSano(bruto?.titulo || "nota");
  const tipo = segmentoSano(bruto?.tipo || "accion");
  if (!temaSeg.ok) return { ok: false, motivo: `«tema» rechazado por la regla de rutas sanas: ${temaSeg.motivo}`, avisos };
  if (!tituloSeg.ok) return { ok: false, motivo: `«titulo» rechazado por la regla de rutas sanas: ${tituloSeg.motivo}`, avisos };
  const conEstado = bruto?.estado ? `${texto}\n\n[estado] ${String(bruto.estado).slice(0, 200)}` : texto;
  const entrada = aprender(guarda.raiz as string, {
    tema: temaSeg.valor,
    titulo: `${tipo.ok ? tipo.valor : "accion"}: ${tituloSeg.valor}`.slice(0, 80),
    texto: conEstado,
    palabras: Array.isArray(bruto?.palabras) ? (bruto!.palabras as unknown[]).slice(0, 12).map((p) => String(p).slice(0, 40)) : undefined,
  });
  if (!entrada) return { ok: false, motivo: "el órgano no aceptó la entrada (devolvió null): nada se escribió, nada se fingió", avisos };
  return { ok: true, entrada, archivo: path.join(rutaCerebro(guarda.raiz as string), entrada.archivo), avisos };
}

// ─── Leer: la app preguntan por su propio contexto ───────────────────────────

export interface LecturaConciencia {
  ok: boolean;
  motivo?: string;
  /** La última entrada escrita (lo último que la app recordó). */
  ultima: { tema: string; titulo: string; resumen: string; ts: string; archivo: string } | null;
  /** Lo que el órgano enruta para la consulta (vacío si no hay memoria). */
  rutas: Array<{ tema: string; titulo: string; resumen: string; score: number; archivo: string }>;
  total: number;
  presupuesto: { entradas: number; caracteres: number };
  avisos: string[];
}

/**
 * LEER la conciencia de la app generada. Sin consulta devuelve la última acción
 * recordada; con consulta enruta por sentido (el híbrido de FASE 2 vive dentro
 * de `enrutar`, así que el sandbox lo hereda sin cable nuevo).
 */
export function leerConcienciaSandbox(
  ctx: { raizWorkspace: string; raizApp?: string },
  raizSandbox: string,
  opts: { consulta?: string; max?: number } = {},
): LecturaConciencia {
  const guarda = guardarRaizSandbox(raizSandbox, ctx);
  if (!guarda.ok) return { ok: false, motivo: `guarda de aislamiento: ${guarda.motivo}`, ultima: null, rutas: [], total: 0, presupuesto: { entradas: 0, caracteres: 0 }, avisos: [] };
  const raiz = guarda.raiz as string;
  const avisos: string[] = [];
  if (!existsSync(rutaCerebro(raiz))) {
    avisos.push("la app todavía no recordó nada: no existe su carpeta cerebro/ (se crea a la primera escritura)");
  }
  const indice = cargarIndice(raiz);
  const max = Math.min(TOPE_ENTRADAS_LECTURA, Math.max(1, Number(opts.max) || 4));
  const consulta = String(opts.consulta ?? "").trim();
  const rutas = consulta
    ? enrutar(raiz, consulta, max).map((r) => ({
        tema: r.entrada.tema,
        titulo: r.entrada.titulo,
        resumen: String(r.entrada.resumen || "").slice(0, 200),
        score: Number(r.score.toFixed(3)),
        archivo: r.entrada.archivo,
      }))
    : [];
  const ultimaEntrada = [...indice.entradas].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  const presupuestoCaracteres = rutas.reduce((a, r) => a + r.resumen.length, 0);
  if (consulta && !rutas.length && indice.entradas.length) {
    avisos.push("el órgano tiene memoria pero nada parecido a esta consulta: se devuelve vacío, no lo más cercano por las dudas");
  }
  return {
    ok: true,
    ultima: ultimaEntrada
      ? {
          tema: ultimaEntrada.tema,
          titulo: ultimaEntrada.titulo,
          resumen: String(ultimaEntrada.resumen || "").slice(0, 200),
          ts: ultimaEntrada.ts,
          archivo: ultimaEntrada.archivo,
        }
      : null,
    rutas,
    total: indice.entradas.length,
    presupuesto: { entradas: rutas.length, caracteres: presupuestoCaracteres },
    avisos,
  };
}

/** El estado que responde `GET /api/conciencia?estado=1`. */
export function estadoConcienciaSandbox(
  ctx: { raizWorkspace: string; raizApp?: string },
  raizSandbox: string,
): { ok: boolean; motivo?: string; cerebro?: ReturnType<typeof estadoCerebro>; manifiesto?: string | null; camposDeclarados: number; nota: string } {
  const guarda = guardarRaizSandbox(raizSandbox, ctx);
  if (!guarda.ok) return { ok: false, motivo: guarda.motivo, camposDeclarados: 0, nota: "sin guarda, sin estado" };
  const raiz = guarda.raiz as string;
  const estado = estadoCerebro(raiz);
  const manifiesto = leerManifiestoEspejo(raiz);
  return {
    ok: true,
    cerebro: estado,
    manifiesto: manifiesto ? new Date(manifiesto.generado).toISOString() : null,
    camposDeclarados: MANIFIESTO_ESPEJO_SANDBOX.campos.length,
    nota: `El cerebro de la app generada vive en ${estado.ruta} — dentro del sandbox, nunca en el árbol del IDE.`,
  };
}

/** ¿La carpeta existe y cuánto pesa? (para el informe de la entrega). */
export function pesoCerebroSandbox(raizSandbox: string): { existe: boolean; bytes: number } {
  try {
    const p = path.join(raizSandbox, "cerebro", "indice.json");
    if (!existsSync(p)) return { existe: false, bytes: 0 };
    return { existe: true, bytes: statSync(p).size };
  } catch {
    return { existe: false, bytes: 0 };
  }
}
