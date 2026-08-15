> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/env-vars.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 环境变量参考

CodeBuddy Code 支持通过环境变量来控制其行为。这些变量可以在启动前设置，也可以在 [`settings.json`](./settings.md#可用设置) 的 `env` 字段中配置以应用到每个会话。

> **提示**：所有环境变量也可以在 `settings.json` 的 `env` 字段中设置，这样可以自动为每个会话应用，或为整个团队推出配置。

## 认证相关

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_API_KEY` | API 密钥。设置此密钥用于模型接口调用。在非交互模式 (`-p`) 下始终使用此密钥 |
| `CODEBUDDY_AUTH_TOKEN` | CodeBuddy 平台认证令牌，用于所有平台接口调用 |
| `CODEBUDDY_CUSTOM_HEADERS` | 自定义 HTTP 请求头。格式：`Name: Value`，多个请求头用换行符或 `\n` 分隔 |

## API 端点和代理

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_BASE_URL` | 覆盖 API 端点地址，通常与 `CODEBUDDY_API_KEY` 配合使用 |
| `CODEBUDDY_INTERNET_ENVIRONMENT` | 网络环境配置（`internal` 用于中国版，`ioa` 用于 iOA 企业版） |
| `HTTP_PROXY` / `http_proxy` | HTTP 代理服务器地址 |
| `HTTPS_PROXY` / `https_proxy` | HTTPS 代理服务器地址 |
| `NO_PROXY` / `no_proxy` | 绕过代理的域和 IP 列表（逗号分隔，如 `localhost,.example.com`） |

## 模型配置

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_MODEL` | 覆盖默认代理模型 |
| `CODEBUDDY_SMALL_FAST_MODEL` | 覆盖 `lite`（轻量快速）场景变体的模型；优先级高于 `variantModels.lite` 设置项 |
| `CODEBUDDY_BIG_SLOW_MODEL` | 覆盖 `reasoning`（推理增强）场景变体的模型；优先级高于 `variantModels.reasoning` 设置项 |
| `CODEBUDDY_CODE_SUBAGENT_MODEL` | **一刀切**覆盖所有内置子代理的模型（优先级最高，压过 `subagents` 设置项）。仅需按子代理独立配置时，改用 `/agents` 面板或 `settings.json` 的 `subagents.agents.<子代理名>.model` |
| `MAX_THINKING_TOKENS` | 启用扩展思考并设置思考过程的 token 预算。默认禁用 |

> **env 与 settings 的关系**：模型相关环境变量用于运维或 CI 级覆盖。
>
> - 内置子代理：`CODEBUDDY_CODE_SUBAGENT_MODEL` > 本次 Agent 工具调用的 `model` 入参 > 项目级 `subagents` > 用户全局 `subagents` > 产品内置声明 > 主模型。
> - 场景变体：对应的变体环境变量 > 项目级 `variantModels` > 用户全局 `variantModels` > 主模型的 `relatedModels` > 适用的产品内置默认 > 主模型。
>
> - `CODEBUDDY_CODE_SUBAGENT_MODEL` 统一覆盖所有子代理。若要分别指定，使用 `/agents` 或 `subagents.agents.<子代理名>.model`，详见 [子代理文档](sub-agents.md)。
> - `CODEBUDDY_SMALL_FAST_MODEL` 只影响 `lite`，`CODEBUDDY_BIG_SLOW_MODEL` 只影响 `reasoning`。对应的持久化设置可通过 `/model` 或 `variantModels` 管理，详见 [设置文档](settings.md)。
>
> 取消环境变量后会恢复低优先级配置，不一定直接回退到主模型。

## Bash 工具配置

| 环境变量 | 说明 |
|---------|------|
| `BASH_DEFAULT_TIMEOUT_MS` | 长时间运行 bash 命令的默认超时（默认：120000） |
| `BASH_MAX_OUTPUT_LENGTH` | bash 输出在内存中保留的最大字符数（默认：30000，上限：150000）。超出部分会被中间截断（保留 head 20% + tail 80%），完整输出会自动保存到磁盘 |
| `BASH_MAX_TIMEOUT_MS` | 模型可为长时间运行的 bash 命令设置的最大超时（默认：600000） |
| `CODEBUDDY_BASH_ASSISTANT_BUDGET_MS` | 主对话响应预算（毫秒，默认 `0`=关闭）。设为 `>0` 时，主会话的前台 Bash/PowerShell 命令超过该时长会自动转为后台任务让对话保持响应。sub-agent 不受此预算影响。对齐 Claude Code 的 `ASSISTANT_BLOCKING_BUDGET_MS`（CC 官方默认值 `15000`） |
| `CODEBUDDY_BASH_AUTO_BACKGROUND_DISABLED` | 设为 `1` 关闭超时自动后台化,前台命令到 timeout 回到旧的 SIGTERM/kill 硬杀行为。仅用于调试或遇到回归时临时回滚；正常场景保持默认（未设置） |
| `CODEBUDDY_BASH_BG_MAX_OUTPUT_BYTES` | 后台 bash 任务 stdout+stderr 落盘文件总字节上限（默认 `52428800` = 50MB）。超过则 size watchdog 触发 `SIGKILL` 并标记任务为 `killed`，stderr 末尾会注入提示。Claude Code 在 `ShellCommand.ts` 把同等阈值写死为常量，这里暴露为 env 给运维做调节。仅在文件 fd 模式生效（pipe 模式下子进程输出不落盘） |
| `CODEBUDDY_BASH_BG_PIPE_MODE` | 设为 `1` 强制后台任务回到 pipe 模式（不走文件 fd），用于回滚或调试。默认（未设置）走文件 fd 模式，解决 nohup 等命令孙进程持有父 pipe fd 导致僵尸进程的问题；sandbox 路径会自动回退 pipe，不需要显式设置。Claude Code 没有等价开关，这是 codebuddy 兼容旧 sandbox/PTY 路径的兜底 |

## 工具输出外部化

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_TOOL_RESULT_THRESHOLD_KB` | 工具结果外部化的大小阈值（KB），超过此阈值的非 bash 工具结果会被保存到磁盘并替换为占位符（默认：50）|

> **说明**：Bash 工具的输出外部化由 `BASH_MAX_OUTPUT_LENGTH` 控制，当输出超过该值发生截断时，完整输出自动流式写入磁盘。`CODEBUDDY_TOOL_RESULT_THRESHOLD_KB` 主要影响其他工具（如 MCP 工具）的大输出处理。详见[工具输出外部化](#工具输出外部化机制)章节。

## 工具和功能开关

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_DISABLE_HOT_RELOAD` | 设置为 `1` 禁用热更新系统 |
| `CODEBUDDY_SKIP_BUILTIN_MARKETPLACE` | 设置为 `1` 跳过内置插件市场加载 |
| `CODEBUDDY_AUTO_UPDATE_THIRD_PARTY_MARKETPLACES` | 设置为 `true` 或 `1` 启用第三方插件市场自动更新（默认：禁用） |
| `CODEBUDDY_MARKETPLACE_AUTO_UPDATE_INTERVAL_MS` | 覆盖插件市场自动更新的刷新窗口（毫秒），默认 `86400000`（24 小时）。设为更小的值（如 `3600000` 即 1 小时）可缩短自动更新检测间隔，便于测试/调试；非法值（非数字或 ≤0）回退默认值 |
| `CODEBUDDY_PLUGIN_DIRS` | 冒号分隔的本地插件目录路径列表（等同于 `--plugin-dir`），插件的 `bin/` 目录会自动注入到 `PATH` |
| `CODEBUDDY_DISABLE_EXTENDED_PLUGIN_HOOKS` | 设置为 `1` 或 `true` 时，插件 Hook 配置仅接受 `command` 类型；包含 `prompt`、`agent` 或 `http` 类型的配置会按不兼容处理。用于宿主临时回退插件 Hook 契约；默认不设置 |
| `CODEBUDDY_IMAGE_GEN_ENABLED` | 设置为 `false` 或 `0` 禁用图片生成功能 |
| `CODEBUDDY_BRIEF` | 设置为 `1` / `true` / `yes` 启用 `SendUserMessage` 工具（等同 `--brief`），让 Agent 通过该工具向用户发送消息；未设置时该工具不可见 |
| `CODEBUDDY_IMAGE_EDIT_ENABLED` | 设置为 `false` 或 `0` 禁用图片编辑功能 |
| `CODEBUDDY_ARTIFACT_ENABLED` | 设置为 `false` 或 `0` 禁用 Artifact / ArtifactControl 工具（将本地单个 HTML 或 Markdown 文件发布为可分享的公网链接，Markdown 由服务端渲染为样式化页面；ArtifactControl 当前仅支持取消发布）。默认开启。判定顺序：国际 endpoint（`codebuddy.ai` / `workbuddy.ai` / `staging-codebuddy.tencent.com`）下该能力恒关闭、本变量无法覆盖；其余场景下本变量优先级最高，未设置（含空值）时回落到旧变量 `CODEBUDDY_SHARE_LINK_ENABLED`，再回落到云端 `productFeatures`（`Artifact` 与 `ShareLink` 任一显式为 `false` 即关闭，均未下发时缺省 `true`） |
| `CODEBUDDY_SHARE_LINK_ENABLED` | **已废弃（兼容保留）**：`CODEBUDDY_ARTIFACT_ENABLED` 的旧名，ShareLink 工具更名为 Artifact 前的开关。语义与新变量完全一致，新变量优先；仅在新变量未设置时生效 |
| `CODEBUDDY_COMPUTER_USE_ENABLED` | **实验功能**：设置为 `true` 或 `1` 启用 macOS 桌面控制工具（截图、鼠标、键盘）。仅 macOS 可用，默认关闭。首次调用键盘/鼠标动作需在系统设置 → 隐私与安全 → 辅助功能、屏幕录制中为终端授权 |
| `CODEBUDDY_PUSH_NOTIFICATION_ENABLED` | 设置为 `false` 或 `0` 禁用 PushNotification 工具（模型可在长任务/后台任务完成时主动触发一次终端/桌面通知）。默认开启 |
| `CODEBUDDY_REPORT_FINDINGS_ENABLED` | 设置为 `false` 或 `0` 禁用 ReportFindings 工具（代码审查类 Agent 用它把发现的问题以结构化字段提交，渲染为专门的列表组件）。默认开启 |
| `CODEBUDDY_WAIT_FOR_MCP_SERVERS_ENABLED` | 设置为 `0` 或 `false` 禁用 WaitForMcpServers 工具。默认开启。交互模式下不阻塞等待 MCP 连接，当 LLM 需要尚未就绪的 MCP 工具时可主动调用此工具按需等待。WorkBuddy 场景设置为 `0` 禁用 |
| `CODEBUDDY_DEFERRED_TOOLS_MCP_READY_WAIT_MS` | 渲染延迟工具描述前等待 MCP 服务器就绪的最长毫秒数，默认 `2500`。设为 `0` 完全跳过等待，连接较慢则会立即把"仍在连接"提示烘焙进描述；调大可让远端 MCP 服务器有更多时间在首次提示前完成握手。一旦服务器就绪即立即继续，超时仅作为上限 |
| `CODEBUDDY_DEFER_TOOL_LOADING` | 设置为 `false` 或 `0` 禁用 MCP 工具延迟加载 |
| `CODEBUDDY_SHOW_ALL_DEFERRED_TOOLS` | 设置为 `true` 或 `1` 显示所有延迟工具的完整描述 |
| `CODEBUDDY_DISABLE_CRON` | 设置为 `1` 禁用计划任务 |
| `CODEBUDDY_DISABLE_FORK_SUBAGENT` | 设置为 `1` 禁用 Agent 工具的 Fork 子代理模式（`subagent_type="fork"`）。启用后 Agent 工具描述会自动隐藏 fork-mode 段落，模型不会看到该功能；若模型仍然传 `subagent_type="fork"`，运行时会回落到名为 `fork` 的自定义代理（如用户在 `.codebuddy/agents/fork.md` 定义），否则改写为 `general-purpose` 普通子代理。适用于需要避免 fork 递归派生导致请求量放大的宿主场景 |
| `CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS` | 设置为 `1` / `true` 禁用 Agent、Bash、PowerShell 工具的后台任务（`run_in_background=true`）。启用后这些工具 schema 中的 `run_in_background` 参数会被隐藏，模型不会看到该字段；即使历史/缓存 tool call 或直接调用方传入该参数，运行时也会兜底回退到同步（Agent）/前台（Bash、PowerShell）执行路径。适用于请求-响应式 SDK / 一次性任务场景——这类场景主进程在主 turn 结束后立即退出，任何后台代理/后台命令的结果都无法回流到最终答复中。对齐 Claude Code 的 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`（同样统管 Agent + Bash + PowerShell）。默认未设置（后台任务保持可用）。与 print-mode 守卫（`-p` 下始终阻断后台执行）相互独立 |
| `CODEBUDDY_REHYDRATE_IMAGE_BLOB_REFS` | 设置为 `true` 在 `-p` 模式流式输出中将图片 blob 引用还原为完整 base64 数据。适用于需要直接获取图片数据的下游集成场景 |

## 上下文和内存

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_AUTOCOMPACT_PCT_OVERRIDE` | 设置自动压缩触发的上下文容量百分比（1-100）。默认由产品配置决定（通常 70-92%）。使用更低的值（如 `50`）来更早压缩 |
| `CODEBUDDY_AUTO_COMPACT_WINDOW` | 自动压缩计算的上下文窗口基准值（token）。触发点 = `min(该值, 模型有效预算) × 阈值`，clamp 到 [100k, 1M] 且不超过模型实际窗口。优先级高于 settings 项 `autoCompactWindow`（env > settings）。留空跟随模型窗口 |
| `CODEBUDDY_PRE_MESSAGE_COMPACT` | 强制控制 pre-message 压缩开关。`true`/`1` 启用，`false`/`0` 禁用。优先级高于产品配置的 `enablePreMessageCompact` 和 `ContextSummaryAgent` 开关 |
| `CODEBUDDY_PRE_MESSAGE_COMPACT_PCT` | 设置用户发消息前预检压缩的上下文容量百分比（1-100）。默认 10%。当上下文超过此阈值时，在处理用户新消息前自动压缩 |
| `CODEBUDDY_DISABLE_AUTO_MEMORY` | 设置为 `1` 禁用自动内存，设置为 `0` 启用 |
| `CODEBUDDY_MEMORY_ENABLED` | 设置为 `true` 或 `1` 启用记忆功能 |
| `CODEBUDDY_TYPED_MEMORY_ENABLED` | 设置为 `true` 或 `1` 启用分类记忆模式 |
| `CODEBUDDY_TEAM_MEMORY_ENABLED` | 设置为 `true` 或 `1` 启用团队记忆模式 |
| `CODEBUDDY_USER_ID` | 团队记忆模式下的用户 ID |

## MCP (Model Context Protocol)

| 环境变量 | 说明 |
|---------|------|
| `MCP_TIMEOUT` | MCP 服务器连接的超时时间（毫秒） |
| `MCP_TOOL_TIMEOUT` | MCP 工具执行的超时时间（毫秒） |
| `MAX_MCP_OUTPUT_TOKENS` | MCP 工具响应中允许的最大 token 数（默认：20000） |
| `CODEBUDDY_DISABLE_MCP_LARGE_OUTPUT_FILES` | 设为 `1` 时，MCP 超大响应不落盘（跳过 `~/.codebuddy/projects/.../tool-results/` 文件），始终走内容截断降级 |

## 性能和输出

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CODE_MAX_OUTPUT_TOKENS` | 设置大多数请求的最大输出 token 数 |
| `CODEBUDDY_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | 覆盖文件读取的默认 token 限制（默认：20000） |
| `CODEBUDDY_STREAM_TIMEOUT_MS` | 流式响应中两个数据块之间允许的最大静默时间（毫秒）（默认：300000，即 5 分钟）。已开始吐 token 后中途静默通常意味着连接已断，故与首 token 超时解耦、取较短阈值 |
| `CODEBUDDY_FIRST_TOKEN_TIMEOUT_MS` | 等待第一个模型输出的最大时间（毫秒）（默认：1200000，即 20 分钟）。长上下文 prefill 慢吐首 token 属合法情况 |
| `CODEBUDDY_MAX_RETRIES` | 模型请求"生成开始前"失败（429 / 5xx / 请求超时 / 锁超时）的最大退避重试次数（默认：8，上限：15，超限自动收敛）。重试采用指数退避 + 抖动并尊重服务器 `retry-after`，严格发生在流式内容产出之前，不会重发已产出内容。额度耗尽类错误不重试（转由模型 fallback 处理） |
| `CODEBUDDY_RETRY_WATCHDOG` | 置为 `1` / `true` / `yes` 开启无人值守 / CI 场景的无限重试模式，仅对上述"生成开始前"失败生效，单次退避封顶 5 分钟。默认关闭 |
| `CODEBUDDY_SESSION_MAX_ITEMS` | `session/load` 回放时历史消息的最大条数（默认：1000）。达到阈值且遇到 user message 时停止逆序读取 JSONL。需要支持超长会话（如沙箱场景）时可调大（例如 2000 或更多）；零/负数/非数字会回退到默认值 |

## 文件系统和配置

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CONFIG_DIR` | 自定义 CodeBuddy Code 存储配置和数据文件的位置 |
| `CODEBUDDY_CODE_DEBUG_LOGS_DIR` | 调试日志目录 |
| `CODEBUDDY_SANDBOX_IMAGE` | 容器沙箱镜像（默认：`node:20-alpine`） |
| `USE_BUILTIN_RIPGREP` | 设置为 `0` 使用系统安装的 `rg` 而不是 CodeBuddy Code 附带的 `rg` |

## Shell 配置

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CODE_SHELL` | 覆盖自动 shell 检测。支持的值：`bash`、`zsh`、`sh`、`powershell` |
| `CODEBUDDY_CODE_SHELL_PREFIX` | 包装所有 shell 命令的命令前缀（如用于日志或审计） |
| `CODEBUDDY_CODE_GIT_BASH_PATH` | Windows 下显式指定 Git Bash 路径；若指定的路径无效则启动失败 |
| `CODEBUDDY_SKIP_GIT_BASH_CHECK` | 设置为 `1` 跳过启动时的 Windows Git Bash 检测和提示（适用于上游已管理 shell 的场景） |
| `CODEBUDDY_POWERSHELL_PATH` | 显式指定 PowerShell 可执行文件路径（优先于自动检测） |
| `CODEBUDDY_USE_POWERSHELL_TOOL` | 控制 PowerShell 工具启用状态。Windows 上默认启用，设为 `0` 可禁用 |
| `CODEBUDDY_ENV_FILE` | 在执行每个 shell 命令前自动 source 的环境文件路径 |
| `CODEBUDDY_DISABLE_SHELL_SNAPSHOT` | 设置为 `1` 全平台禁用 shell 环境快照（在 bash profile 加载慢时有效） |
| `CODEBUDDY_ENABLE_SHELL_SNAPSHOT` | Windows 无 Git Bash 时默认跳过 snapshot；设为 `1` 可强制启用（通常不需要） |

## UI 和交互

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CODE_DISABLE_TERMINAL_TITLE` | 设置为 `1` 禁用自动终端标题更新 |
| `CODEBUDDY_INCLUDE_PROMPT_SUGGESTION` | 显式启用提示建议，覆盖 headless 默认关闭和 `promptSuggestionEnabled=false` 配置 |
| `CODEBUDDY_PROMPT_SUGGESTION_DISABLED` | 设置为 `1` / `true` 禁用提示建议，优先级高于 `CODEBUDDY_INCLUDE_PROMPT_SUGGESTION` |
| `IS_DEMO` | 设置为 `true` 启用演示模式：隐藏邮箱和组织 |

## 安全和认证

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CODE_CLIENT_CERT` | mTLS 客户端证书文件路径 ⚠️ *暂未支持* |
| `CODEBUDDY_CODE_CLIENT_KEY` | mTLS 客户端私钥文件路径 ⚠️ *暂未支持* |
| `CODEBUDDY_CODE_CLIENT_KEY_PASSPHRASE` | mTLS 加密私钥的密码（可选）⚠️ *暂未支持* |

## 遥测和报告

| 环境变量 | 说明 |
|---------|------|
| `DISABLE_TELEMETRY` | 设置为 `1` 禁用遥测 |
| `DISABLE_ERROR_REPORTING` | 设置为 `1` 禁用错误报告 |
| `DISABLE_AUTOUPDATER` | 设置为 `1` 禁用自动更新 |
| `DISABLE_FEEDBACK_COMMAND` | 设置为 `1` 禁用 `/feedback` 命令 |

### OpenTelemetry 自定义上报（traces）

CodeBuddy Code 支持把内部 traces 通过 OTLP 协议上报到用户自有的 Collector，环境变量遵循 [OpenTelemetry 规范](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)。详细使用方式见 [Monitoring](monitoring.md)。

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CODE_ENABLE_TELEMETRY` | 设置为 `1` 启用 OTel 自定义上报；为兼容从 Claude Code 迁移的客户，`CLAUDE_CODE_ENABLE_TELEMETRY` 同样生效 |
| `OTEL_TRACES_EXPORTER` | `otlp`（默认）/ `console`（输出到日志，便于调试）/ `none`（关闭） |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 通用 OTLP endpoint，工具会自动追加 `/v1/traces` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | traces 专用 endpoint，作为完整 URL 使用，优先级高于通用变量 |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP 请求头，格式 `k1=v1,k2=v2`，value 支持 URL 编码 |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS` | traces 专用请求头，优先级高于通用变量 |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | 仅支持 `http/protobuf`（默认）；其他值（如 `grpc`、`http/json`）会回退并打告警 |
| `OTEL_SERVICE_NAME` | 覆盖默认 `service.name` |
| `OTEL_RESOURCE_ATTRIBUTES` | 资源属性，格式 `k1=v1,k2=v2`，会合并进 trace resource |

> 当 `DISABLE_TELEMETRY=1` 时，无论上述变量如何设置，OTel 上报均关闭。

## 任务和后台工作

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_DISABLE_BACKGROUND_TASKS` | 设置为 `1` 禁用所有后台任务功能 |

## Daemon 模式

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_DAEMON_ALLOW_SLEEP` | 设置为 `1` 或 `true` 禁用 daemon 的防休眠功能（允许系统正常进入 idle sleep）。唤醒后的自动重连不受影响 |
| `CODEBUDDY_DAEMON_AUTO_CONNECT_CHANNELS` | 设置为 `0` 或 `false` 禁用 daemon 启动时自动连接微信/企微 channel。也可通过 `settings.json` 的 `daemonAutoConnectChannels: false` 配置。单个实例可在 `instances.json` 中设置 `autoConnect: false` |
| `CODEBUDDY_DAEMON_RESTORE_CHANNELS` | daemon 自动重启时由系统设置，包含需要恢复的 channel 列表（逗号分隔，如 `wechat:abc,wecom:default`）。用户通常无需手动设置 |

## Agent 执行控制

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CODE_MAX_TURNS` | 主 Agent 的最大执行轮次。优先级：CLI `--max-turns` > 此环境变量 > 默认值 (500) |
| `CODEBUDDY_CODE_SUBAGENT_MAX_TURNS` | 子 Agent 的最大执行轮次。优先级：CLI `--max-turns` > 此环境变量 > 模型动态传入的 `max_turns` > 默认值 (500) |
| `CODEBUDDY_CODE_MAX_SUBAGENTS_PER_SESSION` | 每会话子代理 spawn 预算上限（正整数，默认 200，可上下调整，不可关闭）。嵌套 spawn 共享同一份预算；超限时 Agent 工具返回错误并提示改用自身工具完成剩余工作；`/clear` 新建会话后重置 |
| `CODEBUDDY_CODE_DISABLE_AUTO_MEMORY` | 设为 truthy 关闭 agent 级持久记忆（frontmatter `memory` 字段不再注入记忆段落）。默认未设置（启用） |
| `CODEBUDDY_SUBAGENT_PERMISSION_MODE` | 子 Agent/团队成员的默认权限模式（如 `bypassPermissions`、`acceptEdits`、`default`、`plan`）。优先级：Agent 工具 `mode` 参数 > CLI `--subagent-permission-mode` > 此环境变量 > Settings `permissions.subagentPermissionMode` > 映射表默认值 |
| `CODEBUDDY_TEAM_IDLE_DETECTION_DISABLED` | 设为 `1` 关闭队员空闲感知（默认启用）。关闭后"等待队员空闲"类 API 立即返回 `true` 不阻塞，进度快照也不再记录 |
| `CODEBUDDY_TEAM_SHUTDOWN_GRACEFUL_TIMEOUT_MS` | 团队成员优雅关停的兜底超时毫秒数，默认 `15000`。超过此时长仍未收到队员响应将强制终止进程。设为 `0` 禁用强制兜底（纯等待响应） |

## Gateway 和远程访问

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_GATEWAY_AUTH` | Gateway 认证模式（`password` 或 `none`）。优先级最高，覆盖 `--auth` 与 settings `gateway.auth`。`--serve` 默认已是 `password`；设为 `none` 会关闭认证，此时同机任意进程可经该服务执行命令、读写文件，仅建议在隔离环境或 CI 中使用 |
| `CODEBUDDY_GATEWAY_PASSWORD` | Gateway 访问密码。未设置时首次启动自动生成随机密码并写入 settings |
| `CODEBUDDY_GATEWAY_FORCE_TUNNEL` | 设置为 `1` 强制使用 tunnel 模式 |
| `CODEBUDDY_DISABLE_REQUEST_VALIDATION` | 设置为 `1` 关闭 Gateway 自定义请求头校验（`X-CodeBuddy-Request`）。详见 [HTTP API 安全](./http-api.md#安全) |
| `CODEBUDDY_CODE_CORS_ORIGINS` | 额外的 CORS 允许来源（逗号分隔）。支持精确 origin、`*.domain` 子域通配和 `*` 全开。如 `https://*.example.com,https://specific.com`。未设置时，若服务绑定 `0.0.0.0`（`--host 0.0.0.0`）则自动允许所有来源 |
| `SERVER__HOST` | `--serve` 模式监听地址（默认：`127.0.0.1`） |
| `SERVER__PORT` | `--serve` 模式监听端口；设为 `0` 时由内核自选端口，服务绑定后该变量会被更新为实际监听端口 |

## 企业微信集成

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_GATEWAY_WECHAT_KF_TOKEN` | 企业微信客服 Token |
| `CODEBUDDY_GATEWAY_WECHAT_KF_ENCODING_AES_KEY` | 企业微信客服加密密钥 |
| `CODEBUDDY_GATEWAY_WECHAT_KF_CORP_ID` | 企业微信客服企业 ID |
| `CODEBUDDY_GATEWAY_WECHAT_KF_CORP_SECRET` | 企业微信客服企业密钥 |
| `CODEBUDDY_GATEWAY_WECHAT_KF_ACCOUNT_NAME` | 企业微信客服账户名 |
| `CODEBUDDY_GATEWAY_WECOM_TOKEN` | 企业微信 Token |
| `CODEBUDDY_GATEWAY_WECOM_ENCODING_AES_KEY` | 企业微信加密密钥 |
| `CODEBUDDY_GATEWAY_WECOM_CORP_ID` | 企业微信企业 ID |
| `CODEBUDDY_GATEWAY_WECOM_CORP_SECRET` | 企业微信企业密钥 |
| `CODEBUDDY_GATEWAY_WECOM_AGENT_ID` | 企业微信应用 ID |

## Channel 自动连接

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_CHANNEL_AUTO_CONNECT` | 设置为 `1` 或 `true` 启动时自动连接所有已配置的 channel（企微 + 微信） |
| `CODEBUDDY_WECOM_AUTO_CONNECT` | 设置为 `1` 或 `true` 启动时自动连接所有已配置的企微机器人实例 |
| `CODEBUDDY_WECHAT_AUTO_CONNECT` | 设置为 `1` 或 `true` 启动时自动连接所有已配置的微信机器人实例 |
| `CODEBUDDY_WECOM_BOT_ID` | 企微 AI 助手 Bot ID。设置后自动创建 default 实例并出现在 `/remote-control` 列表中 |
| `CODEBUDDY_WECOM_BOT_SECRET` | 企微 AI 助手 Secret。需与 `CODEBUDDY_WECOM_BOT_ID` 配合使用 |

> **提示**：`CODEBUDDY_CHANNEL_AUTO_CONNECT` 是统一开关，`CODEBUDDY_WECOM_AUTO_CONNECT` 和 `CODEBUDDY_WECHAT_AUTO_CONNECT` 是分类型开关，三者任一匹配即生效。所有模式（交互、`--serve`、daemon）下均生效。

## 调试和诊断

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_DEBUG` | 设置为 `1`/`true`/`yes`/`on` 启用调试模式（等同于 `--debug`）|
| `CODEBUDDY_DEBUG_SDK` | 设置为 `1`/`true`/`yes`/`on` 启用 SDK 调试 |
| `CODEBUDDY_DEBUG_REQUEST` | 设置为 `1` 启用请求调试 |
| `CODEBUDDY_STARTUP_PROFILE` | 设置为 `1` 启用启动性能分析 |
| `CODEBUDDY_CODE_HEAP_SNAPSHOT_NEAR_LIMIT_PCT` | **OOM 取证**（默认关闭）。开启后当进程堆越过 V8 堆上限高水位时，自动写一份 heap snapshot 到 `~/.codebuddy/diagnostics/<date>/oom-nearlimit-<pid>-<ts>.heapsnapshot`（进程内只写一次）。取值：`on`/`true`/`1` 按默认 85% 水位；`0.9` 或 `90` 自定义水位；未设 / `0` / `off` / `false` 关闭。⚠️ 快照文件≈当时 heapUsed 的 1.5 倍（GB 级堆会写出数 GB 文件），仅排查 OOM 时开启。详见[故障排查 · OOM](troubleshooting.md#内存溢出-oom-排查) |
| `CBC_HEAP_SNAPSHOT_ON_WORKFLOW_END` | 设置为 `1` 时，每个 workflow（`ultracode` 等）跑完后写一份 heap snapshot 到 `~/.codebuddy/diagnostics/<date>/`。默认关闭（会占磁盘），仅排查 workflow 残留内存时开启 |

## E2E 测试 (Record/Replay)

用于 E2E 测试的模型响应录制/回放功能。录制模式下捕获真实模型响应，回放模式下使用录制文件替代真实 API 调用。

| 环境变量 | 说明 |
|---------|------|
| `CODEBUDDY_RECORD_DIR` | 录制模式：指定录制文件保存目录。设置后模型响应会保存到该目录的 `recording.jsonl` 文件 |
| `CODEBUDDY_REPLAY_DIR` | 回放模式：指定录制文件读取目录。设置后从 `recording.jsonl` 回放响应，无需真实 API |
| `CODEBUDDY_REPLAY_SPEED` | 回放速度倍率。`0` 表示无延迟立即返回，`1` 表示按原始时间间隔回放（默认：`1`）|
| `CODEBUDDY_REPLAY_STRICT` | 设置为 `1` 启用严格模式：录制耗尽时抛出错误而非透传到真实 API |

> **注意**：`CODEBUDDY_RECORD_DIR` 和 `CODEBUDDY_REPLAY_DIR` 互斥，不能同时设置。

## 其他

| 环境变量 | 说明 |
|---------|------|
| `SLASH_COMMAND_TOOL_CHAR_BUDGET` | 斜杠命令工具元数据的最大字符数（默认：15000） |
| `CODEBUDDY_CODE_API_KEY_HELPER_TTL_MS` | 刷新凭证的间隔（毫秒）（默认：300000） |

## 使用示例

### 基础认证配置

```bash
# 设置 API 密钥
export CODEBUDDY_API_KEY="your-api-key"

# 设置代理服务器
export HTTP_PROXY="http://proxy.example.com:8080"
export HTTPS_PROXY="https://proxy.example.com:8080"

# 设置代理绕过列表
export NO_PROXY="localhost,127.0.0.1,.internal.example.com"

# 设置自定义请求头（多个 header 使用 \n 分隔）
export CODEBUDDY_CUSTOM_HEADERS="X-Custom-Header: value1\nX-Another-Header: value2"

# 启动 CodeBuddy
codebuddy
```

### 使用第三方模型服务

```bash
# 使用自定义 API 端点
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_BASE_URL="https://api.example.com/v1"
codebuddy --model your-model-name
```

#### 对接 DeepSeek 示例

对接任意兼容 Anthropic 协议的第三方模型服务（如 DeepSeek），只需配置 Base URL、API Key 和模型变量，无需额外修改 `models.json`：

```bash
# 端点与密钥
export CODEBUDDY_BASE_URL="https://api.deepseek.com"
export CODEBUDDY_API_KEY="<your-deepseek-api-key>"

# 主 Agent 默认模型
export CODEBUDDY_MODEL="deepseek-v4-pro"

# 复杂推理使用的大模型
export CODEBUDDY_BIG_SLOW_MODEL="deepseek-v4-pro"

# 后台/轻量任务使用的小模型
export CODEBUDDY_SMALL_FAST_MODEL="deepseek-v4-flash"

# 运维级统一覆盖所有子代理。
# 不设置时会继续使用单次调用、按子代理设置和产品内置编排。
export CODEBUDDY_CODE_SUBAGENT_MODEL="deepseek-v4-flash"

# 启动时可通过 --model 显式指定主模型
codebuddy --model deepseek-v4-pro
```

> **提示**：以上变量也可以写入 `settings.json` 的 `env` 字段，每个会话自动应用，便于团队统一配置。

### 中国版配置

```bash
# 设置中国版环境标识
export CODEBUDDY_INTERNET_ENVIRONMENT=internal

# 设置 API 密钥
export CODEBUDDY_API_KEY="your-api-key"

# 启动 CodeBuddy
codebuddy
```

### 启用高级功能

```bash
# 启用自动内存
export CODEBUDDY_DISABLE_AUTO_MEMORY="0"

# 启用扩展思考
export MAX_THINKING_TOKENS="10000"

# 非交互模式运行
codebuddy -p -y "你的查询"
```

### 调试和性能分析

```bash
# 启用调试模式
export CODEBUDDY_DEBUG="1"

# 启用启动性能分析
export CODEBUDDY_STARTUP_PROFILE="1"

# 启动 CodeBuddy
codebuddy
```

## 在 settings.json 中配置

环境变量也可以在 `settings.json` 的 `env` 字段中设置：

```json
{
  "env": {
    "CODEBUDDY_API_KEY": "your-api-key",
    "HTTPS_PROXY": "https://proxy.example.com:8080",
    "MAX_THINKING_TOKENS": "10000",
    "CODEBUDDY_DISABLE_AUTO_MEMORY": "0"
  }
}
```

## 工具输出外部化机制

当工具执行产生的输出超过阈值时，CodeBuddy Code 会自动将完整输出保存到磁盘，给模型只发送截断后的内容和文件路径指针，模型可按需读取完整内容。

### 数据流

```
Shell 输出
  ├─→ OutputSpiller（完整输出流式写入磁盘）
  └─→ TruncateBuffer（内存中保留 head + tail，约 30KB）
                          ↓
                  检测到截断 → 生成 placeholder（~2KB preview + 文件路径）
                          ↓
                  模型收到 placeholder，可通过 Read 工具按需读取完整文件
```

### 各阶段数据大小（以 1.3MB 输出为例）

| 阶段 | 内容 | 大小 |
|------|------|------|
| 磁盘文件（OutputSpiller） | 完整原始输出 | 1,355,099 bytes |
| 内存缓冲（TruncateBuffer） | head 6KB + tail 24KB | ~30KB |
| 发给模型（placeholder） | 文件路径 + preview | ~2KB |

### 存储目录

工具输出文件存储在项目数据目录中：

```
~/.codebuddy/projects/{projectDir}/
  └── {sessionId}/
      ├── tool-results/                          ← 主 session 的工具结果
      │   ├── {callId}.txt
      │   └── ...
      └── subagents/                             ← 子代理数据
          ├── agent-{agentId}.jsonl              ← 子代理对话历史
          └── agent-{agentId}/
              └── tool-results/                  ← 子代理的工具结果
                  ├── {callId}.txt
                  └── ...
```

### 相关环境变量

| 环境变量 | 影响范围 | 默认值 |
|---------|---------|--------|
| `BASH_MAX_OUTPUT_LENGTH` | Bash 工具内存保留量，超出则截断并触发磁盘外部化 | 30000 |
| `CODEBUDDY_TOOL_RESULT_THRESHOLD_KB` | 非 bash 工具（如 MCP）在 session 层的外部化阈值 | 50 |

## 另见

- [Settings](./settings.md) - 在 `settings.json` 中配置环境变量和其他设置
- [CLI Reference](./cli-reference.md) - 命令行参数完整列表
- [MCP Setup](./mcp.md) - MCP 服务器配置
- [子代理](./sub-agents.md) - 子代理存储目录说明
