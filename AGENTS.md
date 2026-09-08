# Repository Guidelines

## Project Structure & Module Organization

The Vite/React application lives in `src/`. Put product-specific editor code under `src/features/design/`, reusable UI and theme code under `src/shared/`, page entry points under `src/pages/`, and general helpers under `src/utils/`. The local `@lidojs/design-editor` implementation is owned by `src/vendor/design-editor/`; update it only when changing editor-core behavior. Static browser assets belong in `public/`.

The Express template API is `api/server.js`. Its checked-in templates live in `api/data/templates/`, while `scripts/seed-templates.mjs` regenerates the starter data. Build output is written to `dist/` and must not be committed.

## Build, Test, and Development Commands

- `npm install` installs the locked dependencies from `package-lock.json`.
- `npm run dev:all` starts the API on port 4201 and Vite on port 4200.
- `npm run dev` starts only the web application.
- `npm run api` starts only the template API.
- `npm run build` creates the production bundle in `dist/`.
- `npx tsc --noEmit` performs the TypeScript check configured by `tsconfig.json`.
- `npm run seed:templates` rewrites the checked-in starter template files; review those diffs before committing.

## Coding Style & Naming Conventions

Follow the existing TypeScript and JavaScript style: two-space indentation, semicolons, single quotes, and trailing commas in multiline structures. Use `PascalCase` for React components and their files, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for module constants. Keep feature code near its owning feature and export public component surfaces through the nearest `index.ts`. Prefer explicit types at API and serialization boundaries.

No formatter or linter is configured. Avoid unrelated formatting changes, and match the surrounding file.

## Testing Guidelines

There is no automated test framework or coverage threshold yet. For every change, run `npx tsc --noEmit` and `npm run build`. Manually exercise the affected editor workflow with `npm run dev:all`; for API changes, also verify `GET http://127.0.0.1:4201/health`. If tests are introduced, colocate focused files as `*.test.ts` or `*.test.tsx` beside the behavior they cover.

## Commit & Pull Request Guidelines

History uses short, imperative subjects, often with Conventional Commit prefixes such as `feat:`, `chore:`, and `docs:`. Keep each commit to one coherent change. Pull requests should explain the user-visible outcome, list validation commands and results, link the relevant issue, and include screenshots or a short recording for UI changes. Call out template-data or API contract changes explicitly.

## Security & Configuration

Use local environment files for `API_ENDPOINT`, `FONT_API_KEY`, or `PORT`; `.env` and `*.local` are ignored. Never commit credentials, generated secrets, or private template content.
