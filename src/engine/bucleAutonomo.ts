/**
 * bucleAutonomo.ts — EL BUCLE NO SE DETIENE A MITAD DE TAREA (v1.16.0)
 * ====================================================================
 * QUÉ ES: el juez determinista del bucle de herramientas del agente. Decide,
 * SIN llamar al modelo, si una respuesta que no trae herramienta es el fin de
 * la tarea o una parada a mitad — y en ese caso con qué directiva se empuja.
 *
 * POR QUÉ EXISTE: el pedido del usuario es literal — «el modelo no debe
 * detenerse a la mitad de una tarea; si ya se le marcó un destino tiene que
 * saber solo por cuál camino ir, o si tiene que dar la vuelta para tomar otro;
 * si falla, seguir con la solución, no esperar a que el usuario le diga
 * "continúa con…"».
 *
 * El defecto real: `runOllamaAgentLoop` cortaba en cuanto el modelo devolvía
 * texto sin herramienta. La versión v1.15.1 solo empujaba si la respuesta era
 * CORTA (<160 caracteres) y en futuro — un «voy a revisar los 6 módulos,
 * analizaré cada uno y luego escribiré los tests…» de 200 caracteres se
 * escapaba y el chat quedaba esperando una orden para seguir haciendo su
 * propio trabajo. Y cuando se agotaban los 10 pasos, el bucle respondía
 * «Completado» con tareas colgando: mentía.
 *
 * Cómo lo cierra:
 *   · el PLAN manda — si quedó alguna tarea sin cerrar, no se cierra el turno;
 *   · pedir permiso («¿querés que continúe?») es una parada, no un final;
 *   · un fallo de herramienta dispara DESVÍO, no espera;
 *   · el techo de pasos crece con el tamaño del plan (y sigue topado);
 *   · si de verdad se agota, el informe dice qué falta en vez de decir «listo».
 *
 * v1.31.0 · EL CABLE FIRMA→ESCALERA (hoja de ruta §5/§17):
 *   v1.30 ya SABÍA reconocer el mismo error por firma normalizada
 *   (reconocimientoError.ts) pero solo se lo SUSURRABA al prompt. Ahora el
 *   juez lo APLICA: cada fallo que pasa por aquí se registra en la memoria
 *   del motor (clave = clase|archivo) y, si la firma se repite, el escalón
 *   de la escalera se SUBE SOLO — sin que el modelo lo pida ni el usuario lo
 *   ordene. Y si la escalera entera ya no cede (≥ UMBRAL_FIRMA.bloquear), el
 *   bucle se BLOQUEA con informe honesto: causa raíz, estrategias probadas y
 *   la decisión que requiere humano. Nunca más: error → mismo código → error.
 *   Límite declarado y honesto: el cable mira los fallos que llegan COMO
 *   herramienta (ultimoFallo); un error que solo vive en prosa del modelo no
 *   es registrable — eso lo cubre el superPrompt estático de v1.30, no este.
 *
 * Es lógica PURA (con una pequeña memoria de módulo, acotada) y vive fuera de
 * server.ts por las dos reglas de la casa: el monolito no crece (trinquete de
 * líneas) y lo nuevo se prueba en seco.
 */

import {
  analizarBucle,
  contextoError,
  diagnosticoRaiz,
  directrizReconocimiento,
  type AnalisisBucle,
} from "./reconocimientoError";
import { estadoContrato, directivaDeContratoAbierto, consumirIntentoContrato, contratoAParte } from "./planAdaptativo"; // v1.32.0
import { decidirProxima, directivaDeMovimiento } from "./controlRazonamiento"; // v1.33.0 · FASE 3
// v1.49.0 · FASE 2 — el fiscal del último metro ya con cuerpo. Importamos SOLO
// el tipo del dictamen y dos formateadores puros; `autovalido` NUNCA importa a
// este módulo (grafo acíclico): es el bucle quien consulta su veredicto.
import { actaBloqueoFiscal, coberturaAParte } from "./autovalido";
import type { DictamenFiscal } from "./autovalido";
// v1.0.14 · el cuestionario de opciones es un diálogo legítimo, no una parada.
import { esPreguntaDeOpciones } from "./preguntaConOpciones";

export type EstadoTarea = "pending" | "running" | "done" | "failed";

export interface TareaPlan {
  id: string;
  description: string;
  status: EstadoTarea;
}

export interface UltimoFallo {
  herramienta: string;
  error: string;
}

export interface SeñalBucle {
  /** Lo que el modelo respondió en este turno (sin llamadas a herramientas). */
  contenido: string;
  /** El plan que el propio agente declaró (set_plan / update_task). */
  plan: TareaPlan[];
  /** Paso ya consumido (0-based, como el `for` del bucle). */
  paso: number;
  /** Techo de pasos vigente en este turno. */
  maxPasos: number;
  /** Fallo de la última herramienta, o null si la última salió bien. */
  ultimoFallo?: UltimoFallo | null;
  /**
   * v1.16.3.1 · AUTOMATISMO CONSCIENTE — cuántas veces falló CADA herramienta
   * dentro de este turno (se reinicia al tener éxito). Sin este contador el
   * bucle solo veía el último fallo y no distinguía «tropezó una vez» de
   «le está pasando tres veces a la misma piedra».
   */
  fallosPorHerramienta?: Record<string, number>;
  /**
   * v1.16.3.1 · historial (herramienta, ok) del turno. Sirve para saber en qué
   * fase vive el turno: nada mutado todavía = CREAR; algo ya mutado =
   * MODIFICAR; fallos acumulados = REPARAR. La fase decide la directiva.
   */
  historialBucle?: { nombre: string; ok: boolean }[];
  /**
   * v1.49.0 · FASE 2 — EL FISCAL DEL ÚLTIMO METRO. Dictamen ya calculado por el
   * servidor en el momento del cierre (allí viven todas las fuentes: contrato,
   * tablero de evidencias, acta del turno, completitud). El bucle solo lo
   * CONSULTA en la puerta de salida. Si viene ausente, el bucle decide igual
   * que antes de v1.49.0 (cero regresión).
   */
  fiscal?: DictamenFiscal | null;
}

/**
 * v1.16.3.1 — LAS TRES FASES DEL AUTOMATISMO CONSCIENTE.
 * El bucle no es un ciego «repetir hasta que salga»: sabe QUÉ está haciendo.
 * Crear (todavía no tocó nada), modificar (ya hay obra propia en el turno) o
 * reparar (algo falló y hay que resolver sin que nadie le diga «continúa»).
 */
export type FaseBucle = "crear" | "modificar" | "reparar";

/** Herramientas que DEJAN HUELLA en el proyecto (definen «ya estoy modificando»). */
export const HERRAMIENTAS_MUTANTES = new Set([
  "write_file", "edit_file", "append_file", "make_dir", "delete_file",
  "run_command", "pc_write_file", "pc_exec", "pc_delete", "git_commit",
]);

/** ¿En qué fase está el turno? Pura: solo mira el historial y los fallos. */
export function faseDelTurno(señal: {
  ultimoFallo?: UltimoFallo | null;
  fallosPorHerramienta?: Record<string, number>;
  historialBucle?: { nombre: string; ok: boolean }[];
}): FaseBucle {
  const fallos = Object.values(señal.fallosPorHerramienta ?? {});
  if (señal.ultimoFallo || fallos.some((n) => (Number(n) || 0) >= 2)) return "reparar";
  const h = señal.historialBucle ?? [];
  if (h.some((x) => x.ok && HERRAMIENTAS_MUTANTES.has(x.nombre))) return "modificar";
  return "crear";
}

/** Suma de fallos acumulados del turno (la materia prima del escalón). */
export function totalFallos(fallosPorHerramienta?: Record<string, number>): number {
  return Object.values(fallosPorHerramienta ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

/**
 * EL ESCALÓN DE REPARACIÓN: cuánta insistencia lleva el turno.
 *   0 = sin fallos · 1 = primer tropiezo · 2 = reincidencia · 3 = no cede.
 * Cada escalón abre una estrategia DISTINTA (ver directivaDeReparacion): el
 * automatismo consciente no es repetir más fuerte, es cambiar de método.
 */
export function escalonDeReparacion(fallosTotales: number): 0 | 1 | 2 | 3 {
  if (fallosTotales >= 5) return 3;
  if (fallosTotales >= 3) return 2;
  if (fallosTotales >= 1) return 1;
  return 0;
}

/**
 * LA ESCALERA, redactada para el modelo. Determinista y sin promesas:
 *   1. otro camino (otra herramienta, otra ruta, leer antes de tocar);
 *   2. diagnosticar y retroceder (revisar_cambios / deshacer_cambios / run_tests);
 *   3. reconstruir lo mínimo y, si nada cierra, informar con honestidad.
 */
export function directivaDeReparacion(escalon: number): string {
  if (escalon >= 3)
    return (
      "Tercer escalón de reparación: no insistas sobre el mismo archivo. Reconstruí solo la pieza mínima que falta " +
      "(make_dir y read_file para ver qué existe de verdad), aplicá el patch más chico posible con edit_file y, si aun " +
      "así no cierra, informá qué quedó roto y por qué. Decir «listo» con obra abierta está prohibido."
    );
  if (escalon === 2)
    return (
      "Segundo escalón de reparación: revisá el estado real con revisar_cambios; si el último cambio rompió algo, " +
      "retrocedelo con deshacer_cambios; después corrid run_tests y arreglá ESE error exacto, uno por vez."
    );
  return (
    "Primer escalón de reparación: no repitas la llamada que falló. Cambiá de camino: otra herramienta (edit_file en " +
    "vez de write_file), otra ruta, o leé el archivo tal como está antes de volver a tocarlo."
  );
}

// ── v1.31.0 · MEMORIA DE FIRMAS: el juez por fin CONTABA ─────────────────────
// (En la sesión de v1.30 nadie contaba las repeticiones entre turnos; aquí vive
// el conteo. Acotada por diseño: 12 errores por clave, 64 claves — un turno
// no necesita más historia para reconocer que se repite.)

export interface UmbralesFirma {
  /** Repeticiones de la misma firma para admitir el bucle (casa: 2). */
  bucle: number;
  /** Repeticiones tras las cuales NINGÚN escalón cede: bloqueo humano. */
  bloquear: number;
}

export const UMBRAL_FIRMA: UmbralesFirma = { bucle: 2, bloquear: 5 };

const HISTORIAL_FIRMAS_MAX = 12;
const CLAVES_FIRMAS_MAX = 64;
const memoriaFirmas = new Map<string, string[]>();

/** Clave del fallo: clase + archivo (o módulo). Dos errores del mismo punto, misma clave. */
export function claveDeFallo(error: string): string {
  const c = contextoError(error);
  return `${c.clase}|${c.archivo || c.modulo || "?"}`;
}

/** Guarda un error crudo en la memoria del motor y devuelve su clave. */
export function registrarFalloFirma(error: string): string {
  const clave = claveDeFallo(error);
  let lista = memoriaFirmas.get(clave);
  if (!lista) {
    if (memoriaFirmas.size >= CLAVES_FIRMAS_MAX) {
      const primera = memoriaFirmas.keys().next().value;
      if (primera !== undefined) memoriaFirmas.delete(primera);
    }
    lista = [];
    memoriaFirmas.set(clave, lista);
  }
  lista.push(String(error || "").slice(0, 4000));
  if (lista.length > HISTORIAL_FIRMAS_MAX) lista.splice(0, lista.length - HISTORIAL_FIRMAS_MAX);
  return clave;
}

export function historialDeFirmas(clave: string): string[] {
  return [...(memoriaFirmas.get(clave) ?? [])];
}

/**
 * El PELDAÑO que la repetición exige, aunque el contador de fallos por
 * herramienta diga menos:
 *   ≥2 → escalón 2 (diagnosticar y RETROCEDER: ya quedó probado que
 *        «cambiar de camino» (1) no basta cuando el error vuelve igual).
 *   ≥4 → escalón 3 (reconstruir lo mínimo e investigar la arquitectura).
 */
export function peldanoPorRepeticiones(repeticiones: number): 0 | 2 | 3 {
  if (repeticiones >= 4) return 3;
  if (repeticiones >= UMBRAL_FIRMA.bucle) return 2;
  return 0;
}

/** Pruebas y reinicio limpio: vacía la memoria de firmas. */
export function reiniciarMemoriaDeFirmas(): void {
  memoriaFirmas.clear();
}

export type Decision =
  | { accion: "continuar"; motivo: string; directiva: string; fase: FaseBucle; escalon: number }
  | { accion: "cerrar"; motivo: string; informe: string };

/** Base del techo de pasos (el valor histórico de `maxSteps`).
 *  v1.0.14 · 10→16: la sesión 1794293050619 cortó tareas SANAS a los 3-4 min
 *  («antes trabajaba más de 20 minutos», Mario 10/11). La base cubre ahora un
 *  arranque real: leer plan + 4-6 acciones + cierre. */
export const PASOS_BASE = 16;
/** Techo duro: ni el plan más grande puede correr sin frontera.
 *  v1.0.14 · 48→96: una tanda grande de test-and-fix (escribir → validar →
 *  corregir × 10) cabía JUSTO al borde y moría con obra pendiente. Las guardas
 *  anti-bucle (repetición, relectura estéril, ciclo, fallos seguidos) siguen
 *  siendo la frontera real contra la fuga; el techo solo deja de castigar el
 *  trabajo honesto. */
export const PASOS_TOPE = 96;
/** Pasos extra por tarea abierta: una tarea realista son ~3 idas y vueltas. */
export const PASOS_POR_TAREA = 3;

// ── Señales lingüísticas de "esto no terminó" ───────────────────────────────
const RE_CIERRE =
  /\b(listo|hecho|completado|terminado|finalizado|resultado|éxito|exitosa|funciona|creado|escrito|✓)\b/i;
const RE_INTENCION =
  /\b(voy a|voy|ire a|iré a|procedo|procederé|procedere|déjame|dejame|vamos a|empezaré|empezare|comenzaré|comenzare|analizaré|analizare|revisaré|revisare|escanearé|escanigare|continuaré|continuare|sigo con|el siguiente paso|siguiente paso|a continuación|en el próximo paso|me falta|todavía falta|falta|debo|tengo que|luego voy|ahora voy|ahora leo|ahora escribo)\b/i;
const RE_PIDE_PERMISO =
  /(¿\s*(quieres|querés|deseas|prefieres|prefirieres|necesitas|necesitás|continúo|continuo|avanzo|sigo|te parece)|si quer[e]s que|si quieres que|dime si|decime si|¿algo más|necesit[áa]s que|¿por dónde|¿qu[eé] prefieres|dime c[oó]mo|decime c[oó]mo|c[oó]mo seguimos|por d[oó]nde sigo|qu[eé] quer[e]s que haga)/i;
const RE_CORTE = /(…|\.\.\.|[,;:]\s*$)/;
// v1.52.1 — ANUNCIO ESTRUCTURAL SIN ACCIÓN. RAÍZ medida (sesión glm-4.5-flash,
// "chat en cortocircuito"): el modelo débil OBEDECE la checklist de
// autoconciencia y ESCRIBE los encabezados «## COMPRENSIÓN / ## ANÁLISIS DE LO
// EXISTENTE / ## PLAN» (o «Paso 1:», «Primero,») como si fueran la entrega, y
// FRENA sin llamar ninguna herramienta. Esos encabezados no llevan verbo de
// intención («voy a…») ni dos puntos finales, así que motivoDeParada los dejaba
// pasar como cierre válido → el turno se cortaba a mitad SIN un solo re-empuje.
// Ahora se reconocen como «narró y no ejecutó» para que el re-empuje dispare.
// Anclado a inicio de línea para no confundir prosa normal («el plan quedó…»).
const RE_ANUNCIO_ESTRUCTURAL =
  /(^|\n)\s*(?:#{1,6}\s*|\d+\s*[.)]?\s*|[-*•]\s*)*(comprensi[oó]n del trabajo|an[aá]lisis de lo existente|plan m[ií]nimo|comprensi[oó]n|an[aá]lisis|plan|paso\s*\d+|primero|para empezar|para comenzar|empecemos|comencemos)\b/i;

/** Normaliza el estado que reporta el modelo (`completed`, `in_progress`…). */
export function normalizarEstado(valor: unknown): EstadoTarea | null {
  const s = String(valor ?? "").trim().toLowerCase();
  if (["done", "completed", "completada", "completado", "terminado", "ok", "✓"].includes(s)) return "done";
  if (["running", "in_progress", "inprogress", "ejecutando", "en curso"].includes(s)) return "running";
  if (["failed", "error", "fallida", "falló", "fallo"].includes(s)) return "failed";
  if (["pending", "pendiente", "todo", "queued"].includes(s)) return "pending";
  return null;
}

/**
 * Aplica al plan lo que el agente acaba de hacer con `set_plan` / `update_task`.
 * El bucle ya emitía esos eventos para el tablero; acá sirven para lo mismo pero
 * en memoria del motor: sin plan conocido no se puede saber si se está a mitad.
 */
export function actualizarPlanDesdeHerramienta(
  plan: TareaPlan[],
  herramienta: string,
  args: any
): void {
  if (herramienta === "set_plan" && Array.isArray(args?.tasks)) {
    plan.length = 0;
    args.tasks.forEach((t: any, i: number) => {
      plan.push({
        id: String(t?.id ?? `t${i + 1}`),
        description: String(t?.description ?? t?.titulo ?? ""),
        status: normalizarEstado(t?.status) ?? "pending",
      });
    });
    return;
  }
  if (herramienta === "update_task") {
    const id = String(args?.task_id ?? args?.taskId ?? "");
    const estado = normalizarEstado(args?.status);
    const tarea = plan.find((p) => p.id === id);
    if (tarea && estado) tarea.status = estado;
  }
}

export function tareasPendientes(plan: TareaPlan[]): TareaPlan[] {
  return plan.filter((t) => t.status === "pending" || t.status === "running");
}

// ── v1.56.5 · MÁS CONTEXTO EN EL BUCLE («perfeccioná los bucles») ────────────
// RAÍZ (evolución pedida por Mario): la directiva de continuación empujaba
// SIEMPRE con el mismo texto, sin decirle al modelo DÓNDE está parado. Un
// modelo débil, sin saber que YA leyó 4 archivos y va por el paso 9 de 12,
// vuelve a leer lo mismo o se queda «explorando» sin producir. Ahora el juez
// arma un CONTEXTO del turno (progreso real + herramientas ya usadas) y detecta
// el ESTANCAMIENTO (muchos pasos observando sin tocar disco) para exigir una
// acción productiva, no otra lectura. Es PURO y acotado: se deriva de la propia
// señal; sin señal rica no dice nada (cero regresión). No usa la palabra que
// nombra los peldaños de reparación: el contexto NO es la escalera, es saber
// dónde se está parado.

/** Pasos observando (solo lectura) sin producir obra que ya es estancamiento. */
export const UMBRAL_ESTANCAMIENTO = 3;

export interface ContextoProgreso {
  /** Paso ya consumido (0-based). */
  paso: number;
  /** Techo de pasos del turno. */
  maxPasos: number;
  /** Pasos que todavía quedan (nunca negativo). */
  restantes: number;
  /** Tareas del plan ya cerradas. */
  hechas: number;
  /** Tamaño del plan declarado. */
  total: number;
  /** Herramientas distintas ya usadas este turno, en orden de aparición. */
  herramientasUsadas: string[];
  /** Herramientas con al menos un fallo abierto este turno. */
  herramientasFallidas: string[];
  /** true si todo lo usado fue lectura: nada mutó el proyecto todavía. */
  soloObservo: boolean;
  /** Cuántas herramientas tienen fallos abiertos. */
  fallosAbiertos: number;
}

/** Deriva de la señal el estado real del turno (puro, sin efectos). */
export function construirContextoProgreso(señal: {
  plan?: TareaPlan[];
  paso?: number;
  maxPasos?: number;
  historialBucle?: { nombre: string; ok: boolean }[];
  fallosPorHerramienta?: Record<string, number>;
}): ContextoProgreso {
  const plan = señal.plan ?? [];
  const total = plan.length;
  const hechas = plan.filter((t) => t.status === "done").length;
  const paso = Math.max(0, Number(señal.paso) || 0);
  const maxPasos = Math.max(1, Number(señal.maxPasos) || PASOS_BASE);
  const restantes = Math.max(0, maxPasos - paso);
  const hist = señal.historialBucle ?? [];
  const usadas: string[] = [];
  for (const h of hist) if (h?.nombre && !usadas.includes(h.nombre)) usadas.push(h.nombre);
  const mutoAlgo = hist.some((h) => h.ok && HERRAMIENTAS_MUTANTES.has(h.nombre));
  const fallidas = Object.entries(señal.fallosPorHerramienta ?? {})
    .filter(([, n]) => (Number(n) || 0) > 0)
    .map(([k]) => k);
  return {
    paso,
    maxPasos,
    restantes,
    hechas,
    total,
    herramientasUsadas: usadas,
    herramientasFallidas: fallidas,
    soloObservo: usadas.length > 0 && !mutoAlgo,
    fallosAbiertos: fallidas.length,
  };
}

/**
 * Línea de contexto para el modelo: dónde está parado y qué ya intentó. Vacía
 * cuando no hay nada que informar (turno sin plan ni historial): cero regresión.
 */
export function resumenDeProgreso(ctx: ContextoProgreso): string {
  const partes: string[] = [];
  partes.push(`vas por el paso ${ctx.paso + 1} de ${ctx.maxPasos} (quedan ${ctx.restantes})`);
  if (ctx.total > 0) partes.push(`plan ${ctx.hechas}/${ctx.total} cerradas`);
  if (ctx.herramientasUsadas.length > 0)
    partes.push(
      `ya usaste: ${ctx.herramientasUsadas.join(", ")} — no repitas lo que ya hiciste, apoyate en lo que ya leíste en vez de volver a pedirlo`
    );
  if (ctx.herramientasFallidas.length > 0)
    partes.push(`vienen fallando: ${ctx.herramientasFallidas.join(", ")} — no insistas por el mismo camino`);
  if (partes.length === 0) return "";
  return "CONTEXTO DEL TURNO: " + partes.join("; ") + ".";
}

/**
 * ESTANCAMIENTO: varios pasos observando (solo lectura) sin producir obra ni
 * cerrar el objetivo. No aplica a reparar (ahí manda la escalera). Devuelve ""
 * si no hay estancamiento. A propósito NO nombra los peldaños de reparación:
 * no es un fallo, es un empujón a dejar de mirar y empezar a construir.
 */
export function señalDeEstancamiento(ctx: ContextoProgreso, fase: FaseBucle): string {
  if (fase === "reparar") return "";
  if (ctx.paso < UMBRAL_ESTANCAMIENTO) return "";
  if (!ctx.soloObservo) return "";
  return (
    "ESTANCAMIENTO DETECTADO: llevás varios pasos observando (solo lecturas) sin producir nada. " +
    "Ya tenés contexto suficiente: tu PRÓXIMO paso debe PRODUCIR obra real —write_file, edit_file, make_dir o run_command— " +
    "no otra lectura. Dejá de explorar y empezá a construir."
  );
}

/**
 * Techo de pasos dinámico: un plan de 12 tareas no termina en 10 pasos. Crece
 * con el plan pero choca contra `PASOS_TOPE`, que es la frontera dura.
 *
 * v1.16.3.1 — PRESUPUESTO DE REPARACIÓN: cada herramienta con fallos abiertos
 * compra hasta 2 pasos extra (máximo 6). POR QUÉ: sin fallos, el techo viejo
 * cortaba el turno justo cuando empezaba la escalera de reparación — o sea,
 * el bucle abandonaba la obra en el momento más delicado y le devolvía la
 * tarea al usuario. Con presupuesto, reparar cuesta pasos PERO tiene con qué
 * subir la escalera completa (1+2+3). Y sigue topado: nunca es infinito.
 */
/** Base HISTÓRICA del techo (el `maxSteps` original de v1.16.0 = 10). Es el
 *  piso de la función pura cuando nadie pasa una base; el servidor SIEMPRE pasa
 *  `PASOS_BASE` (16, v1.0.14) de forma explícita, así que subir la base real no
 *  depende de este default. */
export const PASOS_BASE_HISTORICO = 10;
export function techoDePasos(tareasAbiertas: number, base = PASOS_BASE_HISTORICO, tope = PASOS_TOPE, fallosAbiertos = 0): number {
  const presupuestoReparacion = Math.min(6, Math.max(0, fallosAbiertos) * 2);
  return Math.min(tope, base + Math.max(0, tareasAbiertas) * PASOS_POR_TAREA + presupuestoReparacion);
}

/**
 * ¿Esta respuesta es una parada a mitad? Devuelve el motivo (para el log del
 * tablero) o null si el modelo efectivamente cerró.
 *
 * El orden importa: el plan sin cerrar manda sobre cualquier prosa de cierre,
 * porque un modelo que dice «listo» con tareas pendientes MINTIÓ, y el bucle no
 * puede premiar la mentira con el fin del turno.
 */
export function motivoDeParada(contenido: string, pendientes: TareaPlan[]): string | null {
  // v1.0.14 · CUESTIONARIO DE OPCIONES: una pregunta con opciones concretas es un
  // DIALOGO legítimo (el modelo le pide al usuario elegir la próxima tarea), NO un
  // corte ni una "parada". Por eso NO se la trata como "quedan tareas sin cerrar"
  // ni se re-empuja: se pausa el bucle y se espera la elección del usuario.
  if (esPreguntaDeOpciones(String(contenido ?? ""))) return null;
  if (pendientes.length > 0) return `quedan ${pendientes.length} tarea(s) del plan sin cerrar`;
  const c = String(contenido ?? "").trim();
  if (c === "") return "respuesta vacía sin herramienta";
  if (RE_PIDE_PERMISO.test(c)) return "pidió permiso para seguir";
  if (RE_CORTE.test(c)) return "el texto se corta a mitad de frase";
  if (RE_INTENCION.test(c) && !RE_CIERRE.test(c)) return "anuncia una intención y no la ejecuta";
  if (RE_ANUNCIO_ESTRUCTURAL.test(c) && !RE_CIERRE.test(c)) return "narró encabezados o un plan y no ejecutó ninguna herramienta";
  // v1.70.5 · REGLA DE COLA — «le tuve que decir SIGUE muchas veces» (sesión
  // exportada 1792864959285, glm-4.5-flash probando herramientas). El detector
  // de arriba exige que NO haya ninguna palabra de cierre en TODO el texto;
  // pero una tarea de verificación escribe «funciona ✓», «creado», «hecho»
  // LEGITIMAMENTE en el cuerpo y encima termina con «Voy a continuar con la
  // prueba de X. Primero, revisaré…» — el cierre del medio cegaba al detector,
  // no había re-empuje y el turno moría ahí. La cola manda: si la ÚLTIMA
  // frase es promesa de trabajo sin cierre propio, el turno está cortado a
  // mitad de tarea sin importar cuántos «funciona» haya dicho antes.
  if (anunciaAlFinal(c)) return "cierra el turno anunciando el próximo paso (regla de cola)";
  return null;
}

/** La última oración con contenido (los modelos rematan con promesas ahí). */
function ultimaOracionDe(c: string): string {
  const partes = c.split(/(?<=[.!?…])\s+/);
  for (let i = partes.length - 1; i >= 0; i--) {
    const s = partes[i].trim();
    if (s) return s;
  }
  return c;
}

/**
 * v1.70.5 · La regla de cola, expuesta pura para que la testee Ouroboros sin
 * depender del motivo. True solo cuando la última frase PROMETE trabajo
   * futuro y ese tramo final no se declara cerrado: «Listo, el sandbox
 * funciona. Voy a continuar con MCP.» → promete; «Listo: probé todo y
 * funciona.» → cierra de verdad y no molesta.
 */
export function anunciaAlFinal(c: string): boolean {
  const ult = ultimaOracionDe(String(c ?? ""));
  if (!ult) return false;
  // Trampa medida acá mismo, en el test: `\b` de JS es SOLO ASCII, y verbos
  // como «revisaré» terminan en «é» (no-`\w`) — el `\b` final jamás se cumple
  // y la regla de cola nacía ciega para justo las promesas más comunes.
  // Se prueba también la versión sin acentos: las alternativas ya traen las
  // variantes «revisare/continuare/...», así que desacentuarlas las vuelve
  // alcanzables sin tocar las regex que otros detectores comparten.
  const sinAcentos = ult.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const promete = RE_INTENCION.test(ult) || RE_INTENCION.test(sinAcentos);
  const cerrada = RE_CIERRE.test(ult) || RE_CIERRE.test(sinAcentos);
  return promete && !cerrada;
}

/**
 * v1.48.0 — AUTOCONCIENCIA ANTES DE CREAR. Las tres leyes del arranque
 * consciente, redactadas para el modelo: COMPRENDER el pedido, ANALIZAR lo que
 * ya existe y PLANIFICAR antes de tocar disco. Solo aplica a crear/modificar:
 * en REPARAR manda la escalera, no esta checklist (por eso devuelve "" ahí, y
 * por eso aquí no se nombra ningún escalón — no es reparación). Pura y sin
 * promesas: no corre nada, solo ordena el pensamiento del turno.
 */
export function directivaDeComprension(fase: FaseBucle): string {
  if (fase === "reparar") return "";
  return (
    "AUTOCONCIENCIA DE LA TAREA — antes de crear, razoná breve y en voz alta estas tres leyes: " +
    "1) COMPRENSIÓN DEL TRABAJO — reformulá en una línea qué pide DE VERDAD el objetivo y qué cuenta como «terminado»; " +
    "2) ANÁLISIS DE LO EXISTENTE — mirá lo que YA hay con read_file y list_dir ANTES de escribir, para no duplicar ni pisar lo que funciona; " +
    "3) PLAN MÍNIMO — enumerá los pasos justos y por cuál empezás. Recién con las tres resueltas, creá."
  );
}

/**
 * v1.48.0 — REVISAR PARA VALIDAR EL PROYECTO. La puerta previa al «listo»: el
 * turno se revisa a sí mismo (relee lo que tocó) y VALIDA el proyecto con la
 * única orden del veredicto. Si la validación falla, se arregla ESE error antes
 * de cerrar — no se canta terminado sobre obra sin revisar.
 */
export function directivaDeValidacion(): string {
  return (
    "REVISAR PARA VALIDAR — antes de cerrar: 1) revisá tu propia obra con revisar_cambios (releé lo que modificaste); " +
    "2) VALIDÁ el proyecto con run_tests o run_command «npm run validar»; " +
    "3) si la validación se pone roja, arreglá ESE fallo exacto y volvé a validar. No se cierra sobre obra sin revisar."
  );
}

/** La directiva que se le manda al modelo para que siga, sin preguntarle nada al usuario. */
export function directivaDeContinuacion(
  pendientes: TareaPlan[],
  ultimoFallo?: UltimoFallo | null,
  fase: FaseBucle = "crear",
  escalon = 0,
  contexto = ""
): string {
  const partes: string[] = [
    // v1.52.1 — ACCIÓN PRIMERO. Un modelo débil (glm-4.5-flash) tiende a NARRAR
    // la checklist en vez de ACTUAR: escribe los encabezados y frena. Esta orden
    // va al frente, en imperativo duro, para que el único re-empuje del turno sea
    // decisivo — el próximo mensaje debe ser una herramienta, no prosa.
    "ACCIÓN AHORA: tu PRÓXIMO mensaje debe ser una llamada a herramienta real (read_file, list_dir, write_file, edit_file o run_command), NO texto suelto, NO encabezados, NO un plan escrito. Podés pensar una línea si hace falta, pero esa misma respuesta tiene que EJECUTAR una herramienta.",
    "No te detengas a mitad de la tarea.",
  ];
  // v1.56.5 — MÁS CONTEXTO: antes que nada, el modelo sabe DÓNDE está parado y
  // qué ya intentó. Solo se inserta si el juez armó un contexto (sin él, la
  // directiva es byte-idéntica a la de antes — cero regresión).
  if (contexto) partes.push(contexto);
  // v1.16.3.1 — el bucle dice en QUÉ fase está y, si es reparación, CON QUÉ
  // escalón de la escalera. Un «seguí» sin fase mandaba al modelo a repetir el
  // mismo camino que ya había fallado; la escalera ordena cambiar de método.
  partes.push(`FASE DEL TURNO: ${fase.toUpperCase()}.`);
  if (fase === "reparar") {
    partes.push(directivaDeReparacion(escalon));
  } else {
    // v1.48.0 — en crear/modificar el turno arranca con la checklist de
    // autoconciencia (comprensión → análisis → plan) antes de tocar disco.
    const comp = directivaDeComprension(fase);
    if (comp) partes.push(comp);
  }
  if (pendientes.length > 0) {
    partes.push(
      `Tareas abiertas: ${pendientes.map((t) => `${t.id}=${t.description}`).join(" · ")}.`
    );
  } else {
    partes.push("Todavía no cerraste el objetivo: ejecutá el paso que sigue.");
  }
  partes.push(
    "EJECUTÁ ahora con las herramientas disponibles (read_file, write_file, edit_file, run_command…)."
  );
  partes.push(
    "No pidas permiso ni confirmes lo obvio: el destino ya está definido por el pedido original."
  );
  partes.push(
    ultimoFallo
      ? `«${ultimoFallo.herramienta}» falló: ${ultimoFallo.error.slice(0, 160)}. No esperes instrucciones ni le devuelvas la tarea al usuario: tomá otro camino —otra herramienta, otra ruta, creá el archivo o la carpeta que falta, ajustá el comando— y volvé a intentar.`
      : "Si un camino no sale, no lo repitas igual: cambiá de herramienta, de ruta o de enfoque y seguí."
  );
  // v1.48.0 — en crear/modificar, la revisión+validación del proyecto es la
  // puerta previa al cierre (en reparar ya manda la escalera de reparación).
  if (fase !== "reparar") partes.push(directivaDeValidacion());
  partes.push("Cerrá con «listo» solo cuando no quede ninguna tarea abierta.");
  return partes.join(" ");
}

/** Tope de re-empujes por «anuncio sin acción» en un mismo turno (nube). */
export const MAX_REEMPUJES_ANUNCIO = 3;

/**
 * v1.55.1 — RE-EMPUJE ESCALADO (anti-trancado de nube).
 * ─────────────────────────────────────────────────────
 * RAÍZ (captura de Mario, `glm-4.5-flash` en «Agente PC ON»): el modelo dice
 * «Voy a analizar… exploremos la estructura del proyecto» y FRENA sin llamar
 * ninguna herramienta. El turno terminaba mostrando esa promesa y el chat se
 * quedaba esperando a que el usuario escribiera «¿qué pasa?» para re-arrancar.
 *
 * v1.46.4 ya re-empujaba, pero UNA sola vez: si el modelo débil volvía a narrar
 * su intención, el único cartucho ya estaba gastado y el turno moría. Ahora el
 * mismo turno se re-empuja hasta `MAX_REEMPUJES_ANUNCIO` veces, SUBIENDO el tono
 * en cada intento, y en el último exige ENTREGAR la respuesta YA —sin anuncios—
 * para que el chat NUNCA quede colgado de una promesa. Es acotado y determinista
 * (nunca es un bucle infinito): agotados los re-empujes, el turno cierra con lo
 * que haya, pero habiendo insistido de verdad y no una sola vez.
 *
 * JUSTIFICACIÓN DEL TOPE = 3 (no silencioso): con 1 (v1.46.4) un modelo flojo se
 * escapaba narrando dos veces; con 2 reintentos reales + 1 ultimátum de entrega
 * se cubre el caso medido sin regalar latencia ni arriesgar un turno interminable.
 *
 * @param intento 0-based: 0 = primer re-empuje … `MAX_REEMPUJES_ANUNCIO - 1` = último.
 */
export function directivaDeReanudacion(intento: number): string {
  const base = directivaDeContinuacion([], null);
  if (intento <= 0) return base;
  if (intento < MAX_REEMPUJES_ANUNCIO - 1) {
    return (
      "SEGUNDO AVISO — ya anunciaste una acción y NO la ejecutaste. Basta de narrar: " +
      "tu PRÓXIMO mensaje DEBE ser una llamada a herramienta real (list_dir, read_file, " +
      "write_file, edit_file o run_command) sobre el objetivo del pedido. Nada de «voy a…», " +
      "nada de encabezados ni pasos escritos: ejecutalos. " + base
    );
  }
  // Último intento: si de verdad no vas a usar herramientas, al menos NO dejes al
  // usuario colgado de una promesa. Entregá el contenido en este mismo mensaje.
  return (
    "ÚLTIMO AVISO — ya se te pidió actuar y seguís anunciando sin hacer. Elegí UN camino en " +
    "ESTE mismo mensaje: (A) llamá a una herramienta real AHORA (list_dir / read_file / …) sobre " +
    "el objetivo; o (B) si no vas a usar herramientas, ENTREGÁ YA la respuesta completa y útil en " +
    "texto —el análisis, el código o la explicación que prometiste— SIN frases de intención " +
    "(«voy a», «exploremos», «a continuación», «primero»). Lo único prohibido es volver a anunciar " +
    "y frenar: el usuario no debería tener que preguntarte «¿qué pasa?» para que sigas."
  );
}

/**
 * Informe honesto de cierre. Si quedó algo abierto, lo dice: el bucle ya no
 * puede responder «Completado» con tareas colgando.
 */
/**
 * v1.56.8 — EL CIERRE CUANDO LA INTENCIÓN NUNCA SE EJECUTÓ.
 * `informeHonesto` necesita un plan con tareas abiertas; el caso que se escapaba
 * es el turno SIN plan: el modelo narró «voy a revisar…», gastó los re-empujes y
 * el bucle cerraba devolviendo `ok:true` porque ALGO se emitió. El usuario veía un
 * párrafo que termina en dos puntos y ninguna explicación — y tenía que volver a
 * preguntar para que la tarea continuara. Este aviso convierte ese callejón
 * silencioso en un cierre que dice qué faltó y qué hacer.
 * Devuelve "" cuando no hay motivo: no se queja de los turnos que sí cerraron.
 */
export function cierreIntencionSinEjecutar(reempujes: number, motivo: string | null): string {
  if (!motivo) return "";
  const insistencia =
    reempujes > 0
      ? `Insistí ${reempujes === 1 ? "1 vez" : `${reempujes} veces`} con la directiva de acción y el modelo respondió con texto, no con herramientas.`
      : "El modelo respondió con texto en lugar de ejecutar una herramienta.";
  return (
    `\n\n⚠️ TAREA SIN TERMINAR — ${motivo}. ${insistencia}\n` +
    `No doy esto por hecho porque no lo ejecuté. Decime «seguí» para reintentar, ` +
    `o cambiá de modelo si se repite: los modelos pequeños suelen narrar el paso en vez de llamar a la herramienta.`
  );
}

export function informeHonesto(pendientes: TareaPlan[], agotados: boolean): string {
  if (pendientes.length === 0) return "";
  const cab = agotados
    ? `⚠️ Se agotó el techo de pasos del bucle y quedan ${pendientes.length} tarea(s) abiertas:`
    : `Quedan ${pendientes.length} tarea(s) abiertas:`;
  return `${cab}\n${pendientes.map((t) => `- ${t.id}: ${t.description}`).join("\n")}`;
}

/**
 * LA DECISIÓN. El bucle llama esto cuando el modelo responde sin herramienta.
 * Nota de diseño: `paso >= maxPasos - 1` es el único caso donde se corta aun
 * habiendo pendientes — y ahí se informa, no se finge.
 *
 * v1.31.0 — la firma del fallo se registra y se cuenta ACÁ DENTRO: el escalón
 * es el mayor entre «cuánto insistió cada herramienta» y «cuántas veces volvió
 * la misma firma». Con ≥2 la repetición FUERZA el peldaño 2 de la escalera;
 * con ≥5 el motor se BLOQUEA solo y entrega el acta honesta (causa raíz,
 * estrategias gastadas, decisión pedida). El modelo no decide su propio
 * escalón: lo hereda del motor.
 */
export function decidirBucle(señal: SeñalBucle): Decision {
  const pendientes = tareasPendientes(señal.plan);
  const fase = faseDelTurno(señal);
  // v1.56.5 — el contexto del turno se arma UNA vez y viaja en las directivas.
  const ctx = construirContextoProgreso(señal);

  // v1.31.0 · FIRMA→ESCALERA: el juez registra el fallo y lo analiza antes de decidir.
  let analisis: AnalisisBucle | null = null;
  if (señal.ultimoFallo?.error) {
    const clave = registrarFalloFirma(señal.ultimoFallo.error);
    analisis = analizarBucle(historialDeFirmas(clave), UMBRAL_FIRMA.bucle);
  }
  const escalonPorFallos = escalonDeReparacion(totalFallos(señal.fallosPorHerramienta));
  const escalonPorFirma = analisis?.enBucle ? peldanoPorRepeticiones(analisis.repeticiones) : 0;
  const escalon = Math.max(escalonPorFallos, escalonPorFirma);

  // v1.32.0 · PRESUPUESTO: si la firma forzó peldaño, la tarea en curso gasta
  // una iteración del contrato; agotado, el replan se pide solo (§20/§21).
  if (señal.ultimoFallo?.error && escalonPorFirma >= 2) consumirIntentoContrato();

  if (señal.paso >= señal.maxPasos - 1) {
    return {
      accion: "cerrar",
      motivo: "techo de pasos alcanzado",
      informe: informeHonesto(pendientes, true) + (estadoContrato().abierto ? `\n${contratoAParte()}` : ""),
    };
  }
  // Nivel 4 de la escalera (§5): la firma volvió tantas veces que ningún
  // peldaño cede. BLOQUEADO no es rendirse: es exigir decisión humana con
  // evidencia, en vez de gastar otro turno en el mismo flip-flop.
  if (analisis?.enBucle && analisis.repeticiones >= UMBRAL_FIRMA.bloquear && señal.ultimoFallo) {
    const diag = diagnosticoRaiz(analisis.clase, analisis.ultimo.modulo);
    return {
      accion: "cerrar",
      motivo: `BLOQUEADO: firma «${analisis.firma}» repetida ${analisis.repeticiones} veces`,
      informe: [
        "🛑 BLOQUEADO por repetición — no es un «listo», es un alto honesto.",
        `Causa raíz: ${diag.causa}`,
        `Anti-patrón: ${diag.noHagas}`,
        `Estrategias ya gastadas por la escalera: cambiar de camino → diagnosticar y retroceder → reconstruir lo mínimo.`,
        `Evidencia: la firma «${analisis.firma}» apareció ${analisis.repeticiones} veces (herramienta: ${señal.ultimoFallo.herramienta}).`,
        pendientes.length > 0 ? `Tareas abiertas: ${pendientes.map((t) => `${t.id}: ${t.description}`).join(" · ")}` : "",
        `Decisión requerida (humano): ${diag.arreglos[0]}`,
      ].filter(Boolean).join("\n"),
    };
  }
  // Un fallo SIN resolver no cierra el turno aunque la prosa lo pinte como
  // final: primero se prueba por otro camino. Es el corazón del pedido
  // «si falla, seguir con la solución, no esperar a que digan continúa».
  if (señal.ultimoFallo) {
    return {
      accion: "continuar",
      motivo: analisis?.enBucle
        ? `última herramienta falló (${señal.ultimoFallo.herramienta}) · firma repetida ${analisis.repeticiones}× — escalón forzado a ${escalon}`
        : `última herramienta falló (${señal.ultimoFallo.herramienta})`,
      directiva:
        directivaDeContinuacion(pendientes, señal.ultimoFallo, "reparar", escalon, resumenDeProgreso(ctx)) +
        (analisis?.enBucle ? ` ${directrizReconocimiento(analisis).directiva}` : "") +
        // v1.33.0 · CONTROL DE RAZONAMIENTO: el motor añade la SECUENCIA del
        // próximo movimiento (§6) y sus prohibiciones — no es sugerencia del
        // modelo, es orden del controlador leída del error clasificado.
        (() => { const m = decidirProxima({ error: señal.ultimoFallo!.error, escalon, contratoAbierto: estadoContrato().abierto }); return m ? " " + directivaDeMovimiento(m) : ""; })(),
      fase: "reparar",
      escalon,
    };
  }
  const motivo = motivoDeParada(señal.contenido, pendientes);
  if (motivo) {
    // v1.56.5 — contexto del turno + aviso de estancamiento (si lo hay) van en
    // la directiva para que el modelo sepa dónde está y deje de dar vueltas.
    const contexto = [resumenDeProgreso(ctx), señalDeEstancamiento(ctx, fase)]
      .filter(Boolean)
      .join(" ");
    return {
      accion: "continuar",
      motivo,
      directiva: directivaDeContinuacion(pendientes, señal.ultimoFallo, fase, escalon, contexto),
      fase,
      escalon,
    };
  }
  // v1.32.0 · LA PUERTA DE ACEPTACIÓN: «terminado» no lo dicta la prosa — si el
  // contrato de criterios está abierto (sin evidencia o presupuesto agotado),
  // el turno NO cierra: el motor devuelve la lista exacta de lo que falta.
  const contrato = estadoContrato();
  if (contrato.abierto) {
    return {
      accion: "continuar",
      motivo: `contrato de aceptación abierto (${contrato.pendientes.length} tarea(s) sin verificar${contrato.agotados.length ? `, ${contrato.agotados.length} con presupuesto agotado` : ""})`,
      directiva: directivaDeContratoAbierto(contrato),
      fase,
      escalon,
    };
  }
  // v1.49.0 · FASE 2 — EL FISCAL DEL ÚLTIMO METRO. Antes de imprimir cualquier
  // cierre, se consulta su dictamen (si el servidor lo adjuntó). Es la última
  // puerta: ni la prosa, ni el plan vacío, ni el contrato cerrado alcanzan para
  // dar algo por «hecho» si una casilla sigue roja.
  if (señal.fiscal && señal.fiscal.veredicto === "RECHAZADO") {
    const f = señal.fiscal;
    // Escalera agotada (§5): la misma casilla no cede → BLOQUEADO honesto.
    if (f.bloqueo) {
      return {
        accion: "cerrar",
        motivo: `BLOQUEADO por el fiscal: la casilla «${f.casillaBloqueada}» no cede (roja ${f.rechazosConsecutivos}\u00d7)`,
        informe: actaBloqueoFiscal(f),
      };
    }
    // Rechazo normal: vuelve al bucle con el log del §4 como directiva de reparación.
    return {
      accion: "continuar",
      motivo: `el fiscal RECHAZÓ el cierre (${f.rojas.length} casilla(s) roja(s): ${f.rojas.map((r) => r.casilla).join(", ")})`,
      directiva:
        "\u2696\ufe0f FISCAL — el cierre no procede hasta que estas casillas pasen a verde:\n" +
        f.log +
        "\nNo insistas con la misma: repar\u00e1 lo se\u00f1alado o, si no cede, cambi\u00e1 de camino.",
      fase: "reparar",
      escalon,
    };
  }
  return {
    accion: "cerrar",
    motivo: "el modelo cerró sin tareas abiertas",
    informe:
      informeHonesto(pendientes, false) +
      (contrato.total > 0 ? `\n${contratoAParte()}` : "") +
      (señal.fiscal ? `\n${coberturaAParte(señal.fiscal)}` : ""),
  };
}

// ── v1.57.11 · LA PRÓRROGA CON EVIDENCIA: el techo no abandona la obra a mitad ─
// RAÍZ (sesión exportada del 14/10, primer mensaje): «Se agotó el techo de pasos
// del bucle y quedan 3 tarea(s) abiertas». El informe fue honesto — la casa lo
// exige — pero el trabajo quedó COLONIZADO a 2/3 y el usuario tuvo que escribir
// «continúa» para que el motor siguiera con LO SUYO. v1.16.0 prometió «no se
// detiene a mitad de tarea»; el techo duro era la única forma en que se seguía
// deteniendo. Ahora, cuando el techo está por caer, el juez pregunta una sola
// cosa al disco: ¿hubo OBRA NUEVA VERIFICADA desde el último techo? Si la hubo,
// el turno recibe UNA prórroga acotada (PRORROGA_PASOS pasos, jamás más allá de
// PASOS_TOPE) condicionada a cerrar SOLO lo nombrado. Si no la hubo —el modelo
// daba vueltas sin producir— el techo cae como siempre y el informe honesto
// manda: seguir empujando sin progreso sería la otra mitad de la mentira.

/** Pasos extra de la única prórroga posible por turno. */
export const PRORROGA_PASOS = 6;
/** Prórrogas por turno. Más de una es un bucle con nombre lindo. */
export const MAX_PRORROGAS_TECHO = 1;

export function directivaDeProrroga(pendientes: TareaPlan[], pasos: number, topeNuevo: number): string {
  return (
    `PRÓRROGA DEL BUCLE — el techo de pasos te caía encima, pero el MOTOR contó obra nueva verificada en disco y ` +
    `no abandona la tarea a mitad: tenés ${pasos} pasos más (tope ${topeNuevo}, prórroga ÚNICA de este turno). ` +
    `No es cheque en blanco: usá cada paso en cerrar SOLO las tareas abiertas que siguen, de a una, y verificá ` +
    `cada escritura con read_file antes de cantarla. Si un paso no produce obra ni evidencia, NO lo gastes: ` +
    `entregá el informe honesto de lo que falta. Tareas abiertas: ${pendientes.map((t) => `${t.id}=${t.description}`).join(" · ")}.`
  );
}

/**
 * ¿Corre la prórroga? TODAS las condiciones, en seco:
 *   · hay tareas abiertas (sin pendientes no hay nada que prorrogar);
 *   · el techo está exactamente cayendo (paso >= maxPasos - 1);
 *   · todavía no se gastó la única prórroga del turno;
 *   · el techo ampliado NO pasa de PASOS_TOPE (la frontera dura sigue dura);
 *   · hay EVIDENCIA: los bytes verificados en disco crecieron respecto del último techo.
 * Sin señal rica (campos ausentes) devuelve null: cero regresión con los viejos cables.
 */
export function concederProrrogaTecho(a: {
  pendientes: TareaPlan[];
  paso: number;
  maxPasos: number;
  obraBytes?: number;
  ultimaObraBytes?: number;
  prorrogasUsadas?: number;
}): { nuevoTope: number; directiva: string } | null {
  if (!a || !Array.isArray(a.pendientes) || a.pendientes.length === 0) return null;
  if (a.paso < a.maxPasos - 1) return null;
  if ((Number(a.prorrogasUsadas) || 0) >= MAX_PRORROGAS_TECHO) return null;
  if (a.maxPasos >= PASOS_TOPE) return null;
  const obra = Number(a.obraBytes) || 0;
  const antes = Number(a.ultimaObraBytes) || 0;
  if (!(obra > antes)) return null;
  const nuevoTope = Math.min(PASOS_TOPE, a.maxPasos + PRORROGA_PASOS);
  if (nuevoTope <= a.maxPasos) return null;
  return { nuevoTope, directiva: directivaDeProrroga(a.pendientes, nuevoTope - a.maxPasos, nuevoTope) };
}
