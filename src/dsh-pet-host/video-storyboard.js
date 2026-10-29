/**
 * Small adapter for dsh-video-storyboard's CLI.
 *
 * dsh-pet is not a DSH agent and cannot call the plugin's ctx.tools directly.
 * This module runs the plugin's own storyboard CLI with a hard 20s timeout and
 * returns a PNG path. It never lets a video failure block the main chat.
 */
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

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
    timeoutMs = 20000,
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
    const result = await run(process.execPath, [
        binPath,
        input,
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
