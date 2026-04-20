# 接口测试报告

测试日期：2026-04-13  
测试环境：本地开发（PORT=3001，MongoDB Atlas）  
认证方式：直接创建测试用户 + 手动签发 JWT（因无法在非微信环境调用 wx.login()）

---

## 测试结果总览

| 模块 | 接口 | 结果 |
|------|------|------|
| 基础 | GET /health | ✅ |
| 认证 | POST /api/auth/login — 缺少 code | ✅ 返回 422 |
| 认证 | POST /api/auth/login — 无效 code（微信拒绝）| ✅ 返回 422 |
| 认证 | 无 Token 访问受保护接口 | ✅ 返回 401 |
| 卡组 | GET /api/decks（空列表）| ✅ |
| 卡组 | POST /api/decks 创建 | ✅ |
| 卡组 | POST /api/decks 重复名称 | ✅ 返回 422 "已存在同名卡组" |
| 卡组 | PUT /api/decks/:id 修改名称 | ✅ |
| 卡组 | GET /api/decks（含统计摘要）| ✅ |
| 卡组 | DELETE /api/decks/:id（级联删除卡片）| ✅ 返回 deletedCards:1 |
| 卡片 | POST /api/decks/:id/cards 创建 | ✅ |
| 卡片 | POST /api/decks/:id/cards 重复 front | ✅ 返回 422 |
| 卡片 | GET /api/decks/:id/cards 全部 | ✅ 仅返回文档规定字段 |
| 卡片 | GET /api/decks/:id/cards?status=new | ✅ |
| 卡片 | PUT /api/decks/:id/cards/:id 修改内容 | ✅ |
| 卡片 | DELETE /api/decks/:id/cards/:id | ✅ |
| 复习 | GET /api/review/due 全部到期 | ✅ |
| 复习 | GET /api/review/due?deckId 指定卡组 | ✅ |
| 复习 | POST /api/review/submit quality=5 | ✅ SM-2 计算、streak 更新正确 |
| 复习 | POST /api/review/submit 非法 cardId 格式 | ✅ 返回 422 |
| 复习 | POST /api/review/submit 无权限卡片 | ✅ 返回 403 |
| 统计 | GET /api/stats/overview | ✅ 字段：todayDue/streak/deckCount/totalCards |
| 统计 | GET /api/stats/history?days=7 | ✅ 含 records/totalReviewed/activeDays/dailyAvg |
| 统计 | GET /api/stats/history?year=2026&month=4 | ✅ 返回 30 天自然月数据 |
| 统计 | GET /api/stats/history?year=2026（缺 month）| ✅ 返回 422 |
| 统计 | GET /api/stats/history?month=13（越界）| ✅ 返回 422 |
| 统计 | GET /api/stats/decks | ✅ 含 masteryRate |

**总计：28 项 / 28 项通过，0 项失败。**

---

## 关键行为验证

### SM-2 计算验证
提交 quality=5（掌握），初始卡片（repetitions=0, ease=2.5, interval=1）：
- 期望：repetitions=1, interval=1, ease≈2.6, status=learning
- 实际：repetitions=1, interval=1, ease=2.6, status=learning ✅

### Streak 更新验证
首次复习后：current=1, longest=1, lastDate=今天 ✅

### 级联删除验证
删除卡组后，关联卡片同步删除（deletedCards=1），GET /api/decks 返回空列表 ✅

### 字段投影验证
GET /api/decks/:id/cards 响应不含 userId、deckId、__v、updatedAt ✅

### 错误码验证
| 场景 | HTTP 状态 | code 字段 |
|------|---------|---------|
| 无 Token | 401 | 401 |
| 无效 Token | 401 | 401 |
| 参数校验失败 | 422 | 422 |
| 重复名称/front | 422 | 422 |
| 无权限卡片 | 403 | 403 |
| 资源不存在 | 404 | 404 |

---

## 备注

- `POST /api/auth/login` 的完整微信登录流程（真实 wx.login() code）未在本环境测试，需在微信开发者工具中联调验证。
- 所有其他接口均通过真实 MongoDB Atlas 连接完成测试，数据落库已确认。
