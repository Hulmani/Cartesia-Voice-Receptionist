export async function withRequest(request:Request,handler:(request:Request)=>Promise<Response>){
 const requestId=crypto.randomUUID();let response:Response;
 try{response=await handler(request);}catch{response=Response.json({error:'The server could not complete this request. Please retry.'},{status:500});}
 const headers=new Headers(response.headers);headers.set('X-Request-ID',requestId);headers.set('Cache-Control','no-store');
 if(!response.ok)console.warn(JSON.stringify({requestId,path:new URL(request.url).pathname,status:response.status}));
 return new Response(response.body,{status:response.status,headers});
}
