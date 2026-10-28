import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMemoryBlockStore } from "../src/dsh-pet-host/memory-blocks.js";
import { createStructuredSummaryWorker } from "../src/dsh-pet-host/memory-summary.js";
import { prepareStructuredContext } from "../src/dsh-pet-host/memory-context.js";
import { executeMemoryTool, parseMemoryToolMarkers } from "../src/dsh-pet-host/memory-tools.js";

async function tempStore() {
    const dir = await mkdtemp(join(tmpdir(), "pink-memory-"));
    const store = createMemoryBlockStore({ filePath: join(dir, "context-blocks.json") });
    return { dir, store };
}

test("block ledger persists, searches and enforces scope", async () => {
    const { dir, store } = await tempStore();
    try {
        const owner = await store.create({
            scope: "owner",
            messages: [
                { role: "user", content: "我喜欢芙宁娜的二创图，特别是钞票风格", ts: 100 },
                { role: "assistant", content: "记住了，主人喜欢这张钞票图。", ts: 101 }
            ],
            topic: "图包讨论"
        });
        const group = await store.create({
            scope: "group:test-group",
            messages: [
                { role: "user", content: "群里聊了原神角色", ts: 200 },
                { role: "assistant", content: "是芙宁娜。", ts: 201 }
            ]
        });

        assert.equal(owner.status, "pending");
        assert.equal(owner.tier, 1);
        assert.ok(owner.id.startsWith("b"));

        const ownerHits = await store.search({ scopes: ["owner"], query: "钞票", limit: 5 });
        assert.ok(ownerHits.length > 0);
        assert.ok(ownerHits.every((hit) => hit.ref.startsWith(owner.id)));

        const groupHits = await store.search({ scopes: ["group:test-group"], query: "原神" });
        assert.ok(groupHits.length > 0);
        assert.ok(groupHits.every((hit) => hit.blockId === group.id));

        const wrongScope = await store.decompress({ scopes: ["owner"], blockId: group.id });
        assert.equal(wrongScope.missing, true);

        const page = await store.decompress({ scopes: ["owner"], blockId: owner.id, offset: 0, limit: 1 });
        assert.equal(page.total, 2);
        assert.equal(page.messages.length, 1);
        assert.equal(page.nextOffset, 1);

        const reloaded = createMemoryBlockStore({ filePath: join(dir, "context-blocks.json") });
        const list = await reloaded.list(["owner"]);
        assert.equal(list.length, 1);
        assert.equal(list[0].rawMessages.length, 2);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("structured summary becomes ready and failed summaries remain readable", async () => {
    const { dir, store } = await tempStore();
    try {
        const block = await store.create({
            scope: "owner",
            messages: [
                { role: "user", content: "我们昨天聊了图包", ts: 100 },
                { role: "assistant", content: "嗯，图包的事。", ts: 101 }
            ]
        });
        const worker = createStructuredSummaryWorker({
            store,
            generate: async () => JSON.stringify({
                topic: "图包",
                summary: "昨天和主人聊了图包。",
                keywords: ["图包", "昨天"],
                openObjectives: [],
                decisions: ["保留图包"]
            })
        });
        const updated = await worker.enqueue(block, ["owner"]);
        assert.equal(updated.status, "ready");
        assert.equal(updated.summary, "昨天和主人聊了图包。");
        assert.deepEqual(updated.keywords, ["图包", "昨天"]);

        const failing = await store.create({
            scope: "owner",
            messages: [{ role: "user", content: "测试失败摘要", ts: 200 }]
        });
        const failWorker = createStructuredSummaryWorker({
            store,
            generate: async () => { throw new Error("offline"); },
            logger: { warn: () => {} }
        });
        const failed = await failWorker.enqueue(failing, ["owner"]);
        assert.equal(failed.status, "failed");
        assert.ok(failed.rawMessages[0].content.includes("测试失败"));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("structured context creates a pending block and keeps recent history", async () => {
    const { dir, store } = await tempStore();
    try {
        const history = [];
        for (let index = 0; index < 20; index += 1) {
            history.push({ role: "user", content: "旧消息" + index, ts: 1000 + index * 2 });
            history.push({ role: "assistant", content: "回复" + index, ts: 1000 + index * 2 + 1 });
        }
        const context = await prepareStructuredContext({
            store,
            summaryWorker: null,
            scopes: ["owner"],
            system: "SYSTEM",
            history,
            currentText: "现在说什么",
            budget: 40,
            countTokens: (text) => String(text).length,
            logger: null
        });
        assert.ok(context.createdBlockId);
        assert.ok(context.system.includes("可检索旧记忆"));
        assert.ok(context.history.length < history.length);
        const blocks = await store.list(["owner"]);
        assert.equal(blocks.length, 1);
        assert.equal(blocks[0].status, "pending");
        assert.ok(blocks[0].rawMessages.length > 0);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("memory tools parse markers and enforce scopes", async () => {
    const { dir, store } = await tempStore();
    try {
        const block = await store.create({
            scope: "owner",
            messages: [{ role: "user", content: "旧记忆里的蓝色钥匙", ts: 100 }]
        });
        const calls = parseMemoryToolMarkers("[[search_old_memory: 蓝色钥匙]] [[decompress_old_memory: " + block.id + "]]");
        assert.equal(calls.length, 2);
        const search = await executeMemoryTool("search_old_memory", { keyword: "蓝色钥匙" }, { store, scopes: ["owner"] });
        assert.ok(search.includes(block.id));
        const read = await executeMemoryTool("decompress_old_memory", { blockId: block.id }, { store, scopes: ["owner"] });
        assert.ok(read.includes("蓝色钥匙"));
        const denied = await executeMemoryTool("decompress_old_memory", { blockId: block.id }, { store, scopes: ["group:test-group"] });
        assert.ok(denied.includes("not found"));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

