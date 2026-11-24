/**
 * presionEquipo.ts · CUÁNDO LA INTERFAZ TIENE QUE ALIGERARSE (v1.99.8)
 * ===================================================================
 * El origen es una corrección de Mario (1/11): «**tengo 16 ram**». La barra tenía un chip que
 * decía «8 GB» — y no era una lectura, era el NOMBRE de un modo. En una máquina de 16 GB ese chip
 * se lee como un diagnóstico falso del equipo, y lo peor: el modo `"auto"` no hacía nada, así que
 * nadie aliviaba nada en el equipo que sí lo necesitaba.
 *
 * Acá vive el criterio, y nada más. La lectura real de RAM la trae el server (`os.totalmem()`,
 * server.ts:1782) por `/api/sistema/estado` → `systemStats.machine.totalRamMb`. Este módulo recibe
 * ese número y decide.
 *
 * TRES REGLAS, en orden:
 *   1. La palabra del usuario manda sobre la medición. Si eligió liviano, liviano —aunque tenga
 *      64 GB (puede estar corriendo otra cosa, y eso él lo sabe y el totalmem no).
 *   2. Sin elección, se mide: liviano sólo si el equipo está en el umbral de poca RAM. El umbral
 *      NO se re-inventa acá: es `RAM_LIMITADA_GB`, el mismo que usa la escalera de residencia de
 *      Ollama en `modelTiers.ts`. Dos umbrales distintos para la misma palabra sería otra vez
 *      «dos dueños para una verdad».
 *   3. Sin lectura, NO se aligera. La ausencia de dato no es evidencia de un equipo pobre: es
 *      ausencia (la misma distinción que el reflejo del cerebro aprendió en v1.99.4).
 *
 * El valor persistido sigue siendo `"8gb"` a propósito: es el selector CSS
 * `html[data-perf-mode="8gb"]` y la clave de `localStorage` que ya existen. Cambiar la PALABRA que
 * ve el usuario no exige romper el historial de nadie ni reescribir la hoja de estilos.
 *
 * Puro: sin fs, sin red, sin reloj, sin DOM.
 */

import { RAM_LIMITADA_GB } from "./modelTiers";

export type ModoPerf = "auto" | "8gb" | "pleno";

/** Los tres estados que acepta la preferencia, en el orden del ciclo del chip. */
export const CICLO_PERF: ModoPerf[] = ["auto", "8gb", "pleno"];

/** Normaliza lo que hay en `localStorage`: cualquier cosa desconocida vuelve a `auto`. */
export function normalizarModoPreferido(valor: unknown): ModoPerf {
  return valor === "8gb" || valor === "pleno" ? valor : "auto";
}

export interface DecisiónPerf {
  /** Lo que se aplica (y lo que escribe el atributo `data-perf-mode`). */
  modo: ModoPerf;
  /** Por qué: para que la interfaz pueda decir la verdad en el tooltip. */
  fuente: "usuario" | "medido" | "sin-dato";
  /** Si la máquina entra en el escalón de poca RAM. Con 16 GB: false, y se muestra. */
  equipoLimitado: boolean;
  /** GB redondeados de la máquina, o null si todavía no hay lectura. */
  totalGb: number | null;
  rotuloChip: string;
  tooltip: string;
}

/** El umbral de la casa, expuesto desde su dueño (`modelTiers`) para que la valla lo pueda batear. */
export const UMBRAL_RAM_LIMITADA_GB = RAM_LIMITADA_GB;

/** GB de la máquina a partir de los MB que reporta el server. `null` = sin lectura (no es cero). */
export function gbDeMaquina(totalRamMb?: number | null): number | null {
  const mb = Number(totalRamMb);
  if (!Number.isFinite(mb) || mb <= 0) return null;
  return Math.round(mb / 1024);
}

/** "16 GB" / "7 GB" / "sin lectura". Un rótulo que miente por omisión es peor que uno que miente. */
export function rotuloMemoria(totalRamMb?: number | null): string {
  const gb = gbDeMaquina(totalRamMb);
  return gb === null ? "sin lectura" : `${gb} GB`;
}

/**
 * LA DECISIÓN. Ver `DecisiónPerf` arriba para el orden de las reglas.
 */
export function decidirModoPerf(perfMode: ModoPerf | string | undefined, totalRamMb?: number | null): DecisiónPerf {
  const totalGb = gbDeMaquina(totalRamMb);
  const limitado = totalGb !== null && totalGb <= RAM_LIMITADA_GB;
  const elegido = normalizarModoPreferido(perfMode);

  // Tres estados y por qué existen los tres: sin `pleno`, un equipo de 8 GB que igual quiere el
  // desenfoque puesto no tenía cómo decirlo (el `auto` antigo tampoco aliviaba a nadie).
  let modo: ModoPerf;
  let fuente: DecisiónPerf["fuente"];
  if (elegido === "8gb") {
    modo = "8gb";
    fuente = "usuario";
  } else if (elegido === "pleno") {
    modo = "auto";
    fuente = "usuario";
  } else if (totalGb === null) {
    // Sin dato NO se aligera: la ausencia de lectura no es evidencia de un equipo pobre.
    modo = "auto";
    fuente = "sin-dato";
  } else {
    modo = limitado ? "8gb" : "auto";
    fuente = "medido";
  }

  const rotuloChip = elegido === "pleno" ? "Pleno" : elegido === "8gb" ? "Liviano" : modo === "8gb" ? "Liviano (auto)" : "Automático";
  const porQue =
    fuente === "usuario"
      ? elegido === "8gb"
        ? "lo fijaste en liviano vos"
        : "lo fijaste en pleno vos, aunque el equipo alcance menos"
      : fuente === "sin-dato"
        ? "todavía no hay lectura de la máquina: no se aligera por las dudas"
        : limitado
          ? `tu máquina tiene ${totalGb} GB (≤ ${RAM_LIMITADA_GB} GB: se quitan desenfoques y animaciones)`
          : `tu máquina tiene ${totalGb} GB: no hace falta aligerar`;

  return {
    modo,
    fuente,
    equipoLimitado: limitado,
    totalGb,
    rotuloChip,
    tooltip:
      `Modo liviano: apaga el desenfoque de paneles y las animaciones de fondo, que son lo más caro de repintar. ` +
      `Memoria de la máquina: ${rotuloMemoria(totalRamMb)} · umbral de equipo limitado: ${RAM_LIMITADA_GB} GB · ${porQue}.`,
  };
}

/**
 * El siguiente estado del chip: automático → liviano → pleno → automático. Tres porque hacen
 * falta tres: sin `pleno`, un equipo de 8 GB que igual quiere su desenfoque no tenía cómo
 * decirlo, y sin `auto` la medición nunca mandaba. Un interruptor de dos posiciones sobre una
 * decisión de tres posibles siempre deja a alguien mentido.
 */
export function siguientePerf(actual: unknown): ModoPerf {
  const i = CICLO_PERF.indexOf(normalizarModoPreferido(actual));
  return CICLO_PERF[(i + 1) % CICLO_PERF.length];
}

/** Lo que consume el efecto de `App.tsx`: el atributo que va al `<html>`, o null para quitarlo. */
export function atributoPerf(d: DecisiónPerf): "8gb" | null {
  return d.modo === "8gb" ? "8gb" : null;
}
