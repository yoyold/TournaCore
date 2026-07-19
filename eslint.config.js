import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { project: ['./tsconfig.app.json', './tsconfig.node.json'] },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Labels often wrap their control alongside several nested spans (title
      // plus help text). The default depth does not look far enough and reports
      // false positives.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 4 }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // --- Type safety ---
      '@typescript-eslint/no-explicit-any': 'error',
      // noUncheckedIndexedAccess forces bracket access on index signatures
      // (process.env, dataset); without this option dot-notation contradicts it.
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Enforces exhaustive switch statements over discriminated unions such as
      // format configs, match slots and seeding sources, so a newly added
      // tournament format is caught at every site that must handle it.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // --- Import ordering ---
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',

      /**
       * The central architectural rule.
       *
       * The domain layer must stay pure: no imports from React, the store,
       * services or the UI. That is what keeps tournament logic testable without
       * a browser, movable into a web worker later, and reusable server-side if
       * the app ever gains a backend.
       *
       * This is not a style question. A single store import inside the engine
       * destroys all three options.
       */
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/domain',
              from: './src',
              except: ['./domain', './models', './utils'],
              message:
                'The domain layer must stay pure. Only imports from domain, models and utils are allowed.',
            },
            {
              target: './src/models',
              from: './src',
              except: ['./models', './utils'],
              message: 'models may only depend on utils.',
            },
            {
              target: './src/domain',
              from: './node_modules/react',
              message: 'The domain layer must not import React.',
            },
            {
              target: './src/components',
              from: './src/services',
              message:
                'Components must not reach into services directly. Go through the store or a hook.',
            },
          ],
        },
      ],
    },
  },

  /*
   * Type-aware rules apply to TypeScript only. JavaScript config files have no
   * TS program to draw type information from, and ESLint aborts without this
   * exemption.
   */
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Node globals for config files
  {
    files: ['*.config.{ts,js}', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Tests may be more relaxed
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'tests/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // Must come last: disables all formatting-related rules
  prettier,
);
