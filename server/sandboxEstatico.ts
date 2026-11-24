// server/sandboxEstatico.ts — plantilla del servidor estático del sandbox (:3500).
//
// v1.72.0 · FASE 2. Nace dentro de server.ts como STATIC_SERVER_SOURCE y sale aquí
// por dos motivos que son el mismo: el trinquete de superficie.mjs no permite que
// server.ts crezca, y una plantilla de 300 líneas que se escribe a disco como .cjs
// no tiene nada que hacer embebida en el monolito. Aquí vive como texto plano y
// server.ts solo la importa.
//
// QUE NO SE PIERDA AL MOVERLA: este texto se escribe a PROJECT_ROOT/.cn-static-server.cjs
// y se ejecuta con:  node <archivo> <raiz> <puerto> <raiz-del-proyecto>. No corre
// dentro del proceso del IDE, así que sigue usando require() aunque el resto del
// proyecto sea ESM. Si alguien lo convierte a import, el sandbox deja de encender
// y el previsualizador se queda en blanco sin decir por qué.
//
// Las contrabarras de abajo están DOBLES a propósito: es el contenido de una
// plantilla literal. Quien la regenere debe escapar contrabarras, backticks y
// secuencias de interpolacion de una sola vez, no a mano: así fue como el regex
// de sinPrefijo se quedó sin barra y tumbó el sandbox entero.
export const STATIC_SERVER_SOURCE = `
const http = require("http");
const fs = require("fs");
const p = require("path");
const root = p.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 3500);
// v1.52.6 — BUGFIX: «no se puede insertar imagen en la página web del proyecto».
// Las imágenes subidas por el chat se guardan en PROJECT_ROOT/assets/subidas/,
// pero si el sandbox sirve desde .creador/<sitio>/, esa ruta NO existe ahí.
// projectRoot es la raíz del PROYECTO (donde están las subidas), distinta de
// root (la carpeta que sirve el sandbox, que puede ser .creador/<sitio>/).
const projectRoot = p.resolve(process.argv[4] || root);
// ================================================================
// v1.0.10 · F3+F4 — TRANSFORM ON SERVE: EL PREVIEW NO TOCA AL FUTURO
// ----------------------------------------------------------------
// Quinto argumento: nombre del bundle de la via rapida (cn-preview.js) o "".
// Con el nombre, el HTML que sale por esta puerta se reescribe EN MEMORIA
// (el script de entrada pasa a apuntar al bundle) y NUNCA en disco: el
// index.html del usuario conserva su md5 para siempre, y el bucle
// «arreglo el HTML y vuelve cn-preview.js» (8 ciclos medidos en la sesion
// 1794120824912) muere aqui, en el unico lugar donde el bundle era sagrado.
// F4: cada pagina servida lleva un balise de estado (raiz efectiva, hash
// del index, edad del bundle) y la deteccion de DOBLE COPIA: si hay un
// index.html en la raiz y otro en una subcarpeta, el cartel lo dice —
// fue el juego-autos vs raiz que costo veinte turnos de "no se ve".
// ================================================================
var cnBundle = String(process.argv[5] || "");
var cnCrypto = require("crypto");
function cnSha8(buf) {
  try { return cnCrypto.createHash("sha256").update(buf).digest("hex").slice(0, 8); } catch (e) { return "?"; }
}
function cnIndicesHermanos() {
  var out = [];
  var es = entradasDe(root);
  for (var i = 0; i < es.length; i++) {
    var e = es[i];
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git" || e.name === ".cn-preview") continue;
    if (esIndex(p.join(root, e.name))) out.push(e.name);
  }
  return out;
}
function cnRutaBundle(rel) {
  var candidatos = [p.join(rel.dir, cnBundle), p.join(root, cnBundle)];
  for (var i = 0; i < candidatos.length; i++) {
    try { if (fs.statSync(candidatos[i]).isFile()) return { abs: candidatos[i], src: "./" + p.relative(rel.dir, candidatos[i]).split(p.sep).join("/") }; } catch (e) {}
  }
  return null;
}
function cnApuntarAlBundle(texto, rel) {
  if (!cnBundle) return texto;
  if (texto.indexOf(cnBundle) >= 0) return texto; // ya apunta al bundle (residuo viejo): no duplicar
  var tag = '<' + 'script type="module" src="' + rel.src + '"><' + '/script>';
  var reMod = /<script[^>]*type=["']module["'][^>]*src=["'][^"']+["'][^>]*>[^<]*<[/]script>/i;
  var reSrc = /<script[^>]*src=["'][^"']+[.](?:tsx|ts|jsx|mjs|js)["'][^>]*>[^<]*<[/]script>/i;
  if (reMod.test(texto)) return texto.replace(reMod, tag);
  if (reSrc.test(texto)) return texto.replace(reSrc, tag);
  if (/<[/]body>/i.test(texto)) return texto.replace(/<[/]body>/i, tag + "<" + "/body>");
  return texto + tag;
}
function cnEstado(raiz, tieneIndex) {
  var st = { raiz: raiz.dir, motivo: raiz.motivo, bundle: null, duplicados: cnIndicesHermanos(), indexSha: null };
  if (cnBundle) {
    var rb = cnRutaBundle(raiz);
    if (rb) {
      try {
        var s = fs.statSync(rb.abs);
        var min = Math.max(0, Math.round((Date.now() - s.mtimeMs) / 60000));
        st.bundle = { archivo: rb.src, bytes: s.size, hace: min < 1 ? "ahora" : (min < 60 ? min + " min" : Math.round(min / 60) + " h") };
      } catch (e) {}
    }
  }
  if (tieneIndex) { try { st.indexSha = cnSha8(fs.readFileSync(p.join(raiz.dir, "index.html"))); } catch (e) {} }
  return st;
}
function cnBadgeHtml(raiz) {
  var est = cnEstado(raiz, true);
  var b = est.bundle;
  var partes = ["sirve: " + est.raiz, "index: " + (est.indexSha || "?"), "sw: neutralizado"];
  if (cnBundle) partes.push(b ? "bundle: " + b.archivo + " (" + b.bytes + " B, " + b.hace + ")" : "bundle: NO ENCONTRADO");
  var dup = est.duplicados.length ? " · ⚠ DOS COPIAS: hay index.html en " + est.duplicados.map(function (n) { return n + "/"; }).join(", ") + " — editas una, se sirve la raiz" : "";
  var css = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;background:" + (est.duplicados.length ? "rgba(120,72,10,.95)" : "rgba(14,18,24,.92)") + ";color:#dbe3ec;padding:4px 10px;display:flex;gap:14px;align-items:center;border-top:1px solid #2a3440";
  return '<div id="__cn_estado" style="' + css + '"><span style="color:#7dd3fc">CerebroNico sandbox :3500</span><span>' + partes.join('</span><span>') + '</span>' + (dup ? '<span style="color:#ffd166">' + dup + '</span>' : '') + '</div>';
}
function cnSirveHtml(res, buf, raiz) {
  var texto = buf.toString("utf8");
  var rb = cnBundle ? cnRutaBundle(raiz) : null;
  if (rb) texto = cnApuntarAlBundle(texto, rb);
  if (/<[/]body>/i.test(texto)) texto = texto.replace(/<[/]body>/i, cnBadgeHtml(raiz) + "<" + "/body>");
  else texto += cnBadgeHtml(raiz);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-CN-Preview": rb ? "bundle-inyectado-al-servir" : "estatico" });
  res.end(texto);
}
// v1.95.1 · EL MATACHICOS DE SERVICE WORKER (Mario, 30/10: «el previsualizador
// muestra una cosa y «Abrir» en el navegador abre otro proyecto viejo, de otra
// versión»). Este archivo es una PLANTILLA: se escribe a .cn-static-server.cjs y se
// levanta con node, así que lo de abajo es texto que se emite, no código que corre acá.
//
// El origen del sandbox es FIJO (src/constants.ts -> http://127.0.0.1:3500) y lo
// comparten TODOS los proyectos. Un service worker registrado ahí sigue controlando el
// origen despues de cambiar de proyecto, de cambiar de versión de la IDE e incluso de
// reiniciarla: y no existe un solo «unregister» en todo el repositorio, o sea que nadie
// los daba de baja jamas. Con la reserva de navegación del sw.js generado
// (caches.match(req) || caches.match("./index.html")), cualquier fallo de red devolvía
// el index precacheado del sitio VIEJO mientras en disco estaba el nuevo.
//
// El preview no necesita offline: sirve archivos que están en este mismo disco. Entonces
// el servidor responde sw.js con esta acta de defunción. El navegador la compara byte a
// byte con el worker instalado, la instala, vacía las cachés del origen, se desregistra
// y recarga. El sw.js que el usuario exporta con su proyecto NO se toca en disco: solo
// se neutraliza mientras se previsualiza.
var CN_SW_KILL = [
  "/* CerebroNico: el preview del sandbox no usa service workers. */",
  "self.addEventListener('install', function () { self.skipWaiting(); });",
  "self.addEventListener('activate', function (evento) {",
  "  evento.waitUntil(",
  "    caches.keys()",
  "      .then(function (claves) {",
  "        return Promise.all((claves || []).map(function (k) { return caches.delete(k); }));",
  "      })",
  "      .then(function () { return self.registration.unregister(); })",
  "      .then(function () { return self.clients.matchAll({ includeUncontrolled: true }); })",
  "      .then(function (lista) {",
  "        (lista || []).forEach(function (c) {",
  "          try { if (c.navigate) c.navigate(String(self.location.href).split('?')[0] + '?cn_fin_sw=1'); } catch (e) {}",
  "        });",
  "      })",
  "  );",
  "});",
  "self.addEventListener('fetch', function (evento) {",
  "  evento.respondWith(fetch(evento.request, { cache: 'no-store' }));",
  "});"
].join("\\n");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8"
};
// ================================================================
// v8.0.4 — POR QUÉ ESTO YA NO PUEDE QUEDARSE EN BLANCO
// ----------------------------------------------------------------
// Antes: si no había index.html en la raíz servida, TODA petición caía en un
// 404 de texto plano. En pantalla eso se ve como una página en blanco sin una
// sola pista, que es literalmente lo reportado: «el chat contestó la petición
// del chat web pero el previsualizador quedó blanco».
//
// Y había un caso real detrás, no teórico: si el modelo escribe en una carpeta
// DISTINTA de la que sirve el sandbox (se han visto proyectos/ y .proyectos/ en
// el mismo equipo), el preview no refleja nada nunca y desde fuera es
// indistinguible de «está roto». El servidor no tenía forma de contarlo.
//
// Ahora se explica, en tres capas:
//   1. Si no hay index.html en la raíz pero hay UN solo subdirectorio con
//      index.html, se sirve ESE. Muchas veces esto arregla el preview y punto.
//   2. Si no aparece por ningún lado, sirve una página de DIAGNÓSTICO en HTML
//      (no un texto plano de 404) con la raíz real, lo que hay dentro y dónde
//      ha visto algún index.html.
//   3. Si el index.html existe pero pesa 0 bytes, lo dice: una escritura a
//      medias produce exactamente una página blanca.
// ================================================================
function entradasDe(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return []; }
}
function esIndex(dir) {
  try { return fs.statSync(p.join(dir, "index.html")).isFile(); } catch (e) { return false; }
}
// Sin caché a propósito: el modelo escribe archivos MIENTRAS esto corre, y una
// raíz cacheada dejaría de ver lo que acaba de llegar justo cuando hace falta.
function raizEfectiva() {
  if (esIndex(root)) return { dir: root, motivo: "index.html en la raiz servida" };
  const candidatos = [];
  for (const e of entradasDe(root)) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (esIndex(p.join(root, e.name))) candidatos.push(e.name);
  }
  if (candidatos.length === 1) {
    return { dir: p.join(root, candidatos[0]), motivo: "index.html en el subdirectorio " + candidatos[0] + "/" };
  }
  return { dir: root, motivo: candidatos.length > 1 ? "varios subdirectorios con index.html: " + candidatos.join(", ") : "no hay ningun index.html" };
}
function paginaDiagnostico(urlPath, raiz) {
  const nombres = [];
  for (const e of entradasDe(root)) nombres.push(e.name + (e.isDirectory() ? "/" : ""));
  const indices = [];
  for (const e of entradasDe(root)) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (esIndex(p.join(root, e.name))) indices.push(e.name + "/index.html");
  }
  const h = [];
  // v1.16.6 — ESTAS CADENAS DELIMITAN CON COMILLA SIMPLE. Viven dentro de la
  // plantilla (backticks) y una «"» escrita entre comillas dobles consumía las
  // contrabarras del interior: el .cjs generado llegaba con «lang="es"» pelado
  // y reventaba al compilar — el sandbox estático nunca confirmaba en :3500
  // («le cuesta encender»). Con el delimitador simple, las comillas del HTML
  // van sueltas y la plantilla ya no se las come. tests/viaRapidaPreview §10.
  h.push('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">');
  h.push("<title>Sandbox :3500 - no hay nada que servir</title>");
  h.push("<style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b0f14;color:#dbe3ec;padding:28px;line-height:1.6;font-size:13px}");
  h.push("h1{font-size:16px;color:#f0b429;margin:0 0 14px}code{background:#111820;padding:1px 5px;border-radius:4px;color:#7dd3fc}");
  h.push("ul{margin:6px 0 0;padding-left:18px}.k{color:#9aa7b5}hr{border:0;border-top:1px solid #1e2733;margin:18px 0}</style></head><body>");
  h.push("<h1>El sandbox de :3500 responde, pero no hay ningun index.html que servir</h1>");
  h.push("<p>Esto <b>no</b> es un fallo de red ni una pagina en blanco sin motivo: el servidor esta vivo y te esta diciendo lo que ve.</p>");
  h.push('<p><span class="k">Raiz servida:</span> <code>' + root + '</code><br>');
  h.push('<span class="k">Ruta pedida:</span> <code>' + urlPath + '</code><br>');
  h.push('<span class="k">Motivo:</span> ' + raiz.motivo + '</p><hr>');
  h.push('<p><span class="k">Lo que hay en esa raiz:</span></p><ul>');
  h.push(nombres.length ? nombres.map(function (n) { return "<li>" + n + "</li>"; }).join("") : "<li>(carpeta vacia o ilegible)</li>");
  h.push("</ul>");
  if (indices.length) {
    h.push('<hr><p><span class="k">index.html encontrados en subcarpetas:</span></p><ul>');
    h.push(indices.map(function (n) { return "<li>" + n + "</li>"; }).join(""));
    h.push("</ul><p>Si el que quieres previsualizar es uno de esos, el IDE deberia servir esa carpeta como raiz del sandbox.</p>");
  }
  h.push('<hr><p><span class="k">Que hacer:</span><br>1. Comprueba que el modelo escribio en <code>' + root + '</code> y no en otra carpeta.<br>');
  h.push("2. Si escribio en una subcarpeta, arrastra ese index.html a la raiz o vuelve a arrancar el sandbox apuntando ahi.<br>");
  h.push("3. Este panel se genera en cada peticion: recarga para ver el estado actual.</p>");
  h.push("</body></html>");
  return h.join("");
}
// ================================================================
// v1.72.0 — UN RECURSO QUE NO EXISTE YA NO PUEDE DISFRAZARSE DE PAGINA
// ----------------------------------------------------------------
// El fallback de SPA respondia index.html (200, text/html) a CUALQUIER ruta
// ausente. Medido arrancando esta misma plantilla:
//
//   /img/foto.png      -> 200 text/html   (el HTML, no la imagen)
//   /img/noexiste.png  -> 200 text/html   (ni siquiera 404)
//   /css/rota.css      -> 200 text/html   (el navegador lo rechaza por MIME)
//
// Por eso un <img> roto salia como un recuadro blanco SIN ningun aviso: el
// navegador recibia texto donde esperaba bytes. Y el cascado solo miraba bajo
// assets/, mientras el recetario manda al modelo escribir ./img/<nombre>: dos
// promesas de ruta incompatibles, y ninguna de las dos cubria img/.
//
// Ahora un pedido es RECURSO (tiene extension que no es .html) o NAVEGACION.
// Un recurso o es un archivo real o es 404 en texto plano, con el disco mirado.
// La navegacion conserva el fallback de SPA, que es lo que necesita un
// enrutador de cliente. Cada respuesta declara su origen en X-CN-Resuelto.
// ================================================================
function esPedidoDeRecurso(u) {
  var ext = p.extname(String(u || "").split("?")[0]).toLowerCase();
  return ext.length > 0 && ext !== ".html" && ext !== ".htm";
}
function sinRayasIniciales(u) {
  return String(u || "").replace(/^\\/+/, "");
}
function buscaPorNombre(dir, nombre, prof, hits) {
  if (prof > 4 || hits.length > 40) return;
  var es = entradasDe(dir);
  for (var i = 0; i < es.length; i++) {
    var e = es[i];
    if (e.name === "node_modules" || e.name === ".git") continue;
    var f = p.join(dir, e.name);
    if (e.isDirectory()) { buscaPorNombre(f, nombre, prof + 1, hits); continue; }
    if (e.name === nombre) hits.push(f);
  }
}
function resuelveFaltante(urlPath, cb) {
  var rel = sinRayasIniciales(urlPath);
  var bases = [raizEfectiva().dir, projectRoot];
  if (rel && rel.indexOf("..") < 0) {
    for (var b = 0; b < bases.length; b++) {
      try {
        var f = p.resolve(bases[b], rel);
        if (f.indexOf(bases[b]) === 0 && fs.statSync(f).isFile()) { cb(f, null); return; }
      } catch (e) {}
    }
  }
  // Sin extension no es un archivo: es una ruta del enrutador de cliente.
  if (!esPedidoDeRecurso(urlPath)) { cb(null, null); return; }
  var nombre = p.basename(rel);
  // MEDIDO v1.72.1 — sin deduplicar, la misma ruta entraba DOS veces en la lista
  // (la raiz servida y la raiz del proyecto se solapan cuando el sitio vive en
  // una subcarpeta del proyecto) y UN solo archivo se declaraba «existe en
  // varios sitios»: un 404 de algo que si existe. viaRapidaPreview seguia en
  // verde porque el .cjs compilaba perfecto: el defecto era de conducta.
  var vistos = {}, hits = [];
  function unoMas(f) { if (!vistos[f]) { vistos[f] = 1; hits.push(f); } }
  for (var k = 0; k < bases.length; k++) buscaPorNombre(bases[k], nombre, 0, hits);
  for (var h = 0; h < hits.length; h++) vistos[hits[h]] = 1;
  // Con coincidencias repetidas, sobra la repeticion. Con coincidencias REALES
  // distintas, manda la de la RAIZ SERVIDA: es el sitio que el usuario esta
  // mirando, y evita el 404 por ambiguedad en el caso mas comun (la misma foto
  // copiada dentro y fuera del sitio).
  var unicos = [];
  for (var q = 0; q < hits.length; q++) {
    if (unicos.indexOf(hits[q]) < 0) unicos.push(hits[q]);
  }
  if (unicos.length > 1) {
    var enRaiz = unicos.filter(function (f) { return f.indexOf(bases[0]) === 0; });
    if (enRaiz.length === 1) { cb(enRaiz[0], null); return; }
  }
  cb(unicos.length === 1 ? unicos[0] : null, unicos.length > 1 ? unicos : null);
}

function fueraDeRaiz(f) {
  try { return "proyecto:" + p.relative(projectRoot, f).split(p.sep).join("/"); } catch (e) { return "fuera-de-la-raiz"; }
}
// El 404 de un recurso dice lo que hay en disco en lugar de disimularlo de HTML.
function respondeSinArchivo(res, urlPath, raiz, ambiguos) {
  var pista = (ambiguos && ambiguos.length > 1)
    ? "\\nEse nombre existe en varios sitios, di cual quieres: " + ambiguos.slice(0, 6).join(", ")
    : "";
  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-CN-Missing": "recurso-no-encontrado"
  });
  res.end("404 " + urlPath + " no existe en el sandbox" + pista +
    "\\nRaiz servida: " + raiz.dir + "\\nRaiz del proyecto: " + projectRoot + "\\n");
}
// Navegacion de verdad: index.html, conservando las dos trampas que ya
// estaban documentadas aqui (0 bytes y «no es HTML»).
function respondeSPA(res, urlPath, raiz) {
    // Fallback de SPA: cualquier ruta desconocida sirve index.html
    fs.readFile(p.join(raiz.dir, "index.html"), (e2, d2) => {
      if (e2) {
        // Se busca index.html en la raíz original antes de rendirse, porque la
        // ausencia del pedido no implica la ausencia del sitio.
        const html = paginaDiagnostico(urlPath, raiz);
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(html);
        return;
      }
      if (!d2 || d2.length === 0) {
        const html = paginaDiagnostico(urlPath, raiz).replace(
          "El sandbox de :3500 responde, pero no hay ningun index.html que servir",
          "index.html existe pero esta VACIO (0 bytes)"
        );
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(html);
        return;
      }
      // ============================================================
      // v8.0.8 — 🐞 UN index.html QUE NO ES HTML (la causa REAL del blanco)
      // ------------------------------------------------------------
       // Este caso no es teórico: está en el propio ZIP del usuario. Su
       // .proyectos/index.html pesa 24 bytes y contiene, literalmente:
      //
      //     // test sync 1789242976
      //
       // Es un COMENTARIO DE JAVASCRIPT. El servidor lo manda con
       // Content-Type text/html, el navegador lo parsea como HTML, no
      // encuentra ni una etiqueta, y pinta una página en blanco. Sin error, sin
      // aviso en la consola, sin nada. Es la explicación exacta del
      // «previsualizador quedó blanco» que se ha reportado media docena de
      // veces, y demuestra por qué la comprobación de 0 bytes no bastaba:
      // 24 bytes de basura se ve EXACTAMENTE igual que una página rota.
      //
      // Se comprueba que el contenido tenga pinta de HTML antes de servirlo.
      // Si no la tiene, se dice qué hay en su lugar.
      // ============================================================
      const texto2 = d2.toString("utf8");
      // Las barras invertidas van DOBLES: esto vive dentro de una plantilla de
      // TypeScript, y una sola barra la consumiria TypeScript antes de que el
      // codigo generado la viera. Un \\s suelto se convierte en una "s" y el
      // regex deja de filtrar sin que nada avise.
      const pareceHtml = /<\\s*(!doctype|\\?xml|html|head|body|div|span|p|section|main|header|footer|nav|ul|ol|h[1-6]|a|img|script|style|link|meta|form|button)\\b/i.test(texto2);
      if (!pareceHtml) {
        const muestra = texto2.trim().slice(0, 300).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const html = paginaDiagnostico(urlPath, raiz).replace(
          "El sandbox de :3500 responde, pero no hay ningun index.html que servir",
          "index.html existe pero NO contiene HTML (por eso se ve en blanco)"
        ).replace(
          "</body></html>",
          '<hr><p><span class="k">Contenido real del archivo (' + d2.length + ' bytes):</span></p>' +
          '<pre style="background:#111820;padding:10px;border-radius:6px;white-space:pre-wrap;color:#f0b429">' +
          muestra + (texto2.length > 300 ? "\\n..." : "") + "</pre>" +
          "<p>Un archivo que no contiene etiquetas HTML se renderiza como pagina vacia. Suele ser el residuo de una prueba de sincronizacion o una escritura a medias.</p>" +
          "</body></html>"
        );
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(html);
        return;
      }
      // v1.0.10 · F3: el index de la navegacion pasa por la inyeccion (bundle
      // en la respuesta + balise de estado). El archivo en disco no se toca.
      cnSirveHtml(res, d2, raiz);
      });
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/__cn_info") {
    const raiz = raizEfectiva();
    const est = cnEstado(raiz, esIndex(raiz.dir));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, raizPedida: root, raizEfectiva: est.raiz, motivo: est.motivo, tieneIndex: esIndex(raiz.dir), bundle: cnBundle || null, bundleEstado: est.bundle, indexSha: est.indexSha, duplicados: est.duplicados, transformOnServe: Boolean(cnBundle) }));
    return;
  }
  // v1.95.1 · el worker se neutraliza SIEMPRE, exista o no el archivo en disco:
  // si el proyecto actual no tiene sw.js pero el anterior sí lo tuvo, el que sigue
  // instalado en el origen tiene que morir igual.
  if (urlPath === "/sw.js" || urlPath.endsWith("/sw.js")) {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-CN-Sw": "neutralizado-en-preview"
    });
    res.end(CN_SW_KILL);
    return;
  }
  const raiz = raizEfectiva();
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const target = p.resolve(p.join(raiz.dir, urlPath));
  if (!target.startsWith(raiz.dir)) { res.writeHead(403); res.end("403"); return; }
  fs.readFile(target, (err, data) => {
    if (err) {
      // ============================================================
      // v1.52.6 — FALLBACK DE RUTAS ESTÁTICAS EN CASCADA
      // ------------------------------------------------------------
      // Problema original: las imágenes subidas por chat se guardan en
      // PROJECT_ROOT/assets/subidas/ pero el sandbox sirve desde
      // .creador/<sitio>/, donde esa carpeta no existe → recuadro roto.
      //
      // Solución v1.52.6 inicial: fallback solo para «assets/subidas/».
      //
      // Solución v1.52.6-2 (AHORA): fallback GENERAL para cualquier archivo
      // estático bajo «assets/» que exista en projectRoot pero no en la raíz
      // servida. Cubre: imágenes subidas, SVG generados, fuentes, íconos,
      // archivos de media, y cualquier recurso que el modelo o el creador
      // escriban en PROJECT_ROOT/assets/ en vez de dentro del sitio.
      //
      // Orden de búsqueda:
      //   1. raiz.dir (raíz servida del sandbox) → ya intentado arriba (err)
      //   2. projectRoot/assets/<ruta> → si la URL empieza por «assets/»
      //   3. Fallback SPA → index.html (para rutas del enrutador cliente)
      //   4. Diagnóstico 404 → página explicativa
      // ============================================================
      // ============================================================
      // v1.72.0 — CASCADA UNICA, Y 404 DE VERDAD PARA LOS RECURSOS
      // ------------------------------------------------------------
      // Antes: solo se rebuscaba bajo «assets/» y, si nada calzaba, se servia
      // index.html con 200 para TODO. Un <img> roto se veia como un recuadro
      // blanco sin aviso: el navegador recibia HTML donde esperaba bytes. La
      // cascada ahora es raiz servida -> raiz del proyecto -> busqueda por
      // nombre; y si el pedido era un RECURSO y no aparece, es 404 en texto
      // plano. La navegacion conserva el fallback de SPA.
      // ============================================================
      resuelveFaltante(urlPath, function (hit, ambiguos) {
        if (hit) {
          fs.readFile(hit, function (eFb, dFb) {
            if (eFb || !dFb) { respondeSinArchivo(res, urlPath, raiz, ambiguos); return; }
            res.writeHead(200, {
              "Content-Type": TYPES[p.extname(hit).toLowerCase()] || "application/octet-stream",
              "Cache-Control": "no-store",
              "X-CN-Resuelto": fueraDeRaiz(hit)
            });
            res.end(dFb);
          });
          return;
        }
        if (esPedidoDeRecurso(urlPath)) { respondeSinArchivo(res, urlPath, raiz, ambiguos); return; }
        respondeSPA(res, urlPath, raiz);
      });
      return;
    }
    var extOut = p.extname(target).toLowerCase();
    if (extOut === ".html" || extOut === ".htm") { cnSirveHtml(res, data, raiz); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[extOut] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});
server.listen(port, "127.0.0.1", () => console.log("CerebroNico static server en http://127.0.0.1:" + port + " (raiz: " + root + ")"));
`;
