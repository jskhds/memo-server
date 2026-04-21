import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import * as WebSocket from 'ws';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

/** MD5 内存缓存，key = md5(text)，value = base64 音频 */
const ttsCache = new Map<string, string>();

/** 生成讯飞 WebSocket 鉴权 URL */
function buildXfyunUrl(): string {
  const apiKey = process.env.APIKey ?? '';
  const apiSecret = process.env.APISecret ?? '';

  const host = 'tts-api.xfyun.cn';
  const path = '/v2/tts';
  const date = new Date().toUTCString();

  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  return (
    `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}` +
    `&date=${encodeURIComponent(date)}&host=${host}`
  );
}

/**
 * POST /api/tts
 * body: { text: string }
 * 调讯飞 WebSocket TTS，返回 base64 MP3 音频
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const text = (req.body?.text ?? '') as string;
    if (!text.trim()) {
      sendError(res, 400, '缺少 text 参数');
      return;
    }

    const cacheKey = crypto.createHash('md5').update(text).digest('hex');
    if (ttsCache.has(cacheKey)) {
      logger.info('TTS 缓存命中', { cacheKey });
      sendSuccess(res, { audio: ttsCache.get(cacheKey), format: 'mp3' });
      return;
    }

    const appId = process.env.APPID ?? '';
    if (!appId || !process.env.APIKey || !process.env.APISecret) {
      sendError(res, 503, '讯飞 TTS 未配置');
      return;
    }

    const wsUrl = buildXfyunUrl();
    const audioChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket.WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('讯飞 TTS WebSocket 超时'));
      }, 15000);

      ws.on('open', () => {
        const payload = {
          common: { app_id: appId },
          business: {
            aue: 'lame',
            sfl: 1,
            auf: 'audio/L16;rate=16000',
            vcn: 'x2_JaJp_ZhongCun',
            speed: 50,
            volume: 50,
            pitch: 50,
            tte: 'UTF8',
          },
          data: {
            status: 2,
            text: Buffer.from(text).toString('base64'),
          },
        };
        ws.send(JSON.stringify(payload));
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            code: number;
            data?: { audio?: string; status?: number };
          };
          if (msg.code !== 0) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(`讯飞 TTS 错误码 ${msg.code}`));
            return;
          }
          if (msg.data?.audio) {
            audioChunks.push(msg.data.audio);
          }
          if (msg.data?.status === 2) {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        } catch (parseErr) {
          clearTimeout(timeout);
          ws.close();
          reject(parseErr);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const audioBuffer = Buffer.concat(audioChunks.map((chunk) => Buffer.from(chunk, 'base64')));
    const audio = audioBuffer.toString('base64');
    ttsCache.set(cacheKey, audio);
    logger.info('TTS 合成完成', {
      textLen: text.length,
      audioBytes: audioBuffer.length,
      chunks: audioChunks.length,
    });
    sendSuccess(res, { audio, format: 'mp3' });
  } catch (err) {
    next(err);
  }
});

export default router;
