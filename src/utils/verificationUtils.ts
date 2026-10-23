import type { Question } from '../types';
import { getEssayGradingReference, isEssayQuestion } from './questionUtils';
import type { QuestionVerificationResult } from '../services/aiService';

export type VerificationIssue = 'answer_mismatch' | 'missing_answer' | 'missing_data' | 'unverified';
export const verificationIssueLabels: Record<VerificationIssue, string> = {
  answer_mismatch: 'Đáp án chưa khớp — cần đối chiếu', missing_answer: 'Thiếu đáp án / hướng dẫn chấm',
  missing_data: 'Thiếu hoặc chưa đọc được dữ kiện', unverified: 'AI chưa xác minh được'
};

export function hasVerificationReference(q: Question): boolean {
  if (isEssayQuestion(q)) {
    const source = getEssayGradingReference(q);
    return Boolean(source.correctAnswer || source.rubric.trim());
  }
  return Boolean(q.correctAnswer?.trim());
}

/** Legacy needs_review is not evidence that the mathematics is wrong. */
export function getVerificationIssue(q: Question, result?: QuestionVerificationResult): VerificationIssue {
  if (!hasVerificationReference(q)) return 'missing_answer';
  if (!q.question?.trim() || (!q.imageUrl && /(?:hình|bảng|đồ\s*thị)\s*(?:bên|dưới|sau|trên)/i.test(q.question))) return 'missing_data';
  return result?.reviewIssue || q.verificationIssue || 'unverified';
}
