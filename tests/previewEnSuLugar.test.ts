/**
 * previewEnSuLugar.test.ts — v1.91.0 · EL PREVIEW NO SECUESTRA LA PANTALLA
 * =======================================================================
 * Queja de Mario: la opción del Editor web «lo abre muchas veces» y el chat se
 * va de la vista. Causa: `openWebEditorTab` hacía `setActiveView("web-editor")`
 * (pantalla completa) y el agente lo dispara con cada `abrir_preview`.
 */
import { readFileSync } from "node:fs";

let ok = 0;
const fallos: string[] = [];
const c = (t: string, o: boolean, d = "") => { if (o) ok++; else fallos.push(t + (d ? ` [${d}]` : "")); };

const app = readFileSync("src/App.tsx", "utf8");

// 1) el abridor ya no usa setActiveView → no puede sacar el chat de la vista
const fn = app.slice(app.indexOf("const openWebEditorTab"), app.indexOf("}, [openCenterTab]);") + "};".length);
c("openWebEditorTab ya no llama a setActiveView", !fn.includes("setActiveView("));
c("y deja el chat al frente", fn.includes('setActiveCenterTab("chat")'));

// 2) el abridor sigue vivo (lo usa el toggle manual) — no quedó muerto
c("openWebEditorTab sigue cableado", (app.match(/openWebEditorTab\(\)/g) || []).length >= 1);
const toggle = app.slice(app.indexOf("onToggleWebEditor"), app.indexOf("onToggleWebEditor") + 600);
c("el botón manual sigue alternando el editor", toggle.includes("openWebEditorTab()") && toggle.includes("closeCenterTab(\"web-editor\")"));

// 3) el agente sigue arrancando el sandbox al pedir el preview
c("abrir_preview sigue arrancando el sandbox", app.includes('fetch("/api/sandbox/start"') && app.includes('"abrir_preview"'));

for (const f of fallos) console.log("  ✗ " + f);
console.log(`═══ previewEnSuLugar: ${ok} correctas · ${fallos.length} fallidas ═══`);
process.exitCode = fallos.length ? 1 : 0;
