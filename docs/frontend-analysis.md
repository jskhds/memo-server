# 前端页面结构与本地存储分析

> 分析日期：2026-04-13
> 对比来源：`../miniprogram/src` vs `docs/architecture.md`

---

## 一、前端页面结构概览

| 页面路径 | 功能 | 本地存储读写 |
|---------|------|------------|
| `pages/home` | 首页：今日待复习数、Streak、卡组列表 | 读 DECKS、STREAK |
| `pages/decks` | 卡组列表管理 | 读写 DECKS |
| `pages/cards` | 卡组内卡片列表、筛选、开始复习 | 读写 DECKS |
| `pages/card-edit` | 新建/编辑单张卡片 | 读写 DECKS |
| `pages/review` | 复习流程（翻卡 + 评分）| 读写 DECKS、写 REVIEW_HISTORY、写 SUMMARY_RESULTS |
| `pages/review-summary` | 复习结果摘要、更新 Streak | 读 SUMMARY_RESULTS、写 STREAK |
| `pages/stats` | 学习统计（折线图、热力图、掌握率）| 读 REVIEW_HISTORY、读 DECKS |

### 本地存储 Key 汇总（`utils/storage.ts`）

| Key | 类型 | 说明 |
|-----|------|------|
| `flashcard_decks` | `Deck[]` | 全量卡组数据（含嵌套卡片） |
| `flashcard_review_history` | `ReviewRecord[]` | 历史每日复习记录 |
| `flashcard_streak` | `StreakData` | 连续打卡数据 |
| `flashcard_review_session` | `{ cards, deckId/deckIds, source? }` | 页面间传递复习卡片（临时） |
| `flashcard_summary_results` | `{ results, deckId, cards }` | 页面间传递复习结果（临时） |

---

## 二、前端数据类型定义（`types/index.ts`）

### Card

```ts
interface Card {
  id: string          // 本地生成，格式 "card_{timestamp}_{random}"
  front: string
  back: string
  ease: number        // 默认 2.5
  interval: number    // 天数，默认 1
  repetitions: number // 默认 0
  nextReview: number  // ⚠️ 毫秒时间戳（number），非 ISO 字符串
  status: 'new' | 'learning' | 'review'
  createdAt: number   // ⚠️ 毫秒时间戳（number），非 ISO 字符串
}
```

### Deck

```ts
interface Deck {
  id: string          // 本地生成，格式 "deck_{timestamp}_{random}"
  name: string
  createdAt: number   // ⚠️ 毫秒时间戳（number），非 ISO 字符串
  cards: Card[]       // ⚠️ 卡片嵌套在 Deck 内，非独立集合
}
```

### 其他类型

```ts
interface ReviewRecord { date: string; count: number }       // 与后端一致
interface StreakData { current: number; longest: number; lastDate: string } // 与后端一致
interface ReviewSession { cards: Card[]; deckId: string }
type ReviewQuality = 0 | 3 | 5  // 与后端一致
```

---

## 三、前端与架构设计的差异对照表

### 3.1 数据结构差异

| # | 字段/结构 | 前端现状 | 架构设计 | 影响 |
|---|---------|---------|---------|------|
| 1 | **ID 字段名** | `id`（字符串） | `_id`（ObjectId → 序列化为字符串） | API 响应需统一映射，前端请求中的 id 参数需对应后端的 `_id` |
| 2 | **Deck 与 Card 的关系** | Card 嵌套在 `Deck.cards[]` 内 | Card 为独立集合，通过 `deckId` 关联 | **高影响**：前端所有"先取 Deck 再找 Card"的操作模式需全部重写 |
| 3 | **`nextReview` 类型** | `number`（毫秒时间戳） | `Date`（ISO 8601 字符串） | 前端 `isDue(card)` 用 `card.nextReview <= Date.now()` 判断，接收 API 数据后需转换 |
| 4 | **`createdAt` 类型** | `number`（毫秒时间戳） | `Date`（ISO 8601 字符串） | 同上，日期比较逻辑需适配 |
| 5 | **`Deck.updatedAt`** | 前端无此字段 | 架构有 `updatedAt` 字段 | 前端无需感知，后端自动维护即可 |

---

### 3.2 接口行为差异

| # | 功能点 | 前端现状 | 架构设计 | 差异说明 |
|---|-------|---------|---------|---------|
| 6 | **卡片列表筛选** | 按 `DisplayStatus`（'未学'/'不会'/'模糊'/'掌握'）筛选 | `GET /api/decks/:deckId/cards?status=new/learning/review` 按 `CardStatus` 筛选 | **不对齐**：前端有 4 种展示状态，后端只有 3 种存储状态，两套枚举映射关系需定义 |
| 7 | **掌握（mastered）定义** | `getDisplayStatus(c) === '掌握'` → 要求 `interval > 3` | 架构文档未明确 `mastered` 的计算标准 | 后端计算 `stats.mastered` 时需与前端标准对齐（建议：`interval > 3`） |
| 8 | **开始复习（卡组内）** | 将该卡组**所有卡片**（不区分是否到期）放入 Session | `GET /api/review/due?deckId=xxx` 只返回到期卡片 | **逻辑不同**：前端支持"强制复习全部"，后端接口只返回到期卡；需讨论是否保留此功能 |
| 9 | **SM-2 计算位置** | 在 `review/index.tsx` 前端本地执行（`calculateNextReview`） | 后端执行，返回 `updatedCards` | **需迁移**：前端复习页提交评分后应直接用后端返回的 `updatedCards` 更新视图，删除本地计算逻辑 |
| 10 | **Streak 更新时机** | 在 `review-summary` 页面调用 `updateStreak()` 本地更新 | `POST /api/review/submit` 后端自动计算并在响应中返回 | **需迁移**：前端应使用 `submit` 响应中的 `streak` 字段，移除本地 `updateStreak()` 调用 |
| 11 | **每日复习记录写入** | 在 `review/index.tsx` 末尾调用 `addReviewRecord()` 本地写入 | `POST /api/review/submit` 后端自动更新 `review_records` 集合 | **需迁移**：移除前端本地写入，依赖后端 |
| 12 | **卡片正面唯一性校验** | `card-edit` 中校验同一卡组内 `front` 不可重复 | 架构文档未提及此约束，Schema 无唯一索引 | 建议后端补充此校验（422 错误），或至少对齐文档说明 |

---

### 3.3 统计接口数据不对齐

| # | 前端展示字段 | 后端接口 | 差异说明 |
|---|-----------|---------|---------|
| 13 | `TodayStats`：`todayCount`（今日到期数）、`streak`、`deckCount`、`totalCards` | `GET /api/stats/overview` 返回 `todayDue`、`streak`、`deckCount`、`totalCards` | 字段名 `todayCount` vs `todayDue` 需对齐 |
| 14 | `StatsOverview`：`totalReviewed`（区间复习总数）、`activeDays`、`dailyAvg` | `GET /api/stats/overview` **不返回**这三个字段 | **缺失**：这三个字段由 `GET /api/stats/history` 返回，前端聚合计算；后端 overview 接口与首页统计栏数据不匹配 |
| 15 | 统计页 `CalendarHeatmap`：当月每天的复习数 | `GET /api/stats/history?days=30` 返回近 30 天 | 当月天数（最多31天）可能超出 30 天范围；月初时近 30 天跨两个月，热力图数据边界需处理 |

---

### 3.4 复习 Session 数据结构 Bug（前端内部不一致）

| # | 问题 | 位置 | 说明 |
|---|-----|------|------|
| 16 | **`deckId` vs `deckIds` 字段名不一致** | `home/index.tsx` 写入 `{ cards, source: 'home', deckIds: [...] }`；`review/index.tsx` 读取 `session.deckId` | 从首页发起的跨卡组复习，Session 中存的是 `deckIds`（数组），但 review 页只读 `deckId`（单值），导致 `deckId` 为 `undefined`，后续提交给后端时 `deckId` 会是空值 |
| 17 | **`POST /api/review/submit` 中 `deckId` 的语义** | 架构设计：`deckId` 为字符串（空字符串表示跨卡组）| 若同时复习多个卡组，单个 `deckId` 无法表达来源；架构设计需明确跨卡组复习时该字段的处理方式 |

---

## 四、迁移改造优先级汇总

### 高优先级（影响核心功能正确性）

1. **#2** 将 Deck 内嵌卡片结构改为通过 API 独立获取
2. **#3/#4** 时间戳类型适配（`number` ms → ISO 字符串）
3. **#9** 移除前端 SM-2 本地计算，改用后端 `updatedCards`
4. **#10/#11** 移除本地 Streak / ReviewRecord 写入
5. **#16** 修复首页复习 Session 中 `deckIds` 字段名，统一为 `deckId`（跨卡组时为空字符串）

### 中优先级（影响展示正确性）

6. **#6** 定义 `DisplayStatus` 与 `CardStatus` 的映射规则，对齐筛选逻辑
7. **#7** 后端明确 `mastered` 的计算标准（建议 `interval > 3`）
8. **#13** 统一 `todayCount` / `todayDue` 字段命名
9. **#14** `GET /api/stats/overview` 补充或拆分 `totalReviewed`、`activeDays`、`dailyAvg` 字段

### 低优先级（细节对齐）

10. **#1** 前端 `id` 字段适配后端 `_id` 的映射
11. **#8** 讨论是否保留"强制复习全部卡片"功能
12. **#12** 后端补充卡片 `front` 唯一性校验
13. **#15** 日历热力图的月份边界处理

---

## 五、前端 `DisplayStatus` ↔ `CardStatus` 映射参考

前端使用两套状态体系，迁移时需确认后端如何支持前端的 4 分类筛选：

| DisplayStatus（前端展示）| 派生逻辑（`getDisplayStatus`）| 对应 CardStatus（后端存储）|
|------------------------|------------------------------|--------------------------|
| 未学 | `repetitions === 0` | `new` |
| 不会 | `interval <= 1` | `learning`（部分重叠）|
| 模糊 | `interval <= 3` | `learning`（部分重叠）|
| 掌握 | `interval > 3` | `review` |

> **结论**：后端 `CardStatus` 无法精确对应前端的 4 种 `DisplayStatus`，`learning` 涵盖"不会"和"模糊"两种情况。若前端需保留 4 分类筛选，有两个方案：
> - 方案 A：后端 `GET /api/decks/:deckId/cards` 新增 `displayStatus` 参数，服务端根据 `interval` 派生过滤
> - 方案 B：前端获取全量卡片数据后在本地做二次筛选（保留当前逻辑，只是数据来源改为 API）
