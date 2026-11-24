/**
 * arranqueVentanas.test.ts — v1.99.0 · LAS VENTANAS QUE DEJA UN CLIC
 * ==================================================================
 * El usuario cuenta ventanas a ojo en el Administrador y lo dijo como un contrato:
 * «EN TEORÍA TIENEN QUE QUEDAR ABIERTOS 2 CMD Y 3 PY». Y midió lo contrario:
 * «solo el cmd de arranque y 2 py», «fabrio 2 py y hay 3 cmd, una vacía que dice
 * arranquecompleto, pero vacía, al rato se cerró sola», y el que decide todo:
 * «SE CERRO OTRA VEZ POR LA MITAD Y NO DA TIEMPO A COPIAR».
 *
 * Ese último no es un defecto de arranque: es un defecto de EVIDENCIA. `start
 * "…" /min %CN_PY% script.py` hace que la ventana SEA el proceso — el pack cae y se
 * lleva la consola con el traceback puesto. Sin ventana y sin archivo no hay nada
 * que copiar, así que el usuario no puede reportarme y yo no puedo arreglarlo.
 *
 * La valla, en dos partes: el PLANO (puro, en `src/engine/arranqueVentanas.ts`) y el
 * BAT REAL batido contra el plano (lectura de fuente, como `arranqueLimpio` hace con
 * el arranque limpio). Y la forma prohibida — el `start` pelado — queda sembrada: si
 * alguien la devuelve, rojo.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVICIOS_VENTANA,
  contarPorTipo,
  comandoVentana,
  rutaDeLog,
  decidirReavivado,
  REAVIVADOS_MAXIMOS,
  VENTANA_REAVIVADO_MS,
} from "../src/engine/arranqueVentanas";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BAT = path.join(RAIZ, "iniciar_todo_windows.bat");
const crudo = existsSync(BAT) ? readFileSync(BAT, "utf8").replace(/\r\n/g, "\n") : "";
const lineas = crudo.split("\n");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallos.push(que); console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};

console.log("\n1) El plano: 2 CMD + 3 PY, que es lo que el usuario cuenta\n");

c("★ el contrato del usuario está escrito en el plano: 2 ventanas CMD", contarPorTipo("cmd") === 2,
  `hay ${contarPorTipo("cmd")}`);
c("★ y 3 procesos Python (dos con ventana, el puente hijo del server)", contarPorTipo("py") === 3,
  `hay ${contarPorTipo("py")}`);
c("cada servicio tiene id único (el id es el nombre del log)",
  new Set(SERVICIOS_VENTANA.map((s) => s.id)).size === SERVICIOS_VENTANA.length);
c("los cinco puertos conocidos están en el plano (3000/5000/5100/5102/11434)",
  [3000, 5000, 5100, 5102, 11434].every((p) => SERVICIOS_VENTANA.some((s) => s.puerto === p)),
  SERVICIOS_VENTANA.map((s) => s.puerto).join(","));
c("el puente :5000 sigue siendo hijo del server (no se le da una ventana que no puede pagar)",
  SERVICIOS_VENTANA.find((s) => s.puerto === 5000)?.dueño === "server");

console.log("\n2) La forma del comando: ventana que sobrevive + rastro en archivo\n");

const muestra = comandoVentana(SERVICIOS_VENTANA.find((s) => s.id === "memoria")!, {
  raizProyecto: "%~dp0".replace("%~dp0", "C:\\x"), logs: "C:\\datos\\logs\\arranque",
});
c("★ usa `cmd /k`: la consola sigue viva cuando el proceso muere", /cmd \/k/.test(muestra), muestra);
c("★ redirectiona la salida a SU archivo (1>> … 2>&1), que es lo que se puede leer después",
  /1>> "C:\\datos\\logs\\arranque\\memoria\.log" 2>&1/.test(muestra), muestra);
c("cuando el pack cae, la ventana dice DÓNDE está el log (nadie tiene que adivinar)",
  /se cerro[\s\S]*el log completo esta en/.test(muestra), muestra);
c("rutaDeLog cuelga de la raíz de DATOS, no de la instalación",
  rutaDeLog("C:\\Cerebronico", "creador") === "C:\\Cerebronico\\logs\\arranque\\creador.log",
  rutaDeLog("C:\\Cerebronico", "creador"));
c("rutaDeLog tolera la raíz con barra final (no duplica el separador)",
  !/\\\\logs/.test(rutaDeLog("C:\\Cerebronico\\", "puente")), rutaDeLog("C:\\Cerebronico\\", "puente"));

console.log("\n3) El bat real, batido contra el plano (lectura de fuente)\n");

c("el bat existe", crudo.length > 1000, `${crudo.length} chars`);
for (const id of ["memoria", "creador"]) {
  const linea = lineas.find((l) => l.startsWith('start "CerebroNico ') && l.includes(`${id}.log`)) || "";
  // v2.0.2 · el .bat migro a `start /b` (sin ventana) para memoria y creador:
  // el usuario reporto ventanas de CMD abriendose y cerrandose solas. `/b` deja
  // el proceso vivo sin consola visible; el rastro sigue en el log redirigido.
  c(`★ [${id}] su start usa /b (sin ventana) o cmd /k (ventana que sobrevive)`,
    /(\/b|cmd \/k)/.test(linea), linea.slice(0, 90));
  c(`★ [${id}] su salida va a %CN_LOGS%\\${id}.log`, new RegExp(`1>> "%CN_LOGS%\\\\${id}\\.log" 2>&1`).test(linea), linea.slice(0, 120));
}
c("★ DEFECTO SEMBRADO: ningún `start` lanza un .py pelado (el camino que borraba el traceback)",
  !/start\s+"[^"]*"\s+\/min\s+%CN_PY%[^"]*\.py/.test(crudo),
  (lineas.find((l) => /start\s+"[^"]*"\s+\/min\s+%CN_PY%[^"]*\.py/.test(l)) || "").trim().slice(0, 100));
c("la carpeta de logs está definida y creada antes de usarse",
  /if not defined CN_LOGS set "CN_LOGS=/.test(crudo) && /if not exist "%CN_LOGS%" mkdir/.test(crudo));
c("y tiene doble repliegue si la raíz de datos no existe (no deja el arranque a ciegas)",
  /if not exist "%CN_LOGS%" set "CN_LOGS=%TEMP%"/.test(crudo));
c("Ollama conserva su ventana con `cmd /k` (así estaba y así debe seguir)",
  // v1.99.11 metió `/d "%~dp0"` en los tres `start` para matar las comillas
  // anidadas; la comprobación seguía pidiendo la forma sin `/d` y, como además
  // esta suite reventaba por su propio `fallidas`, nadie lo vio nunca.
  // v2.2.2 · LA FORMA HISTÓRICA DE ESTE .bat es `start "titulo" /min /d ... cmd /k`
  // (el título ANTES de los modificadores, que es como lo escribe Windows y como
  // está en el árbol real desde la 2.1.2). La comprobación pedía `/min` antes del
  // título — la forma de la 1.98 — y por eso estaba en rojo contra un .bat sano.
  // Lo que hay que garantir no es el orden de los argumentos: es que la ventana
  // EXISTA, esté MINIMIZADA y SOBREVIVA (`cmd /k`). Se comprueba eso, en cualquier
  // orden, y se sigue exigiendo el título exacto para que no se lance sin ventana.
  //
  // v1.0.22 · llegó a migrar a `start "" /b ... cmd /c` con la salida al
  // `ollama.log`, «igual que memoria y creador». Fue un error de diagnóstico:
  // `/b` NO despega al hijo de la consola del lanzador; al cerrarla, Windows
  // manda CTRL_CLOSE a todos los hijos /b y Ollama muere con ella (sin motor no
  // hay modelos y el puente al :11434 da ECONNREFUSED). Las «ventanas de CMD
  // abriéndose y cerrándose solas» que reportó el usuario eran los SEGUNDOS
  // `ollama serve` del supervisor, no esta ventana.
  // v1.0.36 · la forma que funciona (v1.0.9, confirmada por el usuario) y que se
  // exige aquí: UNA ventana propia, MINIMIZADA, con título fijo y `cmd /k` para
  // que sobreviva al cierre del lanzador, con las variables dentro del hijo y la
  // salida a su log.
  /^start "Ollama Engine - Puerto 11434" \/min [^\n]*cmd \/k[^\n]*ollama serve[^\n]*ollama\.log/m.test(crudo)
  && !/^start "" \/b[^\n]*ollama serve/m.test(crudo));

// v1.0.36 · POR QUE EL MOTOR NO PUEDE IR CON /b (la prueba, no la opinion).
// El servidor corre EN PRIMER PLANO en esta misma consola (`call npm run start`
// o `call npm run dev`), asi que la consola del lanzador es la del server. Un
// hijo `/b` pertenece a esa consola y comparte su grupo de control: un Ctrl+C,
// un cierre de ventana o un corte del server le llegan a el tambien. Con el
// motor ahi dentro, el primer Ctrl+C se lleva Ollama por delante y la casa se
// queda sin modelos aunque el .bat haya dicho «listo en :11434».
c("el server corre en primer plano en la consola del lanzador (por eso el motor no puede ser /b)",
  /^call npm run (start|dev:sin-vite|dev)/m.test(crudo), (crudo.match(/^call npm run [^\r\n]*/m) || [""])[0].slice(0, 60));
c("★ el motor no comparte consola con el server: ni un `start /b` con `ollama serve`",
  !/^start[^\r\n]*\/b[^\r\n]*ollama serve/m.test(crudo));

console.log("\n4) Reavivado: con memoria, con tope, con motivo (que no sea un bucle)\n");

const t0 = 1_700_000_000_000;
const d0 = decidirReavivado(null, t0);
c("la primera caída reaviva enseguida (15 s), sin ceremonia", d0.accion === "reavivar" && d0.enMs === 15_000, JSON.stringify(d0));
const d1 = decidirReavivado({ id: "memoria", veces: 1, ultimoEn: t0 }, t0 + 20_000);
c("★ la segunda espera DUPLICA (30 s): reintentar de inmediato contra la misma causa es el bucle",
  d1.accion === "esperar" && d1.enMs === 30_000, JSON.stringify(d1));
const d2 = decidirReavivado({ id: "memoria", veces: 2, ultimoEn: t0 }, t0 + 20_000);
c("la tercera espera 60 s", d2.accion === "esperar" && d2.enMs === 60_000, JSON.stringify(d2));
const d3 = decidirReavivado({ id: "memoria", veces: REAVIVADOS_MAXIMOS, ultimoEn: t0 }, t0 + 20_000);
c("★ a la 4ª se RINDE con motivo legible (no reanima un pack roto para siempre)",
  d3.accion === "renunciar" && /Leé el log/.test(d3.motivo), JSON.stringify(d3));
const d4 = decidirReavivado({ id: "memoria", veces: REAVIVADOS_MAXIMOS, ultimoEn: t0 }, t0 + VENTANA_REAVIVADO_MS + 1000);
c("la seguidad vieja no castiga: pasados 10 minutos vuelve a empezar de cero",
  d4.accion === "reavivar", JSON.stringify(d4));
c("reloj entra inyectado (la suite no duerme nada, como en toda la casa)",
  decidirReavivado(null, 0).accion === "reavivar" && decidirReavivado(null, 9e12).accion === "reavivar");

console.log(`\n═══ ARRANQUE DE VENTANAS (v1.99.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
