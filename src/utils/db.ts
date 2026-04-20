import mongoose from 'mongoose';
import logger from './logger';

/**
 * 连接 MongoDB Atlas
 * 从环境变量读取连接字符串，密码单独存放以便替换
 */
export async function connectDB(): Promise<void> {
  const dbUrl = process.env.DATABASE;
  const dbPassword = process.env.DATABASE_PASSWORD;

  if (!dbUrl || !dbPassword) {
    throw new Error('DATABASE 或 DATABASE_PASSWORD 未配置');
  }

  // 将连接字符串中的 <PASSWORD> 占位符替换为实际密码
  const connectionString = dbUrl.replace('<PASSWORD>', dbPassword);

  try {
    await mongoose.connect(connectionString);
    logger.info('MongoDB 连接成功');
  } catch (err) {
    logger.error('MongoDB 连接失败', { error: err });
    throw err;
  }
}
