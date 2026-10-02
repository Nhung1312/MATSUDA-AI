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
  totalScore: number; // e.g. 8.5
  maxScore: number; // e.g. 10.0
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
  gradingStatus?: 'graded' | 'pending_teacher_grading';
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

