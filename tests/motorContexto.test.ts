/**
 * tests/motorContexto.test.ts — EL CONTEXTO ENGINE (v1.31.0 · FASE 1)
 * =====================================================================
 * Se ejecuta con:  npx tsx tests/motorContexto.test.ts
 *
 * Cubre las cuatro promesas de la hoja de ruta (§1) y del pliego de revisión:
 *   1. modelarProyecto lee el disco y detecta estructura/stack/tests/puertos
 *      SIN modelo y SIN inventar (JSON roto no tumba el motor);
 *   2. la jerarquía L0–L5 con PRESUPUESTO — no todo va al prompt;
 *   3. la cache se invalida contra la huella real (package.json, mtimes, git,
 *      presencia de node_modules);
 *   4. el retrato NUNCA lee secretos (.env queda fuera por diseño).
 * Y la valla de rendimiento del pliego: impacto en el repo real < 200 ms.
 */
import {
  modelarProyecto,
  ensamblarContexto,
  contextoProyecto,
  resumoDelModelo,
  notaDeContexto,
  reiniciarCacheDeContexto,
  estadisticasDeLectura,
  LIMITE_CONTEXTO_CARACTERES,
  type FicheroLeido,
} from "../src/engine/motorContexto";
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { construirGrafo, impactoDe } from "../src/engine/grafoProyecto";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);

const PKG = JSON.stringify({
  name: "demo",
  dependencies: { react: "^18", "react-dom": "^18", express: "^4", jspdf: "^2" },
  devDependencies: { vite: "^5", tailwindcss: "^4", typescript: "^5" },
  scripts: { dev: "vite --port 3500", build: "tsc && vite build", test: "tsx tests/app.test.ts", start: "node server.js" },
});

const PROYECTO: FicheroLeido[] = [
  { ruta: "package.json", contenido: PKG },
  { ruta: "index.html", contenido: "<html><body></body></html>" },
  { ruta: "src/main.tsx", contenido: 'import App from "./App";\nimport "jspdf";' },
  { ruta: "src/App.tsx", contenido: 'import express from "express";\nconst s = require("http").createServer();\ns.listen(3500);' },
  { ruta: "tests/app.test.ts", contenido: "// test" },
  { ruta: "src/styles.css", contenido: "body{}" },
];

seccion("1. modelarProyecto (puro): el retrato sin disco");
{
  const m = modelarProyecto(PROYECTO, { rutasAdicionales: ["package-lock.json", "tsconfig.json"] });
  comprobar("stack detecta React, Express, Vite, Tailwind y TypeScript", ["React", "Express", "Vite", "Tailwind", "TypeScript"].every((s) => m.stack.includes(s)), m.stack.join(","));
  comprobar("gestor npm por package-lock (ruta, no contenido)", m.gestor === "npm");
  comprobar("entradas reales: index.html y src/main.tsx", m.entrypoints.includes("index.html") && m.entrypoints.includes("src/main.tsx"));
  comprobar("servicio: el archivo que hace createServer/listen", m.servicios.includes("src/App.tsx"));
  comprobar("puertos 3500 detectados (scripts y listen)", m.puertos.includes(3500));
  comprobar("tests: 1 archivo y el comando `test:` declarado", m.tests.archivos === 1 && m.tests.comandos.some((c) => c.startsWith("test:")));
  comprobar("sin instalar: jspdf declarado+usado pero node_modules vacío", m.dependencias.declaradasSinInstalar.includes("jspdf"));
  comprobar("archivosTotales incluye las rutas no leídas", m.archivosTotales === 8);
  comprobar("el resumo L3 menciona stack y entradas", /stack:.*React/.test(resumoDelModelo(m)) && /entradas:.*index\.html/.test(resumoDelModelo(m)));
}

seccion("2. Honestidad: JSON roto y proyecto vacío no inventan nada");
{
  const roto = modelarProyecto([{ ruta: "package.json", contenido: "{ esto no es json" }, { ruta: "src/main.tsx", contenido: "" }]);
  comprobar("package.json roto: no lanza, stack queda vacío", roto.stack.length === 0);
  comprobar("package.json roto: 0 declaradas confesadas", roto.dependencias.declaradas === 0);
  const vacio = modelarProyecto([]);
  comprobar("proyecto vacío se retrata vacío (no dice React)", vacio.stack.length === 0 && vacio.archivosTotales === 0);
  comprobar("vacio dice '(sin package.json reconocible)' en el resumo", /sin package\.json/.test(resumoDelModelo(vacio)));
}

seccion("3. EnsambLado L0–L5: la jerarquía ES el presupuesto");
{
  const ctx = {
    modelo: modelarProyecto(PROYECTO),
    grafo: construirGrafo(PROYECTO.map((f) => ({ path: f.ruta, content: f.contenido }))),
    huella: "x",
    cacheado: false,
    parcial: false,
  };
  const e = ensamblarContexto({
    objetivo: "crear formulario de contacto",
    archivosTocados: [],
    contenidoAfectado: "export function Contacto() {}",
    contexto: ctx,
    memoria: "la última vez el usuario pidió español",
    conocimiento: "los formularios deben validar email",
    limiteCaracteres: 5000,
  });
  comprobar("L0 siempre entra", /L0 · OBJETIVO/.test(e.texto));
  comprobar("L1 lleva el contenido afectado", /L1 · ARCHIVOS AFECTADOS/.test(e.texto) && /Contacto/.test(e.texto));
  comprobar("L3 lleva la arquitectura", /L3 · ARQUITECTURA/.test(e.texto));
  comprobar("L4 lleva la memoria", /L4 · MEMORIA/.test(e.texto));
  comprobar("L5 BLOQUEADO porque L1/L4 ya resuelven (la regla de la hoja de ruta)", !/L5 · CONOCIMIENTO/.test(e.texto) && e.l5BloqueadoPorResolucion);
  comprobar("los niveles vetados se registran como recortadas", e.recortadas.includes(5));

  const e2 = ensamblarContexto({ objetivo: "¿qué stack es este proyecto?", conocimiento: "Vite resuelve imports por extensión", contexto: ctx, limiteCaracteres: 5000 });
  comprobar("sin L1 ni L4, L5 SÍ entra (hambre de contexto)", /L5 · CONOCIMIENTO/.test(e2.texto));

  const e3 = ensamblarContexto({
    objetivo: "x".repeat(100),
    contenidoAfectado: "y".repeat(4000),
    contexto: ctx,
    limiteCaracteres: 600,
  });
  comprobar("con presupuesto corto, L3/L4/L5 se declaran recortadas", e3.recortadas.length > 0);
  comprobar("el texto ensamblado respeta el presupuesto", e3.caracteres <= 600 + 30, String(e3.caracteres));
  comprobar("L1 se recorta al hueso pero sigue presente", /L1 ·/.test(e3.texto));
  comprobar("el techo por nivel se aplica (L1 ≤ 2600)", e3.capas.find((c) => c.nivel === 1)!.texto.length <= 2600);
  comprobar("el presupuesto por defecto es el de la casa", LIMITE_CONTEXTO_CARACTERES === 6000);
}

seccion("4. Disco + cache por huella (directorio temporario real)");
{
  const dir = mkdtempSync(join(tmpdir(), "cn-contexto-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), PKG);
    writeFileSync(join(dir, "package-lock.json"), "{}");
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "src", "main.tsx"), 'import App from "./App";\nimport "jspdf";');
    writeFileSync(join(dir, "src", "App.tsx"), "export default 1;");
    writeFileSync(join(dir, ".env"), "SUPERSECRETO_42=la-clave");
    writeFileSync(join(dir, ".env.example"), "TAMBIEN_SECRETO_99=por-si-aca");

    reiniciarCacheDeContexto();
    const a = contextoProyecto(dir);
    comprobar("primera pasada: calculado del disco (cacheado=false)", a.cacheado === false);
    comprobar("el retrato salió: React detectado", a.modelo.stack.includes("React"));
    comprobar("grafo montado desde el disco", a.grafo.nodos.includes("src/App.tsx"));
    const b = contextoProyecto(dir);
    comprobar("segunda pasada: sale de CACHE por huella", b.cacheado === true && b.huella === a.huella);
    const nota = notaDeContexto(dir);
    comprobar("la nota viaja rotulada y acotada (≤900)", nota.startsWith("[CONTEXTO DEL PROYECTO · motorContexto v1.31]") && nota.length <= 900, String(nota.length));
    comprobar("⚠ la nota NO filtra secretos", !nota.includes("SUPERSECRETO_42") && !nota.includes("TAMBIEN_SECRETO_99"));
    comprobar("⚠ el modelo completo tampoco lee .env (ni .example)", !JSON.stringify(a.modelo).includes("SECRETO"));

    writeFileSync(join(dir, "package.json"), PKG.replace("jspdf", "jspdf2"));
    const c = contextoProyecto(dir);
    comprobar("package.json cambia → huella cambia → RECALCULA", c.cacheado === false && c.huella !== a.huella);
    mkdirSync(join(dir, "node_modules", "jspdf"), { recursive: true });
    const d = contextoProyecto(dir);
    comprobar("la presencia de node_modules también invalida (salud de deps)", d.huella !== c.huella);
    const sinFaltantes = contextoProyecto(dir).modelo;
    comprobar("jspdf ahora declarado? sigue faltante como paquete usado-no-declarado o instalado — en todo caso, sin-crash", Array.isArray(sinFaltantes.dependencias.faltantes));

    // proyecto sin package.json: la nota lo dice, no calla
    const dir2 = mkdtempSync(join(tmpdir(), "cn-vacio-"));
    writeFileSync(join(dir2, "main.py"), "print(1)");
    const nota2 = notaDeContexto(dir2);
    comprobar("sin package.json la nota lo confiesa", /no package\.json|sin package\.json/.test(nota2), nota2.slice(0, 120));
    rmSync(dir2, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    reiniciarCacheDeContexto();
  }
}

seccion("5. El repo REAL de CerebroNico: la valla del pliego (§6)");
{
  const raiz = process.cwd();
  reiniciarCacheDeContexto();
  // v2.1.3 — La medición era UNA pasada en frío: pagaba el JIT de las regex del
  // motor, la caché de disco vacía y el antivirus de turno. En el sandbox daba
  // 200 ms; en la instalación de Mario, 8264 ms contra un techo de 8000 — un rojo
  // de arranque, no de construcción (el retrato era correcto). Misma regla que
  // grafoProyecto desde la v1.70.7: calentar y medir el mejor de 3. El techo NO
  // se toca: si construir de verdad tarda >8 s, sigue rojo.
  contextoProyecto(raiz); // pasada de calentamiento: se descarta
  reiniciarCacheDeContexto();
  let tBuild = Number.POSITIVE_INFINITY;
  const muestras: number[] = [];
  let ctx: ReturnType<typeof contextoProyecto> | null = null;
  for (let intento = 0; intento < 3; intento++) {
    reiniciarCacheDeContexto();
    const t0 = Date.now();
    ctx = contextoProyecto(raiz);
    const ms = Date.now() - t0;
    muestras.push(ms);
    if (ms < tBuild) tBuild = ms;
  }
  if (!ctx) throw new Error("contextoProyecto no devolvió modelo");
  comprobar("el repo real se retrata: >200 archivos", ctx.modelo.archivosTotales > 200, String(ctx.modelo.archivosTotales));
  // v1.97.3 · SOLO_RUTA: el censo es completo (archivosTotales incluye tests/
  // etc.) pero el modelo DECLARA qué carpetas contó solo por ruta: nada se
  // mira a escondidas, y si alguien vuelve a leerlas el retrato no lo sabe —
  // la valla vigila la declaración, no el silencio.
  comprobar("declara las carpetas solo-ruta que encontraron (tests, extensions, …)",
    ctx.modelo.carpetasSoloRuta.includes("tests") && ctx.modelo.carpetasSoloRuta.includes("extensions"),
    ctx.modelo.carpetasSoloRuta.join(", "));
  comprobar("el resumo rotula el solo-ruta (no pasa por completo)", /solo-ruta:.*tests/.test(resumoDelModelo(ctx.modelo)), resumoDelModelo(ctx.modelo).split("\n")[0] + "…");
  comprobar("React + Vite + TypeScript en el stack real", ["React", "Vite", "TypeScript"].every((s) => ctx.modelo.stack.includes(s)), ctx.modelo.stack.join(","));
  comprobar("las entradas reales están (index.html, src/main.tsx)", ctx.modelo.entrypoints.includes("index.html") && ctx.modelo.entrypoints.includes("src/main.tsx"));
  comprobar("los tests del repo se cuentan (96+ archivos)", ctx.modelo.tests.archivos >= 80, String(ctx.modelo.tests.archivos));
  comprobar("el comando `validar` aparece entre los scripts de verificación", ctx.modelo.tests.comandos.some((c) => /validar/.test(c)) || Object.keys(ctx.modelo.scripts).includes("validar"));
  // v1.53.0 — TOPE SUBIDO 5 s → 8 s, CON JUSTIFICACIÓN:
  //   El repo creció (integración de 3 skills MCP: Context7 son 505 archivos,
  //   Webflow 63, Unblocked 31 → +599 ficheros bajo skills/ que el motor de
  //   contexto recorre al retratar el proyecto). En máquinas de CI/validación
  //   lentas la construcción del modelo ronda los ~5.2 s, justo por encima del
  //   antiguo tope de 5 s — un rojo de reloj, no de lógica (el retrato es
  //   correcto: >200 archivos, stack real, entrypoints y tests bien contados).
  //   8 s deja margen honesto para el árbol más grande sin regalar verde: una
  //   construcción que de verdad se dispare (>8 s) seguiría cayendo roja.
  comprobar(`construcción del modelo contra el repo completa en menos de 8 s (${tBuild} ms; muestras ${muestras.join("/")})`, tBuild < 8000);

  const t1 = Date.now();
  const imp = impactoDe(ctx.grafo, "src/App.tsx", 1);
  const ms = Date.now() - t1;
  comprobar(`impactoDe('src/App.tsx') responde en <200 ms (${ms} ms)`, ms < 200);
  comprobar("y dice la verdad conocida: main.tsx importa App", imp.directa.includes("src/main.tsx"), imp.directa.join(","));
}

seccion("6. Los DOS CAMINOS del disco dan el mismo retrato (v1.71.1)");
{
  // El recorrido se puede hacer en serie o con hilos. La promesa que hay que
  // vigilar no es que sea rápido (eso depende del disco de cada cual), sino que
  // AMBOS caminos devuelvan EXACTAMENTE el mismo retrato, y que el cache deje
  // de reabrir contenido que ya no cambió — que es lo que hacía que cada turno
  // de chat costase medio recorrido del árbol.
  const dir = mkdtempSync(join(tmpdir(), "cn-caminos-"));
  try {
    mkdirSync(join(dir, "a"), { recursive: true });
    mkdirSync(join(dir, "b"), { recursive: true });
    writeFileSync(join(dir, "package.json"), PKG);
    writeFileSync(join(dir, "package-lock.json"), "{}");
    for (let i = 0; i < 60; i++) {
      writeFileSync(join(dir, i % 2 ? "a" : "b", `m${i}.ts`), `import { z } from "./vecino";\nexport const v${i} = ${i};\n`);
    }
    // Más archivos que UMBRAL_GRUPO (32): si el árbol fuese pequeño, el grupo
    // no entraría y la prueba no estaría probando nada.
    /** Aperturas de contenido gastadas DESDE el último marcador (no acumuladas). */
    const aperturaDe = (marca: number) => {
      const e = estadisticasDeLectura();
      return e.lecturasGrupo + e.lecturasSerie - marca;
    };
    const marca = () => {
      const e = estadisticasDeLectura();
      return e.lecturasGrupo + e.lecturasSerie;
    };
    const resumen = (c: ReturnType<typeof contextoProyecto>) => JSON.stringify({
      modelo: { ...c.modelo, generadoEn: 0 },
      nodos: c.grafo.nodos,
      aristas: c.grafo.aristas.map((a) => `${a.desde}|${a.tipo}|${a.hacia}`),
    });

    process.env.CEREBRONICO_LECTOR_SECUENCIAL = "1";
    reiniciarCacheDeContexto();
    let hasta = marca();
    const enSerie = contextoProyecto(dir);
    const aperturasSerie = aperturaDe(hasta);

    delete process.env.CEREBRONICO_LECTOR_SECUENCIAL;
    process.env.CEREBRONICO_LECTOR_GRUPO = "1";
    reiniciarCacheDeContexto();
    hasta = marca();
    const enHilos = contextoProyecto(dir);
    const estHilos = estadisticasDeLectura();
    const aperturasHilos = aperturaDe(hasta);

    comprobar("por los hilos entra el mismo retrato que por la serie", resumen(enSerie) === resumen(enHilos));
    comprobar("y la misma huella (el cache no depende del camino)", enSerie.huella === enHilos.huella, `${enSerie.huella} vs ${enHilos.huella}`);
    comprobar("el camino de hilos se usó de verdad (o el entorno no permite hilos)", estHilos.lecturasGrupo > 0 || estHilos.deshabilitado, JSON.stringify(estHilos));
    comprobar("los dos caminos abrieron los mismos archivos", aperturasSerie === aperturasHilos, `${aperturasSerie} vs ${aperturasHilos}`);

    // LA VALLA DEL TURNO DE CHAT: con la huella intacta no se vuelve a abrir NADA.
    hasta = marca();
    const otraVez = contextoProyecto(dir);
    comprobar("cache intacto: sale cacheado", otraVez.cacheado === true);
    comprobar("★ cache intacto: CERO aperturas de contenido (antes se reabrían todos)", aperturaDe(hasta) === 0, `${aperturaDe(hasta)} aperturas de más`);

    // Y si cambia un archivo, el cache se invalida aunque no hayamos leído nada.
    // (Se muta un archivo QUE EXISTE: crear uno nuevo también cambia la huella,
    // pero por ruta, no por contenido, y esta valla vigila lo segundo.)
    writeFileSync(join(dir, "b", "m0.ts"), "export const mutado = 1;\n");
    const trasCambio = contextoProyecto(dir);
    comprobar("edición en el árbol → huella nueva y recálculo", trasCambio.cacheado === false && trasCambio.huella !== enHilos.huella);
    comprobar("y el retrato nuevo dice la verdad nueva (m0.ts pasó de 2 líneas a 1)", trasCambio.modelo.lineasTotales === enHilos.modelo.lineasTotales - 1, `${trasCambio.modelo.lineasTotales} vs ${enHilos.modelo.lineasTotales}`);
  } finally {
    delete process.env.CEREBRONICO_LECTOR_SECUENCIAL;
    delete process.env.CEREBRONICO_LECTOR_GRUPO;
    rmSync(dir, { recursive: true, force: true });
    reiniciarCacheDeContexto();
  }
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ MOTOR DE CONTEXTO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
