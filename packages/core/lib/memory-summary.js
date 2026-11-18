/**
 * Background structured-summary worker for structured memory blocks.
 * The caller never waits for this in the reply path; tests can await enqueue().
 */
const SYSTEM = "你是对话记忆索引器。把旧对话压缩成一条可检索的记忆索引。只输出一个 JSON 对象，不要 Markdown、不要解释。必须忠于原文，不编造。";

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })
    ]).finally(() => { if (timer) clearTimeout(timer); });
}

function transcriptOf(messages) {
    return messages
        .map((message) => (message.role === "user" ? "用户：" : "絮：") + String(message.content ?? "").trim())
        .join("\n")
        .slice(0, 30000);
}

function parseSummary(raw) {
    const text = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    let parsed;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const summary = String(parsed.summary ?? "").replace(/\s+/g, " ").trim();
    if (!summary) return null;
    return {
        topic: String(parsed.topic ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        summary: summary.slice(0, 300),
        keywords: Array.isArray(parsed.keywords)
            ? parsed.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
            : [],
        openObjectives: Array.isArray(parsed.openObjectives)
            ? parsed.openObjectives.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
            : [],
        decisions: Array.isArray(parsed.decisions)
            ? parsed.decisions.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
            : []
    };
}

export function createStructuredSummaryWorker({ store, generate, timeoutMs = 15000, logger = console }) {
    if (!store) throw new Error("summary worker needs a memory block store");
    if (typeof generate !== "function") throw new Error("summary worker needs a generate callback");
    const active = new Set();

    const enqueue = async (block, scopes) => {
        if (!block || active.has(block.id)) return block;
        active.add(block.id);
        try {
            const prompt = [
                "请把下面这段较早的对话整理成记忆索引。",
                "输出字段：topic（短标题）、summary（不超过300字，保留人名/时间/偏好/决定/未完成事项）、keywords（3-8个检索词）、openObjectives（数组，可空）、decisions（数组，可空）。",
                "summary 只记录过去发生的事，不要写成当前指令；不要编造。",
                "对话：",
                transcriptOf(block.rawMessages)
            ].join("\n");
            const generated = await withTimeout(
                Promise.resolve(generate(SYSTEM, prompt)),
                timeoutMs,
                "memory summary timeout"
            );
            const text = typeof generated === "string" ? generated : generated?.text;
            const parsed = parseSummary(text);
            if (!parsed) throw new Error("invalid summary JSON");
            return await store.update(block.id, scopes, {
                topic: parsed.topic || block.topic,
                summary: parsed.summary,
                keywords: parsed.keywords.length ? parsed.keywords : block.keywords,
                status: "ready"
            });
        } catch (error) {
            logger?.warn?.("[memory-blocks] summary failed: " + (error?.message ?? error));
            return await store.update(block.id, scopes, { status: "failed" });
        } finally {
            active.delete(block.id);
        }
    };

    return { enqueue, active };
}
