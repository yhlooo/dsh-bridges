# opencode 桥接示例项目

以本项目作为 DeepSeek Harness 的会话工作区打开，即可查看 dsh-bridges 的
opencode 桥接如何将 opencode 的资产桥接进来。

> 只含**项目级**资产。用户级资产（`~/.config/opencode/`）作用于整台
> 机器，示例有意不提供；如需体验可自行将文件复制到
> `~/.config/opencode/`。

## 目录结构

```
├── AGENTS.md                    工作区根指令（DeepSeek Harness 核心自行加载，
│                                 opencode 桥接跳过 cwd 层，避免重复注入）
├── opencode.jsonc               opencode 配置（JSONC 注释合法）
│   ├── command.greet            JSON 定义的命令 → 注册为技能
│   └── instructions:            docs/notes.md + docs/tips/*.md → 会话开始注入
├── docs/
│   ├── notes.md                 instructions 条目（单文件）
│   └── tips/
│       ├── conventions.md       instructions glob 展开的条目
│       └── writing-style.md     instructions glob 展开的条目
└── .opencode/
    ├── skills/
    │   └── api-doc-writer/SKILL.md   目录型技能（frontmatter 必填 name+description）
    └── commands/
        └── summarize.md              命令文件（可 /summarize 调用）
```

## 映射关系一览

| opencode 资产 | 桥接行为 |
| :--- | :--- |
| `.opencode/skills/<name>/SKILL.md` | 注册为 DeepSeek Harness 技能（provider `opencode`）；`name` 必须与目录名一致且 `description` 必填，否则丢弃 + 告警（与 opencode 一致） |
| `.opencode/commands/<name>.md` | 命令即技能；`description` frontmatter 缺省时回退正文首段 |
| `opencode.json(c)` 的 `command.<name>` | JSON 命令；**覆盖**同级同名命令文件 |
| `opencode.json(c)` 的 `instructions` | 本地文件与 `*`/`**` glob（相对配置文件目录解析），会话开始注入 |
| `AGENTS.md`（向上到 git 根最近的） | 注入；cwd 层的 `AGENTS.md` 是 DeepSeek Harness 已加载文件，跳过 |

opencode 没有 hooks 文件格式，因此本示例不含 hooks——它属于 opencode
插件 API 的范畴，不在桥接范围内（见[使用指南](../../docs/guides/README.zh.md)
「限制」小节）。

## 如何验证

```sh
# 1. 安装插件（repo 根目录，先 pnpm install && pnpm build）
dsh plugin --profile <name> add .

# 2. 在本目录启动 DeepSeek Harness
cd examples/opencode
dsh --profile <name>
```

- **Skills / Commands**：让模型 `skill api-doc-writer` 写接口文档，或
  输入 `/summarize`、`/greet`（JSON 命令）。
- **Memory**：会话开始后能看到 `docs/notes.md` 与 `docs/tips/*.md` 的
  内容被注入；根 `AGENTS.md` 由 DeepSeek Harness 核心加载（不重复）。
- **热更新**：改动 `opencode.jsonc`（如新增 command 或 instructions 条目）
  无需重启，桥接监听该文件并重新发布。
