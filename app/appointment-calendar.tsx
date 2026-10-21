'use client';
import type {AppointmentState,PendingBooking} from './appointments';
import type {Slot} from './demo/clinic';
import {describe,today} from './demo/clinic';
import ErrorNotice from './error-notice';
export default function AppointmentCalendar({state,proposal,pending,loading,locked,confirming,error,bookingError,checkedAt,onRefresh,onChoose,onConfirm,onDismiss}:{state:AppointmentState|null;proposal:Slot|null;pending:PendingBooking|null;loading:boolean;locked:boolean;confirming:boolean;error:string;bookingError:string;checkedAt:string;onRefresh:()=>void;onChoose:(s:Slot)=>void;onConfirm:()=>void;onDismiss:()=>void}){
 const dates=[...new Set(state?.slots.map(s=>s.date)||[])];
 return <section className='demo-panel appointment-calendar' aria-label='Persistent fictional appointment calendar'>
 <div className='sectionhead'><h2>Appointment calendar</h2><button className='secondary' disabled={loading||confirming} onClick={onRefresh}>{loading?'Refreshing…':'Refresh availability'}</button></div>
 <p className='hint'>Maple Physiotherapy · Toronto time · Fictional patient: Demo Patient · Saved across visits · No Jane connection</p>
 {checkedAt&&<p className='hint'>Last checked {checkedAt}. Availability is checked again when you confirm.</p>}
 <ErrorNotice message={error}/>
 {!state&&loading&&<p role='status'>Loading appointment calendar…</p>}
 {state&&!dates.length&&<p>No appointments in this window. Refresh to load the next week.</p>}
 {dates.map(date=><section className='calendar-day' key={date}><h3>{new Intl.DateTimeFormat('en-CA',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}</h3><div className='calendar-day-slots'>{state!.slots.filter(s=>s.date===date).map(slot=>{const booked=state!.bookings.find(b=>b.slotId===slot.id);return <article className='calendar-appointment' key={slot.id}><div><strong>{slot.time} · {slot.therapist}</strong><p>{slot.service} · {slot.minutes} min · CAD {slot.priceCAD}</p></div>{booked?<div><span className='pill'>Booked</span><small className='booking-reference'>{booked.id}</small></div>:slot.date<=today()?<span>Closed for booking</span>:<button className='secondary' disabled={locked||Boolean(pending)||confirming} onClick={()=>onChoose(slot)}>Choose slot</button>}</article>})}</div></section>)}
 {proposal&&<div className='booking-confirm' role='region' aria-label='Confirm demo appointment'><strong>{pending?'Pending confirmation':'Confirm your demo appointment'}</strong><p>{describe(proposal)}</p><p>This saves a fictional booking to the shared calendar.</p><ErrorNotice message={bookingError}/>{pending&&<p className='hint'>A confirmation was sent. Retry safely to retrieve its result; this will not create a duplicate. It remains recoverable after refresh in this tab.</p>}<div className='booking-actions'><button className='generate' disabled={locked||confirming} onClick={onConfirm}>{confirming?'Saving booking…':pending?'Retry confirmation':'Confirm demo booking'}</button>{!pending&&<button className='secondary' disabled={locked||confirming} onClick={onDismiss}>Dismiss</button>}</div></div>}
 {!proposal&&<ErrorNotice message={bookingError}/>}
 </section>;
}
