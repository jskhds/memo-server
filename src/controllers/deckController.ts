import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { Deck } from '../models/Deck';
import { Card } from '../models/Card';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/** 卡组名称请求体 Schema（新建和编辑共用） */
const deckNameSchema = z.object({
  name: z.string().min(1, '卡组名称不能为空').max(50, '卡组名称最多 50 个字符').trim(),
});

/**
 * 判断是否为 MongoDB 重复键错误（11000）
 */
function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

/**
 * GET /api/decks
 * 获取当前用户所有卡组，含每个卡组的卡片统计摘要（total、due、mastered、masteryRate）
 */
export async function getDecks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.userId);
    const now = new Date();

    // 查询用户所有卡组
    const decks = await Deck.find({ userId }).sort({ createdAt: 1 }).lean();

    if (decks.length === 0) {
      sendSuccess(res, []);
      return;
    }

    const deckIds = decks.map((d) => d._id);

    // 聚合每个卡组的卡片统计
    const stats = await Card.aggregate([
      { $match: { deckId: { $in: deckIds } } },
      {
        $group: {
          _id: '$deckId',
          total: { $sum: 1 },
          // 到期卡片：nextReview <= now
          due: { $sum: { $cond: [{ $lte: ['$nextReview', now] }, 1, 0] } },
          // 掌握卡片：interval > 3（与前端 DisplayStatus '掌握' 定义对齐）
          mastered: { $sum: { $cond: [{ $gt: ['$interval', 3] }, 1, 0] } },
        },
      },
    ]);

    // 将统计结果转为 Map，方便按 deckId 查找
    const statsMap = new Map(stats.map((s) => [s._id.toString(), s]));

    const result = decks.map((deck) => {
      const s = statsMap.get(deck._id.toString()) ?? { total: 0, due: 0, mastered: 0 };
      const masteryRate = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0;
      return {
        _id: deck._id,
        name: deck.name,
        createdAt: deck.createdAt,
        stats: {
          total: s.total,
          due: s.due,
          mastered: s.mastered,
          masteryRate,
        },
      };
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/decks
 * 创建新卡组
 */
export async function createDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name } = deckNameSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    const deck = await Deck.create({ userId, name });

    logger.info('创建卡组', { userId: req.userId, deckId: deck._id, name });
    sendSuccess(res, { _id: deck._id, name: deck.name, createdAt: deck.createdAt });
  } catch (err) {
    // 同名卡组：返回具体提示而非通用的"数据已存在"
    if (isDuplicateKeyError(err)) {
      sendError(res, 422, '已存在同名卡组');
      return;
    }
    next(err);
  }
}

/**
 * PUT /api/decks/:deckId
 * 修改卡组名称
 */
export async function updateDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deckId } = req.params;
    const { name } = deckNameSchema.parse(req.body);
    const userId = new Types.ObjectId(req.userId);

    if (!Types.ObjectId.isValid(deckId)) {
      sendError(res, 404, '卡组不存在');
      return;
    }

    // 查找并更新，同时校验归属（userId 必须匹配）
    const deck = await Deck.findOneAndUpdate(
      { _id: deckId, userId },
      { name },
      { new: true, runValidators: true },
    );

    if (!deck) {
      sendError(res, 404, '卡组不存在');
      return;
    }

    logger.info('更新卡组', { userId: req.userId, deckId, name });
    sendSuccess(res, { _id: deck._id, name: deck.name });
  } catch (err) {
    // 改名后与其他卡组重名
    if (isDuplicateKeyError(err)) {
      sendError(res, 422, '已存在同名卡组');
      return;
    }
    next(err);
  }
}

/**
 * DELETE /api/decks/:deckId
 * 删除卡组，级联删除其下所有卡片
 * 操作顺序：先删卡组（关键操作），再删卡片（即使失败也只剩孤儿数据，不影响用户可见状态）
 */
export async function deleteDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deckId } = req.params;
    const userId = new Types.ObjectId(req.userId);

    if (!Types.ObjectId.isValid(deckId)) {
      sendError(res, 404, '卡组不存在');
      return;
    }

    // 原子查找并删除卡组（同时校验归属），避免多余的 findOne 查询
    const deleted = await Deck.findOneAndDelete({ _id: deckId, userId });
    if (!deleted) {
      sendError(res, 404, '卡组不存在');
      return;
    }

    // 级联删除该卡组下所有卡片
    const { deletedCount } = await Card.deleteMany({ deckId });

    logger.info('删除卡组', { userId: req.userId, deckId, deletedCards: deletedCount });
    sendSuccess(res, { deletedCards: deletedCount });
  } catch (err) {
    next(err);
  }
}
