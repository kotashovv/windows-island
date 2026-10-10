import { useState } from 'react';
import { ArrowUpRight, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { bridge, type MediaSession } from './bridge';
export function MediaControls({media,onExpand,onError,compact=false}:{media:MediaSession;onExpand?:()=>void;onError:(message:string)=>void;compact?:boolean}){
  const [pending,setPending]=useState(false);
  async function control(action:'toggle'|'next'|'previous'){setPending(true);try{await bridge.mediaControl(action,media.sourceId);}catch(e){onError((e as Error).message);}finally{setPending(false);}}
  return <div className={`media-controls ${compact?'compact-media':''}`}>
    <span className={`media-art ${media.playing?'playing':''}`}><Music2 size={19}/><i/><i/><i/></span>
    <div className="media-description"><button onClick={onExpand} disabled={!onExpand}><strong>{media.title||'Музыка'}</strong></button><small>{media.artist||media.sourceName}</small><button className="media-source" aria-label="Открыть источник музыки" onClick={()=>bridge.mediaSource(media.sourceId).catch(e=>onError(e.message))}>{media.sourceName}<ArrowUpRight size={10}/></button></div>
    <div className="media-buttons"><button aria-label="Предыдущий трек" disabled={pending||!media.canPrevious} onClick={()=>void control('previous')}><SkipBack size={15}/></button><button className="media-toggle" aria-label={media.playing?'Приостановить музыку':'Включить музыку'} disabled={pending||!media.canToggle} onClick={()=>void control('toggle')}>{media.playing?<Pause size={17}/>:<Play size={17}/>}</button><button aria-label="Следующий трек" disabled={pending||!media.canNext} onClick={()=>void control('next')}><SkipForward size={15}/></button></div>
  </div>;
}
