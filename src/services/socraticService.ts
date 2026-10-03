/**
 * Client-Side Socratic Service
 * 
 * NGUYÊN TẮC:
 * 1. Gọi trực tiếp endpoint nội bộ /api/tutor/socratic của ứng dụng.
 * 2. Tuyệt đối không chứa hoặc truyền API Key ở client.
 * 3. Phân biệt rành mạch giữa REAL AI RESPONSE (isFallback: false)
 *    và LOCAL RULE-BASED FALLBACK (isFallback: true).
 */

import { SocraticContext, SocraticHintLevel, SocraticRequest, SocraticResponse } from '../types';

export class SocraticService {
  /**
   * Yêu cầu Gia sư Socratic đưa ra gợi mở tư duy (Nấc 1, 2, 3 hoặc Đàm thoại Chat)
   */
  async requestHint(params: {
    level: SocraticHintLevel;
    context: SocraticContext;
    studentMessage?: string;
    chatHistory?: Array<{ role: 'user' | 'model'; text: string }>;
  }): Promise<SocraticResponse> {
    const payload: SocraticRequest = {
      level: params.level,
      context: params.context,
      studentMessage: params.studentMessage,
      chatHistory: params.chatHistory,
    };

    try {
      const response = await fetch('/api/tutor/socratic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data: SocraticResponse = await response.json();
        if (data.success && data.reply) {
          return {
            ...data,
            isFallback: false,
          };
        }
      }

      // Xử lý lỗi trả về từ máy chủ
      const errData = await response.json().catch(() => ({}));
      const serverMessage = errData.message || `Lỗi máy chủ (${response.status})`;
      console.warn('[Socratic Service] Máy chủ AI trả về lỗi, kích hoạt chế độ sư phạm ngoại tuyến:', serverMessage);

      return this.generatePedagogicalFallback(params.level, params.context, serverMessage);
    } catch (netErr: any) {
      console.warn('[Socratic Service] Lỗi kết nối mạng đến /api/tutor/socratic:', netErr?.message || netErr);
      return this.generatePedagogicalFallback(
        params.level,
        params.context,
        'Không thể kết nối đến máy chủ AI (sự cố mạng hoặc máy chủ đang khởi động).'
      );
    }
  }

  /**
   * BỘ QUY TẮC SƯ PHẠM NGOẠI TUYẾN DỰ PHÒNG (LOCAL RULE-BASED ENGINE)
   * 
   * ĐẶC BIỆT TUÂN THỦ MỤC VII:
   * - Phân biệt rõ ràng bằng cờ isFallback: true.
   * - Hiển thị minh bạch nhãn cảnh báo chế độ ngoại tuyến, không gây hiểu nhầm rằng Gemini đã phản hồi thành công.
   */
  private generatePedagogicalFallback(
    level: SocraticHintLevel,
    context: SocraticContext,
    reason: string
  ): SocraticResponse {
    const textLower = (context.questionText + ' ' + (context.topic || '')).toLowerCase();

    let ruleContent = '';
    if (textLower.includes('phân tích đa thức') || textLower.includes('nhân tử')) {
      if (level === 'hint1') {
        ruleContent = `Nhắc lại các phương pháp phân tích đa thức thành nhân tử:\n• Đặt nhân tử chung: $A \\cdot B + A \\cdot C = A(B + C)$\n• Dùng hằng đẳng thức đáng nhớ\n• Nhóm hạng tử thích hợp\n\n👉 *Câu hỏi gợi mở:* Hãy quan sát các hạng tử xem có chung thừa số nào không, hoặc có dạng của hằng đẳng thức nào?`;
      } else if (level === 'hint2') {
        ruleContent = `Hãy thử nhóm các hạng tử có hệ số hoặc biến liên quan lại với nhau, hoặc nhận diện xem đa thức có dạng bình phương của một tổng/hiệu $(a \\pm b)^2$ hay hiệu hai bình phương $a^2 - b^2$ không nhé! Sau đó em thử đặt thừa số chung ra ngoài xem.`;
      } else {
        ruleContent = `Dẫn dắt phương pháp: Bước 1: Kiểm tra nhân tử chung. Bước 2: Thử nhóm từng cặp hạng tử. Bước 3: Đưa về dạng tích các nhân tử bậc nhất. Em hãy tự tay biến đổi bước đầu vào bảng nháp nhé!`;
      }
    } else if (textLower.includes('căn') || textLower.includes('√') || textLower.includes('can')) {
      if (level === 'hint1') {
        ruleContent = `Nhắc lại công thức căn thức bậc hai:\n• $\\sqrt{A^2} = |A|$\n• Điều kiện để $\\sqrt{A}$ có nghĩa là $A \\geq 0$\n• Trục căn thức ở mẫu: $\\frac{1}{\\sqrt{A} - \\sqrt{B}} = \\frac{\\sqrt{A} + \\sqrt{B}}{A - B}$\n\n👉 *Câu hỏi gợi mở:* Em đã kiểm tra điều kiện xác định của biểu thức dưới dấu căn chưa?`;
      } else if (level === 'hint2') {
        ruleContent = `Hãy đưa các thừa số ra ngoài dấu căn bằng quy tắc $\\sqrt{a^2 \\cdot b} = |a|\\sqrt{b}$. Sau đó quy đồng mẫu thức hoặc nhóm các căn thức đồng dạng lại với nhau nhé!`;
      } else {
        ruleContent = `Dẫn dắt biến đổi: Nhân lượng liên hợp nếu có căn ở mẫu, hoặc phân tích biểu thức dưới căn thành bình phương hoàn hảo $(a \\pm b)^2$.`;
      }
    } else if (textLower.includes('tam giác') || textLower.includes('đường tròn') || textLower.includes('hình')) {
      if (level === 'hint1') {
        ruleContent = `Nhắc lại kiến thức hình học:\n• Định lý Pytago trong tam giác vuông: $a^2 + b^2 = c^2$\n• Các trường hợp tam giác bằng nhau: (c-c-c), (c-g-c), (g-c-g)\n• Tam giác đồng dạng: góc - góc, cạnh - góc - cạnh\n\n👉 *Câu hỏi gợi mở:* Dữ kiện bài toán đã cho những yếu tố bằng nhau nào? Em có thể vẽ thêm đường phụ không?`;
      } else if (level === 'hint2') {
        ruleContent = `Hãy chỉ ra 2 tam giác chứa các cạnh hoặc góc cần chứng minh, rồi kiểm tra xem chúng có 2 góc bằng nhau hoặc các cạnh tương ứng tỉ lệ không nhé!`;
      } else {
        ruleContent = `Dẫn dắt chứng minh: Từ giả thiết suy ra các góc so le trong, đồng vị hoặc góc nội tiếp cùng chắn một cung; từ đó thiết lập cặp tam giác đồng dạng để suy ra tỉ số.`;
      }
    } else {
      if (level === 'hint1') {
        ruleContent = `Gợi ý phương pháp tiếp cận:\n• Xác định rõ đại lượng đã biết và đại lượng cần tìm trong đề bài.\n• Nhắc lại công thức hoặc tính chất toán học cơ bản nhất liên quan đến chủ đề **${context.topic || 'Toán học'}**.\n\n👉 *Câu hỏi gợi mở:* Em hãy tự hỏi: để tìm được kết quả này, ta cần biến đổi qua bước trung gian nào?`;
      } else if (level === 'hint2') {
        ruleContent = `Bước đầu tiên: Hãy chuyển các biểu thức về cùng một đơn vị hoặc cùng cơ số, thực hiện phép tính trong ngoặc trước, nhân chia trước cộng trừ sau để làm gọn bài toán nhé!`;
      } else {
        ruleContent = `Dẫn dắt phương pháp: Thiết lập mối liên hệ giữa các bước giải. Em hãy ghi thử bước biến đổi đầu tiên vào ô bảng nháp bên dưới để tiếp tục!`;
      }
    }

    if (level === 'chat') {
      ruleContent = `Thầy/Cô đã ghi nhận câu hỏi của em: "${params => params}". Em hãy kiểm tra lại công thức cơ bản và thử giải thích hướng đi hiện tại của mình để thầy cô gợi ý tiếp nhé!`;
    }

    return {
      success: true,
      level,
      reply: ruleContent,
      modelUsed: 'RuleEngineFallback',
      isFallback: true,
      message: `Chế độ Sư phạm Ngoại tuyến kích hoạt (${reason})`,
    };
  }
}

export const socraticService = new SocraticService();
