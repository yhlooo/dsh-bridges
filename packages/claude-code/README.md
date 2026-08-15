# @dsh-bridges/claude-code

Bridge that registers Claude Code assets in DeepSeek Harness. See the [repository README](../../README.md) for the full behavior reference.

## Install

```sh
dsh plugin --profile <name> add @dsh-bridges/claude-code
```

## Config

The bundle inserts one row (`id: claude-code`) into the composed tree; every field can be overridden from the profile's `cordis.patch.yml` or a later patch layer:

```yaml
- id: claude-code
  name: '@dsh-bridges/claude-code'
  config:
    skills: true                  # discover .claude / ~/.claude skills and commands
    memory: true                  # inject ~/.claude/CLAUDE.md and .claude/CLAUDE.md
    hooks: true                   # run Claude Code hooks from settings.json
    userClaudeDir: '~/.claude'    # user-level Claude Code directory
    watch: true                   # watch skill roots and republish on change
    hookTimeoutMs: 600000         # default hook timeout (SessionStart, tool, Stop events)
    userPromptHookTimeoutMs: 30000
    maxHookOutputChars: 10000     # cap on context-bound hook output
    memoryMaxBytes: 32768         # cap on the rendered CLAUDE.md memory block
```

## Subsystems

- `src/skills/` — the `claude-code` skill provider: discovery, frontmatter mapping, ranks, chokidar watching.
- `src/memory.ts` — CLAUDE.md memory injection at session start.
- `src/hooks/` — settings discovery/merge, matcher and `if` evaluation, command/HTTP hook execution, and the DSH lifecycle wiring in `bridge.ts`.
