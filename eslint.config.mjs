import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['apps/admin/**/*.{ts,tsx}'],
    plugins: { '@next/next': next },
    settings: { next: { rootDir: 'apps/admin' } },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['packages/core/src/**/*.ts', 'apps/*/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Inject Clock for business time.',
        },
      ],
    },
  },
);
