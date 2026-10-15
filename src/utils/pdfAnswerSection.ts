/**
 * Chỉ áp dụng khi nhập PDF mới: tách trang đáp án khỏi câu hỏi.
 * Không thay đổi bất kỳ đề đã lưu nào.
 */
export interface PdfAnswerSections {
  questionText: string;
  answerText: string;
  multipleChoiceAnswers: string;
  essaySolutions: Record<number, string>;
}

export function separatePdfAnswerSections(text: string): PdfAnswerSections {
  const original = String(text || '');
  const marker = /ĐÁP\s*ÁN\s*(?:VÀ|&|[-–])\s*HƯỚNG\s*DẪN\s*GIẢI\b/i.exec(original);
  if (!marker) {
    return { questionText: original, answerText: '', multipleChoiceAnswers: '', essaySolutions: {} };
  }
  const questionText = original.slice(0, marker.index);
  const answerText = original.slice(marker.index + marker[0].length);
  const essayHeading = /PHẦN\s*(?:II|2)\s*[.\-:]?\s*TỰ\s*LUẬN/i.exec(answerText);
  const multipleChoiceAnswers = essayHeading ? answerText.slice(0, essayHeading.index) : answerText;
  const essayText = essayHeading ? answerText.slice(essayHeading.index + essayHeading[0].length) : answerText;
  const markers = [...essayText.matchAll(/(?:^|\s)Bài\s*(\d+)\s*[.:]/gi)];
  const essaySolutions: Record<number, string> = {};
  for (let i = 0; i < markers.length; i++) {
    const match = markers[i];
    const number = Number(match[1]);
    if (!Number.isSafeInteger(number) || number < 1 || number > 500) continue;
    const start = (match.index || 0) + match[0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : essayText.length;
    const solution = essayText.slice(start, end).trim();
    if (solution && !essaySolutions[number]) essaySolutions[number] = solution;
  }
  return { questionText, answerText, multipleChoiceAnswers, essaySolutions };
}
