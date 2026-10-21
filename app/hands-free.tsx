'use client';
import {useEffect,useRef,useState} from 'react';
import {newDiagnostic,stamp,diagnosticError,type TurnDiagnostic} from './diagnostics';
import ErrorNotice from './error-notice';
import {getJSON,errorText} from './request';
import {createDetector,speechWav,type Detector} from './vad-engine';
type Props={connected:boolean;getAudioContext:()=>AudioContext|null;onInterrupt:()=>void;onTranscript:(text:string,diagnostic?:TurnDiagnostic)=>Promise<void>;onDiagnostic?:(d:TurnDiagnostic)=>void;onEnabled:(enabled:boolean)=>void;onActivity:(active:boolean)=>void};
export default function HandsFree(props:Props){
 const callbacks=useRef(props);callbacks.current=props;
 const [mode,setMode]=useState<'off'|'loading'|'listening'|'speaking'|'transcribing'>('off'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[transcript,setTranscript]=useState(''),[retry,setRetry]=useState(false);
 const detector=useRef<Detector|null>(null),media=useRef<MediaStream|null>(null),active=useRef(false),alive=useRef(true),session=useRef(0),utterance=useRef(0),upload=useRef<AbortController|null>(null),clip=useRef<Blob|null>(null),limit=useRef<ReturnType<typeof setTimeout>|null>(null),startup=useRef<ReturnType<typeof setTimeout>|null>(null),detachAudio=useRef<(()=>void)|null>(null);
 const timing=useRef<TurnDiagnostic|null>(null),lastSpeech=useRef<number|null>(null);
 const publish=()=>{if(timing.current)callbacks.current.onDiagnostic?.(timing.current);};
 const valid=(s:number,u:number)=>alive.current&&active.current&&session.current===s&&utterance.current===u;
 function clearLimit(){if(limit.current)clearTimeout(limit.current);limit.current=null;}
 function disable(interrupt=true){
  if(timing.current?.status==='In progress'){timing.current.status='Cancelled';publish();}
  active.current=false;session.current++;utterance.current++;clearLimit();if(startup.current)clearTimeout(startup.current);startup.current=null;detachAudio.current?.();detachAudio.current=null;upload.current?.abort();upload.current=null;
  media.current?.getTracks().forEach(track=>track.stop());media.current=null;
  const old=detector.current;detector.current=null;if(old)void old.destroy().catch(()=>{});
  if(interrupt)callbacks.current.onInterrupt();
  if(alive.current){setMode('off');setRetry(false);callbacks.current.onEnabled(false);callbacks.current.onActivity(false);}
 }
 useEffect(()=>{alive.current=true;const leave=()=>disable();const visibility=()=>{if(document.hidden&&active.current){disable();setNotice('Microphone turned off because the page was hidden. Enable it again to continue.');}};window.addEventListener('pagehide',leave);document.addEventListener('visibilitychange',visibility);return()=>{alive.current=false;disable(false);window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',visibility);};},[]);
 async function transcribe(blob:Blob,s:number,u:number){
  if(!valid(s,u))return;const d=timing.current; if(d){stamp(d,'transcribe');publish();}upload.current?.abort();const controller=new AbortController();upload.current=controller;setMode('transcribing');setRetry(false);setError('');callbacks.current.onActivity(true);
  try{const form=new FormData();form.append('file',blob,'speech.wav');const result=await getJSON('/api/transcribe',{method:'POST',body:form,signal:controller.signal});if(!valid(s,u))return;
   if(typeof result.text!=='string')throw Error('The server returned an invalid transcript. Retry this recording.');
   if(d){stamp(d,'transcribed');publish();}
   setTranscript(result.text);setMode('listening');callbacks.current.onActivity(false);
   if(!result.text.trim()){if(d){d.status='No speech recognized';publish();}setNotice('No words were recognized. Please try speaking again.');return;}
   if(result.text.trim().length>1000){if(d){d.status='Question too long';publish();}setError('That sentence is too long for the conversation. Please use a shorter question.');return;}
   setNotice('Words received. You can interrupt the reply by speaking again.');
   await callbacks.current.onTranscript(result.text.trim(),d||undefined);
  }catch(e){if(valid(s,u)&&!controller.signal.aborted){if(d){diagnosticError(d,'Transcription',e);publish();}setError(errorText(e));setRetry(true);setMode('listening');callbacks.current.onActivity(false);}}
 }
 function speechStart(s:number){
  if(!active.current||session.current!==s)return;
  utterance.current++;upload.current?.abort();if(timing.current?.status==='In progress'){timing.current.status='Interrupted';publish();}callbacks.current.onInterrupt();timing.current=newDiagnostic('Voice');lastSpeech.current=performance.now();publish();setMode('speaking');setError('');setRetry(false);setNotice('Listening to your sentence… Pause when you are finished.');callbacks.current.onActivity(true);clearLimit();
  limit.current=setTimeout(()=>{if(active.current&&session.current===s){disable();setError('The 60-second speaking limit was reached. Enable the microphone and use a shorter question.');}},60000);
 }
 function speechEnd(samples:Float32Array,s:number){
  if(!active.current||session.current!==s)return;clearLimit();const u=++utterance.current;
  if(samples.length>16000*61){disable();setError('That recording exceeded 60 seconds. Enable the microphone and try a shorter question.');return;}
  if(timing.current){stamp(timing.current,'detected');if(lastSpeech.current!==null)stamp(timing.current,'speechEnd',lastSpeech.current);publish();}
  clip.current=speechWav(samples);void transcribe(clip.current,s,u);
 }
 async function enable(){
  if(active.current||!callbacks.current.connected)return;
  setError('');setNotice('');setTranscript('');clip.current=null;setRetry(false);
  const ctx=callbacks.current.getAudioContext();if(!ctx)return;
  // Both permissions are requested from the user's tap, before loading the model.
  void ctx.resume().catch(()=>{});
  active.current=true;const s=++session.current;setMode('loading');callbacks.current.onEnabled(true);callbacks.current.onActivity(true);
  startup.current=setTimeout(()=>{if(active.current&&session.current===s){disable();setError('Microphone or speech detector startup took too long. Try enabling again, or use manual recording.');}},45000);
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone access is unavailable. Open this page in Safari or Chrome.');
   const mic=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(!active.current||s!==session.current){mic.getTracks().forEach(track=>track.stop());return;}media.current=mic;
   const settings=mic.getAudioTracks()[0]?.getSettings();
   mic.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(active.current&&session.current===s){disable();setError('Microphone access ended. Enable it again or check your browser permissions.');}},{once:true}));
   const vad=await createDetector(mic,ctx,{onFrame:probability=>{if(probability>=0.35)lastSpeech.current=performance.now();},onStart:()=>speechStart(s),onEnd:samples=>speechEnd(samples,s),onMisfire:()=>{if(active.current&&session.current===s){clearLimit();if(timing.current){timing.current.status='Speech too short';publish();}setMode('listening');callbacks.current.onActivity(false);}}});
   if(!active.current||s!==session.current){await vad.destroy();return;}detector.current=vad;
   await vad.start();if(!active.current||s!==session.current)return;
   if(ctx.state!=='running')throw Error('Audio is suspended. Turn the microphone off, then enable it again.');
   if(startup.current)clearTimeout(startup.current);startup.current=null;
   const stateChanged=()=>{if(active.current&&session.current===s&&ctx.state!=='running'){disable();setError('Audio was paused by the browser or another app. Enable the microphone again to continue.');}};ctx.addEventListener?.('statechange',stateChanged);detachAudio.current=()=>ctx.removeEventListener?.('statechange',stateChanged);
   setMode('listening');setNotice(settings?.echoCancellation===false?'Echo cancellation is unavailable on this microphone. Use headphones to reduce false interruptions.':'Ready. Ask a question, then pause. You can speak over the receptionist to interrupt.');callbacks.current.onActivity(false);
  }catch(e){if(alive.current&&s===session.current){disable();setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser’s site settings, then enable hands-free mode again.':e instanceof DOMException&&e.name==='NotFoundError'?'No microphone was found. Connect a microphone and try again.':'Could not enable hands-free mode. '+errorText(e)+' You can type your question below.');}}
 }
 return <section className='hands-free' aria-label='Hands-free conversation'><div className='sectionhead'><h2>Voice conversation</h2><span className={'status '+(mode!=='off'?'connected':'')}>{mode==='off'?'Mic off':mode==='loading'?'Starting…':mode==='speaking'?'You’re speaking':mode==='transcribing'?'Transcribing…':'Mic on · Listening'}</span></div><p>Tap the voice button once to begin. Speak, then pause for about a second. Your question sends automatically, and the receptionist replies when it is ready. Keep talking to take another turn or interrupt.</p><div className='voice-toggle-wrap'><button type='button' className={'voice-toggle '+(mode!=='off'?'is-on ':'')+(mode==='speaking'?'is-hearing':'')} aria-label={mode==='off'?'Start voice conversation':'End voice conversation'} aria-pressed={mode!=='off'} disabled={mode==='off'&&!props.connected} onClick={()=>mode==='off'?void enable():disable()}><svg viewBox='0 0 48 48' width='44' height='44' fill='none' stroke='currentColor' strokeWidth='4' strokeLinecap='round' aria-hidden='true'><path d='M8 21v6M16 14v20M24 8v32M32 14v20M40 21v6'/></svg></button><span>{mode==='off'?'Tap to start':mode==='loading'?'Starting… Tap to cancel':'Voice is on · Tap to end'}</span></div><p className='hint'>Speech detection runs on this device. Detected speech is sent to Cartesia for transcription. The mic stays on while this page is visible, until you turn it off or leave Step 4. First use downloads the speech detector.</p>{notice&&<p role='status' aria-live='polite'>{notice}</p>}{transcript&&<blockquote><small>LAST TRANSCRIPT</small><p>{transcript}</p></blockquote>}<ErrorNotice message={error}>{retry&&clip.current&&<button type='button' className='secondary' onClick={()=>{const s=session.current,u=++utterance.current;if(clip.current){timing.current=newDiagnostic('Transcription',true);publish();void transcribe(clip.current,s,u);}}}>Retry this recording</button>}</ErrorNotice></section>;
}
