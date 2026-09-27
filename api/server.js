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
  createInvite,
  deleteDesign,
  deleteInvite,
  ensureTenant,
  getDesign,
  getTenant,
  knownDesignIds,
  listDesigns,
  listInvites,
  listMembers,
  listTenants,
  liveDesignCount,
  openDatabase,
  upsertDesign,
} from './db.js';
import {
  authConfig,
  authConfigError,
  createIdentityMiddleware,
  describeAuth,
  requireAdmin,
  resolveIdentity,
} from './identity.js';

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

// Fail closed: a deployment with no working authentication must not start and
// then quietly trust whatever it is told.
if (authConfigError) {
  console.error(`\nRefusing to start: ${authConfigError}\n`);
  process.exit(1);
}

const app = express();
const api = express.Router();

/**
 * CORS is an allow-list when CORS_ORIGINS is set (comma separated). Reflecting
 * whatever origin asks — which is what this used to do — lets any site drive
 * the API with the browser's ambient credentials.
 */
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
api.use(
  cors(
    allowedOrigins.length
      ? { origin: allowedOrigins, credentials: true }
      : { origin: true },
  ),
);
api.use(express.json({ limit: '30mb' }));
api.use(express.static(bootPaths.publicDir));

const identity = createIdentityMiddleware(db);

// The container probe and the endpoint index stay reachable without credentials;
// everything else resolves an identity first.
const PUBLIC_ROUTES = new Set(['/health', '/']);
api.use((req, res, next) => {
  if (PUBLIC_ROUTES.has(req.path)) {
    // Resolved opportunistically: /health answers container probes without
    // credentials but shows detail to a signed-in administrator, so a failure
    // here must not reject the request.
    resolveIdentity(db, req)
      .then((result) => {
        if (!result.reason) req.identity = result;
      })
      .catch(() => {
        /* anonymous is a valid outcome for a public route */
      })
      .finally(next);
    return;
  }
  void identity(req, res, next);
});

// The tenant every request belongs to. Resolved from a verified identity — a
// caller can no longer name the tenant it wants to read.
const tenantOf = (req) => req.identity.tenantId;

const pathsFor = (req) => getStoragePaths(tenantOf(req));

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
        `/media/uploads/${encodeURIComponent(tenantOf(req))}/${encodeURIComponent(file)}`,
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
  // Kept because URLs of this shape are already embedded in saved designs, but
  // the tenant in the path must match the caller. Previously any folder could be
  // read by anyone who guessed its name.
  if (req.params.userId !== tenantOf(req) && !req.identity.isAdmin) {
    res.status(403).json({ error: 'Not your upload', code: 'forbidden' });
    return;
  }
  const { uploadsDir } = getStoragePaths(req.params.userId);
  const filePath = path.join(uploadsDir, path.basename(req.params.file));
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Upload not found' });
    return;
  }
  res.sendFile(filePath);
});

api.get('/health', (req, res) => {
  // Public, because this is what container probes hit. The detail below — which
  // includes resolved server paths — is only for signed-in administrators.
  if (!req.identity?.isAdmin) {
    res.json({ ok: true });
    return;
  }
  const paths = pathsFor(req);
  ensureTenant(db, paths.userId);
  res.json({
    ok: true,
    authMode: authConfig.mode,
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

/** Who the caller is, and which workspace they belong to. */
api.get('/me', (req, res) => {
  const { member, tenantId, isAdmin } = req.identity;
  res.json({
    member: {
      id: member.id,
      email: member.email,
      name: member.name,
      role: member.role,
    },
    tenant: { id: tenantId, name: getTenant(db, tenantId)?.name ?? tenantId },
    isAdmin,
    authMode: authConfig.mode,
  });
});

api.get('/', (req, res) => {
  // Public endpoint index. Deliberately exposes no server paths and no tenant data.
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>NecroZine Storage API</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.25rem;line-height:1.5;color:#111}
  code{background:#f3f4f6;padding:.1rem .35rem;border-radius:4px}
  a{color:#2563eb}
  pre{background:#f8fafc;padding:12px;border-radius:8px;overflow:auto;font-size:12px}
</style></head><body>
  <h1>NecroZine Storage API</h1>
  <p>Authentication: <code>${authConfig.mode}</code></p>
  <ul>
    <li><a href="${BASE_PATH}/api/health"><code>GET ${BASE_PATH}/api/health</code></a></li>
    <li><code>GET ${BASE_PATH}/api/me</code> — who you are (needs credentials)</li>
    <li><code>GET ${BASE_PATH}/api/templates</code></li>
    <li><code>GET ${BASE_PATH}/api/designs</code></li>
    <li><code>GET ${BASE_PATH}/api/uploads</code></li>
  </ul>
</body></html>`);
});

/** Admin: tenants, invites and members. These are what make invite-only workable. */
api.get('/admin/tenants', requireAdmin, (_req, res) => {
  res.json(listTenants(db));
});

api.post('/admin/tenants', requireAdmin, (req, res) => {
  const id = safeId(req.body?.id);
  const name =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : id;
  ensureTenant(db, id, name);
  res.status(201).json(getTenant(db, id));
});

api.get('/admin/invites', requireAdmin, (req, res) => {
  const tenantId = req.query.tenantId
    ? String(req.query.tenantId)
    : req.identity.tenantId;
  res.json(listInvites(db, tenantId));
});

api.post('/admin/invites', requireAdmin, (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }
  const tenantId = safeId(req.body?.tenantId ?? req.identity.tenantId);
  ensureTenant(db, tenantId, String(req.body?.tenantName ?? tenantId));
  res.status(201).json(
    createInvite(db, {
      email,
      tenantId,
      role: req.body?.role === 'admin' ? 'admin' : 'member',
      invitedBy: req.identity.member.id,
    }),
  );
});

api.delete('/admin/invites/:email', requireAdmin, (req, res) => {
  res.status(deleteInvite(db, req.params.email) ? 204 : 404).end();
});

api.get('/admin/members', requireAdmin, (req, res) => {
  const tenantId = req.query.tenantId
    ? String(req.query.tenantId)
    : req.identity.tenantId;
  res.json(listMembers(db, tenantId));
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

api.post('/templates', requireAdmin, (req, res) => {
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

api.delete('/templates/:id', requireAdmin, (req, res) => {
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
  const userId = tenantOf(req);
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
  console.log(`AUTH            ${describeAuth()}`);
  if (authConfig.mode === 'dev') {
    console.log('');
    console.log('!! AUTH_MODE=dev: every request is the development user.');
    console.log('!! Do not deploy this. Set OIDC_ISSUER, or AUTH_MODE=headers.');
    console.log('');
  }
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
