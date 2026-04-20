import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getDueCards, submitReview } from '../controllers/reviewController';

const router = Router();

// 所有复习接口均需登录
router.use(authenticate);

/**
 * GET  /api/review/due      获取到期卡片（支持 ?deckId 过滤）
 * POST /api/review/submit   提交复习评分，后端执行 SM-2 并更新 Streak
 */
router.get('/due', getDueCards);
router.post('/submit', submitReview);

export default router;
