import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apply} from '../src/index.mjs';
import {FloatingController} from '../src/floating.mjs';

test('Agent reads two JSON catalogs and pushes both tracks without polling or acknowledgement',async()=>{
  const root=await mkdtemp(join(tmpdir(),'live2d-presentation-')),tools=new Map(),sections=[],routes=[],cleanup=[];
  let server,reader;
  try{
    await apply({effect:fn=>{const dispose=fn();if(typeof dispose==='function')cleanup.push(dispose);},webServer:{register:route=>routes.push(route)},connection:{admit:()=>({peer:{}})},tools:{register:tool=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name);}},systemPrompt:{section:section=>sections.push(section)}},{dataDir:root});
    server=createServer(routes[0].handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/live2d-stage/';
    const post=async(path,data)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(response.status,200);return response.json();};
    await post('preferences',{actionControl:true});
    assert.deepEqual([...tools.keys()],['live2d_list_motions','live2d_list_expressions','live2d_present']);
    const motions=await tools.get('live2d_list_motions').execute({}),expressions=await tools.get('live2d_list_expressions').execute({});
    assert.equal(motions.motions.length,8);assert.equal(expressions.expressions.length,23);
    const prompt=sections[0].text();assert.ok(prompt.includes(motions.characterId));assert.ok(!prompt.includes(motions.motions[0].name));
    const stream=await fetch(base+'stream?client=test&character='+motions.characterId);assert.match(stream.headers.get('content-type'),/text\/event-stream/);reader=stream.body.getReader();await reader.read();
    const present=tools.get('live2d_present'),args={characterId:motions.characterId,motionId:motions.motions[0].id,expressionId:expressions.expressions[0].id};
    const first=await present.execute(args),second=await present.execute(args);assert.equal(first.status,'submitted');assert.notEqual(first.eventId,second.eventId);
    let data='';while((data.match(/data: /g)??[]).length<2){const next=await reader.read();assert.equal(next.done,false);data+=new TextDecoder().decode(next.value);}
    const events=data.split('\n\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
    assert.equal(events.length,2);for(const event of events){assert.equal(event.motion.id,args.motionId);assert.equal(event.expression.id,args.expressionId);}
    assert.equal(sections[0].text(),prompt);
    await post('update',{characterId:args.characterId,actionId:args.expressionId,actionName:'测试新表情名'});
    const renamed=await tools.get('live2d_list_expressions').execute({});assert.equal(renamed.expressions[0].name,'测试新表情名');assert.notEqual(renamed.version,expressions.version);assert.equal((await tools.get('live2d_list_motions').execute({})).version,motions.version);assert.notEqual(sections[0].text(),prompt);assert.ok(sections[0].text().includes(renamed.version));assert.ok(sections[0].text().includes('Never reread unchanged catalogs'));const renamedPrompt=sections[0].text();await present.execute(args);assert.equal(sections[0].text(),renamedPrompt);
    await assert.rejects(present.execute({...args,motionId:args.expressionId}),/动作/);
    await assert.rejects(present.execute({...args,expressionId:undefined}),/缺少参数/);
    assert.equal((await fetch(base+'receipt',{method:'POST',body:'{}'})).status,404);
    assert.equal((await fetch(base+'events')).status,404);
    assert.equal((await fetch(base+'stream?client=bad&character='+args.characterId,{headers:{Origin:'https://example.invalid'}})).status,403);
    await post('preferences',{actionControl:false});assert.equal(sections[0].text(),'');assert.equal(tools.size,0);await assert.rejects(present.execute(args),/已关闭/);
  }finally{await reader?.cancel();for(const dispose of cleanup)dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true});}
});

test('native authentication admits the playback stream and no longer admits receipts',()=>{
  const floating=new FloatingController({directory:'.',profile:'.',origin:'http://localhost'});floating.token='test-token';
  assert.equal(floating.admits({method:'GET',url:'/live2d-stage/stream',headers:{'x-live2d-float':'test-token'}}),true);
  assert.equal(floating.admits({method:'GET',url:'/live2d-stage/stream',headers:{}}),false);
  assert.equal(floating.admits({method:'POST',url:'/live2d-stage/receipt',headers:{'x-live2d-float':'test-token'}}),false);
});
