> 来源: https://cursor.com/docs/cli/changelog.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# CLI Changelog

The latest features, improvements, and fixes shipping to Cursor CLI. Run `agent --version` to check your installed version, and `agent update` to upgrade in place.

## August 11, 2026 release

### Steering and subagents

- **Steer a running turn, then interrupt.** Pressing Enter while the agent works now sends your queued message into the active run at a safe boundary to steer it, and only interrupts the turn if you press Enter again.
- **Single-turn runs wait for their subagents.** Headless and single-turn runs drain delegated subagents and include their completion before exiting, instead of cutting off while background shells or dev servers are still running.
- **Read the full subagent transcript.** Drilling into a subagent shows its complete, ordered transcript, including the prompt, thinking, tool calls, and final response, instead of only tool rows.
- **Choose the Explore subagent's model.** Set the Explore subagent to the default, disabled, inherit the parent model, or a specific model from `/config`.
- **Background task follow-ups are back.** Completion follow-ups for finished background tasks fire again in interactive and headless sessions.

### Skills, custom modes, and goals

- **Sticky skills and custom modes.** A skill slash entry attaches once when you press Enter, and Option+Enter invokes a mode-backed skill as a sticky custom mode that stays active until you exit it.
- **Managed skills can ship Markdown resources.** Managed-skill sync now materializes a skill's nested Markdown files under `~/.cursor/skills-cursor`, so skills that reference extra resources work.
- **Skill discovery skips hidden directories.** Skill and subagent scans no longer descend into hidden dot-directories, avoiding slow loads from large nested folders.
- **Durable goals.** `/goal` tracks a durable goal with an active or paused status line, continues the goal across idle and headless runs, and pauses it on Ctrl+C. This is rolling out and gated.

### Models

- **Auto stays pinned in the picker.** Auto is pinned to the top of the `/model` list, matching the IDE.
- **Editing a model's parameters selects it.** Adjusting parameters in `/model` now selects that model, so pressing Esc leaves your updated choice active.
- **Headless keeps Max-mode variants.** A headless `--model` selection that requires Max Mode now sends it, so max-context variants are no longer clamped down.

### MCP and plugins

- **Simpler MCP login for known hosts.** Logging into servers like Slack from the `/mcp` pager uses default authentication, avoiding dynamic-client-registration failures.
- **Plugin hooks run from installed plugins.** Hooks defined by installed plugins, including those loaded with `--plugin-dir`, now execute and refresh when plugins reload.
- **Secrets stay masked in plugin config.** Plugin configuration forms mask credential-named and secret-typed fields like tokens, API keys, and passwords.

### Terminal and rendering

- **Inline image previews.** Attached and generated images render inline in terminals that support it, with text fallbacks everywhere else.
- **LaTeX math renders as Unicode.** Math in Markdown renders as terminal-friendly Unicode instead of raw TeX.
- **Cleaner shell output and transcripts.** Long shell output no longer has zero-width spaces injected into it, so copied paths and tokens stay intact; the working-directory note is hidden when a command runs in the current directory; hidden tool-call groups no longer leave blank lines; and queued "+N more pending" approval previews stack without gaps.
- **Responsive `@` file palette.** Typing stays responsive in large repositories while the `@` palette computes file suggestions.
- **Steadier custom status line.** A custom `statusLine` command keeps its throttle during streaming updates and restarts only when the command or working directory changes.

### Approvals and security

- **Timed mode-switch approvals.** Approving a mode switch now uses the pager UI with a 15-second countdown and auto-rejects when left unattended, matching the IDE.
- **Hardened git commands.** Repository-controlled git configuration, including fsmonitor, hooks, attributes, and external diff programs, no longer runs during the agent's own git operations.
- **Sandbox read access and git over SSH.** Sandbox policy gains a read-access boundary, and sandboxed git-over-SSH on macOS and Linux routes through the SOCKS proxy so allowlisted remotes work and denied ones fail with a clear error.
- **Sudo uses your latest input.** Submitting a sudo password now sends exactly what you typed rather than a stale rendered value.

### Reliability and startup

- **Faster startup.** Syntax-highlighting grammars and the background-composer client load lazily off the boot path, and a slow plugin list falls back to a plugin-less session instead of stalling startup.
- **Long headless sessions no longer hang.** Wedged uploads on long-running headless HTTP/1.1 sessions are detected and retried instead of silently stalling.
- **Faster resume on network filesystems.** The resume picker scans sessions in parallel and keeps your newest chat selected while the full cross-workspace list loads.

### Self-hosted workers

- **More control over self-hosted workers.** Workers can join a named pool with `agent worker --pool <name>`, default to releasing after an hour idle (`--idle-release-timeout 0` keeps them running), start from a non-git directory with `--worker-dir`, take a data-directory lock to prevent duplicate daemons, and run session-start and session-end hooks on claim and release.

### Enterprise and install

- **Admin command denylist enforced in the CLI.** A team admin's command denylist is enforced in local shell execution and refreshed per request, with a killswitch. Admin-controlled.
- **MDM sign-in policy.** CLI login sends and enforces MDM sign-in policy, including organization, team, email, and domain allowlists, and reports enforcement denials. Admin-controlled.
- **Windows uninstall can remove your data.** The Windows uninstaller can optionally delete Cursor user data, including the `~/.cursor` folder that stores CLI credentials.
- **Resilient install script.** The install script falls back to wget or python3 when curl is broken.

## July 20, 2026 release

- **`--trust` works in interactive sessions.** Previously `--trust` required headless mode. Passing it in an interactive session now trusts the workspace up front and skips the trust dialog, recording the same saved trust decision the dialog writes when you accept.
- **Clear errors instead of hangs at login.** MCP OAuth login fails fast with an actionable message when the callback port is already taken, instead of hanging on "Listening for the OAuth callback". On macOS, keychain failures at startup now explain the cause and the fix, like unlocking a locked keychain or logging out and back in, instead of a raw exit code.
- **The model catalog stays fresh in long sessions.** The CLI refetches the model catalog every 10 minutes in the background, so newly released models appear in `/model` and shortcuts without restarting. If a refresh fails, the CLI keeps the current catalog and retries on the next interval.
- **Cleaner rendering.** Completed tool rows no longer disappear for a frame when the agent moves to its next step, markdown tables with emoji or CJK text keep their columns aligned, typing a path like `/tmp` followed by a space no longer leaves the slash palette stuck on "No matches", and subagent rows drop the Ctrl+O expand hint (the shortcut still works).
- **Fixed CPU spinning from the branch watcher.** When the watcher that keeps the prompt footer's git branch current could not attach, most commonly after exhausting the inotify watch limit on Linux, it retried in a tight loop that pegged a CPU core. Failed attaches now back off exponentially, and branch switches still update the footer immediately.

## July 13, 2026 release

### Plugins and MCP

- **Manage plugin marketplaces from the shell.** Script marketplace management without an interactive session: `agent plugin marketplace add <git-url>` registers a marketplace (pin a branch, tag, or commit with `--git-ref`), `list` prints each marketplace's name, scope, and git URL (`--format json` for scripts), `update` re-indexes one from its repository, and `remove` deletes a user-scoped marketplace.
- **One server for duplicate MCP configs.** When the same remote MCP server is configured in more than one scope, such as your user `mcp.json` and a project's `.cursor/mcp.json`, the CLI now runs a single instance instead of duplicates. Pick which scope's configuration wins from the new Configure Scope tab in a server's `/mcp` detail view. The choice is saved per project.

### Usage and models

- **See plan usage and spend in `/usage`.** `/usage` now shows your account's included-usage meters with Auto and API breakdowns, on-demand spend against your limit, plan name, and billing-cycle reset date. Enterprise pooled plans get a spend chart for the current billing cycle compared with the previous period of the same length, plus a link to the usage dashboard.
- **Fixed Max Mode sticking on.** Choosing a variant that requires Max Mode, like `/fast` or a 1M-context option, no longer leaves Max Mode silently enabled for other models and future sessions: it clears when your selection stops requiring it, while an explicit `/max-mode` choice stays sticky. The MAX indicator is also back in the prompt bar, after the model's parameter summary.
- **Fixed the empty `/model` picker on slow connections.** If the model catalog fetch timed out at startup, `/model` stayed empty for the whole session. Opening the picker now refetches the catalog, and an open picker fills in as soon as the list arrives.

### Approvals and trust

- **Auto-accept web searches.** A new Auto-Accept Web Search permission lets the agent run web searches without pausing for approval each time. It is off by default. Toggle it under Permissions in `/config` or set `autoAcceptWebSearch` in `cli-config.json`. Honored in interactive, headless, subagent, and Agent Client Protocol runs.
- **Steer the agent from shell approval prompts.** The skip option on shell approvals is now labeled "Skip & tell the agent what to do instead", and choosing it opens a composer whose message is sent to the agent as the reason the command was skipped. Submitting an empty message just skips.
- **Worktree setup respects workspace trust.** Setup commands from `.cursor/worktrees.json` now run only after the workspace is trusted, through the trust prompt, a saved trust decision, or `--trust` in headless runs. Untrusted workspaces skip setup with a visible notice.

### Reliability

- **Resuming chats is faster.** The resume picker shows your current workspace's chats immediately and fills in other workspaces in the background, and selecting a chat no longer waits on a model-catalog fetch when your stored model is already cached.
- **Network blips no longer kill runs.** DNS failures and network-unreachable errors, like those during a VPN transition, retry with backoff like other transport errors. If the network stays down, the CLI shows an actionable hint covering network, VPN, DNS, and proxy configuration instead of a raw network error.
- **Subagents survive transient failures.** A momentary network error no longer kills a running subagent with a terminal error. Subagent turns retry with the same policy as regular turns, resuming from their last checkpoint when one exists.
- **Updates no longer break running sessions.** Auto-update cleanup could delete the installed version a long-running session was launched from, crashing it mid-turn. Running processes now mark their install directory as in use so cleanup skips it, and if install files still disappear, such as after a Homebrew upgrade, the CLI asks you to restart instead of failing with a module error.
- **`/btw` fixes.** Side questions no longer fail with an internal blob error in long or compacted sessions, and the slash palette no longer pops up over your question while you type it.

## July 6, 2026 release

### Models and skills

- **New installs start on Auto.** Fresh CLI installs default to Auto model routing. Existing choices are unchanged; switch anytime with `/model` or `--model`.
- **Switch models instantly from slash commands.** Type a shortcut like `/opus` or `/composer` to jump straight to a model, no picker needed; each family shortcut remembers your last choice. `/fast` toggles Fast when the current model supports it. Disable shortcuts under Model slash commands in `/config`.
- **Keep model-only skills out of slash commands.** Set `user-invocable: false` in a skill's `SKILL.md` frontmatter to hide it from `/` autocomplete and typed `/skill-name` resolution while keeping it available to the model.

### Reliability

- **Fixed memory growth from per-turn cancellation state.** Long chats no longer accumulate abort listeners and controllers; each turn releases them when it finishes.
- **Quitting returns you to the shell promptly.** Exit no longer waits on MCP servers or other background tasks to wind down, and quitting from the workspace-trust prompt no longer flashes "Trusting workspace…".
- **Fixed config corruption when running several agents at once.** Concurrent CLI processes could interleave writes to `cli-config.json` and block later startups. Each write now stages to its own temp file before an atomic rename.

### Sessions and subagents

- **Resume chats from any directory.** `agent ls`, `agent --resume`, and `/resume` open All chats across workspaces by default. Use Left/Right to switch to This workspace; chats from other directories show a folder label, and resuming one loads the full conversation instead of an empty one.
- **Subagents keep their context across resumes.** Completed subagents persist checkpoints, so resuming one restores its prior context instead of starting empty. Background subagents include their final message in the completion notification, and resuming an unavailable subagent fails clearly.

### Login and MCP

- **Log in from another device with a QR code.** During `agent login` or first-run onboarding, press `q` to reveal a QR code for the same login URL, then scan it from a phone to finish authentication over SSH without copying a long link. Narrow terminals and non-interactive sessions continue to show the URL only.
- **Filter MCP servers and see login start immediately.** Type to filter the `/mcp` server list. Selecting Login shows "Preparing login…" right away, and SSH OAuth instructions no longer use `ssh -N`, which failed through some proxies.
- **Fixed MCP allowlist and approval bugs.** Team network allowlists now accept HTTP(S) origins with explicit ports, such as local servers on non-default ports. Personal MCP tool approvals work again when team admin tool controls are empty or unset.

### Input and terminal

- **Long prompts stay within six visual lines.** The prompt bar and queued-message editor scroll to keep the cursor visible instead of growing without bound. Large pastes stay collapsed as a pill when recalled from history while the agent receives their full content, and Working appears immediately after you submit.
- **Fixed terminal state after Ctrl+Z.** Suspending the CLI restores your shell's keyboard modes until you `fg`. Backspace no longer swallows the letters typed right after it when the interface briefly stalls, and typing stays responsive while the agent streams output.
- **Fixed queued sudo prompts.** Each sudo request opens a fresh password prompt instead of sticking on "Authenticating…". Escape and Ctrl+C cancel during submission, and the mask uses `•` instead of `*` to avoid misalignment with terminal font ligatures.
- **Debug mode cards use debug mode colors.** The reproduction-steps decision card uses the red debug accent instead of plan-mode yellow, so the active mode stays clear.

## June 29, 2026 release

### Workspaces and commands

- **Start multi-root sessions from the command line.** Repeat `--add-dir <path>` to add directories at launch, including with `--workspace`. `/add-dir` refreshes slash skills and custom commands immediately; restart only when you want the agent to discover new skills automatically.
- **Plugin reloads refresh commands.** Reloading a plugin refreshes its slash commands and palette. Long skill and custom-command names resolve correctly, and `/add-dir` keeps directory completion open while you browse.
- **Queued follow-ups send on the second Enter.** Press Enter again on an empty prompt to stop the current turn and send your queued message immediately, including while a `beforeSubmitPrompt` hook is running.
- **Fixed input lag during agent runs.** Typing and queuing follow-ups no longer rerender the full transcript on every keystroke while output streams.
- **Fixed model options resetting.** Changing Fast, reasoning effort, or context in `/model` preserves your other compatible choices and keeps Max Mode in sync.

### Cloud and Auto-review

- **Cloud transfers preserve model and workspace context.** For Git repositories with Cloud Agents access, transfers preserve the selected model and workspace path. The prompt shows transfer status, `Esc` or `Ctrl-C` cancels, and failure details remain visible.
- **Auto-review considers invoked instructions.** Admins can control availability. When Auto-review is enabled for your account and selected model, the classifier can inspect invoked skill and file-backed custom-command files before deciding whether a tool call needs approval. Existing hard approval boundaries are unchanged.

### Authentication and MCP

- **Run Cursor in sandboxes without macOS Keychain.** Set `AGENT_CLI_CREDENTIAL_STORE=file` to store credentials unencrypted in an owner-only file. Use private storage that persists across runs; packaged Unix builds also skip system CA loading in this mode.
- **Fixed false MCP connection errors.** Working servers no longer appear disconnected in `/mcp` and `agent mcp list` when their tools or instructions are available.

### Reliability and updates

- **Windows updates suppress PowerShell progress output.** Native updates no longer draw PowerShell's progress bar over the CLI or incur its download overhead.
- **Fixed memory growth in long CLI sessions.** The CLI now saves only new transcript entries at each checkpoint instead of reloading and rewriting the full conversation.

## June 22, 2026

### Auto-review

- **Auto-review run mode.** Cursor's Auto-review run mode comes to the CLI: a middle ground between Allowlist and Run Everything that keeps the agent moving with fewer approval prompts. Shell, MCP, and Fetch calls are checked in order: allowlisted calls run immediately, calls that can be sandboxed run in the sandbox, and the rest go to a classifier that allows the call, tries a different approach, or asks you to approve. Turn it on with `--auto-review`, in `/config`, or with `/auto-review`, and steer the classifier with `allow`/`block` instructions in `permissions.json`.

### Workspaces

- **Named multi-directory workspaces.** Run the agent across several repositories at once: add directories mid-session with `/add-dir`, save the set with `/save-workspace`, reload it later with `/load-workspace`, or start scoped with `--workspace`.

### Commands

- **`/rewind` is on by default.** The turn-by-turn undo timeline no longer needs turning on in `/config`.
- **`/vim` anywhere in the prompt.** Trigger inline Vim editing from any position, not just an empty prompt.
- **Richer `/copy`.** Pick a single step of a multi-step reply from a per-step picker, copy the agent's responses alongside your own messages, and copy long replies without the terminal stalling.
- **`/logs` on shared machines.** Debug logs are written per user so multi-user hosts don't hit permission errors, and the `/logs` path lingers on screen longer.

### Terminal experience

- **Prompt history is per conversation.** Up-arrow recalls what you typed in this session instead of a single history shared across every chat.
- **The jobs list shows everything running.** Foreground shells and subagents appear in the jobs pager alongside background tasks.
- **Steadier rendering.** Mermaid diagrams stay drawn after a turn finishes, long shell-output previews clip instead of wrapping, and the screen clears once per resize instead of twice.
- **Your draft survives the resume picker.** Cancelling `/resume` keeps what you had already typed.
- **Plan editing.** Esc returns to Vim normal mode while you revise a plan.

### Reliability

- **Lower memory in long sessions.** Fixed a leak where per-turn abort signals held on to conversation state.
- **No crash on missing approval state.** Sessions tolerate credential stores that haven't recorded an approval mode yet.

### MCP and skills

- **Editor-provided MCP servers are trusted.** MCP servers passed in over the Agent Client Protocol (Zed and other editors) load instead of being silently dropped.
- **MCP tools survive a plugin reload.** The MCP lease refreshes after a plugin reloads, so its tools no longer wedge with "Not connected" errors.
- **Skills found through symlinks.** The skills menu follows symlinked directories when discovering skills.

### Install and updates

- **Reliable channel switching.** Switching release channels applies on the first try and immediately fetches the target channel's build.
- **Windows and shim fixes.** The Windows launcher matches timestamped version directories, and the `cursor` shim no longer errors on shells that treat unset variables as failures.

### Enterprise and team controls

- **Team gating for Auto-review.** Admins control whether Auto-review is available to their members.
- **Stable self-hosted worker identity.** `worker start` waits for the bridge to connect before reporting ready, and workers keep a stable logical ID scoped per authenticated user, so fleets on shared machines match the right worker to the right person.

## June 9, 2026

### Terminal experience

- **Cleaner edit display.** File edits render borderless (an `Editing`/`Edited` header plus the diff), with memoized diff rendering so large edits don't slow the UI.
- **Faster, richer resume picker.** Session metadata is cached so `/resume` (Ctrl+Y) opens quickly even on network filesystems, with Created and Last updated columns and reliable ordering.
- **Working status pinned above the prompt.** Progress, token counts (with an optional elapsed-time display), and hints stay in one stable place.
- **Long shell output truncates from the top.** You see the latest output of a streaming command, not the oldest.
- **Wrapped URLs stay clickable.** Long links re-emit hyperlink codes on every wrapped line.
- **Model picker shows Max Mode state**, and the footer model summary drops redundant labels.

### Commands

- **`/fork`** Branch the current conversation into a copy and continue down a different path (aliases `/branch`, `/duplicate`).
- **`/update`** Update the CLI in place from inside the session.
- **`/context`** Visualize what's consuming the context window, broken down by category.
- **`/logs`** Debug logs are written for every session; `/logs` shows the path and copies it to the clipboard.
- **Background task controls.** Arrow-key navigation in the task viewer and a kill shortcut.

### Reliability

- **HTTP/2 keepalive pings.** Silent connection stalls mid-stream are detected in seconds and retried.
- **Transport interruptions retry automatically.** Network-level cancels and aborts no longer end the turn as if Ctrl+C had been pressed.
- **Freeze fixes.** Eliminated hard UI freezes caused by layout feedback loops, an input freeze after first-run onboarding, and swallowed or reordered keystrokes while pasting.
- **Faster first paint on slow networks.** Team settings lookups no longer block interactive startup (about 2 seconds on high-latency connections).
- **Works on restricted networks.** Feature defaults apply when corporate firewalls block the configuration service.
- **direnv support.** The agent's shell loads `.envrc` automatically, in interactive and agent-dispatched shells.
- **Drag-and-drop and paste fixes.** File drag-and-drop paths arrive intact, and pasting a copied image file on macOS attaches the actual image.

### Enterprise and team controls

- **Admins can disable headless mode.** A team setting blocks non-interactive CLI usage org-wide.
- **"Run Everything" controls.** Auto-run renamed consistently across the product; admin-controlled auto-run treats the command allowlist as the always-available baseline.
- **MCP user-extension governance.** Admin "Allow User Extension" toggles for MCP servers and tools are enforced at runtime.
- **Team-managed MCP servers.** Centrally configured servers load reliably, with server group selection; MCP tool policy is decoupled from the terminal auto-run setting.
- **MCP OAuth over SSH.** The CLI shows port-forwarding instructions when authenticating a remote MCP server from an SSH session.

## May 20, 2026

- **Composer 2.5 is the default model** for new CLI sessions.
- **`/summarize`.** Renamed from `/compress` to match the IDE; `/compact` and `/compress` remain as aliases, and aliases execute directly.
- **Local plugins via `~/.cursor/settings.json`.** Point an `enabled_plugins` key at local plugin folders; no marketplace needed.
- **Multi-root workers.** Self-hosted workers span multiple repositories with repeatable `--worker-dir` flags and keep a stable identity.
- **Rewind preserves images.** Rewinding to an earlier turn restores that turn's image attachments to the prompt.
- **Faster `/plugins`.** Quicker plugin details, with each plugin's MCP servers linked into `/mcp` management.
- **MCP tools refresh in-session.** Logging in, enabling, or disabling a server from `/mcp` updates the agent's available tools immediately.
- **Readable diffs in light mode.** Character-level diff highlights are legible on light terminal themes.
- **Hooks accept payloads over stdin.** Avoids argv length limits and keeps payloads out of process listings.

## May 14, 2026

- **Vim visual mode.** Visual selection with delete and change operators; the active Vim mode shows in the footer.
- **Ctrl+G opens your prompt in `$EDITOR`.** Compose long prompts in your real editor and drop the result back into the prompt bar.
- **MCP management revamped.** `/mcp` opens a per-server detail view: browse tool schemas, log in, log out (clears stored OAuth credentials), enable, and disable, all without leaving the session.
- **Headless runs wait for MCP tools.** Fixed a startup race where slow stdio MCP servers were missing from `-p` runs.
- **Nested rules and skills.** `.cursor/rules` and `.cursor/skills` in subdirectories are discovered everywhere, matching the IDE.
- **Long conversations redraw instantly.** Full repaints render only recent turns (`/full-conversation` to opt out), keeping resizes and resumes fast in old sessions.
- **Proxy support for agent streams.** `HTTPS_PROXY` is honored on the streaming connection, completing corporate proxy support end to end.
- **Auto-run survives resume.** Resuming a conversation recomputes Run Everything from your config and team policy.
- **Model variants work headless.** Fast or high-effort model slugs passed to `--model` keep their parameters in `-p` mode.
- **Early keystrokes are buffered** and replayed once the UI loads; stale input over SSH and tmux fixed.
- **tmux focus awareness.** The prompt cursor stops blinking in unfocused panes (with `focus-events on`).
- **Pathological diffs render safely.** Very long lines are capped before syntax highlighting, so minified files can't stall the UI.

## May 7, 2026

- **Plugin marketplaces.** Add a marketplace by git URL (`/plugin marketplace add`), browse and manage marketplaces by scope, see which marketplace each plugin came from, and load local plugin dirs with `--plugin-dir`. Plugins imported from Claude Code appear alongside native ones.
- **Ctrl+L clears the screen** like a shell: clears screen and scrollback, keeps your session running.
- **Smooth typing from the first keystroke.** Fixed an event-loop stall (about 1 second on large repos) that batched early keystrokes; closing pagers no longer repaints the whole screen.
- **Skills everywhere.** Skills load in interactive, headless, and editor-integration modes; `/skill-name` invocations work in `-p` print mode.
- **Linux clipboard image paste.** Paste images on Wayland and X11.
- **`/model` typeahead.** Type `/model sonnet` and the picker opens pre-filtered, without submitting your prompt.
- **Theme follows your terminal.** Switching your terminal between light and dark repaints the CLI automatically.
- **Stall detection with persistent retries.** Stalled streams are detected and retried instead of hanging, and the backend can fall back to HTTP/1 transport on networks where HTTP/2 misbehaves.
- **`/mcp` grouped by scope.** Servers are organized under User / Project / Team, and failed servers show their actual error.
- **Privacy hardening.** Conversation summarization fails closed for no-storage teams.
- **Delegated worker tokens.** Team service accounts can mint short-lived user-scoped tokens so self-hosted workers run attributed to a specific team member.
- **Interrupting keeps partial results.** Stopping a turn preserves the output of in-flight shell commands, and follow-ups move running tools to the background instead of killing them.

## April 2026

- **`/rewind`: undo agent turns.** An interactive timeline restores files and conversation state to any earlier turn, with per-turn file diffs, conversation-only restore, and `/undo`/`/restore` aliases (enable in `/config`).
- **Desktop notifications.** Get notified when a turn finishes or the agent is blocked on you (approvals, questions, sudo) across iTerm2, Ghostty, Warp, Kitty, and Terminal.app, with tmux/screen passthrough and focus-aware muting. Approval notifications include the pending command.
- **Interactive `/config`.** A full settings editor inside the CLI replaces hand-editing JSON, including a version and account page.
- **Custom status line.** Point `statusLine` at your own command and render its output (with live token usage data) in the prompt footer.
- **`/btw` side questions.** Ask a quick read-only question mid-turn; the answer streams into a dismissible overlay with full conversation context and never touches your conversation history.
- **Lighter startup.** MCP loading moved off the first-paint path, server config and model are cached between runs, the syntax-highlighting bundle shrank from 9.1 MB to 2.4 MB, and one-shot commands skip UI initialization entirely.
- **HTTP/2 connection pooling on by default.** Better throughput for parallel tool calls and subagents.
- **Vim find motions.** `f`/`F`/`t`/`T`/`;`/`,` with operator composition (`df,`, `ct.`).
- **Image paste shortcuts.** Ctrl+V pastes a clipboard image; pasting a copied image file resolves the actual image.
- **Markdown and diff rendering.** Tighter spacing, styled headings, git-style unified diffs with context lines, accurate new-file diffs, and a fix for gray-on-dark text that was invisible in many themes (including dark mode over SSH).
- **Context in the footer.** Working directory, git branch, and the open PR for your branch (as a clickable link) stay visible while you type.
- **`?` shortcut cheat sheet, `/copy`, `/rename`.** Discover input shortcuts, copy past messages, and name your sessions.
- **One question at a time.** Clarifying questions present individually with a freeform "Other" answer option.
- **Headless improvements.** `--format json` for `status`/`about`, plan mode works with `-p`, and errors are recorded in transcripts so scripts can detect failed runs.
- **Hooks fire reliably.** `afterAgentThought`/`afterAgentResponse` events emit in the CLI, and Claude Code-format hook responses are accepted.
- **Global MCP servers auto-approved.** Servers from `~/.cursor/mcp.json` load without per-workspace prompts (project-level servers still require approval), and MCP approval screens hide secrets in URLs.
- **Install plugins from a git URL.** Paste a repo URL into the plugin search to install directly.
- **Trust and approval hardening.** Worktrees inherit workspace trust, approval prompts can't be skipped by a stray Enter, and the CLI offers to persist "Run Everything" after repeated use.

## March 2026

- **Subagents in the CLI.** Parallel agents execute locally with live status in interactive, headless, and editor sessions, inheriting your credentials, rules, and approval policy. Max mode and custom-key setups propagate to subagents.
- **Run Everything is its own toggle.** Auto-approval is controlled by `/auto-run` (and `--force`/`--yolo`) separately from the Shift+Tab mode cycle, and team-configured approval modes are respected in headless runs.
- **Plugins arrived.** Browse the marketplace and install or uninstall plugins at user or project scope from `/plugin`; plugin skills, slash commands, subagents, and MCP servers all load into the session.
- **Retries on by default.** Dropped and stalled streams retry automatically in all modes, and classified server errors (like rate limits) render with their real message.
- **`permissions.json` support.** The CLI reads the same terminal/MCP allowlist file as the IDE.
- **Corporate proxy support for auth.** Login and API-key validation route through `HTTPS_PROXY`, unblocking Zscaler-style networks.
- **Background tasks.** Double Ctrl+B sends a running shell to the background, headless runs wait for background work to finish (emitting events for `stream-json` consumers), and completion notifications render cleanly.
- **Self-hosted worker improvements.** No sudo required, fixed idle disconnects, automatic token refresh, a Prometheus metrics endpoint, Windows support, custom names, and proxy support.
- **Skills from other tools' directories.** Skills are also discovered in `.claude/skills`, `.agents/skills`, and `.codex/skills`.
- **Remote MCP OAuth fixes.** Strict OAuth servers (state/scopes) work with `/mcp login`, and `${VAR}` placeholders expand in MCP configs everywhere.
- **`--image` everywhere.** Attach images in any session, not just print mode.
- **Editor integrations.** Model and mode selection over the Agent Client Protocol (Zed, JetBrains), host-provided MCP servers respected, richer streaming with thinking and file locations, and skill slash commands.
- **Locked macOS keychain detected over SSH.** A clear "unlock your keychain" message replaces opaque credential failures.
- **Admin controls.** Network allow and deny lists are enforced unconditionally (including for MCP traffic), admin-disabled sandboxing is respected by auto-run, and image generation asks before running.
- **Claude Sonnet 4.6 on Bedrock.** Added to the bring-your-own-key model list.
- **Richer hook payloads.** Per-turn token usage and a stable session ID.

## February 2026

- **Git worktrees.** `--worktree`/`-w` runs the agent in an isolated worktree (with `--worktree-base` for the base branch), keeping agent changes off your checkout; the sandbox fully understands worktree layouts.
- **Headless hang fixed.** `-p` runs no longer block when spawned with an open stdin pipe (Node, Python, CI runners), and connection failover on partially unreachable networks dropped from about 20 seconds to 8.
- **`--yolo`.** Fully autonomous runs that auto-approve consistently across trust, MCP, and command approvals.
- **AWS Bedrock with your own credentials.** `agent bedrock` configures access keys or a team IAM role; works across interactive, headless, and editor sessions.
- **Automatic reconnection.** Transport errors retry with a visible "Reconnecting…" indicator.
- **Review UI.** Unified `/changes` (Ctrl+R) with a Session tab showing only this session's edits, `o`/`O` to open diffs in your editor, and a zen toggle while reviewing.
- **Token usage for scripts.** Per-turn input/output/cache token totals and a `request_id` in `stream-json` output; headless transcripts write Claude Code-compatible JSONL.
- **Repeatable `-H/--header`.** Pass multiple headers curl-style.
- **Sandbox policy files.** `~/.cursor/sandbox.json` and `.cursor/sandbox.json` are honored (including over SSH), network access has clear modes, and the CLI fails fast with a clear reason when sandboxing is enabled but unavailable.
- **Plan mode improvements.** A persistent plan menu with Build Locally / Build in Cloud, and plan content transfers correctly to cloud agents.
- **Faster startup, snappier turns.** Parallelized initialization, deferred update checks, and optimistic message rendering.
- **Rendering improvements.** Markdown tables wrap to your terminal width, thinking blocks render markdown, shell commands get syntax highlighting, and Mermaid renders more diagram types.
- **Input fixes across terminals.** Vim `r` (replace char), Alt+Delete word deletion, Ctrl+J newline in iTerm2, Windows Delete key, Wayland clipboard support, and session-local prompt history.
- **Enterprise attribution control.** Admin-disabled commit/PR attribution is enforced in the CLI regardless of local settings.
- **Clear errors for blocked screenshots.** macOS permission failures show a warning and workaround instead of failing silently.

## January 2026

- **Hooks.** Session start/end, stop hooks with follow-up loops (autonomous "keep going" patterns), pre-compaction, and subagent lifecycle hooks; Claude Code `settings.json` hooks are read and merged; admins can push team-managed hooks with enterprise > team > project > user precedence.
- **Permissions and sandboxing aligned with the IDE.** A three-mode model (Run Everything / Auto-Run in Sandbox / Ask Every Time), an interactive `/sandbox` menu, a default-deny network proxy for sandboxed commands, and team-admin network allowlists enforced in the CLI.
- **`sudo` works.** Commands needing sudo trigger a masked password prompt delivered over a locked-down local socket; the model never sees your password.
- **Plan and Ask modes.** `--mode plan|ask` startup flags, `/plan <prompt>`, Shift+Tab mode cycling, and native UIs for questions, mode switches, and plan review, with plans saved to disk.
- **Responsive typing while streaming.** Buffered input with deferred rendering of streaming output, and queued follow-ups submit instantly.
- **Hand off to Cloud Agents.** Type `&` to transfer the live conversation to a cloud agent and keep working.
- **`--continue`.** Resume your most recent chat without looking up an ID; transcripts persist to disk for tooling and hooks.
- **Headless trust enforcement.** Non-interactive runs in untrusted workspaces fail with guidance unless `--trust` (or `--force`) is passed.
- **MCP management.** `/mcp list` is an interactive pager with status, login, enable, and tool browsing; OAuth login fixed; project config correctly overrides user config; tool-level allowlisting from the approval prompt.
- **Skills, rules, and commands in the CLI.** `/skills` browsing and inline `/skill-name` invocation, curated built-in skills, and interactive `/rules` and `/commands` browsers with inline editing.
- **`/model` autocomplete and Max Mode.** Fuzzy model search with friendly names, plus `/max-mode` with a footer indicator that persists across sessions.
- **Markdown rendering.** Aligned tables, clickable links, horizontal rules, and word-level inline diffs in file reviews.
- **Subagent UI.** Live rendering for parallel subagents with per-agent status, streamed activity, and token counts.
- **Editor integration groundwork.** Session resume, real agent modes, granular tool rendering, and custom slash commands over the Agent Client Protocol (Zed and others).
- **Windows reliability.** Works under restricted PowerShell execution policies, detects Git Bash, fixes browser-based login; clipboard support landed on Windows and Linux.
- **Auth and updates.** Expired tokens prompt re-login instead of crashing, transient server errors no longer log you out, parallel auto-updates can't corrupt an install, and `--disable-auto-update` turns background updates off.
- **Faster startup.** Compile caching and lazy initialization cut warm boot time about 10%.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
