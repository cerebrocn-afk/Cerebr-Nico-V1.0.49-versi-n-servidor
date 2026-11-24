/**
 * tests/jsonParcial.test.ts — PARSER DE JSON PARCIAL EN STREAMING (v1.53.3 · perf #4)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/jsonParcial.test.ts
 */
import { repararJsonParcial, cerrarJson, podarTokenColgante } from "../src/engine/jsonParcial";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` \u2014 ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` \u2014 ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. JSON completo pasa tal cual (no se marca reparado)");
{
  const r = repararJsonParcial('{"a":1,"b":[2,3]}');
  comprobar("ok y no reparado", r.ok && !r.reparado);
  comprobar("valor correcto", JSON.stringify(r.valor) === '{"a":1,"b":[2,3]}');
}

seccion("2. Objeto cortado a medias se cierra");
{
  const r = repararJsonParcial('{"archivos":[{"ruta":"a.ts"},{"ruta":"b.ts"}');
  comprobar("ok y reparado", r.ok && r.reparado);
  comprobar("recupera los 2 archivos", Array.isArray((r.valor as any).archivos) && (r.valor as any).archivos.length === 2);
}

seccion("3. String a medias se cierra");
{
  const r = repararJsonParcial('{"ruta":"src/compo');
  comprobar("ok", r.ok, r.texto);
  comprobar("ruta parcial recuperada", (r.valor as any).ruta === "src/compo");
}

seccion("4. Coma colgante y clave sin valor se podan");
{
  const r1 = repararJsonParcial('{"a":1,');
  comprobar("coma colgante", r1.ok && (r1.valor as any).a === 1);
  const r2 = repararJsonParcial('{"a":1,"b":');
  comprobar("dos puntos sin valor \u2192 poda b", r2.ok && (r2.valor as any).b === undefined && (r2.valor as any).a === 1);
  const r3 = repararJsonParcial('{"a":1,"b"');
  comprobar("clave sin : \u2192 poda b", r3.ok && (r3.valor as any).b === undefined && (r3.valor as any).a === 1);
}

seccion("5. Anidado profundo: array dentro de objeto dentro de array");
{
  const r = repararJsonParcial('{"plan":{"pasos":["uno","do');
  comprobar("ok anidado", r.ok, r.texto);
  comprobar("recupera pasos parciales", Array.isArray((r.valor as any).plan.pasos) && (r.valor as any).plan.pasos[0] === "uno");
}

seccion("6. Casos degenerados");
{
  comprobar("cadena vac\u00eda no rompe", repararJsonParcial("").ok === false);
  comprobar("podar deja null si no queda nada", podarTokenColgante(",") === null);
  comprobar("cerrarJson de prefijo v\u00e1lido a\u00f1ade cierre", (cerrarJson('{"a":[1,2') || "").endsWith("]}"));
}

console.log(`\n\u2014\u2014 jsonParcial: ${correctas} correctas, ${fallos.length} en rojo \u2014\u2014`);
if (fallos.length) { for (const f of fallos) console.log("  \u2717 " + f); process.exit(1); }
