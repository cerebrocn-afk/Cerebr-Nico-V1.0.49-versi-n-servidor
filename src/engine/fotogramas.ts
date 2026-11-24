/**
 * src/engine/fotogramas.ts — EL OJO: COMPARAR DOS FOTOGRAMAS (v1.0.8)
 * ====================================================================
 * QUÉ CIERRA. En v1.0.7 el testigo (`testigoEscena.ts`) auditaba el MONTAJE de
 * una escena — que el motor se sirva por la ruta del importmap, que el JS esté
 * afuera, que existan los testigos DOM — pero seguía sin MIRAR el fotograma. La
 * deuda dicha en voz alta: nadie podía comparar dos capturas y afirmar, con un
 * hecho, «se mueve con el scroll». Este módulo es ese criterio, y vive en UN SOLO
 * lado: el .cjs del escritorio captura, pero NO decide — pregunta acá (por
 * `/api/capacidades/comparar-fotogramas`). Duplicar la comparación en el .cjs
 * sería tener dos dueños del criterio, el defecto que la casa combate.
 *
 * LA DISTINCIÓN QUE IMPORTA (y que un modelo no debe poder borrar):
 *   · `distintos`  → las dos capturas no son idénticas (hecho duro: sha256 o malla).
 *   · `pixelesCambiaron` → la luminancia de una malla reducida cambió por encima
 *     de un umbral, y se sabe EN QUÉ REGIÓN (evolución de v1.0.8: ya no son sólo
 *     bytes, son píxeles decodificados a baja resolución).
 *   · `avance`     → ADEMÁS los testigos que la obra publica por contrato
 *     (`data-progreso`, `data-fotograma`) cambiaron en el sentido esperado.
 *     SOLO ESTO autoriza decir «se mueve con el scroll».
 *
 * LOS CUATRO CASOS MEDIDOS:
 *   iguales                      → «la escena NO cambia» (aunque los testigos mientan).
 *   distintas + progreso sube    → AUTORIZADO.
 *   distintas sin testigos       → «el movimiento NO está demostrado» (una textura
 *                                   que terminó de cargar, un HUD, un parpadeo).
 *   testigos idénticos           → no autoriza.
 *
 * PURO: recibe datos, devuelve datos. Sin red, sin fs, sin Electron. Así se prueba
 * sin levantar nada (`tests/escena3dCableada.test.ts`).
 */

export type Testigos = {
  motor?: string | null;
  progreso?: number | string | null;
  fotograma?: number | string | null;
};

/** Malla reducida de LUMINANCIA (0..255) de una captura. La reducción la hace quien
 *  captura (transformación mecánica, no criterio); acá sólo se compara. */
export type Rejilla = {
  ancho: number;
  alto: number;
  valores: number[]; // length esperado = ancho * alto
};

export type EntradaComparacion = {
  shaA?: string | null;
  shaB?: string | null;
  testigosA?: Testigos | null;
  testigosB?: Testigos | null;
  rejillaA?: Rejilla | null;
  rejillaB?: Rejilla | null;
  /** diferencia mínima de luminancia por celda para contarla cambiada (0..255). */
  umbralCelda?: number;
  /** fracción mínima de celdas cambiadas para llamarlo cambio visible (0..1). */
  umbralFraccion?: number;
};

export type MetricaPixeles = {
  medible: boolean;
  celdas: number;
  celdasCambiadas: number;
  fraccion: number; // 0..1
  region: { x0: number; y0: number; x1: number; y1: number } | null;
  centroide: { x: number; y: number } | null;
  reparto: "sin-datos" | "nulo" | "localizado" | "extendido";
  motivo: string;
};

export type VeredictoFotogramas = {
  distintos: boolean;
  pixelesCambiaron: boolean;
  avance: boolean;
  /** La ÚNICA frase que autoriza decir «se mueve con el scroll». */
  autorizaMovimiento: boolean;
  pixeles: MetricaPixeles;
  caso: "iguales" | "sin-testigos" | "autorizado" | "sin-rejilla-ni-sha";
  resumen: string;
  noMedible: string;
};

const UMBRAL_CELDA = 8;
const UMBRAL_FRACCION = 0.01;

/** Parsea un testigo a número finito o null (acepta "0.42", 7, "  3  "). */
export function aNumero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/** ¿Subió alguno de los testigos del recorrido (progreso o fotograma)? */
export function testigosSubieron(a?: Testigos | null, b?: Testigos | null): boolean {
  if (!a || !b) return false;
  const pa = aNumero(a.progreso), pb = aNumero(b.progreso);
  const fa = aNumero(a.fotograma), fb = aNumero(b.fotograma);
  const progSube = pa !== null && pb !== null && pb > pa;
  const fotoSube = fa !== null && fb !== null && fb > fa;
  return progSube || fotoSube;
}

/** ¿Los testigos son idénticos (nada cambió)? Distinto de «no hay testigos». */
export function testigosIdenticos(a?: Testigos | null, b?: Testigos | null): boolean {
  if (!a || !b) return false;
  const pa = aNumero(a.progreso), pb = aNumero(b.progreso);
  const fa = aNumero(a.fotograma), fb = aNumero(b.fotograma);
  const hayProg = pa !== null && pb !== null;
  const hayFoto = fa !== null && fb !== null;
  if (!hayProg && !hayFoto) return false;
  const progIgual = !hayProg || pa === pb;
  const fotoIgual = !hayFoto || fa === fb;
  return progIgual && fotoIgual;
}

/** Compara dos mallas de luminancia. Puro. Devuelve fracción, región y reparto. */
export function compararRejillas(a?: Rejilla | null, b?: Rejilla | null, umbralCelda = UMBRAL_CELDA): MetricaPixeles {
  const vacia = (motivo: string): MetricaPixeles => ({
    medible: false, celdas: 0, celdasCambiadas: 0, fraccion: 0, region: null, centroide: null, reparto: "sin-datos", motivo,
  });
  if (!a || !b) return vacia("no llegaron las dos rejillas: la comparación cae a bytes (sha256).");
  if (a.ancho !== b.ancho || a.alto !== b.alto) return vacia(`las rejillas no coinciden en tamaño (${a.ancho}x${a.alto} vs ${b.ancho}x${b.alto}).`);
  const celdas = a.ancho * a.alto;
  if (celdas <= 0 || a.valores.length !== celdas || b.valores.length !== celdas) return vacia("rejilla con largo inconsistente respecto a ancho*alto.");
  let cambiadas = 0;
  let x0 = a.ancho, y0 = a.alto, x1 = -1, y1 = -1;
  let sx = 0, sy = 0;
  for (let i = 0; i < celdas; i++) {
    if (Math.abs(a.valores[i] - b.valores[i]) >= umbralCelda) {
      cambiadas++;
      const x = i % a.ancho, y = Math.floor(i / a.ancho);
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      sx += x; sy += y;
    }
  }
  const fraccion = cambiadas / celdas;
  if (cambiadas === 0) {
    return { medible: true, celdas, celdasCambiadas: 0, fraccion: 0, region: null, centroide: null, reparto: "nulo",
      motivo: "ninguna celda superó el umbral: las dos capturas se ven iguales a esta resolución." };
  }
  const region = { x0, y0, x1, y1 };
  const areaRegion = ((x1 - x0 + 1) * (y1 - y0 + 1)) / celdas;
  // Reparto: un cambio que cubre buena parte del lienzo parece cámara/escena; uno
  // apretado en una esquina parece HUD o textura. Es una PISTA, no una sentencia.
  const reparto: MetricaPixeles["reparto"] = areaRegion >= 0.5 ? "extendido" : "localizado";
  return {
    medible: true, celdas, celdasCambiadas: cambiadas, fraccion, region,
    centroide: { x: Math.round(sx / cambiadas), y: Math.round(sy / cambiadas) }, reparto,
    motivo: `${cambiadas}/${celdas} celdas cambiaron (${(fraccion * 100).toFixed(1)}%), reparto ${reparto} en [${x0},${y0}]-[${x1},${y1}].`,
  };
}

/**
 * El veredicto. Reglas, en orden:
 *   1) ¿son distintos? — por sha256 si vino, si no por la malla de píxeles.
 *   2) si NO son distintos → «la escena no cambia» (aunque los testigos digan otra cosa).
 *   3) si son distintos pero los testigos no subieron → «movimiento no demostrado».
 *   4) si son distintos Y un testigo subió (y, con rejilla, los píxeles cambiaron) → AUTORIZADO.
 */
export function compararFotogramas(e: EntradaComparacion): VeredictoFotogramas {
  const umbralFraccion = e.umbralFraccion ?? UMBRAL_FRACCION;
  const pixeles = compararRejillas(e.rejillaA, e.rejillaB, e.umbralCelda);
  const pixelesCambiaron = pixeles.medible && pixeles.fraccion >= umbralFraccion;

  const hayShas = typeof e.shaA === "string" && typeof e.shaB === "string" && !!e.shaA && !!e.shaB;
  const bytesDistintos = hayShas ? e.shaA !== e.shaB : undefined;

  let distintos: boolean;
  if (bytesDistintos !== undefined) distintos = bytesDistintos || pixelesCambiaron;
  else if (pixeles.medible) distintos = pixelesCambiaron;
  else {
    // Ni sha ni rejilla: no hay con qué comparar. No se finge.
    return {
      distintos: false, pixelesCambiaron: false, avance: false, autorizaMovimiento: false, pixeles,
      caso: "sin-rejilla-ni-sha",
      resumen: "No llegó ni sha256 ni rejilla de píxeles: no hay con qué comparar dos fotogramas. No se afirma nada.",
      noMedible: NO_MEDIBLE,
    };
  }

  const subio = testigosSubieron(e.testigosA, e.testigosB);
  const identicos = testigosIdenticos(e.testigosA, e.testigosB);
  // Con rejilla presente, exigir también cambio de píxeles para autorizar: dos sha
  // distintos con imagen visualmente idéntica (metadatos, timestamp) no es movimiento.
  const pixelesOk = pixeles.medible ? pixelesCambiaron : true;
  const avance = distintos && subio && pixelesOk;

  let caso: VeredictoFotogramas["caso"];
  let resumen: string;
  if (!distintos) {
    caso = "iguales";
    resumen = "La escena NO cambia entre los dos fotogramas: son iguales" +
      (subio ? " — y eso pese a que un testigo del DOM dice que subió: el testigo miente o la cámara no se movió." : ".") +
      " No autoriza decir «se mueve».";
  } else if (avance) {
    caso = "autorizado";
    resumen = "AUTORIZADO: los dos fotogramas son distintos Y un testigo del recorrido subió (data-progreso/data-fotograma)" +
      (pixeles.medible ? ` — ${pixeles.motivo}` : "") + ". Se puede afirmar «se mueve con el scroll».";
  } else {
    caso = "sin-testigos";
    const porque = identicos
      ? "los testigos del DOM son idénticos entre las dos lecturas"
      : "no hay testigos del recorrido que cambien en el sentido esperado";
    resumen = `Los dos fotogramas son distintos pero ${porque}: el MOVIMIENTO NO está demostrado` +
      (pixeles.medible ? ` (${pixeles.motivo}` : " (") +
      ` puede ser una textura que terminó de cargar, un HUD o un parpadeo, no la escena avanzando).`;
  }

  return { distintos, pixelesCambiaron, avance, autorizaMovimiento: avance, pixeles, caso, resumen, noMedible: NO_MEDIBLE };
}

export const NO_MEDIBLE =
  "LO QUE ESTO NO MIDIO: el SIGNIFICADO de lo que cambió. Se compara la luminancia de una malla " +
  "reducida de cada fotograma (píxeles decodificados, no sólo bytes), así que se puede afirmar «cambió, y en tal " +
  "región», pero NO «el auto giró 30°» ni «la cámara avanzó 2 m»: eso exige decodificar la ESCENA, no sólo la " +
  "imagen. Y si no llegó una rejilla de píxeles, la comparación cae a bytes (sha256): «distintos» no es «se ve distinto».";
