/**
 * Memory tools for structured blocks.
 *
 * The native tool definitions are exported for the future bounded tool loop.
 * A marker protocol is included as a provider-independent fallback; both paths
 * execute the same scope-checked store methods.
 */

export const MEMORY_TOOL_DEFINITIONS = [
    {
        name: "search_old_memory",
        description: "Search old compressed memory blocks (summaries, keywords and original messages) in the current conversation scope.",
        parameters: {
            type: "object",
            properties: {
                keyword: { type: "string", description: "Keyword or phrase to search for." },
                limit: { type: "number", description: "Max results (default 5, max 10)." }
            },
            required: ["keyword"]
        }
    },
    {
        name: "decompress_old_memory",
        description: "Read the original messages of one old memory block. Read-only and paginated; only the current conversation scope is accessible.",
        parameters: {
            type: "object",
            properties: {
                blockId: { type: "string", description: "Block id such as b1." },
                offset: { type: "number", description: "Start message index (default 0)." },
                limit: { type: "number", description: "Messages per page (default 40, max 100)." }
            },
            required: ["blockId"]
        }
    }
];

export function buildMemoryToolPrompt() {
    return [
        "【旧记忆工具】",
        "需要旧细节时，可输出 `[[search_old_memory: 关键词]]`，宿主会检索当前会话允许的旧记忆块并继续。",
        "需要原文时输出 `[[decompress_old_memory: b1]]`（可加 offset/limit）。",
        "不要编造旧记忆块中没有的内容。"
    ].join("\n");
}

export function parseMemoryToolMarkers(text) {
    const calls = [];
    const searchRe = /\[\[\s*search_old_memory\s*:\s*([^\]]+)\]\]/gi;
    const decompressRe = /\[\[\s*decompress_old_memory\s*:\s*([^\]]+)\]\]/gi;
    let match;
    while ((match = searchRe.exec(String(text ?? ""))) !== null) {
        calls.push({ name: "search_old_memory", args: { keyword: match[1].trim() } });
    }
    while ((match = decompressRe.exec(String(text ?? ""))) !== null) {
        const raw = match[1].trim();
        calls.push({ name: "decompress_old_memory", args: /^b\d+$/i.test(raw) ? { blockId: raw } : { blockId: raw } });
    }
    return calls;
}

function formatSearch(results) {
    if (results.length === 0) return "search_old_memory: no matches";
    return "search_old_memory:\n" + results.map((hit) => {
        const label = hit.kind === "block" ? "block " + hit.blockId : "message " + hit.ref + " (block " + hit.blockId + ")";
        return "- " + label + " score=" + hit.score.toFixed(2) + "：" + hit.preview;
    }).join("\n");
}

function formatDecompress(result) {
    if (result.missing) return "decompress_old_memory: block not found or not in scope";
    const lines = result.messages.map((message) => "[" + message.role + "] " + message.content);
    const next = result.nextOffset === null ? "" : "\nnextOffset=" + result.nextOffset;
    return "decompress_old_memory " + result.blockId + " (" + result.offset + "/" + result.total + "):\n" +
        lines.join("\n") + next;
}

export async function executeMemoryTool(name, args, { store, scopes }) {
    if (!store) throw new Error("memory tools need a block store");
    if (name === "search_old_memory") {
        const keyword = String(args?.keyword ?? "").trim();
        if (!keyword) return "search_old_memory: empty keyword";
        const results = await store.search({
            scopes,
            query: keyword,
            limit: Math.max(1, Math.min(10, Number(args?.limit) || 5))
        });
        return formatSearch(results);
    }
    if (name === "decompress_old_memory") {
        const result = await store.decompress({
            scopes,
            blockId: String(args?.blockId ?? "").trim(),
            offset: Number(args?.offset) || 0,
            limit: Math.max(1, Math.min(100, Number(args?.limit) || 40))
        });
        return formatDecompress(result);
    }
    return "unknown memory tool: " + name;
}

/**
 * Provider-independent marker loop. `generate` is injected by the host so this
 * module stays testable and does not depend on dsh-pet internals.
 */
export async function runMarkerToolLoop({
    generate,
    system,
    history,
    currentText,
    images = [],
    store,
    scopes,
    maxRounds = 2
}) {
    let nextSystem = String(system ?? "");
    let reply = await generate(nextSystem, history, currentText, images);
    for (let round = 0; round < maxRounds; round += 1) {
        const calls = parseMemoryToolMarkers(reply?.text ?? reply);
        if (calls.length === 0) return reply;
        const results = [];
        for (const call of calls) {
            results.push(await executeMemoryTool(call.name, call.args, { store, scopes }));
        }
        nextSystem += "\n\n【旧记忆工具结果】\n" + results.join("\n\n");
        reply = await generate(nextSystem, history, currentText, images);
    }
    return reply;
}
