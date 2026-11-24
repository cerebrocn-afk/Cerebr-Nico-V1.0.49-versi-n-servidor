/**
 * caminoCorrecto.ts — EL ERROR QUE VIENE CON EL CAMINO (v1.0.10)
 * ==============================================================
 * PEDIDO DE MARIO (09/11, sobre la sesión 1794120824912):
 *   «algunas herramientas no las puede usar por problemas con el puente o los
 *   puertos, no entendí bien qué era, pero muy al final encuentra el camino.
 *   El camino correcto de todas las rutas debe estar explícito en el motor:
 *   no pueden existir errores de ese tipo.»
 *
 * La sesión entera fue un modelo tropezando con fallos que el motor SABÍA
 * resolver pero no decía: «el puente no respondió» sin decir que el puente es
 * :5000, que está apagado es NORMAL, y que la escritura alternativa es el
 * sandbox. «no se ve» sin decir que el sandbox sirve una sola carpeta. El
 * modelo gastaba veinte turnos descubriendo lo que una línea del motor ahorraba.
 *
 * ESTE MÓDULO ES ESA LÍNEA. Puro, determinista, sin fs ni red: recibe el
 * texto de un fallo (el que la herramienta ya devuelve) y devuelve el camino
 * correcto en una frase, o "" si el fallo no es de esta familia. Se engancha
 * en los puntos donde el server responde un error de transporte/ruta, para
 * que TODO error de ese tipo salga ya con su salida — ninguna vez más «lo
 * encontró al final».
 */

export interface GuardiaRuta {
  /** id estable, para el acta y los tests. */
  id: string;
  /** Patrón sobre el texto del error (case-insensitive). */
  re: RegExp;
  /** La frase que va con el error. Corta, imperativa, con el puerto/archivo nombrado. */
  camino: string;
}

export const GUARDIAS_RUTA: GuardiaRuta[] = [
  {
    id: "puente-caido",
    re: /ECONNREFUSED|el puente (?:pc )?\(?::?5000\)? no (?:respond|responde)|puente no respondió|no respondió o rechazó la escritura/i,
    camino:
      "El puente PC (:5000) es el agente de la máquina; si no responde, está APAGADO — no es un error tuyo ni de tu ruta. Tus escrituras de puente NO llegan al disco de la PC mientras esté caído: seguí con write_file/edit_file (sandbox) o pedí que arranquen el agente (iniciar_todo.bat / arrancar_puente.bat). Repetir la misma llamada al puente no lo levanta.",
  },
  {
    id: "pack-arrancando",
    re: /a[cú]n no responde|est[aá] arrancando|starting|12 reintentos/i,
    camino:
      "El pack está levantando (reintentos cada 5 s, hasta 60 s). Esperá una ronda y reintentá UNA vez; si sigue, declaralo en tu respuesta con el puerto del pack (:5100 memoria · :5102 creador · :5103 cerebro) en vez de buscar otra vía para la misma tarea.",
  },
  {
    id: "sandbox-apagado",
    re: /preview no responde|:3500|vista previa no responde|ECONNREFUSED.*3500|the view preview|la vista previa/i,
    camino:
      "El sandbox :3500 nace AL ABRIR el preview: apagado es su estado normal cuando nadie previsualiza. Abrilo con la herramienta abrir_previsualizador (o el botón) y volvé a sondear. NUNCA mates procesos a mano ni abras el puerto por la fuerza.",
  },
  {
    id: "servido-en-raiz-equivocada",
    re: /no hay nada que servir|no existe en el sandbox|X-CN-Missing|no hay index\.html/i,
    camino:
      "El sandbox sirve UNA sola carpeta (la raizEfectiva). Pedí GET http://127.0.0.1:3500/__cn_info: dice la raiz efectiva, dónde encontró index.html y si hay DOS COPIAS del proyecto. Si tu obra está en la subcarpeta que __cn_info lista y la raiz es otra, ahí está el desvío: escribí en la raiz efectiva o mové el sandbox — no edites la copia que nadie sirve.",
  },
  {
    id: "ruta-escapada-403",
    re: /\b403\b|fuera-de-la-raiz|fuera de la ra[zí]z/i,
    camino:
      "El 403 es la guarda anti-escape: tu ruta salió de la raiz servida (un '../' de más o una absoluta). El camino es relativo a la raiz efectiva de /__cn_info. Las absolutas y los saltos de nivel NUNCA van a funcionar acá: es diseño, no falla.",
  },
  {
    id: "src-vs-dist",
    re: /reinici[eé] y no (?:cambi|se ve)|sirve dist|npm run build|dist\/ esta viej/i,
    camino:
      "La IDE en producción sirve dist/ (su sombra compilada): editar src/ sin 'npm run build' no cambia lo que ves. Fuente es src/, artefacto es dist/. Compilá (o corré en modo dev con Vite) ANTES de concluir que 'el cambio no se aplicó'.",
  },
  {
    id: "bundle-secuestrado",
    re: /SECUESTRO DE PREVIEW|cn-preview\.js.*propio|bundle.*a s[í] misma/i,
    camino:
      "El index.html quedó apuntando a su bundle generado (cn-preview.js) por el pipeline viejo. El motor ahora lo detecta y repara solo; si pidió restauración, restitui el index desde .cn-preview/index.html.orig o desde el acta del quirófano y volvé a pedir el preview. NO vuelvas a editar el HTML a mano: la inyección ahora ocurre al servir.",
  },
  {
    id: "quirófano-revirtio",
    re: /CAMBIO REVERTIDO|QUIR[ÓO]FANO.*REVERT|revertid/i,
    camino:
      "El guardián revirtió SOLO los archivos culpables (v1.0.10): revisá la lista 'revertidos' del veredicto y reescribí únicamente ESOS con el motivo del fallo en mano (la puerta nombra archivo y línea). Los de 'conservados' ya están en disco: no los reescribas desde cero, leelos primero.",
  },
];

/**
 * Dado el texto de un fallo, devuelve la frase del camino correcto ("" si no
 * es de la familia). Determinista: primer guardián que calza gana, en el
 * orden declarado — el orden es la prioridad clínica.
 */
export function caminoCorrectoPara(error: string): string {
  const texto = String(error || "");
  if (!texto) return "";
  for (const g of GUARDIAS_RUTA) {
    g.re.lastIndex = 0;
    if (g.re.test(texto)) return g.camino;
  }
  return "";
}

/** Enriquece un payload de error JSON-serializable sin romper su forma. */
export function conCaminoCorrecto<T extends Record<string, unknown>>(payload: T, fuente?: string): T & { camino_correcto?: string } {
  const texto = fuente ?? JSON.stringify(payload);
  const camino = caminoCorrectoPara(texto);
  return camino ? { ...payload, camino_correcto: camino } : payload;
}
