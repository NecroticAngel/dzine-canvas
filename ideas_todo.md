# D-Zine Canvas — TODO

> **Open work only.** What the app is, how to run it, everything that has been built, and every
> gotcha learned building it live in [`App_Overview.md`](./App_Overview.md) — read that first, and read
> its §4 before writing any browser test.
>
> The feature backlog is empty. Nothing here is on fire: this is the honest list of what is missing,
> what is rough, and what was deliberately deferred.

---

## Nothing queued

The feature backlog is empty: grid snapping and layout guides were the last two items, and both are
done (see `App_Overview.md`). What is left is the list below. None of it shows up as a symptom in
normal use.

## Smaller debts

- [ ] **Theme `DrawContent`'s hard-coded geometry** (`left: 72`, `top: 44`, `120×250`). Cosmetic: it
      anchors over the selection, so it does not follow light/dark restyling.
- [ ] **Two junk 0×0 draw layers** are saved into a design and still there. Invisible and zero-sized;
      a load-time sweep is not worth the risk of removing something meaningful unless it matters.
- [ ] **A layout guide's grab area is 7px wide and sits in front of what is under it.** A guide
      crossing a small layer makes that part of the layer harder to click. **Accepted for now:**
      narrowing it buys very little, and the alternative — putting the line behind the content — means
      a guide that crosses a busy area can no longer be picked up to move or delete it. Recorded in
      §4 of the overview rather than left as work.
- [x] **`Ctrl+0` resets to 100%**, not the app's 0.43 fit default. **Keeping it:** that is the binding
      everywhere else (`Ctrl+=` / `Ctrl+-` step, `Ctrl+0` is 100%), and a design still *opens* at the
      fit zoom, so nothing is lost.

## Known issues

- [ ] **Repo history is ~192 MB packed**, about 175 MB of it one 58 MB `output-from-templates.pdf`
      committed three separate times. It is untracked and ignored now, so it will not grow. Removing it
      needs a history rewrite (force-push, invalidates existing clones) — a deliberate non-goal so far.

## Housekeeping

- [x] **Test designs cleared** — 24 → 4, the twenty deleted through the API: `Square` ×7, `Blank White`
      ×8, `Portrait`, `tet`, `Facebook Profile Photo`, `e75a61c1` (1080×1920) and the mixed-size PDF
      test design. A JSON + thumbnail backup is in `%TEMP%\dzine-designs-backup-20261002-120818`
      (~115 KB) if one turns out to have been wanted. The four left are all `Starter D-Zine Canvas`
      copies from 30 Sep — the cleanup list named only `e75a61c1`, so they were kept; delete them too
      if they are as disposable as the rest. Doing this found and fixed a real bug: the browser's cache
      **re-uploaded** everything the server no longer had, so deletions never stuck (overview gotcha
      43).
- [x] **Clear the Conflict banner** — nothing carries one any more: the welcome page shows no banner
      and every design reports `conflict: false`. That decision was already taken.
- [ ] **Remove the `NecroZine_Next` root from the VS Code workspace.** That lives in the editor's
      workspace file, not in this repo, and it has already caused one wrong-project edit. **This one is
      an editor-settings change, so it has to be done by hand** — remove the folder from
      *File → Add Folder to Workspace* / the `.code-workspace` file.

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

State: the feature backlog is empty. Editor tiers 1-7 are done, the multi-tenant build is complete
through Phase 4 (identity, per-tenant designs, template sharing, hardening, conflict handling), fonts
work end to end out of our own API, and text marks render. Dev mode still needs no configuration.

Next, in order:
1. Nothing is queued — the feature backlog is empty. Take whichever of the smaller debts and known
   issues looks most valuable; none of them shows up as a symptom in normal use.

Verify in the real browser, not just tsc, and read the §4 gotchas before writing browser tests — two of
them (39: requestAnimationFrame never fires in a hidden tab; 33: the 900px responsive breakpoint) will
otherwise cost you an hour. Two more: 44 (reload the page after an edit, or HMR leaves two copies of the
vendored editor and every `useEditor` throws) and 42 (in a hidden tab `pointerdown`/`pointerup` never
arrive, so drive drags by dispatching the events yourself).
```
