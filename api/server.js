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
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  getStoragePaths,
  storageConfig,
  storageConfigError,
  storageRootIsEphemeral,
} from './storagePaths.js';
import {
  countAssets,
  createInvite,
  createShareLink,
  deleteAsset,
  deleteDesign,
  deleteInvite,
  deleteTemplate,
  designOwner,
  ensureTenant,
  getAsset,
  getBrandKit,
  getDesign,
  getTemplate,
  getTenant,
  grantTemplate,
  isTemplateVisible,
  knownDesignIds,
  listAllTemplates,
  listAssets,
  listAudit,
  listDesigns,
  listInvites,
  listMembers,
  listTemplateGrants,
  listTemplatesForTenant,
  listTenants,
  liveDesignCount,
  liveShareLink,
  openDatabase,
  recordAudit,
  resolveShareToken,
  revokeDesignShareLinks,
  revokeTemplateGrant,
  upsertAsset,
  upsertBrandKit,
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
//
// `/fonts` is the catalogue the share view needs in order to register the faces
// a design names; without it an anonymous reader gets fallback type and no
// indication why. It is a fixed list of open-licensed families, so there is
// nothing in it that belongs to a tenant.
const PUBLIC_ROUTES = new Set(['/health', '/', '/fonts', '/auth/config']);
/**
 * Path prefixes that must work without an identity.
 *
 * A share link is opened by someone with no account — that is what it is for —
 * so the request that serves it cannot require credentials. Everything under
 * here is therefore responsible for its own authorisation, which in this case
 * means the token being the only thing that identifies the design.
 *
 * The asset catalogue and the font files are here for a different reason: a
 * design stores the absolute URL of every frame, graphic and font it uses, so a
 * shared design cannot render unless those URLs are readable without
 * credentials. Both catalogues are global — the assets table says so, and the
 * fonts are a fixed list of open-licensed families — so there is no tenant data
 * to protect, and the files ship inside the application anyway. Note the
 * trailing slashes: they admit `/assets/<id>/content` and `/fonts/files/<name>`
 * while leaving the `/assets` listing, the admin routes and `/fonts` itself
 * behind authentication.
 */
const PUBLIC_PREFIXES = ['/shared/', '/assets/', '/fonts/files/'];
const isPublicPath = (requestPath) =>
  PUBLIC_ROUTES.has(requestPath) ||
  PUBLIC_PREFIXES.some((prefix) => requestPath.startsWith(prefix));

api.use((req, res, next) => {
  if (isPublicPath(req.path)) {
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

/**
 * A small in-memory limiter, keyed by tenant and address.
 *
 * This deployment runs a single replica, so per-process state is the whole
 * story; the point is to stop one client hammering the API or treating uploads
 * as free storage, not to be defence in depth on its own. The limits are
 * configurable so a busy client can be raised without a code change.
 *
 * Mounted after identity resolution, so the key can include the tenant rather
 * than only an address. Requests that fail authentication are rejected by the
 * identity middleware before reaching this.
 */
const rateLimit = ({ windowMs, max, name }) => {
  const hits = new Map();
  let lastSweep = Date.now();
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
      lastSweep = now;
    }
    const key = `${req.identity?.tenantId ?? 'anonymous'}|${req.ip}`;
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
    }
    entry.count += 1;
    hits.set(key, entry);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      res.status(429).json({
        error: `Too many ${name} requests. Try again in a moment.`,
        code: 'rate-limited',
      });
      return;
    }
    next();
  };
};

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const readLimit = rateLimit({
  windowMs: 60_000,
  max: numberFromEnv('RATE_LIMIT_READS_PER_MINUTE', 1200),
  name: 'read',
});
const writeLimit = rateLimit({
  windowMs: 60_000,
  max: numberFromEnv('RATE_LIMIT_WRITES_PER_MINUTE', 240),
  name: 'write',
});
const uploadLimit = rateLimit({
  windowMs: 60_000,
  max: numberFromEnv('RATE_LIMIT_UPLOADS_PER_MINUTE', 30),
  name: 'upload',
});

// Reads and writes get separate budgets: browsing a gallery should never be the
// thing that stops you saving.
api.use((req, res, next) => {
  const limit =
    req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
      ? readLimit
      : writeLimit;
  limit(req, res, next);
});

// The tenant every request belongs to. Resolved from a verified identity — a
// caller can no longer name the tenant it wants to read.
const tenantOf = (req) => req.identity.tenantId;

const pathsFor = (req) => getStoragePaths(tenantOf(req));

/**
 * Record who changed what. The caller's tenant is the default, but an admin
 * acting on another workspace passes `tenantId` so the entry lands in the
 * client's own log rather than the admin's.
 */
const audit = (req, entry) =>
  recordAudit(db, {
    tenantId: tenantOf(req),
    memberId: req.identity.member.id,
    memberEmail: req.identity.member.email,
    ...entry,
  });

const absoluteUrl = (req, pathname) => {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const origin = `${req.protocol}://${req.get('host')}`;
  const assetPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${origin}${BASE_PATH}/api${assetPath}`;
};

/**
 * A thumbnail URL, but only when there is a file behind it.
 *
 * A row can name a thumbnail whose file has gone — a pruned data directory, a
 * design copied from a template whose preview was never written. Advertising the
 * URL anyway hands the browser a 404 whose body is JSON, and for an `<img>` that
 * surfaces as `net::ERR_BLOCKED_BY_ORB`: no picture, and an error name that says
 * nothing about the cause. No file means no URL, and the client draws its
 * "no preview" tile instead of asking for something that is not there.
 */
const thumbUrlFor = (req, kind, row, thumbsDir) => {
  if (!row?.thumbPath) return null;
  const file = path.join(thumbsDir, path.basename(row.thumbPath));
  if (!existsSync(file)) return null;
  return absoluteUrl(req, `/${kind}/${encodeURIComponent(row.id)}/thumb`);
};

/**
 * A URL for the application itself, rather than for an API resource.
 *
 * `absoluteUrl` deliberately points inside `/api`, which is right for a
 * thumbnail a client will fetch and wrong for a link a human will paste into a
 * browser — that has to land on the app, at whatever base path it is served from.
 */
const appUrl = (req, pathname) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const relative = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${origin}${BASE_PATH}${relative}`;
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
  let changed = 0;
  for (const file of files) {
    const id = file.replace(/\.json$/i, '');
    const row = getTemplate(db, id);
    if (row) {
      // Already indexed. The only thing worth doing again is repairing a row
      // that predates previews being copied in; `thumbPath` decides that, so
      // the payload is only opened when it is genuinely missing.
      if (row.thumbPath) continue;
      const payload = readTemplatePayload(dir, id);
      const thumbPath = payload
        ? adoptTemplatePreview(bootPaths.publicDir, dir, id, payload.img)
        : null;
      if (thumbPath) {
        upsertTemplate(db, {
          id,
          scope: row.scope,
          tenantId: row.tenantId,
          name: row.name,
          thumbPath,
        });
        changed += 1;
      }
      continue;
    }

    const payload = readTemplatePayload(dir, id);
    if (!payload) continue;
    upsertTemplate(db, {
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
    if (thumbPath) {
      upsertTemplate(db, { id, scope, tenantId, name: payload.name, thumbPath });
    }
    changed += 1;
  }
  return changed;
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

/**
 * What a file actually is, decided by its bytes.
 *
 * The upload used to keep whatever extension the client sent and serve it back
 * from our own origin, so "logo.png" could be HTML or a script-bearing SVG and
 * the browser would be invited to run it. The extension is now derived from the
 * content and the client's is ignored entirely.
 */
const startsWithBytes = (buffer, bytes) =>
  buffer.length >= bytes.length &&
  buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));

const detectImageExtension = (buffer) => {
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (
    startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  // SVG is text, and an XML declaration or comment may precede the root element.
  const head = buffer.subarray(0, 1024);
  if (!head.includes(0) && /<svg[\s>]/i.test(head.toString('utf8'))) return 'svg';
  return null;
};

const UPLOAD_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

const upload = multer({
  // In memory, so nothing reaches the disk before its content has been checked.
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

/** Run multer and turn its errors into something a client can act on. */
const uploadSingle = (req, res, next) =>
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'That file is larger than the 15 MB limit' });
      return;
    }
    res.status(400).json({ error: 'Upload rejected' });
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
  // Uploaded content is untrusted and comes back from our own origin. An SVG
  // can carry script, so it is served with a policy that forbids everything and
  // a type that is never sniffed into something executable.
  const extension = path.extname(filePath).slice(1).toLowerCase();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  res.type(UPLOAD_MIME[extension] ?? 'application/octet-stream');
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

/**
 * What the browser needs in order to sign someone in.
 *
 * Public on purpose: an unauthenticated page has to know whether there is a
 * sign-in at all, and everything in here is public by definition in OIDC — an
 * issuer, a client id, and the scopes to ask for. Serving it from the API is
 * what lets the SPA stay build-once: point `OIDC_ISSUER` at a different realm
 * and the browser follows, with no rebuild.
 */
api.get('/auth/config', (_req, res) => {
  res.json({
    mode: authConfig.mode,
    issuer: authConfig.issuer,
    clientId: authConfig.clientId,
    scopes: authConfig.scopes,
    allowSignup: authConfig.allowSignup,
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
  audit(req, { action: 'tenant.create', targetType: 'tenant', targetId: id, detail: { name } });
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
  const invite = createInvite(db, {
    email,
    tenantId,
    role: req.body?.role === 'admin' ? 'admin' : 'member',
    invitedBy: req.identity.member.id,
  });
  audit(req, {
    tenantId,
    action: 'invite.create',
    targetType: 'invite',
    targetId: email,
    detail: { role: invite.role },
  });
  res.status(201).json(invite);
});

api.delete('/admin/invites/:email', requireAdmin, (req, res) => {
  const removed = deleteInvite(db, req.params.email);
  if (removed) {
    audit(req, {
      action: 'invite.delete',
      targetType: 'invite',
      targetId: req.params.email,
    });
  }
  res.status(removed ? 204 : 404).end();
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

  // Template ids are unique across every scope and tenant, so reusing one that
  // belongs to someone else would rewrite their row — a client picking
  // "blank-white" would take the shared template away from everyone.
  const existingRow = getTemplate(db, id);
  const sameOwner =
    existingRow !== null &&
    existingRow.scope === scope &&
    (scope === 'global' || existingRow.tenantId === ownerTenant);
  if (existingRow && !sameOwner) {
    res.status(409).json({ error: 'That template id is already taken' });
    return;
  }
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
  audit(req, {
    tenantId: ownerTenant,
    action: 'template.create',
    targetType: 'template',
    targetId: id,
    detail: { name, scope, sourceDesignId: req.body?.sourceDesignId ?? null },
  });
  res.status(201).json(templateResponse(req, row, readTemplatePayload(dir, id)));
});

api.delete('/templates/:id', (req, res) => {
  const tenantId = tenantOf(req);
  const id = safeId(req.params.id);
  const row = getTemplate(db, id);
  // A client can delete the templates it owns, of any scope it is allowed to
  // create. An administrator can delete anything — including a template that is
  // private to a client, which the admin screen needs and which the old rule
  // refused with a 404 that looked like the template had already gone.
  const allowed =
    row &&
    (req.identity.isAdmin ||
      (row.scope === 'tenant' &&
        row.tenantId === tenantId &&
        isTemplateVisible(db, tenantId, id)));
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
  audit(req, {
    action: 'template.delete',
    targetType: 'template',
    targetId: id,
    detail: { name: row.name, scope: row.scope },
  });
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
    version: 1,
  });
  audit(req, {
    action: 'template.use',
    targetType: 'template',
    targetId: id,
    detail: { designId, name },
  });
  res.status(201).json({
    id: designId,
    name,
    updatedAt: now,
    version: 1,
    fromTemplateId: id,
    thumbUrl: thumbUrlFor(req, 'designs', { id: designId, thumbPath }, paths.thumbsDir),
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
      // The preview comes from the admin route, not `/templates/:id/thumb`: that
      // one is scoped to the caller's own workspace, so an admin looking at a
      // template private to somebody else would be handed a URL that 404s for
      // them (and surfaces as ERR_BLOCKED_BY_ORB in the browser).
      thumbUrl: thumbUrlFor(
        req,
        'admin/templates',
        row,
        templateThumbDir(templateDirFor(row.scope, row.tenantId)),
      ),
      grants: row.scope === 'global' ? listTemplateGrants(db, row.id) : [],
    })),
  );
});

/** Admin preview of any template, whichever workspace owns it. */
api.get('/admin/templates/:id/thumb', requireAdmin, (req, res) => {
  const id = safeId(req.params.id);
  const row = getTemplate(db, id);
  const filePath = row?.thumbPath
    ? path.join(
        templateThumbDir(templateDirFor(row.scope, row.tenantId)),
        path.basename(row.thumbPath),
      )
    : null;
  if (!filePath || !existsSync(filePath)) {
    res.status(404).json({ error: 'No thumbnail for this template' });
    return;
  }
  res.type(path.extname(filePath)).sendFile(filePath);
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
  if (before !== grants.length) {
    audit(req, {
      tenantId,
      action: 'template.grant',
      targetType: 'template',
      targetId: templateId,
      detail: { sharedWith: tenantId },
    });
  }
  res.status(before === grants.length ? 200 : 201).json({ grants });
});

api.delete('/admin/template-grants/:templateId/:tenantId', requireAdmin, (req, res) => {
  const templateId = safeId(req.params.templateId);
  const tenantId = safeId(req.params.tenantId);
  const removed = revokeTemplateGrant(db, templateId, tenantId);
  if (removed) {
    audit(req, {
      tenantId,
      action: 'template.revoke',
      targetType: 'template',
      targetId: templateId,
      detail: { noLongerSharedWith: tenantId },
    });
  }
  res.status(removed ? 204 : 404).end();
});

/** The audit trail. Admins only; the log names members and what they touched. */
api.get('/admin/audit', requireAdmin, (req, res) => {
  const tenantId = req.query.tenantId ? safeId(req.query.tenantId) : null;
  res.json(listAudit(db, { tenantId, limit: req.query.limit }));
});

/** Designs */
api.get('/designs', (req, res) => {
  const { designsDir, thumbsDir, userId } = pathsFor(req);
  ensureTenant(db, userId);
  adoptOrphanDesigns(db, userId, designsDir);
  // One indexed query — the old version parsed every design file in full.
  res.json(
    listDesigns(db, userId).map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt,
      version: row.version,
      userId,
      thumbUrl: thumbUrlFor(req, 'designs', row, thumbsDir),
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
    version: row.version,
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
  // Design ids are global, so an id that belongs to another tenant must never
  // be reusable here — that would move their row to us.
  const owner = designOwner(db, id);
  if (owner && owner !== userId) {
    res.status(409).json({ error: 'Design id belongs to another workspace' });
    return;
  }
  const existing = getDesign(db, userId, id);

  // Optimistic concurrency. Two people editing one design used to be a silent
  // clobber: whoever saved last won and the other's work simply vanished. A
  // caller that knows which version it started from is told to look again
  // instead. The read above and the write below are synchronous, so nothing can
  // slip between them on a single-process server.
  const baseVersion = Number(req.body?.baseVersion);
  if (
    existing &&
    Number.isFinite(baseVersion) &&
    baseVersion > 0 &&
    baseVersion !== existing.version
  ) {
    res.status(409).json({
      error: 'This design was changed somewhere else since you opened it',
      code: 'version-conflict',
      current: {
        id: existing.id,
        name: existing.name,
        updatedAt: existing.updatedAt,
        version: existing.version,
        thumbUrl: thumbUrlFor(req, 'designs', existing, thumbsDir),
      },
    });
    return;
  }

  const now = Date.now();
  const version = (existing?.version ?? 0) + 1;
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
    version,
  });
  audit(req, {
    action: 'design.update',
    targetType: 'design',
    targetId: id,
    detail: { name, bytes: Buffer.byteLength(serialized), version },
  });
  res.json({
    id,
    name,
    updatedAt: now,
    version,
    thumbUrl: thumbUrlFor(req, 'designs', { id, thumbPath }, thumbsDir),
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
  const owner = designOwner(db, id);
  if (owner && owner !== userId) {
    res.status(409).json({ error: 'Design id belongs to another workspace' });
    return;
  }
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
    version: 1,
  });
  audit(req, {
    action: 'design.create',
    targetType: 'design',
    targetId: id,
    detail: { name, bytes: Buffer.byteLength(serialized) },
  });
  res.status(201).json({
    id,
    name,
    updatedAt: now,
    version: 1,
    thumbUrl: thumbUrlFor(req, 'designs', { id, thumbPath }, thumbsDir),
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
  audit(req, {
    action: 'design.delete',
    targetType: 'design',
    targetId: row.id,
    detail: { name: row.name },
  });
  // A tombstoned design would otherwise leave its links looking live, and the
  // public path would have to distinguish "revoked" from "deleted".
  revokeDesignShareLinks(db, row.id);
  res.status(204).end();
});

/* --- Share links ---------------------------------------------------------
 * A read-only link to one design, for somebody with no account. Creating one
 * requires the design, which means it requires an identity and the tenant the
 * design belongs to; opening one requires only the token.
 *
 * The token is 24 random bytes, base64url — the same length as a session
 * identifier, and the only thing standing between the public internet and a
 * client's design. Nothing in the response lets a holder find anything else.
 * --------------------------------------------------------------------- */

/** 24 bytes of base64url: 32 characters, not enumerable. */
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const newShareToken = () => randomBytes(24).toString('base64url');

api.post('/designs/:id/share', writeLimit, (req, res) => {
  const { userId } = pathsFor(req);
  ensureTenant(db, userId);
  const id = safeId(req.params.id);
  const row = getDesign(db, userId, id);
  if (!row) {
    res.status(404).json({ error: 'Design not found' });
    return;
  }

  // One live link per design, not one per click: the dialog shows the link that
  // exists rather than quietly invalidating what was already sent to someone.
  const live = liveShareLink(db, id);
  if (live) {
    res.json({ token: live.token, url: appUrl(req, `/?share=${live.token}`), createdAt: live.createdAt });
    return;
  }

  const token = newShareToken();
  const createdAt = Date.now();
  createShareLink(db, {
    token,
    designId: id,
    tenantId: userId,
    createdAt,
    createdBy: req.identity.member.id,
  });
  audit(req, {
    action: 'share.create',
    targetType: 'design',
    targetId: id,
    detail: { name: row.name },
  });
  res.status(201).json({ token, url: appUrl(req, `/?share=${token}`), createdAt });
});

api.delete('/designs/:id/share', writeLimit, (req, res) => {
  const { userId } = pathsFor(req);
  const id = safeId(req.params.id);
  const row = getDesign(db, userId, id);
  if (!row) {
    res.status(404).json({ error: 'Design not found' });
    return;
  }
  const revoked = revokeDesignShareLinks(db, id);
  if (revoked) {
    audit(req, {
      action: 'share.revoke',
      targetType: 'design',
      targetId: id,
      detail: { name: row.name, links: revoked },
    });
  }
  res.json({ revoked });
});

/**
 * The public read. No identity, no session — the token is the whole request.
 *
 * `no-store` because a withdrawn link must stop working immediately; a shared
 * cache or a browser holding a copy would keep serving it afterwards.
 */
api.get('/shared/:token', readLimit, (req, res) => {
  const token = String(req.params.token ?? '');
  // Shape check before the lookup, so junk never reaches the index.
  if (!SHARE_TOKEN_PATTERN.test(token)) {
    res.status(404).json({ error: 'This link is not available' });
    return;
  }

  const link = resolveShareToken(db, token);
  const row = link ? getDesign(db, link.tenantId, link.designId) : null;
  const pages = row
    ? readDesignPayload(getStoragePaths(link.tenantId).designsDir, row.id)
    : null;
  if (!link || !row || !pages) {
    res.status(404).json({ error: 'This link is not available' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    name: row.name,
    updatedAt: row.updatedAt,
    sharedAt: link.createdAt,
    pages,
  });
});

/** Uploads */
api.get('/uploads', (req, res) => {
  const { uploadsDir } = pathsFor(req);
  res.json(readUploads(uploadsDir, req));
});

api.post('/uploads', uploadLimit, uploadSingle, (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Expected multipart field "file"' });
    return;
  }
  const extension = detectImageExtension(req.file.buffer);
  if (!extension) {
    res.status(415).json({
      error: 'That file is not a PNG, JPEG, GIF, WebP or SVG image',
      code: 'unsupported-media-type',
    });
    return;
  }
  const userId = tenantOf(req);
  const file = `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  writeFileAtomic(path.join(pathsFor(req).uploadsDir, file), req.file.buffer);
  recordAudit(db, {
    tenantId: userId,
    memberId: req.identity.member.id,
    memberEmail: req.identity.member.email,
    action: 'upload.create',
    targetType: 'upload',
    targetId: file,
    detail: { bytes: req.file.size, type: extension },
  });
  res.status(201).json({
    id: file,
    name: req.file.originalname || file,
    type: extension === 'svg' ? 'svg' : 'image',
    url: absoluteUrl(
      req,
      `/media/uploads/${encodeURIComponent(userId)}/${encodeURIComponent(file)}`,
    ),
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
  recordAudit(db, {
    tenantId: tenantOf(req),
    memberId: req.identity.member.id,
    memberEmail: req.identity.member.email,
    action: 'upload.delete',
    targetType: 'upload',
    targetId: path.basename(req.params.id),
  });
  res.status(204).end();
});

/* --- Shared asset library ------------------------------------------------
 * The Frames, Graphic and Image panels used to call `/frames`, `/graphics` and
 * `/images` against a service that was never part of this app, so they could
 * never populate. Those paths are now backed by a real catalogue: artwork on
 * disk, metadata in the database, adopted on boot like templates.
 * --------------------------------------------------------------------- */

const ASSET_CATEGORIES = new Set(['frames', 'graphics', 'images']);
const SEED_ASSETS_DIR = path.join(__dirname, 'data', 'assets');

const assetDir = (paths, category) => path.join(paths.assetsDir, category);

/** Tags are stored comma-joined; callers want a list. */
const splitTags = (tags) =>
  typeof tags === 'string' && tags ? tags.split(',').filter(Boolean) : [];

/**
 * Copy the packaged artwork into the storage root the first time.
 *
 * Only files that are not already there, so an edited or added asset in the
 * storage root is never overwritten by a redeploy.
 */
const seedAssets = (paths) => {
  for (const category of ASSET_CATEGORIES) {
    const source = path.join(SEED_ASSETS_DIR, category);
    if (!existsSync(source)) continue;
    const destination = assetDir(paths, category);
    mkdirSync(destination, { recursive: true });
    for (const file of readdirSync(source)) {
      const target = path.join(destination, file);
      if (!existsSync(target)) copyFileSync(path.join(source, file), target);
    }
  }
};

/** Metadata for a category, keyed by file name, from its manifest. */
const readAssetManifest = (dir) => {
  const manifestFile = path.join(dir, 'manifest.json');
  if (!existsSync(manifestFile)) return new Map();
  try {
    const parsed = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter((entry) => entry && typeof entry.file === 'string')
        .map((entry) => [entry.file, entry]),
    );
  } catch (error) {
    console.warn(`Ignoring unreadable asset manifest in ${dir}:`, error.message);
    return new Map();
  }
};

/**
 * Index the artwork in a category that the database doesn't know about yet.
 *
 * A manifest entry, when there is one, carries the metadata the file itself
 * cannot: the frame clip path, and dimensions for artwork whose units are not
 * pixels. Anything without an entry is still adopted, named from its file, so
 * dropping a new SVG into the directory is all it takes to publish it.
 */
const adoptOrphanAssets = (db, dir, category) => {
  if (!existsSync(dir)) return 0;
  const manifest = readAssetManifest(dir);
  const files = readdirSync(dir).filter((name) => /\.(svg|png|jpe?g|webp)$/i.test(name));
  let changed = 0;

  for (const file of files) {
    const id = file.replace(/\.[^.]+$/, '');
    const full = path.join(dir, file);
    const existing = getAsset(db, id);
    const entry = manifest.get(file);

    // Repair a row whose metadata changed in the manifest, and adopt new files.
    const wanted = {
      id,
      category,
      name: entry?.name ?? existing?.name ?? id.replace(/[-_]+/g, ' '),
      tags: entry?.tags ?? existing?.tags ?? [],
      kind: path.extname(file).slice(1).toLowerCase(),
      width: entry?.width ?? existing?.width ?? null,
      height: entry?.height ?? existing?.height ?? null,
      clipPath: entry?.clipPath ?? existing?.clipPath ?? null,
      bytes: statSync(full).size,
      createdAt: existing?.createdAt ?? Date.now(),
    };

    if (existing) {
      const unchanged =
        existing.category === wanted.category &&
        existing.name === wanted.name &&
        existing.tags === wanted.tags &&
        existing.kind === wanted.kind &&
        existing.width === wanted.width &&
        existing.height === wanted.height &&
        existing.clipPath === wanted.clipPath &&
        existing.bytes === wanted.bytes;
      if (unchanged) continue;
    }
    upsertAsset(db, wanted);
    changed += 1;
  }
  return changed;
};

const adoptAllAssets = (db, paths) => {
  let changed = 0;
  for (const category of ASSET_CATEGORIES) {
    changed += adoptOrphanAssets(db, assetDir(paths, category), category);
  }
  return changed;
};

/** The file behind an asset. Assets are ours, so the name is not user input. */
const assetFilePath = (paths, asset) =>
  path.join(assetDir(paths, asset.category), `${asset.id}.${asset.kind}`);

/**
 * Boot: put the packaged artwork in place and index it, so the panels have
 * something to show before the first request.
 */
seedAssets(bootPaths);
adoptAllAssets(db, bootPaths);

const assetUrl = (req, id) =>
  absoluteUrl(req, `/assets/${encodeURIComponent(id)}/content`);

/**
 * The shape the Frames panel expects. It wants a preview image and the clip
 * path, both of which come from the same artwork, so they cannot disagree.
 */
api.get('/frames', (req, res) => {
  const paths = pathsFor(req);
  adoptAllAssets(db, paths);
  res.json(
    listAssets(db, { category: 'frames', limit: 500 }).map((asset) => ({
      id: asset.id,
      name: asset.name,
      img: assetUrl(req, asset.id),
      clipPath: asset.clipPath,
      width: asset.width,
      height: asset.height,
      tags: splitTags(asset.tags),
    })),
  );
});

/**
 * The Graphic panel. It used to fetch each SVG through a `/graphics/download`
 * proxy, which would have had to fetch a caller-supplied URL — an open relay.
 * The artwork is ours, so the URL is simply the asset's own content endpoint.
 */
api.get('/graphics', (req, res) => {
  const paths = pathsFor(req);
  adoptAllAssets(db, paths);
  res.json(
    listAssets(db, {
      category: 'graphics',
      q: req.query.q ? String(req.query.q) : null,
      limit: req.query.limit,
      offset: req.query.offset,
    }).map((asset) => ({
      id: asset.id,
      name: asset.name,
      tags: splitTags(asset.tags),
      thumb: assetUrl(req, asset.id),
      downloadUrl: assetUrl(req, asset.id),
      width: asset.width,
      height: asset.height,
    })),
  );
});

/** The Image panel: backgrounds and textures rather than stock photography. */
api.get('/images', (req, res) => {
  const paths = pathsFor(req);
  adoptAllAssets(db, paths);
  res.json(
    listAssets(db, {
      category: 'images',
      q: req.query.q ? String(req.query.q) : null,
      limit: req.query.limit,
      offset: Number(req.query.offset) || 0,
    }).map((asset) => ({
      id: asset.id,
      name: asset.name,
      username: 'D-Zine Canvas',
      image: assetUrl(req, asset.id),
      thumb: assetUrl(req, asset.id),
      width: asset.width,
      height: asset.height,
    })),
  );
});

/** Everything, for a caller that wants the library rather than one panel. */
api.get('/assets', (req, res) => {
  const paths = pathsFor(req);
  adoptAllAssets(db, paths);
  const category =
    typeof req.query.category === 'string' && ASSET_CATEGORIES.has(req.query.category)
      ? req.query.category
      : null;
  res.json({
    total: countAssets(db, category),
    assets: listAssets(db, {
      category,
      q: req.query.q ? String(req.query.q) : null,
      limit: req.query.limit,
      offset: req.query.offset,
    }).map((asset) => ({
      id: asset.id,
      category: asset.category,
      name: asset.name,
      tags: splitTags(asset.tags),
      width: asset.width,
      height: asset.height,
      clipPath: asset.clipPath,
      url: assetUrl(req, asset.id),
    })),
  });
});

api.get('/assets/:id/content', (req, res) => {
  const asset = getAsset(db, safeId(req.params.id));
  /**
   * This route is public, so there may be no identity to derive a storage root
   * from — `pathsFor` reads one and would throw. An admin publishing artwork
   * writes into their own tenant's directory, so prefer that when the caller has
   * a tenant and fall back to the packaged root, which is where the shipped
   * catalogue lives and what a share link will be reaching for.
   */
  const filePath = asset
    ? [
        ...(req.identity ? [assetFilePath(pathsFor(req), asset)] : []),
        assetFilePath(bootPaths, asset),
      ].find((candidate) => existsSync(candidate)) ?? null
    : null;
  if (!asset || !filePath) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  // Artwork is ours rather than uploaded, but it is still served from our origin
  // and may be an SVG, so it gets the same restrictive policy as an upload.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type(UPLOAD_MIME[asset.kind] ?? 'application/octet-stream');
  res.sendFile(filePath);
});

/** Admin: publish artwork, or remove something from the library. */
api.post('/admin/assets', requireAdmin, uploadLimit, uploadSingle, (req, res) => {
  const category = String(req.body?.category ?? '');
  if (!ASSET_CATEGORIES.has(category)) {
    res.status(400).json({ error: `category must be one of ${[...ASSET_CATEGORIES].join(', ')}` });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Expected multipart field "file"' });
    return;
  }
  const extension = detectImageExtension(req.file.buffer);
  if (!extension) {
    res.status(415).json({
      error: 'That file is not a PNG, JPEG, GIF, WebP or SVG image',
      code: 'unsupported-media-type',
    });
    return;
  }
  const id = safeId(req.body?.id, `${category}-${randomUUID().slice(0, 8)}`);
  const dir = assetDir(pathsFor(req), category);
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(path.join(dir, `${id}.${extension}`), req.file.buffer);

  const asset = upsertAsset(db, {
    id,
    category,
    name: typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : id,
    tags: String(req.body?.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
    kind: extension,
    width: Number(req.body?.width) || null,
    height: Number(req.body?.height) || null,
    clipPath: typeof req.body?.clipPath === 'string' ? req.body.clipPath : null,
    bytes: req.file.size,
    createdBy: req.identity.member.id,
  });
  audit(req, {
    action: 'asset.create',
    targetType: 'asset',
    targetId: id,
    detail: { category, kind: extension, bytes: req.file.size },
  });
  res.status(201).json({ ...asset, url: assetUrl(req, id) });
});

api.delete('/admin/assets/:id', requireAdmin, (req, res) => {
  const id = safeId(req.params.id);
  const asset = deleteAsset(db, id);
  if (!asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  const filePath = assetFilePath(pathsFor(req), asset);
  if (existsSync(filePath)) unlinkSync(filePath);
  audit(req, {
    action: 'asset.delete',
    targetType: 'asset',
    targetId: id,
    detail: { category: asset.category },
  });
  res.status(204).end();
});

/* --- Fonts ---------------------------------------------------------------
 * Served from the API rather than fetched by the browser, for two reasons: an
 * API key has no business in a client bundle, and without one Google answers
 * 403 — which is what quietly left the font list empty. This endpoint prefers
 * Google's catalogue when a key is configured and otherwise serves the file
 * that `scripts/seed-fonts.mjs` builds from Google's keyless CSS endpoint, so
 * fonts work with no key at all.
 * --------------------------------------------------------------------- */

const SEED_FONTS_FILE = path.join(__dirname, 'data', 'fonts.json');
const FONT_CACHE_MS = 12 * 60 * 60 * 1000;
let fontCache = { at: 0, payload: null };

/** Google's catalogue, in the shape the editor's FontData expects. */
const toFontData = (item) => {
  const files = item?.files ?? {};
  const variants = Array.isArray(item?.variants) ? item.variants : [];
  const hasItalic = variants.includes('italic');
  const fonts = [];
  const add = (style, url) => {
    if (url) fonts.push(style ? { style, urls: [url] } : { urls: [url] });
  };
  add(undefined, files.regular ?? files['400']);
  if (hasItalic) add('Italic', files.italic ?? files['400italic']);
  const bold = files['600'] ?? files['700'];
  if (bold) add('Bold', bold);
  if (hasItalic) add('Bold_Italic', files['600italic'] ?? files['700italic']);
  return { name: String(item?.family ?? ''), fonts };
};

/** The packaged catalogue, or an operator's override in the storage root. */
const bundledFonts = () => {
  const override = path.join(bootPaths.storageRoot, 'fonts.json');
  const file = existsSync(override) ? override : SEED_FONTS_FILE;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const fonts = Array.isArray(parsed?.fonts) ? parsed.fonts : [];
    return { source: file === override ? 'storage-root' : 'bundled', fonts };
  } catch (error) {
    console.warn(`Could not read the font catalogue at ${file}:`, error.message);
    return { source: 'none', fonts: [] };
  }
};

api.get('/fonts', async (_req, res) => {
  if (fontCache.payload && Date.now() - fontCache.at < FONT_CACHE_MS) {
    res.json(fontCache.payload);
    return;
  }

  const apiKey = process.env.FONT_API_KEY || process.env.GOOGLE_FONT_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(apiKey)}&sort=popularity`,
      );
      if (response.ok) {
        const data = await response.json();
        const fonts = (Array.isArray(data?.items) ? data.items : [])
          .map(toFontData)
          .filter((font) => font.name && font.fonts.length);
        if (fonts.length) {
          fontCache = { at: Date.now(), payload: { source: 'google-webfonts-api', fonts } };
          res.json(fontCache.payload);
          return;
        }
      } else {
        console.warn(
          `Google Webfonts API answered ${response.status}; serving the bundled catalogue.`,
        );
      }
    } catch (error) {
      console.warn('Could not reach the Google Webfonts API:', error.message);
    }
  }

  const payload = bundledFonts();
  fontCache = { at: Date.now(), payload };
  res.json(payload);
});

/*
 * The font files themselves.
 *
 * `scripts/fetch-fonts.mjs` pulls each face into `api/data/fonts/` and rewrites
 * the catalogue's urls to point here, so a design renders from our own origin
 * instead of a third party's CDN. An operator can drop replacements in
 * `<storageRoot>/fonts/` to override a face without rebuilding the image.
 *
 * The name is matched against a strict pattern rather than being joined onto the
 * directory and hoped for: this route takes a path segment from the client, and
 * `../../` in a font name is the obvious thing to try.
 */
const FONT_FILE_TYPES = {
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const FONT_FILE_PATTERN = /^[a-z0-9][a-z0-9-]*\.(?:ttf|woff2?)$/;
const PACKAGED_FONT_DIR = path.join(__dirname, 'data', 'fonts');

api.get('/fonts/files/:name', (req, res) => {
  const name = String(req.params.name ?? '');
  if (!FONT_FILE_PATTERN.test(name)) {
    res.status(400).json({ error: 'Invalid font name' });
    return;
  }

  const override = path.join(bootPaths.storageRoot, 'fonts', name);
  const file = existsSync(override) ? override : path.join(PACKAGED_FONT_DIR, name);
  if (!existsSync(file)) {
    res.status(404).json({ error: 'Unknown font' });
    return;
  }

  // Immutable because the name changes if the file changes: a replacement face
  // is saved under a new name by the fetch script, so nothing can go stale.
  // The type follows the extension, so a woff2 is not labelled as a TrueType and
  // an operator's drop-in replacement of either kind works unaltered.
  res.setHeader(
    'Content-Type',
    FONT_FILE_TYPES[path.extname(name).toLowerCase()] ?? 'font/ttf',
  );
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(file);
});

/* --- Brand kit -----------------------------------------------------------
 * The colours and fonts one tenant uses everywhere, saved once and shared by
 * the whole team. Writes are admin-only, like publishing a template or inviting
 * a member: it is the organisation's brand, and every design that applies it
 * inherits whatever it says.
 *
 * Reads are open to the tenant, because the panels that offer the kit are used
 * by everybody.
 * --------------------------------------------------------------------- */

/** A swatch is a six-digit hex; anything else is not a colour we can show. */
const BRAND_COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;
const BRAND_MAX_COLOURS = 24;
const BRAND_MAX_FONTS = 12;

/**
 * Validate and de-duplicate a kit's colours.
 *
 * Returns null rather than a partially-cleaned list: a save that silently drops
 * half of what was sent is worse than one that refuses, because the user cannot
 * tell which half they lost.
 */
const normaliseBrandColours = (value) => {
  if (!Array.isArray(value) || value.length > BRAND_MAX_COLOURS) return null;
  const colours = value.map((entry) => String(entry ?? '').trim().toLowerCase());
  if (!colours.every((colour) => BRAND_COLOUR_PATTERN.test(colour))) return null;
  return [...new Set(colours)];
};

/**
 * Validate a kit's fonts against the catalogue.
 *
 * A family that is not in it would render in the fallback for ever with nothing
 * to indicate why, and the panel would offer a font the design cannot show.
 */
const normaliseBrandFonts = (value) => {
  if (!Array.isArray(value) || value.length > BRAND_MAX_FONTS) return null;
  const known = new Set(bundledFonts().fonts.map((font) => font.name));
  const fonts = value.map((entry) => String(entry ?? '').trim());
  if (!fonts.every((family) => known.has(family))) return null;
  return [...new Set(fonts)];
};

api.get('/brand', (req, res) => {
  const tenantId = tenantOf(req);
  ensureTenant(db, tenantId);
  res.json(getBrandKit(db, tenantId));
});

api.put('/brand', writeLimit, requireAdmin, (req, res) => {
  const tenantId = tenantOf(req);
  ensureTenant(db, tenantId);
  const colours = normaliseBrandColours(req.body?.colours);
  const fonts = normaliseBrandFonts(req.body?.fonts);
  if (!colours || !fonts) {
    res.status(400).json({
      error: `colours must be up to ${BRAND_MAX_COLOURS} hex values and fonts up to ${BRAND_MAX_FONTS} families from the catalogue`,
      code: 'invalid-brand-kit',
    });
    return;
  }
  upsertBrandKit(db, {
    tenantId,
    colours,
    fonts,
    updatedAt: Date.now(),
    updatedBy: req.identity.member.id,
  });
  audit(req, {
    action: 'brand.update',
    targetType: 'tenant',
    targetId: tenantId,
    detail: { colours: colours.length, fonts: fonts.length },
  });
  res.json(getBrandKit(db, tenantId));
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
