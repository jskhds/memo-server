# 卡片模块代码审查报告

审查范围：`src/models/Card.ts`、`src/controllers/cardController.ts`、`src/routes/cards.ts`

整体评价：接口逻辑正确，鉴权和归属校验完整，front 唯一性校验已实现。发现 2 个问题，P1 需修复。

---

## 问题列表

---

### 🟡 中等 — 建议修复

#### P1：`getCards` — 响应返回多余字段，与设计文档不符

**位置**：`src/controllers/cardController.ts:58`

**问题**：
```ts
const cards = await Card.find(filter).sort({ createdAt: 1 }).lean();
sendSuccess(res, cards); // 直接返回原始文档
```
`.lean()` 返回的原始 MongoDB 文档包含 `userId`、`deckId`、`updatedAt`、`__v` 等字段，而设计文档的响应只有：`_id`、`front`、`back`、`ease`、`interval`、`repetitions`、`nextReview`、`status`、`createdAt`。

多余字段问题：
- `__v`：Mongoose 版本号，对前端无意义
- `userId`：内部字段，前端已通过 JWT 知道自己的身份，暴露无必要
- `deckId`：前端已通过 URL 参数知道 deckId，多余
- `updatedAt`：设计文档未包含此字段

`createCard` 的响应已手动挑选字段（正确），`getCards` 应保持一致。

**修改建议**：在查询时加字段投影：
```ts
const cards = await Card.find(filter)
  .select('front back ease interval repetitions nextReview status createdAt')
  .sort({ createdAt: 1 })
  .lean();
```

---

### 🟢 轻微 — 可改可不改

#### P2：`createCard` / `updateCard` — front 唯一性检查存在极低概率竞争条件

**位置**：`src/controllers/cardController.ts:80-84`、`136-144`

**问题**：`findOne` 检查存在性后再 `create`/`update`，两步之间存在极低概率的并发窗口。与认证模块 P1 性质相同，但对于闪卡应用场景（单用户低并发写入），实际触发概率极低。

架构文档明确说明该校验在"控制器层"执行，当前实现符合设计意图，仅作记录。

若要彻底消除：可在 Card Schema 上添加 `{ deckId, front }` 唯一复合索引，由数据库层强制保证。但这会改变 Schema 设计，需 Architect 确认。

---

## 总结

| 编号 | 严重程度 | 文件 | 是否阻塞上线 |
|------|---------|------|------------|
| P1 | 🟡 中等 | cardController.ts | 否（功能正常，响应字段与文档不符） |
| P2 | 🟢 轻微 | cardController.ts | 否（极低概率场景，符合设计意图） |

卡片模块整体质量良好，仅需修复 P1 的响应字段过滤。
