/**
 * tests/controlRazonamiento.test.ts — EL MOTOR DECIDE EL MOVIMIENTO (v1.33.0 · FASE 3)
 */
import { decidirProxima, directivaDeMovimiento, esDeterminista, DETERMINISTAS } from "../src/engine/controlRazonamiento";
import { readFileSync } from "node:fs";
let correctas = 0; const fallos: string[] = [];
const comprobar = (q: string, c: unknown, d?: string) => { if (c) { correctas++; console.log(`  ✓ ${q}`); } else { fallos.push(q + (d ? ` — ${d}` : "")); console.log(`  ✗ ${q}${d ? ` — ${d}` : ""}`); } };
const ERR_EXT = '[plugin:vite:import-analysis] Failed to resolve import "react-dom/client" from "src/main.tsx". Does the file exist?\nC:/Cerebronico/src/main.tsx:2:21';
const ERR_REL = 'Failed to resolve import "./tablero" from "src/App.tsx". Does the file exist?';

console.log("\n1. import externo: la secuencia del §6, no la sexta variante");
{
  const m = decidirProxima({ error: ERR_EXT })!;
  comprobar("accion inspeccionar antes que modificar", m.accion === "inspeccionar" && m.herramienta_sugerida === "read_file");
  comprobar("secuencia: package.json → node_modules → lock → runtime → instalar", /package\.json/.test(m.orden_lectura.join()) && /node_modules/.test(m.orden_lectura.join()) && /lock/.test(m.orden_lectura.join()) && /install/.test(m.orden_lectura.join(" ").toLowerCase()));
  comprobar("PROHIBE reescribir el import sin haber leído package.json", m.prohibiciones.some((x) => /NO reescribir el import/.test(x) && /package\.json/.test(x)));
  comprobar("nivel bajo: inspección no gasta modelo grande", m.nivel === "bajo");
}
console.log("\n2. import relativo: ruta de disco, no de dependencias");
{
  const m = decidirProxima({ error: ERR_REL })!;
  comprobar("pregunta por el destino exacto en disco", m.orden_lectura.join(" ").includes("existe ese archivo"));
  comprobar("no manda npm install para un relativo", !/npm i/.test(m.orden_lectura.join()));
}
console.log("\n3. jerarquía: replantear manda sobre la ruta del error");
{
  comprobar("presupuesto agotado → replantear aunque haya error", decidirProxima({ error: ERR_EXT, presupuestoAgotado: true })!.accion === "replantear");
  comprobar("escalón 3 → replantear (no otro micro-parche)", decidirProxima({ error: ERR_EXT, escalon: 3 })!.accion === "replantear");
  comprobar("replantear prohibe reintentar el mismo camino con otra redacción", /otra redacción/.test(decidirProxima({ presupuestoAgotado: true })!.prohibiciones.join()));
  comprobar("sin error y sin señales: no hay movimiento que decidir", decidirProxima({}) === null);
}
console.log("\n4. rutas por clase (reconocimientoError como fuente de clasificación)");
{
  const m = decidirProxima({ error: "SyntaxError: Unexpected token '}' at src/App.tsx:44" })!;
  comprobar("sintaxis → editar localizado, prohibido reescribir el archivo entero", m.accion === "modificar_codigo" && m.prohibiciones.some((x) => /reescribir/.test(x)));
  comprobar("sintaxis cita el archivo en su lectura", /App\.tsx/.test(m.orden_lectura.join()));
  const t = decidirProxima({ error: "TS2345: Argument of type 'string' is not assignable" })!;
  comprobar("tipo → el compilador manda (verificar, no cast)", t.accion === "verificar" && t.prohibiciones.join().includes("cast"));
  const r = decidirProxima({ error: "ReferenceError: planRunner is not defined" })!;
  comprobar("referencia → por qué desapareció antes de reinstalarla", /regresión/.test(r.prohibiciones.join()));
  const rt = decidirProxima({ error: "TypeError: cannot read properties of undefined (reading 'map')" })!;
  comprobar("runtime → reproducir antes de tocar; nivel alto", rt.accion === "inspeccionar" && rt.nivel === "alto" && /reproducir/.test(rt.razon));
  const to = decidirProxima({ error: "ETIMEDOUT: request timed out after 30000ms" })!;
  comprobar("timeout → medir sin modelo", to.nivel === "sin_modelo");
  const pe = decidirProxima({ error: "EACCES: permission denied, mkdir '/etc/x'" })!;
  comprobar("permiso → BLOQUEAR (decisión humana, §25)", pe.accion === "bloquear");
  const uc = decidirProxima({ error: "algo raro sin firma conocida" })!;
  comprobar("desconocido → una lectura de contexto es obligatoria", /una lectura/.test(uc.prohibiciones.join()));
}
console.log("\n5. contrato abierto: la prohibición viaja con el movimiento");
{
  const m = decidirProxima({ error: ERR_EXT, contratoAbierto: true })!;
  comprobar("el motor recuerda que cerrar exige evidencia", m.prohibiciones.some((x) => /evidencia/.test(x)));
}
console.log("\n6. §19: determinista primero (tabla y function)");
{
  for (const [q, es] of [["¿existe el archivo main.tsx?", true], ["¿compila el proyecto?", true], ["¿hay la dependencia jspdf?", true], ["¿el puerto 3500 está abierto?", true], ["¿pasan los tests?", true], ["¿el archivo es idéntico al backup?", true], ["¿qué arquitectura conviene para el chat?", false], ["redacta el copy de bienvenida", false]] as Array<[string, boolean]>) {
    comprobar(`«${q.slice(0, 32)}…» → ${es ? "herramienta" : "modelo"}`, esDeterminista(q).sio === es);
  }
  comprobar("la tabla cubre las ocho preguntas de la hoja de ruta", DETERMINISTAS.length >= 8);
}
console.log("\n7. la directiva y el cable");
{
  const m = decidirProxima({ error: ERR_EXT })!;
  const d = directivaDeMovimiento(m);
  comprobar("el texto dice accion, secuencia y prohibido", /PRÓXIMO MOVIMIENTO DECIDIDO POR EL MOTOR \(inspeccionar/.test(d) && /secuencia obligatoria/.test(d) && /PROHIBIDO ahora/.test(d));
  const juez = readFileSync("src/engine/bucleAutonomo.ts", "utf8");
  comprobar("el juez importa el controlador", /from "\.\/controlRazonamiento"/.test(juez) && /decidirProxima\(\{/.test(juez));
  comprobar("esta suite entra en npm run validar", readFileSync("scripts/validar.mjs", "utf8").includes("controlRazonamiento.test.ts"));
}
console.log(`\n${"─".repeat(56)}`);
console.log(`═══ CONTROL DE RAZONAMIENTO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) { fallos.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
