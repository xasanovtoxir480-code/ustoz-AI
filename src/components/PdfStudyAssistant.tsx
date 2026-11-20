import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileDown,
  FileText,
  FileUp,
  Loader2,
} from 'lucide-react';
import { exportLessonToPdf } from '../utils/exportLessonPdf';
import { postJson } from '../utils/api';
import { extractPdfLocally } from '../utils/parsePdfClient';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import type {
  LessonData,
  PdfOutlineData,
  PdfOutlineSection,
  TeachingLevel,
} from '../types/lesson';

interface PdfStudyAssistantProps {
  activeLesson: LessonData | null;
  isGeneratingLesson: boolean;
  onBack: () => void;
  onAskFromPdf: (payload: {
    question: string;
    level: TeachingLevel;
    subjectHint: string;
    fileBase64?: string;
    fileMimeType?: string;
    pdfExtractedText?: string;
    pdfFocusContext: {
      documentTitle: string;
      selectedSections: PdfOutlineSection[];
    };
  }) => void;
}

const LEVELS: { id: TeachingLevel; label: string }[] = [
  { id: 'beginner', label: 'Noldan (Oddiy)' },
  { id: 'intermediate', label: "O'rta" },
  { id: 'deep', label: 'Batafsil' },
];

export function PdfStudyAssistant({
  activeLesson,
  isGeneratingLesson,
  onBack,
  onAskFromPdf,
}: PdfStudyAssistantProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const [pdfFile, setPdfFile] = useState<{
    name: string;
    sizeKb: number;
    base64: string;
    bytes: Uint8Array;
    extractedText: string;
  } | null>(null);

  const [outline, setOutline] = useState<PdfOutlineData | null>(null);
  const [isScanningOutline, setIsScanningOutline] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [selectedSectionNums, setSelectedSectionNums] = useState<number[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [level, setLevel] = useState<TeachingLevel>('beginner');
  const [fileError, setFileError] = useState<string | null>(null);

  const inspectPdfOutline = async (base64: string, fileName: string) => {
    setIsScanningOutline(true);
    setScanError(null);
    setOutline(null);
    setSelectedSectionNums([]);

    try {
      const data = await postJson<PdfOutlineData>(
        '/api/ustoz/pdf/outline',
        { pdfBase64: base64, fileName },
        {
          timeoutMs: 35000,
          timeoutMessage:
            "PDF ni o'qish 35 soniyadan oshdi. Pastdagi maydonga savolingizni yozib davom etishingiz mumkin.",
        },
      );
      setOutline(data);
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "PDF tahlilida xatolik yuz berdi.",
      );
    } finally {
      setIsScanningOutline(false);
    }
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Iltimos, faqat PDF (.pdf) fayl yuklang.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('PDF fayl hajmi 10 MB dan oshmasligi kerak.');
      return;
    }

    setFileError(null);
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const localExtraction = await extractPdfLocally(bytes, file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) return;
      const base64 = result.slice(commaIndex + 1);
      setPdfFile({
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        base64,
        bytes,
        extractedText: localExtraction.extractedText,
      });

      if (localExtraction.outline) {
        setScanError(null);
        setSelectedSectionNums([]);
        setOutline(localExtraction.outline);
      } else {
        inspectPdfOutline(base64, file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleSection = (sectionNumber: number) => {
    setSelectedSectionNums((prev) =>
      prev.includes(sectionNumber)
        ? prev.filter((n) => n !== sectionNumber)
        : [...prev, sectionNumber],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile || isGeneratingLesson) return;

    const chosenSections =
      outline?.sections.filter((s) => selectedSectionNums.includes(s.sectionNumber)) ?? [];

    const sectionTitles = chosenSections.map((s) => `${s.sectionNumber}. ${s.title}`).join(', ');
    const questionText = customNote.trim()
      ? customNote.trim()
      : chosenSections.length > 0
      ? `Yuklangan PDF darsdagi mana bu bo'limlarni tushunmadim: ${sectionTitles}. Iltimos, shularni oddiy tilda mayda qadamlargacha qayta tushuntiring.`
      : `Yuklangan "${pdfFile.name}" PDF darsdagi asosiy joylarni juda oddiy tilda mayda qadamlargacha tushuntirib bering.`;

    const hasExtractedText = pdfFile.extractedText.trim().length > 40;

    onAskFromPdf({
      question: questionText,
      level,
      subjectHint: outline?.subject || activeLesson?.subject || '',
      ...(hasExtractedText
        ? { pdfExtractedText: pdfFile.extractedText }
        : { fileBase64: pdfFile.base64, fileMimeType: 'application/pdf' }),
      pdfFocusContext: {
        documentTitle: outline?.documentTitle || pdfFile.name,
        selectedSections: chosenSections,
      },
    });
  };

  const canSubmit =
    Boolean(pdfFile) &&
    !isGeneratingLesson &&
    (selectedSectionNums.length > 0 || customNote.trim().length > 0 || Boolean(outline));

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#1B2D5C]">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ortga qaytish</span>
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            PDF darsdan tushunmagan joylarni ko&apos;rsating
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Yuklab olgan dars PDF faylingizni qayta yuklang, tushunmagan bo&apos;limingizni belgilang
            yoki yozing — Ustoz AI o&apos;sha joyini boshqacha sodda usulda tushuntirib beradi.
          </p>
        </div>

        {activeLesson && (
          <button
            type="button"
            onClick={() => exportLessonToPdf(activeLesson)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-[#0C1736] border border-[#253C78] hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-sky-400" />
            <span>Hozirgi darsni PDF yuklash</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
        className="hidden"
      />

      {!pdfFile ? (
        <div className="mt-6 bg-[#0C1736] border border-dashed border-[#2B468B] rounded-xl p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#132247] border border-[#253C78] flex items-center justify-center mx-auto">
            <FileUp className="w-6 h-6 text-sky-400" />
          </div>
          <div className="max-w-md mx-auto">
            <h2 className="font-display text-lg font-semibold text-white">
              Dars PDF faylini tanlang
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Ustoz AI dan yuklab olgan PDF konspektingizni yoki boshqa o&apos;quv PDF faylini
              yuklashingiz mumkin (maksimum 10 MB).
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
            >
              <FileUp className="w-4 h-4" />
              <span>PDF faylni tanlash</span>
            </button>
          </div>
          {fileError && (
            <p className="text-sm text-red-200 bg-red-950/60 border border-red-700/70 rounded-lg px-4 py-2.5 max-w-md mx-auto">
              {fileError}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Live PDF Preview */}
          <div className="lg:col-span-6 bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1B2D5C]">
              <div className="flex items-center gap-2 text-xs text-slate-300 min-w-0">
                <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="font-medium text-white truncate">{pdfFile.name}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums shrink-0">{pdfFile.sizeKb} KB</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Boshqa PDF tanlash
              </button>
            </div>

            <PdfCanvasViewer
              pdfBytes={pdfFile.bytes}
              onSelectPageNote={(pageNum) => {
                setCustomNote((prev) => {
                  const prefix = `${pageNum}-betdagi tushunmagan joyim: `;
                  return prev.trim() ? `${prev.trim()}\n${prefix}` : prefix;
                });
                noteInputRef.current?.focus();
              }}
            />
          </div>

          {/* Right: Extracted PDF Sections & Confusion Selector */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-6 bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6 space-y-6"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  1. PDF ichidan tushunmagan bo&apos;limni belgilang
                </h2>
                {selectedSectionNums.length > 0 && (
                  <span className="text-xs text-sky-400 font-medium tabular-nums">
                    {selectedSectionNums.length} ta tanlandi
                  </span>
                )}
              </div>

              {isScanningOutline ? (
                <div className="bg-[#081129] border border-[#1B2D5C] rounded-lg p-5 flex items-center gap-3 text-sm text-slate-300">
                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                  <span>PDF ichidagi mavzu va qadamlar o&apos;qilmoqda...</span>
                </div>
              ) : scanError ? (
                <div className="bg-amber-950/35 border border-amber-700/60 rounded-lg p-4 text-xs text-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p>{scanError}</p>
                    <p className="mt-1 text-slate-300">
                      Shunga qaramay, pastdagi maydonga PDF dan tushunmagan joyingizni yozishingiz
                      mumkin.
                    </p>
                  </div>
                </div>
              ) : outline && outline.sections.length > 0 ? (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  <p className="text-xs text-slate-400 mb-2">
                    Hujjat: <span className="text-slate-200 font-medium">{outline.documentTitle}</span>
                    {outline.subject ? ` · ${outline.subject}` : ''}
                  </p>
                  {outline.sections.map((section) => {
                    const checked = selectedSectionNums.includes(section.sectionNumber);
                    return (
                      <button
                        key={section.sectionNumber}
                        type="button"
                        onClick={() => toggleSection(section.sectionNumber)}
                        className={`w-full text-left flex items-start gap-3 p-3.5 rounded-lg border transition-colors cursor-pointer ${
                          checked
                            ? 'bg-blue-600/20 border-sky-400 text-white'
                            : 'bg-[#081129] border-[#1B2D5C] hover:border-sky-400/60 text-slate-200'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'border-[#334E96] bg-[#070E23]'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">
                              <span className="font-mono text-xs text-sky-400 mr-1.5 tabular-nums">
                                {String(section.sectionNumber).padStart(2, '0')}.
                              </span>
                              {section.title}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">
                              {section.pageHint}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                            {section.summary}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="pdf-confusion-note"
                className="block text-sm font-semibold text-white mb-2"
              >
                2. Aynan qaysi joyi tushunarsiz bo&apos;ldi? (yozing)
              </label>
              <textarea
                ref={noteInputRef}
                id="pdf-confusion-note"
                rows={3}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Masalan: 2-betdagi formulada minus qayerdan kelganini tushunmadim, yoki: shu qadamni boshqa oddiy misolda ko'rsating..."
                className="w-full rounded-lg border border-[#253C78] bg-[#081129] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 resize-y"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-2">
                Qanday darajada tushuntirsin?
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#081129] border border-[#1B2D5C] rounded-lg">
                {LEVELS.map((item) => {
                  const active = level === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLevel(item.id)}
                      className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:text-white hover:bg-[#132247]'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {fileError && (
              <p className="text-sm text-red-200 bg-red-950/60 border border-red-700/70 rounded-lg px-3.5 py-2.5">
                {fileError}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-[#1A2952] disabled:text-slate-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isGeneratingLesson ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Tushunmagan joylaringiz tayyorlanmoqda...</span>
                </>
              ) : (
                <>
                  <span>Belgilangan joylarni sodda qilib tushuntir</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
