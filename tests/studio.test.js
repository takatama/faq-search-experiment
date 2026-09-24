import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function core() {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync("faq-studio/Core.js", "utf8"), c);
  return c.StudioCore;
}
const index = () => ({
  dimensions: 2,
  faqs: [
    {
      id: "1",
      question: "母子手帳の場所は？",
      answer: "○○市窓口",
      embedding: [1, 0],
    },
    {
      id: "2",
      question: "避難所はどこ？",
      answer: "指定避難所",
      embedding: [0, 1],
    },
  ],
});
const row = (status = "承認", question = "母子手帳はどこでもらえる？") => [
  "1",
  "母子手帳の場所は？",
  question,
  "母子手帳 窓口",
  "",
  "",
  "",
  "承認" === status ? "承認" : status,
  "",
  0,
  "",
];
test("studio never includes unapproved or rejected rows", () => {
  const c = core();
  assert.equal(c.plan(index(), [row("未確認"), row("却下")]).length, 0);
});
test("studio re-embeds only changed search questions and preserves original answers", () => {
  const c = core(),
    base = index(),
    before = JSON.stringify(base);
  const changes = c.plan(base, [row()]);
  assert.equal(changes[0].needsEmbedding, true);
  const next = c.apply(base, changes, { 1: [0.6, 0.8] }, "v2");
  assert.equal(next.faqs[0].answer, base.faqs[0].answer);
  assert.equal(next.faqs[0].question, base.faqs[0].question);
  assert.deepEqual(Array.from(next.faqs[1].embedding), [0, 1]);
  assert.equal(JSON.stringify(base), before);
});
test("alias-only change reuses vector without Gemini", () => {
  const c = core(),
    base = index(),
    changes = c.plan(base, [row("承認", base.faqs[0].question)]);
  assert.equal(changes[0].needsEmbedding, false);
  const next = c.apply(base, changes, {}, "v2");
  assert.deepEqual(Array.from(next.faqs[0].embedding), [1, 0]);
});
test("tampered source, duplicate approved IDs and invalid vectors stop publication", () => {
  const c = core(),
    base = index();
  const bad = row();
  bad[1] = "書き換え";
  assert.throws(() => c.plan(base, [bad]), /原文/);
  assert.throws(() => c.plan(base, [row(), row()]), /重複/);
  assert.throws(
    () => c.apply(base, c.plan(base, [row()]), { 1: [NaN, 0] }, "v2"),
    /Embedding/,
  );
});
test("publish then rollback restores previous snapshot in a simulated cycle", () => {
  const c = core(),
    base = index();
  const snapshots = { v1: base };
  snapshots.v2 = c.apply(base, c.plan(base, [row()]), { 1: [0.6, 0.8] }, "v2");
  let active = "v2";
  assert.equal(
    snapshots[active].faqs[0].searchQuestion,
    "母子手帳はどこでもらえる？",
  );
  active = "v1";
  assert.equal(snapshots[active].faqs[0].searchQuestion, undefined);
  assert.equal(snapshots[active].faqs[0].answer, "○○市窓口");
});
