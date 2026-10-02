/**
 * Build the bundled font catalogue the API serves at `GET /fonts`.
 *
 * The text panel used to call Google's Webfonts API **from the browser** with
 * `process.env.FONT_API_KEY` — which Vite does not inline, so the request went
 * out as `key=undefined`, Google answered 403, and the font list was silently
 * empty. That 403 has been sitting in the console for the life of the project
 * looking like a stray stylesheet.
 *
 * Google's CSS endpoint needs no key at all, so this resolves each family there
 * and records the real file URLs. The server then serves the catalogue, and the
 * key never has to reach a browser. If `FONT_API_KEY` is configured on the
 * server, `/fonts` prefers Google's full list and this file is the fallback.
 *
 * Usage:
 *   node scripts/seed-fonts.mjs [--out <file>]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { storageConfig } from '../api/storagePaths.js';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outFile = path.resolve(
  outFlag >= 0 && args[outFlag + 1]
    ? args[outFlag + 1]
    : path.join(storageConfig.projectRoot, 'api', 'data', 'fonts.json'),
);

/** A spread of styles that covers most designs, all of them free. */
const FAMILIES = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Source Sans 3',
  'Nunito',
  'Raleway',
  'Work Sans',
  'DM Sans',
  'Manrope',
  'Barlow',
  'Playfair Display',
  'Merriweather',
  'Libre Baskerville',
  'Space Grotesk',
  'Oswald',
  'Bebas Neue',
  'Lobster',
  'Pacifico',
  'Caveat',
  // The three below are not here to widen the choice: the packaged sample
  // pages, the text effects and the table presets already name them, and a
  // family that is asked for but absent from the catalogue renders in the
  // fallback with nothing to indicate why.
  'Agdasima',
  'Acme',
  'Akatab',
];

// A modern user agent is what makes the CSS endpoint answer with **woff2** rather
// than TrueType — the format is chosen from the UA.
//
// This asked for TrueType for a long time, because the editor was assumed to
// parse fonts and draw glyph paths itself. It does not: it renders text through
// CSS, which is why the shell font has been woff2 all along and why that
// assumption cost about 8 MB of download for nothing.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const cssUrl = (family, spec) =>
  `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}${spec}&display=swap`;

const fetchCss = async (family, spec) => {
  const response = await fetch(cssUrl(family, spec), {
    headers: { 'user-agent': UA },
  });
  return response.ok ? response.text() : null;
};

/**
 * Pull the latin `@font-face` blocks out of the CSS.
 *
 * The file groups faces by subset with a `/* cyrillic *​/`-style comment above
 * each group, so the subset in force is whatever comment came last.
 */
const parseFaces = (css) => {
  const faces = [];
  let subset = null;
  const tokens = css.split(/(\/\*[^*]*\*\/|@font-face\s*\{[^}]*\})/g);
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('/*')) {
      subset = token.replace(/[/\*]/g, '').trim();
      continue;
    }
    if (!token.startsWith('@font-face')) continue;
    if (subset && subset !== 'latin') continue;

    const style = /font-style:\s*([a-z]+)/.exec(token)?.[1] ?? 'normal';
    const weight = /font-weight:\s*(\d+)/.exec(token)?.[1] ?? '400';
    const url = /url\((https:[^)]+)\)/.exec(token)?.[1];
    if (url) faces.push({ style, weight, url });
  }
  return faces;
};

/** The style names the editor expects. */
const styleName = (style, weight) => {
  const bold = weight === '700' || weight === '600' || weight === '800';
  if (style === 'italic') return bold ? 'Bold_Italic' : 'Italic';
  return bold ? 'Bold' : undefined;
};

const catalogue = [];
const skipped = [];

for (const family of FAMILIES) {
  // Ask for the full spread, then fall back for families that lack a weight or
  // an italic — Bebas Neue and friends are single-weight.
  const attempts = [
    ':ital,wght@0,400;0,700;1,400;1,700',
    ':wght@400;700',
    ':wght@400',
  ];
  let faces = [];
  for (const spec of attempts) {
    const css = await fetchCss(family, spec);
    if (!css) continue;
    faces = parseFaces(css);
    if (faces.length) break;
  }
  if (!faces.length) {
    skipped.push(family);
    continue;
  }

  const fonts = [];
  for (const face of faces) {
    const style = styleName(face.style, face.weight);
    fonts.push(style ? { style, urls: [face.url] } : { urls: [face.url] });
  }
  catalogue.push({ name: family, fonts });
  console.log(`  ${family.padEnd(20)} ${fonts.length} faces`);
}

writeFileSync(
  outFile,
  `${JSON.stringify(
    {
      source: 'https://fonts.googleapis.com/css2 (keyless)',
      families: catalogue.length,
      fonts: catalogue,
    },
    null,
    2,
  )}\n`,
);

console.log(`\n${catalogue.length} families written to ${outFile}`);
if (skipped.length) console.log(`  skipped: ${skipped.join(', ')}`);
