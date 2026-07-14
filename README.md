# OmniAgent

**One Agent. Every AI.**  
**一个 Agent，连接所有网页 AI。**

OmniAgent 是一个以浏览器扩展为载体的跨 AI 平台个人 Agent 系统。

它不自己提供大模型，也不要求用户必须配置 BaseURL、API Key 或模型服务。  
OmniAgent 直接复用用户正在使用的网页 AI，让 DeepSeek、Kimi 等网页大模型成为可替换的“推理大脑”。

OmniAgent 自己负责持有：

- 长期记忆 Memory
- Skill 技能
- Tool 工具
- Browser Agent 浏览器操作
- MCP 外部工具
- Project 项目上下文
- Agent Task 任务状态
- Step 执行记录
- Pause / Resume / Retry
- 跨平台任务连续性

网页 AI 负责：

- 理解用户目标
- 判断下一步应该做什么
- 选择 Skill
- 选择 Tool
- 根据 Tool Result 继续决策
- 最终完成任务

---

## 核心理念

### AI 平台只是可替换的大脑

今天可以使用 DeepSeek 网页完成任务。

明天可以切换到 Kimi。

未来也可以接入更多网页 AI。

但以下内容始终属于 OmniAgent：

```text
Memory
Skill
Tool
Project
Agent Task
Execution History
```

OmniAgent 不依附于某一个 AI 网站。

---

## OmniAgent 和普通 AI 浏览器扩展的区别

普通 AI 浏览器扩展通常是：

```text
某一个 AI 网站
   ↓
扩展给它增加一些功能
   ↓
工具调用
记忆
MCP
浏览器控制
```

OmniAgent 的目标是：

```text
                 OmniAgent
                     │
        ┌────────────┼────────────┐
        │            │            │
      Memory       Skills       Tools
        │            │            │
        └────────────┼────────────┘
                     │
                Agent Task
                     │
               Site Adapter
          ┌──────────┼──────────┐
          │          │          │
      DeepSeek      Kimi      More AI
```

网页 AI 只是当前任务的推理引擎。

OmniAgent 才是任务、状态和能力的真正拥有者。

---

## 核心运行模式

OmniAgent 的最终 Agent 闭环不是本地正则 Planner，也不是强制调用第三方模型 API。

核心模式是：

```text
用户提出目标
    ↓
OmniAgent 创建 Agent Task
    ↓
构建当前上下文
    ├── Memory
    ├── Skill
    ├── Project
    ├── Tool Definitions
    └── Historical Steps
    ↓
发送给当前网页 AI
    ↓
网页 AI 决定下一步
    ↓
输出 Tool Call / Ask User / Finish
    ↓
OmniAgent 执行 Tool
    ↓
保存 Step 和 Tool Result
    ↓
把最新状态重新交给网页 AI
    ↓
继续判断下一步
    ↓
任务完成
```

即：

```text
Observe
  ↓
Reason
  ↓
Act
  ↓
Observe Result
  ↓
Reason Again
```

---

## 为什么核心模式不需要 API Key

OmniAgent 的核心目标不是自己调用模型 API。

它直接利用用户已经登录的网页 AI：

```text
DeepSeek Web
Kimi Web
Future AI Web
```

因此核心模式不需要：

```text
BaseURL
API Key
Model Name
```

未来可以增加“外部模型 API”作为可选能力，但它不能成为 OmniAgent 的必选前提。

---

# 当前架构

```text
apps/
└── extension
    ├── SidePanel
    ├── Background
    ├── Content Script
    └── Main World Prompt Injector

packages/
├── shared
│   └── 共享类型和消息协议
│
├── storage
│   └── IndexedDB / Dexie 数据层
│
├── memory
│   └── 记忆保存、提取、检索、注入
│
├── skills
│   └── Skill 注册、匹配、启用、调用
│
├── tools
│   └── Tool Registry / Executor / Permissions
│
├── browser-agent
│   └── 页面快照、点击、输入、滚动、跳转
│
├── site-adapters
│   └── DeepSeek / Kimi 等网页适配器
│
├── mcp
│   └── MCP Provider 与外部工具接入
│
└── agent-core
    └── Task / Step / Runtime / Retry / Pause / Resume
```

---

# 当前已经完成的能力

## Site Adapter

当前支持：

- DeepSeek
- Kimi

已具备：

- 页面识别
- 输入区域定位
- 消息发送
- 回复监听
- 对话 ID 识别
- Prompt 注入
- 请求拦截

---

## Memory

当前具备：

- 事实层、候选层、证据层与修订历史
- 同一身份键唯一事实；相同内容只强化证据，不重复保存
- 候选确认、冲突处理、手动修订与软删除
- 旧版记忆的增量迁移；不在启动时静默删除数据
- Profile / Preference / Project / Episode / Procedure / Knowledge
- Global / Provider / Project Scope
- 本地关键词检索、作用域/时效/重要度评分与 MMR 去相似排序
- 有字符预算和不可信数据提示的上下文注入
- Secret 内容不会自动保存或注入
- 跨平台复用
- 记忆卡片详情、来源证据、修订历史、候选审核
- settled 回复监听，避免流式片段写入重复记忆
- 会话归档与本地归档检索
- 召回诊断日志（最近 7 天，最多 100 条）
- 导入 / 导出

当前状态：

> 核心数据完整性与人工可控写入已可用；向量召回与后台整理仍是可选增强。

后续重点：

- Embedding
- 语义检索
- 可选重排序模型
- 后台归档整理与过期候选提醒
- 更细粒度的长期记忆生命周期策略

---

## Skill

当前具备：

- 内置 Skill
- 用户 Skill
- 注册
- 删除
- 开关
- Trigger
- Prompt
- Workflow
- Knowledge
- Tool 声明
- Skill 匹配
- Skill 上下文注入

当前状态：

> 已经具备“可复用能力描述”，但还没有完全升级成独立执行单元。

未来 Skill 应支持：

```text
Skill
├── manifest
├── description
├── triggers
├── instructions
├── workflow
├── tools
├── permissions
├── knowledge
├── memory_rules
└── output_schema
```

---

## Tool Runtime

当前具备：

- Tool Registry
- Tool Executor
- 参数校验
- Permission Manager
- Tool History
- Tool Retry
- Tool Result

当前工具类型：

```text
memory.*
browser.*
mcp.*
```

未来继续扩展：

```text
filesystem.*
shell.*
github.*
database.*
native.*
extension.*
```

---

## Browser Agent

当前支持：

- browser.snapshot
- browser.click
- browser.type
- browser.scroll
- browser.navigate
- 页面交互元素 Ref

当前状态：

> 已经能完成基础网页操作，但还没有达到复杂网页自动化能力。

后续需要：

- wait
- hover
- keyboard
- dialog
- upload
- new tab
- tab switch
- iframe
- Shadow DOM
- failure recovery
- re-snapshot
- element stale detection

---

## MCP

当前具备：

- MCP Provider 抽象
- 内置 Echo
- Memory Notes
- HTTP Bridge

当前状态：

> MCP 管线已经建立，但标准 MCP 协议支持仍未完成。

后续重点：

- Streamable HTTP
- stdio
- initialization
- capabilities
- tools/list
- tools/call
- session lifecycle
- resources
- prompts

---

## Project

当前具备：

- Project 创建
- Project 保存
- Project 删除
- Active Project
- Project Context
- Project Scope Memory
- 会话绑定项目
- Agent Task 绑定项目

---

## Agent Runtime

当前已经具备：

- Agent Task
- Agent Step
- Task Status
- Pause
- Resume
- Retry
- Persistence
- Hydrate
- Tool Execution
- Task History

当前 Planner 仍是启发式规则实现：

```text
打开 → browser.navigate
搜索 → browser.snapshot
输入 → browser.type
点击 → browser.click
```

该 Planner 仅用于早期 MVP 验证。

最终架构将升级为：

> **网页模型驱动的 Agent Tool Loop**

---

# 最终 Agent 架构

```text
                  OmniAgent

              ┌────────────┐
              │ Agent Task │
              └─────┬──────┘
                    │
                    ▼
            Context Builder
        ┌───────────┼───────────┐
        │           │           │
      Memory      Skills      Project
        │           │           │
        └───────────┼───────────┘
                    │
                 Tools
                    │
                    ▼
              Site Adapter
                    │
      ┌─────────────┼─────────────┐
      │             │             │
  DeepSeek Web    Kimi Web     Future AI
      │             │             │
      └─────────────┼─────────────┘
                    │
                    ▼
                Decision
        ┌───────────┼───────────┐
        │           │           │
     Tool Call   Ask User     Finish
        │
        ▼
    Tool Runtime
        │
        ▼
     Tool Result
        │
        ▼
     Save Step
        │
        └──────────────→ 再次交给网页 AI
```

---

# 最重要的架构边界

## OmniAgent 负责

```text
Task
Step
State
Memory
Skill
Tool
Permission
Project
History
Retry
Pause
Resume
Cross-provider continuity
```

## 网页 AI 负责

```text
Understanding
Reasoning
Decision
Tool Selection
Next Step
Final Answer
```

---

# 未来核心能力：跨网页 AI 继续同一个任务

例如：

```text
任务：调研 10 个 Agent 项目
```

开始时：

```text
DeepSeek
↓
Step 1
Step 2
Step 3
```

如果 DeepSeek 不可用：

```text
切换 Kimi
↓
OmniAgent 注入：
- 原始 Goal
- 已完成 Steps
- Tool Results
- Memory
- Skills
- Project
↓
Kimi 从 Step 4 继续
```

这将是 OmniAgent 和普通单平台 AI 扩展最重要的差异之一。

---

# 当前开发阶段

当前项目已经完成：

```text
工程基础
Site Adapter
Storage
Memory 基础
Skill 基础
Tool Runtime
Browser Agent 基础
MCP 管线
Agent Runtime 基础
Project
SidePanel 管理
```

当前真正的核心缺口：

```text
1. 网页模型驱动 Tool Loop
2. 统一 Tool Call 协议
3. Agent Continuation
4. Agent Session 与网页 Conversation 解耦
5. Provider 切换和任务恢复
6. Skill Runtime
7. 标准 MCP
8. Memory 智能化
```

---

# 下一阶段开发重点

## P0

### 1. Web Model Agent Loop

实现：

```text
模型回复
↓
Tool Call Parser
↓
Tool Executor
↓
Tool Result
↓
Continuation Prompt
↓
网页 AI 继续生成
```

---

### 2. Agent Session

Agent Task 必须独立于网页 Conversation。

核心字段：

```text
id
goal
status
providerId
conversationId
projectId
selectedSkills
steps
toolResults
createdAt
updatedAt
```

---

### 3. Provider Adapter Contract

统一：

```text
sendPrompt()
continueConversation()
observeResponse()
getConversationId()
stopGeneration()
isGenerating()
```

---

### 4. Tool Call Protocol

统一模型输出协议：

```text
tool_call
ask_user
finish
```

第一版优先使用稳定、易解析的结构化文本协议。

---

### 5. Tool Result Continuation

工具执行后自动回传：

```text
Goal
Current Task State
Executed Step
Tool Result
Available Tools
Instruction:
Decide the next action.
```

---

# 开发原则

1. 核心模式不依赖 API Key。
2. 网页 AI 只是可替换的推理引擎。
3. Agent Task 必须属于 OmniAgent。
4. 不把任务状态寄存在网页对话里。
5. Tool Runtime 与 Provider 解耦。
6. Skill 与具体模型解耦。
7. Memory 与具体平台解耦。
8. 先完成闭环，再扩 UI。
9. 不为了“和其他项目不同”而重复造无价值的机制。
10. 优先完成真正改变 Agent 能力的核心链路。

---

# 开发

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install
```

启动扩展：

```bash
pnpm dev
```

类型检查：

```bash
pnpm typecheck:all
```

单元测试：

```bash
pnpm test
```

构建：

```bash
pnpm build
```

---

# Roadmap

详细规划：

```text
doc/08-OmniAgent-Development-Roadmap.md
```

---

# 最终目标

OmniAgent 最终不是：

> DeepSeek 插件  
> Kimi 插件  
> 多平台 Prompt 注入器

它的目标是：

> **一个真正属于用户自己的 Agent。**

拥有自己的：

```text
Memory
Skills
Tools
Projects
Tasks
Execution History
```

并且可以自由借用不同网页 AI 的推理能力。

**One Agent. Every AI.**
