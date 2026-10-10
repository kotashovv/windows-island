import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import storeModule from '../electron/store.cjs';
import notifications from '../electron/notifications.cjs';
test('legacy system notifications are excluded from history without deleting agent reports',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-legacy-system-'));
  try{const file=path.join(dir,'state.json');fs.writeFileSync(file,JSON.stringify({notifications:[{id:'power',source:'island',transport:'system',kind:'charging'},{id:'agent',source:'codex',transport:'mcp',title:'Done'}],agentReports:[{id:'report'}]}));const state=storeModule.createStore(file).read();assert.deepEqual(state.notifications.map(n=>n.id),['agent']);assert.equal(state.agentReports.length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('reports complete tracked tasks once, including when native notification arrives first',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-notification-'));
  try{const store=storeModule.createStore(path.join(dir,'state.json'));const task=store.mutate('task.add',{title:'Work'});store.mutate('task.start',{id:task.id});
    store.mutate('notification.add',{source:'codex',title:'Done',body:'Changes ready',status:'completed',transport:'windows'});
    const result={source:'codex',title:'Done',body:'Changes ready',status:'completed',eventId:'result:1',taskId:task.id};
    assert.equal(store.mutate('agent.report',result).reportSaved,true);assert.equal(store.mutate('agent.report',result).duplicate,true);
    const state=store.read();assert.equal(state.notifications.length,1);assert.equal(state.agentReports.length,1);assert.equal(state.tasks[0].status,'done');assert.equal(state.tasks[0].sessions.length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('silent imports are idempotent and invalid batches create no tasks',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-import-'));
  try{const store=storeModule.createStore(path.join(dir,'state.json'));const list={source:'claude',tasks:[{externalId:'1',title:'Task'}]};assert.equal(store.mutate('tasks.import',list).added.length,1);assert.equal(store.mutate('tasks.import',list).existing.length,1);assert.equal(store.read().notifications.length,0);
    assert.throws(()=>store.mutate('tasks.import',{source:'claude',tasks:[{title:'Valid'},{title:'Invalid',url:'file:///C:/Windows'}]}));assert.equal(store.read().tasks.length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Slack native toast parses text and safe jump; executable URLs are rejected',()=>{
  const toast=notifications.parseWindowsToast(Buffer.from('<toast launch="slack://channel?id=42"><visual><text>Anna &amp; Team</text><text>Ready</text></visual></toast>'),'com.squirrel.slack.slack',42);
  assert.equal(toast.source,'slack');assert.equal(toast.title,'Anna & Team');assert.equal(toast.target.url,'slack://channel?id=42');assert.throws(()=>notifications.validateTarget({app:'codex',url:'file:///C:/cmd.exe'}));
});

test('dismissed notifications stay deduplicated, survive restart, and leave other groups intact',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-dismiss-'));
  try{
    const file=path.join(dir,'state.json');const store=storeModule.createStore(file);
    const first=store.mutate('notification.add',{source:'telegram',body:'First',eventId:'telegram:1'}).notification;
    const second=store.mutate('notification.add',{source:'telegram',body:'Second',eventId:'telegram:2'}).notification;
    store.mutate('notification.add',{source:'codex',body:'Keep this'});
    assert.equal(store.mutate('notifications.dismiss',{ids:[first.id,second.id]}),2);
    assert.equal(store.read().notifications.length,1);
    const restarted=storeModule.createStore(file);assert.equal(restarted.read().notifications.length,1);
    assert.equal(restarted.mutate('notification.add',{source:'telegram',body:'First',eventId:'telegram:1'}).duplicate,true);
    assert.equal(restarted.read().notifications.length,1);
    assert.throws(()=>store.mutate('notifications.dismiss',{ids:'all'}));
    const toast=notifications.parseWindowsToast(Buffer.from('<toast launch="tg://resolve?domain=example"><text>Telegram</text><text>Hello</text></toast>'),'TelegramDesktop.Telegram',1);
    assert.equal(toast.source,'telegram');assert.equal(toast.target.url,'tg://resolve?domain=example');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
