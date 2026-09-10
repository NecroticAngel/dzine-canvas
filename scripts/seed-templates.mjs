import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/constant/data.ts', 'utf8');
const start = src.indexOf('export const data = ');
if (start < 0) throw new Error('data export not found');
const jsonText = src.slice(start + 'export const data = '.length).replace(/;\s*$/, '');
const data = Function(`return (${jsonText})`)();

mkdirSync('api/data/templates', { recursive: true });
mkdirSync('api/public/thumbs', { recursive: true });

writeFileSync(
  'api/data/templates/starter-lidojs.json',
  JSON.stringify(
    {
      id: 'starter-lidojs',
      name: 'Starter D-Zine Canvas',
      img: '/thumbs/starter-lidojs.svg',
      elements: data[0],
    },
    null,
    2,
  ),
);

writeFileSync(
  'api/data/templates/blank-white.json',
  JSON.stringify(
    {
      id: 'blank-white',
      name: 'Blank White',
      img: '/thumbs/blank-white.svg',
      elements: {
        layers: {
          ROOT: {
            type: { resolvedName: 'RootLayer' },
            props: {
              boxSize: { width: 1640, height: 924 },
              position: { x: 0, y: 0 },
              rotate: 0,
              color: 'rgb(255, 255, 255)',
              image: null,
            },
            locked: false,
            child: [],
            parent: null,
          },
        },
      },
    },
    null,
    2,
  ),
);

console.log('Seeded templates:', data.length ? 'starter + blank' : 'blank only');
