import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Metadata store for the multi-tenant layout.
 *
 * Uses Node's built-in `node:sqlite` (no dependency, no native build). Only
 * *metadata* lives here — design payloads, uploads and thumbnails stay as files
 * on disk, because they are large and are already served as files.
 *
 * Why a database at all: the previous list endpoint parsed every design file in
 * full just to return `{id, name, updatedAt}`, so listing cost scaled with total
 * bytes on disk. Listing is now a single indexed query.
 *
 * Directory names still say `users/`; the tenant id stored here is that same
 * string. Renaming the directories to `tenants/` is a later, purely cosmetic
 * move — the identifier is what matters.
 */

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row per client organisation.
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per human login. external_id is the IdP subject claim.
CREATE TABLE IF NOT EXISTS members (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id  TEXT NOT NULL UNIQUE,
  email        TEXT,
  name         TEXT,
  role         TEXT NOT NULL DEFAULT 'member',
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS members_by_tenant ON members(tenant_id);

-- Invite-only: a login is rejected unless its email is invited (or is an
-- admin). Rows are kept after acceptance as a record of who was let in.
CREATE TABLE IF NOT EXISTS invites (
  email       TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',
  invited_by  TEXT,
  created_at  INTEGER NOT NULL,
  accepted_at INTEGER
);

-- Designs belong to the organisation; owner_id is "who created it", not an
-- access boundary.
CREATE TABLE IF NOT EXISTS designs (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id   TEXT REFERENCES members(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  thumb_path TEXT,
  deleted_at INTEGER,
  -- Bumped on every write. A save that quotes an older version is based on a
  -- copy somebody else has since changed, which used to be applied blindly.
  version    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS designs_by_tenant
  ON designs(tenant_id, deleted_at, updated_at DESC);

-- scope: 'global' (published by us) or 'tenant' (private to one client).
CREATE TABLE IF NOT EXISTS templates (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  tenant_id  TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT,
  width      INTEGER,
  height     INTEGER,
  thumb_path TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT
);

-- Explicit grants, for when a global template is shared with some clients only.
CREATE TABLE IF NOT EXISTS template_grants (
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  granted_at  INTEGER NOT NULL,
  PRIMARY KEY (template_id, tenant_id)
);

-- Who changed what. Append-only: nothing in the API updates or deletes rows in
-- here, so it can be trusted as a record after the fact.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  tenant_id   TEXT,
  member_id   TEXT,
  member_email TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT
);
-- The shared asset library behind the Frames, Graphic and Image panels.
-- Global, not per tenant: this is our catalogue, like the templates we publish.
CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  name       TEXT NOT NULL,
  tags       TEXT,
  kind       TEXT NOT NULL DEFAULT 'svg',
  width      REAL,
  height     REAL,
  -- Frames only: the path used as the clip mask, in the image's own space.
  clip_path  TEXT,
  bytes      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS assets_by_category ON assets(category, name COLLATE NOCASE);
`;

/** Open (creating if needed) the metadata database under the storage root. */
export const openDatabase = (storageRoot) => {
  mkdirSync(storageRoot, { recursive: true });
  const db = new DatabaseSync(path.join(storageRoot, 'db.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Databases created before the version column existed need it added; SQLite
  // can only add one column at a time, and `IF NOT EXISTS` is not supported for
  // a column, so ask what is already there.
  const designColumns = db
    .prepare('PRAGMA table_info(designs)')
    .all()
    .map((column) => column.name);
  if (!designColumns.includes('version')) {
    db.exec('ALTER TABLE designs ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }
  db
    .prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
    )
    .run('schema_version', String(SCHEMA_VERSION));
  return db;
};

/**
 * Make sure a tenant row exists.
 *
 * Until Phase 1 lands there is no login, so the tenant id is whatever the
 * caller is resolved to be. Creating it on demand keeps every write
 * foreign-key-valid without a provisioning step.
 */
export const ensureTenant = (db, tenantId, name = tenantId) => {
  db
    .prepare(
      'INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING',
    )
    .run(tenantId, name, Date.now());
  return tenantId;
};

export const listDesigns = (db, tenantId) =>
  db
    .prepare(
      `SELECT id, name, created_at AS createdAt, updated_at AS updatedAt,
              bytes, thumb_path AS thumbPath, version
         FROM designs
        WHERE tenant_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
    )
    .all(tenantId);

export const getDesign = (db, tenantId, id) =>
  db
    .prepare(
      `SELECT id, name, created_at AS createdAt, updated_at AS updatedAt,
              bytes, thumb_path AS thumbPath, version
         FROM designs
        WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .get(tenantId, id) ?? null;

export const upsertDesign = (db, record) => {
  db
    .prepare(
      `INSERT INTO designs
         (id, tenant_id, owner_id, name, created_at, updated_at, bytes, thumb_path, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         name       = excluded.name,
         updated_at = excluded.updated_at,
         bytes      = excluded.bytes,
         thumb_path = COALESCE(excluded.thumb_path, designs.thumb_path),
         version    = excluded.version,
         deleted_at = NULL
       WHERE designs.tenant_id = excluded.tenant_id`,
    )
    .run(
      record.id,
      record.tenantId,
      record.ownerId ?? null,
      record.name,
      record.createdAt,
      record.updatedAt,
      record.bytes ?? 0,
      record.thumbPath ?? null,
      record.version ?? 1,
    );
};

/** Tombstone a design and report its thumbnail so the caller can drop the file. */
export const deleteDesign = (db, tenantId, id) => {
  const row = getDesign(db, tenantId, id);
  if (!row) return null;
  db
    .prepare('UPDATE designs SET deleted_at = ? WHERE id = ? AND tenant_id = ?')
    .run(Date.now(), id, tenantId);
  return row;
};

/** Ids this tenant already knows about, tombstones included. */
export const knownDesignIds = (db, tenantId) =>
  new Set(
    db
      .prepare('SELECT id FROM designs WHERE tenant_id = ?')
      .all(tenantId)
      .map((row) => row.id),
  );

/** Which tenant owns a design id, or null. Ids are global, so this is how a
 * write can tell that an id already belongs to someone else. */
export const designOwner = (db, id) =>
  db.prepare('SELECT tenant_id AS tenantId FROM designs WHERE id = ?').get(id)
    ?.tenantId ?? null;

/** How many live designs the tenant has, without touching the filesystem. */
export const liveDesignCount = (db, tenantId) =>
  db
    .prepare(
      'SELECT count(*) AS c FROM designs WHERE tenant_id = ? AND deleted_at IS NULL',
    )
    .get(tenantId).c;

/* --- Members ------------------------------------------------------------
 * One row per human login. `external_id` is the IdP subject claim; email is
 * kept for invites and display, and defaults to the subject when the provider
 * does not supply one.
 * --------------------------------------------------------------------- */

export const findMemberByExternalId = (db, externalId) =>
  db
    .prepare(
      `SELECT id, tenant_id AS tenantId, external_id AS externalId,
              email, name, role
         FROM members WHERE external_id = ?`,
    )
    .get(externalId) ?? null;

export const findMemberByEmail = (db, email) =>
  db
    .prepare(
      `SELECT id, tenant_id AS tenantId, external_id AS externalId,
              email, name, role
         FROM members WHERE lower(email) = lower(?)`,
    )
    .get(email) ?? null;

export const createMember = (db, member) => {
  db
    .prepare(
      `INSERT INTO members
         (id, tenant_id, external_id, email, name, role, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      member.id,
      member.tenantId,
      member.externalId,
      member.email ?? null,
      member.name ?? null,
      member.role ?? 'member',
      Date.now(),
      Date.now(),
    );
  return findMemberByExternalId(db, member.externalId);
};

export const touchMember = (db, externalId) => {
  db
    .prepare('UPDATE members SET last_seen_at = ? WHERE external_id = ?')
    .run(Date.now(), externalId);
};

export const setMemberRole = (db, externalId, role) => {
  db
    .prepare('UPDATE members SET role = ? WHERE external_id = ?')
    .run(role, externalId);
};

export const listMembers = (db, tenantId) =>
  db
    .prepare(
      `SELECT id, tenant_id AS tenantId, external_id AS externalId, email, name, role,
              last_seen_at AS lastSeenAt
         FROM members WHERE tenant_id = ? ORDER BY created_at`,
    )
    .all(tenantId);

/* --- Invites ----------------------------------------------------------- */

export const findInvite = (db, email) =>
  db
    .prepare(
      `SELECT email, tenant_id AS tenantId, role, accepted_at AS acceptedAt
         FROM invites WHERE lower(email) = lower(?)`,
    )
    .get(email) ?? null;

export const createInvite = (db, invite) => {
  db
    .prepare(
      `INSERT INTO invites (email, tenant_id, role, invited_by, created_at, accepted_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(email) DO UPDATE SET
         tenant_id  = excluded.tenant_id,
         role       = excluded.role,
         invited_by = excluded.invited_by,
         accepted_at = NULL`,
    )
    .run(
      invite.email,
      invite.tenantId,
      invite.role ?? 'member',
      invite.invitedBy ?? null,
      Date.now(),
    );
  return findInvite(db, invite.email);
};

export const acceptInvite = (db, email) => {
  db
    .prepare('UPDATE invites SET accepted_at = ? WHERE lower(email) = lower(?)')
    .run(Date.now(), email);
};

export const deleteInvite = (db, email) =>
  db.prepare('DELETE FROM invites WHERE lower(email) = lower(?)').run(email).changes > 0;

export const listInvites = (db, tenantId) =>
  db
    .prepare(
      `SELECT email, tenant_id AS tenantId, role, accepted_at AS acceptedAt,
              created_at AS createdAt
         FROM invites WHERE tenant_id = ? ORDER BY created_at`,
    )
    .all(tenantId);

export const getTenant = (db, tenantId) =>
  db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(tenantId) ?? null;

export const listTenants = (db) =>
  db.prepare('SELECT id, name, created_at AS createdAt FROM tenants ORDER BY name').all();

/* --- Templates -----------------------------------------------------------
 * Metadata only; the payload (a preview image plus the serialized page) stays a
 * JSON file, exactly like designs:
 *   global templates -> {STORAGE_ROOT}/templates/{id}.json
 *   tenant templates -> {STORAGE_ROOT}/users/{tenantId}/templates/{id}.json
 *
 * Sharing rule: a global template with no grants is shared with everyone. The
 * moment it has a single grant it is shared with exactly those tenants — that
 * is how one template gets narrowed to one client without a second mechanism.
 * --------------------------------------------------------------------- */

const TEMPLATE_COLUMNS = `id, scope, tenant_id AS tenantId, name, category,
                           width, height, thumb_path AS thumbPath,
                           created_at AS createdAt, created_by AS createdBy`;

/** A template is visible to a tenant if it is theirs, or global and shared. */
export const templateVisibilityClause = `
  (t.scope = 'tenant' AND t.tenant_id = ?)
  OR (t.scope = 'global' AND (
        NOT EXISTS (SELECT 1 FROM template_grants g WHERE g.template_id = t.id)
        OR EXISTS (
          SELECT 1 FROM template_grants g
           WHERE g.template_id = t.id AND g.tenant_id = ?
        )
      ))`;

export const listTemplatesForTenant = (db, tenantId) =>
  db
    .prepare(
      `SELECT t.id, t.scope, t.tenant_id AS tenantId, t.name, t.category,
              t.width, t.height, t.thumb_path AS thumbPath,
              t.created_at AS createdAt,
              (SELECT count(*) FROM template_grants g WHERE g.template_id = t.id)
                AS grantCount
         FROM templates t
        WHERE ${templateVisibilityClause}
        ORDER BY CASE t.scope WHEN 'global' THEN 0 ELSE 1 END, t.name COLLATE NOCASE`,
    )
    .all(tenantId, tenantId);

export const getTemplate = (db, id) =>
  db.prepare(`SELECT ${TEMPLATE_COLUMNS} FROM templates WHERE id = ?`).get(id) ?? null;

export const isTemplateVisible = (db, tenantId, id) =>
  Boolean(
    db
      .prepare(
        `SELECT 1 FROM templates t WHERE t.id = ? AND (${templateVisibilityClause})`,
      )
      .get(id, tenantId, tenantId),
  );

/** Every template, for the admin surface. */
export const listAllTemplates = (db) =>
  db
    .prepare(
      `SELECT ${TEMPLATE_COLUMNS} FROM templates
        ORDER BY CASE scope WHEN 'global' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
    )
    .all();

export const upsertTemplate = (db, record) => {
  db
    .prepare(
      `INSERT INTO templates
         (id, scope, tenant_id, name, category, width, height, thumb_path, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         scope      = excluded.scope,
         tenant_id  = excluded.tenant_id,
         name       = excluded.name,
         category   = excluded.category,
         thumb_path = COALESCE(excluded.thumb_path, templates.thumb_path)`,
    )
    .run(
      record.id,
      record.scope,
      record.scope === 'tenant' ? (record.tenantId ?? null) : null,
      record.name,
      record.category ?? null,
      record.width ?? null,
      record.height ?? null,
      record.thumbPath ?? null,
      record.createdAt ?? Date.now(),
      record.createdBy ?? null,
    );
  return getTemplate(db, record.id);
};

/** Remove the row, returning it so the caller can delete the payload file. */
export const deleteTemplate = (db, id) => {
  const row = getTemplate(db, id);
  if (!row) return null;
  db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  return row;
};

/* --- Template grants ----------------------------------------------------
 * Grants narrow a global template. With none, it is shared with every tenant;
 * as soon as one exists it is shared with exactly the listed tenants.
 * --------------------------------------------------------------------- */

export const grantTemplate = (db, templateId, tenantId) => {
  db
    .prepare(
      `INSERT INTO template_grants (template_id, tenant_id, granted_at)
       VALUES (?, ?, ?)
       ON CONFLICT(template_id, tenant_id) DO NOTHING`,
    )
    .run(templateId, tenantId, Date.now());
  return listTemplateGrants(db, templateId);
};

export const revokeTemplateGrant = (db, templateId, tenantId) =>
  db
    .prepare('DELETE FROM template_grants WHERE template_id = ? AND tenant_id = ?')
    .run(templateId, tenantId).changes > 0;

export const listTemplateGrants = (db, templateId) =>
  db
    .prepare(
      `SELECT g.tenant_id AS tenantId, t.name AS tenantName, g.granted_at AS grantedAt
         FROM template_grants g
         LEFT JOIN tenants t ON t.id = g.tenant_id
        WHERE g.template_id = ?
        ORDER BY g.granted_at`,
    )
    .all(templateId);

/* --- Assets -------------------------------------------------------------
 * The shared library the Frames, Graphic and Image panels read. Metadata lives
 * here; the artwork stays an SVG file beside the others, adopted from the
 * directory the same way templates are.
 * --------------------------------------------------------------------- */

const ASSET_COLUMNS = `id, category, name, tags, kind, width, height,
                       clip_path AS clipPath, bytes, created_at AS createdAt`;

export const upsertAsset = (db, record) => {
  db
    .prepare(
      `INSERT INTO assets
         (id, category, name, tags, kind, width, height, clip_path, bytes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         category   = excluded.category,
         name       = excluded.name,
         tags       = excluded.tags,
         kind       = excluded.kind,
         width      = excluded.width,
         height     = excluded.height,
         clip_path  = excluded.clip_path,
         bytes      = excluded.bytes`,
    )
    .run(
      record.id,
      record.category,
      record.name,
      Array.isArray(record.tags) ? record.tags.join(',') : (record.tags ?? null),
      record.kind ?? 'svg',
      record.width ?? null,
      record.height ?? null,
      record.clipPath ?? null,
      record.bytes ?? 0,
      record.createdAt ?? Date.now(),
      record.createdBy ?? null,
    );
  return getAsset(db, record.id);
};

export const getAsset = (db, id) =>
  db.prepare(`SELECT ${ASSET_COLUMNS} FROM assets WHERE id = ?`).get(id) ?? null;

/** `q` matches the name or any tag, case-insensitively. */
export const listAssets = (db, { category = null, q = null, limit = 200, offset = 0 } = {}) =>
  db
    .prepare(
      `SELECT ${ASSET_COLUMNS} FROM assets
        WHERE (? IS NULL OR category = ?)
          AND (? IS NULL OR lower(name) LIKE ? OR lower(tags) LIKE ?)
        ORDER BY name COLLATE NOCASE
        LIMIT ? OFFSET ?`,
    )
    .all(
      category,
      category,
      q,
      `%${(q ?? '').toLowerCase()}%`,
      `%${(q ?? '').toLowerCase()}%`,
      Math.min(Math.max(Number(limit) || 200, 1), 500),
      Math.max(Number(offset) || 0, 0),
    );

export const countAssets = (db, category = null) =>
  db
    .prepare('SELECT count(*) AS c FROM assets WHERE (? IS NULL OR category = ?)')
    .get(category, category).c;

export const deleteAsset = (db, id) => {
  const row = getAsset(db, id);
  if (!row) return null;
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  return row;
};

export const knownAssetIds = (db) =>
  new Set(db.prepare('SELECT id FROM assets').all().map((row) => row.id));

/* --- Audit log -----------------------------------------------------------
 * Append-only record of who changed what. Writes never throw: losing an audit
 * line must not fail the operation the user actually asked for, so failures are
 * reported to the console instead.
 * ---------------------------------------------------------------------- */

export const recordAudit = (db, entry) => {
  try {
    db
      .prepare(
        `INSERT INTO audit_log
           (at, tenant_id, member_id, member_email, action, target_type, target_id, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        entry.tenantId ?? null,
        entry.memberId ?? null,
        entry.memberEmail ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.detail ? JSON.stringify(entry.detail).slice(0, 2000) : null,
      );
  } catch (error) {
    console.warn('Could not write audit entry:', error.message);
  }
};

export const listAudit = (db, { tenantId = null, limit = 200 } = {}) =>
  db
    .prepare(
      `SELECT id, at, tenant_id AS tenantId, member_id AS memberId,
              member_email AS memberEmail, action, target_type AS targetType,
              target_id AS targetId, detail
         FROM audit_log
        WHERE (? IS NULL OR tenant_id = ?)
        ORDER BY at DESC
        LIMIT ?`,
    )
    .all(tenantId, tenantId, Math.min(Math.max(Number(limit) || 200, 1), 1000));
