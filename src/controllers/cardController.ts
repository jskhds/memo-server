import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Card, CardStatus } from '../models/Card';
import { Deck } from '../models/Deck';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/** 卡片内容请求体 Schema（新建和编辑共用） */
const cardContentSchema = z.object({
  front: z.string().min(1, 'front 不能为空').max(500, 'front 最多 500 个字符').trim(),
  back: z.string().min(1, 'back 不能为空').max(2000, 'back 最多 2000 个字符').trim(),
  reading: z.string().max(200).trim().optional(),
  romaji: z.string().max(200).trim().optional(),
  pitch: z.number().int().min(0).max(4).optional(),
  meaning: z.string().max(500).trim().optional(),
  example: z.string().max(1000).trim().optional(),
});

/** 批量创建卡片请求体 Schema */
const batchCreateSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(1).max(500).trim(),
        back: z.string().min(1).max(2000).trim(),
        reading: z.string().max(200).trim().optional(),
        romaji: z.string().max(200).trim().optional(),
        pitch: z.number().int().min(0).max(4).optional(),
        meaning: z.string().max(500).trim().optional(),
        example: z.string().max(1000).trim().optional(),
      }),
    )
    .min(1)
    .max(200),
});

/** 卡片列表查询参数 Schema */
const cardQuerySchema = z.object({
  status: z.enum(['new', 'learning', 'review']).optional(),
});

/**
 * 校验 deckId 格式并确认归属当前用户
 * @returns Deck 文档，或已发送错误响应时返回 null
 */
async function validateDeckOwnership(
  deckId: string,
  userId: Types.ObjectId,
  res: Parameters<typeof sendError>[0],
): Promise<boolean> {
  if (!Types.ObjectId.isValid(deckId)) {
    sendError(res, 404, '卡组不存在');
    return false;
  }
  const deck = await Deck.findOne({ _id: deckId, userId }).lean();
  if (!deck) {
    sendError(res, 404, '卡组不存在');
    return false;
  }
  return true;
}

/**
 * GET /api/decks/:deckId/cards
 * 获取卡组内所有卡片，支持按 status 过滤（new / learning / review）
 * 注意：前端 DisplayStatus 的 4 种过滤由前端本地用 interval 派生，此接口按存储 status 过滤
 */
export async function getCards(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deckId } = req.params;
    const userId = new Types.ObjectId(req.userId);
    const { status } = cardQuerySchema.parse(req.query);

    const owned = await validateDeckOwnership(deckId, userId, res);
    if (!owned) return;

    const filter: { deckId: string; status?: CardStatus } = { deckId };
    if (status) filter.status = status;

    // 只返回设计文档规定的字段，排除 userId、deckId、__v、updatedAt 等内部字段
    const cards = await Card.find(filter)
      .select(
        'front back ease interval repetitions nextReview status reading romaji pitch meaning example createdAt',
      )
      .sort({ createdAt: 1 })
      .lean();
    sendSuccess(res, cards);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/decks/:deckId/cards
 * 新建卡片
 * 校验：同一卡组内 front 不可重复
 */
export async function createCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deckId } = req.params;
    const userId = new Types.ObjectId(req.userId);
    const { front, back, reading, romaji, pitch, meaning, example } = cardContentSchema.parse(
      req.body,
    );

    const owned = await validateDeckOwnership(deckId, userId, res);
    if (!owned) return;

    // 校验同一卡组内 front 唯一
    const existing = await Card.findOne({ deckId, front }).lean();
    if (existing) {
      sendError(res, 422, '该卡组内已存在相同正面内容的卡片');
      return;
    }

    const card = await Card.create({
      deckId,
      userId,
      front,
      back,
      reading,
      romaji,
      pitch,
      meaning,
      example,
      ease: 2.5,
      interval: 1,
      repetitions: 0,
      nextReview: new Date(),
      status: 'new',
    });

    logger.info('创建卡片', { userId: req.userId, deckId, cardId: card._id });
    sendSuccess(res, {
      _id: card._id,
      front: card.front,
      back: card.back,
      ease: card.ease,
      interval: card.interval,
      repetitions: card.repetitions,
      nextReview: card.nextReview,
      status: card.status,
      reading: card.reading,
      romaji: card.romaji,
      pitch: card.pitch,
      meaning: card.meaning,
      example: card.example,
      createdAt: card.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/decks/:deckId/cards/:cardId
 * 修改卡片正背面内容，不修改 SM-2 数据
 * 校验：同一卡组内 front 不可重复（排除自身）
 */
export async function updateCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deckId, cardId } = req.params;
    const userId = new Types.ObjectId(req.userId);
    const { front, back, reading, romaji, pitch, meaning, example } = cardContentSchema.parse(
      req.body,
    );

    if (!Types.ObjectId.isValid(cardId)) {
      sendError(res, 404, '卡片不存在');
      return;
    }

    const owned = await validateDeckOwnership(deckId, userId, res);
    if (!owned) return;

    // 校验 front 唯一性，排除自身（_id !== cardId）
    const duplicate = await Card.findOne({
      deckId,
      front,
      _id: { $ne: cardId },
    }).lean();
    if (duplicate) {
      sendError(res, 422, '该卡组内已存在相同正面内容的卡片');
      return;
    }

    // 只更新 front / back 和可选字段，不触碰 SM-2 字段
    const card = await Card.findOneAndUpdate(
      { _id: cardId, deckId, userId },
      { front, back, reading, romaji, pitch, meaning, example },
      { new: true },
    );

    if (!card) {
      sendError(res, 404, '卡片不存在');
      return;
    }

    logger.info('更新卡片', { userId: req.userId, deckId, cardId });
    sendSuccess(res, {
      _id: card._id,
      front: card.front,
      back: card.back,
      reading: card.reading,
      romaji: card.romaji,
      pitch: card.pitch,
      meaning: card.meaning,
      example: card.example,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/decks/:deckId/cards/batch
 * 批量创建卡片，用于五十音模板导入
 */
export async function batchCreateCards(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { deckId } = req.params;
    const userId = new Types.ObjectId(req.userId);
    const { cards } = batchCreateSchema.parse(req.body);

    const owned = await validateDeckOwnership(deckId, userId, res);
    if (!owned) return;

    const docs = cards.map((c) => ({
      deckId,
      userId,
      front: c.front,
      back: c.back,
      reading: c.reading,
      romaji: c.romaji,
      pitch: c.pitch,
      meaning: c.meaning,
      example: c.example,
      ease: 2.5,
      interval: 1,
      repetitions: 0,
      nextReview: new Date(),
      status: 'new' as const,
    }));

    const inserted = await Card.insertMany(docs, { ordered: false });
    logger.info('批量创建卡片', { userId: req.userId, deckId, count: inserted.length });
    sendSuccess(res, { created: inserted.length });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/decks/:deckId/cards/:cardId
 * 删除卡片
 */
export async function deleteCard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deckId, cardId } = req.params;
    const userId = new Types.ObjectId(req.userId);

    if (!Types.ObjectId.isValid(cardId)) {
      sendError(res, 404, '卡片不存在');
      return;
    }

    const owned = await validateDeckOwnership(deckId, userId, res);
    if (!owned) return;

    const deleted = await Card.findOneAndDelete({ _id: cardId, deckId, userId });
    if (!deleted) {
      sendError(res, 404, '卡片不存在');
      return;
    }

    logger.info('删除卡片', { userId: req.userId, deckId, cardId });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}
