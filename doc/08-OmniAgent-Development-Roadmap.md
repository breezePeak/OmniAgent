# OmniAgent Development Roadmap

## 项目目标

OmniAgent 是一个跨 AI 平台的个人 Agent 系统。

目标：

让 ChatGPT、DeepSeek、Kimi、豆包、千问等网页版 AI 共享：

-   长期记忆 Memory
-   Skill 技能系统
-   Tool 工具系统
-   MCP 扩展能力
-   Browser Agent 浏览器控制
-   Project 项目上下文
-   Agent 自动执行能力

核心理念：

AI 平台只是入口，用户的数据、记忆、技能和工具属于 OmniAgent。

------------------------------------------------------------------------

# 总体开发路线

    Phase 0  工程基础
    Phase 1  Site Adapter
    Phase 2  Storage 数据层
    Phase 3  Memory 系统
    Phase 4  Skill 系统
    Phase 5  Tool Runtime
    Phase 6  Browser Agent
    Phase 7  MCP
    Phase 8  Agent Runtime

------------------------------------------------------------------------

# Phase 0：工程基础

## 目标

建立长期可维护的工程基础。

不开发 AI 功能，只搭建：

-   Monorepo
-   浏览器插件
-   模块边界
-   通信链路

## 技术

-   Vue3
-   TypeScript
-   WXT
-   Pinia
-   Element Plus
-   TailwindCSS
-   pnpm workspace

## 完成标准

-   插件可以加载
-   Vue 页面正常显示
-   SidePanel 可打开
-   Background 正常运行
-   Content Script 注入成功
-   三层通信成功

------------------------------------------------------------------------

# Phase 1：Site Adapter

## 目标

建立 AI 网站接入体系。

原则：

AI 网站只是 Adapter。

Core 不依赖具体平台。

支持：

-   DeepSeek
-   Kimi

实现：

-   页面识别
-   输入框定位
-   消息发送
-   回复监听

完成标准：

DeepSeek 和 Kimi 使用同一套 Core。

------------------------------------------------------------------------

# Phase 2：Storage 数据层

## 目标

建立 OmniAgent 数据基础。

技术：

-   IndexedDB
-   Dexie

核心数据：

-   providers
-   conversations
-   messages
-   settings

完成：

-   数据保存
-   数据读取
-   会话管理

------------------------------------------------------------------------

# Phase 3：Memory 系统

## 目标

实现跨 AI 平台长期记忆。

Memory 类型：

-   Profile
-   Preference
-   Project
-   Episode
-   Procedure
-   Knowledge

流程：

用户反馈

↓

Memory Extractor

↓

Memory Storage

读取：

当前任务

↓

Memory Retriever

↓

上下文注入

完成标准：

DeepSeek 保存的信息，Kimi 可以使用。

------------------------------------------------------------------------

# Phase 4：Skill 系统

## 目标

实现可复用 AI 工作能力。

Skill 结构：

    skill

    ├── SKILL.md
    ├── manifest.json
    ├── references
    ├── scripts
    └── assets

Skill 包含：

-   Prompt
-   Workflow
-   Knowledge
-   Tools
-   Permissions
-   Memory Rules

完成：

-   Skill 加载
-   Skill 注册
-   Skill 调用

------------------------------------------------------------------------

# Phase 5：Tool Runtime

## 目标

统一所有工具。

工具来源：

-   Built-in Tool
-   Browser Tool
-   MCP Tool
-   Native Tool
-   Extension Tool

核心：

-   Tool Registry
-   Tool Executor
-   Permission Manager

第一批工具：

-   memory.search
-   memory.save
-   browser.snapshot

------------------------------------------------------------------------

# Phase 6：Browser Agent

## 目标

让 AI 操作浏览器。

第一阶段：

    browser.snapshot

    browser.click

    browser.type

    browser.scroll

    browser.navigate

示例：

用户：

打开 GitHub 搜索 OmniAgent

执行：

打开页面

↓

输入关键词

↓

点击搜索

↓

读取结果

------------------------------------------------------------------------

# Phase 7：MCP

## 目标

连接外部工具生态。

支持：

-   Filesystem MCP
-   GitHub MCP
-   Shell MCP
-   Database MCP

架构：

    Agent

    ↓

    Tool Runtime

    ↓

    MCP Provider

    ↓

    MCP Server

------------------------------------------------------------------------

# Phase 8：Agent Runtime

## 目标

实现完整 Agent。

流程：

    用户目标

    ↓

    Task

    ↓

    Plan

    ↓

    Step

    ↓

    Tool

    ↓

    Result

    ↓

    Memory

    ↓

    完成

增加：

-   任务暂停
-   任务恢复
-   自动重试
-   执行日志
-   长任务管理

------------------------------------------------------------------------

# MVP 目标

3个月版本：

支持：

-   DeepSeek
-   Kimi

实现：

-   浏览器插件
-   统一 Memory
-   Skill
-   Tool
-   Browser Agent

------------------------------------------------------------------------

# Codex 开发规则

不要一次开发全部功能。

推荐顺序：

1.  Phase 0 工程初始化
2.  Site Adapter 框架
3.  DeepSeek Adapter
4.  Kimi Adapter
5.  Storage
6.  Memory
7.  Skill
8.  Tool Runtime
9.  Browser Agent
10. MCP + Agent Loop

------------------------------------------------------------------------

# 最终目标

OmniAgent 成为：

用户的个人 AI 操作系统。

拥有：

-   一个长期记忆
-   一套 Skill
-   一套工具
-   一个 Agent 大脑

连接：

-   所有 AI 模型
-   所有网页服务
-   所有本地能力
