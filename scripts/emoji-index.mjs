#!/usr/bin/env node
/**
 * 表情包增量标注器。
 * - 已经存在于 emojis_meta.json 且 SHA-256 未变的文件：绝不重复调用。
 * - 新文件/内容变化：POST 到 DSH 宿主视觉桥，写回 description/tags。
 * - 默认最多 10 张；--limit N / --only file / --dry-run。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const sourceDir = join(root, "assets", "emojis");
const compressedDir = join(root, "assets", "emojis_compressed");
const metaPath = join(root, "assets", "emojis_meta.json");
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const argValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const dryRun = hasFlag("--dry-run");
const only = argValue("--only");
const limit = Math.max(1, Number(argValue("--limit", "10")) || 10);
const backend = argValue("--url", process.env.DSH_PET_BACKEND || "http://127.0.0.1:61972").replace(/\/$/, "");
const exts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function loadMeta() {
  try {
    const parsed = JSON.parse(readFileSync(metaPath, "utf8"));
    return parsed && typeof parsed === "object" && parsed.items ? parsed : { version: 1, items: {} };
  } catch {
    return { version: 1, generatedAt: null, model: null, items: {} };
  }
}

function saveMeta(meta) {
  meta.version = 1;
  meta.generatedAt = new Date().toISOString();
  const temp = metaPath + ".tmp";
  writeFileSync(temp, JSON.stringify(meta, null, 2) + "\n", "utf8");
  renameSync(temp, metaPath);
}

function findCompressed(name) {
  const base = basename(name, extname(name));
  for (const ext of [".webp", ".gif", ".jpg", ".jpeg", ".png"]) {
    const file = join(compressedDir, base + ext);
    if (existsSync(file)) return file;
  }
  return null;
}

async function callAnalyze(file, compressed) {
  const data = readFileSync(compressed).toString("base64");
  const body = JSON.stringify({ file, data: "data:image/webp;base64," + data });
  let last = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(backend + "/dsh-pet-7340/emoji/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      });
      const result = await response.json();
      if (result?.ok && result.description) return result;
      last = result?.error || ("http " + response.status);
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      last = String(error?.message ?? error);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(last || "analyze failed");
}

async function main() {
  const meta = loadMeta();
  meta.items ??= {};
  const files = readdirSync(sourceDir)
    .filter((name) => exts.has(extname(name).toLowerCase()))
    .filter((name) => !only || name === only)
    .sort();
  const pending = [];
  for (const name of files) {
    const file = join(sourceDir, name);
    const hash = hashFile(file);
    const old = meta.items[name];
    if (old?.hash === hash && old?.description) continue;
    const compressed = findCompressed(name);
    if (!compressed) {
      console.warn("[skip-no-compressed] " + name);
      continue;
    }
    pending.push({ name, file, compressed, hash });
  }
  const selected = pending.slice(0, limit);
  console.log(JSON.stringify({ backend, total: files.length, pending: pending.length, selected: selected.length, dryRun }, null, 2));
  if (dryRun) {
    for (const item of selected) console.log("would-analyze: " + item.name);
    return;
  }
  let ok = 0;
  let failed = 0;
  for (const item of selected) {
    try {
      const result = await callAnalyze(item.name, item.compressed);
      const tags = Array.isArray(result.tags) ? result.tags : [];
      const categoryTag = tags.find((tag) => /^(情绪|动作|状态|其他)/.test(String(tag))) || "其他";
      const category = "[" + categoryTag + "]";
      const rawDescription = String(result.description).replace(/\s+/g, " ").trim();
      const description = /^\[[^\]]+\]/.test(rawDescription) ? rawDescription.replace(/^\[[^\]]+\]\s*/, category + " ") : category + " " + rawDescription;
      meta.items[item.name] = {
        hash: item.hash,
        description,
        tags,
        sourceBytes: statSync(item.file).size,
        compressed: basename(item.compressed),
        model: result.model ?? null,
        analyzedAt: new Date().toISOString()
      };
      saveMeta(meta);
      ok += 1;
      console.log("[analyzed] " + item.name + " :: " + description);
    } catch (error) {
      failed += 1;
      console.warn("[failed] " + item.name + " :: " + (error?.message ?? error));
    }
  }
  console.log(JSON.stringify({ ok, failed, metaPath, remaining: Math.max(0, pending.length - selected.length) }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
