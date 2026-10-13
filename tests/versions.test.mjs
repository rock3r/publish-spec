// The skill version lives in three places. They must match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { changelogSection, skillVersion } from '../scripts/changelog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('SKILL.md and both plugin manifests declare the same version', () => {
  const skill = read('skills/publish-spec/SKILL.md').match(/^\s*version:\s*"?([^"\s]+)"?\s*$/m)?.[1];
  assert.ok(skill, 'SKILL.md frontmatter has no version');
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(JSON.parse(read(manifest)).version, skill, `${manifest} does not match SKILL.md`);
  }
});

test('every JSON manifest parses', () => {
  for (const p of [
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    '.codex-plugin/plugin.json',
    '.agents/plugins/marketplace.json',
    'skills/publish-spec/skill-source.json',
  ]) {
    assert.doesNotThrow(() => JSON.parse(read(p)), p);
  }
});

test('CHANGELOG.md has an entry for the current version', () => {
  const version = skillVersion();
  assert.ok(changelogSection(version), `Add a "## ${version}" section to CHANGELOG.md`);
});
