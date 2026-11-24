/**
 * concienciaArtista.test.ts — CONCIENCIA DE ARTISTA x5 (v1.26.0)
 * ==============================================================
 * Se ejecuta con:  npx tsx tests/concienciaArtista.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * En v1.25.0 la conciencia de artista eran tres preguntas en el prompt — fe, no
 * mecánica. Esta suite blinda su evolución x5: los CINCO ejes de oficio miden
 * señales reales del artefacto, el puntaje 0-10 es determinista, y el BUCLE
 * creador/modificador corta por umbral o por tope SIN mentir «listo» con obra
 * cruda. Cada línea existe porque un juez que sólo aprueba lo perfecto no juzga.
 *
 *   1. CADA EJE DETECTA DE VERDAD: se siembra un artefacto con el defecto y se
 *      exige que el eje lo baje de puntos. Un eje que siempre da 2 no vigila.
 *   2. DETERMINISMO: misma entrada → mismo dictamen (nada de azar ni de reloj).
 *   3. EL BUCLE NO MIENTE: al agotar el tope con puntaje bajo, la parada es
 *      `max_iteraciones` con lo pendiente listado, nunca `objetivo_alcanzado`.
 *   4. NO-FRONTEND NO SE BLOQUEA: un script se juzga sólo por intención.
 */
import {
  ejeTerminacionVisual,
  ejeEstadosCompletos,
  ejeAccesibilidadOficio,
  ejeCoherenciaSistema,
  ejeIntencionCumplida,
  evaluarObra,
  pasoBucleCreadorModificador,
  UMBRAL_ENTREGA,
  MAX_ITERACIONES_ARTISTA,
  // v1.27.0 — conciencia de artista x10
  ejeResponsiveFit,
  ejeFeedbackInteraccion,
  ejeConsistenciaCopy,
  ejeRobustezDatos,
  ejeRendimientoPercibido,
  auditarObraX10,
  pasoBucleArtistaX10,
  type Artefacto,
} from "../src/engine/concienciaArtista";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}

// Un artefacto frontend de oficio: pasa los cinco ejes.
const OBRA_DE_OFICIO: Artefacto = {
  ruta: "index.html",
  brief: "panel de tareas con lista, filtro y creación",
  fuente: `<!doctype html><html><head><link rel="stylesheet" href="s.css"></head>
  <body>
    <header><nav><button aria-label="menú">≡</button></nav></header>
    <main>
      <h1>Panel de tareas</h1>
      <h2>Filtro</h2>
      <form><label for="q">Buscar</label><input id="q" /></form>
      <img src="logo.png" alt="logo del panel" />
      <section aria-busy="false">
        <div class="loading skeleton">cargando…</div>
        <p class="empty">No hay tareas: crea la primera</p>
      </section>
      <script>try { render(); } catch (e) { onError(e); }</script>
    </main>
    <footer>creación de tareas y filtro</footer>
  </body></html>`,
  css: `:root{--bg:#111;--fg:#eee;--acc:#4af}
  body{margin:0;padding:1rem;gap:1rem;background:var(--bg);color:var(--fg)}
  h1{margin-bottom:1rem} main{padding:2rem;gap:1rem}`,
};

console.log("\n[1] Cada eje detecta su defecto");
comprobar("terminación: placeholder baja puntos",
  ejeTerminacionVisual({ ruta: "a.html", fuente: "<h1>x</h1><p>[Personaliza este texto]</p>", css: "" }).puntos < 2);
comprobar("terminación: jerarquía+espaciado sube",
  ejeTerminacionVisual(OBRA_DE_OFICIO).puntos === 2);
comprobar("estados: un solo estado no llega a 2",
  ejeEstadosCompletos({ ruta: "a.html", fuente: "<div>todo lleno</div>" }).puntos < 2);
comprobar("estados: carga+error+vacío da 2",
  ejeEstadosCompletos(OBRA_DE_OFICIO).puntos === 2);
comprobar("accesibilidad: img sin alt baja",
  ejeAccesibilidadOficio({ ruta: "a.html", fuente: "<img src=x><div>y</div>" }).puntos < 2);
comprobar("accesibilidad: semántica+alt+label sube",
  ejeAccesibilidadOficio(OBRA_DE_OFICIO).puntos === 2);
comprobar("coherencia: arcoíris de hex baja",
  ejeCoherenciaSistema({ ruta: "a.css", fuente: "", css: "#111 #222 #333 #444 #555 #666 #777 #888 #999" }).puntos < 2);
comprobar("coherencia: tokens + paleta contenida sube",
  ejeCoherenciaSistema(OBRA_DE_OFICIO).puntos === 2);
comprobar("intención: marcador perezoso baja",
  ejeIntencionCumplida({ ruta: "a.tsx", fuente: "// resto igual\nexport const X = 1;", brief: "boton" }).puntos < 2);

console.log("\n[2] El juez de la obra completa");
const dictamen = evaluarObra(OBRA_DE_OFICIO);
comprobar("obra de oficio se entrega", dictamen.veredicto === "entregar", `puntaje=${dictamen.puntaje}`);
comprobar("puntaje de oficio >= umbral", dictamen.puntaje >= UMBRAL_ENTREGA, `${dictamen.puntaje}`);
const crudo = evaluarObra({ ruta: "a.html", fuente: "<div>[Personaliza este texto]<img src=x></div>", css: "", brief: "tienda" });
comprobar("obra cruda no se entrega", crudo.veredicto !== "entregar", crudo.veredicto);
comprobar("obra cruda trae directiva accionable", crudo.directiva.length > 10 && /\d\)/.test(crudo.directiva));

console.log("\n[3] Determinismo");
comprobar("misma entrada, mismo puntaje",
  evaluarObra(OBRA_DE_OFICIO).puntaje === evaluarObra(OBRA_DE_OFICIO).puntaje);
const pobre: Artefacto = { ruta: "a.html", fuente: "<div>x</div>", brief: "y" };
comprobar("misma entrada, mismo veredicto",
  evaluarObra(pobre).veredicto === evaluarObra(pobre).veredicto);

console.log("\n[4] El bucle creador/modificador no miente");
const pasoOk = pasoBucleCreadorModificador(OBRA_DE_OFICIO, 0);
comprobar("obra digna corta con objetivo_alcanzado", pasoOk.parada === "objetivo_alcanzado");
const obraFloja: Artefacto = { ruta: "a.html", fuente: "<h1>x</h1><div>y</div>", css: "", brief: "landing" };
const pasoSeguir = pasoBucleCreadorModificador(obraFloja, 0);
comprobar("obra floja en iteración temprana: seguir", pasoSeguir.parada === "seguir");
const pasoTope = pasoBucleCreadorModificador(obraFloja, MAX_ITERACIONES_ARTISTA - 1);
comprobar("al agotar el tope no dice objetivo_alcanzado", pasoTope.parada === "max_iteraciones");
comprobar("al agotar el tope lista lo pendiente", pasoTope.siguiente.includes("pendiente"));

console.log("\n[5] No-frontend no se bloquea por la vara visual");
const script = evaluarObra({ ruta: "utils.py", fuente: "def suma(a,b):\n    return a+b\n", brief: "suma dos numeros" });
comprobar("script juzgado solo por intención", script.ejes.length === 1 && script.ejes[0].eje === "intencion_cumplida");

// ═══════════════════════════════════════════════════════════════════════
// v1.27.0 — CONCIENCIA DE ARTISTA x10: los 5 ejes nuevos + auditoría ponderada
// ═══════════════════════════════════════════════════════════════════════

// Una obra que aprueba los DIEZ ejes (para el techo de la auditoría ponderada).
const OBRA_X10: Artefacto = {
  ruta: "app.html",
  brief: "panel responsive con formulario validado y filtro",
  fuente: `<!doctype html><html lang="es"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="s.css"></head>
  <body>
    <header><nav><button aria-label="menú">≡</button></nav></header>
    <main>
      <h1>Panel responsive</h1>
      <h2>Filtro</h2>
      <form><label for="q">Buscar</label><input id="q" required type="email" /></form>
      <img src="logo.png" alt="logo" width="120" height="40" loading="lazy" />
      <section aria-busy="false">
        <div class="loading skeleton">cargando…</div>
        <p class="empty">No hay tareas: crea la primera</p>
      </section>
      <script>try { render(); } catch (e) { onError(e); }</script>
    </main>
    <footer>formulario validado y filtro</footer>
  </body></html>`,
  css: `:root{--bg:#111;--fg:#eee;--acc:#4af}
  body{margin:0;padding:1rem;gap:1rem;background:var(--bg);color:var(--fg)}
  h1{margin-bottom:1rem} main{padding:2rem;gap:1rem;max-width:70rem}
  button{transition:background .2s} button:hover{background:var(--acc)} button:disabled{opacity:.5}
  @media (max-width:640px){ main{padding:1rem} }`,
};

console.log("\n[6] Los 5 ejes nuevos detectan su defecto");
comprobar("responsive: ancho fijo grande sin viewport baja",
  ejeResponsiveFit({ ruta: "a.html", fuente: "<div>x</div>", css: "div{width:1200px}" }).puntos < 2);
comprobar("responsive: viewport+fluido+sin ancho fijo sube",
  ejeResponsiveFit(OBRA_X10).puntos === 2);
comprobar("feedback: sin hover ni transición baja",
  ejeFeedbackInteraccion({ ruta: "a.html", fuente: "<button>x</button>", css: "button{color:red}" }).puntos < 2);
comprobar("feedback: hover+transición sube",
  ejeFeedbackInteraccion(OBRA_X10).puntos === 2);
comprobar("copy: fuga de undefined baja",
  ejeConsistenciaCopy({ ruta: "a.html", fuente: "<span> undefined </span>" }).puntos < 2);
comprobar("copy: texto limpio sube",
  ejeConsistenciaCopy(OBRA_X10).puntos === 2);
comprobar("robustez: secreto hardcodeado es crítico y da 0",
  (() => { const h = ejeRobustezDatos({ ruta: "a.tsx", fuente: 'const k="sk-abcdef0123456789abcd"' }); return h.puntos === 0 && h.severidad === "critico"; })());
comprobar("robustez: validación + sin secreto sube",
  ejeRobustezDatos(OBRA_X10).puntos === 2);
comprobar("rendimiento: base64 gigante baja",
  ejeRendimientoPercibido({ ruta: "a.html", fuente: '<img src="data:image/png;base64,' + "A".repeat(2100) + '">' }).puntos < 2);
comprobar("rendimiento: lazy + dimensiones sube",
  ejeRendimientoPercibido(OBRA_X10).puntos === 2);

console.log("\n[7] Auditoría ponderada x10");
const d10 = auditarObraX10(OBRA_X10);
comprobar("obra x10 completa se entrega", d10.veredicto === "entregar", `puntaje=${d10.puntaje}`);
// v1.31.0 — la auditoría ampliada de v1.28.0 evalúa 14 ejes (el tipo se quedó
// llamándose X10 por compatibilidad, dice el fuente); la valla seguía en 10.
comprobar("auditoría x10 evalua sus 14 ejes en frontend", d10.ejes.length === 14, `${d10.ejes.length}`);
comprobar("cada eje trae peso y severidad", d10.ejes.every((e) => !!e.peso && !!e.severidad));
const conSecreto = auditarObraX10({ ruta: "a.tsx", fuente: '<h1>x</h1><h2>y</h2>\nconst k="sk-abcdef0123456789abcd"', css: "", brief: "panel" });
comprobar("un secreto hardcodeado bloquea la entrega (bloqueoCritico)", conSecreto.bloqueoCritico === true);
comprobar("con bloqueo crítico jamás se entrega", conSecreto.veredicto !== "entregar");
comprobar("la directiva del bloqueo crítico lo nombra", /CRÍTICO/.test(conSecreto.directiva));

console.log("\n[8] El bucle x10 no miente y cuenta lo resuelto");
const pasoX10Ok = pasoBucleArtistaX10(OBRA_X10, 0);
comprobar("obra x10 digna corta con objetivo_alcanzado", pasoX10Ok.parada === "objetivo_alcanzado");
comprobar("reporta ejes resueltos (2/2)", pasoX10Ok.resueltos.length >= 8, `${pasoX10Ok.resueltos.length}`);
const florojaX10: Artefacto = { ruta: "a.html", fuente: "<h1>x</h1><div>y</div>", css: "", brief: "landing" };
const topeX10 = pasoBucleArtistaX10(florojaX10, MAX_ITERACIONES_ARTISTA - 1);
comprobar("al agotar el tope x10 no dice objetivo_alcanzado", topeX10.parada === "max_iteraciones");
comprobar("determinismo x10: mismo puntaje", auditarObraX10(OBRA_X10).puntaje === auditarObraX10(OBRA_X10).puntaje);

console.log(`\n─── concienciaArtista: ${pasan} ✓  ${fallan} ✗ ───`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
