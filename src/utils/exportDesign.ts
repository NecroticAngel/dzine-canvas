import { toJpeg, toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadBlob, downloadDataUrl, downloadObjectAsJson } from './download';

export type ExportFormat = 'png' | 'jpg' | 'pdf' | 'json';

type PageSize = { width: number; height: number };

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
  format: 'png' | 'jpg',
) => {
  const { root, content } = getPageContent(pageIndex);
  const options = {
    cacheBust: true,
    pixelRatio: 2,
    width: size.width,
    height: size.height,
    canvasWidth: Math.round(size.width * 2),
    canvasHeight: Math.round(size.height * 2),
    backgroundColor: '#ffffff',
    style: {
      transform: 'scale(1)',
      transformOrigin: 'top left',
      width: `${size.width}px`,
      height: `${size.height}px`,
    },
  };

  return withCleanCapture(root, async () => {
    if (format === 'jpg') {
      return toJpeg(content, { ...options, quality: 0.92 });
    }
    return toPng(content, options);
  });
};

export const exportDesign = async (options: {
  format: ExportFormat;
  pageIndex: number;
  pageSize: PageSize;
  pages: unknown;
  fileName?: string;
}) => {
  const base = options.fileName ?? 'lidojs-design';

  if (options.format === 'json') {
    downloadObjectAsJson(base, options.pages);
    return;
  }

  const dataUrl = await capturePageImage(
    options.pageIndex,
    options.pageSize,
    options.format === 'pdf' ? 'png' : options.format,
  );

  if (options.format === 'png') {
    downloadDataUrl(`${base}.png`, dataUrl);
    return;
  }

  if (options.format === 'jpg') {
    downloadDataUrl(`${base}.jpg`, dataUrl);
    return;
  }

  const pdf = new jsPDF({
    orientation: options.pageSize.width >= options.pageSize.height ? 'l' : 'p',
    unit: 'px',
    format: [options.pageSize.width, options.pageSize.height],
    hotfixes: ['px_scaling'],
  });
  pdf.addImage(
    dataUrl,
    'PNG',
    0,
    0,
    options.pageSize.width,
    options.pageSize.height,
  );
  const blob = pdf.output('blob');
  downloadBlob(`${base}.pdf`, blob);
};
