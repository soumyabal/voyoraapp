/**
 * screensCompile.test.js — a COMPILE safety net for files jest never imports.
 *
 * jest runs in a node env and no test imports the screens/modals, so a syntax/JSX error
 * introduced there (e.g. by a refactor) would pass the suite unnoticed and only surface at
 * bundle/runtime. This transforms every screen + modal with the project's Babel config; a
 * parse/transform failure turns a test RED. (It does NOT prove rendering or import
 * resolution — eslint's import/no-unresolved + no-undef cover those.)
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = process.cwd();
const DIRS = ['src/screens', 'src/modals'];

const files = DIRS.flatMap((d) => {
  const abs = path.join(ROOT, d);
  return fs.existsSync(abs)
    ? fs.readdirSync(abs).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`)
    : [];
});

describe('screens + modals compile (parse/transform safety net)', () => {
  test('there are files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s parses + transforms', (rel) => {
    expect(() => babel.transformFileSync(path.join(ROOT, rel))).not.toThrow();
  });
});
