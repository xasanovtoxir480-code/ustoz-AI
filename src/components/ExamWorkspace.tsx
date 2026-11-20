import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { postJson } from '../utils/api';
import type {
  ExamData,
  ExamEvaluationResult,
  LessonData,
  TeachingLevel,
} from '../types/lesson';

interface ExamWorkspaceProps {
  lesson: LessonData;
  loadExam: (forceRefresh?: boolean) => Promise<ExamData>;
  onExitExam: () => void;
  onJumpToStep: (stepNumber: number) => void;
  onStartRemediation: (result: ExamEvaluationResult) => void;
  onCompleteLesson: (scorePercentage: number) => void;
}

const LEVEL_LABELS: Record<TeachingLevel, string> = {
  beginner: 'Noldan (Oddiy)',
  intermediate: "O'rta daraja",
  deep: 'Batafsil',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function ExamWorkspace({
  lesson,
  loadExam,
  onExitExam,
  onJumpToStep,
  onStartRemediation,
  onCompleteLesson,
}: ExamWorkspaceProps) {
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const [result, setResult] = useState<ExamEvaluationResult | null>(null);
  const [lessonCompletedConfirmed, setLessonCompletedConfirmed] = useState(false);

  const generateExam = async (forceRefresh = false) => {
    setIsGenerating(true);
    setGenerateError(null);
    setResult(null);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setLessonCompletedConfirmed(false);

    try {
      const data = await loadExam(forceRefresh);
      setExamData(data);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Test savollarini yuklab bo'lmadi.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    generateExam(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const handleSubmitExam = async () => {
    if (!examData || isEvaluating) return;
    setIsEvaluating(true);
    setEvaluateError(null);

    try {
      const data = await postJson<ExamEvaluationResult>(
        '/api/ustoz/exam/evaluate',
        {
          lessonTitle: lesson.title,
          level: lesson.level,
          questions: examData.questions,
          selectedAnswers,
        },
        {
          timeoutMs: 25000,
          timeoutMessage: "Natijani tekshirish kechikdi. Qayta bosib ko'ring.",
        },
      );
      setResult(data);
    } catch (err) {
      setEvaluateError(
        err instanceof Error ? err.message : "Server bilan bog'lanib bo'lmadi.",
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  if (isGenerating) {
    return (
      <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-8 sm:p-12 text-center space-y-4">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            Sizning darajangizga mos 5 ta savol tuzilmoqda
          </h2>
          <p className="mt-1.5 text-sm text-slate-300 max-w-md mx-auto">
            Ustoz AI darsdagi misollar asosida oddiy va tushunarli tekshiruv testini tayyorlamoqda (
            {LEVEL_LABELS[lesson.level]}).
          </p>
        </div>
      </div>
    );
  }

  if (generateError) {
    return (
      <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-8 space-y-4">
        <div className="flex items-start gap-3 text-red-200 bg-red-950/60 border border-red-700/70 rounded-lg p-4 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Testni yuklashda xatolik</p>
            <p className="mt-1">{generateError}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => generateExam(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Qayta urinish</span>
          </button>
          <button
            type="button"
            onClick={onExitExam}
            className="px-4 py-2 text-sm font-medium text-slate-200 bg-[#132247] hover:bg-[#1B3063] rounded-lg transition-colors cursor-pointer"
          >
            Darsga qaytish
          </button>
        </div>
      </div>
    );
  }

  if (!examData || examData.questions.length === 0) {
    return null;
  }

  // RESULTS VIEW
  if (result) {
    const needsRemediation = result.recommendation === 'remediate';

    return (
      <div className="space-y-6">
        <div
          className={`rounded-xl border p-6 sm:p-8 ${
            result.passed
              ? 'bg-emerald-950/40 border-emerald-700/70'
              : 'bg-amber-950/35 border-amber-700/70'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              {result.passed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300">Mavzuni yaxshi tushundingiz</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="text-amber-300">
                    Ba&apos;zi joylarni qayta ko&apos;rib chiqamiz
                  </span>
                </>
              )}
            </div>

            <div className="font-mono text-sm font-bold text-white tabular-nums">
              Natija: {result.correctCount} / {result.totalCount} ({result.percentage}%)
            </div>
          </div>

          <h2 className="font-display text-2xl font-bold text-white">
            Imtihon natijasi va Ustoz xulosasi
          </h2>
          <p className="mt-2.5 text-base text-slate-200 leading-relaxed">{result.ustozSummary}</p>

          <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center gap-3">
            {lessonCompletedConfirmed ? (
              <div className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-emerald-100 bg-emerald-900/60 border border-emerald-500 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Dars tugatildi deb belgilandi</span>
              </div>
            ) : needsRemediation ? (
              <>
                <button
                  type="button"
                  onClick={() => onStartRemediation(result)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Tushunmagan joylarni qayta o&apos;qitish</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCompleteLesson(result.percentage);
                    setLessonCompletedConfirmed(true);
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-slate-200 bg-[#0C1736] border border-[#253C78] hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Darsni yakunlash
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCompleteLesson(result.percentage);
                    setLessonCompletedConfirmed(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Darsni yakunlash</span>
                </button>
                {result.misunderstoodTopics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onStartRemediation(result)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-sky-200 bg-[#0C1736] border border-[#253C78] hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Xato joyni qayta ko&apos;rish</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => generateExam(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-200 bg-[#0C1736] border border-[#253C78] hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Testni qayta yechish</span>
            </button>

            <button
              type="button"
              onClick={onExitExam}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Darsga qaytish</span>
            </button>
          </div>
        </div>

        {/* Understood vs Misunderstood Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Nimalarni yaxshi tushundingiz</span>
            </div>
            {result.understoodTopics.length === 0 ? (
              <p className="text-sm text-slate-400">
                Hali to&apos;liq tushunilgan qism yo&apos;q — birgalikda boshidan sodda qilib
                ko&apos;rib chiqamiz.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {result.understoodTopics.map((topic, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{topic}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300 uppercase tracking-wide mb-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Nimalarni tushunmadingiz</span>
            </div>
            {result.misunderstoodTopics.length === 0 ? (
              <p className="text-sm text-slate-300">
                Xatolar yo&apos;q! Hamma bosqichni to&apos;g&apos;ri tushungansiz.
              </p>
            ) : (
              <div className="space-y-4">
                {result.misunderstoodTopics.map((gap, i) => (
                  <div
                    key={i}
                    className="pb-3 border-b border-[#1B2D5C] last:border-b-0 last:pb-0 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{gap.topic}</span>
                      <button
                        type="button"
                        onClick={() => onJumpToStep(gap.relatedStepNumber)}
                        className="text-xs font-medium text-sky-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {gap.relatedStepNumber}-qadamga o&apos;tish
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{gap.gapReason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Per-question detailed review */}
        <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6 space-y-5">
          <h3 className="font-display text-lg font-semibold text-white">
            Savollarning to&apos;g&apos;ri javoblari va izohi
          </h3>
          <div className="space-y-5">
            {examData.questions.map((q, idx) => {
              const review = result.answersReview[idx];
              const isCorrect = review?.isCorrect;
              const chosenIdx = review?.selectedIndex ?? -1;

              return (
                <div
                  key={q.id}
                  className="pb-5 border-b border-[#1B2D5C] last:border-b-0 last:pb-0 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sky-400 tabular-nums">
                        {String(q.questionNumber).padStart(2, '0')}.
                      </span>
                      <span className="text-slate-300">{q.conceptTested}</span>
                      <span aria-hidden="true">·</span>
                      <span>{q.relatedStepNumber}-qadam</span>
                    </div>
                    <div className="inline-flex items-center gap-1 font-semibold">
                      {isCorrect ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">To&apos;g&apos;ri</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-red-300">Xato</span>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-medium text-white">{q.question}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div
                      className={`p-2.5 rounded-lg border ${
                        isCorrect
                          ? 'bg-emerald-950/50 border-emerald-700/70 text-emerald-100'
                          : 'bg-red-950/50 border-red-700/70 text-red-100'
                      }`}
                    >
                      <span className="block font-semibold mb-0.5">Sizning javobingiz:</span>
                      <span>
                        {chosenIdx >= 0 && q.options[chosenIdx]
                          ? q.options[chosenIdx]
                          : 'Belgilanmagan'}
                      </span>
                    </div>
                    {!isCorrect && (
                      <div className="p-2.5 rounded-lg border bg-emerald-950/50 border-emerald-700/70 text-emerald-100">
                        <span className="block font-semibold mb-0.5">To&apos;g&apos;ri javob:</span>
                        <span>{q.options[q.correctIndex]}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed bg-[#081129] rounded-lg p-3 border border-[#1B2D5C]">
                    <span className="font-semibold text-white">Sababi: </span>
                    {q.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // EXAM TAKING VIEW
  const activeQ = examData.questions[currentIndex];
  const answeredCount = Object.keys(selectedAnswers).length;
  const allAnswered = answeredCount === examData.questions.length;

  return (
    <div className="space-y-5">
      <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-medium text-sky-400">Imtihon testi</span>
              <span aria-hidden="true">·</span>
              <span>{LEVEL_LABELS[lesson.level]}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {answeredCount} / {examData.questions.length} belgilandi
              </span>
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-white">
              {examData.examTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onExitExam}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#132247] hover:bg-[#1B3063] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Darsga qaytish</span>
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {examData.questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const isAnswered = selectedAnswers[idx] !== undefined;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`py-2 px-3 rounded-lg border text-xs font-mono font-medium tabular-nums transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-blue-600/25 border-sky-400 text-white font-semibold'
                    : isAnswered
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#081129] border-[#1B2D5C] text-slate-300 hover:bg-[#132247]'
                }`}
              >
                {String(q.questionNumber).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </div>

      {activeQ && (
        <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-2">
              <span className="font-mono font-semibold text-sky-400 tabular-nums">
                SAVOL {String(activeQ.questionNumber).padStart(2, '0')} /{' '}
                {String(examData.questions.length).padStart(2, '0')}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {activeQ.questionType === 'why_logic' ? 'Sababini toping' : 'Amaliy savol'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeQ.conceptTested}</span>
            </div>

            <h3 className="font-display text-lg sm:text-xl font-semibold text-white leading-snug">
              {activeQ.question}
            </h3>
          </div>

          <div className="space-y-2.5">
            {activeQ.options.map((option, optIdx) => {
              const isSelected = selectedAnswers[currentIndex] === optIdx;
              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() =>
                    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: optIdx }))
                  }
                  className={`w-full text-left flex items-start gap-3.5 p-4 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/20 border-sky-400 text-white'
                      : 'bg-[#081129] border-[#1B2D5C] hover:border-sky-400/60 text-slate-200'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-md font-mono text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-[#132247] text-slate-300'
                    }`}
                  >
                    {OPTION_LETTERS[optIdx] || optIdx + 1}
                  </span>
                  <span className="text-sm sm:text-base leading-relaxed">{option}</span>
                </button>
              );
            })}
          </div>

          {evaluateError && (
            <div className="text-sm text-red-200 bg-red-950/60 border border-red-700/70 rounded-lg px-4 py-3">
              {evaluateError}
            </div>
          )}

          <div className="pt-4 border-t border-[#1B2D5C] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-200 bg-[#132247] hover:bg-[#1B3063] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Oldingi savol</span>
            </button>

            <div className="flex items-center gap-3">
              {currentIndex < examData.questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((prev) =>
                      Math.min(examData.questions.length - 1, prev + 1),
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Keyingi savol</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!allAnswered || isEvaluating}
                  onClick={handleSubmitExam}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:bg-[#1A2952] disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isEvaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Tekshirilmoqda...</span>
                    </>
                  ) : (
                    <>
                      <span>Natijani ko&apos;rish</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {!allAnswered && currentIndex === examData.questions.length - 1 && (
            <p className="text-xs text-slate-400 text-right">
              Natijani ko&apos;rish uchun barcha {examData.questions.length} ta savolga javob
              belgilang ({examData.questions.length - answeredCount} ta qoldi).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
