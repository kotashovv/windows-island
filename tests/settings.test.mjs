import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore,reportMarkdown,dayKey} from '../electron/store.cjs';
test('appearance defaults migrate and slider settings persist; malformed values cannot partially change settings',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-appearance-'));try{
  const file=path.join(dir,'state.json');fs.writeFileSync(file,JSON.stringify({settings:{language:'en'}}));const store=createStore(file);
  assert.equal(store.read().settings.activeTransparency,0);assert.equal(store.read().settings.backgroundBlur,0);
  for(const value of [-1,101,NaN,Infinity,'50',null]){const before=store.read();assert.throws(()=>store.mutate('settings.update',{quiet:true,activeTransparency:35,backgroundBlur:value}));assert.deepEqual(store.read(),before);}
  store.mutate('settings.update',{activeTransparency:65,backgroundBlur:80});const saved=createStore(file).read();assert.equal(saved.settings.activeTransparency,65);assert.equal(saved.settings.backgroundBlur,80);assert.equal(saved.settings.language,'en');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('disabling tasks saves the active session, blocks task writes, preserves tasks across restart and re-enable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-settings-'));try{
  const file=path.join(dir,'state.json'),store=createStore(file),task=store.mutate('task.add',{title:'Сохранить мои задачи',notes:'Русский текст пользователя'});
  store.mutate('task.start',{id:task.id});store.mutate('settings.update',{tasksEnabled:false});
  const saved=store.read().tasks[0];assert.equal(saved.status,'todo');assert.equal(saved.sessions.length,1);assert.ok(saved.elapsed>=0);assert.equal(saved.startedAt,undefined);
  for(const [action,input]of [['task.start',{id:task.id}],['task.delete',{id:task.id}],['tasks.import',{source:'codex',tasks:[{externalId:'one',title:'Blocked'}]}],['agent.report',{source:'codex',eventId:'one',taskId:task.id,status:'completed',body:'Blocked'}]])assert.throws(()=>store.mutate(action,input),/Функция задач отключена/);
  assert.equal(store.mutate('agent.report',{source:'codex',eventId:'independent',status:'completed',body:'Standalone agent result'}).accepted,true);
  const reopened=createStore(file);assert.equal(reopened.read().settings.tasksEnabled,false);assert.equal(reopened.read().tasks[0].title,task.title);reopened.mutate('settings.update',{tasksEnabled:true});reopened.mutate('task.start',{id:task.id});assert.equal(reopened.read().tasks[0].status,'running');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('language, folder and feature settings persist; invalid settings are atomic; reports keep user text',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-settings-'));try{
  const file=path.join(dir,'state.json'),store=createStore(file);const task=store.mutate('task.add',{title:'Моя задача',notes:'Мои заметки'});store.mutate('task.complete',{id:task.id});
  for(const input of [{tasksEnabled:false,language:'xx'},{weatherEnabled:false,reportFolder:'relative/path'},{quiet:true,reportFolder:'C:\\bad\0folder'},{gamingOverlay:true,shortcut:'Shift+F25'},{shortcut:'Control+F8',language:'xx'}]){const before=store.read();assert.throws(()=>store.mutate('settings.update',input));assert.deepEqual(store.read(),before);}
  store.mutate('settings.update',{language:'en',shortcut:'Shift+Control+F8',gamingOverlay:true,clipboardNotifications:false,toolsEnabled:false,reportFolder:dir,weatherEnabled:false,batteryNotifications:false,wifiNotifications:false,vpnNotifications:false,mediaControls:false});
  const saved=createStore(file).read();assert.equal(saved.settings.language,'en');assert.equal(saved.settings.shortcut,'Control+Shift+F8');assert.equal(saved.settings.gamingOverlay,true);assert.equal(saved.settings.clipboardNotifications,false);assert.equal(saved.settings.toolsEnabled,false);assert.equal(saved.settings.reportFolder,dir);assert.equal(saved.settings.vpnNotifications,false);
  const report=reportMarkdown(saved,dayKey());assert.match(report,/Completed today: 1/);assert.match(report,/Моя задача/);assert.match(report,/Мои заметки/);assert.match(report,/## Tasks/);
  store.mutate('settings.update',{reportFolder:''});assert.equal(store.read().settings.reportFolder,'');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
