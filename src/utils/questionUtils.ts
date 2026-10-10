import { Question, QuestionOption } from '../types';

/**
 * Các từ khóa và cụm từ đặc trưng của câu hỏi Tự luận / Chứng minh / Tính toán hình học & đại số THCS
 */
const ESSAY_MATH_KEYWORDS = [
  'chứng minh',
  'chứng minh rằng',
  'chứng tỏ',
  'chứng tỏ rằng',
  'cmr',
  'rút gọn',
  'rút gọn biểu thức',
  'tính giá trị',
  'tính giá trị của biểu thức',
  'giải phương trình',
  'giải hệ phương trình',
  'giải bất phương trình',
  'tìm x',
  'tìm y',
  'tìm m',
  'tìm giá trị lớn nhất',
  'tìm giá trị nhỏ nhất',
  'gtln',
  'gtnn',
  'vẽ hình',
  'vẽ đồ thị',
  'lập bảng xét dấu',
  'lập bảng biến thiên',
  'chứng minh 3 điểm thẳng hàng',
  'chứng minh tứ giác nội tiếp',
  'chứng minh tam giác đồng dạng',
  'chứng minh tam giác bằng nhau',
  'tính độ dài',
  'tính diện tích',
  'tính chu vi',
  'tính số đo góc',
  'bài toán:',
  'bài toán thực tế'
];

/**
 * Kiểm tra xem một câu hỏi có phải là CÂU HỎI TỰ LUẬN hay không
 * 
 * Logic kiểm tra chặt chẽ:
 * 1. Nếu type là 'essay', 'short_answer' hoặc category là 'tu_luan' -> Tự luận
 * 2. Nếu không có mảng options hoặc mảng options có ít hơn 2 phần tử -> Tự luận
 * 3. Nếu các đáp án A, B, C, D đều trống (hoặc chỉ là placeholder như "Phương án A", "Đáp án A") -> Tự luận
 * 4. Nếu đề bài chứa các ý tự luận (a), b), c)...) hoặc từ khóa chứng minh/rút gọn/tính toán mà không có 4 lựa chọn A, B, C, D thực tế -> Tự luận
 */
export function isEssayQuestion(q: Question | any): boolean {
  if (!q) return false;

  // 1. Kiểm tra thuộc tính type / category được chỉ định trực tiếp
  if (q.type === 'essay' || q.category === 'tu_luan') {
    return true;
  }
  if (q.type === 'short_answer' || q.type === 'multiple_choice' || q.type === 'true_false') {
    return false;
  }

  const rawQuestionText = (q.question || q.questionText || q.content || '').toLowerCase();
  const options: QuestionOption[] = Array.isArray(q.options) ? q.options : [];

  // 2. Đếm số lượng đáp án có nội dung thực tế (không rỗng và không phải nhãn mặc định)
  const validNonEmptyOptions = options.filter(opt => {
    if (!opt || typeof opt.text !== 'string') return false;
    const trimmed = opt.text.trim();
    if (!trimmed) return false;
    // Bỏ qua nếu text chỉ là placeholder tự sinh như "Phương án A", "Đáp án A", "Option A", ...
    if (/^(phương án|đáp án|lựa chọn|option)\s*[a-d]$/i.test(trimmed)) {
      return false;
    }
    return true;
  });

  // Nếu số lượng đáp án thực tế ít hơn 2 -> Chắc chắn là câu hỏi Tự luận (không thể bấm chọn trắc nghiệm)
  if (validNonEmptyOptions.length < 2) {
    return true;
  }

  // 3. Kiểm tra cấu trúc câu hỏi có chứa các ý a), b), c) hoặc 1), 2), 3) đặc trưng của tự luận
  const hasSubParts = /(?:^|\n|\s)(?:[a-d]\)|[1-4]\))\s+[^\n]+/i.test(rawQuestionText);
  
  // 4. Kiểm tra các từ khóa tự luận đặc thù môn Toán
  const hasEssayKeywords = ESSAY_MATH_KEYWORDS.some(kw => rawQuestionText.includes(kw));

  // Nếu có ý tự luận hoặc từ khóa chứng minh/rút gọn VÀ số lượng đáp án không đủ 4 phương án đầy đủ
  if ((hasSubParts || hasEssayKeywords) && validNonEmptyOptions.length < 4) {
    return true;
  }

  return false;
}

/**
 * Lấy nhãn hiển thị cho loại câu hỏi
 */
export function getQuestionTypeLabel(q: Question | any): 'Tự luận' | 'Trắc nghiệm' {
  return isEssayQuestion(q) ? 'Tự luận' : 'Trắc nghiệm';
}

/**
 * Kiểm tra xem câu hỏi có chứa cụm từ nhắc đến hình vẽ, đồ thị, sơ đồ, bảng biến thiên hay mã LaTeX hình vẽ hay không
 */
export function isQuestionMentioningImage(q: Question | any): boolean {
  return getMissingImageReason(q) !== null;
}

/**
 * Trả về chi tiết lý do câu hỏi bị phát hiện cần hình vẽ (để giải thích trực quan cho giáo viên)
 */
export function getMissingImageReason(q: Question | any): string | null {
  if (!q) return null;
  const rawText = [
    q.question || q.questionText || q.content || '',
    ...(Array.isArray(q.options) ? q.options.map((o: any) => o?.text || '') : []),
    q.explanation || ''
  ].join(' ');

  const lower = rawText.toLowerCase();

  // 1. Kiểm tra mã nguồn LaTeX / TikZ / Asymptote / pspicture
  if (/\\includegraphics/i.test(rawText)) {
    return 'Chứa lệnh chèn hình LaTeX (\\includegraphics)';
  }
  if (/(\\begin\{tikzpicture\}|tikzpicture|\\draw\b|\\pgfplots)/i.test(rawText)) {
    return 'Chứa khối vẽ hình TikZ / Pgfplots';
  }
  if (/(\\begin\{pspicture\}|\\begin\{asy\}|asymptote)/i.test(rawText)) {
    return 'Chứa mã vẽ hình LaTeX (pstricks / asymptote)';
  }

  // 2. Ký hiệu đánh dấu hình vẽ thông dụng khi copy từ Word/Tex
  if (/\[\s*(h[iì]nh\s*v[eẽ]|h[iì]nh\s*ả?nh|ảnh\s*minh\s*h[oọ]a|đ[oồ]\s*th[iị]|img)\s*\]/i.test(rawText)) {
    return 'Có ký hiệu đánh dấu [Hình vẽ / Ảnh minh họa]';
  }
  if (/\(\s*(h[iì]nh\s*v[eẽ]|xem\s*h[iì]nh|h[iì]nh\s*b[eê]n)\s*\)/i.test(rawText)) {
    return 'Có dấu chú thích hình vẽ: (Hình vẽ / Xem hình)';
  }

  // 3. Cụm từ tiếng Việt có dấu nhắc đến hình vẽ hoặc bảng biến thiên
  if (/h[iì]nh\s*(b[eê]n|v[eẽ]|d[uư][oớ]i|sau|tr[eê]n|v[aà]o|d[uư][oớ]i\s*đ[aâ]y|minh\s*h[oọ]a)/i.test(lower)) {
    return 'Đề bài có nhắc đến "hình bên / hình vẽ / hình dưới đây"';
  }
  if (/(xem|nh[uư]|trong|cho|d[uự]a\s*v[aà]o|theo|quan\s*s[aá]t|[oở]\s*h[iì]nh)\s*(h[iì]nh|b[aả]ng|đ[oồ]\s*th[iị])/i.test(lower)) {
    return 'Đề bài yêu cầu "quan sát hình / dựa vào hình / như hình"';
  }
  if (/h[iì]nh\s*(\d+|[a-d]|i|ii|iii|iv)\b/i.test(lower)) {
    return 'Đề bài có đánh số hình (Hình 1, Hình 2, Hình A...)';
  }
  if (/(đ[oồ]\s*th[iị]|bi[eể]u\s*đ[oồ]|s[oơ]\s*đ[oồ]|b[aả]ng\s*bi[eế]n\s*thi[eê]n|b[aả]ng\s*x[eé]t\s*d[aấ]u)\s*(b[eê]n|d[uư][oớ]i|sau|minh\s*h[oọ]a)?/i.test(lower)) {
    return 'Đề bài liên quan đến "đồ thị / bảng biến thiên / sơ đồ"';
  }
  if (/\b(tam\s*gi[aá]c|t[uứ]\s*gi[aá]c|h[iì]nh\s*thang|h[iì]nh\s*ch[uữ]\s*nh[aậ]t|h[iì]nh\s*vu[oô]ng|h[iì]nh\s*thoi|h[iì]nh\s*b[iì]nh\s*h[aà]nh|đ[uư][oờ]ng\s*tr[oò]n)\b.*(b[eê]n|d[uư][oớ]i|trong\s*h[iì]nh)/i.test(lower)) {
    return 'Đề hình học có cụm từ "trong hình / hình bên / hình dưới"';
  }

  // 4. Kiểm tra cụm từ không dấu (phòng khi giáo viên dán văn bản Tex không dấu)
  if (/\b(hinh\s*(ve|ben|duoi|sau|minh\s*hoa)|nhu\s*hinh|xem\s*hinh|do\s*thi|bang\s*bien\s*thien)\b/i.test(lower)) {
    return 'Đề bài chứa từ khóa hình ảnh (hinh ve, hinh ben, do thi)';
  }

  return null;
}

/**
 * Kiểm tra câu hỏi có bị thiếu hình vẽ hay không:
 * - Đề bài nhắc đến hình vẽ / đồ thị / mã TeX
 * - Chưa có imageUrl đính kèm
 * - Giáo viên chưa đánh dấu bỏ qua cảnh báo (dismissMissingImageWarning !== true)
 */
export function isQuestionMissingImage(q: Question | any): boolean {
  if (!q) return false;
  if (q.dismissMissingImageWarning) return false;
  const hasImage = Boolean(q.imageUrl && typeof q.imageUrl === 'string' && q.imageUrl.trim().length > 0);
  if (hasImage) return false;
  return isQuestionMentioningImage(q);
}

/**
 * Chuẩn hóa một câu hỏi để đảm bảo thuộc tính type đồng bộ chính xác với nội dung
 */
export function normalizeQuestion(q: Question): Question {
  const isEssay = isEssayQuestion(q);
  if (isEssay) {
    return {
      ...q,
      type: 'essay',
      options: (q.options || []).filter(o => o.text && o.text.trim().length > 0)
    };
  }
  return {
    ...q,
    type: 'multiple_choice'
  };
}

/**
 * Chuẩn hóa danh sách câu hỏi trong một đề bài
 */
export function normalizeQuestions(questions: Question[]): Question[] {
  if (!Array.isArray(questions)) return [];
  return questions.map(normalizeQuestion);
}

/**
 * Làm sạch và sửa triệt để các ký tự control characters do JSON escape làm hỏng LaTeX
 * (\x0c -> \frac, \x08 -> \begin / \boxed, \t -> \text / \times, v.v.)
 */
export function sanitizeMathString(val?: string | null): string {
  if (!val || typeof val !== 'string') return '';
  return val
    .replace(/\x0crac\{/g, '\\frac{')
    .replace(/(?:\\+f+|\f)+\\*(?:frac\{|rac\{)/g, '\\frac{')
    .replace(/\x08egin\{/g, '\\begin{')
    .replace(/\x08oxed\{/g, '\\boxed{')
    .replace(/\t(imes|ext|riangle|heta|au|o)\b/g, '\\$1')
    .replace(/\r(ight|ho)\b/g, '\\$1')
    .replace(/\n(eq)\b/g, '\\$1');
}

/**
 * Tự động nhận diện và xuống dòng cho các ý nhỏ trong câu hỏi / bài toán (a, b, c... hoặc 1, 2, 3...)
 * Hỗ trợ linh hoạt nhiều phong cách soạn đề của giáo viên:
 * - Dạng ngoặc đơn: a), b), c)... hoặc 1), 2), 3)...
 * - Dạng dấu gạch: a/, b/, c/... hoặc 1/, 2/, 3/...
 * - Dạng bao ngoặc: (a), (b), (c)... hoặc (1), (2), (3)...
 * - Dạng dấu chấm: a., b., c.... hoặc 1., 2., 3....
 * Giúp đề bài được trình bày rõ ràng, chuẩn mực sư phạm, không bị dồn tất cả các ý trên một dòng ngang.
 */
export function formatQuestionSubItems(text?: string | null): string {
  if (!text || typeof text !== 'string') return text || '';

  const cleaned = sanitizeMathString(text);

  // Tách các khối math ($$...$$, \[...\], $...$, \(...\)) trên TOÀN BỘ văn bản
  // để bảo toàn công thức toán nhiều dòng, không để newline xé nát khối LaTeX
  const mathSegments: string[] = [];
  const textWithPlaceholders = cleaned.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$|\\\(.*?\\\))/g, (match) => {
    const idx = mathSegments.length;
    mathSegments.push(match);
    return `@@MATH_${idx}@@`;
  });

  // Tách văn bản thành các dòng hiện có
  const lines = textWithPlaceholders.split(/\r?\n/);

  const formattedLines = lines.map(line => {
    // Nếu dòng quá ngắn, giữ nguyên
    if (line.trim().length < 6) return line;

    let transformed = line;

    // 1. Dạng a) b) c) d)... hoặc 1) 2) 3)...
    const hasParenSub = /(?:^|[\s;,:])((?:[a-hA-H]|[1-9])\))\s+(?=[^\s])/g;
    const parenMatches = [...transformed.matchAll(hasParenSub)];
    if (parenMatches.length >= 2 || (parenMatches.length === 1 && parenMatches[0].index !== undefined && parenMatches[0].index > 8)) {
      transformed = transformed.replace(/(?:[\s;,:]+)((?:[a-hA-H]|[1-9])\))\s+/g, '\n$1 ');
    }

    // 2. Dạng a/ b/ c/... hoặc 1/ 2/ 3/...
    const hasSlashSub = /(?:^|[\s;,:])((?:[a-hA-H]|[1-9])\/)\s+(?=[^\s])/g;
    const slashMatches = [...transformed.matchAll(hasSlashSub)];
    if (slashMatches.length >= 2 || (slashMatches.length === 1 && slashMatches[0].index !== undefined && slashMatches[0].index > 8)) {
      transformed = transformed.replace(/(?:[\s;,:]+)((?:[a-hA-H]|[1-9])\/)\s+/g, '\n$1 ');
    }

    // 3. Dạng (a) (b) (c)... hoặc (1) (2) (3)...
    const hasWrapSub = /(?:^|[\s;,:])(\((?:[a-h]|[1-9])\))\s+(?=[^\s])/g;
    const wrapMatches = [...transformed.matchAll(hasWrapSub)];
    if (wrapMatches.length >= 2 || (wrapMatches.length === 1 && wrapMatches[0].index !== undefined && wrapMatches[0].index > 8)) {
      transformed = transformed.replace(/(?:[\s;,:]+)(\((?:[a-h]|[1-9])\))\s+/g, '\n$1 ');
    }

    // 4. Dạng a. b. c.... hoặc 1. 2. 3.... (theo sau là chữ cái tiếng Việt/Anh hoặc công thức toán)
    const hasDotSub = /(?:^|[\s;,:])((?:[a-hA-H]|[1-9])\.)\s+(?=[A-Za-z0-9\$\\\+\-àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])/g;
    const dotMatches = [...transformed.matchAll(hasDotSub)];
    if (dotMatches.length >= 2 || (dotMatches.length === 1 && dotMatches[0].index !== undefined && dotMatches[0].index > 8)) {
      transformed = transformed.replace(/(?:[\s;,:]+)((?:[a-hA-H]|[1-9])\.)\s+(?=[A-Za-z0-9\$\\\+\-àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ])/g, '\n$1 ');
    }

    return transformed;
  });

  const joined = formattedLines.join('\n');

  // Khôi phục lại các khối math an toàn tuyệt đối (dùng function replacer chống ký tự đặc biệt $ trong chuỗi)
  return joined.replace(/@@MATH_(\d+)@@/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return mathSegments[idx] !== undefined ? mathSegments[idx] : '';
  });
}

/**
 * Các điểm có tối đa 4 chữ số thập phân (không dùng AI/API).
 * Phép phân phối tính trên đơn vị 1/10000 điểm để không lệch tổng vì làm tròn.
 */
export const POINT_SCALE = 10000;

export function toPointUnits(points: number): number {
  if (!Number.isFinite(points) || points < 0 || Math.abs(points * POINT_SCALE - Math.round(points * POINT_SCALE)) > 0.000001) {
    throw new Error('Điểm phải không âm và có tối đa 4 chữ số thập phân.');
  }
  return Math.round(points * POINT_SCALE);
}

export function fromPointUnits(units: number): number {
  return units / POINT_SCALE;
}

/** Chỉ chấp nhận toàn bộ chuỗi số; không nhận '0.3abc', dấu âm hay vô cực. */
export function parseDecimalPoint(input: string | number | undefined | null, defaultValue = 0): number {
  if (typeof input === 'number') {
    try { toPointUnits(input); return input; } catch { return defaultValue; }
  }
  if (input === undefined || input === null) return defaultValue;
  const cleaned = String(input).trim();
  if (!/^(?:\d+(?:[.,]\d{1,4})?|[.,]\d{1,4})$/.test(cleaned)) return defaultValue;
  const result = Number(cleaned.replace(',', '.'));
  try { toPointUnits(result); return result; } catch { return defaultValue; }
}

/** Bảo toàn chính xác tối đa 4 chữ số sau dấu thập phân khi hiển thị. */
export function formatDecimalPoint(val: number): string {
  if (!Number.isFinite(val)) return '0';
  return String(fromPointUnits(Math.round(val * POINT_SCALE)));
}

export function calculateQuestionsTotalPoints(questions: Question[]): number {
  if (!Array.isArray(questions)) return 0;
  // Dung nạp các đề cũ có điểm lưu với độ chính xác lớn hơn 4 chữ số.
  // Chỉ làm tròn tổng để hiển thị và so sánh; không sửa dữ liệu câu hỏi cũ.
  const sum = questions.reduce((acc, q) => acc + (Number.isFinite(q?.points) ? q.points : 0), 0);
  return fromPointUnits(Math.round(sum * POINT_SCALE));
}

/** Chia đều mục tiêu, phân bổ phần dư 0.0001 điểm để tổng LUÔN khớp. */
export function distributePointsEvenly(total: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('Số câu phải là số nguyên dương.');
  const units = toPointUnits(total);
  if (units < count) throw new Error('Tổng điểm quá nhỏ: mỗi câu cần ít nhất 0,0001 điểm.');
  const base = Math.floor(units / count);
  const remainder = units - base * count;
  return Array.from({ length: count }, (_, i) => fromPointUnits(base + (i >= count - remainder ? 1 : 0)));
}
