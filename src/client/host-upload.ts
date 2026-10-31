import {api} from './api';

// Open the native composer, which owns file selection and upload. Browser file
// dialogs require a gesture in their own window; do not proxy or recreate them.
export async function openHostUpload(ctx:any,request:any){
 const input=ctx.conversation.input;
 await ctx.sessions.refresh();
 ctx.uiWorkspace.openSession(request.sessionId);
 window.focus();
 const deadline=Date.now()+5000;
 while(!ctx.sessions.binding(request.sessionId)){
  if(Date.now()>=deadline)throw new Error('Harness 输入区暂时无法上传文件，请在主窗口中重试');
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 const binding=ctx.sessions.binding(request.sessionId);
 if(!binding)throw new Error('Harness 会话尚未就绪');
 if(request.text&&input.requestDraftInitialization(binding,{prompt:request.text,whenDraftExists:'append'})==='blocked')throw new Error('Harness 输入区正忙，草稿保留在桌面对话框中');
 input.for(binding.ctx).focus();
}

export function installHostUpload(ctx:any){
 let stopped=false,busy=false,lastId='',lastError='';
 async function poll(){if(stopped||busy)return;busy=true;try{const request=await api('chat/upload-request');if(!request||stopped)return;if(request.requestId!==lastId){lastId=request.requestId;lastError='';try{await openHostUpload(ctx,request);}catch(e:any){lastError=e.message;}}await api('chat/upload-complete',{requestId:request.requestId,error:lastError});}catch{}finally{busy=false;}}
 const timer=setInterval(()=>void poll(),400);
 return()=>{stopped=true;clearInterval(timer);};
}
