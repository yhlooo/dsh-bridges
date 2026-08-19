# The Pi bridge

[中文](pi.zh.md)

Bridges assets configured for Pi into DeepSeek Harness: `.pi/` skills and
prompt templates and context-file memory. Pi has no hook configuration,
permission-rule system, or MCP config — its TypeScript extension event bus is
out of scope. For install steps and behaviors shared by all bridges, see the
[guides index](README.md).

## Config

The bridge owns a config section under the `bridges` row; any later patch layer
can override it:

```yaml
- id: bridges
  config:
    pi:
      enabled: true                   # master switch for the Pi bridge
      skills: true                    # discover .pi / ~/.pi/agent skills and prompt templates
      memory: true                    # inject the AGENTS.md / CLAUDE.md chain and APPEND_SYSTEM.md
      userPiDir: '~/.pi/agent'        # user-level Pi config directory (PI_CODING_AGENT_DIR wins when set)
      watch: true                     # watch skill roots, settings files, and trust.json
      memoryMaxBytes: 32768
```

## Skills and prompt templates

Reads the Pi asset locations and registers them on the DeepSeek Harness skill registry (provider `pi`), so they appear in the model-facing skill catalog and are invocable with `/name`:

| Pi location | Registered as |
| :--- | :--- |
| `$PI_DIR/skills/<name>/SKILL.md` (recursive; `$PI_DIR` = `PI_CODING_AGENT_DIR` or `~/.pi/agent`) | user-level skill |
| `$PI_DIR/skills/<name>.md` (flat root files) | user-level skill |
| `.pi/skills/<name>/SKILL.md` and flat `.md` (project, trust-gated) | project-level skill |
| `$PI_DIR/prompts/<name>.md` / `.pi/prompts/<name>.md` (non-recursive, project trust-gated) | skill (slash-command template; `/name` gesture) |
| settings `skills` / `prompts` arrays (file or directory paths) | skill at the declaring layer's band |

Mapping rules:

- The skill name is the frontmatter `name` (Pi allows it to differ from the directory name; the directory/file name is only the fallback when `name` is absent — Pi's source behavior). Names must be kebab-case for DeepSeek Harness; a Pi-legal name that is not kebab-case is skipped with a warning (no transliteration).
- `description` is required (Pi does not load a skill without one; the bridge skips it with a warning). It is capped at Pi's 1,024-character limit.
- `disable-model-invocation: true` → the skill leaves the model catalog but stays user-invocable (`/skill:name` upstream, `/name` here); invalid values warn and default to false (Pi is lenient).
- `metadata` is carried through; `allowed-tools` (experimental), `license`, `compatibility`, and unknown fields are ignored (limitations).
- Precedence mirrors Pi's source load order: the global locations load before the project ones and same-name collisions keep the first skill found, so personal assets override project assets; a skill overrides a same-name prompt template at the same level. Native DeepSeek Harness skills always win on name conflicts (see [Common behaviors](README.md#common-behaviors)).
- The `.agents/skills` locations Pi also reads are deliberately not re-read: DeepSeek Harness's own filesystem provider covers `.agents` assets, so re-registering them would duplicate candidates.
- Project `.pi/skills`, `.pi/prompts`, and the project `.pi/settings.json` load only when the project is trusted. The bridge resolves trust the way Pi's non-interactive mode does: the closest saved decision for the working directory or a parent in `$PI_DIR/trust.json` wins, else the global `defaultProjectTrust` (`ask` default and `never` skip project resources, `always` trusts them — there is no prompt in a non-interactive session, so `ask` counts as untrusted). The `project_trust` extension event is not bridged.
- Existing skill roots, settings files, and `trust.json` are watched; edits appear in the session without a restart.

## Context-file memory

DeepSeek Harness's own loader reads `AGENTS.md` and `CLAUDE.md` at every directory from the project root down to the working directory. The bridge additionally injects at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- `$PI_DIR/AGENTS.md` (global, loaded regardless of project trust)
- one file per directory walking from the filesystem root down to the working directory — per directory the first non-empty of `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD` (Pi's source-verified candidate order; `AGENTS.override.md` replaces that directory's `AGENTS.md`/`CLAUDE.md`); files deduplicate by canonical path; plain `AGENTS.md` / `CLAUDE.md` files on the repository-root-to-cwd chain are skipped (DeepSeek Harness already loads them), while the uppercase variants, overrides, and files above the repository root stay
- `$PI_DIR/APPEND_SYSTEM.md`, then the trusted project `.pi/APPEND_SYSTEM.md` (Pi appends both to the system prompt)

Budget 32 KiB: the broader global file is dropped first, then the most specific sections are truncated.

## Limitations

Not bridged yet (documented per subsystem):

- **Extensions**: `~/.pi/agent/extensions/*.ts` / `.pi/extensions/*.ts` and extension events (`tool_call` interception, `tool_result` rewriting, `project_trust`, …) — a TypeScript runtime equivalent of OpenCode's plugin API; no DeepSeek Harness seam is bridged for it.
- **Memory**: `.pi/SYSTEM.md` / `$PI_DIR/SYSTEM.md` (whole system-prompt replacement — DeepSeek Harness owns the system prompt); `--no-context-files` and `--prompt-template` CLI flags are per-run options with no persistent config.
- **Skills**: `allowed-tools` (experimental pre-approved tool lists), `license` / `compatibility` display fields, `enableSkillCommands` (DeepSeek Harness `/name` invocation always works; the setting is read for documentation parity), packages (`pi.skills` in `package.json` / `skills/` package dirs), CLI `--skill` paths, and the `.agents/skills` roots (covered by DeepSeek Harness's native provider instead).
- **Permissions / MCP / subagents**: Pi has none built in (trust gating and tool allowlists are its whole surface; MCP and subagents arrive through extensions, which are out of scope).
- **Trust**: interactive trust prompts and the `project_trust` extension event are not available; `ask` therefore resolves to untrusted in DeepSeek Harness sessions (Pi's own non-interactive behavior).
