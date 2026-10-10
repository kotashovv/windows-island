import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
export function TabTransition({tab,direction,children}:{tab:string;direction:number;children:ReactNode}){
  const previous=useRef({tab,children}),[outgoing,setOutgoing]=useState<ReactNode>(null);
  useLayoutEffect(()=>{
    if(previous.current.tab!==tab){setOutgoing(previous.current.children);const timer=setTimeout(()=>setOutgoing(null),480);return()=>clearTimeout(timer);}
  },[tab]);
  useLayoutEffect(()=>{previous.current={tab,children};});
  return <div className="tab-transition" style={{'--tab-direction':direction} as CSSProperties}>{outgoing&&<div className="tab-outgoing" inert aria-hidden="true">{outgoing}</div>}<div key={tab} className="tab-incoming">{children}</div></div>;
}
