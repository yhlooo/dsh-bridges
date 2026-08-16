> 来源: https://cursor.com/docs/cli/headless.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Using Headless CLI

Use Cursor CLI in scripts and automation workflows for code analysis, generation, and refactoring tasks.

## How it works

Use [print mode](https://cursor.com/docs/cli/using.md#non-interactive-mode) (`-p, --print`) for non-interactive scripting and automation.

### File modification in scripts

Combine `--print` with `--force` (or `--yolo`) to modify files in scripts:

```bash
# Enable file modifications in print mode
agent -p --force "Refactor this code to use modern ES6+ syntax"

# Without --force, changes are only proposed, not applied
agent -p "Add JSDoc comments to this file"  # Won't modify files

# Batch processing with actual file changes
find src/ -name "*.js" | while read file; do
  agent -p --force "Add comprehensive JSDoc comments to $file"
done
```

The `--force` flag allows the agent to make direct file changes without
confirmation

## Setup

See [Installation](https://cursor.com/docs/cli/installation.md) and [Authentication](https://cursor.com/docs/cli/reference/authentication.md) for complete setup details.

```bash
# Install Cursor CLI (macOS, Linux, WSL)
curl https://cursor.com/install -fsS | bash

# Install Cursor CLI (Windows PowerShell)
irm 'https://cursor.com/install?win32=true' | iex

# Set API key for scripts
export CURSOR_API_KEY=your_api_key_here
agent -p "Analyze this code"
```

## Example scripts

Use different output formats for different script needs. See [Output format](https://cursor.com/docs/cli/reference/output-format.md) for details.

### Searching the codebase

By default, `--print` uses `text` format for clean, final-answer-only responses:

```bash
#!/bin/bash
# Simple codebase question - uses text format by default

agent -p "What does this codebase do?"
```

### Automated code review

Use `--output-format json` for structured analysis:

```bash
#!/bin/bash
# simple-code-review.sh - Basic code review script

echo "Starting code review..."

# Review recent changes
agent -p --force --output-format text \
  "Review the recent code changes and provide feedback on:
  - Code quality and readability
  - Potential bugs or issues
  - Security considerations
  - Best practices compliance

  Provide specific suggestions for improvement and write to review.txt"

if [ $? -eq 0 ]; then
  echo "✅ Code review completed successfully"
else
  echo "❌ Code review failed"
  exit 1
fi
```

### Real-time progress tracking

Use `--output-format stream-json` for message-level progress tracking, or add `--stream-partial-output` for incremental streaming of deltas:

```bash
#!/bin/bash
# stream-progress.sh - Track progress in real-time

echo "🚀 Starting stream processing..."

# Track progress in real-time
accumulated_text=""
tool_count=0
start_time=$(date +%s)

agent -p --force --output-format stream-json --stream-partial-output \
  "Analyze this project structure and create a summary report in analysis.txt" | \
  while IFS= read -r line; do
    
    type=$(echo "$line" | jq -r '.type // empty')
    subtype=$(echo "$line" | jq -r '.subtype // empty')
    
    case "$type" in
      "system")
        if [ "$subtype" = "init" ]; then
          model=$(echo "$line" | jq -r '.model // "unknown"')
          echo "🤖 Using model: $model"
        fi
        ;;
        
      "assistant")
        # Only process streaming deltas (timestamp_ms present, no model_call_id).
        # Skip buffered flushes before tool calls and at end of turn.
        has_ts=$(echo "$line" | jq 'has("timestamp_ms")')
        has_mc=$(echo "$line" | jq 'has("model_call_id")')
        if [ "$has_ts" = "true" ] && [ "$has_mc" = "false" ]; then
          content=$(echo "$line" | jq -r '.message.content[0].text // empty')
          accumulated_text="$accumulated_text$content"
          printf "\r📝 Generating: %d chars" ${#accumulated_text}
        fi
        ;;

      "tool_call")
        if [ "$subtype" = "started" ]; then
          tool_count=$((tool_count + 1))

          # Extract tool information
          if echo "$line" | jq -e '.tool_call.writeToolCall' > /dev/null 2>&1; then
            path=$(echo "$line" | jq -r '.tool_call.writeToolCall.args.path // "unknown"')
            echo -e "\n🔧 Tool #$tool_count: Creating $path"
          elif echo "$line" | jq -e '.tool_call.readToolCall' > /dev/null 2>&1; then
            path=$(echo "$line" | jq -r '.tool_call.readToolCall.args.path // "unknown"')
            echo -e "\n📖 Tool #$tool_count: Reading $path"
          fi

        elif [ "$subtype" = "completed" ]; then
          # Extract and show tool results
          if echo "$line" | jq -e '.tool_call.writeToolCall.result.success' > /dev/null 2>&1; then
            lines=$(echo "$line" | jq -r '.tool_call.writeToolCall.result.success.linesCreated // 0')
            size=$(echo "$line" | jq -r '.tool_call.writeToolCall.result.success.fileSize // 0')
            echo "   ✅ Created $lines lines ($size bytes)"
          elif echo "$line" | jq -e '.tool_call.readToolCall.result.success' > /dev/null 2>&1; then
            lines=$(echo "$line" | jq -r '.tool_call.readToolCall.result.success.totalLines // 0')
            echo "   ✅ Read $lines lines"
          fi
        fi
        ;;

      "result")
        duration=$(echo "$line" | jq -r '.duration_ms // 0')
        end_time=$(date +%s)
        total_time=$((end_time - start_time))

        echo -e "\n\n🎯 Completed in ${duration}ms (${total_time}s total)"
        echo "📊 Final stats: $tool_count tools, ${#accumulated_text} chars generated"
        ;;
    esac
  done
```

## Working with images

To send images, media files, or other binary data to the agent, include file paths in your prompts. The agent can read any files through tool calling, including images, videos, and other formats.

### Including file paths in prompts

Simply reference file paths in your prompt text. The agent will automatically read the files when needed:

```bash
# Analyze an image
agent -p "Analyze this image and describe what you see: ./screenshot.png"

# Process multiple media files
agent -p "Compare these two images and identify differences: ./before.png ./after.png"

# Combine file paths with text instructions
agent -p "Review the code in src/app.ts and the design mockup in designs/homepage.png. Suggest improvements to match the design."
```

### How it works

When you include file paths in your prompt:

1. The agent receives your prompt with the file path references
2. The agent uses tool calling to read the files automatically
3. Images are handled transparently
4. You can reference files using relative or absolute paths

### Example: Image analysis script

```bash
#!/bin/bash
# analyze-image.sh - Analyze images using the headless CLI

IMAGE_PATH="./screenshots/ui-mockup.png"

agent -p --output-format json \
  "Analyze this image and provide a detailed description: $IMAGE_PATH" | \
  jq -r '.result'
```

### Example: Batch media processing

```bash
#!/bin/bash
# process-media.sh - Process multiple media files

for image in images/*.png; do
  echo "Processing $image..."
  agent -p --output-format text \
    "Describe what's in this image: $image" > "${image%.png}.description.txt"
done
```

File paths can be relative to the current working directory or absolute paths.
The agent will read files through tool calls, so ensure the files exist and
are accessible from where you run the command.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
