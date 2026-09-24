import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {hashText} from '../src/cache.js';
import {loadExperiment} from './lib.js';
import {metrics} from '../src/metrics.js';
const input=loadExperiment('development');
const scope=vm.createContext({});vm.runInContext(fs.readFileSync('apps-script/Vector.js','utf8'),scope);
const vector=scope.FaqVector;
const resultDir='results/dimensions-development-v1', exportDir='data/apps-script';
if(fs.existsSync(resultDir))throw new Error('Dimension results already exist; refusing overwrite');
fs.mkdirSync(resultDir,{recursive:true});fs.mkdirSync(exportDir,{recursive:true});
const basePredictions={},methods={};
for(const dimensions of [3072,1536,768,384]){
 const index={schemaVersion:1,model:input.config.embeddingModel,dimensions,normalized:true,sourceCorpusHash:input.config.dataHashes.corpus,
  faqs:input.faqs.map(f=>({id:f.id,question:f.question,answer:f.answer||'',embedding:vector.normalize(input.faqEmbeddings[f.id],dimensions)}))};
 const queries={schemaVersion:1,model:input.config.embeddingModel,dimensions,split:'development',sourceSplitHash:input.config.dataHashes.development,
  queries:input.queries.map(q=>({...q,embedding:vector.normalize(input.queryEmbeddings[q.id],dimensions)}))};
 const records=queries.queries.map(q=>{const start=performance.now(),r=vector.search(index,q.embedding,3),rank=r.findIndex(x=>x.id===q.expectedId)+1;return {id:q.id,rank,predictedId:r[0].id,queryType:q.queryType,difficulty:q.difficulty,latencyMs:performance.now()-start};});
 if(dimensions===3072)for(const r of records)basePredictions[r.id]=r;
 const changed=records.filter(r=>r.predictedId!==basePredictions[r.id].predictedId).map(r=>({id:r.id,baseline:basePredictions[r.id],reduced:r}));
 const serialized=JSON.stringify(index);
 methods[dimensions]={...metrics(records),hits:records.filter(r=>r.rank===1).length,top1Changes:changed.length,correctToWrong:records.filter(r=>basePredictions[r.id].rank===1&&r.rank!==1).length,wrongToCorrect:records.filter(r=>basePredictions[r.id].rank!==1&&r.rank===1).length,indexJsonBytes:Buffer.byteLength(serialized),changes:changed,records};
 if(dimensions!==384){fs.writeFileSync(`${exportDir}/faq-index-${dimensions}.json`,serialized);fs.writeFileSync(`${exportDir}/development-${dimensions}.json`,JSON.stringify(queries));}
}
const report={experiment:'Additional dimensionality experiment; Development only',generatedAt:new Date().toISOString(),apiRequests:0,method:'Truncate cached 3072 vectors then L2-normalize; same search core as Apps Script',holdoutReevaluated:false,sourceSettingsHash:hashText(JSON.stringify(input.config)),methods};
fs.writeFileSync(`${resultDir}/report.json`,JSON.stringify(report,null,2));
let md='# 次元数の追加比較（Development 90問）\n\n| 次元 | 正解数 | Hit@1 | 上位3件 | 3072から正解→誤答 | 誤答→正解 | FAQ JSON MB |\n|---|---:|---:|---:|---:|---:|---:|\n';
for(const d of [3072,1536,768,384]){const m=methods[d];md+=`| ${d} | ${m.hits}/90 | ${(m.hitAt1*100).toFixed(1)}% | ${(m.hitAt3*100).toFixed(1)}% | ${m.correctToWrong} | ${m.wrongToCorrect} | ${(m.indexJsonBytes/1e6).toFixed(2)} |\n`;}
md+='\n768次元を第一候補とします。90問のみの結果であり、精度維持の保証ではありません。元のHoldoutは再評価せず、元の設定・結果も変更していません。JSONにはFAQ質問・回答も含みます。実行中のメモリ使用量とは異なります。API呼び出しは0回。Apps Script実機での読み込み・実行時間はログイン後に測定します。\n';
fs.writeFileSync(`${resultDir}/report.md`,md);console.log(md);
