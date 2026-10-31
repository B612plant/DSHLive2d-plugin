import {useEffect,useRef,useState} from 'react';
import {Icon} from './icons';
import {api} from './api';

export function ChatPanel({onClose}:{onClose:()=>void}){
 const [sessions,setSessions]=useState<any[]>([]),[workspaces,setWorkspaces]=useState<any[]>([]),[workspace,setWorkspace]=useState(''),[session,setSession]=useState(''),[ready,setReady]=useState(false),[draft,setDraft]=useState(''),[history,setHistory]=useState<any>({messages:[]}),[error,setError]=useState(''),[sending,setSending]=useState(false);
 const pending=useRef<any>(null),list=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),follow=useRef(true);
 function accept(data:any){setSessions(data.items??[]);setWorkspaces(data.workspaces??[]);setReady(true);}
 useEffect(()=>{let active=true,timer:any;async function refresh(){try{const data=await api('chat/sessions');if(active)accept(data);}catch(e:any){if(active)setError(e.message);}finally{if(active)timer=setTimeout(refresh,3000);}}void refresh();return()=>{active=false;clearTimeout(timer);};},[]);
 useEffect(()=>{if(!ready)return;if(workspace&&!workspaces.some(w=>w.workspaceId===workspace)){setWorkspace('');setSession('');}else if(session&&!sessions.some(s=>s.sessionId===session&&(!workspace||s.workspaceId===workspace)))setSession('');},[sessions,workspaces,workspace,session,ready]);
 useEffect(()=>{setHistory({messages:[]});follow.current=true;if(!session)return;let active=true,timer:any;async function poll(){try{const next=await api('chat/history?session='+encodeURIComponent(session));if(active)setHistory(next);}catch(e:any){if(active)setError(e.message);}finally{if(active)timer=setTimeout(poll,700);}}void poll();return()=>{active=false;clearTimeout(timer);};},[session]);
 useEffect(()=>{if(follow.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[history]);
 useEffect(()=>{const el=input.current;if(el){el.style.height='auto';el.style.height=Math.min(180,Math.max(64,el.scrollHeight))+'px';}},[draft]);
 async function send(){if(sending||!ready||!draft.trim()||(!session&&!workspace))return;setSending(true);setError('');follow.current=true;
  if(!pending.current||pending.current.text!==draft||pending.current.sessionId!==session||(pending.current.workspaceId||'')!==workspace)pending.current={text:draft,sessionId:session,workspaceId:workspace||undefined,requestId:crypto.randomUUID(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  try{const result=await api('chat/send',pending.current);accept(await api('chat/sessions'));setSession(result.sessionId);setDraft('');pending.current=null;input.current?.focus();}catch(e:any){setError(e.message);}finally{setSending(false);}
 }
 function chooseSession(value:string){setSession(value);setError('');pending.current=null;}
 async function upload(){if(sending||(!session&&!workspace))return;setSending(true);setError('');try{const result=await api('chat/upload',{sessionId:session,workspaceId:workspace||undefined,text:draft,requestId:crypto.randomUUID()});accept(await api('chat/sessions'));chooseSession(result.sessionId);setDraft('');onClose();}catch(e:any){setError(e.message);}finally{setSending(false);}}
 return <div className="l2ds-chat">
  <header className="l2ds-chat-heading"><button className="l2ds-panel-close" type="button" aria-label="收起面板" title="关闭" onClick={onClose}><Icon name="x"/></button></header>
  <div className="l2ds-chat-selectors"><select aria-label="选择工作区" value={workspace} disabled={sending||!ready} onChange={e=>{setWorkspace(e.target.value);chooseSession('');}}><option value="">全部工作区</option>{workspaces.map(w=><option key={w.workspaceId} value={w.workspaceId}>{w.title||w.path}</option>)}</select>
   <select aria-label="选择对话" value={session} disabled={sending||!ready} onChange={e=>chooseSession(e.target.value)}><option value="">{workspace?'新建对话':'选择会话'}</option>{sessions.filter(s=>!workspace||s.workspaceId===workspace).map(s=><option key={s.sessionId} value={s.sessionId}>{s.title||'未命名会话'}</option>)}</select></div>
  <div ref={list} className="l2ds-messages" role="log" aria-label="对话记录" onScroll={()=>{const el=list.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}}>{history.messages.map((m:any)=><div key={m.id} className={'l2ds-message '+m.role}><small>{m.role==='user'?'你':'Agent'}</small><div>{m.text}</div></div>)}{history.running&&<p className="l2ds-chat-running" role="status">正在回复…</p>}{history.error&&<p role="alert">{history.error}</p>}</div>
  {error&&<p role="alert">{error}</p>}
  <form className="l2ds-composer" onSubmit={e=>{e.preventDefault();void send();}}><textarea ref={input} aria-label="对话内容" value={draft} maxLength={32000} onChange={e=>setDraft(e.target.value)} placeholder="发消息…" onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
   <footer><button className="l2ds-upload" type="button" aria-label="在 Harness 上传文件" title="在 Harness 上传文件" disabled={sending||!ready||(!session&&!workspace)} onClick={()=>void upload()}><Icon name="plus"/></button><small>Ctrl + Enter</small><button className="l2ds-send" type="submit" title="发送消息" aria-label="发送消息" disabled={sending||!ready||!draft.trim()||(!session&&!workspace)} aria-busy={sending}><Icon name={sending?'loading':'send'}/></button></footer>
  </form>
 </div>;
}
