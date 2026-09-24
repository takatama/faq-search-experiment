export function normalize(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "")
    .replace(/[、。,.，．!！?？「」『』（）()【】\[\]・:：;；\-ー_]/gu, "");
}
export function ngrams(text, min = 2, max = 4) {
  const s = normalize(text);
  const out = [];
  for (let n = min; n <= max; n++)
    for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n));
  return out;
}
