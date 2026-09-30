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
  Tables: tenants, members, designs, templates, template_grants, invites. Payloads stay as files.
- Design writes are **atomic** (temp + rename); thumbnails are real image files served from
  `GET /designs/:id/thumb`, not data URLs.
- `GET /designs` no longer parses every design body — it was O(total bytes on disk).
- `adoptOrphanDesigns` migrates a pre-database install and adopts hand-dropped files.
- The browser syncs: `designLibrary.ts` keeps its synchronous API and got a debounced upload queue
  plus `hydrateLibrary()`. Verified: local designs migrate up, saves reach the server, thumbnails are
  captured/uploaded/served, and re-hydrating does not duplicate.
- Save button shows Saving… / Retrying… rather than claiming "Saved" on the local write alone.

**Done — Phase 1, identity (the security floor)**
- `api/identity.js` verifies tokens itself on `node:crypto` — no dependency added. JWKS fetched and
  cached, JWK → key via `createPublicKey({ format: 'jwk' })`, RS/PS/ES through `verifySignature`,
  HMAC through `createHmac` + `timingSafeEqual`. `alg: none` and a missing `kid` are rejected;
  `exp`/`nbf`/`iss`/`aud` are all checked.
- Three modes from env: `oidc` (`OIDC_ISSUER`/`OIDC_AUDIENCE`), `headers` (a proxy that asserts
  identity), or `dev`. **Production with none configured refuses to boot** rather than falling open.
- **Invite-only provisioning.** An unknown `sub` is rejected unless their email matches a pending
  invite; `AUTH_ADMIN_EMAILS` get the staff tenant as `admin`. Every rejection has a readable
  `detail` the overlay can show.
- **`?userId=` and `X-User-Id` no longer exist** — tenant comes from the token, everywhere. The
  upload IDOR is closed and template writes need `admin`. CORS is an allow-list now.
- `GET /me` + `src/utils/session.ts` + `SessionNotice`: a 401/403 raises one blocking overlay
  instead of a silently empty screen. The axios interceptor only rewrites our own relative-API
  failures and always re-throws, so a CDN 403 (Google Fonts) no longer signs anyone out.
- Verified over HTTP with a signed-token/JWKS harness (no token, garbage, tampered signature,
  `alg: none`, expired, wrong issuer, wrong audience → 401 with the right `detail`; uninvited → 403;
  spoofing ignored; client template POST 403 vs admin 201; cross-tenant media 403; anonymous upload
  read 401; designs land in the right tenant; invite flow provisions correctly) and in the browser
  (dev mode still sees its 3 designs, and adding a shape autosaved — server went 2 → 3 layers).

**Done — Phase 3, template sharing**
- Templates are in the database now (`scope` + `tenant_id` + preview file), not a directory scan.
  Payloads stay files: shared ones in `{STORAGE_ROOT}/templates/`, a client's own in
  `{STORAGE_ROOT}/users/{tenant}/templates/`.
- **The sharing rule is one line of SQL:** a global template with *no* grants is shared with every
  tenant; the moment it has one grant it is shared with exactly those tenants. That is how a
  template gets narrowed to a single client without a second mechanism.
- `POST /templates/:id/use` **copies** the template into the caller's workspace as a new design and
  returns it, so a client can never edit what we shared. This is the core of the product promise.
- A client can save its own design as a template (`sourceDesignId`), private to its tenant. Only an
  administrator can publish something shared — `scope: 'global'` from a client is 403.
- Admin surface: `GET /admin/templates` (with each one's grants), `POST /admin/template-grants`,
  `DELETE /admin/template-grants/:templateId/:tenantId`.
- `GET /templates` is **metadata only** — the payload is a whole design page, so shipping every one
  of them on page load is the mistake the designs list used to make. `GET /templates/:id` has the
  content, and the editor now fetches it on click.
- Previews are self-contained files served from `GET /templates/:id/thumb` (authenticated and
  visibility-checked). Adoption copies a packaged template's static preview in, and a second pass
  repairs rows indexed before previews existed.
- Welcome page: a **"Start from a template"** gallery; picking one creates the design and opens it.
  The editor's Templates panel keeps its old behaviour (replace the current page) and now labels
  each template **Shared** or **Yours**.
- Two id-takeover holes closed while testing: template ids are globally unique, so a client posting
  an existing id ("blank-white") used to **rewrite the shared row**; and `upsertDesign` moved
  `tenant_id` on conflict, so posting another tenant's design id reassigned it. Both now 409.
- Verified with three real tokens (staff admin, two client tenants): visibility before and after a
  grant, revoke, both hijack paths, cross-tenant fetch/use/delete of a private template, protected
  thumbnails, and the on-disk layout. **ALL PASSED.**

**Done — Phase 4, hardening**
- **Uploads are judged by their bytes, not their name.** The old code kept the client's extension and
  served the file back from our own origin, so "logo.png" could be HTML or a script-bearing SVG and
  the browser was invited to run it. The extension is now derived from the content (PNG/JPEG/GIF/
  WebP/SVG magic numbers) and multer holds the file in memory so nothing touches the disk before it
  is checked. Anything else is 415, oversize is 413 with a message naming the limit.
- **Uploaded SVGs are served inertly**: `Content-Security-Policy: default-src 'none'; sandbox` plus
  `X-Content-Type-Options: nosniff`, so navigating straight to one cannot execute anything.
- **Rate limits** exist at all now: reads, writes and uploads have separate per-minute budgets keyed
  by tenant and address, configurable with `RATE_LIMIT_*_PER_MINUTE`, answering 429 with `Retry-After`
  and `RateLimit-*` headers. Reads get their own budget so browsing a gallery can never be what stops
  you saving. Note uploads draw on both the upload and write budgets.
- **Audit trail**: an append-only `audit_log` records who did what (design create/update/delete,
  template create/delete/use, grants and revokes, invites, tenants, uploads) with tenant, member,
  action, target and a JSON detail. `GET /admin/audit?tenantId=&limit=` reads it. Audit writes never
  fail the operation they describe.
- **Backups**: `npm run backup` (`scripts/backup-storage.mjs`) snapshots the database with SQLite's
  `VACUUM INTO` — consistent while the server keeps running, and no need to copy `-wal`/`-shm` — then
  copies the whole storage root and writes a manifest. `--out` (point it at another volume in
  production), `--keep N` to prune. Verified: 5/5 designs copied, `integrity_check` ok, and the live
  database is deliberately not copied.
- Verified with 26 checks on a dedicated instance with a throwaway storage root: HTML-named-PNG
  rejected, SVG-named-TXT accepted and detected, oversize 413, SVG served with the CSP, audit entries
  for six different actions, and both limiters tripping with the right headers while other traffic is
  unaffected.

**Done — conflicts, the last-write-wins gap**
- Two people editing one design used to be a silent clobber: whoever saved last won and the other's
  work simply vanished. `designs.version` is now bumped on every write, `GET /designs` and
  `GET /designs/:id` return it, and a save that quotes an older version gets a **409
  `version-conflict`** with the current state instead of overwriting. The read and the write are
  synchronous, so nothing can slip between them on a single-process server.
- A client that sends no `baseVersion` still works — that is also how "keep my version" resolves, and
  it is what lets an old browser tab keep saving.
- The library holds a conflicted design instead of retrying it forever, and flags it rather than
  pretending to save: the Save button reads **Conflict** in red, and the designs list shows a
  **"Changed somewhere else"** panel with *Keep my version* / *Use their version*. Nothing is lost
  either way until the user chooses.
- Verified: 12 checks over HTTP against a dedicated instance (version 1 on create, bumped on save,
  stale save 409 with `code` and `current`, content of the winning save intact, unversioned save
  allowed, version carried by a template copy, old client unaffected), then in the browser: a
  competing save from the terminal produced a 409, the design was flagged, and the banner appeared
  with both resolutions.
- **Found and fixed in my own code while doing this:** the conflict flag was set on one `readStore()`
  parse and written from another, so it was discarded and the banner never appeared. See gotcha 19.

**Next**
1. Tier 7 continued: brand kit, then magic resize. Share links are done.
2. Render text layers properly, so bold and italic marks work and `/texts` presets stop looking
   identical (see the gaps list under the font work).
3. Export selected-layer-only, which needs the layer renderer to stamp an id.
4. Deferred cleanups at the bottom of §5.

**Also known (not scheduled)**
- **The upload queue is in memory only, so a page reload inside the 800 ms debounce silently loses
  the operation.** Watching it happen: delete a design through the UI and reload immediately — the
  delete never leaves, the server still has it, and the next hydrate puts it back. The same window
  applies to a save. Persisting the pending queue (or flushing on `pagehide`) is the fix; it also
  explains why designs seemed to "resurrect" during this session.
- Repo history is ~192 MB packed, of which ~175 MB is one 58 MB `output-from-templates.pdf` committed
  three separate times. It is untracked and ignored now, so it will not grow; only a history rewrite
  (force-push, invalidates existing clones) removes it.

**Testing the browser without Playwright MCP:** those tools can be disabled mid-session, and the
integrated browser's `run_playwright_code` returns no values. Reliable fallback: drive the UI with
`click_element` / `read_page` and assert against the API from the terminal — but see **gotcha 16**
before you trust an `Invoke-RestMethod` assertion.

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
15. **Editing `src/vendor/design-editor/index.tsx` corrupts the live page.** Vite logs
    `hmr invalidate ... ("useEditor" export is incompatible)` and cascades an update into every
    editor component, after which `useEditor must be used inside <Editor>` fires and the page is left
    in a state where **Playwright can no longer click anything** — every element reports "not stable"
    forever, which looks exactly like a broken layout bug. A plain reload did not clear it; opening a
    **new browser tab** did. When verifying changes to that file, always use a fresh tab.
16. **`Invoke-RestMethod` silently collapses a top-level JSON array into ONE object** whose properties
    are themselves arrays. `$x[0].name` then returns *all* the names, and
    `Where-Object { $_.name -eq 'Portrait' }` matches **everything**, because PowerShell's `-eq`
    filters an array rather than comparing it. It looks exactly like an API bug and is not one.
    Assert with `@(((Invoke-WebRequest $url).Content | ConvertFrom-Json))`, which gives a real
    `Object[]`. (Cost me three confused tool calls; `Invoke-RestMethod` is fine for single objects
    such as `/me`.)
17. **Design and template ids are global, not per tenant.** Both tables key on the id alone, so two
    tenants can never hold the same id — and the `ON CONFLICT DO UPDATE` clauses used to *reassign*
    the row, which let a caller take over someone else's design or rewrite a shared template.
    Designs now carry `WHERE designs.tenant_id = excluded.tenant_id` and both write paths return
    409 when the id belongs to another workspace. Check ownership before any new id-shaped write.
18. **Deleting something and reloading within the 800 ms sync debounce loses the delete.** The
    pending-op queue is in memory, so the reload drops it; the server still has the design, and the
    next hydrate brings it back. It looks like "delete is broken" and it is really "you were faster
    than the debounce". Wait for the Save label to settle before reloading.
    *(Fixed: the queue is persisted now. Kept because the same shape of bug will recur.)*
19. **`readStore()` parses a fresh copy on every call.** Mutating a design from one call and then
    writing the result of a *different* `readStore()` silently discards the change — an object from
    call A is not in the object from call B. It bit the conflict flag: the code set `conflict = true`
    on one parse and wrote another, so the flag vanished and the UI never showed the banner. Read
    the store **once**, find the design in that object, mutate, write.
21. **`cacheBust` breaks `blob:` URLs.** `html-to-image` appends a cache-busting query to every
    image it fetches, and `blob:http://…/<uuid>?1790…` is not a valid URL — the capture fails with
    `ERR_FILE_NOT_FOUND` and the preview is silently skipped. Inserting a graphic from the panel hit
    exactly this, because it built the layer source with `URL.createObjectURL`. Use a `data:` URL
    (exempt from cache busting, and no object URL to leak) or turn `cacheBust` off.
22. **A font URL is not a font URL.** Google's keyless CSS endpoint answers with **woff2** for a
    modern user agent and **TrueType** for an old one. The editor parses fonts to draw glyph paths
    and has no woff2 decompressor, so a full Chrome UA in `scripts/seed-fonts.mjs` produced a
    catalogue nothing could load. The user agent is part of the contract, not a detail.
23. **`useEditor()` with no selector returns a curated subset**, not the whole context — and its type
    is an index signature, so asking for a field that is not in it **compiles fine and is
    `undefined` at runtime**. That crashed the canvas with `ids is not iterable` when the new code
    read `selectedLayerIds`. Use `useSelectedLayers()` or `useContext(EditorContext)` for anything
    outside the subset.
24. **A keydown handler inside an effect reads stale state.** The canvas key handler's dependencies
    do not change when a view toggle flips, so `setShowGrid(!showGrid)` read a stale `showGrid` and
    the shortcut appeared to do nothing. Use the updater form — which also means the setter must be
    typed `Dispatch<SetStateAction<boolean>>`, not `(value: boolean) => void`.
25. **A wrapper sized from its canvas that is sized from the wrapper settles on the canvas's 300px
    default.** The horizontal ruler measured its own box to size its canvas, and the box was sized
    by the canvas, so it stuck at 300px and never saw the viewport. The fix is to take the size from
    the layout (`flexGrow: 1; minWidth: 0`), never from the child being measured.
26. **Watch where an edit lands in a long `if/else` chain.** The Shift+R/G shortcuts were inserted
    inside the `if (mod)` branch — the one for Ctrl/Cmd combinations — so plain Shift+letter never
    reached them. The same edit silently deleted the neighbouring Ctrl+Y handler. Both were only
    visible by actually pressing the keys.

27. **`qrcode`'s browser build parses colours itself and only accepts hex.** Passing the `rgb(r, g, b)`
    that layer props and the presets actually store throws `Invalid hex color: rgb(30, 30, 45)` — from
    inside a promise, so it fails silently into a blank tile. Both `QRCode.toDataURL` and
    `QRCode.toString` are affected; `toDataURL` on a *canvas* element is the same renderer. Always go
    through `colorToHex` (`src/utils/color.ts`). This had been worked around twice before anyone
    noticed the cause, which is why there were two near-identical private copies of the converter.
28. **Destructuring a prop out to read it and never putting it back silently drops it.** The QR panel
    pulls `textColor` out of the preset's props to colour the placeholder icon; `...rest` therefore no
    longer had it, so every inserted QR lost its own dark colour. It went unnoticed because the
    renderer's fallback is the same value as the preset's — only reading the *saved* JSON showed it.
    Verify what is stored, not just what is drawn.
29. **A panel thumbnail that is a static PNG can contradict the preset.** The three QR thumbnails
    advertised a logo and "SCAN ME" branding that `addQrCode` strips before inserting. Drawing the
    tile from the preset's own payload and colours means it cannot drift — the same reasoning as the
    template previews, and it removed 22 KB of assets and 94 KB of dead base64 from the bundle.

30. **A config hook that is declared and never called is a feature that does not exist.** `Editor`'s
    config type has `getFonts?: (query) => Promise<unknown>`, `DesignPage` fetches the catalogue,
    `DzineCanvasEditor` builds the callback — and the vendored editor never invokes it. Everything
    looked wired. Nothing was. When you are told a subsystem works, check that something *calls* it:
    `document.fonts.size` plus one grep for a consumer would have found this a session earlier.
31. **Verifying an endpoint is not verifying the feature.** The Tier 4 note in §5 says the fonts were
    confirmed: 22 families served, TTF magic bytes, `access-control-allow-origin: *`. All true, and
    all about `GET /fonts` — a response the browser threw away. The check that matters asks what the
    *user* sees. Same shape as gotcha 28: verify the outcome, not the plumbing.
32. **Do not cache a negative that depends on data you have not received yet.** The font loader kept
    `family -> promise<loaded>` in a module-level map. A text layer rendering before `/fonts`
    answered found nothing in the catalogue, cached "this family does not exist" for the life of the
    page, and never retried. Latent all session; HMR exposed it by resetting module state. When a
    miss is remembered, remember *why*, and clear it when the reason goes away.
33. **Check `window.innerWidth` before debugging a click that "does not work".** Below 900px the app
    puts the sidebar panel at `position: fixed; top: 0; bottom: 0` — over the tab rail, the canvas and
    the header. The browser was still 825px wide from an earlier resize, so a full-screen template
    panel swallowed every click, and its thumbnails (full-size in that layout) looked like a layout
    bug. It was the responsive breakpoint, and it cost a lot of this session's verification time.

34. **A public route has to be public *all the way down*.** The share endpoint was reachable without
    credentials immediately, but the *design* was not: layer props hold absolute URLs, and fonts and
    library artwork were both behind authentication. An anonymous reader got a correct-looking page
    with fallback type and broken frames. Verifying the new route in isolation would have passed.
    The test that finds this is to run an instance with `AUTH_MODE=headers` and request every URL the
    page will touch with no credentials — private routes answer 401, so the list is unambiguous.
35. **Ask what a handler needs, not just whether it is authorised.** `GET /assets/:id/content` threw
    a 500 for an identity-less caller because it derived a storage root from one. It was never about
    authorisation — the route was fine, the path lookup was not. A 500 where a 404 was expected is a
    signal that the code assumed a precondition nobody documented.

Test data in the library: `Portraitdfsfe` (used for testing),`Square` (created while reproducing the table bug — safe to delete).
A design may be left showing the **Conflict** banner: the QR work inserted layers while the server had
a newer version, so "Keep my version" / "Use their version" is waiting on the welcome page for
`Starter D-Zine Canvas`. `Portrait` and `Starter D-Zine Canvas` were both touched during font
verification (a text layer was switched to Caveat and a heading preset added).

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
- [x] **Rulers and grid — done.**
      - **Rulers** along the top and left, labelled in page units with the step coarsening as you
        zoom out (the smallest step that keeps labels ~60px apart). The origin is measured from the
        page element every frame, so scrolling, zooming and changing page are all correct without
        anything having to notify the ruler. The selection's extent is shaded on both rulers, which
        is the part that makes them useful for measuring rather than just orienting.
      - **Grid** drawn on the page in page units, so it stays locked to the design rather than the
        screen; the line is `1/scale` wide, which keeps it one pixel at any zoom. Sizes 8–100px.
      - Both are toggled from the footer next to the zoom controls, or with **Shift+R** / **Shift+G**,
        and the choice is remembered in `localStorage`.
      - Drawn onto a `<canvas>` rather than with DOM ticks: a 1640-wide page has dozens of ticks and
        labels, and redrawing a small canvas each frame is far cheaper than reconciling that many
        elements. Theme colours are re-read at most once a second, because `getComputedStyle` per
        frame per ruler is a style recalc for two strings.
      - Verified in the browser: the labelled ruler aligns its zero with the page edge, ticks are
        genuinely drawn (sampled dark pixels in the canvas), the grid responds to the size control,
        the keyboard shortcuts round-trip in both directions, the footer buttons stay in step, and
        the preference survives a reload.
- [ ] **Not included: snapping to the grid.** The grid is a measuring aid here; pulling layers to it
      would need a branch in `computeSnap` alongside the existing guide snapping.
- [ ] Not included either: dragging guides out of the rulers. The editor's existing guides are the
      transient alignment lines shown *during* a drag, not user-placed rulers guides.

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

### Tier 3 — server-backed designs (big unlock) — ✅ DONE (Phases 1 and 2)
- [x] The library is server-backed: `api/db.js` (`node:sqlite`) holds metadata, payloads stay files,
      thumbnails are real image files, and writes are atomic.
- [x] `necrozine-lidojs-library` migrates into the account on first load (`hydrateLibrary`), is
      idempotent, discards the placeholder design once real ones exist, and never duplicates.
- [x] Autosave (1.2 s after the last edit) plus a dirty flag and a real Save/Saving/Retrying label.
- [x] The pending-op queue is persisted, so a reload inside the debounce can no longer drop a delete.

### Tier 4 — fill the permanently-empty panels — ✅ DONE
- The three panels called `/frames`, `/graphics` and `/images` against a service that was never part
  of this app, so Frame, Graphic and Image could never populate. They are now backed by a real asset
  library: artwork on disk under `{STORAGE_ROOT}/assets/<category>/`, metadata in an `assets` table,
  adopted on boot the same way templates are. Dropping an SVG into a category directory publishes it.
- `npm run seed:assets` generates **42 assets** from definitions rather than forty hand-written
  files: 16 frames (each with its clip path), 18 graphics, 8 backgrounds. A frame's picker silhouette
  and its clip mask come from the same path, so they cannot disagree.
- `GET /frames`, `/graphics` and `/images` keep the shapes the panels already expected, so the
  front-end change was small. `/assets` and `/assets/:id/content` serve the library directly.
- Admins publish with `POST /admin/assets` and remove with `DELETE /admin/assets/:id`; both audited.
- **Removed a relay that would have been an open proxy.** The Graphic panel fetched each SVG through
  `/graphics/download?url=`, which would have had to fetch a caller-supplied URL. It now fetches the
  asset's own content endpoint.
- **Fixed the Unsplash credit.** The Image panel credited Unsplash for artwork this repo generates,
  and `Photo` linked to a photographer profile that does not exist.
- Verified in the browser: 16 frames, 18 graphics and 8 backgrounds all render from the API; a frame
  inserts as a `FrameLayer` carrying its clip path (checked in the saved design), a graphic as an
  `SvgLayer`, a background as an image layer.
- **Also fixed: the font list was never loading.** `DesignPage` called Google's Webfonts API *from the
  browser* with `process.env.FONT_API_KEY`, which Vite does not inline, so the request went out as
  `key=undefined` and answered **403** — the 403 that sat in the console for the life of the project
  looking like a stray stylesheet. Fonts now come from `GET /fonts`:
  `npm run seed:fonts` builds a bundled catalogue of **22 families / 71 faces** from Google's
  *keyless* CSS endpoint with real TrueType URLs; with `FONT_API_KEY` set server-side, `/fonts`
  prefers Google's full catalogue and the key never reaches a browser. Verified: no requests to
  `googleapis.com` remain, 22 families served, and a sampled file is a real TTF (`00010000`).

### Tier 5 — export upgrades — ✅ MOSTLY DONE
- [x] **SVG** export (`toSvg`), alongside PNG/JPG/PDF/JSON.
- [x] **1× / 2× / 3× scale**, chosen in the export menu. 2× was previously hard-coded.
- [x] **Transparent background** for PNG and SVG (omitted for JPG, which has no alpha channel, and
      the menu passes `transparent: false` there rather than pretending).
- [x] **Multi-page output**: "All pages" writes one file per page (`name-1.svg`, `name-2.svg`) and
      builds a genuine multi-page PDF instead of only ever exporting the active page.
- [x] Verified against the real module in a browser: `t.svg`, `t-1.svg` + `t-2.svg`, and a `t.pdf`
      blob for two pages; 1× vs 3× PNG differ by the expected amount; and decoding both PNGs shows
      the corner pixel is `rgba(255,255,255,255)` opaque against `rgba(0,0,0,0)` transparent at the
      same 800×400 (200×100 at 2×).
- [ ] **Export selected layer only** — still open, and it needs more than a menu entry: the vendored
      layer renderer writes no `data-layer-id` (the only such attribute in the codebase is
      `data-selected-cell`, for table cells), so there is no way to find a layer's DOM node from its
      id. Either patch the layer package to stamp an id, or crop the captured page to the selection's
      bounding box, which needs the editor to expose the box it already computes internally
      (`layerBoxes`).
- Note: a multi-page PDF places every page at the active page's size. Designs whose pages share one
      size — the normal case — are exact.

### Tier 6 — QR polish — ✅ DONE
- [x] The three misleading thumbnails are gone (`public/assets/images/qr-code/{1,2,3}.png` deleted).
      The panel draws each tile instead, from the preset's own payload, colours, card and caption, so
      a thumbnail cannot advertise a preset that does not exist (gotcha 29).
- [x] `src/features/design/config/qrCode.tsx` went **104.6 KB → 12.9 KB**. Each preset carried a 31 KB
      base64 logo that `addQrCode` replaces unconditionally — pure dead weight. `scripts/slim-qr-presets.mjs`
      did the strip and prints a size report; it is a one-off, kept for the record.
- [x] More payload types: **WiFi, contact card (vCard), SMS, email, phone, plain text**, alongside a
      URL. The one that needed care is escaping, which is where these grammars break: WiFi uses `;`
      between fields and `:` inside them, so a password containing either has to be escaped or the
      scanner reads a shorter value. `src/utils/qrPayload.ts` owns the builders and the escaping;
      the panel shows the exact string it will encode, so a stray delimiter is visible before you
      commit to it. Verified against the running app: 14 assertions over the grammars, and the
      escaped payload survives save and reload.
- [x] Error-correction level (L/M/Q/H) in the QR toolbar, stored on the layer, defaulting to `H` so
      existing designs render byte-identically. Dropping to L or M with an icon in place highlights
      the control and says why — a logo covers modules only Q and H keep recoverable.
- [x] **SVG download** from the QR toolbar. The on-canvas code is a PNG with an `<img>` logo over it,
      which has nothing to export, so the logo is rebuilt as an `<image>` on a plate of the code's own
      light colour at the same 22% the layer uses. Verified: a 3 KB `image/svg+xml` blob with
      `viewBox`-derived geometry, `xmlns:xlink` declared and the image centred at `(31-6.82)/2`.
- Also fixed here: `textColor` no longer disappears on insert (gotcha 28), and the two private copies
      of the colour converter are now one shared `colorToHex` (gotcha 27).

### Fonts, end to end — ✅ DONE
Asked for as "make fonts work"; the finding was that they never had. Tier 4 built the supply side
(`/fonts`, a 22-family catalogue, a `getFonts` callback) and there was no consumer: **no font-family
picker existed at all**, `document.fonts` held one family (the shell's Nunito), and the vendored editor
declares `getFonts` in its config type and never calls it. Every text layer rendered as
`fontFamily ?? 'Nunito, sans-serif'`, and the preset families were decorative.

- [x] **The files are ours now.** `scripts/fetch-fonts.mjs` downloads all 76 faces into
      `api/data/fonts/` and rewrites the catalogue to `/fonts/files/<name>`; `GET /fonts/files/:name`
      serves them with `font/ttf` and a one-year immutable cache, matched against a strict pattern
      rather than joined onto the directory (a font name is a path segment from the client, and `../`
      is the obvious thing to try). Verified: 400 on traversal, 404 on unknown, `00 01 00 00` magic,
      86 KB for Oswald. The catalogue has **zero** non-local urls.
- [x] **Faces are registered on demand.** `src/utils/fonts.ts` registers a family's `FontFace` objects
      the first time a layer asks for it — `new FontFace()` fetches nothing until `load()`, so a
      design only downloads the faces it uses. Verified: Oswald, Agdasima, Caveat and Roboto all
      resolve with their own metrics (measured widths 254.1 / 196.4 / distinct / distinct against a
      303.9 fallback), and every layer reports `data-font-ready="true"`.
- [x] **A font picker exists**: a floating toolbar for text layers (family, size, colour, alignment),
      anchored like the QR and table toolbars. Family is chosen from the catalogue, so anything
      selectable provably has a file. Verified end to end: switching a layer to Caveat updated the
      computed style, registered both faces and fetched `caveat-regular.ttf` + `caveat-bold.ttf` from
      our API. A layer naming a family the catalogue lacks stays selectable rather than being
      silently rewritten.
- [x] **The shell font is local.** `index.html` no longer preconnects to Google or loads a
      render-blocking stylesheet from it; Nunito's 7 faces are in `public/assets/fonts/` (275 KB of
      woff2, fetched by `scripts/fetch-shell-font.mjs`) declared as `@font-face` in the document head.
      Verified: the welcome page renders in Nunito and the whole app makes **zero** requests to
      `googleapis`, `gstatic` or `amazonaws`.
- [x] **The dead third-party origins are gone.** `scripts/strip-preset-font-urls.mjs` removed the
      seven `fonts: [...]` blocks from the presets (22 `lidojs-fonts.s3…` urls and one
      `fonts.gstatic.com`). Nothing read them, so they were never a runtime dependency — but they
      shipped in the bundle and were copied into every design started from a preset, advertising a
      font source that was not in use.
- [x] Agdasima, Acme and Akatab were added to the catalogue: the sample pages, text effects and table
      presets name them, and a family that is asked for but absent renders in the fallback for no
      visible reason.

**Known gaps from this work**
- **Bold and italic do nothing on a text layer.** The renderer draws `extractText(props.doc)` as a
  single string, so the marks the presets carry are ignored — which is why the new toolbar offers only
  the block attributes. Table cells *do* honour marks, so the intent is there; making text layers
  render runs would mean rendering the doc properly. Until then, `/texts` presets that differ only by
  weight look identical.
- The design catalogue is TrueType (11.6 MB) because the editor was assumed to parse glyphs. It
  actually renders text through CSS, and the shell font proves woff2 works — switching the catalogue
  would cut ~8 MB of binaries.
- `GET /api/designs/:id/thumb` fails with `net::ERR_BLOCKED_BY_ORB` for some saved designs (the
  request is served with a type the browser refuses to sniff). Two of the seven designs on the welcome
  page show no thumbnail. Pre-existing, unrelated to fonts, and worth a look.


### Tier 7 — differentiators
- [ ] Magic resize (change canvas size, rescale/reflow layers) — Canva's killer feature.
- [ ] Brand kit (saved palette + fonts).
- [x] "Save as template" exists (Phase 3): `POST /templates` with a `sourceDesignId`, and a client's
      templates are private to its tenant. An admin can publish a shared one.
- [x] **Share links** — a read-only URL to one design, for somebody with no account.

### Share links — ✅ DONE
The one grant in the system that does not require a login, because the recipient is a client's
customer and will never have one.

- [x] `share_links` table: token, design, tenant, created/created_by, `revoked_at`. Revoking is an
      update, not a delete — a record that a link existed and was withdrawn is worth more than the row.
- [x] `POST /designs/:id/share` (idempotent: **one live link per design**, so the dialog shows the link
      that exists rather than silently invalidating the copy already sent to someone), `DELETE` to
      revoke all of a design's links, and `GET /shared/:token` as the public read. The token is 24
      random bytes, base64url — the whole request, so it is the one thing an attacker can guess.
      A revoked, deleted and never-existed token all answer 404 with the same body: telling them apart
      would let a guess be confirmed.
- [x] The viewer (`?share=<token>`) mounts the **real editor with `readOnly`**, so a recipient sees the
      design rather than a re-implementation of it. Read-only is enforced at the three state setters
      that carry every change rather than at each of the forty-odd actions that reach them — a pointer
      handler can call whatever it likes and nothing moves. `persistCurrent` is the choke point for
      saving, so a viewer cannot write to the library or upload.
- [x] The app has no router, so a share link is `?share=<token>` on the app itself. The client builds
      the copied URL from its own origin, not from the API's answer: in development the app and the API
      are on different ports, and the API's canonical URL would render nothing.
- [x] The share dialog sits in the editor header next to Preview, with copy and revoke, and explains
      what the link does.

**Public surface.** Opening a shared design needs more than the design: the pages reference fonts and
library artwork by absolute URL. Verified on an instance with `AUTH_MODE=headers`, where every
private route answers 401:

| public | private |
|---|---|
| `/shared/<token>`, `/fonts`, `/fonts/files/<name>`, `/assets/<id>/content`, `/health` | `/designs`, `/templates`, `/audit`, `/members`, `/uploads`, `/assets` (listing), `/admin/assets` |

Both catalogues are global by design — the assets table says so, and the fonts are a fixed list of
open-licensed families — so no tenant data is exposed. The trailing slashes matter: `/assets/` admits
content while leaving the listing and the admin routes behind authentication.

**Found while verifying, both fixed:** `GET /assets/:id/content` answered **500** for a caller with no
identity, because it derived a storage root from one (`pathsFor` → `tenantOf` → throw). It now prefers
the caller's directory and falls back to the packaged root. And the font files were still behind
authentication, so a shared design would have rendered in fallback faces with nothing to indicate why.


### Deferred cleanups
- [x] `actions.addPage()` now matches the design: it takes the size from the page you are on instead
      of appending a fixed 1640×924. Verified in the browser — adding a page to a 1080×1350 design
      produced another 1080×1350, where it used to hand you a landscape page and quietly make the
      design mixed-size.
- [x] The axios interceptor is honest now (Phase 1): it only rewrites our own relative-API failures,
      requires an error `code`, always re-throws, and raises a blocking notice for 401/403.
- [x] `EditorHeader`'s theme toggle is hidden below 900px again, as the old rule did before it was
      lost; the same toggle is on the welcome page, and the editor header needs the room.
- [ ] Remove the `NecroZine_Next` root from the workspace — that lives in the editor's workspace
      file, not this repo.
- [ ] Consider theming `DrawContent`'s hard-coded geometry (`left: 72`, `top: 44`, `120×250`). Purely
      cosmetic: it anchors over the selection, so it does not follow restyling.
- [ ] The two junk 0×0 draw layers already saved into a design are still there. Invisible and
      zero-sized; a load-time sweep is not worth the risk of removing something meaningful.

---

## 6. PASTE THIS WHEN YOU REOPEN

```
Working in c:\Users\jo\dev\NecroZine\canva-clone ONLY (ignore NecroZine_Next/OpenDesign, it's parked).

Please read ideas_todo.md in that folder — it's a handover from your previous session.

State: editor features are done through Tier 2 (snapping, smart guides, align/distribute, undoable
drags, layer clipboard, undo/redo). The multi-tenant work is nearly done — read
`docs/plans/multi-tenant.md` **and** §3.5 first; §3.5 lists exactly what is done and what is next.
Phases 1, 2 and 3 are complete: designs and templates live in server-side SQLite + files, every
request is authenticated against a verified OIDC token (invite-only, per-tenant isolation,
admin-gated publishing), and a client can start a design from a template it was shared with.
Dev mode still works with no configuration.

Next, in order:
1. **Phase 4 — hardening.** Backups of `db.sqlite` + files, rate limits, upload MIME allow-list,
   audit trail. Also: the pending-op queue is in memory, so a reload inside the 800 ms debounce
   silently drops a delete (see §3.5 and gotcha 18).
2. Conflict handling (last-write-wins clobbers), Tier 2 rulers/grid, Tier 5 export upgrades, or
   Tier 4 filling the permanently-empty panels.

Verify in the real browser, not just tsc. Read §3, §3.5 and the §4 gotchas before writing Playwright
code — they will save you an hour.
```
