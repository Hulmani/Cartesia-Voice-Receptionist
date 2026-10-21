const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(path,imports={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(name=>imports[name]||require(name),exports);return exports;}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const {speechWav}=load('app/vad-engine.ts');const wav=speechWav(new Float32Array([-1,0,1]));const bytes=new DataView(await wav.arrayBuffer());assert.equal(wav.size,50);assert.equal(bytes.getUint32(24,true),16000);assert.equal(bytes.getUint32(40,true),6);assert.equal(bytes.getInt16(44,true),-32768);assert.equal(bytes.getInt16(48,true),32767);
 let callbacks,stopped=0,destroyed=0,interrupted=0,enabled=false,activity=false,permission,contextState='running';const transcripts=[],requests=[],events={};
 const states=[],refs=[],effects=[];let cursor=0,jobs=[];const cleanups=[];
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){return refs[cursor]??(refs[cursor++]={current:initial});},useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((v,j)=>v!==effects[i][j])){effects[i]=deps;jobs.push(fn);}}};
 // Refs consume a hook slot on every render.
 react.useRef=initial=>{const i=cursor++;return refs[i]??(refs[i]={current:initial});};
 const track={stop(){stopped++},getSettings(){return{echoCancellation:true}},addEventListener(){}};const mic={getTracks:()=>[track],getAudioTracks:()=>[track]};
 Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async constraints=>{assert.equal(constraints.audio.echoCancellation,true);return permission?await permission:mic;}}}});
 global.window={addEventListener(name,fn){events[name]=fn},removeEventListener(){}};global.document={hidden:false,addEventListener(name,fn){events[name]=fn},removeEventListener(){}};
 const client=load('app/request.ts');const {default:HandsFree}=load('app/hands-free.tsx',{'react':react,'./error-notice':()=>null,'./diagnostics':load('app/diagnostics.tsx'),'./request':client,'./vad-engine':{speechWav,createDetector:async(stream,context,cbs)=>{callbacks=cbs;return{start:async()=>{},pause:async()=>{},destroy:async()=>{destroyed++}};}}});
 const props={connected:true,getAudioContext:()=>({state:contextState,resume:async()=>{}}),onInterrupt:()=>interrupted++,onTranscript:async text=>transcripts.push(text),onEnabled:value=>enabled=value,onActivity:value=>activity=value};
 let tree;function render(){cursor=0;tree=HandsFree(props);const list=jobs;jobs=[];for(const fn of list){const cleanup=fn();if(cleanup)cleanups.push(cleanup);}}
 function find(predicate,node=tree){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const found=find(predicate,child);if(found)return found;}return null;}if(predicate(node))return node;return node.props?.children===undefined?null:find(predicate,node.props.children);}
 const button=()=>find(n=>n.type==='button');const content=()=>JSON.stringify(tree,(k,v)=>k==='ref'?undefined:v);
 render();button().props.onClick();await tick();render();assert.ok(enabled);assert.equal(activity,false);assert.match(content(),/Mic on/);
 callbacks.onStart();render();assert.equal(interrupted,1);assert.equal(activity,true);assert.match(content(),/speaking/);
 let resolveOld;global.fetch=async(_,init)=>{requests.push(init);return new Promise(resolve=>resolveOld=resolve)};
 callbacks.onEnd(new Float32Array(16000));await tick();render();assert.match(content(),/Transcribing/);assert.ok(requests[0].body.get('file').type==='audio/wav');
 // New speech cancels old transcription; a late old result cannot become a question.
 callbacks.onStart();render();assert.ok(requests[0].signal.aborted);resolveOld(Response.json({text:'stale words'}));await tick();assert.equal(transcripts.length,0);
 global.fetch=async()=>Response.json({text:'Friday only'});callbacks.onEnd(new Float32Array(16000));await tick();render();assert.deepEqual(transcripts,['Friday only']);assert.equal(activity,false);assert.match(content(),/Friday only/);
 // Silence produces no model request.
 callbacks.onStart();global.fetch=async()=>Response.json({text:''});callbacks.onEnd(new Float32Array(16000));await tick();assert.deepEqual(transcripts,['Friday only']);
 // Failed upload preserves the WAV and exposes a retry action.
 callbacks.onStart();global.fetch=async()=>Response.json({error:'Quota reached'},{status:429,headers:{'X-Request-ID':'handsfree-test'}});callbacks.onEnd(new Float32Array(16000));await tick();render();assert.match(content(),/Quota reached/);assert.ok(find(n=>n.type==='button'&&n.props.children==='Retry this recording'));
 global.fetch=async()=>Response.json({text:'Retry worked'});find(n=>n.type==='button'&&n.props.children==='Retry this recording').props.onClick();await tick();render();assert.deepEqual(transcripts,['Friday only','Retry worked']);
 // Hidden page releases the microphone and ignores later detector events.
 document.hidden=true;events.visibilitychange();render();assert.equal(enabled,false);assert.ok(stopped);assert.ok(destroyed);const count=transcripts.length;callbacks.onEnd(new Float32Array(16000));await tick();assert.equal(transcripts.length,count);
 document.hidden=false;let grant;permission=new Promise(resolve=>grant=resolve);button().props.onClick();await tick();render();button().props.onClick();grant(mic);await tick();render();assert.equal(enabled,false);assert.ok(stopped>=2);
 cleanups.forEach(fn=>fn());
 console.log('Passed hands-free: WAV encoding, echo-cancellation request, speech interrupts, pause auto-sends, stale transcript rejection, silence, retry preserved audio, visibility cleanup and permission cancellation.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
