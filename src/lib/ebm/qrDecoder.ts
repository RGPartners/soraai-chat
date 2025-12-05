import { createCanvas, type Canvas, type CanvasRenderingContext2D } from '@napi-rs/canvas';
import { performance } from 'node:perf_hooks';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource,
} from '@zxing/library';
import jsQR from 'jsqr';
import type { DocumentInitParameters, PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import logger from '@/lib/logger';

const qrLogger = logger.withDefaults({ tag: 'ebm:qr' });

const DEFAULT_SCALES = [1.4, 1.8, 2.2, 2.8, 3.5, 4.2];

export interface PdfQrDecodeOptions {
  scales?: number[];
  maxPages?: number;
  unique?: boolean;
}

export interface PdfQrDecodedCode {
  pageNumber: number;
  scale: number;
  text: string;
}

type CanvasAndContext = {
  canvas: Canvas;
  context: CanvasRenderingContext2D;
};

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const safeWidth = Math.max(Math.ceil(width), 1);
    const safeHeight = Math.max(Math.ceil(height), 1);
    const canvas = createCanvas(safeWidth, safeHeight);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number) {
    const safeWidth = Math.max(Math.ceil(width), 1);
    const safeHeight = Math.max(Math.ceil(height), 1);
    canvasAndContext.canvas.width = safeWidth;
    canvasAndContext.canvas.height = safeHeight;
  }

  destroy(canvasAndContext: CanvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

const canvasFactory = new NodeCanvasFactory();

type NodeDocumentInitParameters = DocumentInitParameters & {
  disableWorker?: boolean;
};

let pdfModulePromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

const loadPdfModule = async () => {
  if (!pdfModulePromise) {
    pdfModulePromise = import(
      /* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs'
    );
  }
  return pdfModulePromise;
};

const createReader = () => {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  return reader;
};

const decodeBitmap = (reader: MultiFormatReader, bitmap: BinaryBitmap) => {
  try {
    const result = reader.decode(bitmap);
    return result.getText();
  } catch (error) {
    if (error instanceof NotFoundException) {
      return null;
    }
    throw error;
  } finally {
    reader.reset();
  }
};

const buildBinaryBitmap = (data: Uint8ClampedArray, width: number, height: number) => {
  const luminanceSource = new RGBLuminanceSource(data, width, height);
  return new BinaryBitmap(new HybridBinarizer(luminanceSource));
};

const decodeWithJsqr = (data: Uint8ClampedArray, width: number, height: number) => {
  const result = jsQR(data, width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data ?? null;
};

const renderPageAtScale = async (
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
) => {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

  const renderContext = {
    canvasContext: canvasAndContext.context as unknown as globalThis.CanvasRenderingContext2D,
    viewport,
    canvasFactory,
    canvas: canvasAndContext.canvas as unknown as HTMLCanvasElement,
  };

  await page.render(renderContext).promise;

  const imageData = canvasAndContext.context.getImageData(
    0,
    0,
    canvasAndContext.canvas.width,
    canvasAndContext.canvas.height,
  );
  return {
    data: imageData.data,
    width: canvasAndContext.canvas.width,
    height: canvasAndContext.canvas.height,
    cleanup: () => canvasFactory.destroy(canvasAndContext),
  };
};

export const decodeQrCodesFromPdf = async (
  pdfBuffer: Buffer,
  options: PdfQrDecodeOptions = {},
): Promise<PdfQrDecodedCode[]> => {
  const start = performance.now();
  const pdfjs = await loadPdfModule();
  pdfjs.GlobalWorkerOptions.workerPort = null;

  const docInit: NodeDocumentInitParameters = {
      data: new Uint8Array(
        pdfBuffer.buffer,
        pdfBuffer.byteOffset,
        pdfBuffer.byteLength,
      ),
      disableWorker: true,
      useSystemFonts: true,
      disableFontFace: true,
    };

  const doc = await pdfjs
    .getDocument(docInit)
    .promise;

  const scales = options.scales?.length ? options.scales : DEFAULT_SCALES;
  const maxPages = options.maxPages ?? doc.numPages;
  const unique = options.unique ?? true;
  const seen = new Set<string>();
  const reader = createReader();
  const codes: PdfQrDecodedCode[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= doc.numPages && pageIndex <= maxPages; pageIndex++) {
      for (const scale of scales) {
        const renderStart = performance.now();
        let cleanup: (() => void) | null = null;
        try {
          const rendered = await renderPageAtScale(doc, pageIndex, scale);
          cleanup = rendered.cleanup;
          const bitmap = buildBinaryBitmap(rendered.data, rendered.width, rendered.height);
          let text = decodeBitmap(reader, bitmap);

          if (!text) {
            text = decodeWithJsqr(rendered.data, rendered.width, rendered.height);
          }
          const renderDuration = performance.now() - renderStart;

          if (text) {
            if (!unique || !seen.has(text)) {
              seen.add(text);
              codes.push({ pageNumber: pageIndex, scale, text });
              qrLogger.info('Detected QR code', {
                page: pageIndex,
                scale,
                durationMs: renderDuration.toFixed(1),
              });
              break; // Stop trying higher scales once we have a match
            }
          } else {
            qrLogger.debug('No QR match for page', {
              page: pageIndex,
              scale,
              durationMs: renderDuration.toFixed(1),
            });
          }
        } catch (error) {
          qrLogger.warn('Failed to decode QR candidate', {
            page: pageIndex,
            scale,
            error,
          });
        } finally {
          if (cleanup) {
            cleanup();
          }
        }
      }
    }
  } finally {
    await doc.cleanup();
    await doc.destroy();
  }

  qrLogger.info('QR extraction finished', {
    pageCount: doc.numPages,
    matches: codes.length,
    durationMs: (performance.now() - start).toFixed(1),
  });

  return codes;
};
