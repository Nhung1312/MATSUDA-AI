/**
 * Data Models for TOÁN THCS – Giao bài & Luyện tập
 */

export type GradeLevel = '6' | '7' | '8' | '9';

export interface Student {
  id: string;
  name: string;
  classId: string;
  code?: string; // Student ID e.g. "HS01"
  gender?: 'Nam' | 'Nữ';
}

export interface ClassRoom {
  id: string;
  name: string; // e.g. "6A1", "7A2"
  grade: GradeLevel;
  academicYear: string;
  students: Student[];
  createdAt: string;
}

export type QuestionType = 'multiple_choice' | 'short_answer' | 'true_false' | 'essay';

export interface QuestionOption {
  id: string; // 'A' | 'B' | 'C' | 'D'
  text: string;
}

export interface Question {
  id: string;
  order: number;
  question: string; // Content, can contain math notation
  type: QuestionType;
  options: QuestionOption[]; // e.g. [{id: 'A', text: '1/2'}, {id: 'B', text: '5/4'}, ...]
  correctAnswer: string; // 'A' | 'B' | 'C' | 'D' (or text for short_answer/essay criteria)
  points: number; // Điểm câu hỏi (mặc định e.g. 0.5 điểm hoặc 1 điểm)
  explanation?: string; // Lời giải chi tiết
  topicHint?: string; // e.g. "Quy đồng mẫu số", "Rút gọn phân số"
  rubric?: string; // Hướng dẫn / tiêu chí chấm tự luận cho AI và Giáo viên
  imageUrl?: string; // MỚI: Hình vẽ minh họa / đồ thị hình học cho đề bài (tải file hoặc dán Ctrl+V)
  dismissMissingImageWarning?: boolean; // Tùy chọn bỏ qua cảnh báo thiếu hình cho câu này
  verificationStatus?: 'verified' | 'needs_review'; // Trạng thái kiểm chứng kép
  sanityCheckNote?: string; // Ghi chú đối soát thử nghiệm ngược
  confidence?: 'high' | 'medium' | 'needs_review'; // Độ tin cậy sau đối soát
  pass1Answer?: string; // Đáp án lượt 1 (giải xuôi)
  pass2Answer?: string; // Đáp án lượt 2 (thử nghiệm ngược)
  aiProposedAnswer?: string; // Đáp án AI đề xuất trong đợt thẩm định
  aiReason?: string; // Lý do / căn cứ AI đưa ra
  needsReview?: boolean; // Cờ đánh dấu câu cần giáo viên duyệt lại
}

// ==========================================
// MỚI: BẢNG DỮ LIỆU KHO ĐỀ (EXAM TEMPLATE)
// ==========================================
export interface ExamTemplate {
  id: string;
  title: string;
  grade: GradeLevel;
  topic: string;
  questions: Question[];
  pdfUrl?: string; // Đường dẫn file PDF gốc trên Firebase Storage (để sau này làm màn hình chia đôi)
  createdAt: string;
  updatedAt?: string;
}

// ==========================================
// CẬP NHẬT: BÀI TẬP ĐÃ GIAO (ASSIGNMENT)
// ==========================================
export interface Assignment {
  id: string;
  title: string;
  grade: GradeLevel;
  topic: string;
  classId: string; // Target class ID (or 'all')
  className?: string; // cached name
  templateId?: string; // MỚI: ID của đề mẫu trong Kho Đề (nếu bài tập này được tạo từ Kho)
  pdfUrl?: string; // MỚI: Đường dẫn file PDF gốc để hiển thị cho học sinh xem đề
  type?: 'pdf' | 'text'; // Flag nhận diện đề PDF hoặc trắc nghiệm văn bản
  questions: Question[];
  durationMinutes: number; // 0 = unlimited, >0 = minutes limit
  deadline: string; // ISO date string or YYYY-MM-DD
  allowViewResult: boolean; // Whether students can view score and answers immediately after submitting
  assignmentCode: string; // e.g. "TOAN6A1-8K4P"
  createdAt: string;
  isPublished: boolean;
  verificationStatus?: 'verified' | 'unverified' | 'needs_review' | 'pending'; // Trạng thái thẩm định đề thi (unverified = chưa thẩm định, needs_review = cần xem lại, verified = đã thẩm định)
  eligibleForSampleBank?: boolean; // Đủ điều kiện làm dữ liệu mẫu (khi đã verified 100%)
}

export interface ViolationEvent {
  timestamp: string;
  type: 'tab_switch' | 'window_blur' | 'fullscreen_exit' | 'context_menu' | 'copy_attempt';
  description: string;
}

export interface StudentAnswer {
  questionId: string;
  selectedAnswer: string; // 'A', 'B', 'C', 'D' or text / student typed notes
  selectedOptionText?: string; // Nội dung văn bản của phương án học sinh đã chọn
  originalSelectedLabel?: string; // Nhãn phương án tương ứng trên đề gốc (trước khi đảo đề)
  isCorrect: boolean;
  pointsEarned: number;
  maxPoints: number;
  essayImages?: string[]; // Ảnh chụp bài làm tự luận / nháp
  studentSolutionText?: string; // Lời giải tự luận học sinh gõ (nếu có)
  aiFeedback?: string; // Nhận xét của AI
  aiScore?: number; // Điểm do AI đề xuất
  aiGraded?: boolean; // Đã được AI chấm
  teacherFeedback?: string; // Nhận xét của giáo viên
  teacherScore?: number; // Điểm giáo viên chấm hoặc điều chỉnh
  // Optional fields cho Step-by-Step Analysis (Đợt 1 - Tương thích 100% dữ liệu cũ)
  stepAnalysis?: StepAnalysis[];
  firstErrorStep?: number | null;
  firstErrorType?: StepErrorType | null;
  firstErrorExplanation?: string | null;
  needsTeacherReview?: boolean;
  isProvisional?: boolean; // Điểm số tạm tính (AI lỗi hoặc chờ GV duyệt, không phải điểm 0 thật)
  aiGradingError?: boolean; // Đánh dấu khi AI gặp lỗi xử lý hoặc ảnh không rõ
  stepGradingResponse?: StepGradingResponse;
}

export interface EssayGradingResult {
  score: number;
  maxScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  stepByStepCorrection?: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  classId: string;
  className: string;
  studentName: string;
  studentId?: string;
  answers: StudentAnswer[];
  totalScore: number; // e.g. 8.5 (hoặc điểm tạm tính nếu isProvisional = true)
  maxScore: number; // e.g. 10.0
  isProvisional?: boolean; // Bài nộp đang ở trạng thái điểm tạm tính (có câu cần Giáo viên duyệt)
  ungradedCount?: number; // Số câu hỏi chưa có điểm chính thức do chờ duyệt
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  totalQuestions: number;
  timeSpentSeconds: number; // Thời gian làm bài
  startedAt: string;
  submittedAt: string;
  essayImages?: string[]; // Ảnh bài làm tổng thể đính kèm nếu có
  isAiGraded?: boolean;
  hasEssayQuestions?: boolean;
  gradingStatus?: 'graded' | 'pending_teacher_grading' | 'needs_review' | 'failed' | 'grading';
  needsTeacherReview?: boolean;
  submissionSource?: 'online' | 'paper';
  errorSummary?: {
    totalErrors: number;
    firstErrorStep?: number | null;
    firstErrorType?: StepErrorType | null;
    firstErrorExplanation?: string | null;
  };
  mcqScore?: number;
  mcqPoints?: number;
  maxMcqPoints?: number;
  essayPoints?: number;
  maxEssayPoints?: number;
  teacherFeedback?: string;
  // Anti-cheat monitoring fields
  tabSwitchCount?: number;
  violationEvents?: ViolationEvent[];
  isShuffled?: boolean;
  shuffledQuestions?: Question[]; // Snapshot danh sách câu hỏi học sinh nhìn thấy khi làm bài
}

export interface QuestionAnalysis {
  questionId: string;
  order: number;
  questionText: string;
  correctAnswer: string;
  totalResponses: number;
  correctCount: number;
  wrongCount: number;
  accuracyRate: number; // 0 to 100%
  optionDistribution: Record<string, number>; // { 'A': 10, 'B': 2, 'C': 18, 'D': 1 }
  topicHint?: string;
}

export interface AssignmentStats {
  assignmentId: string;
  totalAssigned: number;
  submittedCount: number;
  unsubmittedCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  questionAnalyses: QuestionAnalysis[];
  mostMissedQuestions: QuestionAnalysis[];
}

// ==========================================
// THÔNG TIN BẢN QUYỀN & DÙNG THỬ CỦA GIÁO VIÊN
// ==========================================
export type SubscriptionPlanId = 'semester' | 'yearly' | 'lifetime';

export interface PaymentPlan {
  id: SubscriptionPlanId;
  name: string;
  price: number;
  originalPrice: number;
  durationMonths: number; // 6, 12, or 999
  description: string;
  badge?: string;
  popular?: boolean;
}

export interface TeacherSubscription {
  teacherId: string;
  email: string;
  displayName: string;
  registeredAt: string; // ISO date
  trialEndsAt: string;  // ISO date (15 days from registeredAt)
  isVip: boolean;       // true if upgraded
  vipPlan?: SubscriptionPlanId;
  vipExpiresAt?: string | null; // ISO date, or null if lifetime
  activatedAt?: string;
  activationCode?: string;
  status: 'trial' | 'active' | 'expired';
  daysLeft: number;
}

export interface PaymentRequest {
  id: string;
  teacherId: string;
  teacherEmail: string;
  teacherName: string;
  planId: SubscriptionPlanId;
  planName: string;
  amount: number;
  transferCode: string;
  status: 'pending' | 'approved';
  createdAt: string;
}

// ==========================================
// MỚI: SỔ TAY CÂU SAI (MISTAKE VAULT)
// ==========================================
export type MistakeMasteryStatus = 'needs_practice' | 'practicing' | 'improving' | 'mastered';

export interface MistakePracticeAttempt {
  id: string;
  attemptedAt: string; // ISO date
  type: 'retry_original' | 'remedial_isomorphic' | 'socratic_correction';
  studentAnswer: string;
  isCorrect: boolean;
  score?: number;
  feedback?: string;
  usedTutor?: boolean;
  maxHintLevelUsed?: SocraticHintLevel;
}

export interface MistakeRecord {
  id: string; // `${assignmentId}_${questionId}`
  assignmentId: string;
  assignmentTitle: string;
  assignmentCode?: string;
  grade: GradeLevel;
  question: Question;
  studentAnswer: string; // Đáp án học sinh đã chọn sai
  addedAt: string; // ISO date
  mastered: boolean; // true nếu học sinh đã luyện lại và chọn đúng
  lastPracticedAt?: string;
  practiceCount: number; // Số lần đã thử luyện lại
  aiHint?: string; // Gợi ý bước giải lưu trữ

  // OPTIONAL ENHANCEMENTS (Chu trình khép kín câu sai -> luyện lại -> tiến bộ)
  masteryStatus?: MistakeMasteryStatus;
  firstErrorStep?: number | null;
  firstErrorType?: StepErrorType;
  firstErrorExplanation?: string | null;
  stepAnalysis?: StepAnalysis[];
  cascadingStepsCount?: number;
  studentWork?: string;
  essayImages?: string[];
  remedialExercise?: RemedialExercise;
  practiceAttempts?: MistakePracticeAttempt[];
  consecutiveCorrectCount?: number;
}

// ==========================================
// MỚI: HỆ THỐNG THI TRỰC TUYẾN (CONTESTS)
// ==========================================
export type ContestStatus = 'upcoming' | 'ongoing' | 'ended';

export interface Contest {
  id: string;
  code: string; // Mã cuộc thi duy nhất, ví dụ: "DT7-001"
  title: string;
  description?: string;
  grade: GradeLevel;
  topic?: string;
  questions: Question[];
  durationMinutes: number; // Thời lượng làm bài (phút, ví dụ 15, 45, 60...)
  startTime: string; // ISO date string thời gian bắt đầu
  endTime: string; // ISO date string thời gian kết thúc
  maxAttempts: number; // 1 = thi 1 lần duy nhất, 0 hoặc >1
  allowViewScore: boolean; // Học sinh được xem điểm ngay sau khi nộp
  allowViewAnswer: boolean; // Học sinh được xem đáp án chi tiết sau khi nộp
  shuffleQuestions: boolean; // Trộn thứ tự câu hỏi
  shuffleOptions: boolean; // Trộn thứ tự đáp án A, B, C, D
  allowGoBack: boolean; // Cho phép quay lại câu trước
  isPublished: boolean;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ContestSubmission {
  id: string;
  contestId: string;
  contestCode: string;
  contestTitle: string;
  studentName: string;
  studentClass: string;
  studentId?: string;
  answers: StudentAnswer[];
  totalScore: number;
  maxScore: number;
  mcqScore: number;
  essayScore: number;
  hasEssay: boolean;
  isEssayGraded: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  totalQuestions: number;
  timeSpentSeconds: number;
  startedAt: string;
  submittedAt: string;
  tabSwitchCount: number;
  violationEvents: ViolationEvent[];
  attemptNumber: number;
  shuffledQuestionOrder?: string[];
  isShuffled?: boolean;
}

// ==========================================
// SOCRATIC TUTOR AI TYPES (PORTED & ADAPTED FROM MATSUDA AI)
// ==========================================
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
  questionType?: QuestionType;
  grade?: string;
  topic?: string;
  answerOptions?: Array<{ id: string; text: string }>;
  studentCurrentAnswer?: string;
  studentWork?: string; // student's typed solution or current scratchpad notes
  detectedError?: string; // teacher / grading feedback if question was already evaluated
  errorType?: StepErrorType;
  firstErrorStep?: number;
  firstErrorLatex?: string;
  referenceStepLatex?: string;
  previousHints?: string[];
  currentHintLevel?: SocraticHintLevel;
  stepAnalysis?: StepAnalysis[];
  essayImages?: string[];
  studentAnswer?: any;
  mistakeRecordId?: string;
}

export interface SocraticMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  level?: SocraticHintLevel;
  timestamp: string;
  isFallback?: boolean;
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
// STEP-BY-STEP GRADING & ANALYSIS (PHASE 4)
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

export interface ScoreBreakdownItem {
  criterion: string;
  maxPoints: number;
  earnedPoints: number;
  reason: string;
  status?: 'met' | 'partial' | 'not_met' | 'uncertain';
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
  scoreBreakdown?: ScoreBreakdownItem[];
  scoringMethod?: 'rubric' | 'step_fallback' | 'unavailable';
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

