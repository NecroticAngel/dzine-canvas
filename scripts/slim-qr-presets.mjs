/**
 * One-off: strip the base64 logos and the static thumbnail paths out of the QR
 * preset catalogue.
 *
 *   node scripts/slim-qr-presets.mjs [--write]
 *
 * The logos are ~31 KB each and are unconditionally replaced with a neutral
 * placeholder at insert time, so they were pure dead weight in the bundle. The
 * `img` paths pointed at three PNGs that showed the shipped branding and
 * "SCAN ME"; the panel now draws its thumbnails instead, so the paths go too.
 *
 * Prints a size report and leaves the file untouched unless `--write` is given.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'C:/Users/jo/dev/NecroZine/canva-clone/src/features/design/config/qrCode.tsx';
const write = process.argv.includes('--write');

const before = readFileSync(file, 'utf8');

let logos = 0;
let images = 0;

let after = before.replace(
  /^(\s*)logo: 'data:image\/png;base64,[A-Za-z0-9+/=]+',$/gm,
  (_match, indent) => {
    logos += 1;
    return `${indent}logo: '',`;
  },
);

after = after.replace(/^\s*img: 'assets\/images\/qr-code\/\d+\.png',$/gm, () => {
  images += 1;
  return '';
});

// Collapse the blank line the `img` removal leaves behind.
after = after.replace(/\n{3,}/g, '\n\n');

const kb = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`;

console.log(`logos stripped:        ${logos}`);
console.log(`thumbnail paths:       ${images}`);
console.log(`size before:           ${kb(before)}`);
console.log(`size after:            ${kb(after)}`);
console.log(`still contains base64: ${/base64/.test(after)}`);

if (!write) {
  console.log('\n(dry run - pass --write to apply)');
} else {
  writeFileSync(file, after);
  console.log('\nwritten');
}
