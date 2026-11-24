/**
 * perfiles/perfilParches.ts · FASE 12 — EL PERFIL DEL USUARIO, EN DISCO (v2.3.15)
 * ============================================================================
 * Qué hay acá y qué NO hay. `src/engine/parchesSemilla.ts` (375 líneas) ya
 * implementaba el motor puro: `aplicarParches()`, el tope de operaciones, la
 * atomicidad y la invariante de 116 entradas. Lo que faltaba era lo otro: **el
 * archivo del usuario y el cable**. Sin eso, FASE 12 era un módulo correcto que
 * nadie llamaba — exactamente la enfermedad que la FASE 13 acaba de destapar en
 * `contextoMedido.ts` (359 líneas, suite verde, cero importadores).
 *
 * EL FORMATO (alcance duro del plano, punto 1):
 *   `<raíz de datos>/.cerebronico/perfil.patch.yaml`
 *     version: 1
 *     descripcion: "apago lo que no uso"
 *     operaciones:
 *       - { op: deshabilitar, id: kb-xxx, motivo: "no trabajo con eso" }
 *       - { op: sobrescribir, id: kb-yyy, campos: { weight: 3 } }
 *       - { op: insertar, entrada: { id, table, title, body, keys } }
 *   `sobrescribir | deshabilitar | insertar` son los nombres del plano y se
 *   aceptan; `replace | disable | extend | add` son los del motor y también.
 *
 * EL INTERRUPTOR HONESTO (punto 4, y es la parte que decide si esto es seguro):
 *   · sin archivo   → la semilla de siempre, idéntica, y el acta lo dice;
 *   · YAML roto, forma rara u `op` desconocida → **semilla limpia** + causa en el
 *     acta. Nunca arranque a medias: medio perfil aplicado deja un motor que no
 *     se parece ni al de antes ni al que el usuario pidió.
 *   · un rechazo del motor (invariante, id inexistente) → ídem, se revierte todo.
 *
 * Y LO QUE NO HACE, por diseño y no por pereza: **no ejecuta código**. Un perfil
 * configura, apaga o inserta entradas con la MISMA forma. Cero `eval`, cero
 * plantillas evaluadas. Un archivo de datos del usuario que pudiera ejecutar es
 * una puerta de ejecución remota con mejor cara.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { load as _cargarYaml } from "js-yaml";
import type { KbEntry } from "../knowledgeBase.js";
import { aplicarParches, perfilVacio, type InformeParches, type OperacionParche, type OperacionSemilla, type PerfilParches } from "../parchesSemilla.js";

const RUTA_RELATIVA = [".cerebronico", "perfil.patch.yaml"] as const;

/** Sinónimos del plano → vocabulario del motor. Un mapa declarado, no un `if`. */
const ALIAS_DE_OPERACION: Record<string, OperacionParche> = {
  sobrescribir: "replace",
  deshabilitar: "disable",
  insertar: "add",
  replace: "replace",
  disable: "disable",
  extend: "extend",
  add: "add",
};

export interface ResultadoPerfil {
  /** true sólo si hay archivo Y se aplicó. Sin archivo es false, no error. */
  aplicado: boolean;
  /** Semilla resultante: la nueva si se aplicó, la original en cualquier otro caso. */
  semilla: KbEntry[];
  /** Cadena legible de qué pasó. Nunca `undefined`: el acta se muestra. */
  causa: string;
  /** Informe del motor, sólo cuando hubo perfil aplicado. */
  informe?: InformeParches;
  /** La línea que viaja al estado vivo del turno. Vacía si no hay nada que decir. */
  linea: string;
  /** Ruta buscada, para que el acta diga dónde miró aunque no haya encontrado. */
  ruta: string;
}

function leerTexto(ruta: string): string | null {
  try {
    return existsSync(ruta) ? readFileSync(ruta, "utf8") : null;
  } catch {
    return null;
  }
}

/**
 * Traduce el YAML del usuario al perfil del motor. Devuelve `{perfil}` o `{causa}`,
 * nunca lanza: quien llama tiene que poder devolver la semilla limpia sin un
 * `try/catch` gigante alrededor.
 */
export function parsearPerfil(texto: string): { perfil?: PerfilParches; causa?: string } {
  let datos: unknown;
  try {
    datos = _cargarYaml(texto);
  } catch (e) {
    // El caso que el plano enumeró a propósito: YAML roto → semilla limpia. El
    // mensaje del parser va en el acta, porque «no se aplicó» sin causa obliga al
    // usuario a adivinar qué escribió mal.
    return { causa: `YAML inválido: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    return { causa: "el perfil no es un objeto con `version` y `operaciones`" };
  }
  const brutos = datos as Record<string, unknown>;
  if (brutos.version !== 1) {
    return { causa: `version esperada 1, leída ${JSON.stringify(brutos.version)}` };
  }
  const lista = brutos.operaciones;
  if (!Array.isArray(lista)) {
    return { causa: "`operaciones` no es una lista" };
  }
  const operaciones: OperacionSemilla[] = [];
  for (let i = 0; i < lista.length; i++) {
    const o = lista[i] as Record<string, unknown> | null;
    if (!o || typeof o !== "object") return { causa: `operación ${i} no es un objeto` };
    const op = String(o.op ?? "");
    const mapeada = ALIAS_DE_OPERACION[op];
    // op desconocida NO se ignora en silencio: el plano la lista entre los
    // motivos de reversión total, porque una ops que no existe suele ser un
    // error de tipeo y callarlo es dejar al usuario con un perfil que no hizo nada.
    if (!mapeada) return { causa: `op desconocida en la operación ${i}: ${JSON.stringify(op)}` };
    operaciones.push({
      op: mapeada,
      ...(typeof o.id === "string" ? { id: o.id } : {}),
      ...(o.campos && typeof o.campos === "object" ? { campos: o.campos as OperacionSemilla["campos"] } : {}),
      ...(o.entrada && typeof o.entrada === "object" ? { entrada: o.entrada as KbEntry } : {}),
      ...(typeof o.motivo === "string" ? { motivo: o.motivo } : {}),
    });
  }
  return {
    perfil: {
      version: 1,
      ...(typeof brutos.descripcion === "string" ? { descripcion: brutos.descripcion } : {}),
      operaciones,
    },
  };
}

/** Última línea publicada: la lee `notaDeContexto` para no tocar `server.ts`. */
let lineaViva = "";

/** Lo que el estado vivo del turno debe decir sobre el perfil. Vacío = nada que decir. */
export function lineaDeEstadoPerfilParches(): string {
  return lineaViva;
}

/**
 * El punto único de cableado (punto 3 del alcance): después de los packs y antes
 * de los invariantes. Puro en su firma — recibe semilla y raíz, devuelve semilla e
 * informe — aunque lea un archivo, que es justo el trabajo de esta capa.
 */
export function cargarPerfilParches(semilla: readonly KbEntry[], raizDatos: string): ResultadoPerfil {
  const ruta = path.join(raizDatos, ...RUTA_RELATIVA);
  const limpio = (causa: string, linea: string): ResultadoPerfil => {
    lineaViva = linea;
    return { aplicado: false, semilla: [...semilla], causa, linea, ruta };
  };

  const texto = leerTexto(ruta);
  if (texto === null) return limpio("sin perfil en disco", "");
  if (!texto.trim()) return limpio("archivo de perfil vacío", "");

  const traducido = parsearPerfil(texto);
  if (traducido.causa || !traducido.perfil) {
    return limpio(traducido.causa ?? "perfil ilegible", `perfil: RECHAZADO (${traducido.causa ?? "ilegible"}) — semilla original`);
  }

  let resultado;
  try {
    resultado = aplicarParches(semilla, traducido.perfil);
  } catch (e) {
    return limpio(
      `el motor rechazó el perfil al aplicar: ${e instanceof Error ? e.message : String(e)}`,
      "REVERTIDO · perfil RECHAZADO (el motor lo devolvió entero) — semilla original intacta",
    );
  }

  if (resultado.informe.revertidoPorCompleto || resultado.informe.rechazadas.length > 0) {
    const primera = resultado.informe.rechazadas[0];
    const causa = primera ? `op ${primera.op} sobre ${primera.id}: ${primera.causa}` : "rechazo sin detalle";
    // v1.0.4 · `revertidoPorCompleto` es literalmente "se devolvio todo": la linea
    // que ve el usuario tenia que decirlo con la misma fuerza que el informe.
    return limpio(causa, `REVERTIDO · perfil RECHAZADO (${causa}) — semilla original, no se aplicó nada`);
  }

  lineaViva = resultado.linea;
  return {
    aplicado: resultado.informe.aplicadas > 0,
    semilla: resultado.semilla,
    causa: resultado.informe.aplicadas > 0 ? `${resultado.informe.aplicadas} operación(es) aplicadas` : "perfil sin operaciones",
    informe: resultado.informe,
    linea: resultado.linea,
    ruta,
  };
}

/** Perfil vacío exportado para que las pruebas y los llamadores no lo reinventen. */
export { perfilVacio };
// fin del módulo
