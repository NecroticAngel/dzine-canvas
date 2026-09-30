import type {
  ArrowType,
  SerializedLayer,
  SerializedLayerTree,
  SerializedLayers,
  SerializedPage,
} from '@lidojs/design-core';
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { v4 as uuid } from 'uuid';
import QRCode from 'qrcode';
import { data as samplePages } from '../../constant/data';
import {
  createBlankPages,
  createDesignInLibrary,
  deleteDesignInLibrary,
  duplicateDesignInLibrary,
  ensureLibrary,
  listDesignSummaries,
  openDesignInLibrary,
  renameDesignInLibrary,
  saveActiveDesignPages,
  setDesignThumbnail,
  type DesignSummary,
} from '../../utils/designLibrary';
import { captureThumbnail } from '../../utils/exportDesign';
import { downloadBlob } from '../../utils/download';
import { colorToHex } from '../../utils/color';
import { ensureFontFamily, fontFamilies, primaryFamily } from '../../utils/fonts';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type LineLayerProps = {
  style?: string;
  arrowStart?: ArrowType;
  arrowEnd?: ArrowType;
  boxSize?: { width?: number; height?: number };
  color?: string;
  position?: { x: number; y: number };
  rotate?: number;
};

export type GetFontQuery = {
  q?: string;
  offset?: string;
  limit?: string;
};

type PageSize = { width: number; height: number };
type Point = { x: number; y: number };
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

/** One alignment guide, in page coordinates. `x` is vertical, `y` horizontal. */
type SnapGuide = { axis: 'x' | 'y'; position: number };

/** `middle` is the vertical centre, to match `centre` being the horizontal one. */
type AlignKind = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';
type DistributeAxis = 'horizontal' | 'vertical';

type EditorState = {
  pages: SerializedPage[];
  activePage: number;
  scale: number;
  sidebar?: string;
  selectedLayerIds: string[];
  dragNDrop: unknown;
  /** True while there are edits autosave has not persisted yet. */
  dirty: boolean;
  /**
   * The editor refuses every change. Consumers need this for the *appearance* of
   * immutability: the mutations are already no-ops, but a control that silently
   * does nothing is worse than one that is not offered.
   */
  readOnly: boolean;
};

/** Identifies one cell of a TableLayer by its 1-based row/col index. */
type TableCellRef = {
  layerId: string;
  row: number;
  col: number;
};

type TableCellPatch = {
  text?: string;
  attrs?: Record<string, unknown>;
  background?: string;
  marks?: { bold?: boolean; italic?: boolean };
};

type EditorActions = {
  addVideoLayer: (media: { url: string }, size: PageSize) => void;
  addTextLayer: (tree: SerializedLayerTree) => void;
  addImageLayer: (
    media: { url: string; thumb: string },
    size: PageSize,
  ) => void;
  addSvgLayer: (url: string, size: PageSize, _ele?: SVGElement) => void;
  addShapeLayer: (layer: {
    type: { resolvedName: string };
    props: Record<string, unknown>;
  }) => void;
  addLineLayer: (input: { props: DeepPartial<LineLayerProps> }) => void;
  addFrameLayer: (
    frame: { img: string; width: number; height: number },
    clipPath: string,
  ) => void;
  addDrawLayer: (
    draw: { path: string; color: string; width: number },
    size: PageSize,
    position: Point,
    scale: number,
    transparency: number,
  ) => void;
  addLayer: (layer: {
    type: { resolvedName: string };
    props: Record<string, unknown>;
  }) => void;
  addLayerTree: (tree: SerializedLayerTree) => void;
  /** Merge several trees as a single undo step (multi-layer paste/duplicate). */
  addLayerTrees: (trees: SerializedLayerTree[]) => void;
  startDragNDrop: (
    payload: { layer: string; data: SerializedLayerTree },
    _pos: Point,
  ) => void;
  setPage: (index: number, page: SerializedPage) => void;
  setData: (pages: SerializedPage[]) => void;
  setSidebar: (name?: string) => void;
  selectLayers: (ids: string[]) => void;
  /** Alignment guides shown while dragging; cleared on drop. */
  setGuides: (guides: SnapGuide[]) => void;
  /** Snapshot the page before a drag/resize so the whole gesture is one undo step. */
  beginInteraction: () => void;
  /** Close the snapshot opened by `beginInteraction`. */
  endInteraction: () => void;
  /**
   * Align layers to the selection's own bounds, or to the page when only one
   * layer is selected.
   */
  alignLayers: (ids: string[], kind: AlignKind) => void;
  /** Even out the gaps between three or more layers, keeping the extremes put. */
  distributeLayers: (ids: string[], axis: DistributeAxis) => void;
  setEditingLayer: (id: string | null) => void;
  goToPage: (index: number) => void;
  addPage: () => void;
  duplicatePage: (index?: number) => void;
  deletePage: (index?: number) => void;
  updateLayerBox: (
    layerId: string,
    box: { position: Point; boxSize: PageSize },
  ) => void;
  updateLayerText: (layerId: string, text: string) => void;
  /** Patch arbitrary layer props (e.g. a QrCodeLayer's payload and colours). */
  updateLayerProps: (layerId: string, patch: Record<string, unknown>) => void;
  setSelectedCell: (cell: TableCellRef | null) => void;
  updateTableCell: (
    layerId: string,
    row: number,
    col: number,
    patch: TableCellPatch,
  ) => void;
  registerTextInput: (el: HTMLTextAreaElement | null) => void;
  deleteLayers: (ids?: string[]) => void;
  saveDesign: () => void;
  newDesign: (name?: string) => void;
  openDesign: (id: string) => void;
  renameDesign: (id: string, name: string) => void;
  duplicateDesign: (id: string) => void;
  deleteDesign: (id: string) => void;
  importDesignFile: (pages: SerializedPage[], name?: string) => void;
  history: {
    undo: () => void;
    redo: () => void;
  };
};

type EditorQuery = {
  serialize: () => SerializedPage[];
  getPageSize: (pageIndex: number) => PageSize;
  activePage: () => number;
  listDesigns: () => DesignSummary[];
  currentDesign: () => DesignSummary | null;
  history: {
    canUndo: () => boolean;
    canRedo: () => boolean;
  };
};

type EditorContextValue = EditorState & {
  actions: EditorActions;
  query: EditorQuery;
  editingLayerId: string | null;
  selectedCell: TableCellRef | null;
  currentDesign: DesignSummary | null;
  designs: DesignSummary[];
  guides: SnapGuide[];
};

const EditorContext = createContext<EditorContextValue | null>(null);

const EditorScaleContext = createContext<{
  scale: number;
  setScale: (scale: number) => void;
  setActivePage: (index: number) => void;
} | null>(null);

/** Measurement aids. Kept apart from the scale context so the footer can offer
 * them without the canvas having to own a second provider chain. */
type CanvasViewValue = {
  showRulers: boolean;
  setShowRulers: Dispatch<SetStateAction<boolean>>;
  showGrid: boolean;
  setShowGrid: Dispatch<SetStateAction<boolean>>;
  gridSize: number;
  setGridSize: Dispatch<SetStateAction<number>>;
};

const CanvasViewContext = createContext<CanvasViewValue | null>(null);

const CANVAS_VIEW_KEY = 'necrozine-canvas-view';

/** Grid presets, in page units. */
const GRID_SIZES = [8, 10, 16, 20, 25, 32, 40, 50, 64, 100];

const readCanvasView = (): Partial<CanvasViewValue> => {
  try {
    const raw = localStorage.getItem(CANVAS_VIEW_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      showRulers: parsed.showRulers === true,
      showGrid: parsed.showGrid === true,
      gridSize: GRID_SIZES.includes(Number(parsed.gridSize))
        ? Number(parsed.gridSize)
        : 20,
    };
  } catch {
    return {};
  }
};

type SelectionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Ruler tick spacing, coarsening as the canvas shrinks.
 *
 * Ticks are labelled in page units, so the step is chosen in page units and the
 * list is the set of spacings people actually measure in. 60px on screen is the
 * point where two labels stop colliding.
 */
const RULER_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

const rulerStepFor = (scale: number) =>
  RULER_STEPS.find((step) => step * scale >= 60) ?? RULER_STEPS[RULER_STEPS.length - 1];

const RULER_THICKNESS = 20;

/**
 * Theme colours, re-read at most once a second.
 *
 * `getComputedStyle` per frame per ruler is a style recalc for two strings, so
 * it is cached — the values only change when the theme does.
 */
let rulerPalette = { at: 0, values: { bg: '#fff', line: '#999', text: '#666', clear: 'rgba(0,0,0,0)' } };

const rulerColors = () => {
  if (Date.now() - rulerPalette.at < 1000) return rulerPalette.values;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  rulerPalette = {
    at: Date.now(),
    values: {
      bg: read('--app-ruler-bg', '#ffffff'),
      line: read('--app-ruler-line', 'rgba(0,0,0,.3)'),
      text: read('--app-ruler-text', '#666666'),
      clear: read('--app-ruler-selection', 'rgba(61,142,255,.2)'),
    },
  };
  return rulerPalette.values;
};

const clonePages = (pages: SerializedPage[]) =>
  JSON.parse(JSON.stringify(pages)) as SerializedPage[];

const bootstrapEditor = () => {
  const library = ensureLibrary(clonePages(samplePages));
  const active =
    library.designs.find((d) => d.id === library.activeId) ?? library.designs[0];
  return {
    pages: clonePages(active.pages),
    currentDesign: {
      id: active.id,
      name: active.name,
      updatedAt: active.updatedAt,
    } satisfies DesignSummary,
    designs: listDesignSummaries(),
  };
};

const createBlankPage = (size?: PageSize): SerializedPage => ({
  layers: {
    ROOT: {
      type: { resolvedName: 'RootLayer' },
      props: {
        boxSize: {
          width: size?.width ?? 1640,
          height: size?.height ?? 924,
        },
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
});

const pageSizeOf = (page: SerializedPage | undefined): PageSize => {
  const box = page?.layers?.ROOT?.props?.boxSize as PageSize | undefined;
  return { width: box?.width ?? 1640, height: box?.height ?? 924 };
};

const fitToPage = (size: PageSize, page: PageSize, maxRatio = 0.7): PageSize => {
  const ratio = Math.min(
    1,
    (page.width * maxRatio) / Math.max(size.width, 1),
    (page.height * maxRatio) / Math.max(size.height, 1),
  );
  return {
    width: Math.max(40, size.width * ratio),
    height: Math.max(40, size.height * ratio),
  };
};

const mergeLayers = (
  pages: SerializedPage[],
  activePage: number,
  layers: SerializedLayers,
  rootId: string,
) => {
  const next = clonePages(pages);
  const page = next[activePage];
  if (!page) return next;
  page.layers = { ...page.layers, ...layers };
  const root = page.layers.ROOT;
  if (root && !root.child.includes(rootId)) {
    page.layers.ROOT = { ...root, child: [...root.child, rootId] };
  }
  return next;
};

const extractText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return '';
  const value = node as {
    type?: string;
    text?: string;
    content?: unknown[];
  };
  if (typeof value.text === 'string') return value.text;
  if (!value.content?.length) return '';
  if (value.type === 'doc') {
    return value.content.map((block) => extractText(block)).join('\n');
  }
  return value.content.map((child) => extractText(child)).join('');
};

const buildTextDoc = (existingDoc: unknown, text: string) => {
  const doc = (existingDoc ?? {
    type: 'doc',
    content: [],
  }) as {
    type: string;
    content?: {
      type: string;
      attrs?: Record<string, unknown>;
      content?: { type: string; marks?: unknown[]; text?: string }[];
    }[];
  };
  const baseAttrs = doc.content?.[0]?.attrs ?? {
    textAlign: 'center',
    color: 'rgb(0, 0, 0)',
    fontFamily: 'Nunito',
    fontSize: '24px',
    lineHeight: 1.4,
    letterSpacing: 0,
    textTransform: '',
    marginLeft: null,
    indent: 0,
    listType: '',
  };
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      attrs: { ...baseAttrs },
      content: line
        ? [
            {
              type: 'text',
              marks: [
                { type: 'color', attrs: { color: String(baseAttrs.color) } },
              ],
              text: line,
            },
          ]
        : [],
    })),
  };
};

const HANDLE_SIZE = 10;

/**
 * Error correction, as a share of the code recoverable if it is damaged.
 *
 * `H` is the default because a logo punched into the middle *is* damage as far
 * as the encoder is concerned, and it costs a few extra modules to keep the
 * code readable with one. Dropping to `L` makes a denser, smaller-looking code
 * that a phone will fail to read if the logo is left in, so the toolbar warns
 * about that combination rather than silently producing a broken code.
 */
type QrErrorLevel = 'L' | 'M' | 'Q' | 'H';

const QR_ERROR_LEVELS: { value: QrErrorLevel; label: string }[] = [
  { value: 'L', label: 'L - 7%' },
  { value: 'M', label: 'M - 15%' },
  { value: 'Q', label: 'Q - 25%' },
  { value: 'H', label: 'H - 30%' },
];

/** Layers saved before this option existed have no level, and want `H`. */
const readErrorLevel = (value: unknown): QrErrorLevel =>
  value === 'L' || value === 'M' || value === 'Q' ? value : 'H';

/** Escape a value for use inside an XML attribute. */
const xmlAttr = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

/**
 * Render a QR code to standalone SVG, with the centre logo composited in.
 *
 * The on-canvas layer is a PNG with an `<img>` logo positioned over it, which
 * is fine on screen but has nothing to export — a downloaded SVG that dropped
 * the logo would not match what the user had just arranged. The logo is rebuilt
 * as an `<image>` at the same 22% the layer uses, on a plate of the code's own
 * light colour, so the two agree.
 */
const buildQrSvg = async (
  text: string,
  bgColor: string,
  textColor: string,
  logo: string | undefined,
  errorCorrectionLevel: QrErrorLevel,
): Promise<string> => {
  const svg = await QRCode.toString(text.trim() || ' ', {
    type: 'svg',
    errorCorrectionLevel,
    margin: 1,
    color: {
      dark: colorToHex(textColor, '#1e1e2d'),
      light: colorToHex(bgColor, '#ffffff'),
    },
  });
  if (!logo) return svg;
  // qrcode emits a unit-based viewBox with no width/height, so the geometry has
  // to come from the viewBox rather than from the element's own size.
  const viewBox = /viewBox="0 0 ([\d.]+)/.exec(svg);
  if (!viewBox) return svg;
  const size = Number(viewBox[1]);
  const box = size * 0.22;
  const offset = (size - box) / 2;
  const plate =
    `<rect x="${offset}" y="${offset}" width="${box}" height="${box}" ` +
    `rx="${(size * 0.02).toFixed(3)}" fill="${colorToHex(bgColor, '#ffffff')}"/>`;
  const image =
    `<image x="${offset}" y="${offset}" width="${box}" height="${box}" ` +
    `preserveAspectRatio="xMidYMid meet" xlink:href="${xmlAttr(logo)}"/>`;
  const rooted = svg.includes('xmlns:xlink')
    ? svg
    : svg.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
  return rooted.replace('</svg>', `${plate}${image}</svg>`);
};

const QrCodeView = ({
  text,
  bgColor,
  textColor,
  logo,
  errorCorrectionLevel,
}: {
  text: string;
  bgColor: string;
  textColor: string;
  logo?: string;
  errorCorrectionLevel: QrErrorLevel;
}) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    const payload = text.trim() || ' ';
    QRCode.toDataURL(payload, {
      errorCorrectionLevel,
      margin: 1,
      width: 512,
      color: {
        dark: colorToHex(textColor, '#1e1e2d'),
        light: colorToHex(bgColor, '#ffffff'),
      },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [text, bgColor, textColor, errorCorrectionLevel]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {src ? (
        <img
          alt=""
          draggable={false}
          src={src}
          style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />
      ) : (
        <div
          style={{
            fontSize: 12,
            color: textColor,
            textAlign: 'center',
            padding: 8,
            pointerEvents: 'none',
          }}
        >
          QR
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, wordBreak: 'break-all' }}>
            {text || 'Empty'}
          </div>
        </div>
      )}
      {logo ? (
        <img
          alt=""
          draggable={false}
          src={logo}
          style={{
            position: 'absolute',
            width: '22%',
            height: '22%',
            objectFit: 'contain',
            pointerEvents: 'none',
            background: bgColor,
            borderRadius: 6,
            padding: 2,
          }}
        />
      ) : null}
    </div>
  );
};

const removeLayerTree = (
  layers: SerializedLayers,
  rootId: string,
) => {
  const stack = [rootId];
  const removed = new Set<string>();
  while (stack.length) {
    const id = stack.pop() as string;
    if (removed.has(id) || id === 'ROOT') continue;
    removed.add(id);
    const node = layers[id];
    if (node?.child?.length) stack.push(...node.child);
  }
  for (const id of removed) {
    const parentId = layers[id]?.parent;
    if (parentId && layers[parentId]) {
      layers[parentId] = {
        ...layers[parentId],
        child: layers[parentId].child.filter((childId) => childId !== id),
      };
    }
    delete layers[id];
  }
};

/** Lift one layer subtree (with every descendant) out of a page. */
const copyLayerTree = (
  layers: SerializedLayers,
  rootId: string,
): SerializedLayerTree | null => {
  if (rootId === 'ROOT' || !layers[rootId]) return null;
  const stack = [rootId];
  const ids = new Set<string>();
  while (stack.length) {
    const id = stack.pop() as string;
    if (ids.has(id) || id === 'ROOT') continue;
    ids.add(id);
    const node = layers[id];
    if (node?.child?.length) stack.push(...node.child);
  }
  const picked: SerializedLayers = {};
  for (const id of ids) {
    picked[id] = JSON.parse(JSON.stringify(layers[id])) as SerializedLayer;
  }
  return { rootId, layers: picked };
};

/**
 * Re-key a copied tree so the same clipboard entry can be pasted repeatedly,
 * nudging the root by `(dx, dy)` so a copy never hides behind its original.
 */
const remapLayerTree = (
  tree: SerializedLayerTree,
  dx: number,
  dy: number,
): SerializedLayerTree => {
  const idMap = new Map<string, string>();
  for (const id of Object.keys(tree.layers)) idMap.set(id, uuid());
  const layers: SerializedLayers = {};
  for (const [id, layer] of Object.entries(tree.layers)) {
    layers[idMap.get(id) as string] = {
      ...layer,
      parent: layer.parent ? idMap.get(layer.parent) ?? 'ROOT' : null,
      child: layer.child.map((childId) => idMap.get(childId) ?? childId),
    };
  }
  const root = layers[idMap.get(tree.rootId) as string];
  const position = (root.props.position ?? { x: 0, y: 0 }) as Point;
  root.props = {
    ...root.props,
    position: { x: position.x + dx, y: position.y + dy },
  };
  return { rootId: idMap.get(tree.rootId) as string, layers };
};

/** Screen-pixel distance within which a drag latches onto a guide. */
const SNAP_THRESHOLD = 6;

/** Quiet period after the last edit before autosave persists the design. */
const AUTOSAVE_DELAY = 1200;

const isDescendantOf = (
  layers: SerializedLayers,
  id: string,
  ancestorId: string,
): boolean => {
  let cursor: string | null = layers[id]?.parent ?? null;
  for (let guard = 0; cursor && cursor !== 'ROOT' && guard < 64; guard += 1) {
    if (cursor === ancestorId) return true;
    cursor = layers[cursor]?.parent ?? null;
  }
  return false;
};

/** Closest `targets` entry to any of `moving`, when within `threshold`. */
const closestSnap = (moving: number[], targets: number[], threshold: number) => {
  let best: { delta: number; line: number } | null = null;
  for (const value of moving) {
    for (const target of targets) {
      const delta = target - value;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, line: target };
      }
    }
  }
  return best;
};

/**
 * Snap a dragged box to the page and to its siblings.
 *
 * Candidates per axis are the leading edge, centre and trailing edge of every
 * other layer, plus the page's own edges and centre. The two axes snap
 * independently, so a drag can latch onto a vertical and a horizontal guide at
 * once.
 */
const computeSnap = (
  layers: SerializedLayers,
  movingId: string,
  position: Point,
  size: PageSize,
  pageSize: PageSize,
  threshold: number,
): { position: Point; guides: SnapGuide[] } => {
  const xTargets = [0, pageSize.width / 2, pageSize.width];
  const yTargets = [0, pageSize.height / 2, pageSize.height];

  for (const [id, layer] of Object.entries(layers)) {
    if (id === 'ROOT' || id === movingId) continue;
    if (isDescendantOf(layers, id, movingId)) continue;
    const props = layer.props as { position?: Point; boxSize?: PageSize };
    const p = props.position;
    const box = props.boxSize;
    if (!p || !box?.width || !box?.height) continue;
    xTargets.push(p.x, p.x + box.width / 2, p.x + box.width);
    yTargets.push(p.y, p.y + box.height / 2, p.y + box.height);
  }

  const snapX = closestSnap(
    [position.x, position.x + size.width / 2, position.x + size.width],
    xTargets,
    threshold,
  );
  const snapY = closestSnap(
    [position.y, position.y + size.height / 2, position.y + size.height],
    yTargets,
    threshold,
  );

  const guides: SnapGuide[] = [];
  if (snapX) guides.push({ axis: 'x', position: snapX.line });
  if (snapY) guides.push({ axis: 'y', position: snapY.line });

  return {
    position: {
      x: position.x + (snapX?.delta ?? 0),
      y: position.y + (snapY?.delta ?? 0),
    },
    guides,
  };
};

/** A layer's position and size in page units. */
type LayerBox = { id: string; x: number; y: number; width: number; height: number };

/** Boxes for the given layer ids, skipping ids that are gone or have no size. */
const layerBoxes = (
  pages: SerializedPage[],
  activePage: number,
  ids: string[],
): LayerBox[] => {
  const layers = pages[activePage]?.layers;
  if (!layers) return [];
  const boxes: LayerBox[] = [];
  for (const id of ids) {
    const props = layers[id]?.props as
      | { position?: Point; boxSize?: PageSize }
      | undefined;
    const p = props?.position;
    const box = props?.boxSize;
    if (!p || !box?.width || !box?.height) continue;
    boxes.push({ id, x: p.x, y: p.y, width: box.width, height: box.height });
  }
  return boxes;
};

/** Move one layer a single slot up (`forward`) or down its parent's child list. */
const moveLayerInParent = (
  layers: SerializedLayers,
  id: string,
  forward: boolean,
): boolean => {
  const layer = layers[id];
  if (!layer) return false;
  const parentId = layer.parent && layers[layer.parent] ? layer.parent : 'ROOT';
  const parent = layers[parentId];
  if (!parent) return false;
  const index = parent.child.indexOf(id);
  if (index < 0) return false;
  const target = forward ? index + 1 : index - 1;
  if (target < 0 || target >= parent.child.length) return false;
  const child = [...parent.child];
  child.splice(index, 1);
  child.splice(target, 0, id);
  layers[parentId] = { ...parent, child };
  return true;
};

/**
 * Register a family's faces and report when they are usable.
 *
 * The re-render matters for more than the glyphs: thumbnails and exports
 * capture the DOM, and a capture taken while the face is still loading gets the
 * fallback font baked into the file.
 */
const useEnsureFont = (family: string) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!family) {
      setReady(false);
      return;
    }
    let cancelled = false;
    void ensureFontFamily(family).then((available) => {
      if (!cancelled) setReady(available);
    });
    return () => {
      cancelled = true;
    };
  }, [family]);
  return ready;
};

/** The family a text layer asks for, read out of its own document. */
const textLayerFamily = (props: Record<string, unknown> | undefined) => {
  const doc = props?.doc as
    | { content?: { attrs?: { fontFamily?: unknown } }[] }
    | undefined;
  return primaryFamily(doc?.content?.[0]?.attrs?.fontFamily);
};

const LayerView = ({
  layerId,
  layers,
}: {
  layerId: string;
  layers: SerializedLayers;
}) => {
  const ctx = useContext(EditorContext);
  const scaleCtx = useContext(EditorScaleContext);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const [draftText, setDraftText] = useState('');
  const lastClickRef = useRef(0);
  const layer = layers[layerId];
  const editing = !!ctx && ctx.editingLayerId === layerId;
  const props = layer?.props as Record<string, unknown> | undefined;
  // Called before the early return below so the hook order is stable.
  const fontFamily = textLayerFamily(props);
  const fontReady = useEnsureFont(fontFamily);

  useEffect(() => {
    if (!editing || !ctx || !props) return;
    const initial = extractText(props.doc);
    setDraftText(initial);
    ctx.actions.updateLayerText(layerId, initial);
    const id = window.requestAnimationFrame(() => {
      const node = draftRef.current;
      if (!node) return;
      node.focus();
      node.select();
    });
    return () => window.cancelAnimationFrame(id);
    // Only re-seed when entering edit mode for this layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, layerId]);

  useEffect(() => {
    if (!editing || !ctx) return;
    ctx.actions.registerTextInput(draftRef.current);
    return () => ctx.actions.registerTextInput(null);
  }, [editing, ctx]);

  if (!layer || !ctx || !props) return null;

  const position = (props.position as Point) ?? { x: 0, y: 0 };
  const boxSize = (props.boxSize as PageSize) ?? { width: 0, height: 0 };
  const rotate = Number(props.rotate ?? 0);
  const name = layer.type.resolvedName;
  // Qr templates store a module scale that shouldn't also CSS-scale the box.
  const layerScale =
    name === 'QrCodeLayer' ? 1 : Number(props.scale ?? 1);
  const selected = ctx.selectedLayerIds.includes(layerId);
  const pageScale = scaleCtx?.scale ?? ctx.scale;

  const startInteraction = (
    mode: 'move' | ResizeCorner,
    event: ReactPointerEvent,
  ) => {
    if (editing) return;
    event.preventDefault();
    event.stopPropagation();
    ctx.actions.selectLayers([layerId]);

    if (mode === 'move' && name === 'TextLayer') {
      const now = Date.now();
      if (now - lastClickRef.current < 350) {
        lastClickRef.current = 0;
        ctx.actions.setEditingLayer(layerId);
        return;
      }
      lastClickRef.current = now;
    }

    ctx.actions.setEditingLayer(null);

    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...position };
    const originSize = { ...boxSize };
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const rawDx = ev.clientX - startX;
      const rawDy = ev.clientY - startY;
      if (!moved && Math.hypot(rawDx, rawDy) < 4) return;
      if (!moved) {
        // Snapshot before the first live patch, so undo restores the pre-drag position.
        ctx.actions.beginInteraction();
      }
      moved = true;
      const dx = rawDx / pageScale;
      const dy = rawDy / pageScale;

      if (mode === 'move') {
        const page = ctx.pages[ctx.activePage];
        const layers = page?.layers;
        let next = { x: origin.x + dx, y: origin.y + dy };
        let snaps: SnapGuide[] = [];
        if (layers) {
          // Threshold is in page units, so the pull feels the same at any zoom.
          const snapped = computeSnap(
            layers,
            layerId,
            next,
            originSize,
            pageSizeOf(page),
            SNAP_THRESHOLD / pageScale,
          );
          next = snapped.position;
          snaps = snapped.guides;
        }
        ctx.actions.setGuides(snaps);
        ctx.actions.updateLayerBox(layerId, {
          position: next,
          boxSize: originSize,
        });
        return;
      }

      let nextX = origin.x;
      let nextY = origin.y;
      let nextW = originSize.width;
      let nextH = originSize.height;

      if (mode.includes('e')) nextW = originSize.width + dx;
      if (mode.includes('s')) nextH = originSize.height + dy;
      if (mode.includes('w')) {
        nextW = originSize.width - dx;
        nextX = origin.x + dx;
      }
      if (mode.includes('n')) {
        nextH = originSize.height - dy;
        nextY = origin.y + dy;
      }

      const min = 24;
      if (nextW < min) {
        if (mode.includes('w')) nextX -= min - nextW;
        nextW = min;
      }
      if (nextH < min) {
        if (mode.includes('n')) nextY -= min - nextH;
        nextH = min;
      }

      ctx.actions.updateLayerBox(layerId, {
        position: { x: nextX, y: nextY },
        boxSize: { width: nextW, height: nextH },
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) {
        ctx.actions.setGuides([]);
        // Close the snapshot taken at movement start: the gesture becomes one undo step.
        ctx.actions.endInteraction();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const frameStyle: CSSProperties = {
    position: 'absolute',
    left: position.x ?? 0,
    top: position.y ?? 0,
    width: boxSize.width ?? 0,
    height: boxSize.height ?? 0,
    transform: `rotate(${rotate}deg) scale(${layerScale})`,
    transformOrigin: 'top left',
    cursor: editing ? 'text' : selected ? 'move' : 'pointer',
    outline: selected || editing ? '2px solid #3d8eff' : undefined,
    outlineOffset: 0,
    boxSizing: 'border-box',
    userSelect: editing ? 'text' : 'none',
    touchAction: 'none',
  };

  const content = (() => {
    if (name === 'ShapeLayer') {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: String(props.color ?? '#5E6278'),
            borderRadius: props.shape === 'circle' ? '50%' : 0,
          }}
        />
      );
    }

    if (name === 'TextLayer') {
      const doc = props.doc as {
        content?: { attrs?: Record<string, unknown> }[];
      };
      const attrs = doc?.content?.[0]?.attrs ?? {};
      const textStyle: CSSProperties = {
        width: '100%',
        height: '100%',
        color: String(attrs.color ?? '#111'),
        fontFamily: String(attrs.fontFamily ?? 'Nunito, sans-serif'),
        fontSize: String(attrs.fontSize ?? '24px'),
        textAlign: (attrs.textAlign as CSSProperties['textAlign']) ?? 'center',
        lineHeight: Number(attrs.lineHeight ?? 1.2),
        whiteSpace: 'pre-wrap',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      };

      if (editing) {
        return (
          <textarea
            ref={(node) => {
              draftRef.current = node;
              ctx.actions.registerTextInput(node);
            }}
            value={draftText}
            style={{
              ...textStyle,
              display: 'block',
              resize: 'none',
              border: 'none',
              outline: '2px solid #3d8eff',
              background: 'rgba(255,255,255,0.95)',
              padding: 4,
              cursor: 'text',
              userSelect: 'text',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraftText(value);
              // Keep draft in editor refs only — commit on blur / click-out.
              ctx.actions.updateLayerText(layerId, value);
            }}
            onBlur={() => {
              const value = draftRef.current?.value ?? draftText;
              ctx.actions.updateLayerText(layerId, value);
              ctx.actions.setEditingLayer(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                const value = draftRef.current?.value ?? draftText;
                ctx.actions.updateLayerText(layerId, value);
                ctx.actions.setEditingLayer(null);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                ctx.actions.setEditingLayer(null);
              }
            }}
          />
        );
      }

      return <div style={textStyle}>{extractText(props.doc)}</div>;
    }

    if (name === 'ImageLayer' || name === 'FrameLayer') {
      const image = props.image as { url?: string } | string | undefined;
      const url = typeof image === 'string' ? image : image?.url;
      return url ? (
        <img
          alt=""
          draggable={false}
          src={url}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
      ) : null;
    }

    if (name === 'VideoLayer') {
      return (
        <video
          muted
          autoPlay
          loop
          draggable={false}
          src={String(props.url ?? '')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
      );
    }

    if (name === 'SvgLayer') {
      const src = String(props.image ?? '');
      return src ? (
        <img
          alt=""
          draggable={false}
          src={src}
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      ) : null;
    }

    if (name === 'TableLayer') {
      type TableBorder = {
        width?: number;
        color?: string;
        style?: string;
      };
      type TableCell = {
        row: number;
        col: number;
        background?: string;
        border?: {
          top?: TableBorder;
          right?: TableBorder;
          bottom?: TableBorder;
          left?: TableBorder;
        };
        value?: unknown;
      };
      type TableFormat = {
        cellPadding?: number;
        cellSpacing?: number;
        rows?: { index: number; height: number }[];
        columns?: { index: number; width: number }[];
      };

      const format = (props.format as TableFormat | undefined) ?? {};
      const cells = (Array.isArray(props.cells) ? props.cells : []) as TableCell[];
      const rows =
        format.rows && format.rows.length > 0
          ? format.rows
          : [{ index: 1, height: 70 }];
      const cols =
        format.columns && format.columns.length > 0
          ? format.columns
          : [{ index: 1, width: 200 }];
      const totalW = cols.reduce((sum, col) => sum + (col.width || 0), 0) || 1;
      const totalH = rows.reduce((sum, row) => sum + (row.height || 0), 0) || 1;
      const padding = Number(format.cellPadding ?? 8);
      const spacing = Number(format.cellSpacing ?? 0);
      const cellMap = new Map(
        cells.map((cell) => [`${cell.row}:${cell.col}`, cell] as const),
      );

      const borderCss = (side?: TableBorder) => {
        if (!side) return '1px solid #111';
        return `${side.width ?? 1}px ${side.style ?? 'solid'} ${side.color ?? '#111'}`;
      };

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            gridTemplateColumns: cols
              .map((col) => `${((col.width || 0) / totalW) * 100}%`)
              .join(' '),
            gridTemplateRows: rows
              .map((row) => `${((row.height || 0) / totalH) * 100}%`)
              .join(' '),
            gap: spacing,
            boxSizing: 'border-box',
            overflow: 'hidden',
            background: '#fff',
            // Cells only accept input once the table is selected, so the first
            // click still selects — and can drag — the whole layer.
            pointerEvents: selected ? 'auto' : 'none',
          }}
        >
          {rows.flatMap((row) =>
            cols.map((col) => {
              const cell = cellMap.get(`${row.index}:${col.index}`);
              return (
                <TableCellView
                  key={`${row.index}-${col.index}`}
                  layerId={layerId}
                  row={row.index}
                  col={col.index}
                  cell={cell}
                  padding={padding}
                  borderCss={borderCss}
                />
              );
            }),
          )}
        </div>
      );
    }

    if (name === 'QrCodeLayer') {
      return (
        <QrCodeView
          text={String(props.text ?? '')}
          bgColor={String(props.bgColor ?? '#ffffff')}
          textColor={String(props.textColor ?? '#1e1e2d')}
          logo={props.logo ? String(props.logo) : undefined}
          errorCorrectionLevel={readErrorLevel(props.errorCorrectionLevel)}
        />
      );
    }

    return layer.child.map((childId) => (
      <LayerView key={childId} layerId={childId} layers={layers} />
    ));
  })();

  if (name === 'RootLayer') {
    return (
      <div
        style={{
          position: 'relative',
          width: boxSize.width ?? 1640,
          height: boxSize.height ?? 924,
          background: String(props.color ?? '#fff'),
          overflow: 'hidden',
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            ctx.actions.selectLayers([]);
            ctx.actions.setEditingLayer(null);
          }
        }}
      >
        {layer.child.map((childId) => (
          <LayerView key={childId} layerId={childId} layers={layers} />
        ))}
      </div>
    );
  }

  const corners: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
  const cornerStyle = (corner: ResizeCorner): CSSProperties => {
    const base: CSSProperties = {
      position: 'absolute',
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      background: '#fff',
      border: '2px solid #3d8eff',
      borderRadius: 2,
      zIndex: 3,
      boxSizing: 'border-box',
    };
    if (corner.includes('n')) base.top = -HANDLE_SIZE / 2;
    if (corner.includes('s')) base.bottom = -HANDLE_SIZE / 2;
    if (corner.includes('w')) base.left = -HANDLE_SIZE / 2;
    if (corner.includes('e')) base.right = -HANDLE_SIZE / 2;
    base.cursor =
      corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
    return base;
  };

  return (
    <div
      data-qr-anchor={selected && name === 'QrCodeLayer' ? 'true' : undefined}
      data-draw-anchor={
        selected && name === 'SvgLayer' && parseDrawSvg(props.image)
          ? 'true'
          : undefined
      }
      data-font-family={name === 'TextLayer' ? fontFamily || undefined : undefined}
      data-font-ready={
        name === 'TextLayer' && fontFamily
          ? fontReady
            ? 'true'
            : 'false'
          : undefined
      }
      data-text-anchor={selected && name === 'TextLayer' ? 'true' : undefined}
      style={frameStyle}
      onPointerDown={(e) => startInteraction('move', e)}
      onDoubleClick={(e) => {
        if (name !== 'TextLayer') return;
        e.preventDefault();
        e.stopPropagation();
        ctx.actions.selectLayers([layerId]);
        ctx.actions.setEditingLayer(layerId);
      }}
    >
      {content}
      {selected &&
        !editing &&
        corners.map((corner) => (
          <div
            key={corner}
            style={cornerStyle(corner)}
            onPointerDown={(e) => startInteraction(corner, e)}
          />
        ))}
    </div>
  );
};

type TableBorderShape = {
  width?: number;
  color?: string;
  style?: string;
};

type TableCellShape = {
  row: number;
  col: number;
  background?: string;
  border?: {
    top?: TableBorderShape;
    right?: TableBorderShape;
    bottom?: TableBorderShape;
    left?: TableBorderShape;
  };
  value?: unknown;
};

type TextBlock = {
  attrs?: Record<string, unknown>;
  content?: { marks?: { type?: string }[] }[];
};

const cellBlock = (value: unknown): TextBlock | undefined =>
  (value as { content?: TextBlock[] } | undefined)?.content?.[0];

/**
 * A single table cell.
 *
 * Inert until its table is selected, so the first click still selects (and can
 * drag) the whole layer. Once selected, a click picks the cell and a
 * double-click opens the inline text editor.
 */
const TableCellView = ({
  layerId,
  row,
  col,
  cell,
  padding,
  borderCss,
}: {
  layerId: string;
  row: number;
  col: number;
  cell?: TableCellShape;
  padding: number;
  borderCss: (side?: TableBorderShape) => string;
}) => {
  const ctx = useContext(EditorContext);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const layerSelected = !!ctx?.selectedLayerIds.includes(layerId);
  const active =
    !!ctx?.selectedCell &&
    ctx.selectedCell.layerId === layerId &&
    ctx.selectedCell.row === row &&
    ctx.selectedCell.col === col;

  const block = cellBlock(cell?.value);
  const attrs = block?.attrs ?? {};
  const marks = (block?.content ?? []).flatMap((node) =>
    Array.isArray(node.marks) ? node.marks : [],
  );
  const bold = marks.some((mark) => mark?.type === 'bold');
  const italic = marks.some((mark) => mark?.type === 'italic');
  const align = String(attrs.textAlign ?? 'center');
  const text = extractText(cell?.value);

  useEffect(() => {
    if (!editorOpen) return;
    const id = window.requestAnimationFrame(() => {
      draftRef.current?.focus();
      draftRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [editorOpen]);

  // Leave edit mode if this stops being the active cell.
  useEffect(() => {
    if (!active && editorOpen) setEditorOpen(false);
  }, [active, editorOpen]);

  const commitText = () => {
    setEditorOpen(false);
    if (!ctx) return;
    ctx.actions.updateTableCell(layerId, row, col, { text: draft });
  };

  const openEditor = () => {
    setDraft(text);
    setEditorOpen(true);
  };

  return (
    <div
      data-selected-cell={active ? 'true' : undefined}
      style={{
        position: 'relative',
        background: cell?.background ?? '#fff',
        borderTop: borderCss(cell?.border?.top),
        borderRight: borderCss(cell?.border?.right),
        borderBottom: borderCss(cell?.border?.bottom),
        borderLeft: borderCss(cell?.border?.left),
        padding,
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          align === 'left'
            ? 'flex-start'
            : align === 'right'
              ? 'flex-end'
              : 'center',
        color: String(attrs.color ?? '#333'),
        fontFamily: String(attrs.fontFamily ?? 'Nunito, sans-serif'),
        fontSize: String(attrs.fontSize ?? '14px'),
        lineHeight: Number(attrs.lineHeight ?? 1.4),
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? 'italic' : 'normal',
        textTransform: String(
          attrs.textTransform ?? '',
        ) as CSSProperties['textTransform'],
        textAlign: align as CSSProperties['textAlign'],
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        outline: active ? '2px solid #3d8eff' : undefined,
        outlineOffset: active ? '-2px' : undefined,
        cursor: layerSelected ? 'text' : 'default',
      }}
      onPointerDown={(event) => {
        if (!ctx || !layerSelected) return;
        event.stopPropagation();
        event.preventDefault();
        ctx.actions.setSelectedCell({ layerId, row, col });
      }}
      onDoubleClick={(event) => {
        if (!ctx || !layerSelected) return;
        event.stopPropagation();
        event.preventDefault();
        openEditor();
      }}
    >
      {editorOpen ? (
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              commitText();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setEditorOpen(false);
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            textAlign: 'inherit',
            padding,
            boxSizing: 'border-box',
          }}
        />
      ) : (
        text
      )}
    </div>
  );
};

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px'];

/**
 * Floating formatting toolbar for the selected table cell.
 *
 * Positioned `fixed` from the cell's live bounding rect, so it is never
 * clipped by the artboard's `overflow: hidden`.
 */
const CellToolbar = () => {
  const ctx = useContext(EditorContext);
  const cell = ctx?.selectedCell ?? null;
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!cell) {
      setAnchor(null);
      return;
    }
    let frame = 0;
    let last = '';
    const tick = () => {
      const node = document.querySelector('[data-selected-cell="true"]');
      const rect = node?.getBoundingClientRect();
      const key = rect
        ? `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}`
        : '';
      if (key !== last) {
        last = key;
        setAnchor(
          rect
            ? { top: rect.top, left: rect.left + rect.width / 2 }
            : null,
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [cell]);

  if (!ctx || !cell || !anchor) return null;

  const page = ctx.pages[ctx.activePage];
  const layer = page?.layers?.[cell.layerId];
  const rawCells = (layer?.props as Record<string, unknown> | undefined)?.cells;
  const cells = Array.isArray(rawCells) ? (rawCells as TableCellShape[]) : [];
  const target = cells.find(
    (entry) => entry.row === cell.row && entry.col === cell.col,
  );
  const block = cellBlock(target?.value);
  const attrs = block?.attrs ?? {};
  const marks = (block?.content ?? []).flatMap((node) =>
    Array.isArray(node.marks) ? node.marks : [],
  );
  const bold = marks.some((mark) => mark?.type === 'bold');
  const italic = marks.some((mark) => mark?.type === 'italic');
  const align = String(attrs.textAlign ?? 'center');

  // Keep the dropdown truthful when a cell carries a size we don't preset.
  const currentSize = String(attrs.fontSize ?? '14px');
  const sizeOptions = FONT_SIZES.includes(currentSize)
    ? FONT_SIZES
    : [...FONT_SIZES, currentSize].sort(
        (a, b) => parseFloat(a) - parseFloat(b),
      );

  const update = (patch: TableCellPatch) =>
    ctx.actions.updateTableCell(cell.layerId, cell.row, cell.col, patch);

  const buttonCss = (isActive: boolean) => ({
    minWidth: 30,
    height: 28,
    padding: '0 6px',
    border: `1px solid ${isActive ? '#3d8eff' : 'var(--app-border)'}`,
    background: isActive ? 'rgba(61,142,255,.16)' : 'transparent',
    color: isActive ? '#3d8eff' : 'var(--app-text-strong)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
  });

  return (
    <div
      css={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        transform: 'translate(-50%, calc(-100% - 12px))',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 6,
        borderRadius: 10,
        border: '1px solid var(--app-border)',
        background: 'var(--app-panel)',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title="Bold"
        aria-label="Bold"
        css={buttonCss(bold)}
        onClick={() => update({ marks: { bold: !bold } })}
      >
        B
      </button>
      <button
        type="button"
        title="Italic"
        aria-label="Italic"
        css={{ ...buttonCss(italic), fontStyle: 'italic' }}
        onClick={() => update({ marks: { italic: !italic } })}
      >
        I
      </button>
      <select
        aria-label="Font size"
        value={currentSize}
        onChange={(event) => update({ attrs: { fontSize: event.target.value } })}
        css={{
          height: 28,
          border: '1px solid var(--app-border)',
          background: 'transparent',
          color: 'var(--app-text-strong)',
          borderRadius: 6,
          fontSize: 12,
          padding: '0 4px',
          cursor: 'pointer',
        }}
      >
        {sizeOptions.map((size) => (
          <option key={size} value={size}>
            {size.replace('px', '')}
          </option>
        ))}
      </select>
      <input
        type="color"
        title="Text colour"
        aria-label="Text colour"
        value={colorToHex(attrs.color, '#333333')}
        onChange={(event) => update({ attrs: { color: event.target.value } })}
        css={{ width: 28, height: 28, padding: 0, border: '1px solid var(--app-border)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
      />
      <span css={{ width: 1, height: 18, background: 'var(--app-border)' }} />
      {(['left', 'center', 'right'] as const).map((value) => (
        <button
          key={value}
          type="button"
          title={`Align ${value}`}
          aria-label={`Align ${value}`}
          css={buttonCss(align === value)}
          onClick={() => update({ attrs: { textAlign: value } })}
        >
          {value === 'left' ? 'L' : value === 'center' ? 'C' : 'R'}
        </button>
      ))}
      <span css={{ width: 1, height: 18, background: 'var(--app-border)' }} />
      <input
        type="color"
        title="Cell background"
        aria-label="Cell background"
        value={colorToHex(target?.background, '#ffffff')}
        onChange={(event) => update({ background: event.target.value })}
        css={{ width: 28, height: 28, padding: 0, border: '1px solid var(--app-border)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
      />
    </div>
  );
};

/**
 * Floating editor for a selected text layer.
 *
 * Same anchoring approach as `CellToolbar`: it reads the selected layer's live
 * bounding rect each frame, so it follows the layer and the zoom with no
 * coordinate maths of its own.
 *
 * It offers the block's own attributes — family, size, colour, alignment —
 * because those are the only things a text layer honours. The renderer draws
 * `extractText(props.doc)` as one string, so the `bold` and `italic` marks the
 * presets carry have no effect here; buttons for them would promise something
 * that never arrives. Table cells do honour marks, which is why their toolbar
 * has them and this one does not.
 *
 * The family list is the server catalogue, which is also what the loader
 * registers faces from — so anything selectable here provably has a file.
 */
const TextToolbar = () => {
  const ctx = useContext(EditorContext);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );

  const selectedIds = ctx?.selectedLayerIds ?? [];
  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const page = ctx ? ctx.pages[ctx.activePage] : undefined;
  const layer = id ? page?.layers?.[id] : undefined;
  const isText = layer?.type?.resolvedName === 'TextLayer';
  const props = (layer?.props ?? {}) as Record<string, unknown>;
  const doc = props.doc as
    | { type?: string; content?: { attrs?: Record<string, unknown> }[] }
    | undefined;
  const attrs = doc?.content?.[0]?.attrs ?? {};

  useEffect(() => {
    if (!isText) {
      setAnchor(null);
      return;
    }
    let frame = 0;
    let last = '';
    const tick = () => {
      const node = document.querySelector('[data-text-anchor="true"]');
      const rect = node?.getBoundingClientRect();
      const key = rect
        ? `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}`
        : '';
      if (key !== last) {
        last = key;
        setAnchor(
          rect ? { top: rect.top, left: rect.left + rect.width / 2 } : null,
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isText]);

  if (!ctx || !isText || !id || !anchor) return null;

  const family = primaryFamily(attrs.fontFamily) || 'Nunito';
  const catalogue = fontFamilies();
  // A layer can name a family the catalogue does not have — an older design, or
  // one imported from elsewhere. Keep it selectable rather than silently
  // rewriting the text to the first option.
  const familyOptions = catalogue.includes(family)
    ? catalogue
    : [family, ...catalogue];

  const size = String(attrs.fontSize ?? '24px');
  const sizeOptions = FONT_SIZES.includes(size)
    ? FONT_SIZES
    : [...FONT_SIZES, size].sort((a, b) => parseFloat(a) - parseFloat(b));
  const align = String(attrs.textAlign ?? 'center');

  /** Every block, so a multi-line layer keeps one family throughout. */
  const patchAttrs = (patch: Record<string, unknown>) => {
    const content = Array.isArray(doc?.content) ? doc.content : [];
    ctx.actions.updateLayerProps(id, {
      doc: {
        type: doc?.type ?? 'doc',
        content: content.map((block) => ({
          ...block,
          attrs: { ...(block.attrs ?? {}), ...patch },
        })),
      },
    });
  };

  const controlCss = {
    height: 28,
    border: '1px solid var(--app-border)',
    background: 'transparent',
    color: 'var(--app-text-strong)',
    borderRadius: 6,
    fontSize: 12,
  } as const;

  const alignCss = (value: string) => ({
    minWidth: 28,
    height: 28,
    padding: '0 6px',
    border: `1px solid ${align === value ? '#3d8eff' : 'var(--app-border)'}`,
    background: align === value ? 'rgba(61,142,255,.16)' : 'transparent',
    color: align === value ? '#3d8eff' : 'var(--app-text-strong)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
  });

  return (
    <div
      css={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        transform: 'translate(-50%, calc(-100% - 12px))',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 6,
        borderRadius: 10,
        border: '1px solid var(--app-border)',
        background: 'var(--app-panel)',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <select
        aria-label="Font family"
        title="Font"
        value={family}
        onChange={(event) => patchAttrs({ fontFamily: event.target.value })}
        css={{ ...controlCss, maxWidth: 150, padding: '0 4px', cursor: 'pointer' }}
      >
        {familyOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Font size"
        title="Size"
        value={size}
        onChange={(event) => patchAttrs({ fontSize: event.target.value })}
        css={{ ...controlCss, padding: '0 4px', cursor: 'pointer' }}
      >
        {sizeOptions.map((option) => (
          <option key={option} value={option}>
            {option.replace('px', '')}
          </option>
        ))}
      </select>
      <input
        type="color"
        aria-label="Text colour"
        title="Text colour"
        value={colorToHex(attrs.color, '#111111')}
        onChange={(event) => patchAttrs({ color: event.target.value })}
        css={{
          ...controlCss,
          width: 28,
          padding: 0,
          cursor: 'pointer',
        }}
      />
      <span css={{ width: 1, height: 18, background: 'var(--app-border)' }} />
      {(['left', 'center', 'right'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`Align ${value}`}
          title={`Align ${value}`}
          css={alignCss(value)}
          onClick={() => patchAttrs({ textAlign: value })}
        >
          {value === 'left' ? 'L' : value === 'center' ? 'C' : 'R'}
        </button>
      ))}
    </div>
  );
};

/**
 * Floating editor for the selected QR code.
 *
 * Same anchoring approach as `CellToolbar`: it reads the selected layer's live
 * bounding rect each frame, so it follows the layer and the zoom with no
 * coordinate maths of its own.
 */
const QrToolbar = () => {
  const ctx = useContext(EditorContext);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [exporting, setExporting] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const selectedIds = ctx?.selectedLayerIds ?? [];
  const qrId = selectedIds.length === 1 ? selectedIds[0] : null;
  const page = ctx ? ctx.pages[ctx.activePage] : undefined;
  const layer = qrId ? page?.layers?.[qrId] : undefined;
  const isQr = layer?.type?.resolvedName === 'QrCodeLayer';
  const props = (layer?.props ?? {}) as Record<string, unknown>;
  const level = readErrorLevel(props.errorCorrectionLevel);
  /** A logo covers modules that only `Q` and `H` keep recoverable. */
  const logoNeedsMore = !!props.logo && (level === 'L' || level === 'M');

  useEffect(() => {
    if (!isQr) {
      setAnchor(null);
      return;
    }
    let frame = 0;
    let last = '';
    const tick = () => {
      const node = document.querySelector('[data-qr-anchor="true"]');
      const rect = node?.getBoundingClientRect();
      const key = rect
        ? `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}`
        : '';
      if (key !== last) {
        last = key;
        setAnchor(
          rect ? { top: rect.top, left: rect.left + rect.width / 2 } : null,
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isQr]);

  // Seed the field when a different QR is selected.
  const layerText = isQr ? String(props.text ?? '') : '';
  useEffect(() => {
    setDraft(layerText);
  }, [qrId, layerText]);

  if (!ctx || !isQr || !qrId || !anchor) return null;

  /** Hand the code over as a real SVG file, logo and all. */
  const downloadSvg = () => {
    if (exporting) return;
    setExporting(true);
    buildQrSvg(
      String(props.text ?? ''),
      String(props.bgColor ?? '#ffffff'),
      String(props.textColor ?? '#1e1e2d'),
      props.logo ? String(props.logo) : undefined,
      level,
    )
      .then((svg) => {
        downloadBlob('qr-code.svg', new Blob([svg], { type: 'image/svg+xml' }));
      })
      .catch(() => undefined)
      .finally(() => setExporting(false));
  };

  const controlCss = {
    height: 28,
    border: '1px solid var(--app-border)',
    background: 'transparent',
    color: 'var(--app-text-strong)',
    borderRadius: 6,
    fontSize: 12,
  } as const;

  return (
    <div
      css={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        transform: 'translate(-50%, calc(-100% - 12px))',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 6,
        borderRadius: 10,
        border: '1px solid var(--app-border)',
        background: 'var(--app-panel)',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        aria-label="QR destination"
        placeholder="https://example.com"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => ctx.actions.updateLayerProps(qrId, { text: draft.trim() || ' ' })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            ctx.actions.updateLayerProps(qrId, { text: draft.trim() || ' ' });
          }
        }}
        css={{ ...controlCss, width: 230, padding: '0 8px' }}
      />
      <input
        type="color"
        aria-label="QR dark colour"
        title="QR colour"
        value={colorToHex(props.textColor, '#1e1e2d')}
        onChange={(event) =>
          ctx.actions.updateLayerProps(qrId, { textColor: event.target.value })
        }
        css={{ ...controlCss, width: 28, padding: 0, cursor: 'pointer' }}
      />
      <input
        type="color"
        aria-label="QR light colour"
        title="QR background"
        value={colorToHex(props.bgColor, '#ffffff')}
        onChange={(event) =>
          ctx.actions.updateLayerProps(qrId, { bgColor: event.target.value })
        }
        css={{ ...controlCss, width: 28, padding: 0, cursor: 'pointer' }}
      />
      <span css={{ width: 1, height: 18, background: 'var(--app-border)' }} />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        aria-label="QR logo file"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const result =
              typeof reader.result === 'string' ? reader.result : '';
            if (result) ctx.actions.updateLayerProps(qrId, { logo: result });
          };
          reader.readAsDataURL(file);
        }}
      />
      <button
        type="button"
        title="Put your own icon in the middle"
        onClick={() => logoInputRef.current?.click()}
        css={{
          height: 28,
          padding: '0 10px',
          border: '1px solid var(--app-border)',
          background: 'transparent',
          color: 'var(--app-text-strong)',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Logo
      </button>
      {props.logo ? (
        <button
          type="button"
          title="Remove the icon"
          onClick={() => ctx.actions.updateLayerProps(qrId, { logo: '' })}
          css={{
            height: 28,
            padding: '0 10px',
            border: '1px solid var(--app-border)',
            background: 'transparent',
            color: 'var(--app-text-muted)',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            ':hover': { color: '#ff8f8f', borderColor: '#ff8f8f' },
          }}
        >
          Clear
        </button>
      ) : null}
      <span css={{ width: 1, height: 18, background: 'var(--app-border)' }} />
      <select
        aria-label="QR error correction"
        title={
          logoNeedsMore
            ? 'An icon needs Q or H to stay readable'
            : 'How much damage the code tolerates'
        }
        value={level}
        onChange={(event) =>
          ctx.actions.updateLayerProps(qrId, {
            errorCorrectionLevel: readErrorLevel(event.target.value),
          })
        }
        css={{
          ...controlCss,
          padding: '0 4px',
          cursor: 'pointer',
          borderColor: logoNeedsMore ? '#ff8f8f' : 'var(--app-border)',
        }}
      >
        {QR_ERROR_LEVELS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="Download this code as an SVG"
        onClick={downloadSvg}
        disabled={exporting}
        css={{
          height: 28,
          padding: '0 10px',
          border: '1px solid var(--app-border)',
          background: 'transparent',
          color: 'var(--app-text-strong)',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          ':disabled': { opacity: 0.5, cursor: 'progress' },
        }}
      >
        SVG
      </button>
    </div>
  );
};

/**
 * Freehand drawings are stored as an `SvgLayer` whose `image` is an inline SVG
 * holding a single stroked `<path>`. Colour and weight therefore live *inside*
 * that string, so editing either means rebuilding it.
 */
const parseDrawSvg = (image: unknown) => {
  if (typeof image !== 'string' || !image.startsWith('data:image/svg+xml')) {
    return null;
  }
  const svg = image.slice(image.indexOf(',') + 1);
  const d = /<path d="([^"]*)"/.exec(svg)?.[1];
  if (!d) return null;
  return {
    d,
    stroke: decodeURIComponent(/stroke="([^"]*)"/.exec(svg)?.[1] ?? '#000000'),
    strokeWidth: Number(/stroke-width="([^"]*)"/.exec(svg)?.[1] ?? 4) || 4,
  };
};

/** Mirrors the shape `addDrawLayer` writes, so a redraw is byte-compatible. */
const buildDrawSvg = (d: string, stroke: string, strokeWidth: number) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="${encodeURIComponent(
    stroke,
  )}" stroke-width="${strokeWidth}" stroke-linecap="round"/></svg>`;

/** Floating editor for a selected freehand drawing: stroke colour and weight. */
const DrawToolbar = () => {
  const ctx = useContext(EditorContext);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [width, setWidth] = useState('4');

  const selectedIds = ctx?.selectedLayerIds ?? [];
  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const page = ctx ? ctx.pages[ctx.activePage] : undefined;
  const layer = id ? page?.layers?.[id] : undefined;
  const props = (layer?.props ?? {}) as Record<string, unknown>;
  const draw =
    layer?.type?.resolvedName === 'SvgLayer' ? parseDrawSvg(props.image) : null;
  const hasDraw = !!draw;

  useEffect(() => {
    if (!hasDraw) {
      setAnchor(null);
      return;
    }
    let frame = 0;
    let last = '';
    const tick = () => {
      const node = document.querySelector('[data-draw-anchor="true"]');
      const rect = node?.getBoundingClientRect();
      const key = rect
        ? `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}`
        : '';
      if (key !== last) {
        last = key;
        setAnchor(
          rect ? { top: rect.top, left: rect.left + rect.width / 2 } : null,
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [hasDraw]);

  const stroke = draw?.stroke ?? '#000000';
  const strokeWidth = draw?.strokeWidth ?? 4;
  useEffect(() => {
    setWidth(String(strokeWidth));
  }, [id, strokeWidth]);

  if (!ctx || !draw || !id || !anchor) return null;

  const apply = (patch: { stroke?: string; strokeWidth?: number }) => {
    ctx.actions.updateLayerProps(id, {
      image: buildDrawSvg(
        draw.d,
        patch.stroke ?? stroke,
        patch.strokeWidth ?? strokeWidth,
      ),
    });
  };

  const controlCss = {
    height: 28,
    border: '1px solid var(--app-border)',
    background: 'transparent',
    color: 'var(--app-text-strong)',
    borderRadius: 6,
    fontSize: 12,
  } as const;

  const commitWidth = () => {
    const next = Math.min(80, Math.max(1, Number(width) || strokeWidth));
    if (next !== strokeWidth) apply({ strokeWidth: next });
  };

  return (
    <div
      css={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        transform: 'translate(-50%, calc(-100% - 12px))',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 6,
        borderRadius: 10,
        border: '1px solid var(--app-border)',
        background: 'var(--app-panel)',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        type="color"
        aria-label="Stroke colour"
        title="Stroke colour"
        value={colorToHex(stroke, '#000000')}
        onChange={(event) => apply({ stroke: event.target.value })}
        css={{ ...controlCss, width: 28, padding: 0, cursor: 'pointer' }}
      />
      <input
        type="number"
        min={1}
        max={80}
        aria-label="Stroke width"
        title="Stroke width"
        value={width}
        onChange={(event) => setWidth(event.target.value)}
        onBlur={commitWidth}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitWidth();
          }
        }}
        css={{ ...controlCss, width: 56, padding: '0 6px' }}
      />
      <span css={{ fontSize: 11, color: 'var(--app-text-muted)' }}>px</span>
    </div>
  );
};

const PageCanvas = ({ page }: { page?: SerializedPage }) => {
  if (!page?.layers?.ROOT) return null;
  return <LayerView layerId="ROOT" layers={page.layers} />;
};

/**
 * The editing surface.
 *
 * `initialPages` and `readOnly` exist for the share view, which renders somebody
 * else's design with no account and no way to change it. Both are opt-in: with
 * neither set, the editor boots from the local library exactly as before.
 */
export const Editor = ({
  children,
  initialPages,
  initialName,
  readOnly = false,
}: {
  config?: unknown;
  getFonts?: (query: GetFontQuery) => Promise<unknown>;
  uploadImage?: (file: File) => Promise<{ url: string; thumb: string }>;
  children?: ReactNode;
  /** Open these pages instead of the local library. */
  initialPages?: SerializedPage[];
  /** Display name for `initialPages`. */
  initialName?: string;
  /** Refuse every change: no selection, no edits, no saving. */
  readOnly?: boolean;
}) => {
  const boot = useRef(
    initialPages
      ? {
          pages: clonePages(initialPages),
          currentDesign: {
            // Never a real id: nothing may resolve this back to a design the
            // viewer could then try to load or overwrite.
            id: 'shared-preview',
            name: initialName?.trim() || 'Shared design',
            updatedAt: Date.now(),
          } satisfies DesignSummary,
          designs: [],
        }
      : bootstrapEditor(),
  ).current;
  const [pages, setPagesState] = useState<SerializedPage[]>(boot.pages);
  const [activePage, setActivePage] = useState(0);
  const [scale, setScale] = useState(0.43);
  const [sidebar, setSidebarState] = useState<string | undefined>();
  const [selectedLayerIds, setSelectedLayerIdsState] = useState<string[]>([]);
  const [editingLayerId, setEditingLayerIdState] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<TableCellRef | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [dirty, setDirty] = useState(false);
  /**
   * Read-only is enforced at the three setters that carry every change, rather
   * than at each of the forty-odd actions that reach them.
   *
   * All content mutations end at `setPages`, and all selection and text entry
   * end at the other two, so refusing at these points is what makes the rest of
   * the editor safe to leave untouched: a pointer handler can call whatever it
   * likes and nothing moves. Gating each action instead would be a long list to
   * keep complete, and the one that got missed would be the bug.
   */
  const setPages = readOnly
    ? (() => undefined) as Dispatch<SetStateAction<SerializedPage[]>>
    : setPagesState;
  const setSelectedLayerIds = readOnly
    ? (() => undefined) as Dispatch<SetStateAction<string[]>>
    : setSelectedLayerIdsState;
  const setEditingLayerId = readOnly
    ? (() => undefined) as Dispatch<SetStateAction<string | null>>
    : setEditingLayerIdState;
  // Measurement aids, restored from the last session.
  const bootView = useRef(readCanvasView()).current;
  const [showRulers, setShowRulers] = useState(bootView.showRulers ?? false);
  const [showGrid, setShowGrid] = useState(bootView.showGrid ?? false);
  const [gridSize, setGridSize] = useState(bootView.gridSize ?? 20);

  useEffect(() => {
    // A reader of a shared design gets no say in the owner's editor settings:
    // the preference is stored under the same origin, so writing it here would
    // change what the owner sees next time they open the editor.
    if (readOnly) return;
    try {
      localStorage.setItem(
        CANVAS_VIEW_KEY,
        JSON.stringify({ showRulers, showGrid, gridSize }),
      );
    } catch {
      // A browser that refuses storage just loses the preference.
    }
  }, [showRulers, showGrid, gridSize, readOnly]);
  const [currentDesign, setCurrentDesign] = useState<DesignSummary | null>(
    boot.currentDesign,
  );
  const [designs, setDesigns] = useState<DesignSummary[]>(boot.designs);
  const past = useRef<SerializedPage[][]>([]);
  const future = useRef<SerializedPage[][]>([]);
  const pendingUndo = useRef<SerializedPage[] | null>(null);
  const pagesRef = useRef(pages);
  const activePageRef = useRef(activePage);
  const textDraftRef = useRef<{ id: string; text: string } | null>(null);
  const editingLayerIdRef = useRef<string | null>(null);
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentDesignRef = useRef(currentDesign);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);
  useEffect(() => {
    editingLayerIdRef.current = editingLayerId;
  }, [editingLayerId]);
  useEffect(() => {
    currentDesignRef.current = currentDesign;
  }, [currentDesign]);

  const refreshDesignList = useCallback(() => {
    setDesigns(listDesignSummaries());
  }, []);

  const loadDesignPages = useCallback((nextPages: SerializedPage[]) => {
    const cloned = clonePages(nextPages);
    pagesRef.current = cloned;
    setPages(cloned);
    setActivePage(0);
    setSelectedLayerIds([]);
    setEditingLayerId(null);
    textDraftRef.current = null;
    activeTextareaRef.current = null;
    past.current = [];
    future.current = [];
  }, []);

  const flushTextDraft = useCallback(() => {
    const id = editingLayerIdRef.current ?? textDraftRef.current?.id;
    if (!id) return;
    // Prefer live DOM value so click-out never loses the last keystrokes.
    const text =
      activeTextareaRef.current?.value ?? textDraftRef.current?.text;
    if (typeof text !== 'string') return;
    const next = clonePages(pagesRef.current);
    const page = next[activePageRef.current];
    const layer = page?.layers?.[id];
    if (!layer) return;
    layer.props = {
      ...layer.props,
      doc: buildTextDoc(layer.props.doc, text),
    };
    pagesRef.current = next;
    setPages(next);
    textDraftRef.current = { id, text };
  }, []);

  const persistCurrent = useCallback(() => {
    // The choke point for saving. Every caller — autosave, Save, switching
    // design, importing — passes through here, so a read-only viewer cannot
    // write to the library or upload, whichever route it reaches from.
    if (readOnly) return null;
    flushTextDraft();
    const saved = saveActiveDesignPages(pagesRef.current);
    if (saved) {
      const summary = {
        id: saved.id,
        name: saved.name,
        updatedAt: saved.updatedAt,
      };
      setCurrentDesign(summary);
      currentDesignRef.current = summary;
      refreshDesignList();

      // Refresh the gallery preview in the background. Deliberately not
      // awaited: saving stays synchronous, and a failed capture must never
      // surface as a failed save.
      const pageIndex = activePageRef.current;
      const size = pageSizeOf(pagesRef.current[pageIndex]);
      if (size) {
        void captureThumbnail(pageIndex, size)
          .then((thumbnail) => {
            if (thumbnail) setDesignThumbnail(saved.id, thumbnail);
          })
          .catch(() => {
            /* a preview is best-effort */
          });
      }
    }
    return saved;
  }, [flushTextDraft, refreshDesignList, readOnly]);

  /** Any change to the pages means there is something autosave has to persist. */
  const markDirty = useCallback(() => setDirty(true), []);

  const commit = useCallback(
    (next: SerializedPage[]) => {
      past.current.push(clonePages(pagesRef.current));
      future.current = [];
      pagesRef.current = next;
      setPages(next);
      markDirty();
    },
    [markDirty],
  );

  const patchLayerLive = useCallback(
    (layerId: string, box: { position: Point; boxSize: PageSize }) => {
      const next = clonePages(pagesRef.current);
      const page = next[activePageRef.current];
      const layer = page?.layers?.[layerId];
      if (!layer) return;
      layer.props = {
        ...layer.props,
        position: box.position,
        boxSize: {
          ...(layer.props.boxSize as object),
          ...box.boxSize,
        },
      };
      pagesRef.current = next;
      setPages(next);
      markDirty();
    },
    [markDirty],
  );

  const patchLayerText = useCallback(
    (layerId: string, text: string) => {
      // Draft only while editing — pages update on flush/commit. Typing still
      // counts as an unsaved change so autosave picks it up once editing ends.
      textDraftRef.current = { id: layerId, text };
      markDirty();
    },
    [markDirty],
  );

  /**
   * Autosave.
   *
   * A short quiet period after the last edit persists the design, and the design
   * library then uploads it. Deliberately paused while a text layer is being
   * edited, because persisting flushes the draft out of the textarea and that
   * must never happen under the caret. The flush on blur/Escape restarts it.
   */
  useEffect(() => {
    // `persistCurrent` refuses in read-only too; this only avoids arming a timer
    // that could never do anything.
    if (readOnly || !dirty || editingLayerId) return;
    const timer = window.setTimeout(() => {
      persistCurrent();
      setDirty(false);
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [dirty, editingLayerId, pages, persistCurrent, readOnly]);

  /** Commit a shallow patch onto a layer's props — undoable and saved. */
  const patchLayerProps = useCallback(
    (layerId: string, patch: Record<string, unknown>) => {
      const next = clonePages(pagesRef.current);
      const page = next[activePageRef.current];
      const layer = page?.layers?.[layerId];
      if (!layer) return;
      layer.props = { ...layer.props, ...patch };
      commit(next);
    },
    [commit],
  );

  /**
   * Apply a change to one table cell.
   *
   * Committed through `commit`, so cell edits join the undo history and are
   * saved with the design like any other change.
   */
  const patchTableCell = useCallback(
    (layerId: string, row: number, col: number, patch: TableCellPatch) => {
      const next = clonePages(pagesRef.current);
      const page = next[activePageRef.current];
      const layer = page?.layers?.[layerId];
      if (!layer) return;

      const props = layer.props as Record<string, unknown>;
      const cells = Array.isArray(props.cells)
        ? ([...props.cells] as Record<string, unknown>[])
        : [];
      const index = cells.findIndex(
        (cell) => Number(cell.row) === row && Number(cell.col) === col,
      );
      if (index < 0) return;

      const cell: Record<string, unknown> = { ...cells[index] };

      // Text only: rebuild the doc so paragraph attrs are preserved.
      if (patch.text !== undefined) {
        cell.value = buildTextDoc(cell.value, patch.text);
      }

      if (patch.attrs || patch.marks) {
        type Block = {
          type?: string;
          attrs?: Record<string, unknown>;
          content?: Record<string, unknown>[];
        };
        const value = cell.value as { content?: Block[] } | undefined;
        const content: Block[] = Array.isArray(value?.content)
          ? value.content.map((block) => ({ ...block }))
          : [];
        const block: Block = content[0] ?? { type: 'paragraph', content: [] };

        if (patch.attrs) {
          block.attrs = { ...(block.attrs ?? {}), ...patch.attrs };
        }

        if (patch.marks) {
          const nodes = Array.isArray(block.content) ? block.content : [];
          block.content = nodes.map((node) => {
            const marks = Array.isArray(node.marks)
              ? (node.marks as { type?: string }[]).filter(
                  (mark) =>
                    !(patch.marks?.bold !== undefined && mark.type === 'bold') &&
                    !(patch.marks?.italic !== undefined && mark.type === 'italic'),
                )
              : [];
            if (patch.marks?.bold) marks.push({ type: 'bold' });
            if (patch.marks?.italic) marks.push({ type: 'italic' });
            return { ...node, marks };
          });
        }

        content[0] = block;
        cell.value = { ...(value ?? {}), content };
      }

      if (patch.background !== undefined) {
        cell.background = patch.background;
      }

      cells[index] = cell;
      layer.props = { ...props, cells };
      commit(next);
    },
    [commit],
  );

  // A cell selection is only meaningful while its owning layer stays selected.
  useEffect(() => {
    if (!selectedCell) return;
    if (!selectedLayerIds.includes(selectedCell.layerId)) {
      setSelectedCell(null);
    }
  }, [selectedCell, selectedLayerIds]);

  const actions = useMemo<EditorActions>(() => {
    const addTree = (tree: SerializedLayerTree) => {
      const next = mergeLayers(
        pagesRef.current,
        activePageRef.current,
        tree.layers,
        tree.rootId,
      );
      commit(next);
      setSelectedLayerIds([tree.rootId]);
    };

    const addSingle = (
      resolvedName: string,
      props: Record<string, unknown>,
      id = uuid(),
    ) => {
      const layer: SerializedLayer = {
        type: { resolvedName },
        props,
        locked: false,
        parent: 'ROOT',
        child: [],
      };
      addTree({ rootId: id, layers: { [id]: layer } });
    };

    const addTrees = (trees: SerializedLayerTree[]) => {
      if (!trees.length) return;
      let next = pagesRef.current;
      for (const tree of trees) {
        next = mergeLayers(next, activePageRef.current, tree.layers, tree.rootId);
      }
      commit(next);
      setSelectedLayerIds(trees.map((tree) => tree.rootId));
    };

    return {
      addVideoLayer: (media, size) => {
        const page = pageSizeOf(pagesRef.current[activePageRef.current]);
        const fitted = fitToPage(size, page);
        addSingle('VideoLayer', {
          ...media,
          boxSize: fitted,
          position: { x: 80, y: 80 },
          rotate: 0,
        });
      },
      addTextLayer: addTree,
      addImageLayer: (media, size) => {
        const page = pageSizeOf(pagesRef.current[activePageRef.current]);
        const fitted = fitToPage(size, page);
        addSingle('ImageLayer', {
          image: media,
          boxSize: fitted,
          position: {
            x: Math.max(40, (page.width - fitted.width) / 2),
            y: Math.max(40, (page.height - fitted.height) / 2),
          },
          rotate: 0,
        });
      },
      addSvgLayer: (url, size) => {
        const page = pageSizeOf(pagesRef.current[activePageRef.current]);
        const fitted = fitToPage(size, page);
        addSingle('SvgLayer', {
          image: url,
          boxSize: fitted,
          position: { x: 80, y: 80 },
          rotate: 0,
          colors: [],
        });
      },
      addShapeLayer: (layer) => addSingle(layer.type.resolvedName, layer.props),
      addLineLayer: ({ props }) =>
        addSingle('LineLayer', {
          style: 'solid',
          arrowStart: 'none',
          arrowEnd: 'none',
          color: 'rgb(94, 98, 120)',
          boxSize: { width: 400, height: 4 },
          position: { x: 80, y: 80 },
          rotate: 0,
          ...props,
        }),
      addFrameLayer: (frame, clipPath) => {
        const page = pageSizeOf(pagesRef.current[activePageRef.current]);
        const fitted = fitToPage(
          { width: frame.width, height: frame.height },
          page,
        );
        addSingle('FrameLayer', {
          clipPath,
          image: { url: frame.img, thumb: frame.img },
          boxSize: fitted,
          position: { x: 80, y: 80 },
          rotate: 0,
        });
      },
      addDrawLayer: (draw, size, position, layerScale, transparency) =>
        addSingle('SvgLayer', {
          image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><path d="${draw.path}" fill="none" stroke="${encodeURIComponent(draw.color)}" stroke-width="${draw.width}" stroke-linecap="round"/></svg>`,
          boxSize: size,
          position,
          rotate: 0,
          scale: layerScale,
          transparency,
        }),
      addLayer: (layer) => addSingle(layer.type.resolvedName, layer.props),
      addLayerTree: addTree,
      addLayerTrees: addTrees,
      startDragNDrop: (payload) => addTree(payload.data),
      setPage: (index, page) => {
        const next = clonePages(pagesRef.current);
        next[index] = clonePages([page])[0];
        setActivePage(index);
        commit(next);
      },
      setData: (nextPages) => {
        flushTextDraft();
        past.current.push(clonePages(pagesRef.current));
        future.current = [];
        const cloned = clonePages(nextPages);
        pagesRef.current = cloned;
        setPages(cloned);
        setActivePage(0);
        setSelectedLayerIds([]);
        setEditingLayerId(null);
        textDraftRef.current = null;
        activeTextareaRef.current = null;
      },
      setSidebar: (name) => setSidebarState(name),
      selectLayers: (ids) => {
        const editing = editingLayerIdRef.current;
        if (editing && !ids.includes(editing)) {
          flushTextDraft();
          textDraftRef.current = null;
          activeTextareaRef.current = null;
        }
        setSelectedLayerIds(ids);
        setEditingLayerId((current) =>
          current && ids.includes(current) ? current : null,
        );
      },
      setGuides,
      beginInteraction: () => {
        pendingUndo.current = clonePages(pagesRef.current);
      },
      endInteraction: () => {
        const before = pendingUndo.current;
        pendingUndo.current = null;
        if (!before) return;
        past.current.push(before);
        future.current = [];
      },
      alignLayers: (ids, kind) => {
        const boxes = layerBoxes(pagesRef.current, activePageRef.current, ids);
        if (!boxes.length) return;
        // One layer means "align to page", more than one means "align to selection".
        const pageSize = pageSizeOf(pagesRef.current[activePageRef.current]);
        const frame =
          boxes.length > 1
            ? {
                x: Math.min(...boxes.map((b) => b.x)),
                y: Math.min(...boxes.map((b) => b.y)),
                width:
                  Math.max(...boxes.map((b) => b.x + b.width)) -
                  Math.min(...boxes.map((b) => b.x)),
                height:
                  Math.max(...boxes.map((b) => b.y + b.height)) -
                  Math.min(...boxes.map((b) => b.y)),
              }
            : { x: 0, y: 0, width: pageSize.width, height: pageSize.height };

        const next = clonePages(pagesRef.current);
        const layers = next[activePageRef.current]?.layers;
        if (!layers) return;
        for (const box of boxes) {
          const layer = layers[box.id];
          if (!layer) continue;
          let { x, y } = box;
          if (kind === 'left') x = frame.x;
          else if (kind === 'centre') x = frame.x + (frame.width - box.width) / 2;
          else if (kind === 'right') x = frame.x + frame.width - box.width;
          else if (kind === 'top') y = frame.y;
          else if (kind === 'middle') y = frame.y + (frame.height - box.height) / 2;
          else y = frame.y + frame.height - box.height;
          layer.props = { ...layer.props, position: { x, y } };
        }
        commit(next);
      },
      distributeLayers: (ids, axis) => {
        const boxes = layerBoxes(pagesRef.current, activePageRef.current, ids);
        // Two layers have no gap to even out; the extremes stay where they are.
        if (boxes.length < 3) return;
        const horizontal = axis === 'horizontal';
        const sorted = [...boxes].sort((a, b) =>
          horizontal ? a.x - b.x : a.y - b.y,
        );
        const size = (b: LayerBox) => (horizontal ? b.width : b.height);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const start = horizontal ? first.x : first.y;
        const end = horizontal ? last.x + last.width : last.y + last.height;
        const gap =
          (end - start - sorted.reduce((sum, b) => sum + size(b), 0)) /
          (sorted.length - 1);

        const next = clonePages(pagesRef.current);
        const layers = next[activePageRef.current]?.layers;
        if (!layers) return;
        let cursor = start;
        for (const box of sorted) {
          const layer = layers[box.id];
          if (layer) {
            layer.props = {
              ...layer.props,
              position: {
                x: horizontal ? cursor : box.x,
                y: horizontal ? box.y : cursor,
              },
            };
          }
          cursor += size(box) + gap;
        }
        commit(next);
      },
      setEditingLayer: (id) => {
        if (!id) {
          flushTextDraft();
          textDraftRef.current = null;
          activeTextareaRef.current = null;
        }
        setEditingLayerId(id);
      },
      goToPage: (index) => {
        const total = pagesRef.current.length;
        if (total === 0) return;
        const nextIndex = Math.max(0, Math.min(total - 1, index));
        if (nextIndex === activePageRef.current) return;
        flushTextDraft();
        setSelectedLayerIds([]);
        setEditingLayerId(null);
        textDraftRef.current = null;
        activeTextareaRef.current = null;
        setActivePage(nextIndex);
      },
      addPage: () => {
        flushTextDraft();
        // A new page matches the design it is going into. This used to append a
        // fixed 1640×924 page, so adding a page to a portrait design handed you
        // a landscape one and the design quietly became mixed-size.
        const size = pageSizeOf(pagesRef.current[activePageRef.current]);
        const next = [...clonePages(pagesRef.current), createBlankPage(size)];
        commit(next);
        setSelectedLayerIds([]);
        setEditingLayerId(null);
        setActivePage(next.length - 1);
      },
      duplicatePage: (index) => {
        flushTextDraft();
        const sourceIndex = index ?? activePageRef.current;
        const source = pagesRef.current[sourceIndex];
        if (!source) return;
        const next = clonePages(pagesRef.current);
        next.splice(sourceIndex + 1, 0, clonePages([source])[0]);
        commit(next);
        setSelectedLayerIds([]);
        setEditingLayerId(null);
        setActivePage(sourceIndex + 1);
      },
      deletePage: (index) => {
        if (pagesRef.current.length <= 1) return;
        flushTextDraft();
        const removeIndex = index ?? activePageRef.current;
        const next = clonePages(pagesRef.current);
        next.splice(removeIndex, 1);
        commit(next);
        setSelectedLayerIds([]);
        setEditingLayerId(null);
        setActivePage(Math.min(removeIndex, next.length - 1));
      },
      updateLayerBox: patchLayerLive,
      updateLayerText: patchLayerText,
      updateLayerProps: patchLayerProps,
      setSelectedCell,
      updateTableCell: patchTableCell,
      registerTextInput: (el) => {
        activeTextareaRef.current = el;
      },
      deleteLayers: (ids = selectedLayerIds) => {
        if (!ids.length) return;
        flushTextDraft();
        const next = clonePages(pagesRef.current);
        const layers = next[activePageRef.current]?.layers;
        if (!layers) return;
        for (const id of ids) removeLayerTree(layers, id);
        commit(next);
        setSelectedLayerIds([]);
        setEditingLayerId(null);
        textDraftRef.current = null;
        activeTextareaRef.current = null;
      },
      saveDesign: () => {
        persistCurrent();
      },
      newDesign: (name) => {
        persistCurrent();
        const created = createDesignInLibrary(createBlankPages(), name);
        loadDesignPages(created.pages);
        const summary = {
          id: created.id,
          name: created.name,
          updatedAt: created.updatedAt,
        };
        setCurrentDesign(summary);
        currentDesignRef.current = summary;
        refreshDesignList();
      },
      openDesign: (id) => {
        if (currentDesignRef.current?.id === id) return;
        persistCurrent();
        const opened = openDesignInLibrary(id);
        if (!opened) return;
        loadDesignPages(opened.pages);
        const summary = {
          id: opened.id,
          name: opened.name,
          updatedAt: opened.updatedAt,
        };
        setCurrentDesign(summary);
        currentDesignRef.current = summary;
        refreshDesignList();
      },
      renameDesign: (id, name) => {
        const renamed = renameDesignInLibrary(id, name);
        if (!renamed) return;
        if (currentDesignRef.current?.id === id) {
          setCurrentDesign(renamed);
          currentDesignRef.current = renamed;
        }
        refreshDesignList();
      },
      duplicateDesign: (id) => {
        persistCurrent();
        const copy = duplicateDesignInLibrary(id);
        if (!copy) return;
        loadDesignPages(copy.pages);
        const summary = {
          id: copy.id,
          name: copy.name,
          updatedAt: copy.updatedAt,
        };
        setCurrentDesign(summary);
        currentDesignRef.current = summary;
        refreshDesignList();
      },
      deleteDesign: (id) => {
        const wasActive = currentDesignRef.current?.id === id;
        if (wasActive) persistCurrent();
        const result = deleteDesignInLibrary(id);
        if (!result.removed || !result.active) {
          refreshDesignList();
          return;
        }
        if (wasActive) {
          loadDesignPages(result.active.pages);
          const summary = {
            id: result.active.id,
            name: result.active.name,
            updatedAt: result.active.updatedAt,
          };
          setCurrentDesign(summary);
          currentDesignRef.current = summary;
        }
        refreshDesignList();
      },
      importDesignFile: (nextPages, name) => {
        persistCurrent();
        const created = createDesignInLibrary(nextPages, name);
        loadDesignPages(created.pages);
        const summary = {
          id: created.id,
          name: created.name,
          updatedAt: created.updatedAt,
        };
        setCurrentDesign(summary);
        currentDesignRef.current = summary;
        refreshDesignList();
      },
      history: {
        undo: () => {
          const prev = past.current.pop();
          if (!prev) return;
          future.current.push(clonePages(pagesRef.current));
          pagesRef.current = prev;
          setPages(prev);
        },
        redo: () => {
          const next = future.current.pop();
          if (!next) return;
          past.current.push(clonePages(pagesRef.current));
          pagesRef.current = next;
          setPages(next);
        },
      },
    };
  }, [
    commit,
    flushTextDraft,
    loadDesignPages,
    patchLayerLive,
    patchLayerText,
    patchLayerProps,
    patchTableCell,
    persistCurrent,
    refreshDesignList,
    selectedLayerIds,
  ]);

  const query = useMemo<EditorQuery>(
    () => ({
      serialize: () => clonePages(pagesRef.current),
      getPageSize: (pageIndex) => pageSizeOf(pagesRef.current[pageIndex]),
      activePage: () => activePageRef.current,
      listDesigns: () => listDesignSummaries(),
      currentDesign: () => currentDesignRef.current,
      history: {
        canUndo: () => past.current.length > 0,
        canRedo: () => future.current.length > 0,
      },
    }),
    [pages, activePage, currentDesign, designs],
  );

  const value = useMemo<EditorContextValue>(
    () => ({
      pages,
      activePage,
      scale,
      sidebar,
      selectedLayerIds,
      dragNDrop: null,
      editingLayerId,
      selectedCell,
      currentDesign,
      designs,
      guides,
      dirty,
      readOnly,
      actions,
      query,
    }),
    [
      actions,
      activePage,
      currentDesign,
      designs,
      dirty,
      editingLayerId,
      guides,
      readOnly,
      selectedCell,
      pages,
      query,
      scale,
      selectedLayerIds,
      sidebar,
    ],
  );

  const canvasView: CanvasViewValue = {
    showRulers,
    setShowRulers,
    showGrid,
    setShowGrid,
    gridSize,
    setGridSize,
  };

  return (
    <EditorContext.Provider value={value}>
      <EditorScaleContext.Provider value={{ scale, setScale, setActivePage }}>
        <CanvasViewContext.Provider value={canvasView}>
          {children}
        </CanvasViewContext.Provider>
      </EditorScaleContext.Provider>
    </EditorContext.Provider>
  );
};

export function useEditor<
  T extends Record<string, unknown> = Record<string, never>,
>(selector?: (state: EditorState) => T) {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error('useEditor must be used inside <Editor>');
  }
  const selected = selector
    ? selector({
        pages: ctx.pages,
        activePage: ctx.activePage,
        scale: ctx.scale,
        sidebar: ctx.sidebar,
        selectedLayerIds: ctx.selectedLayerIds,
        dragNDrop: ctx.dragNDrop,
        dirty: ctx.dirty,
        readOnly: ctx.readOnly,
      })
    : ({} as T);
  return {
    ...selected,
    actions: ctx.actions,
    query: ctx.query,
    pages: ctx.pages,
    scale: ctx.scale,
    activePage: ctx.activePage,
    sidebar: ctx.sidebar,
    currentDesign: ctx.currentDesign,
    designs: ctx.designs,
    dirty: ctx.dirty,
    readOnly: ctx.readOnly,
  };
}

export const useSelectedLayers = () => {
  const ctx = useContext(EditorContext);
  return { selectedLayerIds: ctx?.selectedLayerIds ?? [] };
};

export const DesignFrame = ({ data }: { data?: SerializedPage[] }) => {
  const { pages, activePage, scale, actions } = useEditor();
  // Not from `useEditor()`: with no selector it returns a curated subset, and
  // `selectedLayerIds` is not in it. The type is an index signature, so asking
  // for a field that is not there compiles fine and is `undefined` at runtime.
  const { selectedLayerIds } = useSelectedLayers();
  const ctx = useContext(EditorContext);
  const scaleCtx = useContext(EditorScaleContext);
  const canvasView = useContext(CanvasViewContext);
  const showRulers = canvasView?.showRulers ?? false;
  const showGrid = canvasView?.showGrid ?? false;
  const gridSize = canvasView?.gridSize ?? 20;
  const bootstrapped = useRef(false);
  // Layer clipboard. Stored as serialized trees; re-keyed on every paste so the
  // same entry can be pasted repeatedly without id collisions.
  const clipboard = useRef<SerializedLayerTree[]>([]);
  const pasteCount = useRef(0);

  useEffect(() => {
    if (bootstrapped.current) return;
    if (data?.length && pages.length === 0) {
      actions.setData(data);
      bootstrapped.current = true;
    }
  }, [actions, data, pages.length]);

  const pasteTrees = useCallback(
    (trees: SerializedLayerTree[]) => {
      // Cascade successive pastes so copies never land exactly on the original.
      const offset = 16 * (pasteCount.current + 1);
      pasteCount.current += 1;
      actions.addLayerTrees(
        trees.map((tree) => remapLayerTree(tree, offset, offset)),
      );
    },
    [actions],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (mod && key.toLowerCase() === 's') {
        event.preventDefault();
        actions.saveDesign();
        return;
      }

      // Escape leaves text editing / clears the selection, so it must work
      // even while typing.
      if (key === 'Escape') {
        if (ctx?.editingLayerId) actions.setEditingLayer(null);
        if (ctx?.selectedCell) actions.setSelectedCell(null);
        if (ctx?.selectedLayerIds.length) actions.selectLayers([]);
        return;
      }

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing =
        tag === 'input' ||
        tag === 'textarea' ||
        target?.isContentEditable ||
        !!ctx?.editingLayerId;
      if (typing) return;

      const selected = ctx?.selectedLayerIds ?? [];
      const page = pages[activePage];

      // Measurement aids. Plain Shift+R / Shift+G, matching the usual design
      // tool bindings, and only while a text layer is not being edited.
      //
      // These sit outside the `mod` branch below on purpose: that branch is for
      // Ctrl/Cmd combinations, and Shift alone never sets `mod`.
      //
      // The updater form matters too: this handler lives in an effect whose
      // dependencies do not change when the view toggles, so reading `showGrid`
      // from the closure would read whatever it was when the effect last ran and
      // the toggle would appear to do nothing.
      if (key === 'R' || key === 'r' || key === 'G' || key === 'g') {
        if (event.shiftKey && !mod) {
          event.preventDefault();
          if (key.toLowerCase() === 'r') canvasView?.setShowRulers((value) => !value);
          else canvasView?.setShowGrid((value) => !value);
          return;
        }
      }

      if (mod) {
        const lower = key.toLowerCase();

        // Undo / redo.
        if (lower === 'z') {
          event.preventDefault();
          if (event.shiftKey) actions.history.redo();
          else actions.history.undo();
          return;
        }
        if (lower === 'y') {
          event.preventDefault();
          actions.history.redo();
          return;
        }

        // Select every top-level layer on the active page.
        if (lower === 'a') {
          event.preventDefault();
          actions.selectLayers([...(page?.layers?.ROOT?.child ?? [])]);
          return;
        }

        // Copy / cut / duplicate.
        if (lower === 'c' || lower === 'x' || lower === 'd') {
          if (!page || !selected.length) return;
          const trees = selected
            .map((id) => copyLayerTree(page.layers, id))
            .filter((tree): tree is SerializedLayerTree => Boolean(tree));
          if (!trees.length) return;
          event.preventDefault();

          if (lower === 'd') {
            // Duplicate in place, leaving the clipboard untouched.
            pasteTrees(trees);
            return;
          }

          clipboard.current = trees;
          pasteCount.current = 0;
          if (lower === 'x') actions.deleteLayers(selected);
          return;
        }

        if (lower === 'v') {
          if (!clipboard.current.length || !page) return;
          event.preventDefault();
          pasteTrees(clipboard.current);
          return;
        }

        // Zoom, matching the -/+ controls in the footer.
        if (key === '=' || key === '+') {
          event.preventDefault();
          scaleCtx?.setScale(Math.min(2, scale + 0.05));
          return;
        }
        if (key === '-' || key === '_') {
          event.preventDefault();
          scaleCtx?.setScale(Math.max(0.1, scale - 0.05));
          return;
        }
        if (key === '0') {
          event.preventDefault();
          scaleCtx?.setScale(1);
          return;
        }

        return;
      }

      if (key === 'Delete' || key === 'Backspace') {
        if (!selected.length) return;
        event.preventDefault();
        actions.deleteLayers(selected);
        return;
      }

      // Arrow keys nudge by 1px, or 10px with Shift.
      const arrows: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const nudge = arrows[key];
      if (nudge && selected.length && page) {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const next = clonePages([page])[0];
        for (const id of selected) {
          const layer = next.layers[id];
          if (!layer) continue;
          const position = (layer.props.position ?? { x: 0, y: 0 }) as Point;
          layer.props = {
            ...layer.props,
            position: {
              x: position.x + nudge.x * distance,
              y: position.y + nudge.y * distance,
            },
          };
        }
        actions.setPage(activePage, next);
        return;
      }

      // [ / ] restack the selection by one slot.
      if ((key === '[' || key === ']') && selected.length && page) {
        event.preventDefault();
        const forward = key === ']';
        const next = clonePages([page])[0];

        // Siblings must move in order of travel, or they leapfrog each other.
        const slots = selected
          .map((id) => {
            const layer = next.layers[id];
            if (!layer) return null;
            const parentId =
              layer.parent && next.layers[layer.parent] ? layer.parent : 'ROOT';
            const index = next.layers[parentId]?.child.indexOf(id) ?? -1;
            return index < 0 ? null : { id, parentId, index };
          })
          .filter((slot): slot is { id: string; parentId: string; index: number } =>
            Boolean(slot),
          );
        const sharedParent =
          slots.length > 0 && slots.every((s) => s.parentId === slots[0].parentId);
        const order = sharedParent
          ? [...slots]
              .sort((a, b) => (forward ? b.index - a.index : a.index - b.index))
              .map((slot) => slot.id)
          : selected;

        let moved = false;
        for (const id of order) {
          if (moveLayerInParent(next.layers, id, forward)) moved = true;
        }
        if (moved) actions.setPage(activePage, next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, activePage, ctx, pages, pasteTrees, scale, scaleCtx]);

  const rendered = pages.length ? pages : (data ?? []);
  const page = rendered[activePage] ?? rendered[0];
  const size = pageSizeOf(page);
  const guides = ctx?.guides ?? [];

  // The union of the selected layers' boxes, in page units, so the rulers can
  // shade the extent of what is selected the way a design tool does.
  const selectionBox = ((): SelectionBox | null => {
    const boxes = layerBoxes(pages, activePage, selectedLayerIds);
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((item) => item.x));
    const top = Math.min(...boxes.map((item) => item.y));
    const right = Math.max(...boxes.map((item) => item.x + item.width));
    const bottom = Math.max(...boxes.map((item) => item.y + item.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  })();

  return (
    <div
      css={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {showRulers && (
        <div css={{ display: 'flex', flexShrink: 0 }}>
          {/* A corner to keep the two strips from meeting at a seam. */}
          <div
            css={{
              width: RULER_THICKNESS,
              height: RULER_THICKNESS,
              flexShrink: 0,
              background: 'var(--app-ruler-bg)',
              borderRight: '1px solid var(--app-border)',
              borderBottom: '1px solid var(--app-border)',
            }}
          />
          <RulerStrip
            axis="x"
            scale={scale}
            pageSize={size}
            selection={selectionBox}
            pageId={`lidojs-page-${activePage}`}
          />
        </div>
      )}
      <div css={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        {showRulers && (
          <RulerStrip
            axis="y"
            scale={scale}
            pageSize={size}
            selection={selectionBox}
            pageId={`lidojs-page-${activePage}`}
          />
        )}
        <div
          css={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            minWidth: 0,
            padding: 24,
          }}
          onPointerDown={() => {
            actions.selectLayers([]);
            actions.setEditingLayer(null);
          }}
        >
          <div
            id={`lidojs-page-${activePage}`}
            css={{
              width: size.width * scale,
              height: size.height * scale,
              boxShadow: 'var(--app-canvas-shadow)',
              background: '#fff',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              css={{
                width: size.width,
                height: size.height,
                position: 'relative',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <PageCanvas page={page} />
              {showGrid && (
                <div
                  data-canvas-grid={gridSize}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    // One line per cell, drawn in page units so the grid stays
                    // locked to the design rather than to the screen. The line
                    // is 1/scale wide, which keeps it one pixel at any zoom.
                    zIndex: 5,
                    backgroundImage: `repeating-linear-gradient(to right, var(--app-grid-line) 0, var(--app-grid-line) ${1 / scale}px, transparent ${1 / scale}px, transparent ${gridSize}px), repeating-linear-gradient(to bottom, var(--app-grid-line) 0, var(--app-grid-line) ${1 / scale}px, transparent ${1 / scale}px, transparent ${gridSize}px)`,
                  }}
                />
              )}
              {guides.map((guide) => (
            <div
              key={`${guide.axis}-${guide.position}`}
              data-snap-guide={guide.axis}
              style={
                guide.axis === 'x'
                  ? {
                      position: 'absolute',
                      left: guide.position,
                      top: 0,
                      width: 1 / scale,
                      height: size.height,
                      background: 'var(--app-guide)',
                      pointerEvents: 'none',
                      zIndex: 6,
                    }
                  : {
                      position: 'absolute',
                      top: guide.position,
                      left: 0,
                      height: 1 / scale,
                      width: size.width,
                      background: 'var(--app-guide)',
                      pointerEvents: 'none',
                      zIndex: 6,
                    }
              }
            />
          ))}
            </div>
          </div>
        </div>
      </div>
      <CellToolbar />
      <TextToolbar />
      <QrToolbar />
      <DrawToolbar />
      <AlignToolbar />
    </div>
  );
};

/** 16×16 pictogram for one align or distribute command. */
const AlignIcon = ({
  kind,
}: {
  kind: AlignKind | 'distributeHorizontal' | 'distributeVertical';
}) => {
  const bar = { fill: 'currentColor', opacity: 0.45, rx: 1 } as const;
  let content: ReactNode;

  if (kind === 'distributeHorizontal' || kind === 'distributeVertical') {
    const vertical = kind === 'distributeHorizontal';
    content = [2, 6.75, 11.5].map((offset, index) =>
      vertical ? (
        <rect key={index} x={offset} y="3" width="2.5" height="10" {...bar} />
      ) : (
        <rect key={index} x="3" y={offset} width="10" height="2.5" {...bar} />
      ),
    );
  } else if (kind === 'left' || kind === 'centre' || kind === 'right') {
    const guide = kind === 'left' ? 1.5 : kind === 'centre' ? 8 : 14.5;
    const barX = (width: number) =>
      kind === 'left'
        ? guide + 2
        : kind === 'centre'
          ? guide - width / 2
          : guide - 2 - width;
    content = (
      <>
        <rect x={guide} y="1" width="1" height="14" fill="currentColor" rx="0.5" />
        <rect x={barX(9)} y="3" width="9" height="4" {...bar} />
        <rect x={barX(6)} y="9" width="6" height="4" {...bar} />
      </>
    );
  } else {
    const guide = kind === 'top' ? 1.5 : kind === 'middle' ? 8 : 14.5;
    const barY = (height: number) =>
      kind === 'top'
        ? guide + 2
        : kind === 'middle'
          ? guide - height / 2
          : guide - 2 - height;
    content = (
      <>
        <rect x="1" y={guide} width="14" height="1" fill="currentColor" rx="0.5" />
        <rect x="3" y={barY(9)} width="4" height="9" {...bar} />
        <rect x="9" y={barY(6)} width="4" height="6" {...bar} />
      </>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {content}
    </svg>
  );
};

const ALIGN_COMMANDS: { kind: AlignKind; label: string }[] = [
  { kind: 'left', label: 'Align left' },
  { kind: 'centre', label: 'Align horizontal centres' },
  { kind: 'right', label: 'Align right' },
  { kind: 'top', label: 'Align top' },
  { kind: 'middle', label: 'Align vertical centres' },
  { kind: 'bottom', label: 'Align bottom' },
];

const DISTRIBUTE_COMMANDS: { axis: DistributeAxis; label: string }[] = [
  { axis: 'horizontal', label: 'Space evenly horizontally' },
  { axis: 'vertical', label: 'Space evenly vertically' },
];

/**
 * Floating align/distribute bar, anchored above the current selection.
 *
 * Sits 48px above the anchor rather than 12px so it stacks clear of the Draw and
 * QR toolbars, which occupy the space directly above a layer.
 */
/**
 * A ruler along one edge of the canvas.
 *
 * Drawn onto a canvas rather than with DOM ticks: a 1640-wide page has dozens
 * of ticks and labels, and redrawing a small canvas each frame is far cheaper
 * than reconciling that many elements. The origin is measured from the page
 * element every frame, so scrolling, zooming and changing page all come out
 * right without anything having to notify the ruler.
 */
const RulerStrip = ({
  axis,
  scale,
  pageSize,
  selection,
  pageId,
}: {
  axis: 'x' | 'y';
  scale: number;
  pageSize: PageSize;
  selection: SelectionBox | null;
  pageId: string;
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ scale, pageSize, selection });
  latest.current = { scale, pageSize, selection };

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      const page = document.getElementById(pageId);
      if (!wrap || !canvas || !page) return;

      const strip = wrap.getBoundingClientRect();
      const box = page.getBoundingClientRect();
      if (strip.width < 2 || strip.height < 2) return;

      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(strip.width);
      const height = Math.round(strip.height);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const colors = rulerColors();
      const { scale: currentScale, pageSize: currentSize, selection: currentSelection } =
        latest.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);

      const horizontal = axis === 'x';
      // Where the page's own zero sits, in this strip's coordinates.
      const origin = horizontal ? box.left - strip.left : box.top - strip.top;
      const pageLength = horizontal ? currentSize.width : currentSize.height;

      if (currentSelection) {
        const start = horizontal ? currentSelection.x : currentSelection.y;
        const length = horizontal ? currentSelection.width : currentSelection.height;
        ctx.fillStyle = colors.clear;
        if (horizontal) {
          ctx.fillRect(origin + start * currentScale, 0, length * currentScale, height);
        } else {
          ctx.fillRect(0, origin + start * currentScale, width, length * currentScale);
        }
      }

      const extent = horizontal ? width : height;
      const step = rulerStepFor(currentScale);
      ctx.strokeStyle = colors.line;
      ctx.fillStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.font = '9px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';

      for (let value = 0; value <= pageLength; value += step) {
        const at = Math.round(origin + value * currentScale) + 0.5;
        if (at < -20 || at > extent + 20) continue;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(at, height - 5);
          ctx.lineTo(at, height);
          ctx.stroke();
          ctx.fillText(String(value), at + 3, 2);
        } else {
          ctx.moveTo(width - 5, at);
          ctx.lineTo(width, at);
          ctx.stroke();
          // Turned on its side, because the strip is only 20px wide.
          ctx.save();
          ctx.translate(2, at + 3);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(String(value), 0, 0);
          ctx.restore();
        }
      }
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [axis, pageId]);

  const horizontal = axis === 'x';
  return (
    <div
      ref={wrapRef}
      data-ruler={axis}
      css={{
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        background: 'var(--app-ruler-bg)',
        borderRight: horizontal ? undefined : '1px solid var(--app-border)',
        borderBottom: horizontal ? '1px solid var(--app-border)' : undefined,
        width: horizontal ? 'auto' : RULER_THICKNESS,
        height: horizontal ? RULER_THICKNESS : 'auto',
        // The strip must take its size from the layout, never from its canvas:
        // a wrapper sized to the canvas that is sized to the wrapper settles on
        // the canvas's 300px default and stops measuring the viewport.
        flexGrow: horizontal ? 1 : 0,
        minWidth: horizontal ? 0 : undefined,
      }}
    >
      <canvas ref={canvasRef} css={{ display: 'block' }} />
    </div>
  );
};

const AlignToolbar = () => {
  const ctx = useContext(EditorContext);
  const scaleCtx = useContext(EditorScaleContext);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  const selectedIds = ctx?.selectedLayerIds ?? [];
  const page = ctx ? ctx.pages[ctx.activePage] : undefined;
  const scale = scaleCtx?.scale ?? ctx?.scale ?? 1;
  const hidden = !!ctx?.editingLayerId || !!ctx?.selectedCell;

  // Union of the selected layers, in page units.
  const bounds = useMemo(() => {
    if (!page || !selectedIds.length) return null;
    const boxes = selectedIds
      .map((id) => {
        const props = page.layers[id]?.props as
          | { position?: Point; boxSize?: PageSize }
          | undefined;
        const p = props?.position;
        const box = props?.boxSize;
        if (!p || !box?.width || !box?.height) return null;
        return { x: p.x, y: p.y, w: box.width, h: box.height };
      })
      .filter((box): box is { x: number; y: number; w: number; h: number } =>
        Boolean(box),
      );
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    return {
      left,
      top,
      width: Math.max(...boxes.map((box) => box.x + box.w)) - left,
    };
  }, [page, selectedIds]);

  useEffect(() => {
    if (!bounds || hidden) {
      setAnchor(null);
      return;
    }
    const pageIndex = ctx?.activePage ?? 0;
    let frame = 0;
    let last = '';
    // Page coordinates → screen, re-measured each frame so scrolling and zooming
    // keep the bar glued to the selection.
    const tick = () => {
      const node = document.getElementById(`lidojs-page-${pageIndex}`);
      const rect = node?.getBoundingClientRect();
      const key = rect
        ? `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(scale * 1000)}`
        : '';
      if (key !== last) {
        last = key;
        setAnchor(
          rect
            ? {
                top: rect.top + bounds.top * scale,
                left: rect.left + (bounds.left + bounds.width / 2) * scale,
              }
            : null,
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [bounds, ctx?.activePage, hidden, scale]);

  if (!ctx || !bounds || !anchor) return null;

  const ids = [...selectedIds];
  // Distribute needs three layers before it means anything.
  const canDistribute = ids.length >= 3;
  const buttonCss = {
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    borderRadius: 6,
    color: 'var(--app-text-strong)',
    ':hover': { background: 'var(--app-surface)' },
  } as const;

  return (
    <div
      css={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        transform: 'translate(-50%, calc(-100% - 48px))',
        zIndex: 55,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        borderRadius: 10,
        border: '1px solid var(--app-border)',
        background: 'var(--app-panel)',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {ALIGN_COMMANDS.map(({ kind, label }) => (
        <button
          key={kind}
          type="button"
          title={label}
          aria-label={label}
          css={{ ...buttonCss, cursor: 'pointer' }}
          onClick={() => ctx.actions.alignLayers(ids, kind)}
        >
          <AlignIcon kind={kind} />
        </button>
      ))}
      <span
        css={{
          width: 1,
          height: 18,
          margin: '0 2px',
          background: 'var(--app-border)',
        }}
      />
      {DISTRIBUTE_COMMANDS.map(({ axis, label }) => (
        <button
          key={axis}
          type="button"
          title={label}
          aria-label={label}
          disabled={!canDistribute}
          css={{
            ...buttonCss,
            cursor: canDistribute ? 'pointer' : 'default',
            opacity: canDistribute ? 1 : 0.4,
          }}
          onClick={() => ctx.actions.distributeLayers(ids, axis)}
        >
          <AlignIcon
            kind={
              axis === 'horizontal'
                ? 'distributeHorizontal'
                : 'distributeVertical'
            }
          />
        </button>
      ))}
    </div>
  );
};

export const PageControl = () => {
  const { pages, activePage, scale, actions, readOnly } = useEditor();
  const scaleCtx = useContext(EditorScaleContext);
  const view = useContext(CanvasViewContext);
  return (
    <div
      css={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: 13,
        color: 'var(--app-text)',
      }}
    >
      <div css={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Paging is useful to a viewer; adding a page is not, and in read-only
            the action is a no-op anyway. */}
        {!readOnly && (
          <button type="button" onClick={() => actions.addPage()}>
            Add Page
          </button>
        )}
        <button
          type="button"
          disabled={activePage <= 0}
          onClick={() => actions.goToPage(activePage - 1)}
        >
          Prev
        </button>
        <button
          type="button"
          disabled={activePage >= pages.length - 1}
          onClick={() => actions.goToPage(activePage + 1)}
        >
          Next
        </button>
      </div>
      <span>
        Page {activePage + 1} / {pages.length || 1}
      </span>
      <div css={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {view && (
          <>
            <button
              type="button"
              aria-pressed={view.showRulers}
              title="Rulers (Shift+R)"
              onClick={() => view.setShowRulers(!view.showRulers)}
              css={{
                background: view.showRulers ? 'var(--app-guide)' : 'transparent',
                color: view.showRulers ? '#fff' : 'inherit',
              }}
            >
              Rulers
            </button>
            <button
              type="button"
              aria-pressed={view.showGrid}
              title="Grid (Shift+G)"
              onClick={() => view.setShowGrid(!view.showGrid)}
              css={{
                background: view.showGrid ? 'var(--app-guide)' : 'transparent',
                color: view.showGrid ? '#fff' : 'inherit',
              }}
            >
              Grid
            </button>
            <select
              aria-label="Grid size"
              value={view.gridSize}
              disabled={!view.showGrid}
              onChange={(event) => view.setGridSize(Number(event.target.value))}
              css={{
                background: 'transparent',
                color: 'inherit',
                border: '1px solid var(--app-border)',
                borderRadius: 4,
                padding: '2px 4px',
              }}
            >
              {GRID_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
            <span css={{ opacity: 0.4 }}>|</span>
          </>
        )}
        <button
          type="button"
          onClick={() => scaleCtx?.setScale(Math.max(0.1, scale - 0.05))}
        >
          -
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => scaleCtx?.setScale(Math.min(2, scale + 0.05))}
        >
          +
        </button>
      </div>
    </div>
  );
};

export const LayerSettings = () => {
  const { actions } = useEditor();
  const { selectedLayerIds } = useSelectedLayers();
  return (
    <div
      css={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        color: 'var(--app-text)',
        fontSize: 13,
      }}
    >
      {selectedLayerIds.length === 0 ? (
        <span css={{ opacity: 0.7 }}>Select a layer to edit</span>
      ) : (
        <>
          <span>
            Drag to move · corners to resize
          </span>
          <button
            type="button"
            css={{
              border: '1px solid var(--app-border)',
              background: 'transparent',
              color: 'var(--app-text-strong)',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              ':hover': { color: '#ff8f8f', borderColor: '#ff8f8f' },
            }}
            onClick={() => actions.deleteLayers(selectedLayerIds)}
          >
            Delete
          </button>
          <span css={{ opacity: 0.55, fontSize: 12 }}>
            or press Delete / Backspace
          </span>
        </>
      )}
    </div>
  );
};

export const Preview = () => {
  const { pages } = useEditor();
  const size = pageSizeOf(pages[0]);
  return (
    <div
      css={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div css={{ width: size.width * 0.5, height: size.height * 0.5 }}>
        <div
          css={{
            width: size.width,
            height: size.height,
            transform: 'scale(0.5)',
            transformOrigin: 'top left',
          }}
        >
          <PageCanvas page={pages[0]} />
        </div>
      </div>
    </div>
  );
};
