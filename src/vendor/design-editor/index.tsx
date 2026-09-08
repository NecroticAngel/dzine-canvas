import type {
  ArrowType,
  SerializedLayer,
  SerializedLayerTree,
  SerializedLayers,
  SerializedPage,
} from '@lidojs/design-core';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
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
  type DesignSummary,
} from '../../utils/designLibrary';

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

type EditorState = {
  pages: SerializedPage[];
  activePage: number;
  scale: number;
  sidebar?: string;
  selectedLayerIds: string[];
  dragNDrop: unknown;
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
  startDragNDrop: (
    payload: { layer: string; data: SerializedLayerTree },
    _pos: Point,
  ) => void;
  setPage: (index: number, page: SerializedPage) => void;
  setData: (pages: SerializedPage[]) => void;
  setSidebar: (name?: string) => void;
  selectLayers: (ids: string[]) => void;
  setEditingLayer: (id: string | null) => void;
  updateLayerBox: (
    layerId: string,
    box: { position: Point; boxSize: PageSize },
  ) => void;
  updateLayerText: (layerId: string, text: string) => void;
  registerTextInput: (el: HTMLTextAreaElement | null) => void;
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
  currentDesign: DesignSummary | null;
  designs: DesignSummary[];
};

const EditorContext = createContext<EditorContextValue | null>(null);

const EditorScaleContext = createContext<{
  scale: number;
  setScale: (scale: number) => void;
  setActivePage: (index: number) => void;
} | null>(null);

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
  const layerScale = Number(props.scale ?? 1);
  const name = layer.type.resolvedName;
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
      moved = true;
      const dx = rawDx / pageScale;
      const dy = rawDy / pageScale;

      if (mode === 'move') {
        ctx.actions.updateLayerBox(layerId, {
          position: { x: origin.x + dx, y: origin.y + dy },
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

const PageCanvas = ({ page }: { page?: SerializedPage }) => {
  if (!page?.layers?.ROOT) return null;
  return <LayerView layerId="ROOT" layers={page.layers} />;
};

export const Editor = ({
  children,
}: {
  config?: unknown;
  getFonts?: (query: GetFontQuery) => Promise<unknown>;
  uploadImage?: (file: File) => Promise<{ url: string; thumb: string }>;
  children?: ReactNode;
}) => {
  const boot = useRef(bootstrapEditor()).current;
  const [pages, setPages] = useState<SerializedPage[]>(boot.pages);
  const [activePage, setActivePage] = useState(0);
  const [scale, setScale] = useState(0.43);
  const [sidebar, setSidebarState] = useState<string | undefined>();
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [currentDesign, setCurrentDesign] = useState<DesignSummary | null>(
    boot.currentDesign,
  );
  const [designs, setDesigns] = useState<DesignSummary[]>(boot.designs);
  const past = useRef<SerializedPage[][]>([]);
  const future = useRef<SerializedPage[][]>([]);
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
    }
    return saved;
  }, [flushTextDraft, refreshDesignList]);

  const commit = useCallback((next: SerializedPage[]) => {
    past.current.push(clonePages(pagesRef.current));
    future.current = [];
    pagesRef.current = next;
    setPages(next);
  }, []);

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
    },
    [],
  );

  const patchLayerText = useCallback((layerId: string, text: string) => {
    // Draft only while editing — pages update on flush/commit.
    textDraftRef.current = { id: layerId, text };
  }, []);

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
      setEditingLayer: (id) => {
        if (!id) {
          flushTextDraft();
          textDraftRef.current = null;
          activeTextareaRef.current = null;
        }
        setEditingLayerId(id);
      },
      updateLayerBox: patchLayerLive,
      updateLayerText: patchLayerText,
      registerTextInput: (el) => {
        activeTextareaRef.current = el;
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
    persistCurrent,
    refreshDesignList,
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
      currentDesign,
      designs,
      actions,
      query,
    }),
    [
      actions,
      activePage,
      currentDesign,
      designs,
      editingLayerId,
      pages,
      query,
      scale,
      selectedLayerIds,
      sidebar,
    ],
  );

  return (
    <EditorContext.Provider value={value}>
      <EditorScaleContext.Provider value={{ scale, setScale, setActivePage }}>
        {children}
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
  };
}

export const useSelectedLayers = () => {
  const ctx = useContext(EditorContext);
  return { selectedLayerIds: ctx?.selectedLayerIds ?? [] };
};

export const DesignFrame = ({ data }: { data?: SerializedPage[] }) => {
  const { pages, activePage, scale, actions } = useEditor();
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    if (data?.length && pages.length === 0) {
      actions.setData(data);
      bootstrapped.current = true;
    }
  }, [actions, data, pages.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        actions.saveDesign();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);

  const rendered = pages.length ? pages : (data ?? []);
  const page = rendered[activePage] ?? rendered[0];
  const size = pageSizeOf(page);

  return (
    <div
      css={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 0,
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
          boxShadow: '0 2px 8px rgba(0,0,0,.15)',
          background: '#fff',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          css={{
            width: size.width,
            height: size.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <PageCanvas page={page} />
        </div>
      </div>
    </div>
  );
};

export const PageControl = () => {
  const { pages, activePage, scale, actions } = useEditor();
  const scaleCtx = useContext(EditorScaleContext);
  return (
    <div
      css={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: 13,
      }}
    >
      <button
        type="button"
        onClick={() => {
          const blank: SerializedPage = {
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
          };
          actions.setData([...pages, blank]);
        }}
      >
        Add Page
      </button>
      <span>
        Page {activePage + 1} / {pages.length || 1}
      </span>
      <div css={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
  const { selectedLayerIds } = useSelectedLayers();
  return (
    <div
      css={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        color: '#5E6278',
        fontSize: 13,
      }}
    >
      {selectedLayerIds.length
        ? 'Drag to move · corners to resize · double-click text to edit'
        : 'Select a layer to edit its settings'}
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
