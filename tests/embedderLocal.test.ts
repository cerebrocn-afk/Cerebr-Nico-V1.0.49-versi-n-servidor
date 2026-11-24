/**
 * embedderLocal.test.ts — v1.97.2 · EL EMBEDDER NO SE RINDE A UN 404
 * ==================================================================
 * El log de Mario (30/10) muestra `embedder HTTP 404` en TODOS los turnos: la memoria
 * vectorial del cerebro murió degradada a búsqueda por palabra, y el error no decía cómo
 * arreglarlo. Causa doble y real: Ollama movió el endpoint (`/api/embed` canónico,
 * `/api/embeddings` alias viejo) y/o el modelo `embeddinggemma` no está descargado.
 *
 * Esta valla prueba el COMPORTAMIENTO (no solo que exista la línea), con un `fetchImpl`
 * inyectado: una prueba que depende de si Ollama está vivo en la máquina que testea es
 * una ruleta, no una valla.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embedCerebroLocal } from "../src/engine/embedderLocal";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};

const json404 = async () => null;
const res404 = { ok: false, status: 404, json: json404 } as any;
const base = "http://falso:11434";

// ── El canónico responde → devuelve vectores ──
{
  const fetchOk = async (url: string) =>
    url.endsWith("/api/embed")
      ? ({ ok: true, status: 200, json: async () => ({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }) } as any)
      : res404;
  const r = await embedCerebroLocal(["a", "b"], undefined, { baseUrl: base, modelo: "m", fetchImpl: fetchOk as any });
  c("★ /api/embed responde → devuelve un vector por texto", Array.isArray(r) && r.length === 2 && (r[0] as number[])[0] === 0.1, JSON.stringify(r));
}

// ── El canónico da 404 y el alias viejo sí responde ──
{
  const fetchLegacy = async (url: string) =>
    url.endsWith("/api/embeddings")
      ? ({ ok: true, status: 200, json: async () => ({ embeddings: [[0.5]] }) } as any)
      : res404;
  const r = await embedCerebroLocal(["a"], undefined, { baseUrl: base, modelo: "m", fetchImpl: fetchLegacy as any });
  c("★ cae al alias viejo /api/embeddings si el canónico no está", r.length === 1 && (r[0] as number[])[0] === 0.5);
}

// ── Ambos 404 → error accionable con el nombre del modelo y el comando ──
{
  const fetch404 = async () => res404;
  let err = "";
  try { await embedCerebroLocal(["a"], undefined, { baseUrl: base, modelo: "embeddinggemma", fetchImpl: fetch404 as any }); }
  catch (e: any) { err = String(e?.message || e); }
  c("★ 404 en ambos → nombra el modelo y dice `ollama pull`", /embeddinggemma/.test(err) && /ollama pull embeddinggemma/.test(err), err);
  c("y declara la degradación honesta (el cerebro sigue por palabra)", /sigue por palabra/.test(err));
}

// ── Un 500 no se «arregla» probando el otro endpoint ──
{
  const fetch500 = async () => ({ ok: false, status: 500, json: json404 } as any);
  let err = "";
  try { await embedCerebroLocal(["a"], undefined, { baseUrl: base, fetchImpl: fetch500 as any }); }
  catch (e: any) { err = String(e?.message || e); }
  c("★ un 500 no se reintenta contra el alias (no es endpoint viejo)", /HTTP 500/.test(err), err);
}

// ── v1.99.0 · LA RESIDENCIA: el embedder viaja con su propio keep_alive ──
// Medido en la sesión del 31/10 (pestaña Puertos): «Ollama: 0.0 GB · Nada residente»
// con los dos embedders descargados. El pedido no decía NADA de residencia, así que
// heredaba el escalón del lanzador (pensado para el modelo de chat) y se enfriaba
// entre tanda y tanda: cada calentado volvía a pagar la carga del modelo dentro de
// la ventana corta de 4 s. Un `keep_alive` explícito es la mitad de la cura.
{
  let cuerpo: any = null;
  const fetchEspia = async (_url: string, init: any) => {
    cuerpo = JSON.parse(String(init?.body || "{}"));
    return { ok: true, status: 200, json: async () => ({ embeddings: [[0.1]] }) } as any;
  };
  await embedCerebroLocal(["a"], undefined, { baseUrl: base, modelo: "m", fetchImpl: fetchEspia as any, keepAliveMs: 90_000 });
  c("★ keep_alive pedido viaja en el cuerpo, en milisegundos y entero", cuerpo?.keep_alive === 90000, JSON.stringify(cuerpo));
  c("y no se deforma lo que ya viajaba (modelo e input intactos)", cuerpo?.model === "m" && Array.isArray(cuerpo?.input), JSON.stringify(cuerpo));
}
{
  let cuerpo: any = null;
  const fetchEspia = async (_url: string, init: any) => {
    cuerpo = JSON.parse(String(init?.body || "{}"));
    return { ok: true, status: 200, json: async () => ({ embeddings: [[0.1]] }) } as any;
  };
  await embedCerebroLocal(["a"], undefined, { baseUrl: base, modelo: "m", fetchImpl: fetchEspia as any });
  c("★ sin decisión explícita NO se manda keep_alive (el comportamiento viejo queda intacto)",
    cuerpo && !("keep_alive" in cuerpo), JSON.stringify(cuerpo));
  await embedCerebroLocal(["a"], undefined, { baseUrl: base, modelo: "m", fetchImpl: fetchEspia as any, keepAliveMs: 0 });
  c("el CERO sí se manda (es una decisión: libéralo ya, no la ausencia de decisión)",
    cuerpo && cuerpo.keep_alive === 0, JSON.stringify(cuerpo));
}
{
  // El alias viejo es el que responde en una Ollama anterior: la residencia tiene que
  // viajar igual, si no el upgrade de endpoint volvería a dejar el modelo enfriado.
  let cuerpo: any = null;
  const fetchAlias = async (url: string, init: any) => {
    if (!url.endsWith("/api/embeddings")) return res404;
    cuerpo = JSON.parse(String(init?.body || "{}"));
    return { ok: true, status: 200, json: async () => ({ embeddings: [[0.2]] }) } as any;
  };
  await embedCerebroLocal(["a"], undefined, { baseUrl: base, modelo: "m", fetchImpl: fetchAlias as any, keepAliveMs: 45_000.7 });
  c("★ el alias viejo también lleva la residencia, y el valor se trunca a entero",
    cuerpo?.keep_alive === 45000, JSON.stringify(cuerpo));
}

// ── El cable: el embedder vive en el motor y lo monta el router (v1.98.0) ──
{
  const srv = leer("server.ts");
  const router = leer("server/routers/embedderCerebro.ts");
  c("★ server.ts ya no define el embedder inline (partir, no añadir)", !/async function embedCerebroLocal\(/.test(srv));
  // v1.98.0: el que señala el modelo es `montarResolutorEmbedder` (mira qué hay
  // descargado antes de pedir), así que el import del embedder vivo está en el
  // router y el monolito sólo arma y usa el resolutor.
  c("★ v1.99.0 · el router decide la residencia del embedder (no el escalón del chat) y se la pasa al motor",
    /CN_EMBED_KEEP_ALIVE_MS/.test(router) && /embedCerebroLocal\(textos, senal, \{ baseUrl: base, modelo: res\.modelo, fetchImpl, keepAliveMs \}\)/.test(router));
  c("el import del embedder se fue al router que lo resuelve por residencia",
    /import \{ embedCerebroLocal \} from "\.\.\/\.\.\/src\/engine\/embedderLocal"/.test(router) && /embedCerebroLocal\(textos, senal, \{ baseUrl: base, modelo: res\.modelo/.test(router));
  c("server.ts monta el resolutor y le pasa SU embedder al híbrido (una sola instancia)",
    /montarResolutorEmbedder\(\{/.test(srv) && /embed: cerebroEmbedder\.embed/.test(srv) && (srv.match(/cerebroEmbedder\.embed/g) || []).length >= 2,
    `embed: ${(((srv.match(/cerebroEmbedder\.embed/g) || []).length))}`);
  // El techo se lee del contrato que regenera `scripts/superficie.mjs`
  // (`techo_absoluto_lineas`), no de un número copiado a mano: un presupuesto que
  // hay que retocar cada versión es un presupuesto que se retoca para pasar. El
  // trinquete sigue vivo — `superficie:verificar` es el que avisa del crecimiento.
  const contrato = JSON.parse(leer("contrato-rutas.json"));
  const lineas = srv.split("\n").length - 1;
  const techo = Number(contrato.techo_absoluto_lineas || 0);
  c(`y el monolito sigue bajo el techo absoluto del contrato (${techo})`,
    techo > 0 && lineas <= techo, `${lineas} líneas`);
}

console.log(`\n═══ embedderLocal: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
