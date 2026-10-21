const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,imports={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(name=>imports[name]||require(name),exports);return exports;}
const client=load('app/request.ts');
const {StreamAudio}=load('app/stream-audio.ts',{'./request':client});
const boundary=load('app/api/result.ts');
const {POST:speech}=load('app/api/speech/route.ts',{'../result':boundary,'cloudflare:workers':{env:{CARTESIA_API_KEY:'test-key'}}});
const headers={'Content-Type':'audio/pcm','X-Audio-Sample-Rate':'44100','X-Audio-Encoding':'pcm_s16le','X-Request-ID':'stream-test'};
const tick=()=>new Promise(r=>setImmediate(r));
class Context{
 state='running';currentTime=0;destination={};nodes=[];buffers=[];
 createBuffer(_,n,rate){const data=new Float32Array(n),buffer={duration:n/rate,getChannelData:()=>data};this.buffers.push(buffer);return buffer;}
 createBufferSource(){const node={onended:null,stopped:false,connect(){},disconnect(){},start(at){this.at=at;},stop(){this.stopped=true;}};this.nodes.push(node);return node;}
 resume(){return Promise.resolve();}close(){return Promise.resolve();}
 end(){for(const n of this.nodes)n.onended?.();}
}
async function main(){
 // Read one split sample before the response finishes: playback must already be scheduled.
 let push;global.fetch=async()=>new Response(new ReadableStream({start(c){push=c;}}),{headers});
 const context=new Context(),audio=new StreamAudio(context),signal=new AbortController();let first=0;const timings=[];
 const playback=audio.play('Test',signal.signal,()=>first++,(chunk,playback)=>timings.push({chunk,playback}));await tick();push.enqueue(new Uint8Array([0]));await tick();assert.equal(context.nodes.length,0);
 push.enqueue(new Uint8Array([128,255,127]));await tick();assert.equal(context.nodes.length,1);assert.equal(first,1);assert.equal(timings.length,1);assert.ok(timings[0].playback>=timings[0].chunk+50);assert.equal(context.buffers[0].getChannelData()[0],-1);assert.ok(context.buffers[0].getChannelData()[1]>.99);
 // Stream completion waits for queued playback before returning a replayable WAV.
 push.close();let finished=false;playback.then(()=>finished=true);await tick();assert.equal(finished,false);context.end();const wav=await playback;assert.equal(wav.type,'audio/wav');assert.equal(wav.size,48);assert.equal(new DataView(await wav.arrayBuffer()).getUint32(40,true),4);
 // Stop cancels scheduled audio and ignores a late network chunk.
 let late;global.fetch=async()=>new Response(new ReadableStream({start(c){late=c;}}),{headers});
 const second=new Context(),cancel=new AbortController(),playing=new StreamAudio(second).play('Stop',cancel.signal,()=>{});await tick();late.enqueue(new Uint8Array([0,1]));await tick();cancel.abort();assert.ok(second.nodes.every(n=>n.stopped));late.enqueue(new Uint8Array([0,2]));late.close();assert.equal(await playing,null);assert.equal(second.nodes.length,1);
 // Abort while queued samples drain also resolves promptly.
 global.fetch=async()=>new Response(new Uint8Array([0,1]),{headers});const draining=new Context(),abortDrain=new AbortController(),drain=new StreamAudio(draining).play('Drain',abortDrain.signal,()=>{});await tick();abortDrain.abort();assert.equal(await drain,null);assert.ok(draining.nodes[0].stopped);
 for(const [response,pattern] of [[Response.json({error:'Quota reached'},{status:429,headers:{'X-Request-ID':'quota'}}),/Quota reached[\s\S]*quota/],[new Response('',{headers}),/empty/],[new Response(new Uint8Array([1]),{headers}),/incomplete sample/],[Response.json({reply:'unexpected'}),/unsupported audio/]]){
  global.fetch=async()=>response;await assert.rejects(()=>new StreamAudio(new Context()).play('Fail',new AbortController().signal,()=>{}),e=>{assert.match(client.errorText(e),pattern);return true;});
 }
 const suspended=new Context();suspended.state='suspended';await assert.rejects(()=>new StreamAudio(suspended).play('Unlock',new AbortController().signal,()=>{}),/permission/);
 // Backend forwards streaming data without buffering the complete provider response.
 let upstream;const incoming=new AbortController();let providerSignal;
 global.fetch=async(_,init)=>{assert.equal(JSON.parse(init.body).output_format.container,'raw');providerSignal=init.signal;return new Response(new ReadableStream({start(c){upstream=c;}}));};
 const request=new Request('https://test/api/speech',{method:'POST',headers:{origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({text:'Hello',stream:true}),signal:incoming.signal});
 const response=await speech(request);assert.equal(response.headers.get('Content-Type'),'audio/pcm');assert.ok(response.headers.get('X-Request-ID'));const reader=response.body.getReader();upstream.enqueue(new Uint8Array([5,6]));assert.deepEqual((await reader.read()).value,new Uint8Array([5,6]));incoming.abort();assert.ok(providerSignal.aborted);upstream.close();await reader.cancel();
 // Legacy Step 1/3 still request WAV.
 global.fetch=async(_,init)=>{assert.equal(JSON.parse(init.body).output_format.container,'wav');return new Response(new Uint8Array([1,2]));};assert.equal((await speech(new Request('https://test/api/speech',{method:'POST',headers:{origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({text:'Hello'})}))).headers.get('Content-Type'),'audio/wav');
 console.log('Passed streaming: playback before download completion, split PCM samples, ordered scheduling, replay WAV, Stop during download and playback, late-chunk rejection, quota/format/empty/truncation errors, autoplay permission, backend passthrough, upstream abort and legacy WAV.');
 await testConversation();
}
async function testConversation(){
 const clinic=load('app/demo/clinic.ts',{'./clinic.json':JSON.parse(fs.readFileSync('app/demo/clinic.json'))});
 const states=[],refs=[],effects=[];let cursor=0,pendingEffects=[];
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(fn,deps){const i=cursor++;if(!effects[i]||!deps||deps.some((v,j)=>v!==effects[i][j])){effects[i]=deps;pendingEffects.push(fn);}}};
 global.window={AudioContext:Context,addEventListener(){},removeEventListener(){}};
 global.fetch=async()=>Response.json({configured:true,state:{anchor:clinic.today(),slots:[],bookings:[]}});
 const {default:Conversation}=load('app/conversation.tsx',{'react':react,'./recorder':()=>null,'./hands-free':()=>null,'./error-notice':()=>null,'./diagnostics':load('app/diagnostics.tsx'),'./request':client,'./stream-audio':{StreamAudio},'./demo/clinic':clinic,'./appointment-calendar':()=>null,'./appointments':{pendingBookingKey:'test-pending'}});
 let tree;const onActivity=()=>{};function render(){cursor=0;tree=Conversation({connected:false,onActivity,streaming:true});const jobs=pendingEffects;pendingEffects=[];jobs.forEach(fn=>fn());}
 function find(predicate,node=tree){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const found=find(predicate,child);if(found)return found;}return null;}if(predicate(node))return node;return node.props?.children===undefined?null:find(predicate,node.props.children);}
 const content=()=>JSON.stringify(tree,(key,val)=>key==='ref'?undefined:val);
 render();await tick();render();
 let resolveOld,resolveNew;const requests=[];
 global.fetch=async(_,init)=>{requests.push({body:JSON.parse(init.body),signal:init.signal});return new Promise(resolve=>{if(requests.length===1)resolveOld=resolve;else resolveNew=resolve;});};
 function draft(text){find(n=>n.type==='textarea'&&n.props.id==='chat-draft').props.onChange({target:{value:text}});render();}
 draft('What appointments?');const old=find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();render();assert.equal(requests.length,1);
 // Begin recording while the model is still generating, then send a correction.
 find(n=>typeof n.type==='function'&&n.props.onInterrupt).props.onInterrupt();render();assert.ok(requests[0].signal.aborted);assert.match(content(),/INTERRUPTED/);
 draft('Friday only');find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();render();assert.equal(requests.length,2);assert.deepEqual(requests[1].body.messages.map(m=>m.role),['user','assistant','user']);assert.match(requests[1].body.messages[1].content,/interrupted/i);
 resolveNew(Response.json({reply:'Friday reply'}));await tick();render();assert.match(content(),/Friday reply/);
 // A provider that ignores cancellation must not replace the newer answer.
 resolveOld(Response.json({reply:'Stale old reply'}));await tick();render();assert.ok(!content().includes('Stale old reply'));assert.match(content(),/Friday reply/);
 const panel=find(n=>typeof n.type==='function'&&n.props.turns);assert.equal(panel.props.turns.length,2);assert.equal(panel.props.turns[0].status,'Interrupted');assert.equal(panel.props.turns[1].status,'Text only');assert.ok(!JSON.stringify(panel.props.turns).includes('Friday reply'));
 console.log('Passed conversation races: record interrupts pending Gemini, canceled turns remain in history, corrected request alternates roles and late old replies cannot replace new replies.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
