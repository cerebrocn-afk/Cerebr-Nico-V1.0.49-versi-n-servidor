/**
 * src/gestorArboles.ts — v1.60.0 · GESTOR DEL DOBLE ÁRBOL DE ARCHIVOS
 * =============================================================================
 * Fuente ÚNICA de verdad del workspace: un mapa `ruta -> NodoArchivo`. Las dos
 * proyecciones (entrada / sandbox) se derivan del flag `incluidoEnSandbox`, de
 * modo que NUNCA hay dos copias del mismo archivo que puedan divergir.
 *
 * Capa PURA: sin red, sin disco, sin estado global. Se le puede inyectar un
 * reloj (`registradoEn`) para que las pruebas sean deterministas.
 *
 * Reglas de enrutamiento (lo que el motor debe respetar):
 *   · Lo que entra por chat/explorador aterriza en ENTRADA, FUERA del sandbox.
 *   · El motor debe PROMOVER explícitamente un archivo al sandbox antes de
 *     leerlo/escribirlo como obra (salvo `sandbox_target`, que se auto-promueve).
 *   · El guardían `validarPermisoEscrituraSandbox` bloquea escrituras sobre
 *     archivos que existen en entrada pero no se promovieron: eso evita que el
 *     motor pise material del usuario que aún no es parte de la obra.
 */

import type {
  AltaArchivoEntrada,
  EstadoArboles,
  NodoArchivo,
  PermisoEscritura,
} from "./types/arboles";

/**
 * Canoniza una ruta relativa: separador `/`, sin `./` ni `/` inicial, sin
 * segmentos vacíos ni `.`. NO resuelve `..` — eso es trabajo del confinamiento
 * anti-traversal de la capa de disco; aquí solo se normaliza la forma.
 */
export function canonizarRuta(ruta: string): string {
  return String(ruta || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .split("/")
    .filter((seg) => seg !== "" && seg !== ".")
    .join("/");
}

/** Hoja (último segmento) de una ruta canonizada. */
export function nombreHoja(rutaCanonica: string): string {
  const partes = rutaCanonica.split("/");
  return partes[partes.length - 1] || rutaCanonica;
}

/**
 * Huella determinista del contenido (djb2 de 32 bits, hex). No es criptográfica
 * — solo sirve para detectar si el contenido cambió entre registros, sin pagar
 * el coste ni la dependencia de `crypto`.
 */
export function hashContenido(contenido: string): string {
  let h = 5381;
  const s = String(contenido);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

/** Bytes UTF-8 de una cadena (sin depender de Buffer para que sea portable). */
function bytesUtf8(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++; // par suplente: consume dos unidades, cuenta 4 bytes
    } else n += 3;
  }
  return n;
}

export class GestorArboles {
  /** Fuente única: ruta canonica -> nodo. */
  private readonly nodos = new Map<string, NodoArchivo>();

  /**
   * Registra (o actualiza) un archivo en el árbol de ENTRADA. Si el origen es
   * `sandbox_target`, el archivo se auto-promueve al sandbox de inmediato.
   * Si la ruta ya existía, se conserva su pertenencia al sandbox (no se expulsa
   * por actualizar el contenido).
   */
  registrarArchivoEntrada(alta: AltaArchivoEntrada): NodoArchivo {
    const pathRelativo = canonizarRuta(alta.pathRelativo);
    if (!pathRelativo) {
      throw new Error("gestorArboles: ruta vacía al registrar en entrada");
    }
    const previo = this.nodos.get(pathRelativo);
    const contenido = String(alta.contenido ?? "");
    const incluidoEnSandbox =
      alta.origen === "sandbox_target" ? true : previo?.incluidoEnSandbox ?? false;
    const nodo: NodoArchivo = {
      pathRelativo,
      nombre: nombreHoja(pathRelativo),
      contenido,
      origen: alta.origen,
      incluidoEnSandbox,
      hashUltimaModificacion: hashContenido(contenido),
      bytes: bytesUtf8(contenido),
      registradoEn: alta.registradoEn ?? Date.now(),
    };
    this.nodos.set(pathRelativo, nodo);
    return nodo;
  }

  /**
   * Promueve un archivo ya registrado al sandbox. Devuelve `true` si cambió de
   * estado, `false` si la ruta no existe o ya estaba dentro.
   */
  promoverASandbox(pathRelativo: string): boolean {
    const ruta = canonizarRuta(pathRelativo);
    const nodo = this.nodos.get(ruta);
    if (!nodo || nodo.incluidoEnSandbox) return false;
    nodo.incluidoEnSandbox = true;
    return true;
  }

  /**
   * Saca un archivo del sandbox (sigue existiendo en entrada). Devuelve `true`
   * si cambió de estado.
   */
  expulsarDeSandbox(pathRelativo: string): boolean {
    const ruta = canonizarRuta(pathRelativo);
    const nodo = this.nodos.get(ruta);
    if (!nodo || !nodo.incluidoEnSandbox) return false;
    nodo.incluidoEnSandbox = false;
    return true;
  }

  /** ¿Está esta ruta registrada en algún árbol? */
  existe(pathRelativo: string): boolean {
    return this.nodos.has(canonizarRuta(pathRelativo));
  }

  /** Nodo crudo por ruta (o `undefined`). */
  obtenerNodo(pathRelativo: string): NodoArchivo | undefined {
    return this.nodos.get(canonizarRuta(pathRelativo));
  }

  /** Árbol de ENTRADA: TODO lo registrado, ordenado por ruta. */
  obtenerArbolEntrada(): NodoArchivo[] {
    return [...this.nodos.values()].sort((a, b) =>
      a.pathRelativo < b.pathRelativo ? -1 : a.pathRelativo > b.pathRelativo ? 1 : 0
    );
  }

  /** Árbol de SANDBOX: solo lo promovido, ordenado por ruta. */
  obtenerArbolSandbox(): NodoArchivo[] {
    return this.obtenerArbolEntrada().filter((n) => n.incluidoEnSandbox);
  }

  /** Alias compacto usado por el ejemplo del chat. */
  obtenerSandbox(): NodoArchivo[] {
    return this.obtenerArbolSandbox();
  }

  /** Estado completo (ambas proyecciones) en una sola foto. */
  obtenerEstado(): EstadoArboles {
    return {
      entrada: this.obtenerArbolEntrada(),
      sandbox: this.obtenerArbolSandbox(),
    };
  }

  /** Cuántos archivos hay en cada proyección. */
  tamanos(): { entrada: number; sandbox: number } {
    let sandbox = 0;
    for (const n of this.nodos.values()) if (n.incluidoEnSandbox) sandbox++;
    return { entrada: this.nodos.size, sandbox };
  }
}

/**
 * GUARDÍAN DE ESCRITURA DEL SANDBOX.
 *
 * El motor solo puede escribir en rutas que el sandbox ampara. Hay tres casos:
 *   · La ruta está en el sandbox            -> PERMITIDO.
 *   · La ruta NO está registrada en nada    -> PERMITIDO (archivo nuevo de obra;
 *     la capa de disco lo creará y deberá registrarse como `sandbox_target`).
 *   · La ruta existe en ENTRADA pero NO se promovió -> DENEGADO: es material del
 *     usuario fuera de la obra; pisarlo filtraría/corrompería contexto ajeno.
 */
export function validarPermisoEscrituraSandbox(
  gestor: GestorArboles,
  pathRelativo: string
): PermisoEscritura {
  const ruta = canonizarRuta(pathRelativo);
  if (!ruta) {
    return { permitido: false, motivo: "Ruta vacía: no hay destino de escritura." };
  }
  const nodo = gestor.obtenerNodo(ruta);
  if (!nodo) {
    return { permitido: true, motivo: "" }; // archivo nuevo de obra
  }
  if (nodo.incluidoEnSandbox) {
    return { permitido: true, motivo: "" };
  }
  return {
    permitido: false,
    motivo:
      `El archivo "${ruta}" existe en el árbol de ENTRADA pero no se promovió al ` +
      `sandbox. Usa la herramienta promover_archivo_sandbox antes de escribirlo, ` +
      `o deja que el usuario lo manipule: el motor no pisa material fuera de la obra.`,
  };
}

/**
 * GUARDÍAN DE LECTURA DEL SANDBOX (v1.60.3).
 *
 * El aislamiento de contexto es de ida y vuelta: si el motor no debe ESCRIBIR
 * material de entrada no promovido, tampoco debe LEERLO hacia su contexto (sería
 * la fuga que el doble árbol existe para evitar). Mismas tres reglas que el
 * guardián de escritura:
 *   · ruta en sandbox            -> PERMITIDO.
 *   · ruta NO registrada         -> PERMITIDO (archivo del proyecto que el ciclo
 *     aún no conoce; la capa de disco decide su existencia real).
 *   · ruta en ENTRADA sin promover -> DENEGADO: es material del usuario que no
 *     entró a la obra; no se carga a contexto.
 */
export function validarPermisoLecturaSandbox(
  gestor: GestorArboles,
  pathRelativo: string
): PermisoEscritura {
  const ruta = canonizarRuta(pathRelativo);
  if (!ruta) {
    return { permitido: false, motivo: "Ruta vacía: no hay origen de lectura." };
  }
  const nodo = gestor.obtenerNodo(ruta);
  if (!nodo || nodo.incluidoEnSandbox) {
    return { permitido: true, motivo: "" };
  }
  return {
    permitido: false,
    motivo:
      `El archivo "${ruta}" está en el árbol de ENTRADA pero no se promovió al ` +
      `sandbox: no se carga a tu contexto. Si lo necesitas para la obra, llámalo ` +
      `con promover_archivo_sandbox primero.`,
  };
}

/**
 * Compone un bloque legible del ÁRBOL DE SANDBOX para inyectar al contexto del
 * modelo: SOLO lo promovido, con ruta y tamaño. Así el motor «ve» exactamente
 * el universo que tiene derecho a tocar, sin ruido del árbol de entrada.
 */
export function componerContextoSandbox(gestor: GestorArboles, max = 200): string {
  const sandbox = gestor.obtenerArbolSandbox();
  if (sandbox.length === 0) {
    return "SANDBOX (contexto del motor): vacío — aún no se promovió ningún archivo a la obra.";
  }
  const visibles = sandbox.slice(0, max);
  const lineas = visibles.map((n) => `  · ${n.pathRelativo} (${n.bytes} B)`);
  const resto = sandbox.length - visibles.length;
  const cola = resto > 0 ? `\n  … y ${resto} archivo(s) más en el sandbox` : "";
  return `SANDBOX (contexto del motor) — ${sandbox.length} archivo(s):\n${lineas.join("\n")}${cola}`;
}
