# NecroZine Storage API

Local backend for **templates**, **per-user designs**, and **uploads**.

- Editor: http://127.0.0.1:4200/
- API: http://127.0.0.1:4201/

## Start

From `canva-clone/`:

```bash
npm run api
```

Or API + editor:

```bash
npm run dev:all
```

## Env variables (for the backender / SA)

Copy `.env.example` → `.env` (or set in the process manager).

### Required for the editor

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_ENDPOINT` | — | Frontend base URL, e.g. `http://127.0.0.1:4201` |

### API listen

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `4201` | Bind port |

### Storage layout

Default on disk:

```
api/data/                         ← STORAGE_ROOT
  templates/                      shared starter templates
  users/
    {userId}/
      designs/                    saved design JSON
      uploads/                    uploaded images
api/public/                       static thumbs (NECROZINE_PUBLIC_DIR)
  thumbs/
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `STORAGE_ROOT` or `NECROZINE_STORAGE_ROOT` | `api/data` | Root for templates + `users/…` |
| `NECROZINE_TEMPLATES_DIR` / `TEMPLATES_DIR` | `{STORAGE_ROOT}/templates` | Shared templates |
| `NECROZINE_PUBLIC_DIR` / `PUBLIC_DIR` | `api/public` | Static files (`/thumbs/…`) |
| `NECROZINE_DESIGNS_DIR` / `DESIGNS_DIR` | `{STORAGE_ROOT}/users/{userId}/designs` | Tenant design JSON |
| `NECROZINE_UPLOADS_DIR` / `UPLOADS_DIR` | `{STORAGE_ROOT}/users/{userId}/uploads` | Tenant uploads |
| `NECROZINE_ASSETS_DIR` / `ASSETS_DIR` | `{STORAGE_ROOT}/assets` | Shared frames, graphics and backgrounds |
| `FONT_API_KEY` | unset | Optional; `GET /fonts` prefers Google's catalogue when set |
| `NECROZINE_DEFAULT_USER_ID` | `default` | Tenant used before identity resolves |

Absolute paths win. Relative paths resolve from the `canva-clone/` project root.

> **`DESIGNS_DIR` and `UPLOADS_DIR` must contain `{userId}`.** Without it every tenant
> resolves to the same directory, so tenants would read and overwrite each other's files. The
> server refuses to start if either is missing. Prefer setting only `STORAGE_ROOT` and letting
> the layout follow from it.

**Per-user placeholders:** set designs/uploads with `{userId}`:

```env
STORAGE_ROOT=/var/necrozine/storage
NECROZINE_DESIGNS_DIR=/var/necrozine/tenants/{userId}/designs
NECROZINE_UPLOADS_DIR=/var/necrozine/tenants/{userId}/uploads
NECROZINE_TEMPLATES_DIR=/var/necrozine/shared/templates
NECROZINE_PUBLIC_DIR=/var/necrozine/shared/public
NECROZINE_DEFAULT_USER_ID=default
```

### Scoping a request to a user

Send either:

- Header: `X-User-Id: alice`
- Query: `?userId=alice`

If omitted, `NECROZINE_DEFAULT_USER_ID` is used. Paths are sanitized to `[A-Za-z0-9._-]`.

`GET /health` returns the resolved paths for the current user — useful when wiring deploy.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Help page + active paths |
| `GET` | `/health` | Counts + resolved dirs |
| `GET` | `/templates` | List templates |
| `GET` | `/templates/:id` | One template |
| `POST` | `/templates` | Create / overwrite |
| `DELETE` | `/templates/:id` | Remove template |
| `GET` | `/designs` | List user designs (metadata) |
| `GET` | `/designs/:id` | Full design (`pages`) |
| `POST` | `/designs` | Create design |
| `PUT` | `/designs/:id` | Upsert design |
| `DELETE` | `/designs/:id` | Delete design |
| `GET` | `/uploads` | List user uploads |
| `POST` | `/uploads` | Multipart field `file` |
| `DELETE` | `/uploads/:id` | Delete upload |
| `GET` | `/media/uploads/:userId/:file` | Serve an upload file |
| static | `/thumbs/…` | From `PUBLIC_DIR` |

### Upload example

```bash
curl -X POST http://127.0.0.1:4201/uploads ^
  -H "X-User-Id: alice" ^
  -F "file=@./photo.png"
```

### Design save example

```bash
curl -X PUT http://127.0.0.1:4201/designs/my-poster ^
  -H "Content-Type: application/json" ^
  -H "X-User-Id: alice" ^
  -d "{\"name\":\"My Poster\",\"pages\":[...]}"
```

## How to add a template

### Option A — drop a JSON file

1. Put a thumbnail in `api/public/thumbs/` (or your `NECROZINE_PUBLIC_DIR`).
2. Create JSON under the templates dir (default `api/data/templates/`), e.g. `my-poster.json`:

```json
{
  "id": "my-poster",
  "name": "My Poster",
  "img": "/thumbs/my-poster.svg",
  "elements": {
    "layers": {
      "ROOT": {
        "type": { "resolvedName": "RootLayer" },
        "props": {
          "boxSize": { "width": 1640, "height": 924 },
          "position": { "x": 0, "y": 0 },
          "rotate": 0,
          "color": "rgb(255, 255, 255)",
          "image": null
        },
        "locked": false,
        "child": [],
        "parent": null
      }
    }
  }
}
```

3. Refresh the editor **Template** sidebar (folder is re-read each request).

### Option B — export from the editor

1. **Export → JSON** (or **Files → Save to computer**).
2. Use one page as `elements` (usually `pages[0]`).
3. Wrap with `id`, `name`, `img`, `elements` and save under the templates dir.

### Option C — POST

```bash
curl -X POST http://127.0.0.1:4201/templates ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"From API\",\"img\":\"/thumbs/blank-white.svg\",\"elements\":{...}}"
```

| Field | Required | Description |
|-------|----------|-------------|
| `elements` | yes | One `SerializedPage` (`layers.ROOT`) |
| `name` | no | UI label |
| `id` | no | Filename / id (default UUID) |
| `img` | no | Thumb path or URL |
| `overwrite` | no | `true` to replace existing id |

## Seed examples

```bash
npm run seed:templates
```

Writes blank + starter templates under the default templates dir.

## Tips

- Uploads in the editor sidebar now hit `POST /uploads` and survive refresh (per user).
- Designs can live on disk via `/designs` (browser library still uses localStorage until wired to these endpoints).
- If sidebars are empty, confirm the API is running, env paths exist, and `API_ENDPOINT` matches, then hard-refresh.

## Hosting instance access

For a fresh dedicated Hosting instance, set `AUTH_MODE=oidc`, `OIDC_ISSUER`,
`OIDC_JWKS_URL`, `OIDC_AUDIENCE`, `AUTH_INSTANCE_ID` (the stable Hosting workload UUID)
and `AUTH_INSTANCE_GROUP` (that instance's exact full group path).

Every request must carry the gateway's access token plus `X-Hosting-User-Id` and
`X-Hosting-User-Issuer` matching its verified claims. Canvas checks the instance
audience group on every request, including existing members. The gateway must
strip browser-supplied identity headers and the network must deny gateway bypass.

Allowed users join one shared workspace as ordinary members on their first request;
no separate Canvas invitation or role selection is needed. `AUTH_ADMIN_EMAILS` does
not promote users in this mode. Username and display name come from verified token
claims and are returned by `/api/me`. Missing optional profile fields remain empty.
Names and email changes never change ownership. Other authentication modes retain
their existing invitation flow.

Use this mode only on a fresh instance until an existing-workspace migration has
been reviewed. Changing the instance ID is not a workspace migration. Revocation
of already-issued tokens still depends on the gateway's bounded session checks.

Run the focused proof with `node --test api/identity.test.js` and the normal
repository checks with `just check`.
