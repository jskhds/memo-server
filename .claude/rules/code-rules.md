# 代码规范

## 基本规范

- 使用 TypeScript，禁止滥用 any，必须声明类型
- 使用 ES6+ 语法
- 使用 async/await，不用 callback
- 变量命名用 camelCase，类名用 PascalCase，常量用 UPPER_SNAKE_CASE
- 文件名用 camelCase（如 userController.ts）

## 工具配置

- 必须配置 ESLint + Prettier，代码提交前自动格式化
- tsconfig.json 必须开启 strict 模式

## 参数校验

- 使用 Zod 做声明式校验，禁止手写 if/else 判断参数

## 错误处理

- 所有 async 函数必须有 try/catch
- 非预期错误必须打印 logger.error 并包含 Stack Trace
- 统一用 errorHandler 中间件处理
- 错误信息不暴露敏感信息给客户端

## 日志规范

- 使用 logger 统一管理，不直接用 console.log
- 关键业务路径必须有 logger.info
- 所有 catch 块必须有 logger.error

## 接口规范

- 统一返回格式：{ code, message, data }
- 成功 code: 0，失败用约定错误码
- 参数校验放在 controller 最开始

## 文件结构规范

- 一个文件只做一件事
- controller 只处理请求/响应
- 业务逻辑放 service 层
- model 只定义 Schema
- 环境变量必须通过 process.env 读取，严禁硬编码
