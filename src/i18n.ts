import en from '../electron/locales/en.json';
let language:'ru'|'en'='ru';
export function setLanguage(value:'ru'|'en'){language=value;document.documentElement.lang=value;}
export const locale=()=>language==='en'?'en-US':'ru-RU';

export function t(text:string){text=text.replace(/^Error invoking remote method '[^']+': Error: /,'');if(language==='ru')return text;const key=text.trim(),value=(en as Record<string,string>)[key];if(value!==undefined)return text.replace(key,value);return text.replace(/Батарея заряжается|Подключите зарядку/g,fragment=>(en as Record<string,string>)[fragment]||fragment);}
