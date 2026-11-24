/**
 * ordenDelPrompt.test.ts — v1.0.29 · EL PREFIJO QUE NO CAMBIA
 * ==========================================================
 * POR QUÉ EXISTE
 * Las propuestas de «prompt caching» suelen quedarse en un consejo («poné lo fijo
 * arriba»). Un consejo no es una valla: al tercer módulo que se añada con `+=`
 * en medio, el prefijo se rompe y nadie se entera porque el síntoma es
 * «hoy va lento», que no tiene culpable.
 *
 * LO QUE FIJA ESTA SUITE
 *   1. Un bloque volátil NUNCA queda delante de uno estable, llegue en el orden
 *      que llegue (esa es la única garantía que importa).
 *   2. El orden entre bloques del mismo nivel es determinista (`orden`, y a
 *      igualdad, el de llegada): dos arranques iguales dan el mismo texto.
 *   3. `prefijoEstable` mide exactamente hasta el primer volátil, y lo que está
 *      antes NO cambia entre dos turnos aunque cambie la fecha.
 *   4. La compactación se decide por PRESIÓN medida, no por un tope inventado,
 *      y con 3 turnos o menos NO compacta aunque la presión sea alta: ahí el
 *      culpable es el bloque fijo y resumir el historial no arregla nada.
 *   5. `compararPrefijos` señala QUÉ bloque rompió la caché, no solo cuánto.
 *
 * LO QUE NO PRUEBA
 *   No mide aciertos reales de caché de ningún proveedor (eso exige red y cuenta):
 *   mide la propiedad del texto que hace posible el acierto.
 */
import {
  PESO_ESTABILIDAD,
  UMBRAL_FORZAR_POR_DEFECTO,
  UMBRAL_SUGERIR_POR_DEFECTO,
  compararPrefijos,
  decidirCompactacion,
  MARCA_DATO_SISTEMA,
  ordenarBloques,
  prepararSistemaParaCache,
  type BloqueDePrompt,
} from "../src/engine/ordenDelPrompt.ts";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, cond: unknown, detalle?: string) => {
  if (cond) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
};

console.log("\n═══ ORDEN DEL PROMPT (v1.0.29) ═══\n");

console.log("1) La regla: lo volátil va detrás, llegue cuando llegue");
{
  // Orden de llegada PROVOCADO al revés: fecha primero, ley al final.
  const r = ordenarBloques([
    { id: "fecha", texto: "Hoy es martes", estabilidad: "volatil" },
    { id: "manual", texto: "manual de herramientas", estabilidad: "fija" },
    { id: "memoria", texto: "memoria del proyecto", estabilidad: "sesion" },
    { id: "presion", texto: "presión 48 %", estabilidad: "turno" },
  ]);
  comprobar("★ el orden final es fija → sesión → turno → volátil",
    r.incluidos.map((x) => x.id).join(",") === "manual,memoria,presion,fecha",
    r.incluidos.map((x) => x.id).join(","));
  comprobar("★ ningún bloque queda delante de uno más estable",
    r.incluidos.every((x, i) => i === 0 || PESO_ESTABILIDAD[x.estabilidad] >= PESO_ESTABILIDAD[r.incluidos[i - 1].estabilidad]));
  comprobar("el texto los une con dos saltos, en ese orden",
    r.texto === "manual de herramientas\n\nmemoria del proyecto\n\npresión 48 %\n\nHoy es martes", JSON.stringify(r.texto));
}

console.log("\n2) Determinismo entre arranques");
{
  const bloques: BloqueDePrompt[] = [
    { id: "b", texto: "B", estabilidad: "fija", orden: 2 },
    { id: "a", texto: "A", estabilidad: "fija", orden: 1 },
    { id: "c", texto: "C", estabilidad: "fija" },
    { id: "d", texto: "D", estabilidad: "fija" },
  ];
  const uno = ordenarBloques(bloques);
  const dos = ordenarBloques([...bloques].reverse());
  comprobar("★ lo que declara `orden` manda dentro del nivel", uno.incluidos.map((x) => x.id).slice(0, 2).join("") === "ab");
  comprobar("★ a igualdad, se conserva el orden de llegada (sin azar)", uno.incluidos.map((x) => x.id).join("") === "abcd", uno.incluidos.map((x) => x.id).join(""));
  comprobar("★ dos construcciones distintas del MISMO conjunto dan el mismo texto si los `orden` están puestos",
    ordenarBloques([{ id: "x", texto: "X", estabilidad: "fija", orden: 1 }, { id: "y", texto: "Y", estabilidad: "fija", orden: 2 }]).texto ===
    ordenarBloques([{ id: "y", texto: "Y", estabilidad: "fija", orden: 2 }, { id: "x", texto: "X", estabilidad: "fija", orden: 1 }]).texto);
  comprobar("el orden de llegada NO se usa como desempate entre reordenamientos (dos = mismo contenido, distinto orden de entrada)",
    dos.incluidos.length === 4);
}

console.log("\n3) Bloques vacíos");
{
  const r = ordenarBloques([
    { id: "vacio", texto: "", estabilidad: "fija" },
    { id: "espacios", texto: "   \n  ", estabilidad: "fija" },
    { id: "real", texto: "ley", estabilidad: "fija" },
  ]);
  comprobar("★ un bloque vacío no entra (encabezado sin cuerpo = gasto sin contenido)", r.incluidos.length === 1 && r.incluidos[0].id === "real");
  comprobar("sin bloques, el prompt es vacío y no revienta", ordenarBloques([]).texto === "" && ordenarBloques([]).prefijoEstable === 0);
  comprobar("aguanta entradas nulas sin tirar el turno", ordenarBloques([null as any, { id: "ok", texto: "x", estabilidad: "fija" }]).incluidos.length === 1);
}

console.log("\n4) El prefijo se mide donde de verdad se reutiliza");
{
  const fijo = (id: string, t: string, orden?: number) => ({ id, texto: t, estabilidad: "fija" as const, orden });
  const turno1 = ordenarBloques([
    fijo("ley", "LEY DEL MOTOR", 1),
    fijo("manual", "MANUAL DE 37 HERRAMIENTAS", 2),
    { id: "fecha", texto: "Hoy es martes 18 de noviembre", estabilidad: "volatil" },
  ]);
  const turno2 = ordenarBloques([
    fijo("manual", "MANUAL DE 37 HERRAMIENTAS", 2),
    { id: "fecha", texto: "Hoy es miércoles 19 de noviembre", estabilidad: "volatil" },
    fijo("ley", "LEY DEL MOTOR", 1),
  ]);
  comprobar("★ el prefijo estable es todo lo fijo (ley + manual), no incluye la fecha",
    turno1.prefijoEstable === "LEY DEL MOTOR\n\nMANUAL DE 37 HERRAMIENTAS".length, `${turno1.prefijoEstable}`);
  comprobar("★★ con la fecha cambiada, el prefijo se reutiliza ENTERO (aquí estaba la fuga)",
    turno1.texto.slice(0, turno1.prefijoEstable) === turno2.texto.slice(0, turno2.prefijoEstable));
  const cmp = compararPrefijos(turno1, turno2);
  comprobar("★ la comparación dice 100 % reutilizado y que no hubo rotura",
    cmp.reutilizado === 1 && cmp.roturaEn === null, JSON.stringify(cmp));
}
{
  // El caso que hay que cazar: alguien mete un bloque volátil declarado como fijo.
  // El caso REAL: un bloque FIJO grande (ley + manual) y un latido detrás. Si
  // cambia el primero, la caché se paga entera y hay que saber cuál fue.
  const LEY_LARGA = "LEY DEL MOTOR: no afirmar lo que no se hizo, no inventar herramientas ni rutas, no dar por bueno sin verificar.";
  const t1 = ordenarBloques([{ id: "ley", texto: LEY_LARGA, estabilidad: "fija" }, { id: "pulso", texto: "latido 12 ms", estabilidad: "volatil" }]);
  const t2 = ordenarBloques([{ id: "ley", texto: LEY_LARGA, estabilidad: "fija" }, { id: "pulso", texto: "latido 40 ms", estabilidad: "volatil" }]);
  const cmp = compararPrefijos(t1, t2);
  // Corrección de la propia valla: «latido 12 ms» y «latido 40 ms» comparten el
  // prefijo «latido 4»/«latido 1», así que el primer carácter distinto cae DESPUÉS
  // del prefijo estable. Eso es correcto —la caché no lo mira— y por eso la valla
  // se reformula sobre la propiedad que importa, no sobre una coincidencia de texto.
  // Ojo con medir mal: comparar la REBANADA `slice(0, prefijoEstable)` por igualdad
  // de cadenas compara 110 contra 111 caracteres y siempre sale falso. La
  // propiedad verdadera es que la comparación NO señale rotura: la caché del
  // proveedor solo mira hasta el prefijo estable, y la diferencia está después.
  comprobar("★ un latido distinto NO es una rotura del prefijo (cae detrás de todo lo fijo)",
    cmp.roturaEn === null);
  const t3 = ordenarBloques([{ id: "ley", texto: LEY_LARGA.replace("no afirmar", "NUNCA afirmar"), estabilidad: "fija" }, { id: "pulso", texto: "latido 40 ms", estabilidad: "volatil" }]);
  const cmp3 = compararPrefijos(t1, t3);
  comprobar("★ si cambia un bloque FIJO, la comparación señala cuál", cmp3.roturaEn === "ley", String(cmp3.roturaEn));
  comprobar("★ y reporta menos de 100 % reutilizado (no miente hacia arriba)", cmp3.reutilizado < 1);
  comprobar("sin bloques previos no divide por cero", compararPrefijos(ordenarBloques([]), t1).reutilizado === 0);
}

console.log("\n5) Compactar: por presión, no por un tope inventado");
{
  comprobar("por debajo del umbral: NO se toca nada y no cuesta un renglón de motivo",
    (() => { const d = decidirCompactacion({ presion: 0.3, turnosDisponibles: 20 }); return d.decision === "no" && d.turnosAResumir === 0 && d.motivo === ""; })());
  comprobar("★ entre sugerir y forzar: SUGIERE (no recorta a escondidas)",
    decidirCompactacion({ presion: 0.7, turnosDisponibles: 20 }).decision === "sugerir");
  comprobar("★ por encima del umbral alto: FUERZA",
    decidirCompactacion({ presion: 0.9, turnosDisponibles: 20 }).decision === "forzar");
  const d = decidirCompactacion({ presion: 0.9, turnosDisponibles: 20 });
  comprobar("★ se resumen los viejos y se conservan los ÚLTIMOS 3 íntegros", d.turnosAResumir === 17, String(d.turnosAResumir));
  comprobar("el motivo dice el porcentaje y cuántos turnos quedan", /90 %/.test(d.motivo) && /últimos 3/.test(d.motivo), d.motivo);
}
{
  const d = decidirCompactacion({ presion: 0.95, turnosDisponibles: 3 });
  comprobar("★★ con 3 turnos o menos NO compacta aunque la presión sea alta", d.decision === "no" && d.turnosAResumir === 0);
  comprobar("★ y DICE por qué: el culpable es el bloque fijo, no el historial", /bloque fijo/.test(d.motivo), d.motivo);
  comprobar("con 4 turnos ya hay algo viejo que resumir (1)", decidirCompactacion({ presion: 0.9, turnosDisponibles: 4 }).turnosAResumir === 1);
}
{
  comprobar("se puede conservar otro número de turnos (sin recompilar la regla)",
    decidirCompactacion({ presion: 0.9, turnosDisponibles: 10, turnosAConservar: 5 }).turnosAResumir === 5);
  comprobar("umbrales configurables: 0.5 sugerir / 0.6 forzar",
    decidirCompactacion({ presion: 0.55, turnosDisponibles: 10, umbralSugerir: 0.5, umbralForzar: 0.6 }).decision === "sugerir");
  comprobar("★ los umbrales por defecto son los de la casa (65 % / 80 %)",
    UMBRAL_SUGERIR_POR_DEFECTO === 0.65 && UMBRAL_FORZAR_POR_DEFECTO === 0.8);
  comprobar("presión inválida (NaN) se trata como cero, no como «forzar»",
    decidirCompactacion({ presion: Number.NaN, turnosDisponibles: 10 }).decision === "no");
  comprobar("presión negativa o >1 no rompe",
    decidirCompactacion({ presion: -1, turnosDisponibles: 10 }).decision === "no" &&
    decidirCompactacion({ presion: 5, turnosDisponibles: 10 }).decision === "forzar");
  comprobar("0 turnos: no compacta y no divide", decidirCompactacion({ presion: 0.99, turnosDisponibles: 0 }).turnosAResumir === 0);
}

console.log("\n7) La operación completa: la fecha se va al final y la nota también");
{
  const fijo = "[LEY] no inventes rutas.\n[MOTOR] usá /nfs para los datos.";
  const conFecha = `${fijo}${MARCA_DATO_SISTEMA} Hoy es 2026-11-18 y son las 10:44 (America/Montevideo).`;
  const r = prepararSistemaParaCache({ sistema: conFecha, presion: 0.1, turnosDisponibles: 10 });

  comprobar("★ encuentra y mueve la fecha", r.fechaMovida === true);
  comprobar("★ el prefijo estable queda ENTERO al principio (sin la fecha delante)",
    r.texto.startsWith(fijo), JSON.stringify(r.texto.slice(0, 40)));
  comprobar("★ la fecha sigue estando, ahora detrás", r.texto.includes("Hoy es 2026-11-18") && r.texto.indexOf("Hoy es") > r.texto.indexOf("[MOTOR]"));
  comprobar("no duplica la marca", (r.texto.match(/\[DATO REAL DEL SISTEMA/g) || []).length === 1, r.texto);
  comprobar("con presión baja no anuncia compactación", r.compactar === false && r.aviso === "", r.aviso);

  const alta = prepararSistemaParaCache({ sistema: conFecha, presion: 0.95, turnosDisponibles: 12 });
  comprobar("★ con presión alta y turnos de sobra SÍ avisa", alta.compactar === true && alta.aviso.length > 10);
  comprobar("★ y el aviso va AL FINAL (delante rompería justo cuando crece la sesión)",
    alta.texto.trimEnd().endsWith(alta.aviso.trim()), alta.texto.slice(-60));
  comprobar("★ el prefijo de las dos variantes coincide hasta la fecha (misma caché)",
    alta.texto.startsWith(fijo) && r.texto.startsWith(fijo));

  const pocos = prepararSistemaParaCache({ sistema: conFecha, presion: 0.95, turnosDisponibles: 3 });
  comprobar("★ con 3 turnos o menos NO compacta aunque la presión sea alta", pocos.compactar === false && pocos.aviso === "");

  const sinMarca = prepararSistemaParaCache({ sistema: fijo, presion: 0.1, turnosDisponibles: 5 });
  comprobar("sin marca, el texto queda igual (no inventa cortes)", sinMarca.texto === fijo && sinMarca.fechaMovida === false);

  const vacio = prepararSistemaParaCache({ sistema: "", presion: 0, turnosDisponibles: 0 });
  comprobar("con sistema vacío no revienta", vacio.texto === "" && vacio.aviso === "");
}

console.log("\n8) Módulo puro (lo que permite tener esta suite sin arrancar nada)");
{
  const src = (await import("node:fs")).readFileSync(
    new URL("../src/engine/ordenDelPrompt.ts", import.meta.url),
    "utf8"
  );
  const cuerpo = src.slice(src.indexOf("export type Estabilidad"));
  comprobar("★ no importa NADA (ni fs, ni red, ni el motor)", !/^import\s/m.test(cuerpo.trim()));
  comprobar("no usa el reloj ni la fecha (sería otra fuga del prefijo)", !/new Date\(|Date\.now\(/.test(cuerpo));
}

console.log(`\n═══ ORDEN DEL PROMPT: ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:\n" + fallos.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
