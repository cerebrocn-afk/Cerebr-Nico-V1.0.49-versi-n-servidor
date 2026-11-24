/**
 * tests/watchdogTurno.test.ts — EL RELOJ QUE VIGILA UN TURNO (v1.56.8)
 * ====================================================================
 * Por qué existe: el bug que Mario reporta («arranca, se cuelga en pensando y no
 * termina hasta que vuelvo a preguntar») vive en la frontera entre el reloj de
 * silencio y los bucles de herramientas. `StreamContext` corta la respuesta al
 * NAVEGADOR cuando el modelo enmudece, pero los bucles del server preguntan solo
 * por `isAborted()` para decidir si dan otra vuelta. Si el reloj no marca el
 * aborto, el server sigue llamando a la nube —paso a paso, pagando y esperando—
 * con un cliente que ya se fue.
 *
 * Esta suite NO lee el fuente para dictar verde: INSTANCIA el `StreamContext`
 * real contra un `res` falso y deja pasar el tiempo.
 *
 * Costo honesto: la casa fija un SUELO de 10 s para el reloj
 * (`CN_WATCHDOG_IDLE_MS < 10000` se ignora a propósito, para no cortar en falso
 * una respuesta lenta pero sana). No lo bajo para que la suite corra rápido:
 * un test que traiciona la política que vigila no prueba nada. Las tres escenas
 * necesitan esperar de verdad: medido en ≈ 45 s de reloj. Se acepta ese costo por
 * lo mismo que en `persistenc`: el reloj solo se prueba dejando pasar el tiempo.
 *
 * Lo que NO prueba (y se dice): no abre conexiones HTTP ni llama a ningún
 * proveedor; el `res` es un doble en memoria.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// El módulo lee el entorno AL CARGAR, así que se declara antes del import dinámico.
const IDLE_MS = 10_000; // el suelo de la casa: es el valor más bajo aceptado
process.env.CN_WATCHDOG_IDLE_MS = String(IDLE_MS);

let correctas = 0;
const fallos: string[] = [];
const comprobar = (nombre: string, v: boolean, evidencia?: string) => {
  if (v) {
    correctas++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (evidencia ? ` — ${evidencia}` : ""));
    console.log(`  ✗ ${nombre}${evidencia ? ` → ${evidencia}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Doble mínimo de `express.Response` para lo que usa StreamContext. */
function resFalso() {
  const s = {
    escrituras: [] as string[],
    ended: false,
    listeners: {} as Record<string, Array<() => void>>,
    on(ev: string, cb: () => void) {
      (s.listeners[ev] ||= []).push(cb);
      return s;
    },
    write(chunk: string) {
      s.escrituras.push(String(chunk));
      return true;
    },
    end() {
      s.ended = true;
      (s.listeners["close"] || []).forEach((cb) => cb());
      return s;
    },
    get writableEnded() {
      return s.ended;
    },
  };
  return s;
}

const mod = await import("../server/streamContext");
const StreamContext = mod.StreamContext;

// ═══════════════════════════════════════════════════════════════════════════
seccion("1. El reloj se dispara cuando el modelo enmudece");
{
  const r = resFalso();
  const ctx = new StreamContext(r as any);
  comprobar("al abrir el turno todavía no está abortado", ctx.isAborted() === false);
  comprobar("y la respuesta sigue escribible", ctx.isWritable() === true);

  await esperar(IDLE_MS + 700);
  comprobar("★ tras el silencio, el reloj cerró la respuesta al navegador", r.ended === true);
  // ESTE ES EL ARREGLO. Antes el reloj hacía `res.end()` sin marcar el aborto, y
  // como `end()` pone writableEnded=true, el listener de "close" ya no lo marcaba:
  // isAborted() mentía y los bucles seguían pidiendo pasos a la nube.
  comprobar("★ y marcó el turno como ABORTADO (lo que los bucles consultan)", ctx.isAborted() === true);
  comprobar("★ el corte viene EXPLICADO, no es un silencio", r.escrituras.some((e) => /se detuvo|dejó de enviar texto/.test(e)), r.escrituras.join("").slice(0, 120));
  comprobar("después de cerrar ya no se escribe en la respuesta", (() => {
    const antes = r.escrituras.length;
    ctx.sendChunk("texto posterior");
    return r.escrituras.length === antes;
  })());
  ctx.clearWatchdog(); // detiene el heartbeat para que el proceso pueda terminar
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("2. Un turno vivo NO se corta: cada chunk rearma el reloj");
{
  const r = resFalso();
  const ctx = new StreamContext(r as any);
  // Silencio de ~6 s, chunk, otros ~6 s: por debajo del suelo en ambos tramos.
  await esperar(6000);
  ctx.sendChunk("hola ");
  await esperar(6000);
  comprobar("★ con actividad intercalada el reloj NO cortó (no mata respuestas largas)", ctx.isAborted() === false && r.ended === false);
  comprobar("y el texto llegó al cliente", r.escrituras.some((e) => e.includes("hola")));

  await esperar(IDLE_MS + 700);
  comprobar("★ pero si el modelo calla de verdad, el reloj SÍ cae", ctx.isAborted() === true && r.ended === true);
  ctx.clearWatchdog();
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("3. Un turno que cierra sano no queda abortado, y el reloj se apaga");
{
  const r = resFalso();
  const ctx = new StreamContext(r as any);
  ctx.sendChunk("respuesta completa");
  ctx.sendDone("glm-4.5-flash");
  comprobar("sendDone marca el final sin aborto", ctx.isAborted() === false && r.ended === true);
  await esperar(IDLE_MS + 700);
  comprobar("★ y el reloj ya no dispara después de un cierre limpio (no escribe un error encima de un done)",
    r.escrituras.filter((e) => /se detuvo/.test(e)).length === 0, r.escrituras.join("").slice(0, 160));
  ctx.clearWatchdog();
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("4. El cable: los bucles del server preguntan por isAborted()");
{
  // v1.57.9 — el ciclo se MUDÓ a `server/cicloOpenAICompat.ts` (trinquete:
  // la Fase 2 es partir). La valla no es DÓNDE vive la función sino que sus
  // lazos sigan preguntando por `isAborted()`: se lee el módulo nuevo, y
  // además se exige que server.ts lo importe (el cable no se puede perder).
  const srv = readFileSync(path.join(RAIZ, "server.ts"), "utf-8");
  const modCiclo = readFileSync(path.join(RAIZ, "server", "cicloOpenAICompat.ts"), "utf-8");
  comprobar("★ server.ts importa el ciclo (el cable sobrevivió al traslado)",
    /import \{ ejecutarCicloHerramientasOpenAICompat \} from "\.\/server\/cicloOpenAICompat"/.test(srv));
  const ciclo = modCiclo.slice(modCiclo.indexOf("async function ejecutarCicloHerramientasOpenAICompat"));
  // v1.69.0 · el archivo tiene DOS funciones de nivel superior desde que el
  // wrapper abre/cierra la hoja viva con `finally`: «el primer }\n» ya no es el
  // ciclo, es el wrapper. La lectura se ancla al ciclo interno — las dos guardas
  // que se verifican acá siguen teniendo que existir, letra por letra.
  const inicioCiclo = ciclo.indexOf("async function cicloHerramientasOpenAICompatInterno");
  const trozo = inicioCiclo >= 0 ? ciclo.slice(inicioCiclo) : ciclo;
  comprobar("★ el ciclo OpenAI-compat corta su lazo de lectura cuando el turno se aborta",
    /while \(true\) \{[\s\S]{0,80}if \(ctx\.isAborted\(\)\) break;/.test(trozo));
  comprobar("★ y tampoco abre otra vuelta del proveedor si ya se abortó",
    /for \(let paso[\s\S]{0,120}if \(ctx\.isAborted\(\)\) return/.test(trozo));
  comprobar("el suelo de 10 s sigue en pie (no se baja para acelerar tests)",
    /raw >= 10_000/.test(readFileSync(path.join(RAIZ, "server", "streamContext.ts"), "utf-8")));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ WATCHDOG DE TURNO (v1.56.8): ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
