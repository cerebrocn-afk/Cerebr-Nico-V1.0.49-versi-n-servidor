/**
 * relevoFavoritos.ts — EL RELEVO AUTOMÁTICO AL NUBE FAVORITA — v1.77.0
 * ========================================================================
 * EL HUECO QUE CIERRA (pregunta de Mario 26/10): «¿se implementó el auto
 * llamado? antes de que a un modelo se le termine el turno y no terminó o no
 * contestó, que auto marque el mismo prompt del chat a otro modelo cloud de la
 * carpeta favoritos».
 * La casa YA tenía rescate — `pivotProveedores` (v1.57.19) cambia de modelo
 * cuando NO LLEGA EL PRIMER BYTE, y `continuidadTurno` (v1.66.0) empuja al
 * modelo a ejecutar cuando ANUNCIA y no hace. Pero ninguno hace lo que Mario
 * pide: turno que cerró SIN RESPUESTA → RE-PREGUNTAR EL MISMO PROMPT a otro
 * modelo cloud de ⭐ Favoritos, sin que el usuario escriba «sigue».
 *
 * decisionRelevoFavoritos() es el criterio puro y congelable:
 *   · solo con la capacidad `auto_relay` encendida (el usuario manda);
 *   · solo turno VACÍO (texto final en blanco o sólo reportes del motor);
 *   · UN relevo por turno de usuario (el relevo que falla no encadena
 *     relevos: el bucle de reintentos infinitos es el defecto, no la cura);
 *   · el destino es un cloud de favoritos NO probado en este turno — el
 *     orden de la carpeta manda (el usuario ya eligió cuál es su primero,
 *     su segundo…);
 *   · los locales quedan afuera: un modelo que no contestó en el mismo
 *     hardware no va a contestar mejor re-consultado enseguida; la nube es
 *     el otro camino real (que es justo lo que Mario pidió).
 * Pura: sin red, sin fs, sin estado global.
 */

export interface FavoritoRelay {
  provider: string;
  modelId: string;
  name?: string;
}

export interface EstadoRelevo {
  activado: boolean;
  /** Cuántos relevos se dispararon YA en este turno de usuario (0..TOPE). */
  relevosEsteTurno: number;
  /** Modelos (id exacto) ya intentados en este turno, incluido el fallido. */
  probados: string[];
  /**
   * v1.80.0 · la traza de la cascada: cada voz que se llamó y por qué cayó.
   * Es la materia prima del informe honesto — sin traza no hay informe, y sin
   * informe el tope es solo un silencio más educado.
   */
  intentos?: IntentoRelevo[];
  /**
   * v1.51.1 · LA SALUD DEL PROVEEDOR, MEDIDA — el relevo deja de ir a ciegas.
   * Queja de Mario (1/11): «siempre salta a los que no contestan». El `find`
   * anterior tomaba el PRIMER favorito del orden de la carpeta sin preguntar
   * si ese proveedor acababa de fallar. Con esto, el destino se elige por
   * salud real: primero los que respondieron, al final los que nunca se
   * probaron, y NUNCA los que están en cuarentena viva.
   */
  salud?: Record<string, SaludProveedor>;
  /** El fusible del motor: true = pausado por fallos recientes. */
  enCuarentena?: (modelId: string) => boolean;
}

/**
 * v1.51.1 · La salud de un modelo, tal como la mide el motor.
 * `ultimoExito` y `ultimoFallo` son marcas de tiempo (ms). Un modelo con
 * éxito reciente y sin fallo posterior es el mejor candidato posible.
 */
export interface SaludProveedor {
  ultimoExito?: number;
  ultimoFallo?: number;
  /** Cuántos fallos seguidos lleva (0 = sano). */
  fallosSeguidos?: number;
}

/**
 * v1.51.1 · EL ORDEN DEL RELEVO — por salud, no por carpeta.
 * Puntúa cada favorito y devuelve el mejor. Reglas, en orden de peso:
 *   1. En cuarentena viva → descartado (no se gasta el intento).
 *   2. Ya probado en este turno → descartado.
 *   3. Locales (ollama) → descartados: no contestan mejor re-consultados.
 *   4. Entre los que quedan: menos fallos seguidos primero; luego el que
 *      respondió más recientemente; luego el que nunca falló; y a igualdad,
 *      el orden de la carpeta (la preferencia del usuario sigue mandando).
 * Si TODOS están en cuarentena, devuelve null y el llamante informa el motivo
 * con nombre y apellido en vez de reintentar en silencio.
 */
export function elegirDestinoRelevo(
  favoritos: FavoritoRelay[],
  probados: Set<string>,
  salud: Record<string, SaludProveedor> | undefined,
  enCuarentena: ((modelId: string) => boolean) | undefined
): { destino: FavoritoRelay | null; descartadosPorCuarentena: string[] } {
  const descartadosPorCuarentena: string[] = [];
  const candidatos: { f: FavoritoRelay; s: SaludProveedor; orden: number }[] = [];
  (favoritos || []).forEach((f, orden) => {
    if (!f || !f.modelId || !f.provider) return;
    if (f.provider === 'ollama') return;
    if (probados.has(f.modelId)) return;
    if (enCuarentena && enCuarentena(f.modelId)) { descartadosPorCuarentena.push(f.modelId); return; }
    candidatos.push({ f, s: (salud && salud[f.modelId]) || {}, orden });
  });
  if (candidatos.length === 0) return { destino: null, descartadosPorCuarentena };
  candidatos.sort((a, b) => {
    const fa = a.s.fallosSeguidos || 0;
    const fb = b.s.fallosSeguidos || 0;
    if (fa !== fb) return fa - fb;                                   // menos fallos primero
    const ea = a.s.ultimoExito || 0;
    const eb = b.s.ultimoExito || 0;
    if (ea !== eb) return eb - ea;                                   // éxito más reciente primero
    const la = a.s.ultimoFallo || 0;
    const lb = b.s.ultimoFallo || 0;
    if (la !== lb) return la - lb;                                   // fallo más viejo primero
    return a.orden - b.orden;                                        // preferencia del usuario
  });
  return { destino: candidatos[0].f, descartadosPorCuarentena };
}

export type DecisionRelevo =
  | { accion: "relevar"; destino: FavoritoRelay; aviso: string }
  | { accion: "informar"; intentos: IntentoRelevo[]; informe: string }
  | { accion: "quedarse"; motivo: string };

/**
 * v1.80.0 · FASE 1 del plano — EL TOPE, MEDIDO, NO ADIVINADO.
 * El plano dice «relevo en cascada con tope: si el favorito que relevó también
 * falla, se prueba el siguiente de la cola, con un tope de 2 reintentos por
 * mensaje — más allá de eso, informe honesto». El tope anterior (1) era la
 * mitad del diseño: dejaba el segundo reintento afuera y, sobre todo, dejaba el
 * informe afuera. Un tope sin informe es un silencio con contador.
 */
export const TOPE_RELEVOS = 2;
const MAX_RELEVOS_POR_TURNO = TOPE_RELEVOS;

/** Un intento de relevo registrado (para el informe honesto del final). */
export interface IntentoRelevo {
  provider: string;
  modelId: string;
  motivo: string;
}

/**
 * El informe que reemplaza al silencio: a quién se llamó, en qué orden y con
 * qué motivo cayó cada uno. Se entrega SIEMPRE que la cascada se agotó, aunque
 * el usuario no pregunte.
 */
export function informeHonestoRelevo(intentos: IntentoRelevo[]): string {
  const lista = (intentos || []).filter((i) => i && i.modelId);
  if (lista.length === 0) return "El relevo no llegó a llamar a nadie: sin favoritos nube con clave cargada.";
  const trazas = lista.map((i, n) => `${n + 1}) ${i.modelId} (${i.provider}) — ${String(i.motivo || "sin motivo declarado").slice(0, 90)}`);
  return `SE INTENTÓ EL RELEVO Y NADIE CONTESTÓ:\n${trazas.join("\n")}\nSe detuvo en el tope de ${TOPE_RELEVOS} relevos por mensaje. No se reintenta más: la cuota y tu tiempo también son del usuario.`;
}

/** ¿El texto final del turno cuenta como respuesta? Un turno «vacío» es el
 *  que no entregó nada legible: solo espacios, o solo reportes del propio
 *  motor (⊕⊕ constancias, avisos de corte) — esos ya son honestos pero no
 *  contestan al usuario. */
export function turnoQuedoVacio(textoFinal: string): boolean {
  const t = String(textoFinal || "").trim();
  if (!t) return true;
  // reportes del motor que no son respuesta al usuario (prefijos medidos en App)
  if (/^⊕⊕/.test(t)) return true;
  return false;
}

export function decisionRelevoFavoritos(
  estado: EstadoRelevo,
  textoFinal: string,
  favoritos: FavoritoRelay[],
  proveedorActual: string
): DecisionRelevo {
  if (!estado?.activado) return { accion: "quedarse", motivo: "relevo apagado (capacidad auto_relay)" };
  if (!turnoQuedoVacio(textoFinal)) return { accion: "quedarse", motivo: "el turno sí entregó respuesta" };
  const probados = new Set(estado.probados || []);
  // v1.51.1 · el destino se elige por SALUD, no por orden de carpeta.
  const { destino, descartadosPorCuarentena } = elegirDestinoRelevo(
    favoritos, probados, estado.salud, estado.enCuarentena
  );
  const yaIntentados = (estado.intentos || []).length;
  if ((estado.relevosEsteTurno || 0) >= MAX_RELEVOS_POR_TURNO || !destino) {
    // El tope se cumple, no se comenta: si ya hubo intentos, el usuario recibe
    // el informe con la traza completa. Si no los hubo, no hay nada que informar.
    if (yaIntentados > 0) {
      return { accion: "informar", intentos: estado.intentos || [], informe: informeHonestoRelevo(estado.intentos || []) };
    }
    return {
      accion: "quedarse",
      motivo: (estado.relevosEsteTurno || 0) >= MAX_RELEVOS_POR_TURNO
        ? `tope de ${MAX_RELEVOS_POR_TURNO} relevos por mensaje alcanzado`
        : descartadosPorCuarentena.length > 0
          ? `todos los favoritos nube están en cuarentena viva: ${descartadosPorCuarentena.slice(0, 4).join(", ")}${descartadosPorCuarentena.length > 4 ? ` y ${descartadosPorCuarentena.length - 4} más` : ""}. No se gastó un intento en ellos.`
          : "sin cloud disponible en ⭐ Favoritos que no hayas probado ya en este turno",
    };
  }
  const nombreDestino = destino.name || destino.modelId;
  return {
    accion: "relevar",
    destino,
    aviso: `🔁 RELEVO AUTOMÁTICO (${(estado.relevosEsteTurno || 0) + 1}/${MAX_RELEVOS_POR_TURNO}) — «${proveedorActual}» cerró el turno sin contestar. Repito el MISMO prompt a «${nombreDestino}» (${destino.provider}) de ⭐ Favoritos.`,
  };
}

/**
 * v1.80.0 · LA OTRA PUERTA DEL RELEVO: el FALLO.
 * `decisionRelevoFavoritos` mira el turno que cerró VACÍO; el marcador de
 * `utils/marcador.ts` mira el fallo de comunicación con su propia cola. El plano
 * de la perfección (FASE 1) pide que la preferencia del panel gobierna AMBAS:
 * si el usuario encendió `auto_relay`, un error de red también releva en
 * cascada, con el mismo tope y el mismo informe.
 * Pura: recibe el estado del turno y dice qué hacer, sin tocar React ni la red.
 */
export function decisionRelevoPorFallo(
  estado: EstadoRelevo,
  motivoFallo: string,
  favoritos: FavoritoRelay[]
): DecisionRelevo {
  if (!estado?.activado) return { accion: "quedarse", motivo: "relevo apagado (capacidad auto_relay)" };
  const probados = new Set(estado.probados || []);
  // v1.51.1 · mismo criterio de salud que el relevo por turno vacío.
  const { destino, descartadosPorCuarentena } = elegirDestinoRelevo(
    favoritos, probados, estado.salud, estado.enCuarentena
  );
  const yaIntentados = (estado.intentos || []).length;
  if ((estado.relevosEsteTurno || 0) >= MAX_RELEVOS_POR_TURNO || !destino) {
    if (yaIntentados > 0) {
      const intentos = estado.intentos || [];
      const informe = motiveInformativo(informeHonestoRelevo(intentos), motivoFallo);
      return { accion: "informar", intentos, informe };
    }
    return { accion: "quedarse", motivo: "sin favoritos nube disponibles para el relevo" };
  }
  const nombreDestino = destino.name || destino.modelId;
  return {
    accion: "relevar",
    destino,
    aviso: `🔁 RELEVO POR FALLO (${(estado.relevosEsteTurno || 0) + 1}/${MAX_RELEVOS_POR_TURNO}) — «${destino.provider}» no es la culpa: falló el modelo elegido (${String(motivoFallo || "sin motivo").slice(0, 90)}). Mismo prompt a «${nombreDestino}» de ⭐ Favoritos.`,
  };
}

/** El informe siempre dice qué falló primero (si el llamante lo sabe). */
function motiveInformativo(informe: string, primerFallo: string): string {
  const motivo = String(primerFallo || "").trim();
  return motivo ? `${informe}\nPrimer fallo declarado: ${motivo.slice(0, 160)}` : informe;
}
