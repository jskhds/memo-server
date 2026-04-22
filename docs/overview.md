## 项目结构

```
src/
├── routes/         # 路由（auth, cards, decks, review, stats, lookup, tts）
├── controllers/    # 控制器
├── models/         # MongoDB Schema
├── middleware/     # 中间件（auth, errorHandler）
└── utils/          # 工具函数（dict.ts, logger.ts）
data/
└── jmdict.json     # 本地日语词典（42MB，不入 git）
public/
└── audio/          # 五十音静态 mp3（103 个，按罗马音命名）
```

## Card 模型扩展字段

`Card` 新增 5 个可选字段（`src/models/Card.ts`）：

| 字段      | 类型     | 说明                        |
| --------- | -------- | --------------------------- |
| `reading` | `string` | 假名读音（如 「すちーむ」） |
| `romaji`  | `string` | 罗马音（如 `suchīmu`）      |
| `meaning` | `string` | 词义（英文，来自 JMdict）   |

`pitch` 和 `example` 字段在 `/api/lookup` 响应中已移除（JMdict 无此数据）。

## 接口说明

### GET /api/lookup?word=xxx

本地 JMdict 查词，无外部请求。返回：

```json
{ "code": 0, "data": { "reading": "...", "romaji": "...", "meaning": "..." } }
```

- 纯假名输入（`isKana` 判断）：直接返回 `reading=word`，`romaji=toRomaji(word)`
- 五十音（あ～ん / ア～ン）：`meaning` 为 `"平假名·あ行·a"` 格式

### POST /api/tts

讯飞 WebSocket TTS，语音 `x_yuki`（日语女声），MD5 内存缓存。返回：

```json
{ "code": 0, "data": { "audio": "<base64 mp3>", "format": "mp3" } }
```

### GET /audio/:file.mp3

静态文件服务，`public/audio/` 目录，供五十音直接播放。

### POST /api/decks/:deckId/cards/batch

批量创建卡片，`batchCreateCards` controller，使用 `Card.insertMany()`。

## 音频策略

前端复习页（`review/index.tsx`）：

1. `card.romaji` 在 `KANA_AUDIO_SET`（103 个罗马音）→ 直接拉 `/audio/{romaji}.mp3`
2. 否则 → 调 `POST /api/tts` 获取 base64，写本地临时文件再播放

## 本地词典（data/jmdict.json）

- 来源：JMdict-all 处理为紧凑 JSON（459,304 条）
- 格式：`{ "word": { "reading": "...", "meaning": "..." } }`
- 五十音覆盖：92 个假名（平 46 + 片 46）已写入正确含义，覆盖原词典错误条目
- 文件大小 42MB，已加入 `.gitignore`，部署时需单独上传
