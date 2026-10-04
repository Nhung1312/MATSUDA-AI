export type SocraticHintLevel = 'hint1' | 'hint2' | 'hint3' | 'chat';

export type StepStatus = 'correct' | 'first_error' | 'cascading_error' | 'independent_error' | 'uncertain';

export type StepErrorType =
  | 'sign'
  | 'calculation'
  | 'formula'
  | 'logical'
  | 'condition'
  | 'transformation'
  | 'concept'
  | 'other'
  | 'None';

export interface SocraticContext {
  questionId?: string;
  questionText: string;
  questionType?: string;
  grade?: string;
  topic?: string;
  answerOptions?: Array<{ id: string; text: string }>;
  studentCurrentAnswer?: string;
  studentWork?: string;
  detectedError?: string;
  errorType?: StepErrorType;
  firstErrorStep?: number;
  firstErrorLatex?: string;
  referenceStepLatex?: string;
  previousHints?: string[];
  currentHintLevel?: SocraticHintLevel;
}

export interface SocraticRequest {
  level: SocraticHintLevel;
  context: SocraticContext;
  studentMessage?: string;
  chatHistory?: Array<{ role: 'user' | 'model'; text: string }>;
}

export interface SocraticResponse {
  success: boolean;
  level: SocraticHintLevel;
  reply: string;
  modelUsed?: string;
  isFallback?: boolean;
  message?: string;
}

// ==========================================
// PHASE 4: STEP-BY-STEP GRADING & ANALYSIS TYPES
// ==========================================

export interface StepBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StepAnalysis {
  stepIndex: number; // 1-indexed: 1, 2, 3...
  stepNumber?: number;
  pageIndex?: number;
  studentLatex: string;
  studentText?: string;
  referenceStepLatex?: string;
  status: StepStatus;
  comment: string;
  errorType?: StepErrorType;
  correctionLatex?: string;
  isFirstError?: boolean;
  isFollowUpError?: boolean;
  isIndependentError?: boolean;
  confidence: number;
  bbox?: StepBBox | null;
}

export interface StepGradingRequest {
  questionId?: string;
  questionText: string;
  grade?: string;
  topic?: string;
  maxPoints?: number;
  correctAnswer?: string;
  rubric?: string;
  studentSolutionText?: string;
  essayImages?: string[]; // Base64 data URLs
}

export interface StepGradingResponse {
  success: boolean;
  analysis: StepAnalysis[];
  firstErrorStep: number | null;
  firstErrorType: StepErrorType | null;
  firstErrorExplanation: string | null;
  totalSteps: number;
  correctStepsCount: number;
  isAllCorrect: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  referenceSolution?: {
    steps: Array<{ stepNumber: number; solutionLatex: string; explanation: string }>;
    finalAnswerLatex: string;
  };
  analysisSource: 'ai' | 'rule' | 'unavailable';
  needsTeacherReview?: boolean;
  modelUsed?: string;
  message?: string;
}

export interface VerifyCorrectionRequest {
  questionText: string;
  grade?: string;
  topic?: string;
  originalWork?: string;
  firstErrorStep?: number;
  firstErrorLatex?: string;
  errorType?: StepErrorType;
  studentCorrection: string;
  correctionImage?: string;
}

export interface VerifyCorrectionResponse {
  success: boolean;
  isCorrect: boolean;
  isProgress: boolean;
  evaluationTitle: string;
  feedback: string;
  nextAdvice: string;
  source: 'ai' | 'rule';
  message?: string;
}

export interface RemedialGenerateRequest {
  sourceQuestionId?: string;
  sourceQuestionText: string;
  grade?: string;
  topic?: string;
  sourceErrorType: StepErrorType;
  sourceFirstErrorStep?: number;
  skillTarget?: string;
  difficulty?: 'easier' | 'standard' | 'harder';
  studentMistakeSummary?: string;
}

export interface RemedialExercise {
  id: string;
  title: string;
  weakness: string;
  problemLatex: string;
  hint: string;
  solutionLatex: string;
  finalAnswer: string;
  metadata: {
    sourceQuestionId?: string;
    sourceErrorType: StepErrorType;
    sourceFirstErrorStep?: number;
    skillTarget: string;
    difficulty: string;
    generatedAt: string;
  };
}

export interface RemedialGenerateResponse {
  success: boolean;
  exercise: RemedialExercise | null;
  message?: string;
}
