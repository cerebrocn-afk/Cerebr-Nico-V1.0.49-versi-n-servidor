// v1.60.5 · DOBLE ÁRBOL VISIBLE EN EL EXPLORADOR
//
// El motor ya separa internamente (src/gestorArboles.ts, por turno) el árbol de
// ENTRADA (material que el usuario aporta como contexto — el motor NO lo toca
// hasta promoverlo) del árbol de SANDBOX (la obra que el motor puede leer y
// escribir). Pero eso vivía SOLO en el motor: en la interfaz no se veía, por eso
// al abrir la app "no estaban los dos árboles". Este módulo lleva ESE MISMO
// concepto al explorador, de forma VISIBLE y sin red ni estado global: cada
// archivo del workspace se clasifica y se le pone una insignia, y el usuario
// puede PROMOVER un archivo de entrada al sandbox con un botón.
//
// Regla de clasificación (espeja al motor, honesta): un archivo es "entrada"
// solo si se marcó explícitamente así (lo trae la aduana de adjuntos del
// usuario). Todo lo demás —plantilla, código generado por el agente, archivos
// creados a mano en el explorador— es la obra, o sea "sandbox". Así, por
// defecto, lo que entra como contexto queda FUERA del sandbox hasta promoverse,
// igual que en `gestorArboles`.
//
// Funciones PURAS: sin red, sin fs, sin estado global.

export type ArbolTipo = "entrada" | "sandbox";

/** Lo mínimo que necesitamos de un archivo para clasificarlo. */
export interface ArchivoClasificable {
  id?: string;
  arbol?: ArbolTipo;
}

/**
 * Clasifica un archivo en su árbol. Si trae `arbol` explícito, manda ese;
 * si no, se infiere "sandbox" (parte de la obra). Nunca lanza.
 */
export function inferirArbol(file: ArchivoClasificable | null | undefined): ArbolTipo {
  return file && file.arbol === "entrada" ? "entrada" : "sandbox";
}

export interface InsigniaArbol {
  tipo: ArbolTipo;
  icono: string;
  etiqueta: string;
  titulo: string;
  /** clases Tailwind para el pill (color de fondo/texto/borde). */
  clases: string;
}

/** Metadatos de presentación para pintar la insignia del árbol en la UI. */
export function insigniaArbol(tipo: ArbolTipo): InsigniaArbol {
  if (tipo === "entrada") {
    return {
      tipo,
      icono: "📥",
      etiqueta: "Entrada",
      titulo:
        "Árbol de ENTRADA: material de contexto/referencia que aportaste. El " +
        "motor NO lo edita hasta que lo promuevas al sandbox.",
      clases: "bg-amber-500/10 text-amber-300 border border-amber-500/30",
    };
  }
  return {
    tipo,
    icono: "🏗️",
    etiqueta: "Sandbox",
    titulo:
      "Árbol de SANDBOX: parte de la obra. El motor puede leerlo y escribirlo " +
      "durante el turno.",
    clases: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30",
  };
}

export interface ConteoArboles {
  entrada: number;
  sandbox: number;
  total: number;
}

/** Cuenta cuántos archivos hay en cada árbol (para la cabecera del explorador). */
export function contarArboles(files: ReadonlyArray<ArchivoClasificable>): ConteoArboles {
  let entrada = 0;
  let sandbox = 0;
  for (const f of files || []) {
    if (inferirArbol(f) === "entrada") entrada++;
    else sandbox++;
  }
  return { entrada, sandbox, total: entrada + sandbox };
}

/**
 * Marca una lista de archivos como "entrada" (lo usa la aduana de adjuntos del
 * usuario). Devuelve una copia — no muta la entrada. Genera el campo solo si no
 * lo traían, para no pisar una clasificación ya decidida por el usuario.
 */
export function marcarComoEntrada<T extends ArchivoClasificable>(files: ReadonlyArray<T>): T[] {
  return (files || []).map((f) => (f.arbol ? f : { ...f, arbol: "entrada" as const }));
}

/**
 * Promueve un archivo (por id) al sandbox: lo vuelve parte de la obra editable.
 * Pura: devuelve una copia del array con ese archivo en "sandbox". Si el id no
 * existe o ya estaba en sandbox, devuelve el array equivalente sin cambios de
 * clasificación (idempotente).
 */
export function promoverArchivo<T extends ArchivoClasificable>(
  files: ReadonlyArray<T>,
  id: string
): T[] {
  return (files || []).map((f) =>
    f.id === id ? { ...f, arbol: "sandbox" as const } : f
  );
}

/**
 * Opuesto de promover: devuelve un archivo al árbol de entrada (lo saca del
 * sandbox para que el motor deje de poder editarlo). Pura e idempotente.
 */
export function expulsarArchivo<T extends ArchivoClasificable>(
  files: ReadonlyArray<T>,
  id: string
): T[] {
  return (files || []).map((f) =>
    f.id === id ? { ...f, arbol: "entrada" as const } : f
  );
}
