import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import storeModule from '../electron/store.cjs';
import notifications from '../electron/notifications.cjs';
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
