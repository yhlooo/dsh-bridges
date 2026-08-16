# 踩坑记录

claude-code、codebuddy-code、opencode、codex、pi、gemini-cli、cursor 各桥接真实踩过的坑，按"现象 → 原因 → 正确写法"记录。实现中报错先来这里找；解决新坑后补一条。

## 1. patch 新行报 `patch: entry "x" not found`

**现象**：`cordis.patch.yml` 写 `- id: claude-code` + `name: ...`，`--dump-config` 报 `patch: entry "claude-code" not found`。

**原因**：非 insert 的 patch 行是对**既有行**的覆盖（按 id 找目标行），不是新增。

**正确写法**：新增行必须包在 `insert` 里：

```yaml
- insert:
    - id: bridges
      name: 'dsh-bridges'
```

## 2. 启动报 `cannot get property "skills" without inject`

**现象**：apply 里第一句 `ctx.skills` 就抛错，且明明 `export const inject = ['skills']`。

**原因**：cordis 的 loader 用 `unwrapExports(module)` 取插件对象：`exports.default ?? exports`。模块里写了 `export default apply` 时，loader 拿到的是**裸 apply 函数**，`inject`/`Config` 全被丢掉；报错发生在 apply 内，说明 apply 被找到了，但注入声明没了。

**正确写法**：插件模块只导命名导出（`export const name/inject/Config`、`export function apply`），**不要 default export**。

## 3. NodeNext 编译错误：相对导入与类型导入

**现象**：`tsc` 报 `Relative import paths need explicit file extensions`；开了 `verbatimModuleSyntax` 后又报 `'BridgeLogger' is a type and must be imported using a type-only import`。

**原因**：`module: NodeNext` 的 ESM 产物要求相对导入写全 `.js` 扩展名；`verbatimModuleSyntax` 会保留裸的类型导入语句导致运行时报错，因此类型必须显式 `import type`。

**正确写法**：`import { x } from './foo.js'`、`import type { T } from './foo.js'`。移动文件时注意相对层级（`src/agents/<tool>/skills/` 里引用共享工具是 `../../../util.js`）。

## 4. `ctx.effect` 类型报错：回调要返回 disposer

**现象**：`ctx.effect(() => { ... })` 报 `Type 'void' is not assignable to type 'SyncEffect'`。

**原因**：cordis 的 `ctx.effect(execute, label)` 中 `execute` 必须**返回清理函数**（同步 `() => void` 或异步 disposer）。

**正确写法**：

```ts
ctx.effect(() => () => {
  void provider?.dispose()
}, 'claude-code skill watchers')
```

## 5. schemastery 嵌套对象 `.default({})` 类型不通过

**现象**：`z.object({ claudeCode: z.object({...}).default({}) })` 编译报 `{}` 不满足完整对象类型。

**原因**：`.default(value)` 要求 value 是该 schema 的完整输出类型；且根本不需要——schemastery 会**自动补全缺失的嵌套对象**：`Config({})` 与 `Config({ claudeCode: {} })` 都会得到全默认字段的 `claudeCode` 段。

**正确写法**：嵌套 `z.object({...})` 直接作为字段，字段级写 `.default(...)`；apply 里再手动合并一次默认值兜底。

## 6. hook 超时后子进程杀不干净，`close` 永不触发

**现象**：`sh -c 'sleep 5'` 的 hook 超时后进程"杀掉"了，但测试整体等满 5 秒才结束。

**原因**：SIGTERM 发给了 shell 本身，shell 死了但它的孙子进程（`sleep`）还活着，且继承的 stdout 管道让 `close` 事件一直不触发。

**正确写法**：POSIX 上 spawn 加 `detached: true`（独立进程组），取消/超时时 `process.kill(-child.pid, signal)` 杀**整个进程组**；SIGTERM 后再补一个 SIGKILL。Windows 无进程组，直接 `child.kill` 并记录为已知限制。

## 7. `UserPromptSubmit` 拦截后原因不可见

**现象**：pre-step 返回 `{kind:'reject'}` 拦截提示词，headless 输出为空，原因 notice 注入后也没有机会被渲染。

**原因**：reject 之后该回合没有任何 step 进入模型，注入的上下文（`agent.inject`）是非唤醒的，只能等下一次用户输入。

**正确写法**：把**进入消息整体替换**为一条通知消息：

```ts
return { kind: 'enter', messages: [makeBlockNotice('UserPromptSubmit', reason)] }
```

原提示词被擦除（与上游"erases the prompt"一致），原因随本轮进入模型，模型会向用户解释。通知文案要明确告诉模型"用户消息被拦截，请转告用户原因"。

## 8. 上游工具名与 DSH 工具名不一致，matcher 全部落空

**现象**：为 Claude Code 写的 `PreToolUse` hook（matcher: `Bash`）在 dsh 里从不触发。

**原因**：DSH 的 shell 工具名是 `bash`（其余如 `edit`/`read`/`web_search`），上游 hook 脚本和 matcher 都按上游命名（`Bash`/`Edit`/`Read`）写的。

**正确写法**：加一层翻译表（`src/agents/claude-code/hooks/names.ts`），matcher、`if` 规则、hook 输入载荷里的 `tool_name` **全部用翻译后的上游名字**；未在表中的工具原样透传。

## 9. 主会话事件误伤子代理

**现象**：每个子代理结束都触发 SessionEnd hook，子代理任务也触发 UserPromptSubmit hook。

**原因**：DSH 子代理就是普通的 agent/session；上游把 UserPromptSubmit / Stop / SessionStart / SessionEnd 限定在主会话（子代理另有事件）。

**正确写法**：用 `agent.session.header.delegationDepth !== undefined` 排除子代理（顶级会话无该字段）；工具类事件（Pre/PostToolUse）上游在子代理内也触发，不排除。

## 10. hooks 配置合并的细节

- 相同 handler 出现在多个 settings 文件 → 只跑一次（按 handler JSON 序列化去重，保留最早出现）。
- `disableAllHooks` 取**最具体**定义它的层（local > project > user）。
- `if` 过滤器只在工具事件上生效；其它事件上带 `if` 的 handler 永不运行（上游语义）。
- matcher 含正则特殊字符时走"非锚定正则"路径，纯 `[A-Za-z0-9_\-, |]` 字符集才是精确名集合——`mcp__memory` 这种精确名永远不会命中，要写 `mcp__memory__.*`。

## 11. 失败策略：fail-open 与 fail-closed 要各归各位

- **fail-closed**：技能 frontmatter 的 invocation 布尔值非法 → 丢弃整个技能 + warn（不猜测宽松策略）；技能名非 kebab-case → 跳过 + warn；matcher 正则非法 → 不匹配（不放大执行面）。
- **fail-open**：hook 运行超时 / 启动失败 / 被取消 → 放行动作（上游命令类 hook 语义）；`if` 规则无法解析 → 视为无过滤（上游明示 best-effort）。

不要用"更安全"的直觉替换上游协议，两类混用会产出既漏拦截又误拦截的组合。

## 12. bundle 改动必须重启进程

**现象**：`dsh plugin add .` 之后新的技能/hook 在运行中的会话里看不到。

**原因**：bundle 与 patch 在 dsh **启动时**组合，改 `dsh.profile.bundles`、改 `cordis.patch.yml`、改 `lib/` 都不会热加载（改 config 覆盖行同理）。

**正确做法**：改代码后 `pnpm build`，然后重启对应 profile 的 dsh 进程再验证。技能文件本身的内容变化不用重启（provider 的 watcher 会 invalidate）。

## 13. 插件模块的导出形态决定 loader 能否找到 inject/Config

与第 2 条同源，但值得单独强调：**验证方式**是用 `--dump-config` 或 headless 跑一次——编译通过、单测全绿都不代表 loader 能正确识别插件对象。每次改动插件导出形态（default/命名、`name`/`inject`）后，都跑一次 `dsh --profile <name> --dump-config` 确认行挂载无告警。

## 14. `dsh plugin` 与 pnpm 的路径细节

- `dsh plugin --profile <name> add <相对路径>` 的相对路径锚定在**调用目录**；仓库根执行 `add .` 会自链接本仓库。
- 相对路径依赖装的是**链接**（`link:`），改源码 + `pnpm build` 后重启 dsh 即可生效，无需重复 add。
- 首次 `pnpm install` 后 esbuild 的构建脚本会被拦截，需要 `pnpm approve-builds`（结果写入 `pnpm-workspace.yaml` 的 `allowBuilds`，要提交）。

## 15. 无资产项目也要干净

无 `.claude/`（或对应工具目录）时：skills provider 返回空目录（确认缺失的根是合法空态）、记忆注入跳过、hooks 无组直接放行；日志里不应出现告警。把"零开销"当验收项，防止探测逻辑对普通项目产生噪声或性能开销。

## 16. CodeBuddy 与 Claude 的同名机制语义相反，不能照抄 claude-code

codebuddy-code 复用 claude-code 的骨架时，以下四处语义不同，照抄会产出错误行为：

| 机制 | Claude Code | CodeBuddy Code（以 docs/reference/codebuddy-code/*.md 为准） |
| :--- | :--- | :--- |
| 资产优先级 | 个人 > 项目 | **项目 > 用户**（rank 段顺序反过来） |
| matcher | 纯 `[A-Za-z0-9_\-, \|]` 字符集是精确名集合，其余是非锚定正则 | `*`/空/缺省匹配全部，**其余一律按区分大小写正则**（裸 `Write` 命中 `NotebookWrite`，精确要写 `^Write$`） |
| 退出码 2 消息优先级 | JSON reason → **stderr** → 兜底 | stdout JSON `reason`/`stopReason` → 纯文本 stdout → **stderr 兜底**（stderr 是给用户看日志的位置） |
| 默认 hook 超时 | 600 秒（UserPromptSubmit 30 秒） | **60 秒**，无 UserPromptSubmit 特例 |

其余差异：`when_to_use` 不在 CodeBuddy Code 文档里（为兼容 Claude 资产仍识别）；PreToolUse 改写字段叫 `modifiedInput`（Claude 是 `updatedInput`）；`permissionDecision` 无 `defer`；`decision: "block"` 已废弃但仍兼容读取；settings 无 `allowedHttpHookUrls`（HTTP hook 不设白名单）；嵌套命令限定名 `group:name` 含 `:` 非 kebab-case，按"跳过 + warn、不转写"处理。skills.md 的 `skillOverrides` 四态不在 settings.md 表格里但确为 settings.json 键，实现时要读 settings 文件而不是 skill 文件。

## 17. 端到端冒烟的两个环境坑（codebuddy-code 桥接踩到）

**现象一**：新 profile（`dsh plugin --profile cb-test add .`）跑 headless 冒烟，180 秒超时（exit 124）且零输出。

**原因**：新 profile 没有模型路由凭据，headless 卡在模型调用上；`--dump-config` 里能看到 `agent-default-model` 行不代表凭据已配置。这不是插件问题。

**正确做法**：冒烟用已配置好路由的 profile（本仓库是 `headless`），不要为冒烟临时新建 profile；必要时先验证 profile 能裸跑一个最小提示词。

**现象二**："无资产零开销"验证失败——空项目里也发现了用户级技能。

**原因**：用户级资产在 `~/.codebuddy` / `~/.claude`，冒烟 fixture 往往往 HOME 里写过用户级资产，空项目自然还能发现它们。

**正确做法**：零开销验证用 `HOME=/tmp/cleanhome dsh --profile headless ...` 隔离 HOME；冒烟用完的用户级 fixture（`~/.codebuddy` 等）要及时清理，否则会污染后续所有项目的目录。

## 18. opencode 的技能名规则比 DSH 的 kebab-case 更严

DSH 的 `isSkillName`（kebab-case）允许下划线；opencode 的规则是 `^[a-z0-9]+(-[a-z0-9]+)*$`（仅小写字母数字 + 单连字符），且 frontmatter `name` 必须与目录名**逐字一致**、`description` 必填（1–1024 字符）。接 opencode 时两套校验都要做：先 `isSkillName`（DSH 要求）、再 opencode 正则，`name` 不一致 / `description` 缺失按"跳过 + warn"处理（opencode 的排查规则即 fail-closed），不要像 claude-code 那样回退正文首段。

## 19. 同一配置源里"合并后集合 + 层级来源"要一起存，否则重复注册

opencode 的 JSON 命令在 provider 里按"用户层根 / 项目层根"两次遍历时，如果 loader 只暴露**合并后**的 `command` map，每个命令会被注册两次（rank 147 与 157 各一份）。正确做法：loader 同时返回合并 map 与**项目层子集**（`projectCommands`），用户根只遍历"不在项目层"的条目。凡是"按层排序的根 + 合并覆盖语义"的组合都要警惕这个坑。

## 20. Codex 的 project 配置层是 root→cwd 的整条链，不是只有 cwd

Codex 文档里的四个常用 hooks 位置之一是 `<repo>/.codex/hooks.json`——repo 根，不一定是 cwd。`.codex/config.toml` / `hooks.json` 要从仓库根（`project_root_markers`，默认 `.git`）向下逐目录加载（最近层标量胜、hooks 全量叠加），cwd 只是链上最后一层。只读 `<cwd>/.codex/` 会漏掉最常见的仓库级 hooks。`project_root_markers` 本身来自 system/user 层（鸡生蛋：先按默认 `.git` 找根，才能读项目配置），桥接实现里两处走查（settings 的层链、skills 的技能根）要共用同一判定逻辑。

## 21. Codex 的用户技能目录与 CODEX_HOME 无关

Codex 的用户技能固定是 `$HOME/.agents/skills`（与 `~/.codex`、`CODEX_HOME` 无关），而用户 AGENTS.md / config.toml 在 `$CODEX_HOME`（默认 `~/.codex`）。桥接里这两条路径要分开配置（`userCodexDir` / `userSkillsDir`），别想当然地 `join(userCodexDir, 'skills')`。

## 22. 记忆去重要用"路径级"判断，别用内容比对

opencode / codex 的规则文件去重：DSH 核心已加载的只有**工作区根**的 `AGENTS.md` 与 `CLAUDE.md`（即 session cwd 下的这两个文件）。判断"该不该注入"要按**路径**（找到的项目规则文件 === `cwd/AGENTS.md` / `cwd/CLAUDE.md` 就跳过），而不是按内容比对——内容比对会把"父目录规则恰好与根文件同文"误判为重复而漏注入（父目录文件 DSH 并没有加载）。

## 23. teardown 只 kill 直接子进程会留下孤儿孙进程

**现象**：hook 命令经 `shell: true` 包装，`spawn` 返回的 child 是 shell，真正的 hook 进程是孙进程。teardown 时 `child.kill('SIGTERM')` 只杀了 shell，"杀干净"的假象来自 `close` 事件（shell 已死）；孙进程成为孤儿继续跑满整个存活期。

**原因**：`run.ts` 的超时/取消路径用的是**进程组 kill**（POSIX：`process.kill(-child.pid)`，配合 `detached: true` 让 shell 成为新进程组组长），而三个 bridge 的 `ctx.effect` teardown 写的是普通 `child.kill`——两条路径语义不一致。

**正确写法**：共享 `killHookChild`（`src/util.ts`），teardown 与超时/取消走同一套组杀逻辑。用 e2e 验证时，fixture 的 pid 要写**孙进程**的 pid（`node` 脚本写 `process.pid`），写 shell 的 pid（`$$`）会掩盖这个泄漏。Windows 没有进程组 kill，只能杀直接子进程，孙进程泄漏是已知平台限制（e2e 里该断言 `skipIf(win32)`）。

## 24. 单元测试的内存 fixture 路径必须是平台语义的

**现象**：CI 加 windows-latest 后，provider/settings/memory 测试在 Windows 上目录扫描全空（catalog 全 `[]`）。

**原因**：内存 fixture 的 Map 键硬编码 POSIX 绝对路径（`/proj/...`、`/home/u/...`），而被测代码用 `node:path` 拼接——Windows 上是 win32 语义（盘符根 + `\`），两边字符串对不上；测试里自写的 FsAdapter 还写死了 `'/'` 分隔符逻辑（`` `${path}/` ``、`split('/')`）。

**正确写法**：
- 共享 `src/__tests__/fixture-paths.ts` 的 `fx(...)`（平台 `join`）构造所有绝对 fixture 路径，断言里的期望路径也用同一构造；
- Adapter 内分隔符统一 `import { sep } from 'node:path'`（`` `${path}${sep}` ``、`split(sep)`）。
- 新增 fixture 时不要硬编码 `/proj` 等字面量；写好后在 Linux 上跑一遍，语义必须不变。

## 25. run 测试的 hook 命令要跨 shell（exec form 优先）

**现象**：CI Windows 上 run 测试失败——`printf` 不存在、`echo ... >&2; exit 2` 是 cmd 语法错误、`sleep` 不是 Windows 命令。

**原因**：hook 命令串经 `shell: true` 执行，POSIX `/bin/sh` 与 Windows `cmd.exe` 的语法和命令集不同。

**正确写法**：
- 有 `args` 字段的桥（claude-code / codebuddy-code）用 **exec form**：`command: 'node'` + `args: ['-e', '...']`——不经 shell、双平台一致，且超时 kill 直接作用于 node 进程本身，没有孤儿管道问题；
- codex 的上游契约只有 shell command（无 `args` 字段），只能 shell form：用 `node -e "..."` 写法（双引号内避免 `%`/`!`/`&`；`;` 与 `'` 在 cmd 里是字面量，`\"` 在两种 shell 下都安全）；
- 超时场景的 sleep 保持"刚超过 timeout"（3–5s）：Windows 上 kill 只杀直接子进程（cmd），孤儿孙进程继续持有管道，`close` 事件要等它退出才会触发。

## 26. 硬编码的 POSIX system 目录要用 `resolve` 转成平台绝对路径

**现象**：codex 桥的 system 层写死 `join('/etc/codex', 'skills')`，Windows 上解析成无盘符的 `\etc\codex\skills`，与 fixture 的 `fx('etc','codex',...)`（`<盘符>:\etc\codex`）对不上，system 层测试在 Windows 红。

**原因**：上游 Codex 的 system 层是 Unix-only（`/etc/codex/config.toml`），Windows 没有对应位置；直接 `join` 字面量在 win32 下得到"当前盘相对"的怪路径。

**正确写法**：`resolve('/etc/codex')`——POSIX 不变，win32 解析为 `<盘符>:\etc\codex`（当前盘根），两侧一致。settings.ts 与 skills/provider.ts 两处要同步改（`SYSTEM_CODEX_DIR` 常量与 provider 的 `join(resolve('/etc/codex'), 'skills')`）。

## 27. 提示可见的路径 label 要用 `join`，别用模板串拼分隔符

**现象**：Windows CI 上 codebuddy-memory 测试红：label 是 `D:\home\u\.codebuddy/CODEBUDDY.md`（混合分隔符），与 `fx(...)` 期望值不等。

**原因**：`` `${userDir}/CODEBUDDY.md` `` 模板串在 win32 上拼出 `/` 与 `\` 混用；这些 label 会进注入正文、用户可见。四个桥的 user 层 label（claude/codebuddy/opencode/codex 各一处）都有此模式。

**正确写法**：绝对路径 label 一律 `join(dir, 'NAME.md')`（或直接复用已 join 好的变量）。相对展示名（如 `.codebuddy/CODEBUDDY.md`）是有意为之，保持原样。

## 28. 新桥接的 rank 段要避开 filesystem provider 的整百点（100/200/300/400/500）

**现象**：给 gemini-cli 初选 rank 段 200–215，与 dsh 自带 filesystem provider
的「项目 agents」rank 200 同层撞点；同层内冲突按 rank → 注册顺序裁决，撞点
后桥接资产与 dsh 原生 `.agents/skills` 的优先级变得不可预期。

**原因**：dsh 自带 filesystem provider 用 100/200/300/400/500（项目 dsh /
项目 agents / custom / 用户 dsh / 用户 agents）这些**精确点**；已有四段
（105–120、125–140、145–160、165–175）都恰好落在整百点之间，新段必须照做。

**正确写法**：新段避开 200/300：pi 180–195、gemini-cli 205–220、cursor
225–240，全部小于运行时技能 250。段分配与理由同步进 contract golden 表、
guides 映射表与 dsh-integration-surface.md 三处。

## 29. pi 记忆链的「根 AGENTS.md 去重」依赖 git 根探测，无 git 根时 cwd 即根

**现象**：pi 记忆测试里无 `.git` 标记的 fixture 中，cwd 的 `AGENTS.md` 被当作
「dsh 已加载的根文件」跳过，测试期望「cwd 文件应注入」而红。

**原因**：桥接沿用 codex 的去重先例——dsh 核心加载的是「仓库根」的
`AGENTS.md`，桥接跳过与之内容一致的那份。仓库根探测回退为 cwd（codex 语义），
于是无 git 根时 cwd 的 `AGENTS.md` 就是「核心已加载的那份」，注入它反而重复。

**正确写法**：测试/文档明确这一语义（无 git 根时 cwd 的 AGENTS.md 视为核心已
加载、跳过）；要断言链路注入，fixture 必须带 `.git` 标记并把 cwd 放在子目录。

## 30. pi 的宽松 frontmatter 与 DSH 的 fail-closed 惯例要逐字段对齐

**现象**：pi 对技能校验「多数违规仅告警、仍加载」（name 可异于目录名、非法
布尔仅告警），只有「缺 description」不加载；照抄 claude 的 fail-closed 布尔
解析会丢弃 pi 本会加载的技能。

**原因**：上游语义决定 fail-open/fail-closed——pi 是宽松实现，claude 是严格
实现（AGENTS.md 教训：失败策略按协议走，不要自行"更安全"）。

**正确写法**：`disable-model-invocation` 非法值 → 告警 + 视为 false；name
缺省回退目录/文件名（源码确认）；仅缺 description 与 YAML 损坏跳过。BOM 容忍
在 splitFrontmatter 里做（对抗语料覆盖）。

## 31. 新工具的"宽松/严格"要按各自上游逐条对齐，别沿用上一家的习惯

**现象**：三连发 pi / gemini-cli / cursor 时，习惯性地把 pi 的宽松语义
（name 可异于目录名、非法布尔仅告警）套到 cursor 上，cursor 技能
frontmatter 测试按"回退目录名"写——但 Cursor 上游要求 name **必须等于**
目录名（fail closed）；反向也成立：gemini 的"应与目录名一致"是软约束、
policy-engine.md 的 tier 示例数字与表格 off-by-one，照抄文档示例会错。

**原因**：三个工具都实现 Agent Skills 标准，但容忍度不同：pi 显式宽松
（"warning about most violations but remaining lenient"）、gemini 文档
模糊（"should match"）、cursor 显式严格（"must use the .mdc extension"、
name 必填且等于目录名）。调研报告的措辞强度（must/should/未说明）就是
实现语义。

**正确写法**：每个新工具在 `skills/parse.ts` 的头部注释里写明"哪条来自
上游哪个措辞、宽松还是 fail-closed"；cursor 用 name 必须等于目录名（
fail closed），pi 用回退（宽松），gemini 用回退 + warn。同名冲突同理：
pi = 先发现者胜（源码确认）、gemini = 工作区层覆盖用户层（rank 表达）、
cursor = 项目 > 用户（rank 表达）。

## 32. Cursor 的 `.cursor/rules` 以仓库根为锚，matcher 是包含匹配

**现象**：cursor 记忆测试在 cwd=子目录的 fixture 下读不到规则（实现用
cwd/.cursor/rules），而 hooks 测试里 `matcher: "curl|wget"` 对命令
`wget https://x` 不命中（实现用了全串锚定）。

**原因**：Cursor 的项目资产统一锚定工作区根（`.cursor/rules` 在仓库根），
不是 cwd；hooks 的 beforeShellExecution matcher 文档明说"when the command
**contains** curl"——是包含语义，与 claude 的工具名全匹配语义不同。

**正确写法**：rules 目录用 `findRepositoryRoot(cwd)` 求仓库根后 join；
matcher 用非锚定正则（工具名单词自然全匹配、命令文本自然包含）。两处
都已在 guides 映射表中写明，避免后来者再踩。

## 33. gemini policy 引擎的优先级公式与文档示例冲突时以表格+公式为准

**现象**：policy-engine.md 正文公式写 `final = tier_base + priority/1000`、
表格写 User tier = 4，但文档示例又出现 `User policy → 3.100`——照示例
实现会让用户层规则与工作区层同优先级，求值结果不可预期。

**原因**：上游文档自相矛盾（调研报告已标注"实现前须以源码核对"）；本例
以公式 + 表格为准（Default=1、Extension=2、Workspace=3（上游禁用）、
User=4、Admin=5），工作区层因此也不读（上游 issue #18186）。

**正确写法**：实现注释引用"公式 + 表格"作为权威，guides 权限小节写明
"以表格+公式为准"；契约测试直接钉住 `final = 4 + priority/1000` 的行为。

## 34. e2e fixture 里的 `.git/HEAD` 标记不会被 git 跟踪，必须运行时创建

**现象**：pi/cursor 的记忆 e2e 本地全绿、CI 干净 checkout 全红——pi 断言
`Sub rules.` 缺失、cursor 规则注入 waitFor 超时。

**原因**：git 从不跟踪路径中含 `.git` 组件的文件（`git add` 静默忽略），
所以 fixture 里的 `.git/HEAD` 仓库标记只存在于本地工作树；CI checkout 里
缺失 → `findRepositoryRoot` 回退为 cwd → pi 把 cwd 的 AGENTS.md 当成"核心
已加载"去重、cursor 的 rules 目录锚到子目录而找不到。

**正确写法**：fixture 目录不提交任何 `.git` 内容；需要仓库根标记的测试在
`fixtureCopy` 之后调用 `e2e/harness.ts` 的 `markRepoRoot(dir)`（运行时
`mkdir .git` + 写 HEAD）。gemini 的边界标记同样处理，保证本地与 CI 一致。
