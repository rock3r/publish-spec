---
name: publish-spec
description: Author, validate, and optionally publish a static HTML design spec, PRD, review site, or technical walkthrough with behavior-first structure, clear exhibits, and verified desktop/mobile layouts.
license: Apache-2.0
metadata:
  version: "1.3.2"
  author: "Sebastiano Poggi"
---

# Publish Spec

Use this skill to author, revise, validate, and publish static HTML design specs, PRDs, architecture walkthroughs, and review sites.

## House Style

For every new spec or substantive spec revision, read [references/house-style.md](references/house-style.md) completely before editing.

The house style is a system, not one fixed page template:

- **Structure (`Why › What › How › Where`):** Preserve the source document's information architecture. Organize top-level sections by observable behavior or guarantee. Do not split them by file or layer. Start with a concise executive summary. Include verbatim `Why` provenance quotes when applicable. Lead each section with a falsifiable claim sentence paired with one primary exhibit. Place open decisions directly under the exhibit they affect, with a pre-selected `Suggested` default. End change specs with an explicit `Not changing` (`Scope`) block.
- **Rhythm and Plain Technical English:** Keep sentences complete, direct, active, and concise ($\le 25\text{–}30$ words) and paragraphs focused ($\le 50$ words, $\le 5$ sentences). Name concrete actors in place, use unambiguous `must` and `can` in requirements, avoid both corporate/LLM filler (`utilize`, `leverage`, `facilitate`, `prior to`, `in order to`, `comprehensive`, `seamless`) and epigrammatic "smart-guy" slop (repeated `"not X, it is Y"` antithesis, aphorisms, telegraphic fragments, anthropomorphism, and truth-vouching asides), and never write more than 3 consecutive paragraphs without a structural break or visual aid.
- **Exhibits, mockups, and diagrams:** Draw the smallest UI mockup crop (`max-width: 480px`) that proves the point rather than full-window chrome, use numbered pins for callouts, write schemas in the project's native language, keep code slices to `10–30` lines (`sketch` for unbuilt code, real `@@` hunk headers without `...` elisions for diffs), and make diagrams interactive or animated only when state/branching/timing is clearer that way.
- **Mandatory mobile and narrow-window support (`1280px`, `768px`, `375px`):** Every multi-column grid, table, code block, and static/interactive/animated diagram must work at `768px` (`<= 900px`) and `375px` (`<= 680px`) with zero horizontal page overflow, no crushed text columns, and no microscopic SVG text (`>= 10px` rendered height). Reflow horizontal flows vertically on mobile (`↓`) or place wide 2D diagrams/matrices inside `.diagram-scroll` / `.matrix-scroll` (`overflow-x: auto; max-width: 100%; contain: inline-size`) with interactive controls kept outside the horizontal scroll area.

## Workflow

1. **Inspect the target spec:**
   - Identify the target directory or HTML entry page(s) from the current task. Read every served entry page and stylesheet before editing.
   - Treat an existing dirty source tree as user-owned. Inspect before changing it and preserve unrelated files.

2. **Author or revise the spec:**
   - Apply the structural, editorial, visual, and responsive rules from [references/house-style.md](references/house-style.md).
   - Set the version and add a changelog entry before every publish, following "Version and changelog" in [references/house-style.md](references/house-style.md). A revision that changes the page always gets a new version.
   - Keep the first screen legible, put the summary before long detail, ensure every visual aid and diagram works at mobile (`375px`), narrow (`768px`), and desktop (`1280px`) widths, and remove formulaic writing and design using "Avoid formulaic AI output" in [references/house-style.md](references/house-style.md). When revising or condensing existing text, verify that every threshold, inheritance default, tool boundary, and caveat still holds. Do not score the page with an AI-authorship detector, and do not ask whether it sounds human.

3. **Run an Impeccable design pass with the latest version:**
   - Update Impeccable to the latest published version first, from the spec directory:

     ```bash
     npx impeccable@latest update
     ```

   - Load the `impeccable` skill and run its Setup with the spec entry page as `--target`. If its context output still reports `UPDATE_AVAILABLE`, the update did not apply. Fix that before you continue. Do not run the pass on an old version.
   - Run `/impeccable polish <entry page>` on every served entry page. A spec is a **Read** surface, and this pass is a refinement, not a redesign.
   - Keep the spec's copy, section order, claims, and exhibits. When an Impeccable suggestion conflicts with [references/house-style.md](references/house-style.md), the house style wins.
   - Do this pass before every publish and before you call an HTML spec final, including revisions.

4. **Run automated static + headless-browser validation (and optional calibrated prose check):**
   - Run the bundled linter from the spec directory before finishing or deploying:

     ```bash
     node <skill-dir>/scripts/lint-spec.mjs . --screenshots /tmp/spec-shots
     ```

   - `lint-spec.mjs` checks prose rhythm, vocabulary, diff/code hygiene, secret leaks, CSS media queries, and launches headless Chrome at `1280px`, `768px`, and `375px` (including clicking interactive diagram/state controls on mobile) to catch horizontal overflow, uncollapsed grids, crushed text columns, and illegible SVG text.
   - Fix every reported error, address warnings, and visually inspect the generated desktop (`1280px`) and mobile (`375px`) screenshots in `/tmp/spec-shots`.
   - When a System One decision-model endpoint is configured (TypeSafe Jev `jev-1.14.0`, Cloudflare Workers AI `@cf/cloudflare/clef-flash` / `clef`, or a local `/v1/systemone` server such as `mlx-community/clef-flash-4bit`), you can also run `node <skill-dir>/scripts/judge-prose.mjs .` to classify each paragraph against the calibrated defect categories in [references/prose-calibration.json](references/prose-calibration.json) and `node <skill-dir>/scripts/judge-prose.mjs --verify-pairs <pairs.json>` to confirm that rewritten paragraphs preserve all original rules and caveats.
   - Also run the source project's own validation or local link checks when they exist.

5. **Publish / deploy (optional, via `references/deploy.md`):**
   - Check whether `references/deploy.md` exists in this skill directory. It is private and gitignored, so a fresh install does not have it:
     - **If `references/deploy.md` exists:** Read it completely and follow its exact deployment, registration, post-deploy verification, and security guardrails.
     - If the target catalog or index records versions, register the same version and changelog lines that the page shows.
     - **If `references/deploy.md` does not exist:** Check if the target project has its own deployment instructions or if the user specified a target host (see [references/deploy.example.md](references/deploy.example.md) for common patterns such as GitHub Pages, Vercel, or Cloudflare). If the user only asked to write or update the spec locally, stop after Step 4 and report the local file path and verification summary.

## Guardrails

- Never expose API tokens, secrets, or credentials in spec pages, commits, or command output.
- Do not skip the Impeccable pass (Step 3) or publish after an Impeccable pass that ran on an outdated version.
- Do not skip `lint-spec.mjs` or ignore mobile (`375px`) layout/diagram failures.
- Do not publish changed content under a version that is already public.
- Never commit private deployment configuration (`references/deploy.md`) into a public repository unless explicitly instructed by the user.
