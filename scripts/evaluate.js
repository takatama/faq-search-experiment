import fs from 'node:fs';
import {evaluate} from '../src/evaluate.js';
import {loadExperiment} from './lib.js';
import {writeJsonAtomic} from '../src/io.js';
import {hashText} from '../src/cache.js';
const split=process.argv[2];if(!['development','holdout'].includes(split))throw new Error('Specify development or holdout');
const target=`results/${split}_report.json`;
if(fs.existsSync(target)){
 const old=JSON.parse(fs.readFileSync(target,'utf8'));
 if(old.methods)throw new Error('Evaluation already exists; refusing re-evaluation');
}
const input=loadExperiment(split);
if(split==='holdout')fs.writeFileSync('results/holdout.started.json',JSON.stringify({startedAt:new Date().toISOString(),configHash:hashText(JSON.stringify(input.config))}),{flag:'wx'});
const methods=evaluate(input),sum=r=>(r||[]).reduce((n,x)=>n+(x.apiRequests||0),0);
const aliasRequests=sum(input.costs.aliases),faqRequests=sum(input.costs.faq),queryRequests=sum(input.costs.queries);
for(const [name,m]of Object.entries(methods))m.indexTimeApiRequests=(['lexicalAliases','hybrid','fallback'].includes(name)?aliasRequests:0)+(['vector','hybrid','fallback'].includes(name)?faqRequests:0);
const report={generatedAt:new Date().toISOString(),split,models:{alias:input.config.aliasModel,embedding:input.config.embeddingModel},settings:input.config,methods,indexTimeApiRequests:aliasRequests+faqRequests,queryTimeApiRequests:queryRequests,evaluationApiRequests:0,cachePopulation:{aliasRequests,faqRequests,queryRequests,runs:input.costs},note:'HTTP costs are shared cache population costs, not duplicated per method. Method queryTimeApiRequests=0 during cached evaluation. MRR is truncated at 3. Latencies exclude cache generation, index construction and disk loading.'};
if(fs.existsSync(target)){const archived=`results/archive/${split}_report.pre-evaluation.json`;fs.mkdirSync('results/archive',{recursive:true});fs.copyFileSync(target,archived,fs.constants.COPYFILE_EXCL);}
writeJsonAtomic(target,report);
console.log(JSON.stringify(Object.fromEntries(Object.entries(methods).map(([k,v])=>[k,{hitAt1:v.hitAt1,hitAt3:v.hitAt3,mrr:v.mrr,queryEmbeddingRate:v.queryEmbeddingRate}]))));
