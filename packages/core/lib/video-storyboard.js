/**
 * Small adapter for dsh-video-storyboard's CLI.
 *
 * dsh-pet is not a DSH agent and cannot call the plugin's ctx.tools directly.
 * This module runs the plugin's own storyboard CLI with a hard 20s timeout and
 * returns a PNG path. It never lets a video failure block the main chat.
 */
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const VIDEO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

async function downloadVideo(url, dir, timeoutMs, logger) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    try {
        logger?.log?.("[video-download] GET " + url.slice(0, 120));
        const response = await fetch(url, {
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "user-agent": VIDEO_UA,
                "referer": "https://q.qq.com/",
                "accept": "video/*,*/*;q=0.8"
            }
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const total = Number(response.headers.get("content-length")) || 0;
        const chunks = [];
        let received = 0;
        let lastLog = 0;
        const reader = response.body?.getReader();
        if (!reader) throw new Error("response body unavailable");
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > MAX_VIDEO_BYTES) throw new Error("video exceeds 200MB");
            chunks.push(value);
            if (received - lastLog >= 1024 * 1024) {
                lastLog = received;
                logger?.log?.("[video-download] " + (received / 1024 / 1024).toFixed(1) + "MB" + (total ? "/" + (total / 1024 / 1024).toFixed(1) + "MB" : ""));
            }
        }
        const output = join(dir, "inbound-video.mp4");
        await writeFile(output, Buffer.concat(chunks));
        logger?.log?.("[video-download] done " + (received / 1024 / 1024).toFixed(1) + "MB");
        return output;
    } finally {
        clearTimeout(timer);
    }
}

function run(command, args, options, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        let child;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        try {
            child = spawn(command, args, { ...options, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        } catch (error) {
            finish({ ok: false, error: String(error?.message ?? error), stdout: "", stderr: "" });
            return;
        }
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
        child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
        child.on("error", (error) => finish({ ok: false, error: String(error?.message ?? error), stdout, stderr }));
        child.on("close", (code) => finish({ ok: code === 0, code, stdout, stderr }));
        const timer = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch {}
            finish({ ok: false, error: "video storyboard timeout", stdout, stderr });
        }, timeoutMs);
        timer.unref?.();
    });
}

export async function createVideoStoryboard({
    input,
    binPath,
    ffmpegPath,
    ffprobePath,
    timeoutMs = 30000,
    cells = 9,
    outDir,
    logger = console
}) {
    if (!input) return { ok: false, error: "video input is empty" };
    if (!binPath || !existsSync(binPath)) return { ok: false, error: "dsh-video-storyboard CLI not found" };
    if (!ffmpegPath || !existsSync(ffmpegPath)) return { ok: false, error: "ffmpeg not found" };
    if (!ffprobePath || !existsSync(ffprobePath)) return { ok: false, error: "ffprobe not found" };
    const base = outDir || tmpdir();
    await mkdir(base, { recursive: true });
    const dir = await mkdtemp(join(base, "video-storyboard-"));
    const output = join(dir, "storyboard.png");
    let localInput = input;
    try {
        if (/^https?:\/\//i.test(String(input))) {
            localInput = await downloadVideo(String(input), dir, Math.max(30000, Number(timeoutMs) || 30000), logger);
        }
    } catch (error) {
        logger?.warn?.("[video-download] failed: " + (error?.message ?? error));
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        return { ok: false, error: "video download failed: " + (error?.message ?? error) };
    }
    const result = await run(process.execPath, [
        binPath,
        localInput,
        "--out", output,
        "--cells", String(Math.max(1, Math.min(16, Number(cells) || 9))),
        "--transcript", "off"
    ], {
        env: {
            ...process.env,
            DSH_FFMPEG_PATH: ffmpegPath,
            DSH_FFPROBE_PATH: ffprobePath
        }
    }, Math.max(1000, Number(timeoutMs) || 20000));
    if (!result.ok || !existsSync(output)) {
        logger?.warn?.("[video-storyboard] failed: " + (result.error || "no output"));
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        return { ok: false, error: result.error || "no storyboard output", stdout: result.stdout, stderr: result.stderr };
    }
    const bytes = await readFile(output);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return {
        ok: true,
        bytes,
        mediaType: "image/png",
        filename: "video-storyboard.png",
        stdout: result.stdout,
        stderr: result.stderr
    };
}
