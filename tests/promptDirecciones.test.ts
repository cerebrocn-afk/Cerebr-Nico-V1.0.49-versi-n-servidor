/**
 * promptDirecciones.test.ts — v1.0.20
 * El prompt decía «Puertos: 3000 IDE · 3500 sandbox · 5000 PC · 11434 Ollama»:
 * una copia A MANO que se quedó corta (faltaban :5100 memoria, :5102 creador y
 * :5103 cerebro) y que el modelo podía inventar. Ahora se deriva de PORTS.
 */
import { PORTS } from "../src/constants";
import { buildSuperPrompt } from "../src/engine/superPrompt";
import { getModelProfile } from "../src/engine/modelTiers";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

for (const modelo of ["qwen3.5:4b", "llama3.1:8b", "gemini-2.5-flash"]) {
  const p = buildSuperPrompt({ profile: getModelProfile(modelo, 8), responseLanguage: "es", toolNames: ["write_file"] });
  const texto = p.prefijoEstable + p.sufijoDinamico;
  c(`«${modelo}»: el prompt trae los siete puertos reales`,
    [PORTS.IDE, PORTS.SANDBOX, PORTS.BRIDGE, PORTS.MEMORY, PORTS.CREATOR, PORTS.CEREBRO, PORTS.OLLAMA]
      .every((n) => texto.includes(`:${n}`)), String(p.level));
  c(`«${modelo}»: dice que no se inventen otros`, /no inventes otros/i.test(texto));
  c(`«${modelo}»: no queda el literal viejo de la copia a mano`, !/Puertos: 3000 IDE/.test(texto));
}

const micro = buildSuperPrompt({ profile: getModelProfile("gemma3:270m", 8) });
c("el nivel micro también lleva la tabla (no se queda sin direcciones)", micro.prefijoEstable.includes(`:${PORTS.SANDBOX}`), micro.level);

console.log(`\n${"─".repeat(56)}\nDIRECCIONES EN EL PROMPT (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }
