# 闪卡后端系统设计文档

## 一、需求分析

### 当前状态
前端使用 Taro 本地存储（`wx.getStorageSync`）保存所有数据，需迁移至云端后端，支持多设备同步。

### 核心功能模块
| 模块 | 说明 |
|------|------|
| 用户认证 | 微信小程序 code 换取 JWT，标识用户身份 |
| 卡组管理 | 卡组的增删改查 |
| 卡片管理 | 卡片的增删改查、按状态筛选 |
| 复习系统 | 获取到期卡片、提交复习评分、SM-2 计算由后端执行 |
| 统计数据 | 复习历史、连续天数（Streak）、卡组掌握率 |

---

## 二、MongoDB Schema 设计

### 2.1 User

```
集合名：users

字段：
  _id           ObjectId      主键
  openid        String        微信 openid，唯一索引
  createdAt     Date          注册时间
  streak        Object        连续打卡数据
    current     Number        当前连续天数
    longest     Number        历史最长连续天数
    lastDate    String        最后复习日期 'YYYY-MM-DD'
```

### 2.2 Deck（卡组）

```
集合名：decks

字段：
  _id           ObjectId      主键
  userId        ObjectId      关联 users._id，索引
  name          String        卡组名称（同一用户不可重名）
  createdAt     Date          创建时间
  updatedAt     Date          最后更新时间

索引：
  { userId: 1, name: 1 }  唯一复合索引
```

### 2.3 Card（卡片）

```
集合名：cards

字段：
  _id           ObjectId      主键
  deckId        ObjectId      关联 decks._id，索引
  userId        ObjectId      关联 users._id，索引（便于跨卡组查询）
  front         String        正面内容（同一 deckId 内唯一，控制器层校验，重复返回 422）
  back          String        背面内容
  ease          Number        SM-2 难度因子，默认 2.5
  interval      Number        复习间隔（天），默认 1
  repetitions   Number        累计复习次数，默认 0
  nextReview    Date          下次复习时间，默认 now
  status        String        'new' | 'learning' | 'review'
  createdAt     Date          创建时间
  updatedAt     Date          最后更新时间

索引：
  { deckId: 1 }
  { userId: 1, nextReview: 1 }   用于查询所有到期卡片

掌握（mastered）定义：interval > 3
  用于统计各卡组掌握率（GET /api/decks、GET /api/stats/decks）
```

### 2.4 ReviewRecord（每日复习记录）

```
集合名：review_records

字段：
  _id           ObjectId      主键
  userId        ObjectId      关联 users._id
  date          String        日期 'YYYY-MM-DD'
  count         Number        当日复习卡片数

索引：
  { userId: 1, date: 1 }  唯一复合索引
```

---

## 三、RESTful 接口文档

### 通用规范

- Base URL：`/api`
- 所有请求需携带 Header：`Authorization: Bearer <JWT>`（登录接口除外）
- 统一响应格式：
  ```json
  { "code": 0, "message": "ok", "data": {} }
  ```
- 错误码约定：

| code | 含义 |
|------|------|
| 0 | 成功 |
| 401 | 未登录 / Token 失效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 422 | 参数校验失败 |
| 500 | 服务器内部错误 |

---

### 3.1 认证模块

#### POST /api/auth/login
微信登录，code 换取 JWT

**请求体**
```json
{ "code": "wx_login_code_from_wx.login()" }
```

**响应 data**
```json
{
  "token": "eyJhbGci...",
  "isNewUser": true
}
```

---

### 3.2 卡组模块

#### GET /api/decks
获取当前用户所有卡组（含卡片统计摘要）

**响应 data**
```json
[
  {
    "_id": "deck_id",
    "name": "英语单词",
    "createdAt": "2026-04-01T00:00:00.000Z",
    "stats": {
      "total": 20,
      "due": 5,
      "mastered": 8,
      "masteryRate": 40
    }
  }
]
```

---

#### POST /api/decks
创建卡组

**请求体**
```json
{ "name": "英语单词" }
```

**响应 data**
```json
{
  "_id": "deck_id",
  "name": "英语单词",
  "createdAt": "2026-04-13T00:00:00.000Z"
}
```

---

#### PUT /api/decks/:deckId
修改卡组名称

**请求体**
```json
{ "name": "新名称" }
```

**响应 data**
```json
{ "_id": "deck_id", "name": "新名称" }
```

---

#### DELETE /api/decks/:deckId
删除卡组（级联删除其下所有卡片）

**响应 data**
```json
{ "deletedCards": 12 }
```

---

### 3.3 卡片模块

#### GET /api/decks/:deckId/cards
获取卡组内所有卡片，支持按展示状态筛选

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | String | 否 | `new` / `learning` / `review`，不传返回全部 |

**响应 data**
```json
[
  {
    "_id": "card_id",
    "front": "apple",
    "back": "苹果",
    "ease": 2.5,
    "interval": 6,
    "repetitions": 2,
    "nextReview": "2026-04-15T00:00:00.000Z",
    "status": "learning",
    "createdAt": "2026-04-01T00:00:00.000Z"
  }
]
```

---

#### POST /api/decks/:deckId/cards
新建卡片

> 校验：同一卡组内 `front` 不可重复，重复返回 `code: 422`

**请求体**
```json
{ "front": "apple", "back": "苹果" }
```

**响应 data**
```json
{
  "_id": "card_id",
  "front": "apple",
  "back": "苹果",
  "ease": 2.5,
  "interval": 1,
  "repetitions": 0,
  "nextReview": "2026-04-13T00:00:00.000Z",
  "status": "new",
  "createdAt": "2026-04-13T00:00:00.000Z"
}
```

---

#### PUT /api/decks/:deckId/cards/:cardId
修改卡片正背面内容（不修改 SM-2 数据）

> 校验：同一卡组内 `front` 不可重复（排除自身），重复返回 `code: 422`

**请求体**
```json
{ "front": "apple", "back": "苹果（水果）" }
```

**响应 data**
```json
{ "_id": "card_id", "front": "apple", "back": "苹果（水果）" }
```

---

#### DELETE /api/decks/:deckId/cards/:cardId
删除卡片

**响应 data**
```json
{ "deleted": true }
```

---

### 3.4 复习模块

#### GET /api/review/due
获取到期需复习的卡片（`nextReview ≤ now`）

> 仅返回到期卡片。若需复习卡组内**全部**卡片（含未到期），请使用 `GET /api/decks/:deckId/cards`。

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deckId | String | 否 | 指定卡组，不传则跨所有卡组 |

**响应 data**
```json
{
  "cards": [
    {
      "_id": "card_id",
      "deckId": "deck_id",
      "front": "apple",
      "back": "苹果",
      "ease": 2.5,
      "interval": 1,
      "repetitions": 0,
      "nextReview": "2026-04-13T00:00:00.000Z",
      "status": "new"
    }
  ],
  "total": 15
}
```

---

#### POST /api/review/submit
提交本次复习结果，后端执行 SM-2 计算并更新卡片，同时更新当日复习记录和 Streak

**请求体**
```json
{
  "deckId": "deck_id_or_empty_string",
  "results": [
    { "cardId": "card_id_1", "quality": 5 },
    { "cardId": "card_id_2", "quality": 0 },
    { "cardId": "card_id_3", "quality": 3 }
  ]
}
```

> `quality`：0 = 不会，3 = 模糊，5 = 掌握

**响应 data**
```json
{
  "reviewed": 3,
  "streak": {
    "current": 7,
    "longest": 14,
    "lastDate": "2026-04-13"
  },
  "updatedCards": [
    {
      "_id": "card_id_1",
      "ease": 2.5,
      "interval": 6,
      "repetitions": 2,
      "nextReview": "2026-04-19T00:00:00.000Z",
      "status": "review"
    }
  ]
}
```

---

### 3.5 统计模块

#### GET /api/stats/overview
获取首页统计摘要（今日到期数、Streak、总卡组数、总卡片数）

> 字段名 `todayDue`（前端本地变量名为 `todayCount`，对接时注意映射）

**响应 data**
```json
{
  "todayDue": 5,
  "streak": 7,
  "deckCount": 3,
  "totalCards": 80
}
```

---

#### GET /api/stats/history
获取复习历史（折线图 / 日历热力图数据）

支持两种查询模式，二选一：

**模式一：近 N 天滚动窗口**（用于折线图）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | Number | 否 | 7 或 30，默认 7 |

**模式二：自然月**（用于日历热力图）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| year | Number | 是 | 年份，如 2026 |
| month | Number | 是 | 月份 1~12，如 4 |

> 两种模式均返回相同的响应格式，`totalReviewed`/`activeDays`/`dailyAvg` 基于所查询的时间范围计算。

**响应 data**
```json
{
  "records": [
    { "date": "2026-04-07", "count": 12 },
    { "date": "2026-04-08", "count": 0 },
    { "date": "2026-04-13", "count": 25 }
  ],
  "totalReviewed": 120,
  "activeDays": 6,
  "dailyAvg": 20
}
```

---

#### GET /api/stats/decks
获取各卡组掌握率（掌握率进度条数据）

**响应 data**
```json
{
  "deckStats": [
    {
      "deckId": "deck_id",
      "name": "英语单词",
      "total": 20,
      "mastered": 8,
      "masteryRate": 40
    }
  ]
}
```

---

## 四、模块文件结构

```
src/
├── routes/
│   ├── auth.js
│   ├── decks.js
│   ├── cards.js
│   ├── review.js
│   └── stats.js
├── controllers/
│   ├── authController.js
│   ├── deckController.js
│   ├── cardController.js
│   ├── reviewController.js
│   └── statsController.js
├── models/
│   ├── User.js
│   ├── Deck.js
│   ├── Card.js
│   └── ReviewRecord.js
├── middleware/
│   ├── auth.js          # JWT 验证中间件
│   └── errorHandler.js  # 全局错误处理
└── utils/
    ├── sm2.js           # SM-2 算法（从前端迁移）
    ├── wechat.js        # 微信 code2session 请求
    └── jwt.js           # Token 签发与校验
```

---

## 五、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| SM-2 计算位置 | **后端** | 保证数据一致性，防止客户端篡改 |
| Card 存储方式 | **独立集合**（非嵌入 Deck） | 支持跨卡组查询到期卡片，性能更好 |
| Streak 存储位置 | **User 文档内嵌** | 读写频率低，无需独立集合 |
| 认证方式 | **JWT（无状态）** | 微信小程序场景标准方案，无需 Session |
| 日期格式 | **'YYYY-MM-DD' 字符串** | 与前端保持一致，避免时区问题 |
| 卡片状态（CardStatus） | **后端存 3 种**（new/learning/review） | 存储语义清晰；前端展示时按 `interval` 本地派生 4 种 DisplayStatus（未学/不会/模糊/掌握），两套系统互不干扰 |
| 复习全部卡片 | **保留，复用卡片列表接口** | 前端"复习全部"功能调 `GET /api/decks/:deckId/cards` 获取全量卡片，无需新增接口 |
| 掌握（mastered）定义 | **interval > 3** | 与前端 `getDisplayStatus` 的"掌握"阈值保持一致 |
| front 唯一性校验 | **前后端都校验** | 后端兜底防止绕过，重复时返回 422 |

---

## 六、前端改造要点（供参考）

当前前端所有 `getDecks()` / `saveDecks()` 等本地存储调用，需替换为对应 HTTP 请求。SM-2 相关计算（`calculateNextReview`）在提交复习结果后由后端返回 `updatedCards`，前端直接使用后端数据渲染，无需本地计算。

**关键改造清单：**

| 改造点 | 说明 |
|-------|------|
| 时间戳类型 | 前端本地用毫秒数（`number`），后端返回 ISO 字符串；`isDue()` 等判断需改为 `new Date(card.nextReview).getTime() <= Date.now()` |
| SM-2 本地计算 | 移除 `review/index.tsx` 中的 `calculateNextReview` 调用，改用 `POST /api/review/submit` 返回的 `updatedCards` |
| Streak 本地更新 | 移除 `review-summary/index.tsx` 中的 `updateStreak()` 调用，改用 `POST /api/review/submit` 返回的 `streak` |
| ReviewRecord 本地写入 | 移除 `review/index.tsx` 中的 `addReviewRecord()` 调用，后端自动更新 |
| 复习 Session deckId 字段 | 首页跨卡组复习时，Session 中存 `deckId: ''`（空字符串），而非 `deckIds: []` 数组；修复 `home/index.tsx` 中的 bug |
| DisplayStatus 筛选 | 卡片列表筛选从 API 获取全量卡片后，在前端按 `getDisplayStatus()` 本地过滤，无需改后端接口 |
| 字段名映射 | 后端返回 `_id`（非 `id`）、`todayDue`（非 `todayCount`）|
