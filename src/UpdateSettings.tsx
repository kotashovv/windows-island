import {useEffect,useSyncExternalStore} from 'react';
import {Download,LoaderCircle,RefreshCw} from 'lucide-react';
import {bridge,native,type ReleaseInfo} from './bridge';
import {t} from './i18n';

// Keep an in-flight download and its ready state when the hidden panel is unmounted.
type UpdateState={release:ReleaseInfo|null;phase:'idle'|'checking'|'downloading'|'ready';progress:number;error:string};
let session:UpdateState={release:null,phase:'idle',progress:0,error:''};
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const patch=(change:Partial<UpdateState>)=>{session={...session,...change};listeners.forEach(listener=>listener());};
export function UpdateSettings(){
  const {release,phase,progress,error}=useSyncExternalStore(subscribe,()=>session);
  useEffect(()=>bridge.on('update-progress',value=>patch({progress:value})),[]);
  async function check(){patch({error:'',phase:'checking'});try{patch({release:await bridge.checkUpdates(),phase:'idle'});}catch(e){patch({error:(e as Error).message,phase:'idle'});}}
  async function download(){patch({error:'',phase:'downloading',progress:0});try{const result=await bridge.downloadUpdate();patch({release:session.release?{...session.release,version:result.version}:null,phase:'ready',progress:100});}catch(e){patch({error:(e as Error).message,phase:'idle'});}}
  return <div className="update-settings">
    <button className="text-action" onClick={()=>void check()} disabled={phase==='checking'||phase==='downloading'||!native}>{phase==='checking'?<LoaderCircle className="spinning" size={13}/>:<RefreshCw size={13}/>} {phase==='checking'?t('Проверяем…'):t('Проверить обновления')}</button>
    {!native&&<small>{t('Обновления доступны в приложении Windows.')}</small>}
    {release&&<small role="status">{release.available?`${t('Доступна версия ')}${release.version}`:release.empty?t('Пока нет опубликованных релизов.'):`${t('Установлена актуальная версия ')}${release.current}`}</small>}
    {release?.available&&phase==='idle'&&<button className="text-action" onClick={()=>void download()}><Download size={13}/> {t('Скачать обновление · ')}{Math.ceil((release.size||0)/1048576)} {t('МБ')}</button>}
    {phase==='downloading'&&<small>{t('Скачиваем · ')}{progress}%</small>}
    {phase==='ready'&&<button className="text-action" onClick={()=>bridge.restartUpdate().catch(e=>patch({error:e.message}))}>{t('Перезапустить и обновить')}</button>}
    {error&&<p className="update-error" role="alert">{t(error)}</p>}
  </div>;
}
