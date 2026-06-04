// Flat ESLint config (ESLint 9) using Expo's recommended ruleset.
// Run: `npm run lint`. Intentionally non-blocking for now — it surfaces issues
// (unused vars, dead imports, hook deps) to clean up incrementally; we do NOT
// auto-fix or gate CI on it yet.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'coverage/**',
      'babel.config.js',
      'metro.config.js',
    ],
  },
  {
    // Jest globals for test files — without these, eslint reported ~360 phantom
    // "errors" (expect/test/describe/it/jest undefined) that drowned out the ~10
    // real findings. This makes the lint baseline honest and CI-gateable.
    files: ['**/__tests__/**/*.js', '**/*.test.js', '**/jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
];
