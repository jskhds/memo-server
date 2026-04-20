import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { code2session } from '../utils/wechat';
import { signToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/** 登录请求体 Schema */
const loginSchema = z.object({
  code: z.string().min(1, 'code 不能为空'),
});

/**
 * POST /api/auth/login
 * 微信登录：code 换取 openid → 查找或创建用户（单次原子操作）→ 签发 JWT
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. 校验请求体
    const { code } = loginSchema.parse(req.body);

    // 2. 调用微信接口获取 openid
    //    微信接口失败（code 无效/过期）属于客户端错误，单独捕获返回 422
    let openid: string;
    try {
      openid = await code2session(code);
    } catch (err) {
      logger.warn('微信 code2session 失败', { error: (err as Error).message });
      sendError(res, 422, '微信登录失败，code 无效或已过期');
      return;
    }

    // 3. 单次原子 upsert：避免两次查询的竞争条件
    //    includeResultMetadata: true 返回操作元数据，通过 updatedExisting 判断是否新用户
    const result = await User.findOneAndUpdate(
      { openid },
      { $setOnInsert: { openid } },
      { upsert: true, new: true, includeResultMetadata: true },
    );

    const user = result.value;
    const isNewUser = !result.lastErrorObject?.updatedExisting;

    if (!user) {
      throw new Error('用户创建失败');
    }

    logger.info('用户登录', { userId: user._id, isNewUser });

    // 4. 签发 JWT
    const token = signToken(user._id.toString());

    sendSuccess(res, { token, isNewUser });
  } catch (err) {
    next(err);
  }
}
