import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileDown,
  FileUp,
  HelpCircle,
  Lightbulb,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import { ExamWorkspace } from './ExamWorkspace';
import { exportLessonToPdf } from '../utils/exportLessonPdf';
import { postJson } from '../utils/api';
import type {
  ExamData,
  ExamEvaluationResult,
  FollowUpMessage,
  FollowUpReply,
  LessonData,
  TeachingLevel,
} from '../types/lesson';

interface LessonSandboxProps {
  lesson: LessonData;
  onBackToComposer: () => void;
  onStartFollowUpTopic: (prompt: string) => void;
  onStartRemediation: (lesson: LessonData, result: ExamEvaluationResult) => void;
  onCompleteLesson: (lessonId: string, scorePercentage: number) => void;
  onOpenPdfAssistant: () => void;
}

const LEVEL_LABELS: Record<TeachingLevel, string> = {
  beginner: 'Noldan (Oddiy)',
  intermediate: "O'rta daraja",
  deep: 'Batafsil tahlil',
};

type DeckTab = 'tutor' | 'quiz' | 'concepts';

export function LessonSandbox({
  lesson,
  onBackToComposer,
  onStartFollowUpTopic,
  onStartRemediation,
  onCompleteLesson,
  onOpenPdfAssistant,
}: LessonSandboxProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isExamOpen, setIsExamOpen] = useState(false);
  const [checkedDetails, setCheckedDetails] = useState<Record<string, boolean>>({});
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [deckTab, setDeckTab] = useState<DeckTab>('tutor');

  // Quiz state
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  // Follow-up tutor state
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>([]);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  // On-demand exam cache per lesson (memory + localStorage to preserve API quota)
  const examCacheRef = useRef<Map<string, Promise<ExamData>>>(new Map());

  const getOrCreateExamPromise = useCallback(
    (forceRefresh = false): Promise<ExamData> => {
      if (!forceRefresh) {
        const existing = examCacheRef.current.get(lesson.id);
        if (existing) return existing;

        try {
          const savedRaw = localStorage.getItem('ustoz_ai_exams_v1');
          if (savedRaw) {
            const savedMap = JSON.parse(savedRaw) as Record<string, ExamData>;
            if (savedMap[lesson.id]?.questions?.length) {
              const cachedPromise = Promise.resolve(savedMap[lesson.id]);
              examCacheRef.current.set(lesson.id, cachedPromise);
              return cachedPromise;
            }
          }
        } catch {
          // Ignore localStorage read errors
        }
      }

      const promise = postJson<ExamData>(
        '/api/ustoz/exam/generate',
        {
          lessonTitle: lesson.title,
          subject: lesson.subject,
          level: lesson.level,
          directAnswer: lesson.directAnswer,
          steps: lesson.steps,
        },
        {
          timeoutMs: 48000,
          timeoutMessage: "Test tuzish 48 soniyadan oshdi. Qayta urinib ko'ring.",
        },
      )
        .then((exam) => {
          try {
            const savedRaw = localStorage.getItem('ustoz_ai_exams_v1');
            const savedMap = savedRaw ? (JSON.parse(savedRaw) as Record<string, ExamData>) : {};
            savedMap[lesson.id] = exam;
            const keys = Object.keys(savedMap);
            if (keys.length > 20) {
              delete savedMap[keys[0]];
            }
            localStorage.setItem('ustoz_ai_exams_v1', JSON.stringify(savedMap));
          } catch {
            // Ignore localStorage write errors
          }
          return exam;
        })
        .catch((err) => {
          examCacheRef.current.delete(lesson.id);
          throw err;
        });

      examCacheRef.current.set(lesson.id, promise);
      return promise;
    },
    [lesson.id, lesson.title, lesson.subject, lesson.level, lesson.directAnswer, lesson.steps],
  );

  useEffect(() => {
    setActiveStepIndex(0);
    setIsAutoPlaying(false);
    setIsExamOpen(false);
    setCheckedDetails({});
    setSelectedAnswers({});
    setFollowUpMessages([]);
    setFollowUpError(null);
    setDeckTab('tutor');
  }, [lesson.id]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    if (activeStepIndex >= lesson.steps.length - 1) {
      setIsAutoPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev >= lesson.steps.length - 1) {
          setIsAutoPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 6500);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying, activeStepIndex, lesson.steps.length]);

  const currentStep = lesson.steps[activeStepIndex] ?? lesson.steps[0];

  const toggleDetailCheck = (stepNum: number, idx: number) => {
    const key = `${lesson.id}_${stepNum}_${idx}`;
    setCheckedDetails((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyExample = async (text: string, stepNum: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepNum);
      window.setTimeout(() => setCopiedStep(null), 1800);
    } catch {
      // Clipboard fallback not needed
    }
  };

  const sendFollowUp = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || isFollowUpLoading) return;

    const userMsg: FollowUpMessage = {
      id: `m_${Date.now()}_u`,
      role: 'student',
      text: trimmed,
      stepContext: currentStep?.stepNumber,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...followUpMessages, userMsg];
    setFollowUpMessages(nextHistory);
    setFollowUpInput('');
    setFollowUpError(null);
    setIsFollowUpLoading(true);
    setDeckTab('tutor');

    try {
      const reply = await postJson<FollowUpReply>(
        '/api/ustoz/followup',
        {
          lessonTitle: lesson.title,
          directAnswer: lesson.directAnswer,
          currentStep,
          followUpQuestion: trimmed,
          level: lesson.level,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        },
        {
          timeoutMs: 30000,
          timeoutMessage: "Javob kutish vaqti tugadi. Qayta urinib ko'ring.",
        },
      );

      const ustozMsg: FollowUpMessage = {
        id: `m_${Date.now()}_a`,
        role: 'ustoz',
        text: reply.directReply,
        stepContext: currentStep?.stepNumber,
        structuredReply: reply,
        createdAt: new Date().toISOString(),
      };
      setFollowUpMessages((prev) => [...prev, ustozMsg]);
    } catch (err) {
      setFollowUpError(
        err instanceof Error ? err.message : "Server bilan bog'lanib bo'lmadi.",
      );
    } finally {
      setIsFollowUpLoading(false);
    }
  };

  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendFollowUp(followUpInput);
  };

  const quickFollowUps = currentStep
    ? [
        `${currentStep.stepNumber}-qadamni yanada oddiy misolda ko'rsating`,
        `Nima uchun ${currentStep.stepNumber}-qadamda boshqacha qilmaymiz?`,
        `Bu qadamda odamlar nimada ko'proq adashadi?`,
      ]
    : [];

  const totalCheckedInCurrentStep = currentStep
    ? currentStep.howToDetails.filter(
        (_, idx) => checkedDetails[`${lesson.id}_${currentStep.stepNumber}_${idx}`],
      ).length
    : 0;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
      {/* Top Breadcrumb & Unboxed Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#1B2D5C]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <button
              type="button"
              onClick={onBackToComposer}
              className="inline-flex items-center gap-1.5 font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Yangi savol berish</span>
            </button>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-slate-200">{lesson.subject}</span>
            <span aria-hidden="true">·</span>
            <span>{LEVEL_LABELS[lesson.level]}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{lesson.steps.length} ta qadam</span>
            {lesson.isRemediation && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-sky-300">Qayta tushuntirish darsi</span>
              </>
            )}
            {lesson.completionStatus === 'completed' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-emerald-400 tabular-nums">
                  Tugatildi
                  {typeof lesson.lastExamScore === 'number'
                    ? ` (Test: ${lesson.lastExamScore}%)`
                    : ''}
                </span>
              </>
            )}
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance max-w-4xl">
            {lesson.title}
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl">
            <span className="font-medium text-white">Savolingiz:</span> {lesson.question}
          </p>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportLessonToPdf(lesson)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-slate-200 bg-[#0C1736] border border-[#253C78] hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-sky-400" />
            <span>PDF yuklab olish</span>
          </button>

          <button
            type="button"
            onClick={onOpenPdfAssistant}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-slate-200 bg-[#0C1736] border border-[#253C78] hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileUp className="w-4 h-4 text-sky-400" />
            <span>PDF dan so&apos;rash</span>
          </button>

          {!isExamOpen ? (
            <button
              type="button"
              onClick={() => {
                setIsAutoPlaying(false);
                setIsExamOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Imtihon topshirish</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsExamOpen(false)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-200 bg-[#0C1736] border border-[#253C78] hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Darsga qaytish</span>
            </button>
          )}
        </div>
      </div>

      {isExamOpen ? (
        <div className="mt-6">
          <ExamWorkspace
            lesson={lesson}
            loadExam={getOrCreateExamPromise}
            onExitExam={() => setIsExamOpen(false)}
            onJumpToStep={(stepNumber) => {
              const targetIdx = Math.max(
                0,
                Math.min(lesson.steps.length - 1, stepNumber - 1),
              );
              setIsExamOpen(false);
              setActiveStepIndex(targetIdx);
            }}
            onStartRemediation={(result) => onStartRemediation(lesson, result)}
            onCompleteLesson={(score) => onCompleteLesson(lesson.id, score)}
          />
        </div>
      ) : (
        <>
          {/* Direct Answer & Core Idea Strip */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wide mb-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Qisqa va aniq javob</span>
              </div>
              <p className="text-base text-slate-100 leading-relaxed">{lesson.directAnswer}</p>
            </div>

            <div className="lg:col-span-5 bg-[#09132E] border border-[#1B2D5C] rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300 uppercase tracking-wide mb-2">
                <Lightbulb className="w-4 h-4 shrink-0" />
                <span>Asosiy g&apos;oya (Nega shunday?)</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">{lesson.corePrinciple}</p>
              {lesson.prerequisites.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#1B2D5C] text-xs text-slate-400">
                  <span className="font-medium text-slate-200">Bilish foydali so&apos;zlar: </span>
                  {lesson.prerequisites.join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* Two-Zone Sandbox Layout */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT ZONE: Interactive Step-by-Step Stage */}
            <div className="lg:col-span-8 space-y-5">
              {/* Stage Progression & Playback Bar */}
              <div className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="text-xs font-medium text-slate-300 tabular-nums">
                    Qadam {activeStepIndex + 1} / {lesson.steps.length}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAutoPlaying(false);
                        setActiveStepIndex((prev) => Math.max(0, prev - 1));
                      }}
                      disabled={activeStepIndex === 0}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#132247] hover:bg-[#1B3063] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Oldingi</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (activeStepIndex >= lesson.steps.length - 1) {
                          setActiveStepIndex(0);
                          setIsAutoPlaying(true);
                        } else {
                          setIsAutoPlaying((prev) => !prev);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isAutoPlaying
                          ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                          : 'bg-blue-600 text-white hover:bg-blue-500'
                      }`}
                    >
                      {isAutoPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>To&apos;xtatish</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Navbat bilan o&apos;qish</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAutoPlaying(false);
                        setActiveStepIndex((prev) =>
                          Math.min(lesson.steps.length - 1, prev + 1),
                        );
                      }}
                      disabled={activeStepIndex >= lesson.steps.length - 1}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#132247] hover:bg-[#1B3063] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span>Keyingi</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAutoPlaying(false);
                        setActiveStepIndex(0);
                      }}
                      title="Boshidan boshlash"
                      aria-label="Boshidan boshlash"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-[#132247] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Boshidan</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Step Rail */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {lesson.steps.map((step, index) => {
                    const isCurrent = index === activeStepIndex;
                    const isCompleted = index < activeStepIndex;
                    return (
                      <button
                        key={step.stepNumber}
                        type="button"
                        onClick={() => {
                          setIsAutoPlaying(false);
                          setActiveStepIndex(index);
                        }}
                        className={`text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-blue-600/20 border-sky-400 text-white'
                            : isCompleted
                            ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-100 hover:border-emerald-500'
                            : 'bg-[#081129] border-[#1B2D5C] text-slate-300 hover:bg-[#101F47] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1">
                          <span
                            className={
                              isCurrent
                                ? 'text-sky-400 font-semibold'
                                : isCompleted
                                ? 'text-emerald-400 font-semibold'
                                : 'text-slate-400'
                            }
                          >
                            {String(step.stepNumber).padStart(2, '0')}.
                          </span>
                          {isCompleted && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                        <div className="text-xs font-medium truncate">{step.title}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Step Deep-Dive Card */}
              {currentStep && (
                <article className="bg-[#0C1736] border border-[#1B2D5C] rounded-xl p-6 sm:p-8 space-y-7">
                  <header className="pb-5 border-b border-[#1B2D5C]">
                    <div className="text-xs font-mono font-semibold text-sky-400 tabular-nums mb-1.5">
                      {String(currentStep.stepNumber).padStart(2, '0')}-QADAM
                    </div>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {currentStep.title}
                    </h2>
                    <p className="mt-2 text-base text-slate-300 leading-relaxed">
                      {currentStep.summary}
                    </p>
                  </header>

                  {/* 1. How To Use: Fine Micro-Details Checklist */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wide">
                        1. Qanday bajariladi? (Har bir mayda qadam)
                      </h3>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {totalCheckedInCurrentStep} / {currentStep.howToDetails.length} bajarildi
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {currentStep.howToDetails.map((detail, idx) => {
                        const key = `${lesson.id}_${currentStep.stepNumber}_${idx}`;
                        const checked = Boolean(checkedDetails[key]);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDetailCheck(currentStep.stepNumber, idx)}
                            className={`w-full text-left flex items-start gap-3 p-3.5 rounded-lg border transition-colors cursor-pointer ${
                              checked
                                ? 'bg-[#081129] border-[#1B2D5C] text-slate-400'
                                : 'bg-[#09132E] border-[#233970] hover:border-sky-400/70 text-slate-100'
                            }`}
                          >
                            <span
                              className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                checked
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'border-[#334E96] bg-[#070E23]'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5" />}
                            </span>
                            <span className="text-sm leading-relaxed">
                              <span className="font-mono text-xs text-sky-400 mr-2 tabular-nums">
                                {idx + 1}.
                              </span>
                              <span className={checked ? 'line-through' : ''}>{detail}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Practical Worked Example / Code / Formula */}
                  <div className="bg-[#060B1A] border border-[#1B2D5C] text-slate-100 rounded-xl p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-xs font-medium text-sky-300">
                        2. {currentStep.exampleLabel || 'Oddiy misol'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyExample(currentStep.practicalExample, currentStep.stepNumber)
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedStep === currentStep.stepNumber ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Nusxalandi</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Nusxa olish</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-100 overflow-x-auto">
                      {currentStep.practicalExample}
                    </pre>
                  </div>

                  {/* 3. Why Reasoning (Nega aynan shunday qilindi?) */}
                  <div className="bg-emerald-950/35 border border-emerald-700/60 rounded-xl p-5 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-1.5">
                        <Lightbulb className="w-4 h-4 shrink-0" />
                        <span>3. Nima uchun shunday qildik?</span>
                      </div>
                      <p className="text-sm sm:text-base text-slate-100 leading-relaxed">
                        {currentStep.whyReason}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-emerald-800/60 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300 mb-1">
                          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Boshqacha qilsak nima bo&apos;ladi?</span>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">
                          {currentStep.whatIfChanged}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Ko&apos;p qilinadigan xato (Ehtiyot bo&apos;ling)</span>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">
                          {currentStep.commonMistake}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Step Navigation Footer */}
                  <div className="pt-4 border-t border-[#1B2D5C] flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAutoPlaying(false);
                        setActiveStepIndex((prev) => Math.max(0, prev - 1));
                      }}
                      disabled={activeStepIndex === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-200 bg-[#132247] hover:bg-[#1B3063] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Oldingi qadam</span>
                    </button>

                    {activeStepIndex < lesson.steps.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAutoPlaying(false);
                          setActiveStepIndex((prev) => prev + 1);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span>Keyingi qadam</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAutoPlaying(false);
                          setIsExamOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        <span>Imtihon topshirish</span>
                      </button>
                    )}
                  </div>
                </article>
              )}
            </div>

            {/* RIGHT ZONE: Control, Follow-up Tutor & Concept Deck */}
            <aside className="lg:col-span-4 bg-[#0C1736] border border-[#1B2D5C] rounded-xl overflow-hidden lg:sticky lg:top-20">
              <div className="p-2 bg-[#081129] border-b border-[#1B2D5C] grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setDeckTab('tutor')}
                  className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    deckTab === 'tutor'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-[#132247]'
                  }`}
                >
                  Savol-javob
                </button>
                <button
                  type="button"
                  onClick={() => setDeckTab('quiz')}
                  className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    deckTab === 'quiz'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-[#132247]'
                  }`}
                >
                  Qisqa test ({lesson.whyQuizzes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeckTab('concepts')}
                  className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    deckTab === 'concepts'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-[#132247]'
                  }`}
                >
                  So&apos;zlar ({lesson.keyConcepts.length})
                </button>
              </div>

              <div className="p-5">
                {deckTab === 'tutor' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">
                        Tushunmagan joyingizni so&apos;rang
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Hozirgi {currentStep?.stepNumber}-qadam bo&apos;yicha bemalol savol bering.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      {quickFollowUps.map((prompt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isFollowUpLoading}
                          onClick={() => sendFollowUp(prompt)}
                          className="w-full text-left text-xs text-slate-200 hover:text-white bg-[#081129] hover:bg-[#132247] border border-[#1B2D5C] rounded-lg px-3 py-2 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>

                    {followUpMessages.length > 0 && (
                      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 pt-2 border-t border-[#1B2D5C]">
                        {followUpMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`rounded-lg p-3.5 text-sm ${
                              msg.role === 'student'
                                ? 'bg-blue-950/60 border border-blue-700/70 text-white'
                                : 'bg-[#081129] border border-[#1B2D5C] text-slate-200 space-y-2.5'
                            }`}
                          >
                            {msg.role === 'student' ? (
                              <div>
                                <span className="block text-xs font-medium text-sky-300 mb-1">
                                  Sizning savolingiz
                                  {msg.stepContext ? ` · ${msg.stepContext}-qadam` : ''}
                                </span>
                                <p>{msg.text}</p>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <span className="block text-xs font-semibold text-white mb-1">
                                    Ustoz AI javobi
                                  </span>
                                  <p className="leading-relaxed">
                                    {msg.structuredReply?.directReply || msg.text}
                                  </p>
                                </div>
                                {msg.structuredReply?.howToApply &&
                                  msg.structuredReply.howToApply.length > 0 && (
                                    <div className="pt-2 border-t border-[#1B2D5C]">
                                      <span className="block text-xs font-semibold text-sky-300 mb-1">
                                        Qanday qilinadi:
                                      </span>
                                      <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                                        {msg.structuredReply.howToApply.map((item, i) => (
                                          <li key={i}>{item}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                {msg.structuredReply?.whyItWorks && (
                                  <div className="pt-2 border-t border-[#1B2D5C]">
                                    <span className="block text-xs font-semibold text-emerald-300 mb-0.5">
                                      Sababi:
                                    </span>
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                      {msg.structuredReply.whyItWorks}
                                    </p>
                                  </div>
                                )}
                                {msg.structuredReply?.example && (
                                  <pre className="font-mono text-xs bg-[#050914] border border-[#1B2D5C] text-slate-100 rounded-md p-2.5 whitespace-pre-wrap overflow-x-auto">
                                    {msg.structuredReply.example}
                                  </pre>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {followUpError && (
                      <p className="text-xs text-red-200 bg-red-950/60 border border-red-700/70 rounded-lg p-2.5">
                        {followUpError}
                      </p>
                    )}

                    <form onSubmit={handleFollowUpSubmit} className="pt-2 border-t border-[#1B2D5C]">
                      <label htmlFor="followup-input" className="sr-only">
                        Qo&apos;shimcha savol yozing
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="followup-input"
                          type="text"
                          value={followUpInput}
                          onChange={(e) => setFollowUpInput(e.target.value)}
                          placeholder="Savolingizni yozing..."
                          className="flex-1 min-w-0 px-3 py-2 text-sm bg-[#081129] border border-[#253C78] rounded-lg text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!followUpInput.trim() || isFollowUpLoading}
                          aria-label="Savolni yuborish"
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-[#1A2952] text-white rounded-lg transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isFollowUpLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {deckTab === 'quiz' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">
                        Tushunganingizni tekshiring
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Quyidagi oddiy savollarga javob belgilab o&apos;zingizni sinab ko&apos;ring.
                      </p>
                    </div>

                    {lesson.whyQuizzes.map((quiz, qIdx) => {
                      const chosen = selectedAnswers[qIdx];
                      const isAnswered = chosen !== undefined;
                      const isCorrect = chosen === quiz.correctIndex;

                      return (
                        <div
                          key={qIdx}
                          className="pb-5 border-b border-[#1B2D5C] last:border-b-0 last:pb-0 space-y-2.5"
                        >
                          <p className="text-sm font-medium text-white leading-snug">
                            <span className="font-mono text-xs text-sky-400 mr-1.5 tabular-nums">
                              {qIdx + 1}.
                            </span>
                            {quiz.question}
                          </p>

                          <div className="space-y-1.5">
                            {quiz.options.map((opt, optIdx) => {
                              const selected = chosen === optIdx;
                              const rightOption = optIdx === quiz.correctIndex;
                              let styleClass =
                                'bg-[#081129] border-[#1B2D5C] text-slate-200 hover:border-sky-400/70';

                              if (isAnswered) {
                                if (rightOption) {
                                  styleClass =
                                    'bg-emerald-950/60 border-emerald-500 text-emerald-100 font-medium';
                                } else if (selected) {
                                  styleClass = 'bg-red-950/60 border-red-500 text-red-100';
                                } else {
                                  styleClass =
                                    'bg-[#081129]/60 border-[#1B2D5C]/60 text-slate-500';
                                }
                              }

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() =>
                                    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))
                                  }
                                  className={`w-full text-left px-3 py-2.5 text-xs rounded-lg border transition-colors flex items-start justify-between gap-2 cursor-pointer ${styleClass}`}
                                >
                                  <span>{opt}</span>
                                  {isAnswered && rightOption && (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  )}
                                  {isAnswered && selected && !rightOption && (
                                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {isAnswered && (
                            <div
                              className={`p-3 rounded-lg border text-xs leading-relaxed ${
                                isCorrect
                                  ? 'bg-emerald-950/45 border-emerald-700/70 text-emerald-100'
                                  : 'bg-amber-950/40 border-amber-700/70 text-amber-100'
                              }`}
                            >
                              <span className="font-semibold block mb-0.5">
                                {isCorrect ? "To'g'ri! Sababi:" : 'Noto‘g‘ri. To‘g‘ri sabab:'}
                              </span>
                              {quiz.whyExplanation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {deckTab === 'concepts' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white mb-3">
                        Darsdagi asosiy so&apos;zlar
                      </h3>
                      <div className="space-y-3">
                        {lesson.keyConcepts.map((item, idx) => (
                          <div
                            key={idx}
                            className="pb-3 border-b border-[#1B2D5C] last:border-b-0 last:pb-0"
                          >
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                              <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <span>{item.term}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                              {item.meaning}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              <span className="font-medium text-slate-200">Vazifasi: </span>
                              {item.roleInTopic}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {lesson.nextPracticePrompts.length > 0 && (
                      <div className="pt-4 border-t border-[#1B2D5C]">
                        <h4 className="font-display text-sm font-semibold text-white mb-2">
                          Keyingi o&apos;rganish uchun mavzular
                        </h4>
                        <div className="space-y-2">
                          {lesson.nextPracticePrompts.map((prompt, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onStartFollowUpTopic(prompt)}
                              className="w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-sky-200 bg-[#081129] hover:bg-[#132247] border border-[#253C78] rounded-lg transition-colors cursor-pointer"
                            >
                              <span>{prompt}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
