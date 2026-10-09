# Atoms Demo 设计文档

版本：v1 · 最后更新：2026-10

---

## 一、产品定义

### 1.1 一句话描述
用户用自然语言描述想要的应用，AI 自动生成可运行的网页应用；通过对话持续迭代，每个版本自动存档。

### 1.2 目标用户
- 想快速验证产品想法、但不想从零搭环境的创业者与产品经理
- 需要快速做出可交互原型的设计师
- 想体验 AI 编码能力的开发者

### 1.3 核心价值
把"描述需求 → 看到可用的应用"这条链路压缩到一分钟内，且结果是真实可运行的代码，而非静态效果图。

### 1.4 范围边界
**本版包含**：自然语言生成、实时预览、对话式迭代、版本回滚、项目管理（重命名/删除）、发布公开分享链接、HTML 导出与源码复制、用户自配多平台模型 Key（跟随账号）。
**本版不含**：多文件工程、容器沙箱构建、自动修错闭环、团队协作、计费。

---

## 二、用户流程

```
未登录 ──浏览首页──> 点击登录 ──> OIDC 回调 ──> 已登录 ──> 读取账号中的 Key（无则提示配置）
                                                  │
                                                  ▼
          输入需求 / 点击示例  ──>  AI 流式生成  ──>  落库（project + version）
                                                  │
                                                  ▼
                    工作台：左侧对话与版本  |  右侧预览 / 代码
                                                  │
                        ┌─────────────────────────┼─────────────────────┐
                        ▼                         ▼                     ▼
                   继续提修改                 回滚历史版本           下载 HTML
                （带上当前代码）            （切换 activeVersion）
```

**关键决策点**
- 首次生成时若尚无项目，自动创建 project，名称取需求前 30 字。
- 修改时把 `activeVersion.code` 一并送入模型，要求输出修改后的完整文件。
- 回滚不删除后续版本，只切换当前激活版本；在此基础上继续修改会追加新版本。

---

## 三、系统架构

### 3.1 整体结构

```
┌─────────────────────────────────────────────────┐
│  前端 (Vite + React + TS + Tailwind + shadcn/ui) │
│  ├─ 首页：Hero + 提示词输入 + 项目列表            │
│  └─ 工作台：对话/版本侧栏 + 预览/代码主区          │
└───────────────┬─────────────────────────────────┘
                │ @metagptx/web-sdk
                ├─ client.auth.*        认证
                ├─ client.entities.*    数据 CRUD
                └─ client.entities.llm_settings  用户 Key 配置
                │
                │ fetch（浏览器直连，SSE 流式）
                ▼
        用户所选平台的 /chat/completions（OpenAI / DeepSeek / Kimi / 通义 / 智谱 / 硅基流动 / OpenRouter / 自定义）
                │
┌───────────────▼─────────────────────────────────┐
│  Atoms Cloud (FastAPI + PostgreSQL)              │
│  ├─ 内置用户体系与 OIDC 登录                      │
│  ├─ 自动生成的实体 CRUD 接口（按 user_id 隔离）    │
│  └─ 不再调用平台 AI，生成费用由用户自己的 Key 承担 │
└─────────────────────────────────────────────────┘
```

### 3.2 为什么不做沙箱构建
本版生成的是单文件 HTML（CSS/JS 内联，Tailwind 走 CDN），浏览器 iframe 即可直接运行，省去了依赖安装、构建、服务器托管三个环节。代价是无法生成多文件工程。这是在"快速可用"和"工程完整"之间的取舍，后续版本再补齐。

### 3.3 预览安全
使用 `<iframe srcDoc={code} sandbox="allow-scripts allow-forms allow-modals">`：
- 允许脚本运行，保证生成的应用真实可交互；
- 不含 `allow-same-origin`，生成代码无法访问父页面的 DOM、Cookie 和登录态；
- 不含 `allow-top-navigation`，无法劫持页面跳转。

---

## 四、数据模型

### projects

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | integer | 是 | 主键，自增 |
| user_id | string | 是 | 所属用户，系统注入与校验 |
| name | string | 是 | 项目名，取首次需求前 30 字 |
| prompt | string | 否 | 首次需求原文 |
| created_at / updated_at | datetime | — | ORM 自动维护 |

### versions

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | integer | 是 | 主键，自增 |
| user_id | string | 是 | 所属用户，系统注入与校验 |
| project_id | integer | 是 | 关联 projects.id |
| instruction | string | 否 | 本次需求或修改指令 |
| code | string | 是 | 生成的完整 HTML |
| summary | string | 否 | AI 对本次改动的简述 |
| created_at / updated_at | datetime | — | ORM 自动维护 |

### shares

公开分享表，`create_only=false`，任何人（含未登录访客）均可读取。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | integer | 是 | 主键，自增，即分享链接 `/s/:id` 中的 ID |
| title | string | 是 | 分享标题，取发布时的项目名 |
| code | string | 是 | 发布瞬间的完整 HTML 快照 |
| project_id | integer | 否 | 来源项目 |
| views | integer | 否 | 浏览次数，每次访问 +1 |

分享采用**快照**语义：发布后再修改项目不会影响已发出的链接，需要更新时重新发布生成新链接。

### llm_settings

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | integer | 是 | 主键，自增 |
| user_id | string | 是 | 所属用户，系统注入与校验 |
| provider | string | 否 | 平台标识（openai / deepseek / moonshot / dashscope / zhipu / siliconflow / openrouter / custom） |
| api_key | string | 是 | 用户自己的 API Key |
| base_url | string | 是 | 接口地址 |
| model | string | 是 | 模型名 |

每个用户只保留一条记录，读取时取最近更新的一条。

projects、versions、llm_settings 为 `create_only=true`，数据按用户隔离，用户只能读写自己的记录。版本按 `created_at` 升序构成时间线。

---

## 五、AI 生成设计

### 5.1 调用方式
用户自带 Key，前端通过 `fetch` 直连所选平台 OpenAI 兼容的 `/chat/completions` 接口，`stream: true`，按 SSE 逐行解析 `choices[0].delta.content` 实时展示（`src/lib/llm.ts` 的 `streamChat`）。这样不消耗平台 AI 余额，用户可以自由选择模型和费用。

### 5.2 平台预设
| 平台 | 默认接口地址 | 预置模型示例 |
|---|---|---|
| OpenAI | https://api.openai.com/v1 | gpt-4o-mini、gpt-4o、gpt-4.1 |
| DeepSeek | https://api.deepseek.com/v1 | deepseek-chat、deepseek-reasoner |
| 月之暗面 Kimi | https://api.moonshot.cn/v1 | kimi-k2-0905-preview、moonshot-v1-32k |
| 阿里云百炼 | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus、qwen-max、qwen3-coder-plus |
| 智谱 GLM | https://open.bigmodel.cn/api/paas/v4 | glm-4.6、glm-4-plus、glm-4-flash |
| 硅基流动 | https://api.siliconflow.cn/v1 | DeepSeek-V3、Qwen2.5-72B、GLM-4.6 |
| OpenRouter | https://openrouter.ai/api/v1 | claude-sonnet-4.5、gemini-2.5-pro 等 |
| 自定义 | 用户填写 | 用户填写 |

选择平台后自动填入地址和首个模型，并提供「获取 Key」链接；模型可点选也可手输。「测试连接」发送 `max_tokens: 1` 的极小请求校验 Key、地址和模型。

### 5.3 Key 的存储与同步
1. 配置入口要求先登录；未登录点击会跳转登录。
2. 登录后读取 `llm_settings` 中该用户的配置，写入状态并在本地浏览器缓存一份。
3. 账号中没有配置、但本地已有 Key 时，自动迁移到账号（解决登录前后需要重复配置的问题）。
4. 保存时有记录则更新、无记录则创建；清除配置则删除记录。同步失败时提示「仅保存在本机」，不影响当前使用。

### 5.4 System Prompt 要点
1. 只输出一个 ```html 代码块，前面可附一句不超过 40 字的中文说明；
2. CSS/JS 全部内联，允许 CDN 引入 Tailwind；
3. 功能必须真实可交互，数据用 localStorage 持久化，禁止占位文字；
4. 界面美观、响应式、中文；
5. 修改请求时基于给出的现有代码输出完整文件。

### 5.5 输出解析
正则提取 ```html 代码块；若未匹配到则退回整段文本。校验结果必须包含 `<`，否则判为无效并提示重试。代码块前的说明文字截取 120 字作为版本摘要。

### 5.6 错误处理
- 401/403 提示 Key 无效、429 提示频率或额度、404 提示模型或地址错误，网络失败提示检查 Base URL 与跨域；
- 未配置 Key 时点击生成，自动打开配置弹窗；
- 所有失败路径都会重置 `busy` 与 `stream`，并保留重试入口。

---

## 六、视觉设计

### 6.1 方向
深色、克制、产品化。不用霓虹发光与渐变装饰，依靠排版层级、留白和一个紫色强调色建立秩序感。

### 6.2 Tokens

| 类别 | 值 | 用途 |
|---|---|---|
| background | `240 6% 5%` | 页面底色 |
| card | `240 5% 9%` | 卡片、侧栏、输入卡 |
| primary / accent | `252 90% 66%` | 强调色，用于高亮词、激活态、提交按钮 |
| muted-foreground | `240 5% 60%` | 次级文字 |
| border | `240 5% 17%` | 分割线与卡片边框 |
| radius | `0.875rem` | 基础圆角 |

- **字体**：Inter（界面与标题）、JetBrains Mono（代码区）。标题 40–64px / 800 / 行高 1.08 / 字距 -0.03em；正文 15px / 1.6；标签 11–12px。
- **背景纹理**：`.tech-grid` 为 28px 间距的细点阵，透明度 0.045。
- **阴影**：输入卡使用 `.tech-glow`（紫色柔光投影），普通卡片仅用边框。

### 6.3 布局
- 首页：Hero 区（点阵背景 + 顶部紫色光晕）→ 三张步骤卡片 → 三个数据指标 → 项目列表（登录后）。内容最大宽度 1200px。
- 工作台：左侧 380px 固定宽侧栏（对话 + 版本 + 输入框），右侧自适应主区（预览 / 代码 Tab）。
- 响应式：< 1024px 时工作台上下堆叠；Hero 标题从 64px 降至 40px。

### 6.4 组件与状态

| 组件 | 状态 |
|---|---|
| 提示词输入卡 | 默认 / 生成中（禁用 + 旋转图标）/ 空输入（提交按钮降透明度） |
| 版本条目 | 当前版本（紫点 + "当前版本 vN"）/ 可回滚（回滚图标） |
| 预览区 | 有代码（iframe）/ 无版本（"暂无版本"）/ 生成中（自动切到代码视图） |
| 项目列表 | 有数据（卡片网格）/ 空（引导文案） |
| 顶栏 | 未登录（显示登录按钮）/ 已登录（仅显示引擎状态） |

### 6.5 无障碍
- 跳转到主内容的 skip link；
- textarea 配 `sr-only` label，图标按钮均有 `aria-label`；
- Tab 使用 `role="tablist"` 与 `aria-selected`；
- 焦点环统一使用 `ring-ring`（紫色），不被移除；
- `prefers-reduced-motion` 下关闭脉冲与旋转动画。

---

## 七、关键实现

### 7.1 认证三态
`auth` 取值 `loading | in | out`。`client.auth.me()` 未返回前不判定为未登录，避免首屏闪烁或误触发登录跳转。业务请求失败只提示错误，不跳登录页。

### 7.2 流式累积
用 `useRef` 累积 chunk 而非 state，避免高频 setState 丢字符；同时用 state 驱动渲染，展示已生成字符数。

### 7.3 删除项目
先查出该项目所有版本并行删除，再删项目本身，避免孤儿版本记录。若删除的是当前打开的项目，重置工作台状态。

### 7.4 导出
`Blob` + `URL.createObjectURL` 触发下载，文件名取项目名，下载后立即 `revokeObjectURL` 释放。

---

## 八、已知限制与演进

| 限制 | 影响 | 后续方案 |
|---|---|---|
| 仅单文件 HTML | 无法生成多页面、多组件工程 | 引入容器沙箱 + 多文件 Agent |
| 无构建校验 | 生成代码可能有运行时错误 | 补自动修错闭环（读报错 → 修复 → 重试，设上限） |
| 全量代码入上下文 | 代码变大后成本上升、可能超长 | 改为 diff 式编辑，按需检索相关片段 |
| 无发布能力 | 只能下载 HTML | 对象存储托管 + 公网短链 |
| Key 明文存库 | 数据库泄露时 Key 暴露 | 服务端加密存储，或改为后端代理调用 |
| 浏览器直连依赖 CORS | 部分自建服务无法直接使用 | 增加后端转发代理 |
