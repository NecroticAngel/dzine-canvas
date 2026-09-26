# Multi-tenant plan — client logins, shared templates, own designs

Status: **proposed**, not started. Owner decisions locked in are marked ✅.

---

## 1. Goal

Hand D-Zine Canvas to real clients. Each client organisation gets logins, sees the templates we
share with them, and creates and saves its own designs — without seeing or touching anyone else's.

## 2. What exists today (verified)

| Area | Reality | Where |
|---|---|---|
| Identity | Self-asserted: `X-User-Id` header or `?userId=`, defaulting to `'default'`. No validation, no registry. | `api/server.js:41-44`, `api/storagePaths.js:40` |
| Auth | None. No login, session, token, role, cookie or middleware. | — |
| Per-tenant dirs | **Already implemented**: `{STORAGE_ROOT}/users/{uid}/{designs,uploads}`, auto-`mkdir`, `{userId}` placeholder in env overrides. | `api/storagePaths.js:46-79` |
| Templates | **One global set for all users**, and `POST`/`DELETE /templates` are unauthenticated — any client can delete our templates. | `api/storagePaths.js:53-55`, `api/server.js:240,271` |
| Designs API | Full CRUD exists (`GET|POST|PUT|DELETE /designs`, `/uploads` with multer, 15 MB cap) but **zero frontend callers**. | `api/server.js:283-395` |
| Design library | `localStorage`, one global namespace: `necrozine-lidojs-library` (+ legacy `necrozine-lidojs-design`). | `src/utils/designLibrary.ts:4-5` |
| Thumbnails | Data-URL JPEGs stored in the client's library, not on the server. | `designLibrary.ts:179` |
| Infra | Traefik ingress already references an **OIDC middleware**; PVC mounted at `/data`. | `infra/helm/dzine-canvas/values.yaml:16`, `templates/deployment.yaml` |
| Node | **v26.8.1, and `node:sqlite` works with no flag and no dependency** (verified locally). | `mise.toml`, `Dockerfile` |

### Two landmines found while reading — both now fixed in Phase 2 step 1

1. ~~**`GET /designs` parses every design file in full** (`readDesigns`, `api/server.js:93-113`) just to
   return `{id,name,updatedAt}`.~~ **Fixed.** Listing is now one indexed query against `node:sqlite`.
   Verified by corrupting a design's payload file on disk: `GET /designs` still returns it correctly
   (name from the DB) while `GET /designs/:id` 404s, proving the list no longer touches bodies.
2. **Helm sets `DESIGNS_DIR`/`TEMPLATES_DIR` to `/data` but leaves `UPLOADS_DIR` unset**, so uploads
   land in `/app/api/data/users/{uid}/uploads` — ephemeral container storage. **Every upload is lost
   on redeploy today.** Still open; tracked in Phase 4.

## 3. Decisions

- ✅ **A client is an organisation with multiple logins**, not a single account. Model tenants + members.
- ✅ **Infisical is the secrets manager**, not the end-user login. It holds the OIDC client secret,
  DB/backup credentials, API keys. It does not give clients a login screen — that is the OIDC
  middleware's job. They are complementary.
- ❓ **Which IdP the `dzine-canvas-demo-oidc` middleware points at** (Keycloak? Authentik? Zitadel?
  Google/Entra?) and **what it injects** — this is the one blocking unknown for Phase 1.

## 4. Target architecture

```
client ──► Traefik + OIDC middleware ──► API
                  │                       │
                  │ verifies login,       │ verifies the SAME token signature,
                  │ injects token         │ derives member + tenant from claims
                  ▼                       ▼
             IdP (Keycloak/…)        node:sqlite  +  files on the PVC
```

**Rule: the API never trusts a bare header.** It verifies the signature of the token the middleware
passes through and reads `sub`/`email`. A raw `X-User-Id` is forgeable by anyone who can reach the
API, and it must be deleted. The API must also only be exposed through the ingress.

## 5. Data model

Moving to `node:sqlite` (built in, no new dependency) for metadata, keeping files for the heavy
payloads. This is what makes sharing, listing and backups tractable.

```sql
CREATE TABLE tenants (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE members (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  external_id  TEXT NOT NULL UNIQUE,      -- IdP 'sub' claim
  email        TEXT,
  name         TEXT,
  role         TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member' | 'admin'
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE designs (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  owner_id   TEXT REFERENCES members(id),
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  thumb_path TEXT,                        -- a file, never a data URL
  deleted_at INTEGER                      -- soft delete
);
CREATE INDEX designs_by_tenant ON designs(tenant_id, updated_at DESC);

CREATE TABLE templates (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,               -- 'global' | 'tenant'
  tenant_id  TEXT REFERENCES tenants(id), -- NULL for global
  name       TEXT NOT NULL,
  category   TEXT,
  width      INTEGER,
  height     INTEGER,
  thumb_path TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE TABLE template_grants (            -- when a global template is NOT shared with everyone
  template_id TEXT NOT NULL REFERENCES templates(id),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  granted_at  INTEGER NOT NULL,
  PRIMARY KEY (template_id, tenant_id)
);
```

Files on disk:

```
{STORAGE_ROOT}/
  db.sqlite
  tenants/{tenantId}/designs/{designId}.json
  tenants/{tenantId}/uploads/{file}
  templates/{templateId}.json
  templates/{templateId}.png
```

Note the rename `users/` → `tenants/`, matching the org model. Phase 2 needs a one-shot migration
from `users/default/` so nothing currently on disk is orphaned.

## 6. API surface (v2)

All of these sit behind the identity check.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/me` | `{ member, tenant, role }` — drives the whole UI |
| `GET` | `/designs` | Cheap SQL list + `thumbUrl`. Never parses design bodies |
| `POST` | `/designs` | Create; `POST /designs/:id/duplicate` for copies |
| `GET` `PUT` `DELETE` | `/designs/:id` | Tenant-scoped; `DELETE` soft-deletes |
| `GET` `POST` `DELETE` | `/uploads` | `DELETE /uploads/:id` by id, not filename |
| `GET` | `/designs/:id/thumb` | **Authenticated**. Replaces the IDOR below |
| `GET` | `/uploads/:id/content` | **Authenticated** |
| `GET` | `/templates` | Global (shared or granted) + tenant-private |
| `POST` | `/templates/:id/use` | **Copies** into the caller's tenant, returns the new design |
| `admin/*` | | `POST|PUT|DELETE /admin/templates`, `POST /admin/tenants`, `POST /admin/template-grants` |

**Template semantics:** clients never edit a template. "Use template" always makes a copy the tenant
owns, so a client can never mutate what we shared.

## 7. Phases

### Progress so far

- **Phase 2 step 1 — DONE.** `api/db.js` (schema + helpers, `node:sqlite`, no new dependency),
  `api/storagePaths.js` now exposes `thumbsDir`, and `api/server.js`:
  - list/read/update/create/delete all go through the metadata DB;
  - writes are atomic (temp file + rename) so a crash can't half-write a design;
  - thumbnails are stored as image files beside the designs and served from
    `GET /designs/:id/thumb`, instead of data URLs bloating records;
  - `adoptOrphanDesigns` migrates a pre-database install on first list, and picks up anything
    dropped into the designs directory by hand. It only reads ids the DB doesn't know and only
    runs when the directory holds more files than there are live rows.
  - **New single identity seam `resolveTenantId(req)`** — Phase 1 replaces only this function.
  - Verified over HTTP: health, create (409 on duplicate), list, read, thumbnail (200 `image/png`),
    update, adoption of a hand-dropped file, delete (204) with file + thumbnail cleanup, and 404 after.
- Known gap: if someone deletes a design *file* by hand, the row survives and the list still shows it
  (the payload read then 404s). A repair pass could reconcile this; low priority.
- **Phase 2 step 2 — DONE.** The browser now syncs to the account.
  `src/utils/designLibrary.ts` keeps its synchronous API (the vendored editor calls it synchronously
  in dozens of places) and became a cache in front of the API:
  - mutations queue per design and flush on an **800 ms debounce**, so the save-plus-thumbnail pair
    collapses into one request; a delete beats a queued upload; failures retry after 5 s;
  - `hydrateLibrary()` adopts the account's designs, is idempotent, and never duplicates;
  - the throwaway placeholder design is discarded once real designs exist;
  - the welcome page **waits for hydration** before rendering the grid, because the editor must not
    boot against a half-populated cache — the first save would have nowhere to go;
  - the Save button reports upload state instead of claiming "Saved" on the local write alone.
  - Verified in the browser: two existing local designs were migrated up on first load, a new design
    plus a shape saved with Ctrl+S reached the server, the thumbnail was captured, uploaded, stored
    as a `.jpg` and served back as `200 image/jpeg`, and a second hydrate produced no duplicates.
- Known gap: a local edit newer than the server wins (last-write-wins). Two people editing the same
  design at once will clobber each other; there is no version check or conflict UI yet.
- **Not yet done: autosave.** Edits still persist only when Save/Ctrl+S is pressed, so 'debounced
  saving' currently means a debounced *upload of a save*, not saving without asking. Making every
  edit persist would hook the editor's live-patch/commit flow and is a separate, riskier change.
- Next: Phase 1 (identity), which is now a single function — `resolveTenantId` in `api/server.js`.

### Phase 1 — real identity (security floor)
1. Decide the IdP + claim mapping (`sub` → `members.external_id`; first login provisions or is
   rejected unless invited).
2. Add `api/identity.js`: verify the token, resolve `member` + `tenant`, seed `node:sqlite`.
3. **Delete** `?userId=` / `X-User-Id` trust (`api/server.js:41-44`).
4. **Delete** `GET /media/uploads/:userId/:file` — today any caller can read any tenant's uploads by
   guessing the id (IDOR).
5. Gate all template writes to role `admin`.
6. Frontend: `GET /me`, send credentials, redirect to login on 401.
7. **Make the axios interceptor honest.** `src/main.tsx:24-30` rewrites *every* failed GET into a fake
   `{data: [], status: 200}`. With auth on, that silently swallows 401/403 and every screen shows
   "empty" instead of "logged out".
8. CORS: `origin: true` reflects any origin (`server.js:37`) → allow-list.

### Phase 2 — designs on the server (no auth dependency)
1. `node:sqlite` schema + migrations on boot; keep the JSON files as the payload.
2. Replace the scanning `readDesigns` with SQL; **atomic writes** (temp file + rename) — a crash
   mid-write currently corrupts a design.
3. Thumbnails to disk on save, referenced by `thumbUrl`; stop embedding data URLs.
4. Re-point `src/utils/designLibrary.ts` at the API, keeping its exported surface so `WelcomePage`
   and the vendored editor barely change. Introduce one `resolveTenant(req)` seam so Phase 1 swaps
   only that function.
5. Migrate any existing `localStorage` library into the account on first login (one-shot, idempotent).
6. Debounced autosave + dirty indicator (Tier 3 from `ideas_todo.md`).

### Phase 3 — sharing
Tenant admin vs member roles, `template_grants`, an admin surface to publish and share, and
"use template → copy" end to end.

### Phase 4 — hardening
PVC for uploads, backups of `db.sqlite` + files, rate limits (the 30 MB JSON body and 15 MB uploads
are unauthenticated today), upload allow-list by MIME rather than the client-supplied extension,
and an audit trail of who changed what.

## 8. Open questions

1. Which IdP does `dzine-canvas-demo-oidc` point at, and what does it inject? (blocks Phase 1)
2. When an unknown person logs in successfully, do we auto-create a tenant, or reject them unless
   invited? Invite-only is safer for a client product.
3. Does one member's design belong to them personally or to the whole tenant? (Currently modelled as
   tenant-owned with an `owner_id`, so both are possible.)
4. Do we keep `replicas: 1` + `Recreate`, i.e. accept downtime on deploy? Fine for a handful of
   clients; `node:sqlite` on a single PVC is not a multi-replica story.
