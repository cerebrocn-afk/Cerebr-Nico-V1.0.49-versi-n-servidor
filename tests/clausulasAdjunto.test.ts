/**
 * tests/clausulasAdjunto.test.ts — v2.3.11
 *
 * Las cláusulas de adjunto del compositor (ChatCenter.tsx): tope de 200 MB,
 * credenciales y ejecutables. Se prueban con la MISMA lógica que usa el
 * componente, replicada aquí como funciones puras — el componente no exporta
 * `motivoRechazo` porque vive dentro del cuerpo del componente (necesita
 * `setTtsAviso`), así que la prueba congela el CONTRATO: si alguien cambia una
 * lista en el componente y no aquí, esta suite no lo detecta; por eso las listas
 * se declaran idénticas y el test las compara contra el archivo fuente.
 *
 * Ejecutar: node --experimental-strip-types tests/clausulasAdjunto.test.ts
 * (o por el runner del proyecto: scripts/validar.mjs)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUENTE = resolve(AQUI, "..", "src", "components", "ChatCenter.tsx");

let correctas = 0;
let fallidas = 0;
const fallos: string[] = [];

function comprobar(nombre: string, condicion: boolean, detalle?: string): void {
  if (condicion) {
    correctas++;
  } else {
    fallidas++;
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

// ── El contrato, copiado del componente ────────────────────────────────────
const MAX_ADJUNTO_BYTES = 200 * 1024 * 1024;

const EXT_CREDENCIALES = [
  ".env", ".pem", ".key", ".p12", ".pfx", ".jks", ".keystore",
  ".npmrc", ".netrc", ".pgpass", ".htpasswd",
];
const NOMBRES_CREDENCIALES = [
  "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
  "credentials.json", "service-account.json", "secrets.json",
  ".env.local", ".env.production", ".env.development",
];
const EXT_EJECUTABLES = [
  ".exe", ".msi", ".dll", ".sys", ".scr", ".com", ".bat", ".cmd",
  ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".hta",
  ".jar", ".apk", ".app", ".dmg", ".deb", ".rpm", ".bin", ".iso",
];

type Archivo = { name: string; size: number };

function motivoRechazo(f: Archivo): string | null {
  const nombre = (f.name || "").toLowerCase();
  if (f.size > MAX_ADJUNTO_BYTES) {
    return `supera el tope de 200 MB (${(f.size / 1048576).toFixed(1)} MB)`;
  }
  if (NOMBRES_CREDENCIALES.includes(nombre) || EXT_CREDENCIALES.some((e) => nombre.endsWith(e))) {
    return "parece contener credenciales (claves de API, certificados o tokens) y se enviaría al proveedor del modelo";
  }
  if (EXT_EJECUTABLES.some((e) => nombre.endsWith(e))) {
    return "es un ejecutable o script: no se ejecuta, pero se cargaría entero en memoria y puede colgar la app";
  }
  return null;
}

function filtrar(archivos: Archivo[]): { pasan: Archivo[]; rechazados: string[] } {
  const pasan: Archivo[] = [];
  const rechazados: string[] = [];
  for (const f of archivos) {
    const motivo = motivoRechazo(f);
    if (motivo) rechazados.push(`${f.name} — ${motivo}`);
    else pasan.push(f);
  }
  return { pasan, rechazados };
}

const MB = 1024 * 1024;

// ── 1. Tope de tamaño ──────────────────────────────────────────────────────
comprobar("200 MB exactos pasan", motivoRechazo({ name: "video.mp4", size: 200 * MB }) === null);
comprobar("200 MB + 1 byte se rechaza", motivoRechazo({ name: "video.mp4", size: 200 * MB + 1 }) !== null);
comprobar("1 KB pasa", motivoRechazo({ name: "nota.txt", size: 1024 }) === null);
comprobar("0 bytes pasa", motivoRechazo({ name: "vacio.txt", size: 0 }) === null);
comprobar(
  "el aviso de tamaño dice el peso real",
  (motivoRechazo({ name: "grande.zip", size: 350 * MB }) || "").includes("350.0 MB")
);

// ── 2. Credenciales ────────────────────────────────────────────────────────
const credenciales = [
  ".env", ".env.local", ".env.production", ".env.development",
  "clave.pem", "server.key", "cert.p12", "cert.pfx", "app.jks", "app.keystore",
  ".npmrc", ".netrc", ".pgpass", ".htpasswd",
  "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
  "credentials.json", "service-account.json", "secrets.json",
];
for (const nombre of credenciales) {
  comprobar(`credencial rechazada: ${nombre}`, motivoRechazo({ name: nombre, size: 1024 }) !== null);
}
comprobar(
  "el motivo de credencial explica la fuga",
  (motivoRechazo({ name: ".env", size: 100 }) || "").includes("proveedor del modelo")
);
comprobar(
  "mayúsculas no escapan: .ENV se rechaza",
  motivoRechazo({ name: ".ENV", size: 100 }) !== null
);
comprobar(
  "ruta completa no escapa: C:\\proy\\.env se rechaza",
  motivoRechazo({ name: "C:\\proy\\.env", size: 100 }) !== null
);

// ── 3. Ejecutables ─────────────────────────────────────────────────────────
const ejecutables = [
  "setup.exe", "instalador.msi", "libreria.dll", "driver.sys", "salvapantallas.scr",
  "viejo.com", "script.bat", "script.cmd", "tarea.ps1", "macro.vbs", "macro.vbe",
  "app.jar", "app.apk", "app.dmg", "paquete.deb", "paquete.rpm", "imagen.iso",
];
for (const nombre of ejecutables) {
  comprobar(`ejecutable rechazado: ${nombre}`, motivoRechazo({ name: nombre, size: 1024 }) !== null);
}
comprobar(
  "el motivo de ejecutable dice que no se ejecuta",
  (motivoRechazo({ name: "x.exe", size: 100 }) || "").includes("no se ejecuta")
);

// ── 4. Lo que SÍ debe pasar (no romper lo que funcionaba) ──────────────────
const permitidos = [
  "informe.docx", "datos.zip", "foto.png", "captura.jpg", "audio.mp3", "voz.wav",
  "musica.flac", "nota.m4a", "config.json", "App.tsx", "script.py", "main.ts",
  "estilos.css", "index.html", "README.md", "datos.csv", "hoja.xlsx", "manual.pdf",
];
for (const nombre of permitidos) {
  comprobar(`permitido: ${nombre}`, motivoRechazo({ name: nombre, size: 1024 }) === null);
}

// ── 5. Mezcla: lo bueno entra, lo malo se reporta ──────────────────────────
const mezcla = filtrar([
  { name: "informe.docx", size: 2 * MB },
  { name: ".env", size: 200 },
  { name: "setup.exe", size: 50 * MB },
  { name: "foto.png", size: 1 * MB },
  { name: "enorme.zip", size: 300 * MB },
]);
comprobar("mezcla: pasan 2", mezcla.pasan.length === 2, `pasan=${mezcla.pasan.length}`);
comprobar("mezcla: se rechazan 3", mezcla.rechazados.length === 3, `rechazados=${mezcla.rechazados.length}`);
comprobar(
  "mezcla: los que pasan son los correctos",
  mezcla.pasan.map((f) => f.name).join(",") === "informe.docx,foto.png"
);
comprobar(
  "mezcla: cada rechazo nombra su archivo",
  mezcla.rechazados.every((r) => r.includes(" — "))
);

// ── 6. El componente declara las MISMAS listas (anti-deriva) ───────────────
let fuente = "";
try {
  fuente = readFileSync(FUENTE, "utf8");
} catch {
  fuente = "";
}
comprobar("se pudo leer ChatCenter.tsx", fuente.length > 0);
if (fuente) {
  comprobar("el componente declara EXT_CREDENCIALES", fuente.includes("EXT_CREDENCIALES"));
  comprobar("el componente declara NOMBRES_CREDENCIALES", fuente.includes("NOMBRES_CREDENCIALES"));
  comprobar("el componente declara EXT_EJECUTABLES", fuente.includes("EXT_EJECUTABLES"));
  comprobar("el componente declara motivoRechazo", fuente.includes("motivoRechazo"));
  comprobar(
    "el tope del componente es 200 MB",
    fuente.includes("200 * 1024 * 1024")
  );
  // Cada extensión de las listas debe estar literalmente en el fuente.
  const faltantes = [...EXT_CREDENCIALES, ...EXT_EJECUTABLES].filter(
    (e) => !fuente.includes(`"${e}"`)
  );
  comprobar(
    "todas las extensiones están en el fuente",
    faltantes.length === 0,
    faltantes.length ? `faltan: ${faltantes.join(", ")}` : undefined
  );
  const faltantesNombres = NOMBRES_CREDENCIALES.filter((n) => !fuente.includes(`"${n}"`));
  comprobar(
    "todos los nombres de credencial están en el fuente",
    faltantesNombres.length === 0,
    faltantesNombres.length ? `faltan: ${faltantesNombres.join(", ")}` : undefined
  );
  // Las dos puertas (clip y arrastre) usan la misma función.
  const usos = (fuente.match(/filtrarPorTamano\(/g) || []).length;
  comprobar("filtrarPorTamano se usa en las dos puertas", usos >= 2, `usos=${usos}`);
  comprobar(
    "el input del clip NO tiene accept restrictivo",
    !/ref=\{fileInputRef\}[\s\S]{0,200}accept=/.test(fuente)
  );
}

// ── Informe ────────────────────────────────────────────────────────────────
console.log(`\nclausulasAdjunto: ${correctas} correctas · ${fallidas} fallidas`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(`  ✗ ${f}`);
  process.exit(1);
}
process.exit(0);
