import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Assignment, GradeLevel, Submission } from '../types';

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

export interface LearningProgressState {
  studentName: string;
  records: CompletedAssignmentRecord[];
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  isProgressModalOpen: boolean;
  
  // Actions
  setStudentName: (name: string) => void;
  setProgressModalOpen: (open: boolean) => void;
  recordSubmission: (submission: Submission, assignment: Assignment) => void;
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

      setStudentName: (name: string) => {
        set({ studentName: name.trim() });
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
