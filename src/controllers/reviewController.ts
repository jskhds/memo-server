import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { ICard, Card } from '../models/Card';
import { User } from '../models/User';
import { ReviewRecord } from '../models/ReviewRecord';
import { calculateSM2, ReviewQuality, SM2Result } from '../utils/sm2';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/** MongoDB ObjectId 格式：24 位十六进制字符串 */
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
        cardId: z.string().regex(OBJECT_ID_REGEX, 'cardId 格式不正确，需为 24 位十六进制字符串'),
        quality: z.union([z.literal(0), z.literal(3), z.literal(5)]),
      }),
    )
    .min(1, '至少需要一条复习结果'),
});

type ReviewResult = { cardId: string; quality: ReviewQuality };

/** 批量查询卡片并校验归属，归属不合法时返回 null */
async function fetchAndValidateCards(
  userId: Types.ObjectId,
  results: ReviewResult[],
): Promise<Map<string, ICard> | null> {
  const cardIds = results.map((r) => new Types.ObjectId(r.cardId));
  const cards = await Card.find({ _id: { $in: cardIds }, userId }).lean();
  if (cards.length !== results.length) return null;
  return new Map(cards.map((c) => [c._id.toString(), c]));
}

/** SM-2 计算 + 批量写库，返回 cardId → SM2Result 的 Map */
async function applyReviewSM2(
  results: ReviewResult[],
  cardMap: Map<string, ICard>,
): Promise<Map<string, SM2Result>> {
  const sm2Map = new Map<string, SM2Result>();
  const bulkOps = results.map((r) => {
    const card = cardMap.get(r.cardId)!;
    const sm2 = calculateSM2(card, r.quality);
    sm2Map.set(r.cardId, sm2);
    return {
      updateOne: {
        filter: { _id: card._id },
        update: { $set: { ease: sm2.ease, interval: sm2.interval, repetitions: sm2.repetitions, nextReview: sm2.nextReview, status: sm2.status } },
      },
    };
  });
  await Card.bulkWrite(bulkOps);
  return sm2Map;
}

/** 更新当日复习记录（upsert，count 累加） */
async function recordDailyReview(userId: Types.ObjectId, count: number): Promise<void> {
  await ReviewRecord.findOneAndUpdate(
    { userId, date: getTodayStr() },
    { $inc: { count } },
    { upsert: true },
  );
}

/** 更新连续打卡 streak，返回最新 streak 数据 */
async function updateStreak(
  userId: Types.ObjectId,
): Promise<{ current: number; longest: number; lastDate: string }> {
  const user = await User.findById(userId);
  if (!user) throw new Error('用户不存在');

  const streak = user.streak;
  const today = getTodayStr();

  if (streak.lastDate !== today) {
    streak.current = streak.lastDate === getYesterdayStr() ? streak.current + 1 : 1;
    streak.longest = Math.max(streak.longest, streak.current);
    streak.lastDate = today;
    await user.save();
  }

  return { current: streak.current, longest: streak.longest, lastDate: streak.lastDate };
}

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
      .select(
        'front back ease interval repetitions nextReview status deckId reading romaji   meaning  ',
      )
      .lean();

    sendSuccess(res, { cards, total: cards.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/review/submit
 */
export async function submitReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.userId);
    const { results } = submitSchema.parse(req.body);

    const cardMap = await fetchAndValidateCards(userId, results as ReviewResult[]);
    if (!cardMap) {
      sendError(res, 403, '部分卡片不存在或无权限');
      return;
    }

    const [sm2Map, streak] = await Promise.all([
      applyReviewSM2(results as ReviewResult[], cardMap),
      recordDailyReview(userId, results.length).then(() => updateStreak(userId)),
    ]);

    const updatedCards = results.map((r) => ({
      _id: cardMap.get(r.cardId)!._id,
      ...sm2Map.get(r.cardId)!,
    }));

    logger.info('提交复习', { userId: req.userId, count: results.length });
    sendSuccess(res, { reviewed: results.length, streak, updatedCards });
  } catch (err) {
    next(err);
  }
}
