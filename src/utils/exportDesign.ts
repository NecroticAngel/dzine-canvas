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

/** Which page elements are currently on screen, in order. */
const mountedPageIndexes = () => {
  const indexes: number[] = [];
  for (
    let index = 0;
    document.getElementById(`lidojs-page-${index}`);
    index += 1
  ) {
    indexes.push(index);
  }
  return indexes;
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
    return await run();
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
}) => {
  const base = options.fileName ?? 'dzine-canvas';
  const scale = options.scale ?? 2;
  const transparent = Boolean(options.transparent);
  const crop = options.crop
    ? clampToPage(options.crop, options.pageSize)
    : null;
  // A selection crop is the size of the output as well as its position.
  const outputSize = crop ?? options.pageSize;

  if (options.format === 'json') {
    downloadObjectAsJson(base, options.pages);
    return;
  }

  // A selection belongs to one page, so it overrides "all pages" rather than
  // quietly handing back the same crop from every page.
  const requested =
    options.allPages && !crop ? mountedPageIndexes() : [options.pageIndex];
  const pageIndexes = requested.length ? requested : [options.pageIndex];

  if (options.format === 'pdf') {
    // Every page is placed at the output size. A design whose pages are all the
    // same size — the normal case — is exact; a mixed one is scaled to fit rather
    // than cropped.
    const orientation = outputSize.width >= outputSize.height ? 'l' : 'p';
    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [outputSize.width, outputSize.height],
      hotfixes: ['px_scaling'],
    });

    for (const [position, pageIndex] of pageIndexes.entries()) {
      const dataUrl = await capturePageImage(
        pageIndex,
        options.pageSize,
        'png',
        { scale, transparent, crop },
      );
      if (position > 0) {
        pdf.addPage([outputSize.width, outputSize.height], orientation);
      }
      pdf.addImage(
        dataUrl,
        'PNG',
        0,
        0,
        outputSize.width,
        outputSize.height,
      );
    }

    downloadBlob(`${base}.pdf`, pdf.output('blob'));
    return;
  }

  // One file per page when every page is asked for; otherwise just the one.
  for (const [position, pageIndex] of pageIndexes.entries()) {
    const dataUrl = await capturePageImage(
      pageIndex,
      options.pageSize,
      options.format,
      { scale, transparent, crop },
    );
    const suffix =
      pageIndexes.length > 1 ? `-${position + 1}` : '';
    downloadDataUrl(`${base}${suffix}.${options.format}`, dataUrl);
  }
};
