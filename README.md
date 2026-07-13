# OmniAgent

One memory. Every AI.  
一套记忆，连接所有 AI。

OmniAgent 是跨 AI 平台的个人 Agent 系统。当前以浏览器扩展形式运行，让 DeepSeek、Kimi 等网页版 AI 共享：

- 长期记忆 Memory
- Skill 技能系统
- Tool 工具运行时
- Browser Agent 浏览器操作
- MCP 扩展工具
- Project 项目上下文
- Agent Runtime 任务执行

## 架构

```
apps/extension          浏览器扩展（WXT + Vue3 + Pinia）
packages/
  shared                共享类型与消息协议
  storage               IndexedDB/Dexie 数据层
  memory                记忆提取与检索
  skills                Skill 注册/匹配/调用
  tools                 Tool Registry/Executor
  browser-agent         页面快照与 DOM 操作
  site-adapters         DeepSeek / Kimi 适配器
  mcp                   MCP Provider 与内置 Server
  agent-core            Agent 规划与任务循环
```

## 已支持能力

| 模块 | 状态 |
| --- | --- |
| DeepSeek Adapter | 可用（消息读写 + 记忆注入） |
| Kimi Adapter | 可用（消息读写 + 记忆注入） |
| Memory | 可用（显式提取、检索、跨平台） |
| Skill | 可用（内置 + 用户注册） |
| Tool Runtime | 可用（memory.* / browser.* / mcp.*） |
| Browser Agent | 可用（snapshot/click/type/scroll/navigate + 元素 ref） |
| MCP | 可用（echo / memory-notes） |
| Agent Runtime | 可用（计划、执行、暂停/恢复、持久化） |
| Project | 可用（活动项目上下文注入） |

## 开发

```bash
# 安装依赖
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install

# 启动扩展开发
pnpm dev

# 类型检查（packages）
pnpm --filter "./packages/*" typecheck

# 单测
pnpm --filter @omni-agent/memory test
pnpm --filter @omni-agent/skills test
pnpm --filter @omni-agent/tools test
pnpm --filter @omni-agent/browser-agent test
pnpm --filter @omni-agent/mcp test
pnpm --filter @omni-agent/agent-core test
pnpm --filter @omni-agent/storage test
```

加载扩展：

1. `pnpm dev` 启动后按 WXT 输出目录加载未打包扩展
2. 打开 DeepSeek 或 Kimi 网页
3. 点击扩展图标打开 SidePanel

## 使用提示

- 在对话中说「请记住：...」可自动写入长期记忆
- SidePanel 可管理记忆、Skill、工具、MCP、Agent 任务、项目
- 注入设置可开关 Memory / Skill / Tools / Project
- 备份区支持导出/导入记忆、Skill、项目、会话消息、Agent 任务与设置
- 记忆支持搜索与类型过滤；会话可按平台/活动项目过滤
- Tool Runtime 会记录最近执行历史，可一键重跑
- Agent 任务支持暂停/恢复/删除/状态过滤，运行中自动刷新步骤
- Agent 示例目标：
  - `请记住：我喜欢简洁回复，并搜索记忆 简洁`
  - `打开 https://github.com 并抓取页面快照`
  - `在 GitHub 搜索 OmniAgent`
  - `输入 "OmniAgent" 并点击 "Submit"`

## 路线图

详见 `doc/08-OmniAgent-Development-Roadmap.md`。

后续重点：

1. 真实 MCP 协议对接
2. 模型驱动规划器（替代启发式 planner）
3. 更多 AI 平台 Adapter
4. 更完整的任务日志与恢复
