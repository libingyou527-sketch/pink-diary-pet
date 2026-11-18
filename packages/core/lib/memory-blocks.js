/**
 * Experimental structured memory ledger.
 *
 * Blocks are scoped (owner / user:<id>:private / group:<gid>). The ledger is
 * local-only and git-ignored; callers must pass the scopes they are allowed to
 * read. Raw messages are kept so decompress is lossless even if the summary is
 * still pending.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { searchDocs, tokenize } from "./memory-search.js";

export const MEMORY_BLOCKS_VERSION = 1;
const SCOPE_RE = /^(owner|user:[0-9a-zA-Z_@.-]+:private|group:[0-9a-zA-Z_@.-]+)$/;

export function isMemoryScope(scope) {
    return typeof scope === "string" && SCOPE_RE.test(scope);
}

function normalizeScope(scope) {
    if (!isMemoryScope(scope)) throw new Error("invalid memory scope: " + scope);
    return scope;
}

function normalizeMessage(message) {
    const role = message?.role === "assistant" ? "assistant" : "user";
    const content = String(message?.content ?? message?.text ?? "").trim();
    if (!content) return null;
    return {
        role,
        content,
        ts: Number(message?.ts) || Date.now(),
        ...(Array.isArray(message?.images) && message.images.length ? { images: message.images } : {})
    };
}

function keywordsOf(messages) {
    const counts = new Map();
    for (const message of messages) {
        for (const token of tokenize(message.content)) {
            counts.set(token, (counts.get(token) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([token]) => token);
}

function topicOf(messages) {
    const first = messages.find((message) => message.role === "user") ?? messages[0];
    const text = String(first?.content ?? "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 32) : "旧记忆";
}

function fallbackSummary(topic, messages) {
    const userLines = messages
        .filter((message) => message.role === "user")
        .slice(-2)
        .map((message) => message.content.replace(/\s+/g, " ").slice(0, 80));
    return "[待整理] " + topic + (userLines.length ? "；" + userLines.join(" / ") : "");
}

async function readLedger(filePath) {
    try {
        const parsed = JSON.parse(await readFile(filePath, "utf8"));
        if (!parsed || typeof parsed !== "object" || parsed.version !== MEMORY_BLOCKS_VERSION) return null;
        return {
            version: MEMORY_BLOCKS_VERSION,
            nextId: Number(parsed.nextId) || 1,
            blocks: Array.isArray(parsed.blocks) ? parsed.blocks : []
        };
    } catch {
        return null;
    }
}

export function createMemoryBlockStore({ filePath }) {
    if (!filePath) throw new Error("memory block store needs filePath");
    let state = null;
    let writeQueue = Promise.resolve();

    const load = async () => {
        if (state) return state;
        state = await readLedger(filePath) ?? { version: MEMORY_BLOCKS_VERSION, nextId: 1, blocks: [] };
        return state;
    };

    const save = async () => {
        await mkdir(dirname(filePath), { recursive: true });
        const temp = filePath + ".tmp";
        await writeFile(temp, JSON.stringify(state, null, 2), "utf8");
        await rename(temp, filePath);
    };

    const persist = () => {
        const run = writeQueue.then(save, save);
        writeQueue = run.then(() => void 0, () => void 0);
        return run;
    };

    const list = async (scopes) => {
        const ledger = await load();
        const allowed = new Set((Array.isArray(scopes) ? scopes : [scopes]).filter(isMemoryScope));
        return ledger.blocks.filter((block) => allowed.has(block.scope));
    };

    const get = async (blockId, scopes) => {
        const allowed = new Set((Array.isArray(scopes) ? scopes : [scopes]).filter(isMemoryScope));
        const ledger = await load();
        return ledger.blocks.find((block) => block.id === blockId && allowed.has(block.scope)) ?? null;
    };

    const create = async ({ scope, messages, topic, summary, keywords, tier = 1, parentBlockIds = [], status = "pending" }) => {
        const normalizedScope = normalizeScope(scope);
        const ledger = await load();
        const rawMessages = (Array.isArray(messages) ? messages : []).map(normalizeMessage).filter(Boolean);
        if (rawMessages.length === 0) throw new Error("cannot create an empty memory block");
        const id = "b" + ledger.nextId;
        ledger.nextId += 1;
        const computedTopic = String(topic ?? "").trim() || topicOf(rawMessages);
        const block = {
            id,
            scope: normalizedScope,
            tier,
            topic: computedTopic.slice(0, 60),
            summary: String(summary ?? "").trim() || fallbackSummary(computedTopic, rawMessages),
            keywords: Array.isArray(keywords) && keywords.length ? keywords.slice(0, 8).map(String) : keywordsOf(rawMessages),
            status,
            start: rawMessages[0].ts,
            end: rawMessages[rawMessages.length - 1].ts,
            parentBlockIds: [...parentBlockIds],
            rawMessages,
            createdAt: Date.now()
        };
        ledger.blocks.push(block);
        await persist();
        return block;
    };

    const update = async (blockId, scopes, patch) => {
        const ledger = await load();
        const allowed = new Set((Array.isArray(scopes) ? scopes : [scopes]).filter(isMemoryScope));
        const block = ledger.blocks.find((entry) => entry.id === blockId && allowed.has(entry.scope));
        if (!block) return null;
        for (const key of ["topic", "summary", "keywords", "status", "tier", "parentBlockIds"]) {
            if (patch[key] !== undefined) block[key] = patch[key];
        }
        await persist();
        return block;
    };

    const buildDocs = async (scopes) => {
        const blocks = await list(scopes);
        const docs = [];
        for (const block of blocks) {
            docs.push({
                kind: "block",
                ref: block.id,
                blockId: block.id,
                scope: block.scope,
                tier: block.tier,
                text: [block.topic, block.keywords.join(" "), block.summary].join(" "),
                title: block.topic
            });
            for (let index = 0; index < block.rawMessages.length; index += 1) {
                const message = block.rawMessages[index];
                docs.push({
                    kind: "message",
                    ref: block.id + "#" + index,
                    blockId: block.id,
                    scope: block.scope,
                    tier: block.tier,
                    role: message.role,
                    text: message.content,
                    title: block.topic + " / " + message.role
                });
            }
        }
        return docs;
    };

    const search = async ({ scopes, query, limit = 5 }) => {
        const docs = await buildDocs(scopes);
        return searchDocs(docs, query, { limit });
    };

    const decompress = async ({ scopes, blockId, offset = 0, limit = 100 }) => {
        const block = await get(blockId, scopes);
        if (!block) return { blockId, messages: [], total: 0, missing: true };
        const start = Math.max(0, Number(offset) || 0);
        const pageSize = Math.max(1, Math.min(100, Number(limit) || 100));
        const messages = block.rawMessages.slice(start, start + pageSize);
        return {
            blockId: block.id,
            topic: block.topic,
            tier: block.tier,
            status: block.status,
            total: block.rawMessages.length,
            offset: start,
            messages,
            nextOffset: start + messages.length < block.rawMessages.length ? start + messages.length : null
        };
    };

    const indexText = async ({ scopes, limit = 8 }) => {
        const blocks = await list(scopes);
        const visible = blocks.filter((block) => block.status !== "failed").slice(-limit);
        if (visible.length === 0) return "";
        return visible.map((block) => {
            const label = block.status === "pending" ? "[整理中]" : "";
            return "- " + block.id + " " + label + " " + block.topic + "：" + block.summary.slice(0, 180);
        }).join("\n");
    };

    return {
        filePath,
        load,
        list,
        get,
        create,
        update,
        search,
        decompress,
        indexText,
        buildDocs
    };
}
