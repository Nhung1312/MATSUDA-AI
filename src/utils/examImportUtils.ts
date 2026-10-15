import type { Question } from '../types';
import { formatQuestionSubItems } from './questionUtils';
import { resolveGeminiEssayReference } from './mediaImportGuard';
import { reconcileExtraGeminiPdfSolutions, type PdfQuestionReference } from './reconcileGeminiPdf';

export class ExamImportError extends Error {
  name = 'ExamImportError';
}

/** Explicit source labels only; mathematical conclusions are never guessed. */
export function separateQuestionAndSolution(text: string): { question: string; solution: string } {
  const match = text.match(/(?:^|\n|[ \t]+)(?:Lời\s*giải(?:\s*chi\s*tiết)?|Giải\s*thích|Hướng\s*dẫn\s*(?:chấm|giải)|Đáp\s*(?:án|số)|HD)(?:[ \t]*[:：\-][ \t]*|[ \t]*\r?\n)([\s\S]+)$/i);
  return match
    ? { question: text.slice(0, match.index).trim(), solution: match[1].trim() }
    : { question: text.trim(), solution: '' };
}

/** Validate one AI response locally; no second extraction/API call. */
export function normalizeMediaExamQuestions(payload: any, pdfReference?: PdfQuestionReference): Question[] {
  const entries: any[] = Array.isArray(payload) ? payload
    : Array.isArray(payload?.questions) ? payload.questions
    : Array.isArray(payload?.data) ? payload.data : [];
  const sourceQuestions = entries.filter(q => q && !['answer', 'solution'].includes(q.sourceRole));
  const sourceAnswers = [
    ...entries.filter(q => q && ['answer', 'solution'].includes(q.sourceRole)),
    ...(Array.isArray(payload?.answers) ? payload.answers : [])
  ];
  if (sourceQuestions.length === 0) {
    throw new ExamImportError('Không tìm thấy đề bài trong tài liệu. Phần đáp án/lời giải không được nhập thành câu hỏi.');
  }

  const orders = sourceQuestions.map((q, idx) => Number(q.order) || idx + 1);
  if (new Set(orders).size !== orders.length) {
    throw new ExamImportError('AI trả về số thứ tự câu hỏi bị trùng, có thể đã đọc phần đáp án thành đề. Hãy kiểm tra lại tài liệu trước khi nhập.');
  }

  let questions: Question[] = sourceQuestions.map((q, idx): Question => {
    const order = orders[idx];
    const split = separateQuestionAndSolution(String(q.question || ''));
    if (!split.question) {
      throw new ExamImportError(`Câu ${order} chỉ có đáp án/lời giải, chưa có đề bài. Hệ thống đã dừng nhập để kiểm tra.`);
    }
    const isEssay = q.type === 'essay' || (!Array.isArray(q.options) || q.options.length < 2);
    const options = isEssay ? [] : q.options.map((opt: any, optIdx: number) => ({
      id: String.fromCharCode(65 + optIdx),
      text: String(typeof opt === 'string' ? opt : opt?.text || '').trim()
    }));
    const sourceAnswer = sourceAnswers.filter(a => Number(a.questionOrder ?? a.order) === order);
    if (sourceAnswer.length > 1) {
      throw new ExamImportError(`Có nhiều đáp án nguồn cho Câu ${order}; cần đối chiếu trước khi nhập.`);
    }
    const answer = sourceAnswer[0];
    // Prefer the actual supplied source answer. Empty Gemini fields must not
    // overwrite a valid answer/solution from another source field.
    // No maths are solved or invented during extraction.
    const rawCorrect = isEssay
      ? resolveGeminiEssayReference({
          correctAnswer: answer?.correctAnswer || q.correctAnswer,
          answer: answer?.answer || q.answer,
          essayAnswer: answer?.essayAnswer || q.essayAnswer,
          expectedAnswer: answer?.expectedAnswer || q.expectedAnswer,
          explanation: answer?.explanation || q.explanation,
          solution: answer?.solution || q.solution,
          detailedSolution: answer?.detailedSolution || q.detailedSolution,
          rubric: answer?.rubric || q.rubric,
          markingGuide: answer?.markingGuide || q.markingGuide
        })
      : String(answer?.correctAnswer || q.correctAnswer || '').trim();
    let correctAnswer = rawCorrect;
    if (!isEssay) {
      const originalIndex = q.options.findIndex((opt: any, optIdx: number) =>
        String(typeof opt === 'string' ? String.fromCharCode(65 + optIdx) : opt?.id || String.fromCharCode(65 + optIdx)).trim().toUpperCase() === rawCorrect.toUpperCase());
      correctAnswer = originalIndex >= 0 ? options[originalIndex].id
        : /^[A-D]$/i.test(rawCorrect) && options.some((opt: any) => opt.id === rawCorrect.toUpperCase()) ? rawCorrect.toUpperCase() : '';
    }
    const explanation = String(answer?.explanation || answer?.solution || answer?.detailedSolution || answer?.question || split.solution || q.explanation || q.solution || '').trim();
    const rubric = String(answer?.rubric || answer?.markingGuide || q.rubric || q.markingGuide || '').trim();
    return {
      id: `ai_media_${Date.now()}_${order}_${idx}`,
      order,
      question: formatQuestionSubItems(split.question),
      type: isEssay ? 'essay' : 'multiple_choice',
      options,
      correctAnswer,
      points: Number(q.points) > 0 ? Number(q.points) : isEssay ? 1.0 : 0.5,
      explanation,
      rubric
    };
  }).sort((a, b) => a.order - b.order);

  const reconciliation = pdfReference ? reconcileExtraGeminiPdfSolutions(questions, pdfReference) : null;
  if (reconciliation?.recoveredCount) questions = reconciliation.questions;
  const effectiveOrders = questions.map(question => question.order);
  const counts = reconciliation?.recoveredCount ? { questionCount: pdfReference!.totalFound,
    multipleChoiceCount: pdfReference!.multipleChoiceCount, essayCount: pdfReference!.essayCount } : payload?.sourceCounts;

  // An unlinked source answer is evidence of an extraction mismatch, not a new question.
  if (sourceAnswers.some(a => !a || !effectiveOrders.includes(Number(a.questionOrder ?? a.order)))) {
    throw new ExamImportError('Có đáp án/lời giải chưa ghép được với câu hỏi gốc. Hệ thống đã dừng nhập để tránh sai số câu.');
  }
  for (const [key, count] of [
    ['questionCount', questions.length],
    ['multipleChoiceCount', questions.filter(q => q.type === 'multiple_choice').length],
    ['essayCount', questions.filter(q => q.type === 'essay').length]
  ] as const) {
    if (counts?.[key] !== undefined && Number(counts[key]) !== count) {
      throw new ExamImportError(`AI tách được ${questions.length} câu nhưng số câu trong đề nguồn không khớp. Hãy kiểm tra lại phần đề và đáp án trước khi nhập.`);
    }
  }
  return questions;
}
