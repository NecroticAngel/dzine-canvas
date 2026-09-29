/**
 * One-off: remove the remote `fonts: [...]` blocks from the preset definitions.
 *
 *   node scripts/strip-preset-font-urls.mjs [--write]
 *
 * Every text preset and sample page carries a `fonts` array naming the file it
 * expects to be loaded from — and the origins are
 * `lidojs-fonts.s3.us-east-2.amazonaws.com` (22 references) and
 * `fonts.gstatic.com` (one). Nothing reads them: the vendored editor declares
 * `getFonts` and never calls it, no `@font-face` rule was generated from them,
 * and what actually decides a font is `attrs.fontFamily` resolved against the
 * catalogue. So they were never a runtime dependency.
 *
 * They were still worth removing. They are shipped in the bundle, copied into
 * every design a user creates from a preset, and they advertise a font source
 * that is not the one in use — someone reading a saved design would reasonably
 * conclude the app fetches fonts from a stranger's S3 bucket.
 *
 * The blocks are removed by bracket matching rather than by regex, because they
 * are nested and contain commas and brackets inside the urls themselves.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { storageConfig } from '../api/storagePaths.js';

const write = process.argv.includes('--write');

/**
 * Every source file, not a list of the ones known to contain a block.
 *
 * The first version of this script named `data.ts` and `text-effects.ts` and
 * missed the identical blocks in `TableContent.tsx` and `qrCode.tsx` — the same
 * mistake as trusting a fixed list of upstream references anywhere else.
 */
const sourceFiles = (dir) => {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
};

const FILES = sourceFiles(path.join(storageConfig.projectRoot, 'src'));

/**
 * Find the `]` that closes the `[` at `open`, ignoring anything inside a string.
 *
 * Scanning a url like `https://…/v4/PN_zRfyxp2f1fUCgAMg6rzjb_-Da.ttf` for
 * brackets is fine, but escapes and quotes still have to be respected or a
 * `'` in a name would desynchronise the count.
 */
const closeOf = (text, open) => {
  let depth = 0;
  let quote = null;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

let totalRemoved = 0;

for (const file of FILES) {
  let text = readFileSync(file, 'utf8');
  let removed = 0;

  // `fonts: [` at the start of a line, so a property *named* fonts inside a
  // string would not match.
  const pattern = /^([ \t]*)fonts: \[/gm;
  let match = pattern.exec(text);
  while (match) {
    const open = match.index + match[0].length - 1;
    const close = closeOf(text, open);
    if (close < 0) {
      console.error(`  unbalanced block at ${match.index}; stopping`);
      break;
    }
    // Also eat the trailing comma and the rest of its line.
    let end = close + 1;
    while (end < text.length && text[end] !== '\n') end += 1;
    if (text[end] === '\n') end += 1;

    text = text.slice(0, match.index) + text.slice(end);
    removed += 1;
    pattern.lastIndex = match.index;
    match = pattern.exec(text);
  }

  const remaining = (text.match(/lidojs-fonts|fonts\.gstatic|fonts\.googleapis/g) ?? [])
    .length;

  if (!removed && !remaining) continue;

  console.log(
    `${path.relative(storageConfig.projectRoot, file).padEnd(46)} removed ${removed}, ${remaining} remote urls left`,
  );
  totalRemoved += removed;

  if (write && removed) writeFileSync(file, text);
}

console.log(`\ntotal: ${totalRemoved} blocks`);
if (!write) console.log('(dry run - pass --write to apply)');
