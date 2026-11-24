/**
 * selectorModelos.test.ts — UNA FILA POR MODELO (v1.98.0)
 * =======================================================
 * La queja del 31/10: «las ranuras de freeLLMApi siguen estando, al igual que la
 * carpeta unificada en el selector». Al importar el JSON de claves, cada proveedor
 * queda en su ranura (con sus modelos y su pestaña) y el endpoint unificado aporta
 * los mismos nombres como `custom::…`. La única guarda anti-duplicado comparaba
 * contra `provider === "custom"`, así que el par (ranura ↔ unificada) nunca se
 * reconocía: el mismo modelo, dos filas, dos pestañas.
 *
 * (1) la clave del modelo: qué es "el mismo modelo" y qué NO lo es
 * (2) el colapso del par, en los dos sentidos de la preferencia
 * (3) la INVIOLABLE: dos proveedoras natives distintas NO se fusionan nunca
 * (4) nada desaparece del selector por arte de filtrado
 * (5) orden, idempotencia, basura
 * (6) ANTI-HOJA-MUERTA en el modal + registrada en el ritual
 */
import {
  CLAVE_PREFERENCIA_RUTA,
  PREFERENCIA_POR_DEFECTO,
  claveDeModelo,
  contarDuplicados,
  cortarDuplicados,
  esRutaUnificada,
  etiquetaDeRuta,
  normalizarPreferencia,
  type PreferenciaRuta,
} from "../src/engine/selectorModelos";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + String(d).split("\n")[0].slice(0, 220) : "")); };

interface M { id: string; name: string; provider: string }
const m = (provider: string, name: string): M => ({ id: `${provider}::${name}`, name, provider });
const nombres = (l: M[]) => l.map((x) => `${x.provider}/${x.name}`);

// ── 1 · qué es "el mismo modelo" ─────────────────────────────────────────────
comprobar("la clave ignora mayúsculas y espacios", claveDeModelo("  Gemini-3.8-Flash ") === claveDeModelo("gemini-3.8-flash"));
comprobar("el tag de Ollama es parte del modelo: 3b y 1b NO son el mismo", claveDeModelo("llama-3.2:3b") !== claveDeModelo("llama-3.2:1b"));
comprobar("el prefijo de enrutador es parte del nombre (meta-llama/llama-3 ≠ llama-3)", claveDeModelo("meta-llama/llama-3") !== claveDeModelo("llama-3"));
comprobar("sin nombre no hay clave", claveDeModelo("") === "" && claveDeModelo(undefined as any) === "");
comprobar("la ruta unificada es la que la casa usa (custom)", esRutaUnificada("custom") === true && esRutaUnificada("Custom") === true);
comprobar("una ranura de proveedor no es la unificada", esRutaUnificada("gemini") === false && esRutaUnificada("") === false);
comprobar("la preferencia solo admite dos valores y lo demás cae al por defecto", normalizarPreferencia("ranuras") === "ranuras" && normalizarPreferencia("no-existe") === PREFERENCIA_POR_DEFECTO && normalizarPreferencia(null) === PREFERENCIA_POR_DEFECTO);
comprobar("la clave de preferencia no se pisa con la de otro ajuste", /^cn\./.test(CLAVE_PREFERENCIA_RUTA));

// ── 2 · el caso reportado ────────────────────────────────────────────────────
const REPORTADO: M[] = [
  m("ollama", "qwen3.5:4b"),
  m("gemini", "gemini-3.8-flash"),
  m("custom", "gemini-3.8-flash"),
  m("custom", "deepseek-v4-pro"),
];
const u = cortarDuplicados(REPORTADO, "unificada");
comprobar("con el endpoint unificado como prioridad, el duplicado deja de verse", nombres(u.visibles).join(",") === "ollama/qwen3.5:4b,custom/gemini-3.8-flash,custom/deepseek-v4-pro", nombres(u.visibles).join(","));
comprobar("y lo que se ocultó queda registrado con su reemplazo", u.ocultas.length === 1 && u.ocultas[0].oculta.provider === "gemini" && u.ocultas[0].queda.provider === "custom", JSON.stringify(u.ocultas));
const r = cortarDuplicados(REPORTADO, "ranuras");
comprobar("con las ranuras como prioridad, el que se oculta es el de la unificada", nombres(r.visibles).join(",") === "ollama/qwen3.5:4b,gemini/gemini-3.8-flash,custom/deepseek-v4-pro", nombres(r.visibles).join(","));
comprobar("la preferencia cambia cuál se ve, nunca cuántos hay", cortarDuplicados(REPORTADO, "unificada").visibles.length === r.visibles.length);
comprobar("el distintivo aparece solo para los modelos con dos caminos", Object.keys(u.alternativas).join(",") === "gemini-3.8-flash", Object.keys(u.alternativas).join(","));

// ── 3 · LA INVIOLABLE ────────────────────────────────────────────────────────
const DOS_CASAS: M[] = [m("google", "gemini-3.8-flash"), m("openrouter", "gemini-3.8-flash")];
comprobar("DOS PROVEEDORAS NATIVES distintas jamás se fusionan (son precio y límite distintos)", cortarDuplicados(DOS_CASAS, "unificada").visibles.length === 2 && contarDuplicados(DOS_CASAS, "unificada") === 0);
comprobar("y con la otra preferencia tampoco", cortarDuplicados(DOS_CASAS, "ranuras").ocultas.length === 0);
const MISMA_CASA: M[] = [m("custom", "x"), m("custom", "x")];
comprobar("adentro de la misma familia, el repetido literal sí se colapsa", cortarDuplicados(MISMA_CASA, "unificada").visibles.length === 1);
comprobar("y se queda el primero que llegó (determinismo, no el que esté más abajo)", cortarDuplicados(MISMA_CASA, "unificada").visibles[0] === MISMA_CASA[0]);

// ── 4 · nada desaparece ──────────────────────────────────────────────────────
const SOLO_UNIFICADA: M[] = [m("custom", "a"), m("custom", "b")];
comprobar("si el preferido no existe, no se esconde NADA (el filtro no se come el catálogo)", cortarDuplicados(SOLO_UNIFICADA, "ranuras").visibles.length === 2);
const SOLO_RANURAS: M[] = [m("groq", "a"), m("zai", "b")];
comprobar("ídem al revés: pedir la unificada sin tenerla no vacía la lista", cortarDuplicados(SOLO_RANURAS, "unificada").visibles.length === 2);
comprobar("la suma visibles + ocultas siempre es el total de entrada", u.visibles.length + u.ocultas.length === REPORTADO.length);
comprobar("un modelo sin nombre no se traga a los demás", cortarDuplicados([m("custom", ""), m("custom", ""), m("gemini", "x")], "unificada").visibles.length === 3);
comprobar("lista vacía → corte vacío (no revienta)", cortarDuplicados([], "unificada").visibles.length === 0);

// ── 5 · orden e idempotencia ────────────────────────────────────────────────
const ORDEN: M[] = [m("gemini", "a"), m("custom", "a"), m("ollama", "z"), m("custom", "b"), m("groq", "b")];
comprobar("el orden de llegada se conserva (el selector ordena después de acá)", nombres(cortarDuplicados(ORDEN, "unificada").visibles).join(",") === "custom/a,ollama/z,custom/b", nombres(cortarDuplicados(ORDEN, "unificada").visibles).join(","));
const UNA_VEZ = cortarDuplicados(REPORTADO, "unificada").visibles;
comprobar("colapsar dos veces da lo mismo que una (el filtro es fijo, no acumulativo)", JSON.stringify(cortarDuplicados(UNA_VEZ, "unificada").visibles) === JSON.stringify(UNA_VEZ));
comprobar("la etiqueta de la ruta unificada viene de afuera (una sola fuente del nombre)", etiquetaDeRuta({ provider: "custom" }, "🧩 Unificada") === "🧩 Unificada" && etiquetaDeRuta({ provider: "groq" }, "🧩 Unificada") === "groq");
comprobar("contar y cortar coinciden", contarDuplicados(REPORTADO, "unificada") === u.ocultas.length);

// ── 6 · anti-hoja-muerta: el modal lo usa de verdad ───────────────────────
const modal = fs.readFileSync(path.join(RAIZ, "src", "components", "ModelSelectorModal.tsx"), "utf8");
comprobar("el selector llama al motor de desduplicación", /from "\.\.\/engine\/selectorModelos"/.test(modal) && /cortarDuplicados\(/.test(modal));
comprobar("el corte está ANTES del filtrado (si no, cada pestaña vuelve a duplicar)", /const filteredModels = corteRutas\.visibles\.map/.test(modal));
comprobar("la lista ya no se arma pelada desde dynamicModels", !/const filteredModels = dynamicModels\.map/.test(modal));
comprobar("hay interruptor visible para elegir la prioridad (no es una constante oculta)", /mudarPreferenciaRuta\(/.test(modal) && /ranuras por proveedor/.test(modal));
comprobar("la preferencia se guarda (mañana el selector no se vuelve a decidir solo)", /localStorage\.setItem\(CLAVE_PREFERENCIA_RUTA/.test(modal));
comprobar("el modelo con dos caminos lo dice en la fila", /2 caminos/.test(modal));
comprobar("el interruptor se ofrece en los dos sentidos", /\["unificada", "ranuras"\]/.test(modal));

const validar = fs.readFileSync(path.join(RAIZ, "scripts", "validar.mjs"), "utf8");
comprobar("esta suite corre en el ritual (nada vivo fuera de validar.mjs)", /archivo: "tests\/selectorModelos\.test\.ts"/.test(validar));

console.log = console.log;
console.log(`\nselectorModelos: ${correctas} correctas, ${fallos.length} fallos`);
for (const f of fallos) console.log("  ✗ " + f);
process.exit(fallos.length ? 1 : 0);
