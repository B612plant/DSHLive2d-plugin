import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,readdir,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {handler} from '../lib/index.mjs';
import {StageStore} from '../lib/store.cjs';
const directory=dirname(fileURLToPath(import.meta.url)),root=await mkdtemp(resolve(tmpdir(),'live2d-browser-smoke-'));
const plugin=resolve(directory,'..'),report=resolve(plugin,'build/reports/live2d-plugin');await mkdir(report,{recursive:true});
let browser,server;
try {
  const s=new StageStore(root);await s.initialize();if(process.argv[2]==='--default')await s.ensureDefaultCharacter(resolve(plugin,'character/deepseek'));
  const reactBuild=await build({entryPoints:[resolve(directory,'settings-harness.tsx')],bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}});
  const route=handler(s,resolve(plugin,'assets'),()=>({peer:{}}));
  server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body style="background:#16191f"><div id="root"></div><script src="/react.js"></script><script src="/client.js"></script></body></html>');}else if(req.url==='/react.js'){res.setHeader('Content-Type','text/javascript');res.end(reactBuild.outputFiles[0].contents);}else if(req.url==='/client.js'){res.setHeader('Content-Type','text/javascript');readFile(resolve(plugin,'lib/client.js'),'utf8').then(b=>res.end(b.replaceAll('setLookTarget(x, y) {','setLookTarget(x, y) { window.__live2dTest=this;')));}else void route(req,res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1150,height:900}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());});
  page.on('requestfailed',r=>console.log('REQUEST FAILED',r.failure()?.errorText,r.url()));
  await page.goto(url);await page.getByRole('button',{name:'设置',exact:true}).click();
  if(process.argv[2]!=='--default')await page.getByLabel('上传角色 ZIP').setInputFiles(process.argv[2]);
  const readyDeadline=Date.now()+25000;while(Date.now()<readyDeadline&&![...s.clients.values()].some(c=>c.characterId))await new Promise(r=>setTimeout(r,200));
  assert.ok([...s.clients.values()].some(c=>c.characterId),'model ready');
  assert.equal(s.state.characters.length,1);const c=s.character();assert.ok(c.actions.length>0);
  await page.waitForFunction(()=>!!window.__live2dTest);
  await page.evaluate(()=>{const player=window.__live2dTest;window.__motionCalls=[];window.__expressionCalls=[];const motion=player.playMotion.bind(player),expression=player.setExpression.bind(player);player.playMotion=(group,index)=>{const call={group,index,completed:false};window.__motionCalls.push(call);return motion(group,index).then(ok=>{call.completed=ok;return ok;});};player.setExpression=id=>{const ok=expression(id);window.__expressionCalls.push({id,ok});return ok;};});
  const forbiddenRequests=[];page.on('request',r=>{if(/\/(events|receipt)(\?|$)/.test(new URL(r.url()).pathname))forbiddenRequests.push(r.url());});
  const first=page.getByLabel('动作名称').first();await first.fill('测试招手');await first.blur();await page.waitForFunction(()=>!document.querySelector('input[aria-label="动作名称"]')?.disabled);
  assert.equal(s.catalog().actions[0].name,'测试招手');
  await page.getByRole('button',{name:'试播',exact:true}).first().click();
  await page.waitForFunction(async()=>{const r=await fetch('/live2d-stage/state');return r.ok;});
  await page.waitForFunction(()=>window.__motionCalls.length===1);
  const expression=c.actions.find(a=>a.kind==='expression'&&a.name==='脸红')??c.actions.find(a=>a.kind==='expression');
  const motion=c.actions.find(a=>a.kind==='motion'&&a.group!=='Idle')??c.actions.find(a=>a.kind==='motion');
  if(expression&&motion){s.present(c.id,motion.id,expression.id);s.present(c.id,motion.id,expression.id);await page.waitForFunction(()=>window.__motionCalls.length===3&&window.__expressionCalls.length===2);assert.ok(await page.evaluate(()=>window.__expressionCalls.every(c=>c.ok)));assert.ok(await page.evaluate(()=>window.__motionCalls.slice(1).every(c=>!c.completed)),'expressions did not wait for motion completion');}
  assert.deepEqual(forbiddenRequests,[]);
  await page.getByRole('button',{name:'设置',exact:true}).click();assert.equal(await page.getByLabel('动作名称').first().inputValue(),'测试招手');await page.getByLabel('搜索动作').fill('不存在');assert.equal(await page.getByLabel('动作名称').count(),0);await page.getByLabel('搜索动作').fill('');await page.screenshot({path:resolve(report,'settings.png')});assert.deepEqual(errors,[]);
  await writeFile(resolve(report,'browser-smoke.json'),JSON.stringify({rendered:true,actions:c.actions.length,renamePersisted:true,actualPlayback:true,errors},null,2));
  console.log('Real model WebGL rendering, ZIP upload, action rename and actual playback passed.');
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(root,{recursive:true,force:true});}





