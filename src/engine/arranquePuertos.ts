export interface InventarioPuerto {
  puerto: number;
  vivo: boolean;
  /** Quién es, en una palabra («motor», «puente», «sandbox»…). */
  quien: string;
  /** El que hay que tener arriba para que la ventana tenga sentido. */
  critico?: boolean;
}

export interface DecisionDeApertura {
  /** abrir = la ventana puede mostrarse. */
  abrir: boolean;
  /** "listo" | "esperando" | "parcial" | "nada" */
  estado: "listo" | "esperando" | "parcial" | "nada";
  /** Los críticos que faltan. */
  faltan: number[];
  /** Una línea para el log / la pantalla de arranque. */
  motivo: string;
}

/**
 * v2.3.25 · LA PANTALLA DE ARRANQUE NO MIENTE NI SE QUEDA COLGADA.
 * =================================================================
 * Antes la ventana nacía en blanco y esperaba a un `setTimeout`; si la casa no
 * abría, quedaba un blanco para siempre. Ahora la ventana nace con la pantalla de
 * los puertos y esta función decide, sin red, si ya se puede entrar.
 *
 * Reglas, en orden:
 *   1. Todos los críticos arriba → se entra («listo»).
 *   2. Falta alguno y aún hay paciencia → se sigue esperando («esperando»).
 *   3. Se acabó la paciencia → se entra IGUAL, pero se DICE cuál falta («parcial»).
 *      Es la diferencia entre «no pasa nada» y «el :11434 no subió, mira
 *      logs/arranque/ollama.log». Y el supervisor sigue reintentando por detrás.
 *
 * PURA: pura aritmética sobre el inventario que le pasen. Esta es la fuente única;
 * `scripts/arranquePuertos.cjs` es su copia ejecutable (Electron no carga TS) y la
 * suite compara las dos para que no divergan.
 */
export function decidirApertura(
  inventario: InventarioPuerto[] | FotografiaDePuertos,
  transcurridoMs?: number,
  pacienciaMs?: number
): DecisionDeApertura {
  // v1.0.20 · LA MISMA REGLA, CON LA MISMA ENTRADA.
  // Electron no puede cargar este .ts: llama a `scripts/arranquePuertos.cjs`, y
  // ese .cjs recibe { vivos, inventory, total, transcurridoMs, pacienciaMs }.
  // Al volver el respaldo del .cjs por defecto (cuando `dist/engine/arranqueVentanas.cjs`
  // no existe en el paquete), la copia viva usaba la forma del .cjs y la fuente
  // única esperaba un arreglo: misma regla, distinta puerta. Se aceptan las dos.
  //
  // Y no es cosmético: la foto de Electron trae puertos que la lista plana no
  // tiene, así que «arriba N/M» se decía sobre la lista del que llama, no sobre
  // la foto.
  const foto = !Array.isArray(inventario) && inventario && typeof inventario === "object"
    ? (inventario as FotografiaDePuertos)
    : null;
  const lista: InventarioPuerto[] = foto
    ? (Array.isArray(foto.inventory) ? foto.inventory : [])
    : (Array.isArray(inventario) ? inventario : []);
  if (foto) {
    // La firma cómoda: la foto ya trae la espera dentro.
    const vivosDeLaFoto = Array.isArray(foto.vivos) ? foto.vivos.map(Number) : [];
    // El total es el de la FOTO (7 servicios reales). Si la foto no lo dice, se
    // cuenta la lista; el 7 de la copia ejecutable era un número de un plano
    // concreto, no una constante del arranque.
    const totalDeclarado = Number(foto.total) || lista.length;
    const fusion = lista.length
      ? lista.map((p) => ({ ...p, vivo: Boolean(p && (p.vivo || vivosDeLaFoto.includes(Number(p.puerto)))) }))
      : vivosDeLaFoto.map((puerto) => ({ puerto, vivo: true, quien: `:${puerto}`, critico: false }));
    return decidirSobreLista(fusion, Number(foto.transcurridoMs) || 0, Number(foto.pacienciaMs) || 0, totalDeclarado);
  }
  return decidirSobreLista(lista, Number(transcurridoMs) || 0, Number(pacienciaMs) || 0, lista.length);
}

/** La foto tal como la manda Electron (`electron-main.cjs` → `esperarLaCasa`). */
export interface FotografiaDePuertos {
  vivos?: number[];
  inventory?: InventarioPuerto[];
  total?: number;
  transcurridoMs?: number;
  pacienciaMs?: number;
}

/** El cuerpo de la regla, sobre una lista ya normalizada. Es `function` para que
 *  las dos puertas de arriba devuelvan LO MISMO sin duplicar una línea. */
function decidirSobreLista(
  lista: InventarioPuerto[],
  transcurridoMs: number,
  pacienciaMs: number,
  totalDeLaFoto: number
): DecisionDeApertura {
  const criticos = lista.filter((p) => p && p.critico).map((p) => Number(p.puerto));
  const vivos = new Set(lista.filter((p) => p && p.vivo).map((p) => Number(p.puerto)));
  const faltan = criticos.filter((p) => !vivos.has(p));
  const total = Math.max(lista.length, Number(totalDeLaFoto) || 0);
  const paciencia = Number(pacienciaMs) || 0;
  const t = Number(transcurridoMs) || 0;

  if (criticos.length === 0) {
    return { abrir: true, estado: "nada", faltan: [], motivo: `no hay criticos que esperar; arriba ${vivos.size}/${total}` };
  }
  if (faltan.length === 0) {
    return {
      abrir: true,
      estado: "listo",
      faltan: [],
      motivo: `los ${criticos.length} criticos arriba${vivos.size < total ? ` (${total - vivos.size} opcional(es) fuera)` : ""}`,
    };
  }
  const quienes = lista.filter((p) => faltan.includes(Number(p.puerto))).map((p) => `${p.quien}:${p.puerto}`);
  if (t >= paciencia) {
    return {
      abrir: true,
      estado: "parcial",
      faltan,
      motivo: `se acabo la paciencia (${Math.round(paciencia / 1000)} s): falta(n) ${quienes.join(", ")} — se entra igual y el supervisor lo reintenta`,
    };
  }
  return {
    abrir: false,
    estado: "esperando",
    faltan,
    motivo: `esperando (${Math.round(t / 1000)}/${Math.round(paciencia / 1000)} s): falta(n) ${quienes.join(", ")}`,
  };
}
