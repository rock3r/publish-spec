// Runs lint-spec.mjs in static-only mode against small fixture pages.
// The browser checks need headless Chrome and a local server, so CI skips them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const linter = join(here, '..', 'skills', 'publish-spec', 'scripts', 'lint-spec.mjs');

function lint(fixture, ...flags) {
  const r = spawnSync(process.execPath, [linter, join(here, 'fixtures', fixture), '--static-only', ...flags], {
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('a clean page passes with no warnings, even in strict mode', () => {
  const { code, out } = lint('clean', '--strict');
  assert.equal(code, 0, out);
  assert.match(out, /Spec lint passed \(0 warnings\)/);
});

test('code samples do not trigger the placeholder or citation checks', () => {
  const { out } = lint('clean');
  assert.doesNotMatch(out, /placeholder|citation/i);
});

test('generation leftovers fail the lint', () => {
  const { code, out } = lint('leftovers');
  assert.equal(code, 1, out);
  assert.match(out, /citation debris \("contentReference"\)/);
  assert.match(out, /Unfilled placeholders \("\[Your Name\]", "XX%"\)/);
  assert.match(out, /Bare citation markers in prose \("\[1\]"\)/);
});

test('layout problems fail the lint', () => {
  const { code, out } = lint('layout');
  assert.equal(code, 1, out);
  assert.match(out, /Missing <meta name="viewport"/);
  assert.match(out, /multi-column grid\(s\) but is missing @media \(max-width: 900px\) and @media \(max-width: 680px\)/);
  assert.match(out, /<img> missing alt=""/);
});

test('a missing target exits with code 2', () => {
  const { code } = lint('does-not-exist');
  assert.equal(code, 2);
});

test('a version without a matching newest changelog entry warns', () => {
  const { code, out } = lint('stale-changelog', '--strict');
  assert.match(out, /newest changelog entry is v1\.1, but the page declares v1\.2/);
  assert.notEqual(code, 0, out);
});

test('a page with no version warns', () => {
  const { out } = lint('leftovers');
  assert.match(out, /No page declares data-spec-version/);
});

test('version markup inside code examples and comments does not count', () => {
  const { out } = lint('version-in-example');
  assert.match(out, /No page declares data-spec-version/);
});

test('a second version declaration warns, and data-version outside the changelog is ignored', () => {
  const { out } = lint('version-duplicate');
  assert.match(out, /Declares data-spec-version 2 times \(v1\.1, v1\.0\)/);
  assert.doesNotMatch(out, /newest changelog entry/);
});

test('an empty changelog fails even when another element carries the version', () => {
  const { out } = lint('version-widget');
  assert.match(out, /newest changelog entry is missing, but the page declares v1\.1/);
});
