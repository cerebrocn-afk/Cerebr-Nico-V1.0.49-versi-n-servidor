/**
 * fusibleProveedores.test.ts — v1.57.18 · SUITE DE CERTEZA: EL FUSIBLE UNIVERSAL
 * ================================================================================
 * Cierra el agujero de la sesión 1792103924951: glm-4.5-flash falló 6 veces
 * (1.040 s, el 72 % del tiempo perdido) y el motor lo reintentó igual en cada
 * turno, en silencio. El fusible existía SOLO para Gemini. Este es el general:
 * cuarentena por clase de causa (relojModelos), reloj inyectable, y AVISO con
 * alternativa MEDIDA en vez de reintento mudo.
 * Entrada hostil nombrada: error sin mensaje (desconocido) y modelo nunca visto.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "../src/engine/fusibleProveedores";
import { registrarPrimerByte, reiniciarRelojParaPruebas } from "../src/engine/relojModelos";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const T0 = 1_800_000_000_000; // reloj fijo inyectado

let correctas = 0; let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `— ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

console.log("\n🔌 EL FUSIBLE UNIVERSAL — v1.57.18\n");

seccion("1 · Cuarentena por clase de causa (reloj inyectable)");
{
  F.reiniciarCuarentenasParaPruebas();
  const eRed = new Error("fetch failed"); (eRed as any).cause = { code: "ECONNRESET" };
  const cRed = F.registrarFalloProveedor("glm-4.5-flash", eRed, T0);
  comprobar("red → 120 s de pausa", cRed.clase === "red" && cRed.hasta === T0 + 120_000, `${cRed.clase} ${cRed.hasta - T0}`);
  comprobar("en cuarentena dentro de la ventana", F.enCuarentena("glm-4.5-flash", T0 + 60_000)?.clase === "red");
  comprobar("libre al vencer", F.enCuarentena("glm-4.5-flash", T0 + 121_000) === null);
  const cTiempo = F.registrarFalloProveedor("gemma4:31b-cloud", new Error("sin respuesta de gemma4 en los primeros 180 s"), T0);
  comprobar("tiempo → 90 s (puede haber sido carga, no muerte)", cTiempo.clase === "tiempo" && cTiempo.hasta === T0 + 90_000);
  const cCuota = F.registrarFalloProveedor("zai:x", new Error("429 quota exceeded"), T0);
  comprobar("cuota → 15 min", cCuota.clase === "cuota" && cCuota.hasta === T0 + 900_000);
  const cCap = F.registrarFalloProveedor("gpt-oss:120b-cloud", new Error("HTTP 400: this model does not support image input"), T0);
  comprobar("capacidad → 30 min (no va a aprender a ver imágenes)", cCap.clase === "capacidad" && cCap.hasta === T0 + 1_800_000);
  const cDesc = F.registrarFalloProveedor("misterio:1", {}, T0);
  comprobar("ENTRADA HOSTIL: sin mensaje → desconocido, 60 s", cDesc.clase === "desconocido" && cDesc.hasta === T0 + 60_000);
  comprobar("un modelo nunca visto no está en cuarentena", F.enCuarentena("jamas:visto", T0) === null);
}

seccion("2 · La ventana de 12 minutos cuenta los fallos reales");
{
  F.reiniciarCuarentenasParaPruebas();
  for (let i = 0; i < 3; i++) F.registrarFalloProveedor("glm-4.5-flash", new Error("fetch failed"), T0 + i * 1_000);
  comprobar("3 fallos recientes", F.fallosRecientes("glm-4.5-flash", T0 + 4_000) === 3, String(F.fallosRecientes("glm-4.5-flash", T0 + 4_000)));
  comprobar("a los 13 min la ventana está vacía", F.fallosRecientes("glm-4.5-flash", T0 + 13 * 60_000) === 0);
}

seccion("3 · El éxito limpia todo (se ganó otra oportunidad)");
{
  F.reiniciarCuarentenasParaPruebas();
  F.registrarFalloProveedor("glm-4.5-flash", new Error("fetch failed"), T0);
  comprobar("antecedente: en cuarentena", F.enCuarentena("glm-4.5-flash", T0 + 1_000) !== null);
  F.registrarExitoProveedor("glm-4.5-flash");
  comprobar("tras responder: fuera de cuarentena", F.enCuarentena("glm-4.5-flash", T0 + 2_000) === null);
  comprobar("y la ventana de fallos también se limpia", F.fallosRecientes("glm-4.5-flash", T0 + 2_000) === 0);
}

seccion("4 · EL AVISO: cuenta, causa, hasta cuándo y alternativa MEDIDA");
{
  F.reiniciarCuarentenasParaPruebas();
  reiniciarRelojParaPruebas();
  [39_000, 40_000, 41_000].forEach((ms) => registrarPrimerByte("gemma3n:e2b", ms));
  const eRed = new Error("fetch failed"); (eRed as any).cause = { code: "ECONNRESET" };
  F.registrarFalloProveedor("glm-4.5-flash", eRed, T0);
  F.registrarFalloProveedor("glm-4.5-flash", eRed, T0 + 30_000);
  const nota = F.notaCuarentena("glm-4.5-flash", { modelo: "gemma3n:e2b", p50: 40_000, etiqueta: "responde en 40.0 s (medido en tu máquina)" }, T0 + 60_000);
  comprobar("dice EN CUARENTENA y el nombre", /EN CUARENTENA — «glm-4\.5-flash»/.test(nota), nota.slice(0, 90));
  comprobar("cuenta los fallos de la ventana", /falló 2 vez/.test(nota), nota);
  comprobar("nombra la causa y la causa real", /red/.test(nota) && /ECONNRESET/.test(nota));
  comprobar("promete no reintentar en silencio", /No lo reintento en silencio/.test(nota));
  comprobar("propone la alternativa medida", /gemma3n:e2b/.test(nota) && /medido/.test(nota));
  const sinAlt = F.notaCuarentena("otro:1", null, T0);
  comprobar("sin alternativa medida, lo dice en vez de inventar", /no tengo una alternativa medida/i.test(sinAlt), sinAlt.slice(-80));
}

seccion("5 · Diagnóstico y purga");
{
  F.reiniciarCuarentenasParaPruebas();
  F.registrarFalloProveedor("a:1", new Error("429"), T0);
  F.registrarFalloProveedor("b:2", new Error("fetch failed"), T0 + 1_000);
  comprobar("estadoCuarentenas lista las vivas", F.estadoCuarentenas(T0 + 2_000).length === 2);
  comprobar("purga las vencidas al consultar", F.estadoCuarentenas(T0 + 16 * 60_000).every((c) => c.modelo !== "a:1"));
}

seccion("6 · Vallas: el fusible está CABLEADO en la puerta única y en el tramo local");
{
  const servidor = leer("server.ts");
  const fetchCloud = leer("server/fetchCloud.ts");
  const enVivo = leer("server/pivotEnVivo.ts"); // v1.57.19 · F2: las manos del rescate
  // v1.57.18 · la guarda se mudó a una función propia (el cuerpo del guardián
  // tiene valla de 1600 caracteres en esperaNube): la valla la sigue a su domicilio.
  comprobar("fetchCloud consulta el fusible ANTES de llamar", /function guardiaDeCuarentena\(modelo: string\)/.test(fetchCloud) && /guardiaDeCuarentena\(modelo\);/.test(fetchCloud));
  comprobar("el aviso viaja como error de la llamada (no se traga)", /throw new Error\(notaCuarentena\(modelo/.test(fetchCloud));
  comprobar("el tramo local revisa cuarentena (guarda en pivotEnVivo, cable en el monolito)", /export function notaDeCuarentenaLocal/.test(enVivo) && /notaDeCuarentenaLocal\(modelForOllama\)/.test(servidor));
  comprobar("el fallo del timeout local entra al fusible (en el módulo del rescate)", /registrarFalloProveedor\(args\.modeloEnVuelo, fallo\)/.test(enVivo));
  comprobar("el timeout local nombra tramo y presupuesto (mensaje del módulo)", /timeout de inactividad; presupuesto/.test(enVivo));
  comprobar("el fusible general NO reemplazó al de Gemini (los dos conviven)", leer("src/engine/fusibleGemini.ts").includes("export function fusibleRechazaGemini"));
}

console.log(`\n═══ fusibleProveedores: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
