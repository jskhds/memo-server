import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { z } from 'zod';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { hasCache, getCache, setCache } from '../utils/ttsCache';
import { synthesizeSpeech } from '../utils/xfyunTts';

const ttsBodySchema = z.object({
  text: z.string().min(1, '缺少 text 参数'),
});

export async function postTTS(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = ttsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.errors[0].message);
      return;
    }
    const { text } = parsed.data;

    const appId = process.env.APPID ?? '';
    if (!appId || !process.env.APIKey || !process.env.APISecret) {
      sendError(res, 503, '讯飞 TTS 未配置');
      return;
    }

    const cacheKey = crypto.createHash('md5').update(text).digest('hex');
    if (hasCache(cacheKey)) {
      logger.info('TTS 缓存命中', { cacheKey });
      sendSuccess(res, { audio: getCache(cacheKey), format: 'mp3' });
      return;
    }

    const audio = await synthesizeSpeech(text, appId);
    setCache(cacheKey, audio);
    logger.info('TTS 合成完成', { textLen: text.length, audioBytes: audio.length });
    sendSuccess(res, { audio, format: 'mp3' });
  } catch (err) {
    next(err);
  }
}
