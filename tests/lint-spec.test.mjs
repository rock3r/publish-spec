// Runs lint-spec.mjs in static-only mode against small fixture pages.
// The browser checks need headless Chrome and a local server, so CI skips them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
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
  assert.match(out, /No data-spec-version on this entry page/);
});

test('version markup inside code examples and comments does not count', () => {
  const { out } = lint('version-in-example');
  assert.match(out, /No data-spec-version on this entry page/);
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

test('every index.html entry page needs a version; other pages do not', () => {
  const { out } = lint('version-pages');
  assert.match(out, /guide\/index\.html\] No data-spec-version on this entry page/);
  assert.doesNotMatch(out, /walkthrough\.html\] No data-spec-version/);
  assert.doesNotMatch(out, /\[index\.html\] No data-spec-version/);
});

test('a deployed URL gets the version checks too', async () => {
  const page = readFileSync(join(here, 'fixtures', 'stale-changelog', 'index.html'));
  const server = createServer((_req, res) => res.end(page));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const out = await new Promise((done) => {
      const child = spawn(process.execPath, [linter, url, '--static-only']);
      let text = '';
      child.stdout.on('data', (chunk) => (text += chunk));
      child.stderr.on('data', (chunk) => (text += chunk));
      child.on('close', () => done(text));
    });
    assert.match(out, /newest changelog entry is v1\.1, but the page declares v1\.2/);
  } finally {
    server.close();
  }
});

test('data-id="changelog" is not the changelog', () => {
  const { code, out } = lint('version-data-id', '--strict');
  assert.equal(code, 0, out);
});

test('prefixed attributes such as x-data-spec-version and x-data-version do not count', () => {
  assert.match(lint('version-prefixed').out, /No data-spec-version on this entry page/);
  assert.match(lint('version-prefixed-entry').out, /newest changelog entry is v1\.0, but the page declares v1\.1/);
});

test('version attributes written as prose do not count', () => {
  assert.match(lint('version-in-prose').out, /No data-spec-version on this entry page/);
});

test('metadata syntax inside another attribute value does not count', () => {
  assert.match(lint('version-in-attribute').out, /No data-spec-version on this entry page/);
  assert.match(lint('changelog-id-in-attribute').out, /Declares v1\.1 but has no changelog/);
});

test('tag syntax inside a quoted value does not end or nest the changelog', () => {
  const { code, out } = lint('changelog-quoted-tag', '--strict');
  assert.equal(code, 0, out);
});

test('a quoted </pre> does not end a code example early', () => {
  assert.match(lint('version-quoted-pre').out, /No data-spec-version on this entry page/);
});

test('title and script contents are text, not tags', () => {
  const { code, out } = lint('version-raw-text', '--strict');
  assert.equal(code, 0, out);
});

test('iframe fallback content is text, not tags', () => {
  assert.match(lint('version-iframe').out, /No data-spec-version on this entry page/);
});

test('plaintext runs to the end of the page', () => {
  assert.match(lint('version-plaintext').out, /No data-spec-version on this entry page/);
});

test('a void element with id="changelog" has no entries', () => {
  assert.match(lint('changelog-void').out, /newest changelog entry is missing, but the page declares v1\.1/);
});

test('markup inside SVG CDATA is text', () => {
  assert.match(lint('version-cdata').out, /No data-spec-version on this entry page/);
});

test('a comment opener inside a script does not swallow the page', () => {
  const { code, out } = lint('comment-in-script', '--strict');
  assert.equal(code, 0, out);
});

test('uppercase names, spaces around = and unquoted values are read', () => {
  const { code, out } = lint('version-attribute-forms', '--strict');
  assert.equal(code, 0, out);
});

test('an unclosed changelog is reported, not read to the end of the page', () => {
  assert.match(lint('changelog-unclosed').out, /The changelog <details id="changelog"> is never closed/);
});

test('repeated and out-of-order changelog entries warn', () => {
  const { out } = lint('changelog-order');
  assert.match(out, /lists v1\.1 more than once/);
  assert.match(out, /lists v1\.2 after v1\.1/);
});

test('a single file target is checked as an entry page', () => {
  const { out } = lint(join('version-pages', 'walkthrough.html'));
  assert.match(out, /No data-spec-version on this entry page/);
});

test('a deployed URL that fails is an error, not a hang', async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 500;
    res.end('nope');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const out = await new Promise((done) => {
      const child = spawn(process.execPath, [linter, `http://127.0.0.1:${server.address().port}/`, '--static-only']);
      let text = '';
      child.stdout.on('data', (chunk) => (text += chunk));
      child.stderr.on('data', (chunk) => (text += chunk));
      child.on('close', (code) => done({ code, text }));
    });
    assert.equal(out.code, 1, out.text);
    assert.match(out.text, /returned 500/);
  } finally {
    server.close();
  }
});

test('comment and CDATA openers inside a quoted value are text', () => {
  const { code, out } = lint('comment-in-attribute', '--strict');
  assert.equal(code, 0, out);
});

test('empty and --!> comments are closed the way browsers close them', () => {
  const { code, out } = lint('comment-abrupt', '--strict');
  assert.equal(code, 0, out);
});

test('an unclosed CDATA opener in HTML content ends at the next >', () => {
  const { code, out } = lint('cdata-unclosed-html', '--strict');
  assert.equal(code, 0, out);
});

test('an unterminated comment inside pre hides the rest of the page, as in a browser', () => {
  assert.match(lint('comment-in-pre').out, /has no changelog|No data-spec-version/);
});

test('patch versions order numerically, and 1.1 and 1.1.0 count as one version', () => {
  const { out } = lint('changelog-patch-order');
  assert.doesNotMatch(out, /lists v1\.0\.1 after/);
  assert.match(out, /lists v1\.1\.0 more than once|lists v1\.1 more than once/);
  assert.match(out, /lists v1\.1\.0 after v1\.0\./);
});

test('the browser audit is skipped when a deployed URL fails', async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 503;
    res.end('down');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const out = await new Promise((done) => {
      const child = spawn(process.execPath, [linter, `http://127.0.0.1:${server.address().port}/`]);
      let text = '';
      child.stdout.on('data', (chunk) => (text += chunk));
      child.stderr.on('data', (chunk) => (text += chunk));
      child.on('close', () => done(text));
    });
    assert.match(out, /returned 503/);
    assert.doesNotMatch(out, /\[browser\]|Chrome|1280px/);
  } finally {
    server.close();
  }
});
