const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

function validRegion(value){
  if(!value||!['x','y','width','height'].every(key=>Number.isFinite(value[key])))throw new Error('Выберите область записи');
  const {x,y,width,height}=value;
  if(x<0||y<0||width<=0||height<=0||x+width>1.00001||y+height>1.00001)throw new Error('Выберите область записи');
  return {x,y,width,height};
}
class RecordingFiles {
  constructor({folder,onState=()=>{},onSaved=()=>{}}){this.folder=folder;this.onState=onState;this.onSaved=onSaved;this.active=null;this.saved=new Map();this.state={status:'idle'};}
  update(change){this.state={...this.state,...change};this.onState(this.state);}
  async begin(options){
    if(this.active)throw new Error('Запись уже запущена');
    if(!['none','microphone','system','both'].includes(options.audio)||!['screen','region'].includes(options.area))throw new Error('Некорректные параметры записи');
    if(options.area==='region')validRegion(options.region);
    if(typeof options.sourceId!=='string'||!options.sourceId.startsWith('screen:'))throw new Error('Выберите экран');
    const extension=options.mime?.startsWith('video/mp4')?'mp4':options.mime?.startsWith('video/webm')?'webm':null;
    if(!extension)throw new Error('Формат видео недоступен');
    const id=randomUUID(),name=`Windows-Island-${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`,file=path.join(this.folder,name);
    // Reserve before awaiting filesystem work: a second start cannot race this one.
    const active={id,file,partial:file+'.partial',bytes:0,queue:Promise.resolve(),error:null,handle:null,options,finishing:false};this.active=active;
    try{await fs.mkdir(this.folder,{recursive:true});active.handle=await fs.open(active.partial,'wx');this.update({status:'starting',id,startedAt:null,error:'',lastFile:this.state.lastFile});return {id};}
    catch(error){this.active=null;throw error;}
  }
  started(id){const active=this.check(id);this.update({status:'recording',startedAt:new Date().toISOString(),audio:active.options.audio,area:active.options.area});}
  check(id){if(!this.active||this.active.id!==id)throw new Error('Запись больше не активна');return this.active;}
  append(id,bytes){
    const active=this.check(id);if(active.finishing)throw new Error('Запись сохраняется');
    if(!(bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(bytes))throw new Error('Некорректные данные видео');
    const buffer=bytes instanceof ArrayBuffer?Buffer.from(bytes):Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(buffer.length>16*1024*1024)throw new Error('Фрагмент записи слишком большой');
    const write=active.queue.then(async()=>{if(active.error)throw active.error;let offset=0;while(offset<buffer.length){const result=await active.handle.write(buffer,offset,buffer.length-offset);if(!result.bytesWritten)throw new Error('Не удалось сохранить запись');offset+=result.bytesWritten;}active.bytes+=buffer.length;});
    active.queue=write.catch(error=>{active.error=error;});return write;
  }
  async finish(id,error=''){
    const active=this.check(id);if(active.finishing)throw new Error('Запись сохраняется');active.finishing=true;this.update({status:'saving'});
    try{
      await active.queue;await active.handle.sync();await active.handle.close();active.handle=null;
      if(error||active.error||!active.bytes)throw active.error||new Error(error||'Пустая запись не сохранена');
      await fs.rename(active.partial,active.file);const lastFile={id:active.id,name:path.basename(active.file),bytes:active.bytes};this.saved.set(id,active.file);while(this.saved.size>20)this.saved.delete(this.saved.keys().next().value);
      this.update({status:'idle',id:undefined,startedAt:null,error:'',lastFile});this.onSaved(lastFile);return lastFile;
    }catch(failure){
      await active.handle?.close().catch(()=>{});
      if(!active.bytes)await fs.unlink(active.partial).catch(()=>{});
      this.update({status:'idle',id:undefined,startedAt:null,error:failure.message+(active.bytes?' · '+active.partial:'')});throw failure;
    }finally{this.active=null;}
  }
  async emergencyClose(){const active=this.active;if(!active)return;await active.queue;await active.handle?.close().catch(()=>{});if(!active.bytes)await fs.unlink(active.partial).catch(()=>{});this.active=null;}
  folderFor(id){const file=this.saved.get(id);if(!file)throw new Error('Ролик не найден');return path.dirname(file);}
}
module.exports={RecordingFiles,validRegion};
