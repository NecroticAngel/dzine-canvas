/**
 * Generate the packaged asset library that the Frames, Graphic and Image panels
 * read from the API.
 *
 * The three panels used to hit `/frames`, `/graphics` and `/images` against a
 * service that does not exist here, so they could never populate. Rather than
 * hand-writing forty-odd SVG files, this script derives them from definitions
 * below and writes the manifests the server adopts on boot.
 *
 * Usage:
 *   node scripts/seed-assets.mjs [--out <dir>]
 *
 * Default output is `api/data/assets/`, which is the packaged copy the server
 * seeds a storage root from on first run, exactly like `api/data/templates/`.
 * Re-running is safe: files are rewritten, and nothing else is touched.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { storageConfig } from '../api/storagePaths.js';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outRoot = path.resolve(
  outFlag >= 0 && args[outFlag + 1]
    ? args[outFlag + 1]
    : path.join(storageConfig.projectRoot, 'api', 'data', 'assets'),
);

const INK = '#1f2430';
const SILHOUETTE = '#c9ced9';

const svg = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>\n`;

const roundedRect = (x, y, w, h, r) =>
  `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;

const polygonPath = (points) =>
  `${points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')} Z`;

/* --- Frames --------------------------------------------------------------
 * Each frame is a silhouette to show in the picker plus the path the editor
 * uses as a clip mask. Both come from the same `path`, so they cannot drift
 * apart, and the path lives in the same 0..width/height space as the preview.
 * --------------------------------------------------------------------- */

const regularPolygon = (sides, cx, cy, radius, rotation = -Math.PI / 2) =>
  polygonPath(
    Array.from({ length: sides }, (_, index) => {
      const angle = rotation + (index * 2 * Math.PI) / sides;
      return [
        Number((cx + radius * Math.cos(angle)).toFixed(2)),
        Number((cy + radius * Math.sin(angle)).toFixed(2)),
      ];
    }),
  );

const square = (size = 1080) => ({ width: size, height: size });

const frames = [
  {
    id: 'frame-rounded',
    name: 'Rounded',
    tags: ['basic'],
    ...square(),
    path: roundedRect(0, 0, 1080, 1080, 80),
  },
  {
    id: 'frame-square',
    name: 'Square',
    tags: ['basic'],
    ...square(),
    path: polygonPath([[0, 0], [1080, 0], [1080, 1080], [0, 1080]]),
  },
  {
    id: 'frame-circle',
    name: 'Circle',
    tags: ['basic'],
    ...square(),
    path: 'M 540 0 A 540 540 0 1 1 539.9 0 Z',
  },
  {
    id: 'frame-squircle',
    name: 'Squircle',
    tags: ['basic'],
    ...square(),
    path: roundedRect(0, 0, 1080, 1080, 320),
  },
  {
    id: 'frame-arch',
    name: 'Arch',
    tags: ['shaped'],
    ...square(),
    path: 'M 0 1080 V 540 A 540 540 0 0 1 1080 540 V 1080 Z',
  },
  {
    id: 'frame-hexagon',
    name: 'Hexagon',
    tags: ['shaped'],
    ...square(),
    path: regularPolygon(6, 540, 540, 540, 0),
  },
  {
    id: 'frame-octagon',
    name: 'Octagon',
    tags: ['shaped'],
    ...square(),
    path: regularPolygon(8, 540, 540, 540, Math.PI / 8),
  },
  {
    id: 'frame-pentagon',
    name: 'Pentagon',
    tags: ['shaped'],
    ...square(),
    path: regularPolygon(5, 540, 540, 540),
  },
  {
    id: 'frame-diamond',
    name: 'Diamond',
    tags: ['shaped'],
    ...square(),
    path: polygonPath([[540, 0], [1080, 540], [540, 1080], [0, 540]]),
  },
  {
    id: 'frame-portrait',
    name: 'Portrait',
    tags: ['aspect'],
    width: 1080,
    height: 1350,
    path: roundedRect(0, 0, 1080, 1350, 48),
  },
  {
    id: 'frame-landscape',
    name: 'Landscape',
    tags: ['aspect'],
    width: 1640,
    height: 924,
    path: roundedRect(0, 0, 1640, 924, 48),
  },
  {
    id: 'frame-polaroid',
    name: 'Polaroid',
    tags: ['photo'],
    width: 1080,
    height: 1296,
    // A square photo window with a deeper bottom edge, which is the whole
    // reason a polaroid reads as one. The window is the clip; the border is not.
    path: roundedRect(24, 24, 1032, 1032, 12),
  },
  {
    id: 'frame-ticket',
    name: 'Ticket',
    tags: ['photo'],
    width: 1080,
    height: 540,
    path: roundedRect(0, 0, 1080, 540, 40),
  },
  {
    id: 'frame-blob',
    name: 'Blob',
    tags: ['shaped'],
    ...square(),
    path:
      'M 812 168 C 962 268 1092 452 1052 620 C 1012 788 802 940 620 968 C 438 996 248 900 156 748 C 64 596 70 388 176 268 C 282 148 662 68 812 168 Z',
  },
  {
    id: 'frame-half-round',
    name: 'Dome',
    tags: ['shaped'],
    ...square(),
    path: 'M 0 1080 H 1080 A 540 540 0 0 0 0 1080 Z',
  },
  {
    id: 'frame-chevron',
    name: 'Chevron',
    tags: ['shaped'],
    ...square(),
    path: polygonPath([
      [0, 0],
      [820, 0],
      [1080, 540],
      [820, 1080],
      [0, 1080],
      [260, 540],
    ]),
  },
];

/* --- Graphics ------------------------------------------------------------ */

const star = (cx, cy, outer, inner, points = 5) =>
  polygonPath(
    Array.from({ length: points * 2 }, (_, index) => {
      const radius = index % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (index * Math.PI) / points;
      return [
        Number((cx + radius * Math.cos(angle)).toFixed(2)),
        Number((cy + radius * Math.sin(angle)).toFixed(2)),
      ];
    }),
  );

const graphics = [
  { id: 'arrow-right', name: 'Arrow', tags: ['arrows', 'basic'],
    width: 256, height: 256,
    body: `<path d="M 16 128 H 210 L 150 68 M 210 128 L 150 188" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: 'arrow-curved', name: 'Curved arrow', tags: ['arrows'],
    width: 256, height: 256,
    body: `<path d="M 28 208 C 28 96 112 40 216 48" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round"/><path d="M 168 16 L 224 50 L 164 86" fill="${INK}"/>` },
  { id: 'arrow-up', name: 'Up arrow', tags: ['arrows'],
    width: 256, height: 256,
    body: `<path d="M 128 232 V 48 M 68 108 L 128 44 L 188 108" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: 'chevron-left', name: 'Chevron', tags: ['arrows'],
    width: 256, height: 256,
    body: `<path d="M 172 40 L 92 128 L 172 216" fill="none" stroke="${INK}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: 'star-5', name: 'Star', tags: ['shapes', 'badges'],
    width: 256, height: 256, body: `<path d="${star(128, 132, 116, 46)}" fill="${INK}"/>` },
  { id: 'star-6', name: 'Six-point star', tags: ['shapes'],
    width: 256, height: 256, body: `<path d="${star(128, 128, 116, 52, 6)}" fill="${INK}"/>` },
  { id: 'sparkle', name: 'Sparkle', tags: ['shapes'],
    width: 256, height: 256,
    body: `<path d="M 128 16 C 140 100 156 116 240 128 C 156 140 140 156 128 240 C 116 156 100 140 16 128 C 100 116 116 100 128 16 Z" fill="${INK}"/>` },
  { id: 'heart', name: 'Heart', tags: ['shapes'],
    width: 256, height: 256,
    body: `<path d="M 128 224 C 40 168 16 120 16 84 A 56 56 0 0 1 128 62 A 56 56 0 0 1 240 84 C 240 120 216 168 128 224 Z" fill="${INK}"/>` },
  { id: 'speech-bubble', name: 'Speech bubble', tags: ['callouts'],
    width: 256, height: 256,
    body: `<path d="${roundedRect(16, 32, 224, 148, 28)}" fill="${INK}"/><path d="M 72 178 L 72 232 L 118 178 Z" fill="${INK}"/>` },
  { id: 'burst', name: 'Burst', tags: ['badges'],
    width: 256, height: 256,
    body: `<path d="${regularPolygon(16, 128, 128, 118, -Math.PI / 2)}" fill="${INK}"/>` },
  { id: 'badge-ribbon', name: 'Ribbon', tags: ['badges'],
    width: 256, height: 256,
    body: `<path d="${roundedRect(24, 40, 208, 120, 16)}" fill="${INK}"/><path d="M 96 152 L 80 232 L 128 200 L 176 232 L 160 152 Z" fill="${INK}"/>` },
  { id: 'check-badge', name: 'Check', tags: ['badges'],
    width: 256, height: 256,
    body: `<circle cx="128" cy="128" r="112" fill="${INK}"/><path d="M 72 132 L 112 172 L 188 92" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: 'quote', name: 'Quotation marks', tags: ['text'],
    width: 256, height: 256,
    body: `<path d="M 96 64 C 48 88 28 128 28 176 H 104 V 96 H 72 C 74 82 84 72 100 64 Z" fill="${INK}"/><path d="M 208 64 C 160 88 140 128 140 176 H 216 V 96 H 184 C 186 82 196 72 212 64 Z" fill="${INK}"/>` },
  { id: 'underline', name: 'Underline', tags: ['text'],
    width: 256, height: 256,
    body: `<path d="M 24 128 C 72 104 184 104 232 128" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>` },
  { id: 'scribble', name: 'Scribble', tags: ['text'],
    width: 256, height: 256,
    body: `<path d="M 16 156 C 60 96 96 200 140 140 C 176 92 208 168 240 108" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>` },
  { id: 'dots-grid', name: 'Dots', tags: ['patterns'],
    width: 256, height: 256,
    body: Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 5 }, (_, column) =>
        `<circle cx="${28 + column * 50}" cy="${28 + row * 50}" r="9" fill="${INK}"/>`,
      ).join(''),
    ).join('') },
  { id: 'blob-mark', name: 'Blob mark', tags: ['shapes'],
    width: 256, height: 256,
    body: `<path d="M 196 44 C 236 74 250 132 232 174 C 214 216 168 240 128 232 C 88 224 48 190 36 148 C 24 106 42 56 80 36 C 118 16 156 14 196 44 Z" fill="${INK}"/>` },
  { id: 'triangle', name: 'Triangle', tags: ['shapes'],
    width: 256, height: 256, body: `<path d="${regularPolygon(3, 128, 140, 124)}" fill="${INK}"/>` },
];

/* --- Images --------------------------------------------------------------
 * Not stock photography — these are backgrounds and textures, which is what
 * can honestly be generated here. Each is full-bleed at the default canvas.
 * --------------------------------------------------------------------- */

const W = 1640;
const H = 924;

const images = [
  { id: 'bg-slate', name: 'Slate', tags: ['gradient'], width: W, height: H,
    body: `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2030"/><stop offset="1" stop-color="#38405c"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>` },
  { id: 'bg-dawn', name: 'Dawn', tags: ['gradient'], width: W, height: H,
    body: `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd6a5"/><stop offset="1" stop-color="#ff8fab"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>` },
  { id: 'bg-mint', name: 'Mint', tags: ['gradient'], width: W, height: H,
    body: `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8e6cf"/><stop offset="1" stop-color="#3fc1c9"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>` },
  { id: 'bg-ink', name: 'Ink', tags: ['gradient', 'dark'], width: W, height: H,
    body: `<defs><radialGradient id="g" cx="0.5" cy="0.2" r="0.9"><stop offset="0" stop-color="#3a4a7a"/><stop offset="1" stop-color="#0d1018"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>` },
  { id: 'bg-paper', name: 'Paper', tags: ['texture', 'light'], width: W, height: H,
    body: `<rect width="${W}" height="${H}" fill="#f6f4ef"/><g fill="#e6e2d8">${Array.from({ length: 24 }, (_, row) => Array.from({ length: 42 }, (_, column) => `<circle cx="${20 + column * 40}" cy="${20 + row * 40}" r="1.6"/>`).join('')).join('')}</g>` },
  { id: 'bg-grid', name: 'Grid', tags: ['texture'], width: W, height: H,
    body: `<rect width="${W}" height="${H}" fill="#0f1320"/><g stroke="#2a3450" stroke-width="2">${Array.from({ length: 41 }, (_, index) => `<path d="M ${index * 40} 0 V ${H}"/>`).join('')}${Array.from({ length: 24 }, (_, index) => `<path d="M 0 ${index * 40} H ${W}"/>`).join('')}</g>` },
  { id: 'bg-stripes', name: 'Stripes', tags: ['texture'], width: W, height: H,
    body: `<rect width="${W}" height="${H}" fill="#12233a"/><g fill="#1f6feb" opacity="0.55">${Array.from({ length: 42 }, (_, index) => `<rect x="${index * 60 - 200}" y="-260" width="26" height="${H + 520}" transform="rotate(20 ${index * 60 - 200} 0)"/>`).join('')}</g>` },
  { id: 'bg-waves', name: 'Waves', tags: ['texture'], width: W, height: H,
    body: `<rect width="${W}" height="${H}" fill="#2b1f4a"/><g fill="none" stroke="#7c5cff" stroke-width="6" opacity="0.75">${Array.from({ length: 7 }, (_, index) => `<path d="M -40 ${180 + index * 90} C 300 ${80 + index * 90} 620 ${300 + index * 90} 980 ${180 + index * 90} S 1500 ${100 + index * 90} 1700 ${200 + index * 90}"/>`).join('')}</g>` },
];

/* --- Write --------------------------------------------------------------- */

const written = {};

const writeCategory = (category, definitions, toManifest) => {
  const dir = path.join(outRoot, category);
  mkdirSync(dir, { recursive: true });
  const manifest = [];
  for (const definition of definitions) {
    const file = `${definition.id}.svg`;
    writeFileSync(path.join(dir, file), definition.document);
    manifest.push(toManifest(definition, file));
  }
  writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  written[category] = manifest.length;
};

writeCategory(
  'frames',
  frames.map((frame) => {
    const { width, height, path: clipPath } = frame;
    // The preview is the very same path filled in, so the silhouette in the
    // picker cannot disagree with what the frame actually clips to.
    const body = `<path d="${clipPath}" fill="${SILHOUETTE}"/>`;
    return { ...frame, document: svg(width, height, body) };
  }),
  ({ id, name, tags, width, height, path: clipPath }, file) => ({
    file,
    id,
    name,
    tags,
    width,
    height,
    clipPath,
  }),
);

writeCategory(
  'graphics',
  graphics.map((graphic) => ({
    ...graphic,
    document: svg(graphic.width, graphic.height, graphic.body),
  })),
  ({ id, name, tags, width, height }, file) => ({
    file,
    id,
    name,
    tags,
    width,
    height,
  }),
);

writeCategory(
  'images',
  images.map((image) => ({
    ...image,
    document: svg(image.width, image.height, image.body),
  })),
  ({ id, name, tags, width, height }, file) => ({
    file,
    id,
    name,
    tags,
    width,
    height,
  }),
);

console.log(`Assets written to ${outRoot}`);
for (const [category, count] of Object.entries(written)) {
  console.log(`  ${category.padEnd(10)} ${count} files + manifest.json`);
}
