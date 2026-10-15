import type { Question } from '../types';

/** Text-only evidence from the independent PDF parser; never used on saved exams. */
export interface PdfQuestionReference {
  totalFound: number;
  multipleChoiceCount: number;
  essayCount: number;
  warnings?: string[];
  items: ReadonlyArray<{ category: 'trac_nghiem' | 'tu_luan'; question?: string; options?: Question['options']; explanation?: string; rubric?: string }>;
}
export interface PdfReconciliation { questions: Question[]; recoveredCount: number; note?: string }
const isEssay = (q: Question) => q.type === 'essay' || q.type === 'short_answer';
// Display-only differences are allowed. Numbers, operators and letter case remain significant.
const evidence = (text: string) => String(text || '').normalize('NFC')
  .replace(/^(?:Lời\s*giải|Đáp\s*án|Hướng\s*dẫn\s*giải)\s*[:.-]?\s*/i, '')
  .replace(/^(?:Câu|Bài|Question)\s*\d+(?:\s*\([^)]*\))?[.:\s]*/i, '')
  .replace(/\\(?:left|right|displaystyle)\b/g, '').replace(/[−–—]/g, '-').replace(/[$\s]/g, '');

/** Collapse only a complete, exact duplicate answer section; never use token/fuzzy similarity. */
export function reconcileExtraGeminiPdfSolutions(aiQuestions: readonly Question[], reference: PdfQuestionReference): PdfReconciliation {
  const unchanged = (): PdfReconciliation => ({ questions: [...aiQuestions], recoveredCount: 0 });
  const count = reference.totalFound, prefix = aiQuestions.slice(0, count), extra = aiQuestions.slice(count);
  const essays = reference.items.filter(item => item.category === 'tu_luan');
  if (!Number.isSafeInteger(count) || count <= 0 || reference.items.length !== count || reference.warnings?.length
    || essays.length === 0 || essays.length !== reference.essayCount || extra.length !== essays.length
    || reference.multipleChoiceCount + reference.essayCount !== count
    || prefix.length !== count || prefix.filter(isEssay).length !== essays.length
    || !prefix.every((q, i) => q.order === i + 1 && isEssay(q) === (reference.items[i].category === 'tu_luan')
      && !!evidence(reference.items[i].question || '') && evidence(q.question) === evidence(reference.items[i].question!)
      && (isEssay(q) || (q.options.length >= 2 && q.options.length === reference.items[i].options?.length
        && q.options.every((option, index) => evidence(option.text) === evidence(reference.items[i].options![index].text)))))
    || !extra.every((q, i) => isEssay(q) && q.order === count + i + 1
      && !!essays[i].explanation?.trim() && evidence(q.question) === evidence(essays[i].explanation!))) return unchanged();
  let index = 0;
  const repaired = prefix.map(q => {
    if (!isEssay(q)) return q;
    const original = essays[index++];
    return { ...q, explanation: q.explanation?.trim() ? q.explanation : original.explanation || '',
      rubric: q.rubric?.trim() ? q.rubric : original.rubric || '' };
  });
  return { questions: repaired, recoveredCount: extra.length,
    note: `Đã đối chiếu PDF gốc và ghép ${extra.length} mục lời giải trùng về các bài tự luận. Giáo viên cần duyệt lại trước khi nhập.` };
}
