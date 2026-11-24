/**
 * contextTelemetry.test.ts — Suite del inspector de presión de contexto y compactación segura
 * ============================================================================================
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcularTelemetriaSesion, compactarHistorialSeguro } from "../src/engine/contextTelemetry";
import {
  UMBRAL_AVISO,
  UMBRAL_SUGERIR_COMPACTAR,
  UMBRAL_FORZAR_COMPACTAR,
} from "../src/engine/contextoMedido";
import type { ChatMessage, WorkspaceFile } from "../src/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");

let correctas = 0;
let fallidas = 0;
function comprobar(t: string, c: boolean) {
  if (c) {
    correctas++;
    console.log("  ✓ " + t);
  } else {
    fallidas++;
    console.error("  ✗ " + t);
  }
}

console.log("\n· 1) Telemetría de sesión: invariantes y ventana Gemini 4");
{
  const messages: ChatMessage[] = [
    { id: "1", role: "user", content: "Explica la arquitectura de src/App.tsx", timestamp: 1000 },
    { id: "2", role: "assistant", content: "La interfaz coordina chat, editor y vistas en paralelo.", timestamp: 2000 },
  ];
  const workspaceFiles: WorkspaceFile[] = [
    { id: "f1", name: "App.tsx", path: "src/App.tsx", content: "x".repeat(400), language: "typescript" },
  ];
  const t = calcularTelemetriaSesion({
    messages,
    workspaceFiles,
    currentModel: "gemini-4-hydrogen",
    sistemaBaseChars: 2000,
  });

  comprobar("invariante sistema + workspace + mensajes === total", t.caracteres.sistema + t.caracteres.workspace + t.caracteres.mensajes === t.caracteres.total);
  comprobar("usa ventana real de 1M tokens para gemini-4-hydrogen", t.ventanaTokens === 1_000_000);
  comprobar("declara procedencia honesta como 'estimado'", t.presion.procedencia === "estimado");
  comprobar("hereda los umbrales 45/65/80 exactos de contextoMedido", t.umbrales.aviso === UMBRAL_AVISO && t.umbrales.sugerirCompactar === UMBRAL_SUGERIR_COMPACTAR && t.umbrales.forzarCompactar === UMBRAL_FORZAR_COMPACTAR);
  comprobar("sesión pequeña queda en nivel holgado", t.presion.nivel === "holgado" && !t.puedeCompactar);
}

console.log("\n· 2) Umbrales de presión (aviso 45% / sugerir 65% / forzar 80%) y entradas hostiles");
{
  const makeTel = (chars: number) =>
    calcularTelemetriaSesion({
      messages: [{ id: "m", role: "user", content: "a".repeat(chars), timestamp: 1 }],
      workspaceFiles: [],
      currentModel: "llama3.2:3b",
      sistemaBaseChars: 0,
    });

  // llama3.2:3b en modelTiers tiene ventana de 32_768 tokens (~131_072 chars)
  const baseVentana = makeTel(4).ventanaTokens;
  const chars46 = Math.ceil(baseVentana * 0.46 * 4);
  const chars66 = Math.ceil(baseVentana * 0.66 * 4);
  const chars82 = Math.ceil(baseVentana * 0.82 * 4);

  comprobar("46% dispara nivel 'aviso'", makeTel(chars46).presion.nivel === "aviso");
  comprobar("66% dispara nivel 'sugerir_compactar'", makeTel(chars66).presion.nivel === "sugerir_compactar");
  comprobar("82% dispara nivel 'forzar_compactar'", makeTel(chars82).presion.nivel === "forzar_compactar");

  // Entrada hostil / inválida: mensajes y archivos nulos o sistemaBaseChars negativo
  const hostil = calcularTelemetriaSesion({
    messages: null as unknown as ChatMessage[],
    workspaceFiles: undefined as unknown as WorkspaceFile[],
    currentModel: "",
    sistemaBaseChars: -999,
  });
  comprobar("entrada hostil/inválida no lanza excepción ni devuelve NaN", Number.isFinite(hostil.tokensEstimados) && hostil.caracteres.total === 0 && hostil.presion.nivel === "holgado");
}

console.log("\n· 3) Compactación segura del historial");
{
  const cortos: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
    id: `c-${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Mensaje corto ${i}`,
    timestamp: 100 + i,
  }));
  const noOp = compactarHistorialSeguro(cortos, 8);
  comprobar("no compacta cuando hay <= keepRecent turnos", noOp.compactados === 0 && noOp.conservados === 6 && noOp.messages.length === 6);

  const largos: ChatMessage[] = Array.from({ length: 14 }, (_, i) => ({
    id: `l-${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content:
      i === 0
        ? "Revisa src/engine/fusibleGemini.ts y server.ts por favor " + "detalle ".repeat(40)
        : `Turno largo número ${i} ` + "contenido ".repeat(35),
    timestamp: 1000 + i,
  }));
  const snapshotAntes = JSON.stringify(largos);
  const res = compactarHistorialSeguro(largos, 8);

  comprobar("no muta el arreglo de entrada original", JSON.stringify(largos) === snapshotAntes);
  comprobar("condensa 6 mensajes antiguos en 1 sistema + conserva 8 recientes", res.compactados === 6 && res.conservados === 8 && res.messages.length === 9);
  comprobar("el primer mensaje es un resumen del sistema que preserva rutas citadas", res.messages[0].role === "system" && res.messages[0].content.includes("src/engine/fusibleGemini.ts"));
  comprobar("los últimos 8 mensajes quedan byte a byte idénticos", res.messages.slice(1).every((m, idx) => m.id === largos[6 + idx].id && m.content === largos[6 + idx].content));
  comprobar("ahorra caracteres de forma positiva", res.caracteresAhorrados > 0);
}

console.log("\n· 4) Pureza del módulo");
{
  const fuente = readFileSync(path.join(RAIZ, "src/engine/contextTelemetry.ts"), "utf8");
  const tieneNodeBuiltin = /from\s+["'](?:node:|fs|path|child_process)/.test(fuente);
  comprobar("contextTelemetry.ts es 100% puro (sin fs/path/child_process/node:*)", !tieneNodeBuiltin);
}

console.log(`\nResultado contextTelemetry: ${correctas} correctas · ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
