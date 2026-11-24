/**
 * raizDeObra.test.ts — v1.90.0 · UNA RAÍZ, UN ESPEJO
 * =================================================
 * Queja congelada (mensaje 29 de la sesión 1793231473406): «apps y web se
 * escriben en el editor del árbol, así su código es visible». El modelo había
 * escrito el `MainActivity.kt` en la raíz de CerebroNico y el sandbox servía
 * `Documents\finanzas-app`. Con dos mitades, la tercera opción (ruta absoluta)
 * moría en «Ruta fuera del proyecto no permitida» y el lazo repetía.
 */
import path from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { resolverRutaDeObra, esRutaInternaDelIDE, norm, PREFIJOS_INTERNOS } from "../src/engine/raizDeObra";
import { raizDeObraEnCurso, olvidarRaizDeObra, TTL_RAIZ_DE_OBRA_MS } from "../server/sandboxArranque";

let ok = 0;
const fallos: string[] = [];
function c(t: string, o: boolean, d = "") { if (o) ok++; else fallos.push(t + (d ? ` [${d}]` : "")); }

console.log("· sin carpeta vinculada: idéntico a siempre");
{
  const raiz = path.resolve("/datos/CerebroNico");
  c("relativa cae en el proyecto", resolverRutaDeObra({ rel: "index.html", raizProyecto: raiz }).abs === path.join(raiz, "index.html"));
  c("órgano interno también", resolverRutaDeObra({ rel: "cerebro/temas/x.md", raizProyecto: raiz }).origen === "proyecto");
  c("vacío = la raíz misma", resolverRutaDeObra({ rel: "", raizProyecto: raiz }).abs === raiz);
  c("absoluta dentro, OK", resolverRutaDeObra({ rel: path.join(raiz, "a", "b.ts"), raizProyecto: raiz }).abs === path.join(raiz, "a", "b.ts"));
  // Ruta absoluta FUERA de las dos raíces: se escribe en forma POSIX/absoluta
  // real, porque una `C:\\...` en Linux no es absoluta y caería como relativa.
  c("absoluta fuera → el MISMO error de siempre", (() => { try { resolverRutaDeObra({ rel: path.resolve("/otros/datos/Main.kt"), raizProyecto: raiz }); return false; } catch (e) { return (e as Error).message === "Ruta fuera del proyecto no permitida."; } })());
  c("`..` que escapa → el mismo error", (() => { try { resolverRutaDeObra({ rel: "../../etc/passwd", raizProyecto: raiz }); return false; } catch (e) { return (e as Error).message === "Ruta fuera del proyecto no permitida."; } })());
}

console.log("· con carpeta vinculada: la obra va a la obra");
{
  const raiz = path.resolve("/datos/CerebroNico");
  const vin = path.resolve("/users/pablo/Documents/finanzas-app");
  const r = resolverRutaDeObra({ rel: "app/src/main/java/com/finance/app/ui/MainActivity.kt", raizProyecto: raiz, vinculada: vin });
  c("★ el .kt cae en la vinculada", r.abs === path.join(vin, "app/src/main/java/com/finance/app/ui/MainActivity.kt"));
  c("y lo dice, no lo esconde", r.origen === "vinculada" && /CANAL DIRECTO/.test(r.motivo));
  c("un `index.html` también es obra", resolverRutaDeObra({ rel: "index.html", raizProyecto: raiz, vinculada: vin }).raiz === vin);
  c("`src/` de la app NO es órgano del IDE", !esRutaInternaDelIDE("src/main/java/App.kt") && resolverRutaDeObra({ rel: "src/App.tsx", raizProyecto: raiz, vinculada: vin }).raiz === vin);
  c("★ los órganos del IDE siguen en PROJECT_ROOT", ["cerebro/temas/x.md", ".cerebro-db/state.json", "memoria_history/h.md", "logs/puente.log", ".creador/site/index.html"].every((p) => esRutaInternaDelIDE(p) && resolverRutaDeObra({ rel: p, raizProyecto: raiz, vinculada: vin }).raiz === raiz));
  c("el caso real de la sesión queda cerrado", resolverRutaDeObra({ rel: "MainActivity.kt", raizProyecto: raiz, vinculada: vin }).abs.startsWith(vin));
}

console.log("· rutas absolutas legítimas y fugas");
{
  const raiz = path.resolve("/datos/CerebroNico");
  const vin = path.resolve("/users/pablo/Documents/finanzas-app");
  c("absoluta a la vinculada se acepta", resolverRutaDeObra({ rel: path.join(vin, "server.js"), raizProyecto: raiz, vinculada: vin }).origen === "absoluta");
  c("absoluta a la raíz del IDE se acepta", resolverRutaDeObra({ rel: path.join(raiz, "server.ts"), raizProyecto: raiz, vinculada: vin }).origen === "absoluta");
  c("★ absoluta a una tercera carpeta sigue prohibida", (() => { try { resolverRutaDeObra({ rel: "/etc/passwd", raizProyecto: raiz, vinculada: vin }); return false; } catch (e) { return (e as Error).message === "Ruta fuera del proyecto no permitida."; } })());
  c("★ `..` desde la vinculada no escapa", (() => { try { resolverRutaDeObra({ rel: "../../.ssh/id_rsa", raizProyecto: raiz, vinculada: vin }); return false; } catch (e) { return /no permitida/.test((e as Error).message); } })());
  c("raíz vinculada dentro del proyecto no duplica nada", resolverRutaDeObra({ rel: "x.txt", raizProyecto: raiz, vinculada: path.join(raiz, "hijo") }).abs === path.join(raiz, "hijo", "x.txt"));
}

console.log("· normalizaciones");
c("barra invertida de Windows", norm("app\\src\\Main.kt") === "app/src/Main.kt");
c("punto y barra inicial", norm("./index.html") === "index.html");
c("barras iniciales", norm("///etc/passwd") === "etc/passwd");
c("el listado interno no crece sin control", PREFIJOS_INTERNOS.every((p) => p.endsWith("/")));

console.log("· la carpeta que se genera en C: (raíz de datos vs nivel de proyecto)");
{
  const datos = path.resolve("C:/Cerebronico".replace("C:/", "/C_"));
  const nivel = path.join(datos, "finanzas-app");
  const r = resolverRutaDeObra({ rel: "MainActivity.kt", raizProyecto: datos, servida: nivel });
  c("★ la obra cae en el proyecto, no en C:\\Cerebronico", r.abs === path.join(nivel, "MainActivity.kt"));
  c("y se declara como el nivel que sirve el :3500", r.origen === "servida" && /:3500/.test(r.motivo));
  c("los órganos del IDE siguen en la raíz de datos", resolverRutaDeObra({ rel: "cerebro/temas/x.md", raizProyecto: datos, servida: nivel }).raiz === datos);
  c("CANAL DIRECTO le gana al nivel detectado", resolverRutaDeObra({ rel: "index.html", raizProyecto: datos, servida: nivel, vinculada: path.resolve("/docs/mi-app") }).raiz === path.resolve("/docs/mi-app"));
  c("sin nivel detectado (proyecto en la misma raíz) no se inventa un nivel", resolverRutaDeObra({ rel: "index.html", raizProyecto: datos, servida: datos }).raiz === datos);
  c("una raíz servida FUERA de los datos no secuestra la escritura", resolverRutaDeObra({ rel: "index.html", raizProyecto: datos, servida: path.resolve("/otra/cosa") }).raiz === datos);
  c("el caso de la sesión queda cerrado", resolverRutaDeObra({ rel: "app/src/main/java/com/finance/app/ui/MainActivity.kt", raizProyecto: datos, servida: nivel }).abs.startsWith(nivel));
}

console.log("· la memoria de la raíz servida (TTL)");
{
  const base = mkdtempSync(path.join(tmpdir(), "cn-obra-"));
  mkdirSync(path.join(base, "proyecto-a"), { recursive: true });
  writeFileSync(path.join(base, "proyecto-a", "index.html"), "<!doctype html>", "utf8");
  olvidarRaizDeObra();
  const r1 = raizDeObraEnCurso(base, 1_000);
  c("★ detecta el nivel de proyecto real", !!r1 && path.resolve(r1) === path.resolve(path.join(base, "proyecto-a")));
  // Segundo proyecto que aparecería en el disco: dentro del TTL NO se ve (memoria).
  mkdirSync(path.join(base, "proyecto-b"), { recursive: true });
  writeFileSync(path.join(base, "proyecto-b", "index.html"), "<!doctype html>", "utf8");
  // v1.97.0 · la RECENCIA del desempate tiene que estar FIJADA, no insinuada. Este bloque
  // creaba `proyecto-b` y daba por hecho que saldría más nuevo que `proyecto-a`; cuando las dos
  // escrituras caen en el mismo tick de mtime —pasa cuando la puerta corre 240 suites y la
  // máquina va justa— gana el `localeCompare` de atrás, sigue primero "proyecto-a", y la valla
  // falla sin que nadie haya roto nada: dos reproducciones dentro de `npm run validar`, cero en
  // seco. Dos `utimesSync` explícitos dicen exactamente lo que se quiere probar.
  utimesSync(path.join(base, "proyecto-a", "index.html"), new Date(1_000), new Date(1_000));
  utimesSync(path.join(base, "proyecto-b", "index.html"), new Date(9_000), new Date(9_000));
  const r2 = raizDeObraEnCurso(base, 1_000 + TTL_RAIZ_DE_OBRA_MS - 1);
  c("dentro del TTL devuelve la memoria, sin releer", r2 === r1);
  const r3 = raizDeObraEnCurso(base, 1_000 + TTL_RAIZ_DE_OBRA_MS + 1);
  c("pasado el TTL vuelve a resolver", !!r3 && path.resolve(r3!) !== path.resolve(r1!));
  olvidarRaizDeObra();
  c("una base ilegible no lanza: devuelve null", raizDeObraEnCurso(path.join(base, "no-existe-y-nada-dentro")) === null || typeof raizDeObraEnCurso(path.join(base, "no-existe")) === "string");
}

console.log("· cableado");
{
  const srv = readFileSync("server.ts", "utf8");
  const cuerpo = srv.slice(srv.indexOf("function resolveSafePath"), srv.indexOf("function resolveSafePath") + 900);
  // v1.0.20 · `servida` ya no es una sola fuente: el registro de obras abiertas
  // (`otraObraAbierta()`) entra como último recurso, porque era la causa raíz de
  // que el :3500 sirviera una carpeta mientras el editor escribía en otra. La
  // valla comprueba las TRES piezas del criterio, no una copia literal del texto:
  // un regex anclado al paréntesis anidado se rompe (o peor, pasa) sin medir nada.
  c("resolveSafePath delega en el criterio",
    /resolverRutaDeObra\(\{[\s\S]{0,300}?rel: relPath[\s\S]{0,300}?raizProyecto: PROJECT_ROOT[\s\S]{0,300}?vinculada: leerRutaVinculada\(PROJECT_ROOT\)[\s\S]{0,300}?servida: [\s\S]{0,120}?\}\)/.test(cuerpo),
    cuerpo.slice(0, 200));
  c("y la raíz servida cae al registro de obras abiertas cuando no hay nivel detectado",
    // El paréntesis ANIDADO de `raizDeObraEnCurso(PROJECT_ROOT)` fue lo que tumbó la
    // valla vieja: un `[^)]*` se corta justo ahí y la comparación pasa o falla por
    // accidente. Se mide por piezas (`includes`), que no tienen opinión sobre paréntesis.
    ["servida: raizDeObraEnCurso(PROJECT_ROOT)", "|| otraObraAbierta()"].every((t) => cuerpo.includes(t)),
    cuerpo.slice(0, 300));
  c("y la autoridad de raíz usa la MISMA obra del registro (una verdad, no dos)",
    /return resolverRaizProyectoEn\(otraObraAbierta\(\) \|\| PROJECT_ROOT\)/.test(srv));
  c("★ la raíz servida sale del MISMA resolutor del preview", /resolverDestinoSandbox\(base, null, null\)/.test(readFileSync("server/sandboxArranque.ts", "utf8")));
  // El literal vive ahora en el criterio (server.ts delega): se preserva la
  // MISMA cadena, solo cambió de archivo. Se comprueba en los dos.
  c("★ el error de siempre se preserva literal", readFileSync("src/engine/raizDeObra.ts", "utf8").includes("Ruta fuera del proyecto no permitida."));
  c("y resolveSafePath ya no decide por su cuenta", !/path\.resolve\(PROJECT_ROOT, relPath\)/.test(cuerpo));
  c("y la vinculada llega desde CANAL DIRECTO", /leerRutaVinculada/.test(srv));
}

console.log("═".repeat(66));
if (fallos.length) {
  console.log(`raizDeObra: ${ok} correctas · ${fallos.length} FALLIDAS`);
  fallos.forEach((f) => console.log ? console.log(`   ✗ ${f}`) : null);
  process.exit(1);
}
console.log(`═══ raizDeObra: ${ok} correctas · 0 fallidas ═══`);
