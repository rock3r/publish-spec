#!/usr/bin/env node
/**
 * lint-spec.mjs — Portable static + headless-browser linter for static HTML specs.
 *
 * Zero npm dependencies required (uses Node built-ins + system Chrome/Chromium via CDP).
 *
 * Usage:
 *   node scripts/lint-spec.mjs <dir-or-html-or-url> [--screenshots <dir>] [--static-only] [--strict]
 */

import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, relative, extname, dirname, basename } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const getOpt = (name) => {
  const idx = argv.indexOf(name);
  return idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--') ? argv[idx + 1] : null;
};
const screenshotDir = getOpt('--screenshots');
const staticOnly = flags.has('--static-only');
const strictMode = flags.has('--strict');

const positional = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || argv[i - 1] !== '--screenshots'));
const target = positional[0] || '.';

const errors = [];
const warns = [];
const infos = [];

const err = (scope, msg) => errors.push(`[${scope}] ${msg}`);
const warn = (scope, msg) => (strictMode ? errors : warns).push(`[${scope}] ${msg}`);
const info = (scope, msg) => infos.push(`[${scope}] ${msg}`);

const stripTags = (s) =>
  s
    .replace(/<(script|style|svg|code|pre|kbd|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|mdash|ndash|rarr|larr|darr|uarr);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ── 1. Secret & Credential Fence ──────────────────────────────────────────────
const SECRET_PATTERNS = [
  { name: 'Anthropic API key', re: /\bsk-ant-[a-zA-Z0-9_-]{20,}/ },
  { name: 'OpenAI API key', re: /\bsk-(?:proj-)?[a-zA-Z0-9]{32,}/ },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { name: 'AWS Access Key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Cloudflare API token assignment', re: /\bCLOUDFLARE_API_TOKEN\s*=\s*["']?[A-Za-z0-9_-]{30,}/ },
];

// ── 2. Plain Technical English & Anti-Slop Replacements ───────────────────────
const SLOP_REPLACEMENTS = {
  utilize: 'use',
  utilizes: 'uses',
  utilizing: 'using',
  leverage: 'use',
  leverages: 'uses',
  leveraging: 'using',
  facilitate: 'help',
  facilitates: 'helps',
  'in order to': 'to',
  'prior to': 'before',
  subsequently: 'then',
  aforementioned: 'this',
  furthermore: 'also',
  additionally: 'also',
  'due to the fact that': 'because',
  'with respect to': 'about',
  delve: 'examine / cut',
  delves: 'examines / cut',
  tapestry: 'system / cut',
  realm: 'area / cut',
  transformative: 'state concrete change',
  pivotal: 'important / cut',
  testament: 'evidence / cut',
  seamless: 'smooth / state exact behavior',
  seamlessly: 'cleanly / state exact behavior',
  comprehensive: 'full / state exact scope',
  commence: 'start',
  terminate: 'stop',
  'serves as': 'is',
  'stands as': 'is',
  boasts: 'has',
};

const CANNED_PHRASES = [
  /in today['’]s rapidly evolving/i,
  /not only\b[\s\S]{1,80}\bbut also\b/i,
  /experts agree/i,
  /it is worth noting that/i,
  /it['’]s important to note/i,
  /needless to say/i,
  /,\s*(?:highlighting|underscoring|fostering|showcasing)\b/i,
];

// ── 3. Static HTML & CSS Linting ──────────────────────────────────────────────
function lintHtmlFile(filePath, rootDir) {
  const rel = relative(rootDir, filePath) || basename(filePath);
  const html = readFileSync(filePath, 'utf8');

  // Secret scan
  for (const pat of SECRET_PATTERNS) {
    if (pat.re.test(html)) {
      err(rel, `Potential secret leaked (${pat.name}). Remove before deploying.`);
    }
  }

  // Viewport meta check
  if (!/<meta\b[^>]*name=["']?viewport["']?[^>]*content=["'][^"']*width=device-width/i.test(html)) {
    err(rel, 'Missing <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile rendering.');
  }

  // Title & H1 check
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1Match) {
    warn(rel, 'Missing <h1> display title.');
  } else {
    const h1Text = stripTags(h1Match[1]);
    const h1Words = wordCount(h1Text);
    if (h1Words > 10) {
      warn(rel, `<h1> is ${h1Words} words ("${h1Text.slice(0, 50)}…") — keep display titles to 3–8 words.`);
    }
  }

  // Extract body main content
  const mainMatch = html.match(/<main\b[\s\S]*?<\/main>/i) || html.match(/<body\b[\s\S]*?<\/body>/i);
  const mainHtml = mainMatch ? mainMatch[0] : html;

  // Exhibits count (figures, tables, pre blocks, svgs, videos, mockups, interactive diagrams)
  const exhibitMatches =
    mainHtml.match(/<(?:figure|table|pre|svg|video|canvas|doc-mock|doc-machine|doc-calls|doc-schema|doc-code)\b/gi) || [];
  const exhibitCount = exhibitMatches.length;

  // Paragraph rhythm & word budgets
  let totalProseWords = 0;
  let longParagraphs = 0;
  let denseSentences = 0;
  let longestParaWords = 0;

  for (const m of mainHtml.matchAll(/<(p|dd)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = m[2] || '';
    if (/\b(?:eyebrow|evidence-label|evidence-value|artifact-order|matrix-note|kicker|caption|meta)\b/i.test(attrs)) {
      continue;
    }
    const text = stripTags(m[3]);
    if (!text) continue;
    const wc = wordCount(text);
    totalProseWords += wc;
    if (wc > 55) {
      longParagraphs++;
      longestParaWords = Math.max(longestParaWords, wc);
      const ln = lineOf(html, m.index);
      warn(rel, `Line ${ln}: paragraph is ${wc} words (target ≤ 50). Split it or replace prose with an exhibit/table.`);
    }
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
    if (sentences.length > 5) {
      const ln = lineOf(html, m.index);
      warn(rel, `Line ${ln}: paragraph has ${sentences.length} sentences (target ≤ 5). Focus each paragraph on one idea.`);
    }
    for (const s of sentences) {
      const swc = wordCount(s);
      if (swc > 32) {
        denseSentences++;
      }
    }
  }

  if (denseSentences > 0) {
    warn(rel, `${denseSentences} sentence(s) exceed 32 words — split compound claims into shorter, direct sentences.`);
  }

  if (totalProseWords > 350 && exhibitCount === 0) {
    warn(rel, `${totalProseWords} words of prose with 0 exhibits (<figure>, <pre>, <table>, <svg>). Add diagrams, mockups, or code slices.`);
  } else if (totalProseWords > 400 && exhibitCount > 0 && totalProseWords / exhibitCount > 75) {
    warn(
      rel,
      `High prose-to-exhibit ratio (${totalProseWords} prose words across ${exhibitCount} exhibit(s), ~${Math.round(
        totalProseWords / exhibitCount
      )} words/exhibit; target ≤ 50–60). Break up walls of text.`
    );
  }

  // Check for 4+ consecutive <p> tags without structural/visual breaks
  const tagSequence = [...mainHtml.matchAll(/<\/?(p|h1|h2|h3|h4|figure|pre|table|ul|ol|dl|svg|section|div)\b/gi)];
  let consecutiveP = 0;
  for (const t of tagSequence) {
    const raw = t[0].toLowerCase();
    const tag = t[1].toLowerCase();
    if (raw === '<p') {
      consecutiveP++;
      if (consecutiveP === 4) {
        const ln = lineOf(html, t.index);
        warn(rel, `Line ${ln}: 4+ consecutive <p> paragraphs without a heading, list, code block, or visual aid.`);
      }
    } else if (raw.startsWith('<') && !raw.startsWith('</') && tag !== 'p') {
      consecutiveP = 0;
    }
  }

  // Plain Technical English & Anti-Slop scan
  const bareProse = stripTags(mainHtml);
  const lowerProse = bareProse.toLowerCase();
  const slopHits = [];
  for (const [bad, good] of Object.entries(SLOP_REPLACEMENTS)) {
    const re = new RegExp(`\\b${bad.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(lowerProse)) {
      slopHits.push(`"${bad}" → "${good}"`);
    }
  }
  if (slopHits.length > 0) {
    warn(rel, `Plain Technical English replacements suggested: ${slopHits.slice(0, 8).join(', ')}${slopHits.length > 8 ? '…' : ''}`);
  }

  for (const pat of CANNED_PHRASES) {
    const m = bareProse.match(pat);
    if (m) {
      warn(rel, `Formulaic rhetoric detected ("${m[0].slice(0, 45)}…") — rewrite directly.`);
    }
  }

  const passiveHits = [
    ...new Set(
      lowerProse.match(
        /\b(?:is|are|was|were|be|been)\s+(?:\w+ed|written|sent|made|done|shown|taken|given|kept|held|read|run|set|put|built|chosen)\s+by\b/g
      ) || []
    ),
  ];
  if (passiveHits.length > 2) {
    warn(rel, `Passive voice constructions (${passiveHits.slice(0, 4).map((x) => `"${x}"`).join(', ')}) — prefer active voice naming the actor first.`);
  }

  // Code block & diff hygiene
  for (const m of mainHtml.matchAll(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi)) {
    const ln = lineOf(html, m.index);
    const before = mainHtml.slice(Math.max(0, m.index - 250), m.index);
    const inDetails = /<details\b[^>]*>(?:(?!<\/details>)[\s\S])*$/i.test(before);
    const codeText = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    const lines = codeText.split('\n');
    if (lines.length > 45 && !inDetails) {
      warn(rel, `Line ${ln}: <pre> block is ${lines.length} lines uncollapsed (target ≤ 30–40). Slice to the key lines or wrap in <details>.`);
    }
    const longLines = lines.filter((l) => l.length > 100).length;
    if (longLines >= 3) {
      warn(rel, `Line ${ln}: <pre> block has ${longLines} lines over 100 chars — reflow so mobile readers do not have to scroll far horizontally.`);
    }
    // Check diff hunks for "..." elision inside hunks
    if (lines.some((l) => /^@@ -\d+/.test(l))) {
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*(?:\.\.\.|…)\s*$/.test(lines[i])) {
          err(rel, `Line ${ln}: diff block contains "${lines[i].trim()}" elision inside a hunk (line ${i + 1}) — split into separate @@ hunks instead.`);
        }
      }
    }
  }

  // Accessibility & caption checks on images and SVGs
  for (const m of mainHtml.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1] || '';
    if (!/\balt\s*=/i.test(attrs)) {
      err(rel, `Line ${lineOf(html, m.index)}: <img> missing alt="" attribute.`);
    }
  }
  for (const m of mainHtml.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi)) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const isDecorative = /\baria-hidden\s*=\s*["']true["']/i.test(attrs);
    const hasLabel = /\baria-label(?:ledby)?\s*=/i.test(attrs) || /<title\b/i.test(inner);
    if (!isDecorative && !hasLabel) {
      warn(rel, `Line ${lineOf(html, m.index)}: <svg> has neither aria-label/title nor aria-hidden="true".`);
    }
  }
}

function lintCssContent(css, label) {
  // Check for house-style root tokens if this is the main stylesheet
  if (/:root\b/.test(css)) {
    const requiredTokens = ['--paper', '--ink', '--ink-soft', '--line', '--accent', '--code-bg'];
    const missing = requiredTokens.filter((t) => !css.includes(t));
    if (missing.length > 0) {
      warn(label, `Missing house-style :root token(s): ${missing.join(', ')}`);
    }
    if (!/prefers-color-scheme:\s*dark/i.test(css)) {
      warn(label, 'Missing @media (prefers-color-scheme: dark) token overrides.');
    }
  }

  // Check multi-column grids vs responsive media queries
  const multiColGrids = [...css.matchAll(/grid-template-columns\s*:\s*([^;}{]+);/gi)].filter(
    (m) => !/^\s*(?:1fr|minmax\(0,\s*1fr\)|none|subgrid)\s*$/i.test(m[1].trim())
  );
  if (multiColGrids.length > 0) {
    const has900 = /@media\s*\([^{]*max-width:\s*900px/i.test(css);
    const has680 = /@media\s*\([^{]*max-width:\s*(?:680|640|720)px/i.test(css);
    if (!has900 || !has680) {
      err(
        label,
        `Defines ${multiColGrids.length} multi-column grid(s) but is missing ${
          !has900 && !has680
            ? '@media (max-width: 900px) and @media (max-width: 680px)'
            : !has900
            ? '@media (max-width: 900px)'
            : '@media (max-width: 680px)'
        } responsive collapse rules.`
      );
    }
  }

  // Check transitions/animations vs prefers-reduced-motion
  if (/(?:animation|transition)\s*:/i.test(css) && !/prefers-reduced-motion:\s*reduce/i.test(css)) {
    warn(label, 'Uses CSS transitions/animations without @media (prefers-reduced-motion: reduce).');
  }

  // Check banned AI-slop design patterns
  if (/backdrop-filter\s*:\s*blur/i.test(css)) {
    warn(label, 'Uses backdrop-filter: blur (glassmorphism is banned by house style).');
  }
}

// ── 4. Static Asset Server for Local Directories / HTML Files ─────────────────
function findAssetRoot(targetPath) {
  const st = statSync(targetPath);
  if (st.isFile()) return dirname(targetPath);
  // Check wrangler configs for assets.directory / bucket / public
  for (const cfg of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
    const p = join(targetPath, cfg);
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf8');
      const m =
        raw.match(/"directory"\s*:\s*"([^"]+)"/) ||
        raw.match(/directory\s*=\s*"([^"]+)"/) ||
        raw.match(/bucket\s*=\s*"([^"]+)"/);
      if (m) {
        const candidate = resolve(targetPath, m[1]);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  for (const sub of ['public', 'site', 'dist', 'assets', 'www']) {
    const candidate = join(targetPath, sub);
    if (existsSync(candidate) && existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return targetPath;
}

function collectFiles(dir, extList, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, extList, out);
    } else if (extList.includes(extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};

function startStaticServer(rootDir) {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = resolve(rootDir, '.' + urlPath);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
      if (!existsSync(filePath) && !extname(filePath) && existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      }
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

// ── 5. Zero-Dependency Headless Browser Driver (CDP over native WebSocket) ────
function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function launchCdpBrowser(chromeBin) {
  const userDataDir = join(tmpdir(), `lint-spec-chrome-${process.pid}-${Date.now()}`);
  mkdirSync(userDataDir, { recursive: true });
  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  const wsUrl = await new Promise((resolvePromise, reject) => {
    let stderrBuf = '';
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Chrome DevTools listening URL')), 10000);
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolvePromise(m[1]);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited early with code ${code}: ${stderrBuf}`));
    });
  });

  const httpBase = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
  const listRes = await fetch(`${httpBase}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const eventWaiters = new Map();

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
      else res(msg.result);
    } else if (msg.method && eventWaiters.has(msg.method)) {
      const listeners = eventWaiters.get(msg.method);
      eventWaiters.delete(msg.method);
      for (const fn of listeners) fn(msg.params);
    }
  });

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const waitForEvent = (method, timeoutMs = 8000) =>
    new Promise((res) => {
      const timer = setTimeout(() => res(null), timeoutMs);
      const list = eventWaiters.get(method) || [];
      list.push((params) => {
        clearTimeout(timer);
        res(params);
      });
      eventWaiters.set(method, list);
    });

  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');

  return {
    send,
    waitForEvent,
    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill('SIGTERM');
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

// ── 6. In-Page DOM / Responsive / Diagram Audit Script ────────────────────────
const IN_PAGE_AUDIT_SCRIPT = `(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw <= 680;
  const isNarrow = vw <= 900;
  const findings = { errors: [], warns: [] };

  const selOf = (el) => {
    if (!el || el.nodeType !== 1) return 'unknown';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    return tag + id + cls;
  };

  const isVisible = (el) => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const hasScrollableAncestor = (el) => {
    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const st = getComputedStyle(cur);
      if (st.overflowX === 'auto' || st.overflowX === 'scroll' || st.overflowX === 'clip' || st.overflowX === 'hidden') {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  };

  // 1. Page-level horizontal overflow check
  const docScrollWidth = document.documentElement.scrollWidth;
  if (docScrollWidth > vw + 1) {
    const culprits = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 2 && !hasScrollableAncestor(el)) {
        culprits.push(selOf(el) + ' (right=' + Math.round(r.right) + 'px > ' + vw + 'px)');
      }
    }
    findings.errors.push(
      'Horizontal page overflow at ' + vw + 'px viewport (scrollWidth=' + docScrollWidth + 'px). Offending elements: ' +
      (culprits.slice(0, 5).join(', ') || 'body/root')
    );
  }

  // 2. Crushed prose columns check (<p>, <li>, <dd>, <td>)
  const crushed = [];
  for (const el of document.querySelectorAll('main p, main li, main dd')) {
    if (!isVisible(el)) continue;
    if (el.closest('svg, pre, code, table, .proof-matrix, .matrix-scroll')) continue;
    const text = (el.innerText || '').trim();
    if (text.length < 35) continue;
    const r = el.getBoundingClientRect();
    const minAllowed = isMobile ? 180 : 200;
    if (r.width < minAllowed) {
      crushed.push(selOf(el) + ' (' + Math.round(r.width) + 'px wide)');
    }
  }
  if (crushed.length > 0) {
    findings.errors.push(
      'Crushed text column(s) at ' + vw + 'px viewport: ' + crushed.slice(0, 4).join(', ') +
      '. Collapse multi-column grids to 1fr on narrow/mobile viewports.'
    );
  }

  // 3. Uncollapsed multi-column grids on mobile (375px)
  if (isMobile) {
    for (const el of document.querySelectorAll('main *')) {
      if (!isVisible(el)) continue;
      if (el.closest('svg, table, pre, .matrix-scroll, .diagram-scroll')) continue;
      const st = getComputedStyle(el);
      if (st.display === 'grid') {
        const children = [...el.children].filter(isVisible);
        if (children.length >= 2) {
          // Check if 2+ children containing substantial prose sit on the same row
          const rows = new Map();
          for (const c of children) {
            const cr = c.getBoundingClientRect();
            const rowKey = Math.round(cr.top / 12);
            const list = rows.get(rowKey) || [];
            list.push({ el: c, r: cr });
            rows.set(rowKey, list);
          }
          for (const [, rowItems] of rows) {
            if (rowItems.length >= 2) {
              const hasProse = rowItems.some((item) => (item.el.innerText || '').trim().length > 60 && item.r.width < 175);
              if (hasProse) {
                findings.errors.push(
                  'Uncollapsed multi-column grid at mobile ' + vw + 'px: ' + selOf(el) +
                  ' renders ' + rowItems.length + ' cramped columns side-by-side. Stack to grid-template-columns: 1fr under @media (max-width: 680px).'
                );
                break;
              }
            }
          }
        }
      }
    }
  }

  // 4. SVG & Diagram legibility and clipping check
  for (const svg of document.querySelectorAll('main svg')) {
    if (!isVisible(svg)) continue;
    const r = svg.getBoundingClientRect();
    if (r.width < 48 && r.height < 48) continue; // skip small icons

    // Check rendered height of <text> labels inside diagram SVGs
    const texts = [...svg.querySelectorAll('text')].filter((t) => (t.textContent || '').trim().length > 0);
    if (texts.length > 0) {
      let minTextHeight = Infinity;
      let sampleText = '';
      for (const t of texts) {
        const tr = t.getBoundingClientRect();
        if (tr.height > 0 && tr.height < minTextHeight) {
          minTextHeight = tr.height;
          sampleText = (t.textContent || '').trim().slice(0, 20);
        }
      }
      if (minTextHeight < 9.0) {
        findings.errors.push(
          'Illegible SVG diagram text at ' + vw + 'px viewport: ' + selOf(svg) +
          ' shrinks text ("' + sampleText + '") to ' + minTextHeight.toFixed(1) +
          'px tall (minimum 9.5px). Reflow diagram vertically for mobile or place inside a scrollable .diagram-scroll container with readable min-width.'
        );
      } else if (minTextHeight < 10.5) {
        findings.warns.push(
          'Small SVG diagram text at ' + vw + 'px viewport: ' + selOf(svg) +
          ' renders text at ' + minTextHeight.toFixed(1) + 'px tall.'
        );
      }
    }
  }

  // 5. Interactive diagram / stepper controls check on mobile
  const controls = [...document.querySelectorAll('main button, main [role="tab"], main [data-state], main [data-step]')].filter(isVisible);
  for (const ctrl of controls) {
    const r = ctrl.getBoundingClientRect();
    if (r.right > vw + 2 && !hasScrollableAncestor(ctrl)) {
      findings.errors.push(
        'Interactive control ' + selOf(ctrl) + ' overflows viewport at ' + vw + 'px (right=' + Math.round(r.right) + 'px).'
      );
    }
    if (isMobile && ctrl.tagName === 'BUTTON' && !ctrl.classList.contains('copy-button') && r.height < 28) {
      findings.warns.push(
        'Small touch target on mobile (' + Math.round(r.height) + 'px tall): ' + selOf(ctrl) + ' (aim for >= 36px).'
      );
    }
  }

  return findings;
})()`;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'narrow', width: 768, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

async function runBrowserAudit(urls, outScreenshotDir) {
  const chromeBin = findChromeBinary();
  if (!chromeBin) {
    warn('browser', 'No local Chrome/Chromium binary found for headless viewport verification.');
    return;
  }

  if (outScreenshotDir) {
    mkdirSync(outScreenshotDir, { recursive: true });
  }

  const cdp = await launchCdpBrowser(chromeBin);
  try {
    for (const { url, label } of urls) {
      for (const vp of VIEWPORTS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: vp.name === 'mobile' ? 2 : 1,
          mobile: false,
        });

        const loadPromise = cdp.waitForEvent('Page.loadEventFired', 8000);
        await cdp.send('Page.navigate', { url });
        await loadPromise;
        // Allow web fonts / layout / Mermaid / scripts to settle
        await new Promise((r) => setTimeout(r, 250));

        const evalRes = await cdp.send('Runtime.evaluate', {
          expression: IN_PAGE_AUDIT_SCRIPT,
          returnByValue: true,
        });

        const audit = evalRes?.result?.value;
        const scope = `${label} @ ${vp.name} (${vp.width}px)`;
        if (audit) {
          for (const e of audit.errors || []) err(scope, e);
          for (const w of audit.warns || []) warn(scope, w);
        }

        // On mobile (375px), also click interactive diagram/state controls to ensure states don't break mobile layout
        if (vp.name === 'mobile') {
          const stepRes = await cdp.send('Runtime.evaluate', {
            expression: `(() => {
              const btns = [...document.querySelectorAll('main [data-state], main [data-step], main [role="tab"]')];
              const issues = [];
              for (const b of btns.slice(0, 8)) {
                try {
                  b.click();
                  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
                    issues.push((b.getAttribute('data-state') || b.getAttribute('data-step') || b.innerText || 'control').trim().slice(0, 24));
                  }
                } catch {}
              }
              return issues;
            })()`,
            returnByValue: true,
          });
          const stepIssues = stepRes?.result?.value || [];
          if (stepIssues.length > 0) {
            err(scope, `Activating interactive state/step control(s) [${stepIssues.join(', ')}] caused horizontal page overflow at 375px.`);
          }
        }

        if (outScreenshotDir && (vp.name === 'desktop' || vp.name === 'mobile')) {
          const metrics = await cdp.send('Page.getLayoutMetrics');
          const contentHeight = Math.min(Math.ceil(metrics?.cssContentSize?.height || vp.height), 4000);
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: vp.width,
            height: contentHeight,
            deviceScaleFactor: vp.name === 'mobile' ? 2 : 1,
            mobile: false,
          });
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          if (shot?.data) {
            const safeName = label.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_|_$/g, '') || 'index';
            const shotPath = join(outScreenshotDir, `${safeName}-${vp.name}-${vp.width}px.png`);
            writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
            info('screenshot', `Saved ${shotPath}`);
          }
        }
      }
    }
  } finally {
    await cdp.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const isUrl = /^https?:\/\//i.test(target);

  if (isUrl) {
    info('target', `Auditing live URL: ${target}`);
    if (!staticOnly) {
      await runBrowserAudit([{ url: target, label: target }], screenshotDir);
    }
  } else {
    const resolved = resolve(target);
    if (!existsSync(resolved)) {
      console.error(`Target not found: ${resolved}`);
      process.exit(2);
    }
    const assetRoot = findAssetRoot(resolved);
    const htmlFiles = statSync(resolved).isFile()
      ? [resolved]
      : collectFiles(assetRoot, ['.html']);
    const cssFiles = statSync(resolved).isFile()
      ? collectFiles(assetRoot, ['.css'])
      : collectFiles(assetRoot, ['.css']);

    if (htmlFiles.length === 0) {
      err('target', `No .html files found under ${assetRoot}`);
    }

    for (const f of htmlFiles) {
      lintHtmlFile(f, assetRoot);
      // Also lint inline <style> blocks
      const html = readFileSync(f, 'utf8');
      const inlineStyles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
      if (inlineStyles.trim()) {
        lintCssContent(inlineStyles, `${relative(assetRoot, f) || basename(f)} <style>`);
      }
    }

    for (const c of cssFiles) {
      const rel = relative(assetRoot, c) || basename(c);
      const css = readFileSync(c, 'utf8');
      for (const pat of SECRET_PATTERNS) {
        if (pat.re.test(css)) err(rel, `Potential secret leaked (${pat.name}).`);
      }
      lintCssContent(css, rel);
    }

    if (!staticOnly && htmlFiles.length > 0) {
      const { server, baseUrl } = await startStaticServer(assetRoot);
      try {
        const urls = htmlFiles.map((f) => {
          const rel = relative(assetRoot, f).replace(/\\/g, '/');
          const urlPath = rel === 'index.html' ? '/' : '/' + rel;
          return { url: `${baseUrl}${urlPath}`, label: rel };
        });
        await runBrowserAudit(urls, screenshotDir);
      } finally {
        server.close();
      }
    }
  }

  // Print report
  console.log(`\nSpec Lint Report (${target})`);
  for (const i of infos) console.log(`  · ${i}`);
  for (const w of warns) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);

  if (errors.length > 0) {
    console.log(`\n✗ ${errors.length} error(s), ${warns.length} warning(s) — fix layout/spec errors before deploying.`);
    process.exit(1);
  }
  console.log(`\n✓ Spec lint passed (${warns.length} warning${warns.length === 1 ? '' : 's'}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
