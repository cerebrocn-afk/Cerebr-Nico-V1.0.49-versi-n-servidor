import path from 'node:path';

/** Preflight sin abrir puertos ni ejecutar proyectos. No genera credenciales. */
export function configuracionPublicacion(env, instalacion) {
  const problemas = [], avisos = [];
  const cloud = Boolean(env.K_SERVICE) || env.CN_DEPLOY_TARGET === 'cloudrun';
  let host = (env.HOST || '').trim() || (cloud ? '0.0.0.0' : '127.0.0.1');
  if (cloud && ['127.0.0.1', 'localhost', '::1'].includes(host)) {
    host = '0.0.0.0';
    avisos.push('Cloud Run: HOST loopback sustituido por 0.0.0.0 para recibir tráfico del alojamiento.');
  }
  if (cloud && host !== '0.0.0.0') problemas.push('Cloud Run requiere HOST=0.0.0.0.');
  const portText = String(env.PORT || (cloud ? '8080' : '3000')).trim();
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) problemas.push('PORT debe ser un entero entre 1 y 65535; conserva el puerto asignado por el alojamiento.');
  if (!env.ACCESS_TOKEN || env.ACCESS_TOKEN.length < 24) problemas.push('Define ACCESS_TOKEN como secreto privado de al menos 24 caracteres. No uses la clave del proveedor.');
  const origin = (env.CN_PUBLIC_ORIGIN || '').trim();
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' || u.origin !== origin || u.username || u.password) throw new Error();
    if (u.hostname === 'example.com' || u.hostname.endsWith('.example.com')) problemas.push('CN_PUBLIC_ORIGIN contiene el dominio de ejemplo: reemplázalo por el origen HTTPS real de la IDE.');
  } catch { problemas.push('Define CN_PUBLIC_ORIGIN con el origen HTTPS exacto de la IDE, sin ruta, consulta ni barra final.'); }
  let root;
  if (!env.PROJECT_DIR?.trim()) {
    problemas.push('Define PROJECT_DIR. CN_PROJECT_DIR no sustituye esta variable en modo servidor. Usa ./workspace sólo para sandbox; en publicación, la carpeta del volumen durable.');
  } else {
    root = path.resolve(instalacion, env.PROJECT_DIR.trim());
    const rel = path.relative(root, instalacion);
    if (rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))) problemas.push('PROJECT_DIR no puede ser la instalación ni contenerla. No uses ".".');
  }
  if (env.CN_COOKIE_SECURE === '0') problemas.push('La publicación HTTPS requiere CN_COOKIE_SECURE=1; no desactives la cookie segura.');
  if (env.CN_PROJECT_DIR && !env.PROJECT_DIR) avisos.push('CN_PROJECT_DIR es una variable heredada: falta PROJECT_DIR. No se elegirá otra raíz silenciosamente.');
  if (cloud) avisos.push('Cloud Run no aporta persistencia por crear una carpeta: verifica el volumen montado y usa una sola instancia.');
  if (problemas.length) throw new Error('CONFIGURACIÓN DE PUBLICACIÓN INCOMPLETA:\n- ' + problemas.join('\n- '));
  return { host, port: String(Number(portText)), origin, root, avisos };
}
