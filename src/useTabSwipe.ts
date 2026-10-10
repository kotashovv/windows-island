import {useEffect,useRef} from 'react';
export function useTabSwipe(enabled:boolean,tab:string,select:(tab:'today'|'notifications')=>void){
  const latest=useRef({enabled,tab,select});latest.current={enabled,tab,select};
  useEffect(()=>{
    let distance=0,last=0,lockedUntil=0;
    const wheel=(event:WheelEvent)=>{
      const state=latest.current;
      if(!state.enabled||!['today','notifications'].includes(state.tab)||event.ctrlKey||event.shiftKey||!(event.target instanceof Element)||!event.target.closest('.panel')||event.target.closest('input,textarea,select')||Math.abs(event.deltaX)<=Math.abs(event.deltaY)*1.3||Math.abs(event.deltaX)<1)return;
      event.preventDefault();const now=performance.now();if(now<lockedUntil){lockedUntil=now+180;return;}
      const delta=event.deltaX*(event.deltaMode===1?16:event.deltaMode===2?300:1);
      if(now-last>220||Math.sign(delta)!==Math.sign(distance))distance=0;last=now;distance+=delta;
      if(Math.abs(distance)>=65){state.select(distance>0?'notifications':'today');distance=0;lockedUntil=now+550;}
    };
    window.addEventListener('wheel',wheel,{passive:false});return()=>window.removeEventListener('wheel',wheel);
  },[]);
}
