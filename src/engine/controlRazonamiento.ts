/**
 * controlRazonamiento.ts — EL MOTOR DECIDE EL PRÓXIMO MOVIMIENTO (v1.33.0 · FASE 3)
 * ====================================================================================
 * QUÉ ES: el Reasoning Controller de la hoja de ruta (§6) en su slice honesta
 * de esta fase. No genera código — NO lo hace: recibe señales del juez
 * (error, fase, escalón, contrato, plan) y DEVUELVE la secuencia que el agente
 * debe seguir, con prohibiciones explícitas. El ejemplo del §6 está resuelto
 * como mecánica: «Cannot find module X» → inspeccionar package.json →
 * node_modules → lockfile → dependencia runtime → instalar/build → SOLO
 * después modificar código.
 *
 * REGLA ARQUITECTÓNICA §19 (herramientas deterministas primero), que este
 * módulo enuncia como política medible:
 *   · nivel "sin_modelo" — la pregunta se responde con fs/tsc/socket/hash y
 *     NO debe gastar tokens;
 *   · nivel "bajo"  — inspección/lectura con micro o plantilla;
 *   · nivel "alto"  — diseño, diagnóstico ambiguo, arquitectura.
 * El mapa no reemplaza a modelTiers (que elige QUÉ MODELO carga): este elige
 * QUÉ HACER antes de llamar a ningún modelo. Son capas distintas por diseño.
 *
 * CERO VERDADAS DUPLICADAS: la clasificación del error la hace
 * reconocimientoError (clase + causa raíz + anti-patrón); el escalón lo fija
 * bucleAutonomo; el contrato lo guarda planAdaptativo. Este módulo SOLO ordena
 * la secuencia de movimiento a partir de lo que esos tres ya dijeron.
 */

import { contextoError, diagnosticoRaiz, type ClaseError } from "./reconocimientoError";

export type NivelRazon = "sin_modelo" | "bajo" | "alto";

export interface ProximoMovimiento {
  accion:
    | "inspeccionar"        // leer disco/config antes de tocar nada
    | "ejecutar_determinista" // la resuelve una herramienta, no el modelo
    | "modificar_codigo"
    | "verificar"           // build/test/lectura de prueba
    | "replantear"         // presupuesto o escalón agotado: otro enfoque
    | "bloquear";          // decisión humana
  razon: string;
  herramienta_sugerida: string;
  /** Pasos de inspección en orden (§6). Vacío si no aplican. */
  orden_lectura: string[];
  /** Cosas PROHIBIDAS en este momento (anti-patrón del §6). */
  prohibiciones: string[];
  nivel: NivelRazon;
}

export interface SenalControlador {
  error?: string | null;
  fase?: "crear" | "modificar" | "reparar" | "investigar" | "verificar" | "continuar";
  escalon?: number;
  contratoAbierto?: boolean;
  presupuestoAgotado?: boolean;
}

/** §19: preguntas que tienen respuesta determinista — el modelo NO las gasta. */
export const DETERMINISTAS: Array<{ pregunta: RegExp; herramienta: string; razon: string }> = [
  { pregunta: /¿?existe(n|rá)?\b.*archivo|archivo existe|está el archivo/i, herramienta: "fs.exists / list_files", razon: "la existencia se mide en disco, no se razona" },
  { pregunta: /compila|typecheck|tsc/i, herramienta: "tsc --noEmit", razon: "el compilador es la autoridad de compilación (§30)" },
  { pregunta: /hay (la )?dependencia|instalad[oa]|package\.json/i, herramienta: "read_file package.json + fs node_modules", razon: "la salud de dependencias se lee, no se imagina" },
  { pregunta: /contraste|wcag/i, herramienta: "algoritmo de contraste", razon: "aritmética de luminancia" },
  { pregunta: /idéntic|igual\b.*hash|cambió el archivo/i, herramienta: "SHA256/mtime", razon: "la igualdad se mide" },
  { pregunta: /ruta segura|traversal|realpath/i, herramienta: "fs.realpath", razon: "la contención la decide el SO" },
  { pregunta: /puerto.{0,18}(abierto|ocupado|tomado|escuchando|libre)/i, herramienta: "socket connect", razon: "un bind/conn dice la verdad en 1 ms" },
  { pregunta: /pasa(n|ón)? (los )?tests?/i, herramienta: "runner de tests", razon: "el test runner manda, no la prosa" },
];

export function esDeterminista(pregunta: string): { sio: boolean; herramienta?: string; razon?: string } {
  for (const d of DETERMINISTAS) {
    if (d.pregunta.test(pregunta)) return { sio: true, herramienta: d.herramienta, razon: d.razon };
  }
  return { sio: false };
}

/** LA SECUENCIA por clase de error — el §6 convertido en tabla. */
function rutaImport(error: string, ctx: ReturnType<typeof contextoError>): ProximoMovimiento {
  const diag = diagnosticoRaiz(ctx.clase, ctx.modulo);
  const mod = ctx.modulo || "X";
  const esExterno = !/^\.{1,2}\//.test(mod) && !mod.startsWith("/");
  return {
    accion: "inspeccionar",
    razon: `import no resuelto (${mod}): la causa estadística no es el import, es la instalación`,
    herramienta_sugerida: "read_file",
    orden_lectura: esExterno
      ? ["package.json: ¿está «" + mod + "» declarado?",
         "node_modules/" + mod.split("/")[0] + ": ¿existe de verdad?",
         "package-lock.json / pnpm-lock: ¿el lock lo conoce?",
         "¿dependencia runtime o dev? (si es runtime, npm i; si es dev, revisar tsconfig/vite)",
         "run_command: npm install / npm run build — DESPUÉS reintentar, no antes"]
      : ["el destino relativo apunta a: " + mod, "fs: ¿existe ese archivo con ese nombre EXACTO? (list_files)", "¿index/extensiones? leer importChecker lo resuelve", "recién ahí: corregir el import o crear el archivo"],
    prohibiciones: esExterno
      ? ["NO reescribir el import (misma línea ⇄ variantes) sin haber leído package.json/node_modules",
         "NO tocar el código fuente antes del paso 5",
         "NO suponer que el paquete «debería estar» instalado"]
      : ["NO reescribir el import sin comprobar el destino en disco", "NO crear un stub a ciegas antes de listar"],
    nivel: "bajo",
  };
}

/** El clasificador de la casa a veces enruta ETIMEDOUT/EACCES/"Unexpected token"
 * como runtime o desconocido: la POLITICA del controlador los re-lee del texto
 * sin tocar reconocimientoError (fuente única de la FIRMA, no de la ruta). */
function casoEfectivo(clase: ClaseError, error: string): string {
  if (clase === "sintaxis" || clase === "tipo" || clase === "referencia" || clase === "import-no-resuelto" || clase === "modulo-no-encontrado") return clase;
  if (/\bETIMEDOUT\b|timed out|deadline exceeded/i.test(error)) return "timeout";
  if (/\bEACCES\b|\bEPERM\b|permission denied/i.test(error)) return "permiso";
  if (/Unexpected token|Parse error|SyntaxError:|missing (?:\) \{|\)|\})/i.test(error)) return "sintaxis";
  return clase;
}
function archivoCitado(error: string): string | null {
  const m = error.match(/([\w./\\-]+\.[tj]sx?|vue|svelte)?:\d+/i);
  const m2 = error.match(/at\s+([\w./\\-]+\.[tj]sx?)/i);
  return (m && m[1]) || (m2 && m2[1]) || null;
}

function rutaOtra(clase: ClaseError, ctx: ReturnType<typeof contextoError>, error: string): ProximoMovimiento {
  switch (casoEfectivo(clase, error)) {
    case "sintaxis":
      return { accion: "modificar_codigo", razon: `error de sintaxis en ${ctx.archivo || archivoCitado(error) || "?"}`, herramienta_sugerida: "edit_file", orden_lectura: [`${ctx.archivo || archivoCitado(error) || "?"} alrededor de la línea citada`], prohibiciones: ["NO reescribir el archivo entero por un error localizado (auditoría de preservación ≥35%)"], nivel: "bajo" };
    case "tipo":
      return { accion: "verificar", razon: `discrepancia de tipos${ctx.modulo ? ` (${ctx.modulo})` : ""}: el compilador manda`, herramienta_sugerida: "run_command", orden_lectura: ["tsc --noEmit para el mensaje COMPLETO (no el primero que se ve)", "leer la línea exacta citada"], prohibiciones: ["NO «arreglar» con cast/cualquiera sin entender la discrepancia"], nivel: "bajo" };
    case "referencia":
      return { accion: "modificar_codigo", razon: `símbolo inexistente (${ctx.modulo || "?"}): falta o se fue al refactor`, herramienta_sugerida: "read_file", orden_lectura: ["dónde se define ese símbolo (grep/read)", "quién lo usaba antes (grafo.impactoDe si existe el contrato)"], prohibiciones: ["NO reinstalar el símbolo sin verificar por qué desapareció (regresión)"], nivel: "bajo" };
    case "runtime":
      return { accion: "inspeccionar", razon: `excepción ${ctx.modulo || "de runtime"}: reproducir antes de tocar`, herramienta_sugerida: "run_command", orden_lectura: ["reproducir con la menor entrada que dispara el fallo", "añadir log/lectura del estado que la excepción nombra"], prohibiciones: ["NO «arreglar» con try/catch envolvente sin diagnóstico (§16 memoria negativa)"], nivel: "alto" };
    case "timeout":
      return { accion: "ejecutar_determinista", razon: "operación que excede tiempo: medir, no argumentar", herramienta_sugerida: "run_command", orden_lectura: ["cuánto tarda de verdad (time/fecha)", "qué recurso agota (puerto, disco, red)"], prohibiciones: ["NO reintentar idéntico sin cambiar parámetros"], nivel: "sin_modelo" };
    case "permiso":
      return { accion: "bloquear", razon: "permisos/credenciales no se negocian con sudo de corazón (§25)", herramienta_sugerida: "—", orden_lectura: [], prohibiciones: ["NO escalar permisos sin decisión humana explícita"], nivel: "sin_modelo" };
    default:
      return { accion: "inspeccionar", razon: `error sin clase reconocida; el texto manda: ${(error || "").slice(0, 80)}`, herramienta_sugerida: "read_file", orden_lectura: ["leer el archivo/línea que el propio error cita si las hay", "list_files del directorio"], prohibiciones: ["NO modificar código sin al menos una lectura de contexto"], nivel: "bajo" };
  }
}

/**
 * LA DECISIÓN. Escalón 3 de la escalera (v1.31) y presupuesto agotado (v1.32)
 * mandan sobre la ruta del error: si el método actual ya subió todos los
 * peldaños, el movimiento correcto es REPLANTEAR, no la sexta variante del
 * mismo parche. Eso es §5 nivel 3-4 y §21 (progreso cero) hechos mecánica.
 */
export function decidirProxima(senal: SenalControlador): ProximoMovimiento | null {
  if (senal.presupuestoAgotado) {
    return { accion: "replantear", razon: "presupuesto de la tarea agotado: otro enfoque o declarar el bloqueo con causa", herramienta_sugerida: "set_plan", orden_lectura: [], prohibiciones: ["NO volver a intentar el mismo camino con otra redacción"], nivel: "alto" };
  }
  if ((senal.escalon ?? 0) >= 3) {
    return { accion: "replantear", razon: "la escalera ya subió al peldaño 3: reconstruir lo mínimo o investigar la arquitectura — no parchear más", herramienta_sugerida: "read_file", orden_lectura: ["qué bloque mínimo funciona y puede mantenerse en pie solo", "qué dependencia estructural hace frágil el camino actual"], prohibiciones: ["NO otro micro-parche sobre el mismo enfoque", "NO ampliar el presupuesto sin medir progreso (§21)"], nivel: "alto" };
  }
  if (!senal.error || !senal.error.trim()) return null;
  const ctx = contextoError(senal.error);
  const base = ctx.clase === "import-no-resuelto" ? rutaImport(senal.error, ctx) : rutaOtra(ctx.clase, ctx, senal.error);
  if (senal.contratoAbierto && base.accion !== "bloquear" && !base.prohibiciones.some((x) => /contrato/.test(x))) {
    base.prohibiciones.push("el contrato de aceptación está abierto: cerrar el turno requiere evidencia por criterio");
  }
  return base;
}

/** El texto que bucleAutonomo inyecta al modelo junto con la escalera. */
export function directivaDeMovimiento(m: ProximoMovimiento): string {
  const partes = [`PRÓXIMO MOVIMIENTO DECIDIDO POR EL MOTOR (${m.accion} · razon: ${m.razon} · nivel: ${m.nivel} · herramienta: ${m.herramienta_sugerida})`];
  if (m.orden_lectura.length) partes.push("secuencia obligatoria antes de tocar código: " + m.orden_lectura.map((p, i) => `${i + 1}) ${p}`).join(" · "));
  if (m.prohibiciones.length) partes.push("PROHIBIDO ahora: " + m.prohibiciones.join(" · "));
  return partes.join("\n");
}
