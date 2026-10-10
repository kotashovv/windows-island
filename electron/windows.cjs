const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const readline=require('node:readline');
const {parseWindowsToast}=require('./notifications.cjs');
const {SystemEvents}=require('./system-events.cjs');
class WindowsIntegration {
  constructor({app,onFullscreen,onNotification,onStatus,onIcon}){this.app=app;this.onFullscreen=onFullscreen;this.onNotification=onNotification;this.onStatus=onStatus;this.onIcon=onIcon;this.pending=new Map();this.mediaPending=new Map();this.media=null;this.systemEvents=new SystemEvents(item=>{if(!process.env.ISLAND_TEST_DATA&&this.settings?.systemNotifications!==false&&(item.kind.startsWith('vpn')?this.settings?.vpnNotifications!==false:item.kind.startsWith('wifi')?this.settings?.wifiNotifications!==false:this.settings?.batteryNotifications!==false))this.onNotification(item,{show:true});});this.icons={};this.iconPaths={};this.startedAt=Date.now();this.seen=new Set();this.fullscreen=false;}
  start(){
    if(process.platform!=='win32')return;
    const exe=this.app.isPackaged?path.join(process.resourcesPath,'native','IslandBridge.exe'):path.join(this.app.getAppPath(),'native','bin','IslandBridge.exe');
    this.child=spawn(exe,[String(process.pid),this.app.getPath('userData')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.on('error',error=>this.onStatus({monitor:'error',error:error.message}));
    this.child.on('exit',()=>{this.onStatus({monitor:'offline'});for(const item of this.pending.values())item(false);this.pending.clear();for(const item of this.mediaPending.values())item({ok:false,error:'Медиамост остановлен'});this.mediaPending.clear();});
    readline.createInterface({input:this.child.stdout}).on('line',async line=>{try{const event=JSON.parse(line);
      if(event.type==='fullscreen'){this.fullscreen=event.active;this.onFullscreen(event.active);}
      if(event.type==='focus'){this.pending.get(event.id)?.(event.ok);this.pending.delete(event.id);}
      if(event.type==='clipboard'&&this.settings?.clipboardNotifications!==false){const title={'clipboard-text':'Скопирован отрывок','clipboard-image':'Изображение скопировано','clipboard-screenshot':'Скриншот сохранён в буфер обмена'}[event.kind];if(title)this.onNotification({source:'island',appName:'Буфер обмена',title,body:'',kind:event.kind,transport:'system'},{show:true});}
      if(event.type==='system'){this.onStatus({system:{power:event.power,wifi:event.wifi,vpn:event.vpn}});this.systemEvents.update(event);}
      if(event.type==='resources'&&this.settings?.gamingOverlay&&this.resourcesVisible)this.onStatus({resources:event});
      if(event.type==='media'){this.media=event.session;this.onStatus({mediaAvailable:event.available,media:this.media});}
      if(event.type==='media-result'){this.mediaPending.get(event.id)?.(event);this.mediaPending.delete(event.id);}
      if(event.type==='icons'){for(const [app,file]of Object.entries(event.paths)){try{if(this.iconPaths[app]===file)continue;this.iconPaths[app]=file;const image=await this.app.getFileIcon(file,{size:'normal'});this.icons[app]=image.toDataURL();this.onIcon(app,this.icons[app]);}catch{}}}
      if(event.type==='banners')this.onStatus({exclusive:event.exclusive,controlledApps:event.count});
      if(event.type==='error')this.onStatus({error:event.message});
    }catch{}});
    this.onStatus({monitor:'ready'});
    if(process.env.ISLAND_TEST_DATA)return;

  }
  async mediaControl(action,sourceId){
    if(this.settings?.mediaControls===false)throw new Error('Управление музыкой отключено');
    if(!['toggle','next','previous'].includes(action)||!this.media||sourceId!==this.media.sourceId)throw new Error('Источник музыки изменился');
    const id=randomUUID();const result=await new Promise(resolve=>{const timer=setTimeout(()=>{this.mediaPending.delete(id);resolve({ok:false,error:'Плеер не ответил вовремя'});},6000);this.mediaPending.set(id,value=>{clearTimeout(timer);resolve(value);});this.send({type:'media-control',id,action,sourceId});});
    if(!result.ok)throw new Error(result.error||'Плеер не поддерживает команду');return true;
  }
  focusMedia(sourceId){if(!this.media||sourceId!==this.media.sourceId)return Promise.resolve(false);return this.requestFocus({type:'focus-media',appId:sourceId});}
  configure(settings){if(this.settings&&['systemNotifications','batteryNotifications','wifiNotifications','vpnNotifications'].some(key=>this.settings[key]!==settings[key]))this.systemEvents=new SystemEvents(this.systemEvents.notify);this.settings=settings;this.send({type:'configure',clipboard:settings.clipboardNotifications!==false&&(!process.env.ISLAND_TEST_DATA||process.env.ISLAND_TEST_CLIPBOARD==='1'),resources:settings.gamingOverlay===true,fullscreen:settings.hideFullscreen!==false,power:settings.systemNotifications!==false&&settings.batteryNotifications!==false,wifi:settings.systemNotifications!==false&&settings.wifiNotifications!==false,system:settings.systemNotifications!==false&&(settings.batteryNotifications!==false||settings.wifiNotifications!==false),vpn:settings.systemNotifications!==false&&settings.vpnNotifications!==false,media:settings.mediaControls!==false&&(!process.env.ISLAND_TEST_DATA||process.env.ISLAND_TEST_MEDIA==='1')});if(!settings.gamingOverlay)this.onStatus({resources:null});if(settings.mediaControls===false){this.media=null;this.onStatus({mediaAvailable:false,media:null});}if(!settings.nativeNotifications||!settings.islandOnly){this.signature='';this.send({type:'banners',apps:[],exclusive:false});}if(settings.nativeNotifications&&!process.env.ISLAND_TEST_DATA){this.poll();if(!this.timer){this.timer=setInterval(()=>this.poll(),1000);this.timer.unref();}}else{clearInterval(this.timer);this.timer=null;try{this.db?.close();}catch{}this.db=null;this.handlerQuery=null;this.toastQuery=null;}}
  setResourcesVisible(value){this.resourcesVisible=value;this.send({type:'resources-visible',visible:value});}
  send(value){if(this.child?.stdin.writable)this.child.stdin.write(JSON.stringify(value)+'\n');}
  focus(app){return this.requestFocus({type:'focus',app});}
  requestFocus(value){const id=randomUUID();return new Promise(resolve=>{const timer=setTimeout(()=>{this.pending.delete(id);resolve(false);},3000);this.pending.set(id,result=>{clearTimeout(timer);resolve(result);});this.send({...value,id});});}
  poll(){
    if(!this.settings?.nativeNotifications||process.env.ISLAND_TEST_DATA)return;
    try{
      if(!this.db){const {DatabaseSync}=require('node:sqlite');const filename=path.join(process.env.LOCALAPPDATA||'','Microsoft','Windows','Notifications','wpndatabase.db');if(!fs.existsSync(filename))throw new Error('Windows ещё не создала хранилище уведомлений');this.db=new DatabaseSync(filename,{readOnly:true,timeout:500});}
      const handlers=(this.handlerQuery||=this.db.prepare("SELECT RecordId,PrimaryId FROM NotificationHandler WHERE lower(PrimaryId) LIKE '%slack%' OR lower(PrimaryId) LIKE '%codex%' OR lower(PrimaryId) LIKE '%claude%' OR lower(PrimaryId) LIKE '%telegram%'")).all().filter(row=>!/runner|ssh/i.test(row.PrimaryId));
      const ids=handlers.map(row=>row.PrimaryId).sort();const signature=JSON.stringify([ids,this.settings.islandOnly]);if(signature!==this.signature){this.signature=signature;this.send({type:'banners',apps:ids,exclusive:this.settings.islandOnly});}
      const query=this.toastQuery||=this.db.prepare('SELECT n.Id,n.Payload,n.ArrivalTime,n.DataVersion,h.PrimaryId FROM Notification n JOIN NotificationHandler h ON n.HandlerId=h.RecordId WHERE n.Type=? ORDER BY n.ArrivalTime DESC LIMIT 80');query.setReadBigInts(true);const rows=query.all('toast');
      for(const row of [...rows].reverse()){const key=`${row.Id}:${row.ArrivalTime}:${row.DataVersion}`;if(this.seen.has(key))continue;this.seen.add(key);const created=Number((BigInt(row.ArrivalTime)-116444736000000000n)/10000n);if(created<this.startedAt-1000)continue;const item=parseWindowsToast(row.Payload,row.PrimaryId,row.Id);if(item){item.icon=this.icons[item.source]||'';this.onNotification(item,{show:this.settings.islandOnly});}}
      if(this.seen.size>3000)this.seen=new Set([...this.seen].slice(-1500));
      this.onStatus({notifications:'ready',sources:ids});
    }catch(error){this.onStatus({notifications:'unavailable',error:error.message});}
  }
  stop(){clearInterval(this.timer);try{this.db?.close();}catch{}this.send({type:'shutdown'});this.child?.stdin.end();}
}
module.exports={WindowsIntegration};
