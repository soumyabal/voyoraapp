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
  {
    // React Compiler lint rules ship in eslint-plugin-react-hooks v7 and report at `error`,
    // but the compiler itself is OFF (no babel-plugin-react-compiler, no app.json experiment) —
    // so these gate nothing at runtime/build. `set-state-in-effect` is downgraded to `warn`:
    // it fires ~20x on the established "seed local form state from props when a modal opens"
    // idiom (useEffect(() => { if (visible) setX(initial...) }, [visible, initial])). The clean
    // fix is the key-prop remount pattern, but mass-refactoring 20 working modals is high
    // regression risk for zero shipping benefit. Kept as `warn` so genuinely NEW cascading-render
    // bugs still surface; migrate modals to key-remount opportunistically when touched.
    // (The localized refs/purity/immutability false positives are handled with per-file
    // eslint-disable headers carrying their own justification — see those files.)
    files: ['src/**/*.js'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
