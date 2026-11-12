import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'data/**', '**/data/**', 'data-*/**', 'apps/desktop/src-tauri/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/server/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        setTimeout: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
);
