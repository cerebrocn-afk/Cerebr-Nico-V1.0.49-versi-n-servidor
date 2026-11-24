/**
 * tests/capasSkills.test.ts — FASE 16: TRES CAPAS QUE SE PUEDEN VIGILAR (v2.3.19)
 * ============================================================================
 * Evidencia de cierre exigida por el plano, literal: «una entrada `bucle-*`
 * reescrita en tres capas con sus criterios de uso; **lectura de prompt final medida
 * ANTES y DESPUÉS con FASE 13** para demostrar que el índice reduce superficie;
 * suite que verifica que **una entrada del nivel 1 nunca contiene el cuerpo del
 * nivel 3**».
 *
 * Las tres cosas están acá, y la segunda usa el medidor de la FASE 13 (`presionDeTexto`
 * vía `compararSuperficie`) en vez de un número estimado: las fases de este plano se
 * pagan unas a otras, y si no se pagaran alguien estaría escribiendo prosa.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPAS,
  TOPE_INDICE_CARACTERES,
  UMBRAL_INVASION_CARACTERES,
  auditarCapas,
  compararSuperficie,
  superficieInyectada,
  violaLasCapas,
  type EntradaEnCapas,
} from "../src/engine/capasSkills";
import {
  AGENTS_MD_KB_ENTRY,
  BUCLE_DETALLE_BAJO_DEMANDA,
  BUCLE_INDICE_KB_ENTRY,
  BUCLES_KB_ENTRIES,
  CONCIENCIA_KB_ENTRIES,
  capasDeConciencia,
} from "../src/engine/conciencia";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leerFuente = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

const CUERPO_LARGO = "Esta es la instruccion completa del pack, con todos los detalles operativos que un modelo necesita para ejecutar el paso bien y con los ejemplos que suelen faltar cuando uno escribe apurado. ".repeat(2);
const indiceBueno: EntradaEnCapas = {
  id: "x-indice", capa: "indice", title: "indice", body: "Si es A: pack-a. Si es B: pack-b. NO bajes nada si el turno no fallo.",
  cuandoNoConsultar: "primer intento de un paso nuevo",
};
const cuerpoBueno: EntradaEnCapas = { id: "pack-a", capa: "cuerpo", title: "a", body: CUERPO_LARGO, cuandoConsultar: "cuando el indice nombra pack-a" };

console.log("\n1) La invariante del plano, con casos que la rompen a proposito\n");

c("indice correcto pasa", violaLasCapas(indiceBueno, [indiceBueno, cuerpoBueno]).length === 0, JSON.stringify ? "" : JSON.stringify(violaLasCapas(indiceBueno, [indiceBueno, cuerpoBueno])));
c("\u2605 un indice que se come el cuerpo del nivel 3 se pone rojo",
  violaLasCapas({ ...indiceBueno, body: "arranque. " + CUERPO_LARGO }, [indiceBueno, cuerpoBueno]).some((m) => m.includes("se comio")),
  JSON.stringify(violaLasCapas({ ...indiceBueno, body: "arranque. " + CUERPO_LARGO }, [indiceBueno, cuerpoBueno])));
c("indice pasado de largo deja de ser indice",
  violaLasCapas({ ...indiceBueno, body: "x".repeat(TOPE_INDICE_CARACTERES + 1) }, []).some((m) => /tope/.test(m)));
c("\u2605 indice sin «cuando NO consultar» es rojo (es la frase que admira el plano)",
  violaLasCapas({ ...indiceBueno, cuandoNoConsultar: undefined }, []).some((m) => /cuandoNoConsultar/.test(m)));
c("detalle sin bajoDemanda seria inyectado: rojo",
  violaLasCapas({ id: "d", capa: "detalle", title: "d", body: "x".repeat(40) }, []).some((m) => /bajoDemanda/.test(m)));
c("cuerpo sin cuandoConsultar nadie sabe cuando bajar: rojo",
  violaLasCapas({ id: "k", capa: "cuerpo", title: "k", body: "x".repeat(40) }, []).some((m) => /cuandoConsultar/.test(m)));
c("capa inexistente se nombra, no se ignora",
  violaLasCapas({ id: "z", capa: "extra" as unknown as EntradaEnCapas["capa"], title: "z", body: "x".repeat(40) }, []).some((m) => /capa desconocida/.test(m)));

console.log("\n2) Las capas reales del motor\n");

{
  const capas = capasDeConciencia();
  const acta = auditarCapas(capas);
  c("\u2605 la familia bucle-* real cumple la invariante", acta.malas.length === 0, JSON.stringify(acta.malas));
  c("hay exactamente UN indice", acta.porCapa.indice === 1, String(acta.porCapa.indice));
  c("hay cuerpos y un detalle bajo demanda", acta.porCapa.cuerpo >= 6 && acta.porCapa.detalle === 1, JSON.stringify(acta.porCapa));
  c("el índice mide menos de 3 renglones y medio", BUCLE_INDICE_KB_ENTRY.body.length <= TOPE_INDICE_CARACTERES, String(BUCLE_INDICE_KB_ENTRY.body.length));
  c("y su texto NO es una copia de ningún cuerpo (umbral " + UMBRAL_INVASION_CARACTERES + ")",
    BUCLES_KB_ENTRIES.filter((e) => e.id !== BUCLE_INDICE_KB_ENTRY.id).every((e) => {
      const motivos = violaLasCapas(capas[0], capas.filter((x) => x.id === e.id).concat(capas[0]));
      return motivos.every((m) => !/se comio/.test(m));
    }));
  c("el detalle largo está marcado bajo demanda", BUCLE_DETALLE_BAJO_DEMANDA.id.includes("detalle") && capas.some((e) => e.capa === "detalle" && e.bajoDemanda === true));
  c("el índice rutea por ids que EXISTEN en BUCLES_KB_ENTRIES",
    ["bucle-dos-intentos-regla", "bucle-leer-el-error", "bucle-reducir-el-caso", "bucle-cambiar-de-herramienta", "bucle-pedir-ayuda"].every((id) => BUCLES_KB_ENTRIES.some((e) => e.id === id) && BUCLE_INDICE_KB_ENTRY.body.includes(id)));
  c("las tres capas son las declaradas, sin cuarto nivel secreto", CAPAS.join(",") === "indice,cuerpo,detalle");
}

console.log("\n3) ANTES y DESPUÉS, medido con la FASE 13 (no estimado)\n");

{
  const cuerpos = BUCLES_KB_ENTRIES.filter((e) => e.id !== BUCLE_INDICE_KB_ENTRY.id).map((e) => e.body).join("\n\n");
  const antes = cuerpos;
  const despues = BUCLE_INDICE_KB_ENTRY.body;
  const m = compararSuperficie(antes, despues, 32000);
  console.log(`     antes ${m.caracteresAntes} car. (${m.porcentajeAntes}% de la ventana) → después ${m.caracteresDespues} car. (${m.porcentajeDespues}%): ${m.ahorradas} ahorradas, ${m.puntosGanados} puntos`);
  c("\u2605 el índice reduce superficie, medido y no declarado", m.gano && m.ahorradas > 200, JSON.stringify(m));
  c("el ahorro es de un orden de magnitud, no decorativo", m.caracteresAntes / Math.max(1, m.caracteresDespues) >= 5);
  c("superficieInyectada() cuenta sólo lo que viaja siempre",
    superficieInyectada(capasDeConciencia()) === BUCLE_INDICE_KB_ENTRY.body.length,
    String(superficieInyectada(capasDeConciencia())));
}

console.log("\n4) Destino B (AGENTS.md) y conexión\n");

{
  c("\u2605 existe la entrada de deferencia y dice que el skill CEDE", /cede/.test(AGENTS_MD_KB_ENTRY.body));
  c("y está en el array que siembra la base de conocimiento", CONCIENCIA_KB_ENTRIES.some((e) => e.id === "agents-md-cede"));
  c("no manda sobre el usuario: manda el proyecto, y lo dice en una línea", /seguir AGENTS\.md/.test(AGENTS_MD_KB_ENTRY.body));
  const conc = leerFuente("src/engine/conciencia.ts");
  c("\u2605 el índice viaja dentro de BUCLES_KB_ENTRIES (llega al motor, no vive en un test)", /export const BUCLES_KB_ENTRIES = \[\n  BUCLE_INDICE_KB_ENTRY,/.test(conc));
  c("\u2605 la suite está registrada en npm run validar", leerFuente("scripts/validar.mjs").includes("capasSkills.test.ts"));
  c("capasSkills no lee disco ni red (es la capa que se puede auditar en frío)",
    !/node:fs|node:net|child_process/.test(leerFuente("src/engine/capasSkills.ts")));
  c("el módulo existe", existsSync(path.join(RAIZ, "src/engine/capasSkills.ts")));
}

console.log("\n" + "─".repeat(56));
console.log(`CAPAS DE SKILLS (v2.3.19): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
