/**
 * estadoSandbox.ts — FASE 4 (v1.57.3) · EL MODELO «VE» EL 3500
 * ================================================================================
 * El reclamo de Mario era literal: «no maneja el sandbox», «se pierde con el
 * 3500». El servidor YA sabe el estado real (/api/sandbox/status: puerto vivo,
 * proceso, node_modules, raíz, candidatos…), pero el MODELO no lo veía: no hay
 * forma de que un agente decida «arranco el sandbox» o «falta npm install» si el
 * estado no vuelve al prompt en lenguaje que entienda.
 *
 * Esta capa es PURA (no hace fetch, no toca disco ni DOM): recibe el payload
 * CRUDO del servidor y lo normaliza a un objeto estable + un bloque de texto
 * compacto para re-inyectar. La herramienta `estado_sandbox` del motor de planes
 * (planExecutors.ts) inyecta el fetch real y usa esto para formatear. Reusa el
 * extractor de la FASE 3 (diagnosticosEditor) para que los errores de la última
 * build hablen el MISMO idioma de firmas que el resto del lazo.
 */
import { extraerDiagnosticos, resumenParaModelo, type DiagEditor } from "./diagnosticosEditor";

/** Lo que devuelve /api/sandbox/status (y lo que añadamos): todo opcional. */
export interface EstadoSandboxCrudo {
  /** El puerto 3500 responde a una petición (hay algo escuchando). */
  online?: boolean;
  /** El PROCESO del sandbox está vivo (lo lanzó la IDE). */
  running?: boolean;
  port?: number;
  /** node_modules sano en la raíz resuelta. */
  installed?: boolean;
  raizSandbox?: string | null;
  raizProyectoResuelta?: string | null;
  packageJsonCandidates?: string[];
  /** Archivos del proyecto: lista o conteo, lo que mande el server. */
  archivos?: string[] | number;
  /** Última compilación/arranque conocido. */
  ultimaBuild?: { ok?: boolean; cuando?: string | number | null; salida?: string } | null;
  /** Salida CRUDA de la última build/tests (tsc, vite, node…). */
  errores?: string | string[] | null;
  [k: string]: unknown;
}

/** Estado normalizado, estable y fácil de serializar. */
export interface EstadoSandbox {
  corriendo: boolean;
  online: boolean;
  puerto: number;
  instalado: boolean;
  raiz: string | null;
  archivos: number;
  muestraArchivos: string[];
  ultimaBuild: { ok: boolean | null; cuando: string | null; resumen: string | null };
  /** Diagnósticos de la última build (vacío si compiló limpio). */
  errores: DiagEditor[];
  compila: boolean;
}

function aTexto(e: string | string[] | null | undefined): string {
  if (!e) return "";
  return Array.isArray(e) ? e.join("\n") : String(e);
}

function aCadena(x: unknown): string | null {
  if (x == null) return null;
  if (typeof x === "number") return new Date(x).toISOString();
  const s = String(x).trim();
  return s || null;
}

/**
 * Normaliza el payload crudo del servidor a un `EstadoSandbox` estable.
 * Tolerante: campos ausentes caen a valores honestos (apagado, 0 archivos,
 * build desconocida) — nunca inventa que algo corre si el server no lo dice.
 */
export function normalizarEstado(crudo: EstadoSandboxCrudo | null | undefined): EstadoSandbox {
  const c = crudo ?? {};
  const corriendo = Boolean(c.running ?? c.online ?? false);
  const online = Boolean(c.online ?? false);
  const puerto = typeof c.port === "number" && c.port > 0 ? c.port : 3500;
  const instalado = Boolean(c.installed ?? false);
  const raiz = (c.raizProyectoResuelta || c.raizSandbox || null) as string | null;

  let archivos = 0;
  let muestraArchivos: string[] = [];
  if (Array.isArray(c.archivos)) {
    muestraArchivos = c.archivos.slice(0, 12).map(String);
    archivos = c.archivos.length;
  } else if (typeof c.archivos === "number" && c.archivos >= 0) {
    archivos = c.archivos;
  } else if (Array.isArray(c.packageJsonCandidates)) {
    muestraArchivos = c.packageJsonCandidates.slice(0, 12).map(String);
    archivos = c.packageJsonCandidates.length;
  }

  const ub = c.ultimaBuild ?? null;
  const ultimaBuild = {
    ok: ub && typeof ub.ok === "boolean" ? ub.ok : null,
    cuando: ub ? aCadena(ub.cuando) : null,
    resumen: ub && ub.salida ? String(ub.salida).split(/\r?\n/)[0].slice(0, 160) : null,
  };

  const errores = extraerDiagnosticos(aTexto(c.errores));
  const compila = errores.every((d) => d.severidad !== "error");

  return { corriendo, online, puerto, instalado, raiz, archivos, muestraArchivos, ultimaBuild, errores, compila };
}

/**
 * El bloque que vuelve al modelo. Es la «foto» del 3500 en lenguaje accionable:
 * si no corre, lo dice y sugiere arrancar; si faltan dependencias, manda a
 * `npm install`; si la última build dejó errores, los lista con la capa de la
 * FASE 3 (deduplicados, con causa raíz si se repiten).
 */
export function resumenEstadoParaModelo(estado: EstadoSandbox): string {
  const out: string[] = [];
  out.push("[ESTADO DEL SANDBOX] Foto real del entorno (la leyó el servidor, NO la copió el usuario):");

  if (estado.corriendo) {
    out.push(`· Servidor — CORRIENDO en el puerto ${estado.puerto}${estado.online ? " (responde)" : " (proceso vivo, aún no responde)"}.`);
  } else {
    out.push(`· Servidor — APAGADO (nada escucha en el puerto ${estado.puerto}). Si vas a previsualizar, ARRÁNCALO antes de prometer que la app «ya anda».`);
  }

  out.push(
    estado.instalado
      ? "· Dependencias — instaladas (node_modules sano)."
      : "· Dependencias — FALTAN: node_modules no está sano. Corré `npm install` ANTES de arrancar o la build muere."
  );

  out.push(`· Raíz del proyecto — ${estado.raiz ?? "(sin resolver: no se detectó proyecto en el sandbox)"}.`);

  if (estado.archivos > 0) {
    const muestra = estado.muestraArchivos.length ? ` (p.ej. ${estado.muestraArchivos.slice(0, 6).join(", ")}${estado.archivos > 6 ? "…" : ""})` : "";
    out.push(`· Archivos — ${estado.archivos}${muestra}.`);
  } else {
    out.push("· Archivos — 0: el workspace está vacío. Escribí el código (herramienta `escribir_archivo`) antes de esperar un preview.");
  }

  if (estado.ultimaBuild.ok === true) {
    out.push(`· Última build — OK${estado.ultimaBuild.cuando ? ` (${estado.ultimaBuild.cuando})` : ""}.`);
  } else if (estado.ultimaBuild.ok === false) {
    out.push(`· Última build — FALLÓ${estado.ultimaBuild.cuando ? ` (${estado.ultimaBuild.cuando})` : ""}${estado.ultimaBuild.resumen ? `: ${estado.ultimaBuild.resumen}` : ""}.`);
  } else {
    out.push("· Última build — desconocida (aún no se compiló en esta sesión).");
  }

  if (estado.errores.length) {
    out.push("");
    out.push(resumenParaModelo(estado.errores));
  } else {
    out.push("· Compilación — sin errores conocidos.");
  }

  return out.join("\n");
}

/**
 * v1.84.3 · LA DECISIÓN DEL VIGÍA (bug de Mario con captura, 27/10: «la app no
 * alcanza a cargar y se reinicia solo el piloto automatico»). El vigía de
 * `RightSidebar` consultaba solo `online` cada 8 s: durante la PRIMERA
 * compilación de Vite —minutos en un equipo de 8 GB, el puerto todavía no
 * escucha pero el proceso está vivo y trabajando— cantaba «El sandbox se
 * detuvo», el piloto mataba el arranque y lo volvía a lanzar DESDE CERO, y así
 * ninguna carga alcanzaba a terminar. Cuatro estados, una sola verdad, capaz
 * de ser probada sin navegador:
 *   · «vivo»       — el puerto responde: nada que hacer.
 *   · «arrancando» — proceso vivo sin puerto: DESPERTANDO. Esperar, no reiniciar.
 *   · «detenido»   — ni puerto ni proceso: el piloto tiene permiso de reanimar.
 *   · «sin_server» — /status no contestó (IDE de camino, 500…): no se decide
 *                    sobre datos que no existen; la regla del guard 401/500.
 */
export type VigiliaSandbox = "vivo" | "arrancando" | "detenido" | "sin_server";

export function decidirVigiliaSandbox(crudo: EstadoSandboxCrudo | null | undefined): VigiliaSandbox {
  if (!crudo || typeof crudo !== "object") return "sin_server";
  if (crudo.online === true) return "vivo";
  if (crudo.running === true) return "arrancando";
  // OJO: `running:false` explícito es «el proceso murió»; un payload SIN el
  // campo (server viejo, sonda muda) NO autoriza a matar-ya-lo-sabremos:
  // se trata como sin_server — prohibido reiniciar sobre ignorancia.
  if (crudo.running === false) return "detenido";
  return "sin_server";
}

/**
 * Dependencias del monolito para producir la foto CRUDA del sandbox (Fase 4).
 * La fábrica NO decide nada: recibe las sondas y devuelve la función que el
 * motor inyecta a la herramienta `estado_sandbox`. Vive aquí —y no en
 * `server.ts`— para no inflar el monolito (trinquete de la Fase 2): el monolito
 * es quien CONOCE el :3500, el proceso y la raíz; esta pieza sólo los envuelve
 * en el payload estable.
 */
export interface SondasEstadoSandbox {
  /** ¿El puerto responde? (misma firma que `isPortUp` del monolito). */
  isPortUp: (port: number, timeoutMs: number) => Promise<boolean>;
  /** Resuelve la raíz del proyecto (devuelve `{ raiz }`). */
  resolverRaiz: () => { raiz: string };
  /** ¿El proceso del sandbox está vivo? */
  sandboxVivo: () => boolean;
  /** ¿node_modules está sano en la raíz? */
  nodeModulesSano: (raiz: string) => boolean;
  /** Puerto del sandbox (3500 por defecto). */
  puertoSandbox: number;
  /** Raíz física del workspace (PROJECT_ROOT). */
  raizSandbox: string;
}

/**
 * Fábrica del `estadoSandboxCrudo` (Fase 4, v1.57.3).
 * Extraída del monolito para que `server.ts` no crezca: el monolito es quien
 * conoce el :3500, el proceso y la raíz resuelta; esta fábrica los recibe y
 * devuelve la foto cruda que consume `normalizarEstado`.
 */
export function crearEstadoSandboxCrudo(sondas: () => SondasEstadoSandbox): () => Promise<EstadoSandboxCrudo> {
  return async () => {
    // El thunk se resuelve AQUÍ (en el momento de leer el estado), no al registrar
    // el motor: `isPortUp`/`SANDBOX_PORT` del monolito se declaran DESPUÉS del
    // registro de rutas, y capturarlos eager daría un temporal-dead-zone.
    const s = sondas();
    const online = await s.isPortUp(s.puertoSandbox, 1200);
    const raiz = s.resolverRaiz().raiz;
    return {
      online,
      running: s.sandboxVivo(),
      port: s.puertoSandbox,
      installed: s.nodeModulesSano(raiz),
      raizSandbox: s.raizSandbox,
      raizProyectoResuelta: raiz,
    };
  };
}
