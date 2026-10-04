/**
 * Server-Side AI Configuration & Security Module
 * 
 * NGUYÊN TẮC BẢO MẬT & BẢN QUYỀN:
 * 1. GEMINI_API_KEY CHỈ ĐƯỢC ĐỌC TẠI MÁY CHỦ QUA process.env.GEMINI_API_KEY.
 * 2. Tuyệt đối không expose API Key cho browser/client bundle.
 * 3. Hỗ trợ Failover Candidate Models (thử lần lượt các model Flash nếu một model tạm thời quá tải).
 * 4. Làm sạch triệt để các lỗi escape ký tự toán học (LaTeX).
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

/**
 * Khởi tạo Gemini Client an toàn phía máy chủ
 */
export const getSystemGeminiClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng thêm biến môi trường trong cấu hình hệ thống.');
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'toan-thcs-server',
      },
    },
  });
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
    .replace(/[\t\\]?times\b/g, '\\cdot')
    .replace(/[\t\\]?imes\b/g, '\\cdot')
    .replace(/([0-9a-zA-Z\)\}])\s*imes\s*([0-9a-zA-Z\(\{])/g, '$1 \\cdot $2')
    .replace(/[\x0c\\]?frac\{/g, '\\frac{')
    .replace(/(?:\\+f+|\f)+\\*(?:frac\{|rac\{)/g, '\\frac{')
    .replace(/[\t\\]?ext\{/g, '\\text{')
    .replace(/[\x08\\]?oxed\{/g, '\\boxed{')
    .replace(/[\x08\\]?egin\{/g, '\\begin{');
};
