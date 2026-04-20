# 卡组模块代码审查报告

审查范围：`src/models/Deck.ts`、`src/controllers/deckController.ts`、`src/routes/decks.ts`

整体评价：接口与设计文档完全对齐，鉴权和归属校验到位，逻辑清晰。发现 3 个问题，均不阻塞功能。

---

## 问题列表

---

### 🟡 中等 — 建议修复

#### P1：`deleteDeck` — 三步删除操作非原子，存在部分失败风险

**位置**：`src/controllers/deckController.ts:142-150`

**问题**：
```ts
const deck = await Deck.findOne({ _id: deckId, userId });   // 步骤1
const { deletedCount } = await Card.deleteMany({ deckId });  // 步骤2
await deck.deleteOne();                                       // 步骤3
```
步骤 2 成功、步骤 3 失败时，卡片已删除但卡组仍存在，造成空卡组；反之若步骤 3 先成功而步骤 2 失败（极罕见），卡片成为孤儿数据。在不引入 MongoDB 事务的情况下，可调整顺序降低风险：**先删卡组，再删卡片**。卡组不在则前端视为成功，孤儿卡片不影响用户可见数据，可通过后台定期清理。

**修改建议**：调换步骤 2 和步骤 3 的顺序：
```ts
// 先删卡组（关键操作先做）
await Deck.deleteOne({ _id: deckId, userId });
// 再删卡片（即使失败也只是孤儿数据，不影响用户体验）
const { deletedCount } = await Card.deleteMany({ deckId });
```
同时去掉多余的 `findOne` 查询，合并为：
```ts
const deleted = await Deck.findOneAndDelete({ _id: deckId, userId });
if (!deleted) { sendError(res, 404, '卡组不存在'); return; }
const { deletedCount } = await Card.deleteMany({ deckId });
```

---

#### P2：`models/Deck.ts:17` — `userId` 单字段索引冗余

**位置**：`src/models/Deck.ts:17`

**问题**：
```ts
userId: {
  type: Schema.Types.ObjectId,
  index: true,        // 冗余
},
// ...
DeckSchema.index({ userId: 1, name: 1 }, { unique: true }); // 复合索引前缀已覆盖 userId 查询
```
MongoDB 复合索引 `{ userId: 1, name: 1 }` 的前缀 `userId` 已可支持 `{ userId }` 的单字段查询，`index: true` 会在同一字段上额外建一个普通索引，造成写入时多维护一个索引，徒增开销。（与认证模块 P3 问题相同性质）

**修改建议**：删除 `userId` 字段定义中的 `index: true`。

---

### 🟢 轻微 — 可改可不改

#### P3：`createDeck` / `updateDeck` — 同名错误提示语不够具体

**位置**：`src/controllers/deckController.ts:83`、`src/controllers/deckController.ts:109`

**问题**：当触发 MongoDB 11000 重复键错误时，`errorHandler` 统一返回 `'数据已存在，请勿重复创建'`。对于卡组场景，前端展示给用户的提示应更具体（"已存在同名卡组"），目前的通用消息用户体验略差。

**修改建议**：在 `deckController` 中捕获 MongoServerError 11000 并返回更具体的消息：
```ts
import { MongoServerError } from 'mongodb';

// 在 catch 块中
if (err instanceof MongoServerError && err.code === 11000) {
  sendError(res, 422, '已存在同名卡组');
  return;
}
next(err);
```

---

## 总结

| 编号 | 严重程度 | 文件 | 是否阻塞上线 |
|------|---------|------|------------|
| P1 | 🟡 中等 | deckController.ts | 否（极低概率场景，但可用一行代码优化） |
| P2 | 🟡 中等 | models/Deck.ts | 否（功能正常，索引冗余影响写性能） |
| P3 | 🟢 轻微 | deckController.ts | 否（功能正常，错误提示不够精确） |

无严重安全或逻辑问题，P1 建议优先修复。
