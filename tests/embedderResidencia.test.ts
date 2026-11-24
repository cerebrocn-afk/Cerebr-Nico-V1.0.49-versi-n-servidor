/**
 * tests/embedderResidencia.test.ts — v1.98.0 · EL EMBEDDER SE ELIGE POR RESIDENCIA
 * ================================================================================
 * El log de Mario (31/10) repite en CADA turno:
 *   🧠 cerebro: fallback por palabra (tiempo-excedido: el embedder pasó la ventana de 5000 ms)
 * y la pestaña Puertos muestra la causa: en disco hay `snowflake-arctic-embed:22m` y
 * `all-minilm:22m`, mientras el código pedía `embeddinggemma` a rajatabla. Pedir lo que
 * no está descargado NO es un 404 barato: es una carga desde adentro de la ventana de 5 s.
 * Y como al expirar se tiraba el trabajo entero, la deuda nunca bajaba: cinco segundos
 * muertos por turno, para siempre.
 *
 * Esta valla prueba, EN SECO y sin Ollama:
 *   1. que el elegido es un modelo de embeddings REAL de la lista (y nunca un chat);
 *   2. que la RESIDENCIA le gana a la elegancia (cargar cuesta la ventana);
 *   3. que la voluntad explícita manda, pero sólo si existe en disco;
 *   4. que ningún pedido vuelve a medir 151 textos (`planCalentado`);
 *   5. ★ que lo vectorizado se PERSISTE aunque la pasada se caiga a mitad: la deuda
 *      tiene que bajar pasada a pasada (ese es el bucle que había que romper);
 *   6. que el calentador no se apila (dos pasadas peleándose por un Ollama de 8 GB es
 *      la receta del corte de 180 s del watchdog).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolverEmbedder,
  listarEmbedders,
  planCalentado,
  BONUS_CARGADO,
  POR_LOTE_POR_DEFECTO,
  MAX_CUERPOS_POR_PASADA,
  EMBEDDER_RECOMENDADO,
} from "../src/engine/embedderResidencia";
import { aprender, enrutarHibrido, calentarVectores, estadoVectores, estadoCalentamiento, rutaCerebro, POR_LOTE_EN_TURNO } from "../src/engine/cerebroOrgano";
import { listarEmbedders, resolverEmbedder, tamanoDe } from "../src/engine/embedderResidencia";
import { declaradosDesde } from "../src/engine/aduanaModelos";

/** El sidecar vive junto al índice: borrarlo es volver a deber todo. */
const rutaVectores = (dir: string) => path.join(rutaCerebro(dir), "vectores.json");

let correctas = 0;
const fallos: string[] = [];
function comprobar(que: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; return; }
  fallos.push(`${que}${detalle ? " — " + detalle : ""}`);
  console.log(`  ✗ ${que}${detalle ? " — " + detalle : ""}`);
}

/** La lista REAL de la máquina del log (recortada a lo que decide algo). */
const INSTALADOS = [
  "deepseek-v4-pro:latest",
  "llama3:8b",
  "snowflake-arctic-embed:22m",
  "all-minilm:22m",
  "qwen2.5-coder:7b",
];

// ── 1 · quién es candidato ───────────────────────────────────────────────
{
  const cands = listarEmbedders(INSTALADOS, []);
  const nombres = cands.map((c) => c.nombre);
  comprobar("los modelos de embeddings se reconocen y entran", nombres.includes("snowflake-arctic-embed:22m") && nombres.includes("all-minilm:22m"), nombres.join(","));
  comprobar("★ NINGÚN modelo de chat se ofrece como vectorizador", !nombres.some((n) => /deepseek|llama|qwen2\.5-coder/i.test(n)), nombres.join(","));
  comprobar("el nombre de la familia se informa (el panel lo muestra tal cual)", /snowflake/i.test(cands[0].familia), cands[0].familia);
  comprobar("los pesos del ranking no se perdieron: el mejor descargado es el multilingüe", cands[0].nombre === "snowflake-arctic-embed:22m", cands[0].nombre);

  const duplicados = listarEmbedders(["all-minilm:22m", "all-minilm:22m", "", null as any, "bge-m3"]);
  comprobar("Ollama puede reportar el mismo tag dos veces: no se duplica el candidato", duplicados.length === 2, duplicados.map((d) => d.nombre).join(","));
  comprobar("nombres vacíos o nulos no revientan la lista", duplicados.every((d) => d.nombre.length > 0));
  comprobar("una lista vacía devuelve vacíos (no inventa candidatos)", listarEmbedders([], []).length === 0 && listarEmbedders(undefined, undefined).length === 0);
}

// ── 2 · la residencia gana ──────────────────────────────────────────────
{
  const frios = listarEmbedders(["qwen3-embedding:0.6b", "all-minilm:22m"], []);
  const caliente = listarEmbedders(["qwen3-embedding:0.6b", "all-minilm:22m"], ["all-minilm:22m"]);
  comprobar("sin nada cargado manda la familia preferida", frios[0].nombre === "qwen3-embedding:0.6b", frios.map((f) => `${f.nombre}:${f.puntos}`).join(","));
  comprobar("★ con el modesto cargado, la residencia le gana a la familia", caliente[0].nombre === "all-minilm:22m", caliente.map((f) => `${f.nombre}:${f.puntos}`).join(","));
  comprobar("el bonus de residencia es mayor que cualquier salto de familia", BONUS_CARGADO >= 60, String(BONUS_CARGADO));
  comprobar("la etiqueta `cargado` existe tanto para el que está como para el que no",
    caliente.some((c) => c.cargado) && caliente.some((c) => !c.cargado));

  // Determinismo: el orden de llegada desempata, y dos pasadas dan lo mismo.
  const a = listarEmbedders(["e5-mistral:7b", "bge-large:latest"], []).map((c) => c.nombre).join(",");
  const b = listarEmbedders(["e5-mistral:7b", "bge-large:latest"], []).map((c) => c.nombre).join(",");
  comprobar("mismas listas → mismo orden (determinismo, no ruleta)", a === b, `${a} vs ${b}`);
  comprobar("el desempate sigue el orden de llegada", a.startsWith("bge-large"), a);
}

// ── 3 · la voluntad del usuario ──────────────────────────────────────────
{
  const ok = resolverEmbedder({ instalados: INSTALADOS, cargados: [], preferido: "all-minilm:22m" });
  comprobar("★ lo declarado y descargado manda sobre la preferencia de la casa", ok.modelo === "all-minilm:22m" && ok.fuente === "preferido", `${ok.modelo}/${ok.fuente}`);

  const inventado = resolverEmbedder({ instalados: INSTALADOS, cargados: [], preferido: "embeddinggemma" });
  comprobar("lo declarado PERO NO descargado no hunde el turno: se cambia y se dice",
    inventado.modelo === "snowflake-arctic-embed:22m" && /NO está descargado/.test(inventado.motivo), `${inventado.modelo} · ${inventado.motivo}`);
  comprobar("y el motivo trae el comando de arreglo del declarado", /ollama pull embeddinggemma/.test(inventado.motivo), inventado.motivo);

  const estricto = resolverEmbedder({ instalados: INSTALADOS, cargados: [], preferido: "embeddinggemma", estricto: true });
  comprobar("CN_EMBED_STRICT acata a ciegas (el usuario manda, con aviso)", estricto.modelo === "embeddinggemma" && estricto.fuente === "estricto", `${estricto.modelo}/${estricto.fuente}`);

  const carga = resolverEmbedder({ instalados: INSTALADOS, cargados: ["all-minilm:22m"] });
  comprobar("sin preferido, la residencia decide y lo dice con nombres", /Elegido por residencia/.test(carga.motivo) && /all-minilm:22m/.test(carga.motivo), carga.motivo);

  const nada = resolverEmbedder({ instalados: ["deepseek-v4-pro:latest"], cargados: [] });
  comprobar("sin ningún embedder: modelo null (cero ventana gastada) y comando en el motivo",
    nada.modelo === null && nada.fuente === "ninguno" && nada.motivo.includes(EMBEDDER_RECOMENDADO), JSON.stringify(nada.motivo));
}

// ── 4 · cuánto se manda por pedido ──────────────────────────────────────
{
  const cien = Array.from({ length: 150 } as any, (_x: any, i: number) => `cuerpo ${i}`) as string[];
  const lotes = planCalentado(cien, {});
  const total = lotes.reduce((n, l) => n + l.length, 0);
  comprobar("★ NINGÚN lote vuelve a medir 151 textos", Math.max(...lotes.map((l) => l.length)) <= POR_LOTE_POR_DEFECTO, String(Math.max(...lotes.map((l) => l.length))));
  comprobar("la pasada se corta en el techo (deuda se cierra de a poco)", total <= MAX_CUERPOS_POR_PASADA, String(total));
  comprobar("el orden de llegada se conserva (nada se saltea al azar)", lotes[0][0] === "cuerpo 0" && lotes[0][lotes[0].length - 1] === `cuerpo ${POR_LOTE_POR_DEFECTO - 1}`, lotes[0].slice(0, 2).join(","));
  comprobar("el universo arranca en el índice, no en el medio", lotes.flat().length === MAX_CUERPOS_POR_PASADA, String(lotes.flat().length));
  comprobar("lista vacía → cero lotes (no se inventa trabajo)", planCalentado([], {}).length === 0);
  comprobar("uno solo forma un lote de uno", planCalentado(["x"], {}).length === 1);
  comprobar("porLote inválido no divide por cero", planCalentado(["a", "b", "c"], { porLote: 0 }).length === 3);
  comprobar("maxTextos=0 no vectoriza nada (el techo es un techo)", planCalentado(cien, { maxTextos: 0 }).length === 0);
  comprobar("el lote del turno cabe dentro del techo de la pasada", POR_LOTE_EN_TURNO <= POR_LOTE_POR_DEFECTO, `${POR_LOTE_EN_TURNO}/${POR_LOTE_POR_DEFECTO}`);
}

// ── 5 · ★ la deuda baja: el guardado parcial ───────────────────────────────
const conCerebro = (fn: (dir: string) => Promise<void> | void) => async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-embed-"));
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
const V = (n: number) => [n, 0];
const embedBueno = async (textos: string[]) => textos.map((_t, i) => V(i + 1));

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-embed-"));
  try {
    for (let i = 0; i < 5; i++) {
      aprender(dir, { tema: "arranque", titulo: `nota ${i}`, texto: `contenido de la nota numero ${i} con texto suficiente`, resumen: `resumen ${i}` } as any);
    }
    comprobar("arranque: el índice existe y NINGUNA entrada tiene vector", estadoVectores(dir).entradas === 5 && estadoVectores(dir).deuda === 5, JSON.stringify(estadoVectores(dir)));

    // El turno manda la consulta + SU lote, no los 150.
    let enviados: number[] = [];
    const espias = async (textos: string[]) => { enviados.push(textos.length); return textos.map((_t, i) => V(i + 1)); };
    const h1 = await enrutarHibrido(dir, "nota uno", { embed: espias, porLote: 2 });
    comprobar("★ el turno vectoriza consulta + lote (12 viejos → 3 textos)", enviados.length === 1 && enviados[0] === 3, JSON.stringify(enviados));
    comprobar("y el lote vectorizado se PERSISTE en disco", estadoVectores(dir).conVector === 2 && estadoVectores(dir).deuda === 3, JSON.stringify(estadoVectores(dir)));
    comprobar("el resultado del turno es híbrido y reporta la deuda restante", h1.modo === "hibrido" && h1.deuda === 3, JSON.stringify({ modo: h1.modo, deuda: h1.deuda }));

    // El calentado a pedido cierra la deuda que el turno dejó abierta.
    const cal = await calentarVectores(dir, { embed: embedBueno, porLote: 2 });
    comprobar("calentarVectores procesa la deuda en lotes y reporta", cal.ejecutado && cal.vectorizados === 3 && cal.lotes === 2, JSON.stringify(cal));
    comprobar("★ índice completo: deuda a cero", estadoVectores(dir).deuda === 0 && estadoVectores(dir).conVector === 5, JSON.stringify(estadoVectores(dir)));

    // ★ La que importa: si un lote se cae, lo del lote anterior NO se pierde.
    fs.rmSync(rutaVectores(dir), { force: true });
    let lote = 0;
    const caprichoso = async (textos: string[]) => {
      lote++;
      if (lote >= 2) throw new Error("ollama se durmió");
      return textos.map((_t, i) => V(i + 1));
    };
    // v2.1.1 · `precalentar: false`: el precalentamiento (v1.99.6) hace un pedido
    // extra ANTES de los lotes y este embedder cuenta llamadas. Sin apagarlo, el
    // "lote 2" que explota es en realidad el primer lote real y el conteo miente.
    const c2 = await calentarVectores(dir, { embed: caprichoso, porLote: 2, ventanaLoteMs: 300, precalentar: false });
    comprobar("un lote caído no borra el lote exitoso (guardado parcial)", estadoVectores(dir).conVector === 2, JSON.stringify(estadoVectores(dir)));
    comprobar("y la caída se INFORMA, no se traga", c2.vectorizados === 2 && c2.lotes === 3 && c2.fallidos === 3 && /ollama se durmió/.test(String(c2.aviso)), JSON.stringify(c2));
    comprobar("la deuda restante sigue visible para la próxima pasada", estadoVectores(dir).deuda === 3, JSON.stringify(estadoVectores(dir)));

    // `alCalentar`: el turno degradado pasa la deuda al segundo plano.
    let recibidos: string[] = [];
    const h2 = await enrutarHibrido(dir, "nota dos", { embed: async () => { throw new Error("muerto"); }, alCalentar: (cs) => { recibidos = cs; }, timeoutMs: 60 });
    comprobar("embedder caído → el turno degrada AVISANDO y pasa la deuda al calentador",
      h2.modo === "palabras" && /fallback por palabra/.test(String(h2.aviso)) && /calentando en segundo plano/.test(String(h2.aviso)) && recibidos.length === 3,
      `${h2.aviso} · ${recibidos.length} cuerpos`);
    comprobar("el aviso viejo sigue intacto para quien lo lea (motivo original)", /muerto/.test(String(h2.aviso)), String(h2.aviso));

    // Dos entradas hermanas (mismo cuerpo) se vectorizan una sola vez.
    aprender(dir, { tema: "arranque", titulo: "nota duplicada", texto: "mismo cuerpo para las dos", resumen: "igual" } as any);
    const antes = estadoVectores(dir).deuda;
    let llamadas = 0;
    await calentarVectores(dir, { embed: async (textos) => { llamadas++; return textos.map(() => V(9)); }, porLote: 10, precalentar: false });
    comprobar("cuerpos repetidos se vectorizan una vez (dedupe por cuerpo)", llamadas === 1, `llamadas=${llamadas}`);
    comprobar("y después de calentar no queda deuda", estadoVectores(dir).deuda === 0, JSON.stringify({ antes, despues: estadoVectores(dir) }));

    // El calentador no se apila.
    fs.rmSync(rutaVectores(dir), { force: true });
    const lenta = async (textos: string[]) => { await new Promise((r) => setTimeout(r, 120)); return textos.map(() => V(3)); };
    const p1 = calentarVectores(dir, { embed: lenta, porLote: 2, ventanaLoteMs: 400, precalentar: false });
    const p2 = await calentarVectores(dir, { embed: lenta, porLote: 2, ventanaLoteMs: 400, precalentar: false });
    comprobar("★ dos pasadas a la vez: la segunda NO arranca (cero pelea por Ollama)", p2.ejecutado === false && /en curso/.test(String(p2.aviso)), JSON.stringify(p2));
    await p1;
    comprobar("y al terminar la primera, el estado queda libre para la próxima", estadoCalentamiento().enCurso === false && estadoCalentamiento().pasadas >= 2, JSON.stringify(estadoCalentamiento()));
    comprobar("la telemetría acumula lo vectorizado entre pasadas", estadoCalentamiento().vectorizados > 0, String(estadoCalentamiento().vectorizados));
  } catch (e: any) {
    comprobar("el bloque del órgano no revienta", false, String(e?.message || e));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── 6 · los cables ────────────────────────────────────────────────────────
{
  const leer = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const organo = leer("src/engine/cerebroOrgano.ts");
  comprobar("el órgano no hace la cuenta de cuánto calentar: la pide al motor puro", /planCalentado\(objetivo/.test(organo) && /from "\.\/embedderResidencia"/.test(organo));
  comprobar("★ y guarda ENTRE lotes (la línea que rompe el bucle de los 5 s)", /guardarVectores\(raizDatos, deuda\.vigentes\)/.test(organo));
  comprobar("el lote del turno está acotado por constante, no por el tamaño del índice",
    /export const POR_LOTE_EN_TURNO = \d+/.test(organo) && /const lote = deuda\.pendientes\.slice\(0, porLote\)/.test(organo));
  // v2.1.1 · la valla del cable ya NO exige el literal viejo (12): exige la
  // PROPIEDAD que importa, que el lote del turno no supere el techo de la pasada.
  // Antes fijaba 12 y el techo bajó a 8: la valla defendía un número, no la regla.
  // ── v2.3.2 · LA DECLARACIÓN DEL USUARIO (el «algunos no los reconoce» medido) ──
  // El usuario tiene `L1_arctic:latest` y `L1_arctic22m:latest`, que son copias
  // renombradas de snowflake-arctic-embed. Ningún regex puede ver eso: el rol se
  // infiere del nombre porque Ollama no lo anuncia en /api/tags. La salida es que
  // el dueño del árbol lo declare, y que la declaración le gane a la conjetura.
  const SIN_DECLARAR = ["L1_arctic:latest", "qwen3-embedding:0.6b", "snowflake-arctic-embed:33m"];
  comprobar("sin declarar, el alias NO se inventa como embedder (la aduana no adivina)",
    listarEmbedders(SIN_DECLARAR, []).every((c) => c.nombre !== "L1_arctic:latest"));
  comprobar("★ declarado en CN_EMBEDS_EXTRA, el alias entra como vectorizador",
    listarEmbedders(SIN_DECLARAR, [], { declarados: declaradosDesde("L1_arctic,L1_arctic22m", "") }).some((c) => c.nombre === "L1_arctic:latest"));
  comprobar("y la declaración en sentido contrario deshace un falso positivo",
    listarEmbedders(["embedder-grande-70b"], [], { declarados: declaradosDesde("", "embedder-grande-70b") }).length === 0);
  comprobar("un alias declarado le gana al regex roto: preferido = alias, fuente = preferido",
    resolverEmbedder({ instalados: SIN_DECLARAR, preferido: "L1_arctic:latest", declarados: declaradosDesde("L1_arctic", "") }).fuente === "preferido");
  comprobar("★ sin declarar, preferir `L1_arctic` sigue siendo NEGARLO (no se finge)",
    /NO está descargado/i.test(resolverEmbedder({ instalados: SIN_DECLARAR, preferido: "L1_arctic:latest" }).motivo));

  // ── v2.3.2 · EL PESO MEDIDO: en 16 GB gana el más chico que sirve ──
  const DOS = ["qwen3-embedding:0.6b", "snowflake-arctic-embed:33m"];
  const T = { "qwen3-embedding:0.6b": 639 * 1024 * 1024, "snowflake-arctic-embed:33m": 67 * 1024 * 1024 };
  comprobar("sin techo, la reputación de familia manda (comportamiento viejo, intacto)",
    listarEmbedders(DOS, [])[0].nombre === "qwen3-embedding:0.6b");
  comprobar("★ con techo de 200 MB gana snowflake (67 MB) sobre qwen3 (639 MB)",
    listarEmbedders(DOS, [], { tamanos: T, techoMb: 200 })[0].nombre === "snowflake-arctic-embed:33m");
  comprobar("y el tamaño llega al panel: el candidato trae sus MB medidos",
    listarEmbedders(DOS, [], { tamanos: T, techoMb: 200 })[0].mb === 67);
  comprobar("★ estar cargado le gana al techo (la residencia sigue pesando más)",
    listarEmbedders(DOS, ["qwen3-embedding:0.6b"], { tamanos: T, techoMb: 200 })[0].nombre === "qwen3-embedding:0.6b");
  comprobar("el techo NO es RAM_LIMITADA_GB: con tamanos ausentes no hay premio ni castigo",
    listarEmbedders(DOS, [], { techoMb: 200 })[0].nombre === "qwen3-embedding:0.6b");
  comprobar("tamanoDe tolera la fábrica `:latest` y la raíz sin etiqueta",
    tamanoDe({ "all-minilm:22m": 45 * 1024 * 1024 }, "all-minilm") === 45 && tamanoDe(null, "x") === undefined);

  comprobar("★ el lote del turno NO supera el techo de la pasada (la regla, no el número)",
    POR_LOTE_EN_TURNO <= POR_LOTE_POR_DEFECTO, `${POR_LOTE_EN_TURNO}/${POR_LOTE_POR_DEFECTO}`);
  const router = leer("server/routers/embedderCerebro.ts");
  // v2.3.2 · estaba clavada a la llamada en UNA línea. Lo que defiende es la
  // PROPIEDAD: que el cable pase LO QUE HAY (instalados + cargados + la leyenda de
  // la lectura) antes de señalar un modelo. Desde v2.3.2 la llamada trae además la
  // declaración del usuario y los MB medidos, y ya no entra en una línea. Se bate
  // la propiedad, no el formato (misma decisión que `techoContexto` en v2.3.1).
  // v1.0.14 · HAY DOS LLAMADAS, Y NO SON LA MISMA.
  // Desde v2.3.4 el cable resuelve por dos caminos: el DIRECTO (cuando /api/tags no
  // contesta, se pregunta por el nombre exacto con /api/show) y el NORMAL (cuando el
  // listado sí llega). La regex de antes tomaba la PRIMERA del archivo —la directa— y
  // le exigía `lectura: lectura.leyenda` y `tamanos: lectura.tamanos`, que en esa rama
  // NO existen porque no hay `lectura`: hay `directo`. La valla se ponía roja por
  // mirar la rama equivocada, no porque el cable estuviera mal.
  // Lo que se defiende —«el cable pasa lo que HAY antes de señalar un modelo»— se
  // cumple en las dos; se comprueba en la PRINCIPAL, que es la que corre con Ollama vivo.
  const llamadas = router.match(/resolverEmbedder\(\{[\s\S]{0,1200}?\}\)/g) || [];
  const llamada = llamadas.find((l) => /lectura: lectura\.leyenda/.test(l)) || llamadas[0] || "";
  comprobar("el cable lee qué HAY antes de señalar un modelo",
    /instalados,/.test(llamada) && /cargados,/.test(llamada) && /lectura: lectura\.leyenda/.test(llamada) && /estricto,/.test(llamada),
    llamada.slice(0, 90));
  comprobar("v2.3.2 · el cable cruza la declaración del usuario y el peso medido",
    /declarados: declaradosDesde\(/.test(llamada) && /tamanos: lectura\.tamanos,/.test(llamada) && /techoMb,/.test(llamada));
  comprobar("v2.3.2 · /api/tags entra COMPLETO (sin slice ni tope: N adentro = N afuera)",
    /for \(const m of j\.models\)/.test(router) && !/j\.models\.slice\(/.test(router) && /tamanos\[nombre\] = sz;/.test(router));
  comprobar("sin embedder NO gasta la ventana: falla con el motivo en mano", /if \(!res\.modelo\) \{/.test(router) && /throw new Error\(res\.motivo\)/.test(router));
  comprobar("y cachea la decisión (no se le pregunta a Ollama en cada turno)", /TTL_RESOLUCION_MS = 30_000/.test(router) && /t < hasta/.test(router));
  comprobar("el panel tiene de dónde leer: las dos rutas están declaradas y montadas",
    /export const RUTAS_EMBEDDER_CEREBRO = \["GET \/api\/cerebro\/embedder", "POST \/api\/cerebro\/embedder\/calentar"\]/.test(router) &&
    /app\.get\("\/api\/cerebro\/embedder"/.test(router) && /app\.post\("\/api\/cerebro\/embedder\/calentar"/.test(router));
  const srv = leer("server.ts");
  comprobar("★ el turno y la búsqueda usan el resolutor (una sola instancia compartida)",
    /const cerebroEmbedder = montarResolutorEmbedder/.test(srv) && (srv.match(/embed: cerebroEmbedder\.embed/g) || []).length === 2);
  comprobar("el aviso del turno nombra el embedder en uso (antes era inaccionable)", /embedder: \$\{cerebroEmbedder\.resolucion\(\)\?\.modelo/.test(srv));
  comprobar("montado con calentado diferido, no en el arranque", /registrarEmbedderCerebro\(app, \{ resolutor: cerebroEmbedder, retrasoCalentadoMs: 20_000 \}\)/.test(srv));
}

console.log(`\nembedderResidencia: ${correctas} correctas, ${fallos.length} fallos`);
if (fallos.length) { for (const f of fallos) console.log("  · " + f); process.exit(1); }
process.exit(0);
