import cors from 'cors';
import express from 'express';
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4201);
const BASE_PATH = `/${String(process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(__dirname, 'data', 'templates');
const SEED_TEMPLATES_DIR = path.join(__dirname, 'data', 'templates');
const PUBLIC_DIR = path.join(__dirname, 'public');
const WEB_DIR = path.join(__dirname, '..', 'dist');

mkdirSync(TEMPLATES_DIR, { recursive: true });
mkdirSync(path.join(PUBLIC_DIR, 'thumbs'), { recursive: true });

for (const file of readdirSync(SEED_TEMPLATES_DIR).filter((name) => name.endsWith('.json'))) {
  const destination = path.join(TEMPLATES_DIR, file);
  if (!existsSync(destination)) {
    copyFileSync(path.join(SEED_TEMPLATES_DIR, file), destination);
  }
}

const app = express();
const api = express.Router();
api.use(cors({ origin: true }));
api.use(express.json({ limit: '20mb' }));
api.use(express.static(PUBLIC_DIR));

const isSerializedPage = (value) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      value.layers &&
      typeof value.layers === 'object' &&
      value.layers.ROOT,
  );

const readTemplates = () => {
  const files = readdirSync(TEMPLATES_DIR).filter((name) =>
    name.endsWith('.json'),
  );
  const templates = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(
        readFileSync(path.join(TEMPLATES_DIR, file), 'utf8'),
      );
      if (!raw?.img || !isSerializedPage(raw.elements)) continue;
      templates.push({
        id: String(raw.id || file.replace(/\.json$/i, '')),
        name: String(raw.name || file.replace(/\.json$/i, '')),
        img: String(raw.img),
        elements: raw.elements,
        file,
      });
    } catch (error) {
      console.warn(`Skipping bad template ${file}:`, error.message);
    }
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
};

api.get('/health', (_req, res) => {
  res.json({ ok: true, templates: readTemplates().length });
});

const absoluteImg = (req, img) => {
  if (/^https?:\/\//i.test(img)) return img;
  const origin = `${req.protocol}://${req.get('host')}`;
  const assetPath = img.startsWith('/') ? img : `/${img}`;
  return `${origin}${BASE_PATH}/api${assetPath}`;
};

/** Shape expected by TemplateContent.tsx */
api.get('/templates', (req, res) => {
  res.json(
    readTemplates().map(({ img, elements, name, id }) => ({
      id,
      name,
      img: absoluteImg(req, img),
      elements,
    })),
  );
});

api.get('/templates/:id', (req, res) => {
  const found = readTemplates().find((item) => item.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({
    id: found.id,
    name: found.name,
    img: found.img,
    elements: found.elements,
  });
});

/**
 * Add a template:
 * { id?, name?, img?, elements: SerializedPage, overwrite?: boolean }
 */
api.post('/templates', (req, res) => {
  const elements = req.body?.elements;
  if (!isSerializedPage(elements)) {
    res.status(400).json({
      error: 'Body must include elements as a SerializedPage with layers.ROOT',
    });
    return;
  }

  const id =
    typeof req.body.id === 'string' && req.body.id.trim()
      ? req.body.id.trim().replace(/[^\w-]+/g, '-')
      : randomUUID();
  const name =
    typeof req.body.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : `Template ${id.slice(0, 8)}`;
  const img =
    typeof req.body.img === 'string' && req.body.img.trim()
      ? req.body.img.trim()
      : '/thumbs/blank-white.svg';

  const fileName = `${id}.json`;
  const filePath = path.join(TEMPLATES_DIR, fileName);
  if (existsSync(filePath) && !req.body.overwrite) {
    res.status(409).json({ error: 'Template id already exists' });
    return;
  }

  const record = { id, name, img, elements };
  writeFileSync(filePath, JSON.stringify(record, null, 2));
  res.status(201).json(record);
});

api.delete('/templates/:id', (req, res) => {
  const found = readTemplates().find((item) => item.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  unlinkSync(path.join(TEMPLATES_DIR, found.file));
  res.status(204).end();
});

app.use(`${BASE_PATH}/api`, api);
app.get('/health', (_req, res) => res.json({ ok: true }));

if (BASE_PATH) {
  app.get(BASE_PATH, (req, res, next) => {
    if (req.path.endsWith('/')) {
      next();
      return;
    }
    res.redirect(308, `${BASE_PATH}/`);
  });
}

const renderIndex = (_req, res) => {
  const html = readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8').replace(
    '<html lang="en">',
    `<html lang="en" data-base-path="${BASE_PATH}">`,
  );
  res.type('html').send(html);
};

app.get(`${BASE_PATH}/`, renderIndex);
app.use(`${BASE_PATH}/`, express.static(WEB_DIR));
app.get(`${BASE_PATH}/{*path}`, renderIndex);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NecroZine canvas on http://0.0.0.0:${PORT}${BASE_PATH}/`);
  console.log(`Serving ${readTemplates().length} template(s) from ${TEMPLATES_DIR}`);
});
