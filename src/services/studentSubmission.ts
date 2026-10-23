import { GradingService } from './gradingService';
import { isEssayQuestion } from '../utils/questionUtils';
import type { Submission } from '../types';

/** Reuse the existing objective scoring. No AI call or grading algorithm here. */
export function buildStudentSubmission(params: Omit<Parameters<typeof GradingService.gradeSubmission>[0], 'aiFeedbacks'>): Submission {
  const graded = GradingService.gradeSubmission(params);
  const essays = new Set(params.assignment.questions.filter(isEssayQuestion).map(q => q.id));
  if (!essays.size) return { ...graded, submissionWorkflow: 'submit_first' };
  return { ...graded, submissionWorkflow: 'submit_first', gradingStatus: 'pending_teacher_grading',
    isProvisional: true, needsTeacherReview: true, ungradedCount: essays.size,
    wrongCount: graded.answers.filter(a => !essays.has(a.questionId) && !a.isCorrect && a.selectedAnswer.trim()).length,
    answers: graded.answers.map(a => essays.has(a.questionId)
      ? { ...a, aiGraded: false, needsTeacherReview: true, isProvisional: true } : a) };
}
