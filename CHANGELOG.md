# Changelog

Each version here becomes a GitHub release. When you bump the version in
`SKILL.md` and both plugin manifests, add a section for it. The release
workflow publishes the section as the release notes.

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
