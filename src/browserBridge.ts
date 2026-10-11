import {demo,demoState,demoWeather} from './demo';
import type {State,Bridge,Task,CalendarEvent} from './bridge';
const defaults:State = {tasks:[],events:[],notifications:[],agentReports:[],settings:{agentIndicators:true,activeTransparency:0,backgroundBlur:0,clipboardNotifications:true,toolsEnabled:true,shortcut:'Shift+F1',gamingOverlay:false,language:'ru',reportFolder:'',tasksEnabled:true,weatherEnabled:true,batteryNotifications:true,wifiNotifications:true,vpnNotifications:true,city:'Астрахань',latitude:46.35,longitude:48.04,startup:false,glass:true,autoContrast:true,quiet:false,greeting:true,nativeNotifications:true,islandOnly:true,hideFullscreen:true,systemNotifications:true,mediaControls:true}};
const listeners = new Map<string,Set<(data:any)=>void>>();
const emit = (channel:string,data:unknown) => listeners.get(channel)?.forEach(fn=>fn(data));
const storageKey=demo?'windows-island-demo':'windows-island';
const withDemoResources=(state:State)=>{if(demo)state.runtime={...state.runtime!,resources:state.settings.gamingOverlay?{updatedAt:new Date().toISOString(),cpu:24,gpu:72,cpuTemp:58,gpuTemp:65,fps:120,ramUsed:8.6,ramTotal:16,ramPercent:54}:null};return state;};
const read = () => {try{const data=JSON.parse(localStorage.getItem(storageKey)||'null');return withDemoResources(data?{...structuredClone(defaults),...data,settings:{...defaults.settings,...data.settings}}:(demo?demoState(structuredClone(defaults.settings)):structuredClone(defaults)));}catch{return structuredClone(defaults);}};
const api = async(url:string) => {const response=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Сервис временно недоступен');return response.json();};
const windowsOnly=async():Promise<never>=>{throw new Error('Запись экрана доступна в Windows-приложении');};
export const browserBridge:Bridge = {recordSources:windowsOnly,recordRegion:windowsOnly,recordBegin:windowsOnly,recordStarted:windowsOnly,recordChunk:windowsOnly,recordFinish:windowsOnly,recordOpenFolder:windowsOnly,
  checkUpdates:async()=>{throw new Error('Обновления доступны в Windows-приложении');},downloadUpdate:async()=>{throw new Error('Обновления доступны в Windows-приложении');},restartUpdate:async()=>{},
  agentHooks:async()=>{throw new Error('Только в приложении Windows');},captureShortcut:async()=>{},pin:()=>{},setShortcut:async(value)=>{await browserBridge.act('settings.update',{shortcut:value});return value;},read:async()=>read(),resize:()=>{},hitRegion:()=>{},capture:()=>{},contextMenu:()=>{},
  mediaControl:async(action)=>{if(!demo)throw new Error('Управление музыкой доступно в Windows-приложении');const state=read();if(state.runtime?.media&&action==='toggle')state.runtime.media.playing=!state.runtime.media.playing;localStorage.setItem(storageKey,JSON.stringify(state));emit('state',state);},
  mediaSource:async()=>{throw new Error('Открыть плеер можно в Windows-приложении');},
  on:(channel,callback)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(callback);return()=>{listeners.get(channel)?.delete(callback);};},
  act:async(action,input)=>{
    const state:State=read();let result:unknown;if(action.startsWith('task.')&&!state.settings.tasksEnabled)throw new Error('Функция задач отключена в настройках');
    if(action==='agent.activity'){const source=input.source as 'claude'|'codex';if(!['claude','codex'].includes(source))throw new Error('Invalid demo source');const agentActivity=(state.runtime?.agentActivity||[]).filter(item=>item.source!==source);if(input.status==='working')agentActivity.push({source,status:'working',sessions:1});state.runtime={monitor:'preview',notifications:'preview',exclusive:false,fullscreen:false,...state.runtime,agentActivity};result={accepted:true};}
    else if(action==='task.add') { if(!String(input.title||'').trim())throw new Error('Введите название');const task:Task={id:crypto.randomUUID(),title:String(input.title).trim(),deadline:String(input.deadline||''),priority:input.priority==='high'?'high':input.priority==='low'?'low':'normal',status:'todo',createdAt:new Date().toISOString(),elapsed:0,sessions:[],notes:String(input.notes||''),url:String(input.url||''),source:'Вручную'};state.tasks.unshift(task);result=task; }
    else if(action.startsWith('task.')) {const task=state.tasks.find(t=>t.id===input.id);if(!task)throw new Error('Задача не найдена');const pause=(t:Task)=>{if(t.status==='running'&&t.startedAt){t.elapsed+=Date.now()-Date.parse(t.startedAt);t.sessions.push({start:t.startedAt,end:new Date().toISOString()});delete t.startedAt;t.status='todo';}};
      if(action==='task.start'){state.tasks.forEach(pause);task.status='running';task.startedAt=new Date().toISOString();}
      if(action==='task.pause')pause(task);
      if(action==='task.complete'){pause(task);task.status='done';task.completedAt=new Date().toISOString();}
      if(action==='task.reopen'){task.status='todo';delete task.completedAt;}
      if(action==='task.delete')state.tasks=state.tasks.filter(t=>t.id!==task.id);result=task;
    } else if(action==='settings.update'){Object.assign(state.settings,input);if(!state.settings.tasksEnabled)for(const task of state.tasks)if(task.status==='running'&&task.startedAt){task.elapsed+=Math.max(0,Date.now()-Date.parse(task.startedAt));task.sessions.push({start:task.startedAt,end:new Date().toISOString()});delete task.startedAt;task.status='todo';}result=state.settings;}
    else if(action==='notification.read'){const notification=state.notifications.find(n=>n.id===input.id);if(notification)notification.read=true;}
    else if(action==='notifications.read-all')state.notifications.forEach(n=>n.read=true);
    else if(action==='notifications.dismiss')state.notifications=state.notifications.filter(n=>!(input.ids as string[]).includes(n.id));
    else if(action==='event.add'){const event={...input,id:crypto.randomUUID(),source:'Вручную'} as CalendarEvent;state.events.push(event);result=event;}
    else if(action==='event.delete'){state.events=state.events.filter(e=>e.id!==input.id);}
    withDemoResources(state);localStorage.setItem(storageKey,JSON.stringify(state));emit('state',state);return result;
  },
  weather:async()=>{const s=read().settings;if(demo)return demoWeather(s.city);const d=await api(`https://api.open-meteo.com/v1/forecast?latitude=${s.latitude}&longitude=${s.longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`);return {temperature:Math.round(d.current.temperature_2m),code:d.current.weather_code,high:Math.round(d.daily.temperature_2m_max[0]),low:Math.round(d.daily.temperature_2m_min[0]),city:s.city,updatedAt:new Date().toISOString(),days:d.daily.time.slice(0,7).map((date:string,i:number)=>({date,code:d.daily.weather_code[i],high:Math.round(d.daily.temperature_2m_max[i]),low:Math.round(d.daily.temperature_2m_min[i]),precipitation:d.daily.precipitation_probability_max?.[i]??null}))};},
  cities:async(name)=> (await api(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=ru`)).results||[],
  open:async(url)=>{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw new Error('Неверная ссылка');window.open(url,'_blank','noopener,noreferrer');},
  jump:async(target)=>{if(target.url&&/^https?:/.test(target.url))window.open(target.url,'_blank','noopener,noreferrer');else throw new Error('Переход в приложение доступен в Windows Island для Windows');},
  notificationSettings:async()=>{throw new Error('Настройки Windows доступны в приложении');},
  report:async()=>{const state:State=read();const text=`# Windows Island · ${new Date().toLocaleDateString('ru-RU')}\n\n${state.tasks.map(t=>`- [${t.status==='done'?'x':' '}] ${t.title}${t.url?` · ${t.url}`:''}`).join('\n')||'Задач нет.'}`;const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Windows-Island-report.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return 'Отчёт скачан';},
  chooseReportFolder:async()=>{throw new Error('Выбор папки доступен в Windows-приложении');},
  importCalendar:async()=>{throw new Error('Импорт .ics доступен в Windows-приложении');},
  mcpConfig:async()=>JSON.stringify({mcpServers:{'windows-island':{command:'node',args:['C:\\Users\\user\\Desktop\\window-island\\mcp\\server.mjs']}}},null,2),
  copyConfig:async(text)=>navigator.clipboard.writeText(text)
};

if(__ISLAND_WEB__&&demo)setInterval(()=>{const state=read();if(state.settings.gamingOverlay)emit('runtime',state.runtime);},2000);
