/**
 * tests/motorRecuperacion.test.ts — RECOVERY ENGINE (v1.35.0 · FASE 5)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/motorRecuperacion.test.ts
 *
 * Hoja de ruta §5/§17: la detección del bucle CAMBIA la estrategia sola. Se
 * prueba la escalera 2.0, la firma de tarea (incluye estrategia+estado), y que
 * al repetir el MISMO enfoque el motor escale 2→cambiar táctica, 3→rollback,
 * 4→investigar arquitectura, 5→bloqueo, y respete el perfil configurable.
 * Además la capa de transacción (§23): commit/rollback restaura el estado sano.
 */
import {
  ESCALERA,
  firmaTarea,
  firmaEnfoque,
  registrarYdecidir,
  reiniciarRecuperacion,
  formatearBloqueo,
  directivaDeRecuperacion,
  PERFILES,
} from "../src/engine/motorRecuperacion";
import { iniciar, aplicar, confirmar, revertir, anotarEvidencia, transaccionAParte } from "../src/engine/capaTransaccion";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. La escalera 2.0 tiene 5 niveles con estrategia");
{
  comprobar("nivel 0 es corrección local", ESCALERA[0].nombre === "corrección local" && ESCALERA[0].pasos.length > 0);
  comprobar("nivel 2 es rollback", ESCALERA[2].nombre === "rollback");
  comprobar("nivel 4 es bloqueo con causa/evidencia", /causa/.test(ESCALERA[4].pasos.join(" ")));
}

seccion("2. La firma de tarea distingue estrategia y estado");
{
  const a = firmaTarea({ objetivo: "crear login", archivos: ["a.ts"], error: "Cannot find module x", estrategia: "reinstalar", estado: "reparar" });
  const b = firmaTarea({ objetivo: "crear login", archivos: ["a.ts"], error: "Cannot find module x", estrategia: "reescribir import", estado: "reparar" });
  comprobar("cambiar la estrategia cambia la firma de tarea", a !== b);
  const eA = firmaEnfoque({ objetivo: "crear login", archivos: ["a.ts"], error: "Cannot find module x", estrategia: "reinstalar" });
  const eB = firmaEnfoque({ objetivo: "crear login", archivos: ["a.ts"], error: "Cannot find module x", estrategia: "reescribir import" });
  comprobar("el enfoque IGNORA la estrategia (mismo problema)", eA === eB);
  comprobar("la firma de error normaliza la línea", firmaEnfoque({ objetivo: "x", error: "Cannot find module x at line 12" }) === firmaEnfoque({ objetivo: "x", error: "Cannot find module x at line 88" }));
}

seccion("3. Repetir el mismo enfoque escala la acción (perfil base)");
{
  reiniciarRecuperacion();
  const t = { objetivo: "arreglar overflow", archivos: ["Modal.tsx"], error: "overflow en móvil" };
  const d1 = registrarYdecidir(t, "base");
  comprobar("1ª vez → continuar (nivel 0)", d1.accion === "continuar" && d1.nivel === 0);
  const d2 = registrarYdecidir(t, "base");
  comprobar("2ª → cambiar_tactica", d2.accion === "cambiar_tactica");
  comprobar("2ª marca misma estrategia", d2.mismaEstrategia === true);
  const d3 = registrarYdecidir(t, "base");
  comprobar("3ª → rollback", d3.accion === "rollback" && d3.nivel === 2);
  const d4 = registrarYdecidir(t, "base");
  comprobar("4ª → investigar_arquitectura", d4.accion === "investigar_arquitectura" && d4.nivel === 3);
  const d5 = registrarYdecidir(t, "base");
  comprobar("5ª → bloquear (nivel 4)", d5.accion === "bloquear" && d5.nivel === 4);
  comprobar("la directiva grita CHANGE_STRATEGY", /CHANGE_STRATEGY/.test(directivaDeRecuperacion(d2)));
}

seccion("4. Umbrales configurables por perfil");
{
  reiniciarRecuperacion();
  const t = { objetivo: "x", error: "e" };
  registrarYdecidir(t, "agresivo");
  const d2 = registrarYdecidir(t, "agresivo");
  comprobar("agresivo escala en 2 a rollback", d2.accion === "rollback");
  comprobar("perfil paciente existe y es más tolerante", PERFILES.paciente.bloquear === 9);
}

seccion("5. Bloqueo honesto: el parte al humano");
{
  const p = formatearBloqueo({ causa: "dependencia inexistente", evidencia: "npm i falla: 404", estrategiasProbadas: ["reescribir import", "reinstalar"], alternativas: ["usar fetch nativo"], decisionRequerida: "¿cambiamos de librería?" });
  comprobar("el parte lista causa/evidencia/estrategias/decisión", /causa:/.test(p) && /evidencia:/.test(p) && /estrategias probadas:/.test(p) && /decisión requerida:/.test(p));
}

seccion("6. Transacción §23: commit confirma, rollback restaura el estado sano");
{
  const mundo = new Map<string, string>([["a.ts", "viejo"]]);
  const tx = iniciar();
  aplicar(tx, mundo, { ruta: "a.ts", contenido: "nuevo" });
  aplicar(tx, mundo, { ruta: "b.ts", contenido: "recién creado" });
  comprobar("mundo mutado en caliente", mundo.get("a.ts") === "nuevo" && mundo.get("b.ts") === "recién creado");
  anotarEvidencia(tx, "tests: 3 failed");
  comprobar("commit no procede si !ok", confirmar(tx, false) === false);
  revertir(tx, mundo);
  comprobar("rollback restaura a.ts al valor sano", mundo.get("a.ts") === "viejo");
  comprobar("rollback borra b.ts (no existía)", !mundo.has("b.ts"));
  comprobar("el parte refleja el estado revertido", /revertida/.test(transaccionAParte(tx)));

  const mundo2 = new Map<string, string>([["a.ts", "v0"]]);
  const tx2 = iniciar();
  aplicar(tx2, mundo2, { ruta: "a.ts", contenido: "v1" });
  comprobar("commit ok confirma y conserva el cambio", confirmar(tx2, true) === true && mundo2.get("a.ts") === "v1");
}

console.log("\n" + "\u2500".repeat(58));
if (fallos.length === 0) console.log(`\u2550\u2550\u2550 MOTOR DE RECUPERACIÓN: ${correctas} correctas · 0 fallidas \u2550\u2550\u2550`);
else { console.log(`\u2550\u2550\u2550 MOTOR DE RECUPERACIÓN: ${correctas} correctas · ${fallos.length} FALLIDAS \u2550\u2550\u2550`); fallos.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
