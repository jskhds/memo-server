import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Card } from '../models/Card';
import { User } from '../models/User';
import { ReviewRecord } from '../models/ReviewRecord';
import { calculateSM2, ReviewQuality, SM2Result } from '../utils/sm2';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/** MongoDB ObjectId 格式：24 位十六进制字符串 */
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/** 获取今日日期字符串 'YYYY-MM-DD'（服务器本地时区） */
function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 昨日日期字符串 */
function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 复习提交请求体 Schema */
const submitSchema = z.object({
  // 空字符串表示跨卡组复习，后端不依赖此字段做查询
  deckId: z.string(),
  results: z
    .array(
      z.object({
        // P1 修复：校验 ObjectId 格式，避免 new Types.ObjectId() 抛出 BSONError → 500
        cardId: z
          .string()
          .regex(OBJECT_ID_REGEX, 'cardId 格式不正确，需为 24 位十六进制字符串'),
        quality: z.union([z.literal(0), z.literal(3), z.literal(5)]),
      }),
    )
    .min(1, '至少需要一条复习结果'),
});

/**
 * GET /api/review/due
 * 获取到期需复习的卡片（nextReview <= now）
 * 可选 ?deckId 限定卡组；不传则跨所有卡组
 */
export async function getDueCards(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.userId);
    const { deckId } = req.query;
    const now = new Date();

    const filter: Record<string, unknown> = { userId, nextReview: { $lte: now } };
    if (deckId && typeof deckId === 'string' && Types.ObjectId.isValid(deckId)) {
      filter.deckId = new Types.ObjectId(deckId);
    }

    const cards = await Card.find(filter)
      .select('front back ease interval repetitions nextReview status deckId')
      .lean();

    sendSuccess(res, { cards, total: cards.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/review/submit
 * 提交本次复习结果：
 *   1. 校验请求体（含 cardId ObjectId 格式）
 *   2. 批量查询卡片并校验归属
 *   3. 对每张卡片执行 SM-2 计算，结果缓存后批量写入
 *   4. 更新当日 ReviewRecord（upsert）
 *   5. 更新 User.streak
 *   6. 返回 { reviewed, streak, updatedCards }
 */
export async function submitReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.userId);
    // 1. 参数校验（Zod 自动处理 cardId 格式错误 → ZodError → 422）
    const { results } = submitSchema.parse(req.body);

    const cardIds = results.map((r) => new Types.ObjectId(r.cardId));

    // 2. 批量查询卡片，同时校验归属（userId 必须匹配）
    const cards = await Card.find({ _id: { $in: cardIds }, userId }).lean();

    if (cards.length !== results.length) {
      sendError(res, 403, '部分卡片不存在或无权限');
      return;
    }

    const cardMap = new Map(cards.map((c) => [c._id.toString(), c]));

    // 3. SM-2 计算并缓存结果，避免后续重复计算（P2 修复）
    const sm2Map = new Map<string, SM2Result>();
    const bulkOps = results.map((r) => {
      const card = cardMap.get(r.cardId)!;
      const sm2 = calculateSM2(card, r.quality as ReviewQuality);
      sm2Map.set(r.cardId, sm2); // 缓存，供构建响应时复用
      return {
        updateOne: {
          filter: { _id: card._id },
          update: {
            $set: {
              ease: sm2.ease,
              interval: sm2.interval,
              repetitions: sm2.repetitions,
              nextReview: sm2.nextReview,
              status: sm2.status,
            },
          },
        },
      };
    });

    await Card.bulkWrite(bulkOps);

    // 4. 更新当日 ReviewRecord（upsert，count 累加）
    const today = getTodayStr();
    await ReviewRecord.findOneAndUpdate(
      { userId, date: today },
      { $inc: { count: results.length } },
      { upsert: true },
    );

    // 5. 更新 User.streak
    const user = await User.findById(userId);
    if (!user) throw new Error('用户不存在');

    const streak = user.streak;
    const yesterday = getYesterdayStr();

    if (streak.lastDate !== today) {
      if (streak.lastDate === yesterday) {
        // 昨日已复习：连续天数 +1
        streak.current += 1;
      } else {
        // 中断或首次：重置为 1
        streak.current = 1;
      }
      streak.longest = Math.max(streak.longest, streak.current);
      streak.lastDate = today;
      await user.save();
    }

    // 6. 复用缓存的 SM-2 结果构建响应，不重复计算
    const updatedCards = results.map((r) => {
      const sm2 = sm2Map.get(r.cardId)!;
      return {
        _id: cardMap.get(r.cardId)!._id,
        ease: sm2.ease,
        interval: sm2.interval,
        repetitions: sm2.repetitions,
        nextReview: sm2.nextReview,
        status: sm2.status,
      };
    });

    logger.info('提交复习', { userId: req.userId, count: results.length });

    sendSuccess(res, {
      reviewed: results.length,
      streak: {
        current: streak.current,
        longest: streak.longest,
        lastDate: streak.lastDate,
      },
      updatedCards,
    });
  } catch (err) {
    next(err);
  }
}
