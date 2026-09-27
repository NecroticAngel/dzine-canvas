import cors from 'cors';
import express from 'express';
import multer from 'multer';
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  getStoragePaths,
  storageConfig,
  storageConfigError,
  storageRootIsEphemeral,
} from './storagePaths.js';
import {
  createInvite,
  deleteDesign,
  deleteInvite,
  deleteTemplate,
  ensureTenant,
  getDesign,
  getTemplate,
  getTenant,
  grantTemplate,
  isTemplateVisible,
  knownDesignIds,
  knownTemplateIds,
  listAllTemplates,
  listDesigns,
  listInvites,
  listMembers,
  listTemplateGrants,
  listTemplatesForTenant,
  listTenants,
  liveDesignCount,
  openDatabase,
  revokeTemplateGrant,
  upsertDesign,
  upsertTemplate,
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

// Same principle for storage: a layout that cannot keep tenants apart would
// serve one client another client's designs, so refuse rather than leak.
if (storageConfigError) {
  console.error(`\nRefusing to start: ${storageConfigError}\n`);
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

/**
 * Where a template's payload lives. Templates we publish are shared, so they go
 * in the global templates directory; a client's own templates live inside that
 * client's directory, which is what keeps them private.
 */
const templateDirFor = (scope, tenantId) => {
  const paths = getStoragePaths(scope === 'tenant' ? tenantId : undefined);
  return scope === 'tenant' ? paths.tenantTemplatesDir : paths.templatesDir;
};

const templateThumbDir = (dir) => path.join(dir, 'thumbs');

/** Read one template payload. Null when the file is missing or unusable. */
const readTemplatePayload = (dir, id) => {
  const filePath = path.join(dir, `${id}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!isSerializedPage(raw?.elements)) return null;
    return {
      // The file name is the identity, exactly as it is for designs.
      id,
      name:
        typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
      img: typeof raw.img === 'string' ? raw.img : '',
      elements: raw.elements,
    };
  } catch (error) {
    console.warn(`Skipping bad template ${id}:`, error.message);
    return null;
  }
};

const writeTemplatePayload = (dir, record) => {
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(
    path.join(dir, `${record.id}.json`),
    JSON.stringify(
      {
        id: record.id,
        name: record.name,
        img: record.img ?? '',
        elements: record.elements,
      },
      null,
      2,
    ),
  );
};

/**
 * Index template payloads the database doesn't know about yet: the ones
 * packaged with the app, anything dropped into the templates directory by hand,
 * and a tenant's own templates. Mirrors `adoptOrphanDesigns` for designs.
 */
const adoptOrphanTemplates = (db, dir, scope, tenantId = null) => {
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  if (files.length === 0) return 0;
  const known = knownTemplateIds(db, scope, tenantId);
  let adopted = 0;
  for (const file of files) {
    const id = file.replace(/\.json$/i, '');
    if (known.has(id)) continue;
    const payload = readTemplatePayload(dir, id);
    if (!payload) continue;
    const row = upsertTemplate(db, {
      id,
      scope,
      tenantId,
      name: payload.name,
      createdAt: Date.now(),
    });
    // A packaged template usually points at a static preview image. Copy it in
    // so the preview survives even if that asset moves, and so listing
    // templates never has to open the payload files at all.
    const thumbPath = adoptTemplatePreview(bootPaths.publicDir, dir, id, payload.img);
    if (thumbPath && row) {
      upsertTemplate(db, { id, scope, tenantId, name: payload.name, thumbPath });
    }
    adopted += 1;
  }
  return adopted;
};

/** Copy a template's static preview image in, returning the recorded file. */
const adoptTemplatePreview = (publicDir, dir, id, img) => {
  if (!img || /^https?:\/\//i.test(img) || img.includes('..')) return null;
  const source = path.join(publicDir, img.replace(/^\/+/, ''));
  if (!existsSync(source)) return null;
  const thumbs = templateThumbDir(dir);
  mkdirSync(thumbs, { recursive: true });
  const file = `${id}${path.extname(source) || '.png'}`;
  copyFileSync(source, path.join(thumbs, file));
  return file;
};

/**
 * Preview for a template: its own thumbnail when it has one, otherwise the
 * static image path recorded in the payload (which is how the packaged
 * templates carry their preview).
 */
const templatePreviewUrl = (req, row, payload) => {
  if (row.thumbPath) {
    return absoluteUrl(req, `/templates/${encodeURIComponent(row.id)}/thumb`);
  }
  const img = payload?.img;
  if (!img) return '';
  return /^https?:\/\//i.test(img) ? img : absoluteUrl(req, img);
};

/** Give a brand-new design the template's preview, so the grid isn't blank. */
const copyTemplateThumbnail = (paths, row, payload, designId) => {
  const sources = [];
  if (row.thumbPath) {
    sources.push(
      path.join(
        templateThumbDir(templateDirFor(row.scope, row.tenantId)),
        path.basename(row.thumbPath),
      ),
    );
  }
  if (payload?.img && !/^https?:\/\//i.test(payload.img) && !payload.img.includes('..')) {
    sources.push(path.join(paths.publicDir, payload.img.replace(/^\/+/, '')));
  }
  const source = sources.find((candidate) => existsSync(candidate));
  if (!source) return null;
  const file = `${designId}${path.extname(source) || '.png'}`;
  writeFileAtomic(path.join(paths.thumbsDir, file), readFileSync(source));
  return file;
};

/** The shape every template response uses. */
const templateResponse = (req, row, payload) => ({
  id: row.id,
  name: payload?.name ?? row.name,
  scope: row.scope,
  // `shared` tells the UI this came from us rather than from the client itself.
  shared: row.scope === 'global',
  img: templatePreviewUrl(req, row, payload),
  elements: payload?.elements ?? null,
});

/**
 * The list deliberately omits `elements`. A template payload is a whole design,
 * so shipping every one of them on every page load is exactly the mistake the
 * designs list used to make. The browser fetches `GET /templates/:id` when it
 * actually needs the content.
 */
const templateSummary = (req, row, payload) => ({
  id: row.id,
  name: payload?.name ?? row.name,
  scope: row.scope,
  shared: row.scope === 'global',
  img: templatePreviewUrl(req, row, payload),
});

/**
 * The payload for a template the caller is allowed to see, or null. Both the
 * "does not exist" and "not shared with you" cases return null on purpose: a
 * client has no business learning which templates exist for someone else.
 */
const visibleTemplatePayload = (paths, tenantId, id) => {
  const row = getTemplate(db, id);
  if (!row || !isTemplateVisible(db, tenantId, id)) return null;
  const payload = readTemplatePayload(
    templateDirFor(row.scope, row.tenantId),
    row.id,
  );
  return payload ? { row, payload } : null;
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
    templates: listAllTemplates(db).length,
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
    <li><code>GET ${BASE_PATH}/api/templates</code> — templates shared with you, plus your own</li>
    <li><code>POST ${BASE_PATH}/api/templates/:id/use</code> — copy one into a design you own</li>
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

/**
 * Boot: index the templates packaged with the app, plus anything dropped into
 * the shared templates directory by hand, so the database knows about them
 * before the first request. A tenant's own templates are adopted lazily.
 */
adoptOrphanTemplates(db, bootPaths.templatesDir, 'global');

/**
 * Templates
 *
 * Clients never edit a template: "use" always copies it into a design the client
 * owns, so a shared template can never be mutated by the people it is shared
 * with. A client may create templates of its own, and those are private to it —
 * only an administrator can publish something everyone can see.
 */
api.get('/templates', (req, res) => {
  const paths = pathsFor(req);
  const tenantId = tenantOf(req);
  ensureTenant(db, tenantId);
  // A tenant's own templates are adopted here rather than at boot, because the
  // server does not know every tenant that exists.
  adoptOrphanTemplates(db, paths.tenantTemplatesDir, 'tenant', tenantId);
  const templates = [];
  for (const row of listTemplatesForTenant(db, tenantId)) {
    // Only an existence check — the payload is a whole design, and the browser
    // asks for it separately when it actually uses the template.
    const dir = templateDirFor(row.scope, row.tenantId);
    if (!existsSync(path.join(dir, `${row.id}.json`))) {
      console.warn(`Template ${row.id} has no payload file; skipping.`);
      continue;
    }
    templates.push(templateSummary(req, row, null));
  }
  res.json(templates);
});

api.get('/templates/:id/thumb', (req, res) => {
  const id = safeId(req.params.id);
  const found = visibleTemplatePayload(pathsFor(req), tenantOf(req), id);
  const filePath = found?.row.thumbPath
    ? path.join(
        templateThumbDir(
          templateDirFor(found.row.scope, found.row.tenantId),
        ),
        path.basename(found.row.thumbPath),
      )
    : null;
  if (!filePath || !existsSync(filePath)) {
    res.status(404).json({ error: 'No thumbnail for this template' });
    return;
  }
  res.type(path.extname(filePath)).sendFile(filePath);
});

api.get('/templates/:id', (req, res) => {
  const id = safeId(req.params.id);
  const found = visibleTemplatePayload(pathsFor(req), tenantOf(req), id);
  if (!found) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(templateResponse(req, found.row, found.payload));
});

api.post('/templates', (req, res) => {
  const tenantId = tenantOf(req);
  const isAdmin = Boolean(req.identity.isAdmin);
  const publishShared = req.body?.scope === 'global';
  if (publishShared && !isAdmin) {
    res.status(403).json({
      error: 'Only an administrator can publish a template for everyone',
      code: 'forbidden',
    });
    return;
  }
  // A tenant template belongs to the caller, unless an admin is creating one on
  // behalf of a specific client.
  const ownerTenant =
    publishShared || !isAdmin || !req.body?.tenantId
      ? tenantId
      : safeId(req.body.tenantId);
  const scope = publishShared ? 'global' : 'tenant';

  // Either a serialized page arrives directly, or the caller points at one of
  // its own designs and we publish that.
  let elements = req.body?.elements;
  let sourceThumbPath = null;
  if (!isSerializedPage(elements)) {
    const sourceId = req.body?.sourceDesignId ? safeId(req.body.sourceDesignId) : null;
    const sourceRow = sourceId ? getDesign(db, tenantId, sourceId) : null;
    const pages = sourceRow
      ? readDesignPayload(pathsFor(req).designsDir, sourceId)
      : null;
    if (!sourceRow || !pages) {
      res.status(400).json({
        error:
          'Body must include elements as a SerializedPage, or sourceDesignId of one of your designs',
      });
      return;
    }
    elements = pages[0];
    sourceThumbPath = sourceRow.thumbPath;
  }

  const id = safeId(req.body?.id);
  const name =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : `Template ${id.slice(0, 8)}`;
  const dir = templateDirFor(scope, ownerTenant);
  if (existsSync(path.join(dir, `${id}.json`)) && !req.body?.overwrite) {
    res.status(409).json({ error: 'Template id already exists' });
    return;
  }

  const img =
    typeof req.body?.img === 'string' && req.body.img.trim()
      ? req.body.img.trim()
      : '';
  writeTemplatePayload(dir, { id, name, img, elements });

  // Give the template a preview file of its own, taken from the design it came
  // from or from the image the caller pointed at.
  let thumbPath = null;
  if (sourceThumbPath) {
    const source = path.join(
      pathsFor(req).thumbsDir,
      path.basename(sourceThumbPath),
    );
    if (existsSync(source)) {
      const thumbs = templateThumbDir(dir);
      mkdirSync(thumbs, { recursive: true });
      thumbPath = `${id}${path.extname(source) || '.png'}`;
      copyFileSync(source, path.join(thumbs, thumbPath));
    }
  }
  if (!thumbPath) {
    thumbPath = adoptTemplatePreview(pathsFor(req).publicDir, dir, id, img);
  }

  ensureTenant(db, ownerTenant);
  const row = upsertTemplate(db, {
    id,
    scope,
    tenantId: ownerTenant,
    name,
    thumbPath,
    createdBy: req.identity.member.id,
  });
  res.status(201).json(templateResponse(req, row, readTemplatePayload(dir, id)));
});

api.delete('/templates/:id', (req, res) => {
  const tenantId = tenantOf(req);
  const id = safeId(req.params.id);
  const row = getTemplate(db, id);
  // A client can delete its own templates. A shared template is ours to manage.
  const allowed =
    row &&
    isTemplateVisible(db, tenantId, id) &&
    (row.scope === 'tenant' ? row.tenantId === tenantId : req.identity.isAdmin);
  if (!allowed) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  deleteTemplate(db, id);
  const dir = templateDirFor(row.scope, row.tenantId);
  for (const file of [
    path.join(dir, `${row.id}.json`),
    row.thumbPath
      ? path.join(templateThumbDir(dir), path.basename(row.thumbPath))
      : null,
  ]) {
    if (file && existsSync(file)) unlinkSync(file);
  }
  res.status(204).end();
});

/**
 * Copy a template into the caller's own workspace as a new design. This is the
 * only way a client gets content out of a template, and it means the template
 * itself can never be edited by the client that used it.
 */
api.post('/templates/:id/use', (req, res) => {
  const paths = pathsFor(req);
  const tenantId = tenantOf(req);
  const id = safeId(req.params.id);
  const found = visibleTemplatePayload(paths, tenantId, id);
  if (!found) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const designId = safeId(req.body?.id);
  const filePath = path.join(paths.designsDir, `${designId}.json`);
  if (existsSync(filePath) && !req.body?.overwrite) {
    res.status(409).json({ error: 'Design id already exists' });
    return;
  }

  ensureTenant(db, tenantId);
  const now = Date.now();
  const name =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : found.payload.name;
  const pages = [found.payload.elements];
  const serialized = JSON.stringify({ id: designId, name, updatedAt: now, pages }, null, 2);
  writeFileAtomic(filePath, serialized);
  const thumbPath = copyTemplateThumbnail(paths, found.row, found.payload, designId);
  upsertDesign(db, {
    id: designId,
    tenantId,
    ownerId: req.identity.member.id,
    name,
    createdAt: now,
    updatedAt: now,
    bytes: Buffer.byteLength(serialized),
    thumbPath,
  });
  res.status(201).json({
    id: designId,
    name,
    updatedAt: now,
    fromTemplateId: id,
    thumbUrl: thumbPath
      ? absoluteUrl(req, `/designs/${encodeURIComponent(designId)}/thumb`)
      : null,
  });
});

/** Admin: which templates exist, and who each one is shared with. */
api.get('/admin/templates', requireAdmin, (req, res) => {
  res.json(
    listAllTemplates(db).map((row) => ({
      id: row.id,
      name: row.name,
      scope: row.scope,
      tenantId: row.tenantId,
      thumbUrl: row.thumbPath
        ? absoluteUrl(req, `/templates/${encodeURIComponent(row.id)}/thumb`)
        : null,
      grants: row.scope === 'global' ? listTemplateGrants(db, row.id) : [],
    })),
  );
});

/**
 * Share a global template with specific tenants. Until the first grant a global
 * template is visible to everyone; granting narrows it to the listed tenants.
 */
api.post('/admin/template-grants', requireAdmin, (req, res) => {
  const templateId = safeId(req.body?.templateId);
  const tenantId = safeId(req.body?.tenantId);
  const row = getTemplate(db, templateId);
  if (!row) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  if (row.scope !== 'global') {
    res.status(400).json({ error: 'Only shared templates can be granted' });
    return;
  }
  const before = listTemplateGrants(db, templateId).length;
  const grants = grantTemplate(db, templateId, tenantId);
  res.status(before === grants.length ? 200 : 201).json({ grants });
});

api.delete('/admin/template-grants/:templateId/:tenantId', requireAdmin, (req, res) => {
  const removed = revokeTemplateGrant(
    db,
    safeId(req.params.templateId),
    safeId(req.params.tenantId),
  );
  res.status(removed ? 204 : 404).end();
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
  if (storageRootIsEphemeral) {
    console.log('');
    console.log(`!! STORAGE_ROOT is inside the app directory (${bootPaths.storageRoot}).`);
    console.log('!! In a container that is lost on redeploy. Point it at the volume.');
    console.log('');
  }
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
