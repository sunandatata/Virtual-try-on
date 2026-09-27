import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist/**', 'public/**', 'release/**', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: {
        chrome: 'readonly',
        document: 'readonly',
        window: 'readonly',
        indexedDB: 'readonly',
        Image: 'readonly',
        File: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', process: 'readonly', URL: 'readonly', console: 'readonly' },
    },
  },
  { files: ['e2e/**/*.ts'], rules: { 'no-empty-pattern': 'off' } },
);
