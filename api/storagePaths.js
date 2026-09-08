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

  const designsTemplate = process.env.NECROZINE_DESIGNS_DIR || process.env.DESIGNS_DIR;
  const uploadsTemplate = process.env.NECROZINE_UPLOADS_DIR || process.env.UPLOADS_DIR;

  const designsDir = resolvePath(
    designsTemplate ? withUser(designsTemplate, uid) : null,
    path.join(STORAGE_ROOT, 'users', uid, 'designs'),
  );

  const uploadsDir = resolvePath(
    uploadsTemplate ? withUser(uploadsTemplate, uid) : null,
    path.join(STORAGE_ROOT, 'users', uid, 'uploads'),
  );

  for (const dir of [templatesDir, publicDir, designsDir, uploadsDir]) {
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(path.join(publicDir, 'thumbs'), { recursive: true });

  return {
    storageRoot: STORAGE_ROOT,
    userId: uid,
    templatesDir,
    publicDir,
    designsDir,
    uploadsDir,
  };
};

export const storageConfig = {
  projectRoot: PROJECT_ROOT,
  defaultUserId: DEFAULT_USER,
  port: Number(process.env.PORT || 4201),
  host: process.env.HOST || '0.0.0.0',
};
