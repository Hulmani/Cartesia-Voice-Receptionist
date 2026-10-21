'use client';
import {useEffect,useRef,useState} from 'react';
import Diagnostics,{newDiagnostic,stamp,diagnosticError,type TurnDiagnostic} from './diagnostics';
import Recorder from './recorder';
import HandsFree from './hands-free';
import ErrorNotice from './error-notice';
import {getJSON,getAudio,errorText,ServiceError} from './request';
import {StreamAudio} from './stream-audio';
import {describe,type Slot} from './demo/clinic';
import AppointmentCalendar from './appointment-calendar';
import {pendingBookingKey,type AppointmentState,type PendingBooking} from './appointments';
type Message={role:'user'|'assistant';content:string;interrupted?:boolean};
type Props={connected:boolean;onActivity:(active:boolean)=>void;streaming?:boolean};
export default function Conversation({connected,onActivity,streaming=false}:Props){
 const [llmReady,setLlmReady]=useState(false),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[recordBusy,setRecordBusy]=useState(false),[stage,setStage]=useState(''),[error,setError]=useState(''),[speechError,setSpeechError]=useState(''),[audio,setAudio]=useState(''),[pending,setPending]=useState('');
 const [demo,setDemo]=useState<AppointmentState|null>(null),[proposal,setProposal]=useState<Slot|null>(null);
 const [serviceError,setServiceError]=useState(''),[checking,setChecking]=useState(false),[retryText,setRetryText]=useState(''),[bookingError,setBookingError]=useState(''),[playbackError,setPlaybackError]=useState(''),[firstAudio,setFirstAudio]=useState<number|null>(null);
 const audioUrl=useRef(''),player=useRef<HTMLAudioElement|null>(null),abort=useRef<AbortController|null>(null),alive=useRef(true),working=useRef(false),generation=useRef(0),context=useRef<AudioContext|null>(null),stream=useRef<StreamAudio|null>(null),historyRef=useRef<Message[]>([]),pendingRef=useRef(''),unheard=useRef(false);
 const [diagnostics,setDiagnostics]=useState<TurnDiagnostic[]>([]);
 const activeDiagnostic=useRef<TurnDiagnostic|null>(null);
 function report(d:TurnDiagnostic){if(!alive.current)return;setDiagnostics(old=>{const snapshot={...d,marks:{...d.marks},errors:[...d.errors]};return [...old.filter(x=>x.id!==d.id),snapshot].slice(-20);});}
 const [calendarError,setCalendarError]=useState(''),[calendarLoading,setCalendarLoading]=useState(false),[checkedAt,setCheckedAt]=useState(''),[confirming,setConfirming]=useState(false),[pendingBooking,setPendingBooking]=useState<PendingBooking|null>(null);
 const bookingWork=useRef(false),pendingBookingRef=useRef<PendingBooking|null>(null),calendarLoad=useRef(0);
 const locked=busy||recordBusy||confirming;
 function acceptCalendar(state:AppointmentState){setDemo(state);setCheckedAt(new Date().toLocaleTimeString());}
 async function loadCalendar(){const n=++calendarLoad.current;setCalendarLoading(true);setCalendarError('');try{const result=await getJSON('/api/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'initialize'})});if(alive.current&&n===calendarLoad.current)acceptCalendar(result.state);}catch(e){if(alive.current&&n===calendarLoad.current)setCalendarError(errorText(e));}finally{if(alive.current&&n===calendarLoad.current)setCalendarLoading(false);}}
 function chooseSlot(slot:Slot){if(pendingBookingRef.current||bookingWork.current)return;setProposal(slot);setBookingError('');}
 function clearPending(){pendingBookingRef.current=null;setPendingBooking(null);try{sessionStorage.removeItem(pendingBookingKey)}catch{}}

 function updateHistory(next:Message[]){historyRef.current=next;setMessages(next);}
 function unlockAudio(){
  if(!streaming)return null;
  try{const Audio=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Audio)throw Error('Streaming audio is unavailable in this browser. Try Safari or Chrome.');if(!context.current||context.current.state==='closed')context.current=new Audio();void context.current.resume().catch(()=>setSpeechError('Tap Retry audio only to allow playback.'));return context.current;}catch(e){setSpeechError(errorText(e));return null;}
 }
 function clearAudio(){player.current?.pause();setAudio('');if(audioUrl.current){URL.revokeObjectURL(audioUrl.current);audioUrl.current='';}}
 function stopReply(show=true){
  if(bookingWork.current)return;
  const interrupted=working.current||unheard.current||Boolean(player.current&&!player.current.paused&&!player.current.ended);
  const d=activeDiagnostic.current;if(interrupted&&d)stamp(d,'interrupt');
  generation.current++;abort.current?.abort();stream.current?.stop();stream.current=null;player.current?.pause();working.current=false;if(interrupted&&d){stamp(d,'stopped');d.status='Interrupted';report(d);}
  if(interrupted){
   const next=[...historyRef.current];
   if(pendingRef.current){next.push({role:'user',content:pendingRef.current},{role:'assistant',content:'[Reply interrupted before it was available.]',interrupted:true});setDraft(pendingRef.current);}
   else if(next.at(-1)?.role==='assistant')next[next.length-1]={...next[next.length-1],interrupted:true};
   updateHistory(next);pendingRef.current='';unheard.current=false;setPending('');if(!pendingBookingRef.current)setProposal(null);
  }
  if(alive.current){setBusy(false);if(show&&interrupted)setStage('Reply interrupted. Type or record your correction.');}
 }
 function recordStart(){if(streaming){stopReply();unlockAudio();}}
 async function checkService(){setChecking(true);setServiceError('');try{const d=await getJSON('/api/converse');if(!alive.current)return;setLlmReady(d.configured);if(!d.configured)setServiceError('The reply service is not configured. The site owner needs to check its Gemini server key.');}catch(e){if(alive.current){setLlmReady(false);setServiceError(errorText(e));}}finally{if(alive.current)setChecking(false);}}
 useEffect(()=>{void loadCalendar();void checkService();try{const raw=sessionStorage.getItem(pendingBookingKey);if(raw){const p=JSON.parse(raw);if(p?.slot?.id&&typeof p.requestId==='string'){pendingBookingRef.current=p;setPendingBooking(p);setProposal(p.slot);}}}catch{}},[]);
 useEffect(()=>{onActivity(locked)},[locked,onActivity]);
 useEffect(()=>{alive.current=true;const leave=()=>{generation.current++;abort.current?.abort();stream.current?.stop();player.current?.pause();working.current=false;if(alive.current)setBusy(false);};window.addEventListener('pagehide',leave);return()=>{alive.current=false;leave();window.removeEventListener('pagehide',leave);if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);void context.current?.close();}},[]);
 useEffect(()=>{if(!streaming&&audio&&player.current)player.current.play().catch(()=>{if(alive.current)setStage('Reply ready. Tap Play to listen.');})},[audio,streaming]);
 const current=(token:number,signal:AbortSignal)=>alive.current&&generation.current===token&&!signal.aborted;
 async function speak(text:string,signal:AbortSignal,token:number,d?:TurnDiagnostic){
  if(d){stamp(d,'speechRequest');report(d);}
  setStage(streaming?'Reply received. Waiting for the first audio chunk…':'✓ Reply received. Generating spoken audio…');setSpeechError('');unheard.current=true;
  let blob:Blob|null;
  if(streaming){
   if(!context.current)throw Error('Audio needs a tap. Use Retry audio only to enable playback.');
   const playback=new StreamAudio(context.current);stream.current=playback;
   blob=await playback.play(text,signal,ms=>{if(current(token,signal)){setFirstAudio(ms);setStage('Streaming your reply… You can interrupt now.');}},(chunk,playback)=>{if(d&&current(token,signal)){stamp(d,'chunk',chunk);stamp(d,'playback',playback);report(d);}});
  }else blob=await getAudio('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal});
  if(!blob||!current(token,signal))return;
  clearAudio();audioUrl.current=URL.createObjectURL(blob);setAudio(audioUrl.current);
  if(d){d.status='Completed';report(d);}if(streaming){unheard.current=false;setStage('Reply finished. Replay below, or ask another question.');}else setStage('✓ Reply and audio ready.');
 }
 async function send(raw:string,diagnostic?:TurnDiagnostic,retry=false){
  if(bookingWork.current)return;
  const text=raw.trim();if(!text||text.length>1000){setError('Keep your message between 1 and 1,000 characters.');return;}
  if(!llmReady){setError('The reply service is not configured.');return;}if(!demo)return;
  if(working.current&&!streaming)return;
  if(streaming){stopReply(false);unlockAudio();}
  const d=diagnostic||newDiagnostic(streaming?'Typed':'Manual',retry);activeDiagnostic.current=d;stamp(d,'request');report(d);
  if(!pendingBookingRef.current)setProposal(null);working.current=true;setBusy(true);pendingRef.current=text;setPending(text);setError('');setSpeechError('');setPlaybackError('');setRetryText('');setFirstAudio(null);setStage('Getting a reply from Gemini… You can stop this request.');clearAudio();abort.current=new AbortController();const signal=abort.current.signal,token=++generation.current;
  const history:Message[]=[...historyRef.current.slice(-12),{role:'user',content:text}];
  // The model must not infer that an interrupted answer was heard completely.
  const wire=history.map(m=>({role:m.role,content:m.interrupted?('[Reply interrupted; the user may not have heard this.] '+m.content).slice(0,1000):m.content}));
  try{
   const result=await getJSON('/api/converse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:wire}),signal});if(!current(token,signal))return;if(typeof result.reply!=='string'||!result.reply.trim())throw Error('No reply returned. Please retry.');
   stamp(d,'reply');report(d);
   if(result.state)acceptCalendar(result.state);if(!pendingBookingRef.current)setProposal(result.proposal||null);updateHistory([...history,{role:'assistant',content:result.reply}]);pendingRef.current='';setPending('');setDraft('');
   try{if(connected)await speak(result.reply,signal,token,d);else {d.status='Text only';report(d);setStage('Text reply ready. The voice service is unavailable for audio.');}}catch(e){if(current(token,signal)){diagnosticError(d,'Audio',e);report(d);setSpeechError(errorText(e));setStage('Text reply ready; audio failed.');}}
  }catch(e){if(current(token,signal)){diagnosticError(d,'Gemini',e);report(d);setError(errorText(e));setDraft(text);setRetryText(text);setStage('Reply failed. You can retry below.');pendingRef.current='';setPending('');}}
  finally{if(current(token,signal)){working.current=false;setBusy(false);}}
 }
 async function retryAudio(){
  const last=historyRef.current.at(-1);if(working.current||last?.role!=='assistant')return;
  const d=newDiagnostic('Audio',true);activeDiagnostic.current=d;report(d);
  unlockAudio();clearAudio();setPlaybackError('');setFirstAudio(null);working.current=true;setBusy(true);abort.current=new AbortController();const signal=abort.current.signal,token=++generation.current;
  try{await speak(last.content,signal,token,d)}catch(e){if(current(token,signal)){diagnosticError(d,'Audio',e);report(d);setSpeechError(errorText(e));setStage('Text reply ready; audio failed.');}}finally{if(current(token,signal)){working.current=false;setBusy(false);}}
 }
 async function confirm(){
  if(working.current||bookingWork.current||!proposal)return;
  const pending=pendingBookingRef.current||{slot:proposal,requestId:crypto.randomUUID()};
  pendingBookingRef.current=pending;setPendingBooking(pending);
  try{sessionStorage.setItem(pendingBookingKey,JSON.stringify(pending));}catch{clearPending();setBookingError('Enable browser session storage before confirming so an interrupted booking can be recovered safely.');return;}
  unlockAudio();bookingWork.current=true;setConfirming(true);working.current=true;setBusy(true);setBookingError('');setStage('Saving your demo appointment…');clearAudio();
  let playbackToken:number|null=null;
  const d=newDiagnostic('Typed');activeDiagnostic.current=d;stamp(d,'request');report(d);
  // A booking write is independent of playback cancellation. Retrying the same request ID resolves an unknown outcome.
  try{
   const result=await getJSON('/api/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',slotId:pending.slot.id,requestId:pending.requestId})});
   if(!alive.current)return;
   if(!result.booking?.id||!result.state)throw Error('The booking result was unreadable. Retry the same confirmation safely.');
   ++calendarLoad.current;setCalendarLoading(false);setCalendarError('');acceptCalendar(result.state);clearPending();setProposal(null);
   const reply=`${result.duplicate?'Your demo booking was already saved':'Demo booking confirmed'}: ${describe(pending.slot)}. Reference ${result.booking.id}. This is fictional; nothing was booked in Jane.`;
   updateHistory([...historyRef.current.slice(-10),{role:'user',content:'Confirm the proposed demo appointment.'},{role:'assistant',content:reply}]);
   stamp(d,'reply');d.status='Text only';report(d);setStage('Booking saved to the calendar.');
   bookingWork.current=false;setConfirming(false);
   abort.current=new AbortController();const signal=abort.current.signal,token=++generation.current;playbackToken=token;
   try{if(connected)await speak(reply,signal,token,d);}catch(e){if(current(token,signal)){diagnosticError(d,'Audio',e);report(d);setSpeechError('Booking saved, but audio failed. Retry audio only. '+errorText(e));}}
  }catch(e){if(alive.current){diagnosticError(d,'Booking',e);report(d);setBookingError(errorText(e));setStage('Booking could not be confirmed. Review the calendar below.');
   if(e instanceof ServiceError&&[400,404,409].includes(e.status)){clearPending();setProposal(null);}
   void loadCalendar();
  }}finally{if(playbackToken===null||playbackToken===generation.current){bookingWork.current=false;if(alive.current){setConfirming(false);working.current=false;setBusy(false);}}}
 }
 function reset(){if(bookingWork.current)return;stopReply(false);setDiagnostics([]);activeDiagnostic.current=null;clearAudio();if(!pendingBookingRef.current)setProposal(null);setRetryText('');setBookingError('');setPlaybackError('');updateHistory([]);pendingRef.current='';setPending('');setDraft('');setError('');setSpeechError('');setStage('');setFirstAudio(null);unheard.current=false;}
 return <>{streaming&&<div className='clinic-note'><strong>Step 4 · Streaming and interruptions</strong><span>Audio plays as it arrives. Speak during a reply to interrupt it automatically.</span><small>Enable the hands-free microphone below. Speak to ask a question or interrupt a reply, then pause to send. The microphone stays on for each turn until you turn it off. Gemini completes its text reply before audio starts.</small></div>}<ErrorNotice message={serviceError}><button className='secondary' disabled={locked||checking} onClick={checkService}>{checking?'Checking…':'Retry reply service check'}</button></ErrorNotice><div className='clinic-note'><strong>Maple Physiotherapy · Fictional demo</strong><span>Mon–Fri 9–6 · Sat 10–2 · Initial assessment $120 CAD · Follow-up $80 CAD</span><small>Simulated availability and booking are included. No connection to Jane. Bookings are saved in the shared demo calendar and survive refresh.</small></div><section className='workspace conversation'><div className='compose'>{streaming&&<HandsFree connected={connected&&llmReady&&!confirming} getAudioContext={unlockAudio} onInterrupt={recordStart} onTranscript={send} onDiagnostic={report} onEnabled={()=>{}} onActivity={setRecordBusy}/>}{!streaming&&<Recorder connected={Boolean(connected&&llmReady)} onActivity={setRecordBusy} onUseText={()=>{}} voiceOnly disabled={!streaming&&busy} onStart={recordStart} onBeforeSend={unlockAudio} onTranscript={send}/>}<form className='typed-message' onSubmit={e=>{e.preventDefault();void send(draft)}}><label htmlFor='chat-draft'>Or type your question</label><textarea id='chat-draft' maxLength={1000} value={draft} onChange={e=>setDraft(e.target.value)} disabled={confirming||recordBusy||(!streaming&&busy)} placeholder='What are your opening hours?'/><button className='generate' disabled={confirming||recordBusy||(!streaming&&busy)||!draft.trim()||!llmReady||!demo}>{streaming&&busy?'Interrupt and send ↗':'Send message ↗'}</button></form></div><div className='listen'><div className='sectionhead'><h2>Your conversation</h2><button className='sample' disabled={locked||!messages.length} onClick={reset}>New conversation</button></div><div className='messages' role='log' aria-label='Conversation'>{!messages.length&&!pending&&<p className='empty-chat'>Ask “Who is available this week?” Then choose a slot and confirm the demo booking. You can also test by clicking a slot below.</p>}{messages.map((m,i)=><div className={'message '+m.role} key={i}><small>{m.role==='user'?'YOU':m.interrupted?'AI RECEPTIONIST · INTERRUPTED':'AI RECEPTIONIST'}</small><p>{m.content}</p></div>)}{pending&&<div className='message user'><small>YOU · SENDING</small><p>{pending}</p></div>}</div>{stage&&<p role='status' aria-live='polite' className='conversation-status'>{stage}</p>}{streaming&&<><button type='button' className='secondary stop-speaking' disabled={!busy&&!audio&&!unheard.current} onClick={()=>stopReply()}>■ Stop speaking</button>{firstAudio!==null&&<p className='hint'>First audio scheduled in {(firstAudio/1000).toFixed(2)}s after speech request.</p>}</>}{audio&&<audio ref={player} controls src={audio} aria-label='Receptionist reply' onPlaying={()=>{unheard.current=true;setPlaybackError('');setStage('Playing your reply…')}} onEnded={()=>{unheard.current=false;setStage('Reply finished. Ready for your next question.');}} onError={()=>setPlaybackError('Your reply text is ready, but the browser could not play its audio. Try generating the audio again.')}/>}<ErrorNotice message={error}>{retryText&&<button className='secondary' disabled={locked||!llmReady} onClick={()=>send(retryText,undefined,true)}>Retry this question</button>}</ErrorNotice><ErrorNotice message={speechError||playbackError}><button className='secondary' disabled={locked} onClick={retryAudio}>Retry audio only</button></ErrorNotice><p className='hint'>Recent conversation stays in this tab. Switching conversation tabs or refreshing clears it. Gemini free-tier quotas apply; Cartesia uses credits. Replaying does not send a request.</p></div></section>{streaming&&<Diagnostics turns={diagnostics}/>}<AppointmentCalendar state={demo} proposal={proposal} pending={pendingBooking} loading={calendarLoading} locked={locked} confirming={confirming} error={calendarError} bookingError={bookingError} checkedAt={checkedAt} onRefresh={()=>void loadCalendar()} onChoose={chooseSlot} onConfirm={()=>void confirm()} onDismiss={()=>setProposal(null)}/><details><summary>What am I learning in Step {streaming?4:3}?</summary><p>Cartesia transcribes your recording. Gemini receives the text, recent conversation, and fictional clinic JSON. Its availability and booking-proposal tools run on our backend. The confirmation button saves a fictional booking in D1 without another LLM call. Database uniqueness prevents double bookings; retries use the same confirmation reference. Cartesia turns that answer into speech. {streaming?'The server forwards raw audio chunks to Web Audio for playback before the complete clip arrives. Stop speaking aborts the active request, clears queued audio and marks the reply as interrupted in future conversation context. Late results are ignored. Hands-free mode uses Silero VAD locally to detect speech, preserves a short lead-in, requests browser echo cancellation, and sends each sentence after a pause. Speaker echo can still cause false interruptions; headphones can help. Canceling cannot undo completed work or provider charges.':'This tab processes one complete turn at a time. Use Step 4 to try streaming and interruptions.'} Some mobile browsers require you to press Play.</p></details></>;
}
