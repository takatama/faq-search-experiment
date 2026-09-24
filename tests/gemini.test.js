import test from 'node:test';import assert from 'node:assert/strict';import {GeminiAdapter,parseAliases} from '../src/gemini.js';
test('uses API key header, batches embeddings and counts HTTP requests',async()=>{let init;const g=new GeminiAdapter({apiKey:'secret',maxRequests:1,sleep:async()=>{},fetchImpl:async(u,i)=>(init=i,{ok:true,json:async()=>({embeddings:[{values:[1,2]}]})})});const x=await g.embed(['x'],'RETRIEVAL_QUERY');assert.equal(x.embeddings.length,1);assert.equal(init.headers['x-goog-api-key'],'secret');assert.ok(!init.body.includes('secret'));assert.equal(g.requests,1);await assert.rejects(()=>g.embed(['y'],'RETRIEVAL_QUERY'),/limit reached/);});
test('retries 429 with a bounded attempt count',async()=>{let calls=0;const g=new GeminiAdapter({apiKey:'x',maxRequests:4,sleep:async()=>{},fetchImpl:async()=>{calls++;return {ok:false,status:429,json:async()=>({error:{status:'RESOURCE_EXHAUSTED',message:'quota'}})}}});await assert.rejects(()=>g.embed(['x'],'RETRIEVAL_QUERY'),/HTTP 429/);assert.equal(calls,4);});
test('validates structured alias IDs and count',()=>{const data={candidates:[{content:{parts:[{text:JSON.stringify([{id:'1',aliases:['a','b','c','d','e']}])}]}}]};assert.equal(parseAliases(data,['1'])[0].aliases.length,5);assert.throws(()=>parseAliases(data,['2']),/validation/);});

test('never exposes secret values from network or API errors',async()=>{
 for(const network of [true,false]){
  const g=new GeminiAdapter({apiKey:'test-private-key',fetchImpl:async()=>{if(network)throw new Error('test-private-key');return {ok:false,status:400,json:async()=>({error:{status:'test-private-key',message:'test-private-key'}})};}});
  await assert.rejects(()=>g.embed(['x'],'RETRIEVAL_QUERY'),error=>!error.message.includes('test-private-key'));
 }
});

test('request cap stops retries before sending beyond the configured maximum',async()=>{
 let calls=0;const g=new GeminiAdapter({apiKey:'fake',maxRequests:2,sleep:async()=>{},fetchImpl:async()=>{calls++;return {ok:false,status:503,json:async()=>({error:{status:'UNAVAILABLE'}})};}});
 await assert.rejects(()=>g.embed(['x'],'RETRIEVAL_QUERY'),/limit reached/);assert.equal(calls,2);
});
test('duplicate aliases are rejected',()=>{
 const data={candidates:[{content:{parts:[{text:JSON.stringify([{id:'1',aliases:['a','a','b','c','d']}])}]}}]};
 assert.throws(()=>parseAliases(data,['1']),/validation/);
});
