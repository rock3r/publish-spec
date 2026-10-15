#!/usr/bin/env node
/**
 * judge-prose.mjs — Calibrated System One prose-defect classifier and rewrite verifier.
 *
 * Evaluates prose paragraphs from HTML specs or Markdown docs against concrete house-style
 * defect categories (`style_defect`), and verifies that rewritten passages preserve every
 * technical rule, threshold, and caveat from their source (`meaning_preserved`).
 *
 * Compatible with any System One / Jev endpoint (`POST /v1/systemone`):
 *   - TypeSafe Jev (`jev-1.14.0`, `jev-latest`): https://api.typesafe.ai/v1/systemone
 *   - Cloudflare Workers AI (`@cf/cloudflare/clef-flash`, `@cf/cloudflare/clef`, `@cf/cloudflare/clef-omni`)
 *   - Local `/v1/systemone` servers (`mlx-community/clef-flash-4bit`, `ggml-org/Clef-Flash-GGUF`,
 *     `ollama pull clef`, `sglang`, `opendecider`, `laya-serve`)
 *
 * Usage:
 *   node scripts/judge-prose.mjs --calibrate-only
 *   node scripts/judge-prose.mjs <html-or-md-or-dir> [--out findings.json] [--samples 3]
 *   node scripts/judge-prose.mjs --verify-pairs pairs.json [--out verify.json] [--samples 3]
 */

import { readFileSync, existsSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, extname, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CALIBRATION_PATH = resolve(HERE, '..', 'references', 'prose-calibration.json');

export const HOW_TO_SUPPLY_A_KEY = `\
  Supply a key via TYPESAFE_API_KEY, TYPESAFE_API_KEY_SPEC, or ~/.config/typesafe/key
  (override path with TYPESAFE_API_KEY_FILE). When using --backend clef or clef-flash,
  CLOUDFLARE_API_TOKEN (with CLOUDFLARE_ACCOUNT_ID) is also accepted.

  A key spec takes one of three forms:
    op://Vault/Item/field      read on demand via the 1Password CLI (op)
    !<shell command>           run the command; its first line of stdout is the key
    <literal key>              used directly

  There is no --api-key flag so credentials do not appear in process tables or shell history.`;

export function resolveEndpointAndModel(opts = {}, env = process.env) {
  const backend = (opts.backend || env.TYPESAFE_BACKEND || '').trim().toLowerCase();
  let endpoint = (opts.endpoint || env.TYPESAFE_ENDPOINT || '').trim();
  let model = (opts.model || env.TYPESAFE_MODEL || '').trim();

  if (backend === 'clef' || backend === 'clef-flash' || backend === 'clef-omni') {
    const accountId = (opts.accountId || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    if (!endpoint) {
      if (!accountId) {
        throw new Error(`--backend ${backend} requires CLOUDFLARE_ACCOUNT_ID or --endpoint.`);
      }
      endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/${backend}`;
    }
    if (!model) model = backend;
  } else {
    if (!endpoint) endpoint = 'https://api.typesafe.ai/v1/systemone';
    if (!model) model = 'jev-1.14.0';
  }
  return { endpoint, model, backend };
}

export function isLoopbackEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

export function loadKey(env = process.env, endpoint = '') {
  const literal = (env.TYPESAFE_API_KEY || '').trim();
  if (literal) return literal;

  if (/api\.cloudflare\.com/i.test(endpoint) && (env.CLOUDFLARE_API_TOKEN || '').trim()) {
    return env.CLOUDFLARE_API_TOKEN.trim();
  }

  let spec = (env.TYPESAFE_API_KEY_SPEC || '').trim();
  const keyFile = env.TYPESAFE_API_KEY_FILE
    ? resolve(env.TYPESAFE_API_KEY_FILE)
    : join(homedir(), '.config', 'typesafe', 'key');
  if (!spec && existsSync(keyFile)) {
    spec = readFileSync(keyFile, 'utf8').trim();
  }

  if (!spec) {
    if (isLoopbackEndpoint(endpoint)) return '';
    return null;
  }

  if (spec.startsWith('op://')) {
    const proc = spawnSync('op', ['read', spec], { encoding: 'utf8' });
    if (proc.error || proc.status !== 0) {
      const detail = (proc.stderr || proc.error?.message || '').trim().slice(0, 300);
      throw new Error(`key command failed (op read ${spec}): ${detail}`);
    }
    const out = (proc.stdout || '').trim().split(/\r?\n/)[0]?.trim() || '';
    if (!out) throw new Error('key command succeeded but printed nothing');
    return out;
  }

  if (spec.startsWith('!')) {
    const cmd = spec.slice(1).trim();
    const proc = spawnSync(cmd, { shell: true, encoding: 'utf8' });
    if (proc.error || proc.status !== 0) {
      const detail = (proc.stderr || proc.error?.message || '').trim().slice(0, 300);
      throw new Error(`key command failed (${cmd}): ${detail}`);
    }
    const out = (proc.stdout || '').trim().split(/\r?\n/)[0]?.trim() || '';
    if (!out) throw new Error('key command succeeded but printed nothing');
    return out;
  }

  return spec;
}

export function toQuestion(check) {
  const q = { type: check.type, instructions: check.instructions };
  if (check.criteria !== undefined) q.criteria = check.criteria;
  return q;
}

/**
 * Unwraps both standard `/v1/systemone` responses (`{ answers, model, usage }`)
 * and Cloudflare Workers AI envelopes (`{ result: { answers, model, usage }, success: true }`).
 */
export function unwrapSystemOne(raw) {
  if (raw && typeof raw === 'object' && raw.result && typeof raw.result === 'object' && raw.result.answers) {
    return raw.result;
  }
  return raw;
}

export async function ask(state, questions, { endpoint, model, apiKey, timeoutMs = 45000 }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ state, model, questions }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Classifier returned HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Classifier returned invalid JSON: ${text.slice(0, 200)}`);
  }
  const unwrapped = unwrapSystemOne(parsed);
  if (!unwrapped || typeof unwrapped.answers !== 'object') {
    throw new Error(`Classifier response missing "answers" field: ${text.slice(0, 200)}`);
  }
  return unwrapped;
}

export function averageAnswers(runs, questionIds) {
  const merged = {};
  for (const id of questionIds) {
    const answers = runs.map((r) => r[id]).filter(Boolean);
    const kind = answers[0].type;
    const out = { type: kind };

    if (kind === 'noul') {
      out.noul = answers.reduce((acc, a) => acc + a.noul, 0) / answers.length;
    } else {
      const keys = new Set();
      for (const a of answers) {
        for (const k of Object.keys(a.probabilities || {})) keys.add(k);
      }
      if (keys.size > 0) {
        out.probabilities = {};
        for (const k of keys) {
          out.probabilities[k] =
            answers.reduce((acc, a) => acc + ((a.probabilities || {})[k] ?? 0), 0) / answers.length;
        }
      }
      if (kind === 'choice') {
        if (out.probabilities && Object.keys(out.probabilities).length > 0) {
          out.choice = Object.entries(out.probabilities).sort((a, b) => b[1] - a[1])[0][0];
        } else {
          out.choice = answers[0].choice;
        }
      } else {
        out.score = answers.reduce((acc, a) => acc + a.score, 0) / answers.length;
        if (answers[0].legend) out.legend = answers[0].legend;
      }
    }
    out.confidence = answers.reduce((acc, a) => acc + (a.confidence ?? 0), 0) / answers.length;
    merged[id] = out;
  }
  return merged;
}

export async function askAveraged(state, questions, clientOpts, samples = 3) {
  const count = Math.max(1, samples);
  if (count === 1) {
    const r = await ask(state, questions, clientOpts);
    return r.answers;
  }
  const runs = [];
  for (let i = 0; i < count; i++) {
    const r = await ask(state, questions, clientOpts);
    runs.push(r.answers);
  }
  return averageAnswers(runs, Object.keys(questions));
}

export function verdict(check, answer) {
  const floor = check.min_confidence ?? 0.7;

  if (check.type === 'noul') {
    const p = answer.noul;
    const want = Boolean(check.expect);
    if (p >= floor) {
      return { verdict: want ? 'pass' : 'fail', probability: p, top: String(true), why: `read as true (${p.toFixed(2)})` };
    }
    if (p <= 1 - floor) {
      return { verdict: !want ? 'pass' : 'fail', probability: p, top: String(false), why: `read as false (${p.toFixed(2)})` };
    }
    return { verdict: 'abstain', probability: p, top: 'undecided', why: `${p.toFixed(2)} is inside the undecided band around ${floor}` };
  }

  if (check.type === 'choice' || check.type === 'score') {
    const probs = answer.probabilities || {};
    const hasProbs = Object.keys(probs).length > 0;
    const acceptable = new Set(Array.isArray(check.expect) ? check.expect : [check.expect]);
    const picked = check.type === 'choice' ? answer.choice : `score ${answer.score}`;

    if (!hasProbs) {
      const conf = answer.confidence ?? 0;
      const inSet =
        check.type === 'choice'
          ? acceptable.has(answer.choice)
          : answer.score >= check.expect[0] && answer.score <= check.expect[1];
      if (conf < floor) {
        return { verdict: 'abstain', probability: conf, top: picked, why: `${picked} at only ${conf.toFixed(2)}, no distribution` };
      }
      return { verdict: inSet ? 'pass' : 'fail', probability: conf, top: picked, why: picked };
    }

    let mass = 0;
    for (const [k, v] of Object.entries(probs)) {
      const ok =
        check.type === 'choice'
          ? acceptable.has(k)
          : Number(k) >= check.expect[0] && Number(k) <= check.expect[1];
      if (ok) mass += v;
    }

    // Also identify the highest-probability non-acceptable defect option when failing or abstaining
    const defectEntries = Object.entries(probs)
      .filter(([k]) => !acceptable.has(k))
      .sort((a, b) => b[1] - a[1]);
    const topDefect = defectEntries[0]?.[0] || picked;
    const topDefectProb = defectEntries[0]?.[1] ?? 1 - mass;

    if (mass >= floor) {
      return {
        verdict: 'pass',
        probability: mass,
        slopMass: 1 - mass,
        top: picked,
        topDefect,
        topDefectProb,
        why: `${picked} (${mass.toFixed(2)} on acceptable set)`,
      };
    }
    if (mass <= 1 - floor) {
      return {
        verdict: 'fail',
        probability: mass,
        slopMass: 1 - mass,
        top: topDefect,
        topDefect,
        topDefectProb,
        why: `${topDefect} (${topDefectProb.toFixed(2)}; ${(1 - mass).toFixed(2)} defect mass)`,
      };
    }
    return {
      verdict: 'abstain',
      probability: mass,
      slopMass: 1 - mass,
      top: picked,
      topDefect,
      topDefectProb,
      why: `${picked}; ${mass.toFixed(2)} acceptable mass is inside the undecided band`,
    };
  }

  throw new Error(`Unknown check type: ${check.type}`);
}

export function validateCalibrationCoverage(calData) {
  const checks = calData.checks || {};
  const coverage = new Map();
  for (const item of calData.items || []) {
    if (!checks[item.check]) {
      throw new Error(`Calibration item "${item.name}" references unknown check "${item.check}".`);
    }
    const set = coverage.get(item.check) || new Set();
    set.add(item.expect_verdict);
    coverage.set(item.check, set);
  }
  const missing = [];
  for (const id of Object.keys(checks)) {
    const set = coverage.get(id) || new Set();
    if (!set.has('pass') || !set.has('fail')) {
      missing.push(id);
    }
  }
  return missing;
}

export async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIdx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function calibrate(
  calData,
  clientOpts,
  { floor = 0.9, samples = 3, concurrency = 6, quiet = false } = {}
) {
  const missing = validateCalibrationCoverage(calData);
  if (missing.length > 0) {
    throw new Error(`Checks missing two-sided calibration (both pass and fail): ${missing.join(', ')}`);
  }

  const items = calData.items || [];
  if (!quiet) {
    console.error(`Calibrating against ${items.length} known passages (${clientOpts.model} @ ${clientOpts.endpoint})`);
  }

  let wrong = 0;
  let unsure = 0;

  const details = await mapConcurrent(items, concurrency, async (item) => {
    const check = calData.checks[item.check];
    const answers = await askAveraged(item.state, { [check.id]: toQuestion(check) }, clientOpts, samples);
    const res = verdict(check, answers[check.id]);
    const want = item.expect_verdict;
    return { name: item.name, check: item.check, want, got: res.verdict, why: res.why };
  });

  for (const d of details) {
    let label = 'ok    ';
    if (d.got === d.want) {
      label = 'ok    ';
    } else if (d.got === 'abstain') {
      label = 'unsure';
      unsure++;
    } else {
      label = 'WRONG ';
      wrong++;
    }
    if (!quiet) {
      console.error(`  ${label}  ${d.name.padEnd(54)} ${d.got.padEnd(7)} (${d.why})`);
    }
  }

  const accuracy = items.length > 0 ? 1 - wrong / items.length : 0;
  if (!quiet) {
    if (unsure > 0) {
      console.error(`\n  ${unsure} of ${items.length} undecided — cautious near threshold, not wrong`);
    }
    if (wrong > 0) {
      console.error(`\n  calibration accuracy ${(accuracy * 100).toFixed(0)}% (${wrong} of ${items.length} wrong)`);
    } else {
      console.error('Calibration passed (0 wrong)\n');
    }
  }

  return {
    passed: accuracy >= floor,
    accuracy,
    wrong,
    unsure,
    total: items.length,
    details,
  };
}

// ── Paragraph Extraction (HTML and Markdown) ──────────────────────────────────
const stripHtmlInline = (s) =>
  s
    .replace(/<(script|style|svg|code|pre|kbd|template)\b[\s\S]*?<\/\1>/gi, (m, tag) =>
      tag.toLowerCase() === 'code' || tag.toLowerCase() === 'kbd'
        ? m.replace(/<[^>]+>/g, '')
        : ' '
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

export function extractHtmlParagraphs(html, fileLabel = 'index.html', minWords = 8) {
  // Remove comments, script/style/pre/svg blocks, and the #changelog details block
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<(script|style|svg|pre|template)\b[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<details\b[^>]*\bid\s*=\s*["']?changelog["']?[^>]*>[\s\S]*?<\/details>/gi, (m) =>
      m.replace(/[^\n]/g, ' ')
    );

  const mainMatch = cleaned.match(/<main\b[\s\S]*?<\/main>/i) || cleaned.match(/<body\b[\s\S]*?<\/body>/i);
  const scopeHtml = mainMatch ? mainMatch[0] : cleaned;
  const baseOffset = mainMatch ? mainMatch.index : 0;

  const spans = [];
  for (const m of scopeHtml.matchAll(/<(p|li|dd|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = m[2] || '';
    if (/\b(?:doc-meta|eyebrow|evidence-label|evidence-value|artifact-order|matrix-note|kicker|caption|meta)\b/i.test(attrs)) {
      continue;
    }
    if (/\bdata-spec-version\b|\bdata-version\b/i.test(m[0])) {
      continue;
    }
    const text = stripHtmlInline(m[3]);
    if (wordCount(text) < minWords) continue;
    spans.push({
      file: fileLabel,
      line: lineOf(cleaned, baseOffset + m.index),
      tag: m[1].toLowerCase(),
      text,
    });
  }
  return spans;
}

export function extractMarkdownParagraphs(markdown, fileLabel = 'README.md', minWords = 8) {
  const lines = markdown.split(/\r?\n/);
  const spans = [];
  let inFrontmatter = false;
  let inFence = false;
  let fenceMarker = '';
  let buf = [];
  let startLine = 1;

  const flush = () => {
    if (buf.length === 0) return;
    const raw = buf
      .join(' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    buf = [];
    if (wordCount(raw) >= minWords) {
      spans.push({ file: fileLabel, line: startLine, tag: 'md', text: raw });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (i === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === '---' || trimmed === '...') inFrontmatter = false;
      continue;
    }

    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      flush();
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1][0];
      } else if (trimmed.startsWith(fenceMarker.repeat(3))) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }
    if (inFence) continue;

    // Skip headings, tables, HTML tags/comments, horizontal rules, and blank lines
    if (
      !trimmed ||
      /^#{1,6}\s/.test(trimmed) ||
      /^\|.*\|$/.test(trimmed) ||
      /^[-*_]{3,}$/.test(trimmed) ||
      /^<!--/.test(trimmed) ||
      /^>\s*\[!(?:NOTE|CAUTION|WARNING|IMPORTANT|TIP)\]/i.test(trimmed)
    ) {
      flush();
      continue;
    }

    // New list item or blockquote starts its own span if buffer is non-empty
    if (/^(?:[-*+]|\d+\.)\s+/.test(trimmed)) {
      flush();
      startLine = ln;
      buf.push(trimmed.replace(/^(?:[-*+]|\d+\.)\s+/, ''));
      continue;
    }

    if (buf.length === 0) startLine = ln;
    buf.push(trimmed.replace(/^>\s*/, ''));
  }
  flush();
  return spans;
}

export function collectTargetSpans(targetPath, minWords = 8) {
  const resolved = resolve(targetPath);
  if (!existsSync(resolved)) {
    throw new Error(`Target not found: ${resolved}`);
  }
  const st = statSync(resolved);
  const files = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'fixtures') {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (['.html', '.md'].includes(extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  };

  if (st.isFile()) files.push(resolved);
  else walk(resolved);

  const rootDir = st.isFile() ? dirname(resolved) : resolved;
  const allSpans = [];
  for (const f of files) {
    const rel = relative(rootDir, f) || basename(f);
    const content = readFileSync(f, 'utf8');
    if (f.toLowerCase().endsWith('.html')) {
      allSpans.push(...extractHtmlParagraphs(content, rel, minWords));
    } else if (f.toLowerCase().endsWith('.md')) {
      allSpans.push(...extractMarkdownParagraphs(content, rel, minWords));
    }
  }
  return allSpans;
}

export async function judgeParagraphs(spans, calData, clientOpts, samples = 3, concurrency = 6) {
  const check = calData.checks.style_defect;
  const remedies = check.remedies || {};

  return mapConcurrent(spans, concurrency, async (span) => {
    const answers = await askAveraged(span.text, { [check.id]: toQuestion(check) }, clientOpts, samples);
    const res = verdict(check, answers[check.id]);
    return {
      file: span.file,
      line: span.line,
      verdict: res.verdict,
      plainProbability: Number(res.probability.toFixed(3)),
      slopMass: Number((res.slopMass ?? 1 - res.probability).toFixed(3)),
      defect: res.verdict === 'pass' ? null : res.topDefect,
      defectProbability: Number((res.topDefectProb ?? 0).toFixed(3)),
      why: res.why,
      remedy: res.verdict === 'pass' ? null : remedies[res.topDefect] || 'Rewrite in plain, literal technical English.',
      text: span.text,
    };
  });
}

export async function verifyRewritePairs(pairs, calData, clientOpts, samples = 3, concurrency = 6) {
  const styleCheck = calData.checks.style_defect;
  const meaningCheck = calData.checks.meaning_preserved;
  const remedies = styleCheck.remedies || {};

  return mapConcurrent(pairs, concurrency, async (p, i) => {
    const id = p.id || (p.file && p.line ? `${p.file}:${p.line}` : `pair-${i + 1}`);
    const [styleAns, meaningAns] = await Promise.all([
      askAveraged(p.rewritten, { [styleCheck.id]: toQuestion(styleCheck) }, clientOpts, samples),
      askAveraged(
        `ORIGINAL:\n${p.original}\n\nREWRITTEN:\n${p.rewritten}`,
        { [meaningCheck.id]: toQuestion(meaningCheck) },
        clientOpts,
        samples
      ),
    ]);
    const styleRes = verdict(styleCheck, styleAns[styleCheck.id]);
    const meaningRes = verdict(meaningCheck, meaningAns[meaningCheck.id]);

    const overall =
      styleRes.verdict === 'fail' || meaningRes.verdict === 'fail'
        ? 'fail'
        : styleRes.verdict === 'abstain' || meaningRes.verdict === 'abstain'
        ? 'abstain'
        : 'pass';

    return {
      id,
      overall,
      styleVerdict: styleRes.verdict,
      styleDefect: styleRes.verdict === 'pass' ? null : styleRes.topDefect,
      styleWhy: styleRes.why,
      styleRemedy: styleRes.verdict === 'pass' ? null : remedies[styleRes.topDefect] || null,
      meaningVerdict: meaningRes.verdict,
      meaningTop: meaningRes.top,
      meaningWhy: meaningRes.why,
      original: p.original,
      rewritten: p.rewritten,
    };
  });
}

// ── CLI Entrypoint ────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  if (argv.some((a) => a === '--api-key' || a.startsWith('--api-key='))) {
    console.error(`error: --api-key is not accepted on the command line.\n${HOW_TO_SUPPLY_A_KEY}`);
    process.exit(2);
  }

  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const getOpt = (name) => {
    const idx = argv.indexOf(name);
    return idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--') ? argv[idx + 1] : null;
  };

  const calibrateOnly = flags.has('--calibrate-only');
  const skipCalibrate = flags.has('--skip-calibration');
  const strict = flags.has('--strict');
  const samples = Number(getOpt('--samples') || 3);
  const calibrationFloor = Number(getOpt('--calibration-floor') || 0.9);
  const calibrationPath = resolve(getOpt('--calibration') || DEFAULT_CALIBRATION_PATH);
  const verifyPairsPath = getOpt('--verify-pairs');
  const outPath = getOpt('--out');

  const optWithValues = new Set([
    '--samples',
    '--calibration-floor',
    '--calibration',
    '--verify-pairs',
    '--out',
    '--endpoint',
    '--model',
    '--backend',
    '--account-id',
  ]);
  const positional = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || !optWithValues.has(argv[i - 1])));
  const target = positional[0] || null;

  const { endpoint, model } = resolveEndpointAndModel({
    endpoint: getOpt('--endpoint'),
    model: getOpt('--model'),
    backend: getOpt('--backend'),
    accountId: getOpt('--account-id'),
  });

  const apiKey = loadKey(process.env, endpoint);
  if (apiKey === null) {
    console.error(`error: no API key found.\n${HOW_TO_SUPPLY_A_KEY}`);
    process.exit(1);
  }

  const calData = JSON.parse(readFileSync(calibrationPath, 'utf8'));
  const clientOpts = { endpoint, model, apiKey };

  if (!skipCalibrate || calibrateOnly) {
    const cal = await calibrate(calData, clientOpts, { floor: calibrationFloor, samples });
    if (!cal.passed) {
      console.error(
        `Calibration accuracy ${(cal.accuracy * 100).toFixed(0)}% is below the ${(calibrationFloor * 100).toFixed(
          0
        )}% floor — withholding prose judge output.`
      );
      process.exit(1);
    }
    if (calibrateOnly) process.exit(0);
  }

  if (verifyPairsPath) {
    const rawPairs = JSON.parse(readFileSync(resolve(verifyPairsPath), 'utf8'));
    const pairs = Array.isArray(rawPairs) ? rawPairs : rawPairs.pairs || [];
    const results = await verifyRewritePairs(pairs, calData, clientOpts, samples);
    if (outPath) {
      writeFileSync(resolve(outPath), JSON.stringify(results, null, 2));
    }
    const tally = { pass: 0, fail: 0, abstain: 0 };
    for (const r of results) {
      tally[r.overall]++;
      if (r.overall !== 'pass') {
        console.error(
          `  ${r.overall.toUpperCase().padEnd(7)} ${r.id} — style=${r.styleVerdict} (${r.styleWhy}), meaning=${r.meaningVerdict} (${r.meaningWhy})`
        );
      }
    }
    console.error(`\nRewrite verification: ${tally.pass} pass, ${tally.fail} fail, ${tally.abstain} abstain`);
    if (tally.fail > 0 || (strict && tally.abstain > 0)) process.exit(1);
    process.exit(0);
  }

  if (!target) {
    console.error('error: provide a target <file-or-dir>, --verify-pairs <file>, or --calibrate-only');
    process.exit(2);
  }

  const spans = collectTargetSpans(target);
  const results = await judgeParagraphs(spans, calData, clientOpts, samples);
  if (outPath) {
    writeFileSync(resolve(outPath), JSON.stringify(results, null, 2));
  }

  const tally = { pass: 0, fail: 0, abstain: 0 };
  for (const r of results) {
    tally[r.verdict]++;
    if (r.verdict !== 'pass') {
      console.error(`  ${r.verdict.toUpperCase().padEnd(7)} ${r.file}:${r.line} — ${r.why}`);
      console.error(`          "${r.text.slice(0, 110)}${r.text.length > 110 ? '…' : ''}"`);
      if (r.remedy) console.error(`          Fix: ${r.remedy}`);
    }
  }
  console.error(`\nProse check (${target}): ${tally.pass} pass, ${tally.fail} fail, ${tally.abstain} abstain`);
  if (tally.fail > 0 || (strict && tally.abstain > 0)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
