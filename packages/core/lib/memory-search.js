/**
 * Lightweight memory search for the experimental structured-memory ledger.
 * Pure in-memory lexical search: BM25 + fuzzy token overlap, with CJK support.
 */
const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const LATIN_WORD = /[a-z][a-z0-9_]*[a-z0-9]|[a-z0-9]/g;
const STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "have", "has", "was", "were",
    "you", "your", "are", "but", "not", "can", "will", "然后", "就是", "一个", "这个", "那个",
    "我们", "你们", "他们", "因为", "所以", "但是", "还是", "已经", "可以", "什么", "怎么"
]);
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter("zh", { granularity: "word" })
    : null;

function cjkTokens(run) {
    if (!run) return [];
    if (segmenter) {
        const words = [...segmenter.segment(run)].map((item) => item.segment).filter((word) => word.length >= 2);
        if (words.length > 0) return words;
    }
    const out = [];
    for (let index = 0; index < run.length - 1; index += 1) out.push(run.slice(index, index + 2));
    return out;
}

export function tokenize(text) {
    const lower = String(text ?? "").toLowerCase();
    const tokens = [];
    for (const word of lower.match(LATIN_WORD) ?? []) {
        if (word.length >= 2 && !STOPWORDS.has(word)) tokens.push(word);
    }
    if (CJK.test(lower)) {
        for (const word of cjkTokens(lower)) {
            if (!STOPWORDS.has(word)) tokens.push(word);
        }
    }
    return tokens;
}

function termFrequency(tokens) {
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    return tf;
}

function bm25(docs, queryTokens) {
    const k1 = 1.2;
    const b = 0.75;
    const parsed = docs.map((doc) => {
        const tokens = tokenize(doc.text);
        return { tokens: termFrequency(tokens), length: tokens.length };
    });
    const avgLength = parsed.reduce((sum, item) => sum + item.length, 0) / (parsed.length || 1);
    const idf = new Map();
    for (const token of new Set(queryTokens)) {
        let df = 0;
        for (const item of parsed) if (item.tokens.has(token)) df += 1;
        idf.set(token, Math.log(1 + (parsed.length - df + 0.5) / (df + 0.5)));
    }
    return parsed.map((item) => {
        let score = 0;
        for (const token of queryTokens) {
            const frequency = item.tokens.get(token) ?? 0;
            if (frequency === 0) continue;
            score += (idf.get(token) ?? 0) * (frequency * (k1 + 1)) /
                (frequency + k1 * (1 - b + (b * item.length) / (avgLength || 1)));
        }
        return score;
    });
}

function normalize(values) {
    const max = values.reduce((current, value) => Math.max(current, value), 1e-9);
    return values.map((value) => value / max);
}

function fuzzyScore(text, query) {
    const haystack = String(text ?? "").toLowerCase();
    const needle = String(query ?? "").toLowerCase().trim();
    if (!needle) return 0;
    if (haystack.includes(needle)) return 1;
    const terms = tokenize(needle);
    if (terms.length === 0) return 0;
    let hits = 0;
    for (const term of terms) {
        if (haystack.includes(term)) hits += 1;
        else if (term.length >= 3 && haystack.includes(term.slice(0, Math.max(2, term.length - 1)))) hits += 0.35;
    }
    return hits / terms.length;
}

function preview(text, query, length = 160) {
    const value = String(text ?? "").replace(/\s+/g, " ").trim();
    if (value.length <= length) return value;
    const needle = String(query ?? "").trim().toLowerCase();
    const at = needle ? value.toLowerCase().indexOf(needle) : -1;
    if (at < 0) return value.slice(0, length - 1) + "…";
    const start = Math.max(0, at - Math.floor(length / 2));
    const end = Math.min(value.length, start + length);
    return (start > 0 ? "…" : "") + value.slice(start, end).trim() + (end < value.length ? "…" : "");
}

export function searchDocs(docs, query, options = {}) {
    const queryTokens = tokenize(query);
    if (docs.length === 0 || queryTokens.length === 0) return [];
    const bm = normalize(bm25(docs, queryTokens));
    const fuzzy = normalize(docs.map((doc) => fuzzyScore(doc.text, query)));
    const weights = { user: 1.5, assistant: 1, tool: 0.6, block: 1, ...(options.roleWeights ?? {}) };
    const limit = Math.max(1, Math.min(20, Number(options.limit) || 5));
    return docs
        .map((doc, index) => {
            const roleWeight = doc.kind === "message" ? (weights[doc.role] ?? 1) : weights.block;
            return {
                ...doc,
                score: (0.7 * bm[index] + 0.3 * fuzzy[index]) * roleWeight,
                preview: preview(doc.text, query, Number(options.previewLength) || 160)
            };
        })
        .filter((doc) => doc.score >= (options.minScore ?? 0.01))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
}
