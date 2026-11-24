import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { configuracionPublicacion } from './configuracion-publicacion.mjs';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(app);
config({path:path.join(app,'.env')});
process.env.CN_SERVER_MODE = '1';
process.env.NODE_ENV = 'production';
try {
  const cfg = configuracionPublicacion(process.env, app);
  process.env.HOST = cfg.host;
  process.env.PORT = cfg.port;
  process.env.CN_PUBLIC_ORIGIN = cfg.origin;
  process.env.PROJECT_DIR = cfg.root;
  process.env.CN_COOKIE_SECURE = '1';
  for (const aviso of cfg.avisos) console.warn('[Publicación] ' + aviso);
  fs.mkdirSync(cfg.root,{recursive:true,mode:0o700});
  if (fs.lstatSync(cfg.root).isSymbolicLink()) throw new Error('PROJECT_DIR no puede ser un enlace simbólico.');
  const real=fs.realpathSync(cfg.root), rel=path.relative(real,fs.realpathSync(app));
  if (rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))) throw new Error('El workspace no puede contener la instalación.');
  const prueba=path.join(real,`.cn-arranque-${process.pid}-${Date.now()}`);
  try { fs.writeFileSync(prueba,'ok',{flag:'wx',mode:0o600}); } finally { if (fs.existsSync(prueba)) fs.unlinkSync(prueba); }
  if (!fs.existsSync(path.join(app,'dist','server.mjs'))) throw new Error('Primero ejecuta npm run build.');
  if (process.argv.includes('--comprobar')) {
    console.log('PRECHECK OK: autenticación, origen HTTPS, puerto, workspace escribible y backend compilado. No se abrió ningún puerto.');
    console.log('La persistencia tras reinicio y el acceso público siguen pendientes de prueba.');
  } else {
    console.log('CerebróNico v1.0.55: edición servidor privada. Escucha configurada en ' + cfg.host + ':' + cfg.port + '.');
    await import(pathToFileURL(path.join(app,'dist','server.mjs')).href);
  }
} catch (error) {
  console.error('[ARRANQUE SERVIDOR] ' + (error instanceof Error ? error.message : 'Fallo de configuración.'));
  process.exitCode = 1;
}
