import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Assignment, GradeLevel, Submission, SocraticHintLevel } from '../types';

export interface CompletedAssignmentRecord {
  id: string; // submission id
  assignmentId: string;
  assignmentTitle: string;
  assignmentCode: string;
  grade: GradeLevel;
  topic: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  timeSpentSeconds: number;
  submittedAt: string;
  studentName: string;
}

export interface SocraticLearningEvent {
  id: string;
  type:
    | 'hint_requested'
    | 'chat_used'
    | 'revised_after_hint'
    | 'step_analysis_completed'
    | 'first_error_detected'
    | 'socratic_started_from_error'
    | 'student_submitted_correction'
    | 'correction_verified'
    | 'remedial_exercise_generated'
    | 'remedial_exercise_completed'
    | 'mistake_recorded'
    | 'mistake_mastered';
  questionId: string;
  level?: SocraticHintLevel;
  timestamp: string;
  xpEarned: number;
  detail?: string;
  stepNumber?: number;
  errorType?: string;
  isCorrect?: boolean;
}

export interface LearningProgressState {
  studentName: string;
  records: CompletedAssignmentRecord[];
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  isProgressModalOpen: boolean;
  
  // Socratic Progress Tracking
  socraticEvents: SocraticLearningEvent[];
  socraticXp: number;
  
  // Actions
  setStudentName: (name: string) => void;
  setProgressModalOpen: (open: boolean) => void;
  recordSubmission: (submission: Submission, assignment: Assignment) => void;
  recordSocraticHintUsed: (questionId: string, level: SocraticHintLevel) => void;
  recordSocraticChatUsed: (questionId: string) => void;
  recordAnswerRevisedAfterHint: (questionId: string, oldAnswer: string, newAnswer: string) => void;
  recordStepAnalysisCompleted: (questionId: string, firstErrorStep: number | null, errorType?: string) => void;
  recordFirstErrorDetected: (questionId: string, step: number, errorType: string) => void;
  recordSocraticStartedFromError: (questionId: string, step: number) => void;
  recordStudentSubmittedCorrection: (questionId: string, step: number) => void;
  recordCorrectionVerified: (questionId: string, isCorrect: boolean, isProgress: boolean) => void;
  recordRemedialExerciseGenerated: (questionId: string, remedialId: string, skillTarget?: string) => void;
  recordRemedialExerciseCompleted: (remedialId: string, isCorrect: boolean) => void;
  recordMistakeDetected: (questionId: string, errorType?: string, firstErrorStep?: number) => void;
  recordMistakeMastered: (questionId: string, attemptsCount: number) => void;
  getSocraticStats: () => { hintCount: number; chatCount: number; revisionCount: number; totalXp: number };
  resetProgress: () => void;
  
  // Computed helpers
  getTotalPointsEarned: () => number;
  getTotalMaxPoints: () => number;
  getAveragePercentage: () => number;
  getTotalCompletedCount: () => number;
  getGradeStats: (grade: GradeLevel) => {
    completedCount: number;
    totalScore: number;
    maxScore: number;
    avgScore: number;
    avgPercentage: number;
  };
}

export const useLearningProgressStore = create<LearningProgressState>()(
  persist(
    (set, get) => ({
      studentName: '',
      records: [],
      streakDays: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      isProgressModalOpen: false,
      socraticEvents: [],
      socraticXp: 0,

      setStudentName: (name: string) => {
        set({ studentName: name.trim() });
      },

      recordSocraticHintUsed: (questionId: string, level: SocraticHintLevel) => {
        const state = get();
        // Giới hạn XP: mỗi câu chỉ nhận tối đa 1 lần XP cho mỗi level gợi ý
        const alreadyReceivedForLevel = state.socraticEvents.some(
          e => e.questionId === questionId && e.level === level && e.type === 'hint_requested'
        );
        const xpEarned = alreadyReceivedForLevel ? 0 : 5;

        const event: SocraticLearningEvent = {
          id: 'soc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          type: 'hint_requested',
          questionId,
          level,
          timestamp: new Date().toISOString(),
          xpEarned,
          detail: `Xem ${level === 'hint1' ? 'Gợi ý 1' : level === 'hint2' ? 'Gợi ý 2' : 'Gợi ý 3'}`
        };

        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + xpEarned
        });
      },

      recordSocraticChatUsed: (questionId: string) => {
        const state = get();
        // Thưởng 5 XP cho lần trao đổi tích cực đầu tiên của câu hỏi này
        const hasChattedForQ = state.socraticEvents.some(
          e => e.questionId === questionId && e.type === 'chat_used'
        );
        const xpEarned = hasChattedForQ ? 0 : 5;

        const event: SocraticLearningEvent = {
          id: 'soc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          type: 'chat_used',
          questionId,
          timestamp: new Date().toISOString(),
          xpEarned,
          detail: 'Thảo luận cùng Gia sư Socratic'
        };

        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + xpEarned
        });
      },

      recordAnswerRevisedAfterHint: (questionId: string, oldAnswer: string, newAnswer: string) => {
        const state = get();
        // Kiểm tra xem đã từng ghi nhận sửa bài cho câu này chưa
        const alreadyRecordedRevision = state.socraticEvents.some(
          e => e.questionId === questionId && e.type === 'revised_after_hint'
        );
        const xpEarned = alreadyRecordedRevision ? 0 : 15; // Thưởng 15 XP vì tinh thần chủ động sửa bài sau khi tư duy gợi mở

        const event: SocraticLearningEvent = {
          id: 'soc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          type: 'revised_after_hint',
          questionId,
          timestamp: new Date().toISOString(),
          xpEarned,
          detail: `Chủ động điều chỉnh phương án từ "${oldAnswer || 'chưa chọn'}" sang "${newAnswer}" sau gợi ý Socratic`
        };

        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + xpEarned
        });
      },

      recordStepAnalysisCompleted: (questionId: string, firstErrorStep: number | null, errorType?: string) => {
        const state = get();
        const event: SocraticLearningEvent = {
          id: 'step_anal_' + Date.now(),
          type: 'step_analysis_completed',
          questionId,
          timestamp: new Date().toISOString(),
          xpEarned: 10,
          stepNumber: firstErrorStep || undefined,
          errorType,
          detail: firstErrorStep ? `Phát hiện lỗi đầu tiên tại Bước ${firstErrorStep} (${errorType || 'Khác'})` : 'Bài làm giải đúng tất cả các bước'
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + 10
        });
      },

      recordFirstErrorDetected: (questionId: string, step: number, errorType: string) => {
        const state = get();
        const event: SocraticLearningEvent = {
          id: 'err_det_' + Date.now(),
          type: 'first_error_detected',
          questionId,
          stepNumber: step,
          errorType,
          timestamp: new Date().toISOString(),
          xpEarned: 5,
          detail: `Xác định bước sai đầu tiên: Bước ${step} (Dạng lỗi: ${errorType})`
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + 5
        });
      },

      recordSocraticStartedFromError: (questionId: string, step: number) => {
        const state = get();
        const event: SocraticLearningEvent = {
          id: 'soc_err_' + Date.now(),
          type: 'socratic_started_from_error',
          questionId,
          stepNumber: step,
          timestamp: new Date().toISOString(),
          xpEarned: 10,
          detail: `Bắt đầu gợi mở tư duy cùng Socratic AI từ Bước sai ${step}`
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + 10
        });
      },

      recordStudentSubmittedCorrection: (questionId: string, step: number) => {
        const state = get();
        const event: SocraticLearningEvent = {
          id: 'sub_corr_' + Date.now(),
          type: 'student_submitted_correction',
          questionId,
          stepNumber: step,
          timestamp: new Date().toISOString(),
          xpEarned: 15,
          detail: `Học sinh tự sửa lại bước làm tại Bước ${step}`
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + 15
        });
      },

      recordCorrectionVerified: (questionId: string, isCorrect: boolean, isProgress: boolean) => {
        const state = get();
        const event: SocraticLearningEvent = {
          id: 'ver_corr_' + Date.now(),
          type: 'correction_verified',
          questionId,
          isCorrect,
          timestamp: new Date().toISOString(),
          xpEarned: isCorrect ? 25 : (isProgress ? 15 : 5),
          detail: isCorrect
            ? '✓ Bước sửa đã được AI xác nhận chính xác hoàn toàn'
            : (isProgress ? '💡 Bước sửa có tiến bộ rõ rệt' : '⚠️ Bước sửa cần điều chỉnh thêm')
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + (isCorrect ? 25 : 15)
        });
      },

      recordRemedialExerciseGenerated: (questionId: string, remedialId: string, skillTarget?: string) => {
        const state = get();
        // Chống duplicate event khi rerender
        const isDuplicate = state.socraticEvents.some(
          e => e.type === 'remedial_exercise_generated' && (e.questionId === remedialId || e.questionId === questionId)
        );
        if (isDuplicate) return;

        const event: SocraticLearningEvent = {
          id: 'rem_gen_' + Date.now(),
          type: 'remedial_exercise_generated',
          questionId,
          timestamp: new Date().toISOString(),
          xpEarned: 5,
          detail: `Tự sinh bài tập tương tự cùng dạng rèn luyện kỹ năng: ${skillTarget || 'Toán THCS'}`
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + 5
        });
      },

      recordRemedialExerciseCompleted: (remedialId: string, isCorrect: boolean) => {
        const state = get();
        const event: SocraticLearningEvent = {
          id: 'rem_comp_' + Date.now(),
          type: 'remedial_exercise_completed',
          questionId: remedialId,
          isCorrect,
          timestamp: new Date().toISOString(),
          xpEarned: isCorrect ? 30 : 10,
          detail: isCorrect ? '🎉 Hoàn thành xuất sắc bài tập bổ trợ tương tự' : 'Đã thử sức bài tập bổ trợ tương tự'
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + (isCorrect ? 30 : 10)
        });
      },

      recordMistakeDetected: (questionId: string, errorType?: string, firstErrorStep?: number) => {
        const state = get();
        // Chống ghi nhận duplicate câu sai nhiều lần
        const isDuplicate = state.socraticEvents.some(
          e => e.type === 'mistake_recorded' && e.questionId === questionId
        );
        if (isDuplicate) return;

        const event: SocraticLearningEvent = {
          id: 'mis_rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          type: 'mistake_recorded',
          questionId,
          stepNumber: firstErrorStep,
          errorType,
          timestamp: new Date().toISOString(),
          xpEarned: 5,
          detail: firstErrorStep
            ? `Lưu vết câu sai vào Sổ tay: Bước ${firstErrorStep} (${errorType || 'Cần củng cố'})`
            : 'Lưu câu sai vào Sổ tay câu sai để luyện lại'
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + 5
        });
      },

      recordMistakeMastered: (questionId: string, attemptsCount: number) => {
        const state = get();
        // Chống ghi nhận mastered trùng lặp cho cùng một câu
        const isDuplicate = state.socraticEvents.some(
          e => e.type === 'mistake_mastered' && e.questionId === questionId
        );
        if (isDuplicate) return;

        const event: SocraticLearningEvent = {
          id: 'mis_mas_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          type: 'mistake_mastered',
          questionId,
          timestamp: new Date().toISOString(),
          xpEarned: 40,
          detail: `🏆 Khắc phục thành công lỗ hổng kiến thức sau ${attemptsCount} lượt luyện tập!`
        };
        set({
          socraticEvents: [event, ...state.socraticEvents.slice(0, 199)],
          socraticXp: state.socraticXp + 40
        });
      },

      getSocraticStats: () => {
        const { socraticEvents, socraticXp } = get();
        const hintCount = socraticEvents.filter(e => e.type === 'hint_requested').length;
        const chatCount = socraticEvents.filter(e => e.type === 'chat_used').length;
        const revisionCount = socraticEvents.filter(e => e.type === 'revised_after_hint').length;
        return {
          hintCount,
          chatCount,
          revisionCount,
          totalXp: socraticXp
        };
      },

      setProgressModalOpen: (open: boolean) => {
        set({ isProgressModalOpen: open });
      },

      recordSubmission: (submission: Submission, assignment: Assignment) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const state = get();

        // Calculate streak
        let newStreak = state.streakDays || 1;
        if (state.lastActiveDate) {
          const lastDate = new Date(state.lastActiveDate);
          const currDate = new Date(todayStr);
          const diffTime = Math.abs(currDate.getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            newStreak += 1;
          } else if (diffDays > 1) {
            newStreak = 1;
          }
        }

        const percentage = assignment.questions.length > 0
          ? Math.round((submission.correctCount / assignment.questions.length) * 100)
          : Math.round((submission.totalScore / (submission.maxScore || 10)) * 100);

        const newRecord: CompletedAssignmentRecord = {
          id: submission.id || `${Date.now()}`,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          assignmentCode: assignment.assignmentCode,
          grade: assignment.grade,
          topic: assignment.topic,
          totalScore: submission.totalScore,
          maxScore: submission.maxScore || 10,
          percentage,
          correctCount: submission.correctCount,
          totalQuestions: assignment.questions.length || submission.totalQuestions,
          timeSpentSeconds: submission.timeSpentSeconds,
          submittedAt: submission.submittedAt || new Date().toISOString(),
          studentName: submission.studentName || state.studentName || 'Học sinh'
        };

        // If this assignment was already completed before, we update or add as latest attempt
        // We keep track of all attempts or unique per assignment:
        // Replace previous attempt if exists or prepend
        const existingIndex = state.records.findIndex(r => r.assignmentId === assignment.id);
        let updatedRecords: CompletedAssignmentRecord[];

        if (existingIndex >= 0) {
          // Replace with latest attempt (or keep highest score)
          updatedRecords = [...state.records];
          // We can keep the best score or the latest
          updatedRecords[existingIndex] = newRecord;
        } else {
          updatedRecords = [newRecord, ...state.records];
        }

        set({
          studentName: submission.studentName || state.studentName,
          records: updatedRecords,
          streakDays: newStreak,
          lastActiveDate: todayStr
        });
      },

      resetProgress: () => {
        set({
          studentName: '',
          records: [],
          streakDays: 1,
          lastActiveDate: new Date().toISOString().split('T')[0]
        });
      },

      getTotalPointsEarned: () => {
        const { records } = get();
        const total = records.reduce((sum, r) => sum + (r.totalScore || 0), 0);
        return Math.round(total * 10) / 10;
      },

      getTotalMaxPoints: () => {
        const { records } = get();
        const total = records.reduce((sum, r) => sum + (r.maxScore || 10), 0);
        return Math.round(total * 10) / 10;
      },

      getAveragePercentage: () => {
        const { records } = get();
        if (records.length === 0) return 0;
        const totalPct = records.reduce((sum, r) => sum + r.percentage, 0);
        return Math.round(totalPct / records.length);
      },

      getTotalCompletedCount: () => {
        return get().records.length;
      },

      getGradeStats: (grade: GradeLevel) => {
        const { records } = get();
        const gradeRecords = records.filter(r => r.grade === grade);
        const completedCount = gradeRecords.length;
        const totalScore = gradeRecords.reduce((sum, r) => sum + r.totalScore, 0);
        const maxScore = gradeRecords.reduce((sum, r) => sum + r.maxScore, 0);
        const avgScore = completedCount > 0 ? Math.round((totalScore / completedCount) * 10) / 10 : 0;
        const avgPercentage = completedCount > 0 ? Math.round(gradeRecords.reduce((sum, r) => sum + r.percentage, 0) / completedCount) : 0;

        return {
          completedCount,
          totalScore: Math.round(totalScore * 10) / 10,
          maxScore: Math.round(maxScore * 10) / 10,
          avgScore,
          avgPercentage
        };
      }
    }),
    {
      name: 'toan_thcs_learning_progress', // LocalStorage key
      storage: createJSONStorage(() => localStorage)
    }
  )
);
