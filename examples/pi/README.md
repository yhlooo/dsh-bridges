# pi 桥接示例项目

以本项目作为 DeepSeek Harness 的会话工作区打开，即可查看 dsh-bridges 的
pi 桥接如何将 pi 的资产桥接进来。

> 只含**项目级**资产。用户级资产（`~/.pi/agent/skills`、
> `~/.pi/agent/prompts`、`~/.pi/agent/AGENTS.md`）作用于整台机器，示例有意
> 不提供；如需体验可自行将文件复制到对应位置。

> **项目信任**：项目级 `.pi/` 资产只在 pi 信任该项目时加载。桥接按 pi 的
> 非交互语义解析信任：先看 `~/.pi/agent/trust.json` 里对当前目录（或最近父
> 目录）的已保存决策，否则回退到全局 `defaultProjectTrust`（默认 `ask`，
> 非交互下视为不信任）。要让本示例的项目资产生效，二选一：
>
> - 在 `~/.pi/agent/settings.json` 里设 `"defaultProjectTrust": "always"`；或
> - 在 `~/.pi/agent/trust.json` 里为 `<本仓库>/examples/pi` 保存 `true` 决策。

## 目录结构

```
├── AGENTS.md                      工作区根指令（pi 上下文文件链的一环）
└── .pi/
    ├── skills/
    │   ├── deploy-to-staging/SKILL.md   项目级技能（frontmatter name+description）
    │   └── pdf-tools/                   技能包：SKILL.md + references/ 支持文件
    └── prompts/
        ├── review.md                   斜杠模板 → 注册为 /review 技能
        └── summarize.md                带 $1 参数替换的模板
```

## 映射关系一览

| pi 资产 | 桥接行为 |
| :--- | :--- |
| `.pi/skills/<name>/SKILL.md`（递归发现；根级 `.md` 也算技能） | 注册为 DeepSeek Harness 技能（provider `pi`，rank 190）；`name` 可与目录名不同（frontmatter 优先） |
| `.pi/prompts/<name>.md`（非递归） | 注册为技能（rank 192）；`/name` 手势触发，正文 `$1`/`$@` 参数原样保留 |
| `AGENTS.md` / `CLAUDE.md` / `AGENTS.override.md` 链（文件系统根 → cwd） | 会话开始注入（system-reminder 框架）；每目录最多一个（override > AGENTS.md > AGENTS.MD > CLAUDE.md > CLAUDE.MD）；仓库根的普通 `AGENTS.md` 跳过（核心已加载） |
| `~/.pi/agent/APPEND_SYSTEM.md`、`.pi/APPEND_SYSTEM.md` | 追加注入（全局在前，项目需信任） |
| `.pi/SYSTEM.md`、`~/.pi/agent/SYSTEM.md` | **不桥接**（整体替换系统提示，无 DeepSeek Harness 接缝） |
| `~/.pi/agent/extensions/*.ts`、`.pi/extensions/*.ts` | **不桥接**（扩展事件总线属插件 API，记限制） |

## 验证方式

1. 按仓库根 README 安装插件：`dsh plugin --profile <name> add .`。
2. 解决项目信任（见文首提示），然后：

```sh
cd examples/pi
dsh --profile <name> "list the skills available in your catalog"
# → deploy-to-staging、pdf-tools、review、summarize 出现在技能目录中
dsh --profile <name> "/review"
# → review 模板内容作为提示词注入
```

3. 不设信任（默认 `ask`）再跑一次：项目级 `.pi/` 技能与模板消失、`AGENTS.md`
   仍注入——与 pi 的非交互信任语义一致。
