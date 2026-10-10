const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const readline=require('node:readline');
const {parseWindowsToast}=require('./notifications.cjs');
const {SystemEvents}=require('./system-events.cjs');
class WindowsIntegration {
  constructor({app,onFullscreen,onNotification,onStatus,onIcon}){this.app=app;this.onFullscreen=onFullscreen;this.onNotification=onNotification;this.onStatus=onStatus;this.onIcon=onIcon;this.pending=new Map();this.mediaPending=new Map();this.media=null;this.systemEvents=new SystemEvents(item=>{if(this.settings?.systemNotifications!==false&&!process.env.ISLAND_TEST_DATA)this.onNotification(item,{show:true});});this.icons={};this.startedAt=Date.now();this.seen=new Set();this.fullscreen=false;}
  start(){
    if(process.platform!=='win32')return;
    const exe=this.app.isPackaged?path.join(process.resourcesPath,'native','IslandBridge.exe'):path.join(this.app.getAppPath(),'native','bin','IslandBridge.exe');
    this.child=spawn(exe,[String(process.pid),this.app.getPath('userData')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.on('error',error=>this.onStatus({monitor:'error',error:error.message}));
    this.child.on('exit',()=>{this.onStatus({monitor:'offline'});for(const item of this.pending.values())item(false);this.pending.clear();});
    readline.createInterface({input:this.child.stdout}).on('line',async line=>{try{const event=JSON.parse(line);
      if(event.type==='fullscreen'){this.fullscreen=event.active;this.onFullscreen(event.active);}
      if(event.type==='focus'){this.pending.get(event.id)?.(event.ok);this.pending.delete(event.id);}
      if(event.type==='system'){this.onStatus({system:{power:event.power,wifi:event.wifi}});this.systemEvents.update(event);}
      if(event.type==='icons'){for(const [app,file]of Object.entries(event.paths)){try{const image=await this.app.getFileIcon(file,{size:'normal'});this.icons[app]=image.toDataURL();this.onIcon(app,this.icons[app]);}catch{}}}
      if(event.type==='banners')this.onStatus({exclusive:event.exclusive,controlledApps:event.count});
      if(event.type==='error')this.onStatus({error:event.message});
    }catch{}});
    this.onStatus({monitor:'ready'});
    if(!process.env.ISLAND_TEST_DATA)this.startMedia();
    if(process.env.ISLAND_TEST_DATA)return;
    this.poll();this.timer=setInterval(()=>this.poll(),1000);this.timer.unref();
  }
  startMedia(){
    const file=this.app.isPackaged?path.join(process.resourcesPath,'native','MediaBridge.ps1'):path.join(this.app.getAppPath(),'native','MediaBridge.ps1');
    this.mediaChild=spawn(path.join(process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,'-ParentPid',String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.mediaChild.on('error',()=>this.onStatus({mediaAvailable:false,media:null}));
    this.mediaChild.on('exit',()=>{this.media=null;this.onStatus({mediaAvailable:false,media:null});for(const resolve of this.mediaPending.values())resolve({ok:false,error:'Медиасессия недоступна'});this.mediaPending.clear();});
    readline.createInterface({input:this.mediaChild.stdout}).on('line',line=>{try{const event=JSON.parse(line);if(event.type==='media'){this.media=event.session;this.onStatus({mediaAvailable:event.available,media:this.media});}if(event.type==='media-result'){this.mediaPending.get(event.id)?.(event);this.mediaPending.delete(event.id);}}catch{}});
  }
  async mediaControl(action,sourceId){
    if(!['toggle','next','previous'].includes(action)||!this.media||sourceId!==this.media.sourceId)throw new Error('Источник музыки изменился');
    const id=randomUUID();const result=await new Promise(resolve=>{const timer=setTimeout(()=>{this.mediaPending.delete(id);resolve({ok:false,error:'Плеер не ответил вовремя'});},6000);this.mediaPending.set(id,value=>{clearTimeout(timer);resolve(value);});if(this.mediaChild?.stdin.writable)this.mediaChild.stdin.write(JSON.stringify({type:'media-control',id,action,sourceId})+'\n');});
    if(!result.ok)throw new Error(result.error||'Плеер не поддерживает команду');return true;
  }
  focusMedia(sourceId){if(!this.media||sourceId!==this.media.sourceId)return Promise.resolve(false);return this.requestFocus({type:'focus-media',appId:sourceId});}
  configure(settings){this.settings=settings;if(!settings.nativeNotifications||!settings.islandOnly){this.signature='';this.send({type:'banners',apps:[],exclusive:false});}if(settings.nativeNotifications)this.poll();}
  send(value){if(this.child?.stdin.writable)this.child.stdin.write(JSON.stringify(value)+'\n');}
  focus(app){return this.requestFocus({type:'focus',app});}
  requestFocus(value){const id=randomUUID();return new Promise(resolve=>{const timer=setTimeout(()=>{this.pending.delete(id);resolve(false);},3000);this.pending.set(id,result=>{clearTimeout(timer);resolve(result);});this.send({...value,id});});}
  poll(){
    if(!this.settings?.nativeNotifications||process.env.ISLAND_TEST_DATA)return;
    try{
      if(!this.db){const {DatabaseSync}=require('node:sqlite');const filename=path.join(process.env.LOCALAPPDATA||'','Microsoft','Windows','Notifications','wpndatabase.db');if(!fs.existsSync(filename))throw new Error('Windows ещё не создала хранилище уведомлений');this.db=new DatabaseSync(filename,{readOnly:true,timeout:500});}
      const handlers=this.db.prepare("SELECT RecordId,PrimaryId FROM NotificationHandler WHERE lower(PrimaryId) LIKE '%slack%' OR lower(PrimaryId) LIKE '%codex%' OR lower(PrimaryId) LIKE '%claude%' OR lower(PrimaryId) LIKE '%telegram%'").all().filter(row=>!/runner|ssh/i.test(row.PrimaryId));
      const ids=handlers.map(row=>row.PrimaryId).sort();const signature=JSON.stringify([ids,this.settings.islandOnly]);if(signature!==this.signature){this.signature=signature;this.send({type:'banners',apps:ids,exclusive:this.settings.islandOnly});}
      const query=this.db.prepare('SELECT n.Id,n.Payload,n.ArrivalTime,n.DataVersion,h.PrimaryId FROM Notification n JOIN NotificationHandler h ON n.HandlerId=h.RecordId WHERE n.Type=? ORDER BY n.ArrivalTime DESC LIMIT 80');query.setReadBigInts(true);const rows=query.all('toast');
      for(const row of [...rows].reverse()){const key=`${row.Id}:${row.ArrivalTime}:${row.DataVersion}`;if(this.seen.has(key))continue;this.seen.add(key);const created=Number((BigInt(row.ArrivalTime)-116444736000000000n)/10000n);if(created<this.startedAt-1000)continue;const item=parseWindowsToast(row.Payload,row.PrimaryId,row.Id);if(item){item.icon=this.icons[item.source]||'';this.onNotification(item,{show:this.settings.islandOnly});}}
      if(this.seen.size>3000)this.seen=new Set([...this.seen].slice(-1500));
      this.onStatus({notifications:'ready',sources:ids});
    }catch(error){this.onStatus({notifications:'unavailable',error:error.message});}
  }
  stop(){clearInterval(this.timer);try{this.db?.close();}catch{}this.send({type:'shutdown'});this.child?.stdin.end();if(this.mediaChild?.stdin.writable)this.mediaChild.stdin.end('{"type":"shutdown"}\n');}
}
module.exports={WindowsIntegration};
