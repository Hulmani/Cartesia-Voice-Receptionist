import {withRequest} from '../result';
import { env } from 'cloudflare:workers';
const headers={'Cache-Control':'no-store'};
function key(){return (env as unknown as Record<string,string>).CARTESIA_API_KEY?.trim();}
export async function GET(){return Response.json({configured:Boolean(key())},{headers});}
async function handlePost(request:Request){
 const origin=request.headers.get('origin');
 if(origin!==new URL(request.url).origin)return Response.json({error:'Request origin not allowed.'},{status:403,headers});
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Expected JSON.'},{status:415,headers});
 let body;try{const raw=await request.text();if(raw.length>12000)return Response.json({error:'Request too large.'},{status:413,headers});body=JSON.parse(raw);}catch{return Response.json({error:'Invalid request.'},{status:400,headers});}
 const text=body?.text;
 if(typeof text!=='string'||!text.trim()||text.length>1000)return Response.json({error:'Enter between 1 and 1,000 characters.'},{status:400,headers});
 const requestKey=key();
 if(!requestKey)return Response.json({error:'The speech service is not configured.'},{status:503,headers});
 const streaming=body.stream===true;
 try{
 const r=await fetch('https://api.cartesia.ai/tts/bytes',{method:'POST',headers:{Authorization:`Bearer ${requestKey}`,'Cartesia-Version':'2026-08-14','Content-Type':'application/json'},body:JSON.stringify({model_id:'sonic-3.6',transcript:text.trim(),voice:'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',language:'en',output_format:{container:streaming?'raw':'wav',encoding:'pcm_s16le',sample_rate:44100}}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(45000)])});
 if(!r.ok){const message=r.status===401||r.status===403?'Cartesia rejected the API key or its permissions.':r.status===402?'Your Cartesia account needs credits.':r.status===429?'Cartesia’s rate or credit limit was reached. Please check your account and try again.':`Cartesia could not generate this clip (status ${r.status}). Please try again.`;return Response.json({error:message},{status:502,headers});}
 return new Response(r.body,{headers:streaming?{...headers,'Content-Type':'audio/pcm','X-Audio-Sample-Rate':'44100','X-Audio-Encoding':'pcm_s16le','X-Content-Type-Options':'nosniff'}:{...headers,'Content-Type':'audio/wav','Content-Disposition':'inline; filename="voice-lab.wav"'}});
 }catch{return Response.json({error:'Cartesia did not respond in time or the connection failed. Please try again.'},{status:504,headers});}
}

export async function POST(request:Request){return withRequest(request,handlePost);}
