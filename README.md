# publish-spec

A portable agent skill for authoring, validating, and optionally publishing static HTML design specs, PRDs, review sites, and technical walkthroughs.

The skill helps agents:

- structure specs around observable behavior and guarantees (`Why › What › How › Where`) instead of implementation layers;
- pair every section claim with a concrete exhibit (cropped UI mockups `<= 480px`, state machines, annotated call trees, native-language schemas, or focused code slices);
- surface open decisions with a pre-selected `Suggested` default directly under the exhibit they affect;
- write in direct, active Plain Technical English without formulaic AI filler or decorative card grids;
- mechanically verify prose budgets, CSS breakpoints, and rendered desktop (`1280px`), narrow (`768px`), and mobile (`375px`) layouts (including static, interactive, and animated diagrams) via a zero-dependency Node + headless Chrome linter (`lint-spec.mjs`);
- optionally deploy via a user-supplied `skills/publish-spec/references/deploy.md` add-on file (gitignored so personal hosting credentials or routes stay out of version control).

## Installation

You can install the skill in several ways:

- Copy `skills/publish-spec/` into your agent skills directory (for example `.agents/skills/publish-spec/`).
- Use `npx skills add rock3r/publish-spec` and similar mechanisms.

### Claude Code

The repository ships a Claude Code plugin manifest (`.claude-plugin/plugin.json`) and marketplace (`.claude-plugin/marketplace.json`):

```bash
claude plugin marketplace add rock3r/publish-spec
claude plugin install publish-spec@publish-spec
```

### OpenAI Codex

The repository ships a Codex plugin manifest (`.codex-plugin/plugin.json`) and marketplace (`.agents/plugins/marketplace.json`):

```bash
codex plugin marketplace add rock3r/publish-spec
codex plugin add publish-spec@publish-spec
```

## Customizing Deployment (`references/deploy.md`)

By default, `publish-spec` authors and validates static HTML specs locally. To teach the skill how to deploy in your environment (GitHub Pages, Vercel, Cloudflare Workers/Pages, S3, etc.):

1. Copy [`skills/publish-spec/references/deploy.example.md`](skills/publish-spec/references/deploy.example.md) to `skills/publish-spec/references/deploy.md` in your installed skill directory.
2. Fill in your host commands, URL patterns, and guardrails.

`skills/publish-spec/references/deploy.md` is gitignored so environment-specific details are never committed.

## Running the Spec Linter

`lint-spec.mjs` requires only `node` (and uses local headless Chrome/Chromium when available for live viewport layout checks at `1280px`, `768px`, and `375px`):

```bash
node skills/publish-spec/scripts/lint-spec.mjs <dir-or-html-or-url> --screenshots /tmp/spec-shots
```

## Provenance & Attribution

Provenance is tracked in [`skills/publish-spec/skill-source.json`](skills/publish-spec/skill-source.json) using [`rock3r/skill-provenance`](https://github.com/rock3r/skill-provenance).

Created by Sebastiano Poggi (Apache-2.0); incorporates claim-hierarchy, exhibit, and linting concepts inspired by Thariq Shihipar's [`html-plan`](https://github.com/anthropics/claude-plugins-community/tree/main/html-plan/skills/html-plan) skill (MIT).

## License

Apache License 2.0. See [`LICENSE`](LICENSE).

> Copyright 2026 Sebastiano Poggi
>
> Licensed under the Apache License, Version 2.0 (the "License");
> you may not use this file except in compliance with the License.
> You may obtain a copy of the License at
>
>   http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS,
> WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
> See the License for the specific language governing permissions and
> limitations under the License.
