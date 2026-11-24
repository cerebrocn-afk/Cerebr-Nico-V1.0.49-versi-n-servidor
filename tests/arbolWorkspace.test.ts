// v1.60.5 · Test del DOBLE ÁRBOL VISIBLE del explorador (capa pura).
// Ejecutar:  node /tmp/tsxrun/node_modules/.bin/tsx tests/arbolWorkspace.test.ts
import {
  inferirArbol,
  insigniaArbol,
  contarArboles,
  marcarComoEntrada,
  promoverArchivo,
  expulsarArchivo,
} from "../src/utils/arbolWorkspace";

let pasados = 0;
let fallados = 0;
function ok(nombre: string, cond: boolean, extra = "") {
  if (cond) { pasados++; console.log(`  ✓ ${nombre}`); }
  else { fallados++; console.error(`  ✗ ${nombre} ${extra}`); }
}

console.log("\n[arbolWorkspace] inferirArbol: por defecto sandbox");
{
  ok("sin campo → sandbox", inferirArbol({ id: "a" }) === "sandbox");
  ok("entrada explícita → entrada", inferirArbol({ id: "a", arbol: "entrada" }) === "entrada");
  ok("sandbox explícito → sandbox", inferirArbol({ id: "a", arbol: "sandbox" }) === "sandbox");
  ok("null no revienta", inferirArbol(null) === "sandbox");
  ok("undefined no revienta", inferirArbol(undefined) === "sandbox");
}

console.log("\n[arbolWorkspace] insigniaArbol: metadatos de UI");
{
  const e = insigniaArbol("entrada");
  const s = insigniaArbol("sandbox");
  ok("entrada icono 📥", e.icono === "📥");
  ok("sandbox icono 🏗️", s.icono === "🏗️");
  ok("entrada etiqueta", e.etiqueta === "Entrada");
  ok("sandbox etiqueta", s.etiqueta === "Sandbox");
  ok("entrada tiene título explicativo", e.titulo.length > 10 && /promuevas|promover|promu/i.test(e.titulo));
  ok("sandbox dice que el motor lo edita", /motor/i.test(s.titulo));
  ok("entrada clases ámbar", /amber/.test(e.clases));
  ok("sandbox clases esmeralda", /emerald/.test(s.clases));
}

console.log("\n[arbolWorkspace] contarArboles");
{
  const files = [
    { id: "1", arbol: "entrada" as const },
    { id: "2", arbol: "sandbox" as const },
    { id: "3" }, // sin campo → sandbox
    { id: "4", arbol: "entrada" as const },
  ];
  const c = contarArboles(files);
  ok("entrada=2", c.entrada === 2, `-> ${c.entrada}`);
  ok("sandbox=2", c.sandbox === 2, `-> ${c.sandbox}`);
  ok("total=4", c.total === 4);
  ok("lista vacía → ceros", contarArboles([]).total === 0);
}

console.log("\n[arbolWorkspace] marcarComoEntrada (aduana de adjuntos)");
{
  const src = [{ id: "1" }, { id: "2", arbol: "sandbox" as const }];
  const r = marcarComoEntrada(src);
  ok("el que no tenía campo → entrada", r[0].arbol === "entrada");
  ok("respeta clasificación previa", r[1].arbol === "sandbox");
  ok("no muta el original", (src[0] as any).arbol === undefined);
}

console.log("\n[arbolWorkspace] promoverArchivo / expulsarArchivo (puras)");
{
  const src = [
    { id: "1", arbol: "entrada" as const },
    { id: "2", arbol: "entrada" as const },
  ];
  const p = promoverArchivo(src, "1");
  ok("promueve el id pedido", p[0].arbol === "sandbox");
  ok("no toca a los demás", p[1].arbol === "entrada");
  ok("no muta el original", src[0].arbol === "entrada");
  ok("id inexistente → sin cambios", promoverArchivo(src, "zzz").every((f) => f.arbol === "entrada"));

  const e = expulsarArchivo(p, "1");
  ok("expulsar devuelve a entrada", e[0].arbol === "entrada");
  ok("idempotente: promover 2 veces", promoverArchivo(promoverArchivo(src, "1"), "1")[0].arbol === "sandbox");
}

console.log(`\n[arbolWorkspace] RESULTADO: ${pasados} pasados, ${fallados} fallados`);
if (fallados > 0) process.exit(1);
