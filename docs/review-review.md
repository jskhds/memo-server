# 复习模块代码审查报告

审查范围：`src/utils/sm2.ts`、`src/models/ReviewRecord.ts`、`src/controllers/reviewController.ts`、`src/routes/review.ts`

整体评价：SM-2 算法与前端原实现一致，接口与设计文档对齐，鉴权和归属校验到位。发现 2 个问题，P1 需修复。

---

## 问题列表

---

### 🔴 严重 — 必须修复

#### P1：`submitReview:87` — 非法 cardId 格式导致 BSONError → 500

**位置**：`src/controllers/reviewController.ts:87`

**问题**：
```ts
const cardIds = results.map((r) => new Types.ObjectId(r.cardId));
```
Zod schema 只校验 `cardId` 为非空字符串，未校验是否为合法 ObjectId 格式（24 位十六进制）。若客户端传入如 `"invalid-id"` 的值，`new Types.ObjectId(r.cardId)` 会抛出同步 `BSONError`，被外层 try/catch 捕获后进入 `errorHandler`，返回 **500 "服务器内部错误"**。

客户端传入格式非法的 ID 属于请求参数错误，应返回 **422**，不应是 500。

**修改建议**：在 Zod schema 中对 `cardId` 增加 ObjectId 格式校验：
```ts
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const submitSchema = z.object({
  deckId: z.string(),
  results: z.array(
    z.object({
      cardId: z.string().regex(objectIdRegex, 'cardId 格式不正确'),
      quality: z.union([z.literal(0), z.literal(3), z.literal(5)]),
    }),
  ).min(1, '至少需要一条复习结果'),
});
```
Zod 校验失败会抛出 `ZodError`，`errorHandler` 已正确处理为 422。

---

### 🟡 中等 — 建议修复

#### P2：`submitReview:101-163` — SM-2 对同一张卡片计算了两次

**位置**：`src/controllers/reviewController.ts:101-120`（bulkOps）和 `153-163`（updatedCards）

**问题**：
```ts
// 第一次：构建 bulkOps（第 101-120 行）
const bulkOps = results.map((r) => {
  const sm2 = calculateSM2(card, r.quality as ReviewQuality);
  ...
});

// 第二次：构建响应（第 153-163 行）
const updatedCards = results.map((r) => {
  const sm2 = calculateSM2(card, r.quality as ReviewQuality);  // 重复计算
  ...
});
```
SM-2 对同一张卡片计算了两次，输入相同则结果相同，但属于冗余计算，且若将来修改算法时容易遗漏其中一处，造成写入数据库和返回给前端的结果不一致。

**修改建议**：在第一次计算时缓存结果，第二次直接复用：
```ts
// 构建 bulkOps 时同时缓存 SM-2 结果
const sm2Map = new Map<string, SM2Result>();
const bulkOps = results.map((r) => {
  const card = cardMap.get(r.cardId)!;
  const sm2 = calculateSM2(card, r.quality as ReviewQuality);
  sm2Map.set(r.cardId, sm2);  // 缓存
  return { updateOne: { ... } };
});

// 构建响应时直接取缓存
const updatedCards = results.map((r) => {
  const sm2 = sm2Map.get(r.cardId)!;
  return { _id: cardMap.get(r.cardId)!._id, ...sm2 };
});
```

---

## 总结

| 编号 | 严重程度 | 文件 | 是否阻塞上线 |
|------|---------|------|------------|
| P1 | 🔴 严重 | reviewController.ts | 是（格式非法 ID 返回 500，误导客户端） |
| P2 | 🟡 中等 | reviewController.ts | 否（功能正确，存在重复计算和潜在数据不一致风险） |

P1 需在继续开发前修复。
