import fs from 'node:fs';
import path from 'node:path';

export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
export function requireFile(file) {
  if (!fs.existsSync(file)) throw new Error(`Required input is missing: ${file}`);
  return file;
}
export function rows(value, names = []) {
  if (Array.isArray(value)) return value;
  for (const n of names) if (Array.isArray(value?.[n])) return value[n];
  throw new Error(`Expected an array${names.length ? ` or one of: ${names.join(', ')}` : ''}`);
}
export function faqId(x) { return String(x.id ?? x.faq_id ?? x.faqId); }
export function question(x) { return String(x.question ?? x.title ?? ''); }
export function answer(x) { return String(x.answer ?? x.body ?? ''); }
export function category(x) { return String(x.category ?? [x.category1,x.category2].filter(Boolean).join(' / ')); }
export function queryText(x) { return String(x.query ?? x.text ?? ''); }
export function expectedId(x) { return String(x.faq_id ?? x.faqId ?? x.expected_id ?? x.answer_id); }
