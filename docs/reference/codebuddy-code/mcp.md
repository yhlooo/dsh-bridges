> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/mcp.md
> 抓取日期: 2026-08-16 (UTC)；内容为官方文档原文下载

# MCP (Model Context Protocol) 使用文档

## 概述

MCP (Model Context Protocol) 是一个开放标准，允许 CodeBuddy 与外部工具和数据源进行集成。通过 MCP，您可以扩展 CodeBuddy 的功能，连接到各种外部服务、数据库、API 等。

## 核心概念

### MCP 服务器

MCP 服务器是提供工具、资源和提示的独立进程，CodeBuddy 通过不同的传输协议与这些服务器通信。

### MCP Prompts 集成

MCP 服务器可以提供 Prompts（提示模板）,这些 Prompts 会自动转换为 CodeBuddy 的斜杠命令。当 MCP 服务器连接后：

- 服务器提供的 Prompts 会自动注册为斜杠命令
- 命令名称格式为： `/服务器名:prompt名称`
- 支持动态参数，通过交互式界面收集用户输入
- 命令执行时会调用 MCP 服务器的 `prompts/get` 接口获取完整内容
- 支持实时监听配置变更，自动更新可用命令列表

### 传输类型

- **STDIO**：通过标准输入输出与本地进程通信
- **SSE**：通过 Server-Sent Events 与远程服务通信
- **HTTP**：通过 HTTP 流式传输与远程服务通信

### 配置作用域

- **user**：全局用户配置，应用于所有项目
- **project**：项目级配置，应用于特定项目
- **local**：本地配置，仅应用于当前会话或工作区

对于同名服务（即在多个作用域有同名配置），生效的优先级为：`local > project > user`

### 安全审批机制

项目作用域的 MCP 服务器在首次连接时需要用户审批，以确保安全性。系统会显示服务器详细信息，用户可以选择批准或拒绝连接。

#### 非交互模式（-p/--print）下的审批

在非交互模式（如使用 `-p/--print` 参数)下,由于无法通过 UI 进行审批,需要通过 `--settings` 参数预先配置允许的 MCP 服务器：

```bash
# 方式 1：允许所有项目 MCP 服务器
codebuddy --settings '{"enableAllProjectMcpServers": true}' -p "your prompt"

# 方式 2：允许特定的 MCP 服务器
codebuddy --settings '{"enabledMcpjsonServers": ["server-name-1", "server-name-2"]}' -p "your prompt"
```

### 工具权限管理

MCP 工具支持完整的权限管理系统，可以精确控制哪些工具可以被使用：

#### 权限规则类型

权限系统支持三种规则类型（按优先级排序）：

1. **拒绝规则 （deny)** - 阻止使用指定工具（最高优先级）
2. **询问规则 （ask)** - 使用工具前需要用户确认（覆盖允许规则）
3. **允许规则 （allow)** - 允许工具使用而无需手动批准

#### MCP 权限规则格式

MCP 工具名的格式是 `mcp__<服务器名>__<工具名>`，用双下划线 `__` 分段（名字里的单下划线只是普通字符）。规则有三种写法：

##### 服务器级权限
```
mcp__服务器名
```
匹配以 `mcp__服务器名__` 为前缀的全部工具，也就是这个服务器的所有工具。等价写法：`mcp__服务器名__*`。

##### 工具级权限
```
mcp__服务器名__工具名
```
只匹配这一个工具。

##### 所有 MCP 工具
```
mcp__*
```
匹配全部 MCP 工具，只在 `deny` 和 `ask` 里有效；放进 `allow` 等于没写，批量放开请按服务器逐个列出。

注意：

- 规则不区分大小写；连字符、点号等符号按下划线处理，`mcp__web-search` 与 `mcp__web_search` 等价
- `*` 只能整段替换最后一节。`mcp__git*`、`mcp__github__get_*` 匹配不到任何工具，而且不会报错
- MCP 工具只认 `mcp__` 开头的规则，裸 `*` 对它无效；要全部禁用请写 `"deny": ["mcp__*"]`

#### 配置示例

##### 批准服务器的所有工具
放行所有以 `mcp__github__` 为前缀的工具。

```json
{
  "permissions": {
    "allow": [
      "mcp__github"
    ]
  }
}
```

##### 仅批准特定工具
```json
{
  "permissions": {
    "allow": [
      "mcp__github__get_issue",
      "mcp__github__list_issues"
    ]
  }
}
```

##### 拒绝特定工具
```json
{
  "permissions": {
    "deny": [
      "mcp__dangerous_server__delete_file"
    ]
  }
}
```

##### 拒绝某个服务器的所有工具
拒绝所有以 `mcp__filesystem__` 为前缀的工具。

```json
{
  "permissions": {
    "deny": [
      "mcp__filesystem"
    ]
  }
}
```

##### 拒绝所有 MCP 工具
```json
{
  "permissions": {
    "deny": [
      "mcp__*"
    ]
  }
}
```

## 配置文件

### 配置文件位置

配置文件使用优先级机制，系统会按优先级顺序查找第一个存在的文件进行读取。写入时，如果文件已存在，会写入第一个存在的文件；如果都不存在，会创建最高优先级的文件。

#### USER 作用域

优先级顺序（从高到低）：
1. `~/.codebuddy/.mcp.json`（推荐）
2. `~/.codebuddy/mcp.json`（已废弃）
3. `~/.codebuddy.json`（旧版配置文件）

**读取规则**：系统会按上述顺序查找第一个存在的文件并读取其内容。

**写入规则**：
- 如果上述文件中存在任意一个，写入第一个存在的文件
- 如果都不存在，创建 `~/.codebuddy/.mcp.json`（最高优先级）

#### PROJECT 作用域

优先级顺序（从高到低）：
1. `<项目根目录>/.mcp.json`（推荐）
2. `<项目根目录>/mcp.json`（已废弃）

**读取规则**：系统会按上述顺序查找第一个存在的文件并读取其内容。

**写入规则**：
- 如果上述文件中存在任意一个，写入第一个存在的文件
- 如果都不存在，创建 `<项目根目录>/.mcp.json`（最高优先级）

#### LOCAL 作用域

local 作用域的配置实际上保存在 user 作用域的配置文件中，通过 `projects` 字段来区分不同项目的 local 配置。

文件路径：`~/.codebuddy.json#/projects/<workspace_path>`

`#/projects/<workspace_path>` 使用的是 JSON Pointer 语法，用于指向 JSON 文档中的特定位置。关于 JSON Pointer 的详细说明，请参考：https://datatracker.ietf.org/doc/html/rfc6901

**注意**：
- 系统不会合并同一个作用域的多个配置文件内容，只会使用第一个存在的文件

示例见下方配置文件格式说明。

### 配置文件格式

MCP 配置文件支持 **JSONC (JSON with Comments)** 格式，允许在配置中添加注释，提升可读性和可维护性。

#### JSONC 支持的特性

- **单行注释**：使用 `//` 添加行内或行尾注释
- **多行注释**：使用 `/* */` 添加块注释
- **尾随逗号**：数组和对象的最后一个元素后可以添加逗号

#### 基础配置格式

```jsonc
{
  // MCP 服务器配置
  "mcpServers": {
    "server-name": {
      "type": "stdio|sse|http",
      "command": "命令路径",
      "args": ["参数1", "参数2"],
      "env": {
        "ENV_VAR": "value"
      },
      "url": "http://example.com/mcp",
      "headers": {
        "Authorization": "Bearer token"
      },
      "description": "服务器描述"
    }
  },
  // projects 字段仅在 user 作用域的文件里有效，用于识别 local 作用域的配置
  "projects": {
    "/path/to/project": {
      "mcpServers": {
        "local-server": {
          "type": "stdio",
          "command": "./local-tool"
        }
      }
    }
  }
}
```

#### 带注释的完整示例

```jsonc
{
  // MCP Server Configuration for CodeBuddy
  // 这个文件配置了项目使用的 MCP 服务器
  
  "mcpServers": {
    /*
     * Filesystem Server
     * 提供文件系统访问能力
     * 文档: https://github.com/modelcontextprotocol/servers
     */
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/workspace",  // 工作目录路径
      ],
      "env": {
        "DEBUG": "true",  // 启用调试模式
      },
    },
    
    // HTTP API 服务器示例
    "api-server": {
      "type": "http",
      "url": "http://localhost:3000/mcp",  // 本地开发服务器
      "headers": {
        "Authorization": "Bearer your-token",
      },
    },
  },
  
  // 已禁用的服务器列表（供参考）
  "disabledMcpServers": [
    "deprecated-server",
  ],
}
```

**注意**：
- 标准 JSON 格式文件仍然完全兼容
- 解析错误时会提供清晰的错误提示
```

**注意**：`type` 字段是可选的。如果未指定，系统会根据配置内容自动推断：
- 包含 `command` 字段时,推断为 `stdio` 类型
- 包含 `url` 字段时,推断为 `http` 类型

建议显式指定 `type` 字段以确保配置的准确性。

### 环境变量扩展

MCP 配置支持环境变量扩展，允许您在配置中引用系统环境变量。这对于在团队间共享配置、管理敏感信息（如 API 密钥、令牌）以及支持环境特定配置（开发、测试、生产）非常有用。

#### 支持的语法

- **`${VAR_NAME}`** - 展开为环境变量 VAR_NAME 的值
- **`${VAR_NAME:-default_value}`** - 如果 VAR_NAME 未设置，使用默认值

#### 变量命名规则

- 变量名必须以大写字母或下划线 `[A-Z_]` 开头
- 后续字符只能是大写字母、数字或下划线 `[A-Z0-9_]*`
- 小写字母、混合大小写以及以数字开头的变量不会被展开

#### 支持的配置字段

环境变量可以在以下配置字段中展开：

**STDIO 类型配置**：
- `command` - 可执行文件路径或命令
- `args` - 命令行参数列表中的每个参数
- `env` - 环境变量值（键不会被展开）

**SSE/HTTP/Remote 类型配置**：
- `url` - 服务端点 URL
- `headers` - HTTP 请求头值（键不会被展开）

#### 错误处理

**环境变量未设置的行为**：
- 如果环境变量未设置且**有默认值**，使用默认值
- 如果环境变量未设置且**无默认值**，保留原始占位符（`${VAR}`），并在诊断中报告 WARNING 消息

这意味着配置不会因缺失的环境变量而失败，而是保留占位符并发出警告。

#### 示例配置

**示例 1：STDIO 类型服务器，使用环境变量**
```json
{
  "mcpServers": {
    "python-tools": {
      "type": "stdio",
      "command": "${PYTHON_PATH:-python}",
      "args": [
        "-m",
        "my_mcp_server",
        "--config",
        "${CONFIG_DIR:-/etc/config}"
      ],
      "env": {
        "PYTHONPATH": "${PYTHON_LIB_PATH}",
        "DEBUG": "${DEBUG_MODE:-false}",
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

**示例 2：HTTP 类型服务器，使用环境变量和默认值**
```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-API-Version": "${API_VERSION:-v1}",
        "User-Agent": "CodeBuddy/${CODEBUDDY_VERSION:-1.0}"
      }
    }
  }
}
```

#### 常见用例

1. **团队共享配置**
   ```bash
   # 在 .mcp.json 中使用环境变量
   # 每个团队成员在本地设置环境变量
   export API_TOKEN="their-personal-token"
   export LOCAL_TOOL_PATH="/home/user/tools"
   ```

2. **环境特定配置**
   ```bash
   # 开发环境
   export API_BASE_URL="http://localhost:3000"
   
   # 生产环境
   export API_BASE_URL="https://api.production.com"
   ```

3. **管理敏感信息**
   ```json
   {
     "headers": {
       "Authorization": "Bearer ${MY_API_KEY}"
     }
   }
   ```
   将 API 密钥存储在环境变量中，不要直接写在配置文件中。

#### 诊断和调试

当配置中的环境变量展开时，您可以通过以下方式了解展开结果：

1. 如果某个环境变量未设置且无默认值，系统会发出 WARNING 诊断
2. 可以通过 `/mcp` 命令查看 MCP 服务器配置和诊断信息
3. 诊断消息会列出所有缺失的环境变量

**示例诊断消息**：
```
Missing environment variables: API_TOKEN, DATABASE_URL
```

### 配置结构详解

根据不同的传输类型，MCP 服务器配置具有不同的结构：

#### STDIO 类型配置

通过标准输入输出与本地进程通信。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定值 `"stdio"` |
| `command` | string | 是 | 可执行文件路径或命令 |
| `args` | Array&lt;string&gt; | 否 | 命令行参数列表 |
| `env` | Object | 否 | 环境变量键值对 |
| `defer_loading` | boolean | 否 | 是否延迟加载工具（默认 false）|
| `tools` | Object | 否 | 工具级别配置，可覆盖服务器级别设置 |

**示例**：
```json
{
  "type": "stdio",
  "command": "python",
  "args": ["-m", "my_mcp_server"],
  "env": {
    "PYTHONPATH": "/path/to/tools",
    "DEBUG": "true"
  }
}
```

#### SSE 类型配置

通过 Server-Sent Events 与远程服务通信。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定值 `"sse"` |
| `url` | string | 是 | SSE 服务端点 URL |
| `headers` | Object | 否 | HTTP 请求头键值对 |
| `defer_loading` | boolean | 否 | 是否延迟加载工具（默认 false）|
| `tools` | Object | 否 | 工具级别配置，可覆盖服务器级别设置 |

**示例**：
```json
{
  "type": "sse",
  "url": "https://api.example.com/mcp/sse",
  "headers": {
    "Authorization": "Bearer your-api-token",
    "X-API-Version": "v1"
  }
}
```

#### HTTP 类型配置

通过 HTTP 流式传输与远程服务通信。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定值 `"http"` |
| `url` | string | 是 | HTTP 服务端点 URL |
| `headers` | Object | 否 | HTTP 请求头键值对 |
| `defer_loading` | boolean | 否 | 是否延迟加载工具（默认 false）|
| `tools` | Object | 否 | 工具级别配置，可覆盖服务器级别设置 |

**示例**：
```json
{
  "type": "http",
  "url": "https://mcp.example.com/api/v1",
  "headers": {
    "Authorization": "Bearer secret-token",
    "Content-Type": "application/json"
  }
}
```

### 延迟加载 (defer_loading)

当 MCP 服务器提供大量工具时，可以使用 `defer_loading` 配置来延迟加载工具，减少上下文消耗并提高模型工具选择的准确性。

#### 工作原理

- 设置 `defer_loading: true` 的工具不会在初始请求时加载到模型上下文
- 模型可以通过 `ToolSearch` 工具搜索这些延迟加载的工具
- 搜索到的工具会被激活，并在后续请求中可用
- 激活状态在当前会话中保持

#### 服务器级别配置

将服务器的所有工具设为延迟加载：

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "my-mcp-server",
      "defer_loading": true
    }
  }
}
```

#### 工具级别配置

可以为单个工具覆盖服务器级别的设置：

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "my-mcp-server",
      "defer_loading": true,
      "tools": {
        "frequently_used_tool": {
          "defer_loading": false
        }
      }
    }
  }
}
```

#### 继承规则

| 服务器 defer_loading | 工具 defer_loading | 最终结果 |
|---------------------|-------------------|---------|
| true | 未设置 | true（继承） |
| true | false | false（覆盖） |
| false/未设置 | 未设置 | false |
| false/未设置 | true | true（覆盖） |

#### 会话级 / 代理级覆盖

除了 MCP 配置里的静态 `defer_loading`，还可以在 `--tools` 参数或自定义代理 frontmatter 中使用 `Defer(...)` / `NoDefer(...)` 修饰符，**临时改变**某个工具或某组工具的延迟加载状态：

```bash
# 临时把 GitHub 整组 MCP 工具收进延迟加载
codebuddy --tools "default,Defer(mcp__github__*)"

# 即便默认让某 MCP 工具延迟加载，本次也强制让它直接可用
codebuddy --tools "default,NoDefer(mcp__time__current_time)"
```

修饰符的优先级**高于**MCP 静态 `defer_loading` 配置；`NoDefer` 永远胜过 `Defer`。详见 [工具延迟加载覆盖](tool-defer-overlay.md)。

#### 使用场景

- **工具数量多**：当 MCP 服务器提供超过 30 个工具时
- **减少成本**：减少每次请求的 token 消耗
- **提高准确性**：让模型在更少的工具中做出更准确的选择

## 命令行使用

### 添加 MCP 服务器

#### STDIO 服务器

```bash
# 添加本地可执行文件
codebuddy mcp add --scope user my-tool -- /path/to/tool arg1 arg2

# 添加 Python 脚本
codebuddy mcp add --scope project python-tool -- python /path/to/script.py
```

#### SSE 服务器

```bash
# 添加 SSE 服务器
codebuddy mcp add --scope user --transport sse sse-server https://example.com/mcp/sse
```

#### HTTP 服务器

```bash
# 添加 HTTP 流式服务器
codebuddy mcp add --scope project --transport http http-server https://example.com/mcp/http
```

### 使用 JSON 配置添加服务器

```bash
# 添加 STDIO 类型服务器
codebuddy mcp add-json --scope user my-server '{"type":"stdio","command":"/usr/local/bin/tool","args":["--verbose"]}'

# 添加 HTTP 类型服务器
codebuddy mcp add-json --scope user http-server '{"type":"http","url":"https://example.com/mcp","headers":{"Authorization":"Bearer token"}}'

# 添加 SSE 类型服务器
codebuddy mcp add-json --scope project sse-server '{"type":"sse","url":"https://api.example.com/mcp/sse","headers":{"X-API-Key":"your-api-key"}}'

# 添加带环境变量的 STDIO 服务器
codebuddy mcp add-json --scope user python-tool '{"type":"stdio","command":"python","args":["-m","my_mcp_server"],"env":{"PYTHONPATH":"/path/to/tools"}}'
```

### 管理 MCP 服务器

#### 列出所有服务器

```bash
# 列出所有作用域的服务器
codebuddy mcp list
```

#### 查看服务器详情

```bash
# 查看特定服务器信息
codebuddy mcp get my-server
```

#### 移除服务器

```bash
# 移除特定服务器
codebuddy mcp remove my-server

# 移除特定作用域的服务器
codebuddy mcp remove my-server --scope user
```

## 最佳实践

### 1. 作用域选择

- 使用 **user** 作用域存储个人工具和全局服务
- 使用 **project** 作用域存储项目特定的工具
- 使用 **local** 作用域存储临时或实验性工具

### 2. 安全考虑

- 避免在配置文件中存储敏感信息
- **使用环境变量传递认证信息**：利用 MCP 的环境变量扩展功能（`${API_TOKEN}` 或 `${API_TOKEN:-default}`）来管理 API 密钥、令牌等敏感数据
- 定期审查和更新服务器配置
- 项目作用域的 MCP 服务器需要用户审批后才能连接，确保安全性
- OAuth 授权 URL 会在打开前进行安全验证，仅支持 http/https 协议
- 将包含环境变量引用的配置文件提交到版本控制系统，但在 `.gitignore` 中排除实际的环境变量文件

### 3. 性能优化

- 合理配置服务器超时时间
- 避免同时运行过多的 STDIO 服务器
- 使用缓存机制减少重复连接

### 4. 错误处理

- 监控服务器连接状态
- 实现重连机制
- 记录和分析错误日志

## 故障排除

### 常见问题

#### 服务器连接失败

1. 检查命令路径是否正确
2. 验证参数和环境变量
3. 确认网络连接（对于远程服务器）
4. 查看服务器日志输出

#### 工具不可用

1. 确认服务器已成功连接
2. 检查工具权限设置
3. 验证工具兼容性

#### 配置不生效

1. 检查配置文件语法
2. 确认作用域优先级
3. 重启 CodeBuddy 应用

## 示例配置

### Python 工具服务器

```json
{
  "mcpServers": {
    "python-tools": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "env": {
        "PYTHONPATH": "/path/to/tools"
      },
      "description": "Python 工具集合"
    }
  }
}
```

### 远程 API 服务器

```json
{
  "mcpServers": {
    "api-server": {
      "type": "sse",
      "url": "https://api.example.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer your-token",
        "X-API-Version": "v1"
      },
      "description": "远程 API 服务"
    }
  }
}
```

### Node.js 本地服务器

```json
{
  "mcpServers": {
    "node-server": {
      "type": "stdio", 
      "command": "node",
      "args": ["./mcp-server.js"],
      "env": {
        "NODE_ENV": "production"
      },
      "description": "Node.js MCP 服务器"
    }
  }
}
```

## 扩展开发

### 创建自定义 MCP 服务器

1. **选择实现语言**: Python、Node.js、Go 等
2. **实现 MCP 协议**：使用官方 SDK 或自行实现
3. **定义工具接口**：描述工具功能和参数
4. **处理请求**：接收和处理来自 CodeBuddy 的请求
5. **返回结果**：按 MCP 格式返回执行结果

### SDK 和库

- **Python**: `FastMCP`
- **TypeScript/JavaScript**: `@modelcontextprotocol/sdk`
- **其他语言**：参考官方文档实现

## 配置示例

### TAPD

```bash
codebuddy mcp add --scope user --transport http --header "X-Tapd-Access-Token: TAPD_ACCESS_TOKEN" -- tapd_mcp_http https://mcp-oa.tapd.woa.com/mcp
```

### Chrome Devtools

```bash
codebuddy mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

### iWiki

```bash
codebuddy mcp add --scope user iwiki -- npx -y mcp-remote@latest https://prod.mcp.it.woa.com/app_iwiki_mcp/mcp3
```

## 超大响应处理

当 MCP 工具返回的内容超过 `MAX_MCP_OUTPUT_TOKENS`（默认 20000 tokens，约 80KB 字符数）时，CodeBuddy 会自动处理以避免占用过多上下文：

- **默认行为（落盘）**：把完整响应保存到当前会话的 `~/.codebuddy/projects/<project-hash>/<session-id>/tool-results/mcp-<server>-<tool>-<timestamp>-<rand>.txt`，返回给模型一段读取指引（包含文件路径、格式说明、分段读取要求）。模型可以通过 Read 工具按 `offset` / `limit` 参数分段读取完整内容，或用 `jq` 对 JSON 结构做结构化查询。
- **截断降级**：以下场景会直接截断内容到 `MAX_MCP_OUTPUT_TOKENS * 4` 字符上限，而不落盘：
  - 响应包含图片块（避免 base64 payload 写入 `.txt` 文件丢失图片渲染）
  - 当前无会话上下文（避免产生孤儿文件）
  - 落盘失败（目录不可写、磁盘满等）
  - 设置了环境变量 `CODEBUDDY_DISABLE_MCP_LARGE_OUTPUT_FILES=1`

截断时会在内容尾部追加 `[OUTPUT TRUNCATED - exceeded N token limit]` 标记，并告知模型哪些类型的块被丢弃（例如 `[Dropped 2 audio blocks due to size limit]`），方便模型改用分页或过滤参数重试。

## 相关链接

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP GitHub 仓库](https://github.com/modelcontextprotocol)
- [CodeBuddy 官方文档](https://cnb.cool/codebuddy/codebuddy-code/-/blob/main/docs)
