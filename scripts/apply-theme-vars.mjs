import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = 'src/features/design/components/sidebar';
const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));

for (const file of files) {
  const p = path.join(dir, file);
  let s = readFileSync(p, 'utf8');
  const before = s;
  s = s.replaceAll("color: '#181C32'", "color: 'var(--app-text-strong)'");
  s = s.replaceAll(
    "borderBottom: '1px solid rgba(57,76,96,.15)'",
    "borderBottom: '1px solid var(--app-border)'",
  );
  s = s.replaceAll("background: '#EBECF0'", "background: 'var(--app-surface)'");
  if (s !== before) {
    writeFileSync(p, s);
    console.log('updated', file);
  }
}
