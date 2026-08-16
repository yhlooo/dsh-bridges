> 来源: https://cursor.com/docs/reference/ignore-file.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Ignore file

Cursor reads and indexes your project's codebase to power its features. Control which directories and files Cursor can access using a `.cursorignore` file in your root directory.

Cursor blocks access to files listed in `.cursorignore` from:

- Code accessible by [Agent](https://cursor.com/docs/agent/overview.md), Tab, and Inline Edit
- Code accessible via [@ mention references](https://cursor.com/docs/agent/prompting.md)

The terminal and MCP server tools used by Agent cannot block access to code
governed by `.cursorignore`

## Why ignore files?

**Security**: Restrict access to API keys, credentials, and secrets. While Cursor blocks ignored files, complete protection isn't guaranteed due to LLM unpredictability.

**Performance**: In large codebases or monorepos, exclude irrelevant portions for faster indexing and more accurate file discovery.

## Configuring `.cursorignore`

Create a `.cursorignore` file in your root directory using `.gitignore` syntax.

### Pattern syntax

- `*` matches any characters except `/`
- `**` matches any characters including `/`
- `?` matches a single character
- `!` negates a pattern (un-ignores a previously ignored path)
- Lines starting with `#` are comments
- Trailing spaces are ignored unless escaped with `\`

### Pattern examples

```sh
config.json      # Specific file
dist/           # Directory
*.log           # File extension
**/logs         # Nested directories
!app/           # Exclude from ignore (negate)
```

### Hierarchical ignore

Enable `Cursor Settings` > `Features` > `Editor` > `Hierarchical Cursor Ignore` to search parent directories for `.cursorignore` files.

Starting in Cursor 3.11, this setting moves to `Cursor Settings` > `Indexing` > `Ignore Files` > `Hierarchical Cursor Ignore`.

## Global ignore files

Set ignore patterns for all projects in user settings to exclude sensitive files without per-project configuration. The global ignore list is empty by default.

Common patterns to add:

- Environment files: `**/.env`, `**/.env.*`
- Credentials: `**/credentials.json`, `**/secrets.json`
- Keys: `**/*.key`, `**/*.pem`, `**/id_rsa`

## `.cursorindexingignore`

Use `.cursorindexingignore` to exclude files from indexing only. These files remain accessible to AI features but won't appear in codebase searches. Use this for large generated files or vendored dependencies that shouldn't appear in search results.

## Files ignored by default

Cursor automatically ignores files in `.gitignore` and the default ignore list below. Override with `!` prefix in `.cursorignore`.

### Default ignore list

For indexing only, these files are ignored in addition to files in your `.gitignore`, `.cursorignore` and `.cursorindexingignore`:

```sh
package-lock.json
pnpm-lock.yaml
yarn.lock
composer.lock
Gemfile.lock
bun.lockb
.env*
.git/
.svn/
.hg/
*.lock
*.bak
*.tmp
*.bin
*.exe
*.dll
*.so
*.lockb
*.qwoff
*.isl
*.csv
*.pdf
*.doc
*.doc
*.xls
*.xlsx
*.ppt
*.pptx
*.odt
*.ods
*.odp
*.odg
*.odf
*.sxw
*.sxc
*.sxi
*.sxd
*.sdc
*.jpg
*.jpeg
*.png
*.gif
*.bmp
*.tif
*.mp3
*.wav
*.wma
*.ogg
*.flac
*.aac
*.mp4
*.mov
*.wmv
*.flv
*.avi
*.zip
*.tar
*.gz
*.7z
*.rar
*.tgz
*.dmg
*.iso
*.cue
*.mdf
*.mds
*.vcd
*.toast
*.img
*.apk
*.msi
*.cab
*.tar.gz
*.tar.xz
*.tar.bz2
*.tar.lzma
*.tar.Z
*.tar.sz
*.lzma
*.ttf
*.otf
*.pak
*.woff
*.woff2
*.eot
*.webp
*.vsix
*.rmeta
*.rlib
*.parquet
*.svg
.egg-info/
.venv/
node_modules/
__pycache__/
.next/
.nuxt/
.cache/
.sass-cache/
.gradle/
.DS_Store/
.ipynb_checkpoints/
.pytest_cache/
.mypy_cache/
.tox/
.git/
.hg/
.svn/
.bzr/
.lock-wscript/
.Python/
.jupyter/
.history/
.yarn/
.yarn-cache/
.eslintcache/
.parcel-cache/
.cache-loader/
.nyc_output/
.node_repl_history/
.pnp.js/
.pnp/
```

### Negation pattern limitations

When using negation patterns (prefixed with `!`), you cannot re-include a file if a parent directory is excluded via \*.

```sh
# Ignore all files in public folder
public/*

# This works, as the file exists at the top level
!public/index.html

# This doesn't work - cannot re-include files from nested directories
!public/assets/style.css
```

**Workaround**: Explicitly exclude nested directories:

```sh
public/assets/*
!public/assets/style.css # This file is now accessible
```

Excluded directories are not traversed for performance, so patterns on contained files have no effect.
This matches the .gitignore implementation for negation patterns in nested directories. For more details, see the [official Git documentation on gitignore patterns](https://git-scm.com/docs/gitignore).

## Troubleshooting

Test patterns with `git check-ignore -v [file]`.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
