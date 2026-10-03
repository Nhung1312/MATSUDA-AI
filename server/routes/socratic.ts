import { Router, Request, Response } from 'express';
import {
  AI_CONFIG,
  getSystemGeminiClient,
  SOCRATIC_SYSTEM_PROMPT,
  sanitizeMathData
} from '../aiConfig.js';
import { SocraticRequest, SocraticResponse } from '../types.js';

export const socraticRouter = Router();

socraticRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body: SocraticRequest = req.body;
    const { level = 'hint1', context, studentMessage, chatHistory } = body || {};

    if (!context || !context.questionText) {
      return res.status(400).json({
        success: false,
        level,
        reply: '',
        message: 'Thiếu thông tin câu hỏi trong ngữ cảnh Socratic.',
      });
    }

    let ai;
    try {
      ai = getSystemGeminiClient();
    } catch (keyErr: any) {
      return res.status(503).json({
        success: false,
        level,
        reply: '',
        message: keyErr?.message || 'Máy chủ chưa được cấu hình GEMINI_API_KEY.',
      });
    }

    // Xây dựng ngữ cảnh chi tiết cho bài toán và tiến trình học sinh
    let contextDescription = `ĐỀ BÀI TOÁN (Khối ${context.grade || 'THCS'}, Chủ đề: ${context.topic || 'Toán'}):\n${context.questionText}\n`;

    if (context.answerOptions && context.answerOptions.length > 0) {
      contextDescription += `Các phương án trắc nghiệm:\n` +
        context.answerOptions.map(opt => `  ${opt.id}. ${opt.text}`).join('\n') + '\n';
    }

    if (context.studentCurrentAnswer) {
      contextDescription += `Phương án hoặc kết quả học sinh đang chọn/điền: "${context.studentCurrentAnswer}"\n`;
    }

    if (context.studentWork && context.studentWork.trim().length > 0) {
      contextDescription += `Lời giải nháp / các bước học sinh đã tự viết được:\n"${context.studentWork}"\n`;
    }

    if (context.detectedError) {
      contextDescription += `Nhận định lỗi sai hoặc điểm cần củng cố:\n"${context.detectedError}"\n`;
    }

    if (context.currentHintLevel) {
      contextDescription += `Nấc gợi ý hiện tại của học sinh trên câu này: ${context.currentHintLevel}\n`;
    }

    if (context.firstErrorStep) {
      contextDescription += `\nĐẶC BIỆT CHÚ Ý - ĐIỂM XUẤT PHÁT GỢI Ý (FIRST ERROR):\n` +
        `- Học sinh đã làm đúng các bước trước đó.\n` +
        `- Bước sai đầu tiên là: BƯỚC ${context.firstErrorStep}.\n` +
        `${context.firstErrorLatex ? `- Biểu thức sai học sinh viết: "${context.firstErrorLatex}".\n` : ''}` +
        `${context.errorType ? `- Phân loại lỗi: "${context.errorType}".\n` : ''}` +
        `${context.referenceStepLatex ? `- Biểu thức biến đổi đúng chuẩn: "${context.referenceStepLatex}".\n` : ''}` +
        `YÊU CẦU SƯ PHẠM: Bắt đầu hỗ trợ trực tiếp từ chính BƯỚC ${context.firstErrorStep}. Khẳng định các bước trước em đã làm đúng để động viên, sau đó đặt câu hỏi gợi mở để em nhìn ra lỗi ở bước này (ví dụ: "Đến bước này em làm đúng rồi. Em hãy nhìn lại phép biến đổi... Dấu thay đổi thế nào khi chuyển vế?"). TUYỆT ĐỐI KHÔNG giải lại toàn bộ bài từ đầu.\n`;
    }

    if (Array.isArray(context.previousHints) && context.previousHints.length > 0) {
      contextDescription += `Các gợi ý Thầy/Cô đã đưa trước đó cho học sinh trên câu này:\n` +
        context.previousHints.map((h, i) => `  - [Gợi ý ${i + 1}]: ${h}`).join('\n') + '\n';
    }

    // Xây dựng user prompt theo đúng nấc Socratic đã chọn
    let userPrompt = '';
    if (level === 'hint1') {
      userPrompt = `${contextDescription}
YÊU CẦU: Hãy đưa ra GỢI Ý 1 (Nhẹ: Nhắc lại công thức / định nghĩa / định lý Toán học cần dùng và 1 câu hỏi gợi mở, TUYỆT ĐỐI CHƯA tính toán hộ số liệu).`;
    } else if (level === 'hint2') {
      userPrompt = `${contextDescription}
YÊU CẦU: Hãy đưa ra GỢI Ý 2 (Vừa: Hướng dẫn bước biến đổi mấu chốt đầu tiên và chỉ ra nút thắt tư duy, sau đó dừng lại để học sinh tự làm tiếp).`;
    } else if (level === 'hint3') {
      userPrompt = `${contextDescription}
YÊU CẦU: Hãy đưa ra GỢI Ý 3 (Sâu: Dẫn dắt chi tiết từng bước suy luận sư phạm để học sinh thông suốt phương pháp, vẫn chừa bước đáp số cuối cùng cho học sinh).`;
    } else {
      // Chat mode
      userPrompt = `${contextDescription}`;
      if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        userPrompt += `\nLịch sử trao đổi trước đó:\n` +
          chatHistory.map(m => `${m.role === 'model' ? 'Gia sư AI' : 'Học sinh'}: ${m.text}`).join('\n') + `\n`;
      }
      userPrompt += `\nCâu hỏi / phản hồi mới từ học sinh: "${studentMessage || 'Em cần thầy/cô hướng dẫn thêm cách làm bài này ạ'}"`;
    }

    let replyText = '';
    let usedModel = AI_CONFIG.defaultModel;
    let lastError: any = null;

    // Failover sequence across supported flash models
    for (const modelName of AI_CONFIG.models) {
      try {
        const resp = await ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction: SOCRATIC_SYSTEM_PROMPT,
            temperature: level === 'chat' ? AI_CONFIG.temperature.socraticChat : AI_CONFIG.temperature.socraticHint,
          },
        });
        if (resp.text && resp.text.trim()) {
          replyText = resp.text.trim();
          usedModel = modelName;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Socratic Router] Model ${modelName} thất bại, thử mô hình dự phòng:`, err?.message || err);
        // Ngủ 400ms trước khi thử model tiếp theo nếu bị rate limit
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (!replyText) {
      throw lastError || new Error('Không nhận được phản hồi từ hệ thống AI.');
    }

    // Làm sạch và chuẩn hóa công thức toán học
    replyText = sanitizeMathData(replyText);

    const responsePayload: SocraticResponse = {
      success: true,
      level,
      reply: replyText,
      modelUsed: usedModel,
      isFallback: false,
    };

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error('[Socratic Router Error]:', error);
    const errMessage = error?.message || 'Lỗi xử lý khi kết nối với Gia sư Socratic AI.';

    return res.status(500).json({
      success: false,
      level: req.body?.level || 'hint1',
      reply: '',
      message: errMessage,
      isFallback: false,
    });
  }
});
