import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { 
  MistakeRecord, 
  Submission, 
  Assignment, 
  GradeLevel, 
  Question,
  MistakePracticeAttempt,
  MistakeMasteryStatus,
  RemedialExercise
} from '../types';
import { useLearningProgressStore } from './useLearningProgressStore';

export interface MistakeVaultState {
  mistakes: MistakeRecord[];
  isModalOpen: boolean;
  selectedMistakeId: string | null;

  // Actions
  setModalOpen: (open: boolean) => void;
  setSelectedMistakeId: (id: string | null) => void;
  addMistakesFromSubmission: (submission: Submission, assignment: Assignment) => number;
  addManualMistake: (question: Question, assignment: Assignment, studentAnswer: string) => void;
  recordPracticeAttempt: (
    id: string, 
    isCorrect: boolean, 
    attemptDetail?: Partial<MistakePracticeAttempt>
  ) => void;
  markAsMastered: (id: string) => void;
  saveRemedialExercise: (id: string, exercise: RemedialExercise) => void;
  saveAiHint: (id: string, hint: string) => void;
  removeMistake: (id: string) => void;
  clearMasteredMistakes: () => void;
  clearAllMistakes: () => void;

  // Getters
  getActiveMistakesCount: () => number;
  getMasteredMistakesCount: () => number;
  getMistakesByGrade: (grade: GradeLevel) => MistakeRecord[];
}

export const useMistakeVaultStore = create<MistakeVaultState>()(
  persist(
    (set, get) => ({
      mistakes: [],
      isModalOpen: false,
      selectedMistakeId: null,

      setModalOpen: (open: boolean) => {
        set({ isModalOpen: open });
      },

      setSelectedMistakeId: (id: string | null) => {
        set({ selectedMistakeId: id });
      },

      addMistakesFromSubmission: (submission: Submission, assignment: Assignment) => {
        const currentMistakes = [...get().mistakes];
        let addedCount = 0;
        const now = new Date().toISOString();

        // Lọc tất cả câu sai trong bài thi (hoặc câu có lỗi bước cần khắc phục)
        submission.answers.forEach((ans) => {
          const hasStepError = ans.firstErrorStep !== undefined && ans.firstErrorStep !== null;
          if (!ans.isCorrect || hasStepError) {
            const question = assignment.questions.find((q) => q.id === ans.questionId);
            if (!question) return;

            // Đếm số bước kéo theo (cascading errors) - TUYỆT ĐỐI không tạo lỗi giả
            const cascadingCount = ans.stepAnalysis
              ? ans.stepAnalysis.filter((s) => s.status === 'cascading_error').length
              : 0;

            const mistakeId = `${assignment.id}_${question.id}`;
            const existingIdx = currentMistakes.findIndex((m) => m.id === mistakeId);

            if (existingIdx >= 0) {
              // Cập nhật chẩn đoán lỗi & bước giải mới nhất nhưng BẢO TỒN tiến độ luyện tập hiện có
              currentMistakes[existingIdx] = {
                ...currentMistakes[existingIdx],
                studentAnswer: ans.selectedAnswer || ans.studentSolutionText || currentMistakes[existingIdx].studentAnswer,
                // Cập nhật StepAnalysis & FirstError nếu có dữ liệu mới
                firstErrorStep: ans.firstErrorStep !== undefined ? ans.firstErrorStep : currentMistakes[existingIdx].firstErrorStep,
                firstErrorType: ans.firstErrorType || currentMistakes[existingIdx].firstErrorType,
                firstErrorExplanation: ans.firstErrorExplanation || currentMistakes[existingIdx].firstErrorExplanation,
                stepAnalysis: ans.stepAnalysis || currentMistakes[existingIdx].stepAnalysis,
                cascadingStepsCount: cascadingCount || currentMistakes[existingIdx].cascadingStepsCount,
                studentWork: ans.studentSolutionText || currentMistakes[existingIdx].studentWork,
                essayImages: ans.essayImages || currentMistakes[existingIdx].essayImages,
              };
            } else {
              // Thêm mới câu sai vào Mistake Vault
              currentMistakes.unshift({
                id: mistakeId,
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                assignmentCode: assignment.assignmentCode,
                grade: assignment.grade,
                question,
                studentAnswer: ans.selectedAnswer || ans.studentSolutionText || 'Chưa trả lời',
                addedAt: now,
                mastered: false,
                masteryStatus: 'needs_practice',
                consecutiveCorrectCount: 0,
                practiceCount: 0,
                lastPracticedAt: undefined,
                aiHint: undefined,
                firstErrorStep: ans.firstErrorStep,
                firstErrorType: ans.firstErrorType,
                firstErrorExplanation: ans.firstErrorExplanation,
                stepAnalysis: ans.stepAnalysis,
                cascadingStepsCount: cascadingCount,
                studentWork: ans.studentSolutionText,
                essayImages: ans.essayImages,
                practiceAttempts: [],
              });
              addedCount++;

              // Ghi nhận sự kiện vào Learning Progress (chỉ ghi nhận khi phát hiện câu sai mới)
              try {
                useLearningProgressStore.getState().recordMistakeDetected(
                  question.id,
                  ans.firstErrorType,
                  ans.firstErrorStep || undefined
                );
              } catch (e) {
                console.warn('[MistakeVault] recordMistakeDetected error:', e);
              }
            }
          }
        });

        set({ mistakes: currentMistakes });
        return addedCount;
      },

      addManualMistake: (question: Question, assignment: Assignment, studentAnswer: string) => {
        const currentMistakes = [...get().mistakes];
        const mistakeId = `${assignment.id}_${question.id}`;
        const existingIdx = currentMistakes.findIndex((m) => m.id === mistakeId);

        if (existingIdx >= 0) {
          currentMistakes[existingIdx].mastered = false;
          currentMistakes[existingIdx].masteryStatus = 'needs_practice';
          currentMistakes[existingIdx].studentAnswer = studentAnswer;
          currentMistakes[existingIdx].consecutiveCorrectCount = 0;
        } else {
          currentMistakes.unshift({
            id: mistakeId,
            assignmentId: assignment.id,
            assignmentTitle: assignment.title,
            assignmentCode: assignment.assignmentCode,
            grade: assignment.grade,
            question,
            studentAnswer,
            addedAt: new Date().toISOString(),
            mastered: false,
            masteryStatus: 'needs_practice',
            consecutiveCorrectCount: 0,
            practiceCount: 0,
            practiceAttempts: [],
          });
        }
        set({ mistakes: currentMistakes });
      },

      recordPracticeAttempt: (
        id: string, 
        isCorrect: boolean, 
        attemptDetail?: Partial<MistakePracticeAttempt>
      ) => {
        const now = new Date().toISOString();
        const currentMistakes = get().mistakes.map((m) => {
          if (m.id === id) {
            const attempt: MistakePracticeAttempt = {
              id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              attemptedAt: now,
              type: attemptDetail?.type || 'retry_original',
              studentAnswer: attemptDetail?.studentAnswer || (isCorrect ? 'Đúng' : 'Sai'),
              isCorrect,
              score: attemptDetail?.score,
              feedback: attemptDetail?.feedback,
              usedTutor: attemptDetail?.usedTutor || false,
              maxHintLevelUsed: attemptDetail?.maxHintLevelUsed,
            };

            const existingAttempts = Array.isArray(m.practiceAttempts) ? m.practiceAttempts : [];
            const newPracticeCount = (m.practiceCount || 0) + 1;

            let newConsecutive = m.consecutiveCorrectCount || 0;
            let newStatus: MistakeMasteryStatus = m.masteryStatus || 'needs_practice';
            let isMastered = false;

            if (isCorrect) {
              newConsecutive += 1;
              if (newConsecutive >= 2) {
                newStatus = 'mastered';
                isMastered = true;
                // Ghi nhận mastered trong Learning Progress
                try {
                  useLearningProgressStore.getState().recordMistakeMastered(id, newPracticeCount);
                } catch (e) {
                  console.warn('[MistakeVault] recordMistakeMastered error:', e);
                }
              } else {
                newStatus = 'improving'; // Đang tiến bộ (đã đúng 1 lần)
                isMastered = false;
              }
            } else {
              newConsecutive = 0;
              newStatus = 'practicing'; // Đang tiếp tục luyện tập
              isMastered = false;
            }

            return {
              ...m,
              mastered: isMastered,
              masteryStatus: newStatus,
              consecutiveCorrectCount: newConsecutive,
              practiceCount: newPracticeCount,
              lastPracticedAt: now,
              practiceAttempts: [attempt, ...existingAttempts.slice(0, 19)],
            };
          }
          return m;
        });

        set({ mistakes: currentMistakes });
      },

      markAsMastered: (id: string) => {
        const now = new Date().toISOString();
        const currentMistakes = get().mistakes.map((m) => {
          if (m.id === id) {
            try {
              useLearningProgressStore.getState().recordMistakeMastered(id, (m.practiceCount || 0) + 1);
            } catch (e) {
              console.warn('[MistakeVault] recordMistakeMastered error:', e);
            }
            return {
              ...m,
              mastered: true,
              masteryStatus: 'mastered' as MistakeMasteryStatus,
              consecutiveCorrectCount: Math.max(m.consecutiveCorrectCount || 0, 2),
              lastPracticedAt: now,
            };
          }
          return m;
        });
        set({ mistakes: currentMistakes });
      },

      saveRemedialExercise: (id: string, exercise: RemedialExercise) => {
        const currentMistakes = get().mistakes.map((m) => {
          if (m.id === id) {
            return {
              ...m,
              remedialExercise: exercise,
            };
          }
          return m;
        });
        set({ mistakes: currentMistakes });
      },

      saveAiHint: (id: string, hint: string) => {
        const currentMistakes = get().mistakes.map((m) => {
          if (m.id === id) {
            return {
              ...m,
              aiHint: hint
            };
          }
          return m;
        });
        set({ mistakes: currentMistakes });
      },

      removeMistake: (id: string) => {
        set({ mistakes: get().mistakes.filter((m) => m.id !== id) });
      },

      clearMasteredMistakes: () => {
        set({ mistakes: get().mistakes.filter((m) => !m.mastered) });
      },

      clearAllMistakes: () => {
        set({ mistakes: [] });
      },

      getActiveMistakesCount: () => {
        return get().mistakes.filter((m) => !m.mastered).length;
      },

      getMasteredMistakesCount: () => {
        return get().mistakes.filter((m) => m.mastered).length;
      },

      getMistakesByGrade: (grade: GradeLevel) => {
        return get().mistakes.filter((m) => m.grade === grade);
      }
    }),
    {
      name: 'toan_thcs_mistake_vault',
      storage: createJSONStorage(() => localStorage)
    }
  )
);
