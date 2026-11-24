/**
 * parchesSemilla.ts · FASE 8 — EL PERFIL DE PARCHES POR `id`
 *
 * PROBLEMA QUE PAGA (medido, no supuesto):
 *   Hoy, añadir o desactivar un pack de saber exige editar `knowledgeBase.ts` /
 *   `SEMILLA_COMPLETA` a mano. Cada alta toca el ensamblado del motor, y los
 *   cambios del usuario chocan con los del proyecto en cada actualización: es
 *   la fricción estructural que la FASE 8 existe para matar.
 *
 * IDEA COPIADA (diseño, no código):
 *   DeepSeek Harness declara el perfil raíz como `[]` y compone por capas; cada
 *   bundle aporta entradas y encima va un `cordis.patch.yml` que SOBRESCRIBE o
 *   DESHABILITA por `id` sin editar el original. Leído en texto plano en
 *   `C:\Users\BirdBox\.dsh\profiles\desktop\` el 06/11/2026, junto a
 *   `package.json` con 7 bundles y `storage.workspace.json` versionado.
 *
 * ALCANCE DURO (lo que este módulo NO hace, por diseño):
 *   · NO ejecuta código. Un parche sólo configura o deshabilita entradas que YA
 *     existen en la semilla, o inserta una entrada con la MISMA forma. Cero
 *     `eval`, cero plantillas que se evalúen, cero rutas de archivo con código.
 *     Si se permitiera ejecutar, esto sería una puerta RCE con otro nombre y la
 *     casa la prohíbe (§5 Anti-hoja, directriz V8 §8.1).
 *   · NO toca `server.ts`. Es un módulo puro: recibe la semilla, devuelve la
 *     semilla nueva y un informe. Quien llama decide qué hacer con ella.
 *   · NO revienta la invariante del motor: el resultado mantiene `length>=116`
 *     y ids únicos, o el parche se RECHAZA ENTERO con causa reportada (nunca a
 *     medias: medio parche aplicado es peor que ninguno).
 */
// ---------------------------------------------------------------------------
// 2 · CONSTANTES DECLARADAS
// ---------------------------------------------------------------------------
/** La invariante del motor: la semilla NUNCA baja de 116 entradas. Se importa
 *  aquí como constante declarada para no depender de un literal en dos sitios;
 *  si `motor-estructura` la cambia, este número debe seguirla (ya está la suite
 *  que lo comprueba). */
export const MINIMO_ENTRADAS_SEMILLA = 116;
/** Máximo de operaciones por perfil. Un perfil de 10.000 parches no es un
 *  perfil: es una migración camuflada, y eso se hace en el código del motor. */
export const MAXIMO_OPERACIONES = 200;
const TABLAS_VALIDAS = new Set([
    "syntax",
    "error",
    "pattern",
    "tool",
    "skill",
    "rule",
    "project",
    "lesson",
    "manual",
    "recetario-ui",
]);
// ---------------------------------------------------------------------------
// 3 · VALIDACIÓN DE UNA OPERACIÓN (pura, sin efectos)
// ---------------------------------------------------------------------------
/** Devuelve la causa del rechazo, o `null` si la operación es válida. */
export function causaDeRechazo(op, existencia) {
    if (!op || typeof op !== "object")
        return "operación vacía o no es objeto";
    if (!["disable", "replace", "extend", "add"].includes(op.op))
        return `operación desconocida: ${String(op.op)}`;
    if (op.op === "add") {
        const e = op.entrada;
        if (!e)
            return "add sin `entrada`";
        if (!e.id || typeof e.id !== "string")
            return "add sin `entrada.id`";
        if (existencia.has(e.id))
            return `add: el id «${e.id}» ya existe (usa replace)`;
        if (!TABLAS_VALIDAS.has(e.table))
            return `add: table «${String(e.table)}» no está en KbTable`;
        if (!e.title || typeof e.title !== "string")
            return "add sin `title`";
        if (!e.body || typeof e.body !== "string")
            return "add sin `body`";
        if (!Array.isArray(e.keys) || e.keys.length === 0)
            return "add sin `keys` (una entrada sin palabras clave no se recupera)";
        return null;
    }
    // disable / replace / extend exigen un id que EXISTA.
    if (!op.id || typeof op.id !== "string")
        return `${op.op} sin \`id\``;
    if (!existencia.has(op.id))
        return `${op.op}: el id «${op.id}» no existe en la semilla`;
    if (op.op === "replace") {
        if (!op.campos || typeof op.campos !== "object")
            return "replace sin `campos`";
        if (op.campos.table && !TABLAS_VALIDAS.has(op.campos.table))
            return `replace: table «${String(op.campos.table)}» inválida`;
        // `replace` NO puede renombrar el id: el id es la llave del parche, y si
        // pudiera cambiar en silencio, el siguiente parche apuntaría a un fantasma.
        if (op.campos.id && op.campos.id !== op.id) {
            return "replace no puede cambiar el `id` (un parche siempre apunta a su id)";
        }
    }
    if (op.op === "extend") {
        if (!op.campos || typeof op.campos !== "object")
            return "extend sin `campos`";
        const claves = Object.keys(op.campos);
        const permitidas = ["keys", "tags"];
        const intrusas = claves.filter((k) => !permitidas.includes(k));
        if (intrusas.length > 0) {
            return `extend sólo admite keys/tags; llegan: ${intrusas.join(", ")} (para el resto usa replace)`;
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// 4 · APLICACIÓN (atómica: o entra entera, o no entra)
// ---------------------------------------------------------------------------
function clonar(entrada) {
    return {
        ...entrada,
        keys: Array.isArray(entrada.keys) ? [...entrada.keys] : [],
        ...(Array.isArray(entrada.tags) ? { tags: [...entrada.tags] } : {}),
    };
}
/** Une arrays sin duplicar, respetando el orden de llegada. */
function unirSinDuplicar(base, extra) {
    const salida = [];
    const vistos = new Set();
    for (const valor of [...(base ?? []), ...(extra ?? [])]) {
        if (typeof valor !== "string")
            continue;
        const norm = valor.trim();
        if (!norm || vistos.has(norm))
            continue;
        vistos.add(norm);
        salida.push(norm);
    }
    return salida;
}
/**
 * Aplica un perfil de parches sobre una copia de la semilla.
 *
 * GARANTÍAS, todas comprobables por suite:
 *   1. **No muta la entrada original** (recibe semilla, devuelve semilla nueva).
 *   2. **Atómico**: si cualquier operación es inválida o si el resultado rompe
 *      `MINIMO_ENTRADAS_SEMILLA` o produce ids duplicados, se devuelve la
 *      semilla ORIGINAL intacta y `revertidoPorCompleto: true` con las causas.
 *   3. **Idempotente al deshabilitar**: deshabilitar dos veces el mismo id no
 *      falla, pero se reporta una sola vez como aplicada.
 *   4. **Nunca ejecuta**: la entrada `add` se construye campo a campo.
 */
export function aplicarParches(semilla, perfil) {
    const rechazadas = [];
    const original = semilla.map(clonar);
    // --- Validación previa de la forma del perfil -----------------------------
    if (!perfil || typeof perfil !== "object") {
        return {
            semilla: original,
            informe: { aplicadas: 0, deshabilitadas: 0, rechazadas: [{ indice: -1, op: "?", id: "?", causa: "perfil nulo o no es objeto" }], idsFinales: original.length, revertidoPorCompleto: true },
            linea: "perfil rechazado: no es un objeto válido",
        };
    }
    if (perfil.version !== 1) {
        rechazadas.push({ indice: -1, op: "version", id: "-", causa: `version «${String(perfil.version)}» no soportada (sólo 1)` });
    }
    if (!Array.isArray(perfil.operaciones)) {
        rechazadas.push({ indice: -1, op: "operaciones", id: "-", causa: "`operaciones` no es un array" });
    }
    if (Array.isArray(perfil.operaciones) && perfil.operaciones.length > MAXIMO_OPERACIONES) {
        rechazadas.push({ indice: -1, op: "operaciones", id: "-", causa: `${perfil.operaciones.length} operaciones > máximo ${MAXIMO_OPERACIONES}` });
    }
    if (rechazadas.length > 0) {
        return armadoRechazo(original, rechazadas);
    }
    // --- Aplicación sobre una copia ------------------------------------------
    let trabajo = original.map(clonar);
    const ids = new Set(trabajo.map((e) => e.id));
    let aplicadas = 0;
    let deshabilitadas = 0;
    const yaDeshabilitados = new Set();
    perfil.operaciones.forEach((op, indice) => {
        const causa = causaDeRechazo(op, ids);
        if (causa) {
            rechazadas.push({ indice, op: String(op?.op ?? "?"), id: String(op?.id ?? op?.entrada?.id ?? "?"), causa });
            return;
        }
        if (op.op === "disable") {
            if (yaDeshabilitados.has(op.id)) {
                aplicadas++; // idempotente: no falla, no duplica el conteo de apagadas
                return;
            }
            trabajo = trabajo.filter((e) => e.id !== op.id);
            ids.delete(op.id);
            yaDeshabilitados.add(op.id);
            deshabilitadas++;
            aplicadas++;
            return;
        }
        if (op.op === "add") {
            const nueva = clonar(op.entrada);
            trabajo.push(nueva);
            ids.add(nueva.id);
            aplicadas++;
            return;
        }
        if (op.op === "replace") {
            trabajo = trabajo.map((e) => {
                if (e.id !== op.id)
                    return e;
                const campos = op.campos ?? {};
                const fusionada = {
                    ...e,
                    ...(campos.title !== undefined ? { title: campos.title } : {}),
                    ...(campos.body !== undefined ? { body: campos.body } : {}),
                    ...(campos.lang !== undefined ? { lang: campos.lang } : {}),
                    ...(campos.table !== undefined ? { table: campos.table } : {}),
                    ...(campos.weight !== undefined ? { weight: campos.weight } : {}),
                    keys: Array.isArray(campos.keys) ? [...campos.keys] : [...e.keys],
                    ...(campos.tags !== undefined ? { tags: Array.isArray(campos.tags) ? [...campos.tags] : undefined } : {}),
                };
                if (campos.tags === undefined && e.tags)
                    fusionada.tags = [...e.tags];
                return fusionada;
            });
            aplicadas++;
            return;
        }
        if (op.op === "extend") {
            trabajo = trabajo.map((e) => {
                if (e.id !== op.id)
                    return e;
                const campos = op.campos ?? {};
                const extendida = {
                    ...e,
                    keys: unirSinDuplicar(e.keys, campos.keys),
                };
                const tags = unirSinDuplicar(e.tags, campos.tags);
                if (tags.length > 0)
                    extendida.tags = tags;
                return extendida;
            });
            aplicadas++;
        }
    });
    // --- Verificación final de invariantes -----------------------------------
    if (rechazadas.length > 0) {
        // Un parche con rechazos NO se aplica a medias: medio parche deja el motor
        // en un estado que nadie declaró. Se revierte todo, con las causas.
        return armadoRechazo(original, rechazadas);
    }
    const idsUnicos = new Set(trabajo.map((e) => e.id));
    if (idsUnicos.size !== trabajo.length) {
        rechazadas.push({ indice: -1, op: "verificacion", id: "-", causa: "el resultado tendría ids duplicados" });
        return armadoRechazo(original, rechazadas);
    }
    if (trabajo.length < MINIMO_ENTRADAS_SEMILLA) {
        rechazadas.push({
            indice: -1,
            op: "verificacion",
            id: "-",
            causa: `la semilla quedaría en ${trabajo.length} entradas (< ${MINIMO_ENTRADAS_SEMILLA} exigidas por motor-estructura)`,
        });
        return armadoRechazo(original, rechazadas);
    }
    const informe = {
        aplicadas,
        deshabilitadas,
        rechazadas: [],
        idsFinales: trabajo.length,
        revertidoPorCompleto: false,
    };
    const linea = `parches: ${aplicadas} aplicadas (${deshabilitadas} desactivadas) · ${trabajo.length} entradas · semilla intacta`;
    return { semilla: trabajo, informe, linea };
}
function armadoRechazo(semilla, rechazadas) {
    const primera = rechazadas[0];
    return {
        semilla: semilla.map(clonar),
        informe: {
            aplicadas: 0,
            deshabilitadas: 0,
            rechazadas,
            idsFinales: semilla.length,
            revertidoPorCompleto: true,
        },
        linea: `parche RECHAZADO y revertido (${rechazadas.length} causa${rechazadas.length === 1 ? "" : "s"}): ${primera.causa}`,
    };
}
// ---------------------------------------------------------------------------
// 5 · ATAJOS PARA QUIEN LLAMA
// ---------------------------------------------------------------------------
/** Un perfil vacío es válido y no cambia nada. Útil como valor por defecto. */
export function perfilVacio(descripcion = "sin parches") {
    return { version: 1, descripcion, operaciones: [] };
}
/**
 * Construye un perfil a partir de una lista de ids a deshabilitar. Es el caso
 * de uso real más frecuente: «apágame este pack y no me toques el código».
 */
export function perfilParaDeshabilitar(ids, motivo) {
    return {
        version: 1,
        descripcion: motivo ?? `desactivar ${ids.length} entrada(s)`,
        operaciones: ids.filter((id) => typeof id === "string" && id.trim()).map((id) => ({ op: "disable", id, motivo })),
    };
}
