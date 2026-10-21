import clinic from './clinic.json';
export {clinic};
export type Slot={id:string;date:string;time:string;therapistId:string;therapist:string;serviceId:string;service:string;minutes:number;priceCAD:number};
export type Booking={id:string;slotId:string;patient:string};
export type DemoState={anchor:string;bookings:Booking[]};
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:clinic.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function initialState():DemoState{return {anchor:today(),bookings:[]};}
export function slotsFor(anchor:string):Slot[]{return clinic.slotTemplates.map(t=>{const date=new Date(anchor+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+t.dayOffset);while(date.getUTCDay()===0||date.getUTCDay()===6)date.setUTCDate(date.getUTCDate()+1);const service=clinic.services.find(s=>s.id===t.serviceId)!;return {id:t.id,date:date.toISOString().slice(0,10),time:t.time,therapistId:t.therapistId,therapist:clinic.therapists.find(p=>p.id===t.therapistId)!.name,serviceId:service.id,service:service.name,minutes:service.minutes,priceCAD:service.priceCAD};});}
export function parseState(value:unknown):DemoState{
 const s=value as DemoState;
 if(!s||typeof s.anchor!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.anchor)||!Number.isFinite(Date.parse(s.anchor+'T12:00:00Z'))||Math.abs(Date.parse(s.anchor)-Date.parse(today()))>7*86400000||!Array.isArray(s.bookings)||s.bookings.length>3)throw Error('Invalid demo state. Reset the demo.');
 const seen=new Set<string>();
 for(const b of s.bookings){if(!b||!clinic.slotTemplates.some(t=>t.id===b.slotId)||seen.has(b.slotId)||b.id!=='DEMO-'+b.slotId||b.patient!=='Demo Patient')throw Error('Invalid demo booking. Reset the demo.');seen.add(b.slotId);}
 return {anchor:s.anchor,bookings:s.bookings.map(b=>({id:b.id,slotId:b.slotId,patient:b.patient}))};
}
export function confirmBooking(state:DemoState,slotId:string){const slot=slotsFor(state.anchor).find(s=>s.id===slotId);if(!slot)throw Error('That appointment does not exist.');const existing=state.bookings.find(b=>b.slotId===slotId);if(existing)return {state,slot,booking:existing,duplicate:true};const booking={id:'DEMO-'+slotId,slotId,patient:'Demo Patient'};return {state:{...state,bookings:[...state.bookings,booking]},slot,booking,duplicate:false};}
export function describe(slot:Slot){return `${slot.date} at ${slot.time} Toronto time with ${slot.therapist}, ${slot.service} (${slot.minutes} minutes, CAD ${slot.priceCAD})`;}
