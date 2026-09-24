import fs from "node:fs";
import crypto from "node:crypto";
import { readJson, writeJsonAtomic } from "./io.js";
export const hashText = (t) =>
  crypto.createHash("sha256").update(String(t)).digest("hex");
export function loadCache(file) {
  return fs.existsSync(file) ? readJson(file) : { version: 1, items: {} };
}
export function validEmbedding(item, { model, taskType, text }) {
  return (
    item?.model === model &&
    item.taskType === taskType &&
    item.inputHash === hashText(text) &&
    item.dimensions === item.embedding?.length
  );
}
export function saveCache(file, cache) {
  writeJsonAtomic(file, cache);
}
