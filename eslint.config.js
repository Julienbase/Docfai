import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import security from 'eslint-plugin-security'
import noUnsanitized from 'eslint-plugin-no-unsanitized'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'security': security,
      'no-unsanitized': noUnsanitized,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Security rules - detect common security issues (ONLY)
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',

      // XSS prevention rules
      // Allow DOMPurify.sanitize() as a safe escape method
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': ['error', {
        escape: {
          methods: ['DOMPurify.sanitize', 'sanitize']
        }
      }],
    },
  },
  // Regression guard: forbid child_process in main-process runtime code.
  // See docs/WINDOW_CAPTURE_STABILITY.md — spawning subprocesses on the hot
  // path snowballed into thousands of orphan powershell.exe processes under
  // Citrix/EDR load. Use in-process FFI (koffi) or a native addon instead.
  // Legitimate one-shot uses may opt out with an inline eslint-disable + justification.
  {
    files: ['public/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'child_process',
          message: 'child_process is banned in main-process runtime code (see docs/WINDOW_CAPTURE_STABILITY.md). Use in-process FFI (koffi) or a native addon.',
        }],
      }],
      'no-restricted-syntax': ['error',
        {
          selector: 'ImportExpression[source.value="child_process"]',
          message: 'Dynamic import of child_process is banned in main-process runtime code (see docs/WINDOW_CAPTURE_STABILITY.md).',
        },
        {
          selector: 'CallExpression[callee.name="require"][arguments.0.value="child_process"]',
          message: 'require("child_process") is banned in main-process runtime code (see docs/WINDOW_CAPTURE_STABILITY.md).',
        },
      ],
    },
  },
)
