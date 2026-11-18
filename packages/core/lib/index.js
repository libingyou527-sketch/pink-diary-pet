// ============================================================================
// dsh-xilian-core 自诊断入口
//
// 背景：fork 后插件在 DSH 里静默不激活（无崩溃弹窗、无日志），无法定位。
// 本入口只做三件事：登记「加载 → import → apply」的每一步，把异常原样写进
//   ~/.dsh/xilian-boot.log
// 真实实现仍在 ./index.impl.js，行为与之前完全一致。
// 定位完成后可把本文件替换回 index.impl.js（保持 exports 的 name/inject/apply）。
// ============================================================================
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const LOG_DIR = join(HOME, ".dsh");
const LOG = join(LOG_DIR, "xilian-boot.log");

function log(msg) {
    try {
        mkdirSync(LOG_DIR, { recursive: true });
        appendFileSync(LOG, new Date().toISOString() + " [pid " + process.pid + "] " + msg + "\n");
    } catch {
        // 日志失败不能影响插件本身
    }
}

function fmt(error) {
    if (!error) return String(error);
    const code = error.code ? " (" + error.code + ")" : "";
    return code + " " + (error.stack || error.message || String(error));
}

log("=== entry loaded: " + import.meta.url);
log("cwd=" + process.cwd());
log("versions: node=" + process.versions.node + " electron=" + (process.versions.electron || "-"));

let impl = null;
try {
    impl = await import("./index.impl.js");
    log("impl imported ok; exports=" + Object.keys(impl).join(",") +
        "; name=" + String(impl.name) + "; inject=" + JSON.stringify(impl.inject || null));
} catch (error) {
    log("IMPORT FAIL:" + fmt(error));
    throw error;
}

export const name = impl.name;
export const inject = impl.inject;

export function apply(ctx) {
    log("apply begin");
    // 顺带记录关键服务是否到位，便于判断是否为 inject 等待问题
    try {
        const probe = {};
        for (const key of ["webServer", "agentDefaultModel", "credentials", "llm", "attachments", "commands", "connection"]) {
            try {
                probe[key] = ctx && typeof ctx.get === "function" && ctx.get(key) ? "ok" : "missing";
            } catch {
                probe[key] = "get-failed";
            }
        }
        log("services probe: " + JSON.stringify(probe));
    } catch (error) {
        log("services probe failed:" + fmt(error));
    }

    let result;
    try {
        result = impl.apply(ctx);
    } catch (error) {
        log("APPLY THREW:" + fmt(error));
        throw error;
    }
    if (result && typeof result.then === "function") {
        return result.then(
            (value) => {
                log("apply ok (async)");
                return value;
            },
            (error) => {
                log("APPLY REJECTED:" + fmt(error));
                throw error;
            }
        );
    }
    log("apply ok (sync)");
    return result;
}
