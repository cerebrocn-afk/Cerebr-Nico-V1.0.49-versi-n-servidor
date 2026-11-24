/**
 * abordaje.ts — EL ABORDAJE DEL TURNO (v1.68.0)
 * =============================================
 * Un turno = un modelo + un proveedor + un conjunto de herramientas. Este módulo
 * decide QUÉ se le dice al modelo sobre esas herramientas, y lo hace con una sola
 * regla que está por encima de cualquier ahorro de caracteres:
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   ▸ INVARIANTE · Antes que recortar una herramienta, se EXCEDE el presupuesto.
 *   ▸ Una herramienta activa que el modelo no ve en el manual es una herramienta
 *     que el modelo no va a usar — o, peor, que va a INVENTAR con otro nombre.
 *   ══════════════════════════════════════════════════════════════════════
 *
 * POR QUÉ EXISTE (la medición, no la suposición)
 * ─────────────────────────────────────────────
 * El síntoma que reportó Mario era de proveedores: «algunos encuentran las rutas y
 * herramientas y otros no». Medido sobre v1.67.0 ejecutando su propio código
 * (`buildContratoDeAccion` con los presupuestos reales de server.ts), esto es lo
 * que veía cada nivel de modelo:
 *
 *   nube rápida (800 → suelo 1450) → 6 de 37 herramientas nombradas
 *   local ≤8B   (1300 → suelo 1450) → 6 de 37
 *   grande      (1900)              → 10 de 37
 *
 * Es decir: Gemini Flash, GLM-flash y GPT-4o-mini recibían UN SEXTO del catálogo.
 * No era un proveedor peor: era un corte porCharacters que dejaba fuera las
 * herramientas del final de la lista. Dos modelos, dos catálogos distintos, y de
 * ahí la sensación de que «el proveedor no encuentra las rutas».
 *
 * Y había un segundo agujero debajo del primero: `inventarioCanonico()` filtraba
 * `.filter(n => TOOL_MANUALS[n])`, así que las 16 herramientas del registro que no
 * tienen entrada en el manual NO SE NOMBRABAN NUNCA, con presupuesto ilimitado.
 * Entre esas 16 están `revisar_cambios` y `deshacer_cambios`, que son
 * `HUESO_DE_OBRA` (toolRegistry.ts:191): se ofrecen en todos los niveles y jamás
 * se explicaron. El modelo recibía la función en el esquema y cero texto sobre
 * ella — literalmente la definición del «no sabe que la tiene».
 *
 * LO QUE CAMBIA
 * ─────────────
 * El catálogo de NOMBRES pasa a ser P0: intocable. Lo que flexiona es el DETALLE.
 *
 *   Prioridad  Contenido                                        ¿Se recorta?
 *   ────────  ───────────────────────────────────────────────  ────────────
 *   P0        Nombres de TODAS las herramientas activas         NUNCA
 *   P0·rutas  Mapa de rutas del sistema (rutasSistema.ts)       NUNCA (v1.86.3)
 *   P1        Leyes del motor (3)                               NUNCA (baja la
 *                                                               densidad, jamás
 *                                                               se corta una frase)
 *   P2        Estado MCP (presente/ausente + nombres)           NUNCA
 *   P3        Manos (PC vs sandbox) + rutas HTTP por dominio     Sí, si no cabe
 *   P4        Detalle de una línea por herramienta               Lo primero en caer
 *
 * Los costes medidos sobre las 37 herramientas del registro real:
 *   CONTRATO_DE_ACCION 924 · MAPA_DE_RUTAS 2467 · leyes enteras 1519 · leyes
 *   esenciales ~660 · leyes en títulos 200 · P0 (37 nombres) 582 · P4 completo 3815.
 *
 * Con P0 + P1(enteras) + P2 el suelo de un turno completo ronda los 3.300
 * caracteres; con leyes esenciales baja a ~2.400 y con títulos a ~1.950. Nadie
 * baja de ahí con herramientas activas, y ese suelo es DECLARADO:
 * `presupuestoAbordaje()` lo devuelve para que el servidor pida lo que de verdad
 * hace falta en vez de imponer un número a ojo y enterarse después de que el
 * catálogo llegó roto.
 *
 * CERO TRABAJO NUEVO PARA LAS 16 SIN MANUAL
 * ─────────────────────────────────────────
 * Su descripción ya está escrita: es la `description` del registro
 * (`getToolSpec(name).description`, toolRegistry.ts:133), que es lo que el
 * proveedor recibe en el esquema de funciones. Reutilizarla no es inventar
 * documentación: es decirle al modelo, en prosa, exactamente lo que ya le
 * dijimos en JSON.
 *
 * Capa PURA: sin red, sin fs, sin modelo, sin dependencias de servidor. Se puede
 * correr con `npx tsx tests/abordaje.test.ts`.
 */

import {
  CONTRATO_DE_ACCION,
  ENGINE_LAWS,
  TOOL_MANUALS,
  PROVEEDORES_SIN_CICLO_DE_TEXTO,
  type CanalAccion,
} from "./manuals";
import { textoDeRutasSistema, CHARS_MAPA_RUTAS } from "./rutasSistema";

/**
 * v1.86.3 · El mapa de rutas es P0 y SU COSTO SE DECLARA EN EL PRESUPUESTO. No se
 * puede decir «el abordaje mide 5350/5378» y encima mandarle al modelo un bloque
 * que nadie contabilizó: o el presupuesto lo incluye, o el `excedido` que se
 * reporta es mentira.
 */
const COSTO_MAPA_RUTAS = CHARS_MAPA_RUTAS + 2;

/**
 * El mapa viaja SIN RECORTAR en las dos ramas que tienen texto (catálogo con
 * herramientas y catálogo vacío por canal de texto): un modelo sin herramientas
 * también tiene que saber dónde está el IDE para explicar qué le falta. Es texto
 * constante y puro — la misma cadena en el mismo orden en cada turno.
 */
export const MAPA_DE_RUTAS = textoDeRutasSistema();

// ============================================================
// Tipos
// ============================================================

/** Densidad de las leyes del motor dentro del abordaje (P1). */
export type DensidadLeyes = "enteras" | "esenciales" | "titulos";

/** Lo que el motor sabe de cada herramienta del turno. */
export interface SemillaHerramienta {
  name: string;
  /** La `description` del registro: lo que el proveedor recibe en el esquema. */
  description?: string;
  pack?: string;
}

/** Estado MCP del turno (P2). `nombres`: las externas ya incluidas en `nombres`. */
export interface EstadoMcp {
  presente: boolean;
  nombres?: string[];
}

export interface PerfilAbordaje {
  tier?: string;
  nubeRapida?: boolean;
}

export interface ResultadoAbordaje {
  /** El bloque que se inyecta en el system prompt. */
  texto: string;
  chars: number;
  /** El presupuesto contra el que se midió este abordaje. */
  presupuesto: number;
  /** true = se envió MÁS de lo presupuestado para no dejar ninguna herramienta fuera. */
  excedido: boolean;
  excesoChars: number;
  canal: CanalAccion;
  leyes: DensidadLeyes;
  herramientasTotales: number;
  /** Medido sobre el texto final, no contado por confianza. */
  herramientasEnIndice: number;
  /** Las que no tienen entrada en TOOL_MANUALS (déficit de documentación). */
  herramientasSinManual: string[];
  /** Las que ni siquiera tienen `description` en el registro: se nombran desnudas. */
  herramientasSinNota: string[];
  /** Cuántas llegaron a tener línea de detalle (P4). */
  herramientasConDetalle: number;
  /** Cuántos bloques opcionales (P3) cayeron por no caber. */
  bloquesOmitidos: number;
  /** Cuántos caracteres ocupó el mapa de rutas (P0·rutas). 0 = no viajó. */
  mapaRutasChars: number;
}

// ============================================================
// Presupuestos
// ============================================================

/** Suelo del estándar heredado de v1.67.0: por debajo, la cláusula 4 se cortaba. */
export const SUELO_ESTANDAR = 1450;

/** Lo que cada nivel de modelo PEDÍA antes (server.ts:9972). */
export const BASE_POR_PERFIL = {
  micro: 0,
  tiny: 0,
  nubeRapida: 800,
  small: 1300,
  grande: 1900,
} as const;

/** Márgenes fijos del ensamblado (encabezados y saltos), medidos en la práctica. */
const COSTO_TRANSPORTE = 130;
const COSTO_ENCABEZADO_P0 = 52;
const COSTO_MCP = 90;
const COSTO_LINEA_DETALLE = 7;
const SEPARADOR_INDICE = " · ";

function primeraFrase(texto: unknown, maxChars = 190): string {
  const crudo = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!crudo) return "";
  const m = crudo.match(/^(.{8,}?[.!?])(?:\s|$)/);
  const frase = (m ? m[1] : crudo).trim();
  return frase.length > maxChars ? `${frase.slice(0, maxChars - 1).trimEnd()}…` : frase;
}

function leyesEn(densidad: DensidadLeyes): string {
  if (densidad === "titulos") return ENGINE_LAWS.map((l) => `- ${l.title}`).join("\n");
  if (densidad === "esenciales") {
    return ENGINE_LAWS.map((l) => `- ${l.title}: ${primeraFrase(l.body, 230)}`).join("\n");
  }
  return ENGINE_LAWS.map((l) => `- ${l.title}: ${l.body}`).join("\n");
}

const DENSIDADES: DensidadLeyes[] = ["enteras", "esenciales", "titulos"];

/** Línea P0: el nombre, siempre. Sin recorte, sin traducción, sin alias. */
function lineaIndice(nombres: string[]): string {
  return nombres.join(SEPARADOR_INDICE);
}

function indiceDe(semillas?: Array<SemillaHerramienta> | Map<string, string> | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!semillas) return out;
  if (semillas instanceof Map) {
    for (const [k, v] of semillas) if (k) out.set(k, String(v ?? ""));
    return out;
  }
  for (const s of semillas) if (s?.name) out.set(s.name, String(s.description ?? ""));
  return out;
}

/**
 * La nota de una herramienta: primero el manual del motor; si no existe (16 de 37
 * casos), la `description` con la que ya fue registrada. `null` solo cuando no hay
 * ninguna de las dos: entonces la herramienta se nombra desnuda, NUNCA se omite.
 */
export function notaDeHerramienta(
  name: string,
  semillas?: Array<SemillaHerramienta> | Map<string, string> | null
): { texto: string; fuente: "manual" | "registro" | "ninguna" } {
  const manual = TOOL_MANUALS[name];
  if (manual?.body) return { texto: primeraFrase(manual.body), fuente: "manual" };
  const desc = indiceDe(semillas).get(name);
  if (desc) return { texto: primeraFrase(desc), fuente: "registro" };
  return { texto: "", fuente: "ninguna" };
}

export interface PresupuestoAbordaje {
  /** Lo que el perfil pedía antes de este módulo (800 / 1300 / 1900). */
  base: number;
  /** Lo que cuesta la verdad con la densidad de leyes de este nivel. */
  suelo: number;
  /** El suelo absoluto: estándar + leyes en títulos + P0 + MCP. Nunca menos. */
  sueloTitulos: number;
  /** Lo que cuesta P4 completo (una línea por herramienta). */
  charsDetalle: number;
  /** Lo que el servidor debe presupuestar: cubre suelo + detalle del nivel. */
  recomendado: number;
  densidad: DensidadLeyes;
}

/** Coste real de P4 con las notas de verdad (manual o description del registro). */
export function charsDetalleDe(
  nombres: string[],
  semillas?: Array<SemillaHerramienta> | Map<string, string> | null
): number {
  let total = 0;
  for (const n of nombres || []) {
    if (!n) continue;
    const nota = notaDeHerramienta(n, semillas);
    if (nota.fuente === "ninguna") continue;
    total += n.length + nota.texto.length + COSTO_LINEA_DETALLE;
  }
  return total;
}

/**
 * El presupuesto que el turno NECESITA, no el que se le quiere dar.
 *
 * `base` es lo que pedía el perfil (800/1300/1900). `suelo` es lo que cuesta decir
 * la verdad sobre las herramientas activas: estándar + leyes + P0 + MCP. El
 * servidor manda `recomendado` y así `excedido` solo salta cuando de verdad hubo
 * que pasarse del techo para honrar el invariante.
 */
export function presupuestoAbordaje(
  perfil: PerfilAbordaje = {},
  nHerramientas = 0,
  opts: { longitudNombres?: number; charsDetalle?: number } = {}
): PresupuestoAbordaje {
  const tier = String(perfil.tier || "");
  const esMicro = tier === "micro" || tier === "tiny";
  const esSmall = tier === "small";
  const base = esMicro
    ? BASE_POR_PERFIL.micro
    : esSmall
      ? BASE_POR_PERFIL.small
      : perfil.nubeRapida
        ? BASE_POR_PERFIL.nubeRapida
        : BASE_POR_PERFIL.grande;

  const logNombres = opts.longitudNombres ?? 0;
  const p0 = nHerramientas > 0 ? logNombres + SEPARADOR_INDICE.length * Math.max(0, nHerramientas - 1) + COSTO_ENCABEZADO_P0 : 0;
  const fijo = CONTRATO_DE_ACCION.length + COSTO_TRANSPORTE + p0 + COSTO_MCP + COSTO_MAPA_RUTAS;
  const sueloTitulos = nHerramientas > 0 ? fijo + leyesEn("titulos").length : 0;
  const detalle = opts.charsDetalle ?? nHerramientas * COSTO_LINEA_DETALLE;

  // Micro/tiny: sin herramientas, sin abordaje. El contrato no se les manda nunca.
  if (esMicro || nHerramientas === 0) {
    return { base, suelo: 0, sueloTitulos: 0, charsDetalle: 0, recomendado: 0, densidad: "enteras" };
  }
  // Nube rápida y local pequeño: leyes en su forma ESENCIAL (título + cláusula
  // operativa) y el detalle que quepa hasta un techo moderado.
  if (perfil.nubeRapida || esSmall) {
    const suelo = fijo + leyesEn("esenciales").length;
    // Techo de detalle por nivel: la nube rápida tiene ventana de 128K-1M y puede
    // leer el catálogo entero; un local ≤8B paga cada carácter en latencia y en
    // num_ctx, así que ahí el detalle se corta antes (los NOMBRES nunca).
    const margen = perfil.nubeRapida ? Math.min(detalle, 2400) : Math.min(detalle, 1600);
    return {
      base, suelo, sueloTitulos, charsDetalle: detalle,
      recomendado: Math.max(base, suelo + margen),
      densidad: "esenciales",
    };
  }
  // Grande / nube grande: suelo honesto (leyes completas) + detalle ENTERO.
  // El margen extra paga el encabezado de P4 y el aviso, que la estimación línea a
  // línea no cuenta: sin él, las dos últimas herramientas se quedaban fuera.
  const suelo = fijo + leyesEn("enteras").length;
  return {
    base, suelo, sueloTitulos, charsDetalle: detalle,
    recomendado: Math.max(base, suelo + detalle + COSTO_ENCABEZADO_P0 + 220),
    densidad: "enteras",
  };
}

// ============================================================
// El ensamblado
// ============================================================

/**
 * Arma el bloque del turno con el orden de prioridad P0 → P4.
 *
 * @param opts.nombres  El conjunto del turno. Es el MISMO array que se manda al
 *                      proveedor en el esquema: si viaja un solo objeto, es
 *                      imposible que el manual y las herramientas diverjan.
 * @param opts.canal    Quién decide si se habla del canal de funciones o del de
 *                      texto. `auto` lo deduce del proveedor (misma tabla que v1.67.0).
 */
export function construirAbordaje(opts: {
  nombres: string[];
  specs?: Array<SemillaHerramienta> | Map<string, string> | null;
  mcp?: EstadoMcp | null;
  provider?: string;
  presupuesto?: number;
  /** P3: bloque de manos (PC vs sandbox), rutas HTTP por dominio, etc. */
  bloquesOpcionales?: string[];
  /**
   * Raíz de datos RESUELTA por el servidor (`PROJECT_ROOT`). Si llega, el mapa de
   * rutas deja de hablar en abstracto y le dice al modelo el camino real de esta
   * máquina — que es justamente lo que faltaba cuando un modelo buscaba en
   * `\C:\Users\…` y declaraba «el archivo no existe».
   */
  raizDatos?: string;
  /** Raíz de la INSTALACIÓN (RAIZ_APP). Ver `textoDeRutasSistema`. */
  raizApp?: string;
  canal?: CanalAccion | "auto";
}): ResultadoAbordaje {
  const nombres = [...new Set((opts.nombres || []).filter(Boolean))];
  const semillas = opts.specs ?? null;
  const proveedor = String(opts.provider || "").toLowerCase();
  const canal: CanalAccion =
    opts.canal && opts.canal !== "auto"
      ? opts.canal
      : nombres.length > 0
        ? "nativo"
        : PROVEEDORES_SIN_CICLO_DE_TEXTO.has(proveedor)
          ? "ninguno"
          : "texto";

  const sinManual = nombres.filter((n) => !TOOL_MANUALS[n]);
  const base: ResultadoAbordaje = {
    texto: "",
    chars: 0,
    presupuesto: Math.max(Math.round(opts.presupuesto ?? 1500), 0),
    excedido: false,
    excesoChars: 0,
    canal,
    leyes: "enteras",
    herramientasTotales: nombres.length,
    herramientasEnIndice: 0,
    herramientasSinManual: sinManual,
    herramientasSinNota: [],
    herramientasConDetalle: 0,
    bloquesOmitidos: 0,
    mapaRutasChars: 0,
  };

  // Sin canal de acción no se promete acción: ahí manda `guardaSinHerramientas()`
  // («di que no puedes»). Dos órdenes contradictorias en el mismo system prompt es
  // exactamente lo que produce modelos que dudan de todo.
  if (canal === "ninguno") return base;
  if (canal === "nativo" && nombres.length === 0) return base;

  const presupuesto = base.presupuesto;

  // El mapa de rutas, con el camino REAL de esta máquina si el servidor lo pasó.
  // `COSTO_MAPA_RUTAS` está medido sobre la versión genérica; una raíz larga
  // (C:\\Users\\usuario\\...) añade unos cientos de caracteres, y eso se ve igual
  // que cualquier otro exceso: en `excedido`, declarado, no callado.
  const mapaRutas =
    opts.raizDatos || opts.raizApp
      ? textoDeRutasSistema({ raizDatos: opts.raizDatos, raizApp: opts.raizApp })
      : MAPA_DE_RUTAS;

  // Canal de texto con el catálogo vacío: el estándar viaja (es la cláusula
  // anti-mentira la que más interesa aquí), pero NO se promete una mano que el
  // turno no tiene.
  if (nombres.length === 0) {
    const texto = `${CONTRATO_DE_ACCION}\n\n${mapaRutas}\n\nTRANSPORTE EN ESTE TURNO: no hay ninguna herramienta activa en este turno. No puedes ejecutar acciones: di exactamente qué te falta en vez de simular el resultado.\n\nLEYES DEL MOTOR:\n${leyesEn("enteras")}`;
    return { ...base, texto, chars: texto.length, mapaRutasChars: mapaRutas.length, excedido: texto.length > presupuesto, excesoChars: Math.max(0, texto.length - presupuesto) };
  }

  const transporte =
    canal === "nativo"
      ? "Tus herramientas van por el CANAL DE FUNCIONES del protocolo: usa el nombre y el esquema exactos."
      : "Sin canal de funciones: EMITE la accion como TEXTO dentro de tu respuesta, con la valla del punto 2. El motor la detecta y la ejecuta.";

  // ── P0 · el catálogo completo. Nunca se recorta: si no cabe el detalle, se va el
  //    detalle; los nombres se quedan hasta el último carácter.
  const encabezadoP0 = `HERRAMIENTAS DE ESTE TURNO (${nombres.length} — TODAS nombradas, usa el nombre EXACTO):`;
  const indice = lineaIndice(nombres);
  const bloqueP0 = `${encabezadoP0}\n${indice}`;

  // ── P2 · estado MCP. Si no hay, se dice: un modelo que no sabe que no hay MCP
  //    inventa `consultarEscritorioMCP` y cae en «hazlo / no puedo».
  const mcpNombres = [...new Set((opts.mcp?.nombres || []).filter(Boolean).filter((n) => nombres.includes(n)))];
  // Tres estados honestos, no dos: hay MCP y están en el catálogo · hay MCP pero
  // este turno no recibió ninguna de esas herramientas · no hay MCP. El segundo es
  // el que producía el «sé que tengo MCP pero nadie me lo nombra»: decir «sí» con
  // una lista vacía es exactamente tan mentira como callarlo.
  const bloqueP2 = !opts.mcp?.presente
    ? "MCP EN ESTE TURNO: no hay servidores MCP cargados. No inventes herramientas de MCP."
    : mcpNombres.length > 0
      ? `MCP EN ESTE TURNO: sí (${mcpNombres.length}): ${mcpNombres.join(", ")}. Son herramientas normales: llámalas por su nombre exacto.`
      : "MCP EN ESTE TURNO: hay servidores MCP cargados, pero NINGUNA de sus herramientas está en tu catálogo de ahora. No las llames: no te responderían.";

  const piezasFijas = (densidad: DensidadLeyes) =>
    `${CONTRATO_DE_ACCION}\n\n${mapaRutas}\n\nTRANSPORTE EN ESTE TURNO: ${transporte}\n\nLEYES DEL MOTOR:\n${leyesEn(densidad)}\n\n${bloqueP0}\n\n${bloqueP2}`;

  // ── P1 · densidad de leyes: la MÁS completa que quepa. En ningún caso se corta
  //    una frase por el medio; se cambia de forma, y la forma elegida se reporta.
  let densidad: DensidadLeyes = "enteras";
  let texto = piezasFijas(densidad);
  for (const d of DENSIDADES) {
    const candidato = piezasFijas(d);
    if (candidato.length <= presupuesto || d === DENSIDADES[DENSIDADES.length - 1]) {
      densidad = d;
      texto = candidato;
      break;
    }
  }
  // Por debajo del suelo de títulos el suelo manda: se envía igual (los nombres
  // son P0) y se declara el exceso. Nunca se devuelve un catálogo mutilado.
  const excedido = texto.length > presupuesto;

  // ── P3 · bloques opcionales (manos, rutas HTTP por dominio). Caen antes que el
  //    detalle solo si no caben; si caben, enriquecen sin desplazar nada.
  let bloquesOmitidos = 0;
  for (const bloque of opts.bloquesOpcionales || []) {
    const b = String(bloque || "").trim();
    if (!b) continue;
    const probar = texto.length + 2 + b.length;
    if (probar > presupuesto) {
      bloquesOmitidos++;
      continue;
    }
    texto += `\n\n${b}`;
  }

  // ── P4 · una línea por herramienta. Lo PRIMERO en caer, y cae herramienta a
  //    herramienta: nunca se corta una línea a mitad ni se deja el bloque muerto.
  const sinNota: string[] = [];
  let conDetalle = 0;
  const AVISO = (faltan: number) =>
    `\n[…detalle de ${faltan} de ${nombres.length} fuera por presupuesto. LOS NOMBRES DE ARRIBA ESTAN COMPLETOS: ante la duda sobre una que no ves en detalle, llama con el nombre exacto y args {}.]`;

  const lineas = nombres.map((n) => {
    const nota = notaDeHerramienta(n, semillas);
    if (nota.fuente === "ninguna") {
      sinNota.push(n);
      return null;
    }
    return `- ${n}: ${nota.texto}`;
  });

  const encabezadoP4 = "DETALLE DE LAS HERRAMIENTAS:";
  let detalleAbierto = false;
  let avisoReservado = 0;
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea) continue;
    const faltanDespues = lineas.slice(i + 1).filter(Boolean).length;
    avisoReservado = faltanDespues > 0 ? AVISO(faltanDespues).length : 0;
    const probar =
      texto.length + (detalleAbierto ? 1 : 2 + encabezadoP4.length) + linea.length + avisoReservado;
    if (probar > presupuesto) break;
    texto += (detalleAbierto ? "\n" : `\n\n${encabezadoP4}\n`) + linea;
    detalleAbierto = true;
    conDetalle++;
  }
  if (detalleAbierto && conDetalle < lineas.filter(Boolean).length) {
    texto += AVISO(lineas.filter(Boolean).length - conDetalle);
  } else if (!detalleAbierto && lineas.some(Boolean) && texto.length + 2 + encabezadoP4.length <= presupuesto) {
    texto += `\n\n${encabezadoP4}\n(no cabe ninguna línea de detalle: usa los nombres de arriba).`;
  }

  const enIndice = nombres.filter((n) => apareceComoNombre(texto, n)).length;

  return {
    ...base,
    texto,
    chars: texto.length,
    excedido: excedido || texto.length > presupuesto,
    excesoChars: Math.max(0, texto.length - presupuesto),
    leyes: densidad,
    herramientasEnIndice: enIndice,
    herramientasSinNota: sinNota,
    herramientasConDetalle: conDetalle,
    bloquesOmitidos,
    mapaRutasChars: mapaRutas.length,
  };
}

/** ¿El nombre está presente como nombre suelto (no dentro de otro identificador)? */
export function apareceComoNombre(texto: string, nombre: string): boolean {
  const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escapado}([^A-Za-z0-9_]|$)`).test(texto);
}

// ============================================================
// Auditoría (la fase 5 del proceso: el juez, no la intención)
// ============================================================

export interface AuditoriaAbordaje {
  herramientasTotales: number;
  conManual: number;
  sinManual: string[];
  /** Las que se ofrecen SIEMPRE (HUESO_DE_OBRA) y no tienen manual: las peores. */
  huesoSinManual: string[];
  mcpSinManual: string[];
  /** Medida real del bloque a presupuesto ilimitado. */
  charsIndice: number;
  charsDetalle: number;
  invarianteOk: boolean;
  parte: string;
}

/**
 * Estado de la documentación del catálogo, y verificación de que el invariante se
 * sostiene con las herramientas reales. No toca red ni disco: recibe las semillas.
 */
export function auditarManuales(
  nombres: string[],
  opts: {
    specs?: Array<SemillaHerramienta> | Map<string, string> | null;
    hueso?: Iterable<string>;
    esExterna?: (name: string) => boolean;
  } = {}
): AuditoriaAbordaje {
  const lista = [...new Set((nombres || []).filter(Boolean))];
  const sinManual = lista.filter((n) => !TOOL_MANUALS[n]);
  const hueso = new Set(opts.hueso || []);
  const externa = opts.esExterna || (() => false);
  const completo = construirAbordaje({
    nombres: lista,
    specs: opts.specs ?? null,
    mcp: { presente: false, nombres: [] },
    provider: "zai",
    presupuesto: 200000,
    canal: "nativo",
  });
  // Una SONDA, no un presupuesto de envío: se construye el índice apretado a 800 chars
  // solo para comprobar que el constructor NO recorta herramientas al apretarlo.
  const SONDA_PRESUPUESTO = 800;
  const minimo = construirAbordaje({
    nombres: lista,
    specs: opts.specs ?? null,
    mcp: { presente: false, nombres: [] },
    provider: "zai",
    presupuesto: SONDA_PRESUPUESTO,
    canal: "nativo",
  });
  const parte =
    `· CATÁLOGO: ${lista.length} herramientas · con manual ${lista.length - sinManual.length} · sin manual ${sinManual.length}` +
    (sinManual.length ? ` (${sinManual.join(", ")})` : "") +
    ` · índice ${completo.chars} chars · detalle completo ${completo.herramientasConDetalle}/${lista.length}\n` +
    // v1.94.2 · LA LÍNEA ANTERIOR NO SE PODÍA LEER (Mario, 30/10: «esto no sé qué es»).
    // Decía, en una sola frase: `102/102 nombres → OK · enviado 6085 chars (excedido:
    // true)`. El «OK» hablaba del invariante de verdad (apretar el presupuesto NO
    // recorta ninguna herramienta) y el «excedido» del tamaño medido contra una SONDA de
    // 800 que nunca fue el presupuesto de envío. Dos afirmaciones distintas usando la
    // misma palabra es un informe que no sirve para decidir: parece que algo falló y a la
    // vez que nada falló. Se separan en dos líneas, cada una con su número y su lectura.
    `· INVARIANTE (apretar el presupuesto no recorta herramientas): con la sonda de ` +
    `${SONDA_PRESUPUESTO} chars siguen nombradas ${minimo.herramientasEnIndice}/${lista.length} → ` +
    `${minimo.herramientasEnIndice === lista.length ? "OK" : "ROTO"}\n` +
    `· PRESUPUESTO: la sonda pedía ${SONDA_PRESUPUESTO} y el índice mide ${minimo.chars} chars ` +
    `(${(minimo.chars / SONDA_PRESUPUESTO).toFixed(1)}×). Exceder es la conducta elegida por la ` +
    `casa —recortar una herramienta cuesta más que el char que ahorra—, así que se envía igual. ` +
    `El presupuesto real de envío es el de la línea ABORDAJE, no este número.`;
  return {
    herramientasTotales: lista.length,
    conManual: lista.length - sinManual.length,
    sinManual,
    huesoSinManual: [...hueso].filter((n) => !TOOL_MANUALS[n]),
    mcpSinManual: lista.filter((n) => externa(n) && !TOOL_MANUALS[n]),
    // v1.94.2 · esto venía leyendo el tamaño de la SONDA de 800, no el índice que se
    // envía. Un campo llamado `charsIndice` que no mide el índice es la mitad del
    // «no sé qué es» de la línea anterior.
    charsIndice: completo.chars,
    charsDetalle: completo.chars,
    invarianteOk: minimo.herramientasEnIndice === lista.length && completo.herramientasEnIndice === lista.length,
    parte,
  };
}

// ============================================================
// El plan del turno (lo que consume server.ts: una llamada, no un bloque)
// ============================================================

export interface PlanAbordaje {
  /** El modelo real al que se le va a hablar (defecto 4: uno solo, no once). */
  modeloEfectivo: string;
  /** El esquema `tools` que recibe el proveedor EN ESTE turno. */
  herramientas: any[];
  /** Los nombres de ese esquema: el mismo array que alimenta el manual. */
  nombres: string[];
  /** Lo que nombra el manual (canal nativo → `nombres`; canal texto → todo). */
  conjuntoManual: string[];
  presupuesto: PresupuestoAbordaje;
  abordaje: ResultadoAbordaje;
  /** Una línea de log honesta: cobertura, chars, densidad de leyes y exceso. */
  parte: string;
  /** true si hay que gritarlo (excedido o invariante roto), no solo informarlo. */
  esProblema: boolean;
  notificar: () => void;
}

/**
 * FASES 2 y 3 del proceso, en una sola llamada: calcula el conjunto del turno y su
 * manual, y garantiza que ambos hablan del MISMO catálogo. `getTools` se inyecta
 * desde el servidor porque conocer las herramientas activas depende del estado vivo
 * del IDE (modo PC, extensiones abiertas, red, sandbox); todo lo demás es puro.
 */
export function planDeAbordaje(opts: {
  modeloEfectivo: string;
  provider: string;
  perfil: PerfilAbordaje;
  getTools: (modeloEfectivo: string) => any[];
  ejecutables: string[];
  descripcionDe?: (name: string) => string | undefined;
  esExterna?: (name: string) => boolean;
  /** Raíz de datos ya resuelta por el servidor (PROJECT_ROOT). Ver `construirAbordaje`. */
  raizDatos?: string;
  /** Raíz de la INSTALACIÓN (RAIZ_APP). Ver `textoDeRutasSistema`. */
  raizApp?: string;
}): PlanAbordaje {
  const proveedor = String(opts.provider || "").toLowerCase();
  const herramientas = opts.getTools(opts.modeloEfectivo) || [];
  const nombres = herramientas.map((t: any) => t?.function?.name).filter(Boolean) as string[];
  const canal: CanalAccion =
    nombres.length > 0
      ? "nativo"
      : PROVEEDORES_SIN_CICLO_DE_TEXTO.has(proveedor)
        ? "ninguno"
        : "texto";
  const ejecutables = (opts.ejecutables || []).filter(Boolean);
  const conjuntoManual = canal === "nativo" ? nombres : ejecutables;
  const specs = conjuntoManual.map((n: string) => ({
    name: n,
    description: opts.descripcionDe ? opts.descripcionDe(n) : undefined,
  }));
  const mcpCargado = ejecutables.filter((n: string) => (opts.esExterna ? opts.esExterna(n) : false));
  const pres = presupuestoAbordaje(opts.perfil || {}, conjuntoManual.length, {
    longitudNombres: conjuntoManual.join("").length,
    charsDetalle: charsDetalleDe(conjuntoManual, specs),
  });
  const abordaje = construirAbordaje({
    nombres: conjuntoManual,
    specs,
    provider: proveedor,
    presupuesto: pres.recomendado || pres.suelo || 1900,
    mcp: { presente: mcpCargado.length > 0, nombres: mcpCargado },
    raizDatos: opts.raizDatos,
    raizApp: opts.raizApp,
    canal,
  });
  const incompleto = abordaje.texto !== "" && abordaje.herramientasEnIndice !== abordaje.herramientasTotales;
  // Un abordaje con texto y sin mapa de rutas es el estado que produjo los dos
  // rojos de Windows: el modelo operando a ciegas. Se grita, no se loguea fino.
  const sinMapa = abordaje.texto !== "" && abordaje.mapaRutasChars === 0;
  const esProblema = abordaje.excedido || incompleto || sinMapa;
  const parte = abordaje.texto
    ? `📚 ABORDAJE "${opts.modeloEfectivo || "(sin nombre)"}" (${proveedor || "?"}): ` +
      `manual ${abordaje.herramientasEnIndice}/${abordaje.herramientasTotales} · detalle ${abordaje.herramientasConDetalle} · ` +
      `leyes ${abordaje.leyes} · rutas ${abordaje.mapaRutasChars > 0 ? `✓ ${abordaje.mapaRutasChars}` : "✗ AUSENTES"} · ` +
      `${abordaje.chars} chars (presupuesto ${abordaje.presupuesto}) · canal ${abordaje.canal}` +
      (abordaje.excedido ? ` · ⚠ EXCEDIDO +${abordaje.excesoChars} chars` : "") +
      (abordaje.herramientasSinManual.length
        ? ` · sin manual ${abordaje.herramientasSinManual.length} (hablan con la description del registro)`
        : "") +
      (incompleto ? " · ✗ INVARIANTE ROTO: hay herramientas activas sin nombre en el manual" : "")
    : "";
  return {
    modeloEfectivo: opts.modeloEfectivo,
    herramientas,
    nombres,
    conjuntoManual,
    presupuesto: pres,
    abordaje,
    parte,
    esProblema,
    notificar: () => {
      if (!parte) return;
      if (esProblema) console.warn(`[CerebroNico] ${parte}`);
      else console.log(`[CerebroNico] ${parte}`);
    },
  };
}

/**
 * FASE 5 · VERIFICACIÓN — el estado real del catálogo, una vez por proceso.
 * Es material de log y de arranque: si el invariante se rompe con las herramientas
 * de verdad (no con las del test), aquí se lee, no en la queja del usuario.
 */
let auditoriaEmitida = false;
export function auditarCatalogoUnaVez(
  nombres: string[],
  opts: {
    specs?: Array<SemillaHerramienta> | Map<string, string> | null;
    hueso?: Iterable<string>;
    esExterna?: (name: string) => boolean;
  } = {}
): void {
  if (auditoriaEmitida || !nombres || nombres.length === 0) return;
  auditoriaEmitida = true;
  try {
    const aud = auditarManuales(nombres, opts);
    console.log(`[CerebroNico] 🔍 AUDITORÍA DE MANUALES\n${aud.parte}`);
    if (!aud.invarianteOk) {
      console.warn("[CerebroNico] ✗ El catálogo NO llega completo al manual: revisar src/engine/abordaje.ts");
    }
    if (aud.huesoSinManual.length > 0) {
      console.warn(`[CerebroNico] ⚠ Herramientas del hueso de obra sin manual: ${aud.huesoSinManual.join(", ")}`);
    }
  } catch { /* la auditoría nunca tumba un turno */ }
}
