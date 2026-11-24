/**
 * contextTelemetry.ts — Inspector en vivo de presión de contexto y compactación segura
 * ====================================================================================
 * Módulo 100 % PURO (cero imports de fs, path, child_process o node:*).
 * Reutiliza las fuentes únicas de verdad de la casa:
 *   - `contextoMedido.ts`: `tokensDesdeCaracteres`, `calcularPresion` y umbrales 45/65/80
 *   - `modelTiers.ts`: `ventanaContextoTokens`
 */

import type { ChatMessage, WorkspaceFile } from "../types";
import {
  calcularPresion,
  tokensDesdeCaracteres,
  UMBRAL_AVISO,
  UMBRAL_FORZAR_COMPACTAR,
  UMBRAL_SUGERIR_COMPACTAR,
  type PresionContexto,
} from "./contextoMedido";
import { ventanaContextoTokens } from "./modelTiers";

export interface DesgloseCaracteresSesion {
  sistema: number;
  workspace: number;
  mensajes: number;
  total: number;
}

export interface TelemetriaSesion {
  modelo: string;
  ventanaTokens: number;
  tokensEstimados: number;
  caracteres: DesgloseCaracteresSesion;
  presion: PresionContexto;
  totalMensajes: number;
  totalArchivosWorkspace: number;
  puedeCompactar: boolean;
  umbrales: {
    aviso: number;
    sugerirCompactar: number;
    forzarCompactar: number;
  };
}

export interface ResultadoCompactacion {
  messages: ChatMessage[];
  compactados: number;
  conservados: number;
  caracteresAhorrados: number;
}

const PREFIJO_RESUMEN = "[Resumen de historial compactado]";

/** Calcula métricas en vivo para el chat y el árbol de archivos actual. */
export function calcularTelemetriaSesion(entrada: {
  messages: Pick<ChatMessage, "role" | "content">[];
  workspaceFiles: Pick<WorkspaceFile, "path" | "content">[];
  currentModel: string;
  sistemaBaseChars?: number;
}): TelemetriaSesion {
  const msgs = Array.isArray(entrada.messages) ? entrada.messages : [];
  const files = Array.isArray(entrada.workspaceFiles) ? entrada.workspaceFiles : [];
  const sistema = Math.max(0, Math.floor(entrada.sistemaBaseChars ?? 4200));

  let mensajesChars = 0;
  for (const m of msgs) {
    mensajesChars += typeof m?.content === "string" ? m.content.length : 0;
  }

  let workspaceChars = 0;
  for (const f of files) {
    workspaceChars += (typeof f?.path === "string" ? f.path.length : 0) + (typeof f?.content === "string" ? f.content.length : 0);
  }

  const totalChars = sistema + workspaceChars + mensajesChars;
  const tokensEstimados = tokensDesdeCaracteres(totalChars);
  const ventanaTokens = ventanaContextoTokens(entrada.currentModel || "gemini-4-hydrogen");
  const presion = calcularPresion({
    tokens: tokensEstimados,
    ventana: ventanaTokens,
    procedencia: "estimado",
    herramientaSugerida: "Compactar historial",
  });

  return {
    modelo: entrada.currentModel,
    ventanaTokens,
    tokensEstimados,
    caracteres: {
      sistema,
      workspace: workspaceChars,
      mensajes: mensajesChars,
      total: totalChars,
    },
    presion,
    totalMensajes: msgs.length,
    totalArchivosWorkspace: files.length,
    puedeCompactar: msgs.length > 8,
    umbrales: {
      aviso: UMBRAL_AVISO,
      sugerirCompactar: UMBRAL_SUGERIR_COMPACTAR,
      forzarCompactar: UMBRAL_FORZAR_COMPACTAR,
    },
  };
}

function resumirTurnosAntiguos(antiguos: ChatMessage[]): string {
  const lineas: string[] = [
    `${PREFIJO_RESUMEN} (${antiguos.length} mensaje(s) anteriores condensados para liberar ventana de contexto)`,
  ];

  const rutas = new Set<string>();
  const pedidosUsuario: string[] = [];

  for (const msg of antiguos) {
    const contenido = String(msg.content || "").trim();
    if (!contenido) continue;

    // Preserva rutas reales mencionadas para no perder contexto de obra
    for (const m of contenido.matchAll(/\b(?:src|server|tests|scripts|public|extensions)\/[A-Za-z0-9_.\-/]+/g)) {
      if (rutas.size < 16) rutas.add(m[0]);
    }

    if (msg.role === "user" && !contenido.startsWith(PREFIJO_RESUMEN) && pedidosUsuario.length < 6) {
      const primeraLinea = contenido.replace(/\s+/g, " ").slice(0, 140);
      pedidosUsuario.push(`- Usuario: ${primeraLinea}${contenido.length > 140 ? "…" : ""}`);
    }
  }

  if (pedidosUsuario.length > 0) {
    lineas.push("Pedidos previos relevantes:");
    lineas.push(...pedidosUsuario);
  }
  if (rutas.size > 0) {
    lineas.push(`Rutas citadas: ${Array.from(rutas).join(", ")}`);
  }

  return lineas.join("\n");
}

/**
 * Compacta mensajes antiguos en una sola entrada de resumen, manteniendo intactos
 * los últimos `keepRecent` turnos. No muta la entrada original.
 */
export function compactarHistorialSeguro(
  messages: ChatMessage[],
  keepRecent = 8
): ResultadoCompactacion {
  const lista = Array.isArray(messages) ? messages : [];
  const topeRecientes = Math.max(2, Math.floor(keepRecent));

  if (lista.length <= topeRecientes) {
    return {
      messages: [...lista],
      compactados: 0,
      conservados: lista.length,
      caracteresAhorrados: 0,
    };
  }

  const corte = lista.length - topeRecientes;
  const antiguos = lista.slice(0, corte);
  const recientes = lista.slice(corte);

  const resumenTexto = resumirTurnosAntiguos(antiguos);
  const charsAntes = antiguos.reduce((acc, m) => acc + String(m?.content || "").length, 0);
  const caracteresAhorrados = Math.max(0, charsAntes - resumenTexto.length);

  const mensajeResumen: ChatMessage = {
    id: `compact-${antiguos[antiguos.length - 1]?.timestamp || Date.now()}`,
    role: "system",
    content: resumenTexto,
    timestamp: antiguos[antiguos.length - 1]?.timestamp || Date.now(),
  };

  return {
    messages: [mensajeResumen, ...recientes],
    compactados: antiguos.length,
    conservados: recientes.length,
    caracteresAhorrados,
  };
}
