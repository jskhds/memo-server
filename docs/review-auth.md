# 认证模块代码审查报告

审查范围：`src/models/User.ts`、`src/utils/wechat.ts`、`src/utils/jwt.ts`、`src/middleware/auth.ts`、`src/controllers/authController.ts`、`src/middleware/errorHandler.ts`

---

## 问题列表（按严重程度排序）

---

### 🔴 严重 — 必须修复

#### P1：`authController.ts` — 两次数据库查询存在竞争条件

**位置**：`src/controllers/authController.ts:27-34`

**问题**：
```ts
const existingUser = await User.findOne({ openid });      // 第一次查询
const isNewUser = !existingUser;

const user = await User.findOneAndUpdate(                 // 第二次查询
  { openid },
  { $setOnInsert: { openid } },
  { upsert: true, new: true },
);
```
两次查询之间如果有并发请求，可能导致 `isNewUser` 判断错误（A 请求 findOne 返回 null，B 请求先插入，A 请求 findOneAndUpdate 拿到已有文档，但 `isNewUser` 仍为 `true`）。同时这是不必要的两次 DB 往返。

**修改建议**：使用单次 `findOneAndUpdate` 配合 `includeResultMetadata: true`，通过 `result.lastErrorObject.updatedExisting` 判断是否新用户：
```ts
const result = await User.findOneAndUpdate(
  { openid },
  { $setOnInsert: { openid } },
  { upsert: true, new: true, includeResultMetadata: true },
);
const isNewUser = !result.lastErrorObject?.updatedExisting;
const user = result.value;
```

---

#### P2：`authController.ts` — 微信 code 失效时错误归类为 500

**位置**：`src/controllers/authController.ts:46-48` + `src/utils/wechat.ts:43`

**问题**：微信 `code2session` 失败（code 过期、无效）时，`wechat.ts` 抛出普通 `Error`，经过 `errorHandler` 被归类为 500 返回给前端。前端会误认为是服务器故障，实际是客户端传入了无效 code，应返回 422。

**修改建议**：在 `wechat.ts` 中抛出自定义错误类，或在 `authController.ts` 中捕获微信错误单独处理：
```ts
// 方案：authController.ts 中区分微信错误
try {
  openid = await code2session(code);
} catch (err) {
  // 微信接口错误属于客户端 code 无效，返回 422
  sendError(res, 422, '微信登录失败，code 无效或已过期');
  return;
}
```

---

### 🟡 中等 — 建议修复

#### P3：`models/User.ts:32` — `openid` 字段重复设置索引

**位置**：`src/models/User.ts:32`

**问题**：
```ts
openid: {
  type: String,
  required: true,
  unique: true,   // unique 已自动创建索引
  index: true,    // 重复，多余
},
```
`unique: true` 已自动在 MongoDB 上创建唯一索引，再加 `index: true` 会尝试创建第二个普通索引，可能引起 Mongoose 警告。

**修改建议**：删除 `index: true`，只保留 `unique: true`。

---

#### P4：`utils/jwt.ts:21` — `expiresIn` 类型断言不精确

**位置**：`src/utils/jwt.ts:21`

**问题**：
```ts
return jwt.sign({ userId }, secret, { expiresIn } as jwt.SignOptions);
```
用 `as jwt.SignOptions` 整体断言绕过了类型检查。`expiresIn` 的类型是 `string`，但 `jwt.SignOptions.expiresIn` 类型是 `string | number`，直接写更安全。

**修改建议**：
```ts
return jwt.sign({ userId }, secret, { expiresIn: expiresIn });
```

---

### 🟢 轻微 — 可改可不改

#### P5：`middleware/auth.ts:33` — catch 块未记录 JWT 错误类型

**位置**：`src/middleware/auth.ts:33`

**问题**：
```ts
} catch {
  sendError(res, 401, 'Token 已失效，请重新登录');
}
```
空 catch 块丢弃了具体错误信息，无法从日志区分 `TokenExpiredError`（token 过期）和 `JsonWebTokenError`（token 被篡改），排查问题时信息不足。

**修改建议**：
```ts
} catch (err) {
  logger.debug('JWT 验证失败', { error: (err as Error).message });
  sendError(res, 401, 'Token 已失效，请重新登录');
}
```

---

## 总结

| 编号 | 严重程度 | 文件 | 是否阻塞上线 |
|------|---------|------|------------|
| P1 | 🔴 严重 | authController.ts | 是（并发场景下数据不一致） |
| P2 | 🔴 严重 | authController.ts + wechat.ts | 是（错误码误导前端） |
| P3 | 🟡 中等 | models/User.ts | 否（功能正常，有 Mongoose 警告） |
| P4 | 🟡 中等 | utils/jwt.ts | 否（功能正常，类型不安全） |
| P5 | 🟢 轻微 | middleware/auth.ts | 否（功能正常，可观测性差） |

P1、P2 需修复后再继续后续模块开发。
