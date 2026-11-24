// Lista el contenido de app\app si existe (el ZIP trae prefijo app/).
const fs = require('fs');
const path = require('path');

const APP = 'C:\\Users\\BirdBox\\Downloads\\cerebronico 3-11-2026\\CerebroNico-IDE-v2.3.8\\app';
const dup = path.join(APP, 'app');

console.log('existe app\\app: ' + fs.existsSync(dup));
if (!fs.existsSync(dup)) process.exit(0);

function walk(d, pre) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) {
      console.log(pre + '[dir] ' + e.name);
      walk(full, pre + '  ');
    } else {
      console.log(pre + e.name + '  (' + fs.statSync(full).size + ' b)');
    }
  }
}
walk(dup, '');
