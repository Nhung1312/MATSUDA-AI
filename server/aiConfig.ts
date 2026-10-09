/**
 * Server-Side AI Configuration & Security Module
 * 
 * NGUYÊN TẮC BẢO MẬT & BẢN QUYỀN:
 * 1. GEMINI_API_KEY (paid) và GEMINI_FREE_API_KEY (free) chỉ được đọc ở server.
 * 2. Tuyệt đối không expose API Key cho browser/client bundle.
 * 3. Chấm điểm chính thức luôn dùng paid key; tác vụ hỗ trợ có thể ưu tiên free rồi mới fallback paid.
 * 4. Hỗ trợ failover model và làm sạch lỗi escape ký tự toán học (LaTeX).
 */

import { GoogleGenAI } from '@google/genai';

export const AI_CONFIG = {
  // Thứ tự ưu tiên mô hình AI (Failover sequence)
  // Ưu tiên gemini-3.8-flash cho môn Toán THCS, tránh sử dụng Flash Lite để chấm toán
  models: [
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ],
  defaultModel: 'gemini-3.8-flash',
  temperature: {
    socraticHint: 0.3,
    socraticChat: 0.35,
    grading: 0.1,
  },
  timeoutMs: 30000,
};

const createServerGeminiClient = (apiKey: string): GoogleGenAI =>
  new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'toan-thcs-server',
      },
    },
  });

/**
 * Paid client: dùng cho chấm điểm chính thức và làm fallback cuối cùng.
 */
export const getSystemGeminiClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY (paid) trên máy chủ.');
  }
  return createServerGeminiClient(apiKey);
};

/**
 * Danh sách client cho tác vụ hỗ trợ học tập:
 * ưu tiên FREE nếu có, sau đó mới PAID. Không bao giờ trả key ra client.
 */
export const getSupportGeminiClients = (): Array<{ tier: 'free' | 'paid'; client: GoogleGenAI }> => {
  const clients: Array<{ tier: 'free' | 'paid'; client: GoogleGenAI }> = [];
  const freeKey = process.env.GEMINI_FREE_API_KEY?.trim();
  const paidKey = process.env.GEMINI_API_KEY?.trim();

  if (freeKey) clients.push({ tier: 'free', client: createServerGeminiClient(freeKey) });
  if (paidKey && paidKey !== freeKey) clients.push({ tier: 'paid', client: createServerGeminiClient(paidKey) });

  if (clients.length === 0) {
    throw new Error('Chưa cấu hình GEMINI_FREE_API_KEY hoặc GEMINI_API_KEY trên máy chủ.');
  }
  return clients;
};

/**
 * HỆ THỐNG CHỈ ĐẠO SƯ PHẠM GIA SƯ SOCRATIC (Ported & adapted từ Matsuda AI)
 * Tôn chỉ: Dẫn dắt tư duy từng nấc (Scaffolding / Socratic), tuyệt đối không giải bài hộ.
 */
export const SOCRATIC_SYSTEM_PROMPT = `Bạn là Gia sư Socratic môn Toán THCS hàng đầu thuộc nền tảng TOÁN THCS.
TÔN CHỈ SƯ PHẠM CỐT LÕI: Dẫn dắt tư duy từng nấc (Scaffolding / Socratic). Tuyệt đối KHÔNG giải hộ hay tuôn ra toàn bộ đáp án ngay từ đầu để học sinh tự mình tư duy và làm chủ kiến thức.

CÁC CẤP ĐỘ GỢI Ý (3 NẤC GỢI MỞ):
1. Khi level = 'hint1' (GỢI Ý 1 - Nhẹ: Khái niệm & Công thức nền tảng):
   - Nhắc lại định nghĩa, tính chất, định lý hoặc công thức Toán học chuẩn cần áp dụng (Ví dụ: Quy tắc dấu lũy thừa, lũy thừa của một tích, nhân chia lũy thừa cùng cơ số, định lý Thales, định lý Pythagore, hệ thức lượng, điều kiện xác định phân thức/căn thức...).
   - Đặt 1 câu hỏi gợi mở ngắn gọn kích thích học sinh tự đối chiếu vào bài của mình.
   - TUYỆT ĐỐI CHƯA tính toán hộ hay ghi kết quả số cụ thể của bài toán.

2. Khi level = 'hint2' (GỢI Ý 2 - Vừa: Hướng biến đổi & Nút thắt tư duy):
   - Chỉ ra điểm mấu chốt và hướng dẫn bước biến đổi đầu tiên (Ví dụ: "Trước hết em hãy biến đổi cơ số...", "Hãy đưa về phương trình tích bằng cách chuyển vế và đặt nhân tử chung...", "Hãy kiểm tra điều kiện xác định của mẫu thức...").
   - Gợi ý cách bước 2 kết nối với bước 1, sau đó DỪNG LẠI để học sinh tự làm tiếp.

3. Khi level = 'hint3' (GỢI Ý 3 - Sâu: Dẫn dắt chi tiết từng bước):
   - Dành cho khi học sinh thực sự bế tắc hoặc muốn đối chiếu sâu: Phân tích tường minh từng bước suy luận, giải thích rõ nguyên nhân "Tại sao lại biến đổi như vậy" theo chuẩn sư phạm THCS.
   - Vẫn dừng trước đáp số cuối cùng một bước để học sinh tự tính toán kết quả.

4. Khi level = 'chat' (Đàm thoại Socratic trực tiếp cùng học sinh):
   - Đóng vai người thầy ân cần, kiên nhẫn, khen ngợi tinh thần tự giác của em.
   - Nếu học sinh đưa ra dự đoán hoặc câu trả lời nháp: Chỉ ra chỗ em đã làm đúng để khích lệ, phân tích nhẹ nhàng chỗ em nhầm (nếu có), và đặt câu hỏi để em tự sửa.
   - Nếu học sinh nói "Cho em đáp án luôn đi thầy": Nhẹ nhàng từ chối giải hộ, động viên em giải từng bước cùng thầy cô.

QUY TẮC TOÁN HỌC & LATEX:
- BẮT BUỘC bọc mọi ký hiệu, số liệu, công thức toán học trong cặp dấu $...$ (inline) hoặc $$...$$ (block).
- Phép nhân dùng \\cdot (TUYỆT ĐỐI KHÔNG dùng \\times để tránh lỗi ký tự escape), phân số dùng \\frac{a}{b}, lũy thừa luôn bọc ngoặc {}.
- Giọng văn: Tiếng Việt sư phạm chuẩn mực, ấm áp, truyền cảm hứng học Toán.`;

/**
 * Hàm làm sạch và sửa triệt để các lỗi escape công thức Toán học dạng JSON
 * (Khắc phục \times -> imes, \frac -> rac, \text -> ext, \boxed -> oxed...)
 */
export const sanitizeMathData = (val: string): string => {
  if (!val || typeof val !== 'string') return '';
  return val
    .replace(/\x0crac\{/g, '\\frac{')
    .replace(/(?:\\+f+|\f)+\\*(?:frac\{|rac\{)/g, '\\frac{')
    .replace(/\x08egin\{/g, '\\begin{')
    .replace(/\x08oxed\{/g, '\\boxed{')
    .replace(/\t(imes|ext|riangle|heta|au|o)\b/g, '\\$1')
    .replace(/\r(ight|ho)\b/g, '\\$1')
    .replace(/\n(eq)\b/g, '\\$1')
    .replace(/([0-9a-zA-Z\)\}])\s*imes\s*([0-9a-zA-Z\(\{])/g, '$1 \\cdot $2')
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1');
};
