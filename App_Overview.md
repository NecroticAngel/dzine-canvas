# D-Zine Canvas — App Overview

> **Purpose:** what this app is, how to run it, what it does, and everything learned building it —
> the architecture, the feature-by-feature record, and the gotchas that cost real time.
>
> **Open work lives in [`ideas_todo.md`](./ideas_todo.md).** Read this file for context, then work
> from the todo. Read §4 before writing any browser test.

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

**Line endings.** The repo is LF (`* text=auto eol=lf`), but files written by tooling often arrive
CRLF, which shows up as phantom modifications in `git status` with an empty `git diff`. Normalise
before staging, and commit with a message file (`git commit -F <file>`) rather than a long inline `-m`.

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

Mounted at `` app.use(`${BASE_PATH}/api`, api) ``. *This list sat stale for a long time — it still
claimed the Tier 4 asset routes did not exist — so it is now straight off the route table.*

**Session:** `GET /health` · `GET /` · `GET /me`
**Templates:** `GET /templates` · `GET /templates/:id` · `GET /templates/:id/thumb` ·
`POST /templates` (your own, or — administrators only — a global one or a copy for another company) ·
`DELETE /templates/:id` · `POST /templates/:id/use`
**Designs:** `GET|POST /designs` · `GET|PUT|DELETE /designs/:id` · `GET /designs/:id/thumb` ·
`POST|DELETE /designs/:id/share` · `GET /shared/:token`
**Uploads:** `GET|POST /uploads` · `DELETE /uploads/:id` · `GET /media/uploads/:userId/:file`
**Assets and content:** `GET /frames` · `GET /graphics` · `GET /images` · `GET /assets` ·
`GET /assets/:id/content` · `GET /fonts` · `GET /fonts/files/:name` · `GET|PUT /brand`
**Admin** (`requireAdmin`): `GET|POST /admin/tenants` · `GET|POST /admin/invites` ·
`DELETE /admin/invites/:email` · `GET /admin/members` · `GET /admin/templates` ·
`GET /admin/templates/:id/thumb` · `POST /admin/template-grants` ·
`DELETE /admin/template-grants/:templateId/:tenantId` · `GET /admin/audit` · `POST /admin/assets` ·
`DELETE /admin/assets/:id`

**Still not implemented:** `/texts` and `/videos` — which is why the Text panel's own catalogue has
nothing in it.

`vite.config.ts` proxies `/api` → `http://localhost:4201`.

---

## 3. CURRENT STATE

**Baseline:** branch `master`, all work pushed to `origin/master`. Run `git log --oneline -8` for
HEAD. The feature backlog is **empty**: every tier in §5 is done, and the multi-tenant build in §3.5
is complete through Phase 4 plus conflict handling. What is left is listed in `ideas_todo.md`.

**Repo size:** ~192 MB packed, about 175 MB of it one 58 MB `output-from-templates.pdf` committed
three separate times. It is untracked and ignored now, so it will not grow. Removing it needs a
history rewrite (force-push, which invalidates existing clones) — a deliberate non-goal so far, not
something anyone forgot to do.

**Upstream also carries** `docs/plans/multi-tenant.md` — the original plan and its phase-by-phase
progress — and `src/vendor/design-editor/index.tsx`, which is where most editor behaviour lives.

Working & verified:
- Canvas presets + `NewDesignModal` (social sizes, 12 categories, custom W×H, search)
- Theme toggle (icon-only) in WelcomePage + EditorHeader; dark default
- Design thumbnails captured on save, rendered on home cards
- `/api` proxy + shape guards on Frame/Graphic/Image/Text/Template/Upload panels & DesignPage
- QR: destination-URL input in panel, `QrToolbar` (url / dark / light / logo upload / clear), cog demo icon
- Table cells editable: `TableCellView` + `CellToolbar` (bold, italic, size, colour, align, cell bg)
- Draw panel + `DrawToolbar` (stroke colour / width)
- Sidebar "Business" badges removed
- Sidebar rail tabs toggle: clicking the open tab's icon closes its panel, as does its ✕
- Pages panel minimises to a 36px strip (remembered in `necrozine-pages-panel`)
- Editor header's repository link is hidden behind `SHOW_REPO_LINK` — kept in the code, not deleted
- Draw panel floats **top-left** (`left: 72, top: 44`)

The per-feature record, with the exact verifications, is §5. `.serena/` is untracked but self-ignoring
— Serena writes its own `.serena/.gitignore`, so it needs nothing from the root one.

---

## 3.5 MULTI-TENANT WORK — ✅ COMPLETE (see `docs/plans/multi-tenant.md`)

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

**Also fixed in that pass:** the upload queue is persisted now, so a reload inside the 800 ms debounce
no longer drops the operation (gotcha 18).

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
5. **The sidebar rail is a toggle** — clicking the open tab's icon closes its panel, and so does the
   ✕. A test that clicks a tab twice must expect it *closed* on the second click. (This note claimed
   as much for a while before the code did it.)
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
11. **Two hard limits of the integrated browser: its tab is always `"hidden"`, and keyboard events
    never reach the page.** `document.visibilityState` stays `"hidden"` even after
    `page.bringToFront()`, so `page.keyboard.press(...)` dispatches nothing and every
    `requestAnimationFrame` callback is suspended — the latter is what gotcha 39 is about. Verify a
    shortcut by clicking the control that calls the same action instead. (Notes elsewhere claiming
    `run_playwright_code` "does not surface return values" are stale — it does. The Playwright MCP
    browser is the contingency if these tools are disabled mid-session; it has its own
    localStorage.)
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
22. **A font URL is not a font URL.** Google's keyless CSS endpoint answers with **woff2** for a modern
    user agent and **TrueType** for an old one, so the user agent is part of the contract rather than a
    detail. This one was learned backwards, and the correction is the interesting part: the catalogue
    was pinned to TrueType with a bare `Mozilla/5.0` because the editor was assumed to parse fonts and
    draw glyph paths itself — a parser that does not exist, since text renders through CSS. The pin
    therefore bought nothing and cost about 9 MB of download. Same lesson as gotcha 30, in a different
    costume: check that the thing you are accommodating is real before you pay for it.
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

36. **Keyboard events do not reach the page in the integrated browser.** `page.keyboard.press('Control+z')`
    dispatches nothing — a `window.addEventListener('keydown', …)` installed from `page.evaluate` recorded
    zero events for a press, and it explains an earlier Escape that appeared to do nothing. Every shortcut
    (Ctrl+Z/Y, Ctrl+C/V, Esc, Shift+R/G) therefore has to be verified some other way: click the control
    that calls the same action, or read the handler. The editor's undo/redo are icons in the header with
    no label, reachable in the DOM as the two children of the group immediately before the GitHub link,
    and their `opacity` reports `canUndo`/`canRedo` — which is how the brand applies were proved undoable.

37. **A pure function that "passes every test" can still be wrong.** The first magic-resize algorithm was
    tested against assertions I wrote from its own rules — positions mapped per axis, sizes scaled
    uniformly, nothing outside the frame — and satisfied all of them while turning a landscape banner
    into dust. The assertions described the implementation, not the outcome, so they could not catch a
    bad outcome. Pure functions are cheap to test *and* cheap to look at: render the result, or reason
    about one concrete example, before trusting the green.
38. **Resizing to the size it already has must be a no-op.** Worth stating as an invariant because it is
    easy to break and trivial to check: any transform that computes a new centre has to reproduce the
    original coordinates exactly at ratio 1. It is the cheapest guard against a whole class of
    drift-in-by-a-few-pixels bugs, and it caught the centring rule I nearly shipped.
39. **`requestAnimationFrame` never fires in a background tab, so never make it load-bearing.** Every
    floating toolbar anchored itself to the canvas with a rAF loop whose only job was to measure a
    bounding rect, and each of them returned `null` until the first frame ran. A hidden tab suspends
    rAF outright, so *no toolbar appeared at all* — I found it by counting ticks inside a timeout and
    getting **zero**, with `document.visibilityState` reading `"hidden"` (`page.bringToFront()` does
    not change that in this harness). I had spent a while suspecting a regression in my own edits
    before measuring the thing I had assumed was working. The fix is one synchronous measurement on
    selection change, with rAF used only to *follow* a moving layer: a frame is an optimisation, and
    anything the user can see must not depend on one arriving. The same trap is inside
    `html-to-image`: `createImage` resolves **every** capture from inside a rAF callback
    (`img.decode().then(() => requestAnimationFrame(() => resolve(img)))`). A capture started in a
    background tab therefore never finishes, and it fails in two different shapes: an **export** is
    awaited, so the header sat on "Exporting…" with no file and nothing thrown, while the **autosave
    thumbnail** is fired off with `void` (deliberately — a failed capture must not fail a save), so the
    design saved with no preview and nothing said why. `withVisibleFrames` runs a capture with frames
    driven by a timer instead, which is the only way to make that library finish in a tab that is not
    drawing.
40. **`html-to-image` multiplies `canvasWidth` by `pixelRatio`.** `toCanvas` computes
    `canvas.width = (options.canvasWidth || width) * ratio`, so passing a canvas size *and* a pixel
    ratio scales the output **twice**: 2× exported at 4×, 3× at 9×. It had been that way since the
    scale menu was added, and nothing caught it because 1× is right and the notes compared exports to
    each other instead of to the page. Two things make it worth stating plainly. The numbers were
    *squared*, not merely wrong, which is the signature of a double multiplication — and the oversize
    canvases then hit the browser's dimension limit, where the library **silently scales the canvas
    down** (`checkCanvasDimensions`) rather than failing, so a large export could be smaller than the
    multiplier asked for with nothing to say why. Pass `width`/`height` and `pixelRatio`; never both a
    canvas size and a ratio.
41. **A preset that carries fixed layer ids overwrites itself.** `text-effects.ts` gives its three
    presets literal `rootId`s, and `addTextLayer` merged the preset's tree verbatim — so clicking
    "Add a heading" twice produced **one** layer, the second insert landing on the first one's key.
    Every other insert path (`addSingle`) mints a `uuid()`, and the paste path re-keys with
    `remapLayerTree`, so this was the one door left open. It is now re-keyed like a paste. Worth
    remembering because the failure is silent — the layer count simply does not go up — and two
    identical headings is not an exotic thing to want.
42. **In the integrated browser's hidden tab, `pointerdown` and `pointerup` never arrive — but
    `pointermove` does.** A drag driven by `page.mouse` moved nothing while the window counted nine
    moves and zero downs, and `page.bringToFront()` does not change it (gotcha 39 is the same tab
    being `"hidden"`). Dispatching the events yourself works: a `PointerEvent('pointerdown')` with
    `bubbles`, `cancelable` and `composed` set, dispatched on the element under the cursor, then
    `pointermove`/`pointerup` dispatched on `window` (the editor listens for those on `window`, and
    React picks the down up by delegation from `#root`). Read the DOM in a **later** `page.evaluate`
    call — React has not re-rendered within the same task, so measuring immediately reports the old
    geometry and a working drag looks exactly like a broken one.
43. **An offline-first cache that re-uploads whatever the server lacks will resurrect deletions.**
    Deleting a design through the API (or from another browser) looked like it worked and then came
    straight back: `hydrateLibrary` rebuilt the list from the server and then, for every local design
    the server did not list, pushed it into the store *and* queued an upsert. That rule is right for a
    design this browser made and has not managed to upload yet, and wrong for one it got **from** the
    server — the flag that tells them apart was already on the record (`remote`), so the fix is one
    guard: a `remote` design missing from the server's list is dropped, not re-uploaded. Worth
    remembering because it is invisible until the count stops going down — and because there were
    **two** paths that did it, in two branches of the same function: the one that runs when the server
    *has* designs, and the "nothing in the account yet" branch that an **emptied** account lands in.
    Fixing only the first leaves the hole exactly where you are about to put your foot: empty the
    gallery and the next page load refills it. Both now drop `remote` designs, and the empty branch
    clears the library keys outright when nothing is left, because `readStore` treats an empty list as
    no store at all and the next boot mints a fresh placeholder — the shape a first run has.
44. **Editing a file while the dev server is running can leave two copies of the vendored editor in the
    page.** After a run of edits, `Sidebar` and `PagesPanel` threw `useEditor must be used inside
    <Editor>` and the stacks showed *two different* module URLs for the same `design-editor/index.tsx`
    (`?t=1790935825362` and `?t=1790936207195`) — two module instances mean two React contexts, and the
    consumers were resolving the wrong one. Nothing was wrong with the code: a fresh page load mounts
    the editor with zero errors. Reload the page before believing an error like this, and before
    trusting a browser test that runs after an edit.
45. **The editor's view state lives in `localStorage`, not in the design.** `necrozine-canvas-view`
    holds rulers / grid / snap / grid size and `necrozine-pages-panel` holds whether the pages panel is
    minimised. So it is per-browser, not per-design: a test that expects the default view has to clear
    those keys first, and one tab's toggling changes what the next tab boots into.
46. **A browser cannot put a token on an image.** A bare `<img src="…">` sends no `Authorization`
    header and never will, so any picture behind an authenticated route is a 401 — which Chrome then
    reports as `net::ERR_BLOCKED_BY_ORB`, an error name that describes the symptom and hides the
    cause. Use `AuthedImage`, which fetches through axios and renders a blob URL, for anything the API
    serves. The same trap in reverse: an interceptor that attaches the token only to *relative* URLs
    silently skips every absolute one, and the API hands out absolute thumbnail URLs.

**State of the library (context, not a TODO).** The gallery is **empty** — 0 designs, with both
templates still shared, so a new design is one click away and the welcome page shows its own "No designs
yet" empty state. Everything the account had was deleted through the API and backed up first: 24 test
designs in total (`Square` ×7, `Blank White` ×8, `Portrait`, `tet`, `Facebook Profile Photo`,
`e75a61c1`, four `Starter D-Zine Canvas` copies and the mixed-size PDF test design), with a JSON +
thumbnail backup of each batch in `%TEMP%\dzine-designs-backup-20261002-120818` and
`%TEMP%\dzine-designs-backup-20261002-123009` (~230 KB all told). No design carries a **Conflict**
banner. Emptying it is what found the resurrection bug in gotcha 43 — twice.

---

## 5. WHAT'S BEEN BUILT — feature by feature

Every tier below is finished; the open work that used to be interleaved here now lives in
[`ideas_todo.md`](./ideas_todo.md).

### Tier 0 — housekeeping — ✅ DONE
- [x] **Commit the 3 uncommitted files** (Draw panel position + Business badge removal). ✅ in `d5a31b9`
- [x] Push `master`. ✅ was in sync at `079425e`; **now 1 ahead again** (`c71fe64` has the Tier 1 work).
- [x] **Re-verify `DrawToolbar` at runtime.** ✅ Done — see §3.

### Tier 0.5 — 🐛 BUGS FOUND THEN — ✅ BOTH FIXED (`4f57376`)
- [x] **Clicks on the canvas while the Draw panel is open added invisible junk layers.**
      Fixed in `DrawContent`: `onEnd` now ignores a stroke whose `path` is empty or whose box is
      0×0. Verified: 3 canvas clicks add nothing, a real drag still adds exactly one layer.
- [x] **`ShapeContent` rendered a "Business" badge** on the *Arrow* group. Removed; verified gone.

### Tier 1 — ✅ DONE (`c71fe64`)

The keyboard shortcuts (undo/redo, layer clipboard, Escape, arrow-nudge, Ctrl+A, zoom, `[`/`]`
restack) plus the `addLayerTrees` bulk action and the three clipboard helpers (`copyLayerTree`,
`remapLayerTree`, `moveLayerInParent`).

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

*Note:* `Ctrl+0` is the conventional binding — it resets to **100%**, not the app's 0.43 fit default.
Kept deliberately: `Ctrl+=` / `Ctrl+-` step through the zooms and a design still *opens* at the fit
zoom, so nothing is lost by having the reset mean the standard thing.

### `DrawToolbar` — verified end to end

Confirmed working end-to-end via Playwright against the real dev server:

- Pencil drag → `SvgLayer` with `stroke=#0571d3`, `stroke-width=5`, path len 972.
- `data-draw-anchor="true"` appears, toolbar renders with **both** controls.
- **Stroke colour** `input[type=color]` → layer SVG restroked (`#fff234` → `#ff0000`), path unchanged.
- **Stroke width** `input[type=number]` → commits on **Enter** and on **blur** (33 → 12 verified).
- Pen switching works: clicking Highlighter then drawing produced `#fff234`/width 20.

⚠️ **Playwright caveat:** fast synthetic drags (`mouse.move` steps < ~6px / < ~35 ms apart)
produce an **empty path** (`d=""`, 0×0 box) and no toolbar. That is a *test input* artifact, not a
product bug. Slow the drag down (~6px steps, 35 ms waits, 120 ms pause after `down()`) and it works.

### Tier 2 — alignment & snapping — ✅ DONE
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

### Snap to grid — ✅ DONE
The grid used to be a measuring aid only. A **Snap** button in the footer — and Shift+S — now makes
dragging and resizing latch onto it.

- [x] **Opt-in, and independent of the grid being visible.** A grid is often switched on purely as
      something to line up against, so snapping to it by default would have changed how every drag
      behaves; the choice is remembered with the other view preferences.
- [x] `computeSnap` takes an optional grid step and adds the nearest multiple of it as a candidate for
      each of the box's three edges/centre per axis. A grid is an infinite set of lines, so unlike the
      guide targets its candidates have to be derived from where the box actually is.
- [x] When a grid line and a guide are both in reach the **closest wins**, with ties going to the
      guide. Turning the grid on therefore cannot make aligning to a sibling worse than it was, and a
      grid line three pixels nearer cannot steal a drag that is an exact match on something else.
      Verified: aimed 1.221 px short of a sibling's left edge with the nearest grid line 3.9 away, the
      layer landed on the sibling's edge — 525.121, which is not a multiple of 40 — while the other
      axis, with no guide in reach, took the grid line.
- [x] **Resizing snaps too**, on the edges the gesture is actually moving, so the anchored corner
      cannot drift. Verified: a corner drag aimed 0.8 px short of the 1080 grid line produced exactly
      1080, and the axis the drag did not move (dy of 0) snapped its bottom to the grid as well.
- [x] Also verified: whole-drag latching (right edge → 1100 and bottom → 380 on a 20px grid), the
      exact raw delta with Snap off and no guides shown, snapping while the grid is hidden, and the
      snapped line drawn as a guide, so the pull is visible even with no grid on screen.

**Found while verifying this:** inserting the same text preset twice *replaced* the first layer
instead of adding a second — see gotcha 41. That is why these tests kept finding one layer where
there should have been two.

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
- **The pages panel minimises.** A chevron in its header takes it from 168px to 36px, leaving a
  vertical "PAGES" label and the same chevron to bring it back — minimising narrows rather than hides,
  because a panel you cannot reopen is worse than one that is open. The choice persists in
  `necrozine-pages-panel`, the same storage shape as `necrozine-canvas-view`. Verified both ways in the
  browser: the width, the header's `+ Add` and the page cards all go and come back together
  (168 → 36 → 168), and the whole panel is still hidden below 900px. Note that the canvas keeps its
  zoom when the panel closes, so what you gain is room rather than a bigger page — a re-fit on collapse
  would be a separate decision.
- **The rail tabs toggle their panel.** Clicking the tab whose panel is already open closes it —
  `Sidebar`'s `onChange` compares against the current tab instead of always opening — so the ✕ in the
  panel corner is a convenience rather than the only way out. Verified on every panel type, Draw
  included: with Draw open, clicking the Draw icon unmounted the floating stroke toolbar and cleared
  the rail's active highlight, and clicking again brought both back.
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

### Tier 5 — export upgrades — ✅ DONE
- [x] **SVG** export (`toSvg`), alongside PNG/JPG/PDF/JSON.
- [x] **1× / 2× / 3× scale**, chosen in the export menu. 2× was previously hard-coded.
- [x] **Transparent background** for PNG and SVG (omitted for JPG, which has no alpha channel, and
      the menu passes `transparent: false` there rather than pretending).
- [x] **Multi-page output**: "All pages" writes one file per page (`name-1.png`, `name-2.png`) and
      builds a genuine multi-page PDF. The canvas renders **one page at a time** — the page it is
      showing — so this cannot be a DOM walk: `exportDesign` takes each page in turn through a
      `bringPageIntoView` callback (the header's `goToPage`, then a wait for the element to appear)
      and puts the editor back on the page the user was looking at afterwards.
- [x] Every page is sized from **its own root layer**, for images as well as the PDF, so a design
      whose pages differ exports exactly instead of being scaled to whichever page was active. (A
      selection crop is its own output size, so that path is unchanged.)
- [x] Verified in the browser against a two-page design the UI cannot make — 800×400 and 400×800,
      seeded through the API: a **two-page PDF whose MediaBoxes are `600×300` and `300×600` pt**,
      each page's own size, where the old code gave `600×300` twice; two PNGs at 1600×800 and
      800×1600 at 2×; the editor left on page 1 of 2; and a single-page PDF unchanged at `600×300`.
      The earlier note here claiming `t-1.svg` + `t-2.svg` was wrong: the walk could never see a
      second page, and "All pages" was quietly producing a one-page file.
- [x] 1× vs 3× PNG differ by the expected amount; a transparent PNG decodes to `rgba(0,0,0,0)` at
      the corner where an opaque export is `rgba(255,255,255,255)`.
- [x] **Selection only.** A checkbox in the export menu crops the capture to the selected layers:
      `query.selectionBounds()` returns the union of their boxes in page units and
      `exportDesign({ crop })` captures the page content with `translate(-x, -y)` and a canvas the
      size of the crop, so nothing inside the page reflows. It works for PNG, JPG, SVG and PDF (for
      PDF the crop is the page size). A selection belongs to one page, so it overrides "All pages"
      rather than handing back the same crop from every page, and the option switches itself off when
      the selection goes away — a selection-only export that quietly becomes a whole-page export is
      a *wrong file* rather than a refusal.
- [x] The bounds are **rotation-aware**, which is the part that needed care: a layer frame is rotated
      about its **top-left** corner, so a rotated layer reaches outside its own `boxSize` and a crop
      taken from the frames alone slices the corners off. Verified by temporarily rotating the heading
      preset 30°: the menu read the rotated extent as 512×350 where the plain box is 536×95, matching
      the predicted `w·cosθ + h·sinθ` exactly, and the exported PNG followed it. The crop is also
      clipped to the page, because the artboard clips — a layer hanging off the edge exported
      194×95 where its box said 536×95, and the menu now shows that same clipped size, so the label
      and the file agree.
- [x] **Found and fixed while building it: the scale multipliers were squared.** A 1640×924 page
      exported at "2×" produced 6560×3696 (4×) and at "3×" produced 14760×8316 (9×). See gotcha 40.
      Now 1×/2×/3× are 1640×924 / 3280×1848 / 4920×2772, and a 536×95 selection gives 536×95 /
      1072×190 / 1608×285.

**How this was verified** (all three techniques are reusable): stub `HTMLAnchorElement.prototype.click`
from `page.evaluate` to catch every download and its data URL; read PNG dimensions straight out of the
base64 IHDR bytes rather than awaiting an `Image` (which can hang on a bad href); and read the PDF's
`/MediaBox` from the blob, with `URL.revokeObjectURL` stubbed to a no-op so the blob is still there
when you look. Rotating a preset temporarily is the only practical way to test a rotated layer — the
editor has no rotate handle, and canvas clicks do not reliably select here, so a preset that *arrives*
selected is the way in.

One dead end found on the way: `withCleanCapture` hides `[data-resize-handle]`, and nothing in the DOM
carries that attribute — deselecting before the capture is what actually keeps the handles out, and
that CSS rule matches nothing.

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

**Fixed since, by the text-mark work:** the bold/italic gap this left — text layers now render their
document with marks and all (see *Text marks* below).

**Both of the gaps this left are now closed:** the catalogue is woff2 (2.7 MB, below) and the
thumbnail failures are covered under *Design previews*.

- [x] **The catalogue is woff2, not TrueType** — 2.7 MB instead of 11.6 MB. Which format Google's CSS
      endpoint returns is chosen by the user agent that asks, and `seed-fonts.mjs` sent a bare
      `Mozilla/5.0` to get TrueType on the stated grounds that "the editor parses the font to draw
      glyph paths itself". It does no such thing: text renders through CSS, which is why the shell
      font has been woff2 all along. The pin bought nothing and cost about 9 MB of download — the
      whole font catalogue was nearly a third of the repository for a parser that does not exist.
      Verified end to end: all 76 faces are `.woff2` with no non-local URL left in the catalogue;
      `GET /fonts/files/*.woff2` answers `font/woff2` with `wOF2` magic, and the old `.ttf` name is
      a 404; the picker lists all 25 families; `document.fonts` grew 7 → 13 as faces registered and
      `document.fonts.check('24px Oswald')` is true; switching a layer to Oswald changed its measured
      width 187.86 → 167.99; and the six faces that page fetched were all `.woff2`, with no `.ttf`
      request at all. The fetch script now takes the extension from the source URL rather than
      hard-coding one, so a future change of format names and serves itself correctly.


### Tier 7 — differentiators — ✅ ALL DONE
- [x] **Magic resize** — change the canvas size and re-lay-out the design for it.
- [x] **Brand kit** — the colours and fonts a tenant uses, saved once and shared by the team.
- [x] "Save as template" exists (Phase 3): `POST /templates` with a `sourceDesignId`, and a client's
      templates are private to its tenant. An admin can publish a shared one.
- [x] **Share links** — a read-only URL to one design, for somebody with no account.

### Magic resize — ✅ DONE
- [x] `resizePages(pages, size)` is a pure function in the vendor, exported so it can be exercised
      directly; `actions.resizeDesign(size)` commits the result as **one undoable edit**. Every page is
      resized, not just the visible one: a design whose pages disagree about their size is one nobody
      can export, and the export paths already assume one size throughout.
- [x] The worked example: a layer that already covered the page is a **background** and is stretched to
      the new size, so the frame is filled; everything else keeps its proportions. Type scales with its
      box or it would overflow a box that shrank under it. A layer that bled off the edge keeps
      bleeding — only layers that were fully inside are pulled back inside.
- [x] A **Resize…** entry in the Files menu showing the current size, opening a dialog with the whole
      preset catalogue (grouped and searchable, same data as the new-design picker), custom width and
      height, and a plain-English statement of what will happen — magic resize is a guess about intent,
      and a user who cannot see the rules cannot tell a good result from a broken one.
- [x] The picker's `PresetPreview` and `PresetCard` moved to `components/canvas-size/presetCards.tsx`
      and are imported by both dialogs. The two differ in what they do with the choice and in their
      surrounding chrome, but a preset has to look the same in both, and a second copy would drift.
- [x] Verified: identity is exact (resizing to the current size leaves every coordinate untouched); a
      1640×924 banner to 1080×1920 gives a 1080×1920 frame with the content scaled by 0.659 and its
      composition intact; 1080×1080 and half-size behave; the persisted geometry matches the pure
      function's predictions exactly (heading 520,260 600×145 42px → 342,696 395×95 27.7px); undo
      restores the old size and redo reapplies it.

**The algorithm changed after looking at the result, and the reason is the interesting part.** The
first version mapped each layer's position onto the new page proportions *per axis* and scaled sizes
uniformly. It passed every test I had — positions mapped, sizes proportional, nothing outside the
frame — and it produced scattered dust: a landscape banner resized to portrait had its heading, caption
and rule smeared across the full height of a 1920px page. Faithful to the rules, and obviously wrong to
look at. The fix is to place everything **relative to the content's bounding box** and scale positions
and sizes by the *same* factor, so the composition keeps its proportions and only its place in the frame
changes. A centred design stays centred; a deliberately off-centre one keeps its bias.

**The trade-off, deliberately chosen:** for a large aspect change the content keeps its proportions and
*gains margin* rather than being reflowed. A true reflow engine — re-stacking a row of three into a
column, growing type to fill — is a much bigger piece of work and a different feature. What this does
is never distort anything, never scatter, fill the frame with a background when there is one, and be
undoable. Worth revisiting if a client complains that their portrait version looks small.


### Brand kit — ✅ DONE
- [x] `brand_kits` table, one row per tenant, replaced wholesale on save. Per tenant rather than per
      member because a brand belongs to the organisation — sharing it is the whole point of saving it.
      The colours and fonts are JSON arrays rather than child tables: they are read and written as a
      complete list, never queried by element, and a swatch has no identity worth a row.
- [x] `GET /brand` for any member, `PUT /brand` admin-only — the same rule as publishing a template,
      since every design that applies the kit inherits whatever it says. Both are audited.
- [x] Validation refuses rather than silently cleaning. A colour must be six-digit hex (normalised to
      lowercase, de-duplicated) and a font must be a family **from the catalogue**, because a family
      that is not in it renders in the fallback for ever with nothing to say why. Caps: 24 colours, 12
      fonts. Verified: 7 rejections (bad hex, unknown family, non-array, null, 30 colours, 13 fonts,
      empty-is-valid).
- [x] A **Brand** tab in the sidebar: swatches and brand fonts, one click each. The font list renders
      each family *in its own face*, so the list doubles as proof the font is available rather than
      merely remembered.
- [x] Applying targets the selection: a text layer takes a colour or a font, a shape or line takes the
      fill, a QR code takes its dark colour. With no suitable selection a colour is copied instead and
      the panel says which it did — the hint above the swatches changes with the selection, so the
      behaviour is never a surprise. Table cells are deliberately excluded: their colours are per cell,
      and "apply to the whole table" is not what clicking a swatch means.
- [x] `updateTextAttrs` is now an editor action. The text document has a shape and its attributes live
      inside it, so the brand panel applies a family through the same code the text toolbar uses rather
      than rebuilding the document a second time.
- [x] Verified end to end: applied colour `rgb(0,0,0)` → `rgb(255,136,0)` and family Roboto → Oswald on
      a selected layer, both reaching the saved design JSON, and undo stepping back through them
      (Oswald → Roboto → black → the layer itself). The applies are ordinary commits, so they are
      undoable and saved like any other edit.
- Also fixed here: the clipboard fallback used `window.prompt`, which **blocks the whole editor**
      mid-click. Both places that did it (this panel and the share dialog) now report the value instead.
      Where the clipboard is unavailable — an insecure origin, or a browser that refuses permission —
      the panel says "Could not copy — the value is #ff8800", which is the honest outcome.

**Note on `window.alert`/`window.confirm`:** the editor header, the pages panel and the welcome page
still use them for delete confirmations and error notices. That is pre-existing and deliberate, not a
fallback that can fire unexpectedly, but it is the same blocking behaviour worth replacing with proper
dialogs if the UI is ever tidied.


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


### Text marks — ✅ DONE
Text layers rendered `extractText(doc)`: one flat string. Every `bold`/`italic` mark in the saved data
was already there and already ignored, which is why the presets in `text-effects.ts` that differ only
by weight looked identical, and why table cells (which did honour marks) were the odd one out.

- [x] `TextDocView` renders the document instead of flattening it — a `<div>` per block, so a
      multi-line layer keeps its own alignment, colour and size per line, and a `<span>` per inline
      node, applying `bold` → 700, `italic` → `font-style`, `underline` → `text-decoration` and a
      `color` mark → `color`. Anything a mark does not set falls back to the layer's own attrs.
- [x] `actions.setTextMarks(layerId, { bold?, italic? })` rewrites only the marks it was asked about,
      so toggling italic off cannot strip bold. Verified: bold off → 400, bold on → 700, then italic
      on → 700 *and* italic.
- [x] Bold/Italic buttons in `TextToolbar`, immediately before the family select. `aria-pressed` is
      true only when **every** inline node carries the mark, so a half-marked layer reads as not-all-set
      rather than showing whichever node happened to be first.
- [x] Their titles say "applies to the whole text box" because the text input is a plain textarea:
      there is no range to apply a mark to, and a button that looks range-aware without being it is
      worse than one that is plain about its scope.
- [x] Verified in the browser against a **saved** design: the heading preset arrives at weight 700 with
      Bold pressed, toggling writes `{"type":"bold"}`/`{"type":"italic"}` into the stored design
      (read back from `/api/designs/:id`), and a newly inserted "Add a heading" renders at 700.

Verifying this turned up gotcha 39. Fixing it collapsed five copies of the same anchor loop into one
`useAnchor` hook, which is why `CellToolbar`, `TextToolbar`, `QrToolbar`, `DrawToolbar` and
`AlignToolbar` are each about twenty-five lines shorter.


### Layout guides — ✅ DONE
The rulers could only measure. Now pulling on one creates a persistent guide: drag from the top ruler
for a horizontal line, from the left ruler for a vertical one, drag a line to move it, and drop it past
the page edge — which is how you reach a ruler — to remove it.

- [x] **A guide is part of the design, not the session.** It lives on the page (`page.guides`), so it
      travels into copies, templates and the saved file: LidoJS ignores the extra key and
      `clonePages`'s JSON round-trip preserves it. Verified end to end — an exported JSON has
      `pageKeys: ["layers","guides"]`, and after a reload the reopened design still shows both guides
      at 520 and 280.
- [x] Guides are **identified by their index** in that short list rather than by an id: only this code
      writes them, and two on one axis at the same position are the same guide as far as anyone can
      tell.
- [x] **Dragging** patches the page live, and each gesture is **one undo step** — `beginInteraction`
      snapshots before the first patch and `endInteraction` closes it on pointerup, so the header's
      undo put a deleted guide back at exactly 520.
- [x] The position **snaps to the grid** when snapping is on, with the same reach a layer drag uses.
      Verified on both axes: a pull aimed at 288 landed on 280, a move aimed at 512 landed on 520.
- [x] **Excluded from every capture.** A guide is a measuring aid, not artwork, so `withCleanCapture`
      hides `[data-layout-guide]` for the duration — verified by exporting a blank page carrying two
      guides and counting pixels: none that were not white. (The grid is invisible in the dark theme
      at 13% white alpha, which is what makes that test decisive.)
- [x] Its own colour (`--app-layout-guide`, violet, both themes) so a persistent guide is never
      mistaken for the transient blue snap line, and a 7px grab area around a 1px line, because a 1px
      target is not draggable.
- Magic resize scales a guide by its own axis, so one marking the middle stays on the middle.

**Two things to know.** That 7px grab area does sit in front of whatever is under it, so a guide
crossing a small layer makes that part of the layer harder to click; narrowing the target, or letting
clicks through until the guide is hovered, is the fix if it ever annoys anyone — **accepted as-is** for
now, because a thinner target trades a rare annoyance for a common one. And the drag is gated
on `readOnly` so a viewer gets no drag cursor — the write is protected regardless, because every guide
patch goes through the same `setPages` a read-only editor replaces with a no-op, but that particular
cursor was not exercised in a viewer.

### Design previews — how they are made, and how one goes missing
A thumbnail is captured **in the browser** on every save and uploaded with the design
(`captureThumbnail` → `setDesignThumbnail`), deliberately not awaited: a failed capture must never
surface as a failed save. A design started from a template instead inherits the template's own preview
file, which is an SVG, so the thumbs directory holds both JPEG captures and SVG placeholders.

- [x] **A thumbnail URL is only advertised when there is a file behind it.** `thumbUrlFor` checks the
      disk first, for designs and templates alike. Without that check, a row naming a thumbnail whose
      file had gone handed the browser a 404 whose body is JSON, and for an `<img>` Chrome reports
      that as `net::ERR_BLOCKED_BY_ORB` — a name that says nothing about the cause and hides the real
      one. Verified by hiding one valid file: 19/21 → 18/21 thumb URLs, that design's `thumbUrl`
      became null, and the route itself answered 404 (which is what an `<img>` used to be handed).
- [x] **The ORB explanation this was recorded under was wrong, and worth not restoring.** Every
      advertised thumbnail loads, cross-origin SVG included: 19/19, with `naturalWidth` 320 for the SVG
      template previews and 420 for the JPEG captures. The "two designs show no preview" symptom was
      real but had a different cause, below.
- [x] **A preview that fails to load now reveals the placeholder instead of leaving an empty box.**
      The card draws its "CANVAS" tile underneath and hides a preview whose image errors. Verified by
      pointing one at a 404 for real: the image went `display: none` and the placeholder underneath
      stayed visible at 211px, while the untouched cards still painted their previews over it.

**A save made while the tab is hidden used to leave no preview — fixed.** `captureThumbnail` goes
through `html-to-image`, which resolves every capture from inside a `requestAnimationFrame` callback,
and a background tab runs no frames: the capture never settled, so the design saved without a preview
and the save itself never mentioned it. That is how two designs in the library came to have none, both
created in background tabs while this work was being verified. Captures now run inside
`withVisibleFrames`, which drives frames from a timer for their duration, so a background save gets its
preview like any other (verified: `captureThumbnail` resolves in a hidden tab, and a foreground save
still produces an `image/jpeg` of 4964 bytes).

### Admin screen — templates and companies — ✅ DONE
Everything it needs already existed server-side (`GET /admin/templates`, `POST /templates`,
`POST /admin/template-grants`, `GET|POST /admin/tenants`); there was just no interface, so publishing a
template meant hand-writing JSON into a directory. `?admin` — or the **Admin** button, which only
exists for administrators — opens a screen that talks to those endpoints.

- [x] **Publish a template** either from one of your designs (its preview is copied across, verified:
      `thumb: true` afterwards) or by pasting/uploading a design export. The id is slugged from the
      name, and `overwrite` replaces an existing one.
- [x] **Assign it to one company or all of them**, with the semantics stated in the UI rather than
      hidden, because they are not the obvious ones: a *global* template is visible to **everyone until
      it has a grant**, and each grant **narrows** it. So the three choices are "Everyone" (no grants),
      "Only some companies" (one shared template, limited to the companies ticked) and "One company,
      its own copy" (a `tenant`-scoped template nobody else can see).
- [x] **Manage companies** — list plus create, in the same screen, because you cannot assign to a
      company that does not exist yet.
- [x] Verified against the running API, not just the UI: publishing from a design gave
      `scope: global`, `grants: []`, `thumb: true`; a two-page export published **page 1 only**
      (stored `boxSize` 600×600, not the second page's 900×300); granting to a company set the badge to
      "Only 1 company" and `grants: ['default']`, and the **Everyone** button returned it to `[]`; a
      private copy landed as `scope: tenant, tenantId: test-studio` and was **absent from the owning
      tenant's own `/templates`** — which is the whole point of a copy. All four published templates
      appeared in `GET /templates` for the client, and each test template and company was removed
      afterwards.
- [x] **Found and fixed a preview bug the screen exposed.** The admin list advertised
      `/templates/:id/thumb`, which is scoped to the *caller's* workspace, so an administrator looking
      at a company's private template got a 404 (`ERR_BLOCKED_BY_ORB` in the browser) — the same
      "advertises a URL with no file behind it" shape as gotcha 39's neighbour. There is now an
      `GET /admin/templates/:id/thumb`, and the list points at it. `paste-test` correctly advertises
      **no** thumbnail at all, and the card shows its placeholder.
- [x] **Found and fixed a delete gap.** `DELETE /templates/:id` required *ownership* of a
      `tenant`-scoped template even for an administrator, so the UI's Delete button answered 404 for a
      client's private template. The rule is now "an admin can delete anything; a client can delete the
      tenant templates it owns" — written out rather than inferred from the old one-liner.

**Worth knowing:** grants come back as objects (`{ tenantId, tenantName, grantedAt }`), not ids, which
is what `POST /admin/template-grants` returns as well. The first version of the client typed them as
strings and React refused to render them.

### Sign-in with Keycloak — ✅ DONE, verified against a live realm
Everything is Keycloak's: the app redirects to it, and the API verifies the token it hands back.
There is no login form in this app and no password ever reaches it — only the client id and the
scopes come from us.

- [x] **Authorization Code + PKCE, public client.** `src/utils/oidc.ts` builds the authorize URL
      (`state` + `code_challenge` + `S256`), exchanges the code against the provider's token
      endpoint, and stores the tokens in `sessionStorage` — per tab, gone when it closes. A bare axios
      instance is used for the provider so our access token is never sent *to* it.
- [x] **The API stays the authority.** Token verification was already there (`api/identity.js`, JWKS
      via `node:crypto`); the app is only ever a courier. Verified live: a token from Keycloak is
      accepted, and `/api/me` answers with the member and their workspace.
- [x] **The app learns how to sign in from the API**, not from a build-time variable:
      `GET /auth/config` is public and returns the mode, issuer, client id, scopes and whether signup
      is open. `AUTH_MODE=dev` therefore shows no sign-in at all, so local development is unchanged.
- [x] **Open signup, with invites still winning.** `AUTH_ALLOW_SIGNUP=true` gives a verified stranger
      a workspace of their own, named from their address, with themselves as admin; `false` restores
      invite-only. The invite check runs first, so an invited person still lands where they were
      invited. Verified live end to end: registering on Keycloak's own page returned to the app signed
      in, and the API had **created `tester-example-com`** for that account. That account then created
      a design, which saved through the authenticated API into its own tenant, and its gallery showed
      the other tenant's leftovers **dropped** rather than re-uploaded — the fix from earlier doing its
      job in a new place.
- [x] **The sign-in screen** (`src/shared/components/SignInScreen.tsx`): Sign in, and Create an
      account when the deployment allows it, plus the provider's hostname and the reassurance that
      the password is not ours. Errors from the provider are shown rather than swallowed.

**Two real bugs this work found, both fixed:**

1. **The JWKS URL was guessed wrong.** `identity.js` derived `{issuer}/.well-known/jwks.json`, which
   is the legacy path and a **404 on Keycloak 26** — every token was rejected with
   `JWKS request failed with 404`, which is at least an honest error. Keys are now taken from the
   provider's discovery document (`jwks_uri`), with `OIDC_JWKS_URL` still there to override, and the
   legacy guess kept only as a last resort. This is the bug the plan predicted: *"nobody has pointed
   it at a real IdP yet."*
2. **`<img src>` cannot send an Authorization header.** Every thumbnail behind an authenticated route
   answered 401, which Chrome reports as `ERR_BLOCKED_BY_ORB` — a missing picture with an error name
   that says nothing about the cause, and invisible until auth was switched on. `AuthedImage` fetches
   the bytes through the app's axios (which attaches the token) and renders a blob URL. The request
   interceptor also had to stop assuming "relative means ours": the API hands out **absolute** URLs
   for thumbnails, so those went out bare. Both fixed and verified: template previews now fetch
   `200` and render from blob URLs.

**Running it locally:** `docker run -d --name dzine-keycloak -p 8080:8080 -e
KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin
quay.io/keycloak/keycloak:26.0 start-dev`, then realm `dzine` (registration on, `sslRequired: none`)
and a public client `dzine-canvas` with redirect URIs `http://localhost:4200/*`. Point the API at it
with `AUTH_MODE=oidc OIDC_ISSUER=http://127.0.0.1:8080/realms/dzine OIDC_CLIENT_ID=dzine-canvas`, and
leave `OIDC_AUDIENCE` empty unless the realm has an audience mapper. Note **port 8080, not 8090**:
something else on this host answers 501 on 8090, which cost real time. The test account is
`tester` / `tester@example.com` in that realm.

### Cleanups completed
- [x] `actions.addPage()` now matches the design: it takes the size from the page you are on instead
      of appending a fixed 1640×924. Verified in the browser — adding a page to a 1080×1350 design
      produced another 1080×1350, where it used to hand you a landscape page and quietly make the
      design mixed-size.
- [x] The axios interceptor is honest now (Phase 1): it only rewrites our own relative-API failures,
      requires an error `code`, always re-throws, and raises a blocking notice for 401/403.
- [x] `EditorHeader`'s theme toggle is hidden below 900px again, as the old rule did before it was
      lost; the same toggle is on the welcome page, and the editor header needs the room.
- [x] **The zero-sized draw layers are gone with the test designs** — verified by reading every stored
      design back and looking for a layer whose `boxSize` is 0×0: none left, so the load-time sweep the
      item contemplated is not needed. (It was going to be a defensive delete of "something
      meaningless", which is the kind of fix that eventually eats a real layer.)
- [x] **`Ctrl+0` kept at 100%** rather than the fit zoom — the standard binding, noted where the zoom
      shortcuts are documented in Tier 1.
- [x] **Repo history left at ~192 MB** as a deliberate non-goal, now recorded in §3 so it does not read
      as an oversight.

The remaining open items — the `NecroZine_Next` workspace root (an editor setting, so it needs doing by
hand) and `DrawContent`'s hard-coded geometry — are in `ideas_todo.md`.
