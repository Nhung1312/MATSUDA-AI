import type { Question } from '../types';

let quotaUntil = 0;
/** Only the exam-verification endpoint; never sends or reads a browser API key. */
export async function requestExamVerification(questions: Question[], grade: string, topic: string,
  phase: 'source' | 'independent'): Promise<any[]> {
  if (Date.now() < quotaUntil) throw Object.assign(new Error('Gemini đang giới hạn lượt gọi (429). Vui lòng chờ một phút rồi thử lại.'), { status: 429 });
  const body = JSON.stringify({ questions, grade, topic, phase });
  if (new TextEncoder().encode(body).length > 4_000_000) throw new Error('Lô câu hỏi có ảnh quá lớn. Hãy thẩm định riêng từng câu; ảnh gốc và đề được giữ nguyên.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100_000);
  try {
    const response = await fetch('/api/exam-verification/pass', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || data?.analysisSource !== 'ai' || !Array.isArray(data?.results)) {
      if (response.status === 429) quotaUntil = Date.now() + 60_000;
      throw Object.assign(new Error(data?.message || `Chưa nhận được kết quả thẩm định từ máy chủ (HTTP ${response.status}). Đề và đáp án cũ được giữ nguyên.`),
        { status: response.status, requestId: data?.requestId });
    }
    return data.results;
  } catch (error: any) {
    if (error?.status) throw error;
    throw new Error(error?.name === 'AbortError'
      ? 'Thẩm định chưa hoàn tất trong thời gian chờ. Đề và đáp án được giữ; hãy thử lại sau.'
      : 'Không kết nối được dịch vụ thẩm định. Chưa có kết luận về câu hỏi; đề và đáp án được giữ nguyên.');
  } finally { clearTimeout(timer); }
}
