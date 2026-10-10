import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SystemEvents} from '../electron/system-events.cjs';
const snapshot=(percent=50,plugged=false,connected=false,name='')=>({power:{present:true,percent,plugged,charging:plugged},wifi:{available:true,connected,name}});
test('battery alerts fire once per threshold and reset after charging',()=>{
  const events=[];const system=new SystemEvents(item=>events.push(item));
  system.update(snapshot(21));system.update(snapshot(20));system.update(snapshot(19));system.update(snapshot(10));system.update(snapshot(9));
  assert.deepEqual(events.map(e=>e.kind),['battery-low','battery-low']);
  system.update(snapshot(9,true));system.update(snapshot(9,true));assert.equal(events.at(-1).kind,'charging');
  system.update(snapshot(9,false));assert.deepEqual(events.slice(-2).map(e=>e.kind),['unplugged','battery-low']);
});
test('Wi-Fi transition baseline is silent, reconnect and network change emit once',()=>{
  const events=[];const system=new SystemEvents(item=>events.push(item));
  system.update(snapshot(80,false,true,'Home'));system.update(snapshot(80,false,true,'Home'));assert.equal(events.length,0);
  system.update(snapshot(80,false,false));system.update(snapshot(80,false,true,'Office'));system.update(snapshot(80,false,true,'Office'));system.update(snapshot(80,false,true,'Home'));
  assert.deepEqual(events.map(e=>e.kind),['wifi-disconnected','wifi-connected','wifi-connected']);
});
test('desktop or unavailable battery does not emit low-charge notifications',()=>{
  const events=[];const system=new SystemEvents(item=>events.push(item));
  system.update({power:{present:false,percent:0,plugged:true},wifi:{available:false}});system.update({power:{present:true,percent:null,plugged:null},wifi:{available:false}});assert.equal(events.length,0);
});
