import {t,locale,setLanguage} from './i18n';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowUpRight, Bell, Check, ChevronUp, Copy, FileText, List, Link2, LoaderCircle, Music2, Pause, Play, Plus, Settings2, Sun, Timer, Trash2, X } from 'lucide-react';
import { bridge, native, dateKey, weatherLabel, type State, type Weather, type IslandNotification } from './bridge';
import { useIslandMotion, smooth, type Mode } from './useIslandMotion';
import { AnimatedDisclosure, useSpringValue } from './AnimatedDisclosure';
import { useAnimatedTasks } from './useAnimatedTasks';
import { WeatherPanel } from './WeatherPanel';
import { UpdateSettings } from './UpdateSettings';
import { demo } from './demo';
import { AppIcon } from './AppIcon';
import { MediaControls } from './MediaControls';
import { NotificationGroups } from './NotificationGroups';
import {ResourceWidgets} from './ResourceWidgets';
import {AgentIntegrationSettings} from './AgentIntegrationSettings';
import {AppearanceSettings} from './AppearanceSettings';
import {ShortcutSettings} from './ShortcutSettings';
import {useTabSwipe} from './useTabSwipe';
import {Cpu,Video,Wrench,FolderOpen} from 'lucide-react';
import {ToolsPanel,RecordingControls} from './ToolsPanel';
import {listenRecordingStop} from './recording';
import { TabTransition } from './TabTransition';
type Tab = 'today' | 'notifications' | 'connection' | 'settings' | 'weather' | 'tools';
type CompactView = 'notification' | 'music' | 'task' | 'resources' | 'recording';
const tabs: Tab[] = ['today', 'notifications', 'tools', 'connection', 'settings', 'weather'];
const tabNames = { today: 'Задачи', notifications: 'Уведомления', connection: 'Соединения', settings: 'Настройки', weather: 'Погода',tools:'Инструменты' };
const initial: State = { tasks: [], events: [], notifications: [], agentReports: [], settings: { agentIndicators:true,activeTransparency:0,backgroundBlur:0,clipboardNotifications:true,toolsEnabled:true,shortcut:'Shift+F1',gamingOverlay:false,language: 'ru', reportFolder: '', tasksEnabled: true, weatherEnabled: true, batteryNotifications: true, wifiNotifications: true, vpnNotifications: true, city: 'Астрахань', latitude: 46.35, longitude: 48.04, startup: false, glass: false, autoContrast: true, quiet: false, greeting: true, nativeNotifications: true, islandOnly: true, hideFullscreen: true, systemNotifications: true, mediaControls: true } };
const duration = (ms: number) => [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60].map(n => String(n).padStart(2, '0')).join(':');
const time = (value: string) => new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (q: number) => Math.max(0, Math.min(1, q));
const welcome: IslandNotification = { id: '', source: 'island', appName: 'Windows Island', title: 'Ваш день', body: 'Сегодня событий нет.', status: 'info', target: null, icon: '', createdAt: '', read: false };
function App() {
    const [state, setState] = useState(initial), [tab, setTabState] = useState<Tab>('today'), [weather, setWeather] = useState<Weather | null>(null), [now, setNow] = useState(Date.now()), [viewport, setViewport] = useState(window.innerWidth);
    const [notification, setNotification] = useState(welcome), [blocked, setBlocked] = useState(false), [form, setForm] = useState<'task' | 'event' | null>(null), [detail, setDetail] = useState(''), [error, setError] = useState(''), [success, setSuccess] = useState(''), [config, setConfig] = useState(''), [busy, setBusy] = useState(false), [showDone, setShowDone] = useState(false), [city, setCity] = useState('');
    const [tabDirection, setTabDirection] = useState(1);
    const [pinned,setPinned]=useState(false);const pinnedRef=useRef(false);pinnedRef.current=pinned;
    const [compactView, setCompactView] = useState<CompactView | null>(null);
    setLanguage(state.settings.language);
    const stateRef = useRef(state);
    stateRef.current = state;
    const weatherBack = useRef<Tab>('today');
    const transientTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    function setTab(next: Tab) { if (next === tab)
        return; setTabDirection(tabs.indexOf(next) > tabs.indexOf(tab) ? 1 : -1); setTabState(next); setForm(null); }
    const recording=state.runtime?.recording;
    const recordingActive=!!recording&&recording.status!=='idle';
    useEffect(()=>listenRecordingStop(),[]);
    useEffect(()=>{if(recordingActive)setCompactView('recording');},[recordingActive]);
    useEffect(()=>{if(!state.settings.toolsEnabled&&tab==='tools')setTab(state.settings.tasksEnabled?'today':'notifications');},[state.settings.toolsEnabled,tab]);
    const media = state.settings.mediaControls !== false ? state.runtime?.media : null;
    const motion = useIslandMotion(native || demo ? 'collapsed' : 'expanded');
    const [fromCapsule, setFromCapsule] = useState(false);
    const [hovered, setHovered] = useState(false);
    const restingAlpha = Math.min(.96, Math.max(.42, useSpringValue(hovered ? .96 : .42)));
    const [weatherError, setWeatherError] = useState(''), [weatherLoading, setWeatherLoading] = useState(false);
    const weatherRequest = useRef(0);
    const weatherRef=useRef(weather);weatherRef.current=weather;
    const greetingBusy=useRef(false);greetingBusy.current=blocked||pinned||recordingActive;
    const leaving = useAnimatedTasks(state.tasks);
    const visibleTasks = state.tasks.filter(task => showDone ? task.status === 'done' : task.status !== 'done' || !!leaving[task.id]);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), motionRef = useRef(motion), booted = useRef(false);
    motionRef.current = motion;
    const workingAgents=state.settings.agentIndicators?(state.runtime?.agentActivity||[]).filter(agent=>agent.status==='working').map(agent=>agent.source):[];
    const agentClass=recordingActive||!workingAgents.length?'':workingAgents.length>1?'agent-both':`agent-${workingAgents[0]}`;
    const running = state.settings.tasksEnabled ? state.tasks.find(t => t.status === 'running') : undefined;
    const focusTask = running || (state.settings.tasksEnabled ? Object.values(leaving).find(item => item.wasRunning)?.task : undefined);
    const elapsed = running ? running.elapsed + Math.max(0, now - Date.parse(running.startedAt!)) : 0;
    function changeMode(next: Mode, blur = false) { if(next==='collapsed'){setPinned(false);pinnedRef.current=false;bridge.pin(false);} setFromCapsule(next === 'expanded' && motionRef.current.modeRef.current === 'capsule'); clearTimeout(closeTimer.current); motionRef.current.change(next, blur); }
    function showNotification(item: IslandNotification) {
        clearTimeout(transientTimer.current);
        setNotification(item);
        const transient = item.transient || item.transport === 'system' || (item.source === 'island' && !!item.kind);
        if (transient)
            transientTimer.current = setTimeout(() => { setNotification(stateRef.current.notifications[0] || welcome); if(pinnedRef.current)setCompactView('resources');else if(stateRef.current.runtime?.recording?.status&&stateRef.current.runtime.recording.status!=='idle')setCompactView('recording'); if (motionRef.current.modeRef.current === 'toast')
                changeMode(pinnedRef.current?'capsule':'collapsed'); }, 3000);
        else
            setCompactView('notification');
        if (motionRef.current.modeRef.current === 'expanded' || motionRef.current.isDragging())
            return;
        changeMode('toast');
        if (!transient)
            closeTimer.current = setTimeout(() => {if(pinnedRef.current)setCompactView('resources');changeMode(pinnedRef.current?'capsule':'collapsed');}, 4000);
    }
    async function loadWeather() { if (!stateRef.current.settings.weatherEnabled)
        return null; const request = ++weatherRequest.current; setWeatherLoading(true); try {
        const value = await bridge.weather();
        if (request === weatherRequest.current) {
            setWeather(value);
            setWeatherError('');
        }
        return value;
    }
    catch (e) {
        if (request === weatherRequest.current)
            setWeatherError((e as Error).message);
        return null;
    }
    finally {
        if (request === weatherRequest.current)
            setWeatherLoading(false);
    } }
    useEffect(() => {
        let active = true;
        let greetingTimer:ReturnType<typeof setTimeout>|undefined;
        const greetingStarted=Date.now();let greetingStage=0;
        function greet(){
            const current=stateRef.current;
            if(!active||!current.settings.greeting||current.settings.quiet||Date.now()-greetingStarted>300000)return;
            if(greetingBusy.current||motionRef.current.isDragging()||motionRef.current.modeRef.current!=='collapsed'){greetingTimer=setTimeout(greet,1000);return;}
            setLanguage(current.settings.language);
            if(greetingStage===0){
                const today=dateKey();const count=current.tasks.filter(task=>task.status!=='done'&&(!task.deadline||( /^\d{4}-\d{2}-\d{2}$/.test(task.deadline)?task.deadline:dateKey(new Date(task.deadline)))<=today)).length;
                showNotification({...welcome,id:'startup-welcome',appName:'Ваш день',title:'Добро пожаловать!',body:current.settings.tasksEnabled?`${t('Задач на сегодня:')} ${count}`:t('Хорошего дня!'),kind:'greeting',transient:true,transport:'system'});
                greetingStage=1;greetingTimer=setTimeout(greet,4500);return;
            }
            if(!current.settings.weatherEnabled)return;
            const forecast=weatherRef.current;
            const degrees=(value:number)=>`${value>0?'+':''}${value}°`;
            let body=t('Не удалось получить прогноз.');
            if(forecast&&forecast.city===current.settings.city){
                const parts=[weatherLabel(forecast.days[0].code)];
                if(forecast.periods?.day!=null)parts.push(`${t('Днём')} ${degrees(forecast.periods.day)}`);
                if(forecast.periods?.evening!=null)parts.push(`${t('Вечером')} ${degrees(forecast.periods.evening)}`);
                if(forecast.periods?.day==null&&forecast.periods?.evening==null)parts.push(`${t('Максимум')} ${degrees(forecast.high)}, ${t('минимум')} ${degrees(forecast.low)}`);
                body=parts.join(' · ');
            }
            showNotification({...welcome,id:'startup-weather',appName:'Ваш день',title:`${t('Погода сегодня')} · ${current.settings.city}`,body,kind:'greeting-weather',transient:true,transport:'system'});
        }
        const off = [bridge.on('state', (value: State) => setState(value)), bridge.on('runtime', (runtime: State['runtime']) => setState(current => ({ ...current, runtime }))), bridge.on('notification', showNotification), bridge.on('expand', (value) => { motionRef.current.finish(true); changeMode(value === false ? 'collapsed' : 'expanded', true); }), bridge.on('overlay-blocked', (value) => { setBlocked(value); motionRef.current.finish(true); changeMode('collapsed'); })];
        bridge.read().then((data) => { if (!active)return;setState(data);stateRef.current=data;void loadWeather();if(native&&!booted.current){booted.current=true;greetingTimer=setTimeout(greet,20000);} }).catch(e => setError(e.message));
        const resize = () => setViewport(window.innerWidth);
        window.addEventListener('resize', resize);
        const refresh = setInterval(loadWeather, 1800000);
        return () => { active = false; off.forEach(fn => fn()); window.removeEventListener('resize', resize); clearInterval(refresh); clearTimeout(greetingTimer);clearTimeout(closeTimer.current); clearTimeout(transientTimer.current); };
    }, []);
    useEffect(() => { if (!state.settings.tasksEnabled && tab === 'today') {
        setTab('notifications');
        setDetail('');
        setForm(null);
    } if (!state.settings.weatherEnabled && tab === 'weather')
        setTab(state.settings.tasksEnabled ? 'today' : 'notifications'); }, [state.settings.tasksEnabled, state.settings.weatherEnabled, tab]);
    useEffect(() => { if (running&&!pinnedRef.current)
        setCompactView('task'); }, [running?.id]);
    useEffect(() => {if(motion.mode==='collapsed'&&!motion.dragging&&pinnedRef.current){setPinned(false);pinnedRef.current=false;bridge.pin(false);} if (motion.dragging)bridge.resize('dragging');else
        bridge.resize(motion.mode === 'collapsed' && running ? 'mini' : motion.mode); }, [motion.mode, motion.dragging, !!running]);
    useEffect(() => { const listener = (e: KeyboardEvent) => { const close = (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'w') || (e.altKey && !e.ctrlKey && e.key === 'F4'); if (close) {
        e.preventDefault();
        motionRef.current.finish(true);
        changeMode('collapsed', true);
    }
    else if (e.key === 'Escape') {
        if (form)
            setForm(null);
        else {
            motionRef.current.finish(true);
            changeMode('collapsed');
        }
    } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [form]);
    useEffect(() => { if (detail && !showDone && state.tasks.some(task => task.id === detail && task.status === 'done') && !leaving[detail])
        setDetail(''); }, [state.tasks, leaving, detail, showDone]);
    useEffect(() => { if (tab === 'connection')
        bridge.mcpConfig().then(setConfig).catch(e => setError(e.message)); }, [tab]);
    useLayoutEffect(() => { const body = document.querySelector('.panel-body'); if (body)
        body.scrollTop = 0; }, [tab]);
    async function act(action: string, input: Record<string, unknown>) { try {
        setError('');
        await bridge.act(action, input);
        return true;
    }
    catch (e) {
        setError((e as Error).message);
        return false;
    } }
    async function report() { setBusy(true); try {
        const file = await bridge.report();
        setSuccess(t("Отчёт сохранён: ") + file + "");
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function jump(item: IslandNotification) { if (!item.target)
        return; try {
        await bridge.jump(item.target);
        if (item.id)
            await act('notification.read', { id: item.id });
    }
    catch (e) {
        setError((e as Error).message);
        changeMode('expanded');
    } }
    const q = motion.progress, a = clamp(q), b = clamp(q - 1);
    useEffect(() => { if (!running || q < .6)
        return; setNow(Date.now()); const tick = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(tick); }, [running?.id, q >= .6]);
    useTabSwipe(motion.mode==='expanded'&&!motion.dragging&&state.settings.tasksEnabled,tab,setTab);
    useEffect(()=>{if(state.settings.gamingOverlay)setCompactView('resources');else{setPinned(false);pinnedRef.current=false;bridge.pin(false);}},[state.settings.gamingOverlay]);
    const latest = state.notifications[0];
    const choices: CompactView[] = [...(recordingActive?['recording' as const]:[]),...(state.settings.gamingOverlay?['resources' as const]:[]),...(latest ? ['notification' as const] : []), ...(media ? ['music' as const] : []), ...(running ? ['task' as const] : [])].slice(0,4) as CompactView[];
    const selected = compactView && choices.includes(compactView) ? compactView : choices[0] || 'notification';
    const alternatives = choices.filter(view => view !== selected);
    const baseW = 132, baseH = 26, baseY = -12, available = Math.min(416, viewport - 24);
    const taller = useSpringValue(tab === 'weather' ? 580 : form || tab === 'settings' || tab === 'connection' || tab==='tools' || detail ? 540 : 340);
    const satelliteSpace = motion.mode !== 'toast' ? (alternatives.length ? alternatives.length * 46 + 2 : 0) * (1 - smooth((q - 1) / .38)) : 0;
    const offset = satelliteSpace * a / 2;
    const width = mix(Math.min(baseW, available), available - satelliteSpace, a), height = mix(mix(baseH, 88, a), taller, b) + Math.max(0, q - 2) * 75, top = 12 + mix(baseY, 20, a) + Math.max(0, q - 2) * 24 + Math.min(0, q) * 20, radius = mix(mix(18, 50, a), 36, b);
    const activeAlpha=Math.max(0,Math.min(1,1-state.settings.activeTransparency/100));
    const surfaceAlpha=clamp(mix(restingAlpha,useSpringValue(pinned&&motion.mode==='capsule'&&!hovered ? activeAlpha*.22 : activeAlpha),smooth(a)));
    const blurProgress=smooth(a);
    const style: CSSProperties = { width, height, top, marginLeft: -offset, borderRadius: radius, background: `rgba(0,0,0,${surfaceAlpha})`, backdropFilter:!native&&state.settings.backgroundBlur>0?`blur(${state.settings.backgroundBlur/5*blurProgress}px)`:'none', boxShadow: `inset 0 0 0 1px rgba(255,255,255,${mix(0, .14, smooth(a))})`, filter: motion.motionBlur > .01 ? `blur(${motion.motionBlur.toFixed(2)}px)` : 'none' };
    const showingCompact = motion.dragging || motion.mode === 'capsule' || (motion.mode === 'expanded' && fromCapsule);
    const showingResources=showingCompact&&selected==='resources'&&motion.mode!=='toast';
    const resourceOpacity=showingResources?smooth((q-.12)/.6)*(1-smooth((q-1)/.38)):0;
    const showingMedia = showingCompact && selected === 'music' && !!media && motion.mode !== 'toast';
    const showingToast = motion.mode === 'toast' || (showingCompact && selected === 'notification');
    const compactOpacity = showingCompact && selected === 'task' && running ? smooth((q - .12) / .6) * (1 - smooth((q - 1) / .38)) : 0;
    const toastOpacity = showingToast ? smooth((q - .12) / .6) * (1 - smooth((q - 1) / .38)) : 0, expandedOpacity = smooth((q - 1.18) / .45);
    const compactNotification = motion.mode === 'toast' ? notification : latest || welcome;
    const hasAlternatives = showingCompact && motion.mode !== 'toast' && alternatives.length > 0;
    useLayoutEffect(() => { const x = (viewport - width) / 2 - offset; bridge.hitRegion({ backdrop:blurProgress, blurStrength:state.settings.backgroundBlur, x, y: top, width, height, radius, satellites: hasAlternatives && q > .65 && q < 1.38 ? alternatives.map((_, i) => ({ x: x + width + 10 + i * 46, y: top + 25, width: 38, height: 38, radius: 19 })) : [] }); }, [viewport, width, height, top, radius, offset, hasAlternatives, alternatives.length, q, blurProgress, state.settings.backgroundBlur]);
    return <div className={`${native ? 'native' : 'preview'} ${blocked ? 'blocked' : ''}`}>
    {__ISLAND_WEB__ && !native && <><div className="demo-workspace" aria-hidden="true"><div className="demo-sidebar"><strong>{t("Рабочее пространство")}</strong><small>{t("Проекты")}</small><span>{t("Новый интерфейс")}</span><span>{t("Материалы")}</span><span>{t("Команда")}</span></div><div className="demo-document"><small>{t("ПРОЕКТ · ОБЗОР")}</small><h1>{t("Место для вашей работы.")}</h1><p>{t("Island остаётся рядом и появляется, когда нужен.")}</p><div className="demo-lines"><i /><i /><i /></div><div className="demo-tiles"><div><small>{t("Сегодня")}</small><strong>{t("Работа над макетом")}</strong><p>{t("Идеи, детали и последние изменения.")}</p></div><div><small>{t("Далее")}</small><strong>{t("Планы на завтра")}</strong><p>{t("Задачи, которые можно передать агенту.")}</p></div></div></div></div><nav className="preview-controls" aria-label={t("Управление демо")}><span>{t("Интерактивное демо")}</span><button onClick={()=>void act('agent.activity',{source:'claude',sessionId:'demo-claude',status:workingAgents.includes('claude')?'idle':'working'})}>Claude</button><button onClick={()=>void act('agent.activity',{source:'codex',sessionId:'demo-codex',status:workingAgents.includes('codex')?'idle':'working'})}>Codex</button><button onClick={() => changeMode('collapsed', true)}>{t("Полоска")}</button><button onClick={() => changeMode('capsule', true)}>{t("Капсула")}</button><button onClick={() => changeMode('expanded', true)}>{t("Раскрыть")}</button><button onClick={() => { setTab('weather'); changeMode('expanded', true); void loadWeather(); }}>{t("Погода")}</button><button onClick={()=>showNotification({...welcome,id:crypto.randomUUID(),kind:'charging',transient:true,transport:'system',chargePercent:63,title:'Зарядка подключена',body:'63% · Батарея заряжается',appName:'Батарея'})}>Зарядка</button><button onClick={()=>showNotification({...welcome,id:crypto.randomUUID(),kind:'unplugged',transient:true,transport:'system',chargePercent:63,title:'Зарядка отключена',body:'63%',appName:'Батарея'})}>Без зарядки</button></nav><button className="preview-demo" onClick={() => showNotification({ ...welcome, title: t("Задача выполнена"), body: t("Изменения готовы к просмотру."), source: 'codex', appName: 'Codex' })}>{t("Пример уведомления")}</button></>}
    <main className={`island-capsule ${motion.dragging ? 'dragging' : ''} ${hasAlternatives ? 'has-alternatives' : ''} ${pinned?'is-pinned':''}`} data-agents={workingAgents.join(',')} data-pinned={pinned} data-compact-view={selected} data-mode={motion.dragging ? 'dragging' : motion.mode === 'collapsed' && running ? 'mini' : motion.mode} data-progress={q.toFixed(4)} style={{ ...style, '--agent-animation-state':q<.25?'running':'paused','--active-alpha':activeAlpha,'--background-blur':`${state.settings.backgroundBlur/5}px`,'--orb-space': `${alternatives.length * 46 + 22}px` } as CSSProperties} {...motion.handlers} onContextMenu={e => { if (native) {
        e.preventDefault();
        motion.finish(true);
        bridge.contextMenu();
    } }} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onPointerDown={e => { clearTimeout(closeTimer.current); motion.handlers.onPointerDown(e); }} onPointerUp={() => { motion.handlers.onPointerUp(); if (motionRef.current.modeRef.current === 'toast')
        closeTimer.current = setTimeout(() => {if(pinnedRef.current)setCompactView('resources');changeMode(pinnedRef.current?'capsule':'collapsed');}, 4000);
    else
        bridge.resize(motionRef.current.modeRef.current === 'collapsed' && running ? 'mini' : motionRef.current.modeRef.current); }} onClickCapture={e => { if (motion.consumeClick()) {
        e.preventDefault();
        e.stopPropagation();
    } }} onClick={e => { if (e.target === e.currentTarget && q < .5)
        changeMode('capsule', true); }}>
      <button className={`island-handle ${agentClass} ${recordingActive?'recording':running&&!workingAgents.length ? 'tracking' : ''}`} aria-label={t("Открыть Island")} inert={q >= .25} style={{ opacity: (1 - smooth(q / .28)) * mix(.65, 1, (restingAlpha - .42) / .54), pointerEvents: q < .25 ? 'auto' : 'none' }} onClick={() => changeMode('capsule', true)}><span /></button>
      {showingToast && toastOpacity > .01 && ['charging', 'unplugged'].includes(compactNotification.kind || '') && <div key={`charge-${compactNotification.id}`} className={`charge-effect ${compactNotification.kind}`} aria-hidden="true" style={{ opacity: toastOpacity, '--charge': `${compactNotification.chargePercent ?? 0}%` } as CSSProperties}><div className="charge-fill"><i /><i /></div></div>}
      {resourceOpacity>.01&&<div className="compact-resources-slot" style={{opacity:resourceOpacity,pointerEvents:resourceOpacity>.9&&!motion.dragging?'auto':'none'}} inert={resourceOpacity<.9||motion.dragging}><ResourceWidgets data={state.runtime?.resources} compact pinned={pinned} onPin={()=>{const next=!pinned;setPinned(next);pinnedRef.current=next;bridge.pin(next);}} onExpand={()=>changeMode('expanded',true)}/></div>}
      {recordingActive&&<div className="compact-recording-slot" style={{opacity:showingCompact&&selected==='recording'&&motion.mode!=='toast'?smooth((q-.12)/.6)*(1-smooth((q-1)/.38)):0,pointerEvents:showingCompact&&selected==='recording'&&q>.9&&q<1.2&&!motion.dragging?'auto':'none'}} inert={!showingCompact||selected!=='recording'||q<.9||q>1.2||motion.dragging} aria-hidden={!showingCompact||selected!=='recording'||q<.9||q>1.2}><RecordingControls state={recording} compact onExpand={()=>{setTab('tools');changeMode('expanded',true);}} onError={setError}/></div>}
      <div className="compact-focus" style={{ opacity: compactOpacity, pointerEvents: compactOpacity > .9 && !motion.dragging ? 'auto' : 'none' }} inert={compactOpacity < .9 || motion.dragging} aria-hidden={compactOpacity < .01}><span className="live-dot"/><button className="compact-task" aria-label={t("Раскрыть Island")} onClick={() => changeMode('expanded', true)}><small>{t("В процессе")}</small><strong>{running?.title}</strong><span className="mini-timer"><Timer size={14}/>{duration(elapsed)}</span></button><button className="go-button" aria-label={t("Раскрыть Island")} onClick={() => changeMode('expanded', true)}><ArrowUpRight size={16}/></button></div>
      <div className="compact-media-slot" style={{ opacity: showingMedia ? smooth((q - .12) / .6) * (1 - smooth((q - 1) / .38)) : 0, pointerEvents: showingMedia && q > .9 && q < 1.2 && !motion.dragging ? 'auto' : 'none' }} inert={!showingMedia || q < .9 || q > 1.2 || motion.dragging} aria-hidden={!showingMedia}>{media && <MediaControls media={media} compact onExpand={() => changeMode('expanded', true)} onError={message => { setError(message); changeMode('expanded'); }}/>}</div>
      <div className={`notification ${compactNotification.kind ? `system-toast ${compactNotification.kind}` : ''}`} key={compactNotification.id || compactNotification.kind || 'welcome'} style={{ opacity: toastOpacity, pointerEvents: toastOpacity > .9 && !motion.dragging ? 'auto' : 'none', transform: `translateY(${(1 - toastOpacity) * 5}px)` }} inert={toastOpacity < .9 || motion.dragging} aria-hidden={toastOpacity < .01}><AppIcon item={compactNotification}/><button className="notification-text" onClick={() => changeMode('expanded', true)}><small>{t(compactNotification.appName)}{t(" · сейчас")}</small><strong>{compactNotification.source==='island'?t(compactNotification.title):compactNotification.title}</strong><p>{compactNotification.source==='island'?t(compactNotification.body):compactNotification.body}</p></button>{compactNotification.recordingId&&<button className="go-button" aria-label={t('Открыть папку')} onClick={()=>void bridge.recordOpenFolder(compactNotification.recordingId!).catch(error=>setError(error.message))}><FolderOpen size={16}/></button>}{compactNotification.target && <button className="go-button" onClick={() => jump(compactNotification)}>{t("Перейти")}<ArrowUpRight size={13}/></button>}</div>
      <div className="compact-alternatives" style={{ opacity: hasAlternatives ? smooth((q - .12) / .6) * (1 - smooth((q - 1) / .38)) : 0, pointerEvents: hasAlternatives && q > .9 && q < 1.2 && !motion.dragging ? 'auto' : 'none' }} inert={!hasAlternatives || q < .9 || q > 1.2 || motion.dragging} aria-hidden={!hasAlternatives}>{alternatives.map(view => <button key={view} className={`compact-orb orb-${view}`} aria-label={view==='recording'?t('Показать запись'):view==='resources'?t('Показать ресурсы'):view === 'music' ? t("Показать музыку") : view === 'task' ? t("Показать активную задачу") : t("Показать уведомление")} title={view==='recording'?t('Запись экрана'):view==='resources'?t('Ресурсы'):view === 'music' ? media?.title : view === 'task' ? running?.title : latest?.title} onClick={() => setCompactView(view)}>{view==='recording'?<Video size={17}/>:view==='resources'?<Cpu size={17}/>:view === 'music' ? <Music2 size={17}/> : view === 'task' ? <Timer size={17}/> : latest ? <AppIcon item={latest}/> : <Bell size={17}/>}</button>)}</div>
      {q > 1.04 && <section className="panel" style={{ opacity: expandedOpacity, pointerEvents: expandedOpacity > .95 && !motion.dragging ? 'auto' : 'none', transform: `translateY(${(1 - expandedOpacity) * 8}px)` }} inert={expandedOpacity < .95 || motion.dragging} aria-hidden={expandedOpacity < .01}>
        <header><strong>{t(tabNames[tab])}</strong><div className="header-actions">{state.settings.tasksEnabled && <button aria-label={t("Задачи")} aria-pressed={tab === 'today'} onClick={() => setTab('today')}><List size={16}/></button>}<button aria-label={t("Уведомления")} aria-pressed={tab === 'notifications'} onClick={() => setTab('notifications')} className={state.notifications.some(n => !n.read) ? 'unread' : ''}><Bell size={16}/></button>{state.settings.toolsEnabled&&<button aria-label={t('Инструменты')} aria-pressed={tab==='tools'} onClick={()=>setTab('tools')}><Wrench size={16}/></button>}<button aria-label={t("Соединения")} aria-pressed={tab === 'connection'} onClick={() => setTab('connection')}><Link2 size={16}/></button><button aria-label={t("Свернуть Island")} onClick={() => changeMode('collapsed', true)}><ChevronUp size={17}/></button></div></header>
        <div className="panel-body" key="body">{state.settings.gamingOverlay&&<ResourceWidgets data={state.runtime?.resources}/>}<TabTransition tab={tab} direction={tabDirection}>
          {(notification.transient || notification.transport === 'system' || (notification.source === 'island' && !!notification.kind)) && <div className="system-inline" role="status"><AppIcon item={notification}/><div><strong>{t(notification.title)}</strong><p>{t(notification.body)}</p></div>{notification.recordingId&&<button className="go-button" aria-label={t('Открыть папку')} onClick={()=>void bridge.recordOpenFolder(notification.recordingId!).catch(error=>setError(error.message))}><FolderOpen size={14}/></button>}</div>}
          {error && <div className="message error" role="alert"><span>{t(error)}</span><button aria-label={t("Закрыть ошибку")} onClick={() => setError('')}><X size={14}/></button></div>}{success && <div className="message" role="status"><span>{success}</span><button aria-label={t("Закрыть сообщение")} onClick={() => setSuccess('')}><X size={14}/></button></div>}
          {tab === 'today' && state.settings.tasksEnabled && <>{media && <MediaControls media={media} onError={setError}/>}
            {latest && <div className="activity"><AppIcon item={latest}/><button className="activity-text" onClick={() => setTab('notifications')}><small>{latest.appName}</small><strong>{latest.title || latest.body}</strong><p>{latest.title ? latest.body : ''}</p></button>{latest.target && <button className="go-button" onClick={() => jump(latest)}>{t("Перейти")}</button>}</div>}
            <AnimatedDisclosure open={!!focusTask} className="focus-disclosure-content">{focusTask && <div className="focus-card"><span className="live-dot"/><strong>{focusTask.title}</strong><span>{duration(running ? elapsed : focusTask.elapsed)}</span>{focusTask.status === 'done' ? <Check className="focus-completed" size={15}/> : <><button aria-label={t("Остановить таймер")} onClick={() => act('task.pause', { id: focusTask.id })}><Pause size={15}/></button><button aria-label={t("Завершить")} onClick={() => act('task.complete', { id: focusTask.id })}><Check size={15}/></button></>}</div>}</AnimatedDisclosure>
            <div className="section-title"><button onClick={() => setShowDone(!showDone)}>{showDone ? t("Завершённые") : t("Задачи")} <small>{state.tasks.filter(t => t.status !== 'done').length}</small></button><button className="add-button" aria-label={t("Добавить задачу")} onClick={() => setForm(form === 'task' ? null : 'task')}><Plus size={17}/></button></div>
            {form === 'task' && <EntryForm kind="task" onClose={() => setForm(null)} onSubmit={async (input) => { if (await act('task.add', input))
                setForm(null); }}/>}
            <div className="task-list">{visibleTasks.map(task => <div id={`task-${task.id}`} className={`task-row ${task.status} ${!showDone && leaving[task.id] ? 'completing' : ''}`} style={{ '--exit-height': `${leaving[task.id]?.height || 59}px` } as CSSProperties} key={task.id}><div className="task-main"><button className="task-check" disabled={!!leaving[task.id]} aria-label={task.status === 'done' ? t("Вернуть в планы") : t("Завершить задачу")} onClick={() => act(task.status === 'done' ? 'task.reopen' : 'task.complete', { id: task.id })}>{task.status === 'done' && <Check size={11}/>}</button><button className="task-text" aria-expanded={detail === task.id} onClick={() => setDetail(detail === task.id ? '' : task.id)}><strong>{task.title}</strong><small>{task.status === 'needs_input' ? t("Нужно уточнение · ") : ''}{task.deadline ? `${new Date(task.deadline).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}${task.deadline.includes('T') ? ` · ${time(task.deadline)}` : ''}` : t("Без дедлайна")}</small></button>{task.status !== 'done' && <button className="task-play" aria-label={task.status === 'running' ? t("Пауза") : t("Запустить задачу")} onClick={() => act(task.status === 'running' ? 'task.pause' : 'task.start', { id: task.id })}>{task.status === 'running' ? <Pause size={14}/> : <Play size={14}/>}</button>}</div><AnimatedDisclosure open={detail === task.id}><p>{task.notes || t("Заметок нет.")}</p><small>{t("Время работы: ")}{duration(task.elapsed + (task.startedAt ? now - Date.parse(task.startedAt) : 0))}</small><div>{task.url && <button onClick={() => bridge.open(task.url).catch(e => setError(e.message))}>{t("Открыть ссылку")}<ArrowUpRight size={13}/></button>}<button aria-label={t("Удалить задачу")} onClick={() => act('task.delete', { id: task.id })}><Trash2 size={14}/></button></div></AnimatedDisclosure></div>)}{visibleTasks.length === 0 && <p className="empty">{showDone ? t("Завершённых задач пока нет.") : t("Добавьте задачу или передайте план через MCP.")}</p>}</div></>}
          {tab==='tools'&&state.settings.toolsEnabled&&<ToolsPanel state={recording} onError={setError}/>}
          {recordingActive&&tab!=='tools'&&<RecordingControls state={recording} onExpand={()=>setTab('tools')} onError={setError}/>}
          {tab === 'weather' && <WeatherPanel weather={weather} loading={weatherLoading} error={weatherError} onRetry={() => void loadWeather()} onSettings={() => setTab('settings')}/>}
          {tab === 'notifications' && <><button className="text-action" onClick={() => act('notifications.read-all', {})}>{t("Отметить прочитанными")}</button><NotificationGroups items={state.notifications} onRead={id => void act('notification.read', { id })} onDismiss={ids => act('notifications.dismiss', { ids })} onJump={item => void jump(item)}/></>}
          {tab === 'connection' && <><AgentIntegrationSettings/><p className="description">{t("Codex, Claude и другие агенты передают сюда задачи, уведомления и результаты через MCP.")}</p><div className="code-block"><button onClick={() => bridge.copyConfig(config).then(() => setSuccess(t("Конфигурация скопирована"))).catch(e => setError(e.message))}><Copy size={13}/>{t("Копировать")}</button><pre>{config || t("Загружаем конфигурацию…")}</pre></div><p className="description">{t("Для подключения нужен Node.js. Отчёты: island_report_work. Списки: island_import_tasks.")}</p><small>{native ? t("Локальный мост · 127.0.0.1:47831") : t("MCP работает в Windows-приложении.")}</small></>}
          {tab === 'settings' && <><AppearanceSettings settings={state.settings} unavailable={state.runtime?.backdrop==='unavailable'} onPreview={values=>setState(current=>({...current,settings:{...current.settings,...values}}))}/><ShortcutSettings value={state.settings.shortcut} error={state.runtime?.shortcutError}/><div className="setting-row"><span>{t('Игровой оверлей')}</span><button role="switch" aria-label={t('Игровой оверлей')} aria-checked={state.settings.gamingOverlay} className={`toggle ${state.settings.gamingOverlay?'on':''}`} onClick={()=>act('settings.update',{gamingOverlay:!state.settings.gamingOverlay})}><span/></button></div><p className="overlay-help">{t('Ресурсы в капсуле. Зафиксируйте её, чтобы оставить поверх игры. Температуры: LibreHardwareMonitor с WMI. FPS: RTSS для активной игры. Без источника — «—».')}</p><label className="setting-row">{t("Язык")}<select aria-label={t("Язык")} value={state.settings.language} onChange={e => void act('settings.update', { language: e.target.value })}><option value="ru">{t("Русский")}</option><option value="en">English</option></select></label><div className="report-folder"><span>{t("Папка отчётов")}</span><small title={state.settings.reportFolder}>{state.settings.reportFolder || t("Рабочий стол / Windows Island")}</small><button className="text-action" onClick={() => bridge.chooseReportFolder().catch(e => setError(e.message))}>{t("Выбрать папку")}</button>{state.settings.reportFolder && <button className="text-action" onClick={() => act('settings.update', { reportFolder: '' })}>{t("По умолчанию")}</button>}</div><label className="city-label">{t("Погода · ")}{state.settings.city}<form onSubmit={async (e) => { e.preventDefault(); try {
            const found = await bridge.cities(city);
            if (!found.length)
                throw new Error(t("Город не найден"));
            await act('settings.update', { city: found[0].name, latitude: found[0].latitude, longitude: found[0].longitude });
            await loadWeather();
            setCity('');
        }
        catch (e) {
            setError((e as Error).message);
        } }}><input aria-label={t("Город")} placeholder={t("Название города")} minLength={2} required value={city} onChange={e => setCity(e.target.value)}/><button>{t("Сохранить")}</button></form></label>{([{key:'agentIndicators',label:t('Индикаторы работы ИИ')},{ key:'toolsEnabled',label:t('Инструменты')},{key:'clipboardNotifications',label:t('Уведомления о копировании')},{ key: 'tasksEnabled', label: t("Задачи и учёт времени") }, { key: 'weatherEnabled', label: t("Погода") }, { key: 'batteryNotifications', label: t("Батарея и зарядка") }, { key: 'wifiNotifications', label: t("События Wi-Fi") }, { key: 'vpnNotifications', label: t("События VPN") }, { key: 'quiet', label: t("Не беспокоить") }, { key: 'greeting', label: t("Сводка при запуске") }, { key: 'startup', label: t("Запуск вместе с Windows") }, { key: 'nativeNotifications', label: t("Уведомления Windows") }, { key: 'islandOnly', label: t("Уведомления только в Island") }, { key: 'hideFullscreen', label: t("Скрывать в полноэкранном режиме") }, { key: 'systemNotifications', label: t("Системные уведомления") }, { key: 'mediaControls', label: t("Управление музыкой") }] as const).map(item => <div className="setting-row" key={item.key}><span>{item.label}</span><button role="switch" aria-label={item.label} aria-checked={state.settings[item.key]} className={`toggle ${state.settings[item.key] ? 'on' : ''}`} onClick={() => act('settings.update', { [item.key]: !state.settings[item.key] })}><span /></button></div>)}<button className="text-action" onClick={() => bridge.notificationSettings().catch(e => setError(e.message))}>{t("Настройки уведомлений Windows")}<ArrowUpRight size={12}/></button><small className="runtime-info">{state.runtime?.notifications === 'ready' ? t("Уведомления Windows подключены") : state.runtime?.error || t("Подключение уведомлений Windows…")}</small><UpdateSettings />{state.settings.tasksEnabled && <button className="text-action" onClick={report} disabled={busy}>{busy ? <LoaderCircle size={14}/> : <FileText size={14}/>}{t("Отчёт дня")}</button>}<div className="settings-footer"><small>Windows Island 0.3.8</small></div></>}
        </TabTransition></div><footer>{state.settings.weatherEnabled ? <button aria-label={tab === 'weather' ? t("Вернуться назад") : t("Погода")} onClick={() => { if (tab === 'weather')
            setTab(weatherBack.current);
        else {
            weatherBack.current = tab;
            setTab('weather');
            void loadWeather();
        } }}>{tab === 'weather' ? <><ArrowLeft size={14}/>{t("Вернуться назад")}</> : <><Sun size={14}/>{weather ? `${weather.temperature > 0 ? '+' : ''}${weather.temperature}° · ${weather.city}` : t("Погода")}</>}</button> : <span />}<button aria-label={tab === 'settings' ? t("Закрыть настройки") : t("Настройки")} aria-pressed={tab === 'settings'} onClick={() => setTab(tab === 'settings' ? (state.settings.tasksEnabled ? 'today' : 'notifications') : 'settings')}>{tab === 'settings' ? <X size={16}/> : <Settings2 size={16}/>}</button></footer>
      </section>}
    </main>
  </div>;
}
function EntryForm({ kind, onClose, onSubmit }: {
    kind: 'task' | 'event';
    onClose: () => void;
    onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
    const [saving, setSaving] = useState(false), [issue, setIssue] = useState('');
    return <form className="entry-form" onSubmit={async (e) => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); if (values.url) {
        try {
            if (!['https:', 'http:'].includes(new URL(String(values.url)).protocol))
                throw new Error();
        }
        catch {
            setIssue(t("Ссылка должна начинаться с http:// или https://"));
            return;
        }
    } const input: Record<string, unknown> = { ...values }; for (const field of ['deadline', 'start', 'end'])
        if (values[field])
            input[field] = new Date(String(values[field])).toISOString(); setSaving(true); try {
        await onSubmit(input);
    }
    finally {
        setSaving(false);
    } }}>
    <div className="form-heading"><strong>{kind === 'task' ? t("Новая задача") : t("Новое событие")}</strong><button type="button" aria-label={t("Закрыть форму")} onClick={onClose}><X size={14}/></button></div><input name="title" aria-label={t("Название")} placeholder={t("Название")} required maxLength={500}/>
    {kind === 'task' ? <><textarea name="notes" aria-label={t("Заметки")} placeholder={t("Заметки")} rows={2}/><label>{t("Дедлайн")}<input name="deadline" type="datetime-local"/></label><select name="priority" aria-label={t("Приоритет")} defaultValue="normal"><option value="normal">{t("Обычный")}</option><option value="high">{t("Высокий")}</option><option value="low">{t("Низкий")}</option></select></> : <><label>{t("Начало")}<input name="start" type="datetime-local" required/></label><label>{t("Окончание")}<input name="end" type="datetime-local"/></label><input name="location" aria-label={t("Место")} placeholder={t("Место")}/></>}
    <input name="url" type="url" aria-label={t("Ссылка")} placeholder={t("https:// — ссылка")}/>{issue && <p role="alert">{issue}</p>}<button className="primary-button" disabled={saving}>{saving ? t("Сохраняем…") : t("Добавить")}</button>
  </form>;
}
export default App;
