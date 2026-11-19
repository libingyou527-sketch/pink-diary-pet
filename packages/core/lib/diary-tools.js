/**
 * 日记查询工具（纯函数 + 可注入的数据源，便于测试）。
 *
 * 设计原则：
 *   · 她想查就查——提示词不设频率限制
 *   · 成本靠技术兜底：两步查询（search 便宜，read 才取全文）+ 单轮最多 1 次 + 按天缓存
 *   · 只读：绝不允许模型删除或修改日记
 */

/** 提示词：语气是"允许"，不是"禁止频繁查"。 */
export const DIARY_TOOL_PROMPT = [
	"你有一本自己的粉色日记（你自己写的，只读）。想回忆的时候可以随时翻，不用问对方。",
	"翻的方法：",
	"  [[search_diary: 关键词]]     按关键词找，返回日期和摘要",
	"  [[read_diary: 2026-11-18]]    读某一天的全文（也接受 今天 / 昨天）",
	"查之前先想一下：这件事真的需要翻本子吗？翻到了就自然地说，不要逐字照抄。",
	"日记里没有的事就不要编，直接说记不得了。"
].join("\n");

const SEARCH_RE = /\[\[\s*search_diary\s*:\s*([^\]]+)\]\]/gi;
const READ_RE = /\[\[\s*read_diary\s*:\s*([^\]]+)\]\]/gi;

/** 从模型输出里解析日记工具标记。 */
export function parseDiaryMarkers(text) {
	const calls = [];
	const raw = String(text ?? "");
	let match;
	while ((match = SEARCH_RE.exec(raw)) !== null) {
		const keyword = match[1].trim();
		if (keyword) calls.push({ name: "search_diary", args: { keyword } });
	}
	while ((match = READ_RE.exec(raw)) !== null) {
		const when = match[1].trim();
		if (when) calls.push({ name: "read_diary", args: { when } });
	}
	return calls;
}

/** 把 "今天"/"昨天"/"2026-11-18" 解析成日期键；失败返回空串。 */
export function resolveDayKey(when, now = new Date()) {
	const value = String(when ?? "").trim();
	if (!value) return "";
	const pad = (n) => String(n).padStart(2, "0");
	const keyOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
	if (value === "今天" || value === "today") return keyOf(now);
	if (value === "昨天" || value === "yesterday") {
		const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		return keyOf(y);
	}
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return m ? value : "";
}

/** 关键词检索：返回最多 limit 条「日期 + 摘要」。 */
export function searchDiary(entries, keyword, limit = 5) {
	const needle = String(keyword ?? "").trim();
	if (!needle) return { ok: false, reason: "empty-keyword" };
	const hits = [];
	for (const entry of entries) {
		const text = String(entry.content ?? "");
		const at = text.indexOf(needle);
		if (at < 0) continue;
		const start = Math.max(0, at - 30);
		const preview = (start > 0 ? "…" : "") + text.slice(start, at + needle.length + 50).replace(/\s+/g, " ").trim();
		hits.push({ id: entry.id, date: entry.date, preview });
		if (hits.length >= limit) break;
	}
	return { ok: true, hits, total: entries.length };
}

/** 取某一天的正文（截断）。 */
export function readDiaryEntry(entries, dayKey, maxChars = 2000) {
	if (!dayKey) return { ok: false, reason: "bad-date" };
	const entry = entries.find((item) => String(item.id).startsWith(dayKey));
	if (!entry) return { ok: false, reason: "missing", dayKey };
	const raw = String(entry.content ?? "");
	return {
		ok: true,
		id: entry.id,
		date: entry.date,
		text: raw.length > maxChars ? raw.slice(0, maxChars) + "…（后面还有，省略了）" : raw
	};
}

/** 把检索结果格式化成给模型看的一段文本。 */
export function formatDiarySearch(result, keyword) {
	if (!result.ok) return "search_diary: " + result.reason;
	if (result.hits.length === 0) return "search_diary: 没有找到和「" + keyword + "」有关的日记（共 " + result.total + " 篇）";
	return "search_diary「" + keyword + "」命中 " + result.hits.length + " 篇：\n" +
		result.hits.map((hit) => "- " + String(hit.date).slice(0, 10) + "：" + hit.preview).join("\n") +
		"\n需要原文就 [[read_diary: " + String(result.hits[0].date).slice(0, 10) + "]]";
}

/** 把某天的正文格式化成给模型看的一段文本。 */
export function formatDiaryRead(result) {
	if (!result.ok) {
		if (result.reason === "missing") return "read_diary: " + result.dayKey + " 这篇日记不存在（或那天没写）";
		return "read_diary: " + result.reason;
	}
	return "read_diary " + String(result.date).slice(0, 10) + "：\n" + result.text;
}
