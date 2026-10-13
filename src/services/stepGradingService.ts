import {
  StepGradingRequest,
  StepGradingResponse,
  VerifyCorrectionRequest,
  VerifyCorrectionResponse,
  RemedialGenerateRequest,
  RemedialGenerateResponse,
  RemedialExercise
} from '../types';
import { fingerprintAIInput, readAIResult, writeAIResult, loadAIImage, type AIImageMemo } from '../utils/aiResultCache';

/**
 * Service giao tiếp an toàn với Server AI Backend
 * KHÔNG gọi trực tiếp Gemini từ trình duyệt - Tuân thủ nguyên tắc bảo mật Đợt 4.
 */
class StepGradingService {
  private inFlight = new Map<string, Promise<StepGradingResponse>>();
  private quotaUntil = 0;
  /**
   * Phân tích và chấm bài tự luận từng bước (Step-by-step Grading)
   */
  async analyzeStepByStep(request: StepGradingRequest, options: { force?: boolean; previousResult?: StepGradingResponse; imageMemo?: AIImageMemo } = {}): Promise<StepGradingResponse> {
    const prepared = { ...request, essayImages: [...(request.essayImages || [])] };
    try {
      for (let i = 0; i < prepared.essayImages.length; i++) {
        if (!prepared.essayImages[i].startsWith('data:')) {
          const image = await loadAIImage(prepared.essayImages[i], options.imageMemo);
          prepared.essayImages[i] = `data:${image.mimeType};base64,${image.data}`;
        }
      }
      if (prepared.questionImageUrl && !prepared.questionImageUrl.startsWith('data:')) {
        const image = await loadAIImage(prepared.questionImageUrl, options.imageMemo);
        prepared.questionImageUrl = `data:${image.mimeType};base64,${image.data}`;
      }
    } catch {
      return this.unavailable(request, 'Chưa đọc được đủ ảnh nguồn. Cần giáo viên kiểm tra ảnh trước khi chấm.');
    }
    const fingerprint = await fingerprintAIInput({ engine: 'step-grading-v4-flash', request: {
      questionId: prepared.questionId || 'q1', questionText: prepared.questionText.trim(),
      grade: prepared.grade || 'THCS', topic: prepared.topic || 'Toán', maxPoints: prepared.maxPoints ?? 10,
      correctAnswer: (prepared.correctAnswer || '').trim(), rubric: (prepared.rubric || '').trim(),
      hasExplicitRubric: prepared.hasExplicitRubric !== false && !!prepared.rubric?.trim(),
      questionImageUrl: prepared.questionImageUrl || '', studentSolutionText: (prepared.studentSolutionText || '').trim(),
      essayImages: prepared.essayImages
    } });
    if (!options.force) {
      const cached = readAIResult<StepGradingResponse>('grading', fingerprint);
      if (cached) return { ...cached, reusedResult: true };
      const saved = options.previousResult;
      if (fingerprint && saved?.requestFingerprint === fingerprint && saved.success && saved.analysisSource === 'ai' && Array.isArray(saved.analysis) && saved.analysis.length > 0 && Number.isFinite(saved.score) && saved.score >= 0 && saved.score <= (request.maxPoints || 10)) {
        writeAIResult('grading', fingerprint, saved);
        return { ...saved, reusedResult: true };
      }
    }
    if (Date.now() < this.quotaUntil) return this.unavailable(request, 'AI đang hết hạn mức (429); đã dừng gọi lặp. Điểm đang chờ giáo viên duyệt.', 'quota');
    if (fingerprint && this.inFlight.has(fingerprint)) return this.inFlight.get(fingerprint)!;
    const task = this.requestAnalysis(prepared).then(result => {
      const completed = { ...result, requestFingerprint: fingerprint || undefined };
      if (completed.success && completed.analysisSource === 'ai' && completed.analysis?.length > 0 && Number.isFinite(completed.score)) {
        writeAIResult('grading', fingerprint, completed);
      }
      return completed;
    });
    if (fingerprint) this.inFlight.set(fingerprint, task);
    try { return await task; }
    finally { if (fingerprint) this.inFlight.delete(fingerprint); }
  }

  private unavailable(request: StepGradingRequest, feedback: string, errorCode?: 'quota'): StepGradingResponse {
    return { success: false, analysis: [], firstErrorStep: null, firstErrorType: null,
      firstErrorExplanation: null, totalSteps: 0, correctStepsCount: 0, isAllCorrect: false,
      score: 0, maxScore: request.maxPoints || 10, feedback, analysisSource: 'unavailable',
      needsTeacherReview: true, errorCode };
  }

  private async requestAnalysis(request: StepGradingRequest): Promise<StepGradingResponse> {
    try {
      const res = await fetch('/api/grading/step-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        if (res.status === 429) {
          this.quotaUntil = Date.now() + 60000;
          return this.unavailable(request, 'AI hết hạn mức (429). Đã dừng gọi lặp; hãy duyệt điểm hoặc thử lại sau.', 'quota');
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Lỗi máy chủ: ${res.status}`);
      }

      const result: StepGradingResponse = await res.json();
      if (!Number.isFinite(result.score) || result.score < 0 || result.score > (request.maxPoints || 10)) {
        return this.unavailable(request, 'Điểm AI trả về không hợp lệ. Cần giáo viên kiểm tra, không tự chốt điểm.');
      }
      if (result.analysisSource !== 'ai' || !result.success || !Array.isArray(result.analysis) || result.analysis.length === 0) {
        if (!Array.isArray(result.analysis)) result.analysis = [];
        result.needsTeacherReview = true;
        result.isAllCorrect = false;
      }
      return result;
    } catch (error: any) {
      console.warn('[StepGradingService] Phân tích thất bại, chuyển sang cơ chế dự phòng:', error?.message);
      // Fallback cục bộ an toàn nếu mạng mất kết nối
      return {
        success: false,
        analysis: [],
        firstErrorStep: null,
        firstErrorType: null,
        firstErrorExplanation: null,
        totalSteps: 0,
        correctStepsCount: 0,
        isAllCorrect: false,
        score: 0,
        maxScore: request.maxPoints || 10,
        feedback: 'Không thể kết nối với máy chủ AI lúc này. Vui lòng kiểm tra lại kết nối mạng.',
        analysisSource: 'unavailable',
        message: error?.message || 'Lỗi kết nối'
      };
    }
  }

  /**
   * Học sinh tự sửa bước sai -> AI kiểm tra lại (Verify Correction)
   */
  async verifyCorrection(request: VerifyCorrectionRequest): Promise<VerifyCorrectionResponse> {
    try {
      const res = await fetch('/api/grading/verify-correction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Lỗi máy chủ: ${res.status}`);
      }

      return await res.json();
    } catch (error: any) {
      console.error('[StepGradingService] verifyCorrection error:', error);
      return {
        success: false,
        isCorrect: false,
        isProgress: false,
        evaluationTitle: 'Chưa thể kiểm tra lúc này',
        feedback: 'Có lỗi kết nối khi kiểm tra bước sửa. Em hãy đối chiếu với gợi ý của Gia sư Socratic nhé.',
        nextAdvice: 'Em hãy thử lại khi có mạng ổn định.',
        source: 'rule',
        message: error?.message || 'Lỗi mạng'
      };
    }
  }

  /**
   * Tự sinh bài toán tương tự cùng dạng (Isomorphic Problem) kèm Metadata
   */
  async generateRemedial(request: RemedialGenerateRequest): Promise<RemedialGenerateResponse> {
    try {
      const res = await fetch('/api/remedial/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Lỗi máy chủ: ${res.status}`);
      }

      return await res.json();
    } catch (error: any) {
      console.error('[StepGradingService] generateRemedial error:', error);
      // Fallback remedial exercise
      const fallbackEx: RemedialExercise = {
        id: 'remedial_fallback_' + Date.now(),
        title: 'Bài tập rèn luyện tương tự',
        weakness: 'Rèn luyện kỹ năng biến đổi toán học',
        problemLatex: 'Tìm $x$ biết:\n$$2(x - 3) = 4$$',
        hint: 'Em hãy chia cả 2 vế cho 2 hoặc nhân phá ngoặc trước nhé.',
        solutionLatex: '$$2x - 6 = 4 \\iff 2x = 10 \\iff x = 5$$',
        finalAnswer: '$x = 5$',
        metadata: {
          sourceQuestionId: request.sourceQuestionId,
          sourceErrorType: request.sourceErrorType,
          sourceFirstErrorStep: request.sourceFirstErrorStep,
          skillTarget: request.skillTarget || 'Kỹ năng biến đổi',
          difficulty: request.difficulty || 'standard',
          generatedAt: new Date().toISOString()
        }
      };

      return {
        success: true,
        exercise: fallbackEx,
        message: 'Đã dùng bài tập mẫu tương tự do mạng gián đoạn.'
      };
    }
  }
}

export const stepGradingService = new StepGradingService();
