import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local'), override: true });

const resolvePath = (value, fallback) => {
  if (!value || !String(value).trim()) return fallback;
  const trimmed = String(value).trim();
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(PROJECT_ROOT, trimmed);
};

/**
 * Storage layout (all overridable via env):
 *
 *   STORAGE_ROOT/
 *     templates/          shared starter templates
 *     public/             static thumbs etc.
 *     users/
 *       {userId}/
 *         designs/        saved design JSON
 *         uploads/        uploaded images
 *
 * Absolute overrides win over STORAGE_ROOT children:
 *   NECROZINE_TEMPLATES_DIR
 *   NECROZINE_DESIGNS_DIR
 *   NECROZINE_UPLOADS_DIR
 *   NECROZINE_PUBLIC_DIR
 *
 * Per-user dirs can also use a `{userId}` placeholder, e.g.
 *   NECROZINE_DESIGNS_DIR=/data/tenants/{userId}/designs
 */
const DEFAULT_USER = process.env.NECROZINE_DEFAULT_USER_ID || 'default';
const STORAGE_ROOT = resolvePath(
  process.env.STORAGE_ROOT || process.env.NECROZINE_STORAGE_ROOT,
  path.join(__dirname, 'data'),
);

const withUser = (templatePath, userId) =>
  templatePath.replaceAll('{userId}', userId || DEFAULT_USER);

/**
 * Per-tenant directory overrides. These MUST contain `{userId}`.
 *
 * Without it every tenant resolves to the same directory, so tenants would read
 * and overwrite each other's files — and `adoptOrphanDesigns` would adopt one
 * tenant's designs into another tenant's listing, which then serves their
 * contents. The Helm chart shipped exactly this (`DESIGNS_DIR=/data/designs`),
 * so it is now a startup error rather than a silent cross-tenant leak.
 */
const DESIGNS_TEMPLATE =
  process.env.NECROZINE_DESIGNS_DIR || process.env.DESIGNS_DIR || null;
const UPLOADS_TEMPLATE =
  process.env.NECROZINE_UPLOADS_DIR || process.env.UPLOADS_DIR || null;

const checkPerTenant = (label, value) =>
  value && !value.includes('{userId}')
    ? `${label} is "${value}" but must contain the {userId} placeholder — without it every ` +
      'tenant shares one directory. Either add {userId} (e.g. /data/users/{userId}/designs) ' +
      `or unset ${label} and point STORAGE_ROOT at the volume instead.`
    : null;

/** Set when the storage layout cannot keep tenants apart. Checked at boot. */
export const storageConfigError =
  checkPerTenant('DESIGNS_DIR', DESIGNS_TEMPLATE) ??
  checkPerTenant('UPLOADS_DIR', UPLOADS_TEMPLATE);

/**
 * True when the storage root lives inside the application directory. Harmless
 * locally; in a container it means uploads and designs are gone at the next
 * deploy, which is the other half of the Helm bug above.
 */
export const storageRootIsEphemeral =
  process.env.NODE_ENV === 'production' &&
  !path.relative(PROJECT_ROOT, STORAGE_ROOT).startsWith('..');

export const getStoragePaths = (userId = DEFAULT_USER) => {
  const uid = String(userId || DEFAULT_USER).replace(/[^\w.-]+/g, '_') || DEFAULT_USER;

  const templatesDir = resolvePath(
    process.env.NECROZINE_TEMPLATES_DIR || process.env.TEMPLATES_DIR,
    path.join(STORAGE_ROOT, 'templates'),
  );

  const publicDir = resolvePath(
    process.env.NECROZINE_PUBLIC_DIR || process.env.PUBLIC_DIR,
    path.join(__dirname, 'public'),
  );

  // The shared asset library (frames, graphics, background images). Global,
  // like templates: it is our catalogue, not a tenant's.
  const assetsDir = resolvePath(
    process.env.NECROZINE_ASSETS_DIR || process.env.ASSETS_DIR,
    path.join(STORAGE_ROOT, 'assets'),
  );

  const designsTemplate = DESIGNS_TEMPLATE;
  const uploadsTemplate = UPLOADS_TEMPLATE;

  const designsDir = resolvePath(
    designsTemplate ? withUser(designsTemplate, uid) : null,
    path.join(STORAGE_ROOT, 'users', uid, 'designs'),
  );

  const uploadsDir = resolvePath(
    uploadsTemplate ? withUser(uploadsTemplate, uid) : null,
    path.join(STORAGE_ROOT, 'users', uid, 'uploads'),
  );

  // Design previews live next to the designs they belong to, as real image
  // files. The browser used to keep them as data URLs in localStorage, which
  // would bloat every design record now that saving moves server-side.
  const thumbsDir = path.join(path.dirname(designsDir), 'thumbs');

  // Templates a client publishes for themselves sit beside their designs, so a
  // tenant never shares a directory with anyone else. Templates we publish live
  // in the global `templatesDir`.
  const tenantTemplatesDir = path.join(path.dirname(designsDir), 'templates');

  for (const dir of [
    templatesDir,
    publicDir,
    designsDir,
    uploadsDir,
    thumbsDir,
    tenantTemplatesDir,
    assetsDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(path.join(publicDir, 'thumbs'), { recursive: true });

  return {
    storageRoot: STORAGE_ROOT,
    userId: uid,
    templatesDir,
    tenantTemplatesDir,
    publicDir,
    designsDir,
    uploadsDir,
    thumbsDir,
    assetsDir,
  };
};

export const storageConfig = {
  projectRoot: PROJECT_ROOT,
  defaultUserId: DEFAULT_USER,
  port: Number(process.env.PORT || 4201),
  host: process.env.HOST || '0.0.0.0',
};
