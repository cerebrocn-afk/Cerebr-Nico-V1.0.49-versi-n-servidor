/**
 * estadoSandbox.test.ts — FASE 4 (v1.57.3) · EL MODELO «VE» EL 3500
 * =============================================================================
 * Lo que hay que DEMOSTRAR (capa PURA, sin red ni disco):
 *   · APAGADO → normaliza a corriendo=false y el resumen manda a arrancar.
 *   · CORRIENDO → running/online/puerto/instalado se reflejan tal cual.
 *   · archivos como ARRAY → cuenta + muestra; como NUMBER → solo cuenta.
 *   · errores crudos (tsc) → pasan por la capa F3 y compila=false.
 *   · payload nulo/vacío → valores honestos, nunca inventa que algo corre.
 *   · el resumen para el modelo contiene las señales accionables clave.
 *
 * Se ejecuta con:  npx tsx tests/estadoSandbox.test.ts
 */

import {
  normalizarEstado,
  resumenEstadoParaModelo,
  decidirVigiliaSandbox,
  type EstadoSandboxCrudo,
} from "../src/engine/estadoSandbox";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle?: string): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

function bloque(nombre: string, fn: () => void): void {
  console.log(`\n── ${nombre} ──`);
  try {
    fn();
  } catch (e: any) {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}  ·  explotó: ${e?.message ?? e}`);
  }
}

// ─── Pruebas ───────────────────────────────────────────────────

function t1_apagado(): void {
  const e = normalizarEstado({ online: false, running: false, port: 3500, installed: false });
  comprobar("apagado → corriendo=false", e.corriendo === false, String(e.corriendo));
  comprobar("apagado → online=false", e.online === false, String(e.online));
  comprobar("instalado=false se respeta", e.instalado === false, String(e.instalado));
  const r = resumenEstadoParaModelo(e);
  comprobar("el resumen dice APAGADO", /APAGADO/.test(r));
  comprobar("el resumen manda a npm install", /npm install/.test(r));
}

function t2_corriendo(): void {
  const e = normalizarEstado({
    online: true,
    running: true,
    port: 3500,
    installed: true,
    raizProyectoResuelta: "/ws/proj",
  });
  comprobar("corriendo=true", e.corriendo === true, String(e.corriendo));
  comprobar("online=true", e.online === true, String(e.online));
  comprobar("puerto reflejado", e.puerto === 3500, String(e.puerto));
  comprobar("instalado=true", e.instalado === true, String(e.instalado));
  comprobar("raíz resuelta", e.raiz === "/ws/proj", String(e.raiz));
  const r = resumenEstadoParaModelo(e);
  comprobar("el resumen dice CORRIENDO", /CORRIENDO/.test(r));
  comprobar("el resumen muestra el puerto", /3500/.test(r));
}

function t3_proceso_vivo_sin_responder(): void {
  // running sin online: proceso vivo pero el puerto aún no contesta.
  const e = normalizarEstado({ running: true, online: false, port: 3500 });
  comprobar("running sin online → corriendo=true", e.corriendo === true, String(e.corriendo));
  comprobar("pero online=false", e.online === false, String(e.online));
  const r = resumenEstadoParaModelo(e);
  comprobar("el resumen matiza 'proceso vivo, aún no responde'", /aún no responde/.test(r));
}

function t4_archivos_array(): void {
  const archivos = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
  const e = normalizarEstado({ archivos });
  comprobar("array → cuenta todos", e.archivos === 20, String(e.archivos));
  comprobar("array → muestra recortada a 12", e.muestraArchivos.length === 12, String(e.muestraArchivos.length));
  const r = resumenEstadoParaModelo(e);
  comprobar("resumen incluye conteo de archivos", /20/.test(r));
}

function t5_archivos_number(): void {
  const e = normalizarEstado({ archivos: 7 });
  comprobar("number → cuenta exacta", e.archivos === 7, String(e.archivos));
  comprobar("number → sin muestra", e.muestraArchivos.length === 0, String(e.muestraArchivos.length));
}

function t6_archivos_vacios(): void {
  const e = normalizarEstado({ archivos: 0 });
  comprobar("0 archivos", e.archivos === 0, String(e.archivos));
  const r = resumenEstadoParaModelo(e);
  comprobar("resumen avisa workspace vacío", /vacío/.test(r));
  comprobar("resumen manda a escribir_archivo", /escribir_archivo/.test(r));
}

function t7_fallback_packageJsonCandidates(): void {
  const e = normalizarEstado({ packageJsonCandidates: ["/a/package.json", "/b/package.json"] });
  comprobar("sin archivos, usa candidates para contar", e.archivos === 2, String(e.archivos));
  comprobar("y los pone de muestra", e.muestraArchivos.length === 2, String(e.muestraArchivos.length));
}

function t8_errores_a_diagnosticos(): void {
  const crudo: EstadoSandboxCrudo = {
    online: true,
    running: true,
    errores: "src/foo.ts(10,5): error TS2304: Cannot find name 'bar'.",
  };
  const e = normalizarEstado(crudo);
  comprobar("errores crudos → diagnósticos no vacíos", e.errores.length >= 1, String(e.errores.length));
  comprobar("con error → compila=false", e.compila === false, String(e.compila));
  const r = resumenEstadoParaModelo(e);
  comprobar("el resumen incluye los diagnósticos F3", /TS2304|bar/.test(r), r.slice(0, 80));
}

function t9_errores_como_array(): void {
  const e = normalizarEstado({
    errores: [
      "src/a.ts(1,1): error TS1005: ';' expected.",
      "src/b.ts(2,2): error TS1005: ';' expected.",
    ],
  });
  comprobar("errores en array se concatenan y parsean", e.errores.length >= 1, String(e.errores.length));
  comprobar("array con errores → compila=false", e.compila === false, String(e.compila));
}

function t10_sin_errores_compila(): void {
  const e = normalizarEstado({ online: true, running: true, errores: "" });
  comprobar("sin errores → compila=true", e.compila === true, String(e.compila));
  comprobar("sin errores → lista vacía", e.errores.length === 0, String(e.errores.length));
  const r = resumenEstadoParaModelo(e);
  comprobar("resumen dice 'sin errores conocidos'", /sin errores conocidos/.test(r));
}

function t11_ultima_build(): void {
  const ok = normalizarEstado({ ultimaBuild: { ok: true, cuando: 1700000000000 } });
  comprobar("ultimaBuild.ok=true normaliza a true", ok.ultimaBuild.ok === true, String(ok.ultimaBuild.ok));
  comprobar("cuando (number ms) → ISO string", typeof ok.ultimaBuild.cuando === "string", String(ok.ultimaBuild.cuando));

  const falla = normalizarEstado({ ultimaBuild: { ok: false, salida: "vite build fail\notras lineas" } });
  comprobar("ultimaBuild.ok=false", falla.ultimaBuild.ok === false, String(falla.ultimaBuild.ok));
  comprobar("resumen toma la 1ª línea de salida", falla.ultimaBuild.resumen === "vite build fail", String(falla.ultimaBuild.resumen));

  const desconocida = normalizarEstado({});
  comprobar("sin ultimaBuild → ok=null", desconocida.ultimaBuild.ok === null, String(desconocida.ultimaBuild.ok));
}

function t12_nulo_y_vacio(): void {
  const n = normalizarEstado(null);
  comprobar("null → corriendo=false", n.corriendo === false, String(n.corriendo));
  comprobar("null → puerto por defecto 3500", n.puerto === 3500, String(n.puerto));
  comprobar("null → raiz null", n.raiz === null, String(n.raiz));
  comprobar("null → 0 archivos", n.archivos === 0, String(n.archivos));
  const u = normalizarEstado(undefined);
  comprobar("undefined → no explota, corriendo=false", u.corriendo === false, String(u.corriendo));
}

function t13_puerto_invalido(): void {
  const e = normalizarEstado({ port: 0 });
  comprobar("puerto 0 → cae al 3500", e.puerto === 3500, String(e.puerto));
  const neg = normalizarEstado({ port: -1 as any });
  comprobar("puerto negativo → cae al 3500", neg.puerto === 3500, String(neg.puerto));
}

// ─── Ejecución ───────────────────────────────────────────────

console.log("═══ PRUEBAS ESTADO DEL SANDBOX · CerebroNico v1.57.3 (FASE 4) ═══");
bloque("1. APAGADO", t1_apagado);
bloque("2. CORRIENDO", t2_corriendo);
bloque("3. Proceso vivo sin responder", t3_proceso_vivo_sin_responder);
bloque("4. archivos como ARRAY", t4_archivos_array);
bloque("5. archivos como NUMBER", t5_archivos_number);
bloque("6. archivos vacíos", t6_archivos_vacios);
bloque("7. fallback a packageJsonCandidates", t7_fallback_packageJsonCandidates);
bloque("8. errores crudos → diagnósticos F3", t8_errores_a_diagnosticos);
bloque("9. errores como array", t9_errores_como_array);
bloque("10. sin errores → compila", t10_sin_errores_compila);
bloque("11. última build", t11_ultima_build);
bloque("12. payload nulo y vacío", t12_nulo_y_vacio);
bloque("13. puerto inválido", t13_puerto_invalido);

// ─── v1.84.3 · LA DECISIÓN DEL VIGÍA (queja de Mario con captura, 27/10) ───
// El bug: el vigía miraba solo `online`; en la primera compilación de Vite el
// proceso está vivo y el puerto todavía no — cantaba «se detuvo» y el piloto
// reiniciaba el arranque desde cero para siempre. La decisión vive en el
// módulo puro, para poder jurar sobre ella sin navegador.
function t14_vigia_no_confunde_despertar_con_muerte(): void {
  comprobar("puerto arriba = vivo (nunca reiniciar)", decidirVigiliaSandbox({ online: true, running: true }) === "vivo");
  comprobar("arriba sin campo running también es vivo", decidirVigiliaSandbox({ online: true }) === "vivo");
  comprobar("proceso vivo sin puerto = ARRANCANDO: esperar, no reiniciar", decidirVigiliaSandbox({ online: false, running: true }) === "arrancando");
  comprobar("muerto de verdad (ni puerto ni proceso) = reinicio permitido", decidirVigiliaSandbox({ online: false, running: false }) === "detenido");
  comprobar("payload sin campo running NO autoriza reinicio (ignorancia ≠ muerte)", decidirVigiliaSandbox({ online: false }) === "sin_server");
  comprobar("payload nulo = sin_server (prohibido decidir sin datos)", decidirVigiliaSandbox(null) === "sin_server");
  comprobar("basura no explota", decidirVigiliaSandbox("no soy un objeto" as unknown) === "sin_server");
  // la palabra que el modelo ya recibía (v1.57.3: «proceso vivo, aún no
  // responde») describe el MISMO estado que la decisión nueva: una verdad, dos bocas.
  const e = normalizarEstado({ online: false, running: true });
  comprobar("el resumen del modelo describe el mismo estado ('aún no responde')",
    /CORRIENDO.*aún no responde/.test(resumenEstadoParaModelo(e)) && decidirVigiliaSandbox({ online: false, running: true }) === "arrancando");
}
bloque("14. el vigía no confunde 'despertando' con 'muerto' (v1.84.3)", t14_vigia_no_confunde_despertar_con_muerte);

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
