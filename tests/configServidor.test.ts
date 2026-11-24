import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {resolverWorkspaceServidor} from '../server/configServidor';
const base=fs.mkdtempSync(path.join(process.env.TMPDIR!, 'cn-config-'));
const app=path.join(base,'app');fs.mkdirSync(app);
let pass=0,fail=0;
function test(n:string,f:()=>void){try{f();pass++;console.log('✓ '+n);}catch(e:any){fail++;console.log('✗ '+n+' — '+e.message);}}
test('servidor exige raíz explícita',()=>assert.throws(()=>resolverWorkspaceServidor(undefined,app)));
test('rechaza raíz vacía',()=>assert.throws(()=>resolverWorkspaceServidor(' ',app)));
test('rechaza la instalación',()=>assert.throws(()=>resolverWorkspaceServidor(app,app)));
test('rechaza ancestro de instalación',()=>assert.throws(()=>resolverWorkspaceServidor(base,app)));
test('admite volumen hermano',()=>assert.equal(resolverWorkspaceServidor(path.join(base,'datos'),app),path.join(base,'datos')));
test('admite proyecto hijo explícito sin cambiar su ubicación',()=>assert.equal(resolverWorkspaceServidor(path.join(app,'proyecto'),app),path.join(app,'proyecto')));
test('no sustituye ruta bloqueada por una carpeta temporal',()=>{const file=path.join(base,'bloqueada');fs.writeFileSync(file,'x');assert.throws(()=>resolverWorkspaceServidor(path.join(file,'datos'),app));});
test('rechaza enlace a instalación',()=>{const link=path.join(base,'enlace');fs.symlinkSync(app,link);assert.throws(()=>resolverWorkspaceServidor(link,app));});
test('datos permanecen al resolver por segunda vez',()=>{const root=resolverWorkspaceServidor(path.join(base,'datos'),app);fs.writeFileSync(path.join(root,'index.html'),'obra');assert.equal(fs.readFileSync(path.join(resolverWorkspaceServidor(root,app),'index.html'),'utf8'),'obra');});
fs.rmSync(base,{recursive:true,force:true});
console.log(`VEREDICTO configServidor: ${pass} PASS · ${fail} FAIL`);process.exitCode=fail?1:0;
