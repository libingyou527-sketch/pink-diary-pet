# 粉色日记：今日总结按钮

> 2026-11-18 新增。面板上多一个「写今日总结」按钮，可以把原本 23:59 才写的一日总结提前写掉。

## 行为

```text
点击        POST /dsh-pet-7340/diary/summary?pet=main&surface=any
成功        生成 200~400 字的第一人称总结，追加到当天文件：
            ## HH:MM · 一日总结
按钮状态    已有总结 → 置灰，文案变「今天已经有一日总结了」（hover 显示时间）
            生成中   → 「絮在总结…」且禁用
页面加载    GET 同一路由拿状态 { ok, exists, at, messages, minMessages }
```

## 去重规则（三层）

```text
① 写入前检查     hasTodaySummary() 读当天文件，正则匹配 "## HH:MM · 一日总结"
                已存在 → 抛 TODAY_SUMMARY_EXISTS:HH:MM → 路由回 { ok:false, reason:"summary-exists" }
② 并发锁         diaryWriting 标志复用；正在写 → { ok:false, reason:"busy" }
③ 定时任务       23:59 的调度在调用前也查一次 hasTodaySummary，
                手动写过 → 记 summaryStatus="skipped-duplicate" 并跳过
```

**判据不是"文件是否存在"**——每天 00:01 就会建空白骨架，文件一直存在。

## 门槛

```text
当天对话 < 4 条 → { ok:false, reason:"too-early", messages, minMessages:4 }
```

避免早上八点点一下、只有两句对话就生成一篇空泛总结。

## 失败处理

```text
LLM 失败（无 key / 超时） → { ok:false, reason:"generate-error", message }
                            不写文件，不留空段落
```

## 涉及文件

```text
packages/core/lib/index.js
  hasTodaySummary()          读当天文件判定（约 5002 行）
  countTodayMessages()       当天对话条数（约 5019 行）
  writeDailySummary()        加 options.force 与去重守卫（约 5137 行）
  rest === "diary/summary"   路由，GET 状态 / POST 触发（约 7291 行）
  23:59 调度                 增 skipped-duplicate 分支

src/plugins/pink-diary/client.js
  头部按钮 + summary 状态 + 失败文案（中文/英文）

自动写入的日记（writeDailyDiary"絮的日记"）不受影响，仍是另一个按钮。
```

## 验收清单

```text
1. 无总结 → 点按钮 → 生成，文件出现 "## HH:MM · 一日总结"
2. 再点 → summary-exists，文件 mtime/size 不变
3. 手动写完 → 触发定时逻辑 → 跳过（不重复）
4. 断网/无 key → 明确报错，文件不变
5. 当天对话 < 4 条 → too-early 提示
6. 跨零点 → 新的一天可再写一次
7. 刷新页面 → 已存在时按钮置灰
```
