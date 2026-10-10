import {createRequire} from 'node:module';
import test from 'node:test';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{normalizeShortcut,installShortcut}=require('../electron/shortcut.cjs');
test('Shortcut normalization rejects closing keys, injection and ambiguous combinations',()=>{
 assert.equal(normalizeShortcut('Shift+Control+F1'),'Control+Shift+F1');assert.equal(normalizeShortcut(''),'');assert.equal(normalizeShortcut('Alt+Space'),'Alt+Space');
 for(const value of ['Alt+F4','Control+W','a','A','Shift+Shift+A','Shift+F25','Command+X',null,'Control++','Shift+F1\n'])assert.throws(()=>normalizeShortcut(value));
});
test('Conflicting shortcut preserves previous registration; disable releases it',()=>{
 const registered=new Set(['Shift+F1']),api={isRegistered:key=>registered.has(key),register(key){if(key==='Control+F2')return false;registered.add(key);return true;},unregister:key=>registered.delete(key)};
 assert.throws(()=>installShortcut(api,'Shift+F1','Control+F2',()=>{}),/занята/);assert.deepEqual([...registered],['Shift+F1']);
 assert.equal(installShortcut(api,'Shift+F1','Control+Shift+F3',()=>{}),'Control+Shift+F3');assert.deepEqual([...registered],['Control+Shift+F3']);installShortcut(api,'Control+Shift+F3','',()=>{});assert.equal(registered.size,0);
});
