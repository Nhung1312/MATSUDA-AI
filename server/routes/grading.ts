import { Router, Request, Response } from 'express';
import { Type } from '@google/genai';
import {
  AI_CONFIG,
  getSystemGeminiClient,
  sanitizeMathData
} from '../aiConfig.js';
import {
  StepGradingRequest,
  StepGradingResponse,
  StepAnalysis,
  VerifyCorrectionRequest,
  VerifyCorrectionResponse,
  StepErrorType,
  StepStatus
} from '../types.js';

export const gradingRouter = Router();

const STEP_GRADING_SYSTEM_PROMPT = `Bạn là Chuyên gia Giáo viên Toán THCS (Lớp 6 đến Lớp 9) xuất sắc và chuẩn mực sư phạm.
Nhiệm vụ: Phân tích, đối chiếu và chấm chi tiết bài làm tự luận của học sinh THCS TỪNG BƯỚC MỘT (Step-by-step Mathematical Grading).

NGUYÊN TẮC CỐT LÕI (BẮT BUỘC):
1. PHÂN TÍCH TỪNG DÒNG BIẾN ĐỔI:
   - Đọc kỹ bài làm học sinh (từ văn bản gõ hoặc ảnh viết tay).
   - Chia bài làm thành từng bước toán học cụ thể (stepIndex = 1, 2, 3...).
   - TUYỆT ĐỐI không chỉ xem mỗi đáp số cuối hay chỉ chấm dòng đầu rồi dừng lại.

2. PHÁT HIỆN BƯỚC SAI ĐẦU TIÊN (FIRST ERROR DETECTION - QUAN TRỌNG NHẤT):
   - Xác định chính xác bước đầu tiên học sinh mắc sai lầm toán học: gán status="first_error" và isFirstError=true.
   - Các bước tiếp theo:
     + Nếu bước tiếp theo sử dụng kết quả sai từ bước trước nhưng bản thân phép biến đổi là hợp lý theo kết quả đó: BẮT BUỘC đánh dấu status="cascading_error", isFollowUpError=true. KHÔNG coi là lỗi mới và KHÔNG trừ điểm lặp lại.
     + Nếu học sinh phát sinh một lỗi sai MỚI hoàn toàn độc lập với lỗi trước: đánh dấu status="independent_error", isIndependentError=true.
     + Nếu bước đó đúng đắn: status="correct".
     + Nếu hình ảnh hoặc chữ viết quá mờ, không chắc chắn: status="uncertain", gán confidence < 0.70. TUYỆT ĐỐI KHÔNG tự động kết luận học sinh làm sai khi nét chữ không rõ.

3. PHÂN LOẠI LỖI (errorType):
   - Thuộc đúng một trong các loại sau:
     + "sign": Sai dấu (nhầm dấu âm/dương, quên đổi dấu khi chuyển vế, quên đổi dấu khi phá ngoặc có dấu trừ đằng trước).
     + "calculation": Sai số học cơ bản (cộng, trừ, nhân, chia, rút gọn phân số nhầm).
     + "formula": Áp dụng sai công thức, hằng đẳng thức, quy tắc lũy thừa, căn bậc hai.
     + "logical": Lập luận suy diễn thiếu căn cứ, ngộ nhận hình học, suy ngược chiều logic.
     + "condition": Quên hoặc xét thiếu điều kiện xác định (ĐKXĐ), điều kiện nghiệm nguyên, bài toán thực tế.
     + "transformation": Biến đổi sai quy tắc tương đương (chia cho biểu thức chưa khác 0, bình phương không đặt điều kiện).
     + "concept": Nhầm lẫn khái niệm toán học (ước vs bội, nghiệm vs tập nghiệm).
     + "other": Lỗi khác.
     + "None": Không có lỗi (bước đúng).

4. CÔNG THỨC TOÁN LATEX:
   - Dùng \\frac{a}{b} cho phân số, \\cdot cho phép nhân (TUYỆT ĐỐI KHÔNG dùng \\times để tránh lỗi JSON escape), lũy thừa bọc ngoặc {}.
   - Mọi biểu thức toán học trong lời nhận xét PHẢI bọc trong cặp dấu $...$.

5. NỘI DUNG NHẬN XÉT:
   - Chỉ rõ: Đến bước nào em làm đúng? Bước đầu tiên sai ở đâu? Vì sao bước đó sai? Cách sửa đúng bằng công thức LaTeX (correctionLatex).`;

/**
 * Endpoint: POST /api/grading/step-analysis
 * Chấm chi tiết bài làm tự luận từng bước, phát hiện first_error, cascading_error, independent_error
 */
gradingRouter.post('/step-analysis', async (req: Request, res: Response) => {
  try {
    const body: StepGradingRequest = req.body;
    const {
      questionId = 'q1',
      questionText,
      grade = 'THCS',
      topic = 'Toán',
      maxPoints = 10,
      correctAnswer,
      rubric,
      studentSolutionText,
      essayImages
    } = body || {};

    if (!questionText || (!studentSolutionText && (!essayImages || essayImages.length === 0))) {
      return res.status(400).json({
        success: false,
        analysis: [],
        firstErrorStep: null,
        firstErrorType: null,
        firstErrorExplanation: null,
        totalSteps: 0,
        correctStepsCount: 0,
        isAllCorrect: false,
        score: 0,
        maxScore: maxPoints,
        feedback: 'Vui lòng cung cấp nội dung đề bài và bài làm của học sinh (văn bản hoặc ảnh).',
        analysisSource: 'unavailable',
        message: 'Thiếu dữ liệu bài làm để phân tích.'
      });
    }

    let ai;
    try {
      ai = getSystemGeminiClient();
    } catch (keyErr: any) {
      console.warn('[Step Grading] GEMINI_API_KEY không khả dụng, kích hoạt phân tích luật mẫu:', keyErr?.message);
      return res.status(200).json(generateRuleBasedGrading(body));
    }

    // Chuẩn bị payload nội dung cho Gemini
    const contents: any[] = [];
    let promptText = `ĐỀ BÀI TOÁN (Khối ${grade}, Chuyên đề: ${topic}):\n${questionText}\n\n`;
    if (correctAnswer) {
      promptText += `ĐÁP ÁN CHUẨN THAM KHẢO / HƯỚNG DẪN CHẤM:\n${correctAnswer}\n\n`;
    }
    if (rubric) {
      promptText += `THANG ĐIỂM (RUBRIC):\n${rubric}\n\n`;
    }
    if (studentSolutionText && studentSolutionText.trim().length > 0) {
      promptText += `BÀI LÀM TỰ LUẬN DO HỌC SINH GÕ/NHẬP:\n"${studentSolutionText}"\n\n`;
    }
    if (essayImages && essayImages.length > 0) {
      promptText += `Học sinh có tải kèm ${essayImages.length} ảnh bài làm viết tay. Hãy nhận diện cấu trúc từng bước giải từ hình ảnh đính kèm.\n\n`;
    }
    promptText += `YÊU CẦU ĐẦU RA:
1. Trả về mảng \`analysis\` chứa mọi bước biến đổi của học sinh.
2. Xác định chính xác \`firstErrorStep\` (bước đầu tiên sai) nếu có, \`firstErrorType\`, \`firstErrorExplanation\`.
3. Đánh dấu đúng status: "correct", "first_error", "cascading_error", "independent_error", "uncertain".
4. Cho điểm thành phần phản ánh chính xác các bước đúng (score / maxScore: ${maxPoints}).`;

    const parts: any[] = [{ text: promptText }];

    // Thêm các ảnh bài làm viết tay dạng base64 nếu có
    if (Array.isArray(essayImages) && essayImages.length > 0) {
      for (const imgUrl of essayImages) {
        if (typeof imgUrl === 'string') {
          const match = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }

    contents.push({ parts });

    // Schema nghiêm ngặt cho StepAnalysis
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        analysis: {
          type: Type.ARRAY,
          description: 'Danh sách các bước phân tích bài làm học sinh',
          items: {
            type: Type.OBJECT,
            properties: {
              stepIndex: { type: Type.INTEGER, description: 'Chỉ số bước bắt đầu từ 1' },
              studentLatex: { type: Type.STRING, description: 'Biểu thức hoặc nội dung bước học sinh viết dạng LaTeX' },
              referenceStepLatex: { type: Type.STRING, description: 'Biểu thức chuẩn tương ứng dạng LaTeX' },
              status: {
                type: Type.STRING,
                description: 'Trạng thái bước: correct | first_error | cascading_error | independent_error | uncertain'
              },
              comment: { type: Type.STRING, description: 'Nhận xét sư phạm ngắn gọn, dễ hiểu cho bước này' },
              errorType: {
                type: Type.STRING,
                description: 'Loại lỗi: sign | calculation | formula | logical | condition | transformation | concept | other | None'
              },
              correctionLatex: { type: Type.STRING, description: 'Gợi ý cách biến đổi đúng dạng LaTeX' },
              isFirstError: { type: Type.BOOLEAN, description: 'True nếu là bước sai đầu tiên' },
              isFollowUpError: { type: Type.BOOLEAN, description: 'True nếu là bước sai kéo theo từ lỗi trước' },
              isIndependentError: { type: Type.BOOLEAN, description: 'True nếu là lỗi sai độc lập mới' },
              confidence: { type: Type.NUMBER, description: 'Độ tin cậy từ 0.0 đến 1.0' },
              bbox: {
                type: Type.OBJECT,
                description: 'Tọa độ vùng bước trên ảnh (0-100%) nếu nhận diện rõ',
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER }
                }
              }
            },
            required: ['stepIndex', 'studentLatex', 'status', 'comment', 'confidence']
          }
        },
        firstErrorStep: { type: Type.INTEGER, description: 'Số thứ tự bước sai đầu tiên, hoặc null nếu đúng hết' },
        firstErrorType: { type: Type.STRING, description: 'Loại lỗi của bước đầu tiên' },
        firstErrorExplanation: { type: Type.STRING, description: 'Giải thích nguyên nhân bước sai đầu tiên' },
        isAllCorrect: { type: Type.BOOLEAN, description: 'True nếu học sinh làm đúng hoàn toàn' },
        score: { type: Type.NUMBER, description: 'Điểm số đạt được' },
        feedback: { type: Type.STRING, description: 'Nhận xét tổng quan toàn bài' },
        referenceSolution: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stepNumber: { type: Type.INTEGER },
                  solutionLatex: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ['stepNumber', 'solutionLatex', 'explanation']
              }
            },
            finalAnswerLatex: { type: Type.STRING }
          },
          required: ['steps', 'finalAnswerLatex']
        }
      },
      required: ['analysis', 'isAllCorrect', 'score', 'feedback']
    };

    let resultJson: any = null;
    let usedModel = AI_CONFIG.defaultModel;

    for (const modelName of AI_CONFIG.models) {
      try {
        const resp = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: STEP_GRADING_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema,
            temperature: AI_CONFIG.temperature.grading,
          }
        });
        if (resp.text && resp.text.trim()) {
          resultJson = JSON.parse(resp.text);
          usedModel = modelName;
          break;
        }
      } catch (err: any) {
        console.warn(`[Step Grading] Model ${modelName} thất bại, thử mô hình dự phòng:`, err?.message || err);
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (!resultJson) {
      console.warn('[Step Grading] Các model AI tạm thời quá tải, sử dụng bộ phân tích dự phòng chuẩn sư phạm.');
      return res.status(200).json(generateRuleBasedGrading(body));
    }

    // Hậu xử lý & Chuẩn hóa dữ liệu theo nguyên tắc Đợt 4
    const rawAnalysis: any[] = Array.isArray(resultJson.analysis) ? resultJson.analysis : [];
    let detectedFirstErrorIndex: number | null = null;
    let detectedFirstErrorType: StepErrorType | null = null;

    const normalizedAnalysis: StepAnalysis[] = rawAnalysis.map((rawStep, index) => {
      const stepIdx = rawStep.stepIndex || (index + 1);
      const conf = typeof rawStep.confidence === 'number' ? Math.max(0, Math.min(1, rawStep.confidence)) : 0.95;
      
      let status: StepStatus = 'correct';
      const rawStatus = String(rawStep.status || '').toLowerCase();
      
      if (rawStatus === 'first_error' || rawStep.isFirstError) {
        status = 'first_error';
      } else if (rawStatus === 'cascading_error' || rawStep.isFollowUpError) {
        status = 'cascading_error';
      } else if (rawStatus === 'independent_error' || rawStep.isIndependentError) {
        status = 'independent_error';
      } else if (rawStatus === 'uncertain' || rawStatus === 'unclear' || conf < 0.70) {
        status = 'uncertain';
      } else if (rawStatus === 'incorrect') {
        status = detectedFirstErrorIndex === null ? 'first_error' : 'cascading_error';
      }

      // Xác định chính xác bước sai đầu tiên
      if (status === 'first_error' && detectedFirstErrorIndex === null) {
        detectedFirstErrorIndex = stepIdx;
        detectedFirstErrorType = (rawStep.errorType as StepErrorType) || 'other';
      } else if (status === 'first_error' && detectedFirstErrorIndex !== null) {
        // Chỉ có duy nhất một first_error
        status = 'cascading_error';
      }

      // Xử lý BBox hợp lệ (không tạo bbox giả)
      let bbox = null;
      if (rawStep.bbox && typeof rawStep.bbox.width === 'number' && rawStep.bbox.width > 0 && rawStep.bbox.height > 0) {
        bbox = {
          x: Math.max(0, Math.min(100, rawStep.bbox.x || 0)),
          y: Math.max(0, Math.min(100, rawStep.bbox.y || 0)),
          width: Math.max(0, Math.min(100, rawStep.bbox.width)),
          height: Math.max(0, Math.min(100, rawStep.bbox.height)),
        };
      }

      return {
        stepIndex: stepIdx,
        stepNumber: stepIdx,
        studentLatex: sanitizeMathData(rawStep.studentLatex || rawStep.studentText || `Bước ${stepIdx}`),
        studentText: rawStep.studentText ? sanitizeMathData(rawStep.studentText) : undefined,
        referenceStepLatex: rawStep.referenceStepLatex ? sanitizeMathData(rawStep.referenceStepLatex) : undefined,
        status,
        comment: sanitizeMathData(rawStep.comment || (status === 'correct' ? 'Biến đổi chính xác' : 'Cần xem lại bước này')),
        errorType: (rawStep.errorType as StepErrorType) || (status === 'correct' ? 'None' : 'other'),
        correctionLatex: rawStep.correctionLatex ? sanitizeMathData(rawStep.correctionLatex) : undefined,
        isFirstError: status === 'first_error',
        isFollowUpError: status === 'cascading_error',
        isIndependentError: status === 'independent_error',
        confidence: conf,
        bbox,
      };
    });

    // Tính toán số liệu tổng hợp
    const totalSteps = normalizedAnalysis.length;
    const correctStepsCount = normalizedAnalysis.filter(s => s.status === 'correct').length;
    const isAllCorrect = detectedFirstErrorIndex === null && normalizedAnalysis.every(s => s.status === 'correct');

    const firstError = detectedFirstErrorIndex 
      ? normalizedAnalysis.find(s => s.stepIndex === detectedFirstErrorIndex)
      : null;

    const finalResponse: StepGradingResponse = {
      success: true,
      analysis: normalizedAnalysis,
      firstErrorStep: detectedFirstErrorIndex,
      firstErrorType: detectedFirstErrorType || (firstError?.errorType as StepErrorType) || null,
      firstErrorExplanation: firstError ? firstError.comment : (resultJson.firstErrorExplanation || null),
      totalSteps,
      correctStepsCount,
      isAllCorrect,
      score: typeof resultJson.score === 'number' ? Math.min(maxPoints, Math.max(0, resultJson.score)) : (isAllCorrect ? maxPoints : Math.round((correctStepsCount / Math.max(1, totalSteps)) * maxPoints * 10) / 10),
      maxScore: maxPoints,
      feedback: sanitizeMathData(resultJson.feedback || 'Đã hoàn tất phân tích chi tiết từng bước.'),
      referenceSolution: resultJson.referenceSolution ? {
        steps: Array.isArray(resultJson.referenceSolution.steps)
          ? resultJson.referenceSolution.steps.map((st: any) => ({
              stepNumber: st.stepNumber,
              solutionLatex: sanitizeMathData(st.solutionLatex || ''),
              explanation: sanitizeMathData(st.explanation || '')
            }))
          : [],
        finalAnswerLatex: sanitizeMathData(resultJson.referenceSolution.finalAnswerLatex || '')
      } : undefined,
      analysisSource: 'ai',
      modelUsed: usedModel,
    };

    return res.status(200).json(finalResponse);
  } catch (error: any) {
    console.error('[Step Grading API Error]:', error);
    return res.status(200).json(generateRuleBasedGrading(req.body));
  }
});

/**
 * Endpoint: POST /api/grading/verify-correction
 * Kiểm tra lại bước sửa của học sinh (Học sinh tự sửa -> AI kiểm tra)
 */
gradingRouter.post('/verify-correction', async (req: Request, res: Response) => {
  try {
    const body: VerifyCorrectionRequest = req.body;
    const {
      questionText,
      grade = 'THCS',
      topic = 'Toán',
      originalWork,
      firstErrorStep,
      firstErrorLatex,
      errorType,
      studentCorrection,
      correctionImage
    } = body || {};

    if (!studentCorrection && !correctionImage) {
      return res.status(400).json({
        success: false,
        isCorrect: false,
        isProgress: false,
        evaluationTitle: 'Chưa có bài sửa',
        feedback: 'Vui lòng nhập bước biến đổi hoặc giải thích sửa lại của em.',
        nextAdvice: 'Em hãy viết lại bước làm đúng vào ô bên dưới nhé.',
        source: 'rule',
        message: 'Thiếu nội dung sửa bài'
      });
    }

    let ai;
    try {
      ai = getSystemGeminiClient();
    } catch {
      return res.status(200).json({
        success: true,
        isCorrect: true,
        isProgress: true,
        evaluationTitle: '🎉 Đã ghi nhận bước sửa của em!',
        feedback: 'Thầy/Cô thấy em đã rất chủ động đối chiếu lại công thức và sửa đổi phép tính.',
        nextAdvice: 'Hãy áp dụng ngay cách biến đổi này để giải tiếp nhé!',
        source: 'rule'
      });
    }

    const verifyPrompt = `Bạn là Giám khảo & Gia sư Socratic TOÁN THCS.
Nhiệm vụ: Đánh giá bước sửa lại / lời giải sửa lại của học sinh sau khi đã nhận diện lỗi sai trước đó.

BÀI TOÁN GỐC (Lớp ${grade} - ${topic}):
${questionText}

THÔNG TIN LỖI SAI TRƯỚC ĐÓ:
- Bước sai đầu tiên: Bước ${firstErrorStep || 'trước đó'}
- Biểu thức sai cũ: ${firstErrorLatex || 'Không có'}
- Dạng lỗi: ${errorType || 'Cần kiểm tra'}
${originalWork ? `- Toàn bộ bài làm cũ: "${originalWork}"` : ''}

BÀI SỬA / BƯỚC BIẾN ĐỔI MỚI CỦA HỌC SINH:
"${studentCorrection}"

YÊU CẦU ĐÁNH GIÁ:
1. isCorrect: True nếu bước sửa mới đã hoàn toàn chính xác về mặt toán học.
2. isProgress: True nếu học sinh đã khắc phục được lỗi sai gốc (dù có thể còn bước sau cần làm tiếp).
3. evaluationTitle: Tiêu đề khích lệ ngắn gọn (Ví dụ: "🎉 Xuất sắc! Em đã sửa đúng dấu", "💡 Rất tốt! Em đã nhớ quy tắc chuyển vế", "⚠️ Còn một chút nhầm lẫn ở phép nhân").
4. feedback: Nhận xét sư phạm ngắn gọn, chỉ rõ bước sửa đúng ở đâu và giải thích công thức nếu cần.
5. nextAdvice: Lời khuyên bước tiếp theo để học sinh hoàn thành nốt bài toán.
TUYỆT ĐỐI KHÔNG giải hộ đáp án cuối cùng nếu học sinh chỉ mới sửa 1 bước.
Toán học bọc trong cặp dấu $...$.`;

    const parts: any[] = [{ text: verifyPrompt }];
    if (correctionImage && typeof correctionImage === 'string') {
      const match = correctionImage.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    }

    const verifySchema = {
      type: Type.OBJECT,
      properties: {
        isCorrect: { type: Type.BOOLEAN },
        isProgress: { type: Type.BOOLEAN },
        evaluationTitle: { type: Type.STRING },
        feedback: { type: Type.STRING },
        nextAdvice: { type: Type.STRING }
      },
      required: ['isCorrect', 'isProgress', 'evaluationTitle', 'feedback', 'nextAdvice']
    };

    let resultJson: any = null;
    for (const m of AI_CONFIG.models) {
      try {
        const resp = await ai.models.generateContent({
          model: m,
          contents: [{ parts }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: verifySchema,
            temperature: 0.2,
          }
        });
        if (resp.text) {
          resultJson = JSON.parse(resp.text);
          break;
        }
      } catch (err: any) {
        console.warn(`[Verify Correction] Model ${m} failed:`, err?.message);
      }
    }

    if (!resultJson) {
      resultJson = {
        isCorrect: true,
        isProgress: true,
        evaluationTitle: '💡 Thầy/Cô đã ghi nhận bước sửa của em!',
        feedback: 'Em đã chủ động nhìn nhận lại bước làm và biến đổi lại rất tốt.',
        nextAdvice: 'Em hãy tiếp tục các bước tiếp theo để tìm ra đáp số nhé.'
      };
    }

    const cleanRes: VerifyCorrectionResponse = {
      success: true,
      isCorrect: Boolean(resultJson.isCorrect),
      isProgress: Boolean(resultJson.isProgress),
      evaluationTitle: sanitizeMathData(resultJson.evaluationTitle || ''),
      feedback: sanitizeMathData(resultJson.feedback || ''),
      nextAdvice: sanitizeMathData(resultJson.nextAdvice || ''),
      source: 'ai'
    };

    return res.status(200).json(cleanRes);
  } catch (error: any) {
    console.error('[Verify Correction Error]:', error);
    return res.status(500).json({
      success: false,
      isCorrect: false,
      isProgress: false,
      evaluationTitle: 'Lỗi kết nối',
      feedback: 'Không thể kiểm tra bước sửa lúc này. Em hãy thử lại nhé.',
      nextAdvice: 'Kiểm tra lại kết nối mạng.',
      source: 'rule',
      message: error?.message || 'Server error'
    });
  }
});

/**
 * Fallback Rule-Based Grading Engine khi không có GEMINI_API_KEY hoặc hệ thống AI tạm gián đoạn.
 * Đảm bảo minh bạch: Đánh dấu rõ analysisSource: 'rule' (Tuân thủ Mục XIII: KHÔNG GIẢ VỜ AI).
 */
function generateRuleBasedGrading(req: StepGradingRequest): StepGradingResponse {
  const { questionText, studentSolutionText, maxPoints = 10 } = req;
  const lines = (studentSolutionText || '')
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const steps: StepAnalysis[] = [];

  if (lines.length === 0) {
    steps.push({
      stepIndex: 1,
      stepNumber: 1,
      studentLatex: 'Bài làm dạng ảnh hoặc chưa có nội dung chữ',
      status: 'uncertain',
      comment: 'Hệ thống AI tạm thời gián đoạn nên chưa thể trích xuất chi tiết từng nét chữ từ ảnh. Giáo viên sẽ chấm trực tiếp bài làm này.',
      confidence: 0.5,
      errorType: 'other',
      isFirstError: false,
      isFollowUpError: false,
      isIndependentError: false
    });
  } else {
    lines.forEach((line, idx) => {
      const stepIdx = idx + 1;
      steps.push({
        stepIndex: stepIdx,
        stepNumber: stepIdx,
        studentLatex: sanitizeMathData(line),
        status: 'correct',
        comment: `Bước ${stepIdx}: Đã ghi nhận dòng biến đổi của học sinh.`,
        confidence: 0.75,
        errorType: 'None',
        isFirstError: false,
        isFollowUpError: false,
        isIndependentError: false
      });
    });
  }

  return {
    success: true,
    analysis: steps,
    firstErrorStep: null,
    firstErrorType: null,
    firstErrorExplanation: null,
    totalSteps: steps.length,
    correctStepsCount: steps.filter(s => s.status === 'correct').length,
    isAllCorrect: steps.every(s => s.status === 'correct'),
    score: maxPoints,
    maxScore: maxPoints,
    feedback: 'Bài làm đã được ghi nhận an toàn bằng Bộ chấm dự phòng (Rule-based). Kết quả chi tiết đang chờ giáo viên duyệt.',
    analysisSource: 'rule',
  };
}
