import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const v = readFileSync("scripts/validar.mjs","utf8");
const plan = [...v.matchAll(/id:\s*"([^"]+)",\s*archivo:\s*"(tests\/[^"]+)"/g)].map(m=>[m[1],m[2]]);
const limpiar = (s)=>s.replace(/\x1b\[[0-9;]*m/g,"");
for (const [id,f] of plan) {
  const r = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", f], {cwd:process.cwd(), encoding:"utf-8", env:{...process.env, FORCE_COLOR:"1"}});
  const salida = limpiar(`${r.stdout||""}\n${r.stderr||""}`);
  let ok = Number((salida.match(/(\d+)\s+correctas/)||[])[1]||0);
  if(ok===0) ok = Number((salida.match(/(\d+)\s+comprobaciones OK/)||[])[1]||0)||Number((salida.match(/(\d+)\s+PASS/)||[])[1]||0)||Number((salida.match(/(\d+)\/\d+ comprobaciones en verde/)||[])[1]||0);
  if(ok===0) ok = Number((salida.match(/(\d+)\s+pasan/)||[])[1]||0);
  let mal = Number((salida.match(/(\d+)\s+fallidas/)||[])[1]||0);
  if(mal===0) mal = Number((salida.match(/(\d+)\s+fallan/)||[])[1]||0)||Number((salida.match(/(\d+)\s+en rojo/)||[])[1]||0);
  const verdes=(salida.match(/^\s*✓/gm)||[]).length;
  if (Math.max(ok,verdes)===0 && mal===0) console.log("HUERFANA", id, f, "exit="+r.status, JSON.stringify(salida.trim().split("\n").slice(-4)));
}
console.log("FIN");
