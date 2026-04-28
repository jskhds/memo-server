import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import decksRouter from './routes/decks';
import cardsRouter from './routes/cards';
import reviewRouter from './routes/review';
import statsRouter from './routes/stats';
import lookupRouter from './routes/lookup';
import ttsRouter from './routes/tts';
import strokeRouter from './routes/stroke';

/**
 * 创建并配置 Express 应用实例
 * 路由注册将在各模块实现后逐步接入
 */
export function createApp(): express.Application {
  const app = express();

  // ── 安全与解析中间件 ────────────────────────────────────────────
  app.use(helmet()); // 设置安全 HTTP 头
  app.use(cors()); // 允许跨域（微信小程序需要）
  app.use(express.json()); // 解析 JSON 请求体
  app.use(express.urlencoded({ extended: true }));

  // ── 请求日志（联调用）────────────────────────────────────────────
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, req.body ?? '');
    next();
  });

  // ── 健康检查 ─────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ code: 0, message: 'ok', data: { status: 'running' } });
  });

  // ── 路由 ─────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/decks', decksRouter);
  app.use('/api/decks/:deckId/cards', cardsRouter);
  app.use('/api/review', reviewRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/lookup', lookupRouter);
  app.use('/api/tts', ttsRouter);
  app.use('/api/stroke-data', strokeRouter);

  // ── 全局错误处理（必须放在最后）──────────────────────────────────
  app.use(errorHandler);

  return app;
}
