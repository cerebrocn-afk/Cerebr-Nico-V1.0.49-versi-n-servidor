/**
 * interruptorQuirofano.test.ts — EL INTERRUPTOR QUE RECUERDA (v2.3.9)
 * ====================================================================
 * Se ejecuta con:  npx tsx tests/interruptorQuirofano.test.ts
 *
 * LOS CUATRO PEDIDOS DEL USUARIO (4/11) QUE FIJA ESTA SUITE
 * ---------------------------------------------------------
 * 1. «No basta con un flag en RAM: si el Quirófano se apaga y el servidor
 *    reinicia, vuelve encendido y te vuelve a bloquear.» → acá se APAGA, se
 *    simula el reinicio (se tira la instancia y se vuelve a crear contra el
 *    mismo disco) y se comprueba que sigue apagado. Es la comprobación nº1 de
 *    esta casa: sin ella el interruptor es decorativo.
 * 2. «Pedile dos interruptores separados, o al menos que el apagado diga
 *    explícitamente qué deja de vigilar.» → se apaga uno y se comprueba que el
 *    otro sigue vivo, y que el estado y el log NOMBRAN lo que se dejó de vigilar.
 * 4. La parte del juez que vive en el motor está fijada en quirofano.test.ts.
 *
 * La suite no levanta un servidor: finge el `app` de Express y llama a los
 * handlers. Así se puede probar la puerta de autorización (un apagado sin
 * `sandboxAuthorized` tiene que devolver 401) sin abrir un puerto.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leerCasa = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf-8");
import {
  RUTA_INTERRUPTOR,
  RUTAS_QUIROFANO_INTERRUPTOR,
  interruptorQuirofano,
  olvidarInterruptorQuirofano,
  registrarRutasInterruptorQuirofano,
} from "../server/routers/quirofanoInterruptor";
import {
  PALANCA,
  dejaDeVigilar,
  estadoInicial,
  fraseInterruptor,
  desdeDisco,
  paraDisco,
  fijarPalancas,
  QUE_NO_SE_APAGA,
  resumenInterruptor,
  avisoComandoEximido,
  juzgarComando,
} from "../src/engine/interruptorQuirofano";

let correctas = 0;
const fallos: string[] = [];
function c(que: string, ok: boolean, detalle = "") {
  if (ok) {
    correctas++;
    console.log("  \u2713 " + que);
  } else {
    fallos.push(que);
    console.log("  \u2717 " + que + (detalle ? "  \u2192 " + detalle : ""));
  }
}

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "cn-interruptor-"));
const bitacora: string[] = [];
const consolaSilenciosa = {
  log: (m: string) => bitacora.push(m),
  warn: (m: string) => bitacora.push(m),
};
function deps(consola: { log: (m: string) => void; warn: (m: string) => void }) {
  return { raizDatos: carpeta, consola, ahora: () => 1_730_000_000_000 };
}

console.log("\n1) El archivo de estado está en la raíz de datos, no en la RAM\n");

c("la ruta es <raíz de datos>/.cerebronico/quirofano.json", RUTA_INTERRUPTOR("/datos") === path.join("/datos", ".cerebronico", "quirofano.json"));
{
  const i = interruptorQuirofano(deps(consolaSilenciosa));
  c("el archivo todavía no existe (nadie lo tocó)", i.existeArchivo() === false);
  c("y el juez arranca ENCENDIDO en las dos palancas", i.vigilaEscrituras() && i.vigilaComandos());
  c("el estado inicial está anotado como arranque", estadoInicial().cambioPor === "arranque");
  olvidarInterruptorQuirofano(carpeta);
}

console.log("\n2) ★ PEDIDO 1: apagar y REINICIAR el servidor. Sigue apagado.\n");
{
  const i = interruptorQuirofano(deps(consolaSilenciosa));
  i.fijar({ escrituras: false }, { motivo: "reescribo un archivo grande a mano", por: "ide" });
  c("★ se escribió el archivo de estado", fs.existsSync(RUTA_INTERRUPTOR(carpeta)));
  const crudo = fs.readFileSync(RUTA_INTERRUPTOR(carpeta), "utf-8");
  c("★ el JSON dice escrituras:false", /"escrituras":\s*false/.test(crudo));
  c("y no quedó ni un .tmp tirado en el disco (escritura atómica)", fs.readdirSync(path.dirname(RUTA_INTERRUPTOR(carpeta))).every((f) => !f.endsWith(".tmp")));

  // ACÁ ESTÁ EL PEDIDO: se suelta la instancia (es exactamente lo que hace un
  // reinicio del proceso) y se vuelve a crear contra el mismo disco.
  olvidarInterruptorQuirofano(carpeta);
  const trasReinicio = interruptorQuirofano(deps(consolaSilenciosa));
  c("★★ TRAS EL REINICIO el interruptor sigue apagado (no es un flag en RAM)", trasReinicio.vigilaEscrituras() === false);
  c("y recuerda el motivo escrito por el usuario", trasReinicio.estado().motivo === "reescribo un archivo grande a mano");
  c("y recuerda quién lo cambió", trasReinicio.estado().cambioPor === "ide");
  c("y el arranque lo anuncia en el log", bitacora.some((l) => l.includes("interruptor leído")));
  olvidarInterruptorQuirofano(carpeta);
}

console.log("\n3) ★ PEDIDO 2: DOS palancas. Apagar una no desarma la otra.\n");
{
  const i = interruptorQuirofano(deps(consolaSilenciosa));
  i.fijar({ escrituras: false }, { motivo: "tanda grande", por: "ide" });
  c("★ apagada la de escrituras, la de COMANDOS sigue vigilando", i.vigilaEscrituras() === false && i.vigilaComandos() === true);
  i.fijar({ comandos: false }, { motivo: "nada", por: "ide" });
  c("las dos se pueden apagar por separado", i.vigilaEscrituras() === false && i.vigilaComandos() === false);
  i.fijar({ escrituras: true }, { motivo: "", por: "ide" });
  c("★ y se puede re-encender UNA sin tocar la otra", i.vigilaEscrituras() === true && i.vigilaComandos() === false);
  olvidarInterruptorQuirofano(carpeta);
  const reinicio = interruptorQuirofano(deps(consolaSilenciosa));
  c("ese estado mixto también sobrevive al reinicio", reinicio.vigilaEscrituras() === true && reinicio.vigilaComandos() === false);
  reinicio.reactivar({ motivo: "terminó la tanda", por: "ide" });
  c("reactivar devuelve las dos palancas a encendido", reinicio.vigilaEscrituras() && reinicio.vigilaComandos());
  olvidarInterruptorQuirofano(carpeta);
}

console.log("\n4) ★ PEDIDO 2: el apagado DICE qué deja de vigilar\n");
{
  const todo = estadoInicial();
  c("con todo encendido no se deja de vigilar nada", dejaDeVigilar(todo).length === 0);
  const escriturasOff = fijarPalancas(todo, { escrituras: false }, { motivo: "m" });
  c("★ apagar escrituras nombra la amputación que ya no se mide", dejaDeVigilar(escriturasOff).some((q) => q.startsWith("[escrituras]") && q.includes("amputación")));
  c("★ y nombra la API pública que ya no se protege", dejaDeVigilar(escriturasOff).some((q) => q.includes("exportaciones")));
  const comandosOff = fijarPalancas(todo, { comandos: false }, { motivo: "m" });
  c("★ apagar comandos nombra run_command (la protección que NO se pierde al apagar escrituras)", dejaDeVigilar(comandosOff).some((q) => q.startsWith("[comandos]") && q.includes("run_command")));
  c("★ apagar comandos NO borra la protección de escrituras de la lista", dejaDeVigilar(fijarPalancas(comandosOff, { escrituras: false })).length === dejaDeVigilar(escriturasOff).length + dejaDeVigilar(comandosOff).length);
  c("y siempre se declara lo que ninguna palanca toca", QUE_NO_SE_APAGA.some((q) => q.includes("sandboxAuthorized")));
  const frase = fraseInterruptor(comandosOff);
  c("la frase del estado dice APAGADO y cuántas cosas se sueltan", frase.includes("APAGADO") && frase.includes("Deja de vigilar 3"));
  c("la frase con todo encendido dice ENCENDIDO", fraseInterruptor(todo).includes("ENCENDIDO"));
  const resumen = resumenInterruptor(comandosOff, "/x/quirofano.json");
  c("el resumen para el panel trae archivo, palancas e inventario", resumen.archivo === "/x/quirofano.json" && resumen.comandos === false && resumen.dejaDeVigilar.length === 3 && resumen.encendido === false);
}

console.log("\n5) El disco ilegible no apaga al juez por las dudas\n");
{
  const ruta = RUTA_INTERRUPTOR(carpeta);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, "{ esto no es json", "utf-8");
  const e = desdeDisco(fs.readFileSync(ruta, "utf-8"));
  c("★ un JSON corrupto vuelve al defecto: ENCENDIDO", e.escrituras === true && e.comandos === true);
  c("y lo dice en el motivo en vez de callarse", e.motivo.includes("no se pudo leer"));
  fs.writeFileSync(ruta, JSON.stringify({ escrituras: false }), "utf-8");
  c("un archivo escrito a mano se respeta", desdeDisco(fs.readFileSync(ruta, "utf-8")).escrituras === false);
  c("un campo ausente no se inventa: vale el defecto", desdeDisco(JSON.stringify({ comandos: false })).escrituras === true);
  c("un valor que no es booleano no se traga", desdeDisco(JSON.stringify({ escrituras: "sí" })).escrituras === true);
  c("paraDisco/desdeDisco son ida y vuelta", desdeDisco(paraDisco(fijarPalancas(estadoInicial(), { comandos: false }))).comandos === false);
  olvidarInterruptorQuirofano(carpeta);
  const i = interruptorQuirofano(deps(consolaSilenciosa));
  c("★ y la instancia adopte el archivo editado a mano", i.vigilaEscrituras() === false);
  fs.writeFileSync(RUTA_INTERRUPTOR(carpeta), JSON.stringify({ escrituras: true, comandos: true }), "utf-8");
  i.recargar();
  c("recargar() toma el cambio hecho por fuera", i.vigilaEscrituras() === true && i.vigilaComandos() === true);
}

console.log("\n6) La palanca de comandos, en acción\n");
{
  const encendido = estadoInicial();
  const malo = { valido: false, motivo: "El comando está vacío." };
  c("con la palanca prendida, un comando inválido se BLOQUEA", juzgarComando(encendido, malo).bloqueado === true);
  c("y el bloqueo explica qué reenviar", juzgarComando(encendido, malo).motivo.includes("run_command"));
  const apagado = fijarPalancas(encendido, { comandos: false }, { motivo: "m" });
  const j = juzgarComando(apagado, malo, { origen: "/api/exec" });
  c("★ con la palanca apagada pasa, pero queda marcado como eximido", j.bloqueado === false && j.eximido === true);
  c("★ el aviso al log nombra el origen y la orden cruda", avisoComandoEximido("/api/exec", "no es un comando", "npm test").includes("/api/exec"));
  c("apagar COMANDOS no exime escrituras", juzgarComando(fijarPalancas(encendido, { escrituras: false }, { motivo: "m" }), malo).bloqueado === true);
  c("un comando válido pasa con las dos palancas encendidas", juzgarComando(encendido, { valido: true }).bloqueado === false);
}

console.log("\n7) El cable HTTP (Express fingido, sin abrir puerto)\n");
type Ruta = { metodo: string; ruta: string; fn: (req: any, res: any) => void };
function appFingida(): { app: any; rutas: Ruta[] } {
  const rutas: Ruta[] = [];
  const app = {
    get: (r: string, fn: any) => rutas.push({ metodo: "GET", ruta: r, fn }),
    post: (r: string, fn: any) => rutas.push({ metodo: "POST", ruta: r, fn }),
  };
  return { app, rutas };
}
function resFingida() {
  const r: any = { codigo: 200, cuerpo: null as any };
  r.status = (n: number) => {
    r.codigo = n;
    return r;
  };
  r.json = (o: any) => {
    r.cuerpo = o;
    return r;
  };
  return r;
}
{
  olvidarInterruptorQuirofano(carpeta);
  const { app, rutas } = appFingida();
  registrarRutasInterruptorQuirofano(app, { ...deps(consolaSilenciosa), autorizado: (req: any) => req?.autorizado === true });
  c("las rutas declaradas son las del archivo", RUTAS_QUIROFANO_INTERRUPTOR.every((decl) => rutas.some((x) => `${x.metodo} ${x.ruta}` === decl)));
  c("GET /api/quirofano/interruptor está montada", rutas.some((x) => x.metodo === "GET" && x.ruta === "/api/quirofano/interruptor"));
  const post = rutas.find((x) => x.metodo === "POST" && x.ruta === "/api/quirofano/interruptor")!;

  const sinPermiso = resFingida();
  post.fn({ autorizado: false, body: { escrituras: false } }, sinPermiso);
  c("★ apagar al juez sin autorización del sandbox devuelve 401", sinPermiso.codigo === 401);
  c("★ y NO se apaga nada", interruptorQuirofano(deps(consolaSilenciosa)).vigilaEscrituras() === true);

  const basura = resFingida();
  post.fn({ autorizado: true, body: {} }, basura);
  c("un pedido sin palancas devuelve 400 con la lista, no un apagado al azar", basura.codigo === 400 && Array.isArray(basura.cuerpo.palancas));

  const ok = resFingida();
  post.fn({ autorizado: true, body: { escrituras: false, motivo: "reescritura grande", origen: "modelo" } }, ok);
  c("★ apagar por HTTP responde el estado nuevo", ok.cuerpo.ok === true && ok.cuerpo.escrituras === false && ok.cuerpo.comandos === true);
  c("★ y la respuesta dice QUÉ se dejó de vigilar", Array.isArray(ok.cuerpo.dejaDeVigilar) && ok.cuerpo.dejaDeVigilar.length > 0);
  c("★ y qué sigue vigilado", ok.cuerpo.sigueVigilado.some((q: string) => q.includes("sandboxAuthorized")));
  c("★ el apagado por HTTP quedó GRABADO en el disco", /"escrituras":\s*false/.test(fs.readFileSync(RUTA_INTERRUPTOR(carpeta), "utf-8")));
  c("el log del apagado nombra la palanca y el archivo", bitacora.some((l) => l.includes("APAGADA") && l.includes("DEJA DE VIGILAR") && l.includes("quirofano.json")));

  const get = rutas.find((x) => x.metodo === "GET" && x.ruta === "/api/quirofano/interruptor")!;
  const lectura = resFingida();
  get.fn({}, lectura);
  c("el estado se puede leer sin autorización (es lectura)", lectura.cuerpo.escrituras === false && lectura.cuerpo.desde.length > 0);

  olvidarInterruptorQuirofano(carpeta);
  const trasReinicio = interruptorQuirofano(deps(consolaSilenciosa));
  c("★★ lo apagado por HTTP sigue apagado tras reiniciar", trasReinicio.vigilaEscrituras() === false);
  trasReinicio.reactivar({ motivo: "prueba", por: "manual" });
  olvidarInterruptorQuirofano(carpeta);
}

console.log("\n8) El contrato de la casa\n");
{
  const fuente = leerCasa(path.join("server", "routers", "quirofanoInterruptor.ts"));
  c("server.ts ya no guarda el interruptor: vive en su módulo", fuente.includes("RUTA_INTERRUPTOR"));
  c("y se lee al construir la instancia (no hay arranque que se olvide)", /cargar\("arranque"\)/.test(fuente));
  c("el monolito llama al interruptor en las tres puertas de comando", (leerCasa("server.ts").match(/juzgarComando\(norm/g) || []).length === 3);
  c("la suite está registrada en la valla maestra", leerCasa(path.join("scripts", "validar.mjs")).includes("interruptorQuirofano.test.ts"));
  c("ninguna palanca nueva apareció sin contrato", PALANCA.length === 2);
  // El interruptor tiene que estar A LA VISTA: una API que nadie toca es un
  // interruptor decorativo, que es justo lo que el pedido 1 reprochaba.
  const panel = leerCasa(path.join("src", "components", "PanelQuirofano.tsx"));
  c("★ el panel muestra las dos palancas y puede cambiarlas", panel.includes('/api/quirofano/interruptor') && /cambiarPalanca\(p, !prendida\)/.test(panel));
  c("★ y el panel dice QUÉ se dejó de vigilar en vez de un «apagado» a secas", panel.includes("dejaDeVigilar") && panel.includes("qué dejo de vigilar"));
  c("★ el espejo del contrato en el panel trae las dos palancas", /interface InterruptorQf/.test(panel) && /escrituras: boolean;/.test(panel));
}

try {
  fs.rmSync(carpeta, { recursive: true, force: true });
} catch {
  /* el temporales del sistema los borra el sistema */
}

console.log("\n" + "─".repeat(56));
console.log(`═══ INTERRUPTOR DEL QUIRÓFANO (v2.3.9): ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
