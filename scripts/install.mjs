#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const dryRun = args.includes("--dry-run");
const profile = getArg("--profile", process.env.DSH_PROFILE || "desktop");
const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh");
const profileDir = join(dshHome, "profiles", profile);
const modulesDir = join(profileDir, "node_modules");

const readEnv = () => {
    const file = join(root, ".env");
    const env = {};
    if (!existsSync(file)) return env;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!match || match[1].startsWith("#")) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
};

const expandHome = (value) => {
    const text = String(value || "");
    return text.startsWith("~") ? join(homedir(), text.slice(1).replace(/^[\\/]+/, "")) : text;
};
const env = readEnv();
const configFile = existsSync(join(root, "config", "config.yml")) ? join(root, "config", "config.yml") : join(root, "config", "config.example.yml");
const config = yaml.load(readFileSync(configFile, "utf8")) || {};
const qq = config.qq || {};
const paths = config.paths || {};
const ownerOpenIds = (process.env.OWNER_OPENIDS || env.OWNER_OPENIDS ? String(process.env.OWNER_OPENIDS || env.OWNER_OPENIDS).split(",") : qq.ownerOpenIds || [])
    .map((value) => String(value).trim())
    .filter(Boolean);
const diaryDir = expandHome(process.env.PINK_DIARY_DIR || env.PINK_DIARY_DIR || paths.diaryDir || join(dshHome, "pink-diary"));
const pictureDir = expandHome(process.env.PINK_PICTURE_DIR || env.PINK_PICTURE_DIR || paths.pictureDir || join(dshHome, "dsh-pet", "pictures"));
const memoryDir = expandHome(paths.memoryDir || join(dshHome, "dsh-pet"));

if (!existsSync(join(profileDir, "package.json"))) {
    console.error("DSH profile not found: " + profileDir);
    console.error("Start DSH Desktop once, or pass --profile <name>.");
    process.exit(1);
}

const copy = (source, target) => {
    if (!existsSync(source)) {
        console.warn("skip missing: " + source);
        return;
    }
    console.log((dryRun ? "[dry-run] " : "") + source + " -> " + target);
    if (!dryRun) cpSync(source, target, { recursive: true, force: true });
};

const hostDir = join(modulesDir, "dsh-pet");
const qqDir = join(modulesDir, "@tencent-connect", "dsh-qqbot");
copy(join(root, "src", "dsh-pet-host", "index.js"), join(hostDir, "lib", "index.js"));
copy(join(root, "src", "dsh-pet-host", "client.js"), join(hostDir, "lib", "client.js"));
copy(join(root, "src", "dsh-pet-host", "config.js"), join(hostDir, "lib", "config.js"));
for (const moduleName of ["memory-blocks.js", "memory-search.js", "memory-summary.js", "memory-context.js", "memory-tools.js"]) {
    copy(join(root, "src", "dsh-pet-host", moduleName), join(hostDir, "lib", moduleName));
}
copy(join(root, "src", "dsh-pet-host", "runtime", "electron-helper"), join(hostDir, "runtime", "electron-helper"));
copy(join(root, "src", "qqbot", "gateway"), join(qqDir, "dist", "gateway"));
copy(join(root, "src", "qqbot", "pet-bridge"), join(qqDir, "dist", "pet-bridge"));
copy(join(root, "src", "qqbot", "config.js"), join(qqDir, "dist", "config.js"));
copy(join(root, "src", "plugins", "pink-diary"), join(modulesDir, "xu-pink-diary"));
copy(join(root, "src", "plugins", "memory-viewer"), join(modulesDir, "dsh-pet-memory-viewer"));

const runtimeConfig = {
    diaryDir,
    pictureDir,
    ownerOpenIds,
    contextWindow: Number(process.env.PINK_CONTEXT_WINDOW || config.context?.window) || 1_000_000,
    compressionRatio: Number(process.env.PINK_CONTEXT_RATIO || config.context?.compressionRatio) || 0.8,
    summaryRatio: Number(config.context?.summaryRatio) || 0.2,
    summaryMaxChars: Number(config.context?.summaryMaxChars) || 50,
    summaryTimeoutMs: Number(config.context?.summaryTimeoutMs) || 5000,
    memoryBlocksEnabled: config.memoryBlocks?.enabled === true,
    memoryBlocksFile: join(memoryDir, "context-blocks.json")
};
const runtimeConfigFile = join(memoryDir, "pink-diary-pet.json");
if (!dryRun) {
    mkdirSync(memoryDir, { recursive: true });
    mkdirSync(diaryDir, { recursive: true });
    mkdirSync(pictureDir, { recursive: true });
    writeFileSync(runtimeConfigFile, JSON.stringify(runtimeConfig, null, 2) + "\n", "utf8");
    const identityFile = join(memoryDir, "identity.json");
    if (!existsSync(identityFile)) {
        const example = JSON.parse(readFileSync(join(root, "config", "identity.example.json"), "utf8"));
        example.owner.openIds = ownerOpenIds;
        writeFileSync(identityFile, JSON.stringify(example, null, 2) + "\n", "utf8");
    }
}

console.log("\nInstalled for profile: " + profile);
console.log("Diary dir: " + diaryDir);
console.log("Picture dir: " + pictureDir);
console.log("Owner openids: " + (ownerOpenIds.length ? ownerOpenIds.length + " configured" : "none (owner mode disabled)"));
if ((qq.appId && qq.appId !== "YOUR_QQ_BOT_APP_ID") || (qq.appSecret && qq.appSecret !== "YOUR_QQ_BOT_APP_SECRET")) {
    console.log("\nQQ credentials were found in config. Put them into the DSH QQ plugin config");
    console.log("(profile cordis.patch.yml) as well; the installer does not write secrets into DSH config.");
}
console.log("\nNext: restart DSH Desktop or reload dsh-pet/qqbot.");
