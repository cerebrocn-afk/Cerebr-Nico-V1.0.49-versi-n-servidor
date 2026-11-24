/**
 * tests/raizInstalacion.test.ts — DONDE NACE LA CASA Y QUE DEJA ESCRITO EL HIJO
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/raizInstalacion.test.ts
 *
 * 🐞 EL SINTOMA QUE TRAJO ESTE ARCHIVO (log de Mario, 15/11, v1.0.22)
 * --------------------------------------------------------------------
 *   [supervisor] «memoria» (:5100) no contesta → reanimo, intento 1 de 3
 *   [supervisor] «creador» (:5102) no contesta → reanimo, intento 1 de 3
 *   … 26 líneas iguales, en bucle, y CERO uncaughtException / unhandledRejection
 *
 * El :3000 no se caía: se caían los hijos reanimados. Dos causas, las dos de
 * diseño y las dos con el mismo nombre — «confiar en lo que no se ha medido»:
 *
 *   1. `cwd: process.cwd()`. El cwd es DONDE SE LANZO el proceso, no donde vive
 *      el programa. Con el cwd equivocado, `cd /d <cwd>` + `scripts\x.py` (ruta
 *      relativa) = archivo inexistente = hijo que muere al nacer.
 *   2. `stdio: "ignore"` y `shell: true` en el rescate. El stderr del intérprete
 *      —la línea que dice la causa— se tiraba, y el rescate reabría el 9009.
 *
 * Lo que congela esta suite:
 *   A) la raíz se reconoce por MARCAS EN EL DISCO, y el cwd es el último recurso;
 *   B) el código cablea esa decisión (no `process.cwd()` suelto) y la anuncia;
 *   C) cada intento de reavivado deja evidencia con el cwd REAL y un diagnóstico;
 *   D) requirements.txt de raíz no pide paquetes que el embebido no puede tener.
 */
import {
  decidirRaizInstalacion,
  candidatasRaiz,
  esCasa,
  esEmpaquetado,
  carpetaPadre,
  MARCAS_INSTALACION,
  VAR_RAIZ_INSTALACION,
} from "../src/engine/raizInstalacion";
import {
  bloqueDeIntento,
  diagnosticoDelIntento,
  partirComando,
  archivoDelComando,
  nombreEvidencia,
} from "../src/engine/evidenciaReavivado";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos: string[] = [];
function c(que: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallos.push(que + (detalle ? " → " + detalle : "")); console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
}

// Un disco falso: las marcas de la casa en las carpetas que se declaren.
const disco = (...casas: string[]) => (ruta: string) =>
  casas.some((casa) => MARCAS_INSTALACION.some((m) => ruta.replace(/[\\/]+$/, "") === `${casa.replace(/[\\/]+$/, "")}${/\\/.test(ruta) ? "\\" : "/"}${m}`));

console.log("\n1) La casa se reconoce por sus marcas, no por el cwd\n");

{
  const APP = "C:\\Users\\BirdBox\\Downloads\\CerebroNico-IDE-v1.60.18";
  const d = decidirRaizInstalacion(
    { cwd: "C:\\Windows\\System32", plataforma: "win32", modo: "empaquetado", carpetaDelModulo: APP + "\\dist" },
    disco(APP),
  );
  c("★ acceso directo con «Iniciar en» vacío (cwd=System32): la casa sigue siendo la del módulo", d.raiz === APP, d.raiz);
  c("y lo dice: el origen es «junto-al-modulo», no el cwd", d.origen === "junto-al-modulo", d.origen);
  c("no se marca como anomalía (las marcas estaban ahí)", d.sinMarcas === false);
}

{
  const REPO = "/home/mario/cn";
  const d = decidirRaizInstalacion(
    { cwd: "/tmp", plataforma: "linux", modo: "fuentes", carpetaDelModulo: REPO },
    disco(REPO),
  );
  c("en fuentes, la raíz es la carpeta del módulo", d.raiz === REPO, d.raiz);
  c("el cwd equivocado no gana nunca a una candidata con marcas", d.raiz !== "/tmp");
}

{
  const OTRA = "C:\\Cerebro IDE";
  const d = decidirRaizInstalacion(
    { cwd: "C:\\Cerebronico", plataforma: "win32", modo: "empaquetado", carpetaDelModulo: "C:\\x\\dist", env: { [VAR_RAIZ_INSTALACION]: OTRA } },
    disco(OTRA, "C:\\Cerebronico"),
  );
  c("★ la orden explícita manda aunque haya otra carpeta con marcas", d.raiz === OTRA && d.origen === "orden-explicita", d.origen);
}

{
  const d = decidirRaizInstalacion({ cwd: "C:\\nada", plataforma: "win32", modo: "empaquetado", carpetaDelModulo: "C:\\nada\\dist" }, () => false);
  c("sin ninguna carpeta con marcas, se avisa fuerte (no se finge normalidad)", d.sinMarcas === true && /⛔/.test(d.nota));
  c("★ y NUNCA devuelve una ruta vacía (un cwd vacío en spawn es el defecto otra vez)", d.raiz.length > 0, JSON.stringify(d.raiz));
  c("la nota nombra la variable de rescate, para que se pueda arreglar sin leer el código", d.nota.includes(VAR_RAIZ_INSTALACION));
}

{
  c("un package.json suelto NO hace una casa (misma lección del ZIP)",
    esCasa("C:\\tmp", (r) => /package\.json$/.test(r)) === false);
  c("las tres marcas juntas sí",
    esCasa("C:\\app", (r) => MARCAS_INSTALACION.some((m) => r.endsWith(m))) === true);
  c("una sonda que lanza no tumba la decisión (se toma como «no está»)",
    esCasa("C:\\app", () => { throw new Error("disco raro"); }) === false);
  const orden = candidatasRaiz({ cwd: "C:\\cwd", plataforma: "win32", modo: "empaquetado", carpetaDelModulo: "C:\\app\\dist", env: { [VAR_RAIZ_INSTALACION]: "C:\\otra" } });
  c("el orden de confianza es: orden → módulo → cwd",
    orden[0].origen === "orden-explicita" && orden[orden.length - 1].origen === "cwd", JSON.stringify(orden.map((o) => o.origen)));
  c("empaquetado ⇒ la raíz está un nivel arriba de dist", esEmpaquetado("C:\\app\\dist") === true && carpetaPadre("C:\\app\\dist") === "C:\\app");
  c("en fuentes, la carpeta del módulo ya es la raíz", esEmpaquetado("C:\\app") === false);
  c("carpetaPadre respeta la raíz de unidad (no devuelve «C:»)", carpetaPadre("C:\\a") === "C:\\");
}

console.log("\n2) El cable: nadie vuelve a confiar en el cwd\n");

{
  const server = leer("server.ts");
  c("★ server.ts decide la raíz con el módulo puro", /decidirRaizInstalacion\(/.test(server));
  c("★ y el supervisor recibe ESA raíz, no `process.cwd()`",
    /registrarSupervisorArranque\(app, \{ raizProyecto: RAIZ_INSTALACION/.test(server));
  c("★ ya no queda `raizProyecto: process.cwd()` en el supervisor",
    !/registrarSupervisorArranque\(app, \{ raizProyecto: process\.cwd\(\)/.test(server));
  c("la elección se anuncia en el log al arrancar (sin esto, el próximo diagnóstico empieza de cero)",
    /console\.log\(`\[CerebroNico\] \$\{d\.sinMarcas/.test(server));
  const main = leer("electron-main.cjs");
  c("★ el .exe le dice al server dónde está la casa (CN_INSTALL_ROOT = __dirname)",
    /CN_INSTALL_ROOT: __dirname/.test(main));
  c("el .exe sigue lanzando el server con cwd: __dirname (dos verdades no)", /cwd: __dirname, env/.test(main));
}

const sup = leer("server/routers/supervisorArranque.ts");
{
  // Se compara el CÓDIGO, no los comentarios: el `shell: true` que queda escrito en
  // los comentarios es la memoria del 9009, justamente lo que hay que recordar.
  const supCodigo = sup.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  c("★ el rescate ya NO usa `shell: true` (era el 9009 otra vez)",
    !/shell: true/.test(supCodigo), (supCodigo.match(/shell: true/g) || []).join(" | "));
  c("★ el hijo se lanza por argv con shell:false", /lanzarPorArgv/.test(sup) && /shell: false/.test(sup));
  c("★ la muerte deja EVIDENCIA: se anota el intento antes de lanzar",
    /evidenciaDeIntento\(\{ id, comando: ruta, raiz, log: logServicio, shimEscrito \}\)/.test(sup));
  c("★ y la salida del hijo ya no se tira a la nada",
    !/spawn\(ruta, \{ shell: true, detached: true, stdio: "ignore"/.test(sup));
  c("el camino del shim conserva `shell: false` + `windowsVerbatimArguments`",
    /spawn\(shim\.exe, shim\.argv, \{\s*\n?\s*shell: false/.test(sup.replace(/\r/g, "")) && /windowsVerbatimArguments: true/.test(sup));
  c("la raíz de los shims no se inventa: viene de deps (instalación / datos)",
    /const raiz = deps\.raizProyecto;/.test(sup));
}

console.log("\n3) La evidencia: el log contesta «¿por qué murió?»\n");

{
  const base = { id: "memoria", comando: "scripts\\hindsight_daemon.py --port 5100", raiz: "C:\\app", interprete: "C:\\app\\runtime\\python-embed\\python.exe", log: "C:\\datos\\logs\\arranque\\memoria.log", cuando: "2026-11-16T10:00:00.000Z" };
  const ok = bloqueDeIntento({ ...base, existeElScript: true, existeElInterprete: true, shimEscrito: true });
  c("el bloque dice la raíz REAL con la que se lanzó", ok.includes("C:\\app"));
  c("el bloque dice el comando y el intérprete", ok.includes("hindsight_daemon.py") && ok.includes("python-embed"));
  c("el bloque dice el log donde mirar", ok.includes("memoria.log"));
  c("la fecha se inyecta (la suite es determinista)", ok.startsWith("[2026-11-16T10:00:00.000Z]"));
  c("todo presente ⇒ el diagnóstico manda a mirar DENTRO del servicio", /DENTRO del servicio/.test(ok));
  const faltaScript = bloqueDeIntento({ ...base, existeElScript: false, existeElInterprete: true, shimEscrito: true });
  c("★ archivo ausente ⇒ el diagnóstico nombra la raíz (la causa, no el síntoma)", /NO está en «C:\\app»/.test(faltaScript));
  const faltaInterprete = bloqueDeIntento({ ...base, existeElScript: true, existeElInterprete: false, shimEscrito: true });
  c("★ intérprete ausente ⇒ lo dice con nombre y apellido", /no existe/.test(faltaInterprete) && faltaInterprete.includes("python-embed"));
  c("★ sin shim ⇒ avisa que se cayó al camino viejo (el del 9009)", /camino viejo/.test(diagnosticoDelIntento({ ...base, existeElScript: true, existeElInterprete: true, shimEscrito: false })));
  c("sin intérprete declarado no se inventa uno", diagnosticoDelIntento({ ...base, interprete: "", existeElScript: true, existeElInterprete: true, shimEscrito: true }).length > 0);
  c("la evidencia va a su propio archivo, junto al log", nombreEvidencia("memoria") === "reavivar-memoria.intentos.log");
}

{
  c("un comando simple se parte en piezas sin shell", JSON.stringify(partirComando("python -u scripts\\a.py --port 5100")) === JSON.stringify(["python", "-u", "scripts\\a.py", "--port", "5100"]));
  c("★ un intérprete citado con espacios es UNA palabra (no se parte en dos)", partirComando('"C:\\Program Files\\py.exe" "scripts\\a.py"')[0] === "C:\\Program Files\\py.exe");
  c("sin comillas, la barra invertida llega intacta (no se come el separador)", partirComando("C:\\py.exe scripts\\a.py")[0] === "C:\\py.exe", JSON.stringify(partirComando("C:\\py.exe scripts\\a.py")));
  const cmdIntel = '"C:\\py.exe" "scripts\\a.py" --port 1';
  c("el archivo del comando es el .py cuando hay intérprete delante", archivoDelComando(cmdIntel) === "scripts\\a.py", archivoDelComando(cmdIntel));
  c("y el programa cuando no hay intérprete", archivoDelComando("ollama serve") === "ollama");
  c("comando vacío ⇒ ninguna pieza (no se lanza un proceso fantasma)", partirComando("   ").length === 0);
}

console.log("\n4) requirements.txt: el embebido no puede pedir lo que no tiene\n");

{
  const req = leer("requirements.txt");
  const reales = req.split("\n").map((l) => l.split("#")[0].trim()).filter((l) => l.length > 0);
  c("★ la raíz no pide NINGÚN paquete a pip (python-embed no trae pip)", reales.length === 0, JSON.stringify(reales));
  c("★ no vuelven fastapi/uvicorn/pydantic a la raíz", !/^(fastapi|uvicorn|pydantic|python-dotenv)/im.test(reales.join("\n")));
  c("el porqué queda escrito en el archivo (no es un borrado silencioso)", /python-embed/.test(req) && /stdlib|biblioteca estándar/.test(req));
  c("los legacy conservan lo suyo junto a su componente", /fastapi==/.test(leer("core-agent/requirements.txt")));
  c("y autonomia.py sigue leyendo este archivo (una sola fuente)", /requirements\.txt/.test(leer("autonomia.py")));
  // v1.0.23 · cura 2.2, valla más estricta: no basta «la raíz no pide nada». Se
  // exige que cada requirements del árbol declare su ÁMBITO, para que nadie lo
  // copie de nuevo a la raíz creyendo que el arranque lo necesita.
  {
    const copias = ["documentacion/ide/requirements.txt", "core-agent/requirements.txt"];
    const sinAmbito = copias.filter((r) => !/LEGACY|opcional|Opcional|ámbito/.test(leer(r)));
    c("★ cada copia legacy de requirements dice PARA QUÉ es (nadie la confunde con el arranque)",
      sinAmbito.length === 0, sinAmbito.join(", "));
    c("★ ninguna pide nada sin versión fija (un rango abierto rompe el paquete del .exe)",
      copias.every((r) => leer(r).split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).every((l) => /==/.test(l))), copias.join(", "));
    c("el puente :5000 no importa ningún paquete de pip (es la premisa de todo esto)",
      !/^\s*(import|from)\s+(fastapi|uvicorn|dotenv|pydantic)/m.test(leer("agent_bridge_5000.py")));
  }
  c("la valla del ritual no se apaga borrando esta suite", leer("scripts/validar.mjs").includes("raizInstalacion.test.ts"));
}

console.log("\n" + "─".repeat(60));
console.log(`═══ RAÍZ DE INSTALACIÓN Y EVIDENCIA (v1.0.23): ${correctas} correctas · ${fallos.length} fallos ═══`);
console.log("─".repeat(60));
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
