import { Router, Request, Response, NextFunction } from 'express';
import { toRomaji } from 'wanakana';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

/**
 * GET /api/lookup?word=xxx
 * 转发 Jisho API 查词，超时 5s 返回 503
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const word = req.query.word as string;
    if (!word || !word.trim()) {
      sendError(res, 400, '缺少 word 参数');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let body: Record<string, unknown>;
    try {
      const response = await fetch(
        `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word.trim())}`,
        { signal: controller.signal },
      );
      body = (await response.json()) as Record<string, unknown>;
    } catch (fetchErr: unknown) {
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        sendError(res, 503, 'Jisho API 超时');
        return;
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = body?.data as Array<Record<string, unknown>> | undefined;
    const first = data?.[0] as Record<string, unknown> | undefined;

    if (!first) {
      sendSuccess(res, { reading: '', romaji: '', pitch: null, meaning: '', example: '' });
      return;
    }

    const japanese = first.japanese as Array<{ reading?: string; word?: string }> | undefined;
    const reading = japanese?.[0]?.reading ?? '';

    const senses = first.senses as Array<{ english_definitions?: string[] }> | undefined;
    const meaning = (senses?.[0]?.english_definitions ?? []).slice(0, 3).join('; ');

    const romaji = reading ? toRomaji(reading) : '';
    logger.info('Jisho 查词', { word, reading, romaji, meaning });
    sendSuccess(res, {
      reading,
      romaji,
      pitch: null,
      meaning,
      example: '',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
