import { Assignment, Submission, StepGradingResponse } from '../types';

export const SHOWCASE_DEMO_ASSIGNMENT: Assignment = {
  id: 'showcase_toan8_pt_bac_nhat',
  title: 'Demo AI – Phương trình bậc nhất một ẩn',
  grade: '8',
  topic: 'Phương trình bậc nhất một ẩn',
  classId: 'showcase_class_8',
  className: '8A1 (minh họa)',
  type: 'text',
  questions: [
    {
      id: 'showcase_q1',
      order: 1,
      question: 'Nghiệm của phương trình $3x - 5 = 10$ là:',
      type: 'multiple_choice',
      options: [
        { id: 'A', text: '$x=3$' },
        { id: 'B', text: '$x=5$' },
        { id: 'C', text: '$x=-5$' },
        { id: 'D', text: '$x=15$' }
      ],
      correctAnswer: 'B',
      points: 3,
      explanation: '$3x-5=10 \\Rightarrow 3x=15 \\Rightarrow x=5$.',
      topicHint: 'Giải phương trình bậc nhất'
    },
    {
      id: 'showcase_q2',
      order: 2,
      question: 'Nghiệm của phương trình $2(x+1)=8$ là:',
      type: 'multiple_choice',
      options: [
        { id: 'A', text: '$x=2$' },
        { id: 'B', text: '$x=4$' },
        { id: 'C', text: '$x=3$' },
        { id: 'D', text: '$x=5$' }
      ],
      correctAnswer: 'C',
      points: 3,
      explanation: '$2(x+1)=8 \\Rightarrow x+1=4 \\Rightarrow x=3$.',
      topicHint: 'Giải phương trình bậc nhất'
    },
    {
      id: 'showcase_q3',
      order: 3,
      question: 'Giải phương trình $2(x-3)=x+5$. Trình bày rõ các bước biến đổi.',
      type: 'essay',
      options: [],
      correctAnswer: '$x=11$',
      points: 4,
      explanation: '$2(x-3)=x+5 \\Rightarrow 2x-6=x+5 \\Rightarrow x=11$.',
      topicHint: 'Biến đổi tương đương phương trình',
      rubric: 'Mở ngoặc đúng: 1,5 điểm; chuyển vế và thu gọn đúng: 1,5 điểm; kết luận nghiệm đúng: 1,0 điểm.'
    }
  ],
  durationMinutes: 15,
  deadline: '2099-12-31',
  allowViewResult: true,
  assignmentCode: 'DEMO-AI-8',
  createdAt: '2026-10-05T08:00:00Z',
  isPublished: true,
  verificationStatus: 'verified',
  eligibleForSampleBank: false
};

const showcaseStepResponse: StepGradingResponse = {
  success: true,
  analysis: [
    {
      stepIndex: 1,
      stepNumber: 1,
      studentLatex: '2(x-3)=x+5',
      referenceStepLatex: '2(x-3)=x+5',
      status: 'correct',
      comment: 'Học sinh chép đúng phương trình và bắt đầu đúng hướng.',
      confidence: 0.99
    },
    {
      stepIndex: 2,
      stepNumber: 2,
      studentLatex: '2x-6=x+5',
      referenceStepLatex: '2x-6=x+5',
      status: 'correct',
      comment: 'Mở ngoặc chính xác.',
      confidence: 0.99
    },
    {
      stepIndex: 3,
      stepNumber: 3,
      studentLatex: '2x-x=5-6',
      referenceStepLatex: '2x-x=5+6',
      status: 'first_error',
      comment: 'Lỗi gốc: khi chuyển $-6$ sang vế phải phải đổi thành $+6$.',
      errorType: 'sign',
      correctionLatex: '2x-x=5+6',
      isFirstError: true,
      confidence: 0.99
    },
    {
      stepIndex: 4,
      stepNumber: 4,
      studentLatex: 'x=-1',
      referenceStepLatex: 'x=11',
      status: 'cascading_error',
      comment: 'Kết quả sai là hệ quả trực tiếp của lỗi dấu ở bước 3, không tính là một lỗi gốc mới.',
      errorType: 'sign',
      correctionLatex: 'x=11',
      isFollowUpError: true,
      confidence: 0.99
    }
  ],
  firstErrorStep: 3,
  firstErrorType: 'sign',
  firstErrorExplanation: 'Khi chuyển $-6$ sang vế phải, học sinh chưa đổi dấu thành $+6$.',
  totalSteps: 4,
  correctStepsCount: 2,
  isAllCorrect: false,
  score: 2,
  maxScore: 4,
  feedback: 'Bài làm đúng ý tưởng và mở ngoặc chính xác. Lỗi gốc xuất hiện ở bước chuyển vế; bước cuối sai theo nên không bị xem là một lỗi độc lập mới.',
  scoreBreakdown: [
    {
      criterion: 'Mở ngoặc và lập phương trình tương đương',
      maxPoints: 1.5,
      earnedPoints: 1.5,
      reason: 'Thực hiện đúng.',
      status: 'met'
    },
    {
      criterion: 'Chuyển vế và thu gọn',
      maxPoints: 1.5,
      earnedPoints: 0.5,
      reason: 'Đúng cấu trúc nhưng sai dấu khi chuyển $-6$ sang vế phải.',
      status: 'partial'
    },
    {
      criterion: 'Kết luận nghiệm',
      maxPoints: 1,
      earnedPoints: 0,
      reason: 'Kết quả cuối sai do lỗi dấu ở bước trước.',
      status: 'not_met'
    }
  ],
  scoringMethod: 'rubric',
  referenceSolution: {
    steps: [
      { stepNumber: 1, solutionLatex: '2(x-3)=x+5', explanation: 'Phương trình ban đầu.' },
      { stepNumber: 2, solutionLatex: '2x-6=x+5', explanation: 'Mở ngoặc.' },
      { stepNumber: 3, solutionLatex: '2x-x=5+6', explanation: 'Chuyển vế đúng dấu.' },
      { stepNumber: 4, solutionLatex: 'x=11', explanation: 'Thu gọn và kết luận.' }
    ],
    finalAnswerLatex: 'x=11'
  },
  analysisSource: 'ai',
  needsTeacherReview: false,
  modelUsed: 'demo-precomputed'
};

export const SHOWCASE_DEMO_SUBMISSION: Submission = {
  id: 'showcase_submission_step_error',
  assignmentId: SHOWCASE_DEMO_ASSIGNMENT.id,
  assignmentTitle: SHOWCASE_DEMO_ASSIGNMENT.title,
  classId: SHOWCASE_DEMO_ASSIGNMENT.classId,
  className: SHOWCASE_DEMO_ASSIGNMENT.className || '8A1 (minh họa)',
  studentName: 'Nguyễn Minh Anh (minh họa)',
  studentId: 'showcase_student_01',
  answers: [
    {
      questionId: 'showcase_q1',
      selectedAnswer: 'B',
      isCorrect: true,
      pointsEarned: 3,
      maxPoints: 3
    },
    {
      questionId: 'showcase_q2',
      selectedAnswer: 'C',
      isCorrect: true,
      pointsEarned: 3,
      maxPoints: 3
    },
    {
      questionId: 'showcase_q3',
      selectedAnswer: '',
      studentSolutionText: '2(x-3)=x+5\n2x-6=x+5\n2x-x=5-6\nx=-1',
      isCorrect: false,
      pointsEarned: 2,
      maxPoints: 4,
      aiScore: 2,
      aiFeedback: showcaseStepResponse.feedback,
      aiGraded: true,
      stepAnalysis: showcaseStepResponse.analysis,
      firstErrorStep: 3,
      firstErrorType: 'sign',
      firstErrorExplanation: showcaseStepResponse.firstErrorExplanation,
      needsTeacherReview: false,
      isProvisional: false,
      aiGradingError: false,
      stepGradingResponse: showcaseStepResponse
    }
  ],
  totalScore: 8,
  maxScore: 10,
  isProvisional: false,
  correctCount: 2,
  wrongCount: 1,
  unansweredCount: 0,
  totalQuestions: 3,
  timeSpentSeconds: 452,
  startedAt: '2026-10-05T08:00:00Z',
  submittedAt: '2026-10-05T08:07:32Z',
  isAiGraded: true,
  hasEssayQuestions: true,
  gradingStatus: 'graded',
  needsTeacherReview: false,
  submissionSource: 'online',
  errorSummary: {
    totalErrors: 1,
    firstErrorStep: 3,
    firstErrorType: 'sign',
    firstErrorExplanation: showcaseStepResponse.firstErrorExplanation
  },
  mcqScore: 10,
  mcqPoints: 6,
  maxMcqPoints: 6,
  essayPoints: 2,
  maxEssayPoints: 4,
  tabSwitchCount: 0,
  violationEvents: [],
  isShuffled: false
};
