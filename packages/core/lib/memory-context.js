/**
 * Experimental bridge between buildChatContext's token budget and the
 * structured block ledger. It never waits for the background summary: the
 * current reply gets recent history plus a block index, while the summary runs
 * asynchronously and becomes available on the next turn.
 */

function normalize(messages) {
    return (Array.isArray(messages) ? messages : [])
        .map((message) => ({
            role: message?.role === "assistant" ? "assistant" : "user",
            content: String(message?.content ?? message?.text ?? "").trim(),
            ts: Number(message?.ts) || 0
        }))
        .filter((message) => message.content);
}

function turnsOf(messages) {
    const turns = [];
    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        if (message.role === "user" && messages[index + 1]?.role === "assistant") {
            turns.push([message, messages[index + 1]]);
            index += 1;
        } else {
            turns.push([message]);
        }
    }
    return turns;
}

function estimate({ system, history, currentText, images, countTokens }) {
    const imageTokens = (Array.isArray(images) ? images.length : 0) * 800;
    return countTokens(system) + countTokens(currentText) +
        history.reduce((sum, message) => sum + countTokens(message.content), 0) + imageTokens;
}

function trimToBudget({ system, history, currentText, images, budget, countTokens }) {
    const turns = turnsOf(history);
    while (turns.length > 0) {
        const next = turns.flat();
        if (estimate({ system, history: next, currentText, images, countTokens }) <= budget) return next;
        turns.shift();
    }
    return [];
}

export async function prepareStructuredContext({
    store,
    summaryWorker,
    scopes,
    system,
    history,
    currentText,
    images = [],
    budget,
    countTokens,
    logger = console
}) {
    const allowedScopes = (Array.isArray(scopes) ? scopes : [scopes]).filter(Boolean);
    if (allowedScopes.length === 0) throw new Error("structured memory needs at least one scope");
    const primaryScope = allowedScopes[0];
    const normalized = normalize(history);
    let nextSystem = system;
    let nextHistory = normalized;

    const existing = await store.list(allowedScopes);
    const primaryBlocks = existing.filter((block) => block.scope === primaryScope);
    const latestEnd = primaryBlocks.reduce((latest, block) => Math.max(latest, Number(block.end) || 0), 0);
    if (primaryBlocks.length > 0 && latestEnd > 0) {
        nextHistory = normalized.filter((message) => (Number(message.ts) || 0) > latestEnd);
        // 边界异常（把边界写成了"现在"）会让历史被整段切掉：至少保留最近一半。
        if (nextHistory.length === 0 && normalized.length > 0) {
            const turns = turnsOf(normalized);
            nextHistory = turns.slice(Math.floor(turns.length / 2)).flat();
        }
    }

    let created = null;
    if (existing.length === 0 || nextHistory.length === normalized.length) {
        const turns = turnsOf(normalized);
        const cut = Math.max(1, Math.floor(turns.length * 0.2));
        const oldMessages = turns.slice(0, cut).flat();
        const recent = turns.slice(cut).flat();
        if (oldMessages.length > 0) {
            created = await store.create({
                scope: primaryScope,
                messages: oldMessages,
                status: "pending"
            });
            nextHistory = recent;
            if (summaryWorker && created) void summaryWorker.enqueue(created, [primaryScope]);
        }
    }

    const indexText = await store.indexText({ scopes: allowedScopes });
    if (indexText) {
        nextSystem = nextSystem +
            "\n\n【可检索旧记忆】\n" + indexText +
            "\n需要旧细节时，可以检索这些块；不要编造块里没有的内容。";
    }

    // Cheap deterministic fallback: surface the best matching block previews
    // even before the model has a tool loop. The full raw text remains behind
    // search/decompress and is never injected here.
    // 不在这里做"按当前问题自动检索旧记忆"。
    // 查询词每轮不同：放进 system 会每轮打断缓存前缀，放进 user 尾部又会让
    // "她记得"退化成"手里被塞了搜索结果"、诱导主动翻旧账。
    // 旧细节一律交给她自己用 search_old_memory / decompress_old_memory 去取。

    nextHistory = trimToBudget({ system: nextSystem, history: nextHistory, currentText, images, budget, countTokens });
    logger?.log?.("[memory-blocks] scope=" + primaryScope + " blocks=" + existing.length +
        (created ? "+1" : "") + " history=" + nextHistory.length);
    return {
        system: nextSystem,
        history: nextHistory,
        scopes: allowedScopes,
        createdBlockId: created?.id ?? null,
        compressed: created !== null || existing.length > 0
    };
}



