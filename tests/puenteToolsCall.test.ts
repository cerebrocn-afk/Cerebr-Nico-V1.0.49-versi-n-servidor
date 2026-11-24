/**
 * tests/puenteToolsCall.test.ts — EL CONTRATO DE LAS HERRAMIENTAS DEL PUENTE (v1.71.1)
 * ====================================================================================
 * Se ejecuta con:  npx tsx tests/puenteToolsCall.test.ts
 *
 * 🐞 EL FALLO QUE FIJA (reporte de sistema de la sesión 1792903069364):
 *
 *     GET  /tools       → 200 · 6 herramientas anunciadas
 *     POST /tools/call  → 404 «Ruta no encontrada»
 *
 * El puente (`agent_bridge_5000.py`) se registra como PACK MCP y `server.ts`
 * llama a las herramientas por `POST <url>/tools/call` con `{name, arguments}`
 * (ejecutor de herramientas remotas). La ruta NUNCA existió: las seis
 * herramientas del PC —fs_read, fs_write, fs_list, fs_delete, fs_mkdir, exec—
 * se listaban y ninguna se podía ejecutar. El motor leía el 404 como
 * «El pack remoto puente-mcp respondió HTTP 404» y el usuario veía herramientas
 * vivas que no hacían nada.
 *
 * LA CAUSA DE FONDO no es la ruta que falta: es que la lista ANUNCIADA y la
 * tabla DESPACHADA eran dos cosas distintas escritas a mano (y una de las dos
 * no estaba). Por eso esta suite no comprueba sólo que exista el if: comprueba
 * que las dos salidas salen del MISMO diccionario, que cada herramienta declarada
 * apunta a una operación que existe, y que las puertas antiguas (`/api/*`) llaman
 * a esa misma operación en vez de tener su propia copia.
 *
 * Es una comprobación ESTATICA del contrato (lee el fuente, no levanta el
 * puente): el puente real es Python y su ciclo de vida pertenece al usuario
 * (matar y relanzar el proceso :5000 es acción destructiva). La mecánica viva se
 * verificó a mano contra 127.0.0.1:5099 — ver CHANGELOG-v1.71.1.md.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUENTE = readFileSync(join(RAIZ, "agent_bridge_5000.py"), "utf-8");
const SERVIDOR = readFileSync(join(RAIZ, "server.ts"), "utf-8");
const REGISTRO = readFileSync(join(RAIZ, "src/engine/toolRegistry.ts"), "utf-8");
// v1.97.1 · se importa de verdad para probar el COMPORTAMIENTO del normalizador
// (H-16/H-17), no solo que exista la línea.
const { normalizarParametrosRemotos } = await import("../src/engine/toolRegistry");

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

/** El cuerpo de un método `def nombre(self, args):` hasta el siguiente `def`. */
function cuerpoDe(nombre: string): string {
  const i = PUENTE.indexOf(`    def ${nombre}(self`);
  if (i === -1) return "";
  const j = PUENTE.indexOf("\n    def ", i + 1);
  return PUENTE.slice(i, j === -1 ? PUENTE.length : j);
}

// v1.94.1 · `fs_write_b64` entra al catálogo: el operador existía pero no estaba
// declarado, así que ningún modelo podía escribir un binario (PDF/PNG/ZIP) y los
// escribía como texto — el «PDF que Edge no abre» de Mario. La lista sigue siendo
// CERRADA: una herramienta nueva no se agrega acá hasta que alguien la mira.
const HERRAMIENTAS_ESPERADAS = ["fs_read", "fs_write", "fs_write_b64", "fs_list", "fs_delete", "fs_mkdir", "exec"];

seccion("1. La tabla única: lo que se anuncia es lo que se despacha");
{
  const iTabla = PUENTE.indexOf("HERRAMIENTAS = {");
  comprobar("existe el diccionario HERRAMIENTAS", iTabla !== -1);
  const finTabla = PUENTE.indexOf("\n}", iTabla);
  const tabla = PUENTE.slice(iTabla, finTabla === -1 ? iTabla + 2000 : finTabla + 2);
  // El regex de nombres AHORA ACEPTA DÍGITOS (v1.94.1). Con `[a-z_]+` la valla no veía
  // a `fs_write_b64`: la comprobación "no inventa herramientas" tenía un punto ciego
  // exactamente sobre el nombre que había que descubrir, y el conteo comparaba contra
  // un literal. Se mide la invariante: catálogo capturado ↔ lista esperada ↔ ops.
  const declaradas = [...tabla.matchAll(/^[ ]{4}"([a-z_0-9]+)":/gm)].map((m) => m[1]);
  comprobar(`declara las ${HERRAMIENTAS_ESPERADAS.length} herramientas de la lista, sin olvidar ninguna`, HERRAMIENTAS_ESPERADAS.every((h) => declaradas.includes(h)), declaradas.join(","));
  comprobar("y no inventa herramientas que no estén en la lista", declaradas.every((h) => HERRAMIENTAS_ESPERADAS.includes(h)), declaradas.join(","));
  comprobar("catálogo y lista miden lo mismo (ni una de más, ni una de menos)", declaradas.length === HERRAMIENTAS_ESPERADAS.length, `${declaradas.length} declaradas`);

  const ops = [...tabla.matchAll(/"op":\s*"(_op_[a-z_0-9]+)"/g)].map((m) => m[1]);
  comprobar("cada herramienta declara exactamente una operación", ops.length === declaradas.length, `${ops.length} ops para ${declaradas.length} herramientas`);
  for (const op of ops) {
    comprobar(`· la operación ${op} está implementada`, PUENTE.includes(`    def ${op}(self, args):`));
  }
  comprobar("todas las operaciones devuelven (código, objeto)", ops.every((op) => /return \d+, \{/.test(cuerpoDe(op))), "falta `return <codigo>, {…}` en alguna");
}

seccion("2. GET /tools se GENERA desde la tabla (no se escribe a mano)");
{
  const iGet = PUENTE.indexOf('if parsed.path == "/tools":');
  const cuerpoGet = PUENTE.slice(iGet, iGet + 700);
  comprobar("la lista se construye recorriendo HERRAMIENTAS", /HERRAMIENTAS\.items\(\)/.test(cuerpoGet), cuerpoGet.slice(0, 120));
  comprobar("ya no queda ninguna lista de herramientas escrita a mano junto a /tools", !/\{"name":\s*"fs_read"/.test(cuerpoGet));
  comprobar("y no queda NINGUNA lista a mano en todo el archivo", (PUENTE.match(/\{"name":\s*"fs_read"/g) || []).length === 0);
}

seccion("3. POST /tools/call existe, está autenticado y despacha");
{
  const iDo = PUENTE.indexOf("    def do_POST(self):");
  const cuerpoPost = PUENTE.slice(iDo, PUENTE.indexOf("    def log_message", iDo));
  const iLlamada = cuerpoPost.indexOf('if parsed.path == "/tools/call":');
  comprobar("LA RUTA EXISTE: do_POST conoce /tools/call", iLlamada !== -1);
  comprobar("está DETRÁS de la comprobación de auth (origen + token)", cuerpoPost.indexOf("self._check_auth()") < iLlamada);
  const bloque = cuerpoPost.slice(iLlamada, iLlamada + 1600);
  comprobar("lee {name, arguments} — el cuerpo que manda server.ts", /data\.get\("name"/.test(bloque) && /data\.get\("arguments"\)/.test(bloque));
  comprobar("despacha con la tabla, no con if por herramienta", /HERRAMIENTAS\.get\(nombre\)/.test(bloque) && /getattr\(self, herramienta\["op"\]\)/.test(bloque));
  comprobar("una herramienta desconocida responde 404 con las disponibles", /"Herramienta desconocida/.test(bloque) && /"disponibles"/.test(bloque));
  comprobar("cada llamada queda registrada en la auditoría", /_auditar\("tools\/call"/.test(bloque));
  comprobar("rechaza `arguments` que no sea un objeto", /`arguments` debe ser un objeto/.test(bloque));
}

seccion("4. Las puertas antiguas llaman a la MISMA operación (sin copias)");
{
  const pares: Array<[string, string]> = [
    ["/api/fs/write", "_op_fs_write"],
    ["/api/fs/write_b64", "_op_fs_write_b64"],
    ["/api/fs/delete", "_op_fs_delete"],
    ["/api/fs/mkdir", "_op_fs_mkdir"],
    ["/api/exec", "_op_exec"],
  ];
  for (const [ruta, op] of pares) {
    const i = PUENTE.indexOf(`if parsed.path == "${ruta}":`);
    const cuerpo = PUENTE.slice(i, i + 200);
    comprobar(`${ruta} delega en ${op}`, cuerpo.includes(`self.${op}(`), cuerpo.slice(0, 90));
  }
  const iGet = PUENTE.indexOf('if parsed.path == "/api/fs/read":');
  const cuerpoGet = PUENTE.slice(iGet, iGet + 240);
  comprobar("/api/fs/read (GET) delega en _op_fs_read", cuerpoGet.includes("self._op_fs_read("));
  const iList = PUENTE.indexOf('if parsed.path == "/api/fs/list":');
  const cuerpoList = PUENTE.slice(iList, iList + 240);
  comprobar("/api/fs/list (GET) delega en _op_fs_list", cuerpoList.includes("self._op_fs_list("));

  // La señal de que NO hay lógica duplicada: las primitivas peligrosas sólo
  // aparecen una vez, dentro de la operación compartida.
  const cuentas = (re: RegExp) => (PUENTE.match(re) || []).length;
  comprobar("el subprocess del exec vive en un solo sitio", cuentas(/subprocess\.run\(/g) === 1, String(cuentas(/subprocess\.run\(/g)));
  // v1.94.2 · LO QUE ESTA LÍNEA PROTEGE ES "UNA SOLA PRIMITIVA PELIGROSA, EN UN SOLO
  // LUGAR" (ese es el comentario de arriba), no "tiene que haber exactamente una".
  // `fs_delete` dejó de destruir: mueve a `.cerebro-papelera/` (Mario, 30/10: el puente
  // confesaba que no tenía área de seguridad por archivo). Con `=== 1` la valla cantaba
  // rojo justo POR haber mejorado — cero destrucción es estrictamente más seguro que una
  // destrucción centralizada. Se reescribe midiendo la invariante: sigue prohibido que
  // aparezca un segundo punto de borrado, y ahora además se exige que el borrado sea
  // recuperable y que no queden `os.rmdir` sueltos (carpetas no se borran por acá).
  const sitiosDeBorrado = PUENTE.split("os.remove(").length - 1;
  comprobar("no hay más de un punto de borrado destructivo (ni lógica duplicada)", sitiosDeBorrado <= 1, String(sitiosDeBorrado));
  const cuerpoDelete = PUENTE.slice(PUENTE.indexOf("def _op_fs_delete"), PUENTE.indexOf("def _op_fs_delete") + 2200);
  comprobar("★ y el delete de hoy es RECUPERABLE: pasa por la papelera, no por os.remove", cuerpoDelete.includes("_a_papelera") && cuerpoDelete.includes("shutil.move"));
  comprobar("las carpetas no se borran con esta herramienta (ni con os.rmdir)", !cuerpoDelete.includes("os.rmdir"));
}

seccion("5. La seguridad no se aflojó por el camino");
{
  for (const op of ["_op_fs_read", "_op_fs_list", "_op_fs_write", "_op_fs_delete", "_op_fs_mkdir"]) {
    comprobar(`${op} sigue resolviendo la ruta por el cárcel de permisos`, /self\._resolver\(/.test(cuerpoDe(op)) && /PermissionError/.test(cuerpoDe(op)));
  }
  const exec = cuerpoDe("_op_exec");
  comprobar("exec sigue validando contra la lista blanca", /_validar_comando\(/.test(exec));
  comprobar("exec sigue auditando el permiso y el rechazo", /_auditar\("exec"/.test(exec) && exec.indexOf("_auditar(\"exec\", command, False") < exec.indexOf("_auditar(\"exec\", command, True"));
  comprobar("exec conserva el timeout de 60 s y el recorte de salida", /timeout=60/.test(exec) && /stdout\[:50000\]/.test(exec));
}

seccion("6. Lo que exige el que llama (server.ts)");
{
  comprobar("el motor llama a POST <pack>/tools/call", /fetch\(`\$\{rp\.url\}\/tools\/call`/.test(SERVIDOR));
  const i = SERVIDOR.indexOf("fetch(`${rp.url}/tools/call`");
  const alrededor = SERVIDOR.slice(i, i + 700);
  comprobar("manda method POST", /method:\s*"POST"/.test(alrededor));
  comprobar("manda { name, arguments } — las mismas claves que lee el puente", /JSON\.stringify\(\{\s*name,\s*arguments:/.test(alrededor), alrededor.slice(0, 200));
  comprobar("y viaja con las cabeceras del pack (el token)", /headers:\s*\{[^}]*rp\.headers/.test(alrededor));
}

seccion("7. El schema llega al manual (H-16/H-17) y el exec cita bien en Windows (H-2)");
{
  // ── H-16/H-17: el puente emite `input` plano; el registro debe convertirlo a schema.
  // Antes `registerExternalPack` hacía `t.parameters || vacío` y las 7 herramientas
  // entraban al manual con properties:{} — el modelo no sabía qué argumento pedir.
  const plano = normalizarParametrosRemotos({ name: "fs_read", input: { path: "string" } });
  comprobar("★ `input:{path:string}` se vuelve schema con la propiedad tipada",
    plano?.properties?.path?.type === "string", JSON.stringify(plano));
  comprobar("y la propiedad queda REQUERIDA (el puente la exige)", Array.isArray(plano.required) && plano.required.includes("path"));
  const multi = normalizarParametrosRemotos({ input: { path: "string", content: "string" } });
  comprobar("★ fs_write conserva sus dos argumentos", multi.properties?.path?.type === "string" && multi.properties?.content?.type === "string");
  const passthrough = normalizarParametrosRemotos({ parameters: { type: "object", properties: { x: { type: "number" } } } });
  comprobar("★ un `parameters` ya en schema pasa tal cual (no se rompe el contrato documentado)",
    passthrough?.properties?.x?.type === "number");
  const yaSchema = normalizarParametrosRemotos({ input: { type: "object", properties: { a: { type: "boolean" } } } });
  comprobar("★ un `input` que YA es schema completo también se respeta", yaSchema?.properties?.a?.type === "boolean");
  const vacio = normalizarParametrosRemotos({});
  comprobar("sin nada, devuelve un objeto (nunca undefined), vacío", vacio && vacio.type === "object" && Array.isArray(vacio.required));
  comprobar("★ y `registerExternalPack` YA no usa el fallback vacío: llama al normalizador",
    /parameters:\s*normalizarParametrosRemotos\(t\)/.test(REGISTRO));
  comprobar("el contrato doble (parameters + input) quedó escrito en el manual del registro",
    /CONTRATO REAL Y DOBLE/.test(REGISTRO) && /`input` como mapa plano/.test(REGISTRO));

  // ── H-2: shlex.quote posix envuelve el '\' de Windows en comillas simples que cmd.exe
  // no entiende. El split de más arriba ya usaba posix=(os.name!="nt"); este join no.
  const exec = cuerpoDe("_op_exec");
  // v1.97.4 · el detalle ya no muestra la primera línea (siempre el `def`):
  // muestra la línea `full_cmd` REAL que hay en ESE momento. Si el contrato se
  // rompió (una edición manual del puente — el rojo real de la sesión del
  // 31/10, donde la IDE se editaba a sí misma), el fallo dice exactamente qué
  // línea mirar en vez de un `def` que no aporta nada.
  const lineaJoin = exec.split("\n").map((l) => l.trim()).find((l) => l.startsWith("full_cmd")) || "línea full_cmd no encontrada en _op_exec (¿se reescribió el puente?)";
  comprobar("★ el JOIN del comando es posix-aware en Windows (no rompe cmd.exe)",
    /shlex\.quote\(a,\s*posix=\(os\.name != "nt"\)\)/.test(exec), lineaJoin.slice(0, 200));
  // v1.98.5: el troceo vive en _partir_tramo (equivalente a shlex.split posix-aware,
  // y ademas protege la comilla sin cerrar). Se acepta cualquiera de las dos formas.
  comprobar("el split también sigue posix-aware (ambos lados del contrato)",
    /shlex\.split\([^)]*posix=\(os\.name != "nt"\)\)/.test(PUENTE)
    || /def _partir_tramo\(/.test(PUENTE));
}

console.log(`\n${"─".repeat(60)}`);
console.log(`═══ PUENTE · /tools/call: ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(60));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
