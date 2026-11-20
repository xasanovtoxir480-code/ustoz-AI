import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AlertTriangle, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasViewerProps {
  pdfBytes: Uint8Array;
  onSelectPageNote?: (pageNumber: number) => void;
}

interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
}

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  onSelectPageNote,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onSelectPageNote?: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: scale * dpr });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        setDimensions({
          width: Math.floor(baseViewport.width),
          height: Math.floor(baseViewport.height),
        });

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport: renderViewport,
        });

        await renderTask.promise;
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          err.name === 'RenderingCancelledException'
        ) {
          return;
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div className="bg-[#081129] border border-[#1B2D5C] rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span className="font-mono font-semibold text-sky-400 tabular-nums">
          {pageNumber}-bet
        </span>
        {onSelectPageNote && (
          <button
            type="button"
            onClick={() => onSelectPageNote(pageNumber)}
            className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
          >
            Shu betdan so&apos;rash
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded bg-white flex justify-center">
        <canvas
          ref={canvasRef}
          style={
            dimensions
              ? { width: `${dimensions.width}px`, height: `${dimensions.height}px` }
              : { maxWidth: '100%' }
          }
          className="block max-w-full h-auto"
        />
      </div>
    </div>
  );
}

export function PdfCanvasViewer({ pdfBytes, onSelectPageNote }: PdfCanvasViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [scale, setScale] = useState(1.1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;
    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });

    setIsLoading(true);
    setLoadError(null);
    setPdfDoc(null);
    setPages([]);

    loadingTask.promise
      .then((doc) => {
        if (destroyed) {
          doc.cleanup();
          return;
        }
        loadedDoc = doc;
        setPdfDoc(doc);
        const list: RenderedPage[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          list.push({ pageNumber: i, width: 0, height: 0 });
        }
        setPages(list);
        setIsLoading(false);
      })
      .catch(() => {
        if (destroyed) return;
        setLoadError("PDF sahifalarini ko'rsatib bo'lmadi, lekin AI baribir uni o'qiy oladi.");
        setIsLoading(false);
      });

    return () => {
      destroyed = true;
      loadingTask.destroy();
      if (loadedDoc) {
        loadedDoc.cleanup();
      }
    };
  }, [pdfBytes]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#081129] border border-[#1B2D5C] rounded-lg px-3 py-2 text-xs">
        <span className="text-slate-300 tabular-nums">
          {isLoading
            ? "Sahifalar ochilmoqda..."
            : pages.length > 0
            ? `Jami ${pages.length} bet`
            : 'PDF'}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.7, Number((s - 0.15).toFixed(2))))}
            aria-label="Kichiklashtirish"
            className="p-1.5 rounded bg-[#132247] hover:bg-[#1B3063] text-slate-200 transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-slate-200 w-12 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.0, Number((s + 0.15).toFixed(2))))}
            aria-label="Kattalashtirish"
            className="p-1.5 rounded bg-[#132247] hover:bg-[#1B3063] text-slate-200 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="h-[480px] flex items-center justify-center gap-3 bg-[#081129] border border-[#1B2D5C] rounded-lg text-sm text-slate-300">
          <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
          <span>PDF sahifalari chizilmoqda...</span>
        </div>
      )}

      {loadError && (
        <div className="p-5 bg-amber-950/35 border border-amber-700/60 rounded-lg text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {!isLoading && !loadError && pdfDoc && (
        <div className="max-h-[560px] overflow-y-auto pr-1 space-y-4">
          {pages.map((p) => (
            <PdfPageCanvas
              key={p.pageNumber}
              pdfDoc={pdfDoc}
              pageNumber={p.pageNumber}
              scale={scale}
              onSelectPageNote={onSelectPageNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}
