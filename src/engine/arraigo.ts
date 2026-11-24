/**
 * arraigo.ts · ECHAR AL ÍNDICE LO QUE EL MAPA YA SABE (v1.99.5)
 * =============================================================
 * Mario, 31/10: «inyectar razonamiento y parámetros, diferenciar entre el eje de todo y la
 * nada de algo, dale luz y reflejo iluminanos». El reflejo (v1.99.4) ya sabía MEDIR la
 * diferencia; lo que faltaba era el acto que la cambia: mientras `cerebro/` esté vacío el
 * índice no tiene dónde buscar y el espejo devuelve `nada` — que no es distancia cero al eje,
 * es ausencia.
 *
 * ESTE MÓDULO PLANIFICA, NO ESCRIBE. El que escribe es `cerebroOrgano.aprender` (dueño único
 * del alta: si la pieza ya está por tema+titulo, REFUERZA en vez de duplicar). Acá se decide
 * QUÉ entra, con qué tema, con qué ancla determinista y qué se omite. La regla que no se
 * negocia: una pieza cuyo ancla no existe en el disco NO se enraíza. El IDE no puede inventar
 * memoria con archivos que no están; eso sería justamente la nada disfrazada de eje.
 *
 * POR QUÉ EL ASIENTO ES DETERMINISTA: `aprender` inventaba el nombre del archivo con
 * `randomBytes(3)`, así que «el eje» nacía con un nombre distinto en cada máquina y en cada
 * reinstalación. Sin un asiento predecible el mapa no puede decir DÓNDE vive su pieza, y el
 * reflejo queda en `deuda` eterna aunque el vector esté escrito. La fórmula vive en
 * `nombreArchivo.ts` — una sola para el órgano que escribe y el plano que busca.
 *
 * Puro: ni `fs`, ni red, ni reloj. El único import de `cerebroOrgano` es de TIPO (se borra al
 * compilar), para que el plan se pueda probar en seco sobre el mismo formato del alta real.
 */

import {
  ejeDeTodo,
  semillaDeHemisferios,
  semillaDeLecciones,
  semillaDeRutas,
  type SemillaEntrada,
} from "./cerebroSemilla";
import { archivoDeEntrada } from "./nombreArchivo";
import type { EntradaNueva } from "./cerebroOrgano";

export type RaizSemilla = "app" | "datos";

/**
 * Techos declarados. El índice se vectoriza de a lotes de 12 en el turno: plantar 500 piezas de
 * golpe no es memoria, es una deuda que el usuario paga en cada turno. Las 22 piezas del mapa
 * (8 + 14) y 40 lecciones caben en dos pasadas del calentador.
 */
export const MAX_PIEZAS_ARRAIGO = 24;
export const MAX_LECCIONES_ARRAIGO = 40;
export const MAX_RUTAS_ARRAIGO = 40;
/** El tema bajo el cual el eje se planta: fijo, para que reenraizar no cree un eje paralelo. */
export const TITULO_EJE = "eje de todo";

/** Una pieza del mapa de hemisferios, con la mitad a la que pertenece. */
export interface PiezaMapa {
  hemisferio: "izquierdo" | "derecho";
  rel: string;
  que: string;
}

/** La mitad que se consulta: izquierdo = instalación, derecho = raíz de datos. */
export function raizDe(hemisferio: PiezaMapa["hemisferio"]): RaizSemilla {
  return hemisferio === "izquierdo" ? "app" : "datos";
}

/** La ancla determinista que `aprender` usa como sello del archivo. */
export function anclaDe(p: PiezaMapa): string {
  return `${p.hemisferio}-${p.rel}`;
}

/** Título del índice: nombra la pieza y su mitad, para que la ruta enrutada se entienda sola. */
export function tituloDe(p: PiezaMapa): string {
  return `hemisferio ${p.hemisferio} · ${p.rel}`;
}

/** El cuerpo plantado: qué es, dónde vive y en cuál de las dos raíces se lo busca. */
export function cuerpoDe(p: PiezaMapa): string {
  const raiz = raizDe(p.hemisferio);
  return (
    `${tituloDe(p)} — ${p.que}\n` +
    `Se busca en ${raiz === "app" ? "la instalacion (raiz de la app)" : "la raiz de datos (C:\\Cerebronico)"}: ${p.rel}\n` +
    "Mitad de ida y vuelta: la pieza existe en un hemisferio y se referencia desde el otro."
  );
}

/** Un hilo = la pieza dicha dos veces, una para el índice y otra para el reflejo. */
export interface HiloArraigo {
  semilla: SemillaEntrada;
  nueva: EntradaNueva;
  /** Dónde hay que mirar para saber si la pieza EXISTE (no si está vectorizada). */
  ancla: { rel: string; raiz: RaizSemilla };
}

export interface PlanArraigo {
  /** Lo que hay que pasarle a `aprender`, en orden (el eje SIEMPRE primero: es el origen). */
  nuevas: EntradaNueva[];
  /** TODAS las piezas del mapa, incluidas las omitidas: el reflejo mide la nada, no la esconde. */
  semilla: SemillaEntrada[];
  /** Lo que se quedó afuera y por qué. Se muestra: un silencio acá sería la mentira vieja. */
  omitidas: Array<{ id: string; motivo: string }>;
  /**
   * Los hilos completos. `semilla` y `nuevas` NO son paralelas por índice (una pieza omitida
   * suma a la medición y no suma al alta), así que quien necesite las dos caras de una misma
   * pieza —como el asiento real en el índice— tiene que venir por acá y no por posición.
   */
  hilos: HiloArraigo[];
}

/** El eje: se planta SIEMPRE, exista o no su ancla. Su texto se genera acá y da ORIGIN al espacio. */
function hiloEje(version: string): HiloArraigo {
  const e = ejeDeTodo(version);
  return {
    semilla: { ...e, raiz: "datos", asiento: archivoDeEntrada(e.tema, TITULO_EJE, "eje-0") },
    nueva: { tema: e.tema, titulo: TITULO_EJE, texto: e.texto, id: "eje-0", resumen: e.texto.slice(0, 160) },
    ancla: { rel: e.archivo, raiz: "datos" },
  };
}

function hiloPieza(p: PiezaMapa): HiloArraigo | null {
  const s = semillaDeHemisferios(p.hemisferio, [{ rel: p.rel, que: p.que }])[0];
  if (!s) return null;
  const titulo = tituloDe(p);
  const ancla = anclaDe(p);
  return {
    semilla: { ...s, raiz: raizDe(p.hemisferio), asiento: archivoDeEntrada(s.tema, titulo, ancla) },
    nueva: {
      tema: s.tema,
      titulo,
      texto: cuerpoDe(p),
      id: ancla,
      resumen: `${p.rel} · ${p.que}`.slice(0, 160),
    },
    ancla: { rel: p.rel, raiz: raizDe(p.hemisferio) },
  };
}

/** Una lección o una ruta del disco: entra textualmente, que es lo que el híbrido tiene que hallar. */
function hiloDocumento(s: SemillaEntrada, raiz: RaizSemilla): HiloArraigo {
  const titulo = s.texto.slice(0, 70);
  return {
    semilla: { ...s, raiz, asiento: archivoDeEntrada(s.tema, titulo, s.id) },
    nueva: { tema: s.tema, titulo, texto: s.texto, id: s.id, resumen: s.texto.slice(0, 160) },
    ancla: { rel: s.archivo, raiz },
  };
}

/**
 * LOS HILOS, tejidos una sola vez. `planDeArraigo` los filtra por existencia y el reflejo los
 * usa todos: así el plano y la medición no pueden divergir (que es exactamente el defecto que
 * encontramos el 1/11: el tablero decía «sano» con `cerebro/` vacío).
 */
export function hilosDeArraigo(o: {
  version: string;
  izquierdo: Array<{ rel: string; que: string }>;
  derecho: Array<{ rel: string; que: string }>;
  lecciones?: string[];
  rutas?: string[];
}): HiloArraigo[] {
  const hilos: HiloArraigo[] = [hiloEje(o.version)];
  const piezas: PiezaMapa[] = [
    ...(o.izquierdo || []).map((p) => ({ hemisferio: "izquierdo" as const, rel: p.rel, que: p.que })),
    ...(o.derecho || []).map((p) => ({ hemisferio: "derecho" as const, rel: p.rel, que: p.que })),
  ].slice(0, MAX_PIEZAS_ARRAIGO);
  for (const p of piezas) {
    const h = hiloPieza(p);
    if (h) hilos.push(h);
  }
  for (const s of (semillaDeLecciones(o.lecciones || []) || []).slice(0, MAX_LECCIONES_ARRAIGO)) hilos.push(hiloDocumento(s, "datos"));
  for (const s of (semillaDeRutas(o.rutas || []) || []).slice(0, MAX_RUTAS_ARRAIGO)) hilos.push(hiloDocumento(s, "datos"));
  return hilos;
}

/**
 * EL PLAN. `existe` viene de afuera (leer es fs): el plan no toca disco, pero necesita no
 * inventar. Omite por existencia, nunca por conveniencia, y lo dice.
 */
export function planDeArraigo(o: {
  version: string;
  izquierdo: Array<{ rel: string; que: string }>;
  derecho: Array<{ rel: string; que: string }>;
  lecciones?: string[];
  rutas?: string[];
  existe: (rel: string, raiz: RaizSemilla) => boolean;
}): PlanArraigo {
  const hilos = hilosDeArraigo(o);
  const nuevas: EntradaNueva[] = [];
  const semilla: SemillaEntrada[] = [];
  const omitidas: Array<{ id: string; motivo: string }> = [];
  let motivoDocumento = "";
  for (const h of hilos) {
    semilla.push(h.semilla);
    if (h.semilla.clase === "eje") {
      nuevas.push(h.nueva);
      continue;
    }
    // Las lecciones y las rutas comparten ancla: si LECCIONES.md no está, la primera lo dice y
    // el resto no repite el lamento (sería ruido con nombre de omisión).
    const mismoDocumento =
      (h.semilla.clase === "leccion" || h.semilla.clase === "ruta") && motivoDocumento === h.ancla.rel;
    if (mismoDocumento) {
      omitidas.push({ id: h.semilla.id, motivo: `omitida con el documento (${h.ancla.rel})` });
      continue;
    }
    if (!o.existe(h.ancla.rel, h.ancla.raiz)) {
      if (h.semilla.clase === "leccion" || h.semilla.clase === "ruta") motivoDocumento = h.ancla.rel;
      omitidas.push({
        id: h.semilla.id,
        motivo: `${h.ancla.rel} no existe en ${h.ancla.raiz === "app" ? "la instalacion" : "la raiz de datos"}`,
      });
      continue;
    }
    nuevas.push(h.nueva);
  }
  return { nuevas, semilla, omitidas, hilos };
}

/**
 * El asiento real, cuando el índice ya tenía la pieza con un nombre histórico (alta vieja, con
 * sello al azar). Se lo pregunta al índice en vez de suponerlo: si el archivo existe, el vector
 * vive ahí y el reflejo tiene que mirar ahí.
 */
export function sentarseEnIndice(plan: PlanArraigo, entradas: Array<{ tema: string; titulo: string; archivo: string }>): SemillaEntrada[] {
  return (plan.hilos || []).map((h) => {
    for (const e of entradas || []) {
      if (e && e.tema === h.nueva.tema && e.titulo === h.nueva.titulo && e.archivo) {
        return e.archivo === h.semilla.asiento ? h.semilla : { ...h.semilla, asiento: e.archivo };
      }
    }
    return h.semilla;
  });
}

/** Una línea honesta para el panel: cuántas entraron, cuántas se quedaron afuera y por qué. */
export function resumenDeArraigo(plantadas: number, omitidas: Array<{ id: string; motivo: string }>): string {
  const porQue = new Map<string, number>();
  for (const o of omitidas || []) porQue.set(o.motivo, (porQue.get(o.motivo) || 0) + 1);
  const afuera = [...porQue.entries()].map(([motivo, n]) => `${n} · ${motivo}`).join(" | ");
  return `${plantadas} pieza(s) en el indice${afuera ? ` · ${afuera}` : ""}`;
}
