const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {load,clinic,repository,database}=require('./booking-test-utils.cjs');
const {AppointmentStore}=repository;
async function main(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'voice-bookings-')),file=path.join(folder,'test.sqlite');
 let connection=database(file),store=new AppointmentStore(connection.db);
 const first=await store.initialize();assert.equal(first.slots.length,10);assert.equal((await store.initialize()).slots.length,10);assert.equal(first.bookings.length,0);
 const slot=first.slots[0],key=crypto.randomUUID();
 const results=await Promise.allSettled([store.confirm(slot.id,key),store.confirm(slot.id,crypto.randomUUID())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'SLOT_TAKEN');
 const reference=results.find(r=>r.status==='fulfilled').value.booking.id;
 const repeated=await store.confirm(slot.id,key);assert.equal(repeated.duplicate,true);assert.equal(repeated.booking.id,reference);
 await assert.rejects(()=>store.confirm(first.slots[1].id,key),e=>e.code==='REQUEST_MISMATCH');
 const same=crypto.randomUUID(),both=await Promise.all([store.confirm(first.slots[1].id,same),store.confirm(first.slots[1].id,same)]);assert.equal(both[0].booking.id,both[1].booking.id);assert.equal((await store.snapshot()).bookings.length,2);
 connection.sql.close();connection=database(file,false);store=new AppointmentStore(connection.db);assert.equal((await store.confirm(slot.id,key)).booking.id,reference);assert.equal((await store.snapshot()).bookings.length,2);
 await assert.rejects(()=>store.confirm('invented',crypto.randomUUID()),e=>e.status===404);await assert.rejects(()=>store.confirm(slot.id,'bad'),e=>e.status===400);
 connection.sql.prepare('UPDATE appointment_slots SET date=? WHERE id=?').run('2020-01-01',first.slots[2].id);await assert.rejects(()=>store.confirm(first.slots[2].id,crypto.randomUUID()),e=>e.code==='SLOT_EXPIRED');
 const env={DB:connection.db},route=load('app/api/appointments/route.ts',{'cloudflare:workers':{env},'../../../db/appointments':repository,'../result':load('app/api/result.ts')});
 const req=(body,origin='https://test')=>new Request('https://test/api/appointments',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await route.POST(req({action:'confirm',slotId:slot.id,requestId:key},'https://evil'))).status,403);
 assert.equal((await route.POST(req({action:'reset'}))).status,400);
 const retry=await route.POST(req({action:'confirm',slotId:slot.id,requestId:key}));assert.equal(retry.status,200);assert.equal((await retry.json()).booking.id,reference);assert.ok(retry.headers.get('X-Request-ID'));
 env.DB={prepare(){throw Error('secret-database-error')},batch(){throw Error('secret-database-error')}};
 const outage=await route.GET(new Request('https://test/api/appointments'));assert.equal(outage.status,503);assert.ok(!(await outage.text()).includes('secret-database-error'));
 connection.sql.close();fs.rmSync(folder,{recursive:true});console.log('Passed real SQLite: seed idempotency, competing bookings, concurrent identical retries, key mismatch, persistence after reopen, expired/invalid slots, origin checks, no reset, outage redaction.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
