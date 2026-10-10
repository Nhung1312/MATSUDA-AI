import type { Question } from '../types';
import { isEssayQuestion } from './questionUtils';

/**
 * Stable signature of inputs used to verify an answer. This is a change detector,
 * not a security hash. Do not include scores or UI-only metadata.
 */
export function getQuestionVerificationFingerprint(q: Question): string {
  const source = JSON.stringify({
    question: q.question || '',
    type: q.type || '',
    options: (q.options || []).map(option => [option.id, option.text]),
    correctAnswer: q.correctAnswer || '',
    explanation: q.explanation || '',
    rubric: q.rubric || '',
    imageUrl: q.imageUrl || ''
  });
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `v1:${(hash >>> 0).toString(16).padStart(8, '0')}:${source.length}`;
}

/** A reference is required for verification; generating a missing answer is a separate task. */
export function hasVerificationReference(q: Question): boolean {
  if ((q.correctAnswer || '').trim()) return true;
  return (isEssayQuestion(q) || q.type === 'short_answer') &&
    Boolean((q.rubric || '').trim() || (q.explanation || '').trim());
}

/** Treat legacy 'verified' questions without a signature as already approved. */
export function isQuestionVerifiedCurrent(q: Question): boolean {
  if (q.verificationStatus !== 'verified' || q.needsReview === true) return false;
  return !q.verificationFingerprint || q.verificationFingerprint === getQuestionVerificationFingerprint(q);
}

export function shouldVerifyQuestion(q: Question): boolean {
  return !isQuestionVerifiedCurrent(q);
}
