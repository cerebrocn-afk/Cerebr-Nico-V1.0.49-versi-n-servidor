/**
 * salidaProcesos.ts — LA CAUSA DE UN FALLO, NO SU PILA (extraído v1.16.3.1)
 * =========================================================================
 * QUÉ ES: el lector de salidas de procesos (builds, npm install, Vite) que
 * elige la línea que PARECE la causa esté donde esté. Movedizo tal cual desde
 * el monolito server.ts (Fase 2 «partir, no añadir») para liberar líneas al
 * trinquete con la llegada del router de Ollama (bajo consumo, §2.3).
 *
 * v1.6.26-DIAG — UN FALLO SIN SU MENSAJE NO SE PUEDE ARREGLAR
 * El motor capturaba la salida de un proceso con `.slice(-6)`: los seis
 * ÚLTIMOS renglones. En Vite/Rollup/esbuild el mensaje va ARRIBA y debajo
 * queda la pila, así que el log acababa mostrando «at ModuleScope.findVariable
 * · at Identifier.bind · …» y el motivo real se descartaba antes de llegar a
 * la pantalla. Ahora se eligen las líneas que PARECEN la causa estén donde
 * estén (arriba en Vite/esbuild, abajo en npm) y, si no hay ninguna, se toma
 * la CABEZA de la salida — nunca la cola.
 */

const LINEA_CAUSA =
  /(\[vite\]|\brollup\b|\bERROR\b|error during build|failed to resolve|could not resolve|cannot find|not found|is not defined|is not exported|MODULE_NOT_FOUND|ERR_|npm ERR!|ENOENT|EACCES|ETIMEDOUT|SyntaxError|Transform failed|✘)/i;

/**
 * v1.6.30 — ¿EL FALLO DEL BUILD ES DE CÓDIGO, O ES «LA IDE DENTRO DE LA IDE»?
 * ========================================================================
 * 🐞 El mensaje de error de la compilación mandaba SIEMPRE a la vía de salida
 * de la recursión («tenés la IDE dentro del sandbox, borrá todo y reimportá tu
 * app»). Con un error de CÓDIGO como este:
 *
 *   src/components/LeftSidebar.tsx (39:2): "loadLanguageMemories" is not
 *   exported by src/utils/languageMemory.ts
 *
 * esa guía hace perder el tiempo: el problema no es la recursión (que era
 * deliberada), es que un archivo del árbol NO coincide con el que lo importa.
 */
export function esErrorDeCodigoDelProyecto(detalle: string): boolean {
  return /(is not exported by|does not provide an export|Could not resolve|Failed to resolve import|Unexpected token|Parse error|SyntaxError|error during build)/i.test(
    String(detalle || "")
  );
}

export function detalleDeSalida(salida: unknown, max = 6): string {
  const lineas = String(salida ?? "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0) return "";
  const causas = lineas.filter((l) => LINEA_CAUSA.test(l));
  return (causas.length > 0 ? causas : lineas).slice(0, max).join(" · ");
}
