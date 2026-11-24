/**
 * gatesObra.ts — LAS PUERTAS DEL QUIRÓFANO DEL SERVIDOR (v1.23.0)
 * ===============================================================
 * Extraído de server.ts porque la Fase 2 de la casa es PARTIR, NO AÑADIR:
 * el quirófano sumó dos puertas nuevas (compilación y seguridad) y el
 * monolito no podía pagarlas. Aquí vive la política de qué puertas corren
 * con qué proyecto; server.ts solo aporta el `runCommand` y la raíz.
 *
 * v1.23.0 · EL DEFAULT CAMBIÓ (diagnóstico medido, no suposición): en v1.22.2
 * las puertas pesadas estaban APAGADAS por defecto. Para encenderlas había que
 * conocer el nombre de una variable de entorno (`QUIROFANO_GATES=tipos,humo`)
 * que nadie conocía. Resultado: el acta decía «escrito y verificado en disco»
 * sin que NADIE hubiera compilado jamás — y de ahí el «nunca compila» del
 * usuario. Ahora se encienden POR DEFECTO:
 *   · compilación → el build inferido del package.json del proyecto
 *   · seguridad   → cerradura.ts (19 reglas) sobre los archivos tocados
 * y siguen siendo APAGABLES (el usuario manda) con
 * QUIROFANO_SIN_COMPILACION=1 / QUIROFANO_SIN_CERRADURA=1. Las caras por
 * tiempo (tipos, humo) siguen opt-in: `QUIROFANO_GATES=tipos,humo npm run dev`.
 */
import path from "path";
import fs from "fs";
import { puertasEstandar, puertasPesadas, type Puerta } from "../src/engine/quirofano";
import { analizarProyecto as analizarCerradura, type OpcionesAnalisis } from "../src/engine/cerradura";

/**
 * v1.0.10 · F2 — `.cn-seguridad.json`: la allowlist del PROYECTO, leída una vez
 * por tanda (no por archivo). Formato:
 *   { "permitidas": ["xss-innerhtml"], "concedidoPor": "Mario — HUD de plantillas propias" }
 * Una regla permitida NO desaparece del acta: baja a `baja` y queda nombrada.
 * Un guardián que olvida es un guardián que miente. Sin archivo, sin permiso.
 */
export function cargarPermitidosCerradura(raiz: string): OpcionesAnalisis {
  try {
    const f = path.join(raiz, ".cn-seguridad.json");
    if (!fs.existsSync(f)) return {};
    const j = JSON.parse(fs.readFileSync(f, "utf-8"));
    const permitidas = Array.isArray(j?.permitidas) ? j.permitidas.map(String) : [];
    return { permitidas, concedidoPor: j?.concedidoPor ? String(j.concedidoPor) : ".cn-seguridad.json" };
  } catch {
    return {};
  }
}

/**
 * Infiere el comando de build del proyecto: lee el package.json de la raíz y,
 * si tiene script «build», devuelve `<gestor> run build` (el gestor se elige
 * por lockfile: npm/pnpm/yarn). Sin package.json o sin script build devuelve
 * "": la puerta de compilación no corre — no se puede prometer compilar lo
 * que no declara cómo compilarse.
 */
export function inferirComandoBuild(raiz: string): string {
  try {
    const pkgPath = path.join(raiz, "package.json");
    if (!fs.existsSync(pkgPath)) return "";
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (!pkg?.scripts?.build) return "";
    let gestor = "npm";
    try {
      if (fs.existsSync(path.join(raiz, "pnpm-lock.yaml"))) gestor = "pnpm";
      else if (fs.existsSync(path.join(raiz, "yarn.lock"))) gestor = "yarn";
    } catch { /* el gestor por defecto alcanza */ }
    return `${gestor} run build`;
  } catch {
    return "";
  }
}

/**
 * Las puertas de esta instalación sobre este proyecto. `correrComando` entra
 * inyectado (el servidor aporta su ejecutor con timeout real): este módulo no
 * conoce child_process ni express.
 */
export function construirPuertasQf(
  raiz: string,
  correrComandoBase: (comando: string, cwd: string, timeoutMs: number) => Promise<any>,
  env: NodeJS.ProcessEnv = process.env
): Puerta[] {
  const activas = String(env.QUIROFANO_GATES || "").toLowerCase();
  const sinCompilacion = env.QUIROFANO_SIN_COMPILACION === "1";
  const sinCerradura = env.QUIROFANO_SIN_CERRADURA === "1";
  const comandoBuild = inferirComandoBuild(raiz);
  // El runner se construye si hace falta para CUALQUIERA de las puertas que
  // ejecutan procesos (tipos opt-in, compilación opt-out).
  const necesitoRunner = activas.includes("tipos") || (!sinCompilacion && !!comandoBuild);
  const correrComando = necesitoRunner
    ? async (comando: string) => {
        const r = await correrComandoBase(comando, raiz, 180000);
        return { ok: Number(r?.exitCode) === 0, detalle: String(r?.stdout || "") + "\n" + String(r?.stderr || "") };
      }
    : undefined;
  const sondearPreview = activas.includes("humo")
    ? async () => {
        const puerto = Number(env.SANDBOX_PORT) || 3500;
        const res = await fetch("http://127.0.0.1:" + puerto + "/");
        return { status: res.status, cuerpo: await res.text() };
      }
    : undefined;
  // v1.0.10 · F2 — los permisos del proyecto entran a la puerta sin que el
  // motor conozca fs: el cierre lee el archivo, la puerta recibe la función.
  const permitidosQf = sinCerradura ? {} : cargarPermitidosCerradura(raiz);
  return puertasEstandar().concat(
    puertasPesadas({
      correrComando,
      sondearPreview,
      comandoBuild: sinCompilacion ? undefined : (comandoBuild || undefined),
      analizarSeguridad: sinCerradura ? undefined : (archivos) => analizarCerradura(archivos, permitidosQf),
    })
  );
}
