#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
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
    // 目标若已是指向源的符号链接（profile 里的 link: 依赖），cpSync 会因为
    // "src and dest cannot be the same" 直接抛错——这种情况本来就无需复制。
    try {
        if (existsSync(target) && realpathSync(source) === realpathSync(target)) {
            console.log((dryRun ? "[dry-run] " : "") + "skip (already linked): " + source);
            return;
        }
    } catch {
        // realpath 解析失败（路径还没建等）就按普通复制处理
    }
    console.log((dryRun ? "[dry-run] " : "") + source + " -> " + target);
    if (!dryRun) cpSync(source, target, { recursive: true, force: true });
};

// ============================================================
// 自研内核（fork 自 dsh-pet 0.3.8，包名 dsh-xilian-core）
// 整包部署：packages/core -> node_modules/dsh-xilian-core
// 官方 dsh-pet 保持原样不动，仅从 bundles 里禁用，便于回退。
// 从此 packages/core/lib/* 是唯一真源；src/dsh-pet-host 为历史镜像，不再部署。
// ============================================================
const coreDir = join(modulesDir, "dsh-xilian-core");
const qqDir = join(modulesDir, "@tencent-connect", "dsh-qqbot");
copy(join(root, "packages", "core"), coreDir);
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
const forceConfig = args.includes("--force-config");
if (!dryRun) {
    mkdirSync(memoryDir, { recursive: true });
    mkdirSync(diaryDir, { recursive: true });
    mkdirSync(pictureDir, { recursive: true });
    // 绝不覆盖用户已设置的运行时配置：
    // 默认值只用于"补缺"，已有键（日记目录 / owner / 记忆块 / 视频分镜…）一律保留。
    // 需要强行重置时显式传 --force-config。
    let previous = {};
    if (existsSync(runtimeConfigFile) && !forceConfig) {
        try {
            previous = JSON.parse(readFileSync(runtimeConfigFile, "utf8")) || {};
        } catch {
            console.warn("existing config is not valid JSON, will be preserved under .broken");
        }
    }
    const merged = { ...runtimeConfig, ...previous };
    writeFileSync(runtimeConfigFile, JSON.stringify(merged, null, 2) + "\n", "utf8");
    const kept = Object.keys(previous).filter((k) => !(k in runtimeConfig));
    console.log("runtime config: " + (forceConfig ? "reset" : "merged") +
        " (" + Object.keys(merged).length + " keys" +
        (kept.length ? ", kept " + kept.length + " extra: " + kept.join(",") : "") + ")");
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
