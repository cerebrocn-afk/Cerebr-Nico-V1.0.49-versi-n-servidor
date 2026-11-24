/**
 * certezaPWA.test.ts — v1.57.16 · SUITE DE CERTEZA: PROMESA SIN CABLE NO ES INSTALL
 * ===================================================================================
 * Fixture: app-finanzas-dark.zip, la app REAL que el usuario exportó y no instalaba.
 * Andaba perfecta en el sandbox y el install fallaba afuera; el motor la cerró verde
 * porque todo lo que mide (¿está? ¿compila? ¿apunta a algo?) estaba bien. Lo que
 * faltaba medir es la CONEXIÓN: manifest escrito y no enlazado, sw.js escrito y no
 * registrado, íconos solo-SVG. Esta suite congela exactamente ese plano.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let correctas = 0;
const fallos: string[] = [];
function comprobar(que: string, cond: unknown, detalle?: string) {
  if (cond) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
}

const { agujerosPWA } = await import("../src/engine/certezaPWA");
const { verificarCompletitud } = await import("../src/engine/completitud");

// ── fixture: el index REAL de app-finanzas-dark (sin link a manifest) ──
const INDEX_HUERFANO = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Finanzas</title><link rel="stylesheet" href="css/estilo.css"></head>
<body><div id="app"></div><script src="js/main.js"></script></body></html>`;
const MANIFEST_SVG_ONLY = JSON.stringify({ name: "Finanzas", short_name: "Fin", start_url: "./index.html",
  display: "standalone", icons: [{ src: "assets/favicon.svg", sizes: "any", type: "image/svg+xml" }] });
const MANIFEST_OK = JSON.stringify({ name: "Finanzas", start_url: "./index.html",
  icons: [{ src: "assets/icon-192.png", sizes: "192x192", type: "image/png" }] });
const SW = `self.addEventListener("install", () => {});`;
const MAIN_SUENO = `const saldo = 0;`;
const MAIN_CABLEADO = `const saldo = 0;\nif ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));`;
const INDEX_ENLAZADO = INDEX_HUERFANO.replace("</title>", '</title>\n<link rel="manifest" href="manifest.webmanifest">');

function lector(mapa: Record<string, string>) {
  return (r: string) => (r in mapa ? mapa[r] : null);
}

console.log("\n1) la app del usuario: los TRES agujeros, nombrados y con arreglo");
{
  const hoyos = agujerosPWA(
    ["manifest.webmanifest", "sw.js", "js/main.js", "index.html"],
    ["index.html"],
    lector({ "index.html": INDEX_HUERFANO, "manifest.webmanifest": MANIFEST_SVG_ONLY, "sw.js": SW, "js/main.js": MAIN_SUENO }));
  comprobar("MANIFIESTO HUÉRFANO detectado", hoyos.some((h: string) => /MANIFIESTO HUÉRFANO/.test(h)), hoyos.join(" | "));
  comprobar("SW MUERTO detectado", hoyos.some((h: string) => /SW MUERTO/.test(h)));
  comprobar("ÍCONOS NO INSTALABLES detectado", hoyos.some((h: string) => /ÍCONOS NO INSTALABLES/.test(h)));
  comprobar("cada agujero trae su arreglo concreto", hoyos.every((h: string) => /—|Agregá|Generá/.test(h)));
  comprobar("máximo 6 líneas (no inunda la puerta)", hoyos.length <= 6);
}

console.log("\n2) la versión cableada: silencio absoluto");
{
  const hoyos = agujerosPWA(
    ["manifest.webmanifest", "sw.js", "js/main.js", "index.html"],
    ["index.html"],
    lector({ "index.html": INDEX_ENLAZADO, "manifest.webmanifest": MANIFEST_OK, "sw.js": SW, "js/main.js": MAIN_CABLEADO }));
  comprobar("PWA completa y conectada → 0 agujeros", hoyos.length === 0, hoyos.join(" | "));
}

console.log("\n3) cero falsos positivos: lo que NO es asunto de esta certeza");
{
  comprobar("turno sin piezas PWA → silencio", agujerosPWA(["index.html", "css/estilo.css"], ["index.html"], lector({ "index.html": INDEX_HUERFANO })).length === 0);
  comprobar("solo sw.js (sin manifest) → solo SW MUERTO", (() => {
    const h = agujerosPWA(["sw.js"], [], lector({ "sw.js": SW }));
    return h.length === 1 && /SW MUERTO/.test(h[0]);
  })());
  const roto = agujerosPWA(["manifest.json"], ["index.html"], lector({ "index.html": INDEX_ENLAZADO, "manifest.json": "{ esto no es json" }));
  comprobar("manifest inválido → MANIFIESTO ROTO (no silencio)", roto.some((x: string) => /MANIFIESTO ROTO/.test(x)), roto.join("|"));
  comprobar("data: URI PNG cuenta como ícono", agujerosPWA(["manifest.webmanifest"], ["index.html"],
    lector({ "index.html": INDEX_ENLAZADO, "manifest.webmanifest": JSON.stringify({ icons: [{ src: "data:image/png;base64,iVBOR" }] }) })).length === 0);
}

console.log("\n4) integración completitud: el veredicto la dice roja");
{
  const sonda = (_r: string) => ({ existe: true, bytes: 10 });
  const mapa = { "index.html": INDEX_HUERFANO, "manifest.webmanifest": MANIFEST_SVG_ONLY, "sw.js": SW, "js/main.js": MAIN_SUENO };
  const v = verificarCompletitud({
    rutasPlan: [], manifiesto: new Map(), rutasEscritas: Object.keys(mapa), htmls: ["index.html"],
    sonda: sonda as any, leer: lector(mapa) as any });
  comprobar("veredicto.ok false por agujeros PWA", v.ok === false);
  comprobar("campo pwa llega al veredicto", v.pwa.length === 3, JSON.stringify(v.pwa));
}

console.log("\n5) la puerta y el cable (fuente)");
{
  const server = readFileSync(path.join(__dirname, "../server.ts"), "utf8");
  comprobar("el gate de rescate consume veredC.pwa (turno reabierto, no acta fúnebre)",
    /\.\.\.veredC\.prometidoFalta, \.\.\.veredC\.enlacesRotos, \.\.\.veredC\.arranque, \.\.\.veredC\.pwa/.test(server));
  const daemon = readFileSync(path.join(__dirname, "../scripts/creador_daemon.py"), "utf8");
  comprobar("la fábrica cablea lo que produce (_cablear_pwa)", /def _cablear_pwa/.test(daemon) && /_cablear_pwa\(raiz/.test(daemon));
  comprobar("crear_sitio ya no escribe manifest huérfano", /_cablear_pwa\(raiz, \{"name": datos\["nombre"\]/.test(daemon) && /_cablear_pwa\(raiz, \{"name": nombre/.test(daemon));
  comprobar("auditoría: manifest en disco sin enlace = ERROR (no info)", /add\("error", "pwa-huerfano"/.test(daemon));
  comprobar("auditoría: sw.js sin registro = ERROR (no info)", /add\("error", "pwa-sw-muerto"/.test(daemon));
  comprobar("PNG real por stdlib (sin inventar binarios)", /def _png_icono/.test(daemon) && /_escribir_atomico_bytes/.test(daemon));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`certezaPWA: ${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) { for (const f of fallos) console.log(`  · ${f}`); process.exitCode = 1; }
