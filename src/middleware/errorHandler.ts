import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MongoServerError } from 'mongodb';
import logger from '../utils/logger';

/** 统一响应格式 */
export interface ApiResponse<T = null> {
  code: number;
  message: string;
  data: T;
}

/**
 * 发送成功响应
 */
export function sendSuccess<T>(res: Response, data: T, message = 'ok'): void {
  res.json({ code: 0, message, data });
}

/**
 * 发送错误响应
 */
export function sendError(res: Response, code: number, message: string): void {
  res.status(code).json({ code, message, data: null });
}

/**
 * 全局错误处理中间件
 * 捕获 ZodError（参数校验）、MongoDB 11000（重复键）、其他错误统一返回 500
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod 参数校验失败 → 422
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    sendError(res, 422, message);
    return;
  }

  // MongoDB 重复键错误 → 422
  if (err instanceof MongoServerError && err.code === 11000) {
    sendError(res, 422, '数据已存在，请勿重复创建');
    return;
  }

  // 其他错误 → 500
  logger.error('未处理的服务器错误', { error: err.message, stack: err.stack });
  sendError(res, 500, '服务器内部错误');
}
