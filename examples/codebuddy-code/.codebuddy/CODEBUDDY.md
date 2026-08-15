# Project memory, project-local copy

CodeBuddy Code reads both `<cwd>/CODEBUDDY.md` and
`<cwd>/.codebuddy/CODEBUDDY.md`; the bridge injects both (identical content
is kept only once).

- More specific than the root `CODEBUDDY.md`: prefer `git commit -m` over
  editor-based flows in this demo.
