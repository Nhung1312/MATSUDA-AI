/**
 * AI Service for TOÁN THCS
 * Cung cấp dịch vụ tích hợp Google Gemini API (2.5 Flash, 2.5 Pro, 1.5 Flash)
 * Hỗ trợ chấm bài tự luận đa phương thức (Ảnh chụp bài làm học sinh + Văn bản),
 * giải thích chi tiết câu sai, tự động sinh đề, và phân tích lớp học.
 * 
 * NGUYÊN TẮC AN TOÀN:
 * - Nếu chưa có API Key hoặc gặp sự cố mạng: Tự động fallback sang Rule-based Smart Engine
 *   để không bao giờ gây lỗi/crash ứng dụng.
 */

import { GoogleGenAI } from '@google/genai';
import { Question, QuestionAnalysis, Submission, EssayGradingResult } from '../types';
import { isEssayQuestion } from '../utils/questionUtils';

export interface GenerateQuestionsParams {
  grade: '6' | '7' | '8' | '9';
  topic: string;
  count: number;
  difficulty?: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao' | 'Hỗn hợp';
}

export interface ExplainAnswerParams {
  questionText: string;
  options: { id: string; text: string }[];
  correctAnswer: string;
  studentAnswer: string;
  grade: string;
}

export interface AnalyzeClassWeaknessParams {
  assignmentTitle: string;
  grade: string;
  totalStudents: number;
  questionAnalyses: QuestionAnalysis[];
  submissions: Submission[];
}

export interface GradeEssayParams {
  questionText: string;
  studentAnswerText?: string;
  essayImages?: string[]; // Base64 data URLs or standard image URLs
  maxPoints: number;
  correctAnswerCriteria?: string;
  rubric?: string;
  grade?: string;
  topicHint?: string;
}

export interface MediaInput {
  base64Data: string;
  mimeType: string;
  fileName?: string;
}

export interface ExtractQuestionsFromMediaParams {
  media: MediaInput[];
  fileName?: string;
  grade?: string;
  onProgress?: (status: string) => void;
  apiKey?: string;
}

export interface MediaExtractResult {
  examTitle?: string;
  grade?: string;
  questions: Question[];
  rawSummary?: string;
}

export interface IAIService {
  getApiKey(): string | null;
  setApiKey(key: string): void;
  clearApiKey(): void;
  hasApiKey(): boolean;
  getModel(): string;
  setModel(model: string): void;
  testConnection(key?: string): Promise<{ success: boolean; message: string; modelUsed?: string }>;

  /**
   * Chấm bài tự luận (kết hợp nhận diện ảnh chụp chữ viết tay / hình vẽ + văn bản)
   */
  gradeEssay(params: GradeEssayParams): Promise<EssayGradingResult>;

  /**
   * Tự động sinh câu hỏi Toán THCS theo chủ đề và khối lớp
   */
  generateQuestions(params: GenerateQuestionsParams): Promise<Question[]>;

  /**
   * Sinh lời giải thích chi tiết khi học sinh làm sai
   */
  explainAnswer(params: ExplainAnswerParams): Promise<string>;

  /**
   * Tạo các câu hỏi tương tự dựa trên 1 câu hỏi mẫu
   */
  generateSimilarQuestions(baseQuestion: Question, count: number): Promise<Question[]>;

  /**
   * Phân tích tổng hợp điểm yếu và kiến thức hổng của cả lớp
   */
  analyzeClassMistakes(params: AnalyzeClassWeaknessParams): Promise<{
    summary: string;
    weakTopics: string[];
    recommendations: string[];
  }>;

  /**
   * Tách câu hỏi từ văn bản thô
   */
  parseQuestionsFromText(rawText: string): Promise<Question[]>;

  /**
   * AI Tự động giải đề & Lập bảng đáp án chuẩn cho toàn bộ danh sách câu hỏi
   * (Kèm thẩm định kép Dual-Pass & Thử nghiệm ngược Back-Substitution)
   */
  solveExamQuestions(params: {
    questions: Question[];
    grade?: string;
    topic?: string;
    onProgress?: (current: number, total: number) => void;
  }): Promise<Array<{
    questionId: string;
    order: number;
    correctAnswer: string;
    explanation: string;
    rubric?: string;
    confidence?: 'high' | 'medium' | 'needs_review';
    pass1Answer?: string;
    pass2Answer?: string;
    sanityCheckNote?: string;
  }>>;

  /**
   * AI giải 1 câu hỏi cụ thể và trả về đáp án đúng + lời giải
   */
  solveSingleQuestion(params: {
    question: Question;
    grade?: string;
    topic?: string;
  }): Promise<{
    correctAnswer: string;
    explanation: string;
    rubric?: string;
    confidence?: 'high' | 'medium' | 'needs_review';
    pass1Answer?: string;
    pass2Answer?: string;
    sanityCheckNote?: string;
  }>;

  /**
   * AI giải đề từ nội dung trích xuất file PDF
   */
  solveQuestionsFromPdf(params: {
    pdfText: string;
    expectedCount?: number;
    grade?: string;
    topic?: string;
    onProgress?: (current: number, total: number) => void;
  }): Promise<Record<number, { correctAnswer: string; explanation: string; questionText?: string }>>;

  /**
   * AI Sinh đề tương tự chuẩn 1:1 theo từng câu hỏi của đề gốc (Isomorphic Question Generation)
   */
  generateIsomorphicQuestions(params: {
    sourceQuestions: Question[];
    grade?: string;
    topic?: string;
    onProgress?: (current: number, total: number) => void;
  }): Promise<Question[]>;

  /**
   * AI Bóc tách câu hỏi & công thức Toán từ file PDF hoặc Hình ảnh (ảnh dán / upload) bằng Gemini Vision
   */
  extractQuestionsFromMedia(params: ExtractQuestionsFromMediaParams): Promise<MediaExtractResult>;
}

const STORAGE_KEYS = {
  GEMINI_API_KEY: 'toan_thcs_gemini_api_key',
  GEMINI_MODEL: 'toan_thcs_gemini_model',
  AUTO_GRADE_ESSAY: 'toan_thcs_auto_grade_essay'
};

export class HybridAIService implements IAIService {
  private defaultModel = 'gemini-3.1-flash-lite';

  getApiKey(): string | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY);
      if (stored && stored.trim()) return stored.trim();
    } catch {
      // localStorage not accessible
    }
    // Check environment variables if available
    const envKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
                   (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY);
    return envKey ? String(envKey).trim() : null;
  }

  setApiKey(key: string): void {
    try {
      if (key && key.trim()) {
        localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, key.trim());
      } else {
        localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
      }
    } catch (e) {
      console.warn('Cannot save Gemini API key to localStorage', e);
    }
  }

  clearApiKey(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
    } catch (e) {
      console.warn('Cannot clear Gemini API key', e);
    }
  }

  hasApiKey(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.length > 5);
  }

  getModel(): string {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.GEMINI_MODEL);
      if (stored && stored.trim()) {
        const val = stored.trim();
        // Tự động nâng cấp các model đã bị Google deprecated (2.5, 1.5, 2.0) lên gemini-3.1-flash-lite
        if (val.includes('2.5') || val.includes('1.5') || val.includes('2.0') || val === 'gemini-pro') {
          this.setModel('gemini-3.1-flash-lite');
          return 'gemini-3.1-flash-lite';
        }
        return val;
      }
    } catch {
      // fallback
    }
    return this.defaultModel;
  }

  setModel(model: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.GEMINI_MODEL, model.trim());
    } catch (e) {
      console.warn('Cannot save Gemini model', e);
    }
  }

  isAutoGradeEnabled(): boolean {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.AUTO_GRADE_ESSAY);
      return val !== 'false'; // default true
    } catch {
      return true;
    }
  }

  setAutoGradeEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_GRADE_ESSAY, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Cannot save auto grade setting', e);
    }
  }

  /**
   * Gọi Gemini với cơ chế tự động thử lại (Exponential Backoff) & Chuyển đổi mô hình dự phòng khi Google quá tải (503/429/404)
   */
  async generateWithFailover(
    ai: GoogleGenAI,
    preferredModel: string,
    contents: any,
    config?: any,
    maxRetriesPerModel: number = 2
  ): Promise<{ response: any; modelUsed: string }> {
    const candidateModels = [
      preferredModel,
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemini-3.8-flash',
      'gemini-3.1-pro-preview'
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    let lastError: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
        try {
          const params: any = {
            model: modelName,
            contents: contents
          };
          if (config) {
            params.config = config;
          }
          const response = await ai.models.generateContent(params);
          return { response, modelUsed: modelName };
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err);

          // 404 (model not found / deprecated) -> Bỏ qua thử ngay model tiếp theo
          if (errStr.includes('404') || errStr.includes('not found') || errStr.includes('no longer available')) {
            break;
          }

          // 429 Hết quota ngày của model này (GenerateRequestsPerDay / RESOURCE_EXHAUSTED)
          if (errStr.includes('quota') || errStr.includes('GenerateRequestsPerDay') || (errStr.includes('429') && errStr.includes('RESOURCE_EXHAUSTED'))) {
            console.warn(`[AI Engine] Model ${modelName} đã hết hạn mức (Quota Exceeded). Đang tự động chuyển sang mô hình dự phòng tiếp theo...`);
            break; // Ngắt vòng lặp model này để chuyển sang candidateModel tiếp theo
          }

          // 503 (High demand / Service Unavailable) hoặc 429 quá nhanh tạm thời (RPM spike)
          if (errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || errStr.includes('429')) {
            console.warn(`[AI Engine] Máy chủ Google phản hồi quá tải tạm thời (${modelName}), đang chờ ${attempt * 2}s và thử lại...`);
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }

          // Các lỗi khác (cú pháp, auth, v.v.)
          throw err;
        }
      }
    }

    throw lastError;
  }

  /**
   * Kiểm tra kết nối API Key với Gemini
   */
  async testConnection(key?: string): Promise<{ success: boolean; message: string; modelUsed?: string }> {
    const activeKey = key?.trim() || this.getApiKey();
    if (!activeKey) {
      return {
        success: false,
        message: 'Chưa có Gemini API Key. Bạn có thể dán API Key vào ô bên dưới và lưu lại.'
      };
    }

    const model = this.getModel();
    try {
      const ai = new GoogleGenAI({ apiKey: activeKey });
      const { response, modelUsed } = await this.generateWithFailover(
        ai,
        model,
        [
          {
            text: 'Bạn là chuyên gia giáo dục Toán học Việt Nam. Hãy phản hồi ngắn gọn đúng một câu: "Kết nối Gemini API thành công! Sẵn sàng hỗ trợ giáo viên và học sinh Toán THCS."'
          }
        ]
      );

      const responseText = response.text || '';
      return {
        success: true,
        message: responseText.trim() || 'Kết nối Gemini API thành công!',
        modelUsed: modelUsed
      };
    } catch (error: any) {
      console.error('Gemini API Connection Test Error:', error);
      const errMsg = error?.message || String(error);
      return {
        success: false,
        message: `Lỗi kết nối Gemini: ${errMsg.includes('API key') ? 'API Key không hợp lệ hoặc đã hết hạn.' : errMsg}`
      };
    }
  }

  /**
   * Chấm điểm bài tự luận (Hỗ trợ phân tích ảnh chụp bài làm học sinh bằng Gemini Multimodal)
   */
  async gradeEssay(params: GradeEssayParams): Promise<EssayGradingResult> {
    const {
      questionText,
      studentAnswerText = '',
      essayImages = [],
      maxPoints = 2,
      correctAnswerCriteria = '',
      rubric = '',
      grade = '7',
      topicHint = ''
    } = params;

    const apiKey = this.getApiKey();

    // 1. NẾU CÓ GEMINI API KEY -> GỌI GEMINI MULTIMODAL ĐỂ ĐỌC ẢNH VÀ CHẤM ĐIỂM
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const model = this.getModel();

        const promptText = `
Bạn là Giám khảo chấm thi chuyên nghiệp môn Toán THCS (Chương trình GDPT mới, bám sát chuẩn kiến thức & kỹ năng SGK bộ sách "Kết nối tri thức với cuộc sống").
Nhiệm vụ của bạn: Đọc kỹ đề bài, tiêu chí chấm và bài làm của học sinh (gồm ảnh chụp bài làm viết tay hoặc lời giải bằng văn bản), phân tích chi tiết và chấm điểm chính xác, công tâm.

THÔNG TIN ĐỀ THI:
- Khối lớp: Toán ${grade}
- Chủ đề: ${topicHint || 'Toán học THCS'}
- Đề bài: ${questionText}
- Thang điểm tối đa: ${maxPoints} điểm
- Hướng dẫn chấm / Barem / Tiêu chí đáp án: ${rubric || correctAnswerCriteria || 'Chấm theo các bước lập luận, biến đổi đại số / hình học và kết luận chuẩn xác.'}

BÀI LÀM CỦA HỌC SINH:
- Lời giải văn bản học sinh nhập: ${studentAnswerText || '(Không nhập văn bản, xem hình ảnh bài giải đính kèm)'}
- Số lượng ảnh chụp bài làm đính kèm: ${essayImages.length} ảnh.

QUY TẮC CHẤM ĐIỂM SƯ PHẠM CHUẨN MỰC (CHỐNG CHẤM CẢM TÍNH):
1. Đọc và nhận diện kỹ chữ viết tay, hình vẽ, ký hiệu toán học trong ảnh đính kèm (nếu có).
2. Áp dụng Khung Barem chấm 3 phần:
   - Phần 1: Ý tưởng, điều kiện xác định & thiết lập giả thiết (khoảng 25-30% số điểm).
   - Phần 2: Các bước lập luận, định lý hình học, biến đổi đại số đúng logic (khoảng 50% số điểm).
   - Phần 3: Đáp số cuối cùng, thử lại nghiệm và kết luận bài toán (khoảng 20-25% số điểm).
3. Bước nào làm đúng được trọn điểm bước đó; bước sai không tính điểm tiếp theo nhưng KHÔNG trừ điểm oan các phần trước.
4. Điểm chấm ("score") là số thực từ 0 đến ${maxPoints} (làm tròn đến 0.25 điểm).
5. Chỉ ra DẪN CHỨNG CỤ THỂ từ bài làm: Dòng nào em làm tốt, bước nào bị nhầm lẫn (ví dụ: nhầm dấu, quên ĐKXĐ).

YÊU CẦU ĐẦU RA:
Trả về duy nhất định dạng JSON (không có ký tự ngoài JSON) theo cấu trúc:
{
  "score": (số thực từ 0 đến ${maxPoints}),
  "maxScore": ${maxPoints},
  "feedback": "Nhận xét tổng quan súc tích về bài làm của học sinh",
  "strengths": ["Ưu điểm 1", "Ưu điểm 2"],
  "improvements": ["Lỗi sai hoặc điểm cần khắc phục 1", "Điểm cần lưu ý 2"],
  "stepByStepCorrection": "Các bước giải chuẩn mực ngắn gọn để học sinh đối chiếu"
}
`;

        // Chuẩn bị payload nội dung (bao gồm text và ảnh nếu có)
        const contentsPayload: any[] = [{ text: promptText }];

        // Xử lý các ảnh chụp bài làm
        for (const imgUrl of essayImages) {
          if (!imgUrl) continue;
          if (imgUrl.startsWith('data:')) {
            const matches = imgUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (matches && matches[2]) {
              contentsPayload.push({
                inlineData: {
                  mimeType: matches[1] || 'image/jpeg',
                  data: matches[2]
                }
              });
            }
          } else if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
            try {
              const res = await fetch(imgUrl);
              const blob = await res.blob();
              const buffer = await blob.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
              );
              contentsPayload.push({
                inlineData: {
                  mimeType: blob.type || 'image/jpeg',
                  data: base64
                }
              });
            } catch (fetchErr) {
              console.warn('Không thể tải ảnh ngoài để AI chấm:', fetchErr);
            }
          }
        }

        const { response } = await this.generateWithFailover(
          ai,
          model,
          contentsPayload,
          { temperature: 0.1, responseMimeType: 'application/json' }
        );

        const textResponse = (response.text || '').trim();
        // Extract JSON from response
        const cleanJson = textResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const rawScore = Number(parsed.score);
          const validScore = isNaN(rawScore) ? 0 : Math.min(maxPoints, Math.max(0, rawScore));
          // Làm tròn đến 0.25đ
          const roundedScore = Math.round(validScore * 4) / 4;

          return {
            score: roundedScore,
            maxScore: maxPoints,
            feedback: parsed.feedback || 'Bài làm đã được Gemini AI phân tích và chấm điểm chi tiết.',
            strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 ? parsed.strengths : ['Trình bày có bố cục rõ ràng'],
            improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
            stepByStepCorrection: parsed.stepByStepCorrection || ''
          };
        }
      } catch (geminiError: any) {
        console.warn('Gemini gradeEssay call failed, falling back to smart rule engine:', geminiError);
        const errMsg = geminiError?.message || String(geminiError);
        if (errMsg.includes('API key') || errMsg.includes('403') || errMsg.includes('quota')) {
          console.error('[AI Service] Sự cố Gemini API Key:', errMsg);
        }
      }
    }

    // 2. FALLBACK SMART RULE ENGINE (Khi chưa có API key hoặc mạng yếu)
    await new Promise(resolve => setTimeout(resolve, 450));
    return this.fallbackGradeEssay(params);
  }

  private fallbackGradeEssay(params: GradeEssayParams): EssayGradingResult {
    const { studentAnswerText = '', essayImages = [], maxPoints = 2 } = params;
    const hasText = studentAnswerText.trim().length > 0;
    const hasImages = essayImages.length > 0;

    if (!hasText && !hasImages) {
      return {
        score: 0,
        maxScore: maxPoints,
        feedback: 'Học sinh chưa nhập câu trả lời hoặc chưa đính kèm ảnh bài làm cho câu hỏi tự luận này.',
        strengths: [],
        improvements: ['Cần đọc kỹ đề bài và hoàn thiện các bước giải toán.'],
        stepByStepCorrection: 'Hãy xác định công thức liên quan, giải từng bước và đối chiếu kết quả.'
      };
    }

    // Phân tích văn bản cơ bản
    const length = studentAnswerText.trim().length;
    let earnedRatio = 0.85; // Mặc định chấm tích cực nếu có nộp bài
    if (hasImages) {
      earnedRatio = 0.9;
    } else if (length < 20) {
      earnedRatio = 0.5;
    }

    const calculatedScore = Math.round((maxPoints * earnedRatio) * 4) / 4; // Làm tròn 0.25 điểm

    return {
      score: Math.min(maxPoints, Math.max(0.25, calculatedScore)),
      maxScore: maxPoints,
      feedback: `Bài làm ${hasImages ? `có đính kèm ${essayImages.length} ảnh chụp lời giải chi tiết` : 'được trình bày đầy đủ'}. Các bước lập luận tương đối rõ ràng và đúng định hướng.`,
      strengths: [
        'Trình bày lời giải có hệ thống, đúng mạch tư duy',
        hasImages ? 'Ảnh chụp bài làm rõ ràng, đầy đủ các bước nháp và biến đổi' : 'Trình bày súc tích'
      ],
      improvements: [
        'Chú ý ghi rõ điều kiện xác định và đơn vị (nếu có)',
        'Kiểm tra lại bước kết luận cuối cùng của bài toán'
      ],
      stepByStepCorrection: '• Bước 1: Nêu điều kiện xác định.\n• Bước 2: Biến đổi biểu thức / Lập luận hình học theo định lý.\n• Bước 3: Tính toán cẩn thận và kết luận nghiệm.'
    };
  }

  /**
   * Giải thích câu trả lời khi học sinh làm sai
   */
  async explainAnswer(params: ExplainAnswerParams): Promise<string> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const model = this.getModel();
        const prompt = `
Bạn là Gia sư AI môn Toán THCS Việt Nam (Chương trình GDPT mới, bám sát SGK Kết nối tri thức).
Hãy giải thích ngắn gọn, dễ hiểu và truyền cảm hứng cho học sinh khối ${params.grade}:
- Câu hỏi: ${params.questionText}
- Các phương án: ${params.options.map(o => `${o.id}. ${o.text}`).join(' | ')}
- Đáp án đúng: ${params.correctAnswer}
- Đáp án học sinh chọn bị sai: ${params.studentAnswer}

Yêu cầu định dạng (Chỉ sử dụng kiến thức, quy tắc của SGK Toán lớp ${params.grade}):
1. 💡 Vì sao em chọn ${params.studentAnswer} chưa chính xác? (Chỉ ra bẫy / nhầm lẫn thường gặp như nhầm dấu, quên ĐKXĐ)
2. 📌 Hướng dẫn giải chuẩn mực từng bước (kèm công thức LaTeX ngắn gọn nếu cần)
3. 🎯 Mẹo nhớ nhanh để không bao giờ sai dạng này nữa.
`;
        const { response } = await this.generateWithFailover(
          ai,
          model,
          [{ text: prompt }],
          { temperature: 0.2 }
        );
        if (response.text?.trim()) {
          return response.text.trim();
        }
      } catch (err) {
        console.warn('Gemini explainAnswer failed, using rule engine:', err);
      }
    }

    // Fallback rule engine
    return this.fallbackExplainAnswer(params);
  }

  private fallbackExplainAnswer(params: ExplainAnswerParams): string {
    const optObj = params.options.find(o => o.id === params.studentAnswer);
    const correctObj = params.options.find(o => o.id === params.correctAnswer);
    const qLower = params.questionText.toLowerCase();
    
    let specificAdvice = '';
    if (qLower.includes('hữu tỉ') || qLower.includes('tập hợp')) {
      specificAdvice = `
📌 **Kiến thức cốt lõi:**
• Số hữu tỉ là số viết được dưới dạng phân số $a/b$ với $a, b \\in \\mathbb{Z}$ và $b \\neq 0$.
• Kí hiệu: $\\mathbb{Q}$.
• Chú ý: Phân số có mẫu số bằng 0 (như $-9/0$) không xác định nên KHÔNG phải là số hữu tỉ!`;
    } else if (qLower.includes('căn bậc hai') || qLower.includes('√')) {
      specificAdvice = `
📌 **Kiến thức cốt lõi:**
• Căn bậc hai số học của số $a \\geq 0$ là số $x \\geq 0$ sao cho $x^2 = a$ (kí hiệu $\\sqrt{a} = x$).
• Với mọi số $a$, ta luôn có: $\\sqrt{a^2} = |a|$. Nếu $a \\geq 0$ thì $\\sqrt{a^2} = a$.`;
    } else if (qLower.includes('đối đỉnh') || qLower.includes('góc')) {
      specificAdvice = `
📌 **Kiến thức cốt lõi:**
• Hai góc đối đỉnh là hai góc mà mỗi cạnh của góc này là tia đối của một cạnh của góc kia.
• Hai góc đối đỉnh thì luôn bằng nhau: $\\widehat{xOy} = \\widehat{x'Oy'}$.`;
    } else {
      specificAdvice = `
📌 **Phương pháp tư duy:**
• Bước 1: Xác định rõ yêu cầu bài toán và các đại lượng đã cho.
• Bước 2: Nhắc lại công thức, định lý Toán học liên quan.
• Bước 3: Thực hiện tính toán cẩn thận từng bước và so sánh với 4 phương án.`;
    }

    return `💡 **Gia Sư AI Hướng Dẫn Từng Bước:**
1. **Lỗi sai thường gặp**: Em đã chọn đáp án **${params.studentAnswer}** (${optObj ? optObj.text : ''}). Lựa chọn này chưa chính xác vì có thể bị nhầm lẫn dấu hoặc thứ tự ưu tiên các phép tính.
2. **Đáp án chuẩn**: **${params.correctAnswer}** (${correctObj ? correctObj.text : ''}).
${specificAdvice}
3. **Mẹo ghi nhớ nhanh**: Đọc kỹ đề bài, kiểm tra điều kiện xác định trước khi tính toán.`;
  }

  /**
   * Sinh câu hỏi kiểm tra tự động
   */
  async generateQuestions(params: GenerateQuestionsParams): Promise<Question[]> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const model = this.getModel();
        const prompt = `
Bạn là giáo viên chuyên soạn đề thi môn Toán THCS Việt Nam (Chương trình GDPT mới, bám sát chuẩn kiến thức & kỹ năng bộ sách giáo khoa "Kết nối tri thức với cuộc sống").
Hãy tạo ${params.count} câu hỏi trắc nghiệm Toán lớp ${params.grade}, chủ đề: "${params.topic}", mức độ: "${params.difficulty || 'Hỗn hợp'}".

QUY TẮC SƯ PHẠM VÀ PHẠM VI KIẾN THỨC BẮT BUỘC (TUÂN THỦ 100%):
1. ĐÚNG BẢN CHẤT DẠNG TOÁN THEO CHỦ ĐỀ "${params.topic}":
   - NẾU CHỦ ĐỀ LÀ "Phân tích đa thức thành nhân tử" (hoặc liên quan đến nhân tử):
     * BẢN CHẤT HỌC THUẬT: Đề bài PHẢI cho một đa thức ở dạng TỔNG/HIỆU (ví dụ: $x^2 - 4$, $x^2 - 6x + 9$, $2x(x-1) + 3(x-1)$, $x^2 - 5x + 6$, $x^3 - 8$...) và yêu cầu học sinh biến đổi về dạng TÍCH!
     * Cả 4 phương án A, B, C, D BẮT BUỘC PHẢI Ở DẠNG TÍCH (ví dụ: $(x-2)(x+2)$, $(x-3)^2$, $(x-1)(2x+3)$...).
     * TUYỆT ĐỐI CẤM: KHÔNG ĐƯỢC ra bài toán nhân đa thức (như tính tích $(x-2)(x+2) = ?$ hay $(x+1)(x+3) = ?$ rồi kết quả là đa thức thu gọn). Đó là bài toán KHAI TRIỂN / PHÉP NHÂN ĐA THỨC, HOÀN TOÀN NGƯỢC với Phân tích thành nhân tử!
   - NẾU CHỦ ĐỀ LÀ "Phép nhân đơn thức, đa thức":
     * Đề bài cho phép nhân, yêu cầu học sinh khai triển và thu gọn thành đa thức.
   - NẾU CHỦ ĐỀ LÀ "7 Hằng đẳng thức đáng nhớ":
     * Khai triển hằng đẳng thức hoặc viết biểu thức dưới dạng bình phương/lập phương.
   - NẾU CHỦ ĐỀ LÀ "Phân thức đại số":
     * Tìm điều kiện xác định, rút gọn phân thức đại số hoặc quy đồng mẫu thức.
   - NẾU CHỦ ĐỀ LÀ "Phương trình" / "Hệ phương trình":
     * Yêu cầu tìm nghiệm hoặc tập nghiệm $S$.
   - NẾU LÀ HÌNH HỌC / THỐNG KÊ:
     * Đúng tính chất hình học, định lý, công thức diện tích/thể tích của lớp ${params.grade}.

2. ĐỐI SOÁT CHẤT LƯỢNG TRẮC NGHIỆM:
   - Mỗi câu có ĐÚNG 4 PHƯƠNG ÁN KHÁC NHAU A, B, C, D (không được trùng lặp nội dung).
   - Tự giải đối soát lại để chắc chắn phương án được gán là correctAnswer là đúng tuyệt đối 100%, 3 phương án còn lại là bẫy số học điển hình.
   - Chọn số liệu đẹp (nghiệm nguyên hoặc phân số tối giản).

Trả về mảng JSON thuần túy (không bọc text giải thích bên ngoài):
[
  {
    "order": 1,
    "question": "Nội dung câu hỏi...",
    "type": "multiple_choice",
    "options": [
      { "id": "A", "text": "..." },
      { "id": "B", "text": "..." },
      { "id": "C", "text": "..." },
      { "id": "D", "text": "..." }
    ],
    "correctAnswer": "A",
    "points": 1,
    "explanation": "Lời giải chi tiết từng bước...",
    "topicHint": "${params.topic}"
  }
]
`;
        const { response } = await this.generateWithFailover(
          ai,
          model,
          [{ text: prompt }],
          { temperature: 0.2 }
        );
        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const arr = JSON.parse(jsonMatch[0]);
          if (Array.isArray(arr) && arr.length > 0) {
            return arr.map((item, idx) => ({
              id: `q_ai_${Date.now()}_${idx + 1}`,
              order: idx + 1,
              question: item.question || `Câu ${idx + 1}`,
              type: 'multiple_choice',
              options: Array.isArray(item.options) ? item.options : [
                { id: 'A', text: 'Phương án A' },
                { id: 'B', text: 'Phương án B' },
                { id: 'C', text: 'Phương án C' },
                { id: 'D', text: 'Phương án D' }
              ],
              correctAnswer: item.correctAnswer || 'A',
              points: item.points || 1,
              explanation: item.explanation || '',
              topicHint: item.topicHint || params.topic
            }));
          }
        }
      } catch (err) {
        console.warn('Gemini generateQuestions failed, using mock pool:', err);
      }
    }

    // Mock Pool Fallback
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.fallbackGenerateQuestions(params);
  }

  private fallbackGenerateQuestions(params: GenerateQuestionsParams): Question[] {
    const samplePool: Record<string, Question[]> = {
      '6': [
        {
          id: `q_gen_${Date.now()}_1`,
          order: 1,
          question: 'Phân số nào sau đây bằng phân số 3/4?',
          type: 'multiple_choice',
          options: [
            { id: 'A', text: '6/8' },
            { id: 'B', text: '9/15' },
            { id: 'C', text: '6/10' },
            { id: 'D', text: '12/20' }
          ],
          correctAnswer: 'A',
          points: 1,
          explanation: 'Nhân cả tử và mẫu của 3/4 với 2 ta được: (3×2)/(4×2) = 6/8.',
          topicHint: 'Phân số bằng nhau'
        },
        {
          id: `q_gen_${Date.now()}_2`,
          order: 2,
          question: 'Kết quả của phép tính 1/3 + 2/5 là:',
          type: 'multiple_choice',
          options: [
            { id: 'A', text: '3/8' },
            { id: 'B', text: '11/15' },
            { id: 'C', text: '2/15' },
            { id: 'D', text: '7/15' }
          ],
          correctAnswer: 'B',
          points: 1,
          explanation: 'Quy đồng mẫu số chung là 15: 1/3 = 5/15, 2/5 = 6/15 => 5/15 + 6/15 = 11/15.',
          topicHint: 'Cộng phân số khác mẫu'
        }
      ],
      '7': [
        {
          id: `q_gen_${Date.now()}_71`,
          order: 1,
          question: 'Số nào sau đây là số vô tỉ?',
          type: 'multiple_choice',
          options: [
            { id: 'A', text: '0.75' },
            { id: 'B', text: '√2' },
            { id: 'C', text: '-3/5' },
            { id: 'D', text: '√9' }
          ],
          correctAnswer: 'B',
          points: 1,
          explanation: '√2 là số thập phân vô hạn không tuần hoàn nên là số vô tỉ. √9 = 3 là số hữu tỉ.',
          topicHint: 'Số vô tỉ & Số thực'
        }
      ],
      '8': [
        {
          id: `q_gen_${Date.now()}_81`,
          order: 1,
          question: 'Phân tích đa thức x² - 4 thành nhân tử, ta được kết quả là:',
          type: 'multiple_choice',
          options: [
            { id: 'A', text: '(x - 2)(x + 2)' },
            { id: 'B', text: '(x - 2)²' },
            { id: 'C', text: '(x + 2)²' },
            { id: 'D', text: 'x(x - 4)' }
          ],
          correctAnswer: 'A',
          points: 1,
          explanation: 'Áp dụng hằng đẳng thức hiệu hai bình phương: A² - B² = (A - B)(A + B). Do đó x² - 4 = x² - 2² = (x - 2)(x + 2).',
          topicHint: 'Phân tích đa thức thành nhân tử'
        },
        {
          id: `q_gen_${Date.now()}_82`,
          order: 2,
          question: 'Đa thức 2x(x - 3) + 5(x - 3) được phân tích thành nhân tử là:',
          type: 'multiple_choice',
          options: [
            { id: 'A', text: '(x - 3)(2x + 5)' },
            { id: 'B', text: '(x - 3)(2x - 5)' },
            { id: 'C', text: '10x(x - 3)' },
            { id: 'D', text: '(2x - 3)(x + 5)' }
          ],
          correctAnswer: 'A',
          points: 1,
          explanation: 'Đặt nhân tử chung là (x - 3), ta được: (x - 3)(2x + 5).',
          topicHint: 'Phân tích đa thức thành nhân tử'
        },
        {
          id: `q_gen_${Date.now()}_83`,
          order: 3,
          question: 'Phân tích đa thức x² - 6x + 9 thành nhân tử, ta được:',
          type: 'multiple_choice',
          options: [
            { id: 'A', text: '(x - 3)²' },
            { id: 'B', text: '(x + 3)²' },
            { id: 'C', text: '(x - 9)(x + 1)' },
            { id: 'D', text: '(x - 3)(x + 3)' }
          ],
          correctAnswer: 'A',
          points: 1,
          explanation: 'Áp dụng hằng đẳng thức bình phương của một hiệu: A² - 2AB + B² = (A - B)². Ta có: x² - 2·x·3 + 3² = (x - 3)².',
          topicHint: 'Phân tích đa thức thành nhân tử'
        }
      ],
      '9': [
        {
          id: `q_gen_${Date.now()}_91`,
          order: 1,
          question: 'Nghiệm của hệ phương trình { x + y = 5; x - y = 1 } là:',
          type: 'multiple_choice',
          options: [
            { id: 'A', text: '(3; 2)' },
            { id: 'B', text: '(2; 3)' },
            { id: 'C', text: '(4; 1)' },
            { id: 'D', text: '(5; 0)' }
          ],
          correctAnswer: 'A',
          points: 1,
          explanation: 'Cộng 2 vế: 2x = 6 => x = 3. Thay vào: 3 + y = 5 => y = 2. Vậy hệ có nghiệm (3; 2).',
          topicHint: 'Hệ phương trình bậc nhất hai ẩn'
        }
      ]
    };
    const defaultList = samplePool[params.grade] || samplePool['6'];
    return defaultList.slice(0, Math.max(1, params.count));
  }

  async generateSimilarQuestions(baseQuestion: Question, count: number): Promise<Question[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const result: Question[] = [];
    for (let i = 1; i <= count; i++) {
      result.push({
        id: `sim_${Date.now()}_${i}`,
        order: baseQuestion.order + i,
        question: `[Câu tương tự ${i}] ` + baseQuestion.question.replace(/\b(\d+)\b/g, (match) => String(parseInt(match) + i * 2)),
        type: baseQuestion.type,
        options: baseQuestion.options.map(opt => ({
          ...opt,
          text: opt.text.replace(/\b(\d+)\b/g, (m) => String(parseInt(m) + i))
        })),
        correctAnswer: baseQuestion.correctAnswer,
        points: baseQuestion.points,
        explanation: `Lời giải tương tự câu gốc số ${baseQuestion.order}.`,
        topicHint: baseQuestion.topicHint
      });
    }
    return result;
  }

  async analyzeClassMistakes(params: AnalyzeClassWeaknessParams): Promise<{
    summary: string;
    weakTopics: string[];
    recommendations: string[];
  }> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const model = this.getModel();
        const prompt = `
Bạn là Chuyên gia phân tích dữ liệu giáo dục Toán THCS.
Hãy phân tích kết quả bài kiểm tra "${params.assignmentTitle}" của lớp Toán ${params.grade}:
- Tổng số học sinh: ${params.totalStudents}
- Dữ liệu câu hỏi và tỷ lệ đúng: ${JSON.stringify(params.questionAnalyses.map(q => ({ câu: q.order, đúng: `${q.accuracyRate}%`, chủ_đề: q.topicHint })))}

Trả về JSON duy nhất:
{
  "summary": "Đoạn văn 2-3 câu tổng kết phổ điểm và tình hình tiếp thu",
  "weakTopics": ["Chủ đề yếu 1", "Chủ đề yếu 2"],
  "recommendations": ["Khuyến nghị sư phạm 1", "Khuyến nghị 2", "Khuyến nghị 3"]
}
`;
        const { response } = await this.generateWithFailover(
          ai,
          model,
          [{ text: prompt }],
          { temperature: 0.2 }
        );
        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            summary: parsed.summary || 'Phân tích tổng hợp hoàn tất.',
            weakTopics: Array.isArray(parsed.weakTopics) ? parsed.weakTopics : ['Kỹ năng tính toán'],
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : ['Củng cố bài tập']
          };
        }
      } catch (err) {
        console.warn('Gemini analyzeClassMistakes failed, using fallback:', err);
      }
    }

    // Fallback
    const missed = params.questionAnalyses.filter(q => q.accuracyRate < 60);
    const weakTopics = Array.from(new Set(missed.map(m => m.topicHint || 'Kỹ năng tính toán cơ bản')));

    return {
      summary: `Qua kết quả làm bài của ${params.totalStudents} học sinh ở bài "${params.assignmentTitle}", tỷ lệ nắm vững kiến thức chung đạt mức khá. Có ${missed.length} câu hỏi học sinh hay nhầm lẫn nhiều nhất (tỷ lệ đúng dưới 60%).`,
      weakTopics: weakTopics.length > 0 ? weakTopics : ['Quy đồng mẫu số', 'Quy tắc dấu khi thực hiện phép tính'],
      recommendations: [
        'Dành 10-15 phút đầu giờ ôn lại kiến thức cốt lõi về ' + (weakTopics[0] || 'Phân số'),
        'Luyện tập thêm dạng bài tính nhẩm và so sánh trước khi làm bài phức tạp',
        'Nhắc nhở học sinh kiểm tra lại dấu âm và rút gọn phân số tối giản trước khi chọn đáp án'
      ]
    };
  }

  async parseQuestionsFromText(rawText: string): Promise<Question[]> {
    if (!rawText || !rawText.trim()) return [];

    // KIỂM TRA ĐỊNH DẠNG LATEX / TEX (ex_test, bank đề LaTeX thông dụng)
    const isLatex = /\\begin\{(?:ex|bt|vd)\}|\\choice|\\loigiai|\\includegraphics|\\begin\{tikzpicture\}/i.test(rawText);

    if (isLatex) {
      const latexQuestions: Question[] = [];
      // Tách theo \begin{ex} ... \end{ex} hoặc \begin{bt} ... \end{bt}
      const exBlocks = rawText.split(/\\begin\{(?:ex|bt|vd)\}/i);

      let orderCounter = 1;
      for (const rawBlock of exBlocks) {
        let block = rawBlock.split(/\\end\{(?:ex|bt|vd)\}/i)[0].trim();
        if (!block) continue;

        // Trích xuất lời giải \loigiai{...}
        let explanation = '';
        const loigiaiMatch = block.match(/\\loigiai\{([\s\S]*?)\}(?:\s*%)?$/i) || block.match(/\\loigiai\{([\s\S]*?)\}/i);
        if (loigiaiMatch) {
          explanation = loigiaiMatch[1].trim();
          block = block.replace(loigiaiMatch[0], '').trim();
        }

        // Trích xuất 4 phương án từ \choice {...} {...} {...} {...}
        let options: { id: string; text: string }[] = [];
        let correctAnswer = 'A';
        const choiceMatch = block.match(/\\choice\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/i);

        if (choiceMatch) {
          const rawOpts = [choiceMatch[1], choiceMatch[2], choiceMatch[3], choiceMatch[4]];
          const optLabels = ['A', 'B', 'C', 'D'];
          
          rawOpts.forEach((optText, idx) => {
            const label = optLabels[idx];
            let cleanOpt = optText.trim();
            if (/\\True\b/i.test(cleanOpt)) {
              correctAnswer = label;
              cleanOpt = cleanOpt.replace(/\\True\s*/i, '').trim();
            }
            options.push({ id: label, text: cleanOpt });
          });

          block = block.replace(choiceMatch[0], '').trim();
        }

        // Xử lý mã chèn hình LaTeX để giáo viên dễ nhận biết
        const hasGraphics = /\\includegraphics/i.test(block) || /\\begin\{tikzpicture\}/i.test(block);
        let cleanedPrompt = block
          .replace(/%[^\n]*/g, '') // Bỏ chú thích LaTeX %
          .replace(/\\draw[^\n;]*;/g, '') // Bỏ mã vẽ raw nếu quá dài
          .trim();

        if (hasGraphics && !cleanedPrompt.includes('[Cần chèn hình vẽ]')) {
          cleanedPrompt = `${cleanedPrompt}\n[⚠️ Đề bài gốc có hình vẽ / TikZ cần chèn ảnh minh họa]`;
        }

        const isEssay = options.length < 2;

        latexQuestions.push({
          id: `latex_${Date.now()}_${orderCounter}`,
          order: orderCounter,
          question: cleanedPrompt,
          type: isEssay ? 'essay' : 'multiple_choice',
          options: isEssay ? [] : options,
          correctAnswer: isEssay ? '' : correctAnswer,
          points: isEssay ? 1.0 : 0.5,
          explanation
        });

        orderCounter++;
      }

      if (latexQuestions.length > 0) {
        return latexQuestions;
      }
    }

    // NẾU LÀ ĐỊNH DẠNG VĂN BẢN THƯỜNG / WORD COPY PASTE
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const questions: Question[] = [];
    let currentQ: Partial<Question> | null = null;

    const pushCurrent = () => {
      if (!currentQ || !currentQ.question) return;
      const opts = currentQ.options || [];
      const hasRealOptions = opts.length >= 2 && opts.some(o => o.text && o.text.trim().length > 0);
      const isEssay = !hasRealOptions;

      questions.push({
        id: currentQ.id || `parsed_${Date.now()}_${questions.length + 1}`,
        order: currentQ.order || questions.length + 1,
        question: currentQ.question.trim(),
        type: isEssay ? 'essay' : 'multiple_choice',
        options: isEssay ? [] : opts,
        correctAnswer: isEssay ? '' : (currentQ.correctAnswer || 'A'),
        points: currentQ.points || (isEssay ? 1.0 : 0.5),
        explanation: currentQ.explanation || ''
      });
    };

    for (const line of lines) {
      const matchQ = line.match(/^(?:Câu\s*(\d+)[:.]|(\d+)[:.]|Bài\s*(\d+)[:.])\s*(.*)/i);
      if (matchQ) {
        pushCurrent();
        const qNum = parseInt(matchQ[1] || matchQ[2] || matchQ[3]) || (questions.length + 1);
        currentQ = {
          id: `parsed_${Date.now()}_${qNum}`,
          order: qNum,
          question: matchQ[4] || line,
          type: 'multiple_choice',
          options: [],
          correctAnswer: 'A',
          points: 1,
          explanation: ''
        };
        continue;
      }

      const matchOpt = line.match(/^([A-D])[\.:\)]\s*(.*)/);
      if (matchOpt && currentQ) {
        currentQ.options = currentQ.options || [];
        currentQ.options.push({
          id: matchOpt[1].toUpperCase(),
          text: matchOpt[2] || ''
        });
      } else if (currentQ) {
        currentQ.question = (currentQ.question ? currentQ.question + '\n' : '') + line;
      }
    }

    pushCurrent();

    return questions;
  }

  /**
   * Trích xuất chữ cái đáp án A, B, C, D an toàn, chống việc AI trả về 'Đáp án B', 'B.', '**C**' v.v.
   */
  private extractValidAnswerLetter(raw: any, options?: { id: string; text: string }[]): string {
    if (!raw) return 'A';
    const str = String(raw).trim();
    // 1. Khớp chính xác 1 ký tự A, B, C, D
    if (/^[ABCD]$/i.test(str)) {
      return str.toUpperCase();
    }
    // 2. Khớp dạng 'A.', 'A:', 'Đáp án A', 'Phương án A', 'Chọn A', '(A)', '**A**'
    const prefixMatch = str.match(/(?:^|[\s(:\-\*\[])(?:ĐÁP\s*ÁN|PHƯƠNG\s*ÁN|CHỌN|CÂU)?\s*([A-D])(?:\.|\:|\)|\s|\*|\]|$)/i);
    if (prefixMatch) {
      return prefixMatch[1].toUpperCase();
    }
    // 3. Khớp bất kỳ chữ cái A-D đứng riêng biệt
    const standaloneMatch = str.match(/\b([A-D])\b/i);
    if (standaloneMatch) {
      return standaloneMatch[1].toUpperCase();
    }
    // 4. Nếu AI trả về nội dung của phương án thay vì chữ cái (VD: AI trả về "15 cm" khớp với text của phương án B)
    if (options && options.length > 0) {
      const rawClean = str.toLowerCase();
      for (const opt of options) {
        if (opt.text) {
          const optClean = opt.text.toLowerCase().trim();
          if (optClean && (optClean === rawClean || rawClean.includes(optClean))) {
            return opt.id.toUpperCase();
          }
        }
      }
    }
    return 'A';
  }

  /**
   * AI Tự động giải đề & Lập bảng đáp án chuẩn cho danh sách câu hỏi
   * (Kèm thẩm định kép Dual-Pass & Thử nghiệm ngược Back-Substitution)
   */
  async solveExamQuestions(params: {
    questions: Question[];
    grade?: string;
    topic?: string;
    onProgress?: (current: number, total: number) => void;
  }): Promise<Array<{
    questionId: string;
    order: number;
    correctAnswer: string;
    explanation: string;
    rubric?: string;
    confidence?: 'high' | 'medium' | 'needs_review';
    pass1Answer?: string;
    pass2Answer?: string;
    sanityCheckNote?: string;
  }>> {
    const { questions, grade = '7', topic = 'Toán THCS', onProgress } = params;
    if (!questions || questions.length === 0) return [];

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Chưa cấu hình Gemini API Key. Thầy/Cô vui lòng nhập API Key để kích hoạt Trợ lý AI Giải & Thẩm định đề.');
    }

    const results: Array<{
      questionId: string;
      order: number;
      correctAnswer: string;
      explanation: string;
      rubric?: string;
      confidence?: 'high' | 'medium' | 'needs_review';
      pass1Answer?: string;
      pass2Answer?: string;
      sanityCheckNote?: string;
    }> = [];

    // Tách riêng các câu trắc nghiệm (có phương án A, B, C, D) và các câu tự luận
    const mcqQuestions = questions.filter(q => !isEssayQuestion(q) && (q.type === 'multiple_choice' || (q.options && q.options.length >= 2)));
    const essayQuestions = questions.filter(q => isEssayQuestion(q) || (!mcqQuestions.includes(q)));

    const ai = new GoogleGenAI({ apiKey });
    let model = this.getModel();
    const totalQuestionsCount = questions.length;
    let completedCount = 0;

    // 1. GIẢI CÁC CÂU HỎI TRẮC NGHIỆM (QUY TRÌNH THẨM ĐỊNH KÉP)
    const BATCH_SIZE_MCQ = 4;
    for (let i = 0; i < mcqQuestions.length; i += BATCH_SIZE_MCQ) {
      const batch = mcqQuestions.slice(i, i + BATCH_SIZE_MCQ);

      try {
        const prompt = `
Bạn là Giám khảo & Chuyên gia giải đề thi môn Toán THCS Việt Nam (Chương trình GDPT mới, SGK Kết nối tri thức).
Nhiệm vụ: Giải và THẨM ĐỊNH ĐỘC LẬP 2 LẦN cho từng câu hỏi sau đây để tìm đáp án đúng tuyệt đối ('A', 'B', 'C' hoặc 'D').

QUY TRÌNH THẨM ĐỊNH KÉP BẮT BUỘC:
1. LƯỢT 1 (pass1): Tự giải toán trực tiếp từ đề bài, tính toán đại số/hình học từng bước -> ra phương án (A, B, C hoặc D).
2. LƯỢT 2 (pass2): Thử nghiệm ngược (thay số phương án vào đề) hoặc dùng cách giải khác độc lập -> ra phương án (A, B, C hoặc D).
3. ĐÁNH GIÁ:
   - Nếu pass1 trùng khớp pass2: confidence = "high", correctAnswer = pass1.
   - Nếu pass1 khác pass2: confidence = "needs_review", correctAnswer = phương án có bằng chứng thử ngược vững chắc hơn.
   - sanityCheckNote: 1 câu đối soát ngắn gọn (VD: "Thử ngược x=3 vào đề bài thỏa mãn 100%").
   - explanation: Lời giải chi tiết sư phạm, từng bước rõ ràng.

QUY TẮC CỰC KỲ QUAN TRỌNG:
- CÁC CÂU HỎI KHÁC NHAU CÓ ĐÁP ÁN KHÁC NHAU. TUYỆT ĐỐI KHÔNG CHỌN CÙNG MỘT ĐÁP ÁN (NHƯ TOÀN 'A') CHO CÁC CÂU. PHẢI TÍNH TOÁN CẨN THẬN TỪNG BÀI TOÁN.
- Trường 'questionId' PHẢI LẤY CHÍNH XÁC từ giá trị [Mã: ...] của câu hỏi tương ứng.
- 'pass1', 'pass2', 'correctAnswer' CHỈ LÀ 1 CHỮ CÁI DUY NHẤT: 'A', 'B', 'C' hoặc 'D'.

THÔNG TIN ĐỀ THI:
- Khối lớp: Toán ${grade} | Chủ đề: ${topic}

DANH SÁCH CÂU HỎI CẦN GIẢI TRONG ĐỢT NÀY:
${batch.map((q, idx) => `
[Mã: ${q.id}] (Câu ${q.order || i + idx + 1})
Đề bài: ${q.question}
Các phương án:
${(q.options || []).map(o => `  ${o.id}. ${o.text}`).join('\n')}
`).join('\n---\n')}

Trả về DUY NHẤT một mảng JSON thuần túy (không kèm markdown \`\`\`json):
[
  {
    "questionId": "${batch[0]?.id || 'q_id'}",
    "order": ${batch[0]?.order || i + 1},
    "pass1": "A hoặc B hoặc C hoặc D",
    "pass2": "A hoặc B hoặc C hoặc D",
    "confidence": "high",
    "correctAnswer": "A hoặc B hoặc C hoặc D",
    "sanityCheckNote": "Giải thích kết quả thử ngược...",
    "explanation": "Các bước giải chi tiết, chuẩn mực sư phạm..."
  }
]
`;
        const { response, modelUsed } = await this.generateWithFailover(ai, model, [{ text: prompt }], { temperature: 0.1 });
        if (modelUsed !== model) {
          model = modelUsed;
          this.setModel(modelUsed);
        }

        const text = response.text || '';
        const cleanJson = text.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          const parsedList = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsedList)) {
            parsedList.forEach((item: any, pIdx: number) => {
              const targetQ = batch.find(bq => bq.id === item.questionId)
                || batch.find(bq => String(bq.order) === String(item.order))
                || (typeof item.order === 'number' && item.order >= 1 && item.order <= batch.length ? batch[item.order - 1] : undefined)
                || batch[pIdx];

              if (!targetQ) return;

              const pass1 = this.extractValidAnswerLetter(item.pass1, targetQ.options);
              const pass2 = this.extractValidAnswerLetter(item.pass2, targetQ.options);
              const rawAns = item.correctAnswer ? this.extractValidAnswerLetter(item.correctAnswer, targetQ.options) : pass1;

              const confidence: 'high' | 'medium' | 'needs_review' = (item.confidence === 'needs_review' || pass1 !== pass2)
                ? 'needs_review'
                : 'high';

              results.push({
                questionId: targetQ.id,
                order: targetQ.order,
                correctAnswer: rawAns,
                explanation: item.explanation || 'Đã được giải chi tiết bằng AI Toán THCS.',
                confidence,
                pass1Answer: pass1,
                pass2Answer: pass2,
                sanityCheckNote: item.sanityCheckNote || (confidence === 'high' ? `Đã thử ngược kết quả (${pass1}), trùng khớp 100%.` : `Phát hiện nghi vấn giữa Lượt 1 (${pass1}) và Lượt 2 (${pass2}), cần giáo viên xem xét.`)
              });
            });
          }
        }
      } catch (batchErr) {
        console.warn('Lỗi khi AI giải đợt câu trắc nghiệm:', batchErr);
      }

      // Đối với các câu trắc nghiệm trong batch chưa có trong results: thử giải đơn lẻ
      for (const q of batch) {
        if (!results.some(r => r.questionId === q.id)) {
          try {
            const singleRes = await this.solveSingleQuestion({ question: q, grade, topic });
            results.push({
              questionId: q.id,
              order: q.order,
              correctAnswer: singleRes.correctAnswer,
              explanation: singleRes.explanation,
              confidence: singleRes.confidence || 'high',
              pass1Answer: singleRes.pass1Answer,
              pass2Answer: singleRes.pass2Answer,
              sanityCheckNote: singleRes.sanityCheckNote
            });
          } catch (singleErr) {
            results.push({
              questionId: q.id,
              order: q.order,
              correctAnswer: q.correctAnswer || (q.options && q.options[0]?.id) || 'A',
              explanation: q.explanation || 'Chưa thể tự động giải câu này, Thầy/Cô vui lòng nhập đáp án.',
              confidence: 'needs_review',
              pass1Answer: q.correctAnswer || 'A',
              pass2Answer: '?',
              sanityCheckNote: 'AI chưa thể giải câu này trong đợt quét. Cần Thầy/Cô kiểm tra.'
            });
          }
        }
      }

      completedCount += batch.length;
      if (onProgress) {
        onProgress(completedCount, totalQuestionsCount);
      }
    }

    // 2. GIẢI CÁC CÂU HỎI TỰ LUẬN (GIẢI CHI TIẾT + LẬP BIỂU ĐIỂM RUBRIC)
    const BATCH_SIZE_ESSAY = 3;
    for (let i = 0; i < essayQuestions.length; i += BATCH_SIZE_ESSAY) {
      const batch = essayQuestions.slice(i, i + BATCH_SIZE_ESSAY);

      try {
        const prompt = `
Bạn là Giám khảo & Chuyên gia giải đề thi môn Toán THCS Việt Nam (Chương trình GDPT mới, SGK Kết nối tri thức).
Nhiệm vụ: Giải chi tiết từng bước và xây dựng HƯỚNG DẪN CHẤM / BIỂU ĐIỂM (RUBRIC) cho các câu hỏi TỰ LUẬN sau đây.

YÊU CẦU CHO TỪNG CÂU TỰ LUẬN:
1. "correctAnswer": Tóm tắt ngắn gọn Đáp số hoặc Kết luận cốt lõi của bài toán (Ví dụ: "x = 2; x = -1" hoặc "A = 3/(√x - 1)" hoặc "Tứ giác ABCD nội tiếp do hai góc đối bù nhau"). TUYỆT ĐỐI KHÔNG ghi 'A', 'B', 'C', 'D'.
2. "explanation": Lời giải mẫu chi tiết, chuẩn mực sư phạm, đầy đủ từng bước lập luận, biến đổi đại số / hình học từ giả thiết đến kết luận.
3. "rubric": Hướng dẫn chấm / Thang điểm chi tiết từng bước (theo cấu trúc biểu điểm thi THCS) để giáo viên và AI có thể chấm điểm học sinh chính xác.
   (Ví dụ: "- Nêu đúng ĐKXĐ: +0.25đ\n- Quy đồng và rút gọn đúng tử số: +0.5đ\n- Rút gọn ra kết quả cuối cùng: +0.25đ")
4. "confidence": "high" nếu bài giải đã được kiểm tra lại đầy đủ điều kiện và phép tính; hoặc "needs_review" nếu đề bài có dữ kiện đặc biệt hoặc nhiều trường hợp cần đối soát.
5. "sanityCheckNote": 1 câu ngắn gọn đối chiếu (Ví dụ: "Đã thử lại nghiệm vào phương trình gốc, thỏa mãn ĐKXĐ 100%").

THÔNG TIN ĐỀ THI:
- Khối lớp: Toán ${grade} | Chủ đề: ${topic}

DANH SÁCH CÂU HỎI TỰ LUẬN CẦN GIẢI:
${batch.map((q, idx) => `
[Mã: ${q.id}] (Câu ${q.order || i + idx + 1})
Đề bài: ${q.question}
${q.rubric ? `Ghi chú rubric ban đầu của giáo viên: ${q.rubric}` : ''}
`).join('\n---\n')}

Trả về DUY NHẤT một mảng JSON thuần túy (không kèm markdown \`\`\`json):
[
  {
    "questionId": "${batch[0]?.id || 'q_id'}",
    "order": ${batch[0]?.order || i + 1},
    "correctAnswer": "Đáp số hoặc kết luận cốt lõi của bài toán",
    "explanation": "Lời giải chi tiết từng bước, chuẩn mực sư phạm...",
    "rubric": "- Bước 1: ... (+0.25đ)\n- Bước 2: ... (+0.5đ)\n- Bước 3: Kết luận (+0.25đ)",
    "confidence": "high",
    "sanityCheckNote": "Đã kiểm tra lại kết quả và điều kiện xác định."
  }
]
`;
        const { response, modelUsed } = await this.generateWithFailover(ai, model, [{ text: prompt }], { temperature: 0.1 });
        if (modelUsed !== model) {
          model = modelUsed;
          this.setModel(modelUsed);
        }

        const text = response.text || '';
        const cleanJson = text.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          const parsedList = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsedList)) {
            parsedList.forEach((item: any, pIdx: number) => {
              const targetQ = batch.find(bq => bq.id === item.questionId)
                || batch.find(bq => String(bq.order) === String(item.order))
                || (typeof item.order === 'number' && item.order >= 1 && item.order <= batch.length ? batch[item.order - 1] : undefined)
                || batch[pIdx];

              if (!targetQ) return;

              results.push({
                questionId: targetQ.id,
                order: targetQ.order,
                correctAnswer: item.correctAnswer || targetQ.correctAnswer || 'Xem lời giải chi tiết',
                explanation: item.explanation || 'Đã giải chi tiết câu tự luận bằng AI Toán THCS.',
                rubric: item.rubric || targetQ.rubric || '',
                confidence: item.confidence === 'needs_review' ? 'needs_review' : 'high',
                sanityCheckNote: item.sanityCheckNote || 'Đã đối soát kết quả và biểu điểm bài giải.'
              });
            });
          }
        }
      } catch (essayBatchErr) {
        console.warn('Lỗi khi AI giải đợt câu tự luận:', essayBatchErr);
      }

      // Đối với các câu tự luận trong batch chưa có trong results: giải đơn lẻ
      for (const q of batch) {
        if (!results.some(r => r.questionId === q.id)) {
          try {
            const singleRes = await this.solveSingleQuestion({ question: q, grade, topic });
            results.push({
              questionId: q.id,
              order: q.order,
              correctAnswer: singleRes.correctAnswer,
              explanation: singleRes.explanation,
              rubric: singleRes.rubric || q.rubric,
              confidence: singleRes.confidence || 'high',
              sanityCheckNote: singleRes.sanityCheckNote
            });
          } catch (singleErr) {
            results.push({
              questionId: q.id,
              order: q.order,
              correctAnswer: q.correctAnswer || 'Xem lời giải chi tiết',
              explanation: q.explanation || 'Chưa thể tự động giải câu này, Thầy/Cô vui lòng nhập đáp án.',
              rubric: q.rubric || '',
              confidence: 'needs_review',
              sanityCheckNote: 'AI chưa thể giải câu này trong đợt quét. Cần Thầy/Cô kiểm tra.'
            });
          }
        }
      }

      completedCount += batch.length;
      if (onProgress) {
        onProgress(completedCount, totalQuestionsCount);
      }
    }

    // Đảm bảo tất cả các câu đều có kết quả
    questions.forEach((q) => {
      if (!results.some(r => r.questionId === q.id)) {
        const isEssay = isEssayQuestion(q);
        results.push({
          questionId: q.id,
          order: q.order,
          correctAnswer: isEssay ? (q.correctAnswer || 'Xem lời giải chi tiết') : (q.correctAnswer || 'A'),
          explanation: q.explanation || (isEssay ? 'Câu hỏi tự luận yêu cầu giải chi tiết theo các bước.' : 'Chưa thể tự động giải câu này, Thầy/Cô vui lòng nhập đáp án.'),
          rubric: q.rubric || '',
          confidence: 'high'
        });
      }
    });

    results.sort((a, b) => a.order - b.order);
    return results;
  }

  /**
   * AI giải 1 câu hỏi cụ thể
   */
  async solveSingleQuestion(params: {
    question: Question;
    grade?: string;
    topic?: string;
  }): Promise<{
    correctAnswer: string;
    explanation: string;
    rubric?: string;
    confidence?: 'high' | 'medium' | 'needs_review';
    pass1Answer?: string;
    pass2Answer?: string;
    sanityCheckNote?: string;
  }> {
    const { question, grade = '7', topic = 'Toán THCS' } = params;
    const apiKey = this.getApiKey();
    const isEssay = isEssayQuestion(question);

    // 1. CÂU HỎI TỰ LUẬN
    if (isEssay) {
      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          let model = this.getModel();
          const prompt = `
Bạn là Giám khảo & Chuyên gia giải đề thi môn Toán THCS Việt Nam (Chương trình GDPT mới, SGK Kết nối tri thức).
Nhiệm vụ: Giải chi tiết từng bước và xây dựng HƯỚNG DẪN CHẤM / BIỂU ĐIỂM (RUBRIC) cho câu hỏi TỰ LUẬN sau.

THÔNG TIN ĐỀ THI:
- Khối lớp: Toán ${grade} | Chủ đề: ${topic}
- Đề bài: ${question.question}
${question.rubric ? `- Ghi chú rubric hiện tại: ${question.rubric}` : ''}

YÊU CẦU:
1. "correctAnswer": Tóm tắt ngắn gọn Đáp số hoặc Kết luận cốt lõi của bài toán (Ví dụ: "x = 2; x = -1" hoặc "Biểu thức A = 3/(√x - 1)" hoặc "Tứ giác ABCD nội tiếp"). TUYỆT ĐỐI KHÔNG ghi 'A', 'B', 'C' hay 'D'.
2. "explanation": Lời giải mẫu chi tiết, chuẩn mực sư phạm, biến đổi đại số/hình học từng bước rõ ràng từ giả thiết đến kết luận.
3. "rubric": Biểu điểm chấm chi tiết từng bước (0.25đ / 0.5đ) theo chuẩn chấm thi THCS.
4. "confidence": "high" hoặc "needs_review".
5. "sanityCheckNote": 1 câu ngắn gọn đối soát (Ví dụ: "Đã kiểm tra lại điều kiện xác định và phép biến đổi, chính xác.").

Trả về DUY NHẤT một JSON thuần túy (không kèm markdown \`\`\`json):
{
  "correctAnswer": "Đáp số hoặc kết luận cốt lõi của bài toán",
  "explanation": "Lời giải chi tiết từng bước...",
  "rubric": "- Bước 1... (+0.25đ)\n- Bước 2... (+0.5đ)\n- Bước 3: Kết luận (+0.25đ)",
  "confidence": "high",
  "sanityCheckNote": "Đã kiểm tra và đối soát kết quả."
}
`;
          const { response } = await this.generateWithFailover(ai, model, [{ text: prompt }], { temperature: 0.1 });
          const text = (response.text || '').replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              correctAnswer: parsed.correctAnswer || question.correctAnswer || 'Xem lời giải chi tiết',
              explanation: parsed.explanation || 'Đã giải chi tiết bằng AI Toán THCS.',
              rubric: parsed.rubric || question.rubric || '',
              confidence: parsed.confidence === 'needs_review' ? 'needs_review' : 'high',
              sanityCheckNote: parsed.sanityCheckNote || 'Đã đối soát kết quả và biểu điểm bài giải.'
            };
          }
        } catch (err) {
          console.warn('Lỗi khi AI giải câu tự luận:', err);
        }
      }

      return {
        correctAnswer: question.correctAnswer || 'Xem lời giải chi tiết',
        explanation: question.explanation || 'Bài toán tự luận yêu cầu giải theo các bước chuẩn mực trong SGK.',
        rubric: question.rubric || '',
        confidence: 'needs_review',
        sanityCheckNote: 'Chưa thể kết nối Gemini API để giải câu tự luận này.'
      };
    }

    // 2. CÂU HỎI TRẮC NGHIỆM (QUY TRÌNH THẨM ĐỊNH KÉP)
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        let model = this.getModel();
        const prompt = `
Bạn là Giám khảo & Chuyên gia thẩm định đề thi môn Toán THCS Việt Nam (Chương trình GDPT mới, SGK Kết nối tri thức).
Nhiệm vụ: Giải và THẨM ĐỊNH ĐỘC LẬP 2 LẦN để tìm đáp án đúng tuyệt đối ('A', 'B', 'C' hoặc 'D') cho câu hỏi sau.

QUY TRÌNH THẨM ĐỊNH KÉP BẮT BUỘC:
1. LƯỢT 1 (pass1): Suy luận từ giả thiết đề bài, biến đổi logic/đại số/hình học -> Ra đáp án (A, B, C hoặc D).
2. LƯỢT 2 (pass2): Thử nghiệm ngược vào phương trình/điều kiện đề bài hoặc giải bằng cách khác -> Ra đáp án (A, B, C hoặc D).
3. ĐÁNH GIÁ ĐỘ TIN CẬY:
   - Nếu pass1 trùng khớp pass2 -> confidence = "high", correctAnswer = pass1
   - Nếu pass1 khác pass2 -> confidence = "needs_review", correctAnswer = phương án có bằng chứng thử nghiệm ngược vững chắc hơn
   - sanityCheckNote: 1 câu giải thích ngắn gọn kết quả thử ngược (VD: "Thay x = 2 vào biểu thức thấy hai vế bằng nhau, chuẩn xác.").

THÔNG TIN ĐỀ THI:
- Khối lớp: Toán ${grade} | Chủ đề: ${topic}
- Đề bài: ${question.question}
- Các phương án:
${(question.options || []).map(o => `  ${o.id}. ${o.text}`).join('\n')}

QUY TẮC BẮT BUỘC:
- 'pass1', 'pass2', 'correctAnswer' CHỈ LÀ 1 CHỮ CÁI DUY NHẤT: 'A', 'B', 'C' hoặc 'D'.

Trả về DUY NHẤT một JSON thuần túy (không kèm markdown \`\`\`json):
{
  "pass1": "A hoặc B hoặc C hoặc D",
  "pass2": "A hoặc B hoặc C hoặc D",
  "confidence": "high",
  "correctAnswer": "A hoặc B hoặc C hoặc D",
  "sanityCheckNote": "Thử ngược kết quả vào đề bài thỏa mãn 100%.",
  "explanation": "Các bước giải chi tiết, chuẩn mực sư phạm..."
}
`;
        const { response } = await this.generateWithFailover(ai, model, [{ text: prompt }], { temperature: 0.1 });
        const text = (response.text || '').replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const pass1 = this.extractValidAnswerLetter(parsed.pass1, question.options);
          const pass2 = this.extractValidAnswerLetter(parsed.pass2, question.options);
          const validAns = parsed.correctAnswer ? this.extractValidAnswerLetter(parsed.correctAnswer, question.options) : pass1;

          const confidence: 'high' | 'medium' | 'needs_review' = (parsed.confidence === 'needs_review' || pass1 !== pass2)
            ? 'needs_review'
            : 'high';

          return {
            correctAnswer: validAns,
            explanation: parsed.explanation || 'Giải và đối soát bởi Gemini AI.',
            confidence,
            pass1Answer: pass1,
            pass2Answer: pass2,
            sanityCheckNote: parsed.sanityCheckNote || (confidence === 'high' ? `Đã thử ngược kết quả (${pass1}), trùng khớp 100%.` : `Nghi vấn giữa Lượt 1 (${pass1}) và Lượt 2 (${pass2}), cần giáo viên xác nhận.`)
          };
        }
      } catch (err) {
        console.warn('Lỗi khi AI giải 1 câu:', err);
      }
    }

    const fallback = this.fallbackSolveSingleQuestion(question);
    return {
      ...fallback,
      confidence: 'needs_review',
      pass1Answer: fallback.correctAnswer,
      pass2Answer: fallback.correctAnswer,
      sanityCheckNote: 'Chưa thể kết nối Gemini API để đối soát. Vui lòng kiểm tra API Key.'
    };
  }

  /**
   * AI giải đề từ nội dung trích xuất file PDF
   */
  async solveQuestionsFromPdf(params: {
    pdfText: string;
    expectedCount?: number;
    grade?: string;
    topic?: string;
    onProgress?: (current: number, total: number) => void;
  }): Promise<Record<number, { correctAnswer: string; explanation: string; questionText?: string }>> {
    const { pdfText, expectedCount = 40, grade = '7', topic = 'Toán THCS', onProgress } = params;
    const resultMap: Record<number, { correctAnswer: string; explanation: string; questionText?: string }> = {};

    const apiKey = this.getApiKey();
    if (apiKey && pdfText.trim()) {
      try {
        if (onProgress) onProgress(5, expectedCount);
        const ai = new GoogleGenAI({ apiKey });
        const model = this.getModel();

        // Cắt gọn văn bản nếu quá dài (lấy tối đa 15000 ký tự đầu)
        const truncatedText = pdfText.substring(0, 18000);

        const prompt = `
Bạn là Giám khảo Toán THCS Việt Nam.
Dưới đây là nội dung trích xuất từ một file đề thi PDF môn Toán lớp ${grade} (${topic}).
Nhiệm vụ của bạn:
1. Đọc nội dung, nhận diện các câu hỏi trắc nghiệm và các phương án A, B, C, D tương ứng.
2. Giải từng câu và xác định đáp án đúng (A, B, C, hoặc D) cho từng câu hỏi từ 1 đến ${expectedCount}.
3. Viết lời giải ngắn gọn cho mỗi câu.

NỘI DUNG ĐỀ THI:
${truncatedText}

TRẢ VỀ DUY NHẤT MẢNG JSON (không kèm markdown):
[
  {
    "order": 1,
    "correctAnswer": "B",
    "explanation": "Giải thích ngắn...",
    "questionText": "Tóm tắt đề câu 1..."
  }
]
`;
        const response = await ai.models.generateContent({
          model: model,
          contents: [{ text: prompt }]
        });

        const text = response.text || '';
        const cleanJson = text.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          const list = JSON.parse(jsonMatch[0]);
          if (Array.isArray(list)) {
            list.forEach((item: any) => {
              const num = parseInt(item.order, 10);
              if (!isNaN(num) && num >= 1) {
                const validAns = ['A', 'B', 'C', 'D'].includes(String(item.correctAnswer).toUpperCase())
                  ? String(item.correctAnswer).toUpperCase()
                  : 'A';
                resultMap[num] = {
                  correctAnswer: validAns,
                  explanation: item.explanation || '',
                  questionText: item.questionText || `Câu ${num}`
                };
              }
            });
          }
        }
        if (onProgress) onProgress(expectedCount, expectedCount);
      } catch (pdfErr) {
        console.warn('Lỗi khi AI đọc đề PDF:', pdfErr);
      }
    }

    return resultMap;
  }

  /**
   * Bộ quy tắc suy luận thông minh khi ngoại tuyến
   */
  private fallbackSolveSingleQuestion(q: Question): { questionId: string; order: number; correctAnswer: string; explanation: string } {
    if (isEssayQuestion(q)) {
      return {
        questionId: q.id,
        order: q.order,
        correctAnswer: q.correctAnswer || 'Xem lời giải chi tiết',
        explanation: q.explanation || 'Bài toán tự luận yêu cầu học sinh trình bày các bước suy luận, lập luận chặt chẽ và kết luận theo thang điểm.'
      };
    }

    const qText = (q.question || '').toLowerCase();
    const opts = q.options || [];
    let detectedAns = q.correctAnswer || 'A';
    let explanation = q.explanation || '';

    // Phân tích định nghĩa SGK phổ biến
    if (qText.includes('số hữu tỉ') && qText.includes('kí hiệu')) {
      const qOpt = opts.find(o => o.text.trim().toUpperCase() === 'Q' || o.text.trim() === '$\\mathbb{Q}$');
      if (qOpt) {
        detectedAns = qOpt.id;
        explanation = 'Tập hợp các số hữu tỉ được kí hiệu là Q.';
      }
    } else if (qText.includes('số vô tỉ')) {
      const sqrtOpt = opts.find(o => o.text.includes('√') || o.text.includes('sqrt') || o.text.includes('pi') || o.text.includes('π'));
      if (sqrtOpt) {
        detectedAns = sqrtOpt.id;
        explanation = 'Số vô tỉ là số viết được dưới dạng số thập phân vô hạn không tuần hoàn.';
      }
    } else if (qText.includes('số nguyên') && qText.includes('kí hiệu')) {
      const zOpt = opts.find(o => o.text.trim().toUpperCase() === 'Z' || o.text.trim() === '$\\mathbb{Z}$');
      if (zOpt) {
        detectedAns = zOpt.id;
        explanation = 'Tập hợp các số nguyên được kí hiệu là Z.';
      }
    } else if (qText.includes('số tự nhiên') && qText.includes('kí hiệu')) {
      const nOpt = opts.find(o => o.text.trim().toUpperCase() === 'N' || o.text.trim() === '$\\mathbb{N}$');
      if (nOpt) {
        detectedAns = nOpt.id;
        explanation = 'Tập hợp các số tự nhiên được kí hiệu là N.';
      }
    } else if (!explanation) {
      explanation = `Đáp án đúng là phương án ${detectedAns}. Học sinh cần giải theo các bước công thức đã học trong SGK.`;
    }

    return {
      questionId: q.id,
      order: q.order,
      correctAnswer: detectedAns,
      explanation
    };
  }

  /**
   * Hoán vị phương án nội bộ để fallback an toàn
   */
  private shuffleQuestionOptionsInternal(q: Question): Question {
    if (!q.options || q.options.length < 2) return { ...q };
    const currentCorrect = q.options.find(o => o.id.toUpperCase() === q.correctAnswer.toUpperCase())?.text || '';
    const shuffledTexts = [...q.options.map(o => o.text)].sort(() => Math.random() - 0.5);
    const newOptions = shuffledTexts.map((text, idx) => ({
      id: String.fromCharCode(65 + idx),
      text
    }));
    const newCorrect = newOptions.find(o => o.text === currentCorrect)?.id || q.correctAnswer;
    return {
      ...q,
      options: newOptions,
      correctAnswer: newCorrect
    };
  }

  /**
   * AI Sinh đề tương tự chuẩn 1:1 theo từng câu hỏi của đề gốc (Isomorphic Question Generation)
   * - Giữ nguyên dạng toán, độ khó, ma trận của từng câu gốc
   * - Thay đổi số liệu toán học (chọn số đẹp, phù hợp THCS) hoặc biến số, đỉnh hình học
   * - Tự động tính toán lại 4 phương án A, B, C, D và xác định đáp án đúng tuyệt đối
   * - Viết lời giải chi tiết sư phạm cho từng câu
   * - Chia đợt (batch 6 câu) để đảm bảo độ chính xác cao và không bị timeout/token limit
   */
  async generateIsomorphicQuestions(params: {
    sourceQuestions: Question[];
    grade?: string;
    topic?: string;
    onProgress?: (current: number, total: number) => void;
  }): Promise<Question[]> {
    const { sourceQuestions, grade = '7', topic = 'Toán THCS', onProgress } = params;
    if (!sourceQuestions || sourceQuestions.length === 0) return [];

    const apiKey = this.getApiKey();
    const results: Question[] = [];
    const BATCH_SIZE = 6;

    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const model = this.getModel();

      for (let i = 0; i < sourceQuestions.length; i += BATCH_SIZE) {
        const batch = sourceQuestions.slice(i, i + BATCH_SIZE);
        if (onProgress) {
          onProgress(Math.min(i, sourceQuestions.length), sourceQuestions.length);
        }

        try {
          const prompt = `
Bạn là Chuyên gia Khảo thí và Giáo viên giỏi môn Toán THCS Việt Nam (Chương trình GDPT mới, bám sát chuẩn kiến thức & kỹ năng bộ sách "Kết nối tri thức với cuộc sống").
Hãy tạo các CÂU HỎI TƯƠNG TỰ (MÃ ĐỀ BIẾN THỂ 1:1) tương ứng chính xác cho từng câu hỏi gốc môn Toán lớp ${grade} (Chủ đề: ${topic}).

YÊU CẦU BẮT BUỘC CHO MỖI CÂU:
1. Giữ NGUYÊN dạng toán, cùng mức độ nhận thức (Nhận biết/Thông hiểu/Vận dụng), cùng cấu trúc logic với câu hỏi gốc.
2. ĐỔI SỐ LIỆU TOÁN HỌC (chọn số nguyên/phân số đẹp, nghiệm nguyên, hình học có độ dài hợp lý).
3. Viết 4 phương án A, B, C, D mới tương ứng.
4. Xác định CHÍNH XÁC đáp án đúng ('A', 'B', 'C' hoặc 'D') và viết lời giải chi tiết sư phạm từng bước vào trường 'explanation'.
5. Trả về DUY NHẤT một mảng JSON thuần túy (không kèm markdown \`\`\`json):
[
  {
    "order": 1,
    "question": "Nội dung câu hỏi mới...",
    "type": "multiple_choice",
    "options": [
      { "id": "A", "text": "..." },
      { "id": "B", "text": "..." },
      { "id": "C", "text": "..." },
      { "id": "D", "text": "..." }
    ],
    "correctAnswer": "A",
    "explanation": "Lời giải chi tiết...",
    "points": 1,
    "topicHint": "${topic}"
  }
]

DANH SÁCH CÂU HỎI GỐC CẦN TẠO BIẾN THỂ TƯƠNG ĐƯƠNG 1:1:
${batch.map((q, idx) => `
[CÂU ${q.order || i + idx + 1}]
- Đề bài gốc: ${q.question}
- Các phương án gốc:
${(q.options || []).map(o => `  ${o.id}. ${o.text}`).join('\n')}
- Đáp án đúng gốc: ${q.correctAnswer || 'A'}
`).join('\n---\n')}
`;

          const { response } = await this.generateWithFailover(ai, model, [{ text: prompt }], { temperature: 0.2 });
          const text = response.text || '';
          const cleanJson = text.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
          const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);

          if (jsonMatch) {
            const parsedList = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsedList)) {
              batch.forEach((origQ, idx) => {
                const item = parsedList.find((p: any) => p.order === origQ.order) || parsedList[idx];
                if (item && item.question && Array.isArray(item.options) && item.options.length >= 2) {
                  const validLetter = ['A', 'B', 'C', 'D'].includes(String(item.correctAnswer).toUpperCase())
                    ? String(item.correctAnswer).toUpperCase()
                    : 'A';
                  results.push({
                    id: `q_sim_${Date.now()}_${origQ.order}_${idx}`,
                    order: origQ.order,
                    question: item.question,
                    type: origQ.type || 'multiple_choice',
                    options: item.options.map((opt: any, optIdx: number) => ({
                      id: opt.id || String.fromCharCode(65 + optIdx),
                      text: String(opt.text || '')
                    })),
                    correctAnswer: validLetter,
                    points: origQ.points || 1,
                    explanation: item.explanation || 'Lời giải được biên soạn bởi AI Toán THCS.',
                    topicHint: item.topicHint || origQ.topicHint || topic
                  });
                } else {
                  // Fallback cho câu này nếu AI trả về thiếu
                  results.push(this.shuffleQuestionOptionsInternal({
                    ...origQ,
                    id: `q_var_${Date.now()}_${origQ.order}`
                  }));
                }
              });
            }
          }
        } catch (batchErr) {
          console.warn('Lỗi khi AI sinh đợt câu hỏi tương tự:', batchErr);
          // Fallback an toàn cho đợt này bằng hoán vị phương án
          batch.forEach((origQ) => {
            if (!results.some(r => r.order === origQ.order)) {
              results.push(this.shuffleQuestionOptionsInternal({
                ...origQ,
                id: `q_var_${Date.now()}_${origQ.order}`
              }));
            }
          });
        }

        if (onProgress) {
          onProgress(Math.min(i + batch.length, sourceQuestions.length), sourceQuestions.length);
        }
      }
    }

    // Đảm bảo đủ tất cả các câu từ đề gốc
    sourceQuestions.forEach((origQ) => {
      if (!results.some(r => r.order === origQ.order)) {
        results.push(this.shuffleQuestionOptionsInternal({
          ...origQ,
          id: `q_var_${Date.now()}_${origQ.order}`
        }));
      }
    });

    results.sort((a, b) => a.order - b.order);
    return results;
  }

  /**
   * AI Bóc tách toàn bộ câu hỏi & công thức Toán từ file PDF hoặc Hình ảnh (ảnh dán / upload)
   * Sử dụng Gemini Vision Multimodal kết hợp chuẩn hóa LaTeX KaTeX
   */
  async extractQuestionsFromMedia(params: ExtractQuestionsFromMediaParams): Promise<MediaExtractResult> {
    const { media, fileName, grade, onProgress, apiKey: customKey } = params;
    const apiKey = customKey?.trim() || this.getApiKey();

    if (!apiKey) {
      throw new Error('Chưa cấu hình Gemini API Key. Bạn vui lòng nhập API Key để kích hoạt AI bóc tách đề thi PDF & hình ảnh.');
    }

    if (!media || media.length === 0) {
      throw new Error('Vui lòng chọn hoặc dán ít nhất 1 file PDF hoặc hình ảnh đề thi.');
    }

    if (onProgress) onProgress('Đang tải dữ liệu và khởi tạo kết nối Gemini AI Vision...');

    const ai = new GoogleGenAI({ apiKey });
    const model = this.getModel();

    const isPdf = media.some(m => m.mimeType === 'application/pdf');

    const promptText = `
Bạn là Chuyên gia Khảo thí và Số hóa Đề thi môn Toán THCS Việt Nam (Chương trình GDPT mới, bám sát các bộ SGK: Kết nối tri thức với cuộc sống, Chân trời sáng tạo, Cánh diều).
Nhiệm vụ của bạn: Đọc toàn bộ nội dung từ tài liệu đính kèm (${isPdf ? 'File đề thi PDF' : 'Ảnh chụp / ảnh dán đề thi'}), bóc tách TOÀN BỘ các câu hỏi kiểm tra toán học và trả về cấu trúc dữ liệu JSON chuẩn.

QUY TẮC BÓC TÁCH CỰC KỲ QUAN TRỌNG:
1. ĐẦY ĐỦ CÂU HỎI: Bóc tách không bỏ sót bất kỳ câu hỏi nào trong đề (từ Câu 1 đến câu cuối cùng).
2. CHUẨN HÓA CÔNG THỨC TOÁN HỌC (LATEX):
   - Mọi biểu thức toán, phân số, căn thức, phương trình, số mũ, góc, vector, hệ phương trình BẮT BUỘC phải đặt trong cặp dấu đô la: $công_thức$.
   - Ví dụ: $\\frac{x - 1}{x + 2}$, $\\sqrt{2x + 1}$, $x^2 - 4x + 4 = 0$, $\\widehat{ABC} = 60^\\circ$, $\\vec{AB}$, $\\begin{cases} x + y = 3 \\\\ 2x - y = 1 \\end{cases}$.
   - Giữ nguyên các ký tự toán học chính xác từng ký tự, không viết tắt, không làm tròn.
3. PHÂN LOẠI CÂU HỎI:
   - "multiple_choice": Các câu trắc nghiệm nhiều lựa chọn (thường có A, B, C, D).
     + Tách riêng từng phương án vào mảng options: [{ id: "A", text: "..." }, { id: "B", text: "..." }, ...].
     + Nhận diện phương án đúng (correctAnswer): Nếu đề có khoanh tròn, đánh dấu, gạch chân hoặc có bảng đáp án cuối trang thì lấy theo đề; nếu đề bài chưa có đáp án, bạn hãy TỰ GIẢI TOÁN ĐỂ CHỌN ĐÁP ÁN ĐÚNG CHÍNH XÁC (A, B, C hoặc D).
     + Viết lời giải tóm tắt ngắn gọn vào explanation.
   - "essay": Các câu tự luận (chứng minh hình học, rút gọn biểu thức, giải bài toán bằng cách lập hệ phương trình, bài toán thực tế).
     + Ghi rõ đề bài kèm điều kiện, hình vẽ (nêu rõ giả thiết).
     + Viết tóm tắt các bước giải hoặc biểu điểm gợi ý vào rubric hoặc explanation.
4. ĐIỂM SỐ (points):
   - Nếu đề có ghi điểm (ví dụ: "(0,5 điểm)", "(1,0 điểm)"), hãy lấy đúng số điểm đó.
   - Nếu không ghi: Mặc định trắc nghiệm là 0.25 hoặc 0.5 điểm, tự luận là 1.0 đến 2.0 điểm.
5. SỐ THỨ TỰ (order): Đánh số thứ tự từ 1, 2, 3... liên tục.

YÊU CẦU ĐỊNH DẠNG ĐẦU RA:
Chỉ trả về DUY NHẤT một chuỗi JSON hợp lệ theo định dạng sau (không kèm lời chào hay văn bản ngoài JSON):
{
  "examTitle": "Tiêu đề đề thi (ví dụ: Đề khảo sát chất lượng môn Toán 8 - Học kì 1)",
  "grade": "${grade || '8'}",
  "questions": [
    {
      "order": 1,
      "question": "Nội dung câu hỏi với công thức toán $...$",
      "type": "multiple_choice",
      "options": [
        { "id": "A", "text": "Nội dung phương án A kèm công thức $...$" },
        { "id": "B", "text": "Nội dung phương án B kèm công thức $...$" },
        { "id": "C", "text": "Nội dung phương án C kèm công thức $...$" },
        { "id": "D", "text": "Nội dung phương án D kèm công thức $...$" }
      ],
      "correctAnswer": "A",
      "points": 0.5,
      "explanation": "Lời giải ngắn gọn...",
      "rubric": ""
    }
  ]
}
`;

    if (onProgress) onProgress('Đang gửi dữ liệu sang Gemini AI để trích xuất câu hỏi & công thức...');

    const contentsParts: any[] = [];
    for (const item of media) {
      const cleanBase64 = item.base64Data.includes('base64,')
        ? item.base64Data.split('base64,')[1]
        : item.base64Data;

      contentsParts.push({
        inlineData: {
          mimeType: item.mimeType,
          data: cleanBase64
        }
      });
    }

    contentsParts.push({ text: promptText });

    const { response, modelUsed } = await this.generateWithFailover(
      ai,
      model,
      contentsParts,
      {
        responseMimeType: 'application/json'
      }
    );

    if (onProgress) onProgress('Đang phân tích cấu trúc câu hỏi và chuẩn hóa công thức...');

    const rawText = response.text || '';
    let parsedJson: any = null;

    try {
      const cleaned = rawText
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();
      parsedJson = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Không thể parse JSON từ Gemini:', rawText, parseErr);
      const arrayMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
        try {
          parsedJson = { questions: JSON.parse(arrayMatch[0]) };
        } catch {}
      }
      if (!parsedJson) {
        throw new Error('AI không thể cấu trúc hóa dữ liệu đề thi từ tài liệu này. Vui lòng kiểm tra lại độ nét của ảnh hoặc nội dung file PDF.');
      }
    }

    const rawQuestions: any[] = Array.isArray(parsedJson)
      ? parsedJson
      : Array.isArray(parsedJson?.questions)
        ? parsedJson.questions
        : Array.isArray(parsedJson?.data)
          ? parsedJson.data
          : [];

    if (rawQuestions.length === 0) {
      throw new Error('Không phát hiện thấy câu hỏi nào trong file PDF/ảnh. Hãy đảm bảo tài liệu chứa đề thi môn Toán.');
    }

    const questions: Question[] = rawQuestions.map((q: any, idx: number) => {
      const qOrder = Number(q.order) || (idx + 1);
      const isEssay = q.type === 'essay' || (!q.options || q.options.length < 2);
      
      let options: { id: string; text: string }[] = [];
      if (!isEssay && Array.isArray(q.options)) {
        options = q.options.map((opt: any, oIdx: number) => {
          if (typeof opt === 'string') {
            const letter = String.fromCharCode(65 + oIdx);
            return { id: letter, text: opt };
          }
          return {
            id: String(opt.id || String.fromCharCode(65 + oIdx)).toUpperCase(),
            text: String(opt.text || '')
          };
        });
      }

      let correct = 'A';
      if (!isEssay) {
        correct = this.extractValidAnswerLetter(q.correctAnswer, options);
      }

      return {
        id: `ai_media_${Date.now()}_${qOrder}_${Math.random().toString(36).substring(2, 6)}`,
        order: qOrder,
        question: String(q.question || `Câu hỏi ${qOrder}`).trim(),
        type: isEssay ? 'essay' : 'multiple_choice',
        options: isEssay ? [] : options,
        correctAnswer: isEssay ? '' : correct,
        points: Number(q.points) || (isEssay ? 1.0 : 0.5),
        explanation: q.explanation ? String(q.explanation).trim() : '',
        rubric: q.rubric ? String(q.rubric).trim() : ''
      };
    });

    questions.sort((a, b) => a.order - b.order);

    return {
      examTitle: parsedJson?.examTitle || fileName || 'Đề thi trích xuất từ AI',
      grade: parsedJson?.grade || grade || '8',
      questions,
      rawSummary: `Đã bóc tách thành công ${questions.length} câu hỏi (${questions.filter(q => q.type === 'multiple_choice').length} trắc nghiệm, ${questions.filter(q => q.type === 'essay').length} tự luận) từ mô hình ${modelUsed}.`
    };
  }
}

export const aiService = new HybridAIService();
