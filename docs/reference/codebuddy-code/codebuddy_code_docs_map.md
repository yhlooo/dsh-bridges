> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/codebuddy_code_docs_map.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# CodeBuddy Code 文档地图

这是 CodeBuddy Code 所有文档页面及其标题的综合地图,便于 LLM 和用户快速导航。

> **注意:** 本文件由自动化流程生成。请勿手动编辑。
> 最后更新时间: 2026-06-10

## 文档结构

本地图采用层级结构:

* **##** 标记文档组(例如 '快速开始')
* **###** 标记独立的文档页面
* **嵌套列表** 显示每个页面内的标题结构
* 每个页面标题链接到完整文档

## 快速开始

### [概述](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/README.md)

* 为什么选择 CodeBuddy Code
  * 用自然语言驱动整个开发运维生命周期
  * 终端原生,无缝集成
  * 开箱即用的强大能力
  * Unix 哲学的 AI 集成
* 快速体验
  * 环境要求
  * 一键安装
  * 开始使用
* 下一步操作
  * 深入了解
  * 配置和扩展
  * 高级用法
  * 获取帮助
* 反馈和支持

### [快速入门](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/quickstart.md)

* 开始之前
  * 系统要求
  * 验证环境
* 极速安装
  * npm 全局安装
  * 原生安装器(Beta)
  * 验证安装
* 登录认证
  * 登录方式说明
* 首次体验
  * 1. 进入项目目录
  * 2. 启动交互模式
  * 3. 尝试第一个对话
* 核心使用模式
  * 交互式对话模式
  * 单次命令模式
  * 项目级操作
  * 快捷键
* 进阶学习
* 获取帮助

### [安装指南](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/installation.md)

* 目录
* 安装方式
  * 使用包管理器安装
    * npm
    * pnpm
    * yarn
    * bun
    * 验证安装
  * 使用原生二进制安装(Beta)
    * 特性说明
    * 支持平台
    * 从 npm 版本迁移
    * 全新安装
    * 验证安装
* 更新
  * 自动更新
  * 手动更新
* 故障排查
  * 命令不可用
  * 网络问题
* 卸载
  * npm 版本卸载
  * 原生二进制版本卸载
  * 清理配置文件(可选)

### [常见工作流](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/common-workflows.md)

* 图片分析功能
  * 支持的图片类型
  * 使用方式
    * 1. 拖拽上传
    * 2. 文件路径引用
    * 3. 剪贴板粘贴
  * 实用场景
    * UI 实现
    * 错误诊断
    * 架构分析


### [最佳实践](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/best-practices.md)

* 核心原则：管理上下文窗口
* 给 CodeBuddy 验证自己工作的方法
* 先探索，再规划，后编码
  * 1. 探索
  * 2. 规划
  * 3. 实现
  * 4. 提交
* 在提示中提供具体上下文
  * 提供丰富内容
* 配置您的环境
  * 编写有效的 CODEBUDDY.md
  * 配置权限
  * 使用 CLI 工具
  * 连接 MCP 服务器
  * 设置 Hooks
  * 创建 Skills
  * 创建自定义子代理
  * 安装插件
* 有效沟通
  * 询问代码库问题
  * 让 CodeBuddy 采访您
* 管理您的会话
  * 及早并经常纠正
  * 积极管理上下文
  * 使用子代理进行调查
  * 使用检查点回退
  * 恢复对话
* 自动化和扩展
  * 运行无头模式
  * 运行多个 CodeBuddy 会话
  * 跨文件扇出
  * 安全自主模式
* 避免常见失败模式
  * 1. 厨房水槽会话
  * 2. 反复纠正
  * 3. 过度指定的 CODEBUDDY.md
  * 4. 信任然后验证的差距
  * 5. 无限探索
* 培养您的直觉
* 相关资源

## 构建与扩展

### [子代理](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sub-agents.md)

* 架构概述
  * 核心组件
  * 工具集成
* 放置位置
* 文件命名与识别
* Frontmatter 元数据
  * 字段说明
  * 可用工具列表

### [插件系统](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/plugins.md)

* 核心概念
  * 什么是插件?
  * 什么是插件市场?
* 快速开始
  * 方式一: 团队配置自动安装(推荐)
    * 配置示例
    * 配置说明
    * 自动安装流程
    * 优势

### [Skills 技能系统](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/skills.md)

* 什么是 Skills
* Skills vs Slash Commands
* 创建 Skills
  * 目录结构
  * SKILL.md 格式
  * Frontmatter 字段
* 变量占位符
* 执行 Shell 命令
  * 支持的特性
* Context Fork
  * 可用 Agent 类型
  * 执行流程

### [插件市场](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/plugin-marketplaces.md)

* 核心功能
* 使用插件市场
  * 前置要求
  * 添加插件市场
    * 1. 添加 GitHub 市场
    * 2. 添加 Git 仓库市场
    * 3. 添加本地市场(用于开发)
    * 4. 添加 HTTP 市场
  * 从市场安装插件
  * 验证市场安装
* 团队配置
  * 自动安装团队市场

### [Hooks 钩子系统](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/hooks-guide.md)

* 目录
* Hook 事件概述
* 快速开始
  * 前置条件
  * 步骤 1: 打开 hooks 配置
  * 步骤 2: 添加匹配器
  * 步骤 3: 添加 hook
  * 步骤 4: 保存配置

### [Git Worktree 支持](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/worktree.md)

* 概述
* 快速开始
* CLI 参数
* 工作流程
  * 创建 Worktree
  * 退出时的选择
  * 变更检测
* 配置
  * 配置项
* Hooks 支持
  * WorktreeCreate Hook
  * WorktreeRemove Hook
* tmux 集成
  * tmux 要求
  * 退出 tmux 会话
* 目录结构
* 注意事项
* 相关文档


### [定时任务](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/scheduled-tasks.md)

* 使用 `/loop` 创建循环任务
  * 语法
  * 常用示例
  * 间隔不指定时的默认行为
* 创建一次性提醒
* 管理已有任务
  * 查看当前所有任务
  * 取消任务
* 任务执行机制
  * 执行时机
  * 时间偏移（Jitter）
  * 自动过期
* Cron 表达式参考
* 注意事项
* 禁用定时任务
* 相关文档

### [MCP 集成](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/mcp.md)

* 概述
* 核心概念
  * MCP 服务器
  * MCP Prompts 集成
  * 传输类型
  * 配置作用域
  * 安全审批机制
  * 工具权限管理
  * 超大响应处理

### [MCP Apps 接入指南](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/mcp-apps.md)

* 概述
* 协议核心概念
  * UI Resource
  * App Tool
  * Sandbox iframe
  * AppBridge / postMessage
* 最小接入示例
  * Server 端
  * HTML 模板（CSP 配置 + 远端 ESM 引入 ext-apps）
  * 在 mcp.json 里挂上
* Host 支持的能力
  * Guest → Host 协议方法
  * Host → Guest 推送通知
  * hostContext 字段
* 接入步骤
* 安全模型
  * Sandbox 隔离
  * 授权机制
  * 大小限制
* 主题适配 best practice
* 调试指南
* 参考资源

### [工具延迟加载覆盖](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/tool-defer-overlay.md)

* 语法速览（Defer / NoDefer 修饰符）
* 可用渠道（CLI --tools、自定义代理 frontmatter）
* 修饰符不能用在哪里（--allowed-tools / --disallowed-tools）
* 优先级与合并规则（NoDefer 优先）
* 自动附加 ToolSearch 与 DeferExecuteTool
* 典型用例
* 错误排查
* 与权限规则的协作
* 与 ToolSearch / DeferExecuteTool 的交互
* 已知边界

### [Bash Sandboxing 沙箱功能](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/bash-sandboxing.md)

* 概述
* 为什么沙箱很重要
* 工作原理
  * 文件系统隔离
  * 网络隔离
  * 操作系统级强制执行
* 入门指南
  * 启用沙箱
  * 配置沙箱
* 安全优势
  * 防止提示注入攻击
  * 减少攻击面
  * 透明操作
* 安全限制
* 高级用法
  * 自定义代理配置
  * 与现有安全工具集成
* 最佳实践
* 开源
* 常见配置示例
* 架构
* 依赖
* 限制
* 参考资源

### [开发容器](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/devcontainer.md)

* 核心特性
* 四步快速开始
* 配置详解
  * 目录结构
  * devcontainer.json
  * Dockerfile
  * init-firewall.sh
* 安全特性
  * 多层安全防护
  * 重要安全提示
  * 无人值守操作
* 自定义选项
* 使用场景
  * 安全的客户项目开发
  * 团队快速入职
  * 一致的 CI/CD 环境
* 相关资源

### [HTTP API](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/http-api.md)

* 快速开始（启动服务、Swagger UI 文档地址）
* API 分层（公开 REST API、ACP 协议、内部 RPC）
* 认证
* 响应格式
* 端点概览
  * 系统（health、info）
  * 认证（auth/status、auth/login）
  * Runs（Agent 执行）
  * Webhooks（第三方平台接入）
  * 会话、PTY、实例、Channels、文件系统、进程管理
  * Jobs（后台会话派发、生命周期、SSE 增量事件）
  * 插件管理（安装、卸载、启用、禁用、市场管理）
  * 配置管理（列出、获取、设置、数组追加/移除）
  * 任务模板
  * 使用统计（历史统计、会话实时统计）
  * 链路追踪（trace 列表、详情、清空，支持多 Worker 代理）
  * 定时任务管理（列表、创建、删除，cron 表达式）
* 使用示例
* 错误码

### [ACP 协议集成](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/acp.md)

* 快速开始
  * 启动 ACP 模式
* Zed 编辑器集成
  * 配置步骤
  * 配置说明
* ACP 协议特性
  * 工具代理机制
  * 命令列表推送
* 其他编辑器支持
* 故障排除
  * 连接失败
  * 工具调用失败
* 相关链接

### [Workflow stdio 接入协议](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/workflow-stdio-protocol.md)

* 与 Claude Code 2.1.220 的对齐关系
* 传输层与功能总开关
* 从 stdin 驱动 workflow
  * 中止（abort）控制流
    * 报文格式与使用规则
    * stdout 上会依次看到什么
    * 参考实现（interrupt + 优雅 drain）
* 消息参考（task_started / task_progress.workflow_progress / task_updated / task_notification）
* 时序保证
* 与 Claude Code 的兼容性与超集
* 版本约定
* 安全 & 隐私

### [GitLab CI/CD 集成](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/gitlab-ci-cd.md)

* 概述
* 为什么在 GitLab CI/CD 中使用 CodeBuddy Code?
* 工作原理
* CodeBuddy 能做什么?
* 配置指南
  * 快速配置
  * 手动配置(推荐用于生产环境)
* 使用示例
  * 将 Issue 转化为 MR
  * 获取实现帮助
  * 快速修复 Bug
* 最佳实践
  * CODEBUDDY.md 配置
  * 安全考虑

### [无头模式](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/headless.md)

* 概述
* 基本用法
* 配置选项
* 多轮对话
* 输出格式
  * 文本输出 (默认)
  * JSON 输出
  * 流式 JSON 输出
* 输入格式
  * 文本输入 (默认)
  * 流式 JSON 输入

### [检查点](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/checkpointing.md)

* 概述
* 检查点的工作原理
  * 自动跟踪
  * 回退更改
* 常见使用场景
* 限制
  * Bash 命令的更改不会被跟踪
  * 外部更改不会被跟踪
  * 不能替代版本控制
* 另请参阅

### [故障排查](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/troubleshooting.md)

* 安装与系统要求
  * Node.js 版本要求
  * Windows 平台特殊要求
    * Git Bash 依赖
    * 自动检测逻辑
    * 自定义 Git Bash 路径
  * 搜索工具问题
    * Ripgrep (rg) 未找到
    * 搜索性能优化
  * Windows 安装常见问题

## SDK

### [CodeBuddy Agent SDK](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk.md)

* 目录
* 为什么使用 SDK
  * 超越命令行的能力
  * 精细化控制
  * 扩展能力
* 你可以构建什么
  * 开发工具增强
  * 自动化工作流
  * 企业应用
* 功能概览
* 安装
  * 环境要求
  * 设置 API 密钥
  * 其他环境变量
* 基础用法
  * 简单查询
  * 提取结果
  * 消息类型处理
* 配置选项
  * 权限模式
  * 工作目录
  * 模型选择
  * 资源限制
* 环境隔离(settingSources)
  * 设计理念
  * 为什么这样设计?
  * 默认行为对比
  * 显式加载配置
  * 配置源说明
  * 典型用例
* 权限控制
  * canUseTool 回调
  * 拦截危险操作
* 多轮对话
  * 使用 Session/Client API
  * 中断执行
* Hook 系统
  * PreToolUse Hook
  * Hook 事件类型
* 扩展能力
  * 自定义 Agent
  * MCP 服务器配置
  * 处理 AskUserQuestion
* 错误处理
* 最佳实践
* 相关文档

### [TypeScript SDK 参考](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-typescript.md)

* Requirements
* Installation
  * 环境变量
  * 认证配置
* Functions
  * query()
  * Query 接口
  * Constants
  * Errors
* Unstable V2 API
  * unstable_v2_createSession()
  * unstable_v2_resumeSession()
  * unstable_v2_prompt()
  * unstable_v2_authenticate()
  * unstable_v2_logout()
  * Session 接口
  * SessionOptions
* Types
  * Options
  * SettingSource
  * PermissionMode
  * PermissionResult
  * CanUseTool
  * AgentDefinition
  * ModeInfo
  * ModelInfo
  * McpServerConfig
  * HookEvent
  * HookCallback
  * HookJSONOutput
* Message Types
  * Message
  * SystemMessage
  * UserMessage
  * AssistantMessage
  * ResultMessage
  * ContentBlock
  * Usage
* Input Types
  * AskUserQuestionInput
  * AskUserQuestionQuestion
  * AskUserQuestionOption
  * ToolInputMap
* 相关文档

### [Python SDK 参考](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-python.md)

* 目录
* Requirements
* Installation
  * 环境变量
* Functions
  * query()
* Client Class
  * CodeBuddySDKClient
  * connect()
  * query()
  * receive_response()
  * receive_messages()
  * mcp_server_status()
  * disconnect()
* Unstable API
  * interrupt()
  * set_permission_mode()
  * set_model()
* Authentication
  * authenticate()
  * AuthFlow
    * wait()
    * cancel()
  * logout()
* Types
  * CodeBuddyAgentOptions
  * PermissionMode
  * PermissionResult
  * CanUseTool
  * AgentDefinition
  * McpServerConfig
  * HookEvent
  * HookMatcher
  * HookCallback
  * SettingSource
  * AppendSystemPrompt
* Message Types
  * Message
  * SystemMessage
  * UserMessage
  * AssistantMessage
  * ResultMessage
  * StreamEvent
  * ContentBlock
* Input Types
  * AskUserQuestionInput
  * AskUserQuestionQuestion
  * AskUserQuestionOption
* Errors
  * CodeBuddySDKError
  * CLIConnectionError
  * CLINotFoundError
  * CLIJSONDecodeError
  * ProcessError
  * CLIStartupError
  * ExecutionError
  * AuthenticationError
* Auth Types
  * AuthenticateResponse
  * UserInfo
  * McpServerStatus
* 相关文档

### [SDK 会话管理](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-sessions.md)

* 目录
* 概述
* 获取会话 ID
  * 使用 query API
  * 使用 v2 Session API (TypeScript)
  * 使用 Client API (Python)
* 恢复会话
  * 使用 resume 选项
  * 继续最近的会话
* 多轮对话
  * TypeScript: 使用 query API
  * TypeScript: 使用 v2 Session API
  * Python: 使用 CodeBuddySDKClient
* 相关文档

### [SDK Hook 系统](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-hooks.md)

* 目录
* 概述
  * 支持的事件
* Hook 配置
  * 基本结构
  * HookMatcher 结构
  * Matcher 模式
* 事件类型
  * PreToolUse
  * PostToolUse
  * UserPromptSubmit
  * Stop / SubagentStop
* Hook 输入
  * 公共字段
  * PreToolUse / PostToolUse 输入
  * UserPromptSubmit 输入
  * Stop / SubagentStop 输入
* Hook 输出
  * 基本输出字段
  * PreToolUse 特殊输出
* 示例
  * 完整示例: Bash 命令审计
  * 示例: 限制文件修改范围
* 相关文档

### [SDK 权限控制](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-permissions.md)

* 目录
* 概述
* 权限模式
  * 可用模式
  * 初始配置
  * 动态修改权限模式
* canUseTool 回调
  * 回调签名
  * 完整示例: 交互式审批
  * 修改工具输入
* 处理 AskUserQuestion
  * 输入结构
  * 返回答案
* 工具白名单/黑名单
  * 配置示例
  * 常用工具名称
* 最佳实践
* 相关文档

### [SDK MCP 集成](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-mcp.md)

* 概述
* 核心概念
* 支持的传输类型
* 配置 MCP 服务器
  * TypeScript
  * Python
* 服务器配置详解
  * STDIO 配置
  * HTTP 配置
  * SSE 配置
* 权限管理
  * 工具权限模式
  * 特定工具的权限控制
* 使用 MCP 工具
  * 自动工具发现
  * 处理工具结果
* 实例：数据库查询 MCP 服务器
  * 创建 MCP 服务器
  * 在 SDK 中使用
* 实例：API 集成 MCP 服务器
* 实例：远程 SSE 服务器
* 错误处理
  * 检查服务器初始化状态
* 相关文档
* 更多资源

### [SDK Custom Tools 指南](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-custom-tools.md)

* 概述
  * 核心优势
* 快速开始
  * TypeScript
  * Python
* 创建自定义工具
  * TypeScript - 基本工具定义
  * TypeScript - 完整示例：文件分析工具
  * Python - 装饰器模式
* 多个工具管理
  * TypeScript
  * Python
* 类型安全
  * TypeScript - 使用 Zod 模式
  * Python - 类型注解
* 完整示例：数据库查询工具
  * TypeScript
  * Python
* 完整示例：API 集成工具
  * TypeScript
  * Python
* 选择性地允许工具
  * TypeScript
  * Python
* 错误处理
  * TypeScript - API 调用错误处理
  * Python - API 调用错误处理
* 最佳实践
* 相关文档
* 更多资源

### [SDK 示例项目](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sdk-demos.md)

* 示例仓库
* 示例概览
* 环境准备
  * 前置条件
  * 安装 SDK
  * 认证方式
* 基础示例
  * quick-start：SDK 入门
  * multi-turn-session：多轮对话
* 进阶示例
  * research-assistant：多 Agent 协作
  * profile-builder：信息收集与文档生成
* Web 应用集成
  * chat-demo：流式响应架构
  * mail-assistant：MCP 工具扩展
* 桌面应用集成
  * spreadsheet-assistant：Electron 集成
* Hooks 安全控制
* 相关文档

## 配置

### [.codebuddy 目录结构说明](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/codebuddy-dir.md)

* 全局目录 `~/.codebuddy/`
  * 核心配置文件（settings.json、CODEBUDDY.md、mcp.json）
  * 用户级扩展目录（agents/、rules/、skills/）
  * 运行时数据目录
* 项目目录 `.codebuddy/`
  * 配置文件（settings.json、settings.local.json、CODEBUDDY.md）
  * 项目级扩展目录（agents/、rules/、skills/、commands/）
* 配置优先级
* 记忆加载顺序
* 版本控制建议

### [设置配置](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/settings.md)

* 配置文件
  * 完整配置示例
* 可用设置

### [自定义快捷键](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/keybindings.md)

* 配置文件
* 上下文（Contexts）
* 可用动作（Actions）
  * 应用动作、历史动作、聊天动作、自动补全动作
  * 确认动作、转录动作、历史搜索动作
  * 任务动作、帮助动作、设置动作
  * 选择列表动作、命令面板动作、Diff 动作
  * 消息选择器动作、插件动作
* 按键语法
  * 修饰键、弦序列（Chords）、特殊按键
* 解绑默认快捷键
* 保留快捷键
* 终端冲突
* Web UI 可视化配置
  * REST API
* 验证
  * 权限设置
  * 记忆功能配置（Experimental）
  * Bash沙箱设置
  * 设置优先级
  * 配置系统要点
  * 排除敏感文件
* 子代理配置
* 插件配置
  * 插件设置
  * 管理插件
* 环境变量
  * 认证相关
  * 运行环境
  * Bash 工具配置
  * 功能开关
  * 流式请求超时配置
  * 其他配置
  * mTLS 认证配置
  * Shell 配置
  * 模型配置
  * 提示缓存配置
  * 遥测和报告配置
  * 界面配置
  * 文件读取配置
  * 其他环境变量（补充）
  * 使用示例
* 状态行配置
* 配置管理命令
  * 基本语法
  * 可用命令
  * 选项
  * 使用示例
* CodeBuddy 可用的工具
  * 使用 hooks 扩展工具
* 常见配置场景
  * 团队协作配置
  * 安全配置
  * 沙箱安全配置
* 另见

### [环境变量参考](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/env-vars.md)

* 认证相关
* API 端点和代理
* 模型配置
* Bash 工具配置
* 工具输出外部化
* 工具和功能开关
* 上下文和内存
* MCP (Model Context Protocol)
* 性能和输出
* 文件系统和配置
* Shell 配置
* UI 和交互
* 安全和认证
* 遥测和报告
* 任务和后台工作
* Agent 执行控制
* Gateway 和远程访问
* 企业微信集成
* Channel 自动连接
* 调试和诊断
* 其他
* 使用示例
* 在 settings.json 中配置
* 工具输出外部化机制

### [模型配置](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/models.md)

* 概述
* 配置文件位置
  * 用户级配置
  * 项目级配置
* 配置优先级
* 配置结构
* 配置字段说明
  * models
  * availableModels
* 使用场景
  * 1. 添加自定义模型
  * 2. 覆盖内置模型配置
  * 3. 限制可用模型列表
  * 4. 项目特定配置
* 热重载
* 标签系统
* 合并策略
* 示例配置
  * API 端点 URL 格式说明
  * OpenRouter 平台配置示例
  * DeepSeek 平台配置示例
  * 完整示例
* 故障排查
  * 配置未生效
  * 模型未在列表中显示
  * 热重载未触发

### [Memory 记忆系统](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/memory.md)

* 确定记忆类型
* CODEBUDDY.md 导入
* CodeBuddy 如何查找记忆
* 使用 `#` 快捷方式快速添加记忆
* 使用 `/memory` 管理记忆
* 设置项目记忆
* Auto Memory 系统
  * 存储位置
  * 启用与禁用
  * Typed Memory 模式（Experimental）
* 记忆最佳实践
* 设置语言偏好
* 分层记忆策略示例
* 缓存与重载
* 常见问题

### [身份和访问管理](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/iam.md)

* 认证方法
  * 快速开始
  * 个人用户：获取 API Key
  * 企业用户：OAuth 认证
  * 第三方模型服务认证
  * 认证配置
* 访问控制和权限
  * 权限系统
  * 配置权限
  * 权限模式
  * 工作目录
  * 工具特定的权限规则
  * 权限配置示例
  * 使用 hooks 进行额外的权限控制
* 设置优先级
* 凭据管理
  * 使用 apiKeyHelper
* 安全最佳实践
  * 最小权限原则
  * 保护敏感文件
  * 使用沙箱
  * 审查权限日志
  * 团队配置共享
* 常见问题
  * 如何临时绕过权限?
  * 如何为特定项目设置不同的权限?
  * 如何查看当前权限配置?

### [安全](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/security.md)

* 安全方法
  * 安全基础
  * 基于权限的架构
  * 内置保护
  * 用户责任
* 防范提示注入
  * 核心保护
  * 隐私保护
  * 额外保护措施
* MCP 安全
* 沙箱安全
  * 沙箱隔离级别
  * 沙箱配置
  * 沙箱限制
* 安全最佳实践
  * 处理敏感代码
  * 团队安全
  * 权限配置最佳实践
  * 环境隔离
  * 代码审查流程
  * 敏感数据保护
  * 审计和监控
* 报告安全问题
* 安全检查清单

### [成本管理](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/costs.md)

* 追踪成本
  * 使用 /cost 命令
  * 使用 /context 命令
* 多场景模型机制
  * 场景类型
  * 自动模型选择
* 降低 Token 消耗
  * 主动管理上下文
  * 异步压缩策略
  * 选择合适的模型
  * 减少 MCP 服务器开销
  * 将详细操作委托给子代理
  * 编写精确的提示
  * 复杂任务的高效工作方式
* 后台 Token 消耗
* 相关文档

### [状态行配置](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/statusline.md)

* 创建自定义状态行
* 工作原理
* JSON 输入结构
* 示例脚本
  * 简单状态行
  * Git 感知状态行
  * 带颜色的中文状态行
  * 显示成本和统计信息
  * Python 示例
  * Node.js 示例
  * 助手函数方法
  * 完整的中文示例
* 高级示例
  * 显示当前时间和会话时长
  * 根据成本显示不同颜色
* 提示
* 常用 ANSI 颜色代码
* 故障排查
  * 状态行不显示
  * 中文或 emoji 显示乱码
  * 颜色不显示
  * Git 信息不显示
  * 脚本执行缓慢
* 配置示例
  * 用户级配置
  * 项目级配置
* 实用工具推荐

### [优化终端配置](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/terminal-config.md)

* 主题和外观
* 换行输入
  * 配置 Shift+Enter (推荐)
  * 配置 Option+Enter
* 通知设置
  * iTerm 2 系统通知
  * 自定义通知 Hook
* 处理大量输入
* Vim 模式

### [IDE 集成](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/ide-integrations.md)

## 参考

### [CLI 参考](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/cli-reference.md)

* 基本语法
* 全局选项
  * 基础选项
  * 输入输出格式
  * 会话管理
  * 配置和提示词
  * AI 模型选项
  * 安全和权限
  * 网络和请求

### [预热进程（prewarm）](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/prewarm.md)

* 快速上手
  * 启动预热进程
  * 查看 / 唤醒（cbc-prewarm 命令）
* 外部程序集成（IPC 协议）
  * 地址约定
  * 消息（ping / status / activate）
  * Node.js 示例
* 行为与约束
* 环境变量

### [交互模式](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/interactive-mode.md)

* 键盘快捷键
  * 通用控制
  * 多行输入
  * 快速命令
  * 编辑快捷键
* Vim 编辑器模式
  * 模式切换
  * 导航 (NORMAL 模式)
  * 编辑 (NORMAL 模式)
* 命令历史
  * 使用 Ctrl+R 反向搜索
* 后台 Bash 命令
  * 后台运行的工作原理
  * 使用 `!` 前缀的 Bash 模式
* 权限模式
  * 可用模式
  * 切换权限模式
  * 权限规则
* 相关文档

### [斜杠命令](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/slash-commands.md)

* 内置斜杠命令 (Built-in Slash Commands)
* 自定义斜杠命令 (Custom Slash Commands)
  * 创建自定义命令
    * 子目录中的命令命名
  * Frontmatter 与元数据
  * 使用参数
    * 方式一：位置参数 ($1, $2, $3, ...)
    * 方式二：捕获所有参数 ($ARGUMENTS)
  * 执行 Shell 命令
  * 文件引用
* 最佳实践
  * 1. 描述要清晰明确
  * 2. 使用细粒度的工具权限
  * 3. 组织命令到子目录
  * 4. 提供有用的上下文
  * 5. 处理可选参数
  * 6. 指定特定模型
* 常见用法场景
  * 场景1：代码审查工作流
  * 场景2：自动化部署
  * 场景3：项目诊断
* 故障排除
* 技巧与窍门

### [Hook 参考](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/hooks.md)

* 目录
* 功能概览
* 配置
* 结构
* 项目特定的 Hook 脚本
* 插件 Hooks
* 基于提示词的 Hooks
* Hook 事件
* Hook 输入
* Hook 输出
* 使用 MCP 工具
* 安全注意事项
* Hook 执行详情
* 调试

### [插件参考文档](https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/plugins-reference.md)

* 概述
* 一、插件组件参考
  * 1. Commands (命令)
  * 2. Agents (代理)
  * 3. Skills (技能)


---

## 文档统计

* **总计文档页面**: 47
* **文档分类**: 5 个主要类别
  * 快速开始 (6 个页面)
  * 构建与扩展 (16 个页面)
  * SDK (9 个页面)
  * 配置 (11 个页面)
  * 参考 (5 个页面)

---

*本文档地图帮助 AI 和开发者快速定位和访问 CodeBuddy Code 的所有文档资源。*
