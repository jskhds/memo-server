import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getDecks, createDeck, updateDeck, deleteDeck } from '../controllers/deckController';

const router = Router();

// 所有卡组接口均需登录
router.use(authenticate);

/**
 * GET    /api/decks       获取当前用户所有卡组（含统计摘要）
 * POST   /api/decks       创建卡组
 * PUT    /api/decks/:id   修改卡组名称
 * DELETE /api/decks/:id   删除卡组（级联删除卡片）
 */
router.get('/', getDecks);
router.post('/', createDeck);
router.put('/:deckId', updateDeck);
router.delete('/:deckId', deleteDeck);

export default router;
