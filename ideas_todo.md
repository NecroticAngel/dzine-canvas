# D-Zine Canvas — TODO

> **Open work only.** What the app is, how to run it, everything that has been built, and every
> gotcha learned building it live in [`App_Overview.md`](./App_Overview.md) — read that first, and read
> its §4 before writing any browser test. Anything finished, accepted or deliberately deferred is
> recorded there as well (§3 and the end of §5), which is what keeps this file short.

---

## Open

- [ ] **Remove the `NecroZine_Next` root from the VS Code workspace.** It lives in the editor's
      workspace file, not in this repo, and it has already caused one wrong-project edit. **This one
      has to be done by hand** — *File → Add Folder to Workspace*, or the `.code-workspace` file.
- [ ] **Theme `DrawContent`'s hard-coded geometry** (`left: 72`, `top: 44`, `120×250`). Cosmetic: it
      floats over the selection, so it does not follow light/dark restyling. Those coordinates are the
      ones §3 lists as working and verified, which is where they came from.

Nothing else is open. The feature backlog is empty, and the smaller debts, the accepted trade-offs
and the deliberate non-goals all have their record in `App_Overview.md`.

## Ideas, not scheduled

- **Typography presets on the new foundation.** `text-effects.ts`'s heading/subheading/body presets now
  differ by weight as well as size, so they finally render differently from each other. A few
  serif/display pairings would give the panel somewhere to grow.
- **A real reflow for magic resize.** Today's resize keeps content proportions and gains margin when
  the aspect ratio changes a lot. Re-stacking a row of three into a column, or growing type to fill,
  is a different and much bigger feature — revisit if a client says their portrait version looks small.

---

## PASTE THIS WHEN YOU REOPEN

```
Working in c:\Users\jo\dev\NecroZine\canva-clone ONLY (ignore NecroZine_Next/OpenDesign, it's parked).

Two handover files in that folder:
- App_Overview.md — what the app is, how to run it, the architecture, a feature-by-feature record of
  everything that has been built, and §4's gotchas. Read it first.
- ideas_todo.md — the open work (this file).

State: the feature backlog is empty, every tier in §5 is done, the multi-tenant build is complete
through Phase 4, fonts work end to end out of our own API, text marks render, and the design library is
empty (0 designs) with both templates still shared. Dev mode still needs no configuration.

Next, in order:
1. Nothing is queued. Two small items are open: the NecroZine_Next workspace root (an editor setting,
   so it needs doing by hand) and DrawContent's hard-coded geometry. Neither shows up as a symptom in
   normal use.

Verify in the real browser, not just tsc, and read the §4 gotchas before writing browser tests — two of
them (39: requestAnimationFrame never fires in a hidden tab; 33: the 900px responsive breakpoint) will
otherwise cost you an hour. Two more: 44 (reload the page after an edit, or HMR leaves two copies of the
vendored editor and every `useEditor` throws) and 42 (in a hidden tab `pointerdown`/`pointerup` never
arrive, so drive drags by dispatching the events yourself).
```
