#!/usr/bin/env node
// ============================================================================
// upstream-diff.mjs —— 对比「官方 dsh-pet 某个版本」与「我们的 packages/core」
//
// 用法：
//   node scripts/upstream-diff.mjs 0.3.8
//   node scripts/upstream-diff.mjs 0.3.9 --keep     # 保留解包目录便于人工比对
//
// 做的事：
//   1. 从 npm registry 下载 dsh-pet@<version> 的 tarball（缓存到系统临时目录）
//   2. 解包
//   3. 逐文件比对：内容不同 / 我们新增 / 官方新增（我们缺失）
//   4. 文本文件给出 +/- 行数（用 git diff --no-index --numstat）
//
// 只读，不修改仓库。真正合并时按 docs/Upstream-Log.md 的流程走。
// ============================================================================
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ours = join(root, "packages", "core");

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const keep = args.includes("--keep");
if (!version) {
    console.error("usage: node scripts/upstream-diff.mjs <version> [--keep]");
    process.exit(1);
}

const work = join(tmpdir(), "dsh-pet-upstream-" + version);
const tarball = join(tmpdir(), "dsh-pet-" + version + ".tgz");
const srcDir = join(work, "package");

function run(cmd, cmdArgs, opts = {}) {
    const result = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts });
    if (result.error) throw result.error;
    return result;
}

function sha(file) {
    return createHash("sha1").update(readFileSync(file)).digest("hex");
}

function walk(dir, base = dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, base));
        else if (entry.isFile()) out.push(relative(base, full).replace(/\\/g, "/"));
    }
    return out;
}

// ---- 1. 下载 ----------------------------------------------------------------
if (!existsSync(tarball)) {
    const url = "https://registry.npmjs.org/dsh-pet/-/dsh-pet-" + version + ".tgz";
    console.log("[1/4] downloading " + url);
    const res = run("curl.exe", ["-sSL", "--retry", "3", "-o", tarball, url]);
    if (res.status !== 0) {
        console.error("download failed: " + (res.stderr || res.status));
        process.exit(1);
    }
} else {
    console.log("[1/4] tarball cached: " + tarball);
}

// ---- 2. 解包 ----------------------------------------------------------------
if (existsSync(work)) rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
console.log("[2/4] extracting");
const tar = run("tar.exe", ["-xzf", tarball, "-C", work]);
if (tar.status !== 0) {
    console.error("extract failed: " + (tar.stderr || tar.status));
    process.exit(1);
}

// ---- 3. 比对 ----------------------------------------------------------------
const upstreamFiles = walk(srcDir).filter((f) => !/\.bak-/.test(f));
const ourFiles = walk(ours).filter((f) => !f.startsWith("node_modules/") && !/\.bak-/.test(f));
const upstreamSet = new Set(upstreamFiles);
const ourSet = new Set(ourFiles);

const both = upstreamFiles.filter((f) => ourSet.has(f));
const onlyUpstream = upstreamFiles.filter((f) => !ourSet.has(f));
const onlyOurs = ourFiles.filter((f) => !upstreamSet.has(f));

const changed = [];
for (const rel of both) {
    const a = join(srcDir, rel);
    const b = join(ours, rel);
    if (sha(a) === sha(b)) continue;
    let add = "?", del = "?";
    const numstat = spawnSync("git", ["diff", "--no-index", "--numstat", a, b], { encoding: "utf8" });
    const line = String(numstat.stdout || "").trim();
    if (line) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2 && parts[0] !== "-") {
            add = parts[0];
            del = parts[1];
        }
    }
    changed.push({ rel, add, del });
}

// ---- 4. 报告 ----------------------------------------------------------------
// 媒体资产（assets/）不是合并对象，单独计数，避免刷屏
const isMedia = (f) => f.startsWith("assets/");
const ownCode = onlyOurs.filter((f) => !isMedia(f));
const ownMedia = onlyOurs.filter(isMedia);
const missCode = onlyUpstream.filter((f) => !isMedia(f));
const missMedia = onlyUpstream.filter(isMedia);

const bySize = (x, y) => Number(y.add === "?" ? 0 : y.add) - Number(x.add === "?" ? 0 : x.add);
changed.sort(bySize);

console.log("\n[3/4] result for dsh-pet@" + version);
console.log("  modified by us     : " + changed.length + " 个文件");
console.log("  added by us (code) : " + ownCode.length + "   (media " + ownMedia.length + " 个，忽略)");
console.log("  missing (code)     : " + missCode.length + "   (media " + missMedia.length + " 个，忽略)");

if (changed.length) {
    console.log("\n  --- 我们改过的文件（+ / -）---");
    for (const c of changed) {
        console.log("    " + String(c.add).padStart(6) + " +  " + String(c.del).padStart(5) + " -  " + c.rel);
    }
}
if (ownCode.length) {
    console.log("\n  --- 我们新增的代码文件 ---");
    for (const f of ownCode) console.log("    " + f);
}
if (missCode.length) {
    console.log("\n  --- 官方有、我们没有的代码文件（删了/改名了？）---");
    for (const f of missCode) console.log("    " + f);
}

console.log("\n[4/4] extracted tree: " + (keep ? srcDir : "(removed)"));
if (!keep) rmSync(work, { recursive: true, force: true });
console.log("next: follow docs/Upstream-Log.md to merge a new version");
void statSync;
