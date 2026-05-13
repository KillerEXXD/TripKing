/* ESLint v8 (legacy config). Mirrors hudr-pwa minus the storybook plugin. */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    '.eslintrc.cjs',
    'vite.config.*',
    'vitest.config.*',
    'scripts',
    'supabase',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // `<Input>` is our shadcn text-input wrapper — a `<label>` nesting it is correctly associated.
    'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Input'] }],
    // `autoFocus` on the single-purpose field of a screen (sign-in phone, OTP entry, onboarding name) is a deliberate UX call.
    'jsx-a11y/no-autofocus': 'off',
  },
};
