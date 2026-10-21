import {clinic,today,type Slot} from '../app/demo/clinic';
import type {AppointmentState,SavedBooking} from '../app/appointments';
export class BookingError extends Error {constructor(message:string,public status:number,public code:string){super(message);}}
const columns='id,date,time,therapist_id AS therapistId,therapist,service_id AS serviceId,service,minutes,price_cad AS priceCAD';
const bookingColumns='id,slot_id AS slotId,patient,created_at AS createdAt';
export class AppointmentStore {
 constructor(private db:D1Database){if(!db)throw new Error('Database unavailable');}
 async initialize(){
  const slots:Slot[]=[];
  for(let offset=1;offset<=7;offset++){
   const day=new Date(today()+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+offset);
   if([0,6].includes(day.getUTCDay()))continue;
   const date=day.toISOString().slice(0,10);
   for(const [i,therapist] of clinic.therapists.entries()){
    const service=clinic.services[i%clinic.services.length],time=i===0?'10:00':'14:00';
    slots.push({id:`${date}-${therapist.id}-${time.replace(':','')}`,date,time,therapistId:therapist.id,therapist:therapist.name,serviceId:service.id,service:service.name,minutes:service.minutes,priceCAD:service.priceCAD});
   }
  }
  await this.db.batch(slots.map(s=>this.db.prepare('INSERT INTO appointment_slots (id,date,time,therapist_id,therapist,service_id,service,minutes,price_cad) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(s.id,s.date,s.time,s.therapistId,s.therapist,s.serviceId,s.service,s.minutes,s.priceCAD)));
  return this.snapshot();
 }
 async snapshot():Promise<AppointmentState>{
  // A batch gives both collections one consistent database snapshot.
  const [s,b]=await this.db.batch([
   this.db.prepare(`SELECT ${columns} FROM appointment_slots WHERE date >= ? ORDER BY date,time,therapist LIMIT 100`).bind(today()),
   this.db.prepare(`SELECT b.id,b.slot_id AS slotId,b.patient,b.created_at AS createdAt FROM appointment_bookings b JOIN appointment_slots s ON s.id=b.slot_id WHERE s.date >= ? ORDER BY s.date,s.time LIMIT 100`).bind(today())
  ]);
  return {anchor:today(),slots:s.results as unknown as Slot[],bookings:b.results as unknown as SavedBooking[]};
 }
 async confirm(slotId:unknown,requestId:unknown){
  if(typeof slotId!=='string'||slotId.length>100||typeof requestId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(requestId))throw new BookingError('Choose a slot and send a valid confirmation request.',400,'INVALID_REQUEST');
  const previous=await this.db.prepare(`SELECT ${bookingColumns} FROM appointment_bookings WHERE request_id=?`).bind(requestId).first<SavedBooking>();
  if(previous){if(previous.slotId!==slotId)throw new BookingError('This confirmation reference belongs to another slot. Choose the appointment again.',409,'REQUEST_MISMATCH');return {booking:previous,duplicate:true,state:await this.snapshot()};}
  const slot=await this.db.prepare(`SELECT ${columns} FROM appointment_slots WHERE id=?`).bind(slotId).first<Slot>();
  if(!slot)throw new BookingError('This appointment does not exist. Refresh availability.',404,'SLOT_NOT_FOUND');
  // Only book future calendar days; no timezone/clock ambiguity for same-day appointments.
  if(slot.date<=today())throw new BookingError('This appointment is no longer bookable. Choose a future date.',409,'SLOT_EXPIRED');
  const id='DEMO-'+crypto.randomUUID(),createdAt=new Date().toISOString();
  await this.db.prepare('INSERT INTO appointment_bookings (id,slot_id,patient,request_id,created_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(id,slotId,'Demo Patient',requestId,createdAt).run();
  const saved=await this.db.prepare(`SELECT ${bookingColumns} FROM appointment_bookings WHERE request_id=?`).bind(requestId).first<SavedBooking>();
  if(saved){if(saved.slotId!==slotId)throw new BookingError('This confirmation reference belongs to another slot.',409,'REQUEST_MISMATCH');return {booking:saved,duplicate:saved.id!==id,state:await this.snapshot()};}
  throw new BookingError('That slot was just booked by another request. Choose another available appointment.',409,'SLOT_TAKEN');
 }
}
