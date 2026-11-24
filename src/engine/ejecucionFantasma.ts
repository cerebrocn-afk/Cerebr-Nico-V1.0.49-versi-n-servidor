/**
 * ejecucionFantasma.ts — CONTRA LA HERRAMIENTA FANTASMA Y EL BUCLE «HAZLO/NO PUEDO» (v1.44.0)
 * ==========================================================================================
 * Mario lo captó en una sesión real (28 msgs): con un modelo en la nube, el
 * agente INVENTABA una función puente — «consultarEscritorioMCP» — que no
 * existe, y a continuación se contradecía («ya lo hago» … «no tengo acceso») en
 * un bucle estéril. Como con el resto de defectos del modelo, la cura NO es
 * pedirlo por favor en el prompt (un modelo pequeño lo ignora): es MECÁNICA.
 *
 * La mecánica de verdad vive en dos sitios: (1) modelTiers reconoce a los
 * modelos de nube como tool-capable, y (2) la rama de nube de server.ts les
 * pasa las herramientas y ejecuta sus `functionCall` de verdad (ver
 * herramientasNube.ts). Esta capa añade la DIRECTRIZ honesta que acompaña a esa
 * mecánica: nombrar las herramientas que SÍ existen, prohibir inventar puentes,
 * y —cuando una capacidad está apagada— decir EXACTAMENTE qué activar en vez de
 * fingir que se hizo o negar que exista.
 *
 * Lógica pura: recibe el inventario de herramientas y el estado de los modos,
 * devuelve texto. Sin red, sin disco. Se prueba entera
 * (tests/ejecucionFantasma.test.ts).
 */

export interface EstadoCapacidades {
  /** Nombres de herramientas REALES disponibles este turno (ya recortadas por el motor). */
  herramientas: string[];
  /** ¿Modo Agente PC activo? (habilita las herramientas pc_* contra el puente :5000). */
  pcMode: boolean;
  /** ¿Hay salida a internet? (habilita navegar/descargar con confirmación previa). */
  red: boolean;
}

/** Herramientas que tocan la PC del usuario (ver/crear/editar archivos reales). */
const PREFIJOS_PC = ["pc_", "fs_"];
/** Herramientas de navegación/descarga web. */
const INDICIOS_WEB = ["web", "fetch", "navegar", "descargar", "download", "browse"];

function hayAlguna(herramientas: string[], test: (n: string) => boolean): boolean {
  return herramientas.some((n) => test(String(n || "").toLowerCase()));
}

/**
 * Construye la directriz anti-fantasma para el turno. Devuelve "" si no aporta
 * nada (no debería, pero mantiene el contrato limpio).
 */
export function directrizEjecucionReal(estado: EstadoCapacidades): string {
  const herramientas = Array.isArray(estado.herramientas) ? estado.herramientas.filter(Boolean) : [];
  const tienePc = hayAlguna(herramientas, (n) => PREFIJOS_PC.some((p) => n.startsWith(p)) || n.includes("archivo") || n.includes("file"));
  const tieneWeb = hayAlguna(herramientas, (n) => INDICIOS_WEB.some((w) => n.includes(w)));

  const lineas: string[] = [];
  lineas.push("## REGLA DE EJECUCIÓN REAL (no negociable)");
  lineas.push(
    "Tus únicas acciones posibles son las HERRAMIENTAS listadas abajo, llamadas por su " +
    "nombre exacto a través del mecanismo de herramientas. NUNCA inventes funciones " +
    "puente, APIs internas ni nombres como «consultarEscritorioMCP», «ejecutarEnPC» o " +
    "similares: si el nombre no está en la lista, NO EXISTE y llamarlo es un error."
  );
  lineas.push(
    "PROHIBIDO el bucle «ya lo hago / no puedo»: no afirmes haber hecho algo que no " +
    "ejecutaste con una herramienta real, y no niegues una capacidad que SÍ tienes en " +
    "la lista. Si de verdad no hay herramienta para lo pedido, DÍLO en una frase y " +
    "para — no lo intentes con un nombre inventado."
  );

  if (herramientas.length > 0) {
    lineas.push(`Herramientas REALES disponibles ahora (${herramientas.length}): ${herramientas.join(", ")}.`);
  } else {
    lineas.push(
      "AHORA MISMO NO tienes herramientas activas: solo puedes CONVERSAR. No simules " +
      "acciones sobre archivos, PC o internet; explica al usuario qué activar (abajo)."
    );
  }

  // Ver/crear/editar archivos de la PC — petición #2 de Mario.
  if (tienePc) {
    lineas.push(
      "ARCHIVOS DE LA PC: tienes herramientas reales para ver/crear/editar archivos del " +
      "equipo (van al puente local :5000). ÚSALAS; no describas lo que «harías»."
    );
  } else {
    lineas.push(
      "ARCHIVOS DE LA PC: NO están habilitadas las herramientas de archivos del equipo. " +
      (estado.pcMode
        ? "El Modo Agente PC está activo. Si en el arranque viste que el puente :5000 " +
          "cargó herramientas (fs_read, fs_write, exec…), ESAS herramientas EXISTEN: que " +
          "no te lleguen ESTE turno NO significa que el puente «no las ofrezca» — " +
          "significa que ESTE modelo no las recibió (típico de un modelo sin " +
          "function-calling fiable, p. ej. uno gratis). NO culpes al puente, NO digas " +
          "que falta activar nada en él, y NO inventes variables de entorno " +
          "(ENABLE_FS_TOOLS, ENABLE_EXEC y similares NO existen en este proyecto): dílo " +
          "honestamente y sugiere cambiar a un modelo con herramientas."
        : "Si el usuario quiere que toques archivos de su PC, dile que ACTIVE el «Modo " +
          "Agente PC» (y que el puente :5000 esté corriendo). No inventes que ya tienes acceso.")
    );
  }

  // Navegar/descargar — petición #3 de Mario, con confirmación previa.
  if (tieneWeb) {
    lineas.push(
      "INTERNET: puedes navegar/descargar con herramientas reales, SIEMPRE con " +
      "AUTORIZACIÓN PREVIA del usuario (el puente pide confirmación antes de bajar " +
      "nada). Pide permiso, espera el sí, y recién entonces descarga."
    );
  } else if (!estado.red) {
    lineas.push("INTERNET: sin salida a la red este turno; no prometas descargas ni navegación.");
  }

  return lineas.join("\n");
}

/**
 * v1.57.1 · sin-manos-no-narras — LA GUARDA DE HONESTIDAD PARA TURNOS SIN TOOLS.
 * ==============================================================================
 * La guarda vieja vivía como literal dentro de server.ts y SOLO se aplicaba si
 * `profile.tier === "micro" || "tiny"`. Un modelo nube renombrado (NEMESIS) que
 * caía en el modo liviano por la RAM del equipo quedaba en un limbo: sin
 * herramientas Y sin orden de admitirlo. Resultado (sesión real 2026-10-12, 29
 * mensajes): el modelo completaba el guion de agente que aprendió y narraba
 * «✔ guardado en index.html», «✔ ejecuté list_files»… mientras el disco no
 * cambiaba nada.
 *
 * La cura es cubrir el AGUJERO, no al modelo: el texto se aplica a TODO turno
 * con `activeTools.length === 0`, sin importar el tramo, y también al system de
 * una línea del modo liviano. Prohíbe narrar ejecuciones, inventar rutas y
 * listas de «acciones realizadas», y ordena declarar que el código entregado es
 * TEXTO. Sin red, sin disco: texto puro (tests/ejecucionFantasma.test.ts [5]).
 */
export function guardaSinHerramientas(): string {
  return [
    "[MODO SIN HERRAMIENTAS — LEE ESTO]",
    "Este modelo NO tiene herramientas disponibles este turno: no puede leer ni escribir archivos, no puede ejecutar comandos, no puede mirar el PC ni el sandbox.",
    "- PROHIBIDO escribir que ejecutaste algo, que leíste un archivo, que guardaste código o que encontraste un error. No lo hiciste.",
    "- PROHIBIDO inventar nombres de herramientas (por ejemplo pc_quick_action), rutas de archivo o listas de «acciones realizadas» con ✔ u otros sellos de éxito.",
    "- PROHIBIDO culpar al puente :5000 o a los packs de herramientas por «no exponerlas», y PROHIBIDO inventar arreglos de configuración (variables de entorno tipo ENABLE_FS_TOOLS/ENABLE_EXEC, banderas o ediciones de agent_bridge_5000.py): esas variables NO existen en este proyecto. Si en el log de arranque el usuario vio que un pack cargó herramientas (fs_read, fs_write, exec, etc.), esas herramientas EXISTEN en el motor; que no te lleguen a TI este turno es porque ESTE modelo no las recibió (p. ej. un modelo gratis sin function-calling fiable), no porque el puente falle.",
    "- El único arreglo honesto que puedes sugerir es: cambiar a un modelo con herramientas (o activar el Modo Agente PC). Nada de tocar el puente ni la configuración del servidor.",
    "- Todo código que entregues es TEXTO: dilo explícitamente («esto es texto; hay que pegarlo o guardarlo a mano») y nunca afirmes que ya está en el editor o en el disco.",
    "- Si te piden una acción, responde en UNA frase: «Con este modelo no puedo ejecutar acciones; activa un modelo con herramientas (o el Modo Agente PC) para que lo haga el motor».",
    "- Responde en texto directo y breve.",
    "Si el usuario te pide una dirección o una ruta y no la tienes en el contexto, no la inventes: dilo.",
  ].join("\n");
}
