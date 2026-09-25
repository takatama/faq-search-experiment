import fs from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";

// Public, generated caches from the original run. Never overwrite local caches.
const files = {
  "aliases.json": "e9aba8d3b0fb6fa05b5e97dba429500c9265c381f318250dae0fced9c37a34e4",
  "development-embeddings.json": "78373c21cbe485413c83f0a981e163a2d774db6d9f53bc42cbb65c8a175c79c5",
  "faq-embeddings.json": "7988ddf77d9395efc4163530e927cd2aa2b86a9bb07fcb49ff3ef184e55376d8",
  "holdout-embeddings.json": "ce6ea0be7fd6a4798c11c74d978a1be0a0bb6790a23741d98ab05c5046ce8467",
};
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

// Verify every archive before creating files, so a missing/corrupt archive cannot
// leave a half-restored directory. Cache files remain outside version control.
const verified = Object.entries(files).map(([name, expected]) => {
  const archive = fs.readFileSync(`data/cache-archive/${name}.gz`);
  const contents = zlib.gunzipSync(archive);
  if (hash(contents) !== expected) throw new Error(`Cache hash mismatch: ${name}`);
  const target = `data/cache/${name}`;
  if (fs.existsSync(target) && hash(fs.readFileSync(target)) !== expected)
    throw new Error(`Existing cache differs, refusing overwrite: ${name}`);
  return { name, target, contents };
});
fs.mkdirSync("data/cache", { recursive: true });
for (const { name, target, contents } of verified) {
  if (!fs.existsSync(target)) fs.writeFileSync(target, contents, { flag: "wx" });
  console.log(`Verified ${name}`);
}
