const assert=require('node:assert/strict');
const {load,clinic,repository,database}=require('./booking-test-utils.cjs');
async function main(){
 const {db,sql}=database(),store=new repository.AppointmentStore(db);const state=await store.initialize(),slot=state.slots[0];
 const key='AIza'+'x'.repeat(35),env={GEMINI_API_KEY:' '+key+' ',DB:db};
 const {POST}=load('app/api/converse/route.ts',{'../../demo/clinic':clinic,'../../../db/appointments':repository,'cloudflare:workers':{env},'../result':load('app/api/result.ts')});
 const request=(body,origin='https://test')=>new Request('https://test/api/converse',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const message={messages:[{role:'user',content:'What appointments are available?'}]};
 assert.equal((await POST(request(message,'https://evil'))).status,403);
 assert.equal((await POST(request({messages:[{role:'assistant',content:'wrong'}]}))).status,400);
 env.GEMINI_API_KEY='';assert.equal((await POST(request(message))).status,503);env.GEMINI_API_KEY=key;
 let calls=0;global.fetch=async(_,opts)=>{calls++;assert.equal(opts.headers['x-goog-api-key'],key);return Response.json({candidates:[{content:{parts:[{functionCall:{name:'propose_booking',args:{slotId:slot.id}}}]}}]})};
 const proposed=await (await POST(request({...message,state:{anchor:'1999-01-01',bookings:[{slotId:slot.id}]}}))).json();assert.equal(proposed.proposal.id,slot.id);assert.equal(proposed.state.bookings.length,0);assert.match(proposed.reply,/Nothing has been booked/);
 assert.equal((await POST(request({action:'confirm',slotId:slot.id}))).status,400);
 await store.confirm(slot.id,crypto.randomUUID());calls=0;
 global.fetch=async(_,opts)=>{calls++;if(calls===1)return Response.json({candidates:[{content:{parts:[{functionCall:{name:'check_availability',args:{}}}]}}]});const result=JSON.parse(opts.body).contents.at(-1).parts[0].functionResponse.response;assert.equal(result.slots.length,9);assert.ok(!result.slots.some(s=>s.id===slot.id));return Response.json({candidates:[{content:{parts:[{text:'Nine appointments remain.'}]}}]})};
 assert.equal((await (await POST(request(message))).json()).reply,'Nine appointments remain.');
 global.fetch=async()=>new Response(key,{status:429});const limited=await POST(request(message));assert.equal(limited.status,502);const error=await limited.text();assert.match(error,/quota/);assert.ok(!error.includes(key));
 global.fetch=async()=>{throw Error(key)};assert.equal((await POST(request(message))).status,504);
 env.DB=undefined;assert.equal((await POST(request(message))).status,503);sql.close();
 console.log('Passed conversation: authoritative DB state, proposal without booking, live tool availability, validation, quota/network/database failure handling.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
