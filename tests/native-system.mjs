import {spawn} from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'island-native-system-'));
async function check(exe,args,expected,verify){
  const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const lines=readline.createInterface({input:child.stdout});
  try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`Timeout: ${expected}`)),15000);child.on('error',reject);child.on('exit',code=>{if(code!==0)reject(new Error(`Native bridge exited: ${code}`));});lines.on('line',line=>{try{const event=JSON.parse(line);if(event.type===expected){verify(event);clearTimeout(timeout);resolve();}}catch(error){clearTimeout(timeout);reject(error);}});});
  }finally{child.stdin.end('{"type":"shutdown"}\n');await new Promise(resolve=>{child.on('exit',resolve);setTimeout(()=>{child.kill();resolve();},1500).unref();});lines.close();}
}
try{
  await check(path.resolve('native/bin/IslandBridge.exe'),[String(process.pid),dir],'system',event=>{assert.equal(typeof event.wifi.available,'boolean');if(event.power){assert.equal(typeof event.power.present,'boolean');assert.ok(event.power.percent===null||event.power.percent>=0&&event.power.percent<=100);}console.log('PASS: native power and Wi-Fi snapshot.');});
  await check(path.join(process.env.WINDIR,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('native/MediaBridge.ps1'),'-ParentPid',String(process.pid)],'media',event=>{assert.equal(event.available,true,'Windows media session API must initialize');if(event.session){assert.equal(typeof event.session.sourceId,'string');assert.equal(typeof event.session.canToggle,'boolean');assert.equal(typeof event.session.playing,'boolean');}console.log(`PASS: Windows media session API initialized (${event.session?'session present':'no active session'}).`);});
}finally{fs.rmSync(dir,{recursive:true,force:true});}
