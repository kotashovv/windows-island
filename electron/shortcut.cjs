const modifiers=['Control','Alt','Shift','Super'];
function normalizeShortcut(value){
  if(value==='')return '';
  if(typeof value!=='string'||value.length>80)throw new Error('Недопустимая горячая клавиша');
  const parts=value.split('+'),key=parts.pop();
  if(!key||!(/^(F([1-9]|1\d|2[0-4])|[A-Z0-9]|Space|Home|End|PageUp|PageDown|Insert|Delete|Up|Down|Left|Right)$/.test(key))||parts.some(p=>!modifiers.includes(p))||new Set(parts).size!==parts.length||(!parts.length&&!/^F\d+$/.test(key)))throw new Error('Недопустимая горячая клавиша');
  const canonical=[...modifiers.filter(p=>parts.includes(p)),key].join('+');
  if(['Alt+F4','Control+W'].includes(canonical))throw new Error('Эта комбинация сворачивает Island. Выберите другую.');
  return canonical;
}
function installShortcut(api,previous,next,callback){
  next=normalizeShortcut(next);
  if(next===previous&&(!next||api.isRegistered(next)))return next;
  if(next&&!api.register(next,callback))throw new Error('Комбинация занята другим приложением');
  if(previous&&previous!==next)api.unregister(previous);
  return next;
}
module.exports={normalizeShortcut,installShortcut};
