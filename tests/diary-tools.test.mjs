import assert from "node:assert/strict";
import test from "node:test";
import {
    parseDiaryMarkers,
    resolveDayKey,
    searchDiary,
    readDiaryEntry,
    formatDiarySearch,
    formatDiaryRead
} from "../packages/core/lib/diary-tools.js";

const ENTRIES = [
    { id: "2026-11-18.md", date: "2026-11-18T23:54:00.000Z", content: "今天下雨了，主人忘了带伞，人家有点心疼。" },
    { id: "2026-11-17.md", date: "2026-11-17T23:54:00.000Z", content: "主人说想吃汤面，人家记在小本本上了。" },
    { id: "2026-11-16.md", date: "2026-11-16T23:54:00.000Z", content: "什么都没发生，安安静静的一天。" }
];

test("parses both diary markers", () => {
    const calls = parseDiaryMarkers("先查 [[search_diary: 下雨]] 再读 [[read_diary: 2026-11-18]]");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].name, "search_diary");
    assert.equal(calls[0].args.keyword, "下雨");
    assert.equal(calls[1].name, "read_diary");
    assert.equal(calls[1].args.when, "2026-11-18");
    assert.deepEqual(parseDiaryMarkers("没有标记"), []);
});

test("resolves 今天 / 昨天 / explicit dates", () => {
    const now = new Date(2026, 10, 19, 10, 0, 0); // 2026-11-19 local
    assert.equal(resolveDayKey("今天", now), "2026-11-19");
    assert.equal(resolveDayKey("昨天", now), "2026-11-18");
    assert.equal(resolveDayKey("2026-11-18", now), "2026-11-18");
    assert.equal(resolveDayKey("随便写的", now), "");
});

test("searches by keyword and reports misses", () => {
    const hit = searchDiary(ENTRIES, "下雨");
    assert.equal(hit.ok, true);
    assert.equal(hit.hits.length, 1);
    assert.equal(hit.hits[0].id, "2026-11-18.md");
    assert.ok(hit.hits[0].preview.includes("下雨"));

    const miss = searchDiary(ENTRIES, "唱歌");
    assert.equal(miss.ok, true);
    assert.equal(miss.hits.length, 0);
    const text = formatDiarySearch(miss, "唱歌");
    assert.ok(text.includes("没有找到"));
});

test("reads one day and truncates long bodies", () => {
    const ok = readDiaryEntry(ENTRIES, "2026-11-17");
    assert.equal(ok.ok, true);
    assert.ok(ok.text.includes("汤面"));

    const missing = readDiaryEntry(ENTRIES, "2026-11-01");
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "missing");
    assert.ok(formatDiaryRead(missing).includes("不存在"));

    const long = readDiaryEntry([{ id: "2026-11-15.md", date: "2026-11-15T00:00:00.000Z", content: "字".repeat(3000) }], "2026-11-15");
    assert.ok(long.text.length < 2100);
    assert.ok(long.text.endsWith("省略了）"));
});
