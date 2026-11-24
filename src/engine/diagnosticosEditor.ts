/**
 * diagnosticosEditor.ts — FASE 3 (v1.57.3) · LOS ERRORES REALES VUELVEN AL MODELO
 * ================================================================================
 * El salto que faltaba para que el agente "sepa" si rompió algo: tras cada
 * escritura el IDE corre `tsc` / los tests del sandbox, y esta capa convierte
 * esa SALIDA CRUDA en un bloque compacto y accionable para re-inyectar al modelo
 * — sin que el usuario copie nada a mano. Era literal el pedido de Mario:
 * "no reconoce herramientas, no maneja el sandbox" y "entrega código en el chat".
 *
 * No ejecuta nada (no toca disco, red ni DOM): recibe el texto que ya produjo
 * el compilador/los tests y devuelve datos. Se apoya en `reconocimientoError`
 * para clasificar, firmar y dar causa raíz — así el BUCLE anti-repetición
 * (bucleAutonomo + reconocimientoError) ve estos errores con el MISMO lenguaje
 * de firmas que los que llegan como herramienta. Pura: se prueba entera
 * (tests/diagnosticosEditor.test.ts).
 */
import { contextoError, firmaError, diagnosticoRaiz, type ClaseError } from "./reconocimientoError";

export interface DiagEditor {
  archivo: string | null;
  linea: number | null;
  columna: number | null;
  /** Código del compilador cuando existe («TS2345»); null en errores sin código. */
  codigo: string | null;
  severidad: "error" | "aviso";
  mensaje: string;
  clase: ClaseError;
  /** Firma estable (ignora línea/ruta exactas) para detectar repetición. */
  firma: string;
  /** Cuántas veces apareció el MISMO diagnóstico (deduplicado). */
  veces: number;
}

// tsc clásico:  src/App.tsx(2750,13): error TS2345: Argument of type…
const RE_TSC_CLASICO = /^\s*(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.*)$/;
// tsc "pretty": src/App.tsx:2750:13 - error TS2345: Argument of type…
const RE_TSC_PRETTY = /^\s*(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s*(.*)$/;

function normSev(s: string): "error" | "aviso" {
  return /warn/i.test(s) ? "aviso" : "error";
}

/** Un diagnóstico a partir de sus piezas, clasificado y firmado por la capa común. */
function armar(archivo: string | null, linea: number | null, columna: number | null, codigo: string | null, severidad: "error" | "aviso", mensaje: string): DiagEditor {
  const sintetico = `${archivo ?? ""}${linea != null ? `(${linea}${columna != null ? "," + columna : ""})` : ""}: ${severidad === "aviso" ? "warning" : "error"} ${codigo ?? ""}: ${mensaje}`.trim();
  const ctx = contextoError(sintetico);
  const archivoFinal = archivo ?? ctx.archivo;
  const lineaFinal = linea ?? ctx.linea;
  const columnaFinal = columna ?? ctx.columna;
  // La firma debe conocer el archivo real (el síntetico con paréntesis no lo
  // deja ver a `contextoError`): sin esto, dos errores de tipo en archivos
  // distintos colapsarían a la misma firma «tipo|».
  const firma = firmaError({ ...ctx, archivo: archivoFinal, linea: lineaFinal, columna: columnaFinal });
  return {
    archivo: archivoFinal,
    linea: lineaFinal,
    columna: columnaFinal,
    codigo,
    severidad,
    mensaje: (mensaje || ctx.mensaje || "").trim(),
    clase: ctx.clase,
    firma,
    veces: 1,
  };
}

/**
 * Lee la salida CRUDA de `tsc`/tests y saca la lista de diagnósticos, deduplicada
 * (mismo archivo+código+mensaje = una entrada con `veces`). Tolerante: si no hay
 * líneas de tsc reconocibles pero el texto trae un error (vite/node/sintaxis),
 * cae en `contextoError` sobre el bloque — nunca devuelve lista vacía ante un
 * error real, ni inventa uno cuando todo compiló.
 */
export function extraerDiagnosticos(salidaCruda: string): DiagEditor[] {
  const texto = String(salidaCruda ?? "");
  const lineas = texto.split(/\r?\n/);
  const porFirmaDeEntrada = new Map<string, DiagEditor>();

  const push = (d: DiagEditor) => {
    // Dedup por el contenido EXACTO (archivo+código+mensaje), no por la firma
    // normalizada: dos errores distintos del mismo archivo deben verse ambos.
    const clave = `${d.archivo}|${d.linea}|${d.codigo}|${d.mensaje}`;
    const ya = porFirmaDeEntrada.get(clave);
    if (ya) ya.veces += 1;
    else porFirmaDeEntrada.set(clave, d);
  };

  let huboTsc = false;
  for (const l of lineas) {
    let m = RE_TSC_CLASICO.exec(l) || RE_TSC_PRETTY.exec(l);
    if (m) {
      huboTsc = true;
      push(armar(m[1].trim(), Number(m[2]), Number(m[3]), m[5], normSev(m[4]), m[6]));
    }
  }

  if (!huboTsc) {
    // ¿hay señal de error aunque no sea tsc? (vite, node, sintaxis, test fallido)
    const pareceError = /\b(error|failed|cannot find|not defined|unexpected|SyntaxError|TypeError|ReferenceError|FALLOS?:|\u2717)\b/i.test(texto);
    if (pareceError && texto.trim()) {
      const ctx = contextoError(texto);
      push({
        archivo: ctx.archivo,
        linea: ctx.linea,
        columna: ctx.columna,
        codigo: null,
        severidad: "error",
        mensaje: ctx.mensaje,
        clase: ctx.clase,
        firma: firmaError(ctx),
        veces: 1,
      });
    }
  }

  return Array.from(porFirmaDeEntrada.values());
}

/** ¿La compilación quedó limpia? (sin ningún diagnóstico de severidad error). */
export function compilacionLimpia(salidaCruda: string): boolean {
  return extraerDiagnosticos(salidaCruda).every((d) => d.severidad !== "error");
}

/** Las firmas de esta tanda, para que el bucle anti-repetición las acumule. */
export function firmasDe(diags: DiagEditor[]): string[] {
  return diags.filter((d) => d.severidad === "error").map((d) => d.firma);
}

export interface OpcionesResumen {
  /** Cuántos diagnósticos listar al detalle (el resto se cuenta). */
  max?: number;
  /** Firmas de errores de turnos ANTERIORES, para avisar de bucle. */
  firmasPrevias?: string[];
}

/**
 * El bloque que se re-inyecta al modelo. Honesto y accionable:
 *   · dice CUÁNTOS errores reales encontró el editor (no el usuario);
 *   · lista archivo:línea código — mensaje, deduplicado y topado;
 *   · si una firma ya se vio en turnos previos, ADVIERTE del bucle y da la
 *     causa raíz + el anti-patrón (no reescribir lo mismo);
 *   · si todo compiló, lo dice en una línea — sin inventar trabajo.
 */
export function resumenParaModelo(diags: DiagEditor[], opciones: OpcionesResumen = {}): string {
  const max = opciones.max ?? 12;
  const errores = diags.filter((d) => d.severidad === "error");
  const avisos = diags.filter((d) => d.severidad === "aviso");

  if (errores.length === 0) {
    const cola = avisos.length ? ` (${avisos.length} aviso/s, no bloquean).` : "";
    return `[DIAGNÓSTICOS DEL EDITOR] Tu escritura COMPILA: el editor no encontró errores.${cola}`;
  }

  const prev = new Set(opciones.firmasPrevias ?? []);
  const enBucle = errores.filter((d) => prev.has(d.firma));

  const out: string[] = [];
  out.push(
    `[DIAGNÓSTICOS DEL EDITOR] Tras tu escritura, el compilador/los tests encontraron ${errores.length} error(es) REALES ` +
      `(los leyó el editor, NO los copió el usuario). Arréglalos ahora; no cierres el turno con esto en rojo:`
  );

  const lista = errores.slice(0, max);
  for (const d of lista) {
    const ubic = d.archivo ? `${d.archivo}${d.linea != null ? ":" + d.linea : ""}${d.columna != null ? ":" + d.columna : ""}` : "(sin archivo)";
    const cod = d.codigo ? ` ${d.codigo}` : "";
    const rep = d.veces > 1 ? ` (×${d.veces})` : "";
    out.push(`· ${ubic}${cod} — ${d.mensaje}${rep}`);
  }
  if (errores.length > max) out.push(`… y ${errores.length - max} error(es) más del mismo lote.`);

  if (enBucle.length) {
    // Mismo error que un turno anterior: aplicar reconocimiento + causa raíz.
    const raiz = diagnosticoRaiz(enBucle[0].clase, null);
    out.push("");
    out.push(`⚠ REPETICIÓN: ${enBucle.length} de estos errores ya aparecieron en un intento anterior. No repitas el mismo arreglo — fue el mismo resultado; reconoce el bucle en el chat (en español) y cambia de enfoque.`);
    out.push(`CAUSA RAÍZ: ${raiz.causa}`);
    out.push(`NO HAGAS: ${raiz.noHagas}`);
  }

  return out.join("\n");
}
