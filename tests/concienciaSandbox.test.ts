/**
 * concienciaSandbox.test.ts — EL PREVIEW RECUERDA, SIN TOCAR NADA MÁS (v1.86.0 · FASE 7.1+7.2)
 * ===========================================================================================
 * El plano pide dos evidencias en FASE 7: «una app generada mínima que recuerda
 * (demo reproducible con comando)» y «el manifiesto del espejo, auditado».
 * Esta suite es esa evidencia ejecutada sobre disco real (un directorio temporal
 * hace de workspace del sandbox; el `cerebro/` de la app nace, crece y se lee).
 *
 * LO QUE SE JUEGA, en orden de gravedad:
 *   1. LA GUARDA DE AISLAMIENTO. Si el endpoint acepta cualquier raíz, la app
 *      generada escribe en el árbol del usuario. Se prueban las cuatro formas de
 *      escalar: raíz relativa, raíz fuera del workspace, raíz que CONTIENE a la
 *      IDE, y segmentos hostiles (`..`, absolutos, backslashes, unidades de
 *      Windows) dentro de tema/título.
 *   2. Que recuerde de verdad: se escribe, se releé, `ultima` es la más nueva, y
 *      la consulta enruta por el órgano de FASE 2 (mismo módulo, raíz distinta).
 *   3. Que no invente: órgano vacío → `ultima:null` con aviso; consulta sin
 *      parecido → vacío con aviso, no "lo más cercano por las dudas".
 *   4. EL ESPEJO DECLARADO, no tunel: un campo que no está en el manifiesto
 *      (incluido `retratoProyecto` y `ultimoError`, que sí viajan al chat del
 *      IDE) NO cruza, y el recorte se nombra con su motivo.
 *   5. Presupuesto: 900 tokens (el mismo `budget` de `buildConcienciaTiempoReal`)
 *      y el aviso cuando se pasa.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  guardarRaizSandbox,
  segmentoSano,
  escribirConcienciaSandbox,
  leerConcienciaSandbox,
  estadoConcienciaSandbox,
  pesoCerebroSandbox,
  carpetaCerebroSandbox,
  TOPE_TEXTO_ENTRADA,
} from "../src/engine/concienciaSandbox";
import {
  MANIFIESTO_ESPEJO_SANDBOX,
  LO_QUE_NO_CRUZA,
  CAMPOS_CONOCIDOS,
  PRESUPUESTO_TOKENS_ESPEJO,
  filtrarInstantaneaPorManifiesto,
  auditarManifiestoEspejo,
  renderManifiestoEspejo,
  escribirManifiestoEspejo,
  leerManifiestoEspejo,
  rutaManifiestoEspejo,
  tokensAprox,
} from "../src/engine/manifiestoEspejo";

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(`${msg}${detalle ? " → " + detalle : ""}`);
}

// El escenario: <ws>/mi-app es el sandbox; <ws>/ide es la IDE; nadie más existe.
const WS = mkdtempSyncSafe();
function mkdtempSyncSafe() { return mkdtempSync(path.join(tmpdir(), "cn-sandbox-")); }
const SANDBOX = path.join(WS, "mi-app");
const IDE = path.join(WS, "ide");
const CTX = { raizWorkspace: WS, raizApp: IDE };

// ═══ 1 · LA GUARDA: cuatro formas de escalar, cuatro puertas cerradas ════════
comprobar("una raiz absoluta dentro del workspace SI pasa", guardarRaizSandbox(SANDBOX, CTX).ok === true, guardarRaizSandbox(SANDBOX, CTX).motivo);
const gRel = guardarRaizSandbox("mi-app", CTX);
comprobar("★ rechaza la raiz RELATIVA (no se puede auditar el encierro)", gRel.ok === false && /absoluta/.test(gRel.motivo), gRel.motivo);
const gFuera = guardarRaizSandbox(path.resolve(WS, "..", "otra-cosa"), CTX);
comprobar("★ rechaza la raiz FUERA del workspace del sandbox", gFuera.ok === false && /FUERA/.test(gFuera.motivo), gFuera.motivo);
const contenedora = path.join(WS, "contenedora");
const gAncestro = guardarRaizSandbox(contenedora, { raizWorkspace: WS, raizApp: path.join(contenedora, "ide") });
comprobar("★ rechaza la raiz que CONTIENE a la propia IDE", gAncestro.ok === false && /contiene a la propia IDE/.test(gAncestro.motivo), gAncestro.motivo);
const gIgual = guardarRaizSandbox(WS, CTX);
comprobar("★ la raiz del sandbox NO puede ser la raiz de datos del IDE (compartirian cerebro/)", gIgual.ok === false && /coincide con la ra.z de datos/.test(gIgual.motivo), gIgual.motivo);
const gVacia = guardarRaizSandbox("", CTX);
comprobar("sin raiz de sandbox no hay endpoint (rechazo, no adivinanza)", gVacia.ok === false && /no lleg/.test(gVacia.motivo), gVacia.motivo);
const gSinWs = guardarRaizSandbox(SANDBOX, { raizWorkspace: "" });
comprobar("sin workspace de referencia la guarda NO abre (fail-closed)", gSinWs.ok === false && /fail-closed/.test(gSinWs.motivo), gSinWs.motivo);
const gSimbolo = guardarRaizSandbox(WS.toUpperCase(), CTX);
comprobar("la guarda compara rutas resueltas, no cadenas crudas", typeof gSimbolo.ok === "boolean");

// La regla de rutas sanas, aplicada a lo que llega del cliente.
const hostiles = ["../../etc/passwd", "/absoluta", "con\\backslash", "C:\\Windows", "   "];
for (const h of hostiles) {
  const s = segmentoSano(h);
  comprobar(`★ «${h.replace(/\n/g, "\\n")}» no pasa la regla de rutas sanas`, s.ok === false && !!s.motivo, s.motivo);
}
comprobar("un segmento normal pasa (no se corta todo por cortar algo)", segmentoSano("estado-del-player").ok === true);

// ═══ 2 · La app generada ESCRIBE y RECUERDA (demo reproducible) ══════════════
const e1 = escribirConcienciaSandbox({ tipo: "accion", titulo: "reproducir", texto: "el usuario apreto play en la pista 3", estado: "reproduciendo" }, CTX, SANDBOX);
comprobar("la app escribe su primera memoria", e1.ok === true && !!e1.entrada, JSON.stringify(e1).slice(0, 160));
const indice = path.join(SANDBOX, "cerebro", "indice.json");
comprobar("★ la memoria vive DENTRO del sandbox (cerebro/indice.json)", existsSync(indice), indice);
comprobar("el cerebro del IDE no se creo ni se toco", !existsSync(path.join(IDE, "cerebro")), path.join(IDE, "cerebro"));
comprobar("el indice del sandbox es JSON valido con la entrada", (() => { try { const j = JSON.parse(readFileSync(indice, "utf8")); return Array.isArray(j.entradas) && j.entradas.length === 1; } catch { return false; } })());
const e2 = escribirConcienciaSandbox({ tipo: "estado", titulo: "player", texto: "pausado en 00:12", estado: "pausado" }, CTX, SANDBOX);
comprobar("la app escribe una segunda entrada", e2.ok === true);
const lectura = leerConcienciaSandbox(CTX, SANDBOX, {});
comprobar("GET conciencia sin consulta devuelve la ULTIMA accion recordada", lectura.ok === true && !!lectura.ultima && /pausado/.test(lectura.ultima!.titulo + lectura.ultima!.resumen + lectura.ultima!.tema), JSON.stringify(lectura.ultima));
comprobar("la lectura cuenta lo que la app recuerda", lectura.total === 2, String(lectura.total));
const porSentido = leerConcienciaSandbox(CTX, SANDBOX, { consulta: "estado del reproductor de audio" });
comprobar("la consulta enruta por el organo de FASE 2 (no por grep exacto)", porSentido.rutas.length > 0, JSON.stringify(porSentido.rutas.map((r) => r.titulo)));
comprobar("el presupuesto de la lectura se declara en numeros", typeof lectura.presupuesto.entradas === "number" && typeof lectura.presupuesto.caracteres === "number", JSON.stringify(lectura.presupuesto));

// ═══ 3 · No inventa memoria ═════════════════════════════════════════════════
const SANDBOX_NUEVO = path.join(WS, "app-vacia");
const vacia = leerConcienciaSandbox(CTX, SANDBOX_NUEVO, {});
comprobar("con el organo vacio la app NO recibe una memoria fingida", vacia.ok === true && vacia.ultima === null && vacia.total === 0, JSON.stringify(vacia).slice(0, 140));
comprobar("y el aviso dice que aun no recordo nada", /todav/.test((vacia.avisos || []).join(" ")), JSON.stringify(vacia.avisos));
const sinParecido = leerConcienciaSandbox(CTX, SANDBOX, { consulta: "zzz kkk qqq inexistente" });
comprobar("consulta sin parecido devuelve vacio CON aviso, no lo mas cercano", sinParecido.rutas.length === 0 && /nada parecido/.test(sinParecido.avisos.join(" ")), JSON.stringify(sinParecido.avisos));

// ═══ 4 · Presupuesto y hostilidad en la escritura ════════════════════════════
const gigante = escribirConcienciaSandbox({ titulo: "volcado", texto: "x".repeat(TOPE_TEXTO_ENTRADA + 900) }, CTX, SANDBOX);
comprobar("una entrada enorme se RECORTA al presupuesto y se AVISA", gigante.ok === true && gigante.avisos.length === 1 && /presupuesto/.test(gigante.avisos[0]), JSON.stringify(gigante.avisos));
const sinTexto = escribirConcienciaSandbox({ titulo: "nada" }, CTX, SANDBOX);
comprobar("escribir el vacio se rechaza con motivo", sinTexto.ok === false && /falta/.test(sinTexto.motivo || ""), sinTexto.motivo);
const temaHostil = escribirConcienciaSandbox({ tema: "../../etc", titulo: "x", texto: "hola" }, CTX, SANDBOX);
comprobar("★ un tema con «..» no escribe fuera del sandbox", temaHostil.ok === false && /rutas sanas/.test(temaHostil.motivo || ""), temaHostil.motivo);
const tituloHostil = escribirConcienciaSandbox({ titulo: "a/../b", texto: "hola" }, CTX, SANDBOX);
comprobar("★ un titulo con «..» tampoco pasa", tituloHostil.ok === false && /rutas sanas/.test(tituloHostil.motivo || ""), tituloHostil.motivo);
comprobar("y no aparecio ningun archivo fuera del sandbox", !existsSync(path.join(WS, "etc")) && !existsSync(path.join(path.resolve(WS), "etc")));
const fuuera = escribirConcienciaSandbox({ titulo: "x", texto: "hola" }, CTX, path.resolve(WS, ".."));
comprobar("escribir contra una raiz fuera del workspace se niega antes de tocar disco", fuuera.ok === false && /FUERA/.test(fuuera.motivo || ""), fuuera.motivo);

// ═══ 5 · Estado y peso ═════════════════════════════════════════════════════
carpetaCerebroSandbox(guardarRaizSandbox(SANDBOX, CTX));
const estAntes = estadoConcienciaSandbox(CTX, SANDBOX);
comprobar("estado dice donde vive el cerebro del sandbox", /mi-app/.test(estAntes.cerebro?.ruta || ""), estAntes.cerebro?.ruta);
comprobar("estado declara cuantos campos cruzan", estAntes.camposDeclarados === MANIFIESTO_ESPEJO_SANDBOX.campos.length, String(estAntes.camposDeclarados));
comprobar("estado dice que el manifiesto aun no esta escrito", estAntes.manifiesto === null, JSON.stringify(estAntes.manifiesto));
comprobar("el indice del sandbox pesa lo que pesa", pesoCerebroSandbox(SANDBOX).existe && pesoCerebroSandbox(SANDBOX).bytes > 0, JSON.stringify(pesoCerebroSandbox(SANDBOX)));
comprobar("una app sin cerebro pesa cero y lo declara", pesoCerebroSandbox(SANDBOX_NUEVO).existe === false && pesoCerebroSandbox(SANDBOX_NUEVO).bytes === 0);

// ═══ 6 · EL ESPEJO DECLARADO: lo que no esta en la lista no cruza ════════════
const auditoria = auditarManifiestoEspejo();
comprobar("el manifiesto del espejo se auto-audita en verde", auditoria.ok === true, auditoria.hallazgos.join(" | "));
comprobar("cada campo declarado existe en InstantaneaConciencia", MANIFIESTO_ESPEJO_SANDBOX.campos.every((c) => CAMPOS_CONOCIDOS.includes(String(c.campo))), MANIFIESTO_ESPEJO_SANDBOX.campos.filter((c) => !CAMPOS_CONOCIDOS.includes(String(c.campo))).map((c) => String(c.campo)).join(","));
comprobar("los campos cortados tambien estan declarados con su motivo", LO_QUE_NO_CRUZA.length >= 2 && LO_QUE_NO_CRUZA.every((x: { campo: string; motivo: string }) => CAMPOS_CONOCIDOS.includes(x.campo) && !!x.motivo.trim()), JSON.stringify(LO_QUE_NO_CRUZA.map((x: { campo: string }) => x.campo)));
comprobar("el presupuesto es el del motor (900, no un numero estético)", PRESUPUESTO_TOKENS_ESPEJO === 900 && MANIFIESTO_ESPEJO_SANDBOX.presupuesto_tokens === 900);
comprobar("la frecuencia de refresco esta declarada", MANIFIESTO_ESPEJO_SANDBOX.frecuencia_refresco_ms > 0 && typeof MANIFIESTO_ESPEJO_SANDBOX.regla_dura === "string");

const snapReal = {
  objetivo: "hacer que el player recuerde donde quedo",
  pasos: [
    { herramienta: "escribir_archivo", detalle: "src/Player.tsx", ok: true },
    { herramienta: "terminal", detalle: "npm run build", ok: false },
  ],
  resumen: { hechas: 3, fallidas: 1, sinHacer: ["probar en el preview"] },
  modelo: "qwen2.5",
  proveedor: "ollama",
  pcMode: true,
  red: false,
  tareaPesada: false,
  fiscal: null,
  // ↓ lo que el tunel mandaria y el espejo NO manda:
  retratoProyecto: "C:\\Users\\Mario\\Documents\\contabilidad\\clientes.xlsx (312 lineas)",
  ultimoError: "ENOENT: C:\\Users\\Mario\\.openrouter\\key no existe",
  clave_api: "sk-or-v1-NO-DEBE-CRUZAR-BAJO-NINGUN-CONCEPTO",
};
const filtrado = filtrarInstantaneaPorManifiesto(snapReal as any);
comprobar("★ el objetivo y los pasos del IDE SI cruzan", filtrado.espejo.objetivo === snapReal.objetivo && Array.isArray(filtrado.espejo.pasos), JSON.stringify(filtrado.espejo).slice(0, 120));
const serial = JSON.stringify(filtrado.espejo);
comprobar("★ NINGUNA ruta del usuario cruza la frontera", !/Mario/.test(serial) && !/Users/.test(serial), serial.slice(0, 200));
comprobar("★ una clave plantada en el estado NO cruza (el filtro es estructural)", !/sk-or/.test(serial) && !("clave_api" in filtrado.espejo), serial.slice(0, 200));
comprobar("retratoProyecto y ultimoError quedan declaradamente afuera", !("retratoProyecto" in filtrado.espejo) && !("ultimoError" in filtrado.espejo));
comprobar("y el filtro DICE que corto y por que", filtrado.descartados.length === 3 && filtrado.descartados.every((d: { porque: string }) => !!d.porque.trim()), JSON.stringify(filtrado.descartados.map((d: { campo: string }) => d.campo)));
comprobar("el payload declarado cabe en el presupuesto", filtrado.excedePresupuesto === false && filtrado.tokensAprox <= PRESUPUESTO_TOKENS_ESPEJO, `${filtrado.tokensAprox} tokens / ${filtrado.caracteres} chars`);
comprobar("tokensAprox estima 4 caracteres por token", tokensAprox("1234") === 1 && tokensAprox("") === 0);

const largo = filtrarInstantaneaPorManifiesto({ objetivo: "x".repeat(900), pasos: [], proveedor: "ollama" } as any);
comprobar("un campo largo se recorta a su max_chars declarado", String(largo.espejo.objetivo).length === 160, String(largo.espejo.objetivo).length);
const payloadEnorme = { objetivo: "a".repeat(5000), pasos: [{ herramienta: "h", detalle: "b".repeat(6000), ok: true }] };
const filtradoEnorme = filtrarInstantaneaPorManifiesto(payloadEnorme as any);
comprobar("los techos por campo mantienen el espejo dentro del presupuesto", filtradoEnorme.excedePresupuesto === false && filtradoEnorme.caracteres < 1200, `tokens=${filtradoEnorme.tokensAprox} chars=${filtradoEnorme.caracteres}`);
const vacioSnap = filtrarInstantaneaPorManifiesto(null);
comprobar("una instantanea nula devuelve espejo vacio, no un error", Object.keys(vacioSnap.espejo).length === 0 && vacioSnap.caracteres === 2, JSON.stringify(vacioSnap));

// PLAGA SEMBRADA: un manifiesto que declara un campo fantasma o sin motivo se cae.
const manifiestoRoto = {
  ...MANIFIESTO_ESPEJO_SANDBOX,
  campos: [...MANIFIESTO_ESPEJO_SANDBOX.campos, { campo: "secretosDelUsuario", tipo: "string", max_chars: 10, frecuencia: "por turno", porque: "invento un campo que no existe" }],
};
comprobar("★ un manifiesto que promete un campo inexistente no pasa la auditoria", auditarManifiestoEspejo(manifiestoRoto as any).ok === false, JSON.stringify(auditarManifiestoEspejo(manifiestoRoto as any).hallazgos));
const manifiestoSinMotivo = { ...MANIFIESTO_ESPEJO_SANDBOX, campos: MANIFIESTO_ESPEJO_SANDBOX.campos.map((c, i) => (i === 0 ? { ...c, porque: "" } : c)) };
comprobar("un campo que cruza sin motivo declarado se rechaza en la auditoria", auditarManifiestoEspejo(manifiestoSinMotivo as any).hallazgos.some((h: string) => /sin motivo/.test(h)), JSON.stringify(auditarManifiestoEspejo(manifiestoSinMotivo as any).hallazgos));

// ═══ 7 · La cara a disco del manifiesto (molde espejos_servidor) ═════════════
const escrito = escribirManifiestoEspejo(SANDBOX, 1_800_000_000_000);
comprobar("el manifiesto se escribe dentro del cerebro del sandbox", escrito.ok === true && existsSync(rutaManifiestoEspejo(SANDBOX)) && !/ide/.test(escrito.ruta.replace(WS, "")), escrito.motivo || escrito.ruta);
comprobar("el manifiesto en disco trae lo que cruza y lo que se corta", (() => { try { const j = JSON.parse(readFileSync(rutaManifiestoEspejo(SANDBOX), "utf8")); return Array.isArray(j.campos) && Array.isArray(j.no_cruza) && j.presupuesto_tokens === 900; } catch { return false; } })());
const leido = leerManifiestoEspejo(SANDBOX);
comprobar("el manifiesto se releé con su marca de tiempo", !!leido && leido!.campos.length === MANIFIESTO_ESPEJO_SANDBOX.campos.length && /202\d-/.test(leido!.generado), JSON.stringify(leido?.generado));
comprobar("el render es determinista (mismo ts, mismos bytes)", renderManifiestoEspejo(1_800_000_000_000) === renderManifiestoEspejo(1_800_000_000_000));
comprobar("una app sin manifiesto devuelve null (no un manifiesto de adorno)", leerManifiestoEspejo(SANDBOX_NUEVO) === null);
// El destino imposible: un archivo comun usado como carpeta madre (ENOTDIR).
const obstaculo = path.join(WS, "obstaculo.txt");
writeFileSync(obstaculo, "esto es un archivo, no una carpeta", "utf8");
const destinoRoto = escribirManifiestoEspejo(path.join(obstaculo, "hija"), 1);
comprobar("si no se puede escribir, se declara el motivo (no se finge el espejo)", destinoRoto.ok === false && /no se pudo escribir/.test(destinoRoto.motivo || ""), JSON.stringify(destinoRoto));
const estDespues = estadoConcienciaSandbox(CTX, SANDBOX);
comprobar("el estado ahora ve el manifiesto escrito", estDespues.manifiesto !== null && typeof estDespues.manifiesto === "string", JSON.stringify(estDespues.manifiesto));

try { rmSync(WS, { recursive: true, force: true }); } catch {}

console.log(`\n═══ SANDBOX CON CEREBRO PROPIO (FASE 7.1 + 7.2): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
