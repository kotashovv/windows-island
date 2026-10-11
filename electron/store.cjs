const {normalizeShortcut}=require('./shortcut.cjs');
const {translate}=require('./locale.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {normalizeNotification,findDuplicate}=require('./notifications.cjs');

const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const defaults = () => ({ tasks: [], events: [], notifications:[], agentReports:[], settings: { activeTransparency:0,backgroundBlur:0,clipboardNotifications:true,toolsEnabled:true,shortcut:'Shift+F1',gamingOverlay:false,language:'ru',reportFolder:'',tasksEnabled:true,weatherEnabled:true,batteryNotifications:true,wifiNotifications:true,vpnNotifications:true,city: 'Астрахань', latitude: 46.35, longitude: 48.04, startup: false, glass: true, autoContrast: true, quiet: false, greeting: true, nativeNotifications:true, islandOnly:true, hideFullscreen:true,systemNotifications:true,mediaControls:true } });
function createStore(filename) {
  let data = defaults();
  if (fs.existsSync(filename)) {
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
    data = { ...data, ...saved, settings: { ...data.settings, ...saved.settings } };
  }
  const save = () => { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename + '.tmp', JSON.stringify(data, null, 2)); fs.renameSync(filename + '.tmp', filename); };
  const requiredText = (value, name) => { if (typeof value !== 'string' || !value.trim() || value.length > 5000) throw new Error(`Некорректное поле: ${name}`); return value.trim(); };
  const validateLink = value => { if (!value) return ''; const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Ссылка должна начинаться с https:// или http://'); return url.href; };
  const validDate = value => { if (!value) return ''; if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Некорректная дата'); return value; };
  function mutate(action, input = {}) {
    if((action.startsWith('task.')||action==='tasks.import')&&data.settings.tasksEnabled===false)throw new Error('Функция задач отключена в настройках');
    if(action==='notification.add'||action==='agent.report'){
      const item=normalizeNotification(input);const duplicate=findDuplicate(data.notifications,item);
      if(duplicate&&(action!=='agent.report'||data.agentReports.some(report=>report.id===duplicate.id)))return {accepted:false,duplicate:true,notification:duplicate};
      if(action==='agent.report'){
        if(!['completed','needs_input','failed'].includes(item.status))throw new Error('Укажите статус отчёта агента');
        if(item.taskId&&data.settings.tasksEnabled===false)throw new Error('Функция задач отключена в настройках');
        const task=item.taskId?data.tasks.find(t=>t.id===item.taskId):null;if(item.taskId&&!task)throw new Error('Задача отчёта не найдена');
        if(task){if(task.status==='running'){const end=Date.now();task.elapsed+=Math.max(0,end-Date.parse(task.startedAt));task.sessions.push({start:task.startedAt,end:new Date(end).toISOString()});delete task.startedAt;}task.status=item.status==='completed'?'done':'needs_input';if(item.status==='completed')task.completedAt=item.createdAt;else delete task.completedAt;}
        data.agentReports.unshift({id:duplicate?.id||item.id,source:item.source,taskId:item.taskId,status:item.status,summary:item.body,title:item.title,target:item.target,createdAt:item.createdAt});data.agentReports=data.agentReports.slice(0,1000);
      }
      if(duplicate){save();return {accepted:false,duplicate:true,reportSaved:true,notification:duplicate};}
      data.notifications.unshift(item);data.notifications=data.notifications.slice(0,300);save();return {accepted:true,duplicate:false,notification:item};
    }
    if(action==='notification.read'){const item=data.notifications.find(n=>n.id===input.id);if(item)item.read=true;save();return item||null;}
    if(action==='notifications.read-all'){data.notifications.forEach(item=>item.read=true);save();return true;}
    if(action==='notifications.dismiss'){
      if(!Array.isArray(input.ids)||input.ids.length>300||input.ids.some(id=>typeof id!=='string'))throw new Error('Передайте идентификаторы уведомлений');
      const ids=new Set(input.ids);let count=0;for(const item of data.notifications){if(ids.has(item.id)&&!item.dismissed){item.dismissed=true;item.read=true;count++;}}save();return count;
    }
    if(action==='tasks.import'){
      if(!Array.isArray(input.tasks)||!input.tasks.length||input.tasks.length>100)throw new Error('Передайте список из 1–100 задач');
      const source=String(input.source||'ИИ').slice(0,100);const prepared=input.tasks.map(item=>({...item,title:requiredText(item.title,'название'),url:validateLink(item.url),deadline:validDate(item.deadline),source}));
      const added=[],existing=[];
      for(const item of prepared){const key=String(item.externalId||'').slice(0,200);const match=data.tasks.find(t=>t.source===source&&(key?t.externalId===key:t.title===item.title&&t.deadline===item.deadline));if(match){existing.push(match.id);continue;}const task={...item,id:randomUUID(),externalId:key,notes:String(item.notes||'').slice(0,10000),priority:['high','normal','low'].includes(item.priority)?item.priority:'normal',status:'todo',createdAt:new Date().toISOString(),elapsed:0,sessions:[]};data.tasks.unshift(task);added.push(task);}
      save();return {added,existing};
    }
    if (action === 'task.add') {
      const task = { id: randomUUID(), title: requiredText(input.title, 'название'), notes: String(input.notes || '').slice(0,10000), url: validateLink(input.url), deadline: validDate(input.deadline), priority: ['high','normal','low'].includes(input.priority) ? input.priority : 'normal', source: String(input.source || 'Вручную').slice(0,100), status: 'todo', createdAt: new Date().toISOString(), elapsed: 0, sessions: [] };
      data.tasks.unshift(task); save(); return task;
    }
    if (action.startsWith('task.')) {
      const task = data.tasks.find(t => t.id === input.id); if (!task) throw new Error('Задача не найдена');
      const stop = t => { if (t.status === 'running') { const end = Date.now(); t.elapsed += Math.max(0, end - Date.parse(t.startedAt)); t.sessions.push({ start: t.startedAt, end: new Date(end).toISOString() }); delete t.startedAt; t.status = 'todo'; } };
      if (action === 'task.start') { if (task.status === 'done') throw new Error('Задача уже завершена'); data.tasks.forEach(stop); task.status = 'running'; task.startedAt = new Date().toISOString(); }
      else if (action === 'task.pause') stop(task);
      else if (action === 'task.complete') { if(task.status!=='done'){stop(task); task.status = 'done'; task.completedAt = new Date().toISOString();} if (input.notes) task.notes = String(input.notes).slice(0,10000); }
      else if (action === 'task.reopen') { if(task.status!=='done')throw new Error('Вернуть в планы можно только завершённую задачу');task.status = 'todo'; delete task.completedAt; }
      else if (action === 'task.delete') { data.tasks = data.tasks.filter(t => t.id !== task.id); }
      else throw new Error('Неизвестное действие');
      save(); return task;
    }
    if (action === 'event.add') {
      const start = validDate(input.start); const end = validDate(input.end);
      if (!start || (end && Date.parse(end) < Date.parse(start))) throw new Error('Проверьте время события');
      const event = { id: randomUUID(), title: requiredText(input.title, 'название'), start, end, url: validateLink(input.url), location: String(input.location || '').slice(0,1000), source: String(input.source || 'Вручную').slice(0,100) };
      data.events.push(event); save(); return event;
    }
    if (action === 'event.delete') { data.events = data.events.filter(e => e.id !== input.id); save(); return true; }
    if (action === 'settings.update') {
      const shortcut=input.shortcut===undefined?undefined:normalizeShortcut(input.shortcut);
      if(input.language!==undefined&&!['ru','en'].includes(input.language))throw new Error('Неподдерживаемый язык');
      if(input.reportFolder!==undefined&&(typeof input.reportFolder!=='string'||input.reportFolder.length>3000||input.reportFolder.includes('\0')||(input.reportFolder&&!path.isAbsolute(input.reportFolder))))throw new Error('Укажите абсолютный путь к папке отчётов');
      for(const key of ['activeTransparency','backgroundBlur'])if(input[key]!==undefined&&(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<0||input[key]>100))throw new Error('Некорректная настройка внешнего вида');
      if(shortcut!==undefined)data.settings.shortcut=shortcut;
      for(const key of ['activeTransparency','backgroundBlur'])if(input[key]!==undefined)data.settings[key]=input[key];
      for (const key of ['clipboardNotifications','toolsEnabled','gamingOverlay','startup','glass','autoContrast','quiet','greeting','nativeNotifications','islandOnly','hideFullscreen','systemNotifications','mediaControls','tasksEnabled','weatherEnabled','batteryNotifications','wifiNotifications','vpnNotifications']) if (typeof input[key] === 'boolean') data.settings[key] = input[key];
      if (typeof input.city === 'string' && Number.isFinite(input.latitude) && Number.isFinite(input.longitude) && Math.abs(input.latitude) <= 90 && Math.abs(input.longitude) <= 180) Object.assign(data.settings, { city: input.city.slice(0,100), latitude: input.latitude, longitude: input.longitude });
      if(input.language!==undefined){if(!['ru','en'].includes(input.language))throw new Error('Неподдерживаемый язык');data.settings.language=input.language;}
      if(input.reportFolder!==undefined){if(typeof input.reportFolder!=='string'||input.reportFolder.length>3000||input.reportFolder.includes('\0')||(input.reportFolder&&!path.isAbsolute(input.reportFolder)))throw new Error('Укажите абсолютный путь к папке отчётов');data.settings.reportFolder=input.reportFolder;}
      if(data.settings.tasksEnabled===false)for(const task of data.tasks)if(task.status==='running'){const end=Date.now();task.elapsed+=Math.max(0,end-Date.parse(task.startedAt));task.sessions.push({start:task.startedAt,end:new Date(end).toISOString()});delete task.startedAt;task.status='todo';}
      save(); return data.settings;
    }
    throw new Error('Неизвестное действие');
  }
  return { read: () => ({...structuredClone(data),notifications:structuredClone(data.notifications.filter(item=>!item.dismissed&&item.transport!=='system'))}), mutate };
}
function reportMarkdown(data, date = dayKey()) {
  const tr=text=>translate(text,data.settings?.language),locale=data.settings?.language==='en'?'en-US':'ru-RU';
  const clean = text => String(text || '').replace(/[\r\n]+/g, ' ').replace(/[\[\]<>]/g, '');
  const today = data.tasks.filter(t => dayKey(new Date(t.createdAt)) === date || (t.completedAt && dayKey(new Date(t.completedAt)) === date) || t.sessions.some(s => dayKey(new Date(s.start)) === date || dayKey(new Date(s.end)) === date) || (t.startedAt && dayKey(new Date(t.startedAt)) === date));
  const start = new Date(`${date}T00:00:00`).getTime(); const end = new Date(start); end.setDate(end.getDate()+1);
  const duration = t => { const sessions = [...t.sessions, ...(t.startedAt ? [{ start: t.startedAt, end: new Date().toISOString() }] : [])]; return Math.round(sessions.reduce((sum,s) => sum + Math.max(0, Math.min(Date.parse(s.end), end.getTime()) - Math.max(Date.parse(s.start), start)), 0)/60000); };
  return `# Windows Island · ${tr('Отчёт за')} ${date}\n\n${tr('Сформирован:')} ${new Date().toLocaleString(locale)}\n\n${tr('Завершено сегодня:')} ${today.filter(t => t.completedAt && dayKey(new Date(t.completedAt)) === date).length}\n${tr('Время работы сегодня:')} ${today.reduce((s,t) => s + duration(t), 0)} ${tr('мин')}\n\n## ${tr('Задачи')}\n\n${today.map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${clean(t.title)} — ${duration(t)} ${tr('мин')}${t.deadline ? ` · ${tr('срок:')} ${clean(t.deadline)}` : ''}${t.url ? `\n  ${tr('Ссылка:')} ${t.url}` : ''}${t.notes ? `\n  ${tr('Заметки:')} ${clean(t.notes)}` : ''}`).join('\n') || tr('Задач и рабочих сессий за этот день нет.')}\n\n## ${tr('События')}\n\n${data.events.filter(e => dayKey(new Date(e.start)) === date).map(e => `- ${new Date(e.start).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})} · ${clean(e.title)}${e.location ? ` · ${clean(e.location)}` : ''}`).join('\n') || tr('Событий нет.')}\n`;
}
module.exports = { createStore, dayKey, reportMarkdown };
