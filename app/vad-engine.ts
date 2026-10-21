import type {MicVAD} from '@ricky0123/vad-web';
export type Detector=Pick<MicVAD,'start'|'pause'|'destroy'>;
export async function createDetector(stream:MediaStream,audioContext:AudioContext,callbacks:{onStart:()=>void;onEnd:(samples:Float32Array)=>void;onMisfire:()=>void;onFrame?:(speech:number)=>void}){
 const {MicVAD}=await import('@ricky0123/vad-web');
 return MicVAD.new({model:'v5',startOnLoad:true,audioContext,
  baseAssetPath:'/vad/',onnxWASMBasePath:'/vad/',
  ortConfig:ort=>{ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;},
  getStream:async()=>stream,
  positiveSpeechThreshold:0.65,negativeSpeechThreshold:0.35,
  minSpeechMs:250,preSpeechPadMs:500,redemptionMs:1000,
  submitUserSpeechOnPause:false,
  onFrameProcessed:probabilities=>callbacks.onFrame?.(probabilities.isSpeech),
  onSpeechRealStart:callbacks.onStart,onSpeechEnd:callbacks.onEnd,onVADMisfire:callbacks.onMisfire,
 });
}
export function speechWav(samples:Float32Array){
 const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);
 const word=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
 word(0,'RIFF');view.setUint32(4,36+samples.length*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const n=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,n<0?n*32768:n*32767,true);}
 return new Blob([bytes],{type:'audio/wav'});
}
