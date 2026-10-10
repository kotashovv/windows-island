import {bridge,type CaptureOptions} from './bridge';

// This singleton outlives the expanded panel: collapsing or changing tabs cannot
// stop capture or discard chunks. All native resources exist only while recording.
type Session={id:string;streams:MediaStream[];recorder?:MediaRecorder;video?:HTMLVideoElement;canvas?:HTMLCanvasElement;context?:AudioContext;frame?:number;queue:Promise<void>;pending:number;error:string;stopping:boolean;cancelled:boolean;done:Promise<void>;resolve:()=>void};
let session:Session|null=null;
export function recordingMime(){return ['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'].find(mime=>MediaRecorder.isTypeSupported(mime))||'';}
function cleanup(value:Session){
  if(value.video&&value.frame!==undefined)value.video.cancelVideoFrameCallback(value.frame);
  value.streams.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));
  if(value.video){value.video.pause();value.video.srcObject=null;value.video.remove();}
  value.canvas?.remove();void value.context?.close().catch(()=>{});
}
export async function stopRecording(){
  const value=session;if(!value)return;value.cancelled=true;
  if(!value.recorder)cleanup(value);
  if(value.recorder&&value.recorder.state!=='inactive'&&!value.stopping){value.stopping=true;value.recorder.stop();}
  return value.done;
}
export async function startRecording(options:CaptureOptions){
  if(session)throw new Error('Запись уже запущена');
  if(!options.mime)throw new Error('Формат видео недоступен');
  let resolve!:()=>void;const done=new Promise<void>(fn=>resolve=fn);
  const value:Session={id:'',streams:[],queue:Promise.resolve(),pending:0,error:'',stopping:false,cancelled:false,done,resolve};session=value;
  async function finish(){
    cleanup(value);await value.queue;
    try{if(value.id)await bridge.recordFinish(value.id,value.error);}catch{/* main reports a truthful saved/error state, including a partial path */}
    if(session===value)session=null;value.resolve();
  }
  try{
    value.id=(await bridge.recordBegin(options)).id;
    const system=options.audio==='system'||options.audio==='both';
    const display=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30}},audio:system});value.streams.push(display);if(value.cancelled)throw new Error('Запись отменена');
    if(system&&!display.getAudioTracks().length)throw new Error('Звук компьютера недоступен');
    let microphone:MediaStream|undefined;
    if(options.audio==='microphone'||options.audio==='both'){
      try{microphone=await navigator.mediaDevices.getUserMedia({video:false,audio:{...(options.microphone?{deviceId:{exact:options.microphone}}:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}catch{throw new Error('Микрофон недоступен. Проверьте разрешения Windows и устройство.');}
      value.streams.push(microphone);
    }
    if(value.cancelled)throw new Error('Запись отменена');
    let videoTrack=display.getVideoTracks()[0];if(!videoTrack)throw new Error('Экран недоступен');
    if(options.area==='region'&&options.region){
      const video=document.createElement('video');value.video=video;video.muted=true;video.autoplay=true;video.playsInline=true;video.srcObject=new MediaStream([videoTrack]);video.style.cssText='position:fixed;left:-10000px;width:1px;height:1px;pointer-events:none';document.body.append(video);await video.play();
      const region=options.region,canvas=document.createElement('canvas');value.canvas=canvas;
      // Crop in actual capture pixels, not Windows DIP coordinates (mixed DPI safe).
      const width=video.videoWidth||videoTrack.getSettings().width||1,height=video.videoHeight||videoTrack.getSettings().height||1;
      canvas.width=Math.max(2,Math.floor(width*region.width/2)*2);canvas.height=Math.max(2,Math.floor(height*region.height/2)*2);
      const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Область записи недоступна');
      const draw=()=>{if(value.stopping||value.cancelled)return;context.drawImage(video,video.videoWidth*region.x,video.videoHeight*region.y,video.videoWidth*region.width,video.videoHeight*region.height,0,0,canvas.width,canvas.height);value.frame=video.requestVideoFrameCallback(draw);};draw();
      const crop=canvas.captureStream(30);value.streams.push(crop);videoTrack=crop.getVideoTracks()[0];
    }
    const output=new MediaStream([videoTrack]);value.streams.push(output);
    const audioStreams=[...(system?[display]:[]),...(microphone?[microphone]:[])];
    if(audioStreams.length===1)audioStreams[0].getAudioTracks().forEach(track=>output.addTrack(track));
    if(audioStreams.length===2){
      const context=new AudioContext();value.context=context;const destination=context.createMediaStreamDestination();audioStreams.forEach(stream=>context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(destination));await context.resume();destination.stream.getAudioTracks().forEach(track=>output.addTrack(track));value.streams.push(destination.stream);
    }
    if(value.cancelled)throw new Error('Запись отменена');
    const recorder=new MediaRecorder(output,{mimeType:options.mime,videoBitsPerSecond:6_000_000});value.recorder=recorder;
    recorder.ondataavailable=event=>{
      if(!event.data.size)return;value.pending++;
      if(value.pending>=3&&recorder.state==='recording')recorder.pause();
      value.queue=value.queue.then(async()=>{if(value.error)return;const bytes=await event.data.arrayBuffer();await bridge.recordChunk(value.id,bytes);}).catch(error=>{value.error=(error as Error).message;void stopRecording();}).finally(()=>{value.pending--;if(value.pending<2&&recorder.state==='paused'&&!value.stopping)recorder.resume();});
    };
    recorder.onerror=()=>{value.error='Не удалось записать видео';void stopRecording();};
    recorder.onstop=()=>{void finish();};
    display.getVideoTracks()[0].addEventListener('ended',()=>void stopRecording(),{once:true});
    recorder.start(1000);await bridge.recordStarted(value.id);
  }catch(error){value.error=(error as Error).message;if(value.recorder&&value.recorder.state!=='inactive'){void stopRecording();await done;}else await finish();throw error;}
}

export function listenRecordingStop(){return bridge.on('record-stop',()=>void stopRecording());}
