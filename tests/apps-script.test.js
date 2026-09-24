import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {cosine} from '../src/vector.js';
function load(overrides={}){const context=vm.createContext({...overrides});for(const file of ['Vector.js','Code.js'])vm.runInContext(fs.readFileSync(`apps-script/${file}`,'utf8'),context);return context;}
test('Apps Script normalization and dot product match cosine rankings',()=>{
 const c=load(),raw=[[1,2,3],[3,2,1],[-1,0,0]],q=[1,2,4];
 const index={dimensions:3,faqs:raw.map((embedding,i)=>({id:String(i),embedding:c.FaqVector.normalize(embedding,3)}))};
 const r=c.FaqVector.search(index,q,3);const expected=raw.map((v,i)=>({id:String(i),score:cosine(v,q)})).sort((a,b)=>b.score-a.score);
 assert.deepEqual(Array.from(r,x=>x.id),expected.map(x=>x.id));for(let i=0;i<3;i++)assert.ok(Math.abs(r[i].score-expected[i].score)<1e-12);
 assert.throws(()=>c.FaqVector.normalize([0,0],2),/Zero/);
 assert.throws(()=>c.FaqVector.normalize([NaN,1],2),/invalid/);
});
test('Apps Script API sets requested dimensions, caps retries and hides API response text',()=>{
 let calls=0,body;
 const props={getProperty:k=>({GEMINI_API_KEY:'mock-private-key',MAX_GEMINI_REQUESTS:'2'}[k]||null)};
 const c=load({UrlFetchApp:{fetch:(url,opt)=>{calls++;body=JSON.parse(opt.payload);assert.equal(opt.headers['x-goog-api-key'],'mock-private-key');assert.ok(!url.includes('mock-private-key'));return {getResponseCode:()=>503,getContentText:()=> 'mock-private-key'};}},Utilities:{sleep:()=>{}}});
 assert.throws(()=>c.embedFaqQuery_('住民票',{properties:props,dimensions:768}),/limit reached/);assert.equal(calls,2);assert.equal(body.outputDimensionality,768);assert.equal(body.content.parts[0].text,'task: search result | query: 住民票');assert.equal('taskType' in body,false);
});
test('Apps Script network exceptions do not expose secret text',()=>{
 const c=load({UrlFetchApp:{fetch:()=>{throw new Error('mock-private-key');}}});
 const properties={getProperty:k=>k==='GEMINI_API_KEY'?'mock-private-key':'1'};
 assert.throws(()=>c.embedFaqQuery_('test',{properties,dimensions:768}),e=>e.message==='Gemini network request failed');
});
