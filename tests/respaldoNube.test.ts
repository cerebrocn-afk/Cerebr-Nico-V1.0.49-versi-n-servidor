/**
 * tests/respaldoNube.test.ts — v1.0.16
 * ====================================
 * Failover entre nubes gratis inestables (Mario: «clouds gratis inestables»).
 * Correr: npx tsx tests/respaldoNube.test.ts
 */
import {
  esFalloDeProveedor,
  cadenaDeRespaldo,
  enfriarProveedor,
  type ProveedorNube,
} from "../server/respaldoNube";

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = "") {
  if (condicion) { correctas++; console.log(`  ✓ ${titulo}`); }
  else { fallos.push(`${titulo}${detalle ? ` :: ${detalle}` : ""}`); console.log(`  ✗ ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

// ═══ 1. esFalloDeProveedor ════════════════════════
seccion("1) Distinguir fallo DEL PROVEEDOR de culpa del pedido");
{
  comprobar("★ 429 es fallo de proveedor (rota)", esFalloDeProveedor(429));
  comprobar("★ 503 es fallo de proveedor", esFalloDeProveedor(503));
  comprobar("500/502/504 rotan", esFalloDeProveedor(500) && esFalloDeProveedor(502) && esFalloDeProveedor(504));
  comprobar("★ 401 NO rota (clave mala)", !esFalloDeProveedor(401));
  comprobar("403 NO rota", !esFalloDeProveedor(403));
  comprobar("404 NO rota (modelo inexistente)", !esFalloDeProveedor(404));
  comprobar("400 NO rota (pedido malo)", !esFalloDeProveedor(400));
  comprobar("mensaje de rate limit sin status rota", esFalloDeProveedor(0, "Error: rate limit exceeded"));
  comprobar("mensaje de timeout rota", esFalloDeProveedor(undefined, "fetch failed: ETIMEDOUT"));
  comprobar("RESOURCE_EXHAUSTED rota", esFalloDeProveedor(undefined, "429 RESOURCE_EXHAUSTED quota"));
  comprobar("mensaje normal NO rota", !esFalloDeProveedor(0, "respuesta ok"));
}

// ═══ 2. cadenaDeRespaldo ═════════════════════════
seccion("2) La cadena empieza por el actual vivo y rota a los que tienen clave");
{
  const todas: Partial<Record<ProveedorNube, boolean>> = {
    zai: true, groq: true, openrouter: true, cerebras: true,
    together: true, deepseek: true, mistral: true, fireworks: true,
  };
  const c1 = cadenaDeRespaldo("openrouter", todas, {}, 1000);
  comprobar("★ el actual (openrouter) va primero si está vivo", c1[0] === "openrouter", c1.join(","));
  comprobar("incluye al resto del pool con clave", c1.length === 8);

  // openrouter enfriado por fallo reciente → rota al primer preferido vivo (zai).
  const enfriados = enfriarProveedor({}, "openrouter", 1000, 60_000);
  const c2 = cadenaDeRespaldo("openrouter", todas, enfriados, 2000);
  comprobar("★ si el actual está enfriado, NO va primero", c2[0] !== "openrouter", c2.join(","));
  comprobar("★ rota al primer preferido vivo (zai)", c2[0] === "zai", c2.join(","));
  comprobar("el enfriado ni aparece mientras dure", !c2.includes("openrouter"));

  // Pasado el enfriamiento, vuelve a estar disponible.
  const c3 = cadenaDeRespaldo("openrouter", todas, enfriados, 1000 + 60_000 + 1);
  comprobar("vencido el enfriamiento, el actual vuelve primero", c3[0] === "openrouter");

  // Sin clave para el actual: arranca por el primero que SÍ la tiene.
  const soloGroq: Partial<Record<ProveedorNube, boolean>> = { groq: true };
  const c4 = cadenaDeRespaldo("openrouter", soloGroq, {}, 1000);
  comprobar("★ sin clave del actual, arranca por el que tiene (groq)", c4[0] === "groq" && c4.length === 1, c4.join(","));

  // Ninguno vivo: devuelve igual el actual (nunca cadena vacía).
  const c5 = cadenaDeRespaldo("openrouter", {}, {}, 1000);
  comprobar("★ sin ningún vivo, cae al actual (mensaje claro, no vacío)", c5.length === 1 && c5[0] === "openrouter");
}

// ═══ 3. enfriarProveedor ════════════════════════
seccion("3) Enfriar no muta el mapa de entrada");
{
  const base: Partial<Record<ProveedorNube, number>> = { groq: 500 };
  const nuevo = enfriarProveedor(base, "zai", 1000, 60_000);
  comprobar("★ el nuevo mapa enfría al proveedor", nuevo.zai === 61_000, String(nuevo.zai));
  comprobar("conserva lo anterior", nuevo.groq === 500);
  comprobar("no muta la entrada", base.zai === undefined);
}

// ═══ Resumen ══════════════════════
console.log(`\n═══ ${correctas} correctas, ${fallos.length} fallos ═══`);
if (fallos.length) { for (const f of fallos) console.log(`  ✗ ${f}`); process.exit(1); }
console.log("TODO VERDE ✓");
