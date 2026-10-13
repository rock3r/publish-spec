#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version. With no argument, uses the
// version in SKILL.md. Exits 1 when the section is missing or empty.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function skillVersion() {
  const skill = readFileSync(join(root, 'skills/publish-spec/SKILL.md'), 'utf8');
  const version = skill.match(/^\s*version:\s*"?([^"\s]+)"?\s*$/m)?.[1];
  if (!version) throw new Error('SKILL.md frontmatter has no version');
  return version;
}

export function changelogSection(version) {
  const lines = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2] || skillVersion();
  const section = changelogSection(version);
  if (!section) {
    console.error(`CHANGELOG.md has no entry for ${version}. Add a "## ${version}" section.`);
    process.exit(1);
  }
  console.log(section);
}
