> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/troubleshooting.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 故障排查与最佳实践

本文档涵盖常见问题解决方案和使用优化建议。

---

## 安装问题

### Node.js 版本要求

CodeBuddy Code 需要 Node.js v18.20 或更高版本。

```bash
node -v          # 检查版本
```

升级地址：https://nodejs.org/en/download/

### Windows 平台

#### Git Bash 依赖

Windows 平台推荐安装 Git Bash。缺失时 CodeBuddy Code 会启动时打印一次性提示并自动降级到 PowerShell 执行 shell 命令，`/enter-worktree`、`/leave-worktree` 等 Git Bash 特有功能将不可用。

- 下载：https://git-scm.com/downloads/win
- 安装时勾选 "Git Bash" 组件

**自定义路径**（非标准安装位置）：

```bash
# CMD
set CODEBUDDY_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe

# PowerShell
$env:CODEBUDDY_CODE_GIT_BASH_PATH="C:\Program Files\Git\bin\bash.exe"
```

> 若 `CODEBUDDY_CODE_GIT_BASH_PATH` 指向的路径不存在，行为取决于 `CODEBUDDY_SKIP_GIT_BASH_CHECK`：默认（未设为 `1`）视为用户显式配置错误，启动时报错退出；当设为 `1`（例如上游进程已托管 shell，此时该变量可能是第三方程序如 UGit 写入后随其升级失效的），则不中断对话，改为记录一条告警到 `~/.codebuddy/logs` 并自动降级到自动探测的 Git Bash / PowerShell。若要彻底消除告警，请删除该环境变量或将其修正为有效路径。

**抑制启动提示**（例如上游进程已管理 shell）：

```bash
# PowerShell
$env:CODEBUDDY_SKIP_GIT_BASH_CHECK="1"
```

#### "codebuddy 不是内部或外部命令"

npm 全局目录未加入 PATH。

```bash
npm config get prefix    # 查找安装路径
```

将路径添加到系统 PATH（默认：`%USERPROFILE%\AppData\Roaming\npm`），重启终端。

### 搜索工具 (Ripgrep)

CodeBuddy 自动处理 ripgrep 依赖，无需手动安装。如需最佳性能：

```bash
# macOS
brew install ripgrep

# Windows
choco install ripgrep

# Ubuntu/Debian
sudo apt install ripgrep
```

---

## 常见问题

### 额度共享

CLI、CodeBuddy IDE 和 CodeBuddy Plugin 共享同一账号的资源配额。

### JetBrains IDE 中 ESC 键不生效

JetBrains 终端对 ESC 键处理不同，改用 `Ctrl+ESC` 或 `Shift+ESC`。

| 操作 | 标准终端 | JetBrains 终端 |
|-----|---------|---------------|
| 退出/取消 | `ESC` | `Ctrl+ESC` 或 `Shift+ESC` |

### 模型切换

```
/model              # 交互式选择
/model [模型名称]    # 直接切换
/status             # 查看当前模型
```

### --serve 模式网络访问问题

#### 局域网 IP 访问报 `ERR_EMPTY_RESPONSE`

**症状**：使用 `codebuddy --serve` 启动后，通过局域网 IP（如 `http://10.31.110.26:52477`）访问时，浏览器报 `ERR_EMPTY_RESPONSE`（未发送任何数据）。

**原因**：HTTP 服务默认监听 `127.0.0.1`（本地回环地址），只接受本机连接。使用局域网 IP 访问时，请求到达了机器但被服务拒绝。

**解决方案**：启动时添加 `--host 0.0.0.0` 参数，使服务监听所有网络接口：

```bash
codebuddy --serve --host 0.0.0.0 --port 8080
```

> 非回环地址启动时会自动启用密码认证，密码在控制台输出中可见。

#### 确认服务监听状态

可以通过以下命令检查服务是否正确监听：

```bash
# macOS / Linux
lsof -i :PORT_NUMBER

# 或
netstat -an | grep PORT_NUMBER
```

- 若显示 `127.0.0.1:PORT` — 只接受本机连接
- 若显示 `0.0.0.0:PORT` 或 `*:PORT` — 接受所有网络连接

---

## 内存溢出 (OOM) 排查

**症状**：长时间运行的会话（尤其 `/goal` 这类自续跑循环、或超长上下文任务）跑数小时后进程崩溃，终端出现：

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

### 为什么会发生

- Node/V8 默认堆上限约 4GB（64 位）。超长会话里对话历史、工具结果等在内存中累积，堆可能一路涨到上限。
- 自动上下文压缩按 **token 占模型窗口的比例**触发（约 92%）。**大窗口模型（如 1M 上下文）下，token 还远没到阈值，进程真实堆就已经先到 4GB 上限**——压缩来不及救场。
- 硬 OOM（`FatalProcessOutOfMemory`）由 V8 直接终止进程，绕过所有 JS 异常处理，默认**不会留下堆快照**，事后难以定位是谁占了内存。

### 先缓解

- 用 `/clear` 清空上下文，或 `/compact` 主动压缩后再继续。
- 把超大任务拆成多轮 / 多会话，避免单会话无限堆积。
- 临时抬高堆上限（仅治标、推迟 OOM）：

  ```bash
  # 抬到 8GB 再启动(会被子进程继承)
  NODE_OPTIONS=--max-old-space-size=8192 codebuddy
  ```

### 抓堆快照定位根因（默认关闭，按需开启）

CodeBuddy 内置一个"近堆上限自愈快照"：当进程堆越过 V8 堆上限的高水位时，自动写一份 heap snapshot，供事后分析对象保留树。**因为快照文件很大（≈ 当时 heapUsed 的 1.5 倍，GB 级堆会写出数 GB 文件），默认关闭**，仅在复现/排查 OOM 时开启：

```bash
# 开启(默认 85% 水位)
CODEBUDDY_CODE_HEAP_SNAPSHOT_NEAR_LIMIT_PCT=on codebuddy
# 自定义水位:0.9 或 90 都表示 90%
CODEBUDDY_CODE_HEAP_SNAPSHOT_NEAR_LIMIT_PCT=90 codebuddy
# 关闭(默认): 不设 / 0 / off / false
```

- 快照落盘位置：`~/.codebuddy/diagnostics/<YYYY-MM-DD>/oom-nearlimit-<pid>-<时间戳>.heapsnapshot`（按天分层，同日志目录）。
- 进程内**只抓一次**（越过水位后即写一份，避免濒临 OOM 时反复写 GB 级文件二次爆内存）。
- 触发时会打一条告警日志：`[WorkflowMemProbe] near heap limit ...`。

分析：用 Chrome DevTools → **Memory** → **Load** 载入该 `.heapsnapshot`，看 **Retainers / 对象保留树**，定位占用最大的对象及其引用链。

> 说明：未采用 Node 内建的 `--heapsnapshot-near-heap-limit` / `v8.setHeapSnapshotNearHeapLimit`——它只能写到进程当前工作目录、无法指定路径，且在接近 100% 真上限才触发（那时再写 GB 级快照本身可能二次 OOM）。这里用 85% 高水位提前抓、并落到统一的 diagnostics 目录。

### 反馈给开发

请附上：

- 终端里的 `FATAL ERROR: ... heap out of memory` 及其后的 native 栈；
- `~/.codebuddy/logs/<date>/` 里崩溃前的 `[WorkflowMemProbe] tick ... heap=used/total` 心跳（能看出堆增长曲线）；
- 若开启了快照：`~/.codebuddy/diagnostics/<date>/oom-nearlimit-*.heapsnapshot`。

---

## 权限确认框无响应 / ESC 才能关

**症状**：TUI 弹出工具权限确认框，按数字键 / 回车确认后弹框不消失，但 ESC 能正常关闭，且关闭后任务实际已在执行。

### 日志位置

```bash
ls -t ~/.codebuddy/logs/codebuddy-*.log | head -1   # 最新一份
```

可通过 `CODEBUDDY_CONFIG_DIR` 环境变量整体迁移配置目录。

### 关键 TAG（按时序）

正常确认走完应该看到这一串（`grep -E '\[Approve\]|\[Reject\]|\[dequeue\]|\[tool-permission\]'`）：

| TAG | 含义 |
|---|---|
| `[tool-permission] ASK ...` | 工具被拦下来要审批 |
| `[HandleInterruptions] Approval dialog shown` | TUI 已显示弹框 |
| `[Approve] User approved tool: <name>` | 用户点了确认 |
| `[Approve] Deferred resolved` | 后端 promise 已 resolve（任务此时开始执行）|
| `[dequeue] Queue empty, clearing interruptionSubject` | `pending$` 清空，弹框应消失 |
| `[Approve] Success: ... interruption dequeued` | 全流程结束 |

ESC 路径把 `[Approve]` 替换为 `[Reject]`。

### 现象 → 推断

| 看到 | 推断 |
|---|---|
| 整套 TAG 都有但弹框不消失 | UI 渲染卡住（如 IDE closeTab RPC 阻塞 await）|
| 有 `[Approve] User approved` 但缺 `[dequeue]` | `findSessionByItem` 失败，附近会有 `[Approve] Failed: Cannot find session` |
| 有 `dequeue Start` 但没 `Queue empty` | `interruptionQueues` 拿不到队列（多 session 错位）|
| 完全没有 `[tool-permission] ASK` | 该工具未走审批，可能 `BypassPermissions` 或被 allow 规则放行 |
| 有 `[tool-permission] ASK` 但没 `Approval dialog shown` | TUI 没订阅到 `pending$`（teammate 并发 session 错位）|
| `[Approve] Failed: No pending deferred found` | deferred 被重复消费 |

### 反馈给开发的最小信息

`[Approve]` / `[Reject]` / `[dequeue]` 三个 TAG 出现时间附近的连续 30 行日志即可定位是 UI 没刷、后端没出队、还是 IDE RPC 卡住。

---

## 更新

### 自动更新

默认开启，下次启动时自动应用新版本。通过 `/config` 管理开关。

### 手动更新

```bash
codebuddy update                                    # 内置命令（推荐）
npm install -g @tencent-ai/codebuddy-code@latest   # npm 更新
```

### 版本检查

```bash
codebuddy --version                                 # 当前版本
npm view @tencent-ai/codebuddy-code version        # 最新版本
```

### 更新不到最新版

如果 `codebuddy update` 或 `npm install -g @tencent-ai/codebuddy-code@latest` 始终拉取不到最新版本，通常是 npm 镜像源缓存延迟所致。可指定官方源重试：

```bash
npm install -g @tencent-ai/codebuddy-code@latest --registry=https://registry.npmjs.org/
```

确认本地 npm 配置的镜像源：

```bash
npm config get registry
```

若长期使用第三方镜像，可在更新命令中临时指定官方源，无需修改全局配置。

### npm 安装成功但执行的仍是旧版本

**症状**：`npm install -g @tencent-ai/codebuddy-code@latest` 显示安装成功，但 `codebuddy --version` 仍为旧版本。

**原因**：系统中存在多个 `codebuddy` 可执行文件，终端优先找到了旧版本。常见场景：

- 同时通过 npm 和 Homebrew 安装，Homebrew 版本优先级更高
- 使用 nvm 切换了 Node 版本，新版本安装在另一个 Node 版本的 bin 目录下
- 系统中残留了旧的原生二进制版本（`~/.local/bin/codebuddy`）
- PATH 中存在多个路径包含不同版本的 `codebuddy`

**排查步骤**：

```bash
# 1. 确认实际执行的是哪个 codebuddy
which codebuddy
# 或查看所有匹配项
which -a codebuddy

# 2. 确认 npm 全局安装路径
npm prefix -g
# npm 安装的 codebuddy 在 $(npm prefix -g)/bin/ 下

# 3. 对比路径
# 如果 which codebuddy 的路径 ≠ $(npm prefix -g)/bin/codebuddy，
# 说明终端执行的不是 npm 安装的版本
```

**解决方案**：

**情况一：Homebrew 和 npm 同时安装**

Homebrew 的 `/opt/homebrew/bin`（macOS Apple Silicon）或 `/usr/local/bin`（Intel Mac）通常在 PATH 中优先于 npm 全局目录。

```bash
# 方案 A：只保留一种安装方式（推荐）
brew uninstall codebuddy-code          # 卸载 Homebrew 版本，使用 npm 版本
# 或
npm uninstall -g @tencent-ai/codebuddy-code  # 卸载 npm 版本，使用 Homebrew 版本
brew upgrade codebuddy-code

# 方案 B：保留两种安装但指定优先级
# 在 ~/.zshrc 或 ~/.bashrc 中调整 PATH 顺序，将 npm 路径放在前面：
export PATH="$(npm prefix -g)/bin:$PATH"
```

**情况二：nvm 切换 Node 版本导致**

npm 全局包安装在当前 Node 版本的目录下。切换 Node 版本后，之前版本安装的全局包不可用。

```bash
# 查看当前 Node 版本
node -v

# 在当前版本下重新安装
npm install -g @tencent-ai/codebuddy-code@latest

# 或切换回安装时的 Node 版本
nvm use <安装时的版本号>
```

**情况三：残留旧的原生二进制文件**

```bash
# 检查是否存在原生二进制版本
ls -la ~/.local/bin/codebuddy

# 如果存在且不需要，删除它
rm ~/.local/bin/codebuddy
```

**情况四：shell 缓存了旧路径**

部分 shell 会缓存命令路径。安装新版本后需要刷新缓存：

```bash
hash -r                    # bash / zsh 清除命令缓存
# 或直接重启终端
```

**快速验证**：

```bash
# 一条命令完成排查
echo "执行路径: $(which codebuddy)" && \
echo "当前版本: $(codebuddy --version 2>/dev/null || echo '未找到')" && \
echo "npm 安装路径: $(npm prefix -g)/bin/codebuddy" && \
echo "npm 版本: $(cat "$(npm prefix -g)/lib/node_modules/@tencent-ai/codebuddy-code/package.json" 2>/dev/null | grep '"version"' || echo '未通过 npm 安装')" && \
echo "所有 codebuddy: $(which -a codebuddy 2>/dev/null || where codebuddy 2>/dev/null)"
```

如果排查后仍无法解决，请将上述命令的输出提交到 [Issues 页面](https://cnb.cool/codebuddy/codebuddy-code/-/issues)。

---

## 从 Claude Code 迁移

### 迁移内容

| 目录/文件 | 说明 |
|----------|------|
| `agents/` | 自定义 agents 配置 |
| `commands/` | 斜杠命令定义 |
| `skills/` | 专业技能定义 |
| `CLAUDE.md` → `CODEBUDDY.md` | AI 指令和记忆文档 |

### 方案一：符号链接（推荐）

共享配置，修改一处两边生效。

```bash
# macOS/Linux
cd ~/.codebuddy
ln -s ~/.claude/agents agents
ln -s ~/.claude/commands commands
ln -s ~/.claude/skills skills
ln -s ~/.claude/CLAUDE.md CODEBUDDY.md
```

```powershell
# Windows (需管理员权限)
cd $env:USERPROFILE\.codebuddy
New-Item -ItemType SymbolicLink -Path agents -Target $env:USERPROFILE\.claude\agents
New-Item -ItemType SymbolicLink -Path commands -Target $env:USERPROFILE\.claude\commands
New-Item -ItemType SymbolicLink -Path skills -Target $env:USERPROFILE\.claude\skills
New-Item -ItemType SymbolicLink -Path CODEBUDDY.md -Target $env:USERPROFILE\.claude\CLAUDE.md
```

### 方案二：复制文件

独立配置，互不影响。

```bash
# macOS/Linux
cp -r ~/.claude/agents ~/.codebuddy/agents
cp -r ~/.claude/commands ~/.codebuddy/commands
cp -r ~/.claude/skills ~/.codebuddy/skills
cp ~/.claude/CLAUDE.md ~/.codebuddy/CODEBUDDY.md
```

```powershell
# Windows
Copy-Item -Recurse $env:USERPROFILE\.claude\agents $env:USERPROFILE\.codebuddy\agents
Copy-Item -Recurse $env:USERPROFILE\.claude\commands $env:USERPROFILE\.codebuddy\commands
Copy-Item -Recurse $env:USERPROFILE\.claude\skills $env:USERPROFILE\.codebuddy\skills
Copy-Item $env:USERPROFILE\.claude\CLAUDE.md $env:USERPROFILE\.codebuddy\CODEBUDDY.md
```

### 插件 Skills 一键安装

Claude Code 插件中的 Skills 支持一键安装，安装后自动加载。

### 验证迁移

```bash
codebuddy         # 启动
/skills           # 检查 Skills
/config           # 查看配置
```

---

## 成本优化

### 核心原则

- 新任务用 `/clear` 开启新会话
- 长对话用 `/compact` 压缩历史
- 用 `@filename` 引用文件，避免粘贴代码

### 会话管理命令

| 命令 | 功能 |
|-----|------|
| `/cost` | 查看 Token 消耗 |
| `/clear` | 开启新会话 |
| `/compact` | 压缩历史 |
| `/resume` | 恢复旧对话 |

### 成本对比

| 方式 | 输入 Token | 相对成本 |
|-----|-----------|---------|
| 单会话连续 10 个任务 | ~50,000 | 高 |
| 每个任务新会话 | ~15,000 | 低 |
| 定期 `/compact` | ~25,000 | 中 |

### 推荐做法

- ✓ 新任务开新会话
- ✓ 每 20-30 轮用 `/compact`
- ✓ 用 `@filename` 引用文件
- ✓ 精简提问

### 避免做法

- ✗ 同一会话处理多个无关任务
- ✗ 对话超过 30 轮不清理
- ✗ 重复粘贴已知代码

---

**更多帮助**：[快速入门指南](./quickstart.md)
