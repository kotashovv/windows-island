const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, clipboard, powerMonitor, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { createStore, dayKey, reportMarkdown } = require('./store.cjs');
const {WindowsIntegration}=require('./windows.cjs');
const {validateTarget}=require('./notifications.cjs');
const {forecastUrl,normalizeWeather}=require('./weather.cjs');
const {createUpdater}=require('./updates.cjs');
const updater=createUpdater({app,fetch:(...args)=>net.fetch(...args),onProgress:value=>{if(win&&!win.isDestroyed())win.webContents.send('update-progress',value);}});
let win, tray, store, server, token, connectionFile;
let dialogOpen=false;
let mode = 'collapsed';
let hitRegion={x:154,y:0,width:132,height:26,radius:18},pointerCaptured=false,ignoringMouse=false;
function updateHitRegion(){
  if(!win||win.isDestroyed()||blocked)return;
  const point=screen.getCursorScreenPoint(),origin=win.getBounds(),r=hitRegion;
  const x=point.x-origin.x-r.x,y=point.y-origin.y-r.y,corner=Math.min(r.radius,r.width/2,r.height/2);
  const dx=Math.max(corner-x,0,x-(r.width-corner)),dy=Math.max(corner-y,0,y-(r.height-corner));
  const inside=x>=0&&y>=0&&x<=r.width&&y<=r.height&&dx*dx+dy*dy<=corner*corner;
  const ignore=!pointerCaptured&&!inside;
  if(ignore!==ignoringMouse){ignoringMouse=ignore;win.setIgnoreMouseEvents(ignore,{forward:true});}
}
let windows,blocked=false,quitting=false;
let runtime={monitor:'starting',notifications:'starting',exclusive:false,fullscreen:false,icons:{}};
const readState=()=>({...store.read(),runtime});
function runtimeUpdate(change){const next={...runtime,...change};if(JSON.stringify(next)===JSON.stringify(runtime))return;runtime=next;if(win&&!win.isDestroyed())win.webContents.send('state',readState());}
const dev = process.argv.includes('--dev');
app.setPath('userData',path.join(app.getPath('appData'),'windows-island'));
if (process.env.ISLAND_TEST_DATA) {
  app.setPath('userData',process.env.ISLAND_TEST_DATA);
  const testDesktop=path.join(process.env.ISLAND_TEST_DATA,'desktop');fs.mkdirSync(testDesktop,{recursive:true});app.setPath('desktop',testDesktop);
}
const PORT = process.env.ISLAND_TEST_DATA ? 47832 : 47831;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => win?.webContents.send('expand'));
  app.whenReady().then(async () => {
    store = createStore(path.join(app.getPath('userData'), 'island.json'));
    connectionFile = path.join(app.getPath('userData'), 'mcp-connection.json');
    if(app.isPackaged){const folder=path.join(app.getPath('userData'),'mcp');fs.mkdirSync(folder,{recursive:true});fs.copyFileSync(path.join(process.resourcesPath,'mcp','server.cjs'),path.join(folder,'server.cjs'));}
    token = randomBytes(32).toString('hex');
    const position = bounds('collapsed');
    win = new BrowserWindow({ ...position, transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, show: false, hasShadow: false, backgroundColor: '#00000000', alwaysOnTop: true, webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.setAlwaysOnTop(true, 'screen-saver');
    setInterval(updateHitRegion,16).unref();
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.once('ready-to-show', () => win.showInactive());
    if (dev) await win.loadURL('http://127.0.0.1:5173'); else await win.loadFile(path.join(__dirname,'../dist/index.html'));
    win.on('blur', () => { if (['expanded','capsule'].includes(mode)&&!dialogOpen) win.webContents.send('expand', false); });
    screen.on('display-metrics-changed', () => win.setBounds(bounds(mode)));
    const icon = nativeImage.createFromPath(path.join(__dirname,'assets','icon.png')).resize({width:20,height:20});
    tray = new Tray(icon); tray.setToolTip('Windows Island');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'Открыть Windows Island', click:() => win.webContents.send('expand',true)},{label:'Составить отчёт дня',click:() => writeReport()},{type:'separator'},{label:'Выйти',click:() => app.quit()}]));
    tray.on('click', () => win.webContents.send('expand', true));
    startServer();
    windows=new WindowsIntegration({app,onFullscreen:setBlocked,onNotification:(item,options)=>receiveNotification(item,options),onStatus:runtimeUpdate,onIcon:(source,icon)=>runtimeUpdate({icons:{...runtime.icons,[source]:icon}})});
    windows.start();windows.configure(store.read().settings);
    powerMonitor.on('suspend',pauseRunning);
    const reminded = new Set();
    setInterval(() => { const now = Date.now(); store.read().events.forEach(e => { const delta = Date.parse(e.start)-now; if (delta >= 0 && delta < 5*60000 && !reminded.has(e.id)) { reminded.add(e.id); notify('Скоро в календаре',e.title); } }); }, 30000).unref();
  }).catch(error => { dialog.showErrorBox('Windows Island', error.message); app.quit(); });
}
function bounds(value) {
  const display = screen.getPrimaryDisplay(); const { x, y, width, height } = display.bounds;
  const w=Math.min(440,width-24);
  return { x:Math.round(x+(width-w)/2),y:y-12,width:w,height:Math.min(620,height+12) };
}
function setBlocked(fullscreen){const next=fullscreen&&store.read().settings.hideFullscreen;runtimeUpdate({fullscreen});if(blocked===next)return;blocked=next;win.webContents.send('overlay-blocked',blocked);if(blocked){mode='collapsed';win.hide();}else{win.setBounds(bounds('collapsed'));win.showInactive();}}
function receiveNotification(input,options={show:true,report:false}){
  const source=input.source||'island';const result=store.mutate(options.report?'agent.report':'notification.add',{...input,icon:input.icon||runtime.icons[source]||''});
  win.webContents.send('state',readState());
  if(result.accepted&&options.show!==false&&!store.read().settings.quiet&&!blocked)win.webContents.send('notification',result.notification);
  return result;
}
function notify(title, body) {return receiveNotification({title,body,source:'island',transport:'mcp'});}
function act(action, input) {
  const result = store.mutate(action,input);
  if (action === 'settings.update' && typeof input.startup === 'boolean') app.setLoginItemSettings({openAtLogin:input.startup, path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'), args:app.isPackaged?[]:[app.getAppPath()]});
  if(action==='settings.update'){windows?.configure(store.read().settings);setBlocked(runtime.fullscreen);}
  win.webContents.send('state',readState());
  if (action === 'task.add'&&!input.source) notify('Новая задача',result.title);
  if (action === 'event.add') notify('Событие добавлено',result.title);
  return result;
}
async function weather() {
  const s = store.read().settings;
  const response = await net.fetch(forecastUrl(s),{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Погода временно недоступна');
  return normalizeWeather(await response.json(),s.city);
}
async function cities(name) {
  if (typeof name !== 'string' || name.length < 2 || name.length > 100) return [];
  const response = await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=ru&format=json`,{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Поиск города недоступен'); return (await response.json()).results || [];
}
async function writeReport() {
  const folder = path.join(app.getPath('desktop'),'Windows Island'); fs.mkdirSync(folder,{recursive:true});
  const file = path.join(folder,`Отчёт-${dayKey()}-${Date.now()}.md`); fs.writeFileSync(file,reportMarkdown(store.read()),'utf8');
  notify('Отчёт готов','Сохранён на рабочем столе в папке Windows Island'); return file;
}
function mcpConfig() {
  if(!server?.listening)throw new Error('Локальный MCP-мост ещё не готов или порт 47831 занят. Перезапустите Island.');
  const script=app.isPackaged?path.join(app.getPath('userData'),'mcp','server.cjs'):path.join(app.getAppPath(),'mcp','server.mjs');
  return JSON.stringify({mcpServers:{'windows-island':{command:'node',args:[script],env:{WINDOWS_ISLAND_CONNECTION:connectionFile}}}},null,2);
}
ipcMain.handle('read',()=>readState());
ipcMain.handle('act',(_,action,input)=>act(action,input));
ipcMain.on('resize',(_,value)=>{if(!['collapsed','mini','capsule','expanded','toast','dragging'].includes(value)||blocked)return;mode=value;if(['capsule','expanded'].includes(value)&&!win.isFocused())win.focus();});
ipcMain.on('hit-region',(_,value)=>{if(!value||!['x','y','width','height','radius'].every(key=>Number.isFinite(value[key])))return;hitRegion={x:value.x,y:value.y,width:Math.max(0,Math.min(440,value.width)),height:Math.max(0,Math.min(620,value.height)),radius:Math.max(0,Math.min(100,value.radius))};updateHitRegion();});
ipcMain.on('pointer-capture',(_,value)=>{pointerCaptured=value===true;updateHitRegion();});
ipcMain.handle('weather',weather);
ipcMain.handle('check-updates',()=>updater.check());
ipcMain.handle('download-update',()=>updater.download());
ipcMain.handle('restart-update',()=>updater.restart());
ipcMain.handle('cities',(_,name)=>cities(name));
ipcMain.handle('report',writeReport);
ipcMain.handle('open',(_,url)=>{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)) throw new Error('Недопустимая ссылка');return shell.openExternal(parsed.href);});
ipcMain.handle('jump',async(_,value)=>{const target=validateTarget(value);if(!target)throw new Error('У сообщения нет перехода');if(target.url)return shell.openExternal(target.url);if(!await windows.focus(target.app))throw new Error('Не удалось активировать приложение. Откройте его или передайте точную ссылку на чат/проект.');});
ipcMain.handle('notification-settings',()=>shell.openExternal('ms-settings:notifications'));
ipcMain.handle('mcp-config',mcpConfig);
ipcMain.handle('copy-config',(_,text)=>clipboard.writeText(String(text)));
ipcMain.on('quit',()=>app.quit());
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
      const allowed=['task.add','task.start','task.pause','task.complete','task.reopen','task.delete','tasks.import','event.add','event.delete','notification','agent.report','notification.read','notifications.read-all','report','weather'];
      if(!allowed.includes(action))throw new Error('Недопустимое действие');
      const result=action==='notification'?receiveNotification(input):action==='agent.report'?receiveNotification(input,{report:true}):action==='report'?await writeReport():action==='weather'?await weather():act(action,input);
      res.end(JSON.stringify({result}));
    } catch(error) {res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
  });
  server.on('error',error=>notify('MCP недоступен',error.message));
  server.listen(PORT,'127.0.0.1',()=>fs.writeFileSync(connectionFile,JSON.stringify({url:`http://127.0.0.1:${PORT}`,token})));
}
function pauseRunning(){for(const task of store?.read().tasks||[])if(task.status==='running')store.mutate('task.pause',{id:task.id});if(win&&!win.isDestroyed())win.webContents.send('state',store.read());}
app.on('before-quit',event=>{if(windows&&!quitting){event.preventDefault();quitting=true;windows.stop();setTimeout(()=>app.quit(),500);return;}pauseRunning();server?.close();try{if(connectionFile)fs.unlinkSync(connectionFile);}catch{}});
app.on('window-all-closed',()=>app.quit());
