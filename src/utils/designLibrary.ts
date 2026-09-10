import type { SerializedPage } from '@lidojs/design-core';
import { v4 as uuid } from 'uuid';

const LEGACY_KEY = 'necrozine-lidojs-design';
const LIBRARY_KEY = 'necrozine-lidojs-library';

export type DesignSummary = {
  id: string;
  name: string;
  updatedAt: number;
};

export type SavedDesign = DesignSummary & {
  pages: SerializedPage[];
};

type LibraryStore = {
  version: 1;
  activeId: string;
  designs: SavedDesign[];
};

const clonePages = (pages: SerializedPage[]) =>
  JSON.parse(JSON.stringify(pages)) as SerializedPage[];

export const createBlankPages = (): SerializedPage[] => [
  {
    layers: {
      ROOT: {
        type: { resolvedName: 'RootLayer' },
        props: {
          boxSize: { width: 1640, height: 924 },
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
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
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
  return store.designs[index];
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
    return design;
  }
  const design = makeDesign(
    pages,
    name?.trim() || `Untitled ${store.designs.length + 1}`,
  );
  store.designs.push(design);
  store.activeId = design.id;
  writeStore(store);
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
