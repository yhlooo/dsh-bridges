// E2E hook fixture: report additionalContext as PostToolUse JSON output.
process.stdout.write('{"hookSpecificOutput":{"additionalContext":"extra context from fixture"}}\n')
