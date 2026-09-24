import {GeminiAdapter,embeddingText} from '../src/gemini.js';
import {loadCache,saveCache,hashText,validEmbedding} from '../src/cache.js';
import {readJson} from '../src/io.js';
import {loadData,fingerprints} from '../src/data.js';
const split=process.argv[2]||'development';
const config=readJson('config/experiment.json');
if(split==='holdout'&&(config.status!=='frozen'||JSON.stringify(config.dataHashes)!==JSON.stringify(fingerprints())))throw new Error('Holdout requires frozen settings and unchanged data');
const {faqs,queries}=loadData(split),model=process.env.GEMINI_EMBEDDING_MODEL||config.embeddingModel;
if(model!==config.embeddingModel)throw new Error('Environment embedding model differs from experiment configuration');
const g=new GeminiAdapter({embeddingModel:model});
async function create(kind,list,taskType){
 const file=`data/cache/${kind}-embeddings.json`,cache=loadCache(file);cache.runs??=[];
 const pending=list.filter(x=>!validEmbedding(cache.items[x.id],{model,taskType,text:x.text}));
 for(let i=0;i<pending.length;i+=100){
  const batch=pending.slice(i,i+100),before=g.requests,start=Date.now();
  try{
   const data=await g.embed(batch.map(x=>x.text),taskType);
   if(data.embeddings?.length!==batch.length)throw new Error('Embedding response count mismatch');
   const entries=batch.map((x,j)=>({id:x.id,model,taskType,dimensions:data.embeddings[j].values?.length,inputHash:hashText(x.text),requestTextHash:hashText(embeddingText(x.text,taskType,model)),embedding:data.embeddings[j].values}));
   if(entries.some((x,j)=>!validEmbedding(x,{model,taskType,text:batch[j].text})))throw new Error('Invalid embedding response values or dimensions');
   for(const x of entries)cache.items[x.id]=x;
   cache.runs.push({model,taskType,generatedAt:new Date().toISOString(),inputs:batch.length,ids:batch.map(x=>x.id),apiRequests:g.requests-before,apiTimeMs:Date.now()-start,usageMetadata:g.usage.splice(0)});saveCache(file,cache);
   console.log(`${kind}: ${Math.min(i+100,pending.length)}/${pending.length}; requests=${g.requests}`);
  }catch(e){cache.runs.push({model,taskType,failed:true,generatedAt:new Date().toISOString(),apiRequests:g.requests-before,apiTimeMs:Date.now()-start});saveCache(file,cache);throw e;}
 }
 console.log(`${kind}: ${list.length-pending.length} cache hits`);
}
try{await create('faq',faqs.map(x=>({id:x.id,text:x.question})),'RETRIEVAL_DOCUMENT');await create(split,queries,'RETRIEVAL_QUERY');console.log(`HTTP requests=${g.requests}; model=${model}`);}catch(e){console.error(e.message);process.exitCode=1;}
