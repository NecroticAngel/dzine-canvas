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

**Baseline:** branch `master`, all work pushed to `origin/master`. Run `git log --oneline -8` for
HEAD. Working tree clean apart from `ideas_todo.md` and line-ending-only churn in
`ShapeContent.tsx` / `styles.css` (empty `git diff` — ignore them).

Upstream now also carries the multi-tenant plan (`docs/plans/multi-tenant.md`) and Phase 2 of it —
see §3.5 for what is done and what is next.

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

## 3.5 MULTI-TENANT WORK (in progress — see `docs/plans/multi-tenant.md`)

Goal: hand this to clients. Each **client organisation** gets logins, sees the templates we share
with them, and creates its own designs. Decisions already taken: orgs with multiple member logins,
**invite-only**, designs owned by the organisation, IdP deliberately left provider-agnostic.

**Done**
- `api/db.js` — metadata in `node:sqlite` (built into Node 26: no dependency, no native build).
  Tables: tenants, members, designs, templates, template_grants. Payloads stay as files.
- Design writes are **atomic** (temp + rename); thumbnails are real image files served from
  `GET /designs/:id/thumb`, not data URLs.
- `GET /designs` no longer parses every design body — it was O(total bytes on disk).
- `adoptOrphanDesigns` migrates a pre-database install and adopts hand-dropped files.
- The browser syncs: `designLibrary.ts` keeps its synchronous API and got a debounced upload queue
  plus `hydrateLibrary()`. Verified: local designs migrate up, saves reach the server, thumbnails are
  captured/uploaded/served, and re-hydrating does not duplicate.
- Save button shows Saving… / Retrying… rather than claiming "Saved" on the local write alone.

**Next**
1. **Phase 1 — identity.** Replace the body of `resolveTenantId` in `api/server.js` (the single seam)
   with a verified token check against a configurable JWKS/issuer URL. Then: delete the `?userId=` /
   `X-User-Id` trust (**anyone can read anyone's designs today**), delete
   `GET /media/uploads/:userId/:file` (IDOR — any tenant's uploads readable by guessing), gate
   template writes to an admin, and **make the axios GET interceptor honest** — it rewrites every
   failed GET into a fake `{data: []}` 200, which would silently swallow 401/403.
2. Autosave. Today a forgotten Save still loses work; only saved state is uploaded.
3. Helm: `UPLOADS_DIR` is unset while `DESIGNS_DIR`/`TEMPLATES_DIR` point at `/data`, so **uploads are
   lost on every redeploy**.
4. Repo history is 192 MB, of which ~175 MB is one 58 MB `output-from-templates.pdf` committed three
   times. It is untracked now but only a history rewrite removes it.

**Testing the browser without Playwright MCP:** those tools can be disabled mid-session, and the
integrated browser's `run_playwright_code` returns no values. Reliable fallback: drive the UI with
`click_element` / `read_page` and assert against the API from the terminal (`Invoke-RestMethod`).

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

### Tier 0.5 — 🐛 BUGS FOUND LAST SESSION — ✅ BOTH FIXED (`4f57376`)
- [x] **Clicks on the canvas while the Draw panel is open added invisible junk layers.**
      Fixed in `DrawContent`: `onEnd` now ignores a stroke whose `path` is empty or whose box is
      0×0. Verified: 3 canvas clicks add nothing, a real drag still adds exactly one layer.
- [x] **`ShapeContent` rendered a "Business" badge** on the *Arrow* group. Removed; verified gone.
- [ ] Still true: `DrawContent`'s geometry is hard-coded (`left: 72`, `top: 44`, `120×250`) rather
      than themed, so it won't follow light/dark restyling.
- [ ] Note: the two junk 0×0 layers already **saved into a design** stay there. They are invisible
      and 0-sized; consider a load-time sweep if it ever matters.

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
- [x] **Smart guides / snapping while dragging.** ✅ `8299006`. `computeSnap` gathers per-axis
      leading-edge / centre / trailing-edge targets from every other layer plus the page's edges
      and centre; the axes snap independently. Descendants of the dragged layer are skipped so a
      group never snaps to itself. Threshold is `SNAP_THRESHOLD` (6 screen px) divided by
      `pageScale`, so the pull feels the same at any zoom. Guides render as themed 1px lines
      (`--app-guide`, both themes) inside the scaled page wrapper and clear on pointerup.
      Verified: 3 units shy of the page centre → snapped to exactly 508/540 on both axes; a drag
      near a sibling stroke's centre snapped to `524.891` instead; guides clear on drop.
- [x] **Align-to-page + distribute + multi-select align.** ✅ `9e84f2a`. New actions `alignLayers`
      and `distributeLayers`, driven by a **floating bar above the selection** (the UI option the
      user picked). Semantics worth remembering:
      - >1 layer selected → align to the **selection's own bounds**; exactly 1 → align to the
        **page**. That single-vs-multi switch is what makes the controls useful with one object.
      - Distribute evens the **edge-to-edge gaps** of 3+ layers, holding both extremes. If the
        content is wider than the span you get equal *negative* gaps (overlap) — Figma does the
        same; we deliberately don't clamp to zero, which would break the extremes.
      - Both go through `commit()`, so each command is one undo step.
      - Both skip layers with no size, so the 0×0 draw leftovers don't get dragged around.
      - The bar re-measures the page element every frame (rAF), so scrolling/zoom keep it glued to
        the selection. It sits **48px** above the anchor, not 12px, to stack clear of
        `DrawToolbar`/`QrToolbar`, which own the space directly above a layer. It hides while a
        text layer is edited or a table cell is selected, and distribute is disabled below 3 layers.
      - Verified: align top → all tops 508, Ctrl+Z restores; space-evenly → equal −38.58 gaps with
        extremes preserved; single-layer align-to-page → x 508 and y 1016, i.e. exactly
        (1080−64)/2 and 1080−64.
- [ ] Optional: rulers, grid.

### Tier 2.5 — ✅ DRAGS AND RESIZES ARE NOW UNDOABLE (`5469d8f`)
- [x] `startInteraction` patched the page live via `updateLayerBox` → `patchLayerLive`, which
      bypasses `commit()`, so moving/resizing a layer created **no** undo entry: Ctrl+Z after a
      drag reverted the *previous* committed change instead.
- [x] Fixed with `beginInteraction()` / `endInteraction()`. The snapshot is taken the moment a
      gesture passes the 4 px movement threshold — **before** the first live patch, so it really is
      the pre-drag state — and is pushed onto the undo stack on pointerup, clearing redo.
      Taking it at movement start (not pointerdown) is what stops a never-moved click from
      creating a no-op undo entry.
- [x] Verified: drag (0,400) → (700,850); Ctrl+Z restores (0,400) in **one** step with no
      intermediate stop; Ctrl+Shift+Z reapplies; Ctrl+Z steps back again.

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

State: editor features are done through Tier 2 (snapping, smart guides, align/distribute, undoable
drags, layer clipboard, undo/redo). The multi-tenant work has started — read
`docs/plans/multi-tenant.md` **and** §3.5 first; §3.5 lists exactly what is done and what is next.

Next, in order:
1. **Phase 1 — identity.** One function to replace: `resolveTenantId` in `api/server.js`. Also
   remove the spoofable `?userId=` trust, the IDOR in `GET /media/uploads/:userId/:file`, and make
   the axios GET interceptor stop rewriting failures into fake empty 200s.
2. **Autosave** — today a forgotten Save loses work; only saved state is uploaded.
3. Tier 2 rulers/grid, Tier 5 export upgrades, or Tier 4 filling the permanently-empty panels.

Verify in the real browser, not just tsc. Read §3, §3.5 and the §4 gotchas before writing Playwright
code — they will save you an hour.
```
