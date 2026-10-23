/** JSON-only result snapshots. Firestore storage accounting, plus a wire-size reserve.
 * https://firebase.google.com/docs/firestore/storage-size
 * Do not resize images, strip answers, or split a historical result to make it fit.
 */
export const FIRESTORE_DOCUMENT_LIMIT = 1_048_576;
const stringBytes = (s: string) => new TextEncoder().encode(s).length + 1;
const valueBytes = (v: unknown): number => {
  if (v === null || typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 8;
  if (typeof v === 'string') return stringBytes(v);
  if (Array.isArray(v)) return v.reduce((sum, item) => sum + valueBytes(item), 0);
  if (v && typeof v === 'object') return 32 + Object.entries(v).reduce((sum, [key, item]) => sum + stringBytes(key) + valueBytes(item), 0);
  throw new Error('Bài nộp chứa kiểu dữ liệu không hỗ trợ. Bản gốc được giữ nguyên.');
};
export function assertResultDocumentFits(collection: string, id: string, record: unknown, reserveBytes = 0): number {
  const bytes = stringBytes(collection) + stringBytes(id) + 16 + valueBytes(record);
  // Allow headroom for protocol overhead and teacher grading metadata after submission.
  if (bytes > FIRESTORE_DOCUMENT_LIMIT - reserveBytes) {
    throw new Error(`Bài nộp quá lớn để lưu an toàn trong một tài liệu Firebase (${Math.ceil(bytes / 1024)} KiB; giới hạn 1 MiB). Chưa nộp thành công. Giữ trang và ảnh gốc, liên hệ giáo viên để nhận bài; không gửi lại thành lượt mới.`);
  }
  return bytes;
}
