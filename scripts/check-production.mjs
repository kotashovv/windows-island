import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const files=await fs.readdir('dist/assets');
const js=(await Promise.all(files.filter(f=>f.endsWith('.js')).map(f=>fs.readFile('dist/assets/'+f,'utf8')))).join('\n');
const css=(await Promise.all(files.filter(f=>f.endsWith('.css')).map(f=>fs.readFile('dist/assets/'+f,'utf8')))).join('\n');
for(const text of ['windows-island-demo','localStorage','demo-workspace','Интерактивное демо','demo-design','demo-review'])assert.ok(!js.includes(text),'Production bundle contains preview code: '+text);
assert.ok(!/\.demo-|\.preview/.test(css),'Production CSS contains preview styles');
console.log('PASS: production contains no interactive demo, browser storage bridge or preview styles.');
