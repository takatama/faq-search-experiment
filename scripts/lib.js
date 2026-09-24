import {readJson,category,answer} from '../src/io.js';
import {validEmbedding,hashText} from '../src/cache.js';
import {loadData,fingerprints} from '../src/data.js';
export function loadExperiment(split,{requireGate=true}={}){
 const config=readJson('config/experiment.json');
 if(requireGate&&(!config.gate||config.status!=='frozen'))throw new Error('Experiment settings are not frozen');
 if(requireGate&&JSON.stringify(config.dataHashes)!==JSON.stringify(fingerprints()))throw new Error('Frozen data hashes differ');
 const {faqs,queries}=loadData(split);
 const aliasCache=readJson('data/cache/aliases.json'),fCache=readJson('data/cache/faq-embeddings.json'),qCache=readJson(`data/cache/${split}-embeddings.json`);
 const aliases={},faqEmbeddings={},queryEmbeddings={};
 for(const f of faqs){
  const a=aliasCache.items[f.id],source={id:f.id,question:f.question,answer:answer(f),category:category(f)};
  if(a?.model!==config.aliasModel||a.inputHash!==hashText(JSON.stringify(source))||a.aliases?.length!==5)throw new Error(`Invalid alias cache: ${f.id}`);
  aliases[f.id]=a.aliases;
  const x=fCache.items[f.id];if(!validEmbedding(x,{model:config.embeddingModel,taskType:'RETRIEVAL_DOCUMENT',text:f.question}))throw new Error(`Invalid FAQ embedding cache: ${f.id}`);faqEmbeddings[f.id]=x.embedding;
 }
 for(const q of queries){const x=qCache.items[q.id];if(!validEmbedding(x,{model:config.embeddingModel,taskType:'RETRIEVAL_QUERY',text:q.text}))throw new Error(`Invalid query embedding cache: ${q.id}`);queryEmbeddings[q.id]=x.embedding;}
 const cacheHashes={aliases:hashText(JSON.stringify(aliasCache.items)),faqEmbeddings:hashText(JSON.stringify(fCache.items))};
 if(requireGate&&JSON.stringify(config.cacheHashes)!==JSON.stringify(cacheHashes))throw new Error('Frozen index cache hashes differ');
 return {config,faqs,queries,aliases,faqEmbeddings,queryEmbeddings,cacheHashes,costs:{aliases:aliasCache.runs,faq:fCache.runs,queries:qCache.runs}};
}
