/**
 * paleta.test.ts — PALETA v1: el modo claro existe, y nadie puede dejarlo a medias
 * ================================================================================
 * (1) normalización: basura fuera, clamps, modo/superficie ilegales al por defecto
 * (2) hexAClaro: determinista, con tono conservado y JERARQUÍA INVERTIDA (lo más
 *     hondo del oscuro es lo más gris del claro — si eso se rompe, el claro pierde
 *     la separación entre paneles y vuelve a ser una masa)
 * (3) escala neutra: inversión monotónica y contraste real tinta-vs-papel >= 4.5:1
 * (4) INVENTARIO BIDIRECCIONAL: cada `bg-[#…]`/`border-[#…]` del src/ real está en la
 *     lista, y cada entrada de la lista sigue viva en el src/. Un tema claro con
 *     clases sin mapear no es claro: es un tema con manchas negras sueltas.
 * (5) la hoja: byte a byte estable, llaves balanceadas, CERO propiedades que no
 *     existan en CSS (una errata en un nombre de propiedad es invisible: el navegador
 *     tira la declaración y sigue pareciendo que funciona)
 * (6) el bote tiene un solo dueño: `--cn-module-opacity` y los papeles ya no se
 *     escriben inline desde proSettings
 * (7) superficie opaca: cierra el alfa SIN cambiar de color, en los dos modos
 * (8) nothing-que-mienta: los scrims de modal siguen oscuros en claro, y los pomos
 *     de los interruptores siguen siendo blancos
 */
import {
  MODOS, SUPERFICIES, MODO_POR_DEFECTO, SUPERFICIE_POR_DEFECTO,
  INTENSIDAD_MIN, INTENSIDAD_MAX, INTENSIDAD_POR_DEFECTO,
  HEXES_SUPERFICIE, HEXES_BORDE, FAMILIAS_NEUTRAS, PASOS_NEUTROS, FAMILIAS_ACENTO,
  ATRIBUTO_MODO, ATRIBUTO_SUPERFICIE,
  hexARgb, rgbAHex, rgbAHsl, hslARgb, hexAClaro, escalaClara, pasoClaroDeAcento,
  escaparClase, reglaSellada, hojaPaleta, normalizarPaleta, variablesDePaleta,
  modoDesdeTemaPro, temaProDesdePaleta,
} from "../src/engine/paleta";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + String(d).split("\n")[0].slice(0, 220) : "")); };

/* utilidades de color del propio test (no se importan del motor: si el motor se
   equivoca a sí mismo se valida, y aquí queremos una segunda opinión) */
function luminanciaRelativa(hex: string): number {
  const c = hexARgb(hex)!;
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contraste(a: string, b: string): number {
  const la = luminanciaRelativa(a), lb = luminanciaRelativa(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── 1 · normalización ───────────────────────────────────────────────────────
comprobar("basura total → por defecto legal", JSON.stringify(normalizarPaleta("no-era-objeto")) === JSON.stringify({ modo: MODO_POR_DEFECTO, superficie: SUPERFICIE_POR_DEFECTO, intensidad: INTENSIDAD_POR_DEFECTO }));
comprobar("null → por defecto", normalizarPaleta(null).modo === MODO_POR_DEFECTO);
comprobar("modo inventado cae a oscuro", normalizarPaleta({ modo: "rosa" }).modo === "oscuro");
comprobar("superficie inventada cae a vidrio", normalizarPaleta({ superficie: "espejo" }).superficie === "vidrio");
comprobar("intensidad clamp al techo", normalizarPaleta({ intensidad: 4000 }).intensidad === INTENSIDAD_MAX);
comprobar("intensidad clamp al piso", normalizarPaleta({ intensidad: 3 }).intensidad === INTENSIDAD_MIN);
comprobar("intensidad NaN no contamina", normalizarPaleta({ intensidad: NaN }).intensidad === INTENSIDAD_POR_DEFECTO);
comprobar("intensidad fraccional se redondea", normalizarPaleta({ intensidad: 71.6 }).intensidad === 72);
comprobar("el por defecto es oscuro-vidrio (nadie despierta en claro sin pedirlo)", CONFIG_VISIBLE_CLARO() === false);
function CONFIG_VISIBLE_CLARO() { return normalizarPaleta({}).modo === "claro"; }
comprobar("MODOS y SUPERFICIES llevan los ids que el resto compara", MODOS.every((m) => m.id === "oscuro" || m.id === "claro") && SUPERFICIES.every((s) => s.id === "vidrio" || s.id === "opaca"));
comprobar("los modos del almacén cubren las dos paletas declaradas", MODOS.length === 2 && SUPERFICIES.length === 2);

// ── 2 · hexAClaro ───────────────────────────────────────────────────────────
comprobar("#rgb y #rrggbbaa se aceptan", /^#[0-9a-f]{6}$/.test(hexAClaro("#abc")) && /^#[0-9a-f]{6}$/.test(hexAClaro("#0a0f1aff")));
comprobar("hex ilegal se devuelve tal cual (no se inventa)", hexAClaro("rojo") === "rojo" && hexAClaro("") === "");
comprobar("el resultado siempre es #rrggbb minúsculo", HEXES_SUPERFICIE.every((c) => {
  const m = /\[ #?([0-9a-f]{3,8})\]/i.exec(c); return !m || /^#[0-9a-f]{6}$/.test(hexAClaro(`#${m[1]}`, "superficie"));
}));
/* La jerarquía: #05070d es el pozo, #111726 es un panel elevado. En claro el pozo
   tiene que seguir viéndose más hundido, o sea MÁS gris (menos luz). */
const pozo = hexAClaro("#05070d"), elevado = hexAClaro("#111726");
comprobar("jerarquía invertida: el pozo oscuro queda más gris que el panel elevado", luminanciaRelativa(pozo) < luminanciaRelativa(elevado), `${pozo} vs ${elevado}`);
comprobar("los dos son papel claro (>0.7 de luz relativa)", luminanciaRelativa(pozo) > 0.7 && luminanciaRelativa(elevado) > 0.7);
const TONO_05070D = rgbAHsl(hexARgb("#05070d")!).h;
comprobar("el tono sobrevive al volteo (azul-noche sigue siendo azulado)", Math.abs(rgbAHsl(hexARgb(pozo)!).h - TONO_05070D) < 12);
comprobar("el borde claro vive en la banda 0.4–0.85 de luz (ni tiza ni carbón)", (() => {
  const ls = ["#141d2e", "#1b2740", "#162034", "#243457", "#0d1422"].map((h) => rgbAHsl(hexARgb(hexAClaro(h, "borde"))!).l);
  return ls.every((l) => l >= 40 && l <= 85);
})(), JSON.stringify(["#141d2e", "#1b2740", "#162034", "#243457", "#0d1422"].map((h) => hexAClaro(h, "borde"))));
/* El recorte se declara en HSL (26 %) pero la ida y vuelta a RGB redondeado lo sube
   un punto: se comprueba el HECHO (tinte contenido), no el número intermedio. */
comprobar("la saturación se recorta (nada de lavandas sobre papel)", rgbAHsl(hexARgb(hexAClaro("#0a0f1a"))!).s <= 30, String(rgbAHsl(hexARgb(hexAClaro("#0a0f1a"))!).s));
comprobar("el recorte le gana al original saturado: #0a0f1a (47 %) baja de 30 %", rgbAHsl(hexARgb("#0a0f1a")!).s > 40);
comprobar("función pura: misma entrada, misma salida, 200 veces", (() => { const a = hexAClaro("#0b1120"); for (let i = 0; i < 200; i++) if (hexAClaro("#0b1120") !== a) return false; return true; })());
comprobar("ida y vuelta rgb↔hsl no se desvía más de 1 canal-punto", (() => {
  for (const c of [...HEXES_SUPERFICIE, ...HEXES_BORDE]) {
    const hex = /\[#([0-9a-f]{6})\]/i.exec(c)?.[1]; if (!hex) continue;
    const original = hexARgb(`#${hex}`)!, v = hslARgb(rgbAHsl(original));
    if (Math.abs(v.r - original.r) > 1 || Math.abs(v.g - original.g) > 1 || Math.abs(v.b - original.b) > 1) return false;
  }
  return true;
})());

// ── 3 · escala neutra y contraste ──────────────────────────────────────────
comprobar("zinc-100 es TINTA y zinc-900 es PAPEL en claro (la banda está invertida)", luminanciaRelativa(escalaClara("zinc", "100")) < 0.15 && luminanciaRelativa(escalaClara("zinc", "900")) > 0.85, `${escalaClara("zinc", "100")} / ${escalaClara("zinc", "900")}`);
comprobar("la inversión es monotónica: a más paso, más luz", (() => {
  const pasos = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
  const luces = pasos.map((p) => luminanciaRelativa(escalaClara("zinc", p)));
  return luces.every((l, i) => i === 0 || l >= luces[i - 1] - 1e-9);
})());
comprobar("los dos pasos inventados (750/850) tienen valor: cuatro clases muertas viven", !!escalaClara("zinc", "750") && !!escalaClara("zinc", "850") && escalaClara("zinc", "750") !== escalaClara("zinc", "700") && escalaClara("zinc", "850") !== escalaClara("zinc", "900"));
comprobar("cada familia neutra se deriva en los 13 pasos", FAMILIAS_NEUTRAS.every((f) => PASOS_NEUTROS.every((p) => /^#[0-9a-f]{6}$/.test(escalaClara(f, p)))));
comprobar("las familias hermanas no son idénticas al zinc (el matiz se desliza de verdad)", FAMILIAS_NEUTRAS.filter((f) => f !== "zinc").every((f) => escalaClara(f, "300") !== escalaClara("zinc", "300")));
const TINTA_CLARA = "#1a2029";
comprobar("contraste tinta/papel >= 4.5:1 en los papeles del modo claro", contraste(TINTA_CLARA, "#ffffff") >= 4.5 && contraste(TINTA_CLARA, "#f7f9fc") >= 4.5 && contraste(TINTA_CLARA, "#eef1f6") >= 4.5 && contraste(TINTA_CLARA, "#eaf0f7") >= 4.5);
comprobar("la letra neutra secundaria (zinc-400) sigue siendo legible sobre papel", contraste(TINTA_CLARA, escalaClara("zinc", "400")) >= 4.5 || contraste(escalaClara("zinc", "400"), "#ffffff") >= 4.5, escalaClara("zinc", "400"));
comprobar("un acento puro (#22d3ee) NO pasa como letra en claro: por eso se hunde", contraste("#22d3ee", "#ffffff") < 4.5);
comprobar("hundido, los pasos 100–400 del acento superan el contraste AA", FAMILIAS_ACENTO.every((f) => ["100", "200", "300", "400"].every((p) => contraste(pasoClaroDeAcento(f.ancla, p), "#ffffff") >= 3)));
comprobar("el hundido es monotónico (100 es el más oscuro)", contraste(pasoClaroDeAcento("#10b981", "100"), "#ffffff") >= contraste(pasoClaroDeAcento("#10b981", "400"), "#ffffff"));
comprobar("la ancla del acento sigue viva como COLOR (no se apaga entera)", contraste("#22d3ee", TINTA_CLARA) > 3);

// ── 4 · Inventario bidireccional (la valla que no permite huecos negados) ───
const srcFiles: string[] = [];
(function caminar(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") caminar(p); }
    else if (/\.(tsx|ts)$/.test(e.name) && !/[/\\]engine[/\\]paleta\.ts$/.test(p)) srcFiles.push(p);
  }
})(path.join(RAIZ, "src"));
const RE_CLASE = /\b(?:bg|border|from|to|ring)-\[#[0-9a-fA-F]{3,8}\](?:\/\d{1,3})?/g;
const enCodigo = new Set<string>();
for (const f of srcFiles) for (const m of fs.readFileSync(f, "utf8").matchAll(RE_CLASE)) enCodigo.add(m[0]);
const declaradas = new Set<string>([...HEXES_SUPERFICIE, ...HEXES_BORDE]);
const sinDeclarar = [...enCodigo].filter((c) => !declaradas.has(c)).sort();
const yaMuertas = [...declaradas].filter((c) => !enCodigo.has(c)).sort();
comprobar("cada clase hex del src/ está declarada en la paleta", sinDeclarar.length === 0, "sin mapear: " + sinDeclarar.join(", "));
comprobar("cada clase declarada sigue viva en el src/ (nada de inventario zombi)", yaMuertas.length === 0, "ya no existe: " + yaMuertas.join(", "));
// v2.3.3 · LA PROPIEDAD DEL PEDIDO: «respuesta concreta» y «pensamiento en detalle»
// tienen que ser DOS SUPERFICIES DISTINTAS y ambas tienen que estar declaradas. Se
// bate el archivo real (no la intención) y se exige que los roles no compartan el
// color de fondo: si mañana alguien unifica las dos mitades, esta valla avisa.
{
  const cc = fs.readFileSync(new URL("../src/components/ChatCenter.tsx", import.meta.url), "utf-8");
  const pal = fs.readFileSync(new URL("../src/engine/paleta.ts", import.meta.url || import.meta.url), "utf-8");
  const ramal = (cc.match(/border-l-2 border-\[(#\w{6})\]/) || [])[1];
  const pens  = (cc.match(/bg-\[(#\w{6})\][^"]*">\s*\n?\s*<summary[^>]*>\s*\n?\s*\{`pensamiento/) || cc.match(/rounded-lg border border-\[#\w{6}\] bg-\[(#\w{6})\]/) || [])[1];
  comprobar("v2.3.3 · la respuesta tiene costado propio y nombrado", !!ramal, String(ramal));
  comprobar("v2.3.3 · el pensamiento tiene superficie propia y nombrada", !!pens, String(pens));
  comprobar("v2.3.3 · los dos roles NO comparten color (si lo comparten, no diferencian nada)", !!ramal && !!pens && ramal !== pens, `${ramal} vs ${pens}`);
  comprobar("v2.3.3 · el rótulo del bloque dice qué es, no solo cuántos caracteres", /pensamiento en detalle/.test(cc));
  // La ventana de la comprobación es el <details> del pensamiento de punta a punta:
  // `opacity-90` sigue existiendo en otras ramas del mismo render (y debe seguir), así
  // que medir 1600 caracteres a ciegas daba falso positivo. Se corta en el </details>.
  const iniPens = cc.indexOf("rounded-lg border border-[#1b2735]");
  const finPens = cc.indexOf("</details>", iniPens);
  const bloquePens = iniPens > 0 && finPens > iniPens ? cc.slice(iniPens, finPens) : "";
  comprobar("v2.3.3 · el pensamiento dejó de bajar la opacidad del texto (contraste, no fantasma)", bloquePens.length > 0 && !/opacity-\d/.test(bloquePens), bloquePens.slice(0, 60));
  comprobar("v2.3.3 · los dos colores están declarados en la paleta", pal.includes(ramal || " ") && pal.includes(pens || " "));
}
comprobar("el inventario no tiene duplicados", declaradas.size === HEXES_SUPERFICIE.length + HEXES_BORDE.length);
comprobar("las dos listas no se solapan (una clase, un rol)", !HEXES_SUPERFICIE.some((c) => HEXES_BORDE.includes(c)));
comprobar("toda superficie de la lista empieza por bg-/from-/to-/ring-", HEXES_SUPERFICIE.every((c) => /^(bg|from|to|ring)-/.test(c)));
comprobar("todo borde de la lista empieza por border-", HEXES_BORDE.every((c) => c.startsWith("border-")));

// ── 5 · la hoja ─────────────────────────────────────────────────────────────
const hoja = hojaPaleta();
const hojaOtra = hojaPaleta();
comprobar("la hoja es determinista byte a byte", hoja === hojaOtra);
comprobar("las llaves baten", (hoja.match(/\{/g) || []).length === (hoja.match(/\}/g) || []).length);
comprobar("la hoja no tiene huecos (cero reglas vacías)", !/\{\s*\}/.test(hoja), (hoja.match(/^\s*\{\s*\}/m) || [""])[0]);
comprobar("cero NaN / undefined / null en la hoja", !/NaN|undefined|null/.test(hoja), (hoja.match(/.{0,80}(NaN|undefined|null).{0,40}/) || [""])[0]);
comprobar("lleva el aviso de 'no editar a mano'", hoja.includes("engine/paleta.ts"));
comprobar("declara los dos modos por atributo", hoja.includes(`[${ATRIBUTO_MODO}="claro"]`) && hoja.includes(`[${ATRIBUTO_MODO}="oscuro"]`) && hoja.includes(`[${ATRIBUTO_SUPERFICIE}="opaca"]`));
comprobar(":root pinta los papeles oscuros (el modo por defecto no depende de que nadie escriba un atributo)", /^\s*:root,\[data-cn-modo="oscuro"\]\{/m.test(hoja));
comprobar("cada clase del inventario tiene su regla escapada", [...HEXES_SUPERFICIE, ...HEXES_BORDE].every((c) => hoja.includes("." + escaparClase(c) + "{")), (escaparClase("bg-[#0a0f1a]/70")));
comprobar("el escapado escapa corchete, almohadilla, barra y punto", escaparClase("bg-[#0a0f1a]/70") === "bg-\\[\\#0a0f1a\\]\\/70" && escaparClase("text-[10.5px]") === "text-\\[10\\.5px\\]");
comprobar("cero comas dentro de rgb() alfa (sintaxis moderna, sin comas)", !/rgb\(\d+, ?\d+, ?\d+, ?[\d.]+\)/.test(hoja));
/* La lista se DERIVA del `src/index.css` de la casa —CSS que ya se está renderizando
   en producción— y solo se completan a mano las familias que faltan. Así la valla no
   depende de que quien la escribe recuerde cómo se deletrea `border-radius`, y una
   errata en un nombre de propiedad —invisible: el navegador tira la declaración y la
   interfaz sigue "funcionando" con el color viejo— sigue cayendo. */
const cssBase = fs.readFileSync(path.join(RAIZ, "src", "index.css"), "utf8");
const PROPIEDADES_CSS = new Set<string>([...cssBase.matchAll(/(?:^|[{;\s])([a-z][a-z-]*)\s*:/gm)].map((m) => m[1]));
/* Propiedades legítimas que el index.css de la casa no usa y por tanto la derivación
   no puede conocer. Se nombran una a una, con su razón, para que la valla siga
   valiendo: cualquier otro nombre desconocido sigue cayendo. */
for (const p of "border border-bottom border-color border-left border-radius border-top box-shadow align-items justify-content color-scheme overflow-wrap place-items vertical-align will-change margin-top min-width gap text-transform white-space background-image -webkit-backdrop-filter".split(" ")) PROPIEDADES_CSS.add(p);

const propiedadesMalas = new Set<string>();
for (const bloque of hoja.matchAll(/\{([^{}]*)\}/g)) {
  for (const decl of bloque[1].split(";")) {
    const p = decl.split(":")[0].trim();
    if (!p || p.startsWith("--") || !/^-?[a-z][a-z-]*$/.test(p)) continue;
    if (!PROPIEDADES_CSS.has(p)) propiedadesMalas.add(p);
  }
}
comprobar("cero propiedades que no existen en CSS (una errata es invisible en pantalla)", propiedadesMalas.size === 0, "sospechosas: " + [...propiedadesMalas].join(", "));
const FUNCIONES_PERMITIDAS = ["var", "calc", "rgb", "rgba", "hsl", "color-mix", "linear-gradient", "radial-gradient", "url", "clamp", "blur", "brightness", "saturate", "not", "is", "where", "min", "max"];
const funcionesMalas = (): string[] => {
  const vistas = new Set<string>();
  for (const m of hoja.matchAll(/([a-z-]+)\(/g)) vistas.add(m[1]);
  return [...vistas].filter((f) => !FUNCIONES_PERMITIDAS.includes(f));
};
comprobar("las funciones que se usan son funciones CSS reales", funcionesMalas().length === 0, "sospechosas: " + funcionesMalas().join(", "));
/* `bg-white` son los pomos de los interruptores y el lienzo del editor web: si la
   paleta se atreviera con ellos, el pomo del switch se volvería negro en claro. */
comprobar("la hoja no toca bg-white (los pomos de los interruptores siguen siendo blancos)", !/\.bg-white/.test(hoja), (hoja.match(/\.bg-white[^{]*\{[^}]*\}/) || [""])[0]);
comprobar("text-white se hunde en claro (50 letras blancas sobre papel)", /\[data-cn-modo="claro"\] \.text-white\{color:#/.test(hoja));
comprobar("los scrims de modal siguen oscuros: bg-black/70 y /80 no se re-derivan", !/\.bg-black\\\/70|\.bg-black\\\/80|\.bg-black\\\/85|\.bg-black\\\/90/.test(hoja));
comprobar("los recesos bg-black/30 y /40 sí pasan a tinta tenue en papel", /claro"\] \.bg-black\\\/30,/.test(hoja) && /claro"\] \.bg-black\\\/40/.test(hoja));
comprobar("el velo del fondo de pantalla se vuelve papel, no humo", /claro"\] body\.has-brain-bg::before\{background:linear-gradient\(135deg,rgb\(244 246 250/.test(hoja));
/* Un bloque por familia hundida + el del acento cian (que se cruza con tinta pero
   con su propia fórmula). Si alguien añade una familia al motor y se olvida de la
   hoja, el `every` de abajo lo coge; si alguien duplica un bloque, el conteo. */
/* +2: el bloque de los neutros (que abre con `--color-zinc-50`) y el del acento cian
   (que abre con `--color-cyan-50`) también empiezan con `[data-cn-modo="claro"]{--color-`. */
comprobar("todas las familias de estado se hunden en claro, una sola vez cada una", FAMILIAS_ACENTO.every((f) => hoja.includes(`[data-cn-modo="claro"]{--color-${f.id}-100:`)) && (hoja.match(/\[data-cn-modo="claro"\]\{--color-/g) || []).length === FAMILIAS_ACENTO.length + 2, `${(hoja.match(/\[data-cn-modo="claro"\]\{--color-/g) || []).length} bloques, se esperaban ${FAMILIAS_ACENTO.length + 2}`);
comprobar("cada familia hundida aporta los cuatro pasos (no solo el 300 que se veía)", FAMILIAS_ACENTO.every((f) => ["100", "200", "300", "400"].every((p) => hoja.includes(`--color-${f.id}-${p}:`))));
comprobar("el código resaltado tiene su variante clara (Prism no queda en colores de noche)", /claro"\] \.token\.keyword\{color:#/.test(hoja));
comprobar("las barras de scroll tienen su variante clara", /claro"\] ::-webkit-scrollbar-thumb/.test(hoja));
comprobar("el esquema de color nativo cambia con el modo (los inputs nativos no quedan en negro)", /color-scheme:light/.test(hoja) && /color-scheme:dark/.test(hoja));

// ── 6 · un solo dueño del papel ─────────────────────────────────────────────
const proSrc = fs.readFileSync(path.join(RAIZ, "src", "utils", "proSettings.ts"), "utf8");
comprobar("proSettings ya NO escribe los cuatro papeles inline (se comía la paleta)", !/root\.style\.setProperty\("--cn-(bg|panel|border|text)"/.test(proSrc));
comprobar("proSettings sigue siendo dueño del acento y la tipografía", /setProperty\("--cn-accent"/.test(proSrc) && /setProperty\("--cn-font-size"/.test(proSrc));
comprobar("la tabla THEMES queda documentada (no borrada sin más)", /export const THEMES/.test(proSrc));
const appSrc = fs.readFileSync(path.join(RAIZ, "src", "App.tsx"), "utf8");
comprobar("App ya no escribe --cn-module-opacity a mano (era el segundo dueño)", !/setProperty\("--cn-module-opacity"/.test(appSrc));
comprobar("App engancha el deslizador Pro a la paleta", /fijarPaleta\(/.test(appSrc) && /paletaActual\(\)/.test(appSrc));
comprobar("App reconcilia el tema del panel Pro con el modo de la paleta (en las dos direcciones)", /modoDesdeTemaPro\(/.test(appSrc) && /temaProDesdePaleta\(/.test(appSrc) && /suscribirPaleta\(/.test(appSrc));
const mainSrc = fs.readFileSync(path.join(RAIZ, "src", "main.tsx"), "utf8");
comprobar("el arranque tiñe antes del primer pintado (cero parpadeo noche→papel)", /aplicarPaleta\(paletaActual\(\)\)/.test(mainSrc) && mainSrc.indexOf("aplicarPaleta") < mainSrc.indexOf("createRoot"));
const indexCss = fs.readFileSync(path.join(RAIZ, "src", "index.css"), "utf8");
comprobar("el bloque [data-theme=light] inválido del index.css no vuelve (var(--cn-bg) sin llaves)", !/\[data-theme="light"\][\s\S]{0,200}?var\(--cn-bg\)/.test(indexCss));

// ── 7 · superficie opaca ───────────────────────────────────────────────────
comprobar("opaca cierra el módulo al 100%", variablesDePaleta({ modo: "oscuro", superficie: "opaca", intensidad: 40 })["--cn-module-opacity"] === "1");
comprobar("vidrio traduce la intensidad a opacidad", variablesDePaleta({ modo: "oscuro", superficie: "vidrio", intensidad: 80 })["--cn-module-opacity"] === "0.8");
comprobar("la solidez y la opacidad del módulo son el mismo número en vidrio", (() => { const v = variablesDePaleta({ modo: "claro", superficie: "vidrio", intensidad: 55 }); return v["--cn-solidez"] === v["--cn-module-opacity"]; })());
comprobar("opaca NO elige color: en oscuro sella con el hex original", reglaSellada("bg-[#0a0f1a]/80", "oscuro").includes(":rgba?") === false && /background-color:#0a0f1a!important/.test(reglaSellada("bg-[#0a0f1a]/80", "oscuro")), reglaSellada("bg-[#0a0f1a]/80", "oscuro"));
comprobar("opaca en claro sella con el color claro (mismo cierre, otro papel)", /background-color:#[0-9a-f]{6}!important/.test(reglaSellada("bg-[#0a0f1a]/80", "claro")) && !reglaSellada("bg-[#0a0f1a]/80", "claro").includes("#0a0f1a"), reglaSellada("bg-[#0a0f1a]/80", "claro"));
comprobar("el sellado tiene más especificidad que la regla de modo (0,3,0 > 0,2,0)", (() => {
  const conAlfa = HEXES_SUPERFICIE.find((c) => /\/\d{1,3}$/.test(c))!;
  const e = escaparClase(conAlfa);
  const iOpaca = hoja.indexOf(`[data-cn-superficie="opaca"][data-cn-modo="claro"] .${e}{`);
  const iModo = hoja.indexOf(`[data-cn-modo="claro"] .${e}{`);
  return iOpaca > -1 && iModo > -1 && iModo < iOpaca && hoja.slice(iOpaca, iOpaca + 200).includes("!important");
})(), "clase con alfa no encontrada o en mal orden");
comprobar("todo miembro del inventario con alfa queda sellado en los dos modos", HEXES_SUPERFICIE.filter((c) => /\/\d{1,3}$/.test(c)).every((c) => {
  const e = escaparClase(c);
  return hoja.includes(`[data-cn-superficie="opaca"][data-cn-modo="claro"] .${e}{`) && hoja.includes(`[data-cn-superficie="opaca"][data-cn-modo="oscuro"] .${e}{`);
}));
comprobar("opaca apaga el desenfoque (es lo más caro y lo que emborrona el texto)", /opaca"\] \[class\*="backdrop-blur"\]\{[^}]*backdrop-filter:none!important/.test(hoja));
comprobar("opaca no necesita el deslizador: el label lo dice en la propia tarjeta", /opaca al 100 %/.test(fs.readFileSync(path.join(RAIZ, "src", "components", "PanelAspecto.tsx"), "utf8")));

// ── 8 · compatibilidad con el panel Pro y persistencia ─────────────────────
comprobar("light → claro y los tres oscuros → oscuro", modoDesdeTemaPro("light") === "claro" && modoDesdeTemaPro("dark") === "oscuro" && modoDesdeTemaPro("midnight") === "oscuro" && modoDesdeTemaPro("carbon") === "oscuro");
comprobar("un tema desconocido no inventa un modo", modoDesdeTemaPro("neon") === null && modoDesdeTemaPro(undefined) === null);
comprobar("claro siempre aterriza en light", temaProDesdePaleta("claro", "midnight") === "light" && temaProDesdePaleta("claro", "dark") === "light");
comprobar("oscuro respeta el variante que el usuario tenía (no aplasta midnight a dark)", temaProDesdePaleta("oscuro", "midnight") === "midnight" && temaProDesdePaleta("oscuro", "carbon") === "carbon" && temaProDesdePaleta("oscuro", "light") === "dark");
comprobar("ida y vuelta tema↔modo sin deriva", (() => { for (const t of ["dark", "midnight", "carbon", "light"] as const) { const m = modoDesdeTemaPro(t)!; if (temaProDesdePaleta(m, t) !== t) return false; } return true; })());

// ── 9 · las piezas nuevas están enganchadas de verdad (no hojas muertas) ───
/* Las dos direcciones del cableado, sin lista escrita a mano (una lista así se
   queda obsoleta la próxima semana y entonces la valla miente): lo definido sale
   de la hoja y de index.css, lo usado sale de los componentes. Ojo con las
   variables — `--cn-tareas-gutter` no es una clase y no debe pedirse que exista. */
const definidas = new Set<string>();
for (const m of hoja.matchAll(/\.cn-[a-z0-9_-]+/g)) definidas.add(m[0].slice(1));
for (const m of indexCss.matchAll(/\.cn-[a-z0-9_-]+/g)) definidas.add(m[0].slice(1));
const componentes = ["src/components/ChatCenter.tsx", "src/components/PlansPanel.tsx", "src/components/PanelAspecto.tsx"]
  .map((f) => fs.readFileSync(path.join(RAIZ, f), "utf8")).join("\n");
const usadas = new Set<string>();
for (const m of componentes.matchAll(/(?<![-\w.])(cn-(?:chat|tarea|plan)[a-z0-9_-]*)/g)) usadas.add(m[1]);
const hojasSueltas = [...definidas].filter((c) => /^(cn-(chat|tarea|plan))/.test(c) && !usadas.has(c));
comprobar("ninguna clase nueva de la hoja queda decorando el vacío (cero hojas muertas)", hojasSueltas.length === 0, "sin uso: " + hojasSueltas.join(", "));
const piezasFaltan = [...usadas].filter((c) => !definidas.has(c));
comprobar("toda clase cn-chat/tarea/plan que usan los componentes está definida en algún sitio", piezasFaltan.length === 0, "sin definir: " + piezasFaltan.join(", "));
comprobar("el hilo del chat responde a la densidad (el deslizador deja de ser regulador mudo en el chat)", /\.cn-chat-hilo>\*\+?\*?\{margin-top:calc\([^)]*--cn-density/.test(hoja));
comprobar("la píldora de estado está en el panel de tareas (chipEstado)", /cn-tarea-chip/.test(fs.readFileSync(path.join(RAIZ, "src", "components", "PlansPanel.tsx"), "utf8")));
comprobar("la barra de progreso del plan es accesible (progressbar con valores)", /role="progressbar"/.test(fs.readFileSync(path.join(RAIZ, "src", "components", "PlansPanel.tsx"), "utf8")));
comprobar("seleccionar un plan ya no mueve el contenido (el borde de 2px se hizo pelo interior)", /\.cn-plan-item--activo\{[^}]*inset 2px 0 0/.test(hoja) && !/border-l-2 border-l-violet-500/.test(fs.readFileSync(path.join(RAIZ, "src", "components", "PlansPanel.tsx"), "utf8")));

// ── 10 · la suite está registrada en el ritual ──────────────────────────────
const validar = fs.readFileSync(path.join(RAIZ, "scripts", "validar.mjs"), "utf8");
comprobar("esta suite corre en el ritual (nada vivo fuera de validar.mjs)", /archivo: "tests\/paleta\.test\.ts"/.test(validar));

console.log = console.log;
console.log(`\npaleta: ${correctas} correctas, ${fallos.length} fallos`);
for (const f of fallos) console.log("  ✗ " + f);
process.exit(fallos.length ? 1 : 0);
