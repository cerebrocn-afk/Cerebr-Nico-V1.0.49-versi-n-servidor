/**
 * tarjetaFlotante.test.ts — GEOMETRÍA DE LAS TARJETAS PORTALEADAS (v1.98.0)
 * =========================================================================
 * Nace de dos quejas con captura del 31/10 sobre el cambiador de voz:
 *   · «no abre el cambiador de voces» → el fuera-clic del menú que contiene al
 *     gatillo se comía la tarjeta (vive en `body`, no dentro del menú).
 *   · «a veces intenta abrir pero al otro lado de la pantalla, a la derecha» →
 *     rect 0×0 + anclaje por borde derecho.
 * La cuenta es pura a propósito: en el navegador depende de EN QUÉ FRAME se mide,
 * y lo que depende del frame no se reproduce a pedido. Acá se prueban los marcos.
 *
 * (1) esRectVivible: el 0×0 del no-pintado, NaN, y el rect legible
 * (2) calcularAncla: nunca sale de la ventana; se ancla por la IZQUIERDA; se vuelca
 *     arriba cuando abajo no cabe; y devuelve `null` (no una esquina) sin geometría
 * (3) determinismo: misma entrada, misma ancla, enteros
 * (4) esTarjetaFlotante: el clic dentro de una tarjeta flotante no es "afuera", y no
 *     explota con nodos raros
 * (5) ANTI-HOJA-MUERTA: el motor se usa de verdad — el TTS llamó a la cuenta vieja
 *     y esa fórmula ya no puede volver; todo el que se portal-ea se anuncia
 * (6) la suite está registrada en el ritual
 */
import {
  ALTO_TARJETA_POR_DEFECTO,
  ANCHO_TARJETA_POR_DEFECTO,
  ATRIBUTO_TARJETA_FLOTANTE,
  MARGEN_VENTANA,
  SELECTOR_TARJETA_FLOTANTE,
  SEPARACION,
  calcularAncla,
  esRectVivible,
  esTarjetaFlotante,
  type Rect,
} from "../src/engine/tarjetaFlotante";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + String(d).split("\n")[0].slice(0, 220) : "")); };

const rect = (top: number, left: number, width = 140, height = 26): Rect => ({
  top,
  left,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const VENTANA = { ancho: 1400, alto: 700 };
const TARJETA = { ancho: ANCHO_TARJETA_POR_DEFECTO, alto: ALTO_TARJETA_POR_DEFECTO };
const dentroDeLaVentana = (a: { top: number; left: number } | null, m = TARJETA, v = VENTANA): boolean =>
  !!a && a.left >= MARGEN_VENTANA && a.top >= MARGEN_VENTANA && a.left + m.ancho <= v.ancho - MARGEN_VENTANA;

// ── 1 · el rect "todavía no pintó" ──────────────────────────────────────────
comprobar("un rect 0×0 no es geometría (el bug del «otro lado de la pantalla»)", esRectVivible(rect(0, 0, 0, 0)) === false);
comprobar("sin rect no hay ancla", esRectVivible(null) === false && esRectVivible(undefined) === false);
comprobar("un NaN no se cuela (se propaga a la posición y la tarjeta se va del documento)", esRectVivible({ ...rect(10, 10), width: NaN }) === false);
comprobar("un Infinity tampoco", esRectVivible({ ...rect(10, 10), bottom: Infinity }) === false);
comprobar("un rect por encima del documento (derecha negativa) no sirve", esRectVivible({ ...rect(10, -500), width: 10, height: 10 }) === false);
comprobar("un rect legible sí es vivible", esRectVivible(rect(300, 120)) === true);
comprobar("un gatillo de ancho cero pero con altura (un botón colapsado) no es 0×0", esRectVivible(rect(300, 120, 0, 26)) === true);

// ── 2 · la cuenta ───────────────────────────────────────────────────────────
// El caso real: el menú CN a la izquierda (x≈100). La fórmula vieja anclaba por el
// borde derecho (`right: innerWidth - r.right`) y con esa posición la tarjeta de 288px
// nacía con el borde izquierdo FUERA de la pantalla.
const a = calcularAncla(rect(300, 120), TARJETA, VENTANA);
comprobar("con el gatillo a la izquierda la tarjeta cabe entera (no nace cortada)", dentroDeLaVentana(a), JSON.stringify(a));
comprobar("se alinea a la izquierda del gatillo, no a su borde derecho", a?.left === 120, JSON.stringify(a));
comprobar("cae justo debajo del gatillo con la respiración pactada", a?.top === 300 + 26 + SEPARACION, JSON.stringify(a));
comprobar("abajo cabía: no se volcó", a?.arriba === false);

// Gatillo a media altura de una ventana baja: abajo no entra → se vuelca arriba.
const b = calcularAncla(rect(640, 120), TARJETA, VENTANA);
comprobar("si el gatillo está abajo del todo, la tarjeta sale hacia arriba", b?.arriba === true, JSON.stringify(b));
comprobar("volcada, sigue adentro de la ventana", !!b && b.top >= MARGEN_VENTANA && b.top + TARJETA.alto <= VENTANA.alto - MARGEN_VENTANA + 1, JSON.stringify(b));
comprobar("el volteo deja la tarjeta por encima del gatillo", !!b && b.top + TARJETA.alto + SEPARACION <= 640 + 1, JSON.stringify(b));

// Borde derecho de la pantalla.
const c = calcularAncla(rect(100, 1300), TARJETA, VENTANA);
comprobar("un gatillo pegado a la derecha no empuja la tarjeta afuera", dentroDeLaVentana(c), JSON.stringify(c));
comprobar("en ese caso la tarjeta se pega al margen derecho", c?.left === VENTANA.ancho - TARJETA.ancho - MARGEN_VENTANA, JSON.stringify(c));

// Ventana más angosta que la tarjeta: no hay posición válida → margen, nunca negativo.
const d = calcularAncla(rect(300, 120), TARJETA, { ancho: 300, alto: 700 });
comprobar("una ventana más angosta que la tarjeta no da left negativo", d?.left === MARGEN_VENTANA, JSON.stringify(d));

// Tarjeta más alta que la ventana: se ancla arriba, no se cuelga por arriba del documento.
const e = calcularAncla(rect(300, 120), { ancho: 288, alto: 900 }, VENTANA);
comprobar("una tarjeta más alta que la ventana no queda con top negativo", !!e && e.top >= MARGEN_VENTANA, JSON.stringify(e));

// Sin geometría, la respuesta es "no sé" (y el llamador espera), no una esquina al azar.
comprobar("rect 0×0 → null, no una esquina", calcularAncla(rect(0, 0, 0, 0), TARJETA, VENTANA) === null);
comprobar("ventana basura → null (nunca un ancla inventada)", calcularAncla(rect(10, 10), TARJETA, { ancho: 0, alto: 0 }) === null && calcularAncla(rect(10, 10), TARJETA, { ancho: NaN, alto: 700 }) === null);
comprobar("medidas basura caen al alto/ancho conocidos de la casa", (() => {
  const x = calcularAncla(rect(300, 120), { ancho: 0, alto: -3 }, VENTANA);
  return !!x && x.top === 300 + 26 + SEPARACION;
})());

// ── 3 · determinismo ────────────────────────────────────────────────────────
comprobar("misma entrada, misma ancla (si no, la tarjeta tiembla al pintar)", JSON.stringify(calcularAncla(rect(300, 120), TARJETA, VENTANA)) === JSON.stringify(calcularAncla(rect(300, 120), TARJETA, VENTANA)));
comprobar("las coordenadas son enteras (un subpíxel en `fixed` es un borde borroso)", (() => {
  const x = calcularAncla(rect(301, 121.7), TARJETA, VENTANA);
  return !!x && Number.isInteger(x.top) && Number.isInteger(x.left);
})());

// ── 4 · el clic dentro de la tarjeta no es "afuera" ─────────────────────────
comprobar("dentro de una tarjeta flotante se reconoce", esTarjetaFlotante({ closest: (s) => s === SELECTOR_TARJETA_FLOTANTE ? {} : null }) === true);
comprobar("fuera de una tarjeta flotante no se inventa", esTarjetaFlotante({ closest: () => null }) === false);
comprobar("sin elemento no se cierra el mundo", esTarjetaFlotante(null) === false && esTarjetaFlotante(undefined) === false);
comprobar("un nodo sin `closest` (texto, documento) no rompe el fuera-clic", esTarjetaFlotante({}) === false);
comprobar("un `closest` que explode no derriba el menú", esTarjetaFlotante({ closest: () => { throw new Error("nodo desconectado"); } }) === false);
comprobar("el selector se deriva del atributo (una sola fuente, no dos literales)", SELECTOR_TARJETA_FLOTANTE === `[${ATRIBUTO_TARJETA_FLOTANTE}]`);

// ── 5 · anti-hoja-muerta: la cuenta vieja no puede volver ──────────────────
const leido = (f: string) => fs.readFileSync(path.join(RAIZ, "src", "components", f), "utf8");
/* Solo el código, sin la prosa. La valla de «esta fórmula no vuelve» tiene que mirar
   lo que se ejecuta: si no, escribir en un comentario CUÁL era la fórmula vieja —que
   es exactamente lo que hay que poder explicar— la haría saltar. */
const sinComentarios = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const tts = leido("TtsSelector.tsx");
const ttsCodigo = sinComentarios(tts);
const header = leido("Header.tsx");

comprobar("el TTS usa el motor de anclas de la casa", /from "\.\.\/engine\/tarjetaFlotante"/.test(tts) && /calcularAncla\(/.test(ttsCodigo));
comprobar("el TTS consulta si el rect pintó antes de anclar", /esRectVivible\(/.test(ttsCodigo));
comprobar("LA FÓRMULA VIEJA MUERIÓ: ya no se ancla contra el borde derecho de la ventana", !/innerWidth\s*-\s*r\.right/.test(ttsCodigo));
comprobar("ya no existe la esquina de reserva (top:96,right:24) que ponía la tarjeta al otro lado", !/top:\s*96/.test(ttsCodigo));
comprobar("si el rect no llega, se reintenta en el frame en vez de pintar al azar", /requestAnimationFrame\(/.test(ttsCodigo));
comprobar("la tarjeta se recorta a la ventana y puede scrollear (el tono ya no se corta)", /max-w-\[calc\(100vw/.test(tts) && /max-h-\[calc\(100vh/.test(tts));
comprobar("la tarjeta del TTS se anuncia como flotante (el literal coincide con la constante)", tts.includes(`${ATRIBUTO_TARJETA_FLOTANTE}="voz"`));
comprobar("el fuera-clic del menú CN respeta las tarjetas flotantes", /esTarjetaFlotante\(/.test(header) && /from "\.\.\/engine\/tarjetaFlotante"/.test(header));
comprobar("la guarda vive en el mismo efecto que cierra el menú (no en otro lado, mudita)", /handleClickOutside[\s\S]{0,400}esTarjetaFlotante\(/.test(header));

// Todo el que se portal-ea tiene que annunciarse: si mañana aparece un cuarto panel
// y no lleva el atributo, el menú que lo contenga se lo va a comer otra vez.
const componentes = fs.readdirSync(path.join(RAIZ, "src", "components")).filter((f) => f.endsWith(".tsx"));
const portaleados = componentes.filter((f) => leido(f).includes("createPortal"));
for (const f of portaleados) {
  comprobar(`${f} se portal-ea y por lo tanto se anuncia como tarjeta flotante`, leido(f).includes(ATRIBUTO_TARJETA_FLOTANTE + "="));
}
comprobar("los portaleados son los que se conocen (si crecen, este test los nombra)", portaleados.length === 3, "portaleados: " + portaleados.join(", "));

// ── 6 · registrada en el ritual ─────────────────────────────────────────────
const validar = fs.readFileSync(path.join(RAIZ, "scripts", "validar.mjs"), "utf8");
comprobar("esta suite corre en el ritual (nada vivo fuera de validar.mjs)", /archivo: "tests\/tarjetaFlotante\.test\.ts"/.test(validar));

console.log(`\ntarjetaFlotante: ${correctas} correctas, ${fallos.length} fallos`);
for (const f of fallos) console.log("  ✗ " + f);
process.exit(fallos.length ? 1 : 0);
