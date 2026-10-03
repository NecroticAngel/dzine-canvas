# D-Zine Canvas

Design editor for NecroZine — create pages, templates, and graphics in the browser.

## Development

The repository uses [mise](https://mise.jdx.dev/) to install the same Node.js and
[Just](https://github.com/casey/just) versions on macOS, Linux, and Windows.
After installing mise for your platform, run:

```sh
mise trust
mise install
just setup
just dev
```

Copy `.env.example` to `.env` before starting development when the web app
should use the local template API. Add a Google Web Fonts API key only when
remote font loading is required; never commit the resulting `.env` file.

`just` lists all available project commands. The main validation command is
`just check`, which runs the TypeScript check followed by the production build.

Or without mise/just:

```bash
npm install --legacy-peer-deps
npm run dev:all
```

- Editor: http://127.0.0.1:4200/
- Storage API: http://127.0.0.1:4201/api/

**Templates + storage env vars (user spaces):** see [api/README.md](./api/README.md) and `.env.example`.

## Features

- Drag-and-drop canvas editing
- Templates, uploads, and multi-page designs
- Export to PNG, JPG, PDF, and JSON
- Per-user storage paths via env for deploy

## Container and Kubernetes runtime

Express serves the Vite build and `/api` on port 4201. With `BASE_PATH=/demo`,
the editor is `/demo/` and the API is `/demo/api`; `/health` stays unprefixed
for probes. Leave the build-time `API_ENDPOINT` empty in the image: the browser
uses the server-injected base path. Local environment files are excluded from
the Docker build.

```sh
docker build -t dzine-canvas:ci .
node scripts/check-container.mjs dzine-canvas:ci
helm lint infra/helm/dzine-canvas
helm template demo infra/helm/dzine-canvas
```

The container check uses an isolated test identity and disposable Docker volume,
checks the frontend and authenticated API, then replaces the container and reads
the saved design again. It publishes no host ports and removes its test data.

Production requirements:

- Mount persistent storage at `/data`, writable by UID/GID 1000. Fresh Docker
  named volumes inherit the image permissions; host bind mounts need matching
  permissions. The Helm chart uses `fsGroup: 1000` for the existing PVC.
- Keep one replica with `Recreate`: SQLite metadata (`/data/db.sqlite`) and the
  tenant design/upload files belong to the same persistent volume. Packaged
  templates and artwork seed missing files without overwriting existing ones.
- Supply `auth.issuer`, `auth.jwksUrl`, `auth.audience`, and `auth.adminEmails`.
  The ingress must forward the signed ID token as `Authorization: Bearer …`.
  Staff bootstrap from the email allow-list; other users need an app invitation
  as well as the ingress access group. Production refuses development auth.
- The chart permits the configured HTTPS host for browser CORS and trusts one
  ingress hop. Keep the service behind that ingress.
- The image includes `node scripts/backup-storage.mjs --out /backup`. Mount a
  separate backup destination, arrange retention, and verify restoration before
  relying on it. Stop writes for a consistent database-and-files backup.

Deployment is owned by `prod-infra/htz/germ/tf-jo/010-canvas`: Terraform owns the
PVC, Keycloak, ingress middleware and Argo application; this repository owns the
image and Helm chart. Publish an approved release and update the Terraform chart
pin when chart content changes; Image Updater advances only the image tag.

Review status (2026-10-04): local container/build/chart checks do not establish
live Kubernetes or Keycloak acceptance. The configured OIDC middleware protects
the entire client path, so anonymous share links are still gated by login even
though the API supports token-authorized public shares. Enabling anonymous
sharing needs a reviewed ingress authentication change. The default PVC is
512Mi; size it for uploads and backups before production use.

## Disclaimer

Use this software at your own risk. We are not liable for any damages or issues arising from its use.
