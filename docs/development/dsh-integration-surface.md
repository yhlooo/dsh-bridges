# DSH 侧接缝 API 速查

本文件汇总 dsh-bridges 各子系统会用到的 DeepSeek Harness 接缝（基于 v0.1.0-rc.6 实测）。实现映射与代码时对照这里，不必再翻 dsh 安装包。签名按运行时行为描述，完整类型以安装包内 `lib/types` 为准。

## 1. 插件打包与加载

### 包结构

- 包名即插件名（本项目为 `dsh-bridges`），`package.json` 声明：

```jsonc
{
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib/", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

- 模块导出（**不能有 default export**，原因见 pitfalls）：

```ts
export const name = 'dsh-bridges'
export const inject = ['skills'] as const   // 依赖 ctx.skills 时声明，否则 apply 内读 ctx.skills 直接抛错
export const Config = z.object({ ... })     // schemastery schema
export function apply(ctx: Context, config: ...): void { ... }
```

### patch 层语法（`cordis.patch.yml`）

- **新增行必须用 `insert`**；直接写 `- id: x, name: y` 是对既有行的覆盖，找不到目标会报 `patch: entry "x" not found`：

```yaml
- insert:
    - id: bridges
      name: 'dsh-bridges'
      config: { ... }        # 可选；会被 schemastery Config 校验并补默认值
      # disabled: !!js ...   # 可用 JS 表达式
```

- 后续 patch 层（profile 的 `cordis.patch.yml`、`--patch`）按 `id` 覆盖整段 `config`。`id` 是覆盖定位键，`name` 才是模块导入名。
- 用户安装：`dsh plugin --profile <name> add <spec>`（pnpm add + 自动把带 `dsh.bundle.patch` 的依赖写进 `dsh.profile.bundles`）。bundle 在 **dsh 启动时**组合，改组合树后必须重启进程。
- 验证组合：`dsh --profile <name> --dump-config`。

### 配置 schema（schemastery）

```ts
export const Config = z.object({
  claudeCode: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    userClaudeDir: z.string().default('~/.claude'),
    hookTimeoutMs: z.number().default(600_000),
  }),
})
```

- 嵌套对象**自动补全**：`Config({})` 与 `Config({ claudeCode: {} })` 都会产出全默认的 `claudeCode` 段；字段缺省时按字段级 default 填充。
- 不要在嵌套对象上加 `.default({})`（类型不通过，且无必要）。
- `apply(ctx, config)` 收到的 config 已由 loader 用 Config 校验/补全，但手动合并一次默认值可防直接编程调用时的缺字段。

## 2. skills 注册表（`ctx.skills`，`@deepseek-ai/dsh-skill`）

- `inject: ['skills']` 后 `ctx.skills` 可用（宿主机组合自带该服务）。
- `ctx.skills.registerProvider(create)`：apply 期间**同步**调用；`create(control)` 返回 provider，`control.signal` 在注册失败/销毁时 abort，`control.invalidate()` 使已缓存目录失效（仅在该注册存活期间有效）。返回 disposer。
- provider 契约：

```ts
interface SkillProvider {
  readonly name: string                       // 本项目：工具名，如 'claude-code'
  list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation>
  get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined>
}
// options: { cwd?, signal? }；list 可简写返回数组，或 { candidates, complete: false } 表示发现不完整
```

- `SkillCandidate` 关键字段：`name`（kebab-case，用 `isSkillName` 校验）、`description`、`whenToUse?`、`invocation: { modelInvocable, userInvocable }`（必填解析值）、`source`（提示可见元数据字符串）、`provider`、`resourceBase?`（`{kind:'directory',path}` | `{kind:'url',url}` | `{kind:'opaque',description}`）、`rank`（同层内越小越优先）、`locator`（不透明，回传给 `get`）、`path?`、`metadata?`。
- `SkillDefinition` = 摘要 + `content`（正文）。
- **冲突规则**：跨层"最近层整名胜出"；同层内按 rank → 注册顺序 → provider 内顺序。运行时技能 rank=250；`BUNDLED_SKILL_RANK`=600。dsh 自带 filesystem provider 用 100/200/300/400/500（项目 dsh / 项目 agents / custom / 用户 dsh / 用户 agents），本项目的段分配：claude 105–120（个人 < 项目）、codebuddy 125–140（**项目 < 用户**——段内顺序跟随上游优先级，CodeBuddy 与 Claude 相反，别套用同一顺序）、opencode 145–160（项目 < 用户；skills < JSON 命令 < 文件命令）、codex 165–175（项目 < 用户 < 系统；项目段内"越靠 cwd 越优先"由 provider 内候选顺序保证，rank 相同）、pi 180–195（个人 < 项目——pi 源码先加载全局位置、同名保留先发现者；段内 skills < settings 技能 < prompts < settings 模板；注意避开 filesystem provider 的 200 点）、gemini-cli 205–220（**工作区 < 用户**——Gemini 发现层级内置 < 扩展 < 用户 < 工作区；段内 skills < agents < commands；同样避开 200 点）。
- `get()` 返回的名字与候选不一致 → 注册表自动 invalidate 该 provider。文件消失返回 `undefined` 即可。

## 3. 文件系统服务（可选 `ctx.get('fs')`）

- `const fs = ctx.get('fs')`：有则用服务（走沙箱与观察策略），没有则 Node 回退（本项目封装在 `src/fs-adapter.ts`）。
- 关键方法：
  - `resolve(path, { cwd?, signal? }) → Promise<FsTarget>`（缺失路径会抛 `ENOENT` 系错误）
  - `stat(target, signal?) → Promise<FsInfo | undefined>`，`FsInfo = { version, type: 'file'|'directory'|'other', size? }`
  - `readText(target, signal?) → Promise<string>`；`listDir(target, signal?) → Promise<{ name, type, target, version?, size? }[]>`
- 注意：`FsInfo` **没有 mtime**；变更探测用不透明的 `version` 做 stamp（`String(info.version)`），Node 回退用 `mtimeMs`。

## 4. agent 生命周期（`@deepseek-ai/dsh-agent`）

事件均可在宿主根 context 上用 `ctx.on` 订阅（未加 scope 的监听器收到所有 agent 的事件；`agent.ctx` 上订阅则只收该 agent 的）。载荷 `this` 为 `Scoped<Agent>`。

| 事件 | 模式 | 载荷 | 返回 |
| :--- | :--- | :--- | :--- |
| `agent/session-start` | emit | `{ agent, source }`，`source: 'startup'|'resume'|'clear'|'compact'` | — |
| `agent/pre-step` | waterfall | `{ agent, messages: UserMessage[], turn, step, signal }` | `{ kind:'reject' } \| { kind:'enter', messages: UserMessage[] }` |
| `agent/turn-stopping` | serial | `{ agent, turn, signal }` | `void \| Promise<void>` |
| `agent/disposed` | emit | `{ agent }` | — |

- `agent.session.header`：`cwd?`（会话工作目录）、`delegationDepth?`（**子代理会话才有**，顶级会话无此字段——用它区分主会话/子代理）、`parentSession?`、`origin?: 'subagent'`、`agentPreset?`。
- `agent.inject(message)`：非唤醒式排队上下文，最近一个 pre-step 边界认领；空闲 driver 不会为它开回合。
- `agent.steer(message)`：唤醒式；空闲 driver 会开新回合。Stop 续跑、拦截原因可见化用这个。
- `agent/session-start` 文档明示"用 `agent.inject()` 种初始上下文"。

### `agent/pre-step` 注入顺序

- 只处理 claimed 消息中 `source.kind === 'user'` 的（真正的用户输入；子代理任务等不是这个 source）。
- 想把自己的上下文放在其它注入（如技能调用注入）**之后**：先 `const decision = await next()`，再往 `decision.messages` 末尾追加。
- **拦截提示词**：不要 `{kind:'reject'}`（原因无处可见），而是把进入消息替换为一条通知消息 `{kind:'enter', messages:[notice]}`——原提示词被擦除，原因随通知进入本轮，模型会向用户解释。

## 5. tools 执行管道（`@deepseek-ai/dsh-tools`）

| 事件 | 模式 | 签名 | 返回 |
| :--- | :--- | :--- | :--- |
| `tools/pre-execute` | waterfall | `(exec: ToolExecution, next)` | `{kind:'allow'} \| {kind:'deny', reason} \| {kind:'ask', reason?}` |
| `tools/execute` | waterfall | `(exec, next)` | 只可替换 `exec.signal` |
| `tools/post-execute` | waterfall | `(exec, result: ToolExecutionResult, next)` | `{kind:'accept', content?\|value?, additionalContexts?} \| {kind:'block', feedback, additionalContexts?}` |
| `tools/result` | emit | `(exec, result)` | 只读、已冻结 |

- `ToolExecution`：`{ callId, rootCallId, name, arguments, agent?, parent?, signal }`。`arguments` 在进入策略前已快照冻结——**无法改写输入**（上游的 `updatedInput` 在这里不可实现，记录为限制）。
- `ToolExecutionResult`：成功 `{ isError:false, value, content, meta?, additionalContexts? }`；失败 `{ isError:true, error:{ message, info? }, content, ... }`。**失败结果同样经过 post-execute**，用 `result.isError` 区分成功/失败事件。
- accept 的 `content` 与 `value` 二选一：`value` 会重新校验输出 schema，外部文本替换用 `content`（`ContentBlock[]`）。
- 包裹顺序：先 `await next()` 拿到下游决策再叠加自己的改动（替换 content、追加 `additionalContexts`），下游 block 时保留其 feedback 并追加自己的 contexts。

## 6. 消息构造（`@deepseek-ai/dsh-llm`）

```ts
import { createUserMessage } from '@deepseek-ai/dsh-llm'

const message = createUserMessage({
  content: [{ type: 'text', text: '...' }],
  source: { kind: 'plugin', plugin: 'claude-code-hooks' },   // 每个子系统自己的 id
})
```

- `UserMessage` = `{ id, role:'user', content: ContentBlock[], source: MessageSource }`；`createUserMessage` 自动生成 id 并冻结。
- 插件注入消息统一用 `source: { kind:'plugin', plugin: '<tool>-<子系统>' }`；注入正文里的 `</system-reminder>` 要转义，防止闭合插件自己的框架。

## 7. 生命周期与 effect

```ts
ctx.effect(() => () => { /* 同步清理 */ }, 'label')   // 回调必须返回 disposer 函数
ctx.on('event', handler)                              // 随 fiber 自动解绑
```

- provider 的 watcher、spawn 的子进程（含 async hook）都要有登记与 teardown 清理；settings / watcher 缓存要有界（LRU）。
- `ctx.logger` 直接用 `ctx.logger.warn(...)` 等；`ctx.get('fs')` 返回 `FileSystem | undefined`。

## 8. 打包细节

- NodeNext：所有相对导入写 `.js` 扩展名；`verbatimModuleSyntax` 下类型必须 `import type`。
- tsconfig 排除 `src/__tests__`，测试由 vitest 跑源码（`include: ['src/**/*.test.ts']`）。
- pnpm 的构建脚本批准（esbuild）会被写进 `pnpm-workspace.yaml` 的 `allowBuilds`，该文件要保留提交。

## 9. 会话级沙箱 / 审批策略覆盖（codex 权限桥接用）

- `@deepseek-ai/dsh-sandbox-policy` 导出 `setSandboxMode(session, mode)`：向会话日志追加一个
  `sandbox/mode` 事件（`session.append("sandbox/mode", { mode })`），`SandboxMode =
  'read-only' | 'workspace-write' | 'danger-full-access'`——与 Codex 的 `sandbox_mode` 词汇完全一致。
  每次执行时按日志折叠取最后一次覆盖；无覆盖用部署默认。会话级**没有**可写根/网络开关
  （`[sandbox_workspace_write]` 无法映射，记录为限制）。
- `@deepseek-ai/dsh-user-approval` 导出 `setApprovalPolicy(session, policy)`：`ApprovalPolicy =
  'ask' | 'never'`，同样走会话日志事件 `approval/policy`。Codex `approval_policy: "never"` →
  `'never'`；`untrusted`/`on-request`/`granular` → `'ask'`。
- 两个包均为 `0.1.0-rc.6`，插件以 dependencies 引入（纯函数 + session.append，无副作用）。
- 权限规则引擎（claude/codebuddy 的 settings `permissions`）走 `tools/pre-execute`，与 hooks
  的 `permissionDecision` 在 `src/permissions/compose.ts` 的 `composePreToolDecision` 中组合
  （deny 规则恒胜、ask 规则压过 hook allow，对照上游 hooks 文档）。

## 10. MCP 动态实例化（P0.1 实施备忘）

- `@deepseek-ai/dsh-mcp-client` 是可动态加载的 cordis 插件（`inject: ['tools']`），
  `apply(ctx, config)` 连接一个服务器并把工具注册为 `mcp__<serverName>__<tool>`
  （`ctx.tools.register`），disposal 自动断开并注销。用 `ctx.plugin(mcpClient, config)` 逐服务器
  实例化；`serverName` 必须 `[A-Za-z0-9_-]{1,32}` 且全局唯一（建议工具前缀，如 `claude__github`）。
- stdio 传输：`{ transport: 'stdio', serverName, command, args, env, cwd, toolCallTimeoutMs,
  failOnStartupError, reconnect? }`；HTTP：`{ transport: 'streamable-http', serverName, url,
  headers, … }`。
