/**
 * nombreArchivo.ts · CÓMO SE LLAMA UNA PIEZA DE LA MEMORIA (v1.99.5)
 * =================================================================
 * Está separado porque lo necesitan DOS mundos:
 *   · `cerebroOrgano.aprender`, que escribe el archivo;
 *   · `arraigo`, que planifica y mide sin tocar disco.
 * Si cada uno tuviera su propia fórmula, el asiento predicho por el plano podría no ser el
 * nombre real del archivo — y entonces una pieza enraigada seguiría diciendo `deuda` para
 * siempre. Es el mismo defecto de siempre con otra cara: dos dueños para una verdad.
 *
 * Puro: cuerdas, sin fs ni reloj.
 */

/** slug corto y seguro para nombre de archivo (sin acentos ni símbolos). */
export function slug(texto: string, maxLen = 40): string {
  const base = String(texto || "nota")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return base || "nota";
}

/** El `id` del índice — y el stem del archivo. `sello` va ya slugeado por quien lo calcula. */
export function idDeEntrada(tema: string, titulo: string, sello: string): string {
  return `${slug(tema)}-${slug(titulo)}-${sello}`;
}

/**
 * El asiento de una pieza: `temas/<tema>-<titulo>-<ancla>.md`. Con ancla determinista el nombre
 * no depende del azar ni de la máquina, así que el mapa de hemisferios puede decir DÓNDE vive
 * lo que plantó (y el reflejo buscar el vector ahí).
 */
export function archivoDeEntrada(tema: string, titulo: string, ancla: string): string {
  return `temas/${idDeEntrada(tema, titulo, slug(ancla))}.md`;
}
