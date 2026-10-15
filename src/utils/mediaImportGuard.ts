import type { Question } from '../types';

/** Return only supplied source answers; never solve/generate an answer during import. */
export function resolveGeminiEssayReference(q: {
  correctAnswer?: unknown; answer?: unknown; essayAnswer?: unknown; expectedAnswer?: unknown;
  explanation?: unknown; solution?: unknown; detailedSolution?: unknown;
  rubric?: unknown; markingGuide?: unknown;
}): string {
  const values = [q.correctAnswer, q.answer, q.essayAnswer, q.expectedAnswer,
    q.explanation, q.solution, q.detailedSolution, q.rubric, q.markingGuide];
  return values.map(value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '').find(Boolean) || '';
}

/** Validation of NEW Gemini PDF imports only: never touches already-saved exams. */
export interface MediaImportIssue {
  order: number;
  level: 'error' | 'warning';
  message: string;
}

/** Detect labels such as a), b), ..., h) that have no expression after them. */
export function findEmptyEssaySubparts(question: string): string[] {
  const source = String(question || '').replace(/\u00a0/g, ' ');
  const marker = /(?:^|\s)([a-h])\)[ \t]*/gi;
  const locations: Array<{ label: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    locations.push({ label: match[1].toLowerCase(), start: match.index, end: marker.lastIndex });
  }
  if (locations.length === 0) return [];

  const empty: string[] = [];
  for (let i = 0; i < locations.length; i++) {
    const part = source.slice(locations[i].end, locations[i + 1]?.start ?? source.length)
      .replace(/^\s*(?:\((?:NB|TH|VD|VDC)\)|\[(?:NB|TH|VD|VDC)\])\s*/i, '')
      .replace(/[\s:;,.–—-]/g, '');
    if (!part) empty.push(`${locations[i].label})`);
  }
  return empty;
}

export function auditNewMediaQuestions(
  questions: ReadonlyArray<Pick<Question, 'order' | 'type' | 'question' | 'correctAnswer' | 'explanation' | 'rubric' | 'points'>>,
  metadata: { expectedQuestionCount?: number; declaredTotalPoints?: number } = {}
): MediaImportIssue[] {
  const issues: MediaImportIssue[] = [];
  const seen = new Set<number>();
  for (const q of questions) {
    const order = Number(q.order) || 0;
    const essay = q.type === 'essay' || q.type === 'short_answer';
    if (seen.has(order)) issues.push({ order: 0, level: 'error', message: `Số thứ tự ${order} bị trùng; cần kiểm tra lại thứ tự câu.` });
    seen.add(order);
    if (!q.question?.trim() || /^câu hỏi\s*\d+$/i.test(q.question.trim())) {
      issues.push({ order, level: 'error', message: 'AI chưa trích xuất được đề bài thực tế.' });
    }
    if (essay) {
      const blank = findEmptyEssaySubparts(q.question || '');
      if (blank.length > 0) issues.push({ order, level: 'error', message: `Thiếu nội dung ở các ý ${blank.join(', ')}; không được nhập câu chưa đủ biểu thức.` });
      const hasReference = Boolean(q.correctAnswer?.trim() || q.explanation?.trim() || q.rubric?.trim());
      if (!hasReference) issues.push({ order, level: 'warning', message: 'Chưa nhận được đáp án/lời giải/barem. Hãy đối chiếu PDF trước khi giao bài.' });
      if (/^[A-D]$/i.test(q.correctAnswer?.trim() || '')) {
        issues.push({ order, level: 'warning', message: 'Đáp án tự luận chỉ có một chữ A–D; có thể AI đã nhầm với trắc nghiệm.' });
      }
    }
  }
  if (Number.isInteger(metadata.expectedQuestionCount) && metadata.expectedQuestionCount! > 0 && metadata.expectedQuestionCount !== questions.length) {
    issues.push({ order: 0, level: 'error', message: `AI nhận diện tài liệu có ${metadata.expectedQuestionCount} câu, nhưng chỉ bóc tách ${questions.length} câu.` });
  }
  if (typeof metadata.declaredTotalPoints === 'number' && Number.isFinite(metadata.declaredTotalPoints) && metadata.declaredTotalPoints > 0) {
    const sum = questions.reduce((total, q) => total + (Number(q.points) || 0), 0);
    if (Math.abs(sum - metadata.declaredTotalPoints) > 0.011) {
      issues.push({ order: 0, level: 'warning', message: `Tổng điểm AI bóc tách (${Math.round(sum * 100) / 100}) khác tổng điểm ghi trên PDF (${metadata.declaredTotalPoints}).` });
    }
  }
  return issues;
}
