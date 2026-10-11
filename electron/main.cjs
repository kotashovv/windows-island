const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, clipboard, powerMonitor, net, globalShortcut, desktopCapturer } = require('electron');
const {installShortcut}=require('./shortcut.cjs');
const {shouldHide}=require('./overlay.cjs');
const {RecordingFiles,validRegion}=require('./recording.cjs');
let recorder,recordSource=null,regionWindow=null;
const recordingBusy=()=>!!recorder?.active;
function recordingChanged(value){runtimeUpdate({recording:value});refreshTray();if(!win||win.isDestroyed())return;win.webContents.setBackgroundThrottling(!recordingBusy());win.setContentProtection(recordingBusy());updateBackdrop();if(blocked){win.setOpacity(recordingBusy()?0:1);if(recordingBusy())win.showInactive();else win.hide();}}
async function captureSources(){const displays=screen.getAllDisplays();return (await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}})).map(source=>{const display=displays.find(item=>String(item.id)===source.display_id);return {id:source.id,name:source.name,width:display?Math.round(display.size.width*display.scaleFactor):0,height:display?Math.round(display.size.height*display.scaleFactor):0,displayId:source.display_id};});}
function requireTools(event){if(event.sender!==win?.webContents||!store.read().settings.toolsEnabled)throw new Error('Инструменты отключены в настройках');}
function requireRenderer(event){if(event.sender!==win?.webContents)throw new Error('Недопустимый запрос');}
function stopRecording(){if(recordingBusy())win.webContents.send('record-stop');}
const {translate}=require('./locale.cjs');
const tr=text=>translate(text,store?.read().settings.language);
function refreshTray(){if(!tray||!store)return;const settings=store.read().settings;tray.setContextMenu(Menu.buildFromTemplate([...(recordingBusy()?[{label:tr('Остановить запись'),click:stopRecording}]:[]),{label:tr('Открыть Windows Island'),click:()=>win.webContents.send('expand',true)},...(settings.tasksEnabled?[{label:tr('Составить отчёт дня'),click:()=>writeReport().catch(error=>dialog.showErrorBox('Windows Island',error.message))}]:[]),{type:'separator'},{label:tr('Выйти'),click:()=>app.quit()}]));}
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const {execFile}=require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createStore, dayKey, reportMarkdown } = require('./store.cjs');
const {AgentActivity}=require('./agent-activity.cjs');
const {setupAgentHooks}=require('./agent-hooks.cjs');
const os=require('node:os');
const {WindowsIntegration}=require('./windows.cjs');
const {validateTarget,normalizeNotification}=require('./notifications.cjs');
const {forecastUrl,normalizeWeather}=require('./weather.cjs');
const {createUpdater}=require('./updates.cjs');
const updater=createUpdater({app,fetch:(...args)=>net.fetch(...args),onProgress:value=>{if(win&&!win.isDestroyed())win.webContents.send('update-progress',value);}});
let win, tray, store, server, token, connectionFile;
let dialogOpen=false;
let mode = 'collapsed',pinned=false,registeredShortcut='',shortcutCapturing=false;
function summon(){if(blocked)return;win.showInactive();win.webContents.send('expand',mode==='expanded'?false:true);}
function registerShortcut(next){registeredShortcut=installShortcut(globalShortcut,registeredShortcut,next,summon);runtimeUpdate({shortcutError:''});return registeredShortcut;}
let hitRegion={x:154,y:0,width:132,height:26,radius:18},satellites=[],pointerCaptured=false,ignoringMouse=false;
function updateHitRegion(){
  if(!win||win.isDestroyed()||blocked)return;
  const point=screen.getCursorScreenPoint(),origin=win.getBounds();
  const inside=[hitRegion,...satellites].some(r=>{
    const x=point.x-origin.x-r.x,y=point.y-origin.y-r.y,corner=Math.min(r.radius,r.width/2,r.height/2);
    const dx=Math.max(corner-x,0,x-(r.width-corner)),dy=Math.max(corner-y,0,y-(r.height-corner));
    return x>=0&&y>=0&&x<=r.width&&y<=r.height&&dx*dx+dy*dy<=corner*corner;
  });
  const ignore=!pointerCaptured&&!inside;
  if(ignore!==ignoringMouse){ignoringMouse=ignore;win.setIgnoreMouseEvents(ignore,{forward:true});}
}
let backdropProgress=0,backdropStrength=0,backdropSent=false,backdropSignature='';
function updateBackdrop(){if(!windows||!win||win.isDestroyed())return;const intensity=blocked||!win.isVisible()?0:backdropProgress*backdropStrength/100;if(intensity<=0&&!backdropSent)return;const value={type:'backdrop',hwnd:win.getNativeWindowHandle().readBigUInt64LE().toString(),scale:screen.getDisplayMatching(win.getBounds()).scaleFactor,region:hitRegion,satellites,intensity,protected:recordingBusy()};const signature=JSON.stringify(value);if(signature===backdropSignature)return;backdropSignature=signature;backdropSent=intensity>0;windows.send(value);}
let windows,blocked=false,quitting=false,allowClose=false;
function collapseWindow(){pinned=false;setBlocked(runtime.fullscreen);pointerCaptured=false;if(win&&!win.isDestroyed())win.webContents.send('expand',false);updateHitRegion();}
let runtime={monitor:'starting',notifications:'starting',exclusive:false,fullscreen:false,icons:{}};
const activities=new AgentActivity(value=>runtimeUpdate({agentActivity:value}),Date.now,pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}});
setInterval(()=>activities.sweep(),1000).unref();
const readState=()=>({...store.read(),runtime});
function runtimeUpdate(change){const next={...runtime,...change};if(JSON.stringify(next)===JSON.stringify(runtime))return;runtime=next;if(win&&!win.isDestroyed())win.webContents.send('runtime',runtime);}
const dev = process.argv.includes('--dev');
app.setPath('userData',path.join(app.getPath('appData'),'windows-island'));
if (process.env.ISLAND_TEST_DATA) {
  app.setPath('userData',process.env.ISLAND_TEST_DATA);
  const testDesktop=path.join(process.env.ISLAND_TEST_DATA,'desktop');fs.mkdirSync(testDesktop,{recursive:true});app.setPath('desktop',testDesktop);const videos=path.join(process.env.ISLAND_TEST_DATA,'videos');fs.mkdirSync(videos,{recursive:true});app.setPath('videos',videos);
}
const PORT = process.env.ISLAND_TEST_DATA ? 47832 : 47831;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => win?.webContents.send('expand'));
  app.whenReady().then(async () => {
    store = createStore(path.join(app.getPath('userData'), 'island.json'));backdropStrength=store.read().settings.backgroundBlur;activities.configure(store.read().settings.agentIndicators);
    Menu.setApplicationMenu(null);
    connectionFile = path.join(app.getPath('userData'), 'mcp-connection.json');
    if(app.isPackaged){const folder=path.join(app.getPath('userData'),'mcp');fs.mkdirSync(folder,{recursive:true});fs.copyFileSync(path.join(process.resourcesPath,'mcp','server.cjs'),path.join(folder,'server.cjs'));}
    token = randomBytes(32).toString('hex');
    const position = bounds('collapsed');
    win = new BrowserWindow({ ...position, transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, show: false, hasShadow: false, backgroundColor: '#00000000', alwaysOnTop: true, webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.setAlwaysOnTop(true, 'screen-saver');
    recorder=new RecordingFiles({folder:path.join(app.getPath('videos'),'Windows Island'),onState:value=>{recordingChanged(value);if(value.status==='idle')setImmediate(()=>recordingChanged(recorder.state));},onSaved:file=>{const item={...normalizeNotification({source:'island',appName:'Windows Island',title:'Ролик создан',body:file.name,kind:'recording-saved',transport:'system'}),transient:true,recordingId:file.id};if(!blocked&&!store.read().settings.quiet)win.webContents.send('notification',item);}});
    win.webContents.session.setDisplayMediaRequestHandler(async(request,callback)=>{const grant=recordSource;recordSource=null;if(!grant||request.frame!==win.webContents.mainFrame||!recordingBusy()||Date.now()>grant.expires){callback({});return;}try{const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});const video=sources.find(item=>item.id===grant.id);if(!video||!recordingBusy())throw new Error('Экран недоступен');callback({video,...(grant.audio?{audio:'loopback'}:{})});}catch{callback({});}});
    win.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===win.webContents&&recordingBusy()&&['media','display-capture'].includes(permission)));
    win.webContents.session.setPermissionCheckHandler((contents,permission)=>contents===win.webContents&&recordingBusy()&&['media','display-capture'].includes(permission));
    win.webContents.on('render-process-gone',()=>{recordSource=null;recorder?.emergencyClose();});
    win.on('close',event=>{if(!allowClose){event.preventDefault();collapseWindow();}});
    win.on('session-end',()=>{allowClose=true;pauseRunning();windows?.stop();server?.close();try{if(connectionFile)fs.unlinkSync(connectionFile);}catch{}});
    win.webContents.on('before-input-event',(event,input)=>{
      if(!shortcutCapturing&&input.type==='keyDown'&&((input.control&&!input.alt&&!input.meta&&input.key.toLowerCase()==='w')||(input.alt&&!input.control&&input.key==='F4'))){event.preventDefault();collapseWindow();}
    });
    setInterval(updateHitRegion,32).unref();
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.once('ready-to-show', () => win.showInactive());
    if (dev) await win.loadURL('http://127.0.0.1:5173'); else await win.loadFile(path.join(__dirname,'../dist/index.html'));
    win.on('blur', () => { if (['expanded','capsule'].includes(mode)&&!dialogOpen&&!pinned) win.webContents.send('expand', false); });
    screen.on('display-metrics-changed', () => {win.setBounds(bounds(mode));backdropSignature='';updateBackdrop();});
    const icon = nativeImage.createFromPath(path.join(__dirname,'assets','icon.png')).resize({width:20,height:20});
    tray = new Tray(icon); tray.setToolTip('Windows Island');
    refreshTray();
    tray.on('click', () => win.webContents.send('expand', true));
    startServer();
    windows=new WindowsIntegration({app,onFullscreen:setBlocked,onNotification:(item,options)=>receiveNotification(item,options),onStatus:runtimeUpdate,onIcon:(source,icon)=>runtimeUpdate({icons:{...runtime.icons,[source]:icon}})});
    windows.start();windows.configure(store.read().settings);windows.setResourcesVisible(['capsule','expanded','toast','dragging'].includes(mode));
    try{registerShortcut(store.read().settings.shortcut);}catch(error){runtimeUpdate({shortcutError:error.message});}
    powerMonitor.on('suspend',()=>{pauseRunning();stopRecording();});
    const reminded = new Set();
    setInterval(() => { const now = Date.now(); store.read().events.forEach(e => { const delta = Date.parse(e.start)-now; if (delta >= 0 && delta < 5*60000 && !reminded.has(e.id)) { reminded.add(e.id); notify('Скоро в календаре',e.title); } }); }, 30000).unref();
  }).catch(error => { dialog.showErrorBox('Windows Island', error.message); app.quit(); });
}
function bounds(value) {
  const display = screen.getPrimaryDisplay(); const { x, y, width, height } = display.bounds;
  const w=Math.min(440,width-24);
  return { x:Math.round(x+(width-w)/2),y:y-12,width:w,height:Math.min(620,height+12) };
}
function setBlocked(fullscreen){const next=shouldHide(store.read().settings,fullscreen,pinned);runtimeUpdate({fullscreen});if(blocked===next){updateBackdrop();return;}blocked=next;updateBackdrop();win.webContents.send('overlay-blocked',blocked);if(blocked){mode='collapsed';windows?.setResourcesVisible(false);if(recordingBusy()){win.setOpacity(0);win.showInactive();win.setIgnoreMouseEvents(true,{forward:true});ignoringMouse=true;}else win.hide();}else{win.setOpacity(1);win.setBounds(bounds('collapsed'));win.showInactive();}}
function receiveNotification(input,options={show:true,report:false}){
  if(input.transport==='system'&&!options.report){
    const item={...normalizeNotification(input),transient:true};
    if(options.show!==false&&!store.read().settings.quiet&&!blocked)win.webContents.send('notification',item);
    return {accepted:true,notification:item};
  }
  const source=input.source||'island';const result=store.mutate(options.report?'agent.report':'notification.add',{...input,icon:input.icon||runtime.icons[source]||''});
  win.webContents.send('state',readState());
  if(result.accepted&&options.show!==false&&!store.read().settings.quiet&&!blocked)win.webContents.send('notification',result.notification);
  return result;
}
function notify(title, body) {return receiveNotification({title,body,source:'island',transport:'mcp'});}
function act(action, input) {
  const previous=registeredShortcut;
  if(action==='settings.update'&&input.shortcut!==undefined)registerShortcut(input.shortcut);
  let result;try{result=store.mutate(action,input);}catch(error){if(previous!==registeredShortcut)registerShortcut(previous);throw error;}
  if (action === 'settings.update' && typeof input.startup === 'boolean') app.setLoginItemSettings({openAtLogin:input.startup, path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'), args:app.isPackaged?[]:[app.getAppPath()]});
  if(action==='settings.update'){activities.configure(store.read().settings.agentIndicators);backdropStrength=store.read().settings.backgroundBlur;if(input.toolsEnabled===false)stopRecording();if(!store.read().settings.gamingOverlay)pinned=false;refreshTray();windows?.configure(store.read().settings);setBlocked(runtime.fullscreen);}
  win.webContents.send('state',readState());
  if (action === 'task.add'&&!input.source) notify('Новая задача',result.title);
  if (action === 'event.add') notify('Событие добавлено',result.title);
  return result;
}
async function weather() {
  const s = store.read().settings;if(s.weatherEnabled===false)throw new Error('Погода отключена в настройках');
  const response = await net.fetch(forecastUrl(s),{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Погода временно недоступна');
  return normalizeWeather(await response.json(),s.city);
}
async function cities(name) {
  if (typeof name !== 'string' || name.length < 2 || name.length > 100) return [];
  const response = await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${store.read().settings.language}&format=json`,{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Поиск города недоступен'); return (await response.json()).results || [];
}
async function writeReport() {
  const folder = store.read().settings.reportFolder || path.join(app.getPath('desktop'),'Windows Island'); fs.mkdirSync(folder,{recursive:true});
  const file = path.join(folder,`${store.read().settings.language==='en'?'Report':'Отчёт'}-${dayKey()}-${Date.now()}.md`); fs.writeFileSync(file,reportMarkdown(store.read()),'utf8');
  notify(tr('Отчёт готов'),tr('Сохранено в папке: ')+folder); return file;
}
function mcpConfig() {
  if(!server?.listening)throw new Error('Локальный MCP-мост ещё не готов или порт 47831 занят. Перезапустите Island.');
  const script=app.isPackaged?path.join(app.getPath('userData'),'mcp','server.cjs'):path.join(app.getAppPath(),'mcp','server.mjs');
  return JSON.stringify({mcpServers:{'windows-island':{command:'node',args:[script],env:{WINDOWS_ISLAND_CONNECTION:connectionFile}}}},null,2);
}
ipcMain.handle('agent-hooks',async(event,remove)=>{requireRenderer(event);return setupAgentHooks({home:os.homedir(),profile:app.getPath('userData'),nativePath:app.isPackaged?path.join(process.resourcesPath,'native','IslandBridge.exe'):path.join(app.getAppPath(),'native','bin','IslandBridge.exe'),remove:remove===true});});
ipcMain.handle('read',()=>readState());
ipcMain.handle('act',(_,action,input)=>act(action,input));
ipcMain.on('resize',(_,value)=>{if(!['collapsed','mini','capsule','expanded','toast','dragging'].includes(value)||blocked)return;mode=value;windows?.setResourcesVisible(['capsule','expanded','toast','dragging'].includes(value));if((value==='expanded'||value==='capsule'&&!pinned)&&!win.isFocused())win.focus();});
ipcMain.on('hit-region',(_,value)=>{const valid=r=>r&&['x','y','width','height','radius'].every(key=>Number.isFinite(r[key]));const clean=r=>({x:r.x,y:r.y,width:Math.max(0,Math.min(440,r.width)),height:Math.max(0,Math.min(620,r.height)),radius:Math.max(0,Math.min(100,r.radius))});if(!valid(value))return;hitRegion=clean(value);satellites=Array.isArray(value.satellites)?value.satellites.slice(0,3).filter(valid).map(clean):[];if(Number.isFinite(value.blurStrength)&&value.blurStrength>=0&&value.blurStrength<=100)backdropStrength=value.blurStrength;backdropProgress=Number.isFinite(value.backdrop)?Math.max(0,Math.min(1,value.backdrop)):0;updateBackdrop();updateHitRegion();});
ipcMain.on('pointer-capture',(_,value)=>{pointerCaptured=value===true;updateHitRegion();});
ipcMain.on('overlay-pin',(_,value)=>{pinned=value===true&&store.read().settings.gamingOverlay;setBlocked(runtime.fullscreen);});
ipcMain.handle('shortcut',(_,value)=>{act('settings.update',{shortcut:value});return registeredShortcut;});
ipcMain.handle('shortcut-capture',(_,value)=>{shortcutCapturing=value===true;if(shortcutCapturing){if(registeredShortcut)globalShortcut.unregister(registeredShortcut);}else try{registerShortcut(store.read().settings.shortcut);}catch(error){runtimeUpdate({shortcutError:error.message});}});

ipcMain.handle('record-sources',async event=>{requireTools(event);return captureSources();});
ipcMain.handle('record-region',async(event,id)=>{
  requireTools(event);if(recordingBusy()||regionWindow)throw new Error('Запись уже запущена');
  const sources=await captureSources(),source=sources.find(item=>item.id===id);if(!source)throw new Error('Экран недоступен');
  const display=screen.getAllDisplays().find(item=>String(item.id)===source.displayId);if(!display)throw new Error('Экран недоступен');
  dialogOpen=true;
  return new Promise((resolve,reject)=>{
    const selector=new BrowserWindow({...display.bounds,frame:false,transparent:true,skipTaskbar:true,alwaysOnTop:true,resizable:false,show:false,webPreferences:{preload:path.join(__dirname,'region-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});regionWindow=selector;
    let result=null;const onResult=(event,value)=>{if(event.sender!==selector.webContents)return;try{result=value===null?null:validRegion(value);selector.close();}catch{}};
    ipcMain.on('record-region-result',onResult);selector.setAlwaysOnTop(true,'screen-saver');selector.setContentProtection(true);
    selector.webContents.setWindowOpenHandler(()=>({action:'deny'}));selector.webContents.on('will-navigate',event=>event.preventDefault());
    selector.once('closed',()=>{ipcMain.removeListener('record-region-result',onResult);regionWindow=null;dialogOpen=false;resolve(result);if(!blocked){win.showInactive();win.focus();}});
    selector.loadFile(path.join(__dirname,'region.html')).then(()=>selector.show()).catch(error=>{reject(error);selector.close();});
  });
});
ipcMain.handle('record-begin',async(event,options)=>{
  requireTools(event);const sources=await captureSources();if(!sources.some(item=>item.id===options?.sourceId))throw new Error('Экран недоступен');
  const result=await recorder.begin(options);recordSource={id:options.sourceId,audio:['system','both'].includes(options.audio),expires:Date.now()+15000};recordingChanged(recorder.state);return result;
});
ipcMain.handle('record-started',(event,id)=>{requireRenderer(event);recorder.started(id);});
ipcMain.handle('record-chunk',(event,id,bytes)=>{requireRenderer(event);return recorder.append(id,bytes);});
ipcMain.handle('record-finish',async(event,id,error)=>{requireRenderer(event);recordSource=null;try{return await recorder.finish(id,typeof error==='string'?error.slice(0,1000):'');}finally{recordingChanged(recorder.state);}});
ipcMain.handle('record-open-folder',async(event,id)=>{requireRenderer(event);const error=await shell.openPath(recorder.folderFor(id));if(error)throw new Error(error);});

ipcMain.handle('weather',weather);
ipcMain.handle('check-updates',()=>updater.check());
ipcMain.handle('download-update',()=>updater.download());
ipcMain.handle('restart-update',()=>updater.restart());
ipcMain.handle('cities',(_,name)=>cities(name));
ipcMain.handle('report',writeReport);
ipcMain.handle('report-folder',async()=>{dialogOpen=true;let result;try{result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],defaultPath:store.read().settings.reportFolder||path.join(app.getPath('desktop'),'Windows Island')});}finally{dialogOpen=false;}if(result.canceled)return null;act('settings.update',{reportFolder:result.filePaths[0]});return result.filePaths[0];});
ipcMain.handle('open',(_,url)=>{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)) throw new Error('Недопустимая ссылка');return shell.openExternal(parsed.href);});
ipcMain.handle('jump',async(_,value)=>{const target=validateTarget(value);if(!target)throw new Error('У сообщения нет перехода');if(target.url)return shell.openExternal(target.url);if(!await windows.focus(target.app))throw new Error('Не удалось активировать приложение. Откройте его или передайте точную ссылку на чат/проект.');});
ipcMain.handle('media-control',(_,action,sourceId)=>windows.mediaControl(action,sourceId));
ipcMain.handle('media-source',async(_,sourceId)=>{
  if(!windows.media||sourceId!==windows.media.sourceId)throw new Error('Источник музыки изменился');
  if(await windows.focusMedia(sourceId))return;
  if(typeof sourceId==='string'&&sourceId.includes('!')&&/^[\w.!-]{1,300}$/.test(sourceId))return new Promise((resolve,reject)=>execFile('explorer.exe',[`shell:AppsFolder\\${sourceId}`],{windowsHide:true},error=>error?reject(new Error('Не удалось открыть источник музыки')):resolve(true)));
  return {notice:'Источник звука уже открыт. Переключитесь на окно плеера.'};
});
ipcMain.handle('notification-settings',()=>shell.openExternal('ms-settings:notifications'));
ipcMain.handle('mcp-config',mcpConfig);
ipcMain.handle('copy-config',(_,text)=>{clipboard.writeText(String(text));windows?.send({type:'clipboard-baseline'});});
ipcMain.on('capsule-menu',event=>{
  if(event.sender!==win?.webContents||win.isDestroyed())return;
  dialogOpen=true;pointerCaptured=false;updateHitRegion();
  Menu.buildFromTemplate([{label:tr('Отключить'),click:()=>app.quit()}]).popup({window:win,callback:()=>{dialogOpen=false;}});
});
ipcMain.handle('import-calendar',async()=>{
  dialogOpen=true;let result;try{result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Календарь',extensions:['ics']}]});}finally{dialogOpen=false;} if(result.canceled) return 0;
  const file=result.filePaths[0]; if(fs.statSync(file).size>5*1024*1024) throw new Error('Календарь слишком большой (максимум 5 МБ)');
  const ICAL=(await import('ical.js')).default; const component=new ICAL.Component(ICAL.parse(fs.readFileSync(file,'utf8')));
  for(const timezone of component.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(timezone.getFirstPropertyValue('tzid'),new ICAL.Timezone(timezone));
  const existing=store.read().events; const from=new Date();from.setHours(0,0,0,0);const until=new Date(from);until.setDate(until.getDate()+90);let count=0;
  const exceptions=new Map(); const vevents=component.getAllSubcomponents('vevent').map(c=>new ICAL.Event(c));
  for(const event of vevents) if(event.isRecurrenceException()) {const list=exceptions.get(event.uid)||[];list.push(event);exceptions.set(event.uid,list);}
  for(const event of vevents) {
    if(event.isRecurrenceException()) continue;
    for(const exception of exceptions.get(event.uid)||[]) event.relateException(exception);
    const add=(start,end)=>{ const iso=start.toJSDate().toISOString();if(Date.parse(iso)<from.getTime()||Date.parse(iso)>until.getTime()||existing.some(e=>e.source===`ics:${event.uid}`&&e.start===iso))return;const item=store.mutate('event.add',{title:event.summary||'Событие',start:iso,end:end.toJSDate().toISOString(),location:event.location,source:`ics:${event.uid}`});existing.push(item);count++;};
    if(event.isRecurring()) { const iterator=event.iterator(); for(let i=0;i<10000;i++){const occurrence=iterator.next();if(!occurrence||occurrence.toJSDate()>until)break;if(occurrence.toJSDate()>=from){const details=event.getOccurrenceDetails(occurrence);add(details.startDate,details.endDate);}} }
    else add(event.startDate,event.endDate);
  }
  win.webContents.send('state',readState()); notify('Календарь обновлён',`Импортировано событий: ${count}`); return count;
});
function startServer() {
  server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401);return res.end(JSON.stringify({error:'Unauthorized'}));}
    try {
      if(req.method==='GET'&&req.url==='/state') return res.end(JSON.stringify(readState()));
      if(req.method!=='POST'||req.url!=='/action'){res.writeHead(404);return res.end('{}');}
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>256000){res.writeHead(413);res.end('{}');req.destroy();return;}}
      const {action,input}=JSON.parse(body);
      const allowed=['agent.activity','task.add','task.start','task.pause','task.complete','task.reopen','task.delete','tasks.import','event.add','event.delete','notification','agent.report','notification.read','notifications.read-all','report','weather'];
      if(!allowed.includes(action))throw new Error('Недопустимое действие');
      const result=action==='agent.activity'?activities.update(input):action==='notification'?receiveNotification(input):action==='agent.report'?receiveNotification(input,{report:true}):action==='report'?await writeReport():action==='weather'?await weather():act(action,input);
      res.end(JSON.stringify({result}));
    } catch(error) {res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
  });
  server.on('error',error=>notify('MCP недоступен',error.message));
  server.listen(PORT,'127.0.0.1',()=>fs.writeFileSync(connectionFile,JSON.stringify({url:`http://127.0.0.1:${PORT}`,token})));
}
function pauseRunning(){for(const task of store?.read().tasks||[])if(task.status==='running')store.mutate('task.pause',{id:task.id});if(win&&!win.isDestroyed())win.webContents.send('state',readState());}
let recordingQuit=false;
app.on('before-quit',event=>{if(recordingBusy()&&!recordingQuit){event.preventDefault();recordingQuit=true;stopRecording();const deadline=Date.now()+10000;const timer=setInterval(async()=>{if(!recordingBusy()||Date.now()>deadline){clearInterval(timer);await recorder.emergencyClose();app.quit();}},100);return;}globalShortcut.unregisterAll();allowClose=true;if(windows&&!quitting){event.preventDefault();quitting=true;windows.stop();setTimeout(()=>app.quit(),500);return;}pauseRunning();server?.close();try{if(connectionFile)fs.unlinkSync(connectionFile);}catch{}});
app.on('window-all-closed',()=>app.quit());
