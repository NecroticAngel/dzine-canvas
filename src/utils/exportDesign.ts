import { toJpeg, toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadBlob, downloadDataUrl, downloadObjectAsJson } from './download';

export type ExportFormat = 'png' | 'jpg' | 'pdf' | 'svg' | 'json';

/** Multipliers offered in the export menu. */
export const EXPORT_SCALES = [1, 2, 3] as const;
export type ExportScale = (typeof EXPORT_SCALES)[number];

type PageSize = { width: number; height: number };

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
  options: { scale?: number; transparent?: boolean } = {},
) => {
  const { root, content } = getPageContent(pageIndex);
  const scale = options.scale ?? 2;
  // A JPEG has no alpha channel, so transparency only means anything elsewhere.
  const transparent = options.transparent && format !== 'jpg';
  const capture = {
    cacheBust: true,
    pixelRatio: scale,
    width: size.width,
    height: size.height,
    ...(format === 'svg'
      ? {}
      : {
          canvasWidth: Math.round(size.width * scale),
          canvasHeight: Math.round(size.height * scale),
        }),
    ...(transparent ? {} : { backgroundColor: '#ffffff' }),
    style: {
      transform: 'scale(1)',
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
}) => {
  const base = options.fileName ?? 'dzine-canvas';
  const scale = options.scale ?? 2;
  const transparent = Boolean(options.transparent);

  if (options.format === 'json') {
    downloadObjectAsJson(base, options.pages);
    return;
  }

  const requested = options.allPages
    ? mountedPageIndexes()
    : [options.pageIndex];
  const pageIndexes = requested.length ? requested : [options.pageIndex];

  if (options.format === 'pdf') {
    // Every page is placed at the active page's size. A design whose pages are
    // all the same size — which is the normal case — is exact; a mixed one is
    // scaled to fit rather than cropped.
    const pdf = new jsPDF({
      orientation: options.pageSize.width >= options.pageSize.height ? 'l' : 'p',
      unit: 'px',
      format: [options.pageSize.width, options.pageSize.height],
      hotfixes: ['px_scaling'],
    });

    for (const [position, pageIndex] of pageIndexes.entries()) {
      const dataUrl = await capturePageImage(
        pageIndex,
        options.pageSize,
        'png',
        { scale, transparent },
      );
      if (position > 0) {
        pdf.addPage(
          [options.pageSize.width, options.pageSize.height],
          options.pageSize.width >= options.pageSize.height ? 'l' : 'p',
        );
      }
      pdf.addImage(
        dataUrl,
        'PNG',
        0,
        0,
        options.pageSize.width,
        options.pageSize.height,
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
      { scale, transparent },
    );
    const suffix =
      pageIndexes.length > 1 ? `-${position + 1}` : '';
    downloadDataUrl(`${base}${suffix}.${options.format}`, dataUrl);
  }
};
