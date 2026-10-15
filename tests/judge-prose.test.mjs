// Offline unit and stub-server tests for judge-prose.mjs and prose-calibration.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  DEFAULT_CALIBRATION_PATH,
  resolveEndpointAndModel,
  unwrapSystemOne,
  averageAnswers,
  verdict,
  validateCalibrationCoverage,
  extractHtmlParagraphs,
  extractMarkdownParagraphs,
} from '../skills/publish-spec/scripts/judge-prose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'skills', 'publish-spec', 'scripts', 'judge-prose.mjs');
const calData = JSON.parse(readFileSync(DEFAULT_CALIBRATION_PATH, 'utf8'));

test('prose-calibration.json has two-sided coverage and does not leak item strings into criteria', () => {
  const missing = validateCalibrationCoverage(calData);
  assert.deepEqual(missing, []);
  assert.ok(calData.items.length >= 24, `Expected >= 24 calibration items, got ${calData.items.length}`);

  for (const [id, check] of Object.entries(calData.checks)) {
    const criteriaText = JSON.stringify(check.criteria).toLowerCase();
    for (const item of calData.items.filter((x) => x.check === id)) {
      const snippet = item.state.slice(0, 40).toLowerCase();
      assert.ok(
        !criteriaText.includes(snippet),
        `Check "${id}" criteria leaks calibration item "${item.name}"`
      );
    }
  }
});

test('resolveEndpointAndModel defaults to jev-1.14.0 and supports Cloudflare Clef backends', () => {
  const def = resolveEndpointAndModel({}, {});
  assert.equal(def.endpoint, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(def.model, 'jev-1.14.0');

  const clef = resolveEndpointAndModel({ backend: 'clef-flash', accountId: 'acc123' }, {});
  assert.equal(
    clef.endpoint,
    'https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/cloudflare/clef-flash'
  );
  assert.equal(clef.model, 'clef-flash');
});

test('unwrapSystemOne handles both direct Jev responses and Cloudflare Workers AI envelopes', () => {
  const direct = { model: 'jev-1.14.0', answers: { q: { type: 'noul', noul: 0.9 } } };
  assert.deepEqual(unwrapSystemOne(direct), direct);

  const wrapped = {
    result: { model: 'clef-flash', answers: { q: { type: 'noul', noul: 0.9 } } },
    success: true,
  };
  assert.deepEqual(unwrapSystemOne(wrapped), wrapped.result);
});

test('averageAnswers averages probability distributions and picks the averaged winner', () => {
  const runs = [
    {
      s: {
        type: 'choice',
        choice: 'plain_technical',
        confidence: 0.6,
        probabilities: { plain_technical: 0.6, telegraphic_fragments: 0.4 },
      },
    },
    {
      s: {
        type: 'choice',
        choice: 'telegraphic_fragments',
        confidence: 0.8,
        probabilities: { plain_technical: 0.2, telegraphic_fragments: 0.8 },
      },
    },
  ];
  const avg = averageAnswers(runs, ['s']);
  assert.equal(avg.s.choice, 'telegraphic_fragments');
  assert.ok(Math.abs(avg.s.probabilities.plain_technical - 0.4) < 1e-6);
  assert.ok(Math.abs(avg.s.probabilities.telegraphic_fragments - 0.6) < 1e-6);
});

test('verdict scores acceptable probability mass and identifies the top defect label', () => {
  const check = calData.checks.style_defect;

  const passRes = verdict(check, {
    type: 'choice',
    choice: 'plain_technical',
    confidence: 0.9,
    probabilities: {
      plain_technical: 0.92,
      rhetorical_contrast_or_aphorism: 0.08,
    },
  });
  assert.equal(passRes.verdict, 'pass');

  const failRes = verdict(check, {
    type: 'choice',
    choice: 'rhetorical_contrast_or_aphorism',
    confidence: 0.8,
    probabilities: {
      plain_technical: 0.02,
      rhetorical_contrast_or_aphorism: 0.88,
      poetic_or_obscuring_metaphor: 0.1,
    },
  });
  assert.equal(failRes.verdict, 'fail');
  assert.equal(failRes.topDefect, 'rhetorical_contrast_or_aphorism');
  assert.ok(Math.abs(failRes.slopMass - 0.98) < 1e-6);

  const abstainRes = verdict(check, {
    type: 'choice',
    choice: 'plain_technical',
    confidence: 0.2,
    probabilities: {
      plain_technical: 0.52,
      corporate_or_chatbot_filler: 0.48,
    },
  });
  assert.equal(abstainRes.verdict, 'abstain');
});

test('extractHtmlParagraphs and extractMarkdownParagraphs skip code, tables, and changelog', () => {
  const html = readFileSync(join(here, 'fixtures', 'clean', 'index.html'), 'utf8');
  const htmlSpans = extractHtmlParagraphs(html, 'index.html');
  assert.equal(htmlSpans.length, 2);
  assert.ok(htmlSpans.every((s) => !s.text.includes('items[1]') && !s.text.includes('Shortened the expiry')));

  const md = `---
name: sample
---
# Heading

The worker claims the next queued row within 30 seconds and records its lease token.

| Col | Value |
| --- | --- |
| a | b |

\`\`\`js
const secret = "do not extract code blocks";
\`\`\`

- Each retry waits for the backoff timer before sending another request to the upstream server.
`;
  const mdSpans = extractMarkdownParagraphs(md, 'README.md');
  assert.equal(mdSpans.length, 2);
  assert.match(mdSpans[0].text, /worker claims the next queued row/);
  assert.match(mdSpans[1].text, /Each retry waits for the backoff timer/);
});

test('CLI refuses --api-key on the command line', async () => {
  const res = await new Promise((done) => {
    const child = spawn(process.execPath, [scriptPath, '--api-key', 'secret']);
    let err = '';
    child.stderr.on('data', (c) => (err += c));
    child.on('close', (code) => done({ code, err }));
  });
  assert.equal(res.code, 2);
  assert.match(res.err, /--api-key is not accepted/);
});

test('CLI runs style checks and --verify-pairs against a local SystemOne stub server', async () => {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = JSON.parse(body);
      const state = payload.state || '';
      const answers = {};
      for (const id of Object.keys(payload.questions || {})) {
        if (id === 'style_defect') {
          const isBad = /quorum|pivotal layer/i.test(state);
          answers[id] = {
            type: 'choice',
            choice: isBad ? 'rhetorical_contrast_or_aphorism' : 'plain_technical',
            confidence: 0.95,
            probabilities: isBad
              ? { plain_technical: 0.02, rhetorical_contrast_or_aphorism: 0.98 }
              : { plain_technical: 0.96, rhetorical_contrast_or_aphorism: 0.04 },
          };
        } else if (id === 'meaning_preserved') {
          const isChanged = /<=150ms|all four transition/i.test(state);
          answers[id] = {
            type: 'choice',
            choice: isChanged ? 'changed_rule_or_threshold' : 'preserved',
            confidence: 0.95,
            probabilities: isChanged
              ? { preserved: 0.01, changed_rule_or_threshold: 0.99 }
              : { preserved: 0.95, changed_rule_or_threshold: 0.05 },
          };
        }
      }
      // Return wrapped in Cloudflare's { result: { ... } } envelope to exercise envelope unwrapping
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: { model: 'stub-clef', answers }, success: true }));
    });
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/systemone`;
  const tmp = mkdtempSync(join(tmpdir(), 'judge-prose-test-'));

  try {
    const runCli = (...args) =>
      new Promise((done) => {
        const child = spawn(process.execPath, [
          scriptPath,
          '--endpoint',
          endpoint,
          '--samples',
          '1',
          '--skip-calibration',
          ...args,
        ]);
        let out = '';
        child.stdout.on('data', (c) => (out += c));
        child.stderr.on('data', (c) => (out += c));
        child.on('close', (code) => done({ code, out }));
      });

    const cleanRes = await runCli(join(here, 'fixtures', 'clean', 'index.html'));
    assert.equal(cleanRes.code, 0, cleanRes.out);
    assert.match(cleanRes.out, /2 pass, 0 fail/);

    const badRes = await runCli(join(here, 'fixtures', 'leftovers', 'index.html'));
    assert.equal(badRes.code, 1, badRes.out);
    assert.match(badRes.out, /rhetorical_contrast_or_aphorism/);

    const pairsFile = join(tmp, 'pairs.json');
    writeFileSync(
      pairsFile,
      JSON.stringify([
        {
          id: 'good-pair',
          original: 'tween(300) across thirty files is not a decision, it is a copy-paste with a quorum.',
          rewritten: 'Without these tags, an agent would treat a repeated tween(300) as a design rule.',
        },
        {
          id: 'bad-pair',
          original: '100+ times per day: Platform state layer only.',
          rewritten: '100+ times per day: Platform state layer only (or <=150ms).',
        },
      ])
    );
    const verifyRes = await runCli('--verify-pairs', pairsFile);
    assert.equal(verifyRes.code, 1, verifyRes.out);
    assert.match(verifyRes.out, /FAIL\s+bad-pair.*changed_rule_or_threshold/);
    assert.match(verifyRes.out, /1 pass, 1 fail/);
  } finally {
    server.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
