/**
 * ordenDeObra.ts — EL MOTOR LISTA ANTES DE CREAR Y CIERRA LA CERTEZA (v1.22.2 «ORDEN DE OBRA»)
 * =============================================================================================
 * QUÉ ES: el orden de obra del turno creador. Tres piezas puras:
 *   1. LA LISTA ANTES DE COMENZAR — el motor llama a `list_files` por su cuenta,
 *      formatea el estado real del sandbox y lo inyecta como system delante del
 *      primer paso, junto con la directiva de trabajo (`directivaDeObra`).
 *   2. EL MANIFIESTO — cada escritura que el agente intenta queda registrada
 *      (`registrarObra`): ruta, tipo, intentos y último resultado de la herramienta.
 *   3. LA CERTEZA RESUELTA — al cerrar el turno, cada archivo del manifiesto se
 *      contrasta CONTRA EL DISCO (`resolverCertezaObra` + `cierreDeObra`): el
 *      «ok» de la herramienta solo merece el nivel «ejecutado» si la verificación
 *      lo encuentra ahí, con bytes.
 *
 * PARA QUÉ SIRVE: el pedido del usuario es literal — «a la hora de crear se
 * equivoca mucho; resolver certeza; inyectar orden al motor de hacer lista de
 * archivos antes de comenzar». Los errores de creación casi todos nacen de lo
 * mismo: el modelo escribe a ciegas (inventa rutas, pisa archivos que existían,
 * duplica nombres parecidos) y después afirma «creado» sin que nadie lo confirme.
 * La lista previa le quita la adivinanza; la verificación en disco le quita el
 * permiso de afirmar.
 *
 * v1.57.11 · LA CERTEZA TIENE MANOS — sesión exportada del 14/10 (app de
 * finanzas, gpt-oss:120b-cloud): el acta detectaba BIEN el hueco («la
 * herramienta dijo ok pero no está en disco») y lo decía DESPUÉS del «listo»,
 * cuando el turno ya había muerto. El usuario repitió «no funciona» nueve
 * mensajes y el modelo repitió «lo maté físicamente» nueve veces: la certeza
 * honesta sin acción seguía dejando la obra hueca. Ahora el acta también:
 *   4. HACE — `huecosDeCerteza` + `directivaDeRescate`: cuando el juez está por
 *      decir «cerrar» y el disco desmiente una promesa («la herramienta dijo ok
 *      pero no está en disco»), el motor REABRE el turno con una orden concreta
 *      de reparación — tope 2 rondas, y distingue «no existe» de «existe en otra
 *      raíz» (la trampa del proyecto anidado, `sugerirRutaReal`);
 *   5. NO OLVIDA — `registrarHuecosConocidos` + `notaHuecosConocidos`: el acta
 *      roja de este turno viaja como system al turno siguiente, para que el
 *      modelo no vuelva a jurar sobre el hueco que el motor ya midió.
 *
 * POR QUÉ ES PURA FUNCIÓN (y vive fuera de server.ts): el trinquete de la casa —
 * el monolito no gana lógica. `list_files` ya existe; `fs` lo provee quien llama
 * (la `sonda` entra por parámetro, igual que el tiempo entraba en `estado.ts`).
 * Así todo esto se prueba en seco, sin servidor. La certeza reutiliza los tres
 * niveles de `certeza.ts`: una escala, no dos.
 */
import { certezaDe, type Certeza } from "./certeza";

/** Herramientas de OBRA en el sandbox: las que el motor puede verificar en disco.
 *  `pc_write_file` queda fuera a propósito: escribe en la PC real a través del
 *  puente y `fs.statSync` local no puede probarla — afirmar su certeza sería mentir. */
export const HERRAMIENTAS_DE_OBRA = new Set(["write_file", "edit_file", "append_file", "make_dir"]);

/** Ruido estructural: carpetas que nunca son obra y solo inflan la lista. */
const BASURA_LISTADO = /(^|\/)(node_modules|\.git|__pycache__)(\/|$)/;

export interface RegistroObra {
  ruta: string;
  tipo: "archivo" | "carpeta";
  /** Cuántas veces se intentó escribir ESTA ruta en el turno (los reintentos importan). */
  intentos: number;
  /** Resultado de la ÚLTIMA herramienta sobre esta ruta. */
  ultimoOk: boolean;
  ultimoError?: string;
}

export type ManifiestoObra = Map<string, RegistroObra>;

/** Quien llama provee la mirada sobre el disco: {existe, esCarpeta, bytes}. */
export type SondaDisco = (ruta: string) => { existe: boolean; esCarpeta?: boolean; bytes: number };

/**
 * Formatea la lista de archivos que el motor hizo ANTES de comenzar.
 * Determinista y acotada: un micro-modelo de 270M no puede tragar 4000 rutas, y
 * un listado ordenado por nombre permite comparar dos turnos de un vistazo.
 */
export function formatearListado(files: string[], max = 140): string {
  const utiles = [...new Set((files || []).map((f) => String(f).replace(/\\/g, "/")).filter(Boolean))]
    .filter((f) => !BASURA_LISTADO.test(f))
    .sort();
  if (utiles.length === 0) return "(proyecto vacío: todo lo que creás acá es nuevo — igual, volvé a listar antes de dudar)";
  const mostrados = utiles.slice(0, max);
  const resto = utiles.length - mostrados.length;
  const filas = mostrados.map((f) => `  ${f}`).join("\n");
  const corte = resto > 0 ? `\n  … y ${resto} archivo(s) más sin listar (pedí list_files si hace falta)` : "";
  return `${utiles.length} archivo(s) reales en el sandbox:\n${filas}${corte}`;
}

/**
 * LA DIRECTIVA que viaja como system en el primer mensaje inyectado del turno.
 * Corta y en imperativo: con micro-modelos, una norma larga es una norma que se
 * pierde en la ventana de contexto.
 *
 * v1.31.0 · CONTEXTO ENGINE: el retrato del proyecto entra por parámetro
 * (`retrato`, lo produce motorContexto.notaDeContexto contra la RAÍZ REAL del
 * sandbox — por eso la lectura de disco NO vive acá: esta función sigue siendo
 * pura y su valla de ≤1400 caracteres solo atañe al ORDEN; el retrato trae su
 * propio tope de 900 y es opcional: sin retrato, la directiva es exactamente
 * la de v1.22.2 ampliada con la regla 5).
 */
/**
 * v1.60.0 · DOBLE ÁRBOL — reglas de enrutamiento que viajan al system prompt.
 * Le dice al motor que hay dos proyecciones del workspace y cuándo usar cada
 * herramienta de ingesta/promoción, para no pisar material del usuario ni
 * cargar de contexto archivos que no son de la obra.
 */
export const REGLAS_ENRUTAMIENTO_ARBOLES =
  "6) DOBLE ÁRBOL: lo que subió el usuario NO está en tu sandbox hasta promoverlo; para MODIFICAR un archivo ajeno llamá antes promover_archivo_sandbox(path).";

export function directivaDeObra(listado: string, retrato = ""): string {
  const base =
    "ORDEN DE OBRA (v1.22.2) — antes de comenzar, el motor ya hizo la LISTA DE ARCHIVOS REAL:\n" +
    `${listado}\n` +
    "Reglas del turno:\n" +
    "1) No inventes rutas: creá sobre lo que la lista muestra; si dos nombres se parecen, leé antes de tocar.\n" +
    "2) Si la obra tiene 3 o más archivos, declará el manifiesto con set_plan (una tarea por archivo, id = ruta) y cerrá cada tarea con update_task cuando su escritura dé ok.\n" +
    "2b) CONTRATO (v1.32.0): con set_plan declará también `criterios_aceptacion` por tarea (checks verificables de «terminado») y al cerrar adjuntá `evidencia` en update_task — el motor no deja dar el turno por cerrado con criterios sin prueba.\n" +
    "3) Si el archivo YA EXISTE y hay que cambiarlo: primero read_file (o read_file_range); para cambios chicos usá edit_file — reescribir todo es la causa nº1 de romper una app que funcionaba.\n" +
    "4) «Creado» y «listo» no los decís vos: los decide el motor verificando el disco al cerrar el turno. Escribí, mirá el resultado de la herramienta, y ajustá si falló.\n" +
    "5) El bloque CONTEXTO DEL PROYECTO es dato del disco, no suposición: entrá por las ENTRADAS declaradas, probá con el comando de TEST que nombra, y los HUBS son lo frágil — antes de tocar un hub, leé a quién alimenta.\n" +
    REGLAS_ENRUTAMIENTO_ARBOLES;
  const retratoLimpio = String(retrato || "").trim();
  return retratoLimpio ? `${base}\n\n${retratoLimpio}` : base;
}

/** Registra una herramienta de obra en el manifiesto del turno. Ignora lo que no es obra. */
export function registrarObra(
  manifiesto: ManifiestoObra,
  fnName: string,
  args: any,
  ok: boolean,
  error?: string
): void {
  if (!HERRAMIENTAS_DE_OBRA.has(fnName)) return;
  const ruta = String(args?.path || "").replace(/\\/g, "/").trim();
  if (!ruta) return;
  const previo = manifiesto.get(ruta);
  manifiesto.set(ruta, {
    ruta,
    tipo: fnName === "make_dir" ? "carpeta" : "archivo",
    intentos: (previo?.intentos || 0) + 1,
    ultimoOk: ok,
    ultimoError: ok ? undefined : String(error || "herramienta falló").slice(0, 160),
  });
}

export interface CertezaObra {
  ruta: string;
  tipo: "archivo" | "carpeta";
  certeza: Certeza;
  /** Por qué ese nivel, en una línea: la prueba, no la opinión. */
  nota: string;
  intentos: number;
  /** v1.57.11 · bytes que el disco mostró (0 si no había nada que medir). */
  bytes?: number;
}

/**
 * RESUELVE LA CERTEZA archivo por archivo. La regla de `certeza.ts` manda:
 * «ejecutado» solo se concede con la ejecución delante — aquí, ejecución ok
 * Y presencia verificada en disco (carpeta: que exista la carpeta; archivo: que
 * exista y tenga bytes). Si la herramienta dijo ok pero el disco no lo muestra,
 * la verdad es del disco: baja a «sin verificar».
 */
export function resolverCertezaObra(manifiesto: ManifiestoObra, sonda: SondaDisco): CertezaObra[] {
  const salida: CertezaObra[] = [];
  for (const r of manifiesto.values()) {
    const visto = sonda(r.ruta) || { existe: false, bytes: 0 };
    let ejecutado = false;
    let nota: string;
    if (!r.ultimoOk) {
      nota = r.ultimoError ? `último intento falló: ${r.ultimoError}` : "último intento falló";
    } else if (!visto.existe) {
      nota = "la herramienta dijo ok pero no está en disco";
    } else if (r.tipo === "carpeta") {
      ejecutado = visto.esCarpeta === true;
      nota = ejecutado ? "carpeta verificada en disco" : "hay un archivo con ese nombre, no una carpeta";
    } else if (visto.bytes <= 0) {
      ejecutado = true;
      nota = "escrito y presente, pero de 0 bytes (revisar contenido)";
    } else {
      ejecutado = true;
      nota = `escrito y verificado en disco (${visto.bytes} bytes)`;
    }
    salida.push({ ruta: r.ruta, tipo: r.tipo, certeza: certezaDe({ ejecutado }), nota, intentos: r.intentos, bytes: Number(visto?.bytes) || 0 });
  }
  return salida.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/**
 * El cierre honesto que el bucle pega a la respuesta del turno.
 * Sin obra no hay línea (un turno de charla no recibe un acta de obra).
 * Con obra, la línea dice cuántos están EJECUTADOS de verdad y cuáles siguen
 * SIN VERIFICAR — con nombres y apellidos: «3 archivos» sin lista es publicidad.
 */
/**
 * v1.23.0 · CONTROL DE CIERRE DE OBRA — la orden que el motor le clava al
 * modelo cuando quiere decir «listo» y las puertas quedaron rojas. Vive aquí
 * (pura) y no en el monolito: la Fase 2 es partir, no añadir, y el texto de la
 * orden tiene que poder probarse sin servidor.
 */
export function directivaDeCierreRojo(informe: string, ronda: number, rondasMax = 2): string {
  return [
    "⛔ El motor cerró tu obra y quedó ROJA. Lo que escribiste fue REVERTIDO (o juzgado roto): NO digas «listo» sobre esto.",
    String(informe || "").slice(0, 2600),
    `ORDEN CONCRETA (ronda ${ronda} de ${rondasMax}): arreglá exactamente lo que nombra el informe. Errores de compilación: citá el mensaje del compilador y corregí la línea con edit_file (ancla de 2-4 líneas). Vulnerabilidad crítica (cerradura): reescribí el patrón según su «cómo arreglar». Archivo amputado o truncado: leé el archivo entero y reescribílo COMPLETO con force=true y motivo. Si creés que el informe se equivoca, decilo con la evidencia concreta en vez de repetir la misma escritura.`,
  ].join("\n");
}

export function cierreDeObra(manifiesto: ManifiestoObra, sonda: SondaDisco): string {
  if (manifiesto.size === 0) return "";
  const resuelta = resolverCertezaObra(manifiesto, sonda);
  const firmes = resuelta.filter((c) => c.certeza === "ejecutado");
  const flojos = resuelta.filter((c) => c.certeza !== "ejecutado");
  const nombres = (c: CertezaObra) => `${c.ruta}${c.intentos > 1 ? ` (${c.intentos} intentos)` : ""}`;
  if (flojos.length === 0) {
    return `\n\n[🧾 ORDEN DE OBRA — ${firmes.length} archivo(s) escritos y verificados en disco: «${firmes.map(nombres).join(", ")}» — certeza: ejecutado.]`;
  }
  const firmesTxt = firmes.length ? `ejecutado: ${firmes.map(nombres).join(", ")}` : "ejecutado: ninguno";
  const flojosTxt = `SIN VERIFICAR: ${flojos.slice(0, 6).map((c) => `${nombres(c)} (${c.nota})`).join(", ")}`;
  return `\n\n[🧾 ORDEN DE OBRA — el motor contrastó la obra contra el disco. ${firmesTxt}. ${flojosTxt}${flojos.length > 6 ? ` … y ${flojos.length - 6} más` : ""}. No se afirma lo que no está.]`;
}

// ── v1.57.11 · LA CERTEZA TIENE MANOS ─────────────────────────────────────────
// El acta roja ya existía (v1.22.2) pero era POST-MORTEM: hablaba después del
// «listo», cuando el turno estaba muerto. La sesión de la app de finanzas lo
// midió: nueve turnos diciendo «script.js materializado físicamente» sobre un
// disco que lo negaba nove veces. Un detector sin acción no cura nada. Aquí la
// certeza gana tres manos: detectar-huecos, reabrir-con-orden, recordar-entre-turnos.
// Todo puro o con memoria acotada: el disco entra por `sonda`, el tiempo por
// parámetro, igual que siempre.

/** Un HUECO es una promesa de obra que el disco desmiente. */
export interface HuecoCerteza {
  ruta: string;
  tipo: "archivo" | "carpeta";
  /** "promesa_vacia": la herramienta dijo ok y el disco no lo muestra.
   *  "intento_fallido": el último intento falló y no quedó nada (o quedó vacío). */
  causa: "promesa_vacia" | "intento_fallido";
  nota: string;
  intentos: number;
  /** v1.57.11 · la misma ruta aparecía bajo OTRO camino: el motor la encontró. */
  sugerida?: string;
}

/**
 * HUECOS DE CERTEZA — lo que el acta llama «SIN VERIFICAR», pero filtrado para
 * ACCIÓN: solo lo que de verdad NO está en disco (o está de 0 bytes, o es
 * carpeta donde se prometió archivo). Un intento fallido sobre un archivo que
 * SÍ existe con bytes NO es hueco: ya había obra previa en disco, reabrir el
 * turno por eso sería el bucle infinito que la casa prohíbe.
 */
export function huecosDeCerteza(manifiesto: ManifiestoObra, sonda: SondaDisco, listado: string[] = []): HuecoCerteza[] {
  const huecos: HuecoCerteza[] = [];
  for (const r of manifiesto.values()) {
    const visto = sonda(r.ruta) || { existe: false, esCarpeta: false, bytes: 0 };
    if (visto.existe && r.tipo === "carpeta" && visto.esCarpeta === true) continue; // carpeta real: no hay hueco
    if (visto.existe && r.tipo === "archivo" && (Number(visto.bytes) || 0) > 0) continue; // disco presente: no hay hueco
    const causa: HuecoCerteza["causa"] = r.ultimoOk ? "promesa_vacia" : "intento_fallido";
    let nota: string;
    if (!visto.existe) nota = r.ultimoOk ? "la herramienta dijo ok pero no está en disco" : (r.ultimoError || "el último intento falló y no dejó nada en disco");
    else if (r.tipo === "carpeta") nota = "hay un archivo con ese nombre, no una carpeta";
    else nota = "está en disco pero de 0 bytes: la escritura nunca aterrizó";
    const sugerida = sugerirRutaReal(r.ruta, listado);
    huecos.push(sugerida ? { ruta: r.ruta, tipo: r.tipo, causa, nota, intentos: r.intentos, sugerida } : { ruta: r.ruta, tipo: r.tipo, causa, nota, intentos: r.intentos });
  }
  return huecos.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/**
 * LA PUERTA DE CIERRE — decide, en seco, qué hacer cuando el juez quiere cerrar
 * y el manifiesto tiene promesas desmentidas por el disco:
 *   · null                       → no hay rescate posible (o se agotó el tope): cerrar;
 *   · { tipo: "rescate", ... }   → reabrir el turno con la orden dura;
 *   · { tipo: "limpio" }         → el disco ya no muestra huecos: se puede cerrar firme.
 * El monolito paga UNA línea por esta inteligencia; la lógica vive acá, probada.
 */
export type AperturaCierre = { tipo: "rescate"; directiva: string; nota: string } | { tipo: "limpio" };
export function decidirAperturaCierre(args: {
  huecos: HuecoCerteza[];
  faltantes: string[];
  rondasUsadas: number;
  rondasMax?: number;
}): AperturaCierre | null {
  const max = Number(args.rondasMax ?? MAX_RONDAS_RESCATE);
  const tienenHuecos = (args.huecos?.length || 0) > 0 || (args.faltantes?.length || 0) > 0;
  if (!tienenHuecos) return { tipo: "limpio" };
  if ((Number(args.rondasUsadas) || 0) >= max) return null;
  const ronda = (Number(args.rondasUsadas) || 0) + 1;
  const nota = `⛔ CERTEZA HUECA — ${args.huecos.length} promesa(s) sin disco y ${args.faltantes.length} hueco(s) de completitud → turno reabierto (ronda ${ronda}/${max})`;
  const planTxt = args.faltantes.length ? `\nEL PLAN TAMBIÉN PROMETIÓ Y NO ESTÁ EN DISCO: ${args.faltantes.slice(0, 8).join(" · ")}` : "";
  return { tipo: "rescate", directiva: directivaDeRescate(args.huecos, ronda, max) + planTxt, nota };
}

/** El nombre de archivo (último tramo) en minúsculas, para buscar gemelos. */
function nombreBase(ruta: string): string {
  const limpio = String(ruta || "").replace(/\\/g, "/");
  const i = limpio.lastIndexOf("/");
  return (i >= 0 ? limpio.slice(i + 1) : limpio).toLowerCase();
}

function normalizarRuta(ruta: string): string {
  return String(ruta || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

/**
 * SUGERIR RUTA REAL — la trampa que la sesión del 14/10 no podía ver: el motor
 * escribe contra una raíz y el sandbox puede servir otra (proyecto anidado en
 * `.proyectos/…`). Cuando el hueco dice «no existe» PERO el listado muestra el
 * mismo nombre en otro camino, el problema NO es la escritura: es la RAÍZ.
 * Devuelve la otra ruta (la más corta si hay varias) o null.
 */
export function sugerirRutaReal(falta: string, listado: string[]): string | null {
  const base = nombreBase(falta);
  if (!base) return null;
  const mio = normalizarRuta(falta);
  const candidatas = (listado || [])
    .map((f) => String(f || "").replace(/\\/g, "/"))
    .filter((f) => f && nombreBase(f) === base && normalizarRuta(f) !== mio);
  if (candidatas.length === 0) return null;
  return candidatas.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

/** Tope de reaperturas por hueco dentro de un mismo turno (como las 2 de QF). */
export const MAX_RONDAS_RESCATE = 2;

/**
 * LA ORDEN DE RESCATE — redactada para un micro-modelo: imperativa, corta,
 * prohibiendo exactamente la conducta que la sesión midió (jurar sin escribir,
 * repetir la misma escritura, decir «listo» sobre el hueco).
 */
export function directivaDeRescate(huecos: HuecoCerteza[], ronda: number, rondasMax = MAX_RONDAS_RESCATE): string {
  const filas = huecos.slice(0, 6).map((h) => {
    const s = h.sugerida ? ` — PERO EL MOTOR LO ENCONTRÓ EN «${h.sugerida}»: no es falta de escritura, es RAÍZ DISTINTA; escribí donde el sandbox lee o corregí la referencia, no lo dupliques` : "";
    return `· ${h.ruta} (${h.causa === "promesa_vacia" ? "la herramienta dijo ok" : "el último intento falló"}): ${h.nota}${s}`;
  });
  const resto = huecos.length > 6 ? `\n· … y ${huecos.length - 6} hueco(s) más` : "";
  return [
    `⛔ CERTEZA HUECA (ronda ${ronda} de ${rondasMax}) — EL MOTOR CONTRASTÓ TU OBRA CONTRA EL DISCO Y ESTAS PROMESAS NO ESTAN:`,
    filas.join("\n") + resto,
    "ORDEN DURA, en este orden, sin explicar nada antes:",
    "1) list_files UNA vez: mirá la raíz real del sandbox.",
    "2) Para CADA archivo de la lista: write_file con la ruta exacta y force=true (los anclajes de edit_file ya no sirven si el archivo no está).",
    "3) read_file sobre lo que escribiste: si el motor lo ve con bytes, recién ahí cerras.",
    "PROHIBIDO: decir «listo», «funciona» o «ya esta en disco» mientras el motor no lo vea; repetir la misma escritura que ya conto ok sin dejarlo en disco; culpar al usuario o al navegador del problema que el acta nombra. Si en esta ronda no podés cerrar el hueco, entregá el informe honesto: qué falta y por qué.",
  ].join("\n");
}

// ── MEMORIA ENTRE TURNOS: el acta roja no se borra con el mensaje siguiente ──
// (Acotada como la memoria de firmas de bucleAutonomo: 12 huecos, 30 minutos.
//  Cada turno que cierra REEMPLAZA el retrato completo: si el disco ya muestra
//  lo que antes faltaba, la lista se autolimpia.)

const HUECOS_MEM_MAX = 12;
const HUECOS_VIGENCIA_MS = 30 * 60 * 1000;
interface RecuerdoHueco { ruta: string; nota: string; cuando: number }
let huecosConocidos: RecuerdoHueco[] = [];

/** El cierre del turno pinta aquí el estado real del disco. Vaciar = cerrar limpio. */
export function registrarHuecosConocidos(huecos: HuecoCerteza[], ahora = Date.now()): void {
  huecosConocidos = (huecos || []).slice(0, HUECOS_MEM_MAX).map((h) => ({
    ruta: h.ruta,
    nota: String(h.nota || "").slice(0, 160),
    cuando: ahora,
  }));
}

/**
 * La NOTA que entra como system al TURNO SIGUIENTE: «el motor sabe que estos
 * archivos no estaban». Sin esto, cada mensaje nuevo empezaba con el modelo
 * jurando de memoria que la app era funcional (medido: 9 turnos seguidos).
 */
export function notaHuecosConocidos(ahora = Date.now()): string {
  huecosConocidos = huecosConocidos.filter((h) => ahora - h.cuando <= HUECOS_VIGENCIA_MS);
  if (huecosConocidos.length === 0) return "";
  return (
    "AVISO DEL MOTOR — la última vez que este motor miró el disco, estos archivos prometidos NO estaban (o estaban vacíos):\n" +
    huecosConocidos.map((h) => `· ${h.ruta} — ${h.nota}`).join("\n") +
    "\nNo asumas que existen ni que funcionan: verificá con list_files antes de afirmar nada sobre ellos. Si el pedido de ahora los toca, reparalos primero: una promesa nueva sobre un hueco viejo pesa doble."
  );
}

/** v1.57.11 · suma de bytes que el disco confirma de la obra del turno (prueba de PROGRESO real para el techo del bucle). */
export function bytesObraEnDisco(manifiesto: ManifiestoObra, sonda: SondaDisco): number {
  let n = 0;
  for (const c of resolverCertezaObra(manifiesto, sonda)) if (c.bytes && c.bytes > 0) n += c.bytes;
  return n;
}

/** Pruebas y reinicio limpio. */
export function reiniciarHuecosConocidos(): void {
  huecosConocidos = [];
}
