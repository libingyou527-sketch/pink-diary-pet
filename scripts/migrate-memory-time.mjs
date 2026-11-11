#!/usr/bin/env node
/**
 * 一次性清洗 dsh-pet 历史消息，给缺少时间前缀的 content 补上：
 *   [MM-DD HH:MM:SS] 原文
 *
 * 用法：
 *   node scripts/migrate-memory-time.mjs --dry-run
 *   node scripts/migrate-memory-time.mjs
 *   node scripts/migrate-memory-time.mjs --dir C:\Users\...\.dsh\dsh-pet
 */
import { existsSync, readFileSync, renameSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dirIndex = args.indexOf("--dir");
const dir = dirIndex >= 0 && args[dirIndex + 1] ? args[dirIndex + 1] : join(homedir(), ".dsh", "dsh-pet");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const files = ["memory.json", "user-memory.json", "user-group-memory.json"].filter((name) => existsSync(join(dir, name)));
const prefixRe = /^\[\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s*/;

const pad = (n) => String(n).padStart(2, "0");
const timePrefix = (ts) => {
    const d = new Date(Number(ts));
    if (Number.isNaN(d.getTime())) return "";
    return "[" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
        pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "] ";
};

const walk = (node, stat) => {
    if (Array.isArray(node)) {
        for (const item of node) walk(item, stat);
        return;
    }
    if (!node || typeof node !== "object") return;
    if ((node.role === "user" || node.role === "assistant") && typeof node.content === "string" && node.content.trim()) {
        if (prefixRe.test(node.content)) {
            stat.already++;
        } else {
            const prefix = timePrefix(node.ts);
            if (prefix) {
                node.content = prefix + node.content;
                stat.added++;
            } else {
                stat.noTs++;
            }
        }
    }
    for (const [key, value] of Object.entries(node)) {
        if (key === "content") continue;
        walk(value, stat);
    }
};

let totalAdded = 0;
let totalAlready = 0;
let totalNoTs = 0;
for (const name of files) {
    const file = join(dir, name);
    const raw = readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    const stat = { added: 0, already: 0, noTs: 0 };
    walk(data, stat);
    totalAdded += stat.added;
    totalAlready += stat.already;
    totalNoTs += stat.noTs;
    console.log(name + ": added=" + stat.added + " already=" + stat.already + " noTs=" + stat.noTs);
    if (dryRun || stat.added === 0) continue;
    const backup = file + ".bak-before-time-" + stamp;
    copyFileSync(file, backup);
    const temp = file + ".tmp";
    writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", "utf8");
    renameSync(temp, file);
    console.log("  backup: " + backup);
}
console.log(JSON.stringify({ dir, files, dryRun, totalAdded, totalAlready, totalNoTs }, null, 2));
