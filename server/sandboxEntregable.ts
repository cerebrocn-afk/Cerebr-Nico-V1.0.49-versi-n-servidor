/**
 * sandboxEntregable.ts — v1.97.4 · EL ENTREGABLE ES UN SOLO ZIP (pedido de Mario)
 * ================================================================================
 * «Si es una web, un zip con todo dentro; si es una app, lo mismo; siempre
 *  priorizar un solo archivo con toda la documentación dentro (recordatorio md)».
 *
 * ¿POR QUÉ VIVE ACÁ Y NO EN server.ts?
 * El techo del monolito lo congelan dos vallas antiguas (tests/embedderLocal
 * a 12174 y tests/rutasSistema a 12178 líneas) y la cultura de la casa es
 * PARTIR el código, no agrandar el presupuesto: estos ~110 líneas no tenían
 * derecho a ir al monolito. El servidor solo registra las dos rutas (una
 * línea cada una, visible para el trinquete de superficie) y delega acá.
 *
 * LA VERDAD ES EL DISCO: el ZIP del botón verde de la barra solo llevaba el
 * WORKSPACE DEL EDITOR (en la sesión del 31/10 medía `workspaceFiles: 0` con
 * dos proyectos enteros escritos por el agente en el sandbox: control-dinero/
 * y web-cerebronico/ — el usuario no los veía en ninguna parte). Este módulo
 * recorre la raíz resuelta del sandbox, excluye lo que nunca viaja, y si el
 * proyecto no trae RECORDATORIO.md / LEEME.md / README.md lo GENERA:
 * inventario + pesos + cómo arrancarlo. Nunca pisa una documentación escrita
 * por el modelo (es más verdad que la generada).
 *
 * zipMinimo: STORED, determinista y auditado por tests/zipDocx (un lector
 * externo verifica el CRC de cada entrada).
 */
import type { Request, Response } from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { crearZip } from "../src/engine/zipMinimo";
import { esOrganoDelIDE } from "../src/engine/entregable";
// v1.0.22 · LA RAÍZ DE DATOS NO ES UN ENTREGABLE. Ver src/engine/raizEntregable.ts:
// el incidente del 16/11 fue empaquetar C:\Cerebronico entero y descomprimirlo
// encima de sí mismo. Estas dos funciones son la única puerta.
import { proponerPaquete, NUNCA_PROYECTO, mismaRuta } from "../src/engine/raizEntregable";
import { huecoDeArranque } from "../src/engine/completitud";
import {
  cabeceraDeDescarga,
  cabeceraDeDescargaArchivo,
  agruparEntregables,
  carpetaDeProyecto,
  envolverEntradas,
  estadoDelPaquete,
  fechaDePaquete,
  nombreDelZip,
  pesoLegible,
  proyectoDe,
  rutaDentroDeSandbox,
  tipoDeContenido,
} from "../src/engine/entregable";

/** Lo que el monolito inyecta: la aduana, la raíz resuelta y la raíz de datos. */
export interface CtxEntregable {
  raizDe: () => string | null;
  raizDatos: string;
  autorizado: (req: Request) => boolean;
}

const EXCLUIR_ENTREGABLE = new Set(["node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage", ".next", ".nuxt", "venv", "__pycache__", ".cerebro-db", ".cerebronico", ".vite", ".revisiones"]);
/** Un entregable no viaja a 60 MB ni con un binario de más de 15 MB. */
const MAX_ENTREGABLE = 60 * 1024 * 1024;
const MAX_ARCHIVO = 15 * 1024 * 1024;

interface EntradaContada { nombre: string; datos: Uint8Array; peso: number }

/**
 * El recorrido del sandbox tiene dos modos y la diferencia importa:
 *
 *   · `contenido = true`  → arma el ZIP: hay que leer cada archivo.
 *   · `contenido = false` → la HOJA DE RUTA pregunta cada 2 s si hay trabajo.
 *     Leer 60 MB cada dos segundos para mostrar una cifra es un gasto brutal que
 *     además congela el servidor en proyectos grandes. Del listado solo se
 *     necesita el `statSync`: nombre y peso.
 *
 * La valla del peso (`MAX_ARCHIVO` / `MAX_ENTREGABLE`) corre en los dos modos
 * para que la cifra que anuncia la hoja sea la misma que después baja el ZIP.
 *
 * v1.0.13 · `raizEsDatos` ya no viaja como tercer argumento: la llamada tiene
 * que leerse `recopilar(raiz, contenido)` — es el contrato que vigila
 * tests/hojaRutaFormatoChat (la hoja sondea SIN leer contenido). El dato de si
 * la raíz es la de datos se resuelve DENTRO, comparando contra una referencia
 * que el llamador deja en el contexto del módulo.
 */
let raizDatosVigente = "";
function recopilar(raiz: string, contenido = true): { entradas: EntradaContada[]; bytes: number; topado: boolean } {
  // v1.0.22 · SEGUNDA PUERTA (defensa en profundidad): aunque alguien llame a
  // `recopilar` con la raíz de datos, no se recorre. La primera puerta es
  // `raizDelPaquete`; esta existe porque un incidente que llegó al disco del
  // usuario no se protege con una sola condición.
  const raizEsDatos = !!raizDatosVigente && mismaRuta(raiz, raizDatosVigente);
  if (raizEsDatos) return { entradas: [], bytes: 0, topado: false };
  const entradas: EntradaContada[] = [];
  let bytes = 0;
  let topado = false;
  const caminar = (dir: string, prefijo: string) => {
    if (topado) return;
    let items: string[] = [];
    try { items = fs.readdirSync(dir).sort(); } catch { return; }
    for (const n of items) {
      if (EXCLUIR_ENTREGABLE.has(n) || NUNCA_PROYECTO.has(n)) continue;
      const abs = path.join(dir, n);
      const rel = prefijo ? `${prefijo}/${n}` : n;
      // v1.0.11 · recorriendo la raíz de datos SIN vincular, los órganos de la
      // IDE (sus md, lanzadores, rasclo, documentación interna) no son obra de
      // la sesión y no ensucian la lista de descargas.
      if (raizEsDatos && esOrganoDelIDE(rel)) continue;
      let st: fs.Stats;
      try { st = fs.statSync(abs); } catch { continue; }
      if (st.isDirectory()) { caminar(abs, rel); continue; }
      if (st.size > MAX_ARCHIVO) continue;
      bytes += st.size;
      if (bytes > MAX_ENTREGABLE) { topado = true; return; }
      let datos = new Uint8Array(0);
      if (contenido) {
        try { datos = new Uint8Array(fs.readFileSync(abs)); } catch { continue; }
      }
      entradas.push({ nombre: rel, datos, peso: st.size });
    }
  };
  caminar(raiz, "");
  return { entradas, bytes, topado };
}

const HAY_DOC = /^(RECORDATORIO|LEEME|LEERME|README)([_-].*)?\.md$/i;

/** Marcador de arranque: lo mínimo para decir «esto es un proyecto y no una carpeta de datos». */
const HAY_ARRANQUE = ["package.json", "index.html", "main.py", "app.py", "index.php", "Cargo.toml", "go.mod"];

/**
 * v1.0.22 · LA PROPUESTA DE RAÍZ, antes de recorrer un solo archivo.
 * Devuelve la carpeta legítima o el motivo por el que no hay entregable. Es
 * síncrona y no lee contenido: solo `existsSync` de marcadores y un `readdir`
 * para enumerar subcarpetas (que es lo que cuesta barato).
 */
/** `web-cerebronico-2026-11-16.zip` → `web-cerebronico-2026-11-16` (la carpeta que envuelve). */
function nombreSeguroEnvuelto(nombreDelZip: string): string {
  const sinExtension = String(nombreDelZip || "").replace(/\.zip$/i, "");
  const limpio = sinExtension.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[-.]+|[-.]+$/g, "");
  return limpio || "entregable";
}

function raizDelPaquete(raiz: string | null, raizDatos: string) {
  let raizReal = raiz;
  // Si el resolutor devolvió la raíz de datos, se mira dónde está DE VERDAD el
  // proyecto: la guarda de projectPorter no lo salva (devuelve la base cuando
  // hay un package.json suelto, y la base es la raíz de datos).
  const propuesta = proponerPaquete({
    raiz: raizReal,
    raizDatos,
    existe: (d) => { try { return fs.existsSync(d); } catch { return false; } },
    esProyecto: (d) => HAY_ARRANQUE.some((f) => { try { return fs.existsSync(path.join(d, f)); } catch { return false; } }),
    subcarpetas: (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } },
  });
  return propuesta;
}

/**
 * El resumen que la hoja necesita ANTES de ofrecer un botón: qué hay adentro, cómo
 * se va a llamar el paquete y si está EMPACADO. Se calcula una sola vez y lo
 * consumen los dos extremos, para que el nombre que se muestra en pantalla sea
 * literalmente el nombre del archivo que cae en Descargas. Dos cuentas distintas
 * de la misma pregunta es justo como se pierde la confianza en un botón.
 *
 * v1.98.0 — nace de la queja «siempre dice descargar todo zip, debería estar cuando
 * el pedido esté empacado, con su nombre y todo».
 */
function resumenDePaquete(raiz: string, raizDatos: string, contenido = true) {
  raizDatosVigente = raizDatos;
  const { entradas, bytes, topado } = recopilar(raiz, contenido);
  const nombres = entradas.map((e) => e.nombre);
  // El agente escribe DENTRO de una carpeta (`web-cerebronico/index.html`), así que
  // el juzgador de arranque tiene que preguntar ahí adentro y no en la raíz del
  // sandbox — si no, todo proyecto bien hecho parecería «sin punto de entrada».
  const carpeta = carpetaDeProyecto(nombres);
  const adentro = (rel: string) => (carpeta ? `${carpeta}/${rel}` : rel);
  const sonda = (rel: string) => {
    try {
      const st = fs.statSync(path.join(raiz, adentro(rel)));
      return { existe: true, esCarpeta: st.isDirectory(), bytes: st.size };
    } catch {
      return { existe: false, esCarpeta: false, bytes: 0 };
    }
  };
  const leer = (rel: string) => {
    try {
      return fs.readFileSync(path.join(raiz, adentro(rel)), "utf8");
    } catch {
      return null;
    }
  };
  const proyecto = proyectoDe(nombres, path.basename(raiz));
  return {
    entradas,
    bytes,
    topado,
    proyecto,
    nombre: nombreDelZip(proyecto, fechaDePaquete()),
    estado: estadoDelPaquete(nombres, huecoDeArranque(sonda, leer)),
    raizRel: path.relative(raizDatos, raiz) || ".",
  };
}

/**
 * `GET /api/sandbox/zip-info` — la hoja pregunta ANTES de ofrecer el botón.
 *
 * v2.0.1 — el pedido del 1/11 pide más que una cifra global: «código, avisos,
 * descripciones, post data y entregables CON NOMBRE Y PESO para descargar». El
 * responden los tres campos nuevos, siempre con las MISMAS cuentas que arman el
 * ZIP (otra fuente de verdad para el mismo disco es exactamente como se pierde
 * la confianza en un botón):
 *   · `peso`   → la cifra legible, en español, del paquete completo.
 *   · `grupos` → los archivos agrupados en Código / Avisos / Descripciones /
 *                Datos (POST) / Entregables, cada uno con ruta, peso en bytes y
 *                peso legible. Se recortan 8 por grupo para el navegador, pero
 *                `archivos`/`bytes` siguen siendo del grupo completo y `ocultos`
 *                dice cuántos no entran en la vista.
 *   · `avisos` → lo que hay que saber antes de bajar, en una frase.
 */
export function infoEntregable(req: Request, res: Response, ctx: CtxEntregable): void {
  if (!ctx.autorizado(req)) { res.status(401).json({ error: "Acceso no autorizado." }); return; }
  try {
    // v1.0.22 · la hoja pregunta ANTES de ofrecer el botón y recibe la misma
    // negativa que daría la descarga: no se enseña un botón que va a fallar.
    const propuesta = raizDelPaquete(ctx.raizDe(), ctx.raizDatos);
    if (!propuesta.puede) {
      res.json({ ok: true, hayProyecto: false, listo: false, archivos: 0, bytes: 0, peso: "0 bytes", nombre: "", faltan: [], grupos: [], avisos: [propuesta.motivo], bloqueado: true, motivo: propuesta.motivo, raiz: ctx.raizDatos });
      return;
    }
    const raiz = propuesta.raiz;
    if (!raiz || !fs.existsSync(raiz)) {
      res.json({ ok: true, hayProyecto: false, listo: false, archivos: 0, bytes: 0, peso: "0 bytes", nombre: "", faltan: [], grupos: [], avisos: [], raiz: ctx.raizDatos });
      return;
    }
    // `false` = solo pesos, sin leer contenido: esta ruta se sondea cada 2 s.
    const r = resumenDePaquete(raiz, ctx.raizDatos, false);
    const grupos = agruparEntregables(r.entradas.map((e) => ({ ruta: e.nombre, bytes: e.peso })), 8);
    const avisos: string[] = [];
    if (!r.estado.tieneArranque) avisos.push("Todavía no hay punto de entrada: el paquete trae archivos, no una app que se pueda levantar.");
    for (const p of r.estado.faltan) {
      // El hueco de arranque ya se dijo arriba con palabras cortas: no se repite.
      if (!avisos.includes(p) && !/^no hay punto de entrada/i.test(p)) avisos.push(p);
    }
    if (r.topado) avisos.push("El paquete se corta en 60 MB: hay archivos que no van a entrar en este ZIP.");
    const pesados = r.entradas.filter((e) => e.peso > 5 * 1024 * 1024);
    if (pesados.length) avisos.push(`${pesados.length} archivo(s) pesan más de 5 MB cada uno (${pesados.slice(0, 3).map((e) => `${path.basename(e.nombre)} · ${pesoLegible(e.peso)}`).join(", ")}).`);
    if (!r.estado.tieneDocsPropias) avisos.push("La documentación del paquete (RECORDATORIO.md) la escribe el IDE al descargar, no la escribió el modelo.");
    res.json({
      ok: true,
      hayProyecto: r.entradas.length > 0,
      archivos: r.entradas.length,
      bytes: r.bytes,
      peso: pesoLegible(r.bytes),
      raizRel: r.raizRel,
      proyecto: r.proyecto,
      nombre: r.nombre,
      // «Empacado» = hay con qué levantar lo escrito y el juez de arranque no encontró hoyos.
      listo: r.estado.listo,
      faltan: r.estado.faltan,
      documentacion: r.estado.tieneDocsPropias,
      tope: r.topado,
      grupos,
      avisos,
    });
  } catch (e: any) {
    res.json({ ok: false, error: e?.message || String(e), hayProyecto: false, listo: false, archivos: 0, bytes: 0, peso: "0 bytes", nombre: "", faltan: [], grupos: [], avisos: [] });
  }
}

/**
 * `GET /api/sandbox/zip?archivo=<ruta>` — UN SOLO archivo del proyecto, con su
 * nombre real. La hoja de ruta lo usa para la flecha de cada renglón: el usuario
 * pidió bajar «el css» o «el json» sin tener que abrir el ZIP de 40 archivos.
 *
 * La aduana es la misma del paquete y la ruta se limpia antes de tocar disco:
 * `?archivo=../../etc/passwd` tiene que morir acá, no en un `readFileSync`.
 */
function archivoDelPaquete(req: Request, res: Response, raiz: string): boolean {
  // `req.query` puede venir vacío (las suites simulan peticiones sin_query).
  const pedida = typeof req.query?.archivo === "string" ? String(req.query.archivo) : "";
  if (!pedida) return false;
  const segura = rutaDentroDeSandbox(pedida);
  if (!segura) { res.status(400).json({ error: "la ruta pedida no es un archivo dentro del sandbox" }); return true; }
  const tramos = segura.split("/");
  if (tramos.some((p) => EXCLUIR_ENTREGABLE.has(p))) { res.status(404).json({ error: "ese archivo no forma parte del entregable" }); return true; }
  const absoluta = path.resolve(path.join(raiz, ...tramos));
  const raizResuelta = path.resolve(raiz);
  if (absoluta !== raizResuelta && !absoluta.startsWith(raizResuelta + path.sep)) {
    res.status(403).json({ error: "la ruta pedida quedó fuera del sandbox" });
    return true;
  }
  let st: fs.Stats;
  try { st = fs.statSync(absoluta); } catch { res.status(404).json({ error: "no hay ningún archivo con ese nombre en el proyecto" }); return true; }
  if (!st.isFile()) { res.status(400).json({ error: "eso es una carpeta: se descarga con el ZIP completo" }); return true; }
  if (st.size > MAX_ARCHIVO) { res.status(413).json({ error: `el archivo pesa ${pesoLegible(st.size)} y el tope por archivo es ${pesoLegible(MAX_ARCHIVO)}` }); return true; }
  const datos = fs.readFileSync(absoluta);
  res.setHeader("Content-Type", tipoDeContenido(segura));
  res.setHeader("Content-Disposition", cabeceraDeDescargaArchivo(tramos[tramos.length - 1]));
  res.setHeader("Content-Length", String(datos.length));
  console.log(`[CerebroNico] Entregable suelto: ${segura} (${pesoLegible(datos.length)}).`);
  res.end(datos);
  return true;
}

/** `GET /api/sandbox/zip` — el paquete completo, en un solo ZIP. */
export function zipEntregable(req: Request, res: Response, ctx: CtxEntregable): void {
  if (!ctx.autorizado(req)) { res.status(401).json({ error: "Acceso no autorizado." }); return; }
  try {
    // v1.0.22 · PRIMERA PUERTA, y va ANTES de tocar un solo archivo: si el
    // entregable apunta a la raíz de datos de la IDE, acá se corta. El 16/11 este
    // botón devolvió `C:\Cerebronico` entero y al descomprimirlo se esparció por
    // el disco del usuario. 409 = hay carpeta, pero no es un entregable.
    const propuesta = raizDelPaquete(ctx.raizDe(), ctx.raizDatos);
    if (!propuesta.puede) {
      res.status(409).json({ error: propuesta.motivo, apuntabaALaRaizDeDatos: propuesta.apartado, raiz: ctx.raizDatos });
      console.log(`[CerebroNico] Entregable DENEGADO: ${propuesta.motivo}.`);
      return;
    }
    const raiz = propuesta.raiz;
    if (propuesta.apartado) console.log(`[CerebroNico] Entregable apartado de la raíz de datos: ${propuesta.motivo}.`);
    if (!raiz || !fs.existsSync(raiz)) { res.status(404).json({ error: "no hay proyecto en el sandbox para empaquetar" }); return; }
    // `?archivo=…` baja UNA pieza; sin el parámetro sigue bajando el paquete entero.
    if (archivoDelPaquete(req, res, raiz)) return;
    const r = resumenDePaquete(raiz, ctx.raizDatos, true);
    const { entradas, bytes, topado } = r;
    if (!entradas.length) { res.status(404).json({ error: "el proyecto del sandbox no tiene archivos que empaquetar" }); return; }
    const hayDoc = entradas.some((e) => HAY_DOC.test(e.nombre));
    if (!hayDoc) {
      // El inventario del RECORDATORIO se agrupa con el MISMO criterio que muestra
      // la hoja de ruta: lo que el usuario vio en pantalla es lo que lee en el ZIP.
      const gruposDoc = agruparEntregables(entradas.map((e) => ({ ruta: e.nombre, bytes: e.peso })), 400);
      const md = [
        "# RECORDATORIO DEL ENTREGABLE",
        "",
        `Generado por CerebróNico IDE el ${new Date().toISOString().slice(0, 10)} — un solo ZIP con todo lo escrito en el sandbox.`,
        `Origen en disco: ${raiz}`,
        `Archivos: ${entradas.length} · Peso: ${pesoLegible(bytes)}${topado ? " · EMPAQUETADO HASTA EL TOPE (60 MB)" : ""}`,
        "",
        ...gruposDoc.flatMap((g) => [
          `## ${g.titulo} — ${g.archivos} archivo(s) · ${g.peso}`,
          `_${g.descripcion}_`,
          ...g.items.map((it) => `  - ${it.ruta} (${it.peso})`),
          g.ocultos > 0 ? `  … y ${g.ocultos} más en este grupo` : "",
          "",
        ]),
        "",
        "## Cómo arrancarlo",
        fs.existsSync(path.join(raiz, "package.json"))
          ? "  - `npm install` y luego `npm run dev` (o `npm start`)."
          : "  - Es HTML/CSS/JS estático: abrir `index.html` o servir la carpeta con cualquier servidor.",
        "",
      ].join("\n");
      const datosDoc = new TextEncoder().encode(md);
      entradas.push({ nombre: "RECORDATORIO.md", datos: datosDoc, peso: datosDoc.length });
    }
    // v1.0.22 · SEGUNDA MITAD: todo va dentro de una carpeta con el nombre del
    // proyecto. Sin envoltorio, el ZIP suelta sus archivos sobre lo que ya había
    // en la carpeta donde uno lo descomprime. `crearZip` además sanea cada nombre
    // (`..`, `C:`, control), así que ni con un nombre torcido se sale del árbol.
    const conCarpeta = envolverEntradas(entradas, nombreSeguroEnvuelto(r.nombre));
    const zip = crearZip(conCarpeta);
    res.setHeader("Content-Type", "application/zip");
    // v1.98.0 · EL PAQUETE TIENE NOMBRE PROPIO. Antes salía siempre
    // `entregable-cerebronico.zip`: bajar dos proyectos distintos daba dos archivos
    // iguales y el navegador los numeraba. Ahora es `<proyecto>-<fecha>.zip`, el
    // mismo nombre exacto que la hoja mostró antes de que uno haga clic.
    res.setHeader("Content-Disposition", cabeceraDeDescarga(r.nombre));
    res.setHeader("Content-Length", String(zip.length));
    console.log(`[CerebroNico] Entregable ZIP: ${conCarpeta.length} archivo(s), ${Math.max(1, Math.round(zip.length / 1024))} KB (raíz: ${path.relative(ctx.raizDatos, raiz) || "."}, carpeta: ${nombreSeguroEnvuelto(r.nombre)}).`);
    res.end(Buffer.from(zip));
  } catch (e: any) {
    res.status(500).json({ error: `no se pudo armar el ZIP del entregable: ${e?.message || e}` });
  }
}
