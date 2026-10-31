export class StageChat {
  constructor(ctx){this.ctx=ctx;this.errors=new Map();ctx.on?.('api-session/error',(id,error)=>{this.errors.set(id,String(error));if(this.errors.size>100)this.errors.delete(this.errors.keys().next().value);});}
  controller(){if(!this.ctx.sessionController)throw new Error('宿主会话服务尚未就绪');return this.ctx.sessionController;}
  async list(){const result=await this.controller().list({},new AbortController().signal);const workspaces=(this.ctx.workspaceRegistry?.list()??[]).map(w=>({workspaceId:w.id,title:w.title,path:w.path,sessionIds:[...w.sessionIds]}));return {...result,workspaces,items:result.items.map(s=>{const title=[s.projections?.values?.title,s.projectionValues?.title,s.title,s.name].find(v=>typeof v==='string'&&v.trim());return {...s,title:title?.trim()||'未命名会话',workspaceId:workspaces.find(w=>w.sessionIds.includes(s.sessionId))?.workspaceId??null};})};}
  async visibleSession(id,workspaceId){const data=await this.list();const session=data.items.find(s=>s.sessionId===id);if(!session)throw new Error('该会话不在当前 Harness 的可用会话列表中，请重新选择');if(workspaceId&&session.workspaceId!==workspaceId)throw new Error('会话不属于所选 Harness 工作区');return session;}

  uploadRequest(){return this.uploadPending?.request??null;}
  completeUpload(data){const pending=this.uploadPending;if(!pending||data.requestId!==pending.request.requestId)throw new Error('文件上传跳转已失效');this.uploadPending=null;clearTimeout(pending.timer);if(data.error)pending.reject(new Error(String(data.error)));else pending.resolve({sessionId:pending.request.sessionId});return {ok:true};}
  async openUpload(data){
    if(this.uploadPending)throw new Error('正在打开 Harness 文件上传，请稍候');
    if(typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(data.requestId)||typeof data.text!=='string'||data.text.length>32000)throw new Error('无效的上传跳转');
    if(data.sessionId!==undefined&&(typeof data.sessionId!=='string'||data.sessionId.length>200)||data.workspaceId!==undefined&&(typeof data.workspaceId!=='string'||data.workspaceId.length>200))throw new Error('无效的会话或工作区');
    // Create only the host session. Files and attachments stay entirely in its composer.
    let sessionId=data.sessionId;
    if(sessionId)await this.visibleSession(sessionId,data.workspaceId);
    else{if(!data.workspaceId||!this.ctx.workspaceRegistry?.get(data.workspaceId))throw new Error('请先选择 Harness 工作区');sessionId=(await this.controller().create({sessionId:'live2d-'+data.requestId,workspaceId:data.workspaceId})).sessionId;}
    if(this.uploadPending)throw new Error('正在打开 Harness 文件上传，请稍候');
    return new Promise((resolve,reject)=>{const pending={request:{requestId:data.requestId,sessionId,text:data.text},resolve,reject,timer:null};pending.timer=setTimeout(()=>{if(this.uploadPending===pending)this.uploadPending=null;reject(new Error('请先打开 Harness 主窗口，再进入原生文件上传'));},12000);this.uploadPending=pending;});
  }

  async history(id){if(typeof id!=='string'||!id||id.length>200)throw new Error('请选择对话');await this.visibleSession(id);const view=await this.controller().inspect(id,new AbortController().signal);const messages=view.events.filter(e=>['user/message','assistant/message'].includes(e.type)).slice(-100).map(e=>{const m=e.type==='user/message'?e.data:e.data.message;return {id:m.id,role:m.role,text:(m.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n')};}).filter(m=>m.text);return {sessionId:id,messages,running:this.ctx.agents?.get(id)?.status==='running',error:this.errors.get(id)||''};}
  async send(data){if(typeof data.text!=='string'||!data.text.trim()||data.text.length>32000)throw new Error('请输入 1–32000 个字符');if(typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(data.requestId))throw new Error('无效消息标识');if(data.sessionId!==undefined&&(typeof data.sessionId!=='string'||data.sessionId.length>200))throw new Error('无效对话');const controller=this.controller();let id=data.sessionId;if(data.workspaceId!==undefined&&(typeof data.workspaceId!=='string'||data.workspaceId.length>200))throw new Error('无效工作区');if(id){await this.visibleSession(id,data.workspaceId);}else{if(!data.workspaceId||!this.ctx.workspaceRegistry?.get(data.workspaceId))throw new Error('请先选择当前 Harness 的工作区，再新建对话');const created=await controller.create({sessionId:'live2d-'+data.requestId,workspaceId:data.workspaceId});id=created.sessionId;}this.errors.delete(id);await controller.prompt({sessionId:id,requestId:data.requestId,content:[{type:'text',text:data.text.trim()}],mode:'queue',clientTimeZone:data.timeZone||'Asia/Shanghai'},new AbortController().signal);return {accepted:true,sessionId:id};}
}
