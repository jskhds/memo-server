import dotenv from 'dotenv';

// 必须在所有模块导入之前加载环境变量
dotenv.config();

import { createApp } from './app';
import { connectDB } from './utils/db';
import logger from './utils/logger';

const PORT = process.env.PORT ?? 3000;

/**
 * 启动服务：先连接数据库，再监听端口
 */
async function bootstrap(): Promise<void> {
  try {
    await connectDB();

    const app = createApp();
    // 绑定 0.0.0.0 使局域网设备（真机调试）也能访问
    app.listen(Number(PORT), '0.0.0.0', () => {
      logger.info(`服务已启动，端口：${PORT}，环境：${process.env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error('服务启动失败', { error: err });
    process.exit(1);
  }
}

bootstrap();
