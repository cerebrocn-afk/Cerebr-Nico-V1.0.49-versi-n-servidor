#!/usr/bin/env node
/**
 * scripts/sonda-arranque.mjs — MIDI DESDE TU MÁQUINA LO QUE EL NAVEGADOR NO CUENTA (v2.2.2)
 * ==========================================================================================
 * El 03/11 la pantalla decía «servidor local caído» mientras el log del server decía lo
 * contrario (`:3000` escuchando, Ollama arriba con 44 modelos, puente `:5000` listo). Los
 * dos decían la verdad: el chip lo calcula EL NAVEGADOR (src/engine/latido.ts), que sondea
 * `/api/coreo` cada 700 ms y lo declara muerto a los 700 × 4 = 2800 ms.
 *
 * Este script corta la discusión con números. No arregla nada: mide, y cada línea roja
 * dice qué hacer. Correr con la IDE abierta (o sin ella, también sirve).
 *
 *   node scripts/sonda-arranque.mjs
 *   node scripts/sonda-arranque.mjs --puerto 3000 --vueltas 12
 */
import process from "node:process";

function opcion(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}
const PUERTO = Number(opcion("puerto", process.env.PORT || 3000));
const VUELTAS = Number(opcion("vueltas", 10));
const PLAZO_MS = Number(opcion("plazo", 12000));
const BASE_IP = `http://127.0.0.1:${PUERTO}`;
const BASE_NOMBRE = `http://localhost:${PUERTO}`;

// El presupuesto real del chip, con la misma fórmula que usa el navegador.
const INTERVALO_LATIDO_MS = 700;
const CADUCIA_LATIDO = 4;
const PRESUPUESTO_MS = INTERVALO_LATIDO_MS * CADUCIA_LATIDO;

const ROJO = "\x1b[31m", VERDE = "\x1b[32m", AMAR = "\x1b[33m", NEGRA = "\x1b[0m";
const s = (n) => String(n).padStart(7);
const avisos = [];
function veredicto(texto) {
  if (avisos.includes(texto)) return;
  avisos.push(texto);
}

async function pedir(url, plazoMs = PLAZO_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), plazoMs);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const cuerpo = await r.text().catch(() => "");
    return { ms: Date.now() - t0, status: r.status, cuerpo };
  } catch (e) {
    return { ms: Date.now() - t0, status: 0, error: `${e?.name || "Error"}: ${e?.message || "sin mensaje"}` };
  } finally {
    clearTimeout(t);
  }
}
const json = (c) => { try { return JSON.parse(c); } catch { return null; } };

console.log(`\n══ SONDA DE ARRANQUE · CerebroNico · ${new Date().toLocaleString()} ══`);
console.log(`   presupuesto del navegador: ${INTERVALO_LATIDO_MS} ms × ${CADUCIA_LATIDO} = ${PRESUPUESTO_MS} ms (src/engine/latido.ts)`);

// ── 1. El latido, varias veces, sobre 127.0.0.1 ─────────────────────────────
console.log(`\n[1] /api/coreo ×${VUELTAS} en ${BASE_IP}  (es lo único que lee el chip de la cabecera)`);
const muestras = [];
for (let i = 0; i < VUELTAS; i++) {
  const r = await pedir(`${BASE_IP}/api/coreo`, PRESUPUESTO_MS + 6000);
  muestras.push(r);
  const color = r.status === 200 && r.ms <= PRESUPUESTO_MS ? VERDE : r.status === 200 ? AMAR : ROJO;
  console.log(`    ${s(r.status)} ${color}${s(r.ms)}ms${NEGRA}${r.error ? `  ${ROJO}${r.error}${NEGRA}` : ""}`);
  await new Promise((res) => setTimeout(res, 120));
}
const tiempos = muestras.map((m) => m.ms).sort((a, b) => a - b);
const p50 = tiempos[Math.floor(tiempos.length / 2)];
const peor = tiempos[tiempos.length - 1];
const muertos = muestras.filter((m) => m.status !== 200).length;
console.log(`    p50 ${p50} ms · peor ${peor} ms · sin respuesta ${muertos}/${VUELTAS}`);
if (muertos === 0 && peor <= PRESUPUESTO_MS) {
  console.log(`    ${VERDE}OK${NEGRA} — contesta adentro del presupuesto del chip`);
  veredicto(`El latido está sano medido desde afuera. Si la pantalla igual dice «servidor local caído», el problema está entre TU NAVEGADOR y el puerto: proxy del sistema, una extensión, o una pestaña vieja. Abrí http://127.0.0.1:${PUERTO} en una ventana nueva en Incógnito y compará.`);
} else if (muertos === 0) {
  console.log(`    ${AMAR}LIMÍTROFE${NEGRA} — contesta, pero más lento que el presupuesto del chip`);
  veredicto(`El peor latido midió ${peor} ms contra un presupuesto de ${PRESUPUESTO_MS} ms. Con Vite transformando ~330 módulos en el mismo proceso, el chip corta antes: usá \`npm run dev:sin-vite\`, que compila el frente y saca a Vite del proceso.`);
} else {
  console.log(`    ${ROJO}CORTADO${NEGRA} — ${muertos} de ${VUELTAS} lecturas no llegaron`);
  veredicto(`/api/coreo no respondió ${muertos} de ${VUELTAS} veces. Fijate si la consola del server sigue viva y quién escucha en :${PUERTO} — en Windows: \`netstat -ano | findstr :${PUERTO}\`.`);
}

// ── 2. La misma ruta por `localhost` (la trampa del ::1) ────────────────────
console.log(`\n[2] /api/coreo por ${BASE_NOMBRE}  (si esto falla y lo de arriba anda: es IPv6)`);
const porNombre = await pedir(`${BASE_NOMBRE}/api/coreo`, 4000);
console.log(`    ${s(porNombre.status)} ${s(porNombre.ms)}ms${porNombre.error ? `  ${ROJO}${porNombre.error}${NEGRA}` : ""}`);
const ipAnduvo = muertos === 0;
if (porNombre.status !== 200 && ipAnduvo) {
  veredicto(`\`localhost\` no llega al server pero 127.0.0.1 sí: el server escucha en IPv4 y tu navegador está probando ::1. Usá siempre http://127.0.0.1:${PUERTO} (como dice el .bat).`);
}

// ── 3. Lo que le pide cada panel ───────────────────────────────────────────
console.log(`\n[3] las rutas que consulta la interfaz, una por una`);
const paneles = [
  { ruta: "/api/telemetry/ports", nombre: "panel PUERTOS  ", lista: null },
  { ruta: "/api/cerebro/embedder", nombre: "panel EMBEDDING", lista: "listo" },
  { ruta: "/api/ollama/models", nombre: "lista de MODELOS ", lista: "models" },
  { ruta: "/api/health", nombre: "salud /api/health    ", lista: null },
];
for (const p of paneles) {
  const r = await pedir(`${BASE_IP}${p.ruta}`);
  let color = r.status === 200 ? VERDE : ROJO;
  let nota = r.error || "";
  const datos = r.status === 200 ? json(r.cuerpo) : null;
  if (r.status === 200 && !datos) { color = ROJO; nota = "la respuesta no es JSON"; }
  if (datos && p.lista) {
    const v = datos[p.lista];
    if (Array.isArray(v) && v.length === 0) {
      color = ROJO;
      nota = `LISTA VACÍA con HTTP 200 · llamó a ${datos.ollamaUrl || "?"} · plazo ${datos.plazoMs || "?"} ms · error: ${datos.error || "ninguno"}`;
    } else if (datos.error) {
      color = AMAR; nota = `parcial: ${datos.error}`;
    } else if (Array.isArray(v)) {
      nota = `${v.length} entradas`;
    }
  }
  if (datos && datos.listo === false && p.lista === "listo") nota = (nota ? nota + " · " : "") + "el embedder se declara no listo";
  console.log(`    ${s(r.status)} ${s(r.ms)}ms  ${p.nombre}${nota ? `  ${color}${nota}${NEGRA}` : ""}`);
  if (p.lista === "models" && color === ROJO && r.status === 200) {
    veredicto(`La lista de modelos viene vacía. Si arriba dice OLLAMA_HOST=0.0.0.0..., ya está explicado: desde la 2.2.2 esa dirección se interpreta y se avisa en el arranque. Si no, mirá el plazo: con ${datos?.plazoMs || "?"} ms y 44 modelos en disco frío se puede cumplir — subirlo con CN_PLAZO_TAGS_MS=20000.`);
  }
  if (p.ruta === "/api/cerebro/embedder" && r.status === 200 && (color === ROJO || /no listo/.test(nota))) {
    veredicto("El panel de embedding no tiene datos. Fijate si el modelo pedido está instalado (`ollama list`): si falta, el embedder debe decir «no instalado», no quedarse cargando.");
  }
}

// ── 4. Ollama cara a cara ──────────────────────────────────────────────────
console.log(`\n[4] Ollama cara a cara — separa «nuestro proxy» de «el motor»`);
const envHost = process.env.OLLAMA_HOST || "(sin definir)";
const envUrl = process.env.OLLAMA_URL || "(sin definir)";
console.log(`    entorno: OLLAMA_URL=${envUrl}   OLLAMA_HOST=${envHost}`);
if (/^\s*(0\.0\.0\.0|\[?::\]?)(:\d+)?\s*$/.test(String(process.env.OLLAMA_HOST || ""))) {
  veredicto(`Tu entorno tiene OLLAMA_HOST=${process.env.OLLAMA_HOST}, que es una dirección de ESCUCHA y no un destino. Antes de la 2.2.2 esta era LA causa de «no cargan los modelos» y «embedding sin cargar». Ahora se corrige sola y lo dice en el arranque.`);
}
const directa = /^https?:\/\//i.test(envUrl) ? envUrl : /^https?:\/\//i.test(envHost) ? envHost : "http://127.0.0.1:11434";
const tags = await pedir(`${directa.replace(/\/+$/, "")}/api/tags`, 9000);
let cuantos = "—";
const datosTags = json(tags.cuerpo);
if (datosTags) cuantos = String((datosTags.models || []).length);
console.log(`    ${s(tags.status)} ${s(tags.ms)}ms  GET ${directa}/api/tags · ${cuantos} modelos${tags.error ? `  ${ROJO}${tags.error}${NEGRA}` : ""}`);
if (tags.status !== 200) {
  veredicto(`Ollama no contestó /api/tags en ${directa} (${tags.error || "sin respuesta"}). Probá ${"http://127.0.0.1:11434/api/tags"} en el navegador: si ahí sí hay lista, la variable de entorno estaba apuntando a la escucha.`);
} else if (datosTags && (datosTags.models || []).length && !avisos.length) {
  console.log(`    ${VERDE}OK${NEGRA} — el motor tiene ${cuantos} modelos y responde ${tags.ms} ms`);
}

// ── 5. Cierre ─────────────────────────────────────────────────────────────
console.log(`\n══ RESUMEN ══`);
if (!avisos.length) {
  console.log(`  ${VERDE}Todo lo medido está sano${NEGRA}: latido, paneles y Ollama contestan.`);
  console.log(`  → Si el chat igual no sale, el problema NO está en estas rutas. Abrí la consola del`);
  console.log(`    navegador (F12) y la pestaña Network: es lo único que esta sonda no puede ver`);
  console.log(`    desde afuera, y trae el código exacto de la petición del chat.`);
} else {
  for (let i = 0; i < avisos.length; i++) console.log(`  ${i + 1}. ${avisos[i]}`);
}
console.log(`\n   (si algo salió en rojo, copiar este bloque entero: trae direcciones y tiempos exactos)\n`);
