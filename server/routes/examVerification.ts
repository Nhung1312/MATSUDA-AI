import { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { buildVerificationParts, VERIFICATION_MODEL } from '../verificationPrompts.js';

export const examVerificationRouter = Router();
const inFlight = new Map<string, Promise<any[]>>();

examVerificationRouter.post('/pass', async (req, res) => {
  const requestId = randomUUID(), startedAt = Date.now();
  const reply = (status: number, value: object) => {
    console.info('[Exam Verification]', JSON.stringify({ requestId, status, durationMs: Date.now() - startedAt }));
    return res.status(status).json({ ...value, requestId });
  };
  const { questions, phase, grade = '7', topic = 'Toán THCS' } = req.body || {};
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 4
    || !['source', 'independent'].includes(phase) || typeof grade !== 'string' || typeof topic !== 'string'
    || new Set(questions.map(q => q?.id)).size !== questions.length
    || questions.some(q => !q || typeof q.id !== 'string' || !q.id || typeof q.question !== 'string' || !q.question.trim()
      || !Array.isArray(q.options) || q.options.some((o: any) => typeof o?.id !== 'string' || typeof o?.text !== 'string')
      || ['correctAnswer', 'explanation', 'rubric'].some(key => q[key] !== undefined && typeof q[key] !== 'string')
      || (q.imageUrl && (typeof q.imageUrl !== 'string' || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(q.imageUrl))))
    || new TextEncoder().encode(JSON.stringify(req.body)).length > 4_000_000) {
    return reply(400, { success: false, analysisSource: 'unavailable', message: 'Dữ liệu câu hỏi chưa hợp lệ hoặc ảnh quá lớn. Không thay đổi đề gốc.' });
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return reply(503, { success: false, analysisSource: 'unavailable', message: 'Dịch vụ thẩm định chưa được cấu hình trên máy chủ. Không cần nhập API key vào trình duyệt.' });
  try {
    const fingerprint = createHash('sha256').update(JSON.stringify({ questions, phase, grade, topic })).digest('hex');
    let task = inFlight.get(fingerprint);
    if (!task) {
      task = (async () => {
        const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } } });
        const response = await ai.models.generateContent({ model: VERIFICATION_MODEL,
          contents: buildVerificationParts(questions, grade, topic, phase),
          config: { responseMimeType: 'application/json', temperature: 0.1 } });
        const text = (response.text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(text);
        const results = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : [];
        if (!results.length) throw new Error('EMPTY_VERIFICATION');
        // Whitelist provider output. Do not reflect errors, credentials or request bodies.
        return results.map(item => Object.fromEntries(['questionId', 'proposedAnswer', 'pass2Answer',
          'matchesCurrentAnswer', 'confidence', 'needsReview', 'reason'].filter(k => item[k] !== undefined).map(k => [k, item[k]])));
      })();
      inFlight.set(fingerprint, task);
      void task.finally(() => { if (inFlight.get(fingerprint) === task) inFlight.delete(fingerprint); }).catch(() => {});
    }
    const results = await task;
    return reply(200, { success: true, analysisSource: 'ai', modelUsed: VERIFICATION_MODEL, results });
  } catch (error: any) {
    const code = Number(error?.status || error?.code);
    const quota = code === 429 || /RESOURCE_EXHAUSTED|429/.test(String(error?.message));
    const timeout = /timeout|timed out|abort/i.test(String(error?.message));
    return reply(quota ? 429 : timeout ? 504 : code === 503 ? 503 : 502, { success: false,
      analysisSource: 'unavailable', message: quota ? 'Gemini đã hết hạn mức (429). Đã dừng gọi tiếp; thử lại sau.'
        : timeout ? 'Gemini chưa hoàn tất trong thời gian chờ. Chưa có kết luận; đề và đáp án được giữ nguyên.'
        : 'Gemini chưa trả được kết quả thẩm định hợp lệ. Chưa kết luận câu hỏi sai; hãy thử lại sau.' });
  }
});
