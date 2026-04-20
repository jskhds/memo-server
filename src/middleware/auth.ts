import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { sendError } from './errorHandler';
import logger from '../utils/logger';

/** 扩展 Express Request，携带已认证的用户 ID */
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

/**
 * JWT 认证中间件
 * 从 Authorization 头解析 Bearer Token，验证后将 userId 写入 req.userId
 * 验证失败统一返回 401
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, '未登录，请先完成微信授权');
    return;
  }

  const token = authHeader.slice(7); // 去掉 'Bearer ' 前缀

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    // 记录具体错误类型（TokenExpiredError / JsonWebTokenError），便于排查
    logger.debug('JWT 验证失败', { error: (err as Error).message });
    sendError(res, 401, 'Token 已失效，请重新登录');
  }
}
