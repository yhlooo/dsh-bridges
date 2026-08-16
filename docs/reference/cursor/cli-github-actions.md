> 来源: https://cursor.com/docs/cli/github-actions.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# GitHub Actions

Use Cursor CLI in GitHub Actions and other CI/CD systems to automate development tasks.

## GitHub Actions integration

Basic setup:

```yaml
- name: Install Cursor CLI
  run: |
    curl https://cursor.com/install -fsS | bash
    echo "$HOME/.cursor/bin" >> $GITHUB_PATH

- name: Run Cursor Agent
  env:
    CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
  run: |
    agent -p "Your prompt here" --model gpt-5
```

For Windows runners, use PowerShell: `irm 'https://cursor.com/install?win32=true' | iex`

## Cookbook examples

See our cookbook examples for practical workflows: [updating documentation](https://cursor.com/docs/cli/headless.md) and [fixing CI issues](https://cursor.com/docs/cli/headless.md).

## Other CI systems

Use Cursor CLI in any CI/CD system with:

- **Shell script execution** (bash, zsh, etc.)
- **Environment variables** for API key configuration
- **Internet connectivity** to reach Cursor's API

## Autonomy levels

Choose your agent's autonomy level:

### Full autonomy approach

Give the agent complete control over git operations, API calls, and external interactions. Simpler setup, requires more trust.

**Example:** In our [Update Documentation](https://cursor.com/docs/cli/headless.md) cookbook, the first workflow lets the agent:

- Analyze PR changes
- Create and manage git branches
- Commit and push changes
- Post comments on pull requests
- Handle all error scenarios

```yaml
- name: Update docs (full autonomy)
  run: |
    agent -p "You have full access to git, GitHub CLI, and PR operations. 
    Handle the entire docs update workflow including commits, pushes, and PR comments."
```

### Restricted autonomy approach

We recommend using this approach with **permission-based restrictions** for
production CI workflows. This gives you the best of both worlds: the agent can
intelligently handle complex analysis and file modifications while critical
operations remain deterministic and auditable.

Limit agent operations while handling critical steps in separate workflow steps. Better control and predictability.

**Example:** The second workflow in the same cookbook restricts the agent to only file modifications:

```yaml
- name: Generate docs updates (restricted)
  run: |
    agent -p "IMPORTANT: Do NOT create branches, commit, push, or post PR comments. 
    Only modify files in the working directory. A later workflow step handles publishing."

- name: Publish docs branch (deterministic)
  run: |
    # Deterministic git operations handled by CI
    git checkout -B "docs/${{ github.head_ref }}"
    git add -A
    git commit -m "docs: update for PR"
    git push origin "docs/${{ github.head_ref }}"

- name: Post PR comment (deterministic)
  run: |
    # Deterministic PR commenting handled by CI
    gh pr comment ${{ github.event.pull_request.number }} --body "Docs updated"
```

### Permission-based restrictions

Use [permission configurations](https://cursor.com/docs/cli/reference/permissions.md) to enforce restrictions at the CLI level:

```json
{
  "permissions": {
    "allow": [
      "Read(**/*.md)",
      "Write(docs/**/*)",
      "Shell(grep)",
      "Shell(find)"
    ],
    "deny": ["Shell(git)", "Shell(gh)", "Write(.env*)", "Write(package.json)"]
  }
}
```

## Authentication

### Generate your API key

First, [generate an API key](https://cursor.com/docs/cli/reference/authentication.md#api-key-authentication) from your Cursor dashboard.

### Configure repository secrets

Store your Cursor API key securely in your repository using the GitHub CLI:

```bash
# Repository secret
gh secret set CURSOR_API_KEY --repo OWNER/REPO --body "$CURSOR_API_KEY"

# Organization secret (all repos)
gh secret set CURSOR_API_KEY --org ORG --visibility all --body "$CURSOR_API_KEY"
```

Alternatively, use the GitHub UI: Go to your repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### Use in workflows

Set your `CURSOR_API_KEY` environment variable:

```yaml
env:
  CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
```


---

## Sitemap

[Overview of all docs pages](/llms.txt)
