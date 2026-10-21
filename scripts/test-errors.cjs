const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,imports={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>imports[name]||require(name),exports);return exports;}
const client=load('app/request.ts');
const boundary=load('app/api/result.ts');
async function failure(fn,pattern){await assert.rejects(fn,error=>{assert.match(client.errorText(error),pattern);return true;});}
async function main(){
 global.fetch=async()=>Response.json({error:'Gemini quota reached.'},{status:502,headers:{'X-Request-ID':'test-reference'}});
 await failure(()=>client.getJSON('/api/converse'),/Gemini quota reached.[\s\S]*HTTP 502.*Request test-reference/);
 global.fetch=async()=>new Response('<html>Sign in</html>',{status:401});await failure(()=>client.getJSON('/api/speech'),/session may have expired/);
 global.fetch=async()=>new Response('<html>proxy error</html>',{status:502});await failure(()=>client.getJSON('/api/transcribe'),/could not complete/);
 global.fetch=async()=>new Response('{broken',{headers:{'Content-Type':'application/json','X-Request-ID':'malformed'}});await failure(()=>client.getJSON('/api/converse'),/unreadable data[\s\S]*malformed/);
 global.fetch=async()=>{throw Error('internal-secret-must-not-escape')};await failure(()=>client.getJSON('/api/converse'),/Check your connection/);
 global.fetch=async()=>new Response('',{headers:{'Content-Type':'audio/wav'}});await failure(()=>client.getAudio('/api/speech',{}),/audio was empty/);
 global.fetch=async()=>Response.json({text:'wrong audio'});await failure(()=>client.getAudio('/api/speech',{}),/did not return audio/);
 const oldTimer=global.setTimeout;global.setTimeout=(fn)=>oldTimer(fn,1);
 global.fetch=async(_,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
 await failure(()=>client.getJSON('/api/transcribe'),/took too long/);global.setTimeout=oldTimer;
 global.fetch=async()=>Response.json({text:'Retained transcript'});assert.equal((await client.getJSON('/api/transcribe')).text,'Retained transcript');
 const warnings=[];const oldWarn=console.warn;console.warn=(line)=>warnings.push(line);
 const response=await boundary.withRequest(new Request('https://test/api/speech'),async()=>{throw Error('secret-data')});
 console.warn=oldWarn;assert.equal(response.status,500);assert.ok(response.headers.get('X-Request-ID'));assert.equal(response.headers.get('Cache-Control'),'no-store');assert.ok(!(await response.text()).includes('secret-data'));assert.ok(!warnings.join().includes('secret-data'));assert.ok(warnings.join().includes(response.headers.get('X-Request-ID')));
 const env={CARTESIA_API_KEY:'test-only-key'};
 for(const route of ['speech','transcribe']){
  const {POST}=load(`app/api/${route}/route.ts`,{'cloudflare:workers':{env},'../result':boundary});
  let body,headers={origin:'https://test'};
  if(route==='speech'){headers['Content-Type']='application/json';body=JSON.stringify({text:'Hello'});}else{body=new FormData();body.append('file',new File(['audio'],'test.webm',{type:'audio/webm'}));}
  global.fetch=async()=>new Response('secret-provider-body',{status:429});
  const failed=await POST(new Request(`https://test/api/${route}`,{method:'POST',headers,body}));assert.equal(failed.status,502);assert.ok(failed.headers.get('X-Request-ID'));assert.ok(!(await failed.text()).includes('secret-provider-body'));
 }
 console.log('Passed failure cases: quota, expired session, HTML errors, invalid JSON, network failure, empty/wrong audio, timeout, request references and secret redaction across backend routes.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
