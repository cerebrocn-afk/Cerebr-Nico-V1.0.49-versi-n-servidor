/**
 * tests/sandboxContrato.test.ts — QUIÉN MANEJA EL SANDBOX (v1.56.8)
 * ==================================================================
 * Nace de una sesión real de Mario (provider zai, glm-4.5-flash). Pregunta:
 * «envía una página web de CerebroNico al sandbox». Respuesta del modelo: una
 * arquitectura INVENTADA — `main()`, `bootstrap()`, `runEventLoop()`, una carpeta
 * `sandbox/`, `win.loadFile()`, `Ctrl+Shift+I` — y la orden al usuario de guardar
 * los archivos a mano. Cero llamadas a herramientas, y el usuario se quedó con una
 * pantalla blanca.
 *
 * Dos agujeros, ambos reales y ambos de este repo:
 *  1. El system prompt describía los PUERTOS pero nunca decía QUIÉN maneja el
 *     sandbox. El modelo no tenía cómo saber que el IDE sincroniza y arranca; sin
 *     ese dato, inventar una arquitectura coherente es exactamente lo que hace un
 *     modelo de lenguaje.
 *  2. El log de la pestaña Sandbox decía «0 archivo(s) escrito(s)» y DEBAJO
 *     «Proyecto listo», como si el Sync hubiera preparado algo. Ese "listo" habla
 *     del trabajo anterior que ya estaba en el disco. Mandar a 'Arrancar ahora'
 *     después de eso es enseñar la pantalla blanca de OTRO proyecto.
 *
 * Se ejecuta con:  npx tsx tests/sandboxContrato.test.ts
 */
import { buildSuperPrompt } from "../src/engine/superPrompt";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
function c(nombre: string, v: boolean, evidencia?: string) {
  if (v) {
    correctas++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos.push(`${nombre}${evidencia ? ` → ${evidencia}` : ""}`);
    console.log(`  ✗ ${nombre}${evidencia ? ` → ${evidencia}` : ""}`);
  }
}
const seccion = (t: string) => console.log(`\n${t}`);

const perfilFalso = { nombre: "glm-4.5-flash", familia: "glm", cloud: true, toolCapable: true } as any;
const construir = (level: "micro" | "compact" | "standard" | "pro", toolNames: string[] = ["crear_archivo", "fs_write", "previsualizar_sitio"]) =>
  buildSuperPrompt({ profile: perfilFalso, level, toolNames, responseLanguage: "es" } as any).prompt;

// ═══════════════════════════════════════════════════════════════════════════
seccion("1. El contrato del sandbox LLEGA al system prompt (no es prosa de docs)");
{
  for (const nivel of ["compact", "standard", "pro"] as const) {
    const p = construir(nivel);
    c(`★ nivel ${nivel}: hay un bloque [SANDBOX`, /\[SANDBOX[^\n]*\]/.test(p));
    c(`★ nivel ${nivel}: dice que el IDE MANEJA el sandbox`, /MANEJA el IDE|lo MANEJA el IDE/.test(p));
    c(`nivel ${nivel}: prohíbe la carpeta inventada`, /NO existe ninguna carpeta/.test(p));
    // `ra[ií]z`, no `ra[i]z`: el texto lleva tilde y un char class equivocado hace
    // que el test falle por ortografía, no por conducta — el peor tipo de rojo.
    c(`nivel ${nivel}: nombra la raíz real (raíz de datos y .proyectos)`, /\.proyectos/.test(p) && /ra[ií]z de datos/i.test(p));
    c(`nivel ${nivel}: prohíbe mandar al usuario a copiar a mano`, /Nunca le digas que copie archivos a mano|copiar archivos a mano/.test(p));
    c(`nivel ${nivel}: nombra el botón real («Arrancar ahora»)`, /Arrancar ahora/.test(p));
    c(`nivel ${nivel}: exige decir qué botón pulsar si no hay herramientas`, /qu[eé] bot[oó]n/.test(p));
  }
  // micro: presupuesto de ~250 tokens y el modelo está instruido para NO usar
  // herramientas. Meterle el contrato entero le roba el contexto que usa para
  // trabajar; se declara, no se olvida.
  const micro = construir("micro");
  c("micro NO lleva el contrato (presupuesto de tokens declarado en el módulo)", !/\[SANDBOX/.test(micro));
  c("...y micro sí mantiene los puertos, que es lo que le cabe", new RegExp(":3500 ").test(micro)); // v1.0.20 · los puertos ya no son un literal a mano: salen de lineasProtocolo() («:3500 Sandbox»), asi que la valla mira el numero, no el rotulo viejo
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("2. Contra la alucinación concreta de esa sesión");
{
  const p = construir("standard");
  // Los símbolos que el modelo se inventó. El prompt no puede listarlos uno a uno,
  // pero SÍ afirma los hechos que los contradicen y prohíbe inventar rutas.
  const inventados = ["runEventLoop", "sandbox/cerebronico.html", "win.loadFile", "Ctrl+Shift+I", "startServer"];
  c("★ ninguna de esas rutas/símbolos sale del prompt como si fuera real",
    inventados.every((s) => !p.includes(s)), inventados.filter((s) => p.includes(s)).join(", "));
  c("★ y el prompt prohíbe expresamente inventar rutas", /Nunca inventes rutas|no inventes datos ni rutas/i.test(p));
  c("el contrato nombra las herramientas REALES de escribir", /crear_archivo|fs_write|write_file/.test(p));
  c("...y la de previsualizar, que es el paso que el modelo omitió", /previsualizar_sitio/.test(p));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("3. El log contradictorio de la pestaña Sandbox");
{
  const ui = readFileSync(path.join(RAIZ, "src", "components", "RightSidebar.tsx"), "utf-8");
  // Anclado en el botón SYNC (el texto «archivo(s) escrito(s)» aparece antes, en el
  // auto-arranque: buscar la primera ocurrencia leía el bloque equivocado).
  const ancla = ui.indexOf("SYNC · Escribiendo archivos del editor al disco del sandbox");
  c("★ existe el bloque del botón SYNC", ancla > 0);
  const trozo = ui.slice(ancla, ancla + 3200);
  c("★ con 0 archivos escritos NO se dice 'Proyecto listo' a secas",
    /if \(count === 0\)[\s\S]{0,900}NO ten[ií]a archivos/.test(trozo), trozo.slice(0, 80));
  c("★ y se explica que lo 'listo' es trabajo ANTERIOR (la causa de la pantalla blanca)",
    /trabajo de antes|trabajo anterior/i.test(trozo));
  c("se dice qué hacer en su lugar (escribir/pegar y volver a Sync)", /index\.html/.test(trozo) && /Sync/.test(trozo));
  c("con archivos escritos SÍ se conserva el mensaje de listo (cero regresión)",
    /Proyecto listo\. Clic en 'Arrancar ahora'/.test(trozo));
  c("★ el aviso sale de la cifra real, no de un texto fijo", /count === 0/.test(trozo));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("4. Cero regresión del prompt");
{
  const p = construir("standard", []);
  c("sin herramientas, el bloque lo dice claro (no finge tenerlas)", /no tienes herramientas/.test(p));
  c("el contrato del sandbox NO sustituyó al bloque de herramientas", /\[HERRAMIENTAS/.test(p));
  const conHerr = construir("standard", ["fs_write"]);
  c("con herramientas activas se listan por nombre", /HERRAMIENTAS ACTIVAS\] fs_write/.test(conHerr));
  c("IDIOMA sigue mandando español", /Responde SIEMPRE y únicamente en ESPAÑOL/.test(p));
  c("la valla de tokens no se disparó (contrato ≈ 1 KB, no un manual)",
    buildSuperPrompt({ profile: perfilFalso, level: "standard", toolNames: ["fs_write"] } as any).estTokens < 4200,
    String(buildSuperPrompt({ profile: perfilFalso, level: "standard", toolNames: ["fs_write"] } as any).estTokens));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("5. LA RUTA DEL SANDBOX: `.proyectos` es el defecto, no el lugar");
{
  const srv = readFileSync(path.join(RAIZ, "server.ts"), "utf-8");
  const man = readFileSync(path.join(RAIZ, "src", "engine", "manuals.ts"), "utf-8");
  const ui = readFileSync(path.join(RAIZ, "src", "components", "RightSidebar.tsx"), "utf-8");

  // ★ LA INVARIANTE QUE IMPORTA: el Sync y el arranque tienen que hablar de la
  // MISMA carpeta. /api/fs/sync escribe con resolveSafePath -> PROJECT_ROOT;
  // /api/sandbox/start busca con resolverRaizProyectoEn(PROJECT_ROOT). Si alguna
  // vez se separan, el usuario ve "no hay proyecto" con archivos ya sincronizados.
  // v1.90.0 — LA MISMA INVARIANTE, MEDIDA DONDE VIVE. Antes se comprobaba el
  // literal `path.resolve(PROJECT_ROOT, relPath)` dentro de resolveSafePath. Hoy
  // esa línea delega en `resolverRutaDeObra` (que recibe PROJECT_ROOT como raíz
  // de datos) y el nivel de proyecto sale de `raizDeObraEnCurso` → el MISMO
  // `resolverDestinoSandbox` que usa /api/sandbox/start. Se comprueba el vínculo
  // real entre Sync y arranque, que es lo que la valla siempre defendió.
  c("★ el Sync escribe contra PROJECT_ROOT", /function resolveSafePath[\s\S]{0,400}resolverRutaDeObra\(\{[\s\S]{0,200}raizProyecto: PROJECT_ROOT/.test(srv));
  c("★ y Sync y arranque comparten autoridad de raíz", /export function raizDeObraEnCurso[\s\S]{0,600}resolverDestinoSandbox\(base, null, null\)/.test(readFileSync(path.join(RAIZ, "server", "sandboxArranque.ts"), "utf8")));
  c("★ y el arranque busca contra el MISMO PROJECT_ROOT", /function resolverRaizProyecto\(\)[\s\S]{0,900}?resolverRaizProyectoEn\([\s\S]{0,120}?PROJECT_ROOT\)/.test(srv)); // v1.0.20 · la valla exigia la llamada LITERAL `resolverRaizProyectoEn(PROJECT_ROOT)`; la raiz elegida manda y PROJECT_ROOT es el respaldo. Se comprueba el vinculo real (la resolucion sale de PROJECT_ROOT), no la forma de la llamada.
  c("raíz Gemini extraída: servidor exige PROJECT_DIR y no usa respaldo temporal", /decidirRaicesEdicion\(RAIZ_INSTALACION\)/.test(srv) && /if \(modoServidor\(\)\) \{[\s\S]{0,120}resolverWorkspaceServidor\(process\.env\.PROJECT_DIR, RAIZ_INSTALACION\)/.test(readFileSync(path.join(RAIZ,"server","configServidor.ts"),"utf8")));

  // El diagnóstico que Mario recibió decía «el sandbox (.proyectos)» mientras sus
  // archivos estaban en C:\Cerebronico: nombrar mal la ruta convierte un problema
  // de dos minutos en una cacería de horas.
  // v1.87.1 — la raíz ya no se llama `proyecto.raiz` en el monolito: la resuelve
  // `server/sandboxArranque.ts` y el monolito la recibe como `raizProyecto`. Lo que
  // esta valla defiende NO cambió (nombrar la raíz REAL y devolverla como dato);
  // se aceptan las dos formas para no confundir un renombre con una regresión.
  c("★ el 'no hay proyecto' nombra la raíz REAL que se buscó", /Se buscó en \$\{(?:proyecto\.raiz|raizProyecto)\}|se buscaron marcadores[^`]*\$\{(?:proyecto\.raiz|raizProyecto)\}/.test(srv));
  c("★ y la devuelve como dato, no solo como prosa", /raizBuscada: (?:proyecto\.raiz|raizProyecto)/.test(srv));
  c("★ ninguna cadena cara al usuario/modelo afirma ya «el sandbox (.proyectos)»",
    !/sandbox \(\.proyectos\)/.test(srv) && !/sandbox \(\.proyectos\)/.test(man) && !/SANDBOX \(\.proyectos\)/.test(ui) && !/disco \(\.proyectos\)/.test(ui),
    [ /sandbox \(\.proyectos\)/.test(srv) ? "server.ts" : "",
      /sandbox \(\.proyectos\)/.test(man) ? "manuals.ts" : "",
      /(\(disco del sandbox \(\.proyectos\)|SANDBOX \(\.proyectos\)|disco \(\.proyectos\))/.test(ui) ? "RightSidebar.tsx" : "",
    ].filter(Boolean).join(" "));
  c("el aviso de flatten-root también nombra su raíz", /El sandbox todavía no existe en \$\{PROJECT_ROOT\}/.test(srv));

  // Los manuales van al prompt: si le dicen al modelo que el sandbox ES
  // `.proyectos`, el modelo inventa rutas sobre esa mentira.
  c("★ list_files dice que la raíz se resuelve al arrancar", /RAÍZ DE DATOS resuelta al arrancar/.test(man));
  c("★ y prohíbe expresamente inventar rutas absolutas", /Nunca asumas ni inventes rutas absolutas|No inventes rutas/.test(man));
  c("pc_exec distingue sandbox de PC sin afirmar una carpeta fija", /solo cuando no hay otra configurada/.test(man));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ CONTRATO DEL SANDBOX (v1.56.8): ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
