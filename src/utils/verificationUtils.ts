import type { Question } from '../types';
import { getEssayGradingReference, isEssayQuestion } from './questionUtils';

/** Verification compares an existing answer/reference; it does not generate a missing answer. */
export function hasVerificationReference(question: Question): boolean {
  if (isEssayQuestion(question)) {
    const reference = getEssayGradingReference(question);
    return Boolean(reference.correctAnswer || reference.rubric);
  }
  return Boolean(question.correctAnswer?.trim() || (question.type === 'short_answer'
    && (question.explanation?.trim() || question.rubric?.trim())));
}
