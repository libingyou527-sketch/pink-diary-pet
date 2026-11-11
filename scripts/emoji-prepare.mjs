#!/usr/bin/env node
/**
 * 表情包预处理：原图 -> assets/emojis_compressed
 * - png/jpg/webp: 全部转 WebP；大图等比缩到最大边 512；保留 alpha。
 * - gif: ffmpeg -> animated WebP；失败记录为 skipped，不阻塞其它图。
 * - manifest.json 记录原名、hash、大小、尺寸、状态。
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync
} from "node:fs";
import { join, extname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "..");
const sourceDir = join(root, "assets", "emojis");
const outDir = join(root, "assets", "emojis_compressed");
const ffmpeg = join(root, "tools", "ffmpeg", "ffmpeg.exe");
const force = process.argv.includes("--force");
const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const gifExts = new Set([".gif"]);
const maxBytes = 200 * 1024;
const maxSide = 512;

function loadSharp() {
  const candidates = [
    process.env.SHARP_PATH,
    join(root, "node_modules", "sharp", "dist", "index.cjs"),
    join(homedir(), ".dsh", "profiles", "desktop", "node_modules", "sharp", "dist", "index.cjs")
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try { return require(candidate); } catch {}
  }
  throw new Error("sharp 不可用；请安装 sharp 或用 SHARP_PATH 指向 dist/index.cjs");
}

const sharp = loadSharp();

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function atomicWrite(target, data) {
  const temp = target + ".tmp";
  writeFileSync(temp, data);
  renameSync(temp, target);
}

async function compressImage(file, name) {
  const out = join(outDir, basename(name, extname(name)) + ".webp");
  const before = statSync(file).size;
  const image = sharp(file, { failOn: "none", animated: false }).rotate();
  const meta = await image.metadata();
  const shouldResize = before > maxBytes || Math.max(meta.width || 0, meta.height || 0) > maxSide;
  let pipeline = shouldResize
    ? image.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    : image;
  const buffer = await pipeline.webp({ quality: 82, alphaQuality: 100, effort: 4 }).toBuffer();
  atomicWrite(out, buffer);
  return {
    source: name,
    output: basename(out),
    hash: hashFile(file),
    originalBytes: before,
    compressedBytes: buffer.length,
    width: meta.width,
    height: meta.height,
    format: "webp",
    resized: shouldResize,
    status: "compressed"
  };
}

function compressGif(file, name) {
  const out = join(outDir, basename(name, extname(name)) + ".webp");
  const before = statSync(file).size;
  if (!existsSync(ffmpeg)) {
    return { source: name, output: basename(out), hash: hashFile(file), originalBytes: before, compressedBytes: 0, format: "gif", status: "gif-skipped", error: "ffmpeg missing" };
  }
  const temp = out + ".tmp.webp";
  const args = [
    "-y", "-i", file,
    "-vf", `scale='min(${maxSide},iw)':-2:flags=lanczos,fps=12`,
    "-c:v", "libwebp_anim", "-lossless", "0", "-q:v", "70", "-loop", "0",
    temp
  ];
  const result = spawnSync(ffmpeg, args, { windowsHide: true, encoding: "utf8" });
  if (result.status !== 0 || !existsSync(temp)) {
    return { source: name, output: basename(out), hash: hashFile(file), originalBytes: before, compressedBytes: 0, format: "gif", status: "gif-skipped", error: (result.stderr || "").slice(-300) };
  }
  renameSync(temp, out);
  return { source: name, output: basename(out), hash: hashFile(file), originalBytes: before, compressedBytes: statSync(out).size, format: "webp-animated", status: "compressed" };
}

async function main() {
  if (!existsSync(sourceDir)) throw new Error("缺目录: " + sourceDir);
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, "manifest.json");
  let previous = {};
  try { previous = JSON.parse(readFileSync(manifestPath, "utf8")).items ?? {}; } catch {}
  const files = readdirSync(sourceDir).filter((name) => {
    const ext = extname(name).toLowerCase();
    return imageExts.has(ext) || gifExts.has(ext);
  }).sort();
  const items = { ...previous };
  let compressed = 0, skipped = 0, unchanged = 0, saved = 0;
  for (const name of files) {
    const file = join(sourceDir, name);
    const hash = hashFile(file);
    const old = items[name];
    if (!force && old?.hash === hash && old?.output && existsSync(join(outDir, old.output))) {
      unchanged++;
      continue;
    }
    try {
      const item = gifExts.has(extname(name).toLowerCase())
        ? compressGif(file, name)
        : await compressImage(file, name);
      items[name] = item;
      if (item.status === "compressed") {
        compressed++;
        saved += Math.max(0, item.originalBytes - item.compressedBytes);
      } else skipped++;
      console.log(`[${item.status}] ${name} ${item.originalBytes} -> ${item.compressedBytes} ${item.resized ? "resized" : ""}`);
    } catch (error) {
      items[name] = {
        source: name, output: "", hash, originalBytes: statSync(file).size,
        compressedBytes: 0, format: extname(name).slice(1), status: "failed",
        error: String(error?.message ?? error)
      };
      skipped++;
      console.warn("[failed] " + name + ": " + (error?.message ?? error));
    }
  }
  writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    maxBytes,
    maxSide,
    items
  }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ total: files.length, compressed, skipped, unchanged, savedBytes: saved, outDir }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
