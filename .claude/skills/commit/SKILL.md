# Commit Skill

将当前工作目录中的所有未提交变更，按路径分组后逐批提交。

## 分组规则

| 路径模式 | 提交分组 |
|---|---|
| `src/pages/**` | 页面变更 |
| `src/components/**` | 组件变更 |
| `src/utils/**` | 工具函数变更 |
| `src/assets/**` | 资源文件变更 |
| `package.json`, `*.config.*`, `project.*.json` | 配置变更 |
| 其他 | 其他变更 |

## Commit Message 格式（中文）

- **新增页面**：`feat: 新增 <页面名称> 页面`
- **修改页面**：`fix: 修复 <页面名称> 页面 <问题描述>` 或 `perf: 优化 <页面名称> 页面`
- **新增组件**：`feat: 新增 <组件名称> 组件`
- **重构组件**：`refactor: 重构 <组件名称> 组件`
- **工具函数**：`feat/fix/refactor: <描述>`
- **Bug 修复**：`fix: <问题描述>`
- **配置变更**：`chore: 更新配置`
- **资源文件**：`chore: 更新资源文件`

## 执行步骤

1. 运行 `git status` 查看所有变更文件
2. 运行 `git diff` 和 `git diff --cached` 了解具体变更内容
3. 按分组规则将文件归类
4. 对每个分组：
   a. `git add <该分组的文件>`
   b. 根据变更内容撰写中文 commit message
   c. `git commit -m "..."` 提交（附 Co-Authored-By 尾部）
5. 所有分组提交完毕后，汇报各提交的 message

## 注意事项

- 不要提交 `.claude/settings.local.json`
- 不要提交 `.env`、`.env.local` 等敏感文件
- 每个 commit 聚焦单一职责，message 准确描述实际变更
 
