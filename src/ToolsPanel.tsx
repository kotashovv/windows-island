import {useEffect,useState} from 'react';
import {ArrowLeft,FolderOpen,LoaderCircle,Monitor,Square,Video} from 'lucide-react';
import {bridge,native,type CaptureOptions,type CaptureRegion,type CaptureSource,type RecordingState} from './bridge';
import {t} from './i18n';
import {recordingMime,startRecording,stopRecording} from './recording';

export function RecordingControls({state,compact=false,onExpand,onError}:{state?:RecordingState;compact?:boolean;onExpand?:()=>void;onError:(message:string)=>void}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(state?.status!=='recording')return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[state?.status]);
  if(!state||state.status==='idle')return null;
  const seconds=state.startedAt?Math.max(0,Math.floor((now-Date.parse(state.startedAt))/1000)):0;
  const duration=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
  return <div className={`recording-live ${compact?'compact':''}`} role="status"><span className="record-dot"/><button className="record-label" onClick={onExpand} disabled={!onExpand}><strong>{t(state.status==='saving'?'Сохраняем ролик…':state.status==='starting'?'Подготовка записи…':'Запись экрана')}</strong><small>{state.status==='recording'?duration:t('Пожалуйста, подождите')}</small></button>{state.status==='saving'?<LoaderCircle size={17} className="spin"/>:<button className="record-stop" aria-label={t('Остановить запись')} onClick={()=>void stopRecording().catch(error=>onError(error.message))}><Square size={14} fill="currentColor"/></button>}</div>;
}
export function ToolsPanel({state,onError}:{state?:RecordingState;onError:(message:string)=>void}){
  const [opened,setOpened]=useState(false),[sources,setSources]=useState<CaptureSource[]>([]),[sourceId,setSource]=useState(''),[area,setArea]=useState<'screen'|'region'>('screen'),[region,setRegion]=useState<CaptureRegion|null>(null),[audio,setAudio]=useState<CaptureOptions['audio']>('system'),[microphones,setMicrophones]=useState<MediaDeviceInfo[]>([]),[microphone,setMicrophone]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const active=state?.status&&state.status!=='idle';
  useEffect(()=>{if(!opened||!native)return;let live=true;bridge.recordSources().then(value=>{if(live){setSources(value);setSource(value[0]?.id||'');}}).catch(error=>{if(live)setError(error.message);});navigator.mediaDevices.enumerateDevices().then(devices=>{if(live)setMicrophones(devices.filter(device=>device.kind==='audioinput'));}).catch(()=>{});return()=>{live=false;};},[opened]);
  async function selectRegion(){setBusy(true);setError('');try{const result=await bridge.recordRegion(sourceId);if(result)setRegion(result);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function start(){setBusy(true);setError('');try{await startRecording({sourceId,area,...(region?{region}:{}),audio,microphone,mime:recordingMime()});}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  return <div className="tools-panel">
    {!opened&&!active?<div className="tools-grid"><button className="tool-tile" onClick={()=>setOpened(true)}><span className="tool-circle"><Video size={26} strokeWidth={1.5}/></span><span>{t('Запись экрана')}</span></button></div>:<>
      {!active&&<button className="text-action" onClick={()=>{setOpened(false);setError('');}}><ArrowLeft size={14}/>{t('Все инструменты')}</button>}
      {active?<RecordingControls state={state} onError={onError}/>:native?<div className="record-options">
        <label>{t('Экран')}<select aria-label={t('Экран')} value={sourceId} onChange={event=>{setSource(event.target.value);setRegion(null);}}>{sources.map((source,index)=><option key={source.id} value={source.id}>{t('Экран')} {index+1} · {source.width} × {source.height}</option>)}</select></label>
        <div className="record-segment" aria-label={t('Область записи')}><button aria-pressed={area==='screen'} onClick={()=>setArea('screen')}><Monitor size={15}/>{t('Весь экран')}</button><button aria-pressed={area==='region'} onClick={()=>setArea('region')}>{t('Область')}</button></div>
        {area==='region'&&<button className="region-select" disabled={busy||!sourceId} onClick={()=>void selectRegion()}>{t(region?'Изменить область':'Выбрать область')}{region&&<small>{Math.round(region.width*100)}% × {Math.round(region.height*100)}%</small>}</button>}
        <label>{t('Звук')}<select aria-label={t('Звук')} value={audio} onChange={event=>setAudio(event.target.value as CaptureOptions['audio'])}><option value="none">{t('Без звука')}</option><option value="microphone">{t('Микрофон')}</option><option value="system">{t('Звук компьютера')}</option><option value="both">{t('Микрофон + компьютер')}</option></select></label>
        {(audio==='microphone'||audio==='both')&&<label>{t('Микрофон')}<select aria-label={t('Устройство микрофона')} value={microphone} onChange={event=>setMicrophone(event.target.value)}><option value="">{t('Устройство по умолчанию')}</option>{microphones.filter(device=>device.deviceId&&device.deviceId!=='default'&&device.deviceId!=='communications').map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label||`${t('Микрофон')} ${index+1}`}</option>)}</select></label>}
        <p className="description">{t('Видео сохраняется в Видео / Windows Island. Звук компьютера — с устройства Windows по умолчанию.')}<br/>{t('Island не попадает в запись. Формат: WebM.')}</p>
        <button className="primary-button start-recording" disabled={busy||!sourceId||area==='region'&&!region} onClick={()=>void start()}>{busy?<LoaderCircle size={15} className="spin"/>:<Video size={15}/>} {t('Начать запись')}</button>
      </div>:<p className="empty">{t('Запись экрана доступна в Windows-приложении')}</p>}
    </>}
    {(error||state?.error)&&<p className="record-error" role="alert">{t(error||state?.error||'')}</p>}
    {state?.lastFile&&!active&&<div className="record-saved"><strong>{t('Ролик создан')}</strong><small>{state.lastFile.name}</small><button className="text-action" onClick={()=>void bridge.recordOpenFolder(state.lastFile!.id).catch(error=>onError(error.message))}><FolderOpen size={14}/>{t('Открыть папку')}</button></div>}
  </div>;
}
