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

**Baseline:** branch `master`, HEAD = `c71fe64 "ww"`, **1 commit ahead of `origin/master`**
(**push it**). Working tree clean apart from `ideas_todo.md` itself.

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

### ✅ COMMITTED — Tier 1 lives in `src/vendor/design-editor/index.tsx` (commit `c71fe64`)

The keyboard shortcuts (undo/redo, layer clipboard, Escape, arrow-nudge, Ctrl+A, zoom,
`[`/`]` restack) plus the `addLayerTrees` bulk action and the 3 clipboard helpers
(`copyLayerTree`, `remapLayerTree`, `moveLayerInParent`).

`.serena/` is untracked but self-ignoring — Serena writes its own `.serena/.gitignore`,
so it needs nothing from the root `.gitignore`.

### ✅ VERIFIED THIS SESSION (`DrawToolbar`) — previously "never verified"

Confirmed working end-to-end via Playwright against the real dev server:

- Pencil drag → `SvgLayer` with `stroke=#0571d3`, `stroke-width=5`, path len 972.
- `data-draw-anchor="true"` appears, toolbar renders with **both** controls.
- **Stroke colour** `input[type=color]` → layer SVG restroked (`#fff234` → `#ff0000`), path unchanged.
- **Stroke width** `input[type=number]` → commits on **Enter** and on **blur** (33 → 12 verified).
- Pen switching works: clicking Highlighter then drawing produced `#fff234`/width 20.

⚠️ **Playwright caveat:** fast synthetic drags (`mouse.move` steps < ~6px / < ~35 ms apart)
produce an **empty path** (`d=""`, 0×0 box) and no toolbar. That is a *test input* artifact, not a
product bug. Slow the drag down (~6px steps, 35 ms waits, 120 ms pause after `down()`) and it works.
Also: the toolbar's `anchor` state is driven by a `requestAnimationFrame` loop, so it can vanish
between separate tool invocations — do the draw **and** the toolbar assertions in **one** run.

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
10. **Serena MCP tools are now ENABLED** (they were off last session). `activate_project` works;
    `find_symbol` and `initial_instructions` work, but `search_for_pattern` was disabled, and
    node_modules is ignored by Serena, so read design-core's `.d.ts` files with `read_file`.
11. The integrated VS Code browser's `run_playwright_code` **does not surface return values**
    (and `document.title` edits didn't show either). Use the **Playwright MCP browser** instead —
    its `run_code_unsafe` returns values inline. It has its own localStorage, so create a design
    there from scratch.
12. Measuring layers in the DOM: layer count = children of
    `#lidojs-page-0 > div > div` (the RootLayer). That div is found via the id hard-coded in
    `DrawContent` (`lidojs-page-${activePage}`). A frame with **more than 1 child** is *selected*
    (the 4 corner handles are children). Child array order **is** z-order; last = topmost.
13. Layer position is inline (`left`/`top`/`width`/`height`), so nudge/z-order assertions can read
    `getAttribute('style')` directly — no Emotion hash needed.
14. `page.getByLabel('Stroke width')` **times out** even though
    `document.querySelector('input[aria-label="Stroke width"]')` exists. If Playwright's label
    lookup fails, fall back to a DOM query inside `page.evaluate`.

Test data in the library: `Portraitdfsfe` (used for testing),
`Square` (created while reproducing the table bug — safe to delete).

---

## 5. IDEAS / TODO

### Tier 0 — housekeeping
- [x] **Commit the 3 uncommitted files** (Draw panel position + Business badge removal). ✅ in `d5a31b9`
- [x] Push `master`. ✅ was in sync at `079425e`; **now 1 ahead again** (`c71fe64` has the Tier 1 work).
- [x] **Re-verify `DrawToolbar` at runtime.** ✅ Done — see §3.

### Tier 0.5 — 🐛 BUGS FOUND THIS SESSION (both pre-existing, not from Tier 1)
- [ ] **Any click on the canvas while the Draw panel is open adds an invisible junk layer.**
      Reproduced: 3 plain clicks → 3 new layers, each `width: 0px; height: 0px`, `d=""`,
      position ≈ `125,66`. Cause: `useDraw`'s `canStartDraw` accepts a pointerdown+pointerup with
      no movement, and `onEnd` calls `actions.addDrawLayer()` with an empty path. These junk
      layers are selectable, undoable and get saved. Fix ideas: ignore `onEnd` when the path is
      empty, or require a minimum drag distance in `canStartDraw`.
- [ ] **`ShapeContent` still renders a "Business" badge** on the *Arrow* group, after the rail-side
      badges were removed in `TabList.tsx`/`Sidebar.tsx`. Inconsistent with that cleanup.
- [ ] `DrawContent`'s geometry is hard-coded (`left: 72`, `top: 44`, `120×250`) rather than themed,
      so it won't follow light/dark restyling.

### Tier 1 — ✅ DONE THIS SESSION
- [x] **Undo/redo shortcuts.** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Verified: 6→3→6→3→6 layers.
- [x] **Layer clipboard.** Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+D. Pastes cascade by 16 px
      (`16 * (pasteCount + 1)`), copies are re-keyed to fresh ids, and the clipboard survives
      unlike layers. Verified: 3→6 on paste, copies offset +16/+16, all copies selected.
      Multi-layer paste is **one** undo step (new `actions.addLayerTrees`, which merges every tree
      then single-`commit`s) — not N steps.
- [x] Other shortcuts: Escape (deselect + exit text edit), arrow nudge (Shift = ×10, one history
      entry, verified −1 px and +10 px), Ctrl+A (select all top-level layers), Ctrl+= / Ctrl+- /
      Ctrl+0 (zoom; **browser zoom is correctly suppressed** — 43%→48%→43%→100%),
      `[` / `]` restack (verified index 6→5→4→5; multi-select moves in travel order so
      siblings can't leapfrog).
- [x] Existing Ctrl+S / Delete / Backspace still work (regression-checked).

*Note:* `Ctrl+0` resets to **100%**, not the app's 0.43 fit default. Change it if that feels wrong.

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

State: Tier 0 and Tier 1 are DONE. src/vendor/design-editor/index.tsx is MODIFIED but
UNCOMMITTED (keyboard shortcuts + layer clipboard) — review, typecheck and commit it first.

Then pick up Tier 0.5 (the new bugs found last session):
1. Clicks on the canvas while the Draw panel is open silently add invisible 0x0 draw layers.
   Fix in useDraw / canStartDraw (reject empty paths).
2. ShapeContent still shows a "Business" badge on the Arrow group.

After that, Tier 2 (smart guides / snapping / align + distribute) is the recommended batch.

Verify with the real browser, not just tsc. Two hard-won test notes are in §3 — slow synthetic
drags and keep draw + toolbar assertions in a single run, or you'll chase ghosts.
```
