/**
 * Utility tạo đường link công khai cho học sinh làm bài thi / bài tập
 * Đảm bảo học sinh KHÔNG cần đăng nhập tài khoản Google hay mật khẩu, chỉ cần nhập Họ và Tên.
 * 
 * Lưu ý đặc thù môi trường Google AI Studio / Cloud Run:
 * - ais-dev-*.run.app: Đường dẫn phát triển nội bộ của AI Studio (yêu cầu tài khoản Google của chủ sở hữu container).
 * - ais-pre-*.run.app: Đường dẫn Shared công khai (bất kỳ học sinh nào cũng truy cập được trực tiếp mà KHÔNG bị Google chặn đăng nhập).
 */

export function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export function getPublicOrigin(): string {
  if (typeof window === 'undefined') return '';
  let origin = window.location.origin;

  // Nếu giáo viên đang xem trên môi trường dev của Google AI Studio (ais-dev-*.run.app),
  // tự động chuyển thành domain preview công khai (ais-pre-*.run.app) để học sinh mở được ngay.
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }

  return origin;
}

/**
 * Tạo link làm bài tập công khai cho học sinh (không chặn đăng nhập)
 * Định dạng: https://domain/join?code=TOAN6A1-XXXX
 */
export function getAssignmentShareLink(assignmentCode: string): string {
  const origin = getPublicOrigin();
  const cleanCode = (assignmentCode || '').trim().toUpperCase();
  return `${origin}/join?code=${encodeURIComponent(cleanCode)}`;
}

/**
 * Tạo link làm bài tập trực tiếp trên domain hiện tại
 */
export function getAssignmentDirectLink(assignmentCode: string): string {
  const origin = getCurrentOrigin();
  const cleanCode = (assignmentCode || '').trim().toUpperCase();
  return `${origin}/join?code=${encodeURIComponent(cleanCode)}`;
}

/**
 * Tạo link tham gia cuộc thi trực tuyến cho học sinh
 * Định dạng: https://domain/contest/DT8-001
 */
export function getContestShareLink(contestCode: string): string {
  const origin = getPublicOrigin();
  const cleanCode = (contestCode || '').trim().toUpperCase();
  return `${origin}/contest/${encodeURIComponent(cleanCode)}`;
}

/**
 * Tạo link cuộc thi trực tiếp trên domain hiện tại
 */
export function getContestDirectLink(contestCode: string): string {
  const origin = getCurrentOrigin();
  const cleanCode = (contestCode || '').trim().toUpperCase();
  return `${origin}/contest/${encodeURIComponent(cleanCode)}`;
}
