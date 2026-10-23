import type { Question } from '../src/types';
import { isEssayQuestion } from '../src/utils/questionUtils';

export const VERIFICATION_MODEL = 'gemini-3.8-flash';

/** Same two prompts; independent pass contains no source answers or first-pass result. */
export function buildVerificationParts(questions: Question[], grade: string, topic: string, phase: 'source' | 'independent'): any[] {
  const toRead = questions, suspects = questions;
  const describe = (q: Question, includeSource: boolean) => `[Mã: ${q.id}] (Câu ${q.order})\nLoại: ${isEssayQuestion(q) ? 'TỰ LUẬN' : q.type === 'short_answer' ? 'TRẢ LỜI NGẮN' : q.type === 'true_false' ? 'ĐÚNG/SAI' : 'TRẮC NGHIỆM'}\nĐề bài: ${q.question}\n${isEssayQuestion(q) ? '(Tự luận)' : (q.options || []).map(o => `${o.id}. ${o.text}`).join(' | ')}${includeSource ? `\n[Đáp án hiện tại]: ${q.correctAnswer || 'Chưa có'}\n[Điểm của câu]: ${q.points}\n[Lời giải hiện tại]: ${q.explanation || ''}\n[Biểu điểm nguồn]: ${q.rubric && q.rubric !== q.explanation ? q.rubric : ''}` : ''}`;
  const prompt = phase === 'source' ? `Bạn là chuyên gia thẩm định Toán THCS. Khối ${grade}, chủ đề ${topic}.
Giải độc lập từng câu trước rồi so với đáp án/lời giải/biểu điểm nguồn. Kiểm tra đủ mọi ý, điều kiện, phương án và điểm; không tự sửa dữ liệu nguồn.
Tự luận: kết luận/đáp số theo từng ý, giữ nguyên chữ hoa/thường của ký hiệu toán, không trả A/B/C/D. Nếu đáp án trống hoặc ghi "Xem lời giải chi tiết", đối chiếu lời giải/biểu điểm đầy đủ theo tương đương toán học. Không có nguồn đối chiếu thì cần giáo viên duyệt.
Trắc nghiệm: kiểm tra phương án đúng tồn tại và duy nhất, không mặc định A. Trả lời ngắn: trả kết quả số/biểu thức, giữ ký hiệu toán. Đúng/sai: kiểm tra đủ các mệnh đề, giữ định dạng đáp án nguồn. Thiếu dữ kiện, ảnh chưa rõ, lời giải mâu thuẫn hoặc bất kỳ nghi vấn nào thì needsReview=true.
Geometry Vision Guard: chỉ dùng dữ kiện đề, ký hiệu rõ hoặc chứng minh hợp lệ; không đoán vuông góc/song song/bằng nhau từ hình trông giống.
Mỗi kết quả phải có đúng questionId. Chỉ matchesCurrentAnswer=true, confidence="high", needsReview=false khi toàn bộ câu và nguồn đúng. Nhận xét ngắn; giữ đủ kết luận các ý.
${toRead.map(q => describe(q, true)).join('\n\n')}
Trả DUY NHẤT JSON Array: [{"questionId":"mã","proposedAnswer":"đáp án/kết luận","matchesCurrentAnswer":true,"confidence":"high","needsReview":false,"reason":"căn cứ ngắn"}].` : `Bạn là chuyên gia độc lập thẩm định Toán THCS, khối ${grade}. Giải từng câu dưới đây từ đề và hình nguồn, không biết kết quả lượt trước.
Giải độc lập đầy đủ các ý của câu tự luận; kết luận theo từng ý, giữ nguyên chữ hoa/thường, không trả A/B/C/D cho tự luận. Trắc nghiệm: thử ngược hoặc giải bằng cách khác, kiểm tra đáp án tồn tại và duy nhất. Trả lời ngắn: kết quả số/biểu thức. Đúng/sai: kiểm tra từng mệnh đề.
Geometry Vision Guard: chỉ dùng giả thiết, ký hiệu rõ và chứng minh; không suy ra quan hệ chỉ vì hình trông giống. Thiếu điều kiện/ảnh mờ thì confidence="needs_review".
${suspects.map(q => describe(q, false)).join('\n\n')}
Trả DUY NHẤT JSON Array, đúng questionId từng câu: [{"questionId":"mã","pass2Answer":"kết luận/đáp án","confidence":"high","reason":"cách kiểm tra ngắn"}].`;
  const parts: any[] = [{ text: prompt }];
  for (const q of questions) if (q.imageUrl) {
    const image = q.imageUrl.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/)!;
    parts.push({ text: `Hình nguồn của câu [Mã: ${q.id}]:` }, { inlineData: { mimeType: image[1], data: image[2] } });
  }
  return parts;
}
