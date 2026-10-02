import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MistakeRecord, Submission, Assignment, GradeLevel, Question } from '../types';

export interface MistakeVaultState {
  mistakes: MistakeRecord[];
  isModalOpen: boolean;
  selectedMistakeId: string | null;

  // Actions
  setModalOpen: (open: boolean) => void;
  setSelectedMistakeId: (id: string | null) => void;
  addMistakesFromSubmission: (submission: Submission, assignment: Assignment) => number;
  addManualMistake: (question: Question, assignment: Assignment, studentAnswer: string) => void;
  recordPracticeAttempt: (id: string, isCorrect: boolean) => void;
  markAsMastered: (id: string) => void;
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

        // Lọc tất cả câu sai trong bài thi
        submission.answers.forEach((ans) => {
          if (!ans.isCorrect) {
            const question = assignment.questions.find((q) => q.id === ans.questionId);
            if (!question) return;

            const mistakeId = `${assignment.id}_${question.id}`;
            const existingIdx = currentMistakes.findIndex((m) => m.id === mistakeId);

            if (existingIdx >= 0) {
              // Cập nhật lại câu sai này (nếu làm lại mà vẫn sai thì đánh dấu chưa mastered)
              currentMistakes[existingIdx] = {
                ...currentMistakes[existingIdx],
                studentAnswer: ans.selectedAnswer || 'Chưa trả lời',
                mastered: false,
                lastPracticedAt: now,
                practiceCount: (currentMistakes[existingIdx].practiceCount || 0) + 1
              };
            } else {
              // Thêm mới câu sai
              currentMistakes.unshift({
                id: mistakeId,
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                assignmentCode: assignment.assignmentCode,
                grade: assignment.grade,
                question,
                studentAnswer: ans.selectedAnswer || 'Chưa trả lời',
                addedAt: now,
                mastered: false,
                practiceCount: 0,
                lastPracticedAt: undefined,
                aiHint: undefined
              });
              addedCount++;
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
          currentMistakes[existingIdx].studentAnswer = studentAnswer;
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
            practiceCount: 0
          });
        }
        set({ mistakes: currentMistakes });
      },

      recordPracticeAttempt: (id: string, isCorrect: boolean) => {
        const currentMistakes = get().mistakes.map((m) => {
          if (m.id === id) {
            return {
              ...m,
              mastered: isCorrect,
              practiceCount: (m.practiceCount || 0) + 1,
              lastPracticedAt: new Date().toISOString()
            };
          }
          return m;
        });
        set({ mistakes: currentMistakes });
      },

      markAsMastered: (id: string) => {
        const currentMistakes = get().mistakes.map((m) => {
          if (m.id === id) {
            return {
              ...m,
              mastered: true,
              lastPracticedAt: new Date().toISOString()
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
