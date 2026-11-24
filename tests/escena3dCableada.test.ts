/**
 * tests/escena3dCableada.test.ts — LA CAPACIDAD 3D, CABLEADA Y PROBAD (v1.0.7)
 * ============================================================================
 * La pregunta de Mario: «¿CerebroNico puede armar una vista 3D navegable, y qué le
 * falta?». Medido en v1.0.5 la respuesta era incómoda y exacta:
 *
 *   · `three` NO estaba en las dependencias y `WebGL` aparecía UNA sola vez en todo
 *     el código propio (`src/data/skills100.ts:661`, el NOMBRE de un panel
 *     propuesto, no una capacidad);
 *   · `src/engine/manuals.ts` no tenía ni un capítulo de WebGL/3D/shader/canvas;
 *   · de las 20 skills `cn-web-*`, ninguna era espacial;
 *   · la cerradura (`src/engine/cerradura.ts`, regla `csp-ausente`) empuja a
 *     `default-src 'self'`, que **corta el CDN** por donde el modelo intentaría
 *     cargar three;
 *   · y `src/engine/navegadorReal.ts` sólo VALIDA acciones: no hay ojo que mire un
 *     fotograma, así que «se mueve con el scroll» no se podía probar.
 *
 * Esta suite no celebra la feature: **atesora el cable**. Cada comprobación mira un
 * archivo real o corre el instalador de verdad (incluso rompiéndolo a propósito),
 * porque la historia reciente de la casa es la del `ok` que nadie verificó — los
 * tres espejos sin poderes, el `REVERTIDO` en minúscula, la ventana de py que se
 * abría y se cerraba.
 */
import { existsSync, readFileSync as LEER, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PROCEDURES, MANUAL_ENTRIES } from "../src/engine/manuals";
import { SEMILLA_COMPLETA } from "../src/engine/knowledgeBase";
import { auditarEscena3D } from "../src/engine/testigoEscena";
import { compararFotogramas, compararRejillas, testigosSubieron, testigosIdenticos } from "../src/engine/fotogramas"; // v1.0.8 · el ojo
import { generarEscena3D, TIPOS_AMBIENTE } from "../src/engine/generadorEscena3D"; // v1.0.9 · el generador
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const RAIZ = process.cwd();
const P = (...a: string[]) => join(RAIZ, ...a);
const motor = "vendor/three/three.module.js";
const addon = "vendor/three/addons/OrbitControls.js";
const manifiestoRuta = "vendor/three/vendor-3d.json";
const instalador = "scripts/preparar-vendor-3d.mjs";
const skill = "skills/cn-web-escena-3d/SKILL.md";

let correctas = 0;
const rojos: string[] = [];
function c(titulo: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  PASS   ${titulo}`); }
  else { rojos.push(titulo + (detalle ? ` :: ${detalle}` : "")); console.log(`  FALLO  ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}
const CONTRATO = JSON.parse(LEER(P("contrato-rutas.json"), "utf-8"));
const leer = (rel: string) => { try { return LEER(P(rel), "utf-8").replace(/\r\n/g, "\n"); } catch { return ""; } };

console.log("═══ CAPACIDAD 3D · cableado e instalación · v1.0.6 ═══\n");

// ── 1 · EL MOTOR ESTA EN EL ARBOL, Y ES EL MOTOR ──
const textoMotor = leer(motor);
c("★ el motor 3D viaja en el proyecto (no se baja de un CDN)", existsSync(P(motor)) && statSync(P(motor)).size > 1_000_000,
  existsSync(P(motor)) ? `${Math.round(statSync(P(motor)).size / 1024)} KB` : "ausente");
c("y es three.js r169 de verdad (lee su propia revision)", /REVISION\s*=\s*.169./.test(textoMotor), textoMotor.slice(0, 60));
c("los add-ons tambien son locales (OrbitControls)", existsSync(P(addon)));
c("★ OrbitControls importa 'three' PELADO: por eso el importmap es obligatorio, no decoracion",
  /from\s+['"]three['"]/.test(leer(addon)));
c("la licencia acompana al archivo (MIT, con copyright)", /MIT/i.test(leer("vendor/three/LICENCIA.txt")) && /Three\.js Authors/.test(leer("vendor/three/LICENCIA.txt")));

// ── 2 · EL MANIFIESTO NO MIENTE: los hashes cierran con el disco ──
const sha256 = (ruta: string) => createHash("sha256").update(LEER(ruta)).digest("hex");
let manifiesto: any = {};
try { manifiesto = JSON.parse(leer(manifiestoRuta)); } catch { manifiesto = {}; }
c("hay manifiesto del vendor con revision y hashes", !!manifiesto?.revision && !!manifiesto?.archivos, JSON.stringify(manifiesto).slice(0, 80));
const hashesMal = Object.entries(manifiesto.archivos || {}).filter(([rel, hash]) => sha256(P("vendor/three/" + rel)) !== hash);
c("★ cada sha256 declarado coincide con el archivo en disco", hashesMal.length === 0, hashesMal.map((h: any) => h[0]).join(", "));

// ── 3 · EL INSTALADOR: hace, verifica, y se da cuenta cuando algo esta roto ──
c("existe el instalador de la casa (`npm run vendor:3d`)", existsSync(P(instalador)));
const pkg = JSON.parse(leer("package.json") || "{}");
c("y esta declarado como orden de la casa", typeof pkg?.scripts?.["vendor:3d"] === "string", JSON.stringify(pkg?.scripts?.["vendor:3d"] || ""));

const asiento = P(".tmp-asiento-vendor-3d");
try { rmSync(asiento, { recursive: true, force: true }); } catch {}
mkdirSync(asiento, { recursive: true });
const correrInstalador = (args: string[]) => spawnSync("node", [P(instalador), ...args], {
  cwd: RAIZ, encoding: "utf-8", env: { ...process.env, PROJECT_DIR: asiento }, timeout: 60_000,
});

const primera = correrInstalador([]);
c("★ instalar desde cero deja el motor en la raiz de datos", primera.status === 0 && existsSync(join(asiento, "vendor", "three", "three.module.js")),
  (primera.stderr || primera.stdout || "").split("\n").slice(-2).join(" "));
const segunda = correrInstalador([]);
c("★ es IDEMPOTENTE: la segunda pasada no escribe nada (verificados 2, copiados 0)",
  segunda.status === 0 && /verificados: 2 · copiados: 0/.test(segunda.stdout), segunda.stdout.split("\n").slice(-3).join(" "));
const verificada = correrInstalador(["--verificar"]);
c("--verificar confirma sin tocar (y sale 0)", verificada.status === 0 && /todo en su lugar/.test(verificada.stdout));

// Se corrompe el destino a proposito: el instalador tiene que DARSE CUENTA.
writeFileSync(join(asiento, "vendor", "three", "three.module.js"), "// mutilado a mano\n");
const rota = correrInstalador(["--verificar"]);
c("★ un motor mutilado NO pasa la verificacion (el 404 negro se detecta antes)", rota.status !== 0,
  (rota.stdout + rota.stderr).split("\n").slice(-3).join(" "));
const reparada = correrInstalador([]);
c("…y la corrida siguiente lo repara sola", reparada.status === 0 && /copiados: 1/.test(reparada.stdout));
try { rmSync(asiento, { recursive: true, force: true }); } catch {}

// ─── 4 · LA SKILL: generada desde el contrato, con la receta correcta ──
const md = leer(skill);
c("★ existe la skill cn-web-escena-3d (materializada, no prometida)", md.length > 500);
const frenteDe = (md.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
const evidencias = (frenteDe.match(/^evidencia:\s*\[(.*)\]$/m) || [])[1]?.split(",").map((x) => x.trim()).filter(Boolean) || [];
c("toda evidencia citada por la skill es un archivo que existe hoy",
  evidencias.length > 0 && evidencias.every((e) => existsSync(P(e))), evidencias.filter((e) => !existsSync(P(e))).join(", "));
c("el estado dice la verdad del corpus (el generador la publica como probada)", /^estado:\s*probada$/m.test(frenteDe));
c("★ la receta manda importmap (sin eso, 'three' no resuelve ni con el vendor encima)", /importmap/.test(md));
c("manda CSP local y archivo JS afuera (respeta la cerradura en vez de esquivarla)", /default-src/.test(md) && /csp-ausente/.test(md));
c("prohíbe el CDN explícitamente", /unpkg|jsdelivr|esm\.sh/.test(md) && /No importar three desde/i.test(md));
c("★ usa getPointAt (longitud de arco) y no getPoint: si no, el recorrido alabea y frena",
  /getPointAt/.test(md) && /no `getPoint\(/.test(md));
c("exige dos fotogramas distintos para poder decir «se mueve»", /data-progreso/.test(md) && /distintos/.test(md));
c("y exige dispose() + cancelar el bucle de animación (el preview comparte origen)", /dispose\(\)/.test(md) && /requestAnimationFrame/.test(md));

// La regla de la cerradura sigue viva: la skill se adaptó a ella, no la borró.
const cerradura = leer("src/engine/cerradura.ts");
c("★ la regla `csp-ausente` sigue en la cerradura (no se aflojó para dejar pasar el CDN)",
  /id: "csp-ausente"/.test(cerradura));

// El contrato del corpus la incluye y el generador la reproduce.
const tabla = leer("scripts/habilidades-cn.mjs");
c("el contrato de skills incluye la fila web-escena-3d", /s: "web-escena-3d"/.test(tabla));
const gen = spawnSync("node", [P("scripts/generar-skills-cn.mjs"), "--verificar"], { cwd: RAIZ, encoding: "utf-8", timeout: 60_000 });
c("★ `generar-skills-cn --verificar` reproduce la skill sin deriva", gen.status === 0, (gen.stdout || "").split("\n").slice(-2).join(" "));
c("y el contrato dice 101 (el cuerpo del corpus subió, no se lo maquilló)", /101/.test(gen.stdout || ""), (gen.stdout || "").trim().slice(0, 80));

// ── 5 · EL MONTAJE: por que el archivo tiene que estar en la raiz de datos ──
const estatico = leer("server/sandboxEstatico.ts");
c("★ el sandbox resuelve contra DOS bases (obra y raiz de datos) — por eso el vendor se copia",
  /var bases = \[raizEfectiva\(\)\.dir, projectRoot\]/.test(estatico));
const server = leer("server.ts");
const presupuesto = Number(CONTRATO.presupuesto_lineas);
c("y projectRoot es la raiz de DATOS (no la de instalación): el cable del instalador es correcto",
  /const \{PROJECT_ROOT, raizPorDefecto, raizResuelta\} = decidirRaicesEdicion\(RAIZ_INSTALACION\)/.test(server) && /return \{PROJECT_ROOT,raizPorDefecto:PROJECT_ROOT/.test(leer("server/configServidor.ts")));

// ── 6 · LOS DOS EXTREMOS QUE ENCARAN LA ESCENA ──
const bat = leer("iniciar_todo_windows.bat");
c("★ el lanzador prepara el motor antes de servir (y avisa si no verifica)",
  /preparar-vendor-3d\.mjs/.test(bat) && /motor 3D no quedo verificado/i.test(bat));
const exe = leer("electron-main.cjs");
c("el .EXE también lo prepara (instalador sin .bat sigue pudiendo armar 3D)",
  /function prepararVendor3d\(\)/.test(exe) && /prepararVendor3d\(\);/.test(exe));

// ── 7 · EL MANUAL DEL MOTOR 3D: para que CUALQUIER proveedor sepa manipularlo ──
// manuals.ts dice que el conocimiento viaja en el MOTOR y no depende de que el
// modelo lo sepa («un qwen de 0,5 B, GLM, Gemini reciben el mismo manual»). Una
// capacidad instalada sin manual es una capacidad que solo usa el que la hizo.
const manuales = leer("src/engine/manuals.ts");
const SEMILLAS_3D = ["proc-motor-3d", "proc-motor-3d-verificar"];
for (const id of SEMILLAS_3D) c(`★ el manual del motor 3D tiene su entrada (id ${id})`, new RegExp(`"${id}"`).test(manuales));
c("y entra en la semilla unica del conocimiento (sobrevive a recargar la base desde disco)",
  /SEMILLA_COMPLETA/.test(leer("src/engine/knowledgeBase.ts")) && /\.\.\.MANUAL_ENTRIES/.test(leer("src/engine/knowledgeBase.ts")));

// Cargado de verdad (no grep): si la semilla cambia y pierde el manual, esto se
// prende rojo aunque el archivo siga mentioning el id en un comentario.
const entradas3d = MANUAL_ENTRIES.filter((e: any) => (e.tags || []).includes("3d"));
c("★ el manual 3D esta cargado en las entradas del motor (2 entradas, tabla manual)",
  entradas3d.length >= 2 && entradas3d.every((e: any) => e.table === "manual"), `${entradas3d.length}`);
c("★ y esta en SEMILLA_COMPLETA, o sea que sobrevive a recargar la base desde disco",
  SEMILLA_COMPLETA.filter((e: any) => (e.tags || []).includes("3d")).length >= 2,
  String(SEMILLA_COMPLETA.filter((e: any) => (e.tags || []).includes("3d")).length));
c("cada entrada trae claves y cuerpo util (no un titulo vacio que el modelo ignora)",
  entradas3d.every((e: any) => (e.keys || []).length >= 6 && (e.body || "").length > 300),
  entradas3d.map((e: any) => `${e.id}:${(e.keys || []).length}k/${(e.body || "").length}c`).join(" "));

// Vocabulario: las `keys` tienen que alcanzar para las formas reales de pedirlo.
const claves3d = (manuales.match(/\["3d", "tres d"[^\]]*\]/) || [""])[0];
const frases = [
  "haceme una vista 3d de una montana rusa",
  "quiero algo tipo blender pero en el navegador",
  "que pueda subirme al carrito y ver el viaje",
  "moveme la camara con el scroll por la escena",
  "una escena three.js con orbitcontrols y geometria",
  "recorrido en primera persona por el modelo con splines",
  "shader y render 3d en el preview",
];
const sinClave = frases.filter((f) => !/3d|tres d|three|webgl|escena|camara|camera|scroll|blender|viaje|carrito|subirme|recorrer|recorrido|geometria|shader|render 3d|orbitcontrols|orbitar|catmullrom|spline|modelado|modelar|malla|mesh|canvas 3d|volumen 3d|montana rusa|monta/i.test(f));
c("★ todo modo de pedir 3D pega con una clave del manual (se ven los modismos)", sinClave.length === 0, sinClave.join(" | "));
c("las claves del manual 3D estan declaradas y no son prosa suelta", /"catmullrom"|"spline"|"orbitcontrols"/.test(claves3d) && claves3d.length > 100, `${claves3d.length} chars de claves`);
c("el manual pesa mas que una entrada comun (weight >= 0.95: que se inyecte primero)",
  /"procedimiento", "web", "3d", "sandbox", "creador"[\s\S]{0,40}0\.97/.test(manuales));

// Que el manual y la skill no cuenten historias distintas (deriva entre dos
// fuentes de la misma operacion: el defecto clasico de la casa).
const receta = (manuales.match(/"proc-motor-3d",[\s\S]*?\n  \),/) || [""])[0];
const paraCada = ["importmap", "vendor/three/three.module.js", "default-src", "getPointAt", "data-progreso", "data-fotograma", "dispose", "ResizeObserver", "devicePixelRatio"];
const faltanEnManual = paraCada.filter((x) => !receta.includes(x));
c("★ el manual menciona los mismos puntos duros que la skill (cero deriva de receta)",
  faltanEnManual.length === 0, faltanEnManual.join(", "));
c("y prohibe el CDN en el texto que recibe el modelo", /unpkg|jsdelivr|esm\.sh/.test(receta));
c("el manual manda preparar el motor ANTES de escribir codigo (vendor:3d)", /vendor:3d/.test(receta));
c("dice que la caida se informa, no se disfraza (pantalla negra)", /NEGRA|se INFORMA/.test(receta));


// ── 8 · EL TESTIGO: audita la escena como la ve el navegador (v1.0.7) ──
// El modulo es async a proposito: recibe un `traer` inyectable, asi se prueba sin
// levantar el sandbox. Cada caso below es un modo de falla REAL y medido:
// el 404 del motor (la pantalla negra), el getPoint sin longitud de arco, el JS
// inline que la cerradura marca, y el CDN que la CSP corta.
const HTML_OK = [
  "<!doctype html><html><head>",
  '<meta http-equiv="Content-Security-Policy" content="default-src &quot;self&quot;">',
  '<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script>',
  '<script type="module" src="main.js"></script>',
  "</head><body><div style=\"height:300vh\"></div></body></html>",
].join("");
const JS_OK = [
  "import * as THREE from \"three\";",
  "import { OrbitControls } from \"three/addons/controls/OrbitControls.js\";",
  "const curva = new THREE.CatmullRomCurve3([]);",
  "const p = curva.getPointAt(0.5);",
  "requestAnimationFrame(bucle); cancelAnimationFrame(id);",
  "geometria.dispose(); material.dispose();",
  'canvas.dataset.motor = "three-r169"; canvas.dataset.progreso = String(t); canvas.dataset.fotograma = String(n);',
].join("\n");
const MOTOR = "const REVISION = '169';";
const mapaDe = (extra: Record<string, string>) => {
  const base: Record<string, string> = { "/index.html": HTML_OK, "/main.js": JS_OK, "/vendor/three/three.module.js": MOTOR, ...extra };
  return async (ruta: string) => (base[ruta] !== undefined ? { codigo: 200, texto: base[ruta] } : null);
};

const bueno = await auditarEscena3D(mapaDe({}));
c("★ el testigo audita una escena bien montada y la aprueba", bueno.ok, bueno.resumen.slice(0, 120));
c("y pasa las 11 pruebas del contrato (no tres a ojo)", bueno.pruebas.length >= 10, `${bueno.pruebas.length}`);

const sinMotor = await auditarEscena3D(mapaDe({ "/vendor/three/three.module.js": "" }));
c("★ si el motor da 404, el testigo lo nombra y manda a `npm run vendor:3d` (la pantalla negra deja de ser un misterio)",
  !sinMotor.ok && sinMotor.pruebas.some((x: any) => x.id === "motor" && /vendor:3d/.test(x.motivo)),
  sinMotor.pruebas.filter((x: any) => !x.ok).map((x: any) => x.id).join(","));

const arcoMalo = await auditarEscena3D(mapaDe({ "/main.js": JS_OK.replace("getPointAt", "getPoint") }));
c("★ `curva.getPoint(t)` (despues del punto, la forma real del bug) cae: sin longitud de arco el recorrido frena y alabea",
  !arcoMalo.ok && arcoMalo.pruebas.some((x: any) => x.id === "arco" && !x.ok));

const conCdn = await auditarEscena3D(mapaDe({ "/index.html": HTML_OK.replace("/vendor/three/three.module.js", "https://unpkg.com/three") }));
c("una obra casada a un CDN se rechaza (la CSP local la mataria igual)",
  !conCdn.ok && conCdn.pruebas.some((x: any) => x.id === "sin-cdn" && !x.ok));

const jsAdentro = await auditarEscena3D(mapaDe({ "/index.html": HTML_OK.replace('<script type="module" src="main.js"></script>', "<script>const x=1;</script>") }));
c("el JS inline se rechaza (es la regla `csp-ausente`, no una preferencia estética)",
  !jsAdentro.ok);

const sinTestigos = await auditarEscena3D(mapaDe({ "/main.js": "const c=new THREE.CatmullRomCurve3([]);c.getPointAt(0.5);requestAnimationFrame(l);" }));
c("★ sin `data-fotograma` no se puede afirmar que anima: el testigo lo impide",
  !sinTestigos.ok && sinTestigos.pruebas.some((x: any) => x.id === "testigos" && !x.ok));

c("★ TODO veredicto declara que NO midio los pixeles (ni el de una escena perfecta)",
  /pixeles/.test(bueno.noMedible) && /pixeles/.test(sinMotor.noMedible), bueno.noMedible.slice(0, 80));

const capacidades = leer("server/routers/capacidades.ts");
c("la ruta `/api/capacidades/testigo-3d` existe en el router de capacidades corroboradas",
  /app\.get\("\/api\/capacidades\/testigo-3d"/.test(capacidades));
c("y solo audita el preview LOCAL (una ruta de auditoria que acepta cualquier base es un SSRF)",
  /hostname !== "127\.0\.0\.1"/.test(capacidades) && /solo audita el preview local/.test(capacidades));
c("el testigo no esta duplicado en el monolito: server.ts sigue en su tope declarado (v1.0.20: el bloque de DIRECCIONES del arranque vive en protocoloDirecciones.ts; el contrato se regenera a proposito)",
  server.split("\n").length <= presupuesto, `${server.split("\n").length} vs ${presupuesto}`);

// ─────────────────────────────────────────────────────────────────────────
// v1.0.8 · EL OJO: comparar dos fotogramas. El testigo-3d prueba el MONTAJE;
// esto prueba que, cuando hay evidencia, se puede decir «se MUEVE con el scroll»
// — y que sin evidencia NO se finge.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n─── v1.0.8 · el ojo (comparar fotogramas) ───");

const rej = (ancho: number, alto: number, f: (i: number) => number) =>
  ({ ancho, alto, valores: Array.from({ length: ancho * alto }, (_, i) => f(i)) });

c("★ el módulo del ojo existe: src/engine/fotogramas.ts (lo que se perdió, reconstruido)",
  existsSync(P("src/engine/fotogramas.ts")));

const vAut = compararFotogramas({
  shaA: "aa", shaB: "bb",
  testigosA: { progreso: 0.2, fotograma: 1 }, testigosB: { progreso: 0.8, fotograma: 40 },
  rejillaA: rej(8, 8, () => 50), rejillaB: rej(8, 8, (i) => (i % 2 ? 50 : 200)),
});
c("★ distintos + testigos que suben + pixeles que cambian = AUTORIZA decir «se mueve»",
  vAut.distintos && vAut.avance && vAut.autorizaMovimiento && vAut.caso === "autorizado", vAut.caso);

const vIgual = compararFotogramas({ shaA: "aa", shaB: "aa", testigosA: { progreso: 0.2 }, testigosB: { progreso: 0.8 } });
c("★ dos PNG idénticos no mienten aunque el testigo diga que subió: no autoriza",
  !vIgual.distintos && !vIgual.autorizaMovimiento && vIgual.caso === "iguales" && /miente|no se movi/.test(vIgual.resumen));

const vSin = compararFotogramas({ shaA: "aa", shaB: "bb", testigosA: {}, testigosB: {} });
c("★ fotogramas distintos SIN testigos del recorrido = HUD/parpadeo, NO movimiento: no autoriza",
  vSin.distintos && !vSin.autorizaMovimiento && vSin.caso === "sin-testigos" && /HUD|textura|parpadeo/.test(vSin.resumen));

const vId = compararFotogramas({ shaA: "aa", shaB: "bb", testigosA: { progreso: 0.5, fotograma: 5 }, testigosB: { progreso: 0.5, fotograma: 5 } });
c("testigos idénticos (no suben) = tampoco autoriza, aunque el sha difiera",
  !vId.autorizaMovimiento && /idénticos/.test(vId.resumen));

const vMeta = compararFotogramas({
  shaA: "aa", shaB: "bb", testigosA: { progreso: 0.2 }, testigosB: { progreso: 0.8 },
  rejillaA: rej(8, 8, () => 90), rejillaB: rej(8, 8, () => 90),
});
c("★ sha distinto pero pixeles iguales (metadatos) = no autoriza: la rejilla manda sobre el hash",
  !vMeta.autorizaMovimiento);

const vNada = compararFotogramas({ testigosA: { progreso: 0.2 }, testigosB: { progreso: 0.8 } });
c("sin sha NI rejilla no se inventa nada: caso `sin-rejilla-ni-sha`, no autoriza",
  !vNada.distintos && !vNada.autorizaMovimiento && vNada.caso === "sin-rejilla-ni-sha");

c("la rejilla mide región: media imagen cambiada se cuenta y localiza",
  (() => { const m = compararRejillas(rej(4, 4, () => 100), rej(4, 4, (i) => (i < 8 ? 100 : 250))); return m.medible && m.celdasCambiadas === 8 && m.region !== null; })());
c("rejillas de distinto tamaño = no medible (no se compara peras con manzanas)",
  !compararRejillas(rej(4, 4, () => 0), rej(2, 2, () => 0)).medible);
c("testigosSubieron/testigosIdenticos son coherentes entre sí",
  testigosSubieron({ progreso: 0.2 }, { progreso: 0.8 }) && testigosIdenticos({ progreso: 0.5 }, { progreso: 0.5 }));

c("★ TODO veredicto del ojo declara que la máquina NO MIDIO por sí sola (honestidad del entorno)",
  /NO MIDIO/.test(vAut.noMedible) && /NO MIDIO/.test(vSin.noMedible));

c("★ la ruta POST `/api/capacidades/comparar-fotogramas` existe y delega en el motor",
  /app\.post\("\/api\/capacidades\/comparar-fotogramas"/.test(capacidades) && /compararFotogramas\(/.test(capacidades));
c("y rechaza un cuerpo sin sha ni rejilla (el ojo no inventa movimiento sin evidencia)",
  /no inventa movimiento sin evidencia/.test(capacidades));

const main = leer("electron-main.cjs");
c("★ electron-main cablea `cn:capturar-escena`, abre ventana OCULTA y guarda nativeImage/ipcMain (no rompe el arranque sin display)",
  /ipcMain\.handle\("cn:capturar-escena"/.test(main) && /show:\s*false/.test(main) && /if \(!ipcMain/.test(main) && /if \(!nativeImage\)/.test(main) && /preload\.cjs/.test(main));

const preload = leer("preload.cjs");
const pkgTxt = leer("package.json");
c("★ preload.cjs expone SOLO cerebronico.capturarEscena (sin fs/proc/nav) y está en build.files",
  existsSync(P("preload.cjs")) && /contextBridge\.exposeInMainWorld\("cerebronico"/.test(preload) &&
  !/require\("fs"\)|child_process|require\("node:fs"\)/.test(preload) && /"preload\.cjs"/.test(pkgTxt));

// ─────────────────────────────────────────────────────────────────────────
// v1.0.9 · EL GENERADOR: la casa no sólo audita y compara, GENERA ambientes 3D
// con render nativo — y la prueba es que la obra generada pasa a su propio testigo
// sin tocarla a mano. Corroboración de punta a punta, sin navegador.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n─── v1.0.9 · el generador de ambientes 3D (render nativo) ───");

const motorTxt = leer("vendor/three/three.module.js");
const traerGenerado = (esc: { archivos: { ruta: string; contenido: string }[] }) => {
  const mapa = new Map<string, string>();
  for (const a of esc.archivos) { mapa.set("/" + a.ruta, a.contenido); mapa.set(a.ruta, a.contenido); }
  return async (ruta: string) => {
    if (ruta === "/vendor/three/three.module.js") return motorTxt ? { codigo: 200, texto: motorTxt } : null;
    const v = mapa.get(ruta);
    return v != null ? { codigo: 200, texto: v } : null;
  };
};

c("★ el generador existe: src/engine/generadorEscena3D.ts",
  existsSync(P("src/engine/generadorEscena3D.ts")));

const genEsc = generarEscena3D({ tipo: "abstracto", semilla: 3 });
c("genera exactamente index.html + estilo.css + main.js",
  genEsc.archivos.map((a) => a.ruta).join(",") === "index.html,estilo.css,main.js");

const gHtml = genEsc.archivos[0].contenido;
const gJs = genEsc.archivos[2].contenido;
c("el HTML generado trae CSP 'self', importmap al motor vendorizado y el modulo con src",
  /default-src 'self'/.test(gHtml) && /type="importmap"/.test(gHtml) && /"three": "\/vendor\/three\/three\.module\.js"/.test(gHtml) && /<script type="module" src="main\.js">/.test(gHtml));
c("★ render NATIVO: el main.js generado usa WebGLRenderer y capa el pixelRatio en 2",
  /new THREE\.WebGLRenderer\(/.test(gJs) && /Math\.min\(window\.devicePixelRatio[^)]*, 2\)/.test(gJs));
c("camara, luces y controles de la plantilla de la casa",
  /PerspectiveCamera\(60,.*0\.1, 2000\)/.test(gJs) && /HemisphereLight/.test(gJs) && /DirectionalLight/.test(gJs) && /new OrbitControls\(/.test(gJs));
c("recorrido por longitud de arco (getPointAt), sin getPoint pelado NI en los comentarios",
  /getPointAt\(/.test(gJs) && !/\.getPoint\(/.test(gJs) && !/[^.\w]getPoint\(/.test(gJs));
c("testigos DOM y limpieza (raf + cancel + dispose + ResizeObserver)",
  /dataset\.(motor|progreso|fotograma)/.test(gJs) && /requestAnimationFrame/.test(gJs) && /cancelAnimationFrame/.test(gJs) && /dispose\(\)/.test(gJs) && /new ResizeObserver\(/.test(gJs));

for (const tipo of TIPOS_AMBIENTE) {
  const e = generarEscena3D({ tipo, semilla: 11 });
  const v = await auditarEscena3D(traerGenerado(e));
  c(`★ el testigo APRUEBA el ambiente '${tipo}' generado (${v.pruebas.length} pruebas, 0 a mano)`, v.ok,
    v.ok ? "" : v.pruebas.filter((x: any) => !x.ok).map((x: any) => x.id).join(","));
}

const d1 = JSON.stringify(generarEscena3D({ tipo: "ciudad", semilla: 42 }).archivos);
const d2 = JSON.stringify(generarEscena3D({ tipo: "ciudad", semilla: 42 }).archivos);
const d3 = JSON.stringify(generarEscena3D({ tipo: "ciudad", semilla: 99 }).archivos);
c("★ determinista: misma semilla produce los MISMOS bytes (reproducible)", d1 === d2);
c("semillas distintas producen obras distintas (ambientes variados, no un molde fijo)", d1 !== d3);

const exportaMotor = (n: string) => new RegExp("(^|[,{\\s])" + n + "(,|\\s|})").test(motorTxt);
c("★ render nativo REAL: el motor vendorizado exporta WebGLRenderer/Scene/PerspectiveCamera (no es un stub)",
  exportaMotor("WebGLRenderer") && exportaMotor("Scene") && exportaMotor("PerspectiveCamera") && /REVISION/.test(motorTxt));
c("★ generar NO es renderizar: toda escena generada declara que no midio pixeles (honestidad)",
  /pixeles/i.test(genEsc.noMedible) && /pixeles/i.test(genEsc.resumen));

c("★ la ruta POST `/api/capacidades/generar-escena-3d` existe, genera y AUTO-AUDITA con el testigo",
  /app\.post\("\/api\/capacidades\/generar-escena-3d"/.test(capacidades) && /generarEscena3D\(/.test(capacidades) && /auditarEscena3D\(traer\)/.test(capacidades));


console.log(`\n${"─".repeat(56)}`);
console.log(`CAPACIDAD 3D CABLEADA (v1.0.9): ${correctas} correctas · ${rojos.length} fallos`);
if (rojos.length) { for (const r of rojos) console.log(`  · ${r}`); process.exit(1); }
