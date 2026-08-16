// E2E hook fixture: block the user prompt with an exit-2 stderr message.
process.stderr.write('blocked by prompt policy\n')
process.exit(2)
