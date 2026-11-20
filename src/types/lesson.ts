export type TeachingLevel = 'beginner' | 'intermediate' | 'deep';

export interface LessonStep {
  stepNumber: number;
  title: string;
  summary: string;
  howToDetails: string[];
  exampleLabel: string;
  practicalExample: string;
  whyReason: string;
  whatIfChanged: string;
  commonMistake: string;
}

export interface ConceptItem {
  term: string;
  meaning: string;
  roleInTopic: string;
}

export interface WhyQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  whyExplanation: string;
}

export interface ExamQuestion {
  id: string;
  questionNumber: number;
  questionType: 'how_to' | 'why_logic';
  relatedStepNumber: number;
  conceptTested: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ExamData {
  examTitle: string;
  level: TeachingLevel;
  questions: ExamQuestion[];
}

export interface MisunderstoodItem {
  topic: string;
  gapReason: string;
  relatedStepNumber: number;
}

export interface ExamEvaluationResult {
  correctCount: number;
  totalCount: number;
  percentage: number;
  passed: boolean;
  recommendation: 'remediate' | 'complete';
  ustozSummary: string;
  understoodTopics: string[];
  misunderstoodTopics: MisunderstoodItem[];
  remediationFocusPrompt: string;
  answersReview: {
    questionNumber: number;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
  }[];
}

export interface LessonData {
  id: string;
  createdAt: string;
  question: string;
  title: string;
  subject: string;
  level: TeachingLevel;
  directAnswer: string;
  corePrinciple: string;
  prerequisites: string[];
  steps: LessonStep[];
  keyConcepts: ConceptItem[];
  whyQuizzes: WhyQuizQuestion[];
  nextPracticePrompts: string[];
  completionStatus?: 'in_progress' | 'completed';
  lastExamScore?: number;
  isRemediation?: boolean;
}

export interface FollowUpReply {
  directReply: string;
  howToApply: string[];
  whyItWorks: string;
  example: string;
}

export interface FollowUpMessage {
  id: string;
  role: 'student' | 'ustoz';
  text: string;
  stepContext?: number;
  structuredReply?: FollowUpReply;
  createdAt: string;
}

export interface StarterTopic {
  id: string;
  subject: string;
  level: TeachingLevel;
  title: string;
  question: string;
  focusNote: string;
}

export interface PdfOutlineSection {
  sectionNumber: number;
  title: string;
  summary: string;
  pageHint: string;
}

export interface PdfOutlineData {
  documentTitle: string;
  subject: string;
  sections: PdfOutlineSection[];
}

