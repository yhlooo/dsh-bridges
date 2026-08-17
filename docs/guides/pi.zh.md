# Pi 桥接

[English](pi.md)

把为 Pi 配置的资产桥接进 DeepSeek Harness：`.pi/` 的 skills 与 prompt 模板、
上下文文件记忆。Pi 没有 hook 配置、权限规则系统与 MCP 配置——其 TypeScript
扩展事件总线不在范围内。安装步骤与各桥接的公共行为见[指南索引](README.zh.md)。

## 配置

桥接在 `bridges` 行下拥有一个配置段，任何后续 patch 层都可以覆盖：

```yaml
- id: bridges
  config:
    pi:
      enabled: true                     # Pi 桥接的总开关
      skills: true                      # 发现 .pi / ~/.pi/agent 的 skills 与 prompt 模板
      memory: true                      # 注入 AGENTS.md / CLAUDE.md 链与 APPEND_SYSTEM.md
      userPiDir: '~/.pi/agent'          # 用户级 Pi 配置目录（设置 PI_CODING_AGENT_DIR 时以它为准）
      watch: true                       # 监听技能根目录、settings 文件与 trust.json
      memoryMaxBytes: 32768
```

## Skills 与 prompt 模板

读取 Pi 的资产位置并注册到 DeepSeek Harness 技能注册表（provider `pi`），出现在模型可见的技能目录中，可用 `/名称` 触发：

| Pi 位置 | 注册为 |
| :--- | :--- |
| `$PI_DIR/skills/<name>/SKILL.md`（递归发现；`$PI_DIR` = `PI_CODING_AGENT_DIR` 或 `~/.pi/agent`） | 用户级技能 |
| `$PI_DIR/skills/<name>.md`（根级扁平文件） | 用户级技能 |
| `.pi/skills/<name>/SKILL.md` 与扁平 `.md`（项目级，受信任门禁） | 项目级技能 |
| `$PI_DIR/prompts/<name>.md` / `.pi/prompts/<name>.md`（非递归，项目级受信任门禁） | 技能（斜杠模板；`/名称` 手势触发） |
| settings 的 `skills` / `prompts` 数组（文件或目录路径） | 按声明层归入用户/项目段 |

映射规则：

- 技能名取 frontmatter 的 `name`（Pi 允许与目录名不同；缺省时回退到目录/文件名——Pi 源码行为）。DeepSeek Harness 要求 kebab-case，不合规的名字跳过 + 告警（不转写）。
- `description` 必填（Pi 不加载没有它的技能；桥接跳过 + 告警），按 Pi 的 1,024 字符上限截断。
- `disable-model-invocation: true` → 技能离开模型目录但仍可 `/名称` 触发（上游是 `/skill:name`）；非法值告警并视为 false（Pi 宽松语义）。
- `metadata` 透传；`allowed-tools`（实验性）、`license`、`compatibility` 与未知字段忽略（记限制）。
- 优先级遵循 Pi 源码加载顺序：全局位置先于项目位置、同名冲突保留先发现者，因此**个人资产覆盖项目资产**；同级技能优先于同名 prompt 模板。同名冲突时 DeepSeek Harness 原生技能始终胜出（见[公共行为](README.zh.md#公共行为)）。
- Pi 也读取的 `.agents/skills` 位置**有意不重读**：DeepSeek Harness 自带的 filesystem provider 已覆盖 `.agents` 资产，重读会产生重复候选。
- 项目 `.pi/skills`、`.pi/prompts` 与项目 `.pi/settings.json` 仅在项目受信任时加载。桥接按 Pi 的非交互语义解析信任：`$PI_DIR/trust.json` 中对当前目录（或最近父目录）的已保存决策优先，否则回退到全局 `defaultProjectTrust`（默认 `ask` 与 `never` 跳过项目资源，`always` 信任——非交互会话没有提示，`ask` 视为不信任）。`project_trust` 扩展事件不桥接。
- 已存在的技能根目录、settings 文件与 `trust.json` 被监听，改动无需重启即生效。

## 上下文文件记忆

DeepSeek Harness 自身已加载仓库根的 `AGENTS.md`。桥接在会话开始时额外注入（同样的 system-reminder 框架）：

- `$PI_DIR/AGENTS.md`（全局，不受项目信任限制）
- 从文件系统根向下走到工作目录的每层一个文件——每目录取第一个非空的 `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`（Pi 源码确认的候选顺序；`AGENTS.override.md` 整体替代该目录的 `AGENTS.md`/`CLAUDE.md`）；按规范路径去重
- `$PI_DIR/APPEND_SYSTEM.md`，然后是受信任项目的 `.pi/APPEND_SYSTEM.md`（Pi 把两者追加到系统提示）

仓库根的普通 `AGENTS.md` 与 DeepSeek Harness 已加载的文件一致时跳过，避免重复。预算 32 KiB：先丢更宽的全局文件，再截断最具体的段。

## 限制

尚未桥接（按子系统记录）：

- **扩展**：`~/.pi/agent/extensions/*.ts` / `.pi/extensions/*.ts` 与扩展事件（`tool_call` 拦截、`tool_result` 改写、`project_trust`……）——等价于 OpenCode 插件 API 的 TypeScript 运行时，无对应 DeepSeek Harness 接缝。
- **记忆**：`.pi/SYSTEM.md` / `$PI_DIR/SYSTEM.md`（整体替换系统提示——DeepSeek Harness 拥有系统提示）；`--no-context-files`、`--prompt-template` 等 CLI 开关是单次运行参数，无持久配置。
- **Skills**：`allowed-tools`（实验性的预批准工具列表）、`license` / `compatibility` 展示字段、`enableSkillCommands`（DeepSeek Harness 的 `/名称` 手势始终可用；该设置仅读取用于文档对齐）、包（`package.json` 的 `pi.skills` / 包内 `skills/` 目录）、CLI `--skill` 路径、`.agents/skills` 根（改由 DeepSeek Harness 原生 provider 覆盖）。
- **权限 / MCP / subagents**：Pi 无内置（信任门禁与工具白名单即其全部安全面；MCP 与 subagent 靠扩展实现，扩展不在范围内）。
- **信任**：交互式信任提示与 `project_trust` 扩展事件不可用，因此 `ask` 在 DeepSeek Harness 会话中解析为不信任（与 Pi 自身的非交互行为一致）。
