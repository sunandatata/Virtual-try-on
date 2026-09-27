import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['.next/**', 'coverage/**', 'next-env.d.ts'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { globals: { Request: 'readonly', Response: 'readonly', fetch: 'readonly' } },
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
);
