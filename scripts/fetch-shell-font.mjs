/**
 * Fetch the shell's own font into `public/assets/fonts/`.
 *
 * `index.html` was loading the app's UI font (Nunito, the whole
 * `ital,wght@0,300;0,400;0,600;0,700;1,400;1,600;1,700` range) from
 * `fonts.googleapis.com`, with `preconnect` hints to both Google hosts above it.
 * That is a render-blocking stylesheet on a third party for the chrome around
 * the canvas — the app cannot paint its own interface if Google is slow or
 * unreachable.
 *
 * This is deliberately separate from `fetch-fonts.mjs`, which fills the *design*
 * font catalogue the API serves. The shell font is a build asset: it has to be
 * there before any API call, and it must not depend on the API being up, so it
 * lives in `public/` next to the other static assets rather than in the
 * catalogue. (Nunito is in the catalogue as well, because it is the editor's
 * default family for new text — the same face, serving two different jobs.)
 *
 * Nunito is OFL, so the files are committed and a fresh clone needs no network.
 *
 * These are **woff2**, unlike the design catalogue's TrueType. The catalogue has
 * to be TrueType because the editor parses the glyphs itself and has no woff2
 * decompressor; the shell font is only ever used by CSS `@font-face`, which
 * every browser decompresses natively — and woff2 is roughly a quarter of the
 * size, which matters for something on the critical path of first paint.
 *
 * Usage:
 *   node scripts/fetch-shell-font.mjs [--write]
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { storageConfig } from '../api/storagePaths.js';

const write = process.argv.includes('--write');

const FAMILY = 'Nunito';
// Only the weights and italics `index.html` asks for.
const SPEC = ':ital,wght@0,300;0,400;0,600;0,700;1,400;1,600;1,700';

const OUT_DIR = path.join(
  storageConfig.projectRoot,
  'public',
  'assets',
  'fonts',
);

// A current Chrome user agent, so the endpoint answers with woff2. The
// catalogue scripts do the opposite on purpose — see the note above.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const response = await fetch(
  `https://fonts.googleapis.com/css2?family=${FAMILY}${SPEC}&display=swap`,
  { headers: { 'user-agent': UA } },
);
if (!response.ok) {
  console.error(`Google answered ${response.status}; nothing written.`);
  process.exit(1);
}
const css = await response.text();

/** Walk the `@font-face` blocks, tracking which subset each belongs to. */
const faces = [];
let subset = null;
for (const token of css.split(/(\/\*[^*]*\*\/|@font-face\s*\{[^}]*\})/g)) {
  if (!token) continue;
  if (token.startsWith('/*')) {
    subset = token.replace(/[/\*]/g, '').trim();
    continue;
  }
  if (!token.startsWith('@font-face')) continue;
  if (subset && subset !== 'latin') continue;

  const weight = /font-weight:\s*(\d+)/.exec(token)?.[1];
  const style = /font-style:\s*([a-z]+)/.exec(token)?.[1] ?? 'normal';
  const url = /url\((https:[^)]+)\)/.exec(token)?.[1];
  if (weight && url) faces.push({ weight, style, url });
}

if (!faces.length) {
  console.error('No latin faces found in the CSS; the markup may have changed.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const rules = [];
for (const face of faces) {
  const name = `nunito-${face.weight}${face.style === 'italic' ? '-italic' : ''}.woff2`;
  const target = path.join(OUT_DIR, name);

  if (write && !existsSync(target)) {
    const file = await fetch(face.url);
    if (!file.ok) {
      console.error(`  ${name}: HTTP ${file.status}`);
      continue;
    }
    writeFileSync(target, Buffer.from(await file.arrayBuffer()));
    console.log(`  ${name.padEnd(24)} ${(statSync(target).size / 1024).toFixed(0)} KB`);
  } else if (existsSync(target)) {
    console.log(`  ${name.padEnd(24)} present`);
  } else {
    console.log(`  ${name.padEnd(24)} (dry run)`);
  }

  rules.push(
    `      @font-face {\n` +
      `        font-family: 'Nunito';\n` +
      `        font-style: ${face.style};\n` +
      `        font-weight: ${face.weight};\n` +
      `        font-display: swap;\n` +
      `        src: url('assets/fonts/${name}') format('woff2');\n` +
      `      }`,
  );
}

console.log('\n@font-face rules for index.html:\n');
console.log(rules.join('\n'));
if (!write) console.log('\n(dry run - pass --write to download)');
