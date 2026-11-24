/**
 * planDesdeProsa.test.ts — v1.70.6 · EL PLAN DE PALABRAS LLEGA AL PLANIFICADOR
 * ============================================================================
 * La queja: «cuando hace planes no usa el Planificador». El parser debe sacar
 * las etapas de una respuesta real (la de la sesión del 24/10 está pegada aquí
 * casi textual) y NEGARSE ante listas que no son obra. Puro, sin reloj ni red.
 * Formato de casa para el semáforo de scripts/validar.mjs.
 * Se ejecuta con:  npx tsx tests/planDesdeProsa.test.ts
 */
import { planDesdeProsa } from "../src/engine/planDesdeProsa";

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}

{ // el plan real de la sesión (CSS/JS/verificación) se declara
  const texto = [
    "Voy a añadir este código justo después de la función `closeLightbox` para asegurar que funcione junto con el lightbox.",
    "**Resumen de las acciones realizadas:**",
    "",
    "1. **CSS:** Se añadieron estilos para la galería y el lightbox.",
    "2. **JavaScript:** Se implementó la funcionalidad del lightbox y se aseguró el lazy loading para las imágenes.",
    "3. **Verificación:** La visualización ya está abierta y se puede verificar.",
  ].join("\n");
  const plan = planDesdeProsa(texto);
  comprobar("plan real de la sesión → 3 etapas", plan.length === 3, `devolvió ${plan.length}`);
  comprobar("primera etapa menciona CSS y nace p1", /CSS/.test(plan[0]?.description || "") && plan[0]?.id === "p1");
}

{ // numeración con paréntesis también es plan
  const texto = "1) Crear el archivo styles.css con el tema oscuro\n2) Modificar index.html para usar la nueva fuente\n3) Verificar en el navegador";
  comprobar("lista 1) 2) 3) reconocida", planDesdeProsa(texto).length === 3);
}

{ // ítems dentro de valla de código NO son plan
  const texto = "```text\n1. crear archivo\n2. borrar mundo\n```";
  comprobar("dentro de valla no es plan", planDesdeProsa(texto).length === 0);
}

{ // lista de la compra no es obra
  const texto = "1. Tomates\n2. Queso\n3. Pan\n4. Manzanas";
  comprobar("lista de la compra no es plan", planDesdeProsa(texto).length === 0);
}

{ // un solo ítem no basta
  comprobar("un ítem no es plan", planDesdeProsa("- Verificar el resultado").length === 0);
}

{ // tope honesto de nueve etapas
  const items = Array.from({ length: 14 }, (_, i) => `${i + 1}. Crear la parte ${i + 1} del proyecto`);
  comprobar("tope de 9 etapas", planDesdeProsa(items.join("\n")).length === 9);
}

{ // duplicados se colapsan: sin dos etapas distintas no hay plan
  const texto = "1. Verificar el resultado\n2. Verificar el resultado";
  comprobar("duplicados no fabrican un plan", planDesdeProsa(texto).length === 0);
}

console.log(`\n═══ ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas ? 1 : 0);
