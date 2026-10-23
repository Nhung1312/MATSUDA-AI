import { requestExamVerification } from './examVerificationTransport';
import { hasVerificationReference } from '../utils/verificationUtils';
import type { Question } from '../types';
import type { QuestionVerificationResult } from './aiService';
import { isEssayQuestion, getEssayGradingReference } from '../utils/questionUtils';
import { fingerprintAIInput, readAIResult, writeAIResult, loadAIImage } from '../utils/aiResultCache';

export interface VerificationParams {
  questions: Question[];
  grade?: string;
  topic?: string;
  onProgress?: (current: number, total: number) => void;
  force?: boolean;
}

const MODEL = 'gemini-3.8-flash';
const ENGINE = 'verification-v5-server-restored-20261024';
const inFlight = new Map<string, Promise<QuestionVerificationResult[]>>();

export async function verificationFingerprint(q: Question, grade = '7', topic = 'Toán THCS'): Promise<string | null> {
  return fingerprintAIInput({ engine: ENGINE, model: MODEL, grade, topic, question: q.question,
    type: isEssayQuestion(q) ? 'essay' : q.type, options: isEssayQuestion(q) ? [] : q.options, correctAnswer: q.correctAnswer,
    explanation: q.explanation || '', rubric: q.rubric || '', points: q.points, imageUrl: q.imageUrl || '' });
}

function resultFor(q: Question, reason: string, reviewIssue: QuestionVerificationResult['reviewIssue'] = 'unverified'): QuestionVerificationResult {
  return { questionId: q.id, order: q.order, currentAnswer: q.correctAnswer, proposedAnswer: '',
    matchesCurrentAnswer: false, confidence: 'needs_review', reason, sanityCheckNote: reason, needsReview: true, reviewIssue };
}

function uniqueItem(list: any[], id: string): any {
  const found = list.filter(item => item?.questionId === id);
  return found.length === 1 ? found[0] : undefined;
}

function normalizeProposed(q: Question, value: any): string {
  const text = String(value || '').trim();
  if (isEssayQuestion(q)) return text;
  if (q.type !== 'short_answer') return text.toUpperCase();
  const numeric = text.replace(',', '.').match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!numeric) return text;
  const integer = numeric[2].replace(/^0+(?=\d)/, '');
  const fractional = (numeric[3] || '').replace(/0+$/, '');
  return (numeric[1] === '-' && (integer !== '0' || fractional) ? '-' : '') + integer + (fractional ? `.${fractional}` : '');
}

/**
 * A second independent Gemini answer can resolve an essay initially marked
 * medium-confidence only with clear, explicit source agreement. Never infer
 * mathematical equivalence by deleting operators, changing variable case or
 * trusting the model's own matchesCurrentAnswer flag alone.
 *
 * Ambiguous/missing references and incomplete multipart answers still require
 * a teacher. No grade or original answer is mutated here.
 */
export function hasTrustedEssaySecondPassAgreement(
  question: Question,
  first: any,
  second: any
): boolean {
  const source = getEssayGradingReference(question).correctAnswer.trim();
  const firstAnswer = String(first?.proposedAnswer || '').trim();
  const secondAnswer = String(second?.pass2Answer || '').trim();
  if (!source || !firstAnswer || !secondAnswer) return false;
  if (first?.matchesCurrentAnswer !== true || first?.needsReview !== false
    || !['high', 'medium'].includes(first?.confidence)
    || second?.confidence !== 'high') return false;

  // Strict typography normalization only (not an algebraic equivalence engine).
  const key = (value: string) => value.normalize('NFC')
    .replace(/[−–]/g, '-').replace(/[\s\u00a0]+/g, '').replace(/[.;]+$/g, '');
  if (key(source) !== key(firstAnswer) || key(source) !== key(secondAnswer)) return false;

  // A source/AI answer that covers only part (a) of an (a)–(d) problem
  // must not pass simply because all the recorded fragments agree.
  const parts = (value: string) => new Set(Array.from(
    value.matchAll(/(?:^|[\s;])([a-h])\)\s*/gi), match => match[1].toLowerCase()
  ));
  const expected = parts(question.question || '');
  if (expected.size > 1) {
    for (const candidate of [source, firstAnswer, secondAnswer]) {
      const actual = parts(candidate);
      if ([...expected].some(label => !actual.has(label))) return false;
    }
  }
  return true;
}

export async function verifyWithReuse(params: VerificationParams, _legacyApiKey?: string | null): Promise<QuestionVerificationResult[]> {
  const { questions, grade = '7', topic = 'Toán THCS', force = false, onProgress } = params;
  if (!questions.length) return [];
  if (new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('Đề có ID câu hỏi bị trùng. Chưa thể đối soát an toàn; giữ nguyên ID và đề gốc để giáo viên kiểm tra.');
  const fingerprints = await Promise.all(questions.map(q => verificationFingerprint(q, grade, topic)));
  const runKey = await fingerprintAIInput({ fingerprints, ids: questions.map(q => q.id), force });
  if (runKey && inFlight.has(runKey)) {
    const results = await inFlight.get(runKey)!;
    onProgress?.(questions.length, questions.length);
    return results;
  }
  const task = run();
  if (runKey) inFlight.set(runKey, task);
  try { return await task; }
  finally { if (runKey) inFlight.delete(runKey); }

  async function run(): Promise<QuestionVerificationResult[]> {
    const output = new Map<string, QuestionVerificationResult>();
    let completed = 0;
    const pending: Question[] = [];
    const fpById = new Map(questions.map((q, idx) => [q.id, fingerprints[idx]]));
    const finish = (q: Question, result: QuestionVerificationResult) => {
      const full = { ...result, questionId: q.id, order: q.order, currentAnswer: q.correctAnswer,
        inputFingerprint: fpById.get(q.id) || undefined };
      output.set(q.id, full);
      writeAIResult('verification', fpById.get(q.id) || null, full);
      onProgress?.(++completed, questions.length);
    };
    for (const q of questions) {
      const cached = !force && readAIResult<QuestionVerificationResult>('verification', fpById.get(q.id) || null);
      if (cached) finish(q, { ...cached, reusedResult: true });
      else pending.push(q);
    }
    if (!pending.length) return questions.map(q => output.get(q.id)!);
    const callAI = async (selected: Question[], phase: 'source' | 'independent', images: Map<string, { mimeType: string; data: string }>) => {
      const payload = selected.map(q => ({ id: q.id, order: q.order, question: q.question, type: q.type,
        options: q.options || [], correctAnswer: q.correctAnswer || '', explanation: q.explanation || '', rubric: q.rubric || '', points: q.points, imageUrl: images.has(q.id)
        ? `data:${images.get(q.id)!.mimeType};base64,${images.get(q.id)!.data}` : undefined }));
      return requestExamVerification(payload, grade, topic, phase);
    };

    for (let offset = 0; offset < pending.length; offset += 4) {
      const batch = pending.slice(offset, offset + 4);
      const images = new Map<string, { mimeType: string; data: string }>();
      const valid: Question[] = [];
      for (const q of batch) {
        if (!hasVerificationReference(q)) { finish(q, resultFor(q, 'Chưa có đáp án/lời giải/barem để đối chiếu. Không kết luận câu hỏi sai và không tự điền đáp án.', 'missing_answer')); continue; }
        const text = [q.question, ...(q.options || []).map(o => o.text)].join(' ');
        if (!q.question?.trim()) { finish(q, resultFor(q, 'Câu hỏi chưa có nội dung đề.', 'missing_data')); continue; }
        if (!isEssayQuestion(q) && q.type === 'multiple_choice' && (!q.options || q.options.length < 2 || q.options.some(o => !o.text?.trim() || /^(phương án|đáp án|lựa chọn|option)\s*[a-d]$/i.test(o.text.trim())) || new Set(q.options.map(o => o.id)).size !== q.options.length)) {
          finish(q, resultFor(q, 'Các phương án còn trống, chỉ là mẫu hoặc trùng nhãn. Cần sửa cấu trúc trước khi gọi AI.', 'missing_data')); continue;
        }
        if (!q.imageUrl && /(?:hình|bảng|đồ\s*thị)\s*(?:bên|dưới|sau|trên)/i.test(text)) {
          finish(q, resultFor(q, 'Đề yêu cầu hình/bảng nguồn nhưng chưa có ảnh; cần bổ sung trước khi thẩm định.', 'missing_data')); continue;
        }
        if (q.imageUrl) {
          try { images.set(q.id, await loadAIImage(q.imageUrl)); }
          catch { finish(q, resultFor(q, 'Chưa đọc được hình nguồn; không xác nhận đáp án khi thiếu dữ kiện hình.', 'missing_data')); continue; }
        }
        valid.push(q);
      }
      const pass1 = new Map<string, any>();
      const toRead: Question[] = [];
      for (const q of valid) {
        const cached = !force && readAIResult<any>('verification-pass1', fpById.get(q.id) || null);
        if (cached) pass1.set(q.id, { ...cached, questionId: q.id }); else toRead.push(q);
      }
      if (toRead.length) {
        const list = await callAI(toRead, 'source', images);
        for (const q of toRead) {
          const item = uniqueItem(list, q.id);
          if (item) {
            pass1.set(q.id, item);
            writeAIResult('verification-pass1', fpById.get(q.id) || null, item);
          }
        }
      }

      const suspects: Question[] = [];
      for (const q of valid) {
        const item = pass1.get(q.id);
        const essay = isEssayQuestion(q);
        const proposed = normalizeProposed(q, item?.proposedAnswer);
        const reference = getEssayGradingReference(q);
        const hasSource = essay ? !!(reference.correctAnswer || reference.rubric) : !!q.correctAnswer?.trim();
        const validMC = essay || q.type !== 'multiple_choice' || (q.options?.length >= 2 && q.options.every(o => o.text?.trim()) && q.options.some(o => o.id === proposed));
        const passes = hasSource && validMC && !!proposed && item?.matchesCurrentAnswer === true && item?.confidence === 'high'
          && item?.needsReview === false && (essay || proposed === normalizeProposed(q, q.correctAnswer));
        if (passes) finish(q, { questionId: q.id, order: q.order, currentAnswer: q.correctAnswer, proposedAnswer: proposed,
          matchesCurrentAnswer: true, confidence: 'high', needsReview: false, reason: item.reason || 'Khớp nguồn, đủ các ý.', pass1Answer: proposed, sanityCheckNote: item.reason || 'Khớp nguồn.' });
        else suspects.push(q);
      }

      if (suspects.length) {
        // An unavailable second pass is a service failure, never a mathematical verdict.
        const pass2 = await callAI(suspects, 'independent', images);
        for (const q of suspects) {
          const first = pass1.get(q.id);
          const second = uniqueItem(pass2, q.id);
          const essay = isEssayQuestion(q);
          const normalize = (v: any) => normalizeProposed(q, v);
          const p1 = normalize(first?.proposedAnswer);
          const p2 = normalize(second?.pass2Answer);
          const current = normalize(q.correctAnswer);
          const uncertain = essay
            ? !hasTrustedEssaySecondPassAgreement(q, first, second)
            : (!first || !second || !p1 || !p2 || !current || first.matchesCurrentAnswer !== true
              || first.needsReview !== false || !['high', 'medium'].includes(first.confidence) || second.confidence !== 'high'
              || p1 !== current || p2 !== current || (q.type === 'multiple_choice' && !q.options?.some(o => o.id === p2 && o.text?.trim())));
          const reviewIssue = uncertain && p1 && p2 && p1 === p2 && p1 !== current && second?.confidence === 'high'
            ? 'answer_mismatch' : 'unverified';
          const note = [first?.reason ? `Lượt 1: ${first.reason}` : 'Lượt 1 chưa đủ căn cứ.', second?.reason ? `Lượt 2: ${second.reason}` : 'Lượt 2 chưa có kết quả hợp lệ.'].join(' | ');
          finish(q, { questionId: q.id, order: q.order, currentAnswer: q.correctAnswer, proposedAnswer: p1 || p2,
            matchesCurrentAnswer: !uncertain, confidence: uncertain ? 'needs_review' : 'high', reason: note,
            needsReview: uncertain, reviewIssue: uncertain ? reviewIssue : undefined, pass1Answer: p1 || undefined, pass2Answer: p2 || undefined, sanityCheckNote: note });
        }
      }
    }
    return questions.map(q => output.get(q.id)!);
  }
}
