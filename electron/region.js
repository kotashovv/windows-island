const box=document.getElementById('box');let start=null,rect=null;
const point=event=>({x:Math.max(0,Math.min(innerWidth,event.clientX)),y:Math.max(0,Math.min(innerHeight,event.clientY))});
document.addEventListener('pointerdown',event=>{if(event.button!==0)return;start=point(event);rect=null;box.hidden=false;document.body.setPointerCapture(event.pointerId);});
document.addEventListener('pointermove',event=>{if(!start)return;const end=point(event);rect={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};Object.assign(box.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});});
document.addEventListener('pointerup',()=>{if(!start)return;start=null;if(!rect||rect.width<16||rect.height<16){box.hidden=true;return;}window.selection.finish({x:rect.x/innerWidth,y:rect.y/innerHeight,width:rect.width/innerWidth,height:rect.height/innerHeight});});
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.selection.finish(null);});
