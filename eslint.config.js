import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['lib/**', 'coverage/**', 'e2e/fixtures/**', 'docs/reference/**', 'eslint.config.js', 'vitest.config.ts'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      // Bridge payloads are parsed user content; structural typing is checked
      // by schemas instead of `any` bans.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
