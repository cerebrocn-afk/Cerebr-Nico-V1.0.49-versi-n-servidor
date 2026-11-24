/**
 * aduanaForja.ts — LA ADUANA DE LO FORJADO EN CALIENTE (v1.85.0 · FASE 6.4)
 * =========================================================================
 * QUÉ PIDE EL PLANO (FASE 6, punto 4): «Las extensiones dinámicas pasan por
 * `aduanaModelos` antes de tocar el flujo: un espejo forjado no puede
 * inventarse un proveedor ni un nombre duplicado».
 *
 * EL HOYO REAL, MEDIDO EN EL CÓDIGO DE v1.84.6:
 *   · `cargadorEspejos.ts` valida que la entrada del manifest traiga id, ruta,
 *     familia y descripcion, y que el `.mjs` exporte `ejecutar`. Nada más. Un
 *     espejo con `id: "espejo.codigos"` (que YA existe entre los 11 curados)
 *     entraba y se montaba en el pool: dos nombres para la misma entidad, que
 *     es justo lo que V8 §7.1 prohíbe.
 *   · `/api/espejos/instalar` escribía el `.mjs` a disco ANTES de mirarlo, y el
 *     manifest del espejo permite campos que nadie controla.
 *   · `aduanaModelos.ts` (v1.77.0) ya controla los MODELOS del motor — chat vs
 *     embeddings vs fim, listas duplicadas, URLs custom — pero el camino de la
 *     forja no pasaba por ahí.
 *
 * LO QUE HACE ESTE MÓDULO: la misma pregunta de la aduana, aplicada a lo forjado.
 *   1. nombre único: `espejo.<slug>` y NO entre las 51 curadas ni en el pool;
 *   2. proveedor conocido: si el espejo declara `proveedor`/`modelo`, tiene que
 *      ser un proveedor que la IDE soporta y un modelo que `aduanaModelos`
 *      clasifica — nada de inventarse un motor;
 *   3. determinismo exigible: el código del espejo no puede abrir red, levantar
 *      procesos, tocar disco ni leer el entorno. Las reglas del manual §2 del
 *      cargador («sin red, sin estado global, determinista») pasan de
 *      recomendación a ADUANA, porque desde el momento en que un espejo forjado
 *      corre dentro del flujo del motor, un `child_process` ahí es un RCE con
 *       firma del usuario (V8 §8.1: sin puentes RCE, ni «por conveniencia»);
 *   4. contrato de forma: `ejecutar(datos) → {ok, salida|motivo}` y MOTIVO
 *      obligatorio cuando ok===false (lo que no se declara, no se fusiona).
 *
 * PUREZA: no toca disco ni la red. Recibe la ficha y el código, devuelve un
 * veredicto con motivos. Quien escribe a disco es el servidor, y solo si esto
 * dijo OK.
 */
import { clasificarModeloOllama, type RolModeloOllama } from "./aduanaModelos";
import { ENTIDADES } from "./reflejo/consejo";

/** Proveedores que la IDE conoce (los mismos que aparecen en `constants.ts`). */
export const PROVEEDORES_CONOCIDOS = [
  "ollama", "openai", "gemini", "openrouter", "zai", "custom",
] as const;

export type ProveedorConocido = (typeof PROVEEDORES_CONOCIDOS)[number];

export interface FichaForjada {
  /** Id declarado por la receta/manifest del espejo forjado. */
  id: string;
  nombre?: string;
  familia?: string;
  descripcion?: string;
  /** Ruta del .mjs dentro del paquete del espejo. */
  ruta?: string;
  /** Opcional: si el espejo dice con qué modelo trabaja. */
  proveedor?: string;
  modelo?: string;
  autor?: string;
  version?: string;
  activado?: boolean;
}

export interface VeredictoAduana {
  ok: boolean;
  id: string;
  /** Motivos que BLOQUEAN el paso (con el arreglo concreto en el texto). */
  rechazos: string[];
  /** Cosas que se permiten pero se declaran (ruido, no peligro). */
  avisos: string[];
  /** Qué controló esta aduana (para que el informe diga lo que hizo). */
  controles: string[];
}

/**
 * Lo que un espejo NO puede hacer. Cada patrón es una regla del manual §2
 * hecha valla: si aparece, el espejo se queda fuera del flujo y se dice por qué.
 * Se busca en el CÓDIGO (no en comentarios), por eso el chequeo es textual y
 * conservador: es preferible rechazar un espejo legítimo que dejar pasar un
 * puente de ejecución remota.
 */
const PROHIBIDO: Array<{ patron: RegExp; motivo: string }> = [
  { patron: /require\s*\(\s*["']node:child_process["']\s*\)|from\s+["']node:child_process["']|require\s*\(\s*["']child_process["']\s*\)|from\s+["']child_process["']/, motivo: "importa child_process: un espejo no levanta procesos (V8 §8.1, sin puentes RCE)" },
  { patron: /\bchild_process\b/, motivo: "menciona child_process: un espejo no levanta procesos" },
  { patron: /\beval\s*\(|new\s+Function\s*\(/, motivo: "usa eval/Function: un espejo debe ser determinista, no un intérprete" },
  { patron: /from\s+["']node:fs["']|require\s*\(\s*["']node:fs["']\s*\)|from\s+["']fs["']|from\s+["']fs\/promises["']/, motivo: "importa fs: un espejo no toca el disco del usuario" },
  { patron: /from\s+["']node:net["']|from\s+["']node:http["']|from\s+["']node:https["']|require\s*\(\s*["']node:(net|http|https)["']\s*\)/, motivo: "importa red cruda: un espejo no abre conexiones propias" },
  { patron: /\bfetch\s*\(|XMLHttpRequest/, motivo: "hace fetch: las reglas del cargador prohíben la red en un espejo" },
  { patron: /process\s*\.\s*env/, motivo: "lee process.env: las claves no cruzan un espejo (ni las suyas)" },
  { patron: /import\s*\(/, motivo: "usa import() dinámico: un espejo no carga código que no fue auditado" },
];

/** Palabras que hacen ruido pero no matan: se avisan, no se bloquean. */
const AVISABLES: Array<{ patron: RegExp; aviso: string }> = [
  { patron: /Math\s*\.\s*random\s*\(/, aviso: "usa Math.random(): no es determinista, la misma entrada dará otra salida" },
  { patron: /Date\s*\.\s*now\s*\(|new\s+Date\s*\(/, aviso: "usa la hora del reloj: la salida cambia entre ejecuciones" },
  { patron: /\basync\b\s*(function|[a-zA-Z_$][\w$]*\s*\()?|await\s+/, aviso: "es asíncrono: el motor no espera Promises de espejos personalizados (debe ser síncrono)" },
];

/** `espejo.<slug>` con slug mínimo. Fuente única de nombres (V8 §7.1). */
const RE_ID_ESPEJO = /^espejo\.[a-z0-9][a-z0-9._-]{1,60}$/;

/** Un nombre legible, para detectar el duplicado estético. */
function normalizarNombre(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * LA ADUANA. Nunca lanza: si no se puede decidir, se rechaza con motivo (la
 * puerta cerrada es el estado por defecto de toda la casa).
 *
 * @param ctx.existentes  ids ya montados (pool de personalizados). Las 51
 *                        curadas se comparan solas contra `ENTIDADES`.
 * @param ctx.conSinModelo  permite espejos que no declaran modelo (default true).
 */
export function pasarAduanaForja(
  ficha: FichaForjada,
  codigoFuente: string,
  ctx: { existentes?: readonly string[]; sinModeloPermitido?: boolean } = {},
): VeredictoAduana {
  const rechazos: string[] = [];
  const avisos: string[] = [];
  const controles: string[] = [];
  const id = String(ficha?.id || "").trim();

  // ── 1 · Identidad: id con forma de espejo y UNIQUE ───────────────────
  controles.push("identidad");
  if (!id) {
    rechazos.push("el espejo forjado no trae id: sin nombre no hay entidad que registrar");
  } else if (!RE_ID_ESPEJO.test(id)) {
    rechazos.push(`el id «${id}» no cumple «espejo.<slug>» (minúsculas, dígitos, punto, guión y guion bajo, 2..61)`);
  } else if (ENTIDADES.some((e) => e.id === id)) {
    rechazos.push(`el id «${id}» YA existe entre las ${ENTIDADES.length} entidades curadas: no se duplica un nombre (V8 §7.1); forja uno nuevo o usa el que está`);
  } else if ((ctx.existentes || []).includes(id)) {
    rechazos.push(`el id «${id}» ya está montado en el pool de personalizados: reinstalar exige desinstalar primero, no pisar`);
  }
  // Duplicado por nombre legible (aunque el id sea distinto).
  const nombre = String(ficha?.nombre || "").trim();
  if (nombre) {
    const llave = normalizarNombre(nombre);
    const duplicado = ENTIDADES.find((e) => normalizarNombre(e.nombre || "") === llave);
    if (duplicado) rechazos.push(`el nombre «${nombre}» es el de la entidad «${duplicado.id}»: dos nombres para lo mismo es justamente la plaga que la aduana corta`);
    else if (llave.length < 3) avisos.push(`el nombre «${nombre}» es demasiado corto para distinguirse de otro`);
  }
  if (!String(ficha?.descripcion || "").trim()) rechazos.push("falta «descripcion»: un espejo sin contrato no se fusiona (el catálogo 75 es ideal, la deuda se nombra)");
  if (!String(ficha?.familia || "").trim()) rechazos.push("falta «familia»: el orquestador agrupa por familia, sin ella el espejo queda inalcanzable");

  // ── 2 · Proveedor y modelo: lo que ya hace aduanaModelos, acá ─────────
  controles.push("proveedor/modelo");
  const proveedor = String(ficha?.proveedor || "").trim().toLowerCase();
  const modelo = String(ficha?.modelo || "").trim();
  if (proveedor) {
    if (!(PROVEEDORES_CONOCIDOS as readonly string[]).includes(proveedor)) {
      rechazos.push(`el proveedor «${proveedor}» no existe en la IDE (conocidos: ${PROVEEDORES_CONOCIDOS.join(", ")}). Un espejo forjado no se inventa un motor`);
    } else if (proveedor === "ollama") {
      if (!modelo) {
        rechazos.push("declara proveedor «ollama» sin «modelo»: sin nombre exacto el selector adivina, y adivinar es lo que la aduana vino a cortar");
      } else {
        const clase = clasificarModeloOllama(modelo);
        if (clase.rol !== "chat") {
          rechazos.push(`el modelo «${modelo}» no sirve para responder: la aduana de modelos lo clasifica «${clase.rol}» (${clase.motivo})`);
        }
      }
    } else if (!modelo) {
      rechazos.push(`declara proveedor «${proveedor}» sin «modelo»: un modelo = un nombre = un proveedor (P3 del plano)`);
    }
  } else if (modelo) {
    rechazos.push(`declara el modelo «${modelo}» sin proveedor: sería un fantasma en el selector`);
  } else if (ctx.sinModeloPermitido === false) {
    rechazos.push("el espejo no declara proveedor ni modelo y el llamante lo exige");
  }

  // ── 3 · El código: determinista, sin red, sin disco, sin procesos ────
  controles.push("determinismo/aislamiento");
  const codigo = String(codigoFuente || "");
  if (!codigo.trim()) {
    rechazos.push("no trae código (.mjs vacío o ausente): no hay nada que montar");
  } else {
    for (const regla of PROHIBIDO) {
      const m = codigo.match(regla.patron);
      if (m) rechazos.push(`${regla.motivo} [detectado: «${String(m[0]).slice(0, 40)}»]`);
    }
    for (const a of AVISABLES) if (a.patron.test(codigo)) avisos.push(a.aviso);
    if (!/export\s+(async\s+)?function\s+ejecutar\b|export\s+const\s+ejecutar\s*=|export\s*\{[^}]*\bejecutar\b/.test(codigo)) {
      rechazos.push("el .mjs no exporta `ejecutar`: sin esa función el motor no tiene a quién llamar");
    }
    if (!/motivo/.test(codigo)) avisos.push("el código no menciona `motivo`: recuerda que ok:false exige motivo declarado");
  }

  return { ok: rechazos.length === 0, id: id || "(sin id)", rechazos, avisos, controles };
}

/** Auditoría de un lote (instalar varios espejos de una vez, atomicidad de catálogo). */
export function auditarLoteForjado(
  fichas: Array<{ ficha: FichaForjada; codigo: string }>,
  ctx: { existentes?: readonly string[] } = {},
): { ok: boolean; veredictos: Array<VeredictoAduana>; duplicadosEnLote: string[] } {
  const vistos = new Set<string>(ctx.existentes || []);
  const duplicadosEnLote: string[] = [];
  const veredictos = (fichas || []).map(({ ficha, codigo }) => {
    const v = pasarAduanaForja(ficha, codigo, { existentes: [...vistos] });
    const id = String(ficha?.id || "");
    if (id) {
      if (vistos.has(id)) duplicadosEnLote.push(id);
      vistos.add(id);
    }
    return v;
  });
  return { ok: veredictos.every((v) => v.ok) && duplicadosEnLote.length === 0, veredictos, duplicadosEnLote };
}

/** La cara del `/api/consejo/aduana`: qué se controla y con qué lista. */
export function estadoAduanaForja() {
  return {
    ok: true,
    proveedores: [...PROVEEDORES_CONOCIDOS],
    prohibido: PROHIBIDO.map((p) => p.motivo),
    avisables: AVISABLES.map((a) => a.aviso),
    catalogo: ENTIDADES.length,
    regla: "Un espejo forjado pasa por acá antes de tocar el flujo: id único (espejo.<slug>), proveedor que exista, modelo que la aduana conozca, código determinista sin red/disco/procesos y `ejecutar` exportado. Lo que no pasa, se queda afuera con el motivo escrito.",
  };
}
