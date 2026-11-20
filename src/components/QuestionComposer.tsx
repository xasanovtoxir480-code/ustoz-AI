import React, { useRef, useState } from 'react';
import { ArrowRight, BookOpen, FileUp, ImagePlus, Loader2, X } from 'lucide-react';
import type { TeachingLevel } from '../types/lesson';

interface QuestionComposerProps {
  onSubmitQuestion: (payload: {
    question: string;
    level: TeachingLevel;
    subjectHint: string;
    imageBase64?: string;
    imageMimeType?: string;
    imagePreviewUrl?: string;
  }) => void;
  onOpenPdfAssistant: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
}

const LEVELS: { id: TeachingLevel; label: string; hint: string }[] = [
  { id: 'beginner', label: 'Noldan (Oddiy)', hint: "Juda sodda va hayotiy misollar bilan" },
  { id: 'intermediate', label: "O'rta", hint: 'Tushunarli qadamlar va amaliy misollar' },
  { id: 'deep', label: 'Batafsil', hint: "To'liq tahlil va chuqur sabablar" },
];

const SUBJECTS = [
  'Barcha mavzular',
  'Matematika',
  'Dasturlash',
  'Fizika va Kimyo',
  'Ingliz tili',
  'Tarix va Mantiq',
  'Iqtisodiyot',
];

export function QuestionComposer({
  onSubmitQuestion,
  onOpenPdfAssistant,
  isLoading,
  errorMessage,
  onDismissError,
}: QuestionComposerProps) {
  const [question, setQuestion] = useState('');
  const [level, setLevel] = useState<TeachingLevel>('beginner');
  const [subjectHint, setSubjectHint] = useState('Barcha mavzular');
  const [imageState, setImageState] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
    name: string;
  } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageError('Iltimos, faqat rasm faylini (PNG, JPG, WebP) tanlang.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Rasm hajmi 5 MB dan oshmasligi kerak.");
      return;
    }

    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) return;
      setImageState({
        base64: result.slice(commaIndex + 1),
        mimeType: file.type,
        previewUrl: result,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const submitPayload = () => {
    if (!question.trim() || isLoading) return;
    onSubmitQuestion({
      question: question.trim(),
      level,
      subjectHint: subjectHint === 'Barcha mavzular' ? '' : subjectHint,
      imageBase64: imageState?.base64,
      imageMimeType: imageState?.mimeType,
      imagePreviewUrl: imageState?.previewUrl,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitPayload();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submitPayload();
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-sky-400 tracking-wide mb-2">
              Oddiy tilda · Qadamma-qadam · Sababi bilan
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight text-balance">
              Nimani tushunmayapsiz? So&apos;rang — barchasini sodda qilib tushuntiramiz
            </h1>
            <p className="mt-3 text-base text-slate-300 leading-relaxed max-w-2xl">
              Ustoz AI sizga qiyin so&apos;zlarsiz tushuntiradi: avval aniq javobni beradi, keyin
              uni qo&apos;lingiz bilan qanday qilishni mayda qadamlarda ko&apos;rsatadi va nima
              uchun shunday bo&apos;lishini oddiy misolda ochib beradi.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="ustoz-question-input"
                  className="block text-sm font-medium text-slate-200 mb-2"
                >
                  Savolingiz yoki o&apos;rganmoqchi bo&apos;lgan mavzuni yozing
                </label>
                <textarea
                  id="ustoz-question-input"
                  rows={4}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Masalan: Kasrlarni qanday qo'shamiz va nima uchun maxrajlarini bir xil qilish kerak? Yoki: Python da sikl (for loop) qanday ishlaydi?"
                  className="w-full rounded-lg border border-[#253C78] bg-[#081129] px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 transition-colors resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-medium text-slate-300 mb-2">
                    Qanday tushuntirsin?
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
                          title={item.hint}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="subject-select"
                    className="block text-xs font-medium text-slate-300 mb-2"
                  >
                    Qaysi fan? (ixtiyoriy)
                  </label>
                  <select
                    id="subject-select"
                    value={subjectHint}
                    onChange={(e) => setSubjectHint(e.target.value)}
                    className="w-full h-[38px] rounded-lg border border-[#253C78] bg-[#081129] px-3 text-sm text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  >
                    {SUBJECTS.map((subj) => (
                      <option key={subj} value={subj}>
                        {subj}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-200 bg-[#12224B] hover:bg-[#192F66] border border-[#253C78] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <ImagePlus className="w-4 h-4 text-sky-400" />
                      <span>Rasm yuklash</span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenPdfAssistant}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-sky-200 bg-[#12224B] hover:bg-[#192F66] border border-[#253C78] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FileUp className="w-4 h-4 text-sky-400" />
                      <span>PDF dan tushunmagan joyni ko&apos;rsatish</span>
                    </button>
                  </div>
                  {imageState && (
                    <div className="inline-flex items-center gap-2 text-xs text-slate-200 bg-[#12224B] border border-[#253C78] px-2.5 py-1.5 rounded-lg">
                      <img
                        src={imageState.previewUrl}
                        alt="Yuklangan masala"
                        className="w-6 h-6 rounded object-cover"
                      />
                      <span className="max-w-[140px] truncate">{imageState.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setImageState(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        aria-label="Rasmni olib tashlash"
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!question.trim() || isLoading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-[#1A2952] disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Dars tayyorlanmoqda...</span>
                    </>
                  ) : (
                    <>
                      <span>Darsni boshlash</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {imageError && (
                <p className="text-sm text-red-200 bg-red-950/60 border border-red-700/70 rounded-lg px-3.5 py-2.5">
                  {imageError}
                </p>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-3 text-sm text-red-200 bg-red-950/60 border border-red-700/70 rounded-lg px-4 py-3"
                >
                  <span>{errorMessage}</span>
                  <button
                    type="button"
                    onClick={onDismissError}
                    aria-label="Xatoni yopish"
                    className="text-red-300 hover:text-white shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="mt-6 pt-5 border-t border-[#1B2D5C] flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Oddiy tushuntirish</span>
            <span aria-hidden="true">·</span>
            <span>Mayda amaliy qadamlar</span>
            <span aria-hidden="true">·</span>
            <span>Nima uchun shundayligi</span>
            <span aria-hidden="true">·</span>
            <span>Darsdan so&apos;ng qisqa test</span>
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#0C1736] border border-[#1B2D5C] rounded-xl overflow-hidden flex flex-col">
          <div className="relative h-56 sm:h-64 lg:h-72 bg-[#081129] overflow-hidden border-b border-[#1B2D5C]">
            <img
              src="/src/assets/images/ustoz_studio_diagram_1795145535979.jpg"
              alt="Ustoz AI o'quv stoli va chizmasi"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-90"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div
              style={{ display: 'none' }}
              className="w-full h-full flex-col items-center justify-center bg-gradient-to-br from-[#0B1533] to-[#132556] text-slate-200 p-6 text-center"
            >
              <BookOpen className="w-10 h-10 text-sky-400 mb-2" />
              <span className="font-display font-semibold text-white">Ustoz AI Darsxonasi</span>
            </div>
          </div>

          <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Har bir dars 3 ta oddiy qismdan iborat
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Shunchaki yodlab qolmasdan, tushunib olishingiz uchun.
              </p>
            </div>

            <div className="space-y-4">
              <div className="pb-3 border-b border-[#1B2D5C]">
                <p className="text-sm font-semibold text-white">
                  01. Qanday bajariladi? (Mayda qadamlar)
                </p>
                <p className="mt-0.5 text-sm text-slate-300">
                  Birinchi nimadan boshlaysiz, keyin nima yozasiz — barchasi bitta-bitta
                  ko&apos;rsatiladi.
                </p>
              </div>

              <div className="pb-3 border-b border-[#1B2D5C]">
                <p className="text-sm font-semibold text-white">
                  02. Nima uchun shunday? (Oddiy sabab)
                </p>
                <p className="mt-0.5 text-sm text-slate-300">
                  Nega aynan shu yo&apos;l to&apos;g&apos;ri ekani va boshqacha qilsangiz nima
                  xato chiqishi tushuntiriladi.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white">
                  03. Qisqa imtihon va qayta tushuntirish
                </p>
                <p className="mt-0.5 text-sm text-slate-300">
                  Dars oxirida 5 ta tushunarli test yechasiz. Nimani tushunmagan bo&apos;lsangiz,
                  Ustoz AI o&apos;sha joyini qaytadan sodda o&apos;rgatadi.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
