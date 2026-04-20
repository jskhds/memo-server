import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Card } from '../models/Card';
import { Deck } from '../models/Deck';
import { User } from '../models/User';
import { ReviewRecord } from '../models/ReviewRecord';
import { sendSuccess } from '../middleware/errorHandler';

/** 生成日期字符串 'YYYY-MM-DD'，offset=0 为今天，-1 为昨天 */
function getDateStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * GET /api/stats/overview
 * 获取首页统计摘要：今日到期数（todayDue）、当前 streak、卡组数、总卡片数
 */
export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.userId);
    const now = new Date();

    // 并行查询，减少等待时间
    const [todayDue, deckCount, totalCards, user] = await Promise.all([
      Card.countDocuments({ userId, nextReview: { $lte: now } }),
      Deck.countDocuments({ userId }),
      Card.countDocuments({ userId }),
      User.findById(userId).lean(),
    ]);

    sendSuccess(res, {
      todayDue,
      streak: user?.streak.current ?? 0,
      deckCount,
      totalCards,
    });
  } catch (err) {
    next(err);
  }
}

/** history 接口查询参数 Schema */
const historyQuerySchema = z
  .object({
    // 模式一：近 N 天滚动窗口
    days: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .pipe(z.union([z.literal(7), z.literal(30)]).optional()),
    // 模式二：自然月
    year: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .pipe(z.number().int().min(2000).max(2100).optional()),
    month: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .pipe(z.number().int().min(1).max(12).optional()),
  })
  .refine(
    (data) => {
      // year 和 month 必须同时提供或同时不提供
      const hasYear = data.year !== undefined;
      const hasMonth = data.month !== undefined;
      return hasYear === hasMonth;
    },
    { message: 'year 和 month 必须同时提供' },
  );

/**
 * GET /api/stats/history
 * 获取复习历史，支持两种模式：
 *   模式一：?days=7|30（默认 7）→ 近 N 天滚动窗口，用于折线图
 *   模式二：?year=2026&month=4 → 自然月，用于日历热力图
 * 两种模式均返回：records[]、totalReviewed、activeDays、dailyAvg
 */
export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.userId);
    const query = historyQuerySchema.parse(req.query);

    let dateRange: string[];

    if (query.year !== undefined && query.month !== undefined) {
      // 模式二：自然月
      const daysInMonth = new Date(query.year, query.month, 0).getDate();
      dateRange = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        return `${query.year}-${String(query.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      });
    } else {
      // 模式一：近 N 天滚动窗口（默认 7）
      const days = query.days ?? 7;
      dateRange = Array.from({ length: days }, (_, i) => getDateStr(-(days - 1 - i)));
    }

    // 查询该日期范围内的复习记录
    const reviewRecords = await ReviewRecord.find({
      userId,
      date: { $in: dateRange },
    }).lean();

    const recordMap = new Map(reviewRecords.map((r) => [r.date, r.count]));

    // 填充日期范围（无记录的日期补 count: 0）
    const records = dateRange.map((date) => ({
      date,
      count: recordMap.get(date) ?? 0,
    }));

    const totalReviewed = records.reduce((s, r) => s + r.count, 0);
    const activeDays = records.filter((r) => r.count > 0).length;
    const dailyAvg = activeDays > 0 ? Math.round(totalReviewed / activeDays) : 0;

    sendSuccess(res, { records, totalReviewed, activeDays, dailyAvg });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/stats/decks
 * 获取各卡组掌握率进度条数据
 * mastered 定义：interval > 3（与前端 DisplayStatus '掌握' 定义对齐）
 */
export async function getDeckStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.userId);

    // 查询用户所有卡组
    const decks = await Deck.find({ userId }).sort({ createdAt: 1 }).lean();

    if (decks.length === 0) {
      sendSuccess(res, { deckStats: [] });
      return;
    }

    const deckIds = decks.map((d) => d._id);

    // 聚合各卡组统计
    const stats = await Card.aggregate([
      { $match: { deckId: { $in: deckIds } } },
      {
        $group: {
          _id: '$deckId',
          total: { $sum: 1 },
          mastered: { $sum: { $cond: [{ $gt: ['$interval', 3] }, 1, 0] } },
        },
      },
    ]);

    const statsMap = new Map(stats.map((s) => [s._id.toString(), s]));

    const deckStats = decks.map((deck) => {
      const s = statsMap.get(deck._id.toString()) ?? { total: 0, mastered: 0 };
      const masteryRate = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0;
      return {
        deckId: deck._id,
        name: deck.name,
        total: s.total,
        mastered: s.mastered,
        masteryRate,
      };
    });

    sendSuccess(res, { deckStats });
  } catch (err) {
    next(err);
  }
}
