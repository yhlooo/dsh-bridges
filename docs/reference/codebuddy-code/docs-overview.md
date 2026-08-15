> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/README.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# CodeBuddy Code 开发者文档

**腾讯云智能编程助手 - 让代码开发更智能、更高效**

CodeBuddy Code 是基于腾讯云 AI 技术的智能编程工具，深度集成腾讯云生态，提供从代码编写到项目部署的全链路 AI 辅助。

## 为什么选择 CodeBuddy Code

### 🚀 用自然语言驱动整个开发运维生命周期
CodeBuddy Code 让您能够用自然语言描述需求，自动化完成从代码编写、测试、调试到部署的全链路开发任务，实现极致的自动化效率提升。无论是简单的代码修改还是复杂的架构重构，都能通过对话式交互轻松完成。

### 🔧 终端原生，无缝集成
- **熟悉的环境**：直接在您熟悉的命令行环境中获得 AI 辅助，无需切换开发工具或学习新界面
- **原生体验**：完美融入现有的开发工作流，支持所有主流操作系统和终端
- **零学习成本**：保持原有的开发习惯，AI 助手静默工作在后台

### ⚡ 开箱即用的强大能力
- **内置工具链**：集成文件编辑、命令运行、Git 操作、测试执行等核心开发工具
- **智能提交**：自动生成规范的提交信息，支持代码审查和变更管理
- **灵活扩展**：通过 MCP （模型上下文协议） 轻松集成第三方工具和服务
- **自定义开发工具**：根据项目需求定制专属的开发助手

### 🛠️ Unix 哲学的 AI 集成
- **管道友好**：像 `grep` 和 `awk` 一样，原生支持管道输入进行智能分析
- **脚本集成**：完美融入 shell 脚本和自动化工具链
- **组合能力**：与现有 Unix 工具无缝组合，构建强大的 AI 驱动工作流
- **标准输入输出**：遵循 Unix 标准，支持重定向和管道操作

```bash
# 管道集成示例
git log --oneline | codebuddy "分析这些提交，找出可能的问题"
cat error.log | codebuddy "帮我分析这些错误日志"
```

## 快速体验

### 环境要求
- Node.js 18.20+

### 一键安装
```bash
npm install -g @tencent-ai/codebuddy-code
```

### 开始使用
```bash
# 进入项目目录
cd my-project

# 启动 CodeBuddy
codebuddy
cbc

# 或直接提问
codebuddy "帮我优化这个函数的性能"
cbc "帮我优化这个函数的性能"
```

## 下一步操作

### 📚 深入了解
- [快速入门指南](quickstart.md) - 详细的设置和使用指南
- [常见工作流](common-workflows.md) - 扩展思考、图片粘贴、--resume 等功能
- [IDE 集成](ide-integrations.md) - 在你喜欢的编辑器中使用

### 🔧 配置和扩展
- [MCP 集成](mcp.md) - 模型上下文协议集成
- [环境变量参考](env-vars.md) - 完整的环境变量配置指南
- [模型配置](models.md) - 主模型、场景变体和模型解析规则
- [子代理](sub-agents.md) - 内置和自定义子代理，以及按子代理配置模型
- [斜杠命令](slash-commands.md) - 内置命令参考
- [插件系统](plugins.md) - 扩展 CodeBuddy 功能，管理插件市场
- [插件参考文档](plugins-reference.md) - 插件开发完整技术规范
- [Skills 技能系统](skills.md) - 扩展 AI 专业能力
- [设置配置](settings.md) - 配置文件、工具设置

### 🚀 高级用法
- [GitLab CI/CD 集成](gitlab-ci-cd.md) - 在 GitLab CI/CD 流水线中使用 CodeBuddy
- [SDK 开发](sdk.md) - 扩展和自定义
- [企业部署](devcontainer.md) - 容器化部署

### 🆘 获取帮助
- [故障排除](troubleshooting.md) - 常见问题解决
- [CLI 参考](cli-reference.md) - 完整命令行参考
- [交互模式](interactive-mode.md) - 键盘快捷键和技巧


## 反馈和支持

- 🐛 [提交问题](https://cnb.cool/codebuddy/codebuddy-code/-/issues)
- 📧 技术支持：codebuddy@tencent.com
- 🌐 [国内官方网站](https://copilot.tencent.com/cli)
- 🌐 [海外官方网站](https://www.codebuddy.ai/cli)

---

*CodeBuddy Code - 让 AI 成为你的编程伙伴*
