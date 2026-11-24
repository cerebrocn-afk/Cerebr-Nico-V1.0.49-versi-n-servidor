/**
 * tests/espejosPoderesCableados.test.ts — EL REPARTO DE PODERES, A LA VISTA (v1.0.6)
 * ================================================================================
 * LA PREGUNTA DE MARIO (7/11): «¿puede ser que 3 espejos no tengan
 * habilidad/nombre?». Medido con el módulo cargado (no a ojo), eran TRES:
 * generalista, creadores y físicos.
 *
 * SU RESPUESTA (9/11): «sí sería mejor que tengan una función en específico».
 * v1.0.6 se la dio, y esta valla cambia de bando: ya no atesora la ausencia,
 * la PROHÍBE. El reparto que vigila ahora es:
 *
 *   IDS_ESPEJOS .................... 13
 *   PODERES (poderes-espejos.ts) ... 11   los 8 de siempre + generalista,
 *                                         creadores y fisicos (v1.0.6)
 *   ACCIONES_ESPEJOS_NUEVOS ........ 2    medicina, codigo (despacho propio)
 *   SIN NINGUNA HABILIDAD .......... 0    ← el hueco, cerrado
 *
 * Si alguien vuelve a dejar un espejo sin función, la suite se pone roja y
 * obliga a declararlo en ESPEJOS_SIN_PODERES con nombre y motivo. Y si alguien
 * rompe una de las acciones nuevas, las pruebas de conducta del final lo dicen.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { IDS_ESPEJOS } from "../src/engine/reflejo/espejos";
import { PODERES, ESPEJOS_SIN_PODERES, ESPEJOS_CON_DESPACHO_PROPIO, CATALOGO_TURBO, potenciarEspejos } from "../src/engine/reflejo/poderes-espejos";
import { ACCIONES_ESPEJOS_NUEVOS } from "../src/engine/reflejo/espejosNuevos";

let correctas = 0;
const rojos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  PASS   ${nombre}`); }
  else { rojos.push(nombre); console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`); }
}

console.log("═══ ESPEJOS · el reparto de habilidades, declarado y vigilado · v1.0.6 ═══\n");

const inventario = IDS_ESPEJOS as readonly string[];
const conPoderes = Object.keys(PODERES);
const conDespacho = Object.keys(ACCIONES_ESPEJOS_NUEVOS);
const sinNada = inventario.filter((i) => !conPoderes.includes(i) && !conDespacho.includes(i));

console.log(`  inventario: ${inventario.length} · con PODERES: ${conPoderes.length} · con despacho propio: ${conDespacho.length} · sin ninguna: ${sinNada.length}\n`);

comprobar("el inventario del espejo tiene los 13 ids de siempre", inventario.length === 13, `${inventario.length}`);
comprobar("★ CERO espejos sin habilidad (el pedido de Mario, cumplido)", sinNada.length === 0, sinNada.join(", "));
comprobar("los tres huérfanos ya están en PODERES",
  ["espejo.generalista", "espejo.creadores", "espejo.fisicos"].every((i) => conPoderes.includes(i)),
  conPoderes.join(", "));

// El reparto declarado tiene que ser EXACTAMENTE el real, en los dos sentidos.
comprobar("ESPEJOS_SIN_PODERES dice la verdad (no sobra ninguno)",
  ESPEJOS_SIN_PODERES.every((i) => sinNada.includes(i)), ESPEJOS_SIN_PODERES.join(", "));
comprobar("ESPEJOS_SIN_PODERES no esconde ninguno (falta declarar)",
  sinNada.every((i) => ESPEJOS_SIN_PODERES.includes(i)), sinNada.join(", "));
comprobar("ESPEJOS_CON_DESPACHO_PROPIOS coincide con ACCIONES_ESPEJOS_NUEVOS",
  ESPEJOS_CON_DESPACHO_PROPIO.slice().sort().join() === conDespacho.slice().sort().join(),
  ESPEJOS_CON_DESPACHO_PROPIO.join(", ") + " vs " + conDespacho.join(", "));
comprobar("las tres listas se excluyen entre sí (nadie está en dos mundos)",
  ESPEJOS_SIN_PODERES.every((i) => !conPoderes.includes(i) && !conDespacho.includes(i))
  && ESPEJOS_CON_DESPACHO_PROPIO.every((i) => !conPoderes.includes(i)));
comprobar("★ todo id del inventario está en alguna de las tres categorías",
  inventario.every((i) => conPoderes.includes(i) || conDespacho.includes(i) || ESPEJOS_SIN_PODERES.includes(i)),
  inventario.filter((i) => !conPoderes.includes(i) && !conDespacho.includes(i) && !ESPEJOS_SIN_PODERES.includes(i)).join(", "));

// El catálogo que lee el modelo.
comprobar("CATALOGO_TURBO nombra a los que NO tienen poderes (si alguna vez vuelve a haberlos)",
  ESPEJOS_SIN_PODERES.every((i) => CATALOGO_TURBO.includes(i)));
comprobar("y nombra también los de despacho propio (medicina, codigo)",
  ESPEJOS_CON_DESPACHO_PROPIO.every((i) => CATALOGO_TURBO.includes(i)));
comprobar("y sigue nombrando a los potenciados", conPoderes.every((i) => CATALOGO_TURBO.includes(i)));
comprobar("★ el catálogo declara que los 13 tienen acción propia",
  /ninguno queda sin función/.test(CATALOGO_TURBO), CATALOGO_TURBO.slice(-160));

// ── Conducta: las acciones nuevas de v1.0.6 responden de verdad ───────────
{
  const r = (id: string, t0: number, ok: boolean, extra: any) => ({ ok, entidad: id, ms: Date.now() - t0, ...extra }) as any;
  const clásica = (d: any) => ({ ok: true, entidad: "espejo.fisicos", ms: 1, salida: "clásica" }) as any;

  // generalista · derivar
  {
    const ent: any = { id: "espejo.generalista", nombre: "Espejo · Generalista", ejecutar: clásica };
    potenciarEspejos([ent], r as any);
    const res: any = ent.ejecutar({ accion: "derivar", pedido: "arregla este bug de typescript en el endpoint" });
    const out = res.ok ? JSON.parse(res.salida) : {};
    comprobar("★ generalista.derivar enruta un pedido de código a reflejo/codigo",
      res.ok === true && out.ruta === "reflejo" && (out.dominios || []).some((d: any) => d.grupo === "codigo"),
      JSON.stringify(out).slice(0, 160));
    const vacio: any = ent.ejecutar({ accion: "derivar", pedido: "   " });
    comprobar("generalista.derivar sin pedido NO inventa ruta: devuelve motivo",
      vacio.ok === false && /pedido/.test(String(vacio.motivo)), String(vacio.motivo));
    const sinSenal: any = ent.ejecutar({ accion: "derivar", pedido: "hola que tal" });
    const out2 = sinSenal.ok ? JSON.parse(sinSenal.salida) : {};
    comprobar("generalista.derivar sin señales deriva al conductor (no adivina)",
      sinSenal.ok === true && out2.ruta === "conductor", JSON.stringify(out2).slice(0, 120));
    const est: any = ent.ejecutar({ accion: "estado" });
    comprobar("generalista.estado se autodescribe con sus acciones",
      est.ok === true && /derivar/.test(String(est.salida)), String(est.salida).slice(0, 120));
    const clas: any = ent.ejecutar({ pedido: "x" });
    comprobar("generalista sin `accion` conserva su orden clásica",
      clas.ok === true && clas.salida === "clásica");
  }

  // creadores · variantes / espacio
  {
    const ent: any = { id: "espejo.creadores", nombre: "Espejo · Creadores", ejecutar: clásica };
    potenciarEspejos([ent], r as any);
    const ejes = { paleta: ["claro", "noche", "oceano"], hero: ["centrado", "split"] };
    const res: any = ent.ejecutar({ accion: "variantes", ejes, n: 6, semilla: "mario" });
    const out = res.ok ? JSON.parse(res.salida) : {};
    comprobar("★ creadores.variantes genera 6 combos deterministas sobre 6 posibles",
      res.ok === true && out.n === 6 && out.espacioMuestral === 6 && Array.isArray(out.variantes),
      JSON.stringify(out).slice(0, 160));
    const otra: any = ent.ejecutar({ accion: "variantes", ejes, n: 6, semilla: "mario" });
    comprobar("misma semilla ⇒ mismas variantes (determinista)",
      otra.ok === true && otra.salida === res.salida);
    const esp: any = ent.ejecutar({ accion: "espacio", ejes });
    const outEsp = esp.ok ? JSON.parse(esp.salida) : {};
    comprobar("creadores.espacio cuenta el espacio muestral sin generar nada",
      esp.ok === true && outEsp.espacioMuestral === 6 && outEsp.ejes === 2, JSON.stringify(outEsp).slice(0, 140));
    const malo: any = ent.ejecutar({ accion: "variantes", ejes: { a: [] } });
    comprobar("creadores.variantes rechaza un eje vacío en vez de inventar",
      malo.ok === false && /eje|lista/.test(String(malo.motivo)), String(malo.motivo));
  }

  // fisicos · evaluar / convertir
  {
    const ent: any = { id: "espejo.fisicos", nombre: "Espejo · Físicos", ejecutar: clásica };
    potenciarEspejos([ent], r as any);
    const res: any = ent.ejecutar({ accion: "evaluar", expresion: "2*c" });
    const out = res.ok ? JSON.parse(res.salida) : {};
    comprobar("★ fisicos.evaluar calcula 2*c con la constante SI exacta",
      res.ok === true && out.valor === 599584916, JSON.stringify(out).slice(0, 140));
    const conv: any = ent.ejecutar({ accion: "convertir", cantidad: 2, de: "km", a: "m" });
    const outC = conv.ok ? JSON.parse(conv.salida) : {};
    comprobar("fisicos.convertir pasa 2 km a 2000 m",
      conv.ok === true && outC.resultado === 2000, JSON.stringify(outC).slice(0, 140));
    const mala: any = ent.ejecutar({ accion: "convertir", cantidad: 1, de: "codo", a: "m" });
    comprobar("fisicos.convertir NO inventa unidades fuera de la tabla SI",
      mala.ok === false && /tabla SI/.test(String(mala.motivo)), String(mala.motivo));
    const rota: any = ent.ejecutar({ accion: "evaluar", expresion: "2*" });
    comprobar("fisicos.evaluar devuelve error de sintaxis, no un número falso",
      rota.ok === false && /inválida/.test(String(rota.motivo)), String(rota.motivo));
  }
}

// Que el fix de poderes-espejos no se comiera a los de despacho propio.
{
  const r = (id: string, t0: number, ok: boolean, extra: any) => ({ ok, entidad: id, ms: 0, ...extra }) as any;
  const propia = (d: any) => ({ ok: true, entidad: "espejo.medicina", ms: 1, salida: `despacho:${d?.accion}` }) as any;
  const med: any = { id: "espejo.medicina", nombre: "Espejo · Medicina", ejecutar: propia };
  potenciarEspejos([med], r as any);
  const res: any = med.ejecutar({ accion: "imc", peso: 70, altura: 1.75 });
  comprobar("★ medicina conserva su despacho: la envoltura nueva NO la intercepta",
    res.ok === true && String(res.salida).startsWith("despacho:"), JSON.stringify(res).slice(0, 120));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`ESPEJOS · PODERES CABLEADOS (v1.0.6): ${correctas} correctas · ${rojos.length} fallos`);
if (rojos.length) { for (const r of rojos) console.log(`  · ${r}`); process.exit(1); }
