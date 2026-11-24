/**
 * tests/degeneracionLineal.test.ts — v1.61.0
 * Defecto sembrado: la degeneración REAL de la sesión `1792619044991`
 * (262 KB de líneas casi idénticas). Falsos positivos: prosa normal y una lista
 * legítima de archivos con descripciones parecidas.
 */
import { cortarDegeneracionLineal, lineasParecidas, similitudPalabras, sufijoComun } from "../src/engine/degeneracionLineal";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const aqui = path.dirname(fileURLToPath(import.meta.url));

let ok = 0;
let fail = 0;
const af = (nombre: string, cond: boolean) => {
  if (cond) { ok++; console.log("  ✓ " + nombre); }
  else { fail++; console.log("  ✗ " + nombre); }
};

// ── Defecto sembrado: el caso real de la sesión ──────────────────────────────
const SEMILLA = path.join(aqui, "fixtures", "degeneracion-fim-262k.txt");
const tieneSemilla = fs.existsSync(SEMILLA);
const real = tieneSemilla ? fs.readFileSync(SEMILLA, "utf8") : "";

if (tieneSemilla) {
  const r = cortarDegeneracionLineal(real);
  af("corta la degeneración real de la sesión FIM", r.hit === true);
  af("descarta casi todo el texto (≥ 90 %)", r.cortado.length <= real.length * 0.1);
  af("conserva una fracción sana (no vacía del todo)", r.cortado.length > 0);
  af("reporta dónde cortó", r.lineaCorte >= 0 && r.largoRacha >= 6);

  // El bloque que sobrevive NO debe contener las carpetas inventadas en racha.
  const cola = r.cortado.split("\n").slice(-8).join("\n");
  af("lo que sobrevive no es una racha degenerada", cortarDegeneracionLineal(cola).hit === false);
} else {
  console.log("  · sin fixture: se prueban los controles synthéticos");
}

// ── Líneas sintéticas con la misma forma ────────────────────────────────────
const sintetico = [
  "La carpeta de datos guarda los proyectos y la memoria del motor completo.",
  "La carpeta de datos guarda los proyectos y la memoria del motor completo.",
  "La carpeta de datos guarda los proyectos y la memoria del motor completo.",
  "La carpeta de datos guarda los proyectos y la memoria del motor completo.",
  "La carpeta de datos guarda los proyectos y la memoria del motor completo.",
  "La carpeta de datos guarda los proyectos y la memoria del motor completo.",
  "La carpeta de datos guarda los proyectos y la memoria del motor completo.",
].join("\n");
af("corta racha sintética idéntica", cortarDegeneracionLineal(sintetico).hit === true);

// Una palabra distinta cada línea (como el caso real).
const variaPalabra = Array.from({ length: 8 }, (_, i) =>
  `La carpeta de ${["graphql", "store", "hooks", "api", "docs", "logs", "seed", "core"][i]} guarda sus archivos y la memoria del motor.`
).join("\n");
af("corta racha que solo cambia una palabra", cortarDegeneracionLineal(variaPalabra).hit === true);

// ── Falsos positivos que NO deben dispararse ────────────────────────────────
const prosa = `Este proyecto usa rutas relativas a la raíz del sandbox.
Nunca escribas rutas absolutas de Windows en un archivo del proyecto.
El motor mantiene un cuadro interno con todas las claves ya resueltas.
Si dudas de una ruta, lista los archivos antes de escribir nada nuevo.
El previsualizador solo sirve archivos que están dentro del proyecto.
Para escribir usa la herramienta write_file con la ruta relativa correcta.
Para cambios pequeños conviene edit_file en vez de reescribir el archivo.`;
af("NO marca prosa normal", cortarDegeneracionLineal(prosa).hit === false);

const listaLegitima = [
  "**src/index.html** — punto de entrada de la interfaz, carga los estilos globales.",
  "**src/app.ts** — lógica principal de la aplicación y gestión de eventos.",
  "**src/api.ts** — funciones que hablan con el servidor del proyecto web.",
  "**src/utils.ts** — helpers puros, sin estado ni efectos secundarios.",
  "**styles/main.css** — estilos globales, variables y tipografía base.",
  "**styles/theme.css** — paleta y espaciado del tema claro y oscuro.",
  "**README.md** — instrucciones de instalación y comandos básicos.",
];
af("NO marca una lista legítima de archivos", cortarDegeneracionLineal(listaLegitima.join("\n")).hit === false);

// Código normal repetido en forma legítima (muchas constantes DISTINTAS).
const codigo = Array.from({ length: 30 }, (_, i) =>
  `export const CN_CREADOR_MARCADOR_${i} = "valor-distinto-${i}";`
).join("\n");
af("NO marca 30 constantes distintas", cortarDegeneracionLineal(codigo).hit === false);

// ── Utilidades puras ─────────────────────────────────────────────────────────
af("sufijoComun cuenta desde el final", sufijoComun("hola mundo", "adios mundo") === 6);
af("similitudPalabras ≈ 1 con las mismas palabras", Math.abs(similitudPalabras("a b c d", "a b c d") - 1) < 1e-9);
af("lineasParecidas es falso con texto distinto", lineasParecidas("hola mundo feliz", "otra cosa totalmente") === false);

// Textos vacíos /cortos no rompen.
af("texto vacío no rompe", cortarDegeneracionLineal("").hit === false);
af("texto corto no rompe", cortarDegeneracionLineal("hola").hit === false);

console.log(`\nResultado: ${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);