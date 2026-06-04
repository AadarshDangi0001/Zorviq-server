import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import promise from 'eslint-plugin-promise';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

const nodeGlobals = {
  Buffer: 'readonly',
  clearInterval: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'eslint.config.js',
      'package-lock.json',
      'postman/**',
      'prettier.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: nodeGlobals,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir,
      },
    },
    plugins: {
      'import-x': importX,
      promise,
      security,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { fixStyle: 'separate-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
            inheritedMethods: false,
            properties: false,
            returns: false,
            variables: false,
          },
        },
      ],
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/require-await': 'off',
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'import-x/first': 'warn',
      'import-x/no-duplicates': 'warn',
      'import-x/no-unresolved': 'off',
      'no-console': 'warn',
      'no-implicit-coercion': 'error',
      'no-useless-assignment': 'warn',
      'no-unused-vars': 'off',
      'promise/catch-or-return': 'warn',
      'promise/no-return-wrap': 'error',
      'security/detect-object-injection': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts', 'vitest.config.ts'],
    rules: {
      '@typescript-eslint/no-base-to-string': 'off',
      'no-console': 'off',
      'promise/catch-or-return': 'off',
    },
  },
  eslintConfigPrettier
);
