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
test('VPN baseline and repeated snapshots are silent; connect, switch and disconnect are transient',()=>{
  const events=[],system=new SystemEvents(item=>events.push(item));const update=(connected,name='')=>system.update({...snapshot(),vpn:{available:true,connected,name}});
  update(false);update(false);assert.equal(events.length,0);update(true,'WireGuard');update(true,'WireGuard');update(true,'Work VPN');update(false);
  assert.deepEqual(events.map(e=>e.kind),['vpn-connected','vpn-connected','vpn-disconnected']);assert.ok(events.every(e=>e.transport==='system'));assert.equal(events[0].appName,'VPN');
  system.update({...snapshot(),vpn:null});update(true,'Work VPN');assert.equal(events.length,3,'re-enabling the monitor starts with a silent baseline');
});
test('charging and unplugging include the real battery percentage for the capsule fill',()=>{
  const events=[],system=new SystemEvents(item=>events.push(item));system.update(snapshot(63,false));system.update(snapshot(63,true));system.update(snapshot(64,false));
  assert.deepEqual(events.map(e=>[e.kind,e.chargePercent]),[['charging',63],['unplugged',64]]);
});
