/**
 * autoLlamado.test.ts — v1.99.7 · LA FRONTERA DEL «SIGUE» ESCRITO POR EL MOTOR
 * ===========================================================================
 * Mario pidió que el IDE se autollame cuando le quedan tareas («como vos, en segundo plano,
 * cuando terminás el validar y empezás otra vez»). Un lazo que se re-entra a sí mismo, sin
 * fronteras, es la definición de gasto infinito con buena actitud. Este corte prueba las tres:
 * voluntad del usuario, tope de re-entradas y estancamiento por huella. Y prueba además que NO
 * se traga el «NINGUNO» del parte de arranque — el peor bucle posible: re-entrarse para no hacer
 * nada, indefinidamente.
 */
import {
  decidirAutoLlamado, parsearReanudar, trabajoPendiente, firmarTrabajo, notaParaPanel,
  TOPE_AUTO_LLAMADOS, MAX_LINEAS_REANUDAR,
} from "../src/engine/autoLlamado";
import { readFileSync } from "node:fs";

let ok = 0;
const mal: string[] = [];
const c = (q: string, v: boolean, d = "") => {
  if (v) { ok++; console.log("  \u2713 " + q); }
  else { mal.push(q + (d ? " -> " + d : "")); console.log("  \u2717 " + q + (d ? " \u2014 " + d : "")); }
};
const leer = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const P = (id: string, desc: string, status: string = "pending") => ({ id, description: desc, status: status as any });
const base = {
  activado: true, plan: [] as any[], llamadosHechos: 0, tope: undefined as number | undefined,
  turnoFallo: false, conclusion: "cerré lo que pude", sellosPrevios: [] as string[], reanudar: "",
};

console.log("\n1) La frontera de la voluntad (esto gasta crédito del usuario)\n");
const conPlan = decidirAutoLlamado({ ...base, plan: [P("1", "terminar el ZIP", "done"), P("2", "escribir el LEEME"), P("3", "verificar el arranque")] });
const apagado = decidirAutoLlamado({ ...base, activado: false, plan: [P("2", "escribir el LEEME")] });
c("\u2605 apagado: calla y DICE por qué (un silencio acá sería el defecto viejo)",
  apagado.accion === "callar" && /apagado/.test(apagado.motivo) && /cr\u00e9dito/.test(apagado.motivo), JSON.stringify(apagado));
c("y no deja un mensaje listo para escapar", apagado.mensaje === null && apagado.restantes === 0);
c("el tope existe pero es chico: nadie puede gastar una tarde entera sin permiso",
  TOPE_AUTO_LLAMADOS > 0 && TOPE_AUTO_LLAMADOS <= 3, String(TOPE_AUTO_LLAMADOS));

console.log("\n2) El parte de arranque: «NINGUNO» no es una tarea\n");
const parteReal = [
  "# REANUDAR.md - estado del arranque", "", "Generado por `arrancar_todo.bat` el 2026-10-31 11:04:34.", "",
  "## Estado de los servicios", "", "| Puerto | Servicio | Estado | PID |", "|---|---|---|---|",
  "| 5000 | Puente Python | OK | 8116 |", "", "## Trabajo pendiente", "",
  "- **Trabajo pendiente:** NINGUNO", "", "Todos los servicios responden. No hay nada que reanudar.", "",
  "## Como se comprueba", "", "```", "netstat -ano -p tcp | findstr \":5000 \"", "```",
].join("\n");
c("\u2605 el REANUDAR.md REAL del disco del usuario no produce trabajo", parsearReanudar(parteReal).length === 0,
  JSON.stringify(parsearReanudar(parteReal)));
const sobreParte = decidirAutoLlamado({ ...base, reanudar: parteReal });
c("y la decisión sobre ese parte es callar, con origen honesto",
  sobreParte.accion === "callar" && sobreParte.origen === "nada", sobreParte.motivo);
c("una frase suelta tipo «no hay servicios caídos» tampoco es una orden",
  parsearReanudar("## Trabajo pendiente\n- no hay servicios caidos\n").length === 0);
c("los items reales si entran, con la etiqueta de seccion suelta (lo que importa es el cuerpo)",
  parsearReanudar("## Trabajo pendiente\n- **Trabajo pendiente:** levantar el puente :5000\n- revisar el embedder\n")
    .join("|") === "levantar el puente :5000|revisar el embedder",
  JSON.stringify(parsearReanudar("## Trabajo pendiente\n- **Trabajo pendiente:** levantar el puente :5000\n")));
c("y no se traga la seccion siguiente (lo de «Como se comprueba» no es trabajo)",
  parsearReanudar("## Trabajo pendiente\n- levantar el puente\n\n## Como se comprueba\n- netstat\n").length === 1);
c("el parte tiene techo de lineas (es un parte, no un manual)",
  parsearReanudar("## Trabajo pendiente\n" + Array.from({ length: 30 }, (_, i) => `- tarea ${i}`).join("\n")).length === MAX_LINEAS_REANUDAR);

console.log("\n3) Llamar: que dice y de donde saco el trabajo\n");
c("\u2605 con etapas abiertas llama y nombra la PRIMERA, no un «segu\u00ed» hueco",
  conPlan.accion === "llamar" && /escribir el LEEME/.test(conPlan.mensaje || ""), conPlan.mensaje || "");
c("el origen es el plan cuando el plan existe", conPlan.origen === "plan");
c("el mensaje avisa que es el motor hablandose a si mismo (traza, no misterio)",
  /^\[auto\]/.test(conPlan.mensaje || ""), (conPlan.mensaje || "").slice(0, 40));
c("y descuenta la re-entrada que esta gastando", conPlan.restantes === TOPE_AUTO_LLAMADOS - 1, String(conPlan.restantes));
const ultimoIntento = decidirAutoLlamado({ ...base, plan: [P("2", "escribir el LEEME")], llamadosHechos: TOPE_AUTO_LLAMADOS - 1 });
c("en la ultima re-entrada exige informe honesto en vez de prometer mas vuelta",
  /ltima re-entrada|informe honesto/.test(ultimoIntento.mensaje || ""), ultimoIntento.mensaje || "");
c("sin plan pero con parte pendiente, igual llama (la mitad de los casos no usa planificador)",
  (() => { const d = decidirAutoLlamado({ ...base, reanudar: "## Trabajo pendiente\n- levantar el puente :5000\n" }); return d.accion === "llamar" && d.origen === "reanudar"; })());
c("un trabajo hecho no es pendiente: todo el plan cerrado no llama",
  decidirAutoLlamado({ ...base, plan: [P("1", "a", "done"), P("2", "b", "failed")] }).accion === "callar");

console.log("\n4) Las dos fronteras de seguridad: costo y estancamiento\n");
const agotado = decidirAutoLlamado({ ...base, plan: [P("2", "A"), P("3", "B")], llamadosHechos: TOPE_AUTO_LLAMADOS });
c("\u2605 agotado el tope: no llama, entrega el informe honesto con las abiertas",
  agotado.accion === "agotar" && /Se agot/.test(agotado.mensaje || "") && /2 tarea\(s\) abiertas/.test(agotado.mensaje || ""),
  agotado.mensaje || "");
c("y el motivo dice cuantas re-entradas se gastaron", /agotaron las 2 re-entrada/.test(agotado.motivo), agotado.motivo);
const sellado = firmarTrabajo(["#2 A", "#3 B"], "no pude");
const estancado = decidirAutoLlamado({ ...base, plan: [P("2", "A"), P("3", "B")], conclusion: "no pude", sellosPrevios: [sellado] });
c("\u2605 el mismo trabajo con la misma conclusion firma igual y NO re-entra",
  estancado.sello === sellado && estancado.accion === "callar" && /firma igual/.test(estancado.motivo), estancado.motivo);
const avance = decidirAutoLlamado({ ...base, plan: [P("3", "otra cosa distinta")], conclusion: "avance real" });
c("trabajo distinto firma distinto (la guarda no cierra la puerta a todo)", avance.sello !== sellado);
c("la huella ignora los numeros a proposito: re-numerar la misma tarea no es aprender",
  firmarTrabajo(["#1 escribir el LEEME"], "x") === firmarTrabajo(["#7 escribir el LEEME"], "x"));
const malCerrado = decidirAutoLlamado({ ...base, plan: [P("2", "A")], turnoFallo: true });
c("si el turno cerro mal calla: ahi manda la escalera de reparacion, no una re-entrada",
  malCerrado.accion === "callar" && /escalera/.test(malCerrado.motivo), malCerrado.motivo);
c("con tope cero no hay autollamado posible aunque este prendido",
  decidirAutoLlamado({ ...base, plan: [P("2", "A")], tope: 0 }).accion === "agotar");

console.log("\n5) Forma del organo (pureza, duenos unicos y linea para el panel)\n");
const fuente = leer("src/engine/autoLlamado.ts");
c("\u2605 puro: sin fs, sin red, sin reloj (quien lee el parte y encola el mensaje es el cable)",
  !/node:fs|node:http|node:net|Date\.now|new Date\(/.test(fuente));
c("reusa la huella de `ouroboros` en vez de abrir un cuarto FNV en la casa",
  /import \{ huellaError \} from "\.\/ouroboros"/.test(fuente) && !/0x811c9dc5|16777619/.test(fuente));
c("reusa `informeHonesto` (la misma voz del bucle al rendirse, no una copia)",
  /informeHonesto/.test(fuente) && !/Quedan \$\{/.test(fuente));
c("notaParaPanel nombra las tres acciones sin inventarse cifras",
  /🔁/.test(notaParaPanel(conPlan)) && /⏱/.test(notaParaPanel(agotado)) && /sin re-entrada/.test(notaParaPanel(malCerrado)),
  notaParaPanel(conPlan));
const senalFija = { ...base, plan: [P("2", "escribir el LEEME"), P("3", "verificar")], conclusion: "parcial" };
c("determinismo: la misma senal produce la misma decision, byte a byte",
  JSON.stringify(decidirAutoLlamado(senalFija)) === JSON.stringify(decidirAutoLlamado(senalFija)));
c("y el sello no cambia entre corridas (sin reloj ni azar, el estancamiento se puede detectar)",
  firmarTrabajo(["a"], "x") === firmarTrabajo(["a"], "x") && firmarTrabajo(["a"], "x").length >= 4);

const veredicto = `\n=== AUTO LLAMADO (v1.99.7): ${ok} correctas - ${mal.length} fallidas ===`;
console.log(veredicto);
if (mal.length) { console.log("\nFALLOS:"); for (const f of mal) console.log("  FALLO -> " + f); process.exit(1); }
