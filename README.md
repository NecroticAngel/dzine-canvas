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

## Disclaimer

Use this software at your own risk. We are not liable for any damages or issues arising from its use.
