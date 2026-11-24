import os from 'node:os';
import {resolverRaizDatos, rechazarRaizAncestroApp, esAncestroOEquivale} from '../src/engine/raizDatos';
import {modoServidor} from './edicionServidor';
import fs from 'node:fs';
import path from 'node:path';
/** Servidor: una configuración inválida nunca se sustituye por /tmp. */
export function resolverWorkspaceServidor(configurada: string | undefined, instalacion: string): string {
  if (!configurada?.trim()) throw new Error('Modo servidor requiere PROJECT_DIR en un volumen persistente.');
  const raiz = path.resolve(configurada.trim());
  const app = fs.realpathSync(instalacion);
  const contieneApp = (base: string) => { const rel = path.relative(base, app); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
  if (contieneApp(raiz)) throw new Error('PROJECT_DIR no puede ser la instalación ni contenerla.');
  fs.mkdirSync(raiz, {recursive:true, mode:0o700});
  if (fs.lstatSync(raiz).isSymbolicLink()) throw new Error('PROJECT_DIR no puede ser un enlace simbólico.');
  const real = fs.realpathSync(raiz);
  if (contieneApp(real)) throw new Error('PROJECT_DIR resuelve a la instalación o un ancestro.');
  const prueba = path.join(real, `.cn-probe-${process.pid}-${Date.now()}`);
  try { fs.writeFileSync(prueba, 'ok', {flag:'wx',mode:0o600}); } finally { if (fs.existsSync(prueba)) fs.unlinkSync(prueba); }
  return real;
}

/** Conserva los criterios de raíz de Gemini en escritorio; servidor falla cerrado. */
export function decidirRaicesEdicion(RAIZ_INSTALACION:string) {
  if (modoServidor()) {
    const PROJECT_ROOT=resolverWorkspaceServidor(process.env.PROJECT_DIR, RAIZ_INSTALACION);
    return {PROJECT_ROOT,raizPorDefecto:PROJECT_ROOT,raizResuelta:{raiz:PROJECT_ROOT,origen:"PROJECT_DIR" as const}};
  }
function esCarpetaEscribible(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const prueba = path.join(dir, `.cn-probe-${process.pid}-${Date.now()}`);
    fs.writeFileSync(prueba, "ok", "utf8");
    fs.unlinkSync(prueba);
    return true;
  } catch {
    return false;
  }
}
function chocaConInstalacion(dir: string): boolean {
  return (
    esAncestroOEquivale(dir, process.cwd()) ||
    esAncestroOEquivale(process.cwd(), dir) ||
    esAncestroOEquivale(dir, RAIZ_INSTALACION) ||
    esAncestroOEquivale(RAIZ_INSTALACION, dir)
  );
}
const raizPorDefecto = (() => {
  const candidatos = [
    process.platform === "win32"
      ? path.join(path.parse(process.cwd()).root, "Cerebronico")
      : path.join(os.homedir(), "Cerebronico"),
    path.join(os.tmpdir(), "cerebronico-datos"),
  ];
  for (const c of candidatos) {
    if (!chocaConInstalacion(c) && esCarpetaEscribible(c)) return c;
  }
  return path.join(os.tmpdir(), "cerebronico-datos");
})();
const raizResuelta = resolverRaizDatos(process.env, process.cwd());
// v1.6.23 — GUARDA-RAÍZ v1: un PROJECT_DIR que contenga a la propia app (la
// instalación misma o un ancestro) se RECHAZA y cae al default, con aviso en
// consola. Además en Cloud Run o contenedores donde cwd (/workspace) es de solo
// lectura o coincide con la instalación, <cwd>/.proyectos choca con `instalacion`
// al abrir proyectos y no tiene permisos de escritura: se usa `raizPorDefecto`.
const raizValidada = rechazarRaizAncestroApp(raizResuelta.raiz, process.cwd(), raizPorDefecto);
if (raizValidada.rechazada) console.warn(`[CerebroNico] ⛔ GUARDA-RAÍZ v1: ${raizValidada.motivo}`);
const PROJECT_ROOT = (() => {
  if (raizResuelta.origen === "PROJECT_DIR") {
    if (!raizValidada.rechazada && !chocaConInstalacion(raizValidada.raiz) && esCarpetaEscribible(raizValidada.raiz)) {
      return raizValidada.raiz;
    }
    console.warn(`[CerebroNico] ⚠️ PROJECT_DIR (${raizValidada.raiz}) no es escribible o choca con la instalación; usando ${raizPorDefecto}`);
    return raizPorDefecto;
  }
  if (!chocaConInstalacion(raizValidada.raiz) && esCarpetaEscribible(raizValidada.raiz)) {
    return raizValidada.raiz;
  }
  return raizPorDefecto;
})();

return {PROJECT_ROOT,raizPorDefecto,raizResuelta};
}
