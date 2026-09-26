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
    .map(({ id, name, updatedAt, thumbnail }) => ({
      id,
      name,
      updatedAt,
      thumbnail,
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

export type SyncStatus = 'idle' | 'pending' | 'saving' | 'error';

const FLUSH_DELAY = 800;
const RETRY_DELAY = 5000;

let syncStatus: SyncStatus = 'idle';
const statusListeners = new Set<(status: SyncStatus) => void>();
const pending = new Map<string, 'upsert' | 'delete'>();
let flushTimer: number | null = null;
let hydratePromise: Promise<void> | null = null;

const setSyncStatus = (next: SyncStatus) => {
  if (syncStatus === next) return;
  syncStatus = next;
  for (const listener of statusListeners) listener(next);
};

export const getSyncStatus = () => syncStatus;

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
        // PUT is an upsert server-side, so this covers create and update.
        await axios.put(`/designs/${encodeURIComponent(id)}`, {
          name: design.name,
          pages: design.pages,
          thumbnail: design.thumbnail,
        });
        markDesignSynced(id);
      }
      pending.delete(id);
    } catch (error) {
      // Deleting something the server never had is a success for our purposes.
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (op === 'delete' && status === 404) {
        pending.delete(id);
        continue;
      }
      failed = true;
    }
  }

  if (failed) {
    setSyncStatus('error');
    scheduleFlush(RETRY_DELAY);
    return;
  }
  setSyncStatus(pending.size ? 'pending' : 'idle');
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

    if (!remote.length) {
      // Nothing in the account yet, so push whatever this browser has.
      for (const design of store?.designs ?? []) markDirty(design.id, 'upsert');
      return;
    }

    const designs: SavedDesign[] = [];
    for (const summary of remote) {
      const local = store?.designs.find((design) => design.id === summary.id);
      const remoteUpdatedAt = Number(summary.updatedAt) || 0;

      if (local && local.updatedAt > remoteUpdatedAt) {
        // A local edit that never reached the server wins.
        designs.push(local);
        markDirty(local.id, 'upsert');
        continue;
      }

      if (local) {
        designs.push({
          ...local,
          name: summary.name || local.name,
          updatedAt: remoteUpdatedAt || local.updatedAt,
          thumbUrl: summary.thumbUrl ?? local.thumbUrl,
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
      designs.push(design);
      markDirty(design.id, 'upsert');
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
