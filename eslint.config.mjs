import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Physical-direction Tailwind utilities break RTL. Use logical ones instead:
 * ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e.
 */
const PHYSICAL_DIRECTION =
  '/(^|[\\s:])-?(m[lr]|p[lr]|left|right|border-[lr]|rounded-[lr]|rounded-[tb][lr]|scroll-m[lr]|scroll-p[lr])-|(^|[\\s:])(text-left|text-right|float-left|float-right|border-[lr]|rounded-[lr])(?=\\s|$)/';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=${PHYSICAL_DIRECTION}]`,
          message:
            'Use logical Tailwind utilities (ms-/me-/ps-/pe-/start-/end-/text-start/text-end) — physical left/right breaks RTL.',
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${PHYSICAL_DIRECTION}]`,
          message:
            'Use logical Tailwind utilities (ms-/me-/ps-/pe-/start-/end-/text-start/text-end) — physical left/right breaks RTL.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'src/types/database.ts',
  ]),
]);

export default eslintConfig;
