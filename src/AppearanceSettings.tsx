import {useEffect,useRef,useState} from 'react';
import {bridge,type Settings} from './bridge';
import {t} from './i18n';
type Appearance=Pick<Settings,'activeTransparency'|'backgroundBlur'>;
export function AppearanceSettings({settings,unavailable,onPreview}:{settings:Settings;unavailable:boolean;onPreview:(value:Appearance)=>void}){
  const [error,setError]=useState('');
  const draft=useRef<Appearance>({activeTransparency:settings.activeTransparency,backgroundBlur:settings.backgroundBlur});
  const pending=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const chain=useRef(Promise.resolve());
  const save=()=>{clearTimeout(timer.current);if(!pending.current)return;pending.current=false;const value={...draft.current};chain.current=chain.current.then(async()=>{try{await bridge.act('settings.update',value);setError('');}catch{setError(t('Не удалось сохранить внешний вид'));}});};
  useEffect(()=>()=>{save();},[]);
  function change(key:keyof Appearance,value:number){draft.current={...draft.current,[key]:value};pending.current=true;onPreview(draft.current);clearTimeout(timer.current);timer.current=setTimeout(save,180);}
  return <section className="appearance-settings" aria-label={t('Внешний вид')}>
    {([{key:'activeTransparency',label:'Прозрачность активной капсулы'},{key:'backgroundBlur',label:'Размытие фона'}] as const).map(item=><label className="appearance-slider" key={item.key}><span>{t(item.label)}<span className="appearance-value">{Math.round(settings[item.key])}%</span></span><input type="range" aria-label={t(item.label)} min="0" max="100" step="1" value={settings[item.key]} onChange={e=>change(item.key,Number(e.target.value))} onPointerUp={save} onKeyUp={save}/></label>)}
    <p className="overlay-help">{t(unavailable?'Windows не предоставила размытие. Прозрачность продолжает работать.':'Размывается фон под капсулой. Текст и иконки остаются чёткими.')}</p>
    {error&&<small role="alert">{error}</small>}
  </section>;
}
