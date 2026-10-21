import {withRequest} from '../result';
import { env } from 'cloudflare:workers';
const headers={'Cache-Control':'no-store'};
const fail=(error:string,status:number)=>Response.json({error},{status,headers});
async function handlePost(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('Request origin not allowed.',403);
 if(!request.headers.get('content-type')?.includes('multipart/form-data'))return fail('Expected an audio upload.',415);
 const key=(env as unknown as Record<string,string>).CARTESIA_API_KEY?.trim();
 if(!key)return fail('The transcription service is not configured.',503);
 const limit=9*1024*1024;
 if(Number(request.headers.get('content-length'))>limit)return fail('Recording is too large. Record up to 60 seconds.',413);
 let form:FormData;
 try{
  if(!request.body)return fail('Missing recording.',400);
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return fail('Recording is too large. Record up to 60 seconds.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();
 }catch{return fail('Could not read the recording. Please record again.',400);}
 const file=form.get('file');
 if(!(file instanceof File)||!file.size)return fail('Record some audio first.',400);
 if(file.size>8*1024*1024)return fail('Recording is too large. Record up to 60 seconds.',413);
 const type=file.type.split(';')[0];
 const extensions:Record<string,string>={'audio/webm':'webm','video/webm':'webm','audio/mp4':'m4a','video/mp4':'mp4','audio/ogg':'ogg','application/ogg':'ogg','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3'};
 if(!extensions[type])return fail('This audio format is unsupported. Try recording in Safari or Chrome.',415);
 const upload=new FormData();upload.append('file',file,'recording.'+extensions[type]);upload.append('model','ink-whisper');upload.append('language','en');
 try{
  const r=await fetch('https://api.cartesia.ai/stt',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Cartesia-Version':'2026-08-14'},body:upload,signal:AbortSignal.timeout(60000)});
  if(!r.ok)return fail(r.status===401||r.status===403?'Cartesia rejected the key or its speech-recognition permissions.':r.status===429||r.status===402?'Cartesia’s credit or rate limit was reached. Check your account and try again.':`Cartesia could not transcribe the recording (status ${r.status}). Try again.`,502);
  const result=await r.json() as {text?:unknown};
  if(typeof result.text!=='string')return fail('Cartesia returned an unexpected response. Please try again.',502);
  return Response.json({text:result.text},{headers});
 }catch{return fail('Transcription timed out or the connection failed. Your recording is still available to retry.',504);}
}

export async function POST(request:Request){return withRequest(request,handlePost);}
