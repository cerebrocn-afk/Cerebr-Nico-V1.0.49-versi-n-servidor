/**
 * src/engine/generadorEscena3D.ts — EL GENERADOR DE AMBIENTES 3D (v1.0.9)
 * ========================================================================
 * QUÉ RESUELVE. Hasta v1.0.8 la casa podía AUDITAR una escena 3D (testigoEscena)
 * y COMPARAR dos fotogramas (fotogramas.ts), pero «generar un ambiente 3D» seguía
 * dependiendo de que el modelo escribiera a mano los tres archivos siguiendo la
 * skill `cn-web-escena-3d`. Un modelo libre se equivoca en el importmap, mete el
 * JS inline, usa `getPoint` en vez de `getPointAt`, u olvida los testigos DOM — y
 * la obra cae en la valla recién al final.
 *
 * Este módulo PRODUCE, de forma pura y determinista, los tres archivos de un
 * ambiente 3D navegable que YA cumple el contrato de la casa: `index.html` con
 * CSP `'self'` + importmap al motor vendorizado + JS afuera; `estilo.css`; y
 * `main.js` con render NATIVO (`WebGLRenderer`), cámara, luces, geometría
 * procedural, `OrbitControls`, recorrido por longitud de arco (`getPointAt`),
 * testigos DOM y limpieza (`dispose` + `cancelAnimationFrame`).
 *
 * HONESTIDAD DEL ENTORNO. Generar no es renderizar: este módulo no abre un
 * navegador ni mira un píxel. Lo que garantiza es que la obra generada PASA al
 * testigo (`auditarEscena3D`) sin tocarla a mano — el `resumen` lo dice y repite
 * que los píxeles no se midieron. Es puro a propósito: así se puede corroborar en
 * Node16 sin `node_modules`, sin display y sin red.
 */

export type AmbienteTipo = "ciudad" | "bosque" | "espacio" | "abstracto" | "terreno";

export type OpcionesEscena = {
  /** Tipo de ambiente; si no se pasa, se deriva de la semilla. */
  tipo?: AmbienteTipo;
  /** Título visible de la obra. */
  titulo?: string;
  /** Semilla entera para que la geometría sea reproducible byte a byte. */
  semilla?: number;
  /** Cuántos cuerpos procedurales sembrar (se capa entre 24 y 400). */
  densidad?: number;
};

export type ArchivoEscena = { ruta: string; contenido: string };

export type EscenaGenerada = {
  tipo: AmbienteTipo;
  titulo: string;
  semilla: number;
  archivos: ArchivoEscena[]; // index.html, estilo.css, main.js (en ese orden)
  resumen: string;
  /** Lo que generar NO demuestra: que se vea y se mueva (eso lo mide el navegador). */
  noMedible: string;
};

export const TIPOS_AMBIENTE: AmbienteTipo[] = ["ciudad", "bosque", "espacio", "abstracto", "terreno"];

/** PRNG mulberry32: determinista, sin dependencias. Misma semilla => misma secuencia. */
function prng(semilla: number): () => number {
  let a = semilla >>> 0 || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paleta y cuerpo procedural por tipo de ambiente (datos, no criterio estético). */
function perfilAmbiente(tipo: AmbienteTipo): {
  fondo: string; niebla: string; cielo: number; suelo: number;
  geometria: string; material: string; descripcion: string;
} {
  switch (tipo) {
    case "ciudad":
      return { fondo: "#0b1020", niebla: "#0b1020", cielo: 0x9fb4ff, suelo: 0x141a2e,
        geometria: "new THREE.BoxGeometry(1, 1, 1)", material: "new THREE.MeshStandardMaterial({ color: col, metalness: 0.35, roughness: 0.55 })",
        descripcion: "torres de alturas variables sobre una retícula urbana" };
    case "bosque":
      return { fondo: "#0c140d", niebla: "#0c140d", cielo: 0xbfe6a8, suelo: 0x12210f,
        geometria: "new THREE.ConeGeometry(0.5, 1.6, 7)", material: "new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })",
        descripcion: "copas cónicas dispersas como un bosque de coníferas" };
    case "espacio":
      return { fondo: "#02030a", niebla: "#02030a", cielo: 0x8899ff, suelo: 0x05060f,
        geometria: "new THREE.IcosahedronGeometry(0.6, 0)", material: "new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.3 })",
        descripcion: "asteroides icosaédricos flotando en un campo estelar" };
    case "terreno":
      return { fondo: "#10121a", niebla: "#10121a", cielo: 0xcdd6ff, suelo: 0x1a2030,
        geometria: "new THREE.TetrahedronGeometry(0.7, 0)", material: "new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.85 })",
        descripcion: "crestas tetraédricas que simulan un relieve montañoso" };
    case "abstracto":
    default:
      return { fondo: "#0a0a12", niebla: "#0a0a12", cielo: 0xffffff, suelo: 0x101018,
        geometria: "new THREE.TorusKnotGeometry(0.45, 0.16, 96, 16)", material: "new THREE.MeshStandardMaterial({ color: col, metalness: 0.6, roughness: 0.25 })",
        descripcion: "nudos tóricos metálicos en una composición abstracta" };
  }
}

const NO_MEDIBLE_GEN =
  "LO QUE GENERAR NO DEMUESTRA: que se vea y se mueva. Este modulo escribe archivos que PASAN al testigo " +
  "(montaje + contrato), pero nadie renderizo los pixeles ni comparo dos fotogramas: eso necesita el navegador. " +
  "Un 'ok' aqui autoriza a decir 'la obra esta bien armada y la aprueba su propio testigo', NO 'se ve y se mueve'.";

/** Escapa texto para incrustarlo seguro como contenido HTML (anti-inyección). */
function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** index.html: CSP 'self', importmap al motor vendorizado, JS afuera, div de 300vh para el scroll. */
function construirHtml(titulo: string, descripcion: string): string {
  const t = esc(titulo);
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <!-- CSP local: la obra se abre desde 127.0.0.1 sin internet; nada de CDN. -->",
    `  <meta http-equiv="Content-Security-Policy" content="default-src 'self'" />`,
    `  <title>${t}</title>`,
    "  <!-- El mapa de importaciones va ANTES del modulo: OrbitControls importa 'three' pelado. -->",
    '  <script type="importmap">',
    "  {",
    '    "imports": {',
    '      "three": "/vendor/three/three.module.js",',
    '      "three/addons/": "/vendor/three/addons/"',
    "    }",
    "  }",
    "  <\/script>",
    `  <link rel="stylesheet" href="estilo.css" />`,
    "</head>",
    "<body>",
    `  <canvas id="lienzo" data-motor="three-r169" data-progreso="0" data-fotograma="0"></canvas>`,
    '  <header class="hud">',
    `    <h1>${t}</h1>`,
    `    <p>${esc(descripcion)}</p>`,
    '    <p class="pista">Deslizá para recorrer la escena · arrastrá para mirar alrededor</p>',
    "  </header>",
    '  <!-- Altura real: sin esto el scroll no existe y la camara no avanza. -->',
    '  <div class="recorrido" aria-hidden="true"></div>',
    '  <script type="module" src="main.js"><\/script>',
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** estilo.css: lienzo fijo de fondo, HUD legible, 300vh de recorrido. */
function construirCss(fondo: string): string {
  return [
    "/* Generado por generadorEscena3D.ts — ambiente 3D navegable */",
    ":root { color-scheme: dark; }",
    `* { margin: 0; box-sizing: border-box; }`,
    `body { background: ${fondo}; color: #eef1ff; font-family: system-ui, sans-serif; }`,
    "#lienzo { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; z-index: 0; }",
    ".hud { position: fixed; top: 0; left: 0; right: 0; z-index: 1; padding: 24px 28px; pointer-events: none;",
    "  background: linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,0)); }",
    ".hud h1 { font-size: clamp(20px, 4vw, 40px); letter-spacing: .5px; }",
    ".hud p { opacity: .85; max-width: 52ch; margin-top: 6px; font-size: 14px; }",
    ".hud .pista { opacity: .6; margin-top: 10px; font-size: 12px; }",
    ".recorrido { position: relative; height: 300vh; z-index: -1; }",
    "",
  ].join("\n");
}

/** main.js: render NATIVO con three vendorizado, cámara que sigue el scroll por
 *  longitud de arco, testigos DOM y limpieza. Sin backticks: se arma por líneas. */
function construirMainJs(
  perfil: ReturnType<typeof perfilAmbiente>,
  tipo: AmbienteTipo,
  semilla: number,
  densidad: number
): string {
  return [
    "// Generado por generadorEscena3D.ts — ambiente '" + tipo + "' · render nativo (three r169)",
    "import * as THREE from 'three';",
    "import { OrbitControls } from 'three/addons/OrbitControls.js';",
    "",
    "// PRNG determinista: misma semilla => misma geometria (reproducible).",
    "function prng(s) {",
    "  let a = (s >>> 0) || 1;",
    "  return function () {",
    "    a |= 0; a = (a + 0x6d2b79f5) | 0;",
    "    let t = Math.imul(a ^ (a >>> 15), 1 | a);",
    "    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;",
    "    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;",
    "  };",
    "}",
    "const rand = prng(" + (semilla >>> 0) + ");",
    "const CUERPOS = " + densidad + ";",
    "",
    "const lienzo = document.getElementById('lienzo');",
    "// RENDER NATIVO: WebGLRenderer del motor vendorizado, sin CDN.",
    "const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });",
    "renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));",
    "renderer.setSize(window.innerWidth, window.innerHeight, false);",
    "",
    "const scene = new THREE.Scene();",
    "scene.background = new THREE.Color('" + perfil.niebla + "');",
    "scene.fog = new THREE.Fog(new THREE.Color('" + perfil.niebla + "').getHex(), 12, 120);",
    "",
    "const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);",
    "camera.position.set(0, 6, 18);",
    "",
    "// Luces: una hemisferica (cielo/suelo) + una direccional con sombra suave.",
    "const luzCielo = new THREE.HemisphereLight(" + perfil.cielo + ", " + perfil.suelo + ", 0.9);",
    "scene.add(luzCielo);",
    "const luzSol = new THREE.DirectionalLight(0xffffff, 1.1);",
    "luzSol.position.set(8, 18, 10);",
    "scene.add(luzSol);",
    "",
    "// Piso de referencia para anclar la perspectiva.",
    "const geoPiso = new THREE.PlaneGeometry(400, 400);",
    "const matPiso = new THREE.MeshStandardMaterial({ color: " + perfil.suelo + ", roughness: 1 });",
    "const piso = new THREE.Mesh(geoPiso, matPiso);",
    "piso.rotation.x = -Math.PI / 2; piso.position.y = -2;",
    "scene.add(piso);",
    "",
    "// Geometria procedural del ambiente (sembrada, reproducible).",
    "const geoCuerpo = " + perfil.geometria + ";",
    "const grupo = new THREE.Group();",
    "const materiales = [];",
    "for (let i = 0; i < CUERPOS; i++) {",
    "  const col = new THREE.Color().setHSL(rand(), 0.55 + rand() * 0.3, 0.45 + rand() * 0.25);",
    "  const mat = " + perfil.material + ";",
    "  materiales.push(mat);",
    "  const m = new THREE.Mesh(geoCuerpo, mat);",
    "  const r = 6 + rand() * 42;",
    "  const ang = rand() * Math.PI * 2;",
    "  m.position.set(Math.cos(ang) * r, rand() * 6, Math.sin(ang) * r);",
    "  const alto = 0.6 + rand() * 6;",
    "  m.scale.set(0.6 + rand() * 1.4, alto, 0.6 + rand() * 1.4);",
    "  m.rotation.y = rand() * Math.PI;",
    "  grupo.add(m);",
    "}",
    "scene.add(grupo);",
    "",
    "const controles = new OrbitControls(camera, renderer.domElement);",
    "controles.enableDamping = true; controles.enablePan = false;",
    "controles.target.set(0, 2, 0);",
    "",
    "// Recorrido por LONGITUD DE ARCO: getPointAt(t), no la variante pelada (que frena en las curvas).",
    "const camino = new THREE.CatmullRomCurve3([",
    "  new THREE.Vector3(0, 6, 22), new THREE.Vector3(-18, 8, 6), new THREE.Vector3(-6, 10, -18),",
    "  new THREE.Vector3(16, 7, -10), new THREE.Vector3(14, 9, 14), new THREE.Vector3(0, 6, 22),",
    "], true);",
    "const arriba = new THREE.Vector3(0, 1, 0);",
    "const mir = new THREE.Matrix4();",
    "let progresoSuave = 0;",
    "",
    "function progresoScroll() {",
    "  const h = document.documentElement.scrollHeight - window.innerHeight;",
    "  return h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;",
    "}",
    "",
    "let cuadro = 0;",
    "let animId = 0;",
    "function bucle() {",
    "  animId = requestAnimationFrame(bucle);",
    "  const objetivo = progresoScroll();",
    "  progresoSuave += (objetivo - progresoSuave) * 0.08; // lerp suave, no salto",
    "  const t = progresoSuave % 1;",
    "  const p = camino.getPointAt(t);",
    "  const d = camino.getPointAt((t + 0.01) % 1);",
    "  camera.position.lerp(p, 0.12);",
    "  mir.lookAt(camera.position, d, arriba);",
    "  grupo.rotation.y += 0.0015;",
    "  controles.update();",
    "  renderer.render(scene, camera);",
    "  cuadro++;",
    "  // Testigos DOM: sin esto nadie puede probar que la escena cambio.",
    "  lienzo.dataset.motor = 'three-r169';",
    "  lienzo.dataset.progreso = objetivo.toFixed(3);",
    "  lienzo.dataset.fotograma = String(cuadro);",
    "}",
    "bucle();",
    "",
    "const ro = new ResizeObserver(function () {",
    "  camera.aspect = window.innerWidth / window.innerHeight;",
    "  camera.updateProjectionMatrix();",
    "  renderer.setSize(window.innerWidth, window.innerHeight, false);",
    "});",
    "ro.observe(document.body);",
    "",
    "// Limpieza: el preview comparte origen entre proyectos; una escena vieja gasta GPU.",
    "function limpiar() {",
    "  cancelAnimationFrame(animId);",
    "  ro.disconnect();",
    "  controles.dispose();",
    "  geoCuerpo.dispose();",
    "  geoPiso.dispose();",
    "  matPiso.dispose();",
    "  for (const m of materiales) { m.dispose(); }",
    "  renderer.dispose();",
    "}",
    "window.addEventListener('beforeunload', limpiar);",
    "window.addEventListener('pagehide', limpiar);",
    "",
  ].join("\n");
}

/**
 * Genera un ambiente 3D navegable completo (index.html + estilo.css + main.js).
 * Determinista: misma `semilla` + mismas opciones => mismos bytes. La obra
 * resultante PASA al testigo (`auditarEscena3D`) sin edición manual.
 */
export function generarEscena3D(op: OpcionesEscena = {}): EscenaGenerada {
  const semilla = Number.isFinite(op.semilla as number) ? (op.semilla as number) >>> 0 : 1;
  const r = prng(semilla);
  const tipo: AmbienteTipo = op.tipo && TIPOS_AMBIENTE.includes(op.tipo)
    ? op.tipo
    : TIPOS_AMBIENTE[Math.floor(r() * TIPOS_AMBIENTE.length) % TIPOS_AMBIENTE.length];
  const perfil = perfilAmbiente(tipo);
  const titulo = (op.titulo && String(op.titulo).trim()) || ("Ambiente 3D · " + tipo);
  const densidad = Math.max(24, Math.min(400, Math.round(op.densidad ?? 120)));

  const archivos: ArchivoEscena[] = [
    { ruta: "index.html", contenido: construirHtml(titulo, perfil.descripcion) },
    { ruta: "estilo.css", contenido: construirCss(perfil.fondo) },
    { ruta: "main.js", contenido: construirMainJs(perfil, tipo, semilla, densidad) },
  ];

  return {
    tipo,
    titulo,
    semilla,
    archivos,
    resumen: "Ambiente '" + tipo + "' (" + perfil.descripcion + "), " + densidad +
      " cuerpos procedurales, render nativo con three r169 vendorizado. " + NO_MEDIBLE_GEN,
    noMedible: NO_MEDIBLE_GEN,
  };
}
