# Atoms Demo

> 用一句话描述需求，AI 自动生成可运行的网页应用。对话即迭代，版本自动存档，随时回滚与导出。

## 这是什么

Atoms Demo 是一个 "Vibe Coding" 应用生成器：用户用自然语言描述想要的应用，AI 实时生成一个完整、可直接运行的单文件 HTML 应用，并在右侧 iframe 中即时预览。继续对话即可修改，每一次修改都保存为一个版本，可回滚到任意版本或导出为 HTML 文件。

## 功能

| 功能 | 说明 |
|---|---|
| 自然语言生成 | 输入需求或点击示例，AI 流式生成完整可运行代码，过程实时可见 |
| 实时预览 | 生成结果在沙箱 iframe 中直接运行，可切换查看源码 |
| 对话式迭代 | 基于当前版本代码继续提出修改需求，输出修改后的完整文件 |
| 版本存档与回滚 | 每次生成/修改自动存为一个版本，可一键回滚到任意历史版本 |
| 项目管理 | 登录后查看、打开、重命名、删除自己的项目（按用户隔离） |
| 发布分享 | 一键生成公开链接 `/s/:id`，无需登录即可访问，带浏览量统计 |
| 导出 | 将当前版本下载为独立的 `.html` 文件，或一键复制源码 |

## 技术栈

- **前端**：Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **后端**：Atoms Cloud（FastAPI + PostgreSQL），提供 Auth / Database / AI 能力
- **AI 模型**：用户自配 API Key，浏览器直连 OpenAI 兼容接口流式生成。内置 OpenAI、DeepSeek、Kimi、通义千问、智谱 GLM、硅基流动、OpenRouter 及自定义地址；配置仅保存在本地浏览器
- **SDK**：`@metagptx/web-sdk`

## 目录结构

```
app/
├── frontend/
│   ├── src/pages/Index.tsx      # 首页 + 工作台（核心页面）
│   ├── src/components/ui/       # shadcn/ui 组件
│   ├── src/index.css            # 主题 CSS 变量
│   └── DESIGN.md                # 视觉设计规范
└── backend/
    ├── models/                  # ORM 模型（自动生成）
    ├── services/                # 业务逻辑
    └── routers/                 # API 路由（/api/v1/*）
docs/
├── vibe-coding-app-design.md    # 产品与系统设计文档
└── DESIGN_SPEC.md               # 完整设计文档（架构 + 视觉）
```

## 数据模型

**projects** — 项目

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer | 主键，自增 |
| user_id | string | 所属用户（系统维护） |
| name | string | 项目名（取自首次需求前 30 字） |
| prompt | string | 首次需求描述 |

**versions** — 版本

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer | 主键，自增 |
| user_id | string | 所属用户（系统维护） |
| project_id | integer | 关联项目 |
| instruction | string | 本次的需求/修改指令 |
| code | string | 生成的完整 HTML 代码 |
| summary | string | AI 对本次改动的简述 |

**shares** — 公开分享（无需登录即可读取）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer | 主键，自增，即分享链接中的 ID |
| title | string | 分享标题（取项目名） |
| code | string | 发布时的完整 HTML 快照 |
| project_id | integer | 来源项目 |
| views | integer | 浏览次数 |

以上表均附带自动维护的 `created_at` / `updated_at`。

## 本地开发

```bash
# 前端
cd app/frontend
pnpm i
pnpm run dev      # 启动开发服务器
pnpm run lint     # 代码检查
pnpm run build    # 生产构建
```

后端由 Atoms Cloud 托管，无需本地启动。

## 使用流程

1. 点击右上角登录，再点「配置 Key」选择平台并填写自己的 API Key（可先测试连接）。
2. 在首页输入框描述想要的应用，或点击示例胶囊快速填入。
3. 按 Enter 发送，等待 AI 生成（通常几十秒），过程中可看到已生成的字符数。
4. 生成完成后进入工作台：左侧是对话与版本记录，右侧可切换「预览 / 代码」。
5. 在左下输入框继续提修改需求，生成新版本。
6. 点击任意历史版本可回滚；点击「下载 HTML」导出当前版本。

## 已知限制

- 生成的是**单文件 HTML 应用**，而非多文件工程，因此没有依赖安装、沙箱构建和自动修错环节。
- 预览直接在浏览器 iframe 中运行生成代码（`sandbox` 受限），不依赖独立服务器。
- 生成与修改需要登录；未登录可浏览首页。
- 每次修改会把完整代码送入模型，代码体量很大时可能受上下文长度影响。

## 后续规划

- 多文件工程生成 + 容器沙箱构建
- 构建失败后的自动修错闭环
- 一键发布到公网链接
- 模型路由与成本控制
