# 闪卡后端项目总调度

## 项目信息

- 技术栈：Node.js + Express + MongoDB + TypeScript
- 前端：微信小程序
- 目标：实现闪卡的增删改查 + 用户认证 + SM-2 复习算法

## 前端项目

路径：../miniprogram
启动时先读取前端的 src/ 目录，了解现有的页面结构和数据存储方式，确保后端接口和前端对齐。

## 角色分工

- /architect — 需求分析、数据库设计、接口规划，输出文档，不写代码
- /coder — 根据架构师的设计专注写代码，不做需求讨论
- /reviewer — 审查代码质量、安全性、接口一致性，给出修改意见

## 开发规范

- 所有接口统一返回格式：{ code, message, data }
- 错误处理必须完整
- 代码必须有注释
- 文件结构按功能模块划分

## 项目结构

src/
├── routes/ # 路由
├── controllers/ # 控制器
├── models/ # MongoDB Schema
├── middleware/ # 中间件
└── utils/ # 工具函数
