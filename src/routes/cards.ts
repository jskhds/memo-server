import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getCards, createCard, updateCard, deleteCard } from '../controllers/cardController';

// 路由挂载在 /api/decks/:deckId/cards，mergeParams 允许访问父路由的 :deckId
const router = Router({ mergeParams: true });

// 所有卡片接口均需登录
router.use(authenticate);

/**
 * GET    /api/decks/:deckId/cards            获取卡组所有卡片（支持 ?status 过滤）
 * POST   /api/decks/:deckId/cards            新建卡片
 * PUT    /api/decks/:deckId/cards/:cardId    修改卡片内容
 * DELETE /api/decks/:deckId/cards/:cardId    删除卡片
 */
router.get('/', getCards);
router.post('/', createCard);
router.put('/:cardId', updateCard);
router.delete('/:cardId', deleteCard);

export default router;
