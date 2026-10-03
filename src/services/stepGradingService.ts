import {
  StepGradingRequest,
  StepGradingResponse,
  VerifyCorrectionRequest,
  VerifyCorrectionResponse,
  RemedialGenerateRequest,
  RemedialGenerateResponse,
  RemedialExercise
} from '../types';

/**
 * Service giao tiếp an toàn với Server AI Backend
 * KHÔNG gọi trực tiếp Gemini từ trình duyệt - Tuân thủ nguyên tắc bảo mật Đợt 4.
 */
class StepGradingService {
  /**
   * Phân tích và chấm bài tự luận từng bước (Step-by-step Grading)
   */
  async analyzeStepByStep(request: StepGradingRequest): Promise<StepGradingResponse> {
    try {
      const res = await fetch('/api/grading/step-analysis', {
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
