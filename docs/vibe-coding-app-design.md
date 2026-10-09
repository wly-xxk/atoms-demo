# Vibe Coding 自动生成应用 — 设计文档

## 1. 产品目标
用户用自然语言描述想要的应用（“做一个记账 App，带图表”），系统自动完成：需求理解 → 规划 → 生成代码 → 构建/运行 → 自动修错 → 实时预览 → 对话式迭代 → 一键发布。

## 2. 核心用户流程
1. 输入提示词（可附截图/设计稿）
2. AI 生成需求摘要与计划，用户确认（可跳过）
3. Agent 在沙箱中生成项目文件，流式展示文件树与代码
4. 自动安装依赖、lint、build；失败则读取报错自动修复（最多 N 轮）
5. 右侧 iframe 实时预览
6. 用户继续对话修改（“按钮换成红色”“加登录”），增量修改代码
7. 版本快照、回滚、发布到公网链接

## 3. 系统架构
```
前端 (React + Vite)
 ├─ 对话面板  ├─ 文件树/代码编辑器(Monaco)  └─ 预览 iframe
        │ WebSocket / SSE（流式输出）
后端 API (FastAPI / Node)
 ├─ 会话与项目服务（用户、项目、版本）
 ├─ Agent 编排器（Planner / Coder / Fixer 循环）
 ├─ LLM 网关（多模型路由、计费、限流）
 └─ 沙箱管理器
沙箱 (Docker / Firecracker / WebContainer)
 └─ 模板项目 + pnpm + dev server（热更新）
存储：PostgreSQL（元数据）、对象存储（项目快照）、Redis（任务队列/会话状态）
```

## 4. Agent 设计（核心）
- **Planner**：把用户需求转为结构化计划（页面、组件、数据模型、是否需要后端）。
- **Coder**：基于固定模板（React + Tailwind + shadcn/ui）生成/修改文件。工具集：`read_file`、`write_file`、`replace_in_file`、`list_files`、`run_command`。
- **Fixer**：执行 `lint && build`，把错误日志回填给模型修复，设置重试上限防止死循环。
- **Reviewer（可选）**：截图预览页面，用多模态模型检查 UI 是否符合需求。
- **上下文管理**：项目摘要文件（如 PROGRESS.md/ARCHITECTURE.md）+ 按需检索相关文件，避免把整个仓库塞进上下文。
- **增量修改**：优先 diff/替换式编辑，而非整文件重写，减少 token 和回归。

## 5. 关键技术点
| 问题 | 方案 |
|---|---|
| 生成代码稳定性 | 固定技术栈模板 + 严格的 system prompt + 编译反馈闭环 |
| 安全隔离 | 每个项目独立容器，限制 CPU/内存/网络，超时回收 |
| 实时预览 | 沙箱内 Vite dev server，通过反向代理映射子域名 |
| 流式体验 | SSE 推送思考、工具调用、文件变更事件 |
| 后端能力 | 内置 BaaS（认证、数据库、存储），由 Agent 自动建表 |
| 版本管理 | 每轮修改后 git commit，支持回滚 |
| 成本控制 | 简单任务用快模型，规划/复杂修复用强模型；缓存提示前缀 |

## 6. 数据模型
- users(id, email, plan, credits)
- projects(id, user_id, name, template, sandbox_id, publish_url)
- messages(id, project_id, role, content, tool_calls)
- versions(id, project_id, commit_hash, snapshot_url)
- usage_logs(id, user_id, model, tokens, cost)

## 7. 主要 API
- `POST /projects` 创建项目
- `POST /projects/{id}/chat` 发送需求（SSE 流式返回）
- `GET /projects/{id}/files` / `GET /files/{path}`
- `POST /projects/{id}/rollback/{version}`
- `POST /projects/{id}/publish`

## 8. 开发里程碑
1. MVP：单模板 + 对话生成 + 沙箱构建 + 预览（2–4 周）
2. 自动修错闭环、版本回滚、发布
3. 内置后端（登录/数据库）、图片上传转代码
4. 多模型路由、计费、团队协作、模板市场

## 9. 风险
- 模型幻觉导致依赖/导入错误 → 构建校验 + import 存在性检查
- 无限修复循环 → 重试上限 + 相同错误去重
- 沙箱滥用（挖矿/攻击） → 资源配额、出网白名单、审计
