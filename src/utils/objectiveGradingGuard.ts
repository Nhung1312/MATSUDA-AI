import type { Question } from '../types';
import { isEssayQuestion } from './questionUtils';

/**
 * Guard NEW online submissions against premature marking of objective answers.
 * Verification is a TEACHER-side workflow, never an eligibility gate for submitting.
 * Do not apply this guard retroactively to already saved/historical grades.
 */
export function getObjectiveGradingHoldReason(question: Question): string | null {
  if (isEssayQuestion(question)) return null;
  if (question.verificationStatus !== 'verified' || question.needsReview === true
    || question.confidence === 'needs_review') {
    return 'Đáp án câu hỏi chưa được thẩm định/xác nhận; chờ giáo viên đối chiếu trước khi chấm.';
  }

  const key = String(question.correctAnswer || '').trim();
  if (!key) return 'Đáp án nguồn còn trống; chờ giáo viên xác nhận.';
  if (question.type === 'short_answer' || question.type === 'true_false') return null;

  const options = question.options || [];
  const ids = options.map(option => String(option.id || '').trim().toUpperCase());
  const texts = options.map(option => String(option.text || '').trim());
  const keyId = key.replace(/^[.\s(]+|[.\s)]+$/g, '').toUpperCase();
  if (options.length < 2 || new Set(ids).size !== ids.length || texts.some(text => !text)
    || ids.some(id => !id) || new Set(texts.map(text => text.toLocaleLowerCase('vi'))).size !== texts.length) {
    return 'Các lựa chọn không hợp lệ hoặc trùng nhau; cần giáo viên kiểm tra.';
  }
  if (ids.filter(id => id === keyId).length !== 1) {
    return 'Đáp án đúng không khớp duy nhất một phương án trên đề học sinh.';
  }
  return null;
}
