# Templates API

Local backend that powers the **Templates** sidebar in the editor.

- Editor: http://127.0.0.1:4200/
- API: http://127.0.0.1:4201/

## Start

From `canva-clone/`:

```bash
npm run api
```

Or run API + editor together:

```bash
npm run dev:all
```

`.env` should include:

```
API_ENDPOINT=http://127.0.0.1:4201
```

## How to add a template

### Option A — drop a JSON file (easiest)

1. Put a thumbnail in `api/public/thumbs/`  
   Example: `api/public/thumbs/my-poster.svg` (PNG/JPG also fine).

2. Create a file in `api/data/templates/`, e.g. `my-poster.json`:

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

3. Refresh the editor and open the **Template** sidebar.  
   The API re-reads the folder on each request — no restart needed for new JSON files.

### Option B — export a design from the editor

1. Design something in the editor.
2. **Export → JSON** (or **Files → Save to computer**).
3. That JSON is an array of pages. Use **one page** as `elements` (usually `pages[0]`).
4. Wrap it in the template shape above (`id`, `name`, `img`, `elements`).
5. Save under `api/data/templates/`.

Example transform:

```js
// exported.json is [ page, page, ... ]
{
  "id": "cover-v1",
  "name": "Cover V1",
  "img": "/thumbs/cover-v1.png",
  "elements": exported[0]
}
```

### Option C — POST to the API

```bash
curl -X POST http://127.0.0.1:4201/templates ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"From API\",\"img\":\"/thumbs/blank-white.svg\",\"elements\":{...}}"
```

Body fields:

| Field | Required | Description |
|-------|----------|-------------|
| `elements` | yes | One `SerializedPage` (must include `layers.ROOT`) |
| `name` | no | Label in the UI (default: generated) |
| `id` | no | Filename / id (default: UUID) |
| `img` | no | Thumb path or absolute URL (default: blank thumb) |
| `overwrite` | no | Set `true` to replace an existing id |

## Useful endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Short human-readable help page |
| `GET` | `/health` | `{ ok, templates }` |
| `GET` | `/templates` | List for the sidebar (`img` + `elements`) |
| `GET` | `/templates/:id` | One template |
| `POST` | `/templates` | Create / overwrite |
| `DELETE` | `/templates/:id` | Remove |

Thumbnails under `api/public/` are served at the same origin, e.g.  
`http://127.0.0.1:4201/thumbs/blank-white.svg`.

## Seed examples

Reset/recreate the starter templates from the sample design:

```bash
npm run seed:templates
```

That writes:

- `api/data/templates/blank-white.json`
- `api/data/templates/starter-lidojs.json`

## Tips

- `img` can be `/thumbs/....` (served by this API) or a full `https://...` URL.
- Clicking a template replaces the **current page** in the open design (it does not create a new Files library entry).
- If the sidebar is empty, confirm the API is running and `API_ENDPOINT` points at `http://127.0.0.1:4201`, then hard-refresh the editor.
