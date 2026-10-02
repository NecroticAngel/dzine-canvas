import type { SerializedPage } from '@lidojs/design-core';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

const LEGACY_KEY = 'necrozine-lidojs-design';
const LIBRARY_KEY = 'necrozine-lidojs-library';

export type DesignSummary = {
  id: string;
  name: string;
  updatedAt: number;
  /** Small data-URL preview captured on save; absent for older designs. */
  thumbnail?: string;
  /** Server-hosted preview, used when there is no local data-URL preview. */
  thumbUrl?: string;
  /** Server version this copy is based on. Sent with a save so the server can
   * tell that we are about to overwrite somebody else's newer work. */
  version?: number;
  /** Set when a save was refused because the server has a newer version. */
  conflict?: boolean;
};

export type SavedDesign = DesignSummary & {
  pages: SerializedPage[];
  /** True once the design is known to exist on the server. */
  remote?: boolean;
  /** Marks the throwaway design made when a browser has nothing yet. */
  placeholder?: boolean;
};

type LibraryStore = {
  version: 1;
  activeId: string;
  designs: SavedDesign[];
};

const clonePages = (pages: SerializedPage[]) =>
  JSON.parse(JSON.stringify(pages)) as SerializedPage[];

export type PageSize = {
  width: number;
  height: number;
};

/** Fallback canvas size, used when a design is created without picking one. */
export const DEFAULT_PAGE_SIZE: PageSize = { width: 1640, height: 924 };

export const createBlankPages = (
  size: PageSize = DEFAULT_PAGE_SIZE,
): SerializedPage[] => [
  {
    layers: {
      ROOT: {
        type: { resolvedName: 'RootLayer' },
        props: {
          boxSize: { width: size.width, height: size.height },
          position: { x: 0, y: 0 },
          rotate: 0,
          color: 'rgb(255, 255, 255)',
          image: null,
        },
        locked: false,
        child: [],
        parent: null,
      },
    },
  },
];

const isPages = (value: unknown): value is SerializedPage[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  typeof value[0] === 'object' &&
  value[0] !== null &&
  'layers' in (value[0] as object);

const readStore = (): LibraryStore | null => {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibraryStore;
    if (
      parsed?.version === 1 &&
      typeof parsed.activeId === 'string' &&
      Array.isArray(parsed.designs) &&
      parsed.designs.length > 0
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
};

const writeStore = (store: LibraryStore) => {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(store));
  const active = store.designs.find((d) => d.id === store.activeId);
  if (active) {
    // Keep legacy key in sync so older code paths still see the active design.
    localStorage.setItem(LEGACY_KEY, JSON.stringify(active.pages));
  }
};

const makeDesign = (
  pages: SerializedPage[],
  name: string,
  id = uuid(),
): SavedDesign => ({
  id,
  name,
  updatedAt: Date.now(),
  pages: clonePages(pages),
});

const migrateLegacy = (fallbackPages: SerializedPage[]): LibraryStore => {
  let pages = clonePages(fallbackPages);
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isPages(parsed)) pages = clonePages(parsed);
    }
  } catch {
    // ignore
  }
  const design = makeDesign(pages, 'My Design 1');
  // Nothing has been uploaded, so an account that already has real designs can
  // discard this instead of adopting it.
  design.placeholder = true;
  const store: LibraryStore = {
    version: 1,
    activeId: design.id,
    designs: [design],
  };
  writeStore(store);
  return store;
};

export const ensureLibrary = (fallbackPages: SerializedPage[]): LibraryStore => {
  const existing = readStore();
  if (existing) {
    const active =
      existing.designs.find((d) => d.id === existing.activeId) ??
      existing.designs[0];
    if (active.id !== existing.activeId) {
      existing.activeId = active.id;
      writeStore(existing);
    }
    return existing;
  }
  return migrateLegacy(fallbackPages);
};

export const listDesignSummaries = (): DesignSummary[] => {
  const store = readStore();
  if (!store) return [];
  return store.designs
    // `thumbUrl` has to survive this mapping: the grid falls back to it for
    // designs this browser never captured a preview for, which is every design
    // created somewhere else — or from a template.
    .map(({ id, name, updatedAt, thumbnail, thumbUrl, version, conflict }) => ({
      id,
      name,
      updatedAt,
      thumbnail,
      thumbUrl,
      version,
      conflict,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getActiveDesign = (): SavedDesign | null => {
  const store = readStore();
  if (!store) return null;
  return store.designs.find((d) => d.id === store.activeId) ?? store.designs[0] ?? null;
};

export const saveActiveDesignPages = (pages: SerializedPage[]) => {
  const store = readStore();
  if (!store) return null;
  const index = store.designs.findIndex((d) => d.id === store.activeId);
  if (index < 0) return null;
  store.designs[index] = {
    ...store.designs[index],
    pages: clonePages(pages),
    updatedAt: Date.now(),
  };
  writeStore(store);
  markDirty(store.designs[index].id, 'upsert');
  return store.designs[index];
};

/**
 * Attach a gallery preview to a saved design.
 *
 * Kept separate from `saveActiveDesignPages` because capturing the preview is
 * asynchronous — saving the document must never wait on it, nor fail with it.
 */
export const setDesignThumbnail = (
  id: string,
  thumbnail: string,
): DesignSummary | null => {
  const store = readStore();
  if (!store) return null;
  const design = store.designs.find((d) => d.id === id);
  if (!design) return null;
  design.thumbnail = thumbnail;
  writeStore(store);
  markDirty(id, 'upsert');
  return {
    id: design.id,
    name: design.name,
    updatedAt: design.updatedAt,
    thumbnail,
  };
};

export const createDesignInLibrary = (
  pages: SerializedPage[],
  name?: string,
): SavedDesign => {
  const store = readStore();
  if (!store) {
    const design = makeDesign(pages, name?.trim() || 'Untitled');
    const next: LibraryStore = {
      version: 1,
      activeId: design.id,
      designs: [design],
    };
    writeStore(next);
    markDirty(design.id, 'upsert');
    return design;
  }
  const design = makeDesign(
    pages,
    name?.trim() || `Untitled ${store.designs.length + 1}`,
  );
  store.designs.push(design);
  store.activeId = design.id;
  writeStore(store);
  markDirty(design.id, 'upsert');
  return design;
};

export const openDesignInLibrary = (id: string): SavedDesign | null => {
  const store = readStore();
  if (!store) return null;
  const design = store.designs.find((d) => d.id === id);
  if (!design) return null;
  store.activeId = id;
  writeStore(store);
  return design;
};

/**
 * Pull one design the server has and this browser doesn't.
 *
 * `hydrateLibrary()` runs once per page load, so a design created moments ago
 * server-side — the copy made by "use this template" — would otherwise be
 * invisible until the next reload.
 */
export const adoptRemoteDesign = async (
  id: string,
  known?: { name?: string; thumbUrl?: string },
): Promise<SavedDesign | null> => {
  const existing = readStore()?.designs.find((design) => design.id === id);
  if (existing) return openDesignInLibrary(id);

  try {
    const detail = await axios.get<{ name?: string; pages?: unknown }>(
      `/designs/${encodeURIComponent(id)}`,
      { timeout: 15000 },
    );
    if (!isPages(detail.data?.pages)) return null;
    const summary = listDesignSummaries().find((item) => item.id === id);
    const design = makeDesign(
      detail.data.pages,
      known?.name || detail.data.name || summary?.name || 'Untitled',
      id,
    );
    design.thumbUrl = known?.thumbUrl ?? summary?.thumbUrl;
    design.remote = true;

    const store = readStore();
    if (!store) {
      writeStore({ version: 1, activeId: id, designs: [design] });
      return design;
    }
    store.designs.push(design);
    store.activeId = id;
    writeStore(store);
    return design;
  } catch {
    return null;
  }
};

export const renameDesignInLibrary = (
  id: string,
  name: string,
): DesignSummary | null => {
  const store = readStore();
  if (!store) return null;
  const design = store.designs.find((d) => d.id === id);
  if (!design) return null;
  design.name = name.trim() || design.name;
  design.updatedAt = Date.now();
  writeStore(store);
  markDirty(design.id, 'upsert');
  return { id: design.id, name: design.name, updatedAt: design.updatedAt };
};

export const duplicateDesignInLibrary = (id: string): SavedDesign | null => {
  const store = readStore();
  if (!store) return null;
  const source = store.designs.find((d) => d.id === id);
  if (!source) return null;
  const copy = makeDesign(source.pages, `${source.name} copy`);
  store.designs.push(copy);
  store.activeId = copy.id;
  writeStore(store);
  markDirty(copy.id, 'upsert');
  return copy;
};

export const deleteDesignInLibrary = (
  id: string,
): { removed: boolean; active: SavedDesign | null } => {
  const store = readStore();
  if (!store) {
    return { removed: false, active: null };
  }
  const nextDesigns = store.designs.filter((d) => d.id !== id);
  if (nextDesigns.length === store.designs.length) {
    return { removed: false, active: getActiveDesign() };
  }
  markDirty(id, 'delete');
  if (nextDesigns.length === 0) {
    localStorage.removeItem(LIBRARY_KEY);
    localStorage.removeItem(LEGACY_KEY);
    return { removed: true, active: null };
  }
  const activeId =
    store.activeId === id ? nextDesigns[0].id : store.activeId;
  const next: LibraryStore = {
    version: 1,
    activeId,
    designs: nextDesigns,
  };
  writeStore(next);
  return {
    removed: true,
    active: next.designs.find((d) => d.id === activeId) ?? next.designs[0],
  };
};

export const safeFileName = (name: string) =>
  name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'dzine-canvas';

/* ---------------------------------------------------------------------------
 * Server sync
 *
 * localStorage stays the synchronous working store — the vendored editor and
 * the welcome page call this module synchronously in dozens of places — and is
 * treated as a cache in front of the API. Reads stay instant; writes are queued
 * and flushed on a short debounce, so a burst of edits, or the save-plus-
 * thumbnail pair, collapses into a single request.
 *
 * `hydrateLibrary()` is the other half: it adopts what the account already has.
 * It has to finish before an editor boots, which is why the welcome page waits
 * for it — otherwise the editor would open the throwaway placeholder design and
 * the first save would have nowhere to go.
 * ------------------------------------------------------------------------- */

export type SyncStatus = 'idle' | 'pending' | 'saving' | 'error' | 'conflict';

const FLUSH_DELAY = 800;
const RETRY_DELAY = 5000;
const QUEUE_KEY = 'necrozine-sync-queue';

let syncStatus: SyncStatus = 'idle';
const statusListeners = new Set<(status: SyncStatus) => void>();

/**
 * The queue is persisted, not just in memory.
 *
 * It used to be a bare Map, which meant a reload inside the 800 ms debounce threw
 * the operation away. A lost save is recoverable — the design is still in
 * localStorage and the next hydrate re-uploads it — but a lost *delete* is not:
 * the design is already gone locally, the server keeps its copy, and the next
 * hydrate puts it back. That reads as "delete is broken".
 */
const readQueue = (): Map<string, 'upsert' | 'delete'> => {
  const queue = new Map<string, 'upsert' | 'delete'>();
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return queue;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return queue;
    for (const entry of parsed) {
      const [id, op] = Array.isArray(entry) ? entry : [];
      if (typeof id === 'string' && (op === 'upsert' || op === 'delete')) {
        queue.set(id, op);
      }
    }
  } catch {
    // A corrupt queue is not worth failing over; the designs are intact.
  }
  return queue;
};

const writeQueue = () => {
  try {
    if (!pending.size) {
      localStorage.removeItem(QUEUE_KEY);
      return;
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...pending.entries()]));
  } catch {
    // Quota or a locked-down browser: fall back to memory-only for this session.
  }
};

const pending = readQueue();
let flushTimer: number | null = null;
let hydratePromise: Promise<void> | null = null;

const setSyncStatus = (next: SyncStatus) => {
  if (syncStatus === next) return;
  syncStatus = next;
  for (const listener of statusListeners) listener(next);
};

export const getSyncStatus = () => syncStatus;

/** Designs waiting on a decision about a conflict, newest first. */
export const listConflicts = (): DesignSummary[] =>
  listDesignSummaries().filter((design) => design.conflict);

/**
 * Keep the local copy. The next save is allowed to overwrite, because the user
 * has been shown that somebody else's version exists and chose this one.
 */
export const resolveConflictKeepMine = (id: string): boolean => {
  const store = readStore();
  const design = store?.designs.find((item) => item.id === id);
  if (!store || !design) return false;
  delete design.conflict;
  // No `version` means no base to compare against, which is what permits the
  // overwrite. The server's response sets the version again afterwards.
  design.version = undefined;
  writeStore(store);
  markDirty(id, 'upsert');
  return true;
};

/** Discard the local copy and take the server's. */
export const resolveConflictUseTheirs = async (id: string): Promise<boolean> => {
  try {
    const detail = await axios.get<{
      name?: string;
      pages?: unknown;
      version?: number;
    }>(`/designs/${encodeURIComponent(id)}`, { timeout: 15000 });
    if (!isPages(detail.data?.pages)) return false;

    const store = readStore();
    const design = store?.designs.find((item) => item.id === id);
    if (!store || !design) return false;

    design.pages = clonePages(detail.data.pages);
    design.name = detail.data.name ?? design.name;
    design.version = detail.data.version;
    design.updatedAt = Date.now();
    delete design.conflict;
    writeStore(store);

    pending.delete(id);
    writeQueue();
    setSyncStatus(pending.size ? 'pending' : 'idle');
    return true;
  } catch {
    return false;
  }
};

/** Subscribe to sync progress so a screen can show saving/retry state. */
export const subscribeToSync = (listener: (status: SyncStatus) => void) => {
  statusListeners.add(listener);
  listener(syncStatus);
  return () => {
    statusListeners.delete(listener);
  };
};

const designById = (id: string): SavedDesign | null =>
  readStore()?.designs.find((design) => design.id === id) ?? null;

const markDesignSynced = (id: string) => {
  const store = readStore();
  const design = store?.designs.find((item) => item.id === id);
  if (!store || !design || design.remote) return;
  design.remote = true;
  writeStore(store);
};

const scheduleFlush = (delay: number) => {
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, delay);
};

/** Queue a change for upload. A delete always beats a queued upload. */
const markDirty = (id: string, op: 'upsert' | 'delete') => {
  if (op === 'upsert' && pending.get(id) === 'delete') return;
  pending.set(id, op);
  writeQueue();
  setSyncStatus('pending');
  scheduleFlush(FLUSH_DELAY);
};

const flushPending = async () => {
  if (!pending.size) {
    setSyncStatus('idle');
    return;
  }
  setSyncStatus('saving');
  let failed = false;

  for (const [id, op] of [...pending.entries()]) {
    try {
      if (op === 'delete') {
        await axios.delete(`/designs/${encodeURIComponent(id)}`);
      } else {
        const design = designById(id);
        if (!design) {
          pending.delete(id);
          continue;
        }
        // A conflicted design waits for the user to decide. Retrying it would
        // just overwrite the other person's work on the next attempt.
        if (design.conflict) {
          continue;
        }
        // PUT is an upsert server-side, so this covers create and update.
        const response = await axios.put<{ version?: number }>(
          `/designs/${encodeURIComponent(id)}`,
          {
            name: design.name,
            pages: design.pages,
            thumbnail: design.thumbnail,
            baseVersion: design.version,
          },
        );
        if (Number.isFinite(response.data?.version)) {
          design.version = response.data.version;
        }
        markDesignSynced(id);
      }
      pending.delete(id);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      // Deleting something the server never had is a success for our purposes.
      if (op === 'delete' && status === 404) {
        pending.delete(id);
        continue;
      }
      if (op === 'upsert' && status === 409) {
        // Somebody else saved first. Park it and let the user choose; the local
        // copy is kept so no work is lost either way.
        //
        // The store has to be read ONCE here: `readStore` parses a fresh copy
        // each call, so mutating a design from one call and writing the result
        // of another silently discarded the flag.
        const store = readStore();
        const design = store?.designs.find((item) => item.id === id);
        if (store && design) {
          design.conflict = true;
          writeStore(store);
        }
        pending.delete(id);
        continue;
      }
      failed = true;
    }
  }

  if (failed) {
    writeQueue();
    setSyncStatus('error');
    scheduleFlush(RETRY_DELAY);
    return;
  }
  writeQueue();
  // A conflict is not a retry state: it needs the user, so it must not be
  // reported as "Saving…" or the button would lie indefinitely.
  const conflicted = (readStore()?.designs ?? []).some((design) => design.conflict);
  setSyncStatus(
    conflicted ? 'conflict' : pending.size ? 'pending' : 'idle',
  );
};

/**
 * Adopt the account's designs into the local cache.
 *
 * Designs the server has but this browser doesn't are pulled in; local designs
 * the server hasn't seen are kept and re-uploaded. The placeholder design is
 * dropped once real designs exist.
 */
export const hydrateLibrary = (): Promise<void> => {
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    let remote: DesignSummary[] = [];
    try {
      const response = await axios.get<DesignSummary[]>('/designs', {
        timeout: 8000,
      });
      remote = Array.isArray(response.data) ? response.data : [];
    } catch {
      // Unreachable: keep working from the local cache, uploads will retry.
      return;
    }

    const store = readStore();

    // A design queued for deletion must not come back: the server still has it
    // until the delete lands, and adopting it here would resurrect it locally.
    const queuedDeletes = new Set(
      [...pending.entries()]
        .filter(([, op]) => op === 'delete')
        .map(([id]) => id),
    );

    if (!remote.length) {
      // Nothing in the account yet, so push whatever this browser has.
      for (const design of store?.designs ?? []) {
        if (queuedDeletes.has(design.id)) continue;
        markDirty(design.id, 'upsert');
      }
      return;
    }

    const designs: SavedDesign[] = [];
    for (const summary of remote) {
      if (queuedDeletes.has(summary.id)) continue;
      const local = store?.designs.find((design) => design.id === summary.id);
      const remoteUpdatedAt = Number(summary.updatedAt) || 0;

      if (local && local.updatedAt > remoteUpdatedAt) {
        // A local edit that never reached the server wins.
        designs.push(local);
        // Unless it is conflicted: retrying that would overwrite the version
        // the user has been told about but not yet decided on.
        if (!local.conflict) markDirty(local.id, 'upsert');
        continue;
      }

      if (local) {
        designs.push({
          ...local,
          name: summary.name || local.name,
          updatedAt: remoteUpdatedAt || local.updatedAt,
          // The server is authoritative for its own previews: keeping a local
          // URL it no longer serves leaves the grid requesting a missing image.
          thumbUrl: summary.thumbUrl ?? undefined,
          // Its version, however, is only ours to adopt while we are in step
          // with it. A conflicted copy keeps the version the user must decide on.
          version: local.conflict ? local.version : (summary.version ?? local.version),
          remote: true,
        });
        continue;
      }

      try {
        const detail = await axios.get<{ pages?: unknown }>(
          `/designs/${encodeURIComponent(summary.id)}`,
          { timeout: 15000 },
        );
        if (!isPages(detail.data?.pages)) continue;
        designs.push({
          id: summary.id,
          name: summary.name || summary.id,
          updatedAt: remoteUpdatedAt || Date.now(),
          pages: clonePages(detail.data.pages),
          thumbUrl: summary.thumbUrl ?? undefined,
          version: summary.version,
          remote: true,
        });
      } catch {
        // Skip it; the next hydrate will try again.
      }
    }

    if (!designs.length) return;

    for (const design of store?.designs ?? []) {
      if (designs.some((item) => item.id === design.id)) continue;
      if (design.placeholder) continue;
      if (queuedDeletes.has(design.id)) continue;
      // A design this browser got from the server, and that the server no longer
      // lists, was deleted somewhere else. Keeping it would leave the grid showing
      // a card that cannot be opened, and re-uploading it would resurrect it.
      // One that was never uploaded is different: it is kept and pushed up.
      if (design.remote) continue;
      designs.push(design);
      // A design the server doesn't have yet, unless it is conflicted — in which
      // case the server has a version we are waiting on a decision about.
      if (!design.conflict) markDirty(design.id, 'upsert');
    }

    const previousActive = store?.activeId;
    writeStore({
      version: 1,
      activeId:
        previousActive && designs.some((d) => d.id === previousActive)
          ? previousActive
          : designs[0].id,
      designs,
    });
  })();

  return hydratePromise;
};

/**
 * Operations restored from a previous session go out as soon as the module
 * loads. Nothing else would trigger a flush for them: they belong to designs the
 * user has not touched since, or to designs that no longer exist locally, and
 * `scheduleFlush` only ever runs from a mutation.
 */
if (pending.size) {
  setSyncStatus('pending');
  scheduleFlush(FLUSH_DELAY);
}
