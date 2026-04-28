import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getStrokeData } from '../controllers/strokeController';

const router = Router();
router.use(authenticate);

/** GET /api/stroke-data/:char — 查询单个假名的笔顺数据 */
router.get('/:char', getStrokeData);

export default router;
