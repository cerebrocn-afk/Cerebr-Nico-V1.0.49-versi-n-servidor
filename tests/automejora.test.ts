/**
 * automejora.test.ts — v1.93.0 · EL LAZO QUE SE MEJORA A SÍ MISMO TIENE FRENO
 * ===========================================================================
 * Pedido de Mario (30/10): «¿nuestro IDE desde el dev puede automejorarse? … DEBE
 * DE TENER ACCESO A TODO LOS COMANDOS SEGUROS DE AUTOMEJORA, SIEMPRE Y CUANDO
 * ESTEN CONFIRMADOS». La condición es exacta y esta suite la congela tal cual:
 * **acceso a todos los seguros + confirmación obligatoria en lo que toca el cuerpo.**
 *
 * Se prueba el CRITERIO (`automejora.ts` es puro: sin fs, sin shell, sin red). Cada
 * sección es uno de los tres riesgos que el propio usuario nombró, con su
 * contraejemplo adversario — no basta que la regla funcione cuando uno se porta bien.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMANDOS_DE_AUTOMEJORA,
  RUTAS_INTOCABLES,
  MAX_ARCHIVOS_POR_PARCHE,
  MAX_LINEAS_NETAS_POR_PARCHE,
  comandoDeAutomejora,
  leerPruebaDePuerta,
  decidirAdopcion,
  presupuestoDeParche,
  autorizacionDe,
  tokenDeConfirmacionEsperado,
  esTokenDeConfirmacionValido,
  preguntaDeConfirmacion,
  inventarioDeAutomejora,
  type OrigenOrden,
} from "../src/engine/automejora";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

/** Puerta verde COPIADA de la forma real que imprime `scripts/validar.mjs`:
 *  `VEREDICTO: TODO CORRECTO — N comprobaciones, 0 fallos.` y debajo
 *  `Tipos: 0 errores · N suites ejecutadas · …`. Con escapes de color, como
 *  aparecen en el log de verdad (si el parser no los aguanta, esto canta). */
const VERDE = "[32m", FIN = "[0m", GRIS = "[90m";
const LOG_VERDE = [
  "  ✔ cosa 1",
  "  ✔ cosa 2",
  `${VERDE}VEREDICTO: TODO CORRECTO${FIN} — 9148 comprobaciones, 0 fallos.`,
  `${GRIS}Tipos: 0 errores · 224 suites ejecutadas · 0 sin correr · 0 del catálogo ausentes.${FIN}`,
].join("\n");

const PRUEBA_OK = { ...leerPruebaDePuerta(LOG_VERDE, true) };
const QUIRO_SEGURO = { veredicto: "seguro" as const, motivos: [] };

seccion("1 · El mapa de comandos existe, es cerrado y cada nivel dice por qué");
{
  comprobar("hay comandos en los tres niveles", ["auto", "confirmar", "prohibido"].every((n) => COMANDOS_DE_AUTOMEJORA.some((c) => c.nivel === n)));
  comprobar("los ids son únicos", new Set(COMANDOS_DE_AUTOMEJORA.map((c) => c.id)).size === COMANDOS_DE_AUTOMEJORA.length);
  comprobar("todo comando muestra su línea real (nada oculto antes de confirmar)", COMANDOS_DE_AUTOMEJORA.every((c) => c.comando.trim().length > 0));
  comprobar("todo `confirmar` declara qué necesita", COMANDOS_DE_AUTOMEJORA.filter((c) => c.nivel === "confirmar").every((c) => c.requiere.trim().length > 8));
  comprobar("★ los tres pilares del pedido tienen su entrada", ["correr_puerta", "chequear_tipos", "parchear_cuerpo", "compilar_cuerpo", "reiniciar_ide", "proponer_escala_modelo", "reindexar_grafo", "proponer_parche_de_prompt", "exportar_dataset"].every((id) => !!comandoDeAutomejora(id)));
  comprobar("el ajuste fino NO está en el lazo (y lo dice en vez de fingir)", comandoDeAutomejora("ajuste_fino")!.nivel === "prohibido" && /no trae entrenador/.test(comandoDeAutomejora("ajuste_fino")!.requiere));
  comprobar("lo desconocido es prohibido, no 'probá y vemos'", autorizacionDe({ id: "borrar_todo", origen: "usuario", tokenUsuarioConfirmado: "CONFIRMO:BORRAR_TODO" }).permite === false);
  comprobar("el inventario se puede mostrar al usuario", (() => { const i = inventarioDeAutomejora(); return i.auto.length > 0 && i.confirmar.length > 0 && i.prohibido.length > 0; })());

  // ── VALLA CONTRA IDENTIFICADORES INVENTADOS ─────────────────────────────────
  // Nació de un error MEDIDO en esta misma casa: `reiniciar_ide` decía
  // `restart_server` y `proponer_escala_modelo` decía `set_motor_preferido`, dos
  // nombres que no existen en ningún archivo. No rompen el runtime (es texto que se
  // muestra antes de confirmar), pero hacen exactamente lo que la casa persigue desde
  // v1.53.0: que una capacidad se LEA como "ya está" cuando es un deseo con forma de
  // comando. El usuario confirmaría un endpoint que no existe.
  // La regla es mecánica: si el comando nombra una ruta, un archivo o una herramienta,
  // eso tiene que estar en el árbol. El resto es prosa y se la deja pasar.
  const serverYRouters = [leer("server.ts"), ...["automejora", "geminiTts", "capacidades", "modelos"]
    .filter((r) => { try { leer(`server/routers/${r}.ts`); return true; } catch { return false; } })
    .map((r) => leer(`server/routers/${r}.ts`))].join("\n");
  const pkgScripts = Object.keys(JSON.parse(leer("package.json")).scripts || {});
  const fantasma = (cmd: string): string => {
    for (const m of cmd.match(/\/api\/[a-zA-Z0-9\/_-]+/g) ?? []) {
      if (!serverYRouters.includes(m)) return `ruta inexistente: ${m}`;
    }
    for (const m of cmd.match(/(?:scripts|src)\/[a-zA-Z0-9\/_.-]+\.[a-z]+/g) ?? []) {
      if (!existsSync(path.join(RAIZ, m))) return `archivo inexistente: ${m}`;
    }
    for (const m of cmd.match(/npm run ([a-z:._-]+)/g) ?? []) {
      const nombre = m.replace("npm run ", "");
      if (!pkgScripts.includes(nombre)) return `script inexistente: npm run ${nombre}`;
    }
    for (const m of cmd.match(/\b(write_file|read_file|run_tests|list_files|set_plan|update_task|run_command)\b/g) ?? []) {
      if (!serverYRouters.includes(`"${m}"`) && !serverYRouters.includes(m)) return `herramienta inexistente: ${m}`;
    }
    return "";
  };
  const fantasmas = COMANDOS_DE_AUTOMEJORA.map((c) => `${c.id}::${fantasma(c.comando)}`).filter((x) => !x.endsWith("::"));
  comprobar("★ ningún comando promete una ruta/archivo/herramienta que no existe", fantasmas.length === 0, fantasmas.join(" | "));
  comprobar("el reinicio apunta al endpoint real del bridge", /POST \/api\/bridge\/restart/.test(comandoDeAutomejora("reiniciar_ide")!.comando) && serverYRouters.includes("/api/bridge/restart"));
  // La valla tiene que morder: si no detecta el nombre inventado, es decorado (y así
  // es como `restart_server` llegó a vivir dentro del mapa una revisión entera).
  comprobar("★ la valla muerde: detecta una ruta inventada", /ruta inexistente/.test(fantasma("POST /api/esto_no_existe")));
  comprobar("★ la valla muerde: detecta un archivo inventado", /archivo inexistente/.test(fantasma("node scripts/este_script_noESTA.mjs")));
  comprobar("★ la valla muerde: detecta un script inventado", /script inexistente/.test(fantasma("npm run no-existe-esto")));
}

seccion("2 · Riesgo 1 — degradación: la puerta se LEE, no se supone");
{
  const a = decidirAdopcion({ prueba: PRUEBA_OK, quirofano: QUIRO_SEGURO, reversible: true });
  comprobar("con VEREDICTO leído + tipos + quirófano seguro: adopta", a.accion === "adoptar", JSON.stringify(a));
  const sinVeredicto = decidirAdopcion({ prueba: leerPruebaDePuerta("todo anduvo bien creo", true), quirofano: QUIRO_SEGURO, reversible: true });
  comprobar("★ un log sin VEREDICTO no es prueba de nada", sinVeredicto.accion === "revertir" && /VEREDICTO/.test(sinVeredicto.porQue));
  const rojo = decidirAdopcion({ prueba: leerPruebaDePuerta("224 suites · 9148 comprobaciones\nVEREDICTO: HAY FALLOS — 1 fallo(s) sobre 9148 comprobaciones.", true), quirofano: QUIRO_SEGURO, reversible: true });
  comprobar("un fallo cantado revierte y nombra el número", rojo.accion === "revertir" && /1 fallo/.test(rojo.porQue));
  const tipos = decidirAdopcion({ prueba: leerPruebaDePuerta(LOG_VERDE, false), quirofano: QUIRO_SEGURO, reversible: true });
  comprobar("tipos rotos revierten aunque la puerta esté verde", tipos.accion === "revertir" && /tipos/.test(tipos.porQue));
  const quirPeligroso = decidirAdopcion({ prueba: PRUEBA_OK, quirofano: { veredicto: "peligroso", motivos: ["desaparece la exportación `parsearProsa`"] }, reversible: true });
  comprobar("quirófano `peligroso` bloquea aunque todo lo demás esté verde", quirPeligroso.accion === "revertir" && /parsearProsa/.test(quirPeligroso.porQue));
  const quirRevisar = decidirAdopcion({ prueba: PRUEBA_OK, quirofano: { veredicto: "revisar", motivos: ["el archivo pierde 18 % de líneas útiles"] }, reversible: true });
  comprobar("quirófano `revisar` no adopta en silencio: pide confirmación", quirRevisar.accion === "pedir_confirmacion");
  const sinReverso = decidirAdopcion({ prueba: PRUEBA_OK, quirofano: QUIRO_SEGURO, reversible: false });
  comprobar("sin instantánea previa no se adopta (no hay cómo volver)", sinReverso.accion === "revertir" && /reverso/.test(sinReverso.porQue));
  const vacia = decidirAdopcion({ prueba: leerPruebaDePuerta("VEREDICTO: TODO CORRECTO — 0 comprobaciones, 0 fallos.\nTipos: 0 errores · 0 suites ejecutadas · 0 sin correr · 0 del catálogo ausentes.", true), quirofano: QUIRO_SEGURO, reversible: true });
  comprobar("★ la puerta vacía no avala (trinquete contra borrar suites)", vacia.accion === "revertir" && /comprobaciones|suites/.test(vacia.porQue));
  const leido = leerPruebaDePuerta(LOG_VERDE, true);
  comprobar("el conteo se saca del log, no de la fe", leido.fallos === 0 && leido.comprobaciones === 9148 && leido.suites === 224, JSON.stringify(leido));
}

seccion("3 · Riesgo 2 — alucinaciones de arquitectura: presupuesto y rutas intocables");
{
  comprobar("una tanda dentro del presupuesto pasa", presupuestoDeParche(["src/App.tsx", "src/components/ChatCenter.tsx"], 90).ok === true);
  comprobar("más archivos que el techo: se parte", presupuestoDeParche(Array.from({ length: MAX_ARCHIVOS_POR_PARCHE + 3 }, (_, i) => `src/x${i}.ts`), 10).ok === false);
  comprobar("más líneas que el techo: se parte (y lo dice)", presupuestoDeParche(["src/App.tsx"], MAX_LINEAS_NETAS_POR_PARCHE + 500).ok === false);
  comprobar("★ el guardián no se edita a sí mismo", presupuestoDeParche(["scripts/validar.mjs"], 3).ok === false && /intocable/.test(presupuestoDeParche(["scripts/validar.mjs"], 3).porQue));
  comprobar("esta misma política está intocable", RUTAS_INTOCABLES.includes("src/engine/automejora.ts"));
  comprobar("la puerta y el empaquetador están intocables", ["scripts/validar.mjs", "scripts/entregar.ts", "package.json"].every((r) => RUTAS_INTOCABLES.includes(r)));
  comprobar("las formas raras de la misma ruta no escapan del candado", presupuestoDeParche(["./scripts/validar.mjs"], 1).ok === false && presupuestoDeParche(["app/scripts/validar.mjs"], 1).ok === false);
  comprobar("un conteo sin número no se aprueba", presupuestoDeParche(["src/App.tsx"], NaN as any).ok === false);
  comprobar("★ una ruta intocable en una tanda grande bloquea TODO el lote", presupuestoDeParche(["src/App.tsx", "package.json"], 20).ok === false);
}

seccion("4 · Riesgo 3 — prompt injection: el ORIGEN manda, no la buena voluntad");
{
  const orígenes: OrigenOrden[] = ["modelo", "herramienta", "archivo"];
  for (const o of orígenes) {
    const r = autorizacionDe({ id: "parchear_cuerpo", origen: o, tokenUsuarioConfirmado: "CONFIRMO:PARCHEAR_CUERPO" });
    comprobar(`★ «${o}» no puede autorizar un parche al cuerpo, ni con token`, r.permite === false && /usuario/.test(r.porQue));
  }
  const inocuo = autorizacionDe({
    id: "parchear_cuerpo", origen: "archivo",
    tokenUsuarioConfirmado: "CONFIRMO:PARCHEAR_CUERPO",
  });
  comprobar("un texto pegado desde el editor («confirmo: parchear cuerpo») no abre la puerta", inocuo.permite === false);
  comprobar("el usuario SÍ puede, con su token", autorizacionDe({ id: "parchear_cuerpo", origen: "usuario", tokenUsuarioConfirmado: "CONFIRMO:PARCHEAR_CUERPO" }).permite === true);
  comprobar("el usuario sin token no puede", autorizacionDe({ id: "parchear_cuerpo", origen: "usuario" }).permite === false);
  comprobar("«sí» / «dale» / «ok» no son confirmación", ["sí", "si", "dale", "ok", "CONFIRMO", "confirmo"].every((t) => esTokenDeConfirmacionValido(t, "parchear_cuerpo") === false));
  comprobar("★ una confirmación no se presta entre comandos", esTokenDeConfirmacionValido(tokenDeConfirmacionEsperado("compilar_cuerpo"), "parchear_cuerpo") === false);
  comprobar("el token lleva el id adentro (se puede copiar al chat)", /CONFIRMO:parchear_cuerpo/i.test(preguntaDeConfirmacion("parchear_cuerpo")) && tokenDeConfirmacionEsperado("parchear_cuerpo").toLowerCase().includes("parchear_cuerpo"));
  const p = preguntaDeConfirmacion("reiniciar_ide");
  comprobar("la pregunta dice comando, para qué y reverso antes de pedir el token", /\/api\/bridge\/restart/.test(p) && /Reversible/.test(p) && /Necesito/.test(p));
  comprobar("los `auto` corren sin token (solo leen y miden)", autorizacionDe({ id: "correr_puerta", origen: "usuario" }).permite === true && autorizacionDe({ id: "chequear_tipos", origen: "usuario" }).permite === true);
  comprobar("prohibido sigue prohibido CON token del usuario", autorizacionDe({ id: "dependencias_nuevas", origen: "usuario", tokenUsuarioConfirmado: tokenDeConfirmacionEsperado("dependencias_nuevas") }).permite === false);
  comprobar("el presupuesto entra a la autorización (no solo al final)", autorizacionDe({ id: "parchear_cuerpo", origen: "usuario", tokenUsuarioConfirmado: "CONFIRMO:PARCHEAR_CUERPO", presupuesto: presupuestoDeParche(["package.json"], 5) }).permite === false);
}

seccion("5 · Coherencia con la casa (que no sea un módulo huérfano)");
{
  const mod = leer("src/engine/automejora.ts");
  // Se leen los IMPORTS REALES, no el texto de los comentarios: la documentación
  // nombra a propósito lo que el módulo NO usa (`child_process`, `fs`), y una valla
  // que se asusta de la prosa se termina apagando — que es como se mueren las vallas.
  const codigo = mod.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  comprobar("el criterio es puro: sin fs, sin shell, sin red", !/(^|\n)\s*import[^\n]*from "(node:)?(fs|child_process|net|http|https|os)"/.test(codigo) && !/require\(|child_process|execSync|spawnSync|\bfetch\(/.test(codigo));
  comprobar("el módulo no abre mano ni escribe disco ni dispara procesos", !/writeFileSync|execFile|execSync|spawn\(|process\.exit/.test(codigo));
  comprobar("los niveles son exactamente los tres declarados", !/nivel: "(?!auto|confirmar|prohibido)/.test(mod));
  comprobar("el quirófano y la transacción son nombrados como dependencias reales", /quirofano/i.test(mod) && /capaTransaccion|transacci/i.test(mod));
  // La palabra tiene que ser la MISMA que imprime la puerta. Si alguien cambia
  // `validar.mjs` y no cambia acá, el lazo dejaría de leer su propia prueba: rojo.
  const puertaTexto = leer("scripts/validar.mjs");
  const palabraPuerta = (puertaTexto.match(/VEREDICTO: (TODO CORRECTO|HAY FALLOS)/g) || []).sort();
  comprobar("el parser usa la palabra exacta que imprime la puerta", palabraPuerta.includes("VEREDICTO: TODO CORRECTO") && /TODO CORRECTO/.test(mod));
  comprobar("y el log de prueba imita la forma real (con escapes de color)", /\[32mVEREDICTO: TODO CORRECTO/.test(leer("tests/automejora.test.ts")));
  const puerta = leer("scripts/validar.mjs");
  comprobar("la suite está dada de alta en la puerta", /automejora/.test(puerta));
}

console.log(`\n═══ automejora: ${correctas} correctas · ${fallidas} fallidas ════`);
if (fallidas > 0) process.exit(1);
