import {
  planDeLanzado,
  esLanzadoReciente,
  notaDelLanzado,
  etiquetaDeLaFila,
  hayLanzadoAlFrente,
  VIGENCIA_DEL_LANZADO_MS,
} from "../src/engine/lanzarEnCola";

/**
 * suite: lanzarEnCola
 * - "Lanzar este mensaje ahora" no puede cortar el turno en curso, no puede
 *   perder el mensaje y no puede decir «lanzado» cuando no salió.
 */

let ok = 0;
const fallos: string[] = [];
function check(nombre: string, cond: boolean, detalle = "") {
  if (cond) ok++;
  else fallos.push(`${nombre}${detalle ? " — " + detalle : ""}`);
}

const AHORA = 1_700_000_000_000;
const cola = () => [
  { id: "a", text: "primero" },
  { id: "b", text: "el del boton lanzar" },
  { id: "c", text: "tercero" },
];

// 1) Con turno en vuelo: al frente, sin abortar, sin perder nada
{
  const p = planDeLanzado(cola(), "b", true, AHORA);
  check("con turno en vuelo: destino al-frente", p.destino === "al-frente", p.destino);
  check("con turno en vuelo: saleYa false (no aborta)", p.saleYa === false);
  check("con turno en vuelo: queda el primero", p.cola[0].id === "b");
  check("con turno en vuelo: los 3 siguen en la cola", p.cola.length === 3);
  check("con turno en vuelo: orden del resto intacto", p.cola[1].id === "a" && p.cola[2].id === "c");
  check("con turno en vuelo: lleva marca lanzadoEn", p.mensaje?.lanzadoEn === AHORA);
  check("con turno en vuelo: aviso dice «sin cortarlo»", /sin cortarlo/.test(p.aviso), p.aviso);
  check("con turno en vuelo: no muta la cola original", cola()[1].id === "b" && planDeLanzado(cola(), "b", true, AHORA).cola !== cola());
}

// 2) Sin turno en vuelo: sale en el acto y sale de la cola
{
  const p = planDeLanzado(cola(), "b", false, AHORA);
  check("sin turno: destino en-el-acto", p.destino === "en-el-acto", p.destino);
  check("sin turno: saleYa true", p.saleYa === true);
  check("sin turno: ya no está en la cola", !p.cola.some((m) => m.id === "b"));
  check("sin turno: quedan 2", p.cola.length === 2);
  check("sin turno: mensaje con texto", p.mensaje?.text === "el del boton lanzar");
  check("sin turno: aviso dice «sale ahora»", /sale ahora/.test(p.aviso), p.aviso);
}

// 3) El mensaje ya no está: se avisa la verdad, no se inventa nada
{
  const p = planDeLanzado(cola(), "zzz", true, AHORA);
  check("no-esta: destino", p.destino === "no-esta");
  check("no-esta: mensaje null", p.mensaje === null);
  check("no-esta: cola intacta", p.cola.length === 3);
  check("no-esta: aviso honesto", /ya no está/.test(p.aviso), p.aviso);
}

// 4) Cola vacía o basura no rompe
{
  check("cola vacía: no-esta", planDeLanzado([], "a", true, AHORA).destino === "no-esta");
  check("cola null: no rompe", planDeLanzado(null as any, "a", true, AHORA).destino === "no-esta");
}

// 5) Ya en la posición 0 con turno en vuelo: antes era «cambio nulo» invisible
{
  const p = planDeLanzado(cola(), "a", true, AHORA);
  check("ya al frente: se marca igual", p.cola[0].id === "a" && p.cola[0].lanzadoEn === AHORA);
  check("ya al frente: hayLanzadoAlFrente true", hayLanzadoAlFrente(p.cola) === true);
}

// 6) Vigencia de la marca
{
  const m = { lanzadoEn: AHORA };
  check("vigente: hace 0ms", esLanzadoReciente(m, AHORA) === true);
  check("vigente: justo en el límite", esLanzadoReciente(m, AHORA + VIGENCIA_DEL_LANZADO_MS) === true);
  check("caducada: límite + 1", esLanzadoReciente(m, AHORA + VIGENCIA_DEL_LANZADO_MS + 1) === false);
  check("marca futura: no vigente", esLanzadoReciente(m, AHORA - 1000) === false);
  check("sin marca: no vigente", esLanzadoReciente({}, AHORA) === false);
  check("null: no vigente", esLanzadoReciente(null, AHORA) === false);
  check("VIGENCIA es 10 min", VIGENCIA_DEL_LANZADO_MS === 600_000);
}

// 7) Nota que viaja al modelo: sólo si fue lanzado y sigue vigente
{
  const nota = notaDelLanzado({ lanzadoEn: AHORA }, AHORA);
  check("nota: existe si vigente", typeof nota === "string" && nota!.length > 40);
  check("nota: pide juntar", /continúa desde ahí/.test(nota || ""), nota || "");
  check("nota: no repetir", /no repitas trabajo ya escrito/.test(nota || ""));
  check("nota: caducada es null", notaDelLanzado({ lanzadoEn: AHORA }, AHORA + VIGENCIA_DEL_LANZADO_MS + 1) === null);
  check("nota: mensaje normal es null", notaDelLanzado({}, AHORA) === null);
}

// 8) Etiqueta de la fila (lo que se VE en la cola)
{
  const enVuelo = etiquetaDeLaFila(AHORA, true, AHORA);
  check("etiqueta en vuelo: dice al terminar", /sale al terminar/.test(enVuelo.texto), enVuelo.texto);
  check("etiqueta en vuelo: tono lanzado", enVuelo.tono === "lanzado");
  const enElActo = etiquetaDeLaFila(AHORA, false, AHORA);
  check("etiqueta sin turno: dice saliendo", /saliendo/.test(enElActo.texto), enElActo.texto);
  check("etiqueta sin marca: vacía", etiquetaDeLaFila(undefined, true, AHORA).texto === "");
  check("etiqueta caducada: vacía", etiquetaDeLaFila(AHORA, true, AHORA + VIGENCIA_DEL_LANZADO_MS + 1).texto === "");
}

// 9) hayLanzadoAlFrente: sólo el primero cuenta
{
  check("al frente: true", hayLanzadoAlFrente([{ id: "x", text: "", lanzadoEn: AHORA }]) === true);
  check("no es el primero: false", hayLanzadoAlFrente([{ id: "y", text: "" }, { id: "x", text: "", lanzadoEn: AHORA }]) === false);
  check("cola vacía: false", hayLanzadoAlFrente([]) === false);
  check("null: false", hayLanzadoAlFrente(null) === false);
}

// 10) El flujo completo: lanzar con turno vivo y luego desencolar deja el mensaje ENTERO
{
  const p = planDeLanzado(cola(), "b", true, AHORA);
  // el desencolador de fin de turno toma el primero y le prepende la nota
  const [siguiente] = p.cola;
  const nota = notaDelLanzado(siguiente, AHORA + 2000) ?? "";
  const enviado = nota ? `${nota}\n\n${siguiente.text}` : siguiente.text;
  check("flujo: el mensaje sale entero", enviado.includes("el del boton lanzar"));
  check("flujo: con la nota de juntar", enviado.startsWith("MENSAJE LANZADO DESDE LA COLA"));
  check("flujo: nada perdido", p.cola.length === 3);
}

console.log(`\n${ok} correctas · ${fallos.length} fallos`);
if (fallos.length) {
  for (const f of fallos) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("lanzarEnCola: el botón no corta, no pierde y no miente");
