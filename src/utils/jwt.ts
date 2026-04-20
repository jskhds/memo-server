import jwt from 'jsonwebtoken';

/** JWT Payload 结构 */
export interface JwtPayload {
  userId: string;
}

/**
 * 签发 JWT Token
 * @param userId - 用户 MongoDB ObjectId 字符串
 * @returns 签名后的 JWT 字符串
 */
export function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET;
  // JWT_EXPIRES 来自环境变量（string），需转为 SignOptions 期望的 StringValue 类型
  const expiresIn = (process.env.JWT_EXPIRES ?? '90d') as jwt.SignOptions['expiresIn'];

  if (!secret) {
    throw new Error('JWT_SECRET 未配置');
  }

  return jwt.sign({ userId }, secret, { expiresIn });
}

/**
 * 验证并解析 JWT Token
 * @param token - 待验证的 JWT 字符串
 * @returns 解析后的 Payload，验证失败抛出错误
 */
export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET 未配置');
  }

  const decoded = jwt.verify(token, secret) as JwtPayload;
  return decoded;
}
