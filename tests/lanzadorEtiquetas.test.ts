// tests/lanzadorEtiquetas.test.ts
// v1.0.39 · EL LANZADOR QUE SE CIERRA SOLO.
//
// Queja de Mario (20/11): «el iniciar_todo_windows no abre, arranca y se
// cierra» — y con la 1.0.9 si abria. No era lentitud ni un pack caido: el
// archivo tenia DOS `goto` a etiquetas que no estaban escritas
// (`:ollama_arriba` y `:ollama_arrancar`) en la linea 137. cmd no da un
// error de sintaxis: imprime «No se puede encontrar la etiqueta de lote
// especificada» y ABORTA el archivo, asi que el `pause` final nunca se
// alcanza y la ventana desaparece. Ni packs, ni puente, ni IDE.
//
// Esta suite lee el .bat como texto y lo bate contra lo que cmd exige.
// Ninguna de estas comprobaciones necesita Windows: son de fuente.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const BAT = "iniciar_todo_windows.bat";
const crudo = readFileSync(join(RAIZ, BAT), "utf-8");
const lineas = crudo.split(/\r?\n/);

let correctas = 0;
const fallos: string[] = [];
function check(nombre: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; console.log(`  \u2713 ${nombre}${detalle ? ` (${detalle})` : ""}`); }
  else { fallos.push(nombre + (detalle ? ` (${detalle})` : "")); console.log(`  \u2717 ${nombre}${detalle ? ` (${detalle})` : ""}`); }
}

// Una linea que cmd EJECUTA (no un REM ni un echo de texto).
const esCodigo = (l: string) => {
  const t = l.trim();
  if (!t) return false;
  if (/^rem\b/i.test(t)) return false;
  if (/^::/.test(t)) return false;
  if (/^echo\b/i.test(t)) return false;
  return true;
};
const codigo = lineas.filter(esCodigo);

console.log("\n1. NINGUN GOTO SE QUEDA SIN ETIQUETA (el defecto que cerraba la ventana)\n");

const etiquetas = new Set(
  lineas.map((l) => (l.match(/^:([A-Za-z_0-9]+)/) || [])[1]).filter(Boolean) as string[],
);
const destinosGoto = new Set<string>();
const destinosCall = new Set<string>();
for (const l of codigo) {
  for (const m of l.matchAll(/\bgoto\s+:([A-Za-z_0-9]+)/gi)) destinosGoto.add(m[1]);
  for (const m of l.matchAll(/\bcall\s+:([A-Za-z_0-9]+)/gi)) destinosCall.add(m[1]);
}

check("el archivo tiene etiquetas (no es un .bat vacio)", etiquetas.size > 10, `${etiquetas.size} etiquetas`);
check("se encontraron gotos que revisar", destinosGoto.size > 10, `${destinosGoto.size} destinos`);

const gotoRotas = [...destinosGoto].filter((d) => !etiquetas.has(d));
check(
  "★ TODO goto :x tiene su :x escrito (si falta, cmd aborta y la ventana se cierra)",
  gotoRotas.length === 0,
  gotoRotas.length ? `rotas: ${gotoRotas.map((d) => ":" + d).join(", ")}` : "0 rotas",
);
const callRotas = [...destinosCall].filter((d) => !etiquetas.has(d));
check("y todo call :x tambien", callRotas.length === 0, callRotas.length ? callRotas.join(", ") : "0 rotas");

// El defecto exacto, con nombre y apellido: si alguien borra una de estas dos
// ramas, vuelve el «abre y se cierra» y quiero el rojo con el nombre puesto.
check("★ existe :ollama_arriba (la rama de «ya estaba escuchando»)", etiquetas.has("ollama_arriba"));
check("★ existe :ollama_arrancar (la rama de «hay que arrancarlo»)", etiquetas.has("ollama_arrancar"));

console.log("\n2. NINGUN `&` CONVIRTIENDO UN IF EN DOS ORDENES\n");

// `if ... set A & set B` ejecuta set B SIEMPRE: el log decia dev:sin-vite y
// abria dev. Se prohibe el patron en lineas de codigo.
const ampersands = codigo.filter((l) => /\s&(?!&)/.test(l) && !/^\s*start\b/i.test(l.trim()));
check(
  "★ ningun `if ... set A & set B` (el & corta la linea y set B corre siempre)",
  ampersands.length === 0,
  ampersands.length ? ampersands[0].trim().slice(0, 70) : "0 lineas",
);

console.log("\n3. LA VENTANA NO SE CIERRA SOLA\n");

check("hay un pause final de verdad (espera una tecla)", /^pause\s*$/im.test(crudo));
check("★ y NO es `pause <nul` (con stdin=NUL pasaria solo)", !codigo.some((l) => /pause\s*<\s*nul/i.test(l)));
check("el error de npm tambien llega a la pausa (:npm_fallo -> :pausa_final)", /goto\s+:pausa_final/i.test(crudo) && etiquetas.has("pausa_final"));
check("el archivo termina con exit /b 0", /exit\s+\/b\s+0\s*$/.test(crudo.trimEnd()));

console.log("\n4. LO QUE CMD EXIGE AL TEXTO\n");

const sinCR = lineas.length - crudo.split("\n").length + 1;
check("★ CRLF en todas las lineas (un .bat en LF «se cierra enseguida»)", !/[^\r]\n/.test(crudo), `${sinCR - 1} lineas`);
check("sin BOM al principio (cmd lo leeria como parte del comando)", !crudo.startsWith("\uFEFF"));
check("sin tildes (la consola OEM las vuelve basura)", !/[\u00C0-\u00FF]/.test(crudo));
check("la primera linea apaga el eco", lineas[0].trim().toLowerCase() === "@echo off");

console.log("\n5. LA GRACIA ES UNA Y ES LA DEL SUPERVISOR\n");

check("el lanzador declara la gracia de arranque", /CN_GRACIA_ARRANQUE_S/.test(crudo));
check("y vale 90 s, el mismo numero que el supervisor", /CN_GRACIA_ARRANQUE_S=90|"CN_GRACIA_ARRANQUE_S=90"/.test(crudo));
check("GRACIA_ARRANQUE_S toma el valor de la variable (un solo dueno)", /set\s+"GRACIA_ARRANQUE_S=%CN_GRACIA_ARRANQUE_S%"/i.test(crudo));
check("el sondeo usa ping -n y no timeout (con stdin redirigido el bucle gira vacio)", /ping\s+\/n\s+2\s+127\.0\.0\.1/.test(crudo) && !/^\s*timeout\s+\/t/im.test(crudo));

console.log("\n6. ELECCION DE APERTURA, DICHA EN EL LOG\n");

check("existen las tres ramas de apertura", etiquetas.has("abrir_start") && etiquetas.has("abrir_sin_vite") && etiquetas.has("abrir_fin"));
check("hay repliegue unico (:abrir_reintento)", etiquetas.has("abrir_reintento"));
check("el modo elegido se imprime (lo que no sale en el log no se diagnostica)", /CN_ABRIR_SCRIPT/.test(crudo));
check("arranca Ollama en su propia ventana /min con cmd /k", /start\s+"Ollama Engine[^"]*"\s+\/min\s+\/d\s+"%~dp0"/.test(crudo));

console.log("\n7. LOS SIETE PUERTOS SE MIDEN CON ANCLA EXACTA\n");

for (const puerto of ["3000", "3500", "5000", "5100", "5102", "5103", "11434"]) {
  check(`el inventario mide :${puerto}`, new RegExp(`call\\s+:chequeo\\s+${puerto}\\b`).test(crudo));
}
check("la subrutina :chequeo existe y ancla el puerto con espacio", etiquetas.has("chequeo") && /findstr\s+":%~1 "/.test(crudo));
check("la subrutina vuelve con exit /b 0 (un call sin retorno cae al final del archivo)", /:chequeo[\s\S]{0,400}?exit\s+\/b\s+0/.test(crudo));

console.log("\n—— lanzadorEtiquetas: " + correctas + " correctas · " + fallos.length + " fallidas ——");
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  · " + f);
  process.exit(1);
}
