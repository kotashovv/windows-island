import {useLayoutEffect,useState} from 'react';
import {bridge} from './bridge';
import {t} from './i18n';
export function ShortcutSettings({value,error}:{value:string;error?:string}){
  const [listening,setListening]=useState(false),[issue,setIssue]=useState('');
  useLayoutEffect(()=>{
    if(!listening)return;
    const cancel=()=>{setListening(false);void bridge.captureShortcut(false);};
    const listener=async(e:KeyboardEvent)=>{
      e.preventDefault();e.stopImmediatePropagation();
      if(e.key==='Escape'){cancel();return;}
      if(['Control','Shift','Alt','Meta'].includes(e.key))return;
      const alias:Record<string,string>={' ':'Space',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right'};
      const key=alias[e.key]||(/^[a-z]$/i.test(e.key)?e.key.toUpperCase():e.key);
      const next=[e.ctrlKey?'Control':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Super':'',key].filter(Boolean).join('+');
      try{await bridge.setShortcut(next);cancel();setIssue('');}catch(error){setIssue((error as Error).message);}
    };
    window.addEventListener('keydown',listener,true);window.addEventListener('blur',cancel);
    return()=>{window.removeEventListener('keydown',listener,true);window.removeEventListener('blur',cancel);void bridge.captureShortcut(false);};
  },[listening]);
  return <div className="shortcut-setting"><div className="setting-row"><span>{t('Вызов Island')}</span><button className="shortcut-key" aria-label={t('Изменить горячую клавишу')} onClick={async()=>{await bridge.captureShortcut(true);setIssue('');setListening(true);}}>{listening?t('Нажмите комбинацию…'):value.replace('Control','Ctrl').replaceAll('+',' + ')||t('Не назначена')}</button></div><small>{t('Работает из любого приложения. Escape — отмена.')}</small>{value&&<button className="text-action" onClick={()=>bridge.setShortcut('').catch(error=>setIssue(error.message))}>{t('Убрать горячую клавишу')}</button>}{(issue||error)&&<p className="shortcut-error" role="status">{t(issue||error||'')}</p>}</div>;
}
