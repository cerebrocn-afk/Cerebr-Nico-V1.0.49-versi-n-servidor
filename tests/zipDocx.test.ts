/**
 * zipDocx.test.ts — v1.96.0 · UN .docx QUE UN LECTOR DE VERDAD ACEPTA
 * ===================================================================
 * El pedido de Mario (30/10): «100 skills más, enfocadas en producción certera de código,
 * app, web y archivos varios: word, pdf, etc.; si hace falta agregar herramientas para que
 * esas skills sean funcionales, agregar, cablear y chequear».
 *
 * «Word» no tenía máquina: `pdfjs-dist` lee PDF, `jszip` estaba disponible pero nadie
 * escribía paquetes OPC, y la receta de `trabajoSeguro` para .docx estaba declarada
 * `pendiente` (la respuesta honesta, pero un hueco al fin). Esta valla es la prueba de que
 * el hueco se cerró — y la prueba NO es nuestra propia auditoría passing: es que
 * `unzip -t` (utilidad externa, especificación ZIP) y `JSZip` (lector OPC real, ya en las
 * dependencias del proyecto) acepten lo que escribimos, y que el texto sobreviva el viaje.
 *
 * La lección viene de la 1.95.x: cuando el artefacto generado es BYTES, la valla tiene que
 * abrir los bytes con alguien que no sea uno mismo. `crear_pdf` se audita con pdfjs; el
 * .docx, acá.
 *
 * v1.97.3 · LA VALLA VIAJA CON EL USUARIO. En Windows con `cmd` sin Git-Bash no existe
 * `unzip` en el PATH: spawnSync devuelve ENOENT y las cuatro vallas externas salían
 * ROJAS aunque el ZIP fuera perfecto (v1.97.2: 4 fallos, todos de binario, ninguno de
 * lógica — en Linux las mismas 42 comprobaciones pasan). La cascada de lectores
 * preserva la exigencia original («alguien que no sea uno mismo», CRC REAL) en toda
 * plataforma:
 *   1. `unzip -t` / `unzip -l` — la referencia de la especificación, cuando existe;
 *   2. `7z t` / `7z l` — 7-Zip (verifica CRC al testear);
 *   3. `python3 -m zipfile -t` (o `python`) — otra implementación completa del formato;
 *   4. última escala: Node — `zlib.crc32` (C, Node ≥ 20.15) o el CRC32 clásico sin tabla
 *      de esta valla, AUTOCALIBRADO contra el valor estándar del RFC («123456789» =
 *      0xCBF43926) antes de confiarle un byte: si la implementación se miente, la valla
 *      cae roja. `JSZip` solo lista (medido: NO verifica CRC al extraer, v1.97.3).
 * Cada comprobación DECLARA con qué lector validó: se ve quién abrió los bytes.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync as _spawnSync } from "node:child_process";
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};
const seccion = (t: string) => console.log("\n── " + t);

const DOCUMENTO = {
  titulo: "Informe de avance — tecnología e IA 2026-2030",
  subtitulo: "Editado en Word: acentos, ñ, comillas “tipográficas” y símbolos <&>",
  secciones: [
    { titulo: "1. Resumen", parrafos: ["Párrafo con texto corrido y una segunda línea.", "Segundo párrafo."], puntos: ["Primera viñeta", "Segunda viñeta con (paréntesis)"], tabla: [["Concepto", "Valor", "Fuente"], ["Inversión", "1.234 USD", "Plan"], ["Riesgo", "Bajo", "Board"]] },
    { titulo: "2. Plan", parrafos: ["Lo que sigue."], puntos: ["Hito A", "Hito B"] },
  ],
  nota: "Documento generado por CerebroNico con docxMinimo.ts",
};

const { crearZip, abrirZip } = await import("../src/engine/zipMinimo");
const { crearDocx, auditarDocx } = await import("../src/engine/docxMinimo");
const { SPEC_CRIAR_ZIP, ejecutarCrearZip } = await import("../src/engine/herramientaZip");

// ─── v1.97.3 · LA ESCALERA DE LECTORES EXTERNOS ─────────────────────────────
// «Alguien que no sea uno mismo» en cualquier plataforma. Cada peldaño es una
// implementación distinta del formato; la comprobación declara cuál usó.
interface LectorVeredicto {
  ok: boolean;
  /** Qué lector abrió los bytes (se muestra en el detalle de la valla). */
  lector: string;
  /** Salida corta del lector (para el detalle del fallo). */
  detalle: string;
}

const binarioExiste = (bin: string): boolean => {
  const r = _spawnSync(bin, ["-h"], { encoding: "utf8", timeout: 10_000 });
  return !r.error && r.status !== undefined;
};

const salir = (r: any): string =>
  ((r?.stdout || "") + (r?.stderr || "")).trim().slice(0, 300);

/** CRC32 clásico SIN tabla (otra formulación que la del escritor, que usa tabla). */
function crc32Clasico(bytes: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = crc ^ bytes[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Último peldaño: Node verifica los CRC leyendo el directorio central y los
 * datos (almacenados o inflados con `zlib`, la C de Node). Antes de confiarle
 * UN byte, la implementación del CRC se autocalibra contra el valor estándar
 * del RFC: CRC32("123456789") debe ser 0xCBF43926 — si no, la valla cae roja.
 */
async function verificarCrcConNode(ruta: string): Promise<LectorVeredicto> {
  const zlib = await import("node:zlib");
  const bytes = readFileSync(ruta);
  const implZlib = typeof (zlib as any).crc32 === "function" ? (zlib as any).crc32 : null;
  const crcDe = (b: Uint8Array) => (implZlib ? implZlib(b) >>> 0 : crc32Clasico(b));
  const prueba = crcDe(new TextEncoder().encode("123456789"));
  if (prueba !== 0xcbf43926) {
    return { ok: false, lector: "Node (crc32)", detalle: `la implementación local del CRC se miente (valor de prueba 0x${prueba.toString(16)}, esperaba 0xcbf43926)` };
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { ok: false, lector: "Node (crc32)", detalle: "sin EOCD: el ZIP está truncado" };
  const total = dv.getUint16(eocd + 10, true);
  const inicioCD = dv.getUint32(eocd + 16, true);
  let p = inicioCD;
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) return { ok: false, lector: "Node (crc32)", detalle: `entrada ${n + 1} del directorio central con firma inválida` };
    const metodo = dv.getUint16(p + 10, true);
    const crcEsperado = dv.getUint32(p + 16, true);
    const largo = dv.getUint32(p + 20, true);
    const nombreL = dv.getUint16(p + 28, true);
    const extraL = dv.getUint16(p + 30, true);
    const comentL = dv.getUint16(p + 32, true);
    const desplazamiento = dv.getUint32(p + 42, true);
    const nombre = new TextDecoder("utf-8").decode(bytes.subarray(p + 46, p + 46 + nombreL));
    p += 46 + nombreL + extraL + comentL;
    if (dv.getUint32(desplazamiento, true) !== 0x04034b50) return { ok: false, lector: "Node (crc32)", detalle: `«${nombre}»: cabecera local en el lugar equivocado` };
    const nl = dv.getUint16(desplazamiento + 26, true);
    const el = dv.getUint16(desplazamiento + 28, true);
    const inicioDatos = desplazamiento + 30 + nl + el;
    if (inicioDatos + largo > bytes.length) return { ok: false, lector: "Node (crc32)", detalle: `«${nombre}»: los datos se salen del archivo` };
    let datos = bytes.subarray(inicioDatos, inicioDatos + largo);
    if (metodo === 8) datos = new Uint8Array(zlib.inflateRawSync(Buffer.from(datos)));
    if (crcDe(datos) !== crcEsperado) return { ok: false, lector: `Node (${implZlib ? "zlib.crc32" : "crc32 clásico"})`, detalle: `«${nombre}»: CRC no cuadra (el lector externo lo detecta)` };
  }
  return { ok: true, lector: `Node (${implZlib ? "zlib.crc32" : "crc32 clásico"})`, detalle: `${total} entrada(s), todos los CRC cuadran` };
}

/**
 * LA CASCADA de CRC real: `unzip -t` → `7z t` → `python(-3) -m zipfile -t` →
 * Node (zlib.crc32 o el CRC32 clásico autocalibrado de esta valla). Devuelve
 * el veredicto del PRIMERO que está disponible — y declara cuál fue.
 */
async function lectorExterno(ruta: string): Promise<LectorVeredicto> {
  if (binarioExiste("unzip")) {
    const r = _spawnSync("unzip", ["-t", ruta], { encoding: "utf8", timeout: 60_000 });
    return { ok: r.status === 0, lector: "unzip -t", detalle: salir(r) };
  }
  if (binarioExiste("7z")) {
    const r = _spawnSync("7z", ["t", ruta], { encoding: "utf8", timeout: 60_000 });
    return { ok: r.status === 0, lector: "7z t", detalle: salir(r) };
  }
  for (const py of ["python3", "python"]) {
    if (!binarioExiste(py)) continue;
    const r = _spawnSync(py, ["-m", "zipfile", "-t", ruta], { encoding: "utf8", timeout: 60_000 });
    return { ok: r.status === 0, lector: `${py} -m zipfile`, detalle: salir(r) };
  }
  return verificarCrcConNode(ruta);
}

/**
 * Listado de entradas con JSZip (lector OPC de terceros, ya en las
 * dependencias del proyecto): sus nombres salen del directorio central con el
 * flag UTF-8, deterministas en cualquier plataforma. (Medido v1.97.3: JSZip
 * NO verifica CRC al extraer, por eso el CRC nunca pasa por él.)
 */
async function nombresConJSZip(ruta: string): Promise<string[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(readFileSync(ruta));
  return Object.keys(zip.files);
}

seccion("§1 · EL CONTENEDOR: ZIP 2.0 escrito a mano");
{
  const z = crearZip([{ nombre: "a.txt", datos: "hola" }, { nombre: "dir/b.txt", datos: "mundo" }]);
  const a = abrirZip(z);
  c("firma PK al inicio", z[0] === 0x50 && z[1] === 0x4b);
  c("nuestro lector reabre las dos entradas", a.ok && a.total === 2, JSON.stringify(a.motivo || a.total));
  c("los CRC de cada entrada cuadran", a.entradas.every((e) => e.crcOk));
  const txt = new TextDecoder().decode(a.entradas.find((e) => e.nombre === "dir/b.txt")!.datos);
  c("el contenido sobrevive byte a byte", txt === "mundo", txt);
  c("ruta con backslash se normaliza a /", abrirZip(crearZip([{ nombre: "dir\\x.txt", datos: "1" }])).entradas[0].nombre === "dir/x.txt");
  let exploto = false;
  try { crearZip([]); } catch { exploto = true; }
  c("cero entradas es un error, no un archivo roto", exploto);
}

seccion("§2 · ZIP EXTERNO: un lector ajeno sobre lo que escribimos");
{
  const caja = mkdtempSync(join(tmpdir(), "cn-zip-"));
  const ruta = join(caja, "paquete.zip");
  const z = crearZip([
    { nombre: "[Content_Types].xml", datos: "<Types/>" },
    { nombre: "word/document.xml", datos: "<w:document><w:body><w:p><w:r><w:t>hola \u00f1</w:t></w:r></w:p></w:body></w:document>" },
    { nombre: "vacío.txt", datos: "" },
  ]);
  writeFileSync(ruta, Buffer.from(z));
  const r = await lectorExterno(ruta);
  c("★ un lector externo no encuentra errores en nuestro ZIP (CRC real)", r.ok, `${r.lector} — ${r.detalle.slice(0, 180)}`);
  const nombres = await nombresConJSZip(ruta);
  c("y el lector externo lista las tres entradas (JSZip, OPC)", ["[Content_Types].xml", "word/document.xml", "vacío.txt"].every((n) => nombres.includes(n)), nombres.join(", "));
}

seccion("§3 · EL .DOCX: máquina propia + dos lectores ajenos");
const docx = crearDocx(DOCUMENTO);
const aud = auditarDocx(docx);
c("empieza con PK (es un ZIP, no un .doc binario)", docx[0] === 0x50 && docx[1] === 0x4b);
c("★ la auditoría propia aprueba: partes, párrafos y muestra leída del XML", aud.ok && aud.partes === 5 && aud.parrafos >= 10 && /Informe de avance/.test(aud.muestra), JSON.stringify(aud));
{
  const JSZip = (await import("jszip")).default;
  const leido = await JSZip.loadAsync(Buffer.from(docx));
  const nombres = Object.keys(leido.files).sort();
  c("★ JSZip (lector OPC real) abre el paquete", nombres.length === 5, nombres.join(", "));
  c("y ve las cuatro partes obligatorias del formato", ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"].every((n) => nombres.includes(n)));
  const docXml = await leido.file("word/document.xml")!.async("string");
  c("★ el texto con acentos, comillas tipográficas y <&> sobrevivió el viaje XML",
    docXml.includes("Informe de avance") && docXml.includes("2026-2030") && docXml.includes("&amp;") && !docXml.includes(" <&>"));
  c("la tabla está como `w:tbl` con sus celdas", /<w:tbl>/.test(docXml) && (docXml.match(/<w:tc>/g) || []).length >= 9, String((docXml.match(/<w:tc>/g) || []).length));
  const ct = await leido.file("[Content_Types].xml")!.async("string");
  c("los Content-Types declaran el tipo de documento de Word", ct.includes("wordprocessingml.document.main+xml"));
  const rels = await leido.file("_rels/.rels")!.async("string");
  c("y el arranque del paquete apunta a word/document.xml", rels.includes("word/document.xml"));

  const caja = mkdtempSync(join(tmpdir(), "cn-docx-"));
  const ruta = join(caja, "informe.docx");
  writeFileSync(ruta, Buffer.from(docx));
  const t = await lectorExterno(ruta);
  c("★ un lector externo valida el .docx entero (integridad CRC real)", t.ok, `${t.lector} — ${t.detalle.slice(0, 180)}`);
}

seccion("§4 · DETERMINISMO: mismo documento, mismos bytes");
{
  const a = crearDocx(DOCUMENTO);
  const b = crearDocx(JSON.parse(JSON.stringify(DOCUMENTO)));
  c("★ dos generaciones idénticas producen el MISMO hash (nada de reloj dentro del archivo)",
    Buffer.from(a).equals(Buffer.from(b)));
  const c2 = crearDocx({ ...DOCUMENTO, titulo: "Otro título" });
  c("y un cambio de contenido SÍ cambia los bytes", !Buffer.from(a).equals(Buffer.from(c2)));
}

seccion("§5 · LA AUDITORÍA RECHAZA LO QUE HAY QUE RECHAZAR");
{
  const roto = Uint8Array.from(docx);
  roto[roto.length - 40] = roto[roto.length - 40] ^ 0xff; // rompe un CRC
  const a1 = auditarDocx(roto);
  c("★ un byte alterado se detecta (no se entrega un Word roto)", !a1.ok, JSON.stringify(a1));
  const a2 = auditarDocx(new Uint8Array([37, 80, 68, 45, 49]));
  c("unas bytes que no son ZIP se rechazan con motivo legible", !a2.ok && /EOCD|truncado/.test(a2.motivo || ""), a2.motivo);
  let e1 = "", e2 = "";
  try { crearDocx({ titulo: "x", secciones: undefined } as any); } catch (err: any) { e1 = String(err?.message || err); }
  try { crearDocx({ titulo: "x", secciones: [] } as any); } catch (err: any) { e2 = String(err?.message || err); }
  c("falta de secciones y Word vacío se niegan antes de escribir", /falta 'secciones'/.test(e1) && /vac\u00edo/.test(e2), e1 + " | " + e2);
  const raro = auditarDocx(crearDocx({ titulo: "Control \u0001\u0000 dentro", secciones: [{ parrafos: ["texto \u0000 con nulos de log"] }] }));
  c("★ los caracteres de control de un log no rompen el XML (se limpian al escribir)", raro.ok, JSON.stringify(raro));
}

seccion("§6 · EL DESTINO: la máquina tiene herramienta que la use");
const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const herr = leer("src/engine/herramientaDocx.ts");
const server = leer("server.ts");
c("existe `herramientaDocx.ts` con la especificación de la herramienta", /SPEC_CRIAR_DOCX/.test(herr));
c("declara `crear_docx` como nombre de herramienta", /name:\s*"crear_docx"/.test(herr));
c("★ la ejecución AUDITA antes de dar ok", /auditarDocx/.test(herr));
c("y avisa que los números son leídos del archivo", /le[íi]dos del archivo|LE[ÍI]DOS/.test(herr));
c("server.ts la monta (especificación + case)", /SPEC_CRIAR_DOCX/.test(server) && /case "crear_docx"/.test(server));
c("el manual de trabajo ya no dice que Word esté pendiente", !/docxMinimo\.ts \(un \.docx es un ZIP/.test(leer("src/engine/trabajoSeguro.ts")));

seccion("§7 · crear_zip: la biblioteca de ZIP tiene mano llamable");
{
  const dir = mkdtempSync(join(tmpdir(), "cnzip-"));
  const ctx = { resolver: (r: string) => join(dir, r) };
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "sub", "a.txt"), "dentro de la carpeta\n", "utf8");
  const llamar = (a: any): any => JSON.parse(ejecutarCrearZip(a, ctx));

  c("la especificación se llama `crear_zip` y pide `path`",
    SPEC_CRIAR_ZIP.function.name === "crear_zip" && SPEC_CRIAR_ZIP.function.parameters.required[0] === "path");

  // El origen pedido aún no está en disco: hay que decirlo ANTES de escribir, no dejar un zip a medias.
  const primera = llamar({ path: "paquete.zip", entradas: [{ nombre: "leeme.md", texto: "# Entrega ñ\n" }, { nombre: "doc/copia.txt", ruta: "origen.txt" }] });
  c("★ una `ruta` inexistente se reporta antes de escribir", primera.ok === false && /no existe/.test(primera.error || ""), primera.error);
  c("y no deja un .zip roto en el proyecto", !existsSync(join(dir, "paquete.zip")));

  writeFileSync(join(dir, "origen.txt"), "contenido original\n", "utf8");
  const r = llamar({ path: "paquete.zip", entradas: [{ nombre: "leeme.md", texto: "# Entrega ñ\n" }, { nombre: "datos/fila.csv", texto: "a,b\n1,2\n" }, { nombre: "doc/copia.txt", ruta: "origen.txt" }] });
  c("con el origen en disco crea el .zip y reporta lo MEDIDO",
    r.ok === true && r.entradas === 3 && r.bytes > 0 && /^[0-9a-f]{64}$/.test(r.sha256 || ""), JSON.stringify(r).slice(0, 180));
  c("★ los nombres que devuelve son los del paquete reabierto, en orden",
    JSON.stringify(r.nombres) === JSON.stringify(["leeme.md", "datos/fila.csv", "doc/copia.txt"]), JSON.stringify(r.nombres));
  const tz = await lectorExterno(join(dir, "paquete.zip"));
  c("★ un lector externo valida el paquete (CRC real)", tz.ok, `${tz.lector} — ${tz.detalle.slice(0, 180)}`);
  c("sin `entradas` ni `desde` se niega: un zip vacío no es una entrega", llamar({ path: "vacio.zip", entradas: [] }).ok === false);
  c("★ mismo contenido, mismo sha256 (nada de reloj dentro del archivo)",
    llamar({ path: "det-a.zip", entradas: [{ nombre: "a.txt", texto: "mismo" }] }).sha256 ===
    llamar({ path: "det-b.zip", entradas: [{ nombre: "a.txt", texto: "mismo" }] }).sha256);
  c("no pisa un .zip existente sin que se lo pidan",
    /sobrescribir/.test(llamar({ path: "paquete.zip", entradas: [{ nombre: "a.txt", texto: "x" }] }).error || ""));
  c("★ una entrada con `..` se rechaza: el paquete no puede escribir fuera de sí mismo",
    llamar({ path: "escape.zip", entradas: [{ nombre: "../../etc/pasada.txt", texto: "x" }] }).ok === false);
  c("`desde` empaqueta una carpeta del workspace", llamar({ path: "carpetas.zip", desde: "sub" }).entradas === 1);
  c("server.ts la monta (especificación + case)", /SPEC_CRIAR_ZIP/.test(server) && /case "crear_zip"/.test(server));
  c("★ el trinquete del monolito sigue intacto tras el montaje",
    server.split("\n").length - 1 <= JSON.parse(leer("contrato-rutas.json")).presupuesto_lineas,
    server.split("\n").length - 1 + " líneas");
}

console.log(`\n═══ zipDocx: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
