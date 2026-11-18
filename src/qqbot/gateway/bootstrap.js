import { QQBot } from '@tencent-connect/qqbot-nodejs';
import { SessionManager } from "../session/index.js";
import { handleInbound, createOutboundHandler } from "../transport/index.js";
import { ReplyLimiter } from "../transport/reply-limiter.js";
import { cacheMsgId, cacheEventId } from "../transport/msgid-cache.js";
import { resolveReplyTarget, sendResolvedMarkdown } from "../transport/reply-target.js";
import { chunkMarkdownText } from "../transport/chunker.js";
import { PetBridge } from "../pet-bridge/server.js";
import { QqMemory } from "../pet-bridge/memory.js";
import { processInboundImage } from "../pet-bridge/image.js";
import { appendFileSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFile } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { QuestionChannel } from "../features/question-channel.js";
import { ApprovalChannel } from "../features/approval-channel.js";
import { decodeButtonData } from "../features/button-utils.js";
import { buildUserAgent } from "../shared/index.js";
import { setupMiddlewares } from "./middleware-setup.js";
import { startMediaCleanup } from "../media/media-cleaner.js";
try {
    appendFileSync(join(process.env.USERPROFILE || homedir(), ".dsh", "qqbot", "pet-inbound.log"), JSON.stringify({ ts: new Date().toISOString(), stage: "bootstrap-loaded" }) + "\n", "utf8");
}
catch {}
import { ensureVisionInputModal, registerDescribeImageTool } from "../media/vision-tool.js";
import { registerSendFileTool } from "../media/send-file-tool.js";
/**
 * interaction 统一分发器：按 button_data 的顶层 `t` 判别字段，路由到对应
 * channel（question / approval）。QQ 只有一个 interaction 入口，集中路由
 * 避免多通道各自 try 导致误判。
 */
function dispatchInteraction(event, manager) {
    const raw = event.data?.resolved?.button_data;
    if (!raw)
        return false;
    const button = decodeButtonData(raw);
    if (!button)
        return false;
    if (button.t === 'question')
        return manager.questionChannel?.handleInteraction(event) ?? false;
    if (button.t === 'approval')
        return manager.approvalChannel?.handleInteraction(event) ?? false;
    return false;
}
/** GPT-SoVITS 语音配置（独立于已废弃的 ChatTTS/RVC 管线）。 */
function readGsvSettings() {
    try {
        const file = join(homedir(), ".dsh", "xilian", "tts", "settings.json");
        const data = JSON.parse(readFileSync(file, "utf8"));
        return data && typeof data === "object" ? data : {};
    } catch {
        return {};
    }
}

/** GPT-SoVITS 端口可能调整；运行时探测 /tts 路由并缓存，避免写死端口。 */
const GSV_ROUTE = "/tts";
const GSV_DEFAULT_API = "http://127.0.0.1:9880";
const GSV_DEFAULT_PORTS = [9880, 9881, 9882, 9883];
let gsvBaseCache = null;

function invalidateGsvBase() {
    gsvBaseCache = null;
}

/** 列出本机 LISTEN 端口，区分“本进程 PID 持有”和“全部”（netstat 失败时返回空）。 */
function localListeningPorts(pid) {
    return new Promise((resolve) => {
        try {
            execFile("netstat", ["-ano", "-p", "tcp"], { windowsHide: true, timeout: 4000 }, (error, stdout) => {
                const own = [];
                const all = [];
                const text = String(stdout || "");
                if (text) {
                    for (const line of text.split(/\r?\n/)) {
                        const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
                        if (!m) continue;
                        const port = Number(m[1]);
                        const owner = Number(m[2]);
                        if (!port) continue;
                        if (!all.includes(port)) all.push(port);
                        if (owner === pid && !own.includes(port)) own.push(port);
                    }
                }
                if (error) console.debug?.("[pet] netstat failed: " + (error?.message ?? error));
                resolve({ own, all });
            });
        } catch {
            resolve({ own: [], all: [] });
        }
    });
}

/** 探测某个 base 是否挂着 GPT-SoVITS 的 /tts 路由：404=不是它，其余（405/400）=路由存在。 */
async function isGsvBase(base) {
    try {
        const response = await fetch(base + GSV_ROUTE, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(1500)
        });
        return !(response.status === 404 || response.status === 426 || response.status === 502 || response.status === 503);
    } catch {
        return false;
    }
}

/**
 * 解析当前 GPT-SoVITS 的 API base。
 * 顺序：环境变量 > tts-gsv 配置 > 常见端口 > 本进程监听端口 > 全部本地监听端口 > 默认值。
 * 结果按进程生命周期缓存；调用失败时清缓存重探一次。
 */
async function resolveGsvBase(settings, logger) {
    if (gsvBaseCache) return gsvBaseCache;
    const envBase = String(process.env.DSH_GSV_API_URL || "").trim().replace(/\/+$/, "");
    if (envBase) {
        gsvBaseCache = envBase;
        return gsvBaseCache;
    }
    const candidates = [];
    const push = (value) => {
        const base = String(value || "").trim().replace(/\/+$/, "");
        if (base && !candidates.includes(base)) candidates.push(base);
    };
    push(settings?.apiUrl);
    for (const port of GSV_DEFAULT_PORTS) push("http://127.0.0.1:" + port);
    const { own, all } = await localListeningPorts(process.pid);
    for (const port of own) push("http://127.0.0.1:" + port);
    for (const port of all) push("http://127.0.0.1:" + port);
    for (const base of candidates) {
        if (await isGsvBase(base)) {
            gsvBaseCache = base;
            logger?.debug?.("[pet] gsv api resolved: " + base);
            return base;
        }
    }
    const fallback = String(settings?.apiUrl || GSV_DEFAULT_API).replace(/\/+$/, "");
    logger?.warn?.("[pet] gsv api not resolved, fallback to " + fallback);
    return fallback;
}

function wavDurationSeconds(buffer) {
    try {
        if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") return 0;
        const channels = buffer.readUInt16LE(22);
        const rate = buffer.readUInt32LE(24);
        const bits = buffer.readUInt16LE(34);
        const dataBytes = buffer.length - 44;
        if (!channels || !rate || !bits) return 0;
        return dataBytes / (channels * rate * (bits / 8));
    } catch {
        return 0;
    }
}

/** 只保留要念的文字：剥离 [表情:xxx] 与 [语音] 标签（这两类标签永不进 TTS）。 */
function stripSpeechTags(value) {
    return String(value ?? "")
        .replace(/\[表情[:：][^\]]*\]/g, " ")
        .replace(/\[语音\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

async function synthesizePetVoice(text, config, logger, signal) {
    const settings = readGsvSettings();
    const spoken = stripSpeechTags(text);
    if (!spoken) return null;
    const refAudio = String(settings.refAudioPath || "").trim();
    if (!refAudio) {
        logger?.warn?.("[pet] gsv ref audio not configured");
        return null;
    }
    const payload = JSON.stringify({
        text: spoken,
        text_lang: settings.textLang || "zh",
        ref_audio_path: refAudio,
        prompt_lang: settings.promptLang || "zh",
        prompt_text: String(settings.promptText || ""),
        text_split_method: settings.textSplitMethod || "cut5",
        media_type: "wav",
        streaming_mode: false,
        speed_factor: Number.isFinite(Number(settings.speedFactor)) ? Number(settings.speedFactor) : 1.0,
        top_k: Number.isFinite(Number(settings.topK)) ? Number(settings.topK) : 20,
        top_p: Number.isFinite(Number(settings.topP)) ? Number(settings.topP) : 0.95,
        temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 1.0,
        repetition_penalty: Number.isFinite(Number(settings.repetitionPenalty)) ? Number(settings.repetitionPenalty) : 1.35,
        seed: Number.isFinite(Number(settings.seed)) ? Number(settings.seed) : -1
    });
    const postTts = (base) => fetch(base + GSV_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "audio/wav" },
        body: payload,
        signal: signal || AbortSignal.timeout(120000)
    });
    let api = await resolveGsvBase(settings, logger);
    let response;
    try {
        response = await postTts(api);
    } catch (error) {
        // 端口可能变了：清缓存重新探测一次再重试。
        invalidateGsvBase();
        const retried = await resolveGsvBase(settings, logger);
        if (retried === api) {
            logger?.debug?.("[pet] voice synth skipped: " + (error?.message ?? error));
            return null;
        }
        api = retried;
        try {
            response = await postTts(api);
        } catch (error2) {
            logger?.debug?.("[pet] voice synth skipped: " + (error2?.message ?? error2));
            return null;
        }
    }
    if (!response.ok) {
        logger?.debug?.("[pet] gsv synth http " + response.status);
        return null;
    }
    try {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 44) return null;
        if (wavDurationSeconds(buffer) > 60) return null;
        const file = join(tmpdir(), "dsh-pet-voice-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".wav");
        writeFileSync(file, buffer);
        return file;
    } catch (error) {
        logger?.debug?.("[pet] voice audio fetch skipped: " + (error?.message ?? error));
        return null;
    }
}

function stripQqTimestamp(value) {
    return String(value ?? "")
        .replace(/\[\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s*/g, "")
        .trim();
}

async function maybeSendPetVoice(bot, target, text, config, limiter, logger, timeoutMs = 120000) {    if (!text || !String(text).trim()) return false;
    let file = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("voice-first timeout")), Math.max(1000, Number(timeoutMs) || 20000));
    try {
        file = await synthesizePetVoice(String(text), config, logger, controller.signal);
        if (!file) return false;
        await bot.sendVoice(resolveReplyTarget(target, limiter, false), { localPath: file });
        logger?.debug?.("[pet] voice-first sent; text suppressed");
        return true;
    } catch (error) {
        logger?.warn?.("[pet] voice-first failed, falling back to text: " + (error?.message ?? error));
        return false;
    } finally {
        clearTimeout(timer);
        if (file) {
            try { unlinkSync(file); } catch {}
        }
    }
}
export async function bootstrapGateway(ctx, agents, config, logger) {
    const manager = new SessionManager(ctx, agents, config, logger);
    // ── 初始化 QQ Bot SDK ──
    const userAgent = buildUserAgent();
    const bot = new QQBot({
        appId: config.appId,
        appSecret: config.appSecret,
        transport: 'websocket',
        baseUrl: process.env.QQBOT_BASE_URL?.replace(/\/+$/, '') || 'https://api.bot.qq.com',
        tokenBaseUrl: process.env.QQBOT_TOKEN_BASE_URL?.replace(/\/+$/, '') || 'https://api.bot.qq.com',
        userAgent,
        logger,
    });
    logger.info(`QQBot SDK initialized (UA: ${userAgent})`);
    // ── 中间件链 ──
    bot.use(async (ctx, next) => {
        try { logInbound(ctx.message, { stage: "raw-before-middleware" }); } catch {}
        await next();
        try { logInbound(ctx.message, { stage: "after-middleware", stopped: ctx.stopped, reason: ctx.stopReason ?? null }); } catch {}
    });
    setupMiddlewares(bot, config, manager, logger);
    let petBridge = null;
    let petMemory = null;
    let petReplyLimiter = null;
    if (config.petMode === true) {
        const qqDir = join(process.env.USERPROFILE || homedir(), ".dsh", "qqbot");
        const inboundImageDir = config.inboundImageDir || join(process.env.USERPROFILE || homedir(), ".dsh", "media", "onebot", "tmp", "inbound_images");
        petReplyLimiter = new ReplyLimiter({ limit: 4 });
        petMemory = new QqMemory(config.qqMemoryPath || join(qqDir, "pet-qq-memory.json"), { limit: 1000, logger });
        await petMemory.load();
        petBridge = new PetBridge({
            port: Number(config.petWsPort) || 9527,
            portCount: 10,
            discoveryPath: join(qqDir, "pet-bridge.json"),
            logger,
            sendReply: async (target, text, emojiPath, voice) => {
                text = stripQqTimestamp(text);
                if (voice === true) {
                    const voiceTimeout = Number(config.voiceFirstTimeoutMs) || 120000;
                    const voiceSent = await maybeSendPetVoice(bot, target, text, config, petReplyLimiter, logger, voiceTimeout);
                    if (voiceSent) {
                        // 私聊保留表情图；群聊成功时只发语音。
                        if (target.scope !== "group" && emojiPath && existsSync(emojiPath)) {
                            try {
                                await bot.sendImage(resolveReplyTarget(target, petReplyLimiter, false), { localPath: emojiPath });
                                logger?.debug?.("[pet] emoji image sent after voice: " + emojiPath);
                            } catch (error) {
                                logger?.warn?.("[pet] emoji image send failed: " + (error?.message ?? error));
                            }
                        }
                        return;
                    }
                }
                const chunks = chunkMarkdownText(text, Number(config.textChunkLimit) || 4500);
                for (const chunk of chunks) {
                    await sendResolvedMarkdown(bot, resolveReplyTarget(target, petReplyLimiter, true), chunk);
                }
                if (emojiPath && existsSync(emojiPath)) {
                    try {
                        await bot.sendImage(resolveReplyTarget(target, petReplyLimiter, false), { localPath: emojiPath });
                        logger?.debug?.("[pet] emoji image sent: " + emojiPath);
                    } catch (error) {
                        logger?.warn?.("[pet] emoji image send failed: " + (error?.message ?? error));
                    }
                }
            },
            onSent: async (context, text) => {
                await petMemory.append(context.conversation_id, {
                    role: "assistant",
                    text: stripQqTimestamp(text),
                    message_id: context.message_id,
                    ts: Date.now()
                }, { scope: context.scope, targetId: context.target_id });
            }
        });
        try {
            await petBridge.start();
        } catch (err) {
            logger.error("[pet] bridge start failed: " + (err instanceof Error ? err.message : String(err)));
            petBridge = null;
        }
        bot.use(async (ctx, next) => {
            if (!ctx.state.__petDispatched && ctx.message) {
                ctx.state.__petDispatched = true;
                try { logInbound(ctx.message, { stage: "dispatch-middleware" }); } catch {}
                void handlePetInbound(ctx, bot, config, logger, petBridge, petMemory, petReplyLimiter, inboundImageDir).catch((err) => {
                    logger.error("[pet] dispatch middleware failed: " + (err instanceof Error ? err.message : String(err)));
                    logInbound(ctx.message, { stage: "dispatch-middleware-error", error: err instanceof Error ? err.message : String(err) });
                });
            }
            await next();
        });
    }
    // ── 入站：petMode 交给 dsh-pet；否则走原 dsh agent ──
    bot.on('message', async (mCtx) => {
        const msg = mCtx.message;
        if (mCtx.state.__petDispatched) return;
        mCtx.state.__petDispatched = true;
        try { logInbound(msg, { stage: "message-listener", petMode: config.petMode, hasReplyTarget: !!mCtx.replyTarget, selfId: bot.selfId }); } catch {}
        try {
            if (mCtx.replyTarget) {
                cacheMsgId(mCtx.replyTarget.scope, mCtx.replyTarget.targetId, mCtx.replyTarget.msgId);
            } else {
                logInbound(msg, { stage: "no-reply-target" });
            }
            if (config.debug) {
                logger.debug(`← message (post-middleware): ${JSON.stringify(msg, null, 2).slice(0, 500)}`);
            }
            if (config.petMode === true) {
                logInbound(msg, { stage: "dispatch-pet" });
                void handlePetInbound(mCtx, bot, config, logger, petBridge, petMemory, petReplyLimiter, inboundImageDir).catch((err) => {
                    logger.error("[pet] inbound failed: " + (err instanceof Error ? err.message : String(err)));
                    logInbound(msg, { stage: "inbound-rejected", error: err instanceof Error ? err.message : String(err) });
                });
                return;
            }
            await handleInbound(mCtx, manager, config, logger);
        } catch (error) {
            logger.error("[pet] message listener error: " + (error instanceof Error ? error.message : String(error)));
            logInbound(msg, { stage: "message-listener-error", error: error instanceof Error ? error.message : String(error) });
        }
    });
    // ── 出站：dsh session/event → QQ 消息 ──
    // 获取 tools 服务（工具结果结构化展示），可选
    let toolsRegistry;
    try {
        toolsRegistry = ctx.get('tools');
    }
    catch {
        toolsRegistry = undefined;
    }
    // 发送适配器：将 QQBot 实例适配为 QQBotSender（openStream 参数形态不同）。
    // sendMarkdown 统一做被动回复限额管控：同一 msgId 超限/过期时降级主动推送。
    const replyLimiter = new ReplyLimiter({ limit: 4 });
    const sender = {
        sendMarkdown: (target, content, opts) => sendResolvedMarkdown(bot, resolveReplyTarget(target, replyLimiter, true), content, opts),
        openStream: (target) => bot.openStream({
            target: {
                scope: target.scope,
                targetId: target.targetId,
                msgId: target.msgId,
            },
        }),
    };
    const outboundHandler = createOutboundHandler(manager, sender, config, logger, toolsRegistry);
    ctx
        .on('session/event', outboundHandler);
    // ── 问答通道（ask_user_question → QQ 文本 + 按钮） ──
    const questionChannel = new QuestionChannel(manager, sender, config, logger);
    manager.questionChannel = questionChannel;
    questionChannel.install(ctx);
    // ── 审批通道（approval/request → QQ 两按钮审批） ──
    const approvalChannel = new ApprovalChannel(manager, sender, logger);
    manager.approvalChannel = approvalChannel;
    approvalChannel.install(ctx);
    // ── 按钮点击回调（interaction）：统一分发到问答/审批通道 ──
    bot.on('interaction', async (_iCtx, event) => {
        // scope/targetId 推导对齐消息事件（inbound.ts）：按 scene 判定类型，群用 group_openid，私聊用 user_openid
        const scope = event.scene === 'group' ? 'group' : 'c2c';
        const targetId = scope === 'group' ? (event.group_openid ?? event.user_openid) : event.user_openid;
        // 记录互动事件 id，作为后续被动回复候选（event_id）
        cacheEventId(scope, targetId, event.id);
        const matched = dispatchInteraction(event, manager);
        await bot.acknowledgeInteraction(event.id, matched ? 0 : 3).catch(() => { });
    });
    bot.on('error', (err) => {
        logger.error(`bot error: ${err instanceof Error ? err.message : String(err)}`);
    });
    // 掉线可观测：willReconnect=false 表示不会再重连（随后 bot.start() 的 Promise 会失败）。
    // disconnected 事件为 SDK 1.0.5+ 新增：旧版 handlers 表缺该键，bot.on 会抛
    // TypeError（profiles 增量安装可能残留旧版 SDK）——降级为跳过监听而非崩溃
    try {
        bot.on('disconnected', (event) => {
            const detail = `code=${event.code}${event.reason ? ` reason=${event.reason}` : ''}`;
            if (event.willReconnect) {
                logger.warn(`Bot disconnected (${detail}), reconnecting...`);
            }
            else {
                logger.error(`Bot disconnected permanently (${detail}), giving up`);
            }
        });
    }
    catch (err) {
        logger.warn(`qqbot-nodejs SDK 不支持 disconnected 事件（请升级 @tencent-connect/qqbot-nodejs 至 1.0.5+）: ${err instanceof Error ? err.message : String(err)}`);
    }
    bot.on('ready', () => {
        console.log(`[im-qqbot] Bot ready! appId=${config.appId}`);
    });
    // ── 富媒体过期清理 ──
    if (config.media.enabled) {
        startMediaCleanup(ctx, config.media.ttlHours, logger);
    }
    // ── 视觉工具注册（qqbot_describe_image，复用 dsh llm + attachments） ──
    ensureVisionInputModal(config.vision, logger);
    registerDescribeImageTool(ctx, config.vision, logger);
    // ── 附件发送工具注册（qqbot_send_file） ──
    // 包装 bot：让文件发送也走 msgId 兜底 + 被动回复限额管控。
    // 注意：SDK 文件发送暂不支持 event_id，故 allowEvent=false，跳过 event 候选。
    const mediaSender = {
        sendImage: (target, source) => bot.sendImage(resolveReplyTarget(target, replyLimiter, false), source),
        sendVideo: (target, source) => bot.sendVideo(resolveReplyTarget(target, replyLimiter, false), source),
        sendVoice: (target, source) => bot.sendVoice(resolveReplyTarget(target, replyLimiter, false), source),
        sendFile: (target, source, opts) => bot.sendFile(resolveReplyTarget(target, replyLimiter, false), source, opts),
    };
    registerSendFileTool(ctx, mediaSender, manager, config, logger);
    // ── 生命周期 ──
    ctx
        .effect(() => {
        logger.info(`Starting bot (appId=${config.appId})`);
        bot.start().catch((err) => {
            logger.error(`Bot start failed: ${err instanceof Error ? err.message : String(err)}`);
        });
        return async () => {
            logger.info('Shutting down');
            await petBridge?.stop();
            await manager.disposeAll();
            bot.stop();
        };
    }, 'im-qqbot.lifecycle');
}
//# sourceMappingURL=bootstrap.js.map

async function handlePetInbound(mCtx, bot, config, logger, bridge, memory, limiter, imageDir) {
    const msg = mCtx.message;
    logInbound(msg, { stage: "handle-enter" });
    if (!msg)
        return;
    if (msg.author?.bot === true || (bot.selfId && msg.senderId === bot.selfId)) {
        logger.debug?.("[pet] ignored self message");
        return;
    }
    const hasImages = Array.isArray(msg.attachments) && msg.attachments.some(isInboundImage);
    const hasVideos = Array.isArray(msg.attachments) && msg.attachments.some(isInboundVideo);
    let rawText = String(msg.content ?? "").trim();
    const attachmentCount = Array.isArray(msg.attachments) ? msg.attachments.length : 0;
    logInbound(msg, { stage: "enter", hasImages, hasVideos, attachmentCount });
    if (!rawText && !hasImages && !hasVideos) {
        // QQ 表情包/贴纸可能既没有 text，也没有 attachments；绝不能静默 return。
        rawText = "[用户发了一张图片]";
        logInbound(msg, { stage: "empty-nontext-placeholder" });
    }
    const scope = msg.kind === "group" ? "group" : "c2c";
    const targetId = scope === "group" ? (msg.groupOpenid ?? msg.senderId) : msg.senderId;
    const conversationId = scope === "group" ? "group:" + (msg.groupOpenid ?? targetId) : "c2c:" + targetId;
    const senderName = msg.senderName || msg.senderId || "unknown";
    const messageId = String(msg.messageId || (Date.now() + "-" + Math.random().toString(36).slice(2)));
    let built;
    try {
        built = await buildQqContent(msg, config, logger, imageDir, messageId, mCtx);
    } catch (error) {
        logger.error("[pet] content build failed: " + (error instanceof Error ? error.message : String(error)));
        logInbound(msg, { stage: "build-failed", error: error instanceof Error ? error.message : String(error) });
        built = { text: "[用户发了一张图片]", content: null };
    }
    if (!built.text && !built.content) {
        built = { text: "[用户发了一张图片]", content: null };
    }
    const prefix = scope === "group" ? "[" + senderName + "] " : "";
    let text = (prefix + built.text).trim();
    let content = built.content;
    if (content && prefix) content = [{ type: "text", text: prefix }, ...content];
    if (!text && content) text = (prefix + "[图片]").trim();
    if (!text)
        text = (prefix + "[用户发了一张图片]").trim();
    logInbound(msg, { stage: "built", text, contentTypes: Array.isArray(content) ? content.map((p) => p?.type) : null });
    const context = {
        message_id: messageId,
        sender_id: msg.senderId,
        sender_name: senderName,
        group_id: scope === "group" ? (msg.groupOpenid ?? targetId) : null,
        scope,
        conversation_id: conversationId,
        target_id: targetId,
        pet_id: config.petId || "main",
        shared_memory: scope === "c2c" && Array.isArray(config.sharedC2cIds) && config.sharedC2cIds.includes(targetId)
    };
    const history = memory ? await memory.getHistory(conversationId, Number(config.petHistoryLimit) || 1000) : [];
    if (memory) {
        await memory.append(conversationId, {
            role: "user",
            text,
            message_id: messageId,
            sender_id: msg.senderId,
            sender_name: senderName,
            ts: Date.now()
        }, { scope, targetId });
    }
    if (!bridge) {
        logger.error("[pet] bridge unavailable; message not forwarded to dsh-pet");
        return;
    }
    bridge.track(messageId, mCtx.replyTarget, context);
    const packet = { action: "receive_qq_msg", context, text, history };
    if (content)
        packet.content = content;
    bridge.enqueue(packet);
}

function logInbound(msg, extra = {}) {
    try {
        const line = JSON.stringify({
            ts: new Date().toISOString(),
            ...extra,
            kind: msg?.kind,
            messageId: msg?.messageId,
            senderId: msg?.senderId,
            groupId: msg?.groupOpenid,
            content: String(msg?.content ?? "").slice(0, 800),
            attachments: (Array.isArray(msg?.attachments) ? msg.attachments : []).map((a) => ({
                content_type: a?.content_type,
                url: typeof a?.url === "string" ? a.url.slice(0, 180) : "",
                filename: a?.filename,
                size: a?.size
            })),
            keys: msg && typeof msg === "object" ? Object.keys(msg) : [],
            msg_elements: Array.isArray(msg?.msg_elements) ? msg.msg_elements.slice(0, 3) : undefined
        });
        appendFileSync(join(process.env.USERPROFILE || homedir(), ".dsh", "qqbot", "pet-inbound.log"), line + "\n", "utf8");
    } catch {}
}

function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), ms);
        })
    ]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function isInboundImage(att) {
    const contentType = String(att?.content_type ?? "").toLowerCase();
    return contentType === "image" || contentType.startsWith("image/") || contentType === "sticker" || contentType === "mface";
}

function isInboundVideo(att) {
    const contentType = String(att?.content_type ?? "").toLowerCase();
    const filename = String(att?.filename ?? "").toLowerCase();
    return contentType === "video" || contentType.startsWith("video/") || /\.(mp4|mov|mkv|webm)$/.test(filename);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripBotMention(content, appId) {
    let text = String(content ?? "");
    if (appId) {
        text = text.replace(new RegExp("<@!?" + escapeRegExp(appId) + ">\\s*", "g"), "");
    }
    return text.trim();
}

async function buildQqContent(msg, config, logger, imageDir, messageId, mCtx) {
    const raw = stripBotMention(msg.content, config.appId);
    const faceRe = /\[<face,id=(\d+)\/?>]|<faceType=\d+,faceId="([^"]*)",ext="([^"]*)">|\[CQ:face,id=(\d+)\]/g;
    const parts = [];
    let fallback = "";
    let last = 0;
    let hasFace = false;
    let match;
    while ((match = faceRe.exec(raw)) !== null) {
        hasFace = true;
        const before = raw.slice(last, match.index);
        if (before) {
            parts.push({ type: "text", text: before });
            fallback += before;
        }
        const id = match[1] || match[2] || match[4] || "";
        parts.push({ type: "face", id });
        fallback += "[表情:" + id + "]";
        last = match.index + match[0].length;
    }
    if (hasFace) {
        const tail = raw.slice(last);
        if (tail) {
            parts.push({ type: "text", text: tail });
            fallback += tail;
        }
    } else {
        fallback = raw;
    }

    const timeoutMs = Number(config.inboundImageTimeoutMs) || 5000;
    const imageOptions = (att, contentType, filename) => ({
        url: att.url,
        contentType,
        filename,
        mediaDir: imageDir,
        maxWidth: Number(config.inboundImageMaxWidth) || 800,
        timeoutMs,
        maxBytes: Number(config.inboundImageMaxBytes) || 20 * 1024 * 1024,
        format: config.inboundImageFormat === "jpeg" ? "jpeg" : "webp",
        quality: Number(config.inboundImageQuality) || 80,
        logger
    });

    const images = Array.isArray(msg.attachments) ? msg.attachments.filter(isInboundImage) : [];
    const hasImage = images.length > 0;
    if (hasImage) {
        if (!hasFace && fallback) parts.push({ type: "text", text: fallback });
        for (let i = 0; i < images.length; i += 1) {
            const att = images[i];
            try {
                const image = await withTimeout(processInboundImage(imageOptions(att, att.content_type, att.filename)), timeoutMs, "图片处理超时");
                parts.push({ type: "image", path: image.path, width: image.width, height: image.height, format: image.format });
                fallback += "[图片]";
            } catch (error) {
                const timedOut = error instanceof Error && /超时/.test(error.message);
                logger.warn("[pet] image " + (timedOut ? "timeout" : "failed") + ": " + (error instanceof Error ? error.message : String(error)));
                logInbound(msg, { stage: "image-failed", index: i, timedOut, error: error instanceof Error ? error.message : String(error) });
                const placeholder = timedOut ? "[用户发了一张图片]" : "[用户发送了一张图片，但加载失败]";
                parts.push({ type: "text", text: placeholder });
                fallback += placeholder;
            }
        }
    }

    const quote = mCtx?.state?.quote;
    const videos = Array.isArray(msg.attachments) ? msg.attachments.filter(isInboundVideo) : [];
    const hasVideo = videos.length > 0;
    if (hasVideo) {
        if (!hasFace && !hasImage && fallback) parts.push({ type: "text", text: fallback });
        for (let i = 0; i < videos.length; i += 1) {
            const att = videos[i];
            parts.push({
                type: "video",
                id: "v" + (i + 1),
                url: String(att.url ?? ""),
                filename: String(att.filename ?? "video.mp4")
            });
            fallback += "[视频]";
        }
    }
    const quoteParts = [];
    let quoteFallback = "";
    let hasQuote = false;
    if (quote && typeof quote === "object") {
        const quoteRaw = stripBotMention(quote.rawContent ?? quote.text ?? "", config.appId);
        const quoteText = quoteRaw.replace(/\[image:[^\]]*\]/gi, "").replace(/\[voice:[^\]]*\]/gi, "").trim();
        logInbound(msg, { stage: "quote-context", quoteSource: quote.source, quoteText: quoteText.slice(0, 300), currentText: raw.slice(0, 300) });
        if (quoteText) {
            quoteParts.push({ type: "text", text: "[用户引用了历史消息：" + quoteText + "]\n" });
            quoteFallback += "[用户引用了历史消息：" + quoteText + "]\n";
            hasQuote = true;
        }
        const quoteImages = (Array.isArray(quote.attachments) ? quote.attachments : []).filter((att) => { const type = String(att?.contentType ?? "").toLowerCase(); return type === "image" || type.startsWith("image/"); });
        for (let i = 0; i < quoteImages.length; i += 1) {
            const att = quoteImages[i];
            try {
                const image = await withTimeout(processInboundImage(imageOptions(att, att.contentType, att.filename)), timeoutMs, "引用图片处理超时");
                quoteParts.push({ type: "image", path: image.path, width: image.width, height: image.height, format: image.format });
                quoteFallback += "[引用图片]";
                hasQuote = true;
            } catch (error) {
                const timedOut = error instanceof Error && /超时/.test(error.message);
                logger.warn("[pet] reference image " + (timedOut ? "timeout" : "failed") + ": " + (error instanceof Error ? error.message : String(error)));
                logInbound(msg, { stage: "quote-image-failed", index: i, timedOut, error: error instanceof Error ? error.message : String(error) });
                quoteParts.push({ type: "text", text: "[引用图片加载失败]" });
                quoteFallback += "[引用图片加载失败]";
                hasQuote = true;
            }
        }
        if (!hasQuote && quote.text && quote.text !== "[empty message]") {
            quoteParts.push({ type: "text", text: "[用户引用了历史消息：" + String(quote.text) + "]\n" });
            quoteFallback += "[用户引用了历史消息：" + String(quote.text) + "]\n";
            hasQuote = true;
        }
    }
    if (hasQuote) {
        // Keep quote and current input as two distinct text blocks. Do not split
        // the current text around image parts; the model must see it as one block.
        const currentImages = parts.filter((part) => part?.type === "image");
        const currentText = (hasFace ? fallback : raw).replace(/\[图片]/g, "").trim();
        const currentBlock = "[用户当前说：" + currentText + "]";
        const nextParts = [...quoteParts, { type: "text", text: currentBlock }, ...currentImages];
        parts.length = 0;
        parts.push(...nextParts);
        fallback = quoteFallback + currentBlock + "[图片]".repeat(currentImages.length);
    }

    const mixed = hasFace || hasImage || hasVideo || hasQuote;
    let text = (mixed ? fallback : raw).trim();
    if (!text) text = hasVideo ? "[视频]" : "[用户发了一张图片]";
    return {
        text,
        content: mixed ? parts : null,
        videos
    };
}
