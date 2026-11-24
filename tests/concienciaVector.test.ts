/**
 * tests/concienciaVector.test.ts — FASE 2: EL ÓRGANO ENTIENDE PÁRRAFOS (v1.84.0)
 * ==============================================================================
 * Prueba EXACTA que exige el plano (X22, FASE 2):
 *   «una paráfrasis que no comparte NI UNA palabra con el índice
 *     solo se recupera por vector».
 * Y la otra mitad del contrato: si el embedder no está o se pasa de su ventana
 * propia (5 s del plano), el turno sigue por la ruta de palabras de siempre
 * CON EL FALLBACK REGISTRADO (lección 24/10: jamás esperar un Ollama dormido).
 * El embedder entra INYECTADO: acá es un mapa semántico de bolsillo — en
 * produccion es Ollama — y la suite no necesita encender nada.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { aprender, enrutar, enrutarHibrido, indexarSesiones, cargarIndice } from "../src/engine/cerebroOrgano";
import { coseno, conTimeout, fusionarRutasHibridas, puntuarHibrido, PESO_HIBRIDO } from "../src/engine/vectorCerebro";

const casos: Array<{ nombre: string; fn: () => void | Promise<void> }> = [];
const prueba = (nombre: string, fn: () => void | Promise<void>) => casos.push({ nombre, fn });
const lee = (r: string) => fs.readFileSync(new URL("../" + r, import.meta.url), "utf8");

// Embedder de bolsillo: dos clasters semánticos + cero para lo desconocido.
const G1 = ["subir", "levantar", "arrancar", "prender", "desplegar"];
const G2 = ["reiniciar", "apagar", "fusible", "cuarentena"];
const embedBolsillo = async (textos: string[]): Promise<Array<number[] | null>> =>
  textos.map((t) => {
    const s = String(t).toLowerCase();
    if (G1.some((w) => s.includes(w))) return [1, 0];
    if (G2.some((w) => s.includes(w))) return [0, 1];
    return [0, 0];
  });

const conCerebro = (fn: (dir: string) => Promise<void> | void) => async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-cerebro-"));
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

prueba("LA PRUEBA DEL PLANO: paráfrasis sin una sola palabra en común solo vuelve por vector", conCerebro(async (dir) => {
  aprender(dir, { tema: "arranque", titulo: "subir el server local", texto: "Para subir el server local hace falta npm install y despues el script de arranque con el sandbox levantado.", resumen: "cómo subir el server" } as any);
  aprender(dir, { tema: "resiliencia", titulo: "reiniciar el server caido", texto: "Si el server se cae hay que reiniciar el proceso y revisar el fusible de proveedores.", resumen: "reiniciar tras caída" } as any);
  // La consulta NO comparte ni una palabra útil con la primera entrada.
  const soloPalabra = enrutar(dir, "levantar backend", 2);
  const hib = await enrutarHibrido(dir, "levantar backend", { embed: embedBolsillo });
  assert.strictEqual(hib.modo, "hibrido");
  assert.ok(hib.rutas.length > 0 && hib.rutas[0].entrada.titulo.includes("subir el server"), "el vector tiene que traer el recuerdo: " + JSON.stringify(hib.rutas.map((r) => r.entrada.titulo)));
  assert.ok(soloPalabra.length === 0 || !soloPalabra.some((r) => r.entrada.titulo.includes("subir")), "por palabra eso era invisible: " + JSON.stringify(soloPalabra.map((r) => r.entrada.titulo)));
}));

prueba("los pesos son AJUSTABLES: invirtiéndolos, la coincidencia literal le gana al significado", conCerebro(async (dir) => {
  // Fixture diseñada para que las dos mitades DISCUERDEN:
  //  · e1 significa "levantar" (vector G1) pero NO tiene la palabra literal de la consulta;
  //  · e2 tiene la palabra literal ("motor") pero no significa nada para el embedder.
  // Con 0.9/0.1 gana el significado; con 0.1/0.9 gana lo literal. Si el ranking
  // no se invierte, los pesos eran decorativos y esta prueba lo denuncia.
  aprender(dir, { tema: "arranque", titulo: "subir el nucleo", texto: "subir encendido del nucleo cuando esta dormido", resumen: "significado levantarse" } as any);
  aprender(dir, { tema: "ui", titulo: "el motor de siempre", texto: "el motor de siempre renderiza la pantalla completa", resumen: "literal motor" } as any);
  const significadista = await enrutarHibrido(dir, "levantar motor", { embed: embedBolsillo, pesos: { vector: 0.9, palabra: 0.1 } });
  const literalista = await enrutarHibrido(dir, "levantar motor", { embed: embedBolsillo, pesos: { vector: 0.1, palabra: 0.9 } });
  assert.ok(significadista.rutas[0] && literalista.rutas[0], "ambos modos devuelven algo");
  assert.ok(significadista.rutas[0].entrada.titulo.includes("nucleo"), "0.9 de vector trae el recuerdo SEMÁNTICO: " + significadista.rutas[0].entrada.titulo);
  assert.ok(literalista.rutas[0].entrada.titulo.includes("motor"), "0.9 de palabra trae el recuerdo LITERAL: " + literalista.rutas[0].entrada.titulo);
}));

prueba("embedder caído: el turno sigue por palabra y el fallback queda REGISTRADO", conCerebro(async (dir) => {
  aprender(dir, { tema: "arranque", titulo: "subir el server local", texto: "subir el server local con npm", resumen: "subir" } as any);
  const hib = await enrutarHibrido(dir, "subir server", { embed: async () => { throw new Error("ollama no esta"); } });
  assert.strictEqual(hib.modo, "palabras");
  assert.ok(String(hib.aviso || "").includes("fallback por palabra"), "el aviso debe existir: " + hib.aviso);
  assert.ok(String(hib.aviso).includes("ollama no esta"), "y debe cargar el motivo original: " + hib.aviso);
  assert.ok(hib.rutas.length > 0 && hib.rutas[0].entrada.titulo.includes("subir"), "la ruta de palabras de siempre sigue sirviendo");
}));

prueba("embedder lento: la ventana PROPIA corta (5 s del plano, acada en 60 ms) y el turno no espera", conCerebro(async (dir) => {
  aprender(dir, { tema: "arranque", titulo: "subir el server", texto: "subir server npm", resumen: "x" } as any);
  const lento = (_t: string[], senal?: AbortSignal) => new Promise<Array<number[] | null>>((res, rej) => {
    const msj = setTimeout(() => rej(new Error("no llegué")), 1000);
    senal?.addEventListener?.("abort", () => { clearTimeout(msj); rej(new Error("abort")); });
  });
  const t0 = Date.now();
  const hib = await enrutarHibrido(dir, "subir server", { embed: lento, timeoutMs: 60 });
  const esperado = Date.now() - t0;
  assert.strictEqual(hib.modo, "palabras");
  assert.ok(esperado < 400, "el turno espero " + esperado + " ms: la ventana propia no cortó");
  assert.ok(String(hib.aviso).includes("tiempo-excedido"), hib.aviso);
}));

prueba("sesiones indexadas: «cómo resolvimos X la última vez» por parecido, e idempotente", conCerebro(async (dir) => {
  const proy = fs.mkdtempSync(path.join(os.tmpdir(), "cn-proyecto-"));
  try {
    const sesion = { messages: [
      { role: "user", content: "el tsc compilaba rojo por el package-lock desincronizado con la semilla" },
      { role: "assistant", content: "solución: alinear la version del package-lock.json con constants e index.html y correr npm run validar otra vez" },
    ] };
    fs.writeFileSync(path.join(proy, "cerebronico-ide-sesion-2026-10-27.json"), JSON.stringify(sesion));
    fs.writeFileSync(path.join(proy, "cerebronico-ide-sesion-rota.json"), "{esto no es json");
    const r1 = indexarSesiones(dir, proy);
    assert.strictEqual(r1.indexadas, 1, JSON.stringify(r1));
    assert.strictEqual(r1.saltadas, 1);
    assert.ok(r1.motivos.some((m) => m.includes("rota")), "la sesión ilegible se SALTA con motivo: " + r1.motivos.join("|"));
    const r2 = indexarSesiones(dir, proy);
    assert.strictEqual(cargarIndice(dir).entradas.filter((e) => e.tema === "sesiones").length, 1, "indexar dos veces no duplica el recuerdo");
    assert.strictEqual(r2.indexadas, 1, "la segunda pasada refuerza (peso), no duplica");
  } finally { fs.rmSync(proy, { recursive: true, force: true }); }
}));

prueba("piezas puras: coseno, mezcla y timeout se comportan solos", async () => {
  assert.strictEqual(coseno([1, 0], [1, 0]), 1);
  assert.strictEqual(coseno([1, 0], [0, 1]), 0);
  assert.strictEqual(coseno(null, [1]), 0);
  assert.ok(Math.abs(puntuarHibrido(1, 0) - 0.7) < 1e-9, "0.7 del vector con palabra cero");
  assert.deepStrictEqual(PESO_HIBRIDO, { vector: 0.7, palabra: 0.3 }, "los pesos del plano, escritos una sola vez");
  const fus = fusionarRutasHibridas([{ clave: "a", simPalabra: 5 }], () => 1);
  assert.strictEqual(fus[0].score, 1, "palabra máxima + vector máximo = 1");
  const t = await conTimeout(async () => "ya", 50);
  assert.ok(t.ok && t.valor === "ya");
  const lento = await conTimeout(async () => { await new Promise((r) => setTimeout(r, 300)); return "tardé"; }, 40);
  assert.strictEqual(lento.ok, false);
  if (!lento.ok) assert.strictEqual(lento.motivo, "tiempo-excedido", JSON.stringify(lento));
});

prueba("cables leídos: el turno y la búsqueda del cerebro pasan por el híbrido", () => {
  const srv = lee("server.ts");
  assert.ok(srv.includes("enrutarHibridoCerebro(PROJECT_ROOT, _cbConsulta"), "el contexto del turno usa el híbrido");
  // v1.98.0 · el embedder ya no se señala a ciegas: el turno usa el RESOLUTOR, que
  // primero mira qué tiene descargado Ollama (el default fijo era lo que vaciaba la
  // ventana de 5 s en cada turno del log del 31/10).
  assert.ok(srv.includes("embed: cerebroEmbedder.embed"), "con el embedder resuelto por residencia detrás de la función inyectada");
  assert.ok(srv.includes("alCalentar: cerebroEmbedder.alCalentar"), "y la deuda sin vector se calienta en segundo plano, no en el turno");
  assert.ok(srv.includes("timeoutMs: 5000"), "la ventana del plano, escrita como número en el cable");
  assert.ok(srv.includes("indexarSesionesCerebro(PROJECT_ROOT, PROJECT_ROOT)"), "las sesiones se indexan al arrancar");
});

let fallos = 0;
for (const c of casos) {
  try { await c.fn(); console.log("  \u2713 " + c.nombre); }
  catch (e: any) { fallos++; console.log("  \u2717 " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nconcienciaVector: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
