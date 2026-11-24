// ============================================================
// PIVOT EN VIVO — v1.57.19 · F2: las manos del rescate local
// ============================================================
// El cerebro es puro (src/engine/pivotProveedores.ts). Acá vive lo que necesita
// hablar con el mundo: el inventario real de Ollama, el ranking con las
// mediciones de ESTA máquina, la decisión con consentimiento, y el envío del
// texto del bucle de agente en trozos (extraído del monolito para que la valla
// de líneas siga respirando).
import { ordenarCandidatos, decidirPivot, type ConsentimientoNube } from "../src/engine/pivotProveedores";
import { medicionDe, presupuestoPrimerByte } from "../src/engine/relojModelos";
import { enCuarentena, notaCuarentena, registrarFalloProveedor } from "../src/engine/fusibleProveedores";
import { sugerirAlternativa, modelosMedidos } from "../src/engine/relojModelos";
import { registrarRescateDelTurno } from "../src/engine/pivotProveedores";
import { tagsOllama } from "./tagsCache";

export interface CtxMinimo {
  isAborted(): boolean;
  sendChunk(t: string): void;
  sendDone(modelo: string): void;
}

export interface InventarioLocal {
  /** Todos los modelos locales disponibles. */
  modelos: string[];
  /** Los que YA están cargados en memoria (Ollama /api/ps) — costo de contexto cero. */
  cargados: string[];
}

/**
 * v1.57.19 · F2 · El inventario real: /api/tags para el catálogo y /api/ps para
 * saber cuáles están CARGADOS. La verdad la dice Ollama, no una suposición.
 */
export async function cargarInventarioLocal(targetUrl: string): Promise<InventarioLocal> {
  const inventario: InventarioLocal = { modelos: [], cargados: [] };
  try {
    // v2.0.1 · caché compartida: /api/tags tarda ~4,5 s en esta máquina y el
    // timeout de 2,5 s abortaba SIEMPRE. La caché deduplica y sirve la última
    // lista buena, así el inventario deja de llegar vacío y el IDE no salta de
    // proveedor creyendo que Ollama no tiene modelos.
    const foto = await tagsOllama(targetUrl);
    inventario.modelos = foto.modelos.map((m) => String(m.name || m.model || "")).filter(Boolean);
  } catch { /* sin catálogo no hay candidatos: no se inventa ninguno */ }
  try {
    const rp = await fetch(`${targetUrl}/api/ps`, { signal: AbortSignal.timeout(1500) });
    if (rp.ok) {
      const dp: any = await rp.json();
      inventario.cargados = ((dp?.models || []) as any[]).map((m: any) => String(m?.name || m?.model || "")).filter(Boolean);
    }
  } catch { /* sin /api/ps todos quedan «fríos»: es el peor caso, no una mentira */ }
  return inventario;
}

/** El consentimiento del usuario viaja en el cuerpo del pedido: si/no/preguntar. */
export function consentimientoDeRescate(body: any): ConsentimientoNube {
  const v = String(body?.rescateNube || "").toLowerCase();
  return v === "si" ? "si" : v === "no" ? "no" : "preguntar";
}

/** La pausa de cuarentena, si corresponde: mensaje honesto o null. */
export function notaDeCuarentenaLocal(modelo: string): string | null {
  if (!enCuarentena(modelo)) return null;
  return notaCuarentena(modelo, sugerirAlternativa(modelosMedidos().filter((m) => m !== modelo)));
}

export interface ResultadoPivot {
  /** true = hay rescate: el llamador cambia de modelo y reintenta. */
  continuar: boolean;
  modelo?: string;
  aviso: string;
  /** Presupuesto del modelo que rescata (medido o por clase), para el reloj. */
  relojMs?: number;
  relojEtiqueta?: string;
  /** Texto honesto para el usuario cuando NO se puede rescatar. */
  mensajeError: string;
}

/**
 * Decide el rescate local: registra el fallo en el fusible, arma el ranking con
 * las mediciones reales y consulta el consentimiento. Devuelve el veredicto y el
 * aviso honesto (nunca «optimizando»).
 */
export function intentarPivotLocal(args: {
  modeloEnVuelo: string;
  inventarioLocal: InventarioLocal;
  textoEntregado: number;
  pivotesUsados: number;
  consentimiento: ConsentimientoNube;
  relojLocalMs: number;
  relojLocalEtiqueta: string;
}): ResultadoPivot {
  const fallo = new Error(
    `sin respuesta de ${args.modeloEnVuelo} en los primeros ${Math.round(args.relojLocalMs / 1000)} s (timeout de inactividad; presupuesto ${args.relojLocalEtiqueta})`
  );
  registrarFalloProveedor(args.modeloEnVuelo, fallo);
  const cargados = new Set(args.inventarioLocal.cargados);
  const candidatos = args.inventarioLocal.modelos
    .filter((m) => m && m !== args.modeloEnVuelo)
    .map((m) => ({ modelo: m, proveedor: "ollama" as const, pesoCalidad: 1, esLocal: true, cargado: cargados.has(m) }));
  const medidos: Record<string, { p50: number } | undefined> = {};
  for (const m of args.inventarioLocal.modelos) {
    const med = medicionDe(m);
    if (med) medidos[m] = { p50: med.p50 };
  }
  const ranking = ordenarCandidatos(candidatos, { medidos, enCuarentena: (m) => !!enCuarentena(m), fallado: args.modeloEnVuelo });
  const decision = decidirPivot(
    { modeloElegido: args.modeloEnVuelo, contenidoEntregado: args.textoEntregado > 0, pivotesUsados: args.pivotesUsados, consentimiento: args.consentimiento },
    ranking
  );
  if (decision.pivotar && decision.esLocal && decision.modelo) {
    const reloj = relojDeModeloLocal(decision.modelo, args.inventarioLocal);
    // El acta y la visibilidad viven acá: el monolito sólo cambia de modelo y reintenta.
    registrarRescateDelTurno({ elegido: args.modeloEnVuelo, rescate: decision.modelo, proveedor: "ollama", causa: "silencio del tramo PRIMER BYTE", aLosMs: args.relojLocalMs });
    console.log(`[ai/stream] ${decision.aviso}`);
    return { continuar: true, modelo: decision.modelo, aviso: decision.aviso, relojMs: reloj.ms, relojEtiqueta: reloj.etiqueta, mensajeError: fallo.message };
  }
  const mensajeError = decision.aviso && !decision.pivotar ? `${fallo.message} · ${decision.aviso}` : fallo.message;
  return { continuar: false, aviso: decision.aviso, mensajeError };
}

/** El bucle de agente entrega su texto de a 3 palabras (v2.0), con su pausa. */
export async function enviarEnTrozos(ctx: CtxMinimo, texto: string, pausaMs = 15): Promise<void> {
  const palabras = String(texto).split(" ");
  for (let i = 0; i < palabras.length; i += 3) {
    if (ctx.isAborted()) break;
    ctx.sendChunk(palabras.slice(i, i + 3).join(" ") + " ");
    await new Promise((r) => setTimeout(r, pausaMs));
  }
}

// ============================================================
// v1.66.1 · EL RELOJ DE UN MODELO LOCAL, CON LO QUE SABEMOS DE ÉL
// ------------------------------------------------------------
// SALE DEL MONOLITO por el trinquete de líneas de server.ts, y porque acá ya
// vive `InventarioLocal`: nadie más cerca de la verdad de /api/ps.
//
// RAÍZ (sesión exportada 1792727665798, 23/10): seis modelos chicos —qwen3-vl:2b,
// smollm2:1.5b, gemma3:270m, deepseek-coder:1.3b, qwen3:0.6b, qwen2.5:0.5b—
// murieron TODOS a los ~60-64 s con «El modelo local cayó demasiado tiempo».
// Sesenta segundos son exactamente `BASES["local-chico"]`: el reloj le pedía al
// primer byte que llegara como si el modelo ya estuviera servido, pero el
// usuario había rotado por seis modelos en dos minutos y cada rotación expulsa al
// anterior. Ninguno estaba en RAM. El primer byte tenía que incluir volcar los
// pesos y procesar el prompt, y para eso 60 s no alcanzan ni de lejos.
//
// Dos datos, ambos ya disponibles en el turno, ambos declarados y no adivinados:
//   · `cargadoEnRam` ← `inventarioLocal.cargados` (/api/ps)
//   · `esLocal`      ← el nombre: un `-cloud` por Ollama IGUAL se computa afuera.
// ============================================================
/** `nombre:latest` y `nombre` son el mismo modelo para Ollama. */
const sinEtiquetaDeModelo = (s: string) => String(s || "").toLowerCase().replace(/:latest$/, "");

/** ¿El modelo está ahora mismo en RAM? La dice Ollama por `/api/ps`, no nosotros. */
export function estaCargadoEnRam(inventario: InventarioLocal, modelo: string): boolean {
  const buscado = sinEtiquetaDeModelo(modelo);
  return (inventario?.cargados || []).some(
    (m) => sinEtiquetaDeModelo(m) === buscado || String(m || "").toLowerCase() === String(modelo || "").toLowerCase(),
  );
}

/** Un `-cloud` servido por Ollama no gasta esta máquina: su reloj es el de la nube. */
export function esModeloLocalDeVerdad(modelo: string): boolean {
  return !/-cloud|:cloud|cloud\b|gpt-oss/i.test(String(modelo || ""));
}

/** El presupuesto del primer byte de ESTE modelo local, con carga fría declarada. */
export function relojDeModeloLocal(modelo: string, inventario?: InventarioLocal | null) {
  const esLocal = esModeloLocalDeVerdad(modelo);
  const cargadoEnRam = inventario ? estaCargadoEnRam(inventario, modelo) : undefined;
  const p = presupuestoPrimerByte(modelo, { esLocal, cargadoEnRam });
  console.log(`[ai/stream] \u23f1\ufe0f \u00ab${modelo}\u00bb: ${Math.round(p.ms / 1000)} s de primer byte \u2014 ${p.etiqueta}`);
  return p;
}
