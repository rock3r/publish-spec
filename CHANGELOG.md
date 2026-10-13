# Changelog

Each version here becomes a GitHub release. When you bump the version in
`SKILL.md` and both plugin manifests, add a section for it. The release
workflow publishes the section as the release notes.

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
