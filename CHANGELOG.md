# Changelog

Each version here becomes a GitHub release. When you bump the version in
`SKILL.md` and both plugin manifests, add a section for it. The release
workflow publishes the section as the release notes.

## 1.3.3

- Added rules from the full-repository guide sweep to `references/house-style.md`
  and `scripts/lint-spec.mjs`: check every guide, skill, and gateway-backed spec
  site in a tree rather than only patching quoted audit examples; avoid
  theatrical rule/heading slogans (`"Creative North Star"`, `"It Has One Job"`,
  `"The Graphite Recedes Rule"`); keep fenced code blocks byte-identical during
  prose passes; preserve intentionality markers (`deliberately`, `by design`) on
  omissions; and update cross-references when renaming section/stage labels.
- Expanded `references/prose-calibration.json` to 50 anonymized two-sided
  calibration items.

## 1.3.2

- Added rules for privacy/retention timers, relay-vs.-E2EE chat disclosures,
  export-vs.-deletion cascade boundaries, and source-available vs. open-source
  license classifications to `references/house-style.md` and
  `scripts/lint-spec.mjs` (`"leaves no trace"`).
- Expanded `references/prose-calibration.json` to 44 anonymized two-sided
  calibration items covering chat relay boundaries, `"leaves no trace"`
  privacy puffery, and export-scope vs. deletion-cascade rewrites.

## 1.3.1

- Added in-app copy, CLI help, design-surface metaphor, and privacy/license
  rewrite rules from the second audit batch to `references/house-style.md` and
  `scripts/lint-spec.mjs` (including design-roll/seed residue checks and
  `"this is not a coincidence"` / `"the converse is also true"` rhetoric checks).
- Expanded `references/prose-calibration.json` from 30 to 40 anonymized
  two-sided calibration items covering UI settings, beat/accuracy caveats,
  material metaphors, coy feature riddles, retention disclosures, and
  distribution-triggered license conditions.

## 1.3.0

- The house style and `lint-spec.mjs` now cover epigrammatic AI prose alongside
  corporate filler: formulaic `"is not X, it is Y"` antithesis, fortune-cookie
  slogans, telegraphic verbless fragments, personified UI controls, coy unnamed
  actors (`"one skill… the others"`), session/debugging war stories, and
  truth-vouching asides (`"that is not a hypothetical"`).
- The style guide now requires stating what a system or repository provides
  before listing what is out of scope, naming concrete tools in place, and
  verifying that prose rewrites preserve every threshold, inheritance default,
  tool boundary, and security caveat.
- Added `scripts/judge-prose.mjs` and `references/prose-calibration.json` (30
  two-sided calibration items drawn from multi-repo rewrites) to classify
  paragraph-level style defects and verify that rewritten passages preserve
  technical meaning across TypeSafe Jev (`jev-1.14.0`), Cloudflare Workers AI
  (`clef-flash` / `clef`), and local `/v1/systemone` servers.

## 1.2.1

- The version check no longer loses the page when a script, style, or quoted
  value contains `<!--` or `<![CDATA[`. Comments and CDATA are skipped only in
  markup, where the browser treats them as comments.
- The check also warns when the changelog repeats a version, lists versions
  out of order, or is never closed. An unclosed changelog used to swallow the
  rest of the page.
- Browser-recovered comment forms (`<!-->`, `<!--->`, `--!>`) and an unclosed
  `<![CDATA[` in HTML content no longer stop the check.
- The house style now says that a single file you lint directly counts as an
  entry page, which is how the linter already behaved.
- When a deployed URL fails to load, the browser audit is skipped for it.

## 1.2.0

- Every published spec now has a version and a changelog. The header marks the
  version with `data-spec-version`, and a collapsed block with
  `id="changelog"` lists one `data-version` entry per version, newest first.
- The house style explains when to bump the version. `MAJOR` is for a changed
  decision, requirement, guarantee, or behavior. `MINOR` is for an added or
  clarified section. `PATCH` is for wording and typo fixes. Every publish that
  changes the page gets a new version.
- `lint-spec.mjs` warns when an entry page (each `index.html`, or a deployed
  URL) has no version, when a page declares it more than once, when the version is not `MAJOR.MINOR` or
  `MAJOR.MINOR.PATCH`, or when the newest entry inside `#changelog` does not
  match it. Markup examples in code blocks and comments do not count.
- When a catalog records versions, the skill registers the same version and
  changelog lines that the page shows.

## 1.1.0

- Specs now get a design pass with the latest [Impeccable](https://impeccable.style)
  version before they are published or called final. The pass refines the page
  and keeps its copy and structure. The house style wins when the two conflict.
  Every deploy flow and the review checklist require it.
- `lint-spec.mjs` reports text left over from AI generation. Citation debris
  (`oaicite`, `contentReference`) and unfilled placeholders (`[Your Name]`,
  `XX%`) are errors. A bare `[1]` marker in prose is a warning.
- The house style adds three writing tests: the portability test, no invented
  specifics, and no asides that tell the reader how to read the text.
- CI runs the linter against fixture pages, checks that the version matches in
  `SKILL.md` and both plugin manifests, and lints the Markdown with rumdl.

## 1.0.0

- First release. The skill authors, validates, and optionally publishes static
  HTML specs, PRDs, and technical walkthroughs. It includes the house style, the
  `lint-spec.mjs` linter with desktop, narrow, and mobile layout checks, and a
  pluggable deploy step.
