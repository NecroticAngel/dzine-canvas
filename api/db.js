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
  deleted_at INTEGER
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
`;

/** Open (creating if needed) the metadata database under the storage root. */
export const openDatabase = (storageRoot) => {
  mkdirSync(storageRoot, { recursive: true });
  const db = new DatabaseSync(path.join(storageRoot, 'db.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
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
              bytes, thumb_path AS thumbPath
         FROM designs
        WHERE tenant_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
    )
    .all(tenantId);

export const getDesign = (db, tenantId, id) =>
  db
    .prepare(
      `SELECT id, name, created_at AS createdAt, updated_at AS updatedAt,
              bytes, thumb_path AS thumbPath
         FROM designs
        WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .get(tenantId, id) ?? null;

export const upsertDesign = (db, record) => {
  db
    .prepare(
      `INSERT INTO designs
         (id, tenant_id, owner_id, name, created_at, updated_at, bytes, thumb_path, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         name       = excluded.name,
         updated_at = excluded.updated_at,
         bytes      = excluded.bytes,
         thumb_path = COALESCE(excluded.thumb_path, designs.thumb_path),
         tenant_id  = excluded.tenant_id,
         deleted_at = NULL`,
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
