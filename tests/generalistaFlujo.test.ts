/**
 * tests/generalistaFlujo.test.ts — ENRUTADO DEL ORQUESTADOR POR CONFIANZA (v1.53.4)
 * ============================================================================
 * Prueba que planificadorPorLeyes(frase) decide bien QUIEN se lleva la frase:
 *   · una ley ESPECÍFICA (porcentaje) GANA a la red de seguridad integradora
 *     (gen-pedido) por confianza, aun cuando la frase trae ambas señales;
 *   · la integradora SOLO entra cuando ninguna específica capturó el pedido;
 *   · las leyes antes HUÉRFANAS que se adoptaron (plan-tareas → planificadores,
 *     crear-variantes → creadores) producen datos válidos y deterministas;
 *   · Paso C / FIX v1.53.4: ant-disenio sin ancho ya NO manda `{}` (el espejo
 *     lo rechazaba) y cnt-qubits ya NO cuela una puerta `t` fantasma desde la
 *     «t» de «cnoT».
 *
 * Determinista: misma frase → misma salida (sin red, sin modelo, sin azar).
 * Se ejecuta con:  npx tsx tests/generalistaFlujo.test.ts
 *
 * NOTA DE VERIFICACIÓN: en el entorno de desarrollo actual NO hay tsx/
 * node_modules, así que esta suite se validó portando la LÓGICA REAL del
 * fuente (temp/harness_routing.mjs EXTRAE los tramos de orquestador.ts y solo
 * quita las anotaciones de tipo): 34/34 en verde bajo Node v16. El type-check
 * completo con tsc queda SIN VERIFICAR hasta que haya node_modules.
 */
import { planificadorPorLeyes } from "../src/engine/reflejo/orquestador";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` \u2014 ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` \u2014 ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);
const J = (x: unknown) => JSON.stringify(x);

seccion("1. Pedido integrador puro → espejo.generalista (red de seguridad gen-pedido)");
{
  const r = planificadorPorLeyes("ayúdame con un proyecto completo de principio a fin");
  comprobar("ok", r.ok, J(r));
  comprobar("espejo.generalista", r.ok && r.espejo === "espejo.generalista", r.ok ? r.espejo : (r as any).motivo);
  comprobar("ley gen-pedido", r.ok && r.ley === "gen-pedido", r.ok ? r.ley : "");
}

seccion("2. «15% de 200» → espejo.matematicos (la específica gana)");
{
  const r = planificadorPorLeyes("cuánto es el 15% de 200");
  comprobar("ok", r.ok, J(r));
  comprobar("espejo.matematicos", r.ok && r.espejo === "espejo.matematicos", r.ok ? r.espejo : (r as any).motivo);
  comprobar("ley mat-porcentaje", r.ok && r.ley === "mat-porcentaje", r.ok ? r.ley : "");
  comprobar("expresion 200 * 15 / 100", r.ok && (r as any).datos?.expresion === "200 * 15 / 100", r.ok ? J((r as any).datos) : "");
}

seccion("3. Frase MIXTA (pedido + porcentaje): la específica debe GANAR por confianza");
{
  const r = planificadorPorLeyes("créame un proyecto que calcule el 15% de 200");
  comprobar("ok", r.ok, J(r));
  comprobar("gana la específica (matematicos), no la integradora", r.ok && r.espejo === "espejo.matematicos", r.ok ? `${r.espejo}/${r.ley}` : (r as any).motivo);
  comprobar("gen-pedido queda confesada como alternativa descartada",
    r.ok && Array.isArray((r as any).alternativas) && (r as any).alternativas.some((a: any) => a.ley === "gen-pedido"),
    r.ok ? J((r as any).alternativas) : "");
}

seccion("4. plan-tareas → espejo.planificadores: ids únicos + dependeDe existente");
{
  const r = planificadorPorLeyes("planifica las tareas: diseñar, luego programar, después probar");
  comprobar("ok", r.ok, J(r));
  comprobar("espejo.planificadores", r.ok && r.espejo === "espejo.planificadores", r.ok ? r.espejo : (r as any).motivo);
  const tareas: any[] = r.ok ? (r as any).datos?.tareas : null;
  comprobar("3 tareas", Array.isArray(tareas) && tareas.length === 3, J(tareas));
  if (Array.isArray(tareas)) {
    const ids = tareas.map((x) => x.id);
    comprobar("ids únicos", new Set(ids).size === ids.length, J(ids));
    const existentes = new Set(ids);
    const depsOk = tareas.every((x) => !x.dependeDe || x.dependeDe.every((d: string) => existentes.has(d)));
    comprobar("cada dependeDe apunta a un id existente", depsOk, J(tareas));
    comprobar("la 1ª tarea no depende de nadie", !tareas[0].dependeDe, J(tareas[0]));
    comprobar("la 2ª depende de la 1ª", !!tareas[1].dependeDe && tareas[1].dependeDe[0] === tareas[0].id, J(tareas[1]));
  }
}

seccion("5. crear-variantes → espejo.creadores: n=20 y ejes bien parseados");
{
  const r = planificadorPorLeyes("genera 20 variantes combinando color: rojo, azul, verde; talla: S, M, L");
  comprobar("ok", r.ok, J(r));
  comprobar("espejo.creadores", r.ok && r.espejo === "espejo.creadores", r.ok ? r.espejo : (r as any).motivo);
  const d: any = r.ok ? (r as any).datos : {};
  comprobar("n = 20", d.n === 20, J(d));
  comprobar("eje color con 3 opciones", Array.isArray(d.ejes?.color) && d.ejes.color.length === 3, J(d.ejes));
  comprobar("eje talla con 3 opciones", Array.isArray(d.ejes?.talla) && d.ejes.talla.length === 3, J(d.ejes));
  comprobar("sistemático por defecto (sin «al azar»)", d.sistematico === true, J(d));
}

seccion("6. Diseño: ancho explícito → dis-ancho gana (confianza mayor)");
{
  const r = planificadorPorLeyes("dame una grilla de 1200 px");
  comprobar("ok", r.ok, J(r));
  comprobar("dis-ancho con ancho=1200", r.ok && r.ley === "dis-ancho" && (r as any).datos?.ancho === 1200, r.ok ? `${r.ley}/${J((r as any).datos)}` : (r as any).motivo);
}

seccion("7. FIX v1.53.4 · ant-disenio SIN ancho ya no manda {} (el espejo lo rechazaba)");
{
  for (const frase of ["aplica un sistema de diseño", "usa escala 8pt", "arma una retícula de 8pt"]) {
    const r = planificadorPorLeyes(frase);
    comprobar(`«${frase}» → ant-disenio con ancho=1200 (no {})`,
      r.ok && r.ley === "ant-disenio" && (r as any).datos?.ancho === 1200,
      r.ok ? `${r.ley}/${J((r as any).datos)}` : (r as any).motivo);
  }
}

seccion("8. FIX v1.53.4 · cnt-qubits ya no cuela una puerta t@0 fantasma desde «cnoT 0»");
{
  const r = planificadorPorLeyes("quiero 3 qubits con h en 0 y cnot 0 1");
  comprobar("ok", r.ok, J(r));
  const p: any[] = r.ok ? (r as any).datos?.puertas : [];
  comprobar("2 puertas (h y cnot), sin t fantasma", Array.isArray(p) && p.length === 2, J(p));
  comprobar("ninguna puerta t espuria", Array.isArray(p) && !p.some((g) => g.p === "t"), J(p));
  comprobar("hay un CNOT 0→1", Array.isArray(p) && p.some((g) => g.p === "cnot" && g.q === 0 && g.t === 1), J(p));
  comprobar("hay un H@0", Array.isArray(p) && p.some((g) => g.p === "h" && g.q === 0), J(p));
}

console.log(`\n\u2014\u2014 generalistaFlujo: ${correctas} correctas, ${fallos.length} en rojo \u2014\u2014`);
if (fallos.length) { for (const f of fallos) console.log("  \u2717 " + f); process.exit(1); }
