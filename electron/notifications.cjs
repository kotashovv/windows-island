const {randomUUID,createHash}=require('node:crypto');
const sources={codex:'Codex',claude:'Claude',slack:'Slack',telegram:'Telegram',vscode:'VS Code',cursor:'Cursor',island:'Windows Island',other:'Приложение'};
const protocols=new Set(['https:','http:','codex:','claude:','slack:','tg:','vscode:','cursor:','jetbrains:']);
function validateTarget(value){
  if(!value)return null;
  if(typeof value!=='object'||Array.isArray(value))throw new Error('Некорректный переход');
  const app=String(value.app||'').toLowerCase();if(!sources[app]||app==='island'||app==='other')throw new Error('Выберите поддерживаемое приложение для перехода');
  const url=String(value.url||'');if(url){const parsed=new URL(url);if(!protocols.has(parsed.protocol))throw new Error('Недопустимый протокол перехода');const own={codex:'codex:',claude:'claude:',slack:'slack:',telegram:'tg:',vscode:'vscode:',cursor:'cursor:'};if(!['https:','http:','jetbrains:'].includes(parsed.protocol)&&own[app]!==parsed.protocol)throw new Error('Протокол не соответствует приложению');if(url.length>4000)throw new Error('Ссылка слишком длинная');}
  return {app,url};
}
const canonical=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function normalizeNotification(input={}){
  const source=String(input.source||'island').toLowerCase();if(!sources[source])throw new Error('Неизвестный источник уведомления');
  const body=String(input.body||'').trim();const title=String(input.title||'').trim();if(!body&&!title)throw new Error('Укажите заголовок или текст');if(body.length>10000||title.length>300)throw new Error('Уведомление слишком длинное');
  const status=['info','completed','needs_input','failed'].includes(input.status)?input.status:'info';
  const icon=typeof input.icon==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.icon)&&input.icon.length<100000?input.icon:'';
  const kind=['charging','unplugged','battery-low','wifi-connected','wifi-disconnected','vpn-connected','vpn-disconnected'].includes(input.kind)?input.kind:'';
  const chargePercent=Number.isFinite(input.chargePercent)&&input.chargePercent>=0&&input.chargePercent<=100?input.chargePercent:null;
  return {id:randomUUID(),eventId:String(input.eventId||'').slice(0,300),source,appName:String(input.appName||sources[source]).slice(0,100),title,body,status,kind,chargePercent,target:validateTarget(input.target),icon,taskId:String(input.taskId||'').slice(0,100),createdAt:new Date().toISOString(),read:false,transport:input.transport==='windows'?'windows':input.transport==='system'?'system':'mcp',fingerprint:createHash('sha256').update(`${source}${source==='other'?`|${canonical(input.appName||sources[source])}`:''}|${canonical(body||title)}`).digest('hex')};
}
function findDuplicate(history,item,now=Date.now()){
  return history.find(previous=>{
    if(previous.source!==item.source)return false;
    if(item.eventId&&previous.eventId===item.eventId)return true;
    if(item.transport==='system'||previous.transport==='system')return false;
    const age=now-Date.parse(previous.createdAt);if(age<0||age>120000)return false;
    if(item.taskId&&previous.taskId===item.taskId&&previous.status===item.status)return true;
    return previous.fingerprint===item.fingerprint;
  });
}
function parseWindowsToast(payload,appId,id){
  let source;if(/slack/i.test(appId))source='slack';else if(/telegram/i.test(appId))source='telegram';else if(/codex/i.test(appId)&&!/runner/i.test(appId))source='codex';else if(/claude/i.test(appId)&&!/ssh/i.test(appId))source='claude';else return null;
  const bytes=Buffer.from(payload);const utf8=bytes.toString('utf8');const xml=bytes.length>1&&bytes[1]===0?bytes.toString('utf16le'):utf8;
  const decode=value=>value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim();
  const lines=[...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map(match=>decode(match[1])).filter(Boolean);if(!lines.length)return null;
  const launch=/<toast\b[^>]*\blaunch=["']([^"']+)["']/i.exec(xml)?.[1];let target={app:source,url:''};
  if(launch){try{const url=decode(launch);target=validateTarget({app:source,url});}catch{/* Relative native activation arguments fall back to focusing the application. */}}
  const full=lines.join(' ');const status=/requires? (input|attention)|clarification|нужн.{0,15}(уточнен|ответ)|требуется уточнение/i.test(full)?'needs_input':/completed|finished|выполнен|завершен/i.test(full)?'completed':'info';
  return {source,title:lines.length>1?lines[0]:'',body:lines.length>1?lines.slice(1).join('\n'):lines[0],eventId:`windows:${appId}:${id}`,status,target,transport:'windows'};
}
module.exports={normalizeNotification,findDuplicate,validateTarget,parseWindowsToast};
