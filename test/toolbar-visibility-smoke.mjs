import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clientStyleModule} from '../scripts/style-module.mjs';

const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {Adjustment} from './src/client/adjustment';import './src/client/stage.css';
const native=location.search.includes('native');const listeners=new Set();window.chrome={webview:{postMessage(){},addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn)}};window.nativePointer=(x,y)=>{for(const fn of listeners)fn({data:{type:'live2d-pointer',x,y}});};
createRoot(document.getElementById('root')).render(<section className="l2ds" style={native?{left:0,top:0,width:450,height:600}:undefined}><Adjustment native={native} characterId="test" character={{id:'test',actions:[]}}><div/></Adjustment></section>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'css',setup(b){b.onLoad({filter:/\.css$/},async args=>({loader:'js',contents:clientStyleModule(await readFile(args.path,'utf8'),'visibility-test',args.path)}));}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].contents:'<div id="root"></div><script src="/bundle.js"></script>');});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'msedge',headless:true});
 for(const native of [false,true]){
  const page=await browser.newPage({viewport:{width:900,height:800}});await page.goto('http://127.0.0.1:'+server.address().port+(native?'/?native':'/'));
  const canvas=await page.locator('.l2ds-viewport').boundingBox(),icons=await page.locator('.l2ds-controls').boundingBox(),toolbar=page.locator('.l2ds-toolbar');
  const point=async(x,y)=>{if(native)await page.evaluate(([x,y])=>window.nativePointer(x,y),[x,y]);else await page.mouse.move(x,y);};
  const visible=()=>toolbar.evaluate(el=>getComputedStyle(el).visibility==='visible');
  await point(canvas.x+30,canvas.y+30);assert.equal(await visible(),true);
  await point(1,799);await page.waitForTimeout(1100);assert.equal(await visible(),true,'visible before two seconds');
  await point(icons.x+20,icons.y+100);await page.waitForTimeout(1100);assert.equal(await visible(),true,'entering icon region cancels hiding');
  await point(1,799);if(native){for(let i=0;i<7;i++){await page.waitForTimeout(300);await point(1,799);}}else await page.waitForTimeout(2100);
  assert.equal(await visible(),false,'outside for two seconds hides icons even with repeated native updates');
  await point(icons.x+20,icons.y+100);assert.equal(await visible(),true,'hidden icon region can reveal icons');
  await point(1,799);await point(canvas.x+30,canvas.y+30);await page.waitForTimeout(2100);assert.equal(await visible(),true,'staying in canvas keeps icons visible');
  await page.close();
 }
 console.log('Toolbar hides after two seconds outside, cancels on reentry, and restores in app and native modes.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
