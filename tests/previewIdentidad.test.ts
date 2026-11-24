/**
 * previewIdentidad.test.ts — v1.95.1 · EL :3500 NO PUEDE MOSTRAR DOS COSAS DISTINTAS
 * =================================================================================
 * Reporte de Mario probando la 1.94.1/1.95.0 (30/10, con dos capturas):
 *   «en el sandbox y en el editor web (previsualizador) está lo mismo, pero si toco el
 *    botón Abrir en el navegador abre OTRO proyecto viejo, y de otra versión».
 *   Y más abajo: «de esa manera podía comprobar que la IDE es capaz de crear o soportar
 *   su propio código».
 *
 * Lo segundo legitima la IDE anidada: no hay que bloquearla, hay que poder CORROBORAR
 * qué está servido. Lo primero es un defecto, y tenía cuatro patas medidas:
 *   1 · el pack genera un `sw.js` que se registra en `127.0.0.1:3500`, un origen FIJO
 *       que comparten TODOS los proyectos (src/constants.ts);
 *   2 · ese worker cacheaba bajo la clave literal `"creador-v1"` — idéntica para
 *       cualquier sitio — así que su propia limpieza por versión nunca encontraba nada
 *       que borrar y la caché del proyecto anterior sobrevivía al cambio de proyecto;
 *   3 · no existía un solo `unregister` en todo el repositorio: nadie los daba de baja;
 *   4 · el iframe pedía `urlConAntiCache(..., iframeKey)` y el botón Abrir pedía la
 *       raíz PELADA, que es exactamente la clave `"./"` del precache. La misma
 *       dirección, dos peticiones distintas, dos respuestas distintas.
 *
 * La valla no se conforma con leer fuentes: LEVANTA el servidor estático de la plantilla
 * y le pide `/sw.js` de verdad, porque una plantilla que no arranca deja el preview en
 * blanco sin avisar (ya pasó: el regex que perdió una barra tumbó el sandbox entero).
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};
const seccion = (t: string) => console.log("\n── " + t);

const RAIZ = process.cwd();
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");
const estatico = leer("server/sandboxEstatico.ts");
const lateral = leer("src/components/RightSidebar.tsx");
const daemon = leer("scripts/creador_daemon.py");
const constantes = leer("src/constants.ts");

seccion("§1 · EL ORIGEN DEL PREVIEW ES FIJO (por eso un SW secuestra todo)");
c("el sandbox conserva URL local y añade URL HTTPS relativa para servidor", /http:\/\/127\.0\.0\.1:\$\{PORTS\.SANDBOX\}/.test(constantes) && constantes.includes("./sandbox-preview/"));

seccion("§2 · LA CLAVE DE CACHÉ DEL GENERADOR YA NO ES UNA CONSTANTE");
c("el texto crudo «creador-v1» sigue existiendo como semilla del template", /const version = "creador-v1"/.test(daemon));
c("★ pero al escribir sw.js se reemplaza por una clave POR PROYECTO", /SW_JS\.replace\("creador-v1", _clave_cache_sw\(raiz\)\)/.test(daemon));
c("y esa clave se deriva del sitio (nombre + huella del index)", /def _clave_cache_sw\(raiz\):/.test(daemon));
{
  const cuerpo = /def _clave_cache_sw\(raiz\):[\s\S]*?\n\n\n/.exec(daemon)?.[0] || "";
  // Regla que esta casa ya tenía escrita y que la primera versión de este parche rompió:
  // `entregaFuncional` exige «un ROOT distinto con el MISMO brief produce el MISMO
  // sha256». Derivar la clave del nombre de la carpeta y del mtime la violaba.
  c("★ la clave NO depende de la ruta absoluta del sitio", !/abspath\(raiz\)/.test(cuerpo));
  c("★ ni del reloj del disco (mtime/tamaño): eso era no-determinismo puro", !/st_mtime/.test(cuerpo) && !/st_size/.test(cuerpo));
  c("se deriva del contenido de los archivos esenciales", /sha1|_sha1/.test(cuerpo) && /index\.html/.test(cuerpo));
  c("y ordena las piezas, para que leerlas en otro orden dé la misma firma", /sorted\(/.test(cuerpo));
  c("sitio sin index no revienta: cae a una clave neutra", /creador-sitio-nuevo|creador-v1/.test(cuerpo));
}

seccion("§3 · NADIE PODÍA DESREGISTRAR UN WORKER: AHORA LOS NEUTRALIZA EL SERVIDOR");
c("antes de esta tanda no había un solo unregister en la app", !/getRegistrations|registration\.unregister/.test(lateral + estatico.replace(/CN_SW_KILL[\s\S]*?\]\.join/g, "")));
c("el servidor estático emite un acta de defunción para /sw.js", /CN_SW_KILL/.test(estatico));
c("el acta vacía las cachés del origen", /caches\.delete\(k\)/.test(estatico));
c("se desregistra a sí misma", /registration\.unregister\(\)/.test(estatico));
c("y reclama/ recarga a los clientes controlados", /clients\.matchAll\([\s\S]*?navigate\(/.test(estatico));

seccion("§4 · LA INTERCEPTACIÓN OCURRE ANTES DE TOCAR DISCO");
const iKill = estatico.indexOf('urlPath === "/sw.js"');
const iLeec = estatico.indexOf("fs.readFile(target");
c("existe la rama de /sw.js", iKill > 0);
c("★ va ANTES de la lectura del archivo (si no, gana el sw.js viejo del disco)", iKill > 0 && iLeec > 0 && iKill < iLeec, `kill@${iKill} readFile@${iLeec}`);
c("responde no-store, para que el navegador compare bytes y actualice el worker", /X-CN-Sw/.test(estatico) && /"Cache-Control": "no-store"/.test(estatico));

seccion("§5 · LA PLANTILLA ARRANCA DE VERDAD Y SIRVE EL ACTA (prueba en vivo)");
{
  // @ts-ignore - require dentro de un test .ts que corre con tsx
  const spawnSync = (await import("node:child_process")).spawnSync;
  const { STATIC_SERVER_SOURCE } = await import("../server/sandboxEstatico");
  const caja = mkdtempSync(join(tmpdir(), "cn-preview-"));
  const sitio = join(caja, "sitio");
  mkdirSync(sitio, { recursive: true });
  writeFileSync(join(sitio, "index.html"), "<html><body>SITIO VIVO</body></html>");
  writeFileSync(join(sitio, "sw.js"), 'caches.open("creador-v1"); /* el worker viejo */');
  const cjs = join(caja, "servidor.cjs");
  writeFileSync(cjs, STATIC_SERVER_SOURCE);
  const puerto = 3700 + (process.pid % 200);

  const sintaxis = spawnSync(process.execPath, ["--check", cjs], { encoding: "utf8" });
  c("★ la plantilla compila como .cjs (un backtick mal escapado tumba el preview)", sintaxis.status === 0, (sintaxis.stderr || "").slice(0, 160));

  const hijo = (await import("node:child_process")).spawn(process.execPath, [cjs, sitio, String(puerto), sitio], { stdio: "ignore" } as any);
  try {
    let vivo = false;
    for (let i = 0; i < 40 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try { const r = await fetch(`http://127.0.0.1:${puerto}/__cn_info`); if (r.ok) vivo = true; } catch {}
    }
    c("el servidor de la plantilla levanta y responde", vivo);
    if (vivo) {
      const sw = await fetch(`http://127.0.0.1:${puerto}/sw.js`);
      const cuerpoSw = await sw.text();
      c("★ /sw.js NO devuelve el archivo viejo del disco", !cuerpoSw.includes('caches.open("creador-v1")'));
      c("devuelve el acta de defunción", cuerpoSw.includes("no usa service workers"));
      c("con no-store, para que el navegador la instale", sw.headers.get("cache-control") === "no-store");
      const idx = await fetch(`http://127.0.0.1:${puerto}/`);
      c("y el proyecto sigue sirviéndose normal (no se rompió el preview)", (await idx.text()).includes("SITIO VIVO"));
      const chk = spawnSync(process.execPath, ["-e", `require('node:vm').createScript(require('node:fs').readFileSync(0,'utf8'))`], { input: cuerpoSw, encoding: "utf8" });
      c("el acta es JavaScript válido", chk.status === 0, (chk.stderr || "").slice(0, 160));
    }
  } finally {
    try { hijo.kill("SIGKILL"); } catch {}
    // v2.0.1 · En Windows kill() retorna ANTES de que el hijo muera: si salimos
    // enseguida, libuv aborta en async.c:94 (handle en UV_HANDLE_CLOSING).
    // Esperamos el evento exit con techo de 2 s para no colgar la suite.
    await new Promise((r) => {
      if (hijo.exitCode !== null || hijo.signalCode !== null) return r();
      const t = setTimeout(r, 2000);
      hijo.once("exit", () => { clearTimeout(t); r(); });
    });
  }
}

seccion("§6 · ABRIR EN EL NAVEGADOR = LO MISMO QUE EL PREVIEW");
c("★ el botón Abrir ya no abre la raíz pelada", !/window\.open\(SANDBOX_URL, "_blank"\)/.test(lateral));
c("usa el mismo anti-caché que el iframe", /window\.open\(urlConAntiCache\(SANDBOX_URL, Date\.now\(\)\), "_blank"\)/.test(lateral));
c("el iframe conserva su key (no se degradó el camino bueno)", /urlConAntiCache\(iframeSrc \|\| SANDBOX_URL, iframeKey\)/.test(lateral));

seccion("§7 · LA IDENTIDAD SE VE: «está lo mismo» tiene que poder corroborarse");
c("el panel lee la raíz RESUELTA del status", /d\.raizProyectoResuelta/.test(lateral));
c("y la raíz del workspace para comparar", /d\.raizSandbox/.test(lateral));
c("guarda estado de identidad", /const \[raizServida, setRaizServida\]/.test(lateral));
c("el encabezado muestra QUÉ proyecto está servido", /raizServida\.split\(\/\[[\\\\/\\]\]\/\)/.test(lateral) || /raizServida\.split\(/.test(lateral));
c("y avisa cuando es la raíz del workspace (el caso «la IDE dentro de la IDE»)", /sirveRaizWorkspace/.test(lateral) && /raíz del workspace/.test(lateral));

console.log(`\n═══ previewIdentidad: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
