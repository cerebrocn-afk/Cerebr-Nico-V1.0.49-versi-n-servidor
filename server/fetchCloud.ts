/**
 * fetchCloud.ts — v1.46.0 · LA DESCARGA CON TECHO DE TIEMPO, FUERA DEL MONOLITO
 * =============================================================================
 * MOVIMIENTO, NO MEJORA. Eran 21 líneas autocontenidas dentro de `server.ts`.
 * Salen por dos motivos, y el segundo es el que obliga:
 *   1. El monolito tiene trinquete (`contrato-rutas.json`): no puede crecer.
 *   2. Al mover las rutas de descubrimiento de modelos a `server/routers/modelos.ts`,
 *      ese módulo necesita esta función. Importarla desde `server.ts` habría
 *      creado una importación CIRCULAR (server.ts → modelos.ts → server.ts).
 *      Un módulo hoja importado por los dos rompe el ciclo y no duplica código.
 */

// El techo de espera del PRIMER byte, movido CON la función que lo usa: era la
// única que lo leía. Sin esto, el módulo no compilaba (no había de dónde sacarlo).
// v1.6.21 — 45 s → 120 s. ESTE TECHO ERA DEMASIADO AGRESIVO, Y LO PAGABA EL
// USUARIO CON «A VECES NO RESPONDEN».
//
// El razonamiento de la v1.6.16 sigue siendo bueno: no dejar la interfaz en
// blanco ocho minutos. Pero un proveedor SOBRECARGADO —Z.ai devolviendo 1305—
// no está mudo: está lento. Tarda 50, 60, 90 segundos en arrancar y luego
// escribe. A los 45 s se le cortaba, y el usuario no veía ni un error de Z.ai
// ni una respuesta: no veía nada.
//
// 120 s separa bien los dos casos: un cuelgue real se corta igual, y un
// proveedor lento pero vivo ya no se mata. Se pierde algo de inmediatez en el
// aviso de cuelgue, y se gana que Z.ai sobrecargado sí conteste.
//
// La solución de fondo sería un techo de INACTIVIDAD (cortar solo si pasan N
// segundos sin que llegue nada, en vez de un límite fijo antes de la primera
// cabecera), pero eso vive donde se consume el cuerpo del stream, no aquí.
import { presupuestoPrimerByte, registrarPrimerByte, causaReal, modelosMedidos, sugerirAlternativa } from "../src/engine/relojModelos";
import { registrarFalloProveedor, registrarExitoProveedor, enCuarentena, notaCuarentena } from "../src/engine/fusibleProveedores";
// v1.87.0 · LA ADUANA DE SALIDA Y LA ESPERA QUE EL PROVEEDOR DECLARA.
// Las dos viven en módulos puros con suite propia; acá solo se llaman.
import { sanearInit, esDestinoLocal } from "../src/engine/guardaEgreso";
import { puedeLlamar, registrarCuota, notaEspera } from "../src/engine/cuotaProveedor";
const CLOUD_FIRST_BYTE_TIMEOUT_MS = 120_000;
// ============================================================
// v1.57.18 · EL RELOJ MEDIDO — el 120 de arriba deja de ser EL tope y pasa a ser
// el PISO de último recurso. El presupuesto real lo da relojModelos: p95 medido
// de las últimas llamadas de ESE modelo x margen, con piso y techo propios. En
// la sesión 1792103924951 glm-4.5-flash murió 2x contra el 120 fijo y 4x con
// `fetch failed` cuya causa real viajaba oculta: ahora el mensaje la dice
// (ECONNRESET, ETIMEDOUT...) y cada resultado alimenta la medición y el fusible.
// ============================================================
/** v1.87.0 · `Headers` → objeto plano, que es lo que habla `cuotaProveedor`. */
function cabecerasPlanas(h: Headers | undefined): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!h || typeof h.forEach !== "function") return salida;
  h.forEach((valor, nombre) => { salida[nombre.toLowerCase()] = valor; });
  return salida;
}

export function modeloDelCuerpo(init: RequestInit): string {
  try {
    const b = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    return String((b && (b.model || b.modelo)) || "");
  } catch { return ""; }
}
/**
 * v1.57.18 · LA PUERTA DEL FUSIBLE UNIVERSAL — si el modelo está en cuarentena
 * (red/cuota/capacidad/tiempo, ver fusibleProveedores.ts) NO se llama: se explica
 * el porqué y se propone la alternativa MEDIDA. Cubre de una vez los diez
 * proveedores de nube. Vive fuera del cuerpo de fetchCloud a propósito: la valla
 * de esperaNube mide los primeros 1600 caracteres del guardián.
 */
function guardiaDeCuarentena(modelo: string): void {
  if (!enCuarentena(modelo)) return;
  throw new Error(notaCuarentena(modelo, sugerirAlternativa(modelosMedidos().filter((m) => m !== modelo))));
}

/** v1.57.18 · deja de culpar a la clave cuando se cayó la red: la causa real viaja en el mensaje. */
function registrarFalloConCausa(modelo: string, err: any): void {
  registrarFalloProveedor(modelo, err);
  const causa = causaReal(err);
  if (!causa) return;
  try { err.message = `${err.message} · causa real: ${causa}`; } catch { /* mensaje inmutable */ }
}

export interface OpcionesFetchCloud {
  /**
   * Techo propio para ESTA llamada, en ms. Sirve para lo que NO es generación:
   * listar catálogos. El techo de 120 s está pensado para un modelo que tarda
   * en escribir el primer token; una lista de modelos que tarda 120 s no está
   * «lenta», está muerta, y mientras tanto ocupa una conexión del navegador.
   * (v2.1.6 — «servidor local caído» con el servidor perfectamente sano.)
   */
  plazoMs?: number;
  /**
   * v1.0.37 · LISTAR MODELOS NO ES GENERAR, Y NO PUEDE QUEDAR DETRÁS DE LOS
   * FUSIBLES DE LA GENERACIÓN.
   *
   * Medido (sesión del 20/11, «puse la clave de un modelo pago y ni cargaron
   * los modelos»): el catálogo llamaba a este guardián como si fuera un turno
   * de chat. Con eso, un `/models` lento dejaba al ANFITRIÓN en cuarentena
   * (15 min, y 30 al reincidir) y, a partir de ahí, cada reintento del usuario
   * —que es lo que hace cuando «no cargan»— se comía un `enCuarentena` sin
   * tocar la red. El catálogo no volvía ni con la clave perfecta, y reiniciar
   * era la única salida. Un 429 en la lista, igual: bloqueaba el anfitrión
   * entero durante la espera que declaró el proveedor.
   *
   * Con `catalogo: true` la petición sigue teniendo techo de tiempo, pero no
   * consulta ni alimenta fusibles: no espera cuota, no respeta cuarentena y no
   * abre ninguna. Un catálogo fallido no puede envenenar el estado del que
   * dependen las generaciones.
   */
  catalogo?: boolean;
}

export async function fetchCloud(
  url: string,
  init: RequestInit,
  opciones: OpcionesFetchCloud = {},
): Promise<globalThis.Response> {
  let anfitrion = url;
  try { anfitrion = new URL(url).host; } catch { /* se queda la URL cruda */ }
  // v1.0.37 · un catálogo no pregunta por fusibles ni los abre (ver `catalogo`).
  const esCatalogo = opciones.catalogo === true;
  if (!esCatalogo) {
    // v1.87.0 · antes de gastar un byte: ¿este proveedor dijo «vuelve en X»?
    const cuota = puedeLlamar(anfitrion, Date.now());
    if (!cuota.permitido) throw new Error(notaEspera(anfitrion, cuota));
  }
  // v1.87.0 · la aduana de salida. A la máquina no se le censura nada.
  const initEgreso = esDestinoLocal(url) ? init : sanearInit(init);
  const modelo = modeloDelCuerpo(initEgreso) || anfitrion;
  if (!esCatalogo) guardiaDeCuarentena(modelo); // v1.57.18 · EL FUSIBLE UNIVERSAL (vive arriba, fuera del cuerpo del guardián)
  const presupuesto = presupuestoPrimerByte(modelo);
  // El plazo propio NUNCA alarga el de la casa: sólo puede bajar el techo.
  const topeMs =
    typeof opciones.plazoMs === "number" && opciones.plazoMs > 0
      ? Math.min(opciones.plazoMs, Math.max(CLOUD_FIRST_BYTE_TIMEOUT_MS, presupuesto.ms))
      : Math.max(CLOUD_FIRST_BYTE_TIMEOUT_MS, presupuesto.ms);
  const arranque = Date.now();
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), topeMs);
  try {
    const r = await fetch(url, { ...initEgreso, signal: ctrl.signal });
    // Llegaron las cabeceras: ese ES el primer byte real. Acá sí se mide.
    // v1.0.37 · salvo en un catálogo: medir un listado como si fuera un turno
    // contamina el presupuesto del modelo y el fusible del anfitrión.
    if (!esCatalogo) {
      // v1.87.0 · y acá se guarda lo que el proveedor dijo sobre su cuota.
      registrarCuota(anfitrion, r.status, cabecerasPlanas(r.headers), Date.now());
      registrarPrimerByte(modelo, Date.now() - arranque);
      registrarExitoProveedor(modelo);
    }
    return r;
  } catch (err: any) {
    // El temporizador se limpia en el `finally` en cuanto llegan las cabeceras,
    // así que llegar aquí con AbortError significa que NO llegaron.
    if (err?.name === "AbortError") {
      const fallo = new Error(
        `sin respuesta de ${anfitrion} en los primeros ${Math.round(topeMs / 1000)} s ` +
        `— venció el tramo del PRIMER BYTE (presupuesto ${presupuesto.etiqueta}; modelo ${modelo})`
      );
      // v1.0.37 · un catálogo que vence NO abre cuarentena: si la abriera, el
      // reintento del usuario se comería la pausa y el modelo no cargaría nunca.
      if (!esCatalogo) registrarFalloProveedor(modelo, fallo);
      throw fallo;
    }
    if (esCatalogo) {
      const causa = causaReal(err);
      if (causa) { try { err.message = `${err.message} · causa real: ${causa}`; } catch { /* mensaje inmutable */ } }
      throw err;
    }
    registrarFalloConCausa(modelo, err);
    throw err;
  } finally {
    clearTimeout(temporizador);
  }
}
