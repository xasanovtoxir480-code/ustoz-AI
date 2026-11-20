import { jsPDF } from 'jspdf';
import type { LessonData, TeachingLevel } from '../types/lesson';

const LEVEL_LABELS: Record<TeachingLevel, string> = {
  beginner: "Noldan (Oddiy daraja)",
  intermediate: "O'rta daraja",
  deep: 'Batafsil tahlil',
};

function normalizeForPdf(input: string): string {
  return String(input || '')
    .replace(/[\u2018\u2019\u02BB\u02BC`]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, '|')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u00B2/g, '^2')
    .replace(/\u00B3/g, '^3')
    .replace(/\u2248/g, '~')
    .replace(/\u2260/g, '!=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ');
}

function makeSlug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'dars';
}

export function exportLessonToPdf(lesson: LessonData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  doc.setProperties({
    title: normalizeForPdf(lesson.title),
    subject: normalizeForPdf(lesson.subject),
    creator: 'Ustoz AI',
    keywords: normalizeForPdf(`Ustoz AI, ${lesson.subject}, ${lesson.level}`),
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const writeParagraph = (
    text: string,
    options: {
      font?: 'helvetica' | 'courier';
      style?: 'normal' | 'bold' | 'italic';
      size?: number;
      color?: [number, number, number];
      lineHeight?: number;
      indent?: number;
      extraBottom?: number;
    } = {},
  ) => {
    const {
      font = 'helvetica',
      style = 'normal',
      size = 10.5,
      color = [30, 41, 59],
      lineHeight = 5.2,
      indent = 0,
      extraBottom = 2,
    } = options;

    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);

    const clean = normalizeForPdf(text);
    const lines = doc.splitTextToSize(clean, contentWidth - indent) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += extraBottom;
  };

  const writeSectionLabel = (label: string, color: [number, number, number] = [29, 78, 216]) => {
    ensureSpace(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(normalizeForPdf(label.toUpperCase()), margin, y);
    y += 5.5;
  };

  // Top Header Banner
  doc.setFillColor(12, 23, 54);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('Ustoz AI - Dars Konspekti', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(186, 230, 253);
  const dateText = new Date(lesson.createdAt).toLocaleDateString('uz-UZ');
  doc.text(
    normalizeForPdf(`${lesson.subject}  |  ${LEVEL_LABELS[lesson.level]}  |  ${dateText}`),
    margin,
    20,
  );

  y = 38;

  // Lesson Title & Question
  writeParagraph(lesson.title, {
    size: 16,
    style: 'bold',
    color: [15, 23, 42],
    lineHeight: 7,
    extraBottom: 3,
  });

  writeParagraph(`Savol: ${lesson.question}`, {
    size: 10.5,
    style: 'italic',
    color: [71, 85, 105],
    lineHeight: 5.2,
    extraBottom: 5,
  });

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Direct Answer & Core Idea
  writeSectionLabel('Qisqa va aniq javob', [29, 78, 216]);
  writeParagraph(lesson.directAnswer, {
    size: 10.5,
    color: [15, 23, 42],
    extraBottom: 4,
  });

  writeSectionLabel("Asosiy g'oya (Nega shunday?)", [180, 83, 9]);
  writeParagraph(lesson.corePrinciple, {
    size: 10,
    color: [51, 65, 85],
    extraBottom: 4,
  });

  if (lesson.prerequisites.length > 0) {
    writeParagraph(`Bilish foydali so'zlar: ${lesson.prerequisites.join(' | ')}`, {
      size: 9.5,
      color: [100, 116, 139],
      extraBottom: 6,
    });
  }

  // Steps
  for (const step of lesson.steps) {
    ensureSpace(22);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    writeSectionLabel(
      `QADAM ${String(step.stepNumber).padStart(2, '0')}: ${step.title}`,
      [15, 23, 42],
    );

    writeParagraph(step.summary, {
      size: 10,
      color: [51, 65, 85],
      extraBottom: 3,
    });

    writeSectionLabel('1. Qanday bajariladi? (Mayda qadamlar)', [29, 78, 216]);
    step.howToDetails.forEach((detail, idx) => {
      writeParagraph(`${idx + 1}. ${detail}`, {
        size: 10,
        indent: 3,
        color: [30, 41, 59],
        extraBottom: 1.5,
      });
    });
    y += 2;

    writeSectionLabel(`2. ${step.exampleLabel || 'Oddiy misol'}`, [51, 65, 85]);
    writeParagraph(step.practicalExample, {
      font: 'courier',
      size: 9.5,
      indent: 3,
      color: [15, 23, 42],
      lineHeight: 4.8,
      extraBottom: 3,
    });

    writeSectionLabel('3. Nima uchun shunday qildik?', [4, 120, 87]);
    writeParagraph(step.whyReason, {
      size: 10,
      color: [6, 78, 59],
      extraBottom: 3,
    });

    writeParagraph(`Boshqacha qilsak nima bo'ladi: ${step.whatIfChanged}`, {
      size: 9.5,
      color: [51, 65, 85],
      extraBottom: 2,
    });

    writeParagraph(`Ko'p qilinadigan xato: ${step.commonMistake}`, {
      size: 9.5,
      color: [146, 64, 14],
      extraBottom: 5,
    });
  }

  // Key Concepts
  if (lesson.keyConcepts.length > 0) {
    ensureSpace(20);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    writeSectionLabel("Darsdagi asosiy so'zlar", [29, 78, 216]);
    for (const item of lesson.keyConcepts) {
      writeParagraph(`${item.term}: ${item.meaning} (Vazifasi: ${item.roleInTopic})`, {
        size: 9.5,
        color: [30, 41, 59],
        extraBottom: 2,
      });
    }
    y += 2;
  }

  // Quick Quizzes
  if (lesson.whyQuizzes.length > 0) {
    ensureSpace(20);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    writeSectionLabel('Tekshiruv savollari va javoblari', [29, 78, 216]);
    lesson.whyQuizzes.forEach((quiz, idx) => {
      writeParagraph(`${idx + 1}. ${quiz.question}`, {
        size: 10,
        style: 'bold',
        color: [15, 23, 42],
        extraBottom: 1.5,
      });
      writeParagraph(
        `To'g'ri javob: ${quiz.options[quiz.correctIndex] || ''} - ${quiz.whyExplanation}`,
        {
          size: 9.5,
          indent: 3,
          color: [6, 78, 59],
          extraBottom: 3,
        },
      );
    });
  }

  // Page numbers footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Ustoz AI | Shaxsiy oquv konspekti', margin, pageHeight - 8);
    doc.text(`${p} / ${totalPages}`, pageWidth - margin - 10, pageHeight - 8);
  }

  doc.save(`ustoz-ai-${makeSlug(lesson.title)}.pdf`);
}
