/**
 * arranqueLimpio.test.ts — v1.97.0 · LA VENTANA ABRE VACÍA, EL PUENTE TIENE INTERRUPTOR Y LA VOZ NO SE RECORTA
 * ==========================================================================================================
 * Las tres quejas llegaron en el mismo mensaje de Mario (30/10, con log de arranque, sesión
 * exportada de 30 mensajes y dos capturas):
 *
 *   1. «arranca siempre con un proyecto viejo, tiene que por default arrancar vacía, sandbox
 *      vacío, editor/árbol vacío, chat vacío, a no ser que este guardado sesiones de algún chat,
 *      no solo eso sino que el modelo que empiece queda atrapado en resolver tareas que nunca
 *      pedi que eran de mensajes anteriores y hasta de versiones de cerebronico anteriores»
 *   2. «la opcion de tts texto a voz … queda cortada la ventana de el tts por detras de el
 *      recuadro del menu» (mientras «Tamaño texto» sí abre por encima).
 *   3. «YO tube que reiniciar los puertos y funciono pero creo que el modelo no encontraba el
 *      interruptor del puente 5000».
 *
 * (1) se prueba en puro (`src/utils/arranqueLimpio.ts`) y en el cable (App.tsx). (2) se prueba
 * contra el mecanismo real: el panel del Menú CN tiene `overflow-hidden` y el header
 * `backdrop-blur` crea contexto de apilamiento — la única salida que existe en este repo es
 * portal + `fixed` (como hicieron PanelAspecto y ConsejoPanel). (3) se prueba contra el
 * inventario: la herramienta existe y el botón y el modelo comparten UNA sola función.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};
const seccion = (t: string) => console.log("\n── " + t);

const al: any = await import("../src/utils/arranqueLimpio");
const puente: any = await import("../src/engine/herramientaPuente");

const hilo = (n: number, t0 = 1000) =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", content: `c${i}`, timestamp: t0 + i }));

seccion("§1 · EL DEFAULT ES VACÍO, Y VACÍO NO QUIERE DECIR BORRADO");
c("sin preferencia guardada el arranque es `vacio`", al.modoArranque(null) === "vacio");
c("solo la palabra explícita del usuario lo cambia", al.modoArranque("restaurar") === "restaurar" && al.modoArranque("1") === "vacio" && al.modoArranque("0") === "vacio");

const r1 = al.prepararArranque({ mensajes: hilo(7), chats: [], archivos: [{ id: "a", name: "index.html", path: "index.html", content: "" }], modo: "vacio" }, 999);
c("★ arranca con chat vacío y árbol vacío aunque había 7 mensajes y 1 archivo", r1.mensajes.length === 0 && r1.archivos.length === 0);
c("★ pero NO borra: el hilo quedó como chat guardado y el árbol quedó aparcado", r1.hiloAparcado && r1.workspaceAparcado && r1.chats.length === 1);
c("el chat aparcado es identificable y tiene su título", al.esChatAparcado(r1.chats[0]) && r1.chats[0].title === al.TITULO_APARCADO && r1.chats[0].messages.length === 7);

const r2 = al.prepararArranque({ mensajes: hilo(7), chats: r1.chats, archivos: [], modo: "vacio" }, 999);
c("★ idempotente: aparcar el mismo hilo dos veces no lo duplica (StrictMode llama dos)", r2.chats.length === 1 && r2.hiloAparcado === false);

const r3 = al.prepararArranque({ mensajes: hilo(3, 5000), chats: r1.chats, archivos: [], modo: "vacio" }, 1111);
c("un hilo DISTINTO sí se aparca aparte (no se pisa el anterior)", r3.chats.length === 2 && r3.chats[0].messages.length === 3);

const r4 = al.prepararArranque({ mensajes: [], chats: r3.chats, archivos: [], modo: "vacio" });
c("abrir sin hilo no aparca nada nuevo", r4.hiloAparcado === false && r4.chats.length === 2);

const r5 = al.prepararArranque({ mensajes: hilo(4), chats: [], archivos: [{ id: "a", name: "x", path: "x", content: "" }], modo: "restaurar" });
c("★ con la preferencia explícita vuelve TODO (seguir donde lo dejé sigue existiendo)", r5.mensajes.length === 4 && r5.archivos.length === 1 && !r5.hiloAparcado);

const muchos = Array.from({ length: 9 }, (_, i) => ({ id: `auto-${i}`, title: `a${i}`, createdAt: 0, updatedAt: 0, messages: hilo(1, i) }));
const recort = al.recortarAparcados(muchos);
c(`los auto-aparcados se topen en ${al.MAX_APARCADOS}`, recort.length === al.MAX_APARCADOS);
const mezcla = [...muchos.slice(0, 3), { id: "usuario-1", title: "mi chat", createdAt: 0, updatedAt: 0, messages: hilo(2) }];
c("el tope nunca toca los chats que guardó el usuario", al.recortarAparcados(mezcla).some((x: any) => x.id === "usuario-1"));
c("un árbol vacío no se aparca (no se pisa un previo bueno con nada)", al.prepararArranque({ mensajes: [], chats: [], archivos: [], modo: "vacio" }).workspaceAparcado === false);

seccion("§2 · EL CABLE EN App.tsx (no basta el módulo puro)");
const app = leer("src/App.tsx");
c("★ la decisión se toma antes del primer useState del hilo", app.indexOf("const arranque = useMemo(") < app.indexOf("const [messages, setMessages]"));
c("los tres estados arrancan del resultado, no de localStorage directo", /useState<ChatMessage\[\]>\(arranque\.mensajes\)/.test(app) && /useState<SavedChat\[\]>\(arranque\.chats\)/.test(app) && /useState<WorkspaceFile\[\]>\(arranque\.archivos\)/.test(app));
c("★ el árbol viejo ya no se auto-carga en el inicializador", !/const \[workspaceFiles, setWorkspaceFiles\] = useState<WorkspaceFile\[\]>\(\(\) => \{/.test(app));
c("el editor no abre una pestaña fantasma (`f-memoria` sin archivos)", /useState<string \| null>\(\(\) => arranque\.archivos\[0\]\?\.id \?\? null\)/.test(app));
c("el aparcamiento se escribe antes de que el autoguardado pise la clave", /if \(r\.hiloAparcado\) saveJSON\(LS_KEYS\.SAVED_CHATS, r\.chats\)/.test(app) && /saveJSON\(CLAVE_WORKSPACE_PREVIO, crudos\.archivos\)/.test(app));
c("★ el rescate de IndexedDB respeta el modo (si no, el arranque limpio se desarmaba en equipos con proyectos grandes)", /if \(modoArranqueApp === "restaurar"\) \{[\s\S]{0,700}setWorkspaceFiles\(grandes\[LS_KEYS\.WORKSPACE_FILES\]/.test(app));
c("existe el camino de vuelta explícito", /handleRestorePreviousWorkspace/.test(app) && /onRestorePreviousWorkspace=\{handleRestorePreviousWorkspace\}/.test(app));

seccion("§3 · LA VENTANA DE VOZ (TTS) YA NO QUEDA DETRÁS DEL MENÚ");
const tts = leer("src/components/TtsSelector.tsx");
const hdr = leer("src/components/Header.tsx");
c("★ el diagnóstico es el correcto: el panel del menú recorta con overflow-hidden", /z-\[100\] overflow-hidden/.test(hdr));
c("el desplegable de voz se portal-ea al body", /createPortal\(/.test(tts) && /document\.body/.test(tts));
c("★ y se ancla con position:fixed (z-index solo no alcanza contra un ancestro con overflow)", /position: "fixed"/.test(tts));
c("el `absolute top-full` que se recortaba ya no está", !/absolute right-0 top-full/.test(tts));
c("el clic-fuera considera la tarjeta portalizada (si no, un clic dentro cerraba todo)", /tarjetaRef\.current\?\.contains/.test(tts));
c("se recalcula el ancla al redimensionar la ventana", /addEventListener\("resize", medir\)/.test(tts));
c("mismo patrón que las tarjetas que sí funcionaban", /createPortal/.test(leer("src/components/PanelAspecto.tsx")));

seccion("§4 · EL INTERRUPTOR DEL PUENTE :5000, AHORA TAMBIÉN PARA EL MODELO");
const inv: any = await import("../scripts/inventario-herramientas.mjs");
const todas: Set<string> = inv.inventarioHerramientas(RAIZ).todas;
c("★ `puente_estado` y `reiniciar_puente` son herramientas llamadas (existen en el inventario real)", todas.has("puente_estado") && todas.has("reiniciar_puente"));
c("y el monolito las monta en AGENT_TOOLS", /SPEC_PUENTE_ESTADO as any, SPEC_REINICIAR_PUENTE as any/.test(leer("server.ts")));

// El sondeo entra inyectado: en este contenedor hay un servicio escuchando en :5000 y una
// valla que depende de la red ajena falla sin que nadie haya roto nada.
const depsFalsas = (b: any, vivo = false) => ({
  bridge: () => b,
  invalidar: () => 0,
  cargadas: () => ["exec", "fs_read"],
  reintentos: () => ({ usados: 2, max: 12 }),
  sondear: async () => ({ vivo, detalle: "(sondeo inyectado por la prueba)" }),
});
const sinNada = JSON.parse(await puente.ejecutarHerramientaPuente("puente_estado", {}, depsFalsas(null)));
c("estado sin puente: dice lo que VIO, no lo que espera", sinNada.ok === true && sinNada.vivo === false && sinNada.origen === "ausente" && typeof sinNada.lectura === "string" && sinNada.lectura.length > 20, JSON.stringify(sinNada).slice(0, 160));
const extern = JSON.parse(await puente.ejecutarHerramientaPuente("puente_estado", {}, depsFalsas(null, true)));
c("★ si responde PERO la IDE no lo spawnearon, lo llama `externo` (no finge que es suyo)", extern.vivo === true && extern.origen === "externo");
c("★ un puente ADOPTADO no puede reiniciarse: ok:false con motivo (antes devolvía true y era mentira)", JSON.parse(await puente.ejecutarHerramientaPuente("reiniciar_puente", {}, depsFalsas({ adoptado: true, restart: async () => true }))).ok === false);
const mentiroso = await puente.crearReinicioPuente(depsFalsas({ adoptado: true, restart: async () => true }));
const res: any = { status: (_: number) => res, json: (x: any) => (res.enviado = x) };
await mentiroso({}, res);
c("★ la RUTA del botón dice lo mismo que la herramienta (una opinión, no dos)", res.enviado?.ok === false && res.enviado?.origen === "adoptado");
c("el puente spawnneado por la IDE conserva el contrato viejo {ok, port}", /const DEPS_PUENTE = \{ bridge: \(\) => bridge/.test(leer("server.ts")) && /app\.post\("\/api\/bridge\/restart", crearReinicioPuente\(DEPS_PUENTE\)/.test(leer("server.ts")));
c("adoptar deja de mentir en la propia fuente", /adoptado: true, restart: async \(\) => false/.test(leer("server.ts")));
c("el reinicio real se verifica después (no canta éxito a ciegas)", /const post = await sondear\(\)/.test(leer("src/engine/herramientaPuente.ts")));

seccion("§5 · LA PUERTA DE LA RAÍZ: NO SERVIR EN SILENCIO UN PROYECTO DE OTRA SESIÓN");
{
  const fs = await import("node:fs");
  const os = await import("node:os");
  const pp: any = await import("../src/engine/projectPorter");
  const base = (fs as any).mkdtempSync(os.tmpdir() + "/cn-puerta-");
  fs.mkdirSync(base + "/sitio-uno", { recursive: true });
  fs.mkdirSync(base + "/sitio-dos", { recursive: true });
  fs.writeFileSync(base + "/sitio-uno/index.html", "<!doctype html>", "utf8");
  fs.writeFileSync(base + "/sitio-dos/index.html", "<!doctype html>", "utf8");
  const autodetada: any = pp.resolverDestinoSandbox(base, null, null);
  const candidatos = pp.listarProyectosServibles(base);
  c("★ hay dos entregables servibles y el resolutor los ve a los dos", candidatos.length === 2, `${candidatos.length}`);
  c("★ con dos candidatos, sin pin y sin confirmar: se PREGUNTA en vez de servir", pp.puertaDeEleccionDeRaiz(autodetada, { base, hayPin: false, confirmado: false }).pide === true);
  c("el motivo nombra los candidatos y dice qué se iba a elegir", /sitio-/.test(pp.puertaDeEleccionDeRaiz(autodetada, { base, hayPin: false, confirmado: false }).motivo) && /recencia/.test(pp.puertaDeEleccionDeRaiz(autodetada, { base, hayPin: false, confirmado: false }).motivo));
  c("★ con carpeta vinculada NO se pregunta (el canal directo manda, como siempre)", pp.puertaDeEleccionDeRaiz(autodetada, { base, hayPin: true, confirmado: false }).pide === false);
  c("★ con la confirmación del usuario NO se pregunta otra vez", pp.puertaDeEleccionDeRaiz(autodetada, { base, hayPin: false, confirmado: true }).pide === false);
  const uno = base + "/solo-uno";
  fs.mkdirSync(uno, { recursive: true });
  fs.writeFileSync(uno + "/index.html", "<!doctype html>", "utf8");
  const unHijo = pp.resolverDestinoSandbox(uno, null, null);
  c("★ con UN solo entregable no se pregunta (no se secuestra la pantalla con burocracia)", pp.puertaDeEleccionDeRaiz(unHijo, { base: uno, hayPin: false, confirmado: false }).pide === false);
  const explicito: any = pp.resolverDestinoSandbox(base, base + "/sitio-dos", null);
  c("con destino explícito tampoco: origen no es autodetección", explicito.origen === "explicito" && pp.puertaDeEleccionDeRaiz(explicito, { base, hayPin: false, confirmado: false }).pide === false);
  c("★ y la lista usa el MISMO criterio que el elegido (se comparte la caminata, no se duplica)", candidatos[0].ruta === autodetada.raiz, `${candidatos[0]?.ruta} vs ${autodetada.raiz}`);

  const srv = leer("server.ts");
  c("el server consulta la puerta ANTES de arrancar y responde con los candidatos", /puertaDeEleccionDeRaiz\(arranque, \{ base: PROJECT_ROOT/.test(srv) && /pide_eleccion_de_raiz: true/.test(srv));
  const rsb = leer("src/components/RightSidebar.tsx");
  c("★ el panel no auto-continúa: para, pregunta y ofrece cada candidato", /if \(d\?\.pide_eleccion_de_raiz\) \{\n        setElegirRaiz/.test(rsb) && /\u00bfQu\u00e9 quer\u00e9s previsualizar\?/.test(rsb));
  c("el piloto tampoco elige por el usuario", /AUTO \u00b7 RA\u00cdZ \u00b7/.test(rsb));
  c("confirmar viaja en el cuerpo de /api/sandbox/start (no en una variable suelta)", /confirmarRaiz \? \{ confirmarRaiz: true \}/.test(rsb) && /confirmado: Boolean\(req\.body\?\.confirmarRaiz\)/.test(srv));
}

console.log(`\n═══ arranqueLimpio: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
