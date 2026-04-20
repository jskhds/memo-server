import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getOverview, getHistory, getDeckStats } from '../controllers/statsController';

const router = Router();

// 所有统计接口均需登录
router.use(authenticate);

/**
 * GET /api/stats/overview   首页摘要（todayDue、streak、deckCount、totalCards）
 * GET /api/stats/history    复习历史（折线图 ?days=7|30 / 日历热力图 ?year=&month=）
 * GET /api/stats/decks      各卡组掌握率
 */
router.get('/overview', getOverview);
router.get('/history', getHistory);
router.get('/decks', getDeckStats);

export default router;
