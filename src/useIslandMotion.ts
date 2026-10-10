import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { bridge } from './bridge';
export type Mode='collapsed'|'toast'|'expanded';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
export function useIslandMotion(initial:Mode){
  const [mode,setMode]=useState<Mode>(initial),[progress,setProgress]=useState(initial==='expanded'?2:0),[dragging,setDragging]=useState(false),[motionBlur,setMotionBlur]=useState(0);
  const current=useRef(progress),frame=useRef(0),velocity=useRef(0),modeRef=useRef(mode),suppress=useRef(0);
  const drag=useRef<{id:number;y:number;pull:number;origin:number;moved:boolean;element:HTMLElement}|null>(null);
  const write=(n:number)=>{current.current=n;setProgress(n);};
  function change(next:Mode,blur=false){
    const moving=frame.current!==0;
    modeRef.current=next;setMode(next);cancelAnimationFrame(frame.current);frame.current=0;if(!moving)velocity.current=0;const target=next==='expanded'?2:next==='toast'?1:0;
    setMotionBlur(0);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){write(target);return;}
    let previous=0;const step=(time:number)=>{const dt=previous?Math.min((time-previous)/1000,.024):1/60;previous=time;velocity.current+=(260*(target-current.current)-21*velocity.current)*dt;write(current.current+velocity.current*dt);if(blur)setMotionBlur(Math.min(1.6,Math.abs(velocity.current)*.12));if(Math.abs(target-current.current)<.0005&&Math.abs(velocity.current)<.015){write(target);setMotionBlur(0);frame.current=0;}else frame.current=requestAnimationFrame(step);};frame.current=requestAnimationFrame(step);
  }
  function finish(cancel=false){
    const value=drag.current;if(!value)return;drag.current=null;setDragging(false);bridge.capture(false);if(value.element.hasPointerCapture(value.id))value.element.releasePointerCapture(value.id);if(!value.moved)return;
    suppress.current=performance.now()+300;const q=cancel?value.origin:current.current;change(q<.55?'collapsed':q<1.55?'toast':'expanded');
  }
  const handlers={
    onPointerDown:(event:PointerEvent<HTMLElement>)=>{if(event.button!==0||!event.isPrimary||drag.current)return;if((event.target as HTMLElement).closest('button:not(.island-handle):not(.notification-text),a,input,textarea,select'))return;cancelAnimationFrame(frame.current);setMotionBlur(0);velocity.current=0;const q=current.current;drag.current={id:event.pointerId,y:event.clientY,pull:q<=1?q*90:90+(q-1)*210,origin:q,moved:false,element:event.currentTarget};bridge.capture(true);event.currentTarget.setPointerCapture(event.pointerId);},
    onPointerMove:(event:PointerEvent<HTMLElement>)=>{const value=drag.current;if(!value||event.pointerId!==value.id)return;const delta=event.clientY-value.y;if(!value.moved&&Math.abs(delta)<3)return;value.moved=true;setDragging(true);event.preventDefault();const pull=value.pull+delta;write(pull<0?-.06*(1-Math.exp(pull/45)):pull<=90?pull/90:pull<=300?1+(pull-90)/210:2+.1*(1-Math.exp(-(pull-300)/100)));},
    onPointerUp:()=>finish(),onPointerCancel:()=>finish(true),onLostPointerCapture:()=>finish(true)};
  useEffect(()=>{const blur=()=>finish(true);window.addEventListener('blur',blur);return()=>{cancelAnimationFrame(frame.current);window.removeEventListener('blur',blur);};},[]);
  return {mode,modeRef,progress,dragging,motionBlur,change,handlers,finish,isDragging:()=>!!drag.current,consumeClick:()=>performance.now()<suppress.current};
}
