import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),{RecordingFiles,validRegion}=require('../electron/recording.cjs');
test('recording streams ordered chunks into an atomic file and only opens known folders',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'island-record-test-'));const saves=[];const recorder=new RecordingFiles({folder,onSaved:value=>saves.push(value)});
 try{const {id}=await recorder.begin({sourceId:'screen:1:0',audio:'both',area:'region',region:{x:.1,y:.2,width:.5,height:.5},mime:'video/webm;codecs=vp8,opus'});await assert.rejects(recorder.begin({}),/уже/);recorder.started(id);await Promise.all([recorder.append(id,new Uint8Array([1,2])),recorder.append(id,new Uint8Array([3,4]))]);const saved=await recorder.finish(id);assert.equal(saved.bytes,4);assert.deepEqual([...await fs.readFile(path.join(folder,saved.name))],[1,2,3,4]);assert.equal(recorder.state.status,'idle');assert.equal(saves.length,1);assert.equal(recorder.folderFor(id),folder);assert.throws(()=>recorder.folderFor('../arbitrary'),/не найден/);await assert.rejects(async()=>recorder.append(id,new Uint8Array([5])),/не активна/);assert.ok(!(await fs.readdir(folder)).some(name=>name.endsWith('.partial')));}finally{await recorder.emergencyClose();await fs.rm(folder,{recursive:true,force:true});}
});
test('failed capture removes empty file, and failed write retains a recovery file without a success notification',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'island-record-error-'));let saved=0;const recorder=new RecordingFiles({folder,onSaved:()=>saved++});
 try{let {id}=await recorder.begin({sourceId:'screen:1:0',audio:'none',area:'screen',mime:'video/webm'});await assert.rejects(recorder.finish(id,'cancelled'),/cancelled/);assert.deepEqual(await fs.readdir(folder),[]);({id}=await recorder.begin({sourceId:'screen:1:0',audio:'none',area:'screen',mime:'video/webm'}));await recorder.append(id,new Uint8Array([1]));recorder.active.handle.write=async()=>{throw new Error('disk full');};await assert.rejects(recorder.append(id,new Uint8Array([2])),/disk full/);await assert.rejects(recorder.finish(id),/disk full/);assert.equal(saved,0);assert.equal((await fs.readdir(folder)).length,1);assert.match(recorder.state.error,/partial/);assert.equal(recorder.active,null);}finally{await recorder.emergencyClose();await fs.rm(folder,{recursive:true,force:true});}
});
test('capture regions reject invalid and out-of-screen coordinates',()=>{assert.deepEqual(validRegion({x:.5,y:0,width:.5,height:1}),{x:.5,y:0,width:.5,height:1});for(const value of [null,{x:-1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:.5,y:0,width:.7,height:1},{x:NaN,y:0,width:1,height:1}])assert.throws(()=>validRegion(value));});
