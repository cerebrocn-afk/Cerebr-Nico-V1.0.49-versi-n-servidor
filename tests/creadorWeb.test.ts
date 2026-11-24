/**
 * tests/creadorWeb.test.ts — PACK CREADOR DE SITIOS Y APPS WEB (v1.19.0)
 * =======================================================================
 * Se ejecuta con:  npx tsx tests/creadorWeb.test.ts   (o `npm run validar`)
 *
 * Qué custodia y por qué cada línea existe:
 *   1. CONTRATO DE PACK: el manifiesto que come `registerExternalPack`. Un forma
 *      equivocada se carga en silencio y el agente «no tiene creador» sin que
 *      nadie lo sepa.
 *   2. EL GENERADOR NO SE ROMPE A SÍ MISMO: todo sitio creado tiene que pasar su
 *      propia auditoría con 0 errores. Si el generador produce anclas rotas o
 *      archivos que faltan, la deuda se multiplica en cada sitio.
 *   3. HONESTIDAD: donde el usuario no dio datos queda `[Personaliza este texto]`
 *      y eso bloquea el veredicto `publicable`. Un creador que rellena con copy
 *      inventado miente en nombre del usuario.
 *   4. AUDITORÍA QUE DE VERDAS DETECTA: se siembra una página con fallos
 *      conocidos y se exige que aparezcan por su código. Un guardián que solo
 *      pasa cuando todo está bien no guarda nada.
 *   5. NADA DESTRUCTIVO SIN INTENCIÓN: no pisa sitios, no escribe sin `aplicar`,
 *      y deja snapshot cuando escribe.
 *   6. RAÍCES: un nombre con rutas se RECHAZA, no se sanitiza en silencio.
 *   7. CONFIGURACIÓN: puertos sin colisión con el sistema y packs sin duplicar.
 *
 * Todo corre contra demonios reales levantados en puertos efímeros con
 * CN_CREADOR_ROOT en un temporal: `.creador/` del proyecto no se toca.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leRuta = (rel: string) => path.join(RAIZ, rel);
const leer = (rel: string) => readFileSync(leRuta(rel), "utf8");

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
// readdirSync({recursive}) no existe en Node 16 (llega en 18.17): devolvía solo
// el primer nivel y los archivos anidados (css/estilo.css, js/main.js) parecían
// no generarse. Caminamos el árbol a mano para que la prueba diga la verdad en
// cualquier Node soportado.
function listarRecursivo(raizDir: string, base = raizDir): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(raizDir, { withFileTypes: true })) {
    const abs = path.join(raizDir, entrada.name);
    if (entrada.isDirectory()) salida.push(...listarRecursivo(abs, base));
    else salida.push(path.relative(base, abs));
  }
  return salida;
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PYTHON = process.platform === "win32" ? "python" : "python3";
const CREADOR = leRuta("scripts/creador_daemon.py");

function pythonVivo(): boolean {
  const r = spawnSync(PYTHON, ["--version"], { encoding: "utf8", timeout: 8000 });
  return r.status === 0;
}
function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}
async function esperarVivo(base: string, maxIntentos = 40) {
  for (let i = 0; i < maxIntentos; i++) {
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {
      /* aún levantando */
    }
    await esperar(200);
  }
  return false;
}
async function llamar(base: string, nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${base}/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nombre, arguments: args }),
    signal: AbortSignal.timeout(30000),
  });
  return r.json();
}

const DIR = mkdtempSync(path.join(tmpdir(), "cn-creador-"));
const ROOT_CREADOR = path.join(DIR, "creador");
mkdirSync(ROOT_CREADOR, { recursive: true });
let procesor: ChildProcess | null = null;
let BASE = "";

try {
  seccion("0 · Requisitos");
  comprobar("el daemon del creador existe", existsSync(CREADOR));
  comprobar("Python disponible para el pack", pythonVivo(), `${PYTHON} no responde`);

  if (pythonVivo()) {
    const puerto = await puertoLibre();
    BASE = `http://127.0.0.1:${puerto}`;
    procesor = spawn(PYTHON, [CREADOR, "--port", String(puerto)], {
      cwd: RAIZ,
      env: { ...process.env, CN_CREADOR_ROOT: ROOT_CREADOR },
      stdio: ["ignore", "pipe", "pipe"],
    });
    comprobar("el creador levanta y responde /health", await esperarVivo(BASE), BASE);

    seccion("1 · Contrato de pack externo");
    const manifiesto = await (await fetch(`${BASE}/tools`, { signal: AbortSignal.timeout(8000) })).json();
    const lista = manifiesto?.tools || [];
    const nombres = lista.map((t: any) => t.name);
    comprobar("GET /tools devuelve herramientas con forma de ToolSpec",
      lista.length > 0 && lista.every((t: any) => typeof t.name === "string" && typeof t.description === "string" && t.parameters?.type === "object"),
      JSON.stringify(lista[0])?.slice(0, 120));
    comprobar("los nombres son únicos", new Set(nombres).size === nombres.length);
    comprobar("hay Cheap para modelos ligeros y al menos una destructiva",
      lista.some((t: any) => t.cheap === true) && lista.some((t: any) => t.destructive === true));
    for (const obligada of ["crear_sitio", "crear_bloque", "auditar_pagina", "auditar_sitio", "mejorar_pagina", "crear_pwa", "plantillas_disponibles"]) {
      comprobar(`declara ${obligada}`, nombres.includes(obligada));
    }
    comprobar("el manifiesto son 32 herramientas (11 de v1.19 + 11 de v1.20 + 5 de v1.21 ENTREGA + forjar_y_entregar de v1.24 + crear_archivo/planificar_ruta_trabajo/ejecutar_ruta_paralelo RUTA DE TRABAJO + insertar_imagen de v1.51)", nombres.length === 32, `${nombres.length}`);
    // Mismo conjunto servido que registrado (la lección de v1.18.0: capacidad viva,
    // herramienta invisible).
    const fuente = leer("scripts/creador_daemon.py");
    const inicioMapa = fuente.indexOf("EJECUTORES = {");
    const bloqueMapa = fuente.slice(inicioMapa, fuente.indexOf("\n}", inicioMapa) + 2);
    const registradas = [...bloqueMapa.matchAll(/^\s{4}"([a-z_]+)":/gm)].map((m) => m[1]);
    const declaradas = [...fuente.matchAll(/^\s{4}\{"name":\s*"([a-z_]+)"/gm)].map((m) => m[1]);
    comprobar("cada ejecutor registrado está declarado en el manifiesto",
      registradas.length > 0 && registradas.every((n) => declaradas.includes(n)),
      JSON.stringify(registradas.filter((n) => !declaradas.includes(n))));
    comprobar("cada herramienta declarada tiene ejecutor",
      declaradas.length > 0 && declaradas.every((n) => registradas.includes(n)),
      JSON.stringify(declaradas.filter((n) => !registradas.includes(n))));
    comprobar("servidas y declaradas coinciden", JSON.stringify([...nombres].sort()) === JSON.stringify([...declaradas].sort()),
      `${nombres.length} vs ${declaradas.length}`);
    const sinEjecutor = [];
    for (const n of nombres) {
      const r = await llamar(BASE, n, {});
      if (/Herramienta desconocida/.test(String(r?.error || ""))) sinEjecutor.push(n);
    }
    comprobar("ninguna herramienta declarada carece de ejecutor real", sinEjecutor.length === 0, JSON.stringify(sinEjecutor));

    seccion("2 · Generar un sitio: estructura y honestidad");
    const brief = {
      nombre: "Aurora Bici", tipo: "onepage", paleta: "calido", idioma: "es",
      titulo: "Reparación de bicicletas en el barrio",
      subtitulo: "Recogemos, reparamos y devolvemos tu bici en 48 horas laborables",
      cta: "Reservar cita", contacto: "hola@aurora.example",
      descripcion: "Taller de bicicletas de barrio: reparación en 48 horas, recogida a domicilio y presupuesto cerrado por escrito.",
      url_canonica: "https://aurora.example/",
      caracteristicas_texto: "Todo lo que incluye la revisión",
      caracteristicas: [
        { titulo: "Presupuesto cerrado", texto: "Sabes el precio antes de que tocemos nada" },
        { titulo: "Recogida a domicilio", texto: "Vamos a buscarla y te la devolvemos arreglada" },
      ],
      pasos: ["Escríbenos", "Recogemos la bici", "Te damos presupuesto", "La reparamos", "Te la devolvemos"],
      planes: [
        { nombre: "Puesta a punto", precio: "45 €", beneficios: ["Cambio de cables", "Ajuste de frenos", "Centrado de ruedas"] },
        { nombre: "Revisión completa", precio: "80 €", beneficios: ["Todo lo anterior", "Cambio de cadena", "Garantía de 6 meses"] },
      ],
      faq: [{ pregunta: "¿Cuánto tardáis?", respuesta: "48 horas laborables desde que la recogemos" }],
      testimonios: [{ cita: "Rapidísimos y clarísimos con el precio.", autor: "Marta R.", cargo: "Cliente del barrio" }],
    };
    const sitio = await llamar(BASE, "crear_sitio", brief);
    comprobar("crear_sitio responde ok y devuelve la ruta dentro del temporal",
      sitio?.ok === true && String(sitio?.ruta || sitio?.ruta || "").startsWith(ROOT_CREADOR),
      JSON.stringify(sitio)?.slice(0, 160));
    const ruta = (sitio?.ruta as string) || "";
    const carpeta = path.join(ROOT_CREADOR, "aurora-bici");
    const archivos = listarRecursivo(carpeta);
    for (const obligatorio of ["index.html", path.join("css", "estilo.css"), path.join("js", "main.js"), "manifest.webmanifest", "sw.js", "README.md", "robots.txt"]) {
      comprobar(`genera ${obligatorio}`, archivos.some((a) => a.endsWith(obligatorio)), JSON.stringify(archivos.slice(0, 12)));
    }
    const html = readFileSync(path.join(carpeta, "index.html"), "utf8");
    comprobar("el HTML declara el idioma del brief", /<html lang="es"/.test(html));
    comprobar("el contenido del usuario vive DENTRO de <main>",
      html.indexOf("<main id=\"contenido\">") < html.indexOf("<!-- bloque:hero:inicio -->") &&
        html.indexOf("<!-- bloque:pie:inicio -->") < html.indexOf("</main>"),
      `main=${html.indexOf("<main")} hero=${html.indexOf("bloque:hero")}`);
    comprobar("no salen CDN ni frameworks externos (es offline-first)",
      !/cdn\.|unpkg|jsdelivr|react|vue|jquery|bootstrap/i.test(html) && !/cdn\.|unpkg|jsdelivr/i.test(readFileSync(path.join(carpeta, "css", "estilo.css"), "utf8")) && !/cdn\.|unpkg/i.test(readFileSync(path.join(carpeta, "js", "main.js"), "utf8")));
    comprobar("el title y la description salen del brief",
      html.includes("<title>Aurora Bici</title>") && /name="description" content="Taller de bicicletas/.test(html));
    comprobar("la paleta pedida está en el CSS", readFileSync(path.join(carpeta, "css", "estilo.css"), "utf8").includes("#c2410c"));
    comprobar("el menú solo enlaza a secciones que existen",
      [...html.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]).every((destino) => html.includes(`id="${destino}"`)),
      JSON.stringify([...new Set([...html.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]))]));
    comprobar("cada bloque queda entre marcadores reemplazables",
      html.includes("<!-- bloque:hero:inicio -->") && html.includes("<!-- bloque:hero:fin -->"));
    comprobar("el manifest y el service worker se emiten juntos",
      existsSync(path.join(carpeta, "manifest.webmanifest")) && existsSync(path.join(carpeta, "sw.js")));
    let manifestJson: any = null;
    try { manifestJson = JSON.parse(readFileSync(path.join(carpeta, "manifest.webmanifest"), "utf8")); } catch { /* rojo abajo */ }
    comprobar("manifest.webmanifest es JSON válido con theme_color", !!manifestJson?.theme_color);
    comprobar("la imagen social se genera en el tamaño correcto",
      readFileSync(path.join(carpeta, "assets", "og-image.svg"), "utf8").includes('width="1200" height="630"'));

    seccion("3 · El generador no se debe romper a sí mismo");
    const auto = await llamar(BASE, "auditar_pagina", { archivo: path.join(carpeta, "index.html") });
    comprobar("un sitio recién generado tiene 0 errores propios",
      auto?.ok === true && auto?.conteo?.error === 0,
      JSON.stringify(auto?.hallazgos?.map((h: any) => h.codigo))?.slice(0, 200));
    comprobar("con brief completo no quedan marcadores sin rellenar",
      !(auto?.hallazgos || []).some((h: any) => h.codigo === "marcadores"),
      JSON.stringify(auto?.hallazgos?.find((h: any) => h.codigo === "marcadores")));
    comprobar("y por tanto el veredicto es publicable",
      auto?.veredicto === "publicable" && auto?.por_que == null, JSON.stringify(auto?.veredicto));

    seccion("4 · Honestidad cuando faltan datos");
    const pobre = await llamar(BASE, "crear_sitio", { nombre: "Sin Brief", tipo: "sencillo" });
    comprobar("un brief pobre crea igual el sitio (es una base, no un error)", pobre?.ok === true && !!pobre?.aviso);
    comprobar("avisa de los marcadores en vez de inventar copy", /Personaliza este texto/.test(String(pobre?.aviso || "")), String(pobre?.aviso));
    const auditPobre = await llamar(BASE, "auditar_pagina", { archivo: path.join(ROOT_CREADOR, "sin-brief", "index.html") });
    comprobar("un sitio con marcadores NO es publicable",
      auditPobre?.veredicto === "no publicable" && (auditPobre?.hallazgos || []).some((h: any) => h.codigo === "marcadores"),
      JSON.stringify(auditPobre?.hallazgos?.map((h: any) => h.codigo)));
    comprobar("el README generado dice dónde hay que personalizar",
      readFileSync(path.join(ROOT_CREADOR, "sin-brief", "README.md"), "utf8").includes("Personaliza este texto"));

    seccion("5 · Nada destructivo sin bandera explícita");
    const repetido = await llamar(BASE, "crear_sitio", { nombre: "Aurora Bici" });
    comprobar("no pisa un sitio existente sin sobrescribir", repetido?.ok === false && /sobrescribir/.test(String(repetido?.error)), String(repetido?.error)?.slice(0, 90));
    const antesHtml = readFileSync(path.join(carpeta, "index.html"), "utf8");
    const forzado = await llamar(BASE, "crear_sitio", { ...brief, nombre: "Aurora Bici", titulo: "Título regenerado con suficientes caracteres", sobrescribir: true });
    const despuesHtml = readFileSync(path.join(carpeta, "index.html"), "utf8");
    comprobar("sobrescribir:true regenera y deja snapshot del index anterior",
      forzado?.ok === true && despuesHtml !== antesHtml &&
        existsSync(path.join(ROOT_CREADOR, "historial", "aurora-bici")),
      JSON.stringify(readdirSync(path.join(ROOT_CREADOR, "historial")))?.slice(0, 120));

    seccion("6 · crear_bloque: colocación e idempotencia");
    const bloqueNuevo = await llamar(BASE, "crear_bloque", {
      sitio: "aurora-bici", bloque: "equipo",
      equipo: [{ nombre: "Nora", rol: "Mecánica" }, { nombre: "Iván", rol: "Recogidas" }],
    });
    comprobar("crear_bloque inserta y re-audita", bloqueNuevo?.ok === true && bloqueNuevo?.auditoria?.error === 0, JSON.stringify(bloqueNuevo)?.slice(0, 150));
    const htmlConBloque = readFileSync(path.join(carpeta, "index.html"), "utf8");
    comprobar("el bloque entra ANTES del pie, no al principio de la página",
      htmlConBloque.indexOf("bloque:equipo:inicio") > htmlConBloque.indexOf("bloque:hero:inicio") &&
        htmlConBloque.indexOf("bloque:equipo:inicio") < htmlConBloque.indexOf("bloque:pie:inicio"),
      `hero=${htmlConBloque.indexOf("bloque:hero:inicio")} equipo=${htmlConBloque.indexOf("bloque:equipo:inicio")} pie=${htmlConBloque.indexOf("bloque:pie:inicio")}`);
    const duplicado = await llamar(BASE, "crear_bloque", { sitio: "aurora-bici", bloque: "equipo" });
    comprobar("repetir un bloque exige reemplazar:true", duplicado?.ok === false && /reemplazar/.test(String(duplicado?.error)));
    const reemplazo = await llamar(BASE, "crear_bloque", { sitio: "aurora-bici", bloque: "equipo", reemplazar: true, equipo: [{ nombre: "Solo Nora", rol: "Mecánica" }] });
    const htmlReemplazo = readFileSync(path.join(carpeta, "index.html"), "utf8");
    comprobar("reemplazar:true renueva el bloque sin duplicarlo",
      reemplazo?.ok === true && (htmlReemplazo.match(/bloque:equipo:inicio/g) || []).length === 1 && !htmlReemplazo.includes("Iván"),
      JSON.stringify((htmlReemplazo.match(/bloque:equipo:inicio/g) || []).length));
    comprobar("un bloque inexistente se rechaza con la lista real",
      (await llamar(BASE, "crear_bloque", { sitio: "aurora-bici", bloque: "noexiste" }))?.ok === false);

    seccion("7 · El auditor detecta lo que debe detectar");
    const rota = path.join(carpeta, "rota.html");
    writeFileSync(rota, [
      '<html><head><title>Mal</title><script src="js/phantom.js"></script></head>',
      '<body><h3>Aquí empieza mal</h3><h5>Salto de jerarquía</h5>',
      '<img src="assets/placeholder.svg">',
      '<button></button>',
      '<a href="#no-existe-en-el-documento">enlace roto</a>',
      '<form><input name="campo" type="text"></form>',
      '<div><section>sin cerrar',
      '</body></html>',
    ].join("\n"), "utf8");
    const audit = await llamar(BASE, "auditar_pagina", { archivo: rota });
    const codigos = new Set((audit?.hallazgos || []).map((h: any) => h.codigo));
    for (const esperado of ["doctype", "lang", "viewport", "descripcion", "h1", "heading-salto", "img-alt",
      "control-vacio", "ancla-rota", "archivo-faltante", "sin-cerrar", "label-huerfano", "js-bloqueante"]) {
      comprobar(`el auditor ve «${esperado}» en una página sembrada`, codigos.has(esperado),
        JSON.stringify([...codigos]).slice(0, 220));
    }
    comprobar("el veredicto de la página rota es no publicable", audit?.veredicto === "no publicable");
    comprobar("cada hallazgo trae su corrección concreta",
      (audit?.hallazgos || []).every((h: any) => typeof h.correccion === "string" && h.correccion.length > 5));

    seccion("8 · mejorar_pagina: seco primero, snapshot después");
    const seco = await llamar(BASE, "mejorar_pagina", { archivo: rota });
    const textoOriginal = readFileSync(rota, "utf8");
    comprobar("en seco no escribe nada", seco?.ok === true && seco?.aplicado === false && readFileSync(rota, "utf8") === textoOriginal);
    comprobar("en seco ya anticipa cuántos errores quedarían", (seco?.despues?.error ?? 99) < (seco?.antes?.error ?? 0),
      JSON.stringify([seco?.antes, seco?.despues]));
    comprobar("declara qué NO es autocorregible (anclas, archivos que faltan, jerarquía)",
      (seco?.no_autocorregibles || []).length > 0 &&
        ["ancla-rota", "archivo-faltante"].every((c) => seco.no_autocorregibles.some((x: any) => x.codigo === c)),
      JSON.stringify(seco?.no_autocorregibles?.map((x: any) => x.codigo)));
    const aplicado = await llamar(BASE, "mejorar_pagina", { archivo: rota, aplicar: true });
    const rotaAhora = readFileSync(rota, "utf8");
    comprobar("con aplicar:true escribe y deja snapshot", aplicado?.aplicado === true && existsSync(aplicado?.snapshot), String(aplicado?.snapshot));
    comprobar("el archivo cambia de verdad", rotaAhora !== textoOriginal && /<html lang="es"/.test(rotaAhora) && /name="viewport"/.test(rotaAhora));
    comprobar("añade defer a los scripts del head", /<script[^>]+defer[^>]*>/.test(rotaAhora));
    comprobar("las imágenes sin alt quedan con alt=\"\" (no inventa descripciones)", /<img[^>]+alt=""/.test(rotaAhora));
    comprobar("tras aplicar, el recuento de errores baja", aplicado?.despues?.error < aplicado?.antes?.error,
      JSON.stringify([aplicado?.antes?.error, aplicado?.despues?.error]));
    comprobar("avisar de que la description es derivada, no redactada",
      (aplicado?.correcciones || []).some((c: string) => /derivada|revisar/.test(c)), JSON.stringify(aplicado?.correcciones));

    seccion("9 · PWA, OG y límites que hay que decir");
    const pwa = await llamar(BASE, "crear_pwa", { sitio: "aurora-bici", nombre: "Aurora Bici" });
    comprobar("crear_pwa genera manifest y service worker", pwa?.ok === true && existsSync(pwa?.manifest) && existsSync(pwa?.service_worker));
    comprobar("el sw no rompe nada si el registro falla", readFileSync(pwa?.service_worker, "utf8").includes("skipWaiting"));
    comprobar("el creador avisa que el SW exige https o localhost", /https\b.*localhost|localhost.*https/i.test(String(pwa?.aviso || "")), String(pwa?.aviso)?.slice(0, 80));
    const og = await llamar(BASE, "crear_og_image", { sitio: "aurora-bici", titulo: "Aurora Bici", subtitulo: "48 horas" });
    comprobar("crear_og_image avisa de que SVG no lo aceptan todas las redes", /PNG/.test(String(og?.aviso || "")), String(og?.aviso)?.slice(0, 80));
    const pre = await llamar(BASE, "previsualizar_sitio", { sitio: "aurora-bici" });
    comprobar("previsualizar NO levanta un servidor: solo dice cómo", pre?.ok === true && /NO levanta/.test(String(pre?.aviso)) && Array.isArray(pre?.opciones));
    const list = await llamar(BASE, "listar_sitios", {});
    comprobar("listar_sitios ve los dos sitios con sus páginas reales",
      (list?.sitios || []).length >= 2 && (list.sitios.find((x: any) => x.sitio === "aurora-bici")?.paginas || []).includes("rota.html"),
      JSON.stringify(list?.sitios?.map((x: any) => [x.sitio, x.paginas]))?.slice(0, 200));

    seccion("10 · Raíces seguras (esto es lo que hace peligrito el resto)");
    for (const malo of ["../../escape", "a/b", "..%2f..%2fesc"]) {
      const r = await llamar(BASE, "crear_sitio", { nombre: malo });
      comprobar(`rechaza el nombre «${malo}» en vez de sanitizarlo en silencio`,
        r?.ok === false && /rutas/.test(String(r?.error)), JSON.stringify(r)?.slice(0, 120));
    }
    comprobar("nada escapó al temporal padre", !existsSync(path.join(DIR, "..", "escape")) && !existsSync(path.join(ROOT_CREADOR, "..", "escape")));
    comprobar("auditar fuera de las raíces se niega",
      (await llamar(BASE, "auditar_pagina", { archivo: path.join(tmpdir(), "..", "etc", "passwd") }))?.ok === false);
    comprobar("mejorar fuera de las raíces se niega",
      (await llamar(BASE, "mejorar_pagina", { archivo: leRuta("memoria.md") }))?.ok === false);
    comprobar("crear_bloque en un sitio que no existe lo dice",
      (await llamar(BASE, "crear_bloque", { sitio: "no-existe", bloque: "hero" }))?.ok === false);

    seccion("11 · Veredictos coherentes y estado");
    const sitioAudit = await llamar(BASE, "auditar_sitio", { sitio: "aurora-bici" });
    const paginaRota = await llamar(BASE, "auditar_pagina", { archivo: rota });
    comprobar("auditar_sitio y auditar_pagina no se contradicen sobre la misma página",
      (sitioAudit?.paginas || []).some((p: any) => p.pagina === "rota.html") === (paginaRota?.ok === true),
      JSON.stringify(sitioAudit?.paginas?.map((p: any) => p.pagina)));
    comprobar("el veredicto del sitio usa la misma regla (errores Y marcadores)",
      sitioAudit?.veredicto === "no publicable" && typeof sitioAudit?.por_que === "string",
      JSON.stringify([sitioAudit?.veredicto, sitioAudit?.por_que]));
    const estado = await llamar(BASE, "estado_creador", {});
    comprobar("estado_creador reporta la raíz del temporal, no la del proyecto",
      estado?.raiz === ROOT_CREADOR && estado?.sitios >= 2, JSON.stringify([estado?.raiz, estado?.sitios]));
    const plantillas = await llamar(BASE, "plantillas_disponibles", {});
    comprobar("las recetas existen y cada tipo tiene bloques válidos",
      Object.keys(plantillas?.tipos_de_sitio || {}).length >= 4 &&
      Object.values(plantillas?.tipos_de_sitio || {}).every((bs: any) => (bs as string[]).every((b) => plantillas.bloques.includes(b))));
  }

  seccion("13 · v1.20.0 — paletas accesibles, multipágina, schema y BUCLE de mejora");
  if (BASE) {
    // `nombres`/`declaradas`/`registradas` viven dentro del bloque de Python de §1;
    // aquí se vuelven a derivar para no depender de ese alcance.
    const manifiesto20 = await (await fetch(`${BASE}/tools`, { signal: AbortSignal.timeout(8000) })).json();
    const nombres = (manifiesto20?.tools || []).map((t: any) => t.name);
    const fuente20 = leer("scripts/creador_daemon.py");
    const inicio20 = fuente20.indexOf("EJECUTORES = {");
    const bloque20 = fuente20.slice(inicio20, fuente20.indexOf("\n}", inicio20) + 2);
    const registradas = [...bloque20.matchAll(/^\s{4}"([a-z_]+)":/gm)].map((m) => m[1]);
    const declaradas = [...fuente20.matchAll(/^\s{4}\{"name":\s*"([a-z_]+)"/gm)].map((m) => m[1]);
    const contraste = await llamar(BASE, "auditar_contraste", {
      pares: [
        { etiqueta: "gris claro sobre blanco", fondo: "#ffffff", frente: "#9aa3ad" },
        { etiqueta: "negro sobre blanco", fondo: "#ffffff", frente: "#111111" },
      ],
    });
    comprobar("contraste real: suspende el par malo y aprueba el bueno",
      contraste?.ok === true && contraste?.veredicto === "rechaza AA" &&
        contraste.mediciones[0].aprueba === false && contraste.mediciones[1].aprueba === true,
      JSON.stringify(contraste?.mediciones)?.slice(0, 180));
    comprobar("propone un color que SÍ aprueba (no se queda en None cuando se puede oscurecer)",
      /^#[0-9a-f]{6}$/i.test(String(contraste?.mediciones?.[0]?.propuesta)),
      JSON.stringify(contraste?.mediciones?.[0]));
    comprobar("rechaza medir un sitio sin tokens de color",
      (await llamar(BASE, "auditar_contraste", { sitio: "no-existe-sitio" }))?.ok === false);
    // Las paletas del propio generador tienen que aprobar AA: si una falla, el
    // producto nace con un error de accesibilidad.
    const paletas = await llamar(BASE, "auditar_contraste", { sitio: "aurora-bici" });
    comprobar("la paleta del sitio generado aprueba AA en todos los pares medidos",
      paletas?.ok === true && paletas?.fallan === 0 && (paletas?.mediciones || []).length >= 5,
      JSON.stringify(paletas?.mediciones?.filter((m: any) => !m.aprueba))?.slice(0, 180));

    const multi = await llamar(BASE, "crear_sitio_multipagina", {
      nombre: "Clínica Multi", base_url: "https://multi.example", paleta: "noche",
      nombre_sitio: "Clínica Multi", contacto: "hola@multi.example",
      paginas: [
        { ruta: "index", nombre: "Inicio", titulo: "Clínica dental de barrio", subtitulo: "Primera visita sin coste", bloques: ["barra", "hero", "caracteristicas", "contacto", "pie"], caracteristicas_texto: "Tratamientos", caracteristicas: [{ titulo: "Ortodoncia invisible", texto: "Alineadores medidos por escáner" }] },
        { ruta: "equipo", nombre: "Equipo", titulo: "Nuestro equipo", subtitulo: "Cuatro dentistas colegiados", bloques: ["barra", "hero", "equipo", "pie"], equipo: [{ nombre: "Dra. Ruiz", rol: "Ortodoncia" }] },
      ],
    });
    comprobar("crear_sitio_multipagina genera las páginas y su total",
      multi?.ok === true && (multi?.paginas || []).length === 2, JSON.stringify(multi)?.slice(0, 160));
    const carpetaMulti = path.join(ROOT_CREADOR, "clinica-multi");
    comprobar("las páginas comparten un solo CSS/JS (no se duplican por página)",
      existsSync(path.join(carpetaMulti, "css", "estilo.css")) &&
        readFileSync(path.join(carpetaMulti, "css", "estilo.css"), "utf8").includes("#4f8cff"));
    comprobar("la navegación cruzada aparece en TODAS las páginas",
      ["index.html", "equipo.html"].every((f) => readFileSync(path.join(carpetaMulti, f), "utf8").includes('href="equipo.html"')),
      JSON.stringify(["index.html", "equipo.html"]));
    comprobar("el enlace de la página actual se marca con aria-current",
      readFileSync(path.join(carpetaMulti, "equipo.html"), "utf8").includes('href="equipo.html" aria-current="page"') ||
        readFileSync(path.join(carpetaMulti, "equipo.html"), "utf8").includes('aria-current="page"'));
    comprobar("sitemap.xml lista las páginas y robots.txt apunta al sitemap",
      (readFileSync(path.join(carpetaMulti, "sitemap.xml"), "utf8").match(/<loc>/g) || []).length === 2 &&
        readFileSync(path.join(carpetaMulti, "robots.txt"), "utf8").includes("Sitemap: https://multi.example/sitemap.xml"));
    const paginaNueva = await llamar(BASE, "crear_pagina", {
      sitio: "clinica-multi", ruta: "precios", nombre: "Precios", titulo: "Tarifas claras y cerradas",
      subtitulo: "Presupuesto por escrito antes de empezar", bloques: ["barra", "hero", "precios", "pie"],
      planes: [{ nombre: "Limpieza", precio: "40 €", beneficios: ["Incluye pulido y revisión"] }],
    });
    comprobar("crear_pagina añade la página y reaudita", paginaNueva?.ok === true && typeof paginaNueva?.auditoria === "object");
    await llamar(BASE, "crear_pagina", { sitio: "clinica-multi", ruta: "precios", nombre: "Precios", titulo: "Tarifas claras y cerradas", bloques: ["hero"] });
    comprobar("repetir crear_pagina NO duplica el enlace en el menú",
      (readFileSync(path.join(carpetaMulti, "index.html"), "utf8").match(/href="precios.html"/g) || []).length === 1,
      String((readFileSync(path.join(carpetaMulti, "index.html"), "utf8").match(/href="precios.html"/g) || []).length));

    comprobar("schema LocalBusiness SIN dirección se niega (no inventa datos del negocio)",
      (await llamar(BASE, "generar_schema_jsonld", { sitio: "clinica-multi", tipo: "LocalBusiness", nombre: "Clínica Multi" }))?.ok === false);
    const schema = await llamar(BASE, "generar_schema_jsonld", {
      sitio: "clinica-multi", tipo: "LocalBusiness", nombre: "Clínica Multi",
      direccion: "Calle Mayor 3, València", telefono: "+34 960 00 00 00", email: "hola@multi.example",
      horario: "L-V 09:00-18:00", url: "https://multi.example",
    });
    comprobar("schema LocalBusiness con datos reales se inyecta en el <head>",
      schema?.ok === true && schema?.schema === "LocalBusiness" &&
        readFileSync(path.join(carpetaMulti, "index.html"), "utf8").includes("application/ld+json"));
    comprobar("re-ejecutar schema reemplaza, no acumula bloques",
      (await llamar(BASE, "generar_schema_jsonld", { sitio: "clinica-multi", tipo: "Organization", nombre: "Clínica Multi" }))?.ok === true &&
        (readFileSync(path.join(carpetaMulti, "index.html"), "utf8").match(/<!-- schema:inicio -->/g) || []).length === 1);
    comprobar("FAQPage sin un FAQ real en la página se niega",
      (await llamar(BASE, "generar_schema_jsonld", { sitio: "clinica-multi", tipo: "FAQPage", nombre: "Clínica Multi" }))?.ok === false);

    const tema = await llamar(BASE, "componente_modo_oscuro", { sitio: "clinica-multi" });
    comprobar("modo oscuro toca todas las páginas y usa aria-pressed",
      tema?.ok === true && tema?.paginas_actualizadas >= 2 &&
        readFileSync(path.join(carpetaMulti, "index.html"), "utf8").includes('aria-pressed'));
    comprobar("consentimiento SIN política de cookies se niega (no enlaza una página que no existe)",
      (await llamar(BASE, "componente_consentimiento", { sitio: "clinica-multi" }))?.ok === false);
    const consent = await llamar(BASE, "componente_consentimiento", { sitio: "clinica-multi", politica_url: "https://multi.example/cookies" });
    const htmlConsent = readFileSync(path.join(carpetaMulti, "index.html"), "utf8");
    comprobar("banner de consentimiento con las tres salidas y su evento",
      consent?.ok === true && htmlConsent.includes('data-consentir="necesario"') &&
        htmlConsent.includes('data-consentir="rechazar"') && htmlConsent.includes('data-consentir="todo"') &&
        htmlConsent.includes('aria-label="Preferencias de cookies"'));
    comprobar("formulario SIN destino se niega a quedarse decorativo",
      (await llamar(BASE, "formulario_destino", { sitio: "clinica-multi" }))?.ok === false);
    const form = await llamar(BASE, "formulario_destino", { sitio: "clinica-multi", accion: "https://formspree.io/f/multi" });
    const htmlForm = readFileSync(path.join(carpetaMulti, "index.html"), "utf8");
    comprobar("el destino del formulario queda puesto con POST",
      form?.ok === true && /<form[^>]*action="https:\/\/formspree\.io\/f\/multi"[^>]*method="post"/.test(htmlForm.replace(/\s+/g, " ")) ||
        (htmlForm.includes('action="https://formspree.io/f/multi"') && htmlForm.includes('method="post"')),
      htmlForm.slice(htmlForm.indexOf("<form"), htmlForm.indexOf("<form") + 220));
    comprobar("el campo miel vive DENTRO del <form> (fuera no filtra a nadie)",
      htmlForm.indexOf('name="_hp"') > htmlForm.indexOf("<form") && htmlForm.indexOf('name="_hp"') < htmlForm.indexOf("</form>"));
    comprobar("el banner de cookies NO da error de etiqueta (el auditor acepta <label> envolvente)",
      !(await llamar(BASE, "auditar_pagina", { archivo: path.join(carpetaMulti, "index.html") }))
        ?.hallazgos?.some((h: any) => h.codigo === "label-huerfano"),
      JSON.stringify((await llamar(BASE, "auditar_pagina", { archivo: path.join(carpetaMulti, "index.html") }))?.hallazgos?.map((h: any) => h.codigo)));

    const pre = await llamar(BASE, "preflight_rendimiento", { sitio: "clinica-multi" });
    comprobar("preflight mide peso, peticiones y nodos por página",
      pre?.ok === true && (pre?.paginas || []).every((p: any) => p.total_bytes > 0 && p.nodos > 10 && p.peticiones >= 1),
      JSON.stringify(pre?.paginas?.[0])?.slice(0, 180));
    comprobar("preflight declara lo que NO puede medir (red y render)", /NO mide/.test(String(pre?.aviso)));

    seccion("14 · BUCLE AUTÓNOMO: iterar hasta agotar lo seguro");
    const buclePagina = path.join(ROOT_CREADOR, "clinica-multi", "equipo.html");
    const sucia = readFileSync(buclePagina, "utf8")
      .replace('<html lang="es">', "<html>")
      .replace(/<meta name="viewport"[^>]*>\s*/, "")
      .replace(/<meta name="description"[^>]*>\s*/, "");
    writeFileSync(buclePagina, sucia, "utf8");
    const antesBucle = await llamar(BASE, "auditar_pagina", { archivo: buclePagina });
    const bucle = await llamar(BASE, "mejorar_hasta_estable", { sitio: "clinica-multi", max_iteraciones: 5 });
    comprobar("el bucle detecta el objetivo y para con motivo",
      bucle?.ok === true && ["objetivo_alcanzado", "sin_progreso", "max_iteraciones"].includes(bucle?.parada),
      JSON.stringify([bucle?.parada, bucle?.iteraciones]));
    comprobar("el bucle mejora de verdad la página sembrada (menos errores que al empezar)",
      (bucle?.estado_final || []).find((e: any) => e.pagina === "equipo.html")?.errores < (antesBucle?.conteo?.error || 0),
      JSON.stringify([antesBucle?.conteo?.error, (bucle?.estado_final || []).find((e: any) => e.pagina === "equipo.html")?.errores]));
    comprobar("deja traza con el hash de cada pasada (se ve si avanzó o repitió)",
      (bucle?.traza || []).length >= 1 && (bucle?.traza || []).every((t: any) => typeof t.hash === "string" && t.hash.length === 16));
    comprobar("lista lo que exige decisión humana en vez de fingir que lo arregla",
      Array.isArray(bucle?.requiere_decision_humana) && bucle.requiere_decision_humana.length >= 2);
    comprobar("no itera para siempre: respeta el techo pedido", (bucle?.iteraciones ?? 99) <= 5);
    comprobar("con un techo absurdo sigue sin pasarse del máximo global",
      (await llamar(BASE, "mejorar_hasta_estable", { sitio: "clinica-multi", max_iteraciones: 999 }))?.max_iteraciones === 8);

    const forjado = await llamar(BASE, "forjar_desde_brief", {
      brief: {
        nombre: "Panadería Forjada", tipo: "onepage", paleta: "calido",
        titulo: "Horno de leña y masa madre propia", subtitulo: "Dos hornadas al día, pedidos hasta las 10:00",
        cta: "Reservar tu pan", contacto: "hola@forjada.example",
        descripcion: "Panadería de barrio con horno de leña, masa madre de seis años y recogida por la tarde.",
        caracteristicas_texto: "Lo que hacemos cada mañana",
        caracteristicas: [{ titulo: "Masa madre propia", texto: "Seis años alimentando el mismo fermento" }, { titulo: "Horno de leña", texto: "Horneamos dos veces al día" }],
        pasos: ["Escríbenos", "Horneamos", "Recoges en el taller"],
        planes: [{ nombre: "Hogaza", precio: "4 €", beneficios: ["1 kg", "Recién horneada"] }],
        faq: [{ pregunta: "¿Aceptáis encargos?", respuesta: "Hasta las 10:00 del mismo día" }],
        testimonios: [{ cita: "Sabe a pueblo", autor: "Una vecina", cargo: "Clienta desde 2019" }],
        schema: "LocalBusiness", direccion: "Plaza del Olmo 2, Ruzafa", telefono: "+34 961 00 00 00",
        url_canonica: "https://forjada.example", politica_url: "https://forjada.example/cookies",
        accion_formulario: "https://formspree.io/f/forjada", exigir_sin_marcadores: true,
      },
    });
    comprobar("forjar_desde_brief ejecuta la cadena completa",
      forjado?.ok === true && (forjado?.pasos || []).length >= 9 && (forjado?.pasos || []).every((p: any) => p.ok !== false),
      JSON.stringify(forjado?.pasos?.map((p: any) => [p.paso, p.ok]))?.slice(0, 220));
    comprobar("el sitio forjado sale PUBLICABLE (0 errores y sin marcadores)",
      forjado?.veredicto === "publicable", JSON.stringify([forjado?.veredicto, forjado?.total]));
    comprobar("informe del bucle dentro del forjado: dice CÓMO paró",
      ["objetivo_alcanzado", "sin_progreso", "max_iteraciones", "nada_que_corregir"].includes(forjado?.parada_del_bucle),
      String(forjado?.parada_del_bucle));
    comprobar("el forjado deja siguiente paso honesto cuando toca", typeof forjado?.siguiente_paso === "string" && forjado.siguiente_paso.length > 10);

    const plan = await llamar(BASE, "plan_de_construccion", {
      nombre: "Panadería Forjada", titulo: "Panadería", schema: "LocalBusiness",
      politica_url: "https://forjada.example/cookies", accion_formulario: "https://formspree.io/f/forjada",
      secciones: [{ bloque: "faq" }],
    });
    comprobar("el plan habla el CONTRATO real del motor: set_plan({tasks:[{id,description}]})",
      plan?.ok === true && Array.isArray(plan?.set_plan?.tasks) &&
        plan.set_plan.tasks.length >= 6 && plan.set_plan.tasks.every((t: any) => typeof t.id === "string" && typeof t.description === "string"),
      JSON.stringify(plan?.set_plan)?.slice(0, 160));
    comprobar("cada tarea del guion apunta a una herramienta que EXISTE en el pack",
      (plan?.guion || []).every((g: any) => nombres.includes(g.tool)),
      JSON.stringify([...new Set((plan?.guion || []).map((g: any) => g.tool).filter((t: string) => !nombres.includes(t)))]));
    comprobar("el guion referencia tareas definidas (sin tareas huérfanas)",
      (plan?.guion || []).every((g: any) => plan.set_plan.tasks.some((t: any) => t.id === g.task_id)));
    comprobar("el plan avisa de que no garantiza un sitio publicable", /no garantiza/.test(String(plan?.aviso)));
    comprobar("32 herramientas en el pack (11 de v1.19 + 11 de v1.20 + 5 de v1.21 ENTREGA + forjar_y_entregar de v1.24 + 3 de RUTA DE TRABAJO + insertar_imagen de v1.51)", nombres.length === 32, `${nombres.length}`);
    comprobar("el manifiesto son 32 y el código también",
      declaradas.length === 32 && registradas.length === 32, JSON.stringify([declaradas.length, registradas.length]));

    seccion("15 · v1.21.0 ENTREGA: exportar, desplegar, verificar y declarar idiomas");
    // La entrega se mide con sha256, no se opina. Y el hreflang NO traduce:
    // declara lo que hay y lista lo que falta.
    const sit = await llamar(BASE, "crear_sitio", { nombre: "Taller Bicis", tipo: "negocio", titulo: "Taller Bicis" });
    comprobar("sitio de entrega creado", sit?.ok === true, JSON.stringify(sit)?.slice(0, 120));
    const exp1 = await llamar(BASE, "exportar_sitio_zip", { sitio: "taller-bicis" });
    comprobar("exportar_sitio_zip devuelve zip con sha256 y archivos",
      exp1?.ok === true && /^[0-9a-f]{64}$/.test(String(exp1.sha256)) && exp1.archivos > 3 && existsSync(exp1.zip),
      JSON.stringify(exp1)?.slice(0, 160));
    const exp2 = await llamar(BASE, "exportar_sitio_zip", { sitio: "taller-bicis" });
    comprobar("ZIP determinista: mismo contenido, mismo hash (se puede confiar el diff)",
      exp2?.sha256 === exp1?.sha256);
    const listado = await llamar(BASE, "listar_exportaciones", {});
    comprobar("listar_exportaciones ve el zip con su firma",
      listado?.ok === true && (listado.exportaciones || []).some((e: any) => e.sha256 === exp1?.sha256));
    const DESTINO_ENTREGA = path.join(ROOT_CREADOR, "entrega-www");
    const seco = await llamar(BASE, "desplegar_carpeta", { sitio: "taller-bicis", destino: DESTINO_ENTREGA });
    comprobar("desplegar EN SECO no toca el disco",
      seco?.ok === true && seco?.seco === true && !existsSync(DESTINO_ENTREGA), JSON.stringify(seco)?.slice(0, 140));
    const aplicado = await llamar(BASE, "desplegar_carpeta", { sitio: "taller-bicis", destino: DESTINO_ENTREGA, aplicar: true });
    comprobar("desplegar con aplicar copia y deja manifiesto",
      aplicado?.ok === true && aplicado.copiados > 3 && existsSync(path.join(DESTINO_ENTREGA, ".cerebronico-despliegue.json")));
    const ver1 = await llamar(BASE, "verificar_despliegue", { sitio: "taller-bicis", destino: DESTINO_ENTREGA });
    comprobar("verificar: recién desplegado es idéntico", ver1?.veredicto === "identico", JSON.stringify(ver1)?.slice(0, 160));
    appendFileSync(path.join(DESTINO_ENTREGA, "index.html"), "\n<!-- mano ajena -->\n");
    const ver2 = await llamar(BASE, "verificar_despliegue", { sitio: "taller-bicis", destino: DESTINO_ENTREGA });
    comprobar("verificar detecta la deriva con nombre y archivo",
      ver2?.veredicto === "divergente" && (ver2.difieren || []).includes("index.html"), JSON.stringify(ver2)?.slice(0, 160));
    const fuera = await llamar(BASE, "desplegar_carpeta", { sitio: "taller-bicis", destino: path.join(DIR, "fuera-de-raiz"), aplicar: true });
    comprobar("desplegar FUERA de las raíces autorizadas se rechaza",
      fuera?.ok !== true && /autorizadas/i.test(String(fuera?.error)), JSON.stringify(fuera)?.slice(0, 140));
    const hrefSin = await llamar(BASE, "generar_hreflang", { sitio: "taller-bicis", idiomas: ["es", "en"] });
    comprobar("hreflang sin base_url se niega (no hay dominio que declarar)", hrefSin?.ok !== true && /base_url/.test(String(hrefSin?.error)));
    const href = await llamar(BASE, "generar_hreflang", { sitio: "taller-bicis", idiomas: ["es", "en"], base_url: "https://taller.example" });
    const htmlEntrega = readFileSync(path.join(ROOT_CREADOR, "taller-bicis", "index.html"), "utf-8");
    comprobar("hreflang escribe alternates + x-default + selector",
      href?.ok === true && htmlEntrega.includes('hreflang="en"') && htmlEntrega.includes('hreflang="x-default"') && htmlEntrega.includes("selector-idioma"));
    comprobar("hreflang es HONESTO: lista las traducciones que faltan y avisa que no tradujo",
      (href?.paginas_que_faltan || []).length > 0 && /No he traducido/.test(String(href?.nota)));
    await llamar(BASE, "generar_hreflang", { sitio: "taller-bicis", idiomas: ["es", "en"], base_url: "https://taller.example" });
    comprobar("hreflang idempotente por marcadores (no duplica bloques)",
      (readFileSync(path.join(ROOT_CREADOR, "taller-bicis", "index.html"), "utf-8").match(/hreflang:inicio/g) || []).length === 1);
  }

  seccion("12 · Coherencia con el resto del híbrido");
  const cfg = JSON.parse(leer("tools.config.json"));
  const packs = cfg.packs || [];
  comprobar("el pack creador-web existe y está habilitado",
    packs.some((x: any) => x.id === "creador-web" && x.enabled === true));
  comprobar("no hay dos packs en la misma URL",
    new Set(packs.map((x: any) => x.url)).size === packs.length,
    JSON.stringify(packs.map((x: any) => x.url)));
  const ocupados = [":3000", ":3500", ":5000", ":11434", ":5100", ":5101"];
  comprobar(":5102 no pisa ningún puerto del sistema ni de la casa",
    !puertoPisado(packs.find((x: any) => x.id === "creador-web").url, ocupados),
    packs.find((x: any) => x.id === "creador-web")?.url);
  comprobar("la memoria habilitada sigue siendo UNA sola",
    packs.filter((x: any) => String(x.id).startsWith("memoria-") && x.enabled === true).length === 1);
  const pkg = JSON.parse(leer("package.json"));
  comprobar("package.json declara las órdenes del creador",
    ["creador", "creador:linux", "creador:estado", "test:creador"].every((k) => typeof pkg.scripts?.[k] === "string"));
  // v1.46.0 — sin número congelado: se exige que la versión sea una semver y
  // que coincida con la semilla ÚNICA de constants.ts. Un literal «1.43.0» aquí
  // solo servía para que esta línea viajara roja tras cada subida.
  const semillaCreador = (leer("src/constants.ts").match(/const VERSION_SEMVER = "([^"]+)"/) || [])[1];
  comprobar("la versión es semver y coincide con la semilla única",
    /^\d+\.\d+\.\d+$/.test(String(pkg.version)) && pkg.version === semillaCreador,
    `${pkg.version} vs ${semillaCreador}`);
  comprobar("las dos skills del creador están instaladas con su SKILL.md",
    existsSync(leRuta("skills/cerebronico-creador/SKILL.md")) && existsSync(leRuta("skills/cerebronico-web-qa/SKILL.md")));
  comprobar("SKILLS.md las indexa", /cerebronico-creador/.test(leer("SKILLS.md")) && /cerebronico-web-qa/.test(leer("SKILLS.md")));
  comprobar("cerebro.md cubre el creador como capa opcional",
    /creador/.test(leer("cerebro.md")) && /Personaliza este texto/.test(leer("cerebro.md")));
  comprobar("el README documenta :5102 y sus límites", /5102/.test(leer("README.md")) && /no inventa/i.test(leer("README.md")));
  comprobar(".env.example documenta las variables del creador",
    ["CN_CREADOR_PORT", "CN_CREADOR_ROOT", "CN_CREADOR_TOKEN"].every((v) => leer(".env.example").includes(v)));
  const bat = readFileSync(leRuta("iniciar_todo_windows.bat"));
  comprobar("el BAT levanta el creador de forma opcional", /creador_daemon\.py/.test(bat));
  comprobar("el BAT sigue con CRLF uniforme (sin esto, se cierra en Windows)",
    (bat.toString("utf8").match(/\r\n/g) || []).length === (bat.toString("utf8").match(/\n/g) || []).length);
  comprobar("el daemon del creador promete Python 3.8 (sin f-strings de 3.12)",
    !/f"[^"\n]*\{\{0,20\}\\"/.test(leer("scripts/creador_daemon.py")));
} finally {
  procesor?.kill("SIGTERM");
  await esperar(200);
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temporal */ }
}

function puertoPisado(url: string, puertos: string[]): boolean {
  return puertos.some((q) => String(url).includes(q));
}

console.log(`\n${fallos.length === 0 ? "✓ TODO EN VERDE" : "✗ HAY ROJOS"}`);
console.log(`${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) {
  for (const f of fallos) console.log(`  · ${f}`);
  process.exitCode = 1;
}
