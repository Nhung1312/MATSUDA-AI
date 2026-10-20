import { GoogleGenAI } from '@google/genai';
import type { Question } from '../types';
import type { QuestionVerificationResult } from './aiService';
import { isEssayQuestion, getEssayGradingReference } from '../utils/questionUtils';
import { fingerprintAIInput, readAIResult, writeAIResult, loadAIImage, isAIQuotaError } from '../utils/aiResultCache';
import { hasVerificationReference } from '../utils/verificationUtils';

export interface VerificationParams {
  questions: Question[];
  grade?: string;
  topic?: string;
  onProgress?: (current: number, total: number) => void;
  force?: boolean;
}

const MODEL = 'gemini-3.8-flash';
const ENGINE = 'verification-v4-independent-batches';
const inFlight = new Map<string, Promise<QuestionVerificationResult[]>>();

export async function verificationFingerprint(q: Question, grade = '7', topic = 'Toán THCS'): Promise<string | null> {
  return fingerprintAIInput({ engine: ENGINE, model: MODEL, grade, topic, question: q.question,
    type: isEssayQuestion(q) ? 'essay' : q.type, options: isEssayQuestion(q) ? [] : q.options, correctAnswer: q.correctAnswer,
    explanation: q.explanation || '', rubric: q.rubric || '', points: q.points, imageUrl: q.imageUrl || '' });
}

function resultFor(q: Question, reason: string): QuestionVerificationResult {
  return { questionId: q.id, order: q.order, currentAnswer: q.correctAnswer, proposedAnswer: '',
    matchesCurrentAnswer: false, confidence: 'needs_review', reason, sanityCheckNote: reason, needsReview: true };
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
  const key = (value: string) => value.normalize('NFKC')
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

function parseList(text: string): any[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const value = JSON.parse(cleaned);
  return Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
}

export async function verifyWithReuse(params: VerificationParams, apiKey: string | null): Promise<QuestionVerificationResult[]> {
  const { questions, grade = '7', topic = 'Toán THCS', force = false, onProgress } = params;
  if (!questions.length) return [];
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
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    const callAI = async (parts: any[]): Promise<any[]> => {
      if (!ai) throw new Error('Chưa cấu hình Gemini API Key. Kết quả chưa có cần AI để thẩm định.');
      try {
        const response = await ai.models.generateContent({ model: MODEL, contents: parts, config: { responseMimeType: 'application/json', temperature: 0.1 } });
        return parseList(response.text || '');
      } catch (error: any) {
        if (isAIQuotaError(error)) {
          const quota: any = new Error('AI hết hạn mức (429 RESOURCE_EXHAUSTED). Đã giữ kết quả trước đó; dừng gọi tiếp.');
          quota.isQuota = true;
          quota.status = 429;
          throw quota;
        }
        throw error;
      }
    };

    for (let offset = 0; offset < pending.length; offset += 4) {
      const batch = pending.slice(offset, offset + 4);
      const images = new Map<string, { mimeType: string; data: string }>();
      const valid: Question[] = [];
      for (const q of batch) {
        if (!hasVerificationReference(q)) {
          finish(q, resultFor(q, 'Chưa có đáp án/lời giải/barem để đối chiếu. Giáo viên cần bổ sung trước khi thẩm định.'));
          continue;
        }
        const text = [q.question, ...(q.options || []).map(o => o.text)].join(' ');
        if (!q.question?.trim()) { finish(q, resultFor(q, 'Câu hỏi chưa có nội dung đề.')); continue; }
        if (!isEssayQuestion(q) && q.type === 'multiple_choice' && (!q.options || q.options.length < 2 || q.options.some(o => !o.text?.trim() || /^(phương án|đáp án|lựa chọn|option)\s*[a-d]$/i.test(o.text.trim())) || new Set(q.options.map(o => o.id)).size !== q.options.length)) {
          finish(q, resultFor(q, 'Các phương án còn trống, chỉ là mẫu hoặc trùng nhãn. Cần sửa cấu trúc trước khi gọi AI.')); continue;
        }
        if (!q.imageUrl && /(?:hình|bảng|đồ\s*thị)\s*(?:bên|dưới|sau|trên)/i.test(text)) {
          finish(q, resultFor(q, 'Đề yêu cầu hình/bảng nguồn nhưng chưa có ảnh; cần bổ sung trước khi thẩm định.')); continue;
        }
        if (q.imageUrl) {
          try { images.set(q.id, await loadAIImage(q.imageUrl)); }
          catch { finish(q, resultFor(q, 'Chưa đọc được hình nguồn; không xác nhận đáp án khi thiếu dữ kiện hình.')); continue; }
        }
        valid.push(q);
      }
      const partsFor = (prompt: string, selected: Question[]) => {
        const parts: any[] = [{ text: prompt }];
        for (const q of selected) if (images.has(q.id)) {
          parts.push({ text: `Hình nguồn của câu [Mã: ${q.id}]:` });
          parts.push({ inlineData: images.get(q.id) });
        }
        return parts;
      };
      const describe = (q: Question, includeSource: boolean) => `[Mã: ${q.id}] (Câu ${q.order})\nLoại: ${isEssayQuestion(q) ? 'TỰ LUẬN' : q.type === 'short_answer' ? 'TRẢ LỜI NGẮN' : q.type === 'true_false' ? 'ĐÚNG/SAI' : 'TRẮC NGHIỆM'}\nĐề bài: ${q.question}\n${isEssayQuestion(q) ? '(Tự luận)' : (q.options || []).map(o => `${o.id}. ${o.text}`).join(' | ')}${includeSource ? `\n[Đáp án hiện tại]: ${q.correctAnswer || 'Chưa có'}\n[Điểm của câu]: ${q.points}\n[Lời giải hiện tại]: ${q.explanation || ''}\n[Biểu điểm nguồn]: ${q.rubric && q.rubric !== q.explanation ? q.rubric : ''}` : ''}`;

      const pass1 = new Map<string, any>();
      const toRead: Question[] = [];
      for (const q of valid) {
        const cached = !force && readAIResult<any>('verification-pass1', fpById.get(q.id) || null);
        if (cached) pass1.set(q.id, { ...cached, questionId: q.id }); else toRead.push(q);
      }
      if (toRead.length) {
        const prompt = `Bạn là chuyên gia thẩm định Toán THCS. Khối ${grade}, chủ đề ${topic}.
Giải độc lập từng câu trước rồi so với đáp án/lời giải/biểu điểm nguồn. Kiểm tra đủ mọi ý, điều kiện, phương án và điểm; không tự sửa dữ liệu nguồn.
Tự luận: kết luận/đáp số theo từng ý, giữ nguyên chữ hoa/thường của ký hiệu toán, không trả A/B/C/D. Nếu đáp án trống hoặc ghi "Xem lời giải chi tiết", đối chiếu lời giải/biểu điểm đầy đủ theo tương đương toán học. Không có nguồn đối chiếu thì cần giáo viên duyệt.
Trắc nghiệm: kiểm tra phương án đúng tồn tại và duy nhất, không mặc định A. Trả lời ngắn: trả kết quả số/biểu thức, giữ ký hiệu toán. Đúng/sai: kiểm tra đủ các mệnh đề, giữ định dạng đáp án nguồn. Thiếu dữ kiện, ảnh chưa rõ, lời giải mâu thuẫn hoặc bất kỳ nghi vấn nào thì needsReview=true.
Geometry Vision Guard: chỉ dùng dữ kiện đề, ký hiệu rõ hoặc chứng minh hợp lệ; không đoán vuông góc/song song/bằng nhau từ hình trông giống.
Mỗi kết quả phải có đúng questionId. Chỉ matchesCurrentAnswer=true, confidence="high", needsReview=false khi toàn bộ câu và nguồn đúng. Nhận xét ngắn; giữ đủ kết luận các ý.
${toRead.map(q => describe(q, true)).join('\n\n')}
Trả DUY NHẤT JSON Array: [{"questionId":"mã","proposedAnswer":"đáp án/kết luận","matchesCurrentAnswer":true,"confidence":"high","needsReview":false,"reason":"căn cứ ngắn"}].`;
        const list = await callAI(partsFor(prompt, toRead));
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
        // Independent second pass: no current answer, explanation or pass-1 result.
        const prompt = `Bạn là chuyên gia độc lập thẩm định Toán THCS, khối ${grade}. Giải từng câu dưới đây từ đề và hình nguồn, không biết kết quả lượt trước.
Giải độc lập đầy đủ các ý của câu tự luận; kết luận theo từng ý, giữ nguyên chữ hoa/thường, không trả A/B/C/D cho tự luận. Trắc nghiệm: thử ngược hoặc giải bằng cách khác, kiểm tra đáp án tồn tại và duy nhất. Trả lời ngắn: kết quả số/biểu thức. Đúng/sai: kiểm tra từng mệnh đề.
Geometry Vision Guard: chỉ dùng giả thiết, ký hiệu rõ và chứng minh; không suy ra quan hệ chỉ vì hình trông giống. Thiếu điều kiện/ảnh mờ thì confidence="needs_review".
${suspects.map(q => describe(q, false)).join('\n\n')}
Trả DUY NHẤT JSON Array, đúng questionId từng câu: [{"questionId":"mã","pass2Answer":"kết luận/đáp án","confidence":"high","reason":"cách kiểm tra ngắn"}].`;
        let pass2: any[] = [];
        try { pass2 = await callAI(partsFor(prompt, suspects)); }
        catch (error) { if (isAIQuotaError(error)) throw error; }
        for (const q of suspects) {
          const first = pass1.get(q.id);
          const second = uniqueItem(pass2, q.id);
          const essay = isEssayQuestion(q);
          const normalize = (v: any) => normalizeProposed(q, v);
          const p1 = normalize(first?.proposedAnswer);
          const p2 = normalize(second?.pass2Answer);
          const current = normalize(q.correctAnswer);
          // Never blanket-reject all essays. Approve only if the independent
          // second pass and explicit source agree, with all subparts present.
          // Keep existing strict multiple-choice/short-answer logic unchanged.
          const uncertain = essay
            ? !hasTrustedEssaySecondPassAgreement(q, first, second)
            : (!first || !second || !p1 || !p2 || !current || first.matchesCurrentAnswer !== true
              || first.needsReview !== false || !['high', 'medium'].includes(first.confidence) || second.confidence !== 'high'
              || p1 !== current || p2 !== current
              || (q.type === 'multiple_choice' && !q.options?.some(o => o.id === p2 && o.text?.trim())));
          const note = [first?.reason ? `Lượt 1: ${first.reason}` : 'Lượt 1 chưa đủ căn cứ.', second?.reason ? `Lượt 2: ${second.reason}` : 'Lượt 2 chưa có kết quả hợp lệ.'].join(' | ');
          finish(q, { questionId: q.id, order: q.order, currentAnswer: q.correctAnswer, proposedAnswer: p1 || p2,
            matchesCurrentAnswer: !uncertain, confidence: uncertain ? 'needs_review' : 'high', reason: note,
            needsReview: uncertain, pass1Answer: p1 || undefined, pass2Answer: p2 || undefined, sanityCheckNote: note });
        }
      }
    }
    return questions.map(q => output.get(q.id)!);
  }
}
