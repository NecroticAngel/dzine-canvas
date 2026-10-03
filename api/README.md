# NecroZine Storage API

Local backend for **templates**, **per-user designs**, and **uploads**.

- Editor: http://127.0.0.1:4200/
- API: http://127.0.0.1:4201/

## Start

From the repository root:

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
| `API_ENDPOINT` | empty | Optional build-time override; empty uses the same-origin `/api` mount |

### API listen

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOST` | `0.0.0.0` | Bind address |
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

Absolute paths win. Relative paths resolve from the repository root.

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

### Authentication and tenant scope

Tenant scope comes from the authenticated member in SQLite, never `X-User-Id`
or a query parameter. Local development uses a fixed development identity.
Production verifies the ingress-forwarded OIDC token; configure it as described
in [the runtime guide](../README.md#container-and-kubernetes-runtime).

All API endpoints below are relative to `/api` (or `${BASE_PATH}/api`).
`GET /health` is an unprefixed process probe. `/api/health` exposes detailed
storage information only to authenticated administrators.

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
curl -X POST http://127.0.0.1:4201/api/uploads ^
  -F "file=@./photo.png"
```

### Design save example

```bash
curl -X PUT http://127.0.0.1:4201/api/designs/my-poster ^
  -H "Content-Type: application/json" ^
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
curl -X POST http://127.0.0.1:4201/api/templates ^
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
- Designs are saved through `/api/designs`, with metadata in SQLite and page JSON on persistent storage.
- If sidebars are empty, confirm the API is running, env paths exist, and `API_ENDPOINT` matches, then hard-refresh.
