import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Header } from './components/Header';
import { QuestionComposer } from './components/QuestionComposer';
import { LessonSandbox } from './components/LessonSandbox';
import { TopicsExplorer } from './components/TopicsExplorer';
import { HistorySection } from './components/HistorySection';
import { MethodologySection } from './components/MethodologySection';
import { PdfStudyAssistant } from './components/PdfStudyAssistant';
import { postJson } from './utils/api';
import type {
  ExamEvaluationResult,
  LessonData,
  MisunderstoodItem,
  PdfOutlineSection,
  StarterTopic,
  TeachingLevel,
} from './types/lesson';

const STORAGE_KEY = 'ustoz_ai_lessons_v1';

export default function App() {
  const [lessons, setLessons] = useState<LessonData[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as LessonData[]) : [];
    } catch {
      return [];
    }
  });

  const [activeLesson, setActiveLesson] = useState<LessonData | null>(null);
  const [viewMode, setViewMode] = useState<'composer' | 'sandbox' | 'pdf'>('composer');
  const [activeNav, setActiveNav] = useState<
    'composer' | 'sandbox' | 'topics' | 'history' | 'methodology'
  >('composer');
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingTopicLabel, setLoadingTopicLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons.slice(0, 30)));
    } catch {
      // Ignore storage quota errors
    }
  }, [lessons]);

  const requestLesson = async (payload: {
    question: string;
    level: TeachingLevel;
    subjectHint: string;
    imageBase64?: string;
    imageMimeType?: string;
    fileBase64?: string;
    fileMimeType?: string;
    remediationContext?: {
      previousLessonTitle: string;
      misunderstoodTopics: MisunderstoodItem[];
    };
    pdfFocusContext?: {
      documentTitle: string;
      selectedSections: PdfOutlineSection[];
    };
  }) => {
    setIsLoading(true);
    setErrorMessage(null);
    setLoadingTopicLabel(payload.question);

    try {
      const newLesson = await postJson<LessonData>('/api/ustoz/teach', payload, {
        timeoutMs: 45000,
        timeoutMessage:
          "Javob kutish 45 soniyadan oshdi va to'xtatildi. Iltimos, qayta urinib ko'ring.",
      });

      setLessons((prev) => [newLesson, ...prev]);
      setActiveLesson(newLesson);
      setViewMode('sandbox');
      setActiveNav('sandbox');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Server bilan bog'lanishda xatolik yuz berdi.",
      );
      setViewMode('composer');
      setActiveNav('composer');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsLoading(false);
      setLoadingTopicLabel(null);
    }
  };

  const handleSelectStarter = (topic: StarterTopic) => {
    requestLesson({
      question: topic.question,
      level: topic.level,
      subjectHint: topic.subject,
    });
  };

  const handleNavigate = (
    section: 'composer' | 'sandbox' | 'topics' | 'history' | 'methodology',
  ) => {
    setActiveNav(section);
    if (section === 'composer') {
      setViewMode('composer');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (section === 'sandbox' && activeLesson) {
      setViewMode('sandbox');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const element = document.getElementById(section);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleNewQuestion = () => {
    setViewMode('composer');
    setActiveNav('composer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => {
      document.getElementById('ustoz-question-input')?.focus();
    }, 150);
  };

  const handleDeleteLesson = (id: string) => {
    setLessons((prev) => prev.filter((item) => item.id !== id));
    if (activeLesson?.id === id) {
      setActiveLesson(null);
      setViewMode('composer');
      setActiveNav('composer');
    }
  };

  const handleStartRemediation = (lesson: LessonData, result: ExamEvaluationResult) => {
    const focusPrompt =
      result.remediationFocusPrompt?.trim() ||
      `Oldingi "${lesson.title}" darsidagi tushunilmagan joylarni juda oddiy tilda qayta tushuntirib bering: ${result.misunderstoodTopics
        .map((m) => m.topic)
        .join(', ')}`;

    requestLesson({
      question: focusPrompt,
      level: lesson.level,
      subjectHint: lesson.subject,
      remediationContext: {
        previousLessonTitle: lesson.title,
        misunderstoodTopics: result.misunderstoodTopics,
      },
    });
  };

  const handleCompleteLesson = (lessonId: string, scorePercentage: number) => {
    setLessons((prev) =>
      prev.map((item) =>
        item.id === lessonId
          ? {
              ...item,
              completionStatus: 'completed',
              lastExamScore: scorePercentage,
            }
          : item,
      ),
    );
    setActiveLesson((prev) =>
      prev && prev.id === lessonId
        ? {
            ...prev,
            completionStatus: 'completed',
            lastExamScore: scorePercentage,
          }
        : prev,
    );
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#070E23] text-slate-50">
      <Header
        activeSection={activeNav}
        hasActiveLesson={Boolean(activeLesson)}
        onNavigate={handleNavigate}
        onNewQuestion={handleNewQuestion}
      />

      {isLoading && (
        <div className="bg-blue-700 border-b border-blue-500 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <div className="truncate">
                <span className="font-semibold">Ustoz AI dars tayyorlamoqda: </span>
                <span className="text-blue-100">{loadingTopicLabel}</span>
              </div>
            </div>
            <span className="font-mono text-xs text-blue-100 tabular-nums shrink-0">
              {elapsedSec}s
            </span>
          </div>
        </div>
      )}

      <main className="flex-1">
        {viewMode === 'pdf' ? (
          <PdfStudyAssistant
            activeLesson={activeLesson}
            isGeneratingLesson={isLoading}
            onBack={() => {
              setViewMode(activeLesson ? 'sandbox' : 'composer');
              setActiveNav(activeLesson ? 'sandbox' : 'composer');
            }}
            onAskFromPdf={(payload) => requestLesson(payload)}
          />
        ) : viewMode === 'sandbox' && activeLesson ? (
          <LessonSandbox
            lesson={activeLesson}
            onBackToComposer={handleNewQuestion}
            onStartFollowUpTopic={(prompt) =>
              requestLesson({
                question: prompt,
                level: activeLesson.level,
                subjectHint: activeLesson.subject,
              })
            }
            onStartRemediation={handleStartRemediation}
            onCompleteLesson={handleCompleteLesson}
            onOpenPdfAssistant={() => {
              setViewMode('pdf');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <QuestionComposer
            onSubmitQuestion={requestLesson}
            onOpenPdfAssistant={() => {
              setViewMode('pdf');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onDismissError={() => setErrorMessage(null)}
          />
        )}

        <TopicsExplorer onSelectTopic={handleSelectStarter} isLoading={isLoading} />

        <HistorySection
          lessons={lessons}
          activeLessonId={activeLesson?.id ?? null}
          onSelectLesson={(lesson) => {
            setActiveLesson(lesson);
            setViewMode('sandbox');
            setActiveNav('sandbox');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onDeleteLesson={handleDeleteLesson}
        />

        <MethodologySection />
      </main>

      <footer className="bg-[#050A1A] border-t border-[#1B2D5C] mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <span>Ustoz AI · Oddiy tilda, qadamma-qadam va sababi bilan o&apos;rganing</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={handleNewQuestion}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Savol berish
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('topics')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Mavzular
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('methodology')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Qanday o&apos;rgatadi
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
