/**
 * tests/configEstructurada.test.ts — SALIDA FORZADA + ORDEN DE CACHÉ (v1.53.3 · Paso A)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/configEstructurada.test.ts
 */
import {
  proveedorApiDe, fragmentoSalida, fragmentoSalidaPara,
  ordenarParaCache, claveCache, type SegmentoContexto,
} from "../src/engine/configEstructurada";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` \u2014 ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` \u2014 ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. Familia de API por modelo");
{
  comprobar("gemini-3-pro \u2192 gemini", proveedorApiDe("gemini-3-pro") === "gemini");
  comprobar("glm-4.6 \u2192 openai-compat", proveedorApiDe("glm-4.6") === "openai-compat");
  comprobar("gpt-4o \u2192 openai-compat", proveedorApiDe("gpt-4o") === "openai-compat");
}

seccion("2. JSON forzado seg\u00fan familia");
{
  const f = fragmentoSalida("json");
  comprobar("gemini pide application/json", f.gemini.responseMimeType === "application/json");
  comprobar("openai-compat pide json_object sin schema", (f.openaiCompat.response_format as any)?.type === "json_object");

  const fs = fragmentoSalida("json", { type: "object", properties: {} });
  comprobar("gemini con schema aade responseSchema", !!(fs.gemini as any).responseSchema);
  comprobar("openai-compat con schema usa json_schema strict", (fs.openaiCompat.response_format as any)?.type === "json_schema" && (fs.openaiCompat.response_format as any)?.json_schema?.strict === true);
}

seccion("3. Texto libre NO fuerza nada (cero regresi\u00f3n)");
{
  const f = fragmentoSalida("texto");
  comprobar("gemini vac\u00edo", Object.keys(f.gemini).length === 0);
  comprobar("openai-compat vac\u00edo", Object.keys(f.openaiCompat).length === 0);
  comprobar("azcar fragmentoSalidaPara(gemini) trae responseMimeType", (fragmentoSalidaPara("gemini-3-pro", "json") as any).responseMimeType === "application/json");
}

seccion("4. Orden de cach\u00e9: est\u00e1tico \u2192 din\u00e1mico, estable");
{
  const segs: SegmentoContexto[] = [
    { nombre: "archivo-editado", estabilidad: "dinamico", texto: "const x = 1" },
    { nombre: "reglas-casa", estabilidad: "estatico", texto: "REGLAS" },
    { nombre: "instrucciones", estabilidad: "semi", texto: "S\u00e9 arquitecto" },
    { nombre: "kbArquitectura", estabilidad: "estatico", texto: "KB" },
  ];
  const ord = ordenarParaCache(segs);
  comprobar("primero los est\u00e1ticos", ord[0].estabilidad === "estatico" && ord[1].estabilidad === "estatico");
  comprobar("estables conservan orden original (reglas antes que kb)", ord[0].nombre === "reglas-casa" && ord[1].nombre === "kbArquitectura");
  comprobar("el din\u00e1mico queda al final", ord[ord.length - 1].nombre === "archivo-editado");
}

seccion("5. Clave de cach\u00e9: estable salvo el bloque din\u00e1mico");
{
  const base: SegmentoContexto[] = [
    { nombre: "kb", estabilidad: "estatico", texto: "KB-FIJO" },
    { nombre: "instr", estabilidad: "semi", texto: "INSTR" },
    { nombre: "codigo", estabilidad: "dinamico", texto: "v1" },
  ];
  const otro: SegmentoContexto[] = [
    { nombre: "kb", estabilidad: "estatico", texto: "KB-FIJO" },
    { nombre: "instr", estabilidad: "semi", texto: "INSTR" },
    { nombre: "codigo", estabilidad: "dinamico", texto: "v2-DISTINTO" },
  ];
  comprobar("misma clave aunque cambie el c\u00f3digo din\u00e1mico", claveCache(base) === claveCache(otro));
  const cambiaEstable = [...base]; cambiaEstable[0] = { nombre: "kb", estabilidad: "estatico", texto: "KB-OTRO" };
  comprobar("clave cambia si cambia el prefijo estable", claveCache(cambiaEstable) !== claveCache(base));
  comprobar("clave tiene prefijo cc_", /^cc_[0-9a-f]{8}$/.test(claveCache(base)));
}

console.log(`\n\u2014\u2014 configEstructurada: ${correctas} correctas, ${fallos.length} en rojo \u2014\u2014`);
if (fallos.length) { for (const f of fallos) console.log("  \u2717 " + f); process.exit(1); }
