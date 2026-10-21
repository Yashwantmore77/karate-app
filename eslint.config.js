// Report-only for now (KAN-414): every rule warns, so `npm run lint` lists
// what to look at without failing CI. Make a rule an error once it is clean.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

const warnAll = (rules) => Object.fromEntries(Object.entries(rules).map(([name, level]) => [name, level === 'off' || level === 0 ? 'off' : 'warn']))

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'docs/**', '**/coverage/**'] },
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node },
    },
    rules: {
      ...warnAll(js.configs.recommended.rules),
      // Leaving out fields with a rest spread, and _-named placeholders, are deliberate.
      'no-unused-vars': ['warn', { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // The web tests run with vitest's globals switched on.
    files: ['**/*.test.{js,jsx}', 'packages/web/src/test/**'],
    languageOptions: { globals: { describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly', vi: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly' } },
  },
  {
    files: ['packages/web/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'warn', 'react-hooks/exhaustive-deps': 'warn' },
  },
]
