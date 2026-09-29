/**
 * Download the bundled font catalogue's files so they are served locally.
 *
 * `seed-fonts.mjs` builds `api/data/fonts.json` by reading Google's keyless CSS
 * endpoint, which leaves the catalogue pointing at `fonts.gstatic.com`. The
 * files therefore came from a third party at runtime — someone else's CDN, over
 * someone else's TLS, at whatever availability they feel like. That is the same
 * dependency Tier 4 removed for the *list* of fonts; this removes it for the
 * files themselves.
 *
 * Every face is fetched once into `api/data/fonts/` and the catalogue is
 * rewritten to point at `GET /fonts/files/<name>` on our own API. Absolute URLs
 * that are already local are left alone, so re-running is a no-op, and an
 * instance configured with `FONT_API_KEY` (whose `/fonts` answers with Google's
 * own list) can still fall back to the CDN by simply not running this.
 *
 * The fonts are all SIL Open Font License or Apache-2.0 — redistributable — so
 * the files are committed and a fresh clone works with no extra step.
 *
 * Usage:
 *   node scripts/fetch-fonts.mjs [--dry-run]
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { storageConfig } from '../api/storagePaths.js';

const dryRun = process.argv.includes('--dry-run');

const DATA_DIR = path.join(storageConfig.projectRoot, 'api', 'data');
const CATALOGUE = path.join(DATA_DIR, 'fonts.json');
const FONT_DIR = path.join(DATA_DIR, 'fonts');

/** A filesystem-safe file stem for a family. */
const slug = (family) =>
  family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** `inter-bold_italic.ttf`; an unmarked face is the family's regular. */
const fileName = (family, style) =>
  `${slug(family)}-${String(style ?? 'regular').toLowerCase().replace('_', '-')}.ttf`;

const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
const families = Array.isArray(catalogue.fonts) ? catalogue.fonts : [];

mkdirSync(FONT_DIR, { recursive: true });

let downloaded = 0;
let reused = 0;
let bytes = 0;
const failures = [];

for (const family of families) {
  for (const face of family.fonts ?? []) {
    const source = face.urls?.[0];
    if (!source) continue;

    // Already ours (a previous run) — nothing to do.
    if (source.startsWith('/fonts/files/')) {
      reused += 1;
      continue;
    }

    const name = fileName(family.name, face.style);
    const target = path.join(FONT_DIR, name);

    if (existsSync(target)) {
      face.urls = [`/fonts/files/${name}`];
      reused += 1;
      bytes += statSync(target).size;
      continue;
    }

    if (dryRun) {
      console.log(`  would fetch ${family.name} ${face.style ?? 'regular'}`);
      continue;
    }

    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('empty response');
      writeFileSync(target, buffer);
      face.urls = [`/fonts/files/${name}`];
      downloaded += 1;
      bytes += buffer.length;
      console.log(`  ${name.padEnd(34)} ${(buffer.length / 1024).toFixed(0)} KB`);
    } catch (error) {
      failures.push(`${family.name} ${face.style ?? 'regular'}: ${error.message}`);
    }
  }
}

if (!dryRun) {
  writeFileSync(
    CATALOGUE,
    `${JSON.stringify(
      {
        ...catalogue,
        source: `${catalogue.source} -> served locally from api/data/fonts`,
        fonts: families,
      },
      null,
      2,
    )}\n`,
  );
}

console.log(`\ndownloaded ${downloaded}, already present ${reused}`);
console.log(`total on disk: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
if (failures.length) {
  console.log(`\nfailed (${failures.length}):`);
  for (const failure of failures) console.log(`  ${failure}`);
}
if (dryRun) console.log('\n(dry run - nothing written)');
