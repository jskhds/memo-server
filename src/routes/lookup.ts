import { Router, Request, Response, NextFunction } from 'express';
import { toRomaji, isKana } from 'wanakana';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import { lookupWord } from '../utils/dict';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

/**
 * GET /api/lookup?word=xxx
 * 本地 JMdict 查词，无需外部请求
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const word = (req.query.word as string)?.trim();
    if (!word) {
      sendError(res, 400, '缺少 word 参数');
      return;
    }

    const entry = lookupWord(word);

    // 纯假名输入但字典 reading 与输入不符（错误映射），直接返回假名本身
    if (isKana(word) && (!entry || entry.reading !== word)) {
      sendSuccess(res, { reading: word, romaji: toRomaji(word), meaning: '' });
      return;
    }

    if (!entry) {
      sendSuccess(res, { reading: '', romaji: '', meaning: '' });
      return;
    }

    const romaji = entry.reading ? toRomaji(entry.reading) : '';
    logger.info('本地查词', { word, reading: entry.reading, romaji });
    sendSuccess(res, {
      reading: entry.reading,
      romaji,
      meaning: entry.meaning,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
