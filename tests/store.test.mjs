import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import storeModule from '../electron/store.cjs';
const { createStore, reportMarkdown, dayKey } = storeModule;
const setup = () => { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-test-'));return {dir,store:createStore(path.join(dir,'state.json'))}; };
test('task focus is exclusive, sessions persist, completed tasks cannot start',()=>{
  const {dir,store}=setup();try{
    const a=store.mutate('task.add',{title:'First',url:'https://example.com',deadline:'2026-10-10T18:00:00+04:00'});
    const b=store.mutate('task.add',{title:'Second'});
    store.mutate('task.start',{id:a.id});store.mutate('task.start',{id:b.id});
    assert.throws(()=>store.mutate('task.reopen',{id:b.id}),/завершённую/);
    assert.equal(store.read().tasks.filter(t=>t.status==='running').length,1);
    assert.equal(store.read().tasks.find(t=>t.id===a.id).sessions.length,1);
    store.mutate('task.complete',{id:b.id,notes:'Finished'});
    assert.throws(()=>store.mutate('task.start',{id:b.id}),/завершена/);
    assert.equal(createStore(path.join(dir,'state.json')).read().tasks.find(t=>t.id===b.id).notes,'Finished');
  }finally{fs.rmSync(dir,{recursive:true});}
});
test('rejects unsafe links, missing titles and backwards event time',()=>{
  const {dir,store}=setup();try{
    assert.throws(()=>store.mutate('task.add',{title:' '}));
    assert.throws(()=>store.mutate('task.add',{title:'x',url:'file:///C:/Windows'}));
    assert.throws(()=>store.mutate('task.add',{title:'x',deadline:'yesterday'}));
    assert.throws(()=>store.mutate('event.add',{title:'x',start:'2026-10-10T12:00:00Z',end:'2026-10-10T11:00:00Z'}));
    assert.equal(store.read().tasks.length,0);
  }finally{fs.rmSync(dir,{recursive:true});}
});
test('report counts only the selected day and clips sessions across midnight',()=>{
  const data={tasks:[{title:'Cross midnight',createdAt:'2026-10-09T12:00:00',status:'done',completedAt:'2026-10-10T01:00:00',notes:'Outcome',url:'',elapsed:9999999,sessions:[{start:'2026-10-09T23:30:00',end:'2026-10-10T00:30:00'}]}],events:[]};
  const report=reportMarkdown(data,'2026-10-10');
  assert.match(report,/Завершено сегодня: 1/);assert.match(report,/Время работы сегодня: 30 мин/);assert.match(report,/Outcome/);
  assert.equal(dayKey(new Date(2026,9,10)),'2026-10-10');
});
