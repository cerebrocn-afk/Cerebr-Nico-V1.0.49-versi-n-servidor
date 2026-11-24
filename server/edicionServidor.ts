/** Edición servidor: una raíz de obra y memoria de sesión sencilla. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Express, Request, Response } from 'express';

export const modoServidor = () => process.env.CN_SERVER_MODE === '1';
export function rutaWorkspace(raiz: string, entrada: string): string {
  let r = String(entrada || '').replace(/\\/g, '/');
  if (r === '/workspace') r = '';
  else if (r.startsWith('/workspace/')) r = r.slice(11);
  else if (path.isAbsolute(r)) {
    const rel = path.relative(raiz, r);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta fuera del workspace.');
    r = rel;
  }
  if (r.includes('\0') || r.split('/').includes('..')) throw new Error('Ruta fuera del workspace.');
  const abs = path.resolve(raiz, r || '.');
  const rel = path.relative(path.resolve(raiz), abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta fuera del workspace.');
  // No seguir enlaces hacia la instalación, claves u otros usuarios.
  let actual = path.resolve(raiz);
  if (fs.existsSync(actual) && fs.lstatSync(actual).isSymbolicLink()) throw new Error('Workspace enlazado no permitido.');
  for (const parte of rel.split(path.sep).filter(Boolean)) {
    actual = path.join(actual, parte);
    try { if (fs.lstatSync(actual).isSymbolicLink()) throw new Error('Enlace simbólico no permitido.'); } catch (e:any) { if (e.code !== 'ENOENT') throw e; }
  }
  if (rel.split(path.sep).some(p => p === '.sesiones' || p === '.env' || p.startsWith('.env.'))) throw new Error('Archivo privado del servidor.');
  return abs;
}
const OMITIR = new Set(['node_modules', '.git', '.sesiones', '.cerebro-db', '.cerebronico', '.cn-quirofano', '.cn-preview', 'dist_electron', '__pycache__']);
export function inventarioWorkspace(raiz: string): Array<{path: string; content: string; size: number}> {
  const archivos: Array<{path: string; content: string; size: number}> = [];
  let total = 0;
  function visitar(dir: string, profundidad: number) {
    if (profundidad > 12) return;
    for (const e of fs.readdirSync(dir, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
      if (e.isSymbolicLink() || OMITIR.has(e.name) || e.name.startsWith('.env') || e.name.startsWith('.cn-') || e.name.startsWith('.sandbox_')) continue;
      const abs = path.join(dir,e.name);
      if (e.isDirectory()) visitar(abs, profundidad + 1);
      else if (e.isFile()) {
        if (!/\.(html?|css|[cm]?js|jsx|tsx?|json|md|txt|py|ya?ml|toml|xml|csv|sql|sh|bat|java|kt|rs|go|svg)$/i.test(e.name)) continue;
        const size = fs.statSync(abs).size;
        if (size > 2*1024*1024 || total + size > 16*1024*1024 || archivos.length >= 1500) continue;
        const content = fs.readFileSync(abs,'utf8');
        if (content.includes('\0')) continue;
        archivos.push({path:path.relative(raiz,abs).split(path.sep).join('/'), content, size}); total += size;
      }
    }
  }
  visitar(raiz,0); return archivos;
}
export function guardarSesion(raiz: string, datos: any) {
  // Lista blanca: nunca guardar claves/API config ni adjuntos binarios.
  const messages = Array.isArray(datos?.messages) ? datos.messages.slice(-400).map((m:any) => ({id:String(m.id||''), role:['user','assistant','system'].includes(m.role)?m.role:'user',content:String(m.content||'').slice(0,100000), timestamp:Number(m.timestamp)||Date.now()})) : [];
  const sesion = {version:1, savedAt:new Date().toISOString(), messages, currentModel:String(datos?.currentModel||''), provider:String(datos?.provider||'ollama')};
  const dir=path.join(raiz,'.sesiones'); fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const destino=path.join(dir,'actual.json'), tmp=path.join(dir,`actual-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp,JSON.stringify(sesion),{mode:0o600}); fs.renameSync(tmp,destino); return sesion;
}
export function leerSesion(raiz:string) {
  try {return JSON.parse(fs.readFileSync(path.join(raiz,'.sesiones','actual.json'),'utf8'));} catch {return null;}
}
const contexto = new AsyncLocalStorage<{key:string; base:string}>();
export function conClaveOllama<T>(base:string,key:string,fn:()=>T):T {return contexto.run({key,base},fn);}
export function endpointOllamaPermitido(base:string):string {
  const url=new URL(base); if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Endpoint Ollama inválido.');
  const configurada=(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/,'');
  if (modoServidor() && url.origin !== new URL(configurada).origin && url.origin !== 'https://ollama.com') throw new Error('Endpoint no autorizado: configure OLLAMA_URL en el servidor.');
  return url.href.replace(/\/+$/,'');
}
export function fetchConClave(original:typeof fetch):typeof fetch {
  return (async (input:any,init?:RequestInit) => {
    const c=contexto.getStore();
    const url=new URL(typeof input==='string'||input instanceof URL ? String(input):input.url);
    if (!c?.key || url.origin!==new URL(c.base).origin || !url.pathname.startsWith('/api/')) return original(input,init);
    const headers=new Headers(init?.headers || (typeof input==='object' && 'headers' in input ? input.headers:undefined));
    headers.set('Authorization',`Bearer ${c.key}`);
    // No reenviar una clave a otro destino a través de una redirección.
    return original(input,{...init,headers,redirect:'error'});
  }) as typeof fetch;
}
function coincide(a:string,b:string):boolean {const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && crypto.timingSafeEqual(x,y);}
export function montarEdicionServidor(app:Express,raiz:string) {
  if (!modoServidor()) return;
  if (!process.env.ACCESS_TOKEN) throw new Error('Edición servidor requiere ACCESS_TOKEN.');
  fs.mkdirSync(raiz,{recursive:true});
  // Cookie firmada derivada: no guardar el token del servidor en el navegador.
  const previewTicket=crypto.createHmac('sha256',process.env.ACCESS_TOKEN).update('cn-preview-only-v1').digest('hex');
  const cookieVal=crypto.createHmac('sha256',process.env.ACCESS_TOKEN).update('cn-servidor-session-v1').digest('hex');
  const auth=(req:Request) => {
    const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('cn_server='))?.slice(10)||'';
    const token=String(req.headers['x-access-token']||'');
    return coincide(cookie,cookieVal) || (token.length>0 && coincide(token,process.env.ACCESS_TOKEN!));
  };
  const origenValido=(req:Request) => {
    const origin=req.headers.origin;
    if (!origin) return !['cross-site','same-site'].includes(String(req.headers['sec-fetch-site']||''));
    if (origin==='null') return false;
    const permitidos=(process.env.CN_PUBLIC_ORIGIN||'').split(',').filter(Boolean);
    return permitidos.includes(origin);
  };
  app.get('/healthz',(_req,res)=>res.json({ok:true}));
  app.post('/api/server/login',(req,res)=>{
    if (!origenValido(req)) return res.status(403).json({error:'Origen no autorizado.'});
    if (!coincide(String(req.body?.token||''),process.env.ACCESS_TOKEN!)) return res.status(401).json({error:'Clave de acceso incorrecta.'});
    res.cookie('cn_server',cookieVal,{httpOnly:true,secure:process.env.CN_COOKIE_SECURE!=='0',sameSite:'strict',path:'/',maxAge:12*60*60*1000}); return res.json({ok:true});
  });
  app.use('/api',(req,res,next)=>{
    if (!origenValido(req)) return res.status(403).json({error:'Origen no autorizado.'});
    if (!auth(req)) return res.status(401).json({error:'Inicia sesión con la clave de acceso del servidor.'});
    // La puerta antigua exige este header: se asigna sólo DESPUÉS de autenticar.
    req.headers['x-access-token']=process.env.ACCESS_TOKEN;
    const base=String(req.body?.ollamaUrl || (req.originalUrl?.startsWith('/api/ollama/models') ? req.query?.url : '') || process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
    let destino:string; try {destino=endpointOllamaPermitido(base);} catch(e:any) {return res.status(400).json({error:e.message});}
    const key=String(req.body?.ollamaApiKey||req.headers['x-ollama-key']||process.env.OLLAMA_API_KEY||'');
    return conClaveOllama(destino,key,next);
  });
  app.get('/api/server/config',(_req,res)=>res.json({serverMode:true,workspace:'/workspace',preview:`/sandbox-preview/${previewTicket}/`,ollamaUrl:process.env.OLLAMA_URL||'http://127.0.0.1:11434',session:leerSesion(raiz)}));
  app.post('/api/server/session',(req,res)=>{try{return res.json({ok:true,session:guardarSesion(raiz,req.body)});}catch(e:any){return res.status(500).json({error:e.message});}});
  app.get('/api/server/workspace',(_req,res)=>{try {const files=inventarioWorkspace(raiz); const revision=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');return res.json({files,revision});}catch(e:any){return res.status(500).json({error:e.message});}});
  app.get('/api/fs/tree',(_req,res)=>res.json({files:inventarioWorkspace(raiz).map(f=>f.path),root:'/workspace'}));
  app.get('/api/fs/read',(req,res)=>{try {return res.json({path:req.query.path,content:fs.readFileSync(rutaWorkspace(raiz,String(req.query.path||'')),'utf8')});}catch(e:any){return res.status(400).json({error:e.message});}});
  // Las rutas de arranque originales se conservan; la vista pública es un proxy
  // de destino fijo y sólo de lectura, no una herramienta de ejecución nueva.
  app.use('/sandbox-preview',async(req,res)=>{
    const partes=req.url.split('/');
    const ticket=partes[1] || '';
    const conTicket=coincide(ticket,previewTicket);
    if (!conTicket) {
      if (!auth(req)) return res.status(401).send('Inicia sesión en la IDE.');
      return res.redirect(302,`/sandbox-preview/${previewTicket}/${req.url.replace(/^\//,'')}`);
    }
    const relativa='/' + partes.slice(2).join('/');
    const prefijo=`/sandbox-preview/${previewTicket}/`;
    if (!['GET','HEAD'].includes(req.method)) return res.status(405).end();
    const target=`http://127.0.0.1:${Number(process.env.SANDBOX_PORT)||3500}${relativa}`;
    try {
      const respuesta=await fetch(target,{signal:AbortSignal.timeout(10000),redirect:'manual'});
      res.status(respuesta.status);
      for (const h of ['content-type','cache-control']) {const v=respuesta.headers.get(h);if(v)res.setHeader(h,v);}
      res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"sandbox allow-scripts allow-forms; frame-ancestors 'self'; form-action 'none'");
      const tipo=respuesta.headers.get('content-type')||'';
      let body=Buffer.from(await respuesta.arrayBuffer());
      if (tipo.includes('text/html') || tipo.includes('text/css') || tipo.includes('javascript')) {
        let texto=body.toString('utf8');
        // Recursos absolutos habituales de HTML, CSS y módulos Vite.
        texto=texto.replace(/((?:src|href|action)\s*=\s*["'])\/(?!\/|sandbox-preview\/)/gi,`$1${prefijo}`).replace(/(url\(\s*["']?)\/(?!\/|sandbox-preview\/)/gi,`$1${prefijo}`).replace(/((?:from\s*|import\s*\(|import\s*|fetch\s*\()["'])\/(?!\/|sandbox-preview\/)/g,`$1${prefijo}`);
        body=Buffer.from(texto);
      }
      return res.end(req.method==='HEAD'?undefined:body);
    } catch {return res.status(503).send('El sandbox todavía no está disponible. Arranca el proyecto desde la IDE.');}
  });
}
