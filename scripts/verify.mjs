#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const skip = new Set([".git", "node_modules", ".tmp", "backup"]);
const forbidden = [
    { name: "32-char openid-like token", pattern: /\b(?!0{32})[0-9A-F]{32}\b/i },
    { name: "local E: drive path", pattern: /E:\\/ },
    { name: "local Windows user path", pattern: /C:\\Users\\[^\\]+/i }
];
const files = [];
const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile()) files.push(path);
    }
};
walk(root);

let errors = 0;
const relative = (path) => path.slice(root.length + 1);
for (const file of files) {
    const name = relative(file);
    if (/^scripts[\\/]/.test(name)) continue;
    const textExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".jsonc", ".yml", ".yaml", ".md", ".txt", ".env", ".example"]);
    if (!textExtensions.has(extname(file)) && !file.endsWith(".env.example")) continue;
    const text = readFileSync(file, "utf8");
    for (const rule of forbidden) {
        if (rule.pattern.test(text)) {
            console.error("PRIVACY: " + rule.name + " in " + name);
            errors += 1;
        }
    }
    if (extname(file) === ".json") {
        try { JSON.parse(text); } catch (error) {
            console.error("JSON: " + name + ": " + error.message);
            errors += 1;
        }
    }
    if (extname(file) === ".yml" || extname(file) === ".yaml") {
        try { yaml.load(text); } catch (error) {
            console.error("YAML: " + name + ": " + error.message);
            errors += 1;
        }
    }
    if ([".js", ".mjs", ".cjs"].includes(extname(file))) {
        try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); } catch (error) {
            console.error("SYNTAX: " + name);
            errors += 1;
        }
    }
}
const tracked = files.filter((file) => !relative(file).startsWith("scripts/"));
console.log("Checked " + tracked.length + " source files; errors=" + errors);
process.exit(errors ? 1 : 0);
