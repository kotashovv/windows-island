import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'island-drag-'));
await fs.writeFile(path.join(dir,'island.json'),JSON.stringify({tasks:[],events:[],settings:{greeting:false,autoContrast:false,hideFullscreen:false}}));
let app;
try{
  app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Windows Island.exe'),args:[],env:{...process.env,ISLAND_TEST_DATA:dir}});const page=await app.firstWindow();
  await page.evaluate(()=>{window.dragTrace=[];for(const type of ['pointerdown','pointermove','pointerup','lostpointercapture','pointercancel'])document.addEventListener(type,e=>window.dragTrace.push({type,x:e.clientX,y:e.clientY,buttons:e.buttons,target:e.target.className}),true);});
  const capsule=page.locator('.island-capsule');
  for(let i=0;i<8;i++){
    await page.waitForTimeout(900);const box=await capsule.boundingBox(),x=box.x+box.width/2,y=box.y+box.height-8;
    await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(100);
    for(const [pull,q]of [[45,.5],[90,1],[300,2],[90,1],[0,0]]){await page.mouse.move(x,y+pull);await page.waitForFunction(v=>Math.abs(Number(document.querySelector('.island-capsule').dataset.progress)-v)<.02,q,{timeout:1500});}
    await page.mouse.up();
  }
  console.log('PASS: eight native reversible gestures across window resizing.');
}catch(error){if(app)console.error(await (await app.firstWindow()).evaluate(()=>({mode:document.querySelector('.island-capsule')?.dataset,trace:window.dragTrace,width:innerWidth,hit:document.elementFromPoint(innerWidth/2,20)?.className})));throw error;}
finally{await app?.close();await fs.rm(dir,{recursive:true,force:true});}
