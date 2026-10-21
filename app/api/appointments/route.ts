import {env} from 'cloudflare:workers';
import {AppointmentStore,BookingError} from '../../../db/appointments';
import {withRequest} from '../result';
async function handle(request:Request){
 try{
  const store=new AppointmentStore(env.DB!);
  if(request.method==='GET')return Response.json({state:await store.snapshot()});
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Request origin not allowed.'},{status:403});
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Expected JSON.'},{status:415});
  const raw=await request.text();if(raw.length>2048)return Response.json({error:'Request too large.'},{status:413});
  let data;try{data=JSON.parse(raw)}catch{return Response.json({error:'Invalid JSON.'},{status:400});}
  if(data?.action==='initialize')return Response.json({state:await store.initialize()});
  if(data?.action!=='confirm')return Response.json({error:'Unknown appointment action.'},{status:400});
  const result=await store.confirm(data.slotId,data.requestId);
  return Response.json(result);
 }catch(e){
  if(e instanceof BookingError)return Response.json({error:e.message,code:e.code},{status:e.status});
  return Response.json({error:'The appointment database is unavailable. If you were confirming, the outcome is unknown. Retry the same confirmation to check safely.'},{status:503});
 }
}
export async function GET(r:Request){return withRequest(r,handle);}
export async function POST(r:Request){return withRequest(r,handle);}
