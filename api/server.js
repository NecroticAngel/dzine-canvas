import cors from 'cors';
import express from 'express';
import multer from 'multer';
import {
  existsSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getStoragePaths, storageConfig } from './storagePaths.js';
import {
  deleteDesign,
  ensureTenant,
  getDesign,
  knownDesignIds,
  listDesigns,
  liveDesignCount,
  openDatabase,
  upsertDesign,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_PATH = `/${String(process.env.BASE_PATH || '')
  .replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
const SEED_TEMPLATES_DIR = path.join(__dirname, 'data', 'templates');
const WEB_DIR = path.join(__dirname, '..', 'dist');

const bootPaths = getStoragePaths();
const db = openDatabase(bootPaths.storageRoot);

// Seed packaged templates into the configured templates dir (once).
for (const file of readdirSync(SEED_TEMPLATES_DIR).filter((name) =>
  name.endsWith('.json'),
)) {
  const destination = path.join(bootPaths.templatesDir, file);
  if (!existsSync(destination)) {
    copyFileSync(path.join(SEED_TEMPLATES_DIR, file), destination);
  }
}

const app = express();
const api = express.Router();
api.use(cors({ origin: true }));
api.use(express.json({ limit: '30mb' }));
api.use(express.static(bootPaths.publicDir));

/**
 * The single identity seam.
 *
 * Phase 1 replaces this body with a verified token/session lookup; every caller
 * below already asks for a *tenant*, so nothing else has to change. Until then
 * it keeps the old, unauthenticated behaviour, where the caller simply asserts
 * who they are. That is a development stopgap and the first thing Phase 1
 * removes — see docs/plans/multi-tenant.md.
 */
const resolveTenantId = (req) =>
  req.header('x-user-id') ||
  req.query.userId ||
  storageConfig.defaultUserId;

/** @deprecated superseded by resolveTenantId; still used for upload URLs. */
const resolveUserId = resolveTenantId;

const pathsFor = (req) => getStoragePaths(resolveTenantId(req));

const absoluteUrl = (req, pathname) => {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const origin = `${req.protocol}://${req.get('host')}`;
  const assetPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${origin}${BASE_PATH}/api${assetPath}`;
};

const isSerializedPage = (value) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      value.layers &&
      typeof value.layers === 'object' &&
      value.layers.ROOT,
  );

const isDesignPages = (value) =>
  Array.isArray(value) && value.length > 0 && isSerializedPage(value[0]);

const safeId = (value, fallback = randomUUID()) => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim().replace(/[^\w.-]+/g, '-') || fallback;
};

/** Write to a temp file then rename, so a crash can't leave a half-written design. */
const writeFileAtomic = (filePath, contents) => {
  const tempPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tempPath, contents);
  renameSync(tempPath, filePath);
};

const THUMB_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Decode a `data:image/...;base64,` thumbnail captured in the browser. */
const parseThumbnail = (value) => {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  return {
    extension: THUMB_EXTENSIONS[match[1].toLowerCase()],
    buffer: Buffer.from(match[2], 'base64'),
  };
};

/** Store a design's preview image and return the file name to record. */
const writeThumbnail = (thumbsDir, id, dataUrl, previousPath) => {
  const parsed = parseThumbnail(dataUrl);
  if (!parsed) return previousPath ?? null;
  if (previousPath) {
    const stale = path.join(thumbsDir, path.basename(previousPath));
    if (existsSync(stale)) unlinkSync(stale);
  }
  const file = `${id}.${parsed.extension}`;
  writeFileAtomic(path.join(thumbsDir, file), parsed.buffer);
  return file;
};

/** Read a design's pages payload from disk. */
const readDesignPayload = (designsDir, id) => {
  const filePath = path.join(designsDir, `${id}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const pages = Array.isArray(raw?.pages) ? raw.pages : raw;
    return isDesignPages(pages) ? pages : null;
  } catch (error) {
    console.warn(`Skipping bad design ${id}:`, error.message);
    return null;
  }
};

/**
 * Adopt design files the database doesn't know about yet.
 *
 * Covers both the one-off migration of a pre-database install and anything
 * dropped into the directory by hand. Files already known are skipped and the
 * whole pass only runs when the directory holds more files than there are live
 * rows, so the steady-state cost is one readdir and one count.
 */
const adoptOrphanDesigns = (db, tenantId, designsDir) => {
  const files = readdirSync(designsDir).filter((name) => name.endsWith('.json'));
  if (files.length <= liveDesignCount(db, tenantId)) return;
  const known = knownDesignIds(db, tenantId);
  for (const file of files) {
    const id = file.replace(/\.json$/i, '');
    if (known.has(id)) continue;
    const pages = readDesignPayload(designsDir, id);
    if (!pages) continue;
    let name = id;
    let updatedAt = Date.now();
    try {
      const raw = JSON.parse(readFileSync(path.join(designsDir, file), 'utf8'));
      if (typeof raw?.name === 'string' && raw.name.trim()) name = raw.name.trim();
      if (Number.isFinite(Number(raw?.updatedAt))) updatedAt = Number(raw.updatedAt);
    } catch {
      /* the payload read above already reported the problem */
    }
    upsertDesign(db, {
      id,
      tenantId,
      name,
      createdAt: updatedAt,
      updatedAt,
    });
  }
};

const readTemplates = (templatesDir) => {
  const files = readdirSync(templatesDir).filter((name) => name.endsWith('.json'));
  const templates = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(path.join(templatesDir, file), 'utf8'));
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

const readUploads = (uploadsDir, req) => {
  const files = readdirSync(uploadsDir).filter((name) =>
    /\.(png|jpe?g|gif|webp|svg)$/i.test(name),
  );
  return files
    .map((file) => {
      const type = /\.svg$/i.test(file) ? 'svg' : 'image';
      const url = absoluteUrl(
        req,
        `/media/uploads/${encodeURIComponent(resolveUserId(req))}/${encodeURIComponent(file)}`,
      );
      return {
        id: file,
        name: file,
        type,
        url,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      cb(null, pathsFor(req).uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.png';
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext.toLowerCase()}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

api.get('/media/uploads/:userId/:file', (req, res) => {
  const { uploadsDir } = getStoragePaths(req.params.userId);
  const filePath = path.join(uploadsDir, path.basename(req.params.file));
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Upload not found' });
    return;
  }
  res.sendFile(filePath);
});

api.get('/health', (req, res) => {
  const paths = pathsFor(req);
  ensureTenant(db, paths.userId);
  res.json({
    ok: true,
    userId: paths.userId,
    templates: readTemplates(paths.templatesDir).length,
    // Straight from the metadata store; counting designs no longer parses them.
    designs: liveDesignCount(db, paths.userId),
    uploads: readUploads(paths.uploadsDir, req).length,
    paths: {
      storageRoot: paths.storageRoot,
      templatesDir: paths.templatesDir,
      designsDir: paths.designsDir,
      uploadsDir: paths.uploadsDir,
      thumbsDir: paths.thumbsDir,
      publicDir: paths.publicDir,
    },
  });
});

api.get('/', (req, res) => {
  const paths = pathsFor(req);
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>NecroZine Storage API</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.25rem;line-height:1.5;color:#111}
  code{background:#f3f4f6;padding:.1rem .35rem;border-radius:4px}
  a{color:#2563eb}
  pre{background:#f8fafc;padding:12px;border-radius:8px;overflow:auto;font-size:12px}
</style></head><body>
  <h1>NecroZine Storage API</h1>
  <p>Editor: <a href="http://127.0.0.1:4200/">http://127.0.0.1:4200/</a></p>
  <p>User scope: <code>${paths.userId}</code> (override with <code>X-User-Id</code>)</p>
  <ul>
    <li><a href="${BASE_PATH}/api/health"><code>GET ${BASE_PATH}/api/health</code></a></li>
    <li><a href="${BASE_PATH}/api/templates"><code>GET ${BASE_PATH}/api/templates</code></a></li>
    <li><a href="${BASE_PATH}/api/designs"><code>GET ${BASE_PATH}/api/designs</code></a></li>
    <li><a href="${BASE_PATH}/api/uploads"><code>GET ${BASE_PATH}/api/uploads</code></a></li>
  </ul>
  <h2>Active paths</h2>
  <pre>${JSON.stringify(
    {
      storageRoot: paths.storageRoot,
      templatesDir: paths.templatesDir,
      designsDir: paths.designsDir,
      uploadsDir: paths.uploadsDir,
      publicDir: paths.publicDir,
      basePath: BASE_PATH || '/',
    },
    null,
    2,
  )}</pre>
</body></html>`);
});

/** Templates */
api.get('/templates', (req, res) => {
  const { templatesDir } = pathsFor(req);
  res.json(
    readTemplates(templatesDir).map(({ img, elements, name, id }) => ({
      id,
      name,
      img: absoluteUrl(req, img),
      elements,
    })),
  );
});

api.get('/templates/:id', (req, res) => {
  const { templatesDir } = pathsFor(req);
  const found = readTemplates(templatesDir).find((item) => item.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({
    id: found.id,
    name: found.name,
    img: absoluteUrl(req, found.img),
    elements: found.elements,
  });
});

api.post('/templates', (req, res) => {
  const { templatesDir } = pathsFor(req);
  const elements = req.body?.elements;
  if (!isSerializedPage(elements)) {
    res.status(400).json({
      error: 'Body must include elements as a SerializedPage with layers.ROOT',
    });
    return;
  }

  const id = safeId(req.body.id);
  const name =
    typeof req.body.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : `Template ${id.slice(0, 8)}`;
  const img =
    typeof req.body.img === 'string' && req.body.img.trim()
      ? req.body.img.trim()
      : '/thumbs/blank-white.svg';

  const filePath = path.join(templatesDir, `${id}.json`);
  if (existsSync(filePath) && !req.body.overwrite) {
    res.status(409).json({ error: 'Template id already exists' });
    return;
  }

  const record = { id, name, img, elements };
  writeFileSync(filePath, JSON.stringify(record, null, 2));
  res.status(201).json(record);
});

api.delete('/templates/:id', (req, res) => {
  const { templatesDir } = pathsFor(req);
  const found = readTemplates(templatesDir).find((item) => item.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  unlinkSync(path.join(templatesDir, found.file));
  res.status(204).end();
});

/** Designs */
api.get('/designs', (req, res) => {
  const { designsDir, userId } = pathsFor(req);
  ensureTenant(db, userId);
  adoptOrphanDesigns(db, userId, designsDir);
  // One indexed query — the old version parsed every design file in full.
  res.json(
    listDesigns(db, userId).map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt,
      userId,
      thumbUrl: row.thumbPath
        ? absoluteUrl(req, `/designs/${encodeURIComponent(row.id)}/thumb`)
        : null,
    })),
  );
});

api.get('/designs/:id', (req, res) => {
  const { designsDir, userId } = pathsFor(req);
  ensureTenant(db, userId);
  adoptOrphanDesigns(db, userId, designsDir);
  const row = getDesign(db, userId, safeId(req.params.id));
  const pages = row ? readDesignPayload(designsDir, row.id) : null;
  if (!row || !pages) {
    res.status(404).json({ error: 'Design not found' });
    return;
  }
  res.json({
    id: row.id,
    name: row.name,
    updatedAt: row.updatedAt,
    pages,
  });
});

api.get('/designs/:id/thumb', (req, res) => {
  const { thumbsDir, userId } = pathsFor(req);
  const row = getDesign(db, userId, safeId(req.params.id));
  const filePath = row?.thumbPath
    ? path.join(thumbsDir, path.basename(row.thumbPath))
    : null;
  if (!filePath || !existsSync(filePath)) {
    res.status(404).json({ error: 'No thumbnail for this design' });
    return;
  }
  res.type(path.extname(filePath)).sendFile(filePath);
});

api.put('/designs/:id', (req, res) => {
  const { designsDir, thumbsDir, userId } = pathsFor(req);
  const id = safeId(req.params.id);
  const pages = req.body?.pages;
  if (!isDesignPages(pages)) {
    res.status(400).json({ error: 'Body must include pages: SerializedPage[]' });
    return;
  }
  ensureTenant(db, userId);
  const existing = getDesign(db, userId, id);
  const now = Date.now();
  const name =
    typeof req.body.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : (existing?.name ?? id);
  const serialized = JSON.stringify({ id, name, updatedAt: now, pages }, null, 2);
  writeFileAtomic(path.join(designsDir, `${id}.json`), serialized);
  const thumbPath = writeThumbnail(
    thumbsDir,
    id,
    req.body.thumbnail,
    existing?.thumbPath ?? null,
  );
  upsertDesign(db, {
    id,
    tenantId: userId,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    bytes: Buffer.byteLength(serialized),
    thumbPath,
  });
  res.json({
    id,
    name,
    updatedAt: now,
    thumbUrl: thumbPath
      ? absoluteUrl(req, `/designs/${encodeURIComponent(id)}/thumb`)
      : null,
  });
});

api.post('/designs', (req, res) => {
  const { designsDir, thumbsDir, userId } = pathsFor(req);
  const pages = req.body?.pages;
  if (!isDesignPages(pages)) {
    res.status(400).json({ error: 'Body must include pages: SerializedPage[]' });
    return;
  }
  const id = safeId(req.body.id);
  ensureTenant(db, userId);
  const filePath = path.join(designsDir, `${id}.json`);
  if (existsSync(filePath) && !req.body.overwrite) {
    res.status(409).json({ error: 'Design id already exists' });
    return;
  }
  const now = Date.now();
  const name =
    typeof req.body.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : `Design ${id.slice(0, 8)}`;
  const serialized = JSON.stringify({ id, name, updatedAt: now, pages }, null, 2);
  writeFileAtomic(filePath, serialized);
  const thumbPath = writeThumbnail(thumbsDir, id, req.body.thumbnail, null);
  upsertDesign(db, {
    id,
    tenantId: userId,
    name,
    createdAt: now,
    updatedAt: now,
    bytes: Buffer.byteLength(serialized),
    thumbPath,
  });
  res.status(201).json({
    id,
    name,
    updatedAt: now,
    thumbUrl: thumbPath
      ? absoluteUrl(req, `/designs/${encodeURIComponent(id)}/thumb`)
      : null,
  });
});

api.delete('/designs/:id', (req, res) => {
  const { designsDir, thumbsDir, userId } = pathsFor(req);
  ensureTenant(db, userId);
  const row = deleteDesign(db, userId, safeId(req.params.id));
  if (!row) {
    res.status(404).json({ error: 'Design not found' });
    return;
  }
  const filePath = path.join(designsDir, `${row.id}.json`);
  if (existsSync(filePath)) unlinkSync(filePath);
  if (row.thumbPath) {
    const thumbPath = path.join(thumbsDir, path.basename(row.thumbPath));
    if (existsSync(thumbPath)) unlinkSync(thumbPath);
  }
  res.status(204).end();
});

/** Uploads */
api.get('/uploads', (req, res) => {
  const { uploadsDir } = pathsFor(req);
  res.json(readUploads(uploadsDir, req));
});

api.post('/uploads', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Expected multipart field "file"' });
    return;
  }
  const userId = resolveUserId(req);
  const type = /\.svg$/i.test(req.file.filename) ? 'svg' : 'image';
  const url = absoluteUrl(
    req,
    `/media/uploads/${encodeURIComponent(userId)}/${encodeURIComponent(req.file.filename)}`,
  );
  res.status(201).json({
    id: req.file.filename,
    name: req.file.originalname || req.file.filename,
    type,
    url,
  });
});

api.delete('/uploads/:id', (req, res) => {
  const { uploadsDir } = pathsFor(req);
  const filePath = path.join(uploadsDir, path.basename(req.params.id));
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Upload not found' });
    return;
  }
  unlinkSync(filePath);
  res.status(204).end();
});

app.use(`${BASE_PATH}/api`, api);
app.get('/health', (_req, res) => res.json({ ok: true }));

// Local/dev convenience: keep unprefixed API routes working when BASE_PATH is empty
// (router is already at /api). When BASE_PATH is set, only the prefixed mount applies.

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

if (existsSync(path.join(WEB_DIR, 'index.html'))) {
  app.get(`${BASE_PATH}/`, renderIndex);
  app.use(`${BASE_PATH}/`, express.static(WEB_DIR));
  app.get(`${BASE_PATH}/{*path}`, renderIndex);
}

const server = app.listen(storageConfig.port, storageConfig.host, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${storageConfig.port} is already in use. Stop the other API process, then retry.`,
      );
    } else {
      console.error('API failed to start:', err);
    }
    process.exit(1);
    return;
  }

  console.log(
    `D-Zine Canvas on http://${storageConfig.host}:${storageConfig.port}${BASE_PATH}/`,
  );
  console.log(`API             ${BASE_PATH}/api`);
  console.log(`STORAGE_ROOT    ${bootPaths.storageRoot}`);
  console.log(`TEMPLATES_DIR   ${bootPaths.templatesDir}`);
  console.log(`DESIGNS_DIR     ${bootPaths.designsDir}`);
  console.log(`UPLOADS_DIR     ${bootPaths.uploadsDir}`);
  console.log(`PUBLIC_DIR      ${bootPaths.publicDir}`);
  console.log(`Default user    ${bootPaths.userId}`);
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `Port ${storageConfig.port} is already in use. Stop the other API process, then retry.`,
    );
  } else {
    console.error('API server error:', err);
  }
  process.exit(1);
});
