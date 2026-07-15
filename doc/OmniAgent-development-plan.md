# OmniAgent 后续开发计划

## 一、项目定位

OmniAgent 的定位是：

> **网页 AI 的跨平台能力补全层。**

用户仍然在 DeepSeek、Kimi 等网页原生聊天框中使用大模型。

网页 AI 负责：

- 理解用户请求
- 推理
- 使用自身已有能力
- 搜索网页
- 打开链接
- 阅读页面
- 总结内容
- 生成最终回答

OmniAgent 负责补充网页 AI 缺少的能力：

- 跨平台长期记忆
- 用户自己的 Skill
- Project 项目上下文
- MCP 外部工具
- 本地工具
- Browser Control 浏览器操作
- 长任务状态
- 跨 Provider 任务恢复

核心模式不要求用户填写：

```text
BaseURL
API Key
Model
```

外部模型 API 后续可以作为可选能力，但不能成为 OmniAgent 的核心依赖。

---

# 二、核心开发原则

1. 普通聊天继续使用网页 AI 原生聊天框。
2. 不重复开发网页 AI 已经具备的搜索、网页读取和总结能力。
3. OmniAgent 只补充平台缺少的能力。
4. Memory、Skill、Project 和 Tool 必须与具体 AI 平台解耦。
5. Agent Task 只用于复杂、长时间、多工具任务。
6. 普通聊天不默认创建 Agent Task。
7. 当前正则 Planner 只作为测试或兜底，不再继续扩大。
8. 所有外部工具统一进入 Tool Runtime。
9. Browser Agent 改为 Browser Control，只负责真正操作网页。
10. 先完成核心闭环，再继续扩充 SidePanel UI。

## 当前状态总览（2026-07-16）

| 范围 | 状态 | 当前结论 | 下一动作 |
|---|---|---|---|
| 阶段一至九 | 主链路已完成，待真实页面回归 | Memory、Skill、Provider、Tool、Browser、MCP、Task 和跨 Provider 代码链路已建立 | E2E 发现问题时补回归测试 |
| 阶段十 A | 已完成 | CI、89 项自动测试、生产构建、产物校验和基础 Adapter 健康状态已通过 | 保持 `release:check` 持续通过 |
| 阶段十 B | 当前阶段 | 需要在真实登录态 DeepSeek/Kimi 页面证明记忆写入与召回成立 | 按 E2E 用例矩阵逐项执行 |
| 阶段十 C | 未开始 | 等待真实页面缺陷清单 | 做兼容性、迁移、安全和压力加固 |
| 阶段十 D | 未开始 | 不满足发布条件 | 完成 RC、正式发布和首周观察 |

状态规则：

- “代码完成”不等于“阶段完成”；
- 只有自动测试、真实页面结果和持久化记录一致时，场景才算通过；
- 阶段十 B/C/D 必须满足各自退出条件后才能进入下一阶段；
- E2E 发现的缺陷必须先补自动回归测试，再标记为修复完成。

---

# 三、阶段一：清理当前演示内容

## 目标

解决首次启动后直接显示：

```text
3 个 Skill
11 个 Tool
```

造成的误导。

## 3.1 Skill 不再自动安装

当前自动写入的三个内置 Skill：

```text
concise-reply
research-agent
code-review
```

调整为：

- 保留为 Skill 模板；
- 首次启动不自动安装；
- 用户点击“安装”后才写入已安装 Skill；
- 模板和已安装 Skill 分开显示。

## 3.2 删除生产环境 Demo MCP

生产环境不再默认注册：

```text
mcp.echo.echo
mcp.notes.notes.write
mcp.notes.notes.read
mcp.notes.notes.list
```

这些只在开发模式或测试模式启用。

## 3.3 Tool 分类加载

首次启动只注册：

```text
memory.search
memory.save
```

开启 Browser Control 后再注册：

```text
browser.snapshot
browser.click
browser.type
browser.scroll
browser.navigate
```

用户添加 MCP 后再注册：

```text
mcp.*
```

## 验收标准

全新安装后：

```text
Skill：0
Tool：2
MCP：0
```

Skill 页面区分：

```text
已安装 Skill
Skill 模板
```

---

# 四、阶段二：完成跨平台 Memory 闭环

## 目标

先把 OmniAgent 最核心的价值做稳定：

> 在 DeepSeek 保存的信息，切换到 Kimi 后仍然可以使用。

## 4.1 完善记忆管理

支持：

```text
新增
编辑
删除
置顶
搜索
类型
作用域
项目绑定
```

## 4.2 记忆作用域

支持：

```text
Global
Provider
Project
```

## 4.3 明确记忆提取

第一版只识别明确表达：

```text
请记住……
以后都……
我喜欢……
我不喜欢……
我的习惯是……
这个项目要求……
```

## 4.4 保存策略

提供三种模式：

```text
自动保存
保存前确认
关闭自动记忆
```

## 4.5 注入诊断

SidePanel 显示：

```text
本次匹配了几条记忆
注入了哪些记忆
为什么匹配
注入到了哪个平台
```

## 验收场景

在 DeepSeek 输入：

```text
请记住：我不喜欢“不是……而是……”这种句式。
```

切换到 Kimi 后输入：

```text
帮我修改这段文案。
```

Kimi 应自动遵守该偏好。

---

# 五、阶段三：重做 Skill 使用流程

## 目标

Skill 不再是启动时自动出现的演示数据，而是用户主动安装、管理并跨平台复用的能力包。

## 5.1 Skill 模板库

提供模板，但不自动安装：

```text
简洁回复
代码审查
调研助手
短视频脚本
```

## 5.2 Skill 安装流程

```text
查看模板
预览内容
点击安装
启用
停用
删除
```

## 5.3 Skill 结构

```text
name
description
triggers
instructions
workflow
knowledge
tools
permissions
source
enabled
```

## 5.4 Skill 匹配日志

显示：

```text
用户请求
候选 Skill
每个 Skill 的匹配得分
最终注入的 Skill
```

## 5.5 手动控制

支持：

```text
本次强制使用某个 Skill
本次禁用全部 Skill
```

## 验收场景

安装“短视频脚本 Skill”后：

```text
DeepSeek 可以使用
Kimi 可以使用
关闭后立即停止生效
删除后不再匹配
```

---

# 六、阶段四：建立 Provider 能力识别

## 目标

避免重复实现网页 AI 已经具备的能力。

## 能力模型

```ts
interface ProviderCapabilities {
  nativeWebSearch: boolean;
  nativeUrlRead: boolean;
  nativeFileAnalysis: boolean;
  nativeImageAnalysis: boolean;
  nativeToolLoop: boolean;
  browserDomControl: boolean;
}
```

## DeepSeek 第一版能力

根据实际验证配置：

```text
网页搜索
URL 读取
网页总结
文件理解
原生工具循环
```

## 注入规则

当平台已有：

```text
nativeWebSearch
nativeUrlRead
```

OmniAgent 不再重复注入：

```text
web.search
web.fetch
普通网页阅读工具
```

只注入平台缺少的能力：

```text
memory.*
用户 Skill
MCP
本地工具
Browser Control
```

## 验收标准

用户要求：

```text
总结一个 GitHub 地址
```

DeepSeek 继续使用自己的原生能力。

OmniAgent 不插入 Browser Control 流程。

---

# 七、阶段五：做最小 Tool Loop

## 目标

网页 AI 只有在需要 OmniAgent 独有能力时，才调用 OmniAgent Tool。

第一版只支持：

```text
memory.search
memory.save
```

## Tool Call 协议

模型输出：

```xml
<omniagent-tool-call>
{
  "name": "memory.save",
  "arguments": {
    "content": "用户喜欢简洁回复",
    "type": "preference"
  }
}
</omniagent-tool-call>
```

OmniAgent 执行后回传：

```xml
<omniagent-tool-result>
{
  "name": "memory.save",
  "ok": true,
  "result": {
    "saved": true
  }
}
</omniagent-tool-result>
```

网页 AI 再继续完成回答。

## 开发模块

```text
Tool Call Parser
Tool Call Validator
Tool Executor
Tool Result Serializer
Continuation Sender
Loop Stop Condition
```

## 验收场景

用户输入：

```text
总结这个 GitHub 项目，并帮我记住主要功能。
```

执行过程：

```text
DeepSeek 使用原生能力总结 GitHub
↓
DeepSeek 调用 memory.save
↓
OmniAgent 保存
↓
结果回传 DeepSeek
↓
DeepSeek 告知用户已经保存
```

---

# 八、阶段六：把 Browser Agent 改成 Browser Control

## 目标

Browser Control 只负责真正操作网页，不负责普通网页搜索和阅读。

## 应该处理

```text
点击按钮
填写表单
选择菜单
上传文件
提交内容
操作后台系统
切换标签页
```

## 不应该接管

```text
搜索新闻
打开 GitHub README
总结普通网页
读取公开页面
```

## 第一版工具

```text
browser.snapshot
browser.click
browser.type
browser.scroll
browser.navigate
browser.wait
```

## 第二版工具

```text
browser.hover
browser.press
browser.upload
browser.dialog
browser.tab.list
browser.tab.open
browser.tab.switch
browser.tab.close
```

## 安全边界

用户必须：

```text
主动开启 Browser Control
选择受控标签页
```

高风险操作必须确认：

```text
发送
发布
删除
提交
购买
修改账号
```

## 验收场景

```text
打开指定后台
点击创建
填写标题和内容
停在提交按钮前等待用户确认
```

---

# 九、阶段七：接入标准 MCP

## 目标

让用户可以添加真正的外部工具，而不是继续使用 Echo 和 Notes Demo。

## 第一版

支持：

```text
Streamable HTTP
initialize
tools/list
tools/call
```

## 第二版

支持：

```text
stdio Native Host
resources
prompts
session lifecycle
```

## 管理功能

```text
添加 MCP
测试连接
刷新工具
启用
停用
按工具授权
删除配置
```

## 原则

所有 MCP Tool 都必须进入：

```text
Tool Runtime
```

不能绕过权限、日志和执行记录。

---

# 十、阶段八：最后再做 Agent Task

## 目标

Agent Task 只用于复杂、长时间、多工具任务，不覆盖所有普通聊天。

## 普通聊天

以下任务不创建 Agent Task：

```text
总结网页
写文案
解释代码
回答问题
普通调研
```

## Agent Task

以下任务才创建：

```text
连续操作多个网页
连续调用多个外部工具
需要暂停恢复
需要失败重试
需要跨页面执行
需要自动化
需要跨 Provider 继续
```

## 第一版入口

不要自动判断。

在 SidePanel 提供明确按钮：

```text
启动 Agent 任务
```

用户主动启动后才创建 Task。

## Task 字段

```text
id
goal
status
providerId
conversationId
projectId
steps
toolResults
createdAt
updatedAt
```

## 状态

```text
idle
running
waiting_model
waiting_tool
waiting_user
stopped
completed
failed
```

---

# 十一、阶段九：跨 Provider 继续任务

## 目标

实现 OmniAgent 区别于单平台扩展的核心能力：

> 同一个任务可以从 DeepSeek 切换到 Kimi 继续。

## 流程

```text
DeepSeek 完成 Step 1～3
↓
用户切换到 Kimi
↓
OmniAgent 注入：
- 原始目标
- 已完成步骤
- 工具结果
- 当前项目
- 相关记忆
- 已选择 Skill
↓
Kimi 从下一步继续
```

## 验收标准

切换平台后：

- 不重新执行成功步骤；
- Task ID 不变；
- 历史步骤不丢失；
- 新 Provider 能理解当前进度。

---

# 十二、阶段十：稳定性和发布

## CI

每次提交自动执行：

```bash
pnpm install
pnpm typecheck:all
pnpm test
pnpm build
```

## 自动测试

覆盖：

```text
DeepSeek Prompt 注入
Kimi Prompt 注入
Memory 跨平台召回
Skill 匹配
Tool Call 解析
Tool Result 回传
Browser Control
MCP 调用
Pause / Resume
Provider Switch
```

## Adapter 健康检查

显示：

```text
页面识别是否成功
输入框是否找到
回复监听是否正常
请求注入是否成功
当前网页版本是否可能不兼容
```

## 当前进展（2026-07-16）

阶段十 A 已完成：

- GitHub Actions 自动执行安装、类型检查、测试、生产构建和产物校验；
- 本地可用 `pnpm release:check` 一次执行完整发布门禁；
- 89 项自动测试通过，包含 DeepSeek 写入、Kimi 召回的跨平台 Memory 集成测试；
- 构建校验会检查 MV3 Manifest、DeepSeek/Kimi 内容脚本和关键记忆功能标记；
- 侧边栏显示输入框、发送按钮、消息监听和回复监听的运行时健康状态。

阶段十 B：真实页面 E2E：

1. 固定 Chrome 版本、DeepSeek/Kimi 测试账号和测试数据，加载最新未打包扩展；
2. 分别确认两个站点的页面识别、输入框、发送按钮、消息监听和回复监听健康；
3. 在 DeepSeek 依次验证“记住文本”“记住上文”“记住当前对话”；
4. 分别上传 TXT、DOCX、PDF，验证“记住附件”完成解析、分块、落库和来源记录；
5. 每次写入后立即检查记忆管理页，确认真实存在且安全内容不再逐条要求确认；
6. 验证页面回复显示真实保存结果，禁止只显示“记住了”但没有落库；
7. 切换到 Kimi 新会话，验证以上文本和文档内容可以按作用域召回；
8. 覆盖刷新页面、重启扩展、重复保存、冲突值、空文件、损坏文件和超限文件；
9. 保存每个场景的执行日志、截图和失败原因，形成可重复的 E2E 报告。

阶段十 B 退出条件：

- 两个平台核心场景全部通过；
- 写入结果、数据库记录和跨平台召回三者一致；
- 不存在静默结束、虚假成功或必须逐条确认的回归；
- 失败场景提供可见、可定位、可恢复的错误信息。

## 真实页面 E2E 用例矩阵

每轮使用唯一运行编号，例如 `OMNI-E2E-20260716-01`。测试内容不得包含真实密码、令牌或敏感业务文档。

| ID | 场景 | 操作 | 通过标准 | 必留证据 |
|---|---|---|---|---|
| ADP-DS-01 | DeepSeek Adapter 基线 | 打开新会话并刷新一次 | 页面、输入框、发送按钮、消息与回复监听状态正确 | 健康状态截图、页面 URL |
| ADP-KM-01 | Kimi Adapter 基线 | 打开新会话并刷新一次 | 页面、输入框、发送按钮、消息与回复监听状态正确 | 健康状态截图、页面 URL |
| MEM-DS-01 | 记住明确文本 | 输入“请记住：项目发布代号是北极星 + 运行编号” | 页面显示真实保存结果；Fact 新增；无待确认 Candidate | 页面截图、Fact/Evidence ID |
| MEM-DS-02 | 记住上文 | 先发送事实，再发送“记住上面内容” | 保存的是上一条有效用户内容，不保存确认话术或工具协议 | 页面截图、来源摘录 |
| MEM-DS-03 | 记住当前对话 | 发送多轮内容后要求记住当前对话 | 有效内容按规则保存，模型回复、状态文本和内部协议不进入记忆 | 保存结果、记忆列表 |
| FILE-TXT-01 | TXT 文档记忆 | 上传测试 TXT 并要求记住 | 文档解析、语义分块、Artifact、Fact 和来源定位完整 | 文件哈希、Artifact/Fact ID |
| FILE-DOCX-01 | DOCX 文档记忆 | 上传含标题、表格和问答的 DOCX | 标题、表格、问答与来源元数据可召回 | 文件哈希、解析摘要 |
| FILE-PDF-01 | PDF 文档记忆 | 上传多页 PDF | 页码定位正确，跨页内容不产生虚假事实 | 文件哈希、页码证据 |
| MEM-DUP-01 | 重复保存 | 连续两次保存同一事实 | 强化原 Fact 证据，不产生重复 Fact | 前后 Fact 数量 |
| MEM-CONFLICT-01 | 冲突值 | 保存同一键的不同值 | 只对真实冲突进入确认流程，原 Fact 不被静默覆盖 | Candidate 与 Revision 记录 |
| MEM-SECRET-01 | 敏感信息 | 要求记住测试令牌格式文本 | 自动保存被拒绝；检索和 Prompt 均不包含该内容 | 拒绝结果、检索结果 |
| XPROV-DS-KM-01 | DeepSeek 到 Kimi | 在 Kimi 新会话询问 DeepSeek 保存的事实和文档 | 按正确作用域召回，回答可追溯到原 Evidence | Kimi 回复、召回诊断 |
| XPROV-KM-DS-01 | Kimi 到 DeepSeek | 在 Kimi 保存唯一事实，再到 DeepSeek 新会话询问 | 反向写入与召回同样成立 | 两端截图、Fact ID |
| PERSIST-01 | 持久化 | 刷新页面、重启扩展和浏览器后重复召回 | Fact、Evidence、Artifact 不丢失、不重复迁移 | 重启前后数量与 ID |
| FAIL-FILE-01 | 文件失败路径 | 上传空、损坏、不支持和超限文件 | 显示明确错误，不落脏数据，不静默结束 | 错误截图、数据库计数 |
| FAIL-DOM-01 | Adapter 降级 | 人为使首选选择器失效或使用兼容性夹具 | 使用备用选择器，或明确提示页面不兼容 | 健康状态、控制台日志 |

## E2E 证据规范

每轮报告至少记录：

- 运行编号、执行时间、执行人和源码 Commit；
- Chrome 版本、扩展版本、构建目录摘要；
- DeepSeek/Kimi 页面 URL 和 Adapter 健康状态；
- 每个用例的 `PASS`、`FAIL` 或 `BLOCKED`；
- 写入前后的 Fact、Candidate、Evidence、Artifact 数量；
- 关键记录 ID、来源摘录、文件哈希和作用域；
- 页面截图、脱敏后的控制台日志和失败复现步骤；
- 缺陷编号、严重级别、对应修复 Commit 和回归测试名称。

建议使用 [E2E 执行记录模板](./e2e/README.md)，将报告保存为 `doc/e2e/OMNI-E2E-<日期>-<序号>.md`，截图和脱敏日志放在同名目录中。测试报告不得提交登录态 Cookie、令牌、原始私密文档或未脱敏日志。

## 缺陷分级与发布阻断

| 级别 | 定义 | 示例 | 发布规则 |
|---|---|---|---|
| P0 | 数据或安全灾难 | 记忆丢失、敏感信息泄漏、越权操作、数据库损坏 | 立即停止测试和发布，修复后重跑全部门禁 |
| P1 | 核心闭环不可用 | 虚假“记住了”、静默结束、跨平台无法召回、安全内容仍逐条确认 | 阶段十 B/C 不得退出，必须修复并补回归测试 |
| P2 | 有明确绕行方案的功能缺陷 | 单一文件结构解析不完整、备用选择器失效但有清晰提示 | RC 前应修复；延期必须记录负责人和目标版本 |
| P3 | 不影响任务完成的体验问题 | 文案、间距、非关键诊断展示问题 | 可进入后续版本，但必须进入缺陷清单 |

阶段推进要求：P0、P1 必须为零；P2 必须有明确结论；任何“无法复现”都不能直接视为已修复。

阶段十 C：稳定性与兼容性加固：

1. 将请求注入结果、响应监听状态和页面兼容性结论加入 Adapter 健康检查；
2. 为站点 DOM 变化准备多组选择器和明确的降级提示；
3. 验证旧版本 IndexedDB 升级、扩展重启、浏览器重启后的记忆完整性；
4. 检查权限、敏感信息过滤、日志脱敏、附件大小和解析资源上限；
5. 连续运行长会话、批量文档和跨 Provider 切换，检查重复写入、内存占用和响应延迟；
6. 将 E2E 中发现的每个缺陷补成自动回归测试，再重新执行 `pnpm release:check`。

阶段十 C 退出条件：

- 真实页面 E2E 连续三轮通过；
- 数据迁移、异常恢复和安全检查通过；
- CI、89 项以上自动测试、生产构建及产物校验全部通过；
- 没有阻塞发布的高优先级缺陷。

阶段十 D：发布候选与正式发布：

1. 更新扩展版本号，整理变更记录、已知问题、安装说明和回滚说明；
2. 生成 Chrome MV3 发布包、校验摘要和对应的源码版本标记；
3. 安装发布包做一次独立冒烟测试，确认结果与开发构建一致；
4. 发布 RC 版本，小范围观察真实使用中的保存成功率、召回成功率和 Adapter 失败率；
5. 修复 RC 阻塞问题并重复完整发布门禁；
6. 正式发布后保留上一个稳定包，按日复查首周问题并支持快速回滚。

阶段十 D 退出条件：

- 发布包可安装、可升级、可回滚；
- 发布版本与 Git 标签、构建产物和发布说明一致；
- 首轮观察期没有数据丢失、虚假保存或大面积站点不兼容问题。

## 发布候选检查清单

发布 RC 前逐项确认：

- [ ] 工作区无未说明改动，目标 Commit 已推送并通过 CI；
- [ ] `pnpm release:check` 在干净安装环境执行成功；
- [ ] 阶段十 B 全部 E2E 用例通过，阶段十 C 连续三轮通过；
- [ ] P0、P1 为零，所有 P2 已修复或完成延期审批记录；
- [ ] 扩展版本号、Manifest、变更记录和发布说明一致；
- [ ] 权限清单、隐私说明、敏感信息过滤和日志脱敏已复核；
- [ ] IndexedDB 升级、旧数据保留、备份与回滚路径已验证；
- [ ] 生成 Chrome MV3 ZIP、SHA-256 摘要和构建信息；
- [ ] 从 ZIP 独立安装后完成 DeepSeek/Kimi 冒烟测试；
- [ ] 上一个稳定版本安装包和回滚说明可用；
- [ ] RC 观察指标、问题反馈入口和负责人已明确。

正式发布前再确认：

- [ ] RC 观察期没有新增 P0/P1；
- [ ] 保存成功率、跨平台召回成功率和 Adapter 健康率达到 RC 目标；
- [ ] 最终 Git 标签准确指向已验证 Commit；
- [ ] 发布包摘要与 RC 验证记录一致；
- [ ] 首周每日复查和紧急回滚安排已经生效。

## RC 最低观察样本与指标

最低样本：

- DeepSeek 和 Kimi 各执行至少 20 次明确记忆写入；
- DeepSeek 到 Kimi、Kimi 到 DeepSeek 各执行至少 10 次受控召回；
- TXT、DOCX、PDF 各使用至少 4 个有效夹具；
- 至少执行 5 次扩展重启和 3 次浏览器重启；
- 两个平台各执行至少 20 次新会话 Adapter 基线检查。

必须达到：

| 指标 | 目标 | 计算口径 |
|---|---|---|
| 虚假保存率 | 0% | 显示保存成功但没有对应持久化记录的次数 / 显示成功次数 |
| 静默结束率 | 0% | 没有成功结果也没有可见错误的次数 / 总写入尝试次数 |
| 核心 E2E 通过率 | 100% | 必选用例通过数 / 必选用例总数 |
| 受控跨平台召回率 | 100% | 正确召回且作用域正确的次数 / 受控召回次数 |
| 重启后数据一致率 | 100% | 重启后 ID、内容和来源保持一致的记录数 / 重启前记录数 |
| 有效文件处理率 | 100% | 正确解析并落库的有效夹具数 / 有效夹具总数 |
| Adapter 基线成功率 | 不低于 95% | 无需人工修改页面即可识别并监听的次数 / 基线检查次数 |
| 未处理内部异常 | 0 | 脱敏日志中的未捕获异常数量 |

任一数据丢失、敏感信息泄漏、虚假保存或错误作用域召回都直接判为 P0/P1，不得用总体成功率抵消。

---

# 十三、实际开发顺序

当前按以下顺序执行：

```text
1. 阶段一至九：功能主链路已完成，后续只处理回归问题
2. 阶段十 A：CI、自动测试、生产构建和产物校验已完成
3. 阶段十 B：真实 DeepSeek/Kimi 页面 E2E
4. 阶段十 C：稳定性、兼容性、迁移和安全加固
5. 阶段十 D：发布候选、正式发布和首周观察
```

---

# 十四、近期三个里程碑

## 里程碑一：干净可用

完成后首次启动：

```text
Skill：0
Tool：2
MCP：0
```

用户能清楚知道哪些是系统能力，哪些是自己安装的能力。

## 里程碑二：跨平台能力成立

完成：

```text
DeepSeek 保存 Memory
Kimi 使用 Memory

安装一个 Skill
DeepSeek 和 Kimi 都能使用
```

## 里程碑三：能力补全闭环

完成：

```text
网页 AI 使用原生搜索和网页读取
需要 OmniAgent 能力时调用 Tool
执行结果回传原网页会话
网页 AI 继续回答
```

---

# 十五、当前暂时不要继续做

暂停开发：

```text
更多首页统计卡片
更多 Agent 目标预设
继续增加演示 Skill
继续增加演示 Tool
扩大正则 Planner
重复开发 web_search
重复开发 web_fetch
默认让所有聊天进入 Agent Task
```

---

# 十六、当前最近一步

当前第一步是阶段十 B：

> **使用最新 Chrome MV3 构建，在真实登录态 DeepSeek 和 Kimi 页面执行完整记忆 E2E。**

按以下批次执行，不把所有问题堆到最后处理：

| 批次 | 用例 | 目标 | 输出 |
|---|---|---|---|
| B1 基线与文本 | `ADP-DS-01`、`ADP-KM-01`、`MEM-DS-01`、`MEM-DS-02` | 先证明页面连接、真实落库和可见结果成立 | 第一份 E2E 报告、缺陷清单 |
| B2 对话与文件 | `MEM-DS-03`、`FILE-TXT-01`、`FILE-DOCX-01`、`FILE-PDF-01` | 证明上文、对话和三类文档来源完整 | 解析证据、Artifact/Fact 清单 |
| B3 记忆规则 | `MEM-DUP-01`、`MEM-CONFLICT-01`、`MEM-SECRET-01` | 证明去重、冲突确认和敏感信息边界正确 | 前后数据库计数、候选记录 |
| B4 跨平台与持久化 | `XPROV-DS-KM-01`、`XPROV-KM-DS-01`、`PERSIST-01` | 证明双向召回和重启后数据一致 | 双向截图、重启前后对账 |
| B5 失败与降级 | `FAIL-FILE-01`、`FAIL-DOM-01` | 证明失败可见、可定位且不产生脏数据 | 错误截图、脱敏日志 |
| B6 全量回归 | 全部用例 | 修复缺陷后从干净数据重新执行 | 最终阶段十 B 报告 |

当前只执行 B1。B1 的 P0/P1 修复并补自动测试后才能进入 B2；每批遵循同一规则。全部批次完成后再进入阶段十 C，不得跳过真实页面验收直接制作发布包。
