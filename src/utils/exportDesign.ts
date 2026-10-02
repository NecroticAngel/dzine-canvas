import { toJpeg, toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadBlob, downloadDataUrl, downloadObjectAsJson } from './download';

export type ExportFormat = 'png' | 'jpg' | 'pdf' | 'svg' | 'json';

/** Multipliers offered in the export menu. */
export const EXPORT_SCALES = [1, 2, 3] as const;
export type ExportScale = (typeof EXPORT_SCALES)[number];

type PageSize = { width: number; height: number };

/** A region of the page, in page units, to export instead of the whole page. */
export type ExportCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * A page's own size, read from its root layer — the same rule the editor uses.
 *
 * The `pageSize` option is the *active* page's size, which is all a single-page
 * export needs. A multi-page export has to ask each page instead: a design can
 * hold pages of different sizes, and using the active page's size for all of them
 * quietly scales the odd ones out.
 */
const pageOwnSize = (pages: unknown, index: number): PageSize | null => {
  const list = Array.isArray(pages) ? pages : [];
  const box = (
    list[index] as
      | { layers?: Record<string, { props?: { boxSize?: PageSize } }> }
      | undefined
  )?.layers?.ROOT?.props?.boxSize;
  return box?.width && box?.height ? { width: box.width, height: box.height } : null;
};

/**
 * The part of the page a crop actually covers.
 *
 * The artboard clips to the page, and so does a capture of it, so a layer hanging
 * off the edge cannot be exported whole however far the crop is asked to reach.
 * Intersecting keeps the output size honest; skipping it would produce a file
 * with empty margins where the page ended.
 */
export const clampToPage = (crop: ExportCrop, page: PageSize): ExportCrop | null => {
  const left = Math.max(0, crop.x);
  const top = Math.max(0, crop.y);
  const right = Math.min(page.width, crop.x + crop.width);
  const bottom = Math.min(page.height, crop.y + crop.height);
  if (right - left < 1 || bottom - top < 1) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * The same "page" wrapper for every page, so a multi-page PDF can find them.
 * Page 0 keeps its existing id because saved designs embed URLs of that shape.
 */
const getPageContent = (pageIndex: number) => {
  const root = document.getElementById(`lidojs-page-${pageIndex}`);
  if (!root) {
    throw new Error('Canvas page not found. Make sure the editor is visible.');
  }
  const content = root.firstElementChild as HTMLElement | null;
  if (!content) {
    throw new Error('Canvas content not found.');
  }
  return { root, content };
};

/** How many pages the design has. The DOM only ever holds the visible one. */
const pageCount = (pages: unknown) => (Array.isArray(pages) ? pages.length : 0);

/**
 * html-to-image resolves every capture from inside a `requestAnimationFrame`
 * callback, and a hidden tab never runs frames — so an export, or the thumbnail
 * captured on autosave, started while the tab is in the background would wait
 * forever and the save would never finish. Frames are driven by a timer for the
 * duration instead; the handles still cancel, so nothing else can tell.
 */
let framePatches = 0;
let restoreFrames: (() => void) | null = null;

export const withVisibleFrames = async <T>(
  run: () => Promise<T>,
): Promise<T> => {
  if (framePatches === 0) {
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const timers = new Set<number>();
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        callback(performance.now());
      }, 16);
      timers.add(id);
      return id;
    };
    window.cancelAnimationFrame = (handle: number) => {
      if (!timers.delete(handle)) nativeCancel(handle);
    };
    restoreFrames = () => {
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    };
  }
  framePatches += 1;
  try {
    return await run();
  } finally {
    framePatches -= 1;
    if (framePatches === 0 && restoreFrames) {
      restoreFrames();
      restoreFrames = null;
    }
  }
};

const withCleanCapture = async <T>(
  root: HTMLElement,
  run: () => Promise<T>,
): Promise<T> => {
  const previous = root.getAttribute('data-exporting');
  root.setAttribute('data-exporting', 'true');
  // Hide selection outlines / resize handles during capture.
  const style = document.createElement('style');
  style.setAttribute('data-export-style', 'true');
  style.textContent = `
    [data-exporting="true"] [data-resize-handle],
    [data-exporting="true"] textarea {
      outline: none !important;
      border: none !important;
    }
    /* A layout guide is the user's own measuring aid, not part of the design. */
    [data-exporting="true"] [data-layout-guide] {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
  try {
    return await withVisibleFrames(run);
  } finally {
    if (previous == null) root.removeAttribute('data-exporting');
    else root.setAttribute('data-exporting', previous);
    style.remove();
  }
};

const capturePageImage = async (
  pageIndex: number,
  size: PageSize,
  format: 'png' | 'jpg' | 'svg',
  options: {
    scale?: number;
    transparent?: boolean;
    crop?: ExportCrop | null;
  } = {},
) => {
  const { root, content } = getPageContent(pageIndex);
  const scale = options.scale ?? 2;
  // A JPEG has no alpha channel, so transparency only means anything elsewhere.
  const transparent = options.transparent && format !== 'jpg';
  const crop = options.crop ?? null;
  // The element keeps the page's own size, so nothing inside it reflows; the crop
  // only changes which part of it lands on the canvas.
  const outputWidth = crop ? crop.width : size.width;
  const outputHeight = crop ? crop.height : size.height;
  const capture = {
    cacheBust: true,
    // `pixelRatio` is the only multiplier that should be here. Passing
    // `canvasWidth` as well multiplies by it *again* — html-to-image computes
    // `canvas.width = canvasWidth * pixelRatio` — which made 2× export at 4× and
    // 3× at 9×, and pushed large designs into the library's silent
    // downscale-to-fit-canvas-limit path.
    pixelRatio: scale,
    width: outputWidth,
    height: outputHeight,
    ...(transparent ? {} : { backgroundColor: '#ffffff' }),
    style: {
      transform: crop
        ? `translate(${-crop.x}px, ${-crop.y}px) scale(1)`
        : 'scale(1)',
      transformOrigin: 'top left',
      width: `${size.width}px`,
      height: `${size.height}px`,
    },
  };

  return withCleanCapture(root, async () => {
    if (format === 'jpg') {
      return toJpeg(content, { ...capture, quality: 0.92 });
    }
    if (format === 'svg') {
      return toSvg(content, capture);
    }
    return toPng(content, capture);
  });
};

/**
 * Small JPEG preview for the design gallery.
 *
 * Deliberately cheap — `pixelRatio: 1` and JPEG rather than PNG — because the
 * result is persisted to localStorage next to the design, where a full-res PNG
 * would quickly exhaust the quota.
 */
export const captureThumbnail = async (
  pageIndex: number,
  size: PageSize,
  targetPx = 420,
): Promise<string | null> => {
  try {
    const scale = Math.min(targetPx / size.width, targetPx / size.height, 1);
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    const { root, content } = getPageContent(pageIndex);
    return await withCleanCapture(root, () =>
      toJpeg(content, {
        cacheBust: true,
        pixelRatio: 1,
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        quality: 0.72,
        backgroundColor: '#ffffff',
        style: {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${size.width}px`,
          height: `${size.height}px`,
        },
      }),
    );
  } catch (error) {
    // A preview must never be able to break saving, but staying silent made a
    // broken capture look identical to "this design has no preview".
    console.warn('[dzine] thumbnail capture failed:', error);
    return null;
  }
};

export const exportDesign = async (options: {
  format: ExportFormat;
  pageIndex: number;
  pageSize: PageSize;
  pages: unknown;
  fileName?: string;
  /** 1, 2 or 3. Two matches the old fixed behaviour. */
  scale?: ExportScale;
  /** PNG and SVG only; a JPEG has no alpha channel and stays white. */
  transparent?: boolean;
  /** PDF and images: render every page rather than just the active one. */
  allPages?: boolean;
  /** Export only this region of the page, in page units — a selection. */
  crop?: ExportCrop | null;
  /**
   * Show page `index` on the canvas and resolve once it is rendered. Needed by
   * "all pages": the editor keeps one page element, so the others have to take
   * their turn in it before they can be captured.
   */
  bringPageIntoView?: (index: number) => Promise<void>;
}) => {
  const base = options.fileName ?? 'dzine-canvas';
  const scale = options.scale ?? 2;
  const transparent = Boolean(options.transparent);
  const crop = options.crop
    ? clampToPage(options.crop, options.pageSize)
    : null;

  if (options.format === 'json') {
    downloadObjectAsJson(base, options.pages);
    return;
  }

  // A selection belongs to one page, so it overrides "all pages" rather than
  // quietly handing back the same crop from every page.
  const total = pageCount(options.pages);
  const everyPage = Boolean(options.allPages) && !crop && total > 1;
  const pageIndexes = everyPage
    ? Array.from({ length: total }, (_, index) => index)
    : [options.pageIndex];
  // Each page keeps its own size. The active page's size is the right answer only
  // for the active page — and "all pages" is exactly the case where a design's
  // pages can differ, where using it would scale the odd ones out.
  const sizes = pageIndexes.map(
    (index) => crop ?? pageOwnSize(options.pages, index) ?? options.pageSize,
  );

  if (options.format === 'pdf') {
    const first = sizes[0] ?? options.pageSize;
    const pageOrientation = (size: PageSize) =>
      size.width >= size.height ? 'l' : 'p';
    const pdf = new jsPDF({
      orientation: pageOrientation(first),
      unit: 'px',
      format: [first.width, first.height],
      hotfixes: ['px_scaling'],
    });

    try {
      for (const [position, pageIndex] of pageIndexes.entries()) {
        await options.bringPageIntoView?.(pageIndex);
        const size = sizes[position] ?? options.pageSize;
        const dataUrl = await capturePageImage(pageIndex, size, 'png', {
          scale,
          transparent,
          crop,
        });
        if (position > 0) {
          pdf.addPage([size.width, size.height], pageOrientation(size));
        }
        pdf.addImage(dataUrl, 'PNG', 0, 0, size.width, size.height);
      }
    } finally {
      // Put the editor back on the page the user was looking at.
      if (everyPage) await options.bringPageIntoView?.(options.pageIndex);
    }

    downloadBlob(`${base}.pdf`, pdf.output('blob'));
    return;
  }

  // One file per page when every page is asked for; otherwise just the one.
  try {
    for (const [position, pageIndex] of pageIndexes.entries()) {
      await options.bringPageIntoView?.(pageIndex);
      const dataUrl = await capturePageImage(
        pageIndex,
        sizes[position] ?? options.pageSize,
        options.format,
        { scale, transparent, crop },
      );
      const suffix =
        pageIndexes.length > 1 ? `-${position + 1}` : '';
      downloadDataUrl(`${base}${suffix}.${options.format}`, dataUrl);
    }
  } finally {
    if (everyPage) await options.bringPageIntoView?.(options.pageIndex);
  }
};
