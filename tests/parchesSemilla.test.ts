/**
 * parchesSemilla.test.ts · FASE 8 — suite del perfil de parches por `id`.
 *
 * Las CUATRO garantías que se prueban (una por bloque):
 *   1. NO MUTA la semilla original que recibe.
 *   2. ATÓMICO: un rechazo revierte TODO, no aplica a medias.
 *   3. IDEMPOTENTE al deshabilitar (dos veces = una deshabilitada).
 *   4. NO EJECUTA y no rompe invariantes (`length>=116`, ids únicos).
 *
 * Se construye una semilla de prueba de tamaño suficiente para no disparar la
 * regla de mínimo por accidente, y se ejercita cada operación.
 */
import { MAXIMO_OPERACIONES, MINIMO_ENTRADAS_SEMILLA, aplicarParches, causaDeRechazo, perfilParaDeshabilitar, perfilVacio, } from "../src/engine/parchesSemilla.js";
let pasadas = 0;
let fallidas = 0;
function comprobar(nombre, condicion, detalle) {
    if (condicion) {
        pasadas++;
        return;
    }
    fallidas++;
    console.error(`  ✗ ${nombre}${detalle ? ` → ${detalle}` : ""}`);
}
function igual(nombre, real, esperado) {
    comprobar(nombre, real === esperado, `esperado ${JSON.stringify(esperado)}, recibido ${JSON.stringify(real)}`);
}
/** Semilla sintética: 120 entradas, ids `e-0`..`e-119`, bien formadas. */
function semillaPrueba() {
    return Array.from({ length: MINIMO_ENTRADAS_SEMILLA + 4 }, (_, i) => ({
        id: `e-${i}`,
        table: "syntax",
        title: `Entrada ${i}`,
        body: `cuerpo de la entrada ${i}`,
        keys: [`clave${i}`, `otra${i}`],
        weight: 0.5,
    }));
}
console.log("FASE 8 · parchesSemilla");
// --- 1 · No muta la entrada original ----------------------------------------
{
    const original = semillaPrueba();
    const antes = JSON.stringify(original);
    const r = aplicarParches(original, {
        version: 1,
        descripcion: "prueba de no-mutación",
        operaciones: [
            { op: "disable", id: "e-3", motivo: "duplicado de e-4" },
            { op: "replace", id: "e-5", campos: { title: "Título nuevo" } },
            { op: "extend", id: "e-6", campos: { keys: ["nueva"] } },
            { op: "add", entrada: { id: "nueva-1", table: "rule", title: "Regla nueva", body: "no rompas nada", keys: ["regla"] } },
        ],
    });
    igual("no-muta: la semilla original queda byte a byte igual", JSON.stringify(original), antes);
    igual("no-muta: la nueva semilla es otra instancia", r.semilla !== original, true);
    igual("no-muta: aplicadas 4", r.informe.aplicadas, 4);
    igual("no-muta: deshabilitadas 1", r.informe.deshabilitadas, 1);
    igual("no-muta: ids finales = 120 - 1 + 1", r.informe.idsFinales, MINIMO_ENTRADAS_SEMILLA + 4);
    igual("no-muta: e-3 ya no está", r.semilla.some((e) => e.id === "e-3"), false);
    igual("no-muta: e-5 tiene el título nuevo", r.semilla.find((e) => e.id === "e-5")?.title, "Título nuevo");
    comprobar("no-muta: e-5 CONSERVA sus keys", JSON.stringify(r.semilla.find((e) => e.id === "e-5")?.keys) === JSON.stringify(["clave5", "otra5"]));
    comprobar("no-muta: e-6 tiene su key nueva y las viejas", (r.semilla.find((e) => e.id === "e-6")?.keys ?? []).length === 3);
    igual("no-muta: la nueva entrada está", r.semilla.some((e) => e.id === "nueva-1"), true);
}
// --- 2 · Atomicidad: un rechazo revierte TODO --------------------------------
{
    const original = semillaPrueba();
    const r = aplicarParches(original, {
        version: 1,
        operaciones: [
            { op: "disable", id: "e-10" }, // válida
            { op: "disable", id: "no-existe" }, // inválida
        ],
    });
    igual("atómico: revertidoPorCompleto", r.informe.revertidoPorCompleto, true);
    igual("atómico: cero aplicadas", r.informe.aplicadas, 0);
    comprobar("atómico: e-10 SIGUE ESTANDO (no entró a medias)", r.semilla.some((e) => e.id === "e-10"));
    comprobar("atómico: hay 1 causa reportada", r.informe.rechazadas.length === 1, JSON.stringify(r.informe.rechazadas));
    comprobar("atómico: la causa nombra el id", /no-existe/.test(r.informe.rechazadas[0]?.causa ?? ""));
    comprobar("atómico: la línea dice REVERTIDO", /REVERTIDO/.test(r.linea));
    // Romper la invariante de mínimo también revierte todo.
    const pocas = semillaPrueba().slice(0, MINIMO_ENTRADAS_SEMILLA);
    const idsADeshabilitar = pocas.slice(0, 5).map((e) => e.id);
    const rMin = aplicarParches(pocas, perfilParaDeshabilitar(idsADeshabilitar, "prueba de suelo"));
    igual("atómico: bajar de 116 revierte", rMin.informe.revertidoPorCompleto, true);
    comprobar("atómico: la causa menciona el suelo 116", /116/.test(rMin.informe.rechazadas[0]?.causa ?? ""), JSON.stringify(rMin.informe.rechazadas));
    igual("atómico: la semilla se queda en su tamaño", rMin.semilla.length, MINIMO_ENTRADAS_SEMILLA);
    // v1.0.4 · EL INVARIANTE, NO EL CASO SUELTO. El rojo de arriba sobrevivió a
    // dos versiones del módulo porque la valla miraba UN rechazo particular y
    // nadie atesoraba el vínculo entre lo que informa el motor y lo que lee el
    // operador. La regla: si el informe dice «se devolvió todo», la línea lo grita
    // y la semilla que vuelve es la que entró, con su tamaño.
    // (Cada caso lleva su PROPIA base: `rMin` arrancó de 116 entradas, no de 120.)
    const casos: Array<{ nombre: string; base: number; res: ReturnType<typeof aplicarParches> }> = [
      { nombre: "operación inválida", base: original.length, res: r },
      { nombre: "piso de entradas", base: pocas.length, res: rMin },
      { nombre: "perfil nulo", base: semillaPrueba().length, res: aplicarParches(semillaPrueba(), null) },
      { nombre: "demasiadas operaciones", base: semillaPrueba().length, res: aplicarParches(semillaPrueba(), { version: 1, operaciones: Array.from({ length: MAXIMO_OPERACIONES + 1 }, () => ({ op: "disable" as const, id: "e-0" })) }) },
    ];
    for (const ca of casos) {
      if (!ca.res.informe.revertidoPorCompleto) continue;
      comprobar(`invariante: «${ca.nombre}» revierte todo y lo GRITA en la línea`, /REVERTIDO/.test(ca.res.linea), ca.res.linea);
      comprobar(`invariante: «${ca.nombre}» devuelve la semilla con su tamaño (${ca.base})`, ca.res.semilla.length === ca.base, `volvió con ${ca.res.semilla.length}`);
    }

}
// --- 3 · Idempotencia y operaciones válidas ---------------------------------
{
    // Deshabilitar dos veces el mismo id: no falla, no cuenta doble.
    const doble = aplicarParches(semillaPrueba(), {
        version: 1,
        operaciones: [{ op: "disable", id: "e-7" }, { op: "disable", id: "e-7" }],
    });
    igual("idempotente: no revierte", doble.informe.revertidoPorCompleto, false);
    igual("idempotente: deshabilitadas = 1", doble.informe.deshabilitadas, 1);
    igual("idempotente: la semilla baja una sola vez", doble.informe.idsFinales, MINIMO_ENTRADAS_SEMILLA + 3);
    // Perfil vacío es válido y no cambia nada.
    const vacio = aplicarParches(semillaPrueba(), perfilVacio());
    igual("vacío: no aplica nada", vacio.informe.aplicadas, 0);
    igual("vacío: no revierte", vacio.informe.revertidoPorCompleto, false);
    igual("vacío: tamaño intacto", vacio.informe.idsFinales, MINIMO_ENTRADAS_SEMILLA + 4);
}
// --- 4 · No ejecuta, no rompe invariantes, valida la forma ------------------
{
    const semilla = semillaPrueba();
    // add de una table inválida: rechazo, no excepción.
    const malTable = aplicarParches(semilla, {
        version: 1,
        operaciones: [{ op: "add", entrada: { id: "x", table: "ejecuta", title: "t", body: "b", keys: ["k"] } }],
    });
    igual("forma: table inválida → rechazo", malTable.informe.revertidoPorCompleto, true);
    // add que ya existe: hay que usar replace, no se pisa en silencio.
    const yaExiste = aplicarParches(semilla, {
        version: 1,
        operaciones: [{ op: "add", entrada: { id: "e-0", table: "rule", title: "t", body: "b", keys: ["k"] } }],
    });
    comprobar("forma: add duplicado rechazado", yaExiste.informe.revertidoPorCompleto, "add sobre id existente se rechaza");
    // replace NO puede cambiar el id.
    const cambiarId = aplicarParches(semilla, {
        version: 1,
        operaciones: [{ op: "replace", id: "e-1", campos: { id: "otro" } }],
    });
    igual("forma: replace que cambia el id → rechazo", cambiarId.informe.revertidoPorCompleto, true);
    // extend sólo admite keys/tags.
    const extendIntruso = aplicarParches(semilla, {
        version: 1,
        operaciones: [{ op: "extend", id: "e-2", campos: { title: "cambio por la puerta de atrás" } }],
    });
    igual("forma: extend con title → rechazo", extendIntruso.informe.revertidoPorCompleto, true);
    comprobar("forma: la causa explica que es por keys/tags", /keys\/tags/.test(extendIntruso.informe.rechazadas[0]?.causa ?? ""), JSON.stringify(extendIntruso.informe.rechazadas));
    // version no soportada.
    const versionMala = aplicarParches(semilla, { version: 2, operaciones: [] });
    igual("forma: version 2 → rechazo", versionMala.informe.revertidoPorCompleto, true);
    // Demasiadas operaciones.
    const demasiadas = aplicarParches(semilla, {
        version: 1,
        operaciones: Array.from({ length: MAXIMO_OPERACIONES + 1 }, () => ({ op: "disable", id: "e-0" })),
    });
    igual("forma: >max operaciones → rechazo", demasiadas.informe.revertidoPorCompleto, true);
    // Perfil nulo no lanza.
    const nulo = aplicarParches(semilla, null);
    igual("forma: perfil nulo → rechazo sin excepción", nulo.informe.revertidoPorCompleto, true);
    // causaDeRechazo es puro y exportable (útil para un panel futuro).
    igual("puro: causaDeRechazo(add ok) = null", causaDeRechazo({ op: "add", entrada: { id: "n", table: "rule", title: "t", body: "b", keys: ["k"] } }, new Set(semilla.map((e) => e.id))), null);
}
// --- 5 · Caso real: apagar un pack, el que la FASE 8 existe para servir -----
{
    const original = semillaPrueba();
    const pack = ["e-100", "e-101", "e-102", "e-103"];
    const r = aplicarParches(original, perfilParaDeshabilitar(pack, "apagar pack de saber X"));
    igual("pack: las 4 se apagan", r.informe.deshabilitadas, 4);
    igual("pack: ninguna queda", r.semilla.some((e) => pack.includes(e.id)), false);
    igual("pack: sin tocar el resto", r.semilla.length, MINIMO_ENTRADAS_SEMILLA);
    comprobar("pack: la línea informa el nuevo tamaño", /116 entradas/.test(r.linea), r.linea);
    // Y el original sigue teniendo las 4: el parche no consumió nada.
    permanente("pack: la semilla original conserva las 4");
}
function permanente(nombre) {
    comprobar(nombre, semillaPrueba().some((e) => e.id === "e-100"));
}
// --- Cierre ------------------------------------------------------------------
console.log(`\n${pasadas} comprobaciones OK · ${fallidas} fallidas`);
if (fallidas > 0) {
    process.exitCode = 1;
}
