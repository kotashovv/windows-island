const en=require('./locales/en.json');
function translate(text,language='ru'){if(language!=='en')return text;const key=text.trim();return en[key]?text.replace(key,en[key]):text.replace(/Батарея заряжается|Подключите зарядку/g,part=>en[part]||part);}
module.exports={translate};
