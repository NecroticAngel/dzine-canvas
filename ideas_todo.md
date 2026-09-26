# D-Zine Canvas — Handover & Ideas / TODO

> **Purpose:** A handover note from the previous Copilot session to the next one, plus a
> backlog of ideas. Paste the prompt at the very bottom when you reopen the editor.

---

## 0. SCOPE — read this first

**We work on `canva-clone` ONLY.**

| Folder | Status |
|---|---|
| `c:\Users\jo\dev\NecroZine\canva-clone` | ✅ **Active.** All work happens here. |
| `c:\Users\jo\dev\NecroZine_Next\OpenDesign` | ⛔ **PARKED.** Do not touch. Different project (Preact + Tailwind v4 + Cloudflare Workers), different stack. Its own theming task was completed. |

The VS Code window is a **multi-root workspace**. The `NecroZine_Next` root still has
instructions attached to it, and it briefly caused the wrong project to be edited. If it
keeps causing confusion, remove that folder from the workspace.

---

## 1. HOW TO RUN IT

No dev server is assumed to be running — start your own.

```powershell
npm --prefix "C:\Users\jo\dev\NecroZine\canva-clone" run dev:all   # vite (4200) + api (4201) together
```

| Script | Does |
|---|---|
| `dev` | Vite only, port **4200** |
| `api` | `node api/server.js`, port **4201** (override with `PORT`) |
| `dev:all` | Both via `concurrently` — **use this** |
| `seed:templates` | Seeds `api/data/templates/` |
| `build` | `vite build` |
| `serve` | `vite preview` |

**Typecheck** — there is no `typecheck` script:
```powershell
node "C:\Users\jo\dev\NecroZine\canva-clone\node_modules\typescript\bin\tsc" --noEmit -p "C:\Users\jo\dev\NecroZine\canva-clone\tsconfig.json"
```

---

## 2. ARCHITECTURE — the non-obvious bits

- **React 18.3** + TypeScript 5.7 + Vite 6.4. **NOT Preact** — don't carry OpenDesign habits over.
- **Emotion** is the styling system (`css={{ ... }}` prop). `jsxImportSource: '@emotion/react'`.
  MUI v6 is installed but its `theme.ts` / `darkTheme` objects are **dead code** — nothing imports them.
- **Canvas engine is LidoJS** (`@lidojs/design-core`, `design-layers`, `design-screen`, `design-utils`,
  `color-picker`, `draw`, `text-editor`) — **but the editor itself is VENDORED**:
  `src/vendor/design-editor/index.tsx` (~2300 lines, one big file) is aliased over
  `@lidojs/design-editor` in **both** `vite.config.ts` (`resolve.alias`) **and** `tsconfig.json` (`paths`).
  👉 Keep those two in sync. This file is where most editor behaviour lives.
- **Icons:** `@duyank/icons` — default exports, e.g. `import XIcon from '@duyank/icons/regular/X'`.
  Variants: `regular/`, `bold/`, `duotone/`. They accept Emotion's `css` prop.
- **Theme:** `html[data-theme='dark'|'light']` + `--app-*` CSS vars, provider in
  `src/shared/theme/AppTheme.tsx` (`useAppTheme()`), storage key `necrozine-ui-theme`, **dark default**.
- **Design library is localStorage**, not server: `necrozine-lidojs-library`
  (legacy: `necrozine-lidojs-design`) — see `src/utils/designLibrary.ts`.
- **Export/capture:** `html-to-image` (`toPng`/`toJpeg`) via `src/utils/exportDesign.ts`.

### API surface (`api/server.js`) — verified inventory

Mounted at `` app.use(`${BASE_PATH}/api`, api) ``.

**Implemented:** `GET /health` · `GET /` · `GET|POST /templates` · `GET /templates/:id` ·
`GET|POST /designs` · `GET /designs/:id` · `GET|POST /uploads` (multer) · `GET /media/uploads/:userId/:file`

**NOT implemented** (this is *why* those panels can only ever be empty):
`/frames` · `/graphics` · `/images` · `/fonts` · `/text`

`vite.config.ts` proxies `/api` → `http://localhost:4201`.

---

## 3. CURRENT STATE

**Baseline:** branch `master`, HEAD = `7478a37 "dd"`, **1 commit ahead of `origin/master`**.
Everything below is **committed** except the 3 files in the next section.

Working & verified:
- Canvas presets + `NewDesignModal` (social sizes, 12 categories, custom W×H, search)
- Theme toggle (icon-only) in WelcomePage + EditorHeader; dark default
- Design thumbnails captured on save, rendered on home cards
- `/api` proxy + shape guards on Frame/Graphic/Image/Text/Template/Upload panels & DesignPage
- QR: destination-URL input in panel, `QrToolbar` (url / dark / light / logo upload / clear), cog demo icon
- Table cells editable: `TableCellView` + `CellToolbar` (bold, italic, size, colour, align, cell bg)
- Draw panel + `DrawToolbar` (stroke colour / width)
- Sidebar "Business" badges removed
- Draw panel floats **top-left** (`left: 72, top: 44`)

### ⚠️ UNCOMMITTED (3 files, must be committed first)

```
 M src/features/design/components/sidebar/DrawContent.tsx
 M src/features/design/components/sidebar/Sidebar.tsx
 M src/features/design/components/tabs/TabList.tsx
```
= the Draw-panel reposition (`top: 500 → 44`) and the Business-badge removal
(`TabList.tsx` badge + `isBusiness` prop, and the 3 flags in `Sidebar.tsx`).

### ❗ NEVER VERIFIED AT RUNTIME

**`DrawToolbar`** — written, `tsc` clean, but behaviour was never proven. Multiple Playwright
attempts failed on locator mistakes, not on the code. **Retest it.** The visible-risk surface is
small (3 controls, one `selected` layer), so this is likely fine — but it is unproven.

Small debt worth knowing: `DrawContent`'s geometry is hard-coded (`left: 72`, `top: 44`,
`120×250`) rather than themed, so it won't follow light/dark restyling.

---

## 4. GOTCHAS — hard-won, do not relearn these the hard way

1. **`Error: useEditor must be used inside <Editor>`** — almost certainly an **HMR artifact**,
   not a real bug. `EditorContext` is created in the vendored file; Fast Refresh gives provider
   and consumer *different* context instances. **Fix: hard reload.** The JSX nesting is correct.
2. **Every failed GET is silently rewritten to `{ data: [], status: 200 }`** by an axios
   interceptor in `main.tsx`. So `response.data` may be an *array*, an *HTML string* (SPA
   fallback), or an object — **always guard the shape**, e.g.
   `Array.isArray(res.data) ? res.data : []`.
3. **`run_in_terminal` strips `cd`/`Push-Location`.** Use `npm --prefix "…" run x`, or invoke
   binaries by full path.
4. **Emotion class hashes change** whenever styles change (`css-3wb6ht-DrawContent` → new hash).
   Never hard-code `css-xxxxx` selectors in tests or `grep`-based verification.
5. **The sidebar tab is a toggle** — clicking it twice closes the panel.
6. **Draw-panel items are SVG `role="img"`, not `<img>`.** Use
   `page.getByRole('img', { name: 'Pencil' })`.
7. **The `Draw`/`Table`/`QrCode` rail icons have no accessible name** — target the label text
   (`page.getByText('Draw', { exact: true })`), not the icon.
8. **Canvas edits only persist after clicking Save** (Ctrl+S also works; no autosave).
9. `read_file`/`file_search` calls get throttled after several in a row — break them up with
   terminal commands.
10. **Serena MCP tools are disabled** in this workspace. Standard tools only.

Test data in the library: `Portraitdfsfe` (used for testing),
`Square` (created while reproducing the table bug — safe to delete).

---

## 5. IDEAS / TODO

### Tier 0 — housekeeping
- [ ] **Commit the 3 uncommitted files** (Draw panel position + Business badge removal).
- [ ] Push `master` (currently 1 ahead of `origin/master`).
- [ ] **Re-verify `DrawToolbar` at runtime** (draw a stroke → select it → change colour/width).

### Tier 1 — 🎯 RECOMMENDED NEXT BATCH (client-side only, no API risk)
- [ ] **Undo/redo keyboard shortcuts.** The header buttons work (`actions.history.undo/.redo`)
      but **Ctrl+Z / Ctrl+Shift+Z are not bound**. The global keydown listener in
      `vendor/design-editor/index.tsx` (~line 2264) only handles **Ctrl+S** and **Delete/Backspace**.
- [ ] **Layer clipboard.** There is **no copy/paste/duplicate for layers at all** — no
      `clipboard`, `copyLayer`, `pasteLayer` anywhere. Only `duplicatePage` / `duplicateDesign` exist.
      Add Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+D, offsetting pastes so they don't stack invisibly.
- [ ] Other missing shortcuts: Escape (deselect), arrow-key nudge (Shift = ×10),
      Ctrl+A (select all), Ctrl+0 / Ctrl+= / Ctrl+- (zoom), `[` / `]` (layer order).

*Why first:* purely local, compounds with each other, and makes the editor feel far less clunky
than any single visual feature.

### Tier 2 — alignment & snapping
- [ ] Smart guides / snapping while dragging.
- [ ] Align-to-page + distribute + multi-select align.
- [ ] Every `align` hit in the codebase today is *text* alignment — shapes have nothing.
- [ ] Optional: rulers, grid.

### Tier 3 — server-backed designs (big unlock)
- [ ] `GET/POST /api/designs` and `GET/POST /api/uploads` **already exist but are unused** — the
      library is localStorage-only. Migrate for: survives cache wipe, works in another browser,
      real uploadable thumbnails.
- [ ] Add a migration path from `necrozine-lidojs-library`.
- [ ] Autosave (debounced) + dirty indicator — today a forgotten Save loses work.

### Tier 4 — fill the permanently-empty panels
- [ ] Add `/api/frames`, `/api/graphics`, `/api/images`, `/api/fonts` endpoints (or bundle
      curated local assets). Until then, Frame / Graphic / Image can never populate.

### Tier 5 — export upgrades
- [ ] Currently PNG/JPEG only. Add: multipage PDF, SVG, 2×/3× scale, transparent background,
      export-selected-layer-only.

### Tier 6 — QR polish
- [ ] Replace the 3 misleading panel thumbnails (`public/assets/images/qr-code/{1,2,3}.png` still
      show shipped branding / "SCAN ME").
- [ ] `src/features/design/config/qrCode.tsx` is ~105 KB, mostly baked-in base64 logos — slim it.
- [ ] More payload types: WiFi / vCard / SMS / email. Error-correction level. SVG download.

### Tier 7 — differentiators
- [ ] Magic resize (change canvas size, rescale/reflow layers) — Canva's killer feature.
- [ ] Brand kit (saved palette + fonts).
- [ ] "Save as template" → `POST /api/templates` exists; templates then appear in the Template tab.
- [ ] Share links: read-only view via the existing `GET /api/designs/:id`.

### Deferred cleanups
- [ ] `actions.addPage()` still creates **1640×924** pages regardless of the design's actual size.
- [ ] Consider making the axios interceptor **honest** instead of converting every failed GET into
      `{ data: [] }` with status 200 — it is the root cause of a whole family of bugs.
- [ ] `EditorHeader`'s theme toggle lost the old `@media (max-width: 900px) { display: none }` rule.
- [ ] Remove the `NecroZine_Next` root from the workspace.
- [ ] Consider theming `DrawContent`'s hard-coded geometry.

---

## 6. PASTE THIS WHEN YOU REOPEN

```
Working in c:\Users\jo\dev\NecroZine\canva-clone ONLY (ignore NecroZine_Next/OpenDesign, it's parked).

Please read ideas_todo.md in that folder — it's a handover from your previous session.

Then:
1. Commit the 3 uncommitted files (Draw panel move + Business badge removal).
2. Start on Tier 1: undo/redo keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) and a layer
   clipboard (Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+D, paste offset so copies don't stack).
   Check the current file contents before editing — I may have changed things.
3. Typecheck with tsc and verify the shortcuts in the browser before reporting back.

Also carry forward: DrawToolbar was never verified at runtime — please retest it.
```
