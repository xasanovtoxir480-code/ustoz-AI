import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfOutlineData, PdfOutlineSection } from '../types/lesson';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ClientPdfExtraction {
  extractedText: string;
  outline: PdfOutlineData | null;
}

export async function extractPdfLocally(
  pdfBytes: Uint8Array,
  fileName: string,
): Promise<ClientPdfExtraction> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });

  try {
    const doc = await loadingTask.promise;
    const pageTexts: { page: number; text: string; lines: string[] }[] = [];

    const maxPages = Math.min(doc.numPages, 25);
    for (let p = 1; p <= maxPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rawItems = content.items as Array<{ str?: string; hasEOL?: boolean }>;
      const lines: string[] = [];
      let currentLine = '';

      for (const item of rawItems) {
        const str = item.str ?? '';
        currentLine += str;
        if (item.hasEOL) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        } else if (str && !str.endsWith(' ')) {
          currentLine += ' ';
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());

      const pageText = lines.join('\n').trim();
      if (pageText) {
        pageTexts.push({ page: p, text: pageText, lines });
      }
    }

    doc.cleanup();

    const fullText = pageTexts
      .map((p) => `[${p.page}-bet]\n${p.text}`)
      .join('\n\n')
      .trim();

    // Scanned / image-only PDF: let Gemini Vision/PDF read it on the backend
    if (fullText.length < 40) {
      return { extractedText: '', outline: null };
    }

    const sections: PdfOutlineSection[] = [];
    let documentTitle = fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    let subject = '';

    // Detect Ustoz AI exported PDF headers or general numbered headings
    for (const p of pageTexts) {
      for (let i = 0; i < p.lines.length; i++) {
        const line = p.lines[i];
        if (
          p.page === 1 &&
          line.includes('|') &&
          !subject &&
          (line.includes('daraja') || line.includes('tahlil'))
        ) {
          subject = line.split('|')[0]?.trim() || '';
          const nextLine = p.lines[i + 1];
          if (nextLine && !nextLine.startsWith('Savol:')) {
            documentTitle = nextLine;
          }
        }

        const qadamMatch = line.match(/^QADAM\s+(\d+)\s*:\s*(.+)$/i);
        if (qadamMatch) {
          const nextSummary = p.lines[i + 1] || `${qadamMatch[2]} qadami`;
          sections.push({
            sectionNumber: sections.length + 1,
            title: qadamMatch[2].trim(),
            summary: nextSummary.slice(0, 140),
            pageHint: `${p.page}-bet`,
          });
        }
      }
    }

    // Fallback: if not an Ustoz AI PDF, create per-page / topic sections locally
    if (sections.length === 0) {
      for (const p of pageTexts.slice(0, 7)) {
        const firstMeaningfulLine =
          p.lines.find((l) => l.length > 6) || `${p.page}-bet mazmuni`;
        const summaryLine =
          p.lines.find((l) => l !== firstMeaningfulLine && l.length > 12) ||
          p.text.slice(0, 130);
        sections.push({
          sectionNumber: sections.length + 1,
          title: firstMeaningfulLine.slice(0, 70),
          summary: summaryLine.slice(0, 140),
          pageHint: `${p.page}-bet`,
        });
      }
    }

    return {
      extractedText: fullText.slice(0, 18000),
      outline:
        sections.length > 0
          ? {
              documentTitle,
              subject,
              sections: sections.slice(0, 7),
            }
          : null,
    };
  } catch {
    return { extractedText: '', outline: null };
  } finally {
    loadingTask.destroy();
  }
}
