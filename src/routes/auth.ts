import { Router } from 'express';
import { login } from '../controllers/authController';

const router = Router();

/**
 * POST /api/auth/login
 * 微信登录，不需要认证中间件
 */
router.post('/login', login);

export default router;
