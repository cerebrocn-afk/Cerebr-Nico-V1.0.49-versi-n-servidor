/**
 * tests/entregableZip.test.ts — v1.97.4 · EL ENTREGABLE ES UN SOLO ZIP, DESDE EL DISCO
 * ================================================================================
 * El pedido (Mario, 31/10, con la sesión exportada): «en la hoja de ruta activa
 * que muestre los entregables directo para descargar; si es una web un zip con
 * todo dentro, si es una app lo mismo; SIEMPRE priorizar un solo archivo con
 * toda la documentación dentro (recordatorio md)».
 *
 * EL DEFECTO QUE CURA: en esa sesión el workspace del editor medía
 * `workspaceFiles: 0` con DOS proyectos enteros escritos por el agente directo
 * en el sandbox (control-dinero/, web-cerebronico/): el ZIP del botón verde
 * (generateProjectZip(workspaceFiles)) no los alcanzaba — el usuario no veía
 * sus archivos en ninguna parte. La verdad es el DISCO, y `zipEntregable` la
 * recorre. Esta valla prueba el comportamiento con req/res simulados (sin
 * servidor): una valla que levanta el monolito depende de tu equipo.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { infoEntregable, zipEntregable, type CtxEntregable } from "../server/sandboxEntregable";
import { abrirZip } from "../src/engine/zipMinimo";

let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};

// req/res simulados: el módulo solo usa setHeader/status/json/end.
const resMock = () => ({
  headers: {} as Record<string, string>,
  code: 200,
  body: null as any,
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
  status(n: number) { this.code = n; return this; },
  json(o: any) { this.body = o; return this; },
  end(b?: any) { this.body = b ?? this.body; return this; },
});
const req = {} as any;

const caja = fs.mkdtempSync(path.join(os.tmpdir(), "cn-entregable-"));
const datos = path.join(caja, "datos");
const proyecto = path.join(datos, "proyecto");
fs.mkdirSync(path.join(proyecto, "sub"), { recursive: true });
fs.writeFileSync(path.join(proyecto, "index.html"), "<html>hola</html>");
fs.writeFileSync(path.join(proyecto, "sub", "app.js"), "console.log(1)");
fs.mkdirSync(path.join(proyecto, "node_modules", "basura"), { recursive: true });
fs.writeFileSync(path.join(proyecto, "node_modules", "basura", "x.js"), "no viaja");

const ctxOk: CtxEntregable = { raizDe: () => proyecto, raizDatos: datos, autorizado: () => true };
const ctxNo: CtxEntregable = { ...ctxOk, autorizado: () => false };
const ctxVacio: CtxEntregable = { raizDe: () => path.join(datos, "no-existe"), raizDatos: datos, autorizado: () => true };

console.log("── §1 · la aduana manda ──");
{
  const r = resMock(); zipEntregable(req, r, ctxNo);
  c("sin aduana el ZIP se niega con 401", r.code === 401, `code=${r.code}`);
  const r2 = resMock(); infoEntregable(req, r2, ctxNo);
  c("sin aduana la info se niega con 401", r2.code === 401, `code=${r2.code}`);
}

console.log("── §2 · la info dice la verdad antes del botón ──");
{
  const r = resMock(); infoEntregable(req, r, ctxVacio);
  c("sin proyecto, la info declara hayProyecto:false (no hay botón que engañe)", r.code === 200 && r.body?.ok === true && r.body?.hayProyecto === false, JSON.stringify(r.body));
  const r2 = resMock(); infoEntregable(req, r2, ctxOk);
  c("cuenta lo que está en disco: 2 archivos (node_modules fuera)", r2.body?.hayProyecto === true && r2.body?.archivos === 2, JSON.stringify(r2.body));
  c("y el destino es relativo a la raíz de datos", r2.body?.raizRel === "proyecto", String(r2.body?.raizRel));
}

console.log("── §3 · el paquete: TODO lo escrito, CRC, documentación adentro ──");
{
  const r = resMock(); zipEntregable(req, r, ctxOk);
  c("se entrega como attachment de aplicación zip", r.headers["content-disposition"]?.includes("attachment") === true && r.headers["content-type"] === "application/zip", JSON.stringify(r.headers));
  const ab = abrirZip(new Uint8Array(r.body));
  c("★ el ZIP se reabre y todos los CRC cuadran", ab.ok && ab.total === 3, JSON.stringify(ab.motivo ?? ab.total));
  // v1.0.22 · EL PAQUETE VIAJA DENTRO DE SU CARPETA (incidente del 16/11: el ZIP
  // se descomprimía suelto y se esparcía por el disco de Mario). La valla de
  // arriba —«entra TODO lo escrito»— se comprueba AHORA con el prefijo del
  // envoltorio: los archivos siguen estando todos, un tramo más adentro, y ese
  // tramo es justamente lo que hace que descomprimir no mezcle nada.
  const nombres = ab.entradas.map((e) => e.nombre).sort();
  const envuelto = (rel: string) => nombres.some((n) => n === rel || n.endsWith(`/${rel}`));
  const carpeta = nombres.length ? nombres[0].split("/")[0] : "";
  c("entra TODO lo escrito, subcarpetas incluidas", envuelto("index.html") && envuelto("sub/app.js"), nombres.join(", "));
  c("★ todo cuelga de UNA carpeta envoltorio (descomprimir no mezcla nada)",
    !!carpeta && nombres.every((n) => n.startsWith(`${carpeta}/`)), nombres.join(", "));
  c("node_modules no viaja", !nombres.some((n) => n.split("/").includes("node_modules")), nombres.join(", "));
  c("sin documentación, se genera RECORDATORIO.md", envuelto("RECORDATORIO.md"), nombres.join(", "));
  const rec = ab.entradas.find((e) => e.nombre === "RECORDATORIO.md" || e.nombre.endsWith("/RECORDATORIO.md"));
  const txt = rec ? new TextDecoder().decode(rec.datos) : "";
  c("el recordatorio tiene título, inventario y cómo arrancarlo", txt.includes("RECORDATORIO DEL ENTREGABLE") && txt.includes("index.html") && txt.includes("Cómo arrancarlo"), txt.slice(0, 140));
}

console.log("── §4 · la documentación del proyecto NUNCA se pisa ──");
{
  fs.writeFileSync(path.join(proyecto, "README.md"), "# Mi doc (del modelo)");
  const r1 = resMock(); zipEntregable(req, r1, ctxOk);
  const a1 = abrirZip(new Uint8Array(r1.body));
  const n1 = a1.entradas.map((e) => e.nombre);
  c("con README.md no se genera RECORDATORIO (la doc escrita manda)",
    !n1.some((n) => n.endsWith("RECORDATORIO.md")) && n1.some((n) => n.endsWith("README.md")), n1.join(", "));
  const r2 = resMock(); zipEntregable(req, r2, ctxOk);
  c("mismo árbol (con doc) → mismos bytes (determinista: nada de reloj)", Buffer.compare(new Buffer(r1.body), new Buffer(r2.body)) === 0);
}


console.log("── §5 · los entregables con NOMBRE Y PESO, agrupados (v2.0.1) ──");
{
  // Proyecto de muestra con una pieza de cada grupo pedido el 1/11.
  const caja2 = path.join(caja, "multigrupo");
  fs.mkdirSync(path.join(caja2, "datos"), { recursive: true });
  const raiz = path.join(caja2, "datos", "tienda");
  fs.mkdirSync(raiz, { recursive: true });
  fs.writeFileSync(path.join(raiz, "index.html"), "<html>tienda</html>");
  fs.writeFileSync(path.join(raiz, "styles.css"), "body{color:#fff}");
  fs.writeFileSync(path.join(raiz, "package.json"), "{\"name\":\"tienda\"}");
  fs.writeFileSync(path.join(raiz, "AVISOS.md"), "# Avisos\n- falta el pago");
  fs.writeFileSync(path.join(raiz, "post-pedido.json"), "{\"post\":true}");
  fs.writeFileSync(path.join(raiz, "LEEME.md"), "# Cómo arrancar la tienda");
  fs.writeFileSync(path.join(raiz, "paquete-final.zip"), "PK\x03\x04falso");
  fs.mkdirSync(path.join(raiz, "assets"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "assets", "logo.png"), "png")
  const ctx2: CtxEntregable = { raizDe: () => raiz, raizDatos: path.join(caja2, "datos"), autorizado: () => true };

  const r = resMock();
  infoEntregable({ query: {} } as any, r, ctx2);
  const grupos: any[] = r.body?.grupos || [];
  const porId = Object.fromEntries(grupos.map((g) => [g.id, g]));
  c("★ zip-info devuelve los cinco grupos pedidos, no una cifra global",
    ["codigo", "avisos", "descripciones", "datos", "paquetes"].every((id) => porId[id]),
    grupos.map((g) => g.id).join(","));
  c("los rótulos están en español (Código / Avisos / Descripciones / Datos / Entregables)",
    porId.codigo?.titulo === "Código" && porId.avisos?.titulo === "Avisos" &&
    porId.descripciones?.titulo === "Descripciones" && porId.datos?.titulo === "Datos" &&
    porId.paquetes?.titulo === "Entregables",
    grupos.map((g) => `${g.titulo}`).join(" · "));
  c("package.json cae en CÓDIGO y no en DATOS (es parte del proyecto)",
    (porId.codigo?.items || []).some((i: any) => i.ruta === "package.json"),
    (porId.codigo?.items || []).map((i: any) => i.ruta).join(","));
  c("el cargo enviado (POST) cae en DATOS",
    (porId.datos?.items || []).some((i: any) => i.ruta === "post-pedido.json"),
    (porId.datos?.items || []).map((i: any) => i.ruta).join(","));
  c("AVISO.md cae en AVISOS y LEEME.md en DESCRIPCIONES",
    (porId.avisos?.items || []).some((i: any) => i.ruta === "AVISOS.md") &&
    (porId.descripciones?.items || []).some((i: any) => i.ruta === "LEEME.md"));
  c("cada renglón trae nombre, bytes y peso legible (lo que se pidió: nombre y peso)",
    grupos.every((g) => g.items.every((i: any) => !!i.nombre && Number.isFinite(i.bytes) && /\d/.test(i.peso))),
    JSON.stringify(grupos[0]?.items?.[0]));
  c("los pesos por grupo suman el total del paquete (no es una cifra decorativa)",
    grupos.reduce((n, g) => n + g.bytes, 0) === r.body.bytes,
    `${grupos.reduce((n, g) => n + g.bytes, 0)} vs ${r.body.bytes}`);
  c("el paquete completo también se dice en peso legible", /\d/.test(String(r.body.peso || "")), String(r.body.peso));
  c("con el proyecto completo y documentado, la hoja NO inventa avisos",
    Array.isArray(r.body.avisos) && r.body.avisos.length === 0, JSON.stringify(r.body.avisos));

  // Y el aviso sale cuando de verdad falta algo: medio proyecto, sin documentación.
  const caja3 = path.join(caja, "a-medias");
  fs.mkdirSync(caja3, { recursive: true });
  fs.writeFileSync(path.join(caja3, "notas.md"), "apuntes sueltos");
  fs.writeFileSync(path.join(caja3, "post-alta.json"), "{}");
  const r3 = resMock();
  infoEntregable({ query: {} } as any, r3, { raizDe: () => caja3, raizDatos: caja, autorizado: () => true });
  c("★ sin punto de entrada la hoja lo dice, con aviso y todo",
    r3.body?.listo === false && String((r3.body?.avisos || []).join(" ")).includes("punto de entrada"),
    JSON.stringify(r3.body?.avisos));
  c("y aún así se pueden listar y pesar los archivos que hay",
    (r3.body?.grupos || []).length >= 2 && r3.body?.archivos === 2,
    `${(r3.body?.grupos || []).length} grupos / ${r3.body?.archivos} archivos`);
  c("la hoja lista y pesa los 8 archivos sin armar el ZIP (el sondeo no paga lecturas)",
    grupos.every((g) => g.items.every((i: any) => i.bytes > 0)) && r.body.archivos === 8 && r.body.bytes > 0,
    `${r.body.archivos} archivos / ${r.body.bytes} bytes`);

  console.log("── §6 · bajar UN archivo suelto, con aduana y sin escaparse ──");
  const rj = resMock();
  zipEntregable({ query: { archivo: "post-pedido.json" } } as any, rj, ctx2);
  c("?archivo= baja ese archivo y no el ZIP", rj.code === 200 && Buffer.compare(Buffer.from(rj.body), fs.readFileSync(path.join(raiz, "post-pedido.json"))) === 0,
    String(rj.code));
  c("sale como attachment con su nombre real y su tipo",
    String(rj.headers["content-disposition"]).includes("post-pedido.json") && String(rj.headers["content-type"]).includes("json"),
    JSON.stringify(rj.headers));
  const rc = resMock();
  zipEntregable({ query: { archivo: "../../../../etc/passwd" } } as any, rc, ctx2);
  c("★ la ruta con `..` se niega antes de tocar disco", rc.code === 400 && !String(JSON.stringify(rc.body)).includes("root:"), String(rc.code));
  const rn = resMock();
  zipEntregable({ query: { archivo: "no-existe.css" } } as any, rn, ctx2);
  c("un archivo que no está no se inventa: 404", rn.code === 404, String(rn.code));
  const rx = resMock();
  zipEntregable({ query: { archivo: "index.html" } } as any, rx, ctxNo);
  c("sin aduana no se baja NADA, ni un archivo suelto", rx.code === 401, String(rx.code));
  const rd = resMock();
  zipEntregable({ query: { archivo: "assets" } } as any, rd, ctx2);
  c("una carpeta no se descarga: se dice que use el ZIP completo", rd.code === 400, String(rd.code));
  c("el logo viaja en ENTREGABLES (es el archivo final, no código)",
    (porId.paquetes?.items || []).some((i: any) => /logo\.png$/.test(i.ruta)),
    (porId.paquetes?.items || []).map((i: any) => i.ruta).join(","));
  const ri = resMock();
  infoEntregable({ query: {} } as any, ri, ctxNo);
  c("sin aduana tampoco hay listado de grupos", ri.code === 401, String(ri.code));
}

fs.rmSync(caja, { recursive: true, force: true });
console.log(`\n═══ entregableZip: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
