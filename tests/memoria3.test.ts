/**
 * tests/memoria3.test.ts — MEMORY 3.0: ADR + MEMORIA NEGATIVA (v1.40.0 · FASE 10)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/memoria3.test.ts
 *
 * Hoja de ruta §10: el sistema recuerda POR QUÉ decidió (ADR) y NO repite
 * enfoques ya fallidos (memoria negativa por firma — fuente única firmaError).
 */
import {
  libroVacio, registrarDecision, decisionVigente, conflictoCon, reemplazarDecision, parteADR,
} from "../src/engine/memoriaArquitectura";
import {
  registroVacio, anotarIntento, enfoquesGastados, debeEvitar, sugerenciaEvitando,
} from "../src/engine/memoriaNegativa";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. ADR: registrar y consultar la decisión vigente");
{
  const libro = libroVacio();
  const a = registrarDecision(libro, { tema: "base de datos", decision: "PostgreSQL", contexto: "relacional, transacciones", alternativas: ["MongoDB", "SQLite"] });
  comprobar("asigna id incremental", a.id === 1 && libro.siguienteId === 2);
  comprobar("queda aceptada", a.estado === "aceptada");
  comprobar("decisionVigente devuelve PostgreSQL", decisionVigente(libro, "Base De Datos")?.decision === "PostgreSQL");
  comprobar("tema no registrado → null", decisionVigente(libro, "cache") === null);
}

seccion("2. ADR: detecta contradicción ANTES de escribir código");
{
  const libro = libroVacio();
  registrarDecision(libro, { tema: "base de datos", decision: "PostgreSQL" });
  const c = conflictoCon(libro, "base de datos", "SQLite");
  comprobar("proponer SQLite contradice PostgreSQL", c !== null && c!.decision === "PostgreSQL");
  comprobar("proponer lo mismo no es conflicto", conflictoCon(libro, "base de datos", "postgresql") === null);
  comprobar("tema virgen no es conflicto", conflictoCon(libro, "frontend", "React") === null);
}

seccion("3. ADR: reemplazar deja rastro (supersede, no borra)");
{
  const libro = libroVacio();
  const viejo = registrarDecision(libro, { tema: "orm", decision: "Sequelize" });
  const nuevo = reemplazarDecision(libro, "orm", { decision: "Prisma", contexto: "tipado" });
  comprobar("el viejo queda reemplazada", viejo.estado === "reemplazada");
  comprobar("el nuevo apunta al viejo", nuevo?.reemplazaA === viejo.id);
  comprobar("vigente ahora es Prisma", decisionVigente(libro, "orm")?.decision === "Prisma");
  comprobar("el libro conserva ambos (rastro)", libro.registros.length === 2);
  comprobar("reemplazar tema inexistente → null", reemplazarDecision(libro, "nada", { decision: "x" }) === null);
  comprobar("el parte lista solo las vigentes", parteADR(libro).includes("Prisma") && !parteADR(libro).includes("Sequelize"));
}

seccion("4. Memoria negativa: no repetir lo que ya falló (por firma)");
{
  const reg = registroVacio();
  const err = "Cannot find module 'react-dom/client'";
  const errHermano = "Cannot find module 'react-dom'";  // MISMA firma (raíz react-dom)
  anotarIntento(reg, err, "reinstalar dependencia", "fallo");
  anotarIntento(reg, err, "reescribir el import", "fallo");
  comprobar("enfoquesGastados lista los 2 fallidos", enfoquesGastados(reg, err).length === 2);
  comprobar("la firma normaliza react-dom/client ≡ react-dom", enfoquesGastados(reg, errHermano).length === 2);
  comprobar("debeEvitar un enfoque ya fallido = true", debeEvitar(reg, errHermano, "reinstalar dependencia"));
  comprobar("debeEvitar un enfoque nuevo = false", !debeEvitar(reg, err, "añadir la dependencia al package.json"));
}

seccion("5. Memoria negativa: sugerir evitando lo quemado");
{
  const reg = registroVacio();
  const err = "ReferenceError: foo is not defined";
  anotarIntento(reg, err, "declarar foo local", "fallo");
  const s = sugerenciaEvitando(reg, err, ["declarar foo local", "importar foo del módulo correcto"]);
  comprobar("propone el enfoque nuevo, no el quemado", s.hayNuevo && s.enfoque === "importar foo del módulo correcto");
  comprobar("reporta los evitados", s.evitados.includes("declarar foo local"));
  const s2 = sugerenciaEvitando(reg, err, ["declarar foo local"]);
  comprobar("si todo está quemado → pide cambiar de estrategia", !s2.hayNuevo && /cambia de estrategia|escala/.test(s2.motivo));
  const exito = registroVacio();
  anotarIntento(exito, err, "lo que sea", "exito");
  comprobar("un éxito no cuenta como gastado", enfoquesGastados(exito, err).length === 0);
}

console.log("\n" + "\u2500".repeat(58));
console.log(`\u2550\u2550\u2550 MEMORY 3.0 (ADR + NEGATIVA): ${correctas} correctas \u00b7 ${fallos.length} ${fallos.length === 1 ? "FALLIDA" : "fallidas"} \u2550\u2550\u2550`);
if (fallos.length) { fallos.forEach((f) => console.log("  \u2717 " + f)); process.exit(1); }
