/**
 * sandboxRaizAnidada.test.ts — LA RAÍZ DEL PROYECTO ANIDADO (v1.6.22)
 * ==================================================================
 * Regresión del defecto «npm install corre en C:\Cerebronico y no en
 * C:\Cerebronico\ide\backend».
 *
 * El sync escribe el workspace con su carpeta contenedora (p. ej.
 * `ide/backend/package.json`), de modo que el proyecto real vive ANIDADO dentro
 * de la raíz de datos. `resolverRaizProyecto()` es quien debe encontrarlo y
 * devolver ESA raíz; si devuelve la base, el `npm install`/`npm run dev` falla
 * con ENOENT porque en la base no hay `package.json`.
 *
 * Esta suite comprueba el resolutor contra tres escenarios reales en disco:
 * proyecto anidado, proyecto en la base y raíz vacía.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolverRaizProyecto, resolverDestinoSandbox } from "../src/engine/projectPorter";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "cn-raiz-"));

console.log("\n1) Proyecto anidado: devuelve la subcarpeta, no la base\n");

{
  const base = tmp();
  const anidada = path.join(base, "ide", "backend");
  fs.mkdirSync(anidada, { recursive: true });
  fs.writeFileSync(path.join(anidada, "package.json"), "{}");
  const r = resolverRaizProyecto(base);
  comprobar("la raíz apunta a la subcarpeta con package.json", r.raiz === anidada, r.raiz);
  comprobar("marca anidada: true", r.anidada === true);
  comprobar("tiene package.json", r.tienePkg === true);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log("\n2) Proyecto en la base: se queda en la base\n");

{
  const base = tmp();
  fs.writeFileSync(path.join(base, "package.json"), "{}");
  const r = resolverRaizProyecto(base);
  comprobar("la raíz es la base", r.raiz === base, r.raiz);
  comprobar("marca anidada: false", r.anidada === false);
  comprobar("tiene package.json", r.tienePkg === true);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log("\n3) Raíz vacía: devuelve la base (no inventa nada)\n");

{
  const base = tmp();
  const r = resolverRaizProyecto(base);
  comprobar("sin proyecto devuelve la base", r.raiz === base, r.raiz);
  comprobar("sin package.json", r.tienePkg === false);
  comprobar("no anidada", r.anidada === false);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log("\n4) index.html viejo en la base NO secuestra: gana el sitio en subcarpeta (v1.48.2)\n");

{
  // Reproduce el BUG de Mario: la raiz de datos tiene un index.html viejo (la
  // pagina "Panel de Capacidades") y el creador escribio el sitio nuevo en
  // `.creador/<slug>/`. El preview debe mostrar el sitio nuevo, NO el panel.
  const base = tmp();
  fs.writeFileSync(path.join(base, "index.html"), "<h1>Panel de Capacidades del Ecosistema CerebroNico</h1>");
  const sitio = path.join(base, ".creador", "veterinaria-huellas-real");
  fs.mkdirSync(sitio, { recursive: true });
  fs.writeFileSync(path.join(sitio, "index.html"), "<h1>Veterinaria Huellas</h1>");
  const r = resolverRaizProyecto(base);
  comprobar("la raiz apunta al sitio en subcarpeta, no al panel de la base", r.raiz === sitio, r.raiz);
  comprobar("marca anidada: true", r.anidada === true);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log("\n5) Desempate por recencia: el ultimo sitio creado gana al alfabetico (v1.48.2)\n");

{
  // Dos sitios estaticos empatados en todo salvo la fecha. Antes ganaba
  // "cerebronico-ide" por alfabetico ('c' < 'v'); ahora debe ganar el mas
  // reciente ("veterinaria-huellas"), que es el que el usuario acaba de crear.
  const base = tmp();
  const viejo = path.join(base, "cerebronico-ide");
  const nuevo = path.join(base, "veterinaria-huellas");
  fs.mkdirSync(viejo, { recursive: true });
  fs.mkdirSync(nuevo, { recursive: true });
  const idxViejo = path.join(viejo, "index.html");
  const idxNuevo = path.join(nuevo, "index.html");
  fs.writeFileSync(idxViejo, "<h1>viejo</h1>");
  fs.writeFileSync(idxNuevo, "<h1>nuevo</h1>");
  const t0 = Date.now() / 1000;
  fs.utimesSync(idxViejo, t0 - 3600, t0 - 3600); // 1 h mas viejo
  fs.utimesSync(idxNuevo, t0, t0);               // recien creado
  const r = resolverRaizProyecto(base);
  comprobar("gana el sitio mas reciente, no el alfabetico", r.raiz === nuevo, r.raiz);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log("\n6) El destino del usuario (pin/vinculada) gana al desempate por recencia (v1.86.6)\n");

{
  // Dos sitios estáticos iguales salvo mtime: la autodetección elige el más
  // reciente. Pero si el usuario fijó una carpeta (CANAL DIRECTO o `destino`
  // explícito), ese pin manda aunque sea el más viejo — es el bug real de
  // `cerebro-man` vs `cerebro-nico`.
  const base = tmp();
  const viejo = path.join(base, "cerebro-nico");
  const nuevo = path.join(base, "cerebro-man");
  fs.mkdirSync(viejo, { recursive: true });
  fs.mkdirSync(nuevo, { recursive: true });
  const idxViejo = path.join(viejo, "index.html");
  const idxNuevo = path.join(nuevo, "index.html");
  fs.writeFileSync(idxViejo, "<h1>elegido</h1>");
  fs.writeFileSync(idxNuevo, "<h1>reciente</h1>");
  const t0 = Date.now() / 1000;
  fs.utimesSync(idxViejo, t0 - 3600, t0 - 3600);
  fs.utimesSync(idxNuevo, t0, t0);

  // 6a — sin pin: gana el más reciente (el comportamiento de recencia intacto).
  const auto = resolverRaizProyecto(base);
  comprobar("6a · sin pin, la autodetección elige el más reciente", auto.raiz === nuevo, auto.raiz);

  // 6b — carpeta vinculada = el sitio elegido (aunque sea el más viejo).
  const conVinculada = resolverDestinoSandbox(base, null, viejo);
  comprobar("6b · la carpeta vinculada gana al desempate por recencia", conVinculada.raiz === viejo, conVinculada.raiz);
  comprobar("6b · origen: vinculada", conVinculada.origen === "vinculada", conVinculada.origen);

  // 6c — destino explícito gana sobre vinculada y sobre recencia.
  const conDestino = resolverDestinoSandbox(base, viejo, nuevo);
  comprobar("6c · el destino explícito manda", conDestino.raiz === viejo, conDestino.raiz);
  comprobar("6c · origen: explicito", conDestino.origen === "explicito", conDestino.origen);

  // 6d — un pin que NO es servible (carpeta de trabajo sin index.html ni
  // package.json) no secuestra el preview: cae a la autodetección.
  const fotos = path.join(base, "fotos");
  fs.mkdirSync(fotos, { recursive: true });
  fs.writeFileSync(path.join(fotos, "nota.txt"), "solo archivos");
  const sinWeb = resolverDestinoSandbox(base, null, fotos);
  comprobar("6d · un pin no-servible no secuestra: vuelve a la autodetección", sinWeb.raiz === nuevo, sinWeb.raiz);
  comprobar("6d · origen: autodeteccion", sinWeb.origen === "autodeteccion", sinWeb.origen);

  fs.rmSync(base, { recursive: true, force: true });
}

console.log(`\n═══ RAÍZ ANIDADA DEL SANDBOX (v1.6.22): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
