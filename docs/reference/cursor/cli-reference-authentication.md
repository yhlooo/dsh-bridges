> 来源: https://cursor.com/docs/cli/reference/authentication.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Authentication

Cursor CLI supports two authentication methods: browser-based login (recommended) and API keys.

## Browser authentication (recommended)

Use the browser flow for the easiest authentication experience:

```bash
# Log in using browser flow
agent login

# Check authentication status
agent status

# Log out and clear stored authentication
agent logout
```

The login command opens your default browser and prompts you to authenticate with your Cursor account. Set `NO_OPEN_BROWSER=1` to print the login URL without opening a browser. Once complete, your credentials are securely stored locally.

## API key authentication

For automation, scripts, or CI environments, use API key authentication:

### Step 1: Generate an API key

Generate a user API key from [Cursor Dashboard → API Keys](https://cursor.com/dashboard/api).

### Step 2: Set the API key

You can provide the API key in two ways:

**Option 1: Environment variable (recommended)**

```bash
export CURSOR_API_KEY=your_api_key_here
agent "implement user authentication"
```

**Option 2: Command line flag**

```bash
agent --api-key your_api_key_here "implement user authentication"
```

## Authentication status

Check your current authentication status:

```bash
agent status
```

This command will display:

- Whether you're authenticated
- Your account information
- Current endpoint configuration

## Troubleshooting

- **"Not authenticated" errors:** Run `agent login` or ensure your API key is correctly set
- **Browser doesn't open:** Run `NO_OPEN_BROWSER=1 agent login` and open the printed URL manually


---

## Sitemap

[Overview of all docs pages](/llms.txt)
