/**
 * cerradura.test.ts — CERRADURA v1 (v1.23.0): 19 reglas de seguridad estática
 * ===========================================================================
 * POR QUÉ EXISTE ESTA SUITE
 * -------------------------
 * Queja literal del usuario: «tiene problema con las vulnerabilidades, entrega
 * trabajos con más de 10 o 15 vulnerabilidades». El motor generaba innerHTML
 * sin sanear, eval, SQL por concatenación y secretos hardcodeados, y NINGUNA
 * puerta lo miraba. Esta suite fija qué detecta la cerradura (cada regla, con
 * su línea y su remedio) y — igual de importante — qué NO debe marcar, porque
 * un escáner que grita con código limpio se apaga al segundo día.
 *
 * Se ejecuta con:   npx tsx tests/cerradura.test.ts
 */
import {
  REGLAS_CERRADURA,
  analizarCodigo,
  analizarProyecto,
  contarHallazgos,
  extensionDe,
  informeCerradura,
} from "../src/engine/cerradura";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}
const tiene = (archivo: string, codigo: string, regla: string) =>
  analizarCodigo(archivo, codigo).some((h) => h.regla === regla);

console.log("\n[0] El contrato del registro");
comprobar("hay EXACTAMENTE 19 reglas", REGLAS_CERRADURA.length === 19, String(REGLAS_CERRADURA.length));
comprobar("los ids son únicos", new Set(REGLAS_CERRADURA.map((r) => r.id)).size === 19);
comprobar("cada regla tiene título, severidad y remedio", REGLAS_CERRADURA.every((r) => r.titulo && r.como && ["critica", "alta", "media", "baja"].includes(r.severidad)));
comprobar("cada regex compila (no hay patrones rotos)", REGLAS_CERRADURA.every((r) => r.re instanceof RegExp));
comprobar("hay al menos 8 reglas críticas (lo que de verdad rompe)", REGLAS_CERRADURA.filter((r) => r.severidad === "critica").length >= 8);

console.log("\n[1] XSS");
comprobar("detecta innerHTML con datos", tiene("app.js", "div.innerHTML = userInput;", "xss-innerhtml"));
comprobar("detecta innerHTML += (acumulación)", tiene("app.js", "lista.innerHTML += `<li>${x}</li>`;", "xss-innerhtml"));
comprobar("detecta insertAdjacentHTML", tiene("app.tsx", "el.insertAdjacentHTML('beforeend', html);", "xss-innerhtml"));
comprobar("no marca innerHTML = '' (limpieza legítima)", !tiene("app.js", "caja.innerHTML = '';", "xss-innerhtml"));
comprobar("no marca DOMPurify", !tiene("app.js", "caja.innerHTML = DOMPurify.sanitize(x);", "xss-innerhtml"));
comprobar("detecta dangerouslySetInnerHTML", tiene("V.tsx", "<div dangerouslySetInnerHTML={{__html: h}} />", "xss-react"));
comprobar("detecta document.write", tiene("a.js", "document.write('<b>' + q + '</b>');", "xss-document-write"));
comprobar("detecta echo $_GET en PHP", tiene("i.php", "echo $_GET['nombre'];", "xss-php-echo"));
comprobar("no marca htmlspecialchars", !tiene("i.php", "echo htmlspecialchars($_GET['n'], ENT_QUOTES);", "xss-php-echo"));

console.log("\n[2] RCE");
comprobar("detecta eval()", tiene("a.js", "const r = eval(expr);", "rce-eval"));
comprobar("detecta new Function", tiene("a.js", "const f = new Function('return ' + body);", "rce-function"));
comprobar("detecta setTimeout con string", tiene("a.js", "setTimeout(\"doStep(\" + n + \")\", 10);", "rce-function"));
comprobar("detecta exec con interpolación", tiene("s.js", "exec(`convert ${file}`, cb);", "rce-shell-node"));
comprobar("no marca execSync literal simple", !tiene("s.js", "execSync(\"git status\")", "rce-shell-node"));
comprobar("detecta os.system en Python", tiene("h.py", "os.system(\"rm -rf \" + destino)", "rce-shell-python"));
comprobar("detecta subprocess shell=True", tiene("h.py", "subprocess.run(cmd, shell=True)", "rce-shell-python"));
comprobar("detecta system() en PHP", tiene("r.php", "system(\"ping \" . $host);", "rce-shell-php"));
comprobar("no marca eval dentro de un comentario", !tiene("a.js", "// el viejo usaba eval(x) acá", "rce-eval"));

console.log("\n[3] Inyección de SQL");
comprobar("detecta SELECT por concatenación", tiene("d.js", "db.query(\"SELECT * FROM users WHERE id=\" + req.params.id);", "sqli-concat"));
comprobar("detecta template literal con ${}", tiene("d.js", "await q(`SELECT * FROM t WHERE x='${v}'`);", "sqli-template"));
comprobar("no marca consulta parametrizada", !tiene("d.js", "db.query(\"SELECT * FROM users WHERE id = ?\", [id]);", "sqli-concat"));
comprobar("no marca un SELECT en texto normal sin variables", !tiene("d.js", "const ayuda = 'SELECT hace falta en SQL';", "sqli-concat"));

console.log("\n[4] Secretos");
comprobar("detecta API key hardcodeada", tiene("c.js", "const apiKey = \"sk-abc123DEF456ghi789\";", "secret-duro"));
comprobar("no marca process.env", !tiene("c.js", "const k = process.env.API_KEY;", "secret-duro"));
comprobar("no marca el placeholder de ejemplo", !tiene("c.js", "const apiKey = \"your-key-here-xxxx\";", "secret-duro"));
comprobar("detecta PRIVATE KEY embebida", tiene("s.js", "const pem = `-----BEGIN RSA PRIVATE KEY-----`;", "secret-private-key"));

console.log("\n[5] Traversal, CORS, cookies, CSP");
comprobar("detecta readFile desde req.query", tiene("r.js", "fs.readFileSync(\"files/\" + req.query.name);", "traversal-ruta"));
comprobar("detecta CORS wildcard", tiene("s.js", "app.use(cors({ origin: '*' }));", "cors-wildcard"));
comprobar("no marca CORS con lista", !tiene("s.js", "app.use(cors({ origin: ['https://mi.app'] }));", "cors-wildcard"));
comprobar("detecta cookie sin HttpOnly", tiene("s.js", "res.setHeader('Set-Cookie', 'sesion=' + id);", "cookie-insegura"));
comprobar("no marca cookie CON HttpOnly", !tiene("s.js", "res.setHeader('Set-Cookie', 's=x; HttpOnly; Secure');", "cookie-insegura"));
comprobar("HTML con script inline sin CSP se marca", tiene("index.html", "<html><head></head><body><script>let x=1</script></body></html>", "csp-ausente"));
comprobar("HTML con CSP declarada no se marca", !tiene("index.html", "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'\"><script src=\"a.js\"></script>", "csp-ausente"));

console.log("\n[6] Deserialización y hash débil");
comprobar("detecta pickle.loads", tiene("h.py", "dato = pickle.loads(req.body)", "deserializacion"));
comprobar("detecta yaml.load sin SafeLoader", tiene("h.py", "cfg = yaml.load(texto)", "deserializacion"));
comprobar("no marca yaml.safe_load", !tiene("h.py", "cfg = yaml.safe_load(texto)", "deserializacion"));
comprobar("detecta md5 de contraseña", tiene("a.js", "const h = md5(contrasena);", "hash-debil"));
comprobar("no marca sha1 para checksum declarado", !tiene("a.js", "// checksum\nconst s = sha1(bytes)", "hash-debil"));

console.log("\n[7] El agregado: proyecto, conteo e informe");
const lote = [
  { path: "src/app.js", content: "div.innerHTML = x;\neval(z);" },
  { path: "src/ok.ts", content: "export const n: number = 1;" },
];
const hallazgos = analizarProyecto(lote);
const resumen = contarHallazgos(hallazgos);
comprobar("analiza el lote completo", hallazgos.length >= 2, JSON.stringify(hallazgos.map((h) => h.regla)));
comprobar("el archivo limpio no suma nada", hallazgos.every((h) => h.archivo === "src/app.js"));
comprobar("resumen cuenta críticas", resumen.criticas >= 2 && resumen.bloquea);
const informe = informeCerradura(hallazgos);
comprobar("el informe nombra archivo y línea", /src\/app\.js:\d+/.test(informe));
comprobar("el informe trae el cómo arreglar", informe.includes("cómo arreglar"));
comprobar("sin hallazgos, el informe lo dice", informeCerradura([]).includes("sin hallazgos"));
comprobar("extensionDe lee el sufijo", extensionDe("a/b/c.PY") === "py" && extensionDe("sin-ext") === "");
comprobar("un hallazgo trae línea > 0", hallazgos.every((h) => h.linea > 0));
comprobar("determinismo: el mismo código da el mismo resultado", JSON.stringify(analizarCodigo("a.js", "eval(x)")) === JSON.stringify(analizarCodigo("a.js", "eval(x)")));

console.log(`\n${pasan}/${pasan + fallan} correctas`);
if (fallan > 0) { console.error("FALLOS:", fallos); process.exit(1); }
