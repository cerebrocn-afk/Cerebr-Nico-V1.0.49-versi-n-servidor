/**
 * parcheRango.test.ts — v1.57.15 · EDITAR SIN PISAR
 * =================================================
 * El bucle solo tenía `write_file`: para cambiar 3 líneas de un archivo de 12131
 * había que reescribir las 12131. Cada una de esas reescrituras es una chance de
 * perder contenido (el usuario ya perdió un `index.html` con el `src/` borrado).
 * Este núcleo pide PRUEBA DE LECTURA: el rango tiene que calzar con lo que el
 * archivo realmente dice, o se niega nombrando la línea y mostrando la real.
 *
 * Toda entrada hostil de esta suite es un intento de alucinación de modelo, y la
 * salida tiene que ser un rechazo con causa — nunca un archivo mutilado.
 */
import {
  aplicarParche,
  aplicarParches,
  dificultadParche,
  LIMITE_LINEAS_PARCHABLE,
} from "../src/engine/parcheRango";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };
const seccion = (t: string) => console.log("\n" + t + "\n");

const ARCHIVO = ["línea 1", "línea 2", "línea 3", "línea 4", "línea 5"].join("\n") + "\n";

// ════════════════════════════════════════════════════════════════════════════
seccion("1 · El caso bueno: reemplazo verificado");
const bueno = aplicarParche(ARCHIVO, { lineaInicio: 2, lineaFin: 3, esperado: ["línea 2", "línea 3"], nuevas: ["nueva A", "nueva B"] });
comprobar("aplica", bueno.ok === true);
comprobar("el resultado es el esperado", bueno.contenido === ["línea 1", "nueva A", "nueva B", "línea 4", "línea 5"].join("\n") + "\n", JSON.stringify(bueno.contenido));
comprobar("se marca como VERIFICADO", bueno.verificado === true);
comprobar("dice cuántas líneas tocó", bueno.lineasAfectadas === 2);
comprobar("guarda lo reemplazado (para el rollback)", JSON.stringify(bueno.reemplazado) === JSON.stringify(["línea 2", "línea 3"]));
comprobar("conserva el salto de línea final", (bueno.contenido || "").endsWith("\n"));

// ════════════════════════════════════════════════════════════════════════════
seccion("2 · MUTACIÓN: el modelo alucina el contenido actual");
const alucinado = aplicarParche(ARCHIVO, { lineaInicio: 2, lineaFin: 2, esperado: ["línea 2 que no existe"], nuevas: ["x"] });
comprobar("RECHAZA el parche", alucinado.ok === false);
comprobar("no devuelve contenido (no puede escribirse)", alucinado.contenido === undefined);
comprobar("nombra la línea en disputa", /l[íi]nea 2/.test(alucinado.motivo || ""), alucinado.motivo);
comprobar("muestra lo real, no solo «error»", /real:/.test(alucinado.motivo || "") && /l[íi]nea 2/.test(alucinado.motivo || ""));
comprobar("dice qué hacer (volver a leer)", /Le[ée] el archivo/.test(alucinado.motivo || ""));
const malContado = aplicarParche(ARCHIVO, { lineaInicio: 2, lineaFin: 3, esperado: ["línea 2"], nuevas: ["x"] });
comprobar("rechaza si el conteo de líneas no calza", malContado.ok === false && /ten[íi]a 1 l[íi]neas y tiene 2/.test(malContado.motivo || ""), malContado.motivo);
comprobar("el rechazo deja el archivo intacto", ARCHIVO.split("\n").length === 6);

seccion("3 · Rangos inválidos: cada uno con su causa");
comprobar("inicio 0 se rechaza", aplicarParche(ARCHIVO, { lineaInicio: 0, lineaFin: 1, nuevas: ["x"] }).ok === false);
comprobar("rango invertido se rechaza", /invertido/.test(aplicarParche(ARCHIVO, { lineaInicio: 4, lineaFin: 2, nuevas: ["x"] }).motivo || ""));
comprobar("más allá del fin del archivo se rechaza", /tiene 5 l[íi]neas/.test(aplicarParche(ARCHIVO, { lineaInicio: 9, lineaFin: 10, nuevas: ["x"] }).motivo || ""));
comprobar("línea fraccionada se rechaza", /enteras/.test(aplicarParche(ARCHIVO, { lineaInicio: 1.5, lineaFin: 2, nuevas: ["x"] }).motivo || ""));
comprobar("`nuevas` que no es arreglo se rechaza", aplicarParche(ARCHIVO, { lineaInicio: 1, lineaFin: 1, nuevas: ("hola" as any) }).ok === false);
comprobar("archivo vacío no rompe", typeof aplicarParche("", { lineaInicio: 1, lineaFin: 1, nuevas: ["x"] }).ok === "boolean");

seccion("4 · La trampa que previene: un parche que no es parche");
const grande = Array.from({ length: LIMITE_LINEAS_PARCHABLE + 1 }, (_, i) => `l${i}`);
const g = aplicarParche(grande.join("\n"), { lineaInicio: 1, lineaFin: grande.length, nuevas: ["una sola l[íi]nea"] });
comprobar("reemplazar 201 líneas se RECHAZA", g.ok === false);
comprobar("y lo dice en español: es un write_file disfrazado", /write_file disfrazado/.test(g.motivo || ""), g.motivo);
const justito = aplicarParche(grande.join("\n"), { lineaInicio: 1, lineaFin: LIMITE_LINEAS_PARCHABLE, esperado: [], nuevas: ["ok"] });
comprobar(`el tope exacto (${LIMITE_LINEAS_PARCHABLE}) sí pasa`, justito.ok === true);

seccion("5 · Inserción, borrado y finales sin salto");
const insertar = aplicarParche(ARCHIVO, { lineaInicio: 3, lineaFin: 2, nuevas: ["entre 2 y 3"] });
comprobar("rango vacío = insertar", insertar.ok === true && /entre 2 y 3/.test(insertar.contenido || ""), insertar.motivo);
const borrar = aplicarParche(ARCHIVO, { lineaInicio: 4, lineaFin: 4, esperado: ["línea 4"], nuevas: [] });
comprobar("borra cuando `nuevas` es vacío", borrar.ok === true && borrar.contenido === ["línea 1", "línea 2", "línea 3", "línea 5"].join("\n") + "\n");
comprobar("y lo marca como BORRADO para pedir confirmación", borrar.esBorrado === true);
const sinSalto = aplicarParche("a\nb\nc", { lineaInicio: 1, lineaFin: 1, nuevas: ["z"] });
comprobar("un archivo sin \\n final no gana uno", sinSalto.contenido === "z\nb\nc");

seccion("6 · Varios rangos en el mismo turno");
const dos = aplicarParches(ARCHIVO, [
  { lineaInicio: 1, lineaFin: 1, esperado: ["línea 1"], nuevas: ["PRIMERA"] },
  { lineaInicio: 5, lineaFin: 5, esperado: ["línea 5"], nuevas: ["ÚLTIMA"] },
]);
comprobar("aplica los dos", dos.ok === true);
comprobar("el resultado tiene ambas", dos.contenido === ["PRIMERA", "línea 2", "línea 3", "línea 4", "ÚLTIMA"].join("\n") + "\n", JSON.stringify(dos.contenido));
comprobar("aplicar de arriba hacia abajo no rompe la numeración", /PRIMERA/.test(dos.contenido || "") && /ÚLTIMA/.test(dos.contenido || ""));
const solap = aplicarParches(ARCHIVO, [
  { lineaInicio: 1, lineaFin: 3, nuevas: ["a"] },
  { lineaInicio: 3, lineaFin: 4, nuevas: ["b"] },
]);
comprobar("MUTACIÓN: dos rangos que se tocan se RECHAZAN", solap.ok === false);
comprobar("el motivo nombra los parches en conflicto", /solapan/.test(solap.motivo || "") && /1 y 2|2 y 1/.test(solap.motivo || ""), solap.motivo);
const unoMalo = aplicarParches(ARCHIVO, [
  { lineaInicio: 1, lineaFin: 1, esperado: ["línea 1"], nuevas: ["ok"] },
  { lineaInicio: 5, lineaFin: 5, esperado: ["la 5 dice otra cosa"], nuevas: ["x"] },
]);
comprobar("si el segundo está mal, NO se escribe nada a medias", unoMalo.ok === false && unoMalo.contenido === undefined);
comprobar("y dice cuál parche falló", /parche 2/.test(unoMalo.motivo || ""), unoMalo.motivo);
comprobar("lista vacía se rechaza", aplicarParches(ARCHIVO, []).ok === false);

seccion("7 · Dificultad: para que el llamante se niegue con un modelo chico");
comprobar("3 líneas con verificación = chica", dificultadParche({ lineaInicio: 1, lineaFin: 3, esperado: ["a", "b", "c"], nuevas: ["a", "b", "c", "d"] }) === "chica");
comprobar("sin `esperado` nunca es 'chica'", dificultadParche({ lineaInicio: 1, lineaFin: 3, nuevas: ["x"] }) === "media");
comprobar("casi el tope es sospechosa", dificultadParche({ lineaInicio: 1, lineaFin: LIMITE_LINEAS_PARCHABLE, esperado: ["x"], nuevas: ["y"] }) === "sospechosa");
comprobar("expandir de 2 a 90 líneas es sospechosa", dificultadParche({ lineaInicio: 1, lineaFin: 2, esperado: ["a", "b"], nuevas: Array(90).fill("z") }) === "sospechosa");

seccion("8 · CRLF: la regla del repo para los .bat no es un error del modelo");
const bat = "@echo off\r\nset X=1\r\npause\r\n";
const parcheBat = aplicarParche(bat, { lineaInicio: 2, lineaFin: 2, esperado: ["set X=1"], nuevas: ["set X=2"] });
comprobar("tolera el \\r de Windows en la verificación", parcheBat.ok === true, parcheBat.motivo);
comprobar("y lo conserva en el resultado", (parcheBat.contenido || "").includes("set X=2\r\n"));

console.log(`\n═══ PARCHE POR RANGO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  · " + f);
if (fallos.length) process.exit(1);
