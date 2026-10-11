import type { Question } from '../types';

/** Minimal independently-parsed PDF reference, ONLY for new imports. */
export interface PdfQuestionReference {
  totalFound: number;
  multipleChoiceCount: number;
  essayCount: number;
  items: ReadonlyArray<{
    category: 'trac_nghiem' | 'tu_luan';
    explanation?: string;
    rubric?: string;
  }>;
}
export interface PdfReconciliation {
  questions: Question[];
  recoveredCount: number;
  note?: string;
}
function isEssay(q: Question): boolean {
  return q.type === 'essay' || q.type === 'short_answer';
}
/** Compare source evidence only. Never modify mathematical content itself. */
function evidenceTokens(value: string): Set<string> {
  return new Set(String(value || '').toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/\\(?:left|right|displaystyle|mathrm|text|cdot|times)\b/g, ' ')
    .match(/[a-zà-ỹ]{2,}|\d+(?:[.,]\d+)?/giu) || []);
}
function mathNgrams(value: string): Set<string> {
  const normalized = String(value || '').toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/\\(?:left|right|displaystyle|mathrm|text|cdot|times)\b/g, '')
    .replace(/[^a-z0-9+=()\-]/g, '');
  const grams = new Set<string>();
  for (let i = 0; i + 5 <= normalized.length; i++) grams.add(normalized.slice(i, i+5));
  return grams;
}
function hasSharedSolutionEvidence(candidate: Question, sourceSolution: string): boolean {
  const content = [candidate.question, candidate.correctAnswer, candidate.explanation].join(' ');
  const ai = evidenceTokens(content);
  const source = evidenceTokens(sourceSolution);
  let shared = 0;
  for (const token of ai) if (source.has(token)) shared++;
  if (shared >= 2 && shared / Math.min(ai.size, source.size) >= 0.3) return true;
  // Symbolic proof/identity answers may have very few numeric tokens.
  const left = mathNgrams(content);
  const right = mathNgrams(sourceSolution);
  if (left.size < 8 || right.size < 8) return false;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap >= 8 && overlap / Math.min(left.size, right.size) >= 0.3;
}

/**
 * Gemini sometimes counts trailing worked solutions as extra essay questions.
 * Collapse ONLY if source PDF independently confirms count, type/order sequence
 * and EVERY extra item's mathematical evidence. Otherwise leave all items in
 * place for blocking import warnings; never silently delete a real question.
 */
export function reconcileExtraGeminiPdfSolutions(
  aiQuestions: readonly Question[],
  reference: PdfQuestionReference
): PdfReconciliation {
  const unchanged = (): PdfReconciliation => ({ questions: [...aiQuestions], recoveredCount: 0 });
  const count = reference.totalFound;
  if (!Number.isSafeInteger(count) || count <= 0 || reference.essayCount <= 0 ||
      aiQuestions.length <= count || reference.items.length !== count) return unchanged();
  const prefix = aiQuestions.slice(0, count);
  const extra = aiQuestions.slice(count);
  const sourceEssays = reference.items.filter(q => q.category === 'tu_luan');
  if (extra.length !== sourceEssays.length ||
      sourceEssays.length !== reference.essayCount ||
      prefix.filter(isEssay).length !== sourceEssays.length ||
      prefix.filter(q => !isEssay(q)).length !== reference.multipleChoiceCount ||
      !prefix.every((q,i) => q.order === i+1 && isEssay(q) === (reference.items[i].category === 'tu_luan')) ||
      !extra.every((q,i) => isEssay(q) && q.order === count+i+1) ||
      !sourceEssays.every((item,i) => Boolean(item.explanation?.trim()) &&
        hasSharedSolutionEvidence(extra[i], item.explanation || ''))) return unchanged();

  // Keep Gemini's question, correct answer and points verbatim; only attach an
  // ORIGINAL source solution/rubric where the corresponding field was blank.
  let essayIndex = 0;
  const repaired = prefix.map(q => {
    if (!isEssay(q)) return q;
    const source = sourceEssays[essayIndex++];
    return {
      ...q,
      explanation: q.explanation?.trim() ? q.explanation : (source.explanation || ''),
      rubric: q.rubric?.trim() ? q.rubric : (source.rubric || '')
    };
  });
  return {
    questions: repaired,
    recoveredCount: extra.length,
    note: 'Đã đối chiếu và ghép ' + extra.length + ' mục thuộc trang đáp án về các bài tự luận. Giáo viên cần duyệt lại nội dung và điểm trước khi nhập.'
  };
}