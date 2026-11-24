/**
 * hormaChat.test.ts — v1.94.0 · la horma · v1.99.9 · LA GRADUACIÓN · v2.3.9 · EL TECHO
 * ====================================================================================
 * Pedido de Mario (30/10, y repetido en sesiones siguientes): «el chat es muy fino, debería ser
 * más ancho si no tengo nada más abierto; si abro algo que se redimensione…».
 *
 * v1.94.0 resolvió la mitad: un interruptor de dos estados atado a `!isRightOpen`. Con eso, una
 * pantalla de 1920 con el panel izquierdo cerrado y el derecho abierto seguía pintando 896 px y
 * dejando aire muerto al lado — porque el criterio miraba UN panel y ningún número.
 *
 * v1.99.9 gradúa: cuatro pasos elegidos con la cuenta real (ventana − paneles ABIERTOS −
 * splitters − colchón). Esta suite congela las dos hormas que el usuario ya conoce (no se mueven),
 * la aritmética del espacio libre —incluido el agujero histórico de contar el ancho de un panel
 * CERRADO— y que TODAS las franjas usan el mismo paso (hoy cinco: turnos, enjambre, alerta,
 * cronómetro del último turno y composer).
 *
 * v2.3.9 · EL TECHO SUBIÓ (pedido: «necesito que ensanches el chat»). La escala terminaba en
 * `despejada` = 1152 px, así que en 1920 con todo cerrado el chat se quedaba en 1152 y con los dos
 * paneles abiertos en 1024: siempre con aire muerto. Se añaden `ancha` (1280) y `total` (1536).
 * Las aserciones que antes exigían `despejada` en 1920 ahora exigen el paso MAYOR que cubre ese
 * espacio — que es la misma regla, con la escala nueva. Lo que NO cambia: `normal` sigue siendo
 * max-w-4xl y el default sigue siendo la horma histórica.
 *
 * v2.3.11 · LA ESCALA SE CIERRA POR ARRIBA. Con nueve pasos, las dos franjas de 1920 que fallaban
 * (solo el derecho abierto = 1484 px libres; los dos abiertos = 1224 px libres) ya tienen su tope
 * propio: `amplia2` (1472) y `holgada2` (1216). El criterio no cambió; lo que cambió es que ahora
 * hay un paso cerca del hueco y el chat no depende de un recorte de 50 px.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HORMAS, hormaDe, claseHorma, espacioLibre, decidirHorma, pasoSiguiente, HORMA_DEFECTO } from "../src/engine/hormaChat";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");

let correctas = 0;
let fallidas = 0;
const comprobar = (que: string, ok: boolean, extra = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (extra ? " — " + extra : "")); }
};
const seccion = (t: string) => console.log("\n── " + t + " " + "─".repeat(Math.max(0, 62 - t.length)));

const chat = leer("src/components/ChatCenter.tsx");
const app = leer("src/App.tsx");

seccion("§1 · LA HORMA VIVE EN UN SOLO LUGAR (ahora: el órgano puro)");
comprobar("★ el componente ya no declara su propia lista de anchos", !/const HORMA_CHAT\s*=/.test(chat));
comprobar("y la pregunta va al dueño (`claseHorma` de `engine/hormaChat`)", /claseHorma\(horma\)/.test(chat) && /from "\.\.\/engine\/hormaChat"/.test(chat));
comprobar("★ la horma de siempre NO cambió: `normal` sigue siendo max-w-4xl", hormaDe("normal").clase === "max-w-4xl");
comprobar("la amplia tampoco: max-w-5xl y más ancha que la normal", hormaDe("amplia").clase === "max-w-5xl" && hormaDe("amplia").px > hormaDe("normal").px);
comprobar("hay NUEVE pasos y son ordenados (graduar no es tener dos caprichos)", HORMAS.length === 9 && HORMAS.every((h, i) => i === 0 || h.px > HORMAS[i - 1].px));
comprobar("★ el techo subió: la escala llega a 1536 px (antes moría en 1152)", HORMAS[HORMAS.length - 1].px === 1536 && hormaDe("ancha").px === 1280);
comprobar("★ los dos pasos que cierran los huecos de 1920 existen y son los que dicen ser",
  hormaDe("holgada2").px === 1216 && hormaDe("amplia2").px === 1472
  && hormaDe("holgada2").clase === "max-w-[76rem]" && hormaDe("amplia2").clase === "max-w-[92rem]");
comprobar("el default es la horma histórica, no la más ancha", HORMA_DEFECTO === "normal" && hormaDe("no-existe").clase === "max-w-4xl" && claseHorma(undefined) === "max-w-4xl");

seccion("§2 · LAS CUATRO FRANJAS USAN LA MISMA RESPUESTA");
const usos = (chat.match(/\$\{claseHorma\(horma\)\}/g) || []).length;
// v1.0.14 · la quinta franja es el cronómetro del último turno: se pinta con la misma
// horma que las otras cuatro, así que la cuenta honesta es 5. Lo que la valla defiende
// no es el número: es que NINGUNA franja se quede con un literal propio.
comprobar("turnos, enjambre, alerta, cronómetro y composer preguntan las cinco", usos === 5, `${usos} franjas`);
comprobar("★ no queda NINGÚN max-w-4xl suelto en el componente", (chat.match(/max-w-4xl/g) || []).length === 0);
comprobar("el prop es un PASO opcional (un uso viejo sin prop = horma de siempre)", /horma\?: PasoHorma;/.test(chat) && /\bhorma,/ .test(chat.replace(/\s+/g, " ")) === true);

seccion("§3 · EL CRITERIO ES CUÁNTO ESPACIO QUEDA, NO QUÉ PANEL SE ABRIÓ");
const todoCerrado = { anchoPx: 1920, izquierdaAbierta: false, derechaAbierta: false, izquierdaPx: 260, derechaPx: 420 };
const soloDerecha = { ...todoCerrado, derechaAbierta: true };
const todoAbierto = { ...todoCerrado, izquierdaAbierta: true, derechaAbierta: true };
comprobar("★ 1920 con todo cerrado: se abre al máximo (antes: 1152 px y aire muerto)",
  decidirHorma(todoCerrado).paso === "total", JSON.stringify(decidirHorma(todoCerrado)));
comprobar("1920 con solo el derecho abierto: usa el paso MAS ANGOSTO que cubre ese hueco (no el de siempre)",
  decidirHorma(soloDerecha).px >= decidirHorma(soloDerecha).librePx && decidirHorma(soloDerecha).paso !== "normal", String(decidirHorma(soloDerecha).librePx));
comprobar("1920 con los dos abiertos: usa el tope mayor disponible, no el de siempre",
  decidirHorma(todoAbierto).librePx > 1152 && decidirHorma(todoAbierto).px >= decidirHorma(todoAbierto).librePx, String(decidirHorma(todoAbierto).librePx));
comprobar("★ y en las dos franjas el tope elegido NO desborda el hueco (no se depende del recorte)",
  decidirHorma(soloDerecha).px >= decidirHorma(soloDerecha).librePx
  && decidirHorma(todoAbierto).px >= decidirHorma(todoAbierto).librePx
  && decidirHorma(soloDerecha).px - decidirHorma(soloDerecha).librePx <= 64
  && decidirHorma(todoAbierto).px - decidirHorma(todoAbierto).librePx <= 64,
  `${decidirHorma(soloDerecha).px - decidirHorma(soloDerecha).librePx} / ${decidirHorma(todoAbierto).px - decidirHorma(todoAbierto).librePx} px de recorte`);
const pantallaChica = { anchoPx: 1366, izquierdaAbierta: true, derechaAbierta: true, izquierdaPx: 260, derechaPx: 420 };
comprobar("1366 con los dos abiertos: se angosta (no finge 1024 px que no existen)", decidirHorma(pantallaChica).paso === "angosta", JSON.stringify(decidirHorma(pantallaChica)));
comprobar("★ un panel CERRADO cuenta 0 px (el agujero que robaba espacio al que sí estaba visible)",
  espacioLibre({ anchoPx: 1600, izquierdaAbierta: false, derechaAbierta: true, izquierdaPx: 550, derechaPx: 420 }) === 1600 - 420 - 8 - 8);
comprobar("el splitters y el colchón del scroll están en la cuenta", espacioLibre({ anchoPx: 1000, izquierdaAbierta: false, derechaAbierta: false }) === 1000 - 8 - 8);
comprobar("★ sin lectura de la ventana NO se ensancha: degrada a la horma histórica y lo dice",
  decidirHorma({ anchoPx: undefined, izquierdaAbierta: true, derechaAbierta: true }).paso === "normal"
  && /sin lectura/.test(decidirHorma({ izquierdaAbierta: true, derechaAbierta: true }).motivo));
comprobar("el motivo nombra los números (la interfaz puede explicar su propio ancho)",
  /1920/.test(decidirHorma(todoCerrado).motivo) && /px libres/.test(decidirHorma(todoCerrado).motivo), decidirHorma(todoCerrado).motivo);
comprobar("monotonía: a más espacio, nunca menos ancho",
  HORMAS.map((h) => h.px).every((px, i, v) => i === 0 || px > v[i - 1]) && pasoSiguiente("normal") === "amplia");
comprobar("determinismo: la misma panorámica da el mismo paso", JSON.stringify(decidirHorma(todoAbierto)) === JSON.stringify(decidirHorma(todoAbierto)));

seccion("§4 · EL CABLE EN App (los números los trae la ventana real)");
// El patrón viejo se busca como LÍNEA DE CÓDIGO (prop suelto en el JSX), no en cualquier parte: la
// explicación de por qué se cambió cita `amplio={!isRightOpen}` en un comentario, y una valla que
// se prende contra la prosa termina apagándose a sí misma.
comprobar("★ App ata la horma al paso calculado, no a !isRightOpen",
  /horma=\{hormaChat\.paso\}/.test(app) && !/^\s+amplio=\{!isRightOpen\}/m.test(app));
comprobar("la decisión sale del órgano, con los anchos actuales de los paneles",
  /decidirHorma\(\{/.test(app) && /izquierdaPx: leftWidth/.test(app) && /derechaPx: rightWidth/.test(app));
comprobar("★ el ancho de ventana lo alimenta el listener de `resize` que YA existía (no se agregó otro)",
  /setAnchoVentanaPx\(window\.innerWidth\)/.test(app));
comprobar("y está memoizado: abrir/cerrar o arrastrar un splitter recalcula, teclear no",
  /const hormaChat = useMemo\(/.test(app));

console.log(`\n═══ hormaChat: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
