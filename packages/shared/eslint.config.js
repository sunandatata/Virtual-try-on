import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist/**'] },
  { files: ['**/*.ts'], rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
);
