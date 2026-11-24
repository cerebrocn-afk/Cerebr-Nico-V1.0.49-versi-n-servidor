/**
 * tests/escaleraFirmas.test.ts — EL CABLE FIRMA→ESCALERA (v1.31.0 · FASE 1)
 * ==========================================================================
 * Se ejecuta con:  npx tsx tests/escaleraFirmas.test.ts
 *
 * La hoja de ruta (§5, §17) lo pedía en una frase: «la próxima versión debe
 * hacer que la detección de repetición CAMBIE AUTOMÁTICAMENTE la estrategia,
 * no solamente que la registre». v1.30 tenía la firma y el conteo
 * (reconocimientoError.ts) pero el único consumidor era el superPrompt —
 * tinta para el modelo. Esta suite prueba el defecto REAL documentado
 * (react-dom ↔ react-dom/client, quince veces) y comprueba que ahora el MOTOR:
 *   · registra cada fallo que pasa por el juez,
 *   · con ≥2 repeticiones de la misma firma SUBE el peldaño solo (2),
 *   · con ≥4 lo sube a 3,
 *   · con ≥5 se BLOQUEA con acta honesta (causa raíz, estrategias gastadas,
 *     decisión requerida) en vez de quemar otro turno en el mismo flip-flop,
 *   · no mezcla errores de archivos distintos, y
 *   · no altera NINGÚN comportamiento anterior cuando no hay repetición.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decidirBucle,
  registrarFalloFirma,
  historialDeFirmas,
  claveDeFallo,
  peldanoPorRepeticiones,
  reiniciarMemoriaDeFirmas,
  UMBRAL_FIRMA,
  type Decision,
  type TareaPlan,
} from "../src/engine/bucleAutonomo";

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
const escalonDe = (d: Decision): number => (d as any).escalon ?? -1;
const directivaDe = (d: Decision): string => (d as any).directiva ?? "";

// Los dos errores EXACTOS de la sesión de v1.30 (el flip-flop):
// misma firma normalizada, distinto texto superficial.
const ERR_CLIENT =
  `[plugin:vite:import-analysis] Failed to resolve import "react-dom/client" from "src/main.tsx". Does the file exist?\n` +
  `C:/Cerebronico/src/main.tsx:2:21\n` +
  `1  |  import React from 'react'\n` +
  `2  |  import { createRoot } from 'react-dom/client'`;
const ERR_RAIZ =
  `[plugin:vite:import-analysis] Failed to resolve import "react-dom" from "src/main.tsx". Does the file exist?\n` +
  `C:/Cerebronico/src/main.tsx:2:31`;

const senal = (error: string | null, fallosHerr: Record<string, number> = { run_command: 1 }, paso = 2) => ({
  contenido: error ? "no pude, probé cambiar el import" : "listo",
  plan: [] as TareaPlan[],
  paso,
  maxPasos: 40,
  ultimoFallo: error ? { herramienta: "run_command", error } : null,
  fallosPorHerramienta: error ? fallosHerr : undefined,
});

seccion("0. Primitivas de memoria: clave, tope, reinicio");
{
  reiniciarMemoriaDeFirmas();
  const k = claveDeFallo(ERR_CLIENT);
  comprobar("la clave ata el error a su clase y su archivo", k === "import-no-resuelto|src/main.tsx", k);
  registrarFalloFirma(ERR_CLIENT);
  comprobar("el historial guarda el crudo (no la firma sola)", historialDeFirmas(k).length === 1);
  for (let i = 0; i < 20; i++) registrarFalloFirma(ERR_RAIZ);
  comprobar("el historial está ACOTADO (tope 12, no crece sin frontera)", historialDeFirmas(k).length === 12);
  comprobar("la ventana guarda los MÁS NUEVOS", historialDeFirmas(k)[11] === ERR_RAIZ);
  reiniciarMemoriaDeFirmas();
  comprobar("el reinicio deja limpio (para pruebas)", historialDeFirmas(k).length === 0);
}

seccion("1. peldañoPorRepeticiones: la tabla de la escalera nueva");
{
  comprobar("0-1 repeticiones: no fuerza nada", peldanoPorRepeticiones(0) === 0 && peldanoPorRepeticiones(1) === 0);
  comprobar("2-3 repeticiones: peldaño 2 (diagnosticar y retroceder)", peldanoPorRepeticiones(2) === 2 && peldanoPorRepeticiones(3) === 2);
  comprobar("≥4 repeticiones: peldaño 3 (reconstruir lo mínimo / arquitectura)", peldanoPorRepeticiones(4) === 3 && peldanoPorRepeticiones(11) === 3);
}

seccion("2. El flip-flop real de v1.30: ahora el escalón se sube SOLO");
{
  reiniciarMemoriaDeFirmas();
  // Turno 1 — primera vez: comportamiento idéntico a v1.30 (escalón 1).
  const d1 = decidirBucle(senal(ERR_CLIENT));
  comprobar("1ª vez: continua con escalón 1 (no se fuerza lo que no repite)", d1.accion === "continuar" && escalonDe(d1) === 1 && !directivaDe(d1).includes("BUCLE DETECTADO"));
  // Turno 2 — el modelo «cambia» a react-dom: MISMA firma normalizada.
  const d2 = decidirBucle(senal(ERR_RAIZ));
  comprobar("2ª vez (variación superficial): el motor lo ve como EL MISMO error", d2.accion === "continuar" && d2.motivo.includes("firma repetida 2×"));
  comprobar("el escalón fue FORZADO a 2 por la firma, no por los fallos", escalonDe(d2) === 2);
  comprobar("la escalera ordena diagnosticar y retroceder", /Segundo escalón de reparación/.test(directivaDe(d2)) && /deshacer_cambios/.test(directivaDe(d2)));
  comprobar("la directriz de reconocimiento viaja pegada (causa raíz + anti-patrón)", directivaDe(d2).includes("BUCLE DETECTADO") && directivaDe(d2).includes("NO reescribas"));
  // Turnos 3 y 4 — la escalera sigue subiendo.
  const d3 = decidirBucle(senal(ERR_CLIENT));
  comprobar("3ª vez: sigue en peldaño 2 (la tabla manda)", escalonDe(d3) === 2 && d3.accion === "continuar");
  const d4 = decidirBucle(senal(ERR_RAIZ));
  comprobar("4ª vez: peldaño 3 — reconstruir lo mínimo/investigar", escalonDe(d4) === 3 && /Tercer escalón/.test(directivaDe(d4)));
  // Turno 5 — ningún peldaño cede: BLOQUEADO con acta honesta.
  const d5 = decidirBucle(senal(ERR_CLIENT));
  comprobar("5ª vez: BLOQUEADO — cierra en vez de quemar otro turno", d5.accion === "cerrar" && d5.motivo.includes("BLOQUEADO"));
  comprobar("el acta nombra la firma y las repeticiones (evidencia, no opinión)", d5.accion === "cerrar" && /react-dom/.test(d5.motivo) && d5.informe.includes("5 veces"));
  comprobar("el acta trae causa raíz, anti-patrón, estrategias gastadas y decisión pedida", d5.accion === "cerrar" && ["Causa raíz", "Anti-patrón", "Estrategias ya gastadas", "Decisión requerida"].every((s) => d5.informe.includes(s)));
  comprobar("el acta NO dice «listo»", d5.accion === "cerrar" && !/^Completado/.test(d5.informe));
}

seccion("3. No hay contaminación: dos archivos, dos memorias");
{
  reiniciarMemoriaDeFirmas();
  const ERR_OTRO = `[plugin:vite:import-analysis] Failed to resolve import "jspdf" from "src/services/pdf.ts". Does the file exist?`;
  const a1 = decidirBucle(senal(ERR_CLIENT));
  const b1 = decidirBucle(senal(ERR_OTRO));
  const a2 = decidirBucle(senal(ERR_RAIZ));
  comprobar("el vecino (pdf.ts) no hereda las repeticiones de main.tsx", escalonDe(b1) === 1 && !directivaDe(b1).includes("BUCLE DETECTADO"));
  comprobar("main.tsx sí acumula su propia memoria", a2.accion === "continuar" && (a2 as any).escalon === 2);
  comprobar("el primer turno del vecino fue igual que antes (no regresión)", a1.accion === "continuar" && escalonDe(a1) === 1);
}

seccion("4. Sin fallo no hay registro: la memoria no se contamina sola");
{
  reiniciarMemoriaDeFirmas();
  const d = decidirBucle(senal(null));
  comprobar("respuesta limpia con cierre: igual que v1.30 (cerrar)", d.accion === "cerrar" && d.motivo.includes("cerró sin tareas abiertas"));
  const k = claveDeFallo(ERR_CLIENT);
  comprobar("el historial de la firma sigue intacto (no se registra el aire)", historialDeFirmas(k).length === 0);
  comprobar("plan abierto sin fallo: continúa como siempre", decidirBucle({ contenido: "sigo", plan: [{ id: "1", description: "x", status: "pending" }], paso: 1, maxPasos: 10 }).accion === "continuar");
}

seccion("5. UMBRAL_FIRMA es configurable (regla §17: números por perfil)");
{
  const original = { ...UMBRAL_FIRMA };
  try {
    reiniciarMemoriaDeFirmas();
    UMBRAL_FIRMA.bloquear = 3;
    decidirBucle(senal(ERR_CLIENT));
    decidirBucle(senal(ERR_RAIZ));
    const d3 = decidirBucle(senal(ERR_CLIENT));
    comprobar("con bloquear=3, al 3º repetido el motor ya se bloquea", d3.accion === "cerrar" && d3.motivo.includes("BLOQUEADO"));
    UMBRAL_FIRMA.bloquear = 99;
    reiniciarMemoriaDeFirmas();
    decidirBucle(senal(ERR_CLIENT));
    const d2 = decidirBucle(senal(ERR_RAIZ));
    comprobar("con bloquear=99 el bucle nunca cierra por firma (sigue reparando)", d2.accion === "continuar" && escalonDe(d2) === 2);
  } finally {
    Object.assign(UMBRAL_FIRMA, original);
    reiniciarMemoriaDeFirmas();
  }
  comprobar("los umbrales de la casa quedan como estaban (2 y 5)", UMBRAL_FIRMA.bucle === 2 && UMBRAL_FIRMA.bloquear === 5);
}

seccion("6. El cable está enganchado de verdad (lectura del fuente)");
{
  const fuente = readFileSync(path.resolve("src/engine/bucleAutonomo.ts"), "utf8");
  comprobar("el juez importa el analizador de firmas de v1.30", /from "\.\/reconocimientoError"/.test(fuente) && /analizarBucle\(/.test(fuente));
  comprobar("la repetición FORCE el escalón (Math.max con peldaño)", /Math\.max\(escalonPorFallos,\s*escalonPorFirma\)/.test(fuente));
  comprobar("server.ts sigue sin pagar esta lógica (trinquete intacto)", !readFileSync(path.resolve("server.ts"), "utf8").includes("peldanoPorRepeticiones"));
  comprobar("esta suite entra en npm run validar", readFileSync(path.resolve("scripts/validar.mjs"), "utf8").includes("escaleraFirmas.test.ts"));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ ESCALERA×FIRMAS: ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
