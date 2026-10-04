import { Router, Request, Response } from 'express';
import { Type } from '@google/genai';
import {
  AI_CONFIG,
  getSystemGeminiClient,
  sanitizeMathData
} from '../aiConfig.js';
import {
  RemedialGenerateRequest,
  RemedialGenerateResponse,
  RemedialExercise
} from '../types.js';

export const remedialRouter = Router();

const REMEDIAL_SYSTEM_PROMPT = `Bạn là Chuyên gia Thiết kế Đề thi & Giáo trình Toán THCS (Lớp 6 đến Lớp 9) chuẩn mực Bộ GD&ĐT.
Nhiệm vụ: Thiết kế 01 BÀI TOÁN MỚI HOÀN TOÀN TƯƠNG TỰ CÙNG DẠNG (Isomorphic Math Problem) với đề bài gốc, nhằm rèn luyện khắc phục chính xác lỗ hổng kiến thức hoặc dạng lỗi sai mà học sinh vừa mắc phải.

QUY TẮC BẮT BUỘC:
1. ĐÚNG DẠNG - CÙNG KỸ NĂNG:
   - Bài toán mới phải đo lường cùng một kỹ năng / đơn vị kiến thức với bài gốc.
   - Tập trung rèn luyện vào đúng loại lỗi sai của học sinh:
     + Nếu học sinh sai dấu khi chuyển vế: bài mới bắt buộc chứa bước chuyển vế đổi dấu.
     + Nếu sai công thức lũy thừa / căn thức: bài mới rèn đúng quy tắc đó.
     + Nếu sai hằng đẳng thức hoặc đặt nhân tử chung: bài mới rèn đúng hằng đẳng thức đó.
     + Nếu sai điều kiện xác định: bài mới yêu cầu tìm và đối chiếu ĐKXĐ.

2. THAY ĐỔI DỮ KIỆN (KHÔNG COPY NGUYÊN BÀI CŨ):
   - Đổi số liệu, đổi hệ số hợp lý, kết quả ra số nguyên hoặc phân số gọn gàng, đẹp mắt.
   - Tuyệt đối không sao chép nguyên vẹn bài toán cũ.

3. ĐÚNG CHUẨN TOÁN HỌC LATEX:
   - Viết công thức bằng LaTeX chuẩn: \\frac{a}{b}, \\cdot, \\sqrt{x}, lũy thừa bọc ngoặc {}.
   - Mọi biểu thức toán học bọc trong $...$ hoặc $$...$$.

4. CẤU TRÚC ĐẦU RA:
   - title: Tiêu đề rèn luyện (VD: "Rèn luyện: Quy tắc chuyển vế & Đổi dấu phương trình bậc nhất")
   - weakness: Lỗ hổng kiến thức trọng tâm cần khắc phục
   - problemLatex: Đề bài toán tương tự dạng LaTeX
   - hint: Gợi ý phương pháp giải nhắm thẳng vào nút thắt tư duy
   - solutionLatex: Lời giải mẫu chi tiết từng bước
   - finalAnswer: Đáp số cuối cùng`;

/**
 * Endpoint: POST /api/remedial/generate
 * Tự sinh bài toán tương tự cùng dạng (Isomorphic Problem) kèm Metadata nguồn gốc
 */
remedialRouter.post(['/generate', '/reroll'], async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const sourceQuestionId = body.sourceQuestionId || body.questionId || 'q1';
    const sourceQuestionText = body.sourceQuestionText || body.problemStatementLatex || body.problem || '';
    const grade = body.grade || body.classification?.grade || 'THCS';
    const topic = body.topic || body.classification?.topic || 'Toán';
    const sourceErrorType = body.sourceErrorType || body.errorType || 'sign';
    const sourceFirstErrorStep = body.sourceFirstErrorStep || 1;
    const skillTarget = body.skillTarget || body.classification?.subtopic || 'Kỹ năng biến đổi đại số';
    const difficulty = body.difficulty || 'standard';
    const studentMistakeSummary = body.studentMistakeSummary || body.errorComment || body.feedback || '';

    if (!sourceQuestionText) {
      return res.status(400).json({
        success: false,
        exercise: null,
        message: 'Vui lòng cung cấp nội dung bài toán gốc để tạo bài tập tương tự.'
      });
    }

    const timestamp = new Date().toISOString();
    const exerciseId = 'remedial_' + Date.now();

    let ai;
    try {
      ai = getSystemGeminiClient();
    } catch (err: any) {
      console.warn('[Remedial Router] GEMINI_API_KEY không khả dụng, sử dụng bộ sinh bài mẫu chuẩn sư phạm:', err?.message);
      const fallbackExercise = generateFallbackRemedialExercise(body, exerciseId, timestamp);
      return res.status(200).json({
        success: true,
        exercise: fallbackExercise,
      });
    }

    const promptText = `BÀI TOÁN GỐC (Khối ${grade}, Chuyên đề: ${topic}):
${sourceQuestionText}

THÔNG TIN LỖI SAI HỌC SINH MẮC PHẢI:
- Loại lỗi sai chính: "${sourceErrorType}" (Tại Bước ${sourceFirstErrorStep})
- Kỹ năng cần rèn luyện: "${skillTarget}"
${studentMistakeSummary ? `- Chi tiết lỗi: "${studentMistakeSummary}"` : ''}
- Mức độ độ khó yêu cầu: ${difficulty === 'easier' ? 'Dễ hơn một chút để lấy lại tự tin' : (difficulty === 'harder' ? 'Nâng cao hơn một chút' : 'Tương đương bài gốc')}

YÊU CẦU: Hãy tạo 01 bài toán mới cùng dạng để học sinh luyện tập khắc phục chính xác lỗi trên.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Tiêu đề rèn luyện kèm dạng toán' },
        weakness: { type: Type.STRING, description: 'Lỗ hổng kiến thức chính cần khắc phục' },
        problemLatex: { type: Type.STRING, description: 'Đề bài toán tương tự dạng LaTeX' },
        hint: { type: Type.STRING, description: 'Gợi ý phương pháp giải nhắm thẳng vào lỗi sai' },
        solutionLatex: { type: Type.STRING, description: 'Lời giải mẫu chi tiết từng bước' },
        finalAnswer: { type: Type.STRING, description: 'Đáp số cuối cùng' }
      },
      required: ['title', 'weakness', 'problemLatex', 'hint', 'solutionLatex', 'finalAnswer']
    };

    let resultJson: any = null;
    for (const m of AI_CONFIG.models) {
      try {
        const resp = await ai.models.generateContent({
          model: m,
          contents: promptText,
          config: {
            systemInstruction: REMEDIAL_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.35,
          }
        });
        if (resp.text && resp.text.trim()) {
          resultJson = JSON.parse(resp.text);
          break;
        }
      } catch (err: any) {
        console.warn(`[Remedial Router] Model ${m} failed:`, err?.message);
      }
    }

    if (!resultJson) {
      const fallbackExercise = generateFallbackRemedialExercise(body, exerciseId, timestamp);
      return res.status(200).json({
        success: true,
        exercise: fallbackExercise,
      });
    }

    const remedialExercise: RemedialExercise = {
      id: exerciseId,
      title: sanitizeMathData(resultJson.title || `Bài tập rèn luyện dạng ${sourceErrorType}`),
      weakness: sanitizeMathData(resultJson.weakness || `Củng cố kỹ năng ${skillTarget}`),
      problemLatex: sanitizeMathData(resultJson.problemLatex || ''),
      hint: sanitizeMathData(resultJson.hint || 'Hãy đối chiếu công thức và chú ý từng bước đổi dấu.'),
      solutionLatex: sanitizeMathData(resultJson.solutionLatex || ''),
      finalAnswer: sanitizeMathData(resultJson.finalAnswer || ''),
      metadata: {
        sourceQuestionId,
        sourceErrorType,
        sourceFirstErrorStep,
        skillTarget,
        difficulty,
        generatedAt: timestamp
      }
    };

    const responsePayload: RemedialGenerateResponse = {
      success: true,
      exercise: remedialExercise
    };

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error('[Remedial Router Error]:', error);
    const timestamp = new Date().toISOString();
    const exerciseId = 'remedial_' + Date.now();
    const fallback = generateFallbackRemedialExercise(req.body, exerciseId, timestamp);
    return res.status(200).json({
      success: true,
      exercise: fallback
    });
  }
});

/**
 * Bộ sinh bài tương tự dự phòng (Isomorphic Problem Template Generator)
 */
function generateFallbackRemedialExercise(
  req: RemedialGenerateRequest,
  exerciseId: string,
  timestamp: string
): RemedialExercise {
  const {
    sourceQuestionId = 'q1',
    sourceErrorType = 'sign',
    sourceFirstErrorStep = 1,
    skillTarget = 'Quy tắc dấu & Chuyển vế',
    difficulty = 'standard',
    grade = '7'
  } = req || {};

  return {
    id: exerciseId,
    title: `Rèn luyện: Khắc phục lỗi ${sourceErrorType === 'sign' ? 'Quy tắc dấu khi chuyển vế' : 'Biến đổi toán học'}`,
    weakness: `Rèn luyện tính cẩn thận khi thực hiện phép tính và áp dụng chuẩn quy tắc ${sourceErrorType}`,
    problemLatex: `Giải phương trình sau để tìm giá trị của $x$:\n$$3(x - 2) - 5 = 2x + 4$$`,
    hint: `Em hãy chú ý: Khi nhân phá ngoặc $3(x - 2) = 3x - 6$, và khi chuyển các hạng tử chứa $x$ sang vế trái, các số tự do sang vế phải thì **phải đổi dấu** của các hạng tử đó!`,
    solutionLatex: `1. Phá ngoặc vế trái:\n$$3x - 6 - 5 = 2x + 4 \\iff 3x - 11 = 2x + 4$$\n\n2. Chuyển vế và đổi dấu:\n$$3x - 2x = 4 + 11$$\n\n3. Thu gọn:\n$$x = 15$$\n\nVậy phương trình có nghiệm duy nhất là $x = 15$.`,
    finalAnswer: `$x = 15$`,
    metadata: {
      sourceQuestionId,
      sourceErrorType,
      sourceFirstErrorStep,
      skillTarget,
      difficulty,
      generatedAt: timestamp
    }
  };
}
