import fs from 'node:fs';
import crypto from 'node:crypto';
import {readJson,writeJsonAtomic} from './io.js';
import {embeddingText} from './gemini.js';
export const hashText=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
export function loadCache(file){return fs.existsSync(file)?readJson(file):{version:2,items:{},runs:[]};}
export function validEmbedding(item,{model,taskType,text,dimensions=3072}){
 return item?.model===model&&item.taskType===taskType&&item.inputHash===hashText(text)&&item.requestTextHash===hashText(embeddingText(text,taskType,model))&&item.dimensions===dimensions&&Array.isArray(item.embedding)&&item.embedding.length===dimensions&&item.embedding.every(Number.isFinite)&&item.embedding.some(x=>x!==0);
}
export function saveCache(file,cache){writeJsonAtomic(file,cache);}
