import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Runtime configuration for the host. The installer writes
 * ~/.dsh/dsh-pet/pink-diary-pet.json from config/config.yml + .env.
 * Environment variables always win.
 */
export function loadRuntimeConfig(dshHome) {
    let file = {};
    try {
        file = JSON.parse(readFileSync(join(dshHome, "dsh-pet", "pink-diary-pet.json"), "utf8"));
    } catch {
        file = {};
    }
    const envOwnerIds = String(process.env.OWNER_OPENIDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const fileOwnerIds = Array.isArray(file.ownerOpenIds)
        ? file.ownerOpenIds.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
        : [];
    return {
        diaryDir: process.env.PINK_DIARY_DIR || file.diaryDir || join(dshHome, "pink-diary"),
        pictureDir: process.env.PINK_PICTURE_DIR || file.pictureDir || join(dshHome, "dsh-pet", "pictures"),
        ownerOpenIds: envOwnerIds.length > 0 ? envOwnerIds : fileOwnerIds,
        contextWindow: Number(process.env.PINK_CONTEXT_WINDOW || file.contextWindow) || 1_000_000,
        compressionRatio: Number(process.env.PINK_CONTEXT_RATIO || file.compressionRatio) || 0.8,
        summaryRatio: Number(file.summaryRatio) || 0.2,
        summaryMaxChars: Number(file.summaryMaxChars) || 50,
        summaryTimeoutMs: Number(file.summaryTimeoutMs) || 5000,
        memoryBlocksEnabled: process.env.PINK_MEMORY_BLOCKS === "1" || file.memoryBlocksEnabled === true,
        memoryBlocksFile: file.memoryBlocksFile || join(dshHome, "dsh-pet", "context-blocks.json"),
        videoStoryboardBin: process.env.DSH_VIDEO_STORYBOARD_BIN || file.videoStoryboardBin || "",
        videoFfmpegPath: process.env.DSH_FFMPEG_PATH || file.videoFfmpegPath || "",
        videoFfprobePath: process.env.DSH_FFPROBE_PATH || file.videoFfprobePath || "",
        videoStoryboardTimeoutMs: Number(file.videoStoryboardTimeoutMs) || 20000,
        videoWorkDir: process.env.DSH_VIDEO_WORK_DIR || file.videoWorkDir || join(dshHome, "dsh-pet", "video-storyboard")
    };
}
