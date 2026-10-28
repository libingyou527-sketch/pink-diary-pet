# Structured Memory Blocks — experiment

Branch: `feature/structured-memory-blocks`

Status: experimental, **disabled by default**. It does not touch the running
dsh-pet until `memoryBlocks.enabled` is set to `true` and the host is installed
from this branch.

## What is implemented

```text
src/dsh-pet-host/memory-blocks.js
src/dsh-pet-host/memory-search.js
src/dsh-pet-host/memory-summary.js
src/dsh-pet-host/memory-context.js
src/dsh-pet-host/memory-tools.js
```

### Ledger

- Local-only file: `~/.dsh/dsh-pet/context-blocks.json`
- Atomic writes
- Block fields: `id`, `scope`, `tier`, `topic`, `summary`, `keywords`,
  `status`, `start/end`, `parentBlockIds`, `rawMessages`
- Scopes:
  - `owner`
  - `user:<openid>:private`
  - `group:<group_openid>`
- All reads require an explicit allowed-scope list; no cross-scope access.

### Search

- CJK/Latin tokenization
- BM25 + fuzzy overlap
- Role weights (user > assistant > tool)
- Searches block summaries, keywords, and original messages
- Returns block id + score + preview

### Background summary

- Creates a `pending` block immediately
- Starts a background summary worker
- Never awaits it in the reply path
- Structured JSON:
  ```json
  {
    "topic": "...",
    "summary": "...",
    "keywords": ["..."],
    "openObjectives": ["..."],
    "decisions": ["..."]
  }
  ```
- Failure marks `failed`; raw messages remain searchable/decompressible

### Context integration

`buildChatContext` runs the old path unless:

```yaml
memoryBlocks:
  enabled: true
```

When enabled and over 80%:

1. take oldest 20% complete turns;
2. create a pending block with raw messages;
3. use recent history + block index;
4. schedule background summary;
5. auto-prefetch top matching block previews.

When under budget, raw history is used as before.

### Tools

- `search_old_memory` / `decompress_old_memory` tool definitions are exported.
- A provider-independent marker fallback is implemented:
  ```text
  [[search_old_memory: 关键词]]
  [[decompress_old_memory: b1]]
  ```
  The host executes it, appends the result to the system prompt, and re-calls the model once.
- Native tool-call loop is not wired in this experiment; it needs a verified
  `ctx.llm.stream` tools contract.
- Deterministic auto-prefetch is always available as a fallback.

## Safety

- Feature flag defaults to `false`.
- No live dsh-pet installation happened.
- Group scope never reads owner/user private blocks.
- Diary and identity are not part of the block ledger.
- `rawMessages` are local private data; never commit the ledger.

## Tests

```bash
npm test
npm run verify
```

The tests cover:

- ledger persistence/reload
- scope ACL
- search + preview
- paginated decompress
- structured summary success/failure
- pending block creation
- tool marker parsing/execution

## Next steps before enabling

1. Verify native tool calling support in `ctx.llm.stream`.
2. Add a bounded native tool loop and fallback test.
3. Run a synthetic 1M/low-budget test.
4. Test A-private / group / owner matrix on a staging profile.
5. Only then enable `memoryBlocks.enabled`.
