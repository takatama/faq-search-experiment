import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const root = process.argv[2] ?? process.cwd();
const read = p => fs.readFileSync(path.join(root, p));
const parse = p => JSON.parse(read(p));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[\s。、？！?!.・]/gu, '');
const corpus = parse('data/corpus.json');
const result = JSON.parse(zlib.gunzipSync(read('results/dimensions-additional.json.gz')));
for (const [name, expected] of Object.entries(result.dataHashes)) {
  const actual = hash(read(`data/${name}.json`));
  if (actual !== expected) throw Error(`${name} hash mismatch: ${actual}`);
}
const titles = new Map(corpus.map(f => [String(f.faq_id), f.question]));
if (titles.size !== 661) throw Error('Unexpected corpus size or duplicate FAQ ID');

const output = { source: 'published dimension rankings; embeddings not recalculated', splits: {} };
for (const split of ['development', 'holdout']) {
  const questions = parse(`data/${split}.json`);
  const byId = new Map(questions.map(q => [q.query_id, q]));
  if (byId.size !== questions.length) throw Error(`Duplicate query ID in ${split}`);
  const overlap = { exact: [], normalized: [] };
  for (const q of questions) {
    const title = titles.get(String(q.faq_id));
    if (!title) throw Error(`Missing FAQ for ${q.query_id}`);
    if (q.query === title) overlap.exact.push(q.query_id);
    if (normalize(q.query) === normalize(title)) overlap.normalized.push(q.query_id);
  }
  const metrics = {};
  for (const dims of ['3072', '1536', '768', '384']) {
    const rows = result.rankings[split][dims];
    if (rows.length !== questions.length) throw Error(`${split}/${dims} row count mismatch`);
    if (new Set(rows.map(r => r.queryId)).size !== questions.length) throw Error('Duplicate ranking query ID');
    for (const row of rows) {
      const question = byId.get(row.queryId);
      if (!question || row.expectedId !== String(question.faq_id) || row.top3.length !== 3)
        throw Error(`Invalid ranking for ${row.queryId}`);
    }
    const score = subset => ({
      n: subset.length,
      hitAt1: subset.filter(r => r.top3[0] === r.expectedId).length,
      hitAt3: subset.filter(r => r.top3.includes(r.expectedId)).length,
    });
    const complete = score(rows);
    const published = result.methods[split][dims];
    if (complete.hitAt1 !== published.hitAt1 || complete.hitAt3 !== published.hitAt3)
      throw Error(`Published summary mismatch in ${split}/${dims}`);
    metrics[dims] = {
      all: complete,
      withoutExact: score(rows.filter(r => !overlap.exact.includes(r.queryId))),
      withoutNormalized: score(rows.filter(r => !overlap.normalized.includes(r.queryId))),
      byType: Object.fromEntries([...new Set(questions.map(q => q.query_type))].sort().map(type =>
        [type, score(rows.filter(r => byId.get(r.queryId).query_type === type))])),
      missedTop3: rows.filter(r => !r.top3.includes(r.expectedId)).map(r => ({
        queryId: r.queryId, query: byId.get(r.queryId).query,
        expectedId: r.expectedId, top3: r.top3,
      })),
    };
  }
  output.splits[split] = { n: questions.length, overlap, metrics };
}
console.log(JSON.stringify(output, null, 2));
