export class ServiceError extends Error {
 constructor(message:string,public reference='',public status=0){super(message);}
}
async function request(path:string,init:RequestInit,kind:'json'|'audio',timeout=75000):Promise<any>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
 const cancel=()=>controller.abort();init.signal?.addEventListener('abort',cancel,{once:true});if(init.signal?.aborted)cancel();
 try{
  const response=await fetch(path,{...init,signal:controller.signal});
  const reference=response.headers.get('X-Request-ID')||'';
  if(!response.ok){let message='The service could not complete this request. Please retry.';
   if(response.headers.get('content-type')?.includes('application/json')){const data=await response.json().catch(()=>null) as {error?:unknown}|null;if(typeof data?.error==='string')message=data.error;}
   else if(response.status===401||response.status===403)message='Your page session may have expired. Refresh this page and sign in again.';
   throw new ServiceError(message,reference,response.status);
  }
  if(kind==='json'){if(!response.headers.get('content-type')?.includes('application/json'))throw new ServiceError('The server returned an unexpected response. Refresh the page and retry.',reference,response.status);try{return await response.json();}catch{throw new ServiceError('The server returned unreadable data. Please retry.',reference,response.status);}}
  if(!response.headers.get('content-type')?.startsWith('audio/'))throw new ServiceError('The server did not return audio. Retry speech generation.',reference,response.status);
  const blob=await response.blob();if(!blob.size)throw new ServiceError('The returned audio was empty. Retry speech generation.',reference,response.status);return blob;
 }catch(error){
  if(error instanceof ServiceError)throw error;
  if(controller.signal.aborted)throw new ServiceError(init.signal?.aborted?'The request was interrupted. Your completed work is still available.':'This request took too long. Your completed work is still available; please retry.');
  throw new ServiceError(typeof navigator!=='undefined'&&navigator.onLine===false?'You appear to be offline. Reconnect, then retry.':'Could not reach the server. Check your connection and retry.');
 }finally{clearTimeout(timer);init.signal?.removeEventListener('abort',cancel);}
}
export const getJSON=(path:string,init:RequestInit={})=>request(path,init,'json');
export const getAudio=(path:string,init:RequestInit)=>request(path,init,'audio',60000) as Promise<Blob>;
export function errorText(error:unknown){return error instanceof ServiceError?error.message+(error.reference||error.status?`\nTechnical details: ${error.status?`HTTP ${error.status}`:''}${error.reference?` · Request ${error.reference}`:''}`:''):error instanceof Error?error.message:'Something went wrong. Please retry.';}
