import { ArrowRight, FileDown, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { exportLessonToPdf } from '../utils/exportLessonPdf';
import type { LessonData, TeachingLevel } from '../types/lesson';

interface HistorySectionProps {
  lessons: LessonData[];
  activeLessonId: string | null;
  onSelectLesson: (lesson: LessonData) => void;
  onDeleteLesson: (id: string) => void;
}

const LEVEL_LABELS: Record<TeachingLevel, string> = {
  beginner: 'Noldan',
  intermediate: "O'rta",
  deep: 'Batafsil',
};

export function HistorySection({
  lessons,
  activeLessonId,
  onSelectLesson,
  onDeleteLesson,
}: HistorySectionProps) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? lessons.filter(
        (l) =>
          l.title.toLowerCase().includes(query.toLowerCase()) ||
          l.subject.toLowerCase().includes(query.toLowerCase()) ||
          l.question.toLowerCase().includes(query.toLowerCase()),
      )
    : lessons;

  return (
    <section
      id="history"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-[#1B2D5C]"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium text-sky-400 mb-1">Saqlangan darslar</p>
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">
            Avval o&apos;qigan darslaringiz
          </h2>
        </div>

        {lessons.length > 0 && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mavzu yoki fan bo'yicha qidirish..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#0C1736] border border-[#253C78] rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>
        )}
      </div>

      {lessons.length === 0 ? (
        <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-8 text-center">
          <p className="text-base font-medium text-white">Hozircha o&apos;tilgan darslar yo&apos;q</p>
          <p className="mt-1 text-sm text-slate-400">
            Yuqorida savol yozing yoki tayyor mavzulardan birini tanlang — o&apos;qigan darslaringiz
            shu yerda saqlanadi.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6 text-sm text-slate-300">
          &laquo;{query}&raquo; bo&apos;yicha dars topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lesson) => {
            const isActive = lesson.id === activeLessonId;
            const dateStr = new Date(lesson.createdAt).toLocaleDateString('uz-UZ', {
              day: '2-digit',
              month: 'short',
            });
            return (
              <div
                key={lesson.id}
                className={`bg-[#0C1736] border rounded-xl p-5 flex flex-col justify-between transition-colors ${
                  isActive ? 'border-sky-400 bg-[#10204A]' : 'border-[#1B2D5C]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-sky-300">{lesson.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span>{LEVEL_LABELS[lesson.level]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{lesson.steps.length} qadam</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{dateStr}</span>
                      {lesson.completionStatus === 'completed' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-emerald-400 tabular-nums">
                            Tugatildi
                            {typeof lesson.lastExamScore === 'number'
                              ? ` (${lesson.lastExamScore}%)`
                              : ''}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteLesson(lesson.id)}
                      aria-label="Darsni o'chirish"
                      className="text-slate-400 hover:text-red-400 transition-colors p-1 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h3 className="font-display text-base font-semibold text-white line-clamp-2">
                    {lesson.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-300 line-clamp-2">{lesson.question}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1B2D5C] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectLesson(lesson)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>{isActive ? 'Hozir ochiq' : "Darsni ochish"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => exportLessonToPdf(lesson)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5 text-sky-400" />
                    <span>PDF yuklash</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
