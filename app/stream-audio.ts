import {ServiceError} from './request';

// A fresh instance belongs to one reply. Stopping permanently invalidates it,
// including any network chunks already in flight.
export class StreamAudio {
 private context:AudioContext;
 private nodes=new Set<AudioBufferSourceNode>();
 private stopped=false;
 private next=0;
 private tail=new Uint8Array(0);
 private chunks:Uint8Array[]=[];
 private size=0;
 private rate=44100;
 private finish: (()=>void)|null=null;
 private inputEnded=false;
 private firstScheduled:number|null=null;
 constructor(context:AudioContext){this.context=context;}
 stop(){
  if(this.stopped)return;this.stopped=true;
  for(const node of this.nodes){node.onended=null;try{node.stop()}catch{}node.disconnect();}
  this.nodes.clear();this.chunks=[];this.tail=new Uint8Array(0);this.finish?.();
 }
 private enqueue(bytes:Uint8Array){
  const joined=new Uint8Array(this.tail.length+bytes.length);joined.set(this.tail);joined.set(bytes,this.tail.length);
  const size=joined.length-joined.length%2;this.tail=joined.slice(size);if(!size)return;
  const buffer=this.context.createBuffer(1,size/2,this.rate),samples=buffer.getChannelData(0),view=new DataView(joined.buffer);
  for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
  const node=this.context.createBufferSource();node.buffer=buffer;node.connect(this.context.destination);this.nodes.add(node);
  node.onended=()=>{node.disconnect();this.nodes.delete(node);if(this.inputEnded&&!this.nodes.size)this.finish?.();};
  this.next=Math.max(this.next,this.context.currentTime+0.06);node.start(this.next);if(this.firstScheduled===null)this.firstScheduled=performance.now()+Math.max(0,this.next-this.context.currentTime)*1000;this.next+=buffer.duration;
 }
 async play(text:string,signal:AbortSignal,onFirst:(ms:number)=>void,onTiming?:(chunk:number,playback:number)=>void):Promise<Blob|null>{
  if(this.stopped||signal.aborted)return null;
  if(this.context.state!=='running')throw new ServiceError('Audio needs your permission. Tap Retry audio only to enable playback.');
  const controller=new AbortController(),cancel=()=>{controller.abort();this.stop();};
  signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(),60000);let playbackTimer:ReturnType<typeof setTimeout>|undefined,reference='',reader:ReadableStreamDefaultReader<Uint8Array>|undefined,first=true;
  const began=performance.now();
  try{
   const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,stream:true}),signal:controller.signal});
   reference=response.headers.get('X-Request-ID')||'';
   if(!response.ok){const data=await response.json().catch(()=>null) as {error?:unknown}|null;throw new ServiceError((typeof data?.error==='string'?data.error:'')||(response.status===401||response.status===403?'Your page session may have expired. Refresh and sign in again.':'Speech generation failed. Retry audio only.'),reference,response.status);}
   if(!response.headers.get('Content-Type')?.startsWith('audio/pcm')||response.headers.get('X-Audio-Encoding')!=='pcm_s16le'||response.headers.get('X-Audio-Sample-Rate')!=='44100'||!response.body)throw new ServiceError('The server returned an unsupported audio stream. Retry audio only.',reference);
   reader=response.body.getReader();
   while(true){
    const {done,value}=await reader.read();if(this.stopped||signal.aborted)return null;if(done)break;if(!value?.length)continue;
    this.size+=value.length;if(this.size>16*1024*1024)throw new ServiceError('The audio stream exceeded its size limit. Retry a shorter reply.',reference);
    const arrived=performance.now();this.chunks.push(value);this.enqueue(value);
    if(first&&this.nodes.size){first=false;onTiming?.(arrived,this.firstScheduled!);onFirst(Math.round(performance.now()-began));}
   }
   if(!this.size||this.tail.length)throw new ServiceError(this.size?'The audio stream ended with an incomplete sample. Retry audio only.':'The audio stream was empty. Retry audio only.',reference);
   clearTimeout(timer);this.inputEnded=true;
   // Completion means the last scheduled sample has played, not just downloaded.
   if(this.nodes.size)await new Promise<void>((resolve,reject)=>{this.finish=resolve;playbackTimer=setTimeout(()=>{reject(new ServiceError('Playback stalled. Tap Retry audio only to resume.',reference));this.stop();},Math.ceil(Math.max(0,this.next-this.context.currentTime)*1000)+10000);});
   if(this.stopped||signal.aborted)return null;
   const header=new ArrayBuffer(44),view=new DataView(header),write=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
   write(0,'RIFF');view.setUint32(4,36+this.size,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,this.rate,true);view.setUint32(28,this.rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,this.size,true);
   return new Blob([header,...this.chunks as Uint8Array<ArrayBuffer>[]],{type:'audio/wav'});
  }catch(e){
   this.stop();if(signal.aborted)return null;
   if(e instanceof ServiceError)throw e;
   throw new ServiceError(controller.signal.aborted?'The audio stream timed out. Your reply text is preserved; retry audio only.':typeof navigator!=='undefined'&&navigator.onLine===false?'You are offline. Reconnect and retry audio only.':'The audio stream was interrupted. Your reply text is preserved; retry audio only.',reference);
  }finally{clearTimeout(timer);clearTimeout(playbackTimer);signal.removeEventListener('abort',cancel);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
}
