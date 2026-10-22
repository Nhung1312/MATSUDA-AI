/**
 * Normalize only the label duplicated during PDF/print rendering.
 * The saved exam / source question remains unchanged for marking.
 *
 * PrintExamModal renders its own "Câu N. (x điểm):" before each question.
 * Imported PDF / Word / OCR content can already begin with "Câu N:",
 * making the heading appear twice. Strip only that leading label.
 */
export function getPrintableQuestionText(source: string | null | undefined): string {
  const input = typeof source === 'string' ? source.trimStart() : '';
  return input.replace(
    /^(?:\*\*)?\s*Câu\s*(?:hỏi\s*)?\d{1,3}\s*(?:[.:)\-–]\s*)?(?:\(\s*\d+(?:[.,]\d+)?\s*điểm\s*\)\s*:?[ \t]*)?(?:\*\*)?[ \t]*/i,
    ''
  ).trimStart();
}
