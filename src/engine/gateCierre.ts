/**
 * src/engine/gateCierre.ts — ORQUESTADOR DEL GATE DE CIERRE (v1.59.1)
 * ============================================================================
 * Este es el UNICO punto de articulacion de los 4 ejes del motor de certeza.
 * Antes, los modulos puros de src/ (auditoriaBucle, autocorrectorCompilacion,
 * autorrevision, matrizVerificacion, grafoDependencias, motorContexto,
 * memoriaEstrategias, extraerFirmas) eran HUERFANOS: nadie los importaba y por
 * tanto no influian en el bucle real. gateCierre los COMPONE en una sola
 * decision de cierre con telemetria, y es a su vez cableado desde
 * server/cicloOpenAICompat.ts.
 *
 * No reemplaza el gate propietario del servidor (revisarObraEscrita /
 * directivaAutorrevision): lo COMPLEMENTA con una segunda capa de señal
 * (bucle, compilacion, grafo, presupuesto, estrategias) y telemetria unificada.
 *
 * PURO: sin red, sin fs, sin estado global. Recibe todo lo que necesita.
 */

import {
  diagnosticarBucle,
  directivaRomperBucle,
  type InvocacionHerramienta,
  type MotivoBucle,
} from "../auditoriaBucle";
import {
  parsearTodosLosErrores,
  generarDirectivaMultiError,
} from "../autocorrectorCompilacion";
import {
  evaluarIntegridadPostEscritura,
  MAX_AUTORREVISION,
  type VeredictoAutorrevision,
} from "../autorrevision";
import { verificarConsistenciaExportaciones } from "../matrizVerificacion";
import {
  construirNodoDesdeFuentes,
  validarConsistenciaGrafo,
  exportacionesDe,
  type FuenteModulo,
} from "../grafoDependencias";
import {
  calcularPresupuestoContexto,
  type ArchivoContexto,
} from "../motorContexto";
import {
  evaluarYFiltrarEstrategias,
  type RegistroIntentoFallido,
} from "../memoriaEstrategias";
import { aislarSimbolos } from "../extraerFirmas";

/** Un archivo escrito en el turno que esta por cerrarse. */
export interface EscrituraTurno {
  path: string;
  contenido: string;
  intento: number; // numero de autorrevision ya consumido para este archivo
}

export interface EntradaGate {
  /** Historial de tool-calls del turno (para el cortafuegos de bucle). */
  historialHerramientas: InvocacionHerramienta[];
  /** Archivos escritos este turno que deben superar el gate. */
  escrituras: EscrituraTurno[];
  /** Snapshot de las fuentes del proyecto (para grafo + firmas). Opcional. */
  fuentesProyecto?: FuenteModulo[];
  /** Salida de consola del ultimo build/tsc, si la hubo. Opcional. */
  salidaCompilador?: string;
  /** Archivos que entraron a la ventana de contexto (para presupuesto). */
  contextoInyectado?: ArchivoContexto[];
  /** Enfoques logicos ya fallados (memoria de estrategias). Opcional. */
  fallosPrevios?: RegistroIntentoFallido[];
  /** Enfoque propuesto para el proximo paso, si lo hay. Opcional. */
  enfoquePropuesto?: string;
  /** Techo de contexto en chars. */
  limiteContextoChars?: number;
}

export interface TelemetriaGate {
  bucleMotivo: MotivoBucle;
  erroresCompilacion: number;
  archivosRevisados: number;
  archivosConTruncamiento: number;
  archivosSinExport: number;
  exportacionesRotas: number;
  presupuestoChars: number;
  presupuestoExcedido: boolean;
  ahorroFirmasChars: number;
  estrategiaBloqueada: boolean;
}

export interface VeredictoCierre {
  /** true => se permite cerrar el turno; false => hay que inyectar directivas. */
  liberar: boolean;
  /** Directivas correctivas a inyectar al modelo (orden de prioridad). */
  directivas: string[];
  telemetria: TelemetriaGate;
}

/**
 * Evalua TODOS los ejes y produce un veredicto unico de cierre. El orden de las
 * directivas refleja prioridad: compilacion > bucle > integridad escritura >
 * grafo/exports > estrategia > presupuesto (aviso blando).
 */
export function evaluarCierre(entrada: EntradaGate): VeredictoCierre {
  const directivas: string[] = [];
  const tel: TelemetriaGate = {
    bucleMotivo: null,
    erroresCompilacion: 0,
    archivosRevisados: entrada.escrituras.length,
    archivosConTruncamiento: 0,
    archivosSinExport: 0,
    exportacionesRotas: 0,
    presupuestoChars: 0,
    presupuestoExcedido: false,
    ahorroFirmasChars: 0,
    estrategiaBloqueada: false,
  };

  // (1) Compilacion — maxima prioridad: nada se cierra con errores de tsc.
  if (entrada.salidaCompilador && entrada.salidaCompilador.trim()) {
    const errores = parsearTodosLosErrores(entrada.salidaCompilador);
    tel.erroresCompilacion = errores.length;
    const dir = generarDirectivaMultiError(errores);
    if (dir) directivas.push(dir);
  }

  // (2) Cortafuegos de bucle.
  const diag = diagnosticarBucle(entrada.historialHerramientas);
  tel.bucleMotivo = diag.motivo;
  if (diag.estancado && diag.toolName) {
    directivas.push(directivaRomperBucle(diag.toolName));
  }

  // (3) Integridad post-escritura + consistencia de exportaciones por archivo.
  for (const esc of entrada.escrituras) {
    const veredicto: VeredictoAutorrevision = evaluarIntegridadPostEscritura(
      esc.contenido,
      esc.intento,
    );
    if (!veredicto.aprobado && veredicto.directivaCorreccion) {
      tel.archivosConTruncamiento++;
      directivas.push(`${esc.path}: ${veredicto.directivaCorreccion}`);
    }
    const exp = verificarConsistenciaExportaciones(esc.contenido);
    if (!exp.tieneExportValido) {
      tel.archivosSinExport++;
    }
  }

  // (4) Grafo: una escritura no puede eliminar exports que otros consumen.
  if (entrada.fuentesProyecto && entrada.fuentesProyecto.length > 0) {
    for (const esc of entrada.escrituras) {
      const nodo = construirNodoDesdeFuentes(esc.path, entrada.fuentesProyecto);
      const nuevasExports = exportacionesDe(esc.contenido);
      const rep = validarConsistenciaGrafo(nodo, nuevasExports);
      if (rep.cambiosRotos && rep.reporteIncompatibilidad) {
        tel.exportacionesRotas++;
        directivas.push(rep.reporteIncompatibilidad);
      }
    }
  }

  // (5) Memoria de estrategias: no repetir enfoques ya descartados.
  if (entrada.enfoquePropuesto && entrada.fallosPrevios) {
    const ve = evaluarYFiltrarEstrategias(
      entrada.fallosPrevios,
      entrada.enfoquePropuesto,
    );
    if (!ve.permitido && ve.directivaExclusion) {
      tel.estrategiaBloqueada = true;
      directivas.push(ve.directivaExclusion);
    }
  }

  // (6) Presupuesto de contexto (aviso blando, no bloquea el cierre).
  if (entrada.contextoInyectado && entrada.contextoInyectado.length > 0) {
    const pres = calcularPresupuestoContexto(
      entrada.contextoInyectado,
      entrada.limiteContextoChars ?? 15000,
    );
    tel.presupuestoChars = pres.caracteresTotales;
    tel.presupuestoExcedido = pres.superaLimite;
    if (pres.superaLimite && pres.resumenRecorteContexto) {
      directivas.push(pres.resumenRecorteContexto);
    }
    const resumenes = aislarSimbolos(entrada.contextoInyectado);
    tel.ahorroFirmasChars = resumenes.reduce(
      (acc, r) => acc + (r.caracteresOriginales - r.caracteresFirmas),
      0,
    );
  }

  // El presupuesto es aviso blando: solo bloquea el cierre lo que NO es (6).
  const bloqueantes = directivas.length - (tel.presupuestoExcedido ? 1 : 0);
  return {
    liberar: bloqueantes <= 0,
    directivas,
    telemetria: tel,
  };
}

export { MAX_AUTORREVISION };
