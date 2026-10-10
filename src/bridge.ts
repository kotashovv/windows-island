import { demo, demoState, demoWeather } from './demo';
export type Task = {id:string;title:string;notes:string;url:string;deadline:string;priority:'high'|'normal'|'low';source:string;status:'todo'|'running'|'done'|'needs_input';createdAt:string;completedAt?:string;startedAt?:string;elapsed:number;sessions:{start:string;end:string}[]};
export type CalendarEvent = {id:string;title:string;start:string;end:string;url:string;location:string;source:string};
export type JumpTarget={app:'codex'|'claude'|'slack'|'telegram'|'vscode'|'cursor';url?:string};
export type IslandNotification={id:string;source:string;appName:string;title:string;body:string;status:'info'|'completed'|'needs_input'|'failed';target:JumpTarget|null;icon:string;createdAt:string;read:boolean;eventId?:string;kind?:string};
export type Settings = {city:string;latitude:number;longitude:number;startup:boolean;glass:boolean;autoContrast:boolean;quiet:boolean;greeting:boolean;nativeNotifications:boolean;islandOnly:boolean;hideFullscreen:boolean;systemNotifications:boolean;mediaControls:boolean};
export type MediaSession={sourceId:string;sourceName:string;title:string;artist:string;playing:boolean;canToggle:boolean;canNext:boolean;canPrevious:boolean};
export type State = {tasks:Task[];events:CalendarEvent[];notifications:IslandNotification[];agentReports:{id:string;source:string;taskId:string;status:string;summary:string;title:string;createdAt:string}[];settings:Settings;runtime?:{monitor:string;notifications:string;exclusive:boolean;fullscreen:boolean;error?:string;sources?:string[];icons?:Record<string,string>;mediaAvailable?:boolean;media?:MediaSession|null;system?:{power:{present:boolean;percent:number|null;plugged:boolean|null;charging:boolean}|null;wifi:{available:boolean;connected:boolean;name:string}}}};
export type WeatherDay = {date:string;code:number;high:number;low:number;precipitation:number|null};
export type Weather = {temperature:number;code:number;high:number;low:number;city:string;updatedAt:string;days:WeatherDay[];demo?:boolean};
export type City = {name:string;country:string;admin1?:string;latitude:number;longitude:number};
export type ReleaseInfo = {available:boolean;current:string;version:string;empty?:boolean;url?:string;size?:number};
type Bridge = {read:()=>Promise<State>;act:(action:string,input:Record<string,unknown>)=>Promise<unknown>;resize:(mode:string)=>void;hitRegion:(region:{x:number;y:number;width:number;height:number;radius:number})=>void;capture:(value:boolean)=>void;weather:()=>Promise<Weather>;checkUpdates:()=>Promise<ReleaseInfo>;downloadUpdate:()=>Promise<{ready:boolean;version:string}>;restartUpdate:()=>Promise<unknown>;cities:(name:string)=>Promise<City[]>;report:()=>Promise<string>;open:(url:string)=>Promise<unknown>;jump:(target:JumpTarget)=>Promise<unknown>;mediaControl:(action:'toggle'|'next'|'previous',sourceId:string)=>Promise<unknown>;mediaSource:(sourceId:string)=>Promise<unknown>;notificationSettings:()=>Promise<unknown>;importCalendar:()=>Promise<number>;mcpConfig:()=>Promise<string>;copyConfig:(text:string)=>Promise<void>;quit:()=>void;on:(channel:string,callback:(data:any)=>void)=>()=>void};
declare global {interface Window {island?:Bridge}}
export const native = !!window.island;
const defaults:State = {tasks:[],events:[],notifications:[],agentReports:[],settings:{city:'Астрахань',latitude:46.35,longitude:48.04,startup:false,glass:true,autoContrast:true,quiet:false,greeting:true,nativeNotifications:true,islandOnly:true,hideFullscreen:true,systemNotifications:true,mediaControls:true}};
const listeners = new Map<string,Set<(data:any)=>void>>();
const emit = (channel:string,data:unknown) => listeners.get(channel)?.forEach(fn=>fn(data));
const storageKey=demo?'windows-island-demo':'windows-island';
const read = () => {try{const data=JSON.parse(localStorage.getItem(storageKey)||'null');return data?{...structuredClone(defaults),...data,settings:{...defaults.settings,...data.settings}}:(demo?demoState(structuredClone(defaults.settings)):structuredClone(defaults));}catch{return structuredClone(defaults);}};
const api = async(url:string) => {const response=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Сервис временно недоступен');return response.json();};
export const bridge:Bridge = window.island || {
  checkUpdates:async()=>{throw new Error('Обновления доступны в Windows-приложении');},downloadUpdate:async()=>{throw new Error('Обновления доступны в Windows-приложении');},restartUpdate:async()=>{},
  read:async()=>read(),resize:()=>{},hitRegion:()=>{},capture:()=>{},quit:()=>{},
  mediaControl:async(action)=>{if(!demo)throw new Error('Управление музыкой доступно в Windows-приложении');const state=read();if(state.runtime?.media&&action==='toggle')state.runtime.media.playing=!state.runtime.media.playing;localStorage.setItem(storageKey,JSON.stringify(state));emit('state',state);},
  mediaSource:async()=>{throw new Error('Открыть плеер можно в Windows-приложении');},
  on:(channel,callback)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(callback);return()=>{listeners.get(channel)?.delete(callback);};},
  act:async(action,input)=>{
    const state:State=read();let result:unknown;
    if(action==='task.add') { if(!String(input.title||'').trim())throw new Error('Введите название');const task:Task={id:crypto.randomUUID(),title:String(input.title).trim(),deadline:String(input.deadline||''),priority:input.priority==='high'?'high':input.priority==='low'?'low':'normal',status:'todo',createdAt:new Date().toISOString(),elapsed:0,sessions:[],notes:String(input.notes||''),url:String(input.url||''),source:'Вручную'};state.tasks.unshift(task);result=task; }
    else if(action.startsWith('task.')) {const task=state.tasks.find(t=>t.id===input.id);if(!task)throw new Error('Задача не найдена');const pause=(t:Task)=>{if(t.status==='running'&&t.startedAt){t.elapsed+=Date.now()-Date.parse(t.startedAt);t.sessions.push({start:t.startedAt,end:new Date().toISOString()});delete t.startedAt;t.status='todo';}};
      if(action==='task.start'){state.tasks.forEach(pause);task.status='running';task.startedAt=new Date().toISOString();}
      if(action==='task.pause')pause(task);
      if(action==='task.complete'){pause(task);task.status='done';task.completedAt=new Date().toISOString();}
      if(action==='task.reopen'){task.status='todo';delete task.completedAt;}
      if(action==='task.delete')state.tasks=state.tasks.filter(t=>t.id!==task.id);result=task;
    } else if(action==='settings.update'){Object.assign(state.settings,input);result=state.settings;}
    else if(action==='notification.read'){const notification=state.notifications.find(n=>n.id===input.id);if(notification)notification.read=true;}
    else if(action==='notifications.read-all')state.notifications.forEach(n=>n.read=true);
    else if(action==='notifications.dismiss')state.notifications=state.notifications.filter(n=>!(input.ids as string[]).includes(n.id));
    else if(action==='event.add'){const event={...input,id:crypto.randomUUID(),source:'Вручную'} as CalendarEvent;state.events.push(event);result=event;}
    else if(action==='event.delete'){state.events=state.events.filter(e=>e.id!==input.id);}
    localStorage.setItem(storageKey,JSON.stringify(state));emit('state',state);return result;
  },
  weather:async()=>{const s=read().settings;if(demo)return demoWeather(s.city);const d=await api(`https://api.open-meteo.com/v1/forecast?latitude=${s.latitude}&longitude=${s.longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`);return {temperature:Math.round(d.current.temperature_2m),code:d.current.weather_code,high:Math.round(d.daily.temperature_2m_max[0]),low:Math.round(d.daily.temperature_2m_min[0]),city:s.city,updatedAt:new Date().toISOString(),days:d.daily.time.slice(0,7).map((date:string,i:number)=>({date,code:d.daily.weather_code[i],high:Math.round(d.daily.temperature_2m_max[i]),low:Math.round(d.daily.temperature_2m_min[i]),precipitation:d.daily.precipitation_probability_max?.[i]??null}))};},
  cities:async(name)=> (await api(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=ru`)).results||[],
  open:async(url)=>{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw new Error('Неверная ссылка');window.open(url,'_blank','noopener,noreferrer');},
  jump:async(target)=>{if(target.url&&/^https?:/.test(target.url))window.open(target.url,'_blank','noopener,noreferrer');else throw new Error('Переход в приложение доступен в Windows Island для Windows');},
  notificationSettings:async()=>{throw new Error('Настройки Windows доступны в приложении');},
  report:async()=>{const state:State=read();const text=`# Windows Island · ${new Date().toLocaleDateString('ru-RU')}\n\n${state.tasks.map(t=>`- [${t.status==='done'?'x':' '}] ${t.title}${t.url?` · ${t.url}`:''}`).join('\n')||'Задач нет.'}`;const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Windows-Island-report.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return 'Отчёт скачан';},
  importCalendar:async()=>{throw new Error('Импорт .ics доступен в Windows-приложении');},
  mcpConfig:async()=>JSON.stringify({mcpServers:{'windows-island':{command:'node',args:['C:\\Users\\user\\Desktop\\window-island\\mcp\\server.mjs']}}},null,2),
  copyConfig:async(text)=>navigator.clipboard.writeText(text)
};
export const weatherLabel=(code:number)=>code===0?'Ясно':code<4?'Переменная облачность':code<50?'Туман':code<70?'Дождь':code<80?'Снег':code<95?'Ливень':'Гроза';
export const dateKey=(value=new Date())=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
