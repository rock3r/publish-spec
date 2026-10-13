# Custom Deployment Guide (`references/deploy.md` Template)

Copy this file to `references/deploy.md` to configure how `publish-spec` deploys specs in your environment. If `references/deploy.md` is omitted, the skill authors and validates the static HTML spec locally without deploying.

Every deployment flow starts from a spec that has passed the Impeccable pass (Step 3 in `SKILL.md`, latest Impeccable version) and `lint-spec.mjs` (Step 4). Keep that rule in your own `deploy.md`. If you edit the spec during deployment, run both again.

## Example A: GitHub Pages (`gh-pages` branch or `/docs`)

1. Place the validated static spec files under `<repo>/docs/specs/<slug>/` (or a dedicated specs repository).
2. Update the root `index.html` catalog list with the title, date, and relative link.
3. Commit and push to `main`, then verify `https://<org>.github.io/<repo>/specs/<slug>/` with:
   ```bash
   node <skill-dir>/scripts/lint-spec.mjs https://<org>.github.io/<repo>/specs/<slug>/
   ```

## Example B: Vercel

1. From the spec directory, run a preview or production deployment:
   ```bash
   npx vercel deploy --prod --yes
   ```
2. Capture the canonical alias URL and verify it at desktop, narrow, and mobile widths:
   ```bash
   node <skill-dir>/scripts/lint-spec.mjs <deployed-url>
   ```

## Example C: Cloudflare Workers / Pages

1. Ensure `wrangler.jsonc` or `wrangler.toml` configures static assets (`assets.directory`).
2. Dry-run and deploy:
   ```bash
   npx wrangler@latest deploy --dry-run
   npx wrangler@latest deploy
   ```
3. Verify the deployed route with `lint-spec.mjs`.
