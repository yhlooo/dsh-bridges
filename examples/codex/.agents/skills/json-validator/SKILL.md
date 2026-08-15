---
name: json-validator
description: Validate JSON files and report structural problems with file names and line numbers.
---

# JSON Validator

Check JSON files the user points at (or all `*.json` under the working
directory when none are given):

1. Parse each file with `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`.
2. Report files that fail to parse with the error message and approximate
   line number.
3. Also warn about duplicate keys and files that are valid JSON but not
   strict JSON (comments or trailing commas).
4. Never rewrite files unless the user asks.
