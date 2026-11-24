/**
 * telemetriaRelevo.ts — EL RELEVO QUE SE PUEDE VER (v1.80.0 · FASE 1, punto 4)
 * ===========================================================================
 * QUÉ PIDE EL PLANO: «telemetría mínima (consola, no red): por sesión, cuántos
 * relevos, a qué proveedores, éxito/fallo. Es lo que después certifica que el
 * sistema se cura solo».
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN App.tsx: el conteo es la evidencia de la propiedad P1
 * («ninguna tarea termina en error sin que la IDE haya intentado relevo ella
 * misma»). Si el criterio vive en React, no se puede probar; si vive acá, la
 * suite lo congela y el panel solo pinta números.
 *
 * PUREZA: nada de estado global — la lista la tiene App en un `useRef` (una por
 * sesión) y este módulo la transforma. Sin red, sin reloj propio (el llamante
 * pasa el `momento`), sin localStorage.
 */
import { TOPE_RELEVOS, type IntentoRelevo } from "./relevoFavoritos";

export type MotivoRelevo = "turno-vacio" | "fallo-comunicacion" | "manual";
export type ResultadoRelevo = "pendiente" | "exito" | "fallo";

export interface RegistroRelevo {
  /** Etiqueta legible del momento (la hora la pone el llamante, no este módulo). */
  momento: string;
  desde: string;
  desdeProvider: string;
  a: string;
  aProvider: string;
  motivo: MotivoRelevo;
  resultado: ResultadoRelevo;
  /** Qué se informó al usuario (resumen corto, para auditoría). */
  nota?: string;
}

/** Registra un relevo sin mutar la lista anterior (React-friendly). */
export function registrarRelevo(
  lista: RegistroRelevo[],
  r: Omit<RegistroRelevo, "resultado"> & { resultado?: ResultadoRelevo }
): RegistroRelevo[] {
  return [...(lista || []), { ...r, resultado: r.resultado || "pendiente" }];
}

/**
 * Cierra el último relevo abierto con su resultado. Se cierra en éxito cuando
 * el turno entregó respuesta y en fallo cuando volvió a caer: así el conteo
 * «éxito/fallo» significa «el relevo sirvió» y no «se apretó el botón».
 */
export function cerrarRelevo(
  lista: RegistroRelevo[],
  resultado: ResultadoRelevo,
  nota?: string
): RegistroRelevo[] {
  const out = [...(lista || [])];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].resultado === "pendiente") {
      out[i] = { ...out[i], resultado, nota: nota ? String(nota).slice(0, 160) : out[i].nota };
      return out;
    }
  }
  return out;
}

export interface ResumenRelevo {
  total: number;
  exito: number;
  fallo: number;
  pendientes: number;
  /** Cuántas veces relevó CADA proveedor (el que hizo el trabajo, no el que cayó). */
  porProveedor: Record<string, { exito: number; fallo: number }>;
  /** Modelos que fueron llamado de relevo, en orden de aparición. */
  modelos: string[];
  /** Cuántas veces la cascada llegó al tope y hubo que informar. */
  informes: number;
}

export function resumenRelevo(lista: RegistroRelevo[]): ResumenRelevo {
  const r: ResumenRelevo = { total: 0, exito: 0, fallo: 0, pendientes: 0, porProveedor: {}, modelos: [], informes: 0 };
  for (const x of lista || []) {
    if (!x || !x.a) continue;
    r.total++;
    if (x.resultado === "exito") r.exito++;
    else if (x.resultado === "fallo") r.fallo++;
    else r.pendientes++;
    const hoja = (r.porProveedor[x.aProvider] = r.porProveedor[x.aProvider] || { exito: 0, fallo: 0 });
    if (x.resultado === "exito") hoja.exito++;
    if (x.resultado === "fallo") hoja.fallo++;
    if (!r.modelos.includes(x.a)) r.modelos.push(x.a);
  }
  return r;
}

/**
 * La línea que ve el usuario en la consola de la IDE. Corta, con números, sin
 * inventar porcentajes sobre una muestra de uno.
 */
export function lineaTelemetria(lista: RegistroRelevo[]): string {
  const r = resumenRelevo(lista);
  if (r.total === 0) return "Relevo: 0 activaciones en esta sesión.";
  const proveedores = Object.entries(r.porProveedor)
    .map(([p, v]) => `${p} (${v.exito}✓/${v.fallo}✗)`)
    .join(" · ");
  return `📈 RELEVO — sesión: ${r.total} activación(es), ${r.exito} con respuesta, ${r.fallo} sin respuesta${r.pendientes ? `, ${r.pendientes} en curso` : ""}. Relevó: ${proveedores || "—"}. Tope por mensaje: ${TOPE_RELEVOS}.`;
}

/** Los intentos que van al informe honesto, desde la traza de la sesión. */
export function intentosDesdeRegistros(lista: RegistroRelevo[]): IntentoRelevo[] {
  return (lista || []).map((x) => ({ provider: x.desdeProvider, modelId: x.desde, motivo: x.nota || x.motivo }));
}
