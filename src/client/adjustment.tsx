import {Toolbar} from './toolbar';
import {useEffect,useRef,useState} from 'react';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const edges=['n','ne','e','se','s','sw','w','nw'];
export function Adjustment({characterId,character,chatRequest=0,native=false,children}:{characterId:string;character:any;chatRequest?:number;native?:boolean;children:any}){
 const key='live2d-stage.layout.'+(native?'native.':'app.')+characterId;
 const defaults={width:350,height:470,scale:1,x:0,y:0,left:Math.max(0,window.innerWidth-426),top:Math.max(0,window.innerHeight-494)};
 const initial=()=>{try{const v=JSON.parse(localStorage.getItem(key)||'{}');return {...defaults,width:clamp(Number(v.width)||350,240,1000),height:clamp(Number(v.height)||470,300,1200),scale:clamp(Number(v.scale)||1,.3,3),x:clamp(Number(v.x)||0,-800,800),y:clamp(Number(v.y)||0,-800,800),left:clamp(Number(v.left??defaults.left),0,Math.max(0,window.innerWidth-80)),top:clamp(Number(v.top??defaults.top),0,Math.max(0,window.innerHeight-80))};}catch{return defaults;}};
 const [layout,setLayout]=useState(initial),[editing,setEditing]=useState(false),[panel,setPanel]=useState(''),[toolbarVisible,setToolbarVisible]=useState(true);
 const surface=useRef<HTMLDivElement>(null),drag=useRef<any>(null),tap=useRef<any>(null),nativeDouble=useRef(-1000),pointerDouble=useRef(-1000),current=useRef(layout),frame=useRef(0),wheelSave=useRef<any>(null);
 const panelWidth=panel==='chat'?440:panel?320:0,panelHeight=panel==='chat'?Math.max(layout.height,620):layout.height;
 const post=(text:string)=>(window as any).chrome?.webview?.postMessage(text);
 const update=(value:typeof layout)=>{current.current=value;if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;setLayout(current.current);});};
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(current.current));}catch{}if(native){post('layout:'+JSON.stringify({key,value:JSON.stringify(current.current)}));post('save');}};
 const fit=()=>{if(native)return;const v=current.current;update({...v,left:clamp(v.left,0,Math.max(0,window.innerWidth-v.width-52-panelWidth)),top:clamp(v.top,0,Math.max(0,window.innerHeight-(panel==='chat'?Math.max(v.height,620):v.height)))});};
 useEffect(()=>{if(native)post('resize:'+(layout.width+52+panelWidth)+':'+panelHeight);},[layout.width,panelWidth,panelHeight,native]);
 useEffect(()=>{fit();},[panel]);
 useEffect(()=>{const resize=()=>{if(!drag.current)fit();};window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[panel,native]);
 useEffect(()=>{if(native&&chatRequest)setPanel('chat');},[native,chatRequest]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);clearTimeout(wheelSave.current);},[]);
 useEffect(()=>{
  let hideTimer:ReturnType<typeof setTimeout>|undefined;
  const show=()=>{clearTimeout(hideTimer);hideTimer=undefined;setToolbarVisible(true);};
  const leave=()=>{if(hideTimer!==undefined)return;hideTimer=setTimeout(()=>{hideTimer=undefined;if(drag.current){leave();return;}setToolbarVisible(false);},2000);};
  const track=(x:number,y:number)=>{
   const regions=surface.current?.querySelectorAll('.l2ds-viewport,.l2ds-controls,.l2ds-sidepanel');
   const inside=regions&&Array.from(regions).some(el=>{const r=el.getBoundingClientRect();return x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom;});
   if(inside||drag.current)show();else leave();
  };
  const pointer=(e:PointerEvent)=>track(e.clientX,e.clientY);
  const outside=(e:MouseEvent)=>{if(!e.relatedTarget)leave();};
  const nativePointer=(e:MessageEvent)=>{const d=e.data;if(d?.type==='live2d-pointer'&&Number.isFinite(d.x)&&Number.isFinite(d.y))track(d.x,d.y);};
  const webview=native?(window as any).chrome?.webview:undefined;
  window.addEventListener('pointermove',pointer,true);window.addEventListener('mouseout',outside);window.addEventListener('blur',leave);
  surface.current?.addEventListener('focusin',show);webview?.addEventListener?.('message',nativePointer);leave();
  return()=>{clearTimeout(hideTimer);window.removeEventListener('pointermove',pointer,true);window.removeEventListener('mouseout',outside);window.removeEventListener('blur',leave);surface.current?.removeEventListener('focusin',show);webview?.removeEventListener?.('message',nativePointer);};
 },[native]);
 function reset(){update({...defaults});setPanel('');setEditing(false);tap.current=null;save();if(native)post('reset');}
 function begin(e:any,canvas=false,edge=''){
  if(e.button!==0||drag.current)return;e.preventDefault();e.stopPropagation();
  const nativeGesture=native&&(Boolean(edge)||canvas||!editing);
  drag.current={x:e.screenX,y:e.screenY,pointerId:e.pointerId,start:{...current.current},canvas,edge,moved:false,nativeGesture};
  surface.current?.setPointerCapture(e.pointerId);
  if(nativeGesture)post('gesture:'+JSON.stringify({phase:'start',edge:edge||'move',width:current.current.width,height:current.current.height,panelWidth,minHeight:panel==='chat'?620:300}));
 }
 function move(e:any){
  const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;const dx=e.screenX-d.x,dy=e.screenY-d.y;
  if(!d.moved&&Math.hypot(dx,dy)<4)return;d.moved=true;tap.current=null;
  if(d.nativeGesture){post('gesture:'+JSON.stringify({phase:'move'}));return;}
  const v=d.start;
  if(d.edge){const width=clamp(v.width+(d.edge.includes('e')?dx:d.edge.includes('w')?-dx:0),240,1000),height=clamp(v.height+(d.edge.includes('s')?dy:d.edge.includes('n')?-dy:0),300,1200);update({...v,width,height,left:v.left+(d.edge.includes('w')?v.width-width:0),top:v.top+(d.edge.includes('n')?v.height-height:0)});}
  else if(d.canvas||!editing)update({...v,left:clamp(v.left+dx,0,Math.max(0,window.innerWidth-80)),top:clamp(v.top+dy,0,Math.max(0,window.innerHeight-80))});
  else update({...v,x:clamp(v.x+dx,-800,800),y:clamp(v.y+dy,-800,800)});
 }
 function end(e:any,cancel=false){
  const d=drag.current;if(!d)return;drag.current=null;
  if(surface.current?.hasPointerCapture(d.pointerId))surface.current.releasePointerCapture(d.pointerId);
  if(d.nativeGesture)post('gesture:'+JSON.stringify({phase:'end'}));
  if(!cancel&&!d.moved&&!d.canvas&&!d.edge){const prev=tap.current,now=performance.now();if(prev&&now-prev.time<500&&Math.hypot(e.screenX-prev.x,e.screenY-prev.y)<8){if(!native||now-nativeDouble.current>250){setEditing(v=>!v);pointerDouble.current=now;}tap.current=null;}else tap.current={time:now,x:e.screenX,y:e.screenY};}else tap.current=null;
  save();
 }
 useEffect(()=>{if(!native)return;const webview=(window as any).chrome?.webview;
  function bounds(event:MessageEvent){const d=event.data;if(d?.type==='live2d-layout'&&Number.isFinite(d.width)&&Number.isFinite(d.height)){if(drag.current)drag.current.moved=drag.current.moved||d.moved;update({...current.current,width:clamp(d.width,240,1000),height:clamp(d.height,300,1200)});}else if(d?.type==='live2d-gesture-end'){if(drag.current?.nativeGesture){const id=drag.current.pointerId;drag.current=null;if(surface.current?.hasPointerCapture(id))surface.current.releasePointerCapture(id);}save();}}
  webview?.addEventListener?.('message',bounds);return()=>webview?.removeEventListener?.('message',bounds);
 },[native]);
 useEffect(()=>{const el=surface.current;if(!el)return;
  const wheel=(e:WheelEvent)=>{if(!editing||(e.target as HTMLElement).closest('.l2ds-toolbar,.l2ds-sidepanel'))return;e.preventDefault();e.stopPropagation();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?current.current.height:1);update({...current.current,scale:clamp(current.current.scale*Math.exp(-pixels*Math.log(1.05)/120),.3,3)});clearTimeout(wheelSave.current);wheelSave.current=setTimeout(save,180);};
  el.addEventListener('wheel',wheel,{passive:false});return()=>{el.removeEventListener('wheel',wheel);clearTimeout(wheelSave.current);};
 },[editing,native]);
 useEffect(()=>{if(!native)return;function doubleClick(event:Event){const {x,y}=(event as CustomEvent).detail||{};const target=document.elementFromPoint(x,y);if(!target?.closest('.l2ds-adjust')||target.closest('.l2ds-toolbar,.l2ds-sidepanel,.l2ds-resize'))return;const now=performance.now();nativeDouble.current=now;tap.current=null;if(now-pointerDouble.current>250){save();setEditing(v=>!v);}}window.addEventListener('live2d-native-doubleclick',doubleClick);return()=>window.removeEventListener('live2d-native-doubleclick',doubleClick);},[native]);
 useEffect(()=>{if(editing){surface.current?.focus({preventScroll:true});if(native)post('focus');}},[editing,native]);
 useEffect(()=>{function finish(){const d=drag.current;drag.current=null;if(d?.nativeGesture)post('gesture:'+JSON.stringify({phase:'end'}));if(d&&surface.current?.hasPointerCapture(d.pointerId))surface.current.releasePointerCapture(d.pointerId);clearTimeout(wheelSave.current);save();setEditing(false);tap.current=null;}
  function keydown(e:KeyboardEvent){if(e.key==='Escape'&&editing){e.preventDefault();e.stopImmediatePropagation();finish();}}
  function nativeEscape(){if(editing)finish();}window.addEventListener('keydown',keydown,true);window.addEventListener('live2d-native-escape',nativeEscape);return()=>{window.removeEventListener('keydown',keydown,true);window.removeEventListener('live2d-native-escape',nativeEscape);};
 },[editing]);
 return <div ref={surface} tabIndex={-1} className={'l2ds-adjust'+(editing?' is-editing':'')} aria-label="Live2D 画布" style={{...(native?{width:'100%',height:'100%'}:{position:'fixed' as const,left:layout.left,top:layout.top,width:layout.width+52+panelWidth,height:panelHeight}),'--l2ds-panel-width':panelWidth+'px','--l2ds-panel-height':panelHeight+'px'} as any} onDoubleClick={e=>e.preventDefault()} onPointerDown={e=>{if(!(e.target as HTMLElement).closest('.l2ds-toolbar,.l2ds-sidepanel,.l2ds-resize'))begin(e);}} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>{if(!drag.current?.nativeGesture)end(e,true);}} onLostPointerCapture={e=>{if(drag.current&&!drag.current.nativeGesture)end(e,true);}}>
  <div className="l2ds-viewport" style={{width:layout.width,height:layout.height}}><div className="l2ds-model" style={{width:`${layout.scale*100}%`,height:`${layout.scale*100}%`,left:`calc(${(1-layout.scale)*50}% + ${layout.x}px)`,top:`calc(${(1-layout.scale)*50}% + ${layout.y}px)`,right:'auto',bottom:'auto'}}>{children}</div></div>
  {editing&&<div className="l2ds-resize-frame" style={{width:layout.width,height:layout.height}}><small className="l2ds-adjust-hint">Esc 退出保存，滚轮控制人物放大</small>{edges.map(edge=><div key={edge} className={'l2ds-resize l2ds-resize-'+edge} aria-label={'调整画布 '+edge} onPointerDown={e=>begin(e,false,edge)}/>)}</div>}
  <div className={'l2ds-controls'+(toolbarVisible?'':' is-toolbar-hidden')} style={{left:layout.width,height:layout.height}}><Toolbar character={character} native={native} panel={panel} setPanel={setPanel} reset={reset} startDrag={e=>begin(e,true)}/></div>
 </div>;
}
